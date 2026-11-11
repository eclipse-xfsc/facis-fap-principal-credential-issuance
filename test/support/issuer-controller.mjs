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
import { webcrypto } from 'node:crypto';
import { createPciIssuerController } from '../../src/issuer/controller.js';
// Explicit in-memory boundaries for independently imported feature modules.
export function issuerControllerFixture(options = {}) {
  const calls = [],
  saved = options.saved || new Map();
  const props = options.props || {
    tenant: { tenantId: 'alpha', organizationName: 'Alpha', state: 'active' },
    session: { subject: 'member' }
  };
  const window = {
    location: {
      origin: 'https://alpha.example',
      hostname: 'alpha.example',
      pathname: '/ui/',
      hash: options.hash || '',
      reload() {}
    },
    history: { replaceState(_state, _title, url) {
      window.location.hash = url.slice(url.indexOf('#'));
    } },
    sessionStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    confirm: () => true,
    prompt: () => null
  };
  const fallback = async path => {
    if (path.endsWith('/issuer-capabilities')) return { issuer: false, tenantAdmin: false, connectors: [] };
    return { items: [] };
  };
  const request = async(path, init = {}) => {
    calls.push({ path, ...init });
    return (options.request || fallback)(path, init);
  };
  const dependencies = {
    ref: value => ({ value }),
    computed: fn => ({ get value() {
      return fn();
    } }),
    request,
    runtime: { basePath: '' },
    window,
    crypto: webcrypto,
    document: { createElement: () => ({ click() {} }) },
    api: { tenantMembers: async() => ({ items: [] }) },
    normalizeUiError: error => ({ message: error.message, code: error.code || 'TEST_ERROR' }),
    pciQrImage: url => ({ url }),
    ...options.dependencies
  };
  const ui = createPciIssuerController(props, dependencies);
  return { ui, calls, saved, window, props, dependencies };
}
export function deferred() {
  let resolve,
  reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
