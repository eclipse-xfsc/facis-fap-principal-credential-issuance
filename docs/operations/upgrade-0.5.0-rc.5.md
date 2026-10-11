# Upgrade rc.3/rc.4 to rc.5

Preserve the database, original-ORCE snapshot, runtime Secrets, PVCs and participant
trust. Use the same explicit kubeconfig/context/namespace and lifecycle inputs.
Do not replace production state with synthetic acceptance fixtures.

1. Execute the shipped CI build/check jobs, including the Go/Goa/protobuf signer,
   independent JSON-LD/SHACL job, PostgreSQL migrations and charts. They are
   required validation, not an optional substitute for the local Node checks.
2. For legacy helper overrides, assemble a private trusted baseline using the
   original pre-helper Deployment snapshot and operator change records. Run
   `scripts/import-legacy-baseline.py --context CONTEXT --kubeconfig FILE
   --baseline BASELINE.json` to validate, then repeat with `--apply`. Alternatively
   set `legacyBaselineFile` in the lifecycle JSON; deploy/upgrade/uninstall imports
   it before proceeding. Each named field contains explicit `before` and `applied`
   values; `before: null` explicitly means absent. The tool checks deployment UID,
   exact live applied values and resourceVersion. Missing historical values cannot
   be recovered by guessing. Preserve the private baseline for the uninstall test.
3. Install the approved mesh revision with the supplied [TLS overlay](../../deployment/prerequisites/all-hop-tls/README.md).
   Set `PCI_MESH_REVISION` during G0 for managed workloads and bootstrap jobs;
   use the UID-bound inventory renderer to enroll ORCE, Gateway and shared stack.
   Record the owner change approval and actual TLS validation. The compatibility
   deployment without this profile does not meet the all-hop clause.
4. Run the normal lifecycle upgrade. The additive SQL migration marks existing
   active LDP catalogues pending exactly once. Wallet discovery refuses stale
   configuration definitions until native read-back matches. An empty catalogue
   is immediately visible publicly even when upstream publication is blocked.
5. Rebuild/redeploy reference participant images with the Core gRPC TLS settings
   for every participant-signed format. Remove rc.4 `--ldp-*`/`ldpSigner` settings.
   rc.5 uses offline JSON-LD normalization and Core `Sign` for JWS2020. New LDP
   claims are under `credentialSubject.pciClaims`, matching metadata and SHACL;
   subjects without an absolute IRI use `urn:xfsc:pci:subject:` plus URI encoding.
   JWT and SD-JWT claim structures are unchanged. Update consumer fixtures for
   this declared LDP structure and execute both signing paths against PCM/TSA.
6. Rerun the participant helper with its original IDs. It records cleanup intent
   before creating RBAC. For an interrupted helper that never created its binding,
   run `scripts/reconcile-participant-ownership.py --context CONTEXT --kubeconfig
   FILE --pci-namespace NAMESPACE --tenant-id UUID`, review its exact targets,
   then repeat with `--apply` and retry deletion. Foreign or replaced ownership
   fails closed. Never erase the registry to suppress a cleanup error.
7. Use `tools/prepare-upstream-builds.py --source-root CHECKOUTS --output PRIVATE
   --build` to create/test private patched copies of the four exact pinned native
   revisions. The owner reviews/builds/scans/deploys images through the established
   process. After Well-Known's empty-catalogue patch is running, set
   `PCI_OCM_EMPTY_CATALOGUE_SUPPORTED=true` and execute final-archive/restart tests.
8. Run the full [acceptance procedure](../testing/live-acceptance.md), including
   edited configuration/logo in PCM, archived published configuration verification,
   rejection-email delivery, real first-login required actions, crash recovery,
   deletion/uninstall/restore and successful/failed privacy canaries. Attach actual
   evidence to the receipt and run `node tools/signoff-gate.mjs RECEIPT.json`.

The package deliberately has no signed acceptance receipt. A source ZIP cannot
supply cluster credentials, reconstruct absent historical records, approve shared
component changes, or manufacture formal/public delivery evidence.
