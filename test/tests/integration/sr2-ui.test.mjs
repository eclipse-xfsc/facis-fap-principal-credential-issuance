import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import { fixture,alpha } from '../../support/sr2-fixture.mjs';
import { httpHarness } from '../../support/sr2-http.mjs';
import crypto from 'node:crypto';
import {pciQrImage} from '../../../src/qr.js';

// Executes the checked-in Vue compiler and renderer with an in-memory host.
// This is component integration, not a browser/layout/accessibility claim.
function vueContext(){
 const messages=[];
 const document={createElement(){return {set innerHTML(value){this.textContent=String(value).replace(/&(amp|lt|gt|quot|apos);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x])).replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,x)=>String.fromCodePoint(x[0]==='x'?parseInt(x.slice(1),16):Number(x)));this.children=[{getAttribute:()=>this.textContent.replace(/^<div foo="/, '').replace(/">$/, '')}];},get innerHTML(){return this.textContent || '';}};}};
 const ctx={pciQrImage,console:{warn:(...args)=>messages.push(args.join(' ')),error:(...args)=>messages.push(args.join(' ')),log(){}},document,crypto,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,window:{location:{origin:'https://alpha-pci.example.com'},confirm:()=>true,prompt:()=>null},runtime:{basePath:''}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('vendor/vue.global.prod.js','utf8'),ctx);Object.assign(ctx,{ref:ctx.Vue.ref,computed:ctx.Vue.computed,onMounted:ctx.Vue.onMounted});
 vm.runInContext(fs.readFileSync('src/sr2.js','utf8')+'\nglobalThis.component=Sr2Console;',ctx);return {ctx,messages};
}
test('both Vue templates compile offline using the pinned runtime',()=>{
 const {ctx}=vueContext();assert.equal(typeof ctx.Vue.compile(ctx.component.template),'function');
 const main=fs.readFileSync('src/main.js','utf8').replace(/^import.*;\s*$/gm,'').replace('createApp(App).mount("#app");','globalThis.rootComponent=App;');vm.runInContext(main,ctx);assert.equal(typeof ctx.Vue.compile(ctx.rootComponent.template),'function');
});
test('issuer component executes create/edit/preview and grant/revoke handlers against the real HTTP wrapper',async()=>{
 const {ctx,messages}=vueContext(),f=fixture(),http=httpHarness(f);ctx.request=async(path,options)=>{const r=await http(path,options);if(r.status>=400)throw new Error(r.body.detail);return r.body;};ctx.api={tenantMembers:async()=>({items:[{subject:'issuer',username:'Issuer',enabled:true},{subject:'principal',username:'Principal',enabled:true}]})};
 const make=(type,text='')=>({type,tagName:type.toUpperCase(),text,children:[],props:{},parent:null,value:'',selected:false,multiple:false,
  addEventListener(){},removeEventListener(){},dispatchEvent(){},setAttribute(k,v){this.props[k]=v;},removeAttribute(k){delete this.props[k];},get options(){return this.children.filter(c=>c.type==='option');}});
 const host={createElement:tag=>make(tag),createText:t=>make('text',t),createComment:t=>make('comment',t),setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[];},parentNode:n=>n.parent,nextSibling:n=>{const a=n.parent?.children || [];return a[a.indexOf(n)+1] || null;},patchProp:(n,k,prev,next)=>{n.props[k]=next;if(k==='value'){n.value=next;n._value=next;}if(k==='multiple')n.multiple=next!==null;},insert(n,p,anchor){if(n.parent){const old=n.parent.children;old.splice(old.indexOf(n),1);}n.parent=p;const index=anchor?p.children.indexOf(anchor):-1;p.children.splice(index<0?p.children.length:index,0,n);},remove(n){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);},insertStaticContent(content,p,anchor){const n=make('static',content);this.insert(n,p,anchor);return [n,n];}};
 // Vue invokes host hooks without a receiver.
 host.insertStaticContent=(content,p,anchor)=>{const n=make('static',content);host.insert(n,p,anchor);return [n,n];};
 const renderer=ctx.Vue.createRenderer(host),root=make('root');const app=renderer.createApp(ctx.component,{tenant:{tenantId:alpha,organizationName:'Alpha',state:'active'},session:f.principal()});const ui=app.mount(root);
 await ui.refresh();assert.equal(ui.cap.tenantAdmin,true);ui.tab='configurations';ui.newConfig();ui.configForm.identifier='UiCredential';ui.configForm.name='UI credential';ui.configForm.keyRef='tenant-key';await ui.saveConfig();assert.equal(ui.error,'');assert.ok(ui.selected.id);const initial=ui.selected.version;
 ui.configForm.description='Updated through the component';await ui.saveConfig();assert.equal(ui.selected.version,initial+1);await ui.configAction('preview');assert.equal(ui.preview.description,'Updated through the component');
 ui.tab='delegation';ui.grant.subject='issuer';await ui.assign();const a=ui.assignments.find(a=>!a.revoked);assert.ok(a);await ui.revokeAssignment(a);assert.equal(ui.assignments.find(x=>x.id===a.id).revoked,true);
 const prepared=await f.prepared('UiPublished');await ui.refresh();ui.tab='request';await ui.start(prepared.config.id);ui.consent=true;await ui.next();await ui.prepareOffer();assert.ok(ui.offer?.offerUrl,ui.error);assert.ok(ui.qr?.path);
 // Exercise the revised navigation, filters, connector scopes and status actions.
 ui.navigate('configurations');ui.query='UiPublished';assert.equal(ui.filteredConfigs.length,1);ui.configState='draft';assert.equal(ui.filteredConfigs.length,0);ui.configState='all';ui.query='';
 ui.navigate('connectors');ui.editConnector(ui.connectors.find(c=>c.id===prepared.connector.id));ui.connectorForm.configurationIds=[prepared.config.id];await ui.saveConnector();assert.equal(ui.error,'');ui.newConnector();assert.equal(ui.connectorForm.configurationIds.length,0);
 const completedId=await f.offered(prepared.config);await f.api.complete(f.principal('principal'),completedId,'ephemeral',null);
 ui.navigate('history');ui.historyConfig=prepared.config.id;await ui.loadHistory();const issued=ui.history.find(e=>e.type==='issued');assert.ok(issued.credentialId);ui.search.credentialId=issued.credentialId;await ui.loadHistory();await ui.revoke(issued.requestId);assert.ok(ui.history.every(e=>e.currentState==='revoked'));
 for(const section of ui.sections){ui.navigate(section.id);await ctx.Vue.nextTick();}
 await ctx.Vue.nextTick();assert.equal(messages.length,0,messages.join('\n'));app.unmount();
});
