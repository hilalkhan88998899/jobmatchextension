// Central constants shared by every extension page.
export const APP_NAME = 'JobMatch AI';

export const STORAGE_KEYS = {
  profile: 'userProfile',
  jobs: 'savedJobs',
  applications: 'applications',
  settings: 'settings',
  pending: 'pendingAnalysis', // job handed from popup/context menu to the analysis page (deleted once read)
  last: 'lastAnalysis',       // most recent analysis, so a reload does not lose it
  search: 'searchPrefs'
};

export const STATUSES = ['Saved', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];

export const DEFAULT_SETTINGS = { backendUrl: 'http://localhost:3000', theme: 'system' };

export const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];

export const REMOTE_OPTIONS = [
  ['any', 'No preference'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']
];

export const LIMITS = { maxJobText: 15000, minJobText: 40, maxResumeFile: 200 * 1024 };

export const LOADING_MESSAGES = [
  'Analyzing job requirements...', 'Extracting skills...', 'Comparing your profile...', 'Preparing analysis...'
];

export const ALIGNMENT_NOTE =
  'Profile-to-Job Alignment is an informational estimate based only on the profile you saved and the text of this posting. ' +
  'It is not a prediction of hiring outcomes. Items marked as gaps were not found in your profile; they do not prove you cannot do the job.';

export const DRAFT_NOTE =
  'AI draft. It only uses information from your saved profile, but AI can still make mistakes. Review and edit everything before you use it.';
