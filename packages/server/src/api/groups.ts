import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { show, touchShow } from '../store/show.js';

export const groupsRouter = Router();

groupsRouter.get('/', (_req, res) => {
  res.json(show.fixtureGroups);
});

const CreateSchema = z.object({
  label: z.string().min(1),
  fixtureIds: z.array(z.string()).optional(),
});

groupsRouter.post('/', (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }
  const group = {
    id: uuid(),
    label: parsed.data.label,
    fixtureIds: parsed.data.fixtureIds ?? [],
  };
  show.fixtureGroups.push(group);
  touchShow();
  res.status(201).json(group);
});

const UpdateSchema = z.object({
  label: z.string().min(1).optional(),
  fixtureIds: z.array(z.string()).optional(),
});

groupsRouter.patch('/:id', (req, res) => {
  const group = show.fixtureGroups.find((g) => g.id === req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }
  if (parsed.data.label !== undefined) group.label = parsed.data.label;
  if (parsed.data.fixtureIds !== undefined) group.fixtureIds = parsed.data.fixtureIds;
  touchShow();
  res.json(group);
});

groupsRouter.delete('/:id', (req, res) => {
  const idx = show.fixtureGroups.findIndex((g) => g.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  show.fixtureGroups.splice(idx, 1);
  touchShow();
  res.json({ ok: true });
});
