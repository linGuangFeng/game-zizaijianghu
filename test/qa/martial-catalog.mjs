import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const parent = join(root, '.local/independent-qa');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'martial-'));
const file = join(directory, 'character.json');
const results = [];
let processHandle;
let url;
async function start() {
  processHandle = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: file }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
const route = '/api/reference/martial-catalog';
let catalog;
const character = { name: '只读验证武侠', appearanceId: 'female-reference-0003' };
let saved;
try {
  await start();
  await check('MQ-01', async () => {
    const response = await call(route);
    assert.equal(response.status, 200); catalog = response.body;
    assert.equal(catalog.kind, 'reference-catalog');
    assert.deepEqual(catalog.evidence, ['docs/evidence/original-martial-list.jpg', 'docs/evidence/original-martial-detail.jpg']);
    assert.deepEqual(Object.keys(catalog).sort(), ['entries', 'evidence', 'kind', 'observedSlots']);
    return { kind: catalog.kind, evidence: catalog.evidence };
  });
  await check('MQ-02', async () => {
    // Expected values transcribed independently from reviewed screenshots/evidence, not imported from implementation.
    assert.equal(catalog.entries.length, 1);
    assert.deepEqual(catalog.entries[0], {
      id: 'uppercut-reference', name: '上勾拳', categoryText: '通用', levelText: '1', starsText: '0星', roleText: '控制', cooldownText: '7.3秒',
      descriptionFragments: ['施展上勾拳', '对选中目标造成', '自身攻击力90%(27)', '并对范围内目标（最多3人）造成30%伤害', '且此技能对击中目标造成击飞效果'],
      descriptionComplete: false,
      attributes: [{ label: '攻击', text: '20+20' }, { label: '防御', text: '10+10' }, { label: '气血', text: '1000+1000' }],
      observedTalentRows: [
        { levelText: 'Lv.25', visibleState: 'locked', readableText: '武学属性提升+0.5%', textComplete: true },
        { levelText: 'Lv.50', visibleState: 'locked', readableText: '攻击增加+200', textComplete: false },
        { levelText: 'Lv.75', visibleState: 'locked', readableText: '攻击增加+400', textComplete: false },
      ], upgradeCounterText: '0/1',
    });
    return { entry: catalog.entries[0], unknownTextNotCompleted: true };
  });
  await check('MQ-03', async () => {
    assert.deepEqual(catalog.observedSlots, [1, 2, 3, 4, 5, 6].map(position => ({ position, visibleState: position <= 3 ? 'plus-alert' : 'locked' })));
    return { observedSlots: catalog.observedSlots, noPlayerStateFields: true };
  });
  await check('MQ-04', async () => {
    assert.deepEqual(await call('/api/character'), { status: 404, body: { error: 'character_not_found' } });
    await assert.rejects(access(file), { code: 'ENOENT' });
    return { noCharacterAfterCatalogReads: true, noSaveFile: true };
  });
  const put = await call('/api/character', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(character) });
  assert.equal(put.status, 200); saved = await readFile(file, 'utf8');
  await check('MQ-05', async () => {
    for (let i = 0; i < 3; i++) assert.deepEqual((await call(route)).body, catalog);
    assert.equal(await readFile(file, 'utf8'), saved);
    assert.deepEqual((await call('/api/character')).body, { character });
    return { repeatedQueries: 3, unchangedDiskAndCharacter: true };
  });
  await check('MQ-06', async () => {
    const oldPid = processHandle.pid; await stop(); await start();
    assert.notEqual(processHandle.pid, oldPid);
    assert.deepEqual((await call(route)).body, catalog);
    assert.equal(await readFile(file, 'utf8'), saved);
    assert.deepEqual((await call('/api/character')).body, { character });
    return { oldPid, newPid: processHandle.pid, unchangedAfterRestart: true };
  });
  await check('MQ-07', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.deepEqual(await call(route, { method }), { status: 405, body: { error: 'method_not_allowed' } });
      assert.equal(await readFile(file, 'utf8'), saved);
      assert.deepEqual((await call('/api/character')).body, { character });
    }
    assert.deepEqual((await call(route)).body, catalog);
    return { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], rejected: 405, unchangedDiskAndCharacter: true };
  });
} catch (error) { process.exitCode = 1; console.error(error.message); }
finally {
  await stop();
  const hashes = {};
  for (const name of ['server/index.js', 'server/app.js', 'server/martial-catalog.js', 'test/qa/martial-catalog.mjs']) hashes[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex');
  const report = { source: 'Independent local Codex QA, not Grok', at: new Date().toISOString(), timezone: 'Australia/Perth', directory, hashes, results };
  const reportPath = join(directory, 'result.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath, results }, null, 2));
}
