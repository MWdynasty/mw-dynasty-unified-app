const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
 const p=await import('../supabase/functions/mw-motion-maintenance/maintenance.mjs');
 const now=Date.parse('2026-10-17T14:00:00Z');
 const u='11111111-1111-4111-8111-111111111111';
 const a='22222222-2222-4222-8222-222222222222';
 const file=u+'/'+a+'/33333333-3333-4333-8333-333333333333.mp4';
 const base={id:a,created_by:u,created_at:'2026-10-16T14:00:00Z',status:'uploaded'};
 assert.equal(p.RETENTION_DAYS,14);
 assert.equal(p.BATCH_LIMIT,20);
 assert.equal(p.cleanupReason(base,null,now),null);
 assert.equal(p.cleanupReason({...base,created_at:'2026-10-03T14:00:00Z'},null,now),'retention');
 assert.equal(p.cleanupReason({...base,created_at:'2026-10-03T14:00:01Z'},null,now),null);
 const pending={status:'pending',storage_path:file,expires_at:'2026-10-17T12:30:00Z'};
 assert.equal(p.cleanupReason({...base,status:'draft'},pending,now),'abandoned_upload');
 assert.equal(p.cleanupReason({...base,status:'deleted'},pending,now),'deleted_tombstone');
 assert.equal(p.cleanupReason({...base,status:'uploaded'},pending,now),null);
 assert.equal(p.cleanupReason({...base,status:'deleted'},
  {...pending,expires_at:'2026-10-17T13:30:00Z'},now),null);
 assert.equal(p.cleanupReason({...base,status:'deleted'},null,now),'deleted_tombstone');
 assert.equal(p.cleanupReason({...base,status:'draft'},
  {...pending,status:'finalized'},now),null);
 assert.equal(p.cleanupReason({...base,status:'draft'},
  {...pending,expires_at:'not-a-date'},now),null);
 assert.equal(p.ownedPath(file,u,a),true);
 assert.equal(p.ownedPath(file,u,'44444444-4444-4444-8444-444444444444'),false);
 assert.equal(p.ownedPath(u+'/'+a+'/../../secret.mp4',u,a),false);
 assert.equal(p.ownedPath(u+'/'+a+'/filename.mp4',u,a),false);
 const eligible={...base,status:'deleted'};
 assert.deepEqual(p.plan(eligible,pending,[{storage_path:file}],now).paths,[file]);
 assert.equal(p.plan(eligible,pending,[{storage_path:'other/'+file}],now).valid,false);
 const edge=fs.readFileSync('supabase/functions/mw-motion-maintenance/index.ts','utf8');
 assert.ok(edge.includes('serviceAuthorized(req.headers.get("authorization"),secret)'));
 assert.ok(edge.includes('options.execute===true && options.dryRun===false'));
 assert.ok(edge.includes('admin.storage.from(BUCKET).remove(job.paths)'));
 assert.ok(edge.includes('.eq("created_by",assessment.created_by)'));
 assert.ok(edge.includes('event_type:"maintenance_deleted"'));
 const pilot=fs.readFileSync('supabase/functions/mw-motion-pilot/index.ts','utf8');
 assert.ok(pilot.includes('const pilotApproved = async () =>'));
 assert.ok(pilot.includes('if(!await pilotApproved()) return bad(403'));
 assert.ok(pilot.includes('.eq("status","draft")'));
 assert.ok(pilot.includes('status:"deleted",updated_at'));
 assert.ok(pilot.includes('pendingTokenExpiry:true'));
 assert.ok(pilot.includes('.neq("status","deleted")'));
 const html=fs.readFileSync('athlete/motion.html','utf8');
 assert.ok(html.includes('Minimal deletion metadata remains until secure maintenance cleanup.'));
 assert.ok(html.includes("call('eligibility')"),'Pilot controls must verify approval');
 assert.ok(html.includes('button.disabled=!pilotEligible'));
 assert.ok(html.includes('analyzeButton.disabled=!pilotEligible'));
 assert.ok(html.includes("video.pause();video.removeAttribute('src');video.load();"),
  'Private media playback must stop on signout or history refresh');
 assert.ok(html.includes("document.getElementById('clip').value=''"),
  'Signout must clear the locally selected private recording');
 assert.ok(html.includes('if(activeUserId!==requestedFor || !item.isConnected)return;'),
  'Late playback responses must never attach a video after account switch');
 assert.ok(html.includes("const uploadOwner=activeUserId;"),
  'In-flight uploads must retain their original account identity');
 assert.ok(html.includes('pendingKey(value.userId)')&&html.includes('pendingKey(userId)'),
  'Interrupted upload recovery must be isolated per staging account');
 assert.ok(html.includes('if(activeUserId!==uploadOwner)return;'),
  'In-flight uploads must not finalize under a different staging identity');
 assert.ok(html.includes('if(activeUserId!==analysisOwner)return;'),
  'Local pose results must not reappear after a staging account switch');
 assert.ok(html.includes('if(activeUserId!==pending.userId)return;'),
  'Late recovery responses must not change a different athlete account');
 console.log('Motion staging maintenance eligibility, path isolation, revocation and tombstone tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
