const assert=require('assert');
const {
  phaseAllocation,sourceWeekMap,derivePlan,positionForPlan,levelGroup
}=require('./server/lib/mw-season-intelligence');

function counts(plan){return ['foundation','pre_competition','competition','peak'].map(k=>plan[k].count)}
function sum(xs){return xs.reduce((a,b)=>a+b,0)}

assert.deepStrictEqual(counts(phaseAllocation(8)),[2,2,3,1]);
assert.deepStrictEqual(counts(phaseAllocation(12)),[3,3,4,2]);
assert.deepStrictEqual(counts(phaseAllocation(16)),[4,4,6,2]);
assert.deepStrictEqual(counts(phaseAllocation(24)),[6,6,9,3]);

for(const weeks of [4,6,8,10,12,16,18,20,24,30,41]){
  const phases=phaseAllocation(weeks);
  assert.equal(sum(counts(phases)),weeks,`phase counts must sum to ${weeks}`);
  const map=sourceWeekMap(phases);
  assert.equal(Object.keys(map).length,weeks,`source map must cover every season week for ${weeks}`);
  let previous=0;
  for(let w=1;w<=weeks;w++){
    const source=Number(map[String(w)]?.sourceWeek);
    assert(source>=1&&source<=41,`source week must stay within master program: ${source}`);
    assert(source>=previous,`source weeks must be monotonic at season week ${w}`);
    previous=source;
  }
}

assert.equal(levelGroup('7','school'),'middle_school');
assert.equal(levelGroup('10','school'),'high_school');
assert.equal(levelGroup('10','usatf'),'youth_club');
assert.equal(levelGroup('collegiate','ncaa'),'collegiate');
assert.equal(levelGroup('professional','professional_open'),'professional');

const template={minWeeks:12,targetWeeks:16,maxWeeks:17};
const plan=derivePlan({
  seasonType:'outdoor',competitionLevel:'10',competitionState:'AL',competitionPath:'school',seasonYear:2027,
  startDate:'2027-01-18',firstMeetDate:'2027-02-25',primaryPeakDate:'2027-05-08',
  template,registry:null,continuation:false
});
assert.equal(plan.needsDates,false);
assert(plan.seasonLengthWeeks>=16&&plan.seasonLengthWeeks<=17);
assert.equal(Object.keys(plan.sourceWeekMap).length,plan.seasonLengthWeeks);

const active=positionForPlan({
  season_start_date:plan.seasonStartDate,primary_peak_date:plan.primaryPeakDate,
  season_length_weeks:plan.seasonLengthWeeks,phase_plan:plan.phasePlan,source_week_map:plan.sourceWeekMap
},new Date('2027-03-10T12:00:00Z'));
assert.equal(active.status,'active');
assert(active.week>=1&&active.week<=plan.seasonLengthWeeks);
assert(active.sourceWeek>=1&&active.sourceWeek<=41);

const preseason=positionForPlan({
  season_start_date:plan.seasonStartDate,primary_peak_date:plan.primaryPeakDate,
  season_length_weeks:plan.seasonLengthWeeks,phase_plan:plan.phasePlan,source_week_map:plan.sourceWeekMap
},new Date('2026-12-01T12:00:00Z'));
assert.equal(preseason.status,'preseason');
assert.equal(preseason.week,1);

const completed=positionForPlan({
  season_start_date:plan.seasonStartDate,primary_peak_date:plan.primaryPeakDate,
  season_length_weeks:plan.seasonLengthWeeks,phase_plan:plan.phasePlan,source_week_map:plan.sourceWeekMap
},new Date('2027-06-01T12:00:00Z'));
assert.equal(completed.status,'completed');
assert.equal(completed.week,plan.seasonLengthWeeks);

const continuationPhases=phaseAllocation(16,{continuation:true});
const continuationMap=sourceWeekMap(continuationPhases,{continuation:true});
assert(Number(continuationMap['1'].sourceWeek)>=7);

console.log('MW Season Intelligence tests passed');
