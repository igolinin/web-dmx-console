import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FixtureDef } from '@dmx-console/shared';

const sampleDef: FixtureDef = {
  id: 'acme_thing',
  manufacturer: 'Acme',
  model: 'Thing',
  type: 'Dimmer',
  channels: { Dim: { name: 'Dim', group: 'Intensity' } },
  modes: [{ name: '1 Channel', channelNames: ['Dim'] }],
};

// The store module fires bootstrap fetches on import, so stub fetch first.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        json: () =>
          Promise.resolve(
            typeof url === 'string' && url.includes('/api/fixtures') ? [sampleDef] : {},
          ),
      }),
    ),
  );
});

describe('useShowStore fixture defs', () => {
  it('setDefMap keys definitions by id', async () => {
    const { useShowStore } = await import('../src/store/useShow.js');
    useShowStore.getState().setDefMap([sampleDef]);
    expect(useShowStore.getState().defMap.acme_thing?.model).toBe('Thing');
  });

  it('refreshDefs re-fetches the library into defMap', async () => {
    const { useShowStore } = await import('../src/store/useShow.js');
    useShowStore.getState().setDefMap([]); // clear
    await useShowStore.getState().refreshDefs();
    expect(useShowStore.getState().defMap.acme_thing).toBeDefined();
  });
});
