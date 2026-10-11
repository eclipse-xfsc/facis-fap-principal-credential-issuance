import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('installation retries transient preparation failures but never replay an ambiguous deployment or permanent error',()=>{
 const result=spawnSync('python3',['-c',`
import runpy,subprocess,tempfile
from pathlib import Path
from unittest.mock import patch
m=runpy.run_path('scripts/install-with-retries.py')
retry=m['can_retry']
for output in ['i/o timeout','curl: (28) Resolving timed out','curl: (92) HTTP/2 error','curl: (22) HTTP 503']:
 assert retry(output)
 assert not retry(output,submitted=True)
for output in ['Unauthorized','Forbidden','curl: (60) SSL certificate problem','curl: (22) HTTP 409','unknown failure']:
 assert not retry(output)
assert retry('',deadline=True)
assert not retry('',submitted=True,deadline=True)
with patch('subprocess.run',side_effect=subprocess.TimeoutExpired(['kubectl'],10)):
 response=m['captured'](['kubectl'],10)
 assert response.returncode==124 and retry(response.stderr)
with tempfile.TemporaryDirectory() as directory:
 with (Path(directory)/'result.log').open('w') as log:
  code,output,submitted,deadline=m['run_installer'](['python3','-c','print("deploying nodes: 357",flush=True);print("i/o timeout",flush=True);raise SystemExit(1)'],{},Path(directory),log,5)
 assert code==1 and submitted and not retry(output,submitted,deadline)
`],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.stderr);
});
