# Participant data repository

Go/Goa service for the PCI two-call protocol. The service verifies the participant access token, then returns configured claims or a participant-signed credential. Participant signing uses the official Crypto Provider Core v2 gRPC `Sign` operation; no private signing key is copied into PCI.

**Build verification:** CI run `38727256710` passed Go/Goa/protobuf generation, `go vet`, race tests and the generated server build. The official Go workflow also passed. [Current results](../../docs/release/completion.md) distinguish source compilation from deployment tests of a participant image.

## Build

Go 1.25 and protoc are required:

```bash
bash reference/participant-data-repository/generate.sh
cd reference/participant-data-repository
# Generation resolves go.sum; preserve it with the release evidence.
go vet -tags=generated ./...
go test -race -tags=generated ./...
go build -tags=generated ./cmd/server
```

The authored transport entrypoint is `cmd/server/main.go.in`. Generation materializes it after Goa/protobuf output exists, so clean-checkout `go mod tidy` does not try to fetch missing local generated packages. The `generated` tag includes that entrypoint for the full service build. The participant CI job always generates and compiles the complete service. The Dockerfile builds from repository root:

```bash
docker build -f reference/participant-data-repository/Dockerfile -t <registry>/pci-participant:0.5.0-rc.12 .
```

## Configure

The chart `deployment/helm/participant/` lists required values. Supply an immutable image reference, tenant UUID, JWT issuer/audience/scopes, trusted PCI client certificate DNS, TLS Secret, participant data Secret and explicitly permitted ingress. For participant-signed mode also provide Crypto Provider Core's TLS endpoint, server DNS and client/trust Secret.

For the ORCE-importable synthetic source, follow [participant setup](../../docs/testing/participant-test.md). Its HTTPS adapter forwards only scoped record IDs using a separate source bearer token.

The alternative static data Secret contains `jwks.json` and `records.json`; the latter is a synthetic/reference repository:

```json
{
  "<configuration UUID>": {
    "<participant subject>": {"name":"Synthetic User","employee":true}
  }
}
```

Replace `Lookup` with a tenant/configuration/subject-scoped participant database implementation for production. Keep personal data in that participant system. Static JWKS are loaded at startup; replace the file and roll the reference deployment for an IdP key rotation, or implement the participant owner's bounded discovery/cache policy.

Server TLS Secret keys: `tls.crt`, `tls.key`, `ca.crt` (trusted PCI client CA). The **PCI-side** Secret contains the client key/certificate and the CA trusted for the repository server. They serve different identities. See `scripts/participant-secret.sh`.

Use one replica: Notify state is deliberately transient and retrieval must reach the same process. A restart requires a new PCI request. The reference supports unsigned primitive claims for internal signing, and ES256 JWT/SD-JWT/JsonWebSignature2020 participant signing through Core gRPC. Linked-data normalization uses the pinned JSON-LD library with an offline context allowlist. No ETSI or wallet certification is claimed.

[Protocol and error semantics](../../docs/contracts/participant-protocol.md).
