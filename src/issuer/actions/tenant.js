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
import { applyPciTheme } from '../../state/theme.js';
/** Tenant operations with explicit state and I/O dependencies. */
export function createPciTenantActions(state, dependencies) {
  const { metadata, branding, settings, notice, metadataForm, authServers, publication } = state;
  const { run, call, props, clone, window } = dependencies;
  async function saveSingleton(kind, item, form, publish = false) {
    await run(async() => {
      const r = await call('/' + kind, item ? 'PUT': 'POST', { data: form }, item?.version);
      let saved = r.item;
      if (publish) saved = (await call('/' + kind + '/publish', 'POST', {}, saved.version)).item;
      if (kind === 'issuer-metadata') metadata.value = saved;
      if (kind === 'branding') {
        branding.value = saved;
        props.tenant.branding = clone(saved.draft);
        applyPciTheme(window?.document?.documentElement, props.tenant.branding);
      } if (kind === 'issuer-settings') settings.value = saved;
      notice.value = publish ? 'Saved and activated locally.': 'Settings saved.';
    });
  }
  async function saveMetadata() {
    metadataForm.value.authorizationServers = authServers.value.split(',').map(x => x.trim()).filter(Boolean);
    await saveSingleton('issuer-metadata', metadata.value, metadataForm.value, true);
  }
  async function publishMetadata() {
    await run(async() => {
      await call('/publication', 'POST');
      notice.value = 'Upstream metadata publication confirmed.';
    });
    publication.value = await call('/publication').catch(() => publication.value);
  }
  async function lifecycle(state) {
    const confirmation = window.prompt('Enter the tenant slug to confirm ' + state + ':');
    if (confirmation === null) return;
    await run(async() => {
      await call('/lifecycle', 'POST', { state, confirmation });
      window.location.reload();
    });
  }
  return { saveSingleton, saveMetadata, publishMetadata, lifecycle };
}
