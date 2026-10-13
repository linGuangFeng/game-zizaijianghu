import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';
const character = { name: '本地支付测试', appearanceId: 'male-reference-0002' };
const productId = 'dangjian-three-day-reference';
async function fixture(t, withRole = true) {
  const directory = await mkdtemp(join(tmpdir(), 'commerce-test-')); const saveFile = join(directory, 'character.json');
  const clientDirectory = join(directory, 'client'); await mkdir(clientDirectory);
  if (withRole) await writeFile(saveFile, JSON.stringify(character));
  t.after(() => rm(directory, { recursive: true, force: true })); return { directory, saveFile, clientDirectory };
}
async function start(t, options) {
  const server = await createApp(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve))); return `http://127.0.0.1:${server.address().port}`;
}
const state = async (base) => (await (await fetch(`${base}/api/test-commerce`)).json()).state;
const post = (base, path, body) => fetch(`${base}/api/test-commerce/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const buy = (base, requestId = 'test-request-1') => post(base, 'purchase', { productId, requestId });
const claim = (base, orderId, expectedRevision) => post(base, 'claim-day1', { orderId, expectedRevision });
const rolePut = (base, role) => fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(role) });

test('legacy reads do not migrate or give balances; missing role cannot purchase', async (t) => {
  const options = await fixture(t); const bytes = await readFile(options.saveFile, 'utf8'); const base = await start(t, options);
  const initial = await state(base); assert.equal(initial.revision, 0); assert.equal(initial.order, null); assert.deepEqual(initial.grants, []);
  assert.deepEqual(initial.product.price, { currency: 'CNY', minorUnits: 600 }); assert.equal('wallet' in initial, false);
  assert.equal(await readFile(options.saveFile, 'utf8'), bytes);
  assert.deepEqual(await (await fetch(`${base}/api/character`)).json(), { character });
  const missing = await fixture(t, false); const empty = await start(t, missing);
  assert.equal((await buy(empty)).status, 404); assert.equal((await fetch(`${empty}/api/test-commerce`)).status, 404);
});

test('local paid order and first-day grants commit separately in character file and preserve other stores', async (t) => {
  const options = await fixture(t); const base = await start(t, { ...options, martialCheckpoint: 'observed-before-equip', realmCheckpoint: 'observed-before-training', gearCheckpoint: 'observed-event5-blade' });
  const files = ['.martial.json', '.realm.json', '.gear.json'].map((suffix) => options.saveFile + suffix);
  const before = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  assert.equal((await buy(base)).status, 200); const paid = await state(base);
  assert.equal(paid.order.status, 'paid'); assert.equal(paid.order.paymentMode, 'local-test'); assert.equal(paid.revision, 1);
  assert.equal(paid.canClaimDay1, true); assert.deepEqual(paid.grants, []);
  assert.equal((await claim(base, paid.order.id, 1)).status, 200); const done = await state(base);
  assert.equal(done.revision, 2); assert.equal(done.order.day1Claimed, true); assert.equal(done.canClaimDay1, false);
  assert.deepEqual(done.grants.map(({ reward }) => reward), [
    { id: 'dangjian-skill-reference', name: '荡剑式', quantity: 1 },
    { id: 'baodian-token-reference', name: '宝典令', quantity: 40 },
    { id: 'yuanbao-reference', name: '元宝', quantity: 60 },
  ]);
  assert.equal(new Set(done.grants.map(({ id }) => id)).size, 3);
  const saved = JSON.parse(await readFile(options.saveFile, 'utf8')); assert.equal(saved.schemaVersion, 1); assert.deepEqual(saved.character, character);
  assert.deepEqual(await Promise.all(files.map((file) => readFile(file, 'utf8'))), before);
  assert.deepEqual((await readdir(options.directory)).sort(), ['character.json', 'character.json.gear.json', 'character.json.martial.json', 'character.json.realm.json', 'client'].sort());
});

test('concurrent purchase creates one order; concurrent claim commits once; retries never duplicate', async (t) => {
  const options = await fixture(t); const base = await start(t, options);
  const responses = await Promise.all([buy(base, 'request-a'), buy(base, 'request-b')]);
  const first = (await responses[0].json()).state; const second = (await responses[1].json()).state;
  assert.equal(first.order.id, second.order.id); assert.equal(second.revision, 1);
  const claims = await Promise.all([claim(base, first.order.id, 1), claim(base, first.order.id, 1)]);
  assert.deepEqual(claims.map((response) => response.status).sort(), [200, 409]);
  const bytes = await readFile(options.saveFile, 'utf8');
  await rename(options.saveFile, `${options.saveFile}.backup`); await mkdir(options.saveFile);
  assert.equal((await buy(base, 'after-refresh')).status, 200); assert.equal((await claim(base, first.order.id, 2)).status, 200);
  assert.equal(await readFile(`${options.saveFile}.backup`, 'utf8'), bytes); assert.equal((await state(base)).grants.length, 3);
});

test('failed purchase or claim preserves memory and saved state; retry recovers the same transaction', async (t) => {
  const options = await fixture(t); const base = await start(t, options);
  for (const phase of ['purchase', 'claim']) {
    const before = await state(base); const bytes = await readFile(options.saveFile, 'utf8');
    await rename(options.saveFile, `${options.saveFile}.backup`); await mkdir(options.saveFile);
    const action = () => phase === 'purchase' ? buy(base) : claim(base, before.order.id, before.revision);
    assert.equal((await action()).status, 500); assert.deepEqual(await state(base), before);
    assert.equal(await readFile(`${options.saveFile}.backup`, 'utf8'), bytes);
    await rm(options.saveFile, { recursive: true }); await rename(`${options.saveFile}.backup`, options.saveFile);
    assert.equal((await action()).status, 200);
  }
});

test('character writes preserve commerce; identity mismatch refuses actions without erasing orders', async (t) => {
  const options = await fixture(t); const base = await start(t, options); await buy(base);
  const paid = await state(base);
  await Promise.all([rolePut(base, character), claim(base, paid.order.id, 1)]);
  const done = await state(base); assert.equal(done.grants.length, 3);
  assert.deepEqual(await (await fetch(`${base}/api/character`)).json(), { character });
  const savedCommerce = JSON.parse(await readFile(options.saveFile, 'utf8')).commerce;
  await rolePut(base, { ...character, name: '另一姓名' });
  assert.equal((await buy(base)).status, 409); assert.equal((await claim(base, paid.order.id, 2)).status, 409);
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')).commerce, savedCommerce);
  await rolePut(base, character); assert.deepEqual(await state(base), done);
});

test('new process reads original character shape and restores paid claim with no repeated grants', async (t) => {
  const options = await fixture(t); const base = await start(t, options); await buy(base); const paid = await state(base); await claim(base, paid.order.id, 1);
  const expected = await state(base); const env = { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: options.saveFile };
  for (const key of ['GEAR_CHECKPOINT', 'MARTIAL_CHECKPOINT', 'REALM_CHECKPOINT', 'REALM_SAVE_FILE', 'MARTIAL_SAVE_FILE', 'GEAR_SAVE_FILE']) delete env[key];
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); } });
  const address = await new Promise((resolve, reject) => {
    let output = ''; child.stdout.on('data', (chunk) => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    child.once('error', reject); child.once('exit', (code) => reject(new Error(`Child exited ${code}`)));
  });
  assert.deepEqual(await state(address), expected); assert.deepEqual(await (await fetch(`${address}/api/character`)).json(), { character });
});

test('bad inputs, wrong order and corrupt paid data are rejected without rewriting', async (t) => {
  const options = await fixture(t); const base = await start(t, options);
  const noOrder = await claim(base, 'missing', 0); assert.equal(noOrder.status, 409); assert.deepEqual(await noOrder.json(), { error: 'commerce_order_required' });
  for (const body of [null, { productId: 'unknown', requestId: 'x' }, { productId, requestId: '' }, { productId, requestId: 'x', extra: 1 }]) {
    const response = await post(base, 'purchase', body); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_commerce_purchase' });
  }
  await buy(base); const bytes = await readFile(options.saveFile, 'utf8');
  assert.equal((await claim(base, 'wrong', 1)).status, 409);
  assert.equal((await post(base, 'claim-day1', { orderId: (await state(base)).order.id, expectedRevision: -1 })).status, 400);
  assert.equal(await readFile(options.saveFile, 'utf8'), bytes);
  const corrupt = JSON.parse(bytes); corrupt.commerce.order.day1Claimed = true;
  await writeFile(options.saveFile, JSON.stringify(corrupt)); await assert.rejects(createApp(options), /Invalid local character save/);
  assert.deepEqual(JSON.parse(await readFile(options.saveFile, 'utf8')), corrupt);
});
