# Outstanding acceptance and owner actions

The rc.6 implementation and local regression evidence do not constitute sign-off. The full [requirement matrix](requirements/traceability.md) distinguishes completed source work from unexecuted acceptance and public delivery. No requirement is waived.

| Item | Supplied source work | Remaining evidence or owner action |
|---|---|---|
| Native payload privacy | PCI memory-only claims/tokens/presentation handling; sanitized stack locations; three revision-bound upstream logging patches (current Crypto patch applicability pending), private-copy build/test preparation and capture scanner | OCM owner builds/reviews/deploys fixes. Scan successful/failed flows across logs, stores, NATS, contexts, traces and backups; address existing retained data |
| Empty catalogue | Local withdrawal/empty discovery, stale-version rejection, actionable pending state and pinned native patch | Owner tests/deploys patched image, then enables `PCI_OCM_EMPTY_CATALOGUE_SUPPORTED=true`; test first publish and last withdrawal |
| Protocol profiles | VCI Draft 13/1.0 serializers and native adapters; VP Draft 13/1.0 JWT holder verifier; live software-wallet pack | Execute exact OCM/PCM format matrix. VP LDP/SD-JWT is not advertised; claims of broader verifier format support would require further implementation |
| TLS | Strict TLS 1.3 public/participant/telemetry and native clients; verified DB/SMTP options | Owner applies the supplied all-hop TLS overlay/G0 mesh profile and demonstrates every-hop TLS 1.3. Compatibility chart plaintext is not an acceptance pass |
| Builds | Go/Goa/protobuf, SQL migration/history/concurrency, Helm and browser jobs authored | Execute those toolchains and review results; they were unavailable locally |
| Identity | Tenant-admin versioned provider settings, tenant broker binding, Secret-backed credentials and fresh-authentication scenarios | Real Entra tenant, broker egress and two user cohorts; passkey/MFA/recovery and role removal tests |
| UX | Layout/branding/errors fixes; browser and Executor scenarios | Execute browser, keyboard, screen reader, zoom/mobile and EN 301 549 review |
| Lifecycle | Registered participant namespace cleanup, helper mutation journal and guarded uninstall | Deploy/redeploy/upgrade/backup/restore/uninstall on disposable IONOS and OSC installations; confirm owner boundaries |
| Native formats | Go JWT/SD-JWT/JWS2020 signing through Core gRPC with offline normalization; corrected native SD-JWT and format metadata | Go build/security review and participant/native SD-JWT/linked-data/PCM interoperability; owner fixes for demonstrated upstream failures |
| Telemetry/capacity | Jaeger/Prometheus/Collector chart and safe instrumentation | Actual ingestion, TLS, absence of payloads, limits under target load, recovery and retention review |
| Legacy helper restoration | New helper journal plus explicit trusted legacy baseline import and lifecycle integration | Reconcile rc.3 explicit helper env/mounts with original snapshot and operator change records before accepting uninstall |
| Publication/governance | Pinned official workflow references, artifact hashes, docs build/Pages job, contribution/deployment material | Approved GitHub/Harbor/deployment writes; IP/SBOM scans, ECA/component approvals, tags, release/docs publishing and issue/PR disposition |

FR-27/66 deletes the tenant's public routes and DID resolution; FR-14/78 preserves existing credential verification after **configuration archive within a live tenant**. These are separate operations. FR-43 permits a static TLS Secret as its certificate option. FR-81 is issuance history, FR-82 participant signing, FR-83 participant data plus internal signing; rc.3 corrected the earlier mapping.

Source locations/revisions are recorded in `contracts/source-manifest.json` and the [upstream patch manifest](../deployment/prerequisites/upstream/manifest.json). Source findings must be matched to running image provenance. The broad OCM verifier's storage/unsupported-format behavior is not silently changed by the PCI VP endpoint; the latter calls native TSA and status directly without persisting presentations.
