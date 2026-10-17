const assert=require('node:assert/strict');const m=require('../lib/mw-motion-upload.js');
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
async function run(){
const good={type:'video/mp4',size:5000};assert.doesNotThrow(()=>m.assertUpload(good));
assert.throws(()=>m.assertUpload({type:'image/png',size:200}));
assert.throws(()=>m.assertUpload({type:'video/mp4',size:100*1024*1024+1}));
await assert.rejects(m.createController({}).upload({assessmentId:b,file:good}),/not enabled/);
const fake={
  auth:{getUser:async()=>({data:{user:{id:a}}})},
  from:()=>({
    select:()=>({
      eq:()=>({
        eq:()=>({
          single:async()=>({data:{id:b,created_by:a,status:'draft',consent_recorded_at:'2026-10-17'}})
        })
      })
    })
  }),
  storage:{
    from:()=>({
      upload:async()=>({data:{path:a+'/'+b+'/33333333-3333-4333-8333-333333333333.mp4'}}),
      createSignedUrl:async()=>({data:{signedUrl:'https://example.invalid/signed'}})
    })
  }
};
const c=m.createController(fake,{enabled:true});
await assert.rejects(c.signedPlayback({assessmentId:b,path:b+'/foo.mp4'}),/not authorized/);
const out=await c.signedPlayback({assessmentId:b,path:a+'/'+b+'/33333333-3333-4333-8333-333333333333.mp4'});
assert.match(out,/signed/);
console.log('Stage 3 upload controller checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1});
