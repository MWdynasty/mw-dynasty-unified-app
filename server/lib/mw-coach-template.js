'use strict';
const {randomUUID}=require('node:crypto');
const {days}=require('../../lib/mw-coach-program');
const headers=['Week','Day','Workout title','Session type','Warm-up','Workout','Sets','Reps','Distance (m)','Effort (%)','Rep rest (seconds)','Set rest (seconds)','Recovery notes','Cool-down'];
const clean=v=>String(v??'').trim();
const fail=message=>{throw Object.assign(new Error(message),{status:422});};
// Read coach template columns directly. Instructions and example sheets are never prescriptions.
function readTemplate(fileName,mimeType,buffer){
 if(!/\.(xlsx|xls|csv)$/i.test(fileName)&&!/spreadsheet|excel|csv/i.test(mimeType))return null;
 const XLSX=require('xlsx'),wb=XLSX.read(buffer,{type:'buffer',cellNF:true,raw:true});
 const name=wb.SheetNames.find(n=>n.toLowerCase()==='workouts')||(/\.csv$/i.test(fileName)||/csv/i.test(mimeType)?wb.SheetNames[0]:null);
 if(!name)return null;
 const sheet=wb.Sheets[name],range=XLSX.utils.decode_range(sheet['!ref']||'A1');
 let headerRow=-1,columns=[];
 for(let row=range.s.r;row<=Math.min(range.e.r,range.s.r+10);row++){
  const found=[];for(let col=range.s.c;col<=range.e.c;col++)found.push(clean(sheet[XLSX.utils.encode_cell({r:row,c:col})]?.v).toLowerCase());
  if(headers.every(h=>found.includes(h.toLowerCase()))){headerRow=row;columns=headers.map(h=>found.indexOf(h.toLowerCase())+range.s.c);break;}
  if(['Week','Day','Workout title','Session type'].filter(h=>found.includes(h.toLowerCase())).length>=3)fail('Keep all template column headers. Missing: '+headers.filter(h=>!found.includes(h.toLowerCase())).join(', ')+'. Download a fresh template if needed.');
 }
 if(headerRow<0)return null;
 if(range.e.r-headerRow>6000)fail('Keep the Workouts sheet to 6,000 rows or fewer.');
 const sessions=[],groups=new Map();
 for(let row=headerRow+1;row<=range.e.r;row++){
  const cells=columns.map(c=>sheet[XLSX.utils.encode_cell({r:row,c})]),v=cells.map(c=>c?.v);
  if(v.every(x=>!clean(x))&&!cells.some(c=>c?.f))continue;
  const label='Workouts row '+(row+1)+': ';
  if(cells.some(c=>c?.t==='e'||(c?.f&&c.v==null)))fail(label+'replace spreadsheet errors or unevaluated formulas with your workout values.');
  const number=(i,min,max,integer=false)=>{
   if(!clean(v[i]))return null;
   let n=Number(v[i]);
   if(i===9&&typeof v[i]==='string'&&/^\d+(?:\.\d+)?%$/.test(clean(v[i])))n=Number(clean(v[i]).slice(0,-1));
   else if(i===9&&typeof v[i]==='number'&&/%/.test(cells[i]?.z||''))n*=100;
   if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))fail(label+headers[i]+' must be '+(integer?'a whole number ':'a number ')+min+'–'+max+'.');
   return n;
  };
  const week=number(0,1,41,true),day=days.findIndex(d=>d.toLowerCase()===clean(v[1]).toLowerCase())+1,title=clean(v[2]),type=clean(v[3]).toLowerCase();
  if(!week||!day||!title)fail(label+'enter a week (1–41), weekday name, and workout title.');
  if(!['timed','untimed','rest'].includes(type))fail(label+'choose Timed, Untimed, or Rest in Session type.');
  if(type!=='timed'&&v.slice(6,12).some(x=>clean(x)))fail(label+'sets, reps, distance, effort and timed rest belong to a Timed session. Choose Timed or clear those columns.');
  const key=JSON.stringify([week,day,title]),fields={warmup:clean(v[4]),recovery:clean(v[12]),cooldown:clean(v[13])};
  let s=groups.get(key);
  if(!s){s={id:randomUUID(),week,day,title,...fields,work:'',blocks:[],manualOnly:type!=='timed',templateType:type};groups.set(key,s);sessions.push(s);}
  else{
   if(s.templateType!==type)fail(label+'use the same Session type for every part of '+title+'.');
   for(const k of Object.keys(fields)){if(fields[k]&&s[k]&&fields[k]!==s[k])fail(label+'use one '+k+' value for this workout, or give it a different title.');if(fields[k])s[k]=fields[k];}
  }
  let work=clean(v[5]);
  if(type==='timed'){
   const b={id:randomUUID(),sets:number(6,1,200,true),reps:number(7,1,200,true),distance:number(8,1,10000,true),intensityPct:number(9,1,100),restSeconds:number(10,0,3600),setRestSeconds:number(11,0,3600)};
   if(b.sets*b.reps>200)fail(label+'keep each workout part to 200 total reps or fewer.');
   s.blocks.push(b);
   if(!work)work=[b.sets==null?'Sets need your answer':b.sets+' sets',b.reps==null?'reps need your answer':b.reps+' reps',b.distance==null?'distance needs your answer':b.distance+'m'].join(' × ')+(b.intensityPct==null?'':' at '+b.intensityPct+'%');
  }else if(type==='rest'){s.autoNonTimed=true;if(!work)work='Rest day.';}
  if(work&&!s.work.split('\n').includes(work))s.work+=(s.work?'\n':'')+work;
  if(s.blocks.length>20||sessions.length>287)fail(label+'keep programs to 287 workout days and 20 timed parts per day.');
 }
 if(!sessions.length)fail('The Workouts sheet is empty. Fill in at least one workout row, save the file, and upload it again.');
 sessions.sort((a,b)=>a.week-b.week||a.day-b.day);
 const value=(n,unit='')=>n==null?'not specified':n+unit;
 const programText=sessions.map(s=>['Week '+s.week,days[s.day-1]+' | '+s.title,'Session type: '+s.templateType,s.warmup?'Warm-up: '+s.warmup:'','Main session: '+s.work,...s.blocks.map((b,i)=>'Workout part '+(i+1)+': Sets='+value(b.sets)+'; Reps='+value(b.reps)+'; Distance='+value(b.distance,'m')+'; Effort='+value(b.intensityPct,'%')+'; Rep rest='+value(b.restSeconds,'s')+'; Set rest='+value(b.setRestSeconds,'s')),s.recovery?'Recovery: '+s.recovery:'',s.cooldown?'Cool-down: '+s.cooldown:''].filter(Boolean).join('\n')).join('\n\n');
 sessions.forEach(s=>delete s.templateType);
 return {sessions,programText,structured:true};
}
module.exports={headers,readTemplate};
