(function(){
  'use strict';
  if(!location.pathname.startsWith('/athlete'))return;

  var base='https://keqgunlfwhjgcsurynef.supabase.co';
  var key='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
  var groups=['acceleration','maximum_velocity','speed_endurance','competition','tempo','technical','unclassified'];
  var names={acceleration:'Acceleration',maximum_velocity:'Maximum velocity',speed_endurance:'Speed endurance',competition:'Competition / time trial',tempo:'Tempo',technical:'Technical',unclassified:'Other / not classified'};
  var speedEligible=new Set(['acceleration','maximum_velocity','speed_endurance','competition']);
  var ns='http://www.w3.org/2000/svg';

  function session(){
    try{
      var storage=window.MWAccountStorage||{local:localStorage,session:sessionStorage};
      return JSON.parse(storage.local.getItem('mwSupabaseSession')||storage.session.getItem('mwSupabaseSession')||'null');
    }catch(e){return null}
  }
  function node(tag,text,className){var out=document.createElement(tag);if(text!=null)out.textContent=text;if(className)out.className=className;return out}
  function number(value,digits){var n=Number(value);return Number.isFinite(n)?n.toFixed(digits==null?2:digits):'—'}
  function dateOf(row){var d=new Date(row.recorded_at);return Number.isNaN(d.getTime())?null:d}
  function dayKey(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}
  function bucketKey(date,row,period){
    if(period==='month')return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
    return row.program_week?'W'+row.program_week:dayKey(date);
  }
  function bucketLabel(key,period){
    if(period==='month'){
      var parts=key.split('-');return new Date(Number(parts[0]),Number(parts[1])-1,1).toLocaleDateString(undefined,{month:'short',year:'2-digit'});
    }
    return key.startsWith('W')?key:key.slice(5);
  }
  function sessionPoints(rows,selector){
    var sessions=new Map();
    rows.forEach(function(row){
      if(!selector(row))return;
      var date=dateOf(row);if(!date)return;
      var sessionId=[row.workout_cycle_id||'',row.workout_key||'',row.program_week||'',row.program_day||'',dayKey(date)].join('|');
      var point=sessions.get(sessionId);
      var t=Number(row.time_seconds);if(!Number.isFinite(t)||t<=0)return;
      if(!point||t<point.value)sessions.set(sessionId,{value:t,date:date,row:row});
    });
    return [...sessions.values()].sort(function(a,b){return a.date-b.date});
  }
  function bySession(rows,selector,period){
    var periods=new Map();
    sessionPoints(rows,selector).forEach(function(point){
      var key=bucketKey(point.date,point.row,period),prior=periods.get(key);
      if(!prior||point.value<prior.value)periods.set(key,{...point,key:key});
    });
    return [...periods.values()].sort(function(a,b){return a.date-b.date});
  }
  function strengthSessions(rows,exercise,period){
    var sessions=new Map();
    rows.forEach(function(row){
      if(row.exercise+'|'+row.unit!==exercise)return;
      var date=dateOf(row);if(!date)return;
      var id=[row.training_cycle_key||'',row.program_week||'',row.program_day||'',dayKey(date)].join('|');
      var value=Number(row.estimated_1rm);if(!Number.isFinite(value)||value<=0)return;
      var prior=sessions.get(id);if(!prior||value>prior.value)sessions.set(id,{value:value,date:date,row:row});
    });
    var periods=new Map();
    sessions.forEach(function(point){
      var k=bucketKey(point.date,point.row,period),prior=periods.get(k);
      if(!prior||point.value>prior.value)periods.set(k,{...point,key:k});
    });
    return [...periods.values()].sort(function(a,b){return a.date-b.date});
  }
  function groupOptions(rows){
    var found=new Set(rows.map(function(r){return groups.includes(r.intent_group)?r.intent_group:'unclassified'}));
    return groups.filter(function(g){return found.has(g)});
  }
  function drawChart(parent,points,kind,label){
    if(!points.length){parent.appendChild(node('p','Not enough saved sessions for this comparison yet. Keep recording workouts and the graph will fill in.','mwpi-empty'));return}
    var svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 190');svg.setAttribute('role','img');svg.setAttribute('aria-label',label);svg.classList.add('mwpi-chart');
    var values=points.map(function(p){return p.value}),min=Math.min.apply(null,values),max=Math.max.apply(null,values),span=Math.max(max-min,Math.abs(max)*.025,.01);
    var left=42,right=344,top=18,bottom=145;
    [0,1,2].forEach(function(i){var y=top+(bottom-top)*i/2;var line=document.createElementNS(ns,'line');line.setAttribute('x1',left);line.setAttribute('x2',right);line.setAttribute('y1',y);line.setAttribute('y2',y);line.setAttribute('stroke','#283a49');line.setAttribute('stroke-width','1');svg.appendChild(line)});
    var coordinates=points.map(function(point,index){
      var x=points.length===1?(left+right)/2:left+(right-left)*index/(points.length-1);
      var fraction=kind==='speed'?(max-point.value)/span:(point.value-min)/span;
      return {x:x,y:top+10+(bottom-top-20)*(1-fraction),point:point};
    });
    var path=document.createElementNS(ns,'path');path.setAttribute('d',coordinates.map(function(p,i){return (i?'L':'M')+p.x+' '+p.y}).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#f3c768');path.setAttribute('stroke-width','3');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.appendChild(path);
    coordinates.forEach(function(c){
      var circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',c.x);circle.setAttribute('cy',c.y);circle.setAttribute('r','5');circle.setAttribute('fill','#f3c768');circle.setAttribute('stroke','#101b29');circle.setAttribute('stroke-width','2');
      var tip=document.createElementNS(ns,'title');tip.textContent=kind==='speed'?number(c.point.value,2)+' seconds · '+names[c.point.row.intent_group]+' · '+c.point.date.toLocaleDateString():number(c.point.value,1)+' estimated 1RM · '+c.point.row.weight+' '+c.point.row.unit+' × '+c.point.row.reps+' · '+c.point.date.toLocaleDateString();circle.appendChild(tip);svg.appendChild(circle);
    });
    var first=points[0],last=points[points.length-1];
    [[left,bucketLabel(first.key,parent.dataset.period)],[right,bucketLabel(last.key,parent.dataset.period)]].forEach(function(pair){var txt=document.createElementNS(ns,'text');txt.setAttribute('x',pair[0]);txt.setAttribute('y','171');txt.setAttribute('fill','#aebdcc');txt.setAttribute('font-size','10');txt.setAttribute('text-anchor',pair[0]===left?'start':'end');txt.textContent=pair[1];svg.appendChild(txt)});
    var axisTop=document.createElementNS(ns,'text');axisTop.setAttribute('x','4');axisTop.setAttribute('y','23');axisTop.setAttribute('fill','#aebdcc');axisTop.setAttribute('font-size','9');axisTop.textContent=number(kind==='speed'?min:max,kind==='speed'?2:1);svg.appendChild(axisTop);
    var axisBottom=document.createElementNS(ns,'text');axisBottom.setAttribute('x','4');axisBottom.setAttribute('y','147');axisBottom.setAttribute('fill','#aebdcc');axisBottom.setAttribute('font-size','9');axisBottom.textContent=number(kind==='speed'?max:min,kind==='speed'?2:1);svg.appendChild(axisBottom);
    parent.appendChild(svg);
    var foot=node('p',points.length+' training period'+(points.length===1?'':'s')+' · '+(kind==='speed'?'lower time is faster':'estimated strength from logged weight and reps'),'mwpi-chart-note');parent.appendChild(foot);
  }
  function style(){
    if(document.getElementById('mwpi-style'))return;
    var s=node('style');s.id='mwpi-style';s.textContent=`#mw-performance-progression{margin:18px 0 24px;padding:18px;border:1px solid #9b7a39;border-radius:18px;background:#101b29;color:#f7f5ef;font:14px system-ui}#mw-performance-progression h2{font-size:19px;letter-spacing:.05em;color:#f3c768;margin:0 0 6px}#mw-performance-progression .mwpi-sub{color:#aebdcc;margin:0 0 14px}#mw-performance-progression h3{color:#f1c466;font-size:15px;margin:18px 0 9px}.mwpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px}.mwpi-card,.mwpi-panel{background:#0a1521;border:1px solid #334657;border-radius:12px;padding:12px;margin:8px 0}.mwpi-card strong{display:block;font-size:17px}.mwpi-card small{display:block;color:#afbecd;margin-top:5px}.mwpi-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin:10px 0}.mwpi-controls label{display:block;color:#afbecd;font-size:11px}.mwpi-controls select{width:100%;margin-top:5px;padding:9px 10px;border:1px solid #405568;border-radius:8px;background:#0a1521;color:#f7f5ef;font-size:14px}.mwpi-chart{display:block;width:100%;height:auto;min-height:150px}.mwpi-empty,.mwpi-note,.mwpi-chart-note{color:#b8c5d1;font-size:12px;line-height:1.45}.mwpi-note{border-left:3px solid #b99a50;padding:8px 10px;background:#0a1521}.mwpi-result{color:#f3c768;font-weight:800;margin:4px 0}.mwpi-legend{color:#aebdcc;font-size:11px;margin:3px 0 0}@media(max-width:420px){#mw-performance-progression{padding:14px}.mwpi-controls{grid-template-columns:1fr 1fr}}`;
    document.head.appendChild(s);
  }
  function mount(){
    var view=document.getElementById('progress');
    if(!view||document.getElementById('mw-performance-progression'))return false;
    style();
    var section=node('section');section.id='mw-performance-progression';section.setAttribute('aria-labelledby','mwpi-title');
    section.appendChild(node('h2','MY PERFORMANCE PROGRESSION'));section.querySelector('h2').id='mwpi-title';
    section.appendChild(node('p','Speed • Strength • Training consistency','mwpi-sub'));
    var content=node('div','Loading your saved performances…');content.id='mwpi-content';section.appendChild(content);
    var hero=view.querySelector('.mwProgressHero');
    if(hero)hero.insertAdjacentElement('afterend',section);else view.appendChild(section);
    var load=function(attempt){
      var s=session();
      if(!s||!s.access_token){
        if(attempt<20){content.textContent='Loading your saved performances…';setTimeout(function(){load(attempt+1)},400);return}
        content.textContent='Your saved progression will appear here when your athlete session is ready. Reopen Progression to try again.';return
      }
      content.textContent='Loading your saved performances…';
      fetch((window.MW_SUPABASE_URL||base)+'/rest/v1/rpc/mw_get_performance_progression_history',{method:'POST',headers:{apikey:window.MW_SUPABASE_KEY||key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:'{}',cache:'no-store'})
        .then(async function(r){var d=await r.json();if(!r.ok)throw Error(d.message||'Unable to load progression');return d})
        .then(render).catch(function(error){content.textContent='Progression unavailable right now: '+error.message});
    };
    window.MW_REFRESH_PERFORMANCE_PROGRESSION=function(){load(0)};
    load(0);
    return true;
  }
  function render(data){
    var content=document.getElementById('mwpi-content');if(!content||!content.isConnected)return;
    content.replaceChildren();
    if(data.status==='no_profile'){content.appendChild(node('p','Finish your athlete profile to start tracking progression.','mwpi-empty'));return}
    var sprint=Array.isArray(data.speed_history)?data.speed_history:[];
    var strength=Array.isArray(data.strength_history)?data.strength_history:[];
    var consistency=data.consistency||{};
    var eligible=sprint.filter(function(row){return row.speed_test_eligible===true});
    var comparable=new Map();eligible.forEach(function(row){var key=Number(row.distance_m)+'|'+row.intent_group;if(!comparable.has(key))comparable.set(key,[]);comparable.get(key).push(row)});
    var speedChanges=[];comparable.forEach(function(rows,key){
      var sessions=sessionPoints(rows,function(){return true});
      var first=Number(sessions[0]?.value),last=Number(sessions.at(-1)?.value);
      if(sessions.length>1&&first>0)speedChanges.push({key:key,percent:(first-last)/first*100,seconds:first-last});
    });
    var liftGroups=new Map();strength.forEach(function(row){var key=row.exercise+'|'+row.unit;if(!liftGroups.has(key))liftGroups.set(key,[]);liftGroups.get(key).push(row)});
    var strengthChanges=[];liftGroups.forEach(function(rows,key){
      var days=new Map();rows.forEach(function(row){var d=dateOf(row);if(!d)return;var id=[row.training_cycle_key||'',row.program_week||'',row.program_day||'',dayKey(d)].join('|'),v=Number(row.estimated_1rm),old=days.get(id);if(v>0&&(!old||v>old.value))days.set(id,{value:v,date:d})});
      var ordered=[...days.values()].sort(function(a,b){return a.date-b.date});
      if(ordered.length>1&&ordered[0].value>0)strengthChanges.push((ordered.at(-1).value-ordered[0].value)/ordered[0].value*100);
    });
    var cards=node('div',null,'mwpi-grid');
    var speedText=speedChanges.length?number(speedChanges.reduce(function(a,b){return a+b.percent},0)/speedChanges.length,1)+'% average comparable change':eligible.length+' speed-focused rep'+(eligible.length===1?'':'s')+' logged';
    var strengthText=strengthChanges.length?number(strengthChanges.reduce(function(a,b){return a+b},0)/strengthChanges.length,1)+'% average estimated change':strength.length+' strength set'+(strength.length===1?'':'s')+' logged';
    var weeks=Number(consistency.program_weeks||0),done=Number(consistency.completed_workouts||0);
    [[speedText,'Speed tests compare the same distance and session purpose.'],[strengthText,'Strength uses estimated 1RM from recorded sets of 1–12 reps.'],[done?done+' completed workout'+(done===1?'':'s'):'No completed workouts recorded',done?weeks+' of 41 program weeks with a completed workout':'Training consistency will appear after a workout is completed.']].forEach(function(item){var c=node('div',null,'mwpi-card');c.appendChild(node('strong',item[0]));c.appendChild(node('small',item[1]));cards.appendChild(c)});
    content.appendChild(cards);
    if(!speedChanges.length&&!strengthChanges.length)content.appendChild(node('p','Baseline still building. Record at least two matching speed sessions or two sessions of the same lift to calculate change. No improvement is estimated from unrelated workouts.','mwpi-note'));
    renderSprint(content,sprint);renderStrength(content,strength);
    content.appendChild(node('p','Tempo and technical work stay visible in their own categories. Their times are not treated as maximum-speed improvements. Estimated strength values are training indicators, not measured personal records.','mwpi-note'));
  }
  function control(parent,title,values,value,onChange){
    var wrap=node('label',title);var select=node('select');
    values.forEach(function(item){var option=node('option',item.label);option.value=item.value;option.selected=item.value===value;select.appendChild(option)});
    select.addEventListener('change',function(){onChange(select.value)});wrap.appendChild(select);parent.appendChild(wrap);return select;
  }
  function renderSprint(root,rows){
    root.appendChild(node('h3','⚡ SPRINT PROGRESSION'));
    if(!rows.length){root.appendChild(node('p','No sprint results saved yet. Results will appear here after a timed session.','mwpi-empty'));return}
    var cats=groupOptions(rows),distances=[...new Set(rows.map(function(r){return Number(r.distance_m)}).filter(Number.isFinite))].sort(function(a,b){return a-b});
    var firstCategory=cats.find(function(g){return speedEligible.has(g)})||cats[0],category=firstCategory,distance=String(distances[0]||''),period='week';
    var controls=node('div',null,'mwpi-controls');root.appendChild(controls);
    var graph=node('div',null,'mwpi-panel');graph.dataset.period=period;root.appendChild(graph);
    var redraw=function(){
      graph.replaceChildren();graph.dataset.period=period;
      var selected=rows.filter(function(r){return r.intent_group===category&&String(r.distance_m)===distance});
      var points=bySession(selected,function(){return true},period);
      var title=names[category]+' · '+distance+'m';drawChart(graph,points,'speed',title);
      if(speedEligible.has(category)){
        var reps=selected.filter(function(r){return Number(r.time_seconds)>0}).sort(function(a,b){return new Date(a.recorded_at)-new Date(b.recorded_at)});
        var sessions=new Map();reps.forEach(function(r){var d=dateOf(r);if(d){var k=[r.workout_cycle_id||'',r.workout_key||'',r.program_week||'',r.program_day||'',dayKey(d)].join('|'),old=sessions.get(k);if(!old||Number(r.time_seconds)<Number(old.time_seconds))sessions.set(k,r)}});
        var items=[...sessions.values()].sort(function(a,b){return new Date(a.recorded_at)-new Date(b.recorded_at)});
        if(items.length>1){var base=Number(items[0].time_seconds),latest=Number(items.at(-1).time_seconds),best=Math.min.apply(null,items.map(function(i){return Number(i.time_seconds)})),delta=base-latest,pct=base?(delta/base*100):0;
          graph.appendChild(node('p','First '+number(base)+'s · Latest '+number(latest)+'s · Best '+number(best)+'s'+(delta>0?' · '+number(delta)+'s faster ('+number(pct,1)+'%)':delta<0?' · '+number(Math.abs(delta))+'s slower ('+number(Math.abs(pct),1)+'%)':' · holding steady'),'mwpi-result'));
        }else graph.appendChild(node('p','Record another matching speed session to compare first and latest performance.','mwpi-legend'));
      }else{
        var targeted=selected.filter(function(r){return (Number(r.target_min_seconds)>0||Number(r.target_max_seconds)>0||Number(r.target_seconds)>0)&&r.pace_status});
        var execution=targeted.length?' · '+targeted.filter(function(r){return r.pace_status==='on_pace'}).length+'/'+targeted.length+' logged reps in prescribed range':'';
        graph.appendChild(node('p','These sessions are shown for context. A faster time is not automatically an improvement for '+names[category].toLowerCase()+execution+'.','mwpi-legend'));
      }
    };
    control(controls,'Session purpose',cats.map(function(g){return {label:names[g],value:g}}),category,function(v){category=v;redraw()});
    control(controls,'Distance',distances.map(function(v){return {label:v+'m',value:String(v)}}),distance,function(v){distance=v;redraw()});
    control(controls,'Compare by',[{label:'Program week',value:'week'},{label:'Calendar month',value:'month'}],period,function(v){period=v;redraw()});
    redraw();
  }
  function renderStrength(root,rows){
    root.appendChild(node('h3','🏋️ STRENGTH PROGRESSION'));
    if(!rows.length){root.appendChild(node('p','No saved strength sets yet. Log actual weight and reps to see lift progression.','mwpi-empty'));return}
    var exercises=[...new Set(rows.map(function(r){return r.exercise+'|'+r.unit}))].sort();
    var selected=exercises[0],period='week',controls=node('div',null,'mwpi-controls'),graph=node('div',null,'mwpi-panel');graph.dataset.period=period;root.appendChild(controls);root.appendChild(graph);
    var redraw=function(){
      graph.replaceChildren();graph.dataset.period=period;
      var item=selected.split('|'),exercise=item[0]+'|'+item[1],points=strengthSessions(rows,exercise,period);
      drawChart(graph,points,'strength',item[0]+' estimated strength progression');
      var sets=rows.filter(function(r){return r.exercise+'|'+r.unit===exercise}).sort(function(a,b){return new Date(a.recorded_at)-new Date(b.recorded_at)});
      var days=new Map();sets.forEach(function(r){var d=dateOf(r);if(!d)return;var k=[r.training_cycle_key||'',r.program_week||'',r.program_day||'',dayKey(d)].join('|'),prior=days.get(k),n=Number(r.estimated_1rm);if(!prior||n>Number(prior.estimated_1rm))days.set(k,r)});
      var ordered=[...days.values()].sort(function(a,b){return new Date(a.recorded_at)-new Date(b.recorded_at)});
      if(ordered.length>1){var first=Number(ordered[0].estimated_1rm),last=Number(ordered.at(-1).estimated_1rm),gain=last-first,pct=first?gain/first*100:null;
        graph.appendChild(node('p','First '+number(first,1)+' '+item[1]+' · Latest '+number(last,1)+' '+item[1]+' estimated 1RM'+(pct!=null?' · '+(gain>=0?'+':'')+number(pct,1)+'%':'')+' · Latest logged '+ordered.at(-1).weight+' '+item[1]+' × '+ordered.at(-1).reps,'mwpi-result'));
      }else graph.appendChild(node('p','Record the same lift in another training session to compare strength.','mwpi-legend'));
    };
    control(controls,'Exercise',exercises.map(function(e){var p=e.split('|');return {label:p[0]+' ('+p[1]+')',value:e}}),selected,function(v){selected=v;redraw()});
    control(controls,'Compare by',[{label:'Program week',value:'week'},{label:'Calendar month',value:'month'}],period,function(v){period=v;redraw()});
    redraw();
  }
  function start(){
    var nav=document.querySelector('.nav button[data-v="progress"]');
    if(nav){nav.setAttribute('aria-label','Progression');var label=nav.querySelector('span');if(label)label.textContent='Progression';nav.addEventListener('click',function(){setTimeout(function(){window.MW_REFRESH_PERFORMANCE_PROGRESSION?.()},0)})}
    if(mount())return;
    var observer=new MutationObserver(function(){if(mount())observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true});setTimeout(function(){observer.disconnect()},12000)
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
