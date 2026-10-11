# Upgrade the existing PCI instance

Domains, mailbox addresses, private file paths, contexts and StorageClasses in this guide are examples. Supply target deployment values as described in [neutral configuration](neutral-configuration.md).

Use a new extracted directory. Preserve the previous source, database backup, ORCE flow export and `/data` backup. This candidate updates the PCI instance in `xfsc-orce-pci-orce`; `xfsc-orce-operator` remains the separate deployer.

The uploaded source already includes some live repairs. This ZIP consolidates them; copying only G0 will not update the application. Take a PostgreSQL backup with restricted permissions before running schema initialization:

```bash
export KUBECONFIG=/private/kubeconfig.yaml
umask 077
mkdir -p "$HOME/pci-upgrade-backup"
kubectl --context cluster-admin@ocm-cr -n xfsc-orce-pci-orce \
  exec fap-pci-postgres-0 -c postgresql -- \
  pg_dump -U fap_pci -d fap_pci -Fc \
  > "$HOME/pci-upgrade-backup/pre-rc2.dump"
```

Export the deployed flow through the ORCE editor and preserve it privately; it may contain operator configuration. Keep the existing G0 credentials file in `~/.local/state/fap-pci/`. Do not regenerate the database or provider password to address an upgrade error.

## Prepare prerequisites

From the rc.2 repository root, run the command matching the current IONOS cluster:

```bash
bash scripts/deploy.sh \
  --kubeconfig "$KUBECONFIG" \
  --context cluster-admin@ocm-cr \
  --orce-namespace xfsc-orce-pci-orce \
  --orce-deployment xfsc-orce \
  --orce-service xfsc-orce-service-pci-orce \
  --orce-container orce \
  --orce-service-port 80 \
  --orce-base-path /pci-orce \
  --orce-editor-path /pci-orce \
  --main-host pci.example.com \
  --cert /private/fullchain.pem \
  --key /private/privkey.pem \
  --provider-email provider@example.com \
  --ocm-namespace ocm-wstack \
  --keycloak-service-name ocm-ui-keycloak \
  --keycloak-internal-url http://ocm-ui-keycloak.ocm-wstack.svc.cluster.local:8080/orce/identity \
  --infrastructure-namespace infrastructure \
  --envoy-namespace infrastructure \
  --gateway-class-name envoy \
  --gateway-name pci-gateway \
  --orce-data-storage-class ionos-cloud-essential \
  --postgres-storage-class ionos-cloud-essential \
  --mail-mode mailpit
```

`scripts/deploy.sh` runs G0 and then installs the private PCI telemetry chart. `dist/ground-zero.sh` alone prepares the core runtime. Set `PCI_OBSERVABILITY_MODE=external` only when an existing owner-managed Jaeger/Prometheus/Collector setup already meets FR-55/56/57; record its endpoint configuration and acceptance evidence. The shared `observability` namespace is never adopted.

G0 preserves the selected shared Envoy controller and OCM workloads. Its declared OCM-side effects remain the PCI Keycloak realm/client/profile and a separately owned additive Keycloak integration NetworkPolicy. It does not install new OCM services or widen the signer/OpenBao policy.

G0 and telemetry may need a controlled ORCE rollout. `Recreate` prevents RWO multi-attach deadlock; the single replica is briefly unavailable. Existing pending offers and sessions must be retried after a runtime restart. Do not perform an additional rollout after flow import.

## Upload flow and UI together

Use the **ORCE editor** administrator password at the prompt, not the PCI provider account. The temporary access token and password file remain private and are removed when this subshell exits.

```bash
(
  set -euo pipefail
  umask 077
  PCI_UPLOAD_TMP="$(mktemp -d)"
  trap 'rm -rf "$PCI_UPLOAD_TMP"' EXIT
  read -rsp 'ORCE editor admin password: ' PCI_EDITOR_PASSWORD
  printf '\n'
  printf '%s' "$PCI_EDITOR_PASSWORD" > "$PCI_UPLOAD_TMP/password"
  unset PCI_EDITOR_PASSWORD
  curl -fsS --connect-timeout 10 --max-time 30 \
    -X POST https://pci.example.com/pci-orce/auth/token \
    --data-urlencode 'client_id=node-red-admin' \
    --data-urlencode 'grant_type=password' \
    --data-urlencode 'scope=*' \
    --data-urlencode 'username=admin' \
    --data-urlencode "password@$PCI_UPLOAD_TMP/password" |
    jq -er '.access_token | select(type == "string" and length > 0) |
      "header = " + (("Authorization: Bearer " + .) | @json)' \
      > "$PCI_UPLOAD_TMP/curl.conf"
  PCI_ORCE_CURL_CONFIG="$PCI_UPLOAD_TMP/curl.conf" \
    bash automation/stage1/install.sh \
      --kubeconfig "$KUBECONFIG" \
      --context cluster-admin@ocm-cr \
      --orce-namespace xfsc-orce-pci-orce \
      --orce-deployment xfsc-orce \
      --orce-container orce \
      --admin-url https://pci.example.com/pci-orce/
)
```

The installer retains unrelated nodes and deploys modified flows. It copies `dist/ui/` to `/data/uibuilder/ui/src/`. Reload the browser without cache; confirm the footer shows `0.5.0-rc.2`.

## Verify before continuing

```bash
kubectl --context cluster-admin@ocm-cr -n xfsc-orce-pci-orce \
  get deployment xfsc-orce -o jsonpath='{.spec.strategy.type}{"\n"}'
kubectl --context cluster-admin@ocm-cr -n infrastructure \
  get gateway pci-gateway -o jsonpath='{.status.addresses[0].value}{"\n"}'
curl --noproxy '*' --fail-with-body --connect-timeout 10 --max-time 20 \
  https://pci.example.com/pci-orce/readyz
```

Keep the existing DNS records if the Gateway address is unchanged. Recheck provider login, Alpha login, both keys/JWKS and native metadata before starting an issuance. Credentials are still in the operator's private G0 state file. A `Ready` bootstrap message is not proof of wallet interoperability.

For rollback, restore the approved previous flow/UI and runtime configuration from backup. The schema change is additive; do not drop tables or recreate PVCs as a shortcut. Restore the database only after establishing why a rollback requires it and preserving the failed-upgrade state.
