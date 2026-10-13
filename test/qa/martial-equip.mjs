import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, access, rename, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const parent = join(root, '.local/independent-qa');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'equip-'));
const file = join(directory, 'character.json');
const results = [];
let processHandle;
let url;
async function start(checkpoint = '') {
  const previous = process.env.MARTIAL_CHECKPOINT; delete process.env.MARTIAL_CHECKPOINT;
  processHandle = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: file, MARTIAL_SAVE_FILE: file + '.martial.json', ...(checkpoint ? { MARTIAL_CHECKPOINT: checkpoint } : {}) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (previous !== undefined) process.env.MARTIAL_CHECKPOINT = previous;
  processHandle.stdout.setEncoding('utf8');
  processHandle.stderr.resume();
  url = await new Promise((done, fail) => {
    let text = '';
    const timer = setTimeout(() => fail(new Error('Startup timeout')), 5000);
    processHandle.once('error', error => { clearTimeout(timer); fail(error); });
    processHandle.once('exit', code => { clearTimeout(timer); fail(new Error('Early exit ' + code)); });
    processHandle.stdout.on('data', chunk => { text += chunk; const found = text.match(/http:\/\/127\.0\.0\.1:\d+/); if (found) { clearTimeout(timer); done(found[0]); } });
  });
}
async function stop() {
  if (!processHandle || processHandle.exitCode !== null) return;
  const stopped = once(processHandle, 'exit'); processHandle.kill(); await stopped;
}
async function call(path, options = {}) {
  const response = await fetch(url + path, { ...options, signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json() };
}
async function check(id, action) {
  try { results.push({ id, status: 'PASS', detail: await action() }); }
  catch (error) { results.push({ id, status: 'FAIL', error: error.stack }); throw error; }
}
const sidecar = file + '.martial.json';
const character = { name: '装配独立侠', appearanceId: 'male-reference-0002' };
const original = JSON.stringify(character, null, 2) + '\n';
const checkpoint = 'observed-before-equip';
const statePath = '/api/martial-state';
const equipPath = statePath + '/auto-equip';
const expected = equipped => ({ state: {
  kind: 'local-martial-checkpoint', checkpoint,
  owned: [{ id: 'uppercut-reference', level: 1 }],
  slots: [1,2,3,4,5,6].map(position => ({ position, skillId: position === 1 && equipped ? 'uppercut-reference' : null, locked: position >= 4 })),
  task: { id: 'equip-martial-reference', label: '装配武学', current: equipped ? 1 : 0, target: 1 },
} });
async function originalUnchanged() { assert.equal(await readFile(file, 'utf8'), original); }
try {
  await writeFile(file, original);
  await start();
  await check('ME-01', async () => {
    for (const [path, method] of [[statePath, 'GET'], [equipPath, 'POST']]) assert.deepEqual(await call(path, { method }), { status: 404, body: { error: 'martial_checkpoint_not_initialized' } });
    await assert.rejects(access(sidecar), { code: 'ENOENT' }); await originalUnchanged();
    return { ordinaryCharacterUnchanged: true, noImplicitOwnershipOrSidecar: true };
  });
  await stop(); await start(checkpoint);
  await check('ME-02', async () => {
    await originalUnchanged();
    const disk = JSON.parse(await readFile(sidecar, 'utf8'));
    assert.deepEqual(disk, { checkpoint, character, equipped: false, taskComplete: false });
    return { legacyCharacterBytesPreserved: true, sidecar: disk };
  });
  await check('ME-03', async () => {
    assert.deepEqual(await call(statePath), { status: 200, body: expected(false) });
    return expected(false);
  });
  await check('ME-06', async () => {
    const backup = sidecar + '.backup';
    const before = await readFile(sidecar, 'utf8');
    await rename(sidecar, backup); await mkdir(sidecar);
    let response;
    try {
      response = await call(equipPath, { method: 'POST' });
      assert.deepEqual(response, { status: 500, body: { error: 'local_operation_failed' } });
      assert.deepEqual((await call(statePath)).body, expected(false));
      assert.equal(await readFile(backup, 'utf8'), before); await originalUnchanged();
    } finally { await rmdir(sidecar); await rename(backup, sidecar); }
    return { response, previousStateAndOriginalPreserved: true, injection: 'test-only target directory; backup restored' };
  });
  await check('ME-04', async () => {
    assert.deepEqual(await call(equipPath, { method: 'POST' }), { status: 200, body: expected(true) });
    assert.deepEqual((await call(statePath)).body, expected(true)); await originalUnchanged();
    const disk = JSON.parse(await readFile(sidecar, 'utf8'));
    assert.equal(disk.equipped, true); assert.equal(disk.taskComplete, true);
    return { state: expected(true), successfulRetryAfterFailure: true };
  });
  await check('ME-05', async () => {
    const oldPid = processHandle.pid; await stop(); await start();
    assert.notEqual(processHandle.pid, oldPid);
    assert.deepEqual((await call(statePath)).body, expected(true)); await originalUnchanged();
    return { oldPid, newPid: processHandle.pid, persistedWithoutReenablingCheckpoint: true };
  });
  await check('ME-07', async () => {
    const before = await readFile(sidecar, 'utf8');
    for (let i = 0; i < 2; i++) assert.deepEqual((await call(equipPath, { method: 'POST' })).body, expected(true));
    assert.equal(await readFile(sidecar, 'utf8'), before); await originalUnchanged();
    return { localIdempotenceOnly: true, repeats: 2 };
  });
  await check('ME-08', async () => {
    const before = await readFile(sidecar, 'utf8');
    assert.deepEqual(await call(equipPath, { method: 'POST', body: '{}' }), { status: 400, body: { error: 'empty_body_required' } });
    assert.deepEqual(await call(equipPath), { status: 405, body: { error: 'method_not_allowed' } });
    await originalUnchanged(); assert.equal(await readFile(sidecar, 'utf8'), before);
    return { invalidRequestsDoNotWrite: true };
  });
  await check('ME-09', async () => {
    const before = await readFile(sidecar, 'utf8');
    const changed = { ...character, name: '另一角色' };
    assert.equal((await call('/api/character', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changed) })).status, 200);
    const changedBytes = await readFile(file, 'utf8');
    for (const [path, method] of [[statePath, 'GET'], [equipPath, 'POST']]) assert.deepEqual(await call(path, { method }), { status: 409, body: { error: 'martial_checkpoint_character_mismatch' } });
    assert.equal(await readFile(sidecar, 'utf8'), before); assert.equal(await readFile(file, 'utf8'), changedBytes);
    return { mismatchedCharacterRejectedWithoutReset: true };
  });
} catch (error) { process.exitCode = 1; console.error(error.message); }
finally {
  await stop();
  const hashes = {};
  for (const name of ['server/index.js','server/app.js','server/martial-store.js','test/qa/martial-equip.mjs']) hashes[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex');
  const report = { source: 'Independent local Codex QA, not Grok', at: new Date().toISOString(), timezone: 'Australia/Perth', directory, hashes, results };
  const reportPath = join(directory, 'result.json'); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath, results }, null, 2));
}
