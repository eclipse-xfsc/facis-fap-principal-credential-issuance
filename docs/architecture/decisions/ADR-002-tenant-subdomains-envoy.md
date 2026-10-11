# ADR-002 — Exact tenant subdomains through one Envoy Gateway

**Status:** accepted

Each tenant receives `{slug}-pci.<base-domain>` and an exact `HTTPRoute`. One Envoy Gateway and one dedicated LoadBalancer serve the PCI main host and all tenants. Tenant identity is derived from the exact host and server-injected headers, not from client input.
