import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FixtureDef, PatchedFixture } from '@dmx-console/shared';
import { useShowStore } from '../store/useShow.js';
import { UniverseGrid } from '../components/UniverseGrid.js';
import { FixtureCard } from '../components/FixtureCard.js';

/** Return the lowest DMX address (1–512) where `chCount` consecutive channels
 *  are free in the given universe, or 1 if nothing is patched yet. */
function firstFreeAddress(
  fixtures: PatchedFixture[],
  universe: number,
  defMap: Record<string, FixtureDef>,
  chCount: number,
): number {
  const occupied = new Set<number>();
  for (const f of fixtures) {
    if (f.universe !== universe) continue;
    const count = defMap[f.defId]?.modes[f.modeIndex]?.channelNames.length ?? 1;
    for (let i = 0; i < count; i++) occupied.add(f.address + i);
  }
  for (let addr = 1; addr <= 513 - chCount; addr++) {
    let free = true;
    for (let i = 0; i < chCount; i++) {
      if (occupied.has(addr + i)) {
        free = false;
        break;
      }
    }
    if (free) return addr;
  }
  return 1;
}

export function PatchView() {
  const show = useShowStore((s) => s.show);
  const dmxOutput = useShowStore((s) => s.dmxOutput);
  const setShow = useShowStore((s) => s.setShow);

  const [library, setLibrary] = useState<FixtureDef[]>([]);
  const [defMap, setDefMap] = useState<Record<string, FixtureDef>>({});
  const [search, setSearch] = useState('');
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({
    universe: 0,
    address: 1,
    label: '',
    modeIndex: 0,
    qty: 1,
  });
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

  // Channel count for the currently selected def + mode
  const selectedChCount = useMemo(
    () => selectedDef?.modes[addForm.modeIndex]?.channelNames.length ?? 1,
    [selectedDef, addForm.modeIndex],
  );

  // Auto-compute the first free address whenever def / universe / mode changes
  useEffect(() => {
    if (!selectedDefId || !show) return;
    const addr = firstFreeAddress(show.fixtures, addForm.universe, defMap, selectedChCount);
    setAddForm((f) => ({ ...f, address: addr }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDefId, addForm.universe, addForm.modeIndex, selectedChCount]);

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
      let nextAddr = addForm.address;
      const qty = Math.max(1, addForm.qty);

      for (let i = 0; i < qty; i++) {
        const label =
          qty > 1
            ? `${addForm.label !== '' ? addForm.label : (selectedDef?.model ?? '')} ${i + 1}`.trim()
            : addForm.label !== ''
              ? addForm.label
              : undefined;

        const res = await fetch('/api/patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defId: selectedDefId,
            universe: addForm.universe,
            address: nextAddr,
            label,
            modeIndex: addForm.modeIndex,
          }),
        });

        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          setError(body.error ?? 'Failed to add fixture');
          break;
        }

        nextAddr += selectedChCount;
      }

      refreshPatch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }, [selectedDefId, addForm, selectedDef, selectedChCount, refreshPatch]);

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
                setAddForm((f) => ({ ...f, label: def.model, modeIndex: 0, qty: 1 }));
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
                <span className="ml-1 text-console-dim/60">
                  ({selectedChCount}ch → {addForm.address + selectedChCount - 1})
                </span>
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
              <label className="text-xs text-console-dim">
                Qty
                <input
                  type="number"
                  className="ml-1 w-14 bg-console-bg border border-console-border rounded px-2 py-0.5 text-sm text-console-text"
                  value={addForm.qty}
                  min={1}
                  max={64}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, qty: parseInt(e.target.value, 10) || 1 }))
                  }
                />
              </label>
              <button
                className="px-3 py-1 text-sm rounded bg-console-active text-white hover:bg-blue-600 disabled:opacity-50"
                onClick={() => void handleAdd()}
                disabled={adding}
              >
                {addForm.qty > 1 ? `Add ${addForm.qty} to Patch` : 'Add to Patch'}
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
