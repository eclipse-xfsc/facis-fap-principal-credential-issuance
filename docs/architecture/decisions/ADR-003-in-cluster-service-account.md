# ADR-003 — Direct Kubernetes API through ORCE ServiceAccount

**Status:** accepted

ORCE uses its mounted ServiceAccount token and CA with Kubernetes REST discovery and server-side apply. Kubeconfig, shell-generated manifests and a separate provisioner service are not used. Bootstrap RBAC is narrowed after Envoy controller installation.
