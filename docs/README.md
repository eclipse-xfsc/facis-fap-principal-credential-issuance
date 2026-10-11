# Current release: 0.5.0-rc.12

PCI now decodes the native signer’s single-key JWK array and selects the configured key by algorithm before verifying the credential. This fixes the live credential-completion Algorithm/key mismatch failure. Earlier public JWKS, discovery, VM, metadata and Bash installer fixes are retained. See [release/0.5.0-rc.12.md](release/0.5.0-rc.12.md).

# PCI documentation

Version **0.5.0-rc.12** targets the supplied OCM ESB **12.3.9**. It remains an integration candidate pending the [known gaps](known-gaps.md) and [acceptance evidence](testing/live-acceptance.md).

This neutral revision removes operator-specific identities and deployment values. Read [neutral configuration](operations/neutral-configuration.md) before using command examples and [revision validation](release/neutral-validation.json) for checks executed against this package.

1. [Upgrade an already prepared instance to rc.12](operations/upgrade-0.5.0-rc.12.md), or use [deployment](operations/deployment.md) and [initial rc.6 setup](operations/deploy-0.5.0-rc.6.md) for a fresh instance.
2. [Configure tenant, keys, connector and issuer](operations/issuer-runbook.md).
3. [Connect Keycloak or Entra](operations/identity.md).
4. [Deploy the participant test source](testing/participant-test.md) and follow the [ordered acceptance walkthrough](testing/acceptance-walkthrough.md).
5. [Operate, recover and uninstall](operations/runbook.md).

Design and contracts: [architecture](architecture/architecture.md), [issuer management](architecture/issuer-management.md), [native OCM](contracts/native-ocm.md), [participant protocol](contracts/participant-protocol.md), [API](api/README.md).

Release review: [requirements](requirements/traceability.md), [CI](ci-cd.md), [privacy](privacy/data-handling.md), [compliance roadmap](security/compliance-roadmap.md), [source provenance](source-baseline.md).

New in rc.3: [non-interactive automation](operations/automation.md), [TLS profiles](operations/transport.md), [presentation contracts](contracts/presentation.md), [completion tests](testing/completion.md), [original specifications](specifications/README.md), and [product documentation](product.adoc).

The source also includes [per-configuration semantic exports](contracts/semantic-templates.md), [83 individual technical clauses](requirements/technical-clauses.md) and an [ArgoCD participant handoff](operations/argocd.md).
