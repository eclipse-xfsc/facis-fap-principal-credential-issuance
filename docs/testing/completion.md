# Release completion tests

All fixtures must be synthetic. Keep browser sessions, TLS keys, participant data and capture files outside the source/evidence repository. The release evidence distinguishes an authored test from an executed pass.

## Offline and CI

```bash
npm ci
python3 -m pip install PyYAML==6.0.2
npm run test:offline
```

The Node suites cover domain behavior, request/response contracts, real local TLS/mTLS/NATS handshakes, proof crypto, presentation profiles, privacy boundaries, installer ownership and non-interactive automation. The fixture store does not certify PostgreSQL behavior. CI separately runs `test/live/postgres.test.mjs` against PostgreSQL, including additive schema reapplication, immutable versions, history/principal joins and tenant isolation. It also compiles/vets/race-tests generated Go/Goa transport, renders all Helm charts and runs the browser harness.

`test/browser/runtime.mjs` starts an isolated local Vue application and fixture HTTP backend. Its desktop/mobile checks exercise the tenant-settings layout, overflow, typed validation, persistent/dismissible errors and presentation panel. It needs the pinned Playwright package plus its Chromium binary. The `.github/workflows/ci.yml` browser job installs both. It is a component regression, not the live BDD/IdP/OCM test.

## Deployed Executor pack

Install `test/bdd/requirements.txt` and Chromium in a private environment as described in [live acceptance](live-acceptance.md). Copy `test/bdd/environment.example.json` outside the repository. Capture provider, Alpha/Beta admin and Alpha/Beta principal browser sessions with real login; MFA/passkeys are completed by the operator.

Prepare four published **JWT W3C** configurations with no unpublished edits:

| Case | Tenant/principal | VCI profile | Signing |
|---|---|---|---|
| `draft13-internal` | Alpha | Draft 13 | OCM internal |
| `draft13-participant` | Alpha | Draft 13 | Participant Core |
| `final-internal` | Beta | 1.0 | OCM internal |
| `final-participant` | Beta | 1.0 | Participant Core |

Each needs valid metadata, preauth/issuer keys, an enabled participant connection, a published journey and matching synthetic records. Set the real configuration IDs, `session`, `adminSession`, signing mode and any survey answers in `nativeCases`. The step validates the published profile/mode before issuing. Do not use an earlier revoked principal/configuration pair unless explicitly unblocked through the admin UI.

```bash
export PCI_BDD_CONFIG=/private/pci-environment.json
export PCI_BDD_ALLOW_MUTATIONS=1
/private/pci-bdd/bin/behave test/bdd/features --tags=runtime --junit --junit-directory /private/evidence/runtime
/private/pci-bdd/bin/behave test/bdd/features --tags=native --junit --junit-directory /private/evidence/native
```

The native cases request an offer, exchange its preauthorized code, prove an ephemeral holder key, receive/verify a credential through the real native services, present it using both VP profiles, check history/principal metadata, revoke it, confirm reissuance is blocked, explicitly unblock and start a new request. Tokens, raw credentials and claims remain in process memory. The new request is allowed to expire; no second credential is silently created.

The registration pack verifies Mailpit email and provider rejection/approval with fresh synthetic organizations. The lifecycle pack requires a dedicated disposable target, `PCI_BDD_ALLOW_LIFECYCLE=1`, `g0ArgsFile` and `lifecycleConfigFile` pointing to the same explicit kubeconfig/context/namespace. It runs deploy/upgrade through the release runner and uninstall. All tests that mutate data are opt-in through their tags and environment setup.

## Deployment and privacy evidence

Capture workload identities without reading Secrets:

```bash
python3 scripts/collect-evidence.py \
  --kubeconfig /private/kubeconfig --context cluster-admin@ocm-cr \
  --namespace xfsc-orce-pci-orce --output /private/evidence/inventory.json
```

For privacy, put unique synthetic claim canaries (16–512 bytes per line) in `/private/canaries.txt`. Exercise successful and failed issuance in both signing modes. Privately export searchable text from all required categories. NATS evidence must include stream configuration and any message stores, not just server logs. Database/backup exports must include the relevant PCI, OCM and participant stores. The investigator must establish capture completeness and time coverage.

```json
[
  {"category":"pci-logs","paths":["/private/captures/pci.txt"]},
  {"category":"ocm-logs","paths":["/private/captures/ocm.txt"]},
  {"category":"database","paths":["/private/captures/database.txt"]},
  {"category":"nats","paths":["/private/captures/nats.txt"]},
  {"category":"orce-context","paths":["/private/captures/context.txt"]},
  {"category":"traces","paths":["/private/captures/traces.txt"]},
  {"category":"backups","paths":["/private/captures/backups.txt"]}
]
```

```bash
python3 scripts/privacy-audit.py --canary-file /private/canaries.txt \
  --manifest /private/capture-manifest.json > /private/evidence/privacy-result.json
```

The scanner checks literal, JSON-escaped and base64 forms, including buffer boundaries. Missing captures are `INCOMPLETE`; matches are `FAIL`. It prints hashes/status, never matching data. `NO_CANARY_MATCH` applies only to submitted captures and cannot certify GDPR compliance. Encrypted/compressed files must first be exported privately in searchable form.

PCM Mobile, fresh identity, accessibility, transport, capacity, backup/restore and cloud scenarios each identify their target environment and test scope. The [review receipt](live-acceptance.md#receipt) links their records to the selected source and image digests. Current automated source results are recorded in [completion](../release/completion.md).
