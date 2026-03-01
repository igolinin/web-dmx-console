# DMX Console — User Guide

This guide explains how to use the DMX Console to design and operate a light show.

---

## Table of contents

1. [Interface overview](#1-interface-overview)
2. [Starting up](#2-starting-up)
3. [Patching fixtures](#3-patching-fixtures)
4. [Controlling fixtures (Programmer)](#4-controlling-fixtures-programmer)
5. [Recording cues](#5-recording-cues)
6. [Playing back cues](#6-playing-back-cues)
7. [Chases](#7-chases)
8. [Shape engine](#8-shape-engine)
9. [Show files](#9-show-files)
10. [Keyboard shortcuts](#10-keyboard-shortcuts)

---

## 1. Interface overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◉ My Show  │ Patch │ Programmer │ Cues │ Chases │ Shapes │ Library │  ? Save│
├──────────────────────────────────────────────────────────────────────────────┤
│                          Main view area                                      │
│                     (changes with active tab)                                │
├──────────────────────────────────────────────────────────────────────────────┤
│  U0  ░░░░████░░░░░░████████░░░  18 active                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Top bar** — connection indicator, view tabs, `?` shortcut help, Save button.

**Main area** — switches between the six views (Patch, Programmer, Cues, Chases, Shapes, Library).

**Universe bar** — a mini bar-graph of the current DMX output for each active universe, updated in real time at 30 Hz.

The green dot means the browser is connected to the server. A red dot means the WebSocket connection dropped — refresh the page to reconnect.

---

## 2. Starting up

```bash
npm install      # first time only
npm run dev      # starts server (:3000) and UI (:5173)
```

Open `http://localhost:5173` in any modern browser (Chrome / Firefox / Safari / Edge).

If the green connection dot does not appear within a few seconds, check that the server started without errors in the terminal.

---

## 3. Patching fixtures

Switch to **Patch** (`Alt+1`).

### Adding a fixture

1. Click **Add Fixture**.
2. Search for your fixture by manufacturer or model in the library panel on the right.
3. Set the **universe** (0-based Art-Net port address) and **DMX start address** (1–512).
4. Optionally set a **label** and **mode** (personality).
5. Click **Add to patch**. The console checks for DMX address conflicts — overlapping fixtures are rejected with a warning.

### Built-in fixtures

If your fixture is not in the library, choose one of the built-in generic types:

| Built-in | Channels |
|---|---|
| Dimmer 1ch | Dimmer |
| RGB 3ch | Red, Green, Blue |
| RGBW 4ch | Red, Green, Blue, White |
| RGBWA 5ch | Red, Green, Blue, White, Amber |
| Dimmer+RGB 4ch | Dimmer, Red, Green, Blue |
| Moving Head Basic | Pan, Tilt, Dimmer, Red, Green, Blue |
| LED Bar 8px | 3 channels per pixel × 8 pixels = 24 channels |

### Editing or removing a fixture

Click a fixture row in the patch table to open an edit panel. Change the label, address, or mode, or click **Remove** to delete it.

### Adding custom fixture files

Drop QLC+ `.qxf` XML files into the `fixtures/` directory and restart the server. They appear in the library automatically.

---

## 4. Controlling fixtures (Programmer)

Switch to **Programmer** (`Alt+2`).

The programmer is the **live edit layer** — values here override the cue output in real time.

### Selecting fixtures

- Click fixture buttons in the **Fixture Selection** bar (bottom of the programmer view).
- Click a second time to deselect. `Ctrl+A` selects all, `Ctrl+D` deselects all.
- **Keyboard:** type a fixture number and press `Enter` — e.g. `3 Enter` selects fixture 3.

### Setting values

After selecting fixtures, use the four attribute panels:

| Panel | Key | Controls |
|---|---|---|
| **Intensity** | `I` | Dimmer fader (0–100%) |
| **Position** | `P` | Pan/Tilt XY pad + individual sliders |
| **Colour** | `C` | RGB colour wheel, RGBW/RGBWA sliders |
| **Beam** | `B` | Zoom, Focus, Gobo, Prism, Shutter sliders |

Only channels that exist in the selected fixtures are shown.

### Quick intensity entry

`1` `@` `75` `Enter` — selects fixture 1 and immediately sets its dimmer to 75%.

### Clearing the programmer

Press `Escape` or click **Clear** to remove all programmer values. This does not affect recorded cues — it only removes the live overrides.

---

## 5. Recording cues

Switch to **Cues** (`Alt+3`).

### Create a cue list

Click **New Cue List** and give it a label (e.g. "Main Show").

### Record a cue

1. In the Programmer, dial in the look you want to record.
2. In Cues view, select the destination cue list.
3. Click **Record** (or use the Record button next to the cue list).
4. The programmer's current values are snapshotted into a new cue.

Each cue has:

- **Number** — display number (e.g. 1.0, 1.5, 2.0). Decimal numbers insert cues between existing ones without renumbering.
- **Label** — free-text name.
- **Fade In** — seconds to fade from the previous look into this cue (default 2s).
- **Fade Out** — seconds to fade out when the next cue starts (default 2s).
- **Delay** — seconds after Go before the fade begins (default 0).
- **Follow** — if set, the cue automatically fires Go after this many seconds (for time-coded sequences).

### Editing a cue

Click a cue row to expand timing fields. Changes take effect immediately.

---

## 6. Playing back cues

### Manual playback

In the Cue list view, use the transport buttons:

| Button | Key | Action |
|---|---|---|
| **Go** | `Space` / `Enter` | Step to the next cue (starts fade) |
| **Back** | `Backspace` | Step back to the previous cue |
| **Pause** | — | Freeze the current fade mid-transition |
| **Release** | — | Stop playback and clear cue output |

The active cue is highlighted. The fade progress is shown in the cue row.

### Playback masters (F1–F8)

Assign up to 8 cue lists or chases to playback masters in **Settings**. Then:

- `F1`–`F8` — Go on assigned cue list, or toggle play/stop on a chase.
- `Shift+F1`–`Shift+F8` — Flash: hold key to set fixtures at 100%, release to restore.

### Multiple cue lists

You can have multiple cue lists running simultaneously. Each runs its own playback state independently. Assign a cue list as the **active** list in Settings to have `Space` / `Enter` target it by default.

---

## 7. Chases

Switch to **Chases** (`Alt+4`).

A chase is a looping step sequencer. Each step can contain a full programmer state recorded from any fixture combination.

### Creating a chase

1. Click **New Chase** and give it a label.
2. Set **BPM** (beats per minute) — 120 is a typical starting point.
3. Choose **Direction**: Forward, Backward, Bounce (ping-pong), or Random.

### Adding steps

1. Dial in the desired look in the Programmer.
2. In the chase editor, click **Add Step** — the current programmer state is snapshotted as a new step.
3. Repeat for each step in the sequence.

Steps can be reordered by drag-and-drop. Click a step row to edit its timing (fade in/out/delay).

### Running a chase

Click **Play** ▶ in the chase editor to start the sequencer. The current step is highlighted as it advances.

**Tap tempo** — press `T` repeatedly in time with the beat to set the BPM automatically.

Chases merge into the output above cue values (LTP) and below the programmer.

---

## 8. Shape engine

Switch to **Shapes** (`Alt+5`).

Shapes generate continuous motion or colour effects that run autonomously on top of cues and chases.

### Shape types

**1D Waveform** — applies a single waveform to one attribute across selected fixtures.

| Waveform | Shape |
|---|---|
| Sine | Smooth oscillation |
| Cosine | Sine offset by 90° |
| Triangle | Linear ramp up/down |
| Square | Snappy on/off |
| Ramp | Sawtooth |
| Random | Stepped random values |

Targets: `dimmer`, `pan`, `tilt`, `red`, `green`, `blue`, `white`, `amber`, `zoom`, `focus`.

**2D Shape** — links two axes (default pan + tilt) for geometric motion:

| Shape | Path |
|---|---|
| Circle | Circular pan/tilt sweep |
| Figure-8 | Horizontal figure-eight |
| Lissajous | User-defined harmonic ratio |

**Pixel texture** — fills LED Bar (Pixels) fixtures with animated patterns:
`rainbow`, `gradient`, `chase`, `fire`.

### Shape parameters

| Parameter | Description |
|---|---|
| **Speed** | Hz (cycles per second). 0.5 = one rotation per 2 seconds |
| **Size** | Amplitude in DMX units (0–255). For pan/tilt, 60 ≈ 24° on a 540° fixture |
| **Center** | Base offset (0–255). 128 = centre of travel |
| **Spread** | Phase offset between consecutive fixtures (0–360°). 120° = three-fixture fan |
| **Phase Offset** | Global starting phase (0–360°) |

### Creating a shape

1. Click **New Shape** and choose a type.
2. Set the waveform/shape and target attribute(s).
3. Select fixture IDs (or pick from the fixture list in the shape editor).
4. Set speed, size, center, and spread.
5. Click **Active** to enable the shape. It starts contributing to the output immediately.

Multiple shapes can run simultaneously. Each layer is merged LTP on top of cues and chases.

---

## 9. Show files

### Saving

- `Ctrl+S` — save immediately.
- The server auto-saves every 30 seconds.
- Click **Save** in the top-right corner to save manually.

The show is written to `show.json` in the server working directory. This file is plain JSON and can be backed up or version-controlled.

### Loading

The server loads `show.json` automatically on startup. If no file is found, it starts with an empty show.

To reload from disk without restarting, use `POST /api/show/load`.

### Portability

Show files are self-contained JSON. They include all fixtures, cue lists, chases, shapes, and key bindings. Copy `show.json` to another machine running the same server to transfer the show.

---

## 10. Keyboard shortcuts

Press `?` at any time to open the shortcuts overlay.

### Global

| Key | Action |
|---|---|
| `Space` | Cue Go |
| `Enter` | Cue Go |
| `Backspace` | Cue Back |
| `Escape` | Clear programmer |
| `Ctrl+S` | Save show |
| `?` | Toggle shortcuts help |

### Views

| Key | View |
|---|---|
| `Alt+1` | Patch |
| `Alt+2` | Programmer |
| `Alt+3` | Cues |
| `Alt+4` | Chases |
| `Alt+5` | Shapes |
| `Alt+6` | Fixture Library |

### Programmer

| Key | Action |
|---|---|
| `I` | Intensity panel |
| `P` | Position panel |
| `C` | Colour panel |
| `B` | Beam panel |
| `Ctrl+A` | Select all fixtures |
| `Ctrl+D` | Deselect all |

### Numeric entry

Type digits, `@`, and `Enter` to address fixtures directly:

| Sequence | Effect |
|---|---|
| `3` `Enter` | Select fixture 3 |
| `1` `@` `75` `Enter` | Select fixture 1, set dimmer to 75% |
| `Escape` | Cancel numeric entry |

### Playback masters

| Key | Action |
|---|---|
| `F1`–`F8` | Go on assigned cue list / toggle chase |
| `Shift+F1`–`Shift+F8` | Flash (hold = 100%, release = restore) |
| `T` | Tap tempo for active chase |

---

## Tips

- **Additive looks** — record a base look as cue 1, then record cue 2 with just the changes. The fade engine interpolates only the channels present in each cue.
- **Running shapes over cues** — shapes always sit above cues in the merge stack. Use `Center` to anchor the shape within the cue's value range.
- **Chase + shape together** — a chase provides the step content; a shape adds continuous motion on top of each step.
- **Dark show** — record a "Blackout" cue (all fixtures at 0) as cue 1. Press Go once on startup for a clean dark state before fading into your first look.
- **Channel names** — channel names come from the fixture definition. Check `GET /api/fixtures/:defId` or the Library view to see exact names before using the agent API or show JSON directly.
