export const assetNames = { 'baodian-token-reference': '宝典令', 'yuanbao-reference': '元宝', 'jianghu-experience': '江湖阅历', 'uppercut-material-reference': '上勾拳' };
export function assetAccounts(entries) {
  return Object.entries(assetNames).filter(([id]) => ['baodian-token-reference', 'yuanbao-reference'].includes(id) || entries.some((e) => e.assetId === id)).map(([id, name]) => {
    const available = entries.filter((e) => e.assetId === id).reduce((sum, e) => sum + e.delta, 0);
    return { id, name, total: ['jianghu-experience', 'uppercut-material-reference'].includes(id) ? available : null, available };
  });
}
export function validAssets(value) {
  return value && Number.isSafeInteger(value.revision) && value.revision >= 0 && Array.isArray(value.entries)
    && new Set(value.entries.map((e) => e?.id)).size === value.entries.length
    && value.entries.every((e) => typeof e?.id === 'string' && e.id.length > 0 && Object.hasOwn(assetNames, e.assetId)
      && Number.isSafeInteger(e.delta) && ['local-test-day1', 'realm-import', 'realm-training', 'martial-import', 'martial-upgrade'].includes(e.source)
      && (e.source === 'realm-training' ? e.assetId === 'jianghu-experience' && e.delta < 0 : e.source === 'martial-upgrade' ? e.assetId === 'uppercut-material-reference' && e.delta === -1 : e.delta >= 0))
    && assetAccounts(value.entries).every((a) => Number.isSafeInteger(a.available) && a.available >= 0);
}
export function creditCommerce(assets, grants) {
  const entries = grants.filter((g) => ['baodian-token-reference', 'yuanbao-reference'].includes(g.reward.id))
    .filter((g) => !assets.entries.some((e) => e.id === g.id))
    .map((g) => ({ id: g.id, assetId: g.reward.id, delta: g.reward.quantity, source: 'local-test-day1' }));
  return entries.length ? { ...assets, revision: assets.revision + 1, entries: [...assets.entries, ...entries] } : assets;
}
