import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
const holder=()=>({jwk:crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'})});
import {createPciNativeAdapters} from '../../../backend/sr2/native.js';
import {pciLdpContext,pciLdpSubject} from '../../../backend/sr2/linked-data.js';
import {sr2Hash} from '../../../backend/sr2/domain.js';
import {fixture} from '../../support/sr2-fixture.mjs';

// A local HTTP contract server, not a claim of running upstream Crypto.
test('Crypto 2.3.7 LDP verification preserves bytes, omits obsolete scope headers and requires a boolean verdict',async()=>{
 const requests=[];let reply={valid:true};
 const server=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;requests.push({url:req.url,method:req.method,headers:req.headers,body:JSON.parse(body)});res.setHeader('content-type','application/json');res.end(JSON.stringify(reply));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const now=Date.now(),origin='https://alpha.example',did='did:web:alpha.example',holderBinding={jwk:{kty:'EC',crv:'P-256',x:'synthetic',y:'synthetic'}};
  const configuration={identifier:'Employee',format:'ldp_vc',keyRef:'issuer',credentialTypes:['VerifiableCredential','Employee'],claims:[{name:'name',type:'string',required:true}]};
  const status={entry:{id:origin+'/status/1#2',type:'StatusList2021Entry',statusPurpose:'revocation',statusListIndex:'2',statusListCredential:origin+'/status/1'}};
  const doc={'@context':pciLdpContext(configuration,origin),id:'urn:uuid:11111111-1111-4111-8111-111111111111',type:configuration.credentialTypes,issuer:did,issuanceDate:new Date(now-1000).toISOString(),expirationDate:new Date(now+60000).toISOString(),credentialSubject:{id:pciLdpSubject('alice'),pciClaims:{name:'Synthetic'}},credentialStatus:status.entry,proof:{type:'JsonWebSignature2020',challenge:sr2Hash(holderBinding)}};
  const credential=' \n'+JSON.stringify(doc,null,2)+'\n';
  const ctx={r:{tenantId:'tenant-a'},principal:{subject:'alice'},metadata:{issuer:origin,did},configuration,status,holderBinding,credential,deadline:now+60000};
  const adapter=createPciNativeAdapters({signerUrl:'http://127.0.0.1:'+server.address().port,now:()=>now});
  assert.deepEqual(await adapter.verifySigned(ctx),{credentialId:doc.id});
  assert.equal(requests[0].url,'/v1/credential/verify');assert.equal(requests[0].method,'POST');
  assert.equal(requests[0].headers['x-format'],'ldp_vc');
  for(const name of ['x-namespace','x-group','x-tenantid','x-groupid'])assert.equal(requests[0].headers[name],undefined);
  assert.equal(Buffer.from(requests[0].body.credential,'base64').toString(),credential);
  assert.deepEqual(requests[0].body.disclosureFrame,[]);
  for(const invalid of [{valid:false},{valid:'true'},{},null]){reply=invalid;await assert.rejects(adapter.verifySigned(ctx));}
  reply={valid:true};await assert.rejects(adapter.verifySigned({...ctx,principal:{subject:'another-user'}}));
  assert.equal(adapter.capabilities().adapter,'ocm-esb-12.3.9');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
for(const mode of ['internal-signing','participant-signed']){
 test(mode+' requires positive independent native status before delivery',async()=>{
  for(const result of [{valid:false},{},null,'unavailable']){
   const f=fixture(),a=await f.prepared('Employee',mode),p=f.principal('principal'),id=await f.offered(a.config,p);let reached=false;
   f.adapters.verifyStatus=async()=>{reached=true;if(result==='unavailable')throw new Error('unavailable');return result;};
   await assert.rejects(f.api.complete(p,id,'ephemeral',holder()));
   assert.equal(reached,true);assert.equal((await f.api.request(p,id)).request.state,'indeterminate');
  }
  const f=fixture(),a=await f.prepared('Employee',mode),p=f.principal('principal'),id=await f.offered(a.config,p);let checked=false;
  f.adapters.verifyStatus=async t=>{checked=true;assert.equal(t.r.id,id);assert.ok(t.credential);assert.ok(t.status.entry);return {valid:true};};
  assert.ok((await f.api.complete(p,id,'ephemeral',holder())).credential);assert.equal(checked,true);
 });
}
