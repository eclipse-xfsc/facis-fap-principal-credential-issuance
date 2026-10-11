import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import { Sr2Error, sr2Assert, sr2Fail } from './domain.js';

// NATS Core protocol, structured CloudEvents 1.0. No JetStream, durable messages,
// automatic request retries or payload logging. In-flight failures are ambiguous.
export class PciNats {
  constructor(options) { this.options=options; this.subs=new Map(); this.next=0; this.buffer=Buffer.alloc(0); this.pongs=[]; this.max=1048576; }
  async connect() {
    if(this.socket && !this.socket.destroyed && this.ready)return this;
    if(this.connecting)return this.connecting;
    this.connecting=new Promise((resolve,reject)=>{
      const u=new URL(this.options.url);sr2Assert(['nats:','tls:'].includes(u.protocol)&&!u.username&&!u.password,'Unsupported NATS URL.');
      const encrypted=u.protocol==='tls:';
      sr2Assert(encrypted || u.hostname.endsWith('.svc.cluster.local') || this.options.testOnly===true,'External NATS requires TLS.');
      const params={host:u.hostname,port:Number(u.port || 4222)},generation=(this.generation||0)+1;this.generation=generation;
      this.buffer=Buffer.alloc(0);this.ready=false;let handshaking=false;
      const timer=setTimeout(()=>this.socket.destroy(new Error('PCI-NATS-CONNECT-TIMEOUT')),5000);
      const fail=()=>{clearTimeout(timer);reject(new Error('PCI-NATS-DISCONNECTED'));if(this.generation!==generation)return;this.ready=false;for(const s of this.subs.values())s.fail?.();this.subs.clear();for(const p of this.pongs.splice(0))p.reject(new Error('PCI-NATS-DISCONNECTED'));};
      const secureOptions={...this.options.tls,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',rejectUnauthorized:true,servername:u.hostname};
      const sendConnect=info=>{
        this.max=Math.min(1048576,Number(info.max_payload)||1048576);
        this.socket.write('CONNECT '+JSON.stringify({verbose:false,pedantic:true,lang:'javascript',version:'0.5.0',name:'fap-pci',protocol:1,headers:true,no_responders:true,...(this.options.token?{auth_token:this.options.token}:{}),...(this.options.user?{user:this.options.user,pass:this.options.password}:{}),tls_required:encrypted})+'\r\n');
        this.pongs.push({resolve:()=>{clearTimeout(timer);this.ready=true;resolve(this);},reject});this.socket.write('PING\r\n');
      };
      const onInfo=info=>{
        if(handshaking)return;handshaking=true;
        if(encrypted&&!this.socket.encrypted){
          // Traditional NATS sends INFO before TLS. Never send CONNECT/auth
          // until certificate validation and the TLS 1.3 handshake complete.
          if(this.buffer.length)throw new Error('PCI-NATS-UNEXPECTED-PLAINTEXT');
          const raw=this.socket;raw.removeListener('data',onData);
          this.socket=tls.connect({socket:raw,...secureOptions});listen(this.socket);
          this.socket.once('secureConnect',()=>sendConnect(info));
        }else{if(info.tls_required&&!encrypted)throw new Error('PCI-NATS-TLS-REQUIRED');sendConnect(info);}
      };
      const onData=chunk=>{try{this.buffer=Buffer.concat([this.buffer,chunk]);if(this.buffer.length>2*this.max)throw new Error('PCI-NATS-SIZE');this.parse(onInfo);}catch{this.socket.destroy(new Error('PCI-NATS-PROTOCOL'));}};
      const listen=socket=>{socket.on('error',fail);socket.on('close',fail);socket.on('data',onData);};
      this.socket=encrypted&&this.options.handshakeFirst?tls.connect({...params,...secureOptions}):net.connect(params);listen(this.socket);
    }).finally(()=>{this.connecting=null;});return this.connecting;
  }
  parse(onInfo) {
    for(;;){const end=this.buffer.indexOf('\r\n');if(end<0)return;if(end>8192)throw new Error('header too long');const line=this.buffer.subarray(0,end).toString('utf8'),parts=line.split(' '),op=parts[0];
      if(op==='MSG' || op==='HMSG'){
        const header=op==='HMSG',size=Number(parts.at(-1));if(!Number.isSafeInteger(size)||size<0||size>this.max)throw new Error('payload too large');if(this.buffer.length<end+size+4)return;
        const payload=this.buffer.subarray(end+2,end+2+size);if(this.buffer.subarray(end+2+size,end+4+size).toString()!=='\r\n')throw new Error('framing');
        this.buffer=this.buffer.subarray(end+size+4);const sid=parts[2],reply=parts.length===(header?6:5)?parts[3]:null;const hlen=header?Number(parts.at(-2)):0;if(!Number.isInteger(hlen)||hlen<0||hlen>size)throw new Error('headers');
        const status=header?Number(/^NATS\/1.0 (\d+)/.exec(payload.subarray(0,hlen).toString())?.[1]||0):0;
        const sub=this.subs.get(sid);if(sub)Promise.resolve().then(()=>sub.handler(payload.subarray(hlen),reply,status)).catch(()=>{});continue;
      }
      this.buffer=this.buffer.subarray(end+2);
      if(op==='INFO'){const info=JSON.parse(line.slice(5));if(!this.ready)onInfo(info);}
      else if(op==='PING')this.socket.write('PONG\r\n');
      else if(op==='PONG')this.pongs.shift()?.resolve();
      else if(op==='-ERR')throw new Error('NATS rejected operation');
      else if(op!=='+OK')throw new Error('unsupported protocol');
    }
  }
  subject(s,wildcard=false){sr2Assert(typeof s==='string' && s.length<=256 && (wildcard?/^[A-Za-z0-9_.*>-]+$/:/^[A-Za-z0-9_.-]+$/).test(s),'Invalid NATS subject.');return s;}
  async subscribe(subject,handler,fail) {await this.connect();const id=String(++this.next);this.subs.set(id,{handler,fail});this.socket.write(`SUB ${this.subject(subject,true)} ${id}\r\n`);return ()=>{this.subs.delete(id);if(!this.socket.destroyed)this.socket.write(`UNSUB ${id}\r\n`);};}
  send(subject,event,reply) {
    if(!this.ready || !this.socket || this.socket.destroyed)throw new Error('PCI-NATS-DISCONNECTED');
    const b=Buffer.from(JSON.stringify(event));sr2Assert(b.length<=this.max,'NATS payload too large.');
    this.socket.write(Buffer.concat([Buffer.from(`PUB ${this.subject(subject)}${reply?' '+this.subject(reply):''} ${b.length}\r\n`),b,Buffer.from('\r\n')]));
  }
  async publish(subject,event,reply) {await this.connect();this.send(subject,event,reply);}
  async request(subject,event,timeout=5000){
    await this.connect();
    return new Promise((resolve,reject)=>{
      let off=()=>{},settled=false;
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);off();error?reject(error):resolve(value);};
      const timer=setTimeout(()=>finish(Object.assign(new Error('PCI-NATS-TIMEOUT'),{status:504})),timeout);
      const inbox='_INBOX.pci.'+crypto.randomBytes(18).toString('hex');
      this.subscribe(inbox,(bytes,reply,status)=>{
        if(status>=400)return finish(Object.assign(new Error('PCI-NATS-NO-RESPONDER'),{status:503}));
        try{finish(null,JSON.parse(bytes.toString('utf8')));}catch{finish(new Error('PCI-NATS-INVALID-REPLY'));}
      },()=>finish(new Error('PCI-NATS-DISCONNECTED'))).then(unsub=>{
        off=unsub;if(settled){off();return;}
        // A request is sent once on the subscribed connection. Reconnection
        // after a deadline must never publish an abandoned issuance operation.
        this.send(subject,event,inbox);
      }).catch(e=>finish(e));
    });
  }
  close(){this.socket?.destroy();this.ready=false;}
}

export function pciEvent(type,data){return {specversion:'1.0',id:crypto.randomUUID(),source:'urn:xfsc:fap-pci',type,datacontenttype:'application/json',time:new Date().toISOString(),data};}
export function pciReply(event,type,request){
  if(event===null)sr2Fail(502,'PCI-OCM-EMPTY-REPLY','OCM returned no result. Check the matching service logs; for issuer metadata, check whether the issuer has a published credential configuration.');
  const d=event?.data;
  if(event?.specversion!=='1.0' || !event.datacontenttype?.startsWith('application/json') || !d || typeof d!=='object')sr2Fail(502,'PCI-OCM-INVALID-REPLY','OCM returned an invalid response envelope. Verify the deployed service contract.');
  if(d.tenant_id!==request.tenant_id || d.request_id!==request.request_id || (d.group_id && d.group_id!==request.group_id))sr2Fail(502,'PCI-OCM-REPLY-SCOPE','OCM response correlation did not match the tenant and request.');
  if(event.type!==type && !(d.error && event.type===type.split('.')[0]+'.error'))sr2Fail(502,'PCI-OCM-REPLY-TYPE','OCM returned an unexpected response type. Verify the deployed service contract.');
  if(d.error){
    // Classify known upstream failures; never echo or persist raw upstream text.
    const text=String(d.error.msg || d.error.message || '').slice(0,8192);
    if(type.startsWith('signer.') && (d.error.status===403 || /permission denied|Code: 403/i.test(text)))sr2Fail(502,'PCI-SIGNER-PERMISSION','The signer cannot access the configured crypto engine. Check the OCM crypto namespace, tenant group and OpenBao token permissions.');
    if(type.startsWith('signer.'))sr2Fail(502,'PCI-SIGNER-FAILED','The TSA signer rejected this operation. Check the selected key, crypto engine and signer logs.');
    sr2Fail(502,'PCI-OCM-REJECTED','The OCM service rejected this operation. Check its logs using this request reference.');
  }
  return d;
}

export function pciHttp(urlValue,{method='GET',headers={},body,timeout=5000,maxBytes=1048576,tlsOptions={},lookup}={}){
  return new Promise((resolve,reject)=>{const u=new URL(urlValue);sr2Assert(['http:','https:'].includes(u.protocol) && !u.username && !u.password,'Invalid service URL.');const bytes=body===undefined?null:Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
    const req=(u.protocol==='https:'?https:http).request(u,{method,headers:{accept:'application/json',...headers,...(bytes?{'content-length':bytes.length}:{} )},...tlsOptions,minVersion:'TLSv1.3',rejectUnauthorized:true,lookup},res=>{let size=0;const chunks=[];res.on('data',c=>{size+=c.length;if(size>maxBytes)req.destroy(new Error('PCI-UPSTREAM-SIZE'));else chunks.push(c);});res.on('error',reject);res.on('end',()=>{const raw=Buffer.concat(chunks);let data;try{data=JSON.parse(raw);}catch{data=raw.toString('utf8');}resolve({status:res.statusCode,headers:res.headers,raw,data});});});
    const timer=setTimeout(()=>req.destroy(Object.assign(new Error('PCI-UPSTREAM-TIMEOUT'),{status:504})),timeout);req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end(bytes);
  });
}

// participant.v1 uses one bytes field carrying strict JSON in each protobuf
// envelope. This keeps the transport independent of a generated JS toolchain.
export function pciProtoEnvelope(value){const b=Buffer.from(JSON.stringify(value)),varint=[];let n=b.length;do{varint.push((n&127)|(n>127?128:0));n>>>=7;}while(n);return Buffer.concat([Buffer.from([10,...varint]),b]);}
export function pciDecodeEnvelope(b){sr2Assert(b[0]===10,'Invalid participant protobuf envelope.');let n=0,shift=0,i=1;for(;i<b.length && shift<=28;i++,shift+=7){n+=(b[i]&127)*2**shift;if(!(b[i]&128)){i++;break;}}sr2Assert(n<=1048576 && i+n===b.length,'Invalid participant envelope length.');let value;try{value=JSON.parse(b.subarray(i).toString('utf8'));}catch{sr2Fail(502,'PCI-PARTICIPANT-JSON');}return value;}
export async function pciGrpc(connector,material,address,method,data,deadline){
  sr2Assert(['Notify','GetCredentialData'].includes(method),'Unknown participant operation.');
  return new Promise((resolve,reject)=>{let done=false,grpcStatus=null,httpStatus=null,body=Buffer.alloc(0);const target=new URL(connector.endpoint);const client=http2.connect(target.origin,{createConnection:()=>tls.connect({host:address.address,port:Number(target.port||443),...material,servername:address.servername,ALPNProtocols:['h2']})});
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);client.destroy();error?reject(error):resolve(value);};
    const remaining=Math.max(1,deadline-Date.now()),timer=setTimeout(()=>finish(new Sr2Error(504,'PCI-PARTICIPANT-DEADLINE','The participant service exceeded the request deadline. Check its availability before retrying.')),remaining);
    client.on('error',()=>finish(new Sr2Error(502,'PCI-PARTICIPANT-TLS','The participant TLS connection failed. Check the endpoint, trusted CA, client certificate and server DNS name.')));
    const stream=client.request({':method':'POST',':path':'/participant.v1.Participant/'+method,'content-type':'application/grpc+proto','te':'trailers','grpc-timeout':Math.min(99999999,remaining)+'m'});
    stream.on('response',h=>{httpStatus=h[':status'];if(h['grpc-status']!==undefined)grpcStatus=String(h['grpc-status']);});stream.on('trailers',h=>{grpcStatus=String(h['grpc-status']);});
    stream.on('data',chunk=>{body=Buffer.concat([body,chunk]);if(body.length>1048581)finish(new Sr2Error(502,'PCI-PARTICIPANT-SIZE','The participant response exceeded the size limit.'));});stream.on('error',()=>finish(new Sr2Error(502,'PCI-PARTICIPANT-TRANSPORT','The participant connection closed before the RPC completed.')));
    stream.on('end',()=>{try{if(httpStatus!==200)sr2Fail(502,'PCI-PARTICIPANT-HTTP','The participant endpoint did not accept gRPC over HTTP/2. Check the service and ingress route.');if(grpcStatus!=='0'){const reasons={'3':'The participant rejected the request contract.','5':'The participant has no record for this configuration and authenticated subject.','7':'The participant rejected the required scope or signing context.','9':'The participant requires a matching notification, claims or signing prerequisites.','16':'The participant rejected the JWT issuer, audience, subject or expiry.'};sr2Fail(grpcStatus==='4'?504:502,'PCI-PARTICIPANT-RPC',reasons[grpcStatus] || 'The participant service could not complete the RPC. Check its availability and service logs.');}if(!(body.length>=5 && body[0]===0 && body.readUInt32BE(1)===body.length-5))sr2Fail(502,'PCI-PARTICIPANT-FRAME','The participant returned an invalid gRPC message.');finish(null,pciDecodeEnvelope(body.subarray(5)));}catch(e){finish(e);}});
    const payload=pciProtoEnvelope(data),frame=Buffer.alloc(5);frame.writeUInt32BE(payload.length,1);stream.end(Buffer.concat([frame,payload]));
  });
}
