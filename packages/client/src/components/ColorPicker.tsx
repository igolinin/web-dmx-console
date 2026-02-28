import { useRef, useEffect, useCallback } from 'react';
import { hsvToRgb, rgbToHsv } from '@dmx-console/shared';

interface ColorPickerProps {
  red: number; // 0–255
  green: number; // 0–255
  blue: number; // 0–255
  white?: number; // 0–255, shown if hasWhite
  amber?: number; // 0–255, shown if hasAmber
  hasWhite: boolean;
  hasAmber: boolean;
  onChange: (
    channels: Partial<Record<'Red' | 'Green' | 'Blue' | 'White' | 'Amber', number>>,
  ) => void;
}

const WHEEL_RADIUS = 70;
const WHEEL_SIZE = WHEEL_RADIUS * 2 + 4;

export function ColorPicker({
  red,
  green,
  blue,
  white = 0,
  amber = 0,
  hasWhite,
  hasAmber,
  onChange,
}: ColorPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { h, s } = rgbToHsv(red, green, blue);

  // Dot position on wheel: polar → canvas
  const dotAngle = (h / 360) * 2 * Math.PI - Math.PI / 2;
  const dotRadius = s * WHEEL_RADIUS;
  const dotX = WHEEL_RADIUS + 2 + dotRadius * Math.cos(dotAngle);
  const dotY = WHEEL_RADIUS + 2 + dotRadius * Math.sin(dotAngle);

  // Draw the HSV colour wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = WHEEL_RADIUS + 2;
    const cy = WHEEL_RADIUS + 2;

    for (let angle = 0; angle < 360; angle++) {
      const startAngle = ((angle - 1) / 180) * Math.PI;
      const endAngle = ((angle + 1) / 180) * Math.PI;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, WHEEL_RADIUS);
      const { r, g, b } = hsvToRgb(angle, 1, 1);
      gradient.addColorStop(0, 'white');
      gradient.addColorStop(1, `rgb(${r},${g},${b})`);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, WHEEL_RADIUS, startAngle - Math.PI / 2, endAngle - Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, []);

  const handleWheelClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = WHEEL_RADIUS + 2;
      const cy = WHEEL_RADIUS + 2;
      const px = e.clientX - rect.left - cx;
      const py = e.clientY - rect.top - cy;
      const dist = Math.sqrt(px * px + py * py);
      if (dist > WHEEL_RADIUS) return;

      const angleRad = Math.atan2(py, px) + Math.PI / 2;
      const hue = ((angleRad / (2 * Math.PI)) * 360 + 360) % 360;
      const sat = Math.min(1, dist / WHEEL_RADIUS);

      const { r, g, b } = hsvToRgb(hue, sat, 1);
      onChange({ Red: r, Green: g, Blue: b });
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Colour wheel */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={WHEEL_SIZE}
            height={WHEEL_SIZE}
            className="rounded-full cursor-crosshair"
            onClick={handleWheelClick}
          />
          {/* Dot indicator */}
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none"
            style={{
              left: dotX,
              top: dotY,
              transform: 'translate(-50%, -50%)',
              backgroundColor: `rgb(${red},${green},${blue})`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            }}
          />
        </div>

        {/* Colour swatch */}
        <div
          className="w-10 h-10 rounded border border-console-border"
          style={{ backgroundColor: `rgb(${red},${green},${blue})` }}
        />
      </div>

      {/* RGB sliders */}
      {(['Red', 'Green', 'Blue'] as const).map((ch) => {
        const val = ch === 'Red' ? red : ch === 'Green' ? green : blue;
        const color = ch === 'Red' ? '#ff4444' : ch === 'Green' ? '#44ff44' : '#4488ff';
        return (
          <label key={ch} className="flex items-center gap-2 text-xs text-console-dim">
            <span className="w-10 shrink-0" style={{ color }}>
              {ch}
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={val}
              className="flex-1 accent-console-active h-1"
              onChange={(e) => onChange({ [ch]: parseInt(e.target.value, 10) })}
            />
            <span className="w-8 text-right tabular-nums text-console-text">{val}</span>
          </label>
        );
      })}

      {/* White slider */}
      {hasWhite && (
        <label className="flex items-center gap-2 text-xs text-console-dim">
          <span className="w-10 shrink-0 text-white">White</span>
          <input
            type="range"
            min={0}
            max={255}
            value={white}
            className="flex-1 accent-console-active h-1"
            onChange={(e) => onChange({ White: parseInt(e.target.value, 10) })}
          />
          <span className="w-8 text-right tabular-nums text-console-text">{white}</span>
        </label>
      )}

      {/* Amber slider */}
      {hasAmber && (
        <label className="flex items-center gap-2 text-xs text-console-dim">
          <span className="w-10 shrink-0" style={{ color: '#ffb347' }}>
            Amber
          </span>
          <input
            type="range"
            min={0}
            max={255}
            value={amber}
            className="flex-1 accent-console-active h-1"
            onChange={(e) => onChange({ Amber: parseInt(e.target.value, 10) })}
          />
          <span className="w-8 text-right tabular-nums text-console-text">{amber}</span>
        </label>
      )}
    </div>
  );
}
