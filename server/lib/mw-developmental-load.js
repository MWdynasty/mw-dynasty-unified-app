const {TIERS,normalizeTier}=require('./mw-program-service');

function ageOn(value,now=new Date()){
  if(!value)return null;
  const dob=new Date(String(value).slice(0,10)+'T00:00:00Z');
  if(Number.isNaN(dob.getTime()))return null;
  let age=now.getUTCFullYear()-dob.getUTCFullYear();
  if(now.getUTCMonth()<dob.getUTCMonth()||(now.getUTCMonth()===dob.getUTCMonth()&&now.getUTCDate()<dob.getUTCDate()))age--;
  return age;
}

function recommendedTiers(context={},answers={}){
  const age=ageOn(answers.dateOfBirth||context.athlete?.date_of_birth);
  const years=Math.max(0,Number(answers.trainingAge??context.athlete?.track_training_years)||0);
  const lifting=Math.max(0,Number(answers.lifting)||0);
  const continuity=Math.max(0,Number(answers.continuity)||0);
  const speed=Math.max(0,Number(answers.speedExposure)||0);
  const raced=Number(answers.recentRace)===1;

  const performanceReady=years>=5&&continuity>=3&&speed>=3&&raced;
  const trackTier=(age!=null&&age<14)||years<2||continuity<=1||speed===0
    ?'foundation'
    :performanceReady?'performance':'development';
  const strengthTier=(age!=null&&age<14)||lifting===0
    ?'foundation'
    :lifting===1||years<4?'development':'performance';

  return {age,trainingYears:years,trackTier,strengthTier};
}

function developmentalLoadProfile({
  dateOfBirth,
  trainingYears=0,
  trackTier='foundation',
  strengthTier='foundation'
}={}){
  const age=ageOn(dateOfBirth);
  const tt=normalizeTier(trackTier),st=normalizeTier(strengthTier);
  const track=TIERS[tt],strength=TIERS[st];
  let ageBand='adult';
  if(age!=null&&age<14)ageBand='early_adolescent';
  else if(age!=null&&age<16)ageBand='mid_adolescent';
  else if(age!=null&&age<18)ageBand='late_adolescent';

  return {
    version:'mw-developmental-load-v1',
    age,
    ageBand,
    trainingYears:Math.max(0,Number(trainingYears)||0),
    trackTier:tt,
    strengthTier:st,
    track:{
      volumeFactor:track.volumeFactor,
      recoveryFactor:track.recoveryFactor,
      rpeCap:track.rpeCap
    },
    strength:{
      volumeFactor:strength.volumeFactor,
      recoveryFactor:strength.recoveryFactor,
      rpeCap:strength.rpeCap
    },
    principle:'Season Intelligence selects the appropriate MW source week; developmental loading controls how much work and recovery the athlete receives.'
  };
}

module.exports={ageOn,recommendedTiers,developmentalLoadProfile};
