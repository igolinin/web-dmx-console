import { describe, it, expect, beforeEach } from 'vitest';
import { hsvToRgb, rgbToHsv, xyToPanTilt, panTiltToXy } from '@dmx-console/shared';
import { UniverseBuffer } from '../src/artnet/universe.js';
import { mergeToBuffer, type MergeLayer } from '../src/engine/merger.js';
import { programmer } from '../src/store/programmer.js';
import type { PatchedFixture, ChannelValues } from '@dmx-console/shared';

/** Wrap a single source map as a full-intensity merge layer. */
function layer(values: Map<string, ChannelValues>): MergeLayer[] {
  return [{ values, intensityScale: 1 }];
}

// ── Fixtures for testing ──────────────────────────────────────────────────────

// Minimal FixtureDef stubs registered in the in-memory library
import { loadFixtureLibrary } from '../src/fixtures/loader.js';
import { BUILTIN_FIXTURES } from '../src/fixtures/builtins.js';

// We need getFixtureDef to find our test fixtures, so we boot the library once
beforeEach(async () => {
  programmer.clear();
});

// We'll use the real builtin fixtures from the library
describe('merger — HTP / LTP rules', () => {
  // builtin_dimmer_1ch: 1 channel, group = Intensity
  const dimmerFixture: PatchedFixture = {
    id: 'f-dimmer',
    defId: 'builtin_dimmer_1ch',
    universe: 0,
    address: 1,
    label: 'Dimmer',
    modeIndex: 0,
    groupIds: [],
  };

  // builtin_rgb_3ch: 3 channels, group = Colour
  const rgbFixture: PatchedFixture = {
    id: 'f-rgb',
    defId: 'builtin_rgb_3ch',
    universe: 0,
    address: 10,
    label: 'RGB',
    modeIndex: 0,
    groupIds: [],
  };

  // Ensure library is loaded before each test in this suite
  beforeEach(async () => {
    await loadFixtureLibrary();
  });

  it('intensity channel uses HTP — programmer lower than cue → cue wins', () => {
    const cue = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 200 }]]);
    programmer.set('f-dimmer', { Dimmer: 100 }); // prog lower

    const buf = new UniverseBuffer();
    mergeToBuffer([dimmerFixture], layer(cue), programmer.values, buf);

    expect(buf.get(0)[0]).toBe(200); // HTP: max(200, 100) = 200
  });

  it('intensity channel uses HTP — programmer higher than cue → programmer wins', () => {
    const cue = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 100 }]]);
    programmer.set('f-dimmer', { Dimmer: 200 }); // prog higher

    const buf = new UniverseBuffer();
    mergeToBuffer([dimmerFixture], layer(cue), programmer.values, buf);

    expect(buf.get(0)[0]).toBe(200); // HTP: max(100, 200) = 200
  });

  it('colour channel uses LTP — programmer overwrites cue', () => {
    const cue = new Map<string, ChannelValues>([
      ['f-rgb', { Red: 255, Green: 128, Blue: 64 }],
    ]);
    programmer.set('f-rgb', { Red: 50 }); // only override Red

    const buf = new UniverseBuffer();
    mergeToBuffer([rgbFixture], layer(cue), programmer.values, buf);

    // address 10 → indices 9, 10, 11 (0-based)
    expect(buf.get(0)[9]).toBe(50); // Red: LTP = programmer 50 (not cue 255)
    expect(buf.get(0)[10]).toBe(128); // Green: no prog value → cue 128
    expect(buf.get(0)[11]).toBe(64); // Blue: no prog value → cue 64
  });

  it('colour channel uses LTP — programmer value 0 wins over cue', () => {
    const cue = new Map<string, ChannelValues>([['f-rgb', { Red: 255 }]]);
    programmer.set('f-rgb', { Red: 0 });

    const buf = new UniverseBuffer();
    mergeToBuffer([rgbFixture], layer(cue), programmer.values, buf);

    expect(buf.get(0)[9]).toBe(0); // LTP: programmer 0 wins
  });

  it('no programmer values → cue values pass through', () => {
    const cue = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 180 }]]);

    const buf = new UniverseBuffer();
    mergeToBuffer([dimmerFixture], layer(cue), programmer.values, buf);

    expect(buf.get(0)[0]).toBe(180);
  });

  it('no cue values, programmer active → programmer values used', () => {
    programmer.set('f-rgb', { Red: 200, Green: 100, Blue: 50 });

    const buf = new UniverseBuffer();
    mergeToBuffer([rgbFixture], [], programmer.values, buf);

    expect(buf.get(0)[9]).toBe(200);
    expect(buf.get(0)[10]).toBe(100);
    expect(buf.get(0)[11]).toBe(50);
  });

  it('clearing programmer restores cue output', () => {
    const cue = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 150 }]]);
    programmer.set('f-dimmer', { Dimmer: 255 });

    const buf = new UniverseBuffer();
    mergeToBuffer([dimmerFixture], layer(cue), programmer.values, buf);
    expect(buf.get(0)[0]).toBe(255); // programmer overrides

    programmer.clear('f-dimmer');
    mergeToBuffer([dimmerFixture], layer(cue), programmer.values, buf);
    expect(buf.get(0)[0]).toBe(150); // back to cue
  });

  it('multiple fixtures in same universe write correct channels', () => {
    programmer.set('f-dimmer', { Dimmer: 255 });
    programmer.set('f-rgb', { Red: 100, Green: 200, Blue: 50 });

    const buf = new UniverseBuffer();
    mergeToBuffer([dimmerFixture, rgbFixture], [], programmer.values, buf);

    expect(buf.get(0)[0]).toBe(255); // dimmer at ch1
    expect(buf.get(0)[9]).toBe(100); // RGB at ch10–12
    expect(buf.get(0)[10]).toBe(200);
    expect(buf.get(0)[11]).toBe(50);
  });

  it('unknown fixture def is silently skipped', () => {
    const unknownFixture: PatchedFixture = {
      id: 'f-unknown',
      defId: 'does_not_exist',
      universe: 0,
      address: 1,
      label: 'Unknown',
      modeIndex: 0,
      groupIds: [],
    };
    programmer.set('f-unknown', { Dimmer: 255 });

    const buf = new UniverseBuffer();
    expect(() => mergeToBuffer([unknownFixture], [], programmer.values, buf)).not.toThrow();
    expect(buf.activeUniverses()).toHaveLength(0);
  });

  it('intensity is HTP across playback layers — higher layer cannot lower it', () => {
    // Layer order is LTP-ascending: cue (200) then chase (100).
    const cueLayer = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 200 }]]);
    const chaseLayer = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 100 }]]);

    const buf = new UniverseBuffer();
    mergeToBuffer(
      [dimmerFixture],
      [
        { values: cueLayer, intensityScale: 1 },
        { values: chaseLayer, intensityScale: 1 },
      ],
      programmer.values,
      buf,
    );

    expect(buf.get(0)[0]).toBe(200); // HTP max(200, 100), not LTP overwrite to 100
  });

  it('non-intensity is still LTP across layers — higher layer overwrites', () => {
    const cueLayer = new Map<string, ChannelValues>([['f-rgb', { Red: 200 }]]);
    const shapeLayer = new Map<string, ChannelValues>([['f-rgb', { Red: 50 }]]);

    const buf = new UniverseBuffer();
    mergeToBuffer(
      [rgbFixture],
      [
        { values: cueLayer, intensityScale: 1 },
        { values: shapeLayer, intensityScale: 1 },
      ],
      programmer.values,
      buf,
    );

    expect(buf.get(0)[9]).toBe(50); // LTP: last layer wins
  });

  it('master fader scales a layer’s intensity', () => {
    const cueLayer = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 200 }]]);

    const buf = new UniverseBuffer();
    mergeToBuffer([dimmerFixture], [{ values: cueLayer, intensityScale: 0.5 }], programmer.values, buf);

    expect(buf.get(0)[0]).toBe(100); // 200 * 0.5
  });

  it('master fader does not scale non-intensity channels', () => {
    const cueLayer = new Map<string, ChannelValues>([['f-rgb', { Red: 200 }]]);

    const buf = new UniverseBuffer();
    mergeToBuffer([rgbFixture], [{ values: cueLayer, intensityScale: 0.25 }], programmer.values, buf);

    expect(buf.get(0)[9]).toBe(200); // colour unaffected by master
  });

  it('master at 0 blacks out that layer’s intensity (HTP with others still applies)', () => {
    const cueLayer = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 255 }]]);
    const chaseLayer = new Map<string, ChannelValues>([['f-dimmer', { Dimmer: 120 }]]);

    const buf = new UniverseBuffer();
    mergeToBuffer(
      [dimmerFixture],
      [
        { values: cueLayer, intensityScale: 0 }, // master down
        { values: chaseLayer, intensityScale: 1 }, // full
      ],
      programmer.values,
      buf,
    );

    expect(buf.get(0)[0]).toBe(120); // max(255*0, 120*1)
  });
});

// ── Programmer store ──────────────────────────────────────────────────────────

describe('programmer store', () => {
  it('set merges channels into existing entry', () => {
    programmer.set('f1', { Red: 100, Green: 50 });
    programmer.set('f1', { Red: 200, Blue: 30 }); // Red overwritten, Blue added

    const snap = programmer.snapshot();
    const entry = snap.find((e) => e.fixtureId === 'f1');
    expect(entry?.channels).toEqual({ Red: 200, Green: 50, Blue: 30 });
  });

  it('clear() removes all fixtures', () => {
    programmer.set('f1', { Dimmer: 100 });
    programmer.set('f2', { Dimmer: 200 });
    programmer.clear();
    expect(programmer.snapshot()).toHaveLength(0);
  });

  it('clear(fixtureId) removes only that fixture', () => {
    programmer.set('f1', { Dimmer: 100 });
    programmer.set('f2', { Dimmer: 200 });
    programmer.clear('f1');

    const snap = programmer.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]?.fixtureId).toBe('f2');
  });
});

// ── XYPad math ────────────────────────────────────────────────────────────────

describe('xyToPanTilt', () => {
  it('centre (0, 0) → pan 128, tilt 128', () => {
    expect(xyToPanTilt(0, 0)).toEqual({ pan: 128, tilt: 128 });
  });

  it('full left-up (-1, -1) → pan 0, tilt 0', () => {
    expect(xyToPanTilt(-1, -1)).toEqual({ pan: 0, tilt: 0 });
  });

  it('full right-down (1, 1) → pan 255, tilt 255', () => {
    expect(xyToPanTilt(1, 1)).toEqual({ pan: 255, tilt: 255 });
  });

  it('right only (1, 0) → pan 255, tilt 128', () => {
    expect(xyToPanTilt(1, 0)).toEqual({ pan: 255, tilt: 128 });
  });

  it('clamps values outside [-1, 1]', () => {
    expect(xyToPanTilt(2, -3)).toEqual({ pan: 255, tilt: 0 });
  });
});

describe('panTiltToXy', () => {
  it('128, 128 → ~(0, 0) within one DMX step', () => {
    // DMX centre is 127.5 (not integer), so 128 rounds to ≈+0.004
    const result = panTiltToXy(128, 128);
    expect(result.x).toBeCloseTo(0, 1);
    expect(result.y).toBeCloseTo(0, 1);
  });

  it('0, 0 → (-1, -1)', () => {
    expect(panTiltToXy(0, 0)).toEqual({ x: -1, y: -1 });
  });

  it('255, 255 → (1, 1)', () => {
    const result = panTiltToXy(255, 255);
    expect(result.x).toBeCloseTo(1, 5);
    expect(result.y).toBeCloseTo(1, 5);
  });
});

// ── HSV → RGB conversion ──────────────────────────────────────────────────────

describe('hsvToRgb', () => {
  it('pure red (0°, 100%, 100%) → (255, 0, 0)', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('pure green (120°, 100%, 100%) → (0, 255, 0)', () => {
    expect(hsvToRgb(120, 1, 1)).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('pure blue (240°, 100%, 100%) → (0, 0, 255)', () => {
    expect(hsvToRgb(240, 1, 1)).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('white (any hue, 0% sat, 100% val) → (255, 255, 255)', () => {
    expect(hsvToRgb(0, 0, 1)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('black (any hue, any sat, 0% val) → (0, 0, 0)', () => {
    expect(hsvToRgb(0, 1, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('yellow (60°, 100%, 100%) → (255, 255, 0)', () => {
    expect(hsvToRgb(60, 1, 1)).toEqual({ r: 255, g: 255, b: 0 });
  });

  it('cyan (180°, 100%, 100%) → (0, 255, 255)', () => {
    expect(hsvToRgb(180, 1, 1)).toEqual({ r: 0, g: 255, b: 255 });
  });

  it('magenta (300°, 100%, 100%) → (255, 0, 255)', () => {
    expect(hsvToRgb(300, 1, 1)).toEqual({ r: 255, g: 0, b: 255 });
  });
});

describe('rgbToHsv', () => {
  it('(255, 0, 0) → red hue', () => {
    const { h, s, v } = rgbToHsv(255, 0, 0);
    expect(h).toBeCloseTo(0, 2);
    expect(s).toBeCloseTo(1, 2);
    expect(v).toBeCloseTo(1, 2);
  });

  it('(0, 0, 0) → black', () => {
    const { s, v } = rgbToHsv(0, 0, 0);
    expect(s).toBe(0);
    expect(v).toBe(0);
  });

  it('round-trips through hsvToRgb', () => {
    const original = { r: 120, g: 80, b: 200 };
    const { h, s, v } = rgbToHsv(original.r, original.g, original.b);
    const result = hsvToRgb(h, s, v);
    expect(result.r).toBeCloseTo(original.r, 0);
    expect(result.g).toBeCloseTo(original.g, 0);
    expect(result.b).toBeCloseTo(original.b, 0);
  });
});
