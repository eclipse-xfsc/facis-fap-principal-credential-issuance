import crypto from 'node:crypto';

export class Sr2Error extends Error {
  constructor(status, code, detail) { super(detail); this.status = status; this.code = code; }
}
export function sr2Fail(status, code, detail = 'The operation cannot be completed.') { throw new Sr2Error(status, status===404?'PCI-SR2-NOT-FOUND':code, status===404?'The requested resource does not exist.':detail); }
export function sr2Assert(test, detail) { if (!test) sr2Fail(400, 'PCI-SR2-VALIDATION', detail); }
export function sr2Object(value, keys) {
  sr2Assert(value && typeof value === 'object' && !Array.isArray(value), 'An object is required.');
  sr2Assert(Object.keys(value).every(key => keys.includes(key)), 'Unknown fields are not permitted.');
  return value;
}
export function sr2Text(value, max = 200, empty = false) {
  sr2Assert(typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), 'Invalid text.');
  return value.trim();
}
export function sr2Uuid(value) { sr2Assert(typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value), 'A UUID is required.'); return value.toLowerCase(); }
export function sr2Name(value) { sr2Assert(typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value), 'Invalid identifier.'); return value; }
export function sr2Integer(value, min, max) { sr2Assert(Number.isSafeInteger(value) && value >= min && value <= max, 'Integer outside allowed range.'); return value; }
export function sr2List(value, min = 0, max = 100) { sr2Assert(Array.isArray(value) && value.length >= min && value.length <= max, 'Invalid list size.'); return value; }
export function sr2Unique(values) { sr2Assert(new Set(values).size === values.length, 'Duplicate entries are not permitted.'); return values; }
export function sr2Canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(sr2Canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + sr2Canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function sr2Hash(value) { return crypto.createHash('sha256').update(sr2Canonical(value)).digest('hex'); }
export function sr2Https(value) {
  sr2Text(value, 1024); let u;
  try { u = new URL(value); } catch { sr2Fail(400, 'PCI-SR2-VALIDATION', 'An HTTPS URL is required.'); }
  sr2Assert(u.protocol === 'https:' && !u.username && !u.password && !u.hash, 'An HTTPS URL without credentials or fragment is required.'); return u;
}
export function sr2Metadata(value, origin) {
  sr2Object(value, ['profile', 'issuer', 'authorizationServers', 'did', 'jwksUrl', 'displayName']);
  sr2Assert(['oid4vci-draft13', 'oid4vci-1.0'].includes(value.profile), 'Unsupported protocol profile.');
  sr2Assert(value.issuer === origin, 'Issuer must equal the routed tenant issuer URL.');
  const servers = sr2Unique(sr2List(value.authorizationServers, 1, 5).map(x => sr2Https(x).href.replace(/\/$/, '')));
  const did = sr2Text(value.did, 512); const tenantDid='did:web:'+new URL(origin).hostname; sr2Assert(did===tenantDid || did.startsWith(tenantDid+':') && /^did:web:[A-Za-z0-9._:%-]+$/.test(did), 'Use a did:web identifier bound to the tenant host; other methods need a verified adapter.');
  const jwks = sr2Https(value.jwksUrl); sr2Assert(jwks.origin === new URL(origin).origin, 'JWKS URL must be on the tenant origin.');
  return {profile:value.profile, issuer:value.issuer, authorizationServers:servers, did, jwksUrl:jwks.href, displayName:sr2Text(value.displayName, 100)};
}
export function sr2Branding(value) {
  sr2Object(value, ['title', 'description', 'accent', 'logoAssetId']);
  const accent = String(value.accent || '#173c67'); sr2Assert(/^#[a-f0-9]{6}$/i.test(accent), 'Use a six-digit hex color.');
  const channels = [1,3,5].map(i => parseInt(accent.slice(i,i+2),16)/255).map(c => c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
  const luminance = channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
  sr2Assert(1.05/(luminance+0.05) >= 4.5, 'Accent must provide at least 4.5:1 contrast with white text.');
  return {title:sr2Text(value.title,100), description:sr2Text(value.description,1000,true), accent, logoAssetId:value.logoAssetId ? sr2Uuid(value.logoAssetId) : null};
}
export function sr2Configuration(value) {
  sr2Object(value, ['identifier','name','description','profile','format','credentialTypes','vct','claims','logoAssetId','backgroundAssetId','flowId','connectorId','signingMode','keyRef','statusProfile','eligibility','ratePerMinute','blockReissuance']);
  const profile = value.profile; sr2Assert(['oid4vci-draft13','oid4vci-1.0'].includes(profile), 'Unsupported protocol profile.');
  const format = value.format; sr2Assert(['jwt_vc_json','vc+sd-jwt','dc+sd-jwt','ldp_vc'].includes(format), 'Unsupported credential format.');
  sr2Assert(!(profile === 'oid4vci-draft13' && format === 'dc+sd-jwt') && !(profile === 'oid4vci-1.0' && format === 'vc+sd-jwt'), 'Format and profile do not match.');
  const sd = format.includes('sd-jwt');
  const credentialTypes = sr2Unique(sr2List(value.credentialTypes || [], sd ? 0 : 1, 10).map(x => sr2Text(x,100)));
  sr2Assert(sd || credentialTypes.includes('VerifiableCredential'), 'W3C credentials require the VerifiableCredential type.');
  const vct = sd ? sr2Text(value.vct,200) : null;
  sr2Assert(sd || !value.vct, 'VCT is only applicable to SD-JWT.');
  const claims = sr2List(value.claims,1,50).map(x => { sr2Object(x,['name','type','required']); sr2Assert(['string','number','boolean'].includes(x.type) && typeof x.required === 'boolean','Invalid claim definition.'); return {name:sr2Name(x.name),type:x.type,required:x.required}; });
  sr2Unique(claims.map(x=>x.name)); sr2Assert(!claims.some(x=>['id','sub','iss','exp','nbf','iat','credentialStatus'].includes(x.name)), 'Reserved claim names cannot be configured.');
  const e = sr2Object(value.eligibility,['subjects','roles']);
  const eligibility = {subjects:sr2Unique(sr2List(e.subjects || [],0,100).map(x=>sr2Text(x,200))), roles:sr2Unique(sr2List(e.roles || [],0,10).map(x=>sr2Text(x,100)))};
  sr2Assert(eligibility.roles.every(x=>['principal','issuer_admin','participant_tenant_admin'].includes(x)), 'Unknown trusted role.');
  sr2Assert(eligibility.subjects.length + eligibility.roles.length > 0, 'At least one eligible population is required.');
  sr2Assert(['participant-signed','internal-signing'].includes(value.signingMode), 'Choose a signing mode.');
  return {identifier:sr2Name(value.identifier),name:sr2Text(value.name,100),description:sr2Text(value.description,1000,true),profile,format,credentialTypes,vct,claims,
    logoAssetId:value.logoAssetId ? sr2Uuid(value.logoAssetId) : null, backgroundAssetId:value.backgroundAssetId ? sr2Uuid(value.backgroundAssetId) : null,
    flowId:value.flowId ? sr2Uuid(value.flowId) : null,connectorId:value.connectorId ? sr2Uuid(value.connectorId) : null,signingMode:value.signingMode,
    keyRef:sr2Text(value.keyRef,200),statusProfile:sr2Name(value.statusProfile),eligibility,
    ratePerMinute:sr2Integer(value.ratePerMinute ?? 10,1,60),blockReissuance:value.blockReissuance === true};
}
export function sr2Flow(value) {
  sr2Object(value,['name','steps']);
  const types = ['information','consent','input','confirmation','status','offer'];
  const steps = sr2List(value.steps,2,20).map((s,i) => {
    sr2Object(s,['id','type','title','text','fields']); sr2Assert(types.includes(s.type),'Unknown journey step.');
    const fields = sr2List(s.fields || [],0,10).map(f => {sr2Object(f,['name','label','required']); sr2Assert(typeof f.required === 'boolean','Invalid field requirement.'); return {name:sr2Name(f.name),label:sr2Text(f.label,100),required:f.required};});
    sr2Assert(s.type === 'input' || fields.length === 0,'Only input steps accept fields.'); sr2Unique(fields.map(f=>f.name));
    sr2Assert(s.type !== 'offer' || i === value.steps.length-1,'Offer must be the terminal step.');
    return {id:sr2Name(s.id),type:s.type,title:sr2Text(s.title,100),text:sr2Text(s.text || '',2000,true),fields};
  });
  sr2Unique(steps.map(x=>x.id)); sr2Assert(steps.at(-1).type === 'offer' && steps.some(s=>s.type === 'consent'),'Journey requires consent and a terminal offer.');
  return {name:sr2Text(value.name,100),steps};
}
export function sr2Connector(value, allowedHosts = []) {
  sr2Object(value,['name','endpoint','serverName','protocolVersion','tlsSecret','trustSecret','jwtIssuer','jwtAudience','jwtScopes','signingModes','timeoutMs','attempts','ratePerMinute','circuitFailureThreshold','circuitCooldownMs','configurationIds']);
  const target = sr2Https(value.endpoint);
  sr2Assert(!target.search && allowedHosts.includes(target.hostname) && !/^(localhost|127\.|0\.|169\.254\.|\[)/.test(target.hostname) && target.hostname !== 'metadata.google.internal', 'Endpoint is not on the operator allowlist.');
  sr2Assert(value.serverName === target.hostname, 'TLS server name must match the endpoint host.');
  function secret(ref) {sr2Object(ref,['name']);const name=sr2Text(ref.name,63);sr2Assert(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name),'Invalid Secret name.');return {name};}
  const modes = sr2Unique(sr2List(value.signingModes,1,2)); sr2Assert(modes.every(m=>['participant-signed','internal-signing'].includes(m)),'Invalid connector mode.');
  return {configurationIds:value.configurationIds===null?null:sr2Unique(sr2List(value.configurationIds ?? [],0,100).map(sr2Uuid)),name:sr2Text(value.name,100),endpoint:target.href,serverName:target.hostname,protocolVersion:sr2Name(value.protocolVersion),tlsSecret:secret(value.tlsSecret),trustSecret:secret(value.trustSecret),jwtIssuer:sr2Https(value.jwtIssuer).href.replace(/\/$/,''),jwtAudience:sr2Text(value.jwtAudience,200),jwtScopes:sr2Unique(sr2List(value.jwtScopes,1,20).map(s=>sr2Text(s,100))),signingModes:modes,timeoutMs:sr2Integer(value.timeoutMs ?? 5000,100,10000),attempts:sr2Integer(value.attempts ?? 1,1,3),ratePerMinute:sr2Integer(value.ratePerMinute ?? 10,1,60),circuitFailureThreshold:sr2Integer(value.circuitFailureThreshold ?? 3,2,10),circuitCooldownMs:sr2Integer(value.circuitCooldownMs ?? 30000,1000,300000)};
}
export function sr2Eligible(configuration, principal) {
  return configuration.eligibility.subjects.includes(principal.subject) || configuration.eligibility.roles.some(role=>principal.roles.includes(role));
}
export function sr2Claims(data, configuration, subject) {
  sr2Object(data,['subject','claims']); sr2Assert(data.subject === subject,'Participant subject does not match.');
  const claims=sr2Object(data.claims,configuration.claims.map(c=>c.name));
  for(const c of configuration.claims) {sr2Assert(!c.required || Object.hasOwn(claims,c.name),'A required claim is absent.'); if(Object.hasOwn(claims,c.name)) sr2Assert(typeof claims[c.name] === c.type && (c.type !== 'string' || claims[c.name].length <= 2000) && (c.type !== 'number' || Number.isFinite(claims[c.name])),'Claim type or size is invalid.');}
  return data;
}
export function sr2OneOf(response, mode, requestId) {
  sr2Object(response,['requestId','unsignedData','signedCredential']);
  sr2Assert(response.requestId === requestId,'Participant correlation mismatch.');
  const unsigned=Object.hasOwn(response,'unsignedData'), signed=Object.hasOwn(response,'signedCredential');
  sr2Assert(unsigned !== signed && (mode === 'internal-signing' ? unsigned : signed),'Participant response must match the configured signing mode.'); return response;
}
export function sr2Correlation(record, expected, now) {
  if(!record || record.tenantId !== expected.tenantId || record.configurationId !== expected.configurationId || record.subjectHash !== expected.subjectHash) sr2Fail(404,'PCI-SR2-NOT-FOUND');
  if(record.expiresAt <= now) sr2Fail(410,'PCI-SR2-EXPIRED','The request expired.');
  if(!['offered','journey'].includes(record.state)) sr2Fail(409,'PCI-SR2-REPLAY','The request has already been consumed.');
}
export function sr2OwnedResource(object, tenant, kind) {
  const m=object?.metadata, l=m?.labels || {};
  return object?.kind === kind && m?.name === `pci-tenant-${tenant.tenant_slug}` && l['app.kubernetes.io/managed-by'] === 'fap-pci-orce' && l['xfsc.org/pci-tenant-id'] === tenant.tenant_id && l['xfsc.org/pci-owner-uid'] === tenant.owner_uid && Boolean(m.uid) && Boolean(m.resourceVersion);
}
