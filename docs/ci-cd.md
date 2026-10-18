# CI and release delivery

## Verified workflow results

For source commit `3fef8e3048f3`, [CI run 38727256710](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/actions/runs/38727256710) completed successfully. Its Node, PostgreSQL, participant Go/Goa/protobuf, official Go, Helm, Chromium and semantic checks passed. The offline Node total was 350 passed with zero failed or skipped. The [Documentation run 39127451730](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/actions/runs/39127451730) completed its strict build and Pages publication on 18 October 2026. Exact job IDs and outcomes are in [ci-evidence.json](release/ci-evidence.json).

Eclipse Dash is an independent workflow. Run `38727256204` concluded `failure`; FR-PCI-101 tracks that workflow result. CI build success, dependency-audit success and Dash review are distinct records.

## Reproduce source and browser checks

`ci.yml` runs the offline suite, actual PostgreSQL migration/concurrency checks, Go/Goa/protobuf generation and race/vet/build checks, Helm lint/render, the official XFSC Go workflow, Chromium component/layout checks and semantic engines. The browser job installs its pinned Playwright package and Chromium. Deployment-specific browser sessions are used by the separate XFSC Executor pack, not by the offline browser job.

## Documentation publication

`docs.yml` runs `mkdocs build --strict` and preserves the generated site artifact on pushes and pull requests. To publish an updated site, dispatch **Documentation** on the committed branch with `publish=true`. Its `publish` job deploys the built Pages artifact. Build and publication results identify the exact documentation revision.

## Container and release workflows

The Docker Hub distribution is [`ecofacis/fap-pci:1.0.0`](https://hub.docker.com/r/ecofacis/fap-pci). The [container guide](operations/container-image.md) records the ORCE base, explicit `/data` embedding and digest-capture commands. `release.yml` provides the separate tagged Docker/Helm/IP/SBOM workflow and uses official XFSC reusable workflows pinned at `880a05d7832796e8ddf71fcde340ef65349f5db6`. Supply the selected registry credentials through repository secrets when using that workflow.

Record nested workflow revisions, tool versions, generated Go dependency sums and image/chart/SBOM hashes with each release. The outer workflow pin and container tag do not by themselves identify every nested input. The participant CI artifact preserves generated code and its resolved `go.sum`.

## Review records

`signoff.yml` and `tools/signoff-gate.mjs` validate a completed review receipt against the artifact inventory. The [receipt procedure](testing/live-acceptance.md#receipt) identifies the required fields, evidence references, environments and hashes. Automated checks validate the supplied record; reviewer decisions and external release approvals are recorded by the responsible project roles.

AI assistance contributed to source implementation, tests and documentation. Use the normal project code, security and IP review process for changes. The [source baseline](source-baseline.md) and validation records identify technical provenance without assigning personal identities in public examples.
