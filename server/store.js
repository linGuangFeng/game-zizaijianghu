import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const appearanceOptions = Object.freeze([
  Object.freeze({ id: 'male-reference-0002', label: '男角色参考外观', evidence: 'EVD-0002' }),
  Object.freeze({ id: 'female-reference-0003', label: '女角色参考外观', evidence: 'EVD-0003' }),
]);

// This is our local transport/storage shape, not the original game's name rules.
export function isCharacter(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.name === 'string'
    && appearanceOptions.some((option) => option.id === value.appearanceId);
}

export async function createCharacterStore(file) {
  let character = null;
  try {
    character = JSON.parse(await readFile(file, 'utf8'));
    if (!isCharacter(character)) throw new Error('Invalid local character save.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let queue = Promise.resolve();
  return {
    get() { return character === null ? null : { ...character }; },
    save(next) {
      const operation = queue.then(async () => {
        await mkdir(dirname(file), { recursive: true });
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: 'utf8', flag: 'wx' });
          await rename(temporary, file);
          character = { ...next };
          return { ...character };
        } finally {
          await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}