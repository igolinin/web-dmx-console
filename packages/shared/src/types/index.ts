// ── Fixture Library ───────────────────────────────────────────────────────

export type FixtureType =
  | 'Dimmer'
  | 'Color Changer'
  | 'Moving Head'
  | 'Scanner'
  | 'LED Bar (Beams)'
  | 'LED Bar (Pixels)'
  | 'Strobe'
  | 'Effect'
  | 'Other';

export type ChannelGroup =
  | 'Intensity'
  | 'Colour'
  | 'Pan'
  | 'Tilt'
  | 'Gobo'
  | 'Prism'
  | 'Shutter'
  | 'Beam'
  | 'Speed'
  | 'Effect'
  | 'Maintenance'
  | 'Nothing';

export interface ChannelCapability {
  min: number; // 0–255
  max: number; // 0–255
  label: string;
  preset?: string;
}

export interface ChannelDef {
  name: string;
  group: ChannelGroup;
  colour?: string; // 'Red' | 'Green' | 'Blue' | 'White' | 'Amber' | …
  preset?: string; // QLC+ shorthand e.g. 'IntensityRed'
  byte?: 0 | 1; // 0=coarse 1=fine for 16-bit pairs
  capabilities?: ChannelCapability[];
}

export interface FixtureMode {
  name: string;
  channelNames: string[]; // ordered DMX channel assignment
  description?: string; // verbatim channel map from the source manual (LLM-generated fixtures)
}

export interface PhysicalSpec {
  panMax?: number; // degrees
  tiltMax?: number; // degrees
  pixelCount?: number; // for LED bars/pixels
  powerW?: number;
}

export interface FixtureDef {
  id: string; // `${manufacturer}_${model}` slugified
  manufacturer: string;
  model: string;
  type: FixtureType;
  channels: Record<string, ChannelDef>; // key = channel name
  modes: FixtureMode[];
  physical?: PhysicalSpec;
  source?: string; // 'qlcplus' | 'builtin' | 'user'
}

// ── Patch ─────────────────────────────────────────────────────────────────

export interface PatchedFixture {
  id: string; // uuid
  defId: string; // FixtureDef.id
  universe: number; // Art-Net port-address 0–32767
  address: number; // DMX start address 1–512
  label: string;
  modeIndex: number;
  groupIds: string[];
  stageX?: number; // normalised 0–1 for stage plot
  stageY?: number;
}

export interface FixtureGroup {
  id: string;
  label: string;
  fixtureIds: string[];
}

// ── Programmer / Values ───────────────────────────────────────────────────

/** Key = channel name within fixture def, value = 0–255 */
export type ChannelValues = Record<string, number>;

export interface FixtureValues {
  fixtureId: string;
  channels: ChannelValues;
}

// ── Cues ──────────────────────────────────────────────────────────────────

export interface CueTiming {
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  delay: number; // seconds before fade starts
  follow?: number; // auto-follow: seconds after reaching cue before Go
}

export interface Cue {
  id: string;
  number: number; // display number e.g. 1.0, 1.5, 2.0
  label: string;
  values: FixtureValues[];
  timing: CueTiming;
}

export interface CueList {
  id: string;
  label: string;
  cues: Cue[];
}

// ── Chases ────────────────────────────────────────────────────────────────

export interface ChaseStep {
  id: string;
  values: FixtureValues[];
  timing: CueTiming;
}

export interface Chase {
  id: string;
  label: string;
  steps: ChaseStep[];
  direction: 'forward' | 'backward' | 'bounce' | 'random';
}

// ── Shape Engine ──────────────────────────────────────────────────────────

export type ShapeWaveform = 'sine' | 'cosine' | 'triangle' | 'square' | 'ramp' | 'random';
export type PixelTexture = 'rainbow' | 'gradient' | 'chase' | 'fire';

export type ShapeTarget =
  | 'pan'
  | 'tilt'
  | 'dimmer'
  | 'red'
  | 'green'
  | 'blue'
  | 'white'
  | 'amber'
  | 'zoom'
  | 'focus';

export type Shape2D = 'circle' | 'figure8' | 'lissajous';

export interface ShapeLayer {
  id: string;
  label: string;
  // 1-D shape: single waveform on one target
  waveform?: ShapeWaveform;
  target?: ShapeTarget;
  // 2-D shape: linked x/y targets (e.g. pan+tilt circle)
  shape2d?: Shape2D;
  xTarget?: ShapeTarget; // default 'pan'
  yTarget?: ShapeTarget; // default 'tilt'
  lissajousRatio?: [number, number]; // e.g. [2,1] for figure-8

  fixtureIds: string[]; // order determines phase spread
  speed: number; // Hz (cycles per second)
  size: number; // 0–255 amplitude
  center: number; // 0–255 base value (offset)
  spread: number; // 0–360 degrees phase offset between consecutive fixtures
  phaseOffset: number; // 0–360 global phase at t=0
  active: boolean;
  pixelTexture?: PixelTexture; // LED Bar (Pixels) mode
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

export interface KeyBinding {
  key: string; // e.g. ' ', 'Escape', 'F1', 'a'
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  actionId: string; // e.g. 'cue.go', 'programmer.clear'
}

export interface PlaybackMaster {
  id: string; // 'master_0' … 'master_9'
  label: string; // user-editable label shown on the strip
  assignedId: string | null; // cueList or chase ID, null = unassigned
  assignedType: 'cueList' | 'chase' | null;
  level: number; // 0–100 fader position
}

export interface ShowSettings {
  keyBindings: KeyBinding[];
  activeCueListId?: string; // Space/Enter → go on this cue list
  activeChaseId?: string; // T → tap on this chase
  playbackMasters: PlaybackMaster[]; // 10 master fader strips
  chaseBpm: number; // global playback tempo shared by all chases
}

// ── Show ──────────────────────────────────────────────────────────────────

export interface ArtNetConfig {
  host: string; // target IP or broadcast address
  broadcast: boolean;
  refreshHz: number; // 1–44
  universes: number[]; // active universe port-addresses
}

export interface Show {
  version: '1';
  meta: {
    title: string;
    author: string;
    createdAt: string;
    modifiedAt: string;
  };
  fixtures: PatchedFixture[];
  fixtureGroups: FixtureGroup[];
  cueLists: CueList[];
  chases: Chase[];
  shapes: ShapeLayer[];
  settings: ShowSettings;
  artnet: ArtNetConfig;
}

// ── WebSocket Events ──────────────────────────────────────────────────────

export interface WsStateUpdate {
  changed: (keyof Show)[];
}

export interface WsDmxTick {
  universe: number;
  data: number[]; // 512 values
}

export interface WsCueActive {
  cueListId: string;
  cueId: string;
  cueNumber: number;
}

export interface WsChaseStep {
  chaseId: string;
  stepIndex: number;
}

// ── Agent API ─────────────────────────────────────────────────────────────

export type AgentAction =
  | 'programmer.set'
  | 'programmer.setGroup'
  | 'programmer.clear'
  | 'cue.record'
  | 'cue.go'
  | 'cue.back'
  | 'cue.pause'
  | 'chase.create'
  | 'chase.play'
  | 'chase.stop'
  | 'shape.create'
  | 'shape.update'
  | 'shape.delete'
  | 'patch.add'
  | 'patch.remove';

export interface AgentCommand {
  action: AgentAction;
  payload: Record<string, unknown>;
}
