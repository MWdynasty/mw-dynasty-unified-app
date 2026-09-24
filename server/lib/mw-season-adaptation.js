function clamp(n,min,max){return Math.max(min,Math.min(max,Number(n)||0))}
function normalizePhase(v){
  const x=String(v||'').toLowerCase();
  return ['foundation','pre_competition','competition','peak'].includes(x)?x:'foundation';
}
function normalizePriority(v){const x=String(v||'').toUpperCase();return ['A','B','C'].includes(x)?x:null}
function adaptationRecommendation({
  phaseCode='foundation',
  daysToPrimaryPeak=null,
  nextMeetPriority=null,
  nextMeetIsPrimary=false,
  missedSessions7d=0,
  incompleteSessions7d=0,
  consecutiveMissedDays=0,
  ageBand='adult',
  trainingTier='foundation'
}={}){
  const phase=normalizePhase(phaseCode),priority=normalizePriority(nextMeetPriority);
  const days=Number.isFinite(Number(daysToPrimaryPeak))?Number(daysToPrimaryPeak):null;
  const missed=clamp(missedSessions7d,0,20),incomplete=clamp(incompleteSessions7d,0,20);
  const totalDisruption=missed+incomplete;
  const youth=['early_adolescent','mid_adolescent'].includes(String(ageBand));
  const reasons=[];
  let action='continue';
  let loadAdjustment='none';
  let coachReview=false;
  let taper='none';

  if(priority==='A'&&nextMeetIsPrimary){taper='primary_peak';reasons.push('PRIMARY_A_MEET')}
  else if(priority==='A'){taper='qualifier_freshness';reasons.push('A_QUALIFIER')}
  else if(priority==='B'){taper='minor_freshness';reasons.push('B_MEET')}
  else if(priority==='C'){taper='none';reasons.push('C_TRAINING_MEET')}

  if(days!=null&&days<=7){
    action='protect_peak';loadAdjustment='reduce_low_priority_volume';
    reasons.push('PEAK_WITHIN_7_DAYS');
  }else if(phase==='peak'){
    action='protect_peak';loadAdjustment='reduce_low_priority_volume';
    reasons.push('PEAK_PHASE');
  }

  if(totalDisruption===1){
    reasons.push('SINGLE_MISSED_OR_INCOMPLETE');
    if(action==='continue')action='continue_no_makeup';
  }else if(totalDisruption>=2&&totalDisruption<=3){
    action=action==='protect_peak'?'protect_peak':'resequence_review';
    loadAdjustment='drop_low_priority_volume';
    reasons.push('MULTIPLE_MISSED_OR_INCOMPLETE');
  }else if(totalDisruption>=4||Number(consecutiveMissedDays)>=5){
    action=action==='protect_peak'?'protect_peak':'coach_review';
    loadAdjustment='reduce_and_rebuild_quality';
    coachReview=true;
    reasons.push('MAJOR_TRAINING_DISRUPTION');
  }

  if(youth&&totalDisruption>=2){
    coachReview=true;
    if(action==='continue'||action==='continue_no_makeup')action='resequence_review';
    reasons.push('YOUTH_CONSERVATIVE_GUARDRAIL');
  }
  if(String(trainingTier)==='foundation'&&totalDisruption>=3){
    coachReview=true;
    reasons.push('FOUNDATION_TIER_GUARDRAIL');
  }

  const principles=[
    'Do not move the real championship date just because training was missed.',
    'Do not stack missed high-intensity work onto the next quality day.',
    'Preserve the next important speed exposure and remove low-priority volume first.',
    'Track and strength adjustments must stay synchronized.'
  ];
  if(taper==='primary_peak')principles.push('Freshness for the primary A meet takes priority over make-up volume.');
  if(taper==='qualifier_freshness')principles.push('Use enough freshness to qualify without spending the full taper reserved for the primary peak.');
  if(taper==='minor_freshness')principles.push('Use only a small freshness adjustment; a B meet should not consume the championship taper.');
  if(priority==='C')principles.push('A C meet is a training/development competition and should not trigger a full taper.');

  return {
    version:'mw-season-adaptation-v1',
    phaseCode:phase,
    action,
    loadAdjustment,
    coachReview,
    taper,
    missedSessions7d:missed,
    incompleteSessions7d:incomplete,
    daysToPrimaryPeak:days,
    reasonCodes:reasons,
    principles
  };
}
module.exports={adaptationRecommendation,normalizePhase,normalizePriority};
