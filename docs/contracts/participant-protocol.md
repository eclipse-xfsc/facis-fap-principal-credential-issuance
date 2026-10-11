# Participant protocol v1

`contracts/participant.proto` defines `participant.v1.Participant/Notify` and `GetCredentialData`. Each protobuf message has a field-1 byte array containing UTF-8 JSON. The request shape is documented in `contracts/participant-request.schema.json`; the reference validates requests in its Go decoder and domain checks, without a runtime JSON Schema engine. Goa generates the service boundary; protoc generates the stable wire bindings. This is a PCI-owned protocol derived from the supplied two-call requirement, not a claim that OCM already exposes this protocol.

Both calls use TLS 1.3 with client and server authentication, exact certificate hostname checks, one shared deadline of at most 30 seconds, and a 1 MiB message bound. The repository verifies the PCI client certificate DNS identity. PCI validates Secret namespace and tenant/owner labels before reading its key, resolves an allowlisted endpoint and pins a validated address for the connection.

| Field | Meaning |
|---|---|
| `protocolVersion` | Literal `participant-v1` |
| `tenantId`, `configurationId`, `requestId` | Bound tenant/configuration/one-time request |
| `subject` | Credential subject from the authenticated PCI request |
| `participantSubject`, `participantJwt` | Upstream verified subject and API access token |
| `configuration` | Pinned configuration snapshot and claim definitions |
| `issuer` | Tenant issuer DID |
| `holderBinding` | Verified wallet public JWK binding |
| `status` | Null on Notify; trusted allocated entry on retrieval when needed |
| `deadline` | RFC 3339 UTC end of the shared execution budget |
| `signingContext` | `namespace`, `group`, `key`, `did`, `origin`, all server-derived |

Notify returns `{requestId,accepted:true}`. Retrieval returns exactly one of `{requestId,unsignedData:{subject,claims}}` or `{requestId,signedCredential}`. Internal signing accepts only declared primitive claims and rejects missing required claims. Participant signing must preserve issuer, subject, key, status, holder and format bindings; PCI verifies the result and never re-signs it.

The reference binds Notify to every request field except `status`, which is allocated afterwards. A changed principal, token, key, configuration or holder cannot consume that notification. Retrieval consumes it once. No retry of an indeterminate data/sign request is safe merely because its request ID is unchanged. The default attempt count is one.

Errors use gRPC unauthenticated, permission denied, invalid argument, failed precondition, resource exhausted or internal status with generic details. Claims/tokens/credentials are never in error strings or logs. Participant records are participant-owned; PCI persists only safe lifecycle references and HMAC subject associations.

See [reference service](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/blob/main/reference/participant-data-repository/README.md) and [native runtime](../architecture/issuer-runtime.md).
