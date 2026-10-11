import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('current-commit patch verification rejects downgrade, edited source and changed patch without upstream mutations',()=>{
 const script=String.raw`
import hashlib,json,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,'tools')
from upstream_patch import check_row
with tempfile.TemporaryDirectory() as d:
 p=Path(d);source=p/'checkout';source.mkdir()
 def git(*args):return subprocess.check_output(['git','-C',str(source),*args],stderr=subprocess.DEVNULL).decode().strip()
 git('init');git('config','user.name','Synthetic Test');git('config','user.email','test@example.invalid')
 target=source/'example.txt';original='first\npayload logging\nlast\n';target.write_text(original)
 git('add','example.txt');git('commit','-m','Synthetic fixture')
 patch=p/'privacy.patch';patch.write_text('--- a/example.txt\n+++ b/example.txt\n@@ -1,3 +1,3 @@\n first\n-payload logging\n+sanitized logging\n last\n')
 row={'repository':'synthetic/example','file':'example.txt','commit':git('rev-parse','HEAD'),'patch':patch.name,'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'verificationMode':'git-commit-and-zero-fuzz-hunk'}
 result=check_row(source,row,patch);assert result['zeroFuzzApplication']=='PASS'
 assert result['patchedSha256']==hashlib.sha256(original.replace('payload','sanitized').encode()).hexdigest()
 assert target.read_text()==original and git('status','--porcelain')==''
 def rejected(r):
  try:check_row(source,r,patch)
  except ValueError:return
  raise AssertionError('Unsafe input accepted')
 rejected({**row,'commit':'0'*40})
 target.write_text(original+'uncommitted\n');rejected(row);target.write_text(original)
 patch.write_text(patch.read_text()+'changed');rejected(row)
 print(json.dumps({'status':'PASS','upstreamMutations':False}))
`;
 const r=spawnSync('python3',['-B','-c',script],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'PASS');
});
