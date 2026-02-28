import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureDef, FixtureType } from '@dmx-console/shared';
import { BUILTIN_FIXTURES } from './builtins.js';
import { parseQxf } from './parser.js';

const FIXTURES_DIR = resolve(fileURLToPath(import.meta.url), '../../../../../fixtures');

// In-memory fixture library (loaded at startup)
let library = new Map<string, FixtureDef>();

export async function loadFixtureLibrary(): Promise<void> {
  library = new Map();

  // Load built-ins first
  for (const f of BUILTIN_FIXTURES) {
    library.set(f.id, f);
  }

  // Load QLC+ .qxf files from the fixtures directory
  let files: string[] = [];
  try {
    files = await readdir(FIXTURES_DIR);
  } catch {
    console.warn('[fixtures] fixtures/ directory not found, using built-ins only');
    return;
  }

  const qxfFiles = files.filter((f) => f.endsWith('.qxf'));
  let loaded = 0;
  let failed = 0;

  for (const filename of qxfFiles) {
    try {
      const content = await readFile(join(FIXTURES_DIR, filename), 'utf-8');
      const def = await parseQxf(content);
      library.set(def.id, def);
      loaded++;
    } catch (err) {
      console.warn(`[fixtures] failed to parse ${filename}:`, (err as Error).message);
      failed++;
    }
  }

  console.log(
    `[fixtures] loaded ${library.size} fixtures (${BUILTIN_FIXTURES.length} built-in, ${loaded} QLC+, ${failed} failed)`,
  );
}

export function getFixtureLibrary(): FixtureDef[] {
  return [...library.values()];
}

export function getFixtureDef(id: string): FixtureDef | undefined {
  return library.get(id);
}

export function queryFixtures(params: {
  type?: FixtureType;
  manufacturer?: string;
  search?: string;
}): FixtureDef[] {
  let result = [...library.values()];

  if (params.type) {
    result = result.filter((f) => f.type === params.type);
  }
  if (params.manufacturer) {
    const mfr = params.manufacturer.toLowerCase();
    result = result.filter((f) => f.manufacturer.toLowerCase().includes(mfr));
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    result = result.filter(
      (f) =>
        f.model.toLowerCase().includes(q) ||
        f.manufacturer.toLowerCase().includes(q) ||
        f.id.includes(q),
    );
  }

  return result.sort((a, b) => {
    const mfrCmp = a.manufacturer.localeCompare(b.manufacturer);
    return mfrCmp !== 0 ? mfrCmp : a.model.localeCompare(b.model);
  });
}
