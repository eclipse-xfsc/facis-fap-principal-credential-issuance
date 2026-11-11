// Copyright (c) 2026 LEANEA GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License, Version 2.0 which is available at
// https://www.apache.org/licenses/LICENSE-2.0.
//
// SPDX-License-Identifier: Apache-2.0
//
// Prepared with AI-assisted tools and reviewed by the author.
// Assisted-by: AI
// Characterisation tests for the authentication Function node
// (backend/functions/auth.js): they record the behaviour of the baseline before
// the node is refactored, action by action, with the shared helpers of
// _common.js running unchanged against a fake pool and stubbed Keycloak calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { runFunctionNode, httpMessage, fakePg } from '../../support/function-node.mjs';
const tenantId = '22222222-2222-4222-8222-222222222222';
const tenantRow = {
  tenant_id: tenantId,
  tenant_slug: 'alpha',
  primary_domain: 'alpha-pci.example.com',
  state: 'active'
};
const verifier = 'v'.repeat(43);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function keycloak(claims, { exp = Math.floor(Date.now() / 1000) + 300 } = {}) {
  const tokenSet = { id_token: 'id-token', access_token: 'access-token' };
  const calls = { token: [], jwks: [], verify: [] };
  return {
    calls,
    overrides: { requestJson: async(target, options) => {
      calls.token.push({ target, options });
      return tokenSet;
    } },
    libs: {
      jwt: {
        decode: (token, options) => token === 'id-token' && options?.complete ? { header: { kid: 'kid-1' }, payload: claims }: token ===
          'access-token' ? { exp }: null,
        verify: (token, key, options) => {
          calls.verify.push({ token, key, options });
          return claims;
        }
      },
      jwksRsa: options => {
        calls.jwks.push(options);
        return { getSigningKey: async() => ({ getPublicKey: () => 'public-key' }) };
      }
    }
  };
}
function exchange(host, body = {}) {
  return httpMessage('auth.exchange',
    { host, body: { code: 'code', verifier, nonce: 'nonce', redirectUri: `https://${host}/ui/`, ...body } });
}
function problem(result) {
  assert.ok(result.msg.statusCode >= 400, 'expected a problem response');
  assert.equal(result.msg.headers['content-type'], 'application/problem+json; charset=utf-8');
  return result.msg.payload;
}
test('auth.config on the provider host describes the realm without a database query', async() => {
  const pg = fakePg(() => {
    throw new Error('no query expected');
  });
  const result = await runFunctionNode('auth.js', { msg: httpMessage('auth.config'), pg });
  assert.equal(result.msg.statusCode, 200);
  assert.deepEqual(result.msg.payload, {
    enabled: true,
    identityProvider: null,
    issuer: 'https://identity.example.com/realms/pci',
    clientId: 'fap-pci-ui',
    redirectUri: 'https://pci.example.com/ui/',
    orceBasePath: '',
    uiPath: '/ui/',
    scope: 'openid profile email',
    authorizationEndpoint: 'https://identity.example.com/realms/pci/protocol/openid-connect/auth',
    endSessionEndpoint: 'https://identity.example.com/realms/pci/protocol/openid-connect/logout'
  });
  assert.deepEqual(result.output, [result.msg, null]);
  assert.equal(pg.calls.length, 0);
});
test('auth.config on a tenant host names the active OIDC broker and rejects unknown or inactive tenants', async() => {
  const identity = { state: 'active', mode: 'oidc', alias: 'pci-' + tenantId, version: 2 };
  const pg = fakePg(sql => sql.startsWith('SELECT document') ? { rows: [{ document: identity }] }: sql.includes('FROM tenants') ?
    { rows: [tenantRow] }: null);
  const active = await runFunctionNode('auth.js', { msg: httpMessage('auth.config', { host: 'alpha-pci.example.com' }), pg });
  assert.equal(active.msg.payload.identityProvider, 'pci-' + tenantId);
  assert.equal(active.msg.payload.redirectUri, 'https://alpha-pci.example.com/ui/');
  const unknown = await runFunctionNode('auth.js', {
    msg: httpMessage('auth.config', { host: 'nobody-pci.example.com' }),
    pg: fakePg(() => ({ rows: [] }))
  });
  assert.equal(problem(unknown).status, 404);
  const suspended = await runFunctionNode('auth.js', {
    msg: httpMessage('auth.config', { host: 'alpha-pci.example.com' }),
    pg: fakePg(() => ({ rows: [{ ...tenantRow, state: 'suspended' }] }))
  });
  assert.equal(problem(suspended).status, 404);
  const noHost = await runFunctionNode('auth.js', { msg: httpMessage('auth.config', { host: '' }) });
  assert.equal(problem(noHost).code, 'PCI-TENANT-403-001');
});
test('auth.exchange validates the callback before any token request', async() => {
  for (const patch of [{ code: '' }, { verifier: 'short' }, { nonce: '' }, { redirectUri: 'https://pci.example.com/other/' }]) {
    const kc = keycloak({});
    const result = await runFunctionNode('auth.js', { msg: exchange('pci.example.com', patch), libs: kc.libs, overrides: kc.overrides });
    assert.equal(problem(result).code, 'PCI-VALIDATION-400-001', JSON.stringify(patch));
    assert.equal(kc.calls.token.length, 0);
  }
  const noHost = await runFunctionNode('auth.js', { msg: exchange('') });
  assert.equal(problem(noHost).status, 400);
});
test('auth.exchange on the provider host admits only provider administrators and records the session', async() => {
  const claims = {
    sub: 'subject-1',
    preferred_username: 'provider',
    email: 'provider@example.com',
    name: 'Provider Admin',
    realm_access: { roles: ['provider_admin', 'offline_access'] },
    groups: ['/operators']
  };
  const kc = keycloak(claims, { exp: Math.floor(Date.now() / 1000) + 60 });
  const pg = fakePg(() => ({ rows: [] }));
  const result = await runFunctionNode('auth.js', { msg: exchange('pci.example.com'), libs: kc.libs, overrides: kc.overrides, pg });
  assert.equal(result.msg.statusCode, 200, JSON.stringify(result.msg.payload));
  // Token request: authorization code with PKCE at the internal realm URL.
  assert.equal(kc.calls.token[0].target, 'http://keycloak.internal/realms/pci/protocol/openid-connect/token');
  const form = new URLSearchParams(kc.calls.token[0].options.body);
  assert.deepEqual(Object.fromEntries(form), {
    grant_type: 'authorization_code',
    client_id: 'fap-pci-ui',
    code: 'code',
    redirect_uri: 'https://pci.example.com/ui/',
    code_verifier: verifier
  });
  // ID token verification: public issuer, UI client audience, nonce, 10 s tolerance.
  assert.deepEqual(kc.calls.verify[0].options, {
    algorithms: ['RS256', 'PS256', 'ES256'],
    issuer: 'https://identity.example.com/realms/pci',
    audience: 'fap-pci-ui',
    nonce: 'nonce',
    clockTolerance: 10
  });
  assert.equal(kc.calls.jwks[0].jwksUri, 'http://keycloak.internal/realms/pci/protocol/openid-connect/certs');
  // Session row: hashed token, PCI roles only (offline_access is dropped) as JSON, no tenant on the provider host.
  const insert = pg.calls.find(c => c.sql.startsWith('INSERT INTO auth_sessions'));
  const session = result.msg.payload.session;
  assert.equal(insert.args[0], session.sessionId);
  assert.equal(insert.args[2], 'subject-1');
  assert.equal(insert.args[3], 'provider');
  assert.equal(insert.args[4], 'Provider Admin');
  assert.deepEqual(JSON.parse(insert.args[6]), ['provider_admin']);
  assert.equal(insert.args[7], null);
  assert.equal(insert.args[8], null);
  assert.equal(insert.args[10], session.expiresAt);
  const audit = pg.calls.find(c => c.sql.startsWith('INSERT INTO audit_events'));
  assert.equal(audit.args[0], 'keycloak:subject-1');
  assert.deepEqual(JSON.parse(audit.args[2]), { host: 'pci.example.com', roles: ['provider_admin'] });
  // Cookie: the raw token, HttpOnly, Secure, Lax, 480 minutes; its hash is what the row stores.
  const cookie = result.msg.headers['set-cookie'];
  const token = decodeURIComponent(/fap_pci_session=([^;]+)/.exec(cookie)[1]);
  assert.equal(sha256(token), insert.args[1]);
  assert.match(cookie, /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/);
  assert.equal(JSON.stringify(result.msg.payload).includes(token), false);
  assert.equal(JSON.stringify(result.msg.payload).includes('access-token'), false);
  // Response body.
  assert.deepEqual(session, {
    sessionId: session.sessionId,
    subject: 'subject-1',
    username: 'provider',
    displayName: 'Provider Admin',
    email: 'provider@example.com',
    roles: ['provider_admin'],
    tenantId: null,
    tenantSlug: null,
    expiresAt: session.expiresAt
  });
});
test('auth.exchange keeps the access token in process memory with bounded entitlements and expiry', async() => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const claims = {
    sub: 'subject-2',
    preferred_username: 'provider',
    realm_access: { roles: ['provider_admin'] },
    groups: Array.from({ length: 150 }, (_, i) => '/g' + i).concat(['/' + 'x'.repeat(300)])
  };
  const kc = keycloak(claims, { exp });
  const pg = fakePg(() => ({ rows: [] }));
  const result = await runFunctionNode('auth.js', { msg: exchange('pci.example.com'), libs: kc.libs, overrides: kc.overrides, pg });
  assert.equal(result.msg.statusCode, 200);
  const sessionId = result.msg.payload.session.sessionId;
  // The token map hangs off the pool instance the helpers created.
  const pools = [...result.pool.Pool[Symbol.for('xfsc.fap-pci.process-state.v1')].values()].map(s => s.poolHolder?.pool).filter(Boolean);
  const tokens = pools[0].pciTokens;
  const stored = tokens.get(sessionId);
  assert.equal(stored.token, 'access-token');
  assert.equal(stored.subject, 'subject-2');
  assert.equal(stored.entitlements.length, 100);
  assert.ok(stored.entitlements.every(e => e.length <= 200));
  assert.equal(stored.entitlements[0], 'role:provider_admin');
  assert.equal(stored.expiresAt, exp * 1000);
});
test('auth.exchange on the provider host rejects brokered identities and accounts without a PCI role', async() => {
  for (const [claims, detail] of [
    [
      { sub: 's', realm_access: { roles: ['principal'] } },
      'Only provider administrators can sign in on the PCI provider host.'
    ],
    [
      { sub: 's', pci_identity_provider: 'pci-x', realm_access: { roles: ['provider_admin'] } },
      'Only provider administrators can sign in on the PCI provider host.'
    ],
    [
      { sub: 's', realm_access: { roles: [] } },
      'Only provider administrators can sign in on the PCI provider host.'
    ]
  ]) {
    const kc = keycloak(claims);
    const pg = fakePg(() => ({ rows: [] }));
    const result = await runFunctionNode('auth.js', { msg: exchange('pci.example.com'), libs: kc.libs, overrides: kc.overrides, pg });
    const body = problem(result);
    assert.equal(body.status, 403);
    assert.equal(body.detail, detail);
    assert.equal(pg.calls.some(c => c.sql.startsWith('INSERT')), false, 'no session is written');
  }
});
test('auth.exchange on a tenant host admits through the tenant identity policy and binds the session to the tenant', async() => {
  const claims = {
    sub: 'subject-3',
    preferred_username: 'alice',
    tenant_id: tenantId,
    realm_access: { roles: ['principal'] }
  };
  const kc = keycloak(claims);
  const admissions = [];
  const admit = async(tenant, c, tokenSet) => {
    admissions.push({ tenant, c, tokenSet });
    return { roles: ['participant_tenant_admin'], broker: null, external: null, identityVersion: 2 };
  };
  const pg = fakePg(sql => sql.includes('FROM tenants') ? { rows: [tenantRow] }: null);
  const result = await runFunctionNode('auth.js', {
    msg: exchange('alpha-pci.example.com'),
    libs: kc.libs,
    pg,
    overrides: { ...kc.overrides, pciIdentityAdmit: admit }
  });
  assert.equal(result.msg.statusCode, 200, JSON.stringify(result.msg.payload));
  assert.equal(admissions[0].tenant.tenant_id, tenantId);
  assert.deepEqual(result.msg.payload.session.roles, ['participant_tenant_admin']);
  assert.equal(result.msg.payload.session.tenantId, tenantId);
  assert.equal(result.msg.payload.session.tenantSlug, 'alpha');
  const insert = pg.calls.find(c => c.sql.startsWith('INSERT INTO auth_sessions'));
  assert.equal(insert.args[7], tenantId);
  assert.equal(insert.args[8], 'alpha');
});
test('auth.exchange on a tenant host rejects unknown, inactive and mismatching tenants', async() => {
  const claims = { sub: 'subject-4', tenant_id: 'other-tenant', realm_access: { roles: ['principal'] } };
  const admit = async() => ({ roles: ['principal'], broker: null, external: null });
  const unknown = await runFunctionNode('auth.js', {
    msg: exchange('alpha-pci.example.com'),
    libs: keycloak(claims).libs,
    overrides: { ...keycloak(claims).overrides, pciIdentityAdmit: admit },
    pg: fakePg(() => ({ rows: [] }))
  });
  assert.equal(problem(unknown).code, 'PCI-TENANT-403-001');
  const inactive = await runFunctionNode('auth.js', {
    msg: exchange('alpha-pci.example.com'),
    libs: keycloak(claims).libs,
    overrides: { ...keycloak(claims).overrides, pciIdentityAdmit: admit },
    pg: fakePg(() => ({ rows: [{ ...tenantRow, state: 'deleting' }] }))
  });
  assert.equal(problem(inactive).status, 404);
  const mismatch = await runFunctionNode('auth.js', {
    msg: exchange('alpha-pci.example.com'),
    libs: keycloak(claims).libs,
    overrides: { ...keycloak(claims).overrides, pciIdentityAdmit: admit },
    pg: fakePg(() => ({ rows: [tenantRow] }))
  });
  assert.equal(problem(mismatch).code, 'PCI-TENANT-403-001');
  // A provider administrator may sign in on a tenant host regardless of the tenant claim.
  const provider = await runFunctionNode('auth.js', {
    msg: exchange('alpha-pci.example.com'),
    libs: keycloak(claims).libs,
    overrides: {
      ...keycloak(claims).overrides,
      pciIdentityAdmit: async() => ({ roles: ['provider_admin'], broker: null, external: null })
    },
    pg: fakePg(() => ({ rows: [tenantRow] }))
  });
  assert.equal(provider.msg.statusCode, 200);
});
test('auth.exchange turns an incomplete token response into 401 without leaking it', async() => {
  const kc = keycloak({ sub: 's', realm_access: { roles: ['provider_admin'] } });
  kc.overrides.requestJson = async() => ({ error: 'invalid_grant' });
  const result = await runFunctionNode('auth.js', { msg: exchange('pci.example.com'), libs: kc.libs, overrides: kc.overrides });
  assert.equal(problem(result).code, 'PCI-AUTHN-401-001');
  assert.equal(JSON.stringify(result.msg.payload).includes('invalid_grant'), false);
});
test('auth.session requires a valid session cookie or bearer token and reports entitlements', async() => {
  const token = 'session-token';
  const row = {
    session_id: 'sid-1',
    keycloak_subject: 'subject-1',
    username: 'provider',
    display_name: 'Provider',
    email: null,
    roles: ['provider_admin'],
    tenant_id: null,
    tenant_slug: null,
    expires_at: new Date(Date.now() + 60000).toISOString()
  };
  const pg = fakePg((sql, args) => sql.startsWith('SELECT * FROM auth_sessions') && args[0] === sha256(token) ? { rows: [row] }: null);
  const cookie = await runFunctionNode('auth.js', { msg: httpMessage('auth.session', { headers: { cookie: 'fap_pci_session=' +
    token } }), pg });
  assert.equal(cookie.msg.statusCode, 200);
  assert.deepEqual(cookie.msg.payload.session, {
    entitlements: [],
    sessionId: 'sid-1',
    subject: 'subject-1',
    username: 'provider',
    displayName: 'Provider',
    email: null,
    roles: ['provider_admin'],
    tenantId: null,
    tenantSlug: null,
    expiresAt: row.expires_at
  });
  assert.ok(pg.calls.some(c => c.sql.startsWith('UPDATE auth_sessions SET last_seen_at')));
  const bearer = await runFunctionNode('auth.js', { msg: httpMessage('auth.session', { headers: { authorization: 'Bearer ' +
    token } }), pg });
  assert.equal(bearer.msg.statusCode, 200);
  const missing = await runFunctionNode('auth.js', { msg: httpMessage('auth.session'), pg });
  assert.equal(problem(missing).code, 'PCI-AUTHN-401-001');
  const unknown = await runFunctionNode('auth.js', { msg: httpMessage('auth.session',
    { headers: { cookie: 'fap_pci_session=other' } }), pg });
  assert.equal(problem(unknown).code, 'PCI-AUTHN-401-001');
});
test('auth.logout revokes the session row, forgets the access token and clears the cookie', async() => {
  const token = 'session-token';
  const pg = fakePg((sql, args) => sql.startsWith('UPDATE auth_sessions SET revoked_at') && args[0] === sha256(token) ?
    { rows: [{ session_id: 'sid-1' }] }: null);
  const result = await runFunctionNode('auth.js', { msg: httpMessage('auth.logout', { headers: { cookie: 'fap_pci_session=' +
    token }, body: {} }), pg });
  assert.equal(result.msg.statusCode, 200);
  assert.deepEqual(result.msg.payload, { loggedOut: true });
  assert.equal(result.msg.headers['set-cookie'], 'fap_pci_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  assert.equal(pg.calls.filter(c => c.sql.startsWith('UPDATE auth_sessions SET revoked_at')).length, 1);
  const anonymous = await runFunctionNode('auth.js', { msg: httpMessage('auth.logout', { body: {} }), pg: fakePg(() => ({ rows: [] })) });
  assert.equal(anonymous.msg.statusCode, 200);
  assert.deepEqual(anonymous.msg.payload, { loggedOut: true });
});
test('auth.bridge delegates to the browser bridge grant and unknown actions are 404', async() => {
  let granted = 0;
  const bridge = await runFunctionNode('auth.js', {
    msg: httpMessage('auth.bridge', { body: {} }),
    overrides: { pciCreateBridgeGrant: async() => {
      granted += 1;
      return ['grant'];
    } }
  });
  assert.equal(granted, 1);
  assert.deepEqual(bridge.output, ['grant']);
  const unknown = await runFunctionNode('auth.js', { msg: httpMessage('auth.nothing') });
  assert.equal(problem(unknown).status, 404);
  assert.equal(problem(unknown).detail, 'Unknown authentication action.');
});
test('auth.exchange over the browser bridge reads its input from msg.data', async() => {
  const claims = { sub: 's', preferred_username: 'provider', realm_access: { roles: ['provider_admin'] } };
  const kc = keycloak(claims);
  const msg = {
    _msgid: 'bridge',
    pciAction: 'auth.exchange',
    pciTransport: 'uibuilder',
    pciObservedHost: 'pci.example.com',
    data: { code: 'code', verifier, nonce: 'nonce', redirectUri: 'https://pci.example.com/ui/' }
  };
  const result = await runFunctionNode('auth.js', {
    msg,
    libs: kc.libs,
    overrides: {
      ...kc.overrides,
      pciBridgeRequestHeaders: () => ({}),
      pciBridgeMessage: envelope => ({ payload: envelope }),
      pciBridgeGrants: () => new Map()
    }
  });
  assert.equal(result.msg.statusCode, 200, JSON.stringify(result.msg.payload));
  assert.equal(result.output[0], null);
  assert.equal(result.output[1].payload.ok, true);
  assert.equal(result.output[1].payload.data.session.subject, 's');
});
test('an unexpected failure is reported as a generic 500 problem and logged without its message', async() => {
  const pg = fakePg(() => {
    throw new Error('connection string with password=secret');
  });
  const result = await runFunctionNode('auth.js', { msg: httpMessage('auth.config', { host: 'alpha-pci.example.com' }), pg });
  const body = problem(result);
  assert.equal(body.status, 500);
  assert.equal(body.code, 'PCI-INTERNAL-500-001');
  assert.equal(JSON.stringify(body).includes('password=secret'), false);
  assert.equal(result.logs.error.length, 1);
  assert.equal(result.logs.error[0].includes('password=secret'), false);
  assert.equal(JSON.parse(result.logs.error[0]).operation, 'auth.config');
});
