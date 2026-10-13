const byId = (id) => document.getElementById(id);
const panels = ['appearance-step', 'name-step', 'jianghu-panel', 'saved-step', 'martial-list', 'martial-detail', 'equipment-panel', 'realm-panel'];
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
  byId('portrait-area').hidden = id === 'martial-list' || id === 'martial-detail' || id === 'equipment-panel' || id === 'jianghu-panel' || id === 'realm-panel';
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
    const card = document.createElement(canUseCard ? 'button' : 'div');
    card.className = 'owned-card';
    if (canUseCard) {
      card.type = 'button';
      card.disabled = equipping;
      card.setAttribute('aria-label', equippedSlot ? '卸下' + equippedSkillNames[skill.id] + '卡片' : '装配' + equippedSkillNames[skill.id]);
      card.addEventListener('click', () => equippedSlot ? unequipMartial(equippedSlot.position) : equipMartialSkill(skill.id));
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
}

async function readCheckpoint() {
  const request = ++checkpointRequest;
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
      editingEquipment = false;
      byId('equipment-slots').replaceChildren();
      byId('equipment-owned').replaceChildren();
      byId('equipment-task').textContent = '';

      byId('open-equipment').hidden = true;
      byId('checkpoint-message').textContent = '';
      if (!byId('equipment-panel').hidden) {
        showJianghu();
      }
      return;
    }
    if (!response.ok) throw new Error(response.status === 409 ? 'mismatch' : 'read_failed');
    const result = await response.json();
    if (request !== checkpointRequest) return;
    displayCheckpoint(result.state);
    byId('open-equipment').hidden = false;
    byId('auto-equip').disabled = false;
    byId('edit-equipment').disabled = false;
    for (const button of document.querySelectorAll('#equipment-slots button, #equipment-owned button')) button.disabled = false;
    if (!byId('equipment-panel').hidden) status('');
  } catch (error) {
    if (request !== checkpointRequest) return;
    const message = error.message === 'mismatch' ? '武学记录与当前角色不匹配。' : '武学读取失败，请重试。';
    byId('checkpoint-message').textContent = message;
    byId('retry-checkpoint').hidden = false;
    if (!byId('equipment-panel').hidden) {
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
