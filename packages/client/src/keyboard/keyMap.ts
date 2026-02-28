import type { KeyBinding } from '@dmx-console/shared';

// ── Key event type ────────────────────────────────────────────────────────────

export interface KeyEvent {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export function keyEventFromNative(e: KeyboardEvent): KeyEvent {
  return { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey };
}

// ── Key resolver ──────────────────────────────────────────────────────────────

/** Returns the first binding that matches the key event, or null. */
export function resolveKey(event: KeyEvent, bindings: KeyBinding[]): KeyBinding | null {
  for (const binding of bindings) {
    if (
      binding.key === event.key &&
      !!binding.ctrl === event.ctrl &&
      !!binding.shift === event.shift &&
      !!binding.alt === event.alt
    ) {
      return binding;
    }
  }
  return null;
}

/** Whether a key event should be ignored (focus is inside a text input). */
export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' || tag === 'textarea' || tag === 'select' || el.hasAttribute('contenteditable')
  );
}

// ── Numeric buffer state machine ──────────────────────────────────────────────

export type NumBufferMode = 'idle' | 'fixture' | 'value';

export interface NumBuffer {
  mode: NumBufferMode;
  fixtureBuf: string; // digits for fixture number
  valueBuf: string; // digits for value (0–100)
}

export function emptyNumBuffer(): NumBuffer {
  return { mode: 'idle', fixtureBuf: '', valueBuf: '' };
}

export type NumBufferResult =
  | { type: 'select-fixture'; fixtureNumber: number }
  | { type: 'set-value'; fixtureNumber: number; valuePct: number; dmxValue: number }
  | { type: 'none' };

/**
 * Process a key press through the numeric buffer state machine.
 * Returns the next buffer state and an optional action to dispatch.
 */
export function processNumKey(
  buf: NumBuffer,
  key: string,
): { next: NumBuffer; result: NumBufferResult } {
  const isDigit = /^[0-9]$/.test(key);

  if (buf.mode === 'idle') {
    if (isDigit) {
      return {
        next: { mode: 'fixture', fixtureBuf: key, valueBuf: '' },
        result: { type: 'none' },
      };
    }
    return { next: buf, result: { type: 'none' } };
  }

  if (buf.mode === 'fixture') {
    if (isDigit) {
      return {
        next: { ...buf, fixtureBuf: buf.fixtureBuf + key },
        result: { type: 'none' },
      };
    }
    if (key === '@') {
      return {
        next: { ...buf, mode: 'value', valueBuf: '' },
        result: { type: 'none' },
      };
    }
    if (key === 'Enter') {
      const fixtureNumber = parseInt(buf.fixtureBuf, 10);
      return {
        next: emptyNumBuffer(),
        result: { type: 'select-fixture', fixtureNumber },
      };
    }
    if (key === 'Escape') {
      return { next: emptyNumBuffer(), result: { type: 'none' } };
    }
    return { next: buf, result: { type: 'none' } };
  }

  // mode === 'value'
  if (isDigit) {
    return {
      next: { ...buf, valueBuf: buf.valueBuf + key },
      result: { type: 'none' },
    };
  }
  if (key === 'Enter' && buf.valueBuf.length > 0) {
    const fixtureNumber = parseInt(buf.fixtureBuf, 10);
    const valuePct = Math.min(100, Math.max(0, parseInt(buf.valueBuf, 10)));
    const dmxValue = Math.round((valuePct / 100) * 255);
    return {
      next: emptyNumBuffer(),
      result: { type: 'set-value', fixtureNumber, valuePct, dmxValue },
    };
  }
  if (key === 'Escape') {
    return { next: emptyNumBuffer(), result: { type: 'none' } };
  }
  return { next: buf, result: { type: 'none' } };
}

// ── Fixture number → ID resolution ───────────────────────────────────────────

/**
 * Resolve a 1-based fixture number to a fixture ID.
 * Fixtures are ordered by their array index in show.fixtures.
 */
export function resolveFixtureByNumber(
  fixtureNumber: number,
  fixtures: { id: string }[],
): string | null {
  const idx = fixtureNumber - 1;
  return fixtures[idx]?.id ?? null;
}

// ── Flash mode tracker ────────────────────────────────────────────────────────

/** Tracks fixtures currently being flashed (held at 100%). */
export interface FlashState {
  /** fixtureId → dimmer value before flash started */
  held: Map<string, number>;
}

export function emptyFlashState(): FlashState {
  return { held: new Map() };
}

/** Start flashing a set of fixtures. Returns dimmer channel values to set. */
export function flashStart(
  fixtureIds: string[],
  currentValues: Record<string, Record<string, number>>,
  dimmerChannelName: string,
  state: FlashState,
): Map<string, number> {
  const toSet = new Map<string, number>();
  for (const id of fixtureIds) {
    const prev = currentValues[id]?.[dimmerChannelName] ?? 0;
    state.held.set(id, prev);
    toSet.set(id, 255);
  }
  return toSet;
}

/** End flash — return previous values. */
export function flashEnd(state: FlashState): Map<string, number> {
  const toRestore = new Map(state.held);
  state.held.clear();
  return toRestore;
}
