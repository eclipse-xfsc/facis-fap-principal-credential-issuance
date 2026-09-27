import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { sr2Assert } from './domain.js';

export function sr2Crc(buffer) {
  let n=0xffffffff;for(const byte of buffer){n^=byte;for(let b=0;b<8;b++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;
}
function sr2PngChunk(name,data) {const t=Buffer.from(name);const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(sr2Crc(Buffer.concat([t,data])),b.length-4);return b;}
// Deliberately narrow PNG subset: 8-bit RGB/RGBA, no interlace, <=1024x1024.
// Decode pixels, undo filtering, and re-encode with only IHDR/IDAT/IEND.
export function sr2Png(base64) {
  sr2Assert(typeof base64==='string' && base64.length<=1400000 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64),'Invalid PNG encoding or size.');
  const b=Buffer.from(base64,'base64');sr2Assert(b.length>=45 && b.length<=1048576 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Only PNG images are accepted.');
  let at=8, header=null, end=false, dataEnded=false;const data=[];
  while(at<b.length) {
    sr2Assert(at+12<=b.length,'Truncated PNG.');const n=b.readUInt32BE(at);sr2Assert(n<=1048576 && at+n+12<=b.length,'Invalid PNG chunk.');const type=b.toString('ascii',at+4,at+8);const value=b.subarray(at+8,at+8+n);
    sr2Assert(sr2Crc(b.subarray(at+4,at+8+n))===b.readUInt32BE(at+8+n),'PNG checksum mismatch.');
    if(!header) {sr2Assert(type==='IHDR' && n===13,'PNG header is missing.');header=Buffer.from(value);}
    else if(type==='IDAT'){sr2Assert(!dataEnded,'PNG data order is invalid.');data.push(value);}
    else if(type==='IEND'){sr2Assert(n===0 && at+12===b.length,'PNG trailer is invalid.');end=true;}
    else {sr2Assert(type!=='IHDR' && !['acTL','fcTL','fdAT'].includes(type) && type[0]===type[0].toLowerCase(),'Unsupported PNG chunk.');if(data.length)dataEnded=true;}
    at+=n+12;
  }
  sr2Assert(end && data.length && header[8]===8 && [2,6].includes(header[9]) && header[10]===0 && header[11]===0 && header[12]===0,'Use a non-interlaced 8-bit RGB/RGBA PNG.');
  const width=header.readUInt32BE(0),height=header.readUInt32BE(4),channels=header[9]===6?4:3;
  sr2Assert(width>0 && height>0 && width<=1024 && height<=1024,'PNG dimensions exceed 1024x1024.');
  const stride=width*channels,size=(stride+1)*height;let packed;
  try{packed=zlib.inflateSync(Buffer.concat(data),{maxOutputLength:size});}catch{sr2Assert(false,'PNG compressed data is invalid.');}
  sr2Assert(packed.length===size,'PNG pixel count is invalid.');const raw=Buffer.alloc(size);
  for(let y=0;y<height;y++){
    const start=y*(stride+1),filter=packed[start];sr2Assert(filter<=4,'Invalid PNG filter.');
    for(let x=0;x<stride;x++){const a=x>=channels?raw[start+1+x-channels]:0,bv=y?raw[start+1+x-stride-1]:0,c=y&&x>=channels?raw[start+1+x-stride-1-channels]:0;
      const p=a+bv-c,pa=Math.abs(p-a),pb=Math.abs(p-bv),pc=Math.abs(p-c);const predictor=[0,a,bv,Math.floor((a+bv)/2),pa<=pb&&pa<=pc?a:pb<=pc?bv:c][filter];raw[start+1+x]=(packed[start+1+x]+predictor)&255;}
  }
  const result=Buffer.concat([b.subarray(0,8),sr2PngChunk('IHDR',header),sr2PngChunk('IDAT',zlib.deflateSync(raw,{level:9})),sr2PngChunk('IEND',Buffer.alloc(0))]);
  return {mediaType:'image/png',width,height,size:result.length,sha256:crypto.createHash('sha256').update(result).digest('hex'),base64:result.toString('base64')};
}
