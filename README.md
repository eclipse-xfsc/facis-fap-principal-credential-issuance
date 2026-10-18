# FACIS Principal Credential Issuance

FAP PCI runs inside XFSC ORCE and provides tenant onboarding, delegated issuer administration, credential configurations, issuance journeys, wallet offers, presentation verification and issuance history. The UI uses Vue and uibuilder. Native OCM services supply issuer, signer, Well-Known and status operations; the participant-owned Go/Goa service supplies credential data over mTLS gRPC.

## Releases and documentation

| Distribution | Reference |
|---|---|
| Packaged PCI container | [`ecofacis/fap-pci:1.0.0`](https://hub.docker.com/r/ecofacis/fap-pci/tags?name=1.0.0) |
| Application source version | `0.5.0-rc.12`, as recorded in `VERSION` and `package.json` |
| Packaging base | `ecofacis/xfsc-orce:2.0.15` |
| Published documentation | [FAP PCI documentation](https://eclipse-xfsc.github.io/facis-fap-principal-credential-issuance/) |

The container captures the ORCE filesystem and explicitly includes `/data`, covering PCI flows, UI/configuration and installed dependencies. Container packaging and application versions identify different release units. An older base image tag on an existing deployment does not identify the version of hot-installed PCI artifacts. See [container use and provenance](docs/operations/container-image.md) and the [1.0.0 packaging record](docs/release/1.0.0.md).

## Build and checks

```bash
npm ci
python3 -m pip install PyYAML==6.0.2
npm run test:offline
```

Use Node.js 20 or newer, Python 3, OpenSSL and the pinned dependencies. [CI results](docs/release/completion.md) record 350 passing Node tests plus successful PostgreSQL, Go/Goa/protobuf, Helm, Chromium and semantic checks for the reviewed source commit. The [test strategy](docs/testing/test-strategy.md) explains each suite and its fixtures. Deployment-specific tests use private target configuration and sessions.

## Install and operate

1. Read [deployment](docs/operations/deployment.md) or the [container guide](docs/operations/container-image.md).
2. Prepare the approved ORCE/OCM environment with G0, or use the [lifecycle runner](docs/operations/automation.md).
3. Configure [issuer metadata, keys and connectors](docs/operations/issuer-runbook.md) and [organization sign-in](docs/operations/identity.md).
4. Follow [participant setup](docs/testing/participant-test.md) and the [test walkthrough](docs/testing/acceptance-walkthrough.md).
5. Use the [operations runbook](docs/operations/runbook.md) for recovery, maintenance and uninstall.

The source artifact interface is `dist/fap-pci-flow.json`, `dist/ground-zero.sh` and `dist/ui/`. For an existing instance, use the [artifact upgrade](docs/operations/upgrade-0.5.0-rc.12.md). Import PCI flows through the established modified-flows deployment and retain the instance's persistent data. The [operating profiles](docs/known-gaps.md) describe dependency ownership, transport, supported formats and retention.

## Source layout

| Path | Purpose |
|---|---|
| `backend/functions/`, `backend/sr2/` | Registration, IAM, reconciliation, issuer domain and native adapters |
| `src/`, `shared/` | UI and public URL model |
| `automation/`, `scripts/` | Prerequisites, artifact installation, lifecycle and diagnostics |
| `deployment/` | Helm charts and infrastructure profiles |
| `reference/participant-data-repository/` | Go/Goa participant service |
| `contracts/`, `docs/api/` | Protobuf, native contracts, REST schemas and examples |
| `test/`, `.github/workflows/` | Automated checks and deployment test packs |
| `docs/` | Product, architecture, operations, specifications and source traceability |

The [101 SRS entries](docs/requirements/traceability.md) and [83 technical clauses](docs/requirements/technical-clauses.md) link implementation and verification procedures to the original specifications. Current [validation](docs/release/validation.json) and [workflow evidence](docs/release/ci-evidence.json) identify executed checks by commit and run. Release-specific test receipts are maintained separately from the source catalogue.

Application source is Apache-2.0. Original specifications and dependencies retain their notices. See [licences](THIRD_PARTY_NOTICES.md), [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md). Use the repository issue process for project questions; keep credentials, participant records and private deployment files outside Git.
