// Tenant identity configuration. Secrets are rooted in the named Kubernetes
// Secret and copied only to Keycloak's required broker credential store;
// the PCI database and responses contain the public configuration and revision.
function pciIdentityAlias(tenantId){return 'pci-'+String(tenantId);}
function pciIdentityDefault(tenantId){return {version:1,state:'active',mode:'keycloak',alias:pciIdentityAlias(tenantId),displayName:'Organization account',issuer:'',clientId:'',audience:'',scopes:'openid profile email',configured:false};}
async function pciIdentityRead(tenantId,client=getPool()){
  const r=await client.query('SELECT document FROM pci_tenant_identity WHERE tenant_id=$1',[tenantId]);
  return r.rows[0]?.document || pciIdentityDefault(tenantId);
}
function pciIdentityValidate(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['mode','displayName','issuer','clientId','clientSecret','audience','scopes'].includes(k)))throw pciErrors.validation('Unknown identity setting.');
  const mode=input.mode;
  if(!['keycloak','oidc'].includes(mode))throw pciErrors.validation('Choose Keycloak or an OIDC provider.');
  const result={mode,displayName:String(input.displayName||'Organization account').trim()};
  if(result.displayName.length>100||!result.displayName)throw pciErrors.validation('Supply a provider display name.');
  if(mode==='keycloak')return {...result,issuer:'',clientId:'',audience:'',scopes:'openid profile email'};
  const issuer=String(input.issuer||'').replace(/\/$/,'');let u;
  try{u=new URL(issuer);}catch{throw pciErrors.validation('Supply an HTTPS OIDC issuer.');}
  const entra=/^https:\/\/login\.microsoftonline\.com\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/v2\.0$/i.test(issuer);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||(!entra&&!envList('PCI_IDENTITY_ALLOWED_ISSUERS').includes(issuer)))throw pciErrors.validation('Use a tenant-specific Entra issuer or an operator-approved OIDC issuer.');
  const clientId=String(input.clientId||'').trim(),audience=String(input.audience||'').trim(),scopes=String(input.scopes||'').trim();
  if(!clientId||clientId.length>200||!audience||audience.length>200||scopes.length>2000||!['openid','profile','email'].every(s=>scopes.split(/\s+/).includes(s))||/[\r\n]/.test(clientId+audience+scopes))throw pciErrors.validation('Supply client ID, participant audience and openid profile email plus participant API scopes.');
  if(input.clientSecret!==undefined&&(typeof input.clientSecret!=='string'||input.clientSecret.length>4096||/[\r\n]/.test(input.clientSecret)))throw pciErrors.validation('Invalid client secret.');
  return {...result,issuer,clientId,audience,scopes};
}
async function pciIdentityDiscovery(config){
  const d=await requestJson(config.issuer+'/.well-known/openid-configuration',{timeout:10000,maxBytes:262144});
  if(d.issuer!==config.issuer)throw pciErrors.validation('OIDC discovery issuer mismatch.');
  for(const key of ['authorization_endpoint','token_endpoint','jwks_uri']){
    let u;try{u=new URL(d[key]);}catch{throw pciErrors.validation('OIDC discovery is incomplete.');}
    if(u.protocol!=='https:'||u.origin!==new URL(config.issuer).origin||u.username||u.password||u.hash)throw pciErrors.validation('OIDC endpoints must use the approved issuer origin.');
  }
  return d;
}
async function pciIdentitySecret(tenant,config,value){
  const path='/api/v1/namespaces/'+encodeURIComponent(cfg.orceNamespace)+'/secrets/fap-pci-identity',key='tenant-'+tenant.tenant_id;
  for(let attempt=0;attempt<3;attempt++){
    const response=await k8sRequest('GET',path),object=response.data;
    if(response.status!==200||object?.metadata?.labels?.['app.kubernetes.io/part-of']!=='fap-pci')throw pciErrors.dependency('Tenant identity Secret is unavailable. Run the current G0.');
    let prior=null;try{if(object.data?.[key])prior=JSON.parse(Buffer.from(object.data[key],'base64').toString());}catch{throw pciErrors.conflict('Identity Secret entry is invalid.');}
    if(prior&&prior.owner!==tenant.owner_uid)throw pciErrors.conflict('Identity Secret entry belongs to another owner.');
    if(value===undefined)return prior?.issuer===config.issuer&&prior.clientId===config.clientId?prior.secret:null;
    const data={...(object.data||{})};if(value===null)delete data[key];else data[key]=Buffer.from(JSON.stringify({owner:tenant.owner_uid,issuer:config.issuer,clientId:config.clientId,secret:value})).toString('base64');
    const patch=[{op:'test',path:'/metadata/uid',value:object.metadata.uid},{op:'test',path:'/metadata/resourceVersion',value:object.metadata.resourceVersion},{op:'add',path:'/data',value:data}];
    const write=await k8sRequest('PATCH',path,{headers:{'content-type':'application/json-patch+json'},body:JSON.stringify(patch)});
    if(write.status===200)return value;if(write.status!==409&&write.status!==422)throw pciErrors.dependency('Identity Secret update was not acknowledged.');
  }
  throw pciErrors.conflict('Identity Secret changed concurrently. Retry the configuration.');
}
async function pciIdentityProvision(tenant,config,clientSecret){
  const base=`/admin/realms/${encodeURIComponent(cfg.keycloak.realm)}/identity-provider/instances`,path=base+'/'+encodeURIComponent(config.alias);
  const old=await keycloakAdminRaw('GET',path);if(![200,404].includes(old.status))throw pciErrors.dependency('Identity provider could not be read.');
  const previous=old.status===200?JSON.parse(old.text):null;
  if(previous&&(previous.providerId!=='oidc'||previous.config?.['pci.owner']!==tenant.owner_uid))throw pciErrors.conflict('The broker alias has a different owner.');
  if(config.mode==='keycloak'){
    if(previous){const r=await keycloakAdminRaw('DELETE',path);if(![204,404].includes(r.status))throw pciErrors.dependency('Identity provider could not be disabled.');}
    await pciIdentitySecret(tenant,config,null);return;
  }
  const d=await pciIdentityDiscovery(config);
  const secret=clientSecret || await pciIdentitySecret(tenant,config);
  if(clientSecret)await pciIdentitySecret(tenant,config,clientSecret);
  if(!secret||/^\*+$/.test(secret))throw pciErrors.validation('Supply a client secret for this provider.');
  const definition={alias:config.alias,providerId:'oidc',displayName:config.displayName,enabled:true,hideOnLogin:true,trustEmail:false,storeToken:true,addReadTokenRoleOnCreate:true,firstBrokerLoginFlowAlias:'first broker login',config:{'pci.owner':tenant.owner_uid,clientId:config.clientId,clientSecret:secret,clientAuthMethod:'client_secret_post',authorizationUrl:d.authorization_endpoint,tokenUrl:d.token_endpoint,jwksUrl:d.jwks_uri,issuer:config.issuer,validateSignature:'true',useJwksUrl:'true',defaultScope:config.scopes,syncMode:'IMPORT',pkceEnabled:'true',pkceMethod:'S256'}};
  const written=await keycloakAdminRaw(previous?'PUT':'POST',previous?path:base,definition);
  if(![201,204].includes(written.status))throw pciErrors.dependency('Identity provider configuration was not acknowledged. Retry after checking Keycloak.');
  const read=await keycloakAdmin('GET',path);
  if(read.alias!==config.alias||read.config?.issuer!==config.issuer||read.config?.clientId!==config.clientId||read.config?.['pci.owner']!==tenant.owner_uid||read.enabled!==true||read.storeToken!==true)throw pciErrors.dependency('Identity provider readback mismatch.');
}
async function pciIdentityConfigure(tenant,session,input,expected){
  const data=pciIdentityValidate(input),pool=getPool(),client=await pool.connect();let document;
  try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pci:'+tenant.tenant_id]);
    const t=(await client.query('SELECT state FROM tenants WHERE tenant_id=$1 FOR UPDATE',[tenant.tenant_id])).rows[0];
    const member=(await client.query('SELECT enabled,roles FROM tenant_members WHERE tenant_id=$1 AND keycloak_subject=$2',[tenant.tenant_id,session.subject])).rows[0];
    if(t?.state!=='active'||!member?.enabled||!member.roles.includes('participant_tenant_admin'))throw pciErrors.forbidden();
    const previous=await pciIdentityRead(tenant.tenant_id,client);
    if(previous.version!==expected)throw pciErrors.preconditionFailed();
    document={...data,version:previous.version+1,state:'pending',alias:pciIdentityAlias(tenant.tenant_id),configured:data.mode==='oidc'};
    await client.query('INSERT INTO pci_tenant_identity(tenant_id,document) VALUES($1,$2::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET document=EXCLUDED.document',[tenant.tenant_id,JSON.stringify(document)]);
    // Fail closed before any external mutation. Existing native administrator
    // sessions remain available for repair; principal offers must reauthenticate.
    await client.query("UPDATE auth_sessions SET revoked_at=now() WHERE tenant_id=$1 AND NOT roles @> '[\"participant_tenant_admin\"]'::jsonb",[tenant.tenant_id]);
    await client.query("INSERT INTO audit_events(event_type,actor,tenant_id,safe_metadata) VALUES('tenant.identity.requested',$1,$2,$3::jsonb)",['keycloak:'+session.subject,tenant.tenant_id,JSON.stringify({version:document.version,mode:data.mode})]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  // Serialize external mutations with the same tenant lock, then recheck the
  // revision. A superseded request never overwrites a newer broker config.
  const lease=await pool.connect();
  try{
    await lease.query('BEGIN');await lease.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pci:'+tenant.tenant_id]);
    const current=await pciIdentityRead(tenant.tenant_id,lease);
    const tenantState=(await lease.query('SELECT state FROM tenants WHERE tenant_id=$1',[tenant.tenant_id])).rows[0]?.state;
    if(current.version!==document.version||tenantState!=='active')throw pciErrors.conflict('Identity configuration was superseded. Reload settings.');
    await pciIdentityProvision(tenant,document,input.clientSecret);
    document.state='active';
    await lease.query('UPDATE pci_tenant_identity SET document=$2::jsonb WHERE tenant_id=$1',[tenant.tenant_id,JSON.stringify(document)]);
    await lease.query("INSERT INTO audit_events(event_type,actor,tenant_id,safe_metadata) VALUES('tenant.identity.configured',$1,$2,$3::jsonb)",['keycloak:'+session.subject,tenant.tenant_id,JSON.stringify({version:document.version,mode:document.mode})]);
    await lease.query('COMMIT');return document;
  }catch(e){await lease.query('ROLLBACK');throw e;}finally{lease.release();}
}
async function pciIdentityToken(config,accessToken){
  const value=await requestJson(`${cfg.keycloak.internalUrl}/realms/${encodeURIComponent(cfg.keycloak.realm)}/broker/${encodeURIComponent(config.alias)}/token`,{headers:{authorization:'Bearer '+accessToken}});
  const token=value?.access_token,decoded=typeof token==='string'&&token.length<65536?jwt.decode(token,{complete:true}):null;
  if(!decoded?.header?.kid||!['RS256','PS256','ES256'].includes(decoded.header.alg))throw pciErrors.unauthorized();
  const d=await pciIdentityDiscovery(config),keys=await requestJson(d.jwks_uri,{maxBytes:262144});
  const jwk=keys.keys?.find(k=>k.kid===decoded.header.kid&&(!k.alg||k.alg===decoded.header.alg)&&(!k.use||k.use==='sig'));
  if(!jwk||jwk.d||jwk.k)throw pciErrors.unauthorized();
  const claims=jwt.verify(token,crypto.createPublicKey({key:jwk,format:'jwk'}),{algorithms:['RS256','PS256','ES256'],issuer:config.issuer,audience:config.audience,clockTolerance:5});
  if(typeof claims.sub!=='string'||!claims.exp||claims.exp*1000<=Date.now())throw pciErrors.unauthorized();
  return {token,subject:claims.sub,expiresAt:claims.exp*1000,entitlements:[...(Array.isArray(claims.roles)?claims.roles:[]).map(r=>'role:'+r),...(Array.isArray(claims.groups)?claims.groups:[]).map(g=>'group:'+g)].filter(v=>v.length<=200).slice(0,100)};
}
async function pciIdentityAdmit(tenant,claims,tokenSet){
  const pool=getPool(),identity=await pciIdentityRead(tenant.tenant_id),broker=claims.pci_identity_provider;
  if(!broker){
    // Native administrators can always repair identity settings. Principals
    // must use the configured organization provider when it is enabled.
    if(identity.mode==='oidc'&&!roleClaim(claims).includes('participant_tenant_admin')&&!roleClaim(claims).includes('provider_admin'))throw pciErrors.forbidden('Use the organization sign-in.');
    return {roles:roleClaim(claims),identityVersion:identity.version,broker:null};
  }
  if(identity.state!=='active'||identity.mode!=='oidc'||broker!==identity.alias||roleClaim(claims).includes('provider_admin'))throw pciErrors.invalidTenantContext();
  const external=await pciIdentityToken(identity,tokenSet.access_token),client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pci:'+tenant.tenant_id]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pci-identity-user:'+claims.sub]);
    const fresh=await pciIdentityRead(tenant.tenant_id,client);
    if(fresh.version!==identity.version||fresh.state!=='active')throw pciErrors.conflict('Identity settings changed. Sign in again.');
    const foreign=await client.query('SELECT tenant_id FROM tenant_members WHERE keycloak_subject=$1 AND tenant_id<>$2',[claims.sub,tenant.tenant_id]);
    if(foreign.rows.length)throw pciErrors.invalidTenantContext();
    const userPath=`/admin/realms/${encodeURIComponent(cfg.keycloak.realm)}/users/${encodeURIComponent(claims.sub)}`,user=await keycloakAdmin('GET',userPath),assigned=keycloakAttributeValue(user,'tenant_id');
    if(assigned&&assigned!==tenant.tenant_id)throw pciErrors.invalidTenantContext();
    const member=(await client.query('SELECT enabled,roles FROM tenant_members WHERE tenant_id=$1 AND keycloak_subject=$2',[tenant.tenant_id,claims.sub])).rows[0];
    if(member&&!member.enabled)throw pciErrors.forbidden();
    // Never import privileged roles from external claims or enable a disabled
    // membership. Only an existing local membership can confer administration.
    const roles=member?.roles || ['principal'];
    if(!assigned)await keycloakAdmin('PUT',userPath,{...user,attributes:{...user.attributes,tenant_id:[tenant.tenant_id],tenant_slug:[tenant.tenant_slug]}});
    if(!member)await client.query("INSERT INTO tenant_members(tenant_id,keycloak_subject,username,email,first_name,last_name,roles,enabled,updated_at) VALUES($1,$2,$3,$4,$5,$6,'[\"principal\"]'::jsonb,true,now())",[tenant.tenant_id,claims.sub,String(user.username||claims.sub),user.email||null,user.firstName||null,user.lastName||null]);
    await client.query('COMMIT');return {roles,identityVersion:identity.version,broker,external};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function pciIdentityDelete(tenant){
  const config=await pciIdentityRead(tenant.tenant_id);
  await pciIdentityProvision(tenant,{...config,mode:'keycloak'},null);
  await getPool().query('DELETE FROM pci_tenant_identity WHERE tenant_id=$1',[tenant.tenant_id]);
}
