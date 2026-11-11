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
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
function patternNames(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(p => patternNames(p.value ||
  p.argument));
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(patternNames);
  if (pattern.type === 'AssignmentPattern') return patternNames(pattern.left);
  if (pattern.type === 'RestElement') return patternNames(pattern.argument);
  return [];
}
function declarationNames(node) {
  if (!node) return [];
  return node.type === 'VariableDeclaration' ? node.declarations.flatMap(d => patternNames(d.id)): patternNames(node.id);
}
/** Check the explicit module graph before flattening into the ORCE/browser scope. */
export function inspectBundleGraph(files, options = {}) {
  const load = options.load || (file => fs.readFileSync(file, 'utf8'));
  const externals = options.externals || {};
  const assets = new Set(options.assets || []);
  const errors = [],
  modules = new Map(),
  declarations = new Map();
  for (const file of files) {
    if (modules.has(file)) {
      errors.push(`Duplicate bundle module: ${file}`);
      continue;
    }
    let tree;
    try {
      tree = parse(load(file), { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (error) {
      errors.push(`Cannot parse ${file}: ${error.message}`);
      continue;
    }
    const module = { exports: new Set(), edges: new Set(), imports: [] };
    modules.set(file, module);
    for (const statement of tree.body) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration: statement;
      for (const name of declarationNames(declaration)) {
        if (declarations.has(name)) errors.push(`Flat-scope collision: ${name} in ${declarations.get(name)} and ${file}`);
        else declarations.set(name, file);
      }
      if (statement.type === 'ExportNamedDeclaration') {
        declarationNames(statement.declaration).forEach(name => module.exports.add(name));
        statement.specifiers.forEach(s => module.exports.add(s.exported.name));
        if (statement.source) module.imports.push({
          source: statement.source.value,
          bindings: statement.specifiers.map(s => ({ imported: s.local.name, local: s.exported.name, kind: 'named' }))
        });
      }
      if (statement.type === 'ExportDefaultDeclaration' || statement.type === 'ExportAllDeclaration') {
        errors.push(`Unsupported bundle export in ${file}: ${statement.type}`);
      }
      if (statement.type === 'ImportDeclaration') module.imports.push({
        source: statement.source.value,
        bindings: statement.specifiers.map(s => ({
          kind: s.type === 'ImportSpecifier' ? 'named': s.type,
          imported: s.imported?.name || 'default',
          local: s.local.name
        }))
      });
    }
  }
  for (const [file, module] of modules) {
    for (const imported of module.imports) {
      if (!imported.source.startsWith('.')) {
        const allowed = externals[imported.source];
        for (const binding of imported.bindings) {
          if (!allowed || allowed[binding.imported] !== binding.local) errors.push(
            `Unbound external ${imported.source}:${binding.local} in ${file}`);
        }
        if (!imported.bindings.length && !allowed) errors.push(`Undeclared external side effect: ${imported.source}`);
        continue;
      }
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), imported.source));
      if (assets.has(dependency) && !imported.bindings.length) continue;
      const target = modules.get(dependency);
      if (!target) {
        errors.push(`Missing bundle dependency ${dependency} required by ${file}`);
        continue;
      }
      module.edges.add(dependency);
      for (const binding of imported.bindings) {
        if (binding.kind !== 'named' || binding.imported !== binding.local) errors.push(`Unsupported binding in ${file}: ${binding.local}`);
        if (!target.exports.has(binding.imported)) errors.push(`Missing export ${binding.imported} in ${dependency}`);
      }
    }
  }
  const completed = new Set(),
  active = new Set(),
  order = [];
  function visit(file, route = []) {
    if (active.has(file)) {
      errors.push('Module cycle: ' + [...route, file].join(' -> '));
      return;
    }
    if (completed.has(file)) return;
    active.add(file);
    for (const dependency of modules.get(file)?.edges || []) visit(dependency, [...route, file]);
    active.delete(file);
    completed.add(file);
    order.push(file);
  }
  files.forEach(file => visit(file));
  if (options.checkOrder !== false) {
    const position = new Map(files.map((file, i) => [file, i]));
    for (const [file, module] of modules) for (const dependency of module.edges) {
      if (position.get(dependency) >= position.get(file)) errors.push(`Dependency must precede importer: ${dependency} -> ${file}`);
    }
  }
  return {
    status: errors.length ? 'FAIL': 'PASS',
    modules: modules.size,
    edges: [...modules.values()].reduce((n, m) => n + m.edges.size, 0),
    order,
    errors
  };
}
export const pciUiRuntimeBindings = {
  vue: Object.fromEntries(['createApp', 'computed', 'onMounted', 'onUnmounted', 'ref', 'reactive'].map(name => [name, name]))
};
export const pciNativeRuntimeBindings = Object.fromEntries(['crypto', 'zlib', 'tls', 'net', 'http', 'https', 'http2'].map(name =>
  ['node:' + name, { default: name }]));
