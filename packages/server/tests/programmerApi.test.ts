import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { programmerRouter } from '../src/api/programmer.js';
import { show } from '../src/store/show.js';
import { programmer } from '../src/store/programmer.js';
import type { ShapeLayer } from '@dmx-console/shared';

const app = express();
app.use(express.json());
app.use('/api/programmer', programmerRouter);

function makeShape(id: string, fixtureIds: string[]): ShapeLayer {
  return {
    id,
    label: id,
    fixtureIds,
    speed: 1,
    size: 64,
    center: 128,
    spread: 0,
    phaseOffset: 0,
    active: true,
    waveform: 'sine',
    target: 'dimmer',
  };
}

beforeEach(() => {
  programmer.clear();
  show.shapes = [];
});

describe('clearing the programmer removes shapes', () => {
  it('global clear deletes all shapes', async () => {
    show.shapes = [makeShape('s1', ['f1']), makeShape('s2', ['f2'])];
    programmer.set('f1', { Dimmer: 200 });

    const res = await request(app).post('/api/programmer/clear').send({});
    expect(res.status).toBe(200);
    expect(show.shapes).toHaveLength(0);
    expect(programmer.snapshot()).toHaveLength(0);
  });

  it('per-fixture clear drops that fixture from shapes and removes now-empty shapes', async () => {
    show.shapes = [makeShape('s1', ['f1', 'f2']), makeShape('s2', ['f1'])];

    const res = await request(app).post('/api/programmer/clear').send({ fixtureId: 'f1' });
    expect(res.status).toBe(200);

    // s1 keeps f2; s2 had only f1 → removed entirely.
    expect(show.shapes).toHaveLength(1);
    expect(show.shapes[0]!.id).toBe('s1');
    expect(show.shapes[0]!.fixtureIds).toEqual(['f2']);
  });
});
