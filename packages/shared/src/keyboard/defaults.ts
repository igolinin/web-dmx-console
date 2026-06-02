import type { KeyBinding, PlaybackMaster } from '../types/index.js';

export const DEFAULT_PLAYBACK_MASTERS: PlaybackMaster[] = Array.from({ length: 10 }, (_, i) => ({
  id: `master_${i}`,
  label: `M${i + 1}`,
  assignedId: null,
  assignedType: null,
  level: 100,
}));

export const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  // ── Global ──────────────────────────────────────────────────────────────────
  { key: ' ', description: 'Cue Go', actionId: 'cue.go' },
  { key: 'Enter', description: 'Cue Go', actionId: 'cue.go' },
  { key: 'Backspace', description: 'Cue Back', actionId: 'cue.back' },
  { key: 'Escape', description: 'Clear programmer', actionId: 'programmer.clear' },
  { key: 's', ctrl: true, description: 'Save show', actionId: 'show.save' },
  { key: '?', description: 'Toggle help', actionId: 'ui.help' },
  // ── View switching ───────────────────────────────────────────────────────────
  { key: '1', alt: true, description: 'Patch view', actionId: 'ui.view.patch' },
  { key: '2', alt: true, description: 'Programmer view', actionId: 'ui.view.programmer' },
  { key: '3', alt: true, description: 'Cue list view', actionId: 'ui.view.cuelist' },
  { key: '4', alt: true, description: 'Library view', actionId: 'ui.view.library' },
  // ── Fixture selection ────────────────────────────────────────────────────────
  { key: 'a', ctrl: true, description: 'Select all fixtures', actionId: 'programmer.selectAll' },
  { key: 'd', ctrl: true, description: 'Deselect all', actionId: 'programmer.deselectAll' },
  // ── Attribute panels ─────────────────────────────────────────────────────────
  { key: 'i', description: 'Intensity panel', actionId: 'ui.panel.intensity' },
  { key: 'p', description: 'Position panel', actionId: 'ui.panel.position' },
  { key: 'c', description: 'Colour panel', actionId: 'ui.panel.colour' },
  { key: 'b', description: 'Beam panel', actionId: 'ui.panel.beam' },
  // ── Playback / Chase ─────────────────────────────────────────────────────────
  { key: 't', description: 'Tap tempo', actionId: 'chase.tap' },
  // ── Playback masters (F1–F8) ─────────────────────────────────────────────────
  { key: 'F1', description: 'Playback master 1', actionId: 'playback.master.1' },
  { key: 'F2', description: 'Playback master 2', actionId: 'playback.master.2' },
  { key: 'F3', description: 'Playback master 3', actionId: 'playback.master.3' },
  { key: 'F4', description: 'Playback master 4', actionId: 'playback.master.4' },
  { key: 'F5', description: 'Playback master 5', actionId: 'playback.master.5' },
  { key: 'F6', description: 'Playback master 6', actionId: 'playback.master.6' },
  { key: 'F7', description: 'Playback master 7', actionId: 'playback.master.7' },
  { key: 'F8', description: 'Playback master 8', actionId: 'playback.master.8' },
  // Flash versions (Shift+F1..F8)
  { key: 'F1', shift: true, description: 'Flash master 1', actionId: 'playback.flash.1' },
  { key: 'F2', shift: true, description: 'Flash master 2', actionId: 'playback.flash.2' },
  { key: 'F3', shift: true, description: 'Flash master 3', actionId: 'playback.flash.3' },
  { key: 'F4', shift: true, description: 'Flash master 4', actionId: 'playback.flash.4' },
  { key: 'F5', shift: true, description: 'Flash master 5', actionId: 'playback.flash.5' },
  { key: 'F6', shift: true, description: 'Flash master 6', actionId: 'playback.flash.6' },
  { key: 'F7', shift: true, description: 'Flash master 7', actionId: 'playback.flash.7' },
  { key: 'F8', shift: true, description: 'Flash master 8', actionId: 'playback.flash.8' },
];
