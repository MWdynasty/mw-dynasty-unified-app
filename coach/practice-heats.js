(function(root){
  'use strict';
  async function mount(d){
    const e=d.escapeHtml;
    d.pageBase('Practice','Time one heat. Switch groups between reps.',`<section id="mwHeatRun" class="mwHeatRun" aria-label="Practice heat timing">
      <details class="mwHeatPlan"><summary>Today’s workout</summary><div id="practiceTodayPlan"></div></details>
      <div class="mwHeatGroupRow"><label>Practice group<select id="heatGroup" aria-label="Practice group"></select></label><button class="back" id="heatAdd">+ Add group</button><button class="back" id="heatEdit">Edit group</button></div>
      <div class="mwHeatPickerRow"><label>Timed heat<select id="heatPicker" aria-label="Timed heat"></select></label><b id="heatRep">REP 1</b></div>
      <div class="mwHeatClocks"><div><span>REP TIME</span><strong id="heatClock">00.00</strong><small id="heatClockState">Loading athletes…</small></div><div><span>THIS HEAT’S REST</span><strong id="heatRestClock">00:00</strong><div><button class="back" id="heatRestToggle">START REST</button><button class="back" id="heatRestReset">RESET REST</button></div></div></div>
      <div class="mwHeatStartRow"><button class="action" id="heatStart">START REP</button><button class="back" id="heatReset">RESET CURRENT REP</button></div>
      <div id="heatLanes" class="mwHeatLanes"></div>
      <div class="mwHeatPrimary"><button class="action" id="heatNext" disabled>NEXT REP</button><button class="action" id="heatSave" disabled>FINISH & SAVE</button></div>
      <p id="heatStatus" class="mwHeatStatus" role="status" aria-live="polite">Loading saved groups…</p>
      <details class="mwHeatMore"><summary>Corrections & attendance</summary><div><button class="back" id="heatUndo">UNDO LAST FINISH</button><button class="back" id="heatDNF">DID NOT FINISH</button><button class="back" id="heatManual">ENTER A TIME</button><button class="back" id="heatAttendance">ATTENDANCE</button></div></details>
    </section>`);
    d.hydrateCoachTodayPractice('practiceTodayPlan',{practiceMode:true});
    const panel=document.getElementById('mwHeatRun'),find=id=>document.getElementById(id);
    const today=d.mwLocalIsoDate();
    const uid=(await d.mwCurrentUser()).id,storageKey='mw-practice-heats-v1:'+d.project+':'+uid+':'+today;
    let roster=[],groups=[],plans={},targets={},heats=[],selectedGroupId=null,model,saving=false,persistError=false;
    let restored;
    try{restored=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}
    model=new root.MWPracticeHeats.Session({coachId:uid,date:today,draft:restored});
    const notice=text=>{find('heatStatus').textContent=text;};
    const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(model.snapshot()));persistError=false}catch{persistError=true;notice('Device storage is unavailable. Keep this page open until you save.')}};
    const h=()=>model.heats[model.active];
    const busy=()=>saving||Object.values(model.heats).some(x=>x.runningAt!=null);
    const name=id=>roster.find(a=>a.id===id)?.name||'Athlete';
    const limit=id=>Math.max(0,Number(plans[id]?.reps)||0);
    const max=heat=>Math.max(0,...heat.athleteIds.map(limit));
    const eligible=id=>{const heat=h();return !d.coachPracticeWorkoutComplete(roster.find(a=>a.id===id))&&!plans[id]?.error&&limit(id)>0&&heat.rep<=limit(id)&&!model.owner(id,heat.key)};
    const pace=(seconds,id)=>{
      const t=Number(targets[id])||null,intent=plans[id]?.intent||'pace';if(!t)return {targetSeconds:null,paceStatus:null,paceLabel:'',mwIntent:intent};
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
        plans[a.id]={...p,...d.coachPracticeIdentity(a,week,day),week,day,sourceWeek,intent};if(t)targets[a.id]=t;
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
      const sec=Math.floor(model.rest(heat)/1000);find('heatRestClock').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
    }
    function render(){
      if(!panel.isConnected)return;const heat=h(),running=heat?.runningAt!=null;
      const groupOptions=groups.slice();for(const x of heats)if(!groupOptions.some(g=>g.id===x.groupId))groupOptions.push({id:x.groupId,name:x.groupName+' · recovered draft'});
      find('heatGroup').innerHTML=groupOptions.map(g=>`<option value="${e(g.id)}">${e(g.name)}</option>`).join('');
      if(heat)selectedGroupId=heat.groupId;else selectedGroupId=selectedGroupId||groups[0]?.id;
      find('heatGroup').value=selectedGroupId||'';
      find('heatPicker').innerHTML=heats.filter(x=>x.groupId===heat?.groupId).map(x=>`<option value="${e(x.key)}">Heat ${x.heatNumber} · ${x.athleteIds.length} athletes${x.saved?' · Saved':''}</option>`).join('');
      if(heat)find('heatPicker').value=heat.key;
      for(const id of ['heatGroup','heatPicker','heatAdd'])find(id).disabled=busy();
      const selected=groups.find(g=>g.id===(heat?.groupId||selectedGroupId));
      find('heatEdit').disabled=busy()||!selected||selected.temporary||heats.some(x=>x.groupId===selected.id&&root.MWPracticeHeats.pending(x));
      find('heatReset').disabled=saving||!heat||heat.saved;
      find('heatRep').textContent=heat?`REP ${Math.min(heat.rep,max(heat)||heat.rep)}${max(heat)?' / '+max(heat):''}`:'NO HEAT';
      find('heatClockState').textContent=!heat?'Add a group to start':heat.interrupted?'Interrupted rep · Reset to retime':heat.saved?'Heat saved':running?'Tap athletes as they cross':heat.repResults.length?'Rep finished · Recover':heat.detached?'Recovered draft · Save or review':'Ready for Rep '+heat.rep;
      find('heatStart').disabled=saving||!heat||running||heat.saved||heat.interrupted||heat.detached||heat.repResults.length>0||!heat.athleteIds.some(eligible);
      find('heatNext').disabled=saving||!heat||running||!heat.repResults.length||heat.rep>=max(heat);
      find('heatNext').textContent=heat&&heat.rep>=max(heat)?'REPS COMPLETE':'NEXT REP';
      const hasResults=Object.values(model.heats).some(x=>!x.saved&&(x.results.length||x.repResults.length));
      find('heatSave').disabled=busy()||!hasResults||Object.values(model.heats).some(x=>x.interrupted);
      find('heatSave').textContent=saving?'SAVING…':'FINISH & SAVE';
      find('heatUndo').disabled=saving||!heat?.repResults.length;
      find('heatDNF').disabled=saving||!running;
      find('heatManual').disabled=saving||!running;
      find('heatAttendance').disabled=busy();
      find('heatRestToggle').disabled=saving||running||!heat;
      find('heatRestReset').disabled=saving||running||!heat;
      find('heatRestToggle').textContent=heat?.restStartedAt==null?'START REST':heat.restPausedAt==null?'PAUSE REST':'RESUME REST';
      find('heatLanes').innerHTML=heat?heat.athleteIds.map((id,i)=>{
        const a=roster.find(x=>x.id===id),r=heat.repResults.find(x=>x.athleteId===id),owner=model.owner(id,heat.key),complete=a&&d.coachPracticeWorkoutComplete(a),p=plans[id],t=targets[id];
        const status=heat.saved||complete?'WORKOUT SAVED':owner?'IN ANOTHER HEAT':p?.error?'WORKOUT UNAVAILABLE':heat.rep>limit(id)?'REPS COMPLETE':r?(r.ms/1000).toFixed(2)+' s':'TAP FINISH';
        return `<button class="mwHeatLane ${r?'finished':''}" data-heat-athlete="${e(id)}" ${saving||!running||r||!eligible(id)?'disabled':''}><span>LANE ${i+1}</span><b>${e(a?.name||'Saved athlete')}</b><small>${t?'Target '+Number(t).toFixed(2)+' s':''}</small><strong>${e(status)}</strong>${r?.paceLabel?`<em>${e(r.paceLabel)}</em>`:''}</button>`;
      }).join(''):'<p>No athletes in this group. Add or edit a group to choose athletes.</p>';
      find('heatLanes').querySelectorAll('[data-heat-athlete]').forEach(button=>button.onclick=()=>finish(button.dataset.heatAthlete));
      panel.closest('.page')?.classList.toggle('mw-heat-running',Boolean(running));
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
    find('heatStart').onclick=()=>change(()=>{model.start(h().athleteIds.filter(eligible));notice('Rep running · Tap athletes at the finish line.');});
    find('heatNext').onclick=()=>change(()=>model.next(max(h())));
    find('heatReset').onclick=()=>change(()=>{if(h()?.repResults.length&&!confirm('Discard only the current rep’s unsaved times? Earlier reps and saved training history stay unchanged.'))return;model.reset();notice('Current rep reset. Earlier reps remain.');});
    find('heatUndo').onclick=()=>change(()=>model.undo());
    find('heatRestToggle').onclick=()=>change(()=>model.toggleRest());
    find('heatRestReset').onclick=()=>change(()=>model.resetRest());
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
      const data=await d.fetchCoachRoster();roster=data.athletes||[];await loadPlans();await loadGroups();render();
      notice(Object.values(model.heats).some(x=>x.interrupted)?'Recovered earlier reps. The interrupted rep needs Reset before retiming.':Object.values(model.heats).some(root.MWPracticeHeats.pending)?'Unfinished practice restored. Each heat kept its results and rest.':roster.length?'Choose a group and start a rep.':'Connect athletes before creating practice groups.');
    }catch(err){notice('Practice could not load: '+err.message);find('heatStart').disabled=true;find('heatAdd').disabled=true;}
    const tick=setInterval(()=>{if(!panel.isConnected){clearInterval(tick);return}paint()},80);
    const unloading=event=>{persist();if(Object.values(model.heats).some(root.MWPracticeHeats.pending)){event.preventDefault();event.returnValue=''}};
    window.addEventListener('beforeunload',unloading);
    const cleanup=setInterval(()=>{if(!panel.isConnected){window.removeEventListener('beforeunload',unloading);clearInterval(cleanup)}},1000);
    return {model};
  }
  root.MWCoachPractice={mount};
})(window);
