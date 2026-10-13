import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';
const uppercut = 'uppercut-reference';
const sword = 'ruwu-sword-reference';
const character = { name: '人工升级测试', appearanceId: 'male-reference-0002' };
async function fixture(t, progress, single = false) {
  const directory = await mkdtemp(join(tmpdir(), 'martial-upgrade-test-'));
  const saveFile = join(directory, 'character.json'); const martialSaveFile = `${saveFile}.martial.json`;
  const clientDirectory = join(directory, 'client'); await mkdir(clientDirectory);
  await writeFile(saveFile, JSON.stringify(character));
  // Positive material is explicit isolated test input, never a production reward or new checkpoint.
  const saved = single ? { checkpoint: 'observed-before-equip', character, equipped: false, taskComplete: false }
    : { checkpoint: 'observed-event1-before-equip', character, twoEquipped: false };
  if (progress !== undefined) saved.uppercutProgress = progress;
  await writeFile(martialSaveFile, JSON.stringify(saved));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { saveFile, martialSaveFile, clientDirectory };
}
async function start(t, options) {
  const server = await createApp(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const state = async (base) => (await (await fetch(`${base}/api/martial-state`)).json()).state;
const post = (base, path, body) => fetch(`${base}/api/martial-state/${path}`, {
  method: 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});
const upgrade = (base, expectedRevision) => post(base, 'upgrade', { skillId: uppercut, expectedRevision });

test('legacy reads project unknown material and revision zero without migration; unknown and zero differ', async (t) => {
  for (const progress of [undefined, { level: 1 }, { level: 1, materialQuantity: null }, { level: 1, materialQuantity: 0 }]) {
    const options = await fixture(t, progress); const bytes = await readFile(options.martialSaveFile, 'utf8');
    const base = await start(t, options); const current = await state(base);
    assert.equal(current.revision, 0); assert.equal(current.growth.uppercut.material.quantity, progress?.materialQuantity ?? null);
    const response = await upgrade(base, 0); assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: progress?.materialQuantity === 0 ? 'martial_material_insufficient' : 'martial_material_unknown' });
    assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  }
});

test('one atomic upgrade consumes one material, exposes observed level2 attributes, preserves task and catalog', async (t) => {
  const options = await fixture(t, { level: 1, materialQuantity: 2 }); const base = await start(t, options);
  const before = await state(base); const role = await readFile(options.saveFile, 'utf8');
  const catalog = await (await fetch(`${base}/api/reference/martial-catalog`)).text();
  assert.equal((await upgrade(base, 0)).status, 200);
  const after = await state(base);
  assert.equal(after.revision, 1); assert.equal(after.growth.uppercut.level, 2); assert.equal(after.growth.uppercut.material.quantity, 1);
  assert.deepEqual(after.growth.uppercut.attributes, { attack: 40, defense: 20, health: 2000 });
  assert.equal(after.growth.uppercut.upgrade.supported, false); assert.equal(after.owned.find(({ id }) => id === uppercut).level, 2);
  assert.deepEqual(after.task, before.task); assert.deepEqual(after.slots, before.slots);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  for (const [revision, error] of [[0, 'martial_revision_conflict'], [1, 'martial_upgrade_not_observed']]) {
    const response = await upgrade(base, revision); assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error });
  }
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  assert.equal(await readFile(options.saveFile, 'utf8'), role);
  assert.equal(await (await fetch(`${base}/api/reference/martial-catalog`)).text(), catalog);
});

test('every double/single equip mutation preserves growth and increments revision only when changed', async (t) => {
  for (const single of [false, true]) {
    const options = await fixture(t, { level: 1, materialQuantity: 2 }, single); const base = await start(t, options);
    await upgrade(base, 0); const growth = (await state(base)).growth;
    const actions = single ? [['auto-equip'], ['unequip'], ['auto-equip']] : [
      ['auto-equip'], ['unequip-slot', { position: 1 }], ['unequip-slot', { position: 2 }],
      ['equip-skill', { skillId: uppercut }], ['equip-skill', { skillId: sword }], ['auto-equip'],
    ];
    let revision = 1;
    for (const [path, body] of actions) {
      assert.equal((await post(base, path, body)).status, 200);
      const current = await state(base); assert.deepEqual(current.growth, growth); assert.equal(current.revision, ++revision);
      const bytes = await readFile(options.martialSaveFile, 'utf8');
      assert.equal((await post(base, path, body)).status, 200); assert.equal((await state(base)).revision, revision);
      assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
    }
    assert.equal(JSON.parse(await readFile(options.martialSaveFile, 'utf8')).uppercutProgress.materialQuantity, 1);
  }
});

test('same revision concurrent upgrades consume once and failed write can retry without partial level change', async (t) => {
  const options = await fixture(t, { level: 1, materialQuantity: 2 }); const base = await start(t, options);
  const before = await state(base); const bytes = await readFile(options.martialSaveFile, 'utf8');
  await rename(options.martialSaveFile, `${options.martialSaveFile}.backup`); await mkdir(options.martialSaveFile);
  assert.equal((await upgrade(base, 0)).status, 500); assert.deepEqual(await state(base), before);
  assert.equal(await readFile(`${options.martialSaveFile}.backup`, 'utf8'), bytes);
  await rm(options.martialSaveFile, { recursive: true }); await rename(`${options.martialSaveFile}.backup`, options.martialSaveFile);
  const responses = await Promise.all([upgrade(base, 0), upgrade(base, 0)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await state(base)).growth.uppercut.material.quantity, 1); assert.equal((await state(base)).revision, 1);
});

test('new process restores grown skill after legacy boolean save was changed by equip', async (t) => {
  const options = await fixture(t, { level: 1, materialQuantity: 2 }); const base = await start(t, options);
  await upgrade(base, 0); await post(base, 'auto-equip');
  const expected = await state(base); const bytes = await readFile(options.martialSaveFile, 'utf8');
  const env = { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: options.saveFile, MARTIAL_SAVE_FILE: options.martialSaveFile };
  for (const key of ['GEAR_CHECKPOINT', 'MARTIAL_CHECKPOINT', 'REALM_CHECKPOINT', 'REALM_SAVE_FILE', 'GEAR_SAVE_FILE']) delete env[key];
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); } });
  const address = await new Promise((resolve, reject) => {
    let output = ''; child.stdout.on('data', (chunk) => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    child.once('error', reject); child.once('exit', (code) => reject(new Error(`Child exited ${code}`)));
  });
  assert.deepEqual(await state(address), expected); assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
});

test('invalid growth, invalid requests and mismatched identity are rejected without replacement', async (t) => {
  for (const progress of [null, { level: 3, materialQuantity: 1 }, { level: 1, materialQuantity: -1 }, { level: 1, materialQuantity: 0.5 }, { level: 1, materialQuantity: 1, extra: true }]) {
    const options = await fixture(t, progress); const bytes = await readFile(options.martialSaveFile, 'utf8');
    await assert.rejects(createApp(options), /Invalid local martial save/); assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
  }
  const options = await fixture(t, { level: 1, materialQuantity: 2 }); const base = await start(t, options);
  const bytes = await readFile(options.martialSaveFile, 'utf8');
  for (const body of [null, { skillId: sword, expectedRevision: 0 }, { skillId: uppercut, expectedRevision: -1 }, { skillId: uppercut, expectedRevision: 0, extra: 1 }]) {
    const response = await post(base, 'upgrade', body); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_martial_upgrade' });
  }
  await fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '另一角色' }) });
  const mismatch = await upgrade(base, 0); assert.equal(mismatch.status, 409); assert.deepEqual(await mismatch.json(), { error: 'martial_checkpoint_character_mismatch' });
  assert.equal(await readFile(options.martialSaveFile, 'utf8'), bytes);
});
