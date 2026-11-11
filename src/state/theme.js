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
// Tenant theme: maps the validated branding record (backend/sr2/domain.js,
// sr2Branding) to the CSS custom properties of src/styles.css. The defaults
// are the FACIS interface standard; a tenant may choose its colours (within
// the contrast rules of the validator), one of the bundled font stacks, a
// corner style and a page width. No external font or stylesheet is loaded.
export const PCI_THEME_DEFAULTS = Object.freeze({
  accent: '#005FFF',
  background: '#E1E7EF',
  foreground: '#1F2937',
  font: 'system',
  layout: 'wide',
  corners: 'rounded'
});
export const PCI_THEME_FONTS = Object.freeze({
  system: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
  sans: '"Helvetica Neue",Helvetica,Arial,sans-serif',
  serif: 'Georgia,Cambria,"Times New Roman",Times,serif',
  rounded: 'ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold",system-ui,sans-serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace'
});
// [shell, control, small] radii
export const PCI_THEME_CORNERS = Object.freeze(
  { rounded: ['20px', '8px', '6px'], soft: ['12px', '6px', '4px'], square: ['0px', '0px', '0px'] });
// [shell width, content width]
export const PCI_THEME_LAYOUTS = Object.freeze({ wide: ['1200px', '1200px'], focused: ['1200px', '1040px'], full: ['100%', '100%'] });
const HEX = /^#[0-9a-f]{6}$/i;
function pciChannels(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}
function pciHex(channels) {
  return '#' + channels.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function pciMix(hex, target, amount) {
  const a = pciChannels(hex),
  b = pciChannels(target);
  return pciHex(a.map((value, i) => value + (b[i] - value) * amount));
}
function pciLuminance(hex) {
  const c = pciChannels(hex).map(v => v / 255).map(x => x <= 0.04045 ? x / 12.92: ((x + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
export function pciContrast(a, b) {
  const x = pciLuminance(a),
  y = pciLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// The light tint behind accent-coloured text keeps 4.5:1 with the accent.
function pciSoftTint(accent) {
  for (let amount = 0.9; amount < 1; amount += 0.01) {
    const tint = pciMix(accent, '#FFFFFF', amount);
    if (pciContrast(accent, tint) >= 4.5) return tint;
  }
  return '#FFFFFF';
}
export function pciThemeVariables(branding) {
  const b = branding || {};
  const color = (value, fallback) => (typeof value === 'string' && HEX.test(value) ? value: fallback).toUpperCase();
  const accent = color(b.accent, PCI_THEME_DEFAULTS.accent),
  background = color(b.background, PCI_THEME_DEFAULTS.background),
  foreground = color(b.foreground, PCI_THEME_DEFAULTS.foreground);
  const font = PCI_THEME_FONTS[b.font] || PCI_THEME_FONTS.system;
  const [shell, control, small] = PCI_THEME_CORNERS[b.corners] || PCI_THEME_CORNERS.rounded;
  const [shellWidth, contentWidth] = PCI_THEME_LAYOUTS[b.layout] || PCI_THEME_LAYOUTS.wide;
  return {
    '--color-primary': accent,
    '--color-primary-hover': pciMix(accent, '#000000', 0.15),
    '--color-primary-soft': pciSoftTint(accent),
    '--color-focus': accent,
    '--color-canvas': background,
    '--color-text': foreground,
    '--font-sans': font,
    '--radius-shell': shell,
    '--radius-control': control,
    '--radius-small': small,
    '--shell-width': shellWidth,
    '--tenant-width': contentWidth
  };
}
// Applies the theme to an element (the document root for the page canvas and
// shell). Without branding the FACIS defaults are applied.
export function applyPciTheme(element, branding) {
  if (!element?.style?.setProperty) return;
  for (const [name, value] of Object.entries(pciThemeVariables(branding))) element.style.setProperty(name, value);
}
