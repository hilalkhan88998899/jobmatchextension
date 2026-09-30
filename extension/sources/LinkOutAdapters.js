// "Link-out" sources: build the site's own public search URL. The user opens it and browses normally;
// when they find a posting they use the JobMatch AI popup on that page. Nothing is fetched or scraped.
import { JobSourceAdapter, buildQuery } from './JobSourceAdapter.js';

export class LinkedInSearchAdapter extends JobSourceAdapter {
  constructor() { super({ id: 'linkedin', name: 'LinkedIn Jobs', description: 'Opens LinkedIn\'s own job search in a new tab.' }); }
  async search(c) {
    const p = new URLSearchParams({ keywords: buildQuery(c) });
    if (c.location) p.set('location', c.location);
    if (c.remote === 'remote') p.set('f_WT', '2');
    return { listings: [], links: [{ label: 'Search on LinkedIn Jobs', url: `https://www.linkedin.com/jobs/search/?${p}` }] };
  }
}

export class IndeedSearchAdapter extends JobSourceAdapter {
  constructor() { super({ id: 'indeed', name: 'Indeed', description: 'Opens Indeed\'s own job search in a new tab.' }); }
  async search(c) {
    const p = new URLSearchParams({ q: buildQuery(c), l: c.location || (c.remote === 'remote' ? 'Remote' : '') });
    return { listings: [], links: [{ label: 'Search on Indeed', url: `https://www.indeed.com/jobs?${p}` }] };
  }
}
