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
// Runs an ORCE Function node of this repository the way tools/build-flows.mjs
// assembles it: shared URL helpers, _common.js, _identity.js and _bridge.js,
// then the node's own source. Node-RED globals (msg, node, env, global, flow,
// context) and the required libraries are supplied as fixtures; pg is a fake
// pool, so no network, database or Keycloak is touched.
import fs from 'node:fs';
import crypto from 'node:crypto';
import url from 'node:url';
import zlib from 'node:zlib';
import { stripModuleSyntax } from '../../tools/lib/module-source.mjs';
const read = file => fs.readFileSync(file, 'utf8');
const sharedUrl = stripModuleSyntax(read('shared/public-url.js'), 'shared/public-url.js');
const common = read('backend/functions/_common.js').replaceAll('__FAP_PCI_VERSION__', 'test') + '\n' + read(
  'backend/functions/_identity.js') + '\n' + read('backend/functions/_bridge.js');
export const defaultEnvironment = {
  PCI_MAIN_HOST: 'pci.example.com',
  PCI_BASE_DOMAIN: 'example.com',
  PCI_VERIFICATION_TOKEN_PEPPER: 'synthetic-pepper',
  PCI_DATABASE_URL: 'postgres://fixture/fixture',
  PCI_OCM_NAMESPACE: 'ocm-wstack',
  PCI_KEYCLOAK_INTERNAL_URL: 'http://keycloak.internal',
  PCI_KEYCLOAK_PUBLIC_URL: 'https://identity.example.com',
  PCI_KEYCLOAK_REALM: 'pci',
  PCI_KEYCLOAK_UI_CLIENT_ID: 'fap-pci-ui',
  PCI_SESSION_TTL_MINUTES: '480'
};
/** A fake pg.Pool: `handler(sql, args)` returns `{ rows }` or throws; every query is recorded. */
export function fakePg(handler) {
  const calls = [];
  class Pool {
    constructor(options) {
      this.options = options;
    } async query(sql, args = []) {
      calls.push({ sql, args });
      const result = await handler(sql, args);
      return result || { rows: [] };
    } async connect() {
      return { query: this.query.bind(this), release() {} };
    } async end() {}
  }
  return { Pool, calls };
}
/**
 * Executes `backend/functions/<file>` once for `msg`.
 * Returns the node's return value (the output array of the Function node), the
 * final `msg`, the recorded `node.error`/`node.warn` output and the fake pool.
 * `overrides` is a map of helper name → value assigned after the shared helpers
 * are defined (function declarations are rebindable), so a test can replace
 * one collaborator such as `pciIdentityAdmit` while keeping the rest real.
 */
export async function runFunctionNode(file, { msg, environment = {}, libs = {}, overrides = {}, pg } = {}) {
  const values = { ...defaultEnvironment, ...environment };
  const store = new Map();
  const logs = { error: [], warn: [], log: [] };
  const node = { error: e => logs.error.push(e), warn: w => logs.warn.push(w), log: l => logs.log.push(l), send() {} };
  const pool = pg || fakePg(() => ({ rows: [] }));
  const context = {
    msg,
    node,
    env: { get: name => values[name] },
    global: { get: key => store.get(key), set: (key, value) => store.set(key, value) },
    flow: { get: () => undefined, set() {} },
    context: { get: () => undefined, set() {} },
    crypto,
    url,
    zlib,
    Buffer,
    pg: pool,
    jwt: libs.jwt || {},
    jwksRsa: libs.jwksRsa || (() => ({})),
    nodemailer: libs.nodemailer || {},
    yaml: libs.yaml || {},
    http: {},
    https: {},
    http2: {},
    tls: {},
    net: {},
    dns: {},
    fs: {},
    ...libs.extra
  };
  const assignments = Object.keys(overrides).map(name => `${name} = __overrides[${JSON.stringify(name)}];`).join('\n');
  const source = `const { URL, URLSearchParams } = url;\n${sharedUrl}\n${common}\n${assignments}\n${read('backend/functions/' + file)}`;
  const run = new Function(...Object.keys(context), '__overrides', source);
  const output = await run(...Object.values(context), overrides);
  return { output, msg, logs, pool, store };
}
/** Builds a Function-node message for an HTTP request routed through the gateway. */
export function httpMessage(action, { host = 'pci.example.com', headers = {}, body, url: path = '/api/v1/' + action } = {}) {
  return {
    _msgid: 'test-' + action,
    pciAction: action,
    pciTransport: 'http',
    req: {
      method: body ? 'POST': 'GET',
      url: path,
      originalUrl: path,
      headers: { host, ...headers },
      params: {},
      query: {}
    },
    res: {},
    payload: body
  };
}
