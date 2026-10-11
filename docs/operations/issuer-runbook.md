# Issuer setup and first credential

Start with a synthetic participant record and `jwt_vc_json`. The native non-JWT paths remain subject to the upstream defects in [known gaps](../known-gaps.md).

1. Register and verify a tenant, approve it as provider, and wait for identity, route and DNS conditions. Use the exact `<slug>-pci.<domain>` record. Test emails are captured in Mailpit; they are not delivered to the recipient's inbox in Mailpit mode.
2. Complete first-login password change and TOTP; enroll a passkey from Keycloak Account Console. Invite a principal and, where needed, a scoped issuer administrator.
3. In **Tenant settings**, create TSA keys `issuer` and `preauth` (EC P-256). Set issuer to `https://<tenant-host>/pci-orce`, DID to `did:web:<tenant-host>`, authorization server to the issuer URL, token key to `preauth`, and JWKS to `<issuer>/.well-known/jwks.json`. Select one issuer profile: Draft 13 or 1.0. Save and publish locally; wait until at least one credential configuration is active before publishing to OCM.
4. Deploy the [Go participant and ORCE test source](../testing/participant-test.md) under the participant owner's control. Its JWT issuer/audience/scopes must match the connector. Set up synthetic records keyed by configuration UUID and participant subject.
5. Create a PCI-owned client certificate/trust Secret with `scripts/participant-secret.sh PCI_NAMESPACE SECRET TENANT_UUID OWNER_UUID CERT KEY CA`. Read tenant ID/owner UID from the approved tenant record; do not relabel someone else's Secret. The connector can reference the same Secret for `tlsSecret` and `trustSecret`.
6. Add its exact host to the operator allowlist. For private DNS answers also approve each expected IP. Create a connector with `participant-v1`, HTTPS gRPC endpoint with host and port (for example `https://pci-participant.<namespace>.svc.cluster.local:9443`), matching server DNS, Secret references, trusted JWT issuer, audience `participant-data` and scope `credential:issue`. Configure a deadline appropriate to the repository, up to 10 seconds. Approve its configuration IDs explicitly.
7. Create a credential configuration with declared primitive claims, key `issuer`, status profile `status-list`, and signing mode. Save it, create and publish its journey, then select that journey and approved connector. Grant eligibility by live member role, subject, `role:<IdP role>` or `group:<full path>`. Only trusted ID-token claims become entitlements.
8. Publish configuration and issuer metadata. Wait for observed metadata revision: native registration is a broadcast; PCI confirms by Well-Known read-back. Inspect the public discovery endpoint and key/DID URLs before opening the wallet.
9. Sign in as the eligible principal. Complete the journey and scan the resulting offer with PCM. Offer/JWT/proof material is transient and cannot be recovered after a restart. If it expires, start a new request.
10. Verify the imported credential, record its safe history/status reference, revoke it through **Issuance history**, and confirm the public status changes. Test blocked reissuance and the explicit tenant-admin override.

## Public paths

For issuer `https://alpha-pci.example.com/pci-orce`:

| Purpose | Public path |
|---|---|
| Final 1.0 issuer discovery | `/.well-known/openid-credential-issuer/pci-orce` |
| Draft 13 issuer discovery | `/pci-orce/.well-known/openid-credential-issuer` |
| Authorization discovery | `/.well-known/oauth-authorization-server/pci-orce` |
| Token | `/pci-orce/api/auth/token` |
| Wallet nonce | `/pci-orce/api/nonce` |
| Credential | `/pci-orce/api/credential` |
| DID | `/.well-known/did.json` |
| JWKS | `/.well-known/jwks.json` and the advertised prefixed URL |
| Status | Native status URL returned for that tenant/list |

The tenant HTTPRoute uses exact rewrites for host-root discovery/DID URLs and preserves the ORCE base path. Incoming reserved headers are stripped or overwritten; the wrapper independently matches host, tenant ID and slug.

## Change, archive and recover

Draft edits never replace an active immutable version. Publish makes a version active; restore copies an earlier snapshot into a new draft. Pending requests retain their pinned dependencies. Archival prevents new offers and withdraws configurations through native publication while retaining old verification dependencies for an active tenant. The selected Well-Known empty-catalogue defect can block withdrawal of the final configuration; the UI reports the failure instead of claiming success until the owner-deployed empty-catalogue patch is enabled. Full tenant deletion removes its public routes per FR-27/66.

Unknown offer/sign/revoke side effects become `indeterminate`; do not retry a signing or status mutation blindly. Inspect safe request IDs and status service state, then either confirm the outcome or start a new request. No debug nodes, payload traces, raw JWTs or credentials belong in evidence reports.

After a real issuance, use **Verify credential** to select the issued configuration and either VP profile. The wallet returns a one-use code after posting its holder-signed presentation; return that code in the initiating tenant session. The supported presentation format is JWT W3C. Verify that revoked credentials and other tenants/principals are rejected. See the [presentation contract](../contracts/presentation.md).
