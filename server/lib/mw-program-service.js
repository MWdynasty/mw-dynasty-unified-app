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
function trackGuidance(tier){
  const t=TIERS[normalizeTier(tier)];
  return {
    volume:`Complete approximately ${Math.round(t.volumeFactor*100)}% of the listed repetitions or total distance; round down and preserve the main movement.`,
    recovery:t.recoveryFactor>1?`Take up to ${Math.round((t.recoveryFactor-1)*100)}% more recovery when needed to keep mechanics clean.`:'Use the listed full recoveries and stop when speed or mechanics deteriorate.',
    complexity:tier==='foundation'?'Use standing/three-point starts before blocks; use low-impact alternatives for bounds and advanced plyometrics.':tier==='development'?'Use blocks and advanced plyometrics only after the athlete demonstrates consistent positions and landing control.':'Use the complete event-specific setup when healthy and technically prepared.',
    safety:tier==='foundation'?'No forced maximal sprinting, exhaustive reps, or make-up volume. A responsible adult/coach should supervise youth sessions.':'No make-up volume that compromises the next high-quality sprint day.'
  };
}
function strengthGuidance(tier){
  const key=normalizeTier(tier),t=TIERS[key];
  return {
    effort:`Cap working sets around RPE ${t.rpeCap}; leave ${Math.max(1,10-t.rpeCap)} or more quality reps in reserve.`,
    volume:key==='foundation'?'Use 1–2 working sets per listed movement and prioritize bodyweight, light dumbbells, or an empty/light bar.':key==='development'?'Use 2–3 working sets and about 75–85% of listed accessory volume.':'Use the full listed prescription when it supports track readiness.',
    loading:key==='foundation'?'Do not estimate maximal lifts for children. Progress only after repeatable technique and qualified supervision.':key==='development'?'Increase load only when every prescribed rep is technically sound.':'Use athlete-specific tested/training maxes and preserve bar speed.',
    priority:'Track quality governs the weight room. Reduce the final accessory block first when fatigue is excessive.'
  };
}
function compactTrack(week,tier){
  const w=PROGRAM.TRACK?.weeks?.[String(week)];if(!w)return null;
  const key=normalizeTier(tier);
  return {week:w.week,phase:w.phase,phaseName:w.phaseName,provenance:w.provenance,tier:key,tierLabel:TIERS[key].label,programVersion:PROGRAM_VERSION,tierGuidance:trackGuidance(key),sessions:(w.sessions||[]).map(s=>({...s,baseWork:s.work,baseRecovery:s.recovery,tier:key,tierGuidance:trackGuidance(key)}))};
}
function compactStrength(week,tier){
  const s=PROGRAM.STRENGTH?.[String(week)];if(!s)return null;
  const key=normalizeTier(tier);
  return {...s,tier:key,tierLabel:TIERS[key].label,programVersion:PROGRAM_VERSION,tierGuidance:strengthGuidance(key)};
}
function programWeek(week,trackTier,strengthTier){return {track:compactTrack(week,trackTier),strength:compactStrength(week,strengthTier)}}

module.exports={PROGRAM,PROGRAM_VERSION,TIERS,normalizeTier,programWeek,compactTrack,compactStrength};
