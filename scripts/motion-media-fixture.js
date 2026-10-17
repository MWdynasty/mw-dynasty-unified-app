// Synthetic ISO BMFF fixture for bounded server metadata checks.
// This is a structural fixture, not a playable/decodable video.
function box(name,payload){
 const out=Buffer.alloc(8);out.writeUInt32BE(payload.length+8,0);out.write(name,4,4,'ascii');
 return Buffer.concat([out,payload]);
}
function movieHeader(ms){
 const b=Buffer.alloc(20);b.writeUInt32BE(1000,12);b.writeUInt32BE(ms,16);return b;
}
function makeMedia(ms=12000,options={}){
 const brand=Buffer.alloc(12);brand.write(options.brand||'isom',0,4,'ascii');brand.write('isom',8,4,'ascii');
 const hdlr=Buffer.alloc(12);hdlr.write(options.audioOnly?'soun':'vide',8,4,'ascii');
 const moov=box('moov',Buffer.concat([
  box('mvhd',movieHeader(ms)),
  box('trak',box('mdia',Buffer.concat([
   box('mdhd',movieHeader(ms)),box('hdlr',hdlr)
  ])))
 ]));
 return Buffer.concat([box('ftyp',brand),options.noMoov?Buffer.alloc(0):moov,box('mdat',Buffer.alloc(128,42))]);
}
function rangeReader(file){
 return async(start,end)=>new Uint8Array(file.subarray(start,end+1));
}
module.exports={makeMedia,rangeReader};
