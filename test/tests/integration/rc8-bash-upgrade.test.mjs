import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const source=path.resolve('.');
const releaseVersion=fs.readFileSync(path.join(source,'VERSION'),'utf8').trim();
const installedJq=spawnSync('bash',['-c','command -v jq'],{encoding:'utf8'}).stdout.trim();
function setup(t,mode='ok'){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pci-bash-upgrade-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const root=path.join(directory,'release'),bin=path.join(directory,'bin');fs.mkdirSync(bin,{recursive:true});
 for(const file of ['scripts/upgrade-artifacts.sh','automation/stage1/install.sh','automation/stage1/merge-flows.mjs','automation/stage1/artifacts.mjs','dist/fap-pci-flow.json','dist/ui','VERSION']){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.cpSync(path.join(source,file),path.join(root,file),{recursive:true});}
 const bind=['VERSION','automation/stage1/install.sh','dist/fap-pci-flow.json'];fs.mkdirSync(path.join(root,'docs/release'),{recursive:true});
 fs.writeFileSync(path.join(root,'docs/release/source-sha256.txt'),bind.map(file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')+'  '+file).join('\n')+'\n');
 fs.writeFileSync(path.join(directory,'editor-password'),'local-fixture-password');fs.writeFileSync(path.join(directory,'kubeconfig'),'fixture');
 const g0Args=['--kubeconfig',path.join(directory,'kubeconfig'),'--context','fixture-context','--orce-namespace','pci','--orce-deployment','xfsc-orce','--orce-container','orce'];
 fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({g0Args,editorUrl:'https://pci.example.com/pci-orce',editorUsername:'admin',editorPasswordFile:path.join(directory,'editor-password')}));
 fs.writeFileSync(path.join(directory,'flows.json'),JSON.stringify({rev:'old',flows:[{id:'foreign-tab',type:'tab',label:'Existing service'}]}));
 const kubectl=`#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FIXTURE/kubectl.log"
if [[ "$MODE" == transient && "$*" == *"get --raw=/readyz"* && ! -f "$FIXTURE/read-failed" ]]; then touch "$FIXTURE/read-failed"; echo 'i/o timeout' >&2; exit 1; fi
case "$*" in
 *"config view"*) printf '%s\\n' '{"clusters":[{"cluster":{"server":"https://cp.example.com:15370"}}],"contexts":[],"users":[]}' ;;
 *"get --raw=/readyz"*) printf ok ;;
 *"get deploy"*"go-template"*) printf app=xfsc-orce ;;
 *"get deploy"*) printf '%s\\n' '{"spec":{"template":{"spec":{"containers":[{"name":"orce"}]}},"selector":{"matchLabels":{"app":"xfsc-orce"}}}}' ;;
 *"get configmap"*"PCI_MAIN_HOST"*) printf pci.example.com ;;
 *"get configmap"*"PCI_ORCE_BASE_PATH"*|*"get configmap"*"PCI_ORCE_EDITOR_PATH"*) printf /pci-orce ;;
 *"get pod"*) printf test-pod ;;
 *"exec"*"flows.json"*) printf '%s\\n' '{"version":1,"nodes":["previous-pci-node"]}' ;;
 *"exec"*|*" cp "*) : ;;
 *) echo "Unrecognized kubectl call" >&2; exit 2 ;;
esac
`;
 const curl=`#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FIXTURE/curl.log"
output=''; data=''; method=GET; url="\${!#}"; write=false
while [[ $# -gt 0 ]]; do case "$1" in
 -o|--output) output="$2"; shift 2 ;;
 --data-binary) data="\${2#@}"; method=POST; shift 2 ;;
 -X) method="$2"; shift 2 ;;
 -w|--write-out) write=true; shift 2 ;;
 *) shift ;;
esac; done
case "$url" in
 */auth/token)
 if node -e 'const fs=require("node:fs");const p=new URLSearchParams(fs.readFileSync(process.argv[1],"utf8"));process.exit(p.get("password")==="local-fixture-password"&&p.get("username")==="admin"&&p.get("scope")==="*"?0:1)' "$data"; then result='{"access_token":"fixture-editor-token"}'; else echo 'Authentication body changed credentials' >&2; exit 1; fi ;;

 */healthz) result='{"status":"ok","version":"${releaseVersion}"}' ;;
 */readyz) result='{"status":"ready","version":"${releaseVersion}"}' ;;
 */flows)
  if [[ "$method" == POST ]]; then
   printf post >> "$FIXTURE/posts"
   jq '.rev="new"' "$data" > "$FIXTURE/flows.json"
   if [[ "$MODE" == ambiguous ]]; then echo 'curl: (28) operation timed out' >&2; exit 28; fi
   result='{}'
  else
   result="$(cat "$FIXTURE/flows.json")"
   if [[ "$MODE" == malformed ]]; then result='{"flows":[]}'; fi
  fi ;;
 *) exit 2 ;;
esac
if [[ -n "$output" ]]; then printf '%s' "$result" > "$output"; else printf '%s' "$result"; fi
$write && printf 200
exit 0
`;
 // Emulate the exact reserved-variable rejection observed with the operator's
 // older jq, then use installed jq for every other real JSON operation.
 const jqCompat=String.raw`#!/usr/bin/env bash
set -euo pipefail
reserved='\$label([^[:alnum:]_]|$)'
if [[ "$*" =~ $reserved ]]; then echo 'jq: unexpected label' >&2; exit 3; fi
exec "$REAL_JQ" "$@"
`;
 for(const [name,body] of Object.entries({kubectl,curl,jq:jqCompat}))fs.writeFileSync(path.join(bin,name),body,{mode:0o755});
 return {directory,root,run:()=>spawnSync('bash',[path.join(root,'scripts/upgrade-artifacts.sh'),'--config',path.join(directory,'config.json'),'--notes',path.join(directory,'notes'),'--gateway-ip','192.0.2.10','--api-ip','192.0.2.11'],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,FIXTURE:directory,MODE:mode,REAL_JQ:installedJq}})};
}
test('Bash artifact upgrade consumes private config, keeps foreign flows and records changes without Python',t=>{
 const f=setup(t),before=fs.readFileSync(path.join(f.directory,'config.json'),'utf8'),r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
 assert.match(r.stdout,/health and readiness verified/);assert.equal(r.stdout.includes('fixture-editor-token'),false);assert.equal(r.stdout.includes('local-fixture-password'),false);
 assert.equal(fs.readFileSync(path.join(f.directory,'config.json'),'utf8'),before);
 const flows=JSON.parse(fs.readFileSync(path.join(f.directory,'flows.json')));assert.ok(flows.flows.some(n=>n.id==='foreign-tab'));assert.ok(flows.flows.length>300);
 assert.equal(fs.readFileSync(path.join(f.directory,'posts'),'utf8'),'post');
 const calls=fs.readFileSync(path.join(f.directory,'curl.log'),'utf8').split('\n');const submission=calls.find(line=>line.includes('Node-RED-Deployment-Type'));
 assert.ok(submission);assert.equal(submission.includes('--retry'),false);assert.ok(calls.some(line=>line.includes('--retry-all-errors')));
 for(const file of ['scripts/upgrade-artifacts.sh','automation/stage1/install.sh'])assert.equal(fs.readFileSync(path.join(f.root,file),'utf8').includes('python3'),false);
 assert.match(fs.readFileSync(path.join(f.directory,`notes/${releaseVersion}-source-fix-record.md`),'utf8'),/Upstream source corrections/);
});
test('ambiguous flow submission stops after one attempt even when the flow was committed',t=>{
 const f=setup(t,'ambiguous'),r=f.run();assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(fs.readFileSync(path.join(f.directory,'posts'),'utf8'),'post');assert.match(r.stderr+r.stdout,/flow hot-deploy failed/);
 assert.equal(fs.readFileSync(path.join(f.directory,'curl.log'),'utf8').includes('/healthz'),false);
});
test('malformed Admin API envelope stops before submitting any flow',t=>{
 const f=setup(t,'malformed'),r=f.run();assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(fs.existsSync(path.join(f.directory,'posts')),false);assert.match(r.stderr+r.stdout,/envelope expected/);
});

test('transient Kubernetes read failure is retried before a single successful flow submission',t=>{
 const f=setup(t,'transient'),r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(fs.existsSync(path.join(f.directory,'read-failed')),true);assert.equal(fs.readFileSync(path.join(f.directory,'posts'),'utf8'),'post');
 const probes=fs.readFileSync(path.join(f.directory,'kubectl.log'),'utf8').split('\n').filter(line=>line.includes('get --raw=/readyz'));assert.equal(probes.length,2);
});

test('stored editor password with CRLF is submitted unchanged after removing only file line endings',t=>{
 const f=setup(t);fs.writeFileSync(path.join(f.directory,'editor-password'),'local-fixture-password\r\n');const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(fs.readFileSync(path.join(f.directory,'posts'),'utf8'),'post');
});
