# Quality assurance commitments and their implementation

Each quality assurance commitment of LEANEA's tender and of the remediation plan of 30
October 2026, the CI job or record that implements it, and where the evidence for the
release candidate tag is found. The evidence column names the record; it is filled with
the run or document for `v0.5.0-rc.16` before the internal QA sign-off and is empty
until then.

| Commitment | Implementation | Evidence for the release candidate |
|---|---|---|
| Every change through a pull request from a fork, one concern per pull request | Branch protection of `main` through Otterdog; `docs/development/official-workflow.md`; `.github/PULL_REQUEST_TEMPLATE.md` | `pull-requests.json`: one entry per pull request with its commits and size |
| Human review by a named reviewer who is not the author, recorded on the pull request | Pull-request template (reviewer, review started and completed); branch protection requires an approving review and resolved conversations | Review record of each pull request (reviewer, start, end, approval) in `pull-requests.json`, filled from GitHub by `tools/record-pull-requests.mjs` |
| AI-generated material accepted only after human review, tests and scans; AI assistance disclosed | `Assisted-by:` trailer in commit messages; AI disclosure in the pull-request template; header disclosure for the files in `tools/licence-header-ai-files.txt` (`npm run check:headers`) | Record of AI assistance per pull request in the evidence package; `pull-requests.json` `aiAssistance` |
| Build, unit, component, integration and browser tests on every pull request | `ci` workflow: `quality`, `node`, `participant`, `browser`, `charts`, `official-go`, `semantics` jobs | `ci` workflow run on the tag |
| API contract and schema validation, semantic validation | `ci` workflow, `semantics` job; `tools/check-documentation.mjs` in `npm run test:offline` | `ci` workflow run on the tag |
| Helm lint and template validation; Kubernetes manifest schema check | `ci` workflow, `charts` job; `security-scans` workflow, `manifests` job (kubeconform) | Workflow runs on the tag |
| Go vet and race tests of the participant service | `ci` workflow, `participant` and `official-go` jobs | `ci` workflow run on the tag |
| Dependency and vulnerability scans of Node.js, Python and Go dependencies, failing on high or critical findings | `security-scans` workflow: `python-dependencies` (pip-audit), `go-dependencies` (govulncheck); npm audit in the `node` job | `security-scans` workflow run on the tag |
| Secret scanning | `security-scans` workflow, `secrets` job (gitleaks over the pull request range and the tree); GitHub push protection through Otterdog | `security-scans` workflow run on the tag |
| Source formatting and maintainability gate on every pull request | `ci` workflow, `quality` job: `format:check`, `check:headers`, `check-maintainability` with report artifact; `tools/maintainability-rules.json` with the exception list | `quality` job run and `maintainability.json` artifact on the tag; exception list in the rules file |
| Eclipse Dash licence check green; IP Team review for new or unvetted content | `eclipse-dash` workflow with `test/bdd/constraints.txt`; IPLab requests filed by the committer | `eclipse-dash` run on the tag; IPLab request references and status |
| Eclipse Contributor Agreement validation | ECA check on every pull request (Eclipse Foundation app) | ECA status on each pull request |
| Reproducible images from the tagged source, scanned, with SBOMs | `Images` workflow: base digest verified, application and participant images built, Trivy scan compared with the base (`tools/check-image-scan.mjs`), syft SBOMs, start-up check, publication through `eclipse-xfsc/dev-ops` | `Images` workflow run on the tag: image digests, `scan-*.json`, `sbom-*.cdx.json`, `startup-check.log` |
| SBOMs of the Node.js, Python and Go dependencies for every release candidate | `release-sbom`, `release-python-sbom`, `release-go-sbom`, `release-container-sbom` workflows | Release assets of `v0.5.0-rc.16` |
| Deployed tests on both clusters: BDD Executor suite including the FR-PCI-61 UX scenarios, end-to-end, Helm lifecycle, security checks | `scripts/run-ux-bdd.py` and `docs/testing/ux-bdd-runbook.md`; `docs/testing/live-acceptance.md`; `scripts/lifecycle.py` | Test report of work package R5 with source revision and image digests; `docs/testing/evidence/fr61-ux-summary.json` |
| Requirement traceability with reassessed statuses and agreed deviations | `tools/build-requirement-test-matrix.mjs` from `docs/requirements/requirements.json`, `requirement-deviations.json` and `pull-requests.json` | `requirement-test-matrix.md` with the evidence column filled; written agreement of the principal for deviations |
| Backup before upgrade; rollback procedure | `docs/operations/backup-rollback.md` | Backup record of the QA deployments before the release candidate upgrade |
| Release records generated from the runs of the release candidate tag | `tools/refresh-release-inventory.mjs`; release workflows on the tag | `artifacts.json`, `source-sha256.txt` and the workflow artifacts of the tag |
| Internal QA sign-off before the resubmission | Sign-off by the Technical Team Leader on the evidence package | Signed record in the evidence package |
