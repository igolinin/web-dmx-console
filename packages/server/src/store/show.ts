import type { Show } from '@dmx-console/shared';

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
