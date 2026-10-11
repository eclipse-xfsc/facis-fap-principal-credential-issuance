import {pciLdpSubject,pciLdpContext} from '../../backend/sr2/linked-data.js';
// Software test wallet for synthetic acceptance only. Uses real PCI/native OCM
// endpoints; never writes the credential, access token or holder private key.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {pciHttp} from '../../backend/sr2/wire.js';
import {sr2VerifySdJwt} from '../../backend/sr2/sdjwt.js';
import {sr2Hash} from '../../backend/sr2/domain.js';
import {sr2HolderDid} from '../../backend/sr2/history.js';
const ensure=(test,message)=>{if(!test)throw new Error(message);};
export async function testWallet(input,http=pciHttp){
 const {expectedIssuer,profile,offerUri}=input;const issuer=new URL(expectedIssuer);ensure(issuer.protocol==='https:'&&!issuer.username&&!issuer.password,'HTTPS issuer required');ensure(['oid4vci-draft13','oid4vci-1.0'].includes(profile),'Unknown issuance profile');
 async function request(url,options={}){const u=new URL(url);ensure(u.origin===issuer.origin&&u.protocol==='https:','Unexpected wallet endpoint origin');const response=await http(url,{...options,timeout:40000,maxBytes:1048576});ensure(response.status>=200&&response.status<300,'Wallet endpoint HTTP '+response.status);return response.data;}
 const offerUrl=new URL(offerUri);let offer;
 if(offerUrl.searchParams.has('credential_offer'))offer=JSON.parse(offerUrl.searchParams.get('credential_offer'));
 else offer=await request(offerUrl.searchParams.get('credential_offer_uri'));
 ensure(offer.credential_issuer===expectedIssuer,'Offer issuer differs');
 const grant=offer.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code'];ensure(typeof grant?.['pre-authorized_code']==='string','Pre-authorized offer required');
 const metadata=await request(issuer.origin+'/.well-known/openid-credential-issuer'+issuer.pathname.replace(/\/$/,''));ensure(metadata.credential_issuer===expectedIssuer,'Discovery issuer differs');
 const id=offer.credential_configuration_ids?.[0],format=input.format||'jwt_vc_json';ensure(offer.credential_configuration_ids?.length===1&&metadata.credential_configurations_supported?.[id]?.format===format,'Use the expected single credential configuration');
 const authorization=await request(expectedIssuer+'/.well-known/openid-configuration');
 const token=await request(authorization.token_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:pre-authorized_code','pre-authorized_code':grant['pre-authorized_code'],...(input.txCode?{tx_code:input.txCode}:{})}).toString()});ensure(token.access_token,'No access token');
 const nonce=profile==='oid4vci-draft13'?token:await request(metadata.nonce_endpoint,{method:'POST',headers:{'content-type':'application/json'},body:{}});ensure(typeof nonce.c_nonce==='string','No wallet nonce');
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'}),did=sr2HolderDid({jwk});
 function sign(header,payload){const bytes=[header,payload].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');return bytes+'.'+crypto.sign('sha256',Buffer.from(bytes),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');}
 const now=Math.floor(Date.now()/1000),proof=sign({typ:'openid4vci-proof+jwt',alg:'ES256',jwk},{iss:did,aud:expectedIssuer,iat:now,exp:now+120,nonce:nonce.c_nonce});
 const definition=metadata.credential_configurations_supported[id];
 const body=profile==='oid4vci-draft13'?{format,...(format.includes('sd-jwt')?{vct:definition.vct}:{credential_definition:{type:definition.credential_definition.type}}),proof:{proof_type:'jwt',jwt:proof}}:{credential_configuration_id:id,proofs:{jwt:[proof]}};
 const received=await request(metadata.credential_endpoint,{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},body});
 let credential=profile==='oid4vci-draft13'?received.credential:received.credentials?.[0]?.credential;if(format==='ldp_vc'&&typeof credential==='object')credential=JSON.stringify(credential);ensure(typeof credential==='string','No credential');
 if(format==='ldp_vc'){
  ensure(input.linkedDataVerifier?.url,'Supply the approved native TLS verifier for the linked-data acceptance case');const v=input.linkedDataVerifier,url=new URL(v.url);ensure(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search,'Invalid linked-data verifier');
  const tlsOptions=Object.fromEntries(['ca','cert','key'].filter(k=>v[k+'File']).map(k=>[k,fs.readFileSync(v[k+'File'])]));
  const verified=await http(url.toString().replace(/\/$/,'')+'/v1/credential/verify',{method:'POST',tlsOptions,headers:{'content-type':'application/json','x-format':'ldp_vc','x-namespace':v.namespace,'x-group':input.tenantId,'x-tenantid':input.tenantId},body:{credential:Buffer.from(credential).toString('base64'),disclosureFrame:[]}});
  ensure(verified.status===200&&verified.data?.valid===true,'Linked-data signature failed');const doc=JSON.parse(credential),p=Array.isArray(doc.proof)?doc.proof[0]:doc.proof;
  ensure((doc.issuer?.id||doc.issuer)==='did:web:'+issuer.hostname&&Date.parse(doc.expirationDate)>Date.now()&&doc.credentialSubject?.id===pciLdpSubject(input.subject)&&sr2Hash(doc['@context'])===sr2Hash(pciLdpContext(input.configuration,expectedIssuer)),'Linked-data identity or lifetime differs');ensure(p?.type==='JsonWebSignature2020'&&p.challenge===sr2Hash({jwk}),'Linked-data holder proof differs');
  ensure(new URL(doc.credentialStatus.statusListCredential).origin===issuer.origin,'Status origin differs');
  return {status:'PASS',format,issuanceProfile:profile,presentationProfiles:[],credentialId:doc.id,holderDid:did,pcmMobile:'NOT_TESTED'};
 }
 const issuerJwt=credential.split('~')[0];ensure(issuerJwt.split('.').length===3,'No issuer JWT');
 // Verify issuer cryptography independently of the presentation result.
 const [head,claims,sig]=issuerJwt.split('.'),header=JSON.parse(Buffer.from(head,'base64url')),payload=JSON.parse(Buffer.from(claims,'base64url'));
 const keys=(await request(expectedIssuer+'/.well-known/jwks.json')).keys;const kid=header.kid?.split('#').at(-1),key=keys?.find(k=>k.kid===header.kid||k.kid===kid);ensure(key,'Issuer key unavailable');
 ensure(['ES256','RS256','PS256'].includes(header.alg),'Unsupported issuer signature');const publicKey=crypto.createPublicKey({format:'jwk',key});
 ensure(crypto.verify('sha256',Buffer.from(head+'.'+claims),{key:publicKey,...(header.alg==='ES256'?{dsaEncoding:'ieee-p1363'}:{}),...(header.alg==='PS256'?{padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32}:{})},Buffer.from(sig,'base64url')),'Issuer signature failed');
 ensure(payload.exp>now&&payload.iss==='did:web:'+issuer.hostname,'Credential lifetime or issuer differs');ensure(sr2HolderDid(payload.cnf)===did,'Holder key differs');
 if(format.includes('sd-jwt')){ensure(input.configuration,'Supply the pinned configuration for SD-JWT acceptance');sr2VerifySdJwt(credential,input.configuration,{issuer:'did:web:'+issuer.hostname,subject:input.subject,kid:header.kid,holderBinding:{jwk},status:payload.status},{keys:[{...key,kid:header.kid}]});ensure(new URL(payload.status.status_list.uri).origin===issuer.origin,'Status origin differs');return {status:'PASS',format,issuanceProfile:profile,presentationProfiles:[],credentialId:payload.jti,holderDid:did,pcmMobile:'NOT_TESTED'};}
 if(input.archiveAfterIssue){
  const url=expectedIssuer+'/api/v1/tenants/'+input.tenantId+'/credential-configurations/'+input.configurationId;
  const headers={cookie:input.archiveAfterIssue.adminSessionCookie,origin:issuer.origin,'content-type':'application/json'};
  const current=await request(url,{headers});await request(url+'/archive',{method:'POST',headers:{...headers,'if-match':'"'+current.item.version+'"'},body:{}});
  const withdrawn=await request(issuer.origin+'/.well-known/openid-credential-issuer'+issuer.pathname.replace(/\/$/,''));ensure(!withdrawn.credential_configurations_supported?.[id],'Archived configuration remains advertised');
 }
 const statuses=[];
 // The same ephemeral credential can be presented once for each protocol. Each
 // presentation uses a new server nonce/state and an authenticated result check.
 for(const vp of ['oid4vp-draft13','oid4vp-1.0']){
  const api=expectedIssuer+'/api/v1/tenants/'+input.tenantId,headers={'content-type':'application/json',cookie:input.sessionCookie,origin:issuer.origin};
  const started=await request(api+'/presentation-requests',{method:'POST',headers,body:{configurationId:input.configurationId,profile:vp}}),params=new URL(started.requestUri).searchParams;
  const stamp=Math.floor(Date.now()/1000),presentation=sign({typ:'JWT',alg:'ES256',jwk},{iss:did,aud:params.get('client_id'),nonce:params.get('nonce'),iat:stamp,exp:stamp+120,vp:{'@context':['https://www.w3.org/2018/credentials/v1'],type:['VerifiablePresentation'],verifiableCredential:[credential]}});
  const form={state:params.get('state'),vp_token:vp==='oid4vp-1.0'?JSON.stringify({credential:[presentation]}):presentation};
  if(vp==='oid4vp-draft13')form.presentation_submission=JSON.stringify({id:crypto.randomUUID(),definition_id:started.requestId,descriptor_map:[{id:'credential',format:'jwt_vp',path:'$',path_nested:{format:'jwt_vc',path:'$.vp.verifiableCredential[0]'}}]});
  const returned=await request(params.get('response_uri')||params.get('redirect_uri'),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form).toString()});
  const redirect=new URL(returned.redirect_uri);ensure(redirect.origin===issuer.origin,'Unexpected wallet return origin');const code=new URLSearchParams(redirect.hash.split('?')[1]).get('response_code');
  const result=await request(api+'/presentation-requests/'+started.requestId+'/result',{method:'POST',headers,body:{responseCode:code}});ensure(result.status==='verified'&&result.verified===true,'Presentation not verified');statuses.push(vp);
 }
 return {status:'PASS',format,issuanceProfile:profile,presentationProfiles:statuses,...(input.archiveAfterIssue?{archiveAfterIssue:'PASS'}:{}),credentialId:payload.jti||payload.vc?.id,holderDid:did,pcmMobile:'NOT_TESTED'};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){try{const input=JSON.parse(fs.readFileSync(0,'utf8'));ensure(input.syntheticOnly===true,'Synthetic data acknowledgement required');console.log(JSON.stringify(await testWallet(input)));}catch(error){console.error(JSON.stringify({status:'FAIL',code:'PCI-LIVE-WALLET-FAILED',detail:/^(Wallet endpoint HTTP [0-9]+|Unknown issuance profile|Offer issuer differs|No wallet nonce|Issuer signature failed|Presentation not verified)$/.test(error.message)?error.message:'Inspect the synthetic case configuration and matching server error codes.'}));process.exitCode=1;}}
