import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import * as url from 'node:url';
import tls from 'node:tls';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {fixture,alpha,beta} from '../../support/sr2-fixture.mjs';
import {extendSr2Issuance} from '../../../backend/sr2/issuance.js';
import {extendSr2Maintenance} from '../../../backend/sr2/maintenance.js';
import {createSr2JourneyInputs,sr2JourneyBindings,sr2JourneyValues,sr2ParticipantConfiguration} from '../../../backend/sr2/journey-input.js';
import {createPciNativeAdapters} from '../../../backend/sr2/native.js';
import {pciEvent} from '../../../backend/sr2/wire.js';

async function prepared(f,{fields=[{name:'name',label:'Full name',required:true}],claims,extraSteps=[]}={}) {
  const result=await f.prepared();
  if(claims){result.config=(await f.api.resource(f.principal(),'configuration','update',result.config.id,{data:{...result.config.draft,claims}},result.config.version)).item;result.config=await f.publish('configuration',result.config);}
  result.flow=(await f.api.resource(f.principal(),'flow','update',result.flow.id,{configurationId:result.config.id,data:{...result.flow.draft,steps:[result.flow.draft.steps[0],{id:'details',type:'input',title:'Enter your details',text:'',fields},...extraSteps,result.flow.draft.steps.at(-1)]}},result.flow.version)).item;
  result.flow=await f.publish('flow',result.flow);return result;
}
async function submit(f,config,values={name:'FACIS Synthetic Principal'}) {
  const p=f.principal('principal'),r=await f.api.start(p,config.id,crypto.randomUUID()),id=r.request.requestId;
  await f.api.advance(p,id,{step:0,consent:true});await f.api.advance(p,id,{step:1,values});return id;
}
function database(f){return JSON.stringify(f.store.db,(_,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);}
function generated() {
  const node=JSON.parse(fs.readFileSync('dist/fap-pci-flow.json')).find(n=>n.type==='function' && n.name==='M11_PCI-IssuerRuntime');
  const marker=node.func.lastIndexOf('// M11_PCI-IssuerRuntime\n');assert.ok(marker>0);
  const envs={PCI_VERIFICATION_TOKEN_PEPPER:'synthetic-pepper',PCI_DATABASE_URL:'postgres://fixture/fixture',PCI_OCM_NAMESPACE:'ocm-wstack',PCI_KEYCLOAK_INTERNAL_URL:'http://keycloak',PCI_KEYCLOAK_PUBLIC_URL:'https://identity.facis.cloud'};
  return vm.runInNewContext('(function(){'+node.func.slice(0,marker)+'\nreturn {extendSr2Issuance,createPciNativeAdapters};})()',{msg:{},crypto,url,tls,net,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,env:{get:key=>envs[key]}});
}

test('manual name reaches the signed JWT; survey answers and claims never reach SQL or recovery responses',async()=>{
  const f=fixture(),{config}=await prepared(f,{fields:[{name:'name',label:'Full name',required:true},{name:'feedback',label:'Feedback',required:false}]}),p=f.principal('principal');
  const name='FACIS Synthetic Manual Name',feedback='Discard this synthetic survey answer';
  const id=await submit(f,config,{name,feedback});
  assert.equal(JSON.stringify(await f.api.request(p,id)).includes(name),false);
  await f.api.offer(p,id);const result=await f.api.complete(p,id,'synthetic-token',null);
  assert.deepEqual(JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject,{id:p.subject,name});
  assert.deepEqual(f.calls,['offer','identity','notify','data','status','sign','verify']);
  for(const value of [name,feedback,'synthetic-token',result.credential])assert.equal(database(f).includes(value),false);
  await assert.rejects(f.api.complete(p,id,'synthetic-token',null),{status:409});
});

test('only the pinned issuer mapping overrides participant data; other required claims remain participant-owned',async()=>{
  const f=fixture(),claims=[{name:'name',type:'string',required:true},{name:'department',type:'string',required:true}],{config}=await prepared(f,{claims});
  let transmitted;
  f.adapters.getParticipantData=async t=>{transmitted=t;assert.equal(t.participantConfiguration.claims.find(c=>c.name==='name').required,false);assert.equal(t.participantConfiguration.claims.find(c=>c.name==='department').required,true);return {requestId:t.r.id,unsignedData:{subject:t.principal.subject,claims:{department:'FACIS Testing'}}};};
  const id=await submit(f,config);await f.api.offer(f.principal('principal'),id);
  const result=await f.api.complete(f.principal('principal'),id,'synthetic-token',null),subject=JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject;
  assert.deepEqual(subject,{id:'principal',department:'FACIS Testing',name:'FACIS Synthetic Principal'});
  assert.equal(transmitted.journeyClaims,undefined);assert.equal(transmitted.data,undefined);
  assert.equal(config.draft.claims.find(c=>c.name==='name').required,true);
});

test('missing, oversized, unknown and invalid typed form values fail without advancing',async()=>{
  const f=fixture(),{config}=await prepared(f,{claims:[{name:'name',type:'string',required:true},{name:'age',type:'number',required:true},{name:'accepted',type:'boolean',required:true}],fields:[{name:'name',label:'Full name',required:true},{name:'age',label:'Age',required:true},{name:'accepted',label:'Accepted',required:true}]}),p=f.principal('principal');
  const r=await f.api.start(p,config.id,crypto.randomUUID()),id=r.request.requestId;await f.api.advance(p,id,{step:0,consent:true});
  for(const values of [{},{name:' '},{name:'x'.repeat(2001)},{name:'FACIS',age:'NaN',accepted:'true'},{name:'FACIS',age:'1e999',accepted:'true'},{name:'FACIS',age:'0x10',accepted:'true'},{name:'FACIS',age:'42',accepted:'yes'},{name:'FACIS',age:'42',accepted:'true',iss:'forged'}]){
    await assert.rejects(f.api.advance(p,id,{step:1,values}),{status:400});assert.equal((await f.api.request(p,id)).request.step,1);
  }
  await f.api.advance(p,id,{step:1,values:{name:' FACIS Synthetic Principal ',age:'42',accepted:'false'}});
  f.adapters.getParticipantData=async t=>({requestId:t.r.id,unsignedData:{subject:t.principal.subject,claims:{}}});
  await f.api.offer(p,id);const result=await f.api.complete(p,id,'synthetic-token',null);
  assert.deepEqual(JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject,{id:p.subject,name:'FACIS Synthetic Principal',age:42,accepted:false});
});

test('optional omitted manual claims do not fall back to participant values',async()=>{
  const f=fixture(),{config}=await prepared(f,{claims:[{name:'name',type:'string',required:false}],fields:[{name:'name',label:'Name',required:false}]}),p=f.principal('principal'),id=await submit(f,config,{});
  await f.api.offer(p,id);const result=await f.api.complete(p,id,'synthetic-token',null);
  assert.deepEqual(JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject,{id:p.subject});
});

test('multiple mapped input steps accumulate typed claims and recover in order after loss',async()=>{
  const f=fixture(),{config}=await prepared(f,{claims:[{name:'name',type:'string',required:true},{name:'age',type:'number',required:true}],extraSteps:[{id:'age',type:'input',title:'Age',text:'',fields:[{name:'age',label:'Age',required:true}]}]}),p=f.principal('principal'),id=await submit(f,config);
  await f.api.advance(p,id,{step:2,values:{age:'42'}});f.api.clearJourneyInputs();assert.equal((await f.api.request(p,id)).request.step,1);
  await f.api.advance(p,id,{step:1,values:{name:'FACIS Re-entered'}});assert.equal((await f.api.request(p,id)).request.step,2);await assert.rejects(f.api.advance(p,id,{step:2,values:{}}),{status:400});await f.api.advance(p,id,{step:2,values:{age:'43'}});
  f.adapters.getParticipantData=async t=>({requestId:t.r.id,unsignedData:{subject:t.principal.subject,claims:{}}});await f.api.offer(p,id);const result=await f.api.complete(p,id,'synthetic-token',null);
  assert.deepEqual(JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject,{id:p.subject,name:'FACIS Re-entered',age:43});
});

test('another member, tenant and request cannot read or replay a submitted name',async()=>{
  const f=fixture(),{config}=await prepared(f),p=f.principal('principal'),first=await submit(f,config,{name:'FACIS First'}),second=await submit(f,config,{name:'FACIS Second'});
  await assert.rejects(f.api.advance(f.principal('admin'),first,{step:1,values:{name:'forged'}}),{status:404});
  await assert.rejects(f.api.request(f.principal('principal',beta),first),{status:404});
  await assert.rejects(f.api.advance(p,first,{step:1,values:{name:'forged'}}),{status:400});
  for(const [id,name] of [[first,'FACIS First'],[second,'FACIS Second']]){await f.api.offer(p,id);const result=await f.api.complete(p,id,'synthetic-token',null);assert.equal(JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject.name,name);}
});

test('pinned input mappings survive later draft and published journey changes',async()=>{
  const f=fixture(),{config,flow}=await prepared(f),p=f.principal('principal'),id=await submit(f,config);
  const draft=(await f.api.resource(f.principal(),'flow','update',flow.id,{configurationId:config.id,data:{...flow.draft,steps:[flow.draft.steps[0],flow.draft.steps.at(-1)]}},flow.version)).item;await f.publish('flow',draft);
  assert.equal((await f.api.request(p,id)).flow.steps.length,3);await f.api.offer(p,id);const result=await f.api.complete(p,id,'synthetic-token',null);
  assert.equal(JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject.name,'FACIS Synthetic Principal');
});

test('restart before offer rewinds to the lost input and requires re-entry; prior consent cannot be bypassed',async()=>{
  const f=fixture(),{config}=await prepared(f),p=f.principal('principal'),id=await submit(f,config);
  extendSr2Issuance(f.api);
  await assert.rejects(f.api.offer(p,id),{status:409,code:'PCI-SR2-INPUT-LOST'});assert.equal(f.calls.length,0);
  const restored=await f.api.request(p,id);assert.equal(restored.request.step,1);assert.equal(restored.request.errorCode,'PCI-SR2-INPUT-LOST');
  await assert.rejects(f.api.advance(p,id,{step:1,values:{}}),{status:400});
  await f.api.advance(p,id,{step:1,values:{name:'FACIS Re-entered'}});assert.equal((await f.api.request(p,id)).request.errorCode,null);
  await f.api.offer(p,id);const result=await f.api.complete(p,id,'synthetic-token',null);assert.equal(JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject.name,'FACIS Re-entered');
});

test('restart after offer fails closed before participant or signing calls and requires a fresh request',async()=>{
  const f=fixture(),{config}=await prepared(f),p=f.principal('principal'),id=await submit(f,config);await f.api.offer(p,id);extendSr2Issuance(f.api);
  await assert.rejects(f.api.complete(p,id,'synthetic-token',null),{status:409,code:'PCI-SR2-INPUT-LOST'});
  assert.deepEqual(f.calls,['offer']);const restored=await f.api.request(p,id);assert.equal(restored.request.state,'offered');assert.equal(restored.request.errorCode,'PCI-SR2-INPUT-LOST');
});

test('expired forms, suspended tenants and revoked memberships cannot issue',async()=>{
  for(const change of ['expiry','suspension','membership']){
    const f=fixture(),{config}=await prepared(f),p=f.principal('principal'),id=await submit(f,config);await f.api.offer(p,id);
    if(change==='expiry'){f.advanceClock(600001);extendSr2Maintenance(f.api);await f.api.maintenance(alpha);}
    if(change==='suspension')await f.api.lifecycle(f.principal(),'suspended','alpha');
    if(change==='membership')f.store.db.members.get(alpha+':principal').enabled=false;
    await assert.rejects(f.api.complete(p,id,'synthetic-token',null));assert.deepEqual(f.calls.filter(c=>c!=='publish'),['offer']);assert.equal(database(f).includes('FACIS Synthetic Principal'),false);
  }
});

test('failed participant responses cannot bypass subject, schema or required participant claims',async()=>{
  for(const unsignedData of [{subject:'different',claims:{}},{subject:'principal',claims:{undeclared:'forged'}},{subject:'principal',claims:{}}]){
    const f=fixture(),{config}=await prepared(f,{claims:[{name:'name',type:'string',required:true},{name:'department',type:'string',required:true}]}),p=f.principal('principal'),id=await submit(f,config);
    f.adapters.getParticipantData=async t=>({requestId:t.r.id,unsignedData});await f.api.offer(p,id);
    await assert.rejects(f.api.complete(p,id,'synthetic-token',null),{status:400});assert.equal(f.calls.includes('sign'),false);assert.equal((await f.api.request(p,id)).request.state,'indeterminate');assert.equal(database(f).includes('FACIS Synthetic Principal'),false);
  }
});

test('ambiguous mappings and participant-signed manual claims are rejected while unrelated survey fields remain allowed',()=>{
  const configuration={signingMode:'internal-signing',claims:[{name:'name',type:'string',required:true}]},input={type:'input',fields:[{name:'name',label:'Name',required:true}]};
  assert.throws(()=>sr2JourneyBindings(configuration,{steps:[input,input]}),/only one/);
  assert.throws(()=>sr2JourneyBindings(configuration,{steps:[{...input,fields:[{...input.fields[0],required:false}]}]}),/required journey field/);
  assert.throws(()=>sr2JourneyBindings({...configuration,signingMode:'participant-signed'},{steps:[input]}),/internal signing/);
  assert.deepEqual(sr2JourneyBindings({...configuration,signingMode:'participant-signed'},{steps:[{type:'input',fields:[{name:'survey',required:true}]}]}),[]);
  assert.deepEqual(sr2JourneyValues({fields:[{name:'flag',label:'Flag',required:true,type:'boolean'}]},{flag:'true'}),{flag:true});
});

test('flow save/publish rejects an unsupported participant-signed manual mapping',async()=>{
  const f=fixture(),{config,flow}=await f.prepared('Employee','participant-signed');
  await assert.rejects(f.api.resource(f.principal(),'flow','update',flow.id,{configurationId:config.id,data:{...flow.draft,steps:[flow.draft.steps[0],{id:'input',type:'input',title:'Name',text:'',fields:[{name:'name',label:'Full name',required:true}]},flow.draft.steps.at(-1)]}},flow.version),/internal signing/);
});

test('bounded cache is tied to all request bindings, expires, cleans tenant state and can undo a failed transaction',()=>{
  let now=1;const cache=createSr2JourneyInputs(()=>now,{maxRequests:2,maxBytes:2000}),r={tenantId:alpha,id:crypto.randomUUID(),subjectHash:'hash',configurationId:crypto.randomUUID(),configurationVersion:2,flowId:crypto.randomUUID(),flowVersion:2,connectorId:crypto.randomUUID(),connectorVersion:2,metadataVersion:2,expiresAt:10,step:2};
  const bindings=[{step:1,fields:[{name:'name'}]}],undo=cache.put(r,1,{name:'FACIS RAM only'});assert.deepEqual(cache.read(r,bindings),{name:'FACIS RAM only'});
  for(const field of ['subjectHash','configurationId','configurationVersion','flowId','flowVersion','connectorId','connectorVersion','metadataVersion'])assert.throws(()=>cache.read({...r,[field]:String(r[field])+'changed'},bindings),{code:'PCI-SR2-INPUT-LOST'});
  undo();assert.throws(()=>cache.read(r,bindings),{code:'PCI-SR2-INPUT-LOST'});
  cache.put(r,1,{name:'FACIS First'});const rollback=cache.put(r,1,{name:'FACIS Changed'});rollback();assert.equal(cache.read(r,bindings).name,'FACIS First');
  const other={...r,tenantId:beta};cache.put(other,1,{name:'FACIS Second'});assert.throws(()=>cache.put({...r,id:crypto.randomUUID()},1,{name:'third'}),{status:429});
  assert.throws(()=>cache.put(r,1,{name:'x'.repeat(2000)}),{status:429});assert.equal(cache.read(r,bindings).name,'FACIS First');
  cache.clearTenant(alpha);assert.throws(()=>cache.read(r,bindings),{code:'PCI-SR2-INPUT-LOST'});assert.equal(cache.read(other,bindings).name,'FACIS Second');
  now=10;cache.prune();assert.throws(()=>cache.read(other,bindings),{code:'PCI-SR2-INPUT-LOST'});cache.put({...r,expiresAt:20},1,{name:'FACIS Fresh'});cache.drop({...r,expiresAt:20});assert.throws(()=>cache.read({...r,expiresAt:20},bindings));
});

test('a SQL rollback removes the corresponding transient input write',async()=>{
  const f=fixture(),{config}=await prepared(f),p=f.principal('principal'),r=await f.api.start(p,config.id,crypto.randomUUID());await f.api.advance(p,r.request.requestId,{step:0,consent:true});
  const transaction=f.store.transaction.bind(f.store);let fail=true;
  f.store.transaction=(tenantId,fn)=>transaction(tenantId,async tx=>{const result=await fn(tx);if(fail){fail=false;throw Error('synthetic commit failure');}return result;});
  await assert.rejects(f.api.advance(p,r.request.requestId,{step:1,values:{name:'FACIS Rolled Back'}}),/commit failure/);
  await transaction(alpha,async tx=>{const request=await tx.request(r.request.requestId);assert.equal(request.step,1);request.step=2;await tx.saveRequest(request);});
  assert.equal((await f.api.request(p,r.request.requestId)).request.step,1);assert.equal(database(f).includes('FACIS Rolled Back'),false);
});

test('runtime shutdown explicitly clears the service cache before closing its native connection',async()=>{
  const f=fixture(),{config}=await prepared(f),p=f.principal('principal'),id=await submit(f,config),nodes=JSON.parse(fs.readFileSync('dist/fap-pci-flow.json'));
  const finalize=nodes.find(n=>n.type==='function' && n.name==='M11_PCI-IssuerRuntime').finalize;
  class Pool {}let closed=false;const pool={pciNative:{service:f.api,nats:{close(){closed=true;}}}};
  Pool[Symbol.for('xfsc.fap-pci.process-state.v1')]=new Map([['test',{poolHolder:{pool}}]]);
  vm.runInNewContext(finalize,{pg:{Pool}});assert.equal(closed,true);assert.equal(pool.pciNative,undefined);
  assert.equal((await f.api.request(p,id)).request.step,1);
});

// Sign/verify use the real native adapters with ephemeral cryptographic keys.
// The transport doubles model the pinned OCM contract; these are offline checks.
for(const [name,api] of [['ES module',{extendSr2Issuance,createPciNativeAdapters}],['generated ORCE Function',generated()]]){
  test(name+' checks linked-data manual claim values after the native proof verdict',async()=>{
    const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),key=pair.publicKey.export({format:'jwk'}),origin='https://tenant.facis.cloud',t={r:{tenantId:alpha,id:crypto.randomUUID()},principal:{subject:'synthetic-principal'},metadata:{issuer:origin,did:'did:web:tenant.facis.cloud'},configuration:{format:'ldp_vc',keyRef:'issuer',credentialTypes:['VerifiableCredential','EmployeeCredential'],claims:[{name:'name',type:'string',required:true}]},data:{claims:{name:'FACIS Manual LDP Name'}},status:{entry:{id:origin+'/status#1',type:'StatusList2021Entry',statusListIndex:'1',statusListCredential:origin+'/status'}},holderBinding:{jwk:key},deadline:Date.now()+10000};
    const native=api.createPciNativeAdapters({signerUrl:'http://signer',http:async(address,options)=>{
      if(address.includes('/v1/jwk/'))return {status:200,data:[{...key,kid:'issuer',alg:'ES256'}]};
      if(address.endsWith('/v1/credential/proof'))return {status:200,data:{...options.body.credential,proof:{type:'JsonWebSignature2020',challenge:options.body.nonce}}};
      assert.ok(address.endsWith('/v1/credential/verify'));return {status:200,data:{valid:true}};
    }});
    const credential=await native.sign(t);assert.ok((await native.verifySigned({...t,credential})).credentialId);
    const changed=JSON.parse(credential);changed.credentialSubject.pciClaims.name='FACIS Substituted';await assert.rejects(native.verifySigned({...t,credential:JSON.stringify(changed)}),/Signed claim values differ/);
  });
  for(const format of ['jwt_vc_json','dc+sd-jwt'])test(name+' signs the entered claim and rejects a validly signed substituted value in '+format,async()=>{
    const f=fixture();api.extendSr2Issuance(f.api);let {config}=await prepared(f);
    if(format!=='jwt_vc_json'){config=(await f.api.resource(f.principal(),'configuration','update',config.id,{data:{...config.draft,format,vct:'https://pci.facis.cloud/employee'}},config.version)).item;config=await f.publish('configuration',config);}
    const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=pair.publicKey.export({format:'jwk'});let substitute=false;
    const native=api.createPciNativeAdapters({cryptoNamespace:'ocm-wstack',now:f.clock,signerUrl:'http://signer',http:async()=>({status:200,data:[{...publicKey,kid:'tenant-key',alg:'ES256'}]}),nats:{request:async(topic,event)=>{
      const payload=JSON.parse(Buffer.from(event.data.payload,'base64'));if(substitute && format==='jwt_vc_json')payload.vc.credentialSubject.name='FACIS Substituted';
      const head={...JSON.parse(Buffer.from(event.data.header,'base64')),alg:'ES256'},body=[head,payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
      return pciEvent(event.type,{...event.data,token:Buffer.from(body+'.'+crypto.sign('sha256',Buffer.from(body),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')).toString('base64')});
    }}});
    f.adapters.sign=async t=>{if(substitute && format.includes('sd-jwt'))return native.sign({...t,data:{...t.data,claims:{name:'FACIS Substituted'}}});return native.sign(t);};f.adapters.verifySigned=t=>native.verifySigned(t);
    f.adapters.allocateStatus=async t=>{const idx=parseInt(t.r.id.replaceAll('-','').slice(0,12),16);return {tenantId:t.r.tenantId,configurationId:t.r.configurationId,requestId:t.r.id,handle:t.r.id,entry:format.includes('sd-jwt')?{status_list:{idx,uri:'https://'+t.principal.host+'/status'}}:{id:'https://'+t.principal.host+'/status#'+idx,type:'StatusList2021Entry',statusListIndex:String(idx),statusListCredential:'https://'+t.principal.host+'/status'}};};
    for(const altered of [false,true]){substitute=altered;const id=await submit(f,config,{name:'FACIS Manually Entered'});await f.api.offer(f.principal('principal'),id);
      if(altered){await assert.rejects(f.api.complete(f.principal('principal'),id,'synthetic-token',null),/Signed claim values differ/);assert.equal((await f.api.request(f.principal('principal'),id)).request.state,'indeterminate');}
      else {const result=await f.api.complete(f.principal('principal'),id,'synthetic-token',null);const value=format==='jwt_vc_json'?JSON.parse(Buffer.from(result.credential.split('.')[1],'base64url')).vc.credentialSubject.name:JSON.parse(Buffer.from(result.credential.split('~')[1],'base64url'))[2];assert.equal(value,'FACIS Manually Entered');}
    }
    assert.equal(database(f).includes('FACIS Manually Entered'),false);
  });

  test(name+' uses the same participant configuration in both calls, with no raw form answers on the wire',async()=>{
    const f=fixture(),{config,connector,flow}=await prepared(f),p=f.principal('principal'),id=await submit(f,config),key=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'pem',type:'pkcs8'});
    const certificate=spawnSync('bash',['-c','cat | openssl req -new -x509 -key /dev/stdin -subj /CN=participant.facis.cloud -addext subjectAltName=DNS:participant.facis.cloud -days 2'],{input:key});assert.equal(certificate.status,0);
    const tenant=f.store.db.tenants.get(alpha),calls=[];
    const native=api.createPciNativeAdapters({namespace:'pci',readSecret:async name=>({metadata:{namespace:'pci',labels:{'xfsc.org/pci-tenant-id':alpha,'xfsc.org/pci-owner-uid':tenant.owner_uid}},data:name===connector.draft.tlsSecret.name?{'tls.crt':certificate.stdout.toString('base64'),'tls.key':Buffer.from(key).toString('base64')}:{'ca.crt':certificate.stdout.toString('base64')}}),lookup:async()=>[{address:'203.0.113.1',family:4}],grpc:async(c,t,a,method,body)=>{calls.push({method,body});return {};}});
    const t={r:{...(await f.store.transaction(alpha,tx=>tx.request(id)))},principal:p,tenant,connector:{...connector.draft,endpoint:'https://participant.facis.cloud/grpc',serverName:'participant.facis.cloud'},configuration:config.draft,participantConfiguration:sr2ParticipantConfiguration(config.draft,sr2JourneyBindings(config.draft,flow.draft)),metadata:{did:'did:web:tenant.facis.cloud',issuer:'https://tenant.facis.cloud'},participantJwt:'synthetic-token',holderBinding:{jwk:{}},deadline:Date.now()+10000,journeyClaims:{name:'FACIS Manually Entered'}};
    await native.notifyParticipant(t);await native.getParticipantData(t);
    assert.equal(calls.length,2);assert.equal(JSON.stringify(calls).includes('FACIS Manually Entered'),false);assert.equal(calls[0].body.configuration.claims[0].required,false);assert.equal(JSON.stringify(calls[0].body.configuration),JSON.stringify(calls[1].body.configuration));assert.equal(config.draft.claims[0].required,true);
  });
}
