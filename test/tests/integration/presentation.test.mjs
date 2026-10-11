import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture,alpha,beta} from '../../support/sr2-fixture.mjs';
import {extendSr2Presentation,pciPresentationRequest} from '../../../backend/sr2/presentation.js';
import {sr2HolderDid} from '../../../backend/sr2/history.js';

async function setup(profile='oid4vp-1.0'){
 const f=fixture(),{config}=await f.prepared(),p=f.principal('principal'),key=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=key.publicKey.export({format:'jwk'});
 const issuanceId=await f.offered(config,p),{credential}=await f.api.complete(p,issuanceId,'transient-access',{jwk});
 const sessions=new Map();extendSr2Presentation(f.api,{sessions});f.adapters.verifyStatus=async()=>{f.calls.push('status.verify');return {valid:true};};
 const started=await f.api.presentationStart(p,{configurationId:config.id,profile}),params=new URL(started.requestUri).searchParams;
 function reply({nonce=params.get('nonce'),aud=params.get('client_id'),exp=Math.floor(f.clock()/1000)+120,wrongKey=false,inner=credential}={}){
  const claims={iss:sr2HolderDid({jwk}),aud,nonce,iat:Math.floor(f.clock()/1000),exp,vp:{'@context':['https://www.w3.org/2018/credentials/v1'],type:['VerifiablePresentation'],verifiableCredential:[inner]}};
  const unsigned=[{alg:'ES256',typ:'JWT',kid:sr2HolderDid({jwk})+'#0'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  const token=unsigned+'.'+crypto.sign('sha256',Buffer.from(unsigned),{key:wrongKey?crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey:key.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return {state:params.get('state'),vp_token:profile==='oid4vp-1.0'?JSON.stringify({credential:[token]}):token,...(profile==='oid4vp-draft13'?{presentation_submission:JSON.stringify({id:crypto.randomUUID(),definition_id:started.requestId,descriptor_map:[{id:'credential',format:'jwt_vp',path:'$',path_nested:{format:'jwt_vc',path:'$.vp.verifiableCredential[0]'}}]})}:{})};
 }
 return {...f,p,config,started,params,reply,sessions,issuanceId,credential};
}
for(const profile of ['oid4vp-draft13','oid4vp-1.0'])test(profile+' validates a real signed holder presentation, requires confirmation and stores no presentation',async()=>{
 const f=await setup(profile),input=f.reply();
 assert.equal(f.params.get('response_mode'),profile==='oid4vp-draft13'?'post':'direct_post');
 assert.equal(f.params.has('presentation_definition'),profile==='oid4vp-draft13');assert.equal(f.params.has('dcql_query'),profile==='oid4vp-1.0');
 assert.equal((await f.api.presentationConfigurations(f.p)).items[0].id,f.config.id);
 await assert.rejects(()=>f.api.presentationRespond(beta,f.p.host,input),e=>e.status===404);
 const response=await f.api.presentationRespond(alpha,f.p.host,input),resultParams=new URLSearchParams(new URL(response.redirect_uri).hash.split('?')[1]);
 assert.equal((await f.api.presentationResult(f.p,f.started.requestId)).status,'awaiting_confirmation');
 await assert.rejects(()=>f.api.presentationResult(f.principal('admin'),f.started.requestId,resultParams.get('response_code')),e=>e.status===404);
 await assert.rejects(()=>f.api.presentationResult(f.p,f.started.requestId,'a'.repeat(43)),e=>e.status===403);
 assert.equal((await f.api.presentationResult(f.p,f.started.requestId,resultParams.get('response_code'))).verified,true);
 await assert.rejects(()=>f.api.presentationRespond(alpha,f.p.host,input),e=>e.status===404);
 assert.ok(f.calls.includes('status.verify'));assert.equal(f.sessions.size,0);
 const saved=JSON.stringify([...f.store.db.requests.values(),...f.store.db.events]);
 for(const value of [input.vp_token,f.credential,'transient-access',f.privateClaim,input.state,resultParams.get('response_code')])assert.equal(saved.includes(value),false);
});
for(const attack of [{nonce:'other'},{aud:'https://other.example/post'},{exp:1},{wrongKey:true}])test('rejects invalid presentation '+JSON.stringify(attack),async()=>{
 const f=await setup();await assert.rejects(()=>f.api.presentationRespond(alpha,f.p.host,f.reply(attack)),e=>e.status===400);assert.equal(f.calls.includes('status.verify'),false);
 assert.equal((await f.api.presentationResult(f.p,f.started.requestId)).status,'failed');
});
test('native revocation, expiry, disabled membership and descriptor confusion cannot pass',async()=>{
 const f=await setup();f.adapters.verifyStatus=async()=>{throw Object.assign(Error('revoked'),{status:400});};await assert.rejects(()=>f.api.presentationRespond(alpha,f.p.host,f.reply()));
 const expired=await setup();expired.advanceClock(300001);await assert.rejects(()=>expired.api.presentationRespond(alpha,expired.p.host,expired.reply()),e=>e.status===404);
 const disabled=await setup();disabled.store.db.members.get(alpha+':principal').enabled=false;await assert.rejects(()=>disabled.api.presentationRespond(alpha,disabled.p.host,disabled.reply()),e=>e.status===403);
 const confused=await setup('oid4vp-draft13'),input=confused.reply();const s=JSON.parse(input.presentation_submission);s.descriptor_map[0].path_nested.path='$.vp.verifiableCredential[1]';input.presentation_submission=JSON.stringify(s);await assert.rejects(()=>confused.api.presentationRespond(alpha,confused.p.host,input),e=>e.status===400);
});
test('unsupported VP formats are not advertised as implemented profiles',()=>{
 assert.throws(()=>pciPresentationRequest({profile:'oid4vp-1.0',configuration:{format:'ldp_vc'}}),/JWT W3C/);
});

test('a successful status call with a negative or missing verdict cannot validate a presentation',async()=>{
 for(const verdict of [{valid:false},{valid:'true'},{},null]){
  const f=await setup();f.adapters.verifyStatus=async()=>verdict;
  await assert.rejects(()=>f.api.presentationRespond(alpha,f.p.host,f.reply()));
  assert.equal((await f.api.presentationResult(f.p,f.started.requestId)).status,'failed');
 }
});

test('DCQL expands the standard W3C type and explicitly requires holder binding',()=>{
 const request=pciPresentationRequest({id:'request',profile:'oid4vp-1.0',responseUri:'https://pci.example/response',state:'state',nonce:'nonce',configuration:{format:'jwt_vc_json',credentialTypes:['VerifiableCredential','EmployeeCredential'],claims:[{name:'department',required:true}]}});
 assert.deepEqual(request.dcql_query.credentials[0].meta.type_values,[['https://www.w3.org/2018/credentials#VerifiableCredential','EmployeeCredential']]);
 assert.equal(request.dcql_query.credentials[0].require_cryptographic_holder_binding,true);
 assert.deepEqual(request.dcql_query.credentials[0].claims,[{path:['credentialSubject','department']}]);
});
