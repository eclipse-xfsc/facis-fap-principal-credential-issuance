// Configurations panel view. Actions are supplied by the issuer controller.
export const pciConfigurationsPanelTemplate = `
<section v-if="tab==='configurations' && cap.issuer" class="configuration-workspace">
  <div class="workspace-stats">
    <div class="metric primary">
      <span class="metric-label">Configurations</span>
      <strong>{{configs.length}}</strong>
      <small>Within your access scope</small>
    </div>
    <div class="metric">
      <span class="metric-label">Published</span>
      <strong>{{configs.filter(c=>c.activeVersion && c.state!=='archived').length}}</strong>
      <small>Available to eligible members</small>
    </div>
    <div class="metric">
      <span class="metric-label">Drafts</span>
      <strong>{{configs.filter(c=>c.state==='draft').length}}</strong>
      <small>Prepare before publishing</small>
    </div>
  </div>
  <section class="card registry-card">
    <div class="registry-toolbar">
      <div>
        <h3>Credential configurations</h3>
        <p>Manage your organization’s credential catalogue.</p>
      </div>
      <button v-if="cap.globalIssuer" @click="newConfig">+ Create configuration</button>
    </div>
    <div class="registry-filters">
      <label class="config-search">
        Search configurations
        <input type="search" v-model="query" placeholder="Search by name or identifier">
      </label>
      <label>
        State
        <select v-model="configState">
          <option value="all">All states</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <span class="result-count">{{filteredConfigs.length}} results</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Format</th>
            <th>Status</th>
            <th>Version</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in filteredConfigs" :key="c.id">
            <td>
              <strong>{{c.draft.name}}</strong>
              <small>{{c.draft.identifier}}</small>
            </td>
            <td>
              <code>{{c.draft.format}}</code>
            </td>
            <td>
              <span class="badge" :class="'badge-'+c.state">{{c.state}}</span>
            </td>
            <td>
              {{c.activeVersion?'Published v'+c.activeVersion:'Not published'}}
              <small>Draft revision {{c.version}}</small>
            </td>
            <td>
              <button class="secondary compact" @click="editConfig(c)">{{c.state==='archived'?'View':'Edit'}}</button>
            </td>
          </tr>
          <tr v-if="!filteredConfigs.length">
            <td colspan="5" class="empty">{{configs.length?'No configurations match these filters.':'Create your first configuration to get started.'}}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <section class="card" v-if="configForm">
    <h3>{{selected?'Edit configuration':'New configuration'}}</h3>
    <form @submit.prevent="saveConfig" class="sr2-form">
      <label>
        Stable identifier
        <input
          v-model="configForm.identifier"
          :disabled="!!selected"
          required
          pattern="[A-Za-z][A-Za-z0-9_-]{0,63}"
        >
      </label>
      <label>
        Name
        <input v-model="configForm.name" required maxlength="100">
      </label>
      <label>
        Description
        <textarea v-model="configForm.description" maxlength="1000">
        </textarea>
      </label>
      <div class="two-column">
        <label>
          Protocol profile
          <select v-model="configForm.profile">
            <option>oid4vci-draft13</option>
            <option>oid4vci-1.0</option>
          </select>
        </label>
        <label>
          Credential format
          <select v-model="configForm.format">
            <option>jwt_vc_json</option>
            <option v-if="configForm.profile==='oid4vci-draft13'">vc+sd-jwt</option>
            <option v-if="configForm.profile==='oid4vci-1.0'">dc+sd-jwt</option>
            <option>ldp_vc</option>
          </select>
        </label>
      </div>
      <label>
        Credential types (comma separated)
        <input
          :value="configForm.credentialTypes.join(', ')"
          @input="configForm.credentialTypes=$event.target.value.split(',').map(x=>x.trim()).filter(Boolean)"
        >
      </label>
      <label v-if="configForm.format.includes('sd-jwt')">
        VCT
        <input v-model="configForm.vct" required>
      </label>
      <fieldset>
        <legend>Claim definitions</legend>
        <div v-for="(claim,i) in configForm.claims" :key="i" class="sr2-row">
          <label>
            Claim name
            <input v-model="claim.name" required>
          </label>
          <label>
            Type
            <select v-model="claim.type">
              <option>string</option>
              <option>number</option>
              <option>boolean</option>
            </select>
          </label>
          <label>
            <input type="checkbox" v-model="claim.required">Required</label>
          <button type="button" class="secondary" @click="configForm.claims.splice(i,1)">Remove claim</button>
        </div>
        <button
          type="button"
          class="secondary"
          @click="configForm.claims.push({name:'',type:'string',required:true})"
        >Add claim</button>
      </fieldset>
      <label>
        Signing mode
        <select v-model="configForm.signingMode">
          <option>internal-signing</option>
          <option>participant-signed</option>
        </select>
      </label>
      <label>
        Tenant key reference
        <input v-model="configForm.keyRef" required>
      </label>
      <label>
        Status profile
        <input v-model="configForm.statusProfile" required>
      </label>
      <label>
        Approved participant connector
        <select v-model="configForm.connectorId">
          <option :value="null">Select an approved connector</option>
          <option v-for="c in availableConnectors" :value="c.id">{{c.draft.name}}</option>
        </select>
        <small>Save the configuration first, then ask a tenant administrator to approve its connector access.</small>
      </label>
      <label>
        Published journey
        <select v-model="configForm.flowId">
          <option :value="null">Assign after creating a journey</option>
          <option
            v-for="f in flows.filter(x=>x.configurationId===selected?.id && x.activeVersion)"
            :value="f.id"
          >{{f.draft.name}} · v{{f.activeVersion}}</option>
        </select>
      </label>
      <fieldset>
        <legend>Eligibility</legend>
        <label>
          <input
            type="checkbox"
            :checked="configForm.eligibility.roles.includes('principal')"
            @change="configForm.eligibility.roles=$event.target.checked?['principal']:[]"
          >All enabled tenant principals</label>
        <label>
          Specific member subject IDs (comma separated)
          <textarea
            :value="configForm.eligibility.subjects.join(', ')"
            @input="configForm.eligibility.subjects=$event.target.value.split(',').map(x=>x.trim()).filter(Boolean)"
          >
          </textarea>
        </label>
        <label>
          Identity provider roles or groups (comma separated)
          <input
            :value="(configForm.eligibility.entitlements || []).join(', ')"
            @input="configForm.eligibility.entitlements=$event.target.value.split(',').map(x=>x.trim()).filter(Boolean)"
            placeholder="role:director, group:/employees"
          >
        </label>
        <label>
          Requests per minute
          <input type="number" min="1" max="60" v-model.number="configForm.ratePerMinute">
        </label>
        <p>Revocation blocks reissuance. Tenant administrators can explicitly remove the block from History.</p>
      </fieldset>
      <label>
        Logo asset
        <select v-model="configForm.logoAssetId">
          <option :value="null">No logo</option>
          <option
            v-for="a in assets.filter(x=>x.configurationId===selected?.id && x.state!=='archived')"
            :value="a.id"
          >{{a.id}}</option>
        </select>
      </label>
      <label>
        Background asset
        <select v-model="configForm.backgroundAssetId">
          <option :value="null">No background</option>
          <option
            v-for="a in assets.filter(x=>x.configurationId===selected?.id && x.state!=='archived')"
            :value="a.id"
          >{{a.id}}</option>
        </select>
      </label>
      <button :disabled="busy || selected?.state==='archived'">Save draft</button>
    </form>
    <div class="actions" v-if="selected && selected.state!=='archived'">
      <button class="secondary" @click="configAction('validate')">Validate</button>
      <button class="secondary" @click="configAction('preview')">Preview</button>
      <button @click="configAction('publish')">Publish locally</button>
      <button class="danger" @click="configAction('archive')">Archive</button>
    </div>
    <button v-if="selected" type="button" class="secondary" @click="exportTemplate" :disabled="busy">Export semantic template</button>
    <fieldset v-if="selected">
      <legend>Credential image</legend>
      <label>
        Use as
        <select v-model="uploadRole">
          <option value="logoAssetId">Logo</option>
          <option value="backgroundAssetId">Background</option>
        </select>
      </label>
      <label>
        Upload PNG (RGB/RGBA, up to 1 MiB and 1024×1024)
        <input type="file" accept="image/png" @change="uploadScope='configuration';upload($event)">
      </label>
    </fieldset>
    <ul class="sr2-list">
      <li v-for="a in assets.filter(x=>x.configurationId===selected?.id)" :key="a.id">
        <span>{{a.draft.width}}×{{a.draft.height}} · {{a.draft.size}} bytes · {{a.state}}</span>
        <button v-if="!a.public && a.state!=='archived'" class="secondary" @click="archiveAsset(a)">Archive image</button>
      </li>
    </ul>
    <div v-if="selected && selected.state!=='archived'" class="actions">
      <label>
        Restore version
        <input type="number" min="1" v-model="restoreVersion">
      </label>
      <button class="secondary" @click="restoreConfig">Restore as draft</button>
    </div>
    <p v-if="selected">Active version: {{selected.activeVersion || 'none'}} · Draft revision: {{selected.version}}</p>
    <details v-if="versions.length">
      <summary>Immutable version history</summary>
      <ol>
        <li v-for="v in versions" :key="v.version">Version {{v.version}} · {{v.content_hash}}</li>
      </ol>
    </details>
  </section>
</section>
`;
