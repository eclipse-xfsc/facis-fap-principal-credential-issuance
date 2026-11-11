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
/** Pure reactive projections of issuer state; no requests or persistence. */
const pciTenantSettingsTabs = [
  { "id": "branding", "label": "Branding" },
  { "id": "signing", "label": "Signing keys" },
  { "id": "identity", "label": "Organization sign-in" },
  { "id": "metadata", "label": "Issuer metadata" },
  { "id": "limits", "label": "Issuance limits" },
  { "id": "lifecycle", "label": "Lifecycle" }
];
export function createPciIssuerSelectors(state, { computed, pciQrImage }) {
  const {
    presentationResult,
    offer,
    presentation,
    journey,
    cap,
    tab,
    configs,
    configState,
    query,
    connectors,
    selected
  } = state;
  const qr = computed(() => {
    if (!offer.value) return null;
    try {
      return pciQrImage(offer.value.offerUrl);
    } catch {
      return null;
    }
  });
  const presentationQr = computed(() => {
    try {
      return presentation.value?.requestUri ? pciQrImage(presentation.value.requestUri): null;
    } catch {
      return null;
    }
  });
  const currentStep = computed(() => journey.value?.request?.state === 'journey' ? journey.value.flow.steps[journey.value.request.step]:
    null);
  const sections = computed(() => [
    {
      id: 'request',
      label: 'Request credential',
      icon: 'M5 4h14v16H5z M8 8h8 M8 12h5 M8 16h3',
      description: 'Choose a credential and follow your organization’s request journey.'
    },
    {
      id: 'presentation',
      label: 'Verify credential',
      icon: 'M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7z M8 12l3 3 5-6',
      description: 'Present a credential from your wallet to check holder binding and current revocation status.'
    },
    ...(cap.value.issuer ? [
      {
        id: 'configurations',
        label: 'Configurations',
        icon: 'M3 6h7l2 3h9v11H3z',
        description: 'Define credentials, review drafts, and manage published versions.'
      },
      {
        id: 'journeys',
        label: 'Journeys',
        icon: 'M5 5h5v5H5z M14 14h5v5h-5z M8 10v7h6',
        description: 'Build the steps your members follow to request a credential.'
      },
      {
        id: 'history',
        label: 'Issuance history',
        icon: 'M4 8V3 M4 8h5 M4 8a8 8 0 1 1-1 7 M12 7v5l3 2',
        description: 'Find credential records, inspect status, and manage revocation.'
      }
    ]: []),
    ...(cap.value.tenantAdmin ? [
      {
        id: 'tenant',
        label: 'Tenant settings',
        icon: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M7 7l-3-3 M17 17l3 3 M7 17l-3 3 M17 7l3-3 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
        description: 'Manage issuer identity, organization branding, and issuance limits.'
      },
      {
        id: 'connectors',
        label: 'Connectors',
        icon: 'M9 3v5 M15 3v5 M6 8h12v4a6 6 0 0 1-12 0z M12 18v3',
        description: 'Connect participant services and approve which configurations can use them.'
      },
      {
        id: 'delegation',
        label: 'Access & members',
        icon: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-3a7 7 0 0 1 14 0v3',
        description: 'Invite members and delegate issuer administration.'
      }
    ]: [])
  ]);
  const section = computed(() => sections.value.find(x => x.id === tab.value) || sections.value[0]);
  const filteredConfigs = computed(() => configs.value.filter(c => (configState.value === 'all' || c.state === configState.value) &&
  (c.draft.name + ' ' + c.draft.identifier).toLowerCase().includes(query.value.toLowerCase())));
  const availableConnectors = computed(() => connectors.value.filter(c => c.state !== 'archived' && (c.draft.configurationIds === null ||
  (c.draft.configurationIds || []).includes(selected.value?.id))));
  const presentationStatusMessage = computed(() => ({
    verified: 'Credential verified: holder proof and revocation checks passed.',
    failed: 'Verification failed. Check the credential, wallet profile and status, then start again.',
    awaiting_confirmation: 'Wallet response received. Enter its confirmation code.'
  })[presentationResult.value?.status] || 'Waiting for the wallet response.');
  return {
    presentationStatusMessage,
    tenantSettingsTabs: pciTenantSettingsTabs,
    qr,
    presentationQr,
    currentStep,
    sections,
    section,
    filteredConfigs,
    availableConnectors
  };
}
