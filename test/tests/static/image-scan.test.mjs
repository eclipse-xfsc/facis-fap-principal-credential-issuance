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
import { compare } from '../../../tools/check-image-scan.mjs';
const report = (...vulns) => ({ Results: [{ Target: 'image', Vulnerabilities: vulns }] });
const v = (id, pkg, severity = 'HIGH', version = '1.0') => (
  { VulnerabilityID: id, PkgName: pkg, InstalledVersion: version, Severity: severity });
test('the image scan fails only on high or critical findings added above the base image', () => {
  const base = report(v('CVE-1', 'libc', 'CRITICAL'), v('CVE-2', 'openssl', 'LOW'));
  assert.equal(compare(base, report(v('CVE-1', 'libc', 'CRITICAL'), v('CVE-3', 'curl', 'MEDIUM'))).status, 'PASS');
  const added = compare(base, report(v('CVE-1', 'libc', 'CRITICAL'), v('CVE-4', 'pg', 'HIGH')));
  assert.equal(added.status, 'FAIL');
  assert.deepEqual(added.added.map(f => f.id), ['CVE-4']);
  assert.deepEqual(added.baseFindings.map(f => f.id), ['CVE-1']);
});
test('exceptions accept a named finding and go stale when it disappears', () => {
  const base = report();
  const exceptions = [{ id: 'CVE-4', pkg: 'pg', reason: 'no fixed version', issue: '#1' }];
  const accepted = compare(base, report(v('CVE-4', 'pg', 'HIGH')), exceptions);
  assert.equal(accepted.status, 'PASS');
  assert.equal(accepted.acceptedExceptions[0].issue, '#1');
  const stale = compare(base, report(), exceptions);
  assert.equal(stale.status, 'FAIL');
  assert.match(stale.stale[0], /no longer has/);
  assert.equal(compare(base, report(v('CVE-4', 'pg', 'HIGH', '2.0')), exceptions).status, 'PASS',
    'an exception covers every version of the package');
});
