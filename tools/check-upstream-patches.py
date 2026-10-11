#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Verify exact source/patch/result bytes without changing an upstream checkout."""
import argparse, hashlib, json, subprocess, tempfile
from pathlib import Path
from upstream_patch import check_row

def sha(data):
    return hashlib.sha256(data).hexdigest()

def check(source_root, manifest_path):
    manifest_path=Path(manifest_path)
    rows=json.loads(manifest_path.read_text())
    results=[check_row(Path(source_root)/row['repository'].split('/')[-1],row,manifest_path.parent/row['patch']) for row in rows]
    return {'status':'PASS','method':'Private temporary copies; manifest-specific reviewed-file or exact Git-commit binding, patch SHA-256, zero-fuzz dry-run/application and result SHA-256. No Git or upstream mutation.',
            'items':results,'notRun':['Upstream Go compilation','Native service/PostgreSQL integration','Native deployment and payload-canary acceptance']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-root',required=True)
    p.add_argument('--manifest',default='deployment/prerequisites/upstream/manifest.json')
    p.add_argument('--report')
    args=p.parse_args()
    try:
        result=check(args.source_root,args.manifest)
        if args.report:Path(args.report).write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({'status':result['status'],'patches':len(result['items']),'upstreamMutations':False}))
    except (OSError,ValueError,KeyError,subprocess.SubprocessError) as error:
        print(json.dumps({'status':'FAIL','error':str(error)}))
        raise SystemExit(1)
