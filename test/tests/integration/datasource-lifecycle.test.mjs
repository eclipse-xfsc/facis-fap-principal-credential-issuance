import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('datasource reapply preserves its token, rolls out changed records once and rejects foreign ownership',()=>{
 const script=String.raw`
import runpy,copy
m=runpy.run_path('scripts/configure-test-source.py');plan=m['plan'];SourceError=m['SourceError']
d={'metadata':{'name':'source','namespace':'source-ns','uid':'source-uid','resourceVersion':'7'},'spec':{'template':{'spec':{'containers':[{'name':'orce'}],'volumes':[{'name':'data','persistentVolumeClaim':{'claimName':'data'}}]}}}}
records={'alpha':{'employee':{'alice':{'name':'Synthetic Alice'}}}}
secret,patch,token,changed=plan(d,None,records,'orce');assert changed
assert plan(d,None,records,'orce',token)[2]==token,'Interrupted create rotated the private token'
try:plan(d,None,records,'orce','short');raise AssertionError('Weak recovery token accepted')
except SourceError:pass
assert patch['spec']['strategy']=={'type':'Recreate','rollingUpdate':None}
live=copy.deepcopy(d);live['spec']['template']['metadata']=patch['spec']['template']['metadata'];live['spec']['template']['spec']['containers']=patch['spec']['template']['spec']['containers']
again,_,retained,changed=plan(live,secret,records,'orce');assert not changed and retained==token and again==secret
updated=copy.deepcopy(records);updated['alpha']['employee']['alice']['name']='Synthetic Updated'
new,_,retained,changed=plan(live,secret,updated,'orce');assert changed and retained==token and new['data']['token']==secret['data']['token']
for key,value in [('fap-pci.xfsc.org/source-deployment-uid','other-uid'),('fap-pci.xfsc.org/source-container','other')]:
    bad=copy.deepcopy(secret);bad['metadata']['annotations'][key]=value
    try:plan(live,bad,records,'orce');raise AssertionError('foreign source adopted')
    except SourceError:pass
bad=copy.deepcopy(secret);bad['metadata']['labels']['app.kubernetes.io/part-of']='another-project'
try:plan(live,bad,records,'orce');raise AssertionError('foreign secret adopted')
except SourceError:pass
legacy=copy.deepcopy(secret);legacy['metadata'].pop('annotations');assert plan(live,legacy,records,'orce')[2]==token
try:plan(d,legacy,records,'orce');raise AssertionError('unbound legacy source adopted')
except SourceError:pass
assert 'metadata' not in d['spec']['template'],'Planning mutated input'
`;
 const result=spawnSync('python3',['-c',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});

test('automation errors provide safe next steps without propagating child output',()=>{
 const script=String.raw`
import runpy,json
m=runpy.run_path('scripts/lifecycle.py');error=m['LifecycleError']('PCI-AUTOMATION-CHILD-FAILED','artifacts',23)
print(json.dumps(m['problem'](error)))
`;
 const result=spawnSync('python3',['-c',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const p=JSON.parse(result.stdout);assert.equal(p.exitCode,23);assert.match(p.detail,/installation failed/);assert.match(p.nextStep,/flow revision/);
});
