import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isCharacter } from './store.js';

const gold = 'bloodwar-blade-gold';
export const gearItems = [
  { id: 'bloodwar-blade-purple', name: '血战刀', tier: 1, quality: '紫色', power: 1679,
    attributes: { attack: 60, defense: 30, health: 2980, criticalResistance: 5 } },
  { id: gold, name: '血战刀', tier: 1, quality: '金色', power: 2793,
    attributes: { attack: 96, defense: 48, health: 4760, criticalResistance: 5 } },
];
export class GearStateError extends Error {
  constructor(statusCode, errorCode) {
    super(errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
export async function createGearStore({ file, checkpoint, character }) {
  if (checkpoint !== undefined && checkpoint !== 'observed-event5-blade') throw new Error('Unknown local gear checkpoint.');
  let saved = null;
  try {
    saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved?.checkpoint !== 'observed-event5-blade' || !isCharacter(saved.character)
      || !Number.isSafeInteger(saved.revision) || saved.revision < 0
      || !gearItems.some((item) => item.id === saved.equippedId)) throw new Error('Invalid local gear save.');
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
    if (character === null) throw new Error('Create a local character before starting the gear checkpoint.');
    await persist({ checkpoint, character: { ...character }, revision: 0, equippedId: gold });
  }
  function stateFor(character) {
    if (character === null) throw new GearStateError(404, 'character_not_found');
    if (saved === null) throw new GearStateError(404, 'gear_checkpoint_not_initialized');
    if (saved.character.name !== character.name || saved.character.appearanceId !== character.appearanceId) {
      throw new GearStateError(409, 'gear_checkpoint_character_mismatch');
    }
    // Observed equipment-page totals hold other gear fixed; this is not a stat formula.
    const equipmentAttributes = saved.equippedId === gold
      ? { attack: 636, defense: 318, healthText: '3.15万', criticalResistance: 50 }
      : { attack: 600, defense: 300, healthText: '2.98万', criticalResistance: 50 };
    return {
      kind: 'local-gear-checkpoint', checkpoint: saved.checkpoint, revision: saved.revision,
      equippedId: saved.equippedId, owned: structuredClone(gearItems), equipmentAttributes,
    };
  }
  let queue = Promise.resolve();
  function equip(itemId, expectedRevision, getCharacter) {
    const operation = queue.then(async () => {
      const character = getCharacter();
      const state = stateFor(character);
      if (saved.revision !== expectedRevision) throw new GearStateError(409, 'gear_revision_conflict');
      if (saved.equippedId === itemId) return state;
      await persist({ ...saved, equippedId: itemId, revision: saved.revision + 1 });
      return stateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { get: stateFor, equip, autoEquip: (revision, getCharacter) => equip(gold, revision, getCharacter) };
}
