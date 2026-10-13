import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, access, rename, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const parent = join(root, '.local/independent-qa');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'two-'));
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
const character = { name: '双技独立侠', appearanceId: 'female-reference-0003' };
const original = JSON.stringify(character, null, 2) + '\n';
const statePath = '/api/martial-state';
const equipPath = statePath + '/auto-equip';
const checkpoint = 'observed-event1-before-equip';
const uppercut = 'uppercut-reference';
const sword = 'ruwu-sword-reference';
const expected = after => ({ state: {
  kind: 'local-martial-checkpoint', checkpoint,
  owned: (after ? [sword, uppercut] : [uppercut, sword]).map(id => ({ id, level: 1 })),
  slots: [1,2,3,4,5,6].map(position => ({ position, skillId: position === 1 ? (after ? sword : uppercut) : position === 2 && after ? uppercut : null, locked: position >= 4 })),
  task: { id: 'event1-reference', label: '通关江湖事件1', current: 1, target: 1 },
} });
const unchanged = async () => assert.equal(await readFile(file, 'utf8'), original);
const get = async () => call(statePath);
const equip = async () => call(equipPath, { method: 'POST' });
try {
  await writeFile(file, original); await start();
  await check('MT-01', async () => {
    assert.deepEqual(await get(), { status: 404, body: { error: 'martial_checkpoint_not_initialized' } });
    assert.deepEqual(await equip(), { status: 404, body: { error: 'martial_checkpoint_not_initialized' } });
    await assert.rejects(access(sidecar), { code: 'ENOENT' }); await unchanged();
    return { noImplicitEventCompletionOrSkills: true };
  });
  await stop(); await start(checkpoint);
  await check('MT-02', async () => {
    assert.deepEqual(await get(), { status: 200, body: expected(false) }); await unchanged();
    return { explicitInitialState: expected(false), originalCharacterBytesPreserved: true };
  });
  await check('MT-03', async () => {
    const before = await readFile(sidecar, 'utf8'); const backup = sidecar + '.backup';
    await rename(sidecar, backup); await mkdir(sidecar);
    let response;
    try {
      response = await equip();
      assert.deepEqual(response, { status: 500, body: { error: 'local_operation_failed' } });
      assert.deepEqual(await get(), { status: 200, body: expected(false) });
      assert.equal(await readFile(backup, 'utf8'), before); await unchanged();
    } finally { await rmdir(sidecar); await rename(backup, sidecar); }
    return { response, oldOrderAndOriginalUnchanged: true };
  });
  await check('MT-04', async () => {
    assert.deepEqual(await equip(), { status: 200, body: expected(true) });
    assert.deepEqual(await get(), { status: 200, body: expected(true) }); await unchanged();
    return { exactObservedOrder: expected(true), eventTaskStaysComplete: true };
  });
  await check('MT-05', async () => {
    const oldPid = processHandle.pid; const before = await readFile(sidecar, 'utf8');
    await stop(); await start(); assert.notEqual(oldPid, processHandle.pid);
    assert.deepEqual(await get(), { status: 200, body: expected(true) });
    assert.equal(await readFile(sidecar, 'utf8'), before); await unchanged();
    return { oldPid, newPid: processHandle.pid, persistedWithoutInitFlag: true };
  });
  await check('MT-06', async () => {
    const before = await readFile(sidecar, 'utf8');
    assert.deepEqual(await call(statePath + '/unequip', { method: 'POST' }), { status: 409, body: { error: 'martial_action_not_observed' } });
    assert.deepEqual(await get(), { status: 200, body: expected(true) });
    assert.equal(await readFile(sidecar, 'utf8'), before); await unchanged();
    return { unknownTwoSkillUnequipBlockedWithoutMutation: true };
  });
  await check('MT-07', async () => {
    const before = await readFile(sidecar, 'utf8');
    assert.deepEqual(await equip(), { status: 200, body: expected(true) });
    assert.deepEqual(await call(equipPath, { method: 'POST', body: '{}' }), { status: 400, body: { error: 'empty_body_required' } });
    assert.equal(await readFile(sidecar, 'utf8'), before); await unchanged();
    return { localRetryStable: true, invalidBodyDoesNotWrite: true, notOriginalRepeatRule: true };
  });
  await check('MT-08', async () => {
    const before = await readFile(sidecar, 'utf8');
    const other = { ...character, name: '另一双技角色' };
    assert.equal((await call('/api/character', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(other) })).status, 200);
    const changed = await readFile(file, 'utf8');
    for (const [path, method] of [[statePath,'GET'],[equipPath,'POST']]) assert.deepEqual(await call(path, { method }), { status: 409, body: { error: 'martial_checkpoint_character_mismatch' } });
    assert.equal(await readFile(sidecar, 'utf8'), before); assert.equal(await readFile(file, 'utf8'), changed);
    return { bindingMismatchDoesNotResetEitherSave: true };
  });
  await check('MT-09', async () => {
    await stop(); await writeFile(file, original);
    const legacy = { checkpoint: 'observed-before-equip', character, equipped: false, taskComplete: true };
    const bytes = JSON.stringify(legacy) + '\n'; await writeFile(sidecar, bytes);
    await start(checkpoint);
    const state = (await get()).body.state;
    assert.equal(state.checkpoint, 'observed-before-equip');
    assert.deepEqual(state.owned, [{ id: uppercut, level: 1 }]);
    assert.equal(state.task.current, 1); assert.equal(state.slots[0].skillId, null);
    assert.equal(await readFile(sidecar, 'utf8'), bytes); await unchanged();
    return { explicitNewFlagDoesNotOverwriteExistingLegacyCheckpoint: true };
  });
} catch (error) { process.exitCode=1; console.error(error.message); }
finally {
  await stop();
  const hashes={};
  for(const name of ['server/index.js','server/app.js','server/martial-store.js','test/qa/martial-two.mjs']) hashes[name]=createHash('sha256').update(await readFile(join(root,name))).digest('hex');
  const report={source:'Independent local Codex QA, not Grok',at:new Date().toISOString(),timezone:'Australia/Perth',directory,hashes,results};
  const reportPath=join(directory,'result.json'); await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({reportPath,results},null,2));
}

