import {sr2Assert,sr2Fail} from './domain.js';
import {pciHttp} from './wire.js';

// Operator-selected native endpoints. TLS material is read from Secret volumes,
// never API bodies, JSON configuration snapshots or Node-RED context.
export function pciNativeTransport({env,namespace,services,readFile,httpCall=pciHttp}){
 const profile=env('PCI_NATIVE_TRANSPORT_PROFILE','cluster');
 sr2Assert(['cluster','tls13'].includes(profile),'Use cluster or tls13 as the native transport profile.');
 const names={signer:['PCI_SIGNER_URL',services.signer],wellKnown:['PCI_WELLKNOWN_URL',services.wellKnown],status:['PCI_STATUS_URL','status-list-service'],preAuth:['PCI_PREAUTH_URL',services.preAuth],issuance:['PCI_ISSUANCE_URL',services.credentialIssuance]};
 const urls={};for(const [role,[name,service]]of Object.entries(names)){
  const u=new URL((env(name)||`http://${service}.${namespace}.svc.cluster.local:8080`));
  sr2Assert(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash,'Invalid native service endpoint.');
  if(u.protocol!=='https:'&&(profile==='tls13'||!u.hostname.endsWith('.svc.cluster.local')))sr2Fail(503,'PCI-NATIVE-TLS-REQUIRED','Configure HTTPS native service endpoints before selecting the TLS 1.3 transport profile.');
  urls[role]=u.href.replace(/\/$/,'');
 }
 function material(prefix){
  const ca=env(prefix+'_CA_FILE'),cert=env(prefix+'_CERT_FILE'),key=env(prefix+'_KEY_FILE');
  if(Boolean(cert)!==Boolean(key))sr2Fail(503,'PCI-NATIVE-TLS-MATERIAL','Both client certificate and private key files are required.');
  try{return {...(ca?{ca:readFile(ca)}:{}),...(cert?{cert:readFile(cert),key:readFile(key)}:{})};}catch{sr2Fail(503,'PCI-NATIVE-TLS-MATERIAL','Native TLS material is unavailable. Check the mounted Secret and file paths.');}
 }
 const natsUrl=env('PCI_NATS_URL');if(profile==='tls13'&&!natsUrl?.startsWith('tls:'))sr2Fail(503,'PCI-NATS-TLS-REQUIRED','Configure a TLS NATS endpoint for the TLS 1.3 profile.');
 const nativeOrigins=new Set(Object.values(urls).map(url=>new URL(url).origin));
 return {profile,urls,natsTls:material('PCI_NATS_TLS'),http(url,options={}){
  const u=new URL(url);if(profile==='tls13'&&u.protocol!=='https:')sr2Fail(503,'PCI-NATIVE-TLS-REQUIRED','The native dependency must use TLS 1.3.');
  return httpCall(url,{...options,tlsOptions:{...(nativeOrigins.has(u.origin)?material('PCI_NATIVE_TLS'):{}),...(options.tlsOptions||{}),minVersion:'TLSv1.3',maxVersion:'TLSv1.3',rejectUnauthorized:true}});
 }};
}
