import { Router } from 'express';
import { validateDraft } from '../middleware/validation.js';

export function createResumeRouter(provider) {
  const router = Router();
  // POST /api/tailor-resume  { profile, job }  ->  { ok, resume, notes }
  router.post('/tailor-resume', validateDraft, async (req, res, next) => {
    try {
      const { text, notes } = await provider.tailorResume(req.validated);
      res.json({ ok: true, resume: text, notes });
    } catch (e) { next(e); }
  });
  return router;
}
