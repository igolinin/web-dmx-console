import type { KeyBinding } from '@dmx-console/shared';

function formatKey(b: KeyBinding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push('Ctrl');
  if (b.shift) parts.push('Shift');
  if (b.alt) parts.push('Alt');
  const key = b.key === ' ' ? 'Space' : b.key;
  parts.push(key);
  return parts.join('+');
}

// Group bindings by category prefix
function groupBindings(bindings: KeyBinding[]): Map<string, KeyBinding[]> {
  const groups = new Map<string, KeyBinding[]>();
  const addTo = (group: string, b: KeyBinding) => {
    const list = groups.get(group) ?? [];
    list.push(b);
    groups.set(group, list);
  };

  for (const b of bindings) {
    if (b.actionId.startsWith('ui.view')) addTo('View Switching', b);
    else if (b.actionId.startsWith('ui.panel')) addTo('Attribute Panels', b);
    else if (b.actionId.startsWith('programmer')) addTo('Programmer', b);
    else if (b.actionId.startsWith('cue')) addTo('Cue List', b);
    else if (b.actionId.startsWith('chase') || b.actionId.startsWith('playback.master'))
      addTo('Chase & Playback', b);
    else if (b.actionId.startsWith('playback.flash')) addTo('Flash Masters', b);
    else addTo('Global', b);
  }
  return groups;
}

export function KeyMapModal({
  bindings,
  onClose,
}: {
  bindings: KeyBinding[];
  onClose: () => void;
}) {
  const groups = groupBindings(bindings);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-console-panel border border-console-border rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-console-border">
          <h2 className="text-console-text font-semibold">Keyboard Shortcuts</h2>
          <button className="text-console-dim hover:text-console-text text-sm" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* Numeric buffer tip */}
        <div className="px-4 py-2 border-b border-console-border bg-console-bg/50">
          <p className="text-xs text-console-dim">
            <span className="text-console-text">Numeric entry:</span>{' '}
            <code className="bg-console-panel px-1 rounded">1 @ 75 Enter</code>
            {' = '}select fixture 1, set dimmer to 75%
          </p>
        </div>

        {/* Bindings by group */}
        <div className="p-4 space-y-4">
          {[...groups.entries()].map(([group, items]) => (
            <div key={group}>
              <div className="text-xs font-semibold text-console-accent mb-1">{group}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {items.map((b, i) => (
                  <div key={i} className="flex justify-between items-center py-0.5">
                    <span className="text-xs text-console-dim">{b.description}</span>
                    <kbd className="text-[10px] bg-console-bg border border-console-border rounded px-1.5 py-0.5 text-console-text ml-2 shrink-0">
                      {formatKey(b)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
