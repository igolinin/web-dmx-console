import { describe, it, expect, beforeEach } from 'vitest';
import { chaseEngine, computeBpmFromTaps } from '../src/store/chaseEngine.js';
import type { Chase } from '@dmx-console/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChase(
  id: string,
  bpm: number,
  direction: Chase['direction'] = 'forward',
  stepCount = 3,
): Chase {
  return {
    id,
    label: 'Test',
    bpm,
    direction,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `step-${i}`,
      values: [{ fixtureId: 'f1', channels: { Red: i * 80, Green: 0, Blue: 0 } }],
      timing: { fadeIn: 0, fadeOut: 0, delay: 0 },
    })),
  };
}

const noop = () => undefined;

beforeEach(() => {
  chaseEngine.stop('chase-fwd');
  chaseEngine.stop('chase-bwd');
  chaseEngine.stop('chase-bnc');
  chaseEngine.stop('chase-rnd');
  chaseEngine.stop('chase-a');
});

// ── Basic playback ─────────────────────────────────────────────────────────────

describe('chaseEngine.play / stop', () => {
  it('starts at step 0', () => {
    const ch = makeChase('chase-a', 120);
    chaseEngine.play(ch, 0);
    expect(chaseEngine.getStepIndex('chase-a')).toBe(0);
    expect(chaseEngine.isRunning('chase-a')).toBe(true);
  });

  it('is not running before play', () => {
    expect(chaseEngine.isRunning('chase-a')).toBe(false);
  });

  it('play is no-op when already running', () => {
    const ch = makeChase('chase-a', 120);
    chaseEngine.play(ch, 0);
    chaseEngine.play(ch, 1000); // second call ignored
    expect(chaseEngine.getStepIndex('chase-a')).toBe(0);
  });

  it('stop removes the chase from actives', () => {
    const ch = makeChase('chase-a', 120);
    chaseEngine.play(ch, 0);
    chaseEngine.stop('chase-a');
    expect(chaseEngine.isRunning('chase-a')).toBe(false);
    expect(chaseEngine.getStepIndex('chase-a')).toBe(-1);
  });

  it('chase with no steps does not start', () => {
    const ch: Chase = { id: 'chase-a', label: 'Empty', bpm: 120, direction: 'forward', steps: [] };
    chaseEngine.play(ch, 0);
    expect(chaseEngine.isRunning('chase-a')).toBe(false);
  });
});

// ── Step advance timing ────────────────────────────────────────────────────────

describe('step advance at correct BPM', () => {
  it('does not advance before one step duration has elapsed', () => {
    const ch = makeChase('chase-fwd', 120); // step = 500ms
    chaseEngine.play(ch, 0);
    chaseEngine.tick([ch], 400, noop); // only 400ms elapsed
    expect(chaseEngine.getStepIndex('chase-fwd')).toBe(0);
  });

  it('advances to step 1 after one step duration', () => {
    const ch = makeChase('chase-fwd', 120); // step = 500ms
    chaseEngine.play(ch, 0);
    chaseEngine.tick([ch], 500, noop); // exactly 500ms
    expect(chaseEngine.getStepIndex('chase-fwd')).toBe(1);
  });

  it('advances to step 2 after two step durations', () => {
    const ch = makeChase('chase-fwd', 120);
    chaseEngine.play(ch, 0);
    chaseEngine.tick([ch], 500, noop);
    chaseEngine.tick([ch], 1000, noop);
    expect(chaseEngine.getStepIndex('chase-fwd')).toBe(2);
  });

  it('wraps around on forward direction', () => {
    const ch = makeChase('chase-fwd', 120, 'forward', 3);
    chaseEngine.play(ch, 0);
    chaseEngine.tick([ch], 500, noop); // step 1
    chaseEngine.tick([ch], 1000, noop); // step 2
    chaseEngine.tick([ch], 1500, noop); // wraps to step 0
    expect(chaseEngine.getStepIndex('chase-fwd')).toBe(0);
  });

  it('fires onStep callback on advance', () => {
    const ch = makeChase('chase-fwd', 120);
    chaseEngine.play(ch, 0);
    const events: Array<{ chaseId: string; stepIndex: number }> = [];
    chaseEngine.tick([ch], 500, (id, idx) => events.push({ chaseId: id, stepIndex: idx }));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ chaseId: 'chase-fwd', stepIndex: 1 });
  });

  it('getChaseValues reflects current step values', () => {
    const ch = makeChase('chase-fwd', 120); // step 0: Red=0, step 1: Red=80
    chaseEngine.play(ch, 0);
    chaseEngine.tick([ch], 500, noop); // advance to step 1
    const vals = chaseEngine.getChaseValues();
    expect(vals.get('f1')?.['Red']).toBe(80);
  });
});

// ── Direction modes ────────────────────────────────────────────────────────────

describe('forward direction', () => {
  it('goes 0 → 1 → 2 → 0', () => {
    const ch = makeChase('chase-fwd', 120, 'forward', 3);
    chaseEngine.play(ch, 0);
    const steps: number[] = [chaseEngine.getStepIndex('chase-fwd')];
    for (let i = 1; i <= 4; i++) {
      chaseEngine.tick([ch], i * 500, noop);
      steps.push(chaseEngine.getStepIndex('chase-fwd'));
    }
    expect(steps).toEqual([0, 1, 2, 0, 1]);
  });
});

describe('backward direction', () => {
  it('goes 0 → 2 → 1 → 0 → 2', () => {
    const ch = makeChase('chase-bwd', 120, 'backward', 3);
    chaseEngine.play(ch, 0);
    const steps: number[] = [0]; // starts at 0
    for (let i = 1; i <= 4; i++) {
      chaseEngine.tick([ch], i * 500, noop);
      steps.push(chaseEngine.getStepIndex('chase-bwd'));
    }
    expect(steps).toEqual([0, 2, 1, 0, 2]);
  });
});

describe('bounce direction', () => {
  it('goes 0 → 1 → 2 → 1 → 0 → 1', () => {
    const ch = makeChase('chase-bnc', 120, 'bounce', 3);
    chaseEngine.play(ch, 0);
    const steps: number[] = [0];
    for (let i = 1; i <= 5; i++) {
      chaseEngine.tick([ch], i * 500, noop);
      steps.push(chaseEngine.getStepIndex('chase-bnc'));
    }
    expect(steps).toEqual([0, 1, 2, 1, 0, 1]);
  });

  it('bounce with 2 steps: 0 → 1 → 0 → 1', () => {
    const ch = makeChase('chase-bnc', 120, 'bounce', 2);
    chaseEngine.play(ch, 0);
    const steps: number[] = [0];
    for (let i = 1; i <= 4; i++) {
      chaseEngine.tick([ch], i * 500, noop);
      steps.push(chaseEngine.getStepIndex('chase-bnc'));
    }
    expect(steps).toEqual([0, 1, 0, 1, 0]);
  });
});

describe('random direction', () => {
  it('never repeats the same step twice in a row (with >1 steps, many ticks)', () => {
    const ch = makeChase('chase-rnd', 600, 'random', 4); // step = 100ms
    chaseEngine.play(ch, 0);
    let prev = chaseEngine.getStepIndex('chase-rnd');
    let consecutiveRepeat = false;
    for (let i = 1; i <= 20; i++) {
      chaseEngine.tick([ch], i * 100, noop);
      const curr = chaseEngine.getStepIndex('chase-rnd');
      if (curr === prev) consecutiveRepeat = true;
      prev = curr;
    }
    // With 4 steps and 10 tries to avoid repeat, repeats should be very rare.
    // We accept one isolated repeat but not systematic repeats.
    // This is probabilistic; the engine tries 10 times before giving up.
    expect(consecutiveRepeat).toBe(false);
  });

  it('random returns valid step indices', () => {
    const ch = makeChase('chase-rnd', 600, 'random', 4);
    chaseEngine.play(ch, 0);
    for (let i = 1; i <= 20; i++) {
      chaseEngine.tick([ch], i * 100, noop);
      const idx = chaseEngine.getStepIndex('chase-rnd');
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }
  });
});

// ── Tap tempo ─────────────────────────────────────────────────────────────────

describe('computeBpmFromTaps', () => {
  it('returns 120 for fewer than 2 taps', () => {
    expect(computeBpmFromTaps([])).toBe(120);
    expect(computeBpmFromTaps([1000])).toBe(120);
  });

  it('500ms intervals → 120 BPM', () => {
    expect(computeBpmFromTaps([0, 500])).toBe(120);
  });

  it('1000ms intervals → 60 BPM', () => {
    expect(computeBpmFromTaps([0, 1000])).toBe(60);
  });

  it('250ms intervals → 240 BPM', () => {
    expect(computeBpmFromTaps([0, 250])).toBe(240);
  });

  it('averages multiple intervals', () => {
    // intervals: 400, 600, 500 → avg 500 → 120 BPM
    const result = computeBpmFromTaps([0, 400, 1000, 1500]);
    expect(result).toBe(120);
  });

  it('rounds to nearest integer BPM', () => {
    const result = computeBpmFromTaps([0, 499]);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ── Multi-chase merge ─────────────────────────────────────────────────────────

describe('getChaseValues with multiple chases', () => {
  it('merges values from two running chases (LTP)', () => {
    const ch1 = makeChase('chase-fwd', 120, 'forward', 1);
    ch1.steps[0]!.values = [{ fixtureId: 'f1', channels: { Dimmer: 200 } }];

    const ch2 = makeChase('chase-bwd', 120, 'forward', 1);
    ch2.steps[0]!.values = [{ fixtureId: 'f2', channels: { Red: 255 } }];

    chaseEngine.play(ch1, 0);
    chaseEngine.play(ch2, 0);

    const vals = chaseEngine.getChaseValues();
    expect(vals.get('f1')?.['Dimmer']).toBe(200);
    expect(vals.get('f2')?.['Red']).toBe(255);
  });
});
