# ADR-004 — OCM deployment ownership

**Status:** accepted; network integration exception added 2026-10-05.

PCI requires preinstalled OCM. G0 never installs, upgrades or removes OCM workloads. G0 configures its dedicated Keycloak realm and manages one separately named NetworkPolicy in OCM for PCI identity and SMTP traffic. Existing ESB policies remain in place. This policy is excluded from the PCI Helm release and uses the operator kubeconfig; PCI runtime RBAC receives no OCM mutation permission. Tenant lifecycle cannot uninstall OCM.
