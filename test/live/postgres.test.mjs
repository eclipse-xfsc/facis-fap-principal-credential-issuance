import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import pg from 'pg';
import {schema} from '../../tools/extract-schema.mjs';import {createSr2Store} from '../../backend/sr2/store.js';
const url=process.env.PCI_TEST_DATABASE_URL;if(!url)throw new Error('PCI_TEST_DATABASE_URL is required; this test never silently skips');
test('real PostgreSQL migration, immutable versions, tenant isolation and concurrent limits',async t=>{
 const isolated='pci_test_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString:url});await admin.query('CREATE SCHEMA '+isolated);
 const pool=new pg.Pool({connectionString:url,options:'-c search_path='+isolated,max:8});t.after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+isolated+' CASCADE');await admin.end();});
 await pool.query(schema);await pool.query(schema);const tid=crypto.randomUUID(),beta=crypto.randomUUID(),id=crypto.randomUUID();
 for(const tenant of [tid,beta]){const reg=crypto.randomUUID();await pool.query("INSERT INTO tenant_registrations(registration_id,organization_identifier,organization_name,contact_name,contact_email,requested_slug,requested_domain,registration_mode,state,email_delivery_status,created_at,updated_at) VALUES($1::uuid,$1::text,'Test','Operator','test@example.invalid',$1::text,$1::text,'public','approved','sent',now(),now())",[reg]);await pool.query("INSERT INTO tenants(tenant_id,registration_id,tenant_slug,owner_uid,organization_identifier,organization_name,primary_domain,state,created_at,updated_at) VALUES($1::uuid,$2::uuid,$1::text,$3::uuid,$1::text,'Test',$1::text,'active',now(),now())",[tenant,reg,crypto.randomUUID()]);}
 const store=createSr2Store(pool),resource={tenantId:tid,id,kind:'branding',draft:{title:'Alpha'}};
 await store.transaction(tid,async tx=>{await tx.put(resource);await tx.snapshot('branding',id,1,resource.draft);});assert.equal(await store.transaction(beta,tx=>tx.get('branding',id)),null);
 await assert.rejects(store.transaction(tid,tx=>tx.snapshot('branding',id,1,{title:'changed'})));assert.deepEqual(await store.transaction(tid,tx=>tx.version('branding',id,1)),resource.draft);
 const outcomes=await Promise.allSettled(Array.from({length:8},()=>store.transaction(tid,tx=>tx.rate('concurrent',1,3))));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,3);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.status===429).length,5);
 assert.deepEqual(await createSr2Store(pool).transaction(tid,tx=>tx.get('branding',id)),resource);
 const config=crypto.randomUUID(),request=crypto.randomUUID(),subject='synthetic-principal',hash='a'.repeat(64);
 for(const [tenant,name]of [[tid,'Alex'],[beta,'Other']])await pool.query("INSERT INTO tenant_members(tenant_id,keycloak_subject,username,email,first_name,last_name,roles,enabled,updated_at) VALUES($1,$2,$3,$3,$4,'Example','[\"principal\"]',true,now())",[tenant,subject,name.toLowerCase()+'@example.invalid',name]);
 await store.transaction(tid,async tx=>{
  await tx.put({tenantId:tid,id:config,kind:'configuration',draft:{identifier:'employee',name:'Employee'}});
  await tx.snapshot('configuration',config,1,{format:'jwt_vc_json'});
  await tx.bindPrincipal(hash,subject);
  await tx.saveRequest({id:request,configurationId:config,configurationVersion:1,subjectHash:hash,idempotencyHash:'request-once',state:'issued',expiresAt:Date.now()+60000,credentialId:'urn:uuid:'+request,holderDid:'did:example:public-holder',status:{entry:{id:'https://alpha.example/status#1'}}});
  await tx.event({configurationId:config,requestId:request,subjectHash:hash,type:'issued',actorHash:hash});
 });
 const filter={cursor:null,subjectHash:null,requestId:null,type:null,limit:20,from:null,to:null,credentialId:null,principal:'alex@'};
 const events=await store.transaction(tid,tx=>tx.events(config,filter));assert.equal(events.length,1);assert.equal(events[0].principalMember.first_name,'Alex');assert.equal(events[0].credentialId,'urn:uuid:'+request);
 assert.equal((await store.transaction(tid,tx=>tx.events(config,{...filter,principal:'Other'}))).length,0);
 assert.equal((await store.transaction(beta,tx=>tx.events(config,{...filter,principal:null}))).length,0);
 assert.equal((await store.transaction(tid,tx=>tx.presentationConfigurations(hash)))[0].id,config);
 assert.equal((await store.transaction(tid,tx=>tx.requestByCredential('urn:uuid:'+request))).id,request);
 await assert.rejects(store.transaction(beta,tx=>tx.bindPrincipal(hash,'missing-member')),e=>e.code==='23503');
 await pool.query('DELETE FROM tenant_members WHERE tenant_id=$1 AND keycloak_subject=$2',[tid,subject]);
 const deleted=await store.transaction(tid,tx=>tx.events(config,{...filter,principal:null}));assert.equal(deleted.length,1);assert.equal(deleted[0].principalMember,null);assert.equal(deleted[0].credentialId,'urn:uuid:'+request);
 // Exercise rc.4 -> rc.5 LDP republish with existing immutable data, then rerun.
 const ldp=crypto.randomUUID();await store.transaction(tid,async tx=>{
  await tx.put({tenantId:tid,id:ldp,kind:'configuration',state:'published',activeVersion:1,draft:{identifier:'Linked'}});
  await tx.snapshot('configuration',ldp,1,{format:'ldp_vc',identifier:'Linked'});await tx.dirty();
 });
 const before=await store.transaction(tid,tx=>tx.publication());
 await pool.query("DELETE FROM pci_schema_migrations WHERE version='0.5.0-rc.5-linked-data'");
 await pool.query(schema);const migrated=await store.transaction(tid,tx=>tx.publication());assert.equal(Number(migrated.desired),Number(before.desired)+1);assert.equal(migrated.state,'pending');
 await pool.query(schema);const repeated=await store.transaction(tid,tx=>tx.publication());assert.equal(Number(repeated.desired),Number(migrated.desired));
 assert.deepEqual(await store.transaction(tid,tx=>tx.version('configuration',ldp,1)),{format:'ldp_vc',identifier:'Linked'});

});
