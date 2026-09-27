return (async () => {
  const action = String(msg.pciAction || msg.type || "");
  const input = msg.pciTransport === "uibuilder" ? (msg.data || (msg.payload && msg.payload.data) || {}) : parseBody();
  const pool = getPool();

  async function tenantForHost(requireTrustedHeaders = true) {
    const host = routedHost();
    if (!host || host === cfg.mainHost) throw pciErrors.notFound("No tenant is assigned to this host.");
    const result = await pool.query("SELECT * FROM tenants WHERE primary_domain=$1 AND state IN ('provisioning','active','suspended')", [host]);
    const row = result.rows[0];
    if (!row) throw pciErrors.notFound("No tenant is assigned to this host.");
    if (requireTrustedHeaders) {
      const headers = requestHeaders();
      if (String(headers["x-pci-tenant-id"] || "") !== String(row.tenant_id)
        || String(headers["x-pci-tenant-slug"] || "") !== String(row.tenant_slug)
        || normalizeHost(headers["x-pci-tenant-domain"] || "") !== String(row.primary_domain)) {
        throw pciErrors.invalidTenantContext();
      }
    }
    return row;
  }

  async function authorizeTenant(tenantId, roles) {
    const session = await requireSession(roles, tenantId);
    const routed = await tenantForHost(true);
    if (String(routed.tenant_id)!==String(tenantId) || routed.state!=='active' || session.tenantId!==tenantId) throw pciErrors.notFound();
    const membership=(await pool.query('SELECT enabled,roles FROM tenant_members WHERE tenant_id=$1 AND keycloak_subject=$2',[tenantId,session.subject])).rows[0];
    if(!membership?.enabled || !membership.roles?.includes('participant_tenant_admin'))throw pciErrors.forbidden();
    const tenantResult = await pool.query("SELECT * FROM tenants WHERE tenant_id=$1", [tenantId]);
    if (!tenantResult.rows[0]) throw pciErrors.notFound("Tenant not found.");
    return { session, tenant: tenantResult.rows[0] };
  }

  if (action === "tenant.runtime") {
    const row = await tenantForHost(true);
    const tenant = mapTenant(row);
    return emit(200, {
      tenant: {
        tenantId: tenant.tenantId,
        tenantSlug: tenant.tenantSlug,
        organizationName: tenant.organizationName,
        primaryDomain: tenant.primaryDomain,
        state: tenant.state,
        ready: tenant.state === "active" && tenant.observedGeneration === tenant.desiredGeneration,
      },
    }, {}, "pci:tenant-context");
  }

  if (action === "tenant.profile") {
    const row = await tenantForHost(true);
    const session = await requireSession(["provider_admin", "participant_tenant_admin", "issuer_admin", "principal"], row.tenant_id);
    return emit(200, { tenant: mapTenant(row), session }, {}, "pci:tenant-profile");
  }

  if (action === "tenant.members.list") {
    const tenantId = String(params().tenantId || input.tenantId || "");
    await authorizeTenant(tenantId, ["provider_admin", "participant_tenant_admin"]);
    const result = await pool.query(
      `SELECT keycloak_subject,username,email,first_name,last_name,roles,enabled,invited_at,updated_at
       FROM tenant_members WHERE tenant_id=$1 ORDER BY username`,
      [tenantId],
    );
    return emit(200, {
      items: result.rows.map((row) => ({
        subject: row.keycloak_subject,
        username: row.username,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        roles: Array.isArray(row.roles) ? row.roles : [],
        enabled: Boolean(row.enabled),
        invitedAt: row.invited_at ? new Date(row.invited_at).toISOString() : null,
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
      total: result.rowCount,
    }, {}, "pci:tenant-members");
  }

  if (action === "tenant.members.invite") {
    const tenantId = String(params().tenantId || input.tenantId || "");
    const { session, tenant } = await authorizeTenant(tenantId, ["provider_admin", "participant_tenant_admin"]);
    const username = String(input.username || input.email || "").trim().toLowerCase();
    const email = String(input.email || "").trim().toLowerCase();
    const firstName = String(input.firstName || "").trim();
    const lastName = String(input.lastName || "").trim();
    const role = String(input.role || "principal");
    if (!/^[a-z0-9][a-z0-9._@+-]{2,127}$/.test(username)) throw pciErrors.validation("username is invalid.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw pciErrors.validation("email is invalid.");
    if (firstName.length < 1 || firstName.length > 100 || lastName.length < 1 || lastName.length > 100) throw pciErrors.validation("firstName and lastName are required.");
    if (!["principal", "issuer_admin", "participant_tenant_admin"].includes(role)) throw pciErrors.validation("role is invalid.");
    const user = await ensureTenantKeycloakUser({
      tenantId: tenant.tenant_id,
      tenantSlug: tenant.tenant_slug,
      tenantDomain: tenant.primary_domain,
      username,
      email,
      firstName,
      lastName,
      roles: role === "principal" ? ["principal"] : [role],
      emailVerified: false,
      sendActionsEmail: true,
    });
    await pool.query(
      `INSERT INTO tenant_members(tenant_id,keycloak_subject,username,email,first_name,last_name,roles,enabled,invited_by,invited_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,true,$8,now(),now())
       ON CONFLICT(tenant_id,keycloak_subject) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,
       first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,roles=EXCLUDED.roles,enabled=true,
       invited_by=EXCLUDED.invited_by,updated_at=now()`,
      [tenantId, user.id, username, email, firstName, lastName, JSON.stringify(user.roles), `keycloak:${session.subject}`],
    );
    if (role === 'issuer_admin') {
      const client=await pool.connect();
      try {await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pci:'+tenantId]);
        await client.query("INSERT INTO pci_issuer_assignments(tenant_id,assignment_id,subject,configuration_ids) SELECT $1,$2,$3,'null'::jsonb WHERE NOT EXISTS(SELECT 1 FROM pci_issuer_assignments WHERE tenant_id=$1 AND subject=$3 AND revoked=false AND configuration_ids='null'::jsonb)",[tenantId,crypto.randomUUID(),user.id]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
    await pool.query(
      `INSERT INTO audit_events(event_type,actor,tenant_id,safe_metadata)
       VALUES('tenant.member.invited',$1,$2,$3::jsonb)`,
      [`keycloak:${session.subject}`, tenantId, JSON.stringify({ username, role })],
    );
    return emit(201, { member: { subject: user.id, username, email, firstName, lastName, roles: user.roles, enabled: true } }, {}, "pci:tenant-member-invited");
  }

  throw pciErrors.notFound("Unknown tenant action.");
})().catch(emitError);
