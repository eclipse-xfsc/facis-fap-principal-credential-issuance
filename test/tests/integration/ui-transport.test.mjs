import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {bridgeHarness} from '../../support/ui-bridge.mjs';
import {alpha,configuration} from '../../support/sr2-fixture.mjs';
import {sr2Branding} from '../../../backend/sr2/domain.js';

function frontend(backend) {
  const observers={},sent=[],network=[],timers=new Set(),received=[];
  const client={_socket:{id:'frontend_socket_123'},onChange:(name,fn)=>{observers[name]=fn;},start(){},get:()=>false,
    async send(message){sent.push(message);const count=backend.events.length;
      const result=await backend.command(message.payload,{socketId:client._socket.id});
      for(const event of backend.events.slice(count)){received.push(event);observers.msg(event);}
      if(result){received.push({payload:result});observers.msg({payload:result});}
    }};
  const identity=backend.credentials();
  const context=vm.createContext({window:{uibuilder:client},crypto,URL,URLSearchParams,console,reactive:value=>value,
    setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);},
    runtime:{basePath:'/pci-orce',apiBasePath:'/pci-orce/api/v1'},
    fetch:async(path,options)=>{network.push({path,options});assert.equal(path,'/pci-orce/api/v1/auth/bridge');const r=await backend.bootstrap(identity,JSON.parse(options.body).socketId);return {ok:r.status<400,status:r.status,json:async()=>r};}});
  for(const path of ['src/state/store.js','src/state/reducers.js','src/services/transport.js'])vm.runInContext(fs.readFileSync(path,'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),context);
  const api=vm.runInContext('({store,initializeBridge,sendCommand,onBridgeReconnect,decodeHttpResponse,reduceUiMessage})',context);
  return {api,client,observers,sent,received,network,close(){for(const id of timers)clearTimeout(id);}};
}
test('real frontend sends business commands only through the bridge after connection acknowledgement',async()=>{
  const b=bridgeHarness(),h=frontend(b);try{
    h.api.initializeBridge();assert.equal(h.api.store.live.connected,false);assert.equal(h.network.length,0);
    h.observers.ioConnected(true);
    const value=await h.api.sendCommand('/api/v1/tenants/'+alpha+'/credential-configurations',{method:'POST',body:JSON.stringify({data:configuration()})});
    assert.ok(value.item.id);assert.equal(h.network.length,1);assert.equal(h.sent.length,1);
    assert.equal(h.sent[0].payload.type,'command');assert.equal(h.api.store.ui.pending,0);
    let restored=0;h.api.onBridgeReconnect(()=>{restored++;});h.observers.ioConnected(false);assert.equal(h.api.store.live.connected,false);
    h.client._socket.id='reconnected_socket_456';h.observers.ioConnected(true);
    for(let i=0;i<20 && !restored;i++)await new Promise(resolve=>setTimeout(resolve,2));
    assert.equal(restored,1);assert.equal(h.network.length,2);
    h.observers.ioConnected(true);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(restored,1);
  }finally{h.close();}
});

test('invalid HTTP success bodies fail explicitly and intentional 204 remains valid',async()=>{
  const h=frontend(bridgeHarness());try{
    await assert.rejects(h.api.decodeHttpResponse({status:200,ok:true,json:async()=>{throw Error('bad JSON');}}),{code:'PCI-UI-PROTOCOL'});
    await assert.rejects(h.api.decodeHttpResponse({status:200,ok:true,json:async()=>null}),{code:'PCI-UI-PROTOCOL'});
    assert.equal(await h.api.decodeHttpResponse({status:204,ok:true}),null);
    await assert.rejects(h.api.decodeHttpResponse({status:403,ok:false,json:async()=>({code:'DENIED',detail:'Denied',correlation_id:'reference'})}),{code:'DENIED',correlationId:'reference'});
  }finally{h.close();}
});

test('reducer correlates messages, handles all error categories and never infers success',()=>{
  const h=frontend(bridgeHarness());try{
    const pending={requestId:'request-1234567890',action:'request',path:'/api/v1/platform/status'};
    const base={version:1,type:'result',requestId:pending.requestId,action:'request',status:200};
    assert.equal(h.api.reduceUiMessage({...base,data:{}},pending),null);
    assert.equal(h.api.reduceUiMessage({...base,ok:true,requestId:'another'},pending),null);
    assert.equal(h.api.reduceUiMessage({...base,ok:true},pending).error.code,'PCI-UI-PROTOCOL');
    for(const category of ['field','action','integration','system']){
      const error=h.api.reduceUiMessage({...base,ok:false,status:400,errors:{[category]:{category,message:'Try a different input',code:'SAFE',reference:'trace-1'},fields:category==='field'?{title:'Enter a title'}:{}}},pending).error;
      assert.equal(error.category,category);assert.equal(error.correlationId,'trace-1');
    }
    const value={platform:{phase:'ready'}};h.api.reduceUiMessage({...base,ok:true,data:value},pending);assert.deepEqual(h.api.store.platform,value);
    h.api.reduceUiMessage({...base,type:'event',event:'jobProgress',data:{jobId:pending.requestId,stage:'processing',label:'Preparing offer',progress:null}},pending);
    assert.equal(h.api.store.ui.jobs[pending.requestId].label,'Preparing offer');
    h.api.reduceUiMessage({...base,ok:true,data:{}},pending);assert.equal(h.api.store.ui.jobs[pending.requestId],undefined);
  }finally{h.close();}
});

test('disconnect rejects uncertain work once and never automatically resends a mutation',async()=>{
  const h=frontend(bridgeHarness());try{
    h.api.initializeBridge();h.observers.ioConnected(true);h.client.send=message=>h.sent.push(message);
    const result=h.api.sendCommand('/api/v1/tenant-registrations',{method:'POST',body:'{}'});
    for(let i=0;i<20&&!h.sent.length;i++)await new Promise(resolve=>setTimeout(resolve,2));
    const rejected=assert.rejects(result,{code:'PCI-UI-DISCONNECTED'});h.observers.ioConnected(false);await rejected;
    assert.equal(h.sent.length,1);assert.equal(h.api.store.ui.pending,0);
    h.observers.msg({payload:{version:1,type:'result',action:'request',requestId:h.sent[0].payload.requestId,ok:true,data:{}}});
    assert.equal(h.api.store.ui.pending,0);
  }finally{h.close();}
});

test('branding accepts tenant identity but cannot remove the shared visual standard',()=>{
  const value=sr2Branding({title:'Example organization',description:'Credentials',footer:'Support',layout:'focused'});
  assert.equal(value.accent,'#005fff');assert.equal(value.font,'system');assert.equal(value.corners,'rounded');
  for(const override of [{font:'serif'},{corners:'square'},{accent:'#173c67'},{background:'#ffffff'}])assert.throws(()=>sr2Branding({...value,...override}));
});
