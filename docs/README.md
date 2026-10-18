# FAP PCI documentation

This documentation covers the `ecofacis/fap-pci:1.0.0` container package and the `0.5.0-rc.12` application source. The container uses the ORCE 2.0.15 base and embeds the PCI `/data` contents. [Container use](operations/container-image.md) explains image retrieval, digest recording and persistent-volume behavior.

## Start here

1. [Deployment and upgrade](operations/deployment.md), [container image](operations/container-image.md), and [non-interactive lifecycle](operations/automation.md).
2. [Issuer configuration](operations/issuer-runbook.md), [identity](operations/identity.md), and [participant setup](testing/participant-test.md).
3. [Operations](operations/runbook.md), [transport](operations/transport.md), and [telemetry](operations/observability.md).
4. [Test strategy](testing/test-strategy.md), [test walkthrough](testing/acceptance-walkthrough.md), and [deployment review procedure](testing/live-acceptance.md).

## Design and contracts

[Architecture](architecture/architecture.md), [issuer management](architecture/issuer-management.md), [native OCM](contracts/native-ocm.md), [participant protocol](contracts/participant-protocol.md), [presentation](contracts/presentation.md), [semantic templates](contracts/semantic-templates.md), [API](api/README.md), and [product documentation](product.adoc).

## Releases and verification

[Container package 1.0.0](release/1.0.0.md), [application change record](release/0.5.0-rc.12.md), [executed CI checks](release/completion.md), [source provenance](source-baseline.md), and [compatibility](compatibility/compatibility-matrix.md).

CI for the reviewed source passed 350 Node tests and its PostgreSQL, participant, chart, browser, semantics and official Go jobs. The Documentation workflow built and published the searchable site on 18 October 2026. [Workflow evidence](release/ci-evidence.json) records exact runs and outcomes, including the independently tracked Eclipse Dash result.

## Requirements and operating scope

[SRS traceability](requirements/traceability.md), [technical clauses](requirements/technical-clauses.md), [implementation catalogue](release/requirement-audit.md), [operating profiles](known-gaps.md), [privacy](privacy/data-handling.md), and [standards roadmap](security/compliance-roadmap.md).

Deployment examples use neutral values. Supply target-specific hostnames, UUIDs, certificates and private credentials as described in [neutral configuration](operations/neutral-configuration.md). Historical release reports are dated records; current build results are in [validation.json](release/validation.json).
