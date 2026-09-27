import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import { sr2VerifyJwt,sr2Retry,sr2Deadline,sr2CommonRequest } from '../../../backend/sr2/adapters.js';
import { sr2ResolvedParticipant,sr2TlsMaterial } from '../../../backend/sr2/participant-security.js';
import { extendSr2Maintenance } from '../../../backend/sr2/maintenance.js';
import { fixture,connector,alpha } from '../../support/sr2-fixture.mjs';
const clock=1800748800000;
function token(overrides={},headerOverrides={}){const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const header={alg:'ES256',kid:'one',typ:'JWT',...headerOverrides},claims={iss:'https://identity.example.com',aud:'participant',sub:'principal',tenant_id:alpha,scope:'credential:issue',exp:clock/1000+60,nbf:clock/1000-1,...overrides};const raw=[header,claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return {token:raw+'.'+crypto.sign('sha256',Buffer.from(raw),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url'),jwks:{keys:[{...pair.publicKey.export({format:'jwk'}),kid:'one'}]}};}
const identity={issuer:'https://identity.example.com',audience:'participant',subject:'principal',tenantId:alpha,scopes:['credential:issue']};
test('participant JWT validation checks real signature, issuer, audience, subject, tenant, scope and time',()=>{
 const good=token();assert.equal(sr2VerifyJwt(good.token,identity,good.jwks,clock).sub,'principal');
 for(const patch of [{iss:'https://wrong.example.com'},{aud:'wrong'},{sub:'wrong'},{tenant_id:'wrong'},{scope:'wrong'},{exp:clock/1000},{nbf:clock/1000+100}]){const bad=token(patch);assert.throws(()=>sr2VerifyJwt(bad.token,identity,bad.jwks,clock));}
 const other=token();assert.throws(()=>sr2VerifyJwt(good.token,identity,other.jwks,clock));
 for(const header of [{jku:'https://attacker.example.com/key'},{alg:'none'},{crit:['unknown']}]){const bad=token({},header);assert.throws(()=>sr2VerifyJwt(bad.token,identity,bad.jwks,clock));}
});
test('common.Request fragment preserves only evidenced field names; it is not an offering contract',()=>{assert.deepEqual(sr2CommonRequest('tenant','request'),{tenant_id:'tenant',request_id:'request'});assert.deepEqual(sr2CommonRequest('tenant','request','group'),{tenant_id:'tenant',request_id:'request',group_id:'group'});});
test('participant DNS pinning rejects metadata, loopback and rebinding answers',async()=>{
 for(const address of ['127.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','10.0.0.1','fe80::1'])await assert.rejects(()=>sr2ResolvedParticipant(connector(),async()=>[{address,family:address.includes(':')?6:4}]));
 const ok=await sr2ResolvedParticipant(connector(),async()=>[{address:'10.0.0.1',family:4}],['10.0.0.1']);assert.equal(ok.address,'10.0.0.1');assert.equal(ok.servername,'participant.example.com');
});
test('mTLS material reader rejects another tenant Secret before reading key data',async()=>{
 let reads=0;await assert.rejects(()=>sr2TlsMaterial(connector(),{tenant_id:alpha,owner_uid:'owner'},async()=>{reads++;return {metadata:{labels:{'xfsc.org/pci-tenant-id':'other'}}};}),e=>e.status===400);assert.equal(reads,2);
});
test('deadlines and retries are bounded and require verified idempotency',async()=>{
 await assert.rejects(()=>sr2Deadline(()=>new Promise(()=>{}),Date.now()+5),e=>e.code==='PCI-SR2-DEADLINE');let calls=0;
 await assert.rejects(()=>sr2Retry(async()=>{calls++;throw new Error('failure');},3,Date.now()+500));assert.equal(calls,1);
 calls=0;const result=await sr2Retry(async()=>{calls++;if(calls===1)throw Object.assign(new Error('transient'),{retryable:true,idempotentSafe:true});return 'ok';},2,Date.now()+2000);assert.equal(result,'ok');assert.equal(calls,2);
});
test('maintenance records expired history and refuses to acknowledge missing NATS contracts',async()=>{
 const f=fixture(false),{config}=await f.prepared(),p=f.principal('principal');const r=await f.api.start(p,config.id,crypto.randomUUID());f.advanceClock(600001);extendSr2Maintenance(f.api);await f.api.maintenance(alpha);assert.equal((await f.api.request(p,r.request.requestId)).request.state,'expired');assert.ok((await f.api.history(f.principal(),config.id)).items.some(e=>e.type==='expired'));assert.equal((await f.api.publication(f.principal())).state.observed,0);
});
