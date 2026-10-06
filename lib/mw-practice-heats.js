(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MWPracticeHeats=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const uuid=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
  const pending=h=>!h.saved&&(h.runningAt!=null||h.repResults.length>0||h.results.length>0);
  class Session{
    constructor({coachId,date,clock=()=>Date.now(),draft=null}={}){
      this.coachId=coachId;this.date=date;this.clock=clock;this.heats={};this.active=null;
      if(draft&&draft.version===1&&draft.coachId===coachId&&draft.date===date){
        this.heats=draft.heats||{};this.active=draft.active||null;
        for(const h of Object.values(this.heats))if(h.runningAt!=null){h.elapsed=Math.max(0,this.clock()-h.runningAt);h.runningAt=null;h.interrupted=true;h.repResults=[];}
      }
    }
    reconcile(groups,athletes,plans,capacity=4){
      const roster=new Map(athletes.map(a=>[a.id,a]));const ordered=[];
      for(const group of groups){
        const cohorts=new Map();
        for(const id of [...new Set(group.athleteIds||[])].sort()){
          if(!roster.has(id))continue;const p=plans[id]||{};
          // Different prescriptions run in different heats, even within one saved group.
          const scope=JSON.stringify([p.week,p.day,p.sourceWeek,p.distance,p.reps,p.intent,p.raw]);
          if(!cohorts.has(scope))cohorts.set(scope,[]);cohorts.get(scope).push(id);
        }
        let index=0;
        for(const ids of cohorts.values())for(let i=0;i<ids.length;i+=capacity){
          const members=ids.slice(i,i+capacity),key=group.id+':'+index++;
          const existing=this.heats[key];
          const scopes=members.map(id=>plans[id]?.workoutKey||'').join('|');
          if(existing&&pending(existing)&&(existing.athleteIds.join('|')!==members.join('|')||existing.scopes!==scopes)){
            existing.detached=true;ordered.push(existing);continue;
          }
          if(!existing||(!pending(existing)&&(existing.scopes!==scopes||existing.athleteIds.join('|')!==members.join('|')))){
            this.heats[key]={key,groupId:group.id,groupName:group.name,heatNumber:index,athleteIds:members,scopes,rep:1,runningAt:null,elapsed:0,restStartedAt:null,restPausedAt:null,restElapsed:0,repRestSeconds:null,repResults:[],results:[],sessionId:uuid(),saved:false,interrupted:false};
          }
          const h=this.heats[key];h.groupName=group.name;h.detached=false;ordered.push(h);
        }
      }
      const live=new Set(ordered.map(h=>h.key));
      for(const [key,h] of Object.entries(this.heats))if(!live.has(key)){if(pending(h)){h.detached=true;ordered.push(h)}else delete this.heats[key]}
      if(!this.heats[this.active]||!ordered.some(h=>h.key===this.active))this.active=ordered[0]?.key||null;
      return ordered;
    }
    select(key){if(Object.values(this.heats).some(h=>h.runningAt!=null))throw Error('Finish or reset the running rep before switching heats.');if(!this.heats[key])throw Error('Heat unavailable');this.active=key;return this.heats[key]}
    elapsed(h=this.heats[this.active]){return h?.runningAt!=null?Math.max(0,this.clock()-h.runningAt):h?.elapsed||0}
    rest(h=this.heats[this.active]){return (h?.restElapsed||0)+(h?.restStartedAt!=null?Math.max(0,(h.restPausedAt??this.clock())-h.restStartedAt):0)}
    owner(athleteId,key){return Object.values(this.heats).find(h=>h.key!==key&&pending(h)&&h.athleteIds.includes(athleteId))}
    start(ids){const h=this.heats[this.active];if(!h||h.saved||h.detached)throw Error('Select an available heat.');if(h.interrupted)throw Error('The rep was interrupted. Reset this rep before timing it again.');if(h.runningAt!=null||h.repResults.length)throw Error('Finish or reset the current rep.');if(!ids.length)throw Error('No athletes available for this rep.');if(ids.some(id=>!h.athleteIds.includes(id)||this.owner(id,h.key)))throw Error('An athlete already has an unfinished workout in another heat.');h.repAthleteIds=ids.slice();h.repRestSeconds=h.rep>1?this.rest(h)/1000:null;h.restStartedAt=null;h.restPausedAt=null;h.restElapsed=0;h.elapsed=0;h.runningAt=this.clock();}
    finish(athleteId,details){const h=this.heats[this.active];if(h?.runningAt==null||!h.repAthleteIds.includes(athleteId)||h.repResults.some(r=>r.athleteId===athleteId))return false;const result={...details,athleteId,repNumber:h.rep,ms:this.elapsed(h),actualRestSeconds:h.repRestSeconds,groupName:h.groupName,laneNumber:h.athleteIds.indexOf(athleteId)+1};h.repResults.push(result);if(h.repResults.length===h.repAthleteIds.length){h.elapsed=this.elapsed(h);h.runningAt=null;h.restStartedAt=this.clock();}return true}
    commit(h){const rows=new Map(h.results.map(r=>[r.athleteId+':'+r.repNumber,r]));for(const r of h.repResults)rows.set(r.athleteId+':'+r.repNumber,r);h.results=[...rows.values()];h.repResults=[]}
    next(max){const h=this.heats[this.active];if(!h||h.runningAt!=null||!h.repResults.length||h.rep>=max)throw Error('Finish this rep before advancing.');this.commit(h);h.rep++;h.elapsed=0;h.repAthleteIds=[]}
    reset(){const h=this.heats[this.active];if(!h||h.saved)return;h.runningAt=null;h.elapsed=0;h.repResults=[];h.repAthleteIds=[];h.interrupted=false;h.repRestSeconds=null;h.restStartedAt=null;h.restPausedAt=null;h.restElapsed=0}
    undo(){const h=this.heats[this.active];if(!h?.repResults.length)return;h.repResults.pop();if(h.runningAt==null)h.runningAt=this.clock()-h.elapsed;h.restStartedAt=null;h.restPausedAt=null;h.restElapsed=0}
    toggleRest(){const h=this.heats[this.active];if(!h||h.runningAt!=null)return;if(h.restStartedAt==null){h.restStartedAt=this.clock();h.restPausedAt=null}else if(h.restPausedAt==null)h.restPausedAt=this.clock();else{h.restElapsed=this.rest(h);h.restStartedAt=this.clock();h.restPausedAt=null}}
    resetRest(){const h=this.heats[this.active];if(!h||h.runningAt!=null)return;h.restStartedAt=null;h.restPausedAt=null;h.restElapsed=0}
    toSave(){if(Object.values(this.heats).some(h=>h.runningAt!=null||h.interrupted))throw Error('Finish or reset interrupted/running reps before saving.');return Object.values(this.heats).filter(h=>!h.saved&&(h.results.length||h.repResults.length)).map(h=>({heat:h,results:[...h.results,...h.repResults]}))}
    receipt(key){const h=this.heats[key];h.saved=true;h.runningAt=null;h.repResults=[];h.results=[]}
    snapshot(){return {version:1,coachId:this.coachId,date:this.date,active:this.active,heats:this.heats}}
  }
  return {Session,pending};
});
