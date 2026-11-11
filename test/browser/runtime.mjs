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
// Real browser HTTP integration against synthetic services, not cloud acceptance.
import assert from 'node:assert/strict';
import { createBrowserFixtureServer } from '../support/browser-fixture.mjs';
const { chromium } = await import (process.env.PCI_BROWSER_MODULE || 'playwright');
const server = await createBrowserFixtureServer();
let browser;
const failures = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PCI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PCI_CHROMIUM_EXECUTABLE }: {}),
    ...(process.env.PCI_BROWSER_NO_SANDBOX === '1' ? { args: ['--no-sandbox'] }: {})
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => failures.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}/pci-orce/ui/`;
  for (const view of ['registration', 'provider', 'welcome', 'tenant']) {
    await page.goto(origin + '?view=' + view + (view === 'provider' ? '#/provider': ''));
    if (view === 'tenant') await page.getByRole('button', { name: 'Tenant settings', exact: true }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        return {
          width: shell.getBoundingClientRect().width,
          radius: getComputedStyle(shell).borderRadius,
          canvas: getComputedStyle(document.documentElement).backgroundColor,
          overflow: document.documentElement.scrollWidth > innerWidth + 2
        };
      });
      assert.ok(geometry.width <= 1200);
      assert.equal(geometry.radius, '20px');
      assert.equal(geometry.canvas, 'rgb(225, 231, 239)');
      assert.equal(geometry.overflow, false, view + ' overflow at ' + width);
      assert.equal(await page.locator('h1').evaluateAll(headings => headings.every(h => parseFloat(getComputedStyle(h).fontSize) <= 28)),
        true);
    }
  }
  await page.getByRole('button', { name: 'Tenant settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Tenant branding', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Signing keys', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Signing keys', exact: true }).click();
  await page.getByRole('heading', { name: 'Signing keys', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Tenant branding', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Configurations', exact: true }).click();
  await page.getByRole('button', { name: '+ Create configuration', exact: true }).click();
  await page.getByLabel('Stable identifier', { exact: true }).fill('BrowserEmployee');
  await page.getByLabel('Name', { exact: true }).fill('Browser employee');
  await page.getByLabel('Tenant key reference', { exact: true }).fill('issuer');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await page.getByRole('alert').waitFor();
  const error = await page.getByRole('alert').innerText();
  assert.match(error, /prerequisite|connector|journey/i);
  await page.getByRole('button', { name: 'Tenant settings', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').innerText(), error);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: 'Verify credential', exact: true }).click();
  await page.getByRole('heading', { name: 'Verify your credential', exact: true }).waitFor();
  await page.goto(origin + '?view=provider#/provider');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#/provider');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({
    suite: 'offline-browser',
    status: 'PASS',
    widths: [1440, 390],
    nativeServices: 'FIXTURES',
    checks: [
      'reference-shell-four-views',
      'narrow-overflow',
      'one-settings-task',
      'configuration-create',
      'typed-validation',
      'persistent-error',
      'dismiss-error',
      'presentation-panel',
      'skip-link',
      'browser-errors'
    ]
  }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
