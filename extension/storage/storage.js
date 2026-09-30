// Storage abstraction over chrome.storage.local. All pages and the service worker use this module.
// Note: chrome.storage.local is private to this extension but is NOT encrypted at rest.
import { STORAGE_KEYS as K, DEFAULT_SETTINGS } from '../utils/constants.js';

async function read(key, fallback) {
  const r = await chrome.storage.local.get(key);
  return r[key] === undefined ? fallback : r[key];
}
const write = (key, value) => chrome.storage.local.set({ [key]: value });
const nowIso = () => new Date().toISOString();

// ---- Profile -------------------------------------------------------------
export const getProfile = () => read(K.profile, null);
export async function saveProfile(profile) {
  const record = { ...profile, updatedAt: nowIso() };
  await write(K.profile, record);
  return record;
}
export const deleteProfile = () => chrome.storage.local.remove(K.profile);

// ---- Saved jobs (job snapshot + its analysis) ----------------------------
export const getSavedJobs = () => read(K.jobs, []);
export async function getJob(id) {
  return (await getSavedJobs()).find((j) => j.id === id) || null;
}
export async function saveJob(job) {
  const jobs = await getSavedJobs();
  const i = jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) jobs[i] = job; else jobs.unshift(job);
  await write(K.jobs, jobs);
  return job;
}
export async function deleteJob(id) {
  await write(K.jobs, (await getSavedJobs()).filter((j) => j.id !== id));
}
export const deleteAllJobs = () => chrome.storage.local.remove(K.jobs);

// ---- Applications (tracker) ----------------------------------------------
export const getApplications = () => read(K.applications, []);
export async function saveApplication(app) {
  const apps = await getApplications();
  const now = nowIso();
  const record = { notes: '', dateApplied: null, ...app, history: app.history || [{ status: app.status, at: now }], updatedAt: now };
  const i = apps.findIndex((a) => a.id === record.id);
  if (i >= 0) apps[i] = record; else apps.unshift(record);
  await write(K.applications, apps);
  return record;
}
export async function updateApplication(id, patch) {
  const apps = await getApplications();
  const i = apps.findIndex((a) => a.id === id);
  if (i < 0) return null;
  const now = nowIso();
  const prev = apps[i];
  const next = { ...prev, ...patch, updatedAt: now };
  if (patch.status && patch.status !== prev.status) {
    next.history = [...(prev.history || []), { status: patch.status, at: now }];
    if (patch.status === 'Applied' && !next.dateApplied) next.dateApplied = now.slice(0, 10);
  }
  apps[i] = next;
  await write(K.applications, apps);
  return next;
}
export async function deleteApplication(id, { withJob = true } = {}) {
  const apps = await getApplications();
  const app = apps.find((a) => a.id === id);
  await write(K.applications, apps.filter((a) => a.id !== id));
  if (withJob && app?.jobId) await deleteJob(app.jobId);
}
export const deleteAllApplications = () => chrome.storage.local.remove(K.applications);

// ---- Settings ------------------------------------------------------------
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await read(K.settings, {})) };
}
export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await write(K.settings, next);
  return next;
}

// ---- Job search preferences ----------------------------------------------
export const getSearchPrefs = () => read(K.search, {});
export const saveSearchPrefs = (prefs) => write(K.search, prefs);

// ---- Hand-off between popup/context menu and the analysis page -----------
export const setPending = (payload) => write(K.pending, { ...payload, at: nowIso() });
export async function takePending() {
  const p = await read(K.pending, null);
  if (p) await chrome.storage.local.remove(K.pending);
  return p;
}
export const setLastAnalysis = (payload) => write(K.last, payload);
export const getLastAnalysis = () => read(K.last, null);

// ---- Whole-data operations -----------------------------------------------
export const deleteAllData = () => chrome.storage.local.clear();
export async function exportAll() {
  return {
    app: 'JobMatch AI',
    exportedAt: nowIso(),
    userProfile: await getProfile(),
    savedJobs: await getSavedJobs(),
    applications: await getApplications(),
    settings: await getSettings()
  };
}
