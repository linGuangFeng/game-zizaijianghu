import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../../server/app.js';
import { createRealmStore } from '../../server/realm-store.js';
import { migrateAssets } from '../../server/migrate-assets.js';
const character={name:'统一武学',appearanceId:'male-reference-0002'};
async function fixture(t,quantity=2){
  const directory=await mkdtemp(join(tmpdir(),'martial-assets-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const saveFile=join(directory,'character.json'),realmSaveFile=saveFile+'.realm.json',martialSaveFile=saveFile+'.martial.json';
  await writeFile(saveFile,JSON.stringify(character));
  await createRealmStore({file:realmSaveFile,checkpoint:'observed-before-training',character});
  // Explicit artificial material input; no production resource grant.
  await writeFile(martialSaveFile,JSON.stringify({checkpoint:'observed-event1-before-equip',character,twoEquipped:false,uppercutProgress:{level:1,materialQuantity:quantity}}));
  return{saveFile,realmSaveFile,martialSaveFile,clientDirectory:directory};
}
async function start(t,o){const s=await createApp(o);s.listen(0,'127.0.0.1');await once(s,'listening');t.after(()=>new Promise(r=>s.close(r)));return 'http://127.0.0.1:'+s.address().port;}
const get=async(b,p)=>(await(await fetch(b+p)).json()).state;
const post=(b,p,body)=>fetch(b+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const upgrade=(b,rev)=>post(b,'/api/martial-state/upgrade',{skillId:'uppercut-reference',expectedRevision:rev});
const material=(a)=>a.accounts.find(x=>x.id==='uppercut-material-reference');

test('incremental martial migration preserves consumed realm and is hash-repeatable without rewriting',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile,o.realmSaveFile);
 const b=await start(t,o);await post(b,'/api/realm-state/train',{training:'trial',expectedRevision:0});
 const previous=JSON.parse(await readFile(o.saveFile,'utf8'));
 await migrateAssets(o.saveFile,undefined,o.martialSaveFile);
 const migrated=JSON.parse(await readFile(o.saveFile,'utf8'));assert.deepEqual(migrated.domains.realm,previous.domains.realm);
 assert.equal(migrated.domains.realm.experience,108);
 const bytes=await readFile(o.saveFile,'utf8');await migrateAssets(o.saveFile,o.realmSaveFile,o.martialSaveFile);
 assert.equal(await readFile(o.saveFile,'utf8'),bytes);
 await writeFile(o.martialSaveFile,(await readFile(o.martialSaveFile,'utf8'))+' ');
 await assert.rejects(migrateAssets(o.saveFile,undefined,o.martialSaveFile),/source differs/);
 assert.equal(await readFile(o.saveFile,'utf8'),bytes);
});

test('material upgrade failure is atomic and concurrent retry consumes once; sidecar stops writing',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile,o.realmSaveFile,o.martialSaveFile);const b=await start(t,o);
 const side=await readFile(o.martialSaveFile,'utf8');const before=await readFile(o.saveFile,'utf8');
 const a=await get(b,'/api/assets'),m=await get(b,'/api/martial-state');
 await rename(o.saveFile,o.saveFile+'.bak');await mkdir(o.saveFile);
 assert.equal((await upgrade(b,0)).status,500);assert.deepEqual(await get(b,'/api/assets'),a);assert.deepEqual(await get(b,'/api/martial-state'),m);
 assert.equal(await readFile(o.saveFile+'.bak','utf8'),before);
 await rm(o.saveFile,{recursive:true});await rename(o.saveFile+'.bak',o.saveFile);
 const responses=await Promise.all([upgrade(b,0),upgrade(b,0)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 assert.deepEqual(material(await get(b,'/api/assets')),{id:'uppercut-material-reference',name:'上勾拳',total:1,available:1});
 assert.equal((await get(b,'/api/martial-state')).growth.uppercut.level,2);
 assert.equal(await readFile(o.martialSaveFile,'utf8'),side);
 await writeFile(o.martialSaveFile,'retained inactive sidecar');
 const code='import {createApp} from '+JSON.stringify(new URL('../../server/app.js',import.meta.url).href)+';const s=await createApp(JSON.parse(process.argv[1]));await new Promise(r=>s.listen(0,"127.0.0.1",r));console.log(JSON.stringify(await(await fetch("http://127.0.0.1:"+s.address().port+"/api/martial-state")).json()));s.close();';
 const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',code,JSON.stringify(o)]);
 assert.equal(JSON.parse(result.stdout).state.growth.uppercut.material.quantity,1);
});

test('unknown and zero remain distinct and cannot upgrade',async(t)=>{
 for(const quantity of [null,0]){
 const o=await fixture(t,quantity);await migrateAssets(o.saveFile,undefined,o.martialSaveFile);const b=await start(t,o);
 assert.equal(material(await get(b,'/api/assets')).available,quantity);assert.equal(material(await get(b,'/api/assets')).total,quantity);
 const bytes=await readFile(o.saveFile,'utf8');const response=await upgrade(b,0);
 assert.equal(response.status,409);assert.equal((await response.json()).error,quantity===null?'martial_material_unknown':'martial_material_insufficient');
 assert.equal(await readFile(o.saveFile,'utf8'),bytes);
 }
});

test('realm training, martial upgrade and commerce claim share one queue without losing domains',async(t)=>{
 const o=await fixture(t);await migrateAssets(o.saveFile,o.realmSaveFile,o.martialSaveFile);const b=await start(t,o);
 await post(b,'/api/test-commerce/purchase',{productId:'dangjian-three-day-reference',requestId:'cross'});
 const order=(await get(b,'/api/test-commerce')).order;
 const results=await Promise.all([upgrade(b,0),post(b,'/api/realm-state/train',{training:'run',expectedRevision:0}),post(b,'/api/test-commerce/claim-day1',{orderId:order.id,expectedRevision:1})]);
 assert.deepEqual(results.map(r=>r.status),[200,200,200]);
 const main=JSON.parse(await readFile(o.saveFile,'utf8'));assert.equal(main.domains.realm.experience,108);assert.equal(main.domains.martial.uppercutProgress.level,2);assert.equal(main.commerce.grants.length,3);
 const assets=await get(b,'/api/assets');assert.equal(material(assets).available,1);assert.equal(assets.accounts[0].available,40);
 await post(b,'/api/martial-state/auto-equip');const afterEquip=await readFile(o.saveFile,'utf8');
 await post(b,'/api/martial-state/auto-equip');assert.equal(await readFile(o.saveFile,'utf8'),afterEquip);
 assert.deepEqual(await get(b,'/api/assets'),assets);
});

test('martial migration binding rejects without write; role changes preserve unified assets and reject actions',async(t)=>{
 const o=await fixture(t);const source=JSON.parse(await readFile(o.martialSaveFile,'utf8'));source.character={...character,name:'other'};
 await writeFile(o.martialSaveFile,JSON.stringify(source));const bytes=await readFile(o.saveFile,'utf8');
 await assert.rejects(migrateAssets(o.saveFile,undefined,o.martialSaveFile));assert.equal(await readFile(o.saveFile,'utf8'),bytes);
 source.character=character;await writeFile(o.martialSaveFile,JSON.stringify(source));await migrateAssets(o.saveFile,undefined,o.martialSaveFile);
 const b=await start(t,o);await fetch(b+'/api/character',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...character,name:'changed'})});
 assert.equal((await upgrade(b,0)).status,409);assert.equal((await fetch(b+'/api/assets')).status,409);
});
