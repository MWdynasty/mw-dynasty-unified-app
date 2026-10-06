'use strict';
const assert=require('node:assert/strict');
const {Session}=require('./lib/mw-practice-heats');
let now=1000;const clock=()=>now;
const athletes=Array.from({length:16},(_,i)=>({id:'athlete-'+i,division:i<8?'boys':'girls'}));
const groups=Array.from({length:4},(_,i)=>({id:'group-'+i,name:(i<2?'Boys':'Girls')+' '+(i%2+1),athleteIds:athletes.slice(i*4,i*4+4).map(a=>a.id)}));
const plans=Object.fromEntries(athletes.map(a=>[a.id,{week:1,day:2,sourceWeek:1,distance:30,reps:2,intent:'technical',raw:'2 x 30m',workoutKey:a.id+':w1:d2'}]));
let session=new Session({coachId:'coach',date:'2026-10-06',clock});
assert.equal(session.reconcile(groups,athletes,plans).length,4);
for(let i=0;i<4;i++){
 session.select('group-'+i+':0');session.start(session.heats[session.active].athleteIds);
 assert.throws(()=>session.select('group-'+((i+1)%4)+':0'),/running rep/);
 for(const id of session.heats[session.active].athleteIds){now+=500;session.finish(id,{workoutKey:plans[id].workoutKey});}
 now+=1000;assert.equal(session.rest(),1000);session.next(2);
}
const before=JSON.parse(JSON.stringify(session.snapshot()));
session=new Session({coachId:'coach',date:'2026-10-06',clock,draft:before});session.reconcile(groups,athletes,plans);
assert.equal(session.toSave().reduce((n,b)=>n+b.results.length,0),16,'all first reps survive refresh');
session.select('group-0:0');const h=session.heats[session.active];const rest=session.rest();session.toggleRest();now+=4000;assert.equal(session.rest(),rest);session.toggleRest();now+=1000;assert.equal(session.rest(),rest+1000);
session.start(h.athleteIds);const start=h.runningAt;now+=500;session.finish(h.athleteIds[0],{});now+=500;session.undo();assert.equal(h.runningAt,start,'undo must preserve a running clock');
session.reset();assert.equal(h.rep,2);assert.equal(h.results.length,4,'reset discards only current rep');assert.equal(session.rest(),0);
session.start(h.athleteIds);now+=1000;session.finish(h.athleteIds[0],{});
const interrupted=new Session({coachId:'coach',date:'2026-10-06',clock,draft:JSON.parse(JSON.stringify(session.snapshot()))});assert.equal(interrupted.heats[h.key].interrupted,true);assert.equal(interrupted.heats[h.key].results.length,4);assert.throws(()=>interrupted.toSave(),/interrupted/);session.reset();
for(let i=0;i<4;i++){
 session.select('group-'+i+':0');session.start(session.heats[session.active].athleteIds);for(const id of session.heats[session.active].athleteIds){now+=500;session.finish(id,{workoutKey:plans[id].workoutKey});}
}
groups.push({id:'group-4',name:'Relay pool',athleteIds:athletes.slice(0,8).map(a=>a.id)});
assert.equal(session.reconcile(groups,athletes,plans).length,6,'fifth group adds two heats without a group limit');
session.select('group-4:0');assert.throws(()=>session.start(session.heats[session.active].athleteIds),/unfinished workout/,'overlap cannot double-log athletes');
groups[0].name='Boys acceleration';session.reconcile(groups,athletes,plans);assert.equal(session.heats['group-0:0'].groupName,'Boys acceleration');
const batches=session.toSave();assert.equal(batches.length,4);assert.equal(batches.reduce((n,b)=>n+b.results.length,0),32);
const ids=batches.map(b=>b.heat.sessionId);session.receipt(batches[0].heat.key);
session=new Session({coachId:'coach',date:'2026-10-06',clock,draft:JSON.parse(JSON.stringify(session.snapshot()))});
assert.equal(session.toSave().length,3,'confirmed saves stay confirmed after refresh');assert.deepEqual(session.toSave().map(b=>b.heat.sessionId),ids.slice(1),'unsaved retries keep stable session IDs');
assert.equal(new Session({coachId:'other',date:'2026-10-06',draft:before}).toSave().length,0,'drafts are account scoped');
console.log('PASS: 16 athletes / 4 groups plus a fifth; independent reps/rest, navigation locks, reset/undo, refresh interruption recovery, overlap guard, and stable save receipts.');
