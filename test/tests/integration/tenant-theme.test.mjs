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
import {
  sr2Branding,
  SR2_BRANDING_FONTS,
  SR2_BRANDING_LAYOUTS,
  SR2_BRANDING_CORNERS
} from '../../../backend/sr2/domain.js';
import {
  pciThemeVariables,
  applyPciTheme,
  pciContrast,
  PCI_THEME_FONTS,
  PCI_THEME_LAYOUTS,
  PCI_THEME_CORNERS,
  PCI_THEME_DEFAULTS
} from '../../../src/state/theme.js';
const base = { title: 'Example organization', description: 'Credentials' };
test('the validator and the theme offer the same fonts, page widths and corner styles', () => {
  assert.deepEqual(SR2_BRANDING_FONTS, Object.keys(PCI_THEME_FONTS));
  assert.deepEqual(SR2_BRANDING_LAYOUTS, Object.keys(PCI_THEME_LAYOUTS));
  assert.deepEqual(SR2_BRANDING_CORNERS, Object.keys(PCI_THEME_CORNERS));
});
test('without choices a tenant receives the FACIS interface standard', () => {
  const value = sr2Branding(base);
  assert.deepEqual([
    value.accent.toUpperCase(),
    value.background.toUpperCase(),
    value.foreground.toUpperCase(),
    value.font,
    value.layout,
    value.corners
  ], [
    PCI_THEME_DEFAULTS.accent,
    PCI_THEME_DEFAULTS.background,
    PCI_THEME_DEFAULTS.foreground,
    'system',
    'wide',
    'rounded'
  ]);
  const vars = pciThemeVariables(value);
  assert.equal(vars['--color-primary'], '#005FFF');
  assert.equal(vars['--color-canvas'], '#E1E7EF');
  assert.equal(vars['--radius-shell'], '20px');
  assert.equal(vars['--tenant-width'], '1200px');
  assert.deepEqual(pciThemeVariables(null), vars, 'a tenant without branding renders like the defaults');
});
test('a tenant can choose colors, font, corners and page width (FR-PCI-60)', () => {
  const value = sr2Branding({
    ...base,
    accent: '#173C67',
    background: '#FFFFFF',
    foreground: '#111111',
    font: 'serif',
    corners: 'square',
    layout: 'full'
  });
  const vars = pciThemeVariables(value);
  assert.equal(vars['--color-primary'], '#173C67');
  assert.equal(vars['--color-canvas'], '#FFFFFF');
  assert.equal(vars['--color-text'], '#111111');
  assert.match(vars['--font-sans'], /Georgia/);
  assert.deepEqual([vars['--radius-shell'], vars['--radius-control'], vars['--radius-small']], ['0px', '0px', '0px']);
  assert.deepEqual([vars['--shell-width'], vars['--tenant-width']], ['100%', '100%']);
  assert.ok(pciContrast(vars['--color-primary-hover'], '#FFFFFF') >= pciContrast(vars['--color-primary'], '#FFFFFF'),
    'the hover shade is darker than the accent');
  assert.ok(pciContrast(vars['--color-primary'], vars['--color-primary-soft']) >= 4.5, 'accent text on its tint stays readable');
});
test('unreadable colors and unsupported options are refused with a reason', () => {
  for (const [patch, reason] of [
    [{ accent: '#FFFF00' }, /4\.5:1 contrast with white/],
    [{ foreground: '#BBBBBB' }, /4\.5:1 contrast on the page/],
    [{ background: '#000000' }, /4\.5:1 contrast on the page/],
    [{ accent: 'red' }, /six-digit hex/],
    [{ font: 'comic' }, /supported font stacks/],
    [{ layout: 'tiny' }, /supported page widths/],
    [{ corners: 'round' }, /supported corner styles/],
    [{ css: 'body{}' }, /./]
  ]) assert.throws(() => sr2Branding({ ...base, ...patch }), reason, JSON.stringify(patch));
});
test('unknown values in a stored record fall back to the defaults instead of breaking the page', () => {
  const vars = pciThemeVariables({ accent: 'javascript:alert(1)', font: 'comic', corners: 'x', layout: 'y' });
  assert.equal(vars['--color-primary'], '#005FFF');
  assert.match(vars['--font-sans'], /Segoe UI/);
  assert.equal(vars['--radius-control'], '8px');
  assert.equal(vars['--tenant-width'], '1200px');
});
test('applying the theme sets every variable on the target element and ignores a missing one', () => {
  const set = new Map(),
  element = { style: { setProperty: (name, value) => set.set(name, value) } };
  applyPciTheme(element, { accent: '#173C67', font: 'mono' });
  assert.equal(set.get('--color-primary'), '#173C67');
  assert.match(set.get('--font-sans'), /monospace/);
  assert.equal(set.size, Object.keys(pciThemeVariables({})).length);
  assert.doesNotThrow(() => applyPciTheme(undefined, {}));
});
