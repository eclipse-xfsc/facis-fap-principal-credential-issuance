import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture,alpha} from '../../support/sr2-fixture.mjs';
async function issued(){const f=fixture(),{config}=await f.prepared(),p=f.principal('principal'),id=await f.offered(config,p);await f.api.complete(p,id,'transient',null);return {...f,config,p,id};}
const ack=(t,revoked)=>({tenantId:t.tenantId,requestId:t.requestId,handle:t.status.handle,revoked});
test('lost revocation acknowledgement blocks immediately and readback completes without a second mutation',async()=>{
 const f=await issued();let writes=0;
 f.adapters.revokeStatus=async()=>{writes++;throw Error('lost acknowledgement');};
 await assert.rejects(f.api.revoke(f.principal(),f.config.id,f.id,true));
 await assert.rejects(f.api.start(f.p,f.config.id,crypto.randomUUID()),{code:'PCI-SR2-REISSUANCE-BLOCKED'});
 await assert.rejects(f.api.unblock(f.principal(),f.config.id,f.api.hashSubject(alpha,f.p.subject)),{code:'PCI-REVOCATION-PENDING'});
 f.adapters.revocationStatus=async t=>ack(t,true);
 assert.equal((await f.api.revoke(f.principal(),f.config.id,f.id,true)).revoked,true);
 assert.equal(writes,1);assert.equal(f.store.db.events.filter(e=>e.type==='revoked'&&e.requestId===f.id).length,1);
});
test('negative readback retries the same status with a stable idempotency key',async()=>{
 const f=await issued(),keys=[];let attempts=0;
 f.adapters.revokeStatus=async t=>{keys.push(t.idempotencyKey);if(!attempts++)throw Error('offline');return ack(t,true);};
 f.adapters.revocationStatus=async t=>ack(t,false);
 await assert.rejects(f.api.revoke(f.principal(),f.config.id,f.id,true));
 f.advanceClock(5001);assert.deepEqual(await f.api.recoverRevocations(alpha),{recovered:1,pending:0});
 assert.deepEqual(keys,['revoke:'+f.id,'revoke:'+f.id]);assert.equal((await f.api.request(f.p,f.id)).request.state,'revoked');
});
test('restart recovers an expired revoking lease and rejects cross-tenant readback',async()=>{
 const f=await issued();await f.store.transaction(alpha,async tx=>{const r=await tx.request(f.id);r.state='revoking';r.revocation={lease:'dead-process',leaseUntil:f.clock()+1000,nextAttemptAt:f.clock()+1000,attempts:1};await tx.saveRequest(r);});
 f.adapters.revocationStatus=async t=>({...ack(t,true),tenantId:crypto.randomUUID()});
 assert.deepEqual(await f.api.recoverRevocations(alpha),{recovered:0,pending:0});f.advanceClock(1001);
 assert.deepEqual(await f.api.recoverRevocations(alpha),{recovered:0,pending:1});assert.equal((await f.api.request(f.p,f.id)).request.state,'revocation_indeterminate');
 f.adapters.revocationStatus=async t=>ack(t,true);f.advanceClock(20001);
 assert.deepEqual(await f.api.recoverRevocations(alpha),{recovered:1,pending:0});
});
test('an active lease prevents parallel external revocations',async()=>{
 const f=await issued();let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 f.adapters.revokeStatus=async t=>{entered();await gate;return ack(t,true);};
 const pending=f.api.revoke(f.principal(),f.config.id,f.id,true);await ready;
 await assert.rejects(f.api.revoke(f.principal(),f.config.id,f.id,true),{code:'PCI-REVOCATION-IN-PROGRESS'});release();await pending;
});
