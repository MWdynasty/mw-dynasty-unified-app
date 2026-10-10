'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('coach/app.js','utf8');
assert.equal(source,fs.readFileSync('coach/app-live-20261005-r1.js','utf8'));
const archiveSource=source.slice(source.indexOf('function confirmCoachGroupArchive('),source.indexOf('async function groupWorkspaceLive('));
assert.ok(!archiveSource.includes('window.confirm('),'Archive must work without native browser dialogs');
async function run(){
 if(!process.env.MW_PRACTICE_DOM_PATH){console.log('PASS: live archive code parity and native-dialog independence');return;}
 const {Window}=await import(process.env.MW_PRACTICE_DOM_PATH),win=new Window();
 try{
  const q=id=>win.document.getElementById(id);let writes=0,refreshes=0,fail=false,record={id:'group',name:'Group 1',event_group:'Sprints',description:'Original'};
  win.PLANS={pilot:{theme:'pilot',name:'Coach Velocity'}};win.experience='pilot';
  win.escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  win.eval(source.slice(source.indexOf('function mwModal('),source.indexOf('function mwStore(')));
  win.mwCurrentUser=async()=>({id:'coach'});win.logCoachAction=async()=>{};win.toast=()=>{};win.teamsPage=()=>{refreshes++};
  win.liveGroupMembers=async()=>[];win.fetchCoachRoster=async()=>({athletes:[]});
  win.sbRest=async(path,options)=>{if(!options)return [{...record}];writes++;if(fail)throw Error('Connection failed. Please retry.');assert.equal(options.method,'PATCH');assert.ok(path.includes('coach_user_id=eq.coach'));Object.assign(record,options.body);return [{...record}]};
  win.confirm=()=>{throw Error('Native dialog must never be called')};
  win.eval(source.slice(source.indexOf('function editCoachGroup('),source.indexOf('async function groupWorkspaceLive(')));
  const start=source.indexOf('async function groupWorkspaceLive('),end=source.indexOf('\n}',start)+2;win.eval(source.slice(start,end));
  await win.groupWorkspaceLive('group');
  let pending=q('archiveGroup').onclick();assert.ok(q('confirmGroupArchive'));assert.equal(writes,0);assert.equal(q('archiveGroup').disabled,true);
  await q('archiveGroup').onclick();assert.equal(win.document.querySelectorAll('#groupArchiveConfirm').length,1);
  q('cancelGroupArchive').click();await pending;assert.equal(writes,0);assert.equal(q('archiveGroup').disabled,false);
  pending=q('archiveGroup').onclick();q('confirmGroupArchive').click();await pending;assert.equal(writes,1);assert.equal(refreshes,1);assert.equal(q('mwModal'),null);
  await win.groupWorkspaceLive('group');fail=true;pending=q('archiveGroup').onclick();q('confirmGroupArchive').click();await pending;
  assert.match(q('groupArchiveStatus').textContent,/Connection failed/);assert.equal(q('archiveGroup').disabled,false);assert.ok(q('mwModal'));
  fail=false;pending=q('archiveGroup').onclick();q('confirmGroupArchive').click();await pending;assert.equal(refreshes,2);
  await win.groupWorkspaceLive('group');pending=q('archiveGroup').onclick();win.document.querySelector('[data-close-modal]').click();await pending;assert.equal(q('mwModal'),null);
  record.archived=false;await win.groupWorkspaceLive('group');q('editGroup').click();assert.equal(q('editGroupName').value,'Group 1');
  q('editGroupName').value='';await q('saveGroupEdit').onclick();assert.equal(q('groupEditStatus').textContent,'Group name required');
  q('editGroupName').value='New name';q('editGroupEvent').value='400m';q('editGroupDescription').value='Updated';
  fail=true;await q('saveGroupEdit').onclick();assert.match(q('groupEditStatus').textContent,/Connection failed/);assert.equal(q('saveGroupEdit').disabled,false);
  fail=false;const saving=q('saveGroupEdit').onclick();await q('saveGroupEdit').onclick();await saving;
  assert.equal(record.name,'New name');assert.equal(record.event_group,'400m');assert.equal(record.description,'Updated');
  assert.equal(q('mwModal').querySelector('h2').textContent,'New name');
  q('editGroup').click();q('editGroupName').value='Cancelled change';q('cancelGroupEdit').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(record.name,'New name');
  console.log('PASS: actual Archive button: inline confirm, cancel/close without writes, duplicate tap protection, successful refresh, visible failure and retry without native dialogs.');
 }finally{await win.happyDOM.abort()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
