import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isCharacter } from './store.js';

export class MartialStateError extends Error {
  constructor(statusCode, errorCode) {
    super(errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export async function createMartialStore({ file, checkpoint, character }) {
  const checkpoints = ['observed-before-equip', 'observed-event1-before-equip'];
  if (checkpoint !== undefined && !checkpoints.includes(checkpoint)) {
    throw new Error('Unknown local martial checkpoint.');
  }
  let saved = null;
  try {
    saved = JSON.parse(await readFile(file, 'utf8'));
    const validState = saved?.checkpoint === 'observed-before-equip'
      ? typeof saved.equipped === 'boolean' && typeof saved.taskComplete === 'boolean'
      : saved?.checkpoint === 'observed-event1-before-equip' && typeof saved.twoEquipped === 'boolean';
    if (!validState || !isCharacter(saved.character)) {
      throw new Error('Invalid local martial save.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

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

  // Opt-in initialization happens only at startup, never in a GET request.
  if (saved === null && checkpoint !== undefined) {
    if (character === null) throw new Error('Create a local character before starting the observed martial checkpoint.');
    const initial = checkpoint === 'observed-event1-before-equip'
      ? { twoEquipped: false } : { equipped: false, taskComplete: false };
    await persist({ checkpoint, character: { ...character }, ...initial });
  }

  function stateFor(currentCharacter) {
    if (currentCharacter === null) throw new MartialStateError(404, 'character_not_found');
    if (saved === null) throw new MartialStateError(404, 'martial_checkpoint_not_initialized');
    if (saved.character.name !== currentCharacter.name || saved.character.appearanceId !== currentCharacter.appearanceId) {
      throw new MartialStateError(409, 'martial_checkpoint_character_mismatch');
    }
    if (saved.checkpoint === 'observed-event1-before-equip') {
      const ownedIds = saved.twoEquipped
        ? ['ruwu-sword-reference', 'uppercut-reference']
        : ['uppercut-reference', 'ruwu-sword-reference'];
      const assigned = saved.twoEquipped ? ownedIds : ['uppercut-reference'];
      return {
        kind: 'local-martial-checkpoint',
        checkpoint: saved.checkpoint,
        owned: ownedIds.map((id) => ({ id, level: 1 })),
        slots: [1, 2, 3, 4, 5, 6].map((position) => ({
          position, skillId: assigned[position - 1] ?? null, locked: position >= 4,
        })),
        task: { id: 'event1-reference', label: '通关江湖事件1', current: 1, target: 1 },
      };
    }
    return {
      kind: 'local-martial-checkpoint',
      checkpoint: saved.checkpoint,
      owned: [{ id: 'uppercut-reference', level: 1 }],
      slots: [1, 2, 3, 4, 5, 6].map((position) => ({
        position, skillId: position === 1 && saved.equipped ? 'uppercut-reference' : null, locked: position >= 4,
      })),
      task: { id: 'equip-martial-reference', label: '装配武学', current: saved.taskComplete ? 1 : 0, target: 1 },
    };
  }
  let queue = Promise.resolve();
  function setEquipped(equipped, getCharacter) {
    const operation = queue.then(async () => {
      const character = getCharacter();
      const state = stateFor(character);
      if (saved.checkpoint === 'observed-event1-before-equip') {
        if (!equipped) throw new MartialStateError(409, 'martial_action_not_observed');
        if (saved.twoEquipped) return state;
        await persist({ ...saved, twoEquipped: true });
        return stateFor(character);
      }
      const taskComplete = saved.taskComplete || equipped;
      if (saved.equipped === equipped && saved.taskComplete === taskComplete) return state;
      await persist({ ...saved, equipped, taskComplete });
      return stateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    get: stateFor,
    equip: (getCharacter) => setEquipped(true, getCharacter),
    unequip: (getCharacter) => setEquipped(false, getCharacter),
  };
}