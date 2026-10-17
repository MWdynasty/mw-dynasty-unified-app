const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {canonicalWeek,motionSeasonAnchor}=await import('../supabase/functions/mw-motion-pilot/season-week.mjs');
 const d=s=>new Date(s+'T12:00:00Z');
 assert.equal(canonicalWeek('2026-01-05',d('2026-01-05')),1);
 assert.equal(canonicalWeek('2026-01-05',d('2026-01-11')),1);
 assert.equal(canonicalWeek('2026-01-05',d('2026-01-12')),2);
 assert.equal(canonicalWeek('2026-01-05',d('2026-10-18')),41);
 assert.equal(canonicalWeek('2026-01-05',d('2026-10-19')),null);
 assert.equal(canonicalWeek('2026-01-05',d('2026-01-04')),null);
 assert.equal(canonicalWeek('2026-02-30',d('2026-03-01')),null);
 assert.equal(canonicalWeek(null),null);
 const plan=motionSeasonAnchor({program_start_date:null},
  [{season_start_date:'2026-09-14'}],d('2026-10-17'));
 assert.equal(plan.weekNumber,5);
 assert.equal(plan.weekSource,'active_season_plan');
 assert.equal(plan.programStartDate,'2026-09-14');
 assert.equal(motionSeasonAnchor({program_start_date:'2026-01-05'},[],
  d('2026-01-12')).weekNumber,2);
 assert.equal(motionSeasonAnchor({program_start_date:'2026-01-05'},
  [{season_start_date:'2026-09-14'},{season_start_date:'2026-10-01'}],
  d('2026-10-17')).issue,'conflicting_active_season_plans');
 const edge=fs.readFileSync('supabase/functions/mw-motion-pilot/index.ts','utf8');
 const html=fs.readFileSync('athlete/motion.html','utf8');
 const sql=fs.readFileSync('supabase/migrations/20261018020000_motion_canonical_week_source.sql','utf8');
 assert.ok(edge.includes('action === "season_context"'));
 assert.ok(edge.includes('const season=await getSeasonContext(athlete.id)'));
 assert.ok(edge.includes('input.weekNumber!==canonical'));
 assert.ok(edge.includes('week_source:canonical!==null?season.weekSource'));
 assert.ok(html.includes("const context=await call('season_context')"));
 assert.ok(html.includes('weekSelect.disabled=true'));
 assert.ok(sql.includes('week_source'));
 console.log('Canonical 41-week server index, continuous indoor/outdoor and athlete UI binding passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
