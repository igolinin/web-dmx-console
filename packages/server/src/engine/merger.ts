import type { PatchedFixture, ChannelValues } from '@dmx-console/shared';
import type { UniverseBuffer } from '../artnet/universe.js';
import { getFixtureDef } from '../fixtures/loader.js';

/** Channel groups that use HTP (Highest Takes Precedence) merge. */
const HTP_GROUPS = new Set(['Intensity']);

/**
 * One playback source feeding the merge. Layers are supplied in ascending LTP
 * priority (lowest first), e.g. cue lists, then chases, then shapes. The
 * programmer always sits above all layers.
 */
export interface MergeLayer {
  values: Map<string, ChannelValues>;
  /** 0–1 multiplier applied to this layer's Intensity-group channels (master fader). */
  intensityScale: number;
}

/**
 * Merge playback layers + programmer into a universe buffer:
 *   - Intensity channels → HTP: the highest value across every layer (each
 *     scaled by its master fader) and the programmer.
 *   - All other channels → LTP: programmer wins if set, otherwise the
 *     highest-priority layer that defines the channel.
 *   - Shape values sit on top of everything: any channel a shape defines is
 *     overridden by the shape output (the shape already oscillates around the
 *     programmer/LTP base), so shapes are visible even on programmer-held
 *     channels and intensity dips are not swallowed by HTP.
 *
 * Clears the buffer before writing, so every call produces a fresh snapshot.
 */
export function mergeToBuffer(
  fixtures: PatchedFixture[],
  layers: MergeLayer[],
  programmerValues: Map<string, ChannelValues>,
  target: UniverseBuffer,
  shapeValues = new Map<string, ChannelValues>(),
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

    const prog = programmerValues.get(fixture.id) ?? {};
    const shape = shapeValues.get(fixture.id);

    mode.channelNames.forEach((channelName, i) => {
      const channelDef = def.channels[channelName];
      const group = channelDef?.group ?? 'Nothing';
      // DMX channel is 1-based: fixture.address + channel offset
      const dmxChannel = fixture.address + i;

      const progVal = prog[channelName];
      const shapeVal = shape?.[channelName];

      let finalVal: number;
      if (shapeVal !== undefined) {
        // Shapes win outright on the channels they drive.
        finalVal = Math.round(shapeVal);
      } else if (HTP_GROUPS.has(group)) {
        // HTP: highest scaled value across all playback layers + programmer.
        let v = 0;
        for (const layer of layers) {
          const raw = layer.values.get(fixture.id)?.[channelName];
          if (raw !== undefined) v = Math.max(v, raw * layer.intensityScale);
        }
        if (progVal !== undefined) v = Math.max(v, progVal);
        finalVal = Math.round(v);
      } else if (progVal !== undefined) {
        // LTP: programmer overrides everything.
        finalVal = progVal;
      } else {
        // LTP: last (highest-priority) layer that defines the channel wins.
        finalVal = 0;
        for (const layer of layers) {
          const raw = layer.values.get(fixture.id)?.[channelName];
          if (raw !== undefined) finalVal = raw;
        }
      }

      target.setChannel(fixture.universe, dmxChannel, finalVal);
    });
  }
}
