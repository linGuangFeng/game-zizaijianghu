const byId = (id) => document.getElementById(id);
const panels = ['appearance-step', 'name-step', 'jianghu-panel', 'saved-step', 'martial-list', 'martial-detail', 'equipment-panel', 'realm-panel', 'gear-panel', 'breakthrough-panel', 'player-martial-detail'];
const genderLabels = {
  'male-reference-0002': '男',
  'female-reference-0003': '女',
};
let options = [];
let appearanceId = null;
let saving = false;

function status(message, error = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('error', error);
}

function showPanel(id) {
  document.querySelector('.game-shell').classList.toggle('is-jianghu', id === 'jianghu-panel');
  byId('portrait-area').hidden = id === 'martial-list' || id === 'martial-detail' || id === 'equipment-panel' || id === 'jianghu-panel' || id === 'realm-panel' || id === 'gear-panel' || id === 'breakthrough-panel' || id === 'player-martial-detail';
  for (const panel of panels) byId(panel).hidden = panel !== id;
}

function updateAppearance() {
  const label = genderLabels[appearanceId];
  byId('appearance-caption').textContent = label ? `${label}角色` : '选择角色';
  byId('character-mark').textContent = label || '侠';
  for (const button of byId('appearance-options').children) {
    button.setAttribute('aria-pressed', String(button.dataset.id === appearanceId));
  }
  byId('next-button').disabled = appearanceId === null;
}

function showCharacter(character) {
  appearanceId = character.appearanceId;
  updateAppearance();
  byId('title').textContent = '我的角色';
  byId('jianghu-name').textContent = character.name;
  byId('jianghu-appearance').textContent = genderLabels[character.appearanceId] + '角色';
  byId('saved-name').textContent = character.name;
  byId('saved-appearance').textContent = genderLabels[character.appearanceId];
  showJianghu();
  readCheckpoint();
  readRealm();
  readGear();
  readBreakthrough();
}

async function readCharacter() {
  showPanel(null);
  byId('retry-button').hidden = true;
  status('正在读取角色……');
  try {
    const [optionsResponse, characterResponse] = await Promise.all([
      fetch('/api/appearance-options'), fetch('/api/character'),
    ]);
    if (!optionsResponse.ok || (!characterResponse.ok && characterResponse.status !== 404)) {
      throw new Error('read_failed');
    }
    options = (await optionsResponse.json()).options;
    byId('appearance-options').replaceChildren();
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = genderLabels[option.id];
      button.dataset.id = option.id;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        appearanceId = option.id;
        updateAppearance();
      });
      byId('appearance-options').append(button);
    }
    if (characterResponse.ok) {
      showCharacter((await characterResponse.json()).character);
      status('角色已读取');
    } else {
      appearanceId = null;
      updateAppearance();
      byId('title').textContent = '创建角色';
      showPanel('appearance-step');
      status('请选择角色性别');
    }
  } catch {
    status('角色读取失败，请重试。', true);
    byId('retry-button').hidden = false;
  }
}

byId('next-button').addEventListener('click', () => {
  showPanel('name-step');
  status('请输入角色名称');
  byId('character-name').focus();
});

byId('back-button').addEventListener('click', () => {
  showPanel('appearance-step');
  status('请选择角色性别');
});

byId('name-step').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  saving = true;
  byId('save-button').disabled = true;
  byId('back-button').disabled = true;
  byId('character-name').disabled = true;
  status('正在保存角色……');
  try {
    const response = await fetch('/api/character', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: byId('character-name').value, appearanceId }),
    });
    if (!response.ok) throw new Error('save_failed');
    showCharacter((await response.json()).character);
    status('角色已保存');
  } catch {
    status('角色保存失败，请重试。', true);
  } finally {
    saving = false;
    byId('save-button').disabled = false;
    byId('back-button').disabled = false;
    byId('character-name').disabled = false;
  }
});

byId('retry-button').addEventListener('click', readCharacter);
readCharacter();


function addFact(container, label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const definition = document.createElement('dd');
  term.textContent = label;
  definition.textContent = value;
  row.append(term, definition);
  container.append(row);
}

function showMartialEntry(entry) {
  showPanel('martial-detail');
  byId('title').textContent = '武学详情';
  byId('martial-detail-title').textContent = entry.name;
  status('');
  byId('martial-facts').replaceChildren();
  for (const [label, value] of [
    ['类别', entry.categoryText], ['等级', entry.levelText],
    ['星级', entry.starsText], ['定位', entry.roleText], ['冷却', entry.cooldownText],
  ]) addFact(byId('martial-facts'), label, value);
  byId('martial-description').replaceChildren();
  for (const fragment of entry.descriptionFragments) {
    const item = document.createElement('li');
    item.textContent = fragment;
    byId('martial-description').append(item);
  }
  byId('description-incomplete').hidden = entry.descriptionComplete;
  byId('martial-attributes').replaceChildren();
  for (const attribute of entry.attributes) {
    addFact(byId('martial-attributes'), attribute.label, attribute.text);
  }
  byId('martial-talents').replaceChildren();
  for (const talent of entry.observedTalentRows) {
    const item = document.createElement('li');
    item.textContent = `${talent.levelText} · ${talent.visibleState === 'locked' ? '锁定 · ' : ''}${talent.readableText}${talent.textComplete ? '' : '（文字未完整收录）'}`;
    byId('martial-talents').append(item);
  }
}

async function openMartialCatalog() {
  showPanel('martial-list');
  byId('title').textContent = '武学图鉴';
  byId('retry-martial').hidden = true;
  byId('martial-entries').replaceChildren();
  status('正在读取图鉴……');
  try {
    const response = await fetch('/api/reference/martial-catalog');
    if (!response.ok) throw new Error('catalog_failed');
    const catalog = await response.json();
    for (const entry of catalog.entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'martial-card';
      const name = document.createElement('strong');
      name.textContent = entry.name;
      const summary = document.createElement('span');
      summary.textContent = `${entry.categoryText} · ${entry.roleText}`;
      button.append(name, summary);
      button.addEventListener('click', () => showMartialEntry(entry));
      byId('martial-entries').append(button);
    }
    if (!byId('martial-list').hidden) status('');
  } catch {
    if (!byId('martial-list').hidden) {
      status('图鉴读取失败，请重试。', true);
      byId('retry-martial').hidden = false;
    }
  }
}

byId('open-martial').addEventListener('click', openMartialCatalog);
byId('retry-martial').addEventListener('click', openMartialCatalog);
byId('back-character').addEventListener('click', () => {
  showPanel('saved-step');
  byId('title').textContent = '我的角色';
  status('');
});
byId('back-martial-list').addEventListener('click', () => {
  showPanel('martial-list');
  byId('title').textContent = '武学图鉴';
  status('');
});


let checkpointRequest = 0;
let equipping = false;
let editingEquipment = false;
let equipmentState = null;
let martialGrowthReady = false;
const equippedSkillNames = {
  'uppercut-reference': '上勾拳',
  'ruwu-sword-reference': '入悟剑法',
};

function displayCheckpoint(state) {
  equipmentState = state;
  const canEdit = state.checkpoint === 'observed-before-equip' || state.checkpoint === 'observed-event1-before-equip';
  if (!canEdit) editingEquipment = false;
  byId('edit-equipment').hidden = !canEdit;
  byId('edit-equipment').textContent = editingEquipment ? '退出编辑' : '编辑';
  byId('edit-equipment').setAttribute('aria-pressed', String(editingEquipment));
  byId('equipment-edit-hint').hidden = !editingEquipment;

  byId('equipment-slots').replaceChildren();
  for (const slot of state.slots) {
    const item = document.createElement('li');
    item.className = slot.locked ? 'slot locked' : slot.skillId ? 'slot equipped' : 'slot';
    const label = document.createElement('span');
    label.textContent = slot.locked ? '锁定' : slot.skillId ? equippedSkillNames[slot.skillId] : '+';
    const number = document.createElement('small');
    number.textContent = String(slot.position);
    item.setAttribute('aria-label', `槽位 ${slot.position}：${slot.locked ? '锁定' : slot.skillId ? equippedSkillNames[slot.skillId] : '空'}`);
    item.append(label, number);
    if (editingEquipment && slot.skillId && (slot.position === 1 || (state.checkpoint === 'observed-event1-before-equip' && slot.position === 2))) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'unequip-button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', '卸下' + equippedSkillNames[slot.skillId]);
      remove.disabled = equipping;
      remove.addEventListener('click', () => unequipMartial(slot.position));
      item.append(remove);
    }
    byId('equipment-slots').append(item);
  }
  byId('equipment-owned').replaceChildren();
  for (const skill of state.owned) {
    const canUseCard = editingEquipment && state.checkpoint === 'observed-event1-before-equip';
    const equippedSlot = state.slots.find((slot) => slot.skillId === skill.id);
    const canOpenGrowth = !editingEquipment && skill.id === 'uppercut-reference' && state.growth?.uppercut;
    const card = document.createElement(canUseCard || canOpenGrowth ? 'button' : 'div');
    card.className = 'owned-card';
    if (canUseCard) {
      card.type = 'button';
      card.disabled = equipping;
      card.setAttribute('aria-label', equippedSlot ? '卸下' + equippedSkillNames[skill.id] + '卡片' : '装配' + equippedSkillNames[skill.id]);
      card.addEventListener('click', () => equippedSlot ? unequipMartial(equippedSlot.position) : equipMartialSkill(skill.id));
    }
    if (canOpenGrowth) {
      card.type = 'button';
      card.disabled = equipping;
      card.setAttribute('aria-label', '上勾拳养成');
      card.addEventListener('click', openPlayerMartial);
    }
    const name = document.createElement('strong');
    name.textContent = equippedSkillNames[skill.id];
    const level = document.createElement('span');
    level.textContent = `Lv.${skill.level}`;
    card.append(name, level);
    if (state.slots.some((slot) => slot.skillId === skill.id)) {
      const badge = document.createElement('span');
      badge.className = 'equipped-badge';
      badge.textContent = '已装配';
      card.append(badge);
    }
    byId('equipment-owned').append(card);
  }
  const taskText = `${state.task.label} ${state.task.current}/${state.task.target}`;
  byId('equipment-task').textContent = taskText;
  byId('checkpoint-message').textContent = taskText;
  displayPlayerMartial();
}

async function readCheckpoint() {
  const request = ++checkpointRequest;
  martialGrowthReady = false;
  byId('upgrade-martial').disabled = true;
  byId('retry-player-martial').hidden = true;
  byId('retry-checkpoint').hidden = true;
  byId('retry-equipment').hidden = true;
  byId('auto-equip').disabled = true;
  byId('edit-equipment').disabled = true;
  for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = true;
  try {
    const response = await fetch('/api/martial-state');
    if (request !== checkpointRequest) return;
    if (response.status === 404) {
      equipmentState = null;
      displayPlayerMartial();
      editingEquipment = false;
      byId('equipment-slots').replaceChildren();
      byId('equipment-owned').replaceChildren();
      byId('equipment-task').textContent = '';

      byId('open-equipment').hidden = true;
      byId('checkpoint-message').textContent = '';
      if (!byId('equipment-panel').hidden || !byId('player-martial-detail').hidden) {
        showJianghu();
      }
      return;
    }
    if (!response.ok) throw new Error(response.status === 409 ? 'mismatch' : 'read_failed');
    const result = await response.json();
    if (request !== checkpointRequest) return;
    martialGrowthReady = true;
    displayCheckpoint(result.state);
    byId('open-equipment').hidden = false;
    byId('auto-equip').disabled = false;
    byId('edit-equipment').disabled = false;
    for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = false;
    if (!byId('equipment-panel').hidden || !byId('player-martial-detail').hidden) status('');
  } catch (error) {
    if (request !== checkpointRequest) return;
    const message = error.message === 'mismatch' ? '武学记录与当前角色不匹配。' : '武学读取失败，请重试。';
    byId('checkpoint-message').textContent = message;
    byId('retry-checkpoint').hidden = false;
    byId('retry-player-martial').hidden = false;
    if (!byId('equipment-panel').hidden || !byId('player-martial-detail').hidden) {
      status(message, true);
      byId('retry-equipment').hidden = false;
    }
  }
}

byId('open-equipment').addEventListener('click', () => {
  editingEquipment = false;
  showPanel('equipment-panel');
  byId('title').textContent = '武学';
  status('正在读取武学……');
  readCheckpoint();
});
byId('retry-checkpoint').addEventListener('click', readCheckpoint);
byId('retry-equipment').addEventListener('click', readCheckpoint);
byId('back-equipment').addEventListener('click', showJianghu);
byId('auto-equip').addEventListener('click', async () => {
  if (equipping) return;
  equipping = true;
  ++checkpointRequest;
  byId('auto-equip').disabled = true;
  byId('edit-equipment').disabled = true;
  for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = true;
  byId('back-equipment').disabled = true;
  status('正在装配……');
  try {
    const response = await fetch('/api/martial-state/auto-equip', { method: 'POST' });
    if (!response.ok) throw new Error('equip_failed');
    displayCheckpoint((await response.json()).state);
    status('装配成功');
  } catch {
    status('装配失败，请重试。', true);
  } finally {
    equipping = false;
    byId('auto-equip').disabled = false;
    byId('edit-equipment').disabled = false;
    for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = false;
    byId('back-equipment').disabled = false;
  }
});

byId('edit-equipment').addEventListener('click', () => {
  editingEquipment = !editingEquipment;
  displayCheckpoint(equipmentState);
});

async function unequipMartial(position) {
  if (equipping) return;
  equipping = true;
  ++checkpointRequest;
  byId('auto-equip').disabled = true;
  byId('edit-equipment').disabled = true;
  byId('back-equipment').disabled = true;
  for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = true;
  status('正在卸下……');
  try {
    const isTwoSkillCheckpoint = equipmentState.checkpoint === 'observed-event1-before-equip';
    const response = await fetch(isTwoSkillCheckpoint ? '/api/martial-state/unequip-slot' : '/api/martial-state/unequip',
      isTwoSkillCheckpoint ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position }),
      } : { method: 'POST' });
    if (!response.ok) throw new Error('unequip_failed');
    displayCheckpoint((await response.json()).state);
    status('卸下成功');
  } catch {
    status('卸下失败，请重试。', true);
  } finally {
    equipping = false;
    byId('auto-equip').disabled = false;
    byId('edit-equipment').disabled = false;
    byId('back-equipment').disabled = false;
    for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = false;
  }
}

async function equipMartialSkill(skillId) {
  if (equipping) return;
  equipping = true;
  ++checkpointRequest;
  byId('auto-equip').disabled = true;
  byId('edit-equipment').disabled = true;
  byId('back-equipment').disabled = true;
  for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = true;
  status('正在装配……');
  try {
    const response = await fetch('/api/martial-state/equip-skill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId }),
    });
    if (!response.ok) throw new Error('equip_failed');
    displayCheckpoint((await response.json()).state);
    status('装配成功');
  } catch {
    status('装配失败，请重试。', true);
  } finally {
    equipping = false;
    byId('auto-equip').disabled = false;
    byId('edit-equipment').disabled = false;
    byId('back-equipment').disabled = false;
    for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = false;
  }
}

function showJianghu() {
  showPanel('jianghu-panel');
  byId('title').textContent = '江湖';
  status('');
}

byId('open-character').addEventListener('click', () => {
  showPanel('saved-step');
  byId('title').textContent = '我的角色';
  status('');
});
byId('back-jianghu').addEventListener('click', showJianghu);

let realmState = null;
let realmRequest = 0;
let realmBusy = false;
let realmReady = false;
const realmAttributeNames = { attack: '攻击', defense: '防御', health: '气血' };

function realmMessage(message) {
  byId('realm-message').textContent = message;
}

function realmControls() {
  for (const button of byId('realm-training').querySelectorAll('button')) {
    button.disabled = realmBusy || !realmReady || button.dataset.full === 'true';
  }
  byId('back-realm').disabled = realmBusy;
  byId('retry-realm').disabled = realmBusy;
  byId('retry-realm-entry').disabled = realmBusy;
}

function displayRealm(state) {
  realmState = state;
  byId('realm-resource').textContent = `${state.resource.name}：${state.resource.amount}`;
  byId('realm-name').textContent = state.realm.name;
  byId('realm-progress').textContent = `${state.realm.progress.current}/${state.realm.progress.target}`;
  byId('realm-attributes').replaceChildren();
  for (const [key, label] of Object.entries(realmAttributeNames)) {
    addFact(byId('realm-attributes'), label, '+' + state.realm.attributes[key]);
  }
  byId('realm-training').replaceChildren();
  for (const training of state.training) {
    const card = document.createElement('div');
    card.className = 'realm-training-card';
    const name = document.createElement('strong');
    name.textContent = `${training.name}(${training.count}/${training.limit})`;
    const attribute = document.createElement('span');
    attribute.textContent = `${realmAttributeNames[training.attribute]} +${training.count * training.gain}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.full = String(training.count >= training.limit);
    button.textContent = training.count >= training.limit ? '已达瓶颈' : `${state.resource.name} ${training.cost}`;
    button.setAttribute('aria-label', `${training.name}：${button.textContent}`);
    button.addEventListener('click', () => trainRealm(training.id));
    card.append(name, attribute, button);
    byId('realm-training').append(card);
  }
  byId('realm-task').textContent = `${state.task.label} ${state.task.current}/${state.task.target}`;
}

async function readRealm() {
  const request = ++realmRequest;
  realmReady = false;
  realmControls();
  byId('retry-realm-entry').hidden = true;
  byId('retry-realm').hidden = true;
  try {
    const response = await fetch('/api/realm-state');
    if (request !== realmRequest) return;
    if (response.status === 404) {
      realmState = null;
      byId('open-realm').hidden = true;
      byId('realm-entry-message').textContent = '';
      byId('realm-training').replaceChildren();
      if (!byId('realm-panel').hidden) showRealmProfile();
      return;
    }
    if (!response.ok) throw new Error('read_failed');
    const result = await response.json();
    if (request !== realmRequest) return;
    displayRealm(result.state);
    realmReady = true;
    byId('open-realm').hidden = false;
    byId('realm-entry-message').textContent = '';
    realmMessage('');
    realmControls();
  } catch {
    if (request !== realmRequest) return;
    byId('realm-entry-message').textContent = '境界读取失败，请重试。';
    realmMessage('境界读取失败，请重试。');
    byId('retry-realm-entry').hidden = false;
    byId('retry-realm').hidden = false;
  }
}

async function trainRealm(training) {
  if (realmBusy || !realmReady) return;
  realmBusy = true;
  ++realmRequest;
  realmControls();
  realmMessage('正在修炼……');
  try {
    const response = await fetch('/api/realm-state/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ training, expectedRevision: realmState.revision }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.error === 'realm_revision_conflict') {
        await readRealm();
        if (realmReady) realmMessage('修炼记录已更新，请重新选择。');
        return;
      }
      const messages = {
        realm_experience_insufficient: '江湖阅历不足',
        realm_training_at_limit: '已达瓶颈',
        realm_checkpoint_character_mismatch: '境界记录与当前角色不匹配。',
      };
      if (result.error === 'realm_experience_insufficient' || result.error === 'realm_training_at_limit') {
        realmMessage(messages[result.error]);
        return;
      }
      throw new Error(messages[result.error] || '修炼结果暂未确认，请重新读取境界。');
    }
    displayRealm(result.state);
    realmMessage('修炼成功');
  } catch (error) {
    realmReady = false;
    realmMessage(error.message === '境界记录与当前角色不匹配。' ? error.message : '修炼结果暂未确认，请重新读取境界。');
    byId('retry-realm').hidden = false;
  } finally {
    realmBusy = false;
    realmControls();
  }
}

function showRealmProfile() {
  showPanel('saved-step');
  byId('title').textContent = '我的角色';
  status('');
}

byId('open-realm').addEventListener('click', () => {
  showPanel('realm-panel');
  byId('title').textContent = '境界';
  status('');
  realmMessage('正在读取境界……');
  readRealm();
});
byId('retry-realm-entry').addEventListener('click', readRealm);
byId('retry-realm').addEventListener('click', readRealm);
byId('back-realm').addEventListener('click', showRealmProfile);

let gearState = null;
let gearRequest = 0;
let gearBusy = false;
let gearReady = false;

function gearControls() {
  for (const button of byId('gear-panel').querySelectorAll('button')) {
    const navigation = button.id === 'back-gear' || button.id === 'retry-gear';
    button.disabled = gearBusy || (!navigation && !gearReady) || button.dataset.equipped === 'true';
  }
  byId('retry-gear-entry').disabled = gearBusy;
}

function gearItemFacts(container, item) {
  container.replaceChildren();
  for (const [label, value] of [
    ['品阶', `${item.quality} · ${item.tier}阶`], ['武力值', item.power],
    ['攻击', item.attributes.attack], ['防御', item.attributes.defense],
    ['气血', item.attributes.health], ['抗暴', item.attributes.criticalResistance],
  ]) addFact(container, label, value);
}

function displayGear(state) {
  gearState = state;
  const equipped = state.owned.find((item) => item.id === state.equippedId);
  byId('gear-equipped').textContent = `${equipped.quality} ${equipped.name} · ${equipped.tier}阶 · 已装备`;
  byId('gear-detail-title').textContent = equipped.name;
  gearItemFacts(byId('gear-item-attributes'), equipped);
  byId('gear-attributes').replaceChildren();
  for (const [label, value] of [
    ['攻击', state.equipmentAttributes.attack], ['防御', state.equipmentAttributes.defense],
    ['气血', state.equipmentAttributes.healthText], ['抗暴', state.equipmentAttributes.criticalResistance],
  ]) addFact(byId('gear-attributes'), label, value);
  byId('gear-candidates').replaceChildren();
  for (const item of state.owned) {
    const card = document.createElement('div');
    card.className = 'gear-candidate';
    const name = document.createElement('strong');
    name.textContent = `${item.quality} ${item.name} · ${item.tier}阶`;
    const power = document.createElement('span');
    power.textContent = `基础武力值：${item.power}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.equipped = String(item.id === state.equippedId);
    button.textContent = item.id === state.equippedId ? '已装备' : '装备';
    button.setAttribute('aria-label', `${button.textContent}${item.quality}${item.name}`);
    button.addEventListener('click', () => writeGear(item.id));
    card.append(name, power, button);
    byId('gear-candidates').append(card);
  }
}

async function readGear() {
  const request = ++gearRequest;
  gearReady = false;
  gearControls();
  byId('retry-gear-entry').hidden = true;
  byId('retry-gear').hidden = true;
  try {
    const response = await fetch('/api/gear-state');
    if (request !== gearRequest) return;
    if (response.status === 404) {
      gearState = null;
      byId('open-gear').hidden = true;
      byId('gear-entry-message').textContent = '';
      byId('gear-candidates').replaceChildren();
      if (!byId('gear-panel').hidden) showRealmProfile();
      return;
    }
    if (!response.ok) throw new Error('read_failed');
    const result = await response.json();
    if (request !== gearRequest) return;
    displayGear(result.state);
    gearReady = true;
    byId('open-gear').hidden = false;
    byId('gear-entry-message').textContent = '';
    byId('gear-message').textContent = '';
    gearControls();
  } catch {
    if (request !== gearRequest) return;
    byId('gear-entry-message').textContent = '装备读取失败，请重试。';
    byId('gear-message').textContent = '装备读取失败，请重试。';
    byId('retry-gear-entry').hidden = false;
    byId('retry-gear').hidden = false;
  }
}

async function writeGear(itemId) {
  if (gearBusy || !gearReady) return;
  gearBusy = true;
  ++gearRequest;
  gearControls();
  byId('gear-message').textContent = '正在穿戴……';
  try {
    const response = await fetch(itemId ? '/api/gear-state/equip' : '/api/gear-state/auto-equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemId ? { itemId, expectedRevision: gearState.revision } : { expectedRevision: gearState.revision }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.error === 'gear_revision_conflict') {
        await readGear();
        if (gearReady) byId('gear-message').textContent = '装备记录已更新，请重新选择。';
        return;
      }
      throw new Error(result.error === 'gear_checkpoint_character_mismatch' ? '装备记录与当前角色不匹配。' : 'write_failed');
    }
    displayGear(result.state);
    byId('gear-message').textContent = '穿戴成功';
  } catch (error) {
    gearReady = false;
    byId('gear-message').textContent = error.message === '装备记录与当前角色不匹配。' ? error.message : '穿戴结果暂未确认，请重新读取装备。';
    byId('retry-gear').hidden = false;
  } finally {
    gearBusy = false;
    gearControls();
  }
}

byId('open-gear').addEventListener('click', () => {
  showPanel('gear-panel');
  byId('title').textContent = '装备';
  byId('gear-detail').hidden = true;
  byId('gear-candidates-panel').hidden = true;
  status('');
  byId('gear-message').textContent = '正在读取装备……';
  readGear();
});
byId('gear-equipped').addEventListener('click', () => {
  byId('gear-detail').hidden = false;
  byId('gear-candidates-panel').hidden = true;
});
byId('change-gear').addEventListener('click', () => {
  byId('gear-candidates-panel').hidden = false;
});
byId('gear-auto').addEventListener('click', () => writeGear());
byId('retry-gear').addEventListener('click', readGear);
byId('retry-gear-entry').addEventListener('click', readGear);
byId('back-gear').addEventListener('click', showRealmProfile);

let breakthroughState = null;
let breakthroughRequest = 0;
let breakthroughBusy = false;
let breakthroughReady = false;

function breakthroughControls() {
  for (const button of byId('breakthrough-panel').querySelectorAll('button')) {
    const navigation = button.id === 'back-breakthrough' || button.id === 'retry-breakthrough' || button.id === 'close-breakthrough-reward';
    button.disabled = breakthroughBusy || (!navigation && !breakthroughReady) || button.dataset.claimed === 'true';
  }
  byId('retry-breakthrough-entry').disabled = breakthroughBusy;
}

function displayBreakthrough(state) {
  breakthroughState = state;
  byId('breakthrough-realm').textContent = state.realm.name;
  byId('breakthrough-attributes').replaceChildren();
  for (const [label, value] of [
    ['攻击', state.realm.attributes.attack], ['防御', state.realm.attributes.defense],
    ['气血', state.realm.attributes.health], ['领悟收益', state.realm.comprehensionGain],
  ]) addFact(byId('breakthrough-attributes'), label, value);
  byId('breakthrough-conditions').replaceChildren();
  for (const condition of state.conditions) {
    const card = document.createElement('div');
    card.className = 'breakthrough-condition';
    const name = document.createElement('strong');
    name.textContent = condition.label;
    const progress = document.createElement('span');
    progress.textContent = `${condition.current}/${condition.target}`;
    const reward = document.createElement('span');
    reward.textContent = `${condition.reward.name} ${condition.reward.amount}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.claimed = String(condition.claimed);
    button.textContent = condition.claimed ? '已完成' : '完成';
    button.setAttribute('aria-label', `${button.textContent}：${condition.label}`);
    button.addEventListener('click', () => writeBreakthrough(condition.id));
    card.append(name, reward, progress, button);
    byId('breakthrough-conditions').append(card);
  }
  byId('advance-breakthrough').hidden = !state.canAdvance;
  byId('breakthrough-result').hidden = !state.advanced;
}

async function readBreakthrough() {
  const request = ++breakthroughRequest;
  breakthroughReady = false;
  breakthroughControls();
  byId('retry-breakthrough-entry').hidden = true;
  byId('retry-breakthrough').hidden = true;
  try {
    const response = await fetch('/api/breakthrough-state');
    if (request !== breakthroughRequest) return;
    if (response.status === 404) {
      breakthroughState = null;
      byId('open-breakthrough').hidden = true;
      byId('breakthrough-entry-message').textContent = '';
      byId('breakthrough-conditions').replaceChildren();
      byId('breakthrough-reward').hidden = true;
      byId('breakthrough-result').hidden = true;
      if (!byId('breakthrough-panel').hidden) showRealmProfile();
      return;
    }
    if (!response.ok) throw new Error('read_failed');
    const result = await response.json();
    if (request !== breakthroughRequest) return;
    displayBreakthrough(result.state);
    breakthroughReady = true;
    byId('open-breakthrough').hidden = false;
    byId('breakthrough-entry-message').textContent = '';
    byId('breakthrough-message').textContent = '';
    breakthroughControls();
  } catch {
    if (request !== breakthroughRequest) return;
    byId('breakthrough-entry-message').textContent = '突破记录读取失败，请重试。';
    byId('breakthrough-message').textContent = '突破记录读取失败，请重试。';
    byId('retry-breakthrough-entry').hidden = false;
    byId('retry-breakthrough').hidden = false;
  }
}

async function writeBreakthrough(conditionId) {
  if (breakthroughBusy || !breakthroughReady) return;
  breakthroughBusy = true;
  ++breakthroughRequest;
  breakthroughControls();
  byId('breakthrough-reward').hidden = true;
  byId('breakthrough-message').textContent = conditionId ? '正在领取……' : '正在突破……';
  const previousReceiptIds = new Set(breakthroughState.receipts.map((receipt) => receipt.id));
  try {
    const response = await fetch(conditionId ? '/api/breakthrough-state/claim' : '/api/breakthrough-state/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conditionId ? { conditionId, expectedRevision: breakthroughState.revision } : { expectedRevision: breakthroughState.revision }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.error === 'realm_revision_conflict') {
        await readBreakthrough();
        if (breakthroughReady) byId('breakthrough-message').textContent = '突破记录已更新，请重新选择。';
        return;
      }
      if (result.error === 'breakthrough_conditions_unclaimed') {
        byId('breakthrough-message').textContent = '请先完成三项条件奖励领取。';
        return;
      }
      throw new Error(result.error === 'realm_checkpoint_character_mismatch' ? '突破记录与当前角色不匹配。' : 'write_failed');
    }
    displayBreakthrough(result.state);
    if (conditionId) {
      const receipt = result.state.receipts.find((item) => item.conditionId === conditionId && !previousReceiptIds.has(item.id));
      if (receipt) {
        byId('breakthrough-reward-text').textContent = `${receipt.reward.name} ${receipt.reward.amount}`;
        byId('breakthrough-reward').hidden = false;
      }
      byId('breakthrough-message').textContent = receipt ? '领取成功' : '该奖励已领取';
    } else {
      byId('breakthrough-message').textContent = result.state.advanced ? '突破成功' : '';
    }
  } catch (error) {
    breakthroughReady = false;
    byId('breakthrough-message').textContent = error.message === '突破记录与当前角色不匹配。' ? error.message : '操作结果暂未确认，请重新读取突破。';
    byId('retry-breakthrough').hidden = false;
  } finally {
    breakthroughBusy = false;
    breakthroughControls();
  }
}

byId('open-breakthrough').addEventListener('click', () => {
  showPanel('breakthrough-panel');
  byId('title').textContent = '境界突破';
  byId('breakthrough-reward').hidden = true;
  status('');
  byId('breakthrough-message').textContent = '正在读取突破记录……';
  readBreakthrough();
});
byId('close-breakthrough-reward').addEventListener('click', () => { byId('breakthrough-reward').hidden = true; });
byId('advance-breakthrough').addEventListener('click', () => writeBreakthrough());
byId('retry-breakthrough').addEventListener('click', readBreakthrough);
byId('retry-breakthrough-entry').addEventListener('click', readBreakthrough);
byId('back-breakthrough').addEventListener('click', showRealmProfile);

function displayPlayerMartial() {
  const growth = equipmentState?.growth?.uppercut;
  byId('player-martial-facts').replaceChildren();
  if (!growth) {
    byId('upgrade-martial').disabled = true;
    byId('player-martial-material').textContent = '';
    byId('player-martial-limit').textContent = '';
    return;
  }
  for (const [label, value] of [
    ['等级', growth.level], ['攻击', growth.attributes.attack],
    ['防御', growth.attributes.defense], ['气血', growth.attributes.health],
  ]) addFact(byId('player-martial-facts'), label, value);
  const quantity = growth.material.quantity;
  byId('player-martial-material').textContent = `${growth.material.name}材料：${quantity === null ? '数量未确认' : quantity}；升级消耗 ${growth.upgrade.cost}`;
  byId('player-martial-limit').textContent = !growth.upgrade.supported ? '后续升级暂未开放' : quantity === null ? '材料数量确认后可升级' : quantity < growth.upgrade.cost ? '上勾拳材料不足' : `可升级至 ${growth.upgrade.targetLevel} 级`;
  byId('upgrade-martial').disabled = equipping || !martialGrowthReady || !growth.upgrade.supported || quantity === null || quantity < growth.upgrade.cost;
}

function openPlayerMartial() {
  showPanel('player-martial-detail');
  byId('title').textContent = '武学养成';
  status('正在读取武学……');
  displayPlayerMartial();
  readCheckpoint();
}

byId('back-player-martial').addEventListener('click', () => {
  showPanel('equipment-panel');
  byId('title').textContent = '武学';
  status('正在读取武学……');
  readCheckpoint();
});
byId('retry-player-martial').addEventListener('click', readCheckpoint);
byId('upgrade-martial').addEventListener('click', async () => {
  if (equipping || !martialGrowthReady) return;
  equipping = true;
  martialGrowthReady = false;
  ++checkpointRequest;
  byId('upgrade-martial').disabled = true;
  byId('back-player-martial').disabled = true;
  byId('retry-player-martial').disabled = true;
  byId('auto-equip').disabled = true;
  byId('edit-equipment').disabled = true;
  for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = true;
  status('正在升级……');
  try {
    const response = await fetch('/api/martial-state/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'uppercut-reference', expectedRevision: equipmentState.revision }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.error === 'martial_revision_conflict') {
        await readCheckpoint();
        if (martialGrowthReady) status('武学记录已更新，请重新选择。');
        return;
      }
      const messages = {
        martial_upgrade_not_observed: '后续升级暂未开放，请重新读取武学。',
        martial_material_unknown: '材料数量未确认，请重新读取武学。',
        martial_material_insufficient: '上勾拳材料不足，请重新读取武学。',
      };
      throw new Error(messages[result.error] || '升级结果暂未确认，请重新读取武学。');
    }
    martialGrowthReady = true;
    displayCheckpoint(result.state);
    status('升级成功');
  } catch (error) {
    status(error.message.startsWith('后续升级') || error.message.startsWith('材料数量') || error.message.startsWith('上勾拳材料') ? error.message : '升级结果暂未确认，请重新读取武学。', true);
    byId('retry-player-martial').hidden = false;
    byId('retry-equipment').hidden = false;
  } finally {
    equipping = false;
    byId('back-player-martial').disabled = false;
    byId('retry-player-martial').disabled = false;
    displayPlayerMartial();
  }
});
