'use strict';

const TRACK_FIELDS = ['title','focus','warmup','prescribedWork','recovery','intensity','coachNote'];
const MAX_TEXT = 500;

function safeText(value){
  if(typeof value!=='string')return null;
  const clean=value.replace(/<[^>]*>/g,'').replace(/[<>]/g,'').trim();
  return clean&&clean.length<=MAX_TEXT?clean:null;
}

function applyAdaptivePrescription(track,strength,review){
  const prescription=review?.approved_prescription;
  if(!prescription||typeof prescription!=='object'||Array.isArray(prescription))return {track,strength,applied:null};
  let nextTrack=track,nextStrength=strength,applied={reviewId:review.id||null,status:review.review_status,week:Number(review.program_week),day:Number(review.program_day),kind:review.session_kind,track:false,strength:false};
  const patch=prescription.track;
  if(track&&patch&&typeof patch==='object'&&!Array.isArray(patch)){
    const day=Number(review.program_day),sessions=Array.isArray(track.sessions)?track.sessions:[];
    const index=sessions.findIndex(s=>Number(s.day)===day);
    if(index>=0){
      const session={...sessions[index]};let changed=false;
      for(const field of TRACK_FIELDS){const value=safeText(patch[field]);if(value){session[field]=value;changed=true}}
      if(changed){const updated=sessions.slice();updated[index]=session;nextTrack={...track,sessions:updated};applied.track=true}
    }
  }
  const strengthPatch=prescription.strength;
  if(strength&&strengthPatch&&typeof strengthPatch==='object'&&!Array.isArray(strengthPatch)){
    const sectionTitle=safeText(strengthPatch.sectionTitle),entries=strengthPatch.entries;
    if(sectionTitle&&Array.isArray(entries)&&entries.length>0&&entries.length<=12&&entries.every(row=>Array.isArray(row)&&row.length===2&&safeText(row[0])&&safeText(row[1]))){
      const sections=Array.isArray(strength.sections)?strength.sections:[];
      const index=sections.findIndex(section=>String(section.title||'').trim().toLowerCase()===sectionTitle.toLowerCase()&&Number(review.program_day)===strengthDayNumber(section.title));
      if(index>=0){const updated=sections.slice();updated[index]={...sections[index],entries:entries.map(row=>[safeText(row[0]),safeText(row[1])]),adaptiveReviewId:review.id||null};nextStrength={...strength,sections:updated};applied.strength=true}
    }
    const note=safeText(strengthPatch.coachNote);
    if(note){nextStrength={...(nextStrength||strength),coachNote:note};applied.strength=true}
  }
  return {track:nextTrack,strength:nextStrength,applied:applied.track||applied.strength?applied:null};
}

function strengthDayNumber(title){const x=String(title||'').trim().toUpperCase();if(x.startsWith('MON')||x.startsWith('EARLY WEEK'))return 1;if(x.startsWith('TUE'))return 2;if(x.startsWith('WED'))return 3;if(x.startsWith('THU'))return 4;if(x.startsWith('FRI')||x.startsWith('LATE WEEK'))return 5;if(x.startsWith('SAT'))return 6;if(x.startsWith('SUN'))return 7;return null}

module.exports={applyAdaptivePrescription,safeText};
