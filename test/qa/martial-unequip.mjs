import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, access, rename, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const parent = join(root, '.local/independent-qa');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'unequip-'));
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
const character = { name: '卸下独立侠', appearanceId: 'female-reference-0003' };
const original = JSON.stringify(character, null, 2) + '\n';
const statePath = '/api/martial-state';
const unequipPath = statePath + '/unequip';
const equipPath = statePath + '/auto-equip';
const get = async () => (await call(statePath)).body;
const post = path => call(path, { method: 'POST' });
const unchanged = async () => assert.equal(await readFile(file, 'utf8'), original);
let equippedState;
let emptyCompletedState;
try {
  await writeFile(file, original); await start();
  await check('MU-01', async () => {
    assert.deepEqual(await post(unequipPath), { status: 404, body: { error: 'martial_checkpoint_not_initialized' } });
    await assert.rejects(access(sidecar), { code: 'ENOENT' }); await unchanged();
    return { ordinaryCharacterNotInitialized: true };
  });
  await stop(); await start('observed-before-equip');
  await check('MU-02', async () => {
    const before = await readFile(sidecar, 'utf8');
    const response = await post(unequipPath);
    assert.equal(response.status, 200); assert.equal(response.body.state.task.current, 0);
    assert.ok(response.body.state.slots.every(slot => slot.skillId === null));
    assert.equal(await readFile(sidecar, 'utf8'), before); await unchanged();
    return { localEmptyNoopDoesNotCompleteTask: true };
  });
  const setup = await post(equipPath); assert.equal(setup.status, 200); equippedState = setup.body;
  assert.equal(equippedState.state.task.current, 1); assert.equal(equippedState.state.slots[0].skillId, 'uppercut-reference');
  emptyCompletedState = structuredClone(equippedState); emptyCompletedState.state.slots[0].skillId = null;
  await check('MU-03', async () => {
    const before = await readFile(sidecar, 'utf8'); const backup = sidecar + '.backup';
    await rename(sidecar, backup); await mkdir(sidecar);
    let response;
    try {
      response = await post(unequipPath);
      assert.deepEqual(response, { status: 500, body: { error: 'local_operation_failed' } });
      assert.deepEqual(await get(), equippedState);
      assert.equal(await readFile(backup, 'utf8'), before); await unchanged();
    } finally { await rmdir(sidecar); await rename(backup, sidecar); }
    return { response, memoryStillEquipped: true, originalAndBackupUnchanged: true };
  });
  await check('MU-04', async () => {
    assert.deepEqual(await post(unequipPath), { status: 200, body: emptyCompletedState });
    assert.deepEqual(await get(), emptyCompletedState); await unchanged();
    const stored = JSON.parse(await readFile(sidecar, 'utf8'));
    assert.equal(stored.equipped, false); assert.equal(stored.taskComplete, true);
    return { state: emptyCompletedState, persistedEquipped: false, persistedTaskComplete: true };
  });
  await check('MU-05', async () => {
    const oldPid = processHandle.pid; await stop(); await start();
    assert.notEqual(oldPid, processHandle.pid); assert.deepEqual(await get(), emptyCompletedState); await unchanged();
    return { oldPid, newPid: processHandle.pid, restoredWithoutCheckpointVariable: true };
  });
  await check('MU-06', async () => {
    const before = await readFile(sidecar, 'utf8');
    for (let i = 0; i < 2; i++) assert.deepEqual(await post(unequipPath), { status: 200, body: emptyCompletedState });
    assert.equal(await readFile(sidecar, 'utf8'), before); await unchanged();
    return { localIdempotenceOnly: true, originalRuleUnknown: true };
  });
  await check('MU-07', async () => {
    const before = await readFile(sidecar, 'utf8');
    assert.deepEqual(await call(unequipPath, { method: 'POST', body: '{}' }), { status: 400, body: { error: 'empty_body_required' } });
    assert.deepEqual(await call(unequipPath), { status: 405, body: { error: 'method_not_allowed' } });
    assert.equal(await readFile(sidecar, 'utf8'), before); assert.deepEqual(await get(), emptyCompletedState); await unchanged();
    return { rejectedInvalidBodyAndMethod: true };
  });
  await check('MU-08', async () => {
    const before = await readFile(sidecar, 'utf8');
    const other = { ...character, name: '另一卸下角色' };
    assert.equal((await call('/api/character', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(other) })).status, 200);
    const changed = await readFile(file, 'utf8');
    assert.deepEqual(await post(unequipPath), { status: 409, body: { error: 'martial_checkpoint_character_mismatch' } });
    assert.equal(await readFile(sidecar, 'utf8'), before); assert.equal(await readFile(file, 'utf8'), changed);
    return { bindingMismatchCannotResetSidecar: true };
  });
} catch (error) { process.exitCode = 1; console.error(error.message); }
finally {
  await stop();
  const hashes = {};
  for (const name of ['server/index.js','server/app.js','server/martial-store.js','test/qa/martial-unequip.mjs']) hashes[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex');
  const report = { source: 'Independent local Codex QA, not Grok', at: new Date().toISOString(), timezone: 'Australia/Perth', directory, hashes, results };
  const reportPath = join(directory, 'result.json'); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath, results }, null, 2));
}
