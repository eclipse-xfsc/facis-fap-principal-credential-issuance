import { sr2Fail, sr2Hash } from './domain.js';

export function createSr2Store(pool) {
  return {
    async transaction(tenantId, task) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout='15s'");
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",['pci:'+tenantId]);
        const tenant=(await client.query('SELECT * FROM tenants WHERE tenant_id=$1 FOR UPDATE',[tenantId])).rows[0];
        if(!tenant) sr2Fail(404,'PCI-SR2-NOT-FOUND');
        const scoped=(sql,args=[])=>client.query(sql,[tenantId,...args]);
        const tx={tenant,
          async get(kind,id){return (await scoped('SELECT document FROM pci_issuer_resources WHERE tenant_id=$1 AND kind=$2 AND resource_id=$3',[kind,id])).rows[0]?.document || null;},
          async list(kind){return (await scoped('SELECT document FROM pci_issuer_resources WHERE tenant_id=$1 AND kind=$2 ORDER BY resource_id',[kind])).rows.map(r=>r.document);},
          async put(r){await scoped(`INSERT INTO pci_issuer_resources(tenant_id,kind,resource_id,configuration_id,identifier,document) VALUES($1,$2,$3,$4,$5,$6::jsonb)
            ON CONFLICT(tenant_id,kind,resource_id) DO UPDATE SET document=EXCLUDED.document,configuration_id=EXCLUDED.configuration_id,identifier=EXCLUDED.identifier`,[r.kind,r.id,r.configurationId || null,r.kind==='configuration'?r.draft.identifier:null,JSON.stringify(r)]);},
          async snapshot(kind,id,version,snapshot){await scoped('INSERT INTO pci_issuer_versions(tenant_id,kind,resource_id,version,snapshot,content_hash) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[kind,id,version,JSON.stringify(snapshot),sr2Hash(snapshot)]);},
          async version(kind,id,version){return (await scoped('SELECT snapshot FROM pci_issuer_versions WHERE tenant_id=$1 AND kind=$2 AND resource_id=$3 AND version=$4',[kind,id,version])).rows[0]?.snapshot || null;},
          async versions(kind,id){return (await scoped('SELECT version,content_hash,created_at FROM pci_issuer_versions WHERE tenant_id=$1 AND kind=$2 AND resource_id=$3 ORDER BY version DESC',[kind,id])).rows;},
          async assignments(subject=null){return (await scoped(`SELECT assignment_id AS id,subject,configuration_ids AS "configurationIds",revoked FROM pci_issuer_assignments WHERE tenant_id=$1 AND ($2::text IS NULL OR subject=$2) ORDER BY assignment_id`,[subject])).rows;},
          async grant(a){await scoped('INSERT INTO pci_issuer_assignments(tenant_id,assignment_id,subject,configuration_ids) VALUES($1,$2,$3,$4::jsonb)',[a.id,a.subject,JSON.stringify(a.configurationIds)]);},
          async revokeAssignment(id){await scoped('UPDATE pci_issuer_assignments SET revoked=true WHERE tenant_id=$1 AND assignment_id=$2',[id]);},
          async member(subject){return (await scoped('SELECT keycloak_subject,roles,enabled FROM tenant_members WHERE tenant_id=$1 AND keycloak_subject=$2',[subject])).rows[0] || null;},
          async historyMembers(){return (await scoped('SELECT keycloak_subject FROM tenant_members WHERE tenant_id=$1')).rows;},
          async bindPrincipal(hash,subject){await scoped('INSERT INTO pci_issuance_principals(tenant_id,subject_hash,keycloak_subject) VALUES($1,$2,$3) ON CONFLICT(tenant_id,subject_hash) DO NOTHING',[hash,subject]);},
          async pendingRevocations(now){return (await scoped("SELECT document FROM pci_issuance_requests WHERE tenant_id=$1 AND state IN ('revoking','revocation_indeterminate') AND COALESCE((document->'revocation'->>'nextAttemptAt')::bigint,0)<=$2 ORDER BY request_id LIMIT 20",[now])).rows.map(r=>r.document);},
          async expiredRequests(now){return (await scoped("SELECT document FROM pci_issuance_requests WHERE tenant_id=$1 AND expires_at<=to_timestamp($2/1000.0) AND state IN ('journey','offered','preparing','processing','participant_notified','participant_data_received','status_allocated','signed') ORDER BY expires_at LIMIT 1000",[now])).rows.map(r=>r.document);},
          async inFlight(now){return Number((await scoped("SELECT count(*) FROM pci_issuance_requests WHERE tenant_id=$1 AND state IN ('processing','participant_notified','participant_data_received','status_allocated','signed') AND expires_at>to_timestamp($2/1000.0)",[now])).rows[0].count);},
          async presentationConfigurations(hash){return (await scoped(`SELECT DISTINCT c.resource_id AS id,c.document->'draft'->>'name' AS name,'jwt_vc_json' AS format FROM pci_issuance_requests r JOIN pci_issuer_resources c ON c.tenant_id=r.tenant_id AND c.kind='configuration' AND c.resource_id=r.configuration_id JOIN pci_issuer_versions v ON v.tenant_id=r.tenant_id AND v.kind='configuration' AND v.resource_id=r.configuration_id AND v.version=(r.document->>'configurationVersion')::int WHERE r.tenant_id=$1 AND r.subject_hash=$2 AND v.snapshot->>'format'='jwt_vc_json' AND r.state IN ('issued','revoked')`,[hash])).rows;},
          async requestByCredential(id){const rows=(await scoped("SELECT document FROM pci_issuance_requests WHERE tenant_id=$1 AND document->>'credentialId'=$2 LIMIT 2",[id])).rows;if(rows.length>1)sr2Fail(409,'PCI-VP-AMBIGUOUS-CREDENTIAL','The credential identifier has multiple issuance records.');return rows[0]?.document || null;},
          async request(id){return (await scoped('SELECT document FROM pci_issuance_requests WHERE tenant_id=$1 AND request_id=$2',[id])).rows[0]?.document || null;},
          async requestByKey(key){return (await scoped('SELECT document FROM pci_issuance_requests WHERE tenant_id=$1 AND idempotency_hash=$2',[key])).rows[0]?.document || null;},
          async bindStatus(r,status){
            const hash=sr2Hash(status.entry);
            await scoped('INSERT INTO pci_status_allocations(tenant_id,request_id,configuration_id,status_hash,handle) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,request_id) DO NOTHING',[r.id,r.configurationId,hash,status.handle]);
            const row=(await scoped('SELECT status_hash,handle FROM pci_status_allocations WHERE tenant_id=$1 AND request_id=$2',[r.id])).rows[0];
            if(row.status_hash!==hash || row.handle!==status.handle)sr2Fail(409,'PCI-SR2-STATUS-COLLISION','Status allocation does not match its request.');
          },
          async saveRequest(r){await scoped(`INSERT INTO pci_issuance_requests(tenant_id,request_id,configuration_id,subject_hash,idempotency_hash,state,expires_at,document)
            VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0),$8::jsonb) ON CONFLICT(tenant_id,request_id) DO UPDATE SET state=EXCLUDED.state,document=EXCLUDED.document`,[r.id,r.configurationId,r.subjectHash,r.idempotencyHash,r.state,r.expiresAt,JSON.stringify(r)]);},
          async requests(configurationId){return (await scoped('SELECT document FROM pci_issuance_requests WHERE tenant_id=$1 AND configuration_id=$2 ORDER BY request_id',[configurationId])).rows.map(r=>r.document);},
          async event(e){await scoped('INSERT INTO pci_credential_events(tenant_id,configuration_id,request_id,subject_hash,event_type,actor_hash) VALUES($1,$2,$3,$4,$5,$6)',[e.configurationId || null,e.requestId || null,e.subjectHash || null,e.type,e.actorHash]);},
          async events(configurationId,filter){return (await scoped(`SELECT e.event_id AS cursor,e.configuration_id AS "configurationId",e.request_id AS "requestId",e.subject_hash AS "subjectHash",e.event_type AS type,e.created_at AS "createdAt",
            r.document->>'credentialId' AS "credentialId",r.state AS "currentState",r.document->'status'->'entry' AS "statusReference",r.document->>'holderDid' AS "holderDid",
            CASE WHEN m.keycloak_subject IS NULL THEN NULL ELSE json_build_object('username',m.username,'email',m.email,'first_name',m.first_name,'last_name',m.last_name,'enabled',m.enabled) END AS "principalMember"
            FROM pci_credential_events e LEFT JOIN pci_issuance_requests r ON r.tenant_id=e.tenant_id AND r.request_id=e.request_id AND r.configuration_id=e.configuration_id
            LEFT JOIN pci_issuance_principals ip ON ip.tenant_id=e.tenant_id AND ip.subject_hash=e.subject_hash
            LEFT JOIN tenant_members m ON m.tenant_id=ip.tenant_id AND m.keycloak_subject=ip.keycloak_subject
            WHERE e.tenant_id=$1 AND e.configuration_id=$2 AND ($3::bigint IS NULL OR e.event_id<$3)
            AND ($4::text IS NULL OR e.subject_hash=$4) AND ($5::uuid IS NULL OR e.request_id=$5) AND ($6::text IS NULL OR e.event_type=$6)
            AND ($8::timestamptz IS NULL OR e.created_at >= $8) AND ($9::timestamptz IS NULL OR e.created_at <= $9)
            AND ($10::text IS NULL OR r.document->>'credentialId'=$10)
            AND ($11::text IS NULL OR position(lower($11) in lower(concat_ws(' ',m.username,m.email,m.first_name,m.last_name)))>0)
            ORDER BY e.event_id DESC LIMIT $7`,[configurationId,filter.cursor,filter.subjectHash,filter.requestId,filter.type,filter.limit,filter.from,filter.to,filter.credentialId,filter.principal])).rows;},
          async blocked(id,subjectHash){return (await scoped('SELECT 1 FROM pci_reissuance_blocks WHERE tenant_id=$1 AND configuration_id=$2 AND subject_hash=$3',[id,subjectHash])).rowCount>0;},
          async block(id,subjectHash){await scoped('INSERT INTO pci_reissuance_blocks VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,subjectHash]);},
          async unblock(id,subjectHash){await scoped('DELETE FROM pci_reissuance_blocks WHERE tenant_id=$1 AND configuration_id=$2 AND subject_hash=$3',[id,subjectHash]);},
          async rate(bucket,window,limit){await scoped('DELETE FROM pci_rate_limits WHERE tenant_id=$1 AND window_start<$2',[window-2]);const row=(await scoped(`INSERT INTO pci_rate_limits VALUES($1,$2,$3,1) ON CONFLICT(tenant_id,bucket,window_start) DO UPDATE SET count=pci_rate_limits.count+1 RETURNING count`,[bucket,window])).rows[0];if(row.count>limit)sr2Fail(429,'PCI-SR2-RATE','Tenant or configuration rate exceeded.');},
          async circuit(id){return (await scoped('SELECT document FROM pci_participant_circuits WHERE tenant_id=$1 AND connector_id=$2',[id])).rows[0]?.document || {failures:0,openUntil:0,probe:null};},
          async saveCircuit(id,state){await scoped('INSERT INTO pci_participant_circuits VALUES($1,$2,$3::jsonb) ON CONFLICT(tenant_id,connector_id) DO UPDATE SET document=EXCLUDED.document',[id,JSON.stringify(state)]);},
          async publication(){return (await scoped('SELECT * FROM pci_metadata_publication WHERE tenant_id=$1')).rows[0] || {desired:0,observed:0,state:'draft',error_code:null};},
          async dirty(){await scoped(`INSERT INTO pci_metadata_publication(tenant_id,desired,state) VALUES($1,1,'pending') ON CONFLICT(tenant_id) DO UPDATE SET desired=pci_metadata_publication.desired+1,state='pending',error_code=NULL`);},
          async publicationResult(revision,code){await scoped(`UPDATE pci_metadata_publication SET observed=CASE WHEN $3::text IS NULL THEN $2 ELSE observed END,state=CASE WHEN $3::text IS NULL THEN 'published' ELSE 'error' END,error_code=$3,last_attempt=now(),last_success=CASE WHEN $3::text IS NULL THEN now() ELSE last_success END WHERE tenant_id=$1 AND desired=$2`,[revision,code]);},
          async retirement(){return (await scoped('SELECT issuer,state FROM pci_issuer_retirements WHERE tenant_id=$1')).rows[0] || null;},
          async retire(issuer){await scoped("INSERT INTO pci_issuer_retirements(tenant_id,issuer,state) VALUES($1,$2::jsonb,'pending') ON CONFLICT(tenant_id) DO NOTHING",[JSON.stringify(issuer)]);},
          async retired(){await scoped("UPDATE pci_issuer_retirements SET state='withdrawn',withdrawn_at=now() WHERE tenant_id=$1");},
          async lifecycle(state){await scoped('UPDATE tenants SET state=$2,desired_generation=desired_generation+1,updated_at=now() WHERE tenant_id=$1',[state]);await scoped('UPDATE auth_sessions SET revoked_at=now() WHERE tenant_id=$1');},
          async lifecycleDone(){await scoped("UPDATE tenants SET state='deleted',observed_generation=desired_generation,updated_at=now() WHERE tenant_id=$1 AND state='deleting'");},
        };
        const result=await task(tx);await client.query('COMMIT');return result;
      }catch(error){await client.query('ROLLBACK').catch(()=>{});if(error.code==='23505')sr2Fail(409,'PCI-SR2-CONFLICT','Identifier already exists.');throw error;}finally{client.release();}
    }
  };
}
