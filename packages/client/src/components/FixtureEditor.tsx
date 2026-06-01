import { useState } from 'react';
import type { FixtureDef, FixtureType, ChannelGroup } from '@dmx-console/shared';

const FIXTURE_TYPES: FixtureType[] = [
  'Dimmer',
  'Color Changer',
  'Moving Head',
  'Scanner',
  'LED Bar (Beams)',
  'LED Bar (Pixels)',
  'Strobe',
  'Effect',
  'Other',
];

const CHANNEL_GROUPS: ChannelGroup[] = [
  'Intensity',
  'Colour',
  'Pan',
  'Tilt',
  'Gobo',
  'Prism',
  'Shutter',
  'Beam',
  'Speed',
  'Effect',
  'Maintenance',
  'Nothing',
];

interface ChannelRow {
  name: string;
  group: ChannelGroup;
  colour: string;
}

interface ModeRow {
  name: string;
  description: string;
  channelNames: string[];
}

const inputCls =
  'bg-console-bg border border-console-border rounded px-2 py-1 text-sm text-console-text focus:outline-none focus:border-console-active';

function fromDef(initial: FixtureDef | null): {
  manufacturer: string;
  model: string;
  type: FixtureType;
  channels: ChannelRow[];
  modes: ModeRow[];
} {
  if (!initial) {
    return { manufacturer: '', model: '', type: 'Other', channels: [], modes: [] };
  }
  return {
    manufacturer: initial.manufacturer,
    model: initial.model,
    type: initial.type,
    channels: Object.values(initial.channels).map((c) => ({
      name: c.name,
      group: c.group,
      colour: c.colour ?? '',
    })),
    modes: initial.modes.map((m) => ({
      name: m.name,
      description: m.description ?? '',
      channelNames: [...m.channelNames],
    })),
  };
}

export function FixtureEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: FixtureDef | null;
  onCancel: () => void;
  onSaved: (def: FixtureDef) => void;
}) {
  const start = fromDef(initial);
  const [manufacturer, setManufacturer] = useState(start.manufacturer);
  const [model, setModel] = useState(start.model);
  const [type, setType] = useState<FixtureType>(start.type);
  const [channels, setChannels] = useState<ChannelRow[]>(start.channels);
  const [modes, setModes] = useState<ModeRow[]>(start.modes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = initial !== null;
  const channelNamesDefined = channels.map((c) => c.name.trim()).filter(Boolean);

  // ── Channel ops ──────────────────────────────────────────────────────────
  const addChannel = () =>
    setChannels((cs) => [
      ...cs,
      { name: `Channel ${cs.length + 1}`, group: 'Intensity', colour: '' },
    ]);
  const updateChannel = (i: number, patch: Partial<ChannelRow>) =>
    setChannels((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeChannel = (i: number) => {
    const name = channels[i]?.name;
    setChannels((cs) => cs.filter((_, idx) => idx !== i));
    // Drop the removed channel from any mode that referenced it.
    if (name) {
      setModes((ms) =>
        ms.map((m) => ({ ...m, channelNames: m.channelNames.filter((n) => n !== name) })),
      );
    }
  };

  // ── Mode ops ─────────────────────────────────────────────────────────────
  const addMode = () =>
    setModes((ms) => [
      ...ms,
      {
        name: `${channelNamesDefined.length} Channel`,
        description: '',
        channelNames: [...channelNamesDefined],
      },
    ]);
  const updateMode = (i: number, patch: Partial<ModeRow>) =>
    setModes((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMode = (i: number) => setModes((ms) => ms.filter((_, idx) => idx !== i));
  const moveModeChannel = (mi: number, ci: number, dir: -1 | 1) =>
    setModes((ms) =>
      ms.map((m, idx) => {
        if (idx !== mi) return m;
        const next = [...m.channelNames];
        const j = ci + dir;
        if (j < 0 || j >= next.length) return m;
        [next[ci], next[j]] = [next[j]!, next[ci]!];
        return { ...m, channelNames: next };
      }),
    );
  const removeModeChannel = (mi: number, ci: number) =>
    setModes((ms) =>
      ms.map((m, idx) =>
        idx === mi ? { ...m, channelNames: m.channelNames.filter((_, k) => k !== ci) } : m,
      ),
    );
  const addModeChannel = (mi: number, name: string) =>
    setModes((ms) =>
      ms.map((m, idx) => (idx === mi ? { ...m, channelNames: [...m.channelNames, name] } : m)),
    );

  // ── Save ─────────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!manufacturer.trim() || !model.trim()) return 'Manufacturer and model are required.';
    if (channelNamesDefined.length === 0) return 'Add at least one channel.';
    if (new Set(channelNamesDefined).size !== channelNamesDefined.length)
      return 'Channel names must be unique.';
    if (modes.length === 0) return 'Add at least one mode.';
    for (const m of modes) {
      if (!m.name.trim()) return 'Every mode needs a name.';
      if (m.channelNames.length === 0) return `Mode "${m.name}" has no channels.`;
    }
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);

    const channelRecord: FixtureDef['channels'] = {};
    for (const c of channels) {
      const name = c.name.trim();
      if (!name) continue;
      channelRecord[name] = {
        name,
        group: c.group,
        ...(c.colour.trim() && { colour: c.colour.trim() }),
      };
    }

    const payload: FixtureDef = {
      ...(initial?.id && { id: initial.id }),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      type,
      channels: channelRecord,
      modes: modes.map((m) => ({
        name: m.name.trim(),
        channelNames: m.channelNames,
        ...(m.description.trim() && { description: m.description.trim() }),
      })),
      source: 'user',
    } as FixtureDef;

    void fetch('/api/fixtures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const json = (await r.json()) as { fixture?: FixtureDef; error?: string };
        if (!r.ok) throw new Error(json.error ?? `Save failed (${r.status})`);
        if (json.fixture) onSaved(json.fixture);
      })
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-console-text">
          {isEdit ? `Edit ${initial.model}` : 'New fixture profile'}
        </h2>
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 text-sm rounded border border-console-border text-console-dim hover:text-console-text"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-console-success text-white disabled:opacity-40"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-console-danger border border-console-danger/40 rounded p-2">
          {error}
        </div>
      )}

      {/* Identity */}
      <div className="console-panel p-3 grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs text-console-accent font-semibold">
          Manufacturer
          <input
            className={inputCls}
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-console-accent font-semibold">
          Model
          <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-console-accent font-semibold">
          Type
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as FixtureType)}
          >
            {FIXTURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Channels */}
      <div className="console-panel p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-console-accent text-xs font-semibold">
            Channels ({channels.length})
          </div>
          <button className="text-xs text-console-active hover:underline" onClick={addChannel}>
            + Add channel
          </button>
        </div>
        <div className="space-y-1">
          {channels.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={`${inputCls} flex-1`}
                placeholder="Channel name"
                value={c.name}
                onChange={(e) => updateChannel(i, { name: e.target.value })}
              />
              <select
                className={inputCls}
                value={c.group}
                onChange={(e) => updateChannel(i, { group: e.target.value as ChannelGroup })}
              >
                {CHANNEL_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                className={`${inputCls} w-24`}
                placeholder="Colour"
                value={c.colour}
                onChange={(e) => updateChannel(i, { colour: e.target.value })}
              />
              <button
                className="text-console-dim hover:text-console-danger px-1"
                title="Remove channel"
                onClick={() => removeChannel(i)}
              >
                ✕
              </button>
            </div>
          ))}
          {channels.length === 0 && (
            <div className="text-xs text-console-dim">
              No channels yet — add some, then build modes from them.
            </div>
          )}
        </div>
      </div>

      {/* Modes */}
      <div className="console-panel p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-console-accent text-xs font-semibold">Modes ({modes.length})</div>
          <button
            className="text-xs text-console-active hover:underline disabled:opacity-40"
            onClick={addMode}
            disabled={channelNamesDefined.length === 0}
            title={channelNamesDefined.length === 0 ? 'Define channels first' : 'Add a mode'}
          >
            + Add mode
          </button>
        </div>

        <div className="space-y-3">
          {modes.map((m, mi) => {
            const available = channelNamesDefined.filter((n) => !m.channelNames.includes(n));
            return (
              <div key={mi} className="border border-console-border rounded p-2 space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="Mode name (e.g. 8 Channel)"
                    value={m.name}
                    onChange={(e) => updateMode(mi, { name: e.target.value })}
                  />
                  <button
                    className="text-console-dim hover:text-console-danger px-1"
                    title="Remove mode"
                    onClick={() => removeMode(mi)}
                  >
                    ✕
                  </button>
                </div>

                {/* Ordered channel list */}
                <div className="space-y-1">
                  {m.channelNames.map((name, ci) => (
                    <div key={ci} className="flex items-center gap-2 text-xs">
                      <span className="text-console-accent w-6 text-right">{ci + 1}</span>
                      <span className="flex-1 text-console-text">{name}</span>
                      <button
                        className="text-console-dim hover:text-console-text disabled:opacity-30"
                        onClick={() => moveModeChannel(mi, ci, -1)}
                        disabled={ci === 0}
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        className="text-console-dim hover:text-console-text disabled:opacity-30"
                        onClick={() => moveModeChannel(mi, ci, 1)}
                        disabled={ci === m.channelNames.length - 1}
                        title="Move down"
                      >
                        ▼
                      </button>
                      <button
                        className="text-console-dim hover:text-console-danger"
                        onClick={() => removeModeChannel(mi, ci)}
                        title="Remove from mode"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {available.length > 0 && (
                    <select
                      className={`${inputCls} w-full mt-1`}
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addModeChannel(mi, e.target.value);
                      }}
                    >
                      <option value="">+ Add channel to this mode…</option>
                      {available.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <textarea
                  className={`${inputCls} w-full font-mono text-[11px]`}
                  rows={2}
                  placeholder="Description / original mapping (optional)"
                  value={m.description}
                  onChange={(e) => updateMode(mi, { description: e.target.value })}
                />
              </div>
            );
          })}
          {modes.length === 0 && <div className="text-xs text-console-dim">No modes yet.</div>}
        </div>
      </div>
    </div>
  );
}
