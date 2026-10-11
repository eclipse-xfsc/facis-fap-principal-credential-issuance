# 0.5.0-rc.12 requirement audit

All **101 SRS requirements** and **83 individual technical clauses** are retained. The eight TDR rows are supplementary audit groups, not additional clauses invented for the documents.

**Full compliance and zero requirement gaps are not verified.** Source implementation, local regression evidence, native owner remediation and formal acceptance are distinct. No requirement is waived. The ledger's EXCLUDED value means an external obligation is still required, not optional.

Current scope: decoding native signer JWK arrays, choosing the configured public signing key by supported algorithm, and exercising independent credential verification in ES modules and the generated Function-node VM. Previous wallet profile copying, public HTTP handler execution for both OID4VCI profiles and trusted SR2 error mapping are retained. Previous catalogue copying, newline-free editor authentication and portable jq verification are retained. Well-Known 1.5.2 optional claim-display compatibility is retained. Retained OCM-WStack ESB 12.3.9 contract changes, Helm/G0 ownership migration, native patch revision protection and artifact-install recovery. Existing functional, transport, identity, privacy, participant, documentation, deployment and BDD coverage is preserved.

See [validation](validation.json), [native patch evidence](upstream-validation.json), [known gaps](../known-gaps.md), [the complete machine-readable audit](requirement-audit.json), and the original [specifications](../specifications/README.md). Every implementation and authored test path is listed in the JSON audit and the [SRS traceability table](../requirements/traceability.md).

## Interpretation

- IMPLEMENTED_ACCEPTANCE_PENDING: source delivered; complete requirement acceptance remains open.
- OWNER_REMEDIATION_AND_ACCEPTANCE_PENDING: includes shared-stack changes/builds/deployment that PCI cannot certify from local source.
- REQUIRED_EXTERNAL_DELIVERY_PENDING: actual public/repository, review or governance work remains.

The current Crypto privacy patch has an exact revision and guarded preparation tool, but its application/build against that new upstream source is NOT_RUN here. Full-hop TLS needs the supplied owner overlay and actual traffic evidence. Go generation/build, native images, both cloud environments, Keycloak/Entra, PCM, browser/BDD, semantic engines and official workflows require their real execution environments.

## SRS

| ID | Requirement | State | Remaining closure |
|---|---|---|---|
| FR-PCI-01 | Key Creation over TSA Crypto Provider | IMPLEMENTED_ACCEPTANCE_PENDING | Configure both keys through UI; inspect tenant ownership; sign with Vault and OpenBao in an approved environment. |
| FR-PCI-02 | DID Provisioning over TSA Crypto Provider | IMPLEMENTED_ACCEPTANCE_PENDING | Public DID document shows the actual issuer key and resolves through the selected universal resolver; deletion/rotation behavior recorded. |
| FR-PCI-03 | Credential Endpoint | IMPLEMENTED_ACCEPTANCE_PENDING | From outside cluster request the exact tenant credential endpoint and reject a cross-tenant host/header. |
| FR-PCI-04 | Pre-Authorization Bridge Endpoints | IMPLEMENTED_ACCEPTANCE_PENDING | External positive and cross-tenant negative API calls using the selected OCM bridge. |
| FR-PCI-05 | TSA Endpoints | IMPLEMENTED_ACCEPTANCE_PENDING | Resolve tenant JWKS over HTTPS and match it to configured signing keys and DID. |
| FR-PCI-06 | Issuer Management Delegation | IMPLEMENTED_ACCEPTANCE_PENDING | Two users with different scopes; direct API and UI create/edit/delete/flow tests before and after revocation. |
| FR-PCI-07 | OID4VCI Issuer Metadata Configuration | IMPLEMENTED_ACCEPTANCE_PENDING | Authenticated publish, observed revision, well-known read-back, restart/replay, stale update and unauthorized edit tests. |
| FR-PCI-08 | Issuing Management | IMPLEMENTED_ACCEPTANCE_PENDING | Delegated issuer performs full CRUD and manages two actual issuance flows. |
| FR-PCI-09 | OID4VCI Credential Configuration Permissioning | IMPLEMENTED_ACCEPTANCE_PENDING | Ordinary principal denied UI and APIs; authorized issuer succeeds, cross-tenant requests denied. |
| FR-PCI-10 | Credential Logos | IMPLEMENTED_ACCEPTANCE_PENDING | Wallet fetches and renders tenant-specific image from actual metadata; old published assets remain resolvable. |
| FR-PCI-11 | Issuance Flow Configuration | IMPLEMENTED_ACCEPTANCE_PENDING | Two configuration IDs with distinct multi-step journeys executed in browser and pinned for an in-flight request. |
| FR-PCI-12 | Credential History per Configuration | IMPLEMENTED_ACCEPTANCE_PENDING | Restricted per-configuration UI showing IDs, dates, offered/expired/issued/revoked states and approved principal association; privacy review. |
| FR-PCI-13 | Credential Revocation | IMPLEMENTED_ACCEPTANCE_PENDING | Search by approved ID/date/principal reference, revoke once, verify public credential status, block reissue and audit override. |
| FR-PCI-14 | Credential Configuration Deletion | IMPLEMENTED_ACCEPTANCE_PENDING | Archive/delete a configuration while old credentials still verify until the agreed validity limit. |
| FR-PCI-15 | Credential Configuration Creation/Update | IMPLEMENTED_ACCEPTANCE_PENDING | Real create/update/delete and standards fixtures read back from well-known endpoints. |
| FR-PCI-16 | Participant Backend Connection | IMPLEMENTED_ACCEPTANCE_PENDING | Configure each credential connection through UI; real mutual TLS including expired/wrong cert and bounded egress cases. |
| FR-PCI-17 | OCM W-Stack Integration | IMPLEMENTED_ACCEPTANCE_PENDING | Reviewed exact contract implementation and full native issuance through OCM and PCM. |
| FR-PCI-18 | NATS Provisioning of Configured Metadata | IMPLEMENTED_ACCEPTANCE_PENDING | Tenant issuer/config metadata published, observed at native Well-Known, including revision/delete/restart behavior. |
| FR-PCI-19 | History Logging | IMPLEMENTED_ACCEPTANCE_PENDING | Sanitized event samples for both modes, per configuration, with audit and GDPR review. |
| FR-PCI-20 | Participant Backend Connection | IMPLEMENTED_ACCEPTANCE_PENDING | Participant mock and repository flows with positive/negative token, cert, subject, signature, status cases. |
| FR-PCI-21 | ORCE Integration | IMPLEMENTED_ACCEPTANCE_PENDING | Actual configured ORCE flow creates short-lived offer; QR scanned by PCM and resolved by OCM. |
| FR-PCI-22 | Golang Service | IMPLEMENTED_ACCEPTANCE_PENDING | Reviewed Goa design/generated code, Docker image, runtime service and code review. |
| FR-PCI-23 | Data Format Library | IMPLEMENTED_ACCEPTANCE_PENDING | Build and review the reusable JWT/SD-JWT package. Contribute it to the designated XFSC repository through the approved process. VCDM 2.0/ETSI EAA is recommended; full conformity is outside this release scope. |
| FR-PCI-24 | Data Request | IMPLEMENTED_ACCEPTANCE_PENDING | Versioned proto, service implementation, interoperable call and reviewed error/metadata semantics. |
| FR-PCI-25 | Tenant Management | IMPLEMENTED_ACCEPTANCE_PENDING | Provider browser journey and unauthorized access denial on live environment. |
| FR-PCI-26 | Tenant Approved | IMPLEMENTED_ACCEPTANCE_PENDING | Approved tenant reaches Ready, route and login; compare resources before/after and verify email. |
| FR-PCI-27 | Tenant Deletion | IMPLEMENTED_ACCEPTANCE_PENDING | Confirm deletion by exact tenant slug; inventory PCI-owned routes/configuration/Secret grants and accounts. Verify public UI, DID, JWKS, issuer and status URLs are unavailable; other tenants and shared OCM remain. Configuration archive is a separate operation. |
| FR-PCI-28 | Tenant Rejection | IMPLEMENTED_ACCEPTANCE_PENDING | Reject a pending request, see retained decision and email, and confirm no tenant resources. |
| FR-PCI-29 | Confirmation/Deletion/List Section | IMPLEMENTED_ACCEPTANCE_PENDING | Register, approve, list, duplicate participant rejection, and protected delete in browser. |
| FR-PCI-30 | Participant Tenant Administration | IMPLEMENTED_ACCEPTANCE_PENDING | After approval, use emailed account, change password/register strong factor, configure tenant and exercise it. |
| FR-PCI-31 | Compliance | IMPLEMENTED_ACCEPTANCE_PENDING | Complete browser, keyboard, screen-reader and EN 301 549 evaluation; local Vue tests are not accessibility certification. |
| FR-PCI-32 | Registration Data Form | IMPLEMENTED_ACCEPTANCE_PENDING | Both modes, forged private registration denial, email verification, provider approval and cluster inventory. |
| FR-PCI-33 | Compliance | IMPLEMENTED_ACCEPTANCE_PENDING | Complete browser, keyboard, screen-reader and EN 301 549 evaluation; local Vue tests are not accessibility certification. |
| FR-PCI-34 | Credential Configuration Management | IMPLEMENTED_ACCEPTANCE_PENDING | Create/edit/delete with claims/assets/connector, read native metadata and issue from selected backend. |
| FR-PCI-35 | Credential Issuance Permissioning | IMPLEMENTED_ACCEPTANCE_PENDING | Director versus employee issuance, denial and role-removal propagation across two configurations. |
| FR-PCI-36 | Credential History and Revocation | IMPLEMENTED_ACCEPTANCE_PENDING | Authorized history search and per-record revoke; separate public verifier/status proof and denied reissue. |
| FR-PCI-37 | Steps Configuration | IMPLEMENTED_ACCEPTANCE_PENDING | Landing→input/consent→offer sequences, tenant branding and error/replay tests. |
| FR-PCI-38 | ORCE Utilization | IMPLEMENTED_ACCEPTANCE_PENDING | Demonstrate two changes without code deployment and run both in ORCE. |
| FR-PCI-39 | mTLS Connection | IMPLEMENTED_ACCEPTANCE_PENDING | Real participant TLS handshake, negative trust tests and documented UI/config procedure. |
| FR-PCI-40 | Participant JWT Reusage | IMPLEMENTED_ACCEPTANCE_PENDING | Observe redacted claims/binding from participant-issued token at repository, reject wrong issuer/audience/scope/subject. |
| FR-PCI-41 | Issuing Settings | IMPLEMENTED_ACCEPTANCE_PENDING | Configure limits in tenant UI, load test, inspect bounded behavior after restart and under two tenants. |
| FR-PCI-42 | TLS Security | IMPLEMENTED_ACCEPTANCE_PENDING | TLS 1.3 enforced on PCI Gateway and participant channel; selected in-cluster OCM HTTP/NATS endpoints need OCM-owner TLS/service-mesh deployment and a full endpoint scan. |
| FR-PCI-43 | TLS Certificates | IMPLEMENTED_ACCEPTANCE_PENDING | Review and demonstrate the supplied static TLS Secret, name coverage, expiry and rotation. The SRS permits static TLS as an alternative to route-specific Let’s Encrypt. |
| FR-PCI-44 | Authentication with Keycloak in Tenant | IMPLEMENTED_ACCEPTANCE_PENDING | Live PKCE login and issuance with valid/invalid realm, audience, tenant and disabled member. |
| FR-PCI-45 | Authentication with Microsoft Entra in Tenant | IMPLEMENTED_ACCEPTANCE_PENDING | Document tenant connection, perform Entra login and complete a credential journey. |
| FR-PCI-46 | Authentication in Tenant Administration/Registration | IMPLEMENTED_ACCEPTANCE_PENDING | Registration→verification→approval→passkey enrollment and protected admin access in browser. |
| FR-PCI-47 | IDP Authorization Reusage | IMPLEMENTED_ACCEPTANCE_PENDING | IdP role/group mapping guide and live permission change reflected in issuance. |
| FR-PCI-48 | GDPR Compliance | OWNER_REMEDIATION_AND_ACCEPTANCE_PENDING | Owner reviews/builds/deploys exact native logging patches; execute successful/failed real-path canary scans across all retained sinks and record remediation/retention evidence. |
| FR-PCI-49 | Deployment Playbook | IMPLEMENTED_ACCEPTANCE_PENDING | Clean second cluster from a locked release, rollback/restore, full credential issuance. |
| FR-PCI-50 | Route Management | IMPLEMENTED_ACCEPTANCE_PENDING | Effective Envoy route dumps; forged header, direct Service, cross-host and multi-tenant tests. |
| FR-PCI-51 | Deployment Publication | REQUIRED_EXTERNAL_DELIVERY_PENDING | Maintainer-merged PRs with release SHA and deployment integration; separate repository alone is insufficient. |
| FR-PCI-52 | Deployment Tool Stack | IMPLEMENTED_ACCEPTANCE_PENDING | Published architecture/deployment choices, license inventory and second-cluster portability test. |
| FR-PCI-53 | Resource Limitation | IMPLEMENTED_ACCEPTANCE_PENDING | Limits and storage/CPU/memory sizing guide, load test, safe scale/restore demonstration. |
| FR-PCI-54 | Web Documentation | IMPLEMENTED_ACCEPTANCE_PENDING | Versioned public support page with working navigation, FAQ, install/troubleshooting guides and link check. |
| FR-PCI-55 | Jaeger Tracing | IMPLEMENTED_ACCEPTANCE_PENDING | Render and deploy the private TLS 1.3 Jaeger/Prometheus/Collector stack. Demonstrate real PCI counters and safe traces, retention/rotation and telemetry failure isolation. No cross-component trace propagation claim. |
| FR-PCI-56 | Prometheus | IMPLEMENTED_ACCEPTANCE_PENDING | Render and deploy the private TLS 1.3 Jaeger/Prometheus/Collector stack. Demonstrate real PCI counters and safe traces, retention/rotation and telemetry failure isolation. No cross-component trace propagation claim. |
| FR-PCI-57 | OTEL Collection | IMPLEMENTED_ACCEPTANCE_PENDING | Render and deploy the private TLS 1.3 Jaeger/Prometheus/Collector stack. Demonstrate real PCI counters and safe traces, retention/rotation and telemetry failure isolation. No cross-component trace propagation claim. |
| FR-PCI-58 | Health Endpoints/Logging | IMPLEMENTED_ACCEPTANCE_PENDING | Native outage injection, stable health states and sanitized log samples. |
| FR-PCI-59 | Low Code | IMPLEMENTED_ACCEPTANCE_PENDING | Tenant admin changes all relevant pages through one coherent low-code interface. |
| FR-PCI-60 | Layout Customization | IMPLEMENTED_ACCEPTANCE_PENDING | Visual comparison, immediate theme edit across two tenants and responsive browser check. |
| FR-PCI-61 | UX Tests | IMPLEMENTED_ACCEPTANCE_PENDING | Run supplied XFSC Executor browser/runtime/lifecycle cases on a synthetic tenant. Complete real registration/IdP/PCM and accessibility evidence from the walkthrough; no browser or wallet execution was available here. |
| FR-PCI-62 | OID4VCI/VP Version | IMPLEMENTED_ACCEPTANCE_PENDING | Draft 13 and 1.0 issuance serializers implemented; OID4VP profiles and native non-JWT conformance require upstream work. See UP-02/03. |
| FR-PCI-63 | Protocol Structure | IMPLEMENTED_ACCEPTANCE_PENDING | Notification and data request contract, both modes with participant and internal signing, interoperable wire tests. |
| FR-PCI-64 | Standard Workflows | IMPLEMENTED_ACCEPTANCE_PENDING | Restore official remote workflows in every code repo; successful runs tied to release SHA. |
| FR-PCI-65 | Tenant registration | IMPLEMENTED_ACCEPTANCE_PENDING | BDD report with mail and DB/cluster state. |
| FR-PCI-66 | Tenant deletion | IMPLEMENTED_ACCEPTANCE_PENDING | Confirm deletion by exact tenant slug; inventory PCI-owned routes/configuration/Secret grants and accounts. Verify public UI, DID, JWKS, issuer and status URLs are unavailable; other tenants and shared OCM remain. Configuration archive is a separate operation. |
| FR-PCI-67 | Provider approval | IMPLEMENTED_ACCEPTANCE_PENDING | Review audit, no premature resources, final Ready tenant. |
| FR-PCI-68 | Provider rejection | IMPLEMENTED_ACCEPTANCE_PENDING | Rejection BDD, Mailpit/SMTP evidence and resource inventory. |
| FR-PCI-69 | Participant IAM login | IMPLEMENTED_ACCEPTANCE_PENDING | Principal browser authentication and eligible/denied issuance choices. |
| FR-PCI-70 | Multiple tenant domains | IMPLEMENTED_ACCEPTANCE_PENDING | Alpha/Beta login, isolation and route test. |
| FR-PCI-71 | Tenant branding | IMPLEMENTED_ACCEPTANCE_PENDING | Two independently branded live landing pages. |
| FR-PCI-72 | Delegated issuer management | IMPLEMENTED_ACCEPTANCE_PENDING | Grant/revoke by one tenant admin for two real users and scoped operations. |
| FR-PCI-73 | M1 Eclipse IP scan | REQUIRED_EXTERNAL_DELIVERY_PENDING | Compatible license scan and adjudication. |
| FR-PCI-74 | M1 deployment integration | REQUIRED_EXTERNAL_DELIVERY_PENDING | Merged XFSC deployment PR. |
| FR-PCI-75 | M1 release version | REQUIRED_EXTERNAL_DELIVERY_PENDING | Tagged release with cluster image/flow/UI/G0 SHA record. |
| FR-PCI-76 | Create credential configuration | IMPLEMENTED_ACCEPTANCE_PENDING | UI/Well-Known creation demonstration. |
| FR-PCI-77 | Modify credential configuration | IMPLEMENTED_ACCEPTANCE_PENDING | Versioned edit, metadata read-back and in-flight request proof. |
| FR-PCI-78 | Delete credential configuration | IMPLEMENTED_ACCEPTANCE_PENDING | Old credential verifier check after deletion. |
| FR-PCI-79 | Credential logo display | IMPLEMENTED_ACCEPTANCE_PENDING | Wallet-resolved logo and image processing record. |
| FR-PCI-80 | Issuance flow interaction | IMPLEMENTED_ACCEPTANCE_PENDING | Two live journey definitions and executions. |
| FR-PCI-81 | History per configuration shows latest issuances and status | IMPLEMENTED_ACCEPTANCE_PENDING | Search a real issued credential ID, inspect issuance/status/history and authorized principal statement, revoke it through the native status service, and record current state. |
| FR-PCI-82 | Issuance based on participant backend | IMPLEMENTED_ACCEPTANCE_PENDING | Participant repository signs through Crypto Provider Core; independently verify the real credential, import it in PCM and record history/status. |
| FR-PCI-83 | Issuance based on participant data repository | IMPLEMENTED_ACCEPTANCE_PENDING | Participant repository returns unsigned credential data; native OCM signs it. Independently verify, import in PCM and record history/status. |
| FR-PCI-84 | M2 Eclipse IP scan | REQUIRED_EXTERNAL_DELIVERY_PENDING | Official M2 scan report. |
| FR-PCI-85 | M2 deployment integration | REQUIRED_EXTERNAL_DELIVERY_PENDING | Merged source/chart change in XFSC deployment. |
| FR-PCI-86 | M2 release version | REQUIRED_EXTERNAL_DELIVERY_PENDING | Immutable tag and live digest/version trace. |
| FR-PCI-87 | Multiple flows and PCM import | IMPLEMENTED_ACCEPTANCE_PENDING | Two full issuance journeys imported in PCM with verification. |
| FR-PCI-88 | Multiple tenants/users in PCM | IMPLEMENTED_ACCEPTANCE_PENDING | Two tenant and principal matrices in wallet, isolation results. |
| FR-PCI-89 | M3 release version | REQUIRED_EXTERNAL_DELIVERY_PENDING | Immutable release and deployed digest record. |
| FR-PCI-90 | M3 Eclipse IP scan | REQUIRED_EXTERNAL_DELIVERY_PENDING | Official scan and findings closure. |
| FR-PCI-91 | Second-cluster issuance | IMPLEMENTED_ACCEPTANCE_PENDING | Clean-install and credential import/verify evidence on another cluster. |
| FR-PCI-92 | Second-cluster deployment integration | REQUIRED_EXTERNAL_DELIVERY_PENDING | Merged XFSC deployment changes. |
| FR-PCI-93 | Second-cluster release version | REQUIRED_EXTERNAL_DELIVERY_PENDING | Matching source/chart/image tags and notes. |
| FR-PCI-94 | M4 Eclipse IP scan | REQUIRED_EXTERNAL_DELIVERY_PENDING | Official scan result. |
| FR-PCI-95 | Final releases, charts and images | REQUIRED_EXTERNAL_DELIVERY_PENDING | Tags/releases, chart/image digests and registry records. |
| FR-PCI-96 | Final documentation | IMPLEMENTED_ACCEPTANCE_PENDING | Reviewed, versioned and published documentation set. |
| FR-PCI-97 | Final Eclipse IP scan | REQUIRED_EXTERNAL_DELIVERY_PENDING | Scan for every code repo and dependency with zero unapproved conflicts. |
| FR-PCI-98 | EUDI/ARF/ETSI roadmap | IMPLEMENTED_ACCEPTANCE_PENDING | Component-level compliance delta, tasks/owners/effort and explicit noncertification statement. |
| FR-PCI-99 | Issue and PR disposition | REQUIRED_EXTERNAL_DELIVERY_PENDING | Timestamped inventory and disposition/closure of each issue/PR. |
| FR-PCI-100 | Required remote workflows | IMPLEMENTED_ACCEPTANCE_PENDING | Repo workflow review. |
| FR-PCI-101 | Successful final workflows | REQUIRED_EXTERNAL_DELIVERY_PENDING | Green action logs and immutable artifact provenance. |

## Technical clauses

| ID | Requirement | State | Remaining closure |
|---|---|---|---|
| TDC-001 | Use the preferred Kanban or Scrum development process | REQUIRED_EXTERNAL_DELIVERY_PENDING | Client records the selected process and real delivery history. |
| TDC-002 | Release scoped software under Apache 2.0 | IMPLEMENTED_ACCEPTANCE_PENDING | Approve dependency/IP evidence and publish the licensed release. |
| TDC-003 | Present the UX concept before implementation | IMPLEMENTED_ACCEPTANCE_PENDING | Record the actual presentation/approval history; do not backdate it. |
| TDC-004 | Include repository structure in the project plan | IMPLEMENTED_ACCEPTANCE_PENDING | Client approves the structure in the authoritative project plan. |
| TDC-005 | Present progress every two weeks | REQUIRED_EXTERNAL_DELIVERY_PENDING | Actual presenters retain attendance, dates and progress decisions. |
| TDC-006 | Use BDD tests in milestone presentations | IMPLEMENTED_ACCEPTANCE_PENDING | Execute the delivered packs and present actual milestone outcomes. |
| TDC-007 | Use ORCE for service orchestration | IMPLEMENTED_ACCEPTANCE_PENDING | Execute deployed native issuance and tenant operations. |
| TDC-008 | Use ORCE for Builder Node orchestration | IMPLEMENTED_ACCEPTANCE_PENDING | Inspect imported functions and run them in the target ORCE. |
| TDC-009 | Use ORCE for applicable deployment workflows | IMPLEMENTED_ACCEPTANCE_PENDING | Run deploy, upgrade and uninstall from the separate operator ORCE. |
| TDC-010 | Use low-code integration | IMPLEMENTED_ACCEPTANCE_PENDING | Configure multiple journeys and connectors without source edits. |
| TDC-011 | Deploy on IONOS Cloud Kubernetes | IMPLEMENTED_ACCEPTANCE_PENDING | Complete the IONOS deployment and test receipt. |
| TDC-012 | Deploy on T-Systems Open Sovereign Cloud Kubernetes | IMPLEMENTED_ACCEPTANCE_PENDING | Complete the OSC deployment and test receipt. |
| TDC-013 | Automate deployment with Kubernetes and Helm | IMPLEMENTED_ACCEPTANCE_PENDING | Render/lint the charts and execute cluster admission/deployment. |
| TDC-014 | Automate updates with Kubernetes and Helm | IMPLEMENTED_ACCEPTANCE_PENDING | Upgrade with existing PVCs, sessions and configurations, then verify. |
| TDC-015 | Automate uninstall with Kubernetes and Helm | IMPLEMENTED_ACCEPTANCE_PENDING | Run on a disposable installation; preserve unrelated edits and data. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-016 | Manage resources and ingress | IMPLEMENTED_ACCEPTANCE_PENDING | Review live ownership, limits, routes and tenant header isolation. |
| TDC-017 | Deliver charts with each release | IMPLEMENTED_ACCEPTANCE_PENDING | Publish reviewed chart artifacts alongside each approved release. |
| TDC-018 | Provision realms and clients | IMPLEMENTED_ACCEPTANCE_PENDING | Inspect realm/client settings and login flows in deployed Keycloak. |
| TDC-019 | Manage service credentials | IMPLEMENTED_ACCEPTANCE_PENDING | Verify Secret reuse, mounts, rotation and current service authority. |
| TDC-020 | Keep all code, schemas, charts and scripts in the client-designated repository | REQUIRED_EXTERNAL_DELIVERY_PENDING | Project lead supplies the designated repository and accepts these files. |
| TDC-021 | Run GitHub Actions with security checks | IMPLEMENTED_ACCEPTANCE_PENDING | Execute actual workflows and retain dependency/IP results. |
| TDC-022 | Do not create parallel private repositories | REQUIRED_EXTERNAL_DELIVERY_PENDING | Project participants attest to repository authority; no repository was created here. |
| TDC-023 | Commit work to the client repository daily | REQUIRED_EXTERNAL_DELIVERY_PENDING | Actual daily history is required and cannot be manufactured retrospectively. |
| TDC-024 | Include Apache license text and SPDX identity | IMPLEMENTED_ACCEPTANCE_PENDING | Client/IP reviewer approves the final licensed scope. |
| TDC-025 | Use only Apache-compatible FOSS and approved licenses | IMPLEMENTED_ACCEPTANCE_PENDING | Resolve Go sums and full SBOM, scan transitive dependencies and approve licenses. |
| TDC-026 | Inform the client in writing about planned license exceptions | REQUIRED_EXTERNAL_DELIVERY_PENDING | Client records any exception assessment; no approval is implied. |
| TDC-027 | Obtain client confirmation of existing FOSS content | IMPLEMENTED_ACCEPTANCE_PENDING | Client approves the inventoried dependencies and reused source. |
| TDC-028 | Assess and obtain approval of API and component versions | IMPLEMENTED_ACCEPTANCE_PENDING | Verify deployed revisions and record client approval of the compatibility matrix. |
| TDC-029 | Avoid redundant XFSC functions | IMPLEMENTED_ACCEPTANCE_PENDING | Review boundaries: PCI orchestration reuses native keys/signing/offers/metadata/status. |
| TDC-030 | Comply with Eclipse Contributor Agreement 3.1.0 or higher | REQUIRED_EXTERNAL_DELIVERY_PENDING | Each actual contributor completes the required onboarding and agreement. |
| TDC-031 | Use Kubernetes 1.29 or higher | IMPLEMENTED_ACCEPTANCE_PENDING | Validate the selected supported version; the documented supported range is narrower than the minimum. |
| TDC-032 | Use Helm deployments and ORCE Builder runtime without Docker Compose | IMPLEMENTED_ACCEPTANCE_PENDING | Confirm the supplied Kubernetes/ORCE topology in the running environment. |
| TDC-033 | Use Node.js for Builder logic | IMPLEMENTED_ACCEPTANCE_PENDING | Load the generated functions into the approved ORCE Node.js runtime. |
| TDC-034 | Use HTML, JavaScript and JSON schemas for ORCE UI nodes | IMPLEMENTED_ACCEPTANCE_PENDING | Run the browser and UI acceptance pack. |
| TDC-035 | Supply Bash automation under scripts | IMPLEMENTED_ACCEPTANCE_PENDING | Execute Bash entrypoints and supplemental Python orchestration in the operator environment. |
| TDC-036 | Use YAML for charts and Kubernetes manifests | IMPLEMENTED_ACCEPTANCE_PENDING | Helm lint/render and live admission remain required. |
| TDC-037 | Use Go for backend services | IMPLEMENTED_ACCEPTANCE_PENDING | Generate Goa/protobuf, run vet/race tests and compile the participant service. |
| TDC-038 | Report upstream issues in writing and obtain approval for additional work | IMPLEMENTED_ACCEPTANCE_PENDING | Deliver the written findings through the client's approved process; owners review/build/deploy their component fixes. |
| TDC-039 | Follow the Eclipse Handbook | REQUIRED_EXTERNAL_DELIVERY_PENDING | Project lead reviews governance, releases and contributor records. |
| TDC-040 | Use FAP Partner Onboarding as reference | IMPLEMENTED_ACCEPTANCE_PENDING | Confirm the selected reference and PCI-specific adaptations with the client. |
| TDC-041 | Submit BDD documentation within one month of project-plan approval | IMPLEMENTED_ACCEPTANCE_PENDING | Actual project-plan and submission dates are required; no backdated submission. |
| TDC-042 | Document high-level behavior | IMPLEMENTED_ACCEPTANCE_PENDING | Review the product scope against the source specifications. |
| TDC-043 | Document packaging and container boundaries | IMPLEMENTED_ACCEPTANCE_PENDING | Build the mandated participant image; approve its digest. PCI remains imported flows/UI. |
| TDC-044 | Document deployment and preconditions | IMPLEMENTED_ACCEPTANCE_PENDING | Execute the documented deployment/upgrade against the actual environment. |
| TDC-045 | Document changes and additions to source specifications | IMPLEMENTED_ACCEPTANCE_PENDING | Client reviews implementation decisions and unresolved dependencies; source specifications are unchanged. |
| TDC-046 | Document orchestrated flow breakdown | IMPLEMENTED_ACCEPTANCE_PENDING | Review node inputs/outputs and trust boundaries. |
| TDC-047 | Include BDD, licenses, dependencies and external OSS references | IMPLEMENTED_ACCEPTANCE_PENDING | Review the complete tested dependency inventory before release. |
| TDC-048 | Use one monorepo, one history and unified concepts/specifications/source | IMPLEMENTED_ACCEPTANCE_PENDING | Import into the designated repository; no nested independent Git projects are supplied. |
| TDC-049 | Have project leads create the main repository via the client | REQUIRED_EXTERNAL_DELIVERY_PENDING | Client/project leads supply the official destination and naming. |
| TDC-050 | Complete XFSC contributor onboarding | REQUIRED_EXTERNAL_DELIVERY_PENDING | Actual contributors complete and retain onboarding records. |
| TDC-051 | Supply a MkDocs or ReadTheDocs documentation build | IMPLEMENTED_ACCEPTANCE_PENDING | Run strict MkDocs build and publish the reviewed site. |
| TDC-052 | Supply AsciiDoc product documentation | IMPLEMENTED_ACCEPTANCE_PENDING | Client reviews the product document in its accepted documentation format. |
| TDC-053 | Supply editable architecture models | IMPLEMENTED_ACCEPTANCE_PENDING | Review/render the delivered UML sources and confirm the client's model format. |
| TDC-054 | Define every REST endpoint and provide examples | IMPLEMENTED_ACCEPTANCE_PENDING | Execute API examples with private real sessions and validate deployed responses. |
| TDC-055 | Describe orchestration node contracts | IMPLEMENTED_ACCEPTANCE_PENDING | Review imported nodes and configured external modules. |
| TDC-056 | Supply JSON-LD contexts and SHACL shapes for templates/data | IMPLEMENTED_ACCEPTANCE_PENDING | Run a semantic processor and SHACL validator; client approves production vocabulary/template profiles. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-057 | Reconcile client-supplied template examples | IMPLEMENTED_ACCEPTANCE_PENDING | Replace synthetic reference vocabulary when the client provides its approved templates. |
| TDC-058 | Provide overview, setup, environment/configuration and documentation links | IMPLEMENTED_ACCEPTANCE_PENDING | Client reviews the documented installation choices. |
| TDC-059 | Include an understandable use-case diagram | IMPLEMENTED_ACCEPTANCE_PENDING | Review the rendered diagram with the client. |
| TDC-060 | Reference official XFSC Dash scanner and build workflows | IMPLEMENTED_ACCEPTANCE_PENDING | Run workflows, capture resolved nested versions and review actual findings. |
| TDC-061 | Confirm responsible contributor/contact information | IMPLEMENTED_ACCEPTANCE_PENDING | Client must name the maintainer and approved contact; no identity or mailbox is invented. |
| TDC-062 | Document contributor, release and issue-reporting processes | IMPLEMENTED_ACCEPTANCE_PENDING | Client finalizes these processes for the designated project. |
| TDC-063 | Include license terms | IMPLEMENTED_ACCEPTANCE_PENDING | IP reviewer approves final software and third-party notices. |
| TDC-064 | Finalize the code of conduct with the Principal | IMPLEMENTED_ACCEPTANCE_PENDING | Principal approves the existing code-of-conduct text. |
| TDC-065 | Host specifications/models and documentation on GitHub Pages | IMPLEMENTED_ACCEPTANCE_PENDING | Review the generated documentation and explicitly publish it. |
| TDC-066 | Document CI/CD and OpenAPI | IMPLEMENTED_ACCEPTANCE_PENDING | Review exact workflow inputs and API response contracts. |
| TDC-067 | Run deploy/redeploy/uninstall with zero manual intervention after inputs | IMPLEMENTED_ACCEPTANCE_PENDING | Run all three operations with pre-provisioned private inputs and inspect outcomes. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-068 | Use structured JSON automation/runtime logs | IMPLEMENTED_ACCEPTANCE_PENDING | Inspect safe structured outcomes across actual success/failure executions. |
| TDC-069 | Expose machine-readable errors in ORCE context | IMPLEMENTED_ACCEPTANCE_PENDING | Confirm phase/code/detail/nextStep/exitCode without child payload leakage. |
| TDC-070 | Enforce TLS 1.3 for every endpoint and hop | OWNER_REMEDIATION_AND_ACCEPTANCE_PENDING | Platform owners must encrypt compatibility ORCE/database/mail and shared native links. Client flags alone do not close this requirement. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-071 | Store secrets in Kubernetes Secrets and keep them out of logs | OWNER_REMEDIATION_AND_ACCEPTANCE_PENDING | Deploy owner-approved upstream log fixes and inspect every real payload sink. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-072 | Create namespaces, ingress/routes, services and deployments correctly | IMPLEMENTED_ACCEPTANCE_PENDING | Validate Kubernetes admission, controllers, ownership and readiness on both clouds. |
| TDC-073 | Reach identity and trust dependencies | IMPLEMENTED_ACCEPTANCE_PENDING | Demonstrate Keycloak, native TSA/status/metadata/NATS and trust connectivity. |
| TDC-074 | Execute successful deployment scenario | IMPLEMENTED_ACCEPTANCE_PENDING | Run the official Executor against an approved disposable installation. |
| TDC-075 | Execute invalid parameter scenario | IMPLEMENTED_ACCEPTANCE_PENDING | Run the delivered negative parameter case and retain its safe result. |
| TDC-076 | Execute idempotent redeployment scenario | IMPLEMENTED_ACCEPTANCE_PENDING | Prove repeated deployment preserves identities and unrelated resources. |
| TDC-077 | Execute uninstall scenario | IMPLEMENTED_ACCEPTANCE_PENDING | Prove owned removal, retained PVCs and unrelated-resource preservation. |
| TDC-078 | Execute identity/policy/token/integration validation scenarios | IMPLEMENTED_ACCEPTANCE_PENDING | Run real authentication, permissions, native issuance and failure cases. rc.5 supplies the implementation/tooling; execute the linked upgrade/acceptance steps and retain actual evidence. Owner approvals and trusted environment inputs remain required where applicable. |
| TDC-079 | Deliver BDD packs with every release | IMPLEMENTED_ACCEPTANCE_PENDING | Publish the reviewed pack and actual BDD results with each release. |
| TDC-080 | Test Keycloak, OCM, PCM Mobile, TSA, OpenBao and ORCE on both clouds | IMPLEMENTED_ACCEPTANCE_PENDING | Collect real IONOS/OSC receipts with all mandated services and PCM. |
| TDC-081 | Use Git, GitFlow, GitHub Actions and Jira | REQUIRED_EXTERNAL_DELIVERY_PENDING | Project team records actual issue/branch/review/release use. |
| TDC-082 | Deliver Helm repository artifacts, OCI images and BDD reports | IMPLEMENTED_ACCEPTANCE_PENDING | Build/scan/publish the mandated participant image and charts; attach executed BDD reports. |
| TDC-083 | Integrate approved deployment with ArgoCD | IMPLEMENTED_ACCEPTANCE_PENDING | Client supplies approved repository/ArgoCD destination and performs deployment integration. |

## Supplementary groups

| ID | Requirement | State | Remaining closure |
|---|---|---|---|
| TDR-01 | IONOS and OSC Kubernetes deployment | OWNER_REMEDIATION_AND_ACCEPTANCE_PENDING | Run native issuance and lifecycle acceptance on both clouds. |
| TDR-02 | Helm deployment, upgrade and uninstall | IMPLEMENTED_ACCEPTANCE_PENDING | Run G0/Helm twice, upgrade and uninstall; preserve original ORCE/OCM. |
| TDR-03 | Repository and daily delivery governance | REQUIRED_EXTERNAL_DELIVERY_PENDING | Designated repository, real commits, ECA onboarding and client reviews. |
| TDR-04 | Apache-compatible FOSS and Eclipse IP | IMPLEMENTED_ACCEPTANCE_PENDING | Scan Node, Go, container and vendored assets; record client approvals. |
| TDR-05 | BDD pack and milestone presentations | IMPLEMENTED_ACCEPTANCE_PENDING | Official Executor plus native/wallet UX cases, demonstration and reviewer. |
| TDR-06 | Documentation and API/model artifacts | IMPLEMENTED_ACCEPTANCE_PENDING | Publish MkDocs; review OpenAPI, protobuf and format/context/shape coverage. |
| TDR-07 | Registry and deployment integration | REQUIRED_EXTERNAL_DELIVERY_PENDING | Immutable Harbor images and charts; merged deployment changes. |
| TDR-08 | AI-assisted implementation disclosure | IMPLEMENTED_ACCEPTANCE_PENDING | Review source provenance, generated code and validation limits. |
