// ORCE transport wrapper. Uses _common.js helpers, inlined only in SR2 tabs.
async function handleSr2(allowedActions) {
  try {
    if(msg.pciTransport!=='http')throw new Sr2Error(400,'PCI-SR2-TRANSPORT','Use the authenticated HTTP API.');
    const action=String(msg.pciAction || '');if(!allowedActions.includes(action))throw new Sr2Error(404,'PCI-SR2-NOT-FOUND','Unknown operation.');
    const headers=requestHeaders(), raw=msg.req?.rawHeaders || [], names=new Set();
    for(let i=0;i<raw.length;i+=2){const key=String(raw[i]).toLowerCase();if(['host','x-forwarded-host','x-pci-tenant-id','x-pci-tenant-slug','x-pci-tenant-domain','authorization','cookie','origin','x-pci-public-request'].includes(key)){if(names.has(key))throw pciErrors.invalidTenantContext();names.add(key);}}
    for(const key of ['host','x-forwarded-host','x-pci-tenant-id','x-pci-tenant-slug','x-pci-tenant-domain','authorization','cookie','origin','x-pci-public-request'])if(headers[key]!==undefined && typeof headers[key]!=='string')throw pciErrors.invalidTenantContext();
    const method=String(msg.req.method || 'GET').toUpperCase(),host=routedHost();
    if(!['GET','HEAD'].includes(method)){
      if(headers.origin && headers.origin!==`https://${host}`)throw pciErrors.forbidden();
      if(headers['sec-fetch-site']==='cross-site')throw pciErrors.forbidden();
      if(!String(headers['content-type'] || '').toLowerCase().startsWith('application/json'))throw pciErrors.validation('Use application/json.');
    }
    const input=parseBody();if(Buffer.byteLength(JSON.stringify(input))>1500000)throw new Sr2Error(413,'PCI-SR2-SIZE','Request is too large.');
    const pool=getPool(),store=createSr2Store(pool),adapters=createSr2Adapters();
    const service=extendSr2Issuance(createSr2Service({store,adapters,pepper:cfg.verificationPepper,allowedHosts:envList('PCI_PARTICIPANT_ALLOWED_HOSTS',[]),issuerUrl:t=>publicUrl(t.primary_domain,'',cfg.orceBasePath).replace(/\/$/,''),assetUrl:(t,id)=>publicUrl(t.primary_domain,`/api/v1/public/assets/${id}`,cfg.orceBasePath)}));
    const route=params();let tenantId=route.tenantId?sr2Uuid(route.tenantId):null,p;
    if(action.startsWith('internal.')){
      const remote=String(msg.req.socket?.remoteAddress || '').replace(/^::ffff:/,'');
      const supplied=bearerToken(),expected=cfg.internalServiceToken,a=Buffer.from(supplied),b=Buffer.from(expected);
      if(headers['x-pci-public-request'] || !envList('PCI_INTERNAL_ALLOWED_IPS',[]).includes(remote) || !expected || a.length!==b.length || !crypto.timingSafeEqual(a,b))throw pciErrors.unauthorized();
      // The adapter must authenticate principal/service claims using the exact
      // selected upstream contract. Browser bodies can never supply authority.
      if(action==='internal.callback'){
        const invocation=await adapters.authenticateCallback({input,tenantId});
        const result=await service.complete(invocation.principal,invocation.requestId,invocation.participantJwt,invocation.holderBinding);
        return emit(200,result,{'cache-control':'no-store'});
      }
      const invocation=await adapters.authenticateInvocation({input,tenantId,action});p=invocation.principal;
    }else if(action.startsWith('provider.lifecycle')){
      if(host!==cfg.mainHost)throw pciErrors.forbidden();const s=await requireSession(['provider_admin']);p={...s,tenantId,provider:true,host};
    }else{
      const tenant=(await pool.query("SELECT * FROM tenants WHERE primary_domain=$1 AND state NOT IN ('deleted','deleting')",[host])).rows[0];
      if(!tenant || (tenantId && tenantId!==tenant.tenant_id) || String(headers['x-pci-tenant-id'] || '')!==tenant.tenant_id || String(headers['x-pci-tenant-slug'] || '')!==tenant.tenant_slug || normalizeHost(headers['x-pci-tenant-domain'])!==host)throw pciErrors.notFound();
      tenantId=tenant.tenant_id;
      if(action==='public.asset'){const result=await service.asset({tenantId,host},route.assetId,true);return emit(200,result.bytes,{'content-type':result.mediaType,'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'cache-control':'public, max-age=86400',etag:`"${result.hash}"`});}
      if(action==='public.branding')return emit(200,await service.branding(tenantId),{'cache-control':'no-cache'});
      const session=await requireSession([],tenantId);if(session.tenantId!==tenantId)throw pciErrors.forbidden();p={...session,host};
    }
    let result,status=200;
    const tag=String(headers['if-match'] || '');const value=/^"[1-9][0-9]*"$/.test(tag)?Number(tag.slice(1,-1)):NaN;const match=Number.isSafeInteger(value)?value:undefined;
    const [group,verb]=action.split('.');
    const kinds={config:'configuration',flow:'flow',metadata:'metadata',branding:'branding',connector:'connector',asset:'asset',settings:'settings'};
    if(kinds[group]){
      const kind=kinds[group],id=route.configurationId || route.flowId || route.connectorId || route.assetId || tenantId;
      if(verb==='list')result=await service.list(p,kind);
      else if(group==='asset' && verb==='get'){const a=await service.asset(p,id);return emit(200,a.bytes,{'content-type':a.mediaType,'x-content-type-options':'nosniff','cache-control':'no-store'});}
      else {result=await service.resource(p,kind,verb,verb==='create'?null:id,input,match);if(verb==='create')status=201;}
    }else if(group==='assignment')result=await service.assignments(p,verb,route.assignmentId,input);
    else if(action==='issuer.capabilities')result=await service.capabilities(p);
    else if(action==='publication.get' || action==='internal.publication-status')result=await service.publication(p);
    else if(action==='publication.publish' || action==='internal.metadata-publish')result=await service.publication(p,true);
    else if(action==='issuance.eligible')result=await service.eligible(p);
    else if(action==='issuance.start' || action==='internal.offer-create'){sr2Object(input,['configurationId']);result=await service.start(p,input.configurationId,String(headers['idempotency-key'] || ''));status=201;}
    else if(action==='issuance.get' || action==='internal.offer-get')result=await service.request(p,route.requestId);
    else if(action==='issuance.advance')result=await service.advance(p,route.requestId,input);
    else if(action==='issuance.offer')result=await service.offer(p,route.requestId);
    else if(action==='history.list')result=await service.history(p,route.configurationId,query());
    else if(action==='history.revoke'){sr2Object(input,['requestId','confirmed']);result=await service.revoke(p,route.configurationId,input.requestId,input.confirmed);}
    else if(action==='history.unblock'){sr2Object(input,['subjectHash']);result=await service.unblock(p,route.configurationId,input.subjectHash);}
    else if(action.endsWith('.lifecycle')){sr2Object(input,['state','confirmation']);result=await service.lifecycle(p,input.state,input.confirmation);status=202;}
    else if(action==='internal.plugin-put')result=await service.resource(p,'settings',input.create?'create':'update',tenantId,{data:input.data},match);
    else if(action==='internal.plugin-delete')throw new Sr2Error(409,'PCI-SR2-RETIREMENT-BLOCKED','Upstream plugin retirement contract is required.');
    else throw pciErrors.notFound();
    return emit(status,result,{'cache-control':'no-store',...(result?.item?.version?{etag:`"${result.item.version}"`}:{})});
  }catch(error){if(error instanceof Sr2Error)return emitError(new PciError(error.status,error.code,'Issuer operation failed',error.message,error.status===503));return emitError(error);}
}

async function handleSr2Maintenance() {
  if(msg.pciTransport!=='internal' || msg.pciInternal!==true)return null;
  try {
    const pool=getPool();const service=extendSr2Maintenance(createSr2Service({store:createSr2Store(pool),adapters:createSr2Adapters(),pepper:cfg.verificationPepper}));
    let cursor='00000000-0000-0000-0000-000000000000',count=0;
    for(;;){const rows=(await pool.query("SELECT tenant_id FROM tenants WHERE tenant_id>$1 AND state<>'deleted' ORDER BY tenant_id LIMIT 50",[cursor])).rows;if(!rows.length)break;
      for(const t of rows){await service.maintenance(t.tenant_id);cursor=t.tenant_id;count++;}}
    node.status({fill:'yellow',shape:'dot',text:`${count} tenant(s); contracts blocked`});
  }catch{node.status({fill:'red',shape:'ring',text:'PCI-SR2-MAINTENANCE-FAILED'});}
  return null;
}
