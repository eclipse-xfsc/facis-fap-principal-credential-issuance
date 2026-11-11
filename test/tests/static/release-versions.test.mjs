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
// Every site that states the release version must state VERSION; a release pull
// request that forgets one fails here instead of in a deployment.
test('ground-zero, charts and installers state the release version', () => {
  const version = fs.readFileSync('VERSION', 'utf8').trim();
  const g0 = fs.readFileSync('automation/stage1/ground-zero.sh', 'utf8');
  assert.match(g0, new RegExp(`^VERSION="${version.replaceAll('.', '\\.')}"$`, 'm'));
  assert.match(g0, new RegExp(`FACIS FAP PCI ground-zero ${version.replaceAll('.', '\\.')}`));
  assert.deepEqual([...new Set([...g0.matchAll(/0\.5\.0-rc\.\d+(?!-)/g)].map(m => m[0]))], [version],
    'no other release version in ground-zero');
  for (const chart of ['fap-pci', 'observability', 'participant']) {
    const text = fs.readFileSync(`deployment/helm/${chart}/Chart.yaml`, 'utf8');
    assert.match(text, new RegExp(`^version: ${version.replaceAll('.', '\\.')}$`, 'm'), chart);
    assert.match(text, new RegExp(`^appVersion: ${version.replaceAll('.', '\\.')}$`, 'm'), chart);
  }
  assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).version, version);
  const helper = fs.readFileSync('scripts/install-with-retries.py', 'utf8');
  assert.match(helper, new RegExp(`REVIEWED_VERSIONS = \\{[^}]*"${version.replaceAll('.', '\\.')}"`),
    'install-with-retries reviewed for this version');
});
