const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
(async()=>{
 const {verifyIsoVideo}=await import('../supabase/functions/mw-motion-pilot/media-validation.mjs');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mw-motion-media-'));
 try{
  const ffmpeg=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});
  assert.equal(ffmpeg.status,0,'ffmpeg must be available to verify real MP4/MOV containers');
  for(const [ext,format] of [['mp4','mp4'],['mov','mov']]){
   const file=path.join(folder,'one-second.'+ext);
   const cmd=['-nostdin','-hide_banner','-loglevel','error','-y','-f','lavfi',
    '-i','color=c=black:s=160x90:d=1:r=10','-c:v','mpeg4','-q:v','5','-f',format,file];
   const out=spawnSync('ffmpeg',cmd,{encoding:'utf8'});
   assert.equal(out.status,0,out.stderr||'ffmpeg failed');
   const bytes=fs.readFileSync(file);
   const verified=await verifyIsoVideo({bytes:bytes.length,
    mime:ext==='mp4'?'video/mp4':'video/quicktime',
    readRange:async(start,end)=>new Uint8Array(bytes.subarray(start,end+1))});
   assert.ok(verified.durationMs>=900&&verified.durationMs<=1200,
    'Expected real one-second video duration');
  }
  console.log('Real ffmpeg-generated MP4 and MOV duration/track verification passed.');
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
