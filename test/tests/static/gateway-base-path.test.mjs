import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const groundZero = await readFile("automation/stage1/ground-zero.sh", "utf8");
const reconcile = await readFile("backend/functions/reconcile.js", "utf8");
const flow = JSON.parse(await readFile("dist/fap-pci-flow.json", "utf8"));

test("ground-zero owns the main Gateway base-path route without prefix rewriting", () => {
  assert.ok(groundZero.includes("type: PathPrefix"));
  assert.ok(groundZero.includes("ORCE_BASE_PATH"));
  assert.equal(groundZero.includes("ReplacePrefixMatch"), false);
});

test("tenant routes keep exact UI entry rewrites and prefix routing", () => {
  assert.ok(reconcile.includes('type: "Exact", value: entryPath'));
  assert.ok(reconcile.includes('type: "ReplaceFullPath", replaceFullPath: cfg.publicUiPath'));
  assert.ok(reconcile.includes('type: "PathPrefix", value: cfg.orceBasePath || "/"'));
  assert.equal(reconcile.includes("ReplacePrefixMatch"), false);
});

test("built tenant header filter is valid for Gateway API", () => {
  const node = flow.find((candidate) => candidate.type === "function" && candidate.name === "M4_PCI-TenantReconciliation");
  assert.ok(node, "tenant reconciler must be present in the deployable flow");
  const filter = node.func.match(/function tenantHeaderFilter\(tenant\)\s*\{[\s\S]*?remove:\s*\[([\s\S]*?)\],\s*set:\s*\[([\s\S]*?)\]/);
  assert.ok(filter, "tenant header filter must have remove and set actions");
  const removed = [...filter[1].matchAll(/"([^"]+)"/g)].map((match) => match[1].toLowerCase());
  const set = [...filter[2].matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1].toLowerCase());
  assert.ok(removed.length <= 16, `Gateway API allows at most 16 removals; found ${removed.length}`);
  assert.equal(new Set(removed).size, removed.length);
  for (const name of set) assert.ok(!removed.includes(name), `${name} must not be removed and set in one filter`);
});

test("Node-RED HTTP routes stay application-relative", () => {
  const routes = flow.filter((node) => node.type === "http in").map((node) => node.url);
  for (const expected of ["/api/v1/auth/config", "/healthz", "/readyz", "/metrics"]) {
    assert.ok(routes.includes(expected));
  }
  for (const route of routes) assert.equal(route.includes("//"), false);
});
