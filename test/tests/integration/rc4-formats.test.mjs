import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {createPciNativeAdapters,pciNativeMetadata,pciLdpContext} from '../../../backend/sr2/native.js';
import {pciWalletMetadata} from '../../../backend/sr2/profiles.js';
import {pciEvent} from '../../../backend/sr2/wire.js';
const tid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',origin='https://alpha.example.com',did='did:web:alpha.example.com';
function setup(format,claims={name:'Synthetic'}){
 const key=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),now=Date.now(),calls=[];
 const t={r:{tenantId:tid,id:rid},tenant:{tenant_id:tid},principal:{subject:'alice'},metadata:{issuer:origin,did},configuration:{format,keyRef:'issuer',vct:origin+'/employee',credentialTypes:['VerifiableCredential','Employee'],claims:[{name:'name',type:'string',required:false}]},data:{claims},holderBinding:{jwk:key.publicKey.export({format:'jwk'})},status:{entry:{status_list:{idx:1,uri:origin+'/status/1'}}},deadline:now+10000};
 const adapter=createPciNativeAdapters({now:()=>now,signerUrl:'https://tsa',nats:{request:async(topic,e)=>{calls.push([topic,e]);assert.equal(e.type,'signer.signToken');const header={...JSON.parse(Buffer.from(e.data.header,'base64')),alg:'ES256'};const b=Buffer.from(JSON.stringify(header)).toString('base64url')+'.'+Buffer.from(e.data.payload,'base64').toString('base64url');const token=b+'.'+crypto.sign('sha256',Buffer.from(b),{key:key.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');return pciEvent(e.type,{...e.data,token:Buffer.from(token).toString('base64')});}},http:async url=>{assert.match(url,/\/v1\/jwk\//);return {status:200,data:key.publicKey.export({format:'jwk'})};}});
 return {t,adapter,calls};
}
for(const format of ['vc+sd-jwt','dc+sd-jwt'])test(format+' signs through native signToken and independently verifies disclosures and holder binding',async()=>{
 const f=setup(format),credential=await f.adapter.sign(f.t);assert.equal(f.calls.length,1);
 const head=JSON.parse(Buffer.from(credential.split('.')[0],'base64url'));assert.equal(head.typ,format);
 assert.ok((await f.adapter.verifySigned({...f.t,credential})).credentialId.startsWith('urn:uuid:'));
 const parts=credential.split('~');parts[1]=Buffer.from(JSON.stringify(['wrong-salt','name','Changed'])).toString('base64url');await assert.rejects(f.adapter.verifySigned({...f.t,credential:parts.join('~')}));
 await assert.rejects(f.adapter.verifySigned({...f.t,credential,holderBinding:{jwk:{}}}));
 await assert.rejects(f.adapter.verifySigned({...f.t,credential,configuration:{...f.t.configuration,format:format==='vc+sd-jwt'?'dc+sd-jwt':'vc+sd-jwt'}}));
 const empty=setup(format,{}),minimal=await empty.adapter.sign(empty.t);assert.equal(minimal.split('~').length,2);await empty.adapter.verifySigned({...empty.t,credential:minimal});
});
test('metadata uses W3C subject paths, SD-JWT root paths and the linked-data suite',()=>{
 const configurations=['jwt_vc_json','ldp_vc','vc+sd-jwt','dc+sd-jwt'].map((format,i)=>({id:rid,data:{...setup(format).t.configuration,identifier:'C'+i,name:'Employee',claims:[{name:'name',type:'string',required:true}]}}));
 const metadata=pciNativeMetadata({tenantId:tid,issuer:{issuer:origin,displayName:'Alpha',authorizationServers:[origin]},configurations},()=>origin+'/logo');
 for(const [i,format]of ['jwt_vc_json','ldp_vc','vc+sd-jwt','dc+sd-jwt'].entries())assert.deepEqual(metadata.credential_configurations_supported['C'+i].credential_metadata.claims[0].path,format.includes('sd-jwt')?['name']:format==='ldp_vc'?['credentialSubject','pciClaims','name']:['credentialSubject','name']);
 assert.deepEqual(metadata.credential_configurations_supported.C1.credential_signing_alg_values_supported,['JsonWebSignature2020']);
 assert.deepEqual(metadata.credential_configurations_supported.C1.credential_definition['@context'],pciLdpContext(configurations[1].data,origin));
 const draft=pciWalletMetadata(metadata,'oid4vci-draft13');assert.ok(draft.credential_configurations_supported.C0.credential_definition.credentialSubject.name);
});
