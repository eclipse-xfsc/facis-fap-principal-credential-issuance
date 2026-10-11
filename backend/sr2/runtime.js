// Node-RED glue. Runtime state lives on the process-owned pg Pool object;
// tokens are never written to Node-RED's configurable persistent context.
function pciRuntime(){
  const pool=getPool(),buildId='__PCI_SR2_BUILD_ID__';if(pool.pciNative?.buildId===buildId)return pool.pciNative;if(pool.pciNative){pool.pciNative.nats.close();delete pool.pciNative;}
  const transport=pciNativeTransport({env:envValue,namespace:cfg.ocmNamespace,services:cfg.ocmServices,readFile:file=>fs.readFileSync(file)});
  const nats=new PciNats({handshakeFirst:envBool('PCI_NATS_TLS_HANDSHAKE_FIRST',false),tls:transport.natsTls,url:envValue('PCI_NATS_URL',`nats://nats.${cfg.infrastructureNamespace}.svc.cluster.local:4222`),user:envValue('PCI_NATS_USER'),password:envValue('PCI_NATS_PASSWORD'),token:envValue('PCI_NATS_TOKEN')});
  const runtime={buildId,nats,transport,subscription:null,connecting:null,metrics:new Map(),nonces:new Map()};
  runtime.adapters=createPciNativeAdapters({nats,http:transport.http,emptyCatalogue:envValue('PCI_OCM_EMPTY_CATALOGUE_SUPPORTED')==='true',consumeWalletNonce:(tenantId,nonce)=>{const key=tenantId+':'+crypto.createHash('sha256').update(nonce).digest('hex'),expires=runtime.nonces.get(key);runtime.nonces.delete(key);return expires>Date.now();},namespace:cfg.orceNamespace,cryptoNamespace:cfg.ocmNamespace,signerUrl:transport.urls.signer,wellKnownUrl:transport.urls.wellKnown,statusUrl:transport.urls.status,signerTopic:envValue('PCI_SIGNER_TOPIC','signer-topic'),statusTopic:envValue('PCI_STATUS_TOPIC','status.data'),approvedPrivateAddresses:envList('PCI_PARTICIPANT_PRIVATE_ADDRESSES'),allowedJwtIssuers:envList('PCI_PARTICIPANT_JWT_ISSUERS',[`${cfg.keycloak.publicUrl}/realms/${cfg.keycloak.realm}`]),lookup:(host,options)=>dns.promises.lookup(host,options),
    approveJwtIssuer:async t=>{const identity=await pciIdentityRead(t.r.tenantId),token=pciSessionTokens().get(t.principal.sessionId);return identity.state==='active'&&identity.mode==='oidc'&&identity.issuer===t.connector.jwtIssuer&&identity.audience===t.connector.jwtAudience&&token?.broker===identity.alias&&token.identityVersion===identity.version;},
    validateSession:async principal=>{const token=pciSessionTokens().get(principal.sessionId),identity=await pciIdentityRead(principal.tenantId);const active=(await getPool().query('SELECT session_id FROM auth_sessions WHERE session_id=$1 AND revoked_at IS NULL AND expires_at>now()',[principal.sessionId])).rows.length;return Boolean(active&&token&&token.expiresAt>Date.now()&&identity.state==='active'&&token.identityVersion===identity.version);},
    readSecret:async name=>{const ca=fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'),token=fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token','utf8').trim();const r=await pciHttp(`https://${envValue('KUBERNETES_SERVICE_HOST')}:${envValue('KUBERNETES_SERVICE_PORT_HTTPS','443')}/api/v1/namespaces/${encodeURIComponent(cfg.orceNamespace)}/secrets/${encodeURIComponent(name)}`,{headers:{authorization:'Bearer '+token},tlsOptions:{ca},maxBytes:262144});if(r.status!==200)throw new Sr2Error(503,'PCI-PARTICIPANT-SECRET','Participant trust material is unavailable.');return r.data;},
    getParticipantToken:async(principal,connector)=>{const token=pciSessionTokens().get(principal.sessionId);if(!token || token.expiresAt<=Date.now())throw new Sr2Error(401,'PCI-REAUTHENTICATE','Sign in again to refresh participant authentication.');
      const configured=await pciIdentityRead(principal.tenantId);
      if(configured.state!=='active'||token.identityVersion!==configured.version)throw new Sr2Error(401,'PCI-REAUTHENTICATE','Identity settings changed. Sign in again.');
      if(connector.jwtIssuer===`${cfg.keycloak.publicUrl}/realms/${cfg.keycloak.realm}`)return token;
      const identity=await pciIdentityRead(principal.tenantId);
      if(identity.state!=='active'||identity.mode!=='oidc'||identity.issuer!==connector.jwtIssuer||identity.audience!==connector.jwtAudience||token.broker!==identity.alias||token.identityVersion!==identity.version)throw new Sr2Error(403,'PCI-IDP-ISSUER','Sign in through this tenant’s configured provider.');
      const external=await pciIdentityToken(identity,token.token);return {...external,expiresAt:Math.min(token.expiresAt,external.expiresAt)};
    }});
  runtime.service=extendSr2Maintenance(extendSr2Issuance(createSr2Service({store:createSr2Store(pool),adapters:runtime.adapters,pepper:cfg.verificationPepper,allowedHosts:envList('PCI_PARTICIPANT_ALLOWED_HOSTS',[]),issuerUrl:t=>publicUrl(t.primary_domain,'',cfg.orceBasePath).replace(/\/$/,''),assetUrl:(t,id)=>publicUrl(t.primary_domain,`/api/v1/public/assets/${id}`,cfg.orceBasePath)})));
  extendSr2Presentation(runtime.service);
  pool.pciNative=runtime;return runtime;
}
async function pciListen(){
  const rt=pciRuntime();if(rt.subscription && rt.nats.ready)return;if(rt.connecting)return rt.connecting;
  rt.connecting=(async()=>{await rt.nats.connect();rt.subscription=await rt.nats.subscribe('fap.pci.*.*.issue',async(bytes,reply)=>{
    if(!reply)return;let event,request,invocation,stage='callback-authentication';const started=Date.now();
    try{event=JSON.parse(bytes);request=event.data;invocation=await rt.adapters.authenticateCallback({input:event,tenantId:request.tenant_id});stage='credential-completion';const result=await rt.service.complete(invocation.principal,invocation.requestId,invocation.participantJwt,invocation.holderBinding);await rt.nats.publish(reply,pciEvent(event.type,{...sr2CommonRequest(request.tenant_id,request.request_id,request.group_id),error:null,Credential:result.format==='ldp_vc'?JSON.parse(result.credential):result.credential,Format:result.format}));pciObserve('issuance','ok',started);
    }catch(e){pciObserve('issuance',e.code || 'PCI-CALLBACK-FAILED',started);if(request?.tenant_id && request?.request_id){await rt.nats.publish(reply,pciEvent(event?.type || 'fap.pci.error',{...sr2CommonRequest(String(request.tenant_id).slice(0,200),String(request.request_id).slice(0,200)),error:{status:e.status || 500,id:'PCI-ISSUANCE-FAILED',msg:'Issuance could not be completed.'}})).catch(()=>{});}node.warn(JSON.stringify({event:'pci.issuance.failed',code:e.code || 'PCI-CALLBACK-FAILED',stage}));}
    finally{if(invocation)rt.adapters.release(invocation.requestId);invocation=null;event=null;request=null;}
  },()=>{rt.subscription=null;});})();try{return await rt.connecting;}finally{rt.connecting=null;}
}
function pciObserve(operation,outcome,started){const rt=pciRuntime(),key=operation+':'+(outcome==='ok'?'ok':'error'),entry=rt.metrics.get(key)||{count:0,seconds:0};entry.count++;entry.seconds+=(Date.now()-started)/1000;rt.metrics.set(key,entry);
  const endpoint=envValue('PCI_OTLP_HTTP_ENDPOINT');if(!endpoint)return;
  // Telemetry cannot change the result of an issuance or administrative action.
  let tlsOptions={};try{const caFile=envValue('PCI_OTLP_CA_FILE');if(caFile)tlsOptions.ca=fs.readFileSync(caFile);}catch{node.warn(JSON.stringify({event:'pci.telemetry.failed',code:'PCI-TELEMETRY-CA'}));return;}
  const nanos=t=>String(BigInt(t)*1000000n);const span={traceId:crypto.randomBytes(16).toString('hex'),spanId:crypto.randomBytes(8).toString('hex'),name:'pci.'+operation,kind:1,startTimeUnixNano:nanos(started),endTimeUnixNano:nanos(Date.now()),attributes:[{key:'pci.outcome',value:{stringValue:outcome==='ok'?'ok':'error'}}],status:{code:outcome==='ok'?1:2}};
  pciHttp(endpoint.replace(/\/$/,'')+'/v1/traces',{method:'POST',headers:{'content-type':'application/json'},tlsOptions,body:{resourceSpans:[{resource:{attributes:[{key:'service.name',value:{stringValue:'fap-pci'}},{key:'service.version',value:{stringValue:cfg.version}}]},scopeSpans:[{scope:{name:'fap-pci'},spans:[span]}]}]},timeout:1000}).catch(()=>{});
}
async function handlePciNative(){
  const started=Date.now();try{
    const h=requestHeaders(),seen=new Set();for(let i=0;i<(msg.req.rawHeaders || []).length;i+=2){const key=String(msg.req.rawHeaders[i]).toLowerCase();if(['host','x-forwarded-host','x-pci-tenant-id','x-pci-tenant-slug','x-pci-tenant-domain','authorization','content-type'].includes(key)){if(seen.has(key))throw pciErrors.invalidTenantContext();seen.add(key);}}
    const host=routedHost(),pool=getPool(),t=(await pool.query("SELECT * FROM tenants WHERE primary_domain=$1",[host])).rows[0];if(!t || h['x-pci-tenant-id']!==t.tenant_id || h['x-pci-tenant-domain']!==host || h['x-pci-tenant-slug']!==t.tenant_slug)throw pciErrors.notFound();
    const row=(await pool.query("SELECT v.snapshot FROM pci_issuer_resources r JOIN pci_issuer_versions v ON v.tenant_id=r.tenant_id AND v.kind=r.kind AND v.resource_id=r.resource_id AND v.version=(r.document->>'activeVersion')::integer WHERE r.tenant_id=$1 AND r.kind='metadata'",[t.tenant_id])).rows[0];if(!row)throw pciErrors.notFound();const m=row.snapshot,p=params(),kind=String(msg.pciAction).slice('native.'.length),tid=encodeURIComponent(t.tenant_id),base=m.issuer;
    if(t.state!=='active')throw pciErrors.notFound();
    const urls={issuer:[cfg.ocmServices.wellKnown,`/v1/tenants/${tid}/.well-known/openid-credential-issuer`],authorization:[cfg.ocmServices.preAuth,'/.well-known/openid-configuration'],token:[cfg.ocmServices.preAuth,'/token'],nonce:[cfg.ocmServices.credentialIssuance,`/v1/tenants/${tid}/nonce`],credential:[cfg.ocmServices.credentialIssuance,`/v1/tenants/${tid}/credential`],did:[cfg.ocmServices.signer,'/v1/did/document'],jwks:[cfg.ocmServices.signer,'/v1/jwks'],status:['status-list-service',`/v1/tenants/${tid}/status/${encodeURIComponent(p.listId || '')}`]};const target=urls[kind];if(!target || kind==='status' && (!/^\d+$/.test(p.listId) || p.statusTenant!==t.tenant_id))throw pciErrors.notFound();
    // Rate-limit native public operations before forwarding (no body/token logs).
    await pciRuntime().service.store.transaction(t.tenant_id,tx=>tx.rate('native:'+kind,Math.floor(Date.now()/60000),['credential','token'].includes(kind)?60:600));
    const headers={'x-namespace':cfg.ocmNamespace,'x-tenantid':t.tenant_id,'x-group':t.tenant_id,'x-groupid':'','x-origin':base,'x-host':host,'x-did':m.did,'x-engine':'transit','x-key':m.tokenKeyRef || 'preauth','x-issuerkid':m.did+'#'+(m.tokenKeyRef || 'preauth'),'x-signerkey':m.tokenKeyRef || 'preauth','x-issuer':base,'x-audience-url':base,'x-jwks-url':base+'/.well-known/jwks.json','x-tokenendpoint':base+'/api/auth/token','content-type':h['content-type'] || 'application/json',accept:h.accept || 'application/json',...(h.authorization?{authorization:h.authorization}:{})};
    let body=['POST'].includes(msg.req.method)?msg.payload:undefined;if(body && String(headers['content-type']).startsWith('application/x-www-form-urlencoded') && typeof body==='object')body=new URLSearchParams(body).toString();if(body && Buffer.byteLength(typeof body==='string'?body:JSON.stringify(body))>131072)throw new Sr2Error(413,'PCI-NATIVE-SIZE','Request too large.');
    let publicConfigurations;
    if(kind==='credential'||kind==='issuer'){const configs=await pool.query("SELECT r.resource_id, v.snapshot FROM pci_issuer_resources r JOIN pci_issuer_versions v ON v.tenant_id=r.tenant_id AND v.kind=r.kind AND v.resource_id=r.resource_id AND v.version=(r.document->>'activeVersion')::integer WHERE r.tenant_id=$1 AND r.kind='configuration' AND r.document->>'state'<>'archived'",[t.tenant_id]);const definitions=Object.fromEntries(configs.rows.map(({snapshot:c})=>[c.identifier,{format:c.format,vct:c.vct,credential_definition:{type:c.credentialTypes}}]));if(kind==='credential')body=pciCredentialRequest(body,m.profile,definitions);else publicConfigurations=configs.rows.map(({snapshot,resource_id})=>({id:resource_id,data:snapshot}));}
    const catalogueBundle={tenantId:t.tenant_id,issuer:m,configurations:publicConfigurations};
    if(kind==='issuer'&&!publicConfigurations.length)return emit(200,pciWalletMetadata(pciPublicCatalogue(catalogueBundle,null),m.profile),{'content-type':'application/json','cache-control':'no-store'});
    const transport=pciRuntime().transport,role={issuer:'wellKnown',authorization:'preAuth',token:'preAuth',nonce:'issuance',credential:'issuance',did:'signer',jwks:'signer',status:'status'}[kind];
    const response=await transport.http(transport.urls[role]+target[1],{method:msg.req.method,headers,body,timeout:kind==='credential'?35000:15000});if(kind==='nonce' && response.status===200)pciRecordNonce(t.tenant_id,response.data);
    if(response.status===200 && kind==='token' && m.profile==='oid4vci-draft13'){
      const nonce=await transport.http(transport.urls.issuance+`/v1/tenants/${tid}/nonce`,{method:'POST',headers,body:{}});
      if(nonce.status!==200)throw new Sr2Error(503,'PCI-NONCE-UNAVAILABLE','Wallet nonce is unavailable.');
      pciRecordNonce(t.tenant_id,nonce.data);response.raw=Buffer.from(JSON.stringify({...response.data,c_nonce:nonce.data.c_nonce,c_nonce_expires_in:300}));
    }
    if(response.status===200 && kind==='jwks')response.raw=Buffer.from(JSON.stringify(pciPublicJwks(response.data,m.did)));
    if(response.status===200 && kind==='credential')response.raw=Buffer.from(JSON.stringify(pciCredentialResponse(response.data,m.profile)));
    if(response.status===200&&kind==='issuer')response.raw=Buffer.from(JSON.stringify(pciWalletMetadata(pciPublicCatalogue(catalogueBundle,response.data),m.profile)));
    pciObserve('native_'+kind,response.status<400?'ok':'error',started);
    if(response.status>=400){const allowed=new Set(['invalid_request','invalid_grant','invalid_token','invalid_proof','invalid_nonce','invalid_credential_request','unsupported_credential_type','unsupported_credential_format','issuance_pending','temporarily_unavailable','server_error']);const code=allowed.has(response.data?.error)?response.data.error:(response.status===401?'invalid_token':'server_error');return emit(response.status,{error:code,error_description:'The issuer could not complete the request.'},{'content-type':'application/json','cache-control':'no-store'});}
    return emit(response.status,response.raw,{'content-type':response.headers['content-type'] || 'application/json','cache-control':['did','jwks','status'].includes(kind)?'public, max-age=60':'no-store','x-content-type-options':'nosniff'});
  }catch(e){pciObserve('native','error',started);if(sr2IsError(e))return emitError(new PciError(e.status,e.code,e.status<500?'Check the request':'Service operation failed',e.message,[503,504].includes(e.status)));return emitError(e);}
}

function pciRecordNonce(tenantId,data){
  sr2Assert(typeof data?.c_nonce==='string' && data.c_nonce.length<=4096,'Invalid wallet nonce response.');
  const rt=pciRuntime();for(const [key,expiry] of rt.nonces)if(expiry<=Date.now())rt.nonces.delete(key);
  if(rt.nonces.size>=10000)throw new Sr2Error(429,'PCI-NONCE-CAPACITY','Try again later.');
  rt.nonces.set(tenantId+':'+crypto.createHash('sha256').update(data.c_nonce).digest('hex'),Date.now()+300000);
}

async function handlePciPresentationResponse(){
  try{
    const headers=requestHeaders(),seen=new Set();
    for(let i=0;i<(msg.req.rawHeaders||[]).length;i+=2){const key=String(msg.req.rawHeaders[i]).toLowerCase();if(['host','x-forwarded-host','x-pci-tenant-id','x-pci-tenant-slug','x-pci-tenant-domain','content-type'].includes(key)){if(seen.has(key))throw pciErrors.invalidTenantContext();seen.add(key);}}
    if(!String(headers['content-type']||'').toLowerCase().startsWith('application/x-www-form-urlencoded'))throw new Sr2Error(415,'PCI-VP-CONTENT-TYPE','The wallet response must use application/x-www-form-urlencoded.');
    const host=routedHost(),t=(await getPool().query("SELECT * FROM tenants WHERE primary_domain=$1 AND state='active'",[host])).rows[0];
    if(!t||headers['x-pci-tenant-id']!==t.tenant_id||headers['x-pci-tenant-slug']!==t.tenant_slug||headers['x-pci-tenant-domain']!==host)throw pciErrors.notFound();
    let input=msg.payload;if(typeof input==='string'){const form=new URLSearchParams(input);if([...form.keys()].length!==new Set(form.keys()).size)throw pciErrors.validation('Duplicate response parameters.');input=Object.fromEntries(form);}
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.values(input).some(v=>typeof v!=='string')||Buffer.byteLength(JSON.stringify(input))>150000)throw pciErrors.validation('Invalid presentation response.');
    await pciRuntime().service.store.transaction(t.tenant_id,tx=>tx.rate('presentation-responses',Math.floor(Date.now()/60000),120));
    const result=await pciRuntime().service.presentationRespond(t.tenant_id,host,input);return emit(200,result,{'cache-control':'no-store','content-type':'application/json'});
  }catch(error){if(sr2IsError(error))return emitError(new PciError(error.status,error.code,'Presentation was not verified',error.message,false));return emitError(error);}
}
