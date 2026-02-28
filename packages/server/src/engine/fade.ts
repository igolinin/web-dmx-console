import type { ChannelValues } from '@dmx-console/shared';

export type FadeCurve = 'linear' | 'scurve';

/** Smoothstep S-curve: 3t² − 2t³ (maps [0,1]→[0,1] with zero slope at endpoints). */
export function sCurve(t: number): number {
  const tc = Math.max(0, Math.min(1, t));
  return tc * tc * (3 - 2 * tc);
}

/** Interpolate a single DMX value (0–255). */
export function interpolateValue(
  start: number,
  end: number,
  t: number,
  curve: FadeCurve = 'linear',
): number {
  const tc = curve === 'scurve' ? sCurve(t) : Math.max(0, Math.min(1, t));
  return Math.round(start + (end - start) * tc);
}

/**
 * Interpolate all channels between two channel maps.
 * Channels present in only one map are treated as 0 in the other.
 */
export function interpolateChannels(
  from: ChannelValues,
  to: ChannelValues,
  t: number,
  curve: FadeCurve = 'linear',
): ChannelValues {
  const result: ChannelValues = {};
  const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of allKeys) {
    const a = from[key] ?? 0;
    const b = to[key] ?? 0;
    result[key] = interpolateValue(a, b, t, curve);
  }
  return result;
}
