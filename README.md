# FACIS FAP Principal Credential Issuance

PCI runs in an existing XFSC-ORCE instance. Node-RED flows implement the API and tenant lifecycle; a uibuilder application provides the UI. Ground zero prepares PostgreSQL, Keycloak integration, Mailpit or an SMTP relay, and an Envoy Gateway. OCM W-Stack must already be installed; PCI does not deploy or modify it.

This repository is the 0.4.1 SR2 source and deployable release. It is not a record of a completed production acceptance test. Several OCM, participant and NATS integrations require environment-specific contracts and fail closed until configured.

## Layout

| Path | Contents |
| --- | --- |
| `backend/functions/`, `backend/sr2/` | Authored ORCE functions, issuer logic and schema |
| `src/`, `shared/` | Authored uibuilder UI and shared URL handling |
| `automation/stage1/`, `tools/`, `build.js` | Bootstrap, artifact install and deterministic build |
| `contracts/` | Input and integration contracts used by the build |
| `vendor/` | Pinned browser runtime and attribution |
| `dist/` | Built flow, bootstrap script and UI assets to deploy |
| `test/` | Offline BDD, integration and static checks |
| `docs/api/openapi.json` | Generated API contract |

## Build and test

Requires Node.js 20 or newer, npm, Python 3, Bash and the commands used by the selected deployment. The offline checks use bundled vendor files and do not contact a cluster:

```bash
npm run test:offline
```

`npm run build` regenerates `dist/fap-pci-flow.json`, `dist/ground-zero.sh`, `dist/ui/` and the OpenAPI contract from source. Do not edit generated flow or UI files without updating their source. The bundled `dist/` is included for an immediate deployment review.

## Deployment

1. Verify the existing ORCE Deployment and Service, the OCM namespace, cluster access, TLS coverage for the main, Mailpit and tenant hostnames, and storage classes. Ground zero can create a dedicated Envoy LoadBalancer and PostgreSQL PVC.
2. Run `dist/ground-zero.sh --help`, then run it with the target kubeconfig, ORCE namespace/Deployment/Service/container, main hostname, certificate and key, provider email, OCM namespace, Keycloak service and storage classes. It prepares prerequisites and may perform a controlled ORCE rollout. It does not import the flow or UI.
3. Import `dist/fap-pci-flow.json` in ORCE and deploy, then copy `dist/ui/*` into `/data/uibuilder/ui/src/`. The optional `automation/stage1/install.sh` merges the PCI flow with unrelated flows and copies the UI through the live runtime without a restart.
4. Point the exact main and Mailpit DNS names to the Envoy Gateway address. Each tenant needs its own `{slug}-pci.<base-domain>` A record to that same address. Check the HTTPRoute and the tenant's Ready condition before testing the tenant UI.

Ground zero writes generated provider credentials to a local mode-600 file named in its final JSON output. Never commit that file, cluster credentials, certificates, private keys, tokens, or exported live flows containing credentials.

Example artifact install after ground zero:

```bash
./automation/stage1/install.sh \
  --kubeconfig "$KUBECONFIG" \
  --orce-namespace "$ORCE_NAMESPACE" \
  --orce-deployment "$ORCE_DEPLOYMENT" \
  --orce-container "$ORCE_CONTAINER"
```

## Current limits

- OCM, NATS and participant operations require the exact upstream contracts and connectivity for the selected environment. The implementation rejects unsupported integrations rather than claiming successful issuance.
- An offline test pass does not establish readiness of live Keycloak, SMTP, Envoy, PostgreSQL or OCM.
- Public Mailpit exposure is intended for a demonstration environment; configure a production SMTP relay and access controls before a production rollout.

The source is licensed under Apache-2.0. See `LICENSE.txt`, `NOTICE.md` and `THIRD_PARTY_NOTICES.md` for attribution.
