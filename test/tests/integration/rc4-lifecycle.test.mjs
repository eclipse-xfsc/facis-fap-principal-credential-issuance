import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {restoreRuntime} from '../../../automation/stage1/restore-runtime.mjs';
const tid='11111111-1111-4111-8111-111111111111';
function cleanupFixture(){
 const tenant={tenant_id:tid,owner_uid:'owner'},parent={metadata:{uid:'parent'},data:{participant_namespace:'pci-participant-'+tid,participant_namespace_uid:'ns-uid',participant_cleanup_role:'pci-participant-cleanup-'+tid}},calls=[];
 const labels={'app.kubernetes.io/part-of':'fap-pci-reference','xfsc.org/pci-tenant-id':tid,'xfsc.org/pci-owner-uid':'owner','xfsc.org/pci-install-uid':'parent'};
 const objects=[{metadata:{uid:'ns-uid',resourceVersion:'1',labels:{...labels}}},{metadata:{uid:'role-uid',resourceVersion:'2',labels:{...labels}}}];
 const run=new Function('k8sRequest','k8sExpect',fs.readFileSync('backend/functions/_participant-cleanup.js','utf8')+'\nreturn pciDeleteParticipant;')(async(method,path)=>{const i=path.includes('clusterroles')?1:0;return objects[i]?{status:200,data:objects[i]}:{status:404};},async(method,path,options)=>{calls.push({method,path,body:JSON.parse(options.body)});objects[path.includes('clusterroles')?1:0]=null;});
 return {run,tenant,parent,objects,calls};
}
test('tenant cleanup waits for namespace removal and deletes only its named RBAC with UID preconditions',async()=>{
 const f=cleanupFixture();assert.equal(await f.run(f.tenant,f.parent),false);assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.preconditions.uid,'ns-uid');
 assert.equal(await f.run(f.tenant,f.parent),true);assert.equal(f.calls[1].body.preconditions.uid,'role-uid');assert.equal(await f.run(f.tenant,f.parent),true);
});
test('foreign or replaced participant namespace prevents every deletion',async()=>{
 for(const modify of [f=>f.objects[0].metadata.uid='replacement',f=>f.objects[1].metadata.labels['xfsc.org/pci-owner-uid']='foreign',f=>f.parent.data.participant_namespace='ocm-wstack']){
  const f=cleanupFixture();modify(f);await assert.rejects(f.run(f.tenant,f.parent));assert.equal(f.calls.length,0);
 }
});
test('the actual Python helper journal restores env, mounts and volumes and protects operator edits',()=>{
 const original={metadata:{name:'orce',namespace:'pci',uid:'uid',resourceVersion:'1'},spec:{template:{metadata:{annotations:{}},spec:{containers:[{name:'orce',env:[{name:'PCI_OTLP_HTTP_ENDPOINT',value:'https://prior.example.com'},{name:'OTHER',value:'keep'}]}]}}}};
 const changes={env:[{name:'PCI_OTLP_HTTP_ENDPOINT',value:'https://new.example.com'},{name:'PCI_PARTICIPANT_ALLOWED_HOSTS',value:'reference.example.com'}],mounts:[{name:'pci-telemetry-trust',mountPath:'/etc/trust',readOnly:true}],volumes:[{name:'pci-telemetry-trust',configMap:{name:'trust'}}]};
 const script="import sys,json;sys.path.insert(0,'scripts');from runtime_ownership import plan;v=json.load(sys.stdin);print(json.dumps(plan(v['deployment'],'orce',**v['changes'])))";
 const patch=JSON.parse(execFileSync('python3',['-B','-c',script],{input:JSON.stringify({deployment:original,changes}),encoding:'utf8'}));
 const current={...original,spec:patch.at(-1).value},options={namespace:'pci',deployment:'orce',container:'orce'};
 const restored=restoreRuntime(original,current,options).at(-1).value;
 assert.deepEqual(restored.template.spec.containers[0].env,original.spec.template.spec.containers[0].env.slice().reverse());assert.equal(restored.template.spec.volumes?.length||0,0);
 current.spec.template.spec.containers[0].env.find(e=>e.name==='PCI_OTLP_HTTP_ENDPOINT').value='operator-new';
 assert.throws(()=>restoreRuntime(original,current,options),/HELPER-CONFLICT/);
});
