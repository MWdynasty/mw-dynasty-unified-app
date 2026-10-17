const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
 const {validateReview,sanitizedReview}=await import('../supabase/functions/mw-motion-pilot/review-validation.mjs');
 const metric={name:'knee_angle_2d',samples:8,medianDegrees:90.2,earlyDegrees:89,lateDegrees:94};
 const valid={sampledFrames:12,poseFrames:10,metrics:[metric]};
 assert.equal(validateReview(valid),null);
 assert.equal(sanitizedReview(valid).provenance,'unverified_client_2d');
 assert.equal(sanitizedReview(valid).metrics[0].medianDegrees,90.2);
 for(const review of [
  {...valid,sampledFrames:100}, {...valid,poseFrames:13},
  {...valid,metrics:[metric,metric]},
  {...valid,metrics:[{...metric,medianDegrees:NaN}]},
  {...valid,metrics:[{...metric,medianDegrees:181}]},
  {...valid,metrics:[{...metric,name:'untrusted'}]},
  {...valid,metrics:[{...metric,samples:11}]},
  {...valid,metrics:[]}
 ])assert.ok(validateReview(review),'Invalid browser estimates must be rejected');
 const html=fs.readFileSync('athlete/motion.html','utf8');
 assert.ok(html.includes('review-storage-consent'));
 assert.ok(html.includes('consentToStoreMeasurements:true'));
 assert.ok(html.includes('consentVersion:\'motion-review-v1\''));
 assert.ok(html.includes('SAVE PRIVATE TECHNIQUE REPORT'));
 assert.ok(html.includes("await call('reviews')"));
 assert.ok(html.includes('currentReviewAssessmentId=assessmentId'));
 assert.ok(html.includes('currentReviewData={'));
 assert.ok(html.includes('reviewStorageConsent.checked=false'));
 assert.ok(html.includes("provenance:'unverified_client_2d'")===false);
 const start=html.lastIndexOf('<script>'),end=html.indexOf('</script>',start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end),{filename:'motion-inline.js'}));
 const sql=fs.readFileSync('supabase/migrations/20261017220000_motion_private_reviews.sql','utf8');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/owner_user_id=\(select auth.uid\(\)\)/);
 assert.match(sql,/on delete cascade/);
 assert.match(sql,/revoke all .*anon,authenticated/);
 assert.match(sql,/grant select .*authenticated/);
 console.log('Private report storage consent, strict measurement bounds, RLS and athlete UI checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
