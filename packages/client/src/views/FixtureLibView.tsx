import { useState, useEffect } from 'react';
import type { FixtureDef } from '@dmx-console/shared';

export function FixtureLibView() {
  const [library, setLibrary] = useState<FixtureDef[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/fixtures')
      .then((r) => r.json() as Promise<FixtureDef[]>)
      .then(setLibrary);
  }, []);

  const filtered = library.filter(
    (d) =>
      !search ||
      d.model.toLowerCase().includes(search.toLowerCase()) ||
      d.manufacturer.toLowerCase().includes(search.toLowerCase()) ||
      d.type.toLowerCase().includes(search.toLowerCase()),
  );

  const selected = library.find((d) => d.id === selectedId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="w-80 border-r border-console-border flex flex-col shrink-0">
        <div className="p-3 border-b border-console-border">
          <div className="text-sm font-semibold text-console-text mb-2">
            Fixture Library ({library.length})
          </div>
          <input
            className="w-full bg-console-bg border border-console-border rounded px-2 py-1 text-sm text-console-text placeholder-console-dim focus:outline-none focus:border-console-active"
            placeholder="Search by name, manufacturer or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((def) => (
            <button
              key={def.id}
              className={[
                'w-full text-left px-3 py-2 border-b border-console-border text-xs transition-colors',
                selectedId === def.id
                  ? 'bg-console-active/20 text-console-text'
                  : 'text-console-dim hover:bg-console-muted hover:text-console-text',
              ].join(' ')}
              onClick={() => setSelectedId(def.id)}
            >
              <div className="font-medium text-console-text">{def.model}</div>
              <div className="flex gap-2 text-console-dim mt-0.5">
                <span>{def.manufacturer}</span>
                <span>·</span>
                <span>{def.type}</span>
                {def.source && <span className="ml-auto opacity-60">{def.source}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected ? (
          <div className="max-w-2xl space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-console-text">{selected.model}</h2>
              <div className="text-console-dim text-sm">
                {selected.manufacturer} · {selected.type}
                {selected.source && ` · source: ${selected.source}`}
              </div>
              <div className="text-xs text-console-muted mt-1 font-mono">id: {selected.id}</div>
            </div>

            {selected.physical && (
              <div className="console-panel p-3 text-sm space-y-1">
                <div className="text-console-accent text-xs font-semibold mb-1">Physical</div>
                {selected.physical.panMax && (
                  <div className="text-console-dim">Pan: {selected.physical.panMax}°</div>
                )}
                {selected.physical.tiltMax && (
                  <div className="text-console-dim">Tilt: {selected.physical.tiltMax}°</div>
                )}
                {selected.physical.pixelCount && (
                  <div className="text-console-dim">Pixels: {selected.physical.pixelCount}</div>
                )}
                {selected.physical.powerW && (
                  <div className="text-console-dim">Power: {selected.physical.powerW}W</div>
                )}
              </div>
            )}

            {selected.modes.map((mode, mi) => (
              <div key={mi} className="console-panel p-3">
                <div className="text-console-accent text-xs font-semibold mb-2">
                  {mode.name} ({mode.channelNames.length} channels)
                </div>
                <table className="w-full text-xs text-console-dim">
                  <thead>
                    <tr className="border-b border-console-border">
                      <th className="text-left py-1 pr-4 font-medium">DMX</th>
                      <th className="text-left py-1 pr-4 font-medium">Channel</th>
                      <th className="text-left py-1 pr-4 font-medium">Group</th>
                      <th className="text-left py-1 font-medium">Colour / Preset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mode.channelNames.map((chName, chi) => {
                      const ch = selected.channels[chName];
                      return (
                        <tr key={chi} className="border-b border-console-border/50">
                          <td className="py-0.5 pr-4 text-console-accent">{chi + 1}</td>
                          <td className="py-0.5 pr-4 text-console-text">{chName}</td>
                          <td className="py-0.5 pr-4">{ch?.group ?? '—'}</td>
                          <td className="py-0.5">{ch?.colour ?? ch?.preset ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-console-dim text-sm mt-8 text-center">
            Select a fixture from the list to view its details.
          </div>
        )}
      </div>
    </div>
  );
}
