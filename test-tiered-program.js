const assert=require('node:assert/strict');
const {programWeek,PROGRAM_VERSION,normalizeEventGroup}=require('./server/lib/mw-program-service');
const knowledge=require('./server/knowledge/coach-mw-book-knowledge.json');

assert.equal(knowledge.source.sourceImagesReviewed,85);
assert.ok(knowledge.mwSynthesis.trainingDesign.length>=5);
assert.ok(knowledge.mwSynthesis.youthAndDevelopment.some(x=>x.includes('10-13')));
assert.equal(PROGRAM_VERSION,'mw-sprint-v3.0');

for(let week=1;week<=41;week++){
  for(const tier of ['foundation','development','performance']){
    for(const eventGroup of ['100_200','400']){
      const x=programWeek(week,tier,tier,eventGroup);
      assert.equal(x.track.week,week);
      assert.equal(x.track.sessions.length,5,'MW V3 must prescribe Monday-Friday track architecture');
      assert.equal(x.track.tier,tier);
      assert.equal(x.strength.tier,tier);
      assert.equal(x.track.programVersion,PROGRAM_VERSION);
      assert.equal(x.track.eventGroup,eventGroup);
      assert.ok(x.track.tierGuidance.volume);
      assert.ok(x.strength.tierGuidance.loading);
      assert.equal(x.track.sessions[0].warmup,'Competition Warm-Up');
      assert.equal(x.track.sessions[1].warmup,'Competition Warm-Up');
      assert.equal(x.track.sessions[2].warmup,'Big Warm-Up');
      assert.equal(x.track.sessions[3].warmup,'Competition Warm-Up');
      for(const session of x.track.sessions){
        assert.ok(session.wickets?.type,'Every Monday-Friday session must include a wicket prescription');
        assert.ok(session.wickets?.passes,'Every Monday-Friday session must include wicket volume');
        assert.ok(session.prescribedWork,'Every session must include tier-adjusted work');
      }
    }
  }
}
console.log('PASS: 41 weeks × 3 tiers × 2 event branches with five-day warm-up/wicket architecture');

assert.equal(normalizeEventGroup(['100m','200m']),'100_200');
assert.equal(normalizeEventGroup(['100m','400m']),'400');
assert.equal(normalizeEventGroup('400'),'400');

const short15=programWeek(15,'performance','performance','100_200');
const long15=programWeek(15,'performance','performance','400');
assert.match(short15.track.sessions[4].prescribedWork,/3 x 200m/);
assert.match(long15.track.sessions[4].prescribedWork,/2 x 300m/);
assert.notEqual(short15.track.sessions[4].prescribedWork,long15.track.sessions[4].prescribedWork);
console.log('PASS: 100/200 athletes share a short-sprint branch while 400 athletes receive the 400 branch');

const f1=programWeek(1,'foundation','foundation','100_200');
const d1=programWeek(1,'development','development','100_200');
const p1=programWeek(1,'performance','performance','100_200');
assert.notEqual(f1.track.sessions[0].prescribedWork,p1.track.sessions[0].prescribedWork);
assert.notEqual(d1.track.sessions[0].prescribedWork,p1.track.sessions[0].prescribedWork);
assert.match(f1.track.sessions[0].prescribedWork,/x/);
assert.match(d1.track.sessions[0].prescribedWork,/x/);
assert.ok(f1.track.tierGuidance.rpeCap<d1.track.tierGuidance.rpeCap);
assert.ok(d1.track.tierGuidance.rpeCap<p1.track.tierGuidance.rpeCap);
console.log('PASS: Foundation and Development are condensed, not stimulus-free');

const strength1=p1.strength.sections.map(x=>x.title);
assert.ok(strength1.some(x=>x.startsWith('TUE')));
assert.ok(strength1.some(x=>x.startsWith('THU')));
assert.equal(strength1.some(x=>/^(MON|WED|FRI)/.test(x)),false);
assert.equal(f1.strength.sections[0].entries[0][1].startsWith('2 x 3'),true);
assert.equal(d1.strength.sections[0].entries[0][1].startsWith('3 x 3'),true);

const strength25=programWeek(25,'performance','performance','400').strength.sections.map(x=>x.title);
assert.ok(strength25.some(x=>x.startsWith('TUE')));
assert.ok(strength25.some(x=>x.startsWith('THU - OPTIONAL SATURDAY-MEET MICRO-DOSE')));
assert.equal(strength25.some(x=>x.startsWith('FRI')),false);

const strength34=programWeek(34,'performance','performance','100_200').strength.sections.map(x=>x.title);
assert.ok(strength34.length>=1);
assert.equal(strength34.every(x=>x.startsWith('TUE')),true);

const strength41=programWeek(41,'performance','performance','100_200').strength.sections.map(x=>x.title);
assert.equal(strength41.length,1);
assert.ok(strength41[0].startsWith('TUE - OPTIONAL CHAMPIONSHIP PRIMER'));
console.log('PASS: strength progression is synchronized to Tuesday/Thursday and competition tapering');

for(const week of [1,2,4,6])assert.equal(programWeek(week,'performance','performance','100_200').track.sessions[4].warmup,'Big Warm-Up');
for(const week of [3,5,7,8,9,25,41])assert.equal(programWeek(week,'performance','performance','100_200').track.sessions[4].warmup,'Competition Warm-Up');
console.log('PASS: Friday warm-up alternates by stimulus while competition warm-up remains the dominant race-day pattern');
