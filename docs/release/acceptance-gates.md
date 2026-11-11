# Acceptance gates

This page lists the gates that stand between the current source and an accepted
release, with the evidence each one needs and where that evidence is recorded once it
exists. A gate is closed only by a recorded result for the current source; a result
for an earlier commit, however favourable, does not close it. The status column is
updated in the pull request that records the evidence.

| Gate | Evidence required | Record | Status |
|---|---|---|---|
| Human code review | Every pull request since the baseline reviewed and approved by a named reviewer who is not its author, with the review recorded on the pull request | pull requests of this repository | open |
| CI on the current source | All workflows under `.github/workflows/` green on `main` for the commit under review | workflow runs linked from `ci-evidence.json` | open |
| Licence check | Eclipse Dash green for the Node.js, Python and Go dependency sets; IP Team request filed for every dependency without vetted licence data | `eclipse-dash` workflow run; IPLab request references in the pull request | open |
| Dependency and secret scans | `security-scans` workflow green: pip-audit, govulncheck, gitleaks over the pull request range and the tree, kubeconform over the rendered charts | `security-scans` workflow run | open |
| Source gates | `format:check` and `check:maintainability` green with no exception left in `tools/maintainability-rules.json` for `src/` | `ci` workflow, `quality` job | open |
| Participant service | Go 1.25 build, protobuf generation, vet and race tests in CI | `ci` workflow, `participant` job | open |
| PostgreSQL | Migration, isolation and concurrency tests against a server in CI | `ci` workflow, `node` job | open |
| Helm and Kubernetes | Chart lint and template validation, manifest schema check, lifecycle run in the designated environments | `ci` workflow, `charts` job; `security-scans`, `manifests` job; deployment records | open |
| Reproducible image | Application and participant images built by the `Images` workflow from the tagged commit on the base image recorded by digest, with SBOM, scan and start-up check; digests recorded with the deployment | `image` workflow run; `deployment/image/base-image.lock`; `docs/release/artifacts.json` | open |
| Native issuance and revocation | Issuance, presentation and revocation against the pinned OCM/TSA and participant services, including signed status retrieval, with the wallet | live acceptance receipts (`docs/testing/live-acceptance.md`) | open |
| Browser | DOM fixture and component regressions in CI; the deployed XFSC BDD Executor run (`@pci-ux`, twelve scenarios) on both installations with its summary committed | `ci` workflow, `browser` job; `docs/testing/evidence/fr61-ux-summary.json` | open |
| Documentation | Strict MkDocs build and publication for the current source | `docs` workflow run | open |
| Requirements | Each of the 101 SRS requirements and 83 technical clauses with a reassessed status for the current source, linked to its executed evidence; deviations from MUST requirements agreed in writing with the principal | `docs/requirements/requirements.json`, `docs/release/acceptance-gap-register.json`, requirement-to-test matrix | open |

## Requirement statuses

`docs/requirements/requirements.json` carries every requirement with its
implementation references, its verification procedure and two status fields:
`status`, which is `NOT_REASSESSED_FOR_ACCEPTANCE` until the requirement is
reassessed for the current source, and `historicalLabels`, which keeps the labels of
the baseline commit `2fa3a8af`. The two status declarations of October 2026 (78 Done,
13 Partial, 5 Not met and 5 Not verified on 17 October; 101 Done on 18 October) are
kept in `docs/release/acceptance-gap-register.json` with the concern recorded for each
of the 23 requirements that were not Done on 17 October. They are historical
declarations, not results for the current source, and the register does not choose
between them. Each of the 23 is reassessed against the current source, and the result
replaces `NOT_REASSESSED_FOR_ACCEPTANCE` in the catalogue with `EVIDENCE_LINKED`,
`PARTIAL` or `GAP` and a link to the evidence.

## What this page does not do

It does not relabel a historical result as current, does not count a fixture test as
a deployed result, and does not record an approval, review or run that has not taken
place. The CI results of commit `3fef8e3048f3` in `completion.md` and
`ci-evidence.json` belong to that commit.
