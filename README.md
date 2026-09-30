# JobMatch AI

**Understand the job. Match your skills. Organize your applications.**

A Chrome (Manifest V3) extension plus a small Node.js backend. You open a job listing, click the extension, and an AI compares the posting with **your own saved profile**. You see what matched, what is missing and what is unclear, then you can save the job, track the application and prepare a resume / cover-letter draft. You always decide; nothing is ever submitted for you.

## Features

- **Profile**: education, skills, experience, projects, preferences, links, resume text. Edit or delete any time.
- **Job extraction** from the current page (structured data, then visible-text heuristics) with a manual fallback: highlight the text and use *Select Job Text* or right-click → *Analyze with JobMatch AI*.
- **Evidence-based analysis**: matched / missing ("not found in your profile") / unclear, plus education, experience, location, job type, important requirements, concerns and quoted evidence.
- **Profile-to-Job Alignment**: a category label (not a hiring prediction) shown together with the underlying evidence.
- **Application tracker** with statuses Saved, Applied, Assessment, Interview, Offer, Rejected, Withdrawn, dates and notes.
- **Dashboard**: totals, pipeline, weekly activity chart (inline SVG, no library), filters, CSV export.
- **Resume tailoring and cover letter drafts** that may only use facts from your profile, are editable, and list requirements that were deliberately *not* added.
- **Job search assistant** with a pluggable `JobSourceAdapter` architecture (Remotive public API, LinkedIn / Indeed link-outs; no scraping).
- **Settings**: backend URL, theme (system / light / dark), privacy explanation, export and delete buttons.

## Architecture

```
Job page ──(you click)──> popup ──> content script (read-only, injected on demand)
                              │
                              ▼
                     analysis page (extension)  ──HTTPS/HTTP──>  Express backend ──> AI provider (Gemini / OpenAI-compatible)
                              │                                     validates, rate-limits,
                              ▼                                     builds prompts, checks output
                     chrome.storage.local  (profile, jobs, applications, settings)
```

- The **AI key exists only in `server/.env`**. The extension only knows the backend URL.
- The content script is **not** declared in `manifest.json`. It is injected through `chrome.scripting` when you click the popup (`activeTab`), so the extension never runs on pages you did not act on and needs no "read all websites" permission.
- Extension pages are plain ES modules (no build step). AI output is rendered with `textContent` only.

### Folder tree

```
JobMatch-AI/
├── README.md
├── extension/
│   ├── manifest.json
│   ├── shared.css                 design tokens + components
│   ├── assets/ icon16|32|48|128.png
│   ├── popup/ popup.html|css|js
│   ├── content/ content.js|css
│   ├── background/ service-worker.js
│   ├── profile/ profile.html|css|js
│   ├── analysis/ analysis.html|css|js
│   ├── dashboard/ dashboard.html|css|js
│   ├── settings/ settings.html|css|js
│   ├── sources/ JobSourceAdapter.js, LinkOutAdapters.js, RemotiveAdapter.js, index.js
│   ├── storage/ storage.js
│   └── utils/ constants.js, helpers.js, api.js
└── server/
    ├── server.js  package.json  .env.example  .gitignore
    ├── routes/ analyze.js, resume.js, coverLetter.js
    ├── services/ aiService.js      AIProvider, GeminiProvider, OpenAICompatibleProvider
    ├── middleware/ validation.js, rateLimit.js
    ├── utils/ prompts.js, normalize.js, errors.js
    └── test/ server.test.js
```

## Installation

Requirements: Node.js 18.18+ and Chrome/Chromium 110+.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env` and set your key. With Gemini (free key at https://aistudio.google.com → *Get API key*):

```
AI_PROVIDER=gemini
GEMINI_API_KEY=your_real_key
GEMINI_MODEL=gemini-2.5-flash
```

Start it:

```bash
npm run dev      # auto-restart on changes   (or: npm start)
```

Check http://localhost:3000/api/health. It should show `"configured": true`.

### 2. Chrome extension

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. A profile page opens on first install. Fill it in and save.

### Environment variables (`server/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | server port | 3000 |
| `AI_PROVIDER` | `gemini` or `openai` (any OpenAI-compatible API) | gemini |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini settings | model `gemini-2.5-flash` |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | OpenAI-compatible settings | `gpt-4o-mini` |
| `AI_TIMEOUT_MS` | per AI call timeout | 45000 |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | per-IP rate limit | 30 / 60000 |
| `ALLOWED_EXTENSION_IDS` | comma-separated extension IDs allowed to call the server (recommended once deployed) | empty = any extension |
| `ALLOWED_ORIGINS` | extra allowed web origins | empty |

## How to use

1. Save your **profile** (skills, education, experience are the essentials).
2. Open a job listing. Click the JobMatch AI icon → **Analyze This Job**. The part of the page that was read is briefly outlined.
3. If detection fails, highlight the description and click **Select Job Text**, or right-click → **Analyze with JobMatch AI**.
4. Read the analysis, then **Save Job**, **Generate Tailored Resume** or **Generate Cover Letter**. Edit the drafts, copy or download them.
5. Track progress in the **Dashboard**. Change status, set the date applied, add notes.

## API

All responses are JSON. Errors: `{ "ok": false, "error": { "code", "message" } }`.

| Endpoint | Body | Success |
|---|---|---|
| `GET /api/health` | none | `{ ok, service, provider, configured }` |
| `POST /api/analyze-job` | `{ profile, job }` | `{ ok, analysis }` |
| `POST /api/tailor-resume` | `{ profile, job }` | `{ ok, resume, notes }` |
| `POST /api/generate-cover-letter` | `{ profile, job }` | `{ ok, coverLetter, notes }` |

`job.description` (min 40 chars) is required. The server validates and truncates every field, limits request bodies to 200 KB, rate-limits per IP, restricts CORS to extension origins, retries once on malformed AI JSON, and normalizes the AI output to the schema before returning it. Stack traces are never returned; request bodies are never logged.

Analysis schema (`analysis`): `job`, `summary`, `matchedRequirements`, `missingRequirements`, `unclearRequirements`, `skills{matched,missing,additional}`, `education`, `experience` (`status`, `required`, `profile`, `details`), `location`, `jobType` (`status`, `details`), `importantRequirements`, `potentialConcerns`, `evidence[]`. Status values: `matched | not_matched | unclear`.

## Privacy

- The extension reads a page only after a user action.
- Sent to the backend for **analysis**: job text plus skills, languages, frameworks, tools, education, experience, projects, preferences and resume text. **Not sent:** name, links, salary expectation. Drafts additionally include name and links.
- The backend does not store or log requests. The AI provider you configure has its own retention policy. Review it.
- Data in `chrome.storage.local` is private to the extension but **not encrypted at rest**. Do not store secrets in notes.
- Delete or export everything from **Settings**. No analytics, no selling of data.

## Security

No API key in the extension · input validation and sanitization · output validation/normalization · body-size limit · in-memory rate limit · CORS limited to `chrome-extension://` origins (optionally to specific IDs) · profile and job text passed to the model as delimited data with prompt-injection guidance · no `eval`, no inline scripts, no `innerHTML` · minimal permissions (`storage`, `activeTab`, `scripting`, `contextMenus`; localhost host access; optional HTTPS host access requested only when you set a remote backend or use Remotive).

## Test procedure

Automated (no API key needed): `cd server && npm test`.

Manual:

1. **Profile** (Ali Khan): headline *Frontend Developer*; degree *BS Computer Science*; skills `JavaScript, React, HTML, CSS, Node.js`; years of experience `1`; experience entry *Frontend Developer* (1 year); preferred title *Frontend Developer*; preferred location `Remote`; remote preference *Remote*.
2. **Example job.** Paste this into any page (e.g. a Google Doc or a local HTML file), highlight it, and choose *Analyze with JobMatch AI*:

```
Frontend Developer - ABC Technologies (Remote, Full-time)
We are looking for a Frontend Developer to build our customer dashboard.
Requirements:
- BS Computer Science or related degree
- 2+ years of professional experience
- React and JavaScript
- TypeScript
- Next.js
- Solid HTML/CSS
Nice to have: experience writing automated tests.
```

3. **Expected result** (wording varies, structure should not):
   - Matched: React, JavaScript, HTML/CSS, BS Computer Science
   - Potential gaps: TypeScript, Next.js, and experience (job asks 2+ years, profile lists 1 year)
   - Unclear: automated testing experience (optional, not in profile)
   - Location: matched (remote), Job type: matched or unclear
   - Alignment label: *Strong* or *Moderate alignment*, always shown with the evidence and the "not a prediction" note
4. Save the job → it appears in the Dashboard as *Saved*. Change to *Applied* → date applied fills in.
5. Generate a resume and cover letter → they must contain only Ali's real details, and the notes list TypeScript / Next.js as **not added**.

Example AI response (abridged):

```json
{
  "job": { "title": "Frontend Developer", "company": "ABC Technologies", "location": "Remote", "employmentType": "Full-time", "salary": "" },
  "summary": "Frontend role building a customer dashboard. The profile covers the core stack but not TypeScript or Next.js, and lists less experience than requested.",
  "matchedRequirements": ["React - listed in skills", "JavaScript - listed in skills", "HTML/CSS - HTML and CSS listed", "BS Computer Science - degree in profile"],
  "missingRequirements": ["TypeScript - not found in profile", "Next.js - not found in profile", "2+ years experience - profile lists 1 year"],
  "unclearRequirements": ["Automated testing (nice to have) - not mentioned in profile"],
  "education": { "status": "matched", "required": "BS Computer Science or related", "profile": "BS Computer Science", "details": "" },
  "experience": { "status": "not_matched", "required": "2+ years", "profile": "1 year", "details": "Potential experience gap." },
  "location": { "status": "matched", "details": "Remote role; profile prefers remote." },
  "jobType": { "status": "unclear", "details": "Profile has no job type preference." }
}
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot reach the JobMatch AI server" | Start the backend (`npm run dev`) and check *Settings → Test connection*. URL must match the server port. |
| "The AI service is not configured on the server" | `GEMINI_API_KEY` missing in `server/.env`; restart the server after editing. |
| "not configured correctly" (`AI_CONFIG`) | Wrong key or model name. Check `GEMINI_MODEL`. |
| "rate limit was reached" | Wait a minute (free tiers are limited) or lower usage. |
| "This origin is not allowed" | `ALLOWED_EXTENSION_IDS` is set but does not contain your extension ID (see `chrome://extensions`). |
| "No job description detected" | Highlight the description and use *Select Job Text* / right-click. Some sites render text in ways heuristics cannot read. |
| "Unable to analyze this page" | Chrome blocks extensions on `chrome://` pages and the Web Store; open a normal website. |
| Profile page says incomplete | Add at least skills, experience or resume text. |
| Changes not showing | Click the reload icon for the extension in `chrome://extensions`. |

## Known limitations

- Extraction is heuristic. Sites with unusual markup, heavy client-side rendering or login walls may need manual selection.
- Resume upload reads `.txt` / `.md` only. Paste text from PDF or Word files.
- The alignment label is a coarse heuristic (matched vs. gaps) and only as good as the AI's classification. Treat the evidence as the source of truth.
- AI output can be wrong. Review all analyses and drafts.
- Data is stored unencrypted in `chrome.storage.local` and is not synced between devices.
- Rate limiting is in-memory (single server instance).
- The Remotive adapter depends on that service's public API and terms; verify them before heavy use.
- The code was syntax-checked and its logic unit-tested, but it was not exercised in a live Chrome session or against a real AI key. Run the manual test procedure above before relying on it.

## Future improvements

PDF/DOCX resume import · encrypted local storage with a passphrase · more official job APIs via `JobSourceAdapter` · reminders for follow-ups · skill-gap learning suggestions · Firefox build · optional cloud sync with end-to-end encryption.
