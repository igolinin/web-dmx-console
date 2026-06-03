import { describe, it, expect } from 'vitest';
import {
  generateFixtureFromPdf,
  generateFixtureFromText,
  generateFixtureFromKnowledge,
} from '../src/llm/fixtureGen.js';
import { LlmError, type LlmProvider } from '../src/llm/providers.js';

/** Stub provider that returns a fixed response regardless of input. */
function stubProvider(response: string): LlmProvider {
  return { complete: () => Promise.resolve(response) };
}

const MULTI_MODE_JSON = JSON.stringify({
  manufacturer: 'Acme Lighting',
  model: 'Spot 250',
  type: 'Moving Head',
  channels: {
    Pan: { name: 'Pan', group: 'Pan' },
    Tilt: { name: 'Tilt', group: 'Tilt' },
    Dimmer: { name: 'Dimmer', group: 'Intensity' },
    Red: { name: 'Red', group: 'Colour', colour: 'Red' },
  },
  modes: [
    {
      name: '3 Channel',
      channelNames: ['Pan', 'Tilt', 'Dimmer'],
      description: '1: Pan\n2: Tilt\n3: Dimmer',
    },
    {
      name: '4 Channel',
      channelNames: ['Pan', 'Tilt', 'Dimmer', 'Red'],
      description: '1: Pan\n2: Tilt\n3: Dimmer\n4: Red',
    },
  ],
});

describe('generateFixtureFromPdf', () => {
  it('parses a multi-mode fixture and assigns id + source', async () => {
    const def = await generateFixtureFromPdf({
      text: 'some manual text',
      provider: 'claude',
      model: 'test',
      llm: stubProvider(MULTI_MODE_JSON),
    });

    expect(def.id).toBe('acme_lighting_spot_250');
    expect(def.source).toBe('llm');
    expect(def.modes).toHaveLength(2);
    // every mode keeps its original mapping description
    expect(def.modes.every((m) => !!m.description)).toBe(true);
    expect(def.modes[0]?.description).toContain('Pan');
  });

  it('tolerates surrounding prose / fences around the JSON', async () => {
    const wrapped = '```json\n' + MULTI_MODE_JSON + '\n```';
    const def = await generateFixtureFromPdf({
      text: 'manual',
      provider: 'openai',
      model: 'test',
      llm: stubProvider(wrapped),
    });
    expect(def.modes).toHaveLength(2);
  });

  it('synthesizes a default mode when the model omits modes', async () => {
    const noModes = JSON.stringify({
      manufacturer: 'Acme',
      model: 'Par 7',
      type: 'Color Changer',
      channels: {
        Dimmer: { name: 'Dimmer', group: 'Intensity' },
        Red: { name: 'Red', group: 'Colour', colour: 'Red' },
        Green: { name: 'Green', group: 'Colour', colour: 'Green' },
      },
    });
    const def = await generateFixtureFromPdf({
      text: 'manual',
      provider: 'claude',
      model: 't',
      llm: stubProvider(noModes),
    });
    expect(def.modes).toHaveLength(1);
    expect(def.modes[0]?.name).toBe('3 Channel');
    expect(def.modes[0]?.channelNames).toEqual(['Dimmer', 'Red', 'Green']);
    expect(def.modes[0]?.description).toMatch(/Auto-generated/);
  });

  it('synthesizes a default mode when modes is an empty array', async () => {
    const emptyModes = JSON.stringify({
      manufacturer: 'Acme',
      model: 'Dim 1',
      type: 'Dimmer',
      channels: { Dim: { name: 'Dim', group: 'Intensity' } },
      modes: [],
    });
    const def = await generateFixtureFromPdf({
      text: 'manual',
      provider: 'openai',
      model: 't',
      llm: stubProvider(emptyModes),
    });
    expect(def.modes).toHaveLength(1);
    expect(def.modes[0]?.channelNames).toEqual(['Dim']);
  });

  it('rejects malformed JSON', async () => {
    await expect(
      generateFixtureFromPdf({
        text: 'manual',
        provider: 'deepseek',
        model: 'test',
        llm: stubProvider('not json at all'),
      }),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it('rejects output with an out-of-enum channel group', async () => {
    const bad = JSON.stringify({
      manufacturer: 'X',
      model: 'Y',
      type: 'Dimmer',
      channels: { Dim: { name: 'Dim', group: 'NotARealGroup' } },
      modes: [{ name: '1ch', channelNames: ['Dim'] }],
    });
    await expect(
      generateFixtureFromPdf({ text: 'm', provider: 'claude', model: 't', llm: stubProvider(bad) }),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it('rejects a mode referencing an unknown channel', async () => {
    const bad = JSON.stringify({
      manufacturer: 'X',
      model: 'Y',
      type: 'Dimmer',
      channels: { Dim: { name: 'Dim', group: 'Intensity' } },
      modes: [{ name: '2ch', channelNames: ['Dim', 'Ghost'] }],
    });
    await expect(
      generateFixtureFromPdf({ text: 'm', provider: 'claude', model: 't', llm: stubProvider(bad) }),
    ).rejects.toThrow(/unknown channel/);
  });

  it('rejects empty extracted text without calling the provider', async () => {
    let called = false;
    const spy: LlmProvider = {
      complete: () => {
        called = true;
        return Promise.resolve('{}');
      },
    };
    await expect(
      generateFixtureFromPdf({ text: '   ', provider: 'claude', model: 't', llm: spy }),
    ).rejects.toBeInstanceOf(LlmError);
    expect(called).toBe(false);
  });
});

describe('generateFixtureFromText', () => {
  it('parses pasted text into a fixture (same path as PDF)', async () => {
    const def = await generateFixtureFromText({
      text: '1: Pan\n2: Tilt',
      provider: 'claude',
      model: 'test',
      llm: stubProvider(MULTI_MODE_JSON),
    });
    expect(def.id).toBe('acme_lighting_spot_250');
    expect(def.source).toBe('llm');
  });

  it('rejects empty pasted text without calling the provider', async () => {
    let called = false;
    const spy: LlmProvider = {
      complete: () => {
        called = true;
        return Promise.resolve('{}');
      },
    };
    await expect(
      generateFixtureFromText({ text: '  ', provider: 'claude', model: 't', llm: spy }),
    ).rejects.toBeInstanceOf(LlmError);
    expect(called).toBe(false);
  });
});

describe('generateFixtureFromKnowledge', () => {
  it('generates a fixture from make + model and passes both to the prompt', async () => {
    let prompt = '';
    const spy: LlmProvider = {
      complete: (_system, user) => {
        prompt = user;
        return Promise.resolve(MULTI_MODE_JSON);
      },
    };
    const def = await generateFixtureFromKnowledge({
      manufacturer: 'Acme Lighting',
      modelName: 'Spot 250',
      provider: 'claude',
      model: 'test',
      llm: spy,
    });
    expect(def.id).toBe('acme_lighting_spot_250');
    expect(def.source).toBe('llm');
    expect(prompt).toContain('Acme Lighting');
    expect(prompt).toContain('Spot 250');
  });

  it('requires both manufacturer and model before calling the provider', async () => {
    let called = false;
    const spy: LlmProvider = {
      complete: () => {
        called = true;
        return Promise.resolve(MULTI_MODE_JSON);
      },
    };
    await expect(
      generateFixtureFromKnowledge({
        manufacturer: 'Acme',
        modelName: '   ',
        provider: 'claude',
        model: 't',
        llm: spy,
      }),
    ).rejects.toBeInstanceOf(LlmError);
    expect(called).toBe(false);
  });
});
