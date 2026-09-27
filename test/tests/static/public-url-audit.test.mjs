import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else output.push(full);
  }
  return output;
}

const authoredFiles = [
  ...await walk("src"),
  ...await walk("backend/functions"),
  ...await walk("automation/stage1"),
  ...await walk("tools"),
  "shared/public-url.js",
].filter((file) => !file.endsWith(".css") && !file.endsWith(".sql"));
const authored = Object.fromEntries(await Promise.all(authoredFiles.map(async (file) => [file, await readFile(file, "utf8")])));
const joined = Object.entries(authored).map(([file, source]) => `\n/* ${file} */\n${source}`).join("\n");

test("authored source contains no obsolete complete-public-URL setting", () => {
  assert.doesNotMatch(joined, /PCI_PUBLIC_BASE_URL/);
});

test("authored browser source has no direct root-relative network calls or root-relative asset links", async () => {
  const frontend = [
    await readFile("src/index.html", "utf8"),
    await readFile("src/main.js", "utf8"),
    await readFile("src/config/runtime.js", "utf8"),
    await readFile("src/services/api.js", "utf8"),
    await readFile("src/services/auth.js", "utf8"),
  ].join("\n");
  const forbidden = [
    /fetch\(\s*["'`]\/(?:api|ui)/,
    /(?:src|href)\s*=\s*["']\/(?:ui|assets|index)/,
    /(?:window\.)?location\.origin\s*(?:\+|\})/,
    /redirectUri\s*:\s*(?:window\.)?location\.origin/,
    /(?:window\.)?location\.host(?:name)?/,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(frontend, pattern, String(pattern));
});

test("all authored public URL generation uses canonical helpers", () => {
  const backend = Object.entries(authored)
    .filter(([file]) => file.startsWith("backend/functions/"))
    .map(([, source]) => source)
    .join("\n");
  assert.doesNotMatch(backend, /`https:\/\/\$\{(?:cfg\.|tenant\.|host)/);
  assert.doesNotMatch(backend, /["']https:\/\/["']\s*\+/);
  assert.match(backend, /uiUrl\(cfg\.mainHost, cfg\.orceBasePath\)/);
  assert.match(backend, /uiUrl\(tenant\.primary_domain, cfg\.orceBasePath\)/);
  assert.match(authored["backend/functions/status.js"], /publicOrigin\(cfg\.mainHost\)/);
});

test("root-relative literals are limited to application route contracts and helper inputs", () => {
  const tools = authored["tools/build-flows.mjs"];
  for (const match of tools.matchAll(/["'`](\/(?:api\/v1|healthz|readyz|metrics)[^"'`]*)["'`]/g)) {
    assert.match(match[1], /^\/(?:api\/v1|healthz|readyz|metrics)/);
    assert.doesNotMatch(match[1], /^\/(?:BASE|platform\/orce)\//);
  }
});

test("email, invitation and Keycloak URL sites are all base-path aware", () => {
  for (const file of ["backend/functions/registration.js", "backend/functions/provider.js", "backend/functions/reconcile.js", "backend/functions/_common.js"]) {
    assert.match(authored[file], /uiUrl\([^\n]+cfg\.orceBasePath\)/, `${file} must use uiUrl with cfg.orceBasePath`);
  }
  assert.match(authored["backend/functions/reconcile.js"], /redirectUris = Array\.from\(new Set\(\[uiUrl\(cfg\.mainHost, cfg\.orceBasePath\)/);
  assert.match(authored["backend/functions/reconcile.js"], /post\.logout\.redirect\.uris/);
  assert.match(authored["backend/functions/auth.js"], /const expectedRedirect = uiUrl\(host, cfg\.orceBasePath\)/);
});
