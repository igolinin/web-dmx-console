import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ArtNetSender } from './artnet/sender.js';
import { UniverseBuffer } from './artnet/universe.js';
import type { Show, WsDmxTick } from '@dmx-console/shared';

const PORT = 3000;
const DMX_REFRESH_HZ = 30;

// ── In-memory show state ────────────────────────────────────────────────────

const universeBuffer = new UniverseBuffer();

const show: Show = {
  version: '1',
  meta: {
    title: 'Untitled Show',
    author: '',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  },
  fixtures: [],
  fixtureGroups: [],
  cueLists: [],
  chases: [],
  shapes: [],
  artnet: {
    host: '255.255.255.255',
    broadcast: true,
    refreshHz: DMX_REFRESH_HZ,
    universes: [0],
  },
};

// ── Express + Socket.io setup ───────────────────────────────────────────────

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// ── REST endpoints ──────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: show.version });
});

app.get('/api/state', (_req, res) => {
  res.json(show);
});

// ── WebSocket ───────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[ws] client connected:', socket.id);

  socket.on('agent:subscribe', () => {
    void socket.join('agents');
  });

  socket.on('disconnect', () => {
    console.log('[ws] client disconnected:', socket.id);
  });
});

// ── Art-Net output loop ─────────────────────────────────────────────────────

let artnetSender: ArtNetSender | null = null;

function startArtNet(): void {
  artnetSender = new ArtNetSender({
    host: show.artnet.host,
    broadcast: show.artnet.broadcast,
  });

  const intervalMs = Math.floor(1000 / show.artnet.refreshHz);

  setInterval(() => {
    for (const universe of show.artnet.universes) {
      const buf = universeBuffer.get(universe);
      artnetSender!.send(universe, buf);

      const tick: WsDmxTick = { universe, data: Array.from(buf) };
      io.emit('dmx:tick', tick);
    }
  }, intervalMs);

  console.log(`[artnet] sending to ${show.artnet.host} @ ${show.artnet.refreshHz}Hz`);
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  startArtNet();
});

export { app, io, show, universeBuffer };
