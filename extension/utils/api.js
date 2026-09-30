// Talks to the JobMatch AI backend. The AI key never reaches the extension - only this server URL does.
import { getSettings } from '../storage/storage.js';

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export async function apiRequest(path, { method = 'POST', body, timeoutMs = 70000 } = {}) {
  const { backendUrl } = await getSettings();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(backendUrl.replace(/\/+$/, '') + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data || data.ok === false) {
      throw new ApiError(data?.error?.code || `HTTP_${res.status}`, data?.error?.message || 'AI service is temporarily unavailable.');
    }
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === 'AbortError') throw new ApiError('TIMEOUT', 'The request took too long. Please try again.');
    throw new ApiError('NETWORK', 'Cannot reach the JobMatch AI server. Make sure it is running and the URL in Settings is correct.');
  } finally { clearTimeout(timer); }
}
