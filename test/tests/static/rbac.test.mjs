import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const groundZero = await readFile("automation/stage1/ground-zero.sh", "utf8");

test("ground-zero never binds cluster-admin", () => {
  assert.doesNotMatch(groundZero, /roleRef:[^\n]*cluster-admin/);
});

test("OCM namespace is validation/discovery-only from Kubernetes", () => {
  assert.match(groundZero, /--ocm-namespace/);
  assert.match(groundZero, /get ns \"\$OCM_NS\"/);
  assert.doesNotMatch(groundZero, /(?:apply|patch|delete)[^\n]*\$OCM_NS/);
});

test("ORCE runtime RBAC is bounded to tenant reconciliation and discovery", () => {
  assert.match(groundZero, /fap-pci-orce-runtime/);
  assert.match(groundZero, /httproutes,referencegrants/);
  assert.match(groundZero, /fap-pci-orce-gateway-reader/);
  assert.match(groundZero, /fap-pci-orce-discovery/);
  assert.doesNotMatch(groundZero, /resources:\s*\["?\*"?\]/);
});
