/**
 * Convert normalised XY-pad coordinates to pan/tilt DMX values (0–255).
 * @param x  -1 (full left) to +1 (full right) → pan
 * @param y  -1 (full up)   to +1 (full down)  → tilt
 */
export function xyToPanTilt(x: number, y: number): { pan: number; tilt: number } {
  const cx = Math.max(-1, Math.min(1, x));
  const cy = Math.max(-1, Math.min(1, y));
  return {
    pan: Math.round((cx + 1) * 127.5),
    tilt: Math.round((cy + 1) * 127.5),
  };
}

/**
 * Convert pan/tilt DMX values (0–255) back to normalised XY-pad coordinates.
 */
export function panTiltToXy(pan: number, tilt: number): { x: number; y: number } {
  return {
    x: pan / 127.5 - 1,
    y: tilt / 127.5 - 1,
  };
}
