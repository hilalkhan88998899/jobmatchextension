// Output validation: never trust the model's JSON shape. Coerce everything into the schema
// the extension expects. The extension renders all of it as plain text (never HTML).
import { AppError } from './errors.js';

const STATUS_ALIASES = {
  matched: 'matched', match: 'matched', met: 'matched', yes: 'matched',
  not_matched: 'not_matched', notmatched: 'not_matched', missing: 'not_matched', gap: 'not_matched', no: 'not_matched',
  unclear: 'unclear', unknown: 'unclear', partial: 'unclear'
};

const clip = (v, max = 400) => {
  if (typeof v === 'number') v = String(v);
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
};

const list = (v, max = 30, len = 400) =>
  Array.isArray(v)
    ? v.map((x) => clip(x && typeof x === 'object' ? x.requirement || x.name || x.text || '' : x, len)).filter(Boolean).slice(0, max)
    : [];

const status = (v) => STATUS_ALIASES[String(v || '').toLowerCase().replace(/[\s-]+/g, '_')] || 'unclear';

const block = (b, extras = []) => {
  const src = b && typeof b === 'object' ? b : {};
  const out = { status: status(src.status), details: clip(src.details, 600) };
  for (const k of extras) out[k] = clip(src[k], 200);
  return out;
};

const evidenceStatus = (v) => {
  const s = String(v || '').toLowerCase();
  return s === 'matched' ? 'matched' : s === 'missing' || s === 'not_matched' ? 'missing' : 'unclear';
};

export function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(502, 'AI_BAD_RESPONSE', 'The AI returned an unreadable response. Please try again.');
  }
  const job = raw.job && typeof raw.job === 'object' ? raw.job : {};
  const skills = raw.skills && typeof raw.skills === 'object' ? raw.skills : {};
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : [])
    .map((e) =>
      typeof e === 'string'
        ? { requirement: clip(e), status: 'unclear', jobText: '', profileText: '' }
        : { requirement: clip(e?.requirement, 300), status: evidenceStatus(e?.status), jobText: clip(e?.jobText, 300), profileText: clip(e?.profileText, 300) }
    )
    .filter((e) => e.requirement)
    .slice(0, 40);

  const out = {
    job: {
      title: clip(job.title, 200), company: clip(job.company, 200), location: clip(job.location, 200),
      employmentType: clip(job.employmentType, 100), salary: clip(job.salary, 200)
    },
    summary: clip(raw.summary, 1200),
    matchedRequirements: list(raw.matchedRequirements),
    missingRequirements: list(raw.missingRequirements),
    unclearRequirements: list(raw.unclearRequirements),
    skills: { matched: list(skills.matched, 40, 100), missing: list(skills.missing, 40, 100), additional: list(skills.additional, 40, 100) },
    education: block(raw.education, ['required', 'profile']),
    experience: block(raw.experience, ['required', 'profile']),
    location: block(raw.location),
    jobType: block(raw.jobType),
    importantRequirements: list(raw.importantRequirements),
    potentialConcerns: list(raw.potentialConcerns),
    evidence
  };

  const hasContent = out.summary || out.matchedRequirements.length || out.missingRequirements.length || out.unclearRequirements.length;
  if (!hasContent) throw new AppError(502, 'AI_BAD_RESPONSE', 'The AI returned an incomplete analysis. Please try again.');
  return out;
}

// Resume / cover letter drafts: keep line breaks, cap length.
export function normalizeDraft(raw, key) {
  const text = raw && typeof raw === 'object' && typeof raw[key] === 'string'
    ? raw[key].replace(/\r/g, '').replace(/\u0000/g, '').trim().slice(0, 20000) : '';
  if (text.length < 40) throw new AppError(502, 'AI_BAD_RESPONSE', 'The AI returned an incomplete draft. Please try again.');
  return { text, notes: list(raw.notes, 15, 300) };
}
