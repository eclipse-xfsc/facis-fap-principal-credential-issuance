import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const runner=String.raw`
import importlib.util,json,sys,types,contextlib,io
s=importlib.util.spec_from_file_location('apply','automation/stage1/apply-resources.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
v=json.load(sys.stdin);kind=v.get('kind','ConfigMap');ns='' if kind in ['Namespace','ClusterRole','GatewayClass'] else 'pci';name='pci' if kind=='Namespace' else 'envoy' if kind=='GatewayClass' else 'fap-pci-orce-discovery' if kind=='ClusterRole' else 'fap-pci-config'
meta={'name':name,'uid':'one','resourceVersion':'7','annotations':{'meta.helm.sh/release-name':v.get('release','fap-pci'),'meta.helm.sh/release-namespace':v.get('releaseNs','pci')},'managedFields':[{'manager':'helm'}]}
if ns:meta['namespace']=ns
obj={'apiVersion':'v1','kind':kind,'metadata':{'name':name},'data':{'key':'synthetic'}}
if ns:obj['metadata']['namespace']=ns
calls=[];reads=0
messages=[]
def fake(args,**kwargs):
 global reads
 calls.append({'args':args,'body':json.loads(kwargs['input']) if kwargs.get('input') else None})
 if 'get' in args:
  reads+=1
  if v.get('missing'):return types.SimpleNamespace(returncode=0,stdout='',stderr='')
  current=json.loads(json.dumps(meta))
  if reads>1 and v.get('drift'):current[v['drift']]='changed'
  return types.SimpleNamespace(returncode=0,stdout=json.dumps({'metadata':current}),stderr='')
 forced='--force-conflicts' in args
 conflict=v.get('conflict','helm')
 if (not forced and conflict) or (forced and v.get('retryFail')):
  return types.SimpleNamespace(returncode=1,stdout='',stderr='private-token-must-not-leak conflict with "'+conflict+'": .data.key')
 return types.SimpleNamespace(returncode=0,stdout='private-token-must-not-leak',stderr='')
stream=io.StringIO()
try:
 with contextlib.redirect_stdout(stream):m.apply_resources({'kind':'List','items':[obj]},'pci','infra',['kubectl','--context','bound'],fake)
 code='PASS'
except m.ApplyError as e:code=e.code
print(json.dumps({'code':code,'calls':calls,'output':stream.getvalue()}))
`;
const run=v=>JSON.parse(execFileSync('python3',['-B','-c',runner],{input:JSON.stringify(v),encoding:'utf8'}));
test('G0 migrates exactly one matching Helm object with UID/resourceVersion guards and JSON logs',()=>{
 const r=run({});assert.equal(r.code,'PASS');const forced=r.calls.filter(c=>c.args.includes('--force-conflicts'));assert.equal(forced.length,1);assert.equal(forced[0].body.metadata.resourceVersion,'7');assert.equal(forced[0].body.metadata.uid,'one');assert.equal(forced[0].body.kind,'ConfigMap');assert.equal(r.output.includes('private-token-must-not-leak'),false);for(const line of r.output.trim().split('\n'))assert.ok(JSON.parse(line).event);
});
test('G0 stops before applying foreign releases, including the same release name in a different namespace',()=>{
 for(const v of [{release:'foreign'},{releaseNs:'foreign'}]){const r=run(v);assert.equal(r.code,'PCI-APPLY-FOREIGN-RELEASE');assert.equal(r.calls.some(c=>c.args.includes('apply')),false);}
});
test('G0 never forces another manager, shared namespace/class, changed object or failed retry',()=>{
 for(const v of [{conflict:'operator'},{kind:'Namespace'},{kind:'GatewayClass'},{drift:'uid'},{drift:'resourceVersion'}]){const r=run(v);assert.notEqual(r.code,'PASS');assert.equal(r.calls.some(c=>c.args.includes('--force-conflicts')),false);}
 const r=run({retryFail:true});assert.equal(r.code,'PCI-APPLY-MIGRATION-FAILED');assert.equal(r.calls.filter(c=>c.args.includes('--force-conflicts')).length,1);
});
test('G0 creates fresh resources and repeats unchanged applies without forced takeover',()=>{
 for(const v of [{missing:true,conflict:''},{conflict:''},{kind:'ClusterRole'}]){const r=run(v);assert.equal(r.code,'PASS');if(v.conflict==='')assert.equal(r.calls.some(c=>c.args.includes('--force-conflicts')),false);}
});
