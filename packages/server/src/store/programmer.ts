import type { ChannelValues } from '@dmx-console/shared';

/** Per-fixture programmer values. key = fixture UUID, value = channelName → 0–255. */
const programmerMap = new Map<string, ChannelValues>();

export const programmer = {
  get values(): Map<string, ChannelValues> {
    return programmerMap;
  },

  /** Merge channels into the programmer for a single fixture (LTP per channel). */
  set(fixtureId: string, channels: ChannelValues): void {
    const existing = programmerMap.get(fixtureId) ?? {};
    programmerMap.set(fixtureId, { ...existing, ...channels });
  },

  /** Clear programmer for one fixture or for all fixtures. */
  clear(fixtureId?: string): void {
    if (fixtureId !== undefined) {
      programmerMap.delete(fixtureId);
    } else {
      programmerMap.clear();
    }
  },

  /** Serialisable snapshot for REST responses. */
  snapshot(): { fixtureId: string; channels: ChannelValues }[] {
    return [...programmerMap.entries()].map(([fixtureId, channels]) => ({
      fixtureId,
      channels: { ...channels },
    }));
  },
};
