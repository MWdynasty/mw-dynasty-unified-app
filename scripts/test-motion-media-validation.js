const assert=require('node:assert/strict');
const {makeMedia,rangeReader}=require('./motion-media-fixture.js');
(async()=>{
 const {verifyIsoVideo,signedRangeReader}=await import('../supabase/functions/mw-motion-pilot/media-validation.mjs');
 async function probe(file,mime='video/mp4'){
  return verifyIsoVideo({bytes:file.length,mime,readRange:rangeReader(file)});
 }
 const normal=makeMedia(12000);
 const valid=await probe(normal);
 assert.equal(valid.durationMs,12000);
 assert.equal(valid.verifiedContainer,true);
 assert.equal((await probe(makeMedia(30000))).durationMs,30000);
 for(const [name,file,mime] of [
  ['long',makeMedia(30001),'video/mp4'],
  ['audio',makeMedia(12000,{audioOnly:true}),'video/mp4'],
  ['no moov',makeMedia(12000,{noMoov:true}),'video/mp4'],
  ['bad brand',makeMedia(12000,{brand:'junk'}),'video/mp4'],
  ['unsupported',normal,'video/webm']
 ]){
  await assert.rejects(probe(file,mime),undefined,name+' should fail closed');
 }
 const prefix='https://uuggbmccnyswiwkjgydo.supabase.co/storage/v1/object/sign/motion-private/';
 const signed=prefix+'user/assessment/clip.mp4?token=fake';
 const fetchFn=async(url,options)=>{
  assert.equal(url,signed);
  const match=/bytes=(\d+)-(\d+)/.exec(options.headers.Range);
  const start=Number(match[1]),end=Number(match[2]);
  return new Response(normal.subarray(start,end+1),{
   status:206,headers:{
    'Content-Range':'bytes '+start+'-'+end+'/'+normal.length,
    'Content-Length':String(end-start+1)
   }
  });
 };
 const read=signedRangeReader({url:signed,bytes:normal.length,fetchFn,
  expectedOrigin:'https://uuggbmccnyswiwkjgydo.supabase.co'});
 assert.equal((await verifyIsoVideo({bytes:normal.length,mime:'video/mp4',readRange:read})).durationMs,12000);
 assert.throws(()=>signedRangeReader({url:'https://evil.invalid/steal',bytes:normal.length,fetchFn,
  expectedOrigin:'https://uuggbmccnyswiwkjgydo.supabase.co'}),/Unexpected/);
 const noRanges=signedRangeReader({url:signed,bytes:normal.length,fetchFn:async()=>new Response(normal),
  expectedOrigin:'https://uuggbmccnyswiwkjgydo.supabase.co'});
 await assert.rejects(noRanges(0,31),/bounded/);
 console.log('Server-side bounded MP4/MOV container, video track, duration and signed-range checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
