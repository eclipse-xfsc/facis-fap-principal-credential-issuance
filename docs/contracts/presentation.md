# OpenID4VP profiles

PCI provides a tenant-scoped presentation verifier for credentials it issued to the signed-in principal. It uses the native TSA signature verifier and native status service. It is not a generic trust registry or a replacement for every OCM verifier format.

The supported credential format is `jwt_vc_json`: a signed W3C credential with an explicit public holder key (`cnf.jwk`) and a native status reference. Both protocol versions are available in the **Verify credential** panel. Unsupported LDP/SD-JWT presentation formats are not advertised or accepted. VCI format selection remains separate; see [native contracts](native-ocm.md).

| Profile | Request | Response |
|---|---|---|
| `oid4vp-draft13` | Presentation Exchange definition; `response_mode=post`; redirect URI as client identifier | JWT VP plus `presentation_submission` with the exact descriptor mapping |
| `oid4vp-1.0` | DCQL query; `redirect_uri:` client identifier; `response_mode=direct_post`; `response_uri` | DCQL result keyed by the requested credential ID with one JWT VP |

The QR contains an `openid4vp://` request. A 5-minute, tenant/principal-scoped process-memory entry holds nonce/state and the expected configuration. The unauthenticated response endpoint accepts bounded form input at `/api/v1/presentation-response`; it cannot choose a tenant through the body. The Gateway host and stored state must agree. The initiating principal polls the authenticated result endpoint using the one-use response code returned by the wallet response. Reload/restart, expiry, concurrent replay, wrong audience, wrong holder, wrong current membership, or revoked status cannot produce success.

Validation verifies the VP signature and nonce/audience/lifetime, extracts the holder key, resolves the credential to an owned issuance record, loads its pinned configuration, rechecks current principal authority, verifies the native issuer signature, and checks the exact native status allocation. Retrieved credential claims, complete VC/VP and response codes are never written to SQL or persistent ORCE context. The result exposes a credential ID and verification outcome, not claim values.

Local tests exercise the request/response serializers and real holder crypto, state expiry/replay, tenant/principal boundaries, signature/status failures and memory-only behavior. `test/live/wallet.mjs` performs a real issuance and both VP responses against deployed OCM, independently verifies the received issuer signature, and returns only sanitized evidence. That software wallet is a test client; PCM Mobile interoperability is a separate acceptance run.

Normative profiles: [OpenID4VP Draft 13](https://openid.net/specs/openid-4-verifiable-presentations-1_0-13.html) and [OpenID4VP 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html). This source implementation is not an OpenID conformance certificate.
