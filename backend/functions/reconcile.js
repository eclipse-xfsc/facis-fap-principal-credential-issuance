return (async () => {
  const action = String(msg.pciAction || msg.type || "");
  const input = msg.pciTransport === "uibuilder" ? (msg.data || (msg.payload && msg.payload.data) || {}) : parseBody();
  const pool = getPool();

  function requireInternalService() {
    if (!cfg.internalServiceToken) throw pciErrors.forbidden("The compatibility provisioner API is disabled.");
    const supplied = bearerToken();
    const a = Buffer.from(supplied);
    const b = Buffer.from(cfg.internalServiceToken);
    if (!supplied || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw pciErrors.unauthorized();
  }

  function nowCondition(type, status, reason, message, generation) {
    return { type, status, reason, message, observedGeneration: Number(generation), lastTransitionTime: new Date().toISOString() };
  }

  function tenantHeaderFilter(tenant) {
    return {
      type: "RequestHeaderModifier",
      requestHeaderModifier: {
        remove: [
          "X-NAMESPACE", "X-DID", "X-ISSUERKID", "X-KEY", "X-GROUP", "X-GROUPID",
          "X-TYPE", "X-ENGINE", "X-Issuer", "X-JWKS-URL", "X-TOKENENDPOINT", "x-audience-url", "x-signerkey",
        ],
        set: [
          { name: "X-PCI-Public-Request", value: "1" },
          { name: "X-PCI-Tenant-ID", value: String(tenant.tenant_id) },
          { name: "X-PCI-Tenant-Slug", value: String(tenant.tenant_slug) },
          { name: "X-PCI-Tenant-Domain", value: String(tenant.primary_domain) },
        ],
      },
    };
  }

  async function ensureTenantClientRedirect(tenant) {
    const encodedRealm = encodeURIComponent(cfg.keycloak.realm);
    const clients = await keycloakAdmin("GET", `/admin/realms/${encodedRealm}/clients?clientId=${encodeURIComponent(cfg.keycloak.uiClientId)}`);
    const client = Array.isArray(clients) ? clients.find((candidate) => candidate.clientId === cfg.keycloak.uiClientId) : null;
    if (!client || !client.id) throw new Error(`Keycloak client ${cfg.keycloak.uiClientId} does not exist; initialize platform infrastructure first.`);
    const tenantDomains = (await pool.query("SELECT primary_domain FROM tenants WHERE state NOT IN ('deleted','deleting','suspended') ORDER BY primary_domain")).rows.map((row) => row.primary_domain);
    const redirectUris = Array.from(new Set([uiUrl(cfg.mainHost, cfg.orceBasePath), ...tenantDomains.map((host) => uiUrl(host, cfg.orceBasePath))]));
    const webOrigins = Array.from(new Set([publicOrigin(cfg.mainHost), ...tenantDomains.map((host) => publicOrigin(host))]));
    const attributes = { ...(client.attributes || {}), "pkce.code.challenge.method": "S256", "post.logout.redirect.uris": redirectUris.join("##") };
    await keycloakAdmin("PUT", `/admin/realms/${encodedRealm}/clients/${encodeURIComponent(client.id)}`, { ...client, redirectUris, webOrigins, attributes });
    return { redirect: uiUrl(tenant.primary_domain, cfg.orceBasePath), origin: publicOrigin(tenant.primary_domain) };
  }

  async function ensureContactAdministrator(tenant, registration) {
    const existing = await pool.query("SELECT * FROM tenant_members WHERE tenant_id=$1 AND lower(email)=lower($2) LIMIT 1", [tenant.tenant_id, registration.contact_email]);
    const parts = String(registration.contact_name || "").trim().split(/\s+/);
    const firstName = parts.shift() || registration.contact_name;
    const lastName = parts.join(" ") || "Administrator";
    const user = await ensureTenantKeycloakUser({
      tenantId: tenant.tenant_id,
      tenantSlug: tenant.tenant_slug,
      tenantDomain: tenant.primary_domain,
      username: registration.contact_email,
      email: registration.contact_email,
      firstName,
      lastName,
      roles: ["participant_tenant_admin"],
      emailVerified: true,
      sendActionsEmail: !existing.rows[0],
    });
    await pool.query(
      `INSERT INTO tenant_members(tenant_id,keycloak_subject,username,email,first_name,last_name,roles,enabled,invited_by,invited_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,true,'fap-pci-reconciler',now(),now())
       ON CONFLICT(tenant_id,keycloak_subject) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,
       first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,roles=EXCLUDED.roles,enabled=true,updated_at=now()`,
      [tenant.tenant_id, user.id, user.username, user.email, firstName, lastName, JSON.stringify(user.roles)],
    );
    return user;
  }

  async function deleteTenantResources(tenant) {
    // Only the two resources created by this reconciler are deletion targets.
    // Preflight all ownership before deleting anything; Kubernetes UID and
    // resourceVersion preconditions prevent object replacement races.
    const resources = [];
    for (const [version,kind] of [['gateway.networking.k8s.io/v1','HTTPRoute'],['v1','ConfigMap']]) {
      const object = await k8sGet(version,kind,`pci-tenant-${tenant.tenant_slug}`,cfg.orceNamespace);
      if (!object) continue;
      const m=object.metadata, l=m.labels || {};
      if (l['app.kubernetes.io/managed-by']!=='fap-pci-orce' || l['xfsc.org/pci-tenant-id']!==String(tenant.tenant_id) || l['xfsc.org/pci-owner-uid']!==String(tenant.owner_uid) || !m.uid || !m.resourceVersion) throw new Error('PCI-TENANT-OWNER-MISMATCH');
      assertK8sMutationAllowed(object,cfg.orceNamespace);
      resources.push(object);
    }
    for (const object of resources) {
      const descriptor=await k8sDescriptor(object.apiVersion,object.kind);
      const path=k8sCollectionPath(descriptor,cfg.orceNamespace)+'/'+encodeURIComponent(object.metadata.name);
      await k8sExpect('DELETE',path,{headers:{'content-type':'application/json'},body:JSON.stringify({apiVersion:'v1',kind:'DeleteOptions',preconditions:{uid:object.metadata.uid,resourceVersion:object.metadata.resourceVersion},propagationPolicy:'Foreground'})},[200,202,404]);
    }
    for (const object of resources) if (await k8sGet(object.apiVersion,object.kind,object.metadata.name,cfg.orceNamespace)) return mapTenant(tenant);
    const users=(await pool.query('SELECT keycloak_subject FROM tenant_members WHERE tenant_id=$1',[tenant.tenant_id])).rows;
    for (const row of users) {
      const path=`/admin/realms/${encodeURIComponent(cfg.keycloak.realm)}/users/${encodeURIComponent(row.keycloak_subject)}`;
      const response=await keycloakAdminRaw('GET',path);
      if(response.status===404)continue;
      if(response.status!==200)throw new Error('PCI-TENANT-IDENTITY-READ');
      const user=JSON.parse(response.text);
      if(String(keycloakAttributeValue(user,'tenant_id'))!==String(tenant.tenant_id))throw new Error('PCI-TENANT-IDENTITY-OWNER');
      const deleted=await keycloakAdminRaw('DELETE',path);
      if(![204,404].includes(deleted.status))throw new Error('PCI-TENANT-IDENTITY-DELETE');
    }
    await ensureTenantClientRedirect(tenant);
    await pool.query('UPDATE tenant_members SET enabled=false,updated_at=now() WHERE tenant_id=$1',[tenant.tenant_id]);
    const updated=(await pool.query("UPDATE tenants SET state='deleted',observed_generation=desired_generation,identity_state='deleted',conditions='[]'::jsonb,updated_at=now() WHERE tenant_id=$1 AND state='deleting' RETURNING *",[tenant.tenant_id])).rows[0];
    return mapTenant(updated || tenant);
  }

  async function reconcileTenant(tenant) {
    const lockName = `tenant-reconcile:${tenant.tenant_id}`;
    const lockToken = acquireGlobalLock(lockName, 300000);
    if (!lockToken) return mapTenant(tenant);
    const lease = await pool.connect();
    try {
      await lease.query('BEGIN');
      await lease.query("SET LOCAL lock_timeout='5s'");
      await lease.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['pci:'+tenant.tenant_id]);
      tenant = (await pool.query('SELECT * FROM tenants WHERE tenant_id=$1',[tenant.tenant_id])).rows[0];
      if (tenant.state === 'deleting') return await deleteTenantResources(tenant);
      if (!['active','provisioning','failed'].includes(tenant.state)) return mapTenant(tenant);
      const generation = Number(tenant.desired_generation);
    const conditions = [];
    if (!tenant.tenant_id || !tenant.owner_uid || buildTenantDomain(tenant.tenant_slug) !== tenant.primary_domain) throw new Error("Tenant desired state is invalid.");
    conditions.push(nowCondition("Validated", "True", "TenantDesiredStateValid", "Tenant desired state passed ORCE validation.", generation));

    const registration = (await pool.query("SELECT * FROM tenant_registrations WHERE registration_id=$1", [tenant.registration_id])).rows[0];
    if (!registration || registration.state !== "approved" || !registration.email_verified_at) throw new Error("Tenant registration is not approved and email-verified.");

    await ensureTenantClientRedirect(tenant);
    const contactUser = await ensureContactAdministrator(tenant, registration);
    conditions.push(nowCondition("IdentityReady", "True", "KeycloakTenantIdentityReady", `Keycloak tenant administrator ${contactUser.username} is assigned.`, generation));

    const labels = {
      "app.kubernetes.io/managed-by": "fap-pci-orce",
      "app.kubernetes.io/part-of": "fap-pci",
      "app.kubernetes.io/instance": "fap-pci",
      "xfsc.org/pci-tenant-id": String(tenant.tenant_id),
      "xfsc.org/pci-owner-uid": String(tenant.owner_uid),
      "xfsc.org/pci-generation": String(generation),
    };
    await k8sApply({
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: `pci-tenant-${tenant.tenant_slug}`, namespace: cfg.orceNamespace, labels },
      data: {
        tenant_id: String(tenant.tenant_id),
        tenant_slug: String(tenant.tenant_slug),
        owner_uid: String(tenant.owner_uid),
        organization_identifier: String(tenant.organization_identifier),
        organization_name: String(tenant.organization_name),
        primary_domain: String(tenant.primary_domain),
        orce_base_path: cfg.orceBasePath,
        ui_path: cfg.publicUiPath,
        public_ui_url: uiUrl(tenant.primary_domain, cfg.orceBasePath),
        public_api_url: publicUrl(tenant.primary_domain, "/api/v1/", cfg.orceBasePath),
        desired_generation: String(generation),
        ocm_namespace: cfg.ocmNamespace,
        ocm_credential_issuance_service: cfg.ocmServices.credentialIssuance,
        ocm_well_known_service: cfg.ocmServices.wellKnown,
        ocm_preauth_service: cfg.ocmServices.preAuth,
        ocm_signer_service: cfg.ocmServices.signer,
        integration_state: "reserved-for-issuer-integration",
      },
    }, cfg.orceNamespace);
    conditions.push(nowCondition("ConfigurationReady", "True", "TenantConfigApplied", "Tenant-owned configuration is present in the ORCE namespace.", generation));

    const headerFilter = tenantHeaderFilter(tenant);
    const backend = [{ group: "", kind: "Service", name: cfg.orceService, port: cfg.orceServicePort, weight: 1 }];
    await k8sApply({
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "HTTPRoute",
      metadata: { name: `pci-tenant-${tenant.tenant_slug}`, namespace: cfg.orceNamespace, labels },
      spec: {
        parentRefs: [{ group: "gateway.networking.k8s.io", kind: "Gateway", name: cfg.gatewayName, namespace: cfg.infrastructureNamespace, sectionName: cfg.gatewayListenerName }],
        hostnames: [tenant.primary_domain],
        rules: [
          ...Array.from(new Set(cfg.orceBasePath ? [cfg.orceBasePath, `${cfg.orceBasePath}/`] : ["/"])).map((entryPath) => ({
            matches: [{ path: { type: "Exact", value: entryPath } }],
            filters: [headerFilter, { type: "URLRewrite", urlRewrite: { path: { type: "ReplaceFullPath", replaceFullPath: cfg.publicUiPath } } }],
            backendRefs: backend,
          })),
          {
            matches: [{ path: { type: "PathPrefix", value: cfg.orceBasePath || "/" } }],
            filters: [headerFilter],
            backendRefs: backend,
          },
        ],
      },
    }, cfg.orceNamespace);
    conditions.push(nowCondition("RouteApplied", "True", "HTTPRouteApplied", "The tenant HTTPRoute was applied with server-derived tenant headers.", generation));

    const route = await waitFor(`tenant route ${tenant.tenant_slug}`, async () => {
      const candidate = await k8sGet("gateway.networking.k8s.io/v1", "HTTPRoute", `pci-tenant-${tenant.tenant_slug}`, cfg.orceNamespace);
      const accepted = routeCondition(candidate, "Accepted");
      const resolved = routeCondition(candidate, "ResolvedRefs");
      return candidate && accepted && accepted.status === "True" && resolved && resolved.status === "True" ? candidate : null;
    }, 180, 3000);
    void route;
    conditions.push(nowCondition("RouteAccepted", "True", "GatewayAccepted", "Envoy accepted the tenant route and resolved its ORCE Service reference.", generation));

    const gateway = await k8sGet("gateway.networking.k8s.io/v1", "Gateway", cfg.gatewayName, cfg.infrastructureNamespace);
    const address = gatewayAddress(gateway);
    const dnsReady = await dnsMatchesHost(tenant.primary_domain, address);
    conditions.push(nowCondition("DNSReady", dnsReady ? "True" : "False", dnsReady ? "DNSMatchesGateway" : "ManualDNSRequired", dnsReady ? "Tenant DNS resolves to the PCI Envoy Gateway." : `Create a DNS record for ${tenant.primary_domain} pointing to ${address}.`, generation));
    conditions.push(nowCondition("Ready", dnsReady ? "True" : "False", dnsReady ? "TenantRuntimeReady" : "TenantDNSPending", dnsReady ? "The ORCE/uibuilder tenant runtime is ready." : "The tenant route is ready but activation is waiting for manual DNS.", generation));

    const previousState = tenant.state;
    const newState = dnsReady ? "active" : "provisioning";
    const updated = (await pool.query(
      `UPDATE tenants SET state=$2,observed_generation=$3,conditions=$4::jsonb,identity_state='ready',updated_at=now()
       WHERE tenant_id=$1 RETURNING *`,
      [tenant.tenant_id, newState, generation, JSON.stringify(conditions)],
    )).rows[0];
    if (newState === "active" && previousState !== "active") {
      await pool.query(`INSERT INTO audit_events(event_type,actor,registration_id,tenant_id,safe_metadata) VALUES('tenant.activated','fap-pci-reconciler',$1,$2,$3::jsonb)`, [tenant.registration_id, tenant.tenant_id, JSON.stringify({ domain: tenant.primary_domain })]);
      try {
        await sendMail({
          to: registration.contact_email,
          subject: "FAP PCI tenant activated",
          text: `The tenant ${tenant.organization_name} is active at ${uiUrl(tenant.primary_domain, cfg.orceBasePath)}. Sign in with Keycloak and complete the required first-login actions.`,
        });
      } catch (error) { node.warn("PCI-TENANT-NOTIFICATION-FAILED"); }
    }
      return mapTenant(updated);
    } finally {
      await lease.query("COMMIT").catch(() => {});
      lease.release();
      releaseGlobalLock(lockName, lockToken);
    }
  }

  async function markFailed(tenant, error) {
    const condition = nowCondition("Error", "True", "ReconciliationFailed", "Tenant reconciliation requires operator review; no upstream payload is stored.", tenant.desired_generation);
    const existing = Array.isArray(tenant.conditions) ? tenant.conditions.filter((item) => item.type !== "Error" && item.type !== "Ready") : [];
    const conditions = [...existing, condition, nowCondition("Ready", "False", "ReconciliationFailed", "Tenant reconciliation has not completed.", tenant.desired_generation)];
    const row = (await pool.query("UPDATE tenants SET state=CASE WHEN state='deleting' THEN 'deleting' WHEN state='suspended' THEN 'suspended' ELSE 'failed' END,conditions=$2::jsonb,updated_at=now() WHERE tenant_id=$1 RETURNING *", [tenant.tenant_id, JSON.stringify(conditions)])).rows[0];
    return mapTenant(row);
  }

  if (action === "internal.provisioning.list") {
    requireInternalService();
    const limit = Math.min(100, Math.max(1, Number(query().limit || 20)));
    const result = await pool.query(
      `SELECT * FROM tenants WHERE state IN ('provisioning','failed','deleting') ORDER BY updated_at ASC LIMIT $1`,
      [limit],
    );
    return emit(200, { items: result.rows.map(mapTenant), total: result.rowCount });
  }

  if (action === "internal.provisioning.status") {
    requireInternalService();
    const tenantId = String(params().tenantId || input.tenantId || "");
    const state = String(input.state || "");
    const generation = Number(input.observedGeneration);
    const conditions = Array.isArray(input.conditions) ? input.conditions : [];
    if (!tenantId || !["provisioning", "active", "failed", "suspended"].includes(state) || !Number.isInteger(generation) || generation < 0) throw pciErrors.validation("Provisioning status update is invalid.");
    const row = (await pool.query("UPDATE tenants SET state=$2,observed_generation=$3,conditions=$4::jsonb,updated_at=now() WHERE tenant_id=$1 AND state NOT IN ('deleting','deleted','suspended') RETURNING *", [tenantId, state, generation, JSON.stringify(conditions)])).rows[0];
    if (!row) throw pciErrors.notFound("Tenant not found.");
    return emit(200, { tenant: mapTenant(row) });
  }

  if (action === "tenant.reconcile.one") {
    if (!msg.pciInternal) { if (routedHost() !== cfg.mainHost) throw pciErrors.forbidden(); await requireSession(["provider_admin"]); }
    const tenantId = String(params().tenantId || input.tenantId || "");
    const tenant = (await pool.query("SELECT * FROM tenants WHERE tenant_id=$1", [tenantId])).rows[0];
    if (!tenant) throw pciErrors.notFound("Tenant not found.");
    try { return emit(200, { tenant: await reconcileTenant(tenant) }, {}, "pci:tenant-updated"); }
    catch (error) { return emit(200, { tenant: await markFailed(tenant, error) }, {}, "pci:tenant-updated"); }
  }

  if (action === "tenant.reconcile.all") {
    if (!msg.pciInternal) { if (routedHost() !== cfg.mainHost) throw pciErrors.forbidden(); await requireSession(["provider_admin"]); }
    const result = await pool.query(
      `SELECT * FROM tenants WHERE state IN ('provisioning','failed','active','deleting') ORDER BY updated_at ASC LIMIT 100`,
    );
    const items = [];
    for (const tenant of result.rows) {
      try { items.push(await reconcileTenant(tenant)); }
      catch (error) { items.push(await markFailed(tenant, error)); }
    }
    node.status({ fill: items.some((item) => item.state === "failed") ? "yellow" : "green", shape: "dot", text: `${items.length} tenant(s) reconciled` });
    return emit(200, { items, total: items.length }, {}, "pci:tenant-updated");
  }

  throw pciErrors.notFound("Unknown reconciliation action.");
})().catch((error) => {
  node.status({ fill: "red", shape: "ring", text: "PCI-RECONCILIATION-FAILED" });
  return emitError(error);
});
