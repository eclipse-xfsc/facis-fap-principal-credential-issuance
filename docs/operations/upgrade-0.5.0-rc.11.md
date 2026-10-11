# Upgrade prepared PCI artifacts to rc.11

This historical guide uses neutral examples. Domains and the `192.0.2.10` / `192.0.2.11` IPs are documentation placeholders; replace them with target values or omit optional overrides. See [neutral configuration](neutral-configuration.md).

Extract the complete archive into a new directory and verify its archive SHA-256 and `docs/release/source-sha256.txt`. Run from the new repository:

```bash
bash scripts/upgrade-artifacts.sh \
  --config "$HOME/fap-pci/deployment-private/pci-rc6-lifecycle.json" \
  --gateway-ip 192.0.2.10 \
  --api-ip 192.0.2.11
```

The canonical Bash/jq installer uses the existing Node flow merger and retains TLS verification. It installs rebuilt flow/UI artifacts, verifies rc.11 health/readiness, and writes source-fix notes outside the source tree. Existing private configuration, tenant data, keys and participant image need no edits. Flow submission is attempted once; inspect the revision after an ambiguous failure before retrying.

Verify public key identifiers:

```bash
(
  set -euo pipefail
  curl --http1.1 --noproxy '*' \
    --resolve alpha-pci.example.com:443:192.0.2.10 \
    --tlsv1.3 --tls-max 1.3 \
    --connect-timeout 10 --max-time 30 \
    --fail-with-body --silent --show-error \
    'https://alpha-pci.example.com/pci-orce/.well-known/jwks.json' |
    jq '{keyCount:(.keys|length),keys:[.keys[]|{kid,kty,crv,alg,use}]}'
)
```

Expected identifiers include `did:web:alpha-pci.example.com#preauth` and `did:web:alpha-pci.example.com#issuer`. Allow up to 60 seconds for an existing public JWKS cache to expire. Verify the actual response before preparing one fresh offer and running the software wallet. Do not reuse consumed or expired grants, replay uncertain issuance, or treat software-wallet success as PCM acceptance.
