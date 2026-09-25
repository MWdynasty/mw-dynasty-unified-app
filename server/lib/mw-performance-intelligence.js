const {SUPABASE_URL,SUPABASE_KEY}=require('./mw-auth');

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function pct(v){return Math.round(v*100)}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function asArray(x){return Array.isArray(x)?x:[]}

async function restRows(path,token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
  });
  const d=await r.json().catch(()=>[]);
  if(!r.ok)return [];
  return Array.isArray(d)?d:[];
}

async function loadPerformanceContext(c){
  const aid=c?.athlete?.id;
  if(!aid||!c?.token)return {recentWorkouts:[],recentPaceLogs:[],recentStrengthLogs:[]};
  const id=encodeURIComponent(aid);
  const [workouts,pace,strength]=await Promise.all([
    restRows(`workout_completions?athlete_id=eq.${id}&select=program_week,program_day,completion_status,session_rpe,pace_check_status,pace_reps_total,pace_reps_hit,scheduled_date,started_at,last_activity_at,completed_at&order=last_activity_at.desc&limit=16`,c.token),
    restRows(`athlete_pace_logs?athlete_id=eq.${id}&select=program_week,program_day,rep_number,distance_m,target_seconds,actual_seconds,intensity_percent,recorded_at&order=recorded_at.desc&limit=32`,c.token),
    restRows(`athlete_strength_session_logs?athlete_id=eq.${id}&select=program_week,program_day,exercise_name,set_number,reps_completed,target_load,actual_load,weight_unit,set_rpe,recorded_at&order=recorded_at.desc&limit=24`,c.token)
  ]);
  return {recentWorkouts:workouts,recentPaceLogs:pace,recentStrengthLogs:strength};
}

function groupLatestPaceSession(rows){
  const list=asArray(rows);
  if(!list.length)return [];
  const first=list[0];
  return list
    .filter(x=>Number(x.program_week)===Number(first.program_week)&&Number(x.program_day)===Number(first.program_day))
    .sort((a,b)=>Number(a.rep_number||0)-Number(b.rep_number||0));
}

function evaluatePerformance(context,{coachManaged=false,officialWeek=null,officialDay=null}={}){
  const workouts=asArray(context?.recentWorkouts);
  const pace=asArray(context?.recentPaceLogs);
  const strength=asArray(context?.recentStrengthLogs);
  let score=0;
  const signals=[];

  const recent=workouts.slice(0,6);
  const completed=recent.filter(x=>String(x.completion_status)==='completed');
  const disrupted=recent.filter(x=>['absent','incomplete','partial'].includes(String(x.completion_status)));

  const highRpe=completed.filter(x=>n(x.session_rpe)!=null&&n(x.session_rpe)>=9);
  if(highRpe.length>=2){
    score+=3;
    signals.push({type:'repeated_high_rpe',severity:'review',message:'Two or more recent completed track sessions were logged at RPE 9+.'});
  }else if(highRpe.length===1){
    score+=1;
    signals.push({type:'high_rpe',severity:'monitor',message:'A recent completed track session was logged at RPE 9+.'});
  }

  if(disrupted.length>=3){
    score+=3;
    signals.push({type:'training_continuity',severity:'review',message:'Three or more of the latest tracked sessions are absent, incomplete, or partial.'});
  }else if(disrupted.length>=2){
    score+=1;
    signals.push({type:'training_continuity',severity:'monitor',message:'Recent training continuity includes multiple absent/incomplete sessions.'});
  }

  const paceChecks=recent.filter(x=>n(x.pace_reps_total)>0);
  if(paceChecks.length){
    const latest=paceChecks[0],total=Math.max(1,n(latest.pace_reps_total)||1),hit=Math.max(0,n(latest.pace_reps_hit)||0),rate=hit/total;
    if(rate<0.5){
      score+=3;
      signals.push({type:'pace_compliance',severity:'review',message:`Only ${hit}/${total} pace-checked reps were inside target on the latest checked session.`,value:rate});
    }else if(rate<0.8){
      score+=1;
      signals.push({type:'pace_compliance',severity:'monitor',message:`${hit}/${total} pace-checked reps were inside target on the latest checked session.`,value:rate});
    }else{
      signals.push({type:'pace_compliance',severity:'positive',message:`${hit}/${total} pace-checked reps were inside target on the latest checked session.`,value:rate});
    }
  }

  const latestPace=groupLatestPaceSession(pace).filter(x=>n(x.target_seconds)>0&&n(x.actual_seconds)>0);
  if(latestPace.length>=2){
    const errors=latestPace.map(x=>(n(x.actual_seconds)-n(x.target_seconds))/n(x.target_seconds));
    const avg=errors.reduce((a,b)=>a+b,0)/errors.length;
    const late=errors.slice(-2).reduce((a,b)=>a+b,0)/Math.min(2,errors.length);
    const firstActual=n(latestPace[0].actual_seconds),lastActual=n(latestPace[latestPace.length-1].actual_seconds);
    const fade=(firstActual&&lastActual)?(lastActual-firstActual)/firstActual:0;
    if(avg>0.05||late>0.06||fade>0.06){
      score+=3;
      signals.push({type:'rep_degradation',severity:'review',message:'Latest timed reps show material pace degradation beyond the intended target.',value:Math.max(avg,late,fade)});
    }else if(avg>0.03||late>0.035||fade>0.04){
      score+=1;
      signals.push({type:'rep_degradation',severity:'monitor',message:'Latest timed reps show moderate late-session pace degradation.',value:Math.max(avg,late,fade)});
    }else{
      signals.push({type:'rep_degradation',severity:'positive',message:'Latest timed reps remained reasonably stable around the intended target.',value:Math.max(avg,late,fade)});
    }
  }

  const hardStrength=strength.filter(x=>n(x.set_rpe)!=null&&n(x.set_rpe)>=9.5).slice(0,8);
  if(hardStrength.length>=3){
    score+=2;
    signals.push({type:'strength_fatigue',severity:'monitor',message:'Several recent strength sets were logged near maximal effort (RPE 9.5+).'});
  }else if(hardStrength.length){
    score+=1;
    signals.push({type:'strength_fatigue',severity:'monitor',message:'A recent strength set was logged near maximal effort.'});
  }

  let status='ready';
  if(score>=4)status='coach_review';
  else if(score>=1)status='monitor';

  const authority=coachManaged?'coach':'mw_independent';
  const directive=status==='ready'
    ? {
        code:'continue_as_planned',
        track:'Continue the scheduled MW sprint prescription while preserving mechanics and target pace.',
        strength:'Use the synchronized strength prescription as written.',
        recovery:'Use normal prescribed recovery.',
        progression:'Normal progression may continue if the next session remains technically sound.'
      }
    : status==='monitor'
      ? {
          code:'protect_quality',
          track:'Keep the core sprint prescription intact; do not add extra reps or make-up work.',
          strength:'Remove optional/accessory volume first and protect bar speed before changing the sprint prescription.',
          recovery:'Use the full prescribed recovery and allow modest extra recovery when needed to preserve mechanics.',
          progression:'Hold any optional progression until the next quality session confirms normal response.'
        }
      : {
          code:'review_before_progression',
          track:'Do not add sprint volume or intensity beyond the approved prescription.',
          strength:'Do not make up missed lifting or add fatigue-producing accessory work.',
          recovery:'Prioritize recovery and reassess readiness before the next major stress exposure.',
          progression:'Require review before advancing workload; one poor session does not automatically rewrite the program.'
        };

  const requiresCoachReview=status==='coach_review';
  const automaticChange=coachManaged
    ? 'none_coach_authority'
    : status==='ready'
      ? 'none'
      : 'protect_optional_load_only';

  return {
    version:'mw-performance-intelligence-v1',
    status,
    score,
    authority,
    coachManaged:!!coachManaged,
    requiresCoachReview,
    automaticChange,
    officialWeek:officialWeek==null?null:Number(officialWeek),
    officialDay:officialDay==null?null:Number(officialDay),
    signals,
    directive,
    explanation:status==='ready'
      ? 'Recent logged work does not show a strong reason to alter the planned MW stress.'
      : status==='monitor'
        ? 'MW detected a workload-response signal. Protect quality first and use the next session as confirmation.'
        : 'MW detected multiple or stronger workload-response signals. Review is required before workload progression.'
  };
}

module.exports={loadPerformanceContext,evaluatePerformance,groupLatestPaceSession};
