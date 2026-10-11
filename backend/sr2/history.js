import crypto from 'node:crypto';
import { sr2Assert } from './domain.js';

// A public holder key is audit metadata, not the wallet proof or credential.
// did:jwk identifies the exact verified key; it does not invent a wallet identity.
export function sr2HolderDid(binding) {
  if (!binding) return null;
  sr2Assert(binding.jwk && !binding.jwk.d && !binding.jwk.k, 'A verified public holder key is required.');
  const key = crypto.createPublicKey({key: binding.jwk, format: 'jwk'}).export({format: 'jwk'});
  const canonical = Object.fromEntries(Object.keys(key).sort().map(name => [name, key[name]]));
  return 'did:jwk:' + Buffer.from(JSON.stringify(canonical)).toString('base64url');
}

// Generated only for an authorized history response. Never reuse an IdP access
// token as history data. The separate type/audience/key cannot authorize PCI APIs.
export function sr2PrincipalStatement(member, {tenantId, subjectHash, issuer, pepper, now}) {
  const principal = member ? {
    username: member.username || '', email: member.email || '',
    name: [member.first_name, member.last_name].filter(Boolean).join(' '),
    enabled: member.enabled === true,
  } : {unavailable: true};
  const iat = Math.floor(now / 1000);
  const claims = {iss: issuer, aud: 'urn:xfsc:pci:issuance-history', sub: subjectHash,
    tenant_id: tenantId, iat, exp: iat + 300, principal};
  const key = crypto.createHmac('sha256', pepper).update('pci-history-statement-v1').digest();
  const input = [{alg: 'HS256', typ: 'pci-history+jwt'}, claims]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return {principal, principalJwt: input + '.' + crypto.createHmac('sha256', key).update(input).digest('base64url')};
}
