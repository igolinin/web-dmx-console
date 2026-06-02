import type { CueList, ChannelValues } from '@dmx-console/shared';
import { interpolateChannels } from '../engine/fade.js';

interface ActiveFade {
  fromValues: Map<string, ChannelValues>;
  toValues: Map<string, ChannelValues>;
  startMs: number;
  delayMs: number; // milliseconds before fade starts
  durationMs: number; // fade duration in milliseconds
  targetIndex: number; // cue index being faded into
}

interface FollowTimer {
  startMs: number;
  durationMs: number;
  cueList: CueList;
}

interface CuePlayback {
  cueListId: string;
  activeCueIndex: number; // -1 = released / before first cue
  fade: ActiveFade | null;
  paused: boolean;
  pausedElapsedMs: number; // ms elapsed at the moment of pause
  follow: FollowTimer | null; // auto-follow after fade completes
  currentValues: Map<string, ChannelValues>;
}

const playbacks = new Map<string, CuePlayback>();

function cueValuesToMap(cueList: CueList, index: number): Map<string, ChannelValues> {
  const map = new Map<string, ChannelValues>();
  const cue = cueList.cues[index];
  if (!cue) return map;
  for (const fv of cue.values) {
    map.set(fv.fixtureId, { ...fv.channels });
  }
  return map;
}

function getOrCreate(cueListId: string): CuePlayback {
  let pb = playbacks.get(cueListId);
  if (!pb) {
    pb = {
      cueListId,
      activeCueIndex: -1,
      fade: null,
      paused: false,
      pausedElapsedMs: 0,
      follow: null,
      currentValues: new Map(),
    };
    playbacks.set(cueListId, pb);
  }
  return pb;
}

export const playbackEngine = {
  /** Go to the next cue. If paused mid-fade, resumes instead. */
  go(cueList: CueList): void {
    const pb = getOrCreate(cueList.id);

    // Resume if paused
    if (pb.paused && pb.fade) {
      pb.paused = false;
      // Shift startMs forward so elapsed time picks up from pausedElapsedMs
      pb.fade.startMs = Date.now() - pb.pausedElapsedMs;
      return;
    }

    // If a fade is already in progress, snap it to its target first (override Go)
    if (pb.fade) {
      pb.activeCueIndex = pb.fade.targetIndex;
      pb.currentValues = new Map(pb.fade.toValues);
      pb.fade = null;
    }

    const nextIndex = pb.activeCueIndex + 1;
    if (nextIndex >= cueList.cues.length) return; // already at last cue

    const nextCue = cueList.cues[nextIndex]!;
    const fromValues = new Map(pb.currentValues);
    const toValues = cueValuesToMap(cueList, nextIndex);

    pb.follow = null;
    pb.fade = {
      fromValues,
      toValues,
      startMs: Date.now(),
      delayMs: nextCue.timing.delay * 1000,
      durationMs: Math.max(0, nextCue.timing.fadeIn * 1000),
      targetIndex: nextIndex,
    };
    pb.paused = false;
    pb.pausedElapsedMs = 0;
  },

  /** Go back to previous cue (immediate snap; no fade). */
  back(cueList: CueList): void {
    const pb = playbacks.get(cueList.id);
    if (!pb) return;

    pb.fade = null;
    pb.paused = false;
    pb.follow = null;

    const prevIndex = pb.activeCueIndex - 1;
    if (prevIndex < 0) {
      // Release to empty
      pb.activeCueIndex = -1;
      pb.currentValues = new Map();
      return;
    }

    pb.activeCueIndex = prevIndex;
    pb.currentValues = cueValuesToMap(cueList, prevIndex);
  },

  /** Pause current fade mid-progress. */
  pause(cueListId: string): void {
    const pb = playbacks.get(cueListId);
    if (!pb?.fade || pb.paused) return;

    pb.paused = true;
    pb.pausedElapsedMs = Date.now() - pb.fade.startMs;
  },

  /** Release playback — clears all values for this cue list. */
  release(cueListId: string): void {
    playbacks.delete(cueListId);
  },

  /**
   * Advance all active fades.  Call once per DMX frame (e.g. every 33ms at 30Hz).
   * @param now  Current time in ms (pass Date.now()).
   */
  tick(now: number): void {
    for (const [, pb] of playbacks) {
      // ── Auto-follow check ─────────────────────────────────────────────────
      if (pb.follow && !pb.fade && !pb.paused) {
        const followElapsed = now - pb.follow.startMs;
        if (followElapsed >= pb.follow.durationMs) {
          const { cueList } = pb.follow;
          pb.follow = null;
          this.go(cueList);
          continue;
        }
      }

      if (!pb.fade || pb.paused) continue;

      const { fade } = pb;
      const elapsed = now - fade.startMs;

      if (elapsed < fade.delayMs) {
        // In delay phase — keep fromValues displayed
        pb.currentValues = new Map(fade.fromValues);
        continue;
      }

      const fadeElapsed = elapsed - fade.delayMs;
      const t = fade.durationMs > 0 ? Math.min(1, fadeElapsed / fade.durationMs) : 1;

      // Interpolate all fixtures in the fade
      const allIds = new Set([...fade.fromValues.keys(), ...fade.toValues.keys()]);
      const interpolated = new Map<string, ChannelValues>();
      for (const id of allIds) {
        const from = fade.fromValues.get(id) ?? {};
        const to = fade.toValues.get(id) ?? {};
        interpolated.set(id, interpolateChannels(from, to, t));
      }
      pb.currentValues = interpolated;

      if (t >= 1) {
        // Snap to target and clear fade
        pb.activeCueIndex = fade.targetIndex;
        pb.currentValues = new Map(fade.toValues);
        pb.fade = null;
      }
    }
  },

  /** Schedule auto-follow for a cue list (called externally after recording). */
  scheduleFollow(cueList: CueList, cueIndex: number, now: number): void {
    const cue = cueList.cues[cueIndex];
    if (!cue?.timing.follow) return;

    const pb = playbacks.get(cueList.id);
    if (!pb) return;

    pb.follow = {
      startMs: now,
      durationMs: cue.timing.follow * 1000,
      cueList,
    };
  },

  /** Per-cue-list current values, in playback order (for master-scaled merging). */
  getActivePlaybackValues(): { cueListId: string; values: Map<string, ChannelValues> }[] {
    return [...playbacks.values()].map((pb) => ({
      cueListId: pb.cueListId,
      values: pb.currentValues,
    }));
  },

  /** Merged DMX output across all active playbacks (LTP between cue lists). */
  getCueValues(): Map<string, ChannelValues> {
    const merged = new Map<string, ChannelValues>();
    for (const [, pb] of playbacks) {
      for (const [fixtureId, channels] of pb.currentValues) {
        const existing = merged.get(fixtureId) ?? {};
        merged.set(fixtureId, { ...existing, ...channels });
      }
    }
    return merged;
  },

  /** Serialisable playback state for a single cue list (for REST responses). */
  getState(cueListId: string): {
    activeCueIndex: number;
    fading: boolean;
    paused: boolean;
    hasFollow: boolean;
  } {
    const pb = playbacks.get(cueListId);
    if (!pb) return { activeCueIndex: -1, fading: false, paused: false, hasFollow: false };
    return {
      activeCueIndex: pb.activeCueIndex,
      fading: pb.fade !== null,
      paused: pb.paused,
      hasFollow: pb.follow !== null,
    };
  },

  /** Expose internal state for testing. */
  _getPlayback(cueListId: string): CuePlayback | undefined {
    return playbacks.get(cueListId);
  },
};
