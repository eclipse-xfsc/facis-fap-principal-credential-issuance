# Live acceptance and sign-off

Run on synthetic data first. Resolve [upstream blockers](../known-gaps.md) before personal data testing. Record exact PCI build hashes, native images/digests, OCM ESB version, Kubernetes/Helm versions, environment and reviewer.

## Automated gates

1. Run GitHub CI: Node, actual PostgreSQL, generated participant build/race tests, Helm and official Go tests. Keep the generated participant files and `go.sum` artifact. Run dependency/container/IP scans; inspect findings rather than treating job creation as a pass.
2. Deploy G0, import new flow/UI and perform readiness checks. Run once on IONOS and once on OSC. Confirm OCM workload specifications and shared resources did not change.
3. Install the Executor in a private test environment:

```bash
python3 -m venv /private/pci-bdd
/private/pci-bdd/bin/pip install -r test/bdd/requirements.txt
/private/pci-bdd/bin/playwright install chromium
```

Copy `test/bdd/environment.example.json` outside the repository and set its real URLs/IDs. Create approved Alpha/Beta tenants, publish a synthetic Alpha configuration, and capture separate Alpha admin/principal sessions using `scripts/capture-browser-session.py`. Complete real MFA manually; never disable it for the tests.

```bash
export PCI_BDD_CONFIG=/private/pci-environment.json
/private/pci-bdd/bin/behave test/bdd/features --tags=runtime \
  --junit --junit-directory /private/pci-evidence/bdd
```

The `lifecycle` pack runs deploy/upgrade through the release runner and uninstalls prerequisites. It requires `PCI_BDD_ALLOW_LIFECYCLE=1`, a dedicated disposable deployment a private lifecycle configuration and a matching G0 argument-array JSON file (arguments, not a shell command). Complete confirmed deletion of test tenants before the uninstall scenario. This explicit test-environment guard is part of the test harness, not a prompt to approve production destruction.

The selected official Executor has older pinned dependencies; include its dependency audit in the environment approval. No Executor or browser run was executed in the authoring environment.

## Required scenario matrix

| Area | Positive proof | Negative/recovery proof |
|---|---|---|
| Registration | Public/private form, Mailpit email, verify once, provider approval, Ready tenant | Unverified/duplicate/rejected/expired registrations create no resources |
| Identity | First password change, TOTP, passkey, Keycloak and Entra account-linked login | Wrong issuer/audience/scope, expired token, unbound broker user, removed role |
| Administration | Two delegates with different scopes; configuration/flow create/edit/preview/publish/restore/archive | Principal cannot administer; stale If-Match and cross-tenant resource IDs denied |
| Native metadata | Read-back, correct host-root discovery paths, logo fetch, restart reconciliation | Stale revision cannot advance observed state; archived configuration withdrawn |
| Participant | Notify then retrieval, TLS 1.3, internal and participant signing | Wrong/expired cert, changed holder/config, replay, timeout, claims/schema mismatch |
| Wallet | Two configurations, two tenants, two principals; PCM import/display/verify | Wrong proof nonce/audience, cross-tenant token, reused offer, expired request |
| Profiles | Draft 13 and 1.0 issuance and presentation with final supported format matrix | Unsupported format/proof rejected; no false protocol capability declaration |
| Revocation | Public status confirmed, history ID searchable, reissue blocked | Duplicate revoke safe, unknown side effect remains indeterminate, Beta unchanged |
| Privacy | Canary disappears from PCI stores/logs/traces after success/failure | Inspect native NATS/issuer/signer/storage, error bodies, backups and browser data |
| Operations | Static/ACME rotation, health failure, metrics scrape, Jaeger/OTel, backup/restore | No payload labels/traces; invalid/missing dependencies fail readiness |
| Resource bounds | Concurrency, burst rate, memory/CPU and availability at target load | Capacity errors recover without unbounded queues or horizontal duplication |
| Lifecycle | Repeat deploy, upgrade, provider/participant delete, uninstall | Ownership/UID races safe; configuration archive preserves active-tenant verification; full tenant deletion removes public routes |
| UX | FACIS style, keyboard, focus, screen reader, 200/400% zoom and narrow screen | Errors announce clearly, color is not sole state, no lost focus/trapped controls |
| Release | Official workflows, IP/SBOM, Harbor, deployment PRs, tags, docs, issue closure | Missing/failed evidence blocks sign-off |

The additional `ux`/`offer` cases and their opt-in synthetic-data setup are described in [the acceptance walkthrough](acceptance-walkthrough.md). The Executor pack automates a subset; the full table and all SRS milestone criteria still need executed evidence. Extend it with the operator's wallet/IdP harness instead of replacing unavailable actions with mocks.

## Receipt

Copy `docs/release/acceptance.example.json` to `docs/release/acceptance.json`. For every one of the 109 SRS/TDR audit rows, supply actual PASS evidence, named reviewer and review date. Also complete `technicalClauses` for all 83 individual provisions; accepting a broad group does not accept its unchecked clauses. These are local audit IDs for unnumbered PDF provisions. `environments` must include `IONOS` and `OSC`. `artifacts` maps every path returned by `tools/release-artifacts.mjs` to its SHA-256, including source, distribution, participant service/record flow, charts, contracts, tests and build inputs. Copy the mapping from `docs/release/artifacts.json` for the exact unpacked candidate; regenerate it after any change. Each evidence entry has `id`, relative `path`, and `sha256`; each requirement or clause references the relevant evidence IDs. Store only sanitized evidence approved for the repository.

```bash
node tools/signoff-gate.mjs docs/release/acceptance.json
```

The gate validates completeness, file hashes and release identity. It cannot judge whether a reviewer actually performed the tests; human acceptance remains necessary. The supplied example deliberately fails. No missing item is automatically waived, including SHOULD requirements requiring a recorded client disposition. A candidate release can be built before final acceptance, but must not be labelled signed off.

The rc.3 [completion pack](completion.md) adds executable Mailpit registration/decision, real native two-profile/two-mode issuance, both JWT presentation profiles, history/principal association and revoke/block/unblock checks. Its software wallet is separate from the required PCM Mobile acceptance.

## rc.4 executable additions

`fresh-identity.feature` starts with empty browser contexts. Configure `freshLogins` with private credential-file paths and selectors for the actual Keycloak theme/Entra policy; the sample Entra selectors are placeholders. First-login fixtures exercise password replacement and TOTP registration. Passkey fixtures register a virtual authenticator and require a subsequent login that increments its signature counter. Physical-device/recovery acceptance remains separate. Run provider configuration before the corresponding fresh broker case.

`native-wallet.feature` covers W3C JWT, linked-data VC and both SD-JWT profiles with both signing modes. Supply a distinct published configuration for each case. Linked-data cases require the approved native TLS verifier and its private client trust paths. SD-JWT disclosures and signatures are independently checked; the JWT cases also exercise both implemented presentation protocols. VP format support remains explicitly JWT-only.

`pcm.feature` uses a real PCM Android app via W3C WebDriver/Appium UiAutomator2, with four cases covering two principals in each of two tenants. Set the installed package, dedicated device capabilities, import-confirmation selectors, expected synthetic display text and branding selectors. It opens the actual offer, checks screen bounds and confirms issuance/history for the principal. The device must be dedicated to synthetic acceptance. Appium server logs may contain deep links; keep them private and sanitize evidence. Driver reference: [official UiAutomator2 documentation](https://github.com/appium/appium-uiautomator2-driver).

Administration includes UI grant/revoke using the same principal session and participant-admin deletion. The deletion fixture requires `allowDestructiveAcceptance: true`, an explicitly disposable tenant, provider observation credentials, exact Kubernetes context and participant namespace. No scenarios are silently skipped because fixtures are absent: missing inputs fail acceptance setup.

`python3 tools/check-bdd-catalogue.py` checks authored step bindings only. It cannot establish that browser selectors, conditional access, native services or physical wallets work. Execute all scenario outlines in the official Executor environment and record their evidence against the candidate's hashes.

## rc.5 additional mandatory cases

- `firstLogin.keycloakAdmin` supplies a private read-only admin token, realm and
  exact user ID. The runner verifies UPDATE_PASSWORD/CONFIGURE_TOTP and absence
  of prior MFA before login, then verifies cleared actions and the actual new OTP
  credential. Reset the disposable account before each run; fixture markers alone
  are insufficient.
- `archive-published` is a disposable JWT configuration. The software wallet keeps
  the issued credential only in memory, archives the real published configuration,
  checks public withdrawal and presents that same credential using both VP profiles.
- `pcm-modification` modifies the actual configuration name, description and logo
  in the browser, publishes it and checks discovery before real PCM import. Supply
  `logoFile` and `pcm.brandingReferenceFile`, an approved expected crop for the exact
  dedicated device. The runner checks displayed text, screen bounds and logo pixels.
- Registration rejection must deliver the expected message to the exact registrant
  in Mailpit, not merely return a rejected API state.
- Execute `python3 test/live/semantic-validation.py` with the pinned CI dependencies;
  the Go participant tests compare the same JavaScript context fixture and verify
  real ES256 signatures plus tamper rejection. Run both before native LDP tests.
- Use the rc.5 upgrade procedure for trusted legacy baseline import, interrupted
  cleanup repair, owner TLS enrollment and private upstream build preparation.
