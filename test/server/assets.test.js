import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
import { createApp } from '../../server/app.js';
import { createRealmStore } from '../../server/realm-store.js';
import { migrateAssets } from '../../server/migrate-assets.js';
const character = { name: '统一事务', appearanceId: 'male-reference-0002' };
async function fixture(t, realm = true) {
  const directory = await mkdtemp(join(tmpdir(), 'assets-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const saveFile = join(directory, 'character.json'); const realmSaveFile = saveFile + '.realm.json';
  await writeFile(saveFile, JSON.stringify(character));
  if (realm) await createRealmStore({ file: realmSaveFile, checkpoint: 'observed-before-training', character });
  return { saveFile, realmSaveFile, clientDirectory: directory };
}
async function start(t, options) {
  const server = await createApp(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const get = async (b,p) => (await (await fetch(b+p)).json()).state;
const post = (b,p,body) => fetch(b+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const train = (b,revision) => post(b,'/api/realm-state/train',{training:'trial',expectedRevision:revision});

test('explicit migration is repeatable, preserves source bytes and legacy GET never writes', async(t)=>{
  const o=await fixture(t); const before=await readFile(o.saveFile,'utf8');
  const legacy=await start(t,o); assert.equal((await fetch(legacy+'/api/assets')).status,404);
  assert.equal(await readFile(o.saveFile,'utf8'),before);
  const side=await readFile(o.realmSaveFile,'utf8');
  await migrateAssets(o.saveFile,o.realmSaveFile); const bytes=await readFile(o.saveFile,'utf8');
  await migrateAssets(o.saveFile,o.realmSaveFile); assert.equal(await readFile(o.saveFile,'utf8'),bytes);
  assert.equal(await readFile(o.realmSaveFile,'utf8'),side);
  await assert.rejects(migrateAssets(o.saveFile),/source differs/);
  const base=await start(t,o); const state=await get(base,'/api/assets');
  assert.deepEqual(state.accounts.map(a=>[a.total,a.available]),[[null,0],[null,0],[120,120]]);
  assert.equal(await readFile(o.saveFile,'utf8'),bytes);
});

test('realm concurrent training debits one main transaction and ignores retained sidecar on reload',async(t)=>{
  const o=await fixture(t); await migrateAssets(o.saveFile,o.realmSaveFile);
  const side=await readFile(o.realmSaveFile,'utf8'); const b=await start(t,o);
  const r=await Promise.all([train(b,0),train(b,0)]); assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
  const main=JSON.parse(await readFile(o.saveFile,'utf8'));
  assert.equal(main.domains.realm.experience,108); assert.equal(main.domains.realm.attributes.attack,12);
  assert.equal(main.assets.entries.at(-1).delta,-12); assert.equal(await readFile(o.realmSaveFile,'utf8'),side);
  await writeFile(o.realmSaveFile,'retained legacy source is no longer active');
  const reload=await start(t,o); assert.equal((await get(reload,'/api/realm-state')).resource.amount,108);
  assert.equal((await get(reload,'/api/assets')).accounts.at(-1).available,108);
});

test('main write failure preserves ledger and realm memory then same revision recovers',async(t)=>{
  const o=await fixture(t); await migrateAssets(o.saveFile,o.realmSaveFile); const b=await start(t,o);
  const before=await readFile(o.saveFile,'utf8'); const a=await get(b,'/api/assets'); const r=await get(b,'/api/realm-state');
  await rename(o.saveFile,o.saveFile+'.bak'); await mkdir(o.saveFile);
  assert.equal((await train(b,0)).status,500);
  assert.deepEqual(await get(b,'/api/assets'),a); assert.deepEqual(await get(b,'/api/realm-state'),r);
  assert.equal(await readFile(o.saveFile+'.bak','utf8'),before);
  await rm(o.saveFile,{recursive:true}); await rename(o.saveFile+'.bak',o.saveFile);
  assert.equal((await train(b,0)).status,200);
});

test('first-day claim and known credit lots commit together; no skill balance or unknown total invented',async(t)=>{
  const o=await fixture(t,false); await migrateAssets(o.saveFile); const b=await start(t,o);
  await post(b,'/api/test-commerce/purchase',{productId:'dangjian-three-day-reference',requestId:'a'});
  const paid=await get(b,'/api/test-commerce'); const a=await get(b,'/api/assets');
  const request={orderId:paid.order.id,expectedRevision:1};
  await rename(o.saveFile,o.saveFile+'.bak'); await mkdir(o.saveFile);
  assert.equal((await post(b,'/api/test-commerce/claim-day1',request)).status,500);
  assert.deepEqual(await get(b,'/api/assets'),a); assert.equal((await get(b,'/api/test-commerce')).order.day1Claimed,false);
  await rm(o.saveFile,{recursive:true}); await rename(o.saveFile+'.bak',o.saveFile);
  assert.equal((await post(b,'/api/test-commerce/claim-day1',request)).status,200);
  const assets=await get(b,'/api/assets'); assert.deepEqual(assets.accounts.map(a=>[a.total,a.available]),[[null,40],[null,60]]);
  assert.equal(assets.entries.length,2);
  const before=await readFile(o.saveFile,'utf8');
  assert.equal((await post(b,'/api/test-commerce/claim-day1',{...request,expectedRevision:2})).status,200);
  assert.equal(await readFile(o.saveFile,'utf8'),before);
});

test('migration credits prior grants once and rejects another role; PUT preserves unified data and locks binding',async(t)=>{
  const o=await fixture(t); const b=await start(t,o);
  await post(b,'/api/test-commerce/purchase',{productId:'dangjian-three-day-reference',requestId:'a'});
  const paid=await get(b,'/api/test-commerce');
  await post(b,'/api/test-commerce/claim-day1',{orderId:paid.order.id,expectedRevision:1});
  await migrateAssets(o.saveFile,o.realmSaveFile); const unified=await start(t,o);
  assert.equal((await get(unified,'/api/assets')).accounts[0].available,40);
  const before=JSON.parse(await readFile(o.saveFile,'utf8'));
  await fetch(unified+'/api/character',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...character,name:'changed'})});
  assert.equal((await fetch(unified+'/api/assets')).status,409); assert.equal((await train(unified,0)).status,409);
  const after=JSON.parse(await readFile(o.saveFile,'utf8')); assert.deepEqual(after.assets,before.assets); assert.deepEqual(after.domains,before.domains);
});

test('offline CLI and fresh process recover migrated ninth training with receipts unchanged',async(t)=>{
  const o=await fixture(t,false);
  const realm=await createRealmStore({file:o.realmSaveFile,checkpoint:'observed-before-first-breakthrough',character});
  for (const [index,id] of ['event5','martial2','training30'].entries()) await realm.claimBreakthrough(id,index,()=>character);
  await realm.advanceBreakthrough(3,()=>character);
  const source=await readFile(o.realmSaveFile,'utf8');
  const cli=fileURLToPath(new URL('../../server/migrate-assets.js',import.meta.url));
  await exec(process.execPath,[cli,'--character',o.saveFile,'--realm',o.realmSaveFile]);
  const b=await start(t,o);
  assert.equal((await post(b,'/api/breakthrough-state/train',{training:'run',expectedRevision:4})).status,200);
  const saved=JSON.parse(await readFile(o.saveFile,'utf8'));
  assert.equal(saved.domains.realm.experience,104); assert.equal(saved.domains.realm.attributes.health,2610);
  assert.deepEqual(saved.domains.realm.receipts,JSON.parse(source).receipts);
  const storeUrl=new URL('../../server/store.js',import.meta.url).href;
  const code='import {createCharacterStore} from '+JSON.stringify(storeUrl)+'; console.log(JSON.stringify((await createCharacterStore(process.argv[1])).getAssets()));';
  const result=await exec(process.execPath,['--input-type=module','-e',code,o.saveFile]);
  assert.equal(JSON.parse(result.stdout).accounts.at(-1).available,104);
  assert.equal(await readFile(o.realmSaveFile,'utf8'),source);
});

test('invalid or differently bound migration source leaves original file unchanged',async(t)=>{
  const o=await fixture(t); const before=await readFile(o.saveFile,'utf8');
  const source=JSON.parse(await readFile(o.realmSaveFile,'utf8'));
  source.character.name='another';await writeFile(o.realmSaveFile,JSON.stringify(source));
  await assert.rejects(migrateAssets(o.saveFile,o.realmSaveFile));
  assert.equal(await readFile(o.saveFile,'utf8'),before);
  source.character=character;source.experience=-1;await writeFile(o.realmSaveFile,JSON.stringify(source));
  await assert.rejects(migrateAssets(o.saveFile,o.realmSaveFile));
  assert.equal(await readFile(o.saveFile,'utf8'),before);
});

test('only new first-breakthrough receipts credit unified tokens; historical import and GET never backfill',async(t)=>{
 const o=await fixture(t,false);const realm=await createRealmStore({file:o.realmSaveFile,checkpoint:'observed-before-first-breakthrough',character});
 await realm.claimBreakthrough('event5',0,()=>character);
 await migrateAssets(o.saveFile,o.realmSaveFile);const b=await start(t,o);
 const before=await readFile(o.saveFile,'utf8');assert.equal((await get(b,'/api/assets')).accounts[0].available,0);assert.equal(await readFile(o.saveFile,'utf8'),before);
 assert.equal((await post(b,'/api/breakthrough-state/claim',{conditionId:'event5',expectedRevision:1})).status,200);assert.equal(await readFile(o.saveFile,'utf8'),before);
 assert.equal((await post(b,'/api/breakthrough-state/claim',{conditionId:'martial2',expectedRevision:1})).status,200);
 const state=await get(b,'/api/assets');assert.equal(state.accounts[0].total,null);assert.equal(state.accounts[0].available,5);
 assert.deepEqual(state.entries.at(-1),{id:'realm-reward:first-breakthrough-martial2',assetId:'baodian-token-reference',delta:5,source:'first-breakthrough-claim'});
 const after=await readFile(o.saveFile,'utf8');assert.equal((await post(b,'/api/breakthrough-state/claim',{conditionId:'martial2',expectedRevision:1})).status,409);
 assert.equal((await post(b,'/api/breakthrough-state/claim',{conditionId:'martial2',expectedRevision:2})).status,200);assert.equal(await readFile(o.saveFile,'utf8'),after);
 const reloaded=await start(t,o);assert.deepEqual(await get(reloaded,'/api/assets'),state);
});

test('first-breakthrough reward failure leaves receipt and assets unchanged; concurrent recovery credits once',async(t)=>{
 const o=await fixture(t,false);await createRealmStore({file:o.realmSaveFile,checkpoint:'observed-before-first-breakthrough',character});await migrateAssets(o.saveFile,o.realmSaveFile);const b=await start(t,o);
 const body={conditionId:'event5',expectedRevision:0};const a=await get(b,'/api/assets'),r=await get(b,'/api/breakthrough-state');const source=await readFile(o.realmSaveFile,'utf8');
 const before=await readFile(o.saveFile,'utf8');await rename(o.saveFile,o.saveFile+'.bak');await mkdir(o.saveFile);
 assert.equal((await post(b,'/api/breakthrough-state/claim',body)).status,500);assert.deepEqual(await get(b,'/api/assets'),a);assert.deepEqual(await get(b,'/api/breakthrough-state'),r);assert.equal(await readFile(o.saveFile+'.bak','utf8'),before);
 await rm(o.saveFile,{recursive:true});await rename(o.saveFile+'.bak',o.saveFile);
 const results=await Promise.all([post(b,'/api/breakthrough-state/claim',body),post(b,'/api/breakthrough-state/claim',body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await get(b,'/api/assets')).accounts[0].available,5);assert.equal((await get(b,'/api/breakthrough-state')).receipts.length,1);assert.equal(await readFile(o.realmSaveFile,'utf8'),source);
});

test('new breakthrough reward and commerce grant serialize without lost credit; sidecar stays receipt-only',async(t)=>{
 const o=await fixture(t,false);await createRealmStore({file:o.realmSaveFile,checkpoint:'observed-before-first-breakthrough',character});await migrateAssets(o.saveFile,o.realmSaveFile);const b=await start(t,o);
 await post(b,'/api/test-commerce/purchase',{productId:'dangjian-three-day-reference',requestId:'reward-cross'});const order=(await get(b,'/api/test-commerce')).order;
 const results=await Promise.all([post(b,'/api/breakthrough-state/claim',{conditionId:'event5',expectedRevision:0}),post(b,'/api/test-commerce/claim-day1',{orderId:order.id,expectedRevision:1})]);assert.deepEqual(results.map(r=>r.status),[200,200]);
 const assets=await get(b,'/api/assets');assert.equal(assets.accounts[0].available,45);assert.equal(assets.accounts[0].total,null);assert.equal(assets.revision,2);
 const old=await fixture(t,false);await createRealmStore({file:old.realmSaveFile,checkpoint:'observed-before-first-breakthrough',character});const legacy=await start(t,old);const bytes=await readFile(old.saveFile,'utf8');
 assert.equal((await post(legacy,'/api/breakthrough-state/claim',{conditionId:'event5',expectedRevision:0})).status,200);assert.equal((await fetch(legacy+'/api/assets')).status,404);assert.equal(await readFile(old.saveFile,'utf8'),bytes);
});
