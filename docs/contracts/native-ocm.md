# Native OCM contract

Baseline: uploaded ESB 12.3.9, as recorded in [the current assessment](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/blob/main/contracts/ocm-12.3.9-assessment.json). `contracts/source-manifest.json` preserves earlier immutable source review records; changed native revisions are explicitly superseded in that assessment. Source compatibility is not proof that a deployed image corresponds to that source; record image digests in live acceptance. `contracts/integration-lock.json` states the remaining validation boundary.

## NATS

All messages are structured CloudEvents 1.0 JSON. `data` contains `tenant_id`, `request_id`, optional `group_id` and operation fields. Replies must match the event type, tenant and request and contain no service error. Sensitive traffic uses Core request/reply, not JetStream or another durable queue.

| Subject | Event type | Request / response |
|---|---|---|
| `credential.offer.url` | `credential.offer.url.v1` | Capital `Params` with `subject`, `credentialConfiguration:[{configuration_id}]`, `grantType`, private `nonce`; response `CredentialOffer:{credential_offer}`, `Code`, `Subject` |
| `fap.pci.<tenant UUID>.<configuration UUID>.issue` | Same prefix without `.issue` | Native callback with `CredentialConfiguration`, `Format`, `Nonce`, `Subject`, `Holder`, `ProofType`; reply `Credential`, `Format` |
| `wellknown.issuer.registration` | Same as subject | `issuer` object, full replacement; no acknowledgement |
| `wellknown.issuer.metadata` | Same as subject | Read-back reply `Issuer`; PCI compares advertised content and exact configuration keys |
| `sign` | `signer.createKey`, `signer.signToken` | Tenant namespace, group `default`, key; token payload/header and reply token use base64 |
| `status.data` | `status.data.create` → `status.data` | `origin`, `key`, `did`, `namespace`, `group`, list type/purpose/expiry → `listid`, `index`, `statusUrl` |

The offer `Subject` is SHA-256 of `tenant;group;request;` (empty group for this integration). The offer nonce is an internal callback correlation secret. It is **not** the wallet's proof nonce. Wallet nonces come from the native nonce endpoint, are hashed in volatile memory, verified against the cryptographic proof and consumed once.

Provision NATS credentials/ACLs as an OCM-owner action. Permit PCI request/publish subjects above, its callback wildcard, and ephemeral inbox replies. Do not grant UI users NATS access. The native signer/issuer currently trusts the internal bus boundary; network isolation and producer ACLs must be demonstrated.

## HTTP

Native services remain in OCM. ORCE checks gateway-derived tenant authority and forwards only fixed native routes with server-derived namespace, key, origin, DID, token endpoint and audience headers. Requests are size/rate/deadline bounded. Native error bodies are replaced with allowlisted OAuth error codes and generic descriptions.

Signer JWK lookup requires `GET /v1/jwk/{namespace}/{key}` **with JSON body** `{group:"<tenant UUID>",engine:"transit"} when namespace is the configured OCM namespace` in the selected Goa decoder. DID/JWKS endpoints use namespace/group/engine headers. Status revoke uses `POST /status/{tenant}/{list}/revoke/{index}` and validates the full tenant/list/index/revoked acknowledgement before recording local revocation.

Draft 13 requests identify format and credential definition/VCT (or a credential identifier), contain singular `proof`, and return singular `credential`. Final 1.0 uses exactly one identifier choice and `proofs.jwt`; responses contain `credentials`. One JWT proof/credential is supported. Response encryption, batching and deferred issuance are not advertised. Discovery path rules differ and both are routed correctly for a nonempty base path.

Metadata omits internal NATS `topic` and schema fields from public responses. Native signing uses TSA keys; JWT output is independently verified locally. Linked-data/SD-JWT outputs require the native verifier and additional issuer/subject/claim/status/holder checks. Those adapters exist, but the supplied native stack's non-JWT defects remain release blockers.

References: [OID4VCI 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html), [Draft 13](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-13.html), and source-pinned XFSC files. Do not replace a native wire contract with a guessed message schema.

PCI now supplies a transient [OpenID4VP verifier](presentation.md) for both profiles and JWT W3C credentials. Its issuer verification and status calls use the native TSA/status contracts; it does not persist VPs in the broader OCM verifier.

Crypto 2.3.7 LDP verification uses `POST /v1/credential/verify`, `x-format: ldp_vc`, and a body containing the original credential bytes as base64 plus `disclosureFrame: []`. It omits the obsolete namespace/group/tenant headers for this route only; signing and JWK scoping remain. A strictly boolean positive proof verdict is required. Because this route no longer checks LDP revocation, PCI independently verifies native status before credential delivery and presentation success. Missing, negative, unavailable or malformed status verdicts fail closed.
