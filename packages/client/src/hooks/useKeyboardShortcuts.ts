import { useEffect, useRef, useCallback } from 'react';
import { DEFAULT_KEY_BINDINGS } from '@dmx-console/shared';
import {
  keyEventFromNative,
  resolveKey,
  isInputFocused,
  processNumKey,
  resolveFixtureByNumber,
  emptyNumBuffer,
  flashStart,
  flashEnd,
  emptyFlashState,
} from '../keyboard/keyMap.js';
import type { NumBuffer, FlashState } from '../keyboard/keyMap.js';
import { useShowStore } from '../store/useShow.js';
import { useProgrammer } from '../store/useProgrammer.js';

export type View = 'patch' | 'programmer' | 'cuelist' | 'chase' | 'library' | 'playback';

interface KeyboardShortcutsOptions {
  setView: (v: View) => void;
  toggleHelp: () => void;
  activeCueListId?: string | undefined;
}

export function useKeyboardShortcuts({
  setView,
  toggleHelp,
  activeCueListId,
}: KeyboardShortcutsOptions): void {
  const show = useShowStore((s) => s.show);
  const programmer = useProgrammer();

  // Mutable refs to avoid stale closures in event listeners
  const numBufRef = useRef<NumBuffer>(emptyNumBuffer());
  const flashStateRef = useRef<FlashState>(emptyFlashState());
  const flashedKeyRef = useRef<string | null>(null);

  const bindings = show?.settings.keyBindings ?? DEFAULT_KEY_BINDINGS;

  const dispatch = useCallback(
    (actionId: string) => {
      const fixtures = show?.fixtures ?? [];
      switch (actionId) {
        case 'cue.go': {
          const id = activeCueListId ?? show?.cueLists[0]?.id;
          if (id) {
            void fetch(`/api/cueLists/${id}/go`, { method: 'POST' });
          }
          break;
        }
        case 'cue.back': {
          const id = activeCueListId ?? show?.cueLists[0]?.id;
          if (id) {
            void fetch(`/api/cueLists/${id}/back`, { method: 'POST' });
          }
          break;
        }
        case 'programmer.clear':
          void programmer.clear();
          break;
        case 'programmer.selectAll':
          for (const f of fixtures) programmer.selectFixture(f.id, 'toggle');
          break;
        case 'programmer.deselectAll':
          programmer.deselectAll();
          break;
        case 'show.save':
          void fetch('/api/show/save', { method: 'POST' });
          break;
        case 'ui.help':
          toggleHelp();
          break;
        case 'ui.view.patch':
          setView('patch');
          break;
        case 'ui.view.programmer':
          setView('programmer');
          break;
        case 'ui.view.cuelist':
          setView('cuelist');
          break;
        case 'ui.view.chase':
          setView('chase');
          break;
        case 'ui.view.library':
          setView('library');
          break;
        case 'ui.panel.intensity':
          programmer.setActiveTab('intensity');
          break;
        case 'ui.panel.position':
          programmer.setActiveTab('position');
          break;
        case 'ui.panel.colour':
          programmer.setActiveTab('colour');
          break;
        case 'ui.panel.beam':
          programmer.setActiveTab('beam');
          break;
        case 'chase.tap': {
          void fetch('/api/show/tap', { method: 'POST' });
          break;
        }
        default: {
          // Playback masters F1–F8
          const masterMatch = /^playback\.master\.(\d)$/.exec(actionId);
          if (masterMatch) {
            const masterIdx = parseInt(masterMatch[1]!, 10) - 1;
            const master = show?.settings.playbackMasters[masterIdx];
            if (master?.assignedId) {
              if (master.assignedType === 'cueList') {
                void fetch(`/api/cueLists/${master.assignedId}/go`, { method: 'POST' });
              } else if (master.assignedType === 'chase') {
                void fetch(`/api/chases/${master.assignedId}/play`, { method: 'POST' });
              }
            }
          }
        }
      }
    },
    [show, activeCueListId, programmer, setView, toggleHelp],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      const ke = keyEventFromNative(e);

      // ── Flash mode (Shift+F1–F8 held) ────────────────────────────────────────
      const flashMatch = /^F([1-8])$/.exec(ke.key);
      if (flashMatch && ke.shift && flashedKeyRef.current === null) {
        flashedKeyRef.current = ke.key;
        const fixtures = show?.fixtures ?? [];
        const masterIdx = parseInt(flashMatch[1]!, 10) - 1;
        const master = show?.settings.playbackMasters[masterIdx];
        const masterId = master?.assignedId ?? null;
        if (masterId) {
          const masterFixtures = fixtures.filter((f) =>
            master?.assignedType === 'chase'
              ? true // for chases, flash all fixtures
              : (show?.cueLists
                  .find((cl) => cl.id === masterId)
                  ?.cues[0]?.values.map((v) => v.fixtureId)
                  .includes(f.id) ?? false),
          );
          const currentValues = useProgrammer.getState().values;
          const toSet = flashStart(
            masterFixtures.map((f) => f.id),
            currentValues,
            'Dimmer',
            flashStateRef.current,
          );
          for (const [fixtureId, value] of toSet) {
            void programmer.setChannels(fixtureId, { Dimmer: value });
          }
        }
        e.preventDefault();
        return;
      }

      // ── Numeric buffer ────────────────────────────────────────────────────────
      const isDigit = /^[0-9]$/.test(ke.key) && !ke.ctrl && !ke.alt;
      const isAtSign = ke.key === '@';

      if (
        isDigit ||
        isAtSign ||
        (ke.key === 'Enter' && numBufRef.current.mode !== 'idle') ||
        (ke.key === 'Escape' && numBufRef.current.mode !== 'idle')
      ) {
        const { next, result } = processNumKey(numBufRef.current, ke.key);
        numBufRef.current = next;

        if (result.type === 'select-fixture') {
          const fixtures = show?.fixtures ?? [];
          const id = resolveFixtureByNumber(result.fixtureNumber, fixtures);
          if (id) programmer.selectFixture(id, 'single');
          e.preventDefault();
          return;
        }
        if (result.type === 'set-value') {
          const fixtures = show?.fixtures ?? [];
          const id = resolveFixtureByNumber(result.fixtureNumber, fixtures);
          if (id) {
            programmer.selectFixture(id, 'single');
            void programmer.setChannels(id, { Dimmer: result.dmxValue });
          }
          e.preventDefault();
          return;
        }

        // Prevent default for digits when building a buffer
        if (isDigit && next.mode !== 'idle') {
          e.preventDefault();
          return;
        }
      }

      // ── Static binding resolution ─────────────────────────────────────────────
      const binding = resolveKey(ke, bindings);
      if (binding) {
        // Don't let cue.go fire when Enter is confirming a numeric buffer
        if (binding.actionId === 'cue.go' && numBufRef.current.mode !== 'idle') return;
        e.preventDefault();
        dispatch(binding.actionId);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // End flash on key release
      if (flashedKeyRef.current === e.key && e.shiftKey) {
        flashedKeyRef.current = null;
        const toRestore = flashEnd(flashStateRef.current);
        for (const [fixtureId, value] of toRestore) {
          void programmer.setChannels(fixtureId, { Dimmer: value });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [show, bindings, dispatch, programmer]);
}
