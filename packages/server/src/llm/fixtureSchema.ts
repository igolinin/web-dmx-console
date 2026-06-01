import { z } from 'zod';
import type { FixtureType, ChannelGroup } from '@dmx-console/shared';

// Runtime mirrors of the shared string-literal unions, used for both LLM output
// validation and the client save body.

export const FIXTURE_TYPES = [
  'Dimmer',
  'Color Changer',
  'Moving Head',
  'Scanner',
  'LED Bar (Beams)',
  'LED Bar (Pixels)',
  'Strobe',
  'Effect',
  'Other',
] as const satisfies readonly FixtureType[];

export const CHANNEL_GROUPS = [
  'Intensity',
  'Colour',
  'Pan',
  'Tilt',
  'Gobo',
  'Prism',
  'Shutter',
  'Beam',
  'Speed',
  'Effect',
  'Maintenance',
  'Nothing',
] as const satisfies readonly ChannelGroup[];

const ChannelCapabilitySchema = z.object({
  min: z.number().int().min(0).max(255),
  max: z.number().int().min(0).max(255),
  label: z.string(),
  preset: z.string().optional(),
});

const ChannelDefSchema = z.object({
  name: z.string().min(1),
  group: z.enum(CHANNEL_GROUPS),
  colour: z.string().optional(),
  preset: z.string().optional(),
  byte: z.union([z.literal(0), z.literal(1)]).optional(),
  capabilities: z.array(ChannelCapabilitySchema).optional(),
});

const FixtureModeSchema = z.object({
  name: z.string().min(1),
  channelNames: z.array(z.string().min(1)).min(1),
  description: z.string().optional(),
});

const PhysicalSpecSchema = z.object({
  panMax: z.number().optional(),
  tiltMax: z.number().optional(),
  pixelCount: z.number().optional(),
  powerW: z.number().optional(),
});

/** Validates a complete FixtureDef. `id`/`source` are optional here (assigned server-side). */
export const FixtureDefSchema = z.object({
  id: z.string().optional(),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  type: z.enum(FIXTURE_TYPES),
  channels: z.record(z.string(), ChannelDefSchema),
  modes: z.array(FixtureModeSchema).min(1),
  physical: PhysicalSpecSchema.optional(),
  source: z.string().optional(),
});

export type ParsedFixtureDef = z.infer<typeof FixtureDefSchema>;
