import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pciCompleteClaimDisplay,pciContains,pciNativeMetadata,pciPublicCatalogue,createPciNativeAdapters} from '../../../backend/sr2/native.js';
import {pciEvent} from '../../../backend/sr2/wire.js';
const captured=JSON.parse(fs.readFileSync(new URL('../../fixtures/wellknown-1.5.2-metadata.json',import.meta.url)));
const tid='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222';
const bundle={tenantId:tid,issuer:{issuer:captured.credential_issuer,authorizationServers:captured.authorization_servers,displayName:'Alpha'},configurations:[{id:cid,data:{identifier:'alpha_employee_jwt',name:'Alpha Employee Credential',description:'Synthetic employee credential for functional testing.',format:'jwt_vc_json',credentialTypes:['VerifiableCredential','EmployeeCredential'],claims:[{name:'name',type:'string',required:true}]}}]};
const configuration=m=>m.credential_configurations_supported.alpha_employee_jwt;
const expected=()=>pciNativeMetadata(bundle,()=>{throw Error('Unexpected asset');});
function adapter(reply,{wrongTenant=false}={}){
 let now=0;
 return createPciNativeAdapters({now:()=>now,nats:{publish:async()=>{},request:async(subject,event)=>{now+=10001;return pciEvent(event.type,{...event.data,...(wrongTenant?{tenant_id:'other-tenant'}:{}),Issuer:reply});}},signerUrl:'http://signer',statusUrl:'http://status',wellKnownUrl:'http://wellknown',readSecret:()=>{},lookup:()=>{},getParticipantToken:()=>{}});
}
test('captured Well-Known 1.5.2 reply is accepted and public claim labels are retained without mutation',async()=>{
 const before=JSON.stringify(captured),wanted=expected();
 assert.equal(pciContains(wanted,captured),false);
 assert.equal(pciContains(wanted,pciCompleteClaimDisplay(wanted,captured)),true);
 assert.deepEqual(await adapter(captured).publishMetadata(bundle),{published:true});
 const publicMetadata=pciPublicCatalogue(bundle,captured);
 assert.deepEqual(configuration(publicMetadata).credential_metadata.claims[0].display,[{name:'name',locale:'en'}]);
 configuration(publicMetadata).credential_metadata.claims[0].path[0]='changed';
 assert.equal(JSON.stringify(captured),before);
});
test('native provided claim labels are checked; null, empty or different labels are not completed',async()=>{
 for(const display of [null,[],[{name:'incorrect',locale:'en'}]]){
  const bad=structuredClone(captured);configuration(bad).credential_metadata.claims[0].display=display;
  assert.equal(pciContains(expected(),pciCompleteClaimDisplay(expected(),bad)),false);
  assert.throws(()=>pciPublicCatalogue(bundle,bad),{code:'PCI-METADATA-PENDING'});
  await assert.rejects(adapter(bad).publishMetadata(bundle),{code:'PCI-METADATA-READBACK'});
 }
 const correct=expected();assert.deepEqual(await adapter(correct).publishMetadata(bundle),{published:true});
});
const semanticMutations={
 'issuer':m=>{m.credential_issuer='https://wrong.example';},
 'authorization server':m=>{m.authorization_servers=['https://wrong.example'];},
 'credential endpoint':m=>{m.credential_endpoint+='wrong';},
 'nonce endpoint':m=>{m.nonce_endpoint+='wrong';},
 'format':m=>{configuration(m).format='ldp_vc';},
 'scope':m=>{configuration(m).scope='other';},
 'binding':m=>{configuration(m).cryptographic_binding_methods_supported=['did'];},
 'signing algorithms':m=>{configuration(m).credential_signing_alg_values_supported=['HS256'];},
 'proof algorithms':m=>{configuration(m).proof_types_supported.jwt.proof_signing_alg_values_supported=['HS256'];},
 'credential types':m=>{configuration(m).credential_definition.type=['VerifiableCredential'];},
 'context':m=>{configuration(m).credential_definition['@context']=['https://wrong.example'];},
 'claim path':m=>{configuration(m).credential_metadata.claims[0].path=['credentialSubject','other'];},
 'mandatory flag':m=>{configuration(m).credential_metadata.claims[0].mandatory=false;},
 'claim count':m=>{configuration(m).credential_metadata.claims=[];},
 'configuration display':m=>{configuration(m).credential_metadata.display[0].name='Other';},
 'issuer display':m=>{m.display[0].name='Other';},
 'missing configuration':m=>{m.credential_configurations_supported={};}
};
for(const [name,mutate] of Object.entries(semanticMutations))test('native readback still rejects changed '+name,async()=>{
 const bad=structuredClone(captured);mutate(bad);
 assert.equal(pciContains(expected(),pciCompleteClaimDisplay(expected(),bad)),false);
 assert.throws(()=>pciPublicCatalogue(bundle,bad),{code:'PCI-METADATA-PENDING'});
 await assert.rejects(adapter(bad).publishMetadata(bundle),{code:'PCI-METADATA-READBACK'});
});
test('publication still requires exact active configuration IDs, schema and routing topic',async()=>{
 for(const mutate of [m=>{configuration(m).schema.properties.name.type='number';},m=>{configuration(m).topic='other-topic';},m=>{m.credential_configurations_supported.foreign=structuredClone(configuration(m));}]){
  const bad=structuredClone(captured);mutate(bad);
  await assert.rejects(adapter(bad).publishMetadata(bundle),{code:'PCI-METADATA-READBACK'});
 }
});
test('completion cannot move labels across different claim paths and handles malformed claims fail closed',()=>{
 for(const claims of [null,{},[null],[{}],[{path:['other'],mandatory:true}]]){
  const bad=structuredClone(captured);configuration(bad).credential_metadata.claims=claims;
  assert.equal(pciContains(expected(),pciCompleteClaimDisplay(expected(),bad)),false);
  assert.throws(()=>pciPublicCatalogue(bundle,bad),{code:'PCI-METADATA-PENDING'});
 }
 for(const native of [null,undefined,[],false])assert.equal(pciCompleteClaimDisplay(expected(),native),native);
 const wanted=expected(),bad=structuredClone(wanted);
 wanted.credential_configurations_supported.alpha_employee_jwt.credential_metadata.claims.push({path:['credentialSubject','second'],mandatory:false,display:[{name:'Second',locale:'en'}]});
 configuration(bad).credential_metadata.claims=[{path:['credentialSubject','second'],mandatory:false},{path:['credentialSubject','name'],mandatory:true}];
 const result=pciCompleteClaimDisplay(wanted,bad);assert.equal(result.credential_configurations_supported.alpha_employee_jwt.credential_metadata.claims.some(c=>Object.hasOwn(c,'display')),false);
});
test('native reply tenant correlation remains mandatory',async()=>{
 await assert.rejects(adapter(captured,{wrongTenant:true}).publishMetadata(bundle));
});
