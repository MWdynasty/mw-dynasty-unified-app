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
