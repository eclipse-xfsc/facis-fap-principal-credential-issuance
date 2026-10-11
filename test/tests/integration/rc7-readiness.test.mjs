import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const common=fs.readFileSync('backend/functions/_common.js','utf8');
const raw=common.slice(common.indexOf('function requestRaw('),common.indexOf('async function requestJson('));
const status=fs.readFileSync('backend/functions/status.js','utf8');
const names=['msg','getPool','cfg','k8sGet','conditionStatus','gatewayAddress','dnsMatchesHost','requestRaw','pciErrors','node','emit','emitError'];
const compiled=new Function(...names,status);

async function check({code=200,body,native=true,programmed=true,dns=true}={}){
 const issuer='https://demo-tenant.example.test/orce/identity/realms/fap-pci';
 const server=http.createServer((req,res)=>{res.writeHead(code,{'content-type':'application/json'});res.end(body??JSON.stringify({issuer}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const warnings=[];
 const cfg={version:'0.5.0-rc.7',orceBasePath:'/pci-orce',mainHost:'pci.example.test',gatewayName:'pci-gateway',infrastructureNamespace:'infrastructure',keycloak:{publicUrl:'https://demo-tenant.example.test/orce/identity',internalUrl:`http://127.0.0.1:${server.address().port}`,realm:'fap-pci'}};
 const pool={pciNative:{nats:{ready:native},subscription:native?()=>{}:null},async query(sql){return {rows:sql==='SELECT 1'?[]:[{state_value:{mainHost:cfg.mainHost}}]};}};
 const requestRaw=new Function('URL','envValue','cfg','fs','http','https','Buffer',raw+'\nreturn requestRaw;')(URL,()=> 'cluster',cfg,fs,http,https,Buffer);
 try{
  // Use the actual shared HTTP helper and a real HTTP response, rather than
  // mocking the nonexistent data field that caused the live false negative.
  const response=await requestRaw(cfg.keycloak.internalUrl);
  assert.equal(response.data,undefined);assert.equal(typeof response.text,'string');
  const result=await compiled({pciAction:'status.ready'},()=>pool,cfg,async()=>({}),()=>({status:programmed?'True':'False'}),()=> '192.0.2.1',async()=>dns,requestRaw,{dependency:detail=>Object.assign(new Error(detail),{status:503,code:'PCI-DEPENDENCY-503-001'})},{warn:line=>warnings.push(JSON.parse(line))},(status,body)=>({status,body}),error=>({status:error.status,body:{code:error.code,detail:error.message}}));
  return {result,warnings};
 }finally{await new Promise(resolve=>server.close(resolve));}
}

test('readiness accepts discovery text from the real HTTP helper when every dependency is ready',async()=>{
 const {result,warnings}=await check();assert.equal(result.status,200);assert.equal(result.body.status,'ready');assert.deepEqual(warnings,[]);
});
test('readiness rejects mismatched, malformed and non-successful discovery responses',async()=>{
 for(const options of [{body:JSON.stringify({issuer:'https://wrong.example.test'})},{body:'not JSON'},{code:503},{body:'null'}]){
  const {result,warnings}=await check(options);assert.equal(result.status,503);assert.deepEqual(warnings,[{event:'pci.readiness.failed',check:'keycloak-discovery'}]);
 }
});
test('readiness still requires the listener, Gateway and DNS and logs only a fixed check label',async()=>{
 for(const [options,label] of [[{native:false},'native-listener'],[{programmed:false},'gateway'],[{dns:false},'dns']]){
  const {result,warnings}=await check(options);assert.equal(result.status,503);assert.deepEqual(warnings,[{event:'pci.readiness.failed',check:label}]);
 }
});
