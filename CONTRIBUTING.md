# Contributing

Contributions reach this repository as pull requests from a public fork, reviewed by a
named reviewer and merged by an Eclipse committer. The process, the required checks
and the intellectual-property steps are described in the
[contribution and review workflow](docs/development/official-workflow.md); the
module boundaries, the build and the source gates in the
[maintainer guide](docs/development/maintainer-guide.md).

## Before you start

1. Sign the Eclipse Contributor Agreement with the Eclipse Foundation account whose
   e-mail address you commit with.
2. Open or pick the issue that names the requirement or finding you address.
3. Fork the repository and create the branch for that issue.

## Before you open the pull request for review

Run the local checks:

```bash
npm ci
python3 -m pip install -r test/bdd/requirements.txt -c test/bdd/constraints.txt
npm run format:check
npm run check:maintainability
npm run test:offline
```

Pull request workflows run automated source checks, Go/Goa/protobuf
generation and tests, Helm lint/render and manifest schema checks, PostgreSQL
server tests, semantic validation, and browser DOM/component fixture regressions;
see the [test strategy](docs/testing/test-strategy.md) and [CI](docs/ci-cd.md).

Deployed Kubernetes integration/lifecycle tests and XFSC BDD Executor acceptance/UX
scenarios are executed separately during R5 on the designated installations.
Their results are recorded using the
[live acceptance procedure](docs/testing/live-acceptance.md) and the
[deployed UX tests](docs/testing/ux-bdd-runbook.md).

## Coding rules

- Node.js logic runs inside ORCE; validate JSON domain boundaries and use structured
  errors. UI source is HTML/JavaScript/Vue. The participant backend uses Go/Goa.
- Tenant-owned repository methods must require tenant identity; never use an unscoped
  object lookup for tenant-owned state.
- Source files carry the copyright statement and `SPDX-License-Identifier: Apache-2.0`;
  third-party files keep their own notices.
- Authored JavaScript passes `npm run format:check` and `npm run check:maintainability`;
  a new exception in `tools/maintainability-rules.json` names its reason and the issue
  that removes it.
- Go code must pass `gofmt`, `go test` and `go vet`.
- Shell scripts use `set -euo pipefail`, validate all parameters and never echo secrets.
- Helm resources are declarative, owner-labelled and parameterised.
- Pin direct dependencies, runtime image versions and workflow references. Record
  resolved image digests and nested workflow versions before a release; an outer
  workflow pin does not make mutable upstream inputs immutable.
- Do not log tokens, verification links, credentials, kubeconfigs, private keys,
  credential payloads or participant data.
- Follow the [lifecycle ownership contract](docs/operations/automation.md): preserve
  data volumes and unrelated operator changes; refuse conflicting ownership or stale
  versions.
- Generated files (`dist/`, `docs/api/*.json`, `docs/release/*.json`,
  `docs/requirements/*.md`) are produced by the build and committed with the change
  that caused them; they are not edited by hand.

## Pull-request contents

A pull request includes the requirement or issue mapping, the tests that demonstrate
the change, sanitised output where a run is part of the evidence, changed
compatibility entries, the security and privacy impact, and migration and rollback
notes when state or deployment behaviour changes. The pull-request template asks for
the author, the AI disclosure and the named reviewer.

## Release and reporting

Releases are release candidate tags with a GitHub pre-release, created by a committer
from `main` after the release pull request (version files, charts, API documents,
integration lock, release inventory) has been reviewed and merged. A pre-release is
not a contractual acceptance. Documentation, charts, images, SBOMs and test reports
accompany each release.

Report problems in mandated shared components (OCM, TSA, ORCE core, the deployment
repository) in writing with the exact source or image revision, impact, safe
reproduction and proposed fix; changing those components follows their owners'
change process. Use the issue tracker of this repository for non-sensitive reports
and [SECURITY.md](SECURITY.md) for security reports.
