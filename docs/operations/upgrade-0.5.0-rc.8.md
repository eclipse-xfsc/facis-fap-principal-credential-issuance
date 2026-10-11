# Upgrade rc.7 artifacts to rc.8

This historical guide uses neutral examples. Domains and the `192.0.2.10` / `192.0.2.11` IPs are documentation placeholders; replace them with target values or omit optional overrides. See [neutral configuration](neutral-configuration.md).

Extract the complete source into a new directory. Verify the supplied archive SHA-256 and then `sha256sum --quiet -c docs/release/source-sha256.txt` inside the extracted repository. Do not overwrite the deployed rc.7 source tree or modify distribution files during testing.

For the prepared development deployment, run from the rc.8 repository:

```bash
bash scripts/upgrade-artifacts.sh \
  --config "$HOME/fap-pci/deployment-private/pci-rc6-lifecycle.json" \
  --gateway-ip 192.0.2.10 \
  --api-ip 192.0.2.11
```

IP overrides are optional and preserve TLS certificate verification. If the selected API address cannot be reached, no installation has started; retry using a currently reachable API address or omit the override. Never persist a stale IP to the original kubeconfig or source artifacts.

Prerequisites: Bash, jq, curl, kubectl, Node.js and sha256sum; existing private lifecycle JSON and editor password file. This is an artifact-only upgrade for a runtime already prepared by G0. It records the upstream change and upgrade result outside the source, preserves non-PCI flows through the existing merger, copies the canonical UI, verifies source checksums again, and requires health/readiness to report the release version. It does not rerun shared infrastructure provisioning or modify tenant configuration or the existing participant image.

The flow POST has no automatic retries. If it fails or times out, inspect the live revision and release health before another attempt; the first request may have committed. Read-only API and flow requests receive bounded retries. Authentication failure stops with a sanitized HTTP classification.

After a successful upgrade, retry Alpha catalogue publication once. Capture desired/observed convergence, then validate wallet metadata and continue the step-by-step functional tests. A successful upgrade is not an end-to-end acceptance receipt.
