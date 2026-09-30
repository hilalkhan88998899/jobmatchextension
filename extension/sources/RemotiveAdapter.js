// Remotive public API (remote jobs). Requires the user to grant access to remotive.com the first time.
// Only called when the user presses Search. Please review Remotive's API terms before heavy use;
// results link back to the original Remotive listing.
import { JobSourceAdapter, buildQuery } from './JobSourceAdapter.js';
import { htmlToText } from '../utils/helpers.js';

const ORIGINS = ['https://remotive.com/*'];

export class RemotiveAdapter extends JobSourceAdapter {
  constructor() {
    super({ id: 'remotive', name: 'Remotive (remote jobs API)', description: 'Public API for remote roles. Asks for permission the first time.' });
  }
  async search(c) {
    if (!(await chrome.permissions.contains({ origins: ORIGINS })) && !(await chrome.permissions.request({ origins: ORIGINS }))) {
      throw new Error('Permission to contact remotive.com was not granted.');
    }
    const q = [c.title, ...(c.skills || []).slice(0, 2)].filter(Boolean).join(' ') || buildQuery(c);
    const res = await fetch(`https://remotive.com/api/remote-jobs?${new URLSearchParams({ search: q, limit: '25' })}`);
    if (!res.ok) throw new Error('The service is unavailable right now.');
    const data = await res.json();
    const listings = (data.jobs || []).slice(0, 25).map((j) => ({
      id: `remotive-${j.id}`, source: 'Remotive', title: j.title || '', company: j.company_name || '',
      location: j.candidate_required_location || 'Remote', salary: j.salary || '',
      employmentType: String(j.job_type || '').replace(/_/g, ' '), url: j.url || '', postedAt: j.publication_date || '',
      description: htmlToText(j.description).slice(0, 15000)
    }));
    return { listings, links: [] };
  }
}
