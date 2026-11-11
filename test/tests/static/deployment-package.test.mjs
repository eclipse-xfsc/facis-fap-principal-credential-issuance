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
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  exportPackage,
  rewriteLinks,
  adaptArgoExample,
  PACKAGE_FILES
} from '../../../tools/export-deployment-package.mjs';
const commit = '0123456789abcdef0123456789abcdef01234567';
test('the deployment package is complete, verifiable and records its source', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pci-deploy-')), 'PCI');
  const result = exportPackage({ out, commit });
  assert.equal(result.files, PACKAGE_FILES.length + 4);
  const record = JSON.parse(fs.readFileSync(path.join(out, 'SOURCE.json'), 'utf8'));
  assert.equal(record.sourceCommit, commit);
  assert.equal(record.runtimeVersion, fs.readFileSync('VERSION', 'utf8').trim());
  for (const file of PACKAGE_FILES) {
    assert.equal(record.upstreamFiles[file], crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), file);
    if (!file.endsWith('.md') && !file.includes('argocd')) assert.ok(fs.readFileSync(path.join(out, file)).equals(fs.readFileSync(file)),
      file);
  }
  for (const line of fs.readFileSync(path.join(out, 'deployment-sha256.txt'), 'utf8').trim().split('\n')) {
    const [hash, file] = line.split('  ');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out, file))).digest('hex'), hash, file);
  }
  assert.match(fs.readFileSync(path.join(out, 'README.md'), 'utf8'), new RegExp(commit));
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'deployment/images.json'), 'utf8')).application, null);
  assert.equal(fs.statSync(path.join(out, 'dist/ground-zero.sh')).mode & 0o111, fs.statSync('dist/ground-zero.sh').mode & 0o111);
});
test('every relative link of the packaged documentation resolves inside the package or points at the source commit', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pci-deploy-')), 'PCI');
  exportPackage({ out, commit });
  for (const file of PACKAGE_FILES.filter(f => f.endsWith('.md')).concat(['README.md'])) {
    const text = fs.readFileSync(path.join(out, file), 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const resolved = path.join(out, path.dirname(file), target.split('#')[0]);
      assert.ok(fs.existsSync(resolved), `${file}: ${target}`);
    }
  }
  assert.equal(rewriteLinks('[a](../release/x.md#y) [b](runbook.md)', 'docs/operations/deployment.md', new Set(
    ['docs/operations/runbook.md']), commit),
    `[a](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/blob/${commit}/docs/release/x.md#y) [b](runbook.md)`);
});
test('the ArgoCD example points at the deployment repository and images must be pinned by digest', () => {
  assert.match(adaptArgoExample('repoURL: https://example.invalid/x.git\n    path: deployment/helm/participant\n'),
    /eclipse-xfsc\/deployment\.git[\s\S]*PCI\/deployment\/helm\/participant/);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pci-deploy-')), 'PCI');
  assert.throws(() => exportPackage({ out, commit, applicationImage: 'registry.example/fap-pci:latest' }), /pinned by digest/);
  const image = 'registry.example/xfsc/fap-pci@sha256:' + 'a'.repeat(64);
  exportPackage({ out, commit, applicationImage: image });
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'deployment/images.json'), 'utf8')).application, image);
});
