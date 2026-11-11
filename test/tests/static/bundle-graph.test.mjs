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
import { inspectBundleGraph } from '../../../tools/lib/bundle-graph.mjs';
import { measureSource, sourceViolations } from '../../../tools/check-maintainability.mjs';
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
test('function limits apply to backend/ with the service and issuance factories exempt from the length rule only', () => {
  const metric = (file, functions) => ({ file, lines: 100, maxLine: 80, maxStatementsPerLine: 1, functions });
  const long = { name: 'handleThing', line: 3, lines: 150, complexity: 5 },
  dense = { name: 'decide', line: 9, lines: 20, complexity: 30 };
  const backend = sourceViolations(metric('backend/sr2/example.js', [long, dense]), new Set()).join(' ');
  assert.match(backend, /example\.js:3: handler exceeds 100 lines/);
  assert.match(backend, /example\.js:9: function complexity exceeds 20/);
  const factory = sourceViolations(metric('backend/sr2/example.js', [{ name: 'extendSr2Example', line: 1, lines: 300, complexity: 25 }]),
    new Set()).join(' ');
  assert.doesNotMatch(factory, /handler exceeds/);
  assert.match(factory, /complexity exceeds/);
  assert.deepEqual(sourceViolations(metric('tools/example.mjs', [long, dense]), new Set()), [], 'tools are outside the function limits');
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
