import crypto from 'node:crypto';
import tls from 'node:tls';
import net from 'node:net';
import { sr2Assert, sr2Fail } from './domain.js';

// For the eventual pinned gRPC adapter. readSecret must be an operator-approved,
// namespace-restricted reader; never a function selected by browser input.
export async function sr2TlsMaterial(connector,tenant,readSecret,now=Date.now()) {
  const client=await readSecret(connector.tlsSecret.name),trust=await readSecret(connector.trustSecret.name);
  for(const secret of [client,trust]){
    sr2Assert(typeof tenant.namespace==='string' && secret?.metadata?.namespace===tenant.namespace && secret?.metadata?.labels?.['xfsc.org/pci-tenant-id']===tenant.tenant_id && secret.metadata.labels['xfsc.org/pci-owner-uid']===tenant.owner_uid,'Participant Secret ownership mismatch.');
  }
  let certificate,key,ca;
  try{certificate=Buffer.from(client.data['tls.crt'],'base64');key=Buffer.from(client.data['tls.key'],'base64');ca=Buffer.from(trust.data['ca.crt'],'base64');
    const x509=new crypto.X509Certificate(certificate),privateKey=crypto.createPrivateKey(key);
    sr2Assert(x509.checkPrivateKey(privateKey) && Date.parse(x509.validFrom)<=now && Date.parse(x509.validTo)>now,'Client certificate is invalid or expired.');
    tls.createSecureContext({cert:certificate,key,ca,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'});
  }catch{sr2Fail(503,'PCI-SR2-MTLS','Participant TLS material is invalid.');}
  return {cert:certificate,key,ca,servername:connector.serverName,rejectUnauthorized:true,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',checkServerIdentity:tls.checkServerIdentity};
}
export function sr2PublicAddress(address) {
  const kind=net.isIP(address);if(!kind)return false;
  if(kind===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224||a===198&&(b===18||b===19));}
  const canonical=new URL('https://['+address+']/').hostname.slice(1,-1);return /^[23][a-f0-9]{3}:/i.test(canonical);
}
export async function sr2ResolvedParticipant(connector,lookup,approvedPrivateAddresses=[]) {
  const host=new URL(connector.endpoint).hostname;
  sr2Assert(host===connector.serverName,'Participant endpoint/server name mismatch.');
  const addresses=await lookup(host,{all:true,verbatim:true});
  sr2Assert(Array.isArray(addresses) && addresses.length>0 && addresses.length<=16 && addresses.every(a=>sr2PublicAddress(a.address)||approvedPrivateAddresses.includes(a.address)),'Participant DNS resolves to a disallowed network.');
  // The transport must connect to this checked address while retaining the
  // original TLS server name. It must not perform a second unvalidated lookup.
  return {address:addresses[0].address,family:addresses[0].family,servername:host};
}
