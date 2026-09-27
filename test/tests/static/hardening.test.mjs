import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(file, "utf8");
const common = await read("backend/functions/_common.js");
const auth = await read("backend/functions/auth.js");
const infrastructure = await read("backend/functions/infrastructure.js");
const reconcile = await read("backend/functions/reconcile.js");
const email = await read("backend/functions/email.js");
const provider = await read("backend/functions/provider.js");
const groundZero = await read("automation/stage1/ground-zero.sh");
const installer = await read("automation/stage1/install.sh");
const build = await read("build.js");

test("OIDC redirects are bound to server-observed host and base path", () => {
  assert.match(auth, /const host = routedHost\(\)/);
  assert.match(auth, /if \(!host\) throw pciErrors\.invalidTenantContext\(\)/);
  assert.match(auth, /const expectedRedirect = uiUrl\(host, cfg\.orceBasePath\)/);
  assert.doesNotMatch(auth, /input\.(?:host|hostname|origin|context)/);
});

test("M1 is status-only; cluster bootstrap belongs to ground-zero", () => {
  assert.match(infrastructure, /status-only/);
  assert.doesNotMatch(infrastructure, /k8sApply\(/);
  assert.doesNotMatch(infrastructure, /ensureManagedDatabase|ensureMailpit|ensureKeycloak|ensureGateway/);
  for (const marker of ["Envoy Gateway", "fap-pci-postgres", "fap-pci-mailpit", "fap-pci-smtp-relay", "fap-pci-schema-init", "GatewayClass"]) {
    assert.match(groundZero, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("runtime workers remain lock-protected where mutations are concurrent", () => {
  assert.match(common, /function acquireGlobalLock\(/);
  assert.match(email, /const lockName = "email-outbox-retry"/);
  assert.match(reconcile, /const lockName = `tenant-reconcile:\$\{tenant\.tenant_id\}`/);
  assert.match(email, /releaseGlobalLock\(lockName, lockToken\)/);
  assert.match(reconcile, /releaseGlobalLock\(lockName, lockToken\)/);
});

test("ground-zero handles modern Envoy admission resources without cluster-admin runtime RBAC", () => {
  assert.match(groundZero, /validatingadmissionpolicies\.admissionregistration\.k8s\.io/);
  assert.match(groundZero, /validatingadmissionpolicybindings\.admissionregistration\.k8s\.io/);
  assert.doesNotMatch(groundZero, /roleRef:[^\n]*cluster-admin/);
  assert.match(groundZero, /fap-pci-orce-discovery/);
});

test("managed PostgreSQL uses an explicit non-root Alpine identity", () => {
  assert.match(groundZero, /runAsUser: 70/);
  assert.match(groundZero, /runAsGroup: 70/);
  assert.match(groundZero, /runAsNonRoot: true/);
  assert.match(groundZero, /currentRevision/);
  assert.match(groundZero, /updateRevision/);
});

test("Keycloak credentials are discovered from actual workload wiring and realm roles enter ID tokens", () => {
  assert.match(groundZero, /KEYCLOAK_ADMIN_PASSWORD/);
  assert.match(groundZero, /secretKeyRef/);
  assert.match(groundZero, /"id\.token\.claim":"true"/);
  assert.match(groundZero, /realm_access\.roles/);
  assert.match(groundZero, /provider_admin/);
});

test("generated secrets survive idempotent ground-zero reruns", () => {
  assert.match(groundZero, /preserve_or_generate/);
  assert.match(groundZero, /PCI_VERIFICATION_TOKEN_PEPPER/);
  assert.match(groundZero, /PCI_INTERNAL_SERVICE_TOKEN/);
  assert.match(groundZero, /PCI_POSTGRES_PASSWORD/);
  assert.match(groundZero, /PCI_BOOTSTRAP_PROVIDER_PASSWORD/);
});

test("post-ground-zero artifact installation is hot and never restarts ORCE", () => {
  assert.match(installer, /Node-RED-API-Version: v2/);
  assert.match(installer, /HTTP_CODE[^]*200[^]*204/);
  assert.doesNotMatch(installer, /rollout restart/);
  assert.doesNotMatch(installer, /rollout status/);
  assert.match(groundZero, /before PCI artifacts are imported/);
});

test("release build emits only the canonical runtime artifact classes", async () => {
  assert.match(build, /dist.*fap-pci-flow\.json/s);
  assert.match(build, /dist.*ground-zero\.sh/s);
  assert.match(build, /dist.*ui/s);
  const flowBuilder = await read("tools/build-flows.mjs");
  assert.match(flowBuilder, /URL, URLSearchParams/);
});

test("provider administration HTTP traffic stays on the main PCI host", () => {
  assert.match(provider, /const requestHost = routedHost\(\)/);
  assert.match(provider, /requestHost !== cfg\.mainHost/);
  assert.match(provider, /pciErrors\.invalidTenantContext\(\)/);
});
