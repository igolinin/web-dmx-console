import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PatchedFixture, FixtureDef, ShapeLayer } from '@dmx-console/shared';
import {
  evalWaveform,
  eval2D,
  evalPixel,
  resolveChannel,
  clamp255,
  shapeEngine,
} from '../src/engine/shapeEngine.js';

// ── Mock fixture library ───────────────────────────────────────────────────────

vi.mock('../src/fixtures/loader.js', () => ({
  getFixtureDef: (id: string): FixtureDef | undefined => {
    if (id === 'mock-moving-head') {
      return {
        id: 'mock-moving-head',
        manufacturer: 'Test',
        model: 'Moving Head',
        type: 'Moving Head',
        source: 'builtin',
        channels: {
          Pan: { name: 'Pan', group: 'Pan' },
          Tilt: { name: 'Tilt', group: 'Tilt' },
          Dimmer: { name: 'Dimmer', group: 'Intensity' },
          Red: { name: 'Red', group: 'Colour', colour: 'Red' },
          Green: { name: 'Green', group: 'Colour', colour: 'Green' },
          Blue: { name: 'Blue', group: 'Colour', colour: 'Blue' },
        },
        modes: [{ name: 'Default', channelNames: ['Pan', 'Tilt', 'Dimmer', 'Red', 'Green', 'Blue'] }],
      };
    }
    if (id === 'mock-led-bar') {
      return {
        id: 'mock-led-bar',
        manufacturer: 'Test',
        model: 'LED Bar 4px',
        type: 'LED Bar (Pixels)',
        source: 'builtin',
        channels: Object.fromEntries(
          [1, 2, 3, 4].flatMap((px) => [
            [`Red ${px}`, { name: `Red ${px}`, group: 'Colour', colour: 'Red' }],
            [`Green ${px}`, { name: `Green ${px}`, group: 'Colour', colour: 'Green' }],
            [`Blue ${px}`, { name: `Blue ${px}`, group: 'Colour', colour: 'Blue' }],
          ]),
        ),
        modes: [
          {
            name: '12ch',
            channelNames: [1, 2, 3, 4].flatMap((px) => [`Red ${px}`, `Green ${px}`, `Blue ${px}`]),
          },
        ],
        physical: { pixelCount: 4 },
      };
    }
    return undefined;
  },
}));

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeFixture(id: string, defId = 'mock-moving-head'): PatchedFixture {
  return { id, defId, universe: 0, address: 1, label: id, modeIndex: 0, groupIds: [] };
}

function makeLayer(overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id: 'layer-1',
    label: 'Test',
    fixtureIds: ['f1'],
    speed: 1,
    size: 128,
    center: 128,
    spread: 0,
    phaseOffset: 0,
    active: true,
    ...overrides,
  };
}

// ── evalWaveform ──────────────────────────────────────────────────────────────

describe('evalWaveform', () => {
  it('sine: 0° → 0, 90° → 1, 180° → 0, 270° → -1', () => {
    expect(evalWaveform('sine', 0)).toBeCloseTo(0);
    expect(evalWaveform('sine', 90)).toBeCloseTo(1);
    expect(evalWaveform('sine', 180)).toBeCloseTo(0, 10);
    expect(evalWaveform('sine', 270)).toBeCloseTo(-1);
  });

  it('cosine: 0° → 1, 90° → 0, 180° → -1', () => {
    expect(evalWaveform('cosine', 0)).toBeCloseTo(1);
    expect(evalWaveform('cosine', 90)).toBeCloseTo(0, 10);
    expect(evalWaveform('cosine', 180)).toBeCloseTo(-1);
  });

  it('triangle: rises from -1 to +1 across [0, 180), falls back', () => {
    expect(evalWaveform('triangle', 0)).toBeCloseTo(-1);
    expect(evalWaveform('triangle', 90)).toBeCloseTo(0);
    expect(evalWaveform('triangle', 180)).toBeCloseTo(1);
    expect(evalWaveform('triangle', 270)).toBeCloseTo(0);
  });

  it('square: +1 below 180°, -1 above', () => {
    expect(evalWaveform('square', 0)).toBe(1);
    expect(evalWaveform('square', 179)).toBe(1);
    expect(evalWaveform('square', 180)).toBe(-1);
    expect(evalWaveform('square', 359)).toBe(-1);
  });

  it('ramp: -1 at 0°, 0 at 180°, nearly +1 at 360°', () => {
    expect(evalWaveform('ramp', 0)).toBeCloseTo(-1);
    expect(evalWaveform('ramp', 180)).toBeCloseTo(0);
    expect(evalWaveform('ramp', 359)).toBeCloseTo(1, 0);
  });

  it('random: returns the provided rand value', () => {
    expect(evalWaveform('random', 0, 0.5)).toBe(0.5);
    expect(evalWaveform('random', 180, -0.7)).toBe(-0.7);
  });

  it('wraps phase modulo 360', () => {
    expect(evalWaveform('sine', 450)).toBeCloseTo(evalWaveform('sine', 90));
    expect(evalWaveform('sine', -90)).toBeCloseTo(evalWaveform('sine', 270));
  });
});

// ── eval2D ────────────────────────────────────────────────────────────────────

describe('eval2D — circle', () => {
  it('t=0°: cos(0)=1, sin(0)=0', () => {
    const { x, y } = eval2D('circle', 0);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
  });

  it('t=90°: cos(90)=0, sin(90)=1', () => {
    const { x, y } = eval2D('circle', 90);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1);
  });

  it('t=180°: cos(180)=-1, sin(180)=0', () => {
    const { x, y } = eval2D('circle', 180);
    expect(x).toBeCloseTo(-1);
    expect(y).toBeCloseTo(0, 10);
  });

  it('t=0.25s at 1Hz → phase=90°, expected pan=0 tilt=1', () => {
    // This is the PLAN.md test case for circle
    const phase025 = 0.25 * 1 * 360; // 0.25s × 1Hz × 360°/cycle = 90°
    const { x, y } = eval2D('circle', phase025);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1);
  });

  it('t=0.5s at 1Hz → phase=180°, expected pan=-1 tilt=0', () => {
    const phase05 = 0.5 * 1 * 360;
    const { x, y } = eval2D('circle', phase05);
    expect(x).toBeCloseTo(-1);
    expect(y).toBeCloseTo(0, 10);
  });
});

describe('eval2D — figure8', () => {
  it('x uses 2× frequency: sin(2r) vs sin(r)', () => {
    // x = sin(2r), y = sin(r). x frequency = 2× y frequency.
    const samples = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const r = (deg * Math.PI) / 180;
      return {
        expected_x: Math.sin(2 * r),
        expected_y: Math.sin(r),
        ...eval2D('figure8', deg),
      };
    });
    for (const s of samples) {
      expect(s.x).toBeCloseTo(s.expected_x);
      expect(s.y).toBeCloseTo(s.expected_y);
    }
  });

  it('x completes full cycle while y is at half-cycle at phase=180°', () => {
    // x = sin(2*180°) = sin(360°) = 0 (full cycle complete)
    // y = sin(180°) = 0 (half cycle, descending through zero)
    const { x, y } = eval2D('figure8', 180);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);

    // x peaks (=1) at 45° while y is still rising (sin45≈0.707)
    const p45 = eval2D('figure8', 45);
    expect(p45.x).toBeCloseTo(1);
    expect(p45.y).toBeCloseTo(Math.sin(Math.PI / 4));
  });
});

describe('eval2D — lissajous', () => {
  it('default ratio [2,1] gives sin(2r) and sin(r+π/2)', () => {
    const { x, y } = eval2D('lissajous', 90);
    const r = Math.PI / 2;
    expect(x).toBeCloseTo(Math.sin(2 * r));
    expect(y).toBeCloseTo(Math.sin(1 * r + Math.PI / 2));
  });

  it('custom ratio [3,2]', () => {
    const { x, y } = eval2D('lissajous', 60, [3, 2]);
    const r = (60 * Math.PI) / 180;
    expect(x).toBeCloseTo(Math.sin(3 * r));
    expect(y).toBeCloseTo(Math.sin(2 * r + Math.PI / 2));
  });
});

// ── Spread ────────────────────────────────────────────────────────────────────

describe('spread: 3 fixtures at 120° spread', () => {
  it('each fixture has 120° phase offset from the previous', () => {
    const spread = 120;
    const basePhase = 45;
    // fixture i gets: basePhase + i * spread
    const phases = [0, 1, 2].map((i) => basePhase + i * spread);
    const values = phases.map((p) => evalWaveform('sine', p));
    expect(values[1]).toBeCloseTo(Math.sin(((basePhase + 120) * Math.PI) / 180));
    expect(values[2]).toBeCloseTo(Math.sin(((basePhase + 240) * Math.PI) / 180));
    // All three should be different
    expect(values[0]).not.toBeCloseTo(values[1]!, 3);
    expect(values[1]).not.toBeCloseTo(values[2]!, 3);
  });
});

// ── clamp255 ──────────────────────────────────────────────────────────────────

describe('clamp255', () => {
  it('clamps output to [0, 255]', () => {
    expect(clamp255(300)).toBe(255);
    expect(clamp255(-10)).toBe(0);
    expect(clamp255(128)).toBe(128);
    expect(clamp255(255.9)).toBe(255);
  });

  it('shape output never exceeds [0, 255] even with extreme settings', () => {
    // center=255, size=255 → max raw = 255 + 127.5 = 382.5 → clamped to 255
    const norm = evalWaveform('sine', 90); // +1
    const raw = 255 + (255 / 2) * norm;
    expect(clamp255(raw)).toBe(255);

    // center=0, size=255 → min raw = 0 + 127.5 * -1 = -127.5 → clamped to 0
    const normNeg = evalWaveform('sine', 270); // -1
    const rawNeg = 0 + (255 / 2) * normNeg;
    expect(clamp255(rawNeg)).toBe(0);
  });
});

// ── evalPixel ─────────────────────────────────────────────────────────────────

describe('evalPixel', () => {
  it('gradient at pos=0 → R=0, B=255', () => {
    const [r, , b] = evalPixel('gradient', 0, 0, 4);
    expect(r).toBe(0);
    expect(b).toBe(255);
  });

  it('gradient at pos=0.5 → R≈128, B≈128 (mid-gradient)', () => {
    const [r, , b] = evalPixel('gradient', 0.5, 0, 4);
    expect(r).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(128, 0);
  });

  it('gradient at pos=1 → R=255, B=0', () => {
    const [r, , b] = evalPixel('gradient', 1, 0, 4);
    expect(r).toBe(255);
    expect(b).toBe(0);
  });

  it('rainbow produces different hues at different positions', () => {
    const c0 = evalPixel('rainbow', 0, 0, 8);
    const c4 = evalPixel('rainbow', 0.5, 0, 8);
    // Should be different colours
    expect(c0).not.toEqual(c4);
  });

  it('chase: pixel at activePos gets max brightness', () => {
    // At phase=180° (0.5 of cycle), activePos=0.5 → pixel at pos=0.5 is brightest
    const onPixel = evalPixel('chase', 0.5, 180, 8);
    const offPixel = evalPixel('chase', 0, 180, 8);
    expect(onPixel[0]).toBeGreaterThan(offPixel[0]);
  });

  it('fire: position near 0 is brighter than near 1', () => {
    const bottom = evalPixel('fire', 0, 0, 8);
    const top = evalPixel('fire', 1, 0, 8);
    expect(bottom[0]).toBeGreaterThan(top[0]);
  });

  it('all textures return values in [0, 255]', () => {
    const textures = ['rainbow', 'gradient', 'chase', 'fire'] as const;
    for (const t of textures) {
      for (let pos = 0; pos <= 1; pos += 0.1) {
        const rgb = evalPixel(t, pos, 90, 8);
        for (const v of rgb) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
    }
  });
});

// ── resolveChannel ────────────────────────────────────────────────────────────

describe('resolveChannel', () => {
  const fx = makeFixture('f1', 'mock-moving-head');

  it('resolves pan', () => expect(resolveChannel('pan', fx)).toBe('Pan'));
  it('resolves tilt', () => expect(resolveChannel('tilt', fx)).toBe('Tilt'));
  it('resolves dimmer', () => expect(resolveChannel('dimmer', fx)).toBe('Dimmer'));
  it('resolves red', () => expect(resolveChannel('red', fx)).toBe('Red'));
  it('resolves green', () => expect(resolveChannel('green', fx)).toBe('Green'));
  it('resolves blue', () => expect(resolveChannel('blue', fx)).toBe('Blue'));

  it('returns null for unknown fixture def', () => {
    const unknown = makeFixture('f1', 'nonexistent-def');
    expect(resolveChannel('pan', unknown)).toBeNull();
  });

  it('returns null when fixture lacks the target channel group', () => {
    // mock-moving-head has no Zoom channels
    expect(resolveChannel('zoom', fx)).toBeNull();
  });
});

// ── shapeEngine.tick integration ──────────────────────────────────────────────

describe('shapeEngine integration', () => {
  beforeEach(() => {
    shapeEngine.reset();
  });

  it('1D sine waveform produces expected value after 1/4 cycle', () => {
    const fx = makeFixture('f1');
    const layer = makeLayer({ waveform: 'sine', target: 'pan', center: 128, size: 128 });

    shapeEngine.tick([layer], [fx], 0);
    // After 1/4 cycle at 1Hz = 250ms, phase = 90°, sine(90°) = 1
    // output = 128 + (128/2) * 1 = 128 + 64 = 192
    shapeEngine.tick([layer], [fx], 250);

    const vals = shapeEngine.getShapeValues();
    expect(vals.get('f1')?.['Pan']).toBe(192);
  });

  it('circle 2D shape drives Pan and Tilt', () => {
    const fx = makeFixture('f1');
    const layer = makeLayer({
      shape2d: 'circle',
      xTarget: 'pan',
      yTarget: 'tilt',
      center: 128,
      size: 128,
    });

    // At t=0, phase=0: x=cos(0)=1, y=sin(0)=0
    // pan = 128 + 64 * 1 = 192, tilt = 128 + 64 * 0 = 128
    shapeEngine.tick([layer], [fx], 0);
    shapeEngine.tick([layer], [fx], 1); // tiny tick to seed dt

    // phase is nearly 0 → x≈1, y≈0
    const vals = shapeEngine.getShapeValues();
    expect(vals.get('f1')?.['Pan']).toBe(192);
    expect(vals.get('f1')?.['Tilt']).toBe(128);
  });

  it('inactive layer produces no output', () => {
    const fx = makeFixture('f1');
    const layer = makeLayer({ waveform: 'sine', target: 'pan', active: false });
    shapeEngine.tick([layer], [fx], 0);
    shapeEngine.tick([layer], [fx], 250);
    expect(shapeEngine.getShapeValues().size).toBe(0);
  });

  it('pixel texture fills all pixel channels', () => {
    const fx = makeFixture('f1', 'mock-led-bar');
    const layer = makeLayer({ pixelTexture: 'rainbow', fixtureIds: ['f1'] });
    shapeEngine.tick([layer], [fx], 0);
    shapeEngine.tick([layer], [fx], 100);
    const vals = shapeEngine.getShapeValues();
    const ch = vals.get('f1');
    expect(ch).toBeDefined();
    // All 4 pixels should have R, G, B set
    for (let px = 1; px <= 4; px++) {
      expect(ch![`Red ${px}`]).toBeGreaterThanOrEqual(0);
      expect(ch![`Green ${px}`]).toBeGreaterThanOrEqual(0);
      expect(ch![`Blue ${px}`]).toBeGreaterThanOrEqual(0);
    }
  });

  it('spread: 3 fixtures produce different output values', () => {
    const fx1 = makeFixture('f1');
    const fx2 = makeFixture('f2');
    const fx3 = makeFixture('f3');
    const layer = makeLayer({
      waveform: 'sine',
      target: 'pan',
      fixtureIds: ['f1', 'f2', 'f3'],
      spread: 120,
      center: 128,
      size: 128,
    });
    shapeEngine.tick([layer], [fx1, fx2, fx3], 0);
    // At t=0, phase=0:
    // f1 phase=0°, f2 phase=120°, f3 phase=240°
    // sin(0)=0, sin(120°)≈0.866, sin(240°)≈-0.866
    shapeEngine.tick([layer], [fx1, fx2, fx3], 1);
    const vals = shapeEngine.getShapeValues();
    const p1 = vals.get('f1')?.['Pan'];
    const p2 = vals.get('f2')?.['Pan'];
    const p3 = vals.get('f3')?.['Pan'];
    expect(p1).not.toBe(p2);
    expect(p2).not.toBe(p3);
    expect(p1).not.toBe(p3);
  });

  it('reset clears all state', () => {
    const fx = makeFixture('f1');
    const layer = makeLayer({ waveform: 'sine', target: 'pan' });
    shapeEngine.tick([layer], [fx], 0);
    shapeEngine.reset();
    expect(shapeEngine.getShapeValues().size).toBe(0);
  });
});
