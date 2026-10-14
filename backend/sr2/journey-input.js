import {sr2Assert,sr2Fail,sr2Hash,sr2Text} from './domain.js';

// A published field with the same name as a declared claim is an issuer-owned
// mapping. Unmatched survey fields are validated but never retained or signed.
export function sr2JourneyBindings(configuration,flow) {
  const seen=new Set(),bindings=[];
  flow.steps.forEach((step,index)=>{
    if(step.type!=='input')return;
    const fields=step.fields.flatMap(field=>{
      const claim=configuration.claims.find(c=>c.name===field.name);
      if(!claim)return [];
      sr2Assert(configuration.signingMode==='internal-signing','Journey claims require internal signing; participant-signed claims come from the participant.');
      sr2Assert(!seen.has(claim.name),'A credential claim can be collected in only one journey field.');
      sr2Assert(!claim.required || field.required,'A required credential claim needs a required journey field.');
      seen.add(claim.name);return [{...field,type:claim.type}];
    });
    if(fields.length)bindings.push({step:index,fields});
  });
  return bindings;
}

export function sr2JourneyValues(step,values) {
  const claims={};
  for(const field of step.fields){
    try {
      const text=sr2Text(values[field.name] ?? '',2000,!field.required);
      if(!text && !field.required)continue;
      let value=text;
      if(field.type==='number'){
        sr2Assert(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) && Number.isFinite(Number(text)),'Enter a finite number.');value=Number(text);
      }else if(field.type==='boolean'){
        sr2Assert(text==='true' || text==='false','Enter true or false.');value=text==='true';
      }
      claims[field.name]=value;
    }catch(error){error.fields={[field.name]:field.type==='number'?'Enter a finite number.':field.type==='boolean'?'Enter true or false.':'Enter '+field.label+' (up to 2000 characters).'};throw error;}
  }
  return claims;
}

// The participant still authenticates and retrieves its record. It need not
// supply claims collected by PCI; the original pinned schema is enforced after
// merging and remains unchanged in issuer metadata and the signing operation.
export function sr2ParticipantConfiguration(configuration,bindings) {
  const names=new Set(bindings.flatMap(b=>b.fields.map(f=>f.name)));
  return names.size?{...configuration,claims:configuration.claims.map(c=>names.has(c.name)?{...c,required:false}:c)}:configuration;
}

export function createSr2JourneyInputs(now,{maxRequests=1000,maxBytes=16*1024*1024}={}) {
  const entries=new Map();let bytes=0;
  const key=r=>r.tenantId+':'+r.id;
  const binding=r=>sr2Hash([r.tenantId,r.id,r.subjectHash,r.configurationId,r.configurationVersion,r.flowId,r.flowVersion,r.connectorId,r.connectorVersion,r.metadataVersion,r.expiresAt]);
  function remove(k){const old=entries.get(k);if(old){bytes-=old.bytes;entries.delete(k);}}
  function prune(){for(const [k,e] of entries)if(e.expiresAt<=now())remove(k);}
  function current(r){prune();const e=entries.get(key(r));return e?.binding===binding(r)?e:null;}
  function missing(r,bindings){const e=current(r);return bindings.find(b=>b.step<r.step && !e?.steps.has(b.step));}
  return {
    prune,
    clear(){entries.clear();bytes=0;},
    clearTenant(tenantId){for(const [k,e] of entries)if(e.tenantId===tenantId)remove(k);},
    drop(r){remove(key(r));},
    missing,
    assert(r,bindings){if(missing(r,bindings))sr2Fail(409,'PCI-SR2-INPUT-LOST','Your form answers are no longer available. Reload the journey to enter them again, or start a new request if an offer was already prepared.');},
    read(r,bindings){this.assert(r,bindings);const e=current(r);return Object.assign({},...bindings.map(b=>e?.steps.get(b.step) || {}));},
    put(r,step,values){
      const old=current(r),steps=new Map(old?.steps || []);steps.set(step,{...values});
      const size=512+Buffer.byteLength(JSON.stringify([...steps]),'utf8');
      if((!old && entries.size>=maxRequests) || bytes-(old?.bytes || 0)+size>maxBytes)sr2Fail(429,'PCI-SR2-INPUT-CAPACITY','Too many pending forms. Try again after pending requests expire.');
      const k=key(r),entry={binding:binding(r),tenantId:r.tenantId,expiresAt:r.expiresAt,steps,bytes:size};
      remove(k);entries.set(k,entry);bytes+=size;
      // Roll back the memory write if the surrounding SQL transaction fails.
      return ()=>{if(entries.get(k)!==entry)return;remove(k);if(old && entries.size<maxRequests && bytes+old.bytes<=maxBytes){entries.set(k,old);bytes+=old.bytes;}};
    }
  };
}
