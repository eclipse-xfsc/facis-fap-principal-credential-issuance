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
/** Refresh operations with explicit state and I/O dependencies. */
export function createPciRefreshActions(state, dependencies) {
  const {
    cap,
    loaded,
    tab,
    connectors,
    eligible,
    presentationConfigurations,
    configs,
    flows,
    assets,
    members,
    assignments,
    metadata,
    metadataForm,
    authServers,
    branding,
    brandingForm,
    settings,
    settingsForm,
    publication,
    preview,
    notice,
    selected,
    configForm,
    selectedFlow,
    flowForm,
    identity,
    identityForm,
    connector
  } = state;
  const { run, call, loadIdentity, api, props, clone, restoreJourney, rememberWorkspace, recovery, sections } = dependencies;
  async function refresh() {
    await run(async() => {
      cap.value = await call('/issuer-capabilities');
      if (!loaded.value) {
        if (tab.value !== 'presentation' && !recovery?.tab) tab.value = cap.value.issuer ? 'configurations': 'request';
        loaded.value = true;
      } if (!sections.value.some(s => s.id === tab.value)) tab.value = 'request';
      connectors.value = cap.value.connectors || [];
      eligible.value = (await call('/eligible-configurations')).items;
      presentationConfigurations.value = (await call('/presentation-configurations')).items;
      if (cap.value.issuer) {
        configs.value = (await call('/credential-configurations')).items;
        flows.value = (await call('/flows')).items;
        assets.value = (await call('/assets')).items;
      } else {
        configs.value = [];
        flows.value = [];
        assets.value = [];
        selected.value = null;
        configForm.value = null;
        selectedFlow.value = null;
        flowForm.value = null;
      }
      if (cap.value.tenantAdmin) {
        await loadIdentity();
        connectors.value = (await call('/participant-connectors')).items;
        members.value = (await api.tenantMembers(props.tenant.tenantId)).items;
        assignments.value = (await call('/administrators')).items;
        metadata.value = (await call('/issuer-metadata')).item;
        if (metadata.value) {
          metadataForm.value = clone(metadata.value.draft);
          authServers.value = metadataForm.value.authorizationServers.join(', ');
        }
        branding.value = (await call('/branding')).item;
        if (branding.value) brandingForm.value = { ...brandingForm.value, ...clone(branding.value.draft) };
        settings.value = (await call('/issuer-settings')).item;
        if (settings.value) settingsForm.value = clone(settings.value.draft);
        publication.value = await call('/publication');
      } else {
        members.value = [];
        assignments.value = [];
        identity.value = null;
        identityForm.value.clientSecret = '';
        metadata.value = null;
        branding.value = null;
        settings.value = null;
        publication.value = null;
        connector.value = null;
      }
      await restoreJourney();
    });
  }
  function navigate(id) {
    tab.value = id;
    preview.value = null;
    notice.value = '';
    rememberWorkspace();
  }
  return { refresh, navigate };
}
