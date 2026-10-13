import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

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
    if (!isCharacter(saved) && !(saved?.schemaVersion === 1 && isCharacter(saved.character) && validCommerce(saved.commerce))) {
      throw new Error('Invalid local character save.');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  function getCharacter() {
    return saved === null ? null : { ...(saved.schemaVersion === 1 ? saved.character : saved) };
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
    const commerce = saved.schemaVersion === 1 ? saved.commerce : null;
    if (commerce && (commerce.boundCharacter.name !== character.name || commerce.boundCharacter.appearanceId !== character.appearanceId)) {
      throw new CommerceStateError(409, 'commerce_character_mismatch');
    }
    return {
      kind: 'local-test-commerce', revision: commerce?.revision ?? 0, product: structuredClone(testProduct),
      order: commerce ? structuredClone(commerce.order) : null, grants: commerce ? structuredClone(commerce.grants) : [],
      canPurchase: commerce === null, canClaimDay1: commerce !== null && !commerce.order.day1Claimed,
    };
  }
  let queue = Promise.resolve();
  function enqueue(action) {
    const operation = queue.then(action);
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    get: getCharacter,
    getCommerce: commerceState,
    save(next) {
      return enqueue(async () => {
        await persist(saved?.schemaVersion === 1 ? { ...saved, character: { ...next } } : { ...next });
        return getCharacter();
      });
    },
    purchase(requestId) {
      return enqueue(async () => {
        const state = commerceState();
        if (state.order !== null) return state;
        const character = getCharacter();
        const order = { id: randomUUID(), productId: testProduct.id, status: 'paid', paymentMode: 'local-test', purchaseRequestId: requestId, day1Claimed: false };
        await persist({ schemaVersion: 1, character, commerce: { boundCharacter: { ...character }, revision: 1, order, grants: [] } });
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
        await persist({ ...saved, commerce: { ...saved.commerce, revision: state.revision + 1,
          order: { ...saved.commerce.order, day1Claimed: true }, grants } });
        return commerceState();
      });
    },
  };
}
