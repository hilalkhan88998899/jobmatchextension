// JobMatch AI service worker (Manifest V3). Stateless: everything it needs is passed through chrome.storage.
// Responsibilities: context menu ("Analyze with JobMatch AI") and first-run onboarding.
import { setPending } from '../storage/storage.js';

const MENU_ID = 'jobmatch-analyze-selection';

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: MENU_ID, title: 'Analyze with JobMatch AI', contexts: ['selection'] });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('profile/profile.html?welcome=1') });
  }
});

// Right-click on selected job text -> hand it to the analysis page. Nothing is sent anywhere until the
// analysis page runs, and that page only sends the selected text plus the minimal profile fields.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  await setPending({
    source: 'your text selection',
    job: { description: (info.selectionText || '').trim().slice(0, 15000), url: info.pageUrl || tab?.url || '', pageTitle: tab?.title || '' }
  });
  chrome.tabs.create({ url: chrome.runtime.getURL('analysis/analysis.html?run=1') });
});
