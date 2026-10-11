#!/usr/bin/env python3
"""Render static G0 YAML heredocs without executing deployment commands.

Checks default/explicit storage, both mail modes, and empty/nested base paths.
This is YAML validation, not Kubernetes server admission or Helm execution.
Requires PyYAML 6.x (development check only).
"""
from pathlib import Path
import itertools,json,re,yaml
source=Path('automation/stage1/ground-zero.sh').read_text()
blocks=re.findall(r'cat <<YAML \| apply_stdin\n(.*?)\nYAML',source,re.S)
assert len(blocks)>=10,'Expected deployment manifest blocks'
class UniqueLoader(yaml.SafeLoader):pass
def mapping(loader,node,deep=False):
    result={}
    for key,value in node.value:
        k=loader.construct_object(key,deep=deep)
        if k in result:raise ValueError('Duplicate YAML key '+str(k))
        result[k]=loader.construct_object(value,deep=deep)
    return result
UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,mapping)
count=0
for storage,mail,base in itertools.product([False,True],['mailpit','smtp'],['','/pci-orce','/a/b']):
    env={'BASE_DOMAIN':'example.com','DATA_CLAIM':'pci-data','ENVOY_NS':'infrastructure','GATEWAY_CLASS':'eg','GATEWAY_LISTENER':'https','GATEWAY_NAME':'pci-gateway','GID_NOW':'1000','INFRA_NS':'infrastructure','MAILPIT_HOST':'mailpit-pci.example.com','MAILPIT_IMAGE':'axllent/mailpit:v1.31.4','MAILPIT_REPLICAS':'1' if mail=='mailpit' else '0','MAIN_HOST':'pci.example.com','OCM_NS':'ocm-wstack','ORCE_DATA_SIZE':'5Gi','ORCE_IMAGE':'example.invalid/orce:test','ORCE_NS':'pci','ORCE_SERVICE':'orce','ORCE_SERVICE_PORT':'1880','POSTGRES_IMAGE':'postgres:17.4-alpine3.21','POSTGRES_SIZE':'4Gi','PSC':'      storageClassName: standard' if storage else '', 'SC':'  storageClassName: standard' if storage else '', 'SMTP_ENV':"          - {name: ALLOWED_SENDER_DOMAINS, value: 'example.com'}"+ ("\n          - {name: RELAYHOST, value: 'smtp.example.com:587'}" if mail=='smtp' else ''),'SMTP_RELAY_IMAGE':'boky/postfix:v5.1.0','SMTP_RELAY_REPLICAS':'1' if mail=='smtp' else '0','TLS_SECRET':'pci-wildcard-tls','UID_NOW':'1000','ORCE_BASE_PATH':base,'ORCE_EDITOR_PATH':'/editor'}
    def replacement(m):
        name,_,default=m.group(1).partition(':-')
        if name not in env:raise ValueError('Unknown deployment variable '+name)
        return env[name] or default
    for index,block in enumerate(blocks):
        assert not re.search(r'(?<!\\)\$[A-Za-z_]',block),'Unescaped container variable in G0 heredoc'
        rendered=re.sub(r'(?<!\\)\$\{([^}]+)\}',replacement,block).replace('\\$','$')
        assert not re.search(r'(?<!\\)\$\(',block),'Unescaped command substitution in manifest'
        for obj in yaml.load_all(rendered,Loader=UniqueLoader):
            assert isinstance(obj,dict) and obj.get('apiVersion') and obj.get('kind') and obj.get('metadata',{}).get('name'),(index,obj)
            assert obj.get('metadata',{}).get('namespace')!='ocm-wstack','G0 modifies OCM'
            if obj['kind']=='HTTPRoute':
                for rule in obj['spec']['rules']:
                    for f in rule.get('filters',[]):
                        h=f.get('requestHeaderModifier',{});assert len(h.get('remove',[]))<=16,'Gateway header removal limit exceeded'
                        assert not set(x.lower() for x in h.get('remove',[])) & set(x['name'].lower() for x in h.get('set',[])),'Header appears in set and remove'
            if obj['kind'] in ('Deployment','StatefulSet'):assert isinstance(obj['spec']['replicas'],int)
            count+=1
print(json.dumps({'g0Yaml':'PASS','scenarios':12,'documents':count,'kubernetesAdmission':'NOT_RUN'}))
