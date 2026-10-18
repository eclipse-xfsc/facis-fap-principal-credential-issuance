# EUDI / ARF / ETSI modification roadmap

Review baseline: 5 October 2026. This is an engineering estimate, not a conformity assessment or legal opinion. Scope and estimates must be reviewed against the selected attestation category and deployment before approval. Effort below is person-weeks for one experienced engineer, excluding certification lead times; ranges overlap where work can proceed independently.

Primary baselines:

- [EUDI ARF maintainer source](https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework): freeze a retrievable revision and applicable implementing regulations with the compliance owner. The previously referenced v3.0.0 release page could not be retrieved during this review; its date and contents are not used as verified evidence here.
- [ETSI TS 119 472-1 v1.2.1](https://www.etsi.org/deliver/etsi_ts/119400_119499/11947201/01.02.01_60/ts_11947201v010201p.pdf): attestation semantics, issuer identification, schemas and category-specific profiles.
- [ETSI TS 119 471 v1.1.1](https://www.etsi.org/deliver/etsi_ts/119400_119499/119471/01.01.01_60/ts_119471v010101p.pdf): provider policy/security obligations. Applicability depends on the service category; source code is only one part of the assessment.
- [W3C VC Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/), [OID4VCI 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html), and [OID4VP 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html): protocol/data-format baselines; protocol/data-format support is assessed against the selected profile.

| Component | Current scope | Profile-specific engineering and review | Owner | Estimate |
|---|---|---|---|---|
| Requirements/profile selection | Service category, rulebook and certification scope selected for the target profile | Freeze issuer/attestation category; map each applicable normative clause and evidence owner | Client/compliance + architect | 1–2 |
| Go format library | Reusable JWT/SD-JWT package and profile-specific semantics | Review the reusable package; add VCDM 2.0, EAA schemas, JSON-LD contexts/SHACL, fixtures and Apache-compatible contribution | PCI/participant + XFSC maintainers | 4–8 |
| OCM issuer/Well-Known | Native issuance wrappers and profile-specific protocol review | Profile metadata, proof algorithms, nonce/errors, attestation/issuer authentication, algorithm negotiation, negative fixtures | OCM + PCI | 3–6 |
| OCM verifier | Shared verifier format/profile selection and presentation-retention policy | Implement required presentation protocols/DCQL/response protection, nonce/audience binding, constrained disclosure and approved transient handling | OCM verifier maintainers | 5–10 |
| TSA / OpenBao | Tenant keys via selected TSA API and deployment-specific OpenBao/HSM profile | Test key creation/signing/rotation/backup with OpenBao; select provider certification/HSM requirements; retain verification keys | TSA + operations | 2–5 |
| Trust framework | did:web/JWK implementation and profile-specific trust-list policy | Approved trust anchors, trusted-list/LoTE retrieval, issuer-chain validation and freshness/failure rules | Trust-services team | 3–6 |
| Status and lifecycle | Native allocation/revoke and public status while tenant is active; format-specific interoperability procedures | Select applicable status profile, privacy/cache/revocation timing, lifetime and deletion policy; verify old credentials after configuration archive; apply FR-27/66 to full tenant deletion | OCM status + client | 2–4 |
| Keycloak / Entra | PKCE, MFA/passkey and broker tokens with target-specific assurance review | Map required authentication assurance, identity proofing, consent/role lifecycle, recovery and broker-token retention | IAM + client | 2–4 |
| PCI runtime / participant | Memory-only PCI credential handling; dependency retention follows its selected profile | Remove payload logging throughout chain, threat model, DPIA input, bounded retention, incident/audit evidence and penetration testing | Security + each component owner | 3–6 |
| Gateway / operations | Public/participant TLS 1.3; internal native plaintext and static TLS | End-to-end transport controls, ACME ownership/rotation, approved ciphers, cloud resilience, backup/restore and resource/load tests | OCM/platform owners | 2–5 |
| UX / wallets | Vue journeys, QR and passed Chromium CI; device/accessibility review per target | PCM plus selected EUDI reference wallet matrix, accessible consent/disclosure, EN 301 549 audit and fixes | UX + QA + wallet team | 3–6 |
| Release/governance | Source workflows, published runtime package and evidence gate | Immutable source/images/charts, official IP/SBOM, signed provenance, deployed cloud receipts and independent assessment | Release/client | 2–4 |

Suggested sequencing: select the profile and repair privacy first; native protocol/format/trust work follows; then run wallet and cloud acceptance against frozen images; finish independent review and release provenance. Do not add regulatory claims to the UI or release notes merely because a standards-shaped JSON object passes unit tests. The selected service category may introduce obligations outside software and change these estimates.
