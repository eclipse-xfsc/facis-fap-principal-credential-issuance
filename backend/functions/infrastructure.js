return (async () => {
  const action = String(msg.pciAction || msg.type || "");

  async function currentStatus() {
    try {
      const row = (await getPool().query("SELECT state_value,updated_at FROM platform_state WHERE state_key='platform'"))?.rows?.[0];
      if (!row) {
        return {
          status: "GroundZeroRequired",
          ready: false,
          version: cfg.version,
          mainHost: cfg.mainHost,
          orceBasePath: cfg.orceBasePath,
          ocmNamespace: cfg.ocmNamespace,
          message: "Run ground-zero before importing the PCI flow.",
        };
      }
      const platform = { ...row.state_value, updatedAt: new Date(row.updated_at).toISOString() };
      const address = platform?.gateway?.address || "";
      if (address && platform.mainHost) {
        const dnsReady = await dnsMatchesHost(platform.mainHost, address).catch(() => false);
        platform.ready = Boolean(dnsReady);
        platform.status = dnsReady ? "Ready" : "DNSPending";
        if (Array.isArray(platform.conditions)) {
          platform.conditions = platform.conditions.map((condition) => condition.type === "MainDNSReady"
            ? {
                ...condition,
                status: dnsReady ? "True" : "False",
                reason: dnsReady ? "DNSMatchesGateway" : "DNSPending",
                message: dnsReady
                  ? "Main PCI DNS resolves to the Envoy Gateway."
                  : `DNS must resolve ${platform.mainHost} to ${address}.`,
              }
            : condition);
        }
      }
      return platform;
    } catch (error) {
      return {
        status: "GroundZeroRequired",
        ready: false,
        version: cfg.version,
        mainHost: cfg.mainHost,
        orceBasePath: cfg.orceBasePath,
        ocmNamespace: cfg.ocmNamespace,
        message: "PCI platform dependency check failed",
      };
    }
  }

  if (action === "platform.status") {
    const platform = await currentStatus();
    node.status({
      fill: platform.ready ? "green" : "yellow",
      shape: platform.ready ? "dot" : "ring",
      text: platform.status || "Unknown",
    });
    return emit(200, { platform }, {}, "pci:platform-status");
  }

  if (action === "platform.initialize") {
    if (!msg.pciInternal) await requireSession(["provider_admin"]);
    const platform = await currentStatus();
    node.status({
      fill: platform.ready ? "green" : "yellow",
      shape: platform.ready ? "dot" : "ring",
      text: platform.status || "GroundZeroRequired",
    });
    return emit(200, {
      platform,
      reconciliation: "status-only",
      message: "Cluster bootstrap is owned exclusively by ground-zero; M1 performs no infrastructure mutations.",
    }, {}, "pci:platform-status");
  }

  throw pciErrors.notFound("Unknown infrastructure action.");
})().catch((error) => {
  node.status({ fill: "red", shape: "ring", text: "PCI-PLATFORM-CHECK-FAILED" });
  return emitError(error);
});
