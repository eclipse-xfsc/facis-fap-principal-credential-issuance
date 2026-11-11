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
// Delegation slot view. Actions are supplied by the issuer controller.
export const pciDelegationSlotTemplate = `
<slot v-if="tab==='delegation' && cap.tenantAdmin" name="members">
</slot>
`;
