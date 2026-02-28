import { Router } from 'express';
import { z } from 'zod';
import type { KeyBinding } from '@dmx-console/shared';
import { show, touchShow } from '../store/show.js';
import { saveShow, loadShowFromDisk } from '../store/persist.js';

export const showFileRouter = Router();

/** GET /api/show — download current show as JSON */
showFileRouter.get('/', (_req, res) => {
  res.json(show);
});

/** POST /api/show/save — persist show to disk */
showFileRouter.post('/save', (_req, res) => {
  void (async () => {
    try {
      await saveShow(show);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  })();
});

// ── Settings ──────────────────────────────────────────────────────────────────

const KeyBindingSchema = z.object({
  key: z.string(),
  ctrl: z.boolean().optional(),
  shift: z.boolean().optional(),
  alt: z.boolean().optional(),
  description: z.string(),
  actionId: z.string(),
});

/** PATCH /api/show/settings — update show settings (keyBindings, playbackMasters, etc.) */
showFileRouter.patch('/settings', (req, res) => {
  const parsed = z
    .object({
      keyBindings: z.array(KeyBindingSchema).optional(),
      activeCueListId: z.string().optional(),
      activeChaseId: z.string().optional(),
      playbackMasters: z.array(z.string()).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    return;
  }

  const d = parsed.data;
  if (d.keyBindings !== undefined) show.settings.keyBindings = d.keyBindings as KeyBinding[];
  if (d.activeCueListId !== undefined) show.settings.activeCueListId = d.activeCueListId;
  if (d.activeChaseId !== undefined) show.settings.activeChaseId = d.activeChaseId;
  if (d.playbackMasters !== undefined) show.settings.playbackMasters = d.playbackMasters;

  touchShow();
  res.json(show.settings);
});

/** POST /api/show/load — reload show from disk */
showFileRouter.post('/load', (_req, res) => {
  void (async () => {
    try {
      const loaded = await loadShowFromDisk();
      if (!loaded) {
        res.status(404).json({ error: 'No saved show file found' });
        return;
      }
      Object.assign(show, loaded);
      touchShow();
      res.json(show);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  })();
});
