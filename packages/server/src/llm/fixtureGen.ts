import type { FixtureDef } from '@dmx-console/shared';
import { slugify } from '../fixtures/parser.js';
import { getProvider, LlmError, type LlmProvider, type ProviderName } from './providers.js';
import { FixtureDefSchema } from './fixtureSchema.js';
import {
  FIXTURE_SYSTEM_PROMPT,
  buildFixtureUserPrompt,
  buildFixtureDiscoveryPrompt,
} from './fixturePrompt.js';

/** Extract the first balanced JSON object from a model response. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new LlmError('Model did not return a JSON object', 502);
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new LlmError('Model returned malformed JSON', 502);
  }
}

/**
 * Some models return a fixture with channels but no `modes` (or an empty array)
 * when the manual documents only a single channel layout. Mirror the QLC+ parser
 * behaviour and synthesise a default mode from the channel keys so generation
 * succeeds instead of failing schema validation. Mutates `obj` in place.
 */
function synthesizeDefaultMode(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  const rec = obj as Record<string, unknown>;
  const hasModes = Array.isArray(rec.modes) && rec.modes.length > 0;
  if (hasModes) return;
  const channelNames =
    rec.channels && typeof rec.channels === 'object' ? Object.keys(rec.channels) : [];
  if (channelNames.length === 0) return;
  rec.modes = [
    {
      name: `${channelNames.length} Channel`,
      channelNames,
      description: 'Auto-generated: the manual did not specify discrete DMX modes.',
    },
  ];
}

/** Parse, validate and finalize a raw model response into a FixtureDef. */
function finalizeFixture(raw: string): FixtureDef {
  const obj = extractJson(raw);
  synthesizeDefaultMode(obj);
  const parsed = FixtureDefSchema.safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new LlmError(
      `Model output did not match the fixture schema: ${first?.path.join('.')} — ${first?.message}`,
      502,
    );
  }

  // Validate channelNames reference real channels.
  const data = parsed.data;
  for (const mode of data.modes) {
    for (const ch of mode.channelNames) {
      if (!data.channels[ch]) {
        throw new LlmError(`Mode "${mode.name}" references unknown channel "${ch}"`, 502);
      }
    }
  }

  return {
    ...data,
    id: `${slugify(data.manufacturer)}_${slugify(data.model)}`,
    source: 'llm',
  } as FixtureDef;
}

export interface GenerateOptions {
  text: string;
  provider: ProviderName;
  model: string;
  /** Inject a provider for testing; defaults to the real one. */
  llm?: LlmProvider;
}

/**
 * Build the prompt from supplied manual/snippet text, call the selected LLM
 * provider, then parse and validate its response into a FixtureDef. The returned
 * def has a server-assigned `id` and `source: 'llm'`; it is NOT persisted here.
 */
export async function generateFixtureFromText(opts: GenerateOptions): Promise<FixtureDef> {
  const { text, provider, model } = opts;
  if (!text.trim()) {
    throw new LlmError('No fixture text was provided', 400);
  }

  const llm = opts.llm ?? getProvider(provider);
  const raw = await llm.complete(FIXTURE_SYSTEM_PROMPT, buildFixtureUserPrompt(text), model);
  return finalizeFixture(raw);
}

/** Backwards-compatible alias (PDF text and pasted text take the same path). */
export const generateFixtureFromPdf = generateFixtureFromText;

export interface DiscoverOptions {
  manufacturer: string;
  /** The fixture model name (not the LLM model id). */
  modelName: string;
  provider: ProviderName;
  model: string;
  /** Inject a provider for testing; defaults to the real one. */
  llm?: LlmProvider;
}

/**
 * Generate a FixtureDef from the model's own knowledge of a given make + model,
 * with no source document. Output is parsed/validated like the text path.
 */
export async function generateFixtureFromKnowledge(opts: DiscoverOptions): Promise<FixtureDef> {
  const { manufacturer, modelName, provider, model } = opts;
  if (!manufacturer.trim() || !modelName.trim()) {
    throw new LlmError('Both manufacturer and model are required', 400);
  }

  const llm = opts.llm ?? getProvider(provider);
  const raw = await llm.complete(
    FIXTURE_SYSTEM_PROMPT,
    buildFixtureDiscoveryPrompt(manufacturer, modelName),
    model,
  );
  return finalizeFixture(raw);
}
