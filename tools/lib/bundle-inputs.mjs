// Explicit dependency order for the flat ORCE and browser bundles.
// The issuer console is one module in the submitted baseline; work package R2-5
// replaces this entry with the issuer action and view modules.
export const PCI_ISSUER_MODULES = ["src/sr2.js"];
export const PCI_UI_MODULES = [
  "shared/public-url.js",
  "src/config/runtime.js",
  "src/utils/pkce.js",
  "src/state/store.js",
  "src/state/reducers.js",
  "src/services/transport.js",
  "src/components/feedback.js",
  "src/services/api.js",
  "src/services/auth.js",
  "src/qr-tables.js",
  "src/qr.js",
  ...PCI_ISSUER_MODULES,
  "src/main.js"
];
export const PCI_SR2_MODULES = [
  "domain.js",
  "journey-input.js",
  "assets.js",
  "participant-security.js",
  "store.js",
  "adapter-contracts.js",
  "native-keys.js",
  "linked-data.js",
  "native-metadata.js",
  "sdjwt.js",
  "wire.js",
  "native.js",
  "adapters.js",
  "transport.js",
  "profiles.js",
  "history.js",
  "semantics.js",
  "service-policy.js",
  "service.js",
  "revocation.js",
  "issuance.js",
  "presentation.js",
  "maintenance.js",
  "runtime.js",
  "http.js"
];
