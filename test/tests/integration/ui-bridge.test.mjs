import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeHarness} from '../../support/ui-bridge.mjs';
import {configuration,alpha,beta} from '../../support/sr2-fixture.mjs';
const base='/api/v1/tenants/'+alpha;

test('authenticated UIBUILDER commands preserve If-Match and result correlation',async()=>{
  const h=bridgeHarness(),grant=await h.bootstrap();assert.equal(grant.status,200);
  const cmd=h.envelope(grant,base+'/credential-configurations','POST',{data:configuration()});
  const created=await h.command(cmd);assert.equal(created.ok,true);assert.equal(created.requestId,cmd.requestId);assert.equal(created.status,201);
  const path=base+'/credential-configurations/'+created.data.item.id;
  const input={data:{...created.data.item.draft,name:'Bridge updated'}};
  assert.equal((await h.command(h.envelope(grant,path,'PATCH',input))).status,428);
  assert.equal((await h.command(h.envelope(grant,path,'PATCH',input,{'if-match':'"1"'}))).ok,true);
  assert.equal((await h.command(h.envelope(grant,path,'PATCH',input,{'if-match':'"1"'}))).status,412);
  assert.equal((await h.command(cmd)).status,409);
  assert.ok(h.events.some(e=>e.payload.event==='jobProgress'));
  assert.equal(JSON.stringify(h.events).includes(grant.token),false);
});

test('bridge bootstrap rejects foreign origins, mixed duplicate headers and false tenant labels',async()=>{
  const h=bridgeHarness(),identity=h.credentials();
  assert.equal((await h.bootstrap(identity,undefined,{headers:{origin:'https://attacker.example'}})).status,403);
  assert.equal((await h.bootstrap(identity,undefined,{headers:{origin:undefined}})).status,403);
  assert.equal((await h.bootstrap(identity,undefined,{headers:{'x-pci-tenant-id':beta}})).status,403);
  assert.equal((await h.bootstrap(identity,undefined,{rawHeaders:['Host',identity.host,'hOSt','attacker.example']})).status,403);
});

test('browser cannot forge socket, header, session, role, tenant or internal callback authority',async()=>{
  const h=bridgeHarness(),identity=h.credentials('principal'),grant=await h.bootstrap(identity);
  const path=base+'/issuer-metadata';
  const spoof={_socketId:'test_socket_123456',pciInternal:true,pciBridgeApproved:true,pciTrustedHeaders:{cookie:'fake',host:'pci.example.com'},req:{headers:{host:'pci.example.com'}},_uib:{handshake:{headers:{host:'pci.example.com'}}}};
  assert.equal((await h.command(h.envelope(grant,path),{socketId:'attacker_socket_123',spoof})).status,401);
  assert.equal((await h.command(h.envelope(grant,path),{spoof})).status,403);
  assert.equal((await h.command(h.envelope(grant,'/api/v1/tenants/'+beta+'/issuer-capabilities'),{spoof})).status,404);
  assert.equal((await h.command(h.envelope(grant,'/api/v1/internal/tenants/'+alpha+'/callbacks','POST',{principal:{roles:['provider_admin']}}),{spoof})).status,404);
  assert.equal((await h.command(h.envelope(grant,path,'GET',{}, {cookie:'fake'}),{spoof})).status,400);
  const revoked=h.envelope(grant,base+'/issuer-capabilities');h.sessions.delete(identity.hash);
  assert.equal((await h.command(revoked)).status,401);
});

test('anonymous bridge provides public configuration but cannot read issuer resources',async()=>{
  const h=bridgeHarness(),grant=await h.bootstrap({host:'pci.example.com'});
  assert.equal(grant.status,200);assert.equal(grant.sessionId,null);
  assert.equal((await h.command(h.envelope(grant,'/api/v1/tenant-registration-config'))).ok,true);
  assert.equal((await h.command(h.envelope(grant,'/api/v1/provider/tenants'))).status,401);
  const result=await h.command({...h.envelope(grant,''),action:'ping'});assert.equal(result.data.pong,true);
});

test('issuance emits correlated progress and field failures without changing the failed step',async()=>{
  const h=bridgeHarness(),prepared=await h.f.prepared(),grant=await h.bootstrap(h.credentials('principal'));
  const started=await h.command(h.envelope(grant,base+'/issuance-requests','POST',{configurationId:prepared.config.id},{'idempotency-key':'test-request-1234567890'}));
  assert.equal(started.ok,true);const path=base+'/issuance-requests/'+started.data.request.requestId;
  const invalid=await h.command(h.envelope(grant,path+'/advance','POST',{step:0,consent:false,values:{}}));
  assert.equal(invalid.ok,false);assert.equal(invalid.errors.field.category,'field');assert.ok(invalid.errors.fields.consent);
  assert.equal((await h.command(h.envelope(grant,path))).data.request.step,0);
  assert.equal((await h.command(h.envelope(grant,path+'/advance','POST',{step:0,consent:true,values:{}}))).next.step,1);
  const offerCommand=h.envelope(grant,path+'/offer','POST');
  const result=await h.command(offerCommand);assert.equal(result.ok,true);assert.match(result.data.offerUrl,/^openid-credential-offer:/);
  const events=h.events.map(e=>e.payload).filter(e=>e.requestId===offerCommand.requestId);
  assert.deepEqual(events.map(e=>e.data.stage),['accepted','processing','calling-service','confirming']);
  assert.equal(events.some(e=>JSON.stringify(e).includes('offerUrl')),false);
});

test('fragmented large commands are bounded, assembled once and retain authorization',async()=>{
  const h=bridgeHarness(),grant=await h.bootstrap(),cmd=h.envelope(grant,base+'/assets','POST',{data:{mediaType:'image/png',base64:'A'.repeat(160000)}});
  const encoded=JSON.stringify(cmd.payload),split=128000;
  assert.equal(await h.command({...cmd,payload:encoded.slice(0,split),meta:{...cmd.meta,chunk:{index:0,total:2}}}),null);
  const result=await h.command({...cmd,payload:encoded.slice(split),meta:{...cmd.meta,chunk:{index:1,total:2}}});
  // The image validator, rather than the bridge/frame size, rejects these bytes.
  assert.equal(result.ok,false);assert.equal(result.status,400);assert.match(JSON.stringify(result.errors),/PNG|image|mediaType|field/i);
  assert.equal((await h.command({...h.envelope(grant,base+'/assets'),payload:'x',meta:{...cmd.meta,chunk:{index:1,total:2}}})).status,400);
});
