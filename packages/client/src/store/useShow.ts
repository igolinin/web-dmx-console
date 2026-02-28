import { create } from 'zustand';
import type { Show, FixtureDef, WsDmxTick, WsStateUpdate } from '@dmx-console/shared';

type DmxOutput = Record<number, number[]>;

interface ShowStore {
  show: Show | null;
  dmxOutput: DmxOutput;
  connected: boolean;
  /** Fixture definition library, keyed by defId. */
  defMap: Record<string, FixtureDef>;

  setShow: (show: Show) => void;
  setConnected: (connected: boolean) => void;
  setDmxTick: (tick: WsDmxTick) => void;
  applyStateUpdate: (update: WsStateUpdate) => void;
  setDefMap: (defs: FixtureDef[]) => void;
}

export const useShowStore = create<ShowStore>((set) => ({
  show: null,
  dmxOutput: {},
  connected: false,
  defMap: {},

  setShow: (show) => set({ show }),

  setConnected: (connected) => set({ connected }),

  setDmxTick: (tick) =>
    set((state) => ({
      dmxOutput: { ...state.dmxOutput, [tick.universe]: tick.data },
    })),

  applyStateUpdate: (_update) => {
    // Re-fetch show state from server on any state change notification.
    fetch('/api/state')
      .then((r) => r.json())
      .then((show: Show) => set({ show }))
      .catch(console.error);
  },

  setDefMap: (defs) => {
    const map: Record<string, FixtureDef> = {};
    for (const d of defs) map[d.id] = d;
    set({ defMap: map });
  },
}));

// Bootstrap: load initial state + fixture library
fetch('/api/state')
  .then((r) => r.json())
  .then((show: Show) => useShowStore.getState().setShow(show))
  .catch(console.error);

fetch('/api/fixtures')
  .then((r) => r.json() as Promise<FixtureDef[]>)
  .then((defs) => useShowStore.getState().setDefMap(defs))
  .catch(console.error);
