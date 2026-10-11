import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture,alpha} from '../../support/sr2-fixture.mjs';import {extendSr2Maintenance} from '../../../backend/sr2/maintenance.js';
test('verified IdP entitlements select credentials and removal denies a new request',async()=>{
 const f=fixture();let {config}=await f.prepared();config=(await f.api.resource(f.principal(),'configuration','update',config.id,{data:{...config.draft,eligibility:{subjects:[],roles:[],entitlements:['role:director']}}},config.version)).item;config=await f.publish('configuration',config);
 const member=f.principal('principal');await assert.rejects(f.api.start(member,config.id,crypto.randomUUID()));const director={...member,entitlements:['role:director']};const r=await f.api.start(director,config.id,crypto.randomUUID());assert.ok(r.request.requestId);await assert.rejects(f.api.start({...director,entitlements:[]},config.id,crypto.randomUUID()));
});
test('tenant deletion follows SRS FR-27 without publishing an empty native catalogue',async()=>{
 const f=fixture();await f.prepared();const api=extendSr2Maintenance(f.api);await api.lifecycle({...f.principal(),provider:true,roles:['provider_admin']},'deleting','alpha');
 let calls=0;f.adapters.publishMetadata=async()=>{calls++;};assert.equal((await api.maintenance(alpha)).state,'idle');assert.equal(calls,0);assert.equal(f.store.db.retirements.has(alpha),false);assert.equal(f.store.db.tenants.get(alpha).state,'deleting');
});
