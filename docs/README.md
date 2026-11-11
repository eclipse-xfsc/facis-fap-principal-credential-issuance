# FAP PCI documentation

This documentation covers the `0.5.0-rc.16` application source and its application image, built from the tagged source on the ORCE 2.0.15 base image ([deploying the application image](operations/deployment.md#deploying-the-application-image)), and the earlier `ecofacis/fap-pci:1.0.0` container package, which embedded a captured `/data` and is superseded ([container image](operations/container-image.md)).

## Start here

1. [Deployment and upgrade](operations/deployment.md), [container image](operations/container-image.md), and [non-interactive lifecycle](operations/automation.md).
2. [Issuer configuration](operations/issuer-runbook.md), [identity](operations/identity.md), and [participant setup](testing/participant-test.md).
3. [Operations](operations/runbook.md), [transport](operations/transport.md), and [telemetry](operations/observability.md).
4. [Test strategy](testing/test-strategy.md), [test walkthrough](testing/acceptance-walkthrough.md), and [deployment review procedure](testing/live-acceptance.md).

## Design and contracts

[Architecture](architecture/architecture.md), [issuer management](architecture/issuer-management.md), [native OCM](contracts/native-ocm.md), [participant protocol](contracts/participant-protocol.md), [presentation](contracts/presentation.md), [semantic templates](contracts/semantic-templates.md), [API](api/README.md), and [product documentation](product.adoc).

## Releases and verification

[Release candidate rc.16](release/0.5.0-rc.16.md), [acceptance gates](release/acceptance-gates.md), [requirement-to-test matrix](release/requirement-test-matrix.md), [container package 1.0.0](release/1.0.0.md), [application change record rc.12](release/0.5.0-rc.12.md), [executed CI checks](release/completion.md), [source provenance](source-baseline.md), and [compatibility](compatibility/compatibility-matrix.md).

The CI results recorded in [executed checks](release/completion.md) and [workflow evidence](release/ci-evidence.json) belong to the commits they name. The checks of the current source run on every pull request and on the release candidate tag; the gates without a result for the current source are listed in the acceptance gates.

## Requirements and operating scope

[SRS traceability](requirements/traceability.md), [technical clauses](requirements/technical-clauses.md), [implementation catalogue](release/requirement-audit.md), [operating profiles](known-gaps.md), [privacy](privacy/data-handling.md), and [standards roadmap](security/compliance-roadmap.md).

Deployment examples use neutral values. Supply target-specific hostnames, UUIDs, certificates and private credentials as described in [neutral configuration](operations/neutral-configuration.md). Historical release reports are dated records; current build results are in [validation.json](release/validation.json).
