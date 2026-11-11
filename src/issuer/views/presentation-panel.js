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
// Presentation panel view. Actions are supplied by the issuer controller.
export const pciPresentationPanelTemplate = `
<section v-if="tab==='presentation'" class="card">
  <h3>Verify your credential</h3>
  <p>
    This verifies a holder-bound JWT credential issued by this tenant. It does not sign you in or retain the
    presented claims.
  </p>
  <form class="sr2-form" @submit.prevent="startPresentation">
    <label>
      Issued configuration
      <select v-model="presentationConfig" required>
        <option disabled value="">Choose a configuration</option>
        <option v-for="c in presentationConfigurations" :key="c.id" :value="c.id">{{c.name}}</option>
      </select>
    </label>
    <label>
      Presentation protocol
      <select v-model="presentationProfile">
        <option value="oid4vp-draft13">OpenID4VP Draft 13</option>
        <option value="oid4vp-1.0">OpenID4VP 1.0</option>
      </select>
    </label>
    <button :disabled="busy || !presentationConfig">Request wallet presentation</button>
  </form>
  <div v-if="presentation">
    <a v-if="presentation.requestUri" :href="presentation.requestUri" class="button-link">Open wallet</a>
    <img
      v-if="presentationQr"
      class="offer-qr"
      :src="presentationQr"
      alt="Scan to present the selected credential"
    >
    <p>
      The request expires after five minutes. After approving it in your wallet, use the confirmation code in
      its return URL.
    </p>
    <form class="sr2-form" @submit.prevent="checkPresentation">
      <label>
        Wallet confirmation code
        <input v-model="presentationCode" autocomplete="off" maxlength="43">
      </label>
      <button :disabled="busy || presentationResult?.status==='verified'">Check presentation</button>
    </form>
    <p v-if="presentationResult" role="status">{{presentationStatusMessage}}</p>
  </div>
</section>
`;
