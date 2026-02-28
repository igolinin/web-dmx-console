import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { PatchedFixture } from '@dmx-console/shared';
import { show, touchShow } from '../store/show.js';
import { getFixtureDef } from '../fixtures/loader.js';
import { checkConflicts } from '../engine/conflict.js';

export const patchRouter = Router();

const AddPatchSchema = z.object({
  defId: z.string().min(1),
  universe: z.number().int().min(0).max(32767),
  address: z.number().int().min(1).max(512),
  label: z.string().optional(),
  modeIndex: z.number().int().min(0).default(0),
});

const UpdatePatchSchema = z.object({
  universe: z.number().int().min(0).max(32767).optional(),
  address: z.number().int().min(1).max(512).optional(),
  label: z.string().optional(),
  modeIndex: z.number().int().min(0).optional(),
  stageX: z.number().min(0).max(1).optional(),
  stageY: z.number().min(0).max(1).optional(),
});

/** GET /api/patch — list all patched fixtures */
patchRouter.get('/', (_req, res) => {
  res.json(show.fixtures);
});

/** POST /api/patch — add a fixture to the patch */
patchRouter.post('/', (req, res) => {
  const parsed = AddPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  const { defId, universe, address, modeIndex } = parsed.data;

  const def = getFixtureDef(defId);
  if (!def) {
    res.status(404).json({ error: `Fixture definition '${defId}' not found` });
    return;
  }

  if (modeIndex >= def.modes.length) {
    res.status(400).json({
      error: `Mode index ${modeIndex} out of range (fixture has ${def.modes.length} modes)`,
    });
    return;
  }

  const fixture: PatchedFixture = {
    id: uuidv4(),
    defId,
    universe,
    address,
    label: parsed.data.label ?? `${def.model} ${show.fixtures.length + 1}`,
    modeIndex,
    groupIds: [],
  };

  // Conflict check
  const conflict = checkConflicts(fixture, show.fixtures);
  if (conflict.hasConflict) {
    res.status(409).json({
      error: 'DMX address conflict',
      conflicts: conflict.conflicts,
    });
    return;
  }

  show.fixtures.push(fixture);
  touchShow();
  res.status(201).json(fixture);
});

/** PATCH /api/patch/:id — update a patched fixture */
patchRouter.patch('/:id', (req, res) => {
  const fixture = show.fixtures.find((f) => f.id === req.params.id);
  if (!fixture) {
    res.status(404).json({ error: 'Fixture not found in patch' });
    return;
  }

  const parsed = UpdatePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  const updates = parsed.data;

  // Build the candidate with updates applied
  const candidate: PatchedFixture = {
    ...fixture,
    ...(updates.universe !== undefined && { universe: updates.universe }),
    ...(updates.address !== undefined && { address: updates.address }),
    ...(updates.label !== undefined && { label: updates.label }),
    ...(updates.modeIndex !== undefined && { modeIndex: updates.modeIndex }),
    ...(updates.stageX !== undefined && { stageX: updates.stageX }),
    ...(updates.stageY !== undefined && { stageY: updates.stageY }),
  };

  // Conflict check (excluding this fixture itself)
  if (
    updates.universe !== undefined ||
    updates.address !== undefined ||
    updates.modeIndex !== undefined
  ) {
    const conflict = checkConflicts(candidate, show.fixtures, fixture.id);
    if (conflict.hasConflict) {
      res.status(409).json({
        error: 'DMX address conflict',
        conflicts: conflict.conflicts,
      });
      return;
    }
  }

  Object.assign(fixture, updates);
  touchShow();
  res.json(fixture);
});

/** DELETE /api/patch/:id — remove a fixture from the patch */
patchRouter.delete('/:id', (req, res) => {
  const idx = show.fixtures.findIndex((f) => f.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Fixture not found in patch' });
    return;
  }

  const [removed] = show.fixtures.splice(idx, 1);
  touchShow();
  res.json(removed);
});
