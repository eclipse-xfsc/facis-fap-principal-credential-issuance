import crypto from 'node:crypto';
import {sr2Assert,sr2Fail,sr2Object,sr2Uuid,sr2Text,sr2Hash} from './domain.js';
import {sr2HolderDid} from './history.js';
import {sr2Deadline} from './adapters.js';

function pciPresentationJwt(value){
 sr2Assert(typeof value==='string'&&value.length<=131072,'A compact JWT presentation is required.');
 const parts=value.split('.');sr2Assert(parts.length===3&&parts.every(x=>/^[A-Za-z0-9_-]+$/.test(x)),'Malformed presentation JWT.');
 try{return {parts,header:JSON.parse(Buffer.from(parts[0],'base64url')),claims:JSON.parse(Buffer.from(parts[1],'base64url'))};}catch{sr2Fail(400,'PCI-VP-MALFORMED','Malformed presentation JWT.');}
}
export function pciPresentationRequest({id,profile,configuration,responseUri,state,nonce}){
 sr2Assert(['oid4vp-draft13','oid4vp-1.0'].includes(profile),'Choose an OpenID4VP profile.');
 sr2Assert(configuration.format==='jwt_vc_json','This presentation profile accepts holder-bound JWT W3C credentials.');
 const modern=profile==='oid4vp-1.0',clientId=(modern?'redirect_uri:':'')+responseUri,alg=['ES256','PS256','RS256'];
 const request={response_type:'vp_token',client_id:clientId,response_mode:modern?'direct_post':'post',nonce,state};
 if(modern){
  request.response_uri=responseUri;
  const claims=configuration.claims.filter(c=>c.required).map(c=>({path:['credentialSubject',c.name]}));
  // DCQL compares expanded JSON-LD type IRIs. The standard VC context maps
  // VerifiableCredential; custom types with no context definition stay relative.
  const types=configuration.credentialTypes.map(type=>type==='VerifiableCredential'?'https://www.w3.org/2018/credentials#VerifiableCredential':type);
  request.dcql_query={credentials:[{id:'credential',format:'jwt_vc_json',require_cryptographic_holder_binding:true,meta:{type_values:[types]},...(claims.length?{claims}:{})}]};
  request.client_metadata={client_name:'PCI credential verification',vp_formats_supported:{jwt_vc_json:{alg_values:alg}}};
 }else{
  request.redirect_uri=responseUri;
  request.client_metadata={client_name:'PCI credential verification',vp_formats:{jwt_vp:{alg},jwt_vc:{alg}}};
  request.presentation_definition={id,input_descriptors:[{id:'credential',format:{jwt_vp:{alg},jwt_vc:{alg}},constraints:{fields:configuration.credentialTypes.filter(t=>t!=='VerifiableCredential').map(type=>({path:['$.vc.type'],filter:{type:'array',contains:{const:type}}}))}}]};
 }
 return request;
}
export function pciPresentationToken(input,entry){
 sr2Object(input,['state','vp_token','presentation_submission','error','error_description','error_uri']);
 sr2Assert(input.state===entry.state,'Presentation state does not match.');
 if(input.error){sr2Assert(typeof input.error==='string'&&input.error.length<100,'Invalid wallet error.');sr2Fail(400,'PCI-VP-WALLET-DECLINED','The wallet did not provide a presentation. Start again when ready.');}
 let token=input.vp_token;
 if(entry.profile==='oid4vp-1.0'){
  sr2Assert(!input.presentation_submission,'Use a DCQL response for OpenID4VP 1.0.');
  try{token=JSON.parse(token);}catch{sr2Fail(400,'PCI-VP-MALFORMED','The wallet must return a DCQL JSON response.');}
  sr2Object(token,['credential']);sr2Assert(Array.isArray(token.credential)&&token.credential.length===1,'Exactly one matching presentation is required.');token=token.credential[0];
 }else{
  let submission;try{submission=JSON.parse(input.presentation_submission);}catch{sr2Fail(400,'PCI-VP-MALFORMED','The wallet must return a presentation submission.');}
  sr2Object(submission,['id','definition_id','descriptor_map']);sr2Text(submission.id,200);
  sr2Assert(submission.definition_id===entry.id&&submission.descriptor_map?.length===1,'Presentation definition does not match.');
  const d=submission.descriptor_map[0];sr2Object(d,['id','format','path','path_nested']);const n=sr2Object(d.path_nested,['id','format','path']);
  sr2Assert(d.id==='credential'&&['jwt_vp','jwt_vp_json'].includes(d.format)&&d.path==='$'&&['jwt_vc','jwt_vc_json'].includes(n.format)&&n.path==='$.vp.verifiableCredential[0]','Unexpected credential descriptor.');
 }
 const decoded=pciPresentationJwt(token),vp=decoded.claims?.vp;
 sr2Assert(vp&&Array.isArray(vp.type)&&vp.type.includes('VerifiablePresentation')&&Array.isArray(vp.verifiableCredential)&&vp.verifiableCredential.length===1,'Exactly one W3C credential is required.');
 const credential=vp.verifiableCredential[0],vc=pciPresentationJwt(credential).claims;
 sr2Assert(vc.cnf?.jwk && !vc.cnf.jwk.d && !vc.cnf.jwk.k,'The credential must bind a public holder key.');
 sr2Object(decoded.header,['alg','typ','kid','jwk']);
 sr2Assert(['ES256','PS256','RS256'].includes(decoded.header.alg)&&(!decoded.header.typ||['JWT','vp+jwt'].includes(decoded.header.typ)),'Unsupported presentation signature.');
 let publicKey;try{publicKey=crypto.createPublicKey({key:vc.cnf.jwk,format:'jwk'});}catch{sr2Fail(400,'PCI-VP-HOLDER-KEY','The holder public key is invalid.');}
 const jwk=publicKey.export({format:'jwk'}),alg=decoded.header.alg;
 sr2Assert(alg==='ES256'?jwk.kty==='EC'&&jwk.crv==='P-256':jwk.kty==='RSA'&&publicKey.asymmetricKeyDetails.modulusLength>=2048,'Presentation key and algorithm differ.');
 if(decoded.header.jwk)sr2Assert(sr2HolderDid({jwk:decoded.header.jwk})===sr2HolderDid({jwk}),'Presentation header key differs from credential binding.');
 sr2Assert(crypto.verify('sha256',Buffer.from(decoded.parts[0]+'.'+decoded.parts[1]),{key:publicKey,...(alg==='ES256'?{dsaEncoding:'ieee-p1363'}:{}),...(alg==='PS256'?{padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32}:{})},Buffer.from(decoded.parts[2],'base64url')),'Presentation holder signature is invalid.');
 const c=decoded.claims,now=Math.floor(entry.now/1000);
 sr2Assert(typeof c.iss==='string'&&c.iss.startsWith('did:')&&c.nonce===entry.nonce&&c.aud===entry.clientId,'Presentation nonce or audience does not match.');
 sr2Assert(Number.isSafeInteger(c.iat)&&now-c.iat<=300&&c.iat<=now+30&&Number.isSafeInteger(c.exp)&&c.exp>now&&c.exp>c.iat&&c.exp-c.iat<=300&&(!Object.hasOwn(c,'nbf')||Number.isSafeInteger(c.nbf)&&c.nbf<=now),'Presentation lifetime is invalid.');
 const credentialId=vc.jti||vc.vc?.id;sr2Text(credentialId,1024);
 return {credential,credentialId,holderBinding:{jwk},holderDid:sr2HolderDid({jwk})};
}

// Sessions and response codes are volatile; no VP, credential or returned claims
// are persisted, logged, or broadcast over uibuilder.
export function extendSr2Presentation(api,{sessions=new Map()}={}){
 const {store,now,authorize,get,hashSubject,adapters}=api;
 const prune=()=>{for(const [id,s]of sessions)if(s.expiresAt<=now())sessions.delete(id);};
 const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
 async function owner(p,id){prune();const s=sessions.get(sr2Uuid(id));if(!s||s.tenantId!==p.tenantId||s.subjectHash!==hashSubject(p.tenantId,p.subject))sr2Fail(404,'PCI-SR2-NOT-FOUND');await store.transaction(p.tenantId,tx=>authorize(tx,p,'principal'));return s;}
 api.presentationConfigurations=async p=>store.transaction(p.tenantId,async tx=>{await authorize(tx,p,'principal');return {items:await tx.presentationConfigurations(hashSubject(p.tenantId,p.subject))};});
 api.presentationStart=async(p,input)=>{
  sr2Object(input,['configurationId','profile']);prune();if(sessions.size>=1000)sr2Fail(429,'PCI-VP-CAPACITY','Wait for outstanding presentation requests to expire.');
  const configurationId=sr2Uuid(input.configurationId),configuration=await store.transaction(p.tenantId,async tx=>{
   await authorize(tx,p,'principal');await tx.rate('presentation:'+hashSubject(p.tenantId,p.subject),Math.floor(now()/60000),10);
   const c=await get(tx,'configuration',configurationId);sr2Assert(c.activeVersion,'Choose a credential configuration that has been published.');return tx.version('configuration',c.id,c.activeVersion);
  });
  const id=crypto.randomUUID(),state=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('base64url');
  const responseUri=api.issuerUrl({primary_domain:p.host})+'/api/v1/presentation-response',request=pciPresentationRequest({id,profile:input.profile,configuration,responseUri,state,nonce});
  const uri='openid4vp://?'+new URLSearchParams(Object.fromEntries(Object.entries(request).map(([key,value])=>[key,typeof value==='object'?JSON.stringify(value):value])));
  sessions.set(id,{id,state,nonce,profile:input.profile,configurationId,tenantId:p.tenantId,host:p.host,subjectHash:hashSubject(p.tenantId,p.subject),principal:{tenantId:p.tenantId,host:p.host,subject:p.subject,roles:p.roles},clientId:request.client_id,status:'pending',expiresAt:now()+300000,attempts:0});
  return {requestId:id,requestUri:uri,profile:input.profile,expiresAt:now()+300000};
 };
 api.presentationRespond=async(tenantId,host,input)=>{
  prune();sr2Assert(input&&typeof input.state==='string'&&/^[A-Za-z0-9_-]{43}$/.test(input.state),'Presentation state is required.');
  const s=[...sessions.values()].find(s=>s.tenantId===tenantId&&s.host===host&&equal(s.state,input.state));
  if(!s)sr2Fail(404,'PCI-SR2-NOT-FOUND');if(s.status!=='pending')sr2Fail(409,'PCI-VP-REPLAY','This presentation request has already been answered.');
  s.status='processing';
  try{
   const parsed=pciPresentationToken(input,{...s,now:now()});
   const ctx=await store.transaction(tenantId,async tx=>{
    await authorize(tx,s.principal,'principal');const r=await tx.requestByCredential(parsed.credentialId);
    if(!r||r.configurationId!==s.configurationId||r.subjectHash!==s.subjectHash)sr2Fail(404,'PCI-SR2-NOT-FOUND');
    sr2Assert(r.state==='issued'&&(!r.holderDid||r.holderDid===parsed.holderDid),'The credential is revoked, unavailable, or bound to another holder.');
    return {r,tenant:tx.tenant,principal:s.principal,configuration:await tx.version('configuration',r.configurationId,r.configurationVersion),metadata:await tx.version('metadata',tenantId,r.metadataVersion),status:r.status,holderBinding:parsed.holderBinding,credential:parsed.credential,deadline:Math.min(s.expiresAt,now()+10000)};
   });
   const verified=await sr2Deadline(()=>adapters.verifySigned(ctx),ctx.deadline,now);sr2Assert(verified.credentialId===parsed.credentialId,'Credential verification did not match the issuance record.');
   sr2Assert(typeof adapters.verifyStatus==='function','Native status verification is not configured.');
   const statusResult=await sr2Deadline(()=>adapters.verifyStatus(ctx),ctx.deadline,now);
   sr2Assert(statusResult?.valid===true,'Native credential status verification failed.');
   await store.transaction(tenantId,async tx=>{await authorize(tx,s.principal,'principal');const r=await tx.request(ctx.r.id);sr2Assert(r.state==='issued','The credential was revoked during verification.');if(!r.holderDid){r.holderDid=parsed.holderDid;await tx.saveRequest(r);}await api.event(tx,s.principal,'presentation.verified',r.configurationId,r);});
   s.status='verified';s.result={verified:true,profile:s.profile,configurationId:s.configurationId,credentialId:parsed.credentialId,holderDid:parsed.holderDid};
   s.responseCode=crypto.randomBytes(32).toString('base64url');delete s.principal;
   return {redirect_uri:api.issuerUrl({primary_domain:host})+'/ui/#/presentation?request='+s.id+'&response_code='+s.responseCode};
  }catch(error){s.status='failed';s.errorCode='PCI-VP-VERIFICATION-FAILED';delete s.principal;throw error;}
 };
 api.presentationResult=async(p,id,code)=>{
  const s=await owner(p,id);if(s.status==='failed')return {status:'failed',code:s.errorCode};
  if(s.status!=='verified')return {status:s.status,expiresAt:s.expiresAt};
  if(!code)return {status:'awaiting_confirmation',expiresAt:s.expiresAt};
  s.attempts++;if(s.attempts>5){sessions.delete(s.id);sr2Fail(429,'PCI-VP-CONFIRMATION-LIMIT','Start a new presentation request.');}
  if(!equal(code,s.responseCode))sr2Fail(403,'PCI-VP-CONFIRMATION','Use the confirmation code from the wallet response.');
  sessions.delete(s.id);return {status:'verified',...s.result};
 };
 api.presentationPrune=prune;return api;
}
