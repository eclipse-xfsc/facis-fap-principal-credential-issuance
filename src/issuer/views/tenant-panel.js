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
// Tenant panel view. Actions are supplied by the issuer controller.
export const pciTenantPanelTemplate = `
<section v-if="tab==='tenant' && cap.tenantAdmin" class="tenant-settings">
  <nav class="settings-tabs" aria-label="Tenant settings tasks">
    <button
      v-for="item in tenantSettingsTabs"
      :key="item.id"
      class="secondary"
      :aria-pressed="settingsTab===item.id"
      @click="settingsTab=item.id"
    >{{item.label}}</button>
  </nav>
  <section v-if="settingsTab==='branding'" class="card settings-panel">
    <h3>Tenant branding</h3>
    <form @submit.prevent="saveSingleton('branding',branding,brandingForm,true)" class="sr2-form">
      <label>
        Title
        <input v-model="brandingForm.title" required>
      </label>
      <label>
        Description
        <textarea v-model="brandingForm.description">
        </textarea>
      </label>
      <p class="form-guidance">
        Your title, description, logo, colors, typography, corners and page width apply to your tenant's pages as
        soon as the branding is activated. The defaults follow the FACIS interface standard. Colors must keep a
        contrast of at least 4.5:1: the accent with white text, the text color on the page and on white cards.
      </p>
      <div class="theme-colors">
        <label>
          Accent color
          <input v-model="brandingForm.accent" type="color">
        </label>
        <label>
          Page color
          <input v-model="brandingForm.background" type="color">
        </label>
        <label>
          Text color
          <input v-model="brandingForm.foreground" type="color">
        </label>
      </div>
      <label>
        Font
        <select v-model="brandingForm.font">
          <option value="system">FACIS system sans-serif</option>
          <option value="sans">Classic sans-serif</option>
          <option value="serif">Serif</option>
          <option value="rounded">Rounded sans-serif</option>
          <option value="mono">Monospace</option>
        </select>
      </label>
      <label>
        Corners
        <select v-model="brandingForm.corners">
          <option value="rounded">Rounded (FACIS)</option>
          <option value="soft">Slightly rounded</option>
          <option value="square">Square</option>
        </select>
      </label>
      <label>
        Content width
        <select v-model="brandingForm.layout">
          <option value="wide">Standard shell</option>
          <option value="focused">Focused shell</option>
          <option value="full">Full page width</option>
        </select>
      </label>
      <button
        type="button"
        class="secondary"
        @click="brandingForm.accent='#005FFF';brandingForm.background='#E1E7EF';brandingForm.foreground='#1F2937';brandingForm.font='system';brandingForm.corners='rounded';brandingForm.layout='wide'"
      >Reset to FACIS defaults</button>
      <label>
        Footer text
        <textarea v-model="brandingForm.footer" maxlength="500">
        </textarea>
      </label>
      <label>
        Tenant logo PNG
        <input type="file" accept="image/png" @change="uploadScope='tenant';upload($event)">
      </label>
      <button :disabled="busy">Activate branding</button>
    </form>
  </section>
  <section v-if="settingsTab==='signing'" class="card settings-panel">
    <h3>Signing keys</h3>
    <form @submit.prevent="createKey" class="sr2-form">
      <label>
        Key name
        <input v-model="keyName" required pattern="[A-Za-z0-9_-]{1,64}">
      </label>
      <label>
        Key type
        <select v-model="keyType">
          <option>ecdsa-p256</option>
          <option>rsa-2048</option>
          <option>rsa-3072</option>
          <option>rsa-4096</option>
        </select>
      </label>
      <button :disabled="busy">Create key with TSA</button>
    </form>
    <p>Create a preauth key and a credential signing key before publishing metadata.</p>
  </section>
  <section v-if="settingsTab==='identity'" class="card settings-panel">
    <h3>Organization sign-in</h3>
    <p v-if="identity">Configuration: {{identity.state}} · version {{identity.version}}</p>
    <form @submit.prevent="saveIdentity" class="sr2-form">
      <label>
        Identity provider
        <select v-model="identityForm.mode">
          <option value="keycloak">PCI Keycloak accounts</option>
          <option value="oidc">Microsoft Entra or approved OIDC</option>
        </select>
      </label>
      <label>
        Sign-in display name
        <input v-model="identityForm.displayName" maxlength="100" required>
      </label>
      <template v-if="identityForm.mode==='oidc'">
        <label>
          OIDC issuer URL
          <input
            v-model="identityForm.issuer"
            type="url"
            required
            placeholder="https://login.microsoftonline.com/TENANT-ID/v2.0"
          >
        </label>
        <label>
          OIDC client ID
          <input v-model="identityForm.clientId" maxlength="200" required>
        </label>
        <label>
          Client secret (leave blank to retain)
          <input
            v-model="identityForm.clientSecret"
            type="password"
            autocomplete="new-password"
            maxlength="4096"
          >
        </label>
        <label>
          Participant API audience
          <input v-model="identityForm.audience" required maxlength="200">
        </label>
        <label>
          OIDC scopes
          <input v-model="identityForm.scopes" required maxlength="2000">
        </label>
        <label>
          Register this redirect URI
          <input :value="identityRedirect" readonly>
        </label>
      </template>
      <p>
        New organization accounts receive principal access. Grant issuer administration in Access &amp;
        members.
      </p>
      <button :disabled="busy||!identity">Save identity provider</button>
    </form>
  </section>
  <section v-if="settingsTab==='metadata'" class="card settings-panel">
    <h3>Issuer metadata</h3>
    <form @submit.prevent="saveMetadata" class="sr2-form">
      <label>
        Protocol profile
        <select v-model="metadataForm.profile">
          <option>oid4vci-draft13</option>
          <option>oid4vci-1.0</option>
        </select>
      </label>
      <label>
        Issuer URL
        <input v-model="metadataForm.issuer" readonly>
      </label>
      <label>
        Display name
        <input v-model="metadataForm.displayName" required>
      </label>
      <label>
        Authorization server URLs (comma separated)
        <textarea v-model="authServers" required>
        </textarea>
      </label>
      <label>
        Pre-authorization signing key
        <input v-model="metadataForm.tokenKeyRef" required>
      </label>
      <label>
        Tenant DID
        <input v-model="metadataForm.did" required>
      </label>
      <label>
        Tenant JWKS URL
        <input v-model="metadataForm.jwksUrl" type="url" required>
      </label>
      <button :disabled="busy">Save and publish locally</button>
    </form>
    <p>
      Publication: {{publication?.state?.state || 'draft'}} · desired {{publication?.state?.desired || 0}} / observed {{publication?.state?.observed || 0}}
    </p>
    <button class="secondary" @click="publishMetadata">Publish to OCM</button>
  </section>
  <section v-if="settingsTab==='limits'" class="card settings-panel">
    <h3>Issuance limits</h3>
    <form @submit.prevent="saveSingleton('issuer-settings',settings,settingsForm)" class="sr2-form">
      <label>
        Tenant requests per minute
        <input type="number" min="1" max="120" v-model.number="settingsForm.ratePerMinute">
      </label>
      <label>
        Concurrent participant requests
        <input type="number" min="1" max="8" v-model.number="settingsForm.maxConcurrent">
      </label>
      <button :disabled="busy">Save limits</button>
    </form>
  </section>
  <section v-if="settingsTab==='lifecycle'" class="card settings-panel">
    <h3>Tenant lifecycle</h3>
    <button class="secondary" @click="lifecycle('suspended')">Suspend tenant</button>
    <button class="danger" @click="lifecycle('deleting')">Request tenant deletion</button>
  </section>
</section>
`;
