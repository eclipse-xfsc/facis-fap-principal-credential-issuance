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
// Build-time module flattening for the existing ORCE/browser runtime contract.
// This is not a general ESM bundler. Imports must resolve to names provided by
// the ordered bundle or to the explicit runtime globals. Unsupported exports
// fail rather than silently producing an incomplete deployment.
import { parse } from 'acorn';
export function stripModuleSyntax(source, filename = '<source>') {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, });
  const edits = [];
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportSpecifier' && specifier.imported.name !== specifier.local.name) {
          throw new Error(`${filename}: aliased imports need an explicit runtime binding`);
        }
      }
      edits.push([statement.start, statement.end, '']);
    } else if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        edits.push([statement.start, statement.declaration.start, '']);
      } else {
        if (statement.specifiers.some(s => s.local?.name !== s.exported?.name)) {
          throw new Error(`${filename}: aliased exports are unsupported in a flat bundle`);
        }
        edits.push([statement.start, statement.end, '']);
      }
    } else if (statement.type === 'ExportDefaultDeclaration' || statement.type === 'ExportAllDeclaration') {
      throw new Error(`${filename}: ${statement.type} is unsupported in a flat bundle`);
    }
  }
  let result = source;
  for (const [start, end, replacement] of edits.reverse()) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}
