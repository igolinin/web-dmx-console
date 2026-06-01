import type { FixtureDef } from '@dmx-console/shared';
import { slugify } from '../fixtures/parser.js';
import { getProvider, LlmError, type LlmProvider, type ProviderName } from './providers.js';
import { FixtureDefSchema } from './fixtureSchema.js';
import { FIXTURE_SYSTEM_PROMPT, buildFixtureUserPrompt } from './fixturePrompt.js';

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

export interface GenerateOptions {
  text: string;
  provider: ProviderName;
  model: string;
  /** Inject a provider for testing; defaults to the real one. */
  llm?: LlmProvider;
}

/**
 * Build the prompt, call the selected LLM provider, then parse and validate its
 * response into a FixtureDef. The returned def has a server-assigned `id` and
 * `source: 'llm'`; it is NOT persisted here.
 */
export async function generateFixtureFromPdf(opts: GenerateOptions): Promise<FixtureDef> {
  const { text, provider, model } = opts;
  if (!text.trim()) {
    throw new LlmError('No text could be extracted from the PDF', 400);
  }

  const llm = opts.llm ?? getProvider(provider);
  const raw = await llm.complete(FIXTURE_SYSTEM_PROMPT, buildFixtureUserPrompt(text), model);

  const parsed = FixtureDefSchema.safeParse(extractJson(raw));
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
