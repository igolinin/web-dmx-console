import { useState, useEffect, useCallback } from 'react';
import type { CueList, Chase } from '@dmx-console/shared';

interface PlaybackState {
  activeCueIndex: number;
  fading: boolean;
  paused: boolean;
  hasFollow: boolean;
}

interface CueListWithPlayback extends CueList {
  playback: PlaybackState;
}

interface ChaseWithStatus extends Chase {
  running: boolean;
  currentStepIndex: number;
}

// ── Cue list card ───────────────────────────────────────────────────────────

function CueListCard({ cl, onRefresh }: { cl: CueListWithPlayback; onRefresh: () => void }) {
  const pb = cl.playback;
  const activeCue = pb.activeCueIndex >= 0 ? cl.cues[pb.activeCueIndex] : null;

  const action = useCallback(
    async (a: 'go' | 'back' | 'pause' | 'release') => {
      await fetch(`/api/cueLists/${cl.id}/${a}`, { method: 'POST' });
      onRefresh();
    },
    [cl.id, onRefresh],
  );

  return (
    <div className="bg-console-panel border border-console-border rounded p-3 flex flex-col gap-2">
      {/* Label + status */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-console-text flex-1 truncate">{cl.label}</span>
        {pb.activeCueIndex >= 0 && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${pb.paused ? 'bg-yellow-500/20 text-yellow-400' : 'bg-console-active/20 text-console-active'}`}
          >
            {pb.paused ? 'PAUSED' : pb.fading ? 'FADING' : 'ACTIVE'}
          </span>
        )}
      </div>

      {/* Current cue info */}
      <div className="text-xs text-console-dim min-h-[1.2em]">
        {activeCue ? (
          <>
            Cue {activeCue.number.toFixed(1)} — {activeCue.label || '(no label)'}
          </>
        ) : (
          <span className="text-console-dim/60">
            {cl.cues.length} cue{cl.cues.length !== 1 ? 's' : ''} · not running
          </span>
        )}
      </div>

      {/* Transport */}
      <div className="flex gap-1.5">
        <button
          className="flex-1 py-2 text-sm font-bold rounded bg-console-active text-white hover:bg-blue-600 active:scale-95 transition-transform"
          onClick={() => void action('go')}
        >
          GO
        </button>
        <button
          className="px-2 py-2 text-xs rounded bg-console-bg border border-console-border text-console-dim hover:text-console-text"
          onClick={() => void action('back')}
          title="Back"
        >
          ◀
        </button>
        <button
          className="px-2 py-2 text-xs rounded bg-console-bg border border-console-border text-console-dim hover:text-console-text"
          onClick={() => void action('pause')}
          title="Pause"
        >
          ⏸
        </button>
        <button
          className="px-2 py-2 text-xs rounded bg-console-danger/20 border border-console-danger/30 text-console-danger hover:bg-console-danger/40"
          onClick={() => void action('release')}
          title="Release"
        >
          ■
        </button>
      </div>
    </div>
  );
}

// ── Chase card ──────────────────────────────────────────────────────────────

function ChaseCard({ ch, onRefresh }: { ch: ChaseWithStatus; onRefresh: () => void }) {
  const toggle = useCallback(async () => {
    const a = ch.running ? 'stop' : 'play';
    await fetch(`/api/chases/${ch.id}/${a}`, { method: 'POST' });
    onRefresh();
  }, [ch.id, ch.running, onRefresh]);

  const tap = useCallback(async () => {
    await fetch(`/api/chases/${ch.id}/tap`, { method: 'POST' });
    onRefresh();
  }, [ch.id, onRefresh]);

  return (
    <div className="bg-console-panel border border-console-border rounded p-3 flex flex-col gap-2">
      {/* Label + running indicator */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-console-text flex-1 truncate">{ch.label}</span>
        {ch.running && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-console-active/20 text-console-active">
            RUNNING
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="text-xs text-console-dim">
        {ch.bpm} BPM · {ch.steps.length} step{ch.steps.length !== 1 ? 's' : ''} · {ch.direction}
        {ch.running && (
          <span className="text-console-active ml-2">
            [{ch.currentStepIndex + 1}/{ch.steps.length}]
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-1.5">
        <button
          className={[
            'flex-1 py-2 text-sm font-bold rounded transition-transform active:scale-95',
            ch.running
              ? 'bg-console-danger/80 text-white hover:bg-red-600'
              : 'bg-console-active text-white hover:bg-blue-600',
          ].join(' ')}
          onClick={() => void toggle()}
        >
          {ch.running ? '⏹ Stop' : '▶ Play'}
        </button>
        <button
          className="px-3 py-2 text-xs rounded bg-console-bg border border-console-border text-console-dim hover:text-console-text active:bg-console-active/20"
          onClick={() => void tap()}
          title="Tap tempo"
        >
          ⏱ Tap
        </button>
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export function PlaybackView() {
  const [cueLists, setCueLists] = useState<CueListWithPlayback[]>([]);
  const [chases, setChases] = useState<ChaseWithStatus[]>([]);

  const refresh = useCallback(() => {
    void fetch('/api/cueLists')
      .then((r) => r.json() as Promise<CueListWithPlayback[]>)
      .then(setCueLists);
    void fetch('/api/chases')
      .then((r) => r.json() as Promise<ChaseWithStatus[]>)
      .then(setChases);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 300);
    return () => clearInterval(id);
  }, [refresh]);

  const empty = cueLists.length === 0 && chases.length === 0;

  return (
    <div className="h-full overflow-y-auto p-4">
      {empty ? (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-console-dim">
          <span className="text-2xl">▶</span>
          <p className="text-sm">No cue lists or chases yet.</p>
          <p className="text-xs">Create them in the Cues or Chases tabs, then control them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
          {/* Cue lists column */}
          {cueLists.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-console-dim uppercase tracking-wider mb-3">
                Cue Lists
              </h2>
              <div className="flex flex-col gap-3">
                {cueLists.map((cl) => (
                  <CueListCard key={cl.id} cl={cl} onRefresh={refresh} />
                ))}
              </div>
            </section>
          )}

          {/* Chases column */}
          {chases.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-console-dim uppercase tracking-wider mb-3">
                Chases
              </h2>
              <div className="flex flex-col gap-3">
                {chases.map((ch) => (
                  <ChaseCard key={ch.id} ch={ch} onRefresh={refresh} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
