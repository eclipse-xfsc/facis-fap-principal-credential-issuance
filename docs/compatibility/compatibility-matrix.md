# Compatibility baseline

| Component | Source/configuration | Verification and operating scope |
|---|---|---|
| PCI container | `ecofacis/fap-pci:1.0.0` on Docker Hub | ORCE 2.0.15 filesystem with embedded PCI `/data`; record the pulled digest |
| PCI application | `0.5.0-rc.12` | Source version in `VERSION` and `package.json`; 350-test CI record |
| UI | Vue 3.5.43 source pin; uibuilder runtime supplied by ORCE | Chromium component/layout CI passed at desktop and narrow widths |
| Kubernetes | 1.33–1.36 | G0/Gateway APIs and target-cluster admission |
| Helm | 3.17 or newer | Chart lint/template CI passed; bounded ownership adoption uses `--take-ownership` |
| Envoy | Existing 1.9 controller; bootstrap v1.9.2 if absent; PCI proxy v1.39.2 | PCI Gateway profile is separate from other owners' Gateways |
| OCM | ESB 12.3.9 source/configuration baseline | Native source pins in the contract manifest; record deployed service digests |
| Keycloak | Selected 26.8.0 layout | Tenant realm/client and approved OIDC broker settings |
| PostgreSQL | Managed 17.4-alpine3.21 or approved external instance | Schema, isolation and concurrent-limit CI passed |
| Participant | Go 1.25, Goa 3.28.0, Crypto Provider Core v2.3.0 | Generated transport, vet, race tests and server build passed in CI |
| Semantics | Pinned JSON-LD/SHACL engines | Independent expansion and validation CI passed |
| Protocols | OID4VCI Draft 13 and 1.0; holder-bound JWT W3C OpenID4VP Draft 13 and 1.0 | Select the matching native/wallet test case |
| Credential formats | JWT VC, linked-data and SD-JWT adapters | Format support for issuance and presentation is documented separately |

[Executed checks](../release/completion.md) identify the tested source commit and workflow runs. [Container use](../operations/container-image.md) explains packaging and persistent volumes. Record runtime image digests and native-service versions with deployment receipts.

The selected Envoy configuration follows the [official compatibility matrix](https://gateway.envoyproxy.io/news/releases/matrix/) and [v1.9.2 guidance](https://gateway.envoyproxy.io/news/releases/notes/v1.9.2/) used by G0. The [ESB assessment](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/blob/main/contracts/ocm-12.3.9-assessment.json) and source manifest bind the native contract references. Shared-service lifecycle changes follow their owners' procedures.
