import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',env:{...process.env,NO_COLOR:'1',FORCE_COLOR:'0'}});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)throw new Error(`${command} validation failed`);return r.stdout;}
const version=fs.readFileSync('VERSION','utf8').trim();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]).sort();}
function manifest(){return Object.fromEntries(files('dist').map(f=>[f,hash(fs.readFileSync(f))]));}
run(process.execPath,['build.js']);
const documentation=JSON.parse(run(process.execPath,['tools/check-documentation.mjs']).trim());
const suites=['static','bdd','integration'].flatMap(dir=>files('test/tests/'+dir).filter(f=>f.endsWith('.test.mjs')));
const output=run(process.execPath,['--test','--test-reporter=tap',...suites]);
for(const f of [...files('automation/stage1').filter(f=>f.endsWith('.sh')),...files('scripts').filter(f=>f.endsWith('.sh')),'reference/participant-data-repository/generate.sh','dist/ground-zero.sh'])run('bash',['-n',f]);
const g0Report=JSON.parse(run('python3',['tools/check-g0-manifests.py']).trim());
const bddCatalogue=JSON.parse(run('python3',['tools/check-bdd-catalogue.py']).trim());
const pythonSyntax=JSON.parse(run('python3',['-c',`import ast,json
from pathlib import Path
paths=[p for p in Path('.').rglob('*.py') if not set(p.parts)&{'node_modules','.git','.build','__pycache__'}]
for p in paths: ast.parse(p.read_text(),filename=str(p))
print(json.dumps({'status':'PASS','files':len(paths)}))`]).trim());
const first=manifest();run(process.execPath,['build.js']);const second=manifest();if(JSON.stringify(first)!==JSON.stringify(second))throw new Error('Build is not deterministic');
const authored=files('.').filter(f=>!f.split(path.sep).some(p=>['node_modules','.build','.git'].includes(p)));
for(const f of authored){if(/\.(pem|key|crt|pfx|p12|kubeconfig|log|pyc)$/i.test(f)||/^kubeconfig(?:\.|$)/.test(path.basename(f)))throw new Error('Forbidden release file: '+f);
 if(/\.(json|js|mjs|md|sh|sql|yml|yaml|go|txt|py|in)$/.test(f)){const text=fs.readFileSync(f,'utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)||/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text))throw new Error('Potential secret literal in '+f);}}
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));if(lock.version!==version||lock.packages[''].version!==version)throw new Error('Lockfile version differs');
const schema=fs.readFileSync('backend/sr2/schema.sql','utf8'),g0=fs.readFileSync('automation/stage1/ground-zero.sh','utf8');if(!g0.includes('-- BEGIN SR2 SCHEMA\n'+schema+'-- END SR2 SCHEMA'))throw new Error('Embedded schema differs');
const summary={version,node:process.version,tests:Number(output.match(/^# tests (\d+)$/m)?.[1]),passed:Number(output.match(/^# pass (\d+)$/m)?.[1]),failed:Number(output.match(/^# fail (\d+)$/m)?.[1]),skipped:Number(output.match(/^# skipped (\d+)$/m)?.[1]),deterministic:true,g0Yaml:g0Report,documentation,bddCatalogue,pythonSyntax,shellSyntax:'PASS',secretLiteralScan:'PASS',dist:second,notRun:['PostgreSQL server migration/concurrency','Go/Goa/protobuf compile and race tests','Helm lint/template and Kubernetes/ArgoCD admission','XFSC BDD Executor, Chromium browser and accessibility','Real ORCE/Keycloak/Entra/OCM/NATS/participant/PCM deployments','MkDocs build and semantic JSON-LD/SHACL engine validation','npm install/audit and official Eclipse workflows']};
if(process.env.PCI_OFFLINE_REPORT)fs.writeFileSync(process.env.PCI_OFFLINE_REPORT,JSON.stringify(summary,null,2)+'\n');
console.log('OFFLINE_SUMMARY '+JSON.stringify(summary));
