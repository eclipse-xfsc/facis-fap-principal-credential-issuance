# Upgrade prepared PCI artifacts to rc.10

This historical guide uses neutral examples. Domains and the `192.0.2.10` / `192.0.2.11` IPs are documentation placeholders; replace them with target values or omit optional overrides. See [neutral configuration](neutral-configuration.md).

Extract the complete source archive into a new directory and verify its SHA-256 plus `docs/release/source-sha256.txt`. Run from that new repository:

```bash
bash scripts/upgrade-artifacts.sh \
  --config "$HOME/fap-pci/deployment-private/pci-rc6-lifecycle.json" \
  --gateway-ip 192.0.2.10 \
  --api-ip 192.0.2.11
```

The existing Bash/jq installer uses Node for flow merging, installs rebuilt flow/UI artifacts and verifies rc.10 health/readiness. It records canonical changes in `deployment-test-notes`, outside the source tree. Existing private configuration, password file, tenant records and participant image require no edits. IP overrides retain TLS verification and use temporary API configuration.

Read requests have bounded retries. Flow submission is attempted once; if its outcome is ambiguous, inspect the live revision before repeating installation. The operator has already confirmed Alpha publication on rc.9; no additional metadata save or publication is needed to test this serializer correction.

After installation, test the public issuer discovery route with a single read:

```bash
(
  set -euo pipefail
  curl --http1.1 --noproxy '*' \
    --resolve alpha-pci.example.com:443:192.0.2.10 \
    --tlsv1.3 --tls-max 1.3 \
    --connect-timeout 10 --max-time 30 \
    --fail-with-body --silent --show-error \
    'https://alpha-pci.example.com/.well-known/openid-credential-issuer/pci-orce' |
    jq .
)
```

Expected: HTTP success and `alpha_employee_jwt` under `credential_configurations_supported`, with the Alpha issuer URL and wallet-visible claim metadata. Record the actual response before continuing with keys, participant authentication and native issuance.
