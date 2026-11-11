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
// History panel view. Actions are supplied by the issuer controller.
export const pciHistoryPanelTemplate = `
<section class="card" v-if="tab==='history' && cap.issuer">
  <h3>Issuance history</h3>
  <form @submit.prevent="search.cursor='';loadHistory()" class="sr2-form history-filters">
    <label>
      Configuration
      <select v-model="historyConfig" required>
        <option v-for="c in configs" :value="c.id">{{c.draft.name}}</option>
      </select>
    </label>
    <label>
      Credential ID
      <input v-model="search.credentialId" placeholder="Exact credential URI">
    </label>
    <label>
      Request UUID
      <input v-model="search.requestId">
    </label>
    <label>
      Principal name, email or username
      <input v-model="search.principal" maxlength="200">
    </label>
    <label>
      Pseudonymous subject hash
      <input v-model="search.subjectHash">
    </label>
    <label>
      From
      <input type="datetime-local" v-model="search.from">
    </label>
    <label>
      To
      <input type="datetime-local" v-model="search.to">
    </label>
    <label>
      Event type
      <input v-model="search.type" placeholder="issued, revoked, offered">
    </label>
    <button :disabled="busy">Search</button>
  </form>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Time / event</th>
          <th>Credential / request</th>
          <th>Current state</th>
          <th>Status reference</th>
          <th>Principal / holder</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in history" :key="e.cursor">
          <td>
            {{new Date(e.createdAt).toLocaleString()}}
            <small>{{e.type}}</small>
          </td>
          <td>
            <strong>{{e.credentialId || 'Not recorded'}}</strong>
            <small>{{e.requestId || '—'}}</small>
          </td>
          <td>
            <span class="badge" :class="'badge-'+e.currentState">{{e.currentState || '—'}}</span>
          </td>
          <td>
            <template v-if="e.statusReference">
              <code>{{e.statusReference.id}}</code>
              <small>{{e.statusReference.type}} · {{e.statusReference.statusPurpose}}</small>
              <small v-if="e.statusReference.statusListIndex">Index {{e.statusReference.statusListIndex}}</small>
            </template>
            <span v-else>Not allocated</span>
          </td>
          <td>
            <strong>{{e.principal?.name || e.principal?.username || "Identity unavailable"}}</strong>
            <small>{{e.principal?.email}}</small>
            <code>{{e.subjectHash}}</code>
            <small v-if="e.holderDid">Holder: {{e.holderDid}}</small>
            <details v-if="e.principalJwt">
              <summary>Principal information JWT</summary>
              <code>{{e.principalJwt}}</code>
              <p>This short-lived history statement is not a login token.</p>
            </details>
          </td>
          <td>
            <button
              v-if="e.type==='issued' && ['issued','revoking','revocation_indeterminate'].includes(e.currentState)"
              class="danger"
              @click="revoke(e.requestId)"
            >{{e.currentState==='issued'?'Revoke':'Retry revocation'}}</button>
          </td>
        </tr>
        <tr v-if="!history.length">
          <td colspan="6" class="empty">Choose a configuration and search to view its history.</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="muted">
    Current state is the latest locally confirmed issuance state. Status references are recorded from
    issuance, not a live status-list check.
  </p>
  <button v-if="nextCursor" class="secondary" @click="search.cursor=String(nextCursor);loadHistory(true)">Load older events</button>
</section>
`;
