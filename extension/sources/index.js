// Registry of job sources. To add a source: create an adapter extending JobSourceAdapter and add it here.
import { LinkedInSearchAdapter, IndeedSearchAdapter } from './LinkOutAdapters.js';
import { RemotiveAdapter } from './RemotiveAdapter.js';

export const SOURCES = [new RemotiveAdapter(), new LinkedInSearchAdapter(), new IndeedSearchAdapter()];
