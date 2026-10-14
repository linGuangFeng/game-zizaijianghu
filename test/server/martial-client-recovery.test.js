import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createContext, runInContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../server/app.js';

// Logic/HTTP regression only. This DOM substitute does not render CSS, layout,
// browser events, or browser networking and must not be reported as browser QA.
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {};
    this.dataset = {}; this.listeners = new Map(); this.hidden = false; this.disabled = false;
    this.className = ''; this.textContent = ''; this.value = '';
    this.classList = { toggle: (name, force) => {
      const names = new Set(this.className.split(/\s+/).filter(Boolean));
      const add = force ?? !names.has(name); if (add) names.add(name); else names.delete(name);
      this.className = [...names].join(' '); return add;
    } };
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const old of this.children) old.parent = null; this.children = []; this.append(...nodes); }
  addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); }
  async click() {
    if (this.disabled) return;
    for (const listener of this.listeners.get('click') ?? []) await listener({ target: this, preventDefault() {} });
  }
  focus() {}
  querySelectorAll(selector) {
    const descendants = [];
    const visit = (node) => { for (const child of node.children) { descendants.push(child); visit(child); } }; visit(this);
    const matches = (node, part) => part.startsWith('#') ? node.id === part.slice(1)
      : part.startsWith('.') ? node.className.split(/\s+/).includes(part.slice(1)) : node.tagName === part.toUpperCase();
    return descendants.filter((node) => selector.split(',').some((group) => {
      const parts = group.trim().split(/\s+/); if (!matches(node, parts.pop())) return false;
      let ancestor = node.parent;
      while (parts.length) { const part = parts.pop(); while (ancestor && !matches(ancestor, part)) ancestor = ancestor.parent; if (!ancestor) return false; ancestor = ancestor.parent; }
      return true;
    }));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
function documentFrom(html) {
  const root = new Element('document'); const stack = [root];
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr','path']);
  for (const match of html.matchAll(/<(\/)?([a-z][\w-]*)([^>]*)>/gi)) {
    const [, closing, tag, attrs] = match;
    if (closing) { if (stack.at(-1).tagName === tag.toUpperCase()) stack.pop(); continue; }
    const element = new Element(tag);
    for (const attribute of attrs.matchAll(/([^\s=\/]+)(?:="([^"]*)")?/g)) element.setAttribute(attribute[1], attribute[2] ?? '');
    stack.at(-1).append(element);
    if (!voidTags.has(tag.toLowerCase()) && !attrs.trimEnd().endsWith('/')) stack.push(element);
  }
  root.getElementById = (id) => { const node = root.querySelector('#' + id); assert.ok(node, `Real HTML must contain #${id}`); return node; };
  root.createElement = (tag) => new Element(tag);
  return root;
}
const character = { name: '响应丢失回归', appearanceId: 'male-reference-0002' };
const blue = 'blue-sword-reference', sword = 'ruwu-sword-reference', uppercut = 'uppercut-reference';
async function harness(t, saved, realm = null) {
  const directory = await mkdtemp(join(tmpdir(), 'martial-client-'));
  const saveFile = join(directory, 'character.json'); const martialSaveFile = saveFile + '.martial.json';
  await writeFile(saveFile, JSON.stringify(character));
  if (saved) await writeFile(martialSaveFile, JSON.stringify({ character, ...saved }));
  const realmSaveFile = saveFile + '.realm.json';
  if (realm) await writeFile(realmSaveFile, JSON.stringify({ character, ...realm }));
  const server = await createApp({ saveFile, clientDirectory: directory }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const document = documentFrom(await readFile(new URL('../../client/index.html', import.meta.url), 'utf8'));
  let pending = 0; let drop = null; let failRead = false; const requests = []; const catalogGates = [];
  async function transport(path, options) {
    pending++; const method = options?.method ?? 'GET'; requests.push({ path, method });
    const catalogGate = path === '/api/reference/martial-catalog' ? catalogGates.shift() : null;
    try {
      const response = await fetch(base + path, options);
      if (catalogGate) {
        const payload = await response.json();
        const releaseResponse = async () => { catalogGate.arrived(); await catalogGate.wait; if (catalogGate.fail) throw new TypeError('Injected stale catalog failure'); };
        if (catalogGate.phase === 'fetch') { await releaseResponse(); return { ok: response.ok, status: response.status, json: async () => payload }; }
        return { ok: response.ok, status: response.status, json: async () => { await releaseResponse(); return payload; } };
      }
      if (method === 'POST' && drop?.path === path) {
        const mode = drop.mode; drop = null;
        // The real server has committed and returned a valid state before loss.
        assert.equal(response.status, 200);
        await response.json();
        if (mode === 'network') throw new TypeError('Injected response loss after commit');
        return { ok: true, status: 200, json: async () => { throw new SyntaxError('Injected truncated JSON after commit'); } };
      }
      if (path === '/api/martial-state' && failRead) { await response.arrayBuffer(); throw new TypeError('Injected GET response loss'); }
      return response;
    } finally { pending--; }
  }
  const context = createContext({ document, fetch: transport, console, crypto: globalThis.crypto });
  runInContext(await readFile(new URL('../../client/app.js', import.meta.url), 'utf8'), context, { filename: 'client/app.js' });
  async function settle() {
    let quiet = 0;
    for (let attempts = 0; attempts < 400; attempts++) {
      await delay(5);
      quiet = pending === 0 ? quiet + 1 : 0;
      if (quiet === 4) return;
    }
    assert.fail('Client requests did not settle');
  }
  const byId = (id) => document.getElementById(id);
  const click = async (node) => { assert.ok(node, 'Actual rendered control must exist'); await node.click(); await settle(); };
  await settle();
  if (saved) { await click(byId('open-equipment'));
    assert.equal(byId('auto-equip').disabled, false, 'Successful initial GET opens controls'); }
  return { document, byId, click, settle, requests,
    async reloadClient() {
      const fresh = documentFrom(await readFile(new URL('../../client/index.html', import.meta.url), 'utf8'));
      runInContext(await readFile(new URL('../../client/app.js', import.meta.url), 'utf8'), createContext({ document: fresh, fetch: transport, console, crypto: globalThis.crypto }), { filename: 'client/app.js' });
      await settle(); return fresh;
    },
    breakthroughState: async () => (await (await fetch(base + '/api/breakthrough-state')).json()).state,
    realmState: async () => (await (await fetch(base + '/api/realm-state')).json()).state,
    realmDisk: () => readFile(realmSaveFile, 'utf8'),
    async blockRealmWrite() { await rename(realmSaveFile, realmSaveFile + '.bak'); await mkdir(realmSaveFile); },
    async restoreRealmWrite() { await rm(realmSaveFile, { recursive: true }); await rename(realmSaveFile + '.bak', realmSaveFile); },
    holdCatalog(phase, fail) {
      let arrived, release; const reached = new Promise((resolve) => { arrived = resolve; });
      const wait = new Promise((resolve) => { release = resolve; });
      catalogGates.push({ phase, fail, arrived, wait }); return { reached, release };
    },
    dropResponse(path, mode) { drop = { path, mode }; }, failRead(value) { failRead = value; },
    state: async () => (await (await fetch(base + '/api/martial-state')).json()).state,
    disk: async () => JSON.parse(await readFile(martialSaveFile, 'utf8')),
  };
}
function renderedSlots(h) { return h.byId('equipment-slots').children.map((node) => node.getAttribute('aria-label')); }
function assertLocked(h) {
  assert.equal(h.byId('auto-equip').disabled, true, 'Unconfirmed auto-equip must remain locked');
  assert.equal(h.byId('edit-equipment').disabled, true, 'Unconfirmed edit must remain locked');
  for (const button of h.document.querySelectorAll('#equipment-slots button, #equipment-owned button')) assert.equal(button.disabled, true, 'Slot/card/growth action must remain locked');
  assert.equal(h.byId('upgrade-martial').disabled, true);
  assert.equal(h.byId('retry-equipment').hidden, false, 'Expose existing GET recovery control');
}
const scenarios = [
  { name: 'three-slot auto-equip lost response', saved: { checkpoint: 'observed-event1-before-equip', threeSlots: [blue,null,uppercut] }, action: 'auto', path: '/api/martial-state/auto-equip', mode: 'network', expected: [blue,sword,uppercut] },
  { name: 'three-slot removal truncated JSON', saved: { checkpoint: 'observed-event1-before-equip', threeSlots: [blue,sword,uppercut] }, action: 'remove', path: '/api/martial-state/unequip-slot', mode: 'json', expected: [blue,null,uppercut] },
  { name: 'three-slot refill lost response', saved: { checkpoint: 'observed-event1-before-equip', threeSlots: [blue,null,uppercut] }, action: 'refill', path: '/api/martial-state/equip-skill', mode: 'network', expected: [blue,sword,uppercut] },
  { name: 'legacy single auto-equip lost response', saved: { checkpoint: 'observed-before-equip', equipped: false, taskComplete: false }, action: 'auto', path: '/api/martial-state/auto-equip', mode: 'network', expected: [uppercut,null,null] },
  { name: 'legacy single removal truncated JSON', saved: { checkpoint: 'observed-before-equip', equipped: true, taskComplete: true }, action: 'remove', path: '/api/martial-state/unequip', mode: 'json', expected: [null,null,null] },
  { name: 'legacy two-slot refill lost response', saved: { checkpoint: 'observed-event1-before-equip', twoSlots: [uppercut,null], ownedOrder: [uppercut,sword] }, action: 'refill', path: '/api/martial-state/equip-skill', mode: 'network', expected: [uppercut,sword,null] },
];
for (const scenario of scenarios) test('real client + HTTP recovery: ' + scenario.name, async (t) => {
  const h = await harness(t, scenario.saved); const initialSlots = renderedSlots(h);
  if (scenario.action !== 'auto') await h.click(h.byId('edit-equipment'));
  const control = scenario.action === 'auto' ? h.byId('auto-equip')
    : scenario.action === 'remove' ? h.document.querySelector('#equipment-slots button')
      : h.document.querySelectorAll('#equipment-owned button').find((node) => node.getAttribute('aria-label') === '装配入悟剑法');
  h.dropResponse(scenario.path, scenario.mode);
  await h.click(control);
  const serverState = await h.state();
  assert.equal(serverState.revision, 1); assert.equal((await h.disk()).revision, 1);
  assert.deepEqual(serverState.slots.slice(0,3).map((slot) => slot.skillId), scenario.expected);
  assert.deepEqual(renderedSlots(h), initialSlots, 'Unconfirmed response must not optimistically alter displayed slots');
  assertLocked(h);
  const writes = () => h.requests.filter((r) => r.method === 'POST').length;
  assert.equal(writes(), 1, 'No automatic resend after response loss');
  await h.click(h.byId('auto-equip')); assert.equal(writes(), 1, 'Disabled UI cannot submit another mutation');
  h.failRead(true); await h.click(h.byId('retry-equipment')); assertLocked(h); assert.equal(writes(),1);
  h.failRead(false); await h.click(h.byId('retry-equipment'));
  assert.equal(h.byId('auto-equip').disabled, false); assert.equal(h.byId('edit-equipment').disabled, false);
  assert.equal(h.byId('retry-equipment').hidden, true); assert.equal(writes(),1);
  assert.deepEqual(renderedSlots(h), serverState.slots.map((slot) => `槽位 ${slot.position}：${slot.locked ? '锁定' : slot.skillId === blue ? '蓝色剑诀（名称待核）' : slot.skillId === sword ? '入悟剑法' : slot.skillId === uppercut ? '上勾拳' : '空'}`));
  assert.equal((await h.state()).revision,1, 'GET recovery does not repeat or mutate committed action');
});


for (const phase of ['fetch', 'json']) for (const fail of [false, true]) test('real client catalog ignores stale '+phase+' '+(fail?'failure':'success'), async(t)=>{
  const h=await harness(t,{checkpoint:'observed-before-equip',equipped:false,taskComplete:false});
  const gate=h.holdCatalog(phase,fail);
  const first=h.byId('open-martial').click(); await gate.reached;
  await h.byId('open-martial').click(); // Second real HTTP response wins before releasing first.
  assert.equal(h.byId('martial-entries').children.length,1);
  assert.equal(h.byId('martial-entries').children[0].children[0].textContent,'上勾拳');
  gate.release();await first;await h.settle();
  assert.equal(h.byId('martial-entries').children.length,1,'Old success must not append a duplicate card');
  assert.equal(h.byId('retry-martial').hidden,true,'Old failure must not replace newer successful status');
  assert.equal(h.byId('status').textContent,'');
  assert.equal(h.requests.filter(r=>r.path==='/api/reference/martial-catalog').length,2);
  assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('leaving catalog invalidates an in-flight JSON response without repainting prior list',async(t)=>{
 const h=await harness(t,{checkpoint:'observed-before-equip',equipped:false,taskComplete:false});
 const gate=h.holdCatalog('json',false);const pending=h.byId('open-martial').click();await gate.reached;
 await h.byId('back-character').click();gate.release();await pending;await h.settle();
 assert.equal(h.byId('saved-step').hidden,false);assert.equal(h.byId('martial-list').hidden,true);
 assert.equal(h.byId('martial-entries').children.length,0);assert.equal(h.byId('status').textContent,'');
});

test('locked slot hints show observed conditions without sending mutations',async(t)=>{
 const h=await harness(t,{checkpoint:'observed-before-equip',equipped:false,taskComplete:false});
 const before=await h.disk();const requestCount=h.requests.length;
 for(const [position,event]of [[4,12],[5,19],[6,32]]){
  const button=h.byId('equipment-slots').children[position-1].querySelector('button');
  assert.ok(button,'Locked slot exposes its condition control');await h.click(button);
  assert.equal(h.byId('status').textContent,`通关江湖事件第${event}关解锁`);
 }
 assert.equal(h.requests.length,requestCount,'Read-only hint must not send any request');assert.deepEqual(await h.disk(),before);
});


const initialRealm = { checkpoint: 'observed-before-training', revision: 0, experience: 120,
  counts: { trial: 0, stance: 0, run: 0 }, totalTraining: 0, attributes: { attack: 10, defense: 5, health: 1000 } };
function assertRealmProgress(document, value) {
  assert.equal(document.getElementById('realm-progress-bar').value, value);
  assert.equal(document.getElementById('realm-progress-bar').max, 30);
  assert.equal(document.getElementById('realm-progress').textContent, value + '/30');
}
test('realm progress binds successful HTTP state and fresh client reads persisted1/30', async(t)=>{
  const h=await harness(t,null,initialRealm); await h.click(h.byId('open-realm'));
  assertRealmProgress(h.document,0); const before=await h.realmDisk();
  await h.click(h.byId('realm-training').querySelector('button'));
  assertRealmProgress(h.document,1); assert.equal((await h.realmState()).revision,1);
  assert.notEqual(await h.realmDisk(),before);
  const after=await h.realmDisk(); const fresh=await h.reloadClient();
  assertRealmProgress(fresh,1);assert.equal(await h.realmDisk(),after,'New client GET cannot mutate realm');
});
test('realm failed persistence leaves progress unchanged, locks actions and GET recovery permits retry',async(t)=>{
  const h=await harness(t,null,initialRealm);await h.click(h.byId('open-realm'));await h.blockRealmWrite();
  await h.click(h.byId('realm-training').querySelector('button'));
  assertRealmProgress(h.document,0);assert.equal((await h.realmState()).revision,0);
  assert.equal(h.byId('retry-realm').hidden,false);
  assert.ok(h.byId('realm-training').querySelectorAll('button').every(b=>b.disabled));
  assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
  await h.restoreRealmWrite();await h.click(h.byId('retry-realm'));assertRealmProgress(h.document,0);
  assert.ok(h.byId('realm-training').querySelectorAll('button').every(b=>!b.disabled));
  await h.click(h.byId('realm-training').querySelector('button'));assertRealmProgress(h.document,1);
});
test('realm artificial29/30 reaches30 and all three capped cards stay disabled',async(t)=>{
  // Isolated existing-domain test data; this is not a new checkpoint or resource grant.
  const realm={...initialRealm,revision:29,experience:100,counts:{trial:9,stance:10,run:10},totalTraining:29,attributes:{attack:28,defense:15,health:2000}};
  const h=await harness(t,null,realm);await h.click(h.byId('open-realm'));assertRealmProgress(h.document,29);
  await h.click(h.byId('realm-training').querySelector('button'));assertRealmProgress(h.document,30);
  const buttons=h.byId('realm-training').querySelectorAll('button');assert.equal(buttons.length,3);
  assert.ok(buttons.every(b=>b.disabled&&b.textContent==='已达瓶颈'));
  const writes=h.requests.filter(r=>r.method==='POST').length;for(const button of buttons)await h.click(button);
  assert.equal(h.requests.filter(r=>r.method==='POST').length,writes);assert.equal((await h.realmState()).resource.amount,88);
});
test('ordinary role has no realm navigation or implicit realm file',async(t)=>{
  const h=await harness(t,null);assert.equal(h.byId('open-realm').hidden,true);assert.equal(h.byId('continue-realm').hidden,true);
  assert.equal(h.byId('realm-training').children.length,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
  await assert.rejects(h.realmDisk(),{code:'ENOENT'});
});


function ninthSample(stage, counts, attributes) {
  // Explicit isolated existing-domain snapshot, not a production initializer or grant.
  return { checkpoint: 'observed-before-first-breakthrough', revision: 4, experience: 100,
    counts: { trial: 10, stance: 10, run: 10 }, totalTraining: 30, advanced: true, attributes,
    ninthTraining: { stage, counts }, receipts: ['event5', 'martial2', 'training30'].map((conditionId) => ({
      id: 'first-breakthrough-' + conditionId, conditionId, reward: { id: 'baodian-token-reference', name: '宝典令', amount: 5 } })) };
}
function assertNinthProgress(document, value, max) {
  assert.equal(document.getElementById('ninth-progress-bar').value, value);
  assert.equal(document.getElementById('ninth-progress-bar').max, max);
  assert.equal(document.getElementById('ninth-progress').textContent, value + '/' + max);
}
for (const sample of [
  { name: 'first to second', stage: 1, counts: { trial: 10, stance: 13, run: 15 }, attributes: { attack: 60, defense: 33, health: 4150 }, before: [38,39], after: [0,54], nextStage: 2 },
  { name: 'second to third', stage: 2, counts: { trial: 28, stance: 31, run: 33 }, attributes: { attack: 106, defense: 56, health: 6630 }, before: [53,54], after: [0,66], nextStage: 3 },
]) test('ninth progress changes max on real HTTP '+sample.name+' boundary', async(t)=>{
  const h=await harness(t,null,ninthSample(sample.stage,sample.counts,sample.attributes));
  await h.click(h.byId('open-ninth-training'));assertNinthProgress(h.document,...sample.before);
  const before=await h.breakthroughState();
  await h.click(h.byId('ninth-training-cards').querySelectorAll('button')[2]);
  assertNinthProgress(h.document,...sample.after);
  const state=await h.breakthroughState();assert.equal(state.ninthTraining.stage,sample.nextStage);assert.equal(state.revision,5);assert.equal(state.resource.amount,84);assert.deepEqual(state.receipts,before.receipts);
  const bytes=await h.realmDisk();const fresh=await h.reloadClient();assertNinthProgress(fresh,...sample.after);assert.equal(await h.realmDisk(),bytes);
});

test('ninth final66/66 keeps third stage and locks actual training buttons',async(t)=>{
 const h=await harness(t,null,ninthSample(3,{trial:53,stance:53,run:52},{attack:156,defense:78,health:8720}));
 await h.click(h.byId('open-ninth-training'));assertNinthProgress(h.document,65,66);
 const before=h.byId('ninth-training-cards').querySelectorAll('button');assert.deepEqual(before.map(b=>b.disabled),[true,true,false]);
 await h.click(before[2]);assertNinthProgress(h.document,66,66);
 const state=await h.breakthroughState();assert.equal(state.ninthTraining.stage,3);assert.equal(state.ninthTraining.supported,false);assert.equal(state.realm.attributes.health,8830);
 const buttons=h.byId('ninth-training-cards').querySelectorAll('button');assert.ok(buttons.every(b=>b.disabled&&b.textContent==='已达瓶颈'));
 const writes=h.requests.filter(r=>r.method==='POST').length;for(const button of buttons)await h.click(button);assert.equal(h.requests.filter(r=>r.method==='POST').length,writes);
});

test('ninth failed write cannot advance progress and successful GET recovery permits explicit retry',async(t)=>{
 const h=await harness(t,null,ninthSample(2,{trial:10,stance:13,run:16},{attack:70,defense:38,health:4760}));
 await h.click(h.byId('open-ninth-training'));assertNinthProgress(h.document,0,54);await h.blockRealmWrite();
 await h.click(h.byId('ninth-training-cards').querySelector('button'));assertNinthProgress(h.document,0,54);
 assert.equal((await h.breakthroughState()).revision,4);assert.equal(h.byId('retry-ninth').hidden,false);assert.ok(h.byId('ninth-training-cards').querySelectorAll('button').every(b=>b.disabled));
 assert.equal(h.requests.filter(r=>r.method==='POST').length,1);await h.restoreRealmWrite();await h.click(h.byId('retry-ninth'));
 assertNinthProgress(h.document,0,54);assert.ok(h.byId('ninth-training-cards').querySelectorAll('button').every(b=>!b.disabled));
 await h.click(h.byId('ninth-training-cards').querySelector('button'));assertNinthProgress(h.document,1,54);assert.equal((await h.breakthroughState()).resource.amount,84);
});
