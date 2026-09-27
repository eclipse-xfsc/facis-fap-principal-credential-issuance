import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBasePath,
  withBasePath,
  publicOrigin,
  publicUrl,
  uiPath,
  uiUrl,
  apiPath,
} from "../../../shared/public-url.js";

const valid = new Map([
  ["", ""],
  ["/", ""],
  ["BASE", "/BASE"],
  ["/BASE", "/BASE"],
  ["/BASE/", "/BASE"],
  ["/foo/bar", "/foo/bar"],
  ["/foo/bar/", "/foo/bar"],
]);

for (const [input, expected] of valid) {
  test(`normalizeBasePath(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
    assert.equal(normalizeBasePath(input), expected);
  });
}

for (const input of [
  "http://example.com",
  "https://example.com/x",
  "//example.com",
  "../foo",
  "/foo/../bar",
  "/foo/./bar",
  "/foo//bar",
  "/foo?x=1",
  "/foo#fragment",
  "/foo\\bar",
  "/foo/%2e%2e/bar",
  "/foo bar",
]) {
  test(`normalizeBasePath rejects ${JSON.stringify(input)}`, () => {
    assert.throws(() => normalizeBasePath(input));
  });
}

test("URL construction remains root-compatible", () => {
  assert.equal(withBasePath("/api/v1/foo", ""), "/api/v1/foo");
  assert.equal(withBasePath("/ui/", ""), "/ui/");
  assert.equal(apiPath("/foo", ""), "/api/v1/foo");
  assert.equal(uiPath(""), "/ui/");
});

test("URL construction supports a simple prefix", () => {
  assert.equal(withBasePath("/api/v1/foo", "/BASE"), "/BASE/api/v1/foo");
  assert.equal(withBasePath("/api/v1/foo?state=pending_approval", "/BASE"), "/BASE/api/v1/foo?state=pending_approval");
  assert.equal(withBasePath("/ui/", "/BASE"), "/BASE/ui/");
  assert.equal(withBasePath("/BASE/api/v1/foo", "/BASE"), "/BASE/api/v1/foo");
  assert.equal(apiPath("/foo", "/BASE"), "/BASE/api/v1/foo");
  assert.equal(uiPath("/BASE"), "/BASE/ui/");
});

test("URL construction supports a nested prefix", () => {
  assert.equal(withBasePath("/api/v1/foo", "/foo/bar"), "/foo/bar/api/v1/foo");
  assert.equal(withBasePath("/ui/", "/foo/bar"), "/foo/bar/ui/");
  assert.equal(publicUrl("pci.example.com", "/healthz", "/foo/bar"), "https://pci.example.com/foo/bar/healthz");
});

test("main and tenant public URLs are canonical HTTPS URLs", () => {
  assert.equal(publicOrigin("pci.example.com"), "https://pci.example.com");
  assert.equal(uiUrl("pci.example.com", "/BASE"), "https://pci.example.com/BASE/ui/");
  assert.equal(publicUrl("alpha-pci.example.com", "/api/v1/runtime/tenant-context", "/BASE"), "https://alpha-pci.example.com/BASE/api/v1/runtime/tenant-context");
  assert.equal(publicUrl("alpha-pci.example.com", "/api/v1/runtime/me", "/BASE"), "https://alpha-pci.example.com/BASE/api/v1/runtime/me");
  assert.equal(publicUrl("alpha-pci.example.com", "/api/v1/tenant-admin/principals", "/BASE"), "https://alpha-pci.example.com/BASE/api/v1/tenant-admin/principals");
});

test("OIDC redirect URIs are exact for root and prefixed deployments", () => {
  assert.equal(uiUrl("pci.example.com", ""), "https://pci.example.com/ui/");
  assert.equal(uiUrl("pci.example.com", "/BASE"), "https://pci.example.com/BASE/ui/");
  assert.equal(uiUrl("alpha-pci.example.com", "/platform/orce"), "https://alpha-pci.example.com/platform/orce/ui/");
});

test("verification and invitation links retain the base path", () => {
  const verification = new URL(uiUrl("pci.example.com", "/BASE"));
  verification.searchParams.set("verify_registration", "registration-id");
  verification.searchParams.set("token", "token-value");
  assert.equal(verification.toString(), "https://pci.example.com/BASE/ui/?verify_registration=registration-id&token=token-value");

  const invitation = new URL(uiUrl("alpha-pci.example.com", "/BASE"));
  invitation.searchParams.set("invite", "invite-token");
  assert.equal(invitation.toString(), "https://alpha-pci.example.com/BASE/ui/?invite=invite-token");
});
