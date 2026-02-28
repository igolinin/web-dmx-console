interface FaderDef {
  label: string;
  channelName: string;
  value: number; // 0–255
}

interface FaderBankProps {
  faders: FaderDef[];
  onChange: (channelName: string, value: number) => void;
  showPercent?: boolean;
}

export function FaderBank({ faders, onChange, showPercent = false }: FaderBankProps) {
  if (faders.length === 0) {
    return <p className="text-console-dim text-xs">No channels</p>;
  }

  return (
    <div className="flex gap-3 flex-wrap">
      {faders.map(({ label, channelName, value }) => {
        const pct = Math.round((value / 255) * 100);
        const display = showPercent ? `${pct}%` : String(value);

        return (
          <div key={channelName} className="flex flex-col items-center gap-1 w-10">
            {/* Vertical slider — rotate a horizontal range 90° */}
            <div className="relative h-28 flex items-center justify-center" style={{ width: 20 }}>
              <input
                type="range"
                min={0}
                max={255}
                value={value}
                className="accent-console-active"
                style={{
                  width: 112, // matches the h-28 (7rem = 112px) height
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center center',
                  position: 'absolute',
                }}
                onChange={(e) => onChange(channelName, parseInt(e.target.value, 10))}
              />
            </div>
            {/* Value label */}
            <span className="text-[9px] text-console-text tabular-nums">{display}</span>
            {/* Channel label */}
            <span className="text-[9px] text-console-dim text-center leading-tight break-all w-10">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
