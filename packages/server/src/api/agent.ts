import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Chase, ChaseStep, Cue, FixtureValues, ShapeLayer } from '@dmx-console/shared';
import { show, touchShow } from '../store/show.js';
import { programmer } from '../store/programmer.js';
import { playbackEngine } from '../store/playback.js';
import { chaseEngine } from '../store/chaseEngine.js';
import { getFixtureDef } from '../fixtures/loader.js';
import { checkConflicts } from '../engine/conflict.js';
import type { UniverseBuffer } from '../artnet/universe.js';

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const ChannelValuesSchema = z.record(z.string(), z.number().int().min(0).max(255));

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

const WaveformSchema = z.enum(['sine', 'cosine', 'triangle', 'square', 'ramp', 'random']);
const Shape2dSchema = z.enum(['circle', 'figure8', 'lissajous']);
const PixelTextureSchema = z.enum(['rainbow', 'gradient', 'chase', 'fire']);
const DirectionSchema = z.enum(['forward', 'backward', 'bounce', 'random']);

const CueTimingSchema = z.object({
  fadeIn: z.number().min(0).default(2),
  fadeOut: z.number().min(0).default(2),
  delay: z.number().min(0).default(0),
  follow: z.number().min(0).optional(),
});

const FixtureValuesSchema = z.object({
  fixtureId: z.string(),
  channels: ChannelValuesSchema,
});

const ChaseStepSchema = z.object({
  values: z.array(FixtureValuesSchema).default([]),
  timing: CueTimingSchema.optional(),
});

// ── Command discriminated union ───────────────────────────────────────────────

const CommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('programmer.set'),
    payload: z.object({
      fixtureId: z.string().min(1),
      channels: ChannelValuesSchema,
    }),
  }),
  z.object({
    action: z.literal('programmer.setGroup'),
    payload: z.object({
      groupId: z.string().min(1),
      channels: ChannelValuesSchema,
    }),
  }),
  z.object({
    action: z.literal('programmer.clear'),
    payload: z.object({ fixtureId: z.string().optional() }).optional(),
  }),
  z.object({
    action: z.literal('cue.record'),
    payload: z.object({
      cueListId: z.string().min(1),
      number: z.number().optional(),
      label: z.string().optional(),
      timing: CueTimingSchema.optional(),
    }),
  }),
  z.object({
    action: z.literal('cue.go'),
    payload: z.object({ cueListId: z.string().min(1) }),
  }),
  z.object({
    action: z.literal('cue.back'),
    payload: z.object({ cueListId: z.string().min(1) }),
  }),
  z.object({
    action: z.literal('cue.pause'),
    payload: z.object({ cueListId: z.string().min(1) }),
  }),
  z.object({
    action: z.literal('chase.create'),
    payload: z.object({
      label: z.string().min(1),
      bpm: z.number().min(1).max(10000).default(120),
      direction: DirectionSchema.default('forward'),
      steps: z.array(ChaseStepSchema).default([]),
    }),
  }),
  z.object({
    action: z.literal('chase.play'),
    payload: z.object({ chaseId: z.string().min(1) }),
  }),
  z.object({
    action: z.literal('chase.stop'),
    payload: z.object({ chaseId: z.string().min(1) }),
  }),
  z.object({
    action: z.literal('shape.create'),
    payload: z.object({
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
    }),
  }),
  z.object({
    action: z.literal('shape.update'),
    payload: z.object({
      shapeId: z.string().min(1),
      active: z.boolean().optional(),
      speed: z.number().min(0).max(100).optional(),
      size: z.number().min(0).max(255).optional(),
      center: z.number().min(0).max(255).optional(),
      spread: z.number().min(0).max(360).optional(),
    }),
  }),
  z.object({
    action: z.literal('shape.delete'),
    payload: z.object({ shapeId: z.string().min(1) }),
  }),
  z.object({
    action: z.literal('patch.add'),
    payload: z.object({
      defId: z.string().min(1),
      universe: z.number().int().min(0).max(32767),
      address: z.number().int().min(1).max(512),
      label: z.string().optional(),
      modeIndex: z.number().int().min(0).default(0),
    }),
  }),
  z.object({
    action: z.literal('patch.remove'),
    payload: z.object({ fixtureId: z.string().min(1) }),
  }),
]);

// ── Router factory ────────────────────────────────────────────────────────────

export function createAgentRouter(universeBuffer: UniverseBuffer): Router {
  const router = Router();

  // ── State queries ───────────────────────────────────────────────────────────

  /** GET /api/agent/state — full show JSON */
  router.get('/state', (_req, res) => {
    res.json(show);
  });

  /** GET /api/agent/output — current DMX output snapshot */
  router.get('/output', (_req, res) => {
    const universes = new Set([...show.artnet.universes, ...show.fixtures.map((f) => f.universe)]);
    const output: Record<number, number[]> = {};
    for (const u of universes) {
      output[u] = Array.from(universeBuffer.get(u));
    }
    res.json(output);
  });

  /** GET /api/agent/programmer — active programmer values */
  router.get('/programmer', (_req, res) => {
    res.json({ fixtures: programmer.snapshot() });
  });

  // ── Rate limiter ────────────────────────────────────────────────────────────

  const commandLimiter = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests', code: 'RATE_LIMITED' },
  });

  // ── Command bus ─────────────────────────────────────────────────────────────

  router.post('/command', commandLimiter, (req, res) => {
    const parsed = CommandSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      res.status(400).json({
        error: 'Invalid command',
        code: 'INVALID_PAYLOAD',
        field: first?.path.join('.') ?? null,
        details: parsed.error.issues,
      });
      return;
    }

    const cmd = parsed.data;

    switch (cmd.action) {
      // ── Programmer ──────────────────────────────────────────────────────────

      case 'programmer.set': {
        const fixture = show.fixtures.find((f) => f.id === cmd.payload.fixtureId);
        if (!fixture) {
          res
            .status(404)
            .json({ error: 'Fixture not found', code: 'NOT_FOUND', field: 'fixtureId' });
          return;
        }
        programmer.set(cmd.payload.fixtureId, cmd.payload.channels);
        res.json({ ok: true, programmer: programmer.snapshot() });
        return;
      }

      case 'programmer.setGroup': {
        const group = show.fixtureGroups.find((g) => g.id === cmd.payload.groupId);
        if (!group) {
          res.status(404).json({ error: 'Group not found', code: 'NOT_FOUND', field: 'groupId' });
          return;
        }
        for (const fid of group.fixtureIds) {
          programmer.set(fid, cmd.payload.channels);
        }
        res.json({ ok: true, programmer: programmer.snapshot() });
        return;
      }

      case 'programmer.clear': {
        programmer.clear(cmd.payload?.fixtureId);
        res.json({ ok: true });
        return;
      }

      // ── Cue lists ───────────────────────────────────────────────────────────

      case 'cue.record': {
        const cueList = show.cueLists.find((cl) => cl.id === cmd.payload.cueListId);
        if (!cueList) {
          res
            .status(404)
            .json({ error: 'Cue list not found', code: 'NOT_FOUND', field: 'cueListId' });
          return;
        }
        const snap = programmer.snapshot();
        const cueNumber = cmd.payload.number ?? cueList.cues.length + 1;
        const values: FixtureValues[] = snap.map(({ fixtureId, channels }) => ({
          fixtureId,
          channels: { ...channels },
        }));
        const timing = cmd.payload.timing;
        const cue: Cue = {
          id: uuidv4(),
          number: cueNumber,
          label: cmd.payload.label ?? `Cue ${cueNumber}`,
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
        return;
      }

      case 'cue.go': {
        const cueList = show.cueLists.find((cl) => cl.id === cmd.payload.cueListId);
        if (!cueList) {
          res
            .status(404)
            .json({ error: 'Cue list not found', code: 'NOT_FOUND', field: 'cueListId' });
          return;
        }
        playbackEngine.go(cueList);
        res.json(playbackEngine.getState(cueList.id));
        return;
      }

      case 'cue.back': {
        const cueList = show.cueLists.find((cl) => cl.id === cmd.payload.cueListId);
        if (!cueList) {
          res
            .status(404)
            .json({ error: 'Cue list not found', code: 'NOT_FOUND', field: 'cueListId' });
          return;
        }
        playbackEngine.back(cueList);
        res.json(playbackEngine.getState(cueList.id));
        return;
      }

      case 'cue.pause': {
        playbackEngine.pause(cmd.payload.cueListId);
        res.json(playbackEngine.getState(cmd.payload.cueListId));
        return;
      }

      // ── Chases ──────────────────────────────────────────────────────────────

      case 'chase.create': {
        const steps: ChaseStep[] = cmd.payload.steps.map((s) => ({
          id: uuidv4(),
          values: s.values as FixtureValues[],
          timing: {
            fadeIn: s.timing?.fadeIn ?? 0,
            fadeOut: s.timing?.fadeOut ?? 0,
            delay: s.timing?.delay ?? 0,
          },
        }));
        const chase: Chase = {
          id: uuidv4(),
          label: cmd.payload.label,
          bpm: cmd.payload.bpm,
          direction: cmd.payload.direction,
          steps,
        };
        show.chases.push(chase);
        touchShow();
        res.status(201).json(chase);
        return;
      }

      case 'chase.play': {
        const chase = show.chases.find((c) => c.id === cmd.payload.chaseId);
        if (!chase) {
          res.status(404).json({ error: 'Chase not found', code: 'NOT_FOUND', field: 'chaseId' });
          return;
        }
        chaseEngine.play(chase, Date.now());
        res.json({ ok: true, running: true });
        return;
      }

      case 'chase.stop': {
        chaseEngine.stop(cmd.payload.chaseId);
        res.json({ ok: true, running: false });
        return;
      }

      // ── Shapes ──────────────────────────────────────────────────────────────

      case 'shape.create': {
        const p = cmd.payload;
        const shape: ShapeLayer = {
          id: uuidv4(),
          label: p.label,
          fixtureIds: p.fixtureIds,
          speed: p.speed,
          size: p.size,
          center: p.center,
          spread: p.spread,
          phaseOffset: p.phaseOffset,
          active: p.active,
          ...(p.waveform !== undefined && { waveform: p.waveform }),
          ...(p.target !== undefined && { target: p.target }),
          ...(p.shape2d !== undefined && { shape2d: p.shape2d }),
          ...(p.xTarget !== undefined && { xTarget: p.xTarget }),
          ...(p.yTarget !== undefined && { yTarget: p.yTarget }),
          ...(p.lissajousRatio !== undefined && { lissajousRatio: p.lissajousRatio }),
          ...(p.pixelTexture !== undefined && { pixelTexture: p.pixelTexture }),
        };
        show.shapes.push(shape);
        touchShow();
        res.status(201).json(shape);
        return;
      }

      case 'shape.update': {
        const shape = show.shapes.find((s) => s.id === cmd.payload.shapeId);
        if (!shape) {
          res.status(404).json({ error: 'Shape not found', code: 'NOT_FOUND', field: 'shapeId' });
          return;
        }
        const p = cmd.payload;
        if (p.active !== undefined) shape.active = p.active;
        if (p.speed !== undefined) shape.speed = p.speed;
        if (p.size !== undefined) shape.size = p.size;
        if (p.center !== undefined) shape.center = p.center;
        if (p.spread !== undefined) shape.spread = p.spread;
        touchShow();
        res.json(shape);
        return;
      }

      case 'shape.delete': {
        const idx = show.shapes.findIndex((s) => s.id === cmd.payload.shapeId);
        if (idx === -1) {
          res.status(404).json({ error: 'Shape not found', code: 'NOT_FOUND', field: 'shapeId' });
          return;
        }
        const [removed] = show.shapes.splice(idx, 1);
        touchShow();
        res.json(removed);
        return;
      }

      // ── Patch ───────────────────────────────────────────────────────────────

      case 'patch.add': {
        const p = cmd.payload;
        const def = getFixtureDef(p.defId);
        if (!def) {
          res.status(404).json({
            error: `Fixture definition '${p.defId}' not found`,
            code: 'NOT_FOUND',
            field: 'defId',
          });
          return;
        }
        if (p.modeIndex >= def.modes.length) {
          res.status(400).json({
            error: `Mode index ${p.modeIndex} out of range (fixture has ${def.modes.length} modes)`,
            code: 'INVALID_PAYLOAD',
            field: 'modeIndex',
          });
          return;
        }
        const fixture = {
          id: uuidv4(),
          defId: p.defId,
          universe: p.universe,
          address: p.address,
          label: p.label ?? `${def.model} ${show.fixtures.length + 1}`,
          modeIndex: p.modeIndex,
          groupIds: [] as string[],
        };
        const conflict = checkConflicts(fixture, show.fixtures);
        if (conflict.hasConflict) {
          res.status(409).json({
            error: 'DMX address conflict',
            code: 'CONFLICT',
            conflicts: conflict.conflicts,
          });
          return;
        }
        show.fixtures.push(fixture);
        touchShow();
        res.status(201).json(fixture);
        return;
      }

      case 'patch.remove': {
        const idx = show.fixtures.findIndex((f) => f.id === cmd.payload.fixtureId);
        if (idx === -1) {
          res
            .status(404)
            .json({ error: 'Fixture not found', code: 'NOT_FOUND', field: 'fixtureId' });
          return;
        }
        const [removed] = show.fixtures.splice(idx, 1);
        touchShow();
        res.json(removed);
        return;
      }
    }
  });

  return router;
}
