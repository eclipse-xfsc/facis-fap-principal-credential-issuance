import test from "node:test";
import assert from "node:assert/strict";
import { publicUrl, uiUrl, withBasePath } from "../../../shared/public-url.js";

const scenarios = [
  {
    name: "root",
    basePath: "",
    mainUi: "https://pci.example.com/ui/",
    mainAuth: "https://pci.example.com/api/v1/auth/config",
    tenantUi: "https://alpha-pci.example.com/ui/",
  },
  {
    name: "simple prefix",
    basePath: "/BASE",
    mainUi: "https://pci.example.com/BASE/ui/",
    mainAuth: "https://pci.example.com/BASE/api/v1/auth/config",
    tenantUi: "https://alpha-pci.example.com/BASE/ui/",
  },
  {
    name: "nested prefix",
    basePath: "/platform/orce",
    mainUi: "https://pci.example.com/platform/orce/ui/",
    mainAuth: "https://pci.example.com/platform/orce/api/v1/auth/config",
    tenantUi: "https://alpha-pci.example.com/platform/orce/ui/",
  },
];

for (const scenario of scenarios) {
  test(`acceptance scenario: ${scenario.name}`, () => {
    assert.equal(uiUrl("pci.example.com", scenario.basePath), scenario.mainUi);
    assert.equal(publicUrl("pci.example.com", "/api/v1/auth/config", scenario.basePath), scenario.mainAuth);
    assert.equal(uiUrl("alpha-pci.example.com", scenario.basePath), scenario.tenantUi);
    for (const value of [scenario.mainUi, scenario.mainAuth, scenario.tenantUi]) {
      assert.doesNotMatch(value.replace("https://", ""), /\/\//);
      assert.doesNotMatch(value, /undefined/);
      assert.doesNotMatch(value, /BASE\/BASE/);
      assert.match(value, /^https:\/\/[a-z0-9.-]+\//);
    }
  });
}

test("Gateway pass-through path and backend httpNodeRoot path are identical", () => {
  assert.equal(withBasePath("/api/v1/foo", "/BASE"), "/BASE/api/v1/foo");
  assert.equal(withBasePath("/api/v1/foo", "/platform/orce"), "/platform/orce/api/v1/foo");
});
