#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Collect allowlisted PCI test-fixture metadata without changing the cluster."""
import argparse
import json
import subprocess
import sys
import uuid


def run(command, stdin=None):
    result = subprocess.run(command, input=stdin, text=True, capture_output=True, timeout=45)
    if result.returncode:
        # Do not echo remote diagnostics: they may contain installation details.
        raise RuntimeError('Command failed: ' + ' '.join(command[:5]) + '. Check context, access and resource names locally.')
    return result.stdout


def inventory(kubectl, namespace):
    items = json.loads(run(kubectl + ['-n', namespace, 'get', 'configmaps', '-o', 'json']))['items']
    platform = next((json.loads(i.get('data', {}).get('platform.json', '{}')) for i in items
                     if i['metadata']['name'] == 'fap-pci-platform-bootstrap'), {})
    base = platform.get('orceBasePath', '')
    main = platform.get('mainHost')
    tenants = []
    for item in items:
        if not item['metadata']['name'].startswith('pci-tenant-'):
            continue
        data = item.get('data', {})
        host = data.get('primary_domain')
        tenants.append({'slug': data.get('tenant_slug'), 'tenantId': data.get('tenant_id'),
                        'baseUrl': 'https://' + host + data.get('orce_base_path', base) if host else None})
    return {'mainUrl': 'https://' + main + base if main else None,
            'bootstrapVersion': platform.get('version'), 'tenants': sorted(tenants, key=lambda t: t['slug'] or '')}


def fixture_sql(tenant):
    # UUID validation precedes SQL interpolation. No free text is interpolated.
    tenant = str(uuid.UUID(tenant))
    return """
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH resources AS (
 SELECT r.*, v.snapshot FROM pci_issuer_resources r
 LEFT JOIN pci_issuer_versions v ON v.tenant_id=r.tenant_id AND v.kind=r.kind
 AND v.resource_id=r.resource_id AND v.version=(r.document->>'activeVersion')::int
 WHERE r.tenant_id='%s'::uuid
)
SELECT json_build_object(
 'tenant', (SELECT json_build_object('tenantId',tenant_id,'slug',tenant_slug,'state',state)
            FROM tenants WHERE tenant_id='%s'::uuid),
 'members', COALESCE((SELECT json_agg(json_build_object('subject',keycloak_subject,
            'enabled',enabled,'roles',roles,'activeIssuerAssignment',EXISTS(
              SELECT 1 FROM pci_issuer_assignments a WHERE a.tenant_id=m.tenant_id
              AND a.subject=m.keycloak_subject AND NOT a.revoked)))
            FROM tenant_members m WHERE tenant_id='%s'::uuid),'[]'::json),
 'configurations', COALESCE((SELECT json_agg(json_build_object('configurationId',resource_id,
            'identifier',identifier,'state',document->>'state','activeVersion',document->'activeVersion',
            'offerConfigurationName',snapshot->>'name','issuerKey',snapshot->>'keyRef',
            'connectorId',snapshot->>'connectorId','flowId',snapshot->>'flowId',
            'signingMode',snapshot->>'signingMode','eligibility',snapshot->'eligibility'))
            FROM resources WHERE kind='configuration'),'[]'::json),
 'flows', COALESCE((SELECT json_agg(json_build_object('flowId',resource_id,
            'configurationId',configuration_id,'activeVersion',document->'activeVersion',
            'steps',COALESCE((SELECT json_agg(json_build_object('type',s->>'type','title',s->>'title',
              'fields',COALESCE((SELECT json_agg(json_build_object('name',f->>'name',
                'label',f->>'label','required',f->'required'))
                FROM jsonb_array_elements(COALESCE(s->'fields','[]'::jsonb)) f),'[]'::json)))
              FROM jsonb_array_elements(COALESCE(snapshot->'steps','[]'::jsonb)) s),'[]'::json)))
            FROM resources WHERE kind='flow'),'[]'::json),
 'metadataPublication',(SELECT json_build_object('state',state,'desired',desired,'observed',observed)
            FROM pci_metadata_publication WHERE tenant_id='%s'::uuid)
);
ROLLBACK;
""" % (tenant, tenant, tenant, tenant)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', help='Default: current kubectl context; every call is pinned to it.')
    parser.add_argument('--namespace', default='xfsc-orce-pci-orce')
    parser.add_argument('--tenant', type=uuid.UUID, help='Optional Alpha test-tenant UUID; includes its member IDs and published fixture definitions.')
    parser.add_argument('--postgres-pod', default='fap-pci-postgres-0')
    args = parser.parse_args()
    try:
        context = args.context or run(['kubectl', 'config', 'current-context']).strip()
        if not context:
            raise ValueError('No Kubernetes context selected.')
        kubectl = ['kubectl', '--context', context]
        report = {'context': context, 'namespace': args.namespace, **inventory(kubectl, args.namespace)}
        deployment = json.loads(run(kubectl + ['-n', args.namespace, 'get', 'deployment', 'xfsc-orce', '-o', 'json']))
        report['images'] = [{'container': c['name'], 'image': c['image']}
                            for c in deployment['spec']['template']['spec']['containers']]
        if args.tenant:
            shell = ('export PGPASSWORD="$POSTGRES_PASSWORD"; '
                     'export PGOPTIONS="-c default_transaction_read_only=on"; '
                     'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"')
            output = run(kubectl + ['-n', args.namespace, 'exec', '-i', args.postgres_pod,
                                   '-c', 'postgresql', '--', 'sh', '-c', shell], fixture_sql(args.tenant))
            report['alphaFixtures'] = json.loads(output)
        print(json.dumps(report, indent=2))
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as error:
        print('Collection blocked: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
