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
// The authentication Function node. Each action is one function; the shared
// helpers of _common.js (routedHost, requireSession, emit, ...) are inlined by
// the build. The checks keep their order from the original single closure.
function pciAuthIssuer() {
  return `${cfg.keycloak.publicUrl}/realms/${encodeURIComponent(cfg.keycloak.realm)}`;
}
async function pciAuthConfig(pool) {
  const host = routedHost();
  if (!host) throw pciErrors.invalidTenantContext();
  let identity = null;
  if (host !== cfg.mainHost) {
    const tenant = await pool.query("SELECT tenant_id,state FROM tenants WHERE primary_domain=$1", [host]);
    if (!tenant.rows[0] || !["provisioning", "active"].includes(tenant.rows[0].state)) throw pciErrors.notFound(
      "No active tenant is assigned to this host.");
  }
  identity = host === cfg.mainHost ? null: await pciIdentityRead((await pool.query('SELECT tenant_id FROM tenants WHERE primary_domain=$1',
    [host])).rows[0].tenant_id);
  const issuer = pciAuthIssuer();
  return emit(200, {
    enabled: true,
    identityProvider: identity?.state === 'active' && identity.mode === 'oidc' ? identity.alias: null,
    issuer,
    clientId: cfg.keycloak.uiClientId,
    redirectUri: uiUrl(host, cfg.orceBasePath),
    orceBasePath: cfg.orceBasePath,
    uiPath: cfg.publicUiPath,
    scope: "openid profile email",
    authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
    endSessionEndpoint: `${issuer}/protocol/openid-connect/logout`,
  });
}
// The callback parameters come from the browser; the host comes from the
// gateway. The redirect URI is recomputed from the routed host and compared.
function pciAuthCallback(input) {
  const code = String(input.code || "");
  const verifier = String(input.verifier || "");
  const nonce = String(input.nonce || "");
  const redirectUri = String(input.redirectUri || "");
  const host = routedHost();
  if (!code || verifier.length < 43 || !nonce || !host) throw pciErrors.validation("The OIDC callback is incomplete.");
  const expectedRedirect = uiUrl(host, cfg.orceBasePath);
  if (redirectUri !== expectedRedirect) throw pciErrors.validation("The OIDC redirect URI does not match the routed host.");
  return { code, verifier, nonce, redirectUri, host };
}
async function pciAuthTokenSet(callback) {
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.keycloak.uiClientId,
    code: callback.code,
    redirect_uri: callback.redirectUri,
    code_verifier: callback.verifier,
  });
  const tokenSet = await requestJson(
    `${cfg.keycloak.internalUrl}/realms/${encodeURIComponent(cfg.keycloak.realm)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });
  if (!tokenSet.id_token || !tokenSet.access_token) throw pciErrors.unauthorized();
  return tokenSet;
}
async function pciAuthVerifiedClaims(tokenSet, nonce) {
  const decoded = jwt.decode(tokenSet.id_token, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) throw pciErrors.unauthorized();
  const issuer = `${cfg.keycloak.publicUrl}/realms/${cfg.keycloak.realm}`;
  const jwksClient = jwksRsa({
    jwksUri: `${cfg.keycloak.internalUrl}/realms/${encodeURIComponent(cfg.keycloak.realm)}/protocol/openid-connect/certs`,
    cache: true,
    cacheMaxAge: 600000
  });
  const signingKey = await jwksClient.getSigningKey(decoded.header.kid);
  return jwt.verify(tokenSet.id_token, signingKey.getPublicKey(), {
    algorithms: ["RS256", "PS256", "ES256"],
    issuer,
    audience: cfg.keycloak.uiClientId,
    nonce,
    clockTolerance: 10,
  });
}
// On a tenant host the tenant identity policy decides roles and admission; on
// the provider host only provider administrators with a direct realm account.
async function pciAuthAdmission(pool, host, claims, tokenSet) {
  let roles = roleClaim(claims),
  admission = {};
  const tenantIdClaim = Array.isArray(claims.tenant_id) ? claims.tenant_id[0]: claims.tenant_id;
  const tenantSlugClaim = Array.isArray(claims.tenant_slug) ? claims.tenant_slug[0]: claims.tenant_slug;
  let routedTenant = null;
  if (host !== cfg.mainHost) {
    const result = await pool.query("SELECT * FROM tenants WHERE primary_domain=$1", [host]);
    if (!result.rows[0]) throw pciErrors.invalidTenantContext();
    routedTenant = result.rows[0];
    if (!['provisioning', 'active'].includes(routedTenant.state)) throw pciErrors.notFound();
    admission = await pciIdentityAdmit(routedTenant, claims, tokenSet);
    roles = admission.roles;
    if (!admission.broker && !roles.includes("provider_admin") && String(tenantIdClaim || "") !== String(routedTenant
      .tenant_id)) throw pciErrors.invalidTenantContext();
  }
  if (host === cfg.mainHost && (claims.pci_identity_provider || !roles.includes("provider_admin"))) throw pciErrors.forbidden(
    "Only provider administrators can sign in on the PCI provider host.");
  if (!roles.length) throw pciErrors.forbidden("No FAP PCI role is assigned to this Keycloak account.");
  return {
    roles,
    admission,
    tenantId: routedTenant ? routedTenant.tenant_id: (tenantIdClaim || null),
    tenantSlug: routedTenant ? routedTenant.tenant_slug: (tenantSlugClaim || null)
  };
}
function pciAuthEntitlements(claims, admission) {
  return admission.external?.entitlements || [
    ...(claims.realm_access?.roles || []).map(v => 'role:' + v),
    ...(Array.isArray(claims.groups) ? claims.groups: []).map(v => 'group:' + v)
  ].filter(v => v.length <= 200).slice(0, 100);
}
// The session row stores the hash of the cookie token; the access token stays
// in process memory, bounded in count and by the shorter of the two expiries.
async function pciAuthCreateSession(pool, host, claims, tokenSet, admitted) {
  const { roles, admission, tenantId, tenantSlug } = admitted;
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + cfg.sessionTtlMinutes * 60000);
  const displayName = String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
  claims.preferred_username || "");
  const sessionId = crypto.randomUUID();
  await pool.query(`INSERT INTO auth_sessions(session_id,token_hash,keycloak_subject,username,display_name,email,roles,tenant_id,tenant_slug,issued_at,expires_at,last_seen_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$10)`, [
    sessionId,
    tokenHash,
    claims.sub,
    claims.preferred_username || claims.email || claims.sub,
    displayName,
    claims.email || null,
    JSON.stringify(roles),
    tenantId,
    tenantSlug,
    issuedAt.toISOString(),
    expiresAt.toISOString()
  ],);
  await pool.query(`INSERT INTO audit_events(event_type,actor,tenant_id,safe_metadata) VALUES('auth.login',$1,$2,$3::jsonb)`,
    [`keycloak:${claims.sub}`, tenantId, JSON.stringify({ host, roles })],);
  const access = jwt.decode(tokenSet.access_token);
  const tokens = pciSessionTokens();
  if (tokens.size >= 2000) tokens.delete(tokens.keys().next().value);
  tokens.set(sessionId, {
    token: tokenSet.access_token,
    subject: claims.sub,
    identityVersion: admission.identityVersion,
    broker: admission.broker,
    external: admission.external,
    entitlements: pciAuthEntitlements(claims, admission),
    expiresAt: Math.min(expiresAt.getTime(), Number(access?.exp || 0) * 1000)
  });
  const cookie = `fap_pci_session=${encodeURIComponent(sessionToken)}; Path=${sessionCookiePath()}; HttpOnly; Secure; SameSite=Lax; Max-Age=${cfg.sessionTtlMinutes * 60}`;
  return emit(200, {
    session: {
      sessionId,
      subject: claims.sub,
      username: claims.preferred_username || claims.email,
      displayName,
      email: claims.email || null,
      roles,
      tenantId,
      tenantSlug,
      expiresAt: expiresAt.toISOString()
    },
  }, { "set-cookie": cookie }, "pci:auth-session");
}
async function pciAuthExchange(pool, input) {
  const callback = pciAuthCallback(input);
  const tokenSet = await pciAuthTokenSet(callback);
  const claims = await pciAuthVerifiedClaims(tokenSet, callback.nonce);
  const admitted = await pciAuthAdmission(pool, callback.host, claims, tokenSet);
  return pciAuthCreateSession(pool, callback.host, claims, tokenSet, admitted);
}
async function pciAuthLogout(pool) {
  const token = cookieValue("fap_pci_session") || bearerToken();
  if (token) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const revoked = await pool.query("UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 RETURNING session_id", [tokenHash]);
    for (const r of revoked.rows) pciSessionTokens().delete(r.session_id);
  }
  return emit(200, { loggedOut: true }, {
    "set-cookie": `fap_pci_session=; Path=${sessionCookiePath()}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  }, "pci:auth-logout");
}
return (async() => {
  const action = String(msg.pciAction || msg.type || "");
  const input = msg.pciTransport === "uibuilder" ? (msg.data || (msg.payload && msg.payload.data) || {}): parseBody();
  const pool = getPool();
  if (action === "auth.bridge") return pciCreateBridgeGrant();
  if (action === "auth.config") return pciAuthConfig(pool);
  if (action === "auth.exchange") return pciAuthExchange(pool, input);
  if (action === "auth.session") return emit(200, { session: await requireSession([]) });
  if (action === "auth.logout") return pciAuthLogout(pool);
  throw pciErrors.notFound("Unknown authentication action.");
})().catch(emitError);
