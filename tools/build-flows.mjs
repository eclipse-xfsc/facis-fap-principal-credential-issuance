import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".build");
await mkdir(outDir, { recursive: true });
const releaseVersion = (await readFile(path.join(root, "VERSION"), "utf8")).trim();

const sharedUrlSource = await readFile(path.join(root, "shared", "public-url.js"), "utf8");
const sharedUrl = sharedUrlSource.replace(/^export\s+(?=(?:async\s+)?function|const|let|var|class)/gm, "");
const common = (await readFile(path.join(root, "backend", "functions", "_common.js"), "utf8")).replaceAll("__FAP_PCI_VERSION__", releaseVersion);
const sr2Files = ['domain.js','assets.js','participant-security.js','store.js','adapters.js','service.js','issuance.js','maintenance.js','http.js'];
const sr2Source = (await Promise.all(sr2Files.map(file => readFile(path.join(root,'backend','sr2',file),'utf8')))).map(source => source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')).join('\n');
const sr2Specs = JSON.parse(await readFile(path.join(root,'backend','sr2','routes.json'),'utf8'));
const k8s = await readFile(path.join(root, "backend", "functions", "_k8s.js"), "utf8");

function id(name) {
  return createHash("sha256").update(`fap-pci:${name}`).digest("hex").slice(0, 16);
}
function tab(key, label, info) {
  return { id: id(`tab:${key}`), type: "tab", label, disabled: false, info, env: [] };
}
function comment(z, key, name, info, x = 260, y = 60) {
  return { id: id(`comment:${key}`), type: "comment", z, name, info, x, y, wires: [] };
}
const libs = [
  { var: "crypto", module: "crypto" },
  { var: "zlib", module: "zlib" },
  { var: "tls", module: "tls" },
  { var: "net", module: "net" },
  { var: "dns", module: "dns" },
  { var: "fs", module: "fs" },
  { var: "http", module: "http" },
  { var: "https", module: "https" },
  { var: "url", module: "url" },
  { var: "jwt", module: "jsonwebtoken" },
  { var: "jwksRsa", module: "jwks-rsa" },
  { var: "nodemailer", module: "nodemailer" },
  { var: "pg", module: "pg" },
  { var: "yaml", module: "yaml" },
];
function functionNode(z, key, name, source, x, y, includeK8s = false) {
  return {
    id: id(`function:${key}`), type: "function", z, name,
    func: `const { URL, URLSearchParams } = url;\n${sharedUrl}\n${common}\n${includeK8s ? `${k8s}\n` : ""}${source}`,
    outputs: 2, timeout: "0", noerr: 0, initialize: "", finalize: "", libs,
    x, y, wires: [[], []],
  };
}
function httpIn(z, key, name, method, url, x, y) {
  return { id: id(`http-in:${key}`), type: "http in", z, name, url, method, upload: false, swaggerDoc: "", x, y, wires: [[]] };
}
function actionChange(z, key, action, transport, x, y, internal = false) {
  const rules = [
    { t: "set", p: "pciAction", pt: "msg", to: action, tot: "str" },
    { t: "set", p: "pciTransport", pt: "msg", to: transport, tot: "str" },
  ];
  if (internal) rules.push({ t: "set", p: "pciInternal", pt: "msg", to: "true", tot: "bool" });
  return { id: id(`change:${key}`), type: "change", z, name: action, rules, action: "", property: "", from: "", to: "", reg: false, x, y, wires: [[]] };
}
function httpResponse(z, key, x, y) {
  return { id: id(`http-response:${key}`), type: "http response", z, name: "HTTP response", statusCode: "", headers: {}, x, y, wires: [] };
}
function linkIn(z, key, name, x, y, links = []) {
  return { id: id(`link-in:${key}`), type: "link in", z, name, links, x, y, wires: [[]] };
}
function linkOut(z, key, name, x, y, links = []) {
  return { id: id(`link-out:${key}`), type: "link out", z, name, mode: "link", links, x, y, wires: [] };
}
function inject(z, key, name, onceDelay, repeat, x, y) {
  return { id: id(`inject:${key}`), type: "inject", z, name, props: [{ p: "payload" }, { p: "topic", vt: "str" }], repeat: String(repeat || ""), crontab: "", once: true, onceDelay: String(onceDelay), topic: "", payload: "", payloadType: "date", x, y, wires: [[]] };
}
function wire(nodesById, from, output, ...targets) {
  nodesById[from].wires[output] = targets;
}
function indexNodes(nodes) { return Object.fromEntries(nodes.map((node) => [node.id, node])); }

const moduleSpecs = [
  ...sr2Specs,
  {
    key: "infrastructure", label: "M1_PCI-Infrastructure", route: "platform", file: "M1_PCI-Infrastructure_flow.json",
    functionFile: "infrastructure.js", includeK8s: true,
    info: "Status-only view of the platform prepared by ground-zero. M1 performs no cluster, database, mail, Keycloak, Gateway, or OCM mutations.",
    requirements: ["FR-PCI-25", "FR-PCI-26", "FR-PCI-49", "FR-PCI-50", "FR-PCI-58", "FR-PCI-65", "FR-PCI-67"],
    routes: [
      ["platform-status", "GET platform status", "get", "/api/v1/platform/status", "platform.status"],
      ["platform-initialize", "POST initialize platform", "post", "/api/v1/platform/initialize", "platform.initialize"],
    ],
    injects: [],
  },
  {
    key: "registration", label: "M2_PCI-TenantRegistration", route: "registration", file: "M2_PCI-TenantRegistration_flow.json",
    functionFile: "registration.js", includeK8s: false,
    info: "Public/private tenant registration, single-use email verification, resend, state transitions, audit and SMTP delivery.",
    requirements: ["FR-PCI-25", "FR-PCI-26", "FR-PCI-28", "FR-PCI-31", "FR-PCI-32", "FR-PCI-65", "FR-PCI-67", "FR-PCI-68"],
    routes: [
      ["registration-config", "GET registration config", "get", "/api/v1/tenant-registration-config", "registration.config"],
      ["registration-create", "POST tenant registration", "post", "/api/v1/tenant-registrations", "registration.create"],
      ["registration-verify", "POST verify registration", "post", "/api/v1/tenant-registrations/:registrationId/verify-email", "registration.verify"],
      ["registration-resend", "POST resend verification", "post", "/api/v1/tenant-registrations/:registrationId/resend-verification", "registration.resend"],
    ],
  },
  {
    key: "provider", label: "M3_PCI-ProviderAdministration", route: "provider", file: "M3_PCI-ProviderAdministration_flow.json",
    functionFile: "provider.js", includeK8s: false,
    info: "Keycloak-protected provider review, optimistic approval/rejection, desired tenant creation, tenant listing and reconciliation status.",
    requirements: ["FR-PCI-25", "FR-PCI-26", "FR-PCI-28", "FR-PCI-29", "FR-PCI-65", "FR-PCI-67", "FR-PCI-68"],
    routes: [
      ["provider-registration-list", "GET registrations", "get", "/api/v1/provider/tenant-registrations", "provider.registrations.list"],
      ["provider-registration-get", "GET registration", "get", "/api/v1/provider/tenant-registrations/:registrationId", "provider.registrations.get"],
      ["provider-registration-approve", "POST approve", "post", "/api/v1/provider/tenant-registrations/:registrationId/approve", "provider.registrations.approve"],
      ["provider-registration-reject", "POST reject", "post", "/api/v1/provider/tenant-registrations/:registrationId/reject", "provider.registrations.reject"],
      ["provider-tenants", "GET tenants", "get", "/api/v1/provider/tenants", "provider.tenants.list"],
      ["provider-tenant-reconciliation", "GET tenant reconciliation", "get", "/api/v1/provider/tenants/:tenantId/reconciliation", "provider.tenant.reconciliation"],
    ],
  },
  {
    key: "reconcile", label: "M4_PCI-TenantReconciliation", route: "reconcile", file: "M4_PCI-TenantReconciliation_flow.json",
    functionFile: "reconcile.js", includeK8s: true,
    info: "ORCE in-cluster ServiceAccount desired-state reconciliation for Keycloak tenant identity, ConfigMaps, exact tenant subdomain HTTPRoutes, DNS readiness, and compatibility provisioner endpoints.",
    requirements: ["FR-PCI-03", "FR-PCI-26", "FR-PCI-50", "FR-PCI-67", "FR-PCI-69", "FR-PCI-70"],
    routes: [
      ["internal-provisioning-list", "GET desired tenants", "get", "/api/v1/internal/provisioning/tenants", "internal.provisioning.list"],
      ["internal-provisioning-status", "PUT tenant status", "put", "/api/v1/internal/provisioning/tenants/:tenantId/status", "internal.provisioning.status"],
      ["provider-reconcile-tenant", "POST reconcile tenant", "post", "/api/v1/provider/tenants/:tenantId/reconcile", "tenant.reconcile.one"],
    ],
    injects: [["tenant-periodic", "Reconcile all tenants", 25, 20, "tenant.reconcile.all"]],
  },
  {
    key: "auth", label: "M5_PCI-Auth", route: "auth", file: "M5_PCI-Auth_flow.json",
    functionFile: "auth.js", includeK8s: false,
    info: "Keycloak Authorization Code + PKCE, ID-token verification, tenant-host binding, role enforcement and server-side ORCE sessions.",
    requirements: ["FR-PCI-30", "FR-PCI-33", "FR-PCI-39", "FR-PCI-40", "FR-PCI-69", "FR-PCI-72"],
    routes: [
      ["auth-config", "GET OIDC config", "get", "/api/v1/auth/config", "auth.config"],
      ["auth-exchange", "POST OIDC exchange", "post", "/api/v1/auth/oidc/exchange", "auth.exchange"],
      ["auth-session", "GET session", "get", "/api/v1/auth/session", "auth.session"],
      ["auth-logout", "POST logout", "post", "/api/v1/auth/logout", "auth.logout"],
    ],
  },
  {
    key: "email", label: "M6_PCI-Email", route: "email", file: "M6_PCI-Email_flow.json",
    functionFile: "email.js", includeK8s: false,
    info: "SMTP/Mailpit verification, test delivery and bounded email outbox retry.",
    requirements: ["FR-PCI-28", "FR-PCI-32", "FR-PCI-58", "FR-PCI-65", "FR-PCI-68"],
    routes: [["email-test", "POST email test", "post", "/api/v1/provider/email/test", "email.test"]],
    injects: [["email-retry", "Retry email outbox", 45, 300, "email.retry"]],
  },
  {
    key: "tenant", label: "M7_PCI-TenantAccess", route: "tenant", file: "M7_PCI-TenantAccess_flow.json",
    functionFile: "tenant.js", includeK8s: false,
    info: "Trusted tenant-host resolution, participant/principal Keycloak sessions, participant administrator member invitations and tenant profile access.",
    requirements: ["FR-PCI-29", "FR-PCI-30", "FR-PCI-33", "FR-PCI-39", "FR-PCI-69", "FR-PCI-70", "FR-PCI-72"],
    routes: [
      ["tenant-runtime", "GET tenant context", "get", "/api/v1/runtime/tenant-context", "tenant.runtime"],
      ["tenant-profile", "GET tenant profile", "get", "/api/v1/tenant/profile", "tenant.profile"],
      ["tenant-members-list", "GET tenant members", "get", "/api/v1/tenants/:tenantId/members", "tenant.members.list"],
      ["tenant-members-invite", "POST tenant member", "post", "/api/v1/tenants/:tenantId/members", "tenant.members.invite"],
    ],
  },
];

async function buildModule(spec) {
  const z = id(`tab:${spec.key}`);
  const moduleSource = (spec.sr2 ? sr2Source + "\n" : "") + await readFile(path.join(root, "backend", "functions", spec.functionFile), "utf8");
  const nodes = [tab(spec.key, spec.label, spec.info), comment(z, spec.key, `══ ${spec.label} ══`, spec.info)];
  const inNode = linkIn(z, `${spec.key}:uib-in`, `${spec.route}-in`, 120, 130, [id(`link-out:base:${spec.route}`)]);
  const fnNode = functionNode(z, spec.key, spec.label, moduleSource, 920, 300, spec.includeK8s);
  const outNode = linkOut(z, `${spec.key}:uib-out`, "→ uibuilder response", 1380, 500, [id("link-in:base:response")]);
  const response = httpResponse(z, spec.key, 1390, 240);
  nodes.push(inNode, fnNode, outNode, response);
  inNode.wires[0] = [fnNode.id];
  fnNode.wires[0] = [response.id];
  fnNode.wires[1] = [outNode.id];

  let y = 180;
  for (const [key, name, method, url, action] of spec.routes || []) {
    const incoming = httpIn(z, `${spec.key}:${key}`, name, method, url, 150, y);
    const change = actionChange(z, `${spec.key}:${key}`, action, "http", 480, y);
    incoming.wires[0] = [change.id];
    change.wires[0] = [fnNode.id];
    nodes.push(incoming, change);
    y += 60;
  }
  let injectY = Math.max(y + 30, 560);
  for (const [key, name, onceDelay, repeat, action] of spec.injects || []) {
    const source = inject(z, `${spec.key}:${key}`, name, onceDelay, repeat, 160, injectY);
    const change = actionChange(z, `${spec.key}:${key}:internal`, action, "internal", 500, injectY, true);
    source.wires[0] = [change.id];
    change.wires[0] = [fnNode.id];
    nodes.push(source, change);
    injectY += 60;
  }
  return nodes;
}

async function buildBase() {
  const z = id("tab:base");
  const openapiDocument = JSON.parse(await readFile(path.join(root, "docs", "api", "openapi.json"), "utf8"));
  const statusSource = `const PCI_OPENAPI_DOCUMENT = ${JSON.stringify(openapiDocument)};\n${await readFile(path.join(root, "backend", "functions", "status.js"), "utf8")}`;
  const nodes = [tab("base", "PCI_Interface", "Shared uibuilder interface plus public health, readiness, metrics and OpenAPI routes."), comment(z, "base", "══ FAP PCI uibuilder interface ══", "The uibuilder node remains Node-RED-relative at ui. Externally it is served at {PCI_ORCE_BASE_PATH}/ui/. HTTP In routes likewise remain relative to Node-RED httpNodeRoot; public URL generation uses PCI_ORCE_BASE_PATH without changing the route contract.")];
  const ui = {
    id: id("uibuilder:ui"), type: "uibuilder", z, name: "FAP PCI uibuilder", topic: "", url: "ui", okToGo: true,
    fwdInMessages: false, allowScripts: false, allowStyles: false, copyIndex: true, templateFolder: "blank", extTemplate: "", showfolder: false,
    reload: false, sourceFolder: "src", deployedVersion: "7.5.0", showMsgUib: false, title: "FACIS FAP PCI", descr: "ORCE/uibuilder tenant management", editurl: "", x: 190, y: 180, wires: [[], []],
  };
  const normalize = {
    id: id("function:base:normalize"), type: "function", z, name: "Normalize uibuilder request",
    func: `msg.pciTransport = "uibuilder";
const body = msg.payload && typeof msg.payload === "object" && !Buffer.isBuffer(msg.payload) ? msg.payload : {};
const handshakeCandidates = [
  msg && msg._uib && msg._uib.handshake && msg._uib.handshake.headers,
  msg && msg._uib && msg._uib.socket && msg._uib.socket.handshake && msg._uib.socket.handshake.headers,
  msg && msg._socket && msg._socket.handshake && msg._socket.handshake.headers,
  msg && msg.socket && msg.socket.handshake && msg.socket.handshake.headers,
  msg && msg._client && msg._client.handshake && msg._client.handshake.headers,
];
const trustedHeaders = handshakeCandidates.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || {};
const observedHost = trustedHeaders["x-forwarded-host"] || trustedHeaders.host || "";
// These names can arrive in a browser-authored uibuilder message. Clear them
// before attaching the server-observed transport context.
delete msg.pciInternal;
delete msg.pciObservedHost;
delete msg.pciTrustedHeaders;
if (observedHost) msg.pciObservedHost = String(observedHost);
msg.pciTrustedHeaders = trustedHeaders;
msg.route = String(msg.route || body.route || "");
msg.pciAction = String(msg.pciAction || msg.type || body.type || "");
const candidateData = msg.data && typeof msg.data === "object" ? msg.data : (body.data && typeof body.data === "object" ? body.data : {});
msg.data = { ...candidateData };
for (const unsafeKey of ["host", "hostname", "origin", "context", "location", "locationHost", "locationHostname", "publicUrl", "basePath", "orceBasePath"]) delete msg.data[unsafeKey];
delete msg.host;
delete msg.hostname;
delete msg.origin;
if (msg.route === "status" && msg.pciAction === "subscribe") { msg.route = "platform"; msg.pciAction = "platform.status"; }
return msg;`,
    outputs: 1, timeout: "", noerr: 0, initialize: "", finalize: "", libs: [], x: 470, y: 180, wires: [[]],
  };
  const routeValues = moduleSpecs.map((spec) => spec.route);
  const router = {
    id: id("switch:base:router"), type: "switch", z, name: "Route uibuilder module", property: "route", propertyType: "msg",
    rules: [...routeValues.map((value) => ({ t: "eq", v: value, vt: "str" })), { t: "else" }], checkall: "false", repair: false,
    outputs: routeValues.length + 1, x: 750, y: 180, wires: Array.from({ length: routeValues.length + 1 }, () => []),
  };
  ui.wires[0] = [normalize.id];
  normalize.wires[0] = [router.id];
  nodes.push(ui, normalize, router);
  routeValues.forEach((route, index) => {
    const output = linkOut(z, `base:${route}`, `→ ${route}`, 1040, 100 + index * 45, [id(`link-in:${moduleSpecs[index].key}:uib-in`)]);
    router.wires[index] = [output.id];
    nodes.push(output);
  });
  const fallback = {
    id: id("function:base:fallback"), type: "function", z, name: "Unknown UI route", func: `msg.topic="pci:error"; msg.payload={response:{status:"error",statusCode:404,code:"PCI-RESOURCE-404-001",detail:"Unknown uibuilder route."}}; return msg;`, outputs: 1, timeout: "", noerr: 0, initialize: "", finalize: "", libs: [], x: 1050, y: 100 + routeValues.length * 45, wires: [[]],
  };
  router.wires[routeValues.length] = [fallback.id];
  nodes.push(fallback);
  const responseIn = linkIn(z, "base:response", "module-response-in", 1040, 520, moduleSpecs.map((spec) => id(`link-out:${spec.key}:uib-out`)));
  responseIn.wires[0] = [ui.id];
  fallback.wires[0] = [ui.id];
  nodes.push(responseIn);

  const statusFn = functionNode(z, "base-status", "Health / readiness / metrics", statusSource, 910, 720, true);
  const statusResponse = httpResponse(z, "base-status", 1300, 720);
  statusFn.wires[0] = [statusResponse.id];
  nodes.push(statusFn, statusResponse);
  const statusRoutes = [
    ["health", "GET /healthz", "get", "/healthz", "status.health"],
    ["ready", "GET /readyz", "get", "/readyz", "status.ready"],
    ["metrics", "GET /metrics", "get", "/metrics", "status.metrics"],
    ["openapi", "GET /api/openapi.json", "get", "/api/openapi.json", "status.openapi"],
  ];
  let y = 650;
  for (const [key, name, method, url, action] of statusRoutes) {
    const incoming = httpIn(z, `base:${key}`, name, method, url, 150, y);
    const change = actionChange(z, `base:${key}`, action, "http", 500, y);
    incoming.wires[0] = [change.id];
    change.wires[0] = [statusFn.id];
    nodes.push(incoming, change);
    y += 55;
  }
  return nodes;
}

const baseNodes = await buildBase();
const moduleNodes = [];
for (const spec of moduleSpecs) moduleNodes.push(...await buildModule(spec));

await writeFile(path.join(outDir, "fap-pci-flow.json"), `${JSON.stringify([...baseNodes, ...moduleNodes], null, 2)}
`);
console.log(`[build:flows] wrote canonical flow to ${path.join(outDir, "fap-pci-flow.json")}`);