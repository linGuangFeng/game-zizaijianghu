import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const saveFile = resolve(process.env.CHARACTER_SAVE_FILE ?? resolve(root, '.local/character.json'));
const server = await createApp({
  saveFile, clientDirectory: resolve(root, 'client'),
  martialSaveFile: resolve(process.env.MARTIAL_SAVE_FILE ?? (saveFile + '.martial.json')),
  martialCheckpoint: process.env.MARTIAL_CHECKPOINT,
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local foundation: http://127.0.0.1:${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());