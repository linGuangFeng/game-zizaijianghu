import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isCharacter } from './store.js';

export const realmTraining = [
  { id: 'trial', name: '试招', limit: 10, cost: 12, attribute: 'attack', gain: 2 },
  { id: 'stance', name: '站桩', limit: 10, cost: 12, attribute: 'defense', gain: 1 },
  { id: 'run', name: '拉练', limit: 10, cost: 12, attribute: 'health', gain: 100 },
];
export class RealmStateError extends Error {
  constructor(statusCode, errorCode) {
    super(errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
export async function createRealmStore({ file, checkpoint, character }) {
  if (checkpoint !== undefined && checkpoint !== 'observed-before-training') throw new Error('Unknown local realm checkpoint.');
  let saved = null;
  try {
    saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved?.checkpoint !== 'observed-before-training' || !isCharacter(saved.character)
      || !Number.isSafeInteger(saved.revision) || saved.revision < 0
      || !Number.isSafeInteger(saved.experience) || saved.experience < 0
      || !Number.isSafeInteger(saved.totalTraining) || saved.totalTraining < 0
      || !realmTraining.every(({ id, limit, attribute }) => Number.isInteger(saved.counts?.[id])
        && saved.counts[id] >= 0 && saved.counts[id] <= limit && Number.isSafeInteger(saved.attributes?.[attribute]))) {
      throw new Error('Invalid local realm save.');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  async function persist(next) {
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
      counts: { trial: 0, stance: 0, run: 0 }, attributes: { attack: 10, defense: 5, health: 1000 }, totalTraining: 0,
    });
  }
  function stateFor(character) {
    if (character === null) throw new RealmStateError(404, 'character_not_found');
    if (saved === null) throw new RealmStateError(404, 'realm_checkpoint_not_initialized');
    if (saved.character.name !== character.name || saved.character.appearanceId !== character.appearanceId) {
      throw new RealmStateError(409, 'realm_checkpoint_character_mismatch');
    }
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
  let queue = Promise.resolve();
  return {
    get: stateFor,
    train(trainingId, expectedRevision, getCharacter) {
      const operation = queue.then(async () => {
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