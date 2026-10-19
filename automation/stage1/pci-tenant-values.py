#!/usr/bin/env python3
"""Generate a field-by-field demo fill-in worksheet for a synthetic employee credential.

Requires Python 3 and kubectl. Reads through ORCE, then PostgreSQL as fallback.
Kubernetes exec and database connectivity must be working on at least one path.
"""
import argparse, json, pathlib, re, subprocess, sys
from urllib.parse import urlsplit

def stop(message):
    print('\nSTOP: ' + message, file=sys.stderr)
    raise SystemExit(1)

parser = argparse.ArgumentParser(description="Generate VALUES TO ENTER for a PCI demo using live tenant infrastructure. No prompts or cluster changes.")
parser.add_argument("--kubeconfig", required=True, help="Path to one kubeconfig file")
parser.add_argument("--tenant-url", required=True, help="Tenant hostname or HTTPS URL")
parser.add_argument("--context", help="Override the kubeconfig current context")
parser.add_argument("--namespace", default="xfsc-orce-pci-orce")
parser.add_argument("--output", help="Also save the fill-in worksheet to this UTF-8 text file")
args = parser.parse_args()
kube = str(pathlib.Path(args.kubeconfig).expanduser())
if not pathlib.Path(kube).is_file(): stop("Kubeconfig file not found: "+kube)
value = args.tenant_url.strip()

try:
    url = urlsplit(value if '://' in value else 'https://'+value)
    host = (url.hostname or '').lower().rstrip('.')
    if url.scheme != 'https' or url.username or url.password or url.port not in (None,443):
        stop('Enter the HTTPS tenant URL.')
except ValueError: stop('Invalid URL.')
if not re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9-]+)*', host): stop('Invalid hostname.')
ns = args.namespace
K = ['kubectl','--kubeconfig',kube,'--request-timeout=25s']

def call(args, data=None):
    try:
        p = subprocess.run(K+args,input=data,text=True,capture_output=True,timeout=35)
        return p.returncode, p.stdout.strip(), p.stderr
    except subprocess.TimeoutExpired: return 1,'','timeout'
    except FileNotFoundError: stop('kubectl is not installed.')

if args.context:
    context = args.context
else:
    rc, context, _ = call(['config','current-context'])
    if rc or not context: stop('Cannot read current context from that kubeconfig.')
K += ['--context',context]
print('Context: '+context+' | Tenant host: '+host, flush=True, file=sys.stderr)

def get(kind, name='', namespace=ns):
    args = ['-n',namespace,'get',kind] + ([name] if name else [])
    rc, out, err = call(args+['--ignore-not-found','-o','json'])
    if rc: stop('Cannot read '+kind+' '+name+' in '+namespace+'. Check API connectivity/RBAC.')
    try: return json.loads(out) if out else {}
    except ValueError: stop('Kubernetes returned invalid JSON for '+kind+'.')

sql = '''
WITH t AS (SELECT * FROM tenants WHERE primary_domain=$1)
SELECT json_build_object(
 'tenant',(SELECT json_build_object('tenantId',tenant_id,'slug',tenant_slug,
   'ownerUid',owner_uid,'organizationName',organization_name,
   'organizationIdentifier',organization_identifier,'domain',primary_domain,'state',state) FROM t),
 'resources',COALESCE((SELECT json_agg(json_build_object(
   'id',r.resource_id,'kind',r.kind,'configurationId',r.configuration_id,
   'state',r.document->>'state','activeVersion',r.document->'activeVersion',
   'draft',r.document->'draft','active',v.snapshot) ORDER BY r.kind,r.resource_id)
   FROM pci_issuer_resources r JOIN t ON t.tenant_id=r.tenant_id
   LEFT JOIN pci_issuer_versions v ON v.tenant_id=r.tenant_id AND v.kind=r.kind
    AND v.resource_id=r.resource_id AND v.version=(r.document->>'activeVersion')::int
   WHERE r.kind IN ('metadata','branding','configuration','flow','connector','settings')),'[]'::json),
 'identity',(SELECT json_build_object('mode',i.document->>'mode',
   'displayName',i.document->>'displayName','issuer',i.document->>'issuer',
   'clientId',i.document->>'clientId','audience',i.document->>'audience',
   'scopes',i.document->>'scopes','state',i.document->>'state')
   FROM pci_tenant_identity i JOIN t ON t.tenant_id=i.tenant_id)
) AS result;
'''
js = r'''
const fs=require('fs');
(async()=>{
 let client;
 try {
  const {Client}=require(require.resolve('pg',{paths:['/data','/usr/src/node-red',process.cwd()]}));
  if(!process.env.PCI_DATABASE_URL)throw Error('DB_ENV_MISSING');
  const endpoint=new URL(process.env.PCI_DATABASE_URL), files={};
  for(const [p,k] of [['sslrootcert','ca'],['sslcert','cert'],['sslkey','key']]){
   const value=process.env['PCI_DATABASE_TLS_'+k.toUpperCase()+'_FILE'];
   if(value&&endpoint.searchParams.get(p)&&value!==endpoint.searchParams.get(p))throw Error('TLS_CONFLICT');
   files[k]=value||endpoint.searchParams.get(p);
  }
  const params=[...endpoint.searchParams.keys()].filter(k=>k.startsWith('ssl'));
  if(params.some(k=>!['sslmode','sslrootcert','sslcert','sslkey'].includes(k))||
     (endpoint.searchParams.has('sslmode')&&endpoint.searchParams.get('sslmode')!=='verify-full'))throw Error('TLS_CONFIG');
  const useTLS=/^(true|1|yes)$/i.test(process.env.PCI_DATABASE_TLS||'')||params.length>0;
  if(Boolean(files.cert)!==Boolean(files.key))throw Error('TLS_PAIR');
  for(const p of params)endpoint.searchParams.delete(p);
  const ssl={rejectUnauthorized:true,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'};
  if(useTLS)for(const k of ['ca','cert','key'])if(files[k])ssl[k]=fs.readFileSync(files[k]);
  client=new Client({connectionString:endpoint.toString(),...(useTLS?{ssl}:{}),connectionTimeoutMillis:5000});
  await client.connect(); await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query("SET LOCAL lock_timeout='3s'");
  const result=await client.query(SQL,[HOST]);
  await client.query('COMMIT'); console.log(JSON.stringify(result.rows[0].result));
 }catch(e){console.error('READ_FAILED:'+String(e.code||'DB_READ_FAILED'));process.exitCode=1;}
 finally{if(client)await client.end().catch(()=>{});}
})();
'''
js = 'const SQL='+json.dumps(sql)+',HOST='+json.dumps(host)+';\n'+js
pods = get('pods').get('items',[])
candidates = []
for pod in pods:
    if pod.get('status',{}).get('phase') != 'Running': continue
    name=pod['metadata']['name']
    for c in pod['spec']['containers']:
        if pod['metadata'].get('labels',{}).get('app')=='xfsc-orce' and c['name']=='orce':
            candidates.append((0,name,c['name']))
        elif name.startswith('fap-pci-postgres-') and 'postgres' in c['name']:
            candidates.append((1,name,c['name']))
data = None
for mode,pod,container in sorted(candidates):
    print('Reading through '+pod+'/'+container+' ...',flush=True, file=sys.stderr)
    if mode==0: command=['node','-']; payload=js
    else:
        command=['sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
        payload="BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';\n"+sql.replace('$1',"'"+host+"'")+"\nCOMMIT;"
    rc,out,err=call(['-n',ns,'exec','-i',pod,'-c',container,'--']+command,payload)
    if rc:
        print('  Unavailable: '+('Kubernetes exec connection timed out.' if '504' in err or 'timeout' in err.lower() else 'exec or database read failed. Trying the next available pod.'),flush=True, file=sys.stderr)
        continue
    try:
        data=json.loads(out)
        if not isinstance(data,dict) or 'tenant' not in data: raise ValueError()
        break
    except ValueError: data=None
if data is None:
    stop('No pod could return the database data. The URL cannot bypass broken Kubernetes exec connectivity. No configuration was changed.')
t=data['tenant']
if not t: stop('No tenant in this cluster has primary_domain='+host+'. Check kubeconfig and tenant URL.')

# Produce a proposed demo worksheet, never a dump of saved drafts/versions.
cfg=get('configmap','fap-pci-config').get('data',{})
dep=get('deployment','xfsc-orce')
for c in dep.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[]):
    if c['name']=='orce':
        cfg.update({e['name']:e['value'] for e in c.get('env',[]) if 'value' in e})
base=cfg.get('PCI_ORCE_BASE_PATH','/pci-orce').rstrip('/')
issuer='https://'+host+base
registry=get('configmap','pci-tenant-'+t['slug']).get('data',{})
pn=registry.get('participant_namespace')
if not pn:
    legacy='pci-participant-'+t['tenantId'][:8]
    pn=legacy if get('namespace',legacy) else 'pci-participant-'+t['tenantId']
pd=get('deployment','pci-participant',pn)
service=get('service','pci-participant',pn)
pe={e['name']:e['value']
    for c in pd.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[])
    for e in c.get('env',[]) if 'value' in e}
owned=pe.get('PARTICIPANT_TENANT_ID')==t['tenantId']
participant_host='pci-participant.'+pn+'.svc.cluster.local'
participant_verified=bool(owned and service)
if not owned: pe={}
secret='pci-participant-'+t['tenantId'][:8]
rc,labels,_=call(['-n',ns,'get','secret',secret,'--ignore-not-found','-o',
    'go-template={{index .metadata.labels "xfsc.org/pci-tenant-id"}}|{{index .metadata.labels "xfsc.org/pci-owner-uid"}}'])
secret_ok=not rc and labels==t['tenantId']+'|'+str(t['ownerUid'])
identity=data.get('identity') or {}
kc=cfg.get('PCI_KEYCLOAK_PUBLIC_URL','').rstrip('/')
platform_issuer=kc+'/realms/'+cfg.get('PCI_KEYCLOAK_REALM','fap-pci') if kc else None
# These are reference deployment inputs even when no participant exists yet.
# Never present a planned name as proof that the service or TLS Secret exists.
jwt_issuer=pe.get('PARTICIPANT_JWT_ISSUER') or (platform_issuer if identity.get('mode')!='oidc' else identity.get('issuer'))
audience=pe.get('PARTICIPANT_JWT_AUDIENCE') or (identity.get('audience') if identity.get('mode')=='oidc' else 'participant-data')
scopes=pe.get('PARTICIPANT_JWT_SCOPES') or ('credential:issue' if identity.get('mode')!='oidc' else None)
issues=[]
if t.get('state')!='active': issues.append('Tenant state is '+str(t.get('state'))+'; complete activation before issuance.')
if not participant_verified: issues.append('Deploy/enroll the tenant participant at the proposed endpoint below; it has not been verified as present for this tenant.')
if pd and not owned: issues.append('A deployment exists at the proposed location but tenant ownership could not be verified. Resolve that before deploying or reusing it.')
if not secret_ok: issues.append('The reference participant client/trust Secret is missing, unreadable, or not owned by this tenant.')
if not all([jwt_issuer,audience,scopes]): issues.append('Confirm the unresolved JWT settings with the identity-provider configuration; they cannot be derived safely.')
if pd and owned and not all(pe.get(k) for k in ['PARTICIPANT_JWT_ISSUER','PARTICIPANT_JWT_AUDIENCE','PARTICIPANT_JWT_SCOPES']):
    issues.append('Some participant JWT settings are not literal environment values. Proposed fallbacks need verification against its resolved environment.')
if participant_verified:
    hosts={v.strip() for v in cfg.get('PCI_PARTICIPANT_ALLOWED_HOSTS','').split(',') if v.strip()}
    ips={v.strip() for v in cfg.get('PCI_PARTICIPANT_PRIVATE_ADDRESSES','').split(',') if v.strip()}
    if participant_host not in hosts: issues.append('Participant hostname is not in the literal PCI host allowlist; verify operator configuration before the demo.')
    ip=service.get('spec',{}).get('clusterIP')
    if not ip or ip not in ips: issues.append('Participant Service IP is not in the literal private-address allowlist; verify operator configuration before the demo.')
else:
    issues.append('Participant provisioning must install tenant-specific TLS material and approve its hostname and private Service IP in PCI.')
# Avoid proposing a stable identifier already used by a saved configuration.
used={(r.get('draft') or {}).get('identifier') for r in data.get('resources',[]) if r.get('kind')=='configuration'}
stem='demo_'+t['slug'][:35].replace('-','_')+'_employee'
identifier=stem
counter=2
while identifier in used:
    identifier=stem+'_'+str(counter); counter+=1
name='Demo Employee Credential'
connector_name=t['slug']+' demo participant'
journey_name='Demo Employee Journey'
report=[]
def line(text):
    report.append(text)
    print(text)
def emit(title, value):
    line('\n'+title+':\n'+json.dumps(value,indent=2,ensure_ascii=False))
line('TENANT '+t['slug']+' — VALUES TO ENTER')
line('UI: '+issuer+'/ui/')
line('Recipe: synthetic employee credential; built-in Keycloak; internal signing; OID4VCI 1.0.')
line('These are proposed demo inputs, not the saved configuration. The script changes nothing in the cluster.')
emit('TENANT AND PARTICIPANT STATUS',{
    'Tenant state':t.get('state'),
    'Participant namespace to use':pn,
    'Tenant participant service verified':participant_verified,
    'Tenant TLS Secret ownership verified':secret_ok,
    'Connector values below':'Use for the reference participant setup. When verification is false, these are planned deployment values, not working endpoints or provisioned certificates.'
})
emit('0. FINISH BEFORE THE LIVE DEMO',{
    'Detected setup blockers':issues or 'None detected by the limited Kubernetes checks.',
    'Required rehearsal':[
        'Sign in as an enabled tenant administrator; if the tenant state above is not active, complete activation first.',
        'Prepare the two signing keys in step 1 before the live demo; skip creation if already present.',
        'Save the configuration draft in step 2 BEFORE the live demo. Its UUID is generated by the app.',
        'Have the participant owner seed a synthetic record for THAT configuration UUID and the actual demo principal subject. A new configuration UUID needs its own source record.',
        'Match the source record to the claims below: name=Alex Example, employeeId=TEST-001, department=Engineering.',
        'Complete a rehearsal through wallet receipt. This script does not test mTLS, source records, signing keys, wallet compatibility or issuance.'
    ],
    'During the demo':'Edit the prepared configuration draft. Select configurations, connectors and journeys by name in the UI; do not fetch UUIDs in the terminal.',
    'Fresh configuration created live':'You can demonstrate configuration entry, but successful issuance requires its newly generated UUID to have been enrolled in the participant source. This script does not provision that enrollment.',
    'Participant scope':'Automatic discovery targets this repository\'s enrolled pci-participant deployment. Custom participant deployments require their operator-provided connection settings.'
})
emit('1. TENANT SETTINGS — SIGNING KEYS',[
    {'Key name':'issuer','Key type':'ecdsa-p256','Action':'Create only if absent; reuse if already provisioned.'},
    {'Key name':'preauth','Key type':'ecdsa-p256','Action':'Create only if absent; reuse if already provisioned.'}
])
emit('2. CONFIGURATIONS — SAVE DRAFT',{
    'Stable identifier':identifier,
    'Name':name,
    'Description':'Synthetic employee credential for the tenant demonstration.',
    'Protocol profile':'oid4vci-1.0',
    'Credential format':'jwt_vc_json',
    'Credential types (comma separated)':'VerifiableCredential, EmployeeCredential',
    'VCT':'Not shown for jwt_vc_json; leave unset.',
    'Claim definitions':[
        {'Claim name':'name','Type':'string','Required':True},
        {'Claim name':'employeeId','Type':'string','Required':True},
        {'Claim name':'department','Type':'string','Required':True}
    ],
    'Signing mode':'internal-signing',
    'Tenant key reference':'issuer',
    'Status profile':'status-list',
    'Approved participant connector':'Leave unselected on first save; select '+connector_name+' in step 7.',
    'Published journey':'Leave unselected on first save; select '+journey_name+' in step 7.',
    'All enabled tenant principals':'CHECK',
    'Specific member subject IDs (comma separated)':'Leave empty.',
    'Identity provider roles or groups (comma separated)':'Leave empty.',
    'Requests per minute':10,
    'Logo asset':'No logo',
    'Background asset':'No background',
    'Action':'Save draft. Do not publish yet. Reopen this same draft for the live demonstration.'
})
emit('3. CONNECTORS — VALUES TO ENTER',{
    'Allow all configurations in this tenant':'UNCHECK',
    'Configuration access':'CHECK '+name+' in the configuration list.',
    'Name':connector_name,
    'HTTPS endpoint':'https://'+participant_host+':9443',
    'TLS server name':participant_host,
    'Protocol version':'participant-v1',
    'Client TLS Secret name':secret,
    'Trust Secret name':secret,
    'JWT issuer':jwt_issuer or 'UNRESOLVED: identity-provider issuer',
    'JWT audience':audience or 'UNRESOLVED: participant API audience',
    'Scopes (comma separated)':', '.join(scopes.split()) if scopes else 'UNRESOLVED: approved participant scopes',
    'Internal signing':'CHECK',
    'Participant signed':'UNCHECK',
    'Deadline (milliseconds)':10000,
    'Attempts for verified idempotent calls':1,
    'Requests per minute':10,
    'Failures before temporarily pausing calls':3,
    'Pause duration (milliseconds)':30000,
    'Action':'After participant/TLS provisioning, select the configuration and click Save and activate connector. Creating the connector in the UI does not create the service or certificates.'
})
emit('4. JOURNEYS — VALUES TO ENTER',{
    'Configuration':'Select '+name+' from the dropdown.',
    'Name':journey_name,
    'Steps in order':[
        {'ID':'intro','Type':'information','Title':'Your employee credential',
         'Text':'This demonstration issues a credential containing synthetic employee information.','Fields':[]},
        {'ID':'consent','Type':'consent','Title':'Consent to issue',
         'Text':'I agree to use the synthetic employee information to issue this demonstration credential.','Fields':[]},
        {'ID':'offer','Type':'offer','Title':'Receive your credential',
         'Text':'Open the credential offer in your compatible wallet.','Fields':[]}
    ],
    'Action':'Save draft, validate and publish the journey.',
    'Claim source':'Prepare the participant record to supply all three claims; no manual-input patch is needed for this recipe.'
})
emit('5. TENANT SETTINGS — BRANDING AND LIMITS',{
    'Branding':{'Title':t['organizationName'],
                'Description':'Employee credential demonstration.',
                'Content width':'Standard shell (wide)','Footer text':t['organizationName']+' — Demonstration',
                'Tenant logo PNG':'Optional: upload an organization PNG; otherwise leave unselected.'},
    'Issuance limits':{'Tenant requests per minute':30,'Concurrent participant requests':2},
    'Action':'Click Activate branding, then Save limits in the respective forms.'
})
emit('6. TENANT SETTINGS — ISSUER METADATA',{
    'Protocol profile':'oid4vci-1.0',
    'Issuer URL (read-only)':issuer,
    'Authorization server URLs (comma separated)':issuer,
    'Tenant DID':'did:web:'+host,
    'Pre-authorization signing key':'preauth',
    'Tenant JWKS URL':issuer+'/.well-known/jwks.json',
    'Display name':t['organizationName'],
    'Action':'Click Save and publish locally. Publish to OCM only after step 7.',
    'Do not':'Do not put the Keycloak JWT issuer into the Authorization servers field.'
})
identity=data.get('identity') or {}
emit('TENANT SETTINGS — ORGANIZATION SIGN-IN',{
    'Identity provider':'PCI Keycloak accounts (keycloak)',
    'Sign-in display name':'Organization account',
    'External issuer / Client ID / Client secret / Audience':'Leave external-provider fields empty for built-in Keycloak mode.',
    'OIDC scopes':'Not shown in built-in Keycloak mode.',
    'Action':('STOP: this tenant already uses an external identity provider. Do not switch it for this demo; use its existing sign-in and have its operator verify participant token compatibility.'
              if identity.get('mode')=='oidc' else 'Keep built-in Keycloak sign-in; no external identity-provider setup is needed.')
})
emit('7. FINISH IN THE UI',[
    'Reopen '+name+'.',
    'Approved participant connector: select '+connector_name+'.',
    'Published journey: select '+journey_name+'.',
    'Save draft, Validate, then Publish locally.',
    'Tenant settings / Issuer metadata: Publish to OCM; wait for successful publication.',
    'Sign in as the prepared eligible principal, request the credential, accept consent, and open the offer in a compatible wallet.'
])
if args.output:
    try:
        pathlib.Path(args.output).expanduser().write_text('\n'.join(report)+'\n',encoding='utf-8')
    except OSError as e:
        stop('Could not write report: '+str(e))
    print('Saved worksheet: '+args.output,file=sys.stderr)
