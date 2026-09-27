// Shared helpers inlined into every FACIS FAP PCI ORCE Function node.
// This file is source material for tools/build-flows.mjs; it is not loaded at runtime.
function envValue(name, fallback = "", required = false) {
  const value = String(env.get(name) ?? fallback).trim();
  if (required && !value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
function envBool(name, fallback = false) {
  const raw = String(env.get(name) ?? fallback).toLowerCase();
  return ["true", "1", "yes", "on"].includes(raw);
}
function envInt(name, fallback) {
  const parsed = Number(env.get(name) ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}
function envList(name, fallback = []) {
  const raw = String(env.get(name) ?? "").trim();
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}
const mainHostValue = envValue("PCI_MAIN_HOST", "pci.example.com").toLowerCase();
const orceBasePathValue = normalizeBasePath(envValue("PCI_ORCE_BASE_PATH", ""));
const cfg = {
  version: "__FAP_PCI_VERSION__",
  baseDomain: envValue("PCI_BASE_DOMAIN", "example.com").toLowerCase(),
  tenantHostSuffix: envValue("PCI_TENANT_HOST_SUFFIX", "pci").toLowerCase(),
  mainHost: mainHostValue,
  registrationMode: envValue("PCI_REGISTRATION_MODE", "public"),
  orceBasePath: orceBasePathValue,
  publicUiPath: uiPath(orceBasePathValue),
  publicApiBasePath: withBasePath("/api/v1", orceBasePathValue),
  verificationTtlMinutes: envInt("PCI_VERIFICATION_TTL_MINUTES", 30),
  verificationPepper: envValue("PCI_VERIFICATION_TOKEN_PEPPER", "", true),
  sessionTtlMinutes: envInt("PCI_SESSION_TTL_MINUTES", 480),
  databaseUrl: envValue("PCI_DATABASE_URL", "", true),
  internalServiceToken: envValue("PCI_INTERNAL_SERVICE_TOKEN", ""),
  databaseMode: envValue("PCI_DATABASE_MODE", "managed").toLowerCase(),
  schemaPath: envValue("PCI_SCHEMA_PATH", "/data/fap-pci/schema.sql"),
  orceNamespace: envValue("PCI_ORCE_NAMESPACE", "xfsc-orce-orce"),
  orceService: envValue("PCI_ORCE_SERVICE", "xfsc-orce-service-orce"),
  orceServicePort: envInt("PCI_ORCE_SERVICE_PORT", 80),
  ocmNamespace: envValue("PCI_OCM_NAMESPACE", "", true),
  ocmServices: {
    credentialIssuance: envValue("PCI_OCM_CREDENTIAL_ISSUANCE_SERVICE", "issuance-service-service"),
    wellKnown: envValue("PCI_OCM_WELL_KNOWN_SERVICE", "well-known-service"),
    preAuth: envValue("PCI_OCM_PREAUTH_SERVICE", "pre-authorization-bridge-service"),
    signer: envValue("PCI_OCM_SIGNER_SERVICE", "signer"),
  },
  infrastructureNamespace: envValue("PCI_INFRASTRUCTURE_NAMESPACE", "infrastructure"),
  gatewayName: envValue("PCI_GATEWAY_NAME", "pci-gateway"),
  gatewayClassName: envValue("PCI_GATEWAY_CLASS_NAME", "eg"),
  gatewayListenerName: envValue("PCI_GATEWAY_LISTENER_NAME", "https"),
  gatewayAddressType: envValue("PCI_GATEWAY_ADDRESS_TYPE", "IPAddress"),
  tlsSecretName: envValue("PCI_TLS_SECRET_NAME", "pci-wildcard-tls"),
  envoy: {
    namespace: envValue("PCI_ENVOY_NAMESPACE", "envoy-gateway-system"),
    controllerName: envValue("PCI_ENVOY_CONTROLLER_NAME", "gateway.envoyproxy.io/gatewayclass-controller"),
    manifestUrl: envValue("PCI_ENVOY_MANIFEST_URL", "https://github.com/envoyproxy/gateway/releases/download/v1.9.1/install.yaml"),
    manifestSha256: envValue("PCI_ENVOY_MANIFEST_SHA256", "72b3971364f172eb0b9636c7142cc84ff695467bc065897958bde85a3c06cfd5"),
    manifestPath: envValue("PCI_ENVOY_MANIFEST_PATH", "/data/fap-pci/vendor/envoy-gateway-v1.9.1-install.yaml"),
    installTimeoutSeconds: envInt("PCI_ENVOY_INSTALL_TIMEOUT_SECONDS", 420),
  },
  managedPostgres: {
    service: envValue("PCI_POSTGRES_SERVICE", "fap-pci-postgres"),
    image: envValue("PCI_POSTGRES_IMAGE", "postgres:17.4-alpine3.21"),
    storageClass: envValue("PCI_POSTGRES_STORAGE_CLASS", ""),
    storageSize: envValue("PCI_POSTGRES_STORAGE_SIZE", "4Gi"),
    database: envValue("PCI_POSTGRES_DATABASE", "fap_pci"),
    username: envValue("PCI_POSTGRES_USERNAME", "fap_pci"),
  },
  mailMode: envValue("PCI_MAIL_MODE", "mailpit").toLowerCase(),
  mailpitImage: envValue("PCI_MAILPIT_IMAGE", "axllent/mailpit:v1.25.1"),
  smtp: {
    host: envValue("PCI_SMTP_HOST", `fap-pci-mailpit.${envValue("PCI_ORCE_NAMESPACE", "xfsc-orce-orce")}.svc.cluster.local`),
    port: envInt("PCI_SMTP_PORT", 1025),
    from: envValue("PCI_SMTP_FROM", "no-reply@pci.example.com"),
    secure: envBool("PCI_SMTP_SECURE", false),
    user: envValue("PCI_SMTP_USERNAME", ""),
    password: envValue("PCI_SMTP_PASSWORD", ""),
  },
  keycloak: {
    internalUrl: envValue("PCI_KEYCLOAK_INTERNAL_URL", "", true).replace(/\/$/, ""),
    publicUrl: envValue("PCI_KEYCLOAK_PUBLIC_URL", "", true).replace(/\/$/, ""),
    realm: envValue("PCI_KEYCLOAK_REALM", "fap-pci"),
    uiClientId: envValue("PCI_KEYCLOAK_UI_CLIENT_ID", "fap-pci-ui"),
    adminUsername: envValue("PCI_KEYCLOAK_ADMIN_USERNAME", "admin"),
    adminPassword: envValue("PCI_KEYCLOAK_ADMIN_PASSWORD", ""),
    bootstrapProviderUsername: envValue("PCI_BOOTSTRAP_PROVIDER_USERNAME", "provider-admin"),
    bootstrapProviderEmail: envValue("PCI_BOOTSTRAP_PROVIDER_EMAIL", ""),
    bootstrapProviderPassword: envValue("PCI_BOOTSTRAP_PROVIDER_PASSWORD", ""),
    requiredActions: envList("PCI_KEYCLOAK_REQUIRED_ACTIONS", ["UPDATE_PASSWORD", "CONFIGURE_TOTP"]),
  },
};

class PciError extends Error {
  constructor(status, code, title, detail, retryable = false) {
    super(detail);
    this.status = status;
    this.code = code;
    this.title = title;
    this.retryable = retryable;
  }
}
const pciErrors = {
  notFound: (detail = "The requested resource does not exist.") => new PciError(404, "PCI-RESOURCE-404-001", "Resource not found", detail),
  conflict: (detail) => new PciError(409, "PCI-STATE-409-001", "State conflict", detail),
  preconditionRequired: () => new PciError(428, "PCI-PRECONDITION-428-001", "Precondition required", "Supply If-Match with the current resource version."),
  preconditionFailed: () => new PciError(412, "PCI-PRECONDITION-412-001", "Precondition failed", "The resource changed after it was loaded."),
  forbidden: (detail = "The caller is not allowed to perform this operation.") => new PciError(403, "PCI-AUTHZ-403-001", "Forbidden", detail),
  unauthorized: () => new PciError(401, "PCI-AUTHN-401-001", "Unauthorized", "Valid Keycloak-backed credentials are required."),
  invalidVerification: () => new PciError(400, "PCI-VERIFY-400-001", "Invalid verification token", "The token is invalid, expired, or already used."),
  validation: (detail = "One or more input fields are invalid.") => new PciError(400, "PCI-VALIDATION-400-001", "Validation failed", detail),
  invalidTenantContext: () => new PciError(403, "PCI-TENANT-403-001", "Tenant context mismatch", "The routed tenant context does not match the requested host."),
  dependency: (detail) => new PciError(503, "PCI-DEPENDENCY-503-001", "Dependency unavailable", detail, true),
};

function correlationId() {
  return String(msg._msgid || (msg.req && msg.req.headers && msg.req.headers["x-request-id"]) || crypto.randomUUID());
}
function problem(error) {
  const e = error instanceof PciError ? error : new PciError(500, "PCI-INTERNAL-500-001", "Internal server error", "The request could not be completed.", true);
  if (!(error instanceof PciError)) node.error("PCI-INTERNAL-500-001: operation failed");
  return {
    type: `urn:xfsc:pci:error:${String(e.code).toLowerCase()}`,
    title: e.title,
    status: e.status,
    code: e.code,
    detail: e.message,
    instance: msg.req ? msg.req.originalUrl || msg.req.url : msg.pciAction || "uibuilder",
    correlation_id: correlationId(),
    retryable: Boolean(e.retryable),
  };
}
function emit(status, payload, headers = {}, topic = "pci:response") {
  msg.statusCode = status;
  msg.headers = { "content-type": status >= 400 ? "application/problem+json; charset=utf-8" : "application/json; charset=utf-8", ...headers };
  msg.payload = payload;
  if (msg.pciTransport === "internal") return [null, null];
  if (msg.pciTransport === "uibuilder") {
    msg.topic = topic;
    msg.payload = { response: { status: status >= 400 ? "error" : "success", statusCode: status, ...payload } };
    return [null, msg];
  }
  return [msg, null];
}
function emitError(error) {
  const payload = problem(error);
  return emit(payload.status, payload, {}, "pci:error");
}
function parseBody() {
  if (msg.payload && typeof msg.payload === "object" && !Buffer.isBuffer(msg.payload)) return msg.payload;
  if (typeof msg.payload === "string" && msg.payload.trim()) {
    try { return JSON.parse(msg.payload); } catch { throw pciErrors.validation("The request body must be valid JSON."); }
  }
  return {};
}
function params() { return (msg.req && msg.req.params) || msg.params || {}; }
function query() { return (msg.req && msg.req.query) || msg.query || {}; }
function trustedUibuilderHeaders() {
  const candidates = [
    msg && msg._uib && msg._uib.handshake && msg._uib.handshake.headers,
    msg && msg._uib && msg._uib.socket && msg._uib.socket.handshake && msg._uib.socket.handshake.headers,
    msg && msg._socket && msg._socket.handshake && msg._socket.handshake.headers,
    msg && msg.socket && msg.socket.handshake && msg.socket.handshake.headers,
    msg && msg._client && msg._client.handshake && msg._client.handshake.headers,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || {};
}
function requestHeaders() {
  // uibuilder messages are browser-controlled except for the server-attached
  // Socket.IO handshake metadata. Never let a browser-supplied msg.req or
  // top-level header object outrank that trusted transport context.
  if (msg.pciTransport === "uibuilder") return trustedUibuilderHeaders();
  if (msg.req && msg.req.headers) return msg.req.headers;
  return msg.pciTrustedHeaders && typeof msg.pciTrustedHeaders === "object" ? msg.pciTrustedHeaders : {};
}
function normalizeHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw.includes(",") || raw.includes("/") || raw.includes("\\") || /\s/.test(raw) || raw.startsWith("[")) return "";
  const withoutPort = raw.replace(/:\d{1,5}$/, "").replace(/\.$/, "");
  if (withoutPort.includes(":")) return "";
  return /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(withoutPort) ? withoutPort : "";
}
function routedHost() {
  const headers = requestHeaders();
  return normalizeHost(msg.pciObservedHost || headers["x-forwarded-host"] || headers.host || "");
}
function sessionCookiePath() { return cfg.orceBasePath || "/"; }
function buildTenantDomain(slug) {
  const value = String(slug || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(value)) throw pciErrors.validation("requestedSlug must contain lowercase letters, digits, and internal hyphens only.");
  return `${value}-${cfg.tenantHostSuffix}.${cfg.baseDomain}`;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function acquireGlobalLock(name, ttlMs = 300000) {
  const key = `fapPciLock:${name}`;
  const now = Date.now();
  const current = global.get(key);
  if (current && Number(current.expiresAt || 0) > now) return null;
  const token = crypto.randomUUID();
  global.set(key, { token, expiresAt: now + ttlMs });
  const stored = global.get(key);
  return stored && stored.token === token ? token : null;
}
function refreshGlobalLock(name, token, ttlMs = 300000) {
  const key = `fapPciLock:${name}`;
  const current = global.get(key);
  if (!current || current.token !== token) return false;
  global.set(key, { token, expiresAt: Date.now() + ttlMs });
  return true;
}
function releaseGlobalLock(name, token) {
  const key = `fapPciLock:${name}`;
  const current = global.get(key);
  if (current && current.token === token) global.set(key, undefined);
}
function getPool() {
  let holder = global.get("fapPciPgPoolHolder");
  if (!holder || holder.url !== cfg.databaseUrl || !holder.pool) {
    if (holder && holder.pool) holder.pool.end().catch(() => {});
    holder = { url: cfg.databaseUrl, pool: new pg.Pool({ connectionString: cfg.databaseUrl, max: 8, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }) };
    global.set("fapPciPgPoolHolder", holder);
  }
  return holder.pool;
}
function mapRegistration(row) {
  return {
    registrationId: row.registration_id,
    organizationIdentifier: row.organization_identifier,
    organizationName: row.organization_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    requestedSlug: row.requested_slug,
    requestedDomain: row.requested_domain,
    registrationMode: row.registration_mode,
    state: row.state,
    emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : null,
    emailDeliveryStatus: row.email_delivery_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    decisionReason: row.decision_reason,
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
function mapTenant(row) {
  return {
    tenantId: row.tenant_id,
    registrationId: row.registration_id,
    tenantSlug: row.tenant_slug,
    ownerUid: row.owner_uid,
    organizationIdentifier: row.organization_identifier,
    organizationName: row.organization_name,
    primaryDomain: row.primary_domain,
    state: row.state,
    desiredGeneration: Number(row.desired_generation),
    observedGeneration: Number(row.observed_generation),
    conditions: Array.isArray(row.conditions) ? row.conditions : (row.conditions || []),
    identityState: row.identity_state,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
function parseIfMatch() {
  const value = requestHeaders()["if-match"];
  if (!value || Array.isArray(value)) throw pciErrors.preconditionRequired();
  const normalized = String(value).trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  const version = Number(normalized);
  if (!Number.isInteger(version) || version < 1) throw pciErrors.preconditionRequired();
  return version;
}
function cookieValue(name) {
  const cookie = String(requestHeaders().cookie || "");
  for (const pair of cookie.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === name) return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return "";
}
function bearerToken() {
  const header = String(requestHeaders().authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : "";
}
async function requireSession(requiredRoles = [], tenantId = null) {
  const token = cookieValue("fap_pci_session") || bearerToken();
  if (!token) throw pciErrors.unauthorized();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await getPool().query(
    `SELECT * FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) throw pciErrors.unauthorized();
  const roles = Array.isArray(row.roles) ? row.roles : [];
  if (requiredRoles.length && !requiredRoles.some((role) => roles.includes(role))) throw pciErrors.forbidden();
  if (tenantId && !roles.includes("provider_admin") && String(row.tenant_id || "") !== String(tenantId)) throw pciErrors.forbidden("The session is not assigned to this tenant.");
  await getPool().query("UPDATE auth_sessions SET last_seen_at=now() WHERE session_id=$1", [row.session_id]);
  return {
    sessionId: row.session_id,
    subject: row.keycloak_subject,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    roles,
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}
function requestRaw(urlValue, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlValue);
    const client = target.protocol === "https:" ? https : http;
    const body = options.body === undefined || options.body === null ? null : (Buffer.isBuffer(options.body) ? options.body : Buffer.from(String(options.body)));
    const request = client.request(target, {
      method: options.method || "GET",
      headers: { ...(options.headers || {}), ...(body ? { "content-length": body.length } : {}) },
      timeout: options.timeout || 15000,
      rejectUnauthorized: options.rejectUnauthorized !== false,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode || 0, headers: response.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("timeout", () => request.destroy(new Error(`Request timeout for ${target.origin}`)));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}
async function requestJson(urlValue, options = {}) {
  const response = await requestRaw(urlValue, options);
  let data = null;
  if (response.text) {
    try { data = JSON.parse(response.text); } catch { data = response.text; }
  }
  if (response.status < 200 || response.status >= 300) {
    const detail = data && data.error_description ? data.error_description : data && data.errorMessage ? data.errorMessage : `Upstream request failed with ${response.status}`;
    const error = new Error(detail);
    error.upstreamStatus = response.status;
    error.upstreamBody = data;
    throw error;
  }
  return data;
}
function getMailer() {
  let holder = global.get("fapPciMailerHolder");
  const key = JSON.stringify(cfg.smtp);
  if (!holder || holder.key !== key) {
    const auth = cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.password } : undefined;
    holder = { key, transport: nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure, auth }) };
    global.set("fapPciMailerHolder", holder);
  }
  return holder.transport;
}
async function sendMail(mail) {
  return getMailer().sendMail({ from: cfg.smtp.from, ...mail });
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}
async function keycloakAdminToken() {
  if (!cfg.keycloak.adminPassword) throw new Error("PCI_KEYCLOAK_ADMIN_PASSWORD is not configured");
  const body = new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: cfg.keycloak.adminUsername, password: cfg.keycloak.adminPassword });
  const data = await requestJson(`${cfg.keycloak.internalUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return data.access_token;
}
async function keycloakAdminRaw(method, path, body = undefined) {
  const token = await keycloakAdminToken();
  return requestRaw(`${cfg.keycloak.internalUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function keycloakAdmin(method, path, body = undefined) {
  const response = await keycloakAdminRaw(method, path, body);
  let data = null;
  if (response.text) {
    try { data = JSON.parse(response.text); } catch { data = response.text; }
  }
  if (response.status < 200 || response.status >= 300) {
    const detail = data && data.errorMessage ? data.errorMessage : `Keycloak admin request failed with ${response.status}`;
    const error = new Error(detail);
    error.upstreamStatus = response.status;
    error.upstreamBody = data;
    throw error;
  }
  return data;
}
function roleClaim(payload) {
  const roles = payload && payload.realm_access && Array.isArray(payload.realm_access.roles) ? payload.realm_access.roles : [];
  return roles.filter((role) => ["provider_admin", "participant_tenant_admin", "issuer_admin", "principal"].includes(role));
}
async function keycloakRoleRepresentation(roleName) {
  const encodedRealm = encodeURIComponent(cfg.keycloak.realm);
  const encodedRole = encodeURIComponent(roleName);
  const response = await keycloakAdminRaw("GET", `/admin/realms/${encodedRealm}/roles/${encodedRole}`);
  if (response.status === 404) {
    await keycloakAdmin("POST", `/admin/realms/${encodedRealm}/roles`, { name: roleName, description: `FACIS FAP PCI ${roleName}` });
    return keycloakAdmin("GET", `/admin/realms/${encodedRealm}/roles/${encodedRole}`);
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`Unable to read Keycloak role ${roleName}: ${response.status}`);
  return JSON.parse(response.text || "{}");
}
async function findKeycloakUserByUsername(username) {
  const encodedRealm = encodeURIComponent(cfg.keycloak.realm);
  const path = `/admin/realms/${encodedRealm}/users?username=${encodeURIComponent(username)}&exact=true&max=2`;
  const users = await keycloakAdmin("GET", path);
  return Array.isArray(users) ? users.find((user) => String(user.username).toLowerCase() === String(username).toLowerCase()) || null : null;
}
function keycloakAttributeValue(user, name) {
  const value = user && user.attributes ? user.attributes[name] : null;
  return Array.isArray(value) ? value[0] : value;
}
async function ensureTenantKeycloakUser(options) {
  const encodedRealm = encodeURIComponent(cfg.keycloak.realm);
  const username = String(options.username || options.email || "").trim().toLowerCase();
  if (!username) throw pciErrors.validation("A username or email is required for the Keycloak account.");
  let user = await findKeycloakUserByUsername(username);
  const isNew = !user;
  const attributes = {
    tenant_id: [String(options.tenantId)],
    tenant_slug: [String(options.tenantSlug)],
  };
  const requiredActions = Array.from(new Set([
    ...(options.requiredActions || cfg.keycloak.requiredActions),
    ...(options.emailVerified === false ? ["VERIFY_EMAIL"] : []),
  ]));
  if (isNew) {
    const representation = {
      username,
      email: options.email || undefined,
      firstName: options.firstName || undefined,
      lastName: options.lastName || undefined,
      enabled: true,
      emailVerified: Boolean(options.emailVerified),
      requiredActions,
      attributes,
    };
    const response = await keycloakAdminRaw("POST", `/admin/realms/${encodedRealm}/users`, representation);
    if (response.status !== 201 && response.status !== 204) throw new Error(`Keycloak user creation failed with ${response.status}: ${response.text}`);
    user = await findKeycloakUserByUsername(username);
  } else {
    const existingTenant = keycloakAttributeValue(user, "tenant_id");
    if (existingTenant && String(existingTenant) !== String(options.tenantId)) throw pciErrors.conflict("The Keycloak account is already assigned to a different PCI tenant.");
    const representation = {
      ...user,
      username,
      email: options.email || user.email || undefined,
      firstName: options.firstName || user.firstName || undefined,
      lastName: options.lastName || user.lastName || undefined,
      enabled: true,
      emailVerified: options.emailVerified === true ? true : Boolean(user.emailVerified),
      requiredActions: Array.isArray(user.requiredActions) ? user.requiredActions : [],
      attributes: { ...(user.attributes || {}), ...attributes },
    };
    await keycloakAdmin("PUT", `/admin/realms/${encodedRealm}/users/${encodeURIComponent(user.id)}`, representation);
    user = await findKeycloakUserByUsername(username);
  }
  if (!user || !user.id) throw new Error("Keycloak did not return the provisioned user.");

  const pciRoleNames = ["provider_admin", "participant_tenant_admin", "issuer_admin", "principal"];
  const desiredRoleNames = Array.from(new Set(["principal", ...(options.roles || [])]));
  const currentRoles = await keycloakAdmin("GET", `/admin/realms/${encodedRealm}/users/${encodeURIComponent(user.id)}/role-mappings/realm`);
  const obsoleteRoles = Array.isArray(currentRoles)
    ? currentRoles.filter((role) => pciRoleNames.includes(role.name) && !desiredRoleNames.includes(role.name))
    : [];
  if (obsoleteRoles.length) {
    await keycloakAdmin("DELETE", `/admin/realms/${encodedRealm}/users/${encodeURIComponent(user.id)}/role-mappings/realm`, obsoleteRoles);
  }
  const existingNames = new Set(Array.isArray(currentRoles) ? currentRoles.map((role) => role.name) : []);
  const missingRoles = [];
  for (const roleName of desiredRoleNames) {
    if (!existingNames.has(roleName)) missingRoles.push(await keycloakRoleRepresentation(roleName));
  }
  if (missingRoles.length) {
    await keycloakAdmin("POST", `/admin/realms/${encodedRealm}/users/${encodeURIComponent(user.id)}/role-mappings/realm`, missingRoles);
  }
  if (isNew && options.sendActionsEmail !== false && options.email) {
    const queryValues = new URLSearchParams({ client_id: cfg.keycloak.uiClientId, redirect_uri: uiUrl(options.tenantDomain, cfg.orceBasePath), lifespan: "43200" });
    const response = await keycloakAdminRaw(
      "PUT",
      `/admin/realms/${encodedRealm}/users/${encodeURIComponent(user.id)}/execute-actions-email?${queryValues.toString()}`,
      requiredActions,
    );
    if (![200, 204].includes(response.status)) node.warn(`Keycloak execute-actions-email returned ${response.status} for ${username}`);
  }
  return { id: user.id, username, email: options.email || user.email || null, roles: desiredRoleNames, enabled: true };
}
