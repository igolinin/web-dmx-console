import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  CueList,
  Chase,
  PlaybackMaster,
  FixtureGroup,
  PatchedFixture,
  FixtureDef,
} from '@dmx-console/shared';
import { useShowStore } from '../store/useShow.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface CueListWithPlayback extends CueList {
  playback: { activeCueIndex: number; fading: boolean; paused: boolean };
}
interface ChaseWithStatus extends Chase {
  running: boolean;
  currentStepIndex: number;
}

// ── Color presets ───────────────────────────────────────────────────────────

const COLOR_PRESETS: { label: string; color: string; r: number; g: number; b: number }[] = [
  { label: 'Red', color: '#ff0000', r: 255, g: 0, b: 0 },
  { label: 'Green', color: '#00cc00', r: 0, g: 204, b: 0 },
  { label: 'Blue', color: '#0044ff', r: 0, g: 68, b: 255 },
  { label: 'White', color: '#ffffff', r: 255, g: 255, b: 255 },
  { label: 'Warm W', color: '#ffb44a', r: 255, g: 180, b: 74 },
  { label: 'Cyan', color: '#00ffff', r: 0, g: 255, b: 255 },
  { label: 'Magenta', color: '#ff00ff', r: 255, g: 0, b: 255 },
  { label: 'Yellow', color: '#ffff00', r: 255, g: 255, b: 0 },
  { label: 'Amber', color: '#ff7700', r: 255, g: 119, b: 0 },
  { label: 'UV', color: '#6600cc', r: 102, g: 0, b: 204 },
  { label: 'Off', color: '#111111', r: 0, g: 0, b: 0 },
];

const INTENSITY_PRESETS = [
  { label: '0%', value: 0 },
  { label: '25%', value: 64 },
  { label: '50%', value: 128 },
  { label: '75%', value: 191 },
  { label: 'Full', value: 255 },
];

// ── Vertical fader strip ───────────────────────────────────────────────────

function FaderStrip({
  master,
  cueLists,
  chases,
  onChange,
}: {
  master: PlaybackMaster;
  cueLists: CueListWithPlayback[];
  chases: ChaseWithStatus[];
  onChange: (updated: Partial<PlaybackMaster>) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(master.label);
  const assignedCueList =
    master.assignedType === 'cueList' ? cueLists.find((cl) => cl.id === master.assignedId) : null;
  const assignedChase =
    master.assignedType === 'chase' ? chases.find((ch) => ch.id === master.assignedId) : null;

  const isRunning =
    (assignedCueList?.playback.activeCueIndex ?? -1) >= 0 || assignedChase?.running === true;

  const handleGo = useCallback(async () => {
    if (!master.assignedId) return;
    if (master.assignedType === 'cueList') {
      await fetch(`/api/cueLists/${master.assignedId}/go`, { method: 'POST' });
    } else if (master.assignedType === 'chase') {
      const ch = chases.find((c) => c.id === master.assignedId);
      const action = ch?.running ? 'stop' : 'play';
      await fetch(`/api/chases/${master.assignedId}/${action}`, { method: 'POST' });
    }
  }, [master.assignedId, master.assignedType, chases]);

  const handleRelease = useCallback(async () => {
    if (!master.assignedId) return;
    if (master.assignedType === 'cueList') {
      await fetch(`/api/cueLists/${master.assignedId}/release`, { method: 'POST' });
    } else if (master.assignedType === 'chase') {
      await fetch(`/api/chases/${master.assignedId}/stop`, { method: 'POST' });
    }
  }, [master.assignedId, master.assignedType]);

  return (
    <div
      className={[
        'flex flex-col items-center w-20 shrink-0 bg-console-panel border rounded',
        isRunning ? 'border-console-active' : 'border-console-border',
      ].join(' ')}
    >
      {/* Label */}
      <div className="w-full px-1 pt-1.5 pb-0.5 text-center border-b border-console-border">
        {editingLabel ? (
          <input
            autoFocus
            className="w-full bg-console-bg text-center text-xs text-console-text border border-console-active rounded px-1 py-0.5 outline-none"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => {
              onChange({ label: labelDraft });
              setEditingLabel(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                onChange({ label: labelDraft });
                setEditingLabel(false);
              }
            }}
          />
        ) : (
          <button
            className="text-xs text-console-text font-semibold w-full truncate"
            onClick={() => {
              setLabelDraft(master.label);
              setEditingLabel(true);
            }}
          >
            {master.label}
          </button>
        )}
      </div>

      {/* Assignment */}
      <div className="w-full px-1 py-1 border-b border-console-border relative">
        {assigning ? (
          <select
            autoFocus
            className="w-full bg-console-bg border border-console-active rounded text-[10px] text-console-text px-1 py-0.5 outline-none"
            defaultValue=""
            onBlur={() => setAssigning(false)}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onChange({ assignedId: null, assignedType: null });
              } else if (val.startsWith('cl:')) {
                onChange({ assignedId: val.slice(3), assignedType: 'cueList' });
              } else if (val.startsWith('ch:')) {
                onChange({ assignedId: val.slice(3), assignedType: 'chase' });
              }
              setAssigning(false);
            }}
          >
            <option value="">— None —</option>
            {cueLists.length > 0 && (
              <optgroup label="Cue Lists">
                {cueLists.map((cl) => (
                  <option key={cl.id} value={`cl:${cl.id}`}>
                    {cl.label}
                  </option>
                ))}
              </optgroup>
            )}
            {chases.length > 0 && (
              <optgroup label="Chases">
                {chases.map((ch) => (
                  <option key={ch.id} value={`ch:${ch.id}`}>
                    {ch.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        ) : (
          <button
            className="w-full text-[10px] text-console-dim hover:text-console-text truncate text-center"
            onClick={() => setAssigning(true)}
          >
            {assignedCueList?.label ?? assignedChase?.label ?? '— assign —'}
          </button>
        )}
      </div>

      {/* Vertical fader */}
      <div className="flex flex-col items-center flex-1 py-2 gap-1">
        <div className="relative" style={{ width: 28, height: 100 }}>
          <input
            type="range"
            min={0}
            max={100}
            value={master.level}
            className="absolute"
            style={{
              width: 100,
              height: 28,
              transform: 'rotate(-90deg) translateX(-100px)',
              transformOrigin: 'top left',
              accentColor: 'var(--color-console-active, #3b82f6)',
              cursor: 'pointer',
            }}
            onChange={(e) => onChange({ level: parseInt(e.target.value, 10) })}
          />
        </div>
        <span className="text-[10px] text-console-dim tabular-nums">{master.level}%</span>
      </div>

      {/* GO / Release buttons */}
      <div className="w-full p-1 flex flex-col gap-1 border-t border-console-border">
        <button
          className={[
            'w-full py-1.5 text-xs font-bold rounded transition-colors',
            master.assignedId
              ? isRunning && master.assignedType === 'chase'
                ? 'bg-console-danger/80 text-white hover:bg-red-600'
                : 'bg-console-active text-white hover:bg-blue-600'
              : 'bg-console-muted text-console-dim cursor-not-allowed',
          ].join(' ')}
          onClick={() => void handleGo()}
          disabled={!master.assignedId}
        >
          {isRunning && master.assignedType === 'chase' ? '⏹' : 'GO'}
        </button>
        {master.assignedId && isRunning && master.assignedType !== 'chase' && (
          <button
            className="w-full py-1 text-[10px] rounded bg-console-danger/20 border border-console-danger/30 text-console-danger hover:bg-console-danger/40"
            onClick={() => void handleRelease()}
          >
            Rel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Group presets panel ─────────────────────────────────────────────────────

function GroupPresetsPanel({
  group,
  fixtures,
  defMap,
}: {
  group: FixtureGroup;
  fixtures: PatchedFixture[];
  defMap: Record<string, FixtureDef>;
}) {
  const groupFixtures = fixtures.filter((f) => group.fixtureIds.includes(f.id));
  const hasMovers = groupFixtures.some((f) => {
    const def = defMap[f.defId];
    return def && Object.values(def.channels).some((ch) => ch.group === 'Pan');
  });

  const applyColour = useCallback(
    async (r: number, g: number, b: number) => {
      const body = groupFixtures
        .map((f) => {
          const def = defMap[f.defId];
          if (!def) return null;
          const getColourCh = (colour: string) =>
            Object.values(def.channels).find((ch) => ch.colour === colour);
          const rCh = getColourCh('Red');
          const gCh = getColourCh('Green');
          const bCh = getColourCh('Blue');
          const channels: Record<string, number> = {};
          if (rCh) channels[rCh.name] = r;
          if (gCh) channels[gCh.name] = g;
          if (bCh) channels[bCh.name] = b;
          return Object.keys(channels).length > 0 ? { fixtureId: f.id, channels } : null;
        })
        .filter(Boolean);

      if (body.length === 0) return;
      await fetch('/api/programmer/setMany', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    [groupFixtures, defMap],
  );

  const applyIntensity = useCallback(
    async (value: number) => {
      const body = groupFixtures
        .map((f) => {
          const def = defMap[f.defId];
          if (!def) return null;
          const channels: Record<string, number> = {};
          for (const ch of Object.values(def.channels)) {
            if (ch.group === 'Intensity') channels[ch.name] = value;
          }
          return Object.keys(channels).length > 0 ? { fixtureId: f.id, channels } : null;
        })
        .filter(Boolean);

      if (body.length === 0) return;
      await fetch('/api/programmer/setMany', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    [groupFixtures, defMap],
  );

  const applyPosition = useCallback(
    async (pan: number, tilt: number) => {
      const body = groupFixtures
        .map((f) => {
          const def = defMap[f.defId];
          if (!def) return null;
          const panCh = Object.values(def.channels).find(
            (ch) => ch.group === 'Pan' && ch.byte !== 1,
          );
          const tiltCh = Object.values(def.channels).find(
            (ch) => ch.group === 'Tilt' && ch.byte !== 1,
          );
          const channels: Record<string, number> = {};
          if (panCh) channels[panCh.name] = pan;
          if (tiltCh) channels[tiltCh.name] = tilt;
          return Object.keys(channels).length > 0 ? { fixtureId: f.id, channels } : null;
        })
        .filter(Boolean);

      if (body.length === 0) return;
      await fetch('/api/programmer/setMany', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    [groupFixtures, defMap],
  );

  if (groupFixtures.length === 0) {
    return (
      <p className="text-console-dim text-xs p-2">
        No fixtures in this group. Add fixtures in the Patch tab.
      </p>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="text-xs text-console-dim">
        {groupFixtures.length} fixture{groupFixtures.length !== 1 ? 's' : ''}
      </div>

      {/* Colour presets */}
      <div>
        <div className="text-[10px] text-console-dim uppercase tracking-wider mb-1.5">Colour</div>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PRESETS.map((p) => (
            <button
              key={p.label}
              title={p.label}
              className="w-7 h-7 rounded border border-console-border hover:scale-110 transition-transform active:scale-95"
              style={{ backgroundColor: p.color }}
              onClick={() => void applyColour(p.r, p.g, p.b)}
            />
          ))}
        </div>
      </div>

      {/* Intensity presets */}
      <div>
        <div className="text-[10px] text-console-dim uppercase tracking-wider mb-1.5">
          Intensity
        </div>
        <div className="flex gap-1.5">
          {INTENSITY_PRESETS.map((p) => (
            <button
              key={p.label}
              className="px-2.5 py-1 text-xs rounded border border-console-border text-console-dim hover:text-console-text hover:border-console-active transition-colors"
              onClick={() => void applyIntensity(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Position presets — only for groups with moving fixtures */}
      {hasMovers && (
        <div>
          <div className="text-[10px] text-console-dim uppercase tracking-wider mb-1.5">
            Position
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Center', pan: 128, tilt: 128 },
              { label: 'Left', pan: 64, tilt: 128 },
              { label: 'Right', pan: 192, tilt: 128 },
              { label: 'Up', pan: 128, tilt: 64 },
              { label: 'Down', pan: 128, tilt: 192 },
              { label: 'Far L', pan: 0, tilt: 128 },
              { label: 'Far R', pan: 255, tilt: 128 },
            ].map((pos) => (
              <button
                key={pos.label}
                className="px-2 py-1 text-xs rounded border border-console-border text-console-dim hover:text-console-text hover:border-console-active transition-colors"
                onClick={() => void applyPosition(pos.pan, pos.tilt)}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export function PlaybackView() {
  const show = useShowStore((s) => s.show);
  const defMap = useShowStore((s) => s.defMap);
  const [cueLists, setCueLists] = useState<CueListWithPlayback[]>([]);
  const [chases, setChases] = useState<ChaseWithStatus[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // Local copy of masters; synced with show.settings.playbackMasters
  const [masters, setMasters] = useState<PlaybackMaster[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise masters from show
  useEffect(() => {
    if (show?.settings.playbackMasters) {
      setMasters(show.settings.playbackMasters);
    }
  }, [show?.settings.playbackMasters]);

  const refresh = useCallback(() => {
    void fetch('/api/cueLists')
      .then((r) => r.json() as Promise<CueListWithPlayback[]>)
      .then(setCueLists);
    void fetch('/api/chases')
      .then((r) => r.json() as Promise<ChaseWithStatus[]>)
      .then(setChases);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 300);
    return () => clearInterval(id);
  }, [refresh]);

  // Persist master changes (debounced)
  const saveMasters = useCallback((updated: PlaybackMaster[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void fetch('/api/show/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playbackMasters: updated }),
      });
    }, 400);
  }, []);

  const updateMaster = useCallback(
    (idx: number, patch: Partial<PlaybackMaster>) => {
      setMasters((prev) => {
        const next = prev.map((m, i) => (i === idx ? { ...m, ...patch } : m));
        saveMasters(next);
        return next;
      });
    },
    [saveMasters],
  );

  const fixtures = show?.fixtures ?? [];
  const groups = show?.fixtureGroups ?? [];
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      {/* ── Master fader strips ─────────────────────────────────────────── */}
      <div className="p-3 border-b border-console-border shrink-0">
        <div className="text-xs font-semibold text-console-dim uppercase tracking-wider mb-2">
          Playback Masters
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {masters.map((m, idx) => (
            <FaderStrip
              key={m.id}
              master={m}
              cueLists={cueLists}
              chases={chases}
              onChange={(patch) => updateMaster(idx, patch)}
            />
          ))}
        </div>
      </div>

      {/* ── Group presets ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="text-xs font-semibold text-console-dim uppercase tracking-wider mb-2">
            Groups
          </div>
          {groups.length === 0 ? (
            <p className="text-console-dim text-xs">
              No fixture groups. Create groups in the Patch tab.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={[
                    'px-3 py-1.5 rounded text-xs border transition-colors',
                    selectedGroupId === g.id
                      ? 'bg-console-active text-white border-console-active'
                      : 'bg-console-panel border-console-border text-console-dim hover:text-console-text hover:border-console-active/50',
                  ].join(' ')}
                  onClick={() => setSelectedGroupId(g.id === selectedGroupId ? null : g.id)}
                >
                  {g.label}
                  <span className="ml-1 opacity-50 text-[10px]">
                    ({fixtures.filter((f) => g.fixtureIds.includes(f.id)).length})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedGroup && (
          <div className="flex-1 overflow-y-auto border-t border-console-border">
            <div className="px-3 py-2 bg-console-panel/50 border-b border-console-border">
              <span className="text-sm font-semibold text-console-text">{selectedGroup.label}</span>
            </div>
            <GroupPresetsPanel group={selectedGroup} fixtures={fixtures} defMap={defMap} />
          </div>
        )}
      </div>
    </div>
  );
}
