import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

test("repository keeps authored source separate from the three-part release", async () => {
  for (const entry of ["src", "backend/functions", "automation/stage1", "docs", "test/tests", "tools", "dist", "build.js", "package.json", "package-lock.json"]) assert.ok(await stat(path.join(root, entry)));
  const release = (await readdir(path.join(root, "dist"))).sort();
  assert.deepEqual(release, ["fap-pci-flow.json", "ground-zero.sh", "ui"]);
});

test("legacy and generated source trees are absent from version control", async () => {
  const entries = await readdir(root);
  for (const name of ["apps", "services", "deployment", "public"]) assert.equal(entries.includes(name), false);
  const backendEntries = await readdir(path.join(root, "backend"));
  assert.equal(backendEntries.includes("src"), false);
  assert.equal(backendEntries.includes("test"), false);
});

test("canonical flow is parseable and ids are unique", async () => {
  const flow = JSON.parse(await read("dist/fap-pci-flow.json"));
  const ids = flow.map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(flow.some((node) => node.type === "uibuilder" && node.url === "ui"));
  assert.ok(flow.some((node) => node.type === "tab" && node.label === "M5_PCI-Auth"));
});

test("every Function node compiles", async () => {
  const flow = JSON.parse(await read("dist/fap-pci-flow.json"));
  for (const node of flow.filter((candidate) => candidate.type === "function")) assert.doesNotThrow(() => new Function(node.func), node.name);
});

test("tenant subdomain format and trusted header enforcement are present", async () => {
  const common = await read("backend/functions/_common.js");
  const reconciler = await read("backend/functions/reconcile.js");
  assert.match(common, /\$\{value\}-\$\{cfg\.tenantHostSuffix\}\.\$\{cfg\.baseDomain\}/);
  assert.match(reconciler, /X-PCI-Tenant-ID/);
  assert.match(reconciler, /RequestHeaderModifier/);
  assert.match(reconciler, /PathPrefix/);
  assert.doesNotMatch(reconciler, /ReplacePrefixMatch/);
});

test("Envoy Gateway dependency is immutable and digest-verified", async () => {
  const groundZero = await read("automation/stage1/ground-zero.sh");
  assert.match(groundZero, /releases\/download\/\$\{ENVOY_VERSION\}\/install\.yaml/);
  assert.match(groundZero, /72b3971364f172eb0b9636c7142cc84ff695467bc065897958bde85a3c06cfd5/);
  assert.match(groundZero, /Envoy manifest digest mismatch/i);
});

test("static review token was removed in favor of Keycloak", async () => {
  const auth = await read("backend/functions/auth.js");
  const provider = await read("backend/functions/provider.js");
  const ui = await read("src/main.js");
  assert.match(auth, /auth\.exchange|jwks/i);
  assert.match(provider, /requireSession\(\["provider_admin"\]\)/);
  assert.doesNotMatch(ui, /FAP_PCI_PROVIDER_ADMIN_TOKEN|reviewToken|Review token/);
});

test("FAP PCI code never applies resources into the OCM namespace", async () => {
  const k8s = await read("backend/functions/_k8s.js");
  const infra = await read("backend/functions/infrastructure.js");
  assert.match(k8s, /not permitted to modify the OCM namespace/);
  assert.doesNotMatch(infra, /k8sApply\(/);
});

test("ground-zero owns runtime configuration names consumed by ORCE flows", async () => {
  const groundZero = await read("automation/stage1/ground-zero.sh");
  const common = await read("backend/functions/_common.js");
  for (const required of ["PCI_INFRASTRUCTURE_NAMESPACE", "PCI_DATABASE_MODE", "PCI_MAIL_MODE", "PCI_BOOTSTRAP_PROVIDER_USERNAME", "PCI_BOOTSTRAP_PROVIDER_EMAIL", "PCI_TLS_SECRET_NAME"]) {
    assert.match(groundZero, new RegExp(required));
    assert.match(common, new RegExp(required));
  }
});
