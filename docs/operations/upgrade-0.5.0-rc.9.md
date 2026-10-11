# Upgrade prepared PCI artifacts to rc.9

This historical guide uses neutral examples. Domains and the `192.0.2.10` / `192.0.2.11` IPs are documentation placeholders; replace them with target values or omit optional overrides. See [neutral configuration](neutral-configuration.md).

Extract this release into a new directory and verify both the archive SHA-256 and `docs/release/source-sha256.txt`. Preserve previous released source directories. No source patch, manual Function-node edit or participant image rebuild is needed.

From the extracted rc.9 repository:

```bash
bash scripts/upgrade-artifacts.sh \
  --config "$HOME/fap-pci/deployment-private/pci-rc6-lifecycle.json" \
  --gateway-ip 192.0.2.10 \
  --api-ip 192.0.2.11
```

This operation uses Bash/jq and the existing Node flow merger/runtime ownership components; it invokes no Python. Other inherited deployment/lifecycle tools are not all converted to Bash. The private configuration and password file remain unchanged. IP overrides are optional and retain TLS certificate verification; temporary API overrides do not alter the original kubeconfig.

The helper records the three source corrections and installation result in `deployment-test-notes`. It verifies source checksums before and after installation and requires health/readiness to report rc.9. Read requests receive bounded retries. If the flow POST fails or times out, review the live revision before any repeat; the first request may have committed.

After successful installation, hard-refresh the Alpha UI, open Tenant settings / Issuer metadata and click **Publish to OCM** once. Capture the result and desired/observed revisions. Equality and published state are the first live check; wallet metadata discovery and credential issuance follow separately.
