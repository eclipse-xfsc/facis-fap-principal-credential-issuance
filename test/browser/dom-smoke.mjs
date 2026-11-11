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
// Real Chromium + the actual Vue components, without navigation or external I/O.
// All native, identity, persistence and transport boundaries below are fixtures.
// This does NOT replace runtime.mjs, live deployment, accessibility or wallet QA.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { stripModuleSyntax } from '../../tools/lib/module-source.mjs';
import { issuerSource } from '../support/ui-source.mjs';
import { fixture, alpha } from '../support/sr2-fixture.mjs';
import { httpHarness } from '../support/sr2-http.mjs';
const { chromium } = await import (process.env.PCI_BROWSER_MODULE || 'playwright');
const f = fixture();
await f.prepared();
const dispatch = httpHarness(f);
const tenant = {
  tenantId: alpha,
  organizationName: 'Alpha',
  primaryDomain: 'alpha-pci.example.com',
  state: 'active'
};
const version = fs.readFileSync('VERSION', 'utf8').trim();
const source = file => stripModuleSyntax(fs.readFileSync(file, 'utf8'), file).replaceAll('__FAP_PCI_VERSION__', version);
const logo = 'data:image/svg+xml;base64,' + fs.readFileSync('src/assets/facis-logo.svg').toString('base64');
let browser;
const failures = [], geometries = [];
const field = (page, name) => page.locator('.settings-panel label').filter({ hasText: new RegExp('^\\s*' + name) }).locator('select');
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PCI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PCI_CHROMIUM_EXECUTABLE }: {}),
    ...(process.env.PCI_BROWSER_NO_SANDBOX === '1' ? { args: ['--no-sandbox'] }: {})
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => failures.push(error.message));
  await page.exposeFunction('__pciDispatch', async(path, options) => {
    if (path.endsWith('/identity-provider')) return {
      status: 200,
      body: {
        item: {
          version: 1,
          state: 'active',
          mode: 'keycloak',
          displayName: 'Organization account',
          issuer: '',
          clientId: '',
          audience: '',
          scopes: 'openid profile email'
        },
        redirectUri: 'https://identity.example.com/broker/endpoint'
      }
    };
    return dispatch(path, options);
  });
  for (const view of ['registration', 'provider', 'welcome', 'tenant']) {
    const session = view === 'provider' ? { subject: 'provider', username: 'Provider', roles: ['provider_admin'] }: view === 'tenant' ? f
      .principal(): null;
    const tenantData = ['tenant', 'welcome'].includes(view) ? tenant: null;
    await page.setContent(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PCI isolated component preview</title></head><body><div id="app"></div></body></html>');
    await page.addStyleTag({ content: fs.readFileSync('src/styles.css', 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync('vendor/vue.global.prod.js', 'utf8') });
    await page.addScriptTag({
      content: `(() => {
      const memory = new Map();
      const localLocation = { origin: 'https://fixture.invalid', hostname: 'fixture.invalid', pathname: '/pci-orce/ui/', search: '', hash: ${JSON.stringify(view === 'provider' ? '#/provider' : '')}, assign() {}, reload() {} };
      const window = new Proxy(globalThis.window, { get(target, key) {
        if (key === 'location') return localLocation;
        if (key === 'history') return { replaceState() {} };
        if (key === 'sessionStorage') return { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const { createApp, ref, computed, onMounted, onUnmounted, reactive } = Vue;
      const runtime = { basePath: '/pci-orce', apiBasePath: '/pci-orce/api/v1', uiPath: '/pci-orce/ui/' };
      const applyPublicConfiguration = () => {}, completeLoginFromLocation = async () => null, beginLogin = async () => {};
      const onBridgeReconnect = () => () => {}, initializeBridge = () => { store.live.connected = true; }, bridgePing = async () => ({ pong: true });
      ${source('src/state/store.js')}
      ${source('src/state/reducers.js')}
      ${source('src/state/theme.js')}
      ${source('src/components/feedback.js')}
      const request = async (path, options = {}) => {
        const result = await globalThis.__pciDispatch(path, options);
        return decodeHttpResponse(new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json', ...(result.headers || {}) } }));
      };
      const api = {
        registrationConfig: async () => ({ orceBasePath: '/pci-orce', registrationMode: 'public', hostnameTemplate: '{slug}-pci.example.com' }),
        session: async () => ({ session: ${JSON.stringify(session)} }),
        tenantContext: async () => { const tenant = ${JSON.stringify(tenantData)}; if (!tenant) throw Object.assign(Error('No tenant'), { status: 404 }); return { tenant }; },
        tenantMembers: async () => ({ items: [{ subject: 'principal', username: 'Principal', enabled: true, roles: ['principal'] }] }),
        platformStatus: async () => ({ ready: true }), registrations: async () => ({ items: [] }), tenants: async () => ({ items: [] })
      };
      ${source('src/qr-tables.js')}
      ${source('src/qr.js')}
      ${issuerSource()}
      ${source('src/main.js')}
    })();`
    });
    await page.locator('.app-shell').waitFor();
    await page.locator('img[alt="FACIS"]').evaluateAll((images, logo) => images.forEach(img => {
      img.src = logo;
    }), logo);
    if (view === 'tenant') await page.getByRole('button', { name: 'Tenant settings', exact: true }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        return {
          width: shell.getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth > innerWidth + 2,
          radius: getComputedStyle(shell).borderRadius
        };
      });
      assert.ok(geometry.width <= 1200);
      assert.equal(geometry.overflow, false, `${view}: overflow at ${width}`);
      assert.equal(geometry.radius, '20px');
      geometries.push({ view, viewport: width, ...geometry });
    }
  }
  await page.getByRole('button', { name: 'Tenant settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Tenant branding', exact: true }).waitFor();
  // FR-PCI-60: a tenant theme is applied as soon as the branding is activated.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Accent color', { exact: true }).fill('#173c67');
  await page.getByLabel('Page color', { exact: true }).fill('#ffffff');
  await field(page, 'Font').selectOption('serif');
  await field(page, 'Corners').selectOption('square');
  await field(page, 'Content width').selectOption('full');
  await page.getByRole('button', { name: 'Activate branding', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.app-shell')).borderRadius === '0px');
  await page.mouse.move(0, 0);
  // Buttons animate their background for .2s; wait until the transition has settled.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.settings-panel button:not(.secondary)')).backgroundColor ===
    'rgb(23, 60, 103)', null, { timeout: 5000 });
  const themed = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell'),
    button = document.querySelector('.settings-panel button:not(.secondary)');
    return {
      primary: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
      canvas: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(shell).fontFamily,
      radius: getComputedStyle(shell).borderRadius,
      shellWidth: shell.getBoundingClientRect().width,
      viewport: innerWidth,
      button: getComputedStyle(button).backgroundColor
    };
  });
  assert.equal(themed.primary, '#173C67');
  assert.equal(themed.button, 'rgb(23, 60, 103)');
  assert.match(themed.font, /Georgia/);
  assert.equal(themed.radius, '0px');
  assert.ok(themed.shellWidth > 1200, 'full page width: the shell is wider than the standard 1200 px at a 1440 px viewport');
  await page.getByRole('button', { name: 'Reset to FACIS defaults', exact: true }).click();
  await page.getByRole('button', { name: 'Activate branding', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.app-shell')).borderRadius === '20px');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()), '#005FFF');
  assert.equal(await page.getByRole('heading', { name: 'Signing keys', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Signing keys', exact: true }).click();
  await page.getByRole('heading', { name: 'Signing keys', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Tenant branding', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Configurations', exact: true }).click();
  await page.getByRole('button', { name: '+ Create configuration', exact: true }).click();
  await page.getByLabel('Stable identifier', { exact: true }).fill('ReviewEmployee');
  await page.getByLabel('Name', { exact: true }).fill('Review employee');
  await page.getByLabel('Tenant key reference', { exact: true }).fill('issuer');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await page.getByRole('alert').waitFor();
  const error = await page.getByRole('alert').innerText();
  assert.match(error, /prerequisite|connector|journey/i);
  await page.getByRole('button', { name: 'Tenant settings', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  assert.equal(await page.getByRole('alert').innerText(), error);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: 'Verify credential', exact: true }).click();
  await page.getByRole('heading', { name: 'Verify your credential', exact: true }).waitFor();
  if (process.env.PCI_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.PCI_BROWSER_SCREENSHOT, fullPage: true });
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({
    suite: 'offline-dom-smoke',
    status: 'PASS',
    browser: await browser.version(),
    transport: 'IN_MEMORY_FIXTURE',
    cloudDeployment: 'NOT_RUN',
    pageErrors: failures,
    geometries,
    checks: [
      'four-views',
      'two-viewport-layouts',
      'separate-settings-tasks',
      'tenant-theme-applied-on-activation',
      'reset-to-facis-defaults',
      'create-configuration',
      'typed-validation',
      'persistent-error',
      'dismiss-error',
      'presentation-panel'
    ]
  }));
} finally {
  await browser?.close();
}
