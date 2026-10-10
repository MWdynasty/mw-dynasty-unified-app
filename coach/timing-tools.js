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
  function createNarrator({speech=root.speechSynthesis,Utterance=root.SpeechSynthesisUtterance,schedule=root.setTimeout,unschedule=root.clearTimeout,gun=options=>audio.gun(options)}={}){
    let generation=0,active=false,timers=[],current=null;
    function cancel(){
      generation++;active=false;for(const timer of timers)unschedule(timer);timers=[];
      if(current){current.onstart=current.onend=current.onerror=null;current=null;speech?.cancel();}
    }
    function utteranceFor(text){
      const utterance=new Utterance(text),voices=speech.getVoices?.()||[];
      utterance.lang='en-US';utterance.rate=.85;utterance.pitch=.85;utterance.volume=1;
      utterance.voice=voices.find(v=>v.lang==='en-US'&&v.localService)||voices.find(v=>v.lang==='en-US')||null;
      return utterance;
    }
    function speak(text){
      cancel();if(!speech||!Utterance)return false;
      try{current=utteranceFor(text);current.onend=current.onerror=()=>{current=null;};speech.speak(current);return true;}catch{cancel();return false;}
    }
    function start({onCue=()=>{},onGo=()=>{},onError=()=>{}}={}){
      cancel();
      if(!speech||!Utterance){onError(Error('Block-start voice is unavailable on this device. Turn narration off to start manually.'));return;}
      const token=generation;active=true;let went=false;
      const live=()=>active&&token===generation;
      const fail=()=>{if(!live()||went)return;cancel();onError(Error('Meet-start audio did not play. Choose Off to start manually and check device sound.'));};
      const cues=['On your marks','Set'];
      function fire(){
        if(!live())return;
        timers.push(schedule(fail,7000));
        try{Promise.resolve(gun({canFire:live,onFire:()=>{
          if(!live()||went)return;went=true;active=false;current=null;
          for(const timer of timers)unschedule(timer);timers=[];onGo();onCue('Gun');
        }})).then(ok=>{if(!ok)fail();},fail);}catch{fail();}
      }
      function say(index){
        if(!live())return;
        try{
          const utterance=utteranceFor(cues[index]);current=utterance;
          const watchdog=schedule(fail,7000);timers.push(watchdog);
          utterance.onstart=()=>{
            if(!live())return;onCue(cues[index]);
          };
          utterance.onend=()=>{
            if(!live())return;unschedule(watchdog);
            current=null;
            timers.push(schedule(index===0?()=>say(1):fire,index===0?1600:1300));
          };
          utterance.onerror=()=>{if(went){active=false;current=null;}else fail();};
          speech.speak(utterance);
        }catch{fail();}
      }
      // The clock begins when the starting-gun buffer fires, not at button tap or spoken Set.
      say(0);
    }
    return {start,speak,cancel,isActive:()=>active};
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
        if(kind==='whistle'){
          // A lower whistle body, breath noise and rapid amplitude trill instead of two piercing sine tones.
          const start=context.currentTime+.015,duration=.8,output=context.createGain();
          output.gain.setValueAtTime(0,start);output.gain.linearRampToValueAtTime(.22,start+.035);output.gain.setValueAtTime(.22,start+.65);output.gain.linearRampToValueAtTime(0,start+duration);output.connect(context.destination);
          const trill=context.createOscillator(),depth=context.createGain();trill.frequency.value=32;depth.gain.value=.055;trill.connect(depth);depth.connect(output.gain);
          const body=context.createOscillator();body.type='triangle';body.frequency.setValueAtTime(1650,start);body.frequency.linearRampToValueAtTime(1850,start+.07);body.frequency.linearRampToValueAtTime(1700,start+duration);body.connect(output);
          const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.28;
          const breath=context.createBufferSource(),filter=context.createBiquadFilter();breath.buffer=buffer;filter.type='bandpass';filter.frequency.value=1750;filter.Q.value=1.2;breath.connect(filter);filter.connect(output);
          breath.onended=()=>{for(const node of [breath,filter,body,trill,depth,output])node.disconnect();};
          body.start(start);trill.start(start);breath.start(start);body.stop(start+duration);trill.stop(start+duration);return true;
        }
        const start=context.currentTime+.015,duration=.55;
        const gain=context.createGain();gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.08,start+.025);gain.gain.setValueAtTime(.08,start+duration-.08);gain.gain.linearRampToValueAtTime(0,start+duration);gain.connect(context.destination);
        const frequencies=[880,1100];
        let ended=0;
        for(const frequency of frequencies){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);oscillator.connect(gain);oscillator.onended=()=>{oscillator.disconnect();if(++ended===frequencies.length)gain.disconnect();};oscillator.start(start);oscillator.stop(start+duration);}
        return true;
      }catch{return false;}
    }
    async function gun({onFire=()=>{},canFire=()=>true}={}){
      if(!await unlock()||!canFire())return false;
      try{
        const duration=.32,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),samples=buffer.getChannelData(0);
        for(let i=0;i<samples.length;i++){const t=i/context.sampleRate;samples[i]=((Math.random()*2-1)*Math.exp(-t*38)+.35*Math.sin(2*Math.PI*115*t)*Math.exp(-t*24))*.6;}
        const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=6000;gain.gain.value=.55;source.connect(filter);filter.connect(gain);gain.connect(context.destination);
        source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
        if(!canFire()){source.disconnect();filter.disconnect();gain.disconnect();return false;}
        source.start(context.currentTime);onFire();return true;
      }catch{return false;}
    }
    return {unlock,whistle:()=>play('whistle'),alert:()=>play('alert'),gun};
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
