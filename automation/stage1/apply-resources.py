#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Apply PCI manifests; migrate only matching Helm-owned fields on conflict.

Embedded in dist/ground-zero.sh by build.js, so the G0 artifact stays standalone.
Kubernetes output is never forwarded: an admission error can contain Secret data.
"""
import copy
import json
import re
import subprocess
import sys


class ApplyError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def emit(event, **values):
    print(json.dumps({'event': event, **values}), flush=True)


def apply_resources(manifest, namespace, infrastructure, command, run=subprocess.run):
    items = manifest.get('items') if manifest.get('kind') == 'List' else [manifest]
    if not isinstance(items, list) or not items:
        raise ApplyError('PCI-APPLY-MANIFEST')

    def execute(args, body=None):
        try:
            return run(command + args, input=body, text=True, capture_output=True,
                       timeout=60)
        except (OSError, subprocess.TimeoutExpired):
            raise ApplyError('PCI-APPLY-TRANSPORT') from None

    def matching_release(meta):
        annotations = meta.get('annotations', {})
        return (annotations.get('meta.helm.sh/release-name') == 'fap-pci'
                and annotations.get('meta.helm.sh/release-namespace') == namespace)

    def inspect(obj):
        meta = obj['metadata']
        kind, name, ns = obj['kind'], meta['name'], meta.get('namespace', '')
        if kind == 'Namespace':
            if name not in (namespace, infrastructure):
                raise ApplyError('PCI-APPLY-BOUNDARY')
        elif ns:
            if ns not in (namespace, infrastructure):
                raise ApplyError('PCI-APPLY-BOUNDARY')
        elif kind != 'GatewayClass' and (kind not in ('ClusterRole', 'ClusterRoleBinding') or name != 'fap-pci-orce-discovery'):
            raise ApplyError('PCI-APPLY-BOUNDARY')
        result = execute((['-n', ns] if ns else []) + [
            'get', kind, name, '--ignore-not-found', '--show-managed-fields=true', '-o', 'json'])
        if result.returncode:
            raise ApplyError('PCI-APPLY-READ')
        if not result.stdout.strip():
            return None
        try:
            current = json.loads(result.stdout)['metadata']
        except (ValueError, KeyError, TypeError):
            raise ApplyError('PCI-APPLY-READ') from None
        if current.get('name') != name or current.get('namespace', '') != ns:
            raise ApplyError('PCI-APPLY-IDENTITY')
        if kind == 'Namespace':
            return current
        annotations = current.get('annotations', {})
        if any(k in annotations for k in ('meta.helm.sh/release-name', 'meta.helm.sh/release-namespace')):
            if not matching_release(current):
                raise ApplyError('PCI-APPLY-FOREIGN-RELEASE')
        owned = (matching_release(current)
                 or current.get('labels', {}).get('app.kubernetes.io/part-of') == 'fap-pci'
                 or any(x.get('manager') == 'fap-pci-ground-zero'
                        for x in current.get('managedFields', [])))
        if not owned:
            raise ApplyError('PCI-APPLY-UNOWNED')
        if not current.get('uid') or not current.get('resourceVersion'):
            raise ApplyError('PCI-APPLY-IDENTITY')
        return current

    # Check the entire batch before writing any of it.
    initial = [inspect(obj) for obj in items]
    for obj, previous in zip(items, initial):
        desired = copy.deepcopy(obj)
        meta = desired['metadata']
        kind, name, ns = desired['kind'], meta['name'], meta.get('namespace', '')
        target = (['-n', ns] if ns else []) + [
            'apply', '--server-side', '--field-manager=fap-pci-ground-zero']
        result = execute(target + ['-f', '-'], json.dumps(desired))
        if result.returncode:
            conflicts = re.findall(r'conflict with "([^"]+)"', result.stderr)
            eligible = (kind not in ('Namespace', 'GatewayClass') and previous is not None
                        and matching_release(previous) and conflicts
                        and set(conflicts) == {'helm'})
            if not eligible:
                raise ApplyError('PCI-APPLY-CONFLICT' if conflicts else 'PCI-APPLY-REJECTED')
            current = inspect(obj)
            if (current is None or not matching_release(current)
                    or current.get('uid') != previous.get('uid')
                    or current.get('resourceVersion') != previous.get('resourceVersion')):
                raise ApplyError('PCI-APPLY-LIVE-DRIFT')
            meta['resourceVersion'] = current['resourceVersion']
            meta['uid'] = current['uid']
            # One object only. A resourceVersion conflict or any second failure
            # stops; there is no unbounded retry or blanket batch takeover.
            result = execute(target + ['--force-conflicts', '-f', '-'], json.dumps(desired))
            if result.returncode:
                raise ApplyError('PCI-APPLY-MIGRATION-FAILED')
            emit('pci.deploy.ownership-migrated', kind=kind, name=name, namespace=ns,
                 previousManager='helm')
        emit('pci.deploy.resource-applied', kind=kind, name=name, namespace=ns)


def main():
    try:
        path, namespace, infrastructure, *command = sys.argv[1:]
        if not command:
            raise ApplyError('PCI-APPLY-COMMAND')
        with open(path) as stream:
            manifest = json.load(stream)
        apply_resources(manifest, namespace, infrastructure, command)
    except (ApplyError, OSError, ValueError, KeyError, TypeError) as error:
        emit('pci.deploy.failed', code=getattr(error, 'code', 'PCI-APPLY-INPUT'),
             message='PCI resource application failed; inspect ownership and admission events.')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
