import { createServer } from 'node:http';
import { martialCatalog } from './martial-catalog.js';
import { createMartialStore, MartialStateError } from './martial-store.js';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { appearanceOptions, createCharacterStore, isCharacter } from './store.js';

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

export async function createApp({ saveFile, clientDirectory, martialSaveFile = `${saveFile}.martial.json`, martialCheckpoint }) {
  if (resolve(martialSaveFile) === resolve(saveFile)) throw new Error('Martial and character saves must use separate files.');
  const store = await createCharacterStore(saveFile);
  const martialStore = await createMartialStore({ file: martialSaveFile, checkpoint: martialCheckpoint, character: store.get() });
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
      if (pathname === '/api/martial-state/auto-equip') {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' });
        let bytes = 0;
        for await (const chunk of request) bytes += chunk.length;
        if (bytes !== 0) return json(response, 400, { error: 'empty_body_required' });
        return json(response, 200, { state: await martialStore.equip(() => store.get()) });
      }
      if (pathname === '/api/character') {
        if (request.method === 'GET') {
          const character = store.get();
          return character === null
            ? json(response, 404, { error: 'character_not_found' })
            : json(response, 200, { character });
        }
        if (request.method === 'PUT') {
          if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
            return json(response, 415, { error: 'json_required' });
          }
          const chunks = [];
          let bytes = 0;
          for await (const chunk of request) {
            bytes += chunk.length;
            if (bytes <= 16384) chunks.push(chunk);
          }
          if (bytes > 16384) return json(response, 413, { error: 'body_too_large' });
          const body = Buffer.concat(chunks).toString('utf8');
          let character;
          try { character = JSON.parse(body); }
          catch { return json(response, 400, { error: 'invalid_json' }); }
          if (!isCharacter(character)) return json(response, 400, { error: 'invalid_character_shape' });
          return json(response, 200, { character: await store.save(character) });
        }
        return json(response, 405, { error: 'method_not_allowed' });
      }
      if (pathname.startsWith('/api/')) return json(response, 404, { error: 'not_found' });
      return await serveStatic(request, response, pathname, clientRoot);
    } catch (error) {
      if (error instanceof MartialStateError) return json(response, error.statusCode, { error: error.errorCode });
      if (!response.headersSent) json(response, 500, { error: 'local_operation_failed' });
      else response.destroy();
    }
  });
}