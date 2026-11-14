// Request-time policies; every authorization reads current tenant membership.
import { sr2Fail } from './domain.js';
export function sr2CheckVersion(r, expected) {
  if (expected === undefined || expected === null) sr2Fail(428, 'PCI-SR2-PRECONDITION', 'Supply the current If-Match version.');
  if (expected !== r.version) sr2Fail(412, 'PCI-SR2-PRECONDITION', 'The resource changed. Reload before saving.');
}
export async function sr2AuthorizePrincipal(tx, p, permission = 'issuer', configurationId = null) {
  if (!p || p.tenantId !== tx.tenant.tenant_id || p.host !== tx.tenant.primary_domain) sr2Fail(404, 'PCI-SR2-NOT-FOUND');
  if (tx.tenant.state !== 'active') sr2Fail(409, 'PCI-SR2-TENANT-INACTIVE', 'The tenant is not active.');
  if (typeof p.subject !== 'string' || !p.subject || !Array.isArray(p.roles) || !p.roles.every(role => typeof role === 'string')) {
    sr2Fail(403, 'PCI-SR2-FORBIDDEN', 'Valid principal identity and role claims are required.');
  }
  const m = await tx.member(p.subject);
  if (!m?.enabled) sr2Fail(403, 'PCI-SR2-FORBIDDEN', 'An enabled tenant membership is required.');
  // Membership is read on every request: revoked assignments and disabled members
  // do not remain authorized until a cached OIDC session expires.
  const roles = (m.roles || []).filter(r => p.roles.includes(r));
  if (permission === 'principal') return { ...p, roles };
  if (roles.includes('participant_tenant_admin')) return { ...p, roles };
  if (permission === 'admin') sr2Fail(403, 'PCI-SR2-FORBIDDEN', 'Tenant administration is required.');
  const assignments = (await tx.assignments(p.subject)).filter(a => !a.revoked);
  if (assignments.some(a => a.configurationIds === null || (configurationId && a.configurationIds.includes(
    configurationId)))) return { ...p, roles };
  sr2Fail(configurationId ? 404: 403, configurationId ? 'PCI-SR2-NOT-FOUND': 'PCI-SR2-FORBIDDEN', 'Issuer delegation is required.');
}
export function sr2PublicResource(r) {
  if (r.kind === 'asset') {
    const { base64, ...safe } = r.draft;
    return { ...r, draft: safe };
  } return r;
}
