const byId = (id) => document.getElementById(id);
const panels = ['appearance-step', 'name-step', 'saved-step'];
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
