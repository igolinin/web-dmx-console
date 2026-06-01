// ── LLM provider abstraction ────────────────────────────────────────────────
//
// Thin, SDK-free adapters over each provider's HTTP API. All adapters expose the
// same `complete(system, user, model)` contract and are instructed to return a
// single JSON object. API keys are read from environment variables; the request
// only selects which provider/model to use.

export type ProviderName = 'claude' | 'openai' | 'deepseek';

export const PROVIDER_NAMES: ProviderName[] = ['claude', 'openai', 'deepseek'];

export interface LlmProvider {
  /** Send a completion request and return the raw text response (expected to be JSON). */
  complete(system: string, user: string, model: string): Promise<string>;
}

/** Default model per provider; the client may override. */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
};

const ENV_KEYS: Record<ProviderName, string> = {
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

/** Raised when a provider call fails; carries an HTTP-ish status for the API layer. */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export function isProviderConfigured(name: ProviderName): boolean {
  return !!process.env[ENV_KEYS[name]];
}

function requireKey(name: ProviderName): string {
  const key = process.env[ENV_KEYS[name]];
  if (!key) {
    throw new LlmError(`${name} is not configured: set ${ENV_KEYS[name]}`, 400);
  }
  return key;
}

const MAX_TOKENS = 8192;

// ── Anthropic (Claude) ────────────────────────────────────────────────────────

const claudeProvider: LlmProvider = {
  async complete(system, user, model) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': requireKey('claude'),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        // Prefill an opening brace so the model continues a JSON object.
        messages: [
          { role: 'user', content: user },
          { role: 'assistant', content: '{' },
        ],
      }),
    });
    if (!res.ok) throw await httpError('Claude', res);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((b) => b.type === 'text')?.text ?? '';
    return `{${text}`;
  },
};

// ── OpenAI-compatible (OpenAI, DeepSeek) ──────────────────────────────────────

function openAiCompatible(name: ProviderName, endpoint: string): LlmProvider {
  return {
    async complete(system, user, model) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${requireKey(name)}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) throw await httpError(name, res);
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return json.choices?.[0]?.message?.content ?? '';
    },
  };
}

async function httpError(name: string, res: Response): Promise<LlmError> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* ignore */
  }
  return new LlmError(`${name} request failed (${res.status}): ${detail}`, 502);
}

const PROVIDERS: Record<ProviderName, LlmProvider> = {
  claude: claudeProvider,
  openai: openAiCompatible('openai', 'https://api.openai.com/v1/chat/completions'),
  deepseek: openAiCompatible('deepseek', 'https://api.deepseek.com/chat/completions'),
};

export function getProvider(name: ProviderName): LlmProvider {
  return PROVIDERS[name];
}
