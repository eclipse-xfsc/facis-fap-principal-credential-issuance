// Whitespace-only source layout. Verify AST equivalence before writing any file.
// Strings, regular expressions, templates and comments are not rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
const parserOptions = { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true };
const astJson = value => JSON.stringify(value, (key, item) => ['start', 'end', 'loc', 'range', 'raw'].includes(key) ? undefined:
  typeof item === 'bigint' ? `${item}n`: item);
// Wrap only syntactically safe boundaries. Literal contents are never rewritten.
function wrapSafeBoundaries(source, width = 140) {
  const tree = parse(source, parserOptions),
  breaks = new Set();
  const add = node => {
    if (node) breaks.add(node.start);
  };
  function visit(node) {
    if (!node || typeof node !== 'object' || node.type === 'TemplateLiteral') return;
    if (['CallExpression', 'NewExpression'].includes(node.type)) node.arguments.forEach(add);
    if (['BinaryExpression', 'LogicalExpression', 'AssignmentExpression'].includes(node.type)) add(node.right);
    if (node.type === 'VariableDeclarator') add(node.init);
    if (node.type === 'ConditionalExpression') {
      add(node.consequent);
      add(node.alternate);
    }
    if (node.type === 'SequenceExpression') node.expressions.slice(1).forEach(add);
    if (node.type === 'MemberExpression' && !node.computed) breaks.add(node.object.end);
    if (node.type === 'ArrowFunctionExpression') add(node.body);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  const edits = [];
  let offset = 0;
  for (const line of source.split('\n')) {
    const indent = line.match(/^\s*/)[0].length;
    const points = [...breaks].filter(p => p > offset && p < offset + line.length).sort((a, b) => a - b);
    let start = offset,
    continuation = 0;
    while (offset + line.length - start + continuation > width) {
      const available = points.filter(p => p > start + 24);
      const within = available.filter(p => p - start + continuation <= width);
      const point = within.at(- 1) ?? available[0];
      if (point === undefined) break;
      edits.push([point, '\n' + ' '.repeat(indent + 2)]);
      start = point;
      continuation = indent + 2;
    }
    offset += line.length + 1;
  }
  for (const [position, replacement] of edits.reverse()) {
    source = source.slice(0, position).replace(/[ \t]+$/g, '') + replacement + source.slice(position);
  }
  return source;
}
export function formatSource(source) {
  const tokens = [],
  comments = [],
  atomic = [],
  delimiters = new Map(),
  boundaries = new Set();
  const tree = parse(source, { ...parserOptions, onToken: tokens, onComment: comments });
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TemplateLiteral') {
      atomic.push([node.start, node.end]);
      return;
    }
    if (/Statement$|Declaration$/.test(node.type || '')) boundaries.add(node.start);
    const kind = node.type;
    if ([
      'BlockStatement',
      'ClassBody',
      'StaticBlock',
      'ObjectExpression',
      'ObjectPattern',
      'ArrayExpression',
      'ArrayPattern'
    ].includes(kind)) {
      const block = ['BlockStatement', 'ClassBody', 'StaticBlock'].includes(kind);
      delimiters.set(node.start, {
        type: source[node.start],
        expanded: block || source.slice(node.start, node.end).replace(/\s+/g, '').length > 90
      });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  // Import/export specifier braces are not object expressions.
  for (const statement of tree.body) {
    if (['ImportDeclaration', 'ExportNamedDeclaration'].includes(statement.type) && !statement.declaration) {
      const open = tokens.find(t => t.start >= statement.start && t.end <= statement.end && t.type.label === '{');
      if (open) delimiters.set(open.start, {
        type: '{',
        expanded: source.slice(statement.start, statement.end).replace(/\s+/g, '').length > 90
      });
    }
  }
  const items = [
    ...tokens.filter(t => t.type.label !== 'eof').map(t => ({ ...t, label: t.type.label })),
    ...comments.map(c => ({ ...c, label: 'comment' }))
  ].filter(t => !atomic.some(([a, b]) => t.start >= a && t.end <= b));
  for (const [start, end] of atomic) items.push({ start, end, label: 'template' });
  items.sort((a, b) => a.start - b.start);
  let out = '',
  indent = 0,
  previous = null;
  const stack = [];
  const nl = () => {
    out = out.replace(/[ \t]+$/g, '');
    if (!out.endsWith('\n')) out += '\n';
  };
  const raw = t => t ? source.slice(t.start, t.end): '';
  for (let i = 0; i < items.length; i++) {
    const token = items[i],
    text = raw(token),
    next = items[i + 1],
    last = raw(previous);
    const originalGap = previous ? source.slice(previous.end, token.start): '';
    if (previous && /[\r\n]/.test(originalGap) && (token.label === 'comment' || boundaries.has(token.start) ||
    ['return', 'throw', 'yield', 'break', 'continue', '++', '--'].includes(last))) nl();
    if (text === '}' || text === ']' || text === ')') {
      const open = stack.pop();
      if (open?.expanded) {
        indent--;
        nl();
      }
    }
    if (!out || out.endsWith('\n')) out += '  '.repeat(Math.max(0, indent));
    else if (previous) {
      const joined = ['.', '?.', ',', ';', ')', ']', ':'].includes(text) || ['.', '?.', '(', '[', '...'].includes(last) ||
      (text === '(' && (previous.label === 'name' || [')', ']'].includes(last))) || (text === '[' && !delimiters.has(token.start)) ||
      ['++', '--'].includes(text) || ['!', '~'].includes(last) || (text === '}' && last === '{');
      if (!joined && !/[ \t]$/.test(out)) out += ' ';
    }
    out += text;
    if (text === '{' || text === '[' || text === '(') {
      const definition = delimiters.get(token.start);
      const expanded = Boolean(definition?.expanded && raw(next) !== (text === '{' ? '}': ']'));
      stack.push({ type: text, expanded });
      if (expanded) {
        indent++;
        nl();
      }
    }
    if (text === ';' && stack.at(- 1)?.type !== '(') nl();
    if (text === ',' && stack.at(- 1)?.expanded) nl();
    if (['&&', '||'].includes(text) && out.slice(out.lastIndexOf('\n') + 1).length > 100) nl();
    if (token.label === 'comment' && token.type === 'Line') nl();
    previous = token;
  }
  out = wrapSafeBoundaries(out.trimEnd() + '\n');
  if (astJson(tree) !== astJson(parse(out, parserOptions))) throw new Error('Formatting changed the AST; input not overwritten');
  return out;
}
function files(location) {
  if (fs.statSync(location).isDirectory()) return fs.readdirSync(location).sort().flatMap(x => files(path.join(location, x)));
  return /\.(?:m?js)$/.test(location) ? [location]: [];
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'),
  roots = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!roots.length) throw new Error('Specify authored source files or directories');
  let count = 0;
  for (const file of roots.flatMap(files)) {
    const before = fs.readFileSync(file, 'utf8'),
    after = formatSource(before);
    if (before !== after) {
      count++;
      if (check) console.error(file);
      else fs.writeFileSync(file, after);
    }
  }
  console.log(`${count} source file(s) ${check?'need formatting':'formatted; AST equivalence verified'}`);
  if (check && count) process.exitCode = 1;
}
