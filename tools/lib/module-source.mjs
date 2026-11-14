// Copyright (c) 2026 LEANEA GmbH and others.
// SPDX-License-Identifier: Apache-2.0
// Flatten the ordered ORCE/browser modules with explicit runtime bindings.
// Unsupported module-only constructs fail before a bundle is emitted.
import { parse } from 'acorn';
import { Script } from 'node:vm';

const functionTypes = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function rejectModuleOnlySyntax(node, filename, depth = 0) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'MetaProperty' && node.meta.name === 'import') {
    throw new Error(`${filename}: import.meta is unsupported in a flat bundle`);
  }
  if (depth === 0 && (
    node.type === 'AwaitExpression' ||
    (node.type === 'ForOfStatement' && node.await)
  )) {
    throw new Error(`${filename}: top-level await is unsupported in a flat bundle`);
  }
  const nextDepth = depth + (functionTypes.has(node.type) ? 1 : 0);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        rejectModuleOnlySyntax(child, filename, nextDepth);
      }
    } else if (value && typeof value === 'object') {
      rejectModuleOnlySyntax(value, filename, nextDepth);
    }
  }
}

function parseSource(source, filename, sourceType) {
  try {
    return parse(source, {
      ecmaVersion: 'latest', sourceType, allowReturnOutsideFunction: true,
    });
  } catch (error) {
    throw new Error(`${filename}: ${error.message}`, { cause: error });
  }
}

export function stripModuleSyntax(source, filename = '<source>') {
  const program = parseSource(source, filename, 'module');
  rejectModuleOnlySyntax(program, filename);
  const edits = [];
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          throw new Error(`${filename}: namespace imports are unsupported in a flat bundle`);
        }
        if (specifier.type === 'ImportSpecifier' &&
            specifier.imported.name !== specifier.local.name) {
          throw new Error(`${filename}: aliased imports need an explicit runtime binding`);
        }
      }
      edits.push([statement.start, statement.end, ';']);
    } else if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        edits.push([statement.start, statement.declaration.start, '']);
      } else {
        if (statement.specifiers.some(s => s.local?.name !== s.exported?.name)) {
          throw new Error(`${filename}: aliased exports are unsupported in a flat bundle`);
        }
        edits.push([statement.start, statement.end, ';']);
      }
    } else if (
      statement.type === 'ExportDefaultDeclaration' ||
      statement.type === 'ExportAllDeclaration'
    ) {
      throw new Error(`${filename}: ${statement.type} is unsupported in a flat bundle`);
    }
  }
  let result = source;
  for (const [start, end, replacement] of edits.reverse()) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  parseSource(result, filename, 'script');
  return result;
}

export function validateScript(source, filename = '<script>') {
  try {
    new Script(source, { filename });
  } catch (error) {
    throw new Error(`${filename}: ${error.message}`, { cause: error });
  }
}

export function validateFunctionBody(source, filename = '<function>') {
  validateScript(
    `(async function(msg, send, done) {\n${source}\n})`,
    filename,
  );
}
