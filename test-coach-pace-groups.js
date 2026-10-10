'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('coach/app.js','utf8');
const clusterSource=source.slice(source.indexOf('function mwCoachClusterByPr('),source.indexOf('async function pacingPage()'));
const scope={};vm.createContext(scope);vm.runInContext(clusterSource,scope);
const row=(target,pr=10,name=String(target))=>({target,pr,athlete:{name}});
const groups=scope.mwCoachClusterByPr([row(20.5,9),row(20,12),row(21.1,8),row(20.3,11)],3,4);
assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g=>g.map(x=>x.target)))),[[20,20.3,20.5],[21.1]],'group by rep target, not reference PR');
assert.equal(scope.mwCoachClusterByPr([row(20),row(20.5),row(20.9)],3,4).length,2,'full group spread stays inside tolerance; no average chaining');
assert.equal(scope.mwCoachClusterByPr(Array.from({length:9},()=>row(20)),3,4).length,3);
assert.equal(scope.mwCoachClusterByPr([row(NaN),row(0),row(-1),row(20)],3,4)[0].length,1);

async function run(){
 if(!process.env.MW_PRACTICE_DOM_PATH){console.log('PASS: target-time grouping, strict spread, capacity and invalid-time guards.');return;}
 const {Window}=await import(process.env.MW_PRACTICE_DOM_PATH),win=new Window({url:'https://fixture.invalid/coach/'});
 try{
  win.eval(fs.readFileSync('lib/mw-pace-model.js','utf8'));
  const athletes=Array.from({length:16},(_,i)=>({id:'athlete-'+i,name:'Runner '+i,competition_division:i<8?'boys':'girls',prs:[{event:'100m',time_seconds:10+(i%8)*.04}]}));
  athletes.push({id:'missing-division',name:'Division Needed',prs:[{event:'100m',time_seconds:11}]},{id:'missing-pr',name:'Trial Needed',competition_division:'open',prs:[]});
  let saved=[],opened=[],failAt=0;
  win.pageBase=(title,subtitle,html)=>{win.document.body.innerHTML=html;};
  win.fetchCoachRoster=async()=>({athletes});win.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  win.toast=()=>{};win.openPage=id=>opened.push(id);win.confirm=()=>true;
  win.mwCurrentUser=async()=>({id:'coach-fixture'});win.SUPABASE_URL='https://fixture.invalid';
  win.MWCoachTimingTools={mountStopwatch(){}};
  win.sbRest=async(path,options)=>{if(!options)return saved.map(g=>({id:g.id,name:g.name,coach_group_members:g.ids.map(athlete_id=>({athlete_id}))}));if(failAt&&saved.length===failAt){failAt=0;throw Error('Fixture network failure');}const p=options.body;assert.equal(path,'rpc/mw_coach_save_training_group');const existing=saved.find(g=>g.id===p.p_group_id);if(existing){existing.ids=p.p_athlete_ids;}else saved.push({id:'group-'+saved.length,name:p.p_name,ids:p.p_athlete_ids});return {id:saved.at(-1).id};};
  win.eval('function mwCoachPracticeRecommendedTarget(a,d,i){return window.MWPace.calculate(a.prs,d,i/100)?.target||null;}\n'+clusterSource+source.slice(source.indexOf('async function pacingPage()'),source.indexOf('const MW_FIELD_CIRCUIT_REFERENCE')));
  await win.pacingPage();const q=id=>win.document.getElementById(id);
  assert.equal(q('coachPacingWhistle'),null,'whistle is removed from Pacing Tools');assert.equal(q('coachWhistleStatus'),null);
  assert.equal(win.document.querySelectorAll('.coach-pace-group-card').length,4,'groups are ready without Build click');
  assert.match(q('groupPaceResults').textContent,/Boys 1/);assert.match(q('groupPaceResults').textContent,/Girls 2/);
  assert.match(q('groupPaceResults').textContent,/Division Needed/);assert.match(q('groupPaceResults').textContent,/Trial Needed/);
  assert.equal(win.document.querySelectorAll('.coach-pace-athletes strong').length,16);
  assert.equal(q('coachSprintPace').hidden,true);assert.equal(q('paceToolsPanel').hidden,true);
  assert.equal(q('jumpSprintPace'),null);assert.equal(q('openCoachStopwatch'),null,'no redundant Open shortcut above the stopwatch itself');
  q('paceToolsTab').click();assert.equal(q('paceToolsPanel').hidden,false);assert.equal(q('coachGroupPaceAI').hidden,true);
  q('paceGroupTab').click();q('groupPaceIntensity').value='0';q('groupPaceIntensity').onchange();assert.equal(q('savePaceGroups').disabled,true);
  q('groupPaceIntensity').value='90';q('groupPaceIntensity').onchange();assert.equal(q('savePaceGroups').disabled,false);
  failAt=2;await q('savePaceGroups').onclick();assert.equal(saved.length,2);assert.equal(opened.length,0);assert.match(q('paceSaveStatus').textContent,/Retry/);
  await q('savePaceGroups').onclick();assert.equal(saved.length,4);assert.deepEqual(opened,['practice']);assert.equal(win.__mwCoachPaceGroupHandoff.groupId,'group-0');
  await q('savePaceGroups').onclick();assert.equal(saved.length,4,'retry / reopen does not duplicate groups');
  assert.equal(new Set(saved.flatMap(g=>g.ids)).size,16,'all eligible athletes saved exactly once');
  assert.ok(saved.every(g=>g.ids.length<=4));
  console.log('PASS: real Group Pace UI auto-builds 16 athletes / 4 groups, shows names and targets, flags omissions, switches tabs, rejects invalid input, saves and retries without duplicates.');
 }finally{await win.happyDOM.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
