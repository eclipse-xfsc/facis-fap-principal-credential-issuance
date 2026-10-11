# rc.12 implementation and verification

rc.12 fixes the native Crypto signer JWK array decoding failure at credential completion. It retains the latest patched rc.11 source and the prior fixes. See [the release record](0.5.0-rc.12.md) and [surgical upgrade](../operations/upgrade-0.5.0-rc.12.md).

| Executed check | Result |
|---|---|
| Complete Node static, BDD-style and integration suite | 302 passed; 0 failed; 0 skipped |
| New signer regressions | 16 passed in ES modules and generated Node-RED VM code |
| Cryptographic coverage | JWT VC, both SD-JWT profiles, RS256/PS256 key variants, actual array response, older response forms, tampering and invalid-key rejection |
| Repeated distribution build | Deterministic |
| Documentation | 109 requirement/audit rows, 83 technical clauses, 122 API examples and both original specification hashes checked |
| Shell syntax | All 10 shipped Bash scripts passed |
| Alpha runner embedded JavaScript syntax | Passed |
| Embedded SQL identity and potential-secret scan | Passed |

[validation.json](validation.json) contains exact generated hashes and the NOT_RUN list. Native HTTP/NATS boundaries and database fixtures remain synthetic. Local regressions are not evidence of live issuance, PCM acceptance or complete SRS sign-off. The pinned signer response implementation was read from the official upstream repositories; deployed image build provenance was not independently established here.

Standalone inherited Python/G0 YAML/BDD catalogue validators were not rerun for this surgical fix. Historical results are described in earlier release records. Go/Goa/protobuf compilation, server PostgreSQL, Helm/Kubernetes admission, browser/BDD/semantic engines, dependency audits and official workflows still require their corresponding execution environments.

The complete 101 SRS requirement and 83 technical-clause ledgers are retained, along with the supplementary eight TDR audit groups. [The requirement audit](requirement-audit.md) and [known gaps](../known-gaps.md) distinguish supplied implementation from owner remediation, live validation and governance evidence. The existing acceptance template is intentionally incomplete. The [sign-off gate](signoff-status.json) remains NOT_READY_FOR_SIGNOFF until genuine receipts bind the release artifacts and all required evidence.

For the operator's Alpha deployment, the next check is one NEW synthetic offer after rc.12 installation, credential endpoint HTTP 200, independent credential verification and both presentation checks. The live test already has the tenant and configuration IDs and prompts only for the fresh offer and session cookie value.
