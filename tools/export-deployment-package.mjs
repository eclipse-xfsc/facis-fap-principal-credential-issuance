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
// Generates the PCI deployment package for eclipse-xfsc/deployment (directory PCI/)
// from the committed source, so that the deployment repository receives the
// deployment content of a release mechanically instead of by hand
// (FR-PCI-51, 74, 85, 92).
//
// Usage: node tools/export-deployment-package.mjs --out <deployment-checkout>/PCI
//          [--application-image <ref@sha256:...>] [--participant-image <ref@sha256:...>]
//          [--commit <sha>]   (default: git rev-parse HEAD; the tree must be clean)
//
// The package contains the files of PACKAGE_FILES, unchanged except for:
//   - Markdown links to files that are not in the package become links to the same
//     file at the source commit in the PCI repository;
//   - the ArgoCD example points at eclipse-xfsc/deployment and the chart path under PCI/;
// and adds README.md (from tools/deployment-package/README.md.template), SOURCE.json (source
// commit, version, image references, the hash of every file as taken from the
// source), deployment/images.json and deployment-sha256.txt. The output directory
// is replaced completely, so files removed from the list disappear from the package.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const PACKAGE_FILES = [
  'LICENSE.txt',
  'NOTICE.md',
  'THIRD_PARTY_NOTICES.md',
  'VERSION',
  'automation/flows/lifecycle.js',
  'automation/flows/pci-deployment.json',
  'automation/lifecycle.example.json',
  'automation/stage1/artifacts.mjs',
  'automation/stage1/check-tenant-removal.mjs',
  'automation/stage1/helper-cleanup.py',
  'automation/stage1/install.sh',
  'automation/stage1/merge-flows.mjs',
  'automation/stage1/restore-runtime.mjs',
  'contracts/envoy-release.json',
  'contracts/integration-lock.json',
  'contracts/ocm-12.3.9-assessment.json',
  'deployment/argocd/participant-application.example.yaml',
  'deployment/helm/fap-pci/Chart.yaml',
  'deployment/helm/fap-pci/templates/resources.yaml',
  'deployment/helm/fap-pci/values.schema.json',
  'deployment/helm/fap-pci/values.yaml',
  'deployment/helm/observability/Chart.yaml',
  'deployment/helm/observability/templates/runtime.yaml',
  'deployment/helm/observability/values.yaml',
  'deployment/helm/participant/Chart.yaml',
  'deployment/helm/participant/templates/runtime.yaml',
  'deployment/helm/participant/values.yaml',
  'deployment/observability/collector.yaml',
  'deployment/observability/prometheus.yaml',
  'deployment/prerequisites/all-hop-tls/README.md',
  'deployment/prerequisites/all-hop-tls/mesh.yaml',
  'deployment/prerequisites/ocm-owner-keycloak-policy.yaml',
  'dist/fap-pci-flow.json',
  'dist/ground-zero.sh',
  'dist/ui/THIRD_PARTY_LICENSES.txt',
  'dist/ui/facis-logo.svg',
  'dist/ui/index.css',
  'dist/ui/index.html',
  'dist/ui/index.js',
  'dist/ui/vue.global.prod.js',
  'docs/operations/argocd.md',
  'docs/operations/automation.md',
  'docs/operations/backup-rollback.md',
  'docs/operations/deployment.md',
  'docs/operations/identity.md',
  'docs/operations/neutral-configuration.md',
  'docs/operations/observability.md',
  'docs/operations/runbook.md',
  'docs/operations/transport.md',
  'docs/operations/troubleshooting.md',
  'docs/testing/participant-test.md',
  'reference/participant-data-source/flows.json',
  'reference/participant-data-source/records.example.json',
  'scripts/collect-privacy-captures.py',
  'scripts/configure-entra.py',
  'scripts/configure-test-source.py',
  'scripts/deploy-observability.py',
  'scripts/deploy-participant.py',
  'scripts/deploy-test-source.py',
  'scripts/deploy.sh',
  'scripts/import-legacy-baseline.py',
  'scripts/install-with-retries.py',
  'scripts/lifecycle.py',
  'scripts/participant-secret.sh',
  'scripts/preflight.sh',
  'scripts/privacy-audit.py',
  'scripts/reconcile-participant-ownership.py',
  'scripts/record-deployment.py',
  'scripts/runtime_ownership.py',
  'scripts/uninstall.sh',
  'scripts/upgrade-artifacts.sh',
  'tools/prepare-all-hop-tls.py'
];
const SOURCE_REPOSITORY = 'https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance';
const DIGEST = /^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
// Rewrites relative Markdown links whose target is not part of the package.
export function rewriteLinks(text, file, included, commit) {
  return text.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (match, target) => {
    const [targetPath, anchor] = target.split('#');
    if (!targetPath) return match;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), targetPath));
    if (included.has(resolved)) return match;
    return `](${SOURCE_REPOSITORY}/blob/${commit}/${resolved}${anchor ? '#' + anchor: ''})`;
  });
}
export function adaptArgoExample(text) {
  return text.replace(/repoURL: \S+/, 'repoURL: https://github.com/eclipse-xfsc/deployment.git').replace(
    /path: deployment\/helm\/participant\b/, 'path: PCI/deployment/helm/participant');
}
export function exportPackage({ root = process.cwd(), out, commit, applicationImage = null, participantImage = null }) {
  for (const image of [applicationImage, participantImage]) if (image && !DIGEST.test(image)) throw new Error(
    'Image references must be pinned by digest (<ref>@sha256:<64 hex>): ' + image);
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const included = new Set(PACKAGE_FILES);
  for (const file of PACKAGE_FILES) if (!fs.existsSync(path.join(root, file))) throw new Error('Package file missing in the source: ' +
    file);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const upstreamFiles = {},
  adapted = [];
  for (const file of PACKAGE_FILES) {
    const source = fs.readFileSync(path.join(root, file));
    upstreamFiles[file] = sha256(source);
    let data = source;
    if (file.endsWith('.md')) {
      const text = rewriteLinks(source.toString('utf8'), file, included, commit);
      if (text !== source.toString('utf8')) adapted.push(file);
      data = Buffer.from(text);
    } else if (file === 'deployment/argocd/participant-application.example.yaml') {
      data = Buffer.from(adaptArgoExample(source.toString('utf8')));
      adapted.push(file);
    }
    const target = path.join(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    fs.chmodSync(target, fs.statSync(path.join(root, file)).mode & 0o777);
  }
  const readme = fs.readFileSync(path.join(root, 'tools/deployment-package/README.md.template'), 'utf8').replaceAll('{{VERSION}}', version)
    .replaceAll('{{COMMIT}}', commit).replaceAll('{{SOURCE}}', SOURCE_REPOSITORY);
  fs.writeFileSync(path.join(out, 'README.md'), readme);
  const images = {
    $comment: 'Images of this release, pinned by digest. Filled from the Images workflow run on the release candidate tag; null until then.',
    version,
    application: applicationImage,
    participant: participantImage
  };
  fs.writeFileSync(path.join(out, 'deployment/images.json'), JSON.stringify(images, null, 2) + '\n');
  const record = {
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit: commit,
    runtimeVersion: version,
    destination: 'eclipse-xfsc/deployment/PCI/',
    requirements: ['FR-PCI-51', 'FR-PCI-74', 'FR-PCI-85', 'FR-PCI-92'],
    generator: 'tools/export-deployment-package.mjs',
    adaptations: {
      markdownLinks: adapted.filter(f => f.endsWith('.md')),
      argocdExample: 'repoURL and chart path point at eclipse-xfsc/deployment/PCI'
    },
    newFiles: ['README.md', 'SOURCE.json', 'deployment/images.json', 'deployment-sha256.txt'],
    upstreamFiles
  };
  fs.writeFileSync(path.join(out, 'SOURCE.json'), JSON.stringify(record, null, 2) + '\n');
  const all = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(out, dir), { withFileTypes: true })) {
      const rel = dir ? dir + '/' + entry.name: entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (rel !== 'deployment-sha256.txt') all.push(rel);
    }
  };
  walk('');
  all.sort();
  fs.writeFileSync(path.join(out, 'deployment-sha256.txt'), all.map(f => sha256(fs.readFileSync(path.join(out, f))) + '  ' + f).join(
    '\n') + '\n');
  return { version, commit, files: all.length + 1, adapted: adapted.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []));
  if (!args.out) throw new Error(
    'Usage: node tools/export-deployment-package.mjs --out <deployment-checkout>/PCI [--application-image REF] ' +
    '[--participant-image REF] [--commit SHA]');
  let commit = args.commit;
  if (!commit) {
    if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error(
      'The source tree has uncommitted changes; export from a clean checkout of the tag.');
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  }
  console.log(JSON.stringify(exportPackage({
    out: path.resolve(args.out),
    commit,
    applicationImage: args['application-image'] || null,
    participantImage: args['participant-image'] || null
  })));
}
