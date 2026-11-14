// Tenant selection is evaluated per call, so switching tenants cannot retain a
// stale URL. The existing request transport owns authentication and base paths.
export function createPciIssuerClient(request, tenantId) {
  if (typeof request !== 'function' || typeof tenantId !== 'function') {
    throw new TypeError('A request function and tenant getter are required.');
  }
  return async function call(path, method = 'GET', data, version, extra = {}) {
    const base = `/api/v1/tenants/${encodeURIComponent(tenantId())}`;
    return request(base + path, {
      method,
      headers: { ...(version ? { 'if-match': `"${version}"` }: {}), ...extra },
      ...(method !== 'GET' ? { body: JSON.stringify(data || {}) }: {})
    });
  };
}
