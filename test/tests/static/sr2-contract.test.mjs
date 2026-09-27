import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
test('SR2 tabs, typed contracts, version and migration stay embedded in canonical release',()=>{
 const flow=JSON.parse(read('dist/fap-pci-flow.json')),api=JSON.parse(read('docs/api/openapi.json'));
 for(const label of ['M8_PCI-IssuerAdministration','M9_PCI-IssuerMetadata','M10_PCI-IssuanceFlowManagement','M11_PCI-IssuerRuntime','M12_PCI-ParticipantIntegration','M13_PCI-HistoryStatus'])assert.ok(flow.some(n=>n.type==='tab'&&n.label===label),label);
 assert.equal(api.info.version,'0.4.1');assert.equal(read('VERSION').trim(),'0.4.1');assert.equal(JSON.parse(read('package-lock.json')).packages[''].version,'0.4.1');
 for(const type of ['Sr2Configuration','Sr2Flow','Sr2Connector','Sr2Metadata','Sr2Assignment','Sr2Settings','Sr2Asset'])assert.equal(api.components.schemas[type].additionalProperties,false);
 for(const path of ['/credential-configurations','/flows','/issuer-metadata','/participant-connectors','/administrators','/issuance-requests'])assert.ok(api.paths['/api/v1/tenants/{tenantId}'+path]);
 const g0=read('automation/stage1/ground-zero.sh');assert.ok(g0.includes('-- BEGIN SR2 SCHEMA\n'+read('backend/sr2/schema.sql')+'-- END SR2 SCHEMA'));assert.equal(g0,read('dist/ground-zero.sh'));
});
test('runtime has no payload debug nodes, optional transport flags, or executable tenant scripts',()=>{
 const flow=JSON.parse(read('dist/fap-pci-flow.json'));assert.equal(flow.some(n=>n.type==='debug'),false);
 const adapters=read('backend/sr2/adapters.js');assert.match(adapters,/ready:false/);assert.doesNotMatch(adapters,/process\.env|env\.get/);
 const domain=read('backend/sr2/domain.js');assert.doesNotMatch(domain,/new Function|\beval\(/);assert.match(read('backend/functions/_common.js'),/msg\.pciTransport === "internal"\) return \[null, null\]/);
});
test('schema keeps independent immutable versions and enforces tenant-qualified status uniqueness',()=>{
 const schema=read('backend/sr2/schema.sql');assert.match(schema,/PRIMARY KEY\(tenant_id,kind,resource_id,version\)/);assert.match(schema,/UNIQUE\(tenant_id,status_hash\)/);assert.match(schema,/UNIQUE\(tenant_id,idempotency_hash\)/);assert.doesNotMatch(schema,/DROP TABLE|TRUNCATE|DROP DATABASE/);
});
