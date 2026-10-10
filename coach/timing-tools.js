(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MWCoachTimingTools=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  class Stopwatch{
    constructor(clock=()=>Date.now()){this.clock=clock;this.elapsed=0;this.startedAt=null;this.laps=[];}
    milliseconds(){return this.elapsed+(this.startedAt==null?0:Math.max(0,this.clock()-this.startedAt));}
    start(){if(this.startedAt==null)this.startedAt=this.clock();}
    pause(){this.elapsed=this.milliseconds();this.startedAt=null;}
    stop(){this.pause();}
    reset(){this.elapsed=0;this.startedAt=null;this.laps=[];}
    lap(){if(this.startedAt==null)return;const total=this.milliseconds(),previous=this.laps.at(-1)?.total||0;this.laps.push({total,split:total-previous});}
  }
  function format(ms){
    const centiseconds=Math.floor(Math.max(0,ms)/10),seconds=Math.floor(centiseconds/100);
    return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+'.'+String(centiseconds%100).padStart(2,'0');
  }
  function prescribedRestSeconds(text){
    const match=String(text||'').match(/\b(?:rest|recovery)\s*(?:[:=-]\s*)?(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*(sec(?:ond)?s?|s|min(?:ute)?s?|m)\b/i);
    if(!match)return null;
    const seconds=Number(match[2]||match[1])*(/^m/i.test(match[3])?60:1);
    return seconds>0&&seconds<=3600?seconds:null;
  }
  function createNarrator({speech=root.speechSynthesis,Utterance=root.SpeechSynthesisUtterance,schedule=root.setTimeout,unschedule=root.clearTimeout}={}){
    let generation=0,active=false,timers=[],current=null;
    function cancel(){
      generation++;active=false;for(const timer of timers)unschedule(timer);timers=[];
      if(current){current.onstart=current.onend=current.onerror=null;current=null;speech?.cancel();}
    }
    function start({onCue=()=>{},onGo=()=>{},onError=()=>{}}={}){
      cancel();
      if(!speech||!Utterance){onError(Error('Block-start voice is unavailable on this device. Turn narration off to start manually.'));return;}
      const token=generation;active=true;let went=false;
      const live=()=>active&&token===generation;
      const fail=()=>{if(!live()||went)return;cancel();onError(Error('Block-start voice did not play. Turn narration off to start manually.'));};
      const cues=['On your marks','Set','Go'];
      function say(index){
        if(!live())return;
        try{
          const utterance=new Utterance(cues[index]);current=utterance;
          utterance.lang='en-US';utterance.rate=.9;utterance.volume=1;
          const voices=speech.getVoices?.()||[];
          utterance.voice=voices.find(v=>v.lang==='en-US'&&v.localService)||voices.find(v=>v.lang==='en-US')||null;
          const watchdog=schedule(fail,7000);timers.push(watchdog);
          utterance.onstart=()=>{
            if(!live())return;onCue(cues[index]);
            if(index===2&&!went){went=true;unschedule(watchdog);onGo();}
          };
          utterance.onend=()=>{
            if(!live())return;unschedule(watchdog);
            if(index===2){if(!went){fail();return}active=false;current=null;return;}
            timers.push(schedule(()=>say(index+1),index===0?700:1100));
          };
          utterance.onerror=()=>{if(went){active=false;current=null;}else fail();};
          speech.speak(utterance);
        }catch{fail();}
      }
      // The clock begins at the Go utterance's start event, never at button tap or voice completion.
      say(0);
    }
    return {start,cancel,isActive:()=>active};
  }
  function createAudio(){
    let context=null;
    async function unlock(){
      try{const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return false;
        context=context||new Audio();if(context.state==='suspended')await context.resume();return context.state==='running';
      }catch{return false;}
    }
    async function play(kind='whistle'){
      if(!await unlock())return false;
      try{
        const start=context.currentTime+.015,duration=kind==='whistle'?.65:.55;
        const gain=context.createGain();gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(kind==='whistle'?.12:.08,start+.025);gain.gain.setValueAtTime(kind==='whistle'?.12:.08,start+duration-.08);gain.gain.linearRampToValueAtTime(0,start+duration);gain.connect(context.destination);
        const frequencies=kind==='whistle'?[2500,3150]:[880,1100];
        let ended=0;
        for(const frequency of frequencies){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);if(kind==='whistle')oscillator.frequency.linearRampToValueAtTime(frequency+90,start+.3);oscillator.connect(gain);oscillator.onended=()=>{oscillator.disconnect();if(++ended===frequencies.length)gain.disconnect();};oscillator.start(start);oscillator.stop(start+duration);}
        return true;
      }catch{return false;}
    }
    return {unlock,whistle:()=>play('whistle'),alert:()=>play('alert')};
  }
  const audio=createAudio(),stopwatch=new Stopwatch();
  function mountStopwatch(panel){
    const find=selector=>panel.querySelector(selector),clock=find('[data-stopwatch-clock]'),status=find('[data-stopwatch-status]'),start=find('[data-stopwatch-start]'),stop=find('[data-stopwatch-stop]'),lap=find('[data-stopwatch-lap]'),reset=find('[data-stopwatch-reset]'),laps=find('[data-stopwatch-laps]');
    let lastLapCount=-1;
    function paint(){
      const running=stopwatch.startedAt!=null;clock.textContent=format(stopwatch.milliseconds());
      start.textContent=running?'PAUSE':stopwatch.elapsed?'RESUME':'START';
      status.textContent=running?'STOPWATCH RUNNING':stopwatch.elapsed?'STOPWATCH STOPPED':'READY';
      stop.disabled=!running;lap.disabled=!running;
      if(lastLapCount!==stopwatch.laps.length){lastLapCount=stopwatch.laps.length;laps.innerHTML=stopwatch.laps.map((x,i)=>'<li><b>Lap '+(i+1)+'</b><span>'+format(x.split)+'</span><small>Total '+format(x.total)+'</small></li>').reverse().join('');}
    }
    start.onclick=()=>{if(stopwatch.startedAt!=null)stopwatch.pause();else stopwatch.start();paint();};
    stop.onclick=()=>{stopwatch.stop();paint();};lap.onclick=()=>{stopwatch.lap();paint();};reset.onclick=()=>{stopwatch.reset();paint();};
    paint();const interval=root.setInterval(()=>{if(!panel.isConnected){root.clearInterval(interval);return;}paint();},40);
    return {stopwatch,destroy:()=>root.clearInterval(interval)};
  }
  return {Stopwatch,format,prescribedRestSeconds,createNarrator,createAudio,audio,mountStopwatch};
});
