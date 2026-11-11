# Run the deployed PCI UX tests

This runbook covers FR-PCI-61. It extends the existing official XFSC
BDD Executor/Behave and Playwright tests. Run it on a workstation against
the deployed PCI service; the run is not part of a GitHub workflow.

## Files and scope

`scripts/run-ux-bdd.py` initializes private configuration, installs the pinned
test environment, captures browser sessions and runs exactly 12 scenarios.
It selects `@pci-ux` using syntax supported by the inherited Behave 1.2.6.
The existing tenant-deletion case does not carry that tag. No uninstall,
cluster redeployment, physical PCM or fresh IdP enrollment scenario is selected.

The run checks readiness, invalid local installer arguments, administrator
workspace/search, cross-tenant denial, principal authorization, tenant-bound
metadata, persistent errors, journey editing/preview/publication, responsive
settings tabs, invalid connector rejection, draft archival, delegation/revocation
and a principal's real native offer/QR journey.

The configured services must operate normally for the PCI journey to succeed.
These are PCI-facing integration checks, not a separate OCM internal test suite.

The layout assertions follow the current settings-tab UI. They test the Branding
and Signing keys tabs at 1440 px and 390 px, rather than requiring both panels to
appear simultaneously. No application runtime files are changed by this package.

## 1. Work from a checkout of the repository

Run every command below from the root of a checkout of
`eclipse-xfsc/facis-fap-principal-credential-issuance` at the commit under
test. The runner, the collector and the feature files are part of the
repository; nothing is extracted or copied into the checkout.

## 2. Create the local environment

Use Python 3.11 or 3.12, Git, and a desktop session for browser login. Debian may
require `python3-venv`; Playwright may report additional system browser libraries
needed on the workstation. Follow its reported dependency instructions if so.

```bash
export PCI_UX_PRIVATE="$HOME/.local/share/fap-pci-ux"
python3 scripts/run-ux-bdd.py init
PYENV_VERSION=3.12.8 python3 scripts/run-ux-bdd.py setup
```

Setup creates a virtual environment outside the checkout and installs the exact
`test/bdd/requirements.txt`, including XFSC Executor commit
`478909cdd735bbab8bb63ce955183713d6bb387b`, then Chromium. It needs Internet access.
It preserves the existing dependency pins; dependency/IP review remains separate.

## 3. Prepare the synthetic fixtures and edit configuration

Collect the actual URLs and tenant IDs from your selected Kubernetes context:

```bash
python3 scripts/collect-ux-environment.py
```

Check the printed context and choose the dedicated synthetic Alpha tenant and
a different Beta tenant. Alpha and Beta are test roles, not required tenant
slugs. Then collect Alpha's published configurations, journey field labels and
member subject IDs using its actual UUID:

```bash
python3 scripts/collect-ux-environment.py --tenant ACTUAL_ALPHA_TENANT_UUID
```

The collector reads ConfigMaps and deployment image names. With `--tenant`, it
also executes a fixed, read-only database query inside the existing PostgreSQL
pod. It uses that pod's existing credentials without printing them. It does not
read Kubernetes Secrets or return browser sessions, participant claim values,
offers or signing keys. The output contains URLs and member identities: review
it before sharing, and keep it out of Git. Member usernames and personal contact
fields are excluded. Missing fixtures must be prepared
in the UI; collecting metadata does not create them or verify their readiness.

The defaults match namespace `xfsc-orce-pci-orce`, deployment `xfsc-orce` and pod
`fap-pci-postgres-0`. Use `--context`, `--namespace` or `--postgres-pod` if needed.
The bootstrap version is metadata; verify the running image version separately.

Use an existing dedicated synthetic Alpha tenant and a different Beta tenant.
The Alpha admin must have tenant administration and configuration-creation
permissions. The Alpha principal must be an enabled ordinary principal with no
existing issuer permissions. Do not use an account that already has delegated
issuer rights: the delegation scenario checks that it starts without them.

In Alpha, prepare an existing published synthetic credential configuration with:

- a working participant connector and tenant signing key;
- a published information/consent/offer journey;
- eligibility for the Alpha principal;
- native issuer metadata published successfully.

The offer scenario requests an offer and checks the real QR. It does not perform
PCM import or claim to validate the full credential exchange.

Edit the generated private file:

```bash
${EDITOR:-vi} "$PCI_UX_PRIVATE/environment.json"
```

| Field | Value to supply |
|---|---|
| `mainUrl` | Provider PCI base URL, for example `https://YOUR-HOST/pci-orce` |
| `alphaUrl`, `betaUrl` | Actual tenant PCI base URLs; omit `/ui/` |
| `alphaTenantId`, `betaTenantId` | Actual, different tenant UUIDs |
| `sessions.alphaAdmin.url`, `sessions.alphaPrincipal.url` | Same value as `alphaUrl` |
| `allowUxMutations` | `true` for the dedicated synthetic Alpha tenant |
| `allowDestructiveAcceptance` | Keep `false` |
| `issuerKey` | Existing Alpha signing-key reference, usually `issuer` |
| `offerConfigurationName` | Exact displayed name of the prepared published synthetic configuration |
| `journeyAnswers` | Input-label/value pairs if that journey has input steps; otherwise `{}` |
| `delegationCase.tenantId` | Same as `alphaTenantId` |
| `delegationCase.configurationId` | UUID of the prepared Alpha configuration |
| `delegationCase.subject` | IAM subject of the ordinary Alpha principal |
| `delegationCase.session` | Keep `alphaPrincipal` |

Find tenant/configuration IDs in your existing deployment/setup records or the
authenticated browser's API responses. The subject is the ordinary principal's
`subject` in its `/api/v1/auth/session` response. Never publish that response or
its cookies. `init` supplies absolute session-file paths: leave those in place.

## 4. Capture the two logins

```bash
python3 scripts/run-ux-bdd.py capture alphaAdmin
python3 scripts/run-ux-bdd.py capture alphaPrincipal
python3 scripts/run-ux-bdd.py check
```

Each capture opens a separate browser. Sign in with the corresponding account,
finish normal MFA, wait until its PCI workspace appears, then press Enter in the
terminal. The session files are private and expire normally. Recapture when the
test reports an expired session. Keep certificate validation enabled; configure
the workstation's trust correctly for your deployed HTTPS endpoints.

## 5. Run the test

```bash
python3 scripts/run-ux-bdd.py run --release 1.0.0 --environment OSC
```

Add `--headful` to watch the browser. Run against IONOS separately with
`--environment IONOS` if you need evidence for that installation too. `--release`
records the deployment version you supply; it does not discover or verify a
container image digest.

This run creates synthetic drafts/journeys, archives one test draft and briefly
grants/revokes a scoped issuer assignment. It requests one native offer. It does
not delete tenants or uninstall anything. Created BDD configurations/journeys
remain inspectable; archive them after review. A cleanup callback attempts to
revoke a temporary grant after a test failure. If interrupted, check Access &
members and revoke any remaining BDD assignment before rerunning.

Exit code 0 means all 12 selected scenarios passed. Missing, duplicate, failed,
skipped or undefined selected scenarios cannot produce PASS. A new run removes
the previous current summary first, so a failed rerun cannot leave an older PASS
file at the current-summary path.

Raw JSON, JUnit and runner output stay under `$PCI_UX_PRIVATE/runs/`. They may
contain sensitive diagnostic details and are not supplied to GitHub. Keep them
private. A successful run additionally creates:

```text
docs/testing/evidence/fr61-ux-summary.json
```

That minimal summary contains fixed scenario names/results, declared release,
environment, execution time, source commit and test/report hashes. It contains
no browser cookies, tokens, URLs, subject IDs, offers, QR images or raw errors.
Retain the private report matching its hash for review/demonstration.

## 6. Record the result

After the run passes, inspect the exact changes and commit only the generated
summary:

```bash
git status --short
git add docs/testing/evidence/fr61-ux-summary.json
git diff --cached
git commit
```

Follow the pull request process in `CONTRIBUTING.md` (fork, one branch per
change, pull request against `main`, named human reviewer). If the run fails,
fix the real failure and rerun; do not edit its result to PASS. The test code
is maintained in the repository independently of any run; a run summary alone
does not close FR-PCI-61 without the review of the pull request that records it.

## Local verification without a deployment

`npm run test:ux-summary` runs the unit tests of the summary writer and its
failure handling; `python3 tools/check-bdd-catalogue.py` checks that every
Gherkin step has a binding; `npm run test:offline` runs both as part of the
offline validation. None of these executes a scenario against a deployment.
A real deployment and browser execution with the private fixtures above is
still required, and no executed UX PASS report is part of the repository
until such a run has been recorded as described in section 6.

The runner observes UI actions through their correlated UIBUILDER
command/result messages, matching the current application transport. Direct
HTTP authorization checks remain direct server requests. UI commands still
originate from actual button clicks; the observer neither sends business
commands nor fabricates responses. Unselected native/PCM and deletion
scenarios retain their original transport handling and are outside this
runner's scope.
