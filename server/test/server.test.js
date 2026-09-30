import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnalysis, normalizeDraft } from '../utils/normalize.js';
import { sanitizeProfile, sanitizeJob } from '../middleware/validation.js';
import { AIProvider, parseJSON } from '../services/aiService.js';

test('parseJSON strips markdown fences', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
});

test('normalizeAnalysis coerces statuses and drops junk', () => {
  const a = normalizeAnalysis({
    summary: 'ok', matchedRequirements: ['React', 5, null], missingRequirements: ['TypeScript'],
    education: { status: 'Matched', details: 'BS CS' }, experience: { status: 'gap', required: '2+ years', profile: '1 year' },
    location: { status: 'weird' }, evidence: ['plain string', { requirement: 'r', status: 'missing' }]
  });
  assert.equal(a.education.status, 'matched');
  assert.equal(a.experience.status, 'not_matched');
  assert.equal(a.location.status, 'unclear');
  assert.equal(a.jobType.status, 'unclear');
  assert.deepEqual(a.matchedRequirements, ['React', '5']);
  assert.equal(a.evidence.length, 2);
});

test('normalizeAnalysis rejects empty / malformed output', () => {
  assert.throws(() => normalizeAnalysis(null), { code: 'AI_BAD_RESPONSE' });
  assert.throws(() => normalizeAnalysis({}), { code: 'AI_BAD_RESPONSE' });
});

test('normalizeDraft requires text', () => {
  assert.throws(() => normalizeDraft({ resumeText: 'short' }, 'resumeText'), { code: 'AI_BAD_RESPONSE' });
  assert.equal(normalizeDraft({ resumeText: 'x'.repeat(60), notes: ['n'] }, 'resumeText').notes[0], 'n');
});

test('analysis profile omits identity and links', () => {
  const p = sanitizeProfile({ fullName: 'Ali Khan', githubUrl: 'https://github.com/x', skills: ['React'] });
  assert.equal(p.fullName, undefined);
  assert.equal(p.links, undefined);
  assert.deepEqual(p.skills, ['React']);
  const d = sanitizeProfile({ fullName: 'Ali Khan', githubUrl: 'javascript:alert(1)' }, { identity: true });
  assert.equal(d.fullName, 'Ali Khan');
  assert.equal(d.links.github, '');
});

test('sanitizeJob validates URLs and trims', () => {
  assert.equal(sanitizeJob({ url: 'ftp://x' }).url, '');
  assert.equal(sanitizeJob({ description: '  hi  ' }).description, 'hi');
});

test('provider retries once on bad JSON then succeeds', async () => {
  let calls = 0;
  class Fake extends AIProvider {
    isConfigured() { return true; }
    async complete() { calls++; return calls === 1 ? 'not json' : '{"summary":"fine","matchedRequirements":["React"]}'; }
  }
  const out = await new Fake().analyzeJob({ profile: {}, job: {} });
  assert.equal(calls, 2);
  assert.equal(out.summary, 'fine');
});

test('unconfigured provider gives friendly error', async () => {
  class Off extends AIProvider {}
  await assert.rejects(() => new Off().analyzeJob({ profile: {}, job: {} }), { code: 'AI_NOT_CONFIGURED' });
});
