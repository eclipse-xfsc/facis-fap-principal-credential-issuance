import { pciPresentationPanelTemplate } from './views/presentation-panel.js';
import { pciRequestPanelTemplate } from './views/request-panel.js';
import { pciConfigurationsPanelTemplate } from './views/configurations-panel.js';
import { pciJourneysPanelTemplate } from './views/journeys-panel.js';
import { pciHistoryPanelTemplate } from './views/history-panel.js';
import { pciTenantPanelTemplate } from './views/tenant-panel.js';
import { pciConnectorsPanelTemplate } from './views/connectors-panel.js';
import { pciDelegationSlotTemplate } from './views/delegation-slot.js';
import { pciDelegationPanelTemplate } from './views/delegation-panel.js';
// Workspace shell; independent feature panels are composed without extra runtime requests.
export const pciIssuerTemplate = `
<section class="sr2-console" aria-label="Credential issuance workspace">
  <aside class="workspace-sidebar">
    <div class="workspace-brand">
      <span class="workspace-monogram">PCI</span>
      <div>
        <strong>Credential issuance</strong>
        <small>FACIS Application Platform</small>
      </div>
    </div>
    <div class="workspace-tenant">
      <span class="nav-caption">ORGANIZATION</span>
      <strong>{{tenant.branding?.title || tenant.organizationName}}</strong>
      <small>{{tenant.primaryDomain}}</small>
    </div>
    <nav class="sr2-tabs" aria-label="Workspace sections">
      <button
        v-for="item in sections"
        :key="item.id"
        @click="navigate(item.id)"
        :aria-current="tab===item.id?'page':undefined"
        :aria-pressed="tab===item.id"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="item.icon"/>
        </svg>{{item.label}}</button>
    </nav>
    <div class="workspace-account">
      <span class="account-avatar" aria-hidden="true">{{(session.displayName || session.username || session.subject || 'U').slice(0,1).toUpperCase()}}</span>
      <div>
        <strong>{{session.displayName || session.username || session.subject}}</strong>
        <small>{{cap.tenantAdmin?'Tenant administrator':cap.issuer?'Issuer administrator':'Member'}}</small>
      </div>
    </div>
  </aside>
  <div class="workspace-main">
    <header class="workspace-header">
      <div>
        <span class="workspace-breadcrumb">Workspace / {{section.label}}</span>
        <h1>{{section.label}}</h1>
      </div>
      <button class="secondary" @click="refresh" :disabled="busy">{{busy?'Refreshing…':'Refresh'}}</button>
    </header>
    <div class="workspace-content" :aria-busy="busy">
      <p class="workspace-description">{{section.description}}</p>
      <p role="status" class="success" v-if="notice">{{notice}}</p>
      <ui-feedback :error="error" @dismiss="error=null" @recover="refresh" />
      <p v-if="!cap.integration?.ready" class="sr2-integration-status">
        Credential delivery is not connected yet. You can prepare configurations and journeys; issuance and
        revocation become available after integration setup.
      </p>
      ${pciPresentationPanelTemplate}
      ${pciRequestPanelTemplate}
      ${pciConfigurationsPanelTemplate}
      ${pciJourneysPanelTemplate}
      <section class="card" v-if="preview && ['configurations','journeys'].includes(tab)">
        <h3>Saved draft preview</h3>
        <template v-if="preview.steps">
          <article v-for="s in preview.steps" :key="s.id">
            <h4>{{s.title}}</h4>
            <p class="preserve-lines">{{s.text}}</p>
            <p>Step type: {{s.type}}</p>
            <label v-for="f in s.fields">
              {{f.label}}
              <input disabled :placeholder="f.required?'Required':'Optional'">
            </label>
          </article>
        </template>
        <template v-else>
          <h4>{{preview.name}}</h4>
          <p>{{preview.description}}</p>
          <p>{{preview.profile}} · {{preview.format}}</p>
          <ul>
            <li v-for="c in preview.claims">{{c.name}} ({{c.type}}) {{c.required?'required':''}}</li>
          </ul>
        </template>
        <button class="secondary" @click="preview=null">Close preview</button>
      </section>
      ${pciHistoryPanelTemplate}
      ${pciTenantPanelTemplate}
      ${pciConnectorsPanelTemplate}
      ${pciDelegationSlotTemplate}
      ${pciDelegationPanelTemplate}
    </div>
  </div>
</section>
`;
