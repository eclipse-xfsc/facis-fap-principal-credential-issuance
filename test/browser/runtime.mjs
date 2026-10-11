// Offline Chromium component/layout regression. Native services are fixtures;
// this does not replace live XFSC Executor, Keycloak, OCM or wallet acceptance.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fixture,alpha} from '../support/sr2-fixture.mjs';
import {httpHarness} from '../support/sr2-http.mjs';
const {chromium}=await import(process.env.PCI_BROWSER_MODULE||'playwright');
const f=fixture(),dispatch=httpHarness(f);await f.prepared();
const tenant={tenantId:alpha,organizationName:'Alpha',state:'active'},principal=f.principal();
const pageSource=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PCI offline component regression</title><style>${fs.readFileSync('src/styles.css','utf8')}</style></head><body><main id="app"></main><script>${fs.readFileSync('vendor/vue.global.prod.js','utf8')}</script><script>
const {ref,computed,onMounted}=Vue;const runtime={basePath:''};const pciQrImage=()=>null;
const request=async(path,options={})=>{const response=await fetch(path,options);const data=await response.json();if(!response.ok){const error=new Error(data.detail);error.code=data.code;throw error;}return data;};
const api={tenantMembers:async()=>({items:[{subject:'principal',username:'Principal',enabled:true}]})};
${fs.readFileSync('src/sr2.js','utf8')}
Vue.createApp(Sr2Console,{tenant:${JSON.stringify(tenant)},session:${JSON.stringify(principal)}}).mount('#app');</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 try{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(pageSource);}if(req.url.endsWith('/identity-provider')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({item:{version:1,state:'active',mode:'keycloak',displayName:'Organization account',issuer:'',clientId:'',audience:'',scopes:'openid profile email'},redirectUri:'https://identity.example.com/broker/endpoint'}));}if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
 let body='';for await(const chunk of req)body+=chunk;const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>['content-type','if-match','idempotency-key'].includes(name)));const result=await dispatch(req.url,{method:req.method,body:body||undefined,headers});res.writeHead(result.status,{'Content-Type':'application/json',...result.headers});res.end(JSON.stringify(result.body));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({detail:error.message}));}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const failures=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>failures.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByRole('button',{name:'Tenant settings',exact:true}).click();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});const key=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Signing keys',exact:true})});const branding=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Tenant branding',exact:true})});
  const a=await key.boundingBox(),b=await branding.boundingBox();assert.ok(a&&b);assert.ok(b.y-a.y-a.height>=0&&b.y-a.y-a.height<=40,'Branding layout gap at '+width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Horizontal overflow at '+width);
 }
 await page.getByRole('button',{name:'Configurations',exact:true}).click();await page.getByRole('button',{name:'+ Create configuration',exact:true}).click();await page.getByLabel('Stable identifier',{exact:true}).fill('BrowserEmployee');await page.getByLabel('Name',{exact:true}).fill('Browser employee');await page.getByLabel('Tenant key reference',{exact:true}).fill('issuer');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Validate',exact:true}).click();await page.getByRole('alert').waitFor();const error=await page.getByRole('alert').innerText();assert.match(error,/prerequisite|connector|journey/i);
 await page.getByRole('button',{name:'Tenant settings',exact:true}).click();await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Refresh',exact:true}).waitFor();assert.equal(await page.getByRole('alert').innerText(),error);await page.getByRole('button',{name:'Dismiss error',exact:true}).click();assert.equal(await page.getByRole('alert').count(),0);
 await page.getByRole('button',{name:'Verify credential',exact:true}).click();await page.getByRole('heading',{name:'Verify your credential',exact:true}).waitFor();
 assert.deepEqual(failures,[]);console.log(JSON.stringify({suite:'offline-browser',status:'PASS',widths:[1440,390],nativeServices:'FIXTURES',checks:['settings-layout','narrow-overflow','configuration-create','typed-validation','persistent-error','dismiss-error','presentation-panel','browser-errors']}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
