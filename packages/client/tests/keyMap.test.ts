import { describe, it, expect } from 'vitest';
import {
  resolveKey,
  processNumKey,
  resolveFixtureByNumber,
  emptyNumBuffer,
  flashStart,
  flashEnd,
  emptyFlashState,
  PLAYBACK_UP_KEYS,
  PLAYBACK_DOWN_KEYS,
  PLAYBACK_FLASH_KEYS,
  PLAYBACK_GRID_KEYS,
} from '../src/keyboard/keyMap.js';
import { DEFAULT_KEY_BINDINGS } from '@dmx-console/shared';
import type { KeyBinding } from '@dmx-console/shared';

// ── resolveKey ────────────────────────────────────────────────────────────────

describe('resolveKey', () => {
  it('Space → cue.go', () => {
    const binding = resolveKey({ key: ' ', ctrl: false, shift: false, alt: false }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('cue.go');
  });

  it('Escape → programmer.clear', () => {
    const binding = resolveKey({ key: 'Escape', ctrl: false, shift: false, alt: false }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('programmer.clear');
  });

  it('Backspace → cue.back', () => {
    const binding = resolveKey({ key: 'Backspace', ctrl: false, shift: false, alt: false }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('cue.back');
  });

  it('Ctrl+S → show.save', () => {
    const binding = resolveKey({ key: 's', ctrl: true, shift: false, alt: false }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('show.save');
  });

  it('Alt+1 → ui.view.patch', () => {
    const binding = resolveKey({ key: '1', ctrl: false, shift: false, alt: true }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('ui.view.patch');
  });

  it('Alt+3 → ui.view.cuelist', () => {
    const binding = resolveKey({ key: '3', ctrl: false, shift: false, alt: true }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('ui.view.cuelist');
  });

  it('F1 (no shift) → playback.master.1', () => {
    const binding = resolveKey({ key: 'F1', ctrl: false, shift: false, alt: false }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('playback.master.1');
  });

  it('Shift+F1 → playback.flash.1', () => {
    const binding = resolveKey({ key: 'F1', ctrl: false, shift: true, alt: false }, DEFAULT_KEY_BINDINGS);
    expect(binding?.actionId).toBe('playback.flash.1');
  });

  it('returns null for unbound key', () => {
    const binding = resolveKey({ key: 'z', ctrl: false, shift: false, alt: false }, DEFAULT_KEY_BINDINGS);
    expect(binding).toBeNull();
  });

  it('exact modifier match required — Ctrl+S does not match bare S', () => {
    const bindings: KeyBinding[] = [
      { key: 's', ctrl: true, description: 'Save', actionId: 'show.save' },
    ];
    const binding = resolveKey({ key: 's', ctrl: false, shift: false, alt: false }, bindings);
    expect(binding).toBeNull();
  });
});

// ── Numeric buffer ────────────────────────────────────────────────────────────

describe('processNumKey', () => {
  it('starts idle, digit starts fixture buffer', () => {
    const { next } = processNumKey(emptyNumBuffer(), '1');
    expect(next.mode).toBe('fixture');
    expect(next.fixtureBuf).toBe('1');
  });

  it('non-digit in idle mode does nothing', () => {
    const { next, result } = processNumKey(emptyNumBuffer(), 'a');
    expect(next.mode).toBe('idle');
    expect(result.type).toBe('none');
  });

  it('fixture mode: digit appends', () => {
    let buf = emptyNumBuffer();
    ({ next: buf } = processNumKey(buf, '1'));
    const { next } = processNumKey(buf, '2');
    expect(next.fixtureBuf).toBe('12');
  });

  it('fixture mode: @ switches to value mode', () => {
    let buf = emptyNumBuffer();
    ({ next: buf } = processNumKey(buf, '1'));
    const { next } = processNumKey(buf, '@');
    expect(next.mode).toBe('value');
  });

  it('fixture mode: Enter → select-fixture action', () => {
    let buf = emptyNumBuffer();
    ({ next: buf } = processNumKey(buf, '3'));
    const { result, next } = processNumKey(buf, 'Enter');
    expect(result.type).toBe('select-fixture');
    if (result.type === 'select-fixture') {
      expect(result.fixtureNumber).toBe(3);
    }
    expect(next.mode).toBe('idle');
  });

  it('full sequence 1 @ 7 5 Enter → set-value fixture=1, pct=75, dmxValue=191', () => {
    const keys = ['1', '@', '7', '5', 'Enter'];
    let buf = emptyNumBuffer();
    let finalResult = { type: 'none' } as ReturnType<typeof processNumKey>['result'];
    for (const key of keys) {
      const out = processNumKey(buf, key);
      buf = out.next;
      finalResult = out.result;
    }
    expect(finalResult.type).toBe('set-value');
    if (finalResult.type === 'set-value') {
      expect(finalResult.fixtureNumber).toBe(1);
      expect(finalResult.valuePct).toBe(75);
      expect(finalResult.dmxValue).toBe(191);
    }
  });

  it('full sequence 2 @ 1 0 0 Enter → set-value pct=100, dmxValue=255', () => {
    const keys = ['2', '@', '1', '0', '0', 'Enter'];
    let buf = emptyNumBuffer();
    let finalResult = { type: 'none' } as ReturnType<typeof processNumKey>['result'];
    for (const key of keys) {
      const out = processNumKey(buf, key);
      buf = out.next;
      finalResult = out.result;
    }
    expect(finalResult.type).toBe('set-value');
    if (finalResult.type === 'set-value') {
      expect(finalResult.valuePct).toBe(100);
      expect(finalResult.dmxValue).toBe(255);
    }
  });

  it('Escape in fixture mode clears buffer', () => {
    let buf = emptyNumBuffer();
    ({ next: buf } = processNumKey(buf, '3'));
    const { next } = processNumKey(buf, 'Escape');
    expect(next.mode).toBe('idle');
  });

  it('Escape in value mode clears buffer', () => {
    const keys = ['1', '@', '5'];
    let buf = emptyNumBuffer();
    for (const key of keys) {
      ({ next: buf } = processNumKey(buf, key));
    }
    const { next } = processNumKey(buf, 'Escape');
    expect(next.mode).toBe('idle');
  });

  it('value > 100 is clamped to 100', () => {
    const keys = ['1', '@', '1', '5', '0', 'Enter'];
    let buf = emptyNumBuffer();
    let finalResult = { type: 'none' } as ReturnType<typeof processNumKey>['result'];
    for (const key of keys) {
      const out = processNumKey(buf, key);
      buf = out.next;
      finalResult = out.result;
    }
    expect(finalResult.type).toBe('set-value');
    if (finalResult.type === 'set-value') {
      expect(finalResult.valuePct).toBe(100);
    }
  });
});

// ── resolveFixtureByNumber ────────────────────────────────────────────────────

describe('resolveFixtureByNumber', () => {
  const fixtures = [
    { id: 'f-a' },
    { id: 'f-b' },
    { id: 'f-c' },
  ];

  it('fixture #1 → first fixture ID', () => {
    expect(resolveFixtureByNumber(1, fixtures)).toBe('f-a');
  });

  it('fixture #3 → third fixture ID', () => {
    expect(resolveFixtureByNumber(3, fixtures)).toBe('f-c');
  });

  it('returns null for out-of-range number', () => {
    expect(resolveFixtureByNumber(5, fixtures)).toBeNull();
    expect(resolveFixtureByNumber(0, fixtures)).toBeNull();
  });
});

// ── Flash mode ────────────────────────────────────────────────────────────────

describe('flash mode', () => {
  it('flashStart sets fixtures to 255 and records previous values', () => {
    const state = emptyFlashState();
    const currentValues = { f1: { Dimmer: 100 }, f2: { Dimmer: 50 } };
    const toSet = flashStart(['f1', 'f2'], currentValues, 'Dimmer', state);

    expect(toSet.get('f1')).toBe(255);
    expect(toSet.get('f2')).toBe(255);
    expect(state.held.get('f1')).toBe(100);
    expect(state.held.get('f2')).toBe(50);
  });

  it('flashEnd restores previous values', () => {
    const state = emptyFlashState();
    const currentValues = { f1: { Dimmer: 100 } };
    flashStart(['f1'], currentValues, 'Dimmer', state);
    const toRestore = flashEnd(state);

    expect(toRestore.get('f1')).toBe(100);
    expect(state.held.size).toBe(0);
  });

  it('flashStart records 0 when fixture has no prior value', () => {
    const state = emptyFlashState();
    const toSet = flashStart(['f1'], {}, 'Dimmer', state);
    expect(toSet.get('f1')).toBe(255);
    expect(state.held.get('f1')).toBe(0);
  });
});

// ── Playback keyboard grid ──────────────────────────────────────────────────

describe('playback keyboard grid', () => {
  it('each row maps to exactly the 10 masters', () => {
    expect(PLAYBACK_UP_KEYS).toHaveLength(10);
    expect(PLAYBACK_DOWN_KEYS).toHaveLength(10);
    expect(PLAYBACK_FLASH_KEYS).toHaveLength(10);
  });

  it('rows do not overlap (30 distinct keys)', () => {
    expect(PLAYBACK_GRID_KEYS.size).toBe(30);
  });

  it('grid set contains every row key', () => {
    for (const k of [...PLAYBACK_UP_KEYS, ...PLAYBACK_DOWN_KEYS, ...PLAYBACK_FLASH_KEYS]) {
      expect(PLAYBACK_GRID_KEYS.has(k)).toBe(true);
    }
  });
});
