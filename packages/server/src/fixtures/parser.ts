import { parseStringPromise } from 'xml2js';
import type {
  FixtureDef,
  FixtureType,
  ChannelGroup,
  ChannelDef,
  FixtureMode,
  PhysicalSpec,
  ChannelCapability,
} from '@dmx-console/shared';

// ── xml2js result shapes ──────────────────────────────────────────────────────

interface QlcChannel {
  $: { Name: string };
  Group?: { _: string; $?: { Byte?: string } }[];
  Colour?: string[];
  Preset?: string[];
  Capability?: { _: string; $: { Min: string; Max: string } }[];
}

interface QlcModeChannel {
  _: string;
  $: { Number: string };
}

interface QlcPhysical {
  Focus?: { $: { PanMax?: string; TiltMax?: string } }[];
  Technical?: { $: { PowerConsumption?: string } }[];
  Dimensions?: { $: { Weight?: string; Width?: string } }[];
}

interface QlcMode {
  $: { Name: string };
  Channel?: QlcModeChannel[];
  Physical?: QlcPhysical[];
}

interface QlcRoot {
  FixtureDefinition: {
    Manufacturer: string[];
    Model: string[];
    Type: string[];
    Channel?: QlcChannel[];
    Mode?: QlcMode[];
  };
}

// ── Type mapping helpers ──────────────────────────────────────────────────────

const FIXTURE_TYPE_MAP: Record<string, FixtureType> = {
  Dimmer: 'Dimmer',
  'Color Changer': 'Color Changer',
  'Moving Head': 'Moving Head',
  Scanner: 'Scanner',
  'LED Bar (Beams)': 'LED Bar (Beams)',
  'LED Bar (Pixels)': 'LED Bar (Pixels)',
  Strobe: 'Strobe',
  Effect: 'Effect',
};

const GROUP_MAP: Record<string, ChannelGroup> = {
  Intensity: 'Intensity',
  Colour: 'Colour',
  Pan: 'Pan',
  Tilt: 'Tilt',
  Gobo: 'Gobo',
  Prism: 'Prism',
  Shutter: 'Shutter',
  Beam: 'Beam',
  Speed: 'Speed',
  Effect: 'Effect',
  Maintenance: 'Maintenance',
  Nothing: 'Nothing',
};

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function str(arr: string[] | undefined): string {
  return (arr?.[0] ?? '').trim();
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseQxf(xmlContent: string): Promise<FixtureDef> {
  const raw = (await parseStringPromise(xmlContent, {
    trim: true,
    explicitArray: true,
  })) as QlcRoot;

  const def = raw.FixtureDefinition;
  if (!def) throw new Error('Not a valid QLC+ fixture file');

  const manufacturer = str(def.Manufacturer);
  const model = str(def.Model);
  const typeRaw = str(def.Type);
  const type: FixtureType = FIXTURE_TYPE_MAP[typeRaw] ?? 'Other';
  const id = `${slugify(manufacturer)}_${slugify(model)}`;

  // ── Parse channels ──────────────────────────────────────────────────────────
  const channels: Record<string, ChannelDef> = {};

  for (const ch of def.Channel ?? []) {
    const name = ch.$?.Name ?? '';
    const groupEl = ch.Group?.[0];
    const groupRaw = typeof groupEl === 'string' ? groupEl : (groupEl?._ ?? '');
    const group: ChannelGroup = GROUP_MAP[groupRaw] ?? 'Nothing';
    const byteProp = groupEl && typeof groupEl !== 'string' ? groupEl.$?.Byte : undefined;
    const byte = byteProp === '1' ? 1 : byteProp === '0' ? 0 : undefined;

    const colour = ch.Colour?.[0];
    const preset = ch.Preset?.[0];

    const capabilities: ChannelCapability[] = (ch.Capability ?? []).map((cap) => ({
      min: parseInt(cap.$?.Min ?? '0', 10),
      max: parseInt(cap.$?.Max ?? '255', 10),
      label: cap._ ?? '',
    }));

    const chanDef: ChannelDef = {
      name,
      group,
      ...(colour !== undefined && { colour }),
      ...(preset !== undefined && { preset }),
      ...(byte !== undefined && { byte }),
      ...(capabilities.length > 0 && { capabilities }),
    };

    channels[name] = chanDef;
  }

  // ── Parse modes ─────────────────────────────────────────────────────────────
  const modes: FixtureMode[] = [];

  for (const mode of def.Mode ?? []) {
    const modeName = mode.$?.Name ?? 'Default';
    const modeChannels = mode.Channel ?? [];

    // Sort channels by their DMX number
    const sorted = [...modeChannels].sort(
      (a, b) => parseInt(a.$?.Number ?? '0', 10) - parseInt(b.$?.Number ?? '0', 10),
    );

    const channelNames = sorted.map((c) => (typeof c === 'string' ? c : (c._ ?? '')));

    modes.push({ name: modeName, channelNames });
  }

  // If no modes defined, create one from channel order
  if (modes.length === 0 && Object.keys(channels).length > 0) {
    modes.push({
      name: 'Default',
      channelNames: Object.keys(channels),
    });
  }

  // ── Parse physical (from first mode or root) ────────────────────────────────
  const physEl = def.Mode?.[0]?.Physical?.[0];
  let physical: PhysicalSpec | undefined;

  if (physEl) {
    const focusEl = physEl.Focus?.[0]?.$;
    const panMax = focusEl?.PanMax ? parseFloat(focusEl.PanMax) : undefined;
    const tiltMax = focusEl?.TiltMax ? parseFloat(focusEl.TiltMax) : undefined;
    const powerW = physEl.Technical?.[0]?.$?.PowerConsumption
      ? parseFloat(physEl.Technical[0].$.PowerConsumption)
      : undefined;

    if (panMax !== undefined || tiltMax !== undefined || powerW !== undefined) {
      physical = {
        ...(panMax !== undefined && panMax > 0 && { panMax }),
        ...(tiltMax !== undefined && tiltMax > 0 && { tiltMax }),
        ...(powerW !== undefined && powerW > 0 && { powerW }),
      };
    }
  }

  return {
    id,
    manufacturer,
    model,
    type,
    channels,
    modes,
    ...(physical !== undefined && { physical }),
    source: 'qlcplus',
  };
}
