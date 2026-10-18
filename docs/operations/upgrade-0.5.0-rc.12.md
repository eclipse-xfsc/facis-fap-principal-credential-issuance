# Surgical upgrade from a prepared rc.11 deployment

This guide installs the neutral revision of **0.5.0-rc.12** into an already prepared PCI instance. Use the target environment's existing private lifecycle configuration. Example domains and paths are placeholders; see [neutral configuration](neutral-configuration.md).

Download the revised fap-pci-0.5.0-rc.12.zip to ~/Downloads. Verify the archive SHA-256 supplied with it. Extract into a new directory, preserving previous source and private inputs. If the target release directory already exists, choose another extraction directory rather than overwriting it.

```bash
(
  set +x
  set -euo pipefail
  umask 077
  pci_base="${PCI_WORKSPACE:-$HOME/fap-pci}"
  pci_release="$pci_base/source/fap-pci-0.5.0-rc.12"
  test ! -e "$pci_release"
  mkdir -p "$pci_base/source"
  unzip -q "$HOME/Downloads/fap-pci-0.5.0-rc.12.zip" -d "$pci_base/source"
  cd "$pci_release/facis-fap-principal-credential-issuance"
  sha256sum --quiet -c docs/release/source-sha256.txt
  pci_ip_args=()
  if [[ -n "${PCI_GATEWAY_IP:-}" ]]; then
    pci_ip_args+=(--gateway-ip "$PCI_GATEWAY_IP")
  fi
  if [[ -n "${PCI_API_IP:-}" ]]; then
    pci_ip_args+=(--api-ip "$PCI_API_IP")
  fi
  bash scripts/upgrade-artifacts.sh \
    --config "${PCI_LIFECYCLE_CONFIG:-$pci_base/deployment-private/pci-rc6-lifecycle.json}" \
    --notes "${PCI_TEST_NOTES:-$pci_base/deployment-test-notes}" \
    "${pci_ip_args[@]}"
)
```

Set optional IP overrides only when the actual gateway/API addresses are known. Omitting them uses the existing DNS and kubeconfig server. Both modes retain TLS certificate verification; temporary API overrides do not rewrite the original kubeconfig.

The Bash installer verifies release hashes, authenticates with the existing password file, merges PCI flows through the revision-aware Node-RED Admin API, copies UI assets and requires rc.12 health/readiness. It retains foreign flows and records changes outside the source tree. Flow submission is attempted once; after an ambiguous failure, inspect the live revision before retrying. Ground-zero and lifecycle provisioning are not invoked. No npm installation or build is required on the operator machine. Do not edit or regenerate the sealed distribution before installation.

## Test after installation

The flow upgrade replaces process-owned runtime state. After installation succeeds, create a **new synthetic** credential offer in the target tenant. The software-wallet helper tests OID4VCI 1.0 / `jwt_vc_json`; use an offer from that exact configuration. From the extracted repository, supply actual values for the UUID placeholders and issuer URL:

```bash
export PCI_WALLET_ISSUER="https://alpha-pci.example.com/pci-orce"
export PCI_WALLET_TENANT_ID="YOUR-TENANT-UUID"
export PCI_WALLET_CONFIGURATION_ID="YOUR-CONFIGURATION-UUID"
export PCI_WALLET_SYNTHETIC_ONLY=true
# Optional: export PCI_WALLET_GATEWAY_IP="YOUR-ACTUAL-GATEWAY-IP"
bash scripts/test-alpha-wallet.sh
```

The `.example.com` URL and UUID placeholders must be replaced. The helper fails before making requests when required values are missing or invalid. It silently prompts for the fresh offer link and tenant `fap_pci_session` cookie value. HTTP/1.1, direct optional gateway routing and verified TLS 1.3 are retained. Credentials and authentication material remain in memory or private temporary files deleted on exit.

Expect POST /pci-orce/api/credential HTTP 200 followed by public JWKS verification and two authenticated OpenID4VP presentation checks. PASS means this software-wallet case completed. The result is saved as `rc12-alpha-wallet-result.log` under `PCI_TEST_NOTES` or `$HOME/fap-pci/deployment-test-notes`. If a later step fails, the log identifies it. Do not reuse a consumed offer or replay an uncertain credential request. This helper does not establish PCM or complete requirement acceptance.

For callback diagnostics, retrieve sanitized events from the selected PCI namespace and deployment:

```bash
kubectl -n xfsc-orce-pci-orce logs deployment/xfsc-orce \
  --all-containers=true --since=5m --tail=1000 --timestamps=true |
  rg 'pci\.issuance\.failed|PCI-CALLBACK-FAILED' || true
```

The namespace and deployment names are examples. Existing OCM services, keys, database, participant image and unsealed OpenBao are outside this artifact-only upgrade. No native service restart is part of the signer-array fix; confirm that the earlier public JWKS correction is already effective. Preserve the previous source directory for rollback. An older rc.11 rollback retains its known signer-array defect, clears pending runtime offers and does not undo issuance that may have completed.
