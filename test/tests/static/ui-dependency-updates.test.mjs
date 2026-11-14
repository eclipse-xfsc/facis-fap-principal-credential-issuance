// Copyright (c) 2026 LEANEA GmbH and others.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isNewerVersion } from '../../../tools/compare-ui-versions.mjs';

const workflow = readFileSync(
  new URL('../../../.github/workflows/update-ui-dependencies.yml', import.meta.url), 'utf8'
);
const helper = fileURLToPath(
  new URL('../../../tools/compare-ui-versions.mjs', import.meta.url)
);

function step(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1];
  assert.ok(section, `Missing workflow step: ${name}`);
  const block = section.match(/^        run: \|\n((?:(?: {10}[^\n]*|[ \t]*)\n)+)/m);
  assert.ok(block, `Missing shell body: ${name}`);
  return block[1].split('\n').map(line =>
    line.startsWith('          ') ? line.slice(10) : line
  ).join('\n');
}

const compare = step('Compare the pinned Vue version with the npm registry');
const issue = step('Open or update the issue');

function exercise(pinned, latest, existing = '', npmFail = false) {
  const root = mkdtempSync(join(tmpdir(), 'pci-ui-update-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    mkdirSync(join(root, 'tools'));
    copyFileSync(helper, join(root, 'tools/compare-ui-versions.mjs'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      dependencies: { vue: pinned },
    }));
    const executable = (name, code) => writeFileSync(
      join(bin, name), '#!/usr/bin/env node\n' + code + '\n', { mode: 0o755 }
    );
    executable('npm', `
      if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['view','vue','version'])) process.exit(2);
      if (process.env.MOCK_NPM_FAIL === '1') process.exit(1);
      console.log(process.env.MOCK_LATEST);
    `);
    executable('gh', `
      const fs = require('node:fs');
      const a = process.argv.slice(2);
      fs.appendFileSync(process.env.MOCK_GH_LOG, JSON.stringify(a) + String.fromCharCode(10));
      if (a[0] !== 'issue') process.exit(2);
      if (a[1] === 'list') {
        process.stdout.write(process.env.MOCK_EXISTING || '');
      } else if (a[1] === 'create' || a[1] === 'edit') {
        if (a.includes('--label')) {
          console.error('label does not exist');
          process.exit(1);
        }
      } else process.exit(2);
    `);
    const output = join(root, 'output');
    const log = join(root, 'gh.log');
    writeFileSync(output, '');
    writeFileSync(log, '');
    const env = {
      ...process.env,
      PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`,
      GITHUB_OUTPUT: output,
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'review/example',
      GITHUB_RUN_ID: '123',
      MOCK_LATEST: latest,
      MOCK_EXISTING: existing,
      MOCK_NPM_FAIL: npmFail ? '1' : '0',
      MOCK_GH_LOG: log,
      PINNED: pinned,
      LATEST: latest,
    };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', compare], {
      cwd: root, env, encoding: 'utf8', timeout: 20000,
    });
    const values = Object.fromEntries(
      readFileSync(output, 'utf8').trim().split('\n').filter(Boolean)
        .map(line => line.split('=', 2))
    );
    let issueResult;
    if (result.status === 0 && values.update === 'true') {
      issueResult = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', issue], {
        cwd: root, env, encoding: 'utf8', timeout: 20000,
      });
    }
    const calls = readFileSync(log, 'utf8').trim().split('\n')
      .filter(Boolean).map(line => JSON.parse(line));
    return { result, values, issueResult, calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const cases = [
  ['equal', '3.5.43', '3.5.43', false],
  ['newer patch', '3.5.43', '3.5.44', true],
  ['older patch', '3.5.44', '3.5.43', false],
  ['newer minor', '3.5.43', '3.6.0', true],
  ['older minor', '3.6.0', '3.5.43', false],
  ['newer major', '3.5.43', '4.0.0', true],
  ['older major', '4.0.0', '3.5.43', false],
  ['ahead prerelease', '3.6.0-beta.1', '3.5.43', false],
  ['stable promotion', '3.6.0-beta.1', '3.6.0', true],
  ['numeric prerelease', '3.6.0-beta.2', '3.6.0-beta.10', true],
  ['older prerelease', '3.6.0-beta.10', '3.6.0-beta.2', false],
  ['numeric before alphabetic', '1.0.0-1', '1.0.0-alpha', true],
  ['longer prerelease', '1.0.0-alpha', '1.0.0-alpha.1', true],
  ['build metadata ignored', '3.5.43+one', '3.5.43+two', false],
  ['large numeric versions', '99999999999999999999.0.0', '100000000000000000000.0.0', true],
];

for (const [name, pinned, latest, expected] of cases) {
  test(name, () => {
    assert.equal(isNewerVersion(pinned, latest), expected);
    const actual = exercise(pinned, latest);
    assert.equal(actual.result.status, 0, actual.result.stderr);
    assert.equal(actual.values.update, String(expected));
    assert.equal(actual.values.pinned, pinned);
    assert.equal(actual.values.latest, latest);
    if (expected) {
      assert.equal(actual.issueResult.status, 0, actual.issueResult.stderr);
      assert.ok(actual.calls.some(a => a[1] === 'create'));
      assert.ok(actual.calls.every(a => !a.includes('--label')));
    } else {
      assert.equal(actual.calls.length, 0);
    }
  });
}

test('existing report is edited instead of duplicated', () => {
  const actual = exercise('3.5.43', '3.5.44', '123');
  assert.equal(actual.result.status, 0, actual.result.stderr);
  assert.equal(actual.issueResult.status, 0, actual.issueResult.stderr);
  assert.ok(actual.calls.some(a => a[1] === 'edit' && a[2] === '123'));
  assert.ok(actual.calls.every(a => a[1] !== 'create'));
});

for (const invalid of ['^3.5.43', '03.5.43', '3.5', '3.5.43-01', '3.5.43+', 'v3.5.43', '']) {
  test(`invalid pin is rejected: ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => isNewerVersion(invalid, '3.5.44'));
    const actual = exercise(invalid, '3.5.44');
    assert.notEqual(actual.result.status, 0);
    assert.equal(actual.calls.length, 0);
  });
}

test('invalid registry version is rejected', () => {
  const actual = exercise('3.5.43', 'not-a-version');
  assert.notEqual(actual.result.status, 0);
  assert.equal(actual.calls.length, 0);
});

test('registry failure does not create an issue', () => {
  const actual = exercise('3.5.43', '3.5.44', '', true);
  assert.notEqual(actual.result.status, 0);
  assert.equal(actual.calls.length, 0);
});

test('workflow retains issue-only permissions and the update condition', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /if: steps\.compare\.outputs\.update == 'true'/);
  assert.doesNotMatch(workflow, /\bgit\s+(?:commit|push)\b/);
});
