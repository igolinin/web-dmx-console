import { create } from 'zustand';
import type { ChannelValues, PatchedFixture } from '@dmx-console/shared';

interface ProgrammerStore {
  /** Currently selected fixture IDs. */
  selectedIds: string[];
  /** Local mirror of programmer values: fixtureId → {channelName → 0–255}. */
  values: Record<string, ChannelValues>;
  /** Active attribute panel tab. */
  activeTab: 'intensity' | 'position' | 'colour' | 'beam' | 'raw';

  // Selection
  selectFixture: (id: string, mode: 'single' | 'toggle') => void;
  selectRange: (id: string, allFixtures: PatchedFixture[]) => void;
  deselectAll: () => void;
  setActiveTab: (tab: ProgrammerStore['activeTab']) => void;

  // Programmer value setters (optimistically update local, then sync server)
  setChannels: (fixtureId: string, channels: ChannelValues) => Promise<void>;
  setSelectedChannels: (channels: ChannelValues) => Promise<void>;
  clear: () => Promise<void>;

  // Internal — update local mirror from server response
  _patchValues: (fixtureId: string, channels: ChannelValues) => void;
  _clearValues: (fixtureId?: string) => void;
}

async function postJson(url: string, body: unknown): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const useProgrammer = create<ProgrammerStore>((set, get) => ({
  selectedIds: [],
  values: {},
  activeTab: 'intensity',

  selectFixture(id, mode) {
    set((s) => {
      if (mode === 'toggle') {
        const already = s.selectedIds.includes(id);
        return {
          selectedIds: already ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
        };
      }
      // single: replace selection
      return { selectedIds: [id] };
    });
  },

  selectRange(id, allFixtures) {
    set((s) => {
      const allIds = allFixtures.map((f) => f.id);
      const lastId = s.selectedIds[s.selectedIds.length - 1];
      if (!lastId) return { selectedIds: [id] };

      const fromIdx = allIds.indexOf(lastId);
      const toIdx = allIds.indexOf(id);
      if (fromIdx === -1 || toIdx === -1) return { selectedIds: [id] };

      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const range = allIds.slice(lo, hi + 1);
      const merged = [...new Set([...s.selectedIds, ...range])];
      return { selectedIds: merged };
    });
  },

  deselectAll() {
    set({ selectedIds: [] });
  },

  setActiveTab(tab) {
    set({ activeTab: tab });
  },

  async setChannels(fixtureId, channels) {
    // Optimistic update
    get()._patchValues(fixtureId, channels);
    await postJson('/api/programmer/set', { fixtureId, channels });
  },

  async setSelectedChannels(channels) {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;

    // Optimistic update for all selected fixtures
    for (const id of selectedIds) {
      get()._patchValues(id, channels);
    }

    await postJson(
      '/api/programmer/setMany',
      selectedIds.map((fixtureId) => ({ fixtureId, channels })),
    );
  },

  async clear() {
    get()._clearValues();
    await postJson('/api/programmer/clear', {});
  },

  _patchValues(fixtureId, channels) {
    set((s) => ({
      values: {
        ...s.values,
        [fixtureId]: { ...(s.values[fixtureId] ?? {}), ...channels },
      },
    }));
  },

  _clearValues(fixtureId?: string) {
    if (fixtureId !== undefined) {
      set((s) => {
        const next = { ...s.values };
        delete next[fixtureId];
        return { values: next };
      });
    } else {
      set({ values: {} });
    }
  },
}));
