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

test("Node-RED HTTP routes stay application-relative", () => {
  const routes = flow.filter((node) => node.type === "http in").map((node) => node.url);
  for (const expected of ["/api/v1/auth/config", "/healthz", "/readyz", "/metrics"]) {
    assert.ok(routes.includes(expected));
  }
  for (const route of routes) assert.equal(route.includes("//"), false);
});
