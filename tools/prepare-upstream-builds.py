#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Build patched private upstream copies; never mutate the supplied repositories.
Requires owner-provided complete checkouts at the exact manifest commits.
No image push, deployment or upstream submission is performed.
"""
import argparse,hashlib,importlib.util,json,subprocess
from pathlib import Path
from upstream_patch import check_row
ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',required=True);p.add_argument('--output',required=True);p.add_argument('--build',action='store_true');a=p.parse_args()
    manifest=ROOT/'deployment/prerequisites/upstream/manifest.json';rows=json.loads(manifest.read_text());out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True);results=[]
    for row in rows:
        name=row['repository'].split('/')[-1];source=Path(a.source_root).resolve()/name;target=out/name
        if target.exists():raise ValueError('Output checkout already exists: '+name)
        head=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
        if head!=row['commit']:raise ValueError('Upstream commit mismatch: '+name)
        subprocess.run(['git','clone','--no-hardlinks','--no-checkout',str(source),str(target)],check=True,capture_output=True)
        subprocess.run(['git','-C',str(target),'checkout','--detach',row['commit']],check=True,capture_output=True)
        original=target/row['file'];patch=manifest.parent/row['patch']
        checked=check_row(target,row,patch)
        subprocess.run(['git','-C',str(target),'apply','--check',str(patch)],check=True)
        subprocess.run(['git','-C',str(target),'apply',str(patch)],check=True)
        if hashlib.sha256(original.read_bytes()).hexdigest()!=checked['patchedSha256']:raise ValueError('Patched result differs')
        if a.build:
            for args in [['go','test','./...'],['go','vet','./...'],['go','build','./...']]:subprocess.run(args,cwd=target,check=True)
        results.append({**checked,'commit':head,'build':'PASS' if a.build else 'NOT_RUN'})
        (out/'receipt.json').write_text(json.dumps({'status':'BUILD_PASS_DEPLOYMENT_PENDING' if a.build else 'PATCHED_BUILD_PENDING','items':results},indent=2)+'\n')
    print(json.dumps({'status':'BUILD_PASS' if a.build else 'PATCHED','repositories':len(results),'upstreamMutations':False}))
if __name__=='__main__':main()
