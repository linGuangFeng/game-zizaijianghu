import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';

const character = { name: ' 江湖旅人🗡 ', appearanceId: 'female-reference-0003' };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'zizaijianghu-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const clientDirectory = join(directory, 'client');
  await mkdir(clientDirectory);
  const saveFile = join(directory, 'data', 'character.json');
  return { directory, clientDirectory, saveFile };
}
async function start(t, options) {
  const app = await createApp(options);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((resolve) => app.close(resolve)));
  return `http://127.0.0.1:${app.address().port}`;
}
const put = (base, value) => fetch(`${base}/api/character`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
});

test('health and evidence options; save is idempotent and preserves the provided name', async (t) => {
  const options = await fixture(t);
  const base = await start(t, options);
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', scope: 'local-foundation' });
  assert.equal((await fetch(`${base}/api/character`)).status, 404);
  const appearances = await (await fetch(`${base}/api/appearance-options`)).json();
  assert.deepEqual(appearances.options.map((x) => x.id), ['male-reference-0002', 'female-reference-0003']);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await put(base, character);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { character });
  }
  assert.deepEqual(await (await fetch(`${base}/api/character`)).json(), { character });
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), character);
});

test('invalid requests leave disk and readable state unchanged', async (t) => {
  const options = await fixture(t);
  const base = await start(t, options);
  await put(base, character);
  const original = await readFile(options.saveFile, 'utf8');
  for (const value of [null, [], { ...character, appearanceId: 'unobserved-option' },
    { ...character, name: 42 }, { ...character, token: 'unexpected-field' }]) {
    assert.equal((await put(base, value)).status, 400);
  }
  assert.equal((await fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(`${base}/api/character`, { method: 'PUT', body: '{}' })).status, 415);
  assert.equal((await put(base, { ...character, name: 'a'.repeat(16384) })).status, 413);
  assert.equal((await fetch(`${base}/api/character`, { method: 'DELETE' })).status, 405);
  assert.equal(await readFile(options.saveFile, 'utf8'), original);
  assert.deepEqual(await (await fetch(`${base}/api/character`)).json(), { character });
});

test('write failure preserves last successful state and subsequent requests can recover', async (t) => {
  const options = await fixture(t);
  const base = await start(t, options);
  await put(base, character);
  await rm(options.saveFile);
  await mkdir(options.saveFile); // Force atomic replacement to fail without permission assumptions.
  assert.equal((await put(base, { ...character, name: '未保存' })).status, 500);
  assert.deepEqual(await (await fetch(`${base}/api/character`)).json(), { character });
  await rm(options.saveFile, { recursive: true });
  assert.equal((await put(base, character)).status, 200);
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), character);
});

async function processServer(saveFile) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], {
    env: { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: saveFile },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server startup timeout')); }, 10000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Server exited during startup')); });
    child.stdout.on('data', (data) => {
      const url = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) { clearTimeout(timeout); resolve(url); }
    });
  });
  return { base, async stop() { if (child.exitCode !== null || child.signalCode !== null) return; const exited = once(child, 'exit'); child.kill(); await exited; } };
}

test('a separate Node process reads the saved character after a full process restart', async (t) => {
  const { saveFile } = await fixture(t);
  const first = await processServer(saveFile);
  t.after(() => first.stop());
  assert.equal((await put(first.base, character)).status, 200);
  await first.stop();
  const second = await processServer(saveFile);
  t.after(() => second.stop());
  assert.deepEqual(await (await fetch(`${second.base}/api/character`)).json(), { character });
});

function rawGet(base, path) {
  return new Promise((resolve, reject) => {
    const req = request(new URL(base), { path }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('only client files are served; encoded traversal and external junctions are refused', async (t) => {
  const options = await fixture(t);
  await writeFile(join(options.clientDirectory, 'index.html'), '<h1>local fixture</h1>');
  await writeFile(join(options.directory, 'private.txt'), 'must-not-be-served');
  const base = await start(t, options);
  assert.equal(await (await fetch(base)).text(), '<h1>local fixture</h1>');
  for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/..%5cprivate.txt', '/server/index.js', '/%00']) {
    const response = await rawGet(base, path);
    assert.equal(response.status, 404, path);
    assert.ok(!response.body.includes('must-not-be-served'));
  }
  await symlink(options.directory, join(options.clientDirectory, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await fetch(`${base}/outside/private.txt`)).status, 404);
});

test('invalid existing save fails startup rather than overwriting it', async (t) => {
  const options = await fixture(t);
  await mkdir(join(options.directory, 'data'));
  await writeFile(options.saveFile, 'broken-save');
  await assert.rejects(createApp(options));
  assert.equal(await readFile(options.saveFile, 'utf8'), 'broken-save');
});
test('split UTF-8 request chunks preserve Chinese names exactly', async (t) => {
  const options = await fixture(t);
  const base = await start(t, options);
  const value = { name: '中文姓名', appearanceId: 'male-reference-0002' };
  const body = Buffer.from(JSON.stringify(value));
  const split = body.indexOf(Buffer.from('中')) + 1;
  const result = await new Promise((resolve, reject) => {
    const req = request(`${base}/api/character`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.write(body.subarray(0, split));
    setTimeout(() => req.end(body.subarray(split)), 20);
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.value, { character: value });
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), value);
});