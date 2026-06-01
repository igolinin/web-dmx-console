import { useState, useEffect, useRef } from 'react';
import type { FixtureDef } from '@dmx-console/shared';

interface ProviderInfo {
  name: 'claude' | 'openai' | 'deepseek';
  configured: boolean;
  defaultModel: string;
}

const PROVIDER_LABELS: Record<ProviderInfo['name'], string> = {
  claude: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  deepseek: 'DeepSeek',
};

export function FixtureGenModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState<ProviderInfo['name']>('claude');
  const [model, setModel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FixtureDef | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch('/api/fixtures/providers')
      .then((r) => r.json() as Promise<ProviderInfo[]>)
      .then((list) => {
        setProviders(list);
        const first = list.find((p) => p.configured) ?? list[0];
        if (first) {
          setProvider(first.name);
          setModel(first.defaultModel);
        }
      })
      .catch(() => setError('Could not load provider list'));
  }, []);

  const selected = providers.find((p) => p.name === provider);

  const handleProviderChange = (name: ProviderInfo['name']) => {
    setProvider(name);
    const info = providers.find((p) => p.name === name);
    if (info) setModel(info.defaultModel);
  };

  const handleGenerate = () => {
    if (!file) {
      setError('Choose a PDF manual first');
      return;
    }
    setBusy(true);
    setError(null);
    setPreview(null);

    const form = new FormData();
    form.append('pdf', file);
    form.append('provider', provider);
    if (model) form.append('model', model);

    void fetch('/api/fixtures/generate', { method: 'POST', body: form })
      .then(async (r) => {
        const json = (await r.json()) as { fixture?: FixtureDef; error?: string };
        if (!r.ok) throw new Error(json.error ?? `Request failed (${r.status})`);
        setPreview(json.fixture ?? null);
      })
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setBusy(false));
  };

  const handleSave = () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    void fetch('/api/fixtures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(preview),
    })
      .then(async (r) => {
        const json = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(json.error ?? `Save failed (${r.status})`);
        onSaved();
        onClose();
      })
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setBusy(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-console-panel border border-console-border rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-console-border">
          <h2 className="text-console-text font-semibold">✨ Create fixture from manual (AI)</h2>
          <button className="text-console-dim hover:text-console-text text-sm" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* PDF picker */}
          <div>
            <label className="block text-xs font-semibold text-console-accent mb-1">
              Fixture manual (PDF)
            </label>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-console-dim file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-console-border file:bg-console-bg file:text-console-text file:text-xs file:cursor-pointer"
            />
          </div>

          {/* Provider + model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-console-accent mb-1">
                Provider
              </label>
              <select
                className="w-full bg-console-bg border border-console-border rounded px-2 py-1 text-sm text-console-text focus:outline-none focus:border-console-active"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as ProviderInfo['name'])}
              >
                {(providers.length ? providers : []).map((p) => (
                  <option key={p.name} value={p.name}>
                    {PROVIDER_LABELS[p.name]}
                    {p.configured ? '' : ' (no API key)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-console-accent mb-1">Model</label>
              <input
                className="w-full bg-console-bg border border-console-border rounded px-2 py-1 text-sm text-console-text focus:outline-none focus:border-console-active"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={selected?.defaultModel ?? ''}
              />
            </div>
          </div>

          {selected && !selected.configured && (
            <div className="text-xs text-console-danger">
              No API key configured for this provider on the server.
            </div>
          )}

          <button
            className="px-3 py-1.5 text-sm rounded bg-console-active text-white disabled:opacity-40"
            onClick={handleGenerate}
            disabled={busy || !file || (selected ? !selected.configured : false)}
          >
            {busy && !preview ? 'Reading manual…' : 'Generate'}
          </button>

          {error && (
            <div className="text-xs text-console-danger border border-console-danger/40 rounded p-2 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="border-t border-console-border pt-4 space-y-3">
              <div>
                <div className="text-console-text font-semibold">{preview.model}</div>
                <div className="text-xs text-console-dim">
                  {preview.manufacturer} · {preview.type} · {Object.keys(preview.channels).length}{' '}
                  channels · {preview.modes.length} mode
                  {preview.modes.length === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-console-muted font-mono mt-0.5">id: {preview.id}</div>
              </div>

              {preview.modes.map((mode, mi) => (
                <div key={mi} className="console-panel p-3">
                  <div className="text-console-accent text-xs font-semibold mb-1">
                    {mode.name} ({mode.channelNames.length} channels)
                  </div>
                  <div className="text-xs text-console-dim mb-2">
                    {mode.channelNames.join(' · ')}
                  </div>
                  {mode.description && (
                    <details>
                      <summary className="text-[11px] text-console-muted cursor-pointer hover:text-console-text">
                        Original mapping from manual
                      </summary>
                      <pre className="text-[11px] text-console-dim whitespace-pre-wrap mt-1 font-mono">
                        {mode.description}
                      </pre>
                    </details>
                  )}
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded bg-console-success text-white disabled:opacity-40"
                  onClick={handleSave}
                  disabled={busy}
                >
                  {busy ? 'Saving…' : 'Save to library'}
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded border border-console-border text-console-dim hover:text-console-text"
                  onClick={() => setPreview(null)}
                  disabled={busy}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
