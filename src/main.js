import { createApp, computed, onMounted, ref } from "vue";
import { api } from "./services/api.js";
import { beginLogin, completeLoginFromLocation } from "./services/auth.js";
import { store } from "./state/store.js";
import { runtime, applyPublicConfiguration } from "./config/runtime.js";
import "./styles.css";

const App = {
  components: { Sr2Console },
  setup() {
    const config = ref(null);
    const registrations = ref([]);
    const tenants = ref([]);
    const members = ref([]);
    const form = ref({ organizationIdentifier: "", organizationName: "", contactName: "", contactEmail: "", requestedSlug: "", registrationMode: "public" });
    const invite = ref({ username: "", email: "", firstName: "", lastName: "", role: "principal" });
    const submission = ref(null);
    const verification = ref({ state: "idle", message: "" });
    const hashRoute = ref(window.location.hash || "#/register");

    const isTenantHost = computed(() => Boolean(store.tenant));
    const isProvider = computed(() => hashRoute.value.startsWith("#/provider"));
    const isTenantAdmin = computed(() => store.session?.roles?.includes("participant_tenant_admin"));
    const isProviderAdmin = computed(() => store.session?.roles?.includes("provider_admin"));
    const pending = computed(() => registrations.value.filter((item) => item.state === "pending_approval"));

    function setError(error) {
      store.error = error instanceof Error ? error.message : String(error || "Unexpected error");
    }

    async function loadSession() {
      try { store.session = (await api.session()).session; } catch { store.session = null; }
    }

    async function loadTenant() {
      try { store.tenant = (await api.tenantContext()).tenant;
        try {store.tenant.branding=(await request('/api/v1/public/branding')).branding;}catch{}
        store.error = ""; } catch { store.tenant = null; }
    }

    async function loadProvider() {
      if (isTenantHost.value || !isProviderAdmin.value) return;
      store.busy = true;
      try {
        const [r, t] = await Promise.all([api.registrations(), api.tenants()]);
        registrations.value = r.items;
        tenants.value = t.items;
        store.error = "";
      } catch (error) { setError(error); }
      finally { store.busy = false; }
    }

    async function loadMembers() {
      if (!store.tenant || !isTenantAdmin.value) return;
      try { members.value = (await api.tenantMembers(store.tenant.tenantId)).items; store.error = ""; }
      catch (error) { setError(error); }
    }

    async function submitRegistration() {
      store.busy = true; store.error = "";
      try { submission.value = (await api.register(form.value)).registration; }
      catch (error) { setError(error); }
      finally { store.busy = false; }
    }

    async function verifyFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const registrationId = params.get("verify_registration");
      const token = params.get("token");
      if (!registrationId || !token) return;
      verification.value = { state: "working", message: "Verifying the single-use registration link..." };
      try {
        await api.verify(registrationId, token);
        verification.value = { state: "success", message: "Email verified. The registration is waiting for provider approval." };
      } catch (error) {
        verification.value = { state: "failed", message: error.message || "Verification failed." };
      }
    }

    async function decide(item, action) {
      const promptText = action === "approve" ? "Approval note (optional)" : "Rejection reason (required)";
      const reason = window.prompt(promptText, action === "approve" ? "Reviewed and approved" : "Registration requires correction");
      if (reason === null || (action === "reject" && reason.trim().length < 3)) return;
      try {
        if (action === "approve") await api.approve(item, reason);
        else await api.reject(item, reason);
        await loadProvider();
      } catch (error) { setError(error); }
    }

    async function inviteMember() {
      if (!store.tenant) return;
      store.busy = true; store.error = "";
      try {
        await api.inviteMember(store.tenant.tenantId, invite.value);
        invite.value = { username: "", email: "", firstName: "", lastName: "", role: "principal" };
        await loadMembers();
      } catch (error) { setError(error); }
      finally { store.busy = false; }
    }

    async function lifecycleTenant(tenant,state) {
      const confirmation=window.prompt('Enter the tenant slug to confirm '+state+':');if(confirmation===null)return;
      try {await request(`/api/v1/provider/tenants/${encodeURIComponent(tenant.tenantId)}/lifecycle`,{method:'POST',body:JSON.stringify({state,confirmation})});await loadProvider();}catch(error){setError(error);}
    }
    async function logout() {
      try { await api.logout(); } finally { store.session = null; window.location.assign(runtime.uiPath); }
    }

    function setupUibuilder() {
      if (!window.uibuilder) return;
      try {
        window.uibuilder.start();
        store.live.connected = true;
        window.uibuilder.onChange("msg", (msg) => {
          store.live.lastMessage = msg;
          if (msg?.topic === "pci:tenant-updated") {
            if (isTenantHost.value) void (async () => { await loadTenant(); await loadMembers(); })();
            else if (isProvider.value) void loadProvider();
          }
          if (msg?.topic === "pci:platform-status") store.platform = msg.payload;
        });
        window.uibuilder.send({ route: "status", type: "subscribe", data: {} });
      } catch { store.live.connected = false; }
    }

    onMounted(async () => {
      window.addEventListener("hashchange", () => {
        hashRoute.value = window.location.hash || "#/register";
        if (hashRoute.value.startsWith("#/provider") && !isTenantHost.value) void loadProvider();
      });
      try {
        config.value = await api.registrationConfig();
        applyPublicConfiguration(config.value);
      } catch (error) {
        setError(error);
        return;
      }
      setupUibuilder();
      try { await completeLoginFromLocation(); } catch (error) { setError(error); }
      await Promise.all([loadSession(), loadTenant()]);
      await verifyFromUrl();
      if (isProvider.value && !isTenantHost.value) await loadProvider();
      if (isTenantHost.value) await loadMembers();
      try { store.platform = await api.platformStatus(); } catch { /* platform endpoint may be warming up */ }
    });

    return {
      store, runtime, config, registrations, tenants, members, form, invite, submission, verification, hashRoute,
      isTenantHost, isProvider, isTenantAdmin, isProviderAdmin, pending,
      submitRegistration, decide, inviteMember, beginLogin, logout, lifecycleTenant, loadProvider, loadMembers,
    };
  },
  template: `
  <div class="app-shell">
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="topbar">
      <a class="brand" :href="runtime.uiPath" aria-label="FACIS FAP PCI home"><span class="brand-mark">FP</span><span><strong>FACIS FAP PCI</strong><small>Principal Credential Issuance</small></span></a>
      <nav aria-label="Primary">
        <a v-if="!isTenantHost" href="#/register">Registration</a>
        <a v-if="!isTenantHost" href="#/provider">Provider review</a>
        <button v-if="!store.session" class="link-button" @click="beginLogin">Sign in</button>
        <button v-else class="link-button" @click="logout">Sign out</button>
      </nav>
    </header>
    <main id="main">
      <div v-if="store.error" class="global-error" role="alert">{{ store.error }}</div>

      <section v-if="verification.state !== 'idle'" class="center-card card" aria-live="polite">
        <span class="status-icon" :class="verification.state">{{ verification.state === 'working' ? '...' : verification.state === 'success' ? 'OK' : '!' }}</span>
        <p class="eyebrow">EMAIL VERIFICATION</p>
        <h1>{{ verification.state === 'success' ? 'Registration verified' : verification.state === 'failed' ? 'Verification failed' : 'Checking link' }}</h1>
        <p>{{ verification.message }}</p>
        <a class="button-link secondary" :href="runtime.uiPath">Return to registration</a>
      </section>

      <section v-else-if="isTenantHost" class="tenant-landing" :class="{'tenant-workspace':store.session && store.tenant.state==='active'}" :style="{'--tenant-accent':store.tenant.branding?.accent}">
        <template v-if="!store.session || store.tenant.state!=='active'">
        <p class="eyebrow">PARTICIPANT PORTAL</p>
        <img v-if="store.tenant.branding?.logoAssetId" class="tenant-logo" :src="runtime.basePath+'/api/v1/public/assets/'+store.tenant.branding.logoAssetId" alt="Organization logo"><h1>{{ store.tenant.branding?.title || store.tenant.organizationName }}</h1>
        <p class="lead">{{store.tenant.branding?.description || 'Sign in to manage or request organization credentials.'}}</p>
        <div class="tenant-summary card dark-card">
          <span class="badge" :class="'badge-' + store.tenant?.state">{{ store.tenant?.state }}</span>
          <code>{{ store.tenant?.primaryDomain }}</code>
          <p v-if="!store.session">Authentication is required before participant or principal functions are available.</p>
          <button v-if="!store.session" @click="beginLogin">Sign in to your organization</button>
          <div v-else class="profile-box">
            <strong>{{ store.session.displayName || store.session.username }}</strong>
            <span>{{ store.session.email }}</span>
            <div class="role-list"><span v-for="role in store.session.roles" :key="role" class="badge">{{ role }}</span></div>
          </div>
        </div>
        </template>
        <sr2-console v-if="store.session && store.tenant.state==='active'" :tenant="store.tenant" :session="store.session"><template #members>        <section v-if="isTenantAdmin" class="card member-admin">
          <h2>Tenant members</h2>
          <p>Invite organization members, then grant issuer access below.</p>
          <form class="member-form" @submit.prevent="inviteMember">
            <input aria-label="Username" v-model="invite.username" required placeholder="Username" />
            <input aria-label="Email" v-model="invite.email" required type="email" placeholder="Email" />
            <input aria-label="First name" v-model="invite.firstName" required placeholder="First name" />
            <input aria-label="Last name" v-model="invite.lastName" required placeholder="Last name" />
            <select aria-label="Member role" v-model="invite.role"><option value="principal">Principal</option><option value="issuer_admin">Issuer administrator</option><option value="participant_tenant_admin">Tenant administrator</option></select>
            <button :disabled="store.busy">Invite</button>
          </form>
          <div class="table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Roles</th><th>Status</th></tr></thead><tbody><tr v-for="member in members" :key="member.subject"><td>{{ member.username }}</td><td>{{ member.email }}</td><td>{{ member.roles.join(', ') }}</td><td>{{ member.enabled ? 'Enabled' : 'Disabled' }}</td></tr></tbody></table></div>
        </section>
</template></sr2-console>
      </section>

      <section v-else-if="isProvider" class="console-page">
        <div class="console-header"><div><p class="eyebrow">PROVIDER ADMINISTRATION</p><h1>Registration review queue</h1><p>Review verified applications and manage participant organizations.</p></div><div class="auth-panel"><template v-if="!store.session"><button @click="beginLogin">Sign in to your organization</button></template><template v-else><strong>{{ store.session.displayName || store.session.username }}</strong><span>{{ store.session.roles.join(', ') }}</span><button class="secondary" @click="loadProvider">Refresh</button></template></div></div>
        <div v-if="store.session && !isProviderAdmin" class="error">Your Keycloak account does not have the provider_admin role.</div>
        <template v-if="isProviderAdmin">
          <section class="stats"><div class="stat orange"><strong>{{ pending.length }}</strong><span>Pending approval</span></div><div class="stat"><strong>{{ registrations.filter(x => x.state === 'approved').length }}</strong><span>Approved</span></div><div class="stat purple"><strong>{{ registrations.filter(x => x.state === 'rejected').length }}</strong><span>Rejected</span></div><div class="stat green"><strong>{{ tenants.filter(x => x.state === 'active').length }}</strong><span>Active tenants</span></div></section>
          <section class="card table-card"><div class="section-title"><div><h2>Applications</h2><p>Email verification remains distinct from provider approval.</p></div><button class="secondary compact" @click="loadProvider">Refresh</button></div><div class="table-wrap"><table><thead><tr><th>Organization</th><th>Requested host</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody><tr v-for="item in registrations" :key="item.registrationId"><td><strong>{{ item.organizationName }}</strong><small>{{ item.organizationIdentifier }}</small></td><td><code>{{ item.requestedDomain }}</code></td><td>{{ item.contactName }}<small>{{ item.contactEmail }}</small></td><td><span class="badge" :class="'badge-' + item.state.replace('_','-')">{{ item.state }}</span></td><td><div v-if="item.state === 'pending_approval'" class="actions"><button class="compact" @click="decide(item, 'approve')">Approve</button><button class="compact danger" @click="decide(item, 'reject')">Reject</button></div></td></tr><tr v-if="!registrations.length"><td colspan="5" class="empty">No registrations.</td></tr></tbody></table></div></section>
          <section class="card table-card"><div class="section-title"><div><h2>Tenant reconciliation</h2><p>Track organization setup and availability.</p></div></div><div class="tenant-grid"><article v-for="tenant in tenants" :key="tenant.tenantId" class="tenant-card"><div class="tenant-card-head"><h3>{{ tenant.organizationName }}</h3><span class="badge" :class="'badge-' + tenant.state">{{ tenant.state }}</span></div><code>{{ tenant.primaryDomain }}</code><p>Generation {{ tenant.observedGeneration }} / {{ tenant.desiredGeneration }}</p><ul><li v-for="condition in tenant.conditions" :key="condition.type"><span>{{ condition.type }}</span><strong>{{ condition.status }}</strong></li></ul><div class="actions"><button v-if="tenant.state==='active'" class="secondary" @click="lifecycleTenant(tenant,'suspended')">Suspend</button><button v-if="tenant.state==='suspended'" @click="lifecycleTenant(tenant,'provisioning')">Resume</button><button v-if="!['deleted','deleting'].includes(tenant.state)" class="danger" @click="lifecycleTenant(tenant,'deleting')">Delete tenant</button></div></article></div></section>
        </template>
      </section>

      <section v-else class="page-grid">
        <div class="hero-panel"><p class="eyebrow">TENANT FOUNDATION</p><h1>Register a participant organization</h1><p class="lead">Submit organization details. Verify your email and submit your organization for provider review. We’ll prepare your workspace after approval.</p><ol class="steps"><li><span>1</span>Submit</li><li><span>2</span>Verify email</li><li><span>3</span>Provider review</li><li><span>4</span>Provision</li></ol></div>
        <div class="card form-card">
          <div v-if="submission" class="success"><span class="status-icon success">OK</span><h2>Registration received</h2><p>A single-use verification link was sent through the configured SMTP service.</p><dl><div><dt>Requested host</dt><dd>{{ submission.requestedDomain }}</dd></div><div><dt>Email delivery</dt><dd>{{ submission.emailDeliveryStatus }}</dd></div></dl><button class="secondary" @click="submission = null">Register another</button></div>
          <form v-else @submit.prevent="submitRegistration"><h2>Organization registration</h2><label class="field"><span>Organization identifier</span><input v-model="form.organizationIdentifier" required placeholder="urn:example:alpha" /></label><label class="field"><span>Organization name</span><input v-model="form.organizationName" required placeholder="Alpha GmbH" /></label><div class="two-column"><label class="field"><span>Contact name</span><input v-model="form.contactName" required placeholder="Alex Admin" /></label><label class="field"><span>Contact email</span><input v-model="form.contactEmail" required type="email" placeholder="admin@alpha.example" /></label></div><label class="field"><span>Tenant slug</span><input v-model="form.requestedSlug" required pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?" placeholder="alpha" /><small>Creates {{ form.requestedSlug || '{slug}' }}-{{ config?.hostnameTemplate?.split('-').slice(1).join('-') || 'pci.example.com' }}</small></label><label class="consent"><input required type="checkbox" /><span>I confirm the information may be processed for tenant onboarding and provider review.</span></label><button :disabled="store.busy">{{ store.busy ? 'Submitting...' : 'Submit registration' }}</button></form>
        </div>
      </section>
    </main>
    <footer><span>FACIS.FAP_PCI</span><span>Credential workspace · __FAP_PCI_VERSION__</span></footer>
  </div>`
};

createApp(App).mount("#app");
