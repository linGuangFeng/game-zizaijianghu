import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';

const character = { name: '装备事务测试', appearanceId: 'male-reference-0002' };
const checkpoint = 'observed-event5-blade';
const purple = 'bloodwar-blade-purple';
const gold = 'bloodwar-blade-gold';
async function fixture(t, withCharacter = true) {
  const directory = await mkdtemp(join(tmpdir(), 'gear-test-'));
  const saveFile = join(directory, 'character.json');
  const gearSaveFile = `${saveFile}.gear.json`;
  const clientDirectory = join(directory, 'client');
  await mkdir(clientDirectory);
  if (withCharacter) await writeFile(saveFile, JSON.stringify(character));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, saveFile, gearSaveFile, clientDirectory };
}
async function start(t, options) {
  const server = await createApp(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const state = async (base) => (await (await fetch(`${base}/api/gear-state`)).json()).state;
const post = (base, path, body) => fetch(`${base}/api/gear-state/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const equip = (base, itemId, expectedRevision) => post(base, 'equip', { itemId, expectedRevision });

test('ordinary characters get no implicit gear state or gift', async (t) => {
  const options = await fixture(t); const base = await start(t, options);
  for (const response of [await fetch(`${base}/api/gear-state`), await equip(base, purple, 0)]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'gear_checkpoint_not_initialized' });
  }
  await assert.rejects(access(options.gearSaveFile), { code: 'ENOENT' });
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), character);
});

test('observed gold/purple switching and automatic gold preserve text totals and other saves', async (t) => {
  const options = await fixture(t);
  const base = await start(t, { ...options, gearCheckpoint: checkpoint, martialCheckpoint: 'observed-before-equip', realmCheckpoint: 'observed-before-training' });
  const files = [options.saveFile, `${options.saveFile}.martial.json`, `${options.saveFile}.realm.json`];
  const before = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const initial = await state(base);
  assert.equal(initial.equippedId, gold); assert.equal(initial.revision, 0);
  assert.deepEqual(initial.owned.map(({ id, name, tier, quality, power, attributes }) => ({ id, name, tier, quality, power, attributes })), [
    { id: purple, name: '血战刀', tier: 1, quality: '紫色', power: 1679, attributes: { attack: 60, defense: 30, health: 2980, criticalResistance: 5 } },
    { id: gold, name: '血战刀', tier: 1, quality: '金色', power: 2793, attributes: { attack: 96, defense: 48, health: 4760, criticalResistance: 5 } },
  ]);
  assert.ok(initial.owned.every((item) => !('quantity' in item)));
  assert.equal((await equip(base, purple, 0)).status, 200);
  assert.deepEqual((await state(base)).equipmentAttributes, { attack: 600, defense: 300, healthText: '2.98万', criticalResistance: 50 });
  assert.equal((await post(base, 'auto-equip', { expectedRevision: 1 })).status, 200);
  assert.deepEqual((await state(base)).equipmentAttributes, { attack: 636, defense: 318, healthText: '3.15万', criticalResistance: 50 });
  assert.equal((await state(base)).revision, 2);
  assert.deepEqual(await Promise.all(files.map((file) => readFile(file, 'utf8'))), before);
});

test('same target is no-write at current revision; stale revision conflicts even for same target', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, gearCheckpoint: checkpoint });
  const before = await readFile(options.gearSaveFile, 'utf8');
  await rename(options.gearSaveFile, `${options.gearSaveFile}.backup`); await mkdir(options.gearSaveFile);
  assert.equal((await equip(base, gold, 0)).status, 200);
  assert.equal((await post(base, 'auto-equip', { expectedRevision: 0 })).status, 200);
  assert.equal((await state(base)).revision, 0);
  assert.equal(await readFile(`${options.gearSaveFile}.backup`, 'utf8'), before);
  await rm(options.gearSaveFile, { recursive: true }); await rename(`${options.gearSaveFile}.backup`, options.gearSaveFile);
  assert.equal((await equip(base, purple, 0)).status, 200);
  const stale = await equip(base, purple, 0);
  assert.equal(stale.status, 409); assert.deepEqual(await stale.json(), { error: 'gear_revision_conflict' });
});

test('same-revision concurrent replacements commit once', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, gearCheckpoint: checkpoint });
  const responses = await Promise.all([equip(base, purple, 0), equip(base, purple, 0)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await state(base)).revision, 1); assert.equal((await state(base)).equippedId, purple);
});

test('failed replacement preserves memory, disk backup and character, then same revision can retry', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, gearCheckpoint: checkpoint });
  const before = await state(base); const bytes = await readFile(options.gearSaveFile, 'utf8');
  const role = await readFile(options.saveFile, 'utf8');
  await rename(options.gearSaveFile, `${options.gearSaveFile}.backup`); await mkdir(options.gearSaveFile);
  assert.equal((await equip(base, purple, 0)).status, 500);
  assert.deepEqual(await state(base), before);
  assert.equal(await readFile(`${options.gearSaveFile}.backup`, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
  await rm(options.gearSaveFile, { recursive: true }); await rename(`${options.gearSaveFile}.backup`, options.gearSaveFile);
  assert.equal((await equip(base, purple, 0)).status, 200);
});

test('real new process restores gear without checkpoint initialization', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, gearCheckpoint: checkpoint });
  await equip(base, purple, 0);
  const expected = await state(base); const bytes = await readFile(options.gearSaveFile, 'utf8');
  const env = { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: options.saveFile, GEAR_SAVE_FILE: options.gearSaveFile };
  for (const key of ['GEAR_CHECKPOINT', 'MARTIAL_CHECKPOINT', 'REALM_CHECKPOINT', 'MARTIAL_SAVE_FILE', 'REALM_SAVE_FILE']) delete env[key];
  const restored = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (restored.exitCode === null && restored.signalCode === null) { restored.kill(); await once(restored, 'exit'); } });
  const address = await new Promise((resolve, reject) => {
    let output = '';
    restored.stdout.on('data', (chunk) => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    restored.once('error', reject); restored.once('exit', (code) => reject(new Error(`Child exited ${code}`)));
  });
  assert.deepEqual(await state(address), expected); assert.equal(await readFile(options.gearSaveFile, 'utf8'), bytes);
});

test('invalid requests and identity conflict never mutate gear', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, gearCheckpoint: checkpoint });
  const bytes = await readFile(options.gearSaveFile, 'utf8');
  for (const body of [{ itemId: 'unknown', expectedRevision: 0 }, { itemId: purple, expectedRevision: -1 }, { itemId: purple, expectedRevision: 0, extra: 1 }, null]) {
    const response = await post(base, 'equip', body); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_gear_equip' });
  }
  assert.equal((await post(base, 'auto-equip', { expectedRevision: 0, itemId: gold })).status, 400);
  assert.equal((await fetch(`${base}/api/gear-state/equip`)).status, 405);
  await fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '另一个角色' }) });
  for (const response of [await fetch(`${base}/api/gear-state`), await equip(base, purple, 0)]) {
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'gear_checkpoint_character_mismatch' });
  }
  assert.equal(await readFile(options.gearSaveFile, 'utf8'), bytes);
});

test('startup rejects missing role, unknown checkpoint, corrupt gear and colliding file paths', async (t) => {
  const options = await fixture(t, false);
  await assert.rejects(createApp({ ...options, gearCheckpoint: checkpoint }), /Create a local character/);
  await assert.rejects(createApp({ ...options, gearCheckpoint: 'unknown' }), /Unknown local gear checkpoint/);
  for (const gearSaveFile of [options.saveFile, `${options.saveFile}.martial.json`, `${options.saveFile}.realm.json`]) {
    await assert.rejects(createApp({ ...options, gearSaveFile }), /Gear save must use a separate file/);
  }
  await writeFile(options.gearSaveFile, '{broken');
  await assert.rejects(createApp(options)); assert.equal(await readFile(options.gearSaveFile, 'utf8'), '{broken');
});
