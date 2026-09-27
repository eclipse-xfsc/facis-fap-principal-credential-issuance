import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = [
  "src/index.html",
  "src/main.js",
  "src/config/runtime.js",
  "src/services/api.js",
  "src/services/auth.js",
];
const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

const suspicious = [
  /fetch\(\s*["']\/api/,
  /href\s*=\s*["']\/ui/,
  /(?:window\.)?location\.origin\s*\+\s*["']\//,
  /\$\{(?:window\.)?location\.origin\}\//,
  /redirectUri\s*:\s*(?:window\.)?location\.origin/,
  /(?:window\.)?location\.host(?:name)?/,
];

test("frontend has no remaining root-assuming public URL construction", () => {
  for (const pattern of suspicious) assert.doesNotMatch(source, pattern, String(pattern));
});

test("frontend sends every API route through the canonical base-path helper", async () => {
  const api = await readFile("src/services/api.js", "utf8");
  assert.match(api, /const target = withBasePath\(path, runtime\.basePath\)/);
  assert.equal((api.match(/fetch\(/g) || []).length, 1);
});

test("uibuilder and static assets are document-relative", async () => {
  const html = await readFile("src/index.html", "utf8");
  assert.match(html, /src="\.\/uibuilder\.iife\.min\.js"/);
  assert.match(html, /src="\.\/index\.js"/);
  assert.match(html, /href="\.\/index\.css"/);
});

test("browser base path is inferred from /ui/ then verified against public configuration", async () => {
  const runtime = await readFile("src/config/runtime.js", "utf8");
  const main = await readFile("src/main.js", "utf8");
  assert.match(runtime, /inferBasePathFromUiLocation/);
  assert.match(runtime, /Public base-path mismatch/);
  assert.ok(main.indexOf("api.registrationConfig()") < main.indexOf("completeLoginFromLocation()"));
});
