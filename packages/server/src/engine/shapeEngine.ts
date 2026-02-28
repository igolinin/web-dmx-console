import type {
  ShapeLayer,
  ShapeWaveform,
  Shape2D,
  ShapeTarget,
  ChannelValues,
  PatchedFixture,
  PixelTexture,
} from '@dmx-console/shared';
import { getFixtureDef } from '../fixtures/loader.js';

// ── Internal types ────────────────────────────────────────────────────────────

type RgbTuple = [number, number, number];

interface ShapePhase {
  phase: number; // degrees, accumulated
  randomValues: number[]; // per-fixture in [-1, 1], refreshed each cycle
}

// ── Module state ──────────────────────────────────────────────────────────────

const phases = new Map<string, ShapePhase>();
let lastTickMs: number | null = null;
let cachedValues = new Map<string, ChannelValues>();

// ── Math helpers ──────────────────────────────────────────────────────────────

export function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ── Waveform evaluation ───────────────────────────────────────────────────────

/** Returns a normalized value in [-1, 1] for the given waveform and phase (degrees). */
export function evalWaveform(waveform: ShapeWaveform, phaseDeg: number, rand = 0): number {
  const t = ((phaseDeg % 360) + 360) % 360;
  const r = (t * Math.PI) / 180;
  switch (waveform) {
    case 'sine':
      return Math.sin(r);
    case 'cosine':
      return Math.cos(r);
    case 'triangle':
      return t < 180 ? t / 90 - 1 : 3 - t / 90;
    case 'square':
      return t < 180 ? 1 : -1;
    case 'ramp':
      return t / 180 - 1;
    case 'random':
      return rand;
  }
}

// ── 2D shape evaluation ───────────────────────────────────────────────────────

/** Returns {x, y} in [-1, 1] for the given 2D shape and phase (degrees). */
export function eval2D(
  shape: Shape2D,
  phaseDeg: number,
  ratio?: [number, number],
): { x: number; y: number } {
  const r = (phaseDeg * Math.PI) / 180;
  switch (shape) {
    case 'circle':
      return { x: Math.cos(r), y: Math.sin(r) };
    case 'figure8':
      return { x: Math.sin(2 * r), y: Math.sin(r) };
    case 'lissajous': {
      const [a, b] = ratio ?? [2, 1];
      return { x: Math.sin(a * r), y: Math.sin(b * r + Math.PI / 2) };
    }
  }
}

// ── Channel resolution ────────────────────────────────────────────────────────

/** Finds the first channel in the fixture's active mode that satisfies the shape target. */
export function resolveChannel(target: ShapeTarget, fixture: PatchedFixture): string | null {
  const def = getFixtureDef(fixture.defId);
  if (!def) return null;
  const mode = def.modes[fixture.modeIndex];
  if (!mode) return null;

  for (const name of mode.channelNames) {
    const ch = def.channels[name];
    if (!ch) continue;
    switch (target) {
      case 'pan':
        if (ch.group === 'Pan') return name;
        break;
      case 'tilt':
        if (ch.group === 'Tilt') return name;
        break;
      case 'dimmer':
        if (ch.group === 'Intensity') return name;
        break;
      case 'red':
        if (ch.group === 'Colour' && ch.colour === 'Red') return name;
        break;
      case 'green':
        if (ch.group === 'Colour' && ch.colour === 'Green') return name;
        break;
      case 'blue':
        if (ch.group === 'Colour' && ch.colour === 'Blue') return name;
        break;
      case 'white':
        if (ch.group === 'Colour' && ch.colour === 'White') return name;
        break;
      case 'amber':
        if (ch.group === 'Colour' && ch.colour === 'Amber') return name;
        break;
      case 'zoom':
        if (ch.group === 'Beam' && name.toLowerCase().includes('zoom')) return name;
        break;
      case 'focus':
        if (ch.group === 'Beam' && name.toLowerCase().includes('focus')) return name;
        break;
    }
  }
  return null;
}

// ── Pixel texture functions ───────────────────────────────────────────────────

function hsvToRgb(h: number, s: number, v: number): RgbTuple {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Compute RGB colour for a single pixel.
 * @param pos  Normalized position 0–1 along the bar.
 * @param phase  Current global phase in degrees 0–360.
 * @param count  Total pixel count (used for chase beam width).
 */
export function evalPixel(
  texture: PixelTexture,
  pos: number,
  phase: number,
  count: number,
): RgbTuple {
  switch (texture) {
    case 'rainbow': {
      const h = ((pos + phase / 360) % 1) * 360;
      return hsvToRgb(h, 1, 1);
    }
    case 'gradient':
      return [clamp255(pos * 255), 0, clamp255((1 - pos) * 255)];
    case 'chase': {
      const activePos = (phase / 360) % 1;
      const dist = Math.abs(pos - activePos) * count;
      const intensity = Math.max(0, 1 - dist);
      return [clamp255(255 * intensity), clamp255(80 * intensity), 0];
    }
    case 'fire': {
      const flicker = 0.8 + 0.2 * Math.sin((phase * Math.PI) / 180 + pos * 10);
      const brightness = Math.max(0, (1 - pos) * flicker);
      return [clamp255(255 * brightness), clamp255(60 * brightness * (1 - pos)), 0];
    }
    default: {
      const _: never = texture;
      throw new Error(`Unhandled pixel texture: ${String(_)}`);
    }
  }
}

// ── Output helpers ────────────────────────────────────────────────────────────

function applyPixelTexture(
  texture: PixelTexture,
  phase: number,
  fixture: PatchedFixture,
  output: Map<string, ChannelValues>,
): void {
  const def = getFixtureDef(fixture.defId);
  const pixelCount = def?.physical?.pixelCount;
  if (!pixelCount || !def) return;

  const updated: ChannelValues = { ...(output.get(fixture.id) ?? {}) };
  for (let px = 1; px <= pixelCount; px++) {
    const pos = pixelCount > 1 ? (px - 1) / (pixelCount - 1) : 0;
    const rgb = evalPixel(texture, pos, phase, pixelCount);
    const rn = `Red ${px}`;
    const gn = `Green ${px}`;
    const bn = `Blue ${px}`;
    if (def.channels[rn]) updated[rn] = rgb[0];
    if (def.channels[gn]) updated[gn] = rgb[1];
    if (def.channels[bn]) updated[bn] = rgb[2];
  }
  output.set(fixture.id, updated);
}

function apply2DLayer(
  layer: ShapeLayer,
  fixturePhase: number,
  fixture: PatchedFixture,
  output: Map<string, ChannelValues>,
): void {
  if (!layer.shape2d) return;
  const { x, y } = eval2D(layer.shape2d, fixturePhase, layer.lissajousRatio);
  const updated: ChannelValues = { ...(output.get(fixture.id) ?? {}) };

  const xCh = resolveChannel(layer.xTarget ?? 'pan', fixture);
  const yCh = resolveChannel(layer.yTarget ?? 'tilt', fixture);
  if (xCh) updated[xCh] = clamp255(layer.center + (layer.size / 2) * x);
  if (yCh) updated[yCh] = clamp255(layer.center + (layer.size / 2) * y);
  output.set(fixture.id, updated);
}

function apply1DLayer(
  layer: ShapeLayer,
  fixturePhase: number,
  rand: number,
  fixture: PatchedFixture,
  output: Map<string, ChannelValues>,
): void {
  if (!layer.waveform || !layer.target) return;
  const channelName = resolveChannel(layer.target, fixture);
  if (!channelName) return;

  const norm = evalWaveform(layer.waveform, fixturePhase, rand);
  const value = clamp255(layer.center + (layer.size / 2) * norm);
  const updated: ChannelValues = { ...(output.get(fixture.id) ?? {}) };
  updated[channelName] = value;
  output.set(fixture.id, updated);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const shapeEngine = {
  /**
   * Advance all active shape layers and recompute cached output values.
   * Call once per DMX frame with the current timestamp.
   */
  tick(shapes: ShapeLayer[], fixtures: PatchedFixture[], now: number): void {
    if (lastTickMs === null) {
      lastTickMs = now;
    }
    const dtSeconds = Math.min((now - lastTickMs) / 1000, 1.0); // cap dt at 1s
    lastTickMs = now;

    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
    const output = new Map<string, ChannelValues>();

    for (const layer of shapes) {
      if (!layer.active) {
        phases.delete(layer.id);
        continue;
      }

      // Get or create per-layer phase state
      let sp = phases.get(layer.id);
      if (!sp) {
        sp = {
          phase: 0,
          randomValues: layer.fixtureIds.map(() => Math.random() * 2 - 1),
        };
        phases.set(layer.id, sp);
      }

      // Advance phase and detect wrap for random refresh
      const phaseDelta = layer.speed * dtSeconds * 360;
      const prevPhase = sp.phase;
      sp.phase = (sp.phase + phaseDelta) % 360;
      // Regenerate random values on each full cycle wrap
      if (layer.speed > 0 && sp.phase < prevPhase) {
        sp.randomValues = layer.fixtureIds.map(() => Math.random() * 2 - 1);
      }

      const pixelTexture = layer.pixelTexture;

      for (let i = 0; i < layer.fixtureIds.length; i++) {
        const fixtureId = layer.fixtureIds[i]!;
        const fixture = fixtureMap.get(fixtureId);
        if (!fixture) continue;

        const fixturePhase = sp.phase + i * layer.spread + layer.phaseOffset;

        if (pixelTexture) {
          applyPixelTexture(pixelTexture, sp.phase + layer.phaseOffset, fixture, output);
        } else if (layer.shape2d) {
          apply2DLayer(layer, fixturePhase, fixture, output);
        } else if (layer.waveform && layer.target) {
          const rand = sp.randomValues[i] ?? 0;
          apply1DLayer(layer, fixturePhase, rand, fixture, output);
        }
      }
    }

    cachedValues = output;
  },

  /** LTP merge of all active shape layers' current values. */
  getShapeValues(): Map<string, ChannelValues> {
    return cachedValues;
  },

  /** Reset all internal state (for testing). */
  reset(): void {
    phases.clear();
    cachedValues = new Map();
    lastTickMs = null;
  },
};
