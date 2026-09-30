// Input validation + sanitisation. Everything the AI sees passes through here.
import { AppError } from '../utils/errors.js';

export const str = (v, max) =>
  typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

const list = (v, maxItems = 40, maxLen = 100) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

const safeUrl = (v) => {
  try {
    const u = new URL(String(v));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href.slice(0, 500) : '';
  } catch { return ''; }
};

const rows = (v, fields, max = 15) =>
  Array.isArray(v)
    ? v.filter((r) => r && typeof r === 'object').slice(0, max).map((r) => Object.fromEntries(fields.map(([k, len]) => [k, str(r[k], len)])))
    : [];

// identity=false (analysis): name and links are NOT forwarded to the AI (data minimisation).
export function sanitizeProfile(p = {}, { identity = false } = {}) {
  const out = {
    headline: str(p.headline, 200),
    educationLevel: str(p.educationLevel, 100),
    degree: str(p.degree, 200),
    university: str(p.university, 200),
    graduationYear: str(p.graduationYear, 10),
    skills: list(p.skills), languages: list(p.languages), frameworks: list(p.frameworks), tools: list(p.tools),
    certifications: list(p.certifications, 30, 150),
    yearsOfExperience: str(p.yearsOfExperience, 10),
    experience: rows(p.experience, [['title', 150], ['company', 150], ['start', 30], ['end', 30], ['description', 1500]]),
    projects: rows(p.projects, [['name', 150], ['tech', 200], ['description', 1000]]),
    preferredTitles: list(p.preferredTitles, 20, 100), preferredLocations: list(p.preferredLocations, 20, 100),
    remotePreference: str(p.remotePreference, 20), jobTypes: list(p.jobTypes, 10, 30),
    resumeText: str(p.resumeText, 8000)
  };
  if (identity) {
    out.fullName = str(p.fullName, 120);
    out.links = { portfolio: safeUrl(p.portfolioUrl), github: safeUrl(p.githubUrl), linkedin: safeUrl(p.linkedinUrl) };
  }
  return out;
}

export function sanitizeJob(j = {}) {
  return {
    title: str(j.title, 200), company: str(j.company, 200), location: str(j.location, 200),
    salary: str(j.salary, 200), employmentType: str(j.employmentType, 100), url: safeUrl(j.url),
    description: str(j.description, 15000)
  };
}

const profileHasContent = (p) => p.skills.length || p.languages.length || p.frameworks.length || p.experience.length || p.resumeText;

function makeValidator({ identity }) {
  return (req, res, next) => {
    try {
      const b = req.body;
      if (!b || typeof b !== 'object' || Array.isArray(b)) throw new AppError(400, 'INVALID_BODY', 'Request body must be a JSON object.');
      if (!b.profile || typeof b.profile !== 'object') throw new AppError(400, 'MISSING_PROFILE', 'Your profile is incomplete.');
      if (!b.job || typeof b.job !== 'object') throw new AppError(400, 'MISSING_JOB', 'No job description detected.');
      const job = sanitizeJob(b.job);
      if (job.description.length < 40) throw new AppError(400, 'JOB_TOO_SHORT', 'No job description detected. Please select the job description manually.');
      const profile = sanitizeProfile(b.profile, { identity });
      if (!profileHasContent(profile)) throw new AppError(400, 'PROFILE_INCOMPLETE', 'Your profile is incomplete. Add your skills or experience first.');
      req.validated = { profile, job };
      next();
    } catch (e) { next(e); }
  };
}

export const validateAnalyze = makeValidator({ identity: false });
export const validateDraft = makeValidator({ identity: true });
