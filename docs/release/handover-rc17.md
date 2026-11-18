# rc.17 handover evidence

Release: [v0.5.0-rc.17](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/releases/tag/v0.5.0-rc.17)

Source commit: `30eb5e77252c449ab0310dd5499970f9711dfcd8`.

## Deployment and manual issuance

[IONOS](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/issues/32#issuecomment-6992513386); [OSC](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/issues/32#issuecomment-6986540721); [OSC record](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/issues/32#issuecomment-6992613379)

[IONOS deployment record](deployments/ionos-v0.5.0-rc.17.json); [OSC deployment record](deployments/osc-v0.5.0-rc.17.json)

Both environments report rc.17 and record immutable application and participant
image digests. Manual synthetic wallet receipt was reported on both environments.
These results establish the tested manual path, not completion of every
acceptance requirement.

Historical bootstrap and Helm release versions are retained in the raw records.
They must not be rewritten to imply an upgrade that was not performed.

## OSC completed Jobs

The original OSC record retains `everyContainerReady: false`.
The following pods were separately inspected and both were `Succeeded`,
with termination reason `Completed` and exit code `0`:

- `fap-pci-platform-state-pspnb`
- `fap-pci-schema-init-t7qht`

Completed Job containers explain this aggregate flag. The application and
participant containers were ready. The raw record remains unchanged.

## Failed and outstanding checks

The IONOS terminal wallet attempt received HTTP 200 for discovery, token and
nonce operations, then HTTP 400 `invalid_credential_request` from the credential
endpoint. The operator reports a related private OCM-WStack ticket. Root cause
and resolution are not independently established by this evidence.

Independent credential signature and status verification using a named tool,
and complete issuance-history evidence, remain outstanding.

The deployed BDD UX suite, PCM Mobile import of two distinct flows, issuance
across the required tenants and users, whole-chain privacy canary checks and
a live ad-hoc theme demonstration were not established by these runs.

## Additional findings

IONOS metadata publication initially failed with `PCI-METADATA-READBACK`.
Changing the synthetic configuration's optional department claim to required
allowed the manual test to proceed. Optional-claim compatibility remains an
open finding; this workaround is not evidence of a product fix.

The environment collector's tenant UUID handling required an in-memory
string-conversion workaround. No source fix is claimed.

## Delivery and review

[Documentation publication](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/actions/runs/44345297485/attempts/2) succeeded on attempt 2.

[Deployment PR #17](https://github.com/eclipse-xfsc/deployment/pull/17) has approval on head
`fbc42b4c81b4ce600a92487aef68f4d48e234c05`; maintainer merge and assessment
of the failed SonarCloud security gate remain outstanding.

[Release assets](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/releases/tag/v0.5.0-rc.17) contain charts, SBOMs and image publication records.
Docker Hub delivery is recorded; Harbor publication and acceptance of any
registry substitution are not claimed.

[Eclipse Dash](https://github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/actions/runs/44345307857) failed. All-green release CI is not claimed.

The requirement statuses are proposals for QA confirmation. Any required
written agreement for remaining MUST deviations must be recorded separately.
