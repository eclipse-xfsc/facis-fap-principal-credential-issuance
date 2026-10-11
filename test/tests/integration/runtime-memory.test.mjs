import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const source=fs.readFileSync('backend/functions/_common.js','utf8');
const helpers=source.slice(source.indexOf('function pciProcessState()'),source.indexOf('function mapRegistration('))+
 source.slice(source.indexOf('function getMailer()'),source.indexOf('async function sendMail('))+
 source.slice(source.indexOf('function pciSessionTokens()'));
function harness(){
 const pools=[],mailers=[],writes=[],persisted=new Map();
 class Pool {constructor(options){this.options=options;this.ended=0;pools.push(this);}async end(){this.ended++;}}
 const pg={Pool},nodemailer={createTransport(options){const value={options,closed:0,close(){this.closed++;}};mailers.push(value);return value;}};
 const global={get:key=>persisted.get(key),set(key,value){assert.equal(value,undefined,'runtime passed data to persistent context');writes.push(key);persisted.delete(key);}};
 const cfg={orceNamespace:'pci',mainHost:'pci.example.com',orceBasePath:'/pci-orce',databaseUrl:'postgresql://fixture@db/pci',smtp:{host:'mail',port:1025,secure:false,user:'',password:''}};
 function functions(config=cfg){return vm.runInNewContext(helpers+';({getPool,getMailer,pciSessionTokens,acquireGlobalLock,refreshGlobalLock,releaseGlobalLock})',{cfg:config,pg,nodemailer,global,crypto,URL,fs,pciErrors:{dependency:message=>Object.assign(Error(message),{status:503})},node:{warn(){throw new Error('Unexpected legacy cleanup failure');}}});}
 return {pools,mailers,writes,persisted,pg,cfg,functions};
}
test('Function nodes share volatile pools, mail and token state without persistent context writes',()=>{
 const h=harness(),a=h.functions(),b=h.functions();
 assert.equal(a.getPool(),b.getPool());assert.equal(a.getMailer(),b.getMailer());
 a.pciSessionTokens().set('request',{token:'synthetic-private-token',expiresAt:Date.now()+60000});
 assert.equal(b.pciSessionTokens().get('request').token,'synthetic-private-token');
 const lock=a.acquireGlobalLock('tenant',10000);assert.ok(lock);assert.equal(b.acquireGlobalLock('tenant'),null);
 assert.equal(b.refreshGlobalLock('tenant','wrong'),false);b.releaseGlobalLock('tenant',lock);assert.ok(a.acquireGlobalLock('tenant'));
 const other=h.functions({...h.cfg,orceNamespace:'other'});assert.notEqual(other.getPool(),a.getPool());assert.equal(other.pciSessionTokens().has('request'),false);
 assert.deepEqual(h.writes,[]);assert.equal(h.persisted.size,0);
});
test('runtime upgrade clears legacy holders and credential changes close old transports',()=>{
 const h=harness();let legacyClosed=0;
 h.persisted.set('fapPciPgPoolHolder',{url:'legacy-fixture',pool:{async end(){legacyClosed++;}}});
 h.persisted.set('fapPciMailerHolder',{key:'legacy-fixture',transport:{close(){legacyClosed++;}}});
 const a=h.functions(),old=a.getPool(),mailer=a.getMailer();let natsClosed=0;
 old.pciNative={nats:{close(){natsClosed++;}}};a.pciSessionTokens().set('session',{token:'synthetic-private-token',expiresAt:Date.now()+60000});
 assert.equal(legacyClosed,2);assert.equal(h.persisted.size,0);assert.equal(h.writes.length,2);
 h.cfg.databaseUrl='postgresql://fixture@replacement/pci';assert.notEqual(a.getPool(),old);assert.equal(old.ended,1);assert.equal(natsClosed,1);assert.equal(old.pciTokens.size,0);
 h.cfg.smtp.host='replacement-mail';assert.notEqual(a.getMailer(),mailer);assert.equal(mailer.closed,1);
});
test('missing telemetry trust cannot fail a completed operation or emit its payload',()=>{
 const runtime=fs.readFileSync('backend/sr2/runtime.js','utf8');
 const observe=runtime.slice(runtime.indexOf('function pciObserve('),runtime.indexOf('async function handlePciNative('));
 const metrics=new Map(),warnings=[];
 const fn=vm.runInNewContext(observe+';pciObserve',{
  pciRuntime:()=>({metrics}),envValue:name=>name==='PCI_OTLP_HTTP_ENDPOINT'?'https://collector.invalid':'/missing/ca.crt',
  fs:{readFileSync(){throw new Error('sensitive filesystem detail');}},node:{warn:message=>warnings.push(message)}
 });
 assert.doesNotThrow(()=>fn('issuance','ok',Date.now()));
 assert.equal(metrics.get('issuance:ok').count,1);
 assert.deepEqual(warnings.map(JSON.parse),[{event:'pci.telemetry.failed',code:'PCI-TELEMETRY-CA'}]);
});
test('database and mail TLS settings enforce certificate verification and TLS 1.3',()=>{
 const h=harness();h.cfg.databaseTls={enabled:true};h.cfg.smtp.requireTLS=true;const a=h.functions();
 const tls=a.getPool().options.ssl;assert.equal(tls.minVersion,'TLSv1.3');assert.equal(tls.maxVersion,'TLSv1.3');assert.equal(tls.rejectUnauthorized,true);
 const mail=a.getMailer().options;assert.equal(mail.requireTLS,true);assert.equal(mail.tls.minVersion,'TLSv1.3');assert.equal(mail.tls.rejectUnauthorized,true);
 h.cfg.databaseUrl+='?sslmode=no-verify';assert.throws(()=>a.getPool(),error=>error.status===503);
 h.cfg.databaseUrl='postgresql://fixture@db/pci?sslmode=verify-full&application_name=pci';
 const strict=a.getPool().options;assert.equal(strict.ssl.minVersion,'TLSv1.3');assert.equal(strict.ssl.rejectUnauthorized,true);
 assert.equal(new URL(strict.connectionString).searchParams.has('sslmode'),false);assert.equal(new URL(strict.connectionString).searchParams.get('application_name'),'pci');
});
test('multiline upstream errors cannot inject participant data into operator diagnostics',()=>{
 const body=source.slice(source.indexOf('class PciError'),source.indexOf('function emit(')),logs=[];
 const problem=vm.runInNewContext(body+';problem',{Symbol,crypto,msg:{_msgid:'safe-reference',pciAction:'issuer.key-create'},node:{error:line=>logs.push(JSON.parse(line))}});
 const error=new Error('upstream refusal\nPRIVATE-CLAIM-DO-NOT-LOG');error.stack+='\n    at complete (Function node:9b42b5002c50a205 [M11_PCI-IssuerRuntime]:12:34)';
 const response=problem(error);assert.equal(response.status,500);assert.equal(JSON.stringify({logs,response}).includes('PRIVATE-CLAIM'),false);assert.equal(logs[0].frames[0].line,12);
});
