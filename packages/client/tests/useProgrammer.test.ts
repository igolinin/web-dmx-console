import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProgrammer } from '../src/store/useProgrammer.js';

beforeEach(() => {
  useProgrammer.setState({ selectedIds: [], values: {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as unknown),
  );
});

describe('useProgrammer.clear', () => {
  it('clears programmer values and deselects all fixtures', async () => {
    useProgrammer.setState({ selectedIds: ['f1', 'f2'], values: { f1: { Dimmer: 100 } } });

    await useProgrammer.getState().clear();

    expect(useProgrammer.getState().selectedIds).toEqual([]);
    expect(useProgrammer.getState().values).toEqual({});
    expect(fetch).toHaveBeenCalledWith('/api/programmer/clear', expect.objectContaining({ method: 'POST' }));
  });
});
