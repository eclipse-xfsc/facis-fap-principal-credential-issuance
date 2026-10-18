# Technical requirements — individual provisions

TDC identifiers are local audit keys for unnumbered provisions, not identifiers assigned by the source document. Page numbers are printed PDF pages. TDR group references retain compatibility with the earlier grouped audit.

Each provision links to its source implementation or responsible project/platform process and its verification procedure. Responsibility is not an acceptance verdict. Current source/toolchain execution is recorded in [completion](../release/completion.md); deployment and review records use the [receipt procedure](../testing/live-acceptance.md#receipt).

| Local audit ID | PDF page / section | Provision | Implementation responsibility |
|---|---|---|---|
| TDC-001 | 2 / Scope Management | Use the preferred Kanban or Scrum development process | Project process or delivery |
| TDC-002 | 2 / Scope Management | Release scoped software under Apache 2.0 | PCI source |
| TDC-003 | 2 / Scope Management | Present the UX concept before implementation | PCI source |
| TDC-004 | 2 / Scope Management | Include repository structure in the project plan | PCI source |
| TDC-005 | 2 / Scope Management | Present progress every two weeks | Project process or delivery |
| TDC-006 | 2 / Scope Management | Use BDD tests in milestone presentations | PCI source |
| TDC-007 | 2 / ORCE | Use ORCE for service orchestration | PCI source |
| TDC-008 | 2 / ORCE | Use ORCE for Builder Node orchestration | PCI source |
| TDC-009 | 2 / ORCE | Use ORCE for applicable deployment workflows | PCI source |
| TDC-010 | 2 / ORCE | Use low-code integration | PCI source |
| TDC-011 | 2 / Deployment on Kubernetes | Deploy on IONOS Cloud Kubernetes | PCI source |
| TDC-012 | 2 / Deployment on Kubernetes | Deploy on T-Systems Open Sovereign Cloud Kubernetes | PCI source |
| TDC-013 | 2 / Kubernetes and Helm | Automate deployment with Kubernetes and Helm | PCI source |
| TDC-014 | 2 / Kubernetes and Helm | Automate updates with Kubernetes and Helm | PCI source |
| TDC-015 | 2 / Kubernetes and Helm | Automate uninstall with Kubernetes and Helm | PCI source |
| TDC-016 | 2 / Kubernetes and Helm | Manage resources and ingress | PCI source |
| TDC-017 | 2 / Helm charts | Deliver charts with each release | PCI source |
| TDC-018 | 2 / Keycloak | Provision realms and clients | PCI source |
| TDC-019 | 2 / Keycloak | Manage service credentials | PCI source |
| TDC-020 | 2 / Repository rules | Keep all code, schemas, charts and scripts in the client-designated repository | Project process or delivery |
| TDC-021 | 2 / Repository rules | Run GitHub Actions with security checks | PCI source |
| TDC-022 | 2 / Repository rules | Do not create parallel private repositories | Project process or delivery |
| TDC-023 | 2 / Repository rules | Commit work to the client repository daily | Project process or delivery |
| TDC-024 | 2 / Apache License | Include Apache license text and SPDX identity | PCI source |
| TDC-025 | 3 / FOSS | Use only Apache-compatible FOSS and approved licenses | PCI source |
| TDC-026 | 3 / FOSS | Inform the client in writing about planned license exceptions | Project process or delivery |
| TDC-027 | 3 / FOSS | Obtain client confirmation of existing FOSS content | PCI source |
| TDC-028 | 3 / FOSS | Assess and obtain approval of API and component versions | PCI source |
| TDC-029 | 3 / XFSC reuse | Avoid redundant XFSC functions | PCI source |
| TDC-030 | 3 / Contributor agreement | Comply with Eclipse Contributor Agreement 3.1.0 or higher | Project process or delivery |
| TDC-031 | 3 / Runtime environments | Use Kubernetes 1.29 or higher | PCI source |
| TDC-032 | 3 / Runtime environments | Use Helm deployments and ORCE Builder runtime without Docker Compose | PCI source |
| TDC-033 | 3 / Programming Languages | Use Node.js for Builder logic | PCI source |
| TDC-034 | 3 / Programming Languages | Use HTML, JavaScript and JSON schemas for ORCE UI nodes | PCI source |
| TDC-035 | 3 / Programming Languages | Supply Bash automation under scripts | PCI source |
| TDC-036 | 3 / Programming Languages | Use YAML for charts and Kubernetes manifests | PCI source |
| TDC-037 | 3 / Programming Languages | Use Go for backend services | PCI source |
| TDC-038 | 3 / Mandated component dependencies | Report upstream issues in writing and obtain approval for additional work | PCI source |
| TDC-039 | 3 / Documentation | Follow the Eclipse Handbook | Project process or delivery |
| TDC-040 | 3 / Documentation | Use FAP Partner Onboarding as reference | PCI source |
| TDC-041 | 3 / Documentation | Submit BDD documentation within one month of project-plan approval | PCI source |
| TDC-042 | 3 / Local Repo | Document high-level behavior | PCI source |
| TDC-043 | 3 / Local Repo | Document packaging and container boundaries | PCI source |
| TDC-044 | 3 / Local Repo | Document deployment and preconditions | PCI source |
| TDC-045 | 4 / Local Repo | Document changes and additions to source specifications | PCI source |
| TDC-046 | 4 / Local Repo | Document orchestrated flow breakdown | PCI source |
| TDC-047 | 4 / Local Repo | Include BDD, licenses, dependencies and external OSS references | PCI source |
| TDC-048 | 4 / General Principles | Use one monorepo, one history and unified concepts/specifications/source | PCI source |
| TDC-049 | 4 / Repository Creation | Have project leads create the main repository via the client | Project process or delivery |
| TDC-050 | 4 / Contributor Onboarding | Complete XFSC contributor onboarding | Project process or delivery |
| TDC-051 | 4 / Documentation Generator | Supply a MkDocs or ReadTheDocs documentation build | PCI source |
| TDC-052 | 4 / Product Documentation | Supply AsciiDoc product documentation | PCI source |
| TDC-053 | 4 / Architecture Modelling | Supply editable architecture models | PCI source |
| TDC-054 | 4 / APIs | Define every REST endpoint and provide examples | PCI source |
| TDC-055 | 4 / Node-RED hooks | Describe orchestration node contracts | PCI source |
| TDC-056 | 4 / Semantic templates | Supply JSON-LD contexts and SHACL shapes for templates/data | PCI source |
| TDC-057 | 4 / Client templates | Reconcile client-supplied template examples | PCI source |
| TDC-058 | 4 / README | Provide overview, setup, environment/configuration and documentation links | PCI source |
| TDC-059 | 5 / README | Include an understandable use-case diagram | PCI source |
| TDC-060 | 6 / FOSS Repository Workflows | Reference official XFSC Dash scanner and build workflows | PCI source |
| TDC-061 | 6 / FOSS Repository README | Confirm responsible contributor/contact information | PCI source |
| TDC-062 | 6 / FOSS Repository Contributing | Document contributor, release and issue-reporting processes | PCI source |
| TDC-063 | 6 / FOSS Repository License | Include license terms | PCI source |
| TDC-064 | 6 / FOSS Repository Code of Conduct | Finalize the code of conduct with the Principal | PCI source |
| TDC-065 | 6 / FOSS Repository Docs | Host specifications/models and documentation on GitHub Pages | PCI source |
| TDC-066 | 6 / FOSS Repository CI and APIs | Document CI/CD and OpenAPI | PCI source |
| TDC-067 | 6 / ORCE Automation QA | Run deploy/redeploy/uninstall with zero manual intervention after inputs | PCI source |
| TDC-068 | 6 / ORCE Automation QA | Use structured JSON automation/runtime logs | PCI source |
| TDC-069 | 6 / ORCE Automation QA | Expose machine-readable errors in ORCE context | PCI source |
| TDC-070 | 6 / Runtime Validation | Enforce TLS 1.3 for every endpoint and hop | Shared component or platform profile |
| TDC-071 | 6 / Runtime Validation | Store secrets in Kubernetes Secrets and keep them out of logs | Shared component or platform profile |
| TDC-072 | 6 / Runtime Validation | Create namespaces, ingress/routes, services and deployments correctly | PCI source |
| TDC-073 | 6 / Runtime Validation | Reach identity and trust dependencies | PCI source |
| TDC-074 | 6 / BDD Suite | Execute successful deployment scenario | PCI source |
| TDC-075 | 6 / BDD Suite | Execute invalid parameter scenario | PCI source |
| TDC-076 | 7 / BDD Suite | Execute idempotent redeployment scenario | PCI source |
| TDC-077 | 7 / BDD Suite | Execute uninstall scenario | PCI source |
| TDC-078 | 7 / BDD Suite | Execute identity/policy/token/integration validation scenarios | PCI source |
| TDC-079 | 7 / BDD packs | Deliver BDD packs with every release | PCI source |
| TDC-080 | 7 / QA hosting | Test Keycloak, OCM, PCM Mobile, TSA, OpenBao and ORCE on both clouds | PCI source |
| TDC-081 | 7 / DevOps tools | Use Git, GitFlow, GitHub Actions and Jira | Project process or delivery |
| TDC-082 | 7 / Release artifacts | Deliver Helm repository artifacts, OCI images and BDD reports | PCI source |
| TDC-083 | 7 / DevOps tools | Integrate approved deployment with ArgoCD | PCI source |

## Source references and verification

| ID | Implementation | Verification procedure |
|---|---|---|
| TDC-001 | `CONTRIBUTING.md` | Client records the selected process and real delivery history. |
| TDC-002 | `LICENSE.txt`; `NOTICE.md`; `THIRD_PARTY_NOTICES.md` | Approve dependency/IP evidence and publish the licensed release. |
| TDC-003 | `docs/ux/ux-concept.md` | Record the actual presentation/approval history; do not backdate it. |
| TDC-004 | `README.md`; `CONTRIBUTING.md` | Client approves the structure in the authoritative project plan. |
| TDC-005 | `docs/requirements/traceability.md`; `docs/release/0.5.0-rc.4.md` | Actual presenters retain attendance, dates and progress decisions. |
| TDC-006 | `test/bdd`; `docs/testing/completion.md` | Execute the delivered packs and present actual milestone outcomes. |
| TDC-007 | `backend/functions`; `backend/sr2`; `dist/fap-pci-flow.json` | Execute deployed native issuance and tenant operations. |
| TDC-008 | `tools/build-flows.mjs`; `docs/architecture/orce-nodes.md` | Inspect imported functions and run them in the target ORCE. |
| TDC-009 | `automation/flows`; `docs/operations/automation.md` | Run deploy, upgrade and uninstall from the separate operator ORCE. |
| TDC-010 | `backend/sr2/service.js`; `src/sr2.js` | Configure multiple journeys and connectors without source edits. |
| TDC-011 | `scripts/deploy.sh`; `automation/stage1/ground-zero.sh` | Complete the IONOS deployment and test receipt. |
| TDC-012 | `scripts/deploy.sh`; `docs/testing/live-acceptance.md` | Complete the OSC deployment and test receipt. |
| TDC-013 | `automation/stage1/ground-zero.sh`; `deployment/helm` | Render/lint the charts and execute cluster admission/deployment. |
| TDC-014 | `scripts/lifecycle.py`; `automation/stage1/install.sh` | Upgrade with existing PVCs, sessions and configurations, then verify. |
| TDC-015 | `scripts/uninstall.sh`; `automation/stage1/restore-runtime.mjs`; `scripts/import-legacy-baseline.py` | Run on a disposable installation; preserve unrelated edits and data. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-016 | `backend/functions/_k8s.js`; `automation/stage1/ground-zero.sh` | Review live ownership, limits, routes and tenant header isolation. |
| TDC-017 | `deployment/helm`; `.github/workflows/release.yml` | Publish reviewed chart artifacts alongside each approved release. |
| TDC-018 | `automation/stage1/ground-zero.sh`; `backend/functions/reconcile.js` | Inspect realm/client settings and login flows in deployed Keycloak. |
| TDC-019 | `automation/stage1/ground-zero.sh`; `backend/functions/_common.js` | Verify Secret reuse, mounts, rotation and current service authority. |
| TDC-020 | `README.md`; `CONTRIBUTING.md` | Project lead supplies the designated repository and accepts these files. |
| TDC-021 | `.github/workflows/ci.yml`; `.github/workflows/release.yml` | Execute actual workflows and retain dependency/IP results. |
| TDC-022 | `CONTRIBUTING.md` | Project participants attest to repository authority; no repository was created here. |
| TDC-023 | `CONTRIBUTING.md` | Actual daily history is required and cannot be manufactured retrospectively. |
| TDC-024 | `LICENSE.txt`; `NOTICE.md` | Client/IP reviewer approves the final licensed scope. |
| TDC-025 | `THIRD_PARTY_NOTICES.md`; `package-lock.json`; `reference/participant-data-repository/go.mod` | Resolve Go sums and full SBOM, scan transitive dependencies and approve licenses. |
| TDC-026 | `THIRD_PARTY_NOTICES.md`; `CONTRIBUTING.md` | Client records any exception assessment; no approval is implied. |
| TDC-027 | `THIRD_PARTY_NOTICES.md`; `contracts/source-manifest.json` | Client approves the inventoried dependencies and reused source. |
| TDC-028 | `docs/compatibility/compatibility-matrix.md`; `contracts/source-manifest.json` | Verify deployed revisions and record client approval of the compatibility matrix. |
| TDC-029 | `docs/architecture/architecture.md`; `docs/contracts/native-ocm.md` | Review boundaries: PCI orchestration reuses native keys/signing/offers/metadata/status. |
| TDC-030 | `CONTRIBUTING.md` | Each actual contributor completes the required onboarding and agreement. |
| TDC-031 | `scripts/preflight.sh`; `docs/compatibility/compatibility-matrix.md` | Validate the selected supported version; the documented supported range is narrower than the minimum. |
| TDC-032 | `scripts/deploy.sh`; `deployment/helm`; `tools/build-flows.mjs` | Confirm the supplied Kubernetes/ORCE topology in the running environment. |
| TDC-033 | `backend/functions`; `backend/sr2` | Load the generated functions into the approved ORCE Node.js runtime. |
| TDC-034 | `src`; `backend/sr2/domain.js`; `docs/api/openapi.json` | Run the browser and UI acceptance pack. |
| TDC-035 | `scripts/deploy.sh`; `scripts/uninstall.sh`; `scripts/preflight.sh` | Execute Bash entrypoints and supplemental Python orchestration in the operator environment. |
| TDC-036 | `deployment/helm`; `automation/stage1/ground-zero.sh` | Helm lint/render and live admission remain required. |
| TDC-037 | `reference/participant-data-repository` | Generate Goa/protobuf, run vet/race tests and compile the participant service. |
| TDC-038 | `docs/known-gaps.md`; `deployment/prerequisites/upstream` | Deliver the written findings through the client's approved process; owners review/build/deploy their component fixes. |
| TDC-039 | `CONTRIBUTING.md`; `CODE_OF_CONDUCT.md` | Project lead reviews governance, releases and contributor records. |
| TDC-040 | `docs/source-baseline.md`; `docs/architecture/architecture.md` | Confirm the selected reference and PCI-specific adaptations with the client. |
| TDC-041 | `test/bdd`; `docs/testing/completion.md` | Actual project-plan and submission dates are required; no backdated submission. |
| TDC-042 | `README.md`; `docs/product.adoc`; `docs/architecture/architecture.md` | Review the product scope against the source specifications. |
| TDC-043 | `README.md`; `reference/participant-data-repository/Dockerfile`; `docs/testing/participant-test.md` | Build the mandated participant image; approve its digest. PCI remains imported flows/UI. |
| TDC-044 | `docs/operations/deployment.md`; `docs/operations/upgrade-0.5.0-rc.4.md` | Execute the documented deployment/upgrade against the actual environment. |
| TDC-045 | `docs/requirements/traceability.md`; `docs/known-gaps.md`; `docs/release/0.5.0-rc.4.md` | Client reviews implementation decisions and unresolved dependencies; source specifications are unchanged. |
| TDC-046 | `docs/architecture/orce-nodes.md`; `docs/architecture/issuer-runtime.md` | Review node inputs/outputs and trust boundaries. |
| TDC-047 | `test/bdd`; `LICENSE.txt`; `THIRD_PARTY_NOTICES.md`; `contracts/source-manifest.json` | Review the complete tested dependency inventory before release. |
| TDC-048 | `README.md`; `docs/specifications`; `CONTRIBUTING.md` | Import into the designated repository; no nested independent Git projects are supplied. |
| TDC-049 | `CONTRIBUTING.md` | Client/project leads supply the official destination and naming. |
| TDC-050 | `CONTRIBUTING.md` | Actual contributors complete and retain onboarding records. |
| TDC-051 | `mkdocs.yml`; `.github/workflows/docs.yml` | Run strict MkDocs build and publish the reviewed site. |
| TDC-052 | `docs/product.adoc` | Client reviews the product document in its accepted documentation format. |
| TDC-053 | `docs/architecture/components.puml`; `docs/architecture/issuance.puml` | Review/render the delivered UML sources and confirm the client's model format. |
| TDC-054 | `docs/api/openapi.json`; `docs/api/examples.json`; `tools/check-documentation.mjs` | Execute API examples with private real sessions and validate deployed responses. |
| TDC-055 | `docs/architecture/orce-nodes.md`; `backend/sr2/routes.json` | Review imported nodes and configured external modules. |
| TDC-056 | `contracts/examples`; `backend/sr2/semantics.js`; `docs/contracts/semantic-templates.md`; `backend/sr2/linked-data.js`; `test/live/semantic-validation.py` | Run a semantic processor and SHACL validator; client approves production vocabulary/template profiles. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-057 | `contracts/examples`; `docs/contracts/semantic-templates.md` | Replace synthetic reference vocabulary when the client provides its approved templates. |
| TDC-058 | `README.md`; `docs/operations/deployment.md`; `docs/operations/transport.md` | Client reviews the documented installation choices. |
| TDC-059 | `README.md`; `docs/architecture/components.puml` | Review the rendered diagram with the client. |
| TDC-060 | `.github/workflows/ci.yml`; `.github/workflows/release.yml`; `docs/ci-cd.md` | Run workflows, capture resolved nested versions and review actual findings. |
| TDC-061 | `README.md`; `CONTRIBUTING.md`; `SECURITY.md` | Client must name the maintainer and approved contact; no identity or mailbox is invented. |
| TDC-062 | `CONTRIBUTING.md`; `SECURITY.md` | Client finalizes these processes for the designated project. |
| TDC-063 | `LICENSE.txt`; `NOTICE.md` | IP reviewer approves final software and third-party notices. |
| TDC-064 | `CODE_OF_CONDUCT.md` | Principal approves the existing code-of-conduct text. |
| TDC-065 | `docs`; `mkdocs.yml`; `.github/workflows/docs.yml` | Review the generated documentation and explicitly publish it. |
| TDC-066 | `docs/ci-cd.md`; `docs/api/README.md`; `docs/api/openapi.json` | Review exact workflow inputs and API response contracts. |
| TDC-067 | `scripts/lifecycle.py`; `automation/flows/pci-deployment.json`; `scripts/import-legacy-baseline.py`; `scripts/reconcile-participant-ownership.py` | Run all three operations with pre-provisioned private inputs and inspect outcomes. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-068 | `scripts/lifecycle.py`; `automation/flows/lifecycle.js`; `backend/functions/_common.js` | Inspect safe structured outcomes across actual success/failure executions. |
| TDC-069 | `scripts/lifecycle.py`; `automation/flows/lifecycle.js` | Confirm phase/code/detail/nextStep/exitCode without child payload leakage. |
| TDC-070 | `docs/operations/transport.md`; `backend/sr2/transport.js`; `deployment/helm/observability`; `deployment/prerequisites/all-hop-tls/mesh.yaml`; `tools/prepare-all-hop-tls.py` | Platform owners must encrypt compatibility ORCE/database/mail and shared native links. Client flags alone do not close this requirement. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-071 | `automation/stage1/ground-zero.sh`; `docs/privacy/data-handling.md`; `scripts/privacy-audit.py`; `deployment/prerequisites/upstream`; `tools/prepare-upstream-builds.py` | Deploy owner-approved upstream log fixes and inspect every real payload sink. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-072 | `automation/stage1/ground-zero.sh`; `backend/functions/_k8s.js`; `tools/check-g0-manifests.py` | Validate Kubernetes admission, controllers, ownership and readiness on both clouds. |
| TDC-073 | `scripts/preflight.sh`; `backend/functions/status.js` | Demonstrate Keycloak, native TSA/status/metadata/NATS and trust connectivity. |
| TDC-074 | `test/bdd/features/lifecycle.feature`; `test/bdd/features/steps/completion.py` | Run the official Executor against an approved disposable installation. |
| TDC-075 | `test/bdd/features/lifecycle.feature`; `test/bdd/features/steps/completion.py` | Run the delivered negative parameter case and retain its safe result. |
| TDC-076 | `test/bdd/features/lifecycle.feature`; `test/bdd/features/steps/completion.py` | Prove repeated deployment preserves identities and unrelated resources. |
| TDC-077 | `test/bdd/features/lifecycle.feature`; `test/bdd/features/steps/completion.py` | Prove owned removal, retained PVCs and unrelated-resource preservation. |
| TDC-078 | `test/bdd/features`; `test/live/wallet.mjs`; `test/bdd/features/pcm.feature`; `test/bdd/features/native-wallet.feature` | Run real authentication, permissions, native issuance and failure cases. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-079 | `test/bdd`; `docs/testing/completion.md`; `.github/workflows/release.yml` | Publish the reviewed pack and actual BDD results with each release. |
| TDC-080 | `docs/testing/live-acceptance.md`; `test/bdd` | Collect real IONOS/OSC receipts with all mandated services and PCM. |
| TDC-081 | `CONTRIBUTING.md`; `.github/workflows`; `docs/ci-cd.md` | Project team records actual issue/branch/review/release use. |
| TDC-082 | `deployment/helm`; `reference/participant-data-repository/Dockerfile`; `.github/workflows/release.yml`; `test/bdd` | Build/scan/publish the mandated participant image and charts; attach executed BDD reports. |
| TDC-083 | `deployment/argocd/participant-application.example.yaml`; `docs/operations/argocd.md` | Client supplies approved repository/ArgoCD destination and performs deployment integration. |

[Original specifications](../specifications/README.md) · [SRS catalogue](traceability.md) · [Structured technical catalogue](technical-clauses.json)
