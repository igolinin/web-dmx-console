import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FixtureDef, PatchedFixture, ShapeLayer } from '@dmx-console/shared';
import { useShowStore } from '../store/useShow.js';
import { useProgrammer } from '../store/useProgrammer.js';
import { XYPad } from '../components/XYPad.js';
import { ColorPicker } from '../components/ColorPicker.js';
import { FaderBank } from '../components/FaderBank.js';
import { ShapeSection, type ShapeAttribute } from '../components/ShapeSection.js';

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

/** Average a numeric value across fixtures that have a given channel group. */
function avgGroupValue(
  fixtures: PatchedFixture[],
  defs: Record<string, FixtureDef>,
  values: Record<string, Record<string, number>>,
  group: string,
): number {
  let sum = 0;
  let count = 0;
  for (const f of fixtures) {
    const def = defs[f.defId];
    if (!def) continue;
    const ch = Object.values(def.channels).find((c) => c.group === group && c.byte !== 1);
    if (!ch) continue;
    sum += values[f.id]?.[ch.name] ?? 0;
    count++;
  }
  return count > 0 ? Math.round(sum / count) : 0;
}

/** Set a channel-group value on every fixture in the list. */
function applyGroupToAll(
  group: string,
  newValue: number,
  fixtures: PatchedFixture[],
  defs: Record<string, FixtureDef>,
  onSetChannels: (fixtureId: string, channels: Record<string, number>) => void,
): void {
  for (const f of fixtures) {
    const def = defs[f.defId];
    if (!def) continue;
    const ch: Record<string, number> = {};
    for (const c of Object.values(def.channels)) {
      if (c.group === group) ch[c.name] = newValue;
    }
    if (Object.keys(ch).length > 0) onSetChannels(f.id, ch);
  }
}

// ── Section divider shown between master and individual controls ───────────

function IndividualDivider({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="flex items-center gap-2 mt-4 mb-2 text-xs text-console-dim hover:text-console-text w-full text-left"
      onClick={onToggle}
    >
      <span className="flex-1 border-t border-console-border" />
      <span>
        {open ? '▲' : '▼'} Individual ({count})
      </span>
      <span className="flex-1 border-t border-console-border" />
    </button>
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
  const [showIndividual, setShowIndividual] = useState(true);
  const intensityFixtures = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasGroup(def, 'Intensity');
  });

  if (intensityFixtures.length === 0) {
    return <p className="text-console-dim text-xs">No intensity channels in selected fixtures.</p>;
  }

  const masterValue = avgGroupValue(intensityFixtures, defs, values, 'Intensity');
  const multi = intensityFixtures.length > 1;

  return (
    <div>
      {/* Master fader */}
      <FaderBank
        faders={[
          {
            label: multi ? `Dimmer — ${intensityFixtures.length} fixtures` : 'Dimmer',
            channelName: '__master',
            value: masterValue,
          },
        ]}
        showPercent
        onChange={(_, v) => applyGroupToAll('Intensity', v, intensityFixtures, defs, onSetChannels)}
      />

      {/* Per-fixture controls */}
      {multi && (
        <>
          <IndividualDivider
            count={intensityFixtures.length}
            open={showIndividual}
            onToggle={() => setShowIndividual((v) => !v)}
          />
          {showIndividual && (
            <div className="flex gap-4 flex-wrap">
              {intensityFixtures.map((f) => {
                const def = defs[f.defId]!;
                const dimmerChannels = Object.values(def.channels).filter(
                  (ch) => ch.group === 'Intensity',
                );
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
                      onChange={(channelName, value) =>
                        onSetChannels(f.id, { [channelName]: value })
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
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
  const [showIndividual, setShowIndividual] = useState(true);
  const movers = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasPan(def);
  });

  const handleMasterPosition = useCallback(
    (newPan: number, newTilt: number) => {
      for (const f of movers) {
        const def = defs[f.defId]!;
        const panCh = Object.values(def.channels).find((c) => c.group === 'Pan' && c.byte !== 1);
        const tiltCh = Object.values(def.channels).find((c) => c.group === 'Tilt' && c.byte !== 1);
        const ch: Record<string, number> = {};
        if (panCh) ch[panCh.name] = newPan;
        if (tiltCh) ch[tiltCh.name] = newTilt;
        if (Object.keys(ch).length > 0) onSetChannels(f.id, ch);
      }
    },
    [movers, defs, onSetChannels],
  );

  if (movers.length === 0) {
    return <p className="text-console-dim text-xs">No pan/tilt channels in selected fixtures.</p>;
  }

  const masterPan = avgGroupValue(movers, defs, values, 'Pan');
  const masterTilt = avgGroupValue(movers, defs, values, 'Tilt');
  const multi = movers.length > 1;

  return (
    <div>
      {/* Master XY pad */}
      <div className="flex flex-col items-center gap-1">
        {multi && (
          <div className="text-xs text-console-dim mb-1">Pan / Tilt — {movers.length} fixtures</div>
        )}
        <XYPad pan={masterPan} tilt={masterTilt} size={180} onChange={handleMasterPosition} />
      </div>

      {/* Per-fixture controls */}
      {multi && (
        <>
          <IndividualDivider
            count={movers.length}
            open={showIndividual}
            onToggle={() => setShowIndividual((v) => !v)}
          />
          {showIndividual && (
            <div className="flex gap-4 flex-wrap">
              {movers.map((f) => {
                const def = defs[f.defId]!;
                const panCh = Object.values(def.channels).find(
                  (ch) => ch.group === 'Pan' && ch.byte !== 1,
                );
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
                      size={120}
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
          )}
        </>
      )}
    </div>
  );
}

// ── Colour mixing (RGB + CMY) ──────────────────────────────────────────────
//
// The colour picker always works in RGB. CMY fixtures are subtractive — Cyan is
// the inverse of Red, etc. — so we map RGB↔CMY at read/write time and present a
// single intuitive RGB picker regardless of the fixture's mixing system.

type ColourSlot = 'red' | 'green' | 'blue' | 'white' | 'amber';

interface ColourMap {
  isCmy: boolean;
  names: Record<ColourSlot, string | undefined>;
}

/** Resolve a fixture's colour channels into logical RGB(W/A) slots. */
export function getColourMap(def: FixtureDef): ColourMap {
  const find = (c: string) => Object.values(def.channels).find((ch) => ch.colour === c)?.name;
  const cyan = find('Cyan');
  const magenta = find('Magenta');
  const yellow = find('Yellow');
  const white = find('White');
  const amber = find('Amber');
  if (cyan ?? magenta ?? yellow) {
    return { isCmy: true, names: { red: cyan, green: magenta, blue: yellow, white, amber } };
  }
  return {
    isCmy: false,
    names: { red: find('Red'), green: find('Green'), blue: find('Blue'), white, amber },
  };
}

function hasColourPrimaries(def: FixtureDef): boolean {
  const { names } = getColourMap(def);
  return !!(names.red ?? names.green ?? names.blue ?? names.white ?? names.amber);
}

/** Read a logical RGB(W/A) slot value, inverting RGB↔CMY for subtractive fixtures. */
export function readColour(map: ColourMap, fv: Record<string, number>, slot: ColourSlot): number {
  const name = map.names[slot];
  if (!name) return 0;
  const raw = fv[name] ?? 0;
  const invert = map.isCmy && (slot === 'red' || slot === 'green' || slot === 'blue');
  return invert ? 255 - raw : raw;
}

/** Write a logical RGB(W/A) slot into a raw channel map, inverting for CMY. */
export function writeColour(
  map: ColourMap,
  out: Record<string, number>,
  slot: ColourSlot,
  value: number,
): void {
  const name = map.names[slot];
  if (name === undefined) return;
  const invert = map.isCmy && (slot === 'red' || slot === 'green' || slot === 'blue');
  out[name] = invert ? 255 - value : value;
}

const PICKER_SLOTS: { key: 'Red' | 'Green' | 'Blue' | 'White' | 'Amber'; slot: ColourSlot }[] = [
  { key: 'Red', slot: 'red' },
  { key: 'Green', slot: 'green' },
  { key: 'Blue', slot: 'blue' },
  { key: 'White', slot: 'white' },
  { key: 'Amber', slot: 'amber' },
];

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
  const [showIndividual, setShowIndividual] = useState(true);
  const colourFixtures = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasColour(def) && hasColourPrimaries(def);
  });

  // Master colour: average the logical RGB(W/A) across all selected fixtures.
  const masterColour = useMemo(() => {
    const colour = { red: 0, green: 0, blue: 0, white: 0, amber: 0 };
    let count = 0;
    let hasW = false;
    let hasA = false;
    for (const f of colourFixtures) {
      const map = getColourMap(defs[f.defId]!);
      const fv = values[f.id] ?? {};
      if (map.names.white) hasW = true;
      if (map.names.amber) hasA = true;
      colour.red += readColour(map, fv, 'red');
      colour.green += readColour(map, fv, 'green');
      colour.blue += readColour(map, fv, 'blue');
      colour.white += readColour(map, fv, 'white');
      colour.amber += readColour(map, fv, 'amber');
      count++;
    }
    if (count === 0) return { ...colour, hasWhite: false, hasAmber: false };
    return {
      red: Math.round(colour.red / count),
      green: Math.round(colour.green / count),
      blue: Math.round(colour.blue / count),
      white: Math.round(colour.white / count),
      amber: Math.round(colour.amber / count),
      hasWhite: hasW,
      hasAmber: hasA,
    };
  }, [colourFixtures, defs, values]);

  const handleMasterColour = useCallback(
    (channels: Partial<Record<'Red' | 'Green' | 'Blue' | 'White' | 'Amber', number>>) => {
      for (const f of colourFixtures) {
        const map = getColourMap(defs[f.defId]!);
        const ch: Record<string, number> = {};
        for (const { key, slot } of PICKER_SLOTS) {
          const v = channels[key];
          if (v !== undefined) writeColour(map, ch, slot, v);
        }
        if (Object.keys(ch).length > 0) onSetChannels(f.id, ch);
      }
    },
    [colourFixtures, defs, onSetChannels],
  );

  if (colourFixtures.length === 0) {
    return <p className="text-console-dim text-xs">No colour channels in selected fixtures.</p>;
  }

  const multi = colourFixtures.length > 1;

  return (
    <div>
      {/* Master colour picker */}
      <div className="flex flex-col gap-1">
        {multi && (
          <div className="text-xs text-console-dim mb-1">
            Colour — {colourFixtures.length} fixtures
          </div>
        )}
        <ColorPicker
          red={masterColour.red}
          green={masterColour.green}
          blue={masterColour.blue}
          white={masterColour.white}
          amber={masterColour.amber}
          hasWhite={masterColour.hasWhite}
          hasAmber={masterColour.hasAmber}
          onChange={handleMasterColour}
        />
      </div>

      {/* Per-fixture controls */}
      {multi && (
        <>
          <IndividualDivider
            count={colourFixtures.length}
            open={showIndividual}
            onToggle={() => setShowIndividual((v) => !v)}
          />
          {showIndividual && (
            <div className="flex gap-6 flex-wrap">
              {colourFixtures.map((f) => {
                const map = getColourMap(defs[f.defId]!);
                const fv = values[f.id] ?? {};
                return (
                  <div key={f.id} className="flex flex-col gap-1">
                    <div className="text-xs text-console-dim mb-1">
                      {f.label}
                      {map.isCmy && <span className="ml-1 text-console-muted">(CMY)</span>}
                    </div>
                    <ColorPicker
                      red={readColour(map, fv, 'red')}
                      green={readColour(map, fv, 'green')}
                      blue={readColour(map, fv, 'blue')}
                      white={readColour(map, fv, 'white')}
                      amber={readColour(map, fv, 'amber')}
                      hasWhite={!!map.names.white}
                      hasAmber={!!map.names.amber}
                      onChange={(channels) => {
                        const ch: Record<string, number> = {};
                        for (const { key, slot } of PICKER_SLOTS) {
                          const v = channels[key];
                          if (v !== undefined) writeColour(map, ch, slot, v);
                        }
                        onSetChannels(f.id, ch);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const BEAM_GROUPS = ['Shutter', 'Gobo', 'Prism', 'Beam'] as const;

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
  const [showIndividual, setShowIndividual] = useState(true);
  const beamFixtures = fixtures.filter((f) => {
    const def = defs[f.defId];
    return def && hasBeam(def);
  });

  if (beamFixtures.length === 0) {
    return <p className="text-console-dim text-xs">No beam channels in selected fixtures.</p>;
  }

  const multi = beamFixtures.length > 1;

  // Which beam groups actually exist across selected fixtures?
  const activeGroups = BEAM_GROUPS.filter((group) =>
    beamFixtures.some((f) =>
      Object.values(defs[f.defId]!.channels).some((ch) => ch.group === group),
    ),
  );

  const masterFaders = activeGroups.map((group) => ({
    label: multi ? `${group} (${beamFixtures.length})` : group,
    channelName: group,
    value: avgGroupValue(beamFixtures, defs, values, group),
  }));

  return (
    <div>
      {/* Master beam faders (one per active beam group) */}
      <FaderBank
        faders={masterFaders}
        onChange={(groupName, value) =>
          applyGroupToAll(groupName, value, beamFixtures, defs, onSetChannels)
        }
      />

      {/* Per-fixture controls */}
      {multi && (
        <>
          <IndividualDivider
            count={beamFixtures.length}
            open={showIndividual}
            onToggle={() => setShowIndividual((v) => !v)}
          />
          {showIndividual && (
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
                      onChange={(channelName, value) =>
                        onSetChannels(f.id, { [channelName]: value })
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
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

  const defMap = useShowStore((s) => s.defMap);

  // Shapes are applied/edited inline per attribute tab; poll so live edits and
  // other clients stay reflected.
  const [shapes, setShapes] = useState<ShapeLayer[]>([]);
  const refreshShapes = useCallback(() => {
    void fetch('/api/shapes')
      .then((r) => r.json() as Promise<ShapeLayer[]>)
      .then(setShapes)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    refreshShapes();
    const id = setInterval(refreshShapes, 500);
    return () => clearInterval(id);
  }, [refreshShapes]);

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
            <p className="text-console-dim text-sm">
              Select fixtures below to control them.{' '}
              <span className="text-console-dim/60">
                Ctrl+click to add, Shift+click for a range.
              </span>
            </p>
          ) : (
            <>
              {renderPanel()}
              {activeTab !== 'raw' && (
                <ShapeSection
                  attribute={activeTab as ShapeAttribute}
                  selectedIds={selectedIds}
                  shapes={shapes}
                  refreshShapes={refreshShapes}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom: fixture selector */}
      <div className="border-t border-console-border shrink-0">
        {/* Group quick-select buttons */}
        {(show?.fixtureGroups ?? []).length > 0 && (
          <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 border-b border-console-border flex-wrap">
            <span className="text-[10px] text-console-dim uppercase tracking-wider mr-1">
              Groups:
            </span>
            {(show?.fixtureGroups ?? []).map((g) => (
              <button
                key={g.id}
                className="px-2 py-0.5 text-xs rounded border border-console-border text-console-dim hover:text-console-text hover:border-console-active/50 transition-colors"
                onClick={() => {
                  for (const id of g.fixtureIds) selectFixture(id, 'toggle');
                }}
                title={`Select all in ${g.label}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

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
