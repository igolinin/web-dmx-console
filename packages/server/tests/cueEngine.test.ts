import { describe, it, expect, beforeEach } from 'vitest';
import { interpolateValue, interpolateChannels, sCurve } from '../src/engine/fade.js';
import { playbackEngine } from '../src/store/playback.js';
import type { CueList } from '@dmx-console/shared';

// ── Fade math ──────────────────────────────────────────────────────────────────

describe('interpolateValue', () => {
  it('t=0 → start value', () => {
    expect(interpolateValue(0, 255, 0)).toBe(0);
    expect(interpolateValue(100, 200, 0)).toBe(100);
  });

  it('t=1 → end value', () => {
    expect(interpolateValue(0, 255, 1)).toBe(255);
    expect(interpolateValue(100, 200, 1)).toBe(200);
  });

  it('t=0.5 → midpoint (linear)', () => {
    expect(interpolateValue(0, 200, 0.5)).toBe(100);
    expect(interpolateValue(50, 150, 0.5)).toBe(100);
  });

  it('rounds to integer', () => {
    const v = interpolateValue(0, 255, 0.5);
    expect(Number.isInteger(v)).toBe(true);
  });

  it('clamps t below 0 to 0', () => {
    expect(interpolateValue(0, 100, -1)).toBe(0);
  });

  it('clamps t above 1 to 1', () => {
    expect(interpolateValue(0, 100, 2)).toBe(100);
  });
});

describe('sCurve', () => {
  it('s-curve(0) = 0', () => {
    expect(sCurve(0)).toBe(0);
  });

  it('s-curve(1) = 1', () => {
    expect(sCurve(1)).toBe(1);
  });

  it('s-curve(0.5) = 0.5 (symmetric)', () => {
    expect(sCurve(0.5)).toBeCloseTo(0.5, 10);
  });

  it('s-curve is slow at start (less than linear at 0.25)', () => {
    expect(sCurve(0.25)).toBeLessThan(0.25);
  });

  it('s-curve is fast at midpoint (greater than linear at 0.25 from end)', () => {
    expect(sCurve(0.75)).toBeGreaterThan(0.75);
  });

  it('interpolateValue with scurve gives non-linear midpoints', () => {
    const linear = interpolateValue(0, 100, 0.25, 'linear');
    const curve = interpolateValue(0, 100, 0.25, 'scurve');
    expect(curve).toBeLessThan(linear); // S-curve starts slow
  });
});

describe('interpolateChannels', () => {
  it('interpolates all channels', () => {
    const from = { Red: 0, Green: 100 };
    const to = { Red: 200, Green: 0 };
    const result = interpolateChannels(from, to, 0.5);
    expect(result['Red']).toBe(100);
    expect(result['Green']).toBe(50);
  });

  it('channels missing in from default to 0', () => {
    const from = {};
    const to = { Dimmer: 200 };
    const result = interpolateChannels(from, to, 0.5);
    expect(result['Dimmer']).toBe(100);
  });

  it('channels missing in to default to 0 (fade out)', () => {
    const from = { Dimmer: 200 };
    const to = {};
    const result = interpolateChannels(from, to, 0.5);
    expect(result['Dimmer']).toBe(100);
  });

  it('t=0 returns from values', () => {
    const from = { Red: 100 };
    const to = { Red: 200 };
    expect(interpolateChannels(from, to, 0)['Red']).toBe(100);
  });

  it('t=1 returns to values', () => {
    const from = { Red: 100 };
    const to = { Red: 200 };
    expect(interpolateChannels(from, to, 1)['Red']).toBe(200);
  });
});

// ── Playback engine ────────────────────────────────────────────────────────────

function makeCueList(id = 'cl-1'): CueList {
  return {
    id,
    label: 'Test List',
    cues: [
      {
        id: 'cue-1',
        number: 1,
        label: 'Cue 1',
        values: [{ fixtureId: 'f1', channels: { Dimmer: 200, Red: 100 } }],
        timing: { fadeIn: 0, fadeOut: 0, delay: 0 },
      },
      {
        id: 'cue-2',
        number: 2,
        label: 'Cue 2',
        values: [{ fixtureId: 'f1', channels: { Dimmer: 100, Red: 255 } }],
        timing: { fadeIn: 0, fadeOut: 0, delay: 0 },
      },
      {
        id: 'cue-3',
        number: 3,
        label: 'Cue 3',
        values: [{ fixtureId: 'f1', channels: { Dimmer: 0 } }],
        timing: { fadeIn: 2, fadeOut: 0, delay: 0 },
      },
    ],
  };
}

beforeEach(() => {
  // Release all playbacks between tests
  playbackEngine.release('cl-1');
  playbackEngine.release('cl-a');
  playbackEngine.release('cl-b');
});

describe('playbackEngine.go', () => {
  it('goes to cue 0 on first go', () => {
    const cl = makeCueList();
    playbackEngine.go(cl);
    // fadeIn=0 → snap immediately
    playbackEngine.tick(Date.now() + 1);
    const state = playbackEngine.getState('cl-1');
    expect(state.activeCueIndex).toBe(0);
  });

  it('advances through cues sequentially', () => {
    const cl = makeCueList();
    playbackEngine.go(cl); // → cue 0
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // → cue 1
    playbackEngine.tick(Date.now() + 1);
    expect(playbackEngine.getState('cl-1').activeCueIndex).toBe(1);
  });

  it('does not go past the last cue', () => {
    const cl = makeCueList();
    playbackEngine.go(cl); // 0
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // 1
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // 2
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // no-op
    playbackEngine.tick(Date.now() + 1);
    expect(playbackEngine.getState('cl-1').activeCueIndex).toBe(2);
  });

  it('applies cue values immediately when fadeIn=0', () => {
    const cl = makeCueList();
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 10);

    const vals = playbackEngine.getCueValues();
    const f1 = vals.get('f1');
    expect(f1?.['Dimmer']).toBe(200);
    expect(f1?.['Red']).toBe(100);
  });
});

describe('playbackEngine.back', () => {
  it('goes back to previous cue (immediate snap)', () => {
    const cl = makeCueList();
    playbackEngine.go(cl); // → 0
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // → 1
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.back(cl); // → back to 0
    expect(playbackEngine.getState('cl-1').activeCueIndex).toBe(0);
  });

  it('back from cue 0 releases the playback', () => {
    const cl = makeCueList();
    playbackEngine.go(cl); // → 0
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.back(cl); // should release
    expect(playbackEngine.getState('cl-1').activeCueIndex).toBe(-1);
    expect(playbackEngine.getCueValues().size).toBe(0);
  });

  it('restores previous cue values on back', () => {
    const cl = makeCueList();
    playbackEngine.go(cl); // → cue 0: Dimmer=200, Red=100
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // → cue 1: Dimmer=100, Red=255
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.back(cl); // → back to cue 0

    const vals = playbackEngine.getCueValues();
    const f1 = vals.get('f1');
    expect(f1?.['Dimmer']).toBe(200);
    expect(f1?.['Red']).toBe(100);
  });
});

describe('playbackEngine fade with non-zero fadeIn', () => {
  it('is fading=true while fade is in progress', () => {
    const cl = makeCueList(); // cue 2 has fadeIn=2s
    playbackEngine.go(cl); // 0
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // 1
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl); // 2 — 2s fade
    expect(playbackEngine.getState('cl-1').fading).toBe(true);
  });

  it('fade progresses toward target over time', () => {
    const cl = makeCueList();
    // Go to cue 1 (Dimmer=100, Red=255) first
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    // Now go to cue 2 (fadeIn=2s, Dimmer=0)
    const t0 = Date.now();
    playbackEngine.go(cl);

    // At t=0 → should still have fromValues (Dimmer=100)
    playbackEngine.tick(t0);
    const atStart = playbackEngine.getCueValues().get('f1');
    expect(atStart?.['Dimmer']).toBeGreaterThanOrEqual(80); // close to 100

    // At t=1s (half of 2s fade) → should be ~50
    playbackEngine.tick(t0 + 1000);
    const atHalf = playbackEngine.getCueValues().get('f1');
    expect(atHalf?.['Dimmer']).toBeCloseTo(50, 0);

    // At t=2s+ → fully at target (Dimmer=0)
    playbackEngine.tick(t0 + 2100);
    const atEnd = playbackEngine.getCueValues().get('f1');
    expect(atEnd?.['Dimmer']).toBe(0);
    expect(playbackEngine.getState('cl-1').fading).toBe(false);
  });
});

describe('playbackEngine.pause', () => {
  it('pauses mid-fade', () => {
    const cl = makeCueList();
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    const t0 = Date.now();
    playbackEngine.go(cl); // 2s fade
    playbackEngine.tick(t0 + 1000); // halfway
    playbackEngine.pause('cl-1');
    expect(playbackEngine.getState('cl-1').paused).toBe(true);
  });

  it('values stay frozen while paused', () => {
    const cl = makeCueList();
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    const t0 = Date.now();
    playbackEngine.go(cl);
    playbackEngine.tick(t0 + 1000);
    playbackEngine.pause('cl-1');

    const atPause = playbackEngine.getCueValues().get('f1')?.['Dimmer'] ?? -1;
    playbackEngine.tick(t0 + 1500); // time advances but fade is paused
    const afterPause = playbackEngine.getCueValues().get('f1')?.['Dimmer'] ?? -1;
    expect(atPause).toBe(afterPause);
  });

  it('go() resumes a paused fade', () => {
    const cl = makeCueList();
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    const t0 = Date.now();
    playbackEngine.go(cl);
    playbackEngine.tick(t0 + 1000);
    playbackEngine.pause('cl-1');
    playbackEngine.go(cl); // resume
    expect(playbackEngine.getState('cl-1').paused).toBe(false);
  });
});

describe('playbackEngine.release', () => {
  it('clears cue values after release', () => {
    const cl = makeCueList();
    playbackEngine.go(cl);
    playbackEngine.tick(Date.now() + 1);
    expect(playbackEngine.getCueValues().size).toBeGreaterThan(0);

    playbackEngine.release('cl-1');
    expect(playbackEngine.getCueValues().size).toBe(0);
    expect(playbackEngine.getState('cl-1').activeCueIndex).toBe(-1);
  });
});

describe('getCueValues — multi-cue-list merge (LTP)', () => {
  it('merges values from two active cue lists', () => {
    const clA: CueList = {
      id: 'cl-a',
      label: 'A',
      cues: [
        {
          id: 'a1',
          number: 1,
          label: 'A1',
          values: [{ fixtureId: 'f1', channels: { Dimmer: 200 } }],
          timing: { fadeIn: 0, fadeOut: 0, delay: 0 },
        },
      ],
    };
    const clB: CueList = {
      id: 'cl-b',
      label: 'B',
      cues: [
        {
          id: 'b1',
          number: 1,
          label: 'B1',
          values: [{ fixtureId: 'f2', channels: { Red: 255 } }],
          timing: { fadeIn: 0, fadeOut: 0, delay: 0 },
        },
      ],
    };

    playbackEngine.go(clA);
    playbackEngine.tick(Date.now() + 1);
    playbackEngine.go(clB);
    playbackEngine.tick(Date.now() + 1);

    const vals = playbackEngine.getCueValues();
    expect(vals.get('f1')?.['Dimmer']).toBe(200);
    expect(vals.get('f2')?.['Red']).toBe(255);
  });
});

// ── Show JSON round-trip ───────────────────────────────────────────────────────

describe('show JSON round-trip', () => {
  it('serialises and deserialises correctly', () => {
    const original = {
      version: '1' as const,
      meta: { title: 'Test', author: 'Dev', createdAt: '2024-01-01T00:00:00Z', modifiedAt: '2024-01-01T00:00:00Z' },
      fixtures: [],
      fixtureGroups: [],
      cueLists: [
        {
          id: 'cl-1',
          label: 'Main',
          cues: [
            {
              id: 'c-1',
              number: 1,
              label: 'Cue 1',
              values: [{ fixtureId: 'f1', channels: { Dimmer: 200 } }],
              timing: { fadeIn: 2, fadeOut: 1, delay: 0 },
            },
          ],
        },
      ],
      chases: [],
      shapes: [],
      artnet: { host: '255.255.255.255', broadcast: true, refreshHz: 30, universes: [0] },
    };

    const json = JSON.stringify(original);
    const restored = JSON.parse(json) as typeof original;

    expect(restored.version).toBe(original.version);
    expect(restored.meta.title).toBe(original.meta.title);
    expect(restored.cueLists[0]?.cues[0]?.timing.fadeIn).toBe(2);
    expect(restored.cueLists[0]?.cues[0]?.values[0]?.channels['Dimmer']).toBe(200);
  });
});
