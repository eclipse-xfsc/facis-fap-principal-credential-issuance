return (async () => {
  const action = String(msg.pciAction || msg.type || "");
  const input = msg.pciTransport === "uibuilder" ? (msg.data || (msg.payload && msg.payload.data) || {}) : parseBody();
  const pool = getPool();

  if (action === "registration.config") {
    return emit(200, {
      registrationMode: cfg.registrationMode,
      baseDomain: cfg.baseDomain,
      hostnameTemplate: `{slug}-${cfg.tenantHostSuffix}.${cfg.baseDomain}`,
      orceBasePath: cfg.orceBasePath,
      uiPath: cfg.publicUiPath,
      apiBasePath: cfg.publicApiBasePath,
      publicUiUrl: uiUrl(cfg.mainHost, cfg.orceBasePath),
      mainHost: cfg.mainHost,
      verificationTtlMinutes: cfg.verificationTtlMinutes,
    });
  }

  if (['registration.create','registration.resend'].includes(action)) {
    if(routedHost()!==cfg.mainHost)throw pciErrors.forbidden();
    if (cfg.registrationMode === 'private') await requireSession(['provider_admin']);
    const windowStart=Math.floor(Date.now()/60000);
    const key=crypto.createHmac('sha256',cfg.verificationPepper).update('registration:'+routedHost()).digest('hex');
    const rate=(await pool.query(`INSERT INTO pci_registration_rates(bucket_hash,window_start,count) VALUES($1,$2,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET count=CASE WHEN pci_registration_rates.window_start=EXCLUDED.window_start THEN pci_registration_rates.count+1 ELSE 1 END,window_start=EXCLUDED.window_start RETURNING count`,[key,windowStart])).rows[0];
    if(rate.count>30)throw new PciError(429,'PCI-REGISTRATION-RATE','Rate limit','Registration service is busy. Retry in one minute.');
  }

  if (action === "registration.create") {
    const organizationIdentifier = String(input.organizationIdentifier || "").trim();
    const organizationName = String(input.organizationName || "").trim();
    const contactName = String(input.contactName || "").trim();
    const contactEmail = String(input.contactEmail || "").trim().toLowerCase();
    const requestedSlug = String(input.requestedSlug || "").trim().toLowerCase();
    const requestedMode = String(input.registrationMode || "public");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/.test(organizationIdentifier)) throw pciErrors.validation("organizationIdentifier is invalid.");
    if (organizationName.length < 2 || organizationName.length > 160) throw pciErrors.validation("organizationName is invalid.");
    if (contactName.length < 2 || contactName.length > 120) throw pciErrors.validation("contactName is invalid.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail) || contactEmail.length > 254) throw pciErrors.validation("contactEmail is invalid.");
    if (cfg.registrationMode === "private" && requestedMode !== "private") throw pciErrors.forbidden("Public registration is disabled for this environment.");
    const requestedDomain = buildTenantDomain(requestedSlug);
    const registrationId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHmac("sha256", cfg.verificationPepper).update(token).digest("hex");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + cfg.verificationTtlMinutes * 60000);
    let row;
    try {
      const result = await pool.query(
        `INSERT INTO tenant_registrations (
           registration_id, organization_identifier, organization_name, contact_name, contact_email,
           requested_slug, requested_domain, registration_mode, state, verification_token_hash,
           verification_expires_at, email_delivery_status, version, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'requested',$9,$10,'pending',1,$11,$11) RETURNING *`,
        [registrationId, organizationIdentifier, organizationName, contactName, contactEmail, requestedSlug, requestedDomain, cfg.registrationMode, tokenHash, expiresAt.toISOString(), createdAt.toISOString()],
      );
      row = result.rows[0];
    } catch (error) {
      if (error && error.code === "23505") throw new PciError(409, "PCI-REGISTRATION-409-001", "Organization already registered", "An active registration or tenant already exists for this organization identifier or tenant slug.");
      throw error;
    }
    const verificationUrl = new URL(uiUrl(cfg.mainHost, cfg.orceBasePath));
    verificationUrl.searchParams.set("verify_registration", registrationId);
    verificationUrl.searchParams.set("token", token);
    let delivery = "sent";
    try {
      await sendMail({
        to: contactEmail,
        subject: "Verify your FAP PCI tenant registration",
        text: `Hello ${contactName},\n\nVerify the registration for ${organizationName}:\n${verificationUrl.toString()}\n\nThis link is single-use and expires automatically.`,
        html: `<p>Hello ${escapeHtml(contactName)},</p><p>Verify the registration for <strong>${escapeHtml(organizationName)}</strong>.</p><p><a href="${escapeHtml(verificationUrl.toString())}">Verify registration</a></p><p>This link is single-use and expires automatically.</p>`,
      });
    } catch (error) {
      delivery = "failed";
      node.warn("PCI-EMAIL-DELIVERY-FAILED");
    }
    const updated = await pool.query("UPDATE tenant_registrations SET email_delivery_status=$2, updated_at=now() WHERE registration_id=$1 RETURNING *", [registrationId, delivery]);
    row = updated.rows[0];
    await pool.query(
      `INSERT INTO audit_events(event_type,actor,registration_id,safe_metadata) VALUES('registration.requested','public',$1,$2::jsonb)`,
      [registrationId, JSON.stringify({ requested_domain: requestedDomain, email_delivery_status: delivery })],
    );
    const registration = mapRegistration(row);
    return emit(202, { registration }, { etag: `"${registration.version}"` }, "pci:registration-created");
  }

  if (action === "registration.verify") {
    const registrationId = String(params().registrationId || input.registrationId || "");
    const token = String(input.token || "");
    if (!registrationId || token.length < 32) throw pciErrors.invalidVerification();
    const tokenHash = crypto.createHmac("sha256", cfg.verificationPepper).update(token).digest("hex");
    const result = await pool.query(
      `UPDATE tenant_registrations
       SET state='pending_approval', email_verified_at=now(), verification_token_hash=NULL,
           verification_expires_at=NULL, version=version+1, updated_at=now()
       WHERE registration_id=$1 AND state='requested' AND verification_token_hash=$2 AND verification_expires_at > now()
       RETURNING *`,
      [registrationId, tokenHash],
    );
    if (!result.rows[0]) throw pciErrors.invalidVerification();
    await pool.query(`INSERT INTO audit_events(event_type,actor,registration_id) VALUES('registration.email_verified','public',$1)`, [registrationId]);
    const registration = mapRegistration(result.rows[0]);
    return emit(200, { registration }, { etag: `"${registration.version}"` }, "pci:registration-verified");
  }

  if (action === "registration.resend") {
    const registrationId = String(params().registrationId || input.registrationId || "");
    const existing = await pool.query("SELECT * FROM tenant_registrations WHERE registration_id=$1", [registrationId]);
    if (!existing.rows[0]) throw pciErrors.notFound("Registration not found.");
    if (existing.rows[0].state !== "requested") throw pciErrors.conflict("Verification can only be resent for a requested registration.");
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHmac("sha256", cfg.verificationPepper).update(token).digest("hex");
    const expiresAt = new Date(Date.now() + cfg.verificationTtlMinutes * 60000).toISOString();
    const rotated = await pool.query(
      `UPDATE tenant_registrations SET verification_token_hash=$2, verification_expires_at=$3,
       email_delivery_status='pending', version=version+1, updated_at=now() WHERE registration_id=$1 RETURNING *`,
      [registrationId, tokenHash, expiresAt],
    );
    const row = rotated.rows[0];
    const verificationUrl = new URL(uiUrl(cfg.mainHost, cfg.orceBasePath));
    verificationUrl.searchParams.set("verify_registration", registrationId);
    verificationUrl.searchParams.set("token", token);
    let delivery = "sent";
    try {
      await sendMail({ to: row.contact_email, subject: "Verify your FAP PCI tenant registration", text: `Verify the registration for ${row.organization_name}:\n${verificationUrl.toString()}` });
    } catch (error) { delivery = "failed"; node.warn("PCI-EMAIL-DELIVERY-FAILED"); }
    const finalRow = (await pool.query("UPDATE tenant_registrations SET email_delivery_status=$2,updated_at=now() WHERE registration_id=$1 RETURNING *", [registrationId, delivery])).rows[0];
    const registration = mapRegistration(finalRow);
    return emit(202, { registration }, { etag: `"${registration.version}"` }, "pci:registration-verification-resent");
  }

  throw pciErrors.notFound("Unknown registration action.");
})().catch(emitError);
