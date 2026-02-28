import { Router } from 'express';
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
