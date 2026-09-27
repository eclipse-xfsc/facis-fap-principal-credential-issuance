import {readFile,writeFile} from 'node:fs/promises';
const api=JSON.parse(await readFile('docs/api/openapi.json','utf8'));
const modules=JSON.parse(await readFile('backend/sr2/routes.json','utf8'));
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const str=(maxLength=200)=>({type:'string',maxLength});
const uuid={type:'string',format:'uuid'},nullableId={...uuid,nullable:true};
const list=items=>({type:'array',items,maxItems:100});
const profile={type:'string',enum:['oid4vci-draft13','oid4vci-1.0']};
const ref=name=>({'$ref':'#/components/schemas/'+name});
const schemas={
 Sr2Claim:obj({name:{...str(64),pattern:'^[A-Za-z][A-Za-z0-9_-]*$'},type:{type:'string',enum:['string','number','boolean']},required:{type:'boolean'}}),
 Sr2Configuration:obj({identifier:str(64),name:str(100),description:str(1000),profile,format:{type:'string',enum:['jwt_vc_json','vc+sd-jwt','dc+sd-jwt','ldp_vc']},credentialTypes:list(str(100)),vct:{...str(200),nullable:true},claims:{...list(ref('Sr2Claim')),minItems:1,maxItems:50},logoAssetId:nullableId,backgroundAssetId:nullableId,flowId:nullableId,connectorId:nullableId,signingMode:{type:'string',enum:['participant-signed','internal-signing']},keyRef:str(200),statusProfile:str(64),eligibility:obj({subjects:list(str(200)),roles:{...list({type:'string',enum:['principal','issuer_admin','participant_tenant_admin']}),maxItems:10}}),ratePerMinute:{type:'integer',minimum:1,maximum:60,default:10},blockReissuance:{type:'boolean',default:false}},['identifier','name','description','profile','format','claims','signingMode','keyRef','statusProfile','eligibility']),
 Sr2Metadata:obj({profile,issuer:{type:'string',format:'uri'},authorizationServers:{...list({type:'string',format:'uri'}),minItems:1,maxItems:5},did:str(512),jwksUrl:{type:'string',format:'uri'},displayName:str(100)}),
 Sr2Branding:obj({title:str(100),description:str(1000),accent:{type:'string',pattern:'^#[a-fA-F0-9]{6}$',description:'Must meet 4.5:1 contrast against white.'},logoAssetId:nullableId},['title','description']),
 Sr2Step:obj({id:str(64),type:{type:'string',enum:['information','consent','input','confirmation','status','offer']},title:str(100),text:str(2000),fields:{...list(obj({name:str(64),label:str(100),required:{type:'boolean'}})),maxItems:10}},['id','type','title']),
 Sr2Flow:obj({name:str(100),steps:{...list(ref('Sr2Step')),minItems:2,maxItems:20}}),
 Sr2Connector:obj({configurationIds:{...list(uuid),nullable:true,default:[],description:'Administrator-controlled live authorization: null allows any tenant configuration; IDs restrict access; absent or empty denies all. Changes apply immediately, including pinned requests.'},name:str(100),endpoint:{type:'string',format:'uri',description:'HTTPS; hostname must be operator-allowlisted.'},serverName:str(253),protocolVersion:str(64),tlsSecret:obj({name:str(63)}),trustSecret:obj({name:str(63)}),jwtIssuer:{type:'string',format:'uri'},jwtAudience:str(200),jwtScopes:{...list(str(100)),minItems:1,maxItems:20},signingModes:{...list({type:'string',enum:['internal-signing','participant-signed']}),minItems:1,maxItems:2},timeoutMs:{type:'integer',minimum:100,maximum:10000,default:5000},attempts:{type:'integer',minimum:1,maximum:3,default:1},ratePerMinute:{type:'integer',minimum:1,maximum:60,default:10},circuitFailureThreshold:{type:'integer',minimum:2,maximum:10,default:3},circuitCooldownMs:{type:'integer',minimum:1000,maximum:300000,default:30000}},['name','endpoint','serverName','protocolVersion','tlsSecret','trustSecret','jwtIssuer','jwtAudience','jwtScopes','signingModes']),
 Sr2Asset:obj({mediaType:{type:'string',enum:['image/png']},base64:{type:'string',maxLength:1400000,description:'PNG 8-bit RGB/RGBA, no interlace, <=1024x1024; server decodes and re-encodes.'}}),
 Sr2Settings:obj({ratePerMinute:{type:'integer',minimum:1,maximum:120},maxConcurrent:{type:'integer',minimum:1,maximum:8}}),
 Sr2Assignment:obj({subject:str(200),configurationIds:{...list(uuid),nullable:true,minItems:1,description:'null grants all configurations and creation rights; a list grants only those configurations.'}}),
 Sr2Resource:obj({tenantId:uuid,id:uuid,kind:{type:'string',enum:['configuration','metadata','branding','flow','connector','asset','settings']},configurationId:nullableId,version:{type:'integer',minimum:1},activeVersion:{type:'integer',nullable:true},state:{type:'string',enum:['draft','published','archived']},draft:{oneOf:['Sr2Configuration','Sr2Metadata','Sr2Branding','Sr2Flow','Sr2Connector','Sr2Settings'].map(ref)},createdAt:{type:'integer'},updatedAt:{type:'integer'}},['tenantId','id','kind','version','state','draft']),
 Sr2StatusReference:obj({id:str(1024),type:str(100),statusPurpose:{type:'string',enum:['revocation','suspension']},statusListIndex:{type:'string',pattern:'^[0-9]{1,16}$'},statusListCredential:str(1024)},['id','type']),
 Sr2HistoryEvent:obj({cursor:{type:'integer'},configurationId:uuid,requestId:nullableId,subjectHash:{...str(64),nullable:true},type:str(50),createdAt:{type:'string',format:'date-time'},credentialId:{...str(1024),nullable:true,description:'Verified JWT jti or VC id; null if not recorded. Never a synthesized request identifier.'},currentState:{...str(50),nullable:true,description:'Latest locally confirmed request state, not a live upstream status check.'},statusReference:{...ref('Sr2StatusReference'),nullable:true}}),
 Sr2Problem:obj({type:str(),title:str(),status:{type:'integer'},code:str(),detail:str(2000),correlation_id:str(),retryable:{type:'boolean'}},['status','code','detail'])
};
Object.assign(api.components.schemas,schemas);
api.info.version=(await readFile('VERSION','utf8')).trim();
api.components.securitySchemes.sr2Internal={type:'http',scheme:'bearer',description:'Operator-managed internal service token plus exact source IP allowlist; public-route marker denied. Exact upstream callback identity contract is additionally required.'};
api.components.securitySchemes.sr2Session={type:'apiKey',in:'cookie',name:'fap_pci_session',description:'Verified Keycloak-backed session. Routed tenant and enabled membership plus current assignment are checked server-side.'};
const resources={config:'Sr2Configuration',metadata:'Sr2Metadata',branding:'Sr2Branding',flow:'Sr2Flow',connector:'Sr2Connector',asset:'Sr2Asset',settings:'Sr2Settings'};
for(const module of modules)for(const [,summary,method,nodePath,action] of module.routes){
 const path=nodePath.replace(/:([A-Za-z]+)/g,'{$1}'),[group,verb]=action.split('.');
 const parameters=[...path.matchAll(/\{([^}]+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:uuid}));
 const mutation=!['get','head'].includes(method);
 if(resources[group] && ['update','publish','rollback','archive'].includes(verb))parameters.push({name:'If-Match',in:'header',required:true,schema:{type:'string',pattern:'^"[1-9][0-9]*"$'},description:'Current resource version; stale writes return 412.'});
 if(action==='issuance.start'||action==='internal.offer-create')parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:16,maxLength:128}});
 if(action==='history.list')for(const n of ['cursor','limit','subjectHash','requestId','credentialId','type','from','to'])parameters.push({name:n,in:'query',schema:n==='requestId'?uuid:n==='limit'?{type:'integer',minimum:1,maximum:100,default:30}:str(),description:n==='subjectHash'?'Tenant-scoped pseudonymous HMAC subject; no raw name/token search.':'History filter.'});
 const status=verb==='create'||action==='issuance.start'?'201':action.endsWith('.lifecycle')?'202':'200';
 const response=action==='public.asset'||action==='asset.get'?{'image/png':{schema:{type:'string',format:'binary'}}}:{'application/json':{schema:{type:'object'}}};
 if(action==='history.list')response['application/json'].schema=obj({items:list(ref('Sr2HistoryEvent')),nextCursor:{type:'integer',nullable:true}});
 const operation={summary,operationId:action.replaceAll('.','_'),tags:[module.label],parameters,security:action.startsWith('public.')?[]:[{[action.startsWith('internal.')?'sr2Internal':'sr2Session']:[]}],responses:{[status]:{description:'Operation succeeded. Local publication is distinct from confirmed OCM delivery.',content:response}},'x-pci-action':action};
 for(const code of ['400','401','403','404','409','412','413','428','429','503'])operation.responses[code]={description:code==='503'?'Dependency or exact contract unavailable; fails closed.':'Structured safe problem.',content:{'application/problem+json':{schema:ref('Sr2Problem')}}};
 if(mutation){let schema=obj({});
  if(resources[group] && ['create','update'].includes(verb))schema=obj({...(['flow','asset'].includes(group)?{configurationId:nullableId}:{}),data:ref(resources[group])},group==='flow' && verb==='create'?['configurationId','data']:['data']);
  else if(verb==='rollback')schema=obj({version:{type:'integer',minimum:1}});
  else if(action==='assignment.grant')schema=ref('Sr2Assignment');
  else if(action==='issuance.start')schema=obj({configurationId:uuid});
  else if(action==='issuance.advance')schema=obj({step:{type:'integer',minimum:0,maximum:19},consent:{type:'boolean'},values:{type:'object',additionalProperties:{type:'string',maxLength:2000}}},['step']);
  else if(action==='history.revoke')schema=obj({requestId:uuid,confirmed:{type:'boolean',enum:[true]}});
  else if(action==='history.unblock')schema=obj({subjectHash:{type:'string',pattern:'^[a-f0-9]{64}$'}});
  else if(action.endsWith('.lifecycle'))schema=obj({state:{type:'string',enum:['suspended','provisioning','deleting']},confirmation:str(40)});
  else if(action.startsWith('internal.')){schema={type:'object',description:'BLOCKED. Exact upstream wire contract must be supplied and pinned before this route is enabled.'};operation['x-contract-status']='BLOCKED';}
  operation.requestBody={required:true,content:{'application/json':{schema}}};
 }
 (api.paths[path] ||= {})[method]=operation;
}
await writeFile('docs/api/openapi.json',JSON.stringify(api,null,2)+'\n');
console.log('[build-api] merged SR2 routes and typed input schemas');
