import { useState, useEffect, useCallback } from 'react';
import type { CueList, Cue } from '@dmx-console/shared';

interface PlaybackState {
  activeCueIndex: number;
  fading: boolean;
  paused: boolean;
  hasFollow: boolean;
}

interface CueListWithPlayback extends CueList {
  playback: PlaybackState;
}

// ── Timing editor ──────────────────────────────────────────────────────────

function TimingEditor({
  cue,
  cueListId,
  onSaved,
}: {
  cue: Cue;
  cueListId: string;
  onSaved: () => void;
}) {
  const [fadeIn, setFadeIn] = useState(String(cue.timing.fadeIn));
  const [fadeOut, setFadeOut] = useState(String(cue.timing.fadeOut));
  const [delay, setDelay] = useState(String(cue.timing.delay));

  const save = useCallback(async () => {
    await fetch(`/api/cueLists/${cueListId}/cues/${cue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timing: {
          fadeIn: parseFloat(fadeIn) || 0,
          fadeOut: parseFloat(fadeOut) || 0,
          delay: parseFloat(delay) || 0,
        },
      }),
    });
    onSaved();
  }, [cueListId, cue.id, fadeIn, fadeOut, delay, onSaved]);

  return (
    <div className="flex gap-2 items-center">
      <label className="text-xs text-console-dim">
        In
        <input
          type="number"
          step="0.1"
          min="0"
          className="ml-1 w-12 bg-console-bg border border-console-border rounded px-1 py-0.5 text-xs text-console-text"
          value={fadeIn}
          onChange={(e) => setFadeIn(e.target.value)}
        />
        s
      </label>
      <label className="text-xs text-console-dim">
        Out
        <input
          type="number"
          step="0.1"
          min="0"
          className="ml-1 w-12 bg-console-bg border border-console-border rounded px-1 py-0.5 text-xs text-console-text"
          value={fadeOut}
          onChange={(e) => setFadeOut(e.target.value)}
        />
        s
      </label>
      <label className="text-xs text-console-dim">
        Dly
        <input
          type="number"
          step="0.1"
          min="0"
          className="ml-1 w-12 bg-console-bg border border-console-border rounded px-1 py-0.5 text-xs text-console-text"
          value={delay}
          onChange={(e) => setDelay(e.target.value)}
        />
        s
      </label>
      <button
        className="px-2 py-0.5 text-xs rounded bg-console-active text-white hover:bg-blue-600"
        onClick={() => void save()}
      >
        Save
      </button>
    </div>
  );
}

// ── Cue row ────────────────────────────────────────────────────────────────

function CueRow({
  cue,
  index,
  isActive,
  cueListId,
  onRefresh,
}: {
  cue: Cue;
  index: number;
  isActive: boolean;
  cueListId: string;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const deleteCue = useCallback(async () => {
    await fetch(`/api/cueLists/${cueListId}/cues/${cue.id}`, { method: 'DELETE' });
    onRefresh();
  }, [cueListId, cue.id, onRefresh]);

  return (
    <div
      className={[
        'px-3 py-1.5 border-b border-console-border text-xs transition-colors',
        isActive
          ? 'bg-console-active/20 border-l-2 border-l-console-active'
          : 'hover:bg-console-muted',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        {/* Cue number + label */}
        <span className="w-8 tabular-nums text-console-dim">{cue.number.toFixed(1)}</span>
        <span className="flex-1 text-console-text font-medium">{cue.label}</span>

        {/* Timing badges */}
        <span className="text-console-dim tabular-nums">
          {cue.timing.fadeIn}s / {cue.timing.fadeOut}s
          {cue.timing.delay > 0 && ` +${cue.timing.delay}s`}
        </span>

        {/* Actions */}
        <button
          className="text-console-dim hover:text-console-text px-1"
          onClick={() => setEditing((v) => !v)}
          title="Edit timing"
        >
          ✎
        </button>
        <button
          className="text-console-danger hover:text-red-400 px-1"
          onClick={() => void deleteCue()}
          title="Delete cue"
        >
          ✕
        </button>
      </div>

      {/* Expanded timing editor */}
      {editing && (
        <div className="mt-1.5 pl-11">
          <TimingEditor
            cue={cue}
            cueListId={cueListId}
            onSaved={() => {
              setEditing(false);
              onRefresh();
            }}
          />
        </div>
      )}

      {/* Channel count hint */}
      <div className="pl-11 text-console-dim mt-0.5">
        {cue.values.length} fixture{cue.values.length !== 1 ? 's' : ''} · cue {index + 1}
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

export function CueListView() {
  const [cueLists, setCueLists] = useState<CueListWithPlayback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newListLabel, setNewListLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    void fetch('/api/cueLists')
      .then((r) => r.json() as Promise<CueListWithPlayback[]>)
      .then(setCueLists);
  }, []);

  useEffect(() => {
    refresh();
    // Poll for playback state changes
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [refresh]);

  const selectedList = cueLists.find((cl) => cl.id === selectedId) ?? null;

  const createList = useCallback(async () => {
    if (!newListLabel.trim()) return;
    setCreating(true);
    try {
      await fetch('/api/cueLists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newListLabel.trim() }),
      });
      setNewListLabel('');
      refresh();
    } finally {
      setCreating(false);
    }
  }, [newListLabel, refresh]);

  const deleteList = useCallback(
    async (id: string) => {
      await fetch(`/api/cueLists/${id}`, { method: 'DELETE' });
      if (selectedId === id) setSelectedId(null);
      refresh();
    },
    [selectedId, refresh],
  );

  const playback = useCallback(
    async (action: 'go' | 'back' | 'pause' | 'release') => {
      if (!selectedId) return;
      await fetch(`/api/cueLists/${selectedId}/${action}`, { method: 'POST' });
      refresh();
    },
    [selectedId, refresh],
  );

  const recordCue = useCallback(async () => {
    if (!selectedId) return;
    await fetch(`/api/cueLists/${selectedId}/cues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    refresh();
  }, [selectedId, refresh]);

  const pb = selectedList?.playback;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: cue list selector */}
      <div className="w-56 border-r border-console-border flex flex-col shrink-0">
        <div className="p-3 border-b border-console-border">
          <div className="text-xs font-semibold text-console-text mb-2">Cue Lists</div>
          <div className="flex gap-1">
            <input
              className="flex-1 bg-console-bg border border-console-border rounded px-2 py-1 text-xs text-console-text placeholder-console-dim focus:outline-none focus:border-console-active"
              placeholder="List name…"
              value={newListLabel}
              onChange={(e) => setNewListLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createList();
              }}
            />
            <button
              className="px-2 py-1 text-xs rounded bg-console-active text-white hover:bg-blue-600 disabled:opacity-50"
              onClick={() => void createList()}
              disabled={creating || !newListLabel.trim()}
            >
              +
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cueLists.map((cl) => (
            <div key={cl.id} className="flex items-center group">
              <button
                className={[
                  'flex-1 text-left px-3 py-2 border-b border-console-border text-xs transition-colors',
                  selectedId === cl.id
                    ? 'bg-console-active/20 text-console-text'
                    : 'text-console-dim hover:bg-console-muted hover:text-console-text',
                ].join(' ')}
                onClick={() => setSelectedId(cl.id)}
              >
                <div className="font-medium">{cl.label}</div>
                <div className="text-[10px] text-console-dim">
                  {cl.cues.length} cue{cl.cues.length !== 1 ? 's' : ''}
                  {cl.playback.activeCueIndex >= 0 && (
                    <span className="text-console-active ml-1">
                      {cl.playback.fading ? '▶ fading' : `• cue ${cl.playback.activeCueIndex + 1}`}
                    </span>
                  )}
                </div>
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 px-2 text-console-danger hover:text-red-400 text-xs"
                onClick={() => void deleteList(cl.id)}
                title="Delete list"
              >
                ✕
              </button>
            </div>
          ))}

          {cueLists.length === 0 && (
            <p className="text-console-dim text-xs p-3">No cue lists. Create one above.</p>
          )}
        </div>
      </div>

      {/* Right: selected cue list */}
      {selectedList ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header + controls */}
          <div className="p-3 border-b border-console-border shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-console-text flex-1">
                {selectedList.label}
              </span>
              <button
                className="px-2 py-1 text-xs rounded bg-console-panel border border-console-border text-console-dim hover:text-console-text"
                onClick={() => void recordCue()}
                title="Record cue from programmer"
              >
                ⏺ Record
              </button>
            </div>

            {/* Playback status */}
            {pb && pb.activeCueIndex >= 0 && (
              <div className="text-xs text-console-dim mb-2">
                Active: cue {pb.activeCueIndex + 1}
                {pb.fading && <span className="text-console-active ml-1">(fading…)</span>}
                {pb.paused && <span className="text-yellow-400 ml-1">(paused)</span>}
              </div>
            )}

            {/* Transport buttons */}
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 text-sm font-bold rounded bg-console-active text-white hover:bg-blue-600"
                onClick={() => void playback('go')}
              >
                GO
              </button>
              <button
                className="px-3 py-2 text-xs rounded bg-console-panel border border-console-border text-console-dim hover:text-console-text"
                onClick={() => void playback('back')}
              >
                ◀ Back
              </button>
              <button
                className="px-3 py-2 text-xs rounded bg-console-panel border border-console-border text-console-dim hover:text-console-text"
                onClick={() => void playback('pause')}
              >
                ⏸ Pause
              </button>
              <button
                className="px-3 py-2 text-xs rounded bg-console-danger/20 border border-console-danger/30 text-console-danger hover:bg-console-danger/40"
                onClick={() => void playback('release')}
              >
                Release
              </button>
            </div>
          </div>

          {/* Cue list */}
          <div className="flex-1 overflow-y-auto">
            {selectedList.cues.length === 0 ? (
              <p className="text-console-dim text-xs p-3">
                No cues recorded. Set programmer values, then click ⏺ Record.
              </p>
            ) : (
              selectedList.cues.map((cue, idx) => (
                <CueRow
                  key={cue.id}
                  cue={cue}
                  index={idx}
                  isActive={pb?.activeCueIndex === idx}
                  cueListId={selectedList.id}
                  onRefresh={refresh}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-console-dim text-sm">Select a cue list to edit and play it back.</p>
        </div>
      )}
    </div>
  );
}
