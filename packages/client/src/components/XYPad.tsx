import { useRef, useCallback } from 'react';
import { panTiltToXy } from '@dmx-console/shared';

interface XYPadProps {
  pan: number; // 0–255
  tilt: number; // 0–255
  onChange: (pan: number, tilt: number) => void;
  size?: number;
  disabled?: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function XYPad({ pan, tilt, onChange, size = 200, disabled = false }: XYPadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const { x: dotX, y: dotY } = panTiltToXy(pan, tilt);
  // Map normalised [-1,1] to pixel coords within the pad
  const dotPx = ((dotX + 1) / 2) * size;
  const dotPy = ((dotY + 1) / 2) * size;

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);

      const normalX = nx * 2 - 1;
      const normalY = ny * 2 - 1;

      const newPan = Math.round(clamp((normalX + 1) * 127.5, 0, 255));
      const newTilt = Math.round(clamp((normalY + 1) * 127.5, 0, 255));
      onChange(newPan, newTilt);
    },
    [disabled, onChange],
  );

  return (
    <div
      ref={containerRef}
      className={[
        'relative border border-console-border rounded bg-console-bg select-none touch-none',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-crosshair',
      ].join(' ')}
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        if (disabled) return;
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        handlePointer(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) handlePointer(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute border-console-border/30 border-dashed"
          style={{
            left: '50%',
            top: 0,
            bottom: 0,
            borderLeftWidth: 1,
            transform: 'translateX(-50%)',
          }}
        />
        <div
          className="absolute border-console-border/30 border-dashed"
          style={{
            top: '50%',
            left: 0,
            right: 0,
            borderTopWidth: 1,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Dot */}
      <div
        className="absolute w-3 h-3 rounded-full bg-console-active border-2 border-white pointer-events-none"
        style={{
          left: dotPx,
          top: dotPy,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Labels */}
      <div className="absolute bottom-1 left-1 text-[9px] text-console-dim pointer-events-none">
        P:{pan} T:{tilt}
      </div>
    </div>
  );
}
