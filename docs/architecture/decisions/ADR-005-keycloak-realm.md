# ADR-005 — Separate FAP PCI realm in existing OCM Keycloak

**Status:** accepted

PCI reuses the running Keycloak service but creates a logically isolated `fap-pci` realm, public PKCE client, application roles and tenant-attribute token mappers. Static review tokens are removed.
