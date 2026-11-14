// Copyright (c) 2026 LEANEA GmbH and others.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { issuerControllerFixture, deferred } from '../../support/issuer-controller.mjs';
const issuerFields = [
  'configs',
  'flows',
  'assets',
  'selected',
  'configForm',
  'selectedFlow',
  'flowForm',
  'history',
  'versions',
  'preview',
  'query',
  'configState',
  'historyConfig',
  'restoreVersion',
  'search',
  'nextCursor',
];
const adminFields = [
  'members',
  'assignments',
  'identity',
  'identityRedirect',
  'identityForm',
  'metadata',
  'metadataForm',
  'authServers',
  'branding',
  'brandingForm',
  'settings',
  'settingsForm',
  'publication',
  'connector',
  'connectorForm',
  'grant',
  'grantConfig',
  'keyName',
  'keyType',
  'settingsTab',
];
const sharedFields = ['uploadRole', 'uploadScope'];
const restrictedFields = [...issuerFields, ...adminFields, ...sharedFields];
const clone = value => JSON.parse(JSON.stringify(value));
const snapshot = (ui, names = restrictedFields) => Object.fromEntries(names.map(name => [name, clone(ui[name].value)]));
function seed(ui) {
  for (const name of restrictedFields) {
    const value = ui[name].value;
    ui[name].value = Array.isArray(value) ? [{ previousPrivateRecord: true }]: value && typeof value === 'object' ? { ...clone(
      value), previousPrivateDraft: true }: value === null ? { previousPrivateRecord: true }: 'previous-private-value';
  }
  ui.nextCursor.value = 'previous-private-cursor';
  ui.identityForm.value.clientSecret = 'synthetic-test-value';
  ui.connectorForm.value.tlsSecret.name = 'synthetic-secret-reference';
  ui.metadataForm.value.authorizationServers = ['https://previous.example'];
  ui.brandingForm.value.title = 'Previous private draft';
  ui.grant.value.subject = 'previous-private-subject';
  ui.uploadRole.value = 'backgroundAssetId';
  ui.uploadScope.value = 'tenant';
  ui.cap.value = { issuer: true, tenantAdmin: true };
  ui.connectors.value = [{ previousPrivateConnector: true }];
}
const principalId = 'd616ebf2-2874-426c-83f1-2f9aa0be45ee';
function revokedFixture(failAt = null, capabilities = { issuer: false, tenantAdmin: false }) {
  let ui;
  const observations = [];
  const publicConnectors = [{ id: 'available-connector', state: 'published', draft: { configurationIds: null }, }];
  const fixture = issuerControllerFixture({
    request: async path => {
      if (path.endsWith('/issuer-capabilities')) {
        return { ...capabilities, connectors: publicConnectors };
      }
      for (const endpoint of ['eligible-configurations', 'presentation-configurations']) {
        if (path.endsWith('/' + endpoint)) {
          observations.push({ endpoint, state: snapshot(ui), connectors: clone(ui.connectors.value), });
          if (endpoint === failAt) throw new Error('synthetic failure: ' + endpoint);
          return { items: [{ id: 'public-' + endpoint }] };
        }
      }
      if (path.endsWith('/issuance-requests/' + principalId)) {
        return {
          request: { requestId: principalId, state: 'journey', step: 0, expiresAt: Date.now() + 60000, },
          flow: { steps: [{ id: 'intro' }] },
        };
      }
      throw new Error('Unexpected privileged request: ' + path);
    },
  });
  ui = fixture.ui;
  const expected = snapshot(issuerControllerFixture().ui);
  seed(ui);
  return { ...fixture, observations, publicConnectors, expected };
}
for (const endpoint of ['eligible-configurations', 'presentation-configurations']) {
  test(`revoked privileges are cleared before ${endpoint} fails`, async() => {
    const fixture = revokedFixture(endpoint);
    await fixture.ui.refresh();
    assert.equal(fixture.observations.length, endpoint === 'eligible-configurations' ? 1: 2);
    for (const observed of fixture.observations) {
      assert.deepEqual(observed.state, fixture.expected);
      assert.deepEqual(observed.connectors, fixture.publicConnectors);
    }
    assert.deepEqual(snapshot(fixture.ui), fixture.expected);
    assert.equal(fixture.ui.error.value.message, 'synthetic failure: ' + endpoint);
    assert.equal(fixture.ui.busy.value, false);
  });
}
test('successful revoked refresh clears records and editable drafts', async() => {
  const fixture = revokedFixture();
  await fixture.ui.refresh();
  assert.equal(fixture.observations.length, 2);
  for (const observed of fixture.observations) {
    assert.deepEqual(observed.state, fixture.expected);
  }
  assert.deepEqual(snapshot(fixture.ui), fixture.expected);
  assert.equal(fixture.ui.identityForm.value.clientSecret, '');
  assert.equal(fixture.ui.connectorForm.value.tlsSecret.name, '');
  assert.deepEqual(fixture.ui.connectors.value, fixture.publicConnectors);
  assert.equal(fixture.ui.error.value, null);
});
test('cleanup completes while the next public request is still pending', { timeout: 5000 }, async() => {
  const entered = deferred();
  const pending = deferred();
  const { ui } = issuerControllerFixture({
    request: async path => {
      if (path.endsWith('/issuer-capabilities')) {
        return { issuer: false, tenantAdmin: false, connectors: [] };
      }
      if (path.endsWith('/eligible-configurations')) {
        entered.resolve();
        return pending.promise;
      }
      return { items: [] };
    },
  });
  const expected = snapshot(issuerControllerFixture().ui);
  seed(ui);
  const refresh = ui.refresh();
  try {
    await entered.promise;
    assert.deepEqual(snapshot(ui), expected);
    assert.equal(ui.busy.value, true);
  } finally {
    pending.resolve({ items: [] });
    await refresh;
  }
  assert.equal(ui.error.value, null);
  assert.equal(ui.busy.value, false);
});
for (const capabilities of [
  { issuer: false, tenantAdmin: true },
  { issuer: true, tenantAdmin: false },
  { issuer: true, tenantAdmin: true },
]) {
  test(`cleanup respects retained roles: ${JSON.stringify(capabilities)}`, async() => {
    const fixture = revokedFixture('eligible-configurations', capabilities);
    const before = snapshot(fixture.ui);
    await fixture.ui.refresh();
    assert.equal(fixture.observations.length, 1);
    const cleared = [...(!capabilities.issuer ? issuerFields: []), ...(!capabilities.tenantAdmin ? adminFields: []),];
    for (const name of restrictedFields) {
      const expected = cleared.includes(name) ? fixture.expected[name]: before[name];
      assert.deepEqual(fixture.observations[0].state[name], expected, name);
      assert.deepEqual(clone(fixture.ui[name].value), expected, name);
    }
    assert.equal(fixture.ui.error.value.message, 'synthetic failure: eligible-configurations');
  });
}
test('repeated cleanup returns fresh nested defaults', async() => {
  const fixture = revokedFixture();
  await fixture.ui.refresh();
  const previousConnectorForm = fixture.ui.connectorForm.value;
  fixture.ui.connectorForm.value.tlsSecret.name = 'synthetic-secret-reference';
  fixture.ui.metadataForm.value.authorizationServers.push('https://previous.example');
  fixture.ui.identityForm.value.clientSecret = 'synthetic-test-value';
  fixture.ui.grant.value.subject = 'previous-private-subject';
  await fixture.ui.refresh();
  assert.deepEqual(snapshot(fixture.ui), fixture.expected);
  assert.notEqual(fixture.ui.connectorForm.value, previousConnectorForm);
  assert.equal(fixture.ui.error.value, null);
});
test('ordinary request and presentation state survives issuer/admin removal', async() => {
  const fixture = revokedFixture();
  fixture.ui.tab.value = 'presentation';
  fixture.ui.journey.value = { request: { requestId: principalId } };
  fixture.ui.answers.value = { answer: 'principal-answer' };
  fixture.ui.consent.value = true;
  fixture.ui.offer.value = { offerUrl: 'https://wallet.example/offer' };
  fixture.ui.presentation.value = { requestId: principalId };
  fixture.ui.presentationCode.value = 'principal-code';
  fixture.ui.presentationResult.value = { status: 'verified' };
  await fixture.ui.refresh();
  assert.deepEqual(snapshot(fixture.ui), fixture.expected);
  assert.equal(fixture.ui.journey.value.request.requestId, principalId);
  assert.deepEqual(fixture.ui.answers.value, { answer: 'principal-answer' });
  assert.equal(fixture.ui.consent.value, true);
  assert.equal(fixture.ui.offer.value.offerUrl, 'https://wallet.example/offer');
  assert.equal(fixture.ui.presentation.value.requestId, principalId);
  assert.equal(fixture.ui.presentationCode.value, 'principal-code');
  assert.deepEqual(fixture.ui.presentationResult.value, { status: 'verified' });
  assert.equal(fixture.ui.tab.value, 'presentation');
  assert.equal(fixture.ui.error.value, null);
});
