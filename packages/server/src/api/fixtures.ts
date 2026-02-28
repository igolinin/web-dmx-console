import { Router } from 'express';
import { z } from 'zod';
import type { FixtureType } from '@dmx-console/shared';
import { getFixtureDef, queryFixtures } from '../fixtures/loader.js';

export const fixturesRouter = Router();

const FIXTURE_TYPES: FixtureType[] = [
  'Dimmer',
  'Color Changer',
  'Moving Head',
  'Scanner',
  'LED Bar (Beams)',
  'LED Bar (Pixels)',
  'Strobe',
  'Effect',
  'Other',
];

const QuerySchema = z.object({
  type: z.enum(FIXTURE_TYPES as [FixtureType, ...FixtureType[]]).optional(),
  manufacturer: z.string().optional(),
  search: z.string().optional(),
});

/** GET /api/fixtures — list fixture library */
fixturesRouter.get('/', (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.issues });
    return;
  }

  const { type, manufacturer, search } = parsed.data;
  const fixtures = queryFixtures({
    ...(type !== undefined && { type }),
    ...(manufacturer !== undefined && { manufacturer }),
    ...(search !== undefined && { search }),
  });
  res.json(fixtures);
});

/** GET /api/fixtures/:id — single fixture definition */
fixturesRouter.get('/:id', (req, res) => {
  const def = getFixtureDef(req.params.id ?? '');
  if (!def) {
    res.status(404).json({ error: 'Fixture not found' });
    return;
  }
  res.json(def);
});
