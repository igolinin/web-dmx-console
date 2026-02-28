# REST & WebSocket API Reference

> Auto-generated OpenAPI spec available at `GET /api/docs/json` when the server is running.
> Swagger UI at `GET /api/docs`.

## Base URL

```
http://localhost:3000/api
```

## Authentication

None — this is a local console tool. Add your own reverse-proxy auth layer
for network deployments.

---

## Endpoints (Phase 2+)

Documentation expands with each phase. See `PLAN.md` for the full endpoint list.

### Health

```
GET /api/health
→ 200 { status: "ok", version: "0.1.0" }
```

### Fixtures (Phase 2)

```
GET  /api/fixtures            list library (query: ?type=&manufacturer=)
GET  /api/fixtures/:id        fixture definition detail
```

### Patch (Phase 2)

```
GET    /api/patch             list patched fixtures
POST   /api/patch             add fixture to patch
PATCH  /api/patch/:id         edit label / address / mode
DELETE /api/patch/:id         remove from patch
```

### Cue Lists (Phase 4)

```
GET    /api/cueLists
POST   /api/cueLists
GET    /api/cueLists/:id
DELETE /api/cueLists/:id
POST   /api/cueLists/:id/cues          record cue
PATCH  /api/cueLists/:id/cues/:cueId   edit timing/label
DELETE /api/cueLists/:id/cues/:cueId
POST   /api/cueLists/:id/go
POST   /api/cueLists/:id/back
POST   /api/cueLists/:id/pause
```

### Chases (Phase 5)

```
GET    /api/chases
POST   /api/chases
PATCH  /api/chases/:id
DELETE /api/chases/:id
POST   /api/chases/:id/play
POST   /api/chases/:id/stop
```

### Shapes (Phase 6)

```
GET    /api/shapes
POST   /api/shapes
PATCH  /api/shapes/:id
DELETE /api/shapes/:id
```

### Agent (Phase 8)

```
GET  /api/agent/state         full show JSON
GET  /api/agent/output        current DMX output (per universe)
GET  /api/agent/programmer    active programmer values
POST /api/agent/command       { action, payload } — see agent.md
GET  /api/docs                Swagger UI
GET  /api/docs/json           OpenAPI 3.0 spec JSON
```

---

## WebSocket Events

Connect to `ws://localhost:3000` (Socket.io).

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `agent:subscribe` | — | Subscribe to all state updates |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `state:update` | `{ changed: string[] }` | Show state changed |
| `dmx:tick` | `{ universe: number, data: number[] }` | DMX output snapshot |
| `cue:active` | `{ cueListId, cueId, cueNumber }` | Cue became active |
| `chase:step` | `{ chaseId, stepIndex }` | Chase advanced to step |
| `patch:changed` | — | Patch was modified |
