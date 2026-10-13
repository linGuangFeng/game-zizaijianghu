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
  if (seed) env.MARTIAL_CHECKPOINT = checkpoint;
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