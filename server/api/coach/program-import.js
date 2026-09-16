const path=require('path');
const {getAccountContext}=require('../../lib/mw-coach-auth');

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];for(const item of data?.output||[])for(const c of item?.content||[])if((c?.type==='output_text'||c?.type==='text')&&c?.text)parts.push(c.text);return parts.join('\n').trim();
}
async function extractText(fileName,mimeType,buffer){
  const ext=path.extname(String(fileName||'')).toLowerCase();
  if(ext==='.pdf'||mimeType==='application/pdf'){
    const pdf=require('pdf-parse');const d=await pdf(buffer);return d.text||'';
  }
  if(ext==='.docx'||mimeType==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    const mammoth=require('mammoth');const d=await mammoth.extractRawText({buffer});return d.value||'';
  }
  if(['.xlsx','.xls'].includes(ext)||/spreadsheet|excel/.test(mimeType||'')){
    const XLSX=require('xlsx');const wb=XLSX.read(buffer,{type:'buffer'});return wb.SheetNames.map(n=>`# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n');
  }
  if(['.csv','.txt','.md'].includes(ext)||/^text\//.test(mimeType||''))return buffer.toString('utf8');
  throw Object.assign(new Error('Use PDF, Word (.docx), Excel (.xlsx/.xls), CSV, or TXT.'),{status:400});
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    const c=await getAccountContext(req);const role=String(c.profile.role||'');if(!['coach','admin','founder_owner'].includes(role))return res.status(403).json({error:'Coach access required'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const fileName=String(body.fileName||'program');const mimeType=String(body.mimeType||'');const b64=String(body.dataBase64||'');
    if(!b64)return res.status(400).json({error:'Choose a program file first.'});
    const buffer=Buffer.from(b64,'base64');if(buffer.length>3*1024*1024)return res.status(413).json({error:'Program file is too large. Keep it under 3 MB.'});
    let extracted=(await extractText(fileName,mimeType,buffer)).replace(/\u0000/g,'').trim();
    if(!extracted)return res.status(422).json({error:'No readable workout text was found in that file.'});
    extracted=extracted.slice(0,120000);
    let programText=extracted,suggestedType='track',warning=null;
    if(process.env.OPENAI_API_KEY){
      try{
        const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-sol',instructions:'You convert a coach-owned training document into a clean, editable MW Dynasty program draft. Preserve the coach\'s actual prescription. Do not invent workouts, sets, reps, distances, percentages, recovery, or exercises. Organize content by Week, Day, Session when those labels exist. Keep uncertain text clearly marked as unclear instead of guessing. Return plain text only.',input:[{role:'user',content:[{type:'input_text',text:`Filename: ${fileName}\n\nDOCUMENT:\n${extracted}`}]}],reasoning:{effort:'low'},max_output_tokens:5000})});
        const d=await r.json();if(r.ok){const out=outputText(d);if(out)programText=out}else warning=d?.error?.message||'AI formatting unavailable';
      }catch(e){warning='AI formatting unavailable; raw extracted text was loaded instead.'}
    }else warning='OpenAI key is unavailable; raw extracted text was loaded instead.';
    const lower=programText.toLowerCase();if(/squat|clean|deadlift|bench|strength|lift/.test(lower)&&!/sprint|meter|metre|accel|tempo|velocity/.test(lower))suggestedType='strength';else if(/squat|clean|deadlift/.test(lower)&&/sprint|meter|metre|accel|tempo|velocity/.test(lower))suggestedType='combined';
    const suggestedName=path.basename(fileName,path.extname(fileName)).replace(/[_-]+/g,' ').trim()||'Imported Program';
    return res.status(200).json({ok:true,suggestedName,suggestedType,programText,warning});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Program import failed.'})}
};
