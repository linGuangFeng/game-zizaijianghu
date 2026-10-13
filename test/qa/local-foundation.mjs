import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const base = join(root, '.local', 'independent-qa');
await mkdir(base, { recursive: true });
const directory = await mkdtemp(join(base, 'run-'));
const instances = new Set();
const results = [];
const A = { name: '清风测试🌿𠮷', appearanceId: 'female-reference-0003' };
const B = { name: '独立甲乙', appearanceId: 'male-reference-0002' };
async function start(file) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root, env: { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: file },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  instances.add(child);
  let log = '';
  let errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Startup timeout: ' + errors)), 5000);
    child.once('error', error => { clearTimeout(timer); fail(error); });
    child.once('exit', code => { clearTimeout(timer); fail(new Error('Startup exited ' + code + ': ' + errors)); });
    child.stdout.on('data', chunk => {
      log += chunk;
      const match = log.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); done(match[0]); }
    });
  });
  return { child, url, file };
}
async function stop(instance) {
  if (instance.child.exitCode !== null) return;
  const exited = once(instance.child, 'exit');
  instance.child.kill();
  await exited;
  instances.delete(instance.child);
}
async function call(instance, path, init = {}) {
  const response = await fetch(instance.url + path, { ...init, signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json() };
}
function put(instance, value) {
  return call(instance, '/api/character', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
}
async function check(id, run) {
  try { const detail = await run(); results.push({ id, status: 'PASS', detail }); }
  catch (error) { results.push({ id, status: 'FAIL', error: error.stack }); throw error; }
}
let first;
try {
  const fileA = join(directory, 'a', 'character.json');
  const fileB = join(directory, 'b', 'character.json');
  first = await start(fileA);
  await check('LF-API-01', async () => {
    assert.deepEqual(await call(first, '/api/health'), { status: 200, body: { status: 'ok', scope: 'local-foundation' } });
    const options = await call(first, '/api/appearance-options');
    assert.equal(options.status, 200);
    assert.deepEqual(options.body.options.map(item => item.id), [B.appearanceId, A.appearanceId]);
    return { url: first.url, options: options.body };
  });
  await check('LF-API-02', async () => {
    const response = await call(first, '/api/character');
    assert.deepEqual(response, { status: 404, body: { error: 'character_not_found' } });
    return response;
  });
  await check('LF-API-03', async () => {
    assert.deepEqual(await put(first, A), { status: 200, body: { character: A } });
    assert.deepEqual(await call(first, '/api/character'), { status: 200, body: { character: A } });
    assert.deepEqual(JSON.parse(await readFile(fileA, 'utf8')), A);
    return { expected: A, diskAndApi: 'equal; Chinese, emoji, supplementary Han preserved' };
  });
  await check('LF-API-04', async () => {
    assert.deepEqual(await put(first, B), { status: 200, body: { character: B } });
    assert.deepEqual(await call(first, '/api/character'), { status: 200, body: { character: B } });
    assert.deepEqual(JSON.parse(await readFile(fileA, 'utf8')), B);
    return { replacement: B };
  });
  await check('LF-API-05', async () => {
    const beforePid = first.child.pid;
    await stop(first);
    first = await start(fileA);
    assert.notEqual(first.child.pid, beforePid);
    assert.deepEqual(await call(first, '/api/character'), { status: 200, body: { character: B } });
    return { beforePid, afterPid: first.child.pid, url: first.url, persisted: B };
  });
  await check('LF-API-06', async () => {
    let second = await start(fileB);
    assert.equal((await call(second, '/api/character')).status, 404);
    assert.equal((await put(second, A)).status, 200);
    await stop(second);
    second = await start(fileB);
    assert.deepEqual((await call(second, '/api/character')).body, { character: A });
    assert.deepEqual((await call(first, '/api/character')).body, { character: B });
    assert.deepEqual(JSON.parse(await readFile(fileA, 'utf8')), B);
    assert.deepEqual(JSON.parse(await readFile(fileB, 'utf8')), A);
    const detail = { firstFile: fileA, secondFile: fileB, independentValues: true };
    await stop(second);
    return detail;
  });
  await check('LF-API-07', async () => {
    const before = await readFile(fileA, 'utf8');
    const cases = [
      [{ method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{' }, 400, 'invalid_json'],
      [{ method: 'PUT', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(A) }, 415, 'json_required'],
      [{ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...A, appearanceId: 'unknown' }) }, 400, 'invalid_character_shape'],
      [{ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...A, extra: true }) }, 400, 'invalid_character_shape'],
      [{ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...A, name: '中'.repeat(6000) }) }, 413, 'body_too_large'],
    ];
    const records = [];
    for (const [request, status, error] of cases) {
      const response = await call(first, '/api/character', request);
      assert.deepEqual(response, { status, body: { error } });
      assert.equal(await readFile(fileA, 'utf8'), before);
      assert.deepEqual((await call(first, '/api/character')).body, { character: B });
      records.push(response);
    }
    return { responses: records, unchangedDiskAndApi: true };
  });
  await check('LF-API-08', async () => {
    const backup = fileA + '.qa-backup';
    await rename(fileA, backup);
    await mkdir(fileA);
    let response;
    try {
      response = await put(first, A);
      assert.deepEqual(response, { status: 500, body: { error: 'local_operation_failed' } });
      assert.deepEqual((await call(first, '/api/character')).body, { character: B });
      assert.deepEqual(JSON.parse(await readFile(backup, 'utf8')), B);
    } finally {
      await rmdir(fileA);
      await rename(backup, fileA);
    }
    assert.equal((await put(first, A)).status, 200);
    await stop(first);
    first = await start(fileA);
    assert.deepEqual((await call(first, '/api/character')).body, { character: A });
    return { response, injection: 'test-only save target replaced by empty directory; original file preserved in backup then restored', successfulRetrySurvivesRestart: true };
  });
} catch (error) {
  process.exitCode = 1;
  console.error(error.message);
} finally {
  for (const child of instances) {
    if (child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  }
  const report = { source: 'Independent local Codex QA; not Grok', at: new Date().toISOString(), timezone: 'Australia/Perth', directory, results };
  const reportPath = join(directory, 'result.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath, results }, null, 2));
}
