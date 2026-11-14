import { createApp, computed, onMounted, onUnmounted, ref } from "vue";
import { api, request } from "./services/api.js";
import { beginLogin, completeLoginFromLocation } from "./services/auth.js";
import { store } from "./state/store.js";
import { runtime, applyPublicConfiguration } from "./config/runtime.js";
import { initializeBridge, bridgePing, onBridgeReconnect } from './services/transport.js';
import { normalizeUiError } from './state/reducers.js';
import { UiFeedback, UiProgress, UiField } from './components/feedback.js';
import "./styles.css";
const App = {
  components: { Sr2Console, UiFeedback, UiProgress, UiField },
  setup() {
    const config = ref(null);
    const registrations = ref([]);
    const tenants = ref([]);
    const members = ref([]);
    const form = ref({
      organizationIdentifier: "",
      organizationName: "",
      contactName: "",
      contactEmail: "",
      requestedSlug: "",
      registrationMode: "public"
    });
    const invite = ref({ username: "", email: "", firstName: "", lastName: "", role: "principal" });
    const submission = ref(null);
    const verification = ref({ state: "idle", message: "" });
    const hashRoute = ref(window.location.hash || "#/register");
    const tenantTheme = computed(() => ({ '--tenant-width': store.tenant?.branding?.layout === 'focused' ? '1040px': '1200px' }));
    const providerTab = ref('applications');
    const isTenantHost = computed(() => Boolean(store.tenant));
    const isProvider = computed(() => hashRoute.value.startsWith("#/provider"));
    const isTenantAdmin = computed(() => store.session?.roles?.includes("participant_tenant_admin"));
    const isProviderAdmin = computed(() => store.session?.roles?.includes("provider_admin"));
    const pending = computed(() => registrations.value.filter((item) => item.state === "pending_approval"));
    function setError(error) {
      store.errors.global = normalizeUiError(error);
    }
    async function loadSession() {
      try {
        store.session = (await api.session()).session;
      } catch (error) {
        if (error.status === 401) store.session = null;
        else setError(error);
      }
    }
    async function loadTenant() {
      try {
        store.tenant = (await api.tenantContext()).tenant;
        try {
          store.tenant.branding = (await request('/api/v1/public/branding')).branding;
        } catch {}
      } catch (error) {
        if (error.status === 404) store.tenant = null;
        else setError(error);
      }
    }
    async function loadProvider() {
      if (isTenantHost.value || !isProviderAdmin.value) return;
      store.busy = true;
      try {
        const [r, t] = await Promise.all([api.registrations(), api.tenants()]);
        registrations.value = r.items;
        tenants.value = t.items;
      } catch (error) {
        setError(error);
      } finally {
        store.busy = false;
      }
    }
    async function loadMembers() {
      if (!store.tenant || !isTenantAdmin.value) return;
      try {
        members.value = (await api.tenantMembers(store.tenant.tenantId)).items;
      } catch (error) {
        setError(error);
      }
    }
    async function submitRegistration() {
      store.busy = true;
      try {
        submission.value = (await api.register(form.value)).registration;
      } catch (error) {
        setError(error);
      } finally {
        store.busy = false;
      }
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
      const promptText = action === "approve" ? "Approval note (optional)": "Rejection reason (required)";
      const reason = window.prompt(promptText, action === "approve" ? "Reviewed and approved": "Registration requires correction");
      if (reason === null || (action === "reject" && reason.trim().length < 3)) return;
      try {
        if (action === "approve") await api.approve(item, reason);
        else await api.reject(item, reason);
        await loadProvider();
      } catch (error) {
        setError(error);
      }
    }
    async function inviteMember() {
      if (!store.tenant) return;
      store.busy = true;
      try {
        await api.inviteMember(store.tenant.tenantId, invite.value);
        invite.value = { username: "", email: "", firstName: "", lastName: "", role: "principal" };
        await loadMembers();
      } catch (error) {
        setError(error);
      } finally {
        store.busy = false;
      }
    }
    async function lifecycleTenant(tenant, state) {
      const confirmation = window.prompt('Enter the tenant slug to confirm ' + state + ':');
      if (confirmation === null) return;
      try {
        await request(`/api/v1/provider/tenants/${encodeURIComponent(tenant.tenantId)}/lifecycle`, { method: 'POST', body: JSON.stringify(
          { state, confirmation }) });
        await loadProvider();
      } catch (error) {
        setError(error);
      }
    }
    function focusMain() {
      document.getElementById('main')?.focus();
    }
    async function login(native = false) {
      try {
        await beginLogin(native);
      } catch (error) {
        setError(error);
      }
    }
    async function logout() {
      try {
        await api.logout();
      } finally {
        store.session = null;
        window.location.assign(runtime.uiPath);
      }
    }
    async function recoverWorkspace() {
      await loadSession();
      await loadTenant();
      if (isProvider.value) await loadProvider();
      if (isTenantHost.value) await loadMembers();
    }
    const stopReconnect = onBridgeReconnect(recoverWorkspace);
    onUnmounted(stopReconnect);
    onMounted(async() => {
      window.addEventListener("hashchange", () => {
        hashRoute.value = window.location.hash || "#/register";
        if (hashRoute.value.startsWith("#/provider") && !isTenantHost.value) void loadProvider();
      });
      try {
        config.value = await api.registrationConfig();
        applyPublicConfiguration(config.value);
        form.value.registrationMode = config.value.registrationMode;
        await completeLoginFromLocation();
        initializeBridge();
        await bridgePing();
      } catch (error) {
        setError(error);
        return;
      }
      await Promise.all([loadSession(), loadTenant()]);
      await verifyFromUrl();
      if (isProvider.value && !isTenantHost.value) await loadProvider();
      if (isTenantHost.value) await loadMembers();
      try {
        store.platform = await api.platformStatus();
      } catch {
        /* platform endpoint may be warming up */
      }
    });
    return {
      tenantTheme,
      providerTab,
      recoverWorkspace,
      focusMain,
      store,
      runtime,
      config,
      registrations,
      tenants,
      members,
      form,
      invite,
      submission,
      verification,
      hashRoute,
      isTenantHost,
      isProvider,
      isTenantAdmin,
      isProviderAdmin,
      pending,
      submitRegistration,
      decide,
      inviteMember,
      login,
      logout,
      lifecycleTenant,
      loadProvider,
      loadMembers,
    };
  },
  template: [
    "\n  <div class=\"app-shell\">\n    <a class=\"skip-link\" href=\"#main\" @click.prevent=\"focusMain\">Skip to main content</a>\n    <heade",
    "r class=\"topbar\">\n      <a class=\"brand\" :href=\"runtime.uiPath\" aria-label=\"FACIS FAP PCI home\"><img class=\"brand-logo\" :src=\"",
    "runtime.uiPath+'facis-logo.svg'\" width=\"106\" height=\"40\" alt=\"FACIS\"><span><strong>FAP PCI</strong><small>Principal Credential Issu",
    "ance</small></span></a>\n      <nav aria-label=\"Primary\">\n        <a v-if=\"!isTenantHost\" href=\"#/register\">Registration</a>\n     ",
    "   <a v-if=\"!isTenantHost\" href=\"#/provider\">Provider review</a>\n        <button v-if=\"!store.session\" class=\"link-button\" @click",
    "=\"login\">Sign in</button>\n        <button v-else class=\"link-button\" @click=\"logout\">Sign out</button>\n      </nav>\n    </header>",
    "\n    <main id=\"main\" tabindex=\"-1\">\n      <ui-feedback class=\"global-error\" :error=\"store.errors.global\" @dismiss=\"store.errors",
    ".global=null\" @recover=\"recoverWorkspace\" />\n      <p v-if=\"!store.live.connected\" class=\"connection-status\" role=\"status\">Conne",
    "cting to your workspace…</p>\n      <ui-progress />\n\n      <section v-if=\"verification.state !== 'idle'\" class=\"center-card card\" ar",
    "ia-live=\"polite\">\n        <span class=\"status-icon\" :class=\"verification.state\">{{ verification.state === 'working' ? '...' : verif",
    "ication.state === 'success' ? 'OK' : '!' }}</span>\n        <p class=\"eyebrow\">EMAIL VERIFICATION</p>\n        <h1>{{ verification.state",
    " === 'success' ? 'Registration verified' : verification.state === 'failed' ? 'Verification failed' : 'Checking link' }}</h1>\n        <p>{",
    "{ verification.message }}</p>\n        <a class=\"button-link secondary\" :href=\"runtime.uiPath\">Return to registration</a>\n      </sec",
    "tion>\n\n      <section v-else-if=\"isTenantHost\" class=\"tenant-landing\" :class=\"{'tenant-workspace':store.session && store.tenant.sta",
    "te==='active'}\" :style=\"tenantTheme\">\n        <div class=\"tenant-welcome\" v-if=\"!store.session || store.tenant.state!=='active'\"><",
    "div class=\"tenant-guidance\">\n        <p class=\"eyebrow\">PARTICIPANT PORTAL</p>\n        <img v-if=\"store.tenant.branding?.logoAssetI",
    "d\" class=\"tenant-logo\" :src=\"runtime.basePath+'/api/v1/public/assets/'+store.tenant.branding.logoAssetId\" alt=\"Organization logo\"><",
    "h1>{{ store.tenant.branding?.title || store.tenant.organizationName }}</h1>\n        <p class=\"lead\">{{store.tenant.branding?.descriptio",
    "n || 'Sign in to manage or request organization credentials.'}}</p>\n        </div><div class=\"tenant-summary card dark-card\">\n        ",
    "  <span class=\"badge\" :class=\"'badge-' + store.tenant?.state\">{{ store.tenant?.state }}</span>\n          <code>{{ store.tenant?.prima",
    "ryDomain }}</code>\n          <p v-if=\"!store.session\">Authentication is required before participant or principal functions are availabl",
    "e.</p>\n          <button v-if=\"!store.session\" @click=\"login\">Sign in to your organization</button><button v-if=\"!store.session\" cl",
    "ass=\"secondary\" @click=\"login(true)\">Tenant administrator sign in</button>\n          <div v-else class=\"profile-box\">\n            ",
    "<strong>{{ store.session.displayName || store.session.username }}</strong>\n            <span>{{ store.session.email }}</span>\n          ",
    "  <div class=\"role-list\"><span v-for=\"role in store.session.roles\" :key=\"role\" class=\"badge\">{{ role }}</span></div>\n          </",
    "div>\n        </div>\n        </div>\n        <sr2-console v-if=\"store.session && store.tenant.state==='active'\" :tenant=\"store.tenant",
    "\" :session=\"store.session\"><template #members>        <section v-if=\"isTenantAdmin\" class=\"card member-admin\">\n          <h2>Tenan",
    "t members</h2>\n          <p>Invite organization members, then grant issuer access below.</p>\n          <form class=\"member-form\" @subm",
    "it.prevent=\"inviteMember\">\n            <input aria-label=\"Username\" v-model=\"invite.username\" required placeholder=\"Username\" />",
    "\n            <input aria-label=\"Email\" v-model=\"invite.email\" required type=\"email\" placeholder=\"Email\" />\n            <input ar",
    "ia-label=\"First name\" v-model=\"invite.firstName\" required placeholder=\"First name\" />\n            <input aria-label=\"Last name\" v",
    "-model=\"invite.lastName\" required placeholder=\"Last name\" />\n            <select aria-label=\"Member role\" v-model=\"invite.role\"><",
    "option value=\"principal\">Principal</option><option value=\"issuer_admin\">Issuer administrator</option><option value=\"participant_tenan",
    "t_admin\">Tenant administrator</option></select>\n            <button :disabled=\"store.busy\">Invite</button>\n          </form>\n       ",
    "   <div class=\"table-wrap\"><table><thead><tr><th>User</th><th>Email</th><th>Roles</th><th>Status</th></tr></thead><tbody><tr v-for=\"mem",
    "ber in members\" :key=\"member.subject\"><td>{{ member.username }}</td><td>{{ member.email }}</td><td>{{ member.roles.join(', ') }}</td><t",
    "d>{{ member.enabled ? 'Enabled' : 'Disabled' }}</td></tr></tbody></table></div>\n      </section>\n</template></sr2-console>\n        <foo",
    "ter v-if=\"store.tenant.branding?.footer\" class=\"tenant-footer preserve-lines\">{{store.tenant.branding.footer}}</footer>\n      </secti",
    "on>\n\n      <section v-else-if=\"isProvider\" class=\"console-page\">\n        <aside class=\"provider-guidance\"><p class=\"eyebrow\">PR",
    "OVIDER WORKSPACE</p><h2>Participant organizations</h2><p>Review applications, then follow each organization’s setup.</p><nav aria-label=\"",
    "Provider tasks\"><button class=\"secondary\" :aria-pressed=\"providerTab==='applications'\" @click=\"providerTab='applications'\">Applicat",
    "ions</button><button class=\"secondary\" :aria-pressed=\"providerTab==='tenants'\" @click=\"providerTab='tenants'\">Tenant availability</b",
    "utton></nav></aside>\n        <div class=\"provider-content\">\n        <div class=\"console-header\"><div><p class=\"eyebrow\">PROVIDER A",
    "DMINISTRATION</p><h1>{{providerTab==='applications'?'Registration review queue':'Tenant availability'}}</h1><p>Review verified application",
    "s and manage participant organizations.</p></div><div class=\"auth-panel\"><template v-if=\"!store.session\"><button @click=\"login\">Sign",
    " in to your organization</button></template><template v-else><strong>{{ store.session.displayName || store.session.username }}</strong><sp",
    "an>{{ store.session.roles.join(', ') }}</span><button class=\"secondary\" @click=\"loadProvider\">Refresh</button></template></div></div>",
    "\n        <div v-if=\"store.session && !isProviderAdmin\" class=\"error\">Your Keycloak account does not have the provider_admin role.</di",
    "v>\n        <template v-if=\"isProviderAdmin\">\n          <section class=\"stats\"><div class=\"stat orange\"><strong>{{ pending.length }",
    "}</strong><span>Pending approval</span></div><div class=\"stat\"><strong>{{ registrations.filter(x => x.state === 'approved').length }}</s",
    "trong><span>Approved</span></div><div class=\"stat purple\"><strong>{{ registrations.filter(x => x.state === 'rejected').length }}</strong",
    "><span>Rejected</span></div><div class=\"stat green\"><strong>{{ tenants.filter(x => x.state === 'active').length }}</strong><span>Active ",
    "tenants</span></div></section>\n          <section v-if=\"providerTab==='applications'\" class=\"card table-card\"><div class=\"section-ti",
    "tle\"><div><h2>Applications</h2><p>Email verification remains distinct from provider approval.</p></div><button class=\"secondary compact",
    "\" @click=\"loadProvider\">Refresh</button></div><div class=\"table-wrap\"><table><thead><tr><th>Organization</th><th>Requested host</th><",
    "th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody><tr v-for=\"item in registrations\" :key=\"item.registrationId\"><td><str",
    "ong>{{ item.organizationName }}</strong><small>{{ item.organizationIdentifier }}</small></td><td><code>{{ item.requestedDomain }}</code></",
    "td><td>{{ item.contactName }}<small>{{ item.contactEmail }}</small></td><td><span class=\"badge\" :class=\"'badge-' + item.state.replace('",
    "_','-')\">{{ item.state }}</span></td><td><div v-if=\"item.state === 'pending_approval'\" class=\"actions\"><button class=\"compact\" @cli",
    "ck=\"decide(item, 'approve')\">Approve</button><button class=\"compact danger\" @click=\"decide(item, 'reject')\">Reject</button></div></t",
    "d></tr><tr v-if=\"!registrations.length\"><td colspan=\"5\" class=\"empty\">No registrations.</td></tr></tbody></table></div></section>\n ",
    "         <section v-if=\"providerTab==='tenants'\" class=\"card table-card\"><div class=\"section-title\"><div><h2>Tenant reconciliation</",
    "h2><p>Track organization setup and availability.</p></div></div><div class=\"tenant-grid\"><article v-for=\"tenant in tenants\" :key=\"ten",
    "ant.tenantId\" class=\"tenant-card\"><div class=\"tenant-card-head\"><h3>{{ tenant.organizationName }}</h3><span class=\"badge\" :class=\"",
    "'badge-' + tenant.state\">{{ tenant.state }}</span></div><code>{{ tenant.primaryDomain }}</code><p>Generation {{ tenant.observedGeneration",
    " }} / {{ tenant.desiredGeneration }}</p><ul><li v-for=\"condition in tenant.conditions\" :key=\"condition.type\"><span>{{ condition.type }",
    "}</span><strong>{{ condition.status }}</strong></li></ul><div class=\"actions\"><button v-if=\"tenant.state==='active'\" class=\"secondary",
    "\" @click=\"lifecycleTenant(tenant,'suspended')\">Suspend</button><button v-if=\"tenant.state==='suspended'\" @click=\"lifecycleTenant(ten",
    "ant,'provisioning')\">Resume</button><button v-if=\"!['deleted','deleting'].includes(tenant.state)\" class=\"danger\" @click=\"lifecycleTe",
    "nant(tenant,'deleting')\">Delete tenant</button></div></article></div></section>\n        </template>\n        </div>\n      </section>\n",
    "\n      <section v-else class=\"page-grid\">\n        <div class=\"hero-panel\"><p class=\"eyebrow\">TENANT FOUNDATION</p><h1>Register a p",
    "articipant organization</h1><p class=\"lead\">Submit organization details. Verify your email and submit your organization for provider rev",
    "iew. We’ll prepare your workspace after approval.</p><ol class=\"steps\"><li><span>1</span>Submit</li><li><span>2</span>Verify email</li><",
    "li><span>3</span>Provider review</li><li><span>4</span>Provision</li></ol></div>\n        <div class=\"card form-card\">\n          <div v",
    "-if=\"submission\" class=\"success\"><span class=\"status-icon success\">OK</span><h2>Registration received</h2><p>A single-use verificati",
    "on link was sent through the configured SMTP service.</p><dl><div><dt>Requested host</dt><dd>{{ submission.requestedDomain }}</dd></div><d",
    "iv><dt>Email delivery</dt><dd>{{ submission.emailDeliveryStatus }}</dd></div></dl><button class=\"secondary\" @click=\"submission = null\"",
    ">Register another</button></div>\n          <form v-else @submit.prevent=\"submitRegistration\"><h2>Organization registration</h2><ui-fiel",
    "d label=\"Organization identifier\" name=\"organizationIdentifier\" v-model=\"form.organizationIdentifier\" :error=\"store.errors.global?.",
    "fields?.organizationIdentifier\" required placeholder=\"urn:example:alpha\" /><ui-field label=\"Organization name\" name=\"organizationNam",
    "e\" v-model=\"form.organizationName\" :error=\"store.errors.global?.fields?.organizationName\" required placeholder=\"Alpha GmbH\" /><div ",
    "class=\"two-column\"><ui-field label=\"Contact name\" name=\"contactName\" v-model=\"form.contactName\" :error=\"store.errors.global?.fiel",
    "ds?.contactName\" required placeholder=\"Alex Admin\" /><ui-field label=\"Contact email\" name=\"contactEmail\" v-model=\"form.contactEmai",
    "l\" :error=\"store.errors.global?.fields?.contactEmail\" required placeholder=\"admin@alpha.example\" type=\"email\" /></div><ui-field lab",
    "el=\"Tenant slug\" name=\"requestedSlug\" v-model=\"form.requestedSlug\" :error=\"store.errors.global?.fields?.requestedSlug\" required pa",
    "ttern=\"[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?\" placeholder=\"alpha\"><small>Creates {{ form.requestedSlug || '{slug}' }}-{{ config?.hostna",
    "meTemplate?.split('-').slice(1).join('-') || 'pci.example.com' }}</small></ui-field><label class=\"consent\"><input required type=\"checkb",
    "ox\" /><span>I confirm the information may be processed for tenant onboarding and provider review.</span></label><button :disabled=\"store",
    ".busy\">{{ store.busy ? 'Submitting...' : 'Submit registration' }}</button></form>\n        </div>\n      </section>\n    </main>\n    <fo",
    "oter><span>FACIS.FAP_PCI</span><span>Credential workspace · __FAP_PCI_VERSION__</span></footer>\n  </div>",
  ].join('')
};
createApp(App).mount("#app");
