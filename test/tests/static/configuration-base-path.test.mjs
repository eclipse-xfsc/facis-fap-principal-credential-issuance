import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeBasePath, publicUrl, uiUrl, withBasePath } from "../../../shared/public-url.js";

test("canonical public URL helpers normalize root and prefixed deployments", () => {
  assert.equal(normalizeBasePath("/BASE/"), "/BASE");
  assert.equal(withBasePath("/api/v1/foo", "/BASE"), "/BASE/api/v1/foo");
  assert.equal(publicUrl("pci.example.com", "/healthz", "/foo/bar"), "https://pci.example.com/foo/bar/healthz");
  assert.equal(uiUrl("alpha-pci.example.com", "/BASE"), "https://alpha-pci.example.com/BASE/ui/");
});

test("canonical base path rejects URL-like values", () => {
  assert.throws(() => normalizeBasePath("https://example.com/x"), /path prefix, not a URL/);
});

test("active deployment surfaces expose PCI_ORCE_BASE_PATH and no obsolete complete URL setting", async () => {
  const files = [
    "automation/stage1/ground-zero.sh",
    "automation/stage1/install.sh",
    "backend/functions/_common.js",
    "src/config/runtime.js",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /(?:PCI_ORCE_BASE_PATH|orceBasePath)/, `${file} must expose the canonical setting`);
    assert.doesNotMatch(source, /PCI_PUBLIC_BASE_URL/, `${file} must not retain PCI_PUBLIC_BASE_URL`);
  }
});

test("ground-zero discovers Node-RED roots without rewriting settings.js", async () => {
  const source = await readFile("automation/stage1/ground-zero.sh", "utf8");
  assert.match(source, /discover_setting httpNodeRoot/);
  assert.match(source, /discover_setting httpAdminRoot/);
  assert.doesNotMatch(source, /sed[^\n]*settings\.js|perl[^\n]*settings\.js/);
});
