import { useCallback, useMemo, useState } from 'react';
import type { ShapeLayer, ShapeWaveform, Shape2D, ShapeTarget } from '@dmx-console/shared';

// ── Attribute → shape configuration ─────────────────────────────────────────
//
// Shapes are applied from the Programmer, contextual to the active attribute
// tab. Each shape oscillates around the live (LTP / programmer) value of its
// target channel, so there is no user-facing "center".

export type ShapeAttribute = 'intensity' | 'position' | 'colour' | 'beam';

const WAVEFORMS: ShapeWaveform[] = ['sine', 'triangle', 'square', 'ramp', 'random'];
const SHAPES_2D: Shape2D[] = ['circle', 'figure8', 'lissajous'];
const COLOUR_TARGETS: ShapeTarget[] = ['red', 'green', 'blue', 'white', 'amber'];
const BEAM_TARGETS: ShapeTarget[] = ['zoom', 'focus'];

/** Does a shape layer belong to the given attribute tab? */
function matchesAttribute(shape: ShapeLayer, attribute: ShapeAttribute): boolean {
  switch (attribute) {
    case 'position':
      return shape.shape2d != null;
    case 'intensity':
      return shape.target === 'dimmer';
    case 'colour':
      return shape.target != null && COLOUR_TARGETS.includes(shape.target);
    case 'beam':
      return shape.target != null && BEAM_TARGETS.includes(shape.target);
  }
}

// ── Live slider ──────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-console-dim w-28">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-console-text">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="w-full"
        style={{ accentColor: 'var(--color-console-active, #3b82f6)' }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

// ── Shape section ──────────────────────────────────────────────────────────────

export function ShapeSection({
  attribute,
  selectedIds,
  shapes,
  refreshShapes,
}: {
  attribute: ShapeAttribute;
  selectedIds: string[];
  shapes: ShapeLayer[];
  refreshShapes: () => void;
}) {
  const is2D = attribute === 'position';
  const [waveform, setWaveform] = useState<ShapeWaveform>('sine');
  const [shape2d, setShape2d] = useState<Shape2D>('circle');
  const [target, setTarget] = useState<ShapeTarget>(
    attribute === 'colour' ? 'red' : attribute === 'beam' ? 'zoom' : 'dimmer',
  );

  // Existing shapes for this attribute that touch the current selection.
  const mine = useMemo(
    () =>
      shapes.filter(
        (s) =>
          matchesAttribute(s, attribute) && s.fixtureIds.some((id) => selectedIds.includes(id)),
      ),
    [shapes, attribute, selectedIds],
  );

  // A shape identical to the one being built already exists on the selection
  // (same 2D shape, or same waveform+target for 1D) — don't allow duplicates.
  const isDuplicate = useMemo(
    () =>
      mine.some((s) =>
        is2D ? s.shape2d === shape2d : s.waveform === waveform && s.target === target,
      ),
    [mine, is2D, shape2d, waveform, target],
  );

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await fetch(`/api/shapes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      refreshShapes();
    },
    [refreshShapes],
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/shapes/${id}`, { method: 'DELETE' });
      refreshShapes();
    },
    [refreshShapes],
  );

  const apply = useCallback(async () => {
    if (selectedIds.length === 0 || isDuplicate) return;
    const base: Record<string, unknown> = {
      label: is2D ? `${shape2d}` : `${waveform} → ${target}`,
      fixtureIds: selectedIds,
      active: true,
      speed: 1,
      size: 64,
    };
    if (is2D) {
      base.shape2d = shape2d;
      base.xTarget = 'pan';
      base.yTarget = 'tilt';
    } else {
      base.waveform = waveform;
      base.target = target;
    }
    await fetch('/api/shapes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(base),
    });
    refreshShapes();
  }, [selectedIds, isDuplicate, is2D, shape2d, waveform, target, refreshShapes]);

  return (
    <div className="mt-4 border-t border-console-border pt-3">
      <div className="text-xs font-semibold text-console-text mb-2">Shape</div>

      {/* Builder row */}
      <div className="flex items-end gap-2 flex-wrap">
        {is2D ? (
          <div className="flex gap-1">
            {SHAPES_2D.map((s) => (
              <button
                key={s}
                className={[
                  'px-2 py-0.5 text-xs rounded border transition-colors capitalize',
                  shape2d === s
                    ? 'bg-console-active/20 border-console-active text-console-text'
                    : 'border-console-border text-console-dim hover:text-console-text',
                ].join(' ')}
                onClick={() => setShape2d(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex gap-1 flex-wrap">
              {WAVEFORMS.map((w) => (
                <button
                  key={w}
                  className={[
                    'px-2 py-0.5 text-xs rounded border transition-colors capitalize',
                    waveform === w
                      ? 'bg-console-active/20 border-console-active text-console-text'
                      : 'border-console-border text-console-dim hover:text-console-text',
                  ].join(' ')}
                  onClick={() => setWaveform(w)}
                >
                  {w}
                </button>
              ))}
            </div>
            {(attribute === 'colour' || attribute === 'beam') && (
              <select
                className="bg-console-bg border border-console-border rounded px-1.5 py-0.5 text-xs text-console-text capitalize"
                value={target}
                onChange={(e) => setTarget(e.target.value as ShapeTarget)}
              >
                {(attribute === 'colour' ? COLOUR_TARGETS : BEAM_TARGETS).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <button
          className="px-3 py-1 text-xs rounded bg-console-active text-white hover:bg-blue-600 disabled:opacity-40"
          onClick={() => void apply()}
          disabled={selectedIds.length === 0 || isDuplicate}
          title={
            isDuplicate
              ? 'That shape is already applied to this selection'
              : 'Apply shape to the selected fixtures'
          }
        >
          {isDuplicate ? 'Already applied' : '+ Apply to selection'}
        </button>
      </div>

      {/* Active shapes on this selection */}
      <div className="mt-3 flex flex-col gap-2">
        {mine.length === 0 ? (
          <p className="text-console-dim text-[11px]">
            No shape on the selection. Pick one above and Apply.
          </p>
        ) : (
          mine.map((s) => (
            <div
              key={s.id}
              className="bg-console-panel border border-console-border rounded p-2 flex items-center gap-3 flex-wrap"
            >
              <button
                className={[
                  'w-3 h-3 rounded-full border shrink-0 transition-colors',
                  s.active
                    ? 'bg-console-active border-console-active'
                    : 'bg-transparent border-console-border',
                ].join(' ')}
                title={s.active ? 'Active' : 'Inactive'}
                onClick={() => void patch(s.id, { active: !s.active })}
              />
              <span className="text-xs text-console-text w-28 truncate" title={s.label}>
                {s.label}
              </span>
              <Slider
                label="Size"
                value={s.size}
                min={0}
                max={255}
                onChange={(v) => void patch(s.id, { size: v })}
              />
              <Slider
                label="Speed"
                value={s.speed}
                min={0}
                max={20}
                step={0.1}
                suffix="Hz"
                onChange={(v) => void patch(s.id, { speed: v })}
              />
              <Slider
                label="Spread"
                value={s.spread}
                min={0}
                max={360}
                suffix="°"
                onChange={(v) => void patch(s.id, { spread: v })}
              />
              <Slider
                label="Phase"
                value={s.phaseOffset}
                min={0}
                max={360}
                suffix="°"
                onChange={(v) => void patch(s.id, { phaseOffset: v })}
              />
              <button
                className="ml-auto text-console-danger hover:text-red-400 px-1 text-xs"
                onClick={() => void remove(s.id)}
                title="Delete shape"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
