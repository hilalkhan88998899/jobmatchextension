// Small in-memory per-IP rate limiter (no dependency). Fine for a single-instance backend;
// use a shared store (e.g. Redis) if you scale horizontally.
export function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(key, entry); }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute and try again.' } });
    }
    next();
  };
}
