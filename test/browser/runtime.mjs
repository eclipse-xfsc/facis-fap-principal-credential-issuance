// Offline Chromium regressions for the actual Vue app and reference shell.
// Native/identity services are fixtures; this is not deployment acceptance.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fixture,alpha} from '../support/sr2-fixture.mjs';
import {httpHarness} from '../support/sr2-http.mjs';
const {chromium}=await import(process.env.PCI_BROWSER_MODULE||'playwright');
const f=fixture(),dispatch=httpHarness(f);await f.prepared();
const tenant={tenantId:alpha,organizationName:'Alpha',primaryDomain:'alpha-pci.example.com',state:'active'},principal=f.principal();
const source=file=>fs.readFileSync(file,'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname==='/pci-orce/ui/'){
   const view=['tenant','provider','registration','welcome'].includes(url.searchParams.get('view'))?url.searchParams.get('view'):'tenant';
   const session=view==='provider'?{subject:'provider',username:'Provider',roles:['provider_admin']}:view==='tenant'?principal:null;
   const tenantData=['tenant','welcome'].includes(view)?tenant:null;
   const script=`const {createApp,ref,computed,onMounted,onUnmounted,reactive}=Vue;
const runtime={basePath:'/pci-orce',apiBasePath:'/pci-orce/api/v1',uiPath:'/pci-orce/ui/'};
const applyPublicConfiguration=()=>{};const completeLoginFromLocation=async()=>null;const beginLogin=async()=>{};
const onBridgeReconnect=()=>()=>{};const initializeBridge=()=>{store.live.connected=true;};const bridgePing=async()=>({pong:true});
${source('src/state/store.js')}
${source('src/state/reducers.js')}
${source('src/components/feedback.js')}
const request=async(path,options={})=>{const response=await fetch(path,{...options,headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});return decodeHttpResponse(response);};
const api={registrationConfig:async()=>({orceBasePath:'/pci-orce',registrationMode:'public',hostnameTemplate:'{slug}-pci.example.com'}),session:async()=>({session:${JSON.stringify(session)}}),tenantContext:async()=>{const tenant=${JSON.stringify(tenantData)};if(!tenant)throw Object.assign(Error('No tenant'),{status:404});return {tenant};},tenantMembers:async()=>({items:[{subject:'principal',username:'Principal',enabled:true,roles:['principal']}]}),platformStatus:async()=>({ready:true}),registrations:async()=>({items:[]}),tenants:async()=>({items:[]})};
${source('src/qr-tables.js')}
${source('src/qr.js')}
${source('src/sr2.js')}
${source('src/main.js')}`;
   res.setHeader('Content-Type','text/html; charset=utf-8');
   return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PCI offline UI regression</title><style>${fs.readFileSync('src/styles.css','utf8')}</style></head><body><div id="app"></div><script>${fs.readFileSync('vendor/vue.global.prod.js','utf8')}</script><script>${script}</script></body></html>`);
  }
  if(url.pathname.endsWith('/identity-provider')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({item:{version:1,state:'active',mode:'keycloak',displayName:'Organization account',issuer:'',clientId:'',audience:'',scopes:'openid profile email'},redirectUri:'https://identity.example.com/broker/endpoint'}));}
  if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  let body='';for await(const chunk of req)body+=chunk;
  const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>['content-type','if-match','idempotency-key'].includes(name)));
  const result=await dispatch(req.url,{method:req.method,body:body||undefined,headers});res.writeHead(result.status,{'Content-Type':'application/json',...result.headers});res.end(JSON.stringify(result.body));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({detail:error.message}));}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const failures=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>failures.push(error.message));
 const origin=`http://127.0.0.1:${server.address().port}/pci-orce/ui/`;
 for(const view of ['registration','provider','welcome','tenant']){
  await page.goto(origin+'?view='+view+(view==='provider'?'#/provider':''));
  if(view==='tenant')await page.getByRole('button',{name:'Tenant settings',exact:true}).waitFor();
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   const geometry=await page.evaluate(()=>{const shell=document.querySelector('.app-shell');return {width:shell.getBoundingClientRect().width,radius:getComputedStyle(shell).borderRadius,canvas:getComputedStyle(document.documentElement).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+2};});
   assert.ok(geometry.width<=1200);assert.equal(geometry.radius,'20px');assert.equal(geometry.canvas,'rgb(225, 231, 239)');assert.equal(geometry.overflow,false,view+' overflow at '+width);
   assert.equal(await page.locator('h1').evaluateAll(headings=>headings.every(h=>parseFloat(getComputedStyle(h).fontSize)<=28)),true);
  }
 }
 await page.getByRole('button',{name:'Tenant settings',exact:true}).click();
 await page.getByRole('heading',{name:'Tenant branding',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Signing keys',exact:true}).count(),0);
 await page.getByRole('button',{name:'Signing keys',exact:true}).click();await page.getByRole('heading',{name:'Signing keys',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Tenant branding',exact:true}).count(),0);
 await page.getByRole('button',{name:'Configurations',exact:true}).click();await page.getByRole('button',{name:'+ Create configuration',exact:true}).click();
 await page.getByLabel('Stable identifier',{exact:true}).fill('BrowserEmployee');await page.getByLabel('Name',{exact:true}).fill('Browser employee');await page.getByLabel('Tenant key reference',{exact:true}).fill('issuer');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Validate',exact:true}).click();await page.getByRole('alert').waitFor();
 const error=await page.getByRole('alert').innerText();assert.match(error,/prerequisite|connector|journey/i);
 await page.getByRole('button',{name:'Tenant settings',exact:true}).click();await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByRole('button',{name:'Refresh',exact:true}).waitFor();assert.equal(await page.getByRole('alert').innerText(),error);
 await page.getByRole('button',{name:'Dismiss error',exact:true}).click();assert.equal(await page.getByRole('alert').count(),0);
 await page.getByRole('button',{name:'Verify credential',exact:true}).click();await page.getByRole('heading',{name:'Verify your credential',exact:true}).waitFor();
 await page.goto(origin+'?view=provider#/provider');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
 assert.equal(new URL(page.url()).hash,'#/provider');assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
 assert.deepEqual(failures,[]);
 console.log(JSON.stringify({suite:'offline-browser',status:'PASS',widths:[1440,390],nativeServices:'FIXTURES',checks:['reference-shell-four-views','narrow-overflow','one-settings-task','configuration-create','typed-validation','persistent-error','dismiss-error','presentation-panel','skip-link','browser-errors']}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
