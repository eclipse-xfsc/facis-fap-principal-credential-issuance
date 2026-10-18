# Source and container provenance

| Release unit | Identity |
|---|---|
| Reviewed repository | `https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance` |
| Reviewed source commit | `3fef8e3048f3803b8aecbd99f582a3c4c05295b0` |
| Application source version | `0.5.0-rc.12` |
| Docker Hub package | `ecofacis/fap-pci:1.0.0` |
| ORCE packaging base | `ecofacis/xfsc-orce:2.0.15` |

The [container procedure](operations/container-image.md) captures the ORCE filesystem and explicitly embeds `/data`. A registry digest is recorded by the release/deployment operator. Source commit, image digest and runtime application version identify different inputs; matching version text alone does not prove image contents.

The application remains one ORCE runtime with one Vue/uibuilder UI. G0 prepares the PCI infrastructure profile, native OCM contracts identify shared dependencies, and the Go/Goa participant is a separate service. Original normative PDFs and their hashes are retained in [specifications](specifications/README.md). Native source pins and contract assessments are maintained under `contracts/`.

[CI evidence](release/ci-evidence.json) identifies the successful source and documentation runs reviewed on 18 October 2026. The current [validation report](release/validation.json) includes 350 passing Node tests and separate CI jobs. The 302-test neutral-source report and [earlier input records](release/source-history.md) are historical records.

[artifacts.json](release/artifacts.json) binds runtime, deployment, contracts, build inputs and documentation; [source-sha256.txt](release/source-sha256.txt) inventories the shipped tree. After independently prepared changes are merged, run `node tools/refresh-release-inventory.mjs` from the complete repository root to regenerate both for that exact checkout. Git commit IDs are assigned when the documentation update is committed, so baseline CI links identify the reviewed application source rather than a future documentation commit.

Public examples use neutral identities and placeholder target values. Private credentials, deployment copies and dependency caches are outside the documentation package. Source implementation, code review, test execution and release decisions retain their separate records.
