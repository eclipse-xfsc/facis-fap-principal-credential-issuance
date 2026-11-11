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
if (msg.pciAction === 'presentation.respond') return handlePciPresentationResponse();
if (String(msg.pciAction || '').startsWith('native.')) return handlePciNative();
if (msg.pciAction === 'sr2.maintenance') return handleSr2Maintenance();
// M11_PCI-IssuerRuntime
return handleSr2([
  "presentation.configurations",
  "presentation.start",
  "presentation.result",
  "issuance.eligible",
  "issuance.start",
  "issuance.get",
  "issuance.advance",
  "issuance.offer",
  "internal.offer-create",
  "internal.offer-get",
  "internal.callback",
  "internal.plugin-put",
  "internal.plugin-delete",
  "internal.metadata-publish",
  "internal.publication-status"
]);
