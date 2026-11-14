import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBundleGraph, pciUiRuntimeBindings } from '../../../tools/lib/bundle-graph.mjs';
import {
  measureSource,
  sourceViolations,
  checkMaintainability,
  rules
} from '../../../tools/check-maintainability.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PCI_UI_MODULES } from '../../../tools/lib/bundle-inputs.mjs';
import { formatSource } from '../../../tools/format-source.mjs';
const inspect = (modules, extra = {}) => inspectBundleGraph(Object.keys(modules), { load: file => modules[file], ...extra });
test('bundle graph accepts an ordered named dependency', () => {
  assert.deepEqual(inspect({ 'a.js': 'export const a = 1;', 'b.js': "import {a} from './a.js'; export const b = a;" }).errors, []);
});
test('bundle graph rejects missing modules instead of deleting unresolved imports', () => {
  assert.match(inspect({ 'a.js': "import {x} from './missing.js';" }).errors.join(' '), /Missing bundle dependency/);
});
test('bundle graph rejects missing named exports', () => {
  assert.match(inspect({ 'a.js': 'export const a = 1;', 'b.js': "import {missing} from './a.js';" }).errors.join(' '), /Missing export/);
});
test('bundle graph rejects cross-module top-level collisions', () => {
  assert.match(inspect({ 'a.js': 'const value = 1;', 'b.js': 'const value = 2;' }).errors.join(' '), /collision/);
});
test('bundle graph catches cycles between import facades', () => {
  const r = inspect({
    'a.js': "import {b} from './b.js'; export function a(){return b();}",
    'b.js': "import {a} from './a.js'; export function b(){return a();}"
  });
  assert.match(r.errors.join(' '), /Module cycle/);
});
test('bundle graph rejects dependency order that would create a temporal dead zone', () => {
  assert.match(inspect({ 'b.js': "import {a} from './a.js'; export const b=a;", 'a.js': 'export const a=1;' }).errors.join(' '),
    /precede importer/);
});
test('bundle graph checks aliases, default imports and namespace imports', () => {
  for (const value of ["{a as renamed}", '* as all', 'defaultValue']) {
    assert.match(inspect({ 'a.js': 'export const a=1;', 'b.js': `import ${value} from './a.js';` }).errors.join(' '),
      /Unsupported binding/);
  }
});
test('bundle graph requires explicit external runtime bindings', () => {
  const modules = { 'a.js': "import crypto from 'node:crypto'; export function id(){return crypto.randomUUID();}" };
  assert.match(inspect(modules).errors.join(' '), /Unbound external/);
  assert.deepEqual(inspect(modules, { externals: { 'node:crypto': { default: 'crypto' } } }).errors, []);
});
test('bundle graph permits only explicitly copied side-effect assets', () => {
  const modules = { 'a.js': "import './theme.css';" };
  assert.match(inspect(modules).errors.join(' '), /Missing bundle/);
  assert.deepEqual(inspect(modules, { assets: ['theme.css'] }).errors, []);
});
test('bundle graph validates compatibility re-exports', () => {
  assert.deepEqual(inspect({
    'a.js': 'export const a=1;',
    'b.js': "export {a} from './a.js';",
    'c.js': "import {a} from './b.js'; export const c=a;"
  }).errors, []);
});
test('maintainability gate rejects dense lines, packed statements and oversized modules', () => {
  assert.match(sourceViolations({ file: 'src/issuer/example.js', lines: 300, maxLine: 400, maxStatementsPerLine: 8, functions: [] }).join(
    ' '), /line exceeds/);
  assert.ok(sourceViolations({ file: 'src/issuer/example.js', lines: 300, maxLine: 80, maxStatementsPerLine: 1, functions: [] }).some(e => e
    .includes('module exceeds')));
});
test('function metrics do not charge inner branches to a composition factory', () => {
  const metrics = measureSource('function createPciExample(){function action(x){if(x)return 1;return 0;}return {action};}');
  assert.equal(metrics.functions.find(f => f.name === 'createPciExample').complexity, 1);
  assert.equal(metrics.functions.find(f => f.name === 'action').complexity, 2);
});
test('formatter wraps long call and operator chains without changing literal values', () => {
  const source = 'export const result = call(' + Array.from({ length: 35 }, (_, i) => `"argument${i}"`).join(',') + ');';
  const result = formatSource(source);
  assert.ok(Math.max(...result.split('\n').map(line => line.length)) <= 160);
  assert.equal(formatSource(result), result);
});
test('formatter preserves regexes, templates and ASI-sensitive throws across safe wrapping', () => {
  const source = 'function sample(){ const match = /a\\/b/;const text=`x${1}`; return match.test(text);}';
  assert.equal(formatSource(formatSource(source)), formatSource(source));
});
test('external side effects require an own allowlist entry', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'valueOf']) {
    assert.equal(inspect({ 'a.js': `import '${name}';` }).status, 'FAIL');
  }
  const inherited = Object.create({ approved: {} });
  assert.equal(inspect({ 'a.js': "import 'approved';" }, { externals: inherited }).status, 'FAIL');
  const explicit = Object.create(null);
  explicit.constructor = {};
  assert.equal(inspect({ 'a.js': "import 'constructor';" }, { externals: explicit }).status, 'PASS');
});
test('external bindings require an own mapping entry', () => {
  const mapping = Object.create({ default: 'crypto' });
  assert.equal(inspect({ 'a.js': "import crypto from 'node:crypto';" }, { externals: { 'node:crypto': mapping } },).status, 'FAIL');
});
test('injected runtime bindings are reserved even when not imported', () => {
  for (const name of Object.values(pciUiRuntimeBindings.vue)) {
    const result = inspect({ 'a.js': `const ${name} = 1;` }, { externals: pciUiRuntimeBindings },);
    assert.match(result.errors.join(' '), /Flat-scope collision/);
  }
  assert.match(inspect({ 'a.js': 'const URL = 1;' }, { runtimeBindings: ['URL'] },).errors.join(' '), /Flat-scope collision/);
});
test('module-scoped var declarations are collected through blocks', () => {
  for (const source of [
    'if (true) { var shared = 1; }',
    '{ var shared = 1; }',
    'for (var shared = 0; shared < 1; shared++) {}',
    'for (var [shared] of [[]]) {}',
    'try {} catch (error) { var shared = 1; }',
    'switch (1) { case 1: var shared = 1; }',
  ]) {
    assert.match(inspect({ 'a.js': source, 'b.js': 'const shared = 2;', }).errors.join(' '), /Flat-scope collision/);
  }
});
test('function, static-block and lexical block scopes stay separate', () => {
  for (const source of [
    'function nested() { var shared = 1; }',
    'const nested = () => { var shared = 1; };',
    'class Holder { static { var shared = 1; } }',
    'if (true) { let shared = 1; }',
  ]) {
    assert.deepEqual(inspect({ 'a.js': source, 'b.js': 'const shared = 2;', }).errors, []);
  }
});
test('repeated var declarations in one module are one binding', () => {
  assert.deepEqual(inspect({ 'a.js': 'var shared; if (true) { var shared = 1; }', }).errors, []);
});
const nonSqlMessages = [
  'Please select a credential ',
  'Select a credential ',
  '<div>Please select a credential ',
  '<div>SELECT value FROM records ',
];
test('ordinary text and HTML containing SQL keywords remain subject to line limits', () => {
  for (const prefix of nonSqlMessages) {
    const source = formatSource('const message = ' + JSON.stringify(prefix + 'x'.repeat(320)) + ';');
    const metric = measureSource(source, 'shared/review-fixture.js');
    assert.equal(metric.sqlLines, 0);
    assert.ok(metric.maxLine > rules.lineLength);
    assert.ok(sourceViolations(metric).some(error => error.includes('line exceeds')));
  }
});
test('recognized SQL statement literals retain the line-length exemption', () => {
  const value = 'x'.repeat(320);
  for (const query of [
    `SELECT note FROM records WHERE note = '${value}'`,
    `INSERT INTO records(note) VALUES('${value}')`,
    `UPDATE records SET note = '${value}'`,
    `DELETE FROM records WHERE note = '${value}'`,
    `CREATE TABLE records (note text DEFAULT '${value}')`,
    `CREATE UNIQUE INDEX notes ON records ((note || '${value}'))`,
    `ALTER TABLE records ADD COLUMN note text DEFAULT '${value}'`,
    `WITH picked AS (SELECT note FROM records) SELECT note FROM picked WHERE note = '${value}'`,
  ]) {
    for (const literal of [JSON.stringify(query), '`' + query + '`']) {
      const source = formatSource('const query = ' + literal + ';');
      const metric = measureSource(source, 'shared/review-fixture.js');
      assert.ok(metric.sqlLines > 0);
      assert.ok(metric.maxLine <= rules.lineLength);
      assert.deepEqual(sourceViolations(metric), []);
    }
  }
});
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
test('the complete gate rejects long ordinary text and HTML', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-sql-gate-'));
  try {
    for (const entry of rules.scope) {
      fs.cpSync(path.join(repositoryRoot, entry), path.join(root, entry), { recursive: true });
    }
    assert.equal(checkMaintainability(root).status, 'PASS');
    for (const prefix of nonSqlMessages) {
      fs.writeFileSync(path.join(root, 'shared/review-fixture.js'), formatSource('const message = ' + JSON.stringify(prefix + 'x'.repeat(
        320)) + ';'),);
      const result = checkMaintainability(root);
      assert.equal(result.status, 'FAIL');
      assert.ok(result.errors.some(error => error.includes('shared/review-fixture.js') && error.includes('line exceeds')));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
for (const [name, first, second] of [
  ['injected binding', 'const ref = 1;', ''],
  ['hoisted variable', 'if (true) { var collision = 1; }', 'const collision = 2;'],
]) {
  test(`UI builder rejects ${name} collisions before emission`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-graph-build-'));
    try {
      const put = (name, content) => {
        const target = path.join(root, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      };
      put('VERSION', '0.0.0\n');
      for (const file of PCI_UI_MODULES) put(file, '');
      put(PCI_UI_MODULES[0], first);
      put(PCI_UI_MODULES[1], second);
      const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'tools/build-ui.mjs')],
        { cwd: root, encoding: 'utf8', timeout: 20000 },);
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Flat-scope collision/);
      assert.equal(fs.existsSync(path.join(root, '.build/ui/index.js')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
test('the main HTML template is measured without a SQL exemption', () => {
  const metric = measureSource(fs.readFileSync(path.join(repositoryRoot, 'src/main.js'), 'utf8'), 'src/main.js',);
  assert.equal(metric.sqlLines, 0);
  assert.ok(metric.maxLine <= rules.lineLength);
});
