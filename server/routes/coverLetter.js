import { Router } from 'express';
import { validateDraft } from '../middleware/validation.js';

export function createCoverLetterRouter(provider) {
  const router = Router();
  // POST /api/generate-cover-letter  { profile, job }  ->  { ok, coverLetter, notes }
  router.post('/generate-cover-letter', validateDraft, async (req, res, next) => {
    try {
      const { text, notes } = await provider.generateCoverLetter(req.validated);
      res.json({ ok: true, coverLetter: text, notes });
    } catch (e) { next(e); }
  });
  return router;
}
