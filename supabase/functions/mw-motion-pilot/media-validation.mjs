// Server-side bounded ISO BMFF / QuickTime container inspection.
// Does not decode frames or certify biomechanical accuracy.
// readRange(startInclusive,endInclusive) must return exactly those bytes.
export const MAX_MOOV_BYTES=2*1024*1024;
const MAX_BOXES=64;
function u32(b,p){return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p,false);}
function text(b,p,n=4){return String.fromCharCode(...b.subarray(p,p+n));}
function box(b,p,end){
 if(p+8>end)throw Error('Incomplete media box');
 let size=u32(b,p),header=8;
 if(size===1){
  if(p+16>end)throw Error('Incomplete extended media box');
  const high=u32(b,p+8),low=u32(b,p+12);
  size=high*4294967296+low;header=16;
 }
 if(size===0)size=end-p;
 if(!Number.isSafeInteger(size)||size<header||p+size>end)throw Error('Invalid media box size');
 return {type:text(b,p+4),start:p+header,end:p+size,size,header};
}
function children(b,start,end){
 const result=[];let p=start;
 while(p<end){
  if(result.length>=MAX_BOXES)throw Error('Too many media boxes');
  const x=box(b,p,end);result.push(x);p=x.end;
 }
 return result;
}
function durationMs(b,x){
 const p=x.start;
 if(p+4>x.end)throw Error('Incomplete duration box');
 const version=b[p];
 if(version!==0&&version!==1)throw Error('Unsupported duration version');
 const scaleAt=p+(version===0?12:20);
 const durAt=p+(version===0?16:24);
 const bytes=version===0?4:8;
 if(durAt+bytes>x.end)throw Error('Incomplete duration metadata');
 const scale=u32(b,scaleAt);
 const duration=version===0?BigInt(u32(b,durAt)):
   (BigInt(u32(b,durAt))*4294967296n+BigInt(u32(b,durAt+4)));
 if(scale<1||duration<1n||duration===0xffffffffffffffffn)
  throw Error('Invalid media duration');
 const ms=Number(duration)*1000/scale;
 if(!Number.isFinite(ms)||ms<=0||ms>30000)
  throw Error('Video must be 30 seconds or shorter');
 return Math.ceil(ms);
}
function inspectMoov(bytes){
 const root=children(bytes,0,bytes.length);
 const mvhd=root.find(x=>x.type==='mvhd');
 if(!mvhd)throw Error('Missing movie duration');
 const movieMs=durationMs(bytes,mvhd);
 const tracks=root.filter(x=>x.type==='trak');
 if(!tracks.length)throw Error('No media tracks');
 let videoMs=null;
 for(const track of tracks){
  const mdia=children(bytes,track.start,track.end).find(x=>x.type==='mdia');
  if(!mdia)continue;
  const contents=children(bytes,mdia.start,mdia.end);
  const hdlr=contents.find(x=>x.type==='hdlr');
  if(!hdlr||hdlr.start+12>hdlr.end||text(bytes,hdlr.start+8)!=='vide')continue;
  const mdhd=contents.find(x=>x.type==='mdhd');
  if(!mdhd)throw Error('Missing video duration');
  videoMs=durationMs(bytes,mdhd);
  break;
 }
 if(videoMs===null)throw Error('No video track');
 return Math.max(movieMs,videoMs);
}
export async function verifyIsoVideo({bytes,mime,readRange}){
 if(!Number.isInteger(bytes)||bytes<48||bytes>100*1024*1024)
  throw Error('Invalid video size');
 if(mime!=='video/mp4'&&mime!=='video/quicktime')
  throw Error('Unsupported verified video format');
 if(typeof readRange!=='function')throw Error('Media reader unavailable');
 const first=await readRange(0,31);
 if(!(first instanceof Uint8Array)||first.length!==32)throw Error('Video header unavailable');
 const initial=box(first,0,first.length);
 if(initial.type!=='ftyp'||initial.size<16)throw Error('Missing ISO video signature');
 const brand=text(first,8);
 if(!['isom','iso2','iso6','mp41','mp42','qt  ','M4V ','avc1'].includes(brand))
  throw Error('Unsupported ISO video brand');
 let pos=0,seenMoov=false,seenMdat=false,ms=null,steps=0;
 while(pos<bytes){
  if(++steps>MAX_BOXES)throw Error('Too many top-level video boxes');
  const last=Math.min(pos+15,bytes-1);
  if(last-pos+1<16)throw Error('Incomplete top-level media header');
  const head=await readRange(pos,last);
  if(!(head instanceof Uint8Array)||head.length!==16)throw Error('Media range unavailable');
  let size=u32(head,0),header=8;
  if(size===1){size=u32(head,8)*4294967296+u32(head,12);header=16;}
  if(size===0)size=bytes-pos;
  if(!Number.isSafeInteger(size)||size<header||size>bytes-pos)
   throw Error('Invalid top-level video box');
  const type=text(head,4);
  if(pos===0&&type!=='ftyp')throw Error('Invalid video signature');
  if(type==='mdat'){if(size<=header)throw Error('Empty video data');seenMdat=true;}
  if(type==='moov'){
   if(seenMoov||size>MAX_MOOV_BYTES||size<16)
    throw Error('Invalid movie metadata');
   const moov=await readRange(pos+header,pos+size-1);
   if(!(moov instanceof Uint8Array)||moov.length!==size-header)
    throw Error('Incomplete movie metadata');
   ms=inspectMoov(moov);seenMoov=true;
  }
  pos+=size;
 }
 if(!seenMoov||!seenMdat||ms===null)
  throw Error('Incomplete video container');
 return {durationMs:ms,verifiedContainer:true,brand,method:'iso_bmff_bounded_range_v1'};
}
