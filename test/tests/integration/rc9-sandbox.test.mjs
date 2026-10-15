import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as url from 'node:url';
import {fixture} from '../../support/sr2-fixture.mjs';
const flows=JSON.parse(fs.readFileSync('dist/fap-pci-flow.json','utf8'));
const captured=JSON.parse(fs.readFileSync('test/fixtures/wellknown-1.5.2-metadata.json','utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
const tid='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222';
const bundle={tenantId:tid,issuer:{issuer:captured.credential_issuer,authorizationServers:captured.authorization_servers,displayName:'Alpha'},configurations:[{id:cid,data:{identifier:'alpha_employee_jwt',name:'Alpha Employee Credential',description:'Synthetic employee credential for functional testing.',format:'jwt_vc_json',credentialTypes:['VerifiableCredential','EmployeeCredential'],claims:[{name:'name',type:'string',required:true}]}}]};
function sandbox(name,injected={}){
 const node=flows.find(n=>n.type==='function'&&n.name===name);assert.ok(node);
 const marker=node.func.lastIndexOf('// '+name+'\n');assert.ok(marker>0);
 const values={PCI_VERIFICATION_TOKEN_PEPPER:'synthetic-pepper',PCI_DATABASE_URL:'postgres://fixture/fixture',PCI_OCM_NAMESPACE:'ocm-wstack',PCI_KEYCLOAK_INTERNAL_URL:'http://keycloak',PCI_KEYCLOAK_PUBLIC_URL:'https://keycloak.example.com'};
 // Built-ins are VM-owned, matching Function-node isolation. In particular,
 // do not inject the host's structuredClone, Object, Array, JSON or constructors.
 const context=vm.createContext({msg:{},url,crypto,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,env:{get:key=>values[key]},...injected});
 assert.equal(vm.runInContext('typeof structuredClone',context),'undefined');
 // Keep the generated application code intact; replace only final HTTP dispatch
 // with test exports so the same native/service code can be invoked explicitly.
 return vm.runInContext('(function(){'+node.func.slice(0,marker)+'\nreturn {pciContains,pciCompleteClaimDisplay,pciNativeMetadata,pciPublicCatalogue,pciPublicJwks,pciWalletMetadata,pciCredentialRequest,pciCredentialResponse,handlePciNative,createSr2Store,createPciNativeAdapters,createSr2Service,pciEvent};})()',context,{filename:`Function node:${node.id} [${name}]`});
}
function nativeAdapter(api,mutate=()=>{},fast=false){
 let metadata,now=0;const calls=[];
 const nats={publish:async(subject,event)=>{calls.push({subject,event});metadata=clone(event.data.issuer);for(const config of Object.values(metadata.credential_configurations_supported))for(const claim of config.credential_metadata.claims)delete claim.display;mutate(metadata);},request:async(subject,event)=>{if(fast)now+=10001;calls.push({subject,event});return api.pciEvent(event.type,{...event.data,Issuer:metadata});}};
 const adapter=api.createPciNativeAdapters({nats,now:()=>now,signerUrl:'http://signer',statusUrl:'http://status',wellKnownUrl:'http://wellknown',readSecret:()=>{},lookup:()=>{},getParticipantToken:()=>{}});
 return {adapter,calls};
}
for(const name of ['M9_PCI-IssuerMetadata','M11_PCI-IssuerRuntime'])test('generated '+name+' completes readback and public labels without host clone globals',async()=>{
 const api=sandbox(name),before=JSON.stringify(captured),expected=api.pciNativeMetadata(bundle,()=>{});
 const completed=api.pciCompleteClaimDisplay(expected,captured);assert.equal(api.pciContains(expected,completed),true);
 const {adapter,calls}=nativeAdapter(api);assert.deepEqual(clone(await adapter.publishMetadata(bundle)),{published:true});
 assert.deepEqual(clone(api.pciPublicCatalogue(bundle,captured)).credential_configurations_supported.alpha_employee_jwt.credential_metadata.claims[0].display,[{name:'name',locale:'en'}]);
 completed.credential_configurations_supported.alpha_employee_jwt.credential_metadata.claims[0].path[0]='changed';assert.equal(JSON.stringify(captured),before);
 assert.equal(calls[0].subject,'wellknown.issuer.registration');assert.equal(calls[1].subject,'wellknown.issuer.metadata');
});
test('sandbox publication success advances observed to desired through the real generated service',async()=>{
 const f=fixture();await f.prepared();const api=sandbox('M11_PCI-IssuerRuntime'),{adapter}=nativeAdapter(api);
 const service=api.createSr2Service({store:f.store,adapters:adapter,pepper:Buffer.from('synthetic-pepper'),issuerUrl:t=>'https://'+t.primary_domain,assetUrl:(t,id)=>'https://'+t.primary_domain+'/assets/'+id});
 const before=await service.publication(f.principal());assert.ok(before.state.desired>0);assert.equal(before.state.observed,0);
 const result=await service.publication(f.principal(),true);assert.equal(result.state,'published');assert.equal(result.observed,result.desired);
});
test('sandbox publication failure keeps observed unchanged for a real claim mismatch',async()=>{
 const f=fixture();await f.prepared();const api=sandbox('M11_PCI-IssuerRuntime'),{adapter}=nativeAdapter(api,metadata=>{Object.values(metadata.credential_configurations_supported)[0].credential_metadata.claims[0].mandatory=false;},true);
 const service=api.createSr2Service({store:f.store,adapters:adapter,pepper:Buffer.from('synthetic-pepper'),issuerUrl:t=>'https://'+t.primary_domain});
 await assert.rejects(service.publication(f.principal(),true),{code:'PCI-METADATA-READBACK'});
 const current=await service.publication(f.principal());assert.equal(current.state.observed,0);assert.equal(current.state.state,'error');
});
test('sandbox public discovery still rejects explicitly conflicting labels and paths',()=>{
 const api=sandbox('M11_PCI-IssuerRuntime');
 for(const mutate of [claim=>{claim.display=[{name:'Wrong',locale:'en'}];},claim=>{claim.path=['credentialSubject','wrong'];},claim=>{claim.mandatory=false;}]){
  const bad=clone(captured);mutate(bad.credential_configurations_supported.alpha_employee_jwt.credential_metadata.claims[0]);assert.throws(()=>api.pciPublicCatalogue(bundle,bad),{code:'PCI-METADATA-PENDING'});
 }
});

test('every generated Function-node body is free of the unsupported host clone global',()=>{
 for(const node of flows.filter(n=>n.type==='function'))assert.doesNotMatch(node.func,/\bstructuredClone\s*\(/,node.name);
});
for(const profile of ['oid4vci-1.0','oid4vci-draft13']){
 test('sandbox wallet serialization preserves '+profile+' metadata and its input',()=>{
  const api=sandbox('M11_PCI-IssuerRuntime');
  const metadata=clone(captured),before=JSON.stringify(metadata);
  const wallet=clone(api.pciWalletMetadata(api.pciPublicCatalogue(bundle,metadata),profile));
  const configuration=wallet.credential_configurations_supported.alpha_employee_jwt;
  assert.equal(wallet.credential_issuer,captured.credential_issuer);
  assert.equal(Object.hasOwn(configuration,'topic'),false);assert.equal(Object.hasOwn(configuration,'schema'),false);
  if(profile==='oid4vci-1.0'){
   assert.equal(wallet.nonce_endpoint,captured.nonce_endpoint);
   assert.deepEqual(configuration.credential_metadata.claims[0].display,[{name:'name',locale:'en'}]);
  }else{
   assert.equal(Object.hasOwn(wallet,'nonce_endpoint'),false);
   assert.equal(Object.hasOwn(configuration,'credential_metadata'),false);
   assert.deepEqual(configuration.credential_definition.credentialSubject.name,{mandatory:true,display:[{name:'name',locale:'en'}]});
  }
  assert.equal(JSON.stringify(metadata),before);
 });
 test('sandbox credential conversion supports '+profile+' without changing the wallet request',()=>{
  const api=sandbox('M11_PCI-IssuerRuntime');
  const request=profile==='oid4vci-1.0'?{credential_configuration_id:'alpha_employee_jwt',proofs:{jwt:['synthetic-proof']}}:{format:'jwt_vc_json',credential_definition:{type:['EmployeeCredential','VerifiableCredential']},proof:{proof_type:'jwt',jwt:'synthetic-proof'}};
  const before=JSON.stringify(request),definitions={alpha_employee_jwt:{format:'jwt_vc_json',credential_definition:{type:['VerifiableCredential','EmployeeCredential']}}};
  const converted=api.pciCredentialRequest(request,profile,definitions);
  assert.deepEqual(clone(converted),{credential_configuration_id:'alpha_employee_jwt',proofs:{jwt:['synthetic-proof']}});
  assert.equal(JSON.stringify(request),before);
  assert.throws(()=>api.pciCredentialRequest({...request,credential_response_encryption:{}},profile,definitions));
  if(profile==='oid4vci-1.0')assert.throws(()=>api.pciCredentialRequest({...request,format:'jwt_vc_json'},profile,definitions));
  else assert.throws(()=>api.pciCredentialRequest(request,profile,{...definitions,duplicate:definitions.alpha_employee_jwt}));
 });
}

// Run the entire generated public handler, including rate limiting, catalogue
// completion, profile conversion and HTTP response emission. Only PostgreSQL
// and native HTTP/NATS boundary objects are fixtures; helper code is unchanged.
function publicHandler({profile='oid4vci-1.0',kind='issuer',empty=false,mutate=()=>{},nativePayload}={}){
 const name='M11_PCI-IssuerRuntime',generated=flows.find(n=>n.name===name&&n.type==='function');
 const buildId=generated.func.match(/buildId='([a-f0-9]+)'/)[1];
 const tenant={tenant_id:tid,tenant_slug:'alpha',primary_domain:'alpha-pci.example.com',state:'active'};
 const metadata={...bundle.issuer,profile,did:'did:web:alpha-pci.example.com',tokenKeyRef:'preauth'};
 const queryLog=[],calls=[],errors=[];
 async function query(sql,args=[]){
  queryLog.push({sql,args});
  if(sql.startsWith('SELECT * FROM tenants'))return {rows:[tenant]};
  if(sql.includes("r.kind='metadata'"))return {rows:[{snapshot:metadata}]};
  if(sql.includes("r.kind='configuration'"))return {rows:empty?[]:bundle.configurations.map(c=>({resource_id:c.id,snapshot:clone(c.data)}))};
  if(sql.startsWith('INSERT INTO pci_rate_limits'))return {rows:[{count:1}]};
  if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory|DELETE FROM pci_rate_limits)/.test(sql))return {rows:[]};
  throw new Error('Unexpected SQL fixture boundary: '+sql);
 }
 const pool={query,connect:async()=>({query,release(){}})};
 const req={method:['credential','token','nonce'].includes(kind)?'POST':'GET',headers:{host:tenant.primary_domain,'x-pci-tenant-id':tid,'x-pci-tenant-slug':'alpha','x-pci-tenant-domain':tenant.primary_domain,'content-type':'application/json'},rawHeaders:[],originalUrl:'/pci-orce/.well-known/openid-credential-issuer'};
 const msg={pciTransport:'http',req};
 if(kind==='credential')msg.payload=profile==='oid4vci-1.0'?{credential_configuration_id:'alpha_employee_jwt',proofs:{jwt:['synthetic-proof']}}:{format:'jwt_vc_json',credential_definition:{type:['VerifiableCredential','EmployeeCredential']},proof:{proof_type:'jwt',jwt:'synthetic-proof'}};
 const api=sandbox(name,{msg,pg:{Pool:class {constructor(){return pool;}}},global:{get(){},set(){}},node:{error:value=>errors.push(value),warn:value=>errors.push(value)}});
 msg.pciAction='native.'+kind;
 const native=clone(nativePayload ?? captured);mutate(native);const nativeBefore=JSON.stringify(native);
 pool.pciNative={buildId,nats:{close(){}},metrics:new Map(),service:{store:api.createSr2Store(pool)},transport:{urls:{preAuth:'http://pre-authorization-bridge-service.ocm-wstack.svc.cluster.local:8080',signer:'http://signer.ocm-wstack.svc.cluster.local:8080',wellKnown:'http://well-known-service.ocm-wstack.svc.cluster.local:8080',issuance:'http://issuance-service.ocm-wstack.svc.cluster.local:8080'},http:async(address,options)=>{
  calls.push({address,options});const data=kind==='credential'?{credentials:[{credential:'synthetic-credential'}]}:native;
  return {status:200,data,raw:Buffer.from(JSON.stringify(data)),headers:{'content-type':'application/json'}};
 }}};
 return {api,msg,calls,queryLog,errors,native,nativeBefore};
}
for(const profile of ['oid4vci-1.0','oid4vci-draft13']){
 test('generated public issuer handler emits HTTP 200 for '+profile+' without host clone globals',async()=>{
  const f=publicHandler({profile}),result=await f.api.handlePciNative();
  assert.equal(result[0],f.msg);assert.equal(f.msg.statusCode,200,JSON.stringify(f.msg.payload));
  assert.equal(f.msg.headers['cache-control'],'no-store');
  const metadata=JSON.parse(f.msg.payload.toString());assert.equal(metadata.credential_issuer,bundle.issuer.issuer);
  assert.equal(Object.keys(metadata.credential_configurations_supported).join(','),'alpha_employee_jwt');
  assert.equal(f.calls.length,1);assert.ok(f.calls[0].address.endsWith('/v1/tenants/'+tid+'/.well-known/openid-credential-issuer'));
  assert.equal(f.calls[0].options.headers['x-tenantid'],tid);assert.equal(f.errors.length,0);
  assert.equal(JSON.stringify(f.native),f.nativeBefore);assert.ok(f.queryLog.some(q=>q.sql.startsWith('INSERT INTO pci_rate_limits')));
 });
 test('generated public credential handler forwards converted '+profile+' proof and serializes response',async()=>{
  const f=publicHandler({profile,kind:'credential'}),before=JSON.stringify(f.msg.payload);
  await f.api.handlePciNative();assert.equal(f.msg.statusCode,200,JSON.stringify(f.msg.payload));
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'POST');
  assert.deepEqual(clone(f.calls[0].options.body),{credential_configuration_id:'alpha_employee_jwt',proofs:{jwt:['synthetic-proof']}});
  assert.equal(f.calls[0].options.headers['x-tenantid'],tid);
  assert.deepEqual(JSON.parse(f.msg.payload.toString()),profile==='oid4vci-draft13'?{credential:'synthetic-credential'}:{credentials:[{credential:'synthetic-credential'}]});
  assert.equal(f.errors.length,0);assert.ok(before.includes('synthetic-proof'));
 });
}
test('generated token handler supplies the credential endpoint used as the access-token audience',async()=>{
 const payload={access_token:'synthetic-access-token',token_type:'Bearer',authorization_details:[{type:'openid_credential',credential_configuration_id:'alpha_employee_jwt',credential_identifiers:['request-dataset']}]};
 const f=publicHandler({kind:'token',nativePayload:payload});
 f.msg.req.headers['content-type']='application/x-www-form-urlencoded';
 f.msg.payload={grant_type:'urn:ietf:params:oauth:grant-type:pre-authorized_code','pre-authorized_code':'synthetic-code',client_id:'test-wallet'};
 await f.api.handlePciNative();assert.equal(f.msg.statusCode,200,JSON.stringify(f.msg.payload));
 assert.equal(f.calls.length,1);
 const call=f.calls[0],issuer=bundle.issuer.issuer;
 assert.equal(call.address,'http://pre-authorization-bridge-service.ocm-wstack.svc.cluster.local:8080/token');
 assert.equal(call.options.method,'POST');
 assert.equal(call.options.headers['x-credentialendpoint'],issuer+'/api/credential');
 assert.equal(call.options.headers['x-audience-url'],issuer);
 assert.equal(call.options.headers['x-tokenendpoint'],issuer+'/api/auth/token');
 assert.equal(call.options.headers['x-tenantid'],tid);
 assert.equal(new URLSearchParams(call.options.body).get('pre-authorized_code'),'synthetic-code');
 assert.deepEqual(JSON.parse(f.msg.payload.toString()),payload);
});
test('generated credential handler preserves an authorized native dataset identifier and issuer proof audience',async()=>{
 const f=publicHandler({kind:'credential'});
 f.msg.payload={credential_identifier:'request-dataset',proofs:{jwt:['synthetic-proof']}};
 await f.api.handlePciNative();assert.equal(f.msg.statusCode,200,JSON.stringify(f.msg.payload));
 assert.deepEqual(clone(f.calls[0].options.body),{credential_identifier:'request-dataset',proofs:{jwt:['synthetic-proof']}});
 assert.equal(f.calls[0].options.headers['x-audience-url'],bundle.issuer.issuer);
 assert.equal(f.calls[0].options.headers['x-credentialendpoint'],bundle.issuer.issuer+'/api/credential');
});
test('generated public issuer handler serializes an empty local catalogue without contacting OCM',async()=>{
 const f=publicHandler({empty:true});await f.api.handlePciNative();assert.equal(f.msg.statusCode,200,JSON.stringify(f.msg.payload));
 assert.deepEqual(clone(f.msg.payload.credential_configurations_supported),{});assert.equal(f.calls.length,0);
});
test('generated public issuer handler rejects foreign tenant context before native HTTP forwarding',async()=>{
 const f=publicHandler();f.msg.req.headers['x-pci-tenant-id']='foreign-tenant';await f.api.handlePciNative();
 assert.equal(f.msg.statusCode,404);assert.equal(f.calls.length,0);
});
test('generated public issuer handler keeps substantive claim mismatches closed',async()=>{
 const f=publicHandler({mutate:native=>{native.credential_configurations_supported.alpha_employee_jwt.credential_metadata.claims[0].mandatory=false;}});
 await f.api.handlePciNative();assert.equal(f.msg.statusCode,503);assert.equal(f.calls.length,1);assert.equal(f.msg.payload.status,503);
});

for(const name of ['preauth','issuer'])test('generated public JWKS verifies a signed '+name+' JWT by exact DID key ID',async()=>{
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const key={...pair.publicKey.export({format:'jwk'}),kid:name,alg:'ES256'};
 const f=publicHandler({kind:'jwks',nativePayload:{keys:[key]}});
 await f.api.handlePciNative();assert.equal(f.msg.statusCode,200,JSON.stringify(f.msg.payload));
 const jwks=JSON.parse(f.msg.payload.toString()),kid='did:web:alpha-pci.example.com#'+name;
 const header={alg:'ES256',kid},claims={iss:bundle.issuer.issuer,aud:bundle.issuer.issuer,exp:Math.floor(Date.now()/1000)+60};
 const signingInput=[header,claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const signature=crypto.sign('sha256',Buffer.from(signingInput),{key:pair.privateKey,dsaEncoding:'ieee-p1363'});
 // Select by full ID exactly, matching the native Go verifier; no fragment fallback.
 const published=jwks.keys.find(key=>key.kid===header.kid);assert.ok(published);
 assert.equal(crypto.verify('sha256',Buffer.from(signingInput),{key:crypto.createPublicKey({key:published,format:'jwk'}),dsaEncoding:'ieee-p1363'},signature),true);
 assert.equal(f.calls[0].options.headers['x-issuerkid'],'did:web:alpha-pci.example.com#preauth');
 assert.equal(f.calls[0].options.headers['x-group'],tid);
 assert.equal(f.msg.headers['cache-control'],'public, max-age=60');
 assert.equal(JSON.stringify(f.native),f.nativeBefore);assert.equal(f.errors.length,0);
 assert.equal(crypto.verify('sha256',Buffer.from(signingInput+'tampered'),{key:crypto.createPublicKey({key:published,format:'jwk'}),dsaEncoding:'ieee-p1363'},signature),false);
});

test('generated JWKS preserves already qualified tenant IDs and an empty key set',async()=>{
 const qualified={kty:'EC',kid:'did:web:alpha-pci.example.com#preauth',crv:'P-256',x:'synthetic-x',y:'synthetic-y'};
 const f=publicHandler({kind:'jwks',nativePayload:{keys:[qualified]}});await f.api.handlePciNative();
 assert.equal(f.msg.statusCode,200);assert.deepEqual(JSON.parse(f.msg.payload.toString()),{keys:[qualified]});
 const empty=publicHandler({kind:'jwks',nativePayload:{keys:[]}});await empty.api.handlePciNative();
 assert.equal(empty.msg.statusCode,200);assert.deepEqual(JSON.parse(empty.msg.payload.toString()),{keys:[]});
});

for(const [reason,payload] of [
 ['foreign DID',{keys:[{kty:'EC',kid:'did:web:beta-pci.example.com#preauth'}]}],
 ['duplicate canonical ID',{keys:[{kty:'EC',kid:'preauth'},{kty:'EC',kid:'did:web:alpha-pci.example.com#preauth'}]}],
 ['private material',{keys:[{kty:'EC',kid:'preauth',d:'synthetic-private-material'}]}],
 ['malformed native set',{}],
 ['symmetric secret',{keys:[{kty:'oct',kid:'preauth',k:'synthetic-secret'}]}]
])test('generated public JWKS rejects '+reason+' without publishing native material',async()=>{
 const f=publicHandler({kind:'jwks',nativePayload:payload});await f.api.handlePciNative();
 assert.equal(f.msg.statusCode,502);assert.equal(f.msg.payload.code,'PCI-JWKS-INVALID');
 assert.equal(Object.hasOwn(f.msg.payload,'keys'),false);
 assert.equal(JSON.stringify(f.msg.payload).includes('synthetic-private-material'),false);
});

test('public key IDs remain tenant-specific for identical key names',()=>{
 const api=sandbox('M11_PCI-IssuerRuntime'),key={kty:'EC',kid:'preauth'};
 assert.equal(api.pciPublicJwks({keys:[key]},'did:web:beta-pci.example.com').keys[0].kid,'did:web:beta-pci.example.com#preauth');
 assert.equal(api.pciPublicJwks({keys:[key]},'did:web:alpha-pci.example.com').keys[0].kid,'did:web:alpha-pci.example.com#preauth');
 assert.equal(key.kid,'preauth');
});
