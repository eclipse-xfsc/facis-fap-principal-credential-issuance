# ADR-001 — ORCE is the sole PCI application runtime

**Status:** accepted

All PCI HTTP behavior, lifecycle logic, reconciliation and integrations are ORCE flows. All browser functionality is a uibuilder application. Separate Fastify, React and Go-provisioner workloads are removed. External data/IAM/protocol systems remain separate dependencies.
