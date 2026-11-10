// Delegation panel view. Actions are supplied by the issuer controller.
export const pciDelegationPanelTemplate = `
<section class="card" v-if="tab==='delegation' && cap.tenantAdmin">
  <h3>Issuer administration delegation</h3>
  <form @submit.prevent="assign" class="sr2-form">
    <label>
      Enabled member
      <select v-model="grant.subject" required>
        <option v-for="m in members.filter(x=>x.enabled)" :value="m.subject">{{m.username}}</option>
      </select>
    </label>
    <label>
      Scope
      <select v-model="grantConfig">
        <option value="">All configurations, including creation</option>
        <option v-for="c in configs" :value="c.id">{{c.draft.name}}</option>
      </select>
    </label>
    <button :disabled="busy">Assign issuer capability</button>
  </form>
  <ul>
    <li v-for="a in assignments" :key="a.id" :data-assignment-id="a.id">
      {{a.subject}} · {{a.configurationIds===null?'All configurations':a.configurationIds.join(', ')}} · {{a.revoked?'Revoked':'Active'}}
      <button v-if="!a.revoked" class="secondary" @click="revokeAssignment(a)">Revoke</button>
    </li>
  </ul>
</section>
`;
