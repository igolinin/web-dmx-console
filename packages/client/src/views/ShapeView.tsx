import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  ShapeLayer,
  ShapeWaveform,
  Shape2D,
  ShapeTarget,
  PixelTexture,
} from '@dmx-console/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatchedFixtureInfo {
  id: string;
  label: string;
  type: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WAVEFORMS: ShapeWaveform[] = ['sine', 'cosine', 'triangle', 'square', 'ramp', 'random'];
const SHAPES_2D: Shape2D[] = ['circle', 'figure8', 'lissajous'];
const TARGETS: ShapeTarget[] = [
  'pan',
  'tilt',
  'dimmer',
  'red',
  'green',
  'blue',
  'white',
  'amber',
  'zoom',
  'focus',
];
const PIXEL_TEXTURES: PixelTexture[] = ['rainbow', 'gradient', 'chase', 'fire'];

type LayerMode = 'waveform' | 'shape2d' | 'pixel';

// ── Waveform preview SVG ──────────────────────────────────────────────────────

function evalPreviewWaveform(waveform: ShapeWaveform, phaseDeg: number): number {
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
      return Math.sin(r * 3.7); // representative wave for preview
  }
}

function WaveformPreview({ layer }: { layer: ShapeLayer }) {
  const W = 240;
  const H = 48;

  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= W; i++) {
      const phase = (i / W) * 360;
      let norm: number;
      if (layer.shape2d) {
        // For 2D, preview x (pan) component
        const r = (phase * Math.PI) / 180;
        norm = layer.shape2d === 'figure8' ? Math.sin(2 * r) : Math.cos(r);
      } else if (layer.waveform) {
        norm = evalPreviewWaveform(layer.waveform, phase);
      } else {
        norm = 0;
      }
      const y = H / 2 - norm * (H / 2 - 4);
      pts.push(`${i === 0 ? 'M' : 'L'}${i},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [layer.waveform, layer.shape2d]);

  if (layer.pixelTexture) {
    // Pixel texture preview: row of coloured blocks
    const pixelCount = 8;
    const blockW = W / pixelCount;
    const blocks = Array.from({ length: pixelCount }, (_, i) => {
      const pos = i / (pixelCount - 1);
      switch (layer.pixelTexture) {
        case 'rainbow': {
          const h = pos * 300;
          return `hsl(${h}, 100%, 50%)`;
        }
        case 'gradient': {
          const r = Math.round(pos * 255);
          const b = Math.round((1 - pos) * 255);
          return `rgb(${r},0,${b})`;
        }
        case 'chase': {
          const bright = i === Math.floor(pixelCount / 2) ? 255 : 30;
          return `rgb(${bright},${Math.round(bright * 0.3)},0)`;
        }
        case 'fire': {
          const brightness = Math.max(0, 1 - pos);
          return `rgb(${Math.round(255 * brightness)},${Math.round(60 * brightness * (1 - pos))},0)`;
        }
        default:
          return '#444';
      }
    });
    return (
      <svg width={W} height={H} className="w-full">
        {blocks.map((color, i) => (
          <rect
            key={i}
            x={i * blockW}
            y={4}
            width={blockW - 1}
            height={H - 8}
            fill={color}
            rx={2}
          />
        ))}
      </svg>
    );
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#333" strokeWidth={1} />
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
    </svg>
  );
}

// ── Knob / number input ────────────────────────────────────────────────────────

function NumInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-console-dim">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="w-20 bg-console-bg border border-console-border rounded px-2 py-0.5 text-console-text"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
      />
    </label>
  );
}

// ── Fixture multi-select ───────────────────────────────────────────────────────

function FixtureSelector({
  allFixtures,
  selected,
  onChange,
}: {
  allFixtures: PatchedFixtureInfo[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="flex flex-wrap gap-1">
      {allFixtures.map((f) => (
        <button
          key={f.id}
          className={[
            'px-2 py-0.5 text-xs rounded border transition-colors',
            selected.includes(f.id)
              ? 'bg-console-active/20 border-console-active text-console-text'
              : 'border-console-border text-console-dim hover:text-console-text',
          ].join(' ')}
          onClick={() => toggle(f.id)}
          title={f.type}
        >
          {f.label}
        </button>
      ))}
      {allFixtures.length === 0 && (
        <span className="text-console-dim text-xs">No fixtures patched.</span>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function ShapeView() {
  const [shapes, setShapes] = useState<ShapeLayer[]>([]);
  const [fixtures, setFixtures] = useState<PatchedFixtureInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [layerMode, setLayerMode] = useState<LayerMode>('waveform');

  const refresh = useCallback(() => {
    void fetch('/api/shapes')
      .then((r) => r.json() as Promise<ShapeLayer[]>)
      .then(setShapes);
    void fetch('/api/patch')
      .then((r) => r.json() as Promise<{ id: string; label: string; type: string }[]>)
      .then(setFixtures);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [refresh]);

  const selected = shapes.find((s) => s.id === selectedId) ?? null;

  // Sync layerMode when selection changes
  useEffect(() => {
    if (!selected) return;
    if (selected.pixelTexture) setLayerMode('pixel');
    else if (selected.shape2d) setLayerMode('shape2d');
    else setLayerMode('waveform');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useCallback(async () => {
    if (!newLabel.trim()) return;
    await fetch('/api/shapes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    setNewLabel('');
    refresh();
  }, [newLabel, refresh]);

  const deleteShape = useCallback(
    async (id: string) => {
      await fetch(`/api/shapes/${id}`, { method: 'DELETE' });
      if (selectedId === id) setSelectedId(null);
      refresh();
    },
    [selectedId, refresh],
  );

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await fetch(`/api/shapes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      refresh();
    },
    [refresh],
  );

  // When switching layer mode, clear conflicting fields
  const switchMode = useCallback(
    (mode: LayerMode) => {
      setLayerMode(mode);
      if (!selected) return;
      if (mode === 'waveform') {
        void patch(selected.id, { shape2d: undefined, pixelTexture: undefined });
      } else if (mode === 'shape2d') {
        void patch(selected.id, {
          waveform: undefined,
          target: undefined,
          pixelTexture: undefined,
        });
      } else {
        void patch(selected.id, { waveform: undefined, target: undefined, shape2d: undefined });
      }
    },
    [selected, patch],
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: shape list */}
      <div className="w-56 border-r border-console-border flex flex-col shrink-0">
        <div className="p-3 border-b border-console-border">
          <div className="text-xs font-semibold text-console-text mb-2">Shapes</div>
          <div className="flex gap-1">
            <input
              className="flex-1 bg-console-bg border border-console-border rounded px-2 py-1 text-xs text-console-text placeholder-console-dim focus:outline-none focus:border-console-active"
              placeholder="Shape name…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
            <button
              className="px-2 py-1 text-xs rounded bg-console-active text-white hover:bg-blue-600 disabled:opacity-50"
              onClick={() => void create()}
              disabled={!newLabel.trim()}
            >
              +
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {shapes.map((sh) => (
            <div key={sh.id} className="flex items-center group">
              {/* Active toggle */}
              <button
                className={[
                  'ml-2 w-3 h-3 rounded-full border shrink-0 transition-colors',
                  sh.active
                    ? 'bg-console-active border-console-active'
                    : 'bg-transparent border-console-border',
                ].join(' ')}
                title={sh.active ? 'Active (click to deactivate)' : 'Inactive (click to activate)'}
                onClick={() => void patch(sh.id, { active: !sh.active })}
              />
              <button
                className={[
                  'flex-1 text-left px-2 py-2 border-b border-console-border text-xs transition-colors',
                  selectedId === sh.id
                    ? 'bg-console-active/20 text-console-text'
                    : 'text-console-dim hover:bg-console-muted hover:text-console-text',
                ].join(' ')}
                onClick={() => setSelectedId(sh.id)}
              >
                <div className="font-medium">{sh.label}</div>
                <div className="text-[10px] text-console-dim">
                  {sh.pixelTexture
                    ? `pixel: ${sh.pixelTexture}`
                    : sh.shape2d
                      ? `2D: ${sh.shape2d}`
                      : sh.waveform
                        ? `${sh.waveform} → ${sh.target ?? '?'}`
                        : 'unset'}
                  {' · '}
                  {sh.speed}Hz
                </div>
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 px-2 text-console-danger hover:text-red-400 text-xs"
                onClick={() => void deleteShape(sh.id)}
              >
                ✕
              </button>
            </div>
          ))}
          {shapes.length === 0 && (
            <p className="text-console-dim text-xs p-3">No shapes. Create one above.</p>
          )}
        </div>
      </div>

      {/* Right: editor */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
          {/* Label + active */}
          <div className="flex items-center gap-3">
            <input
              className="flex-1 bg-console-bg border border-console-border rounded px-2 py-1 text-sm text-console-text"
              value={selected.label}
              onChange={(e) => void patch(selected.id, { label: e.target.value })}
            />
            <button
              className={[
                'px-3 py-1 text-xs rounded border transition-colors',
                selected.active
                  ? 'bg-console-active/20 border-console-active text-console-active'
                  : 'border-console-border text-console-dim hover:text-console-text',
              ].join(' ')}
              onClick={() => void patch(selected.id, { active: !selected.active })}
            >
              {selected.active ? 'Active' : 'Inactive'}
            </button>
          </div>

          {/* Waveform preview */}
          <div className="bg-console-panel rounded p-2 border border-console-border">
            <div className="text-[10px] text-console-dim mb-1">Preview</div>
            <WaveformPreview layer={selected} />
          </div>

          {/* Layer mode tabs */}
          <div>
            <div className="text-xs font-semibold text-console-text mb-2">Layer Type</div>
            <div className="flex gap-1">
              {(['waveform', 'shape2d', 'pixel'] as LayerMode[]).map((m) => (
                <button
                  key={m}
                  className={[
                    'px-3 py-1 text-xs rounded border transition-colors',
                    layerMode === m
                      ? 'bg-console-active/20 border-console-active text-console-text'
                      : 'border-console-border text-console-dim hover:text-console-text',
                  ].join(' ')}
                  onClick={() => switchMode(m)}
                >
                  {m === 'waveform' ? '1D Waveform' : m === 'shape2d' ? '2D Shape' : 'Pixel Map'}
                </button>
              ))}
            </div>
          </div>

          {/* Mode-specific controls */}
          {layerMode === 'waveform' && (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-console-dim mb-1">Waveform</div>
                <div className="flex flex-wrap gap-1">
                  {WAVEFORMS.map((w) => (
                    <button
                      key={w}
                      className={[
                        'px-2 py-0.5 text-xs rounded border transition-colors capitalize',
                        selected.waveform === w
                          ? 'bg-console-active/20 border-console-active text-console-text'
                          : 'border-console-border text-console-dim hover:text-console-text',
                      ].join(' ')}
                      onClick={() => void patch(selected.id, { waveform: w })}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-console-dim mb-1">Target Channel</div>
                <div className="flex flex-wrap gap-1">
                  {TARGETS.map((t) => (
                    <button
                      key={t}
                      className={[
                        'px-2 py-0.5 text-xs rounded border transition-colors capitalize',
                        selected.target === t
                          ? 'bg-console-active/20 border-console-active text-console-text'
                          : 'border-console-border text-console-dim hover:text-console-text',
                      ].join(' ')}
                      onClick={() => void patch(selected.id, { target: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {layerMode === 'shape2d' && (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-console-dim mb-1">Shape</div>
                <div className="flex gap-1">
                  {SHAPES_2D.map((s) => (
                    <button
                      key={s}
                      className={[
                        'px-2 py-0.5 text-xs rounded border transition-colors capitalize',
                        selected.shape2d === s
                          ? 'bg-console-active/20 border-console-active text-console-text'
                          : 'border-console-border text-console-dim hover:text-console-text',
                      ].join(' ')}
                      onClick={() => void patch(selected.id, { shape2d: s })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div>
                  <div className="text-xs text-console-dim mb-1">X Target</div>
                  <select
                    className="bg-console-bg border border-console-border rounded px-2 py-0.5 text-xs text-console-text"
                    value={selected.xTarget ?? 'pan'}
                    onChange={(e) =>
                      void patch(selected.id, { xTarget: e.target.value as ShapeTarget })
                    }
                  >
                    {TARGETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-console-dim mb-1">Y Target</div>
                  <select
                    className="bg-console-bg border border-console-border rounded px-2 py-0.5 text-xs text-console-text"
                    value={selected.yTarget ?? 'tilt'}
                    onChange={(e) =>
                      void patch(selected.id, { yTarget: e.target.value as ShapeTarget })
                    }
                  >
                    {TARGETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {selected.shape2d === 'lissajous' && (
                  <div className="flex gap-2 items-end">
                    <NumInput
                      label="Ratio A"
                      value={selected.lissajousRatio?.[0] ?? 2}
                      min={1}
                      max={10}
                      onChange={(v) =>
                        void patch(selected.id, {
                          lissajousRatio: [v, selected.lissajousRatio?.[1] ?? 1],
                        })
                      }
                    />
                    <NumInput
                      label="Ratio B"
                      value={selected.lissajousRatio?.[1] ?? 1}
                      min={1}
                      max={10}
                      onChange={(v) =>
                        void patch(selected.id, {
                          lissajousRatio: [selected.lissajousRatio?.[0] ?? 2, v],
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {layerMode === 'pixel' && (
            <div>
              <div className="text-xs text-console-dim mb-1">Pixel Texture</div>
              <div className="flex gap-1">
                {PIXEL_TEXTURES.map((t) => (
                  <button
                    key={t}
                    className={[
                      'px-2 py-0.5 text-xs rounded border transition-colors capitalize',
                      selected.pixelTexture === t
                        ? 'bg-console-active/20 border-console-active text-console-text'
                        : 'border-console-border text-console-dim hover:text-console-text',
                    ].join(' ')}
                    onClick={() => void patch(selected.id, { pixelTexture: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Common parameters */}
          <div>
            <div className="text-xs font-semibold text-console-text mb-2">Parameters</div>
            <div className="flex flex-wrap gap-4">
              <NumInput
                label="Speed (Hz)"
                value={selected.speed}
                min={0}
                max={100}
                step={0.1}
                onChange={(v) => void patch(selected.id, { speed: v })}
              />
              <NumInput
                label="Size (0–255)"
                value={selected.size}
                min={0}
                max={255}
                onChange={(v) => void patch(selected.id, { size: v })}
              />
              <NumInput
                label="Center (0–255)"
                value={selected.center}
                min={0}
                max={255}
                onChange={(v) => void patch(selected.id, { center: v })}
              />
              <NumInput
                label="Spread (°)"
                value={selected.spread}
                min={0}
                max={360}
                onChange={(v) => void patch(selected.id, { spread: v })}
              />
              <NumInput
                label="Phase Offset (°)"
                value={selected.phaseOffset}
                min={0}
                max={360}
                onChange={(v) => void patch(selected.id, { phaseOffset: v })}
              />
            </div>
          </div>

          {/* Fixture assignment */}
          <div>
            <div className="text-xs font-semibold text-console-text mb-2">
              Fixtures ({selected.fixtureIds.length} selected)
            </div>
            <FixtureSelector
              allFixtures={fixtures}
              selected={selected.fixtureIds}
              onChange={(ids) => void patch(selected.id, { fixtureIds: ids })}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-console-dim text-sm">Select a shape layer to edit.</p>
        </div>
      )}
    </div>
  );
}
