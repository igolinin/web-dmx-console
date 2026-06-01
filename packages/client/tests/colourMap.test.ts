import { describe, it, expect } from 'vitest';
import type { FixtureDef } from '@dmx-console/shared';
import { getColourMap, readColour, writeColour } from '../src/views/ProgrammerView.js';

const rgbDef: FixtureDef = {
  id: 'rgb',
  manufacturer: 'm',
  model: 'rgb',
  type: 'Color Changer',
  channels: {
    Red: { name: 'Red', group: 'Colour', colour: 'Red' },
    Green: { name: 'Green', group: 'Colour', colour: 'Green' },
    Blue: { name: 'Blue', group: 'Colour', colour: 'Blue' },
  },
  modes: [{ name: '3ch', channelNames: ['Red', 'Green', 'Blue'] }],
};

const cmyDef: FixtureDef = {
  id: 'cmy',
  manufacturer: 'm',
  model: 'cmy',
  type: 'Moving Head',
  channels: {
    Cyan: { name: 'Cyan', group: 'Colour', colour: 'Cyan' },
    Magenta: { name: 'Magenta', group: 'Colour', colour: 'Magenta' },
    Yellow: { name: 'Yellow', group: 'Colour', colour: 'Yellow' },
  },
  modes: [{ name: '3ch', channelNames: ['Cyan', 'Magenta', 'Yellow'] }],
};

describe('colour mapping', () => {
  it('maps RGB fixtures directly', () => {
    const map = getColourMap(rgbDef);
    expect(map.isCmy).toBe(false);
    expect(readColour(map, { Red: 200 }, 'red')).toBe(200);
    const out: Record<string, number> = {};
    writeColour(map, out, 'red', 200);
    expect(out).toEqual({ Red: 200 });
  });

  it('detects CMY and inverts RGB↔CMY', () => {
    const map = getColourMap(cmyDef);
    expect(map.isCmy).toBe(true);
    // A fully-open cyan channel (0) reads as full red (255).
    expect(readColour(map, { Cyan: 0 }, 'red')).toBe(255);
    expect(readColour(map, { Cyan: 255 }, 'red')).toBe(0);
    // Writing full red drives cyan to 0 (subtractive).
    const out: Record<string, number> = {};
    writeColour(map, out, 'red', 255);
    writeColour(map, out, 'green', 0);
    expect(out).toEqual({ Cyan: 0, Magenta: 255 });
  });

  it('round-trips a colour through CMY', () => {
    const map = getColourMap(cmyDef);
    const out: Record<string, number> = {};
    writeColour(map, out, 'red', 64);
    expect(readColour(map, out, 'red')).toBe(64);
  });
});
