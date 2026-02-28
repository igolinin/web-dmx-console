import type { PatchedFixture, FixtureDef } from '@dmx-console/shared';

interface FixtureCardProps {
  fixture: PatchedFixture;
  def: FixtureDef | undefined;
  selected: boolean | undefined;
  onClick: (() => void) | undefined;
  onRemove: (() => void) | undefined;
}

const TYPE_ACCENT: Record<string, string> = {
  Dimmer: 'border-gray-500',
  'Color Changer': 'border-green-500',
  'Moving Head': 'border-blue-500',
  Scanner: 'border-purple-500',
  'LED Bar (Beams)': 'border-emerald-500',
  'LED Bar (Pixels)': 'border-pink-500',
  Strobe: 'border-yellow-500',
  Effect: 'border-orange-500',
  Other: 'border-slate-500',
};

export function FixtureCard({ fixture, def, selected, onClick, onRemove }: FixtureCardProps) {
  const typeClass = def ? (TYPE_ACCENT[def.type] ?? 'border-slate-500') : 'border-console-border';
  const mode = def?.modes[fixture.modeIndex];
  const channelCount = mode?.channelNames.length ?? 0;

  return (
    <div
      className={[
        'relative console-panel border-l-4 p-2 cursor-pointer transition-colors text-xs',
        typeClass,
        selected ? 'bg-console-active/20 ring-1 ring-console-active' : 'hover:bg-console-muted',
      ].join(' ')}
      onClick={onClick}
    >
      <div className="font-semibold text-console-text truncate">{fixture.label}</div>
      <div className="text-console-dim mt-0.5 truncate">{def?.model ?? fixture.defId}</div>
      <div className="text-console-dim mt-0.5">
        U{fixture.universe} · ch {fixture.address}–{fixture.address + channelCount - 1}
        {channelCount > 0 && ` (${channelCount}ch)`}
      </div>

      {onRemove && (
        <button
          className="absolute top-1 right-1 text-console-danger hover:text-red-400 text-xs px-1"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from patch"
        >
          ✕
        </button>
      )}
    </div>
  );
}
