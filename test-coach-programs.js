const assert=require('node:assert/strict'),P=require('./lib/mw-coach-program'),Heats=require('./lib/mw-practice-heats');
const source=`Test Workout - Week 1
MONDAY | Acceleration
Warm-up: 10 minutes easy movement, then 3 x 20m relaxed build-ups.
Main session: 2 sets of 3 reps x 60m sprints at 85% effort.
Recovery: 3 minutes between reps; 6 minutes between sets.
TUESDAY | Tempo
Main session: 6 reps x 100m at 65% effort.
Recovery: 90 seconds between reps.
WEDNESDAY | Recovery
Main session: 10 minutes easy walking.
THURSDAY | Longer reps
Main session: 3 reps x 150m at 80% effort.
Recovery: 5 minutes between reps.
FRIDAY | Relaxed running
Main session: 4 reps x 60m at 70% effort.
Recovery: 2 minutes between reps.
SATURDAY / SUNDAY | Rest days
Test file only | Keep as Draft while checking the import flow.
1 / 1`;
const s=P.parse(source);assert.equal(s.length,7);assert.deepEqual(s[0].blocks[0],{id:'b0',sets:2,reps:3,distance:60,intensityPct:85,restSeconds:180,setRestSeconds:360});assert.equal(s[0].warmup.includes('20m'),true);assert.equal(s[0].blocks.length,1);assert.ok(P.validate(s).length);s.forEach(x=>{if(!x.blocks.length)x.manualOnly=true;});assert.deepEqual(P.validate(s),[]);
assert.deepEqual(P.datePosition('2026-10-07','2026-10-07'),{week:1,day:3});assert.deepEqual(P.datePosition('2026-10-07','2026-10-12'),{week:2,day:1});assert.equal(P.datePosition('2026-10-12','2026-10-11'),null);assert.equal(P.today({content:{sessions:s}},'2026-10-05','2026-10-05')[0].title,'Acceleration');assert.deepEqual(P.today({content:{sessions:s}},'2026-10-05','2026-10-12'),[]);
const unknown=P.parse('Week 1\nMonday | Mixed\nWorkout: 3 x (200m + 100m), walk-back recovery.');assert.equal(unknown[0].blocks.length,0);assert.ok(P.validate(unknown).length);const missing=P.parse('Week 1\nMonday | Speed\n4 x 60m at 90%');assert.ok(P.validate(missing).some(x=>x.includes('rest')));
const plan=P.plan(s[0],{id:'assignment'},'revision','athlete','2026-10-05');assert.equal(plan.reps,6);assert.equal(plan.repsPerSet,3);assert.equal(plan.setRestSeconds,360);assert.notEqual(plan.workoutKey,P.plan(s[0],{id:'other'},'revision','athlete','2026-10-05').workoutKey);
let now=0;const model=new Heats.Session({coachId:'c',date:'2026-10-05',clock:()=>now});const athletes=Array.from({length:16},(_,i)=>({id:'a'+i})),groups=Array.from({length:4},(_,i)=>({id:'g'+i,name:'Group '+i,athleteIds:athletes.slice(i*4,i*4+4).map(x=>x.id)}));const plans=Object.fromEntries(athletes.map(a=>[a.id,P.plan(s[0],{id:'assignment'},'revision',a.id,'2026-10-05')]));model.reconcile(groups,athletes,plans);for(const heat of Object.values(model.heats)){model.select(heat.key);for(let rep=1;rep<=6;rep++){model.start(heat.athleteIds);heat.restDurationMs=(rep%3===0&&rep<6?360:180)*1000;for(let i=0;i<4;i++){now+=1000;model.finish(heat.athleteIds[i],plans[heat.athleteIds[i]]);if(i<3)assert.equal(heat.restStartedAt,null);}assert.equal(heat.restStartedAt,now);if(rep===3)assert.equal(model.restRemaining(heat),360000);if(rep<6){now+=heat.restDurationMs;model.next(6);}}}const rows=model.toSave();assert.equal(rows.length,4);assert.equal(rows.reduce((n,b)=>n+b.results.length,0),96);const restored=new Heats.Session({coachId:'c',date:'2026-10-05',draft:model.snapshot()});assert.equal(restored.toSave().length,4);groups.push({id:'g4',name:'Extra group',athleteIds:[]});model.reconcile(groups,athletes,plans);assert.ok(Object.values(model.heats).some(h=>h.groupId==='g4'));
console.log('PASS: imported workout parsing, conservative unknowns, start-date scheduling, custom identity, 16 athletes/four heats, set rest after last finish, refresh and fifth group.');
