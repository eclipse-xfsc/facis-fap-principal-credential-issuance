import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('G0 Keycloak network integration respects existing isolation and ownership',()=>{
 const result=spawnSync('python3',['-c',String.raw`
import json,sys,subprocess,hashlib
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
source=Path('automation/stage1/ground-zero.sh').read_text().split("<<'PYKCPOLICY'\n",1)[1].split('\nPYKCPOLICY',1)[0]
def run(types=None,collision=False,dry=False,second=False,numeric=False,owned=False):
    applied=[]
    pod={'metadata':{'labels':{'app':'identity'}},'spec':{'containers':[{'ports':[{'name':'http','containerPort':8080}]}]}}
    policy={'metadata':{'name':'esb-identity'},'spec':{'podSelector':{'matchLabels':{'app':'identity'}},'policyTypes':types}}
    def fake(args,**kw):
        if 'apply' in args:
            applied.append((args,json.loads(kw['input'])));return SimpleNamespace(stdout='')
        kind=args[args.index('get')+1]
        if kind=='service': data={'spec':{'selector':{'app':'identity'},'ports':[{'port':80,'targetPort':8080 if numeric else 'http'}]}}
        elif kind=='pods': data={'items':[pod]+([{'metadata':{'labels':{'app':'identity','extra':'yes'}},'spec':pod['spec']}] if second else [])}
        elif '--ignore-not-found' in args:
            data={'metadata':{'labels':{'app.kubernetes.io/managed-by':'fap-pci-keycloak-network','fap-pci.xfsc.org/namespace':'pci'}}} if owned else ({'metadata':{}} if collision else None)
        else:
            data={'items':[policy] if types else []}
            if second:data['items']=[{'spec':{'podSelector':{'matchLabels':{'extra':'yes'}},'policyTypes':['Ingress']}}]
        return SimpleNamespace(stdout=json.dumps(data) if data else '')
    with patch.object(sys,'argv',['-', 'ocm','pci','identity','http://identity.ocm.svc','{"app":"orce"}',str(dry).lower(),'kubectl']),patch.object(subprocess,'run',fake):
        exec(compile(source,'embedded-policy','exec'),{})
    return applied
args,obj=run(['Ingress','Egress'])[0]
assert obj['metadata']['namespace']=='ocm'
spec=obj['spec']; assert spec['podSelector']=={'matchLabels':{'app':'identity'}}
assert spec['ingress'][0]['ports']==[{'protocol':'TCP','port':8080}]
assert spec['ingress'][0]['from']==[{'namespaceSelector':{'matchLabels':{'kubernetes.io/metadata.name':'pci'}},'podSelector':{'matchLabels':{'app':'orce'}}}]
assert {r['ports'][0]['port'] for r in spec['egress']}=={1025,587}
assert all('podSelector' in r['to'][0] and 'namespaceSelector' in r['to'][0] for r in spec['egress'])
assert '--force-conflicts' not in args
assert run()==[]
assert 'egress' not in run(['Ingress'])[0][1]['spec']
assert 'ingress' not in run(['Egress'])[0][1]['spec']
assert '--dry-run=client' in run(['Ingress'],dry=True)[0][0]
assert run(['Ingress','Egress'],numeric=True)[0][1]==obj
assert run(['Ingress','Egress'],owned=True)[0][1]==obj
for kwargs in [{'types':['Ingress'],'collision':True},{'second':True}]:
    try:run(**kwargs)
    except SystemExit:pass
    else:raise AssertionError('Expected fail-closed policy check')
print('10 policy scenarios passed')
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
