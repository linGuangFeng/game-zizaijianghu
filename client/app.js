const byId = (id) => document.getElementById(id);
const panels = ['appearance-step', 'name-step', 'saved-step', 'martial-list', 'martial-detail'];
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
  byId('portrait-area').hidden = id === 'martial-list' || id === 'martial-detail';
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
  byId('saved-name').textContent = character.name;
  byId('saved-appearance').textContent = genderLabels[character.appearanceId];
  showPanel('saved-step');
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
