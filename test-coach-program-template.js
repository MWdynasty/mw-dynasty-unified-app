'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),XLSX=require('xlsx');
const {headers,readTemplate}=require('./server/lib/mw-coach-template'),program=require('./lib/mw-coach-program');
const file=fs.readFileSync('assets/templates/MW_Dynasty_Coach_Workout_Template.xlsx');
const book=XLSX.read(file,{type:'buffer',cellNF:true});
assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets.Workouts,{header:1})[0],headers);
assert.throws(()=>readTemplate('template.xlsx','',file),/Workouts sheet is empty/);
// CSV inputs exercise the same template mapping without authoring another workbook.
const csv=rows=>headers.join(',')+'\n'+rows.map(row=>row.map(v=>JSON.stringify(v??'')).join(',')).join('\n');
const rows=[
 [1,'Monday','Speed','Timed','Easy movement','First part',2,3,60,85,120,300,'Walk between reps','Easy walk'],
 [1,'Monday','Speed','Timed','','Second part',1,4,100,'80%',0,'','',''],
 [1,'Wednesday','Recovery','Untimed','','Easy walking'],
 [2,'Sunday','Rest day','Rest'],
 [3,'Friday','Missing rest','Timed','','',1,2,60],
];
const result=readTemplate('coach.csv','text/csv',Buffer.from(csv(rows)));
assert.equal(result.structured,true);assert.equal(result.sessions.length,4);
const s=result.sessions[0];assert.equal(s.blocks.length,2);assert.equal(s.blocks[0].restSeconds,120);assert.equal(s.blocks[0].setRestSeconds,300);assert.equal(s.blocks[1].restSeconds,0);assert.equal(s.blocks[1].setRestSeconds,null);assert.equal(s.blocks[1].intensityPct,80);assert.equal(s.work,'First part\nSecond part');
assert.equal(result.sessions[1].manualOnly,true);assert.equal(result.sessions[2].manualOnly,true);assert.equal(result.sessions[3].blocks[0].restSeconds,null);assert.match(program.validate(result.sessions).join(' '),/enter rep rest/);
const roundtrip=program.parse(result.programText);
for(let i=0;i<roundtrip.length;i++)assert.deepEqual(roundtrip[i].blocks.map(({id,...b})=>b),result.sessions[i].blocks.map(({id,...b})=>b));
assert.equal(roundtrip[1].manualOnly,true);assert.equal(roundtrip[2].manualOnly,true);
assert.equal(roundtrip[2].work,'Rest day.');
const serialized=program.parse(program.serialize(result.sessions));assert.equal(serialized[2].work,'Rest day.');assert.deepEqual(serialized[0].blocks.map(({id,...b})=>b),s.blocks.map(({id,...b})=>b));
for(const [changed,error] of [
 [[1,'Monday','Speed','Rest','','',1],/row 2: sets/],
 [[1,'Monday','Speed','Guess'],/Session type/],
 [[1,'Wrong','Speed','Timed'],/weekday/],
 [[1,'Monday','Speed','Timed','','',1,2,'60m'],/Distance/],
 [[1,'Monday','Speed','Timed','','',2,200,60],/200 total/],
 ])assert.throws(()=>readTemplate('coach.csv','',Buffer.from(csv([changed]))),error);
assert.throws(()=>readTemplate('coach.csv','',Buffer.from(csv([rows[0],rows[1].map((v,i)=>i===4?'Different warm-up':v)]))),/warmup/);
assert.equal(readTemplate('old.csv','text/csv',Buffer.from('Monday,Speed\n6 x 100m')),null);
assert.equal(readTemplate('old.txt','text/plain',Buffer.from('Monday | Speed')),null);
// The authenticated route returns direct columns without invoking AI formatting or consent reads.
const authPath=require.resolve('./server/lib/mw-coach-auth'),consentPath=require.resolve('./server/lib/mw-ai-consent');
require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{getAccountContext:async()=>({profile:{role:'coach'}})}};
require.cache[consentPath]={id:consentPath,filename:consentPath,loaded:true,exports:{permissions:async()=>{throw Error('Template must not call AI consent')}}};
const handler=require('./server/api/coach/program-import');
async function run(){let status,data;const res={setHeader(){},status(s){status=s;return this},json(d){data=d;return d}};
 await handler({method:'POST',body:{fileName:'Coach_Plan.csv',mimeType:'text/csv',dataBase64:Buffer.from(csv(rows)).toString('base64')}},res);
 assert.equal(status,200);assert.equal(data.sessions[0].blocks[1].restSeconds,0);assert.equal(data.suggestedName,'Coach Plan');assert.equal(data.warning,null);
 await handler({method:'POST',body:{fileName:'template.xlsx',dataBase64:file.toString('base64')}},res);assert.equal(status,422);assert.match(data.error,/empty/);
 console.log('PASS: downloadable XLSX headers; template CSV direct import, multiple parts, zero/blank rest, percentages, recovery/rest, readable text round-trip, row errors, legacy fallback and authenticated route without AI.');
}run().catch(e=>{console.error(e);process.exitCode=1});
