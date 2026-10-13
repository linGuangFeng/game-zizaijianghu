import { createServer } from 'node:http';
import { createGearStore, GearStateError, gearItems } from './gear-store.js';
import { createRealmStore, RealmStateError, realmTraining, breakthroughConditions, ninthTrainingTypes } from './realm-store.js';
import { martialCatalog } from './martial-catalog.js';
import { createMartialStore, MartialStateError } from './martial-store.js';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { appearanceOptions, createCharacterStore, isCharacter, CommerceStateError, testProduct } from './store.js';

const mediaTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

class RequestBodyError extends Error {
  constructor(statusCode, errorCode) {
    super(errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestBodyError(415, 'json_required');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= 16384) chunks.push(chunk);
  }
  if (bytes > 16384) throw new RequestBodyError(413, 'body_too_large');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestBodyError(400, 'invalid_json'); }
}
function within(root, target) {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function serveStatic(request, response, pathname, clientDirectory) {
  if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'method_not_allowed' });
  if (pathname.includes('\\') || pathname.includes(':') || pathname.includes('\0')
    || pathname.split('/').includes('..')) return json(response, 404, { error: 'not_found' });
  const candidate = resolve(clientDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!within(clientDirectory, candidate)) return json(response, 404, { error: 'not_found' });
  try {
    // Real paths also prevent symlinks/junctions from exposing files outside client/.
    const [root, file] = await Promise.all([realpath(clientDirectory), realpath(candidate)]);
    if (!within(root, file) || !(await stat(file)).isFile()) return json(response, 404, { error: 'not_found' });
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mediaTypes[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return json(response, 404, { error: 'not_found' });
    throw error;
  }
}

export async function createApp({ saveFile, clientDirectory, martialSaveFile = `${saveFile}.martial.json`, martialCheckpoint, realmSaveFile = `${saveFile}.realm.json`, realmCheckpoint, gearSaveFile = `${saveFile}.gear.json`, gearCheckpoint }) {
  if (resolve(martialSaveFile) === resolve(saveFile)) throw new Error('Martial and character saves must use separate files.');
  if ([resolve(saveFile), resolve(martialSaveFile)].includes(resolve(realmSaveFile))) throw new Error('Realm save must use a separate file.');
  if ([resolve(saveFile), resolve(martialSaveFile), resolve(realmSaveFile)].includes(resolve(gearSaveFile))) throw new Error('Gear save must use a separate file.');
  const store = await createCharacterStore(saveFile);
  const martialStore = await createMartialStore({ file: martialSaveFile, checkpoint: martialCheckpoint, character: store.get() });
  const realmStore = await createRealmStore({ file: realmSaveFile, checkpoint: realmCheckpoint, character: store.get() });
  const gearStore = await createGearStore({ file: gearSaveFile, checkpoint: gearCheckpoint, character: store.get() });
  const clientRoot = resolve(clientDirectory);
  return createServer(async (request, response) => {
    try {
      let pathname;
      try { pathname = decodeURIComponent(request.url.split('?')[0]); }
      catch { return json(response, 400, { error: 'invalid_path' }); }
      if (pathname === '/api/health' && request.method === 'GET') return json(response, 200, { status: 'ok', scope: 'local-foundation' });
      if (pathname === '/api/appearance-options' && request.method === 'GET') return json(response, 200, { options: appearanceOptions });
      if (pathname === '/api/reference/martial-catalog') {
        return request.method === 'GET'
          ? json(response, 200, martialCatalog)
          : json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname === '/api/martial-state') {
        return request.method === 'GET'
          ? json(response, 200, { state: martialStore.get(store.get()) })
          : json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname === '/api/martial-state/auto-equip' || pathname === '/api/martial-state/unequip') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        let bytes = 0;
        for await (const chunk of request) bytes += chunk.length;
        if (bytes !== 0) return json(response, 400, { error: 'empty_body_required' });
        const action = pathname.endsWith('/unequip') ? martialStore.unequip : martialStore.equip;
        return json(response, 200, { state: await action(() => store.get()) });
      }
      if (pathname === '/api/martial-state/unequip-slot') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        if (body === null || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== 1 || ![1, 2].includes(body.position)) {
          return json(response, 400, { error: 'invalid_martial_slot' });
        }
        return json(response, 200, { state: await martialStore.unequipSlot(body.position, () => store.get()) });
      }
      if (pathname === '/api/martial-state/equip-skill') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        if (body === null || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== 1 || !['uppercut-reference', 'ruwu-sword-reference'].includes(body.skillId)) {
          return json(response, 400, { error: 'invalid_martial_skill' });
        }
        return json(response, 200, { state: await martialStore.equipSkill(body.skillId, () => store.get()) });
      }
      if (pathname === '/api/martial-state/upgrade') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
          || body.skillId !== 'uppercut-reference' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
          return json(response, 400, { error: 'invalid_martial_upgrade' });
        }
        return json(response, 200, { state: await martialStore.upgrade(body.expectedRevision, () => store.get()) });
      }
      if (pathname === '/api/realm-state') {
        return request.method === 'GET'
          ? json(response, 200, { state: realmStore.get(store.get()) })
          : json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname === '/api/realm-state/train') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
          || !realmTraining.some((training) => training.id === body.training)
          || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
          return json(response, 400, { error: 'invalid_realm_training' });
        }
        return json(response, 200, { state: await realmStore.train(body.training, body.expectedRevision, () => store.get()) });
      }
      if (pathname === '/api/breakthrough-state') {
        return request.method === 'GET'
          ? json(response, 200, { state: realmStore.getBreakthrough(store.get()) })
          : json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname === '/api/breakthrough-state/claim' || pathname === '/api/breakthrough-state/advance') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        const claim = pathname.endsWith('/claim');
        if (body === null || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== (claim ? 2 : 1)
          || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
          || (claim && !breakthroughConditions.some(({ id }) => id === body.conditionId))) {
          return json(response, 400, { error: claim ? 'invalid_breakthrough_claim' : 'invalid_breakthrough_advance' });
        }
        const state = claim
          ? await realmStore.claimBreakthrough(body.conditionId, body.expectedRevision, () => store.get())
          : await realmStore.advanceBreakthrough(body.expectedRevision, () => store.get());
        return json(response, 200, { state });
      }
      if (pathname === '/api/breakthrough-state/train') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
          || !ninthTrainingTypes.some(({ id }) => id === body.training)
          || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
          return json(response, 400, { error: 'invalid_ninth_training' });
        }
        return json(response, 200, { state: await realmStore.trainNinth(body.training, body.expectedRevision, () => store.get()) });
      }
      if (pathname === '/api/gear-state') {
        return request.method === 'GET'
          ? json(response, 200, { state: gearStore.get(store.get()) })
          : json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname === '/api/gear-state/equip' || pathname === '/api/gear-state/auto-equip') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        const automatic = pathname.endsWith('/auto-equip');
        if (body === null || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).length !== (automatic ? 1 : 2)
          || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
          || (!automatic && !gearItems.some((item) => item.id === body.itemId))) {
          return json(response, 400, { error: automatic ? 'invalid_gear_auto_equip' : 'invalid_gear_equip' });
        }
        const state = automatic
          ? await gearStore.autoEquip(body.expectedRevision, () => store.get())
          : await gearStore.equip(body.itemId, body.expectedRevision, () => store.get());
        return json(response, 200, { state });
      }
      if (pathname === '/api/test-commerce') {
        return request.method === 'GET'
          ? json(response, 200, { state: store.getCommerce() })
          : json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname === '/api/test-commerce/purchase' || pathname === '/api/test-commerce/claim-day1') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        const body = await readJson(request);
        const purchase = pathname.endsWith('/purchase');
        const valid = body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 2
          && (purchase
            ? body.productId === testProduct.id && typeof body.requestId === 'string' && body.requestId.length >= 1 && body.requestId.length <= 128
            : typeof body.orderId === 'string' && body.orderId.length > 0 && Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 0);
        if (!valid) return json(response, 400, { error: purchase ? 'invalid_commerce_purchase' : 'invalid_commerce_claim' });
        const state = purchase ? await store.purchase(body.requestId) : await store.claimDay1(body.orderId, body.expectedRevision);
        return json(response, 200, { state });
      }
      if (pathname === '/api/character') {
        if (request.method === 'GET') {
          const character = store.get();
          return character === null
            ? json(response, 404, { error: 'character_not_found' })
            : json(response, 200, { character });
        }
        if (request.method === 'PUT') {
          const character = await readJson(request);
          if (!isCharacter(character)) return json(response, 400, { error: 'invalid_character_shape' });
          return json(response, 200, { character: await store.save(character) });
        }
        return json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname.startsWith('/api/')) return json(response, 404, { error: 'not_found' });
      return await serveStatic(request, response, pathname, clientRoot);
    } catch (error) {
      if (error instanceof MartialStateError || error instanceof RealmStateError || error instanceof GearStateError || error instanceof CommerceStateError || error instanceof RequestBodyError) return json(response, error.statusCode, { error: error.errorCode });
      if (!response.headersSent) json(response, 500, { error: 'local_operation_failed' });
      else response.destroy();
    }
  });
}