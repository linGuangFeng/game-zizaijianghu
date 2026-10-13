import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isCharacter } from './store.js';

const uppercut = 'uppercut-reference';
const sword = 'ruwu-sword-reference';
const blue = 'blue-sword-reference';
function validThreeSave(data) {
  return data.twoSlots === undefined && data.twoEquipped === undefined && data.ownedOrder === undefined
    && Array.isArray(data.threeSlots) && data.threeSlots.length === 3
    && data.threeSlots[0] === blue && [sword, null].includes(data.threeSlots[1]) && data.threeSlots[2] === uppercut;
}
function observedLoadout(data) {
  if (data.threeSlots !== undefined) return { slots: data.threeSlots,
    ownedOrder: data.threeSlots[1] === null ? [blue, uppercut, sword] : [blue, sword, uppercut] };
  return twoSkillState(data);
}
function validGrowth(data) {
  if (data.revision !== undefined && (!Number.isSafeInteger(data.revision) || data.revision < 0)) return false;
  const progress = data.uppercutProgress;
  return progress === undefined || (progress !== null && typeof progress === 'object' && !Array.isArray(progress)
    && Object.keys(progress).every((key) => ['level', 'materialQuantity'].includes(key))
    && [1, 2].includes(progress.level)
    && (progress.materialQuantity === undefined || progress.materialQuantity === null
      || (Number.isSafeInteger(progress.materialQuantity) && progress.materialQuantity >= 0)));
}
function growthFor(data) {
  const level = data.uppercutProgress?.level ?? 1;
  return { uppercut: {
    skillId: uppercut, level,
    attributes: level === 1 ? { attack: 20, defense: 10, health: 1000 } : { attack: 40, defense: 20, health: 2000 },
    material: { id: 'uppercut-material-reference', name: '上勾拳', quantity: data.uppercutProgress?.materialQuantity ?? null },
    upgrade: { targetLevel: 2, cost: 1, supported: level === 1 },
  } };
}
function twoSkillState(data) {
  return data.twoSlots !== undefined
    ? { slots: data.twoSlots, ownedOrder: data.ownedOrder }
    : data.twoEquipped
      ? { slots: [sword, uppercut], ownedOrder: [sword, uppercut] }
      : { slots: [uppercut, null], ownedOrder: [uppercut, sword] };
}
function validTwoSave(data) {
  if (data.twoSlots === undefined) return typeof data.twoEquipped === 'boolean' && data.ownedOrder === undefined;
  const knownStates = [
    { slots: [uppercut, null], ownedOrder: [uppercut, sword] },
    { slots: [sword, uppercut], ownedOrder: [sword, uppercut] },
    { slots: [uppercut, sword], ownedOrder: [uppercut, sword] },
    { slots: [null, sword], ownedOrder: [sword, uppercut] },
    { slots: [null, uppercut], ownedOrder: [uppercut, sword] },
    { slots: [sword, null], ownedOrder: [sword, uppercut] },
    { slots: [null, null], ownedOrder: [sword, uppercut] },
  ];
  return knownStates.some((state) => JSON.stringify(state) === JSON.stringify(twoSkillState(data)));
}
export class MartialStateError extends Error {
  constructor(statusCode, errorCode) {
    super(errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export async function createMartialStore({ file, checkpoint, character, storage }) {
  const checkpoints = ['observed-before-equip', 'observed-event1-before-equip'];
  if (checkpoint !== undefined && !checkpoints.includes(checkpoint)) {
    throw new Error('Unknown local martial checkpoint.');
  }
  let saved = null;
  try {
    saved = storage ? storage.load() : JSON.parse(await readFile(file, 'utf8'));
    const validState = saved?.checkpoint === 'observed-before-equip'
      ? saved.threeSlots === undefined && typeof saved.equipped === 'boolean' && typeof saved.taskComplete === 'boolean'
      : saved?.checkpoint === 'observed-event1-before-equip' && (saved.threeSlots !== undefined ? validThreeSave(saved) : validTwoSave(saved));
    if (!validState || !isCharacter(saved.character) || !validGrowth(saved)) {
      throw new Error('Invalid local martial save.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

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

  // Opt-in initialization happens only at startup, never in a GET request.
  if (saved === null && checkpoint !== undefined) {
    if (character === null) throw new Error('Create a local character before starting the observed martial checkpoint.');
    const initial = checkpoint === 'observed-event1-before-equip'
      ? { twoSlots: [uppercut, null], ownedOrder: [uppercut, sword] } : { equipped: false, taskComplete: false };
    await persist({ checkpoint, character: { ...character }, ...initial });
  }

  function stateFor(currentCharacter) {
    if (currentCharacter === null) throw new MartialStateError(404, 'character_not_found');
    if (saved === null) throw new MartialStateError(404, 'martial_checkpoint_not_initialized');
    if (saved.character.name !== currentCharacter.name || saved.character.appearanceId !== currentCharacter.appearanceId) {
      throw new MartialStateError(409, 'martial_checkpoint_character_mismatch');
    }
    if (saved.checkpoint === 'observed-event1-before-equip') {
      const { slots: assigned, ownedOrder: ownedIds } = observedLoadout(saved);
      return {
        kind: 'local-martial-checkpoint',
        checkpoint: saved.checkpoint,
        ...(saved.threeSlots !== undefined ? { loadoutMode: 'observed-three-reference', actions: { unequipPositions: [2], equipSkillIds: [sword] } } : {}),
        revision: saved.revision ?? 0, growth: growthFor(saved),
        owned: ownedIds.map((id) => ({ id, level: id === uppercut ? (saved.uppercutProgress?.level ?? 1) : 1 })),
        slots: [1, 2, 3, 4, 5, 6].map((position) => ({
          position, skillId: assigned[position - 1] ?? null, locked: position >= 4,
        })),
        task: { id: 'event1-reference', label: '通关江湖事件1', current: 1, target: 1 },
      };
    }
    return {
      kind: 'local-martial-checkpoint',
      checkpoint: saved.checkpoint,
      revision: saved.revision ?? 0, growth: growthFor(saved),
      owned: [{ id: 'uppercut-reference', level: saved.uppercutProgress?.level ?? 1 }],
      slots: [1, 2, 3, 4, 5, 6].map((position) => ({
        position, skillId: position === 1 && saved.equipped ? 'uppercut-reference' : null, locked: position >= 4,
      })),
      task: { id: 'equip-martial-reference', label: '装配武学', current: saved.taskComplete ? 1 : 0, target: 1 },
    };
  }
  async function persistMiddle(skillId) {
    await persist({ ...saved, threeSlots: [blue, skillId, uppercut], revision: (saved.revision ?? 0) + 1 });
  }
  async function persistTwo(twoSlots, ownedOrder) {
    const { twoEquipped, ...retained } = saved;
    await persist({ ...retained, twoSlots, ownedOrder, revision: (saved.revision ?? 0) + 1 });
  }
  let queue = Promise.resolve();
  function enqueue(action) {
    if (storage) return storage.enqueue(action);
    const operation = queue.then(action);
    queue = operation.catch(() => {});
    return operation;
  }
  function setEquipped(equipped, getCharacter) {
    const operation = enqueue(async () => {
      const character = getCharacter();
      const state = stateFor(character);
      if (saved.checkpoint === 'observed-event1-before-equip') {
        if (!equipped) throw new MartialStateError(409, 'martial_action_not_observed');
        if (saved.threeSlots !== undefined) {
          if (saved.threeSlots[1] === sword) return state;
          await persistMiddle(sword); return stateFor(character);
        }
        const current = twoSkillState(saved);
        if (current.slots[0] === sword && current.slots[1] === uppercut) return state;
        await persistTwo([sword, uppercut], [sword, uppercut]);
        return stateFor(character);
      }
      const taskComplete = saved.taskComplete || equipped;
      if (saved.equipped === equipped && saved.taskComplete === taskComplete) return state;
      await persist({ ...saved, equipped, taskComplete, revision: (saved.revision ?? 0) + 1 });
      return stateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  function unequipSlot(position, getCharacter) {
    const operation = enqueue(async () => {
      const character = getCharacter();
      const state = stateFor(character);
      if (saved.checkpoint !== 'observed-event1-before-equip') {
        throw new MartialStateError(409, 'martial_action_not_observed');
      }
      if (saved.threeSlots !== undefined) {
        if (position !== 2) throw new MartialStateError(409, 'martial_action_not_observed');
        if (saved.threeSlots[1] === null) return state;
        await persistMiddle(null); return stateFor(character);
      }
      const current = twoSkillState(saved);
      if (current.slots[position - 1] === null) return state;
      const slots = [...current.slots];
      slots[position - 1] = null;
      const ownedOrder = slots.includes(uppercut) ? [uppercut, sword] : [sword, uppercut];
      await persistTwo(slots, ownedOrder);
      return stateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  function equipSkill(skillId, getCharacter) {
    const operation = enqueue(async () => {
      const character = getCharacter();
      const state = stateFor(character);
      if (saved.checkpoint !== 'observed-event1-before-equip') {
        throw new MartialStateError(409, 'martial_action_not_observed');
      }
      if (saved.threeSlots !== undefined) {
        if (skillId !== sword) throw new MartialStateError(409, 'martial_action_not_observed');
        if (saved.threeSlots[1] === sword) return state;
        await persistMiddle(sword); return stateFor(character);
      }
      const current = twoSkillState(saved);
      if (current.slots.includes(skillId)) return state;
      const slots = [...current.slots];
      slots[slots.indexOf(null)] = skillId;
      const equippedIds = slots.filter((id) => id !== null);
      const ownedOrder = [...equippedIds, ...[sword, uppercut].filter((id) => !equippedIds.includes(id))];
      await persistTwo(slots, ownedOrder);
      return stateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  function upgrade(expectedRevision, getCharacter) {
    const operation = enqueue(async () => {
      const character = getCharacter();
      const state = stateFor(character);
      if (state.revision !== expectedRevision) throw new MartialStateError(409, 'martial_revision_conflict');
      const progress = state.growth.uppercut;
      if (progress.level !== 1) throw new MartialStateError(409, 'martial_upgrade_not_observed');
      if (progress.material.quantity === null) throw new MartialStateError(409, 'martial_material_unknown');
      if (progress.material.quantity < 1) throw new MartialStateError(409, 'martial_material_insufficient');
      await persist({ ...saved, revision: state.revision + 1,
        uppercutProgress: { level: 2, materialQuantity: progress.material.quantity - 1 } });
      return stateFor(character);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    get: stateFor,
    upgrade,
    unequipSlot,
    equipSkill,
    equip: (getCharacter) => setEquipped(true, getCharacter),
    unequip: (getCharacter) => setEquipped(false, getCharacter),
  };
}