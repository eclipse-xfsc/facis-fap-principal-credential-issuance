# Issuer management

This is an integration candidate. Native OCM publication/issuance adapters are wired against pinned official source. A local publish activates a version; observed native metadata read-back and live wallet evidence are separate checks.

## Runtime and ownership

M8–M13 run inside the existing ORCE Function-node runtime and use the same uibuilder/Vue application. There is no second PCI server, React bundle, provisioner container or Helm runtime. `backend/sr2/routes.json` defines the additional HTTP nodes; `backend/sr2/http.js` adapts the transport into independently testable service/domain modules. The flow builder inlines these authored modules into the canonical flow.

All SR2 HTTP operations verify the routed host, canonical tenant headers, session tenant and enabled database membership. Duplicate security headers and cross-site state-changing requests are rejected. Browser application commands use the authenticated UIBUILDER bridge described in [the UI contract](../ux/dcm-reference.md). The HTTP API remains available to integrations and tests. Both transports enter the same role, tenant, membership and concurrency checks; unvalidated UIBUILDER calls are rejected. Every database transaction holds a tenant advisory lock and a row lock; every object lookup includes tenant identity.

Participant tenant administrators control metadata, branding, connector configuration, delegation and limits. Issuer assignments reside in `pci_issuer_assignments`; their current state is read on every operation. An unscoped assignment permits creating configurations. A scoped assignment permits only its configuration, journeys, assets, history and revocation. A cached Keycloak `issuer_admin` role alone is insufficient. Existing SR1 delegated members are imported exactly once by a migration marker; rerunning G0 cannot restore revoked grants. Invitations retain the Keycloak lifecycle and add an unscoped assignment when requested.

## Independent versions

`pci_issuer_resources` holds one row per metadata, branding, configuration, flow, connector, asset or settings resource. It is not one tenant-wide configuration JSON. `pci_issuer_versions` stores independent append-only snapshots with content hashes. Mutation requires a quoted numeric `If-Match`. Updating a published resource creates a newer draft without changing its active version. Publish activates a new immutable snapshot. Rollback copies an earlier snapshot into a new draft; a separate publish activates it. Archive blocks new requests and preserves snapshots, history and already-public assets.

Configuration identifiers are immutable and tenant-unique. Configurations validate profile/format combinations, typed claims, key/status references, signing modes, eligibility, rates and owned links. Changing metadata to an incompatible profile is rejected while active configurations reference the previous profile. Both profiles have explicit metadata, request and response serializers. Full Draft 13/1.0 interoperability still requires native-service and wallet acceptance.

## Images and branding

Uploads accept JSON/base64 PNG only: up to 1 MiB, 1024×1024, 8-bit RGB/RGBA, no interlace or animation. CRCs and bounds are checked, pixels are decoded, all ancillary metadata is dropped, and the result is re-encoded. Filenames and filesystem paths are not accepted. Image bytes reside in PostgreSQL resources/snapshots and therefore use the existing persistent database, not an ephemeral directory.

An asset is private until published configuration/branding references it. The tenant-bound public endpoint serves immutable PNG bytes with nosniff and a restrictive content-security policy. Already-public assets cannot be deleted and remain available after configuration archive. Branding is escaped text and a constrained accent color with at least 4.5:1 white-text contrast; no tenant HTML, CSS or JavaScript is evaluated.

## Journeys and principal access

Journeys contain 2–20 ordered allowlisted steps: information, consent, input, confirmation, status and offer. Consent and a terminal offer are mandatory; arbitrary script/branches are rejected. The issuer UI supports keyboard-operable step ordering, input fields, preview, independent publish and restore. There is no arbitrary graph execution or user JavaScript.

The ORCE service starts a request pinned to immutable configuration, flow, connector and metadata versions. It executes step validation and rejects missing consent or required input. An input field whose name exactly matches a declared claim supplies that claim in internal-signing mode. This mapping comes from the issuer's published journey, not from arbitrary browser keys. Required mapped claims require required fields; duplicate mappings and participant-signed manual claims are rejected. Unmatched survey values are discarded after validation. Only step progress is stored in SQL; mapped values remain in bounded process memory until the request is consumed or expires. See [manual journey claims](../operations/journey-input.md) for types, participant behavior and restart recovery. The published configuration's verified member/subject eligibility is rechecked before offer and callback execution.

The offer screen renders an ephemeral link and QR code. A local byte-mode QR encoder supports versions 1–40 and chooses a mask by penalty; all forty fixed-mask reference matrices are checked offline. Oversized links retain a direct-link fallback. No offer URL, preauthorization code or QR payload is stored server-side.

## Database/runtime limits

Tenant resources are capped at 500 per kind, assets at 200. Fixed one-minute database rate buckets bound per-tenant offers, per-configuration offers and participant calls. Tenant settings cap active participant operations at 1–8. These gates serialize in the database across workers; the overall SR1 runtime still targets one active ORCE replica. A one-minute maintenance flow expires pending requests and periodically attempts metadata reconciliation. Unknown external side effects become indeterminate and are not automatically repeated.
