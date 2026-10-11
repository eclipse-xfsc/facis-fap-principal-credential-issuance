# FAP DCM UI reference

Inspected read-only on 2026-09-25 at the user’s explicit request:

- Repository: https://github.com/eclipse-xfsc/facis-fap-decentralized-catalogue-management
- Main commit/tree: `babcbe3e757472c08f0b5661b04cc17ba2db2393`.
- Sources: `src/index.html`, `src/styles.css`, `src/components/Sidebar.js`, `Topbar.js`, `StatCard.js`, `src/layouts/DashboardLayout.js`, `src/views/SchemaRegistryView.js`.

The actual markup is in index.html; the small component files refer to template IDs. The source shows a 240 px pale sidebar (#F3F6FB), light page (#F5F7FB), blue navigation, white header and table panels, compact filters, blue-tinted summary cards and state pills.

PCI independently implements those patterns in its existing Vue/uibuilder app: organization/account sidebar, role-based section navigation, compact header, searchable configuration table, state filter and summary counts, responsive forms, status pills, and members/delegation in one section. Signed-out registration and provider screens use the same lighter visual treatment. The new icon paths and CSS are authored locally. No DCM logos, images, code files, external fonts or runtime dependencies were copied. The existing PCI brand and tenant branding remain supported. Default action blue is darkened for white-text readability; approved tenant accent overrides remain supported.

One UI/runtime and the canonical PCI dist contract remain. DCM’s deployment architecture was not adopted. Repository access was solely reference research: no push, tag, PR, workflow or deployment occurred. No other integration source was fetched.

Validation: both Vue templates compile; the real component runs against the HTTP harness with in-memory Vue rendering and exercises configuration creation/edit/preview, filters/navigation, connector access, delegation, journey/QR, history and revocation. CSS/browser rendering, keyboard/screen-reader and responsive visual QA remain NOT RUN because no browser executable is installed. The separate HTML design preview is the actual revised component with clearly labelled synthetic, read-only data; it is not deployment or acceptance evidence.
