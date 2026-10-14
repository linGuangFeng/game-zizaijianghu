import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';
import { createRealmStore } from '../../server/realm-store.js';
import { migrateAssets } from '../../server/migrate-assets.js';
const character={name:'装备统一事务',appearanceId:'male-reference-0002'};
const purple='bloodwar-blade-purple',gold='bloodwar-blade-gold';
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'gear-unified-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const saveFile=join(directory,'character.json'),realmSaveFile=saveFile+'.realm.json',martialSaveFile=saveFile+'.martial.json',gearSaveFile=saveFile+'.gear.json';
 await writeFile(saveFile,JSON.stringify(character));
 await createRealmStore({file:realmSaveFile,checkpoint:'observed-before-training',character});
 // Known material quantity is an isolated artificial test input, not a grant.
 await writeFile(martialSaveFile,JSON.stringify({checkpoint:'observed-before-equip',character,equipped:false,taskComplete:false,uppercutProgress:{level:1,materialQuantity:2}}));
 await writeFile(gearSaveFile,JSON.stringify({checkpoint:'observed-event5-blade',character,revision:3,equippedId:purple}));
 return{saveFile,realmSaveFile,martialSaveFile,gearSaveFile,clientDirectory:directory};
}
async function start(t,o){const s=await createApp(o);s.listen(0,'127.0.0.1');await once(s,'listening');t.after(()=>new Promise(r=>s.close(r)));return 'http://127.0.0.1:'+s.address().port;}
const get=async(b,p)=>(await(await fetch(b+p)).json()).state;
const post=(b,p,body)=>fetch(b+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const equip=(b,itemId,expectedRevision)=>post(b,'/api/gear-state/equip',{itemId,expectedRevision});

test('gear CLI incremental migration preserves consumed realm and exact gear; repeat is zero-write',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile,o.realmSaveFile,o.martialSaveFile);const b=await start(t,o);
 await post(b,'/api/realm-state/train',{training:'trial',expectedRevision:0});
 const prior=JSON.parse(await readFile(o.saveFile,'utf8'));
 const cli=fileURLToPath(new URL('../../server/migrate-assets.js',import.meta.url));
 await promisify(execFile)(process.execPath,[cli,'--character',o.saveFile,'--gear',o.gearSaveFile]);
 const saved=JSON.parse(await readFile(o.saveFile,'utf8'));assert.deepEqual(saved.domains.realm,prior.domains.realm);assert.deepEqual(saved.domains.martial,prior.domains.martial);assert.deepEqual(saved.assets,prior.assets);assert.equal(saved.domains.gear.equippedId,purple);assert.match(saved.migration.gearDigest,/^[0-9a-f]{64}$/);
 const bytes=await readFile(o.saveFile,'utf8');await migrateAssets(o.saveFile,undefined,undefined,o.gearSaveFile);assert.equal(await readFile(o.saveFile,'utf8'),bytes);
 const reloaded=await start(t,o);assert.equal((await get(reloaded,'/api/gear-state')).revision,3);assert.equal(await readFile(o.saveFile,'utf8'),bytes);
});

test('gear write failure rolls back memory and disk; no-op and stale revision never add assets',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile,o.realmSaveFile,o.martialSaveFile,o.gearSaveFile);const b=await start(t,o);
 const assets=await get(b,'/api/assets'),before=await get(b,'/api/gear-state'),bytes=await readFile(o.saveFile,'utf8'),source=await readFile(o.gearSaveFile,'utf8');
 await rename(o.saveFile,o.saveFile+'.bak');await mkdir(o.saveFile);
 assert.equal((await equip(b,gold,3)).status,500);assert.deepEqual(await get(b,'/api/gear-state'),before);assert.deepEqual(await get(b,'/api/assets'),assets);assert.equal(await readFile(o.saveFile+'.bak','utf8'),bytes);
 await rm(o.saveFile,{recursive:true});await rename(o.saveFile+'.bak',o.saveFile);
 const responses=await Promise.all([equip(b,gold,3),equip(b,gold,3)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.deepEqual(await get(b,'/api/assets'),assets);
 const after=await readFile(o.saveFile,'utf8');assert.equal((await post(b,'/api/gear-state/auto-equip',{expectedRevision:4})).status,200);assert.equal(await readFile(o.saveFile,'utf8'),after);assert.equal(await readFile(o.gearSaveFile,'utf8'),source);
 await writeFile(o.gearSaveFile,'inactive old source');
 const code='import {createApp} from '+JSON.stringify(new URL('../../server/app.js',import.meta.url).href)+';const s=await createApp(JSON.parse(process.argv[1]));await new Promise(r=>s.listen(0,"127.0.0.1",r));console.log(JSON.stringify(await(await fetch("http://127.0.0.1:"+s.address().port+"/api/gear-state")).json()));s.close();';
 const child=await promisify(execFile)(process.execPath,['--input-type=module','-e',code,JSON.stringify(o)]);assert.deepEqual(JSON.parse(child.stdout).state,await get(b,'/api/gear-state'));
});

test('gear realm martial and commerce mutations serialize without overwriting any domain',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile,o.realmSaveFile,o.martialSaveFile,o.gearSaveFile);const b=await start(t,o);
 await post(b,'/api/test-commerce/purchase',{productId:'dangjian-three-day-reference',requestId:'cross-gear'});const order=(await get(b,'/api/test-commerce')).order;
 const responses=await Promise.all([equip(b,gold,3),post(b,'/api/realm-state/train',{training:'run',expectedRevision:0}),post(b,'/api/martial-state/upgrade',{skillId:'uppercut-reference',expectedRevision:0}),post(b,'/api/test-commerce/claim-day1',{orderId:order.id,expectedRevision:1})]);
 assert.deepEqual(responses.map(r=>r.status),[200,200,200,200]);const saved=JSON.parse(await readFile(o.saveFile,'utf8'));
 assert.equal(saved.domains.gear.equippedId,gold);assert.equal(saved.domains.realm.experience,108);assert.equal(saved.domains.martial.uppercutProgress.materialQuantity,1);assert.equal(saved.commerce.grants.length,3);assert.equal(saved.assets.revision,4);
});

test('multi-domain migration errors do not partially append martial; existing gear hash cannot overwrite',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile,o.realmSaveFile,undefined,o.gearSaveFile);
 const before=await readFile(o.saveFile,'utf8');await writeFile(o.gearSaveFile,(await readFile(o.gearSaveFile,'utf8'))+' ');
 await assert.rejects(migrateAssets(o.saveFile,undefined,o.martialSaveFile,o.gearSaveFile),/Gear migration source differs/);assert.equal(await readFile(o.saveFile,'utf8'),before);
 const another=await fixture(t);await migrateAssets(another.saveFile,another.realmSaveFile);const original=await readFile(another.saveFile,'utf8');
 const gear=JSON.parse(await readFile(another.gearSaveFile,'utf8'));gear.character={...character,name:'other'};await writeFile(another.gearSaveFile,JSON.stringify(gear));
 await assert.rejects(migrateAssets(another.saveFile,undefined,another.martialSaveFile,another.gearSaveFile));assert.equal(await readFile(another.saveFile,'utf8'),original);
 await assert.rejects(migrateAssets(another.saveFile,undefined,undefined,another.saveFile),/separate file/);assert.equal(await readFile(another.saveFile,'utf8'),original);
});

test('legacy gear remains sidecar until selected and migrated identity mismatch preserves gear',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile);const b=await start(t,o);const main=await readFile(o.saveFile,'utf8');
 assert.equal((await equip(b,gold,3)).status,200);assert.equal(await readFile(o.saveFile,'utf8'),main);assert.equal(JSON.parse(await readFile(o.gearSaveFile,'utf8')).equippedId,gold);
 await migrateAssets(o.saveFile,undefined,undefined,o.gearSaveFile);const unified=await start(t,o);const before=JSON.parse(await readFile(o.saveFile,'utf8')).domains.gear;
 await fetch(unified+'/api/character',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...character,name:'changed'})});
 const response=await equip(unified,purple,4);assert.equal(response.status,409);assert.equal((await response.json()).error,'gear_checkpoint_character_mismatch');assert.deepEqual(JSON.parse(await readFile(o.saveFile,'utf8')).domains.gear,before);
});
