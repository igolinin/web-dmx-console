import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Cue, CueList, FixtureValues } from '@dmx-console/shared';
import { show, touchShow } from '../store/show.js';
import { programmer } from '../store/programmer.js';
import { playbackEngine } from '../store/playback.js';

export const cueListsRouter = Router();

// ── Cue list CRUD ─────────────────────────────────────────────────────────────

cueListsRouter.get('/', (_req, res) => {
  res.json(
    show.cueLists.map((cl) => ({
      ...cl,
      playback: playbackEngine.getState(cl.id),
    })),
  );
});

cueListsRouter.get('/:id', (req, res) => {
  const cl = show.cueLists.find((c) => c.id === req.params.id);
  if (!cl) {
    res.status(404).json({ error: 'Cue list not found' });
    return;
  }
  res.json({ ...cl, playback: playbackEngine.getState(cl.id) });
});

cueListsRouter.post('/', (req, res) => {
  const parsed = z.object({ label: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  const cueList: CueList = { id: uuidv4(), label: parsed.data.label, cues: [] };
  show.cueLists.push(cueList);
  touchShow();
  res.status(201).json(cueList);
});

cueListsRouter.delete('/:id', (req, res) => {
  const idx = show.cueLists.findIndex((cl) => cl.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Cue list not found' });
    return;
  }
  const [removed] = show.cueLists.splice(idx, 1);
  playbackEngine.release(req.params.id);
  touchShow();
  res.json(removed);
});

// ── Cue CRUD ──────────────────────────────────────────────────────────────────

const CueTimingSchema = z.object({
  fadeIn: z.number().min(0).default(2),
  fadeOut: z.number().min(0).default(2),
  delay: z.number().min(0).default(0),
  follow: z.number().min(0).optional(),
});

const RecordCueSchema = z.object({
  number: z.number().optional(),
  label: z.string().optional(),
  timing: CueTimingSchema.optional(),
});

/** POST /api/cueLists/:id/cues — record cue from current programmer state */
cueListsRouter.post('/:id/cues', (req, res) => {
  const cueList = show.cueLists.find((cl) => cl.id === req.params.id);
  if (!cueList) {
    res.status(404).json({ error: 'Cue list not found' });
    return;
  }

  const parsed = RecordCueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  const snap = programmer.snapshot();
  const cueNumber = parsed.data.number ?? cueList.cues.length + 1;
  const values: FixtureValues[] = snap.map(({ fixtureId, channels }) => ({
    fixtureId,
    channels: { ...channels },
  }));

  const timing = parsed.data.timing;
  const cue: Cue = {
    id: uuidv4(),
    number: cueNumber,
    label: parsed.data.label ?? `Cue ${cueNumber}`,
    values,
    timing: {
      fadeIn: timing?.fadeIn ?? 2,
      fadeOut: timing?.fadeOut ?? 2,
      delay: timing?.delay ?? 0,
      ...(timing?.follow !== undefined && { follow: timing.follow }),
    },
  };

  cueList.cues.push(cue);
  cueList.cues.sort((a, b) => a.number - b.number);
  touchShow();
  res.status(201).json(cue);
});

const UpdateCueSchema = z.object({
  label: z.string().optional(),
  number: z.number().optional(),
  timing: CueTimingSchema.partial().optional(),
});

/** PATCH /api/cueLists/:id/cues/:cueId — update label/number/timing */
cueListsRouter.patch('/:id/cues/:cueId', (req, res) => {
  const cueList = show.cueLists.find((cl) => cl.id === req.params.id);
  if (!cueList) {
    res.status(404).json({ error: 'Cue list not found' });
    return;
  }
  const cue = cueList.cues.find((c) => c.id === req.params.cueId);
  if (!cue) {
    res.status(404).json({ error: 'Cue not found' });
    return;
  }

  const parsed = UpdateCueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  if (parsed.data.label !== undefined) cue.label = parsed.data.label;
  if (parsed.data.number !== undefined) {
    cue.number = parsed.data.number;
    cueList.cues.sort((a, b) => a.number - b.number);
  }
  if (parsed.data.timing) Object.assign(cue.timing, parsed.data.timing);
  touchShow();
  res.json(cue);
});

/** DELETE /api/cueLists/:id/cues/:cueId */
cueListsRouter.delete('/:id/cues/:cueId', (req, res) => {
  const cueList = show.cueLists.find((cl) => cl.id === req.params.id);
  if (!cueList) {
    res.status(404).json({ error: 'Cue list not found' });
    return;
  }
  const idx = cueList.cues.findIndex((c) => c.id === req.params.cueId);
  if (idx === -1) {
    res.status(404).json({ error: 'Cue not found' });
    return;
  }
  const [removed] = cueList.cues.splice(idx, 1);
  touchShow();
  res.json(removed);
});

// ── Playback controls ─────────────────────────────────────────────────────────

cueListsRouter.post('/:id/go', (req, res) => {
  const cueList = show.cueLists.find((cl) => cl.id === req.params.id);
  if (!cueList) {
    res.status(404).json({ error: 'Cue list not found' });
    return;
  }
  playbackEngine.go(cueList);
  res.json(playbackEngine.getState(cueList.id));
});

cueListsRouter.post('/:id/back', (req, res) => {
  const cueList = show.cueLists.find((cl) => cl.id === req.params.id);
  if (!cueList) {
    res.status(404).json({ error: 'Cue list not found' });
    return;
  }
  playbackEngine.back(cueList);
  res.json(playbackEngine.getState(cueList.id));
});

cueListsRouter.post('/:id/pause', (req, res) => {
  playbackEngine.pause(req.params.id);
  res.json(playbackEngine.getState(req.params.id));
});

cueListsRouter.post('/:id/release', (req, res) => {
  playbackEngine.release(req.params.id);
  res.json({ released: true });
});
