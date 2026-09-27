import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const common = await readFile("backend/functions/_common.js", "utf8");
const auth = await readFile("backend/functions/auth.js", "utf8");
const provider = await readFile("backend/functions/provider.js", "utf8");
const baseFlow = JSON.parse(await readFile("dist/fap-pci-flow.json", "utf8"));
const normalizeNode = baseFlow.find((node) => node.type === "function" && node.name === "Normalize uibuilder request");

test("backend host authority comes only from HTTP or trusted uibuilder handshake context", () => {
  assert.match(common, /function trustedUibuilderHeaders\(/);
  assert.match(common, /if \(msg\.pciTransport === "uibuilder"\) return trustedUibuilderHeaders\(\);/);
  assert.match(common, /msg\.req && msg\.req\.headers/);
  assert.match(common, /msg\.pciObservedHost \|\| headers\["x-forwarded-host"\] \|\| headers\.host/);
  assert.doesNotMatch(common, /msg\.host\s*\|\|/);
  assert.doesNotMatch(auth, /input\.(?:host|hostname|origin|context)/);
});

test("provider administration fails closed when routed host is absent or not the main host", () => {
  assert.match(provider, /if \(!requestHost \|\| requestHost !== cfg\.mainHost\) throw pciErrors\.invalidTenantContext\(\)/);
});

test("uibuilder browser payload cannot spoof host or base-path authority", () => {
  assert.ok(normalizeNode, "Normalize uibuilder request node exists");
  const execute = new Function("msg", normalizeNode.func);
  const msg = {
    payload: {
      route: "tenant",
      type: "tenant.runtime",
      data: {
        host: "evil.example.com",
        hostname: "evil.example.com",
        origin: "https://evil.example.com",
        context: { host: "evil.example.com" },
        basePath: "/evil",
        orceBasePath: "/evil",
        safeValue: "kept",
      },
    },
    _uib: { handshake: { headers: { "x-forwarded-host": "alpha-pci.example.com" } } },
  };
  const result = execute(msg);
  assert.equal(result.pciObservedHost, "alpha-pci.example.com");
  assert.deepEqual(result.data, { safeValue: "kept" });

  const spoofOnly = execute({
    pciObservedHost: "evil.example.com",
    pciTrustedHeaders: { host: "evil.example.com" },
    req: { headers: { host: "evil.example.com" } },
    payload: {
      route: "tenant",
      type: "tenant.runtime",
      data: {
        host: "evil.example.com",
        context: { host: "evil.example.com" },
        locationHost: "evil.example.com",
      },
    },
  });
  assert.equal(spoofOnly.pciObservedHost, undefined);
  assert.deepEqual(spoofOnly.pciTrustedHeaders, {});
  assert.deepEqual(spoofOnly.data, {});
});
