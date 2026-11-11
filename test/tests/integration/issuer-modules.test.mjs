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
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPciIssuerClient } from '../../../src/issuer/client.js';
import {
  newPciConnectorForm,
  newPciConfigurationForm
} from '../../../src/issuer/form-defaults.js';
test('issuer client evaluates the current tenant on every request', async() => {
  let tenant = 'alpha';
  const calls = [];
  const client = createPciIssuerClient(async(...args) => {
    calls.push(args);
    return { ok: true };
  }, () => tenant);
  assert.deepEqual(await client('/flows'), { ok: true });
  tenant = 'beta';
  await client('/flows');
  assert.equal(calls[0][0], '/api/v1/tenants/alpha/flows');
  assert.equal(calls[1][0], '/api/v1/tenants/beta/flows');
});
test('issuer client encodes tenant identifiers as a single path component', async() => {
  let url;
  await createPciIssuerClient(async u => {
    url = u;
  }, () => 'a/b?x=1')('/flows');
  assert.equal(url, '/api/v1/tenants/a%2Fb%3Fx%3D1/flows');
});
test('GET requests do not carry a body', async() => {
  let options;
  await createPciIssuerClient(async(_, o) => {
    options = o;
  }, () => 'a')('/flows');
  assert.deepEqual(options, { method: 'GET', headers: {} });
});
test('write requests retain JSON, version preconditions and extra headers', async() => {
  let options;
  await createPciIssuerClient(async(_, o) => {
    options = o;
  }, () => 'a')('/flows/f1', 'PATCH', { name: 'Example' }, 3, { 'idempotency-key': 'request-1' });
  assert.equal(options.body, '{"name":"Example"}');
  assert.equal(options.headers['if-match'], '"3"');
  assert.equal(options.headers['idempotency-key'], 'request-1');
});
test('transport failures preserve the original typed error', async() => {
  const error = Object.assign(new Error('Unavailable'), { status: 503, code: 'TEMPORARY' });
  const client = createPciIssuerClient(async() => {
    throw error;
  }, () => 'a');
  await assert.rejects(client('/flows'), e => e === error);
});
test('issuer client validates its injected dependencies', () => {
  assert.throws(() => createPciIssuerClient(null, () => 'a'), TypeError);
  assert.throws(() => createPciIssuerClient(() => {}, 'a'), TypeError);
});
test('connector defaults do not share nested credentials or scopes', () => {
  const a = newPciConnectorForm(),
  b = newPciConnectorForm();
  a.tlsSecret.name = 'private-a';
  a.jwtScopes.push('extra');
  assert.equal(b.tlsSecret.name, '');
  assert.deepEqual(b.jwtScopes, ['credential:issue']);
});
test('configuration defaults do not share nested claims and role arrays', () => {
  const a = newPciConfigurationForm(),
  b = newPciConfigurationForm();
  a.claims[0].name = 'changed';
  a.eligibility.roles.push('admin');
  assert.equal(b.claims[0].name, 'name');
  assert.deepEqual(b.eligibility.roles, ['principal']);
});
