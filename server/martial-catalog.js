// Read-only transcription of observed UI, never a player's owned skills or combat rules.
export const martialCatalog = {
  kind: 'reference-catalog',
  evidence: ['docs/evidence/original-martial-list.jpg', 'docs/evidence/original-martial-detail.jpg'],
  observedSlots: [
    { position: 1, visibleState: 'plus-alert' },
    { position: 2, visibleState: 'plus-alert' },
    { position: 3, visibleState: 'plus-alert' },
    { position: 4, visibleState: 'locked' },
    { position: 5, visibleState: 'locked' },
    { position: 6, visibleState: 'locked' },
  ],
  entries: [{
    id: 'uppercut-reference',
    name: '上勾拳',
    categoryText: '通用',
    levelText: '1',
    starsText: '0星',
    roleText: '控制',
    cooldownText: '7.3秒',
    descriptionFragments: [
      '施展上勾拳', '对选中目标造成', '自身攻击力90%(27)',
      '并对范围内目标（最多3人）造成30%伤害', '且此技能对击中目标造成击飞效果',
    ],
    descriptionComplete: false,
    attributes: [
      { label: '攻击', text: '20+20' },
      { label: '防御', text: '10+10' },
      { label: '气血', text: '1000+1000' },
    ],
    observedTalentRows: [
      { levelText: 'Lv.25', visibleState: 'locked', readableText: '武学属性提升+0.5%', textComplete: true },
      { levelText: 'Lv.50', visibleState: 'locked', readableText: '攻击增加+200', textComplete: false },
      { levelText: 'Lv.75', visibleState: 'locked', readableText: '攻击增加+400', textComplete: false },
    ],
    upgradeCounterText: '0/1',
  }],
};