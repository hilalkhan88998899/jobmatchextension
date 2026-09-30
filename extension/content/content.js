// JobMatch AI content script.
// Injected ON DEMAND (user clicks the toolbar popup) through chrome.scripting - it is not declared in the manifest,
// so the extension never runs on pages the user did not act on.
// Strategy (in order): 1) schema.org JobPosting JSON-LD  2) visible-text heuristics on the most job-like container
// 3) manual fallback: the user's own text selection.  It only reads the page; it never modifies or submits anything.
(() => {
  const MAX_CHARS = 15000;
  const MIN_CHARS = 40;
  const KEYWORDS = ['responsibilit', 'requirement', 'qualification', 'experience', 'skills', 'salary', 'benefits',
    'apply', 'years', 'degree', 'you will', 'about the role', 'job description', 'employment', 'full-time', 'remote'];

  const clean = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const first = (...vals) => vals.find((v) => v && String(v).trim()) || '';

  // ---------- helpers ----------
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    doc.querySelectorAll('li').forEach((li) => li.prepend('• '));
    doc.querySelectorAll('p,li,div,h1,h2,h3,h4,tr').forEach((n) => n.append('\n'));
    return clean(doc.body.textContent);
  }
  const visibleText = (node) => clean(node.innerText || '');
  const absUrl = (href) => { try { const u = new URL(href, location.href); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };

  // ---------- 1) structured data ----------
  function findJobPostings(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => findJobPostings(n, out)); return; }
    const t = node['@type'];
    if ((Array.isArray(t) ? t : [t]).includes('JobPosting')) out.push(node);
    if (node['@graph']) findJobPostings(node['@graph'], out);
  }

  function fromJsonLd() {
    const found = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { findJobPostings(JSON.parse(s.textContent), found); } catch { /* ignore invalid JSON-LD */ }
    });
    const p = found[0];
    if (!p) return null;
    const loc = [].concat(p.jobLocation || []).map((l) => {
      const a = l?.address || {};
      return typeof a === 'string' ? a : [a.addressLocality, a.addressRegion, a.addressCountry?.name || a.addressCountry].filter(Boolean).join(', ');
    }).filter(Boolean).join(' / ');
    const remote = p.jobLocationType === 'TELECOMMUTE' ? 'Remote' : '';
    const sal = p.baseSalary?.value || {};
    const salary = sal.minValue || sal.maxValue
      ? `${p.baseSalary.currency || ''} ${[sal.minValue, sal.maxValue].filter(Boolean).join(' - ')}${sal.unitText ? ' per ' + String(sal.unitText).toLowerCase() : ''}`.trim()
      : sal.value ? `${p.baseSalary.currency || ''} ${sal.value}`.trim() : '';
    return {
      title: clean(p.title),
      company: clean(typeof p.hiringOrganization === 'string' ? p.hiringOrganization : p.hiringOrganization?.name),
      location: [loc, remote].filter(Boolean).join(' / '),
      salary,
      employmentType: [].concat(p.employmentType || []).join(', ').replace(/_/g, ' ').toLowerCase(),
      description: htmlToText(p.description),
      applicationUrl: absUrl(p.url || '')
    };
  }

  // ---------- 2) visible-text heuristics ----------
  const CANDIDATES = [
    '[class*="description" i]', '[id*="description" i]', '[class*="job-detail" i]', '[class*="jobdetail" i]',
    '[class*="posting" i]', '[data-testid*="description" i]', '[class*="job-content" i]', 'article', 'main', '[role="main"]', 'section'
  ].join(',');

  function findContainer() {
    let best = null;
    let bestScore = 0;
    for (const node of document.querySelectorAll(CANDIDATES)) {
      if (node.closest('nav,footer,header,aside,form')) continue;
      const text = visibleText(node);
      if (text.length < 200 || text.length > 30000) continue;
      const lower = text.toLowerCase();
      const score = Math.min(KEYWORDS.filter((k) => lower.includes(k)).length, 8);
      // Prefer more keyword hits; on ties prefer the smaller (more specific) element.
      if (score >= 3 && (score > bestScore || (score === bestScore && best && text.length < visibleText(best).length))) { best = node; bestScore = score; }
    }
    return best;
  }

  const textOf = (selectors, maxLen = 120) => {
    for (const sel of selectors) {
      for (const n of document.querySelectorAll(sel)) {
        const t = clean(n.getAttribute('content') || n.innerText || '');
        if (t && t.length <= maxLen) return t;
      }
    }
    return '';
  };

  const SALARY_RE = /(?:[$£€]|PKR|Rs\.?|USD|EUR|GBP)\s?\d[\d,.]*\s?[kK]?(?:\s?(?:-|–|to)\s?(?:[$£€]|PKR|Rs\.?)?\s?\d[\d,.]*\s?[kK]?)?(?:\s?(?:per|\/|a)\s?(?:hour|hr|year|yr|month|annum))?/;
  const TYPE_RE = /\b(full[- ]time|part[- ]time|contract|internship|temporary|freelance)\b/i;

  const LABELS = {
    responsibilities: /^(key |main |core )?(responsibilities|duties|what you('|’)ll do|what you will do)\b/i,
    requirements: /^(basic |minimum |key |required )?(requirements|what you('|’)ll need|what we('|’)re looking for|must[- ]have)\b/i,
    qualifications: /^(preferred |minimum |required )?qualifications\b|^(who you are|about you)\b/i,
    benefits: /^(benefits|perks|what we offer)\b/i
  };
  function splitSections(text) {
    const out = {};
    let cur = null;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const key = line.length < 70 ? Object.keys(LABELS).find((k) => LABELS[k].test(line.replace(/[:：]$/, ''))) : null;
      if (key) { cur = key; out[cur] = out[cur] || ''; continue; }
      if (cur && /^(how to apply|about (us|the company)|equal opportunity)/i.test(line)) { cur = null; continue; }
      if (cur && out[cur].length < 3000) out[cur] += line + '\n';
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  }

  function applyLink() {
    for (const a of document.querySelectorAll('a[href]')) {
      if (/^(easy )?apply( now| for this job| on company site)?$/i.test(clean(a.innerText))) { const u = absUrl(a.href); if (u) return u; }
    }
    return '';
  }

  function highlight(node) {
    node.classList.add('jobmatch-ai-highlight');
    setTimeout(() => node.classList.remove('jobmatch-ai-highlight'), 2500);
  }

  function extractPage() {
    const ld = fromJsonLd();
    const container = findContainer();
    const containerText = container ? visibleText(container) : '';
    const description = clean(first(ld && ld.description.length >= 200 ? ld.description : '', containerText));

    if (description.length < 200) return { ok: false, error: 'NO_JOB_DETECTED' };
    if (container) highlight(container);

    const heading = textOf(['h1'], 160);
    const job = {
      title: first(ld?.title, heading, textOf(['meta[property="og:title"]'], 160), document.title),
      company: first(ld?.company, textOf(['[itemprop="hiringOrganization"]', '[data-testid*="company" i]', '[class*="company-name" i]', '[class*="company" i]']),
        textOf(['meta[property="og:site_name"]'])),
      location: first(ld?.location, textOf(['[itemprop="jobLocation"]', '[data-testid*="location" i]', '[class*="location" i]'])),
      salary: first(ld?.salary, textOf(['[class*="salary" i]', '[class*="compensation" i]', '[data-testid*="salary" i]']), (description.match(SALARY_RE) || [''])[0]),
      employmentType: first(ld?.employmentType, (description.slice(0, 2500).match(TYPE_RE) || [''])[0].toLowerCase()),
      description: description.slice(0, MAX_CHARS),
      truncated: description.length > MAX_CHARS,
      sections: splitSections(description),
      applicationUrl: first(ld?.applicationUrl, applyLink(), location.href),
      url: location.href
    };
    return { ok: true, source: ld ? 'structured data + page text' : 'page text', job };
  }

  // ---------- 3) manual selection ----------
  function extractSelection() {
    const text = clean(String(window.getSelection() || ''));
    if (text.length < MIN_CHARS) return { ok: false, error: 'NO_SELECTION' };
    return {
      ok: true, source: 'your text selection',
      job: { title: textOf(['h1'], 160), description: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS, url: location.href, pageTitle: document.title }
    };
  }

  window.__jobMatch = { run: (mode) => (mode === 'selection' ? extractSelection() : extractPage()) };
})();
