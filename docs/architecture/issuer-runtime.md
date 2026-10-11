# Issuer runtime and adapter boundary

`createPciNativeAdapters()` is the production adapter for the pinned OCM baseline. An unconfigured adapter fails closed; only local tests inject doubles. Native image/wallet acceptance is still required. See [wire contracts](../contracts/native-ocm.md) and [known gaps](../known-gaps.md).

## Issuance state

A principal starts a ten-minute request with a subject-bound idempotency key. The database stores its HMAC subject reference, immutable dependency versions, step counter and safe lifecycle fields. Completing the journey precedes offer preparation. A duplicate creation key returns the same request. A duplicate consumed offer/callback is rejected; raw offers and credentials are deliberately not cached for retry.

Before contacting dependencies, the runtime commits `preparing` or `processing`. This prevents simultaneous callbacks from allocating/signing twice. External timeouts are bounded. Notification and data retrieval retry only errors explicitly classified by the verified adapter as transient AND safe to repeat with the same idempotency key; attempts are limited to three within the single deadline. There is no blind retry of signing, status mutation or offer creation.

Internal-signing order is: validate participant identity → notify → retrieve and validate unsigned data → allocate owned status → invoke tenant signer → independently verify signed output → record issued. Participant-signed order is: validate identity → notify → allocate trusted status → request the signed credential with that status context → independently verify output → record issued. No participant-signed result is re-signed by PCI.

Status handles and public entry hashes are unique per tenant and request. A repeated slot assigned to a different request is rejected before signing. Revocation resolves the stored handle, never a caller-supplied list/index. Local `revoked` is recorded only after the adapter confirms tenant/request/handle. Repeated confirmed revocation is idempotent. Configuration policy can block reissuance; a tenant admin can explicitly clear that pseudonymous block through the API.

## Cryptography and participant boundary

The JWT verifier uses Node crypto and trusted public JWKs. It allows RS256/PS256/ES256 only, rejects key-source/critical header extensions, validates signature, issuer, audience, subject, tenant, required scopes and lifetime, and rejects RSA keys below 2048 bits. The local compact JWT VC verifier checks issuer/DID, exact credential types, subject/claim schema, trusted status and optional holder binding. Wallet JWT proofs are verified locally; non-JWT credentials use the native verifier and binding checks. Full format/profile conformance and JSON-LD/SHACL coverage remain open.

The participant-security helper reads only caller-supplied operator-restricted Secret references, validates namespace plus tenant/owner labels, checks client certificate/key pairing and expiry, and enforces TLS 1.3 with server identity verification. It resolves and pins an approved destination, rejecting non-public addresses unless the operator explicitly approves their exact addresses. The native gRPC adapter connects to the pinned address with the original TLS server name. The generated Go participant transport is supplied as a build target and requires its CI compilation gate. Local loopback tests exercise mutual TLS plus wrong CA, hostname, key and expiry failures using ephemeral in-memory material.

## Internal HTTP boundary

Internal endpoints require a constant-time service token check, exact source-IP allowlist and absence of the public-gateway marker. `PCI_INTERNAL_ALLOWED_IPS` defaults empty, disabling them. The approved upstream adapter must additionally authenticate/decode the invocation or callback; body fields never become principal authority. Do not allowlist Envoy/public ingress source addresses. Envoy marks main, tenant and separate editor routes as public.

Production callbacks use the pinned NATS envelope, not these compatibility HTTP endpoints. The native adapter binds a private offer nonce, tenant/configuration and independently verified wallet proof before invoking issuance. Metadata publication uses native full-replacement registration and read-back. A nonempty catalogue can repair an existing empty issuer by sending its real configuration events. An empty catalogue is rejected with an actionable conflict because the selected upstream read path fails on NULL timestamps.

## Recovery limits

A worker failure after a remote effect cannot be declared safely retryable without upstream idempotency/query semantics. Requests remain indeterminate (including failed revocations) for operator reconciliation. They never falsely report successful issuance/revocation. Config snapshots are retained. Public status/assets remain for an active tenant after configuration archival; confirmed tenant deletion removes its public routes. No automatic retention purge is enabled before an approved retention/credential-validity policy exists. Backpressure has bounded rate/concurrency/deadlines and persistent connector circuit breaking. PCI operation spans and a preconfigured Jaeger/Collector/Prometheus deployment are supplied. Cross-component OCM trace propagation is not claimed.

Persistent connector circuits store only tenant/connector identifiers, failure count, open-until time and an optional recovery request ID. Defaults are three dependency failures and a 30-second pause; configuration bounds are 2–10 failures and 1–300 seconds. Database tenant locks permit one recovery probe, with a timeout lease. Authorization failures do not count as connector outages. Actual SQL contention and deployed transport behavior remain LIVE REQUIRED.

## History and presentation

History can resolve a tenant-scoped subject hash to existing IAM membership for authorized issuer search. It generates a short-lived history-only principal statement and exposes the verified holder public key as did:jwk. No participant access token or retrieved claim is saved for this feature. [Presentation verification](../contracts/presentation.md) supports both VP profiles for holder-bound JWT credentials through native TSA/status, using volatile nonce/state and current tenant/principal authority.
