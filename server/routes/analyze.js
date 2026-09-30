import { Router } from 'express';
import { validateAnalyze } from '../middleware/validation.js';

export function createAnalyzeRouter(provider) {
  const router = Router();
  // POST /api/analyze-job  { profile, job }  ->  { ok, analysis }
  router.post('/analyze-job', validateAnalyze, async (req, res, next) => {
    try {
      res.json({ ok: true, analysis: await provider.analyzeJob(req.validated) });
    } catch (e) { next(e); }
  });
  return router;
}
