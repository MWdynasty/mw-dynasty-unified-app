const PROGRAM=require('../api/_mw-program-data');
const {getTrackWeek,normalizeEventGroup}=require('./mw-sprint-system-v3');

const PROGRAM_VERSION='mw-sprint-v3.0';
const TIERS={
  foundation:{label:'Foundation',volumeFactor:0.75,distanceFactor:0.80,recoveryFactor:1.20,rpeCap:6,description:'Developing athletes receive a condensed but meaningful version of the same MW stimulus.'},
  development:{label:'Development',volumeFactor:0.90,distanceFactor:0.92,recoveryFactor:1.08,rpeCap:7,description:'Trained athletes receive substantial volume and speed while progressing toward the master prescription.'},
  performance:{label:'Performance',volumeFactor:1,distanceFactor:1,recoveryFactor:1,rpeCap:8,description:'Advanced, collegiate and professional athletes receive the complete MW master prescription when readiness supports it.'}
};

function normalizeTier(value){
  const x=String(value||'').trim().toLowerCase();
  if(['foundation','development','performance'].includes(x))return x;
  if(['beginner','youth','novice','returning'].includes(x))return 'foundation';
  if(['intermediate','trained'].includes(x))return 'development';
  if(['advanced','elite','professional','pro'].includes(x))return 'performance';
  return 'foundation';
}
function scaledCount(n,factor){
  const x=Math.max(1,Math.trunc(Number(n)||1));
  if(factor>=0.999)return x;
  return Math.max(1,Math.round(x*factor));
}
function roundSprintDistance(n,factor){
  const x=Number(n)||0;
  if(factor>=0.999||x<120)return x;
  return Math.max(80,Math.round((x*factor)/10)*10);
}
function scaleTrackWork(work,tier,{stressDay=false}={}){
  const key=normalizeTier(tier),t=TIERS[key],src=String(work||'').trim();
  if(!src||key==='performance')return src;
  let out=src;
  out=out.replace(/\b(\d+)(?:\s*[–-]\s*(\d+))?\s*x\b/gi,(m,a,b)=>{
    const lo=scaledCount(a,t.volumeFactor);
    if(b==null)return `${lo} x`;
    const hi=Math.max(lo,scaledCount(b,t.volumeFactor));
    return lo===hi?`${lo} x`:`${lo}–${hi} x`;
  });
  out=out.replace(/\b(\d+)\s*[–-]\s*(\d+)\s+(?=(?:fly|flies|reps?|starts?|sprints?|build-ups?|accelerations?)\b)/gi,(m,a,b)=>{
    const lo=scaledCount(a,t.volumeFactor),hi=Math.max(lo,scaledCount(b,t.volumeFactor));
    return lo===hi?`${lo} `:`${lo}–${hi} `;
  });
  if(stressDay){
    out=out.replace(/\b(\d{3})m\b/g,(m,d)=>`${roundSprintDistance(d,t.distanceFactor)}m`);
  }
  return out;
}
function scaleStructure(structure,tier){
  const key=normalizeTier(tier),factor=TIERS[key].volumeFactor,src=String(structure||'').trim();
  if(!src||key==='performance')return src;
  return src
    .replace(/\b(\d+)\s+sets?\b/gi,(m,n)=>{const v=scaledCount(n,factor);return `${v} ${v===1?'set':'sets'}`;})
    .replace(/\b(\d+)\s+full circuit reps?\b/gi,(m,n)=>{const v=scaledCount(n,factor);return `${v} full circuit ${v===1?'rep':'reps'}`;})
    .replace(/\b(\d+)\s+rounds?\b/gi,(m,n)=>{const v=scaledCount(n,factor);return `${v} ${v===1?'round':'rounds'}`;});
}
function scaleStrengthSets(prescription,tier){
  const key=normalizeTier(tier);
  if(key==='performance')return String(prescription||'');
  return String(prescription||'').replace(/^\s*(\d+)\s*x\s*/i,(m,n)=>{
    const raw=scaledCount(n,TIERS[key].volumeFactor);
    const sets=key==='foundation'?Math.min(2,raw):Math.min(3,raw);
    return `${sets} x `;
  });
}
function reduceStrengthPrescription(prescription,{factor=1,maxSets=null}={}){
  return String(prescription||'').replace(/^\s*(\d+)\s*(?:-|–)?\s*(\d+)?\s*x\s*/i,(m,a,b)=>{
    let n=Math.max(1,Math.round(Number(a)*factor));
    if(maxSets)n=Math.min(maxSets,n);
    return `${n} x `;
  });
}
function scaleSectionTitle(title,tier){
  const key=normalizeTier(tier),factor=TIERS[key].volumeFactor;
  if(key==='performance')return String(title||'');
  return String(title||'').replace(/\b(\d+)\s+round(?:s|\(s\))?\b/gi,(m,n)=>{
    const rounds=scaledCount(n,factor);
    return `${rounds} ${rounds===1?'round':'rounds'}`;
  });
}
function cleanStrengthEntry(entry){
  const name=String(entry?.[0]||'').trim(),rx=String(entry?.[1]||'').trim();
  if(!name)return null;
  if(/^(development phase|programming note|loading progression|represented as|mw strength|weeks 9|strength & speed|continuation of|loading:|olympic-lift|intended speed|rest:|60-90 seconds|track-first rule|before compromising|phase \d|phase objective)/i.test(name))return null;
  if(name.length>80&&!/mobility|weight room|priority|championship/i.test(name))return null;
  return [name,rx];
}
function cleanStrengthSection(section){
  const entries=(section?.entries||[]).map(cleanStrengthEntry).filter(Boolean);
  if(!entries.length)return null;
  return {...section,entries};
}
function renameDay(title,from,to){
  let x=String(title||'');
  if(from==='EARLY WEEK')return x.replace(/^EARLY WEEK/i,to);
  return x.replace(new RegExp('^'+from,'i'),to);
}
function reduceSection(section,{factor=1,maxSets=null,keepEntries=null,titlePrefix=null}={}){
  const entries=(section.entries||[]).slice(0,keepEntries||undefined).map(([name,rx])=>[name,reduceStrengthPrescription(rx,{factor,maxSets})]);
  let title=String(section.title||'');
  title=title.replace(/\b(\d+)\s+round(?:s|\(s\))?\b/gi,()=> '1 round');
  if(titlePrefix)title=titlePrefix;
  return {...section,title,entries};
}
function sourceSectionsForDay(week,prefix){
  const s=PROGRAM.STRENGTH?.[String(week)];
  return (s?.sections||[]).map(cleanStrengthSection).filter(Boolean).filter(sec=>String(sec.title||'').toUpperCase().startsWith(prefix));
}
function synchronizedStrengthSections(week){
  const w=Number(week)||1;
  const src=PROGRAM.STRENGTH?.[String(w)];
  if(!src)return [];
  if(w===41){
    const early=sourceSectionsForDay(w,'EARLY WEEK');
    return early.map(sec=>({...sec,title:renameDay(sec.title,'EARLY WEEK','TUE - OPTIONAL CHAMPIONSHIP PRIMER')}));
  }
  let tue=sourceSectionsForDay(w,'MON').map(sec=>({...sec,title:renameDay(sec.title,'MON','TUE')}));
  let thu=sourceSectionsForDay(w,'WED').map(sec=>({...sec,title:renameDay(sec.title,'WED','THU')}));
  if(w>=17&&w<=24){
    thu=thu.map((sec,i)=>reduceSection(sec,{factor:0.75,maxSets:3,titlePrefix:renameDay(sec.title,'WED',i===0?'THU - REDUCED POWER / HINGE':'THU - REDUCED SUPPORT')}));
  }else if(w>=25&&w<=33){
    thu=thu.slice(0,1).map(sec=>reduceSection(sec,{factor:0.60,maxSets:2,keepEntries:3,titlePrefix:'THU - OPTIONAL SATURDAY-MEET MICRO-DOSE'}));
  }else if(w>=34){
    thu=[];
  }
  return [...tue,...thu];
}
function adaptStrengthSections(sections,tier){
  const key=normalizeTier(tier);
  return (sections||[]).map(section=>{
    const isCircuit=/circuit|core|posterior chain|general strength|support/i.test(String(section?.title||''));
    return {
      ...section,
      baseTitle:section?.title,
      title:scaleSectionTitle(section?.title,key),
      entries:(section?.entries||[]).map(entry=>{
        const name=entry?.[0],rx=entry?.[1];
        return [name,isCircuit?String(rx||''):scaleStrengthSets(rx,key)];
      })
    };
  });
}
function tierWickets(wickets,tier){
  const key=normalizeTier(tier),w={...(wickets||{})};
  if(key==='foundation')w.passes=String(w.passes||'').replace(/\d+\s*[-–]\s*\d+/,'3-4');
  else if(key==='development')w.passes=String(w.passes||'').replace(/\d+\s*[-–]\s*\d+/,'4-5');
  return w;
}
function trackGuidance(tier){
  const key=normalizeTier(tier),t=TIERS[key];
  return {
    volumeFactor:t.volumeFactor,distanceFactor:t.distanceFactor,recoveryFactor:t.recoveryFactor,rpeCap:t.rpeCap,
    volume:key==='performance'
      ?'Use the complete MW prescription when readiness and mechanics support it.'
      :key==='development'
        ?'MW preserves the same training purpose while condensing total work to a substantial Development dose.'
        :'MW preserves the same training purpose while condensing reps and longer stress distances for Foundation readiness.',
    recovery:t.recoveryFactor>1?`Take up to ${Math.round((t.recoveryFactor-1)*100)}% more recovery when needed to preserve mechanics and intended pace.`:'Use the listed recovery and stop when speed or mechanics deteriorate.',
    complexity:key==='foundation'?'Progress starts, plyometrics and wicket spacing only after positions are repeatable.':'Use the prescribed technical progression without chasing fatigue for its own sake.',
    safety:'No make-up volume that compromises the next quality sprint day. Mechanics must survive fatigue.'
  };
}
function strengthGuidance(tier,week){
  const key=normalizeTier(tier),t=TIERS[key],w=Number(week)||1;
  const schedule=w<=16?'Tuesday + Thursday':w<=24?'Tuesday + reduced Thursday':w<=33?'Tuesday maintenance + optional Thursday micro-dose before Saturday meets only':w<=40?'Tuesday neural maintenance only':'Optional early-week championship primer only';
  return {
    volumeFactor:t.volumeFactor,recoveryFactor:t.recoveryFactor,rpeCap:t.rpeCap,schedule,
    effort:`Cap working sets around RPE ${t.rpeCap}; preserve bar speed and clean positions.`,
    volume:key==='performance'?'Use the synchronized master strength dose only when it supports track readiness.':'MW has already condensed working sets for this tier; do not add removed sets back.',
    loading:key==='foundation'?'Do not estimate maximal lifts for inexperienced youth. Use technically reliable training loads and qualified supervision.':'Increase load only when every prescribed rep remains technically sound.',
    priority:'Track quality governs the weight room. Friday is protected as a major track / competition slot; missed lifting is not moved there.'
  };
}
function compactTrack(week,tier,eventGroup='100_200'){
  const key=normalizeTier(tier),base=getTrackWeek(week,eventGroup);
  if(!base)return null;
  const guidance=trackGuidance(key);
  const sessions=(base.sessions||[]).map(s=>{
    const stressDay=s.day===1||s.day===5;
    const tierWork={
      foundation:scaleTrackWork(s.work,'foundation',{stressDay}),
      development:scaleTrackWork(s.work,'development',{stressDay}),
      performance:s.work
    };
    return {
      ...s,
      baseWork:s.work,
      tier:key,
      tierWork,
      prescribedWork:tierWork[key],
      wickets:tierWickets(s.wickets,key),
      tierGuidance:guidance
    };
  });
  return {...base,tier:key,tierLabel:TIERS[key].label,programVersion:PROGRAM_VERSION,tierGuidance:guidance,sessions};
}
function compactStrength(week,tier){
  const src=PROGRAM.STRENGTH?.[String(week)];if(!src)return null;
  const key=normalizeTier(tier),sections=synchronizedStrengthSections(week);
  return {
    ...src,
    title:`WEEK ${week} - SYNCHRONIZED STRENGTH`,
    baseSections:sections,
    sections:adaptStrengthSections(sections,key),
    tier:key,tierLabel:TIERS[key].label,programVersion:PROGRAM_VERSION,
    tierGuidance:strengthGuidance(key,week),
    coachNote:`Synchronized with MW Sprint System v3. ${strengthGuidance(key,week).schedule}. Track first. No Friday make-up lifting. ${src.coachNote||''}`
  };
}
function programWeek(week,trackTier,strengthTier,eventGroup='100_200'){
  return {track:compactTrack(week,trackTier,eventGroup),strength:compactStrength(week,strengthTier)};
}
module.exports={
  PROGRAM,PROGRAM_VERSION,TIERS,normalizeTier,normalizeEventGroup,programWeek,compactTrack,compactStrength,
  scaledCount,scaleTrackWork,scaleStructure,scaleStrengthSets,adaptStrengthSections,synchronizedStrengthSections
};
