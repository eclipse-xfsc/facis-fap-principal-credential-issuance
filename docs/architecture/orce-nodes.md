# ORCE node contracts

`tools/build-flows.mjs` builds the imported flow from the modules below and `backend/sr2/routes.json`. Node IDs are stable. A build identifier invalidates cached native adapters when an updated flow is imported. Runtime objects are process-local; persistent Node-RED context never receives credentials, token maps, participant data or presentation sessions.

| Module | Inputs and authority | Result / effect |
|---|---|---|
| M1 Infrastructure | Authenticated provider operation or scheduled internal bootstrap | Validate dependency configuration; bounded Kubernetes operations; readiness |
| M2 Registration | Public/private-mode form, one-use email token | Registration record, email outbox, typed safe response |
| M3 Provider administration | Provider session on main host; If-Match for reviewed records | Approve/reject; desired tenant state; sanitized audit |
| M4 Tenant reconciliation | Scheduled internal message or provider session | Tenant-owned ConfigMap/HTTPRoute and Keycloak identity; Ready/Error conditions |
| M5 Authentication | OIDC PKCE callback with single-use state and expected host | Verified server session; secure host-scoped cookie; volatile participant token |
| M7 Tenant administration | Tenant session and current role | Tenant context, members, invitations; no caller-selected tenant authority |
| M6 Email | Internal outbox trigger or authorized operation | Mail transport acknowledgement; bounded retry state |
| M8 Issuer administration | Tenant admin/assigned issuer; typed HTTP body and resource version | Keys, configuration drafts/publications, assignments, branding and limits |
| M9 Issuer metadata | Tenant-scoped public discovery or authorized publication | Native Well-Known registration/read-back; public metadata/assets |
| M10 Flow management | Assigned issuer and owned configuration | Validated journey steps, preview, immutable version and rollback draft |
| M11 Issuer runtime | Authenticated principal or private correlated native NATS callback | Pinned issuance, participant data exchange, native signing/status and transient presentation verification |
| M12 Participant integration | Tenant admin and operator-approved host/Secret names | Connector binding, native participant-v1 mTLS gRPC invocation |
| M13 History/status | Current issuer assignment and configuration scope | Search, safe principal JWT, verified ID/holder, native revoke and explicit unblock |
| PCI interface | HTTP route normalization and uibuilder socket | UI files and refresh events; server rechecks authority for every operation |

The route registry is authoritative for the exact module/action mapping; the table describes responsibilities. Function node messages carry `pciAction`, `pciTransport`, `payload`, and the original HTTP request/response handles. A public body cannot grant `pciInternal`. Gateway request headers are overwritten by the trusted route; membership and routed host must still agree with the requested tenant.

HTTP results use `msg.statusCode`, `msg.headers`, and `msg.payload` and leave through the HTTP response output. Errors use Problem Details with a safe code and correlation reference. Internal scheduling messages have no browser response. Uibuilder events contain state-change notifications, not credential payloads; SR2 mutations require the authenticated HTTP transport.

## Native callbacks

`pciListen` subscribes to each published configuration's native issuance subject. The common envelope binds tenant/request IDs, event type, private offer nonce, configuration, holder proof and expiry. A callback can be consumed once. It returns the official native reply shape; the browser-facing compatibility callback endpoints remain disabled. No HTTP endpoint accepts an operator token as a substitute for a verified native callback.

## Operator deployment flow

Import `automation/flows/pci-deployment.json` into an operator ORCE with `child_process` and `path` available to Function nodes. Set administrator-controlled `PCI_RELEASE_ROOT` and `PCI_DEPLOY_CONFIG` to absolute mounted paths. Manual Inject nodes send only `operation: deploy|upgrade|uninstall`. The runner uses a private config and the selected kubeconfig/context. Concurrent runs are rejected.

Output is a structured `pci.automation.step` or `pci.automation.result`; the latest sanitized object is also in flow context `pci.deployment`. No arbitrary `msg.command`, path, argument array or HTTP trigger is accepted. The example JSON documents the input schema. See [automation](../operations/automation.md).

## Synthetic participant record flow

`reference/participant-data-source/flows.json` exposes only its documented record lookup. It validates tenant/configuration/subject and its dedicated service token. It reads synthetic records from the configured private file; it does not implement OCM signing, offers, verification or status. Import it into the separate internet-reachable test ORCE described in [participant setup](../testing/participant-test.md).
