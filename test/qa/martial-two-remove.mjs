import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, access, rename, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const parent = join(root, '.local/independent-qa');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'two-remove-'));
const file = join(directory, 'character.json');
const results = [];
let processHandle;
let url;
async function start(checkpoint = '') {
  const previous = process.env.MARTIAL_CHECKPOINT; delete process.env.MARTIAL_CHECKPOINT;
  processHandle = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: '0', CHARACTER_SAVE_FILE: file, MARTIAL_SAVE_FILE: file + '.martial.json', ...(checkpoint ? { MARTIAL_CHECKPOINT: checkpoint } : {}) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (previous !== undefined) process.env.MARTIAL_CHECKPOINT = previous;
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
const sidecar=file+'.martial.json';
const character={name:'双槽卸下独立侠',appearanceId:'male-reference-0002'};
const original=JSON.stringify(character,null,2)+'\n';
const checkpoint='observed-event1-before-equip';
const upper='uppercut-reference', sword='ruwu-sword-reference';
const statePath='/api/martial-state', removePath=statePath+'/unequip-slot';
const state=async()=>(await call(statePath)).body.state;
const equip=async()=>call(statePath+'/auto-equip',{method:'POST'});
const remove=async position=>call(removePath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({position})});
async function assertState(slots,owned){
 const actual=await state();
 assert.deepEqual(actual.slots,[1,2,3,4,5,6].map(position=>({position,skillId:slots[position-1]??null,locked:position>=4})));
 assert.deepEqual(actual.owned,owned.map(id=>({id,level:1})));
 assert.deepEqual(actual.task,{id:'event1-reference',label:'通关江湖事件1',current:1,target:1});
 assert.equal(await readFile(file,'utf8'),original);
 return actual;
}
try{
 await writeFile(file,original);await start();
 await check('TR-01',async()=>{
  assert.equal((await remove(1)).status,404);await assert.rejects(access(sidecar),{code:'ENOENT'});
  assert.equal(await readFile(file,'utf8'),original);return {noImplicitCheckpoint:true};
 });
 await stop();await start(checkpoint);
 await check('TR-02',async()=>{
  await assertState([upper],[upper,sword]);assert.equal((await remove(1)).status,200);
  const empty=await assertState([],[sword,upper]);assert.equal((await equip()).status,200);await assertState([sword,upper],[sword,upper]);
  return {initialUppercutRemovedToEmpty:empty,autoEquipRestores:true};
 });
 await check('TR-03',async()=>{
  assert.equal((await remove(1)).status,200);const middle=await assertState([null,upper],[upper,sword]);
  assert.equal((await remove(2)).status,200);await assertState([],[sword,upper]);
  await equip();await assertState([sword,upper],[sword,upper]);return {sequence:[1,2],middle,restored:true};
 });
 await check('TR-04',async()=>{
  assert.equal((await remove(2)).status,200);const middle=await assertState([sword],[sword,upper]);
  assert.equal((await remove(1)).status,200);await assertState([],[sword,upper]);
  await equip();await assertState([sword,upper],[sword,upper]);return {sequence:[2,1],middle,restored:true};
 });
 await check('TR-05',async()=>{
  const before=await readFile(sidecar,'utf8'), backup=sidecar+'.backup';await rename(sidecar,backup);await mkdir(sidecar);
  try{assert.deepEqual(await remove(1),{status:500,body:{error:'local_operation_failed'}});await assertState([sword,upper],[sword,upper]);assert.equal(await readFile(backup,'utf8'),before);}
  finally{await rmdir(sidecar);await rename(backup,sidecar);}
  assert.equal((await remove(1)).status,200);await assertState([null,upper],[upper,sword]);return {failedWritePreservesMemoryBackupAndCharacter:true,retrySucceeded:true};
 });
 await check('TR-06',async()=>{
  const oldPid=processHandle.pid,before=await readFile(sidecar,'utf8');await stop();await start();assert.notEqual(processHandle.pid,oldPid);
  await assertState([null,upper],[upper,sword]);assert.equal(await readFile(sidecar,'utf8'),before);
  return {oldPid,newPid:processHandle.pid,nonCompactedSlotAndOrderPersist:true};
 });
 await check('TR-07',async()=>{
  const before=await readFile(sidecar,'utf8');assert.equal((await remove(1)).status,200);await assertState([null,upper],[upper,sword]);assert.equal(await readFile(sidecar,'utf8'),before);
  const requests=[
   [{method:'POST',headers:{'content-type':'application/json'},body:'{'},400],
   [{method:'POST',headers:{'content-type':'text/plain'},body:'{"position":1}'},415],
   ...[{},null,[],{position:'1'},{position:0},{position:3},{position:4},{position:6},{position:1,extra:true}].map(value=>[{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)},400]),
   [{method:'GET'},405]
  ];
  const responses=[];
  for(const [options,expectedStatus]of requests){const response=await call(removePath,options);assert.equal(response.status,expectedStatus);responses.push(response);assert.equal(await readFile(sidecar,'utf8'),before);await assertState([null,upper],[upper,sword]);}
  return {localEmptySlotNoop:true,rejected:responses};
 });
 await check('TR-08',async()=>{
  const before=await readFile(sidecar,'utf8');const changed={...character,name:'改名绑定'};
  assert.equal((await call('/api/character',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(changed)})).status,200);
  const bytes=await readFile(file,'utf8');assert.deepEqual(await remove(2),{status:409,body:{error:'martial_checkpoint_character_mismatch'}});
  assert.equal(await readFile(sidecar,'utf8'),before);assert.equal(await readFile(file,'utf8'),bytes);return {bindingFailureNoWrites:true};
 });
 await stop();await writeFile(file,original);
 await check('TR-09',async()=>{
  const evidence=[];
  for(const twoEquipped of [false,true]){
   const bytes=JSON.stringify({checkpoint,character,twoEquipped})+'\n';await writeFile(sidecar,bytes);await start();
   await assertState(twoEquipped?[sword,upper]:[upper],twoEquipped?[sword,upper]:[upper,sword]);assert.equal(await readFile(sidecar,'utf8'),bytes);
   assert.equal((await remove(1)).status,200);await assertState(twoEquipped?[null,upper]:[],twoEquipped?[upper,sword]:[sword,upper]);
   const updated=JSON.parse(await readFile(sidecar,'utf8'));assert.ok(Array.isArray(updated.twoSlots));assert.ok(Array.isArray(updated.ownedOrder));
   evidence.push({twoEquipped,getDoesNotMigrate:true,writeStoresExplicitSlotsAndOrder:true});await stop();
  }
  return evidence;
 });
 await check('TR-10',async()=>{
  const bytes=JSON.stringify({checkpoint:'observed-before-equip',character,equipped:true,taskComplete:true})+'\n';await writeFile(sidecar,bytes);await start();
  assert.deepEqual(await remove(1),{status:409,body:{error:'martial_action_not_observed'}});assert.equal(await readFile(sidecar,'utf8'),bytes);
  assert.equal((await call(statePath+'/unequip',{method:'POST'})).status,200);const actual=await state();assert.equal(actual.slots[0].skillId,null);assert.equal(actual.task.current,1);
  assert.equal(await readFile(file,'utf8'),original);return {singleSkillNewRouteRejectedOldRouteWorks:true};
 });
}catch(error){process.exitCode=1;console.error(error.message);}
finally{
 await stop();const hashes={};for(const name of ['server/app.js','server/martial-store.js','test/qa/martial-two-remove.mjs'])hashes[name]=createHash('sha256').update(await readFile(join(root,name))).digest('hex');
 const report={source:'Independent local Codex QA, not Grok',at:new Date().toISOString(),timezone:'Australia/Perth',directory,hashes,results};
 const reportPath=join(directory,'result.json');await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({reportPath,results},null,2));
}
