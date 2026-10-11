# Testing

Local source validation, native integration and contractual acceptance are separate gates.

| Suite | What it executes | Limit |
|---|---|---|
| `npm run test:static` | Generated Function compilation, routes, RBAC, schemas, URL model and repository checks | Source checks, not Kubernetes admission |
| `npm run test:bdd` | Real domain/journey/deletion/permission code against transactional test doubles | No actual PostgreSQL or OCM |
| `npm run test:integration` | HTTP wrapper, Vue renderer, JWT/proof crypto, fragmented NATS loopback and real HTTP/2 mTLS gRPC frames | Local servers; no native image/wallet proof |
| `npm run test:offline` | All above, deterministic build, shell syntax, secret-literal scan, embedded schema identity | Does not silently label missing toolchains PASS |
| `test/live/postgres.test.mjs` | Actual schema twice, isolated transactions, tenant scoping, immutable snapshots and competing rate limit calls | Requires `PCI_TEST_DATABASE_URL`; never silently skips |
| Participant CI | Goa/protobuf generation, build, vet and race tests | Must run with Go/protoc; local result NOT RUN |
| `test/bdd/features/` | Official XFSC Executor plus Playwright on deployed PCI; readiness, GUI, isolation, redeploy and uninstall | Requires private environment/session files; no mocks |
| Browser job | Isolated Chromium/Vue component, settings layout, narrow viewport, error persistence and presentation tab | Fixture server; not live OCM/Keycloak or accessibility certification |
| Native wallet pack | Deployed offer/token/credential and both VP profiles, history, revocation, reissuance and two signing modes | Software test wallet; PCM remains separate |
| Live matrix | Native services, Keycloak/Entra, PCM, formats/status, clouds, privacy and accessibility | Operator/wallet evidence required |

The release retains local BDD-style Node tests and adds the mandatory Executor pack. The former is not relabelled as the latter. All tests produce safe outcomes; browser session files, raw credentials, participant records and tokens must stay outside the evidence repository.

Run [live acceptance](live-acceptance.md) before submitting a final receipt. A successful unit suite cannot close a requirement whose criterion requires a real wallet, cloud deployment or external approval.
