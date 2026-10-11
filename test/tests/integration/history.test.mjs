import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture,alpha,beta} from '../../support/sr2-fixture.mjs';
import {sr2HolderDid,sr2PrincipalStatement} from '../../../backend/sr2/history.js';

test('history enriches only authorized tenant metadata and never persists the JWT or participant claims',async()=>{
 const f=fixture(),{config}=await f.prepared(),p=f.principal('principal');
 Object.assign(f.store.db.members.get(alpha+':principal'),{username:'alex@example.test',email:'alex@example.test',first_name:'Alex',last_name:'Example'});
 Object.assign(f.store.db.members.get(beta+':principal'),{username:'other@example.test',first_name:'Other'});
 const key=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});
 const id=await f.offered(config,p);await f.api.complete(p,id,'ephemeral-access-token',{jwk:key});
 // References can be rebuilt from existing IAM membership after an upgrade.
 f.store.db.principals.clear();
 const history=await f.api.history(f.principal(),config.id,{principal:'ALEX@EXAMPLE',type:'issued'});
 assert.equal(history.items.length,1);const item=history.items[0];assert.equal(item.principal.name,'Alex Example');
 assert.equal(item.holderDid,sr2HolderDid({jwk:key}));assert.equal(item.credentialId.startsWith('urn:uuid:'),true);
 assert.ok(item.statusReference);assert.ok(item.createdAt);
 const [header,payload]=item.principalJwt.split('.').slice(0,2).map(s=>JSON.parse(Buffer.from(s,'base64url')));
 assert.equal(header.typ,'pci-history+jwt');assert.equal(payload.tenant_id,alpha);assert.equal(payload.exp-payload.iat,300);
 assert.equal(payload.principal.email,'alex@example.test');
 assert.equal((await f.api.history(f.principal(),config.id,{principal:'Other'})).items.length,0);
 await assert.rejects(()=>f.api.history(f.principal('principal'),config.id),e=>e.status===404);
 await assert.rejects(()=>f.api.history(f.principal('admin',beta),config.id),e=>e.status===404);
 const saved=JSON.stringify([...f.store.db.requests.values(),...f.store.db.events]);
 for(const secret of ['ephemeral-access-token',f.privateClaim,item.principalJwt,'alex@example.test'])assert.equal(saved.includes(secret),false);
});

test('holder DID contains only the public key and history statements have a separate MAC context',()=>{
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'});
 assert.deepEqual(JSON.parse(Buffer.from(sr2HolderDid({jwk}).slice(8),'base64url')),jwk);
 assert.throws(()=>sr2HolderDid({jwk:pair.privateKey.export({format:'jwk'})}));
 const pepper=crypto.randomBytes(32),r=sr2PrincipalStatement(null,{tenantId:alpha,subjectHash:'a'.repeat(64),issuer:'https://alpha.example',pepper,now:0});
 const [h,b,sig]=r.principalJwt.split('.');assert.equal(r.principal.unavailable,true);
 const key=crypto.createHmac('sha256',pepper).update('pci-history-statement-v1').digest();
 assert.equal(sig,crypto.createHmac('sha256',key).update(h+'.'+b).digest('base64url'));
 assert.notEqual(sig,crypto.createHmac('sha256',pepper).update(h+'.'+b).digest('base64url'));
});

test('revoking legacy configurations always blocks reissuance until an audited administrator override',async()=>{
 const f=fixture(),{config}=await f.prepared(),p=f.principal('principal');
 for(const [key,value]of f.store.db.versions)if(key.includes(':configuration:'))value.blockReissuance=false;
 const id=await f.offered(config,p);await f.api.complete(p,id,'ephemeral',null);
 await f.api.revoke(f.principal(),config.id,id,true);
 await assert.rejects(()=>f.api.start(p,config.id,crypto.randomUUID()),e=>e.status===403);
 const row=[...f.store.db.requests.values()].find(r=>r.id===id);
 await assert.rejects(()=>f.api.unblock(p,config.id,row.subjectHash),e=>e.status===403);
 await f.api.unblock(f.principal(),config.id,row.subjectHash);
 assert.ok((await f.api.start(p,config.id,crypto.randomUUID())).request.requestId);
 assert.ok(f.store.db.events.some(e=>e.type==='reissuance.unblocked'));
});
