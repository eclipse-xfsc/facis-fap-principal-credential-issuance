import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import tls from 'node:tls';import {spawnSync} from 'node:child_process';
import {sr2TlsMaterial} from '../../../backend/sr2/participant-security.js';
import {connector,alpha} from '../../support/sr2-fixture.mjs';
function material(){
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),key=pair.privateKey.export({format:'pem',type:'pkcs8'});
 const r=spawnSync('bash',['-c','cat | openssl req -new -x509 -key /dev/stdin -subj /CN=participant.example.com -addext subjectAltName=DNS:participant.example.com -days 2'],{input:key});
 assert.equal(r.status,0,'Ephemeral certificate generation failed');return {key,cert:r.stdout};
}
test('mTLS helper completes a local TLS 1.3 mutual-auth handshake and rejects wrong CA/hostname/expiry/key',async t=>{
 if(spawnSync('openssl',['version']).status!==0){t.skip('NOT RUN: OpenSSL is unavailable');return;}
 const a=material(),b=material(),tenant={tenant_id:alpha,owner_uid:'owned',namespace:'orce'},metadata={namespace:'orce',labels:{'xfsc.org/pci-tenant-id':alpha,'xfsc.org/pci-owner-uid':'owned'}};
 const read=async name=>({metadata,data:name==='participant-client'?{'tls.crt':a.cert.toString('base64'),'tls.key':Buffer.from(a.key).toString('base64')}:{'ca.crt':a.cert.toString('base64')}});
 const options=await sr2TlsMaterial(connector(),tenant,read);assert.equal(options.minVersion,'TLSv1.3');assert.equal(options.maxVersion,'TLSv1.3');
 await assert.rejects(()=>sr2TlsMaterial(connector(),tenant,read,Date.now()+3*86400000),e=>e.code==='PCI-SR2-MTLS');
 await assert.rejects(()=>sr2TlsMaterial(connector(),tenant,async name=>{const s=await read(name);if(name==='participant-client')s.data['tls.key']=Buffer.from(b.key).toString('base64');return s;}),e=>e.code==='PCI-SR2-MTLS');
 let authenticated=0;const server=tls.createServer({key:a.key,cert:a.cert,ca:a.cert,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},socket=>{if(socket.authorized)authenticated++;socket.end();});server.on('tlsClientError',()=>{});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const connect=extra=>new Promise((resolve,reject)=>{const client=tls.connect({...options,host:'127.0.0.1',port:server.address().port,...extra});let valid=false;client.once('secureConnect',()=>{valid=true;assert.equal(client.getProtocol(),'TLSv1.3');});client.once('error',reject);client.once('close',()=>{if(valid)resolve();});client.setTimeout(3000,()=>client.destroy(new Error('Local TLS deadline')));});
 await connect({});assert.equal(authenticated,1);
 await assert.rejects(()=>connect({servername:'wrong.example.com'}));await assert.rejects(()=>connect({ca:b.cert}));
});
