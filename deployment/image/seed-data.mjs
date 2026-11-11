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
// First-start seeding of the /data volume from the release baked into the image.
//
// The ORCE runtime keeps its state in /data (Node-RED user directory): the
// flow file, /data/node_modules with the dependencies of the Function nodes
// and node-red-contrib-uibuilder, and the uibuilder sources under
// /data/uibuilder/ui/src. A fresh volume is empty; an existing volume may hold
// a previous PCI release and other ORCE flows. This script brings /data to the
// release of the image and nothing else:
//   - /data/package.json and /data/node_modules: the production dependencies
//     copied from the image (resolved from package-lock.json at build time)
//     plus node-red-contrib-uibuilder at the recorded version, installed with
//     npm only when it is missing or at another version;
//   - the PCI flow merged into the flow file with the same rules as the hot
//     installer (automation/stage1/merge-flows.mjs): PCI tabs are replaced,
//     other flows are retained, id collisions fail the start;
//   - /data/uibuilder/ui/src: the files of dist/ui, previous PCI files removed;
//   - /data/fap-pci/install: the ownership record (node ids, UI files) and the
//     release marker, so the next start with the same release does nothing.
// It never reads or writes credentials, and it refuses to touch a flow file it
// cannot parse. It also prints the base image's entrypoint and command for the
// wrapper (--print-entrypoint, --print-command).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? true: all[index + 1]]);
  return pairs;
}, []));
const imageRoot = typeof args['image-root'] === 'string' ? args['image-root']: '/opt/fap-pci';
const dataDir = typeof args.data === 'string' ? args.data: '/data';

export function readLock(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index > 0) values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return values;
}
const shellQuote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
function jsonArray(value, name) {
  if (!value) throw new Error(`${name} is not recorded in base-image.lock; inspect the base image and fill the lock file`);
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(v => typeof v === 'string')) throw new Error(`${name} must be a JSON array of strings`);
  return parsed;
}
export function baseCommand(lock) {
  const entrypoint = jsonArray(lock.BASE_ENTRYPOINT, 'BASE_ENTRYPOINT');
  const cmd = lock.BASE_CMD ? jsonArray(lock.BASE_CMD, 'BASE_CMD'): [];
  if (!entrypoint.length && !cmd.length) throw new Error('base-image.lock records neither an entrypoint nor a command');
  return { entrypoint, cmd };
}

// Node-RED reads flowFile from settings.js; ORCE may ship its settings in the
// image or in /data. Default: flows.json in the user directory.
export function flowFileName(dataDir, settingsCandidates = [path.join(dataDir, 'settings.js'), '/usr/src/node-red/settings.js']) {
  for (const file of settingsCandidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const settings = createRequire(file)(file);
      if (typeof settings.flowFile === 'string' && settings.flowFile) return settings.flowFile;
    } catch {
      // A settings file that cannot be loaded outside Node-RED keeps the default.
    }
  }
  return 'flows.json';
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true, dereference: false });
}

export function seed({ imageRoot, dataDir, uibuilderVersion, log = console.log, npm = runNpm }) {
  const release = fs.readFileSync(path.join(imageRoot, 'VERSION'), 'utf8').trim();
  const commit = fs.existsSync(path.join(imageRoot, 'SOURCE_COMMIT')) ? fs.readFileSync(path.join(imageRoot, 'SOURCE_COMMIT'), 'utf8').trim(): 'unknown';
  const installDir = path.join(dataDir, 'fap-pci', 'install');
  const markerFile = path.join(installDir, 'image-release.json');
  const marker = readJson(markerFile, null);
  if (marker && marker.release === release && marker.commit === commit && marker.uibuilderVersion === uibuilderVersion) {
    log(JSON.stringify({ event: 'pci.image.seed', action: 'none', release, commit }));
    return { action: 'none', release };
  }
  fs.mkdirSync(installDir, { recursive: true });

  // 1. Dependencies: the image's node_modules (production dependencies from the lock file).
  const imagePackage = JSON.parse(fs.readFileSync(path.join(imageRoot, 'package.json'), 'utf8'));
  const dataPackageFile = path.join(dataDir, 'package.json');
  const dataPackage = readJson(dataPackageFile, { name: 'orce-data', private: true, dependencies: {} });
  dataPackage.dependencies = { ...(dataPackage.dependencies || {}), ...imagePackage.dependencies };
  for (const name of Object.keys(imagePackage.dependencies)) {
    const target = path.join(dataDir, 'node_modules', name);
    fs.rmSync(target, { recursive: true, force: true });
    copyDirectory(path.join(imageRoot, 'node_modules', name), target);
  }
  // Transitive dependencies of the production set travel with them.
  for (const entry of fs.readdirSync(path.join(imageRoot, 'node_modules'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const target = path.join(dataDir, 'node_modules', entry.name);
    if (!fs.existsSync(target)) copyDirectory(path.join(imageRoot, 'node_modules', entry.name), target);
  }
  // 2. uibuilder at the recorded version, installed only when absent or different.
  const uibuilderPackage = path.join(dataDir, 'node_modules', 'node-red-contrib-uibuilder', 'package.json');
  const installed = fs.existsSync(uibuilderPackage) ? JSON.parse(fs.readFileSync(uibuilderPackage, 'utf8')).version: null;
  if (installed !== uibuilderVersion) {
    dataPackage.dependencies['node-red-contrib-uibuilder'] = uibuilderVersion;
    fs.writeFileSync(dataPackageFile, JSON.stringify(dataPackage, null, 2) + '\n');
    npm(['install', '--save-exact', '--no-audit', '--no-fund', '--omit=dev', `node-red-contrib-uibuilder@${uibuilderVersion}`], dataDir);
  } else {
    fs.writeFileSync(dataPackageFile, JSON.stringify(dataPackage, null, 2) + '\n');
  }

  // 3. Flows: merge the PCI flow into the flow file (same rules as the hot installer).
  const flowFile = path.join(dataDir, flowFileName(dataDir));
  const existing = fs.existsSync(flowFile) ? JSON.parse(fs.readFileSync(flowFile, 'utf8')): [];
  if (!Array.isArray(existing)) throw new Error(`${flowFile} is not a flow array; refusing to seed`);
  const incomingFile = path.join(imageRoot, 'dist', 'fap-pci-flow.json');
  const incoming = JSON.parse(fs.readFileSync(incomingFile, 'utf8'));
  const existingFile = path.join(installDir, 'flows.before-seed.json');
  fs.writeFileSync(existingFile, JSON.stringify(existing));
  const mergedFile = path.join(installDir, 'flows.merged.json');
  execFileSync(process.execPath, [path.join(imageRoot, 'merge-flows.mjs'), '--existing', existingFile, '--incoming', incomingFile, '--output', mergedFile], { stdio: 'inherit' });
  const previous = readJson(path.join(installDir, 'flows.json'), { version: 1, nodes: [] });
  const ownership = { version: 1, nodes: [...new Set([...(previous.nodes || []), ...incoming.map(node => node.id)])].sort() };
  fs.copyFileSync(mergedFile, flowFile);
  fs.writeFileSync(path.join(installDir, 'flows.json'), JSON.stringify(ownership, null, 2) + '\n');
  fs.rmSync(mergedFile, { force: true });

  // 4. UI: the files of dist/ui replace the previous PCI files; foreign files stay.
  const uiDir = path.join(dataDir, 'uibuilder', 'ui', 'src');
  fs.mkdirSync(uiDir, { recursive: true });
  const previousUi = readJson(path.join(installDir, 'ui.json'), { version: 1, files: [] });
  for (const name of previousUi.files || []) fs.rmSync(path.join(uiDir, name), { force: true });
  const uiFiles = fs.readdirSync(path.join(imageRoot, 'dist', 'ui')).filter(name => fs.statSync(path.join(imageRoot, 'dist', 'ui', name)).isFile()).sort();
  for (const name of uiFiles) fs.copyFileSync(path.join(imageRoot, 'dist', 'ui', name), path.join(uiDir, name));
  fs.writeFileSync(path.join(installDir, 'ui.json'), JSON.stringify({ version: 1, files: uiFiles }, null, 2) + '\n');

  // 5. Release marker.
  fs.writeFileSync(markerFile, JSON.stringify({ release, commit, uibuilderVersion, seededAt: new Date().toISOString() }, null, 2) + '\n');
  // 6. Ownership: the ORCE base image starts as root and its entrypoint runs Node-RED as
  // the owner of /data; files written here as root are handed to that owner.
  const touched = [dataPackageFile, flowFile, uiDir, installDir, ...Object.keys(imagePackage.dependencies).map(n => path.join(dataDir, 'node_modules', n))];
  handOver(dataDir, touched);
  log(JSON.stringify({ event: 'pci.image.seed', action: marker ? 'upgrade': 'install', release, commit, flowFile: path.basename(flowFile), nodes: incoming.length, uiFiles: uiFiles.length }));
  return { action: marker ? 'upgrade': 'install', release, flowFile };
}
export function handOver(dataDir, paths, { getuid = process.getuid, chown = fs.chownSync, owner = dir => fs.statSync(dir) } = {}) {
  if (typeof getuid !== 'function' || getuid() !== 0) return 0;
  const { uid, gid } = owner(dataDir);
  if (uid === 0) return 0;
  let count = 0;
  const visit = target => {
    if (!fs.existsSync(target)) return;
    chown(target, uid, gid);
    count += 1;
    const stat = fs.lstatSync(target);
    if (stat.isDirectory()) for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
  };
  for (const target of paths) visit(target);
  return count;
}
function runNpm(npmArgs, cwd) {
  execFileSync('npm', npmArgs, { cwd, stdio: 'inherit' });
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const lock = readLock(path.join(imageRoot, 'base-image.lock'));
  if (args['print-entrypoint']) {
    process.stdout.write(baseCommand(lock).entrypoint.map(shellQuote).join(' ') + '\n');
  } else if (args['print-command']) {
    const { entrypoint, cmd } = baseCommand(lock);
    process.stdout.write([...entrypoint, ...cmd].map(shellQuote).join(' ') + '\n');
  } else {
    seed({ imageRoot, dataDir, uibuilderVersion: process.env.FAP_PCI_UIBUILDER_VERSION || lock.UIBUILDER_VERSION || '7.5.0' });
  }
}
