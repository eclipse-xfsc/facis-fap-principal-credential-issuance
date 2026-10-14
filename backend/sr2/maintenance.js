import { sr2Fail, sr2IsError } from './domain.js';

export function extendSr2Maintenance(api) {
  const {store,adapters,now,hashSubject}=api;
  api.maintenance=async tenantId=>{
    api.pruneJourneyInputs?.(tenantId);
    await api.recoverRevocations?.(tenantId);
    const work=await store.transaction(tenantId,async tx=>{
      for(const r of await tx.expiredRequests(now())){
        r.state=['journey','offered'].includes(r.state)?'expired':'indeterminate';
        r.errorCode=r.state==='expired'?'PCI-SR2-EXPIRED':'PCI-SR2-RECOVERY-REQUIRED';
        await tx.saveRequest(r);await tx.event({type:r.state,configurationId:r.configurationId,requestId:r.id,subjectHash:r.subjectHash,actorHash:hashSubject(tenantId,'system-maintenance')});
      }
      if(tx.tenant.state!=='active'){api.pruneJourneyInputs?.(tenantId,false);return null;}
      const state=await tx.publication(),metadata=await tx.get('metadata',tenantId);if(!metadata?.activeVersion)return null;
      const configurations=[];
      for(const c of await tx.list('configuration'))if(c.state!=='archived' && c.activeVersion)configurations.push({id:c.id,version:c.activeVersion,data:await tx.version('configuration',c.id,c.activeVersion)});
      if(state.state==='published' && Number(state.observed)===Number(state.desired))return null;
      return {state,tenantId,issuer:await tx.version('metadata',tenantId,metadata.activeVersion),configurations};
    });
    if(!work)return {state:'idle'};
    if(!adapters.capabilities().ready){await store.transaction(tenantId,tx=>tx.publicationResult(Number(work.state.desired),'PCI-SR2-CONTRACT-BLOCKED'));return {state:'blocked'};}
    try{await adapters.publishMetadata(work);await store.transaction(tenantId,tx=>tx.publicationResult(Number(work.state.desired),null));return {state:'published'};}
    catch(error){await store.transaction(tenantId,tx=>tx.publicationResult(Number(work.state.desired),sr2IsError(error)?error.code:'PCI-SR2-PUBLICATION-FAILED'));return {state:'error'};}
  };
  return api;
}
