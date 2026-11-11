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
// Adds the project licence header to authored source files that lack it.
// Usage: node tools/add-licence-headers.mjs [--check]
// --check lists the files without a complete header and exits 1; without it
// the headers are written. Third-party files keep their own notices and are
// listed in EXCLUDED below; generated files are outside the scope.
import fs from 'node:fs';
import path from 'node:path';
const SCOPE = [
  { dir: 'backend', ext: ['.js'] },
  { dir: 'src', ext: ['.js'] },
  { dir: 'shared', ext: ['.js'] },
  { dir: 'tools', ext: ['.mjs', '.py'] },
  { dir: 'test', ext: ['.mjs', '.py'] },
  { dir: 'scripts', ext: ['.py', '.mjs', '.sh'] },
  { dir: 'automation', ext: ['.py', '.mjs', '.sh'] },
  { dir: 'deployment/image', ext: ['.mjs', '.sh'] },
  { dir: 'reference/participant-data-repository', ext: ['.go'] }
];
const FILES = ['build.js'];
const EXCLUDED = new Set([
  'src/qr-tables.js',
  // ReportLab/Kazuhiko Arase QR tables, MIT: see vendor/qr-tables-LICENSE.txt
  'src/qr.js' // encoder derived from the same tables; keeps the credit to the vendor notice
]);
const EXCLUDED_DIRS = ['node_modules', 'dist', '.build', 'vendor', 'fixtures', 'gen', 'wirepb', '__pycache__'];
const AI_LIST = 'tools/licence-header-ai-files.txt';
const COPYRIGHT = 'Copyright (c) 2026 LEANEA GmbH and others.';
const LICENCE = [
  '',
  'This program and the accompanying materials are made available under the',
  'terms of the Apache License, Version 2.0 which is available at',
  'https://www.apache.org/licenses/LICENSE-2.0.',
  '',
  'SPDX-License-Identifier: Apache-2.0'
];
const AI = ['', 'Prepared with AI-assisted tools and reviewed by the author.', 'Assisted-by: AI'];
const check = process.argv.includes('--check');
const aiFiles = new Set(fs.existsSync(AI_LIST) ? fs.readFileSync(AI_LIST, 'utf8').split('\n').map(l => l.trim()).filter(l => l &&
!l.startsWith('#')): []);
function * walk(dir, ext) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.includes(entry.name)) yield * walk(file, ext);
    } else if (ext.includes(path.extname(entry.name)) && !entry.name.endsWith('.pb.go')) yield file;
  }
}
function commentPrefix(file) {
  const ext = path.extname(file);
  return ['.py', '.sh'].includes(ext) ? '# ': '// ';
}
function header(file) {
  const prefix = commentPrefix(file);
  const lines = [COPYRIGHT, ...LICENCE, ...(aiFiles.has(file) ? AI: [])];
  return lines.map(line => (line ? prefix + line: prefix.trim())).join('\n') + '\n';
}
function hasHeader(source, file) {
  const head = source.split('\n').slice(0, 15).join('\n');
  return head.includes(COPYRIGHT) && head.includes('SPDX-License-Identifier: Apache-2.0') && (!aiFiles.has(file) ||
  head.includes('Assisted-by:'));
}
function insert(source, file) {
  const prefix = commentPrefix(file).trim();
  let lines = source.split('\n');
  // A bare SPDX line in the first lines is replaced by the full header.
  const bare = lines.findIndex((line, i) => i < 5 && line.trim() === prefix + ' SPDX-License-Identifier: Apache-2.0');
  if (bare >= 0) lines.splice(bare, 1);
  // Existing partial headers of this script (for example without the AI lines) are replaced as a whole.
  const start = lines.findIndex((line, i) => i < 3 && line.includes(COPYRIGHT));
  if (start >= 0) {
    let end = start;
    while (end < lines.length && lines[end].startsWith(prefix) && !lines[end].startsWith(prefix + '!')) end += 1;
    lines.splice(start, end - start + (lines[end] === '' ? 1: 0));
  }
  let at = 0;
  if (lines[0]?.startsWith('#!')) at = 1;
  const text = lines.join('\n');
  const before = lines.slice(0, at).join('\n');
  const after = lines.slice(at).join('\n');
  // The source formatter keeps no blank line between a leading comment and the first statement of a JavaScript file.
  const gap = ['.js', '.mjs'].includes(path.extname(file)) ? '': '\n';
  return (before ? before + '\n': '') + header(file) + gap + after.replace(/^\n+/, '');
}
const files = [...FILES, ...SCOPE.flatMap(({ dir, ext }) => fs.existsSync(dir) ? [...walk(dir, ext)]: [])].filter(f => !EXCLUDED.has(f))
  .sort();
const missing = files.filter(file => !hasHeader(fs.readFileSync(file, 'utf8'), file));
for (const listed of aiFiles) if (!files.includes(listed)) throw new Error(AI_LIST + ' names a file outside the scope: ' + listed);
if (check) {
  for (const file of missing) console.error(file);
  console.log(JSON.stringify({
    status: missing.length ? 'FAIL': 'PASS',
    files: files.length,
    missing: missing.length,
    aiDisclosed: aiFiles.size
  }));
  process.exit(missing.length ? 1: 0);
}
for (const file of missing) fs.writeFileSync(file, insert(fs.readFileSync(file, 'utf8'), file));
console.log(`${missing.length} file(s) given a licence header; ${files.length} in scope; ${aiFiles.size} with AI disclosure`);
