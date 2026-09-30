// Profile page: create / edit / delete the job-seeker profile (stored only in chrome.storage.local).
import { getProfile, saveProfile, deleteProfile } from '../storage/storage.js';
import { el, splitList, joinList, profileCompletion, initTheme, toast, uid } from '../utils/helpers.js';
import { JOB_TYPES, REMOTE_OPTIONS, LIMITS } from '../utils/constants.js';

const form = document.getElementById('form');

// Declarative field schema. type: text | number | url | list | select | jobTypes | textarea
const SECTIONS = [
  { title: 'Basics', fields: [
    { k: 'fullName', label: 'Full name', type: 'text' },
    { k: 'headline', label: 'Professional headline', type: 'text', placeholder: 'e.g. Frontend Developer' }] },
  { title: 'Education', fields: [
    { k: 'educationLevel', label: 'Education level', type: 'text', placeholder: "e.g. Bachelor's" },
    { k: 'degree', label: 'Degree', type: 'text', placeholder: 'e.g. BS Computer Science' },
    { k: 'university', label: 'University', type: 'text' },
    { k: 'graduationYear', label: 'Graduation year', type: 'number', min: 1950, max: 2100 }] },
  { title: 'Skills and tools', fields: [
    { k: 'skills', label: 'Skills', type: 'list', wide: true, placeholder: 'JavaScript, React, HTML, CSS, Node.js' },
    { k: 'languages', label: 'Programming languages', type: 'list', placeholder: 'Comma-separated' },
    { k: 'frameworks', label: 'Frameworks', type: 'list', placeholder: 'Comma-separated' },
    { k: 'tools', label: 'Tools', type: 'list', placeholder: 'Git, Figma, Docker' },
    { k: 'certifications', label: 'Certifications', type: 'list', placeholder: 'Only ones you hold' }] },
  { title: 'Experience', fields: [
    { k: 'yearsOfExperience', label: 'Total years of experience', type: 'number', min: 0, max: 60, step: 0.5, hint: 'Used to compare against "N+ years" requirements. Leave blank if unsure.' }],
    repeater: 'experience' },
  { title: 'Projects', fields: [], repeater: 'projects' },
  { title: 'Job preferences', fields: [
    { k: 'preferredTitles', label: 'Preferred job titles', type: 'list' },
    { k: 'preferredLocations', label: 'Preferred locations', type: 'list' },
    { k: 'remotePreference', label: 'Remote preference', type: 'select' },
    { k: 'jobTypes', label: 'Job type preference', type: 'jobTypes' },
    { k: 'salaryExpectation', label: 'Salary expectation (optional)', type: 'text', hint: 'Never sent to the AI for analysis.' }] },
  { title: 'Links', fields: [
    { k: 'portfolioUrl', label: 'Portfolio URL', type: 'url' },
    { k: 'githubUrl', label: 'GitHub URL', type: 'url' },
    { k: 'linkedinUrl', label: 'LinkedIn URL', type: 'url' }] },
  { title: 'Resume', fields: [
    { k: 'resumeText', label: 'Resume text', type: 'textarea', wide: true, rows: 10,
      hint: 'Paste your resume, or load a .txt / .md file below. PDF and Word files are not read - paste their text instead. This text is sent to the AI during analysis, so remove contact details you do not want shared.' }] }
];

const REPEATERS = {
  experience: { title: 'Work experience', add: 'Add position', fields: [
    { k: 'title', label: 'Job title' }, { k: 'company', label: 'Company' }, { k: 'start', label: 'Start (e.g. 2023-01)' },
    { k: 'end', label: 'End (or "Present")' }, { k: 'description', label: 'What you did', type: 'textarea', wide: true }] },
  projects: { title: 'Projects', add: 'Add project', fields: [
    { k: 'name', label: 'Project name' }, { k: 'tech', label: 'Technologies used' }, { k: 'description', label: 'Description', type: 'textarea', wide: true }] }
};

function renderField(f, value) {
  const id = `f-${f.k}`;
  let input;
  if (f.type === 'textarea') { input = el('textarea', { id, rows: f.rows || 5, placeholder: f.placeholder }); input.value = value || ''; }
  else if (f.type === 'select') {
    input = el('select', { id }, REMOTE_OPTIONS.map(([v, l]) => el('option', { value: v }, l)));
    input.value = value || 'any';
  } else if (f.type === 'jobTypes') {
    input = el('fieldset', { class: 'checks', id }, JOB_TYPES.map((t) => {
      const cb = el('input', { type: 'checkbox', value: t }); cb.checked = (value || []).includes(t);
      return el('label', {}, cb, t);
    }));
  } else {
    input = el('input', { id, type: f.type === 'list' ? 'text' : f.type, placeholder: f.placeholder, min: f.min, max: f.max, step: f.step });
    input.value = f.type === 'list' ? joinList(value) : value ?? '';
  }
  input.dataset.key = f.k;
  input.dataset.type = f.type;
  const label = f.type === 'jobTypes' ? el('span', { class: 'label', style: 'font-weight:600;font-size:13px' }, f.label) : el('label', { for: id }, f.label);
  return el('div', { class: `field${f.wide ? ' wide' : ''}` }, label, input, f.hint && el('small', { class: 'hint' }, f.hint));
}

function renderRepeater(name, items) {
  const cfg = REPEATERS[name];
  const list = el('div', { class: 'repeater', 'data-repeater': name });
  const addRow = (item = {}) => {
    const row = el('div', { class: 'row-card' });
    for (const f of cfg.fields) {
      const id = uid();
      const input = f.type === 'textarea' ? el('textarea', { id, rows: 3 }) : el('input', { id, type: 'text' });
      input.value = item[f.k] || '';
      input.dataset.rkey = f.k;
      row.append(el('div', { class: `field${f.wide ? ' wide' : ''}` }, el('label', { for: id }, f.label), input));
    }
    row.append(el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { row.remove(); updateMeter(); } }, 'Remove'));
    list.append(row);
  };
  (items || []).forEach(addRow);
  const addBtn = el('button', { type: 'button', class: 'btn btn-sm', onclick: () => addRow() }, cfg.add);
  return el('div', {}, el('h3', { style: 'margin:12px 0 8px' }, cfg.title), list, addBtn);
}

function collect() {
  const p = {};
  for (const n of form.querySelectorAll('[data-key]')) {
    const { key, type } = n.dataset;
    if (type === 'list') p[key] = splitList(n.value);
    else if (type === 'number') p[key] = n.value === '' ? '' : Number(n.value);
    else if (type === 'jobTypes') p[key] = [...n.querySelectorAll('input:checked')].map((i) => i.value);
    else p[key] = n.value.trim();
  }
  for (const name of Object.keys(REPEATERS)) {
    p[name] = [...form.querySelectorAll(`[data-repeater="${name}"] .row-card`)]
      .map((row) => Object.fromEntries([...row.querySelectorAll('[data-rkey]')].map((i) => [i.dataset.rkey, i.value.trim()])))
      .filter((r) => Object.values(r).some(Boolean));
  }
  return p;
}

function updateMeter() {
  const { percent } = profileCompletion(collect());
  document.getElementById('completion-text').textContent = `Profile completion: ${percent}%`;
  document.getElementById('completion-bar').style.width = `${percent}%`;
}

function build(profile = {}) {
  form.replaceChildren();
  for (const s of SECTIONS) {
    const sec = el('section', { class: 'card section' }, el('h2', {}, s.title));
    if (s.fields.length) sec.append(el('div', { class: 'grid' }, s.fields.map((f) => renderField(f, profile[f.k]))));
    if (s.repeater) sec.append(renderRepeater(s.repeater, profile[s.repeater]));
    if (s.title === 'Resume') {
      const file = el('input', { type: 'file', accept: '.txt,.md,text/plain', id: 'resume-file' });
      file.addEventListener('change', () => {
        const f = file.files[0];
        if (!f) return;
        if (f.size > LIMITS.maxResumeFile) return toast('That file is too large (max 200 KB).', 'error');
        const reader = new FileReader();
        reader.onload = () => { document.getElementById('f-resumeText').value = String(reader.result); updateMeter(); toast('Resume text loaded. Review it, then save.'); };
        reader.readAsText(f);
      });
      sec.append(el('div', { class: 'field', style: 'margin-top:10px' }, el('label', { for: 'resume-file' }, 'Load resume from a text file'), file));
    }
    form.append(sec);
  }
  updateMeter();
}

function validate(p) {
  for (const [k, label] of [['portfolioUrl', 'Portfolio'], ['githubUrl', 'GitHub'], ['linkedinUrl', 'LinkedIn']]) {
    if (p[k] && !/^https?:\/\//i.test(p[k])) return `${label} URL must start with http:// or https://`;
  }
  return '';
}

form.addEventListener('input', updateMeter);
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = collect();
  const problem = validate(p);
  if (problem) return toast(problem, 'error');
  await saveProfile(p);
  toast('Profile saved.');
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!confirm('Delete your profile from this browser? Saved jobs and applications are not affected.')) return;
  await deleteProfile();
  build({});
  toast('Profile deleted.');
});

(async function init() {
  await initTheme();
  build((await getProfile()) || {});
  if (new URLSearchParams(location.search).has('welcome')) document.getElementById('welcome').classList.remove('hidden');
})();
