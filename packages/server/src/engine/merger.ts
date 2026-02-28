import type { PatchedFixture, ChannelValues } from '@dmx-console/shared';
import type { UniverseBuffer } from '../artnet/universe.js';
import { getFixtureDef } from '../fixtures/loader.js';

/** Channel groups that use HTP (Highest Takes Precedence) merge. */
const HTP_GROUPS = new Set(['Intensity']);

/**
 * Merge cue values and programmer values into a universe buffer using HTP/LTP rules:
 *   - Intensity channels → HTP (max of cue and programmer)
 *   - All other channels → LTP (programmer wins if active, else cue)
 *
 * Clears the buffer before writing, so every call produces a fresh snapshot.
 */
export function mergeToBuffer(
  fixtures: PatchedFixture[],
  cueValues: Map<string, ChannelValues>,
  programmerValues: Map<string, ChannelValues>,
  target: UniverseBuffer,
): void {
  // Clear all previously active universes
  for (const u of target.activeUniverses()) {
    target.fill(u, 0);
  }

  for (const fixture of fixtures) {
    const def = getFixtureDef(fixture.defId);
    if (!def) continue;

    const mode = def.modes[fixture.modeIndex];
    if (!mode) continue;

    const cue = cueValues.get(fixture.id) ?? {};
    const prog = programmerValues.get(fixture.id) ?? {};

    mode.channelNames.forEach((channelName, i) => {
      const channelDef = def.channels[channelName];
      const group = channelDef?.group ?? 'Nothing';
      // DMX channel is 1-based: fixture.address + channel offset
      const dmxChannel = fixture.address + i;

      const cueVal = cue[channelName] ?? 0;
      const progVal = prog[channelName];

      let finalVal: number;
      if (progVal !== undefined) {
        finalVal = HTP_GROUPS.has(group) ? Math.max(cueVal, progVal) : progVal;
      } else {
        finalVal = cueVal;
      }

      target.setChannel(fixture.universe, dmxChannel, finalVal);
    });
  }
}
