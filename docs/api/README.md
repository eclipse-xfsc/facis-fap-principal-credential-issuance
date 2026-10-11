# API contract

`openapi.json` preserves the externally visible Sprint Review 1 HTTP paths and response shapes. The implementation is ORCE Function nodes rather than a standalone API workload. The static provider review token is removed; provider and tenant administration require a Keycloak-backed `fap_pci_session` cookie or an equivalent Bearer session token.

Application route names remain root-relative in the contract:

```text
/api/v1/...
/healthz
/readyz
/metrics
/api/openapi.json
```

The deployment prefix is not part of an endpoint name. Externally, `PCI_ORCE_BASE_PATH` composes with those routes:

```text
PCI_ORCE_BASE_PATH=""       -> https://pci.example.com/api/v1/auth/config
PCI_ORCE_BASE_PATH=/BASE    -> https://pci.example.com/BASE/api/v1/auth/config
PCI_ORCE_BASE_PATH=/a/b     -> https://pci.example.com/a/b/api/v1/auth/config
```

The static OpenAPI server uses a `basePath` variable. The live `/api/openapi.json` response replaces it with the exact configured main-host server URL and publishes `x-pci-orce-base-path`.

The two `/api/v1/internal/provisioning/*` endpoints remain as compatibility endpoints, but the normal architecture no longer needs an external Go provisioner. ORCE performs reconciliation directly through its in-cluster ServiceAccount.

## SR2 API

`tools/build-sr2-api.mjs` merges typed SR2 schemas/routes from `backend/sr2/routes.json` into the checked-in OpenAPI while preserving SR1 paths. Routes remain `/api/v1/...` internally; the public prefix is composed with `PCI_ORCE_BASE_PATH`. Resource creation/update uses `{data: ...}`, plus immutable `configurationId` for flows/assets. Mutations use quoted numeric If-Match. Publication state distinguishes desired/observed upstream revisions. Compatibility HTTP callbacks fail closed; native issuance callbacks arrive through the NATS subscription. Fixed native wallet routes are documented in the issuer runbook. See the issuer architecture/runbook for roles, protected payload handling and exact limitations.

The synthetic employee [JSON-LD context and SHACL shapes](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/blob/main/contracts/examples/README.md) document the reference data template. They are separate from native JWT/SD-JWT validation and carry no conformance claim.

Each credential configuration also has an authorized [semantic template export](../contracts/semantic-templates.md), available in the editor and through its GET endpoint. The export describes the current draft's fields and contains only synthetic values. Generated SR2 operations are rebuilt from the route catalogue, so obsolete routes do not remain in the API or request examples.

## Complete request examples

`examples.json` is generated from the same OpenAPI and contains one synthetic request shape for every REST operation, including public discovery, native wallet, presentation and administration endpoints. Replace placeholder IDs, session values and optimistic versions. Response schemas are linked by JSON pointer. These examples are not captured successful responses and cannot be counted as acceptance evidence. The Node-RED contracts are in [ORCE node specifications](../architecture/orce-nodes.md).
