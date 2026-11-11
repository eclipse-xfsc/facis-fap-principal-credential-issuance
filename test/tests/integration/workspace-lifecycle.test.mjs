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
import fs from 'node:fs';
import vm from 'node:vm';
import { stripModuleSyntax } from '../../../tools/lib/module-source.mjs';
import { createPciOperationRunner } from '../../../src/issuer/operation-runner.js';
test('the root component unregisters hash navigation and reconnect subscriptions on unmount', async() => {
  const mounted = [],
  unmounted = [],
  listeners = new Map();
  let unsubscribed = 0;
  const context = {
    Sr2Console: {},
    UiFeedback: {},
    UiProgress: {},
    UiField: {},
    ref: value => ({ value }),
    computed: fn => ({ get value() {
      return fn();
    } }),
    onMounted: fn => mounted.push(fn),
    onUnmounted: fn => unmounted.push(fn),
    onBridgeReconnect: () => () => {
      unsubscribed += 1;
    },
    window: {
      location: { hash: '', search: '' },
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => {
        assert.equal(listeners.get(name), listener);
        listeners.delete(name);
      }
    },
    store: { tenant: null, session: null, errors: {}, live: {} },
    runtime: {},
    normalizeUiError: error => error,
    URLSearchParams,
    api: {
      registrationConfig: async() => ({ registrationMode: 'public' }),
      session: async() => ({ session: null }),
      tenantContext: async() => {
        throw { status: 404 };
      },
      platformStatus: async() => ({ ready: false })
    },
    applyPublicConfiguration() {},
    completeLoginFromLocation: async() => {},
    initializeBridge() {},
    bridgePing: async() => {}
  };
  const source = stripModuleSyntax(fs.readFileSync('src/main.js', 'utf8')).replace('createApp(App).mount("#app");',
    'globalThis.rootComponent = App;');
  vm.runInNewContext(source, context);
  context.rootComponent.setup();
  for (const callback of mounted) await callback();
  assert.equal(listeners.has('hashchange'), true);
  for (const callback of unmounted) callback();
  assert.equal(listeners.size, 0);
  assert.equal(unsubscribed, 1);
});
test('the operation runner preserves the original error when input recovery fails', async() => {
  const state = { busy: { value: false }, notice: { value: '' }, error: { value: null } };
  const run = createPciOperationRunner(state, error => ({ message: error.message }), async() => {
    throw Error('recovery failure');
  });
  await run(async() => {
    throw Object.assign(Error('original failure'), { code: 'PCI-SR2-INPUT-LOST' });
  });
  assert.equal(state.error.value.message, 'original failure');
  assert.equal(state.busy.value, false);
});
test('nested operations leave progress active until their parent completes', async() => {
  const state = { busy: { value: false }, notice: { value: '' }, error: { value: null } };
  const run = createPciOperationRunner(state, error => error, async() => {});
  await run(async() => {
    await run(async() => {});
    assert.equal(state.busy.value, true);
  });
  assert.equal(state.error.value, null, 'the assertion inside the parent operation must not have been caught by the runner');
  assert.equal(state.busy.value, false);
});
