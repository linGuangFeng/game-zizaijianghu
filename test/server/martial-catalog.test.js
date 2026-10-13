import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createApp } from '../../server/app.js';

async function setup(t, character) {
  const directory = await mkdtemp(join(tmpdir(), 'martial-catalog-test-'));
  const saveFile = join(directory, 'character.json');
  const clientDirectory = join(directory, 'client');
  await mkdir(clientDirectory);
  if (character) await writeFile(saveFile, JSON.stringify(character));
  const server = await createApp({ saveFile, clientDirectory });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, saveFile };
}

test('martial catalog exposes only observed display data without creating a character', async (t) => {
  const { base, saveFile } = await setup(t);
  const response = await fetch(`${base}/api/reference/martial-catalog`);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.kind, 'reference-catalog');
  assert.deepEqual(catalog.observedSlots, [1, 2, 3, 4, 5, 6].map((position) => ({
    position, visibleState: position <= 3 ? 'plus-alert' : 'locked',
  })));
  assert.equal(catalog.entries.length, 1);
  const uppercut = catalog.entries[0];
  assert.equal(uppercut.id, 'uppercut-reference');
  assert.equal(uppercut.name, '上勾拳');
  assert.equal(uppercut.cooldownText, '7.3秒');
  assert.equal(uppercut.levelText, '1');
  assert.equal(uppercut.starsText, '0星');
  assert.equal(uppercut.descriptionComplete, false);
  assert.deepEqual(uppercut.attributes.map((row) => row.text), ['20+20', '10+10', '1000+1000']);
  assert.equal('damage' in uppercut, false);
  assert.equal('equipped' in uppercut, false);
  assert.equal((await fetch(`${base}/api/character`)).status, 404);
  await assert.rejects(access(saveFile), { code: 'ENOENT' });
});

test('catalog reads and refused writes preserve existing character storage byte-for-byte', async (t) => {
  const character = { name: '已有本地角色', appearanceId: 'male-reference-0002' };
  const { base, saveFile } = await setup(t, character);
  const before = await readFile(saveFile, 'utf8');
  const first = await (await fetch(`${base}/api/reference/martial-catalog`)).json();
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const response = await fetch(`${base}/api/reference/martial-catalog`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [] }),
    });
    assert.equal(response.status, 405);
  }
  assert.deepEqual(await (await fetch(`${base}/api/reference/martial-catalog`)).json(), first);
  assert.deepEqual(await (await fetch(`${base}/api/character`)).json(), { character });
  assert.equal(await readFile(saveFile, 'utf8'), before);
});