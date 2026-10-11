# Deploy rc.6 with OCM-WStack ESB 12.3.9

This complete source package contains the rebuilt distribution. Deploy it into
the dedicated PCI ORCE after OCM-WStack is healthy. A fresh installation does
not read settings from a previous PCI ConfigMap. No backup step is required for
the disposable development cluster described for this release.

## Prepare inputs outside the source tree

Use `automation/lifecycle.example.json` as the template for a **private copy**
outside this source directory, for example `/private/pci-lifecycle.json`, mode
0600. Replace the kubeconfig path and context with those of the reprovisioned
cluster, certificate/key paths, provider email, domain, editor URL and the
installed StorageClass. Set `editorPasswordFile` to an existing private file
containing the ORCE editor password. This is the editor account, not a PCI user.
The runner reads it without an interactive stdin prompt. Keep credentials out
of deployment notes and the source tree.

The example uses `ocm-wstack`, `ocm-ui-keycloak:8080/orce/identity`, infrastructure
NATS and a dedicated PCI Gateway. Check those names against the new cluster.
G0 discovers the public Keycloak URL; an explicit `--keycloak-public-url` input
is available if discovery is ambiguous. Do not copy the old cluster's public URL
without checking it. The TLS certificate must cover the provider and tenant
names, and DNS must point to the newly allocated PCI Gateway address.

For a first development smoke test the example selects the existing internal
HTTP/NATS compatibility profile. **That profile does not satisfy the all-hop
TLS 1.3 requirement.** Use the supplied [TLS overlay and inventory](../../deployment/prerequisites/all-hop-tls/README.md)
and [transport configuration](transport.md) with the OCM owner for acceptance.

## Install the shipped artifacts

From the extracted source root, verify the archive contents and use the
non-interactive lifecycle runner:

```bash
sha256sum -c docs/release/source-sha256.txt
python3 scripts/lifecycle.py deploy --config /private/pci-lifecycle.json
```

The first command reads files only. The second changes the selected cluster and
ORCE `/data`, as required to deploy; it does not edit this source or distribution.
It runs G0, telemetry preparation, editor authentication, and flow/UI import.
The import retains non-PCI nodes and uses optimistic flow revision checks. It
does not restart ORCE merely to install the flow/UI. G0 may roll ORCE when its
configuration changes. DNS, native service readiness and editor authorization
must be available for the full run to finish.

The same configuration supports a repeat deployment or upgrade:

```bash
python3 scripts/lifecycle.py upgrade --config /private/pci-lifecycle.json
```

If prerequisites finished but editor authentication or import failed, correct
the private credential/configuration input and resume only the artifact phase:

```bash
python3 scripts/lifecycle.py install-artifacts --config /private/pci-lifecycle.json
```

This uses the password file and avoids the earlier Python-heredoc stdin/TTY
errors. It still checks the selected context and existing G0 prerequisites.

## Existing Helm installations

The rc.1/rc.5 upgrade workarounds are now in
`automation/stage1/apply-resources.py`, embedded by the normal build into G0.
Do not manually patch the password path, discovery rules or schema ConfigMap.
G0 checks ownership, applies one object, and retries a Helm-only conflict once
only when both release name `fap-pci` and release namespace match. The retry is
bound to the inspected UID/resourceVersion. Foreign ownership, other managers,
shared Namespace/GatewayClass conflicts and concurrent changes stop the run.
Unrelated fields are not submitted for takeover. Kubernetes error bodies are
not copied to logs because they may contain Secret data.

## Validate before acceptance

Check `https://<provider>/pci-orce/readyz`, the provider UI, platform status and
tenant routing, then follow the [ordered acceptance walkthrough](../testing/acceptance-walkthrough.md).
Capture the release version, image digests, rendered settings, fresh install,
repeat install and upgrade results. A green G0 result is prerequisite completion;
it is not a successful native issuance test.

For this OCM update, run JWT, SD-JWT and linked-data issuance, then verify
revocation/suspension and native-status outage rejection. Run presentation
success and revoked/expired/incorrect-holder failures. Check actual Crypto 2.3.7
and Retrieval 1.1.7-alpha provenance. The regression tests use local contract
servers; they do not establish published image behavior.

If the pre-authorization bridge still reports Redis `WRONGPASS`, reconcile its
Secret/Redis credentials through the OCM source and redeploy that stack. PCI
does not rewrite shared OCM credentials or hide dependency failures.

Record any environment-specific adjustment in your deployment-test-notes outside
the source tree. Record resource, previous/new non-secret settings, reason,
source file requiring the change, and validation result. Do not make unrecorded
patches to the shipped source, generated artifacts or shared application images.
The current source fixes are listed in [changes.json](../release/changes.json).
