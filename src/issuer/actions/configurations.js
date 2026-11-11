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
import { newPciConfigurationForm } from '../form-defaults.js';
/** Configurations operations with explicit state and I/O dependencies. */
export function createPciConfigurationActions(state, dependencies) {
  const { selected, versions, configForm, preview, configs, notice, restoreVersion } = state;
  const { run, call, clone, document, window } = dependencies;
  function newConfig() {
    selected.value = null;
    versions.value = [];
    configForm.value = newPciConfigurationForm();
  }
  async function editConfig(item) {
    await run(async() => {
      const r = await call('/credential-configurations/' + item.id);
      selected.value = r.item;
      configForm.value = clone(r.item.draft);
      versions.value = r.versions;
      preview.value = null;
    });
  }
  async function saveConfig() {
    await run(async() => {
      const r = await call('/credential-configurations' + (selected.value ? '/' + selected.value.id: ''), selected.value ? 'PATCH': 'POST',
        { data: configForm.value }, selected.value?.version);
      selected.value = r.item;
      configForm.value = clone(r.item.draft);
      configs.value = (await call('/credential-configurations')).items;
      notice.value = 'Draft saved. Publish when ready.';
    });
  }
  async function exportTemplate() {
    if (!selected.value) return;
    await run(async() => {
      const value = await call('/credential-configurations/' + selected.value.id + '/semantic-template');
      const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob),
      link = document.createElement('a');
      link.href = url;
      link.download = 'pci-template-' + value.identifier + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice.value = 'Template exported with JSON-LD context, SHACL constraints and synthetic example.';
    });
  }
  async function configAction(action) {
    if (!selected.value) return;
    if (action === 'archive' && !window.confirm('Archive this configuration and stop new requests?')) return;
    await run(async() => {
      const r = await call('/credential-configurations/' + selected.value.id + (action === 'archive' ? '': '/' + action), action ===
        'archive' ? 'DELETE': 'POST', {}, selected.value.version);
      if (r.item) {
        selected.value = r.item;
        configForm.value = clone(r.item.draft);
      } preview.value = r.preview || null;
      notice.value = action === 'validate' ? 'Configuration validation passed. Publish locally, then publish the catalogue to OCM.':
        'Configuration ' + action + ' completed.';
      configs.value = (await call('/credential-configurations')).items;
    });
  }
  async function restoreConfig() {
    if (!selected.value) return;
    await run(async() => {
      const r = await call('/credential-configurations/' + selected.value.id + '/rollback', 'POST', { version: Number(restoreVersion
        .value) }, selected.value.version);
      selected.value = r.item;
      configForm.value = clone(r.item.draft);
      notice.value = 'Version restored as a draft. Publish to activate.';
    });
  }
  return { newConfig, editConfig, saveConfig, exportTemplate, configAction, restoreConfig };
}
