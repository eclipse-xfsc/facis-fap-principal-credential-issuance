import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture,configuration,connector,flow,alpha,beta} from '../../support/sr2-fixture.mjs';

async function scope(f,c,ids){return (await f.api.resource(f.principal(),'connector','update',c.id,{data:{...c.draft,configurationIds:ids}},c.version)).item;}
const scopeDenied=fn=>assert.rejects(fn,e=>e.code==='PCI-SR2-CONNECTOR-SCOPE');
test('review: issuer scope cannot switch to an unapproved connector or expose its metadata',async()=>{
 const f=fixture(),a=await f.prepared('A'),b=await f.prepared('B');
 await scope(f,a.connector,[a.config.id]);await scope(f,b.connector,[b.config.id]);
 await f.api.assignments(f.principal(),'grant',null,{subject:'issuer',configurationIds:[a.config.id]});const p=f.principal('issuer');
 assert.deepEqual((await f.api.capabilities(p)).connectors.map(c=>c.id),[a.connector.id]);
 await scopeDenied(()=>f.api.resource(p,'configuration','update',a.config.id,{data:{...a.config.draft,connectorId:b.connector.id}},a.config.version));
 await assert.rejects(()=>f.api.resource(p,'connector','update',b.connector.id,{data:{...b.connector.draft,configurationIds:null}},b.connector.version),e=>e.status===403);
 const saved=(await f.api.resource(p,'configuration','update',a.config.id,{data:{...a.config.draft,name:'Permitted edit'}},a.config.version)).item;
 await f.publish('configuration',saved,p);
});
test('review: connector defaults deny access; tenant-wide access requires an explicit administrator grant',async()=>{
 const f=fixture(),{configurationIds,...input}=connector(),c=(await f.api.resource(f.principal(),'connector','create',null,{data:input})).item;
 assert.deepEqual(c.draft.configurationIds,[]);
 await f.api.assignments(f.principal(),'grant',null,{subject:'issuer',configurationIds:null});const p=f.principal('issuer');
 assert.equal((await f.api.capabilities(p)).connectors.length,0);
 await scopeDenied(()=>f.api.resource(p,'configuration','create',null,{data:{...configuration(),connectorId:c.id}}));
 await scope(f,c,null);assert.equal((await f.api.capabilities(p)).connectors.length,1);
 assert.ok((await f.api.resource(p,'configuration','create',null,{data:{...configuration(),connectorId:c.id}})).item);
});
test('review: connector scopes reject another tenant configuration and legacy missing scope fails closed',async()=>{
 const f=fixture(),a=await f.prepared(),b=await f.prepared('B','internal-signing',beta);
 await assert.rejects(()=>scope(f,a.connector,[b.config.id]),e=>e.status===404);
 const r=f.store.db.resources.get(alpha+':connector:'+a.connector.id);delete r.draft.configurationIds;
 await scopeDenied(()=>f.api.start(f.principal('principal'),a.config.id,crypto.randomUUID()));
});
test('review: revoking connector scope immediately cancels pinned requests and late offers',async()=>{
 const f=fixture(),a=await f.prepared(),p=f.principal('principal'),id=await f.offered(a.config,p);
 let c=await scope(f,a.connector,[]);await scopeDenied(()=>f.api.complete(p,id,'ephemeral',null));
 c=await scope(f,c,[a.config.id]);let journey=await f.api.start(p,a.config.id,crypto.randomUUID());await f.api.advance(p,journey.request.requestId,{step:0,consent:true});
 const create=f.adapters.createOffer;f.adapters.createOffer=async ctx=>{await scope(f,c,[]);return create(ctx);};
 await scopeDenied(()=>f.api.offer(p,journey.request.requestId));
 assert.equal((await f.api.request(p,journey.request.requestId)).request.state,'indeterminate');
});
test('review: connector scope changed during signing prevents final credential delivery',async()=>{
 const f=fixture(),a=await f.prepared(),p=f.principal('principal'),id=await f.offered(a.config,p),verify=f.adapters.verifySigned;
 f.adapters.verifySigned=async ctx=>{const r=await verify(ctx);await scope(f,a.connector,[]);return r;};
 await scopeDenied(()=>f.api.complete(p,id,'ephemeral',null));assert.equal(f.store.db.events.some(e=>e.requestId===id&&e.type==='issued'),false);
});
for(const kind of ['flow','connector'])test('review: '+kind+' archive checks the active snapshot even after the draft switches dependency',async()=>{
 const f=fixture(),a=await f.prepared(),admin=f.principal();
 const replacement=await f.publish(kind,(await f.api.resource(admin,kind,'create',null,kind==='flow'?{configurationId:a.config.id,data:flow()}:{data:connector()})).item);
 await f.api.resource(admin,'configuration','update',a.config.id,{data:{...a.config.draft,[kind==='flow'?'flowId':'connectorId']:replacement.id}},a.config.version);
 await assert.rejects(()=>f.api.resource(admin,kind,'archive',a[kind].id,{},a[kind].version),e=>e.code==='PCI-SR2-IN-USE');
 assert.ok((await f.api.start(f.principal('principal'),a.config.id,crypto.randomUUID())).request);
});
test('review: archive protects in-progress pins after a replacement is published',async()=>{
 const f=fixture(),a=await f.prepared(),p=f.principal('principal');await f.api.start(p,a.config.id,crypto.randomUUID());
 const replacement=await f.publish('flow',(await f.api.resource(f.principal(),'flow','create',null,{configurationId:a.config.id,data:flow()})).item);
 const c=(await f.api.resource(f.principal(),'configuration','update',a.config.id,{data:{...a.config.draft,flowId:replacement.id}},a.config.version)).item;await f.publish('configuration',c);
 await assert.rejects(()=>f.api.resource(f.principal(),'flow','archive',a.flow.id,{},a.flow.version),e=>e.code==='PCI-SR2-IN-USE');
 f.advanceClock(600001);assert.equal((await f.api.resource(f.principal(),'flow','archive',a.flow.id,{},a.flow.version)).item.state,'archived');
});
test('review: history includes a verified credential ID, safe status reference, and latest state after revocation',async()=>{
 const f=fixture(),a=await f.prepared(),p=f.principal('principal'),id=await f.offered(a.config,p),issued=await f.api.complete(p,id,'ephemeral',null);
 const rows=(await f.api.history(f.principal(),a.config.id,{requestId:id})).items,e=rows.find(e=>e.type==='issued');
 assert.match(e.credentialId,/^urn:uuid:/);assert.equal(e.currentState,'issued');assert.match(e.statusReference.id,/^https:\/\/alpha-pci\.example\.com\/status#/);
 assert.equal(e.statusReference.handle,undefined);const output=JSON.stringify(rows);assert.ok(!output.includes(issued.credential));assert.ok(!output.includes(f.privateClaim));
 assert.ok((await f.api.history(f.principal(),a.config.id,{credentialId:e.credentialId})).items.length);
 assert.equal((await f.api.history(f.principal(),a.config.id,{credentialId:'urn:uuid:absent'})).items.length,0);
 await f.api.revoke(f.principal(),a.config.id,id,true);
 const after=(await f.api.history(f.principal(),a.config.id,{credentialId:e.credentialId})).items;
 assert.ok(after.every(x=>x.currentState==='revoked'));assert.equal(after.find(x=>x.type==='issued').credentialId,e.credentialId);
 await assert.rejects(()=>f.api.history(f.principal('admin',beta),a.config.id,{credentialId:e.credentialId}),e=>e.status===404);
});
