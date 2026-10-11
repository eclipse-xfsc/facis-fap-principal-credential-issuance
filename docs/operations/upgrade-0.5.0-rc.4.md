# Upgrade to 0.5.0-rc.4

Preserve the database, runtime/original-deployment Secrets, participant trust and PVCs. Use the same release configuration and context as the [rc.3 procedure](upgrade-0.5.0-rc.3.md); run the current build and G0 before importing the new flow and UI. No database reset is required.

1. Back up the database, Keycloak realm and named Secrets. Run G0 to add the IAM table, signed broker-session mapper and bounded Secret/cleanup read permissions. The tenant-identity Secret is outside Helm history; include it in operator backups.
2. Import the new canonical flow and UI using the ownership-aware installer. Existing sessions must sign in again to establish the identity revision.
3. Configure each tenant's provider in Organization sign-in. The global rc.3 Entra alias is not used by rc.4. Verify fresh login, subject mapping, audience/scopes and a synthetic issuance before enabling broader use.
4. Re-run `deploy-participant.py` for each reference deployment with its original IDs/image/source inputs. The helper registers existing short-name namespaces or creates collision-resistant full-UUID names, attaches exact owner identities, and grants deletion only for that namespace and cleanup role. Namespace GC must finish before tenant deletion can be marked complete. Do not place unrelated workloads in these dedicated helper namespaces.
5. Re-run telemetry setup. New helper mutations are recorded in the Deployment's ownership journal and restore only their own prior fields. Conflicting later operator edits block uninstall.

**Legacy limitation:** rc.3 helpers did not record their previous explicit environment values or mounts. A later journal cannot prove that missing history. Before accepting an rc.3-to-rc.4 uninstall, reconcile legacy helper overrides against `fap-pci-original-orce` and operator change records, then record the approved baseline. Never delete unknown resources or infer permission from a name alone. Full legacy cleanup remains an acceptance blocker until this check is recorded.

For participant-signed linked-data credentials, provide the helper's `--ldp-endpoint`, `--ldp-origin`, `--ldp-server-name`, `--ldp-cert`, `--ldp-key`, and `--ldp-ca`. The endpoint is the approved native TSA HTTPS service; the origin is the exact tenant credential issuer URL. JWT/SD-JWT participant signing continues to use Core gRPC. Run the Go generation/build/race-test job before using a new image.

Revocation intents survive restart. Recovery uses native status readback, retries a stable operation and blocks reissuance while the outcome is unresolved. History offers a Retry revocation action; manual unblock is refused until revocation is resolved. Observe the native status and audit trail during fault-injection acceptance.

Execute the expanded [live acceptance procedure](../testing/live-acceptance.md), including the fresh-login, native-format, PCM and participant-deletion cases on disposable installations. Roll back with reviewed backups if needed; do not present unexecuted scenarios as acceptance.
