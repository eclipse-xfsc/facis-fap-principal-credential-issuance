# Native OCM patch bundle

`manifest.json` targets the revisions selected by the supplied OCM-WStack ESB 12.3.9 assessment. The Crypto Provider row now requires commit `0d15633b2a5267a41a22f1baaabc74852d68a0ef`; there is **no fallback** to the older reviewed Crypto revision. That row uses exact Git-commit binding: the validation tool reads the matching committed source and computes original/result hashes when run against the supplied checkout. Retain the generated receipt with the component build.

The verifier supports reviewed-file hash binding for unchanged rows and exact Git-commit binding for the new Crypto row. The latter requires an owner-provided complete checkout at that exact HEAD, reads the committed file, rejects local edits, verifies the patch SHA-256 and requires zero-fuzz context matching in a temporary copy. It computes original/result hashes in the execution receipt. If patch context differs, stop for owner review/rebase; do not switch revisions or use fuzzy application.

[Recorded patch validation](../../../docs/release/upstream-validation.json) and [historical rc.5 byte evidence](../../../docs/release/upstream-validation-rc5.json) are separate. Run `python3 -B tools/check-upstream-patches.py --source-root /private/reviewed-upstream --report /private/patch-validation.json` from the PCI source root. It changes neither the source package nor upstream checkouts and does not compile or deploy components.

| Patch | Behavior |
|---|---|
| Issuer payload logging | Removes offer/token request/reply payloads from the observed NATS log statements |
| Signer payload logging | Removes complete signed-credential logging |
| Verifier payload logging | Removes observed presentation/payload logs and raw error response |
| Well-Known empty catalogue | Scans nullable left-joined credential timestamps as nullable values, so an issuer with no configured credentials can be read |

From the exact matching upstream checkout, compare the manifest commit and hashes, then use `git apply --check /absolute/path/to/selected.patch` before applying it. Do not use guessed offsets against another revision. Run service unit/integration tests, source review, dependency/IP checks and image build/scan; record the deployed digest. G0 never applies these patches or updates shared OCM images.

Only after the empty-catalogue fix is running, configure `PCI_OCM_EMPTY_CATALOGUE_SUPPORTED=true` before G0. PCI then permits empty publication and verifies read-back. Without that flag, the guard gives a conflict with a corrective action rather than reporting a false successful publication. Test initial issuer creation, no configurations, several configurations, final configuration withdrawal and restart/republication against the real PostgreSQL backend.

The three privacy patches address the listed statements, not every potential sink in the native stack. They do not remove the broad verifier's presentation storage/forwarding or add its missing formats. PCI's own VP endpoint avoids that persistent path by calling native TSA/status checks. Review all actually used paths and execute the supplied canary audit after success and failure. Existing stored/logged payloads need the owner's approved remediation and retention process.

This release supplies `tools/prepare-upstream-builds.py --source-root CHECKOUTS --output
PRIVATE --build`: current commit/bytes, private clone, patch verification, Go tests,
vet and build, with a hash-bound receipt. It never pushes, deploys or changes the
supplied checkout. Image packaging/scanning and runtime canaries run in the
component owner's approved pipeline. All four complete upstream checkouts must be supplied.
