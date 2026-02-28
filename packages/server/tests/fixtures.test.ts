import { describe, it, expect, beforeAll } from 'vitest';
import { parseQxf } from '../src/fixtures/parser.js';
import { BUILTIN_FIXTURES } from '../src/fixtures/builtins.js';
import { loadFixtureLibrary, getFixtureDef, queryFixtures } from '../src/fixtures/loader.js';
import { checkConflicts, checkAllConflicts } from '../src/engine/conflict.js';
import type { PatchedFixture } from '@dmx-console/shared';

// ── QLC+ Parser ───────────────────────────────────────────────────────────────

const SAMPLE_QXF = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE FixtureDefinition>
<FixtureDefinition xmlns="http://www.qlcplus.org/FixtureDefinition">
 <Creator><Name>Test</Name><Version>1.0</Version><Author>Test</Author></Creator>
 <Manufacturer>Test Corp</Manufacturer>
 <Model>LED PAR Pro</Model>
 <Type>Color Changer</Type>
 <Channel Name="Red">
  <Group Byte="0">Colour</Group>
  <Colour>Red</Colour>
  <Capability Min="0" Max="255">Red</Capability>
 </Channel>
 <Channel Name="Green">
  <Group Byte="0">Colour</Group>
  <Colour>Green</Colour>
  <Capability Min="0" Max="255">Green</Capability>
 </Channel>
 <Channel Name="Blue">
  <Group Byte="0">Colour</Group>
  <Colour>Blue</Colour>
  <Capability Min="0" Max="255">Blue</Capability>
 </Channel>
 <Channel Name="Dimmer">
  <Group Byte="0">Intensity</Group>
  <Preset>IntensityDimmer</Preset>
  <Capability Min="0" Max="255">Dimmer</Capability>
 </Channel>
 <Mode Name="4 Channel">
  <Physical>
   <Focus Type="Fixed" PanMax="0" TiltMax="0"/>
   <Technical PowerConsumption="45" DmxConnector="3-pin"/>
  </Physical>
  <Channel Number="0">Dimmer</Channel>
  <Channel Number="1">Red</Channel>
  <Channel Number="2">Green</Channel>
  <Channel Number="3">Blue</Channel>
 </Mode>
</FixtureDefinition>`;

const MOVING_HEAD_QXF = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE FixtureDefinition>
<FixtureDefinition xmlns="http://www.qlcplus.org/FixtureDefinition">
 <Creator><Name>Test</Name><Version>1.0</Version><Author>Test</Author></Creator>
 <Manufacturer>Robe</Manufacturer>
 <Model>Pointe</Model>
 <Type>Moving Head</Type>
 <Channel Name="Pan">
  <Group Byte="0">Pan</Group>
  <Preset>PositionPan</Preset>
  <Capability Min="0" Max="255">Pan</Capability>
 </Channel>
 <Channel Name="Pan Fine">
  <Group Byte="1">Pan</Group>
  <Preset>PositionPanFine</Preset>
  <Capability Min="0" Max="255">Pan Fine</Capability>
 </Channel>
 <Channel Name="Tilt">
  <Group Byte="0">Tilt</Group>
  <Preset>PositionTilt</Preset>
  <Capability Min="0" Max="255">Tilt</Capability>
 </Channel>
 <Mode Name="Basic">
  <Physical>
   <Focus Type="Head" PanMax="540" TiltMax="270"/>
   <Technical PowerConsumption="300" DmxConnector="5-pin"/>
  </Physical>
  <Channel Number="0">Pan</Channel>
  <Channel Number="1">Pan Fine</Channel>
  <Channel Number="2">Tilt</Channel>
 </Mode>
</FixtureDefinition>`;

describe('parseQxf', () => {
  it('parses manufacturer and model', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.manufacturer).toBe('Test Corp');
    expect(def.model).toBe('LED PAR Pro');
  });

  it('parses fixture type', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.type).toBe('Color Changer');
  });

  it('generates slugified id', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.id).toBe('test_corp_led_par_pro');
  });

  it('parses correct channel count', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(Object.keys(def.channels)).toHaveLength(4);
  });

  it('parses channel names correctly', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.channels['Red']).toBeDefined();
    expect(def.channels['Green']).toBeDefined();
    expect(def.channels['Blue']).toBeDefined();
    expect(def.channels['Dimmer']).toBeDefined();
  });

  it('parses channel groups', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.channels['Red']?.group).toBe('Colour');
    expect(def.channels['Dimmer']?.group).toBe('Intensity');
  });

  it('parses channel colours', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.channels['Red']?.colour).toBe('Red');
    expect(def.channels['Green']?.colour).toBe('Green');
  });

  it('parses channel preset', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.channels['Dimmer']?.preset).toBe('IntensityDimmer');
  });

  it('parses mode name', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.modes).toHaveLength(1);
    expect(def.modes[0]?.name).toBe('4 Channel');
  });

  it('parses mode channels in DMX order', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.modes[0]?.channelNames).toEqual(['Dimmer', 'Red', 'Green', 'Blue']);
  });

  it('parses moving head Pan/Fine byte values', async () => {
    const def = await parseQxf(MOVING_HEAD_QXF);
    expect(def.channels['Pan']?.byte).toBe(0);
    expect(def.channels['Pan Fine']?.byte).toBe(1);
  });

  it('parses physical pan/tilt max', async () => {
    const def = await parseQxf(MOVING_HEAD_QXF);
    expect(def.physical?.panMax).toBe(540);
    expect(def.physical?.tiltMax).toBe(270);
  });

  it('sets source to qlcplus', async () => {
    const def = await parseQxf(SAMPLE_QXF);
    expect(def.source).toBe('qlcplus');
  });

  it('throws on invalid XML', async () => {
    await expect(parseQxf('<invalid')).rejects.toThrow();
  });

  it('throws on non-fixture XML', async () => {
    await expect(parseQxf('<root><other/></root>')).rejects.toThrow('Not a valid QLC+');
  });
});

// ── Built-in fixtures ─────────────────────────────────────────────────────────

describe('BUILTIN_FIXTURES', () => {
  it('has 7 built-in fixtures', () => {
    expect(BUILTIN_FIXTURES).toHaveLength(7);
  });

  it('all have unique ids', () => {
    const ids = BUILTIN_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builtin_dimmer_1ch has 1 channel', () => {
    const f = BUILTIN_FIXTURES.find((f) => f.id === 'builtin_dimmer_1ch');
    expect(f).toBeDefined();
    expect(f?.modes[0]?.channelNames).toHaveLength(1);
  });

  it('builtin_moving_head_basic has 8 channels', () => {
    const f = BUILTIN_FIXTURES.find((f) => f.id === 'builtin_moving_head_basic');
    expect(f?.modes[0]?.channelNames).toHaveLength(8);
  });

  it('builtin_led_bar_8px has 24 channels', () => {
    const f = BUILTIN_FIXTURES.find((f) => f.id === 'builtin_led_bar_8px');
    expect(f?.modes[0]?.channelNames).toHaveLength(24);
  });
});

// ── Fixture library ───────────────────────────────────────────────────────────

describe('fixture library', () => {
  beforeAll(async () => {
    await loadFixtureLibrary();
  });

  it('loads at least the 7 built-in fixtures', () => {
    const all = queryFixtures({});
    expect(all.length).toBeGreaterThanOrEqual(7);
  });

  it('can retrieve a fixture by id', () => {
    const f = getFixtureDef('builtin_rgb_3ch');
    expect(f).toBeDefined();
    expect(f?.model).toBe('RGB 3ch');
  });

  it('returns undefined for unknown id', () => {
    expect(getFixtureDef('unknown_fixture_xyz')).toBeUndefined();
  });

  it('filters by type', () => {
    const dimmers = queryFixtures({ type: 'Dimmer' });
    expect(dimmers.every((f) => f.type === 'Dimmer')).toBe(true);
  });

  it('filters by manufacturer (case-insensitive)', () => {
    const generic = queryFixtures({ manufacturer: 'generic' });
    expect(generic.length).toBeGreaterThan(0);
    expect(generic.every((f) => f.manufacturer.toLowerCase().includes('generic'))).toBe(true);
  });

  it('filters by search term', () => {
    const results = queryFixtures({ search: 'rgb' });
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── Conflict detection ────────────────────────────────────────────────────────

describe('checkConflicts', () => {
  beforeAll(async () => {
    await loadFixtureLibrary();
  });

  const makeFixture = (
    id: string,
    defId: string,
    universe: number,
    address: number,
  ): PatchedFixture => ({
    id,
    defId,
    universe,
    address,
    label: id,
    modeIndex: 0,
    groupIds: [],
  });

  it('detects overlapping fixtures on the same universe', () => {
    // builtin_rgb_3ch occupies 3 channels (1,2,3) and (2,3,4) overlap
    const a = makeFixture('a', 'builtin_rgb_3ch', 0, 1); // ch 1-3
    const b = makeFixture('b', 'builtin_rgb_3ch', 0, 2); // ch 2-4

    const result = checkConflicts(b, [a]);
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts[0]?.overlappingChannels).toContain(2);
    expect(result.conflicts[0]?.overlappingChannels).toContain(3);
  });

  it('allows adjacent fixtures (no overlap)', () => {
    const a = makeFixture('a', 'builtin_rgb_3ch', 0, 1); // ch 1-3
    const b = makeFixture('b', 'builtin_rgb_3ch', 0, 4); // ch 4-6

    const result = checkConflicts(b, [a]);
    expect(result.hasConflict).toBe(false);
  });

  it('no conflict on different universes', () => {
    const a = makeFixture('a', 'builtin_rgb_3ch', 0, 1); // universe 0, ch 1-3
    const b = makeFixture('b', 'builtin_rgb_3ch', 1, 1); // universe 1, ch 1-3

    const result = checkConflicts(b, [a]);
    expect(result.hasConflict).toBe(false);
  });

  it('excludeId skips self when re-patching', () => {
    const a = makeFixture('a', 'builtin_rgb_3ch', 0, 1);
    const result = checkConflicts(a, [a], 'a');
    expect(result.hasConflict).toBe(false);
  });

  it('checkAllConflicts finds all pairs', () => {
    const a = makeFixture('a', 'builtin_rgb_3ch', 0, 1); // 1-3
    const b = makeFixture('b', 'builtin_rgb_3ch', 0, 2); // 2-4
    const c = makeFixture('c', 'builtin_rgb_3ch', 0, 10); // 10-12

    const result = checkAllConflicts([a, b, c]);
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1); // only a-b conflict
  });
});
