import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import tls from 'node:tls';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {pciNativeTransport} from '../../../backend/sr2/transport.js';
import {PciNats} from '../../../backend/sr2/wire.js';
const services={signer:'signer',wellKnown:'well-known-service',preAuth:'pre-authorization-bridge-service',credentialIssuance:'issuance-service'};
const native=values=>({namespace:'ocm',services,env:(key,fallback='')=>values[key]??fallback,readFile:path=>Buffer.from(path)});
test('blank endpoint overrides use service DNS; strict transport confines client keys to native origins',async()=>{
 const cluster=pciNativeTransport(native({PCI_SIGNER_URL:''}));assert.equal(cluster.urls.signer,'http://signer.ocm.svc.cluster.local:8080');
 assert.throws(()=>pciNativeTransport(native({PCI_NATIVE_TRANSPORT_PROFILE:'tls13'})),{code:'PCI-NATIVE-TLS-REQUIRED'});
 assert.throws(()=>pciNativeTransport(native({PCI_SIGNER_URL:'http://public.example'})),{code:'PCI-NATIVE-TLS-REQUIRED'});
 const values={PCI_NATIVE_TRANSPORT_PROFILE:'tls13',PCI_NATS_URL:'tls://nats.example:4222',PCI_NATIVE_TLS_CA_FILE:'/ca',PCI_NATIVE_TLS_CERT_FILE:'/cert',PCI_NATIVE_TLS_KEY_FILE:'/key'};
 for(const key of ['SIGNER','WELLKNOWN','STATUS','PREAUTH','ISSUANCE'])values[`PCI_${key}_URL`]=`https://${key.toLowerCase()}.example`;
 const calls=[],transport=pciNativeTransport({...native(values),httpCall:async(...args)=>calls.push(args)});
 await transport.http(transport.urls.signer+'/keys');await transport.http('https://login.example/jwks');
 assert.equal(calls[0][1].tlsOptions.key.toString(),'/key');assert.equal(calls[1][1].tlsOptions.key,undefined);assert.equal(calls[1][1].tlsOptions.minVersion,'TLSv1.3');assert.equal(calls[1][1].tlsOptions.rejectUnauthorized,true);
 assert.throws(()=>transport.http('http://signer.example/keys'),{code:'PCI-NATIVE-TLS-REQUIRED'});
 assert.throws(()=>pciNativeTransport(native({...values,PCI_NATIVE_TLS_KEY_FILE:''})).http('https://signer.example'),{code:'PCI-NATIVE-TLS-MATERIAL'});
});
function certificate(){
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),key=pair.privateKey.export({type:'pkcs8',format:'pem'});
 const generated=spawnSync('bash',['-c','cat | openssl req -new -x509 -key /dev/stdin -subj /CN=localhost -addext subjectAltName=DNS:localhost -days 1'],{input:key});assert.equal(generated.status,0);return {key,cert:generated.stdout};
}
for(const first of [false,true])test(`NATS ${first?'TLS-first':'INFO-first'} authenticates only over validated TLS 1.3`,async t=>{
 const material=certificate(),sockets=new Set();let connects=0;
 const handler=socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});if(first)socket.write('INFO {"tls_required":true}\r\n');let buffer='';socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(line.startsWith('CONNECT ')){assert.equal(socket.getProtocol(),'TLSv1.3');assert.equal(JSON.parse(line.slice(8)).auth_token,'local-test-only');connects++;}if(line==='PING')socket.write('PONG\r\n');}});};
 const options={...material,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'};
 const server=first?tls.createServer(options,handler):net.createServer(raw=>{
  // No application credentials are accepted on the raw connection.
  raw.write('INFO {"tls_required":true}\r\n');const secure=new tls.TLSSocket(raw,{...options,isServer:true,secureContext:tls.createSecureContext(options)});handler(secure);
 });server.on('tlsClientError',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const client=new PciNats({url:`tls://localhost:${server.address().port}`,token:'local-test-only',handshakeFirst:first,tls:{ca:material.cert}});
 t.after(()=>{client.close();for(const socket of sockets)socket.destroy();server.close();});
 await client.connect();assert.equal(connects,1);assert.equal(client.ready,true);
 const bad=new PciNats({url:`tls://localhost:${server.address().port}`,token:'must-not-be-sent',handshakeFirst:first});t.after(()=>bad.close());await assert.rejects(bad.connect());assert.equal(connects,1);
});
test('a plain NATS URL cannot downgrade a server requiring TLS',async t=>{
 let authenticated=false;const server=net.createServer(s=>{s.write('INFO {"tls_required":true}\r\n');s.on('data',()=>authenticated=true);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const client=new PciNats({url:`nats://127.0.0.1:${server.address().port}`,testOnly:true,token:'must-not-be-sent'});t.after(()=>{client.close();server.close();});await assert.rejects(client.connect());assert.equal(authenticated,false);
});
