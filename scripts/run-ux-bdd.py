#!/usr/bin/env python3
# Copyright (c) 2026 LEANEA GmbH and others.
#
# This program and the accompanying materials are made available under the
# terms of the Apache License, Version 2.0 which is available at
# https://www.apache.org/licenses/LICENSE-2.0.
#
# SPDX-License-Identifier: Apache-2.0
#
# Prepared with AI-assisted tools and reviewed by the author.
# Assisted-by: AI

"""Run deployed PCI UX tests with private sessions and a minimal public summary."""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
import uuid

ROOT = Path(__file__).resolve().parents[1]
FEATURES = ['runtime.feature', 'administration.feature', 'offer.feature']
EXPECTED = {
    'Dependencies are ready',
    'Invalid deployment arguments fail early',
    'Delegated administrator uses the real workspace',
    'Principal cannot create configurations',
    'Envoy overwrites forged tenant headers',
    'Draft validation errors persist until dismissed',
    'Create, reorder, preview and publish a credential journey',
    'Tenant settings tabs work at desktop and narrow widths',
    'An incomplete connector cannot be activated',
    'An archived draft stops accepting edits',
    'Grant and revoke issuer administration through the UI',
    'Complete the configured synthetic journey',
}
ROLES = ['alphaAdmin', 'alphaPrincipal']

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)

def private_directory(value):
    path = Path(value).expanduser().resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError('Keep private test files outside the Git checkout.')
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)
    return path

def config(private):
    cfg = json.loads((private / 'environment.json').read_text())
    def https(value):
        p = urlsplit(value)
        if p.scheme != 'https' or not p.hostname or p.username or p.password or p.query or p.fragment or p.hostname.endswith('.example.com'):
            raise ValueError('Replace example URLs with real HTTPS PCI base URLs, without /ui/.')
        if p.path.rstrip('/').endswith('/ui'):
            raise ValueError('Configure the PCI base URL, without /ui/.')
    for key in ['mainUrl', 'alphaUrl', 'betaUrl']:
        https(cfg[key])
    for key in ['alphaTenantId', 'betaTenantId']:
        uuid.UUID(cfg[key])
    if cfg['alphaTenantId'] == cfg['betaTenantId']:
        raise ValueError('Alpha and Beta must be different test tenants.')
    if cfg.get('allowUxMutations') is not True:
        raise ValueError('Set allowUxMutations=true only for your dedicated synthetic Alpha tenant.')
    for role in ROLES:
        entry = cfg['sessions'][role]
        if entry['url'].rstrip('/') != cfg['alphaUrl'].rstrip('/'):
            raise ValueError('Both Alpha sessions must use alphaUrl.')
        state = Path(entry['stateFile']).expanduser()
        state = (private / state).resolve() if not state.is_absolute() else state.resolve()
        if not state.is_file() or state.stat().st_mode & 0o077:
            raise ValueError('Capture both private browser sessions with mode 0600.')
        json.loads(state.read_text())
        entry['stateFile'] = str(state)
    case = cfg['delegationCase']
    uuid.UUID(case['configurationId'])
    if case['tenantId'] != cfg['alphaTenantId'] or case['session'] != 'alphaPrincipal':
        raise ValueError('Delegation must use the ordinary Alpha principal and Alpha tenant.')
    if not case['subject'] or 'REPLACE' in case['subject']:
        raise ValueError('Set the ordinary principal subject ID in delegationCase.')
    if not cfg.get('offerConfigurationName') or 'REPLACE' in cfg['offerConfigurationName']:
        raise ValueError('Choose an existing published synthetic offer configuration.')
    if not cfg.get('issuerKey'):
        raise ValueError('Set an existing tenant signing-key reference.')
    if cfg.get('allowDestructiveAcceptance') is not False:
        raise ValueError('This runner requires allowDestructiveAcceptance=false.')
    return cfg

def summarize(features):
    """Require each exact selected scenario once; never accept zero/partial runs."""
    found = {}
    invalid = False
    for feature in features:
        inherited = set(feature.get('tags', []))
        for scenario in feature.get('elements', []):
            if scenario.get('type') != 'scenario':
                continue
            tags = inherited | set(scenario.get('tags', []))
            if 'pci-ux' not in tags:
                continue
            name = scenario.get('name')
            if name not in EXPECTED or name in found:
                invalid = True
                continue
            steps = scenario.get('steps', [])
            passed = scenario.get('status') == 'passed' and bool(steps) and all(step.get('result', {}).get('status') == 'passed' for step in steps)
            found[name] = 'PASS' if passed else 'FAIL'
    passed = not invalid and set(found) == EXPECTED and all(v == 'PASS' for v in found.values())
    return {'status': 'PASS' if passed else 'FAIL', 'expectedScenarios': len(EXPECTED),
            'passedScenarios': sum(v == 'PASS' for v in found.values()),
            'scenarios': [{'name': name, 'status': found.get(name, 'NOT_EXECUTED')} for name in sorted(EXPECTED)]}

def checked(command, **kwargs):
    subprocess.run(command, cwd=ROOT, check=True, **kwargs)

def run(private, args):
    public = ROOT / 'docs/testing/evidence/fr61-ux-summary.json'
    public.unlink(missing_ok=True)
    if not re.fullmatch(r'v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?', args.release):
        raise ValueError('Use the deployed release version, for example 1.0.0.')
    cfg = config(private)
    python = private / 'venv/bin/python'
    if not python.is_file():
        raise ValueError('Run the setup command first.')
    # Verify the inherited official Executor is installed, not a replacement.
    checked([str(python), '-c', 'from eu.xfsc.bdd.core.steps import *; import playwright.sync_api'])
    identifier = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
    evidence = private / 'runs' / identifier
    evidence.mkdir(parents=True, mode=0o700)
    resolved = evidence / 'environment.json'
    write_json(resolved, cfg)
    env = {**os.environ, 'PCI_BDD_CONFIG': str(resolved), 'PCI_BDD_ALLOW_MUTATIONS': '1', 'PCI_BDD_ALLOW_LIFECYCLE': '0'}
    env['PCI_BDD_HEADFUL'] = '1' if args.headful else '0'
    report = evidence / 'behave.json'
    command = [str(python), '-m', 'behave', *['test/bdd/features/' + f for f in FEATURES],
               '--tags=pci-ux', '--format=json', '--outfile=' + str(report),
               '--junit', '--junit-directory=' + str(evidence / 'junit')]
    with (evidence / 'runner.log').open('w') as log:
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        summary = summarize(json.loads(report.read_text()))
    except (OSError, ValueError, TypeError):
        summary = summarize([])
    if result.returncode:
        summary['status'] = 'FAIL'
    hashes = {}
    for folder in ['test/bdd']:
        for path in sorted((ROOT / folder).rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts and path.suffix in ['.py', '.feature', '.txt']:
                hashes[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    for name in ['scripts/run-ux-bdd.py', 'scripts/capture-browser-session.py']:
        hashes[name] = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True)
    summary.update({'requirement': 'FR-PCI-61', 'environment': args.environment,
                    'declaredDeploymentRelease': args.release, 'executedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                    'checkoutCommit': commit.stdout.strip() if commit.returncode == 0 else None,
                    'executorCommit': '478909cdd735bbab8bb63ce955183713d6bb387b',
                    'testFileSha256': hashes, 'rawReportSha256': hashlib.sha256(report.read_bytes()).hexdigest() if report.is_file() else None,
                    'scope': 'Deployed PCI runtime, UI administration, authorization and principal offer journey. Tenant deletion, uninstall, PCM device and full IdP enrollment suites are not selected.'})
    write_json(evidence / 'summary.json', summary)
    if summary['status'] == 'PASS':
        public.parent.mkdir(parents=True, exist_ok=True)
        write_json(public, summary)
        print('PASS: all 12 deployed UX scenarios passed. Commit docs/testing/evidence/fr61-ux-summary.json.')
    else:
        print('FAIL: no publishable PASS summary created. Fix failures and rerun. Do not use an older PASS summary for this run.')
    print('Private reports: ' + str(evidence))
    return 0 if summary['status'] == 'PASS' else 1

def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--private-dir', default=os.getenv('PCI_UX_PRIVATE', str(Path.home() / '.local/share/fap-pci-ux')))
    subs = p.add_subparsers(dest='action', required=True)
    subs.add_parser('init')
    subs.add_parser('setup')
    subs.add_parser('check')
    capture = subs.add_parser('capture');capture.add_argument('role', choices=ROLES)
    execute = subs.add_parser('run');execute.add_argument('--release', required=True);execute.add_argument('--environment', required=True, choices=['OSC', 'IONOS']);execute.add_argument('--headful', action='store_true')
    a = p.parse_args()
    try:
        private = private_directory(a.private_dir)
        if a.action == 'init':
            target = private / 'environment.json'
            if target.exists():
                raise ValueError('environment.json already exists; edit it instead of overwriting it.')
            cfg = json.loads((ROOT / 'test/bdd/ux-environment.example.json').read_text())
            for role, filename in [('alphaAdmin', 'alpha-admin.json'), ('alphaPrincipal', 'alpha-principal.json')]:
                cfg['sessions'][role]['stateFile'] = str(private / filename)
            write_json(target, cfg);print('Edit ' + str(target));return 0
        if a.action == 'setup':
            checked([sys.executable, '-m', 'venv', str(private / 'venv')])
            python = private / 'venv/bin/python'
            checked([str(python), '-m', 'pip', 'install', '-r', 'test/bdd/requirements.txt', '-c', 'test/bdd/constraints.txt'])
            checked([str(python), '-m', 'playwright', 'install', 'chromium'])
            print('Executor and Chromium installed.');return 0
        if a.action == 'capture':
            cfg = json.loads((private / 'environment.json').read_text());entry = cfg['sessions'][a.role]
            https = urlsplit(entry['url'])
            if https.scheme != 'https' or not https.hostname or https.username or https.password or https.query or https.fragment or https.hostname.endswith('.example.com'):
                raise ValueError('Set real HTTPS session URLs before capture.')
            state = Path(entry['stateFile']).expanduser().resolve()
            if state.parent != private:
                raise ValueError('Session files must be directly inside the private directory.')
            checked([str(private / 'venv/bin/python'), 'scripts/capture-browser-session.py', '--url', entry['url'].rstrip('/') + '/ui/', '--out', str(state)])
            return 0
        if a.action == 'check':
            config(private);print('Local configuration and session files are ready. Live session validity is checked by the scenarios.');return 0
        return run(private, a)
    except (KeyError, ValueError, OSError, subprocess.CalledProcessError) as exc:
        print('Setup/run blocked: ' + str(exc), file=sys.stderr)
        return 2

if __name__ == '__main__':
    sys.exit(main())
