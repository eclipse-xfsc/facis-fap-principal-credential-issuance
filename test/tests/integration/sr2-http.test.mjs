import test from 'node:test';import assert from 'node:assert/strict';
import { fixture,configuration,alpha,beta } from '../../support/sr2-fixture.mjs';
import { httpHarness } from '../../support/sr2-http.mjs';
const base='/api/v1/tenants/'+alpha;
test('ORCE HTTP wrapper creates, reads, updates and requires If-Match',async()=>{
 const http=httpHarness(fixture());const created=await http(base+'/credential-configurations',{method:'POST',body:{data:configuration()}});assert.equal(created.status,201);const id=created.body.item.id;
 assert.equal((await http(base+'/credential-configurations/'+id)).status,200);
 const update={method:'PATCH',body:{data:{...created.body.item.draft,name:'New name'}}};assert.equal((await http(base+'/credential-configurations/'+id,update)).status,428);const saved=await http(base+'/credential-configurations/'+id,{...update,headers:{'if-match':'"1"'}});assert.equal(saved.status,200);assert.equal(saved.headers.etag,'"2"');assert.equal((await http(base+'/credential-configurations/'+id,{...update,headers:{'if-match':'"1"'}})).status,412);
});
test('HTTP wrapper rejects Alpha on Beta, mixed-case duplicate headers, forged context, CSRF and uibuilder transport',async()=>{
 const f=fixture(),http=httpHarness(f);
 assert.equal((await http('/api/v1/tenants/'+beta+'/credential-configurations')).status,404);
 assert.equal((await http(base+'/credential-configurations',{headers:{'x-pci-tenant-id':beta}})).status,404);
 assert.equal((await http(base+'/credential-configurations',{rawHeaders:['Host','alpha-pci.example.com','hOSt','beta-pci.example.com']})).status,403);
 assert.equal((await http(base+'/credential-configurations',{method:'POST',body:{data:configuration()},headers:{origin:'https://attacker.example.com'}})).status,403);
 assert.equal((await http(base+'/credential-configurations',{method:'POST',body:{data:configuration()},headers:{'content-type':'text/plain'}})).status,400);
 assert.equal((await http(base+'/credential-configurations',{transport:'uibuilder'})).status,400);
});
test('internal callback and offer routes cannot be reached with a browser-asserted identity',async()=>{
 const http=httpHarness(fixture());for(const path of ['/offers','/callbacks']){const r=await http('/api/v1/internal/tenants/'+alpha+path,{method:'POST',body:{principal:{roles:['principal'],tenantId:alpha}},headers:{authorization:'Bearer not-an-active-token','x-pci-public-request':'1'}});assert.equal(r.status,401);}
});
test('principal cannot bypass issuer controls through direct HTTP',async()=>{
 const f=fixture(),{config}=await f.prepared(),http=httpHarness(f,'principal');const r=await http(base+'/credential-configurations/'+config.id,{method:'PATCH',body:{data:config.draft},headers:{'if-match':`"${config.version}"`}});assert.equal(r.status,404);assert.equal((await http(base+'/issuer-metadata')).status,403);
});
test('HTTP history filters by verified credential ID and exposes current state without provider handles',async()=>{
 const f=fixture(),a=await f.prepared(),p=f.principal('principal'),id=await f.offered(a.config,p);await f.api.complete(p,id,'ephemeral',null);
 const http=httpHarness(f),path=base+'/credential-configurations/'+a.config.id+'/history',r=await http(path+'?requestId='+id);
 assert.equal(r.status,200);const row=r.body.items.find(x=>x.type==='issued');assert.match(row.credentialId,/^urn:uuid:/);assert.equal(row.currentState,'issued');assert.equal(row.statusReference.handle,undefined);
 assert.equal((await http(path+'?credentialId=urn%3Auuid%3Aabsent')).body.items.length,0);
 const filtered=await http(path+'?credentialId='+encodeURIComponent(row.credentialId));assert.ok(filtered.body.items.length);
 assert.ok(!JSON.stringify(filtered.body).includes(f.privateClaim));
});
