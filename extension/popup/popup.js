// Popup: start an analysis of the current tab, show profile completion and recent applications.
import { getProfile, getApplications, setPending } from '../storage/storage.js';
import { el, initTheme, profileCompletion, isProfileUsable, appStatusTone } from '../utils/helpers.js';

const $ = (id) => document.getElementById(id);
let tab = null;

const open = (path) => { chrome.tabs.create({ url: chrome.runtime.getURL(path) }); window.close(); };

function showMessage(text, tone = 'error') {
  const box = $('msg');
  box.textContent = text;
  box.className = `banner ${tone === 'error' ? 'banner-error' : ''}`;
}

function setBusy(busy) {
  $('btn-analyze').disabled = busy;
  $('btn-select').disabled = busy;
}

// Inject the content script into the active tab (allowed by activeTab because the user clicked) and run it.
async function runExtraction(mode) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
  await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/content.css'] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (m) => window.__jobMatch.run(m), args: [mode] });
  return res?.result;
}

async function start(mode) {
  $('msg').className = 'banner hidden';
  if (!isProfileUsable(await getProfile())) {
    showMessage('Your profile is incomplete. Add your skills or experience first.');
    return;
  }
  setBusy(true);
  try {
    const result = await runExtraction(mode);
    if (!result?.ok) {
      showMessage(result?.error === 'NO_SELECTION'
        ? 'Highlight the job description on the page first, then click "Select Job Text".'
        : 'No job description detected. Please select the job description manually, then click "Select Job Text".');
      return;
    }
    await setPending({ job: result.job, source: result.source });
    open('analysis/analysis.html?run=1');
  } catch {
    showMessage('Unable to analyze this page. Browser pages and some protected sites cannot be read.');
  } finally { setBusy(false); }
}

async function renderRecent() {
  const apps = (await getApplications()).slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 3);
  const list = $('recent');
  list.replaceChildren(...(apps.length
    ? apps.map((a) => el('li', {}, el('div', {}, el('div', { class: 't' }, a.title || 'Untitled role'), el('div', { class: 'c' }, a.company || '')),
        el('span', { class: `badge badge-${appStatusTone(a.status)}` }, `Status: ${a.status}`)))
    : [el('li', { class: 'muted small' }, 'No saved jobs yet. Analyze a job and save it to start tracking.')]));
}

async function init() {
  await initTheme();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('page-title').textContent = tab?.title || 'No page open';
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    setBusy(true);
    showMessage('This page cannot be analyzed. Open a job listing on a website first.', 'info');
  }
  const { percent } = profileCompletion(await getProfile());
  $('completion-text').textContent = `Profile completion: ${percent}%`;
  $('completion-bar').setAttribute('aria-valuenow', percent);
  $('completion-bar').firstElementChild.style.width = `${percent}%`;
  await renderRecent();
}

$('btn-analyze').addEventListener('click', () => start('page'));
$('btn-select').addEventListener('click', () => start('selection'));
$('btn-profile').addEventListener('click', () => open('profile/profile.html'));
$('btn-dashboard').addEventListener('click', () => open('dashboard/dashboard.html'));
$('btn-settings').addEventListener('click', () => open('settings/settings.html'));
init();
