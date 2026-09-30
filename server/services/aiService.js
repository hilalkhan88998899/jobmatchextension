// AI provider abstraction. Routes only talk to AIProvider; swap providers with AI_PROVIDER in .env.
import { AppError } from '../utils/errors.js';
import { normalizeAnalysis, normalizeDraft } from '../utils/normalize.js';
import {
  JOB_ANALYSIS_PROMPT, RESUME_TAILOR_PROMPT, COVER_LETTER_PROMPT,
  buildAnalysisMessage, buildResumeMessage, buildCoverLetterMessage
} from '../utils/prompts.js';

export function parseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no json object');
  return JSON.parse(t.slice(start, end + 1));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new AppError(504, 'AI_TIMEOUT', 'The AI service took too long to respond. Please try again.');
    throw new AppError(503, 'AI_UNAVAILABLE', 'AI service is temporarily unavailable.');
  } finally { clearTimeout(timer); }
}

// Never forward provider response bodies (they may echo prompt text).
function httpError(status) {
  if (status === 429) return new AppError(429, 'AI_RATE_LIMIT', 'The AI service is busy or its rate limit was reached. Please wait a minute and try again.');
  if (status === 400 || status === 401 || status === 403 || status === 404)
    return new AppError(502, 'AI_CONFIG', 'The AI service is not configured correctly. Check the API key and model name in server/.env.');
  return new AppError(503, 'AI_UNAVAILABLE', 'AI service is temporarily unavailable.');
}

export class AIProvider {
  constructor(env = process.env) {
    this.timeoutMs = Number(env.AI_TIMEOUT_MS) || 45000;
  }
  get name() { return 'base'; }
  isConfigured() { return false; }
  /** @returns {Promise<string>} raw model text (expected to be JSON) */
  async complete(/* { system, user } */) { throw new Error('complete() not implemented'); }

  async completeJSON(args) {
    if (!this.isConfigured()) throw new AppError(503, 'AI_NOT_CONFIGURED', 'The AI service is not configured on the server. Add an API key to server/.env.');
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.complete(args);
      try { return parseJSON(text); } catch { /* retry once */ }
    }
    throw new AppError(502, 'AI_BAD_RESPONSE', 'The AI returned an unreadable response. Please try again.');
  }

  async analyzeJob(input) {
    return normalizeAnalysis(await this.completeJSON({ system: JOB_ANALYSIS_PROMPT, user: buildAnalysisMessage(input) }));
  }
  async tailorResume(input) {
    return normalizeDraft(await this.completeJSON({ system: RESUME_TAILOR_PROMPT, user: buildResumeMessage(input) }), 'resumeText');
  }
  async generateCoverLetter(input) {
    return normalizeDraft(await this.completeJSON({ system: COVER_LETTER_PROMPT, user: buildCoverLetterMessage(input) }), 'coverLetter');
  }
}

export class GeminiProvider extends AIProvider {
  constructor(env = process.env) {
    super(env);
    this.key = env.GEMINI_API_KEY;
    this.model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  }
  get name() { return `gemini:${this.model}`; }
  isConfigured() { return Boolean(this.key) && this.key !== 'your_key_here'; }
  async complete({ system, user }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' }
      })
    }, this.timeoutMs);
    if (!res.ok) throw httpError(res.status);
    const data = await res.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) throw new AppError(502, 'AI_BAD_RESPONSE', 'The AI returned an empty response. Please try again.');
    return text;
  }
}

export class OpenAICompatibleProvider extends AIProvider {
  constructor(env = process.env) {
    super(env);
    this.key = env.OPENAI_API_KEY;
    this.model = env.OPENAI_MODEL || 'gpt-4o-mini';
    this.baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  }
  get name() { return `openai:${this.model}`; }
  isConfigured() { return Boolean(this.key); }
  async complete({ system, user }) {
    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.model, temperature: 0.2, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    }, this.timeoutMs);
    if (!res.ok) throw httpError(res.status);
    const data = await res.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) throw new AppError(502, 'AI_BAD_RESPONSE', 'The AI returned an empty response. Please try again.');
    return text;
  }
}

export function createProvider(env = process.env) {
  switch ((env.AI_PROVIDER || 'gemini').toLowerCase()) {
    case 'openai': return new OpenAICompatibleProvider(env);
    case 'gemini': return new GeminiProvider(env);
    default: throw new Error(`Unknown AI_PROVIDER "${env.AI_PROVIDER}". Use "gemini" or "openai".`);
  }
}
