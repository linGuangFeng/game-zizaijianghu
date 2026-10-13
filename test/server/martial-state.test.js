import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';

const character = { name: '检查点本地角色', appearanceId: 'male-reference-0002' };
const checkpoint = 'observed-before-equip';
async function fixture(t, withCharacter = true) {
  const directory = await mkdtemp(join(tmpdir(), 'martial-equip-test-'));
  const saveFile = join(directory, 'character.json');
  const martialSaveFile = `${saveFile}.martial.json`;
  const clientDirectory = join(directory, 'client');
  await mkdir(clientDirectory);
  if (withCharacter) await writeFile(saveFile, JSON.stringify(character));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, saveFile, martialSaveFile, clientDirectory };
}
async function start(t, options) {
  const server = await createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const getState = async (base) => (await fetch(`${base}/api/martial-state`)).json();
const equip = (base) => fetch(`${base}/api/martial-state/auto-equip`, { method: 'POST' });

test('ordinary existing characters do not acquire a checkpoint or skill from GET or POST', async (t) => {
  const options = await fixture(t);
  const before = await readFile(options.saveFile, 'utf8');
  const base = await start(t, options);
  for (const response of [await fetch(`${base}/api/martial-state`), await equip(base)]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'martial_checkpoint_not_initialized' });
  }
  await assert.rejects(access(options.martialSaveFile), { code: 'ENOENT' });
  assert.equal(await readFile(options.saveFile, 'utf8'), before);
});

test('explicit observed checkpoint equips only slot one and completes task with local idempotency', async (t) => {
  const options = await fixture(t);
  const roleBefore = await readFile(options.saveFile, 'utf8');
  const base = await start(t, { ...options, martialCheckpoint: checkpoint });
  const before = (await getState(base)).state;
  assert.deepEqual(before.owned, [{ id: 'uppercut-reference', level: 1 }]);
  assert.equal(before.task.current, 0);
  assert.deepEqual(before.slots.map((slot) => [slot.skillId, slot.locked]), [
    [null, false], [null, false], [null, false], [null, true], [null, true], [null, true],
  ]);
  const response = await equip(base);
  assert.equal(response.status, 200);
  const after = (await response.json()).state;
  assert.deepEqual(after.slots[0], { position: 1, skillId: 'uppercut-reference', locked: false });
  assert.deepEqual(after.slots.slice(1), before.slots.slice(1));
  assert.equal(after.task.current, 1);
  const saved = await readFile(options.martialSaveFile, 'utf8');
  const repeats = await Promise.all([equip(base), equip(base), equip(base)]);
  for (const repeat of repeats) assert.deepEqual(await repeat.json(), { state: after });
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), saved);
  assert.equal(await readFile(options.saveFile, 'utf8'), roleBefore);
});

test('write failure and rejected body preserve checkpoint state and successful retry recovers', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: checkpoint });
  const before = await getState(base);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  const roleBytes = await readFile(options.saveFile, 'utf8');
  assert.equal((await fetch(`${base}/api/martial-state/auto-equip`, { method: 'POST', body: '{}' })).status, 400);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  const backup = `${options.martialSaveFile}.backup`;
  await rename(options.martialSaveFile, backup);
  await mkdir(options.martialSaveFile);
  assert.equal((await equip(base)).status, 500);
  assert.deepEqual(await getState(base), before);
  assert.equal(await readFile(backup, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), roleBytes);
  assert.equal((await readdir(options.directory)).some((name) => name.endsWith('.tmp')), false);
  await rm(options.martialSaveFile, { recursive: true });
  await rename(backup, options.martialSaveFile);
  assert.equal((await equip(base)).status, 200);
  assert.equal((await getState(base)).state.task.current, 1);
});

test('changed character reports mismatch without silently resetting the checkpoint', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: checkpoint });
  await equip(base);
  const before = await readFile(options.martialSaveFile, 'utf8');
  const changed = { ...character, name: '另一个本地身份' };
  assert.equal((await fetch(`${base}/api/character`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed),
  })).status, 200);
  for (const response of [await fetch(`${base}/api/martial-state`), await equip(base)]) {
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'martial_checkpoint_character_mismatch' });
  }
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), before);
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), changed);
});

async function processServer(t, options, seed) {
  const env = { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: options.saveFile, MARTIAL_SAVE_FILE: options.martialSaveFile };
  delete env.MARTIAL_CHECKPOINT;
  if (seed) env.MARTIAL_CHECKPOINT = typeof seed === 'string' ? seed : checkpoint;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], {
    env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill(); await exited;
  };
  t.after(stop);
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timeout')); }, 10000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Unexpected startup exit')); });
    child.stdout.on('data', (data) => {
      const url = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) { clearTimeout(timer); resolve(url); }
    });
  });
  return { base, stop };
}

test('equipped checkpoint survives full process restart without re-enabling fixture', async (t) => {
  const options = await fixture(t);
  const first = await processServer(t, options, true);
  const after = await (await equip(first.base)).json();
  const saved = await readFile(options.martialSaveFile, 'utf8');
  await first.stop();
  const second = await processServer(t, options, false);
  assert.deepEqual(await getState(second.base), after);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), saved);
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), character);
});

test('missing character, unknown fixture and corrupted sidecar fail initialization without overwriting data', async (t) => {
  const options = await fixture(t, false);
  await assert.rejects(createApp({ ...options, martialCheckpoint: checkpoint }), /Create a local character/);
  await assert.rejects(access(options.martialSaveFile), { code: 'ENOENT' });
  await assert.rejects(createApp({ ...options, martialCheckpoint: 'invented' }), /Unknown local martial checkpoint/);
  await writeFile(options.saveFile, JSON.stringify(character));
  await writeFile(options.martialSaveFile, 'broken');
  await assert.rejects(createApp({ ...options, martialCheckpoint: checkpoint }));
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), 'broken');
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), character);
  await assert.rejects(createApp({ ...options, martialSaveFile: options.saveFile }), /separate files/);
});

test('stored task completion is independent of whether slot one is currently equipped', async (t) => {
  const options = await fixture(t);
  // Exercise the separate persisted flag; this is not an implemented unequip endpoint.
  await writeFile(options.martialSaveFile, JSON.stringify({ checkpoint, character, equipped: false, taskComplete: true }));
  const base = await start(t, options);
  const state = (await getState(base)).state;
  assert.equal(state.slots[0].skillId, null);
  assert.equal(state.task.current, 1);
});
test('equip then unequip preserves completed task across a real process restart', async (t) => {
  const options = await fixture(t);
  const roleBytes = await readFile(options.saveFile, 'utf8');
  const first = await processServer(t, options, true);
  await equip(first.base);
  const response = await fetch(`${first.base}/api/martial-state/unequip`, { method: 'POST' });
  assert.equal(response.status, 200);
  const after = await response.json();
  assert.equal(after.state.slots[0].skillId, null);
  assert.equal(after.state.task.current, 1);
  assert.deepEqual(after.state.owned, [{ id: 'uppercut-reference', level: 1 }]);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  const repeat = await fetch(`${first.base}/api/martial-state/unequip`, { method: 'POST' });
  assert.deepEqual(await repeat.json(), after);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  await first.stop();
  const second = await processServer(t, options, false);
  assert.deepEqual(await getState(second.base), after);
  assert.equal(await readFile(options.saveFile, 'utf8'), roleBytes);
});

test('unequip disk failure keeps equipped state and task; recovery can retry safely', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: checkpoint });
  await equip(base);
  const before = await getState(base);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  const roleBytes = await readFile(options.saveFile, 'utf8');
  const backup = `${options.martialSaveFile}.backup`;
  await rename(options.martialSaveFile, backup);
  await mkdir(options.martialSaveFile);
  assert.equal((await fetch(`${base}/api/martial-state/unequip`, { method: 'POST' })).status, 500);
  assert.deepEqual(await getState(base), before);
  assert.equal(await readFile(backup, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), roleBytes);
  await rm(options.martialSaveFile, { recursive: true });
  await rename(backup, options.martialSaveFile);
  assert.equal((await fetch(`${base}/api/martial-state/unequip`, { method: 'POST' })).status, 200);
  assert.equal((await getState(base)).state.task.current, 1);
  assert.equal((await getState(base)).state.slots[0].skillId, null);
});

test('unequip before first equip keeps incomplete task; invalid body and binding mismatch do not mutate', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: checkpoint });
  const before = await readFile(options.martialSaveFile, 'utf8');
  const response = await fetch(`${base}/api/martial-state/unequip`, { method: 'POST' });
  assert.equal((await response.json()).state.task.current, 0);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), before);
  assert.equal((await fetch(`${base}/api/martial-state/unequip`, { method: 'POST', body: '{}' })).status, 400);
  assert.equal((await fetch(`${base}/api/martial-state/unequip`)).status, 405);
  await fetch(`${base}/api/character`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '不同绑定' }),
  });
  const mismatch = await fetch(`${base}/api/martial-state/unequip`, { method: 'POST' });
  assert.equal(mismatch.status, 409);
  assert.deepEqual(await mismatch.json(), { error: 'martial_checkpoint_character_mismatch' });
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), before);
});

test('unequip cannot create a checkpoint for an ordinary character', async (t) => {
  const options = await fixture(t);
  const base = await start(t, options);
  const response = await fetch(`${base}/api/martial-state/unequip`, { method: 'POST' });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'martial_checkpoint_not_initialized' });
  await assert.rejects(access(options.martialSaveFile), { code: 'ENOENT' });
});
const eventCheckpoint = 'observed-event1-before-equip';
test('event-one checkpoint maps the two observed skills and list order without altering task or character', async (t) => {
  const options = await fixture(t);
  const role = await readFile(options.saveFile, 'utf8');
  const base = await start(t, { ...options, martialCheckpoint: eventCheckpoint });
  const before = (await getState(base)).state;
  assert.equal(before.checkpoint, eventCheckpoint);
  assert.deepEqual(before.owned, [{ id: 'uppercut-reference', level: 1 }, { id: 'ruwu-sword-reference', level: 1 }]);
  assert.deepEqual(before.slots.map((slot) => slot.skillId), ['uppercut-reference', null, null, null, null, null]);
  assert.deepEqual(before.task, { id: 'event1-reference', label: '通关江湖事件1', current: 1, target: 1 });
  const after = (await (await equip(base)).json()).state;
  assert.deepEqual(after.owned, [{ id: 'ruwu-sword-reference', level: 1 }, { id: 'uppercut-reference', level: 1 }]);
  assert.deepEqual(after.slots.map((slot) => slot.skillId), ['ruwu-sword-reference', 'uppercut-reference', null, null, null, null]);
  assert.deepEqual(after.slots.map((slot) => slot.locked), [false, false, false, true, true, true]);
  assert.deepEqual(after.task, before.task);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  assert.deepEqual(await (await equip(base)).json(), { state: after });
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
  assert.equal((await (await fetch(`${base}/api/reference/martial-catalog`)).json()).entries.length, 1);
});

test('two-skill checkpoint refuses unequip before and after equip and survives process restart', async (t) => {
  const options = await fixture(t);
  const first = await processServer(t, options, eventCheckpoint);
  for (const apply of [false, true]) {
    if (apply) await equip(first.base);
    const before = await getState(first.base);
    const bytes = await readFile(options.martialSaveFile, 'utf8');
    const response = await fetch(`${first.base}/api/martial-state/unequip`, { method: 'POST' });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'martial_action_not_observed' });
    assert.deepEqual(await getState(first.base), before);
    assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  }
  const equipped = await getState(first.base);
  await first.stop();
  const second = await processServer(t, options, false);
  assert.deepEqual(await getState(second.base), equipped);
});

test('two-skill write failure preserves the observed pre-equip state and original files', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: eventCheckpoint });
  const before = await getState(base);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  const role = await readFile(options.saveFile, 'utf8');
  const backup = `${options.martialSaveFile}.backup`;
  await rename(options.martialSaveFile, backup);
  await mkdir(options.martialSaveFile);
  assert.equal((await equip(base)).status, 500);
  assert.deepEqual(await getState(base), before);
  assert.equal(await readFile(backup, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
  await rm(options.martialSaveFile, { recursive: true });
  await rename(backup, options.martialSaveFile);
  assert.equal((await equip(base)).status, 200);
  assert.equal((await getState(base)).state.slots[0].skillId, 'ruwu-sword-reference');
});

test('existing single-skill save is not migrated or reset by the new checkpoint option', async (t) => {
  const options = await fixture(t);
  const bytes = JSON.stringify({ checkpoint, character, equipped: false, taskComplete: true });
  await writeFile(options.martialSaveFile, bytes);
  const base = await start(t, { ...options, martialCheckpoint: eventCheckpoint });
  const state = (await getState(base)).state;
  assert.equal(state.checkpoint, checkpoint);
  assert.deepEqual(state.owned, [{ id: 'uppercut-reference', level: 1 }]);
  assert.equal(state.task.current, 1);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  assert.equal((await fetch(`${base}/api/martial-state/unequip`, { method: 'POST' })).status, 200);
});

test('two-skill character mismatch is rejected without resetting state', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: eventCheckpoint });
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  await fetch(`${base}/api/character`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '不匹配角色' }),
  });
  assert.equal((await fetch(`${base}/api/martial-state`)).status, 409);
  assert.equal((await equip(base)).status, 409);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
});
const removeSlot = (base, position) => fetch(`${base}/api/martial-state/unequip-slot`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position }),
});
test('both removal orders keep the other skill in place and empty-list order; auto-equip restores both', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: eventCheckpoint });
  const role = await readFile(options.saveFile, 'utf8');
  for (const order of [[1, 2], [2, 1]]) {
    await equip(base);
    const one = (await (await removeSlot(base, order[0])).json()).state;
    assert.deepEqual(one.slots.slice(0, 2).map((slot) => slot.skillId), order[0] === 1
      ? [null, 'uppercut-reference'] : ['ruwu-sword-reference', null]);
    assert.deepEqual(one.owned.map((skill) => skill.id), order[0] === 1
      ? ['uppercut-reference', 'ruwu-sword-reference'] : ['ruwu-sword-reference', 'uppercut-reference']);
    const empty = (await (await removeSlot(base, order[1])).json()).state;
    assert.deepEqual(empty.slots.slice(0, 2).map((slot) => slot.skillId), [null, null]);
    assert.deepEqual(empty.owned.map((skill) => skill.id), ['ruwu-sword-reference', 'uppercut-reference']);
    assert.equal(empty.task.current, 1);
    const bytes = await readFile(options.martialSaveFile, 'utf8');
    assert.deepEqual(await (await removeSlot(base, order[1])).json(), { state: empty });
    assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
    const restored = (await (await equip(base)).json()).state;
    assert.deepEqual(restored.slots.slice(0, 2).map((slot) => slot.skillId), ['ruwu-sword-reference', 'uppercut-reference']);
  }
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
});

test('initial uppercut removal gives empty slots and sword-first list after a real restart', async (t) => {
  const options = await fixture(t);
  const first = await processServer(t, options, eventCheckpoint);
  const empty = await (await removeSlot(first.base, 1)).json();
  assert.deepEqual(empty.state.slots.slice(0, 2).map((slot) => slot.skillId), [null, null]);
  assert.deepEqual(empty.state.owned.map((skill) => skill.id), ['ruwu-sword-reference', 'uppercut-reference']);
  await first.stop();
  const second = await processServer(t, options, false);
  assert.deepEqual(await getState(second.base), empty);
});

test('legacy twoEquipped booleans are read without GET migration and remain removable', async (t) => {
  for (const twoEquipped of [false, true]) {
    const options = await fixture(t);
    const bytes = JSON.stringify({ checkpoint: eventCheckpoint, character, twoEquipped });
    await writeFile(options.martialSaveFile, bytes);
    const base = await start(t, options);
    const state = (await getState(base)).state;
    assert.deepEqual(state.owned.map((skill) => skill.id), twoEquipped
      ? ['ruwu-sword-reference', 'uppercut-reference'] : ['uppercut-reference', 'ruwu-sword-reference']);
    assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
    assert.equal((await removeSlot(base, 1)).status, 200);
    assert.ok(Array.isArray(JSON.parse(await readFile(options.martialSaveFile, 'utf8')).twoSlots));
  }
});

test('specified removal failure preserves state and files and retry succeeds', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: eventCheckpoint });
  await equip(base);
  const before = await getState(base);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  const role = await readFile(options.saveFile, 'utf8');
  const backup = `${options.martialSaveFile}.backup`;
  await rename(options.martialSaveFile, backup);
  await mkdir(options.martialSaveFile);
  assert.equal((await removeSlot(base, 1)).status, 500);
  assert.deepEqual(await getState(base), before);
  assert.equal(await readFile(backup, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
  await rm(options.martialSaveFile, { recursive: true });
  await rename(backup, options.martialSaveFile);
  assert.equal((await removeSlot(base, 1)).status, 200);
  assert.equal((await getState(base)).state.slots[1].skillId, 'uppercut-reference');
});

test('specified removal rejects unobserved positions, malformed requests and mismatched characters without writing', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, martialCheckpoint: eventCheckpoint });
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  for (const position of [0, 3, 4, 5, 6, '1', null, 1.5]) assert.equal((await removeSlot(base, position)).status, 400);
  for (const body of ['{', '{}', 'null', '{"position":1,"extra":true}']) {
    assert.equal((await fetch(`${base}/api/martial-state/unequip-slot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })).status, 400);
  }
  assert.equal((await fetch(`${base}/api/martial-state/unequip-slot`, { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(`${base}/api/martial-state/unequip-slot`)).status, 405);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  await fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '变化' }) });
  assert.equal((await removeSlot(base, 1)).status, 409);
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  const singleOptions = await fixture(t);
  const single = await start(t, { ...singleOptions, martialCheckpoint: checkpoint });
  assert.equal((await removeSlot(single, 1)).status, 409);
});