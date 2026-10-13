import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCharacterStore } from './store.js';
import { createRealmStore } from './realm-store.js';
import { createMartialStore } from './martial-store.js';

// Offline operation: stop the local server before invoking this migration.
export async function migrateAssets(characterFile, realmFile, martialFile) {
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
  let martial = null;
  let martialDigest = null;
  if (martialFile) {
    const target = await realpath(martialFile);
    if (target === await realpath(characterFile) || (realmFile && target === await realpath(realmFile))) throw new Error('Martial source must use a separate file.');
    const bytes = await readFile(martialFile);
    const validated = await createMartialStore({ file: martialFile, character: store.get() });
    validated.get(store.get());
    martial = JSON.parse(bytes.toString('utf8'));
    if (!(await readFile(martialFile)).equals(bytes)) throw new Error('Martial source changed during migration.');
    martialDigest = createHash('sha256').update(bytes).digest('hex');
  }
  return store.migrateAssets(realm, digest, martial, martialDigest);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const flags = args.filter((_, index) => index % 2 === 0);
  if (![2, 4, 6].includes(args.length) || args[0] !== '--character' || new Set(flags).size !== flags.length || !flags.every((flag) => ['--character', '--realm', '--martial'].includes(flag))) {
    console.error('Stop the server first. Usage: node server/migrate-assets.js --character FILE [--realm FILE] [--martial FILE]');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify({ state: await migrateAssets(resolve(args[1]), flags.includes('--realm') ? resolve(args[args.indexOf('--realm') + 1]) : undefined, flags.includes('--martial') ? resolve(args[args.indexOf('--martial') + 1]) : undefined) })); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
