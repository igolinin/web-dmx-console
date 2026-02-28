import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAgentRouter } from '../src/api/agent.js';
import { UniverseBuffer } from '../src/artnet/universe.js';
import { show } from '../src/store/show.js';
import { programmer } from '../src/store/programmer.js';
import { loadFixtureLibrary } from '../src/fixtures/loader.js';
import { v4 as uuidv4 } from 'uuid';
import type { CueList } from '@dmx-console/shared';

// ── Test app ──────────────────────────────────────────────────────────────────

const universeBuffer = new UniverseBuffer();
const app = express();
app.use(express.json());
app.use('/api/agent', createAgentRouter(universeBuffer));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await loadFixtureLibrary();
});

beforeEach(() => {
  // Reset mutable show state
  show.fixtures = [];
  show.fixtureGroups = [];
  show.cueLists = [];
  show.chases = [];
  show.shapes = [];
  programmer.clear();
});

// ── State queries ─────────────────────────────────────────────────────────────

describe('GET /api/agent/state', () => {
  it('returns the show object', async () => {
    const res = await request(app).get('/api/agent/state');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version', '1');
    expect(res.body).toHaveProperty('fixtures');
    expect(res.body).toHaveProperty('cueLists');
  });
});

describe('GET /api/agent/programmer', () => {
  it('returns empty programmer initially', async () => {
    const res = await request(app).get('/api/agent/programmer');
    expect(res.status).toBe(200);
    expect(res.body.fixtures).toEqual([]);
  });

  it('reflects programmer state after set', () => {
    programmer.set('f1', { Dimmer: 100 });
    return request(app)
      .get('/api/agent/programmer')
      .then((res) => {
        expect(res.status).toBe(200);
        expect(res.body.fixtures).toHaveLength(1);
        expect(res.body.fixtures[0]).toMatchObject({ fixtureId: 'f1', channels: { Dimmer: 100 } });
      });
  });
});

describe('GET /api/agent/output', () => {
  it('returns DMX output snapshot', async () => {
    const res = await request(app).get('/api/agent/output');
    expect(res.status).toBe(200);
    // Universe 0 is always in show.artnet.universes
    expect(res.body).toHaveProperty('0');
    expect(res.body['0']).toHaveLength(512);
  });
});

// ── Invalid command ───────────────────────────────────────────────────────────

describe('POST /api/agent/command — validation', () => {
  it('returns 400 for unknown action', async () => {
    const res = await request(app)
      .post('/api/agent/command')
      .send({ action: 'not.real', payload: {} });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_PAYLOAD' });
  });

  it('returns 400 for missing required payload field', async () => {
    const res = await request(app)
      .post('/api/agent/command')
      .send({ action: 'programmer.set', payload: { channels: { Dimmer: 100 } } }); // missing fixtureId
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
  });

  it('returns 400 for channel value out of range', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'programmer.set',
      payload: { fixtureId: 'f1', channels: { Dimmer: 300 } }, // 300 > 255
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
  });
});

// ── programmer.set ────────────────────────────────────────────────────────────

describe('programmer.set', () => {
  it('sets channels for a patched fixture', async () => {
    show.fixtures.push({
      id: 'f-dim',
      defId: 'builtin_dimmer_1ch',
      universe: 0,
      address: 1,
      label: 'Dim',
      modeIndex: 0,
      groupIds: [],
    });

    const res = await request(app)
      .post('/api/agent/command')
      .send({ action: 'programmer.set', payload: { fixtureId: 'f-dim', channels: { Dimmer: 200 } } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(programmer.snapshot()).toContainEqual({ fixtureId: 'f-dim', channels: { Dimmer: 200 } });
  });

  it('returns 404 for unknown fixtureId', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'programmer.set',
      payload: { fixtureId: 'no-such-id', channels: { Dimmer: 100 } },
    });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', field: 'fixtureId' });
  });
});

// ── programmer.setGroup ───────────────────────────────────────────────────────

describe('programmer.setGroup', () => {
  it('sets channels for all fixtures in a group', async () => {
    show.fixtures.push(
      { id: 'f1', defId: 'builtin_dimmer_1ch', universe: 0, address: 1, label: 'F1', modeIndex: 0, groupIds: ['g1'] },
      { id: 'f2', defId: 'builtin_dimmer_1ch', universe: 0, address: 2, label: 'F2', modeIndex: 0, groupIds: ['g1'] },
    );
    show.fixtureGroups.push({ id: 'g1', label: 'Group 1', fixtureIds: ['f1', 'f2'] });

    const res = await request(app)
      .post('/api/agent/command')
      .send({ action: 'programmer.setGroup', payload: { groupId: 'g1', channels: { Dimmer: 128 } } });

    expect(res.status).toBe(200);
    const snap = programmer.snapshot();
    expect(snap.find((s) => s.fixtureId === 'f1')?.channels.Dimmer).toBe(128);
    expect(snap.find((s) => s.fixtureId === 'f2')?.channels.Dimmer).toBe(128);
  });

  it('returns 404 for unknown groupId', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'programmer.setGroup',
      payload: { groupId: 'no-group', channels: { Dimmer: 100 } },
    });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', field: 'groupId' });
  });
});

// ── programmer.clear ──────────────────────────────────────────────────────────

describe('programmer.clear', () => {
  it('clears all programmer values', async () => {
    programmer.set('f1', { Dimmer: 200 });
    programmer.set('f2', { Dimmer: 100 });

    const res = await request(app)
      .post('/api/agent/command')
      .send({ action: 'programmer.clear' });

    expect(res.status).toBe(200);
    expect(programmer.snapshot()).toHaveLength(0);
  });

  it('clears a single fixture when fixtureId is provided', async () => {
    programmer.set('f1', { Dimmer: 200 });
    programmer.set('f2', { Dimmer: 100 });

    await request(app)
      .post('/api/agent/command')
      .send({ action: 'programmer.clear', payload: { fixtureId: 'f1' } });

    const snap = programmer.snapshot();
    expect(snap.find((s) => s.fixtureId === 'f1')).toBeUndefined();
    expect(snap.find((s) => s.fixtureId === 'f2')).toBeDefined();
  });
});

// ── cue.record ────────────────────────────────────────────────────────────────

describe('cue.record', () => {
  it('records current programmer state into a cue list', async () => {
    const cueListId = uuidv4();
    const cueList: CueList = { id: cueListId, label: 'Main', cues: [] };
    show.cueLists.push(cueList);
    programmer.set('f1', { Dimmer: 255 });

    const res = await request(app).post('/api/agent/command').send({
      action: 'cue.record',
      payload: { cueListId, label: 'Warm wash', timing: { fadeIn: 2, fadeOut: 1.5, delay: 0 } },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 1, label: 'Warm wash' });
    expect(res.body.values).toHaveLength(1);
    expect(res.body.values[0].channels.Dimmer).toBe(255);
    expect(show.cueLists[0]?.cues).toHaveLength(1);
  });

  it('returns 404 for unknown cueListId', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'cue.record',
      payload: { cueListId: 'no-list' },
    });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', field: 'cueListId' });
  });
});

// ── chase.create ──────────────────────────────────────────────────────────────

describe('chase.create', () => {
  it('creates a chase with steps', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'chase.create',
      payload: {
        label: 'Color Chase',
        bpm: 120,
        direction: 'forward',
        steps: [
          { values: [{ fixtureId: 'f1', channels: { Red: 255 } }] },
          { values: [{ fixtureId: 'f1', channels: { Green: 255 } }] },
        ],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ label: 'Color Chase', bpm: 120, direction: 'forward' });
    expect(res.body.steps).toHaveLength(2);
    expect(show.chases).toHaveLength(1);
  });

  it('creates an empty chase with defaults', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'chase.create',
      payload: { label: 'Empty Chase' },
    });

    expect(res.status).toBe(201);
    expect(res.body.bpm).toBe(120);
    expect(res.body.direction).toBe('forward');
    expect(res.body.steps).toHaveLength(0);
  });
});

// ── shape.create ──────────────────────────────────────────────────────────────

describe('shape.create', () => {
  it('creates a 2D circle shape', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'shape.create',
      payload: {
        label: 'Pan Tilt Circle',
        shape2d: 'circle',
        fixtureIds: ['f1', 'f2'],
        speed: 0.5,
        size: 80,
        center: 128,
        spread: 90,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ label: 'Pan Tilt Circle', shape2d: 'circle' });
    expect(show.shapes).toHaveLength(1);
  });

  it('creates a 1D waveform shape', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'shape.create',
      payload: { label: 'Dimmer Sine', waveform: 'sine', target: 'dimmer', fixtureIds: ['f1'] },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ waveform: 'sine', target: 'dimmer' });
  });
});

// ── shape.update / shape.delete ───────────────────────────────────────────────

describe('shape.update', () => {
  it('updates shape properties', async () => {
    const shapeId = uuidv4();
    show.shapes.push({
      id: shapeId,
      label: 'Test',
      fixtureIds: [],
      speed: 1,
      size: 128,
      center: 128,
      spread: 0,
      phaseOffset: 0,
      active: false,
    });

    const res = await request(app).post('/api/agent/command').send({
      action: 'shape.update',
      payload: { shapeId, active: true, speed: 2 },
    });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(res.body.speed).toBe(2);
  });

  it('returns 404 for unknown shapeId', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'shape.update',
      payload: { shapeId: 'no-shape', active: true },
    });
    expect(res.status).toBe(404);
  });
});

describe('shape.delete', () => {
  it('removes shape from show', async () => {
    const shapeId = uuidv4();
    show.shapes.push({
      id: shapeId,
      label: 'To Delete',
      fixtureIds: [],
      speed: 1,
      size: 128,
      center: 128,
      spread: 0,
      phaseOffset: 0,
      active: false,
    });

    const res = await request(app)
      .post('/api/agent/command')
      .send({ action: 'shape.delete', payload: { shapeId } });

    expect(res.status).toBe(200);
    expect(show.shapes).toHaveLength(0);
  });
});

// ── patch.add / patch.remove ──────────────────────────────────────────────────

describe('patch.add', () => {
  it('adds a builtin fixture to the patch', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'patch.add',
      payload: { defId: 'builtin_dimmer_1ch', universe: 0, address: 10, label: 'Test Dim' },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ defId: 'builtin_dimmer_1ch', address: 10, label: 'Test Dim' });
    expect(show.fixtures).toHaveLength(1);
  });

  it('returns 404 for unknown defId', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'patch.add',
      payload: { defId: 'no_such_fixture', universe: 0, address: 1 },
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 409 for conflicting DMX address', async () => {
    // Add first fixture
    await request(app).post('/api/agent/command').send({
      action: 'patch.add',
      payload: { defId: 'builtin_dimmer_1ch', universe: 0, address: 1 },
    });

    // Try to add another at the same address
    const res = await request(app).post('/api/agent/command').send({
      action: 'patch.add',
      payload: { defId: 'builtin_dimmer_1ch', universe: 0, address: 1 },
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });
});

describe('patch.remove', () => {
  it('removes a fixture from the patch', async () => {
    const addRes = await request(app).post('/api/agent/command').send({
      action: 'patch.add',
      payload: { defId: 'builtin_dimmer_1ch', universe: 0, address: 5 },
    });
    const fixtureId = addRes.body.id as string;

    const res = await request(app)
      .post('/api/agent/command')
      .send({ action: 'patch.remove', payload: { fixtureId } });

    expect(res.status).toBe(200);
    expect(show.fixtures).toHaveLength(0);
  });

  it('returns 404 for unknown fixtureId', async () => {
    const res = await request(app).post('/api/agent/command').send({
      action: 'patch.remove',
      payload: { fixtureId: 'no-fixture' },
    });
    expect(res.status).toBe(404);
  });
});
