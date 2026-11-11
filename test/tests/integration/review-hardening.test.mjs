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
import crypto from 'node:crypto';
import { pciHolderProof } from '../../../backend/sr2/native.js';
import { sr2AuthorizePrincipal, sr2CheckVersion } from '../../../backend/sr2/service-policy.js';
import { fixture, alpha } from '../../support/sr2-fixture.mjs';
import { httpHarness } from '../../support/sr2-http.mjs';
const binding = { nonce: 'ephemeral-test-nonce', issuer: 'https://issuer.example.com' };
const now = 1700000000000;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function signedProof(modifyHeader = () => {}, modifyClaims = () => {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const header = { typ: 'openid4vci-proof+jwt', alg: 'ES256', jwk: publicKey.export({ format: 'jwk' }) };
  const claims = { aud: binding.issuer, nonce: binding.nonce, iat: now / 1000 };
  modifyHeader(header);
  modifyClaims(claims);
  const input = encode(header) + '.' + encode(claims);
  return input + '.' + crypto.sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
for (const [label, header, claims] of [
  ['null header', null, {}],
  ['array header', [], {}],
  ['null claims', { typ: 'openid4vci-proof+jwt', jwk: {} }, null],
  ['array claims', { typ: 'openid4vci-proof+jwt', jwk: {} }, []],
  [
    'malformed public key',
    { typ: 'openid4vci-proof+jwt', alg: 'ES256', jwk: { kty: 'EC', crv: 'P-256', x: 'bad', y: 'bad' } },
    { aud: binding.issuer, nonce: binding.nonce, iat: now / 1000 }
  ]
]) test('malformed holder proof returns a controlled client error: ' + label, () => {
  assert.throws(() => pciHolderProof(encode(header) + '.' + encode(claims) + '.AAAA', binding, now), e => e.status === 400);
});
test('holder proof accepts a correctly signed public-only ES256 key', () => {
  assert.equal(pciHolderProof(signedProof(), binding, now).jwk.kty, 'EC');
});
for (const property of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']) test('holder proof rejects any private-key field: ' + property, () =>
{
  assert.throws(() => pciHolderProof(signedProof(h => {
    h.jwk[property] = '';
  }), binding, now), e => e.status === 400);
});
test('holder proof rejects unsupported critical headers even with an empty value', () => {
  assert.throws(() => pciHolderProof(signedProof(h => {
    h.crit = null;
  }), binding, now), e => e.status === 400);
});
test('holder proof rejects signed claims for another issuer or stale nonce', () => {
  for (const update of [c => {
    c.aud = 'https://other.example';
  }, c => {
    c.nonce = 'different';
  }, c => {
    c.iat -= 600;
  }])
  assert.throws(() => pciHolderProof(signedProof(() => {}, update), binding, now), e => e.status === 400);
});
for (const roles of [undefined, null, 'participant_tenant_admin', {}]) test(
  'authorization rejects invalid role claims rather than throwing an uncontrolled error: ' + String(roles), async() => {
  const f = fixture();
  const p = { ...f.principal(), roles };
  await assert.rejects(() => f.store.transaction(alpha, tx => sr2AuthorizePrincipal(tx, p)), e => e.status === 403);
});
test('version policy preserves optimistic-concurrency semantics', () => {
  assert.throws(() => sr2CheckVersion({ version: 2 }, undefined), e => e.status === 428);
  assert.throws(() => sr2CheckVersion({ version: 2 }, 1), e => e.status === 412);
  assert.doesNotThrow(() => sr2CheckVersion({ version: 2 }, 2));
});
for (const contentType of ['application/jsonp', 'application/json-invalid', 'application/jsonfoo;charset=utf-8']) test(
  'HTTP wrapper rejects lookalike JSON media types: ' + contentType, async() => {
  const f = fixture();
  const result = await httpHarness(f)('/api/v1/tenants/' + alpha + '/credential-configurations',
    { method: 'POST', headers: { 'content-type': contentType }, body: { data: {} } });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'VALIDATION');
});
