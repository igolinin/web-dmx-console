import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  CueList,
  Chase,
  PlaybackMaster,
  FixtureGroup,
  PatchedFixture,
  FixtureDef,
  ShapeLayer,
} from '@dmx-console/shared';
import { useShowStore } from '../store/useShow.js';
import {
  isInputFocused,
  PLAYBACK_UP_KEYS as UP_KEYS,
  PLAYBACK_DOWN_KEYS as DOWN_KEYS,
  PLAYBACK_FLASH_KEYS as FLASH_KEYS,
} from '../keyboard/keyMap.js';

const LEVEL_STEP = 5; // % per key press (auto-repeat ramps while held)

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

const DIRECTIONS: Chase['direction'][] = ['forward', 'backward', 'bounce', 'random'];
const DIRECTION_ICON: Record<Chase['direction'], string> = {
  forward: '→',
  backward: '←',
  bounce: '⇄',
  random: '⁇',
};

function FaderStrip({
  master,
  cueLists,
  chases,
  recordMode,
  onChange,
  refresh,
}: {
  master: PlaybackMaster;
  cueLists: CueListWithPlayback[];
  chases: ChaseWithStatus[];
  recordMode: boolean;
  onChange: (updated: Partial<PlaybackMaster>) => void;
  refresh: () => void;
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

  // Record panel is available on chase or empty masters (not cue lists).
  const canRecord = recordMode && master.assignedType !== 'cueList';
  const stepCount = assignedChase?.steps.length ?? 0;
  // The step the chase is currently sitting on (only while running); deleting
  // targets this one, and the control is disabled when there is no current step.
  const currentStepIndex = assignedChase?.currentStepIndex ?? -1;
  const hasCurrentStep = currentStepIndex >= 0 && currentStepIndex < stepCount;

  const handleRecord = useCallback(async () => {
    let chaseId = master.assignedType === 'chase' ? master.assignedId : null;
    if (!chaseId) {
      const res = await fetch('/api/chases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: master.label }),
      });
      chaseId = ((await res.json()) as { id: string }).id;
      onChange({ assignedId: chaseId, assignedType: 'chase' });
    }
    await fetch(`/api/chases/${chaseId}/steps`, { method: 'POST' });
    refresh();
  }, [master.assignedType, master.assignedId, master.label, onChange, refresh]);

  const handleDeleteCurrent = useCallback(async () => {
    if (!assignedChase || !hasCurrentStep) return;
    const step = assignedChase.steps[currentStepIndex];
    if (!step) return;
    await fetch(`/api/chases/${assignedChase.id}/steps/${step.id}`, { method: 'DELETE' });
    refresh();
  }, [assignedChase, hasCurrentStep, currentStepIndex, refresh]);

  const handleClearAll = useCallback(async () => {
    if (!assignedChase) return;
    await fetch(`/api/chases/${assignedChase.id}/steps`, { method: 'DELETE' });
    refresh();
  }, [assignedChase, refresh]);

  const cycleDirection = useCallback(async () => {
    if (!assignedChase) return;
    const next = DIRECTIONS[(DIRECTIONS.indexOf(assignedChase.direction) + 1) % DIRECTIONS.length]!;
    await fetch(`/api/chases/${assignedChase.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: next }),
    });
    refresh();
  }, [assignedChase, refresh]);

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

      {/* Record panel (only while record mode is armed) */}
      {canRecord && (
        <div className="w-full p-1 flex flex-col gap-1 border-t border-console-danger/40 bg-console-danger/5">
          <button
            className="w-full py-1.5 text-xs font-bold rounded bg-console-danger/80 text-white hover:bg-red-600 flex items-center justify-center gap-1"
            onClick={() => void handleRecord()}
            title="Record a step from the current programmer look"
          >
            <span className="text-[8px]">●</span> Rec
          </button>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-console-dim tabular-nums">{stepCount} st</span>
            <button
              className="px-1 py-0.5 text-[10px] rounded border border-console-border text-console-dim hover:text-console-text disabled:opacity-30"
              onClick={() => void cycleDirection()}
              disabled={!assignedChase}
              title={`Direction: ${assignedChase?.direction ?? 'forward'}`}
            >
              {DIRECTION_ICON[assignedChase?.direction ?? 'forward']}
            </button>
          </div>
          <div className="flex gap-1">
            <button
              className="flex-1 py-0.5 text-[10px] rounded border border-console-border text-console-dim hover:text-console-text disabled:opacity-30"
              onClick={() => void handleDeleteCurrent()}
              disabled={!hasCurrentStep}
              title={
                hasCurrentStep
                  ? `Delete the current step (#${currentStepIndex + 1})`
                  : 'Run the chase to a step to delete it'
              }
            >
              ✕ Current
            </button>
            <button
              className="flex-1 py-0.5 text-[10px] rounded border border-console-danger/30 text-console-danger hover:bg-console-danger/20 disabled:opacity-30"
              onClick={() => void handleClearAll()}
              disabled={stepCount === 0}
              title="Clear all steps"
            >
              ✕ All
            </button>
          </div>
        </div>
      )}
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
  const [shapes, setShapes] = useState<ShapeLayer[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [recordMode, setRecordMode] = useState(false);
  // Local copy of masters; this view is the source of truth once mounted.
  const [masters, setMasters] = useState<PlaybackMaster[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise masters from the show store ONCE (when empty). We deliberately do
  // not re-adopt the store afterwards: recording/assigning fires several
  // state:update broadcasts in quick succession, and a late /api/state refetch
  // would otherwise clobber a just-made local edit (lost assignment / step count).
  useEffect(() => {
    const fromStore = show?.settings.playbackMasters;
    if (!fromStore?.length) return;
    setMasters((prev) => (prev.length === 0 ? fromStore : prev));
  }, [show?.settings.playbackMasters]);

  const refresh = useCallback(() => {
    void fetch('/api/cueLists')
      .then((r) => r.json() as Promise<CueListWithPlayback[]>)
      .then(setCueLists);
    void fetch('/api/chases')
      .then((r) => r.json() as Promise<ChaseWithStatus[]>)
      .then(setChases);
    void fetch('/api/shapes')
      .then((r) => r.json() as Promise<ShapeLayer[]>)
      .then(setShapes);
  }, []);

  const patchShape = useCallback((id: string, body: Record<string, unknown>) => {
    void fetch(`/api/shapes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 300);
    return () => clearInterval(id);
  }, [refresh]);

  // Persist master changes (debounced).
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

  // Latest values for the keyboard handlers (avoids stale-closure rebinding).
  const mastersRef = useRef(masters);
  mastersRef.current = masters;
  const cueListsRef = useRef(cueLists);
  cueListsRef.current = cueLists;
  const chasesRef = useRef(chases);
  chasesRef.current = chases;
  // Per-master state captured at flash-start so key-up can restore it.
  const flashPrevRef = useRef<Map<number, { level: number; wasRunning: boolean }>>(new Map());

  // Immediately persist masters (used by flash, which must be responsive).
  const saveMastersNow = useCallback((updated: PlaybackMaster[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    void fetch('/api/show/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playbackMasters: updated }),
    });
  }, []);

  const setLevelNow = useCallback(
    (idx: number, level: number) => {
      setMasters((prev) => {
        const next = prev.map((m, i) => (i === idx ? { ...m, level } : m));
        saveMastersNow(next);
        return next;
      });
    },
    [saveMastersNow],
  );

  const triggerPlayback = useCallback((master: PlaybackMaster, action: 'go' | 'release') => {
    if (!master.assignedId) return;
    if (master.assignedType === 'cueList') {
      const verb = action === 'go' ? 'go' : 'release';
      void fetch(`/api/cueLists/${master.assignedId}/${verb}`, { method: 'POST' });
    } else if (master.assignedType === 'chase') {
      const verb = action === 'go' ? 'play' : 'stop';
      void fetch(`/api/chases/${master.assignedId}/${verb}`, { method: 'POST' });
    }
  }, []);

  const isMasterRunning = useCallback((master: PlaybackMaster): boolean => {
    if (!master.assignedId) return false;
    if (master.assignedType === 'cueList') {
      return (
        (cueListsRef.current.find((cl) => cl.id === master.assignedId)?.playback.activeCueIndex ??
          -1) >= 0
      );
    }
    return chasesRef.current.find((ch) => ch.id === master.assignedId)?.running === true;
  }, []);

  // Keyboard playback grid — active only while this page is mounted.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused() || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();

      const upIdx = UP_KEYS.indexOf(key);
      if (upIdx >= 0) {
        const m = mastersRef.current[upIdx];
        if (m) {
          updateMaster(upIdx, { level: Math.min(100, m.level + LEVEL_STEP) });
          e.preventDefault();
        }
        return;
      }

      const downIdx = DOWN_KEYS.indexOf(key);
      if (downIdx >= 0) {
        const m = mastersRef.current[downIdx];
        if (m) {
          updateMaster(downIdx, { level: Math.max(0, m.level - LEVEL_STEP) });
          e.preventDefault();
        }
        return;
      }

      const flashIdx = FLASH_KEYS.indexOf(key);
      if (flashIdx >= 0) {
        e.preventDefault();
        if (e.repeat || flashPrevRef.current.has(flashIdx)) return;
        const m = mastersRef.current[flashIdx];
        if (!m?.assignedId) return;
        const wasRunning = isMasterRunning(m);
        flashPrevRef.current.set(flashIdx, { level: m.level, wasRunning });
        setLevelNow(flashIdx, 100);
        if (!wasRunning) triggerPlayback(m, 'go');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const flashIdx = FLASH_KEYS.indexOf(e.key.toLowerCase());
      if (flashIdx < 0) return;
      const prev = flashPrevRef.current.get(flashIdx);
      if (!prev) return;
      flashPrevRef.current.delete(flashIdx);
      setLevelNow(flashIdx, prev.level);
      const m = mastersRef.current[flashIdx];
      if (m && !prev.wasRunning) triggerPlayback(m, 'release');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updateMaster, setLevelNow, triggerPlayback, isMasterRunning]);

  const fixtures = show?.fixtures ?? [];
  const groups = show?.fixtureGroups ?? [];
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      {/* ── Master fader strips ─────────────────────────────────────────── */}
      <div className="p-3 border-b border-console-border shrink-0">
        <div className="flex items-center justify-between mb-2 gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-console-dim uppercase tracking-wider">
              Playback Masters
            </div>
            <button
              className={[
                'px-2 py-0.5 text-xs rounded border flex items-center gap-1 transition-colors',
                recordMode
                  ? 'bg-console-danger/80 text-white border-console-danger animate-pulse'
                  : 'border-console-border text-console-dim hover:text-console-text',
              ].join(' ')}
              onClick={() => setRecordMode((v) => !v)}
              title="Toggle record mode — record chase steps onto a master"
            >
              <span className="text-[8px]">●</span> {recordMode ? 'Recording' : 'Record'}
            </button>
          </div>
          <div className="text-[10px] text-console-dim">
            Keys: <span className="text-console-text">Q–P</span> up ·{' '}
            <span className="text-console-text">A–;</span> down ·{' '}
            <span className="text-console-text">Z–/</span> flash
          </div>
        </div>
        <div
          className={[
            'flex gap-2 overflow-x-auto pb-1 rounded',
            recordMode ? 'ring-1 ring-console-danger/50 p-1' : '',
          ].join(' ')}
        >
          {masters.map((m, idx) => (
            <FaderStrip
              key={m.id}
              master={m}
              cueLists={cueLists}
              chases={chases}
              recordMode={recordMode}
              onChange={(patch) => updateMaster(idx, patch)}
              refresh={refresh}
            />
          ))}
        </div>
      </div>

      {/* ── Shapes (live size / speed) ───────────────────────────────────── */}
      {shapes.length > 0 && (
        <div className="p-3 border-b border-console-border shrink-0">
          <div className="text-xs font-semibold text-console-dim uppercase tracking-wider mb-2">
            Shapes
          </div>
          <div className="flex flex-wrap gap-2">
            {shapes.map((s) => {
              const setLocal = (patch: Partial<ShapeLayer>) => {
                setShapes((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
              };
              return (
                <div
                  key={s.id}
                  className={[
                    'w-48 bg-console-panel border rounded p-2',
                    s.active ? 'border-console-active' : 'border-console-border',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <button
                      className={[
                        'w-3 h-3 rounded-full border shrink-0 transition-colors',
                        s.active
                          ? 'bg-console-active border-console-active'
                          : 'bg-transparent border-console-border',
                      ].join(' ')}
                      title={s.active ? 'Active (click to stop)' : 'Inactive (click to run)'}
                      onClick={() => {
                        setLocal({ active: !s.active });
                        patchShape(s.id, { active: !s.active });
                      }}
                    />
                    <span className="text-xs text-console-text truncate" title={s.label}>
                      {s.label}
                    </span>
                  </div>
                  <label className="flex flex-col gap-0.5 text-[10px] text-console-dim">
                    <span className="flex justify-between">
                      <span>Size</span>
                      <span className="tabular-nums text-console-text">{s.size}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={s.size}
                      className="w-full"
                      style={{ accentColor: 'var(--color-console-active, #3b82f6)' }}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setLocal({ size: v });
                        patchShape(s.id, { size: v });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px] text-console-dim mt-1">
                    <span className="flex justify-between">
                      <span>Speed</span>
                      <span className="tabular-nums text-console-text">{s.speed}Hz</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={0.1}
                      value={s.speed}
                      className="w-full"
                      style={{ accentColor: 'var(--color-console-active, #3b82f6)' }}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setLocal({ speed: v });
                        patchShape(s.id, { speed: v });
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
