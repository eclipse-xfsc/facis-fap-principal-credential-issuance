# Contributing

This source candidate is prepared for contribution through the client-designated Eclipse/XFSC repository. No online repository was changed while producing it. Do not create a parallel private repository. Daily delivery, contributor onboarding and approval records must be recorded by the actual project participants; this package cannot reconstruct them retrospectively.

## Required workflow before contribution

1. Synchronize the live `eclipse-xfsc/deployment` authority and re-resolve whether `k8s-bootstrap` or `main` is authoritative.
2. Create a requirement-linked issue and feature branch in the client-designated repository.
3. Preserve the boundary between PCI source, deployment integration, and upstream component source.
4. Run `npm ci` and `npm run test:offline`, the Go/Goa/protobuf gate, Helm rendering, PostgreSQL and browser checks, Kubernetes integration tests, and relevant BDD scenarios. See [test strategy](docs/testing/test-strategy.md) and [CI](docs/ci-cd.md).
5. Generate and review the complete dependency lock, SBOM, vulnerability scans, and Eclipse IP scan.
6. Commit with the Eclipse Contributor Agreement/sign-off process required by the target project.
7. Obtain review before changing any OCM, TSA, ORCE core, or deployment-repository behavior.

## Coding rules

- Node.js logic runs inside ORCE; validate JSON domain boundaries and use structured errors. UI source is HTML/JavaScript/Vue. The participant backend uses Go/Goa.
- Tenant-owned repository methods must require tenant identity; never use an unscoped object lookup for tenant-owned state.
- Go code must pass `gofmt`, `go test`, and `go vet`.
- Shell scripts use `set -euo pipefail`, validate all parameters, and never echo secrets.
- Helm resources are declarative, owner-labelled, and parameterized.
- Pin direct dependencies, runtime image versions and workflow references. Record resolved image digests and nested workflow versions before public release; an outer workflow pin does not make mutable upstream inputs immutable.
- Do not log tokens, verification links, credentials, kubeconfigs, private keys, credential payloads, or participant data.
- Follow the supplied [lifecycle ownership contract](docs/operations/automation.md). Preserve data volumes and unrelated operator changes; refuse conflicting ownership or stale versions.

## Pull-request evidence

A change should include requirement mapping, unit/contract/integration evidence, sanitized output, changed compatibility entries, security/privacy impact, and migration/rollback notes when state or deployment behavior changes.

## Release and reporting

Use requirement-linked feature branches, reviewed merges and the project's approved GitFlow/release policy. Update the version, regenerate distribution files and examples, refresh the requirement ledger and artifact hashes, and obtain the required evidence before the final tag. Do not publish a prerelease as contractual acceptance. Documentation, charts, participant image and BDD reports accompany each approved release.

Report mandated-component problems in writing to the client with the exact source/image revision, impact, safe reproduction and proposed fix. The included upstream patch proposals are for owner review; changing shared OCM/TSA/ORCE components requires the established change-request process. Use the designated repository's issue tracker for non-sensitive reports, and [SECURITY.md](SECURITY.md) for security reporting. The client must confirm the responsible maintainer/contact and finalize the code of conduct before public delivery.
