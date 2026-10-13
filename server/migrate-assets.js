import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCharacterStore } from './store.js';
import { createRealmStore } from './realm-store.js';

// Offline operation: stop the local server before invoking this migration.
export async function migrateAssets(characterFile, realmFile) {
  const store = await createCharacterStore(characterFile);
  let realm = null;
  let digest = 'none';
  if (realmFile) {
    if (await realpath(characterFile) === await realpath(realmFile)) throw new Error('Realm source must differ from character file.');
    const bytes = await readFile(realmFile);
    const validated = await createRealmStore({ file: realmFile, character: store.get() });
    realm = JSON.parse(bytes.toString('utf8'));
    if (realm.checkpoint === 'observed-before-training') validated.get(store.get());
    else validated.getBreakthrough(store.get());
    if (!(await readFile(realmFile)).equals(bytes)) throw new Error('Realm source changed during migration.');
    digest = createHash('sha256').update(bytes).digest('hex');
  }
  return store.migrateAssets(realm, digest);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (![2, 4].includes(args.length) || args[0] !== '--character' || (args.length === 4 && args[2] !== '--realm')) {
    console.error('Stop the server first. Usage: node server/migrate-assets.js --character FILE [--realm FILE]');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify({ state: await migrateAssets(resolve(args[1]), args[3] ? resolve(args[3]) : undefined) })); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
