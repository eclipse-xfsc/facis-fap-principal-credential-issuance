import { PCI_QR_BLOCKS, PCI_QR_ALIGNMENT } from './qr-tables.js';

// QR byte-mode encoder, error correction L, versions 1–40. No network or
// browser storage. Tables and placement conventions credit in vendor notice.
export function pciQrMatrix(text, forcedMask=null) {
  const data=new TextEncoder().encode(text);let version=1,capacity=0,blocks;
  for(;version<=40;version++){
    blocks=[];const spec=PCI_QR_BLOCKS[version-1];
    for(let i=0;i<spec.length;i+=3)for(let k=0;k<spec[i];k++)blocks.push({total:spec[i+1],data:spec[i+2]});
    capacity=blocks.reduce((sum,b)=>sum+b.data,0);
    if(4+(version<10?8:16)+data.length*8<=capacity*8)break;
  }
  if(version>40)throw new Error('Offer exceeds QR capacity. Use the credential link.');
  const bits=[],put=(n,count)=>{for(let i=count-1;i>=0;i--)bits.push((n>>>i)&1);};
  put(4,4);put(data.length,version<10?8:16);for(const byte of data)put(byte,8);
  put(0,Math.min(4,capacity*8-bits.length));while(bits.length%8)bits.push(0);
  const bytes=[];for(let i=0;i<bits.length;i+=8)bytes.push(bits.slice(i,i+8).reduce((n,b)=>(n<<1)|b,0));
  for(let i=0;bytes.length<capacity;i++)bytes.push(i%2?0x11:0xec);
  const exp=new Array(512),log=new Array(256);let x=1;for(let i=0;i<255;i++){exp[i]=x;log[x]=i;x<<=1;if(x&256)x^=0x11d;}for(let i=255;i<512;i++)exp[i]=exp[i-255];
  const mul=(a,b)=>a&&b?exp[log[a]+log[b]]:0;
  let offset=0;const chunks=blocks.map(block=>{
    const input=bytes.slice(offset,offset+block.data);offset+=block.data;const count=block.total-block.data;let generator=[1];
    for(let i=0;i<count;i++){const next=Array(generator.length+1).fill(0);for(let j=0;j<generator.length;j++){next[j]^=generator[j];next[j+1]^=mul(generator[j],exp[i]);}generator=next;}
    const ecc=Array(count).fill(0);for(const b of input){const factor=b^ecc.shift();ecc.push(0);for(let j=0;j<count;j++)ecc[j]^=mul(generator[j+1],factor);}return {input,ecc};
  });
  const encoded=[];for(let i=0;i<Math.max(...chunks.map(c=>c.input.length));i++)for(const c of chunks)if(i<c.input.length)encoded.push(c.input[i]);
  for(let i=0;i<chunks[0].ecc.length;i++)for(const c of chunks)encoded.push(c.ecc[i]);
  const size=version*4+17,base=Array.from({length:size},()=>Array(size).fill(null));
  function finder(row,col){for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++)if(row+r>=0&&row+r<size&&col+c>=0&&col+c<size)base[row+r][col+c]=(r>=0&&r<=6&&(c===0||c===6))||(c>=0&&c<=6&&(r===0||r===6))||(r>=2&&r<=4&&c>=2&&c<=4);}
  finder(0,0);finder(size-7,0);finder(0,size-7);
  for(const r of PCI_QR_ALIGNMENT[version-1])for(const c of PCI_QR_ALIGNMENT[version-1])if(base[r][c]===null)for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)base[r+y][c+x]=Math.max(Math.abs(y),Math.abs(x))!==1;
  for(let i=8;i<size-8;i++){if(base[i][6]===null)base[i][6]=i%2===0;if(base[6][i]===null)base[6][i]=i%2===0;}
  const digit=n=>n?32-Math.clz32(n):0;
  function bch(n,shift,poly){let rest=n<<shift;while(digit(rest)>=digit(poly))rest^=poly<<(digit(rest)-digit(poly));return (n<<shift)|rest;}
  if(version>=7){const v=bch(version,12,0x1f25);for(let i=0;i<18;i++)base[Math.floor(i/3)][i%3+size-11]=base[i%3+size-11][Math.floor(i/3)]=((v>>>i)&1)===1;}
  const masks=[(r,c)=>(r+c)%2===0,r=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>(r*c)%2+(r*c)%3===0,(r,c)=>((r*c)%2+(r*c)%3)%2===0,(r,c)=>((r*c)%3+(r+c)%2)%2===0];
  function matrix(mask){const m=base.map(r=>[...r]);const format=bch((1<<3)|mask,10,0x537)^0x5412;
    for(let i=0;i<15;i++){const bit=((format>>>i)&1)===1;m[i<6?i:i<8?i+1:size-15+i][8]=bit;m[8][i<8?size-i-1:i<9?15-i:14-i]=bit;}m[size-8][8]=true;
    let bit=0,row=size-1,dir=-1;
    for(let col=size-1;col>0;col-=2){if(col===6)col--;for(;;){for(let side=0;side<2;side++){const c=col-side;if(m[row][c]!==null)continue;const raw=bit<encoded.length*8?((encoded[Math.floor(bit/8)]>>>(7-bit%8))&1)!==0:false;m[row][c]=raw!==masks[mask](row,c);bit++;}row+=dir;if(row<0||row>=size){row-=dir;dir=-dir;break;}}}return m;
  }
  function penalty(m){let score=0,dark=0;for(let r=0;r<size;r++)for(let c=0;c<size;c++){if(m[r][c])dark++;if(r&&c&&m[r][c]===m[r-1][c]&&m[r][c]===m[r][c-1]&&m[r][c]===m[r-1][c-1])score+=3;}
    for(let axis=0;axis<2;axis++)for(let i=0;i<size;i++){const line=Array.from({length:size},(_,j)=>axis?m[j][i]:m[i][j]);let run=1;for(let j=1;j<=size;j++){if(j<size&&line[j]===line[j-1])run++;else{if(run>=5)score+=run-2;run=1;}}const s=line.map(b=>b?'1':'0').join('');for(let j=0;j<=size-11;j++)if(['00001011101','10111010000'].includes(s.slice(j,j+11)))score+=40;}
    return score+Math.floor(Math.abs(dark*100/(size*size)-50)/5)*10;
  }
  if(forcedMask!==null){if(!Number.isInteger(forcedMask)||forcedMask<0||forcedMask>7)throw new Error('Invalid QR mask.');return matrix(forcedMask);}
  let best=null,bestScore=Infinity;for(let mask=0;mask<8;mask++){const candidate=matrix(mask),score=penalty(candidate);if(score<bestScore){best=candidate;bestScore=score;}}return best;
}
export function pciQrImage(text){const matrix=pciQrMatrix(text),size=matrix.length+8;let path='';for(let r=0;r<matrix.length;r++){let c=0;while(c<matrix.length){if(!matrix[r][c]){c++;continue;}const start=c;while(c<matrix.length&&matrix[r][c])c++;path+=`M${start+4} ${r+4}h${c-start}v1h-${c-start}z`;}}return {size,path};}
