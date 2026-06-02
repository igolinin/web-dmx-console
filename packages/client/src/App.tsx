import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './hooks/useSocket.js';
import { useShowStore } from './store/useShow.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import type { View } from './hooks/useKeyboardShortcuts.js';
import { KeyMapModal } from './components/KeyMapModal.js';
import { PatchView } from './views/PatchView.js';
import { ProgrammerView } from './views/ProgrammerView.js';
import { CueListView } from './views/CueListView.js';
import { ChaseView } from './views/ChaseView.js';
import { FixtureLibView } from './views/FixtureLibView.js';
import { PlaybackView } from './views/PlaybackView.js';
import { DEFAULT_KEY_BINDINGS } from '@dmx-console/shared';

const NAV_ITEMS: { id: View; label: string; shortcut: string }[] = [
  { id: 'patch', label: 'Patch', shortcut: 'Alt+1' },
  { id: 'programmer', label: 'Programmer', shortcut: 'Alt+2' },
  { id: 'cuelist', label: 'Cues', shortcut: 'Alt+3' },
  { id: 'chase', label: 'Chases', shortcut: 'Alt+4' },
  { id: 'library', label: 'Library', shortcut: 'Alt+5' },
  { id: 'playback', label: 'Playback', shortcut: 'Alt+6' },
];

// Global chase tempo: shared by all chases, editable from any tab.
function BpmControl() {
  const show = useShowStore((s) => s.show);
  const storeBpm = show?.settings.chaseBpm ?? 120;
  const [bpm, setBpm] = useState(storeBpm);

  // Keep local value in sync when the store updates (e.g. tap, other clients).
  useEffect(() => {
    setBpm(storeBpm);
  }, [storeBpm]);

  const commit = useCallback((value: number) => {
    if (!Number.isFinite(value) || value < 1) return;
    void fetch('/api/show/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chaseBpm: value }),
    });
  }, []);

  const tap = useCallback(() => {
    void fetch('/api/show/tap', { method: 'POST' })
      .then((r) => r.json() as Promise<{ bpm: number }>)
      .then((d) => setBpm(d.bpm))
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1 text-xs text-console-dim">
        BPM
        <input
          type="number"
          min={1}
          max={10000}
          className="w-14 bg-console-bg border border-console-border rounded px-1.5 py-0.5 text-xs text-console-text"
          value={bpm}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            setBpm(Number.isNaN(v) ? 0 : v);
            if (v > 0) commit(v);
          }}
        />
      </label>
      <button
        className="px-2 py-1 text-xs rounded border border-console-border text-console-dim hover:text-console-text active:bg-console-active/20"
        onClick={tap}
        title="Tap tempo"
      >
        ⏱ Tap
      </button>
    </div>
  );
}

function UniverseBar() {
  const dmxOutput = useShowStore((s) => s.dmxOutput);
  const show = useShowStore((s) => s.show);
  const universes = show?.artnet.universes ?? [0];

  return (
    <div className="bg-console-panel border-t border-console-border px-3 py-1 flex gap-4 text-xs text-console-dim overflow-x-auto">
      {universes.map((u) => {
        const zeros: number[] = Array<number>(512).fill(0);
        const buf: number[] = dmxOutput[u] ?? zeros;
        const active = buf.filter((v) => v > 0).length;
        return (
          <div key={u} className="flex items-center gap-1.5 shrink-0">
            <span className="text-console-text">U{u}</span>
            <div className="flex gap-px">
              {Array.from({ length: 32 }, (_, i) => {
                const val = buf[i * 16] ?? 0;
                const intensity = Math.round((val / 255) * 100);
                return (
                  <div
                    key={i}
                    className="w-1 h-3 rounded-sm"
                    style={{
                      backgroundColor:
                        val > 0 ? `rgba(245, 158, 11, ${intensity / 100})` : '#2a2a2a',
                    }}
                    title={`Ch ${i * 16 + 1}: ${val}`}
                  />
                );
              })}
            </div>
            <span>{active} active</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('programmer');
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const socket = useSocket();
  const connected = useShowStore((s) => s.connected);
  const setConnected = useShowStore((s) => s.setConnected);
  const show = useShowStore((s) => s.show);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setConnected(true);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, setConnected]);

  const handleSave = useCallback(() => {
    setSaving(true);
    void fetch('/api/show/save', { method: 'POST' })
      .then(() => setSaving(false))
      .catch(() => setSaving(false));
  }, []);

  // Install keyboard shortcuts
  useKeyboardShortcuts({
    setView,
    toggleHelp: () => setHelpOpen((o) => !o),
    activeCueListId: show?.settings.activeCueListId,
  });

  const renderView = () => {
    switch (view) {
      case 'patch':
        return <PatchView />;
      case 'programmer':
        return <ProgrammerView />;
      case 'cuelist':
        return <CueListView />;
      case 'chase':
        return <ChaseView />;
      case 'library':
        return <FixtureLibView />;
      case 'playback':
        return <PlaybackView />;
    }
  };

  const keyBindings = show?.settings.keyBindings ?? DEFAULT_KEY_BINDINGS;

  if (!show) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-console-bg text-console-text gap-3">
        <div
          className={`w-3 h-3 rounded-full ${connected ? 'bg-console-success animate-pulse' : 'bg-console-danger'}`}
        />
        <span className="text-sm text-console-dim">
          {connected ? 'Loading show…' : 'Connecting to server…'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-console-bg">
      {/* Key map help overlay */}
      {helpOpen && <KeyMapModal bindings={keyBindings} onClose={() => setHelpOpen(false)} />}

      {/* Top nav bar */}
      <nav className="flex items-center gap-1 px-3 py-1.5 bg-console-panel border-b border-console-border shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-console-success' : 'bg-console-danger'}`}
          />
          <span className="text-console-text text-sm font-semibold">{show.meta.title}</span>
        </div>

        {NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={[
              'px-3 py-1 text-sm rounded transition-colors',
              view === id
                ? 'bg-console-active text-white'
                : 'text-console-dim hover:text-console-text hover:bg-console-muted',
            ].join(' ')}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <BpmControl />
          <button
            className="px-2 py-1 text-xs rounded border border-console-border text-console-dim hover:text-console-text transition-colors"
            title="Keyboard shortcuts (?)"
            onClick={() => setHelpOpen((o) => !o)}
          >
            ?
          </button>
          <button
            className="px-3 py-1 text-sm rounded border border-console-border text-console-dim hover:text-console-text hover:border-console-active transition-colors disabled:opacity-40"
            onClick={handleSave}
            disabled={saving}
            title="Save show (Ctrl+S)"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{renderView()}</main>

      {/* Universe status bar */}
      <UniverseBar />
    </div>
  );
}
