const assert=require('node:assert/strict');
const {programWeek,PROGRAM_VERSION}=require('./server/lib/mw-program-service');
const knowledge=require('./server/knowledge/coach-mw-book-knowledge.json');
assert.equal(knowledge.source.sourceImagesReviewed,85);
assert.ok(knowledge.mwSynthesis.trainingDesign.length>=5);
assert.ok(knowledge.mwSynthesis.youthAndDevelopment.some(x=>x.includes('10-13')));
for(let week=1;week<=41;week++){
  for(const tier of ['foundation','development','performance']){
    const x=programWeek(week,tier,tier);
    assert.equal(x.track.week,week);
    assert.equal(x.track.sessions.length,4);
    assert.equal(x.track.tier,tier);
    assert.equal(x.strength.tier,tier);
    assert.equal(x.track.programVersion,PROGRAM_VERSION);
    assert.ok(x.track.tierGuidance.volume);
    assert.ok(x.strength.tierGuidance.loading);
  }
}
console.log('PASS: 41 weeks × 3 track tiers × 3 synchronized strength tiers');


const foundationWeek1=programWeek(1,'foundation','foundation');
const developmentWeek1=programWeek(1,'development','development');
const performanceWeek1=programWeek(1,'performance','performance');

assert.notEqual(foundationWeek1.track.sessions[0].prescribedWork,performanceWeek1.track.sessions[0].prescribedWork,'Foundation track prescription should be reduced');
assert.equal(foundationWeek1.track.sessions[0].prescribedWork.startsWith('4 x 30m'),true);
assert.equal(developmentWeek1.track.sessions[0].prescribedWork.startsWith('5 x 30m'),true);
assert.equal(performanceWeek1.track.sessions[0].prescribedWork.startsWith('6 x 30m'),true);

assert.equal(foundationWeek1.strength.sections[0].entries[0][1].startsWith('2 x 3'),true);
assert.equal(developmentWeek1.strength.sections[0].entries[0][1].startsWith('3 x 3'),true);
assert.equal(performanceWeek1.strength.sections[0].entries[0][1].startsWith('3 x 3'),true);
assert.equal(foundationWeek1.strength.sections[1].title.includes('1 round'),true);
assert.equal(performanceWeek1.strength.sections[1].title.includes('2 rounds'),true);

console.log('PASS: developmental volume changes actual track reps and strength sets/rounds');
