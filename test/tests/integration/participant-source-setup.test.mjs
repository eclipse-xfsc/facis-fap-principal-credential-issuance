import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

function python(source){const result=spawnSync('python3',['-B','-'],{input:source,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
const load=`import importlib.util,json,argparse,copy,tempfile,ast\nfrom pathlib import Path\nspec=importlib.util.spec_from_file_location('source_setup','scripts/deploy-test-source.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\na=argparse.Namespace(tenant_id='11111111-1111-4111-8111-111111111111',configuration_id='22222222-2222-4222-8222-222222222222',subject='33333333-3333-4333-8333-333333333333',namespace='xfsc-orce-pci-source',pci_namespace='xfsc-orce-pci-orce',gateway_namespace='infrastructure',gateway='pci-gateway',listener='https',host='pci.facis.cloud',path_prefix='/participant-source',image='ecofacis/xfsc-orce:2.0.13',node_red_cli='/data/node_modules/node-red/red.js',context='test-context',kubeconfig=__file__)\n`;

test('source settings keep baked modules readable, disable the editor and require TLS 1.3',()=>{
 const settings=python(load+`print(json.dumps(m.source_settings(a.path_prefix)))`),reads=[];
 const module={exports:{}};vm.runInNewContext(settings,{module,require:name=>{assert.equal(name,'fs');return {readFileSync:path=>{reads.push(path);return Buffer.from('ephemeral fixture');}};}});
 assert.equal(module.exports.httpAdminRoot,false);assert.equal(module.exports.httpNodeRoot,'/participant-source');assert.equal(module.exports.userDir,'/work/runtime');assert.equal(module.exports.https.minVersion,'TLSv1.3');assert.equal(module.exports.https.maxVersion,'TLSv1.3');assert.equal(reads.length,2);
 const objects=python(load+`print(json.dumps(m.build_objects(a,{'owned':'test'},json.loads(Path('reference/participant-data-source/flows.json').read_text()))))`);
 const deployment=objects.find(o=>o.kind==='Deployment'),pod=deployment.spec.template.spec,container=pod.containers[0];
 assert.equal(container.command[1],'/data/node_modules/node-red/red.js');assert.equal(container.volumeMounts.some(m=>m.mountPath==='/data'),false);
 assert.equal(pod.automountServiceAccountToken,false);assert.equal(pod.securityContext.runAsNonRoot,true);assert.equal(container.readinessProbe.httpGet.scheme,'HTTPS');
 const route=objects.find(o=>o.kind==='HTTPRoute'),tls=objects.find(o=>o.kind==='BackendTLSPolicy');
 assert.equal(route.spec.rules[0].backendRefs[0].name,tls.spec.targetRefs[0].name);assert.equal(tls.spec.validation.hostname,route.spec.hostnames[0]);assert.equal(tls.spec.validation.wellKnownCACertificates,'System');
});

test('the authored record flow rejects unauthenticated and foreign scopes and accepts an empty manual-claim record',()=>{
 const nodes=JSON.parse(fs.readFileSync('reference/participant-data-source/flows.json')),fn=nodes.find(n=>n.type==='function');
 const tenant='11111111-1111-4111-8111-111111111111',configuration='22222222-2222-4222-8222-222222222222',subject='33333333-3333-4333-8333-333333333333',token='synthetic-source-token-with-at-least-32-characters';
 const records={[tenant]:{[configuration]:{[subject]:{}}}};
 const code=fn.func;assert.ok(code.includes('timingSafeEqual'));
 return import('node:crypto').then(crypto=>{
  const run=(authorization,payload)=>vm.runInNewContext('(function(){'+code+'})()',{msg:{req:{headers:{authorization,'content-type':'application/json'}},payload},Buffer,crypto,env:{get:key=>key==='PCI_TEST_SOURCE_TOKEN'?token:JSON.stringify(records)}});
  const body={tenantId:tenant,configurationId:configuration,subject};assert.equal(run('Bearer wrong',body).statusCode,401);assert.equal(run('Bearer '+token,{...body,subject:'another'}).statusCode,404);
  const result=run('Bearer '+token,body);assert.equal(result.statusCode,200);assert.deepEqual(JSON.parse(JSON.stringify(result.payload)),{...body,claims:{}});
 });
});

test('source ownership and private-file guards reject replacement owners and conflicting records',()=>{
 const result=python(load+`\nlabels={'owner':'current'}\nm.assert_owned(None,labels)\nm.assert_owned({'metadata':{'labels':labels}},labels)\ntry:m.assert_owned({'metadata':{'labels':{'owner':'other'}}},labels);raise AssertionError('foreign owner accepted')\nexcept m.SourceSetupError:pass\nwith tempfile.TemporaryDirectory() as directory:\n p=Path(directory)/'records.json';m.private_json(p,{'only':'synthetic'});m.private_json(p,{'only':'synthetic'})\n try:m.private_json(p,{'changed':True});raise AssertionError('overwritten')\n except m.SourceSetupError:pass\n link=Path(directory)/'link.json';link.symlink_to(p)\n try:m.private_json(link,{'only':'synthetic'});raise AssertionError('symlink accepted')\n except m.SourceSetupError:pass\n assert json.loads(p.read_text())=={'only':'synthetic'}\nprint(json.dumps({'guards':'PASS'}))`);assert.equal(result.guards,'PASS');
});

test('source readiness refuses stale policy generations and another gateway',()=>{
 const result=python(load+`\nobj={'metadata':{'generation':3},'status':{'parents':[{'parentRef':{'name':a.gateway,'namespace':a.gateway_namespace},'conditions':[{'type':'Accepted','status':'True','observedGeneration':2},{'type':'ResolvedRefs','status':'True','observedGeneration':3}]}]}}\nassert not m.current_conditions(obj,'parents',a.gateway,a.gateway_namespace,['Accepted','ResolvedRefs'])\nobj['status']['parents'][0]['conditions'][0]['observedGeneration']=3\nassert m.current_conditions(obj,'parents',a.gateway,a.gateway_namespace,['Accepted','ResolvedRefs'])\nassert not m.current_conditions(obj,'parents','other-gateway',a.gateway_namespace,['Accepted','ResolvedRefs'])\nprint(json.dumps({'conditions':'PASS'}))`);assert.equal(result.conditions,'PASS');
});

test('source reapplication keeps its template stable and reloads changed flow code or TLS certificates',()=>{
 const result=python(load+`\nflow=json.loads(Path('reference/participant-data-source/flows.json').read_text())\ndef revision(nodes):return next(o for o in m.build_objects(a,{},nodes) if o['kind']=='Deployment')['spec']['template']['metadata']['annotations']['fap-pci.xfsc.org/source-code-revision']\noriginal=revision(flow);assert revision(flow)==original\na.certificate_revision='new-approved-certificate';assert revision(flow)!=original\na.certificate_revision='';changed=copy.deepcopy(flow);next(n for n in changed if n.get('type')=='function')['func']+='\\n// reviewed source change'\nassert revision(changed)!=original\nprint(json.dumps({'revision':'PASS'}))`);assert.equal(result.revision,'PASS');
});

test('participant deployment prints internal-signing connector values without a removed CLI option',()=>{
 const result=python(`import ast,argparse,json\nfrom pathlib import Path\ncode=ast.parse(Path('scripts/deploy-participant.py').read_text())\nexpression=next(n.value for n in code.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='connector' for t in n.targets))\na=argparse.Namespace(configuration_id='test-config',jwt_audience='participant-data',jwt_scopes='credential:issue',crypto_endpoint=None)\nenv={'a':a,'server':'participant.internal','trust_name':'trusted-client','issuer':'https://identity.facis.cloud'}\ndef evaluate():return eval(compile(ast.Expression(expression),'connector','eval'),env)\nassert evaluate()['signingModes']==['internal-signing']\na.crypto_endpoint='approved-core:443'\nassert evaluate()['signingModes']==['internal-signing','participant-signed']\nprint(json.dumps({'connector':'PASS'}))`);assert.equal(result.connector,'PASS');
});

test('source CLI creates a private token on first install and preserves it on retry',()=>{
 const result=python(String.raw`
import runpy,json,tempfile,copy,subprocess,contextlib,io,sys
from pathlib import Path
from unittest.mock import patch
m=runpy.run_path('scripts/configure-test-source.py')
deployment={'metadata':{'name':'source','namespace':'source-ns','uid':'source-uid','resourceVersion':'1'},'spec':{'template':{'spec':{'containers':[{'name':'orce'}]}}}}
secret=None;creates=0;patches=0
def command(args,**kwargs):
 global secret,creates,patches
 if 'get' in args and 'deployment' in args: output=json.dumps(deployment)
 elif 'get' in args and 'secret' in args: output=json.dumps(secret) if secret else ''
 elif 'create' in args:
  creates+=1;secret=json.loads(kwargs['input']);output='created'
 elif 'patch' in args:
  patches+=1;value=json.loads(args[-1]);deployment['spec']['template']['metadata']=value['spec']['template']['metadata'];deployment['spec']['template']['spec']['containers']=value['spec']['template']['spec']['containers'];output='patched'
 elif 'rollout' in args: output='ready'
 else: raise AssertionError('Unexpected command')
 return subprocess.CompletedProcess(args,0,stdout=output,stderr='')
with tempfile.TemporaryDirectory() as directory:
 records=Path(directory)/'records.json';records.write_text(json.dumps({'test':{'config':{'subject':{}}}}));token=Path(directory)/'token'
 argv=['configure-test-source.py','--context','test','--namespace','source-ns','--deployment','source','--records',str(records),'--token-file',str(token)]
 with patch.object(sys,'argv',argv),patch('subprocess.run',side_effect=command),contextlib.redirect_stdout(io.StringIO()):
  assert m['main']()==0
  first=token.read_bytes();assert len(first)>=32 and token.stat().st_mode&0o777==0o600
  assert m['main']()==0
  assert token.read_bytes()==first and creates==1 and patches==1
print(json.dumps({'tokenLifecycle':'PASS'}))
`);assert.equal(result.tokenLifecycle,'PASS');
});

test('actual participant certificate generation accepts long service names and retains DNS SAN validation',()=>{
 const result=python(String.raw`
import ast,json,tempfile,subprocess
from pathlib import Path
tree=ast.parse(Path('scripts/deploy-participant.py').read_text())
definition=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='openssl')
ca=next(n for n in ast.walk(tree) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='openssl' and len(n.value.args)>1 and isinstance(n.value.args[1],ast.Constant) and n.value.args[1].value=='-x509')
loop=next(n for n in ast.walk(tree) if isinstance(n,ast.For) and isinstance(n.target,ast.Tuple) and [x.id for x in n.target.elts]==['role','dns','usage'])
server='pci-participant.pci-participant-11111111-1111-4111-8111-111111111111.svc.cluster.local';client='pci-11111111-1111-4111-8111-111111111111.internal'
assert len(server)>64
with tempfile.TemporaryDirectory() as directory:
 environment={'tmp':Path(directory),'subprocess':subprocess,'server':server,'client_dns':client}
 exec(compile(ast.Module(body=[definition,ca,loop],type_ignores=[]),'participant-certificate-generation','exec'),environment)
 for role,dns,purpose in [('server',server,'sslserver'),('client',client,'sslclient')]:
  subprocess.run(['openssl','verify','-CAfile','ca.crt','-purpose',purpose,'-verify_hostname',dns,role+'.crt'],cwd=directory,capture_output=True,check=True)
print(json.dumps({'certificateIdentity':'PASS'}))
`);assert.equal(result.certificateIdentity,'PASS');
});
