# Executed checks and release documentation

Reviewed source: [`3fef8e3048f3`](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/commit/3fef8e3048f3803b8aecbd99f582a3c4c05295b0), application `0.5.0-rc.12`. Container distribution: `ecofacis/fap-pci:1.0.0`. Results below describe the identified source CI run; they do not relabel that run as a deployment test of the packaged image.

| Check | Executed result | Record |
|---|---|---|
| Node static, BDD-style and integration suites | 350 passed, zero failed or skipped | [CI run 38727256710](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/actions/runs/38727256710) |
| PostgreSQL | Schema reapplication, isolation and concurrent limits passed | CI `node` job |
| Go/Goa/protobuf participant | Generation, vet, race tests and server build passed | CI `participant` job |
| Official Go workflow | Passed | CI `official-go / test` job |
| Helm | Chart lint and template checks passed | CI `charts` job |
| Chromium | Component and layout checks passed at 1440 and 390 pixels | CI `browser` job |
| Semantic engines | JSON-LD and SHACL checks passed | CI `semantics` job |
| Dependencies | npm production dependency audit passed | CI `node` job |
| Documentation | Strict build and GitHub Pages publication passed on 18 October 2026 | [Documentation run 39127451730](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/actions/runs/39127451730) |

[validation.json](validation.json) records the 350-test result and generated distribution hashes from that CI execution. [ci-evidence.json](ci-evidence.json) lists job IDs and workflow outcomes. The 302-test [neutral report](neutral-validation.json) is a dated historical record, not the current test total.

## Test scope

Chromium executes the actual UI against local synthetic dependency fixtures. The deployed XFSC Executor pack uses authenticated sessions and live target services. Physical PCM, fresh identity, accessibility and cloud lifecycle scenarios use their corresponding target-specific procedures and receipts; a source CI result is not substituted for those results. See the [test strategy](../testing/test-strategy.md).

## Publication and release review

The searchable [documentation site](https://eclipse-xfsc.github.io/facis-fap-principal-credential-issuance/) was published by the linked Documentation run. These documentation changes receive their own build and publication when committed. The Docker Hub container and application version are described in [package 1.0.0](1.0.0.md).

FR-PCI-101 tracks the Eclipse Dash workflow separately: run `38727256204` has conclusion `failure`. It is recorded in the workflow evidence rather than being generalized into a claim that source CI or documentation publication failed.

Use the [implementation catalogue](requirement-audit.md), original [specifications](../specifications/README.md) and [deployment review procedure](../testing/live-acceptance.md) for release review. Historical authoring-environment limits are not current build-status statements.
