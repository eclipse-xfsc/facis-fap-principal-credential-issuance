# Upgrade rc.6 to rc.7

Extract the complete rc.7 source into a new directory. Verify
`docs/release/source-sha256.txt` before running anything. Reuse the existing
private lifecycle JSON and editor password file. Deployment does not require
editing source or generated artifacts.

For a complete upgrade, run from the rc.7 source root:

```bash
python3 scripts/lifecycle.py upgrade --config /absolute/private/lifecycle.json
```

This reconciles Helm/prerequisite release metadata and installs the rebuilt
flows/UI. Artifact preparation uses bounded transport retries. Ground-zero is
not blindly replayed on an unknown failure; inspect its failed phase first.
The artifact installer does not restart ORCE; ground-zero may perform its
normal prerequisite deployment rollout.

To apply only the corrected runtime artifacts while testing the readiness fix:

```bash
python3 scripts/install-with-retries.py --config /absolute/private/lifecycle.json \
  --gateway-ip PCI_GATEWAY_IP --api-ip API_IP_1 --api-ip API_IP_2
```

This is an artifact-only update: Helm and platform-state release metadata still
identify the previous prerequisite release until the complete upgrade is run.
Temporary connection overrides and executed attempts are recorded outside
the source directory. No kubeconfig, private key or token is included in the
records. Verify `/healthz` reports rc.7, `/readyz` returns 200 and the provider
can sign in. HTTP 503 remains a real failure; review the fixed check label in
the ORCE logs rather than weakening readiness.
