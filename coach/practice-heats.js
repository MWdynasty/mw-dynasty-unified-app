(function(root){
  'use strict';
  async function mount(d){
    root.__mwCoachPracticeDispose?.();
    const e=d.escapeHtml;
    d.pageBase('Practice','Time one heat. Switch groups between reps.',`<section id="mwHeatRun" class="mwHeatRun" aria-label="Practice heat timing">
      <div class="mwHeatTabs" role="tablist" aria-label="Practice controls"><button class="back" id="heatPracticeTab" role="tab" aria-selected="true" aria-controls="heatPracticePanel">PRACTICE</button><button class="back" id="heatModeTab" role="tab" aria-selected="false" aria-controls="heatModePanel" tabindex="-1">MODE</button></div>
      <section id="heatModePanel" class="mwHeatMode" role="tabpanel" aria-labelledby="heatModeTab" hidden>
        <p id="heatModeGroup"></p>
        <div class="mwHeatModeRow"><div><b>Block-start narrator</b><p>On your marks → Set → Go. The stopwatch starts on Go.</p></div><button class="back" id="heatNarratorToggle" type="button" role="switch" aria-checked="false" aria-label="Block-start narrator">OFF</button></div>
        <div><b>Rest countdown for this heat</b><p>Uses prescribed rep rest when available. Adjust your group’s recovery time here.</p><div class="mwHeatRestSetting"><label>Minutes<input id="heatRestMinutes" type="number" inputmode="numeric" min="0" max="60" value="1"></label><label>Seconds<input id="heatRestSeconds" type="number" inputmode="numeric" min="0" max="59" value="30"></label><button class="action" id="heatRestApply">SET REST</button></div><p id="heatRestSettingStatus" role="status">Rest starts after the last athlete finishes. An alert sounds at zero.</p></div>
        <button class="back mwHeatWhistle" id="heatModeWhistle" type="button">♬ BLOW WHISTLE</button>
      </section>
      <div id="heatPracticePanel" role="tabpanel" aria-labelledby="heatPracticeTab">
      <details class="mwHeatPlan"><summary>Today’s workout</summary><div id="practiceTodayPlan"></div></details>
      <div class="mwHeatGroupRow"><label>Practice group<select id="heatGroup" aria-label="Practice group"></select></label><button class="back" id="heatAdd">+ Add group</button><button class="back" id="heatEdit">Edit group</button></div>
      <div class="mwHeatPickerRow"><label>Timed heat<select id="heatPicker" aria-label="Timed heat"></select></label><b id="heatRep">REP 1</b></div>
      <div class="mwHeatClocks"><div><span>REP STOPWATCH</span><strong id="heatClock">00.00</strong><small id="heatClockState">Loading athletes…</small></div><div id="heatRestPanel"><span>REST COUNTDOWN</span><strong id="heatRestClock">01:30</strong><small id="heatRestState" role="status">READY BETWEEN REPS</small><div><button class="back" id="heatRestToggle">START REST</button><button class="back" id="heatRestReset">RESET REST</button></div></div></div>
      <div class="mwHeatStartRow"><button class="action" id="heatStart" disabled>START REP</button><button class="back" id="heatStop" disabled>STOP</button><button class="back" id="heatReset">RESET REP</button><button class="back mwHeatWhistle" id="heatWhistle" type="button">♬ BLOW WHISTLE</button></div>
      <div id="heatLanes" class="mwHeatLanes"></div>
      <div class="mwHeatPrimary"><button class="action" id="heatNext" disabled>NEXT REP</button><button class="action" id="heatSave" disabled>FINISH & SAVE</button></div>
      <details class="mwHeatMore"><summary>Corrections & attendance</summary><div><button class="back" id="heatUndo">UNDO LAST FINISH</button><button class="back" id="heatDNF">DID NOT FINISH</button><button class="back" id="heatManual">ENTER A TIME</button><button class="back" id="heatAttendance">ATTENDANCE</button></div></details>
      </div>
      <p id="heatStatus" class="mwHeatStatus" role="status" aria-live="polite">Loading saved groups…</p>
    </section>`);
    d.hydrateCoachTodayPractice('practiceTodayPlan',{practiceMode:true});
    const panel=document.getElementById('mwHeatRun'),find=id=>document.getElementById(id);
    const today=d.mwLocalIsoDate();
    const uid=(await d.mwCurrentUser()).id,storageKey='mw-practice-heats-v1:'+d.project+':'+uid+':'+today;
    if(!panel.isConnected)return;
    const settingsKey='mw-practice-mode-v1:'+d.project+':'+uid;
    const narrator=root.MWCoachTimingTools.createNarrator(),audio=root.MWCoachTimingTools.audio;
    let roster=[],groups=[],plans={},targets={},heats=[],selectedGroupId=null,model,saving=false,persistError=false,counting=false,countingCue='',narration=false;
    try{narration=JSON.parse(localStorage.getItem(settingsKey)||'null')?.narration===true;}catch{}
    let restored;
    try{restored=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}
    model=new root.MWPracticeHeats.Session({coachId:uid,date:today,draft:restored});
    const notice=text=>{if(panel.isConnected)find('heatStatus').textContent=text;};
    const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(model.snapshot()));persistError=false}catch{persistError=true;notice('Device storage is unavailable. Keep this page open until you save.')}};
    const h=()=>model.heats[model.active];
    const busy=()=>saving||counting||Object.values(model.heats).some(root.MWPracticeHeats.active);
    const name=id=>roster.find(a=>a.id===id)?.name||'Athlete';
    const limit=id=>Math.max(0,Number(plans[id]?.reps)||0);
    const max=heat=>Math.max(0,...heat.athleteIds.map(limit));
    const eligible=id=>{const heat=h();return !d.coachPracticeWorkoutComplete(roster.find(a=>a.id===id))&&!plans[id]?.error&&limit(id)>0&&heat.rep<=limit(id)&&!model.owner(id,heat.key)};
    const workoutsSaved=heat=>!!heat&&(heat.saved||(heat.athleteIds.length>0&&heat.athleteIds.every(id=>d.coachPracticeWorkoutComplete(roster.find(a=>a.id===id)))));
    const pace=(seconds,id)=>{
      const t=Number(targets[id]?.target)||null,intent=plans[id]?.intent||'pace';if(!t)return {targetSeconds:null,paceStatus:null,paceLabel:'',mwIntent:intent};
      const fast=t*.99,slow=t*1.01,above=seconds<fast,below=seconds>slow,quality=['speed','technical'].includes(intent);
      return {targetSeconds:t,targetMinSeconds:fast,targetMaxSeconds:slow,mwIntent:intent,paceStatus:above&&!quality?'fast':below?'slow':'on_pace',mwInterpretation:above?(quality?'above_target':'pace_violation'):below?'below_target':'on_target',paceLabel:above?(quality?'ABOVE TARGET · QUALITY SPEED':'ABOVE PRESCRIBED PACE'):below?(intent==='technical'?'BELOW TARGET · TECHNICAL SPEED':'BELOW TARGET'):'ON TARGET'};
    };
    async function loadPlans(){
      const cache=new Map();plans={};targets={};
      await Promise.all(roster.map(async a=>{try{
        const week=Number(a.current_week)||1,sourceWeek=Number(a.source_week)||week,day=Number(a.current_day)||1,tier=d.coachPracticeTier(a),strengthTier=d.coachPracticeStrengthTier(a),eg=d.coachPracticeEventGroup(a),key=[sourceWeek,day,tier,strengthTier,eg].join('|');
        if(!cache.has(key))cache.set(key,d.coachProgramData(sourceWeek,eg,tier,strengthTier));
        const data=await cache.get(key),s=(data.track?.sessions||[]).find(x=>d.coachSessionDayNumber(x.day)===day),p=d.mwCoachPracticePrescription(s),t=d.mwCoachPracticeRecommendedTarget(a,p.distance,p.intensityPct);
        const text=[s?.title,s?.focus,s?.prescribedWork,s?.work,s?.structure,s?.intensity,...(Array.isArray(s?.cues)?s.cues:[])].filter(Boolean).join(' ').toLowerCase();
        const intent=/tempo|extensive|recovery|regeneration|easy/.test(text)?(/recovery|regeneration|easy/.test(text)?'recovery':'pace'):/technical|technique|progressive|fly|flying|wicket|max.?v|max velocity|acceleration|speed/.test(text)?(/technical|technique|progressive|fly|flying|wicket/.test(text)?'technical':'speed'):'pace';
        const restSeconds=root.MWCoachTimingTools.prescribedRestSeconds([p.raw,s?.rest,s?.recovery].filter(Boolean).join(' '));
        plans[a.id]={...p,...d.coachPracticeIdentity(a,week,day),week,day,sourceWeek,intent,restSeconds};if(t)targets[a.id]=typeof t==='object'?t:{target:t,paceBasis:root.MWPace?.calculate(a.prs,p.distance,Number(p.intensityPct)/100)};
      }catch(err){plans[a.id]={error:err.message}}}));
    }
    async function loadGroups(){
      const rows=await d.sbRest('coach_groups?select=id,name,coach_group_members(athlete_id)&archived=eq.false&order=created_at.asc');
      groups=(rows||[]).map(g=>({id:g.id,name:g.name,athleteIds:(g.coach_group_members||[]).map(m=>m.athlete_id)}));
      if(!groups.length&&roster.length)groups=[{id:'unassigned',name:'Assigned athletes',athleteIds:roster.map(a=>a.id),temporary:true}];
      heats=model.reconcile(groups,roster,plans);persist();
    }
    function paint(){
      if(!panel.isConnected)return;
      const heat=h();find('heatClock').textContent=(model.elapsed(heat)/1000).toFixed(2).padStart(5,'0');
      const sec=Math.ceil(model.restRemaining(heat)/1000);find('heatRestClock').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
      const complete=model.restComplete(heat);
      find('heatRestPanel').classList.toggle('mwHeatRestComplete',complete);
      find('heatRestState').textContent=complete?'REST COMPLETE':heat?.restPausedAt!=null?'REST PAUSED':heat?.restStartedAt!=null?'RECOVERING':'READY BETWEEN REPS';
      find('heatRestToggle').textContent=complete?'REST COMPLETE':heat?.restStartedAt==null?'START REST':heat.restPausedAt==null?'PAUSE REST':'RESUME REST';
      find('heatRestToggle').disabled=complete||saving||counting||root.MWPracticeHeats.active(heat)||!heat;
      for(const x of Object.values(model.heats))if(!x.saved&&model.restComplete(x)&&!x.restAlerted&&document.visibilityState!=='hidden'){
        x.restAlerted=true;persist();audio.alert();notice(x.groupName+' · Heat '+x.heatNumber+' — rest complete.');
      }
    }
    function render(){
      if(!panel.isConnected)return;const heat=h(),running=heat?.runningAt!=null,repActive=root.MWPracticeHeats.active(heat),finishable=running||heat?.stopped;
      const groupOptions=groups.slice();for(const x of heats)if(!groupOptions.some(g=>g.id===x.groupId))groupOptions.push({id:x.groupId,name:x.groupName+' · recovered draft'});
      find('heatGroup').innerHTML=groupOptions.map(g=>`<option value="${e(g.id)}">${e(g.name)}</option>`).join('');
      if(heat)selectedGroupId=heat.groupId;else selectedGroupId=selectedGroupId||groups[0]?.id;
      find('heatGroup').value=selectedGroupId||'';
      find('heatPicker').innerHTML=heats.filter(x=>x.groupId===heat?.groupId).map(x=>`<option value="${e(x.key)}">Heat ${x.heatNumber} · ${x.athleteIds.length} athletes${x.saved?' · Saved':''}</option>`).join('');
      if(heat)find('heatPicker').value=heat.key;
      for(const id of ['heatGroup','heatPicker','heatAdd'])find(id).disabled=busy();
      const selected=groups.find(g=>g.id===(heat?.groupId||selectedGroupId));
      find('heatEdit').disabled=busy()||!selected||selected.temporary||heats.some(x=>x.groupId===selected.id&&root.MWPracticeHeats.pending(x));
      find('heatReset').disabled=saving||!heat||workoutsSaved(heat);
      find('heatRep').textContent=heat?`REP ${Math.min(heat.rep,max(heat)||heat.rep)}${max(heat)?' / '+max(heat):''}`:'NO HEAT';
      find('heatClockState').textContent=counting?countingCue||'Preparing block start…':!heat?'Add a group to start':workoutsSaved(heat)?'Workouts already saved':heat.interrupted?'Interrupted rep · Reset to retime':running?'Tap athletes as they cross':heat.paused?'STOPWATCH PAUSED':heat.stopped?'Stopped · Tap finishes or enter times':heat.repResults.length?'Rep finished · Recover':heat.detached?'Recovered draft · Save or review':'Ready for Rep '+heat.rep;
      find('heatStart').textContent=counting?'CANCEL START':running?'PAUSE':heat?.paused?'RESUME REP':heat?.stopped?'STOPPED':'START REP';
      find('heatStart').disabled=saving||!heat||heat.saved||heat.interrupted||heat.detached||heat.stopped||(!running&&!heat.paused&&!counting&&(heat.repResults.length>0||!heat.athleteIds.some(eligible)));
      find('heatStop').disabled=saving||counting||!heat||(!running&&!heat.paused);
      find('heatNext').disabled=saving||counting||!heat||repActive||!heat.repResults.length||heat.rep>=max(heat);
      find('heatNext').textContent=heat&&heat.rep>=max(heat)?'REPS COMPLETE':'NEXT REP';
      const hasResults=Object.values(model.heats).some(x=>!x.saved&&(x.results.length||x.repResults.length));
      find('heatSave').disabled=busy()||!hasResults||Object.values(model.heats).some(x=>x.interrupted);
      find('heatSave').textContent=saving?'SAVING…':'FINISH & SAVE';
      find('heatUndo').disabled=saving||counting||!heat?.repResults.length;
      find('heatDNF').disabled=saving||!finishable;
      find('heatManual').disabled=saving||!finishable;
      find('heatAttendance').disabled=busy();
      find('heatRestToggle').disabled=saving||counting||repActive||!heat;
      find('heatRestReset').disabled=saving||counting||repActive||!heat;
      find('heatRestToggle').textContent=model.restComplete(heat)?'REST COMPLETE':heat?.restStartedAt==null?'START REST':heat.restPausedAt==null?'PAUSE REST':'RESUME REST';
      if(model.restComplete(heat))find('heatRestToggle').disabled=true;
      find('heatNarratorToggle').disabled=busy();find('heatNarratorToggle').textContent=narration?'ON':'OFF';find('heatNarratorToggle').setAttribute('aria-checked',String(narration));
      find('heatModeGroup').textContent=heat?heat.groupName+' · Heat '+heat.heatNumber:'Choose or add a practice group first.';
      for(const id of ['heatRestMinutes','heatRestSeconds','heatRestApply'])find(id).disabled=busy()||!heat;
      const duration=Math.round((heat?.restDurationMs||90000)/1000);find('heatRestMinutes').value=Math.floor(duration/60);find('heatRestSeconds').value=duration%60;
      find('heatLanes').innerHTML=heat?heat.athleteIds.map((id,i)=>{
        const a=roster.find(x=>x.id===id),r=heat.repResults.find(x=>x.athleteId===id),owner=model.owner(id,heat.key),complete=a&&d.coachPracticeWorkoutComplete(a),p=plans[id],t=targets[id]?.target;
        const status=heat.saved||complete?'WORKOUT SAVED':owner?'IN ANOTHER HEAT':p?.error?'WORKOUT UNAVAILABLE':heat.rep>limit(id)?'REPS COMPLETE':r?(r.ms/1000).toFixed(2)+' s':'TAP FINISH';
        return `<button class="mwHeatLane ${r?'finished':''}" data-heat-athlete="${e(id)}" ${saving||!finishable||r||!eligible(id)?'disabled':''}><span>LANE ${i+1}</span><b>${e(a?.name||'Saved athlete')}</b><small>${t?'Target '+Number(t).toFixed(2)+' s'+(targets[id]?.paceBasis?.estimated?' · ESTIMATE':''):''}</small><strong>${e(status)}</strong>${r?.paceLabel?`<em>${e(r.paceLabel)}</em>`:''}</button>`;
      }).join(''):'<p>No athletes in this group. Add or edit a group to choose athletes.</p>';
      find('heatLanes').querySelectorAll('[data-heat-athlete]').forEach(button=>button.onclick=()=>finish(button.dataset.heatAthlete));
      panel.closest('.page')?.classList.toggle('mw-heat-running',Boolean(repActive||counting));
      paint();
    }
    function change(action){try{action();persist();render()}catch(err){notice(err.message)}}
    function details(id){return {...plans[id],division:roster.find(a=>a.id===id)?.competition_division||null,resultStatus:'finished',...pace(model.elapsed()/1000,id)}}
    function finish(id,override){
      change(()=>{model.finish(id,{...details(id),...override});});
    }
    function groupModal(group){
      if(busy())return;const selected=new Set(group?.athleteIds||[]);
      d.mwModal(group?'Edit practice group':'Add practice group',`<div class="mwHeatGroupEditor"><label>Group name<input id="heatGroupName" maxlength="80" value="${e(group?.name||'')}" placeholder="Name your group"></label><fieldset><legend>Choose assigned athletes</legend>${roster.map(a=>`<label class="mwHeatMember"><input type="checkbox" data-heat-member="${e(a.id)}" ${selected.has(a.id)?'checked':''}><span>${e(a.name)}<small>${e(a.competition_division||a.event||'')}</small></span></label>`).join('')}</fieldset><p id="heatGroupError" role="alert"></p><button class="action" id="heatGroupConfirm">SAVE GROUP</button></div>`);
      find('heatGroupConfirm').onclick=async()=>{
        const name=find('heatGroupName').value.trim(),ids=[...document.querySelectorAll('[data-heat-member]:checked')].map(x=>x.dataset.heatMember);
        if(!name||!ids.length){find('heatGroupError').textContent='Name the group and select at least one athlete.';return}
        const button=find('heatGroupConfirm');button.disabled=true;button.textContent='SAVING…';
        try{const result=await d.sbRest('rpc/mw_coach_save_training_group',{method:'POST',body:{p_group_id:group?.id||null,p_name:name,p_athlete_ids:ids}});await loadGroups();const savedId=result?.id||result?.[0]?.id;const first=heats.find(x=>x.groupId===savedId);if(first)model.select(first.key);persist();document.getElementById('mwModal')?.remove();render();notice('Group saved. Names and athletes will remain after signing back in.')}catch(err){find('heatGroupError').textContent=err.message;button.disabled=false;button.textContent='RETRY SAVE'}
      };
    }
    find('heatAdd').onclick=()=>groupModal(null);
    find('heatEdit').onclick=()=>groupModal(groups.find(g=>g.id===(h()?.groupId||selectedGroupId)));
    find('heatGroup').onchange=()=>change(()=>{selectedGroupId=find('heatGroup').value;const first=heats.find(x=>x.groupId===selectedGroupId);if(first)model.select(first.key);else{model.active=null;notice('No assigned athletes in this group. Edit the group to select athletes.')}});
    find('heatPicker').onchange=()=>change(()=>model.select(find('heatPicker').value));
    function cancelStart(){narrator.cancel();counting=false;countingCue='';}
    const beginRep=()=>change(()=>{model.start(h().athleteIds.filter(eligible));notice('Rep running · Tap athletes at the finish line.');});
    find('heatStart').onclick=()=>{
      if(saving)return;audio.unlock();
      if(counting){cancelStart();render();notice('Block start cancelled. Ready when you are.');return;}
      if(h()?.runningAt!=null){change(()=>model.pause());return;}
      if(h()?.paused||!narration){beginRep();return;}
      if(!h()||find('heatStart').disabled)return;
      counting=true;countingCue='Preparing block start…';render();
      narrator.start({onCue:cue=>{countingCue=cue.toUpperCase();if(panel.isConnected)render();},onGo:()=>{if(!panel.isConnected||document.visibilityState==='hidden'){cancelStart();return;}counting=false;beginRep();},onError:err=>{counting=false;if(panel.isConnected){render();notice(err.message);}}});
    };
    find('heatStop').onclick=()=>change(()=>{model.stop();notice('Stopwatch stopped. Tap remaining finishes at this time, enter their times, or reset the current rep.');});
    find('heatNext').onclick=()=>change(()=>model.next(max(h())));
    find('heatReset').onclick=()=>change(()=>{if(h()?.repResults.length&&!confirm('Discard only the current rep’s unsaved times? Earlier reps and saved training history stay unchanged.'))return;cancelStart();model.reset();notice('Current rep reset. Earlier reps remain.');});
    find('heatUndo').onclick=()=>change(()=>model.undo());
    find('heatRestToggle').onclick=()=>change(()=>{audio.unlock();model.toggleRest();});
    find('heatRestReset').onclick=()=>change(()=>model.resetRest());
    function setTab(mode){for(const [id,selected] of [['heatPracticeTab',!mode],['heatModeTab',mode]]){find(id).setAttribute('aria-selected',String(selected));find(id).tabIndex=selected?0:-1;}find('heatPracticePanel').hidden=mode;find('heatModePanel').hidden=!mode;}
    find('heatPracticeTab').onclick=()=>setTab(false);find('heatModeTab').onclick=()=>setTab(true);
    for(const id of ['heatPracticeTab','heatModeTab'])find(id).onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const mode=event.key==='End'||(event.key!=='Home'&&id==='heatPracticeTab');setTab(mode);find(mode?'heatModeTab':'heatPracticeTab').focus();}};
    find('heatNarratorToggle').onclick=()=>{if(busy())return;narration=!narration;try{localStorage.setItem(settingsKey,JSON.stringify({narration}));}catch{}render();};
    find('heatRestApply').onclick=()=>{
      const minutes=Number(find('heatRestMinutes').value),seconds=Number(find('heatRestSeconds').value);
      if(!Number.isInteger(minutes)||!Number.isInteger(seconds)||minutes<0||seconds<0||seconds>59){find('heatRestSettingStatus').textContent='Enter whole minutes and seconds from 0 to 59.';return;}
      try{model.setRestSeconds(minutes*60+seconds);persist();render();find('heatRestSettingStatus').textContent='Rest countdown set for this heat.';}catch(err){find('heatRestSettingStatus').textContent=err.message;}
    };
    const whistle=async()=>{if(!await audio.whistle())notice('Whistle audio is unavailable. Check device sound and volume.');};
    find('heatWhistle').onclick=whistle;find('heatModeWhistle').onclick=whistle;
    find('heatAttendance').onclick=()=>{persist();d.openPage('attendance')};
    find('heatDNF').onclick=()=>{const id=h()?.repAthleteIds?.find(id=>!h().repResults.some(r=>r.athleteId===id));if(!id)return; if(confirm('Mark '+name(id)+' as did not finish this rep?'))finish(id,{resultStatus:'dnf',paceStatus:null,paceLabel:'DID NOT FINISH',mwInterpretation:null})};
    find('heatManual').onclick=()=>{
      const ids=h()?.repAthleteIds?.filter(id=>!h().repResults.some(r=>r.athleteId===id))||[];if(!ids.length)return;
      d.mwModal('Enter a timed result',`<div class="form"><label>Athlete<select id="heatManualAthlete">${ids.map(id=>`<option value="${e(id)}">${e(name(id))}</option>`).join('')}</select></label><label>Time in seconds<input id="heatManualSeconds" type="number" inputmode="decimal" min="0.01" step="0.01"></label><button class="action" id="heatManualSave">RECORD TIME</button><p id="heatManualError" role="alert"></p></div>`);
      find('heatManualSave').onclick=()=>{const id=find('heatManualAthlete').value,seconds=Number(find('heatManualSeconds').value);if(!(seconds>0)){find('heatManualError').textContent='Enter a positive time.';return}finish(id,{...pace(seconds,id),manualSeconds:seconds,resultStatus:'manual'});const r=h().repResults.find(x=>x.athleteId===id);if(r)r.ms=seconds*1000;persist();render();document.getElementById('mwModal')?.remove()};
    };
    find('heatSave').onclick=async()=>{
      if(saving)return;let batches;try{batches=model.toSave()}catch(err){notice(err.message);return}if(!batches.length)return;
      saving=true;persist();render();let saved=0,warnings=0;
      try{for(const {heat,results} of batches){
        const body={sessionId:heat.sessionId,clientTimeZone:d.mwClientTimeZone(),results:results.map(x=>({athleteId:x.athleteId,sessionDate:model.date,division:x.division,groupName:x.groupName,laneNumber:x.laneNumber,repNumber:x.repNumber,timeSeconds:x.ms/1000,targetSeconds:x.targetSeconds,targetMinSeconds:x.targetMinSeconds,targetMaxSeconds:x.targetMaxSeconds,actualRestSeconds:x.actualRestSeconds,timingSource:x.resultStatus==='manual'?'manual':'coach',resultStatus:x.resultStatus||'finished',paceStatus:x.paceStatus,mwIntent:x.mwIntent,mwInterpretation:x.mwInterpretation,prescribedReps:x.reps,programWeek:x.week,programDay:x.day,sourceProgramWeek:x.sourceWeek,workoutKey:x.workoutKey,distanceM:x.distance,seasonPlanId:x.seasonPlanId||null,workoutCycleId:x.workoutCycleId||null}))};
        notice('Saving '+heat.groupName+' · Heat '+heat.heatNumber+'…');
        const response=await fetch('/api/coach/practice-timing',{method:'POST',headers:{Authorization:'Bearer '+d.mwSessionToken(),'Content-Type':'application/json'},body:JSON.stringify(body)}),receipt=await response.json().catch(()=>({}));if(!response.ok||receipt.ok!==true)throw Error(receipt.error||'Practice save failed');
        model.receipt(heat.key);persist();saved+=Number(receipt.count)||results.length;warnings+=(receipt.intelligenceWarnings||[]).length;
      }
      // The atomic API receipt confirms coach timing, athlete reps, and completion together.
      try{const fresh=await d.fetchCoachRoster();roster=fresh.athletes||[]}catch{warnings++}
      notice(saved+' times saved to coach history and the correct athlete profiles.'+(warnings?' Performance insights will refresh separately.':''));
      }catch(err){notice((saved?saved+' times already saved. ':'')+err.message+' Unsaved heats are kept; retry Finish & Save.');}finally{saving=false;persist();render()}
    };
    try{
      const data=await d.fetchCoachRoster();if(!panel.isConnected)return;roster=data.athletes||[];await loadPlans();if(!panel.isConnected)return;await loadGroups();if(!panel.isConnected)return;render();
      notice(Object.values(model.heats).some(x=>x.interrupted)?'Recovered earlier reps. The interrupted rep needs Reset before retiming.':Object.values(model.heats).some(root.MWPracticeHeats.pending)?'Unfinished practice restored. Each heat kept its results and rest.':workoutsSaved(h())?'Today’s workouts are already saved for this heat. Existing results are protected; choose an incomplete heat or return to athlete results.':roster.length?'Choose a group and start a rep.':'Connect athletes before creating practice groups.');
    }catch(err){if(!panel.isConnected)return;notice('Practice could not load: '+err.message);find('heatStart').disabled=true;find('heatAdd').disabled=true;}
    const tick=setInterval(()=>{if(!panel.isConnected){dispose();return}paint()},80);
    const unloading=event=>{cancelStart();persist();if(Object.values(model.heats).some(root.MWPracticeHeats.pending)){event.preventDefault();event.returnValue=''}};
    const visibility=()=>{if(document.visibilityState==='hidden'&&counting){cancelStart();render();notice('Block start cancelled while the app was in the background.');}};
    function dispose(){cancelStart();clearInterval(tick);window.removeEventListener('beforeunload',unloading);document.removeEventListener('visibilitychange',visibility);if(root.__mwCoachPracticeDispose===dispose)root.__mwCoachPracticeDispose=null;}
    window.addEventListener('beforeunload',unloading);
    document.addEventListener('visibilitychange',visibility);root.__mwCoachPracticeDispose=dispose;
    return {model};
  }
  root.MWCoachPractice={mount};
})(window);
