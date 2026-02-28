import { create } from 'zustand';
import type { Show, WsDmxTick, WsStateUpdate } from '@dmx-console/shared';

type DmxOutput = Record<number, number[]>;

interface ShowStore {
  show: Show | null;
  dmxOutput: DmxOutput;
  connected: boolean;

  setShow: (show: Show) => void;
  setConnected: (connected: boolean) => void;
  setDmxTick: (tick: WsDmxTick) => void;
  applyStateUpdate: (update: WsStateUpdate) => void;
}

export const useShowStore = create<ShowStore>((set) => ({
  show: null,
  dmxOutput: {},
  connected: false,

  setShow: (show) => set({ show }),

  setConnected: (connected) => set({ connected }),

  setDmxTick: (tick) =>
    set((state) => ({
      dmxOutput: { ...state.dmxOutput, [tick.universe]: tick.data },
    })),

  applyStateUpdate: (_update) => {
    // Re-fetch show state from server on any state change notification.
    // Full implementation in later phases.
    fetch('/api/state')
      .then((r) => r.json())
      .then((show: Show) => set({ show }))
      .catch(console.error);
  },
}));

// Bootstrap: load initial state
fetch('/api/state')
  .then((r) => r.json())
  .then((show: Show) => useShowStore.getState().setShow(show))
  .catch(console.error);
