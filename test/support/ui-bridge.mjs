// Executes the shipped Function-node bodies. Only PostgreSQL and native
// integrations are fixtures; envelope/auth/routing/error logic is unchanged.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as url from 'node:url';
import { fixture, alpha } from './sr2-fixture.mjs';

export function bridgeHarness() {
  const flows=JSON.parse(fs.readFileSync('dist/fap-pci-flow.json','utf8'));
  const f=fixture(), events=[], logs=[], sessions=new Map();
  const normalizer=flows.find(n=>n.name==='Validate and route browser command');
  const buildId=flows.find(n=>n.name==='M11_PCI-IssuerRuntime').func.match(/buildId='([a-f0-9]+)'/)[1];
  const pool={pciNative:{buildId,service:f.api,adapters:f.adapters,nats:{ready:true},subscription:true,metrics:new Map()},async query(sql,args){
    if(sql.includes('FROM tenants WHERE primary_domain='))return {rows:[...f.store.db.tenants.values()].filter(t=>t.primary_domain===args[0]&&!['deleted','deleting'].includes(t.state))};
    if(sql.includes('FROM auth_sessions WHERE token_hash='))return {rows:sessions.has(args[0])?[sessions.get(args[0])]:[]};
    if(sql.startsWith('UPDATE auth_sessions SET last_seen_at='))return {rows:[]};
    throw new Error('Unexpected bridge fixture SQL: '+sql);
  }};
  class Pool {constructor(){return pool;}}
  const pg={Pool};
  const values={PCI_VERIFICATION_TOKEN_PEPPER:'synthetic-pepper',PCI_DATABASE_URL:'postgres://fixture/pci',PCI_OCM_NAMESPACE:'ocm-wstack',PCI_KEYCLOAK_INTERNAL_URL:'http://keycloak',PCI_KEYCLOAK_PUBLIC_URL:'https://keycloak.example.com',PCI_ORCE_BASE_PATH:'/pci-orce'};
  async function execute(node,msg) {
    const context=vm.createContext({msg,url,crypto,Buffer,pg,setTimeout,clearTimeout,setInterval,clearInterval,
      env:{get:key=>values[key]},global:{get(){},set(){}},node:{send:outputs=>{if(outputs?.[1])events.push(outputs[1]);},error:value=>logs.push(value),warn:value=>logs.push(value)}});
    return vm.runInContext('(function(){'+node.func+'})()',context,{filename:node.name});
  }
  function credentials(subject='admin',tenantId=alpha) {
    const p=f.principal(subject,tenantId),token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');
    const sessionId=crypto.randomUUID();sessions.set(hash,{session_id:sessionId,keycloak_subject:subject,username:subject,roles:p.roles,tenant_id:tenantId,tenant_slug:tenantId===alpha?'alpha':'beta',expires_at:new Date(Date.now()+3600000)});
    return {token,hash,sessionId,host:p.host,tenantId,slug:tenantId===alpha?'alpha':'beta'};
  }
  async function bootstrap(identity=credentials(), socketId='test_socket_123456',overrides={}) {
    const headers={host:identity.host,origin:'https://'+identity.host,'content-type':'application/json',...(identity.token?{cookie:'fap_pci_session='+identity.token}:{}),...(identity.tenantId?{'x-pci-tenant-id':identity.tenantId,'x-pci-tenant-slug':identity.slug,'x-pci-tenant-domain':identity.host}:{}),...(overrides.headers||{})};
    const msg={pciTransport:'http',pciAction:'auth.bridge',req:{method:'POST',headers,rawHeaders:overrides.rawHeaders||[]},payload:{socketId}};
    const output=await execute(flows.find(n=>n.name==='M5_PCI-Auth'),msg);
    return {status:output[0].statusCode,...output[0].payload};
  }
  async function command(envelope,{socketId='test_socket_123456',spoof={}}={}) {
    // UIBUILDER 7.5 showMsgUib overwrites _uib._socketId from the socket.
    const output=await execute(normalizer,{...spoof,payload:envelope,_uib:{...spoof._uib,_socketId:socketId}});
    if(!output)return null;
    if(output[1])return output[1].payload;
    const msg=output[0];
    // Credentials must stay process-owned, never copied into flow messages.
    if(JSON.stringify(msg).includes('fap_pci_session='))throw new Error('Cookie escaped the bridge boundary');
    const change=flows.find(n=>n.type==='change'&&n.rules.some(r=>r.p==='pciAction'&&r.to===msg.pciAction));
    const target=flows.find(n=>n.id===change.wires[0][0]);
    const result=await execute(target,msg);
    return result?.[1]?.payload;
  }
  function envelope(grant,path,method='GET',body={},headers={}) {
    return {version:1,type:'command',action:'request',requestId:crypto.randomUUID(),sessionId:grant.sessionId,payload:{path,method,body,headers},meta:{bridgeToken:grant.token}};
  }
  return {f,pool,pg,events,logs,sessions,execute,normalizer,credentials,bootstrap,command,envelope};
}
