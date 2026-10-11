# Single uibuilder issuer experience

The single provider/registration/tenant application now uses the [FAP DCM visual reference](dcm-reference.md): a pale sidebar, compact white headers, light canvas, summary cards and searchable tables. Tenant sessions gain one credential workspace with sections for requesting credentials, configurations, journeys and history. Tenant admins additionally see issuer metadata, branding, limits, connectors and delegation. Capability checks shape navigation; server authorization controls access.

Credential forms expose typed claims, profile/format, images, signing mode, key/status reference, connector, journey, eligibility and rate controls. Draft preview, validation, local publish, immutable revision history, restore and archive are explicit actions. PNG uploads are decoded/re-encoded; public access begins only on publication.

Journeys have labeled fields, keyboard-accessible move-up/down controls and safe preview. Principals execute the pinned consent/input/offer steps in the same UI. QR/link results are transient. History supports configuration, verified credential ID, request, pseudonymous subject, event, date and cursor filtering, with explicit revocation confirmation. Tenant/provider lifecycle actions require typing the tenant slug.

Theme text is escaped. Accent selection is constrained for white-text contrast and does not allow arbitrary CSS. The UI has status/error regions and responsive layout. Compiler and in-memory renderer checks pass; real-browser keyboard, screen-reader, reflow and formal EN 301 549 assessment remain NOT RUN. Connector/key setup and protocol integration still require an operator and approved upstream contracts; the UI reports that boundary instead of claiming an offer succeeded.
