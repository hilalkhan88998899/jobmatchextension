// Small shared helpers. AI-generated text is ONLY ever rendered through el()/textContent - never innerHTML.
import { getSettings } from '../storage/storage.js';

/** Create a DOM element. Strings become text nodes (safe against injection). */
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const splitList = (s) =>
  String(s || '').split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);
export const joinList = (a) => (Array.isArray(a) ? a.join(', ') : '');

export function formatDate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    (withTime ? ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
}

// ---- Profile helpers -----------------------------------------------------
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '');

/** Ten equally weighted checks -> completion percentage and what is missing. */
export function profileCompletion(p) {
  p = p || {};
  const checks = [
    ['Full name', filled(p.fullName)],
    ['Headline', filled(p.headline)],
    ['Degree', filled(p.degree) || filled(p.educationLevel)],
    ['Skills', filled(p.skills)],
    ['Experience', filled(p.experience) || filled(p.yearsOfExperience)],
    ['Preferred job titles', filled(p.preferredTitles)],
    ['Preferred locations', filled(p.preferredLocations)],
    ['Remote / job type preference', (p.remotePreference && p.remotePreference !== 'any') || filled(p.jobTypes)],
    ['Projects or resume text', filled(p.projects) || filled(p.resumeText)],
    ['University', filled(p.university)]
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([n]) => n) };
}

/** Minimum needed for a meaningful comparison. */
export function isProfileUsable(p) {
  return Boolean(p && (filled(p.skills) || filled(p.languages) || filled(p.frameworks) || filled(p.experience) || filled(p.resumeText)));
}

// ---- Alignment label (informational, category-based) ---------------------
export function computeAlignment(a) {
  const m = a.matchedRequirements.length;
  const g = a.missingRequirements.length;
  if (m + g === 0) return { label: 'Not enough information', tone: 'info' };
  const ratio = m / (m + g);
  let label = ratio >= 0.55 ? 'Strong alignment' : ratio >= 0.35 ? 'Moderate alignment' : 'Limited alignment';
  if (label === 'Strong alignment' && a.education.status === 'not_matched') label = 'Moderate alignment';
  return { label, tone: label === 'Strong alignment' ? 'ok' : label === 'Moderate alignment' ? 'warn' : 'bad' };
}

export function statusLabel(status) {
  return status === 'matched' ? 'Matches stated requirement' : status === 'not_matched' ? 'Potential gap' : 'Unclear';
}
export const statusTone = (s) => (s === 'matched' ? 'ok' : s === 'not_matched' ? 'warn' : 'info');

// ---- Profile -> API payloads (data minimisation) -------------------------
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const ANALYSIS_KEYS = ['headline', 'educationLevel', 'degree', 'university', 'graduationYear', 'skills', 'languages', 'frameworks',
  'tools', 'certifications', 'yearsOfExperience', 'experience', 'projects', 'preferredTitles', 'preferredLocations',
  'remotePreference', 'jobTypes', 'resumeText'];

/** For analysis: no name, no links, no salary expectation. */
export const buildAnalysisProfile = (p) => pick(p, ANALYSIS_KEYS);
/** For resume / cover letter: adds name and profile links so the draft can have a header. */
export const buildDraftProfile = (p) => pick(p, [...ANALYSIS_KEYS, 'fullName', 'portfolioUrl', 'githubUrl', 'linkedinUrl']);

export function buildJobPayload(job, analysisJob = {}) {
  return {
    title: job.title || analysisJob.title || '',
    company: job.company || analysisJob.company || '',
    location: job.location || analysisJob.location || '',
    salary: job.salary || analysisJob.salary || '',
    employmentType: job.employmentType || analysisJob.employmentType || '',
    url: job.url || job.applicationUrl || '',
    description: job.description || ''
  };
}

// ---- Misc ----------------------------------------------------------------
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html'); // does not execute scripts
  doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  doc.querySelectorAll('li').forEach((li) => li.prepend('• '));
  doc.querySelectorAll('p,li,div,h1,h2,h3,h4,tr').forEach((n) => n.append('\n'));
  return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

export function downloadFile(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function toast(message, type = 'info') {
  const t = el('div', { class: `toast toast-${type}`, role: 'status' }, message);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

/** Apply the saved theme and keep it in sync if it changes in Settings. */
export async function initTheme() {
  applyTheme((await getSettings()).theme);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings?.newValue) applyTheme(changes.settings.newValue.theme);
  });
}

const APP_TONES = { Saved: 'info', Applied: 'info', Assessment: 'warn', Interview: 'warn', Offer: 'ok', Rejected: 'bad', Withdrawn: 'info' };
export const appStatusTone = (status) => APP_TONES[status] || 'info';
