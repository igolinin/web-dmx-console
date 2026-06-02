import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { chasesRouter } from '../src/api/chases.js';
import { show } from '../src/store/show.js';
import { programmer } from '../src/store/programmer.js';

const app = express();
app.use(express.json());
app.use('/api/chases', chasesRouter);

beforeEach(() => {
  show.chases = [];
  programmer.clear();
});

async function createChase(label = 'Rec'): Promise<string> {
  const res = await request(app).post('/api/chases').send({ label });
  return res.body.id as string;
}

describe('chase step recording API', () => {
  it('records a programmer snapshot as a step; first record yields a 1-step chase', async () => {
    programmer.set('f1', { Dimmer: 255 });
    const id = await createChase();

    const rec = await request(app).post(`/api/chases/${id}/steps`);
    expect(rec.status).toBe(201);

    const after = await request(app).get(`/api/chases/${id}`);
    expect(after.body.steps).toHaveLength(1);
    expect(after.body.steps[0].values).toEqual([{ fixtureId: 'f1', channels: { Dimmer: 255 } }]);
  });

  it('each record appends a step', async () => {
    const id = await createChase();
    await request(app).post(`/api/chases/${id}/steps`);
    await request(app).post(`/api/chases/${id}/steps`);
    await request(app).post(`/api/chases/${id}/steps`);

    const after = await request(app).get(`/api/chases/${id}`);
    expect(after.body.steps).toHaveLength(3);
  });

  it('clear last removes only the most recent step', async () => {
    const id = await createChase();
    await request(app).post(`/api/chases/${id}/steps`);
    const second = await request(app).post(`/api/chases/${id}/steps`);
    const lastId = second.body.id as string;

    const del = await request(app).delete(`/api/chases/${id}/steps/${lastId}`);
    expect(del.status).toBe(200);

    const after = await request(app).get(`/api/chases/${id}`);
    expect(after.body.steps).toHaveLength(1);
  });

  it('clear all wipes every step but keeps the chase', async () => {
    const id = await createChase();
    await request(app).post(`/api/chases/${id}/steps`);
    await request(app).post(`/api/chases/${id}/steps`);

    const del = await request(app).delete(`/api/chases/${id}/steps`);
    expect(del.status).toBe(200);
    expect(del.body.steps).toHaveLength(0);

    const after = await request(app).get(`/api/chases/${id}`);
    expect(after.status).toBe(200);
    expect(after.body.steps).toHaveLength(0);
  });

  it('clear all on a missing chase is 404', async () => {
    const del = await request(app).delete('/api/chases/nope/steps');
    expect(del.status).toBe(404);
  });
});
