import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';
import { migrateAssets } from '../../server/migrate-assets.js';
const character = { name: '九品隔离测试', appearanceId: 'male-reference-0002' };
async function fixture(t, experience = 120) {
  const directory = await mkdtemp(join(tmpdir(), 'ninth-test-'));
  const saveFile = join(directory, 'character.json'); const realmSaveFile = `${saveFile}.realm.json`;
  const clientDirectory = join(directory, 'client'); await mkdir(clientDirectory);
  await writeFile(saveFile, JSON.stringify(character));
  // Any balance other than 120 is an explicit test input, never a production reward.
  await writeFile(realmSaveFile, JSON.stringify({ checkpoint: 'observed-before-first-breakthrough', character,
    revision: 4, experience, counts: { trial: 10, stance: 10, run: 10 }, totalTraining: 30,
    attributes: { attack: 40, defense: 20, health: 2500 }, advanced: true,
    receipts: ['event5', 'martial2', 'training30'].map((conditionId) => ({ id: `first-breakthrough-${conditionId}`, conditionId,
      reward: { id: 'baodian-token-reference', name: '宝典令', amount: 5 } })),
  }));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { saveFile, realmSaveFile, clientDirectory };
}
async function start(t, options) {
  const server = await createApp(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const state = async (base) => (await (await fetch(`${base}/api/breakthrough-state`)).json()).state;
const post = (base, body) => fetch(`${base}/api/breakthrough-state/train`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const train = (base, training, expectedRevision) => post(base, { training, expectedRevision });

test('legacy advanced state projects first stage without read migration; 120 only funds seven trainings', async (t) => {
  const options = await fixture(t); const bytes = await readFile(options.realmSaveFile, 'utf8'); const base = await start(t, options);
  const initial = await state(base);
  assert.deepEqual(initial.ninthTraining.progress, { current: 0, target: 39 }); assert.equal(initial.ninthTraining.stage, 1);
  assert.deepEqual(initial.ninthTraining.training.map(({ count, displayTarget }) => [count, displayTarget]), [[0, 53], [0, 53], [0, 53]]);
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
  for (let i = 0; i < 7; i++) assert.equal((await train(base, ['trial', 'stance', 'run'][i % 3], 4 + i)).status, 200);
  const current = await state(base); assert.equal(current.resource.amount, 8); assert.equal(current.ninthTraining.total, 7);
  const refused = await train(base, 'run', 11); assert.equal(refused.status, 409); assert.deepEqual(await refused.json(), { error: 'realm_experience_insufficient' });
  assert.deepEqual(await state(base), current); assert.deepEqual(current.receipts, initial.receipts);
});

test('observed 10/13/16 counts automatically promote at39 once, with all transaction fields committed together', async (t) => {
  const options = await fixture(t, 920); const base = await start(t, options); const before = await state(base);
  let revision = 4;
  for (const [id, count] of [['trial', 10], ['stance', 13], ['run', 15]]) {
    for (let i = 0; i < count; i++) assert.equal((await train(base, id, revision++)).status, 200);
  }
  const pending = await state(base); assert.equal(pending.ninthTraining.total, 38); assert.equal(pending.ninthTraining.stage, 1);
  assert.deepEqual(pending.realm.attributes, { attack: 60, defense: 33, health: 4150 });
  const bytes = await readFile(options.realmSaveFile, 'utf8');
  await rename(options.realmSaveFile, `${options.realmSaveFile}.backup`); await mkdir(options.realmSaveFile);
  assert.equal((await train(base, 'run', revision)).status, 500); assert.deepEqual(await state(base), pending);
  assert.equal(await readFile(`${options.realmSaveFile}.backup`, 'utf8'), bytes);
  await rm(options.realmSaveFile, { recursive: true }); await rename(`${options.realmSaveFile}.backup`, options.realmSaveFile);
  const responses = await Promise.all([train(base, 'run', revision), train(base, 'run', revision)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const final = await state(base); assert.equal(final.revision, 43); assert.equal(final.resource.amount, 296);
  assert.deepEqual(final.realm.attributes, { attack: 70, defense: 38, health: 4760 });
  assert.equal(final.ninthTraining.stage, 2); assert.equal(final.ninthTraining.supported, true);
  assert.deepEqual(final.ninthTraining.progress, { current: 0, target: 54 });
  assert.deepEqual(final.ninthTraining.training.map(({ count }) => count), [10, 13, 16]);
  assert.deepEqual(final.receipts, before.receipts);
  const persisted = JSON.parse(await readFile(options.realmSaveFile, 'utf8'));
  assert.equal(persisted.totalTraining, 30); assert.deepEqual(persisted.counts, { trial: 10, stance: 10, run: 10 });
  assert.equal((await train(base, 'trial', 43)).status, 200);
  assert.deepEqual((await state(base)).ninthTraining.progress, { current: 1, target: 54 });
});

test('new process restores counts, stage, resources and receipts without default reset', async (t) => {
  const options = await fixture(t); const base = await start(t, options); await train(base, 'run', 4);
  const expected = await state(base); const bytes = await readFile(options.realmSaveFile, 'utf8');
  const env = { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: options.saveFile, REALM_SAVE_FILE: options.realmSaveFile };
  for (const key of ['GEAR_CHECKPOINT', 'MARTIAL_CHECKPOINT', 'REALM_CHECKPOINT', 'MARTIAL_SAVE_FILE', 'GEAR_SAVE_FILE']) delete env[key];
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); } });
  const address = await new Promise((resolve, reject) => {
    let output = ''; child.stdout.on('data', (chunk) => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    child.once('error', reject); child.once('exit', (code) => reject(new Error(`Child exited ${code}`)));
  });
  assert.deepEqual(await state(address), expected); assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
});

test('unadvanced, old training, invalid input and identity mismatch cannot train ninth stage', async (t) => {
  const options = await fixture(t); const saved = JSON.parse(await readFile(options.realmSaveFile, 'utf8')); saved.advanced = false;
  await writeFile(options.realmSaveFile, JSON.stringify(saved)); const base = await start(t, options);
  assert.equal((await state(base)).ninthTraining, null);
  const refused = await train(base, 'trial', 4); assert.equal(refused.status, 409); assert.deepEqual(await refused.json(), { error: 'realm_breakthrough_required' });
  for (const body of [null, { training: 'unknown', expectedRevision: 4 }, { training: 'trial', expectedRevision: -1 }, { training: 'run', expectedRevision: 4, extra: 1 }]) {
    const response = await post(base, body); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_ninth_training' });
  }
  const bytes = await readFile(options.realmSaveFile, 'utf8');
  await fetch(`${base}/api/character`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, name: '另一角色' }) });
  const mismatch = await train(base, 'trial', 4); assert.equal(mismatch.status, 409); assert.deepEqual(await mismatch.json(), { error: 'realm_checkpoint_character_mismatch' });
  assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
  const old = await fixture(t); await rm(old.realmSaveFile);
  const oldBase = await start(t, { ...old, realmCheckpoint: 'observed-before-training' });
  assert.equal((await train(oldBase, 'trial', 0)).status, 404);
});

test('invalid persisted ninth progress fails loading without overwriting data', async (t) => {
  for (const ninthTraining of [{ stage: 2, counts: { trial: 93, stance: 0, run: 0 } }, { stage: 3, counts: { trial: 92, stance: 0, run: 0 } }, null, { stage: 1, counts: { trial: 39, stance: 0, run: 0 } }, { stage: 2, counts: { trial: 1, stance: 0, run: 0 } }, { stage: 1, counts: { trial: -1, stance: 0, run: 0 } }]) {
    const options = await fixture(t); const saved = JSON.parse(await readFile(options.realmSaveFile, 'utf8')); saved.ninthTraining = ninthTraining;
    const bytes = JSON.stringify(saved); await writeFile(options.realmSaveFile, bytes);
    await assert.rejects(createApp(options), /Invalid local realm save/); assert.equal(await readFile(options.realmSaveFile, 'utf8'), bytes);
  }
});


test('second stage reaches93 atomically with no extra promotion attributes and persists in unified ledger', async(t)=>{
  const options=await fixture(t, 880);
  const source=JSON.parse(await readFile(options.realmSaveFile,'utf8'));
  source.ninthTraining={stage:2,counts:{trial:10,stance:13,run:16}};
  source.attributes={attack:70,defense:38,health:4760};
  await writeFile(options.realmSaveFile,JSON.stringify(source));
  await migrateAssets(options.saveFile,options.realmSaveFile);
  const side=await readFile(options.realmSaveFile,'utf8'); const base=await start(t,options);
  let revision=4;
  for(let i=0;i<53;i++) assert.equal((await train(base,'trial',revision++)).status,200);
  const pending=await state(base); assert.deepEqual(pending.ninthTraining.progress,{current:53,target:54});
  assert.equal(pending.ninthTraining.training[0].count,63); // Display denominator is not an invented cap.
  const bytes=await readFile(options.saveFile,'utf8');
  await rename(options.saveFile,options.saveFile+'.bak');await mkdir(options.saveFile);
  assert.equal((await train(base,'run',revision)).status,500);assert.deepEqual(await state(base),pending);
  assert.equal(await readFile(options.saveFile+'.bak','utf8'),bytes);
  await rm(options.saveFile,{recursive:true});await rename(options.saveFile+'.bak',options.saveFile);
  const results=await Promise.all([train(base,'run',revision),train(base,'run',revision)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const final=await state(base);assert.equal(final.ninthTraining.stage,3);assert.equal(final.ninthTraining.supported,false);
  assert.deepEqual(final.ninthTraining.progress,{current:0,target:66});
  assert.deepEqual(final.realm.attributes,{attack:176,defense:38,health:4870});
  assert.equal(final.resource.amount,16);assert.deepEqual(final.receipts,source.receipts);
  const asset=(await (await fetch(base+'/api/assets')).json()).state;
  assert.equal(asset.accounts.at(-1).available,16);assert.equal(asset.entries.length,55);
  const refused=await train(base,'run',revision+1);assert.equal(refused.status,409);
  assert.deepEqual(await refused.json(),{error:'realm_training_not_observed'});
  assert.deepEqual(await state(base),final);assert.equal(await readFile(options.realmSaveFile,'utf8'),side);
  const appUrl=new URL('../../server/app.js',import.meta.url).href;
  const code='import {createApp} from '+JSON.stringify(appUrl)+';const server=await createApp(JSON.parse(process.argv[1]));await new Promise(r=>server.listen(0,"127.0.0.1",r));const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/breakthrough-state");console.log(JSON.stringify(await response.json()));server.close();';
  const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',code,JSON.stringify(options)]);
  assert.deepEqual(JSON.parse(result.stdout).state,final);
});

test('legacy stage2 at39 reads without migration and insufficient balance cannot train',async(t)=>{
  const options=await fixture(t,15);const saved=JSON.parse(await readFile(options.realmSaveFile,'utf8'));
  saved.ninthTraining={stage:2,counts:{trial:10,stance:13,run:16}};
  const bytes=JSON.stringify(saved);await writeFile(options.realmSaveFile,bytes);
  const base=await start(t,options);const initial=await state(base);assert.equal(initial.ninthTraining.supported,true);
  const refused=await train(base,'stance',4);assert.deepEqual(await refused.json(),{error:'realm_experience_insufficient'});
  assert.equal(await readFile(options.realmSaveFile,'utf8'),bytes);
});
