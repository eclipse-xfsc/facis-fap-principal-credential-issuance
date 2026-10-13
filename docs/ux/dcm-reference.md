# FACIS Partner Onboarding UI alignment

The governing reference is “FAP_UI_General_Guideline_Reference_Aligned.md”, revised implementation guide dated 22 March 2026. This document supersedes the earlier DCM visual direction; its repository path is retained so existing documentation links continue to work.

This targeted source revision is based on upstream main commit `d8f55a45a52ef620b9cd804e2314e7bcb4b98666` (13 October 2026 checkout). It keeps the existing ORCE runtime, responsibilities, persisted domain model, integration API and canonical release layout. No database migration or new dependency is required.

## Browser contract

`src/services/transport.js` owns one UIBUILDER send function, one application inbound handler and connection/reconnect observers. `src/state/reducers.js` validates correlated results/events and normalizes failures. The state container separates session, model, UI/jobs and errors. View handlers receive normalized data and maintain their presentation models; ORCE remains authoritative for authorization, validation, transitions and persistence.

The version 1 request contract wraps the existing resource vocabulary, avoiding a second set of business schemas. `action` is `request` or the transport diagnostic `ping`. Paths are application-relative and resolved against the server-built allowlist of existing routes, then dispatched to the corresponding responsibility module.

```json
{
  "version": 1,
  "type": "command",
  "action": "request",
  "requestId": "unique-request-id-at-least-16-chars",
  "sessionId": "server-issued-session-or-null",
  "payload": {
    "path": "/api/v1/tenants/{tenantId}/issuance-requests/{requestId}/advance",
    "method": "POST",
    "body": { "step": 0, "consent": true, "values": {} },
    "headers": {}
  },
  "meta": { "bridgeToken": "ephemeral-credential-from-bootstrap" }
}
```

The envelope is placed in the UIBUILDER message's `payload`. The final response has `version`, `type: result`, `action`, matching `requestId`, server `sessionId`, explicit boolean `ok`, HTTP-equivalent `status`, `data`, `next` and `errors`. `next.step` is supplied only from an authoritative request. Errors are grouped as `fields` plus one of `field`, `action`, `integration` or `system`; messages retain safe codes, support references and retryability.

A correlated `type: event`, `event: jobProgress` carries `data: {jobId, stage, label, progress}`. `progress: null` is indeterminate rather than a fabricated percentage. The dispatcher acknowledges acceptance promptly; SR2 emits processing state, and offer preparation emits calling-service and confirming stages before the final result. The original request record retains the business outcome for recovery. Disconnect/timeout never automatically replays a mutation.

Large uploads use bounded fragments in the same envelope: `meta.chunk: {index, total}` and a string `payload` containing a slice of the serialized resource payload. Fragments are at most 128,000 characters, at most 16 per command, at most two assemblies per grant, and at most 1.6 MB total. Assemblies expire after 30 seconds. This accommodates the existing PNG upload limit without increasing Socket.IO's default frame limit. Only a complete, authorized command reaches a business module.

## Authentication and routing

Public base-path configuration and the login/session/cookie lifecycle use same-origin HTTP. After a real UIBUILDER connection acknowledgement, the browser posts its socket ID to `/api/v1/auth/bridge`. The server checks Origin, canonical tenant headers and the current session, and issues a five-minute random grant. The grant is retained only in browser memory and a bounded process-owned server map. Anonymous grants support public registration/branding; they confer no authenticated role.

The existing UIBUILDER node has `showMsgUib: true`. In the pinned 7.5.0 implementation, this makes `listenFromClientStd` overwrite `_uib._socketId` from the real socket. The dispatcher rebuilds the message, checks that socket against the grant and rechecks the stored session on every command. Cookies and bearer credentials remain in the server map. Browser-authored `req`, handshake headers, host, roles, transport flags and routing properties do not grant authority. Only `if-match` and `idempotency-key` are accepted as command headers. Internal callbacks and binary file routes remain outside the browser bridge. Existing HTTP authorization and optimistic concurrency checks are preserved.

The 7.5.0 compatibility points were checked against the [server socket implementation](https://github.com/TotallyInformation/node-red-contrib-uibuilder/blob/v7.5.0/nodes/libs/socket.cjs) and [browser client](https://github.com/TotallyInformation/node-red-contrib-uibuilder/blob/v7.5.0/front-end/uibuilder.iife.js). The client uses its actual `_socket.id` and observes `ioConnected`; calling `start()` alone does not mean connected.

## Recovery and feedback

An account/tenant-scoped session-storage entry contains only the active request ID and selected section. Reload and reconnect fetch the request from ORCE and restore its pinned step. Expired or inaccessible requests are cleared explicitly. Input answers, secrets, wallet offers and credential claims are not stored. If an offer was lost, the UI reports the server state and offers a new request rather than attempting to reconstruct the offer.

Shared feedback, field and progress components provide inline validation, action banners, service/system recovery guidance and diagnostic references. A failed result leaves the current step unchanged. Malformed JSON and incomplete envelopes cannot silently become success. Intentional HTTP 204 responses are handled explicitly. Unknown or late correlations cannot settle another action.

## Visual system

`src/styles.css` has one central token block: canvas `#E1E7EF`, white surfaces, action `#005FFF`, hover `#2563EB`, strong text `#1F2937`, muted text `#6B7280` and borders `#E5E7EB`. The bounded 1200 px shell has 20 px corners; controls have 8 px corners. System sans typography uses 24 px titles, 26–28 px side headings and 14–16 px body text. Motion is short and respects reduced-motion preferences.

Registration, provider, signed-out tenant and authenticated tenant screens share the contained shell and guidance/content composition. Settings presents one selected task. Tenant identity text/logo/footer and bounded width remain configurable; stored legacy colors/fonts/corner values no longer override the reference design. New branding writes enforce that same policy.

## Apply and validate

Overlay the changed-files archive at the root of the pinned repository. It contains full replacement files at their original paths and the new bridge/components/tests in the corresponding source directories. It contains no dependency directories or unrelated source snapshot. Run `npm test`, then use the repository's existing artifact upgrade procedure to install the updated `dist/fap-pci-flow.json` and `dist/ui` together. Importing only the UI will not enable the new bridge.

Validation on 13 October 2026: `npm test` passed 314 tests (74 static, 42 BDD, 198 integration), with zero failures and zero skips. The build regenerated the canonical flow and UI. The automated gate covers generated Function-node compilation, the existing static/BDD/integration suites, authenticated bridge commands and authorization failures, version conflicts, replay prevention, fragmented uploads, progress, decoding, connection state and journey refresh. The component tests execute the pinned Vue compiler and in-memory renderer. These are fixture-based checks, not deployed Keycloak/OCM/wallet acceptance.

Rendered browser, mobile reflow, keyboard/screen-reader and deployed authenticated round-trip signoff remain to be run. Chromium was unavailable in the editing environment and its download was blocked. `test/browser/runtime.mjs` provides the browser regression for an environment with Playwright/Chromium. On the target deployment, also refresh/reconnect mid-journey, exercise a delayed offer, check an expired session and verify provider/tenant isolation. This revision does not claim historical contract-first development or manufacture live acceptance evidence.

The full documentation validator could not complete in this checkout because the unchanged `docs/specifications/SRS.pdf` was unavailable through the text-only repository download. That file is neither modified nor removed by this overlay.
