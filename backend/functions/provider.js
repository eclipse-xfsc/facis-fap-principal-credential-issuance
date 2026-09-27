return (async () => {
  const action = String(msg.pciAction || msg.type || "");
  const input = msg.pciTransport === "uibuilder" ? (msg.data || (msg.payload && msg.payload.data) || {}) : parseBody();
  const requestHost = routedHost();
  if (!requestHost || requestHost !== cfg.mainHost) throw pciErrors.invalidTenantContext();
  const session = await requireSession(["provider_admin"]);
  const actor = `keycloak:${session.subject}`;
  const pool = getPool();

  if (action === "provider.registrations.list") {
    const state = String(query().state || input.state || "");
    const allowed = ["requested", "pending_approval", "approved", "rejected", "expired"];
    if (state && !allowed.includes(state)) throw pciErrors.validation("state is invalid.");
    const result = state
      ? await pool.query("SELECT * FROM tenant_registrations WHERE state=$1 ORDER BY created_at DESC", [state])
      : await pool.query("SELECT * FROM tenant_registrations ORDER BY created_at DESC");
    return emit(200, { items: result.rows.map(mapRegistration), total: result.rowCount }, {}, "pci:provider-registrations");
  }

  if (action === "provider.registrations.get") {
    const id = String(params().registrationId || input.registrationId || "");
    const result = await pool.query("SELECT * FROM tenant_registrations WHERE registration_id=$1", [id]);
    if (!result.rows[0]) throw pciErrors.notFound("Registration not found.");
    const registration = mapRegistration(result.rows[0]);
    return emit(200, { registration }, { etag: `"${registration.version}"` });
  }

  if (action === "provider.registrations.approve") {
    const id = String(params().registrationId || input.registrationId || "");
    const expectedVersion = msg.pciTransport === "uibuilder" ? Number(input.version) : parseIfMatch();
    const reason = input.reason === undefined || input.reason === null ? null : String(input.reason).trim().slice(0, 1000);
    const client = await pool.connect();
    let registration;
    let tenant;
    let created = false;
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM tenant_registrations WHERE registration_id=$1 FOR UPDATE", [id]);
      const row = locked.rows[0];
      if (!row) throw pciErrors.notFound("Registration not found.");
      if (row.state === "approved") {
        const existing = await client.query("SELECT * FROM tenants WHERE registration_id=$1", [id]);
        registration = mapRegistration(row);
        tenant = mapTenant(existing.rows[0]);
        await client.query("COMMIT");
      } else {
        if (Number(row.version) !== expectedVersion) throw pciErrors.preconditionFailed();
        if (row.state !== "pending_approval") throw pciErrors.conflict("Only an email-verified registration can be approved.");
        const now = new Date().toISOString();
        const tenantId = crypto.randomUUID();
        const ownerUid = crypto.randomUUID();
        const inserted = await client.query(
          `INSERT INTO tenants(tenant_id,registration_id,tenant_slug,owner_uid,organization_identifier,organization_name,primary_domain,state,desired_generation,observed_generation,conditions,identity_state,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,'provisioning',1,0,'[]'::jsonb,'pending',$8,$8) RETURNING *`,
          [tenantId, id, row.requested_slug, ownerUid, row.organization_identifier, row.organization_name, row.requested_domain, now],
        );
        const updated = await client.query(
          `UPDATE tenant_registrations SET state='approved',reviewed_by=$2,reviewed_at=$3,decision_reason=$4,version=version+1,updated_at=$3 WHERE registration_id=$1 RETURNING *`,
          [id, actor, now, reason],
        );
        await client.query(
          `INSERT INTO audit_events(event_type,actor,registration_id,tenant_id,reason,safe_metadata,created_at)
           VALUES('registration.approved',$1,$2,$3,$4,$5::jsonb,$6)`,
          [actor, id, tenantId, reason, JSON.stringify({ requested_domain: row.requested_domain }), now],
        );
        await client.query("COMMIT");
        registration = mapRegistration(updated.rows[0]);
        tenant = mapTenant(inserted.rows[0]);
        created = true;
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error && error.code === "23505") throw pciErrors.conflict("The requested organization, tenant slug, or domain is already assigned.");
      throw error;
    } finally { client.release(); }
    try {
      await sendMail({
        to: registration.contactEmail,
        subject: "FAP PCI tenant registration approved",
        text: `The registration for ${registration.organizationName} was approved. Tenant provisioning and Keycloak onboarding have started.

Tenant URL: ${uiUrl(tenant.primaryDomain, cfg.orceBasePath)}`,
      });
    } catch (error) { node.warn("PCI-EMAIL-DELIVERY-FAILED"); }
    return emit(created ? 201 : 200, { registration, tenant, created }, { etag: `"${registration.version}"` }, "pci:tenant-approved");
  }

  if (action === "provider.registrations.reject") {
    const id = String(params().registrationId || input.registrationId || "");
    const expectedVersion = msg.pciTransport === "uibuilder" ? Number(input.version) : parseIfMatch();
    const reason = String(input.reason || "").trim();
    if (reason.length < 3 || reason.length > 1000) throw pciErrors.validation("A rejection reason between 3 and 1000 characters is required.");
    const client = await pool.connect();
    let registration;
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM tenant_registrations WHERE registration_id=$1 FOR UPDATE", [id]);
      const row = locked.rows[0];
      if (!row) throw pciErrors.notFound("Registration not found.");
      if (row.state === "rejected") {
        registration = mapRegistration(row);
        await client.query("COMMIT");
      } else {
        if (Number(row.version) !== expectedVersion) throw pciErrors.preconditionFailed();
        if (row.state !== "pending_approval") throw pciErrors.conflict("Only an email-verified registration can be rejected.");
        const updated = await client.query(
          `UPDATE tenant_registrations SET state='rejected',reviewed_by=$2,reviewed_at=now(),decision_reason=$3,version=version+1,verification_token_hash=NULL,verification_expires_at=NULL,updated_at=now() WHERE registration_id=$1 RETURNING *`,
          [id, actor, reason],
        );
        await client.query(`INSERT INTO audit_events(event_type,actor,registration_id,reason) VALUES('registration.rejected',$1,$2,$3)`, [actor, id, reason]);
        await client.query("COMMIT");
        registration = mapRegistration(updated.rows[0]);
      }
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
    try {
      await sendMail({ to: registration.contactEmail, subject: "FAP PCI tenant registration rejected", text: `The registration for ${registration.organizationName} was rejected. Contact the service provider for further details.

PCI portal: ${uiUrl(cfg.mainHost, cfg.orceBasePath)}` });
    } catch (error) { node.warn("PCI-EMAIL-DELIVERY-FAILED"); }
    return emit(200, { registration }, { etag: `"${registration.version}"` }, "pci:tenant-rejected");
  }

  if (action === "provider.tenants.list") {
    const result = await pool.query("SELECT * FROM tenants ORDER BY created_at DESC");
    return emit(200, { items: result.rows.map(mapTenant), total: result.rowCount }, {}, "pci:provider-tenants");
  }

  if (action === "provider.tenant.reconciliation") {
    const id = String(params().tenantId || input.tenantId || "");
    const result = await pool.query("SELECT * FROM tenants WHERE tenant_id=$1", [id]);
    if (!result.rows[0]) throw pciErrors.notFound("Tenant not found.");
    return emit(200, { tenant: mapTenant(result.rows[0]) });
  }

  throw pciErrors.notFound("Unknown provider action.");
})().catch(emitError);
