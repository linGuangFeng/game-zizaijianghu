import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';

const character = { name: '境界事务测试', appearanceId: 'male-reference-0002' };
const checkpoint = 'observed-before-training';
async function fixture(t, withCharacter = true) {
  const directory = await mkdtemp(join(tmpdir(), 'realm-test-'));
  const saveFile = join(directory, 'character.json');
  const realmSaveFile = `${saveFile}.realm.json`;
  const clientDirectory = join(directory, 'client');
  await mkdir(clientDirectory);
  if (withCharacter) await writeFile(saveFile, JSON.stringify(character));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, saveFile, realmSaveFile, clientDirectory };
}
async function start(t, options) {
  const server = await createApp(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const state = async (base) => (await (await fetch(`${base}/api/realm-state`)).json()).state;
const train = (base, training, expectedRevision) => fetch(`${base}/api/realm-state/train`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ training, expectedRevision }),
});

test('ordinary character receives no realm experience or implicit save', async (t) => {
  const options = await fixture(t); const base = await start(t, options);
  const before = await readFile(options.saveFile, 'utf8');
  for (const response of [await fetch(`${base}/api/realm-state`), await train(base, 'trial', 0)]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'realm_checkpoint_not_initialized' });
  }
  await assert.rejects(access(options.realmSaveFile), { code: 'ENOENT' });
  assert.equal(await readFile(options.saveFile, 'utf8'), before);
});

test('one snapshot commits experience, independent counts, realm attributes and cumulative task', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  assert.equal((await state(base)).resource.amount, 120);
  for (const [revision, type] of ['trial', 'stance', 'run'].entries()) assert.equal((await train(base, type, revision)).status, 200);
  const current = await state(base);
  assert.equal(current.resource.name, '江湖阅历');
  assert.equal(current.resource.amount, 84);
  assert.deepEqual(current.training.map((item) => item.count), [1, 1, 1]);
  assert.deepEqual(current.realm.attributes, { attack: 12, defense: 6, health: 1100 });
  assert.equal(current.realm.progress.current, 3); assert.equal(current.task.current, 3);
  assert.equal(current.revision, 3);
  for (let revision = 3; revision < 10; revision++) assert.equal((await train(base, 'trial', revision)).status, 200);
  const completed = await state(base);
  assert.equal(completed.resource.amount, 0); assert.equal(completed.task.current, 10); assert.equal(completed.task.completed, true);
  assert.deepEqual(completed.realm.attributes, { attack: 26, defense: 6, health: 1100 });
  const bytes = await readFile(options.realmSaveFile, 'utf8');
  const insufficient = await train(base, 'run', 10);
  assert.equal(insufficient.status, 409); assert.deepEqual(await insufficient.json(), { error: 'realm_experience_insufficient' });
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
  assert.deepEqual(await state(base), completed);
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), character);
});

test('same-revision concurrent requests commit only once and a replay cannot double charge', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  const responses = await Promise.all([train(base, 'trial', 0), train(base, 'stance', 0)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.deepEqual(await responses.find((response) => response.status === 409).json(), { error: 'realm_revision_conflict' });
  assert.equal((await state(base)).resource.amount, 108); assert.equal((await state(base)).realm.progress.current, 1);
  const bytes = await readFile(options.realmSaveFile, 'utf8');
  assert.equal((await train(base, 'trial', 0)).status, 409);
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
});

test('all three observed training caps stop without charging using explicitly synthetic test experience', async (t) => {
  const options = await fixture(t);
  // 360 is isolated test setup, not a game reward or default player balance.
  await writeFile(options.realmSaveFile, JSON.stringify({ checkpoint, character, revision: 0, experience: 360,
    counts: { trial: 0, stance: 0, run: 0 }, attributes: { attack: 10, defense: 5, health: 1000 }, totalTraining: 0 }));
  const base = await start(t, options);
  let revision = 0;
  for (const training of ['trial', 'stance', 'run']) {
    for (let count = 0; count < 10; count++) assert.equal((await train(base, training, revision++)).status, 200);
    const bytes = await readFile(options.realmSaveFile, 'utf8');
    const response = await train(base, training, revision);
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'realm_training_at_limit' });
    assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
  }
  const current = await state(base);
  assert.deepEqual(current.realm.attributes, { attack: 30, defense: 15, health: 2000 });
  assert.equal(current.realm.progress.current, 30); assert.equal(current.resource.amount, 0);
  assert.equal(current.task.label, '累计修炼10次'); assert.equal(current.task.current, 10); // No natural task advancement.
});

test('disk failure changes none of the transaction and retry with the same revision recovers', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  const before = await state(base); const bytes = await readFile(options.realmSaveFile, 'utf8');
  const role = await readFile(options.saveFile, 'utf8'); const backup = `${options.realmSaveFile}.backup`;
  await rename(options.realmSaveFile, backup); await mkdir(options.realmSaveFile);
  assert.equal((await train(base, 'run', 0)).status, 500);
  assert.deepEqual(await state(base), before); assert.equal(await readFile(backup, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
  await rm(options.realmSaveFile, { recursive: true }); await rename(backup, options.realmSaveFile);
  assert.equal((await train(base, 'run', 0)).status, 200);
  assert.equal((await state(base)).resource.amount, 108); assert.equal((await state(base)).revision, 1);
});

async function processServer(t, options, seed) {
  const env = { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: options.saveFile, REALM_SAVE_FILE: options.realmSaveFile };
  delete env.REALM_CHECKPOINT; delete env.MARTIAL_CHECKPOINT; delete env.MARTIAL_SAVE_FILE;
  if (seed) env.REALM_CHECKPOINT = checkpoint;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const stop = async () => { if (child.exitCode !== null || child.signalCode !== null) return; const exited = once(child, 'exit'); child.kill(); await exited; };
  t.after(stop);
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timeout')); }, 10000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Unexpected startup exit')); });
    child.stdout.on('data', (chunk) => { const url = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]; if (url) { clearTimeout(timer); resolve(url); } });
  });
  return { base, stop };
}
test('full process restart restores the complete training transaction without fixture reset', async (t) => {
  const options = await fixture(t); const first = await processServer(t, options, true);
  await train(first.base, 'run', 0); await train(first.base, 'stance', 1);
  const before = await state(first.base); const bytes = await readFile(options.realmSaveFile, 'utf8'); await first.stop();
  const second = await processServer(t, options, false);
  assert.deepEqual(await state(second.base), before); assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
});

test('invalid input and identity mismatch never mutate the realm save', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  const bytes = await readFile(options.realmSaveFile, 'utf8');
  for (const body of [null, [], {}, { training: 'unknown', expectedRevision: 0 }, { training: 'trial', expectedRevision: '0' },
    { training: 'trial', expectedRevision: -1 }, { training: 'trial', expectedRevision: 0, reward: true }]) {
    assert.equal((await fetch(`${base}/api/realm-state/train`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 400);
  }
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
  await fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '另一身份' }) });
  const response = await train(base, 'trial', 0); assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'realm_checkpoint_character_mismatch' });
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
});

test('missing character, corrupt realm data and path collisions fail startup without replacing old saves', async (t) => {
  const options = await fixture(t, false);
  await assert.rejects(createApp({ ...options, realmCheckpoint: checkpoint }), /Create a local character/);
  await assert.rejects(access(options.realmSaveFile), { code: 'ENOENT' });
  await writeFile(options.saveFile, JSON.stringify(character)); await writeFile(options.realmSaveFile, 'broken');
  await assert.rejects(createApp({ ...options, realmCheckpoint: checkpoint }));
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), 'broken');
  await assert.rejects(createApp({ ...options, realmSaveFile: options.saveFile }), /separate file/);
  await assert.rejects(createApp({ ...options, realmSaveFile: `${options.saveFile}.martial.json` }), /separate file/);
});