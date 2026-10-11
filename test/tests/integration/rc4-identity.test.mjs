import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync('backend/functions/_identity.js','utf8'),tid='11111111-1111-4111-8111-111111111111';
function fixture(overrides={}){
 const calls=[],state={provider:null,document:null,member:null,secret:{metadata:{uid:'identity-secret',resourceVersion:'1',labels:{'app.kubernetes.io/part-of':'fap-pci'}},data:{}}};
 const errors=Object.fromEntries(['validation','dependency','conflict','forbidden','invalidTenantContext','unauthorized','preconditionFailed'].map(name=>[name,message=>Object.assign(Error(message||name),{code:name})]));
 const pool={connect:async()=>({...pool,release(){}}),query:async(sql,args)=>{calls.push({sql,args});
  if(sql.startsWith('SELECT document'))return {rows:state.document?[{document:state.document}]:[]};
  if(sql.startsWith('SELECT state'))return {rows:[{state:'active'}]};
  if(sql.startsWith('SELECT enabled'))return {rows:state.member?[state.member]:[]};
  if(sql.startsWith('SELECT tenant_id'))return {rows:state.foreign?[{tenant_id:'foreign'}]:[]};
  if(sql.startsWith('INSERT INTO pci_tenant_identity')||sql.startsWith('UPDATE pci_tenant_identity'))state.document=JSON.parse(args[1]);
  return {rows:[]};
 }};
 const env={k8sRequest:async(method,path,options)=>{if(method==='PATCH')state.secret.data=JSON.parse(options.body).at(-1).value;return {status:200,data:structuredClone(state.secret)};},cfg:{orceNamespace:'pci',keycloak:{realm:'pci',publicUrl:'https://identity.example.com',internalUrl:'https://identity.example.com'}},getPool:()=>pool,pciErrors:errors,envList:()=>['https://idp.example.com/realm'],URL,
 requestJson:async url=>({issuer:'https://idp.example.com/realm',authorization_endpoint:'https://idp.example.com/auth',token_endpoint:'https://idp.example.com/token',jwks_uri:'https://idp.example.com/keys'}),
 keycloakAdminRaw:async(method,path,body)=>{calls.push({method,path,body});if(method==='GET')return state.provider?{status:200,text:JSON.stringify(state.provider)}:{status:404};if(method==='PUT'||method==='POST'){state.provider=body;return {status:204};}if(method==='DELETE'){state.provider=null;return {status:204};}},
 keycloakAdmin:async()=>state.provider,roleClaim:c=>c.realm_access?.roles||[],keycloakAttributeValue:(u,k)=>u.attributes?.[k]?.[0],...overrides};
 const api=new Function(...Object.keys(env),source+'\nreturn {read:pciIdentityRead,validate:pciIdentityValidate,configure:pciIdentityConfigure,admit:pciIdentityAdmit,discovery:pciIdentityDiscovery};')(...Object.values(env));
 return {api,state,calls};
}
const input={mode:'oidc',displayName:'Alpha',issuer:'https://idp.example.com/realm',clientId:'client',audience:'participant-data',scopes:'openid profile email credential:issue',clientSecret:'synthetic-write-only-value'};
test('identity endpoints reject unknown keys, non-HTTPS and unapproved issuers',()=>{
 const f=fixture();assert.equal(f.api.validate(input).issuer,input.issuer);assert.equal(f.api.validate(input).clientSecret,undefined);
 for(const patch of [{issuer:'http://idp.example.com/realm'},{issuer:'https://localhost'},{alias:'other-tenant'},{issuer:'https://idp.example.com/realm#evil'},{scopes:'openid'},{clientSecret:'bad\nsecret'}])assert.throws(()=>f.api.validate({...input,...patch}));
 assert.ok(f.api.validate({...input,issuer:'https://login.microsoftonline.com/'+tid+'/v2.0'}));
});
test('tenant configuration is versioned, read back and never persists/returns the client secret',async()=>{
 const f=fixture();f.state.member={enabled:true,roles:['participant_tenant_admin']};
 const result=await f.api.configure({tenant_id:tid,owner_uid:'owner'},{subject:'admin'},input,1);
 assert.equal(result.state,'active');assert.equal(result.version,2);assert.equal(result.alias,'pci-'+tid);
 assert.equal(JSON.stringify(result).includes(input.clientSecret),false);
 assert.equal(JSON.stringify(f.calls.filter(c=>c.sql)).includes(input.clientSecret),false);
 assert.equal(f.state.provider.config.clientSecret,input.clientSecret);assert.equal(f.state.provider.hideOnLogin,true);
 await assert.rejects(f.api.configure({tenant_id:tid,owner_uid:'owner'},{subject:'admin'},input,1),{code:'preconditionFailed'});
 await f.api.configure({tenant_id:tid,owner_uid:'owner'},{subject:'admin'},{mode:'keycloak',displayName:'Local'},2);assert.equal(f.state.provider,null);
});
test('failed broker write leaves a pending durable revision and retry retains ownership checks',async()=>{
 const f=fixture({keycloakAdminRaw:async(method)=>method==='GET'?{status:404}:{status:503}});f.state.member={enabled:true,roles:['participant_tenant_admin']};
 await assert.rejects(f.api.configure({tenant_id:tid,owner_uid:'owner'},{subject:'admin'},input,1),{code:'dependency'});
 assert.equal(f.state.document.state,'pending');assert.equal(f.state.document.version,2);
 const foreign=fixture();foreign.state.member=f.state.member;foreign.state.provider={providerId:'oidc',config:{'pci.owner':'someone-else'}};
 await assert.rejects(foreign.api.configure({tenant_id:tid,owner_uid:'owner'},{subject:'admin'},input,1),{code:'conflict'});
 assert.equal(foreign.calls.some(c=>['POST','PUT','DELETE'].includes(c.method)),false);
});
test('cross-tenant brokers and brokered provider admins cannot be admitted',async()=>{
 const f=fixture();f.state.document={...input,clientSecret:undefined,alias:'pci-'+tid,version:2,state:'active'};
 await assert.rejects(f.api.admit({tenant_id:tid},{sub:'alice',pci_identity_provider:'pci-other'},{}),{code:'invalidTenantContext'});
 await assert.rejects(f.api.admit({tenant_id:tid},{sub:'alice',pci_identity_provider:'pci-'+tid,realm_access:{roles:['provider_admin']}},{}),{code:'invalidTenantContext'});
 await assert.rejects(f.api.admit({tenant_id:tid},{sub:'alice',realm_access:{roles:['principal']}},{}),{code:'forbidden'});
 assert.deepEqual((await f.api.admit({tenant_id:tid},{sub:'admin',realm_access:{roles:['participant_tenant_admin']}},{})).roles,['participant_tenant_admin']);
});
test('discovery cannot redirect token traffic or JWKS to another origin',async()=>{
 const f=fixture({requestJson:async()=>({issuer:input.issuer,authorization_endpoint:'https://idp.example.com/auth',token_endpoint:'https://evil.example.com/token',jwks_uri:'https://idp.example.com/keys'})});
 await assert.rejects(f.api.discovery(input),{code:'validation'});
});
