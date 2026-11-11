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
import fs from 'node:fs';
import { issuerControllerFixture, deferred } from '../../support/issuer-controller.mjs';
const requestId = 'd616ebf2-2874-426c-83f1-2f9aa0be45ee';
test('issuer features import independently without Vue or browser globals', () => {
  const { ui } = issuerControllerFixture();
  assert.equal(typeof ui.saveConfig, 'function');
  assert.equal(typeof ui.restoreJourney, 'function');
});
test('issuer composition preserves every existing view binding', () => {
  const { ui } = issuerControllerFixture();
  const names = JSON.parse(fs.readFileSync('test/fixtures/issuer-public-api.json'));
  for (const name of names) assert.ok(Object.hasOwn(ui, name), name);
});
test('issuer state and drafts do not leak between mounted tenants', () => {
  const first = issuerControllerFixture().ui,
  second = issuerControllerFixture().ui;
  first.identityForm.value.clientSecret = 'synthetic-test-value';
  first.connectorForm.value.tlsSecret.name = 'synthetic-secret-reference';
  first.newConfig();
  second.newConfig();
  first.configForm.value.claims[0].name = 'changed';
  assert.equal(second.identityForm.value.clientSecret, '');
  assert.equal(second.connectorForm.value.tlsSecret.name, '');
  assert.equal(second.configForm.value.claims[0].name, 'name');
});
test('issuer projections expose role-appropriate navigation without I/O', () => {
  const { ui, calls } = issuerControllerFixture();
  assert.deepEqual(ui.sections.value.map(s => s.id), ['request', 'presentation']);
  ui.cap.value = { issuer: true, tenantAdmin: false };
  assert.ok(ui.sections.value.some(s => s.id === 'history'));
  assert.ok(!ui.sections.value.some(s => s.id === 'tenant'));
  assert.equal(calls.length, 0);
});
test('connector editing distinguishes absent scope, empty scope and explicit all scope', () => {
  const { ui } = issuerControllerFixture();
  ui.editConnector({ id: 'one', draft: { name: 'Missing scope' } });
  assert.deepEqual(ui.connectorForm.value.configurationIds, []);
  ui.editConnector({ id: 'two', draft: { name: 'All', configurationIds: null } });
  assert.equal(ui.connectorForm.value.configurationIds, null);
  const original = { id: 'three', draft: { configurationIds: ['A'] } };
  ui.editConnector(original);
  ui.connectorForm.value.configurationIds.push('B');
  assert.deepEqual(original.draft.configurationIds, ['A']);
});
test('flow actions enforce reordering bounds and add steps before the offer', () => {
  const { ui } = issuerControllerFixture();
  ui.newFlow();
  const steps = ui.flowForm.value.data.steps;
  ui.moveStep(0, - 1);
  assert.equal(steps[0].id, 'intro');
  ui.moveStep(steps.length - 1, 1);
  assert.equal(steps.at(- 1).type, 'offer');
  ui.addStep();
  assert.equal(steps.length, 4);
  assert.equal(steps.at(- 1).type, 'offer');
  assert.match(steps[2].id, /^step[0-9a-f]{8}$/);
});
test('configuration actions send correct version headers without mutating the original draft', async() => {
  const original = { id: 'config-1', version: 7, draft: { name: 'Original', identifier: 'Employee' } };
  const { ui, calls } = issuerControllerFixture({
    request: async path => path.endsWith('/credential-configurations') ? { items: [] }: { item: original, versions: [] }
  });
  await ui.editConfig({ id: 'config-1' });
  ui.configForm.value.name = 'Changed';
  await ui.saveConfig();
  const update = calls.find(c => c.method === 'PATCH');
  assert.equal(update.headers['if-match'], '"7"');
  assert.equal(JSON.parse(update.body).data.name, 'Changed');
  assert.equal(original.draft.name, 'Original');
});
test('identity secrets are cleared on success and on failed updates', async() => {
  for (const failed of [false, true]) {
    const item = { version: 1, mode: 'oidc', displayName: 'Account', scopes: 'openid' };
    const { ui } = issuerControllerFixture({
      request: async(_path, init) => {
        if (init.method === 'PUT' && failed) throw new Error('synthetic upstream failure');
        return { item, redirectUri: 'https://identity.example/broker' };
      }
    });
    ui.identity.value = item;
    ui.identityForm.value.clientSecret = 'synthetic-test-value';
    await ui.saveIdentity();
    assert.equal(ui.identityForm.value.clientSecret, '');
    assert.equal(Boolean(ui.error.value), failed);
  }
});
test('asset validation rejects oversized files without a request and clears the input', async() => {
  const { ui, calls } = issuerControllerFixture();
  const event = { target: { files: [{ size: 1048577 }], value: 'selected' } };
  await ui.upload(event);
  assert.match(ui.error.value.message, /1 MiB/);
  assert.equal(calls.length, 0);
  assert.equal(event.target.value, '');
});
test('workspace persistence keeps only opaque request IDs and the active tab', () => {
  const { ui, saved } = issuerControllerFixture();
  ui.journey.value = { request: { requestId } };
  ui.answers.value = { claim: 'synthetic-sensitive-value' };
  ui.offer.value = { offerUrl: 'https://wallet.example/offer' };
  ui.navigate('request');
  assert.deepEqual(JSON.parse([...saved.values()][0]), { tab: 'request', requestId });
});
test('overlapping issuer operations keep busy until the final operation settles', async() => {
  const first = deferred(),
  second = deferred();
  let sequence = 0;
  const { ui } = issuerControllerFixture({ request: () => (++ sequence === 1 ? first: second).promise });
  const a = ui.createKey(),
  b = ui.createKey();
  assert.equal(ui.busy.value, true);
  first.resolve({});
  await a;
  assert.equal(ui.busy.value, true);
  second.resolve({});
  await b;
  assert.equal(ui.busy.value, false);
});
test('wallet return navigation takes priority over a previously saved workspace tab', () => {
  const saved = new Map([['fap-pci-workspace:alpha:member', JSON.stringify({ tab: 'configurations', requestId: null })]]);
  const { ui, window } = issuerControllerFixture({ saved, hash: '#/presentation?request=' + requestId + '&response_code=' + 'a'.repeat(
    43) });
  assert.equal(ui.tab.value, 'presentation');
  assert.equal(ui.presentation.value.requestId, requestId);
  assert.equal(window.location.hash, '#/presentation');
});
test('refresh clears privileged workspace state when issuer privileges are removed', async() => {
  const { ui } = issuerControllerFixture();
  ui.configs.value = [{ id: 'old-configuration' }];
  ui.flows.value = [{ id: 'old-flow' }];
  ui.assets.value = [{ id: 'old-asset' }];
  ui.assignments.value = [{ id: 'old-assignment' }];
  ui.members.value = [{ subject: 'old-member' }];
  ui.identityForm.value.clientSecret = 'synthetic-test-value';
  await ui.refresh();
  for (const name of ['configs', 'flows', 'assets', 'assignments', 'members']) assert.deepEqual(ui[name].value, [], name);
  assert.equal(ui.identityForm.value.clientSecret, '');
});
test('successful operations and navigation do not silently dismiss existing errors', async() => {
  const { ui } = issuerControllerFixture();
  ui.error.value = { message: 'Existing error' };
  await ui.createKey();
  ui.navigate('request');
  assert.equal(ui.error.value.message, 'Existing error');
});
