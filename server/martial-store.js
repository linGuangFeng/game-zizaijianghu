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
  if (checkpoint !== undefined && checkpoint !== 'observed-before-equip') {
    throw new Error('Unknown local martial checkpoint.');
  }
  let saved = null;
  try {
    saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved === null || saved.checkpoint !== 'observed-before-equip'
      || !isCharacter(saved.character) || typeof saved.equipped !== 'boolean'
      || typeof saved.taskComplete !== 'boolean') {
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
  if (saved === null && checkpoint === 'observed-before-equip') {
    if (character === null) throw new Error('Create a local character before starting the observed martial checkpoint.');
    await persist({ checkpoint, character: { ...character }, equipped: false, taskComplete: false });
  }

  function stateFor(currentCharacter) {
    if (currentCharacter === null) throw new MartialStateError(404, 'character_not_found');
    if (saved === null) throw new MartialStateError(404, 'martial_checkpoint_not_initialized');
    if (saved.character.name !== currentCharacter.name || saved.character.appearanceId !== currentCharacter.appearanceId) {
      throw new MartialStateError(409, 'martial_checkpoint_character_mismatch');
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
  return {
    get: stateFor,
    equip(getCharacter) {
      const operation = queue.then(async () => {
        const character = getCharacter();
        const state = stateFor(character);
        if (saved.equipped && saved.taskComplete) return state;
        await persist({ ...saved, equipped: true, taskComplete: true });
        return stateFor(character);
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}