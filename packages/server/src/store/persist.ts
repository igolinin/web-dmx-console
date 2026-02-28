import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Show } from '@dmx-console/shared';
import { DEFAULT_KEY_BINDINGS } from '@dmx-console/shared';

const SHOW_PATH = resolve(process.cwd(), 'show.json');

/** Write current show to disk. */
export async function saveShow(show: Show): Promise<void> {
  await writeFile(SHOW_PATH, JSON.stringify(show, null, 2), 'utf-8');
  console.log('[persist] show saved to', SHOW_PATH);
}

/** Load show from disk. Returns null if file doesn't exist. */
export async function loadShowFromDisk(): Promise<Show | null> {
  try {
    const content = await readFile(SHOW_PATH, 'utf-8');
    const loaded = JSON.parse(content) as Show;
    // Migrate: ensure settings field exists (older save files may lack it)
    if (!loaded.settings) {
      loaded.settings = { keyBindings: DEFAULT_KEY_BINDINGS, playbackMasters: [] };
    }
    return loaded;
  } catch {
    return null;
  }
}

export { SHOW_PATH };
