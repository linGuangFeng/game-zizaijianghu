import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, access, rename, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const parent = join(root, '.local/independent-qa');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, 'manual-'));
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
const manualPath=statePath+'/equip-skill';
const manual=skillId=>call(manualPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({skillId})});
const clear=async()=>{await remove(1);await remove(2);await assertState([],[sword,upper]);};
try{
 await writeFile(file,original);await start();
 await check('MM-01',async()=>{assert.equal((await manual(upper)).status,404);await assert.rejects(access(sidecar),{code:'ENOENT'});assert.equal(await readFile(file,'utf8'),original);return{noImplicitCheckpoint:true};});
 await stop();await start(checkpoint);await clear();
 await check('MM-02',async()=>{
  assert.equal((await manual(upper)).status,200);await assertState([upper],[upper,sword]);
  assert.equal((await manual(sword)).status,200);const state=await assertState([upper,sword],[upper,sword]);return{upperThenSword:state};
 });
 await check('MM-03',async()=>{
  const oldPid=processHandle.pid;await stop();await start();assert.notEqual(processHandle.pid,oldPid);await assertState([upper,sword],[upper,sword]);
  await remove(1);await assertState([null,sword],[sword,upper]);
  const holePid=processHandle.pid;await stop();await start();await assertState([null,sword],[sword,upper]);
  assert.equal((await manual(upper)).status,200);await assertState([upper,sword],[upper,sword]);
  await remove(2);await assertState([upper],[upper,sword]);await manual(sword);await assertState([upper,sword],[upper,sword]);
  return{reverseOrderRestart:{oldPid,newPid:holePid},swordInSlot2Restart:processHandle.pid,reverseRemovalNoCompaction:true};
 });
 await check('MM-04',async()=>{
  await clear();await manual(sword);await assertState([sword],[sword,upper]);await manual(upper);await assertState([sword,upper],[sword,upper]);
  await remove(1);await assertState([null,upper],[upper,sword]);await manual(sword);const restored=await assertState([sword,upper],[sword,upper]);return{swordThenUpperAndHoleFill:restored};
 });
 await check('MM-05',async()=>{
  const before=await readFile(sidecar,'utf8');assert.equal((await manual(upper)).status,200);assert.equal((await manual(sword)).status,200);
  assert.equal(await readFile(sidecar,'utf8'),before);await assertState([sword,upper],[sword,upper]);return{alreadyEquippedNoDuplicateAndLocalNoop:true};
 });
 await check('MM-06',async()=>{
  await clear();const before=await readFile(sidecar,'utf8'),backup=sidecar+'.backup';await rename(sidecar,backup);await mkdir(sidecar);
  try{assert.deepEqual(await manual(upper),{status:500,body:{error:'local_operation_failed'}});await assertState([],[sword,upper]);assert.equal(await readFile(backup,'utf8'),before);}
  finally{await rmdir(sidecar);await rename(backup,sidecar);}
  assert.equal((await manual(upper)).status,200);await assertState([upper],[upper,sword]);return{failedWriteNoMutationAndRetryWorks:true};
 });
 await check('MM-07',async()=>{
  const before=await readFile(sidecar,'utf8');
  const bodies=[null,[],{}, {skillId:'unknown'},{skillId:1},{skillId:upper,position:2}];const replies=[];
  for(const body of bodies){const response=await call(manualPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.deepEqual(response,{status:400,body:{error:'invalid_martial_skill'}});replies.push(response);}
  assert.equal((await call(manualPath,{method:'POST',headers:{'content-type':'text/plain'},body:'x'})).status,415);
  assert.equal((await call(manualPath,{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
  assert.equal((await call(manualPath)).status,405);assert.equal(await readFile(sidecar,'utf8'),before);await assertState([upper],[upper,sword]);return{invalidRequests:replies,unchanged:true};
 });
 await check('MM-11',async()=>{
  await manual(sword);await assertState([upper,sword],[upper,sword]);await equip();await assertState([sword,upper],[sword,upper]);
  await clear();await manual(upper);await manual(sword);await remove(1);await assertState([null,sword],[sword,upper]);await equip();await assertState([sword,upper],[sword,upper]);
  return{autoRestoresFromReverseAndSwordSlot2:true};
 });
 await check('MM-08',async()=>{
  const before=await readFile(sidecar,'utf8');await call('/api/character',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...character,name:'另一手动角色'})});
  const changed=await readFile(file,'utf8');assert.deepEqual(await manual(sword),{status:409,body:{error:'martial_checkpoint_character_mismatch'}});
  assert.equal(await readFile(sidecar,'utf8'),before);assert.equal(await readFile(file,'utf8'),changed);return{bindingMismatchNoWrite:true};
 });
 await stop();await writeFile(file,original);
 await check('MM-09',async()=>{
  for(const twoEquipped of [false,true]){
   const bytes=JSON.stringify({checkpoint,character,twoEquipped})+'\n';await writeFile(sidecar,bytes);await start();
   await assertState(twoEquipped?[sword,upper]:[upper],twoEquipped?[sword,upper]:[upper,sword]);assert.equal(await readFile(sidecar,'utf8'),bytes);
   await manual(sword);await assertState(twoEquipped?[sword,upper]:[upper,sword],twoEquipped?[sword,upper]:[upper,sword]);await stop();
  }
  return{legacyBooleanBothStatesCompatibleWithoutGetRewrite:true};
 });
 await check('MM-10',async()=>{
  await writeFile(sidecar,JSON.stringify({checkpoint:'observed-before-equip',character,equipped:true,taskComplete:true})+'\n');await start();const before=await readFile(sidecar,'utf8');
  assert.deepEqual(await manual(upper),{status:409,body:{error:'martial_action_not_observed'}});assert.equal(await readFile(sidecar,'utf8'),before);
  assert.equal((await call(statePath+'/unequip',{method:'POST'})).status,200);assert.equal((await equip()).status,200);assert.equal(await readFile(file,'utf8'),original);return{singleCheckpointManualRejectedOldActionsWork:true};
 });
}catch(error){process.exitCode=1;console.error(error.message);}
finally{
 await stop();const hashes={};for(const name of ['server/app.js','server/martial-store.js','test/qa/martial-manual.mjs'])hashes[name]=createHash('sha256').update(await readFile(join(root,name))).digest('hex');
 const report={source:'Independent local Codex QA, not Grok',at:new Date().toISOString(),timezone:'Australia/Perth',directory,hashes,results};
 const reportPath=join(directory,'result.json');await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({reportPath,results},null,2));
}

