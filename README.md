# DMX Console

A professional-grade, browser-based DMX lighting console with Art-Net output, built on Node.js + React.

Inspired by MagicQ and MA2, designed for theatre, live events, and studio use — with a built-in LLM agent API so AI can design and run light shows programmatically.

---

## Features

- **Fixture patching** — import QLC+ `.qxf` fixture definitions, assign DMX addresses and universes
- **Programmer** — select fixtures, set intensity, colour, position, and beam attributes via sliders and an XY pad
- **Cue lists** — record looks from the programmer, set fade times, step through with Go/Back/Pause
- **Chases** — BPM-synced step sequencers with forward, backward, bounce, and random directions; tap-tempo sync
- **Shape engine** — 1D waveforms (sine, cosine, triangle, square, ramp, random) and 2D paths (circle, figure-8, lissajous) with per-fixture phase spread; pixel textures for LED bars
- **Art-Net output** — UDP broadcast at up to 44 Hz over one or more universes
- **HTP/LTP merge** — cue → chase → shape → programmer priority stack with proper HTP on intensity channels
- **Keyboard control** — configurable key bindings, numeric fixture entry (`1 @ 75 Enter`), Shift+F-key flash
- **Show files** — JSON save/load with 30-second auto-save
- **Agent API** — REST command bus + WebSocket events for LLM or script control; OpenAPI spec at `/api/docs`

---

## Requirements

- **Node.js** 20+
- **npm** 9+ (workspaces)
- A device on the same network running Art-Net-compatible lighting equipment, or a software visualizer such as [QLC+](https://qlcplus.org/) or [MA3 onPC](https://www.malighting.com/)

---

## Quick start

```bash
# 1. Clone and install
git clone <repo-url>
cd dmx-console
npm install

# 2. Start the dev server (backend on :3000, Vite on :5173)
npm run dev

# 3. Open the console in a browser
open http://localhost:5173
```

The backend serves the API on `http://localhost:3000`. The Vite dev server proxies `/api` and socket connections automatically.

### Production build

```bash
npm run build
npm run start -w packages/server   # serves compiled backend on port 3000
```

---

## Art-Net configuration

By default the server broadcasts to `255.255.255.255:6454` (Art-Net standard port) at 30 Hz on universe 0.

To change the target, edit `show.json` (created on first save) or `PATCH /api/show/settings`:

```json
{
  "artnet": {
    "host": "10.0.0.255",
    "broadcast": true,
    "refreshHz": 30,
    "universes": [0, 1]
  }
}
```

---

## Project structure

```
dmx-console/
├── packages/
│   ├── shared/          # TypeScript types, key bindings, colour utilities
│   ├── server/          # Express + Socket.io backend
│   │   └── src/
│   │       ├── api/     # REST routes (patch, programmer, cueLists, chases, shapes, agent)
│   │       ├── artnet/  # Art-DMX packet builder and universe buffer
│   │       ├── engine/  # Fade, merge, shape, conflict engines
│   │       ├── fixtures/# QLC+ parser and built-in fixture library
│   │       └── store/   # In-memory show state, programmer, playback, persist
│   └── client/          # Vite + React frontend
│       └── src/
│           ├── views/   # PatchView, ProgrammerView, CueListView, ChaseView, ShapeView, FixtureLibView
│           ├── components/  # XYPad, ColorPicker, faders, KeyMapModal
│           ├── hooks/   # useKeyboardShortcuts, useSocket, useShow
│           └── store/   # Zustand show store, programmer store
├── fixtures/            # Bundled QLC+ .qxf fixture definitions
├── docs/
│   ├── user-guide.md    # This guide (how to operate the console)
│   ├── agent.md         # LLM/script agent API guide
│   └── api.md           # Full REST + WebSocket reference
└── PLAN.md              # Implementation notes
```

---

## Development commands

| Command | Description |
|---|---|
| `npm run dev` | Start server + client in watch mode |
| `npm run build` | Compile all packages |
| `npm run test` | Run all unit tests (235 tests) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run typecheck` | TypeScript (no emit) |

---

## Agent / automation API

An LLM or script can drive the console entirely over HTTP:

```bash
# Read current show state
curl http://localhost:3000/api/agent/state

# Set a fixture's dimmer to 80%
curl -X POST http://localhost:3000/api/agent/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"programmer.set","payload":{"fixtureId":"<uuid>","channels":{"Dimmer":204}}}'

# Record cue 1 into a cue list
curl -X POST http://localhost:3000/api/agent/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"cue.record","payload":{"cueListId":"<uuid>","label":"Warm wash","timing":{"fadeIn":2,"fadeOut":1.5,"delay":0}}}'
```

Interactive API reference (Swagger UI): `http://localhost:3000/api/docs`

See [docs/agent.md](docs/agent.md) for the full command reference.

---

## Fixture library

The console ships with 7 built-in fixture types and loads `.qxf` files from the `fixtures/` directory at startup:

| Built-in ID | Type |
|---|---|
| `builtin_dimmer_1ch` | Dimmer |
| `builtin_rgb_3ch` | RGB colour changer |
| `builtin_rgbw_4ch` | RGBW colour changer |
| `builtin_rgbwa_5ch` | RGBWA colour changer |
| `builtin_dimmer_rgb_4ch` | Dimmer + RGB |
| `builtin_moving_head_basic` | Moving head (pan/tilt/dimmer/colour) |
| `builtin_led_bar_8px` | 8-pixel LED bar |

Drop additional [QLC+ fixture files](https://github.com/mcallegari/qlcplus/tree/master/resources/fixtures) into `fixtures/` and restart — they load automatically.

### AI fixture creation from a PDF manual

In the **Library** view, click **✨ AI** to generate a fixture definition from a manufacturer's PDF user manual. The server extracts the manual text and asks an LLM to produce a fixture definition; if the manual documents several DMX modes (e.g. 8/11/16-channel), **all** are captured as modes on one fixture, and each mode keeps the original channel map from the manual in its description. You review the generated fixture and click **Save to library** — saved fixtures are written to `fixtures/user/<id>.json` and reload at startup.

Three providers are supported, selectable per request. API keys are read **server-side only** from environment variables — set whichever you want to use (e.g. in `packages/server/.env`):

| Provider | Env var | Default model |
|---|---|---|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| ChatGPT (OpenAI) | `OPENAI_API_KEY` | `gpt-4o` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |

```bash
# packages/server/.env
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...
```

The model is editable in the UI per request. Providers without a configured key are shown as unavailable.

---

## Keyboard shortcuts

Press `?` in the app to open the full shortcuts overlay. Key highlights:

| Key | Action |
|---|---|
| `Space` / `Enter` | Cue Go |
| `Backspace` | Cue Back |
| `Escape` | Clear programmer |
| `Ctrl+S` | Save show |
| `?` | Toggle shortcuts help |
| `Alt+1` – `Alt+6` | Switch views (Patch / Programmer / Cues / Chases / Shapes / Library) |
| `I` / `P` / `C` / `B` | Intensity / Position / Colour / Beam panel |
| `T` | Tap tempo |
| `F1`–`F8` | Playback masters (Go cue list or toggle chase) |
| `Shift+F1`–`Shift+F8` | Flash master (hold at 100%, release to restore) |
| `1`–`9` `Enter` | Select fixture by number |
| `1` `@` `75` `Enter` | Select fixture 1, set dimmer to 75% |

---

## License

MIT
