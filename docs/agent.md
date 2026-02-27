# LLM Agent Integration Guide

This document describes how an LLM agent can drive the DMX Console to
design and execute light shows programmatically.

---

## Overview

The DMX Console exposes a structured command bus at `POST /api/agent/command`
and a state query at `GET /api/agent/state`. An LLM agent can:

1. Inspect the current show state (patched fixtures, cue lists, shapes)
2. Control the programmer (set fixture values)
3. Record cues and build cue lists
4. Create chases and shapes
5. Drive playback (go, back, pause)

---

## Typical Workflow

```
1. GET /api/agent/state           → understand the show
2. GET /api/fixtures              → find fixture definitions
3. POST /api/agent/command        → patch, programme, record, play
4. Subscribe to dmx:tick events   → confirm DMX output
```

---

## Command Reference

All commands go to `POST /api/agent/command` with body:

```json
{ "action": "<action>", "payload": { ... } }
```

### Programmer

**Set fixture channels**
```json
{
  "action": "programmer.set",
  "payload": {
    "fixtureId": "uuid",
    "channels": { "IntensityMasterDimmer": 255, "IntensityRed": 200 }
  }
}
```

**Set all fixtures in a group**
```json
{
  "action": "programmer.setGroup",
  "payload": { "groupId": "uuid", "channels": { "IntensityMasterDimmer": 128 } }
}
```

**Clear programmer**
```json
{ "action": "programmer.clear" }
```

### Cues

**Record cue from current programmer**
```json
{
  "action": "cue.record",
  "payload": {
    "cueListId": "uuid",
    "number": 3.0,
    "label": "Warm wash",
    "timing": { "fadeIn": 2.0, "fadeOut": 1.5, "delay": 0 }
  }
}
```

**Go / Back / Pause**
```json
{ "action": "cue.go",   "payload": { "cueListId": "uuid" } }
{ "action": "cue.back", "payload": { "cueListId": "uuid" } }
{ "action": "cue.pause","payload": { "cueListId": "uuid" } }
```

### Chases

**Create a chase**
```json
{
  "action": "chase.create",
  "payload": {
    "label": "RGB cycle",
    "bpm": 120,
    "direction": "forward",
    "steps": [
      { "values": [{ "fixtureId": "uuid", "channels": { "IntensityRed": 255, "IntensityGreen": 0, "IntensityBlue": 0 } }], "timing": { "fadeIn": 0, "fadeOut": 0, "delay": 0 } },
      { "values": [{ "fixtureId": "uuid", "channels": { "IntensityRed": 0, "IntensityGreen": 255, "IntensityBlue": 0 } }], "timing": { "fadeIn": 0, "fadeOut": 0, "delay": 0 } }
    ]
  }
}
```

**Play / Stop**
```json
{ "action": "chase.play", "payload": { "chaseId": "uuid" } }
{ "action": "chase.stop", "payload": { "chaseId": "uuid" } }
```

### Shapes

**Create a pan/tilt circle**
```json
{
  "action": "shape.create",
  "payload": {
    "label": "Pan/Tilt circle",
    "shape2d": "circle",
    "xTarget": "pan",
    "yTarget": "tilt",
    "fixtureIds": ["id1", "id2", "id3", "id4"],
    "speed": 0.5,
    "size": 60,
    "center": 128,
    "spread": 90,
    "phaseOffset": 0
  }
}
```

**Create a dimmer sine wave**
```json
{
  "action": "shape.create",
  "payload": {
    "label": "Dimmer pulse",
    "waveform": "sine",
    "target": "dimmer",
    "fixtureIds": ["id1", "id2", "id3"],
    "speed": 1.0,
    "size": 100,
    "center": 128,
    "spread": 120,
    "phaseOffset": 0
  }
}
```

### Patch

**Add a fixture**
```json
{
  "action": "patch.add",
  "payload": {
    "defId": "generic_moving_head_basic",
    "universe": 0,
    "address": 1,
    "label": "MH 1",
    "modeIndex": 0
  }
}
```

---

## Channel Name Convention

Channel names follow QLC+ preset naming. Common names:

| Name | Description |
|---|---|
| `IntensityMasterDimmer` | Master dimmer / intensity |
| `IntensityRed` | Red |
| `IntensityGreen` | Green |
| `IntensityBlue` | Blue |
| `IntensityWhite` | White |
| `IntensityAmber` | Amber |
| `PositionPan` | Pan (coarse) |
| `PositionPanFine` | Pan (fine, 16-bit) |
| `PositionTilt` | Tilt (coarse) |
| `PositionTiltFine` | Tilt (fine, 16-bit) |
| `BeamZoomSmallBig` | Zoom |
| `BeamFocusNearFar` | Focus |
| `ShutterStrobeSlowFast` | Strobe |

All values are 0–255. Pan/Tilt center is 128.

---

## State Structure

`GET /api/agent/state` returns the full `Show` object:

```json
{
  "version": "1",
  "meta": { "title": "My Show", "author": "", "createdAt": "...", "modifiedAt": "..." },
  "fixtures": [ { "id": "uuid", "defId": "...", "universe": 0, "address": 1, "label": "MH 1", "modeIndex": 0, "groupIds": [] } ],
  "fixtureGroups": [],
  "cueLists": [ { "id": "uuid", "label": "Main", "cues": [] } ],
  "chases": [],
  "shapes": [],
  "artnet": { "host": "255.255.255.255", "broadcast": true, "refreshHz": 30, "universes": [0] }
}
```

---

## Tips for LLM Agents

- Always `GET /api/agent/state` first to discover existing fixture IDs.
- Channel names in `programmer.set` must match the fixture definition's channel names exactly.
- Use `GET /api/fixtures/:defId` to inspect available channel names for a fixture type.
- Shape `size` is an amplitude in DMX units (0–255). For pan/tilt, 60 ≈ 24° of travel on a typical 540°-range fixture.
- Chase `bpm` is beats per minute; one beat = one step advance.
