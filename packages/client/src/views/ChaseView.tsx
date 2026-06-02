import { useState, useEffect, useCallback } from 'react';
import type { Chase } from '@dmx-console/shared';

interface ChaseWithStatus extends Chase {
  running: boolean;
  currentStepIndex: number;
}

// ── Direction selector ─────────────────────────────────────────────────────

const DIRECTIONS: Chase['direction'][] = ['forward', 'backward', 'bounce', 'random'];

// ── Main view ──────────────────────────────────────────────────────────────

export function ChaseView() {
  const [chases, setChases] = useState<ChaseWithStatus[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');

  const refresh = useCallback(() => {
    void fetch('/api/chases')
      .then((r) => r.json() as Promise<ChaseWithStatus[]>)
      .then(setChases);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 200);
    return () => clearInterval(id);
  }, [refresh]);

  const selected = chases.find((c) => c.id === selectedId) ?? null;

  const create = useCallback(async () => {
    if (!newLabel.trim()) return;
    await fetch('/api/chases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    setNewLabel('');
    refresh();
  }, [newLabel, refresh]);

  const deleteChase = useCallback(
    async (id: string) => {
      await fetch(`/api/chases/${id}`, { method: 'DELETE' });
      if (selectedId === id) setSelectedId(null);
      refresh();
    },
    [selectedId, refresh],
  );

  const update = useCallback(
    async (id: string, body: Partial<Pick<Chase, 'label' | 'direction'>>) => {
      await fetch(`/api/chases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      refresh();
    },
    [refresh],
  );

  const recordStep = useCallback(async () => {
    if (!selectedId) return;
    await fetch(`/api/chases/${selectedId}/steps`, { method: 'POST' });
    refresh();
  }, [selectedId, refresh]);

  const deleteStep = useCallback(
    async (chaseId: string, stepId: string) => {
      await fetch(`/api/chases/${chaseId}/steps/${stepId}`, { method: 'DELETE' });
      refresh();
    },
    [refresh],
  );

  const playStop = useCallback(
    async (chase: ChaseWithStatus) => {
      const action = chase.running ? 'stop' : 'play';
      await fetch(`/api/chases/${chase.id}/${action}`, { method: 'POST' });
      refresh();
    },
    [refresh],
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: chase list */}
      <div className="w-56 border-r border-console-border flex flex-col shrink-0">
        <div className="p-3 border-b border-console-border">
          <div className="text-xs font-semibold text-console-text mb-2">Chases</div>
          <div className="flex gap-1">
            <input
              className="flex-1 bg-console-bg border border-console-border rounded px-2 py-1 text-xs text-console-text placeholder-console-dim focus:outline-none focus:border-console-active"
              placeholder="Chase name…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
            <button
              className="px-2 py-1 text-xs rounded bg-console-active text-white hover:bg-blue-600 disabled:opacity-50"
              onClick={() => void create()}
              disabled={!newLabel.trim()}
            >
              +
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chases.map((ch) => (
            <div key={ch.id} className="flex items-center group">
              <button
                className={[
                  'flex-1 text-left px-3 py-2 border-b border-console-border text-xs transition-colors',
                  selectedId === ch.id
                    ? 'bg-console-active/20 text-console-text'
                    : 'text-console-dim hover:bg-console-muted hover:text-console-text',
                ].join(' ')}
                onClick={() => setSelectedId(ch.id)}
              >
                <div className="font-medium flex items-center gap-1">
                  {ch.running && <span className="text-console-active text-[10px]">▶</span>}
                  {ch.label}
                </div>
                <div className="text-[10px] text-console-dim">
                  {ch.steps.length} steps · {ch.direction}
                </div>
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 px-2 text-console-danger hover:text-red-400 text-xs"
                onClick={() => void deleteChase(ch.id)}
              >
                ✕
              </button>
            </div>
          ))}

          {chases.length === 0 && (
            <p className="text-console-dim text-xs p-3">No chases. Create one above.</p>
          )}
        </div>
      </div>

      {/* Right: selected chase editor */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Controls */}
          <div className="p-3 border-b border-console-border shrink-0 space-y-2">
            {/* Direction */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d}
                    className={[
                      'px-2 py-0.5 text-xs rounded border transition-colors',
                      selected.direction === d
                        ? 'bg-console-active/20 border-console-active text-console-text'
                        : 'border-console-border text-console-dim hover:text-console-text',
                    ].join(' ')}
                    onClick={() => void update(selected.id, { direction: d })}
                  >
                    {d[0]!.toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Play / Stop + Record */}
            <div className="flex gap-2">
              <button
                className={[
                  'flex-1 py-2 text-sm font-bold rounded',
                  selected.running
                    ? 'bg-console-danger/80 text-white hover:bg-red-600'
                    : 'bg-console-active text-white hover:bg-blue-600',
                ].join(' ')}
                onClick={() => void playStop(selected)}
              >
                {selected.running ? '⏹ Stop' : '▶ Play'}
              </button>

              <button
                className="px-3 py-2 text-xs rounded bg-console-panel border border-console-border text-console-dim hover:text-console-text"
                onClick={() => void recordStep()}
              >
                ⏺ Record step
              </button>
            </div>

            {/* Running indicator */}
            {selected.running && (
              <div className="text-xs text-console-active">
                Step {selected.currentStepIndex + 1} / {selected.steps.length} active
              </div>
            )}
          </div>

          {/* Step list */}
          <div className="flex-1 overflow-y-auto">
            {selected.steps.length === 0 ? (
              <p className="text-console-dim text-xs p-3">
                No steps. Set programmer values, then click ⏺ Record step.
              </p>
            ) : (
              selected.steps.map((step, idx) => {
                const isActive = selected.running && selected.currentStepIndex === idx;
                return (
                  <div
                    key={step.id}
                    className={[
                      'flex items-center px-3 py-2 border-b border-console-border text-xs',
                      isActive
                        ? 'bg-console-active/20 border-l-2 border-l-console-active'
                        : 'hover:bg-console-muted',
                    ].join(' ')}
                  >
                    <span className="w-8 tabular-nums text-console-dim">{idx + 1}</span>
                    <span className="flex-1 text-console-text">
                      {step.values.length} fixture{step.values.length !== 1 ? 's' : ''}
                      {step.values.length > 0 && (
                        <span className="text-console-dim ml-2">
                          (
                          {step.values
                            .slice(0, 3)
                            .map((v) => v.fixtureId.slice(-4))
                            .join(', ')}
                          {step.values.length > 3 && '…'})
                        </span>
                      )}
                    </span>
                    {isActive && <span className="text-console-active text-[10px] mr-2">▶</span>}
                    <button
                      className="text-console-danger hover:text-red-400 px-1"
                      onClick={() => void deleteStep(selected.id, step.id)}
                      title="Delete step"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-console-dim text-sm">Select a chase to edit and play it back.</p>
        </div>
      )}
    </div>
  );
}
