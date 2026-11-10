// Connectors panel view. Actions are supplied by the issuer controller.
export const pciConnectorsPanelTemplate = `
<section class="card" v-if="tab==='connectors' && cap.tenantAdmin">
  <div class="registry-toolbar">
    <h3>Participant connectors</h3>
    <button class="secondary" @click="newConnector">+ New connector</button>
  </div>
  <ul class="sr2-list">
    <li v-for="c in connectors">
      <button class="secondary" @click="editConnector(c)">{{c.draft.name}} · {{c.id}}</button>
    </li>
  </ul>
  <form @submit.prevent="saveConnector" class="sr2-form">
    <fieldset>
      <legend>Configuration access</legend>
      <label>
        <input
          type="checkbox"
          :checked="connectorForm.configurationIds===null"
          @change="connectorForm.configurationIds=$event.target.checked?null:[]"
        >Allow all configurations in this tenant</label>
      <template v-if="connectorForm.configurationIds!==null">
        <label v-for="c in configs.filter(c=>c.state!=='archived')" :key="c.id">
          <input type="checkbox" :value="c.id" v-model="connectorForm.configurationIds">{{c.draft.name}}</label>
        <p class="muted">No selection denies access. Changes apply immediately to new and in-progress requests.</p>
      </template>
    </fieldset>
    <label>
      Name
      <input v-model="connectorForm.name" required>
    </label>
    <label>
      HTTPS endpoint
      <input type="url" v-model="connectorForm.endpoint" required>
    </label>
    <label>
      TLS server name
      <input v-model="connectorForm.serverName" required>
    </label>
    <label>
      Protocol version
      <input v-model="connectorForm.protocolVersion" required>
    </label>
    <label>
      Client TLS Secret name
      <input v-model="connectorForm.tlsSecret.name" required>
    </label>
    <label>
      Trust Secret name
      <input v-model="connectorForm.trustSecret.name" required>
    </label>
    <label>
      JWT issuer
      <input type="url" v-model="connectorForm.jwtIssuer" required>
    </label>
    <label>
      JWT audience
      <input v-model="connectorForm.jwtAudience" required>
    </label>
    <label>
      Scopes (comma separated)
      <input
        :value="connectorForm.jwtScopes.join(', ')"
        @input="connectorForm.jwtScopes=$event.target.value.split(',').map(x=>x.trim()).filter(Boolean)"
      >
    </label>
    <fieldset>
      <legend>Supported signing modes</legend>
      <label>
        <input type="checkbox" value="internal-signing" v-model="connectorForm.signingModes">Internal signing</label>
      <label>
        <input type="checkbox" value="participant-signed" v-model="connectorForm.signingModes">Participant signed</label>
    </fieldset>
    <label>
      Deadline (milliseconds)
      <input type="number" min="100" max="10000" v-model.number="connectorForm.timeoutMs">
    </label>
    <label>
      Attempts for verified idempotent calls
      <input type="number" min="1" max="3" v-model.number="connectorForm.attempts">
    </label>
    <label>
      Requests per minute
      <input type="number" min="1" max="60" v-model.number="connectorForm.ratePerMinute">
    </label>
    <label>
      Failures before temporarily pausing calls
      <input type="number" min="2" max="10" v-model.number="connectorForm.circuitFailureThreshold">
    </label>
    <label>
      Pause duration (milliseconds)
      <input type="number" min="1000" max="300000" v-model.number="connectorForm.circuitCooldownMs">
    </label>
    <button :disabled="busy">Save and activate connector</button>
  </form>
</section>
`;
