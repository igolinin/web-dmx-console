import { mkdir, writeFile, readdir, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureDef } from '@dmx-console/shared';

/** Directory holding user/LLM-generated fixtures as JSON files (`<id>.json`). */
export const USER_FIXTURES_DIR = resolve(
  fileURLToPath(import.meta.url),
  '../../../../../fixtures/user',
);

/** Persist a fixture definition to fixtures/user/<id>.json. */
export async function saveUserFixture(def: FixtureDef): Promise<void> {
  await mkdir(USER_FIXTURES_DIR, { recursive: true });
  const path = join(USER_FIXTURES_DIR, `${def.id}.json`);
  await writeFile(path, JSON.stringify(def, null, 2), 'utf-8');
}

/** Delete fixtures/user/<id>.json. Returns false if no such user fixture exists. */
export async function deleteUserFixture(id: string): Promise<boolean> {
  try {
    await unlink(join(USER_FIXTURES_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

/** Load all persisted user fixtures. Returns [] if the directory is absent. */
export async function loadUserFixtures(): Promise<FixtureDef[]> {
  let files: string[] = [];
  try {
    files = await readdir(USER_FIXTURES_DIR);
  } catch {
    return [];
  }

  const defs: FixtureDef[] = [];
  for (const filename of files.filter((f) => f.endsWith('.json'))) {
    try {
      const content = await readFile(join(USER_FIXTURES_DIR, filename), 'utf-8');
      defs.push(JSON.parse(content) as FixtureDef);
    } catch (err) {
      console.warn(`[fixtures] failed to load user fixture ${filename}:`, (err as Error).message);
    }
  }
  return defs;
}
