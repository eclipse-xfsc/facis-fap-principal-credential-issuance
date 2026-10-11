#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Read-only deployment identity and resource evidence; never reads Secrets."""
import argparse,datetime,json,os,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--namespace',required=True);p.add_argument('--ocm-namespace',default='ocm-wstack');p.add_argument('--infrastructure-namespace',default='infrastructure');p.add_argument('--context',required=True);p.add_argument('--kubeconfig',required=True);p.add_argument('--output',required=True);a=p.parse_args();os.umask(0o077)
k=['kubectl','--context',a.context,'--kubeconfig',a.kubeconfig]
def get(args):return json.loads(subprocess.check_output(k+args,stderr=subprocess.DEVNULL,timeout=30))
try:
    inventory=[]
    for namespace in dict.fromkeys([a.namespace,a.ocm_namespace,a.infrastructure_namespace]):
        pods=get(['-n',namespace,'get','pods','-o','json'])
        for pod in pods['items']:
            spec=pod['spec'];status={x['name']:x for x in pod.get('status',{}).get('containerStatuses',[])}
            inventory.append({'namespace':namespace,'pod':pod['metadata']['name'],'uid':pod['metadata']['uid'],'serviceAccount':spec.get('serviceAccountName'),'containers':[{'name':x['name'],'image':x['image'],'imageID':status.get(x['name'],{}).get('imageID'),'ready':status.get(x['name'],{}).get('ready',False),'resources':x.get('resources',{})} for x in spec.get('containers',[])]})
    report={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'context':a.context,'version':get(['version','-o','json']),'workloads':inventory}
    for resource in ['gateway','httproute','networkpolicy']:
        report[resource]=[]
        for namespace in dict.fromkeys([a.namespace,a.ocm_namespace,a.infrastructure_namespace]):
            for item in get(['-n',namespace,'get',resource,'-o','json'])['items']:
                report[resource].append({'namespace':namespace,'name':item['metadata']['name'],'uid':item['metadata']['uid'],'generation':item['metadata'].get('generation'),'spec':item['spec'],'status':item.get('status',{})})
    Path(a.output).write_text(json.dumps(report,indent=2)+'\n');Path(a.output).chmod(0o600);print(json.dumps({'status':'CAPTURED','pods':len(inventory)}))
except Exception:print(json.dumps({'status':'FAILED','code':'PCI-EVIDENCE-CAPTURE'}));sys.exit(1)
