import {pciLdpContext,pciLdpSubject} from './linked-data.js';
export {pciLdpContext} from './linked-data.js';
import {pciSdJwtPayload,sr2VerifySdJwt} from './sdjwt.js';
import crypto from 'node:crypto';
import { sr2Assert, sr2Fail, sr2Claims, sr2Hash, sr2Text, sr2ExpectedClaims } from './domain.js';
import { sr2CommonRequest, sr2VerifyJwt, sr2VerifyCredential } from './adapters.js';
import { pciEvent, pciReply, pciHttp, pciGrpc } from './wire.js';
import { sr2TlsMaterial, sr2ResolvedParticipant } from './participant-security.js';

export function pciContains(expected,actual){
  if(Array.isArray(expected))return Array.isArray(actual) && expected.length===actual.length && expected.every((v,i)=>pciContains(v,actual[i]));
  if(expected && typeof expected==='object')return Boolean(actual && typeof actual==='object' && Object.entries(expected).every(([k,v])=>Object.hasOwn(actual,k)&&pciContains(v,actual[k])));
  return expected===actual;
}
export function pciIssuanceTopic(tenantId,configurationId){return 'fap.pci.'+tenantId+'.'+configurationId;}
// Well-Known 1.5.2 retains claim paths/mandatory flags but omits optional
// claim display labels. Complete only absent labels from the published local
// snapshot. Explicit native values and every substantive field remain checked.
export function pciCompleteClaimDisplay(expected,native){
  if(!native || typeof native!=='object' || Array.isArray(native))return native;
  // Native replies and local metadata are JSON documents, not host objects.
  const completed=JSON.parse(JSON.stringify(native));
  for(const [id,configuration] of Object.entries(expected.credential_configurations_supported || {})){
    const wanted=configuration.credential_metadata?.claims;
    const observed=completed.credential_configurations_supported?.[id]?.credential_metadata?.claims;
    if(!Array.isArray(wanted) || !Array.isArray(observed) || wanted.length!==observed.length)continue;
    for(let i=0;i<wanted.length;i++){
      const {display,...definition}=wanted[i];
      if(display!==undefined && pciContains(definition,observed[i]) && !Object.hasOwn(observed[i],'display'))observed[i].display=JSON.parse(JSON.stringify(display));
    }
  }
  return completed;
}
export function pciNativeMetadata(bundle,assetUrl){
  const m=bundle.issuer,base=m.issuer,configs={};
  for(const {id,data:c} of bundle.configurations){const display={name:c.name,description:c.description,locale:'en',...(c.logoAssetId?{logo:{uri:assetUrl(bundle.tenantId,c.logoAssetId),alt_text:c.name}}:{}),...(c.backgroundAssetId?{background_image:{uri:assetUrl(bundle.tenantId,c.backgroundAssetId)}}:{})};
    configs[c.identifier]={format:c.format,scope:c.identifier,cryptographic_binding_methods_supported:['jwk'],credential_signing_alg_values_supported:c.format==='ldp_vc'?['JsonWebSignature2020']:c.format==='jwt_vc_json'?['ES256','PS256','RS256']:['ES256'],proof_types_supported:{jwt:{proof_signing_alg_values_supported:['ES256','PS256','RS256']}},topic:pciIssuanceTopic(bundle.tenantId,id),schema:{type:'object',properties:Object.fromEntries(c.claims.map(x=>[x.name,{type:x.type}])),required:c.claims.filter(x=>x.required).map(x=>x.name),additionalProperties:false},credential_metadata:{display:[display],claims:c.claims.map(x=>({path:c.format.includes('sd-jwt')?[x.name]:c.format==='ldp_vc'?['credentialSubject','pciClaims',x.name]:['credentialSubject',x.name],mandatory:x.required,display:[{name:x.name,locale:'en'}]}))},...(c.format.includes('sd-jwt')?{vct:c.vct}:{credential_definition:{type:c.credentialTypes,'@context':c.format==='ldp_vc'?pciLdpContext(c,base):['https://www.w3.org/2018/credentials/v1']}})};
  }
  return {credential_issuer:base,authorization_servers:m.authorizationServers,credential_endpoint:base+'/api/credential',nonce_endpoint:base+'/api/nonce',display:[{name:m.displayName,locale:'en'}],credential_configurations_supported:configs};
}

// Local archive state is authoritative for withdrawal. Nonempty catalogues must
// still match the native publication, including the active context and claims.
export function pciPublicCatalogue(bundle,native){
  const expected=pciNativeMetadata(bundle,(_,id)=>bundle.issuer.issuer+'/api/v1/public/assets/'+id);
  if(!bundle.configurations.length)return expected;
  for(const c of Object.values(expected.credential_configurations_supported)){delete c.topic;delete c.schema;}
  const filtered=pciCompleteClaimDisplay(expected,{...native,credential_configurations_supported:Object.fromEntries(Object.entries(native?.credential_configurations_supported||{}).filter(([id])=>Object.hasOwn(expected.credential_configurations_supported,id)))});
  if(!pciContains(expected,filtered))sr2Fail(503,'PCI-METADATA-PENDING','Publish the current issuer catalogue to OCM before wallet discovery.');
  return filtered;
}

export function pciHolderProof(token,{nonce,issuer},now=Date.now()){
  sr2Assert(typeof token==='string' && token.length<16384,'A wallet JWT proof is required.');let header,claims,parts;
  try{parts=token.split('.');sr2Assert(parts.length===3,'Malformed proof.');header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{sr2Fail(400,'PCI-PROOF-INVALID');}
  sr2Assert(header.typ==='openid4vci-proof+jwt' && header.jwk && !header.jwk.d && !header.jku && !header.x5u && !header.crit,'An embedded public proof key is required.');
  const alg=header.alg,key=header.jwk;sr2Assert(['ES256','PS256','RS256'].includes(alg) && (alg==='ES256'?key.kty==='EC'&&key.crv==='P-256':key.kty==='RSA'),'Invalid proof key.');
  const pub=crypto.createPublicKey({key,format:'jwk'});if(key.kty==='RSA')sr2Assert(pub.asymmetricKeyDetails.modulusLength>=2048,'Proof RSA key too small.');
  sr2Assert(crypto.verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:pub,...(alg==='ES256'?{dsaEncoding:'ieee-p1363'}:{}),...(alg==='PS256'?{padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32}:{})},Buffer.from(parts[2],'base64url')),'Wallet proof signature rejected.');
  sr2Assert(claims.aud===issuer && claims.nonce===nonce && Number.isInteger(claims.iat) && Math.abs(now/1000-claims.iat)<=300,'Wallet proof binding rejected.');
  return {jwk:pub.export({format:'jwk'})};
}

// Crypto 2.3.7 JwkPublicKey returns Crypto Core 2.3.0 GetJwk's []jwk.Key,
// not a bare JWK. RSA responses contain separate RS256 and PS256 entries.
// Retain the older bare-JWK/JWKS forms, but never select an arbitrary first key.
export function pciNativeSigningKey(input,{key,did,algorithm}){
  const invalid=()=>sr2Fail(502,'PCI-SIGNER-JWK-INVALID','The signer returned an invalid public signing key.');
  if(!['ES256','RS256','PS256'].includes(algorithm))invalid();
  let document=input;
  if(typeof document==='string'){try{document=JSON.parse(document);}catch{invalid();}}
  const keys=Array.isArray(document)?document:document && Array.isArray(document.keys)?document.keys:[document];
  if(!keys.length || keys.length>20)invalid();
  for(const candidate of keys){
    if(!candidate || typeof candidate!=='object' || Array.isArray(candidate) || !['EC','RSA','OKP'].includes(candidate.kty))invalid();
    if(['d','p','q','dp','dq','qi','oth','k'].some(field=>Object.hasOwn(candidate,field)))invalid();
    if(candidate.kid!==undefined && candidate.kid!==key && candidate.kid!==did+'#'+key)invalid();
    if(candidate.use!==undefined && candidate.use!=='sig')invalid();
    if(candidate.key_ops!==undefined && (!Array.isArray(candidate.key_ops) || candidate.key_ops.length!==1 || candidate.key_ops[0]!=='verify'))invalid();
  }
  const selected=keys.filter(candidate=>(candidate.alg===undefined || candidate.alg===algorithm) &&
    (algorithm==='ES256'?candidate.kty==='EC' && candidate.crv==='P-256':candidate.kty==='RSA'));
  if(selected.length!==1)invalid();
  try{crypto.createPublicKey({key:selected[0],format:'jwk'});}catch{invalid();}
  return {...selected[0],kid:did+'#'+key};
}

export function createPciNativeAdapters(options){
  const o=options,nats=o.nats,httpCall=o.http || pciHttp,clock=o.now || Date.now,offers=o.offers || new Map();
  function required(){sr2Assert(nats && o.signerUrl && o.statusUrl && o.wellKnownUrl && o.readSecret && o.lookup && o.getParticipantToken,'Configure the OCM services, NATS and participant trust.');}
  async function message(subject,type,request,replyType=type,timeout=5000){
    try{return pciReply(await nats.request(subject,pciEvent(type,request),timeout),replyType,request);}
    catch(error){
      if(error?.message==='PCI-NATS-NO-RESPONDER')sr2Fail(503,'PCI-NATS-NO-RESPONDER','No OCM service is listening on the configured NATS subject. Check the service and subject configuration.');
      if(error?.message==='PCI-NATS-TIMEOUT')sr2Fail(504,'PCI-NATS-TIMEOUT','OCM did not reply before the deadline. Check its logs before retrying a signing or issuance operation.');
      if(error?.message==='PCI-NATS-DISCONNECTED')sr2Fail(503,'PCI-NATS-DISCONNECTED','The OCM message connection is unavailable. Check the NATS address, authentication and network policy.');
      throw error;
    }
  }
  async function native(base,path,{method='GET',body,headers={},deadline=clock()+5000}={}){const res=await httpCall(base+path,{method,body,headers:{...(body?{'content-type':'application/json'}:{}),...headers},timeout:Math.max(1,deadline-clock())});if(res.status<200 || res.status>=300)sr2Fail(502,'PCI-OCM-HTTP','The native service rejected the operation.');return res.data;}
  function context(t){return {namespace:o.cryptoNamespace || t.r.tenantId,group:o.cryptoNamespace ? t.r.tenantId : 'default',key:t.configuration.keyRef,did:t.metadata.did,origin:t.metadata.issuer};}
  async function jwk(t,algorithm='ES256'){const c=context(t),result=await native(o.signerUrl,`/v1/jwk/${encodeURIComponent(c.namespace)}/${encodeURIComponent(c.key)}`,{body:{group:c.group,engine:'transit'}});return pciNativeSigningKey(result,{...c,algorithm});}
  async function signedJwt(t,payload,typ='JWT'){const c=context(t),kid=c.did+'#'+c.key;const req={...sr2CommonRequest(t.r.tenantId,t.r.id),namespace:c.namespace,group:c.group,key:c.key,payload:Buffer.from(JSON.stringify(payload)).toString('base64'),header:Buffer.from(JSON.stringify({typ,kid})).toString('base64')};const r=await message(o.signerTopic || 'signer-topic','signer.signToken',req);return Buffer.from(r.token,'base64').toString('utf8');}
  async function participant(t,method){const material=await sr2TlsMaterial(t.connector,{...t.tenant,namespace:o.namespace},o.readSecret),address=await sr2ResolvedParticipant(t.connector,o.lookup,o.approvedPrivateAddresses || []);return (o.grpc || pciGrpc)(t.connector,material,address,method,{protocolVersion:'participant-v1',tenantId:t.r.tenantId,configurationId:t.r.configurationId,requestId:t.r.id,subject:t.principal.subject,participantSubject:t.participantSubject || t.principal.subject,participantJwt:t.participantJwt,configuration:t.participantConfiguration || t.configuration,issuer:t.metadata.did,holderBinding:t.holderBinding,status:t.status?.entry || null,deadline:new Date(t.deadline).toISOString(),signingContext:context(t)},t.deadline);}
  const api={
    capabilities:()=>({ready:Boolean(nats && o.signerUrl && o.statusUrl && o.wellKnownUrl),adapter:'ocm-esb-12.3.9',profiles:['oid4vci-draft13','oid4vci-1.0'],formats:['jwt_vc_json','ldp_vc','vc+sd-jwt','dc+sd-jwt'],participantProtocol:'participant-v1',emptyCatalogue:o.emptyCatalogue===true,presentationProfiles:['oid4vp-draft13','oid4vp-1.0'],presentationFormats:['jwt_vc_json']}),
    async assertReady(pin){required();sr2Assert(pin.connector.protocolVersion==='participant-v1','Unsupported participant protocol.');await nats.connect?.();},
    async publishMetadata(bundle){
      required();
      if(!bundle.issuer)sr2Fail(409,'PCI-METADATA-NOT-ACTIVE','Save and activate issuer metadata before publishing.');
      if(!bundle.configurations?.length && o.emptyCatalogue!==true)sr2Fail(409,'PCI-METADATA-EMPTY-CATALOGUE','Publish at least one credential configuration before sending metadata to this OCM version. Its Well-Known service cannot reliably read an empty catalogue.');
      const issuer=pciNativeMetadata(bundle,o.assetUrl || ((tenant,id)=>bundle.issuer.issuer+'/api/v1/public/assets/'+id));
      const publish=()=>nats.publish('wellknown.issuer.registration',pciEvent('wellknown.issuer.registration',{...sr2CommonRequest(bundle.tenantId,crypto.randomUUID()),issuer}));
      await publish();
      // Registration is a broadcast. Success requires the native service to
      // return the exact catalogue. A previous empty issuer may prevent its
      // upsert; seed only real configurations through the supported event.
      const end=clock()+10000;let repaired=false;
      for(let attempt=0;attempt<20 && clock()<end;attempt++){
        let m;
        try{const read={...sr2CommonRequest(bundle.tenantId,crypto.randomUUID())};m=(await message('wellknown.issuer.metadata','wellknown.issuer.metadata',read)).Issuer;}
        catch(error){if(error.code!=='PCI-OCM-EMPTY-REPLY')throw error;}
        if(m?.credential_issuer===issuer.credential_issuer && sr2Hash(Object.keys(m.credential_configurations_supported || {}).sort())===sr2Hash(Object.keys(issuer.credential_configurations_supported).sort()) && pciContains(issuer,pciCompleteClaimDisplay(issuer,m)))return {published:true};
        if(!repaired && (!m || !Object.keys(m.credential_configurations_supported || {}).length)){
          repaired=true;
          for(const [ConfigurationId,CredentialConfiguration] of Object.entries(issuer.credential_configurations_supported))await nats.publish('wellknown.issuer.registration',pciEvent('wellknown.issuer.credential.registration',{...sr2CommonRequest(bundle.tenantId,crypto.randomUUID()),issuer:issuer.credential_issuer,ConfigurationId,CredentialConfiguration}));
        }
        await new Promise(resolve=>setTimeout(resolve,250));
        if(repaired)await publish();
      }
      sr2Fail(502,'PCI-METADATA-READBACK','OCM has not confirmed the published catalogue. Check Well-Known service logs and retry publication; PCI has not marked it successful.');
    },
    async createOffer(t){required();for(const [id,r] of offers)if(r.expiresAt<=clock())offers.delete(id);sr2Assert(offers.size<1000,'Too many pending wallet offers.');const token=await o.getParticipantToken(t.principal,t.connector);sr2Assert(token && token.expiresAt>clock(),'Sign in again before requesting a credential.');
      const nonce=crypto.randomBytes(32).toString('base64url'),request={...sr2CommonRequest(t.r.tenantId,t.r.id),Params:{subject:t.principal.subject,credentialConfiguration:[{configuration_id:t.configuration.identifier,credential_identifiers:[t.r.id]}],grantType:'urn:ietf:params:oauth:grant-type:pre-authorized_code',nonce}};
      const state={principal:t.principal,participantJwt:token.token,participantSubject:token.subject || t.principal.subject,nonce,configuration:t.configuration,metadata:t.metadata,configurationId:t.r.configurationId,expiresAt:Math.min(t.r.expiresAt,token.expiresAt),consumed:false};offers.set(t.r.id,state);
      try{const r=await message('credential.offer.url','credential.offer.url.v1',request,'credential.offer.url.v1',Math.max(1,t.deadline-clock()));const subject=crypto.createHash('sha256').update(t.r.tenantId+';;'+t.r.id+';').digest('hex');sr2Assert(r.Subject===subject && typeof r.Code==='string' && typeof r.CredentialOffer?.credential_offer==='string','OCM offer correlation mismatch.');state.codeHash=crypto.createHash('sha256').update(r.Code).digest('hex');return {requestId:t.r.id,tenantId:t.r.tenantId,configurationId:t.r.configurationId,offerUrl:r.CredentialOffer.credential_offer};}catch(e){offers.delete(t.r.id);throw e;}
    },
    async authenticateCallback({input,tenantId,topic}){const e=input,d=e?.data,r=offers.get(d?.request_id);sr2Assert(r && !r.consumed && r.expiresAt>clock() && d.tenant_id===tenantId && r.principal.tenantId===tenantId,'Unknown or expired native callback.');const expected=pciIssuanceTopic(tenantId,r.configurationId);sr2Assert(e.specversion==='1.0' && e.type===expected && (!topic || topic===expected+'.issue') && d.CredentialConfiguration?.configuration_id===r.configuration.identifier && d.Format===r.configuration.format && d.Nonce===r.nonce && d.Subject===crypto.createHash('sha256').update(tenantId+';;'+d.request_id+';').digest('hex'),'Native callback scope mismatch.');
      // OCM Code is the token presented to the credential endpoint, not the
      // pre-authorization code. Correlate with the private nonce and request.
      sr2Assert(d.ProofType==='jwt','The configured proof profile requires JWT.');let proofNonce;try{proofNonce=JSON.parse(Buffer.from(d.Holder.split('.')[1],'base64url')).nonce;}catch{sr2Fail(400,'PCI-PROOF-INVALID');}
      const holderBinding=pciHolderProof(d.Holder,{nonce:proofNonce,issuer:r.metadata.issuer},clock());sr2Assert(typeof proofNonce==='string' && o.consumeWalletNonce?.(tenantId,proofNonce)===true,'Wallet nonce expired or replayed.');r.consumed=true;
      return {principal:{...r.principal,participantSubject:r.participantSubject},requestId:d.request_id,participantJwt:r.participantJwt,holderBinding};
    },
    async authenticateInvocation(){sr2Fail(403,'PCI-INTERNAL-INVOCATION','Use the authenticated tenant API; native callbacks are accepted through NATS.');},
    async participantIdentity(t){if(o.validateSession)sr2Assert(await o.validateSession(t.principal),'The principal session expired or its identity settings changed.');const issuer=t.connector.jwtIssuer;sr2Assert((o.allowedJwtIssuers || []).includes(issuer)||await o.approveJwtIssuer?.(t),'Participant token issuer is not approved by the operator.');const metadata=await native(issuer,'/.well-known/openid-configuration');sr2Assert(metadata.issuer===issuer && new URL(metadata.jwks_uri).origin===new URL(issuer).origin,'Untrusted participant JWKS.');const keys=await native(metadata.jwks_uri,'');const subject=t.principal.participantSubject || t.principal.subject;sr2VerifyJwt(t.participantJwt,{issuer,audience:t.connector.jwtAudience,subject,scopes:t.connector.jwtScopes},keys,clock());t.participantSubject=subject;},
    notifyParticipant:t=>participant(t,'Notify'),getParticipantData:t=>participant(t,'GetCredentialData'),
    signingContext:async t=>context(t),
    async allocateStatus(t){const c=context(t),sd=t.configuration.format.includes('sd-jwt');const r=await message(o.statusTopic || 'status.data','status.data.create',{...sr2CommonRequest(t.r.tenantId,t.r.id),origin:c.origin,key:c.key,did:c.did,namespace:c.namespace,group:c.group,type:sd?'statuslist+jwt':'StatusList2021',purpose:'revocation',expirationDate:new Date(clock()+365*86400000).toISOString()},'status.data');sr2Assert(Number.isSafeInteger(r.listid)&&r.listid>=0&&Number.isSafeInteger(r.index)&&r.index>=0&&new URL(r.statusUrl).origin===new URL(c.origin).origin,'Invalid native status allocation.');return {tenantId:t.r.tenantId,configurationId:t.r.configurationId,requestId:t.r.id,handle:r.listid+':'+r.index,entry:sd?{status_list:{idx:r.index,uri:r.statusUrl}}:{id:r.statusUrl+'#'+r.index,type:'StatusList2021Entry',statusPurpose:'revocation',statusListIndex:String(r.index),statusListCredential:r.statusUrl}};},
    async sign(t){const c=context(t),iat=Math.floor(clock()/1000),id='urn:uuid:'+crypto.randomUUID(),cs={id:t.principal.subject,...t.data.claims};
      if(t.configuration.format==='jwt_vc_json')return signedJwt(t,{iss:c.did,sub:t.principal.subject,iat,nbf:iat,exp:iat+31536000,jti:id,cnf:t.holderBinding,vc:{'@context':['https://www.w3.org/2018/credentials/v1'],id,type:t.configuration.credentialTypes,issuer:c.did,issuanceDate:new Date(iat*1000).toISOString(),expirationDate:new Date((iat+31536000)*1000).toISOString(),credentialSubject:cs,credentialStatus:t.status.entry}});
      const signingKey=await jwk(t);sr2Assert(signingKey.kty==='EC' && signingKey.crv==='P-256','The selected native proof suite requires an EC P-256 key.');
      if(t.configuration.format.includes('sd-jwt')){
        const formatted=pciSdJwtPayload({iss:c.did,sub:t.principal.subject,iat,nbf:iat,exp:iat+31536000,jti:id,vct:t.configuration.vct,cnf:t.holderBinding,status:t.status.entry},t.data.claims,t.configuration.claims);
        const token=await signedJwt(t,formatted.payload,t.configuration.format);
        return token+'~'+(formatted.disclosures.length?formatted.disclosures.join('~')+'~':'');
      }
      const credential={'@context':pciLdpContext(t.configuration,c.origin),id,type:t.configuration.credentialTypes,issuer:c.did,issuanceDate:new Date(iat*1000).toISOString(),expirationDate:new Date((iat+31536000)*1000).toISOString(),credentialSubject:{id:pciLdpSubject(t.principal.subject),pciClaims:t.data.claims},credentialStatus:t.status.entry};
      const signed=await native(o.signerUrl,'/v1/credential/proof',{method:'POST',body:{namespace:c.namespace,group:c.group,key:c.key,credential,format:'ldp_vc',signatureType:'jsonwebsignature2020',nonce:sr2Hash(t.holderBinding),status:false,'x-tenantid':t.r.tenantId,'x-groupid':'','x-origin':c.origin,'x-did':c.did},deadline:t.deadline});return typeof signed==='string'?signed:JSON.stringify(signed);
    },
    async verifySigned(t){
      const c=context(t),binding={issuer:c.did,subject:t.principal.subject,kid:c.did+'#'+c.key,status:t.status.entry,holderBinding:t.holderBinding,expectedClaims:t.data?.claims};
      if(t.configuration.format==='jwt_vc_json'||t.configuration.format.includes('sd-jwt')){
        let algorithm;try{algorithm=JSON.parse(Buffer.from(t.credential.split('.')[0],'base64url')).alg;}catch{sr2Fail(400,'PCI-SR2-VALIDATION','Malformed JWT.');}
        const key=await jwk(t,algorithm),keys={keys:[key]};
        return t.configuration.format==='jwt_vc_json'?sr2VerifyCredential(t.credential,t.configuration,binding,keys,clock()):sr2VerifySdJwt(t.credential,t.configuration,binding,keys,clock());
      }
      const result=await native(o.signerUrl,'/v1/credential/verify',{method:'POST',headers:{'x-format':'ldp_vc'},body:{credential:Buffer.from(t.credential).toString('base64'),disclosureFrame:[]},deadline:t.deadline});// Crypto 2.3.7 returns a proof verdict only. Issuance must still call
      // verifyStatus through the scoped native Status contract before delivery.
      sr2Assert(result?.valid===true,'Native credential verification failed.');
      const doc=JSON.parse(t.credential);sr2Assert((doc.issuer?.id||doc.issuer)===c.did&&sr2Hash(doc.credentialStatus)===sr2Hash(t.status.entry)&&sr2Hash([...doc.type].sort())===sr2Hash([...t.configuration.credentialTypes].sort()),'Credential issuer, type or status mismatch.');
      sr2Assert(sr2Hash(doc['@context'])===sr2Hash(pciLdpContext(t.configuration,c.origin)),'Linked-data context differs from the declared configuration.');
      const {id,pciClaims,...extra}=doc.credentialSubject||{};sr2Assert(!Object.keys(extra).length && id===pciLdpSubject(t.principal.subject),'Linked-data subject mismatch.');sr2Claims({subject:t.principal.subject,claims:pciClaims},t.configuration,t.principal.subject);
      sr2ExpectedClaims(pciClaims,binding.expectedClaims);
      const proof=Array.isArray(doc.proof)?doc.proof[0]:doc.proof;sr2Assert(proof?.type==='JsonWebSignature2020'&&proof?.challenge===sr2Hash(t.holderBinding),'Linked-data proof suite or holder binding mismatch.');
      sr2Assert(Number.isFinite(Date.parse(doc.expirationDate))&&Date.parse(doc.expirationDate)>clock()&&Number.isFinite(Date.parse(doc.issuanceDate))&&Date.parse(doc.issuanceDate)<=clock(),'Credential lifetime is invalid.');
      sr2Text(doc.id,1024);sr2Assert(/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(doc.id),'Credential ID must be a URI.');return {credentialId:doc.id};
    },

    async verifyStatus(t){
      const c=context(t),entry=t.status.entry,sd=Boolean(entry.status_list);
      const index=sd?entry.status_list.idx:Number(entry.statusListIndex),statusUrl=sd?entry.status_list.uri:entry.statusListCredential;
      sr2Assert(Number.isSafeInteger(index)&&index>=0&&new URL(statusUrl).origin===new URL(c.origin).origin,'Invalid stored status reference.');
      const r=await message(o.statusTopic||'status.data','status.data.verify',{...sr2CommonRequest(t.r.tenantId,crypto.randomUUID()),namespace:c.namespace,group:c.group,index,statusUrl,type:sd?'statuslist+jwt':'StatusList2021',purpose:'revocation'},'status.data',Math.max(1,t.deadline-clock()));
      sr2Assert(r.revocated===false&&r.suspended===false,'Native status verification rejected the credential.');return {valid:true};
    },
    async revocationStatus(t){
      const c=context(t),entry=t.status.entry,sd=Boolean(entry.status_list),index=sd?entry.status_list.idx:Number(entry.statusListIndex),statusUrl=sd?entry.status_list.uri:entry.statusListCredential;
      sr2Assert(Number.isSafeInteger(index)&&index>=0&&new URL(statusUrl).origin===new URL(c.origin).origin,'Invalid stored revocation reference.');
      const r=await message(o.statusTopic||'status.data','status.data.verify',{...sr2CommonRequest(t.r.tenantId,crypto.randomUUID()),namespace:c.namespace,group:c.group,index,statusUrl,type:sd?'statuslist+jwt':'StatusList2021',purpose:'revocation'},'status.data',Math.max(1,t.deadline-clock()));
      sr2Assert(typeof r.revocated==='boolean'&&typeof r.suspended==='boolean','Native status is indeterminate.');
      return {revoked:r.revocated,tenantId:t.r.tenantId,requestId:t.r.id,handle:t.status.handle};
    },
    async revokeStatus(t){sr2Assert(/^\d+:\d+$/.test(t.status.handle),'Invalid stored status handle.');const [list,index]=t.status.handle.split(':').map(Number);const r=await native(o.statusUrl,`/status/${encodeURIComponent(t.tenantId)}/${list}/revoke/${index}`,{method:'POST',deadline:t.deadline});sr2Assert(r.tenantId===t.tenantId && r.listId===list && r.index===index && r.status==='revoked','Native status revocation acknowledgement mismatch.');return {revoked:true,tenantId:t.tenantId,requestId:t.requestId,handle:t.status.handle};},
    async key(tenantId,name,type='ecdsa-p256'){sr2Assert(/^[A-Za-z0-9_-]{1,64}$/.test(name)&&['ecdsa-p256','rsa-2048','rsa-3072','rsa-4096'].includes(type),'Invalid TSA key parameters.');return message(o.signerTopic || 'signer-topic','signer.createKey',{...sr2CommonRequest(tenantId,crypto.randomUUID()),namespace:o.cryptoNamespace || tenantId,group:o.cryptoNamespace ? tenantId : 'default',key:name,type});},
    release(id){offers.delete(id);},offers
  };return api;
}
