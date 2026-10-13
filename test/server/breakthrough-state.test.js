import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';

const character = { name: '首次突破测试', appearanceId: 'male-reference-0002' };
const checkpoint = 'observed-before-first-breakthrough';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'breakthrough-test-'));
  const saveFile = join(directory, 'character.json');
  const realmSaveFile = `${saveFile}.realm.json`;
  const clientDirectory = join(directory, 'client');
  await mkdir(clientDirectory); await writeFile(saveFile, JSON.stringify(character));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, saveFile, realmSaveFile, clientDirectory };
}
async function start(t, options) {
  const server = await createApp(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const state = async (base) => (await (await fetch(`${base}/api/breakthrough-state`)).json()).state;
const post = (base, path, body) => fetch(`${base}/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const claim = (base, conditionId, expectedRevision) => post(base, 'breakthrough-state/claim', { conditionId, expectedRevision });
const advance = (base, expectedRevision) => post(base, 'breakthrough-state/advance', { expectedRevision });
async function claimAll(base) {
  for (const [revision, id] of ['event5', 'martial2', 'training30'].entries()) assert.equal((await claim(base, id, revision)).status, 200);
}

test('ordinary characters have no breakthrough; training and breakthrough checkpoints remain separate', async (t) => {
  const options = await fixture(t); const ordinary = await start(t, options);
  assert.equal((await fetch(`${ordinary}/api/breakthrough-state`)).status, 404);
  assert.equal((await claim(ordinary, 'event5', 0)).status, 404);
  await assert.rejects(access(options.realmSaveFile), { code: 'ENOENT' });
  const training = await start(t, { ...options, realmCheckpoint: 'observed-before-training' });
  const before = await readFile(options.realmSaveFile, 'utf8');
  assert.equal((await fetch(`${training}/api/breakthrough-state`)).status, 404);
  const reconfigured = await start(t, { ...options, realmCheckpoint: checkpoint });
  assert.equal((await fetch(`${reconfigured}/api/realm-state`)).status, 200);
  assert.equal((await fetch(`${reconfigured}/api/breakthrough-state`)).status, 404);
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), before);
  const separate = await fixture(t); const breakthrough = await start(t, { ...separate, realmCheckpoint: checkpoint });
  for (const response of [await fetch(`${breakthrough}/api/realm-state`), await post(breakthrough, 'realm-state/train', { training: 'trial', expectedRevision: 0 })]) {
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'realm_training_checkpoint_unavailable' });
  }
});

test('three condition receipts and advance are atomic snapshots with no invented token balance or main task claim', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  const before = await state(base); const role = await readFile(options.saveFile, 'utf8');
  assert.deepEqual(before.realm, { id: 'initial-reference', name: '初入江湖', attributes: { attack: 30, defense: 15, health: 2000 }, comprehensionGain: 100 });
  assert.deepEqual(before.receipts, []); assert.equal(before.canAdvance, false);
  const refused = await advance(base, 0); assert.equal(refused.status, 409); assert.deepEqual(await refused.json(), { error: 'breakthrough_conditions_unclaimed' });
  for (const [revision, id] of ['event5', 'martial2', 'training30'].entries()) {
    assert.equal((await claim(base, id, revision)).status, 200);
    const current = await state(base);
    assert.equal(current.receipts.length, revision + 1); assert.equal(current.revision, revision + 1);
    assert.equal(current.conditions.filter((condition) => condition.claimed).length, revision + 1);
    assert.deepEqual(current.receipts[revision], { id: `first-breakthrough-${id}`, conditionId: id, reward: { id: 'baodian-token-reference', name: '宝典令', amount: 5 } });
  }
  assert.equal((await state(base)).canAdvance, true);
  assert.equal((await advance(base, 3)).status, 200);
  const result = await state(base);
  assert.deepEqual(result.realm, { id: 'ninth-early-reference', name: '九品前期', attributes: { attack: 40, defense: 20, health: 2500 }, comprehensionGain: 150 });
  assert.equal(result.resource.amount, 120); assert.equal(result.advanced, true); assert.equal(result.canAdvance, false);
  assert.equal(result.receipts.length, 3); assert.equal(result.revision, 4);
  assert.equal('balance' in result, false); assert.equal('task' in result, false); assert.equal('training' in result, false);
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
});

test('claim and advance idempotency check revision first and never write duplicate rewards', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  await claimAll(base); await advance(base, 3);
  const bytes = await readFile(options.realmSaveFile, 'utf8');
  await rename(options.realmSaveFile, `${options.realmSaveFile}.backup`); await mkdir(options.realmSaveFile);
  assert.equal((await claim(base, 'event5', 4)).status, 200); assert.equal((await advance(base, 4)).status, 200);
  assert.equal((await advance(base, 3)).status, 409); assert.equal((await claim(base, 'event5', 3)).status, 409);
  assert.equal(await readFile(`${options.realmSaveFile}.backup`, 'utf8'), bytes);
  assert.equal((await state(base)).revision, 4); assert.equal((await state(base)).receipts.length, 3);
});

test('concurrent same-revision claims commit only one receipt', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  const responses = await Promise.all([claim(base, 'event5', 0), claim(base, 'martial2', 0)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await state(base)).receipts.length, 1); assert.equal((await state(base)).revision, 1);
});

test('failed claim and failed advance change neither receipt nor realm; same revision retries recover', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  for (const phase of ['claim', 'advance']) {
    if (phase === 'advance') { await claim(base, 'martial2', 1); await claim(base, 'training30', 2); }
    const before = await state(base); const bytes = await readFile(options.realmSaveFile, 'utf8');
    await rename(options.realmSaveFile, `${options.realmSaveFile}.backup`); await mkdir(options.realmSaveFile);
    const action = () => phase === 'claim' ? claim(base, 'event5', before.revision) : advance(base, before.revision);
    assert.equal((await action()).status, 500); assert.deepEqual(await state(base), before);
    assert.equal(await readFile(`${options.realmSaveFile}.backup`, 'utf8'), bytes);
    await rm(options.realmSaveFile, { recursive: true }); await rename(`${options.realmSaveFile}.backup`, options.realmSaveFile);
    assert.equal((await action()).status, 200);
  }
});

test('real restarted process retains receipts, advanced realm and revision without initializing again', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  await claimAll(base); await advance(base, 3);
  const expected = await state(base); const bytes = await readFile(options.realmSaveFile, 'utf8');
  const env = { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: options.saveFile, REALM_SAVE_FILE: options.realmSaveFile };
  for (const key of ['GEAR_CHECKPOINT', 'MARTIAL_CHECKPOINT', 'REALM_CHECKPOINT', 'MARTIAL_SAVE_FILE', 'GEAR_SAVE_FILE']) delete env[key];
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); } });
  const address = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    child.once('error', reject); child.once('exit', (code) => reject(new Error(`Child exited ${code}`)));
  });
  assert.deepEqual(await state(address), expected); assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
});

test('invalid requests, corrupt receipts and role mismatch do not overwrite progress', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, realmCheckpoint: checkpoint });
  const bytes = await readFile(options.realmSaveFile, 'utf8');
  for (const body of [null, { conditionId: 'unknown', expectedRevision: 0 }, { conditionId: 'event5', expectedRevision: -1 }, { conditionId: 'event5', expectedRevision: 0, extra: 1 }]) {
    const response = await post(base, 'breakthrough-state/claim', body);
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_breakthrough_claim' });
  }
  assert.equal((await post(base, 'breakthrough-state/advance', { expectedRevision: 0, extra: 1 })).status, 400);
  await post(base, 'character', {}); // Wrong method has no effect.
  await fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '另一角色' }) });
  assert.equal((await claim(base, 'event5', 0)).status, 409);
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
  const broken = JSON.parse(bytes); broken.receipts = [{ conditionId: 'unknown' }];
  await writeFile(options.realmSaveFile, JSON.stringify(broken));
  await assert.rejects(createApp(options), /Invalid local realm save/);
  assert.deepEqual(JSON.parse(await readFile(options.realmSaveFile, 'utf8')), broken);
});
