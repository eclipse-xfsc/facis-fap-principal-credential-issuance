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
export const PCI_ISSUER_MODULES = [
  "src/issuer/client.js",
  "src/issuer/form-defaults.js",
  "src/issuer/workspace-state.js",
  "src/issuer/workspace-selectors.js",
  "src/issuer/actions/identity.js",
  "src/issuer/actions/configurations.js",
  "src/issuer/actions/flows.js",
  "src/issuer/actions/tenant.js",
  "src/issuer/actions/connectors.js",
  "src/issuer/actions/access.js",
  "src/issuer/actions/assets.js",
  "src/issuer/actions/history.js",
  "src/issuer/actions/presentation.js",
  "src/issuer/actions/journey.js",
  "src/issuer/actions/refresh.js",
  "src/issuer/operation-runner.js",
  "src/issuer/controller.js",
  "src/issuer/views/presentation-panel.js",
  "src/issuer/views/request-panel.js",
  "src/issuer/views/configurations-panel.js",
  "src/issuer/views/journeys-panel.js",
  "src/issuer/views/history-panel.js",
  "src/issuer/views/tenant-panel.js",
  "src/issuer/views/connectors-panel.js",
  "src/issuer/views/delegation-slot.js",
  "src/issuer/views/delegation-panel.js",
  "src/issuer/console-template.js",
  "src/sr2.js"
];
// Explicit dependency order for the flat ORCE and browser bundles.
export const PCI_UI_MODULES = [
  "shared/public-url.js",
  "src/config/runtime.js",
  "src/utils/pkce.js",
  "src/state/store.js",
  "src/state/reducers.js",
  "src/state/theme.js",
  "src/services/transport.js",
  "src/components/feedback.js",
  "src/services/api.js",
  "src/services/auth.js",
  "src/qr-tables.js",
  "src/qr.js",
  ...PCI_ISSUER_MODULES,
  "src/main.js"
];
export const PCI_SR2_MODULES = [
  "domain.js",
  "journey-input.js",
  "assets.js",
  "participant-security.js",
  "store.js",
  "adapter-contracts.js",
  "native-keys.js",
  "linked-data.js",
  "native-metadata.js",
  "sdjwt.js",
  "wire.js",
  "native.js",
  "adapters.js",
  "transport.js",
  "profiles.js",
  "history.js",
  "semantics.js",
  "service-policy.js",
  "service.js",
  "revocation.js",
  "issuance.js",
  "presentation.js",
  "maintenance.js",
  "runtime.js",
  "http.js"
];
