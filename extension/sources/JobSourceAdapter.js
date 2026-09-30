// Job source architecture. Every source implements the same interface, so new sources can be added
// without touching the dashboard. Sources must be permitted: an official/public API, or a plain link
// to the site's own search page that the USER opens. No scraping of pages the user did not visit.
//
// SearchCriteria: { title, skills: string[], location, remote: 'any'|'remote'|'hybrid'|'onsite', level: 'any'|'entry'|'mid'|'senior', jobType }
// Listing: { id, source, title, company, location, salary, employmentType, url, postedAt, description }
// search() resolves to { listings: Listing[], links: { label, url }[] }

export class JobSourceAdapter {
  /** @param {{id:string,name:string,description:string}} meta */
  constructor({ id, name, description }) {
    this.id = id;
    this.name = name;
    this.description = description;
  }
  /** @returns {Promise<{listings: object[], links: {label:string,url:string}[]}>} */
  async search(/* criteria */) {
    throw new Error(`${this.name}: search() is not implemented`);
  }
}

const LEVEL_WORD = { entry: 'junior', mid: '', senior: 'senior' };

/** Shared keyword builder: "junior Frontend Developer React JavaScript" */
export function buildQuery(c) {
  return [LEVEL_WORD[c.level] || '', c.title, ...(c.skills || []).slice(0, 3)].filter(Boolean).join(' ').trim();
}
