import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ArtNetSender } from './artnet/sender.js';
import { UniverseBuffer } from './artnet/universe.js';
import { show } from './store/show.js';
import { programmer } from './store/programmer.js';
import { loadFixtureLibrary } from './fixtures/loader.js';
import { mergeToBuffer } from './engine/merger.js';
import { fixturesRouter } from './api/fixtures.js';
import { patchRouter } from './api/patch.js';
import { programmerRouter } from './api/programmer.js';
import type { WsDmxTick } from '@dmx-console/shared';

const PORT = 3000;

// ── Shared state ─────────────────────────────────────────────────────────────

export const universeBuffer = new UniverseBuffer();

// ── Express + Socket.io setup ─────────────────────────────────────────────────

const app = express();
app.use(express.json());

const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// ── REST routes ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: show.version });
});

app.get('/api/state', (_req, res) => {
  res.json(show);
});

app.use('/api/fixtures', fixturesRouter);
app.use('/api/patch', patchRouter);
app.use('/api/programmer', programmerRouter);

// ── WebSocket ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[ws] client connected:', socket.id);

  socket.on('agent:subscribe', () => {
    void socket.join('agents');
  });

  socket.on('disconnect', () => {
    console.log('[ws] client disconnected:', socket.id);
  });
});

// ── Art-Net output loop ───────────────────────────────────────────────────────

let artnetSender: ArtNetSender | null = null;

function startArtNet(): void {
  artnetSender = new ArtNetSender({
    host: show.artnet.host,
    broadcast: show.artnet.broadcast,
  });

  const intervalMs = Math.floor(1000 / show.artnet.refreshHz);

  setInterval(() => {
    // Re-merge programmer + cue values into the universe buffer each tick
    mergeToBuffer(show.fixtures, new Map(), programmer.values, universeBuffer);

    // Determine which universes to emit: configured + any with patched fixtures
    const universesToSend = new Set([
      ...show.artnet.universes,
      ...show.fixtures.map((f) => f.universe),
    ]);

    for (const universe of universesToSend) {
      const buf = universeBuffer.get(universe);
      artnetSender!.send(universe, buf);

      const tick: WsDmxTick = { universe, data: Array.from(buf) };
      io.emit('dmx:tick', tick);
    }
  }, intervalMs);

  console.log(`[artnet] sending to ${show.artnet.host} @ ${show.artnet.refreshHz}Hz`);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await loadFixtureLibrary();

  httpServer.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    startArtNet();
  });
}

void bootstrap();

export { show };
