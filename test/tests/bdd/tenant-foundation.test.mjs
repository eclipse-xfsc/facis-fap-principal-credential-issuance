// Copyright (c) 2026 LEANEA GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License, Version 2.0 which is available at
// https://www.apache.org/licenses/LICENSE-2.0.
//
// SPDX-License-Identifier: Apache-2.0
//
// Prepared with AI-assisted tools and reviewed by the author.
// Assisted-by: AI
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const registration = await readFile("backend/functions/registration.js", "utf8");
const provider = await readFile("backend/functions/provider.js", "utf8");
const reconcile = await readFile("backend/functions/reconcile.js", "utf8");
test("approval is gated by email verification", () => {
  assert.match(registration, /state='pending_approval'/);
  assert.match(provider, /Only an email-verified registration can be approved/);
});
test("approval writes desired state and ORCE reconciliation creates tenant resources", () => {
  assert.match(provider, /INSERT INTO tenants/);
  assert.match(reconcile, /kind: "ConfigMap"/);
  assert.match(reconcile, /kind: "HTTPRoute"/);
  assert.match(reconcile, /tenant\.primary_domain/);
});
test("tenant activation waits for identity, route and DNS", () => {
  assert.match(reconcile, /IdentityReady/);
  assert.match(reconcile, /RouteAccepted/);
  assert.match(reconcile, /DNSReady/);
  assert.match(reconcile, /dnsReady\s*\?\s*"active"\s*:\s*"provisioning"/);
});
