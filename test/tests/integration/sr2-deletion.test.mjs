import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {alpha} from '../../support/sr2-fixture.mjs';
async function deletion({wrongOwner=false,replaced=false}={}){
 const tenant={tenant_id:alpha,tenant_slug:'alpha',owner_uid:'owner-alpha',state:'deleting',desired_generation:2,primary_domain:'alpha-pci.example.com'},calls=[];
 const objects=new Map(['HTTPRoute','ConfigMap'].map(kind=>[kind,{apiVersion:kind==='ConfigMap'?'v1':'gateway.networking.k8s.io/v1',kind,metadata:{name:'pci-tenant-alpha',namespace:'orce',uid:kind+'-uid',resourceVersion:'7',labels:{'app.kubernetes.io/managed-by':'fap-pci-orce','xfsc.org/pci-tenant-id':alpha,'xfsc.org/pci-owner-uid':wrongOwner&&kind==='ConfigMap'?'other-owner':'owner-alpha'}}}]));
 const pool={connect:async()=>({query:async()=>({rows:[]}),release(){}}),async query(sql){
  if(sql.startsWith('SELECT * FROM tenants WHERE state'))return {rows:[tenant]};
  if(sql.startsWith('SELECT * FROM tenants WHERE tenant_id'))return {rows:[tenant]};
  if(sql.startsWith('SELECT keycloak_subject'))return {rows:[{keycloak_subject:'alpha-admin'}]};
  if(sql.startsWith('SELECT primary_domain'))return {rows:[{primary_domain:'beta-pci.example.com'}]};
  if(sql.startsWith('UPDATE tenants SET state=CASE'))return {rows:[tenant]};
  if(sql.startsWith("UPDATE tenants SET state='deleted'")){tenant.state='deleted';return {rows:[tenant]};}
  if(sql.startsWith('UPDATE tenant_members'))return {rows:[]};
  throw new Error('Unexpected deletion SQL');
 }};
 const names=['msg','getPool','parseBody','params','query','crypto','cfg','acquireGlobalLock','releaseGlobalLock','mapTenant','k8sGet','assertK8sMutationAllowed','k8sDescriptor','k8sCollectionPath','k8sExpect','keycloakAdminRaw','keycloakAdmin','keycloakAttributeValue','uiUrl','publicOrigin','emit','emitError','node'];
 const fn=new Function(...names,fs.readFileSync('backend/functions/reconcile.js','utf8'));
 await fn({pciTransport:'internal',pciInternal:true,pciAction:'tenant.reconcile.all'},()=>pool,()=>({}),()=>({}),()=>({}),{}, {orceNamespace:'orce',mainHost:'pci.example.com',orceBasePath:'',keycloak:{realm:'pci',uiClientId:'pci-ui'}},()=> 'lease',()=>{},r=>({...r}),async(v,kind)=>objects.get(kind)||null,object=>{assert.equal(object.metadata.namespace,'orce');},async(v,kind)=>({kind}),()=>'/namespaced/resources',async(method,path,options)=>{calls.push({method,path,body:JSON.parse(options.body)});if(replaced)throw new Error('Kubernetes UID precondition failed');const kind=options.body.includes('HTTPRoute-uid')?'HTTPRoute':'ConfigMap';objects.delete(kind);},async(method,path)=>{calls.push({method,path});return method==='GET'?{status:200,text:JSON.stringify({attributes:{tenant_id:[alpha]}})}:{status:204};},async(method,path,body)=>{calls.push({method,path,body});return method==='GET'?[{id:'ui',clientId:'pci-ui'}]:null;},(user,name)=>user.attributes[name]?.[0],(host,base)=>'https://'+host+base+'/ui/',host=>'https://'+host,(status,payload)=>({status,payload}),error=>{throw error;},{status(){},warn(){}});
 return {calls,tenant};
}
test('tenant reconciler checks ownership of all targets before any deletion',async()=>{const r=await deletion({wrongOwner:true});assert.equal(r.calls.length,0);assert.equal(r.tenant.state,'deleting');});
test('tenant deletion uses Kubernetes UID/version preconditions and preserves shared Keycloak objects',async()=>{
 const r=await deletion();assert.equal(r.tenant.state,'deleted');const resources=r.calls.filter(c=>c.body?.kind==='DeleteOptions');assert.equal(resources.length,2);for(const c of resources){assert.equal(c.body.preconditions.resourceVersion,'7');assert.ok(c.body.preconditions.uid);assert.equal(c.body.propagationPolicy,'Foreground');}
 const deletes=r.calls.filter(c=>c.method==='DELETE'&&!c.body);assert.deepEqual(deletes.map(c=>c.path),['/admin/realms/pci/users/alpha-admin']);assert.ok(r.calls.some(c=>c.method==='PUT'&&c.body.webOrigins.includes('https://beta-pci.example.com')));
});
test('resource replacement races leave deletion pending rather than deleting the replacement',async()=>{const r=await deletion({replaced:true});assert.equal(r.tenant.state,'deleting');assert.equal(r.calls.length,1);});
