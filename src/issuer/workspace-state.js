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
import { newPciConnectorForm } from './form-defaults.js';
/** Per-component state. Secret inputs stay in memory and are not persisted here. */
export function createPciIssuerState({ ref, props, runtime, window }) {
  const query = ref('');
  const configState = ref('all');
  const loaded = ref(false);
  const settingsTab = ref('branding');
  const tab = ref('request');
  const notice = ref('');
  const error = ref(null);
  const busy = ref(false);
  const cap = ref({});
  const configs = ref([]);
  const flows = ref([]);
  const connectors = ref([]);
  const assets = ref([]);
  const assignments = ref([]);
  const members = ref([]);
  const eligible = ref([]);
  const history = ref([]);
  const versions = ref([]);
  const publication = ref(null);
  const selected = ref(null);
  const selectedFlow = ref(null);
  const configForm = ref(null);
  const flowForm = ref(null);
  const preview = ref(null);
  const metadata = ref(null);
  const branding = ref(null);
  const connector = ref(null);
  const settings = ref(null);
  const metadataForm = ref({
    profile: 'oid4vci-1.0',
    issuer: window.location.origin + runtime.basePath,
    authorizationServers: [window.location.origin + runtime.basePath],
    did: 'did:web:' + window.location.hostname,
    tokenKeyRef: 'preauth',
    jwksUrl: window.location.origin + runtime.basePath + '/.well-known/jwks.json',
    displayName: props.tenant.organizationName
  });
  const identity = ref(null);
  const identityRedirect = ref('');
  const identityForm = ref({
    mode: 'keycloak',
    displayName: 'Organization account',
    issuer: '',
    clientId: '',
    clientSecret: '',
    audience: '',
    scopes: 'openid profile email'
  });
  const keyName = ref('issuer');
  const keyType = ref('ecdsa-p256');
  const authServers = ref(window.location.origin + runtime.basePath);
  const brandingForm = ref({
    title: props.tenant.organizationName,
    description: '',
    accent: '#005FFF',
    background: '#E1E7EF',
    foreground: '#1f2937',
    font: 'system',
    layout: 'wide',
    corners: 'rounded',
    footer: '',
    logoAssetId: null
  });
  const connectorForm = ref(newPciConnectorForm());
  const settingsForm = ref({ ratePerMinute: 30, maxConcurrent: 2 });
  const grant = ref({ subject: '', configurationIds: null });
  const grantConfig = ref('');
  const search = ref({ principal: '', credentialId: '', requestId: '', subjectHash: '', type: '', cursor: '', from: '', to: '' });
  const nextCursor = ref(null);
  const historyConfig = ref('');
  const restoreVersion = ref('');
  const journey = ref(null);
  const answers = ref({});
  const consent = ref(false);
  const offer = ref(null);
  const uploadRole = ref('logoAssetId');
  const uploadScope = ref('configuration');
  const presentationConfigurations = ref([]);
  const presentationConfig = ref('');
  const presentationProfile = ref('oid4vp-1.0');
  const presentation = ref(null);
  const presentationCode = ref('');
  const presentationResult = ref(null);
  return {
    query,
    configState,
    loaded,
    settingsTab,
    tab,
    notice,
    error,
    busy,
    cap,
    configs,
    flows,
    connectors,
    assets,
    assignments,
    members,
    eligible,
    history,
    versions,
    publication,
    selected,
    selectedFlow,
    configForm,
    flowForm,
    preview,
    metadata,
    branding,
    connector,
    settings,
    metadataForm,
    identity,
    identityRedirect,
    identityForm,
    keyName,
    keyType,
    authServers,
    brandingForm,
    connectorForm,
    settingsForm,
    grant,
    grantConfig,
    search,
    nextCursor,
    historyConfig,
    restoreVersion,
    journey,
    answers,
    consent,
    offer,
    uploadRole,
    uploadScope,
    presentationConfigurations,
    presentationConfig,
    presentationProfile,
    presentation,
    presentationCode,
    presentationResult
  };
}
