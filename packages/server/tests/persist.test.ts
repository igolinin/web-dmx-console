import { describe, it, expect } from 'vitest';
import type { Show } from '@dmx-console/shared';
import { show, hydrateShow } from '../src/store/show.js';

describe('hydrateShow', () => {
  it('starts with an empty fixture patch by default', () => {
    expect(show.fixtures).toEqual([]);
  });

  it('merges a loaded show into the live singleton', () => {
    const loaded: Partial<Show> = {
      meta: {
        title: 'Restored Show',
        author: 'tester',
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-02T00:00:00.000Z',
      },
      fixtures: [
        {
          id: 'f1',
          defId: 'builtin_rgb_3ch',
          universe: 0,
          address: 1,
          label: 'PAR 1',
          modeIndex: 0,
          groupIds: [],
        },
      ],
    };

    hydrateShow(loaded);

    // Loaded keys are applied...
    expect(show.meta.title).toBe('Restored Show');
    expect(show.fixtures).toHaveLength(1);
    expect(show.fixtures[0]?.label).toBe('PAR 1');
    // ...and keys absent from the loaded object keep their defaults.
    expect(show.artnet.universes).toEqual([0]);
    expect(Array.isArray(show.cueLists)).toBe(true);
  });
});
