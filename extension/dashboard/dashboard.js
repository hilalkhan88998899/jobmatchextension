// Dashboard: overview stats + pipeline + activity chart, application tracker, and job search assistant.
import {
  getApplications, getSavedJobs, updateApplication, deleteApplication, saveApplication,
  getProfile, getSearchPrefs, saveSearchPrefs, setPending
} from '../storage/storage.js';
import { el, uid, initTheme, toast, formatDate, appStatusTone, downloadFile, toCSV, splitList, joinList } from '../utils/helpers.js';
import { STATUSES, JOB_TYPES, REMOTE_OPTIONS } from '../utils/constants.js';
import { SOURCES } from '../sources/index.js';

const $ = (id) => document.getElementById(id);
let apps = [];
let jobs = [];
const openIds = new Set();
const filters = { q: '', status: 'all' };
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

// ---------- routing ----------
function route() {
  const view = ['overview', 'applications', 'search'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  for (const v of ['overview', 'applications', 'search']) $(`view-${v}`).classList.toggle('hidden', v !== view);
  document.querySelectorAll('.topbar nav a[data-view]').forEach((a) => {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

async function load() {
  [apps, jobs] = await Promise.all([getApplications(), getSavedJobs()]);
  renderOverview();
  renderApplications();
}

// ---------- overview ----------
const count = (s) => apps.filter((a) => a.status === s).length;

function statCard(label, n) {
  return el('div', { class: 'card stat' }, el('div', { class: 'n' }, n), el('div', { class: 'muted small' }, label));
}

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  kids.forEach((k) => n.append(k));
  return n;
}
function weekStart(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x;
}

// Inline-SVG chart (no library): jobs saved vs. applications submitted per week, last 8 weeks.
function activityChart() {
  const WEEKS = 8;
  const first = weekStart(new Date()); first.setDate(first.getDate() - 7 * (WEEKS - 1));
  const buckets = Array.from({ length: WEEKS }, (_, i) => { const d = new Date(first); d.setDate(d.getDate() + 7 * i); return { d, saved: 0, applied: 0 }; });
  for (const a of apps) {
    for (const h of a.history || []) {
      const idx = Math.round((weekStart(h.at) - first) / (7 * 864e5));
      if (idx < 0 || idx >= WEEKS) continue;
      if (h.status === 'Saved') buckets[idx].saved++;
      if (h.status === 'Applied') buckets[idx].applied++;
    }
  }
  const W = 640, H = 220, L = 30, B = 28, T = 10, R = 8;
  const max = Math.max(1, ...buckets.flatMap((b) => [b.saved, b.applied]));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const slot = (W - L - R) / WEEKS;
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
    'aria-label': `Jobs saved and applications submitted per week over the last ${WEEKS} weeks` });
  for (let t = 0; t <= Math.min(max, 5); t++) {
    const v = Math.round((max / Math.min(max, 5)) * t);
    chart.append(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'axis' }), svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, String(v)));
  }
  buckets.forEach((b, i) => {
    const x = L + i * slot + slot / 2;
    for (const [key, dx, cls] of [['saved', -12, 'bar-saved'], ['applied', 1, 'bar-applied']]) {
      chart.append(svg('rect', { x: x + dx, y: y(b[key]), width: 11, height: Math.max(0, H - B - y(b[key])), class: cls, rx: 2 }, svg('title', {}, `${b[key]} ${key} - week of ${formatDate(b.d)}`)));
    }
    chart.append(svg('text', { x, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, b.d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
  });
  return el('div', {}, chart, el('div', { class: 'legend' },
    el('span', {}, el('span', { class: 'dot', style: 'background:var(--muted)' }), 'Saved'),
    el('span', {}, el('span', { class: 'dot', style: 'background:var(--primary)' }), 'Applied')));
}

function renderOverview() {
  const root = $('view-overview');
  const applied = apps.filter((a) => a.status !== 'Saved').length;
  const max = Math.max(1, ...STATUSES.map(count));
  const recent = apps.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
  root.replaceChildren(
    el('h1', { id: 'h-overview' }, 'Dashboard'),
    apps.length === 0 && el('div', { class: 'banner' }, 'No saved jobs yet. Open a job listing, click the JobMatch AI icon, analyze it and choose Save Job.'),
    el('div', { class: 'stats' },
      statCard('Total saved jobs', apps.length), statCard('Applications', applied),
      statCard('Interviews', count('Interview')), statCard('Offers', count('Offer')), statCard('Rejected', count('Rejected'))),
    el('div', { class: 'two' },
      el('section', { class: 'card stack' }, el('h2', {}, 'Application pipeline'),
        el('div', { class: 'pipe' }, STATUSES.map((s) => el('div', { class: 'pipe-row' }, el('span', {}, s),
          el('div', { class: 'progress', 'aria-hidden': 'true' }, el('span', { style: `width:${(count(s) / max) * 100}%` })), el('strong', {}, count(s)))))),
      el('section', { class: 'card stack' }, el('h2', {}, 'Activity over time'), activityChart())),
    el('section', { class: 'card stack' }, el('h2', {}, 'Recent applications'),
      recent.length ? el('ul', { class: 'plain', style: 'list-style:none;padding:0;display:grid;gap:8px' }, recent.map((a) =>
        el('li', { class: 'row' }, el('span', { class: 'grow' }, el('strong', {}, a.title), a.company ? ` · ${a.company}` : ''),
          el('span', { class: `badge badge-${appStatusTone(a.status)}` }, a.status)))) : el('p', { class: 'muted' }, 'Nothing yet.'))
  );
}

// ---------- applications ----------
function visibleApps() {
  const q = filters.q.toLowerCase();
  return apps.filter((a) => (filters.status === 'all' || a.status === filters.status) &&
    (!q || `${a.title} ${a.company} ${a.location}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function appCard(a) {
  const patch = async (p, msg) => { Object.assign(a, p); await updateApplication(a.id, p); if (msg) toast(msg); };
  const status = el('select', { id: `st-${a.id}`, onchange: async (e) => { await updateApplication(a.id, { status: e.target.value }); await load(); toast('Status updated.'); } },
    STATUSES.map((s) => el('option', { value: s, selected: s === a.status }, s)));
  const applied = el('input', { type: 'date', id: `da-${a.id}`, onchange: (e) => patch({ dateApplied: e.target.value || null }, 'Date saved.') });
  applied.value = a.dateApplied || '';
  const notes = el('textarea', { id: `nt-${a.id}`, rows: 3, placeholder: 'Contacts, deadlines, questions to ask…', onchange: (e) => patch({ notes: e.target.value }, 'Notes saved.') });
  notes.value = a.notes || '';
  const url = safeUrl(a.url);
  const hasJob = a.jobId && jobs.some((j) => j.id === a.jobId);
  const details = el('details', { class: 'card app', ontoggle: (e) => (e.target.open ? openIds.add(a.id) : openIds.delete(a.id)) },
    el('summary', {}, el('div', { class: 'grow' }, el('strong', {}, a.title || 'Untitled role'),
      el('div', { class: 'muted small' }, [a.company, a.location, a.salary].filter(Boolean).join(' · '))),
      el('span', { class: 'muted small' }, `Saved ${formatDate(a.dateSaved)}`),
      el('span', { class: `badge badge-${appStatusTone(a.status)}` }, a.status)),
    el('div', { class: 'body' },
      el('div', { class: 'fields' },
        el('div', { class: 'field' }, el('label', { for: `st-${a.id}` }, 'Status'), status),
        el('div', { class: 'field' }, el('label', { for: `da-${a.id}` }, 'Date applied'), applied),
        el('div', { class: 'field', style: 'grid-column:1/-1' }, el('label', { for: `nt-${a.id}` }, 'Notes'), notes)),
      el('div', { class: 'row' },
        url && el('a', { class: 'btn btn-sm', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Open job posting'),
        hasJob && el('a', { class: 'btn btn-sm', href: `../analysis/analysis.html?id=${encodeURIComponent(a.jobId)}` }, 'View analysis'),
        el('button', { class: 'btn btn-sm btn-danger', onclick: async () => {
          if (!confirm(`Delete "${a.title}" from your tracker?`)) return;
          await deleteApplication(a.id); await load(); toast('Deleted.');
        } }, 'Delete'))));
  if (openIds.has(a.id)) details.open = true;
  return details;
}

function renderApplications() {
  const root = $('view-applications');
  const search = el('input', { type: 'search', id: 'f-q', placeholder: 'Title, company, location', value: filters.q, oninput: (e) => { filters.q = e.target.value; renderList(); } });
  const statusSel = el('select', { id: 'f-status', onchange: (e) => { filters.status = e.target.value; renderList(); } },
    el('option', { value: 'all' }, 'All statuses'), STATUSES.map((s) => el('option', { value: s, selected: s === filters.status }, s)));
  const listBox = el('div', { class: 'stack', id: 'app-list' });
  function renderList() {
    const items = visibleApps();
    listBox.replaceChildren(...(items.length ? items.map(appCard) : [el('p', { class: 'muted' }, apps.length ? 'No applications match these filters.' : 'No saved jobs yet.')]));
  }
  root.replaceChildren(
    el('h1', { id: 'h-apps' }, 'Applications'),
    el('div', { class: 'toolbar' },
      el('div', { class: 'field grow' }, el('label', { for: 'f-q' }, 'Search'), search),
      el('div', { class: 'field' }, el('label', { for: 'f-status' }, 'Status'), statusSel),
      el('button', { class: 'btn', onclick: exportCSV, disabled: apps.length === 0 }, 'Export CSV')),
    listBox);
  renderList();
}

function exportCSV() {
  const rows = [['Title', 'Company', 'Location', 'URL', 'Salary', 'Status', 'Date saved', 'Date applied', 'Notes'],
    ...apps.map((a) => [a.title, a.company, a.location, a.url, a.salary, a.status, a.dateSaved?.slice(0, 10), a.dateApplied, a.notes])];
  downloadFile('jobmatch-applications.csv', toCSV(rows), 'text/csv');
}

// ---------- job search assistant ----------
async function renderSearch() {
  const root = $('view-search');
  const profile = (await getProfile()) || {};
  const saved = await getSearchPrefs();
  const prefs = Object.keys(saved).length ? saved : {
    title: profile.preferredTitles?.[0] || '', skills: (profile.skills || []).slice(0, 5), location: profile.preferredLocations?.[0] || '',
    remote: profile.remotePreference || 'any', level: 'any', jobType: profile.jobTypes?.[0] || 'any'
  };
  const sel = (id, options, value) => { const s = el('select', { id }, options.map(([v, l]) => el('option', { value: v }, l))); s.value = value; return s; };
  const inputs = {
    title: el('input', { type: 'text', id: 's-title', value: prefs.title || '' }),
    skills: el('input', { type: 'text', id: 's-skills', value: joinList(prefs.skills) }),
    location: el('input', { type: 'text', id: 's-location', value: prefs.location || '' }),
    remote: sel('s-remote', REMOTE_OPTIONS, prefs.remote || 'any'),
    level: sel('s-level', [['any', 'Any'], ['entry', 'Entry level'], ['mid', 'Mid level'], ['senior', 'Senior']], prefs.level || 'any'),
    jobType: sel('s-type', [['any', 'Any'], ...JOB_TYPES.map((t) => [t, t])], prefs.jobType || 'any')
  };
  const field = (label, id, node) => el('div', { class: 'field' }, el('label', { for: id }, label), node);
  const sourceBoxes = SOURCES.map((s) => { const cb = el('input', { type: 'checkbox', checked: true }); return { s, cb }; });
  const results = el('div', { class: 'stack', 'aria-live': 'polite' });

  const form = el('form', { class: 'card stack' },
    el('div', { class: 'form-grid' },
      field('Preferred job title', 's-title', inputs.title), field('Skills', 's-skills', inputs.skills), field('Location', 's-location', inputs.location),
      field('Remote preference', 's-remote', inputs.remote), field('Experience level', 's-level', inputs.level), field('Job type', 's-type', inputs.jobType)),
    el('fieldset', {}, el('legend', {}, 'Sources'), el('div', { class: 'stack' }, sourceBoxes.map(({ s, cb }) =>
      el('label', { style: 'font-weight:400;display:flex;gap:8px;align-items:flex-start' }, cb, el('span', {}, el('strong', {}, s.name), el('br'), el('span', { class: 'muted small' }, s.description)))))),
    el('p', { class: 'hint' }, 'JobMatch AI does not scrape job sites. Link sources open the site\'s own search page in a tab; API sources are only contacted when you press Search.'),
    el('div', {}, el('button', { class: 'btn btn-primary', type: 'submit' }, 'Search')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = { title: inputs.title.value.trim(), skills: splitList(inputs.skills.value), location: inputs.location.value.trim(),
      remote: inputs.remote.value, level: inputs.level.value, jobType: inputs.jobType.value };
    await saveSearchPrefs(c);
    results.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Searching…'));
    const links = [], listings = [], errors = [];
    await Promise.all(sourceBoxes.filter((x) => x.cb.checked).map(async ({ s }) => {
      try { const r = await s.search(c); links.push(...r.links); listings.push(...r.listings); } catch (err) { errors.push(`${s.name}: ${err.message}`); }
    }));
    results.replaceChildren(
      ...errors.map((m) => el('div', { class: 'banner banner-warn' }, m)),
      links.length > 0 && el('section', { class: 'card stack' }, el('h2', {}, 'Open a search'),
        el('div', { class: 'row' }, links.map((l) => el('a', { class: 'btn', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label)))),
      ...listings.map((l) => listingCard(l, c)),
      links.length + listings.length === 0 && errors.length === 0 && el('p', { class: 'muted' }, 'No results. Try broader keywords.'));
  });

  root.replaceChildren(el('h1', { id: 'h-search' }, 'Job search assistant'),
    el('p', { class: 'muted' }, 'Set what you are looking for, then open searches or browse listings from permitted sources. Analyze any listing against your profile, or save it to your tracker.'),
    form, results);
}

function listingCard(l, criteria) {
  const hay = `${l.title} ${l.description}`.toLowerCase();
  const mentioned = (criteria.skills || []).filter((s) => hay.includes(s.toLowerCase()));
  return el('section', { class: 'card stack' },
    el('div', { class: 'row' }, el('h3', { class: 'grow' }, l.title), el('span', { class: 'badge' }, l.source)),
    el('p', { class: 'muted' }, [l.company, l.location, l.employmentType, l.salary].filter(Boolean).join(' · ')),
    mentioned.length > 0 && el('div', { class: 'tags' }, el('span', { class: 'muted small' }, 'Mentions your skills:'), mentioned.map((s) => el('span', { class: 'chip chip-info' }, s))),
    el('div', { class: 'row' },
      safeUrl(l.url) && el('a', { class: 'btn btn-sm', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open listing'),
      l.description && el('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
        await setPending({ job: { title: l.title, company: l.company, location: l.location, salary: l.salary, employmentType: l.employmentType, url: l.url, description: l.description }, source: `${l.source} listing` });
        chrome.tabs.create({ url: chrome.runtime.getURL('analysis/analysis.html?run=1') });
      } }, 'Analyze'),
      el('button', { class: 'btn btn-sm', onclick: async () => {
        if (l.url && apps.some((a) => a.url === l.url)) return toast('Already in your tracker.');
        const now = new Date().toISOString();
        await saveApplication({ id: uid(), jobId: null, title: l.title, company: l.company, location: l.location, url: l.url, salary: l.salary, status: 'Saved', dateSaved: now, dateApplied: null, notes: '' });
        await load(); toast('Saved to tracker.');
      } }, 'Save to tracker')));
}

// ---------- init ----------
(async function init() {
  await initTheme();
  window.addEventListener('hashchange', route);
  route();
  await load();
  await renderSearch();
})();
