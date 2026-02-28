import { useCallback, useMemo } from 'react';
import type { FixtureDef, PatchedFixture } from '@dmx-console/shared';
import { useShowStore } from '../store/useShow.js';
import { useProgrammer } from '../store/useProgrammer.js';
import { XYPad } from '../components/XYPad.js';
import { ColorPicker } from '../components/ColorPicker.js';
import { FaderBank } from '../components/FaderBank.js';

// ── Fixture selection grid ─────────────────────────────────────────────────

function FixtureSelector({
  fixtures,
  defMap,
  selectedIds,
  onSelect,
}: {
  fixtures: PatchedFixture[];
  defMap: Record<string, FixtureDef>;
  selectedIds: string[];
  onSelect: (id: string, e: React.MouseEvent) => void;
}) {
  if (fixtures.length === 0) {
    return (
      <p className="text-console-dim text-xs p-2">No fixtures patched. Go to Patch to add some.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 p-2">
      {fixtures.map((f) => {
        const selected = selectedIds.includes(f.id);
        const def = defMap[f.defId];
        return (
          <button
            key={f.id}
            className={[
              'px-2 py-1 rounded text-xs border transition-colors',
              selected
                ? 'bg-console-active text-white border-console-active'
                : 'bg-console-panel border-console-border text-console-dim hover:text-console-text hover:border-console-active/50',
            ].join(' ')}
            onClick={(e) => onSelect(f.id, e)}
          >
            <div className="font-medium">{f.label}</div>
            <div className="text-[9px] opacity-70">{def?.type ?? '—'}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Attribute tab helpers ──────────────────────────────────────────────────

function hasGroup(def: FixtureDef, group: string): boolean {
  return Object.values(def.channels).some((ch) => ch.group === group);
}

function hasColour(def: FixtureDef): boolean {
  return Object.values(def.channels).some((ch) => ch.group === 'Colour');
}

function hasPan(def: FixtureDef): boolean {
  return Object.values(def.channels).some((ch) => ch.group === 'Pan');
}

function hasBeam(def: FixtureDef): boolean {
  return Object.values(def.channels).some((ch) =>
    ['Gobo', 'Prism', 'Beam', 'Shutter'].includes(ch.group),
  );
}

// ── Attribute panels ───────────────────────────────────────────────────────

function IntensityPanel({
  fixtures,
  defs,
  values,
  onSetChannels,
}: {
  fixtures: PatchedFixture[];
  defs: Record<string, FixtureDef>;
  values: Record<string, Record<string, number>>;
  onSetChannels: (fixtureId: string, channels: Record<string, number>) => void;
}) {
  const intensityFixtures = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasGroup(def, 'Intensity');
  });

  if (intensityFixtures.length === 0) {
    return <p className="text-console-dim text-xs">No intensity channels in selected fixtures.</p>;
  }

  return (
    <div className="flex gap-4 flex-wrap">
      {intensityFixtures.map((f) => {
        const def = defs[f.defId]!;
        const dimmerChannels = Object.values(def.channels).filter((ch) => ch.group === 'Intensity');
        const faders = dimmerChannels.map((ch) => ({
          label: ch.name,
          channelName: ch.name,
          value: values[f.id]?.[ch.name] ?? 0,
        }));
        return (
          <div key={f.id} className="flex flex-col items-center gap-1">
            <div className="text-xs text-console-dim mb-1">{f.label}</div>
            <FaderBank
              faders={faders}
              showPercent
              onChange={(channelName, value) => onSetChannels(f.id, { [channelName]: value })}
            />
          </div>
        );
      })}
    </div>
  );
}

function PositionPanel({
  fixtures,
  defs,
  values,
  onSetChannels,
}: {
  fixtures: PatchedFixture[];
  defs: Record<string, FixtureDef>;
  values: Record<string, Record<string, number>>;
  onSetChannels: (fixtureId: string, channels: Record<string, number>) => void;
}) {
  const movers = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasPan(def);
  });

  if (movers.length === 0) {
    return <p className="text-console-dim text-xs">No pan/tilt channels in selected fixtures.</p>;
  }

  return (
    <div className="flex gap-4 flex-wrap">
      {movers.map((f) => {
        const def = defs[f.defId]!;
        const panCh = Object.values(def.channels).find((ch) => ch.group === 'Pan' && ch.byte !== 1);
        const tiltCh = Object.values(def.channels).find(
          (ch) => ch.group === 'Tilt' && ch.byte !== 1,
        );

        const pan = panCh ? (values[f.id]?.[panCh.name] ?? 128) : 128;
        const tilt = tiltCh ? (values[f.id]?.[tiltCh.name] ?? 128) : 128;

        return (
          <div key={f.id} className="flex flex-col items-center gap-1">
            <div className="text-xs text-console-dim mb-1">{f.label}</div>
            <XYPad
              pan={pan}
              tilt={tilt}
              size={160}
              onChange={(newPan, newTilt) => {
                const ch: Record<string, number> = {};
                if (panCh) ch[panCh.name] = newPan;
                if (tiltCh) ch[tiltCh.name] = newTilt;
                onSetChannels(f.id, ch);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ColourPanel({
  fixtures,
  defs,
  values,
  onSetChannels,
}: {
  fixtures: PatchedFixture[];
  defs: Record<string, FixtureDef>;
  values: Record<string, Record<string, number>>;
  onSetChannels: (fixtureId: string, channels: Record<string, number>) => void;
}) {
  const colourFixtures = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasColour(def);
  });

  if (colourFixtures.length === 0) {
    return <p className="text-console-dim text-xs">No colour channels in selected fixtures.</p>;
  }

  return (
    <div className="flex gap-6 flex-wrap">
      {colourFixtures.map((f) => {
        const def = defs[f.defId]!;
        const fv = values[f.id] ?? {};

        const getColourCh = (colour: string) =>
          Object.values(def.channels).find((ch) => ch.colour === colour);

        const rCh = getColourCh('Red');
        const gCh = getColourCh('Green');
        const bCh = getColourCh('Blue');
        const wCh = getColourCh('White');
        const aCh = getColourCh('Amber');

        const red = rCh ? (fv[rCh.name] ?? 0) : 0;
        const green = gCh ? (fv[gCh.name] ?? 0) : 0;
        const blue = bCh ? (fv[bCh.name] ?? 0) : 0;
        const white = wCh ? (fv[wCh.name] ?? 0) : 0;
        const amber = aCh ? (fv[aCh.name] ?? 0) : 0;

        return (
          <div key={f.id} className="flex flex-col gap-1">
            <div className="text-xs text-console-dim mb-1">{f.label}</div>
            <ColorPicker
              red={red}
              green={green}
              blue={blue}
              white={white}
              amber={amber}
              hasWhite={!!wCh}
              hasAmber={!!aCh}
              onChange={(channels) => {
                const ch: Record<string, number> = {};
                if (channels.Red !== undefined && rCh) ch[rCh.name] = channels.Red;
                if (channels.Green !== undefined && gCh) ch[gCh.name] = channels.Green;
                if (channels.Blue !== undefined && bCh) ch[bCh.name] = channels.Blue;
                if (channels.White !== undefined && wCh) ch[wCh.name] = channels.White;
                if (channels.Amber !== undefined && aCh) ch[aCh.name] = channels.Amber;
                onSetChannels(f.id, ch);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function BeamPanel({
  fixtures,
  defs,
  values,
  onSetChannels,
}: {
  fixtures: PatchedFixture[];
  defs: Record<string, FixtureDef>;
  values: Record<string, Record<string, number>>;
  onSetChannels: (fixtureId: string, channels: Record<string, number>) => void;
}) {
  const beamFixtures = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasBeam(def);
  });

  if (beamFixtures.length === 0) {
    return <p className="text-console-dim text-xs">No beam channels in selected fixtures.</p>;
  }

  return (
    <div className="flex gap-4 flex-wrap">
      {beamFixtures.map((f) => {
        const def = defs[f.defId]!;
        const beamChannels = Object.values(def.channels).filter((ch) =>
          ['Gobo', 'Prism', 'Beam', 'Shutter'].includes(ch.group),
        );
        const fv = values[f.id] ?? {};
        const faders = beamChannels.map((ch) => ({
          label: ch.name,
          channelName: ch.name,
          value: fv[ch.name] ?? 0,
        }));
        return (
          <div key={f.id} className="flex flex-col items-center gap-1">
            <div className="text-xs text-console-dim mb-1">{f.label}</div>
            <FaderBank
              faders={faders}
              onChange={(channelName, value) => onSetChannels(f.id, { [channelName]: value })}
            />
          </div>
        );
      })}
    </div>
  );
}

function RawPanel({
  fixtures,
  defs,
  values,
  onSetChannels,
}: {
  fixtures: PatchedFixture[];
  defs: Record<string, FixtureDef>;
  values: Record<string, Record<string, number>>;
  onSetChannels: (fixtureId: string, channels: Record<string, number>) => void;
}) {
  if (fixtures.length === 0) {
    return <p className="text-console-dim text-xs">No fixtures selected.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {fixtures.map((f) => {
        const def = defs[f.defId];
        if (!def) return null;
        const mode = def.modes[f.modeIndex];
        if (!mode) return null;
        const fv = values[f.id] ?? {};
        const faders = mode.channelNames.map((name) => ({
          label: name,
          channelName: name,
          value: fv[name] ?? 0,
        }));
        return (
          <div key={f.id}>
            <div className="text-xs text-console-dim mb-2">{f.label}</div>
            <FaderBank
              faders={faders}
              onChange={(channelName, value) => onSetChannels(f.id, { [channelName]: value })}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'intensity', label: 'Intensity' },
  { key: 'position', label: 'Position' },
  { key: 'colour', label: 'Colour' },
  { key: 'beam', label: 'Beam' },
  { key: 'raw', label: 'Raw' },
] as const;

export function ProgrammerView() {
  const show = useShowStore((s) => s.show);
  const fixtures = useMemo(() => show?.fixtures ?? [], [show?.fixtures]);

  const {
    selectedIds,
    values,
    activeTab,
    selectFixture,
    selectRange,
    deselectAll,
    setActiveTab,
    setChannels,
    clear,
  } = useProgrammer();

  // Build def map from show (fixtures carry defId; we need defMap from library)
  // The library is loaded separately in PatchView; here we re-fetch or use cached.
  // For simplicity, store defMap in show store (it holds the full fixture list).
  const defMap = useShowStore((s) => s.defMap);

  const selectedFixtures = fixtures.filter((f) => selectedIds.includes(f.id));

  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey) {
        selectRange(id, fixtures);
      } else if (e.metaKey || e.ctrlKey) {
        selectFixture(id, 'toggle');
      } else {
        selectFixture(id, 'single');
      }
    },
    [fixtures, selectFixture, selectRange],
  );

  const handleSetChannels = useCallback(
    (fixtureId: string, channels: Record<string, number>) => {
      void setChannels(fixtureId, channels);
    },
    [setChannels],
  );

  const renderPanel = () => {
    const props = {
      fixtures: selectedFixtures,
      defs: defMap,
      values,
      onSetChannels: handleSetChannels,
    };

    switch (activeTab) {
      case 'intensity':
        return <IntensityPanel {...props} />;
      case 'position':
        return <PositionPanel {...props} />;
      case 'colour':
        return <ColourPanel {...props} />;
      case 'beam':
        return <BeamPanel {...props} />;
      case 'raw':
        return <RawPanel {...props} />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top: attribute tabs + panel */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tab bar */}
        <div className="flex items-center gap-0.5 px-2 pt-2 border-b border-console-border shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              className={[
                'px-3 py-1.5 text-xs rounded-t transition-colors',
                activeTab === key
                  ? 'bg-console-panel text-console-text border border-b-0 border-console-border'
                  : 'text-console-dim hover:text-console-text',
              ].join(' ')}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {selectedIds.length > 0 && (
            <span className="text-xs text-console-dim mr-2">
              {selectedIds.length} fixture{selectedIds.length > 1 ? 's' : ''} selected
            </span>
          )}
          <button
            className="px-2 py-1 text-xs rounded bg-console-danger/20 text-console-danger hover:bg-console-danger/40 mb-0.5 mr-1"
            onClick={() => void clear()}
            title="Clear programmer"
          >
            Clear
          </button>
        </div>

        {/* Attribute panel */}
        <div className="flex-1 overflow-auto p-3">
          {selectedIds.length === 0 ? (
            <p className="text-console-dim text-sm">Select fixtures below to control them.</p>
          ) : (
            renderPanel()
          )}
        </div>
      </div>

      {/* Bottom: fixture selector */}
      <div className="border-t border-console-border shrink-0">
        <div className="flex items-center justify-between px-2 pt-1">
          <span className="text-xs text-console-dim font-semibold">Fixture Selection</span>
          {selectedIds.length > 0 && (
            <button
              className="text-xs text-console-dim hover:text-console-text"
              onClick={deselectAll}
            >
              Deselect all
            </button>
          )}
        </div>
        <div className="max-h-28 overflow-y-auto">
          <FixtureSelector
            fixtures={fixtures}
            defMap={defMap}
            selectedIds={selectedIds}
            onSelect={handleSelect}
          />
        </div>
      </div>
    </div>
  );
}
