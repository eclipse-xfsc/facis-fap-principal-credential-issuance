# Maintainer guide

## Where things are

PCI is a Vue/uibuilder application inside XFSC ORCE, with native OCM/TSA boundaries
and a separate Go/Goa participant service. The local fixtures replace those
boundaries with explicit stand-ins; they are not a production service.

For an issuer feature, start at `src/sr2.js`, which holds only the Vue component
lifecycle, then `src/issuer/controller.js`, the composition root that wires the
independently testable features. Dependencies (Vue functions, the API client, the
runtime configuration, `window`, `document`, `crypto`) are passed in explicitly rather
than read from a shared service object.

| Responsibility | Source | Direct regression coverage |
|---|---|---|
| Per-instance editing state and form defaults | `src/issuer/workspace-state.js`, `src/issuer/form-defaults.js` | `test/tests/integration/issuer-features.test.mjs` |
| UI projections and navigation | `src/issuer/workspace-selectors.js` | issuer feature tests, `test/browser/dom-smoke.mjs` |
| Issuer operations | eleven modules in `src/issuer/actions/` | issuer feature tests with injected transport and state |
| Operation lifecycle (busy flag, notices, error normalisation) | `src/issuer/operation-runner.js` | issuer feature tests, `test/tests/integration/workspace-lifecycle.test.mjs` |
| View panels | nine modules in `src/issuer/views/`, assembled by `src/issuer/console-template.js` | `test/tests/integration/sr2-ui.test.mjs`, `test/browser/dom-smoke.mjs` |
| Root workspace and hash routing | `src/main.js`, `src/sr2.js` | `test/tests/integration/workspace-lifecycle.test.mjs` |
| Adapter primitives shared by issuance, presentation, revocation and SD-JWT | `backend/sr2/adapter-contracts.js` | adapter, native and cryptographic tests |
| Native OCM I/O, metadata and key contracts | `backend/sr2/native.js`, `native-metadata.js`, `native-keys.js` | native and verification tests |
| Membership and delegation policy | `backend/sr2/service-policy.js` | `test/tests/integration/review-hardening.test.mjs`, service tests |
| Bundle graph and source gates | `tools/lib/bundle-graph.mjs`, `tools/lib/bundle-inputs.mjs`, `tools/check-maintainability.mjs` | `test/tests/static/bundle-graph.test.mjs` |

The eleven action areas are identity, configurations, flows, tenant, connectors,
access, assets, history, presentation, journey and refresh. Each factory takes the
state and its dependencies as arguments. `test/support/issuer-controller.mjs` provides
lightweight refs and a controlled transport for the feature tests;
`test/fixtures/issuer-public-api.json` records the 96 workspace bindings that the
template uses, and `issuer-modules.test.mjs` fails when one disappears.

At the backend boundary, `backend/sr2/routes.json` maps operations, `http.js`
dispatches, `runtime.js` wires dependencies, `service-policy.js` applies membership
and delegation rules, and `store.js` is the persistence boundary. The memory fixtures
do not establish PostgreSQL migration or concurrency behaviour; the `node` CI job runs
those against a server.

## Changing a feature

Change the action module and the view panel, not the generated flow in `dist/` or the
vendored Vue runtime. Add a regression test with an explicit dependency stub before
the change; where a defect is fixed, the test is committed and run first, so that its
failure is on record. Preserve authorisation, signature verification, tenant isolation
and protocol requirements. For behaviour that involves Vue rendering, run the browser
tests as well; for native contracts, test against the pinned service version in the
designated environment.

A green fixture test is not evidence that a production service behaved the same way.
A result names the commit, the environment and the boundaries that were simulated.

## Build and source gates

`tools/lib/bundle-inputs.mjs` lists the modules of the ORCE and browser bundles in
dependency order. `tools/lib/module-source.mjs` strips the module syntax with the
`acorn` parser. `inspectBundleGraph` rejects missing modules, missing exports,
dependency-order violations, flat-scope name collisions, cycles and unbound external
bindings before anything is flattened; the build fails closed. The test builds use
the same module lists.

`npm run format` applies `tools/format-source.mjs` to `backend`, `src`, `shared`,
`tools`, `test` and `build.js`; the formatter proves AST equivalence before and after and
leaves string and template literals unchanged. `npm run format:check` fails CI on an
unformatted file.

`npm run check:maintainability` applies `tools/maintainability-rules.json` to the same
scope, `test` included: at most 240 characters per line (string and template literals that contain an SQL statement
are exempt), 900 lines per authored file and three statement starts per line; for
`src/issuer/`, 240 lines per module, 350 per view module, 100 lines per function and
decision complexity 20, with composition factories (`createPci*`) exempt from the
function-length limit only; for `backend/`, 100 lines per function and decision
complexity 20, with the factories `createPci*`, `createSr2*` and `extendSr2*` exempt
from the function-length limit only. A file that does not yet meet a rule is listed
under `exceptions` with its reason and the issue that removes the entry; an exception
for a file that does not exist, or for a rule the file meets again, fails the gate, so
the list can only shrink. The current list names the backend functions that still
await their characterisation tests and refactoring. The gate reports the UI and backend import
graphs in the same run. These limits are regression guardrails, not a definition of
maintainability.

Generated `dist/` and `.build/`, pinned `vendor/` and test fixtures are outside the
source-layout rules; their correctness and provenance are checked separately.
`.gitattributes` marks generated and vendored paths for review tools; it does not
hide their changes.

## Local checks

```bash
npm run format:check
npm run check:maintainability
npm run test:offline
npm run test:ux-summary
npm run test:browser:dom
npm run preview:fixture
```

The offline suite needs Node.js, Bash, OpenSSL and Python 3 with PyYAML and does not
install production dependencies. `test:browser:dom` needs Chromium through Playwright
(`PCI_BROWSER_MODULE` or `PCI_CHROMIUM_EXECUTABLE` point at an approved existing
installation; a disposable root sandbox may need `PCI_BROWSER_NO_SANDBOX=1`).
`preview:fixture` serves the application with synthetic data on loopback at
`http://127.0.0.1:4173/pci-orce/ui/` for local UI work; it is not ORCE, Keycloak,
PostgreSQL or OCM and is never exposed beyond loopback.

## Open design work

Some backend coordination, persistence and API-builder modules remain complex
(`backend/sr2/http.js`, `backend/functions/auth.js`, `backend/sr2/native.js`), and
`src/main.js` still composes the non-issuer workspace. Their decomposition follows the
same order as the issuer work: characterisation tests first, then the refactoring,
then the extension of the gate's function limits to `backend/`. The ORCE flat-bundle
constraint remains and needs generated-runtime tests for every change to the build.

The acceptance gates that remain open for the current source are listed in
[acceptance gates](../release/acceptance-gates.md); the contribution process in the
[contribution and review workflow](official-workflow.md).
