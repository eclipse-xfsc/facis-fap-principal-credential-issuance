# Integration and operating profiles

This page describes PCI configuration and ownership boundaries. Current build results are maintained in [executed checks](release/completion.md); historical authoring-environment limitations are not a list of current software defects.

| Area | Delivered behavior | Deployment and review procedure |
|---|---|---|
| Runtime package | Docker Hub PCI 1.0.0 package with ORCE filesystem and explicit `/data` embedding | Record digest and application version; retain existing persistent data during upgrades |
| Source builds | Node, PostgreSQL, generated participant, Helm, Chromium and semantic checks passed in CI | Re-run CI for the release commit and preserve its artifacts |
| Privacy | PCI handles claims, credentials, proofs and access tokens transiently; persisted history contains controlled references | Review the selected dependency logging/retention profile and use the canary scanner for the actual data path |
| Catalogue lifecycle | Tenant-bound publication, read-back and configuration withdrawal | Enable empty-catalogue capability only for a native service version supporting it; use the documented compatibility guard otherwise |
| Transport | Public, participant and telemetry TLS configuration; supplied all-hop profile | Select and record the [transport profile](operations/transport.md) for the environment |
| Identity | Tenant settings for Keycloak and approved OIDC/Entra brokers, current membership and delegated scopes | Configure the approved organization provider and use the matching fresh-login procedures |
| Protocols and formats | OID4VCI Draft 13/1.0 adapters; JWT, linked-data and SD-JWT credential paths; holder-bound JWT W3C presentation for both VP profiles | Select supported configuration/profile combinations and use the corresponding wallet tests |
| UX | FACIS UI, persistent errors, branding, responsive settings and source/browser regression suites | Use source Chromium checks and the deployed Executor for their respective test scopes |
| Lifecycle | G0, artifact installation, bounded ownership, participant cleanup and guarded uninstall | Use a disposable target for destructive scenarios; preserve database/PVC recovery inputs |
| Telemetry and capacity | Bounded resources, Prometheus/OTLP integration and payload-safe instrumentation | Configure retention, TLS and target load; inspect runtime dashboards and resource bounds |
| Shared native services | Version-bound contracts and optional owner-controlled patch/transport profiles | Shared OCM lifecycle and service changes follow the component owner's deployment process |

Configuration archive preserves verification dependencies inside a live tenant. Full tenant deletion removes its public routes and DID resolution. These operations have different lifecycle semantics.

See [compatibility](compatibility/compatibility-matrix.md), [native contracts](contracts/native-ocm.md), [source provenance](source-baseline.md), [testing](testing/test-strategy.md), and [release workflows](ci-cd.md). The historical filename is retained so existing documentation links continue to resolve.
