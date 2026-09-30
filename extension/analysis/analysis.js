// Analysis page: runs the AI comparison, renders the evidence-based result, saves jobs, generates drafts.
// SECURITY: every piece of AI output is rendered with el()/textContent. Nothing is ever assigned to innerHTML.
import { getProfile, getJob, getSavedJobs, saveJob, saveApplication, takePending, setLastAnalysis, getLastAnalysis } from '../storage/storage.js';
import { apiRequest } from '../utils/api.js';
import {
  el, uid, initTheme, toast, isProfileUsable, computeAlignment, statusLabel, statusTone,
  buildAnalysisProfile, buildDraftProfile, buildJobPayload, downloadFile
} from '../utils/helpers.js';
import { LOADING_MESSAGES, ALIGNMENT_NOTE, DRAFT_NOTE, LIMITS } from '../utils/constants.js';

const view = document.getElementById('view');
let state = { job: null, analysis: null, source: '', savedJobId: null };
let loadingTimer = null;

function setView(...nodes) {
  clearInterval(loadingTimer);
  view.replaceChildren(el('div', { class: 'stack' }, nodes.filter(Boolean)));
  window.scrollTo(0, 0);
}

// ---------- states: loading / error / empty ----------
function renderLoading() {
  const msg = el('p', { class: 'muted', role: 'status' }, LOADING_MESSAGES[0]);
  setView(el('section', { class: 'card stack' },
    el('h1', {}, 'Job match analysis'), msg,
    el('div', { class: 'skeleton', style: 'height:22px;width:55%' }),
    el('div', { class: 'skeleton', style: 'height:90px' }),
    el('div', { class: 'skeleton', style: 'height:90px' }),
    el('div', { class: 'skeleton', style: 'height:60px;width:80%' })));
  let i = 0;
  loadingTimer = setInterval(() => { i = (i + 1) % LOADING_MESSAGES.length; msg.textContent = LOADING_MESSAGES[i]; }, 1800);
}

function renderProblem(title, text, ...actions) {
  setView(el('section', { class: 'card stack' },
    el('h1', {}, title), el('div', { class: 'banner banner-error', role: 'alert' }, text), el('div', { class: 'row' }, actions)));
}
const link = (href, text, primary) => el('a', { class: `btn${primary ? ' btn-primary' : ''}`, href }, text);

function renderEmpty() {
  setView(el('section', { class: 'card stack' }, el('h1', {}, 'Job match analysis'),
    el('p', { class: 'muted' }, 'Open a job listing, then click the JobMatch AI icon and choose "Analyze This Job". You can also highlight the job description and right-click "Analyze with JobMatch AI".'),
    el('div', { class: 'row' }, link('../dashboard/dashboard.html', 'Open dashboard'))));
}

// ---------- run analysis ----------
async function runAnalysis(job, source) {
  const profile = await getProfile();
  if (!isProfileUsable(profile)) {
    return renderProblem('Your profile is incomplete.', 'Add your skills, experience or resume text so there is something to compare the job against.',
      link('../profile/profile.html', 'Edit profile', true));
  }
  if (!job?.description || job.description.trim().length < LIMITS.minJobText) {
    return renderProblem('No job description detected.', 'Please select the job description manually: highlight it on the page, then use "Select Job Text" or right-click "Analyze with JobMatch AI".');
  }
  renderLoading();
  try {
    const { analysis } = await apiRequest('/api/analyze-job', { body: { profile: buildAnalysisProfile(profile), job: buildJobPayload(job) } });
    state = { job, analysis, source, savedJobId: null };
    state.savedJobId = await findSavedId(job);
    await setLastAnalysis({ job, analysis, source });
    renderResult();
  } catch (e) {
    renderProblem('Unable to analyze this job.', e.message,
      el('button', { class: 'btn btn-primary', onclick: () => runAnalysis(job, source) }, 'Try again'),
      link('../settings/settings.html', 'Check settings'));
  }
}

async function findSavedId(job) {
  const url = job.url || job.applicationUrl;
  if (!url) return null;
  return (await getSavedJobs()).find((j) => j.url === url)?.id || null;
}

// ---------- result rendering ----------
const jobInfo = () => {
  const a = state.analysis.job, j = state.job;
  const pick = (k) => a[k] || j[k] || '';
  return { title: pick('title') || 'Untitled role', company: pick('company'), location: pick('location'), salary: pick('salary'), employmentType: pick('employmentType') };
};

const section = (title, ...children) => el('section', { class: 'card stack' }, el('h2', {}, title), ...children);
const bullets = (items, icon, tone) =>
  el('ul', { class: `plain tone-${tone}` }, items.map((t) => el('li', {}, el('span', { class: 'ico', 'aria-hidden': 'true' }, icon), el('span', {}, t))));
const listCard = (title, icon, items, tone, empty) =>
  section(title, items.length ? bullets(items, icon, tone) : el('p', { class: 'muted' }, empty));
const chips = (items, tone) => el('div', { class: 'chips' }, items.map((t) => el('span', { class: `chip chip-${tone}` }, t)));

function statusCard(title, b) {
  return el('section', { class: 'card stack status-card' },
    el('div', { class: 'row' }, el('h3', { class: 'grow' }, title), el('span', { class: `badge badge-${statusTone(b.status)}` }, statusLabel(b.status))),
    b.required && el('p', {}, el('strong', {}, 'Job requirement: '), b.required),
    b.profile && el('p', {}, el('strong', {}, 'Your profile: '), b.profile),
    b.details && el('p', { class: 'muted' }, b.details));
}

function renderResult() {
  const a = state.analysis;
  const info = jobInfo();
  const align = computeAlignment(a);
  const saveBtn = el('button', { class: 'btn btn-primary', onclick: () => onSave(saveBtn) }, state.savedJobId ? 'Saved' : 'Save Job');
  if (state.savedJobId) saveBtn.disabled = true;
  const resumeBtn = el('button', { class: 'btn', onclick: () => generate('resume', resumeBtn) }, 'Generate Tailored Resume');
  const coverBtn = el('button', { class: 'btn', onclick: () => generate('cover', coverBtn) }, 'Generate Cover Letter');
  const rerun = state.job.description
    ? el('button', { class: 'btn btn-ghost', onclick: () => runAnalysis(state.job, state.source) }, 'Analyze again')
    : null;

  setView(
    el('section', { class: 'card stack' },
      el('p', { class: 'muted small' }, 'Job match analysis'),
      el('h1', { class: 'job-title' }, info.title),
      el('div', { class: 'meta' }, [info.company, info.location, info.employmentType, info.salary && `Salary: ${info.salary}`].filter(Boolean).map((t) => el('span', {}, t))),
      el('p', { class: 'muted small' }, `Based on: ${state.source || 'job text'}`),
      state.job.truncated && el('div', { class: 'banner banner-warn' }, 'This posting was long, so only the first 15,000 characters were analyzed.')),

    el('section', { class: 'card stack' },
      el('h2', {}, 'Profile-to-Job Alignment'),
      el('div', { class: 'align' }, el('span', { class: 'label' }, align.label), el('span', { class: `badge badge-${align.tone}` }, 'Informational estimate')),
      a.summary && el('p', {}, a.summary),
      el('p', { class: 'muted small' }, ALIGNMENT_NOTE)),

    el('div', { class: 'grid3' },
      listCard('Matched', '✓', a.matchedRequirements, 'ok', 'No requirement was clearly matched.'),
      listCard('Potential gaps', '⚠', a.missingRequirements, 'warn', 'No gaps found in the stated requirements.'),
      listCard('Unclear', '?', a.unclearRequirements, 'info', 'Nothing unclear.')),

    (a.skills.matched.length + a.skills.missing.length + a.skills.additional.length > 0) && section('Skills',
      a.skills.matched.length > 0 && el('div', {}, el('h3', {}, 'Matched'), chips(a.skills.matched, 'ok')),
      a.skills.missing.length > 0 && el('div', {}, el('h3', {}, 'Not found in your profile'), chips(a.skills.missing, 'warn')),
      a.skills.additional.length > 0 && el('div', {}, el('h3', {}, 'Additional relevant skills you have'), chips(a.skills.additional, 'info'))),

    el('div', { class: 'grid2' }, statusCard('Education', a.education), statusCard('Experience', a.experience),
      statusCard('Location', a.location), statusCard('Job type', a.jobType)),

    a.importantRequirements.length > 0 && section('Important requirements', bullets(a.importantRequirements, '•', 'info')),
    a.potentialConcerns.length > 0 && section('Potential concerns', bullets(a.potentialConcerns, '⚠', 'warn')),

    a.evidence.length > 0 && el('details', { class: 'card' }, el('summary', {}, `Evidence (${a.evidence.length})`),
      el('div', { class: 'evidence' }, a.evidence.map((e) => el('div', {},
        el('div', { class: 'row' }, el('strong', {}, e.requirement),
          el('span', { class: `badge badge-${e.status === 'matched' ? 'ok' : e.status === 'missing' ? 'warn' : 'info'}` }, e.status === 'missing' ? 'not found in profile' : e.status)),
        e.jobText && el('blockquote', {}, `Job posting: ${e.jobText}`),
        e.profileText && el('blockquote', {}, `Your profile: ${e.profileText}`))))),

    el('div', { id: 'draft' }),
    el('div', { class: 'actions' }, saveBtn, resumeBtn, coverBtn, rerun,
      state.savedJobId && link('../dashboard/dashboard.html#applications', 'View in tracker')),
    el('p', { class: 'muted small' }, 'JobMatch AI never applies for you. Review everything and decide for yourself whether to apply.')
  );
}

// ---------- save job + create tracker entry ----------
async function onSave(btn) {
  const info = jobInfo();
  const url = state.job.url || state.job.applicationUrl || '';
  const existing = url ? (await getSavedJobs()).find((j) => j.url === url) : null;
  if (existing) { state.savedJobId = existing.id; btn.textContent = 'Saved'; btn.disabled = true; return toast('This job is already saved.'); }
  const id = uid();
  const now = new Date().toISOString();
  await saveJob({ id, ...info, url, description: (state.job.description || '').slice(0, LIMITS.maxJobText), analysis: state.analysis, savedAt: now });
  await saveApplication({ id: uid(), jobId: id, ...info, url, status: 'Saved', dateSaved: now, dateApplied: null, notes: '' });
  state.savedJobId = id;
  btn.textContent = 'Saved';
  btn.disabled = true;
  toast('Job saved. Track it in the dashboard.');
}

// ---------- resume / cover letter drafts ----------
async function generate(kind, btn) {
  const profile = await getProfile();
  if (!isProfileUsable(profile)) return toast('Your profile is incomplete.', 'error');
  const panel = document.getElementById('draft');
  const title = kind === 'resume' ? 'Tailored resume draft' : 'Cover letter draft';
  btn.disabled = true;
  panel.replaceChildren(section(title, el('p', { class: 'muted', role: 'status' }, 'Writing your draft from your saved profile...'),
    el('div', { class: 'skeleton', style: 'height:160px' })));
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    const data = await apiRequest(kind === 'resume' ? '/api/tailor-resume' : '/api/generate-cover-letter', {
      body: { profile: buildDraftProfile(profile), job: buildJobPayload(state.job, state.analysis.job) }
    });
    showDraft(kind, title, kind === 'resume' ? data.resume : data.coverLetter, data.notes || [], btn);
  } catch (e) {
    panel.replaceChildren(section(title, el('div', { class: 'banner banner-error', role: 'alert' }, e.message)));
  } finally { btn.disabled = false; }
}

function showDraft(kind, title, text, notes, btn) {
  const ta = el('textarea', { class: 'draft', 'aria-label': `${title} (editable)` });
  ta.value = text;
  const slug = (jobInfo().company || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  document.getElementById('draft').replaceChildren(section(title,
    el('div', { class: 'banner banner-warn' }, DRAFT_NOTE), ta,
    notes.length > 0 && el('div', {}, el('h3', {}, 'Requirements not found in your profile (intentionally not added)'), bullets(notes, '•', 'info')),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: async () => { await navigator.clipboard.writeText(ta.value); toast('Copied.'); } }, 'Copy'),
      el('button', { class: 'btn', onclick: () => downloadFile(`${slug || 'job'}-${kind === 'resume' ? 'resume' : 'cover-letter'}.txt`, ta.value) }, 'Download .txt'),
      el('button', { class: 'btn btn-ghost', onclick: () => generate(kind, btn) }, 'Regenerate'),
      el('button', { class: 'btn btn-ghost', onclick: () => document.getElementById('draft').replaceChildren() }, 'Close'))));
}

// ---------- init ----------
(async function init() {
  await initTheme();
  const params = new URLSearchParams(location.search);
  if (params.get('run')) {
    const pending = await takePending();
    history.replaceState(null, '', location.pathname); // reloading must not re-send data
    if (pending) return runAnalysis(pending.job, pending.source);
  }
  if (params.get('id')) {
    const rec = await getJob(params.get('id'));
    if (rec) { state = { job: rec, analysis: rec.analysis, source: 'a job you saved', savedJobId: rec.id }; return renderResult(); }
    return renderProblem('Saved job not found.', 'It may have been deleted.', link('../dashboard/dashboard.html', 'Open dashboard'));
  }
  const last = await getLastAnalysis();
  if (last) { state = { ...last, savedJobId: await findSavedId(last.job) }; return renderResult(); }
  renderEmpty();
})();
