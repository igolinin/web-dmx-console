# DMX Console — Implementation Plan

> In-browser DMX lighting console with Art-Net output, fixture library,
> cues, chases, shape engine, keyboard control, and an LLM agent interface.

---

## Vision

A professional-grade browser-based lighting console inspired by MagicQ / MA2,
running a Node.js backend for Art-Net UDP output and a React frontend for the
full console UI. Show files are portable JSON. An LLM agent can drive the
console through a structured REST + WebSocket API designed from day one.

---

## Architecture

### Monorepo (npm workspaces)

```
dmx-console/
├── packages/
│   ├── shared/          # TypeScript types, constants, utilities
│   ├── server/          # Node.js backend
│   └── client/          # React frontend
├── fixtures/            # Bundled QLC+ .qxf fixture files
├── docs/
│   ├── api.md           # REST + WebSocket API reference
│   └── agent.md         # LLM agent integration guide
├── PLAN.md
├── package.json         # Workspace root
└── .eslintrc.json / prettier.config.js / tsconfig.base.json
```

### Backend (`packages/server`)

```
src/
├── artnet/
│   ├── sender.ts        # Raw UDP Art-DMX packet builder & sender
│   └── universe.ts      # Universe state buffer (512 bytes × N universes)
├── engine/
│   ├── merger.ts        # HTP / LTP / priority-based DMX merge
│   ├── fade.ts          # Linear & S-curve fade engine (requestAnimationFrame-style loop)
│   ├── chase.ts         # Chase step sequencer + BPM clock
│   └── shape.ts         # Shape/effect waveform generator
├── api/
│   ├── patch.ts         # REST: fixture patch CRUD
│   ├── cues.ts          # REST: cue list CRUD + playback
│   ├── chases.ts        # REST: chase CRUD + playback
│   ├── shapes.ts        # REST: shape layer CRUD
│   ├── fixtures.ts      # REST: fixture library
│   └── agent.ts         # REST: LLM agent command bus
├── ws/
│   └── events.ts        # Socket.io event handlers + broadcast
├── store/
│   ├── show.ts          # In-memory show state
│   └── persist.ts       # JSON file save / load
├── fixtures/
│   └── parser.ts        # QLC+ .qxf XML → FixtureDefinition
└── index.ts             # Express + Socket.io bootstrap
```

### Frontend (`packages/client`)

```
src/
├── views/
│   ├── PatchView.tsx         # Fixture patching & universe grid
│   ├── ProgrammerView.tsx    # Live fixture control
│   ├── CueListView.tsx       # Cue list + playback controls
│   ├── ChaseView.tsx         # Chase editor & player
│   ├── ShapeView.tsx         # Shape engine editor
│   └── FixtureLibView.tsx    # Browse & manage fixture library
├── components/
│   ├── XYPad.tsx             # Pan/tilt 2D joystick
│   ├── ColorPicker.tsx       # RGB/RGBW/HSI wheel + sliders
│   ├── FaderBank.tsx         # DMX channel faders
│   ├── UniverseGrid.tsx      # 512-cell DMX universe overview
│   ├── FixtureCard.tsx       # Fixture chip for selection
│   ├── CueRow.tsx            # Single cue entry
│   ├── ShapeEditor.tsx       # Shape parameter knobs
│   └── WaveformPreview.tsx   # Live waveform SVG preview
├── store/
│   └── useShow.ts            # Zustand store (mirrors server state)
├── hooks/
│   ├── useSocket.ts          # Socket.io connection + event dispatch
│   └── useSelectedFixtures.ts
└── main.tsx
```

---

## Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript 5 everywhere | Type safety, shared models |
| Frontend framework | React 18 + Vite | Fast HMR, modern concurrent features |
| Styling | Tailwind CSS (dark theme) | Rapid console-style UI |
| State (client) | Zustand | Lightweight, no boilerplate |
| WebSocket | Socket.io (server + client) | Rooms, namespaces, auto-reconnect |
| HTTP API | Express 4 | Simple, well-known |
| Art-Net | Raw Node.js `dgram` (UDP) | No deps, full control over packet |
| Fixture format | QLC+ `.qxf` (XML) | Open standard, 1000+ fixtures |
| XML parsing | `xml2js` | Lightweight, promise-based |
| API validation | `zod` | Runtime schema checks, OpenAPI-gen |
| Testing | Vitest + @testing-library/react | Unified runner, fast |
| Lint | ESLint + TypeScript-eslint | |
| Format | Prettier | |
| API docs | `zod-to-openapi` / swagger-ui | Machine-readable for LLM agents |

---

## Core Data Models (`packages/shared/src/types.ts`)

```typescript
// ── Fixture Library ───────────────────────────────────────────────────────

export type FixtureType =
  | 'Dimmer' | 'Color Changer' | 'Moving Head' | 'Scanner'
  | 'LED Bar (Beams)' | 'LED Bar (Pixels)' | 'Strobe' | 'Effect' | 'Other';

export type ChannelGroup =
  | 'Intensity' | 'Colour' | 'Pan' | 'Tilt' | 'Gobo' | 'Prism'
  | 'Shutter' | 'Beam' | 'Speed' | 'Effect' | 'Maintenance' | 'Nothing';

export interface ChannelCapability {
  min: number;         // 0–255
  max: number;         // 0–255
  label: string;
  preset?: string;
}

export interface ChannelDef {
  name: string;
  group: ChannelGroup;
  colour?: string;     // 'Red' | 'Green' | 'Blue' | 'White' | 'Amber' | …
  preset?: string;     // QLC+ shorthand e.g. 'IntensityRed'
  byte?: 0 | 1;        // 0=coarse 1=fine for 16-bit pairs
  capabilities?: ChannelCapability[];
}

export interface FixtureMode {
  name: string;
  channelNames: string[];  // ordered DMX channel assignment
}

export interface PhysicalSpec {
  panMax?: number;      // degrees
  tiltMax?: number;     // degrees
  pixelCount?: number;  // for LED bars/pixels
  powerW?: number;
}

export interface FixtureDef {
  id: string;           // `${manufacturer}_${model}` slugified
  manufacturer: string;
  model: string;
  type: FixtureType;
  channels: Record<string, ChannelDef>;   // key = channel name
  modes: FixtureMode[];
  physical?: PhysicalSpec;
  source?: string;      // 'qlcplus' | 'builtin' | 'user'
}

// ── Patch ────────────────────────────────────────────────────────────────

export interface PatchedFixture {
  id: string;           // uuid
  defId: string;        // FixtureDef.id
  universe: number;     // Art-Net port-address 0–32767
  address: number;      // DMX start address 1–512
  label: string;
  modeIndex: number;
  groupIds: string[];
  // Optional stage plot position (normalised 0–1)
  stageX?: number;
  stageY?: number;
}

export interface FixtureGroup {
  id: string;
  label: string;
  fixtureIds: string[];
}

// ── Programmer / Values ───────────────────────────────────────────────────

// Key = channel name within fixture def, value = 0–255
export type ChannelValues = Record<string, number>;

export interface FixtureValues {
  fixtureId: string;
  channels: ChannelValues;
}

// ── Cues ─────────────────────────────────────────────────────────────────

export interface CueTiming {
  fadeIn: number;      // seconds
  fadeOut: number;     // seconds
  delay: number;       // seconds before fade starts
  follow?: number;     // auto-follow: seconds after reaching cue before Go
}

export interface Cue {
  id: string;
  number: number;      // display number e.g. 1.0, 1.5, 2.0
  label: string;
  values: FixtureValues[];
  timing: CueTiming;
}

export interface CueList {
  id: string;
  label: string;
  cues: Cue[];
}

// ── Chases ───────────────────────────────────────────────────────────────

export interface ChaseStep {
  id: string;
  values: FixtureValues[];
  timing: CueTiming;
}

export interface Chase {
  id: string;
  label: string;
  steps: ChaseStep[];
  bpm: number;
  direction: 'forward' | 'backward' | 'bounce' | 'random';
}

// ── Shape Engine ──────────────────────────────────────────────────────────

export type ShapeWaveform =
  | 'sine' | 'cosine' | 'triangle' | 'square' | 'ramp' | 'random';

export type ShapeTarget =
  | 'pan' | 'tilt' | 'dimmer'
  | 'red' | 'green' | 'blue' | 'white' | 'amber'
  | 'zoom' | 'focus';

export type Shape2D = 'circle' | 'figure8' | 'lissajous';

export interface ShapeLayer {
  id: string;
  label: string;
  // 1-D shape: single target
  waveform?: ShapeWaveform;
  target?: ShapeTarget;
  // 2-D shape: linked x/y targets
  shape2d?: Shape2D;
  xTarget?: ShapeTarget;       // default 'pan'
  yTarget?: ShapeTarget;       // default 'tilt'
  lissajousRatio?: [number, number];  // e.g. [2,1] for figure-8

  fixtureIds: string[];        // order determines phase spread
  speed: number;               // Hz (cycles per second)
  size: number;                // 0–255 amplitude
  center: number;              // 0–255 base value (offset)
  spread: number;              // 0–360 degrees phase between fixtures
  phaseOffset: number;         // 0–360 global phase at t=0
  active: boolean;
}

// ── Show ─────────────────────────────────────────────────────────────────

export interface ArtNetConfig {
  host: string;          // target IP or broadcast
  broadcast: boolean;
  refreshHz: number;     // 1–44
  universes: number[];   // active universe port-addresses
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
  artnet: ArtNetConfig;
}
```

---

## Art-Net Packet Builder

Raw UDP implementation — no external Art-Net library required:

```
Art-DMX packet (opcode 0x5000):
Bytes  0–7  : "Art-Net\0"
Bytes  8–9  : OpCode 0x5000 (LE)
Bytes 10–11 : Protocol version 14 (BE)
Byte  12    : Sequence (0 = disabled)
Byte  13    : Physical (0)
Byte  14    : SubUni = (subnet << 4) | universe
Byte  15    : Net (7-bit)
Bytes 16–17 : Length in big-endian (must be even, 2–512)
Bytes 18+   : DMX data
```

Port-address = `(net << 8) | (subnet << 4) | universe`
Max refresh: 44 packets/s per universe
UDP port: 6454

---

## DMX Engine (server)

### Priority layers (high to low)

```
1. Programmer (highest — always wins on active channels)
2. Shape layers (additive to programmer or cue values)
3. Active cue (with crossfade)
4. Default / park values
```

### Merge rules

- **HTP** (Highest Takes Precedence): dimmer/intensity channels
- **LTP** (Latest Takes Precedence): position, colour, beam

### Fade engine

16ms tick (≈60Hz). Linear interpolation between `startValues` and
`endValues` over `fadeTime` seconds. S-curve option for natural movement.

### Shape engine math

For fixture at index `i` out of `N`, at time `t` (seconds):

```
phase_i = 2π * speed * t + (i * spread * π/180) + (phaseOffset * π/180)

sine:     value = center + size * sin(phase_i)
cosine:   value = center + size * cos(phase_i)
triangle: value = center + size * (2/π) * asin(sin(phase_i))
square:   value = center + size * sign(sin(phase_i))
ramp:     value = center + size * ((phase_i mod 2π) / π - 1)

Circle (2D):
  pan  = pan_center  + size * sin(phase_i)
  tilt = tilt_center + size * cos(phase_i)

Figure-8 (Lissajous 2:1):
  pan  = pan_center  + size * sin(2 * phase_i)
  tilt = tilt_center + size * cos(phase_i)
```

Values are clamped to [0, 255] before writing to DMX buffer.

---

## Fixture Library

**Source**: QLC+ fixture library (~1000 fixtures)
**Format**: XML `.qxf` files
**Bundled at**: `fixtures/` directory
**Parser**: `packages/server/src/fixtures/parser.ts`
**Built-in fixtures** (always available, no file needed):

| ID | Type | Channels |
|---|---|---|
| `builtin_dimmer_1ch` | Dimmer | 1 × Intensity |
| `builtin_rgb_3ch` | Color Changer | R, G, B |
| `builtin_rgbw_4ch` | Color Changer | R, G, B, W |
| `builtin_rgbwa_5ch` | Color Changer | R, G, B, W, A |
| `builtin_dimmer_rgb_4ch` | Color Changer | Dim, R, G, B |
| `builtin_moving_head_basic` | Moving Head | Pan, PanFine, Tilt, TiltFine, Dim, R, G, B |
| `builtin_led_bar_8px` | LED Bar (Pixels) | 8 × (R, G, B) |

---

## LLM Agent Interface

All agent-facing endpoints live under `/api/agent/`.

### State queries

```
GET  /api/agent/state              → full Show JSON
GET  /api/agent/output             → current DMX output per universe
GET  /api/agent/programmer         → active programmer values
```

### Commands (`POST /api/agent/command`)

Single unified command bus. Body: `{ action, payload }`.

```json
// Set fixture channels
{ "action": "programmer.set",
  "payload": { "fixtureId": "uuid", "channels": { "Red": 255, "Dimmer": 200 } } }

// Set by group
{ "action": "programmer.setGroup",
  "payload": { "groupId": "uuid", "channels": { "Dimmer": 255 } } }

// Clear programmer
{ "action": "programmer.clear" }

// Record cue
{ "action": "cue.record",
  "payload": { "cueListId": "uuid", "number": 3.0, "label": "Warm wash",
               "timing": { "fadeIn": 2.0, "fadeOut": 1.5, "delay": 0 } } }

// Go / Back
{ "action": "cue.go",   "payload": { "cueListId": "uuid" } }
{ "action": "cue.back", "payload": { "cueListId": "uuid" } }

// Create chase
{ "action": "chase.create",
  "payload": { "label": "Color chase", "bpm": 120, "direction": "forward",
               "steps": [ { "values": [...], "timing": {...} } ] } }

// Create shape
{ "action": "shape.create",
  "payload": { "label": "Pan swing", "shape2d": "circle",
               "fixtureIds": ["id1","id2","id3"],
               "speed": 0.5, "size": 80, "center": 128, "spread": 120 } }

// Patch fixture
{ "action": "patch.add",
  "payload": { "defId": "robe_pointe", "universe": 0, "address": 1,
               "label": "MH 1", "modeIndex": 0 } }
```

### WebSocket events

```
client subscribes → "agent:subscribe"
server emits      → "state:update"    { changed: string[] }
                  → "dmx:tick"        { universe: number, data: number[] }
                  → "cue:active"      { cueListId, cueId, cueNumber }
                  → "chase:step"      { chaseId, stepIndex }
```

### OpenAPI spec

Auto-generated from Zod schemas via `zod-to-openapi`. Served at
`GET /api/docs` (Swagger UI) and `GET /api/docs/json` (raw JSON).

---

## Implementation Phases

---

### Phase 1 — Foundation

**Goal**: Monorepo running, Art-Net sending, frontend connecting.

**Tasks**:
1. `package.json` workspace root + per-package configs
2. `tsconfig.base.json` + per-package `tsconfig.json`
3. `.eslintrc.json` (TypeScript-eslint + react-hooks), `prettier.config.js`
4. `vitest.config.ts` per package
5. `packages/shared`: all types from above, exported index
6. `packages/server`: Express on port 3000, Socket.io, health endpoint
7. `packages/server`: `artnet/sender.ts` — builds and sends Art-DMX via dgram
8. `packages/server`: `artnet/universe.ts` — universe buffer state
9. `packages/client`: Vite scaffold, Tailwind dark theme, Socket.io connection
10. `packages/client`: basic app shell (nav, placeholder views)

**Tests**:
- Art-DMX packet builder: header magic bytes, opcode, universe encoding, length field
- Universe buffer: set channel, get buffer, bounds check

**Exit criteria**: `npm run dev` starts server + client. Art-Net packets
visible via Wireshark / `tcpdump` on port 6454.

---

### Phase 2 — Fixture Library & Patch

**Goal**: Import QLC+ fixtures, patch them to DMX addresses.

**Tasks**:
1. `packages/server/src/fixtures/parser.ts` — parse `.qxf` XML → `FixtureDef`
2. Bundle 50+ QLC+ fixture files in `fixtures/` (generic + popular)
3. Built-in fixtures (7 definitions from table above)
4. `GET /api/fixtures` — list library (filterable by type, manufacturer)
5. `GET /api/fixtures/:id` — single definition detail
6. Patch store: add, remove, edit patched fixtures
7. `GET/POST/DELETE /api/patch` endpoints
8. DMX address conflict detection (overlap check across universes)
9. `PatchView` — fixture library browser + drag-to-patch UI
10. `UniverseGrid` — 512-cell colored grid (red=used, gradient by type)
11. Fixture label editor, address/universe input

**Tests**:
- QLC+ parser: parses sample .qxf, returns correct channel count/names
- Conflict detector: overlapping addresses flagged, adjacent ok
- Patch CRUD: add/remove/update via API

**Exit criteria**: User can browse fixture library, add fixtures to a
universe, see them in the universe grid, and save the patch.

---

### Phase 3 — Programmer

**Goal**: Select fixtures and control all parameters live.

**Tasks**:
1. Fixture selection: click select, shift-click range, group select
2. Programmer store (per-channel LTP values, "active" flag per channel)
3. Attribute panel routing: detect channel groups from `FixtureDef`
4. **Intensity panel**: master dimmer fader per fixture + group
5. **Position panel**: `XYPad` component (2D drag → pan/tilt %)
6. **Colour panel**: `ColorPicker` (HSV wheel + RGBW sliders), colour temperature
7. **Beam panel**: zoom, focus, gobo wheel, iris faders
8. **Raw panel**: per-channel faders for any unlisted channels
9. Programmer → universe merge (HTP dimmer, LTP position/colour)
10. "Clear" button (deactivates programmer; affected channels fade to cue)
11. Real-time DMX output at 30Hz from programmer

**Tests**:
- Programmer merge: dimmer HTP, colour LTP
- XYPad → pan/tilt value mapping (0–255 range, origin centre)
- Colour wheel → RGB conversion accuracy

**Exit criteria**: Select fixtures, move XY pad, spin colour wheel — DMX
output values update live in universe grid.

---

### Phase 4 — Cue Engine & Show Files

**Goal**: Record, store, and play back cues with fades.

**Tasks**:
1. Cue list store (server-side, Socket.io synced)
2. `POST /api/cueLists` — create cue list
3. `POST /api/cueLists/:id/cues` — record cue from current programmer
4. `PATCH /api/cueLists/:id/cues/:cueId` — edit timing/label
5. `DELETE /api/cueLists/:id/cues/:cueId`
6. Go / Back / Pause / Release playback commands
7. Fade engine: 16ms tick, linear interpolation + S-curve option
8. Cue-to-cue crossfade (outgoing cue fades out, incoming fades in)
9. Delay, fade-in, fade-out, auto-follow timing
10. HTP/LTP merge of programmer over cue output
11. `CueListView` — scrollable cue list, current cue highlighted
12. Per-cue timing editor (tap to set fade times)
13. Show save/load: `POST /api/show/save`, `POST /api/show/load`
14. Show auto-save every 30 seconds

**Tests**:
- Fade engine: values at t=0, t=halfway, t=end
- S-curve interpolation correctness
- HTP: programmer at 200, cue at 255 → output 255
- LTP: programmer pan overwrites cue pan
- Auto-follow timing
- JSON round-trip: save show → load show → identical state

**Exit criteria**: Record two cues, press Go — fixture fades from cue 1 to
cue 2 with configurable timing. Show saves and reloads.

---

### Phase 5 — Chases

**Goal**: Step-based sequences with BPM control.

**Tasks**:
1. Chase store + `GET/POST/DELETE /api/chases`
2. Chase step editor: add steps from programmer or existing cues
3. Chase playback engine: BPM clock with `setInterval` precision correction
4. Direction: forward, backward, bounce, random
5. Per-step crossfade time
6. Tap tempo button (computes BPM from last 4 taps)
7. Running state broadcast over Socket.io (`chase:step` event)
8. `ChaseView` — step list, direction selector, BPM input, tap tempo, play/stop

**Tests**:
- Sequencer: step advances on correct BPM timing
- Bounce direction: step 0→N→0→N correctly
- Tap tempo: average of last 4 intervals
- Random: never repeats same step twice in a row

**Exit criteria**: Create a 4-step RGB chase, play at 120 BPM — fixtures
cycle through colours in sequence.

---

### Phase 6 — Shape Engine

**Goal**: Continuous parameter effects for moving lights and LED arrays.

**Tasks**:
1. Shape layer store + `GET/POST/PATCH/DELETE /api/shapes`
2. Shape engine tick (runs in same 16ms loop as fader)
3. Waveforms: sine, cosine, triangle, square, ramp, random
4. 2D shapes: circle, figure-8, Lissajous (ratio configurable)
5. Per-fixture spread (phase offset = i × spread_deg)
6. Shape stack: multiple simultaneous layers, all summed
7. Shape outputs added to cue/programmer output (LTP for position, additive option for colour)
8. **Pixel mapping mode**: for `LED Bar (Pixels)` fixtures — map virtual XY to pixel index, apply 2D texture
9. Built-in pixel textures: rainbow, gradient, chase, fire-effect
10. `ShapeEditor` UI — fixture selector, waveform picker, speed/size/spread knobs
11. `WaveformPreview` — real-time SVG showing calculated values for each fixture

**Tests**:
- Circle at t=0, t=0.25s, t=0.5s — expected pan/tilt values
- Figure-8: pan frequency = 2× tilt frequency confirmed
- Spread: 3 fixtures at 120° spread have expected phase differences
- Clamp: shape output never exceeds [0, 255]
- Pixel mapper: fixture at position 0.5 gets mid-gradient colour

**Exit criteria**: Apply circle shape to 4 moving heads — they draw
synchronized circles with 90° spread. Apply rainbow to LED bar.

---

### Phase 7 — Keyboard Control

**Goal**: Full console operation from keyboard, no mouse required.

**Tasks**:
1. `packages/client/src/hooks/useKeyboardShortcuts.ts` — global keydown listener
2. `KeyMap` class: maps `{ key, ctrl, shift, alt }` → `AgentCommand`
3. Default key map from the table above
4. Key map stored in `Show.settings.keyMap`, saved with show file
5. Command dispatcher shared with LLM agent API (same action types)
6. Numeric entry buffer: `1 @ 75 Enter` = set fixture 1 dimmer to 75%
7. Fixture number → fixture ID resolution
8. Playback masters: F1–F8 each assigned to a cue list or chase
9. Flash mode (Shift+F): bump to 100%, release returns to previous value
10. Key map settings view: display table, click cell to rebind
11. `?` overlay: displays all active bindings in a modal
12. Focus management: key bindings disabled when text inputs are focused

**Tests**:
- Key resolver: `{ key: ' ' }` → `cue.go`
- Numeric buffer: sequence `1`, `@`, `7`, `5`, `Enter` → `programmer.set` dimmer=191 (75%)
- Flash: keydown fires set 255, keyup fires restore previous value
- Settings round-trip: modified key map saves and reloads correctly

**Exit criteria**: Operator can run an entire show (patch, programme, record
cues, go, back) using only the keyboard.

---

### Phase 8 — LLM Agent Interface

**Goal**: Full agent-controllable API with documentation.

**Tasks**:
1. `packages/server/src/api/agent.ts` — command bus handler
2. All actions from the command table above implemented
3. `GET /api/agent/state` — full show JSON
4. `GET /api/agent/output` — current DMX output snapshot
5. Zod schemas for all command payloads
6. Error responses with structured `{ error, code, field }` bodies
7. OpenAPI spec generation from Zod schemas
8. Swagger UI served at `/api/docs`
9. WebSocket `agent:subscribe` / `state:update` / `dmx:tick` events
10. `docs/agent.md` — human-readable guide with examples
11. `docs/api.md` — full REST endpoint reference
12. Rate limiting on agent endpoints (prevent DMX flooding)

**Tests**:
- Each command action: executes correctly, returns expected state
- Invalid payload: returns structured 400 with field info
- State dump: round-trips through `Show` schema validation
- WebSocket: `dmx:tick` events arrive at expected rate

**Exit criteria**: An LLM can `GET /api/agent/state`, understand the show,
send `programmer.set` commands, record cues, and create shapes — all via
the documented JSON API without human intervention.

---

## Phase Completion Checklist (each phase)

At the end of every phase:

```bash
npm run test          # All unit tests pass
npm run lint          # Zero ESLint errors or warnings
npm run format:check  # Prettier clean
npm run build         # TypeScript compiles with zero errors
```

Then:
1. Update `PLAN.md` phase status table (below)
2. Commit: `git commit -m "phase N: <summary>"`

---

## Phase Status

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation | complete |
| 2 | Fixture Library & Patch | complete |
| 3 | Programmer | complete |
| 4 | Cue Engine & Show Files | pending |
| 5 | Chases | pending |
| 6 | Shape Engine | pending |
| 7 | Keyboard Control | pending |
| 8 | LLM Agent Interface | pending |

---

## UI Layout Reference

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◉ DMX Console  │ Patch │ Cues │ Chases │ Shapes │ Library │ [Save] │
├────────────────────────────────────────┬─────────────────────────────┤
│                                        │  CUE LIST                   │
│  PROGRAMMER / STAGE VIEW               │  ▶  1.0  Blackout      0.0s │
│                                        │  →  2.0  Warm wash     2.0s │
│  [XY Pad]   [Colour Wheel]  [Beam]     │     3.0  Rock look     1.5s │
│                                        │     4.0  Strobe        0.0s │
│  Intensity  ████▒▒▒▒  [Dimmer faders] │                             │
│                                        │  [GO]  [BACK]  [PAUSE]      │
│  Selected: MH1 MH2 MH3 All            │                             │
├────────────────────────────────────────┴─────────────────────────────┤
│  FIXTURE SELECTION                                                    │
│  [MH 1] [MH 2] [MH 3] [MH 4]  |  [PAR 1..8]  |  [LED Bar 1..4]    │
├───────────────────────────────────────────────────────────────────────┤
│  UNIVERSE 0  ░░░░████░░░░░░████████░░░░░░░░░░░░  Ch 1–512           │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Fixture File Sources

- **Primary**: QLC+ GitHub library — `https://github.com/mcallegari/qlcplus/tree/master/resources/fixtures`
- **Secondary**: Open Fixture Library — `https://github.com/OpenLightingProject/open-fixture-library`
- **Format**: QLC+ `.qxf` (XML) — open standard, no licensing issues
- MagicQ `.hed` and MA2 `.xml` are proprietary/undocumented; QLC+ is preferred

---

## Development Commands

```bash
# Install all deps
npm install

# Run everything in dev mode
npm run dev

# Run tests
npm run test
npm run test:coverage

# Lint & format
npm run lint
npm run format

# Build for production
npm run build

# Type-check only
npm run typecheck
```

---

---

## Keyboard Control

The console is fully operable without a mouse. All key bindings are:

- Configurable (editable in Settings view)
- Displayed in a cheat-sheet panel (`?` key)
- Shown inline as tooltips on buttons

### Default Key Map

#### Global

| Key | Action |
|---|---|
| `Space` | Cue Go (active cue list) |
| `Backspace` | Cue Back |
| `Escape` | Clear programmer |
| `Ctrl+S` | Save show |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `?` | Toggle key map cheat sheet |

#### Fixture Selection

| Key | Action |
|---|---|
| `1`–`9` | Select fixture by number |
| `Shift+1`–`9` | Toggle fixture in selection |
| `Ctrl+A` | Select all fixtures |
| `Ctrl+D` | Deselect all |
| `G` + number | Select fixture group |

#### Attribute Entry (numpad-style)

| Key | Action |
|---|---|
| `I` | Switch to Intensity panel |
| `P` | Switch to Position panel |
| `C` | Switch to Colour panel |
| `B` | Switch to Beam panel |
| `0`–`9` | Enter value digit (confirm with Enter) |
| `@` | Value entry (e.g. `1 @ 75 Enter` = fixture 1 at 75%) |
| `F` + digit | Full (100%) then digit sub-range (MagicQ style) |
| `+` / `-` | Increment/decrement selected attribute by 5 |

#### Cue List Navigation

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection in cue list |
| `Enter` | Go (same as Space) |
| `Delete` | Delete selected cue |
| `R` | Record cue |
| `U` | Update cue (record changes into active cue) |

#### Chase & Shape

| Key | Action |
|---|---|
| `T` | Tap tempo (for active chase) |
| `F1`–`F8` | Playback masters (trigger chase/cue list) |
| `Shift+F1`–`F8` | Flash (bump) playback master |

#### View Switching

| Key | Action |
|---|---|
| `Alt+1` | Patch view |
| `Alt+2` | Programmer view |
| `Alt+3` | Cue list view |
| `Alt+4` | Chase view |
| `Alt+5` | Shape view |
| `Alt+6` | Fixture library |

### Implementation

Keyboard handling lives in `packages/client/src/hooks/useKeyboardShortcuts.ts`.

```typescript
// Architecture: global keydown listener → command dispatcher
// Commands are the same action objects used by the LLM agent API,
// keeping keyboard and agent control paths identical.

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const cmd = keyMap.resolve(e);
    if (cmd) { dispatch(cmd); e.preventDefault(); }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [keyMap, dispatch]);
```

Key map is stored in `Show.settings.keyMap` so bindings are saved with
the show file and portable across sessions.

---

## Notes for Future LLM Agents

The show file format is designed to be self-describing. A language model
can:

1. `GET /api/agent/state` to understand current show structure
2. Browse `GET /api/fixtures` to find appropriate fixture definitions
3. Use the command bus to build a complete show programmatically
4. Subscribe to `dmx:tick` events for real-time output feedback

All identifiers are UUIDs. All DMX values are 0–255. Timing is in seconds.
Fixture channel names match QLC+ standard presets (e.g. `"IntensityRed"`,
`"PositionPan"`) enabling consistent cross-fixture programming.
