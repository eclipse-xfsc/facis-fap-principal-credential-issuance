import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const openapi = JSON.parse(await readFile("docs/api/openapi.json", "utf8"));
const flows = JSON.parse(await readFile("dist/fap-pci-flow.json", "utf8"));
const httpRoutes = new Set(flows.filter((node) => node.type === "http in").map((node) => `${node.method.toLowerCase()} ${node.url}`));

test("external Sprint Review 1 HTTP contract is represented by ORCE HTTP In nodes", () => {
  const required = [
    "get /api/v1/tenant-registration-config",
    "post /api/v1/tenant-registrations",
    "post /api/v1/tenant-registrations/:registrationId/verify-email",
    "get /api/v1/provider/tenant-registrations",
    "post /api/v1/provider/tenant-registrations/:registrationId/approve",
    "post /api/v1/provider/tenant-registrations/:registrationId/reject",
    "get /api/v1/provider/tenants",
    "get /api/v1/provider/tenants/:tenantId/reconciliation",
    "get /api/v1/runtime/tenant-context",
  ];
  for (const route of required) assert.ok(httpRoutes.has(route), route);
});

test("OpenAPI contains Keycloak auth and compatibility paths", () => {
  assert.ok(openapi.components.securitySchemes.oidc);
  assert.ok(openapi.paths["/api/v1/auth/oidc/exchange"]);
  assert.ok(openapi.paths["/api/v1/internal/provisioning/tenants"]);
});


test("OpenAPI documents the deployment base-path variable without changing route paths", () => {
  assert.match(openapi.servers[0].url, /\{basePath\}$/);
  assert.equal(openapi.servers[0].variables.basePath.default, "");
  assert.ok(openapi.paths["/api/v1/auth/config"]);
  assert.equal(Object.keys(openapi.paths).some((path) => path.startsWith("/BASE/")), false);
});

test("OpenAPI exposes base-path-aware public and OIDC configuration fields", () => {
  const publicConfig = openapi.components.schemas.PublicConfiguration;
  const oidcConfig = openapi.components.schemas.OidcConfiguration;
  for (const field of ["orceBasePath", "uiPath", "apiBasePath", "publicUiUrl"]) assert.ok(publicConfig.properties[field], field);
  for (const field of ["redirectUri", "orceBasePath", "uiPath"]) assert.ok(oidcConfig.properties[field], field);
  const origin = openapi.paths["/api/v1/auth/config"].get.parameters.find((parameter) => parameter.name === "origin");
  assert.equal(origin.deprecated, true);
  assert.match(origin.description, /server-observed routed host is authoritative/);
});
