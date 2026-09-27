import fs from 'node:fs';
import crypto from 'node:crypto';
import { Sr2Error, sr2Uuid, sr2Object } from '../../backend/sr2/domain.js';
import { createSr2Service } from '../../backend/sr2/service.js';
import { extendSr2Issuance } from '../../backend/sr2/issuance.js';
import { alpha } from './sr2-fixture.mjs';
const routes=JSON.parse(fs.readFileSync('backend/sr2/routes.json')).flatMap(m=>m.routes);
class PciError extends Error {constructor(status,code,title,detail){super(detail);this.status=status;this.code=code;}}
const pciErrors={invalidTenantContext:()=>new PciError(403,'TENANT','','Invalid tenant context'),notFound:()=>new PciError(404,'NOT_FOUND','','Not found'),forbidden:()=>new PciError(403,'FORBIDDEN','','Forbidden'),unauthorized:()=>new PciError(401,'UNAUTHORIZED','','Unauthorized'),validation:detail=>new PciError(400,'VALIDATION','',detail)};
const names=['msg','Sr2Error','sr2Uuid','sr2Object','PciError','pciErrors','requestHeaders','routedHost','parseBody','params','query','getPool','createSr2Store','createSr2Adapters','createSr2Service','extendSr2Issuance','cfg','envList','publicUrl','normalizeHost','requireSession','bearerToken','crypto','emit','emitError'];
const compiled=new Function(...names,fs.readFileSync('backend/sr2/http.js','utf8')+'\nreturn handleSr2('+JSON.stringify(routes.map(r=>r[4]))+');');
export function httpHarness(f,subject='admin') {
 return async function dispatch(path,{method='GET',body,headers={},transport='http',principal,rawHeaders=[],remoteAddress='127.0.0.1'}={}){
  const u=new URL(path,'https://alpha-pci.example.com');let route,params={};
  for(const r of routes){const names=[];const regex=new RegExp('^'+r[3].replace(/:([A-Za-z]+)/g,(_,k)=>{names.push(k);return '([^/]+)';})+'$');const m=regex.exec(u.pathname);if(m&&r[2]===method.toLowerCase()){route=r;params=Object.fromEntries(names.map((k,i)=>[k,m[i+1]]));break;}}
  if(!route)throw new Error('Missing route '+method+' '+path);
  const p=principal || f.principal(subject),trusted={host:p.host,'x-pci-tenant-id':p.tenantId,'x-pci-tenant-slug':p.tenantId===alpha?'alpha':'beta','x-pci-tenant-domain':p.host,...(method!=='GET'?{'content-type':'application/json'}:{}),...headers};
  const msg={pciTransport:transport,pciAction:route[4],payload:typeof body==='string'?JSON.parse(body):body||{},req:{headers:trusted,rawHeaders,method,socket:{remoteAddress},params,query:Object.fromEntries(u.searchParams)}};
  const envs={'PCI_PARTICIPANT_ALLOWED_HOSTS':['participant.example.com'],'PCI_INTERNAL_ALLOWED_IPS':[]};
  const pool={async query(sql,args){if(sql.includes('FROM tenants WHERE primary_domain='))return {rows:[...f.store.db.tenants.values()].filter(t=>t.primary_domain===args[0]&&!['deleted','deleting'].includes(t.state))};throw new Error('Unexpected SQL in HTTP harness');}};
  const result=await compiled(msg,Sr2Error,sr2Uuid,sr2Object,PciError,pciErrors,()=>trusted,()=>trusted['x-forwarded-host']||trusted.host,()=>msg.payload,()=>params,()=>msg.req.query,()=>pool,()=>f.store,()=>f.adapters,createSr2Service,extendSr2Issuance,{mainHost:'pci.example.com',orceBasePath:'',verificationPepper:'ephemeral-test-pepper',internalServiceToken:'not-an-active-token'},name=>envs[name]||[],(host,path,base)=>'https://'+host+base+path,v=>String(v||'').toLowerCase(),async()=>p,()=>String(trusted.authorization||'').replace(/^Bearer /,''),crypto,(status,body,headers)=>({status,body,headers}),e=>({status:e.status||500,body:{code:e.code||'INTERNAL',detail:e.status?e.message:'Operation failed'}}));
  return result;
 };
}
