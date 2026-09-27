import crypto from 'node:crypto';
import { sr2Assert, sr2Fail, sr2Text, sr2Uuid, sr2Object, sr2Integer, sr2Eligible, sr2Claims, sr2OneOf, sr2Correlation, sr2Hash } from './domain.js';
import { sr2Deadline, sr2Retry } from './adapters.js';

export function extendSr2Issuance(api) {
  const {store,adapters,now,authorize,get,event,hashSubject,connectorAccess}=api;
  const safeRequest=r=>({requestId:r.id,configurationId:r.configurationId,configurationVersion:r.configurationVersion,flowVersion:r.flowVersion,state:r.state,step:r.step,expiresAt:r.expiresAt,errorCode:r.errorCode || null});
  async function assertOwner(tx,p,r){await authorize(tx,p,'principal');if(!r || r.subjectHash!==hashSubject(p.tenantId,p.subject))sr2Fail(404,'PCI-SR2-NOT-FOUND');}
  async function pinned(tx,r){const configuration=await tx.version('configuration',r.configurationId,r.configurationVersion),flow=await tx.version('flow',r.flowId,r.flowVersion),connector=await tx.version('connector',r.connectorId,r.connectorVersion),metadata=await tx.version('metadata',r.tenantId,r.metadataVersion);if(!configuration||!flow||!connector||!metadata)sr2Fail(503,'PCI-SR2-PIN-MISSING','A pinned dependency is unavailable.');return {configuration,flow,connector,metadata};}
  async function setState(p,id,state,errorCode=null){return store.transaction(p.tenantId,async tx=>{const r=await tx.request(id);if(!r)return;r.state=state;r.errorCode=errorCode;await tx.saveRequest(r);await event(tx,p,state,r.configurationId,r);return r;});}
  api.eligible=async p=>store.transaction(p.tenantId,async tx=>{const principal=await authorize(tx,p,'principal'),items=[];for(const c of await tx.list('configuration'))if(c.state!=='archived' && c.activeVersion){const d=await tx.version('configuration',c.id,c.activeVersion);if(sr2Eligible(d,principal) && !await tx.blocked(c.id,hashSubject(p.tenantId,p.subject)))items.push({id:c.id,name:d.name,description:d.description,format:d.format,version:c.activeVersion});}return {items};});
  api.start=async(p,configurationId,idempotencyKey)=>store.transaction(p.tenantId,async tx=>{
    const principal=await authorize(tx,p,'principal');sr2Uuid(configurationId);sr2Text(idempotencyKey,128);sr2Assert(idempotencyKey.length>=16,'Use an unpredictable idempotency key.');
    const c=await get(tx,'configuration',configurationId);sr2Assert(c.activeVersion && c.state!=='archived','Configuration is not active.');const configuration=await tx.version('configuration',c.id,c.activeVersion);
    if(!sr2Eligible(configuration,principal))sr2Fail(403,'PCI-SR2-INELIGIBLE','This configuration is not available to the principal.');
    const subjectHash=hashSubject(p.tenantId,p.subject),key=hashSubject(p.tenantId,p.subject+'\0'+idempotencyKey);
    if(await tx.blocked(c.id,subjectHash))sr2Fail(403,'PCI-SR2-REISSUANCE-BLOCKED','Reissuance is blocked.');
    const old=await tx.requestByKey(key);if(old){sr2Assert(old.configurationId===c.id,'Idempotency key is already bound to a different configuration.');if(old.expiresAt<=now())sr2Fail(410,'PCI-SR2-EXPIRED','Use a new request after expiry.');return {request:safeRequest(old),flow:(await pinned(tx,old)).flow};}
    const flow=await get(tx,'flow',configuration.flowId),connector=await connectorAccess(tx,configuration.connectorId,c.id),metadata=await get(tx,'metadata',p.tenantId);
    sr2Assert(flow.activeVersion && connector.activeVersion && metadata.activeVersion && flow.state!=='archived' && connector.state!=='archived','Published dependencies are required.');
    sr2Assert((await tx.version('connector',connector.id,connector.activeVersion)).signingModes.includes(configuration.signingMode) && (await tx.version('metadata',metadata.id,metadata.activeVersion)).profile===configuration.profile,'Published dependency compatibility changed.');
    const settings=await tx.get('settings',p.tenantId);await tx.rate('offers',Math.floor(now()/60000),settings?.draft.ratePerMinute || 30);await tx.rate('configuration:'+c.id,Math.floor(now()/60000),configuration.ratePerMinute);
    const r={id:crypto.randomUUID(),tenantId:p.tenantId,configurationId:c.id,configurationVersion:c.activeVersion,flowId:flow.id,flowVersion:flow.activeVersion,connectorId:connector.id,connectorVersion:connector.activeVersion,metadataVersion:metadata.activeVersion,subjectHash,idempotencyHash:key,state:'journey',step:0,expiresAt:now()+600000,createdAt:now()};
    await tx.saveRequest(r);await event(tx,p,'requested',c.id,r);return {request:safeRequest(r),flow:(await pinned(tx,r)).flow};
  });
  api.advance=async(p,requestId,input)=>store.transaction(p.tenantId,async tx=>{
    sr2Object(input,['step','consent','values']);const r=await tx.request(sr2Uuid(requestId));await assertOwner(tx,p,r);sr2Correlation(r,{tenantId:p.tenantId,configurationId:r.configurationId,subjectHash:hashSubject(p.tenantId,p.subject)},now());
    sr2Assert(r.state==='journey' && input.step===r.step,'Journey step changed; reload the request.');const {flow}=await pinned(tx,r),step=flow.steps[r.step];sr2Assert(step && step.type!=='offer','Journey is ready for its offer.');
    if(step.type==='consent')sr2Assert(input.consent===true,'Consent is required.');
    if(step.type==='input'){const values=sr2Object(input.values || {},step.fields.map(f=>f.name));for(const f of step.fields)if(f.required || Object.hasOwn(values,f.name))sr2Text(values[f.name],2000,!f.required);}
    // Answers remain transient. Persist progress only, never survey text/claims.
    r.step++;await tx.saveRequest(r);return {request:safeRequest(r),flow};
  });
  api.request=async(p,id)=>store.transaction(p.tenantId,async tx=>{const r=await tx.request(sr2Uuid(id));await assertOwner(tx,p,r);return {request:safeRequest(r),flow:(await pinned(tx,r)).flow};});
  api.offer=async(p,id)=>{
    const ctx=await store.transaction(p.tenantId,async tx=>{
      const r=await tx.request(sr2Uuid(id));await assertOwner(tx,p,r);sr2Correlation(r,{tenantId:p.tenantId,configurationId:r.configurationId,subjectHash:hashSubject(p.tenantId,p.subject)},now());
      if(r.state!=='journey')sr2Fail(409,'PCI-SR2-REPLAY','An offer has already been prepared; begin a new request if it was lost.');
      await connectorAccess(tx,r.connectorId,r.configurationId);const c=await get(tx,'configuration',r.configurationId);sr2Assert(c.state!=='archived','Configuration is archived.');const pin=await pinned(tx,r),principal=await authorize(tx,p,'principal');
      sr2Assert(sr2Eligible(pin.configuration,principal) && !await tx.blocked(c.id,r.subjectHash),'Issuance eligibility no longer holds.');
      sr2Assert(pin.flow.steps[r.step]?.type==='offer','Complete the journey before creating an offer.');await adapters.assertReady(pin);
      r.state='preparing';await tx.saveRequest(r);return {r,...pin};
    });
    try {
      const offer=await sr2Deadline(()=>adapters.createOffer({...ctx,principal:p,deadline:Math.min(ctx.r.expiresAt,now()+10000)}),Math.min(ctx.r.expiresAt,now()+10000),now);
      sr2Object(offer,['requestId','tenantId','configurationId','offerUrl']);sr2Assert(offer.requestId===ctx.r.id && offer.tenantId===p.tenantId && offer.configurationId===ctx.r.configurationId,'Offer correlation mismatch.');
      let u;try{u=new URL(offer.offerUrl);}catch{sr2Fail(502,'PCI-SR2-OFFER','Invalid offer response.');}
      sr2Assert(['https:','openid-credential-offer:'].includes(u.protocol) && !u.username && !u.password && offer.offerUrl.length<=16000,'Unsafe offer URL.');
      await store.transaction(p.tenantId,async tx=>{const r=await tx.request(ctx.r.id);await assertOwner(tx,p,r);await connectorAccess(tx,r.connectorId,r.configurationId);const c=await get(tx,'configuration',r.configurationId);sr2Assert(r.state==='preparing' && r.expiresAt>now() && c.state!=='archived' && sr2Eligible(ctx.configuration,await authorize(tx,p,'principal')) && !await tx.blocked(c.id,r.subjectHash),'Offer was cancelled during processing.');r.state='offered';await tx.saveRequest(r);await event(tx,p,'offered',r.configurationId,r);});return {requestId:ctx.r.id,offerUrl:u.href,expiresAt:ctx.r.expiresAt};
    }catch(e){await setState(p,ctx.r.id,'indeterminate','PCI-SR2-OFFER-FAILED');throw e;}
  };
  // Called only by a verified OCM callback decoder after authenticating producer,
  // principal and proof. No public endpoint accepts a caller-asserted principal.
  api.complete=async(p,id,participantJwt,holderBinding)=>{
    const ctx=await store.transaction(p.tenantId,async tx=>{
      const r=await tx.request(sr2Uuid(id));await assertOwner(tx,p,r);sr2Correlation(r,{tenantId:p.tenantId,configurationId:r.configurationId,subjectHash:hashSubject(p.tenantId,p.subject)},now());sr2Assert(r.state==='offered','Request is not offered.');
      await connectorAccess(tx,r.connectorId,r.configurationId);const pin=await pinned(tx,r),c=await get(tx,'configuration',r.configurationId);sr2Assert(c.state!=='archived' && sr2Eligible(pin.configuration,await authorize(tx,p,'principal')) && !await tx.blocked(c.id,r.subjectHash),'Issuance is no longer permitted.');await adapters.assertReady(pin);
      // Rate buckets are shared database state across ORCE replicas.
      await tx.rate('participant:'+r.connectorId,Math.floor(now()/60000),pin.connector.ratePerMinute);
      const settings=await tx.get('settings',p.tenantId);if(await tx.inFlight(now()) >= (settings?.draft.maxConcurrent || 2))sr2Fail(429,'PCI-SR2-CONCURRENCY','Tenant participant concurrency limit exceeded.');
      const circuit=await tx.circuit(r.connectorId);
      if(circuit.openUntil>now())sr2Fail(503,'PCI-SR2-CIRCUIT-OPEN','Participant connector is temporarily paused.');
      if(circuit.openUntil){circuit.probe=r.id;circuit.openUntil=now()+pin.connector.timeoutMs+1000;await tx.saveCircuit(r.connectorId,circuit);}
      r.state='processing';await tx.saveRequest(r);return {r,...pin,tenant:tx.tenant};
    });
    const deadline=Math.min(ctx.r.expiresAt,now()+ctx.connector.timeoutMs);
    const transient={...ctx,principal:p,participantJwt,holderBinding,deadline};
    let participantFailed=false,participantSettled=false;
    const participantCall=async operation=>{try{return await operation();}catch(e){participantFailed=Boolean(e.retryable || [502,503,504].includes(e.status));throw e;}};
    async function settleCircuit(result){await store.transaction(p.tenantId,async tx=>{
      const c=await tx.circuit(ctx.r.connectorId);if(c.probe && c.probe!==id)return;
      if(result==='success'){c.failures=0;c.openUntil=0;c.probe=null;}
      else if(result==='failure'){c.failures=Math.min(100,c.failures+1);c.probe=null;c.openUntil=c.failures>=ctx.connector.circuitFailureThreshold?now()+ctx.connector.circuitCooldownMs:0;}
      else if(c.probe===id){c.probe=null;c.openUntil=now();}
      await tx.saveCircuit(ctx.r.connectorId,c);
    });participantSettled=true;}

    try {
      await participantCall(()=>sr2Deadline(()=>adapters.participantIdentity(transient),deadline,now));
      const ack=await participantCall(()=>sr2Retry(()=>adapters.notifyParticipant(transient),ctx.connector.attempts,deadline,now));sr2Assert(ack?.accepted===true && ack.requestId===id,'Participant notification rejected.');await setState(p,id,'participant_notified');
      async function allocate() {
        const status=await sr2Deadline(()=>adapters.allocateStatus({...transient,idempotencyKey:id}),deadline,now);
        sr2Object(status,['tenantId','configurationId','requestId','handle','entry']);sr2Assert(status.tenantId===p.tenantId && status.configurationId===ctx.r.configurationId && status.requestId===id,'Status ownership mismatch.');sr2Text(status.handle,200);
        const entry=sr2Object(status.entry,['id','type','statusPurpose','statusListIndex','statusListCredential']);
        sr2Text(entry.id,1024);sr2Text(entry.type,100);
        const origin=new URL(api.issuerUrl(ctx.tenant)).origin;
        sr2Assert(new URL(entry.id).protocol==='https:' && new URL(entry.id).origin===origin,'Status must belong to the tenant origin.');
        if(entry.statusPurpose!==undefined)sr2Assert(['revocation','suspension'].includes(entry.statusPurpose),'Invalid status purpose.');
        if(entry.statusListIndex!==undefined)sr2Assert(typeof entry.statusListIndex==='string' && /^\d{1,16}$/.test(entry.statusListIndex),'Invalid status index.');
        if(entry.statusListCredential!==undefined)sr2Assert(typeof entry.statusListCredential==='string' && new URL(entry.statusListCredential).origin===origin,'Status list origin mismatch.');
        await store.transaction(p.tenantId,async tx=>{const r=await tx.request(id);await tx.bindStatus(r,status);r.status=status;r.state='status_allocated';await tx.saveRequest(r);await event(tx,p,'status_allocated',r.configurationId,r);});
        transient.status=status;return status;
      }
      // Participant signer must receive the trusted status before signing.
      // Internal mode allocates only after validating the returned unsigned data.
      let status=ctx.configuration.signingMode==='participant-signed'?await allocate():null;
      let response=await participantCall(()=>sr2Retry(()=>adapters.getParticipantData(transient),ctx.connector.attempts,deadline,now));
      await settleCircuit('success');
      sr2OneOf(response,ctx.configuration.signingMode,id);await setState(p,id,'participant_data_received');
      if(ctx.configuration.signingMode==='internal-signing'){sr2Claims(response.unsignedData,ctx.configuration,p.subject);status=await allocate();}
      let credential;
      if(ctx.configuration.signingMode==='internal-signing'){credential=await sr2Deadline(()=>adapters.sign({...transient,status,data:response.unsignedData}),deadline,now);await setState(p,id,'signed');}
      else credential=response.signedCredential;
      sr2Assert(typeof credential==='string' && credential.length<=262144,'Invalid credential response size.');
      const verified=await sr2Deadline(()=>adapters.verifySigned({...transient,status,credential}),deadline,now);sr2Object(verified,['credentialId']);if(verified.credentialId!==null)sr2Text(verified.credentialId,1024);
      const final=await store.transaction(p.tenantId,async tx=>{await assertOwner(tx,p,await tx.request(id));await connectorAccess(tx,ctx.r.connectorId,ctx.r.configurationId);const c=await get(tx,'configuration',ctx.r.configurationId);sr2Assert(c.state!=='archived' && sr2Eligible(ctx.configuration,await authorize(tx,p,'principal')) && !await tx.blocked(c.id,ctx.r.subjectHash),'Issuance was cancelled during processing.');const r=await tx.request(id);sr2Assert(r.expiresAt>now(),'Request expired.');r.state='issued';r.credentialId=verified.credentialId;await tx.saveRequest(r);await event(tx,p,'issued',r.configurationId,r);return {credential,format:ctx.configuration.format};});
      response=null;credential=null;return final;
    }catch(e){if(!participantSettled)await settleCircuit(participantFailed?'failure':'neutral');await setState(p,id,'indeterminate','PCI-SR2-ISSUANCE-FAILED');throw e;}
    finally {transient.participantJwt=undefined;transient.holderBinding=undefined;}
  };
  api.revoke=async(p,configurationId,requestId,confirmed)=>{
    const ctx=await store.transaction(p.tenantId,async tx=>{sr2Uuid(configurationId);sr2Uuid(requestId);await authorize(tx,p,'issuer',configurationId);await get(tx,'configuration',configurationId);const r=await tx.request(requestId);if(!r || r.configurationId!==configurationId)sr2Fail(404,'PCI-SR2-NOT-FOUND');if(r.state==='revoked')return {r,done:true};sr2Assert(confirmed===true,'Confirm revocation.');sr2Assert(r.state==='issued' && r.status,'Only issued credentials with a status reference can be revoked.');const pin=await pinned(tx,r);await adapters.assertReady(pin);r.state='revoking';await tx.saveRequest(r);return {r,...pin};});
    if(ctx.done)return {revoked:true,requestId};
    try{const result=await sr2Deadline(()=>adapters.revokeStatus({tenantId:p.tenantId,configurationId,requestId,status:ctx.r.status,idempotencyKey:'revoke:'+requestId,deadline:now()+10000}),now()+10000,now);
      sr2Assert(result?.revoked===true && result.tenantId===p.tenantId && result.requestId===requestId && result.handle===ctx.r.status.handle,'Status provider did not confirm the revocation.');
      await store.transaction(p.tenantId,async tx=>{const r=await tx.request(requestId);r.state='revoked';await tx.saveRequest(r);if(ctx.configuration.blockReissuance)await tx.block(configurationId,r.subjectHash);await event(tx,p,'revoked',configurationId,r);});return {revoked:true,requestId};
    }catch(e){await setState(p,requestId,'revocation_indeterminate','PCI-SR2-REVOCATION-FAILED');throw e;}
  };
  return api;
}
