# Manual input to credential claims

This patch targets repository commit `309521a0352102bcff5b653b1e207cc4899bb28d` and retains version `0.5.0-rc.12`. It fixes the path that previously validated input values and then discarded them. The changed-files archive contains Git-relative paths, including rebuilt runtime/UI artifacts and refreshed hash inventories. Apply its contents at the repository root.

## Configure the required name

In an **internal-signing** credential configuration, declare `name` as type `string`, required. In that configuration's published journey, add an input step before the offer with field name `name`, label `Full name`, required. The names must match exactly, including case. An already published journey with these settings works after the runtime upgrade; a new mapping option or data migration is not needed.

The principal enters their name, submits the input step and receives the offer. The value is used as `credentialSubject.name` in `jwt_vc_json`; SD-JWT uses the declared claim disclosure and linked-data credentials use `credentialSubject.pciClaims.name`. This is a self-declared name. Keep participant-verified attributes as participant-sourced claims with no matching journey input.

| Claim type | Form value |
| --- | --- |
| `string` | Nonempty text for required fields, up to 2,000 characters; surrounding whitespace is trimmed. |
| `number` | A finite JSON-style number, for example `42` or `12.5`; hexadecimal, `NaN` and infinity are rejected. |
| `boolean` | Exactly `true` or `false`. |

A mapped claim may appear in only one input field across the journey. Required claims require required fields. Unmatched fields remain transient survey inputs and do not enter the credential. An omitted optional mapped field removes any participant value for that claim rather than substituting it. The browser cannot submit undeclared fields or change subject, issuer, status or holder bindings.

## Participant connection and signing

The configured participant connector, mTLS, participant JWT, Notify/GetCredentialData sequence and a valid participant record remain necessary. Manual input supplies the mapped claim; it does not bypass participant authorization or replace the connector. The participant receives its retrieval schema with mapped claims optional and receives no raw manual answers. It must respect the transmitted claim requirements; the included Go reference does. All other required claims must come from the participant. PCI enforces the original pinned configuration after merging and checks that verified signed values equal the data sent for signing.

Participant-signed mode preserves the participant's signed credential. A matching manual-claim field in that mode is rejected explicitly; use internal signing to collect and sign user-entered claims. Ordinary unmatched surveys remain supported.

## Apply and test

Deploy the updated `dist/fap-pci-flow.json` through the same revision-aware Admin API merge used for the current instance, and install `dist/ui/index.js` through the existing artifact installation procedure. Committing authored files alone does not update the running instance. No ground-zero run, database migration, new service, new DNS record or participant image rebuild is required. Keep the existing FACIS logo assets; this patch preserves them.

The flow replacement clears pending form answers and offers. Begin a **new** request after applying it. Use the existing `test1-pci.facis.cloud` tenant and `test1_employee_jwt` configuration, complete consent, enter a synthetic name, submit and retrieve the credential with a compatible wallet. Confirm the signed `credentialSubject.name` equals the entered name and that issuance history contains only safe references. Confirm a blank name blocks progression and that a fresh request can collect a different name. Check the deployed request body/proxy logging policy when testing personal data; the offline tests use synthetic values.

Browser refresh/reconnection resumes server progress without storing answers in browser storage. Answers are retained only in the one active ORCE process for at most the ten-minute request lifetime. If runtime state is lost before an offer, refresh returns to the missing input step. If an offer already exists, start a new request; a callback without its bound input fails before participant/signing calls. Multiple active ORCE workers need routing to the same owning process; the existing deployment targets one active replica.

Run `npm test` for the build, static, BDD and integration checks. `test/tests/integration/journey-input.test.mjs` exercises input-to-signed-claim behavior, privacy, request/version binding, loss/expiry, typed validation, participant schema handling and substituted signed values, including the generated ORCE Function-node code. Component tests exercise recovery through the tenant API wrapper. These offline checks do not establish live wallet or SRS acceptance.
