# Threat model — SR2

| Threat | Source control | Remaining proof |
|---|---|---|
| Spoofed or conflicting tenant identity | Exact routed host plus canonical UUID/slug/domain; duplicate security-header rejection; session tenant and enabled DB member | Effective Envoy/backend network boundary |
| Stale/global issuer role | Current tenant/configuration assignment on every operation, immediate revocation, no role-only access | Keycloak role changes and real concurrent sessions |
| Object/asset/flow/connector swap | Tenant-qualified storage and configuration ownership; uniform missing-resource denial | Real PostgreSQL and two-tenant deployment |
| CSRF or browser reaching internal API | Origin/fetch-site/JSON checks; internal constant-time token plus exact source IP; public marker denied; verified callback decoder required | Proxy topology and internal-service identity |
| Tenant scripts/image payloads | Allowlisted declarative steps; escaped text; constrained PNG decode/re-encode; generated object IDs | Real browser review and parser fuzzing beyond included cases |
| Participant SSRF | Operator host allowlist, validated server name, address approval and DNS pinning helper, no redirects in the contract | Actual generated gRPC transport consumes pinned address |
| Wrong mTLS tenant/CA/key/host | Secret namespace/owner labels, certificate/key/expiry checks, TLS 1.3, standard hostname verification | Mounted Secret permissions, production CA rotation/revocation |
| JWT or signed-credential substitution | Asymmetric signature/alg/key validation and tenant/issuer/audience/subject/scope/time/status/type binding | Exact upstream proof and non-JWT credential profiles |
| Callback replay/concurrency | Stored states, tenant locks, idempotency hashes, dependency pinning, expiry and single-consumption | Real database failover/lock contention and upstream recovery |
| Reused status or arbitrary revocation | Tenant/request-unique status slot and handle; stored-reference-only revoke; confirmation before history state | Real Status Provider operation/verifier evidence |
| Payload leakage | Allowlisted history fields, no credential/token storage, safe logs, no debug nodes, no internal UI broadcasts | Whole-stack logs/streams/telemetry/backups scan |
| Destructive tenant cleanup | Exact owned names/labels; all-target ownership preflight; Kubernetes UID/resourceVersion preconditions; shared realm/client preserved | Live deletion inventory against FR-27/66, including named Secret/RBAC garbage collection |
| Bootstrap privilege remains | G0 performs prerequisite bootstrap with operator authority; runtime roles stay bounded | Actual RBAC/admission inspection |

M1 is status-only. The removed `harden-rbac.sh` is not part of this release and must not be invoked. G0 performs schema/infrastructure preparation before hot installation of the flow/UI; the runtime does not bootstrap cluster controllers. OCM lifecycle mutation remains forbidden. Built-in Node crypto/TLS/PNG/QR code adds no runtime npm dependency.

The system is not production-certified from these tests. Native adapters are wired against pinned source. G0 restricts direct ORCE ingress to the PCI Gateway; independently managed permissive NetworkPolicies can still add another path and must be reviewed. Approved egress, identity, TLS and retention policies still need live evidence.
