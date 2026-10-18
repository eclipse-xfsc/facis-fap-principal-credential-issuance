# Test strategy

PCI provides source tests, actual Chromium UI regressions and deployed XFSC Executor scenarios. Each suite records the system it exercises. Current executed results are in [completion](../release/completion.md) and [CI evidence](../release/ci-evidence.json).

| Suite | Execution and scope |
|---|---|
| `npm run test:static` | Generated Function compilation, routes, RBAC, schemas, URL model and repository checks |
| `npm run test:bdd` | Domain, journey, deletion and permission behavior with transactional fixtures |
| `npm run test:integration` | HTTP wrapper, actual Vue component handlers, cryptography, NATS loopback and HTTP/2 mTLS gRPC |
| `npm run test:offline` | Source suites, deterministic build, shell/Python syntax, G0 manifest generation and documentation checks; 350 tests passed in reviewed CI |
| PostgreSQL CI | Actual schema reapplication, tenant isolation, immutable versions and concurrent limits; passed |
| Participant CI | Go/Goa/protobuf generation, vet, race tests and transport build; passed |
| Browser CI | Actual Chromium UI with synthetic dependency fixtures, desktop/narrow layout, persistent errors and navigation; passed |
| Semantics CI | Independent JSON-LD and SHACL engines with positive and negative fixtures; passed |
| `test/bdd/features/` | Official XFSC Executor/Behave plus Playwright against configured deployed services and authenticated sessions |
| Native wallet pack | Actual offer/token/credential and presentation exchange, history/revocation and signing modes |
| Device/identity/operations scenarios | PCM, fresh authentication, accessibility, cloud lifecycle, privacy and target-load review using their corresponding environments |

Run source component tests directly with `node --test test/tests/integration/sr2-ui.test.mjs`. The CI browser job installs its isolated Playwright package and Chromium to run `node test/browser/runtime.mjs`. These suites create local fixtures and use no deployment tenant/session configuration.

The deployed Executor uses `test/bdd/environment.example.json` as a template for private settings. Supply actual tenant/configuration IDs and capture current browser sessions. Runtime and administration scenarios exercise real server authorization and native services. Source fixtures and live environments are identified separately in each report.

Keep cookies, tokens, TLS keys, participant records and raw diagnostic captures outside Git. Store sanitized results with source/runtime versions, image digests and test scope. Follow [completion tests](completion.md), [the walkthrough](acceptance-walkthrough.md), and [deployment review](live-acceptance.md) for the selected suite.
