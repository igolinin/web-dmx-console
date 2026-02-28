import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { ShapeLayer } from '@dmx-console/shared';
import { show, touchShow } from '../store/show.js';

export const shapesRouter = Router();

const WaveformSchema = z.enum(['sine', 'cosine', 'triangle', 'square', 'ramp', 'random']);
const TargetSchema = z.enum([
  'pan',
  'tilt',
  'dimmer',
  'red',
  'green',
  'blue',
  'white',
  'amber',
  'zoom',
  'focus',
]);
const Shape2dSchema = z.enum(['circle', 'figure8', 'lissajous']);
const PixelTextureSchema = z.enum(['rainbow', 'gradient', 'chase', 'fire']);

const ShapeLayerBodySchema = z.object({
  label: z.string().min(1),
  waveform: WaveformSchema.optional(),
  target: TargetSchema.optional(),
  shape2d: Shape2dSchema.optional(),
  xTarget: TargetSchema.optional(),
  yTarget: TargetSchema.optional(),
  lissajousRatio: z.tuple([z.number(), z.number()]).optional(),
  pixelTexture: PixelTextureSchema.optional(),
  fixtureIds: z.array(z.string()).default([]),
  speed: z.number().min(0).max(100).default(1),
  size: z.number().min(0).max(255).default(128),
  center: z.number().min(0).max(255).default(128),
  spread: z.number().min(0).max(360).default(0),
  phaseOffset: z.number().min(0).max(360).default(0),
  active: z.boolean().default(false),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Interface that explicitly allows undefined for optional fields (compatible with Zod inferred output)
interface ShapePatchData {
  label?: string | undefined;
  active?: boolean | undefined;
  fixtureIds?: string[] | undefined;
  speed?: number | undefined;
  size?: number | undefined;
  center?: number | undefined;
  spread?: number | undefined;
  phaseOffset?: number | undefined;
  waveform?: z.infer<typeof WaveformSchema> | undefined;
  target?: z.infer<typeof TargetSchema> | undefined;
  shape2d?: z.infer<typeof Shape2dSchema> | undefined;
  xTarget?: z.infer<typeof TargetSchema> | undefined;
  yTarget?: z.infer<typeof TargetSchema> | undefined;
  lissajousRatio?: [number, number] | undefined;
  pixelTexture?: z.infer<typeof PixelTextureSchema> | undefined;
}

/** Apply a parsed patch update to an existing ShapeLayer (skips undefined fields). */
function applyPatch(shape: ShapeLayer, data: ShapePatchData): void {
  if (data.label !== undefined) shape.label = data.label;
  if (data.active !== undefined) shape.active = data.active;
  if (data.fixtureIds !== undefined) shape.fixtureIds = data.fixtureIds;
  if (data.speed !== undefined) shape.speed = data.speed;
  if (data.size !== undefined) shape.size = data.size;
  if (data.center !== undefined) shape.center = data.center;
  if (data.spread !== undefined) shape.spread = data.spread;
  if (data.phaseOffset !== undefined) shape.phaseOffset = data.phaseOffset;

  // Optional fields: only set when present; delete when explicitly set to undefined
  if ('waveform' in data) {
    if (data.waveform !== undefined) shape.waveform = data.waveform;
    else delete shape.waveform;
  }
  if ('target' in data) {
    if (data.target !== undefined) shape.target = data.target;
    else delete shape.target;
  }
  if ('shape2d' in data) {
    if (data.shape2d !== undefined) shape.shape2d = data.shape2d;
    else delete shape.shape2d;
  }
  if ('xTarget' in data) {
    if (data.xTarget !== undefined) shape.xTarget = data.xTarget;
    else delete shape.xTarget;
  }
  if ('yTarget' in data) {
    if (data.yTarget !== undefined) shape.yTarget = data.yTarget;
    else delete shape.yTarget;
  }
  if ('lissajousRatio' in data) {
    if (data.lissajousRatio !== undefined) shape.lissajousRatio = data.lissajousRatio;
    else delete shape.lissajousRatio;
  }
  if ('pixelTexture' in data) {
    if (data.pixelTexture !== undefined) shape.pixelTexture = data.pixelTexture;
    else delete shape.pixelTexture;
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

shapesRouter.get('/', (_req, res) => {
  res.json(show.shapes);
});

shapesRouter.get('/:id', (req, res) => {
  const shape = show.shapes.find((s) => s.id === req.params.id);
  if (!shape) {
    res.status(404).json({ error: 'Shape not found' });
    return;
  }
  res.json(shape);
});

shapesRouter.post('/', (req, res) => {
  const parsed = ShapeLayerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  const { label, fixtureIds, speed, size, center, spread, phaseOffset, active } = parsed.data;
  const shape: ShapeLayer = {
    id: uuidv4(),
    label,
    fixtureIds,
    speed,
    size,
    center,
    spread,
    phaseOffset,
    active,
  };
  applyPatch(shape, parsed.data as ShapePatchData);
  show.shapes.push(shape);
  touchShow();
  res.status(201).json(shape);
});

shapesRouter.patch('/:id', (req, res) => {
  const shape = show.shapes.find((s) => s.id === req.params.id);
  if (!shape) {
    res.status(404).json({ error: 'Shape not found' });
    return;
  }

  const parsed = ShapeLayerBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  applyPatch(shape, parsed.data as ShapePatchData);
  touchShow();
  res.json(shape);
});

shapesRouter.delete('/:id', (req, res) => {
  const idx = show.shapes.findIndex((s) => s.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Shape not found' });
    return;
  }
  const [removed] = show.shapes.splice(idx, 1);
  touchShow();
  res.json(removed);
});
