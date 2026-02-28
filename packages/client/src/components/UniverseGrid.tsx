import type { PatchedFixture } from '@dmx-console/shared';

interface UniverseGridProps {
  universe: number;
  dmxData: number[];
  fixtures: PatchedFixture[];
  onChannelClick?: (channel: number) => void;
}

const TYPE_COLORS: Record<string, string> = {
  Dimmer: '#888888',
  'Color Changer': '#4ade80',
  'Moving Head': '#60a5fa',
  Scanner: '#a78bfa',
  'LED Bar (Beams)': '#34d399',
  'LED Bar (Pixels)': '#f472b6',
  Strobe: '#fbbf24',
  Effect: '#fb923c',
  Other: '#94a3b8',
};

export function UniverseGrid({ universe, dmxData, fixtures, onChannelClick }: UniverseGridProps) {
  // Build a map: channel index (0-based) → fixture
  const channelFixtureMap = new Map<number, PatchedFixture>();
  for (const fixture of fixtures) {
    if (fixture.universe !== universe) continue;
    const start = fixture.address - 1;
    for (let i = 0; i < 24; i++) {
      // assume max 24 channels per fixture for mapping; actual count from def
      channelFixtureMap.set(start + i, fixture);
    }
  }

  const cells = Array.from({ length: 512 }, (_, i) => {
    const val = dmxData[i] ?? 0;
    const fixture = channelFixtureMap.get(i);
    return { i, val, fixture };
  });

  return (
    <div className="space-y-1">
      <div className="text-xs text-console-dim px-1">Universe {universe} — 512 channels</div>
      <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(32, 1fr)' }}>
        {cells.map(({ i, val, fixture }) => {
          const isUsed = fixture !== undefined;
          const baseColor = '#2a2a2a';
          const alpha = isUsed ? (val > 0 ? 0.4 + (val / 255) * 0.6 : 0.2) : 1;

          return (
            <button
              key={i}
              title={`Ch ${i + 1}${fixture ? ` — ${fixture.label}` : ''}: ${val}`}
              className="h-3 rounded-sm transition-opacity cursor-pointer hover:ring-1 hover:ring-white/30"
              style={{ backgroundColor: baseColor, opacity: alpha }}
              onClick={() => onChannelClick?.(i + 1)}
            />
          );
        })}
      </div>
      <div className="flex gap-3 text-xs text-console-dim flex-wrap px-1 pt-1">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
            <span>{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
