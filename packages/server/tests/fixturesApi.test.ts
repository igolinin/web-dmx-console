import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { fixturesRouter } from '../src/api/fixtures.js';
import { loadFixtureLibrary } from '../src/fixtures/loader.js';
import { deleteUserFixture } from '../src/fixtures/userStore.js';
import type { FixtureDef } from '@dmx-console/shared';

const app = express();
app.use(express.json());
app.use('/api/fixtures', fixturesRouter);

// Unique ids so the test never clobbers a real user fixture.
const CUSTOM_ID = 'zztest_custom_fixture';
const BUILTIN_ID = 'builtin_rgb_3ch'; // exists as a built-in

const baseDef: FixtureDef = {
  id: CUSTOM_ID,
  manufacturer: 'ZZ Test',
  model: 'Editor Probe',
  type: 'Dimmer',
  channels: { Dim: { name: 'Dim', group: 'Intensity' } },
  modes: [{ name: '1 Channel', channelNames: ['Dim'] }],
  source: 'user',
};

beforeAll(async () => {
  await loadFixtureLibrary();
});

afterAll(async () => {
  // Ensure no test artifacts linger if an assertion failed mid-flight.
  await deleteUserFixture(CUSTOM_ID);
  await deleteUserFixture(BUILTIN_ID);
  await loadFixtureLibrary();
});

describe('fixtures CRUD API', () => {
  it('creates a custom profile, edits it by adding a mode, then deletes it', async () => {
    // Create
    const create = await request(app).post('/api/fixtures').send(baseDef);
    expect(create.status).toBe(201);
    expect(create.body.fixture.id).toBe(CUSTOM_ID);

    // Edit: add a second channel + a new mode
    const edited: FixtureDef = {
      ...baseDef,
      channels: {
        Dim: { name: 'Dim', group: 'Intensity' },
        Strobe: { name: 'Strobe', group: 'Shutter' },
      },
      modes: [
        { name: '1 Channel', channelNames: ['Dim'] },
        { name: '2 Channel', channelNames: ['Dim', 'Strobe'], description: 'Dim + strobe' },
      ],
    };
    const update = await request(app).post('/api/fixtures').send(edited);
    expect(update.status).toBe(201);

    const fetched = await request(app).get(`/api/fixtures/${CUSTOM_ID}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.modes).toHaveLength(2);
    expect(fetched.body.modes[1].channelNames).toEqual(['Dim', 'Strobe']);

    // Delete: a pure user fixture disappears entirely
    const del = await request(app).delete(`/api/fixtures/${CUSTOM_ID}`);
    expect(del.status).toBe(200);
    expect(del.body.reverted).toBe(false);
    expect((await request(app).get(`/api/fixtures/${CUSTOM_ID}`)).status).toBe(404);
  });

  it('rejects an invalid profile (mode referencing nothing)', async () => {
    const bad = { ...baseDef, id: 'zztest_bad', modes: [{ name: 'x', channelNames: [] }] };
    const res = await request(app).post('/api/fixtures').send(bad);
    expect(res.status).toBe(400);
  });

  it('deleting an override of a built-in reverts to the original', async () => {
    // Override the built-in with an edited copy
    const override: FixtureDef = {
      id: BUILTIN_ID,
      manufacturer: 'Generic',
      model: 'RGB 3ch (custom)',
      type: 'Color Changer',
      channels: { Red: { name: 'Red', group: 'Colour', colour: 'Red' } },
      modes: [{ name: '1 Channel', channelNames: ['Red'] }],
      source: 'user',
    };
    await request(app).post('/api/fixtures').send(override);
    expect((await request(app).get(`/api/fixtures/${BUILTIN_ID}`)).body.model).toBe('RGB 3ch (custom)');

    // Delete the override → built-in returns
    const del = await request(app).delete(`/api/fixtures/${BUILTIN_ID}`);
    expect(del.status).toBe(200);
    expect(del.body.reverted).toBe(true);
    const reverted = await request(app).get(`/api/fixtures/${BUILTIN_ID}`);
    expect(reverted.body.source).toBe('builtin');
  });
});
