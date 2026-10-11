import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';

test('deployment flow rejects arbitrary commands and exposes only sanitized runner events',()=>{
 const code=fs.readFileSync('automation/flows/lifecycle.js','utf8'),child=new EventEmitter();child.stdout=new EventEmitter();const sent=[],context=[],commands=[];
 const node={send:msg=>sent.push(msg.payload),status:()=>{},done:()=>{}};
 const env={get:name=>name==='PCI_RELEASE_ROOT'?'/release':'/private/config.json'};
 const run=msg=>vm.runInNewContext('(function(){'+code+'})()',{msg,node,env,flow:{set:(key,value)=>context.push({key,value})},childProcess:{spawn:(...args)=>{commands.push(args);return child;}},path});
 run({operation:'deploy; cat /private/token'});assert.equal(commands.length,0);assert.equal(sent.at(-1).code,'PCI-AUTOMATION-OPERATION');
 run({operation:'deploy',config:'/attacker',command:'sh'});assert.deepEqual(commands[0].slice(0,2).map(x=>JSON.parse(JSON.stringify(x))),['python3',['/release/scripts/lifecycle.py','deploy','--config','/private/config.json']]);
 run({operation:'upgrade'});assert.equal(commands.length,1);assert.equal(sent.at(-1).code,'PCI-AUTOMATION-BUSY');
 child.stdout.emit('data',Buffer.from('{"event":"pci.automation.result","status":"complete","secret":"never-expose","payload":{"token":"never-expose"}}\n'));
 child.emit('close',0);assert.equal(node.pciBusy,false);assert.equal(JSON.stringify({sent,context}).includes('never-expose'),false);assert.equal(context.at(-1).key,'pci.deployment');
});

test('lifecycle configuration pins cluster identity and refuses shared namespaces, unsafe URLs and environment injection',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pci-lifecycle-'));try{
 const cfg=JSON.parse(fs.readFileSync('automation/lifecycle.example.json')),file=path.join(root,'config.json');
 const script="import runpy,sys\nm=runpy.run_path('scripts/lifecycle.py');m['configuration'](sys.argv[1])\n";
 const check=value=>{fs.writeFileSync(file,JSON.stringify(value));return spawnSync('python3',['-c',script,file],{encoding:'utf8'}).status;};
 assert.equal(check(cfg),0);
 for(const ns of ['infrastructure','security','ocm-wstack','xfsc-orce-operator']){const bad=structuredClone(cfg);bad.g0Args[bad.g0Args.indexOf('--orce-namespace')+1]=ns;assert.notEqual(check(bad),0);}
 for(const url of ['http://pci.example.com/','https://attacker.example/','https://user:pass@pci.example.com/','https://pci.example.com/?token=secret'])assert.notEqual(check({...cfg,editorUrl:url}),0);
 assert.notEqual(check({...cfg,environment:{BASH_ENV:'/private/evil.sh'}}),0);
 assert.notEqual(check({...cfg,g0Args:[...cfg.g0Args,'--context','other']}),0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G0 ORCE patch preserves other containers, sets RWO rollout and mounts Secrets read-only idempotently',()=>{
 const text=fs.readFileSync('automation/stage1/ground-zero.sh','utf8'),filter=text.match(/PATCH="\$\(jq -c [^\n]*?'(\.spec\.template\.spec as \$s[^']+)'<<<"\$DEPLOY_JSON"/)[1];
 const args=['-c','--arg','c','orce','--arg','v','pci-data','--arg','claim','data','--arg','h','config-hash','--argjson','resources','{"requests":{"cpu":"100m","memory":"256Mi"}}','--argjson','gid','1000','--arg','nativeTls','native-tls',filter];
 const original={spec:{template:{spec:{securityContext:{fsGroup:2000},containers:[{name:'orce',volumeMounts:[{name:'settings',mountPath:'/data/settings.js'}],envFrom:[{configMapRef:{name:'original'}}]},{name:'sidecar',image:'example.invalid/sidecar'}],volumes:[{name:'settings',configMap:{name:'settings'}}]}}}};
 const execute=value=>{const r=spawnSync('jq',args,{input:JSON.stringify(value),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 const patch=execute(original),spec=patch.spec.template.spec,c=spec.containers[0];assert.equal(patch.spec.strategy.type,'Recreate');assert.equal(spec.securityContext.fsGroup,2000);assert.deepEqual(spec.containers[1],original.spec.template.spec.containers[1]);assert.equal(c.volumeMounts.find(x=>x.name==='fap-pci-secrets').readOnly,true);assert.equal(spec.volumes.find(x=>x.name==='fap-pci-secrets').secret.defaultMode,288);assert.equal(c.envFrom[0].configMapRef.name,'original');assert.deepEqual(execute(patch),patch);
});

test('privacy scanner checks complete capture coverage and finds encoded canaries across chunk boundaries without printing them',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pci-privacy-'));try{
 const canary='synthetic-private-claims-0123456789',canaryFile=path.join(root,'canary'),manifest=path.join(root,'manifest.json'),capture=path.join(root,'capture');fs.writeFileSync(canaryFile,canary+'\n');fs.writeFileSync(capture,'sanitized operations');
 const categories=['pci-logs','ocm-logs','database','nats','orce-context','traces','backups'];
 const run=entries=>{fs.writeFileSync(manifest,JSON.stringify(entries));const r=spawnSync('python3',['scripts/privacy-audit.py','--canary-file',canaryFile,'--manifest',manifest],{encoding:'utf8'});assert.equal(r.stdout.includes(canary),false);return {status:r.status,report:JSON.parse(r.stdout)};};
 assert.equal(run([{category:'pci-logs',paths:[capture]}]).report.status,'INCOMPLETE');
 const all=categories.map(category=>({category,paths:[capture]}));assert.equal(run(all).status,0);
 fs.writeFileSync(capture,'x'.repeat(65530)+Buffer.from(canary).toString('base64'));assert.equal(run(all).report.status,'FAIL');
 fs.rmSync(capture);assert.equal(run(all).report.status,'INCOMPLETE');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('database jobs share Secret trust with ORCE and enforce libpq TLS 1.3 without altering other manifests',()=>{
 const source=fs.readFileSync('automation/stage1/ground-zero.sh','utf8'),script=source.split("<<'PYDBTLS'\n")[1].split('\nPYDBTLS')[0];
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pci-db-tls-'));try{
  const file=path.join(dir,'objects.json'),job=name=>({kind:'Job',metadata:{name},spec:{template:{spec:{containers:[{name:'psql',env:[{name:'DATABASE_URL',valueFrom:{secretKeyRef:{name:'runtime',key:'url'}}}]}],volumes:[{name:'schema',configMap:{name:'schema'}}]}}}});
  const value={items:[job('fap-pci-schema-init'),job('fap-pci-platform-state'),job('unrelated-job')]};fs.writeFileSync(file,JSON.stringify(value));
  const result=spawnSync('python3',['-',file],{input:script,encoding:'utf8',env:{...process.env,PCI_DATABASE_TLS:'true',PCI_NATIVE_TLS_SECRET:'native-tls',PCI_DATABASE_TLS_CA_FILE:'/var/run/fap-pci-native-tls/ca.crt'}});assert.equal(result.status,0,result.stderr);
  const updated=JSON.parse(fs.readFileSync(file));assert.deepEqual(updated.items[2],value.items[2]);
  for(const item of updated.items.slice(0,2)){
   const pod=item.spec.template.spec,c=pod.containers[0];assert.deepEqual(c.env[0],value.items[0].spec.template.spec.containers[0].env[0]);
   assert.equal(c.env.find(x=>x.name==='PGSSLMODE').value,'verify-full');assert.equal(c.env.find(x=>x.name==='PGSSLMINPROTOCOLVERSION').value,'TLSv1.3');assert.equal(c.env.find(x=>x.name==='PGSSLMAXPROTOCOLVERSION').value,'TLSv1.3');assert.equal(c.volumeMounts[0].readOnly,true);assert.equal(pod.volumes.find(x=>x.secret).secret.defaultMode,256);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
