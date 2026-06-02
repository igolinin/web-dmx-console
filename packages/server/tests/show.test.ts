import { describe, it, expect, vi, afterEach } from 'vitest';
import { touchShow, setShowBroadcaster } from '../src/store/show.js';

afterEach(() => {
  // Reset the broadcaster so tests don't leak into each other.
  setShowBroadcaster(() => undefined);
});

describe('touchShow broadcaster', () => {
  it('invokes the registered broadcaster on every touch', () => {
    const fn = vi.fn();
    setShowBroadcaster(fn);
    touchShow();
    touchShow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not throw when no broadcaster is registered', () => {
    setShowBroadcaster(undefined as unknown as () => void);
    // Re-register null-equivalent by clearing; touchShow must stay safe.
    expect(() => touchShow()).not.toThrow();
  });
});
