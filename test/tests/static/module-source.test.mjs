import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { stripModuleSyntax, validateScript, validateFunctionBody } from '../../../tools/lib/module-source.mjs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';

test('bundle transformation preserves executable statements after same-line imports', () => {
  const source = "import crypto from 'node:crypto'; export const answer = 42;";
  const transformed = stripModuleSyntax(source);
  assert.equal(vm.runInNewContext(transformed + '\nanswer'), 42);
});
test('bundle transformation supports multiline named imports and exports', () => {
  const source = "import {\n a,\n b\n} from './dependency.js';\nexport function sum() { return a+b; }";
  assert.equal(vm.runInNewContext(stripModuleSyntax(source) + '\nsum()', {a:3,b:4}), 7);
});
test('bundle transformation never removes import-like text inside a template', () => {
  const source = 'export const message = `\nimport something;\nexport function sample() {}\n`;';
  assert.equal(vm.runInNewContext(stripModuleSyntax(source)+'\nmessage'), '\nimport something;\nexport function sample() {}\n');
});
test('re-exports are removed without removing the adjacent implementation', () => {
  assert.equal(vm.runInNewContext(stripModuleSyntax("export { item } from './other.js'; const answer=6;")+'\nanswer'), 6);
});
test('unsupported defaults and wildcard exports fail closed', () => {
  for (const source of ['export default 3;', "export * from './x.js';"]) assert.throws(()=>stripModuleSyntax(source), /unsupported/);
});
test('aliased module bindings cannot be silently flattened incorrectly', () => {
  assert.throws(()=>stripModuleSyntax("import { original as alias } from './x.js';"), /aliased/);
});

test('current UI and ORCE bundles have no module syntax left in generated functions', () => {
  const flow=JSON.parse(fs.readFileSync('dist/fap-pci-flow.json','utf8'));
  for(const node of flow.filter(n=>n.type==='function'))
    assert.doesNotThrow(()=>parse(node.func,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true}),node.name);
});

test('removing an export list preserves the ASI boundary before an array', () => {
  const source = "const items = []\nexport { items }\n[1,2].forEach(n => items.push(n))";
  const result = vm.runInNewContext(
    stripModuleSyntax(source, 'export-boundary.mjs') + '\n;items'
  );
  assert.equal(JSON.stringify(result), '[1,2]');
});

test('removing an import preserves the ASI boundary before an array', () => {
  const source = "const items = []\nimport { external } from './dep.js'\n[1,2].forEach(n => items.push(n))";
  const result = vm.runInNewContext(
    stripModuleSyntax(source, 'import-boundary.mjs') + '\n;items'
  );
  assert.equal(JSON.stringify(result), '[1,2]');
});

for (const barrier of ["export { value }", "import './dep.js'"]) {
  for (const expression of ['(() => 1)()', '`standalone`']) {
    test(`statement boundary: ${barrier} before ${expression}`, () => {
      const source = `const value = 7\n${barrier}\n${expression}`;
      const result = vm.runInNewContext(
        stripModuleSyntax(source, 'boundary.mjs') + '\n;value'
      );
      assert.equal(result, 7);
    });
  }
}

const unsupportedForms = [
  ['import.meta', 'export const value = import.meta.url;', /import\.meta/],
  ['nested import.meta', 'export function value() { return import.meta.url; }', /import\.meta/],
  ['top-level await', 'export const value = await Promise.resolve(1);', /top-level await/],
  ['await inside a top-level block', 'if (true) { await Promise.resolve(1); }', /top-level await/],
  ['top-level for-await', 'for await (const value of []) {}', /top-level await/],
  ['namespace import', "import * as namespace from './dep.js'; namespace.value;", /namespace/],
];

for (const [name, source, reason] of unsupportedForms) {
  test(`reject unsupported module form: ${name}`, () => {
    assert.throws(
      () => stripModuleSyntax(source, 'unsupported-fixture.mjs'),
      error => error.message.includes('unsupported-fixture.mjs') &&
        reason.test(error.message),
    );
  });
}

test('await inside an async function remains supported', async () => {
  const source = 'export async function answer() { return await Promise.resolve(42); }';
  const answer = vm.runInNewContext(
    stripModuleSyntax(source, 'async.mjs') + '\n;answer'
  );
  assert.equal(await answer(), 42);
});

test('module-like strings and object properties are preserved', () => {
  const source = 'export const value = {import: {meta: {url: "import.meta await"}}};';
  assert.equal(
    vm.runInNewContext(stripModuleSyntax(source) + '\n;value.import.meta.url'),
    'import.meta await',
  );
});

test('output validation uses script and async function contexts', () => {
  assert.doesNotThrow(() =>
    validateScript('(() => { "use strict"; return 1; })();', 'ui.js')
  );
  assert.doesNotThrow(() =>
    validateFunctionBody('return await Promise.resolve(msg);', 'orce.js')
  );
  assert.throws(() => validateScript('import.meta.url', 'ui.js'), /ui\.js/);
  assert.throws(() => validateScript('await Promise.resolve()', 'ui.js'), /ui\.js/);
  assert.throws(() =>
    validateFunctionBody('const clash = 1; const clash = 2;', 'orce.js'),
    /orce\.js/,
  );
});

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

function fixtureFile(root, name, content = '') {
  const destination = path.join(root, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function expectBuildFailure(root, script, output, reason) {
  const result = spawnSync(
    process.execPath, [path.join(repositoryRoot, script)],
    { cwd: root, encoding: 'utf8', timeout: 20000 },
  );
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, reason);
  assert.equal(fs.existsSync(path.join(root, output)), false);
}

function uiFixture(root) {
  const program = parse(
    fs.readFileSync(path.join(repositoryRoot, 'tools/build-ui.mjs'), 'utf8'),
    { ecmaVersion: 'latest', sourceType: 'module' },
  );
  const declaration = program.body
    .filter(node => node.type === 'VariableDeclaration')
    .flatMap(node => node.declarations)
    .find(node => node.id.name === 'sources');
  assert.ok(declaration);
  const sources = declaration.init.elements.map(node => node.value);
  assert.ok(sources.length > 1);
  fixtureFile(root, 'VERSION', '0.0.0\n');
  for (const source of sources) fixtureFile(root, source);
  return sources;
}

for (const [name, source, reason] of unsupportedForms) {
  test(`UI builder rejects ${name} before emitting index.js`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-ui-module-'));
    try {
      const sources = uiFixture(root);
      fixtureFile(root, sources[0], source);
      expectBuildFailure(
        root, 'tools/build-ui.mjs', '.build/ui/index.js', reason,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('UI builder validates the assembled wrapper before emitting it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-ui-wrapper-'));
  try {
    const sources = uiFixture(root);
    fixtureFile(root, sources[0], 'const __fixture_collision = 1;');
    fixtureFile(root, sources[1], 'const __fixture_collision = 2;');
    expectBuildFailure(
      root, 'tools/build-ui.mjs', '.build/ui/index.js',
      /already been declared/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ORCE builder validates the assembled function before emitting flows', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pci-orce-wrapper-'));
  try {
    fixtureFile(root, 'VERSION', '0.0.0\n');
    fixtureFile(root, 'shared/public-url.js');
    fixtureFile(root, 'docs/api/openapi.json', '{}');
    fixtureFile(root, 'backend/sr2/routes.json', '[]');
    for (const name of [
      'domain', 'journey-input', 'assets', 'participant-security', 'store',
      'adapters', 'wire', 'transport', 'profiles', 'sdjwt', 'linked-data',
      'native', 'history', 'semantics', 'service', 'revocation', 'issuance',
      'presentation', 'maintenance', 'runtime', 'http',
    ]) fixtureFile(root, `backend/sr2/${name}.js`);
    for (const name of [
      '_common', '_identity', '_bridge', '_k8s', '_participant-cleanup',
      'infrastructure', 'registration', 'provider', 'reconcile',
      'auth', 'email', 'tenant', 'status',
    ]) fixtureFile(root, `backend/functions/${name}.js`);
    fixtureFile(root, 'backend/functions/_common.js', 'const __fixture_collision = 1;');
    fixtureFile(root, 'backend/functions/infrastructure.js', 'const __fixture_collision = 2;');
    expectBuildFailure(
      root, 'tools/build-flows.mjs', '.build/fap-pci-flow.json',
      /already been declared/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('actual generated UI and ORCE outputs compile in their runtime contexts', () => {
  assert.doesNotThrow(() =>
    validateScript(fs.readFileSync('dist/ui/index.js', 'utf8'), 'actual-ui.js')
  );
  const functions = JSON.parse(fs.readFileSync('dist/fap-pci-flow.json', 'utf8'))
    .filter(node => node.type === 'function');
  assert.ok(functions.length > 0);
  for (const node of functions) {
    for (const field of ['func', 'initialize', 'finalize']) {
      if (typeof node[field] === 'string' && node[field].trim()) {
        assert.doesNotThrow(() =>
          validateFunctionBody(node[field], `${node.name}:${field}`)
        );
      }
    }
  }
});
