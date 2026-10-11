import crypto from 'node:crypto';
import {sr2Assert,sr2Fail,sr2Uuid} from './domain.js';
import {sr2Deadline} from './adapters.js';

// An authorized revocation intent is durable. A short lease prevents parallel
// retries, while native readback resolves a lost acknowledgement after restart.
export function extendSr2Revocation(api,pinned) {
  const {store,adapters,now,authorize,get,event,hashSubject}=api;
  const pending=new Set(['revoking','revocation_indeterminate']);
  async function acquire(tenantId,configurationId,requestId,p,confirmed,automatic=false){
    return store.transaction(tenantId,async tx=>{
      sr2Uuid(configurationId);sr2Uuid(requestId);
      if(p){await authorize(tx,p,'issuer',configurationId);sr2Assert(confirmed===true,'Confirm revocation.');}
      else if(!['active','suspended'].includes(tx.tenant.state))return null;
      await get(tx,'configuration',configurationId);
      const r=await tx.request(requestId);
      if(!r || r.configurationId!==configurationId)sr2Fail(404,'PCI-SR2-NOT-FOUND');
      if(r.state==='revoked')return {r,done:true};
      if(automatic && !pending.has(r.state))return null;
      sr2Assert((r.state==='issued'||pending.has(r.state))&&r.status,'Only issued credentials with a status reference can be revoked.');
      if((r.revocation?.leaseUntil||0)>now()){
        if(automatic)return null;
        sr2Fail(409,'PCI-REVOCATION-IN-PROGRESS','Revocation is being reconciled. Reload its history shortly.');
      }
      const pin=await pinned(tx,r),recover=pending.has(r.state),lease=crypto.randomUUID();
      await tx.block(configurationId,r.subjectHash);
      r.revocation={...(r.revocation||{}),operationId:'revoke:'+requestId,requestedAt:r.revocation?.requestedAt||now(),actorHash:r.revocation?.actorHash||hashSubject(tenantId,p?.subject||'system-maintenance'),lease,leaseUntil:now()+15000,attempts:(r.revocation?.attempts||0)+1,nextAttemptAt:now()+15000};
      r.state='revoking';r.errorCode=null;await tx.saveRequest(r);
      if(!recover)await event(tx,p,'revocation.requested',configurationId,r);
      return {r,...pin,recover,lease};
    });
  }
  async function perform(ctx){
    if(!ctx)return {pending:true};
    const {r}=ctx,tenantId=r.tenantId,requestId=r.id;
    if(ctx.done)return {revoked:true,requestId};
    const deadline=now()+10000;
    const t={...ctx,tenantId,configurationId:r.configurationId,requestId,status:r.status,idempotencyKey:'revoke:'+requestId,deadline};
    try{
      await adapters.assertReady(ctx);
      let revoked=false;
      if(ctx.recover){
        if(typeof adapters.revocationStatus!=='function')sr2Fail(503,'PCI-REVOCATION-READBACK','Native revocation readback is unavailable.');
        const state=await sr2Deadline(()=>adapters.revocationStatus(t),deadline,now);
        sr2Assert(state?.tenantId===tenantId&&state.requestId===requestId&&state.handle===r.status.handle&&typeof state.revoked==='boolean','Native status readback correlation mismatch.');
        revoked=state.revoked;
      }
      if(!revoked){
        const result=await sr2Deadline(()=>adapters.revokeStatus(t),deadline,now);
        sr2Assert(result?.revoked===true&&result.tenantId===tenantId&&result.requestId===requestId&&result.handle===r.status.handle,'Status provider did not confirm the revocation.');
      }
      return store.transaction(tenantId,async tx=>{
        const current=await tx.request(requestId);
        if(current.state==='revoked')return {revoked:true,requestId};
        if(current.revocation?.lease!==ctx.lease)sr2Fail(409,'PCI-REVOCATION-IN-PROGRESS','Another recovery attempt owns the operation.');
        current.state='revoked';current.errorCode=null;current.revocation={...current.revocation,lease:null,leaseUntil:0,completedAt:now()};
        await tx.block(current.configurationId,current.subjectHash);await tx.saveRequest(current);
        await tx.event({type:'revoked',configurationId:current.configurationId,requestId,subjectHash:current.subjectHash,actorHash:current.revocation.actorHash});
        return {revoked:true,requestId};
      });
    }catch(error){
      await store.transaction(tenantId,async tx=>{
        const current=await tx.request(requestId);
        if(current?.state==='revoked'||current?.revocation?.lease!==ctx.lease)return;
        current.state='revocation_indeterminate';current.errorCode='PCI-SR2-REVOCATION-FAILED';
        current.revocation={...current.revocation,lease:null,leaseUntil:0,nextAttemptAt:now()+Math.min(300000,5000*2**Math.min(6,current.revocation.attempts-1))};
        await tx.block(current.configurationId,current.subjectHash);await tx.saveRequest(current);
        await tx.event({type:'revocation_indeterminate',configurationId:current.configurationId,requestId,subjectHash:current.subjectHash,actorHash:current.revocation.actorHash});
      });
      throw error;
    }
  }
  api.revoke=async(p,configurationId,requestId,confirmed)=>perform(await acquire(p.tenantId,configurationId,requestId,p,confirmed));
  api.recoverRevocations=async tenantId=>{
    const rows=await store.transaction(tenantId,tx=>tx.pendingRevocations(now()));
    const result={recovered:0,pending:0};
    for(const r of rows){try{const value=await perform(await acquire(tenantId,r.configurationId,r.id,null,true,true));if(value.revoked)result.recovered++;else result.pending++;}catch{result.pending++;}}
    return result;
  };
  return api;
}
