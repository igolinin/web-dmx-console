import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Chase, ChaseStep, FixtureValues } from '@dmx-console/shared';
import { show, touchShow } from '../store/show.js';
import { programmer } from '../store/programmer.js';
import { chaseEngine } from '../store/chaseEngine.js';

export const chasesRouter = Router();

const DirectionSchema = z.enum(['forward', 'backward', 'bounce', 'random']);

// ── Chase CRUD ────────────────────────────────────────────────────────────────

chasesRouter.get('/', (_req, res) => {
  res.json(
    show.chases.map((c) => ({
      ...c,
      running: chaseEngine.isRunning(c.id),
      currentStepIndex: chaseEngine.getStepIndex(c.id),
    })),
  );
});

chasesRouter.get('/:id', (req, res) => {
  const chase = show.chases.find((c) => c.id === req.params.id);
  if (!chase) {
    res.status(404).json({ error: 'Chase not found' });
    return;
  }
  res.json({
    ...chase,
    running: chaseEngine.isRunning(chase.id),
    currentStepIndex: chaseEngine.getStepIndex(chase.id),
  });
});

chasesRouter.post('/', (req, res) => {
  const parsed = z
    .object({
      label: z.string().min(1),
      direction: DirectionSchema.default('forward'),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  const chase: Chase = {
    id: uuidv4(),
    label: parsed.data.label,
    steps: [],
    direction: parsed.data.direction,
  };
  show.chases.push(chase);
  touchShow();
  res.status(201).json(chase);
});

chasesRouter.patch('/:id', (req, res) => {
  const chase = show.chases.find((c) => c.id === req.params.id);
  if (!chase) {
    res.status(404).json({ error: 'Chase not found' });
    return;
  }

  const parsed = z
    .object({
      label: z.string().optional(),
      direction: DirectionSchema.optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  if (parsed.data.label !== undefined) chase.label = parsed.data.label;
  if (parsed.data.direction !== undefined) chase.direction = parsed.data.direction;
  touchShow();
  res.json(chase);
});

chasesRouter.delete('/:id', (req, res) => {
  const idx = show.chases.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Chase not found' });
    return;
  }
  const [removed] = show.chases.splice(idx, 1);
  chaseEngine.stop(req.params.id);
  touchShow();
  res.json(removed);
});

// ── Step CRUD ─────────────────────────────────────────────────────────────────

/** POST /api/chases/:id/steps — record a step from current programmer state */
chasesRouter.post('/:id/steps', (req, res) => {
  const chase = show.chases.find((c) => c.id === req.params.id);
  if (!chase) {
    res.status(404).json({ error: 'Chase not found' });
    return;
  }

  const snap = programmer.snapshot();
  const values: FixtureValues[] = snap.map(({ fixtureId, channels }) => ({
    fixtureId,
    channels: { ...channels },
  }));

  const step: ChaseStep = {
    id: uuidv4(),
    values,
    timing: { fadeIn: 0, fadeOut: 0, delay: 0 },
  };
  chase.steps.push(step);
  touchShow();
  res.status(201).json(step);
});

chasesRouter.delete('/:id/steps/:stepId', (req, res) => {
  const chase = show.chases.find((c) => c.id === req.params.id);
  if (!chase) {
    res.status(404).json({ error: 'Chase not found' });
    return;
  }
  const idx = chase.steps.findIndex((s) => s.id === req.params.stepId);
  if (idx === -1) {
    res.status(404).json({ error: 'Step not found' });
    return;
  }
  const [removed] = chase.steps.splice(idx, 1);
  touchShow();
  res.json(removed);
});

// ── Playback ──────────────────────────────────────────────────────────────────

chasesRouter.post('/:id/play', (req, res) => {
  const chase = show.chases.find((c) => c.id === req.params.id);
  if (!chase) {
    res.status(404).json({ error: 'Chase not found' });
    return;
  }
  if (chase.steps.length === 0) {
    res.status(400).json({ error: 'Chase has no steps' });
    return;
  }
  chaseEngine.play(chase, Date.now());
  res.json({ running: true, currentStepIndex: chaseEngine.getStepIndex(chase.id) });
});

chasesRouter.post('/:id/stop', (req, res) => {
  chaseEngine.stop(req.params.id);
  res.json({ running: false });
});
