import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import * as url from 'node:url';
import {createPciNativeAdapters,pciNativeSigningKey} from '../../../backend/sr2/native.js';
import {sr2VerifyCredential} from '../../../backend/sr2/adapters.js';
import {pciEvent} from '../../../backend/sr2/wire.js';

const tid='11111111-1111-4111-8111-111111111111',rid=crypto.randomUUID();
const origin='https://alpha-pci.example.com/pci-orce',did='did:web:alpha-pci.example.com';
function generated(){
 const n=JSON.parse(fs.readFileSync('dist/fap-pci-flow.json','utf8')).find(n=>n.name==='M11_PCI-IssuerRuntime'&&n.type==='function');
 const marker=n.func.lastIndexOf('// M11_PCI-IssuerRuntime\n');assert.ok(marker>0);
 const values={PCI_VERIFICATION_TOKEN_PEPPER:'synthetic-pepper',PCI_DATABASE_URL:'postgres://fixture/fixture',PCI_OCM_NAMESPACE:'ocm-wstack',PCI_KEYCLOAK_INTERNAL_URL:'http://keycloak',PCI_KEYCLOAK_PUBLIC_URL:'https://keycloak.example.com'};
 const context=vm.createContext({msg:{},url,crypto,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,env:{get:key=>values[key]}});
 assert.equal(vm.runInContext('typeof structuredClone',context),'undefined');
 return vm.runInContext('(function(){'+n.func.slice(0,marker)+'\nreturn {createPciNativeAdapters,pciNativeSigningKey};})()',context);
}
function setup(api,{format='jwt_vc_json',algorithm='ES256',shape='array',response}={}){
 const pair=algorithm==='ES256'?crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}):crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const publicKey=pair.publicKey.export({format:'jwk'}),now=Date.now(),calls=[];
 const t={r:{tenantId:tid,id:rid},principal:{subject:'synthetic'},metadata:{issuer:origin,did},configuration:{format,keyRef:'issuer',credentialTypes:['VerifiableCredential','EmployeeCredential'],vct:origin+'/employee',claims:[{name:'name',type:'string',required:true}]},data:{claims:{name:'Synthetic'}},holderBinding:{jwk:publicKey},status:{entry:format.includes('sd-jwt')?{status_list:{idx:1,uri:origin+'/status/1'}}:{id:origin+'/status/1#1',type:'StatusList2021Entry',statusPurpose:'revocation',statusListIndex:'1',statusListCredential:origin+'/status/1'}},deadline:now+10000};
 // Exact Crypto Core 2.3.0 wire shape: []jwk.Key; RSA has two alg variants.
 const variants=algorithm==='ES256'?[{...publicKey,kid:'issuer',alg:'ES256'}]:['RS256','PS256'].map(alg=>({...publicKey,kid:'issuer',alg}));
 const data=shape==='array'?variants:shape==='jwks'?{keys:variants}:{...publicKey,kid:'issuer',alg:algorithm};
 const adapter=api.createPciNativeAdapters({cryptoNamespace:'ocm-wstack',now:()=>now,signerUrl:'http://signer.ocm-wstack:8080',nats:{request:async(topic,e)=>{
  assert.equal(topic,'signer-topic');assert.equal(e.type,'signer.signToken');
  assert.equal(e.data.namespace,'ocm-wstack');assert.equal(e.data.group,tid);assert.equal(e.data.key,'issuer');
  const header={...JSON.parse(Buffer.from(e.data.header,'base64')),alg:algorithm};
  const unsigned=Buffer.from(JSON.stringify(header)).toString('base64url')+'.'+Buffer.from(e.data.payload,'base64').toString('base64url');
  const token=unsigned+'.'+crypto.sign('sha256',Buffer.from(unsigned),{key:pair.privateKey,...(algorithm==='ES256'?{dsaEncoding:'ieee-p1363'}:{}),...(algorithm==='PS256'?{padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32}:{})}).toString('base64url');
  return pciEvent(e.type,{...e.data,token:Buffer.from(token).toString('base64')});
 }},http:async(address,options)=>{
  calls.push({address,options});assert.equal(address,'http://signer.ocm-wstack:8080/v1/jwk/ocm-wstack/issuer');
  assert.equal(options.method,'GET');assert.equal(options.body.group,tid);assert.equal(options.body.engine,'transit');
  return {status:200,data:response?response(data):data};
 }});
 return {t,adapter,calls,data,publicKey,now};
}
for(const [name,api]of [['ES module',{createPciNativeAdapters,pciNativeSigningKey}],['generated Function node',generated()]]){
 for(const format of ['jwt_vc_json','vc+sd-jwt','dc+sd-jwt'])test(name+' verifies '+format+' with native JWK array',async()=>{
  const f=setup(api,{format}),before=JSON.stringify(f.data),credential=await f.adapter.sign(f.t);
  assert.ok((await f.adapter.verifySigned({...f.t,credential})).credentialId.startsWith('urn:uuid:'));
  assert.equal(JSON.stringify(f.data),before);assert.ok(f.calls.length>=1);
  const parts=credential.split('.');const claims=JSON.parse(Buffer.from(parts[1],'base64url'));claims.sub='changed';parts[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
  await assert.rejects(f.adapter.verifySigned({...f.t,credential:parts.join('.')}),/Signature verification failed/);
  await assert.rejects(f.adapter.verifySigned({...f.t,credential,holderBinding:{jwk:{}}}));
  if(format==='jwt_vc_json')assert.throws(()=>sr2VerifyCredential(credential,f.t.configuration,{issuer:did,subject:f.t.principal.subject,kid:did+'#issuer',status:f.t.status.entry,holderBinding:f.t.holderBinding},{keys:[{...f.data,kid:did+'#issuer'}]},f.now),/Algorithm\/key mismatch/);
 });
 for(const algorithm of ['RS256','PS256'])test(name+' selects '+algorithm+' from both native RSA algorithm entries',async()=>{
  const f=setup(api,{algorithm}),credential=await f.adapter.sign(f.t);
  assert.ok((await f.adapter.verifySigned({...f.t,credential})).credentialId);
  f.data.reverse();assert.ok((await f.adapter.verifySigned({...f.t,credential})).credentialId);
 });
 for(const shape of ['bare','jwks'])test(name+' retains '+shape+' key response compatibility',async()=>{
  const f=setup(api,{shape}),credential=await f.adapter.sign(f.t);await f.adapter.verifySigned({...f.t,credential});
 });
 test(name+' rejects malformed, private, foreign, ambiguous and incompatible keys',()=>{
  const key={...crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'}),kid:'issuer',alg:'ES256'};
  for(const data of [null,[],[null],[[key]],{},'bad-json',{keys:[]},[key,key],[{...key,kid:'other'}],[{...key,kid:'did:web:other#issuer'}],[{...key,alg:'ES384'}],[{...key,crv:'P-384'}],[{...key,use:'enc'}],[{...key,key_ops:['sign']}],[{...key,x:'bad'}],...['d','p','q','dp','dq','qi','oth','k'].map(field=>[{...key,[field]:'private'}])]){
   assert.throws(()=>api.pciNativeSigningKey(data,{key:'issuer',did,algorithm:'ES256'}),{code:'PCI-SIGNER-JWK-INVALID'});
  }
  for(const data of [[key],JSON.stringify([key]),[{...key,kid:did+'#issuer'}]])assert.equal(api.pciNativeSigningKey(data,{key:'issuer',did,algorithm:'ES256'}).kty,'EC');
 });
}
