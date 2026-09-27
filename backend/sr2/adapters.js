import crypto from 'node:crypto';
import { sr2Assert, sr2Fail, sr2Object, sr2Text, sr2Claims, sr2Hash } from './domain.js';

// Internal ports, NOT XFSC wire schemas. Replace only from verified offline
// upstream source and fixtures; never enable by an environment boolean.
export function createSr2Adapters() {
  const blocked=async()=>sr2Fail(503,'PCI-SR2-CONTRACT-BLOCKED','The exact OCM/NATS and participant protocol contracts are not supplied.');
  return {capabilities:()=>({ready:false,code:'PCI-SR2-CONTRACT-BLOCKED',missing:['OCM request/reply schemas and library revision','Participant protobuf and Crypto Provider contract','OID4VCI profile fixtures']}),assertReady:blocked,publishMetadata:blocked,createOffer:blocked,authenticateInvocation:blocked,authenticateCallback:blocked,notifyParticipant:blocked,getParticipantData:blocked,allocateStatus:blocked,sign:blocked,verifySigned:blocked,revokeStatus:blocked,participantIdentity:blocked,signingContext:blocked};
}
// The only exact message fragment in supplied knowledge: common.Request.
// Does not imply support for OfferingURLReq or IssuanceModuleReq serialization.
export function sr2CommonRequest(tenantId,requestId,groupId) {
  sr2Text(tenantId,200);sr2Text(requestId,200);if(groupId!==undefined)sr2Text(groupId,200);
  return {tenant_id:tenantId,request_id:requestId,...(groupId?{group_id:groupId}:{})};
}
export function sr2VerifyJwt(token,{issuer,audience,subject,tenantId,scopes=[],kid},jwks,now=Date.now()) {
  sr2Assert(typeof token==='string' && token.length<131072,'Invalid JWT size.');
  const parts=token.split('.');sr2Assert(parts.length===3 && parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)),'Invalid compact JWT.');let header,claims;
  try {header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{sr2Fail(400,'PCI-SR2-VALIDATION','Malformed JWT.');}
  sr2Object(header,['alg','kid','typ']);sr2Assert(['RS256','PS256','ES256'].includes(header.alg) && typeof header.kid==='string','Unsupported JWT key or algorithm.');
  if(kid)sr2Assert(header.kid===kid,'Unexpected signing key.');
  const keys=sr2ListKeys(jwks).filter(k=>k.kid===header.kid);sr2Assert(keys.length===1,'A unique trusted key is required.');
  const jwk=keys[0];sr2Assert(!Object.hasOwn(jwk,'d') && (!jwk.use || jwk.use==='sig') && (!jwk.alg || jwk.alg===header.alg),'Invalid public signing key.');
  sr2Assert(header.alg==='ES256' ? jwk.kty==='EC' && jwk.crv==='P-256' : jwk.kty==='RSA','Algorithm/key mismatch.');
  const key=crypto.createPublicKey({key:jwk,format:'jwk'});if(jwk.kty==='RSA')sr2Assert(key.asymmetricKeyDetails.modulusLength>=2048,'RSA key is too small.');
  const options={key,...(header.alg==='PS256'?{padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32}:{}),...(header.alg==='ES256'?{dsaEncoding:'ieee-p1363'}:{})};
  sr2Assert(crypto.verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),options,Buffer.from(parts[2],'base64url')),'Signature verification failed.');
  const seconds=Math.floor(now/1000);
  sr2Assert(claims && typeof claims==='object' && !Array.isArray(claims),'Invalid JWT claims.');
  sr2Assert(claims.iss===issuer && claims.sub===subject && (!tenantId || claims.tenant_id===tenantId),'JWT identity binding failed.');
  if(audience)sr2Assert(typeof claims.aud==='string'?claims.aud===audience:Array.isArray(claims.aud)&&claims.aud.includes(audience),'JWT audience mismatch.');
  sr2Assert(Number.isSafeInteger(claims.exp) && claims.exp>seconds && (!Object.hasOwn(claims,'nbf') || Number.isSafeInteger(claims.nbf)&&claims.nbf<=seconds) && (!Object.hasOwn(claims,'iat') || Number.isSafeInteger(claims.iat)&&claims.iat<=seconds),'JWT lifetime is invalid.');
  const granted=typeof claims.scope==='string'?claims.scope.split(' '):[];sr2Assert(scopes.every(s=>granted.includes(s)),'JWT scope mismatch.');return claims;
}
function sr2ListKeys(jwks){sr2Assert(jwks && Array.isArray(jwks.keys) && jwks.keys.length<=20,'Invalid trusted JWKS.');return jwks.keys;}
export function sr2VerifyCredential(token,configuration,context,jwks,now=Date.now()) {
  sr2Assert(configuration.format==='jwt_vc_json','This local verifier supports jwt_vc_json only; other formats require a verified adapter.');
  const claims=sr2VerifyJwt(token,{issuer:context.issuer,subject:context.subject,kid:context.kid},jwks,now);
  const vc=claims.vc;sr2Assert(vc && typeof vc==='object' && Array.isArray(vc.type),'A W3C VC is required.');
  sr2Assert(sr2Hash([...vc.type].sort())===sr2Hash([...configuration.credentialTypes].sort()),'Credential type/configuration mismatch.');
  sr2Assert(vc.issuer===context.issuer || vc.issuer?.id===context.issuer,'Credential issuer mismatch.');
  const cs=vc.credentialSubject;sr2Assert(cs && cs.id===context.subject,'Credential subject binding failed.');const {id,...values}=cs;sr2Claims({subject:id,claims:values},configuration,context.subject);
  sr2Assert(sr2Hash(vc.credentialStatus)===sr2Hash(context.status),'Credential status binding failed.');
  if(context.holderBinding)sr2Assert(sr2Hash(claims.cnf)===sr2Hash(context.holderBinding),'Credential holder binding failed.');
  sr2Assert(!Object.hasOwn(claims,'crit'),'Unsupported critical credential extension.');
  // IDs are read only after signature and all credential bindings pass. Optional
  // IDs remain null; the request ID is never presented as a credential ID.
  const credentialId=claims.jti ?? vc.id ?? null;
  if(credentialId!==null){sr2Text(credentialId,1024);sr2Assert(!/[\x00-\x20\x7f]/.test(credentialId) && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(credentialId),'Credential ID must be a URI.');}
  if(claims.jti!==undefined && vc.id!==undefined)sr2Assert(claims.jti===vc.id,'Credential identifier mismatch.');
  return {credentialId};
}
export async function sr2Deadline(operation,deadline,now=Date.now) {
  const remaining=deadline-now();if(remaining<=0)sr2Fail(504,'PCI-SR2-DEADLINE','The participant deadline expired.');
  let timer;try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Deadline exceeded'),{status:504,code:'PCI-SR2-DEADLINE'})),remaining);})]);}finally{clearTimeout(timer);}
}

export async function sr2Retry(operation,attempts,deadline,now=Date.now) {
  for(let attempt=0;attempt<attempts;attempt++){
    try{return await sr2Deadline(operation,deadline,now);}
    catch(error){if(attempt+1===attempts || error.retryable!==true || error.idempotentSafe!==true)throw error;
      const delay=Math.min(1000,100*2**attempt)+crypto.randomInt(0,50);
      if(now()+delay>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,delay));}
  }
}
