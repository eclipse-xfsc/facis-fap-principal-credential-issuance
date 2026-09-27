import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fixture, configuration, flow, connector, alpha, beta } from '../../support/sr2-fixture.mjs';
import { sr2Png, sr2Crc } from '../../../backend/sr2/assets.js';
import { sr2Configuration, sr2Flow, sr2Branding, sr2Connector } from '../../../backend/sr2/domain.js';
import zlib from 'node:zlib';

const rejected=(fn,status)=>assert.rejects(fn,e=>e.status===status);
test('persistent participant circuit isolates tenants and permits only one recovery probe',async()=>{
 const f=fixture(),a=await f.prepared(),b=await f.prepared('Beta','internal-signing',beta),p=f.principal('principal');
 const notify=f.adapters.notifyParticipant;
 f.adapters.notifyParticipant=async()=>{throw Object.assign(new Error('Dependency unavailable'),{status:503});};
 for(let i=0;i<3;i++){const id=await f.offered(a.config,p);await rejected(()=>f.api.complete(p,id,'ephemeral',null),503);}
 const blocked=await f.offered(a.config,p),count=f.calls.length;await assert.rejects(()=>f.api.complete(p,blocked,'ephemeral',null),e=>e.code==='PCI-SR2-CIRCUIT-OPEN');assert.equal(f.calls.length,count);
 f.adapters.notifyParticipant=notify;const bp=f.principal('principal',beta),bid=await f.offered(b.config,bp);await f.api.complete(bp,bid,'ephemeral',null);
 f.advanceClock(30001);let release,started;const entered=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 f.adapters.notifyParticipant=async c=>{started();await gate;return notify(c);};
 const probe=await f.offered(a.config,p),next=await f.offered(a.config,p),pending=f.api.complete(p,probe,'ephemeral',null);await entered;
 await assert.rejects(()=>f.api.complete(p,next,'ephemeral',null),e=>e.code==='PCI-SR2-CIRCUIT-OPEN');release();await pending;
 const state=await f.store.transaction(alpha,tx=>tx.circuit(a.connector.id));assert.equal(state.failures,0);assert.equal(state.openUntil,0);assert.equal(state.probe,null);
});
test('issuance rechecks eligibility when membership changes during signing',async()=>{
 const f=fixture(),a=await f.prepared(),p=f.principal('principal'),id=await f.offered(a.config,p),verify=f.adapters.verifySigned;
 f.adapters.verifySigned=async c=>{const result=await verify(c);f.store.db.members.get(alpha+':'+p.subject).roles=[];return result;};
 await assert.rejects(()=>f.api.complete(p,id,'ephemeral',null));
 assert.equal(f.store.db.events.some(e=>e.requestId===id&&e.type==='issued'),false);
});
test('delegation immediately grants/revokes configuration rights without stale OIDC role authority',async()=>{
 const f=fixture(),admin=f.principal(),issuer=f.principal('issuer');await rejected(()=>f.api.resource(issuer,'configuration','create',null,{data:configuration()}),403);
 const a=(await f.api.assignments(admin,'grant',null,{subject:'issuer',configurationIds:null})).item;
 const config=(await f.api.resource(issuer,'configuration','create',null,{data:configuration()})).item;assert.equal(config.draft.identifier,'Employee');
 await rejected(()=>f.api.resource(issuer,'metadata','create',null,{data:{}}),403);
 await f.api.assignments(admin,'revoke',a.id);await rejected(()=>f.api.resource(issuer,'configuration','get',config.id),404);
});
test('configuration-scoped delegation hides other objects and cannot create new configurations',async()=>{
 const f=fixture(),a=await f.prepared('Alpha'),b=await f.prepared('Beta');await f.api.assignments(f.principal(),'grant',null,{subject:'issuer',configurationIds:[a.config.id]});
 const p=f.principal('issuer');assert.deepEqual((await f.api.list(p,'configuration')).items.map(x=>x.id),[a.config.id]);await rejected(()=>f.api.resource(p,'configuration','get',b.config.id),404);await rejected(()=>f.api.resource(p,'configuration','create',null,{data:configuration('New')}),403);
});
test('wrong tenant session, host, object, flow and connector fail without exposing another tenant',async()=>{
 const f=fixture(),a=await f.prepared(),b=await f.prepared('Beta','internal-signing',beta),p=f.principal();
 await rejected(()=>f.api.resource(p,'configuration','get',b.config.id),404);
 await rejected(()=>f.api.resource({...p,host:'beta-pci.example.com'},'configuration','get',a.config.id),404);
 await rejected(()=>f.api.resource(p,'configuration','update',a.config.id,{data:{...a.config.draft,flowId:b.flow.id}},a.config.version),404);
 await rejected(()=>f.api.resource(p,'configuration','update',a.config.id,{data:{...a.config.draft,connectorId:b.connector.id}},a.config.version),404);
 await rejected(()=>f.api.history(p,b.config.id),404);
});
test('typed metadata rejects incompatible profiles, unknown code and invalid claims',()=>{
 assert.throws(()=>sr2Configuration({...configuration(),format:'vc+sd-jwt'}));
 assert.throws(()=>sr2Configuration({...configuration(),javascript:'execute()'}));
 assert.throws(()=>sr2Configuration({...configuration(),claims:[{name:'__proto__',type:'string',required:true}]}));
 assert.throws(()=>sr2Flow({...flow(),steps:[{...flow().steps[0],type:'javascript'},flow().steps[1]]}));
 assert.throws(()=>sr2Flow({...flow(),steps:[flow().steps[1],flow().steps[0]]}));
 assert.throws(()=>sr2Branding({title:'A',description:'',accent:'#ffffff'}));
});
test('optimistic concurrency and immutable publication keep started requests pinned',async()=>{
 const f=fixture(),{config,c}=await f.prepared(),p=f.principal(),principal=f.principal('principal');
 const first=await f.api.start(principal,config.id,crypto.randomUUID());
 let draft=(await f.api.resource(p,'configuration','update',config.id,{data:{...config.draft,description:'Updated description'}},config.version)).item;
 assert.equal(draft.activeVersion,config.activeVersion);await rejected(()=>f.api.resource(p,'configuration','update',config.id,{data:config.draft},config.version),412);
 await rejected(()=>f.api.resource(p,'configuration','update',config.id,{data:config.draft}),428);
 draft=await f.publish('configuration',draft);
 const pinned=(await f.api.request(principal,first.request.requestId)).request;assert.equal(pinned.configurationVersion,config.activeVersion);assert.notEqual(pinned.configurationVersion,draft.activeVersion);
 const snapshots=await f.store.transaction(alpha,tx=>tx.version('configuration',config.id,config.activeVersion));assert.equal(snapshots.description,config.draft.description);
});
test('two configurations own different journeys and rollback creates a new draft',async()=>{
 const f=fixture(),a=await f.prepared('First'),b=await f.prepared('Second');let changed=(await f.api.resource(f.principal(),'flow','update',b.flow.id,{configurationId:b.config.id,data:{name:'Survey journey',steps:[{id:'survey',type:'input',title:'Survey',text:'',fields:[{name:'answer',label:'Answer',required:true}]},...flow().steps]}},b.flow.version)).item;
 changed=await f.publish('flow',changed);const one=await f.api.start(f.principal('principal'),a.config.id,crypto.randomUUID()),two=await f.api.start(f.principal('principal'),b.config.id,crypto.randomUUID());assert.equal(one.flow.steps.length,2);assert.equal(two.flow.steps.length,3);
 await rejected(()=>f.api.advance(f.principal('principal'),two.request.requestId,{step:0,values:{}}),400);
 await f.api.advance(f.principal('principal'),two.request.requestId,{step:0,values:{answer:'Transient Survey Answer'}});
 const restored=(await f.api.resource(f.principal(),'flow','rollback',changed.id,{version:b.flow.activeVersion},changed.version)).item;assert.equal(restored.activeVersion,changed.activeVersion);assert.equal(restored.draft.steps.length,2);assert.ok(restored.version>changed.version);
 assert.equal(JSON.stringify([...f.store.db.requests.values()]).includes('Transient Survey Answer'),false);
});
test('offer idempotency, consent, expiry and replay are deterministic',async()=>{
 const f=fixture(),{config}=await f.prepared(),p=f.principal('principal'),key=crypto.randomUUID();const a=await f.api.start(p,config.id,key),b=await f.api.start(p,config.id,key);assert.equal(a.request.requestId,b.request.requestId);
 await rejected(()=>f.api.offer(p,a.request.requestId),400);await rejected(()=>f.api.advance(p,a.request.requestId,{step:0,consent:false}),400);await f.api.advance(p,a.request.requestId,{step:0,consent:true});
 await f.api.offer(p,a.request.requestId);await rejected(()=>f.api.offer(p,a.request.requestId),409);f.advanceClock(600001);await rejected(()=>f.api.complete(p,a.request.requestId,'ephemeral',null),410);
});
for(const mode of ['internal-signing','participant-signed'])test(mode+' validates signed output and persists privacy-safe events only',async()=>{
 const f=fixture(),{config}=await f.prepared('Employee',mode),p=f.principal('principal'),id=await f.offered(config,p);const response=await f.api.complete(p,id,'ephemeral-not-persisted',null);
 assert.equal(response.format,'jwt_vc_json');assert.equal(response.credential.split('.').length,3);const expected=mode==='internal-signing'?['offer','identity','notify','data','status','sign','verify']:['offer','identity','notify','status','data','verify'];assert.deepEqual(f.calls,expected);
 await rejected(()=>f.api.complete(p,id,'ephemeral',null),409);
 const persisted=JSON.stringify({resources:[...f.store.db.resources.values()],requests:[...f.store.db.requests.values()],events:f.store.db.events});
 for(const secret of ['ephemeral-not-persisted',f.privateClaim,response.credential,'unsignedData','signedCredential'])assert.equal(persisted.includes(secret),false,secret.slice(0,20));
 const events=(await f.api.history(f.principal(),config.id)).items;assert.ok(events.some(e=>e.type==='issued'));assert.ok(events.some(e=>e.type==='status_allocated'));
});
test('wrong signing mode and unknown fields cannot enter signing',async()=>{
 const f=fixture(),{config}=await f.prepared(),p=f.principal('principal'),id=await f.offered(config,p);f.adapters.getParticipantData=async()=>({requestId:id,unsignedData:{},signedCredential:'bad'});await rejected(()=>f.api.complete(p,id,'ephemeral',null),400);assert.equal(f.calls.includes('sign'),false);
});
test('cross-tenant signature/status context is rejected before marking issued',async()=>{
 const f=fixture(),{config}=await f.prepared(),p=f.principal('principal'),id=await f.offered(config,p);const original=f.adapters.allocateStatus;f.adapters.allocateStatus=async c=>({...await original(c),tenantId:beta});await rejected(()=>f.api.complete(p,id,'ephemeral',null),400);assert.equal(f.calls.includes('sign'),false);assert.equal((await f.api.request(p,id)).request.state,'indeterminate');
});
test('revocation resolves the stored status, is idempotent, blocks reissuance and cannot affect Beta',async()=>{
 const f=fixture(),{config}=await f.prepared(),b=await f.prepared('Beta','internal-signing',beta),p=f.principal('principal'),id=await f.offered(config,p);await f.api.complete(p,id,'ephemeral',null);
 await rejected(()=>f.api.revoke(f.principal('admin',beta),b.config.id,id,true),404);assert.equal(f.calls.includes('revoke'),false);
 await f.api.revoke(f.principal(),config.id,id,true);await f.api.revoke(f.principal(),config.id,id,true);assert.equal(f.calls.filter(c=>c==='revoke').length,1);
 await rejected(()=>f.api.start(p,config.id,crypto.randomUUID()),403);
 await f.api.unblock(f.principal(),config.id,f.api.hashSubject(alpha,p.subject));assert.ok((await f.api.start(p,config.id,crypto.randomUUID())).request);
});
test('failed external revocation does not claim local revoked state or retry blindly',async()=>{
 const f=fixture(),{config}=await f.prepared(),id=await f.offered(config);await f.api.complete(f.principal('principal'),id,'ephemeral',null);f.adapters.revokeStatus=async()=>({revoked:false});await rejected(()=>f.api.revoke(f.principal(),config.id,id,true),400);assert.equal((await f.api.request(f.principal('principal'),id)).request.state,'revocation_indeterminate');
 assert.equal((await f.api.history(f.principal(),config.id)).items.some(e=>e.type==='revoked'),false);
});
test('archive stops new issuance and keeps immutable dependencies and history',async()=>{
 const f=fixture(),{config}=await f.prepared(),id=await f.offered(config);await f.api.complete(f.principal('principal'),id,'ephemeral',null);await f.api.resource(f.principal(),'configuration','archive',config.id,{},config.version);await rejected(()=>f.api.start(f.principal('principal'),config.id,crypto.randomUUID()),400);assert.ok((await f.api.history(f.principal(),config.id)).items.some(e=>e.type==='issued'));await f.api.revoke(f.principal(),config.id,id,true);
});
test('bounded rate limits isolate Alpha from Beta',async()=>{
 const f=fixture(),a=await f.prepared(),b=await f.prepared('Beta','internal-signing',beta);for(let i=0;i<10;i++)await f.api.start(f.principal('principal'),a.config.id,crypto.randomUUID());await rejected(()=>f.api.start(f.principal('principal'),a.config.id,crypto.randomUUID()),429);assert.ok((await f.api.start(f.principal('principal',beta),b.config.id,crypto.randomUUID())).request);
});
test('connector rejects SSRF, credentials, PEM fields and wrong server names',()=>{
 for(const patch of [{endpoint:'http://participant.example.com'},{endpoint:'https://localhost'},{endpoint:'https://participant.example.com',serverName:'wrong.example.com'},{endpoint:'https://user:password@participant.example.com'},{privateKey:'not allowed'}])assert.throws(()=>sr2Connector({...connector(),...patch},['participant.example.com','localhost']));
});
test('missing upstream contracts fail closed, and publication cannot claim success',async()=>{
 const f=fixture(false),{config}=await f.prepared(),p=f.principal('principal'),r=await f.api.start(p,config.id,crypto.randomUUID());await f.api.advance(p,r.request.requestId,{step:0,consent:true});await rejected(()=>f.api.offer(p,r.request.requestId),503);assert.equal((await f.api.request(p,r.request.requestId)).request.state,'journey');await rejected(()=>f.api.publication(f.principal(),true),503);const state=(await f.api.publication(f.principal())).state;assert.equal(state.observed,0);assert.equal(state.state,'error');
});
test('stale publication acknowledgement cannot overwrite a newer desired revision',async()=>{
 const f=fixture();await f.prepared();const old=(await f.api.publication(f.principal())).state.desired;await f.store.transaction(alpha,tx=>tx.dirty());await f.store.transaction(alpha,tx=>tx.publicationResult(old,null));const current=(await f.api.publication(f.principal())).state;assert.equal(current.observed,0);assert.equal(current.desired,old+1);
});
test('published tenant deletion waits for retirement; suspension denies issuance',async()=>{
 const f=fixture(),{config}=await f.prepared();await rejected(()=>f.api.lifecycle(f.principal(),'deleting','alpha'),409);await f.api.lifecycle(f.principal(),'suspended','alpha');await rejected(()=>f.api.start(f.principal('principal'),config.id,crypto.randomUUID()),409);
});
function png(){function chunk(type,b){const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(b.length);crc.writeUInt32BE(sr2Crc(Buffer.concat([t,b])));return Buffer.concat([n,t,b,crc]);}const h=Buffer.alloc(13);h.writeUInt32BE(1);h.writeUInt32BE(1,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('tEXt',Buffer.from('unused metadata')),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]).toString('base64');}
test('PNG decoder strips metadata and rejects SVG, corruption, and path injection',async()=>{
 const optimized=sr2Png(png());assert.equal(optimized.width,1);assert.equal(Buffer.from(optimized.base64,'base64').includes(Buffer.from('unused metadata')),false);assert.deepEqual(sr2Png(optimized.base64),optimized);
 assert.throws(()=>sr2Png(Buffer.from('<svg onload="alert(1)"/>').toString('base64')));const corrupt=Buffer.from(png(),'base64');corrupt[20]^=1;assert.throws(()=>sr2Png(corrupt.toString('base64')));
 const f=fixture(),{config}=await f.prepared();await rejected(()=>f.api.resource(f.principal(),'asset','create',null,{configurationId:config.id,data:{mediaType:'image/png',base64:png(),filename:'../../etc/passwd'}}),400);
 const a=(await f.api.resource(f.principal(),'asset','create',null,{configurationId:config.id,data:{mediaType:'image/png',base64:png()}})).item;assert.equal(a.draft.base64,undefined);await rejected(()=>f.api.asset({tenantId:beta,host:'beta-pci.example.com'},a.id,true),404);await rejected(()=>f.api.asset({tenantId:alpha,host:'alpha-pci.example.com'},a.id,true),404);
 const updated=(await f.api.resource(f.principal(),'configuration','update',config.id,{data:{...config.draft,logoAssetId:a.id}},config.version)).item;await f.publish('configuration',updated);assert.ok((await f.api.asset({tenantId:alpha,host:'alpha-pci.example.com'},a.id,true)).bytes);await rejected(()=>f.api.resource(f.principal(),'asset','archive',a.id,{},a.version),409);
});

test('a duplicate status allocation cannot sign a second credential',async()=>{
 const f=fixture(),{config}=await f.prepared(),p=f.principal('principal'),first=await f.offered(config,p);await f.api.complete(p,first,'ephemeral',null);const stored=await f.store.transaction(alpha,tx=>tx.request(first));const second=await f.offered(config,p);
 f.adapters.allocateStatus=async c=>({...structuredClone(stored.status),requestId:c.r.id,handle:c.r.id});const signs=f.calls.filter(c=>c==='sign').length;await rejected(()=>f.api.complete(p,second,'ephemeral',null),409);assert.equal(f.calls.filter(c=>c==='sign').length,signs);
});
test('history supports bounded cursors and ISO date filters',async()=>{
 const f=fixture(),{config}=await f.prepared();const all=await f.api.history(f.principal(),config.id,{limit:2,from:'2026-09-23T00:00:00Z',to:'2026-09-25T00:00:00Z'});assert.equal(all.items.length,2);assert.ok(all.nextCursor);const older=await f.api.history(f.principal(),config.id,{limit:2,cursor:all.nextCursor});assert.ok(older.items.every(e=>e.cursor<all.nextCursor));assert.equal((await f.api.history(f.principal(),config.id,{from:'2026-10-01T00:00:00Z'})).items.length,0);
});
