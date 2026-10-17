const assert=require('node:assert/strict');
const fs=require('node:fs');
const progress=require('../lib/mw-motion-progress.js');
const make=(id,date,week,value,movement='wickets')=>({
 assessment_id:id,created_at:date,week_number:week,movement_type:movement,
 provenance:'unverified_client_2d',
 metrics:[{name:'knee_angle_2d',medianDegrees:value}]
});
const data=[
 make('two','2026-10-14T10:00:00Z',3,95),
 make('one','2026-10-13T10:00:00Z',2,90),
 make('three','2026-10-15T10:00:00Z',4,92),
 make('a','2026-10-13T10:00:00Z',1,110,'block_start'),
 make('b','2026-10-14T10:00:00Z',2,105,'block_start')
];
const result=progress.summarize(data);
assert.equal(result.length,2);
assert.equal(result[1].movementType,'wickets');
assert.equal(result[1].recordings,3);
assert.equal(result[1].firstWeek,2);
assert.equal(result[1].lastWeek,4);
assert.equal(result[1].metrics[0].earlier,90);
assert.equal(result[1].metrics[0].later,92);
assert.equal(result[1].metrics[0].difference,2);
assert.match(result[1].disclaimer,/does not mean better or worse/);
assert.equal(progress.summarize([data[0]]).length,0);
assert.equal(progress.summarize([data[0],{...data[1],provenance:'verified'}]).length,0);
assert.equal(progress.summarize([data[0],{...data[1],metrics:[{name:'knee_angle_2d',medianDegrees:400}]]).length,1);
assert.equal(progress.summarize([data[0],{...data[1],metrics:[{name:'unknown',medianDegrees:90}]]).length,0);
const html=fs.readFileSync('athlete/motion.html','utf8');
assert.ok(html.includes('/lib/mw-motion-progress.js'));
assert.ok(html.includes('displayRecentProgress(saved.reviews||[])'));
assert.ok(html.includes('clearProgress()'));
assert.ok(html.includes('motion-progress-content'));
console.log('Recent private motion observations: grouping, week comparison, unverified provenance and privacy clearing passed.');
