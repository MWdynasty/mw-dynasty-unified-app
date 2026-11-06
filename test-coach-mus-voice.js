'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const code=fs.readFileSync('coach/app-live-20261005-r1.js','utf8');
const start=code.indexOf('function mwCoachSpeechText('),end=code.indexOf('function coachMWPage(){',start);
assert.ok(start>=0&&end>start);
const {mwCoachSpeechText,mwCoachSpeechChunks}=new Function(code.slice(start,end)+';return {mwCoachSpeechText,mwCoachSpeechChunks};')();
const full=Array.from({length:120},(_,i)=>'Sentence '+(i+1)+' explains 200m bend mechanics and rhythm.').join(' ');
for(const mode of ['fast','standard']){
  const chunks=mwCoachSpeechChunks(full,mode);
  assert.ok(chunks.length>8,'No old eight-chunk truncation');
  assert.equal(chunks.join(' '),full,'All speech text is retained');
  assert.ok(chunks.every(c=>c.length<=600));
}
assert.equal(mwCoachSpeechText('### Curve\n- **Stay relaxed**.\n\n### Exit\n- Run smoothly.'),'Curve Stay relaxed. Exit Run smoothly.'); 
assert.match(code,/getChunk\(i\+1\)/,'Next audio chunk is prefetched during current playback');
assert.match(code,/activeVoiceAbort\.abort\(\)/,'Stop cancels pending requests');
assert.doesNotMatch(code,/return chunks\.slice\(0,8\)/,'No eight-chunk cap');
console.log('PASS: full-length Coach Mus voice, chunk prefetch, stop cancellation, and spoken Markdown cleanup');
