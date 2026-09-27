return (async () => {
  const action = String(msg.pciAction || msg.type || "");
  if (action === "status.health") {
    let startedAt = Number(global.get("fapPciStartedAt") || 0);
    if (!startedAt) { startedAt = Date.now(); global.set("fapPciStartedAt", startedAt); }
    return emit(200, { status: "ok", service: "facis-fap-pci-orce", version: cfg.version, orceBasePath: cfg.orceBasePath, uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) });
  }
  if (action === "status.ready") {
    try {
      await getPool().query("SELECT 1");
      const row = (await getPool().query("SELECT state_value FROM platform_state WHERE state_key='platform'")).rows[0];
      if (!row || !row.state_value) throw new Error("ground-zero platform state is missing");
      const gateway = await k8sGet("gateway.networking.k8s.io/v1", "Gateway", cfg.gatewayName, cfg.infrastructureNamespace);
      if (!gateway) throw new Error(`Gateway ${cfg.infrastructureNamespace}/${cfg.gatewayName} is missing`);
      const programmed = conditionStatus(gateway, "Programmed");
      if (!programmed || programmed.status !== "True") throw new Error("PCI Gateway is not Programmed");
      const address = gatewayAddress(gateway);
      const host = String(row.state_value.mainHost || cfg.mainHost || "");
      if (!address || !host) throw new Error("Gateway address or main host is incomplete");
      const dnsReady = await dnsMatchesHost(host, address).catch(() => false);
      if (!dnsReady) throw new Error(`main DNS ${host} does not resolve to Gateway ${address}`);
      const issuer = `${cfg.keycloak.publicUrl}/realms/${cfg.keycloak.realm}`;
      const discovery = await requestRaw(`${cfg.keycloak.internalUrl}/realms/${encodeURIComponent(cfg.keycloak.realm)}/.well-known/openid-configuration`, { timeout: 5000 });
      if (discovery.status !== 200 || !discovery.data || discovery.data.issuer !== issuer) throw new Error("Keycloak OIDC discovery is unavailable or inconsistent");
      return emit(200, { status: "ready", service: "facis-fap-pci-orce", version: cfg.version, orceBasePath: cfg.orceBasePath, platform: "Ready", gatewayAddress: address });
    } catch (error) {
      throw pciErrors.dependency("PCI readiness is not satisfied. Check dependency status.");
    }
  }
  if (action === "status.metrics") {
    const [registrations, tenants, sessions] = await Promise.all([
      getPool().query("SELECT state,count(*)::bigint AS count FROM tenant_registrations GROUP BY state"),
      getPool().query("SELECT state,count(*)::bigint AS count FROM tenants GROUP BY state"),
      getPool().query("SELECT count(*)::bigint AS count FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > now()"),
    ]);
    const lines = [
      "# HELP fap_pci_registrations_total Tenant registrations by state.",
      "# TYPE fap_pci_registrations_total gauge",
      ...registrations.rows.map((row) => `fap_pci_registrations_total{state="${String(row.state).replace(/[^a-zA-Z0-9_-]/g, "_")}"} ${row.count}`),
      "# HELP fap_pci_tenants_total Tenants by lifecycle state.",
      "# TYPE fap_pci_tenants_total gauge",
      ...tenants.rows.map((row) => `fap_pci_tenants_total{state="${String(row.state).replace(/[^a-zA-Z0-9_-]/g, "_")}"} ${row.count}`),
      "# HELP fap_pci_auth_sessions_active Active Keycloak-backed ORCE sessions.",
      "# TYPE fap_pci_auth_sessions_active gauge",
      `fap_pci_auth_sessions_active ${sessions.rows[0].count}`,
      "",
    ];
    msg.statusCode = 200;
    msg.headers = { "content-type": "text/plain; version=0.0.4; charset=utf-8" };
    msg.payload = lines.join("\n");
    return [msg, null];
  }
  if (action === "status.openapi") {
    const document = JSON.parse(JSON.stringify(PCI_OPENAPI_DOCUMENT));
    document.servers = [{
      url: `${publicOrigin(cfg.mainHost)}${cfg.orceBasePath}`,
      description: `Deployment-specific PCI main host with normalized ORCE HTTP base path ${cfg.orceBasePath || "/"}`,
    }];
    document["x-pci-orce-base-path"] = cfg.orceBasePath;
    msg.statusCode = 200;
    msg.headers = { "content-type": "application/json; charset=utf-8" };
    msg.payload = document;
    return [msg, null];
  }
  throw pciErrors.notFound("Unknown status action.");
})().catch(emitError);
