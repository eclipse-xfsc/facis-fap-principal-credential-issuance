# Upgrade the existing PCI instance

Domains, mailbox addresses, private file paths, contexts and StorageClasses in this guide are examples. Supply target deployment values as described in [neutral configuration](neutral-configuration.md).

Use a new extracted directory. Preserve the previous source, database backup, ORCE flow export and `/data` backup. This candidate updates the PCI instance in `xfsc-orce-pci-orce`; `xfsc-orce-operator` remains the separate deployer.

This release rebuilds all distribution files and adds an additive history association table. Copying only G0 will not update the application. Use this complete release in a new directory. Take a PostgreSQL backup with restricted permissions before running schema initialization:

```bash
export KUBECONFIG=/private/kubeconfig.yaml
umask 077
mkdir -p "$HOME/pci-upgrade-backup"
kubectl --context cluster-admin@ocm-cr -n xfsc-orce-pci-orce \
  exec fap-pci-postgres-0 -c postgresql -- \
  pg_dump -U fap_pci -d fap_pci -Fc \
  > "$HOME/pci-upgrade-backup/pre-rc3.dump"
```

Export the deployed flow through the ORCE editor and preserve it privately; it may contain operator configuration. Preserve existing credentials privately. G0 reuses Kubernetes Secret values and does not reset the provider password on upgrade. By default rc.3 no longer writes a local credentials file; explicit `PCI_EXPORT_BOOTSTRAP_CREDENTIALS=true` restores that optional export. Keycloak admin credentials move to a read-only Secret mount. Do not regenerate the database or provider password to address an upgrade error.

## Prepare prerequisites

From the rc.3 repository root, run the command matching the current IONOS cluster:

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
  curl --tlsv1.3 --tls-max 1.3 -fsS --connect-timeout 10 --max-time 30 \
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

The installer retains unrelated nodes and deploys modified flows. It copies `dist/ui/` to `/data/uibuilder/ui/src/`. Reload the browser without cache; confirm the footer shows `0.5.0-rc.3`.

## Verify before continuing

```bash
kubectl --context cluster-admin@ocm-cr -n xfsc-orce-pci-orce \
  get deployment xfsc-orce -o jsonpath='{.spec.strategy.type}{"\n"}'
kubectl --context cluster-admin@ocm-cr -n infrastructure \
  get gateway pci-gateway -o jsonpath='{.status.addresses[0].value}{"\n"}'
curl --noproxy '*' --fail-with-body --connect-timeout 10 --max-time 20 \
  https://pci.example.com/pci-orce/readyz
```

Keep the existing DNS records if the Gateway address is unchanged. Recheck provider login, Alpha login, both keys/JWKS and native metadata before starting an issuance. Existing credentials remain in Kubernetes Secrets. An old private credentials export remains valid only if its password was not changed. Retrieve the provider password privately with `kubectl -n xfsc-orce-pci-orce get secret fap-pci-runtime -o jsonpath='{.data.PCI_BOOTSTRAP_PROVIDER_PASSWORD}' | base64 -d`; do not attach it to evidence. A `Ready` bootstrap message is not proof of wallet interoperability.

For rollback, restore the approved previous flow/UI and runtime configuration from backup. The schema change is additive; do not drop tables or recreate PVCs as a shortcut. Restore the database only after establishing why a rollback requires it and preserving the failed-upgrade state.

For repeated non-interactive installs, use the [release runner](automation.md), which performs both prerequisite deployment and flow/UI installation. Set participant host/trust and [native TLS profiles](transport.md) before G0. The empty-catalogue capability flag must remain false until the OCM owner has deployed and tested the supplied fix. Verify the existing Alpha key references and issuer IDs before changing configuration; do not recreate working keys.
