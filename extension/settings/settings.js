// Settings: backend URL, theme, privacy information and data management.
import {
  getSettings, saveSettings, deleteProfile, deleteAllJobs, deleteAllApplications, deleteAllData, exportAll
} from '../storage/storage.js';
import { apiRequest } from '../utils/api.js';
import { initTheme, applyTheme, toast, downloadFile } from '../utils/helpers.js';

const $ = (id) => document.getElementById(id);

async function saveUrl() {
  let url;
  try { url = new URL($('backend-url').value.trim()); } catch { return toast('Enter a valid URL such as http://localhost:3000', 'error'); }
  if (!/^https?:$/.test(url.protocol)) return toast('The URL must start with http:// or https://', 'error');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!local) {
    if (url.protocol !== 'https:') return toast('Remote servers must use https://', 'error');
    const origins = [`${url.protocol}//${url.hostname}/*`];
    if (!(await chrome.permissions.contains({ origins })) && !(await chrome.permissions.request({ origins }))) {
      return toast('Permission to contact that server was not granted.', 'error');
    }
  }
  await saveSettings({ backendUrl: url.origin });
  $('backend-url').value = url.origin;
  toast('Backend URL saved.');
}

async function testConnection() {
  const out = $('test-result');
  out.textContent = 'Testing…';
  try {
    const { provider, configured } = await apiRequest('/api/health', { method: 'GET', timeoutMs: 8000 });
    out.textContent = configured ? `Connected. AI provider: ${provider}.` : `Server reachable, but no API key is configured (${provider}). Add it to server/.env.`;
  } catch (e) { out.textContent = e.message; }
}

async function confirmThen(message, action, done) {
  if (!confirm(message)) return;
  await action();
  toast(done);
}

(async function init() {
  await initTheme();
  const s = await getSettings();
  $('backend-url').value = s.backendUrl;
  document.querySelector(`input[name="theme"][value="${s.theme}"]`).checked = true;

  $('btn-save-url').addEventListener('click', saveUrl);
  $('btn-test').addEventListener('click', testConnection);
  $('theme-group').addEventListener('change', async (e) => {
    if (e.target.name !== 'theme') return;
    applyTheme(e.target.value);
    await saveSettings({ theme: e.target.value });
  });
  $('btn-export').addEventListener('click', async () => {
    downloadFile(`jobmatch-ai-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 2), 'application/json');
  });
  $('btn-del-profile').addEventListener('click', () => confirmThen('Delete your profile from this browser?', deleteProfile, 'Profile deleted.'));
  $('btn-del-jobs').addEventListener('click', () => confirmThen('Delete all saved job postings and their analyses? Tracker entries stay.', deleteAllJobs, 'Saved jobs deleted.'));
  $('btn-del-apps').addEventListener('click', () => confirmThen('Delete all tracked applications?', deleteAllApplications, 'Applications deleted.'));
  $('btn-del-all').addEventListener('click', () =>
    confirmThen('Delete ALL JobMatch AI data (profile, jobs, applications, settings) from this browser? This cannot be undone.', async () => {
      await deleteAllData();
      $('backend-url').value = (await getSettings()).backendUrl;
      applyTheme('system');
      document.querySelector('input[name="theme"][value="system"]').checked = true;
    }, 'All local data deleted.'));
})();
