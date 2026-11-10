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
/** Assets operations with explicit state and I/O dependencies. */
export function createPciAssetActions(state, dependencies) {
  const { uploadScope, selected, assets, configForm, uploadRole, brandingForm, notice } = state;
  const { run, call, window } = dependencies;
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    await run(async() => {
      if (file.size > 1048576) throw new Error('Select a PNG up to 1 MiB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let raw = '';
      for (const b of bytes) raw += String.fromCharCode(b);
      const configurationId = uploadScope.value === 'tenant' ? null: selected.value?.id;
      if (uploadScope.value === 'configuration' && !configurationId) throw new Error('Save and select a configuration first.');
      const r = await call('/assets', 'POST', { configurationId, data: { mediaType: 'image/png', base64: btoa(raw) } });
      assets.value = (await call('/assets')).items;
      if (configurationId) configForm.value[uploadRole.value] = r.item.id;
      else brandingForm.value.logoAssetId = r.item.id;
      notice.value = 'PNG decoded and re-encoded. Save and publish to expose it.';
    });
    event.target.value = '';
  }
  async function archiveAsset(a) {
    if (!window.confirm('Archive this unpublished image?')) return;
    await run(async() => {
      await call('/assets/' + a.id, 'DELETE', {}, a.version);
      assets.value = (await call('/assets')).items;
      notice.value = 'Image archived.';
    });
  }
  return { upload, archiveAsset };
}
