import { useState, useEffect } from 'react';
import type { Show } from '@dmx-console/shared';
import { useSocket } from './hooks/useSocket.js';
import { useShowStore } from './store/useShow.js';
import { PatchView } from './views/PatchView.js';
import { ProgrammerView } from './views/ProgrammerView.js';
import { CueListView } from './views/CueListView.js';
import { ChaseView } from './views/ChaseView.js';
import { ShapeView } from './views/ShapeView.js';
import { FixtureLibView } from './views/FixtureLibView.js';

type View = 'patch' | 'programmer' | 'cuelist' | 'chase' | 'shape' | 'library';

const NAV_ITEMS: { id: View; label: string; shortcut: string }[] = [
  { id: 'patch', label: 'Patch', shortcut: 'Alt+1' },
  { id: 'programmer', label: 'Programmer', shortcut: 'Alt+2' },
  { id: 'cuelist', label: 'Cues', shortcut: 'Alt+3' },
  { id: 'chase', label: 'Chases', shortcut: 'Alt+4' },
  { id: 'shape', label: 'Shapes', shortcut: 'Alt+5' },
  { id: 'library', label: 'Library', shortcut: 'Alt+6' },
];

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

  // Alt+1..6 view switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const map: Record<string, View> = {
        '1': 'patch',
        '2': 'programmer',
        '3': 'cuelist',
        '4': 'chase',
        '5': 'shape',
        '6': 'library',
      };
      const v = map[e.key];
      if (v) {
        setView(v);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
      case 'shape':
        return <ShapeView />;
      case 'library':
        return <FixtureLibView />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-console-bg">
      {/* Top nav bar */}
      <nav className="flex items-center gap-1 px-3 py-1.5 bg-console-panel border-b border-console-border shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-console-success' : 'bg-console-danger'}`}
          />
          <span className="text-console-text text-sm font-semibold">
            {show?.meta.title ?? 'DMX Console'}
          </span>
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
          <button
            className="px-3 py-1 text-sm rounded border border-console-border text-console-dim hover:text-console-text hover:border-console-active transition-colors"
            onClick={() => {
              void fetch('/api/state')
                .then((r) => r.json() as Promise<Show>)
                .then((s) => useShowStore.getState().setShow(s));
            }}
          >
            Save
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
