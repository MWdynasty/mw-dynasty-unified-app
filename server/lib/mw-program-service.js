const PROGRAM=require('../api/_mw-program-data');

const PROGRAM_VERSION='mw-41-tiered-v2.9';
const TIERS={
  foundation:{label:'Foundation',volumeFactor:0.65,recoveryFactor:1.25,rpeCap:6,description:'Youth, new, returning, or low-readiness athletes. Technique and consistency lead.'},
  development:{label:'Development',volumeFactor:0.85,recoveryFactor:1.10,rpeCap:7,description:'Trained athletes building capacity, speed, and strength with controlled progression.'},
  performance:{label:'Performance',volumeFactor:1,recoveryFactor:1,rpeCap:8,description:'Advanced and professional athletes prepared for the complete MW prescription.'}
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
function scaleTrackWork(work,tier){
  const key=normalizeTier(tier),factor=TIERS[key].volumeFactor;
  const src=String(work||'').trim();
  if(!src||factor>=0.999)return src;
  let out=src;
  // Scale explicit repetition ranges such as "6–8 x 100m".
  out=out.replace(/\b(\d+)\s*[–-]\s*(\d+)\s*x\b/gi,(m,a,b)=>{
    const lo=scaledCount(a,factor),hi=Math.max(lo,scaledCount(b,factor));
    return `${lo}–${hi} x`;
  });
  // Scale explicit "N x ..." prescriptions. Percentages and distances are untouched.
  out=out.replace(/\b(\d+)\s*x\b/gi,(m,n)=>`${scaledCount(n,factor)} x`);
  // Scale ranges written without x only when they clearly describe rep counts.
  out=out.replace(/\b(\d+)\s*[–-]\s*(\d+)\s+(?=(?:fly|flies|reps?|starts?|sprints?|build-ups?|accelerations?)\b)/gi,(m,a,b)=>{
    const lo=scaledCount(a,factor),hi=Math.max(lo,scaledCount(b,factor));
    return `${lo}–${hi} `;
  });
  return out;
}
function scaleStructure(structure,tier){
  const key=normalizeTier(tier),factor=TIERS[key].volumeFactor;
  const src=String(structure||'').trim();
  if(!src||factor>=0.999)return src;
  return src
    .replace(/\b(\d+)\s+sets?\b/gi,(m,n)=>`${scaledCount(n,factor)} ${scaledCount(n,factor)===1?'set':'sets'}`)
    .replace(/\b(\d+)\s+full circuit reps?\b/gi,(m,n)=>`${scaledCount(n,factor)} full circuit ${scaledCount(n,factor)===1?'rep':'reps'}`)
    .replace(/\b(\d+)\s+rounds?\b/gi,(m,n)=>`${scaledCount(n,factor)} ${scaledCount(n,factor)===1?'round':'rounds'}`);
}
function trackTierWork(session,tier){
  const work=scaleTrackWork(session?.work,tier);
  if(work)return work;
  const structure=scaleStructure(session?.structure,tier);
  if(structure)return structure;
  return session?.work||session?.structure||'Follow the MW prescription for today.';
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
function scaleSectionTitle(title,tier){
  const key=normalizeTier(tier),factor=TIERS[key].volumeFactor;
  if(factor>=0.999)return String(title||'');
  return String(title||'').replace(/\b(\d+)\s+round(?:s|\(s\))?\b/gi,(m,n)=>{
    const rounds=scaledCount(n,factor);
    return `${rounds} ${rounds===1?'round':'rounds'}`;
  });
}
function adaptStrengthSections(sections,tier){
  const key=normalizeTier(tier);
  return (sections||[]).map(section=>{
    const isCircuit=/circuit|core|posterior chain|general strength/i.test(String(section?.title||''));
    return {
      ...section,
      baseTitle:section?.title,
      title:scaleSectionTitle(section?.title,key),
      entries:(section?.entries||[]).map(entry=>{
        const name=entry?.[0],rx=entry?.[1];
        // Circuit volume is changed through rounds; primary/accessory lift volume is changed through set count.
        const adjusted=isCircuit?String(rx||''):scaleStrengthSets(rx,key);
        return [name,adjusted];
      })
    };
  });
}
function trackGuidance(tier){
  const key=normalizeTier(tier),t=TIERS[key];
  return {
    volumeFactor:t.volumeFactor,
    recoveryFactor:t.recoveryFactor,
    rpeCap:t.rpeCap,
    volume:key==='performance'
      ?'Use the full listed prescription when readiness and mechanics support it.'
      :`MW has already reduced the displayed repetition volume to approximately ${Math.round(t.volumeFactor*100)}% of the master prescription. Do not add the removed volume back.`,
    recovery:t.recoveryFactor>1?`Take up to ${Math.round((t.recoveryFactor-1)*100)}% more recovery when needed to keep mechanics clean.`:'Use the listed full recoveries and stop when speed or mechanics deteriorate.',
    complexity:key==='foundation'?'Use standing/three-point starts before blocks; use low-impact alternatives for bounds and advanced plyometrics.':key==='development'?'Use blocks and advanced plyometrics only after the athlete demonstrates consistent positions and landing control.':'Use the complete event-specific setup when healthy and technically prepared.',
    safety:key==='foundation'?'No forced maximal sprinting, exhaustive reps, or make-up volume. A responsible adult/coach should supervise youth sessions.':'No make-up volume that compromises the next high-quality sprint day.'
  };
}
function strengthGuidance(tier){
  const key=normalizeTier(tier),t=TIERS[key];
  return {
    volumeFactor:t.volumeFactor,
    recoveryFactor:t.recoveryFactor,
    rpeCap:t.rpeCap,
    effort:`Cap working sets around RPE ${t.rpeCap}; leave ${Math.max(1,10-t.rpeCap)} or more quality reps in reserve.`,
    volume:key==='foundation'?'MW has already reduced displayed working sets/circuit rounds for Foundation loading. Do not add removed sets back.':key==='development'?'MW has already reduced displayed working sets where needed for Development loading.':'Use the full listed prescription when it supports track readiness.',
    loading:key==='foundation'?'Do not estimate maximal lifts for children. Progress only after repeatable technique and qualified supervision.':key==='development'?'Increase load only when every prescribed rep is technically sound.':'Use athlete-specific tested/training maxes and preserve bar speed.',
    priority:'Track quality governs the weight room. Reduce the final accessory block first when fatigue is excessive.'
  };
}
function compactTrack(week,tier){
  const w=PROGRAM.TRACK?.weeks?.[String(week)];if(!w)return null;
  const key=normalizeTier(tier);
  const tierWorkFor=s=>({
    foundation:trackTierWork(s,'foundation'),
    development:trackTierWork(s,'development'),
    performance:trackTierWork(s,'performance')
  });
  return {
    week:w.week,phase:w.phase,phaseName:w.phaseName,provenance:w.provenance,
    tier:key,tierLabel:TIERS[key].label,programVersion:PROGRAM_VERSION,tierGuidance:trackGuidance(key),
    sessions:(w.sessions||[]).map(s=>({
      ...s,
      baseWork:s.work||s.structure||'',
      baseRecovery:s.recovery,
      tier:key,
      tierWork:tierWorkFor(s),
      prescribedWork:trackTierWork(s,key),
      prescribedStructure:scaleStructure(s.structure,key),
      tierGuidance:trackGuidance(key)
    }))
  };
}
function compactStrength(week,tier){
  const s=PROGRAM.STRENGTH?.[String(week)];if(!s)return null;
  const key=normalizeTier(tier);
  return {
    ...s,
    baseSections:s.sections,
    sections:adaptStrengthSections(s.sections,key),
    tier:key,tierLabel:TIERS[key].label,programVersion:PROGRAM_VERSION,tierGuidance:strengthGuidance(key)
  };
}
function programWeek(week,trackTier,strengthTier){return {track:compactTrack(week,trackTier),strength:compactStrength(week,strengthTier)}}

module.exports={
  PROGRAM,PROGRAM_VERSION,TIERS,normalizeTier,programWeek,compactTrack,compactStrength,
  scaledCount,scaleTrackWork,scaleStructure,scaleStrengthSets,adaptStrengthSections
};
