import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {configuration,fixture,alpha} from '../../support/sr2-fixture.mjs';
import {pciNativeMetadata,pciPublicCatalogue} from '../../../backend/sr2/native.js';
import {pciLdpContext,pciLdpSubject} from '../../../backend/sr2/linked-data.js';
import {sr2SemanticTemplate} from '../../../backend/sr2/semantics.js';
import {extendSr2Maintenance} from '../../../backend/sr2/maintenance.js';
import {sr2Fail} from '../../../backend/sr2/domain.js';
const issuer={issuer:'https://alpha.example.com/pci',authorizationServers:['https://alpha.example.com'],displayName:'Alpha'};
function bundle(){return {tenantId:alpha,issuer,configurations:[{id:'one',data:configuration('One')},{id:'two',data:configuration('Two')}]};}
test('wallet metadata withdraws archived entries immediately, serves empty catalogue without native and refuses stale versions',()=>{
 const b=bundle(),native=pciNativeMetadata(b,()=>null);b.configurations.shift();assert.deepEqual(Object.keys(pciPublicCatalogue(b,native).credential_configurations_supported),['Two']);
 b.configurations[0].data.name='Updated';assert.throws(()=>pciPublicCatalogue(b,native),e=>e.code==='PCI-METADATA-PENDING');
 b.configurations=[];assert.deepEqual(pciPublicCatalogue(b,null).credential_configurations_supported,{});
});
test('empty-catalogue native failure stays an actionable publication error instead of idle',async()=>{
 const f=fixture(),{config}=await f.prepared();extendSr2Maintenance(f.api);
 f.adapters.publishMetadata=async b=>{assert.equal(b.configurations.length,0);sr2Fail(409,'PCI-METADATA-EMPTY-CATALOGUE');};
 await f.api.resource(f.principal(),'configuration','archive',config.id,{},config.version);
 assert.equal((await f.api.maintenance(alpha)).state,'error');
 const state=await f.store.transaction(alpha,tx=>tx.publication());assert.equal(state.state,'error');assert.ok(Number(state.desired)>Number(state.observed));
});
test('LDP metadata, semantic example and scalar collision scope share one canonical context',()=>{
 const c={...configuration(),format:'ldp_vc',claims:[{name:'issuer',type:'string',required:true},{name:'type',type:'string',required:true}]};const template=sr2SemanticTemplate(c,issuer.issuer),context=pciLdpContext(c,issuer.issuer);
 assert.deepEqual(template.example['@context'],context);assert.deepEqual(template.context['@context'],context);assert.equal(context[2].issuer,undefined);assert.equal(context[2].type,undefined);
 assert.equal(context[2].pciClaims['@context'].type,template.vocabulary+'type');assert.equal(template.example.credentialSubject.pciClaims.issuer,'Synthetic issuer');assert.match(template.shacl,/claims> ; sh:minCount 1/);
 assert.equal(pciLdpSubject('alice@example.com'),'urn:xfsc:pci:subject:alice%40example.com');assert.equal(pciLdpSubject('did:key:abc'),'did:key:abc');
});
test('cleanup discovers a pre-registration orphan with exact ownership and never silently completes',async()=>{
 const tid=alpha,labels={'app.kubernetes.io/part-of':'fap-pci-reference','xfsc.org/pci-tenant-id':tid,'xfsc.org/pci-owner-uid':'owner','xfsc.org/pci-install-uid':'parent'},objects=new Map(),deleted=[];
 const role='/apis/rbac.authorization.k8s.io/v1/clusterroles/pci-participant-cleanup-'+tid;objects.set(role,{metadata:{uid:'role',resourceVersion:'1',labels}});
 const run=new Function('k8sRequest','k8sExpect',fs.readFileSync('backend/functions/_participant-cleanup.js','utf8')+'\nreturn pciDeleteParticipant;')(async(_,path)=>objects.has(path)?{status:200,data:objects.get(path)}:{status:404},async(_,path,options)=>{deleted.push(JSON.parse(options.body));objects.delete(path);});
 assert.equal(await run({tenant_id:tid,owner_uid:'owner'},{metadata:{uid:'parent'},data:{}}),true);assert.equal(deleted[0].preconditions.uid,'role');
 objects.set(role,{metadata:{uid:'foreign',resourceVersion:'1',labels:{...labels,'xfsc.org/pci-owner-uid':'other'}}});await assert.rejects(run({tenant_id:tid,owner_uid:'owner'},{metadata:{uid:'parent'},data:{}}),/OWNER/);assert.equal(deleted.length,1);
});
test('legacy baseline imports exact trusted values and rejects live drift and another deployment',()=>{
 const script=`import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('legacy','scripts/import-legacy-baseline.py');m=importlib.util.module_from_spec(s);sys.path.insert(0,'scripts');s.loader.exec_module(m)\nv=json.load(sys.stdin)\ntry: print(json.dumps({'patch':m.plan(v['current'],v['baseline'])}))\nexcept ValueError: print(json.dumps({'rejected':True}))`;
 const current={metadata:{name:'orce',namespace:'pci',uid:'uid',resourceVersion:'1'},spec:{template:{metadata:{},spec:{containers:[{name:'orce',env:[{name:'PCI_PARTICIPANT_ALLOWED_HOSTS',value:'new'}]}]}}}};
 const baseline={deployment:'orce',namespace:'pci',deploymentUID:'uid',container:'orce',env:{PCI_PARTICIPANT_ALLOWED_HOSTS:{before:{name:'PCI_PARTICIPANT_ALLOWED_HOSTS',value:'old'},applied:{name:'PCI_PARTICIPANT_ALLOWED_HOSTS',value:'new'}}}};
 const run=()=>JSON.parse(execFileSync('python3',['-B','-c',script],{input:JSON.stringify({current,baseline}),encoding:'utf8'}));assert.ok(run().patch);baseline.deploymentUID='foreign';assert.equal(run().rejected,true);baseline.deploymentUID='uid';current.spec.template.spec.containers[0].env[0].value='operator';assert.equal(run().rejected,true);
});
test('ground-zero mesh mode protects bootstrap jobs and lets native sidecars finish with them',()=>{
 const g0=fs.readFileSync('automation/stage1/ground-zero.sh','utf8'),script=g0.split("<<'PYDBTLS'\n")[1].split('\nPYDBTLS')[0];
 const tmp=fs.mkdtempSync('/tmp/pci-mesh-test-'),file=tmp+'/manifest.json';
 try{fs.writeFileSync(file,JSON.stringify({items:[{apiVersion:'batch/v1',kind:'Job',metadata:{name:'fap-pci-schema-init',namespace:'pci'},spec:{template:{spec:{containers:[{name:'schema'}]}}}}]}));execFileSync('python3',['-B','-',file],{input:script,env:{...process.env,PCI_MESH_REVISION:'approved-revision'}});const result=JSON.parse(fs.readFileSync(file));assert.equal(result.items[0].spec.mtls.mode,'STRICT');const template=result.items[1].spec.template;assert.equal(template.metadata.labels['istio.io/rev'],'approved-revision');assert.equal(template.metadata.annotations['sidecar.istio.io/nativeSidecar'],'true');}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('all-hop renderer demands complete role coverage and rejects bypasses and replacement UIDs',()=>{
 const script=`import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('mesh','tools/prepare-all-hop-tls.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nv=json.load(sys.stdin);i={'meshRevision':'approved','workloads':{'all':{'kind':'Deployment','name':'runtime','namespace':'pci','uid':'uid'},'edge':{'kind':'EnvoyProxy','name':'edge','namespace':'pci','uid':'edge'}},'roles':{r:('edge' if r=='gateway' else 'all') for r in m.ROLES}}\nif v.get('missing'):i['roles'].pop('nats')\ntry:print(json.dumps({'result':m.render(i,{'all':v['object'],'edge':{'kind':'EnvoyProxy','metadata':{'name':'edge','namespace':'pci','uid':'edge','resourceVersion':'1'},'spec':{'provider':{'kubernetes':{'envoyDeployment':{}}}}}})}))\nexcept ValueError:print(json.dumps({'rejected':True}))`;
 const object={kind:'Deployment',metadata:{name:'runtime',namespace:'pci',uid:'uid',resourceVersion:'1'},spec:{template:{metadata:{annotations:{}},spec:{containers:[{name:'runtime'}]}}}};
 const run=extra=>JSON.parse(execFileSync('python3',['-B','-c',script],{input:JSON.stringify({object,...extra}),encoding:'utf8'}));assert.ok(run().result);assert.equal(run({missing:true}).rejected,true);object.spec.template.metadata.annotations['traffic.sidecar.istio.io/excludeOutboundPorts']='4222';assert.equal(run().rejected,true);delete object.spec.template.metadata.annotations['traffic.sidecar.istio.io/excludeOutboundPorts'];object.metadata.uid='replaced';assert.equal(run().rejected,true);
});
