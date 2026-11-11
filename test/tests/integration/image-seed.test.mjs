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
import {
  seed,
  readLock,
  baseCommand,
  flowFileName,
  handOver
} from '../../../deployment/image/seed-data.mjs';
// A fake image root: the files the Dockerfile stages under /opt/fap-pci.
function imageRoot(dir, { release = '0.5.0-test', commit = 'abc' } = {}) {
  const root = path.join(dir, 'image');
  fs.mkdirSync(path.join(root, 'dist', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'pg'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'pg-types'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pg', 'package.json'), JSON.stringify({ name: 'pg', version: '8.16.3' }));
  fs.writeFileSync(path.join(root, 'node_modules', 'pg-types', 'package.json'), JSON.stringify({ name: 'pg-types', version: '1.0.0' }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { pg: '8.16.3' } }));
  fs.writeFileSync(path.join(root, 'VERSION'), release + '\n');
  fs.writeFileSync(path.join(root, 'SOURCE_COMMIT'), commit + '\n');
  fs.copyFileSync('automation/stage1/merge-flows.mjs', path.join(root, 'merge-flows.mjs'));
  fs.copyFileSync('dist/fap-pci-flow.json', path.join(root, 'dist', 'fap-pci-flow.json'));
  for (const name of ['index.html', 'index.js']) fs.writeFileSync(path.join(root, 'dist', 'ui', name), name + ' ' + release);
  return root;
}
const flow = () => JSON.parse(fs.readFileSync('dist/fap-pci-flow.json', 'utf8'));
test('a fresh volume receives dependencies, uibuilder, the PCI flow, the UI and the ownership record', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-seed-')),
  root = imageRoot(dir),
  data = path.join(dir, 'data');
  const npmCalls = [];
  const result = seed({
    imageRoot: root,
    dataDir: data,
    uibuilderVersion: '7.5.0',
    log() {},
    npm: (a, cwd) => {
      npmCalls.push({ a, cwd });
      fs.mkdirSync(path.join(cwd, 'node_modules', 'node-red-contrib-uibuilder'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'node_modules', 'node-red-contrib-uibuilder', 'package.json'), JSON.stringify({ version: '7.5.0' }));
    }
  });
  assert.equal(result.action, 'install');
  assert.deepEqual(npmCalls[0].a.at(- 1), 'node-red-contrib-uibuilder@7.5.0');
  assert.equal(npmCalls[0].cwd, data);
  assert.ok(fs.existsSync(path.join(data, 'node_modules', 'pg', 'package.json')));
  assert.ok(fs.existsSync(path.join(data, 'node_modules', 'pg-types', 'package.json')), 'transitive dependencies travel');
  const pkg = JSON.parse(fs.readFileSync(path.join(data, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies.pg, '8.16.3');
  assert.equal(pkg.dependencies['node-red-contrib-uibuilder'], '7.5.0');
  const flows = JSON.parse(fs.readFileSync(path.join(data, 'flows.json'), 'utf8'));
  assert.equal(flows.length, flow().length);
  assert.equal(fs.readFileSync(path.join(data, 'uibuilder', 'ui', 'src', 'index.js'), 'utf8'), 'index.js 0.5.0-test');
  const ownership = JSON.parse(fs.readFileSync(path.join(data, 'fap-pci', 'install', 'flows.json'), 'utf8'));
  assert.equal(ownership.nodes.length, flow().length);
  const marker = JSON.parse(fs.readFileSync(path.join(data, 'fap-pci', 'install', 'image-release.json'), 'utf8'));
  assert.equal(marker.release, '0.5.0-test');
  // Same release again: nothing happens, no npm call.
  const again = seed({
    imageRoot: root,
    dataDir: data,
    uibuilderVersion: '7.5.0',
    log() {},
    npm: () => assert.fail('npm must not run')
  });
  assert.equal(again.action, 'none');
});
test('an existing volume keeps foreign flows and its uibuilder, replaces PCI tabs and previous UI files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-seed-')),
  root = imageRoot(dir),
  data = path.join(dir, 'data');
  fs.mkdirSync(path.join(data, 'uibuilder', 'ui', 'src'), { recursive: true });
  fs.mkdirSync(path.join(data, 'node_modules', 'node-red-contrib-uibuilder'), { recursive: true });
  fs.writeFileSync(path.join(data, 'node_modules', 'node-red-contrib-uibuilder', 'package.json'), JSON.stringify({ version: '7.5.0' }));
  fs.writeFileSync(path.join(data, 'package.json'), JSON.stringify(
    { dependencies: { 'node-red-contrib-uibuilder': '7.5.0', other: '1.0.0' } }));
  const foreign = { id: 'foreign-tab', type: 'tab', label: 'Operator flows' },
  foreignNode = { id: 'foreign-node', type: 'inject', z: 'foreign-tab' };
  const oldPci = flow().map(node => node.type === 'tab' ? { ...node, info: 'old' }: node);
  fs.writeFileSync(path.join(data, 'flows.json'), JSON.stringify([
    foreign,
    foreignNode,
    ...oldPci,
    { id: 'stale-pci', type: 'comment', z: oldPci.find(n => n.type === 'tab').id }
  ]));
  fs.mkdirSync(path.join(data, 'fap-pci', 'install'), { recursive: true });
  fs.writeFileSync(path.join(data, 'fap-pci', 'install', 'ui.json'), JSON.stringify({ version: 1, files: ['legacy.js'] }));
  fs.writeFileSync(path.join(data, 'uibuilder', 'ui', 'src', 'legacy.js'), 'old');
  fs.writeFileSync(path.join(data, 'uibuilder', 'ui', 'src', 'operator.css'), 'keep');
  const result = seed({
    imageRoot: root,
    dataDir: data,
    uibuilderVersion: '7.5.0',
    log() {},
    npm: () => assert.fail('uibuilder is already at the recorded version')
  });
  assert.equal(result.action, 'install');
  const flows = JSON.parse(fs.readFileSync(path.join(data, 'flows.json'), 'utf8'));
  assert.ok(flows.some(n => n.id === 'foreign-tab') && flows.some(n => n.id === 'foreign-node'), 'foreign flows retained');
  assert.equal(flows.some(n => n.id === 'stale-pci'), false, 'nodes of previous PCI tabs are dropped');
  assert.equal(flows.length, 2 + flow().length);
  assert.equal(fs.existsSync(path.join(data, 'uibuilder', 'ui', 'src', 'legacy.js')), false);
  assert.equal(fs.readFileSync(path.join(data, 'uibuilder', 'ui', 'src', 'operator.css'), 'utf8'), 'keep');
  const pkg = JSON.parse(fs.readFileSync(path.join(data, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies.other, '1.0.0', 'foreign dependencies are kept');
});
test('a flow file that is not an array stops the seeding before anything is written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-seed-')),
  root = imageRoot(dir),
  data = path.join(dir, 'data');
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'flows.json'), '{"not":"an array"}');
  assert.throws(() => seed({ imageRoot: root, dataDir: data, uibuilderVersion: '7.5.0', log() {}, npm() {} }), /not a flow array/);
  assert.equal(fs.existsSync(path.join(data, 'fap-pci', 'install', 'image-release.json')), false);
});
test('the lock file yields the base command and the flow file name follows settings.js', () => {
  const lock = readLock('deployment/image/base-image.lock');
  assert.equal(lock.BASE_REFERENCE, 'ecofacis/xfsc-orce:2.0.15');
  assert.equal(lock.UIBUILDER_VERSION, '7.5.0');
  assert.match(lock.BASE_DIGEST, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(baseCommand(lock), { entrypoint: ['/usr/src/node-red/entrypoint.sh'], cmd: ['/bin/bash'] });
  assert.throws(() => baseCommand({}), /BASE_ENTRYPOINT is not recorded/);
  assert.deepEqual(baseCommand({ BASE_ENTRYPOINT: '["./entrypoint.sh"]', BASE_CMD: '["npm","start"]' }),
    { entrypoint: ['./entrypoint.sh'], cmd: ['npm', 'start'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-seed-'));
  assert.equal(flowFileName(dir, []), 'flows.json');
  fs.writeFileSync(path.join(dir, 'settings.js'), 'module.exports = { flowFile: "orce-flows.json" };');
  assert.equal(flowFileName(dir), 'orce-flows.json');
});
test('files written as root are handed to the owner of /data, and nothing happens for other users', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-seed-')),
  data = path.join(dir, 'data');
  fs.mkdirSync(path.join(data, 'uibuilder', 'ui', 'src'), { recursive: true });
  fs.writeFileSync(path.join(data, 'flows.json'), '[]');
  const calls = [];
  const count = handOver(data, [path.join(data, 'flows.json'), path.join(data, 'uibuilder'), path.join(data, 'absent')], {
    getuid: () => 0,
    owner: () => ({ uid: 1000, gid: 1000 }),
    chown: (target, uid, gid) => calls.push([path.relative(data, target), uid, gid])
  });
  assert.equal(count, 4);
  assert.deepEqual(calls.map(c => c[0]).sort(), ['flows.json', 'uibuilder', 'uibuilder/ui', 'uibuilder/ui/src']);
  assert.ok(calls.every(c => c[1] === 1000 && c[2] === 1000));
  assert.equal(handOver(data, [path.join(data, 'flows.json')], { getuid: () => 0, owner: () => ({ uid: 0, gid: 0 }), chown: () => assert
    .fail('root-owned /data') }), 0);
  assert.equal(handOver(data, [path.join(data, 'flows.json')], { getuid: () => 1000, chown: () => assert.fail('no chown for non-root') }),
    0);
});
