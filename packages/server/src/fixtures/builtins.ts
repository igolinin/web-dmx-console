import type { FixtureDef } from '@dmx-console/shared';

export const BUILTIN_FIXTURES: FixtureDef[] = [
  {
    id: 'builtin_dimmer_1ch',
    manufacturer: 'Generic',
    model: 'Dimmer 1ch',
    type: 'Dimmer',
    source: 'builtin',
    channels: {
      Dimmer: { name: 'Dimmer', group: 'Intensity', preset: 'IntensityDimmer' },
    },
    modes: [{ name: '1 Channel', channelNames: ['Dimmer'] }],
  },
  {
    id: 'builtin_rgb_3ch',
    manufacturer: 'Generic',
    model: 'RGB 3ch',
    type: 'Color Changer',
    source: 'builtin',
    channels: {
      Red: { name: 'Red', group: 'Colour', colour: 'Red' },
      Green: { name: 'Green', group: 'Colour', colour: 'Green' },
      Blue: { name: 'Blue', group: 'Colour', colour: 'Blue' },
    },
    modes: [{ name: '3 Channel', channelNames: ['Red', 'Green', 'Blue'] }],
  },
  {
    id: 'builtin_rgbw_4ch',
    manufacturer: 'Generic',
    model: 'RGBW 4ch',
    type: 'Color Changer',
    source: 'builtin',
    channels: {
      Red: { name: 'Red', group: 'Colour', colour: 'Red' },
      Green: { name: 'Green', group: 'Colour', colour: 'Green' },
      Blue: { name: 'Blue', group: 'Colour', colour: 'Blue' },
      White: { name: 'White', group: 'Colour', colour: 'White' },
    },
    modes: [{ name: '4 Channel', channelNames: ['Red', 'Green', 'Blue', 'White'] }],
  },
  {
    id: 'builtin_rgbwa_5ch',
    manufacturer: 'Generic',
    model: 'RGBWA 5ch',
    type: 'Color Changer',
    source: 'builtin',
    channels: {
      Red: { name: 'Red', group: 'Colour', colour: 'Red' },
      Green: { name: 'Green', group: 'Colour', colour: 'Green' },
      Blue: { name: 'Blue', group: 'Colour', colour: 'Blue' },
      White: { name: 'White', group: 'Colour', colour: 'White' },
      Amber: { name: 'Amber', group: 'Colour', colour: 'Amber' },
    },
    modes: [{ name: '5 Channel', channelNames: ['Red', 'Green', 'Blue', 'White', 'Amber'] }],
  },
  {
    id: 'builtin_dimmer_rgb_4ch',
    manufacturer: 'Generic',
    model: 'Dimmer+RGB 4ch',
    type: 'Color Changer',
    source: 'builtin',
    channels: {
      Dimmer: { name: 'Dimmer', group: 'Intensity', preset: 'IntensityDimmer' },
      Red: { name: 'Red', group: 'Colour', colour: 'Red' },
      Green: { name: 'Green', group: 'Colour', colour: 'Green' },
      Blue: { name: 'Blue', group: 'Colour', colour: 'Blue' },
    },
    modes: [{ name: '4 Channel', channelNames: ['Dimmer', 'Red', 'Green', 'Blue'] }],
  },
  {
    id: 'builtin_moving_head_basic',
    manufacturer: 'Generic',
    model: 'Moving Head Basic',
    type: 'Moving Head',
    source: 'builtin',
    channels: {
      Pan: { name: 'Pan', group: 'Pan', preset: 'PositionPan', byte: 0 },
      'Pan Fine': { name: 'Pan Fine', group: 'Pan', preset: 'PositionPanFine', byte: 1 },
      Tilt: { name: 'Tilt', group: 'Tilt', preset: 'PositionTilt', byte: 0 },
      'Tilt Fine': {
        name: 'Tilt Fine',
        group: 'Tilt',
        preset: 'PositionTiltFine',
        byte: 1,
      },
      Dimmer: { name: 'Dimmer', group: 'Intensity', preset: 'IntensityDimmer' },
      Red: { name: 'Red', group: 'Colour', colour: 'Red' },
      Green: { name: 'Green', group: 'Colour', colour: 'Green' },
      Blue: { name: 'Blue', group: 'Colour', colour: 'Blue' },
    },
    modes: [
      {
        name: '8 Channel',
        channelNames: ['Pan', 'Pan Fine', 'Tilt', 'Tilt Fine', 'Dimmer', 'Red', 'Green', 'Blue'],
      },
    ],
    physical: { panMax: 540, tiltMax: 270 },
  },
  {
    id: 'builtin_led_bar_8px',
    manufacturer: 'Generic',
    model: 'LED Bar 8px',
    type: 'LED Bar (Pixels)',
    source: 'builtin',
    channels: Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].flatMap((px) => [
        [`Red ${px}`, { name: `Red ${px}`, group: 'Colour' as const, colour: 'Red' }],
        [`Green ${px}`, { name: `Green ${px}`, group: 'Colour' as const, colour: 'Green' }],
        [`Blue ${px}`, { name: `Blue ${px}`, group: 'Colour' as const, colour: 'Blue' }],
      ]),
    ),
    modes: [
      {
        name: '24 Channel',
        channelNames: [1, 2, 3, 4, 5, 6, 7, 8].flatMap((px) => [
          `Red ${px}`,
          `Green ${px}`,
          `Blue ${px}`,
        ]),
      },
    ],
    physical: { pixelCount: 8 },
  },
];
