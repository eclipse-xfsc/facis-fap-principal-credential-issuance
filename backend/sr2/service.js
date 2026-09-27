import crypto from 'node:crypto';
import { Sr2Error, sr2Assert, sr2Fail, sr2Text, sr2Uuid, sr2Integer, sr2List, sr2Object, sr2Unique, sr2Hash, sr2Metadata, sr2Branding, sr2Configuration, sr2Flow, sr2Connector, sr2Eligible } from './domain.js';
import { sr2Png } from './assets.js';

export function createSr2Service({store, adapters, now=Date.now, pepper, allowedHosts=[], issuerUrl, assetUrl}) {
  const hashSubject=(tenantId,subject)=>crypto.createHmac('sha256',pepper).update(tenantId+'\0'+subject).digest('hex');
  function current(r,expected){if(expected===undefined || expected===null)sr2Fail(428,'PCI-SR2-PRECONDITION','Supply the current If-Match version.');if(expected!==r.version)sr2Fail(412,'PCI-SR2-PRECONDITION','The resource changed. Reload before saving.');}
  async function authorize(tx,p,permission='issuer',configurationId=null) {
    if(!p || p.tenantId!==tx.tenant.tenant_id || p.host!==tx.tenant.primary_domain)sr2Fail(404,'PCI-SR2-NOT-FOUND');
    if(tx.tenant.state!=='active')sr2Fail(409,'PCI-SR2-TENANT-INACTIVE','The tenant is not active.');
    const m=await tx.member(p.subject);if(!m?.enabled)sr2Fail(403,'PCI-SR2-FORBIDDEN','An enabled tenant membership is required.');
    // Membership is read on every request: revoked assignments and disabled members
    // do not remain authorized until a cached OIDC session expires.
    const roles=(m.roles || []).filter(r=>p.roles.includes(r));
    if(permission==='principal')return {...p,roles};
    if(roles.includes('participant_tenant_admin'))return {...p,roles};
    if(permission==='admin')sr2Fail(403,'PCI-SR2-FORBIDDEN','Tenant administration is required.');
    const assignments=(await tx.assignments(p.subject)).filter(a=>!a.revoked);
    if(assignments.some(a=>a.configurationIds===null || (configurationId && a.configurationIds.includes(configurationId))))return {...p,roles};
    sr2Fail(configurationId?404:403,configurationId?'PCI-SR2-NOT-FOUND':'PCI-SR2-FORBIDDEN','Issuer delegation is required.');
  }
  async function get(tx,kind,id){const r=await tx.get(kind,id);if(!r)sr2Fail(404,'PCI-SR2-NOT-FOUND');return r;}
  async function event(tx,p,type,configurationId=null,request=null){await tx.event({type,configurationId,requestId:request?.id,subjectHash:request?.subjectHash,actorHash:hashSubject(tx.tenant.tenant_id,p.subject)});}
  async function save(tx,p,r,type){r.updatedAt=now();await tx.put(r);await tx.snapshot(r.kind,r.id,r.version,r.draft);await event(tx,p,type,r.kind==='configuration'?r.id:r.configurationId);return r;}
  async function referencedAsset(tx,id,configurationId){const a=await get(tx,'asset',id);sr2Assert(a.state!=='archived' && (a.configurationId===configurationId || (!a.configurationId && !configurationId)),'Asset ownership mismatch.');return a;}
  // Configuration grants and connector grants are separate. Missing grants in
  // older connector documents deny access until a tenant administrator reviews them.
  async function connectorAccess(tx,id,configurationId){
    const c=await get(tx,'connector',id),scope=c.draft.configurationIds;
    if(c.state==='archived' || !(scope===null || Array.isArray(scope)&&scope.includes(configurationId)))sr2Fail(403,'PCI-SR2-CONNECTOR-SCOPE','The connector is not approved for this configuration.');
    return c;
  }
  async function validateLinks(tx,r,publish=false){
    const d=r.draft;
    if(r.kind==='configuration'){
      for(const id of [d.logoAssetId,d.backgroundAssetId].filter(Boolean))await referencedAsset(tx,id,r.id);
      if(d.connectorId){const c=await connectorAccess(tx,d.connectorId,r.id);const cd=c.activeVersion?await tx.version('connector',c.id,c.activeVersion):c.draft;sr2Assert(cd.signingModes.includes(d.signingMode),'Connector does not support the signing mode.');}
      if(d.flowId){const f=await get(tx,'flow',d.flowId);sr2Assert(f.configurationId===r.id && f.state!=='archived','Flow ownership mismatch.');}
      if(publish){sr2Assert(d.connectorId && d.flowId,'A connector and published journey are required.');
        const c=await get(tx,'connector',d.connectorId),f=await get(tx,'flow',d.flowId),m=await get(tx,'metadata',r.tenantId);
        sr2Assert(c.activeVersion && f.activeVersion && m.activeVersion,'Publish connector, journey and issuer metadata first.');
        const md=await tx.version('metadata',m.id,m.activeVersion);sr2Assert(md.profile===d.profile,'Issuer and configuration profiles differ.');}
    } else if(r.kind==='connector'){for(const cid of r.draft.configurationIds || [])await get(tx,'configuration',cid);
    } else if(r.kind==='metadata' && publish){for(const c of await tx.list('configuration'))if(c.activeVersion && c.state!=='archived')sr2Assert((await tx.version('configuration',c.id,c.activeVersion)).profile===d.profile,'Archive incompatible published configurations before changing issuer profile.');
    } else if(r.kind==='branding' && d.logoAssetId)await referencedAsset(tx,d.logoAssetId,null);
  }
  function publicItem(r){if(r.kind==='asset'){const {base64,...safe}=r.draft;return {...r,draft:safe};}return r;}
  const api={store,adapters,now,hashSubject,authorize,get,event,issuerUrl,assetUrl,connectorAccess,
    async capabilities(p){return store.transaction(p.tenantId,async tx=>{await authorize(tx,p,'principal');let tenantAdmin=false,issuer=false;try{await authorize(tx,p,'admin');tenantAdmin=true;}catch{};const grants=(await tx.assignments(p.subject)).filter(a=>!a.revoked);issuer=tenantAdmin || grants.length>0;return {tenantAdmin,issuer,globalIssuer:tenantAdmin || grants.some(a=>a.configurationIds===null),configurationIds:sr2Unique([...new Set(grants.flatMap(a=>a.configurationIds || []))]),connectors:issuer?(await tx.list('connector')).filter(c=>c.state!=='archived' && (tenantAdmin || c.draft.configurationIds===null || (c.draft.configurationIds || []).some(id=>grants.some(a=>a.configurationIds===null || a.configurationIds.includes(id))))).map(c=>({id:c.id,activeVersion:c.activeVersion,draft:{name:c.draft.name,signingModes:c.draft.signingModes,configurationIds:c.draft.configurationIds===null?null:(c.draft.configurationIds || []).filter(id=>tenantAdmin || grants.some(a=>a.configurationIds===null || a.configurationIds.includes(id)))}})):[],integration:adapters.capabilities()};});},
    async list(p,kind){return store.transaction(p.tenantId,async tx=>{
      if(['metadata','branding','connector','settings'].includes(kind)){await authorize(tx,p,'admin');return {items:(await tx.list(kind)).map(publicItem)};}
      await authorize(tx,p,'principal');const items=[];
      for(const r of await tx.list(kind)){try{await authorize(tx,p,'issuer',kind==='configuration'?r.id:r.configurationId);items.push(publicItem(r));}catch(e){if(!(e instanceof Sr2Error) || ![403,404].includes(e.status))throw e;}}
      return {items};});},
    async resource(p,kind,verb,id,input={},expected){return store.transaction(p.tenantId,async tx=>{
      const singleton=['metadata','branding','settings'].includes(kind);if(singleton)id=p.tenantId;
      if(id)sr2Uuid(id);
      let r=verb==='create'?null:await tx.get(kind,id);
      if(singleton && !r && verb==='get'){await authorize(tx,p,'admin');return {item:null};}
      if(verb!=='create' && !r)sr2Fail(404,'PCI-SR2-NOT-FOUND');
      const configurationId=r?.configurationId || (input.configurationId ? sr2Uuid(input.configurationId):null);
      const permission=['metadata','branding','connector','settings'].includes(kind) || (kind==='asset' && !configurationId) ? 'admin':'issuer';
      await authorize(tx,p,permission,kind==='configuration'?r?.id:configurationId);
      if(configurationId){const c=await get(tx,'configuration',configurationId);sr2Assert(c.state!=='archived' || ['get','versions'].includes(verb),'Configuration is archived.');}
      if(verb==='get')return {item:publicItem(r),versions:await tx.versions(kind,id)};
      if(verb==='versions')return {items:await tx.versions(kind,id)};
      if(r && !['validate','preview'].includes(verb))current(r,expected);
      if(r?.state==='archived')sr2Fail(409,'PCI-SR2-ARCHIVED','Archived resources are immutable.');
      if(verb==='archive'){
        if(kind==='asset' && r.public)sr2Fail(409,'PCI-SR2-ASSET-IN-USE','Published assets are retained for issued credentials.');
        if(['metadata','branding','settings'].includes(kind))sr2Fail(400,'PCI-SR2-VALIDATION','This resource cannot be archived.');
        if(['connector','flow'].includes(kind))for(const c of await tx.list('configuration'))for(const request of await tx.requests(c.id)){if(request.expiresAt>now() && !['issued','revoked','expired','indeterminate','revocation_indeterminate'].includes(request.state) && (kind==='connector'?request.connectorId:request.flowId)===id)sr2Fail(409,'PCI-SR2-IN-USE','An in-progress request is pinned to this resource.');}
        if(kind==='connector' || kind==='flow')for(const c of await tx.list('configuration')){const active=c.activeVersion?await tx.version('configuration',c.id,c.activeVersion):null;if(c.state!=='archived' && [c.draft,active].some(d=>d && (d.connectorId===id || d.flowId===id)))sr2Fail(409,'PCI-SR2-IN-USE','An active configuration references this resource.');}
        r={...r,state:'archived',version:r.version+1};await save(tx,p,r,kind+'.archived');await tx.dirty();return {item:publicItem(r)};
      }
      if(verb==='publish'){
        await validateLinks(tx,r,true);
        if(kind==='configuration')for(const aid of [r.draft.logoAssetId,r.draft.backgroundAssetId].filter(Boolean)){const a=await get(tx,'asset',aid);a.public=true;await tx.put(a);}
        if(kind==='branding' && r.draft.logoAssetId){const a=await get(tx,'asset',r.draft.logoAssetId);a.public=true;await tx.put(a);}
        r={...r,version:r.version+1,activeVersion:r.version+1,state:'published'};await save(tx,p,r,kind+'.published');await tx.dirty();return {item:publicItem(r),publication:await tx.publication()};
      }
      if(verb==='validate'){await validateLinks(tx,r,true);return {valid:true,externalIntegration:adapters.capabilities()};}
      if(verb==='preview')return {item:publicItem(r),preview:r.draft};
      if(verb==='rollback'){
        sr2Object(input,['version']);const v=await tx.version(kind,id,sr2Integer(input.version,1,r.version));if(!v)sr2Fail(404,'PCI-SR2-NOT-FOUND');
        r={...r,draft:v,version:r.version+1};await validateLinks(tx,r);await save(tx,p,r,kind+'.draft.restored');return {item:publicItem(r)};
      }
      sr2Assert(['create','update'].includes(verb),'Unknown operation.');
      sr2Object(input,['flow','asset'].includes(kind)?['configurationId','data']:['data']);if(r && input.configurationId!==undefined)sr2Assert(input.configurationId===r.configurationId,'Resource ownership is immutable.');const d=input.data;let draft;
      if(kind==='configuration')draft=sr2Configuration(d);
      else if(kind==='flow'){sr2Assert(configurationId,'A configuration is required.');draft=sr2Flow(d);}
      else if(kind==='metadata')draft=sr2Metadata(d,issuerUrl(tx.tenant));
      else if(kind==='branding')draft=sr2Branding(d);
      else if(kind==='connector')draft=sr2Connector(d,allowedHosts);
      else if(kind==='asset'){sr2Assert(verb==='create','Assets are immutable. Upload a new image.');sr2Object(d,['mediaType','base64']);sr2Assert(d.mediaType==='image/png','Only PNG is accepted.');draft=sr2Png(d.base64);}
      else if(kind==='settings'){sr2Object(d,['ratePerMinute','maxConcurrent']);draft={ratePerMinute:sr2Integer(d.ratePerMinute,1,120),maxConcurrent:sr2Integer(d.maxConcurrent,1,8)};}
      else sr2Fail(400,'PCI-SR2-VALIDATION','Unknown resource type.');
      if(r?.kind==='configuration')sr2Assert(draft.identifier===r.draft.identifier,'External configuration identifier is immutable.');
      if(!r){sr2Assert((await tx.list(kind)).length<(kind==='asset'?200:500),'Tenant resource limit reached.');r={tenantId:p.tenantId,id:singleton?p.tenantId:crypto.randomUUID(),kind,configurationId,version:0,activeVersion:null,state:'draft',createdAt:now()};sr2Assert(!(await tx.get(kind,r.id)),'Resource already exists.');}
      r={...r,draft,version:r.version+1};await validateLinks(tx,r);await save(tx,p,r,kind+'.'+(verb==='create'?'created':'updated'));return {item:publicItem(r)};
    });},
    async assignments(p,verb,id,input={}){return store.transaction(p.tenantId,async tx=>{
      await authorize(tx,p,'admin');
      if(verb==='list')return {items:await tx.assignments()};
      if(verb==='grant'){
        sr2Object(input,['subject','configurationIds']);const subject=sr2Text(input.subject,200);sr2Assert((await tx.member(subject))?.enabled,'Choose an enabled tenant member.');
        const scope=input.configurationIds===null?null:sr2Unique(sr2List(input.configurationIds,1,100).map(sr2Uuid));if(scope)for(const cid of scope)await get(tx,'configuration',cid);
        const a={id:crypto.randomUUID(),subject,configurationIds:scope,revoked:false};await tx.grant(a);await event(tx,p,'issuer.delegated');return {item:a};
      }
      sr2Uuid(id);const a=(await tx.assignments()).find(a=>a.id===id);if(!a)sr2Fail(404,'PCI-SR2-NOT-FOUND');await tx.revokeAssignment(id);await event(tx,p,'issuer.delegation.revoked');return {revoked:true};
    });},
    async branding(tenantId){return store.transaction(tenantId,async tx=>{if(tx.tenant.state!=='active')sr2Fail(404,'PCI-SR2-NOT-FOUND');const r=await tx.get('branding',tenantId);return {branding:r?.activeVersion?await tx.version('branding',tenantId,r.activeVersion):null};});},
    async asset(p,id,isPublic=false){return store.transaction(p.tenantId,async tx=>{const r=await get(tx,'asset',sr2Uuid(id));if(isPublic){if(tx.tenant.state!=='active' || !r.public || p.host!==tx.tenant.primary_domain)sr2Fail(404,'PCI-SR2-NOT-FOUND');}else await authorize(tx,p,r.configurationId?'issuer':'admin',r.configurationId);return {bytes:Buffer.from(r.draft.base64,'base64'),mediaType:r.draft.mediaType,hash:r.draft.sha256};});},
    async publication(p,run=false){
      const bundle=await store.transaction(p.tenantId,async tx=>{await authorize(tx,p,'admin');const state=await tx.publication();const metadata=await tx.get('metadata',p.tenantId);const configurations=[];
        for(const c of await tx.list('configuration'))if(c.state!=='archived' && c.activeVersion)configurations.push({id:c.id,version:c.activeVersion,data:await tx.version('configuration',c.id,c.activeVersion)});
        return {state,tenantId:p.tenantId,issuer:metadata?.activeVersion?await tx.version('metadata',metadata.id,metadata.activeVersion):null,configurations};});
      if(!run)return bundle;
      try {sr2Assert(bundle.issuer,'Publish issuer metadata first.');await adapters.publishMetadata(bundle);await store.transaction(p.tenantId,tx=>tx.publicationResult(Number(bundle.state.desired),null));}
      catch(e){await store.transaction(p.tenantId,tx=>tx.publicationResult(Number(bundle.state.desired),'PCI-SR2-CONTRACT-BLOCKED'));throw e;}
      return store.transaction(p.tenantId,tx=>tx.publication());
    },
    async history(p,configurationId,filter={}){return store.transaction(p.tenantId,async tx=>{
      sr2Uuid(configurationId);await authorize(tx,p,'issuer',configurationId);await get(tx,'configuration',configurationId);
      const f={limit:sr2Integer(Number(filter.limit || 30),1,100),cursor:filter.cursor?sr2Integer(Number(filter.cursor),1,Number.MAX_SAFE_INTEGER):null,subjectHash:filter.subjectHash || null,requestId:filter.requestId?sr2Uuid(filter.requestId):null,type:filter.type || null,credentialId:filter.credentialId?sr2Text(filter.credentialId,1024):null,from:filter.from || null,to:filter.to || null};
      for(const date of [f.from,f.to].filter(Boolean))sr2Assert(typeof date==='string' && /^\d{4}-\d{2}-\d{2}T/.test(date) && Number.isFinite(Date.parse(date)),'Use an ISO date-time.');
      if(f.from && f.to)sr2Assert(Date.parse(f.from)<=Date.parse(f.to),'History date range is reversed.');
      if(f.subjectHash)sr2Assert(/^[a-f0-9]{64}$/.test(f.subjectHash),'Search with the pseudonymous subject hash.');if(f.type)sr2Assert(/^[a-z_.]{1,50}$/.test(f.type),'Invalid event type.');
      const items=await tx.events(configurationId,f);return {items,nextCursor:items.length===f.limit?items.at(-1).cursor:null};
    });},
    async unblock(p,configurationId,subjectHash){return store.transaction(p.tenantId,async tx=>{await authorize(tx,p,'admin');sr2Uuid(configurationId);await get(tx,'configuration',configurationId);sr2Assert(/^[a-f0-9]{64}$/.test(subjectHash),'Invalid subject hash.');await tx.unblock(configurationId,subjectHash);await event(tx,p,'reissuance.unblocked',configurationId);return {unblocked:true};});},
    async lifecycle(p,state,confirmation){return store.transaction(p.tenantId,async tx=>{
      if(!(p.provider && p.roles.includes('provider_admin')))await authorize(tx,p,'admin');
      sr2Assert(['suspended','provisioning','deleting'].includes(state),'Invalid lifecycle action.');
      sr2Assert(confirmation===tx.tenant.tenant_slug,'Confirm by entering the tenant slug.');
      sr2Assert(tx.tenant.state!=='deleted','Tenant is already deleted.');
      if(state==='provisioning')sr2Assert(p.provider && tx.tenant.state==='suspended','Only provider administration can resume a suspended tenant.');
      if(state==='deleting'){
        // Until upstream retirement is defined, never break an issued credential's
        // public status/DID dependencies through a local-only deletion.
        for(const c of await tx.list('configuration'))if(c.activeVersion)sr2Fail(409,'PCI-SR2-RETIREMENT-BLOCKED','Published issuer resources require the verified OCM retirement contract before tenant deletion.');
      }
      await tx.lifecycle(state);await event(tx,p,'tenant.'+state);return {state};
    });}
  };return api;
}
