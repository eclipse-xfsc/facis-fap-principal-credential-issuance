# CI and release delivery

`ci.yml` runs Node tests, real PostgreSQL migration/concurrency checks, Go/Goa/protobuf generation, Go race/vet/build checks Helm lint/render and an isolated Chromium component/layout regression. It also calls the official XFSC Go test workflow. `docs.yml` builds searchable MkDocs documentation; a manually dispatched `publish=true` job can publish the reviewed result to GitHub Pages after the repository owner configures that environment. The default only builds.

`release.yml` is manual, requires a matching version tag, and calls the official XFSC Docker, Helm, Eclipse Dash and SBOM reusable workflows at commit `880a05d7832796e8ddf71fcde340ef65349f5db6`. Configure the repository's Harbor/IP credentials according to those workflows before running it. The IP workflow can submit Eclipse review requests. Running the release workflow publishes artifacts; writing these workflow files has not run it.

The pinned upstream Docker/Helm workflows themselves reference mutable nested `main` workflow/scripts; the Eclipse tool uses `LATEST`. Therefore the outer pin is not a complete supply-chain lock. Archive the resolved nested revisions, tool digests, generated Go dependency sums and image/chart/SBOM hashes for each run. Request an upstream immutable workflow change before claiming fully reproducible release provenance.

The official Go workflow can test domain code from a clean checkout. The local participant job additionally generates and compiles the transport entrypoint using `-tags=generated`; neither check substitutes for the other. Retain its generated-code/`go.sum` artifact and require review before the final tag.

`signoff.yml` and `tools/signoff-gate.mjs` separately validate completed evidence. Stable release tags also run this gate before publishing. Prerelease candidate publication does not imply acceptance. Final release review includes all 101 SRS rows, technical requirements, IONOS/OSC runs, dependency approvals, ECA, deployment-repository merges and the required issue/PR disposition.

AI assistance was used to implement this candidate, derive native adapters from official source, author tests and reconcile documentation. No autonomous production deployment, public contribution, historical commit reconstruction or human approval is claimed. Human code review, security/IP review and live acceptance remain recorded gates.
