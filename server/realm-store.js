import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isCharacter } from './store.js';

export const realmTraining = [
  { id: 'trial', name: '试招', limit: 10, cost: 12, attribute: 'attack', gain: 2 },
  { id: 'stance', name: '站桩', limit: 10, cost: 12, attribute: 'defense', gain: 1 },
  { id: 'run', name: '拉练', limit: 10, cost: 12, attribute: 'health', gain: 100 },
];
export const ninthTrainingTypes = [
  { id: 'trial', name: '练武', displayTarget: 53, cost: 16, attribute: 'attack', gain: 2 },
  { id: 'stance', name: '聚气', displayTarget: 53, cost: 16, attribute: 'defense', gain: 1 },
  { id: 'run', name: '调息', displayTarget: 53, cost: 16, attribute: 'health', gain: 110 },
];
function ninthProgress(data) {
  return data.ninthTraining ?? { counts: { trial: 0, stance: 0, run: 0 }, stage: 1 };
}
function validNinthTraining(data) {
  if (data.ninthTraining === undefined) return true;
  const progress = data.ninthTraining;
  if (!data.advanced || progress === null || typeof progress !== 'object' || Array.isArray(progress)
    || Object.keys(progress).length !== 2 || ![1, 2, 3].includes(progress.stage)
    || progress.counts === null || typeof progress.counts !== 'object' || Array.isArray(progress.counts)
    || Object.keys(progress.counts).length !== 3
    || !ninthTrainingTypes.every(({ id }) => Number.isInteger(progress.counts[id]) && progress.counts[id] >= 0)) return false;
  const total = Object.values(progress.counts).reduce((sum, count) => sum + count, 0);
  return progress.stage === 1 ? total < 39 : progress.stage === 2 ? total >= 39 && total < 93 : total === 93;
}
export const breakthroughConditions = [
  { id: 'event5', label: '通关事件5', current: 1, target: 1 },
  { id: 'martial2', label: '装配2本武学', current: 2, target: 2 },
  { id: 'training30', label: '境界修炼30次', current: 30, target: 30 },
];
const breakthroughCheckpoint = 'observed-before-first-breakthrough';
const breakthroughReward = { id: 'baodian-token-reference', name: '宝典令', amount: 5 };
function validBreakthrough(data) {
  return typeof data.advanced === 'boolean' && validNinthTraining(data) && Array.isArray(data.receipts)
    && new Set(data.receipts.map((receipt) => receipt?.conditionId)).size === data.receipts.length
    && data.receipts.every((receipt) => breakthroughConditions.some(({ id }) => id === receipt?.conditionId)
      && receipt.id === 'first-breakthrough-' + receipt.conditionId
      && receipt.reward?.id === breakthroughReward.id && receipt.reward?.name === breakthroughReward.name
      && receipt.reward?.amount === breakthroughReward.amount)
    && (!data.advanced || data.receipts.length === breakthroughConditions.length);
}
export class RealmStateError extends Error {
  constructor(statusCode, errorCode) {
    super(errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
export async function createRealmStore({ file, checkpoint, character, storage }) {
  if (checkpoint !== undefined && !['observed-before-training', breakthroughCheckpoint].includes(checkpoint)) throw new Error('Unknown local realm checkpoint.');
  let saved = null;
  try {
    saved = storage ? storage.load() : JSON.parse(await readFile(file, 'utf8'));
    if (!['observed-before-training', breakthroughCheckpoint].includes(saved?.checkpoint) || !isCharacter(saved.character)
      || (saved.checkpoint === breakthroughCheckpoint && !validBreakthrough(saved))
      || !Number.isSafeInteger(saved.revision) || saved.revision < 0
      || !Number.isSafeInteger(saved.experience) || saved.experience < 0
      || !Number.isSafeInteger(saved.totalTraining) || saved.totalTraining < 0
      || !realmTraining.every(({ id, limit, attribute }) => Number.isInteger(saved.counts?.[id])
        && saved.counts[id] >= 0 && saved.counts[id] <= limit && Number.isSafeInteger(saved.attributes?.[attribute]))) {
      throw new Error('Invalid local realm save.');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  async function persist(next) {
    if (storage) { await storage.persist(next); saved = next; return; }
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, file);
      saved = next;
    } finally {
      await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  if (saved === null && checkpoint !== undefined) {
    if (character === null) throw new Error('Create a local character before starting the realm checkpoint.');
    await persist({
      checkpoint, character: { ...character }, revision: 0, experience: 120,
      ...(checkpoint === breakthroughCheckpoint
        ? { counts: { trial: 10, stance: 10, run: 10 }, attributes: { attack: 30, defense: 15, health: 2000 }, totalTraining: 30, receipts: [], advanced: false }
        : { counts: { trial: 0, stance: 0, run: 0 }, attributes: { attack: 10, defense: 5, health: 1000 }, totalTraining: 0 }),
    });
  }
  function checkBinding(character) {
    if (character === null) throw new RealmStateError(404, 'character_not_found');
    if (saved === null) throw new RealmStateError(404, 'realm_checkpoint_not_initialized');
    if (saved.character.name !== character.name || saved.character.appearanceId !== character.appearanceId) {
      throw new RealmStateError(409, 'realm_checkpoint_character_mismatch');
    }
  }
  function stateFor(character) {
    checkBinding(character);
    if (saved.checkpoint !== 'observed-before-training') throw new RealmStateError(404, 'realm_training_checkpoint_unavailable');
    return {
      kind: 'local-realm-checkpoint', checkpoint: saved.checkpoint, revision: saved.revision,
      resource: { id: 'jianghu-experience', name: '江湖阅历', amount: saved.experience },
      realm: {
        id: 'initial-reference', name: '初入江湖',
        progress: { current: Object.values(saved.counts).reduce((sum, count) => sum + count, 0), target: 30 },
        attributes: { ...saved.attributes },
      },
      training: realmTraining.map((training) => ({ ...training, count: saved.counts[training.id] })),
      task: { id: 'train10-reference', label: '累计修炼10次', current: Math.min(saved.totalTraining, 10), target: 10, completed: saved.totalTraining >= 10 },
    };
  }
  function breakthroughStateFor(character) {
    if (character === null) throw new RealmStateError(404, 'character_not_found');
    if (saved === null) throw new RealmStateError(404, 'breakthrough_checkpoint_not_initialized');
    checkBinding(character);
    if (saved.checkpoint !== breakthroughCheckpoint) throw new RealmStateError(404, 'breakthrough_checkpoint_not_initialized');
    return {
      kind: 'local-breakthrough-checkpoint', checkpoint: saved.checkpoint, revision: saved.revision,
      resource: { id: 'jianghu-experience', name: '江湖阅历', amount: saved.experience },
      realm: {
        id: saved.advanced ? 'ninth-early-reference' : 'initial-reference',
        name: saved.advanced ? '九品前期' : '初入江湖',
        attributes: { ...saved.attributes }, comprehensionGain: saved.advanced ? 150 : 100,
      },
      conditions: breakthroughConditions.map((condition) => ({ ...condition,
        claimed: saved.receipts.some((receipt) => receipt.conditionId === condition.id), reward: { ...breakthroughReward } })),
      receipts: structuredClone(saved.receipts), advanced: saved.advanced,
      ninthTraining: saved.advanced ? ninthTrainingState() : null,
      canAdvance: !saved.advanced && saved.receipts.length === breakthroughConditions.length,
    };
  }
  function ninthTrainingState() {
    const { counts, stage } = ninthProgress(saved);
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
      stage, stageName: ['第一重', '第二重', '第三重'][stage - 1], total, supported: stage < 3,
      progress: { current: stage === 1 ? total : stage === 2 ? total - 39 : 0, target: [39, 54, 66][stage - 1] },
      training: ninthTrainingTypes.map((training) => ({ ...training, count: counts[training.id] })),
    };
  }
  let queue = Promise.resolve();
  function enqueue(action) {
    if (storage) return storage.enqueue(action);
    const operation = queue.then(action);
    queue = operation.catch(() => {});
    return operation;
  }
  function breakthroughAction(conditionId, expectedRevision, getCharacter) {
    const operation = enqueue(async () => {
      const character = getCharacter();
      const state = breakthroughStateFor(character);
      if (saved.revision !== expectedRevision) throw new RealmStateError(409, 'realm_revision_conflict');
      if (conditionId !== null) {
        if (saved.receipts.some((receipt) => receipt.conditionId === conditionId)) return state;
        const receipt = { id: 'first-breakthrough-' + conditionId, conditionId, reward: { ...breakthroughReward } };
        await persist({ ...saved, revision: saved.revision + 1, receipts: [...saved.receipts, receipt] });
      } else {
        if (saved.advanced) return state;
        if (!state.canAdvance) throw new RealmStateError(409, 'breakthrough_conditions_unclaimed');
        await persist({ ...saved, revision: saved.revision + 1, advanced: true, attributes: { attack: 40, defense: 20, health: 2500 } });
      }
      return breakthroughStateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  function trainNinth(trainingId, expectedRevision, getCharacter) {
    const operation = enqueue(async () => {
      const character = getCharacter();
      const state = breakthroughStateFor(character);
      if (saved.revision !== expectedRevision) throw new RealmStateError(409, 'realm_revision_conflict');
      if (!saved.advanced) throw new RealmStateError(409, 'realm_breakthrough_required');
      if (!state.ninthTraining.supported) throw new RealmStateError(409, 'realm_training_not_observed');
      const training = ninthTrainingTypes.find(({ id }) => id === trainingId);
      if (saved.experience < training.cost) throw new RealmStateError(409, 'realm_experience_insufficient');
      const current = ninthProgress(saved);
      const counts = { ...current.counts, [trainingId]: current.counts[trainingId] + 1 };
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const attributes = { ...saved.attributes, [training.attribute]: saved.attributes[training.attribute] + training.gain };
      if (total === 39) {
        // Only this observed first-to-second stage transition is implemented.
        attributes.attack += 10; attributes.defense += 5; attributes.health += 500;
      }
      await persist({ ...saved, revision: saved.revision + 1, experience: saved.experience - training.cost,
        attributes, ninthTraining: { counts, stage: total < 39 ? 1 : total < 93 ? 2 : 3 } });
      return breakthroughStateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    get: stateFor,
    trainNinth,
    getBreakthrough: breakthroughStateFor,
    claimBreakthrough: breakthroughAction,
    advanceBreakthrough: (revision, getCharacter) => breakthroughAction(null, revision, getCharacter),
    train(trainingId, expectedRevision, getCharacter) {
      const operation = enqueue(async () => {
        const character = getCharacter();
        stateFor(character);
        if (saved.revision !== expectedRevision) throw new RealmStateError(409, 'realm_revision_conflict');
        const training = realmTraining.find((item) => item.id === trainingId);
        if (saved.counts[trainingId] >= training.limit) throw new RealmStateError(409, 'realm_training_at_limit');
        if (saved.experience < training.cost) throw new RealmStateError(409, 'realm_experience_insufficient');
        const next = {
          ...saved, revision: saved.revision + 1, experience: saved.experience - training.cost,
          counts: { ...saved.counts, [trainingId]: saved.counts[trainingId] + 1 },
          attributes: { ...saved.attributes, [training.attribute]: saved.attributes[training.attribute] + training.gain },
          totalTraining: saved.totalTraining + 1,
        };
        await persist(next);
        return stateFor(character);
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}