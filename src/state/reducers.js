import { store } from './store.js';

export function normalizeUiError(error) {
  return { category: error?.category || (error?.status >= 502 ? 'integration' : 'system'),
    message: error?.message || 'The operation could not be completed.',
    code: error?.code || 'PCI-UI-ERROR', reference: error?.correlationId || error?.reference || '',
    status: error?.status, retryable: error?.retryable === true, fields: error?.fields || {} };
}

export function responseError(problem, status) {
  const error = new Error(problem?.detail || problem?.message || `Request failed with status ${status}`);
  return Object.assign(error, { status, code: problem?.code, correlationId: problem?.correlation_id || problem?.reference,
    retryable: problem?.retryable === true, fields: problem?.fields || {},
    category: problem?.category || (Object.keys(problem?.fields || {}).length ? 'field' : status >= 502 ? 'integration' : status >= 500 ? 'system' : 'action') });
}

export async function decodeHttpResponse(response) {
  if (response.status === 204 && response.ok) return null;
  let body;
  try { body = await response.json(); }
  catch { throw responseError({code:'PCI-UI-PROTOCOL', detail:'The server returned an unreadable response. Refresh to check the operation before retrying.'}, 502); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw responseError({code:'PCI-UI-PROTOCOL',detail:'The server returned an invalid response.'}, 502);
  if (!response.ok) throw responseError(body, response.status);
  return body;
}

// All application results/events enter here, including job updates. Business
// results are returned to the view model; secrets are never cached or persisted.
export function reduceUiMessage(envelope, pending) {
  if (!envelope || envelope.version !== 1 || !pending || envelope.requestId !== pending.requestId || envelope.action !== pending.action) return null;
  if (envelope.type === 'event' && envelope.event === 'jobProgress') {
    const data = envelope.data;
    if (!data || data.jobId !== envelope.requestId || typeof data.label !== 'string') return null;
    store.ui.jobs[envelope.requestId] = {stage:data.stage, label:data.label, progress:Number.isFinite(data.progress) ? Math.max(0,Math.min(100,data.progress)) : null};
    return { event: true };
  }
  if (envelope.type !== 'result' || typeof envelope.ok !== 'boolean') return null;
  delete store.ui.jobs[envelope.requestId];
  if (!envelope.ok) {
    const errors = envelope.errors;
    if (!errors || !['field','action','integration','system'].some(key => errors[key])) return {error:responseError({code:'PCI-UI-PROTOCOL',detail:'The server returned an incomplete error response.'},502)};
    const detail = errors.field || errors.action || errors.integration || errors.system;
    return {error:responseError({...detail, fields:errors.fields || {}}, envelope.status)};
  }
  if (!Object.hasOwn(envelope, 'data')) return {error:responseError({code:'PCI-UI-PROTOCOL',detail:'The server returned an incomplete result.'},502)};
  if (envelope.next && Number.isInteger(envelope.next.step)) store.step = envelope.next.step;
  if (pending.path === '/api/v1/platform/status') store.platform = envelope.data;
  return { data: envelope.data };
}
