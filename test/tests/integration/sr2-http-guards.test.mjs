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
// Characterisation tests for the SR2 transport wrapper (backend/sr2/http.js,
// handleSr2): the request checks, principal resolution, dispatch statuses and
// error mapping as the baseline performs them, recorded before the handler is
// split into smaller functions. They complement sr2-http.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, configuration, alpha } from '../../support/sr2-fixture.mjs';
import { httpHarness } from '../../support/sr2-http.mjs';
const base = '/api/v1/tenants/' + alpha;
test('authority headers must be single, string-valued and consistent with the routed tenant', async() => {
  const http = httpHarness(fixture());
  assert.equal((await http(base + '/credential-configurations', { headers: { 'x-pci-tenant-slug': ['alpha', 'beta'] } })).status, 403);
  assert.equal((await http(base + '/credential-configurations', { rawHeaders: ['Cookie', 'a=1', 'cookie', 'b=2'] })).status, 403);
  assert.equal((await http(base + '/credential-configurations', { headers: { 'x-pci-tenant-slug': 'beta' } })).status, 404);
  assert.equal((await http(base + '/credential-configurations', { headers: { 'x-pci-tenant-domain': 'beta-pci.example.com' } })).status,
    404);
  assert.equal((await http(base + '/credential-configurations', { rawHeaders: ['Accept', 'a', 'accept', 'b'] })).status, 200,
    'duplicates of non-authority headers are allowed');
});
test('state-changing requests must come from the same site with a JSON body of bounded size', async() => {
  const http = httpHarness(fixture());
  assert.equal((await http(base + '/credential-configurations',
    { method: 'POST', body: { data: configuration() }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await http(base + '/credential-configurations', {
    method: 'POST',
    body: { data: configuration() },
    headers: { 'sec-fetch-site': 'same-origin', origin: 'https://alpha-pci.example.com' }
  })).status, 201);
  // Each creation below uses its own identifier: the same identifier twice in one tenant is a 409.
  const wrongType = await http(base + '/credential-configurations',
    { method: 'POST', body: { data: configuration() }, headers: { 'content-type': 'application/xml' } });
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.detail, 'Use application/json.');
  assert.equal((await http(base + '/credential-configurations', {
    method: 'POST',
    body: { data: configuration('Visitor') },
    headers: { 'content-type': 'Application/JSON; charset=utf-8' }
  })).status, 201, 'the media type is compared case-insensitively');
  assert.equal((await http(base + '/credential-configurations', { method: 'POST', body: { data: configuration('Visitor') } })).status, 409);
  const large = await http(base + '/credential-configurations', { method: 'POST', body: { data: { ...configuration('Large'), note: 'x'
    .repeat(1500001) } } });
  assert.equal(large.status, 413);
  assert.equal(large.body.code, 'PCI-SR2-SIZE');
  assert.equal((await http(base + '/credential-configurations', { headers: { origin: 'https://attacker.example.com' } })).status, 200,
    'GET requests are not subject to the origin check');
});
test('If-Match is read only as a quoted positive integer and the response carries the version as ETag', async() => {
  const http = httpHarness(fixture());
  const created = await http(base + '/credential-configurations', { method: 'POST', body: { data: configuration() } });
  assert.equal(created.status, 201);
  assert.equal(created.headers.etag, '"1"');
  assert.equal(created.headers['cache-control'], 'no-store');
  const id = created.body.item.id,
  update = { method: 'PATCH', body: { data: { ...created.body.item.draft, name: 'Renamed' } } };
  for (const tag of ['1', '"0"', '"01"', 'W/"1"', '"1.0"', '"x"']) assert.equal((await http(base + '/credential-configurations/' + id,
    { ...update, headers: { 'if-match': tag } })).status, 428, 'If-Match ' + tag);
  assert.equal((await http(base + '/credential-configurations/' + id, { ...update, headers: { 'if-match': '"2"' } })).status, 412);
  const saved = await http(base + '/credential-configurations/' + id, { ...update, headers: { 'if-match': '"1"' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.etag, '"2"');
  const list = await http(base + '/credential-configurations');
  assert.equal(list.status, 200);
  assert.equal(list.headers.etag, undefined, 'collections carry no ETag');
});
test('dispatch statuses: 201 for creations and started requests, 400 for missing fields, 404 for unknown resources', async() => {
  const f = fixture(),
  { config } = await f.prepared(),
  http = httpHarness(f, 'principal');
  const started = await http(base + '/issuance-requests', { method: 'POST', body: { configurationId: config
    .id }, headers: { 'idempotency-key': 'k-1' } });
  assert.equal(started.status, 400, 'an idempotency key shorter than 16 characters is refused');
  const key = 'k-' + 'a'.repeat(30);
  const first = await http(base + '/issuance-requests', { method: 'POST', body: { configurationId: config
    .id }, headers: { 'idempotency-key': key } });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const again = await http(base + '/issuance-requests', { method: 'POST', body: { configurationId: config
    .id }, headers: { 'idempotency-key': key } });
  assert.equal(again.status, 201);
  assert.equal(again.body.request.requestId, first.body.request.requestId, 'the idempotency key is passed to the service');
  assert.equal((await http(base + '/issuance-requests', { method: 'POST', body: {} })).status, 400, 'configurationId is required');
  const admin = httpHarness(f);
  assert.equal((await admin(base + '/credential-configurations/00000000-0000-4000-8000-000000000000')).status, 404);
  const revoke = await admin(base + '/credential-configurations/' + config.id + '/revocations',
    { method: 'POST', body: { requestId: 'r' } });
  assert.equal(revoke.status, 400, 'confirmed is required');
  assert.equal(revoke.body.code, 'PCI-SR2-VALIDATION');
});
test('internal routes need the service token from an allowed address and never a public request marker', async() => {
  const http = httpHarness(fixture());
  for (const path of ['/offers', '/offers/00000000-0000-4000-8000-000000000000', '/publication', '/metadata']) {
    const r = await http('/api/v1/internal/tenants/' + alpha + path, {
      method: path.includes('/offers/') ? 'GET': 'POST',
      body: {},
      headers: { authorization: 'Bearer not-an-active-token' }
    }).catch(e => ({ status: 'route', body: e.message }));
    if (r.status === 'route') continue;
    assert.equal(r.status, 401, path);
  }
});
test('service errors are mapped to problem responses with their code and status; other errors become 500', async() => {
  const f = fixture(),
  http = httpHarness(f);
  f.api.list = async() => {
    throw new Error('database handle leaked into message');
  };
  const internal = await http(base + '/credential-configurations');
  assert.equal(internal.status, 500);
  assert.equal(JSON.stringify(internal.body).includes('database handle'), false);
  f.api.list = async() => {
    const e = new Error('upstream unavailable');
    e.status = 503;
    e.code = 'PCI-X';
    throw e;
  };
  const plain = await http(base + '/credential-configurations');
  assert.equal(plain.status, 503, 'errors with a status that are not Sr2Errors pass through emitError unchanged');
});
