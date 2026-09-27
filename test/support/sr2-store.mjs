import { sr2Fail, sr2Hash } from '../../backend/sr2/domain.js';

// Transactional test double for the same service used by ORCE. This deliberately
// makes no claim of PostgreSQL migration/locking execution.
export function memoryStore(tenants,members) {
  const db={tenants:new Map(tenants.map(t=>[t.tenant_id,t])),members:new Map(members.map(m=>[m.tenantId+':'+m.subject,{keycloak_subject:m.subject,roles:m.roles,enabled:true}])),resources:new Map(),allocations:new Map(),versions:new Map(),assignments:new Map(),requests:new Map(),events:[],blocks:new Set(),rates:new Map(),circuits:new Map(),publications:new Map()};
  let lock=Promise.resolve();
  return {db,async transaction(tenantId,fn){const wait=lock;let release;lock=new Promise(resolve=>release=resolve);await wait;const copy=structuredClone(db);const key=(kind,id)=>tenantId+':'+kind+':'+id;
    const tx={tenant:db.tenants.get(tenantId),
      async get(kind,id){return structuredClone(db.resources.get(key(kind,id)) || null);},
      async list(kind){return [...db.resources.values()].filter(r=>r.tenantId===tenantId&&r.kind===kind).map(r=>structuredClone(r));},
      async put(r){if(r.kind==='configuration'&&[...db.resources.values()].some(x=>x.tenantId===tenantId&&x.kind===r.kind&&x.id!==r.id&&x.draft.identifier===r.draft.identifier))sr2Fail(409,'PCI-SR2-CONFLICT');db.resources.set(key(r.kind,r.id),structuredClone(r));},
      async snapshot(kind,id,version,snapshot){const k=key(kind,id)+':'+version;if(db.versions.has(k))throw new Error('Immutable version');db.versions.set(k,structuredClone(snapshot));},
      async version(kind,id,version){return structuredClone(db.versions.get(key(kind,id)+':'+version)||null);},
      async versions(kind,id){return [...db.versions.entries()].filter(([k])=>k.startsWith(key(kind,id)+':')).map(([k,v])=>({version:Number(k.split(':').at(-1)),content_hash:sr2Hash(v)})).reverse();},
      async assignments(subject=null){return [...db.assignments.values()].filter(a=>a.tenantId===tenantId&&(!subject||subject===a.subject)).map(a=>structuredClone(a));},
      async grant(a){db.assignments.set(key('assignment',a.id),{...structuredClone(a),tenantId});},
      async revokeAssignment(id){db.assignments.get(key('assignment',id)).revoked=true;},
      async member(subject){return structuredClone(db.members.get(tenantId+':'+subject)||null);},
      async request(id){return structuredClone(db.requests.get(key('request',id))||null);},
      async requestByKey(id){return structuredClone([...db.requests.values()].find(r=>r.tenantId===tenantId&&r.idempotencyHash===id)||null);},
      async bindStatus(r,status){const hash=sr2Hash(status.entry);const existing=db.allocations.get(key('status',r.id));if(existing && (existing.hash!==hash||existing.handle!==status.handle))sr2Fail(409,'PCI-SR2-STATUS-COLLISION');for(const [k,v]of db.allocations)if(k.startsWith(tenantId+':')&&k!==key('status',r.id)&&(v.hash===hash||v.handle===status.handle))sr2Fail(409,'PCI-SR2-STATUS-COLLISION');db.allocations.set(key('status',r.id),{hash,handle:status.handle});},
      async saveRequest(r){db.requests.set(key('request',r.id),structuredClone(r));},
      async requests(id){return [...db.requests.values()].filter(r=>r.tenantId===tenantId&&r.configurationId===id).map(r=>structuredClone(r));},
      async expiredRequests(now){return [...db.requests.values()].filter(r=>r.tenantId===tenantId&&r.expiresAt<=now&&['journey','offered','preparing','processing','participant_notified','participant_data_received','status_allocated','signed'].includes(r.state)).map(r=>structuredClone(r));},
      async inFlight(now){return [...db.requests.values()].filter(r=>r.tenantId===tenantId&&['processing','participant_notified','participant_data_received','status_allocated','signed'].includes(r.state)&&r.expiresAt>now).length;},
      async event(e){db.events.push({...structuredClone(e),tenantId,cursor:db.events.length+1,createdAt:'2026-09-24T00:00:00Z'});},
      async events(id,f){return db.events.map(e=>{const r=db.requests.get(key('request',e.requestId));return {...e,credentialId:r?.credentialId ?? null,currentState:r?.state ?? null,statusReference:r?.status?.entry ?? null};}).filter(e=>e.tenantId===tenantId&&e.configurationId===id&&(!f.credentialId||e.credentialId===f.credentialId)&&(!f.cursor||e.cursor<f.cursor)&&(!f.subjectHash||e.subjectHash===f.subjectHash)&&(!f.requestId||e.requestId===f.requestId)&&(!f.type||e.type===f.type)&&(!f.from||Date.parse(e.createdAt)>=Date.parse(f.from))&&(!f.to||Date.parse(e.createdAt)<=Date.parse(f.to))).slice().reverse().slice(0,f.limit);},
      async blocked(id,s){return db.blocks.has(key(id,s));},async block(id,s){db.blocks.add(key(id,s));},async unblock(id,s){db.blocks.delete(key(id,s));},
      async rate(bucket,window,limit){const k=key(bucket,window);db.rates.set(k,(db.rates.get(k)||0)+1);if(db.rates.get(k)>limit)sr2Fail(429,'PCI-SR2-RATE');},
      async circuit(id){return structuredClone(db.circuits.get(key('circuit',id))||{failures:0,openUntil:0,probe:null});},
      async saveCircuit(id,state){db.circuits.set(key('circuit',id),structuredClone(state));},
      async publication(){return structuredClone(db.publications.get(tenantId)||{desired:0,observed:0,state:'draft'});},
      async dirty(){const r=await this.publication();r.desired++;r.state='pending';r.error_code=null;db.publications.set(tenantId,r);},
      async publicationResult(rev,code){const r=await this.publication();if(Number(r.desired)!==rev)return;r.state=code?'error':'published';r.error_code=code;if(!code)r.observed=rev;db.publications.set(tenantId,r);},
      async lifecycle(state){tx.tenant.state=state;},async lifecycleDone(){tx.tenant.state='deleted';}
    };
    try{if(!tx.tenant)sr2Fail(404,'PCI-SR2-NOT-FOUND');return await fn(tx);}catch(e){Object.assign(db,copy);throw e;}finally{release();}
  }};
}
