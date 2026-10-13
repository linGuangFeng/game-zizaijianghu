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
    return { kind: 'local-assets', revision: saved.assets.revision, accounts: assetAccounts(saved.assets.entries), entries: structuredClone(saved.assets.entries) };
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
    migrateAssets(realm, realmDigest) {
      return enqueue(async () => {
        const character = getCharacter();
        if (!character) throw new Error('Character required for explicit migration.');
        if (saved.schemaVersion === 2) {
          assetsState();
          if (saved.migration.realmDigest !== realmDigest) throw new Error('Migration source differs from committed migration.');
          return assetsState();
        }
        commerceState();
        if (realm && (realm.character.name !== character.name || realm.character.appearanceId !== character.appearanceId)) throw new Error('Realm migration character mismatch.');
        let assets = { boundCharacter: { ...character }, revision: 0, entries: realm ? [{ id: 'realm-import:' + realmDigest, assetId: 'jianghu-experience', delta: realm.experience, source: 'realm-import' }] : [] };
        assets = creditCommerce(assets, saved.commerce?.grants ?? []);
        await persist({ schemaVersion: 2, character, commerce: saved.commerce ?? null, assets,
          domains: realm ? { realm: structuredClone(realm) } : {}, migration: { realmDigest } });
        return assetsState();
      });
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
