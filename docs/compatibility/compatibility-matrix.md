# Compatibility baseline

| Component | Selected source/configuration | Acceptance boundary |
|---|---|---|
| PCI | 0.5.0-rc.12 | Candidate; local validation receipt only |
| ORCE | Existing supplied Node-RED-based image | Record actual image digest; one active replica |
| UI | Vue 3.5.21, uibuilder 7.5.0 | Vendored Vue digest checked; actual browser test pending |
| Kubernetes | 1.33–1.36 | Gateway/controller APIs and IONOS/OSC admission must pass |
| Helm | >=3.17 | Needed for bounded adoption of previous PCI SSA resources |
| Envoy | Existing 1.9 controller; bootstrap v1.9.2 only if absent; PCI proxy v1.39.2 | Pinned bootstrap SHA; existing controller compatibility checked live |
| OCM | Supplied ESB 12.3.9 | Uploaded SHA in integration lock; native image/source provenance still required |
| Keycloak | Supplied 26.8.0 layout | Passkey representation checked against official tag; live actions pending |
| PostgreSQL | Managed 17.4-alpine3.21 or approved external instance | CI migration/concurrency gate |
| Participant | Go 1.25, Goa 3.28.0, Crypto Provider Core v2.3.0 | Build/transport tests in CI; no local compile proof |
| Protocols | OID4VCI Draft 13 and 1.0 serializers, single JWT proof | VCI/VP native/wallet conformance pending; PCI VP supports holder-bound JWT W3C for both profiles |
| Credential formats | JWT VC, native linked data and SD-JWT adapters | Start JWT tests; non-JWT/native interoperation remains blocked pending evidence |

Exact native source URLs/blobs are recorded in `contracts/source-manifest.json`. Release tags and deployed image digests must be bound in acceptance receipts; a matching service name is insufficient.

Envoy versions follow the [official compatibility matrix](https://gateway.envoyproxy.io/news/releases/matrix/) and [v1.9.2 security guidance](https://gateway.envoyproxy.io/news/releases/notes/v1.9.2/) reviewed 5 October 2026. The fixed proxy image is scoped to the PCI Gateway; G0 does not upgrade the shared controller or other Gateways. Image digests and xDS acceptance must be captured live.

The [12.3.9 assessment](../../contracts/ocm-12.3.9-assessment.json) binds the uploaded ESB archive and reviewed files. Earlier entries in `source-manifest.json` remain historical source evidence; they are not relabelled as the new Crypto revision. PCI requires independent native status verification before credential delivery and presentation success. Published image provenance and actual native execution remain acceptance gates.
