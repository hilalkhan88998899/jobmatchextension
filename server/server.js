import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { createProvider } from './services/aiService.js';
import { rateLimit } from './middleware/rateLimit.js';
import { AppError } from './utils/errors.js';
import { createAnalyzeRouter } from './routes/analyze.js';
import { createResumeRouter } from './routes/resume.js';
import { createCoverLetterRouter } from './routes/coverLetter.js';

const csv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

export function createApp(provider, env = process.env) {
  const app = express();
  app.disable('x-powered-by');

  const extensionIds = csv(env.ALLOWED_EXTENSION_IDS);
  const extraOrigins = csv(env.ALLOWED_ORIGINS);
  const originAllowed = (origin) =>
    !origin || // curl / server-to-server
    extraOrigins.includes(origin) ||
    (origin.startsWith('chrome-extension://') &&
      (extensionIds.length === 0 || extensionIds.includes(origin.slice('chrome-extension://'.length))));

  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    next();
  });
  app.use((req, res, next) =>
    originAllowed(req.headers.origin) ? next() : next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.')));
  app.use(cors({ origin: true, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'], maxAge: 600 }));
  app.use(express.json({ limit: '200kb' })); // request size limit

  // Health check (no rate limit, no secrets)
  app.get('/api/health', (req, res) =>
    res.json({ ok: true, service: 'jobmatch-ai', provider: provider.name, configured: provider.isConfigured() }));

  app.use('/api', rateLimit({ windowMs: Number(env.RATE_LIMIT_WINDOW_MS) || 60_000, max: Number(env.RATE_LIMIT_MAX) || 30 }));
  app.use('/api', createAnalyzeRouter(provider), createResumeRouter(provider), createCoverLetterRouter(provider));

  app.use((req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }));

  // Central error handler. Never returns stack traces; never logs request bodies (resume/profile data).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = 500, code = 'SERVER_ERROR', message = 'Something went wrong on the server. Please try again.';
    if (err instanceof AppError) ({ status, code, message } = err);
    else if (err?.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'The request contained invalid JSON.'; }
    else if (err?.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'The request is too large.'; }
    if (status >= 500) console.error(`[jobmatch] ${code}: ${err?.name || 'Error'}`);
    res.status(status).json({ ok: false, error: { code, message } });
  });

  return app;
}

// Start the server only when run directly (so tests can import createApp).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const provider = createProvider(process.env);
  const port = Number(process.env.PORT) || 3000;
  createApp(provider).listen(port, '127.0.0.1', () => {
    console.log(`JobMatch AI server on http://localhost:${port}  (provider: ${provider.name}, configured: ${provider.isConfigured()})`);
    if (!provider.isConfigured()) console.warn('WARNING: no API key set. Copy .env.example to .env and add your key.');
  });
}
