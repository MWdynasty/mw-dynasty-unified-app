'use strict';
// Documents the athlete notification deep-link gap. Does not change product code.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const Identity=require('../lib/mw-workout-identity');
const html=fs.readFileSync(require('path').join(__dirname,'../athlete/index.html'),'utf8');
const click=html.match(/if\(n\?\.notification_type==='workout_incomplete'\)\{const id=String\(n\.entity_id\|\|''\),m=id\.match\(([^;]+)\);if\(m\)setTimeout/);
if(!click)throw new Error('Could not locate workout_incomplete deep-link parser');
const parser=new Function('id',`return id.match(${click[1]});`);
const A='11111111-1111-1111-1111-111111111111';
const P='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const canonical=Identity.create({athleteId:A,seasonPlanId:P,week:3,day:2}).workoutKey;
const cases=[
  ['legacy track','mw-track-w3-d2',true,3,2],
  ['legacy season',`mw-season-${P}-w3-d2`,true,3,2],
  ['canonical after migration',canonical,false,null,null]
];
let failed=false;
for(const [label,id,shouldMatch,week,day] of cases){
  const m=parser(id);
  const ok=shouldMatch?!!(m&&Number(m[1])===week&&Number(m[2])===day):m==null;
  console.log(`${ok?'PASS':'FAIL'}: ${label} entity_id ${m?'parsed w'+m[1]+'-d'+m[2]:'did not parse'}`);
  if(!ok)failed=true;
}
assert.equal(parser(canonical),null,'canonical incomplete-workout notifications cannot open Practice');
console.log('REPRODUCED: workout_incomplete handler does not parse mw-workout-v1 keys.');
process.exit(failed?1:0);
