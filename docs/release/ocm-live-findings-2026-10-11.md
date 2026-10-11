# OCM deployment and native-service live findings

These are operator-reported observations from the development cluster on 2026-10-11. They are not repaired by the PCI artifact upgrade. Canonical OCM deployer/service remediation and recovery tests remain pending.

| Finding | Recorded development repair / required upstream work |
|---|---|
| Authorization bridge Redis credentials did not authenticate; bridge was unavailable. | Operator privately synchronized the bridge Secret with the authenticated Redis default account and restarted the bridge. The deployer must provision the intended account, synchronize rotation and gate completion on authenticated readiness. The default-account repair is development-only, not a permanent least-privilege ACL design. |
| Well-Known REST remained ready after initial NATS connection failure, without registration/metadata subscriptions. | Operator restart restored subscriptions. Implement initial retry, listener recovery and listener-aware readiness; gate deployment completion on required subscriptions. |
| OpenBao was initialized but sealed, Shamir threshold 3 of 5. Crypto providers exited with code 1 on its 503; signer calls returned RPC EOF. | Operator unsealed the existing instance using its stored shares. Implement seal recovery or a reviewed auto-unseal mechanism and backend-aware signer readiness. Preserve initialized storage and recovery material; do not reinitialize on recovery. |
| Native issuance logged offer replies containing pre-authorized codes, nonces and encoded offer URIs at INFO. | Remove sensitive payload logging from issuance-service and audit other native services. Log only reviewed operation/status/correlation fields. Do not copy these codes into evidence artifacts. Redacting JWT-looking strings alone does not sanitize offer/grant logs. |

Operator records outside source: `ocm-bridge-redis-auth-repair.md`, `rc7-wellknown-nats-startup-failure.md`, and `ocm-openbao-unseal-repair.md` in the private deployment-test-notes directory. Live tests still need delayed dependency startup, connection loss/recovery, credential rotation, seal recovery and sensitive-log inspection.

The separate PCI key-ID mismatch is corrected in rc.11; successful live credential issuance has not yet been demonstrated. No native offer code, token, credential, recovery share or root token is stored in this document.
