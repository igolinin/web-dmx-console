import type { Chase, ChannelValues } from '@dmx-console/shared';

interface ActiveChase {
  chaseId: string;
  currentStepIndex: number;
  stepStartMs: number; // timestamp when this step began
  bounceDir: 1 | -1; // +1 = increasing, -1 = decreasing
  lastStepIndex: number; // for random: prevent immediate repeat
  currentValues: Map<string, ChannelValues>;
}

const actives = new Map<string, ActiveChase>();

function stepValuesToMap(chase: Chase, index: number): Map<string, ChannelValues> {
  const map = new Map<string, ChannelValues>();
  const step = chase.steps[index];
  if (!step) return map;
  for (const fv of step.values) {
    map.set(fv.fixtureId, { ...fv.channels });
  }
  return map;
}

/**
 * Compute the next step index based on the chase direction.
 * Mutates `active.bounceDir` as needed for bounce mode.
 */
function computeNextIndex(chase: Chase, active: ActiveChase): number {
  const len = chase.steps.length;
  if (len <= 1) return 0;

  switch (chase.direction) {
    case 'forward':
      return (active.currentStepIndex + 1) % len;

    case 'backward':
      return (active.currentStepIndex - 1 + len) % len;

    case 'bounce': {
      let next = active.currentStepIndex + active.bounceDir;
      if (next >= len) {
        active.bounceDir = -1;
        next = len - 2;
      } else if (next < 0) {
        active.bounceDir = 1;
        next = 1;
      }
      return Math.max(0, Math.min(len - 1, next));
    }

    case 'random': {
      // Try up to 10 times to avoid repeating the last step
      let r = active.currentStepIndex;
      for (let tries = 0; tries < 10; tries++) {
        r = Math.floor(Math.random() * len);
        if (r !== active.lastStepIndex) break;
      }
      return r;
    }
  }
}

export const chaseEngine = {
  /** Start playback of a chase. No-op if already running. */
  play(chase: Chase, now: number): void {
    if (actives.has(chase.id) || chase.steps.length === 0) return;

    const active: ActiveChase = {
      chaseId: chase.id,
      currentStepIndex: 0,
      stepStartMs: now,
      bounceDir: 1,
      lastStepIndex: -1,
      currentValues: stepValuesToMap(chase, 0),
    };
    actives.set(chase.id, active);
  },

  /** Stop a running chase. */
  stop(chaseId: string): void {
    actives.delete(chaseId);
  },

  /**
   * Advance all running chases based on elapsed time.
   * Call once per DMX frame with current timestamp.
   * @param chases   Full list of Chase definitions (needed for bpm/direction/steps).
   * @param now      Current time in ms.
   * @param onStep   Callback invoked when a step advances (for WebSocket broadcast).
   */
  tick(chases: Chase[], now: number, onStep: (chaseId: string, stepIndex: number) => void): void {
    for (const [chaseId, active] of actives) {
      const chase = chases.find((c) => c.id === chaseId);
      if (!chase || chase.steps.length === 0) continue;

      const stepDurationMs = 60_000 / chase.bpm;
      if (now - active.stepStartMs >= stepDurationMs) {
        active.lastStepIndex = active.currentStepIndex;
        active.currentStepIndex = computeNextIndex(chase, active);
        active.currentValues = stepValuesToMap(chase, active.currentStepIndex);
        // Advance stepStartMs by one step duration to avoid drift accumulation
        active.stepStartMs += stepDurationMs;
        onStep(chaseId, active.currentStepIndex);
      }
    }
  },

  /** Per-chase current step values, in run order (for master-scaled merging). */
  getActiveChaseValues(): { chaseId: string; values: Map<string, ChannelValues> }[] {
    return [...actives.values()].map((a) => ({ chaseId: a.chaseId, values: a.currentValues }));
  },

  /** DMX output: LTP merge of all running chases. */
  getChaseValues(): Map<string, ChannelValues> {
    const merged = new Map<string, ChannelValues>();
    for (const [, active] of actives) {
      for (const [id, channels] of active.currentValues) {
        const existing = merged.get(id) ?? {};
        merged.set(id, { ...existing, ...channels });
      }
    }
    return merged;
  },

  isRunning(chaseId: string): boolean {
    return actives.has(chaseId);
  },

  getStepIndex(chaseId: string): number {
    return actives.get(chaseId)?.currentStepIndex ?? -1;
  },

  /** Expose internal for testing. */
  _getActive(chaseId: string): ActiveChase | undefined {
    return actives.get(chaseId);
  },
};

// ── Tap tempo ─────────────────────────────────────────────────────────────────

const tapHistory: number[] = [];

/** Register a tap. Returns the new computed BPM. */
export function registerTap(now: number): number {
  tapHistory.push(now);
  if (tapHistory.length > 4) tapHistory.splice(0, tapHistory.length - 4);
  return computeBpmFromTaps(tapHistory);
}

/** Compute BPM from an array of tap timestamps (at least 2). */
export function computeBpmFromTaps(taps: number[]): number {
  if (taps.length < 2) return 120;
  let totalInterval = 0;
  for (let i = 1; i < taps.length; i++) {
    totalInterval += (taps[i] ?? 0) - (taps[i - 1] ?? 0);
  }
  const avgInterval = totalInterval / (taps.length - 1);
  return Math.max(1, Math.round(60_000 / avgInterval));
}
