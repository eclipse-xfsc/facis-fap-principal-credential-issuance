import crypto from 'node:crypto';
import {sr2Assert,sr2Hash,sr2Claims,sr2Text,sr2ExpectedClaims} from './domain.js';
import {sr2VerifyJwt} from './adapters.js';

// Only formatting happens here. Every issuer signature is produced by TSA.
export function pciSdJwtPayload(payload,claims,definitions){
  const disclosures=[],digests=[];
  for(const {name} of definitions){
    if(!Object.hasOwn(claims,name))continue;
    const disclosure=Buffer.from(JSON.stringify([crypto.randomBytes(32).toString('base64url'),name,claims[name]])).toString('base64url');
    disclosures.push(disclosure);digests.push(crypto.createHash('sha256').update(disclosure).digest('base64url'));
  }
  return {payload:{...payload,_sd_alg:'sha-256',_sd:digests},disclosures};
}

export function sr2VerifySdJwt(credential,configuration,context,jwks,now=Date.now()){
  sr2Assert(typeof credential==='string'&&credential.length<=262144&&credential.endsWith('~'),'An issued SD-JWT with disclosures is required.');
  const parts=credential.split('~');parts.pop();const signed=parts.shift();
  let header;try{header=JSON.parse(Buffer.from(signed.split('.')[0],'base64url'));}catch{sr2Assert(false,'Invalid SD-JWT header.');}
  sr2Assert(header.typ===configuration.format,'SD-JWT type does not match its advertised profile.');
  const payload=sr2VerifyJwt(signed,{issuer:context.issuer,subject:context.subject,kid:context.kid},jwks,now);
  sr2Assert(payload.vct===configuration.vct&&payload._sd_alg==='sha-256'&&Array.isArray(payload._sd),'SD-JWT type or disclosure algorithm mismatch.');
  sr2Assert(payload._sd.length<=50&&payload._sd.every(d=>typeof d==='string'&&/^[A-Za-z0-9_-]{43}$/.test(d))&&new Set(payload._sd).size===payload._sd.length,'Invalid disclosure digests.');
  sr2Assert(sr2Hash(payload.cnf)===sr2Hash(context.holderBinding)&&sr2Hash(payload.status)===sr2Hash(context.status),'SD-JWT holder or status mismatch.');
  const doc={...payload},digests=new Set(payload._sd),names=new Set();
  const allowed=new Set(configuration.claims.map(c=>c.name));
  const structural=new Set(['iss','sub','iat','nbf','exp','jti','cnf','vct','status','_sd_alg','_sd']);
  sr2Assert(Object.keys(payload).every(k=>structural.has(k)||allowed.has(k)),'Unconfigured SD-JWT claim.');
  for(const raw of parts){
    sr2Assert(/^[A-Za-z0-9_-]+$/.test(raw)&&raw.length<12000,'Invalid disclosure encoding.');
    const digest=crypto.createHash('sha256').update(raw).digest('base64url');
    sr2Assert(digests.delete(digest),'Unknown or duplicate disclosure.');
    let d;try{d=JSON.parse(Buffer.from(raw,'base64url'));}catch{sr2Assert(false,'Invalid disclosure.');}
    sr2Assert(Array.isArray(d)&&d.length===3&&typeof d[0]==='string'&&d[0].length>=16&&allowed.has(d[1])&&!names.has(d[1])&&!Object.hasOwn(doc,d[1]),'Invalid or conflicting disclosed claim.');
    names.add(d[1]);doc[d[1]]=d[2];
  }
  sr2Assert(digests.size===0,'Participant issuance must supply all claim disclosures.');
  const claims=Object.fromEntries(configuration.claims.filter(c=>Object.hasOwn(doc,c.name)).map(c=>[c.name,doc[c.name]]));
  sr2Claims({subject:doc.sub,claims},configuration,context.subject);
  sr2ExpectedClaims(claims,context.expectedClaims);
  sr2Text(doc.jti,1024);sr2Assert(/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(doc.jti),'SD-JWT credential ID must be a URI.');
  return {credentialId:doc.jti};
}
