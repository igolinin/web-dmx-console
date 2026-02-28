import { useState, useEffect, useCallback } from 'react';
import type { FixtureDef } from '@dmx-console/shared';
import { useShowStore } from '../store/useShow.js';
import { UniverseGrid } from '../components/UniverseGrid.js';
import { FixtureCard } from '../components/FixtureCard.js';

export function PatchView() {
  const show = useShowStore((s) => s.show);
  const dmxOutput = useShowStore((s) => s.dmxOutput);
  const setShow = useShowStore((s) => s.setShow);

  const [library, setLibrary] = useState<FixtureDef[]>([]);
  const [defMap, setDefMap] = useState<Record<string, FixtureDef>>({});
  const [search, setSearch] = useState('');
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ universe: 0, address: 1, label: '', modeIndex: 0 });
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Load fixture library
  useEffect(() => {
    void fetch('/api/fixtures')
      .then((r) => r.json() as Promise<FixtureDef[]>)
      .then((defs) => {
        setLibrary(defs);
        const map: Record<string, FixtureDef> = {};
        for (const d of defs) map[d.id] = d;
        setDefMap(map);
      });
  }, []);

  const filteredLibrary = library.filter(
    (d) =>
      !search ||
      d.model.toLowerCase().includes(search.toLowerCase()) ||
      d.manufacturer.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedDef = selectedDefId ? defMap[selectedDefId] : undefined;

  const refreshPatch = useCallback(() => {
    void fetch('/api/state')
      .then((r) => r.json())
      .then(setShow);
  }, [setShow]);

  const handleAdd = useCallback(async () => {
    if (!selectedDefId) return;
    setError(null);
    setAdding(true);

    try {
      const res = await fetch('/api/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defId: selectedDefId,
          universe: addForm.universe,
          address: addForm.address,
          label: addForm.label || undefined,
          modeIndex: addForm.modeIndex,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Failed to add fixture');
      } else {
        refreshPatch();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }, [selectedDefId, addForm, refreshPatch]);

  const handleRemove = useCallback(
    async (id: string) => {
      await fetch(`/api/patch/${id}`, { method: 'DELETE' });
      refreshPatch();
    },
    [refreshPatch],
  );

  const fixtures = show?.fixtures ?? [];
  const activeUniverse = show?.artnet.universes[0] ?? 0;
  const dmxData = dmxOutput[activeUniverse] ?? Array<number>(512).fill(0);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: fixture library */}
      <div className="w-72 border-r border-console-border flex flex-col shrink-0">
        <div className="p-3 border-b border-console-border">
          <div className="text-sm font-semibold text-console-text mb-2">Fixture Library</div>
          <input
            className="w-full bg-console-bg border border-console-border rounded px-2 py-1 text-sm text-console-text placeholder-console-dim focus:outline-none focus:border-console-active"
            placeholder="Search fixtures…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredLibrary.map((def) => (
            <button
              key={def.id}
              className={[
                'w-full text-left px-3 py-2 border-b border-console-border text-xs transition-colors',
                selectedDefId === def.id
                  ? 'bg-console-active/20 text-console-text'
                  : 'text-console-dim hover:bg-console-muted hover:text-console-text',
              ].join(' ')}
              onClick={() => {
                setSelectedDefId(def.id);
                setAddForm((f) => ({ ...f, label: def.model, modeIndex: 0 }));
              }}
            >
              <div className="font-medium text-console-text">{def.model}</div>
              <div className="text-console-dim">
                {def.manufacturer} · {def.type}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Middle: add panel + patched fixtures */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Add fixture form */}
        {selectedDef && (
          <div className="p-3 border-b border-console-border bg-console-panel/50 shrink-0">
            <div className="text-sm font-semibold text-console-text mb-2">
              Add: {selectedDef.model}
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs text-console-dim">
                Universe
                <input
                  type="number"
                  className="ml-1 w-16 bg-console-bg border border-console-border rounded px-2 py-0.5 text-sm text-console-text"
                  value={addForm.universe}
                  min={0}
                  max={32767}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, universe: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </label>
              <label className="text-xs text-console-dim">
                Address
                <input
                  type="number"
                  className="ml-1 w-16 bg-console-bg border border-console-border rounded px-2 py-0.5 text-sm text-console-text"
                  value={addForm.address}
                  min={1}
                  max={512}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, address: parseInt(e.target.value, 10) || 1 }))
                  }
                />
              </label>
              {selectedDef.modes.length > 1 && (
                <label className="text-xs text-console-dim">
                  Mode
                  <select
                    className="ml-1 bg-console-bg border border-console-border rounded px-2 py-0.5 text-sm text-console-text"
                    value={addForm.modeIndex}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, modeIndex: parseInt(e.target.value, 10) }))
                    }
                  >
                    {selectedDef.modes.map((m, i) => (
                      <option key={i} value={i}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs text-console-dim">
                Label
                <input
                  className="ml-1 w-32 bg-console-bg border border-console-border rounded px-2 py-0.5 text-sm text-console-text"
                  value={addForm.label}
                  onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <button
                className="px-3 py-1 text-sm rounded bg-console-active text-white hover:bg-blue-600 disabled:opacity-50"
                onClick={() => void handleAdd()}
                disabled={adding}
              >
                Add to Patch
              </button>
            </div>
            {error && <div className="mt-1 text-xs text-console-danger">{error}</div>}
          </div>
        )}

        {/* Patched fixtures grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-sm font-semibold text-console-text mb-3">
            Patched Fixtures ({fixtures.length})
          </div>
          {fixtures.length === 0 ? (
            <p className="text-console-dim text-sm">
              No fixtures patched. Select from the library to add.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {fixtures.map((f) => (
                <FixtureCard
                  key={f.id}
                  fixture={f}
                  def={defMap[f.defId]}
                  selected={selectedFixtureId === f.id}
                  onClick={() => setSelectedFixtureId(f.id === selectedFixtureId ? null : f.id)}
                  onRemove={() => void handleRemove(f.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Universe grid */}
        <div className="border-t border-console-border p-3 shrink-0">
          <UniverseGrid
            universe={activeUniverse}
            dmxData={dmxData}
            fixtures={fixtures}
            onChannelClick={(ch) => console.log('channel clicked:', ch)}
          />
        </div>
      </div>
    </div>
  );
}
