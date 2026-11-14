import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { PCI_UI_MODULES, PCI_SR2_MODULES } from './lib/bundle-inputs.mjs';
import {
  inspectBundleGraph,
  pciUiRuntimeBindings,
  pciNativeRuntimeBindings
} from './lib/bundle-graph.mjs';
const functionKinds = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const sqlPatterns = [
  /^\s*SELECT\s+[\s\S]+?\s+FROM\s+\S+/i,
  /^\s*INSERT\s+INTO\s+\S+[\s\S]*\b(?:VALUES|SELECT)\b/i,
  /^\s*UPDATE\s+\S+\s+SET\b/i,
  /^\s*DELETE\s+FROM\s+\S+/i,
  /^\s*CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\s+\S+/i,
  /^\s*ALTER\s+TABLE\s+\S+/i,
  /^\s*WITH\s+(?:RECURSIVE\s+)?[A-Za-z_]\w*(?:\s*\([^)]*\))?\s+AS\s*\(/i,
];
export const rules = JSON.parse(fs.readFileSync(new URL('./maintainability-rules.json', import.meta.url), 'utf8'));
/** Repository-relative path with forward slashes on every platform. */
export function normalizeFile(file) {
  return file.split(path.sep).join('/').replace(/^\.\//, '');
}
/** Metrics are review aids, not a claim of security or architectural acceptance. */
export function measureSource(source, filename = '<source>') {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, locations: true });
  const lines = source.trimEnd().split('\n'),
  functions = [],
  statements = new Map(),
  sqlLines = new Set();
  function complexity(root) {
    let branches = 1;
    function count(node) {
      if (!node || typeof node !== 'object') return;
      if (node !== root && functionKinds.has(node.type)) return;
      if ([
        'IfStatement',
        'ConditionalExpression',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
        'WhileStatement',
        'DoWhileStatement',
        'CatchClause',
        'LogicalExpression'
      ].includes(node.type)) branches += 1;
      if (node.type === 'SwitchCase' && node.test) branches += 1;
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(count);
        else if (value && typeof value === 'object' && value.type) count(value);
      }
    }
    count(root);
    return branches;
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (functionKinds.has(node.type)) functions.push({
      name: node.id?.name || '<closure>',
      line: node.loc.start.line,
      lines: node.loc.end.line - node.loc.start.line + 1,
      complexity: complexity(node)
    });
    if (['ExpressionStatement', 'ReturnStatement', 'ThrowStatement', 'VariableDeclaration'].includes(node.type)) {
      statements.set(node.loc.start.line, (statements.get(node.loc.start.line) || 0) + 1);
    }
    // SQL statements are kept readable as one string or template literal; their
    // lines are exempt from the line-length rule (literal content is never reformatted).
    const literal = node.type === 'TemplateLiteral' ? node.quasis.map(q => q.value.cooked ?? q.value.raw).join(' '): node.type ===
      'Literal' &&
    typeof node.value === 'string' ? node.value: null;
    if (literal !== null && sqlPatterns.some(pattern => pattern.test(literal))) {
      for (let line = node.loc.start.line; line <= node.loc.end.line; line++) sqlLines.add(line);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && value.type) visit(value);
    }
  }
  visit(tree);
  const authoredLines = lines.map((line, index) => sqlLines.has(index + 1) ? 0: line.length);
  return {
    file: normalizeFile(filename),
    lines: lines.length,
    maxLine: Math.max(0, ...authoredLines),
    maxLineIncludingSql: Math.max(0, ...lines.map(line => line.length)),
    sqlLines: sqlLines.size,
    maxStatementsPerLine: Math.max(0, ...statements.values()),
    functions
  };
}
function exemptions(file) {
  return new Set(rules.exceptions.filter(e => e.file === file).flatMap(e => e.rules));
}
export function sourceViolations(metric) {
  const errors = [],
  file = normalizeFile(metric.file),
  exempt = exemptions(file),
  issuer = rules.issuer;
  if (!exempt.has('line-length') && metric.maxLine > rules.lineLength) errors.push(`${file}: line exceeds ${rules.lineLength} characters`);
  if (!exempt.has('file-lines') && metric.lines > rules.fileLines) errors.push(`${file}: source exceeds ${rules.fileLines} lines`);
  if (!exempt.has('statements-per-line') && metric.maxStatementsPerLine > rules.statementsPerLine) {
    errors.push(`${file}: multiple statements are packed onto one line`);
  }
  if (file.startsWith(issuer.pathPrefix)) {
    const limit = file.includes('/views/') ? issuer.viewModuleLines: issuer.moduleLines;
    if (!exempt.has('module-lines') && metric.lines > limit) errors.push(`${file}: issuer module exceeds ${limit} lines`);
    for (const fn of metric.functions) {
      // A composition factory contains nested handlers but remains file-bounded.
      if (!exempt.has('function-lines') && !fn.name.startsWith(issuer.compositionFactoryPrefix) && fn.lines > issuer.functionLines) {
        errors.push(`${file}:${fn.line}: handler exceeds ${issuer.functionLines} lines`);
      }
      if (!exempt.has('function-complexity') && fn.complexity > issuer.functionComplexity) {
        errors.push(`${file}:${fn.line}: function complexity exceeds ${issuer.functionComplexity}`);
      }
    }
  }
  return errors;
}
export function checkMaintainability(root = process.cwd()) {
  const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.posix
    .join(dir, entry.name)): /\.m?js$/.test(entry.name) ? [path.posix.join(dir, entry.name)]: []);
  const files = rules.scope.flatMap(entry => fs.statSync(path.join(root, entry)).isDirectory() ? walk(entry): [entry]).sort();
  const metrics = files.map(file => measureSource(fs.readFileSync(path.join(root, file), 'utf8'), file));
  const load = file => fs.readFileSync(path.join(root, file), 'utf8');
  const ui = inspectBundleGraph(PCI_UI_MODULES, { externals: pciUiRuntimeBindings, assets: ['src/styles.css'], load });
  const backend = inspectBundleGraph(PCI_SR2_MODULES.map(file => 'backend/sr2/' + file),
    { externals: pciNativeRuntimeBindings, runtimeBindings: ['URL', 'URLSearchParams'], load });
  const staleExceptions = rules.exceptions.filter(e => !files.includes(e.file)).map(e =>
    `${e.file}: exception for a file that does not exist`);
  const errors = [...metrics.flatMap(sourceViolations), ...ui.errors, ...backend.errors, ...staleExceptions];
  return {
    status: errors.length ? 'FAIL': 'PASS',
    scope: 'Authored JavaScript in backend, src, shared, tools and build.js',
    excluded: [
      'Generated dist and .build',
      'Pinned vendor sources',
      'Test fixture sources',
      'SQL template literals (line length only)'
    ],
    rules: {
      lineLength: rules.lineLength,
      fileLines: rules.fileLines,
      statementsPerLine: rules.statementsPerLine,
      issuer: rules.issuer
    },
    exceptions: rules.exceptions,
    files: metrics.length,
    maximumLineLength: Math.max(...metrics.map(m => m.maxLine)),
    maximumLineLengthIncludingSql: Math.max(...metrics.map(m => m.maxLineIncludingSql)),
    largestSourceFile: [...metrics].sort((a, b) => b.lines - a.lines)[0]?.file,
    uiGraph: ui,
    backendGraph: backend,
    metrics,
    errors
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkMaintainability();
  const output = process.argv.indexOf('--output');
  if (output >= 0) {
    if (!process.argv[output + 1]) throw new Error('--output requires a path');
    fs.writeFileSync(process.argv[output + 1], JSON.stringify(result, null, 2) + '\n');
  }
  const { metrics, uiGraph, backendGraph, ...summary } = result;
  console.log(JSON.stringify({
    ...summary,
    uiGraph: { status: uiGraph.status, modules: uiGraph.modules, errors: uiGraph.errors },
    backendGraph: { status: backendGraph.status, modules: backendGraph.modules, errors: backendGraph.errors }
  }));
  if (result.errors.length) process.exitCode = 1;
}
