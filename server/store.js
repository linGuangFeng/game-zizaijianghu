import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assetAccounts, validAssets, creditCommerce } from './assets.js';

export const appearanceOptions = Object.freeze([
  Object.freeze({ id: 'male-reference-0002', label: '男角色参考外观', evidence: 'EVD-0002' }),
  Object.freeze({ id: 'female-reference-0003', label: '女角色参考外观', evidence: 'EVD-0003' }),
]);

// This is our local transport/storage shape, not the original game's name rules.
export function isCharacter(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.name === 'string'
    && appearanceOptions.some((option) => option.id === value.appearanceId);
}

export const testProduct = {
  id: 'dangjian-three-day-reference', name: '荡剑式三天商品', price: { currency: 'CNY', minorUnits: 600 },
  day1Rewards: [
    { id: 'dangjian-skill-reference', name: '荡剑式', quantity: 1 },
    { id: 'baodian-token-reference', name: '宝典令', quantity: 40 },
    { id: 'yuanbao-reference', name: '元宝', quantity: 60 },
  ],
};
export class CommerceStateError extends Error {
  constructor(statusCode, errorCode) { super(errorCode); this.statusCode = statusCode; this.errorCode = errorCode; }
}
function validCommerce(commerce) {
  const order = commerce?.order;
  if (!isCharacter(commerce?.boundCharacter) || !Number.isSafeInteger(commerce?.revision) || commerce.revision < 1
    || typeof order?.id !== 'string' || order.id.length === 0 || order.productId !== testProduct.id
    || order.status !== 'paid' || order.paymentMode !== 'local-test' || typeof order.day1Claimed !== 'boolean'
    || typeof order.purchaseRequestId !== 'string' || order.purchaseRequestId.length < 1 || order.purchaseRequestId.length > 128
    || !Array.isArray(commerce.grants)) return false;
  if (!order.day1Claimed) return commerce.grants.length === 0;
  return commerce.grants.length === testProduct.day1Rewards.length && testProduct.day1Rewards.every((reward, index) => {
    const grant = commerce.grants[index];
    return grant?.id === order.id + ':day1:' + reward.id && grant.orderId === order.id && grant.day === 1
      && grant.reward?.id === reward.id && grant.reward.name === reward.name && grant.reward.quantity === reward.quantity;
  });
}

export async function createCharacterStore(file) {
  let saved = null;
  try {
    saved = JSON.parse(await readFile(file, 'utf8'));
    if (!isCharacter(saved) && !(saved?.schemaVersion === 1 && isCharacter(saved.character) && validCommerce(saved.commerce))
      && !(saved?.schemaVersion === 2 && isCharacter(saved.character) && isCharacter(saved.assets?.boundCharacter)
        && validAssets(saved.assets) && (saved.commerce === null || validCommerce(saved.commerce))
        && saved.domains && saved.migration && typeof saved.migration.realmDigest === 'string')) {
      throw new Error('Invalid local character save.');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  function getCharacter() {
    return saved === null ? null : { ...([1, 2].includes(saved.schemaVersion) ? saved.character : saved) };
  }
  async function persist(next) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(next) + '\n', { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, file);
      saved = next;
    } finally {
      await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  function commerceState() {
    const character = getCharacter();
    if (character === null) throw new CommerceStateError(404, 'character_not_found');
    const commerce = [1, 2].includes(saved.schemaVersion) ? saved.commerce : null;
    if (commerce && (commerce.boundCharacter.name !== character.name || commerce.boundCharacter.appearanceId !== character.appearanceId)) {
      throw new CommerceStateError(409, 'commerce_character_mismatch');
    }
    return {
      kind: 'local-test-commerce', revision: commerce?.revision ?? 0, product: structuredClone(testProduct),
      order: commerce ? structuredClone(commerce.order) : null, grants: commerce ? structuredClone(commerce.grants) : [],
      canPurchase: commerce === null, canClaimDay1: commerce !== null && !commerce.order.day1Claimed,
    };
  }
  function assetsState() {
    const character = getCharacter();
    if (!character) throw new CommerceStateError(404, 'character_not_found');
    if (saved.schemaVersion !== 2) throw new CommerceStateError(404, 'assets_not_initialized');
    if (saved.assets.boundCharacter.name !== character.name || saved.assets.boundCharacter.appearanceId !== character.appearanceId) {
      throw new CommerceStateError(409, 'assets_character_mismatch');
    }
    const accounts = assetAccounts(saved.assets.entries);
    if (saved.domains.martial && (saved.domains.martial.uppercutProgress?.materialQuantity ?? null) === null) {
      accounts.push({ id: 'uppercut-material-reference', name: '上勾拳', total: null, available: null });
    }
    return { kind: 'local-assets', revision: saved.assets.revision, accounts, entries: structuredClone(saved.assets.entries) };
  }
  let queue = Promise.resolve();
  function enqueue(action) {
    const operation = queue.then(action);
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    get: getCharacter,
    getAssets: assetsState,
    migrateAssets(realm, realmDigest, martial = null, martialDigest = null, gear = null, gearDigest = null) {
      return enqueue(async () => {
        const character = getCharacter();
        if (!character) throw new Error('Character required for explicit migration.');
        if (saved.schemaVersion === 2) {
          assetsState();
          if ((!martial && !gear || realm) && saved.migration.realmDigest !== realmDigest) throw new Error('Migration source differs from committed migration.');
          let assets = saved.assets;
          const domains = { ...saved.domains };
          const migration = { ...saved.migration };
          let changed = false;
          for (const [name, source, digest] of [['martial', martial, martialDigest], ['gear', gear, gearDigest]]) {
            if (!source) continue;
            if (domains[name]) {
              if (migration[name + 'Digest'] !== digest) throw new Error(name === 'martial' ? 'Martial migration source differs from committed migration.' : 'Gear migration source differs from committed migration.');
              continue;
            }
            if (source.character.name !== character.name || source.character.appearanceId !== character.appearanceId) throw new Error(name + ' migration character mismatch.');
            if (name === 'martial') {
              const quantity = source.uppercutProgress?.materialQuantity ?? null;
              if (quantity !== null) assets = { ...assets, revision: assets.revision + 1, entries: [...assets.entries,
                { id: 'martial-import:' + digest, assetId: 'uppercut-material-reference', delta: quantity, source: 'martial-import' }] };
            }
            domains[name] = structuredClone(source);
            migration[name + 'Digest'] = digest;
            changed = true;
          }
          if (changed) await persist({ ...saved, assets, domains, migration });
          return assetsState();
        }
        commerceState();
        if (realm && (realm.character.name !== character.name || realm.character.appearanceId !== character.appearanceId)) throw new Error('Realm migration character mismatch.');
        let assets = { boundCharacter: { ...character }, revision: 0, entries: realm ? [{ id: 'realm-import:' + realmDigest, assetId: 'jianghu-experience', delta: realm.experience, source: 'realm-import' }] : [] };
        assets = creditCommerce(assets, saved.commerce?.grants ?? []);
        if (martial && (martial.character.name !== character.name || martial.character.appearanceId !== character.appearanceId)) throw new Error('Martial migration character mismatch.');
        if (gear && (gear.character.name !== character.name || gear.character.appearanceId !== character.appearanceId)) throw new Error('Gear migration character mismatch.');
        const quantity = martial?.uppercutProgress?.materialQuantity ?? null;
        if (quantity !== null) assets = { ...assets, revision: assets.revision + 1, entries: [...assets.entries,
          { id: 'martial-import:' + martialDigest, assetId: 'uppercut-material-reference', delta: quantity, source: 'martial-import' }] };
        await persist({ schemaVersion: 2, character, commerce: saved.commerce ?? null, assets,
          domains: { ...(realm ? { realm: structuredClone(realm) } : {}), ...(martial ? { martial: structuredClone(martial) } : {}), ...(gear ? { gear: structuredClone(gear) } : {}) }, migration: { realmDigest, ...(martial ? { martialDigest } : {}), ...(gear ? { gearDigest } : {}) } });
        return assetsState();
      });
    },
    gearStorage() {
      if (saved?.schemaVersion !== 2 || !saved.domains.gear) return undefined;
      return {
        load: () => structuredClone(saved.domains.gear), enqueue,
        persist: async (gear) => {
          assetsState();
          await persist({ ...saved, domains: { ...saved.domains, gear: structuredClone(gear) } });
        },
      };
    },
    martialStorage() {
      if (saved?.schemaVersion !== 2 || !saved.domains.martial) return undefined;
      function checkMaterial(assets, martial) {
        const quantity = martial.uppercutProgress?.materialQuantity ?? null;
        const account = assetAccounts(assets.entries).find((a) => a.id === 'uppercut-material-reference');
        if (quantity === null ? account !== undefined : account?.available !== quantity) throw new Error('Martial asset invariant failed.');
      }
      return {
        load: () => { checkMaterial(saved.assets, saved.domains.martial); return structuredClone(saved.domains.martial); }, enqueue,
        persist: async (martial) => {
          assetsState();
          const before = saved.domains.martial.uppercutProgress?.materialQuantity ?? null;
          const after = martial.uppercutProgress?.materialQuantity ?? null;
          let assets = saved.assets;
          if (before !== after) {
            if (before === null || after === null || after !== before - 1) throw new Error('Unobserved martial material transition.');
            assets = { ...assets, revision: assets.revision + 1, entries: [...assets.entries,
              { id: 'martial-upgrade:' + martial.revision, assetId: 'uppercut-material-reference', delta: -1, source: 'martial-upgrade' }] };
          }
          checkMaterial(assets, martial);
          if (!validAssets(assets)) throw new Error('Invalid martial asset transaction.');
          await persist({ ...saved, assets, domains: { ...saved.domains, martial: structuredClone(martial) } });
        },
      };
    },
    realmStorage() {
      if (saved?.schemaVersion !== 2 || !saved.domains.realm) return undefined;
      return {
        load: () => {
          if (assetAccounts(saved.assets.entries).find((a) => a.id === 'jianghu-experience')?.available !== saved.domains.realm.experience) throw new Error('Realm asset invariant failed.');
          return structuredClone(saved.domains.realm);
        }, enqueue,
        persist: async (realm) => {
          assetsState();
          const previous = saved.domains.realm;
          const delta = realm.experience - previous.experience;
          let assets = saved.assets;
          if (delta !== 0) {
            assets = { ...assets, revision: assets.revision + 1, entries: [...assets.entries,
              { id: 'realm-training:' + realm.revision, assetId: 'jianghu-experience', delta, source: 'realm-training' }] };
          }
          // Only receipts created in this transaction earn a new ledger entry.
          // Imported or historical receipts are intentionally not backfilled.
          const rewards = (realm.receipts ?? []).filter((receipt) => !(previous.receipts ?? []).some((old) => old.id === receipt.id))
            .map((receipt) => ({ id: 'realm-reward:' + receipt.id, assetId: receipt.reward.id, delta: receipt.reward.amount, source: 'first-breakthrough-claim' }));
          if (rewards.length) assets = { ...assets, revision: assets.revision + 1, entries: [...assets.entries, ...rewards] };
          if (!validAssets(assets) || assetAccounts(assets.entries).find((a) => a.id === 'jianghu-experience')?.available !== realm.experience) throw new Error('Realm asset invariant failed.');
          await persist({ ...saved, assets, domains: { ...saved.domains, realm: structuredClone(realm) } });
        },
      };
    },
    getCommerce: commerceState,
    save(next) {
      return enqueue(async () => {
        await persist([1, 2].includes(saved?.schemaVersion) ? { ...saved, character: { ...next } } : { ...next });
        return getCharacter();
      });
    },
    purchase(requestId) {
      return enqueue(async () => {
        const state = commerceState();
        if (state.order !== null) return state;
        const character = getCharacter();
        const order = { id: randomUUID(), productId: testProduct.id, status: 'paid', paymentMode: 'local-test', purchaseRequestId: requestId, day1Claimed: false };
        if (saved.schemaVersion === 2) assetsState();
        await persist({ ...(saved.schemaVersion === 2 ? saved : { schemaVersion: 1, character }), commerce: { boundCharacter: { ...character }, revision: 1, order, grants: [] } });
        return commerceState();
      });
    },
    claimDay1(orderId, expectedRevision) {
      return enqueue(async () => {
        const state = commerceState();
        if (state.order === null) throw new CommerceStateError(409, 'commerce_order_required');
        if (state.order.id !== orderId) throw new CommerceStateError(409, 'commerce_order_mismatch');
        if (state.revision !== expectedRevision) throw new CommerceStateError(409, 'commerce_revision_conflict');
        if (state.order.day1Claimed) return state;
        const grants = testProduct.day1Rewards.map((reward) => ({ id: orderId + ':day1:' + reward.id, orderId, day: 1, reward: { ...reward } }));
        if (saved.schemaVersion === 2) assetsState();
        await persist({ ...saved, ...(saved.schemaVersion === 2 ? { assets: creditCommerce(saved.assets, grants) } : {}), commerce: { ...saved.commerce, revision: state.revision + 1,
          order: { ...saved.commerce.order, day1Claimed: true }, grants } });
        return commerceState();
      });
    },
  };
}
