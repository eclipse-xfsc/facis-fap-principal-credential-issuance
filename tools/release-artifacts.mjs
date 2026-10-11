import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Bind acceptance to every shipped runtime, deployment, contract and build input,
// including the participant service and its independently imported record flow.
// Evidence and generated reports are deliberately outside this set.
const directories = ['.github', 'automation', 'backend', 'contracts', 'deployment', 'dist', 'docs', 'reference', 'scripts', 'shared', 'src', 'tools', 'vendor', 'test'];
const files = ['VERSION', 'build.js', 'package.json', 'package-lock.json', 'Makefile', 'mkdocs.yml', 'README.md', 'LICENSE.txt', 'NOTICE.md', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', '.gitignore'];
const reports = new Set(['docs/release/artifacts.json','docs/release/source-sha256.txt','docs/release/validation.json','docs/release/upstream-validation.json','docs/release/acceptance.json']);
export function releaseArtifacts(root) {
  const walk = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter(entry => !['node_modules', 'gen', 'wirepb', '__pycache__'].includes(entry.name))
    .flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  return Object.fromEntries([...files, ...directories.flatMap(walk)].filter(file=>!reports.has(file)).sort().map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
}
