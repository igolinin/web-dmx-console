import { Router } from 'express';
import { z } from 'zod';
import { programmer } from '../store/programmer.js';
import { show, touchShow } from '../store/show.js';

export const programmerRouter = Router();

/** GET /api/programmer — current programmer state */
programmerRouter.get('/', (_req, res) => {
  res.json({ fixtures: programmer.snapshot() });
});

const SetSchema = z.object({
  fixtureId: z.string().min(1),
  channels: z.record(z.string(), z.number().int().min(0).max(255)),
});

/** POST /api/programmer/set — set channel values for a single fixture */
programmerRouter.post('/set', (req, res) => {
  const parsed = SetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }
  programmer.set(parsed.data.fixtureId, parsed.data.channels);
  res.json({ ok: true });
});

/** POST /api/programmer/setMany — set channel values for multiple fixtures at once */
programmerRouter.post('/setMany', (req, res) => {
  const parsed = z.array(SetSchema).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }
  for (const { fixtureId, channels } of parsed.data) {
    programmer.set(fixtureId, channels);
  }
  res.json({ ok: true });
});

/** POST /api/programmer/clear — clear programmer (all, or just one fixture) */
programmerRouter.post('/clear', (req, res) => {
  const parsed = z.object({ fixtureId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }
  const { fixtureId } = parsed.data;
  programmer.clear(fixtureId);

  // Shapes are live programmer effects (they oscillate around programmer values),
  // so clearing the programmer also removes the shapes built on it.
  if (fixtureId === undefined) {
    if (show.shapes.length > 0) {
      show.shapes = [];
      touchShow();
    }
  } else {
    const before = show.shapes.length;
    show.shapes = show.shapes
      .map((s) => ({ ...s, fixtureIds: s.fixtureIds.filter((id) => id !== fixtureId) }))
      .filter((s) => s.fixtureIds.length > 0);
    if (show.shapes.length !== before) touchShow();
  }

  res.json({ ok: true });
});
