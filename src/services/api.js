import { runtime } from "../config/runtime.js";
import { withBasePath } from "../../shared/public-url.js";

import { sendCommand } from './transport.js';
import { decodeHttpResponse } from '../state/reducers.js';

export async function request(path, options = {}) {
  // Only the cookie/redirect lifecycle uses HTTP. Application reads and writes
  // travel through the authenticated UIBUILDER contract.
  if (!path.startsWith('/api/v1/auth/') && path !== '/api/v1/tenant-registration-config') return sendCommand(path, options);
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (options.body || options.method === 'POST') headers['content-type'] = 'application/json';
  const target = withBasePath(path, runtime.basePath);
  return decodeHttpResponse(await fetch(target, {credentials:'include', ...options, headers}));
}

export const api = {
  registrationConfig: () => request("/api/v1/tenant-registration-config"),
  register: (input) => request("/api/v1/tenant-registrations", { method: "POST", body: JSON.stringify(input) }),
  verify: (registrationId, token) => request(`/api/v1/tenant-registrations/${encodeURIComponent(registrationId)}/verify-email`, { method: "POST", body: JSON.stringify({ token }) }),
  resend: (registrationId) => request(`/api/v1/tenant-registrations/${encodeURIComponent(registrationId)}/resend-verification`, { method: "POST" }),
  authConfig: () => request("/api/v1/auth/config"),
  authExchange: (body) => request("/api/v1/auth/oidc/exchange", { method: "POST", body: JSON.stringify(body) }),
  session: () => request("/api/v1/auth/session"),
  logout: () => request("/api/v1/auth/logout", { method: "POST" }),
  registrations: (state = "") => request(`/api/v1/provider/tenant-registrations${state ? `?state=${encodeURIComponent(state)}` : ""}`),
  registration: (id) => request(`/api/v1/provider/tenant-registrations/${encodeURIComponent(id)}`),
  approve: (item, reason) => request(`/api/v1/provider/tenant-registrations/${encodeURIComponent(item.registrationId)}/approve`, {
    method: "POST",
    headers: { "if-match": `"${item.version}"` },
    body: JSON.stringify({ reason: reason || null }),
  }),
  reject: (item, reason) => request(`/api/v1/provider/tenant-registrations/${encodeURIComponent(item.registrationId)}/reject`, {
    method: "POST",
    headers: { "if-match": `"${item.version}"` },
    body: JSON.stringify({ reason }),
  }),
  tenants: () => request("/api/v1/provider/tenants"),
  tenantReconciliation: (id) => request(`/api/v1/provider/tenants/${encodeURIComponent(id)}/reconciliation`),
  tenantContext: () => request("/api/v1/runtime/tenant-context"),
  tenantProfile: () => request("/api/v1/tenant/profile"),
  tenantMembers: (tenantId) => request(`/api/v1/tenants/${encodeURIComponent(tenantId)}/members`),
  inviteMember: (tenantId, input) => request(`/api/v1/tenants/${encodeURIComponent(tenantId)}/members`, { method: "POST", body: JSON.stringify(input) }),
  platformStatus: () => request("/api/v1/platform/status"),
};
