# Neutral source revision

The revised package retains version 0.5.0-rc.12. Operator-specific names, domains, addresses, local paths and live test identifiers are replaced by neutral examples or required runtime inputs. PDF document metadata is removed; all normative page text and rendering are preserved. The specification manifest retains original hashes alongside current hashes. Historical input records below describe the original releases, including their original specification bytes. Current evidence is in [neutral revision validation](release/neutral-validation.json); current package hashes are in [source-sha256.txt](release/source-sha256.txt).

# rc.12 input

The complete operator upload allsources.zip has SHA-256 `d8cb5070aa89737806ad6962eac192487943308eec3da4ebaec999fc92f87313`. The latest source selected is source/fap-pci-0.5.0-rc.11/facis-fap-principal-credential-issuance, including its deployed discovery fix and callback/key diagnostics. Older release directories and private deployment files were consulted for context and are not included in this release.

rc.12 corrects the private native signer JWK array contract. The exact source pins, defect and validation boundary are documented in [the release record](release/0.5.0-rc.12.md). Live rc.11 issuance had reached credential-completion after the earlier JWKS cache restart; rc.12 live acceptance remains pending the new-offer test.

## Historical input record

### rc.11 input

Complete rc.9 source archive SHA-256 `18ba8263c0fe11a2cfd6566c074db84c4c251e9463f306ee05b665b0c08ed46e` is preserved. Operator rc.9 upgrade and Alpha OCM publication passed (desired 6 / observed 6). Public issuer discovery failed at the remaining host clone call in profiles.js. rc.11 corrects wallet metadata and credential-request conversion, tests the generated HTTP handlers, and preserves trusted SR2 error classifications. Live discovery and issuance remain pending.

# rc.9 input

Complete rc.8 source archive SHA-256 `cdefb544aa5ae1f97389c73cebd7a64744d846ee518f25a9e4e129feef069542` is preserved. Operator evidence on 2026-10-11 identifies login-form newline corruption, a jq 1.6 keyword-variable parse error and a Function-node sandbox ReferenceError in claim-display completion. The corrected candidate folds all three fixes into canonical source and normal generated distribution. The participant implementation and OCM baseline remain unchanged.

# rc.8 input

Built from complete rc.7 source archive SHA-256 `85b5852b3704107bb7aa1fa55e76a937fd293b6e8328de78061210ed2778b5ac`, preserved unchanged. The captured Well-Known 1.5.2 readback on 2026-10-11 retains claim paths and mandatory flags but omits optional claim display labels. This release corrects that narrow compatibility defect and supplies a Bash artifact upgrade. OCM baseline remains ESB 12.3.9.

# rc.7 input

This correction builds on the complete rc.6 source archive (SHA-256 `20ab593efa9daeddc6635b811b84ff76f61383658d527181d19ff2516e50ea02`). It corrects runtime readiness and adds bounded artifact-installation retries. The OCM baseline remains ESB 12.3.9.

# Source provenance

## rc.6 input

rc.6 starts from the complete rc.5 source ZIP, SHA-256 `4c535c4e343f91052359247040a359a6c6d4d1751440881c73faf5826ac036ef`. The supplied OCM-WStack 12.3.9 archive has SHA-256 `b7407ebfe8d4fc7920f30eb89ac703a133a89ba9c96da609f0234e0a4c773391`. The [current contract assessment](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/blob/main/contracts/ocm-12.3.9-assessment.json) binds the reviewed package inputs and identifies current upstream-revision and runtime evidence limits. The two normative PDFs are unchanged. Historical review records below remain historical; they do not imply execution against the new release. See [rc.6 changes](release/0.5.0-rc.6.md).

## rc.4 input

rc.4 is derived from the supplied rc.3 ZIP, SHA-256 `d393250707e8faef9d3961863010b3d74d7af1de3695038587a74c5312f96b55`. The two supplied specifications match the bundled originals. The input was preserved; fixes were made in a separate working copy. See the [rc.4 change record](release/0.5.0-rc.4.md).

## rc.3 input and selection

rc.3 starts from the delivered rc.2 source archive (SHA-256 `d3b053ff7abdaa61c565d2e0848b2b1d94361176b32cf150d2c1935ff63446e7`). The changes and fresh validation are in [rc.3 release notes](release/0.5.0-rc.3.md). Prior live observations do not count as tests of the rebuilt candidate.

## Inherited rc.2 input and selection

The latest uploaded `latest_source.zip` has SHA-256 `1b008f16dacd0c1a5badf859ab0fc2bf41846e71f6d0c36449e6c340263cb3ed`. It contains two source copies. This candidate starts from the patched nested `latest-source-i-have/fap-pci-0.5.0-rc.1-source/facis-fap-principal-credential-issuance` tree, not its older sibling. Source history below describes inherited inputs, not a substitute for this baseline.

All current distribution files are rebuilt. Patch backups, historical ZIPs, private uploads and dependency caches are excluded. `docs/release/artifacts.json` binds current runtime/source, contracts, deployment and build/test inputs; `source-sha256.txt` inventories the shipped tree excluding itself. The [rc.2 changes](release/0.5.0-rc.2.md) distinguish source repairs from live tests.

## Inherited inputs

This candidate combines the reviewed 0.4.1 SR2 source, the user's repaired minimal repository, their live G0/tenant-routing findings and supplied OCM ESB 12.3.6. It retains one ORCE runtime and one Vue/uibuilder application; it does not reintroduce Fastify, a React/Vite frontend or a Go Kubernetes provisioner.

| Input | SHA-256 |
|---|---|
| `fap_pci-0.4.1-sr2-source(1).zip` | `b308b3f63dee54b180d2ed25091a39e627bc1431bf41b647563db556382d394d` |
| Repaired minimal 0.4.1 repository archive | `a31d93e4cc70b31e82f6cbcff7100ac6bbe9642a55a59774fe635d259f0508ac` |
| `OCM-WStack-12.3.6-Source.zip` | `08ca64d0c49fde37bb4c51470207eaa69ef74d5465266ee4f7fab67d50e00ed3` |

Normative inputs are the supplied 2026 PCI SRS (CC BY 4.0) and Technical Development Requirements. All 101 SRS IDs are mapped, correcting the previous FR-27 misidentification. The technical requirements add Helm, two-cloud, BDD, governance and release obligations.

Repository organization follows the approved [Partner Onboarding](https://github.com/eclipse-xfsc/facis-fap-partner-onboarding) and [DCM](https://github.com/eclipse-xfsc/facis-fap-decentralized-catalogue-management) patterns: authored code, deployment, scripts, docs, tests and standard workflows in one repository. PCI's existing canonical `dist` contract is preserved.

Official XFSC files used for native integration are pinned in `contracts/source-manifest.json`. No third-party repository or private upload is vendored wholesale. Generated distribution files are rebuilt from authored source; previous reports are not copied forward as current evidence.

Implementation, tests and documentation were AI-assisted. No human review, formal acceptance, external deployment, issue submission, public commit/tag or historical daily delivery is implied. These require their actual records.
