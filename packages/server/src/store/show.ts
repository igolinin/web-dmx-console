import type { Show } from '@dmx-console/shared';
import { DEFAULT_KEY_BINDINGS, DEFAULT_PLAYBACK_MASTERS } from '@dmx-console/shared';

export const show: Show = {
  version: '1',
  meta: {
    title: 'Untitled Show',
    author: '',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  },
  fixtures: [],
  fixtureGroups: [],
  cueLists: [],
  chases: [],
  shapes: [],
  settings: {
    keyBindings: DEFAULT_KEY_BINDINGS,
    playbackMasters: DEFAULT_PLAYBACK_MASTERS.map((m) => ({ ...m })),
  },
  artnet: {
    host: '255.255.255.255',
    broadcast: true,
    refreshHz: 30,
    universes: [0],
  },
};

export function touchShow(): void {
  show.meta.modifiedAt = new Date().toISOString();
}

/**
 * Merge a show loaded from disk into the live `show` singleton, mutating it in
 * place so existing references (engines, routers) stay valid. Keys absent from
 * `loaded` keep their current default.
 */
export function hydrateShow(loaded: Partial<Show>): void {
  Object.assign(show, loaded);
}
