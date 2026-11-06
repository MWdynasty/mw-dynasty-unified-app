(() => {
  const SUPABASE_URL=window.MW_SUPABASE_URL+'';
  const SUPABASE_KEY=window.MW_SUPABASE_KEY;
  const SESSION_KEY='mwSupabaseSession';
  let mwSession=null;
  let mwRemoteProfile={userId:'',name:'Athlete',coachType:'male',p60:'',p100:'',p200:'',p300:'',p400:'',week:'1',currentDay:'1',currentPhase:'1',programStatus:'not_started',startDate:'',startWeek:'1'};window.mwAssessmentComplete=false;window.mwAssessmentRequired=false;window.mwDobRequired=false;window.mwFeatureAccess={};

  function authStatus(msg,bad=false){const el=document.querySelector('#mwAuthStatus');if(el){el.textContent=msg||'';el.style.color=bad?'#ff9caa':'#55c9ff'}}
  function transientProblem(error,status=0){return !navigator.onLine||error?.mwTransient===true||window.MWResilience?.isTransientStatus?.(status)===true||window.MWResilience?.isTransientError?.(error)===true}
  function mwAccessError(message,status=0,data={}){const e=new Error(message);e.status=status;e.mwTransient=window.MWResilience?.isTransientStatus?.(status)===true;Object.assign(e,data||{});return e}
  function hideRoleMismatch(){const box=document.querySelector('#mwRoleMismatch');if(box){box.hidden=true;box.innerHTML=''}}
  function handoffMWSession(path,key){
    if(!mwSession?.access_token)return;
    try{localStorage.setItem(key,JSON.stringify(mwSession))}catch{}
    try{localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY)}catch{}
    location.assign(path);
  }
  function showRoleMismatch(error){
    const box=document.querySelector('#mwRoleMismatch');if(!box||error?.roleMismatch!==true)return false;
    authStatus('');
    const role=String(error?.role||'');
    const isFounder=['founder_owner','admin'].includes(role);
    const isCoach=role==='coach'||isFounder;
    const actions=[];
    if(error?.destinations?.founder)actions.push('<button type="button" data-mw-target="founder">OPEN FOUNDER OS →</button>');
    if(error?.destinations?.coach)actions.push('<button type="button" class="'+(error?.destinations?.founder?'secondary':'')+'" data-mw-target="coach">OPEN COACH PLATFORM →</button>');
    const title=isFounder?'Founder Account':isCoach?'Coach Account':'Different MW Account';
    const copy=isFounder
      ?'You signed in with your MW Dynasty Founder account. Choose the workspace you want to open.'
      :isCoach
        ?'You signed in with your MW Dynasty Coach account. Open the Coach platform instead of the Athlete platform.'
        :'This login does not have an Athlete profile.';
    box.innerHTML='<b>'+title+'</b><p>'+copy+'</p><div class="mwRoleMismatchActions">'+actions.join('')+'</div>';
    box.hidden=false;
    box.querySelector('[data-mw-target="founder"]')?.addEventListener('click',()=>handoffMWSession('/founder/','mwFounderSupabaseSession'));
    box.querySelector('[data-mw-target="coach"]')?.addEventListener('click',()=>handoffMWSession('/coach/','mwCoachSupabaseSession'));
    return true;
  }
  function saveSession(s,persist=null){mwSession=s;window.mwSetConversationIdentity?.(s);const keep=persist===null?!!localStorage.getItem(SESSION_KEY):!!persist;if(keep){localStorage.setItem(SESSION_KEY,JSON.stringify(s));sessionStorage.removeItem(SESSION_KEY)}else{sessionStorage.setItem(SESSION_KEY,JSON.stringify(s));localStorage.removeItem(SESSION_KEY)}}
  function clearSession(){mwSession=null;window.mwSetConversationIdentity?.(null);localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY);document.body?.classList.remove('mw-tool-return','mw-entering')}
  function token(){return mwSession?.access_token||''}; window.mwGetSessionToken=token; window.mwGetRemoteProfile=()=>({...mwRemoteProfile}); window.mwAuthenticatedFetch=async(path,opts={})=>{const headers={...(opts.headers||{})};const t=token();if(t)headers.Authorization='Bearer '+t;return fetch(path,{...opts,headers})}
  async function api(path,opts={}){const h={...(opts.headers||{})};if(token())h.Authorization='Bearer '+token();try{h['X-MW-Time-Zone']=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{}const r=await fetch(path,{...opts,headers:h});const d=await r.json().catch(()=>({}));if(!r.ok)throw mwAccessError(d.error||'MW connection failed',r.status,d);return d}
  function prsToProfile(prs=[]){const out={p60:'',p100:'',p200:'',p300:'',p400:''};for(const x of prs){const ev=String(x.event||'').toLowerCase().replace(/\s/g,'');if(ev==='60m'||ev==='60')out.p60=String(x.time_seconds??'');if(ev==='100m'||ev==='100')out.p100=String(x.time_seconds??'');if(ev==='200m'||ev==='200')out.p200=String(x.time_seconds??'');if(ev==='300m'||ev==='300')out.p300=String(x.time_seconds??'');if(ev==='400m'||ev==='400')out.p400=String(x.time_seconds??'')}return out}
  function applyAthleteAccessUI(){
    const a=window.mwFeatureAccess||{};
    const full=a.mw_training_system===true;
    const intelligence=a.ai_intelligence===true&&!full;
    const sponsored=String(a.access_mode||'').startsWith('coach_');
    const home=document.querySelector('#home');
    const trainCard=home?.querySelector('[data-open="workouts"]');
    const toolsCard=home?.querySelector('[data-open="pacer"]');
    const trainingYear=document.querySelector('#homeTrainingYear');
    const progressBtn=document.querySelector('.nav button[data-v="progress"]');
    const entryBtn=document.querySelector('#openEntry');
    const coachConnected=window.mwCoachConnected===true;
    const messageMenu=home?.querySelector('[data-open="messages"]');
    if(messageMenu)messageMenu.style.display=coachConnected?'':'none';
    document.body.classList.toggle('mw-coach-connected',coachConnected);
    if(trainingYear)trainingYear.style.display=a.smart_entry===true?'':'none';
    if(entryBtn)entryBtn.style.display=a.smart_entry===true?'':'none';
    if(toolsCard)toolsCard.style.display=a.advanced_performance_tools===true?'':'none';
    const scheduleLabel=document.querySelector('#mwScheduleHomeShortcut b');if(scheduleLabel)scheduleLabel.textContent=a.coach_assigned_training===true?'REPORT CONFLICT':'MY SCHEDULE';
    if(progressBtn&&!full&&sponsored){progressBtn.innerHTML='<b>◫</b>ACTIVITY'}
    if(!full&&sponsored){
      const hero=home?.querySelector('.heroCard');
      const sub=hero?.querySelector('.sub');if(sub)sub.textContent='YOUR COACH-CONNECTED TRAINING';
      const desc=hero?.querySelector('p.muted');if(desc)desc.textContent='Your coach controls the program. MW Dynasty keeps training, messages, check-ins, and the Coach MW access included with your coach plan in one place.';
      hero?.querySelector('.metricGrid')?.style.setProperty('display','none');
      hero?.querySelector('.progressBar')?.style.setProperty('display','none');
      if(trainCard){trainCard.querySelector('b').textContent='🏃 COACH-ASSIGNED TRAINING';trainCard.querySelector('.muted').textContent='Open your coach’s active program and log what happened after training.'}
      ['week','startDate','startWeek'].forEach(id=>document.getElementById(id)?.closest('.field')?.style.setProperty('display','none'));
      const chips=[...document.querySelectorAll('#coach .premiumChip')];
      if(chips[0])chips[0].textContent=intelligence?'● COACH INTELLIGENCE':'● COACH CORE';
      if(chips[1])chips[1].textContent=intelligence?'PERFORMANCE INTELLIGENCE':'COACH-ASSIGNED TRAINING';
      if(chips[2])chips[2].textContent=intelligence?'ATHLETE DATA CONTEXT':'BASIC COACH MW';
      if(chips[3])chips[3].textContent='NATURAL VOICE';
      const ctxTop=document.querySelector('#coach .contextTop span');if(ctxTop)ctxTop.textContent=intelligence?'COACH PROGRAM • MW INTELLIGENCE':'COACH PROGRAM • BASIC MW HELP';
      const ctxWeek=document.querySelector('#ctxWeek');if(ctxWeek)ctxWeek.textContent='COACH-ASSIGNED';
      const ctxStrength=document.querySelector('#ctxStrength');if(ctxStrength)ctxStrength.textContent='COACH PLAN';
      const voiceState=document.querySelector('#premiumVoiceState');if(voiceState)voiceState.textContent=intelligence?'COACH PROGRAM • PERFORMANCE INTELLIGENCE':'COACH PROGRAM • BASIC COACH MW';
      const heroP=document.querySelector('#coach .heroText p');if(heroP)heroP.textContent=intelligence?'I can explain your coach-assigned training and help you understand your own performance data.':'I can explain your coach-assigned training, sprint concepts, technique, recovery basics, and how to use MW Dynasty.';
      const system=document.querySelector('#coach .system');if(system)system.innerHTML=intelligence?'<b>⚡ COACH INTELLIGENCE ACTIVE</b><span>YOUR COACH OWNS THE PROGRAM</span>':'<b>⚡ COACH CORE ACTIVE</b><span>YOUR COACH OWNS THE PROGRAM</span>';
      const firstMsg=document.querySelector('#chat .msg.coach');if(firstMsg)firstMsg.textContent=intelligence?'I’m Coach MW. I can help you understand your coach-assigned program and make sense of your own training data. Your human coach still controls training changes.':'I’m Coach MW. I can explain what your coach assigned, answer training questions, help with technique and recovery basics, and guide you around the app. Your human coach controls the program.';
      const membership=document.querySelector('#mwAthleteMembershipPrice');if(membership)membership.textContent=intelligence?'Coach Sponsored · Coach Intelligence':'Coach Sponsored · Coach Core';
      const progressionGroup=[...document.querySelectorAll('#settings .settingGroup')].find(x=>x.querySelector('h3')?.textContent?.includes('PROGRAM PROGRESSION'));if(progressionGroup)progressionGroup.style.display='none';
    }else if(full){
      const membership=document.querySelector('#mwAthleteMembershipPrice');
      if(membership){membership.textContent=a.access_mode==='coach_sprint_performance'?'Coach Sponsored · MW Sprint Performance':'MW Athlete · $19/month'}
    }
    const dob=document.querySelector('#entryDob');if(dob){const max=new Date();max.setFullYear(max.getFullYear()-13);dob.max=max.toISOString().slice(0,10)}
  }
  function hydrate(d){
    mwOnboardingUserKey=d.user?.id||d.user?.email||'local';
    const pr=prsToProfile(d.prs||[]), ps=d.programState||{}, profile=d.profile||{};
    const role=String(profile.role||'athlete');
    const privileged=['founder_owner','admin','coach'].includes(role);
    const hasAthlete=!!d.athlete;
    const featureAccess=d.features?.access||{};window.mwFeatureAccess=featureAccess;
    window.mwCoachConnected=d.coachRelationship?.connected===true;
    window.MWDiag?.snapshot({audience:'athlete',role,access_mode:String(featureAccess.access_mode||''),has_access:featureAccess.has_access===true,current_week:Number(ps.current_week||1),program_status:String(ps.program_status||''),evaluation_complete:Boolean(ps.onboarding_assessment_completed_at)});
    window.mwAssessmentComplete=Boolean(ps.onboarding_assessment_completed_at);
    window.mwAssessmentRequired=hasAthlete&&featureAccess.smart_entry===true&&!window.mwAssessmentComplete;
    window.mwDobRequired=hasAthlete&&!d.athlete?.date_of_birth&&featureAccess.access_mode!=='internal_test';
    const localVoice=JSON.parse(localStorage.getItem('mwCoachPreference')||'{}');

    mwRemoteProfile={
      userId:d.user?.id||'',
      name:profile.first_name||(role==='founder_owner'?'Founder':'Athlete'),
      coachType:['male','female'].includes(localVoice.coachType)?localVoice.coachType:'male',
      ...pr,
      week:String(ps.current_week||1),
      authoritativeWeek:String(d.authoritativeProgram?.week||ps.current_week||1),
      sourceWeek:String(d.authoritativeProgram?.sourceWeek||ps.source_program_week||ps.current_week||1),
      currentDay:String(d.authoritativeProgram?.day||ps.current_day||1),
      currentPhase:String(d.authoritativeProgram?.phase||ps.current_phase||1),
      performanceIntelligence:d.performanceIntelligence||null,
      programStatus:ps.program_status||(hasAthlete?'not_started':'founder_preview'),
      startDate:ps.start_date||'',
      startWeek:String(ps.starting_week||ps.current_week||1),
      role,
      accountStatus:profile.account_status||'',
      athleteId:d.athlete?.id||'',
      dateOfBirth:d.athlete?.date_of_birth||'',
      trainingGoal:d.athlete?.training_goal||'',
      competitionLevel:d.athlete?.competition_level||'',
      competitionState:d.athlete?.competition_state||'',
      competitionDivision:d.athlete?.competition_division||'',
      seasonPreference:d.athlete?.season_preference||'',
      trainingContext:d.athlete?.training_context||'independent',
      coachConnected:window.mwCoachConnected===true,
      competitionPath:Array.isArray(d.athlete?.competition_paths)?(d.athlete.competition_paths[0]||'school'):'school',
      seasonPlan:d.seasonPlan||null,
      workoutCycleId:ps.workout_cycle_id||null,
      email:d.user?.email||'',
      mode:d.mode||(hasAthlete?'athlete':role),
      repTracking:d.features?.repTracking===true,
      featureAccess,
      assessmentCompletedAt:ps.onboarding_assessment_completed_at||''
    };

    if(window.getProfile) window.getProfile=()=>({...mwRemoteProfile});
    else getProfile=()=>({...mwRemoteProfile});

    try{activeMWWeek=(q='')=>{const m=String(q||'').match(/week\s*(\d{1,2})/i);if(m)return Math.max(1,Math.min(41,Number(m[1])));return Math.max(1,Math.min(41,Number(mwSeasonCalendar?.week||mwRemoteProfile.authoritativeWeek||mwRemoteProfile.week||1)))}}catch{}
    try{advanceCurrentWeek=()=>activeMWWeek()}catch{}
    try{unlockedThrough=()=>activeMWWeek()}catch{}

    const activeSeason=d.seasonPlan||null,activeType=activeSeason?.season_type||'';
    const map={name:mwRemoteProfile.name,profileLastName:profile.last_name||'',profileEvents:(Array.isArray(d.athlete?.selected_events)?d.athlete.selected_events:[d.athlete?.primary_event,d.athlete?.secondary_event].filter(Boolean)).join(', '),profileDob:d.athlete?.date_of_birth||'',trainingGoal:d.athlete?.training_goal||'',entryFirstName:profile.first_name||'',entryLastName:profile.last_name||'',entryDob:d.athlete?.date_of_birth||'',entryGoal:d.athlete?.training_goal||'',entryCompetitionLevel:d.athlete?.competition_level||'',entryCompetitionDivision:d.athlete?.competition_division||'',entryCompetitionState:d.athlete?.competition_state||'',entrySeasonPreference:d.athlete?.season_preference||'',entryCompetitionPath:Array.isArray(d.athlete?.competition_paths)?(d.athlete.competition_paths[0]||'school'):'school',entryIndoorStart:activeType==='indoor'?(activeSeason?.season_start_date||''):'',entryIndoorFirstMeet:activeType==='indoor'?(activeSeason?.first_meet_date||''):'',entryIndoorPeak:activeType==='indoor'?(activeSeason?.primary_peak_date||''):'',entryIndoorSecondPeak:activeType==='indoor'?(activeSeason?.secondary_peak_date||''):'',entryOutdoorStart:activeType==='outdoor'?(activeSeason?.season_start_date||''):'',entryOutdoorFirstMeet:activeType==='outdoor'?(activeSeason?.first_meet_date||''):'',entryOutdoorPeak:activeType==='outdoor'?(activeSeason?.primary_peak_date||''):'',entryOutdoorSecondPeak:activeType==='outdoor'?(activeSeason?.secondary_peak_date||''):'',p60:mwRemoteProfile.p60,p100:mwRemoteProfile.p100,p200:mwRemoteProfile.p200,p300:mwRemoteProfile.p300,p400:mwRemoteProfile.p400,entryPr100:mwRemoteProfile.p100,entryPr200:mwRemoteProfile.p200,entryPr400:mwRemoteProfile.p400,week:mwRemoteProfile.week,startDate:mwRemoteProfile.startDate,startWeek:mwRemoteProfile.startWeek,coachType:mwRemoteProfile.coachType};
    for(const [id,val] of Object.entries(map)){const el=document.querySelector('#'+id);if(el)el.value=val||''}
    document.querySelector('#entrySeasonPreference')?.dispatchEvent(new Event('change'));
    window.mwSyncSeasonCalendarUX?.();
    scheduleSeasonCalendarPreview();

    ['week','startDate','startWeek'].forEach(id=>{
      const el=document.querySelector('#'+id);
      if(el){el.readOnly=true;el.title='Synced from MW Dynasty'}
    });

    const save=document.querySelector('#save');
    if(save){
      save.textContent='SAVE ATHLETE PROFILE';
      save.onclick=async()=>{
        const payload={
          first_name:(document.querySelector('#name')?.value||'').trim(),
          training_goal:(document.querySelector('#trainingGoal')?.value||'').trim().slice(0,500),
          prs:{
            '60m':document.querySelector('#p60')?.value||'',
            '100m':document.querySelector('#p100')?.value||'',
            '200m':document.querySelector('#p200')?.value||'',
            '300m':document.querySelector('#p300')?.value||'',
            '400m':document.querySelector('#p400')?.value||''
          }
        };
        const c=document.querySelector('#coachType')?.value||'male';
        localStorage.setItem('mwCoachPreference',JSON.stringify({coachType:c}));
        mwRemoteProfile.coachType=c;
        save.disabled=true; save.textContent='SAVING…';
        try{
          const out=await api('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
          if(out?.profile?.first_name) mwRemoteProfile.name=out.profile.first_name;
          mwRemoteProfile.trainingGoal=out?.training_goal??payload.training_goal;
          const updated=prsToProfile(out?.prs||[]); Object.assign(mwRemoteProfile,updated);
          save.textContent='✓ ATHLETE PROFILE SAVED';
          const ps=document.querySelector('#profileSaveStatus');if(ps){ps.style.display='block';ps.style.color='#7ee2a8';ps.textContent='✓ Profile, Athlete Goal, and sprint PRs saved to MW Dynasty.'}
          sync();renderEntryStatus();
          setTimeout(()=>save.textContent='SAVE ATHLETE PROFILE',1400);
        }catch(e){
          save.textContent='SAVE FAILED — TAP TO RETRY';
          const ps=document.querySelector('#profileSaveStatus');if(ps){ps.style.display='block';ps.style.color='#ffb0bc';ps.textContent=e.message||'Profile save failed. Please try again.'}
          authStatus(e.message||'Profile save failed',true);
        }finally{save.disabled=false}
      }
    }

    const coach=document.querySelector('#coachType');
    if(coach){
      coach.value=mwRemoteProfile.coachType;
      coach.onchange=()=>{
        mwRemoteProfile.coachType=coach.value;
        localStorage.setItem('mwCoachPreference',JSON.stringify({coachType:coach.value}));
        applyCoachVisual(coach.value)
      }
    }

    if(document.querySelector('#helloName'))document.querySelector('#helloName').textContent=(mwRemoteProfile.name||'Athlete')+'.';
    if(document.querySelector('#weekBadge'))document.querySelector('#weekBadge').textContent=mwRemoteProfile.week;
    if(document.querySelector('#ctxAthlete'))document.querySelector('#ctxAthlete').textContent=mwRemoteProfile.name||'Athlete';
    if(document.querySelector('#ctxWeek'))document.querySelector('#ctxWeek').textContent=hasAthlete?('Week '+mwRemoteProfile.week+' • Day '+mwRemoteProfile.currentDay):(role==='founder_owner'?'Founder Access':'Staff Access');
    if(document.querySelector('#homeName'))document.querySelector('#homeName').textContent=mwRemoteProfile.name||'Athlete';
    if(document.querySelector('#homeWeek'))document.querySelector('#homeWeek').textContent=hasAthlete?mwRemoteProfile.week:'—';
    const mwPerf=d.performanceIntelligence||null;window.mwPerformanceIntelligence=mwPerf;
    const todayStrong=document.querySelector('#home .mwTodayStatus strong'),todayCopy=document.querySelector('#home .mwTodayStatus span');
    if(todayStrong&&todayCopy&&hasAthlete){
      if(mwPerf?.status==='coach_review'){
        todayStrong.textContent=/^coach_/i.test(String(featureAccess.access_mode||''))?'COACH REVIEW RECOMMENDED':'MW REVIEW RECOMMENDED';
        todayCopy.textContent='MW detected a stronger workload-response pattern. Do not add extra volume while the next step is reviewed.';
      }else if(mwPerf?.status==='monitor'){
        todayStrong.textContent='TRAINING READY · LOAD MONITORED';
        todayCopy.textContent='Follow today’s plan. MW is protecting quality and watching your recent response.';
      }else{
        todayStrong.textContent='YOUR TRAINING IS READY';
        todayCopy.textContent='Track + Strength • Follow today’s MW session.';
      }
    }
    if(document.querySelector('#completionWeek'))document.querySelector('#completionWeek').textContent=mwRemoteProfile.week;
    if(document.querySelector('#progressCurrentWeek'))document.querySelector('#progressCurrentWeek').textContent=hasAthlete?('WEEK '+mwRemoteProfile.week):'FOUNDER MODE';
    if(document.querySelector('#strengthWeek')){
      document.querySelector('#strengthWeek').value=mwRemoteProfile.week;
      try{renderStrengthWeek(mwRemoteProfile.week)}catch{}
    }
    if(document.querySelector('#settingsCoachType'))document.querySelector('#settingsCoachType').value=mwRemoteProfile.coachType;
    applyCoachVisual(mwRemoteProfile.coachType);
    applyAthleteAccessUI();

    const ctx=document.querySelector('.contextTop');
    if(ctx&&!ctx.querySelector('.mwOfficialTag')){
      const t=document.createElement('span');
      t.className='mwOfficialTag';
      t.textContent=hasAthlete?(featureAccess.mw_training_system===true?'MW PROGRAM LINKED':featureAccess.coach_assigned_training===true?'COACH PROGRAM LINKED':'ATHLETE ACCESS'):(role==='founder_owner'?'FOUNDER ACCESS':'MW STAFF ACCESS');
      ctx.appendChild(t)
    }

    if(privileged && !hasAthlete){
      const top=document.querySelector('#home .top');
      if(top && !top.querySelector('.mwRoleBadge')){
        const b=document.createElement('div');
        b.className='mwRoleBadge';
        b.textContent=role==='founder_owner'?'◆ FOUNDER OWNER':'◆ '+role.toUpperCase();
        top.appendChild(b);
      }
      const hero=document.querySelector('#home .heroCard');
      if(hero && !hero.querySelector('.mwFounderNote')){
        const n=document.createElement('div');
        n.className='mwFounderNote';
        n.textContent=role==='founder_owner'
          ? 'Founder Mode is active. Your account is authorized without an athlete record. Athlete-specific data remains separate until you open or manage an athlete account.'
          : 'Staff Mode is active. Athlete-specific data remains separate from this staff account.';
        hero.appendChild(n);
      }
      const sub=document.querySelector('#home .sub');
      if(sub)sub.textContent=role==='founder_owner'?'FOUNDER PERFORMANCE HUB':'MW STAFF PERFORMANCE HUB';
    }

    try{renderEntryStatus()}catch{}
    try{renderProgressUI()}catch{}
    try{renderCompletion()}catch{}

    const returnParams=new URLSearchParams(location.search);
    const returnView=returnParams.get('returnView');
    const canRestoreReturnView=returnView==='pacer'
      ? featureAccess.advanced_performance_tools===true
      : returnView==='workouts'
        ? (featureAccess.mw_training_system===true||featureAccess.coach_assigned_training===true)
        : false;
    let restoredToolView=false;
    if(returnView&&canRestoreReturnView&&!window.mwDobRequired&&!window.mwAssessmentRequired){
      const clean=new URL(location.href);clean.searchParams.delete('returnView');clean.searchParams.delete('toolReturn');
      history.replaceState({...history.state,mwView:returnView},'',clean.pathname+(clean.search||''));
      openView(returnView,false);
      restoredToolView=true;
    }

    // First paid entry: identity is already created. Evaluation comes before the tutorial.
    if(!restoredToolView){
      if(hasAthlete&&window.mwDobRequired)setTimeout(()=>mwPromptDobVerification(),350);
      else if(hasAthlete&&featureAccess.mw_training_system===true&&window.mwAssessmentRequired){
        openView('entry');
        setTimeout(()=>loadSeasonCalendar(),80);
      }else if(hasAthlete&&featureAccess.mw_training_system===true){
        openView('home');
        setTimeout(()=>startQuickStart(false),350);
      }else openView('home');
    }
  }
  const STRENGTH_FIELD_MAP={maxPowerClean:'power_clean_max',maxFrontSquat:'front_squat_max',maxBackSquat:'back_squat_max',maxDeadlift:'deadlift_max',profileDeadliftType:'deadlift_type',profileWeightUnit:'weight_unit'};
  function strengthHeaders(extra={}){return {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token(),...extra}}
  async function loadStrengthMaxes(){
    if(!mwRemoteProfile.athleteId||!token())return;
    const aid=encodeURIComponent(mwRemoteProfile.athleteId),headers=strengthHeaders({'Accept':'application/json'});
    const [r,h]=await Promise.all([
      fetch(SUPABASE_URL+'/rest/v1/athlete_strength_maxes?athlete_id=eq.'+aid+'&select=*',{headers}),
      fetch(SUPABASE_URL+'/rest/v1/athlete_strength_max_history?athlete_id=eq.'+aid+'&select=power_clean_max,front_squat_max,back_squat_max,deadlift_max,deadlift_type,weight_unit,last_max_test,recorded_at,change_source&order=recorded_at.asc&limit=100',{headers})
    ]);
    const rows=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error(rows?.message||'Could not load weight-room maxes.');
    const history=await h.json().catch(()=>[]);
    window.mwStrengthMaxHistoryRows=h.ok&&Array.isArray(history)?history:[];
    const row=Array.isArray(rows)?rows[0]:null;
    if(row){
      for(const [id,col] of Object.entries(STRENGTH_FIELD_MAP)){
        const el=document.getElementById(id); if(el&&row[col]!=null)el.value=row[col];
      }
      localStorage.setItem(LIFT_MAX_KEY,JSON.stringify(Object.fromEntries(Object.keys(STRENGTH_FIELD_MAP).map(id=>[id,document.getElementById(id)?.value||'']))));
    }
    const b=document.getElementById('saveLiftMaxes');
    if(b)b.onclick=saveStrengthMaxes;
    try{renderWeightRoomProgressUI()}catch{}
  }
  function strengthValue(id){
    const raw=(document.getElementById(id)?.value||'').trim();
    if(id==='profileDeadliftType'||id==='profileWeightUnit')return raw||null;
    if(raw==='')return null;
    const n=Number(raw); return Number.isFinite(n)?n:null;
  }
  async function saveStrengthMaxes(){
    const b=document.getElementById('saveLiftMaxes'),st=document.getElementById('liftMaxStatus');
    if(!mwRemoteProfile.athleteId){if(st)st.textContent='Weight-room maxes could not be saved: athlete profile not found.';return}
    const payload={athlete_id:mwRemoteProfile.athleteId,updated_at:new Date().toISOString()};
    for(const [id,col] of Object.entries(STRENGTH_FIELD_MAP))payload[col]=strengthValue(id);
    // Bar weights are required in Supabase; use standard 45 lb when left blank.
    if(payload.olympic_bar_weight==null)payload.olympic_bar_weight=45;
    if(payload.hex_bar_weight==null)payload.hex_bar_weight=45;
    if(b){b.disabled=true;b.textContent='SAVING…'}
    try{
      const r=await fetch(SUPABASE_URL+'/rest/v1/athlete_strength_maxes?on_conflict=athlete_id',{method:'POST',headers:strengthHeaders({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload)});
      const out=await r.json().catch(()=>[]); if(!r.ok)throw new Error(out?.message||out?.details||'Weight-room save failed.');
      const local={};for(const id of Object.keys(STRENGTH_FIELD_MAP))local[id]=document.getElementById(id)?.value||'';localStorage.setItem(LIFT_MAX_KEY,JSON.stringify(local));
      if(st)st.textContent='✓ Weight-room maxes saved to MW Dynasty. They will stay synced across devices.';
      if(b)b.textContent='✓ WEIGHT ROOM MAXES SAVED';
      try{await loadStrengthMaxes()}catch{}
      try{renderStrengthWeek(activeMWWeek())}catch{}try{renderWeightRoomProgressUI()}catch{}
      setTimeout(()=>{if(b)b.textContent='SAVE WEIGHT ROOM MAXES'},1400);
    }catch(e){if(st)st.textContent='Save failed: '+(e.message||'Please try again.');if(b)b.textContent='SAVE FAILED — TAP TO RETRY'}finally{if(b)b.disabled=false}
  }
  mwStrengthPerformanceRows=[];
  function restoreStrengthLogger(){
    const week=strengthLoggingWeek(),day=Number(document.getElementById('strengthLogDay')?.value||mwTodayStrengthInfo().day),exercise=(document.getElementById('strengthLogExercise')?.value||'').trim().toLowerCase();
    const rows=(mwStrengthPerformanceRows||[]).filter(x=>Number(x.program_week)===week&&Number(x.program_day)===day&&(!exercise||String(x.exercise_name||'').trim().toLowerCase()===exercise));
    if(exercise&&rows.length){const maxSet=Math.max(...rows.map(x=>Number(x.set_number)||0));const setEl=document.getElementById('strengthLogSet');if(setEl)setEl.value=String(maxSet+1)}
    const life=mwStrengthQuickCache[`${week}-${day}`]?.lifecycle_status,st=document.getElementById('strengthPerformanceStatus');
    if(st&&['in_progress','incomplete'].includes(String(life||''))&&rows.length)st.textContent=`↻ ${rows.length} saved set${rows.length===1?'':'s'} restored from MW Dynasty. Continue with the next set, then finish the session.`;
  }
  async function loadStrengthPerformanceLogs(){
    const aid=mwRemoteProfile.athleteId,box=document.getElementById('strengthLogRecent');if(!aid||!token())return;
    const r=await fetch(SUPABASE_URL+'/rest/v1/athlete_strength_session_logs?athlete_id=eq.'+encodeURIComponent(aid)+'&training_cycle_key=eq.'+encodeURIComponent(trainingCycleKey())+'&select=id,program_week,program_day,session_label,exercise_name,set_number,reps_completed,target_load,actual_load,weight_unit,set_rpe,recorded_at,training_cycle_key,season_plan_id,source_program_week&order=recorded_at.desc&limit=200',{headers:strengthHeaders({'Accept':'application/json'}),cache:'no-store'});
    const rows=await r.json().catch(()=>[]);if(!r.ok)throw new Error(rows?.message||'Could not load strength performance.');
    mwStrengthPerformanceRows=Array.isArray(rows)?rows:[];try{renderWeightRoomProgressUI()}catch{}
    if(box)box.innerHTML=mwStrengthPerformanceRows.slice(0,12).map(x=>`<div class="strengthLogItem"><b>Week ${Number(x.program_week||1)} · Day ${Number(x.program_day||1)} · ${escapeHtmlLocal(x.exercise_name)}</b><br>Set ${Number(x.set_number||1)} · ${x.reps_completed??'—'} reps @ ${x.actual_load??'—'} ${escapeHtmlLocal(x.weight_unit||'lb')}${x.target_load!=null?` · Target ${x.target_load}`:''}${x.set_rpe!=null?` · RPE ${x.set_rpe}/10`:''}</div>`).join('');
    restoreStrengthLogger();
  }
  async function saveStrengthPerformance(){
    const aid=mwRemoteProfile.athleteId,btn=document.getElementById('saveStrengthPerformance'),st=document.getElementById('strengthPerformanceStatus');if(!aid)throw new Error('Athlete profile not found.');
    const week=strengthLoggingWeek(),day=Number(document.getElementById('strengthLogDay')?.value||mwTodayStrengthInfo().day),meta=strengthSessionMeta(week,day),exercise=(document.getElementById('strengthLogExercise')?.value||'').trim(),actual=Number(document.getElementById('strengthLogActual')?.value),reps=Number(document.getElementById('strengthLogReps')?.value),setNo=Number(document.getElementById('strengthLogSet')?.value),targetRaw=(document.getElementById('strengthLogTarget')?.value||'').trim(),rpeRaw=(document.getElementById('strengthLogRpe')?.value||'').trim();
    if(!exercise)throw new Error('Choose or enter the exercise.');if(!Number.isFinite(actual)||actual<0)throw new Error('Enter the actual load you used.');if(!Number.isFinite(reps)||reps<0)throw new Error('Enter reps completed.');if(!Number.isFinite(setNo)||setNo<1)throw new Error('Enter a valid set number.');
    const payload={athlete_id:aid,training_cycle_key:trainingCycleKey(),season_plan_id:activeSeasonPlanId(),source_program_week:sourceWeekForSeasonWeek(week),program_week:week,program_day:day,session_label:`Week ${week} Strength`,exercise_name:exercise,set_number:setNo,reps_completed:reps,target_load:targetRaw===''?null:Number(targetRaw),actual_load:actual,weight_unit:document.getElementById('strengthLogUnit')?.value||'lb',set_rpe:rpeRaw===''?null:Number(rpeRaw),recorded_at:new Date().toISOString()};
    if(btn){btn.disabled=true;btn.textContent='SAVING…'}if(st)st.textContent='Saving this set to MW Dynasty…';
    try{
      const life=String(mwStrengthQuickCache[`${week}-${day}`]?.lifecycle_status||'');
      if(life!=='completed')await markStrengthStatus(week,day,'in_progress',meta.label,meta.optional);
      const r=await fetch(SUPABASE_URL+'/rest/v1/athlete_strength_session_logs?on_conflict=athlete_id,training_cycle_key,program_week,program_day,exercise_name,set_number',{method:'POST',headers:strengthHeaders({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload)});
      const out=await r.json().catch(()=>[]);if(!r.ok)throw new Error(out?.message||out?.details||'Strength performance save failed.');
      if(st)st.textContent=`✓ Set ${setNo} saved immediately. It will still be here if you close the app.`;
      document.getElementById('strengthLogSet').value=String(setNo+1);
      await loadStrengthPerformanceLogs();await loadStrengthQuickCheckins();await renderStrengthQuickCheckins(week);
    }finally{if(btn){btn.disabled=false;btn.textContent='SAVE SPECIFIC SET'}}
  }
  async function finishStrengthFromLogger(outcome){
    const week=strengthLoggingWeek(),day=Number(document.getElementById('strengthLogDay')?.value||mwTodayStrengthInfo().day),meta=strengthSessionMeta(week,day),st=document.getElementById('strengthPerformanceStatus');
    const out=await completeStrengthSession(week,day,outcome,meta.label,meta.optional);
    if(st)st.textContent=(out?.completed_late?'✓ COMPLETED · LATE ENTRY — ':'✓ COMPLETED — ')+(outcome==='modified'?'modified session saved.':'session saved as written.');
    await loadStrengthQuickCheckins();await loadStrengthPerformanceLogs();
    mwStrengthLogWeekOverride=null;window.mwStrengthViewDayOverride=null;
    const dayEl=document.getElementById('strengthLogDay');if(dayEl)dayEl.value=String(mwTodayStrengthInfo().day);
    await renderStrengthWeek(activeMWWeek());
    window.mwReloadAthleteNotifications?.();
  }
  window.mwOpenStrengthSessionFor=async function(w,d){
    w=Math.max(1,Math.min(41,Number(w)||1));d=Math.max(1,Math.min(7,Number(d)||1));
    mwStrengthLogWeekOverride=w;window.mwStrengthViewDayOverride=d;openView('workouts',true);
    try{if(!MW_STRENGTH[w])await loadMWProgramWeek(w)}catch{}
    await renderStrengthWeek(w);
    const dayEl=document.getElementById('strengthLogDay');if(dayEl)dayEl.value=String(d);
    const details=document.getElementById('strengthAdvancedLog');if(details)details.open=true;
    await loadStrengthPerformanceLogs();
    const row=mwStrengthQuickCache[`${w}-${d}`],st=document.getElementById('strengthPerformanceStatus');
    if(st)st.textContent=row?.lifecycle_status==='incomplete'?'INCOMPLETE · Your saved sets are restored below. Finish logging, then complete the session.':'Weight-room session ready.';
    details?.scrollIntoView?.({behavior:'smooth',block:'start'});
  };
  function bindStrengthPerformanceLogger(){
    const dayEl=document.getElementById('strengthLogDay');if(dayEl&&!mwStrengthLogWeekOverride)dayEl.value=String(mwTodayStrengthInfo().day);
    const b=document.getElementById('saveStrengthPerformance');if(b)b.onclick=async()=>{try{await saveStrengthPerformance()}catch(e){const st=document.getElementById('strengthPerformanceStatus');if(st)st.textContent='Save failed: '+(e.message||'Please try again.')}};
    const a=document.getElementById('finishStrengthAsPrescribed');if(a)a.onclick=async()=>{a.disabled=true;try{await finishStrengthFromLogger('as_prescribed')}catch(e){const st=document.getElementById('strengthPerformanceStatus');if(st)st.textContent='Finish failed: '+(e.message||'Please try again.')}finally{a.disabled=false}};
    const m=document.getElementById('finishStrengthModified');if(m)m.onclick=async()=>{m.disabled=true;try{await finishStrengthFromLogger('modified')}catch(e){const st=document.getElementById('strengthPerformanceStatus');if(st)st.textContent='Finish failed: '+(e.message||'Please try again.')}finally{m.disabled=false}};
    document.getElementById('strengthLogExercise')?.addEventListener('change',restoreStrengthLogger);
    document.getElementById('strengthLogDay')?.addEventListener('change',restoreStrengthLogger);
  }
  async function loadSmartEntry(){
    if(!mwRemoteProfile.athleteId||!token())return;
    const d=await api('/api/smart-entry',{cache:'no-store'});const x=d?.assessment;if(!x)return;
    mwRemoteProfile.entryAssessment={seasonWeek:Number(x.season_week||0),seasonPhase:Number(x.season_phase||0),readinessPhase:Number(x.readiness_phase||0),assignedPhase:Number(x.assigned_phase||0),assignedWeek:Number(x.assigned_week||0),status:x.status||'',nextCheckpoint:Number(x.next_checkpoint||0),confidence:x.confidence||'',eventGroup:x.event_group||'',date:x.created_at||''};window.mwAssessmentComplete=true;window.mwAssessmentRequired=false;
    renderEntryStatus();
  }
  async function loadAthleteSettings(){
    if(!mwRemoteProfile.athleteId||!token())return;
    const r=await fetch(SUPABASE_URL+'/rest/v1/athlete_settings?athlete_id=eq.'+encodeURIComponent(mwRemoteProfile.athleteId)+'&select=*',{headers:strengthHeaders({'Accept':'application/json'}),cache:'no-store'});
    const rows=await r.json().catch(()=>[]);if(!r.ok)throw new Error(rows?.message||'Could not load athlete settings.');const x=Array.isArray(rows)?rows[0]:null;if(!x)return;
    const cv=['male','female'].includes(x.coach_visual)?x.coach_visual:'male';mwRemoteProfile.coachType=cv;['coachType','settingsCoachType'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=cv});applyCoachVisual(cv);
    const speed=['0.9','1','1.1','1.2'].includes(String(x.voice_speed))?String(x.voice_speed):'1';const mode=['fast','standard'].includes(String(x.voice_mode))?String(x.voice_mode):(String(x.voice_mode)==='natural'?'standard':'fast');const map={voiceSpeed:speed,voiceMode:mode,autoVoice:x.auto_voice?'on':'off',workoutReminders:x.workout_reminders?'on':'off',meetReminders:x.meet_reminders?'on':'off',messageAlerts:x.message_alerts?'on':'off'};
    for(const [id,val] of Object.entries(map)){const el=document.getElementById(id);if(el&&val!=null)el.value=val}localStorage.setItem('mwPrefs',JSON.stringify(map))
  }
  async function saveAthleteSettings(){
    if(!mwRemoteProfile.athleteId||!token())throw new Error('Athlete account is not connected.');
    const v=id=>document.getElementById(id)?.value;
    const payload={athlete_id:mwRemoteProfile.athleteId,coach_visual:v('settingsCoachType')||v('coachType')||'male',voice_speed:v('voiceSpeed')||'1',voice_mode:v('voiceMode')||'fast',auto_voice:v('autoVoice')==='on',workout_reminders:v('workoutReminders')!=='off',meet_reminders:v('meetReminders')!=='off',message_alerts:v('messageAlerts')!=='off',updated_at:new Date().toISOString()};
    const r=await fetch(SUPABASE_URL+'/rest/v1/athlete_settings?on_conflict=athlete_id',{method:'POST',headers:strengthHeaders({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload)});const d=await r.json().catch(()=>[]);if(!r.ok)throw new Error(d?.message||'Settings save failed.');mwRemoteProfile.coachType=payload.coach_visual;applyCoachVisual(payload.coach_visual);localStorage.setItem('mwPrefs',JSON.stringify({voiceSpeed:payload.voice_speed,voiceMode:payload.voice_mode,autoVoice:payload.auto_voice?'on':'off',workoutReminders:payload.workout_reminders?'on':'off',meetReminders:payload.meet_reminders?'on':'off',messageAlerts:payload.message_alerts?'on':'off'}));return d;
  }
  async function loadMe(){
    const d=await api('/api/me',{cache:'no-store'});
    try{
      hydrate(d);
    }catch(e){
      console.error('MW post-auth hydration issue',e);
      window.MWDiag?.event('athlete_post_auth_hydration_error',{severity:'error',code:'post_auth_hydration',context:{message:String(e?.message||e).slice(0,180)}});
      window.mwAthleteBootWarning='Some Athlete features are still loading.';
    }
    try{await loadSeasonCalendar()}catch(e){console.warn('MW training-year calendar unavailable',e)}
    try{await loadSmartEntry()}catch(e){console.warn('MW Smart Entry sync unavailable',e)}
    try{await loadAthleteSettings()}catch(e){console.warn('MW settings sync unavailable',e)}
    try{await loadStrengthMaxes()}catch(e){const st=document.getElementById('liftMaxStatus');if(st)st.textContent='MW strength sync unavailable: '+e.message}
    try{await loadStrengthQuickCheckins();bindStrengthPerformanceLogger();await loadStrengthPerformanceLogs()}catch(e){const st=document.getElementById('strengthPerformanceStatus');if(st)st.textContent='Strength performance sync unavailable: '+e.message}
    try{await loadWorkoutCompletions();renderCompletion();renderProgressUI()}catch(e){console.warn('MW completion sync unavailable',e);if($('#unlockNote'))$('#unlockNote').textContent='Workout history could not sync from MW Dynasty. Please refresh.'}
    const sb=document.getElementById('saveSettings');if(sb)sb.onclick=async()=>{sb.disabled=true;sb.textContent='SAVING…';try{await saveAthleteSettings();sb.textContent='✓ SETTINGS SAVED'}catch(e){sb.textContent='SAVE FAILED — TAP TO RETRY';authStatus(e.message,true)}finally{sb.disabled=false;setTimeout(()=>{if(sb.textContent.startsWith('✓'))sb.textContent='SAVE SETTINGS'},1300)}};
    return d
  }
  window.mwReloadAccount=loadMe;

  let mwCompletionRefreshBusy=false;
  async function mwRefreshLiveCompletion(){
    if(mwCompletionRefreshBusy||document.hidden||!token()||!mwRemoteProfile?.athleteId)return;
    mwCompletionRefreshBusy=true;
    try{
      await loadWorkoutCompletions();
      await renderCompletion();
      renderProgressUI();
      window.mwReloadAthleteNotifications?.();
    }catch(e){
      console.warn('MW live completion refresh unavailable',e);
    }finally{
      mwCompletionRefreshBusy=false;
    }
  }
  window.mwRefreshLiveCompletion=mwRefreshLiveCompletion;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)mwRefreshLiveCompletion()});
  window.addEventListener('focus',mwRefreshLiveCompletion);
  window.addEventListener('pageshow',mwRefreshLiveCompletion);
  setInterval(mwRefreshLiveCompletion,15000);
  const websiteCheckoutPlan=new URLSearchParams(location.search).get('plan')==='mw_athlete'?'mw_athlete':'';
  async function beginWebsiteCheckout(accessToken){
    authStatus('Taking you to secure payment…');
    const r=await fetch('/api/stripe/checkout',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:JSON.stringify({planCode:websiteCheckoutPlan||'mw_athlete',sponsorQuantity:0})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Checkout could not start.');
    if(!d.url)throw new Error('Secure checkout link was not returned.');
    location.assign(d.url);
  }
  function renderAthleteMembership(session){
    const card=document.querySelector('[data-mw-signin-card]');if(!card)return;
    const isNative=document.documentElement.classList.contains('mw-native-app');
    card.innerHTML=`<a class="mwLoginBack" href="https://mwdynasty.com/" aria-label="Open MW Dynasty website">← MW WEBSITE</a>
      <div class="mwLoginCardHead"><div class="mwAthleteOnboardProgress">PROFILE ✓ &nbsp;•&nbsp; <b>MEMBERSHIP</b> &nbsp;•&nbsp; EVALUATION &nbsp;•&nbsp; TUTORIAL</div><h2>One membership. Everything you need.</h2><p>Your MW Athlete profile is already created. Complete membership, then Season Intelligence will evaluate your training needs and build your starting point.</p></div>
      <div class="mwAthleteMembershipPlan"><span>MW ATHLETE</span><b>&#36;19<small>/month</small></b><p>Track + strength programming, Sprint School, performance tools, progress tracking, and Coach MW.</p><em>Cancel anytime.</em></div>
      <button id="mwAthleteMembershipContinue" class="mwLoginButton" type="button">${isNative?'Continue to App Purchase':'Continue to Secure Payment'} <span>→</span></button>
      ${isNative?'<button id="mwAthleteRestorePurchase" class="mwLoginLink" type="button" style="width:100%;margin-top:10px">Restore App Store Purchase</button>':''}
      <div id="mwAuthStatus" class="mwAuthStatus"></div>
      <div class="mwLoginAccessNote">After payment, you’ll continue directly to your MW Athlete Evaluation. Your personalized tutorial comes after your season is built.</div>`;
    document.getElementById('mwAthleteMembershipContinue').onclick=async()=>{
      const btn=document.getElementById('mwAthleteMembershipContinue');btn.disabled=true;authStatus('Preparing your membership…');
      try{
        if(isNative){
          const save=await fetch(SUPABASE_URL+'/rest/v1/rpc/mw_mark_membership_checkout_started',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_plan_code:'mw_athlete',p_sponsor_quantity:0,p_provider:'apple',p_provider_reference:null})});
          const saved=await save.json().catch(()=>({}));if(!save.ok)throw new Error(saved.message||saved.hint||'Membership choice could not be saved.');
          const nativePurchase=window.webkit?.messageHandlers?.mwPurchase;
          if(!nativePurchase)throw new Error('App Store purchase is not available in this build yet. Your membership choice is saved.');
          nativePurchase.postMessage({planCode:'mw_athlete',sponsorQuantity:0,accessToken:session.access_token});return;
        }
        await beginWebsiteCheckout(session.access_token);
      }catch(e){authStatus(e.message||'Membership setup could not continue.',true);btn.disabled=false}
    };
    if(isNative&&document.getElementById('mwAthleteRestorePurchase')){
      document.getElementById('mwAthleteRestorePurchase').onclick=()=>{
        const restore=window.webkit?.messageHandlers?.mwRestorePurchase;
        if(!restore){authStatus('App Store restore is not available in this build yet.',true);return}
        authStatus('Checking your App Store membership…');
        restore.postMessage({planCode:'mw_athlete',accessToken:session.access_token});
      };
    }
  }
  window.mwNativePurchaseResult=function(result){
    window.MWDiag?.event('storekit_result',{severity:result?.ok?'info':(result?.cancelled?'info':'warn'),code:result?.ok?'verified':result?.cancelled?'cancelled':result?.pending?'pending':'failed',context:{ok:!!result?.ok,restored:!!result?.restored,pending:!!result?.pending,cancelled:!!result?.cancelled,plan_code:String(result?.planCode||'mw_athlete')}});
    const btn=document.getElementById('mwAthleteMembershipContinue');
    if(result?.ok){authStatus('Payment confirmed. Activating your training access…');setTimeout(()=>location.reload(),700);return}
    authStatus(result?.error||'App Store purchase could not be confirmed.',true);
    if(btn)btn.disabled=false;
  };
  async function waitForAthleteActivation(session){
    if(new URLSearchParams(location.search).get('checkout')!=='success')return false;
    renderAthleteMembership(session);authStatus('Payment received. Setting up your training access…');
    const btn=document.getElementById('mwAthleteMembershipContinue');if(btn)btn.style.display='none';
    for(let i=0;i<10;i++){
      try{await loadMe();history.replaceState({},document.title,location.pathname);document.body.classList.remove('mw-auth-pending');document.body.classList.add('mw-auth-ready');return true}catch{}
      await new Promise(r=>setTimeout(r,1200));
    }
    authStatus('Payment was received and your access is still syncing. Give it a moment, then sign in again.');
    return true;
  }
  async function login(){
    let authenticated=false;
    const email=document.querySelector('#mwAuthEmail').value.trim(),password=document.querySelector('#mwAuthPassword').value;
    if(!email||!password){authStatus('Enter your email and password.',true);return}
    hideRoleMismatch();
    authStatus('Signing in…');
    try{
      const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({email,password})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error_description||d.msg||d.error||'Sign-in failed');
      authenticated=true;
      saveSession(d,document.querySelector('#mwRememberMe')?.checked===true);
      if(websiteCheckoutPlan){await beginWebsiteCheckout(d.access_token);return}
      const enterStarted=performance.now();
      document.body.classList.add('mw-entering');
      try{
        await loadMe();
        const remaining=Math.max(0,420-(performance.now()-enterStarted));
        if(remaining)await new Promise(r=>setTimeout(r,remaining));
        document.body.classList.remove('mw-auth-pending','mw-entering');
        document.body.classList.add('mw-auth-ready');
        authStatus('')
      }
      catch(accessErr){
        document.body.classList.remove('mw-entering');
        const msg=String(accessErr?.message||'');
        if(msg.toLowerCase().includes('not active')){renderAthleteMembership(d);return}
        throw accessErr;
      }
    }catch(e){
      document.body.classList.remove('mw-entering');
      if(showRoleMismatch(e))return;
      if(authenticated&&mwSession?.access_token){
        console.error('MW post-auth startup issue',e);
        window.MWDiag?.event('athlete_post_auth_startup_error',{severity:'error',code:'post_auth_startup',context:{message:String(e?.message||e).slice(0,180)}});
        authStatus('You are signed in. MW hit a temporary app-loading issue, but your session is safe. Tap Sign In again or refresh once.',true);
        return
      }
      if(transientProblem(e)&&mwSession?.access_token){
        authStatus('Connection interrupted after sign-in. Your MW session is safe and will reconnect automatically.',true);
        return
      }
      clearSession();
      authStatus('Sign-in could not be completed. Check your email and password, then try again.',true)
    }
  }

  function confirmedSignupSessionFromUrl(){
    const h=new URLSearchParams(location.hash.replace(/^#/,''));
    const type=h.get('type')||'';
    if(!['signup','email'].includes(type)||!h.get('access_token'))return null;
    return {access_token:h.get('access_token'),refresh_token:h.get('refresh_token')||'',token_type:h.get('token_type')||'bearer',expires_in:Number(h.get('expires_in')||3600),expires_at:Math.floor(Date.now()/1000)+Number(h.get('expires_in')||3600)};
  }
  function recoveryRedirect(){
    // Always send recovery back to the canonical athlete route. This keeps
    // email links stable whether the request started in Safari or the iOS WKWebView.
    return 'https://app.mwdynasty.com/athlete/reset-password.html';
  }
  let mwResetBusy=false;
  async function requestPasswordReset(){
    const email=document.querySelector('#mwAuthEmail').value.trim();
    if(!email){authStatus('Enter your email first, then tap Forgot password.',true);return}
    if(mwResetBusy)return;
    const btn=document.querySelector('#mwForgotPassword');
    mwResetBusy=true;if(btn){btn.disabled=true;btn.textContent='Sending…'}
    authStatus('Sending password reset email…');
    try{
      const r=await fetch(SUPABASE_URL+'/auth/v1/recover?redirect_to='+encodeURIComponent(recoveryRedirect()),{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({email})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||d.error_description||d.error||'Could not send reset email');
      authStatus('If an MW Dynasty account exists for that email, a password reset link has been sent. Check your inbox and spam folder.');
    }catch(e){authStatus(e.message||'Could not send reset email',true)}
    finally{mwResetBusy=false;if(btn){btn.disabled=false;btn.textContent='Forgot password?'}}
  }
  function recoveryTokenFromUrl(){
    const h=new URLSearchParams(location.hash.replace(/^#/,''));
    const q=new URLSearchParams(location.search);
    return {
      type:h.get('type')||q.get('type')||'',
      access_token:h.get('access_token')||q.get('access_token')||'',
      refresh_token:h.get('refresh_token')||q.get('refresh_token')||'',
      error:h.get('error')||q.get('error')||'',
      error_description:h.get('error_description')||q.get('error_description')||''
    };
  }
  async function saveRecoveredPassword(){
    const a=document.querySelector('#mwNewPassword').value,b=document.querySelector('#mwConfirmPassword').value;
    if(a.length<8){authStatus('Use at least 8 characters for your new password.',true);return}
    if(a!==b){authStatus('The new passwords do not match.',true);return}
    const rec=recoveryTokenFromUrl();if(!rec.access_token){authStatus('This reset link is invalid or expired. Request a new one.',true);return}
    authStatus('Saving new password…');
    try{
      const r=await fetch(SUPABASE_URL+'/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+rec.access_token},body:JSON.stringify({password:a})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||d.error_description||d.error||'Could not update password');
      // End the temporary recovery session so the athlete returns to a normal,
      // explicit sign-in with the new password.
      try{await fetch(SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+rec.access_token}})}catch(_){}
      clearSession();
      history.replaceState({},document.title,location.pathname);
      document.querySelector('#mwAuthReset').classList.remove('show');
      document.querySelector('#mwAuthLogin').style.display='';
      document.querySelector('#mwForgotPassword').style.display='inline-block';
      document.querySelector('#mwAuthPassword').value='';
      document.querySelector('#mwNewPassword').value='';
      document.querySelector('#mwConfirmPassword').value='';
      authStatus('Password updated successfully. Sign in with your new password.');
    }catch(e){authStatus(e.message||'Could not update password',true)}
  }
  function initRecoveryMode(){
    const rec=recoveryTokenFromUrl();
    if(rec.error){
      history.replaceState({},document.title,location.pathname);
      authStatus(rec.error_description ? decodeURIComponent(rec.error_description.replace(/\\+/g,' ')) : 'This password reset link is invalid or expired. Request a new one.',true);
      return false;
    }
    if(rec.type==='recovery'&&rec.access_token){
      // Keep the recovery credentials only in the URL until the password is
      // changed; do not turn a recovery link into the athlete's normal app session.
      document.body.classList.remove('mw-auth-ready');
      document.body.classList.add('mw-auth-pending');
      document.querySelector('#mwAuthReset').classList.add('show');
      document.querySelector('#mwAuthLogin').style.display='none';
      document.querySelector('#mwForgotPassword').style.display='none';
      authStatus('Create and confirm your new MW Dynasty password.');
      return true;
    }
    return false;
  }
  async function resume(){
  const raw=localStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY);
  if(!raw)return;
  document.body.classList.add('mw-entering');

  try{
    mwSession=JSON.parse(raw);

    if(!mwSession?.refresh_token){
      throw new Error('No refresh token');
    }

    const r=await fetch(
      SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':SUPABASE_KEY
        },
        body:JSON.stringify({
          refresh_token:mwSession.refresh_token
        })
      }
    );

    const refreshed=await r.json().catch(()=>({}));

    if(!r.ok || !refreshed.access_token){
      const err=mwAccessError(
        refreshed.error_description ||
        refreshed.msg ||
        refreshed.error ||
        'Session refresh failed',
        r.status
      );
      throw err;
    }

    saveSession(refreshed);
    if(await waitForAthleteActivation(refreshed))return;
    try{
      await loadMe();
      document.body.classList.remove('mw-auth-pending','mw-entering');
      document.body.classList.add('mw-auth-ready');
    }catch(accessErr){
      const msg=String(accessErr?.message||'');
      if(msg.toLowerCase().includes('not active')){renderAthleteMembership(refreshed);return}
      throw accessErr;
    }
  }catch(e){
    console.warn('MW session restore failed:',e);
    document.body.classList.remove('mw-entering');
    if(showRoleMismatch(e))return;
    if(mwSession?.access_token&&mwSession?.refresh_token){
      window.MWDiag?.event('athlete_session_restore_startup_error',{severity:'error',code:'session_restore_startup',context:{message:String(e?.message||e).slice(0,180)}});
      authStatus('Your MW session is still signed in. The Athlete app could not finish loading one feature; refresh once to retry.',true);
      return
    }
    if(transientProblem(e)){
      authStatus('MW is having a temporary connection issue. Your saved session is safe; we’ll reconnect automatically.',true);
      return
    }
    clearSession();
  }
}

  // Replace Coach MW network calls so browser-supplied profile/week can never be authoritative.
  try{
    voiceBlob=async function(text,coachType){const r=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},body:JSON.stringify({text,coachType})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Natural voice unavailable')}return r.blob()};
    send=async function(t){
      t=(t||document.querySelector('#q').value).trim();if(!t)return;add(t,'me');document.querySelector('#q').value='';conversation.push({role:'user',content:t});saveConversation();add('Coach MW is thinking…','coach');const bubble=document.querySelector('#chat').lastElementChild;
      try{
        const request=()=>fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},body:JSON.stringify({messages:conversation,clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||null})});
        let r=await request();
        if(r.status===401&&mwSession?.refresh_token){
          const rr=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({refresh_token:mwSession.refresh_token})});
          const fresh=await rr.json().catch(()=>({}));
          if(rr.ok&&fresh.access_token){saveSession(fresh);r=await request()}
        }
        const data=await r.json().catch(()=>({}));
        if(!r.ok){const e=new Error(data.error||'Coach MW request failed');e.status=r.status;e.code=data.code||'';throw e}
        const a=(data.text||'').trim();if(!a)throw new Error('Empty AI response');
        conversation.push({role:'assistant',content:a});saveConversation();bubble.remove();add(a,'coach');const n=document.querySelector('#connectionNotice');if(n){n.textContent='';n.classList.remove('show')}if(getPrefs().autoVoice==='on'){stopCoachVoice();speak(a,null)}
      }catch(err){
        bubble.remove();
        const accessIssue=Number(err.status)===403;
        const sessionIssue=Number(err.status)===401;
        const msg=accessIssue
          ? 'Coach MW is connected, but this account needs attention: '+err.message
          : sessionIssue
            ? 'Your MW session needs to be refreshed. Sign in again if this continues.'
            : 'Coach MW connection unavailable right now. '+err.message;
        add(msg,'coach');
        const n=document.querySelector('#connectionNotice');if(n){n.textContent=(accessIssue?'ACCOUNT ACCESS • ':'LIVE COACH MW CONNECTION • ')+err.message;n.classList.add('show')}
      }
    };
    const go=document.querySelector('#go');if(go)go.onclick=()=>send();const q=document.querySelector('#q');if(q)q.onkeydown=e=>{if(e.key==='Enter')send()};document.querySelectorAll('.quick button').forEach(b=>b.onclick=()=>send(b.dataset.q));
  }catch(e){console.warn('MW auth network override',e)}


  const accessReason=new URLSearchParams(location.search).get('access');
  if(accessReason==='membership'){authStatus('This account does not currently have active MW Dynasty access.',true)}

  const pwToggle=document.querySelector('#mwTogglePassword');
  if(pwToggle) pwToggle.onclick=()=>{const f=document.querySelector('#mwAuthPassword');const show=f.type==='password';f.type=show?'text':'password';pwToggle.textContent=show?'Hide':'Show';pwToggle.setAttribute('aria-label',show?'Hide password':'Show password');pwToggle.setAttribute('aria-pressed',String(show))};
  document.querySelector('#mwAthleteLoginForm').onsubmit=e=>{e.preventDefault();login()};
  document.querySelector('#mwForgotPassword').onclick=requestPasswordReset;document.querySelector('#mwAuthLogin').style.display='';authStatus('');
  document.querySelector('#mwSavePassword').onclick=saveRecoveredPassword;
  const out=document.querySelector('#mwSignOut');if(out)out.onclick=async()=>{out.disabled=true;out.textContent='SIGNING OUT…';try{const t=token();if(t)await fetch(SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t}})}catch(e){console.warn('MW remote sign-out unavailable',e)}finally{clearSession();location.replace('/athlete/')}};
  window.addEventListener('mw:session-refreshed',e=>{if(e?.detail?.key===SESSION_KEY&&e.detail.session)mwSession=e.detail.session});
  window.addEventListener('online',()=>{const raw=localStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY);if(raw&&!document.body.classList.contains('mw-auth-ready'))setTimeout(()=>resume(),220)});
  if(!initRecoveryMode()){
    const confirmed=confirmedSignupSessionFromUrl();
    if(confirmed){saveSession(confirmed,true);history.replaceState({},document.title,location.pathname);renderAthleteMembership(confirmed)}
    else resume();
  }
})();
