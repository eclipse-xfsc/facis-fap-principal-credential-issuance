# Public URL and ORCE base-path model

## Canonical setting

`PCI_ORCE_BASE_PATH` is the single PCI public path-prefix setting. It is a path, never a URL.

| Input | Normalized value |
|---|---|
| empty | empty |
| `/` | empty |
| `BASE` | `/BASE` |
| `/BASE` | `/BASE` |
| `/BASE/` | `/BASE` |
| `/foo/bar/` | `/foo/bar` |

The implementation rejects schemes, protocol-relative values, query strings, fragments, backslashes, whitespace/control characters, empty segments, dot segments and percent-encoded segments. The canonical implementation is `shared/public-url.js`; automation and Helm use equivalent validation and emit the canonical value.

## Four separate paths

These settings are related operationally but are not interchangeable:

1. **ORCE editor path**: where the Node-RED editor is exposed. It is owned by the existing ORCE deployment/ingress and may be `/orce`, another path, another host, or disabled. PCI does not infer or change it.
2. **Node-RED `httpNodeRoot`**: prefix Node-RED applies to HTTP In nodes. PCI HTTP In definitions stay application-relative, such as `/api/v1/auth/config`, `/healthz`, and `/metrics`.
3. **uibuilder instance path**: the uibuilder node is named `ui`; when Node-RED is exposed at the configured prefix, the public UI is `{PCI_ORCE_BASE_PATH}/ui/`.
4. **PCI public base path**: `PCI_ORCE_BASE_PATH`, used for public URL generation, browser API requests, redirects, emails, Keycloak configuration, health checks and Envoy route matching.

PCI does not edit `settings.js` because ORCE images do not expose one guaranteed settings syntax. The operator must expose Node-RED HTTP nodes and uibuilder at the same normalized prefix. `automation/stage1/verify.sh` performs live requests at that prefix and fails when the runtime does not match.

## Composition rules

All public URLs use these helpers:

```text
normalizeBasePath(value)
withBasePath(applicationPath)
publicOrigin(host)
publicUrl(host, applicationPath)
```

Given:

```text
PCI_MAIN_HOST=pci.example.com
PCI_ORCE_BASE_PATH=/BASE
```

results are:

```text
UI:       https://pci.example.com/BASE/ui/
API:      https://pci.example.com/BASE/api/v1/...
Health:   https://pci.example.com/BASE/healthz
Ready:    https://pci.example.com/BASE/readyz
Metrics:  https://pci.example.com/BASE/metrics
```

For tenant `alpha`:

```text
UI:       https://alpha-pci.example.com/BASE/ui/
API:      https://alpha-pci.example.com/BASE/api/v1/...
```

With an empty base path, all existing root URLs remain unchanged.

## Frontend bootstrap

The browser cannot fetch public configuration until it knows where the API is. It therefore derives an initial prefix only from the served document pathname ending in `/ui/`, then fetches `/api/v1/tenant-registration-config` through that derived prefix. The server returns canonical `orceBasePath`, `uiPath`, and `apiBasePath`. A mismatch fails closed instead of silently using a different path.

The browser never supplies an authoritative tenant host. Host authority comes from the server-observed HTTP request and canonical reverse-proxy tenant headers. UIBUILDER commands use a short-lived, socket-bound grant created from that HTTP context. Browser-supplied handshake and header objects are discarded.

## Envoy behavior

The main and tenant HTTPRoutes match the complete configured prefix:

```text
PathPrefix: PCI_ORCE_BASE_PATH, or / when empty
```

Envoy forwards the prefix unchanged. PCI does not apply `ReplacePrefixMatch` and does not rewrite `/BASE/api` to `/api`. This is required when Node-RED `httpNodeRoot` is already configured for `/BASE`.

An exact request to a tenant host's base root (`/BASE` or `/BASE/`) may be rewritten to `/BASE/ui/` as a convenience. The catch-all route preserves all other paths unchanged.

## Keycloak

Keycloak redirect URIs are exact public UI URLs for the main host and every current tenant:

```text
https://pci.example.com/BASE/ui/
https://alpha-pci.example.com/BASE/ui/
```

The same exact URL is used for PKCE code exchange, post-login navigation, post-logout redirects and required-action invitation emails. Web origins remain scheme plus host because origins do not contain paths.

## Backward compatibility

`PCI_ORCE_BASE_PATH=""` and `PCI_ORCE_BASE_PATH="/"` both normalize to root. They preserve:

```text
https://pci.example.com/ui/
https://pci.example.com/api/v1/...
https://alpha-pci.example.com/ui/
```

No API endpoint name changes. The prefix belongs to deployment composition, not to the application route contract.
