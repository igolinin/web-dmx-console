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
    chaseBpm: 120,
  },
  artnet: {
    host: '255.255.255.255',
    broadcast: true,
    refreshHz: 30,
    universes: [0],
  },
};

// Broadcaster wired up by the server entrypoint so the store needn't import the
// Socket.io instance (avoids a circular dependency). Notifies clients to refresh
// their show state after any mutation.
let broadcaster: (() => void) | null = null;

export function setShowBroadcaster(fn: () => void): void {
  broadcaster = fn;
}

export function touchShow(): void {
  show.meta.modifiedAt = new Date().toISOString();
  broadcaster?.();
}

/**
 * Merge a show loaded from disk into the live `show` singleton, mutating it in
 * place so existing references (engines, routers) stay valid. Keys absent from
 * `loaded` keep their current default.
 */
export function hydrateShow(loaded: Partial<Show>): void {
  Object.assign(show, loaded);
  // Migrate: chaseBpm became a global setting (was previously per-chase `bpm`).
  if (show.settings.chaseBpm === undefined) {
    const legacyBpm = (loaded.chases?.[0] as { bpm?: number } | undefined)?.bpm;
    show.settings.chaseBpm = legacyBpm ?? 120;
  }
}
