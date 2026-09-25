const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

let start=null;
let watch=null;
let lockWatch=null;
let total=0;
let targetHit=false;
let lastSpoken=0;
let movementStarted=false;
let acceptedAnchor=null;
let smoothing=[];
let validPoints=0;
let ignoredPoints=0;

const R=6371000;
const START_MAX_ACCURACY=15;
const MEASURE_MAX_ACCURACY=18;
const START_SAMPLE_TARGET=6;
const LOCK_TIMEOUT_MS=9000;
const WALK_MAX_MPS=4.8;

const toRad=x=>x*Math.PI/180;
function hav(a,b){
  const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function target(){return Math.max(5,Number($('#gpsDistance').value)||100)}
function updateTarget(){
  const t=target();
  $('#targetReadout').textContent=t+'m';
  $$('.presets button').forEach(b=>b.classList.toggle('active',Number(b.dataset.distance)===t));
}
function say(t){
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(String(t));
    u.rate=1;
    speechSynthesis.speak(u);
  }catch{}
}
function buzz(){try{navigator.vibrate?.([180,90,260])}catch{}}
function setState(label,msg){
  $('#gpsLiveStatus').textContent=label;
  $('#gpsStatus').textContent=msg;
}
function pointFromPosition(p){
  return {
    lat:p.coords.latitude,
    lon:p.coords.longitude,
    accuracy:Number(p.coords.accuracy)||999,
    speed:Number.isFinite(p.coords.speed)?Math.max(0,p.coords.speed):null,
    time:Number(p.timestamp)||Date.now()
  };
}
function weightedPoint(points){
  if(!points.length)return null;
  let sw=0,lat=0,lon=0,time=0;
  for(const p of points){
    const a=Math.max(2,p.accuracy||999);
    const w=1/(a*a);
    sw+=w;lat+=p.lat*w;lon+=p.lon*w;time+=p.time*w;
  }
  const acc=Math.min(...points.map(p=>p.accuracy||999));
  return {lat:lat/sw,lon:lon/sw,accuracy:acc,time:time/sw};
}
function resetMeasurementState(){
  total=0;
  targetHit=false;
  lastSpoken=0;
  movementStarted=false;
  acceptedAnchor=start?{...start}:null;
  smoothing=[];
  validPoints=0;
  ignoredPoints=0;
}
function renderDistance(){
  const t=target();
  const pct=Math.min(100,total/t*100);
  $('#gpsMeasured').textContent=total.toFixed(1)+' m';
  $('#distanceBar').style.width=pct+'%';
}
function stopWatch(){
  if(watch!=null){
    try{navigator.geolocation.clearWatch(watch)}catch{}
    watch=null;
  }
}
function stopLockWatch(){
  if(lockWatch!=null){
    try{navigator.geolocation.clearWatch(lockWatch)}catch{}
    lockWatch=null;
  }
}

$$('.presets button').forEach(b=>b.onclick=()=>{$('#gpsDistance').value=b.dataset.distance;updateTarget()});
$('#gpsDistance').addEventListener('input',updateTarget);
updateTarget();

$('#lockStart').onclick=async()=>{
  try{await window.mwNativePermission?.('location')}catch{}
  if(!navigator.geolocation){
    setState('UNAVAILABLE','Location services are not available on this device.');
    return;
  }

  stopWatch();
  stopLockWatch();
  start=null;
  $('#startWalk').disabled=true;
  $('#saveMark').disabled=true;
  $('#gpsBadge').textContent='◎ CALIBRATING';
  setState('CALIBRATING','Hold still. MW is averaging several precise GPS samples before locking your start.');

  const samples=[];
  const started=Date.now();
  let finished=false;

  const finishLock=()=>{
    if(finished)return;
    finished=true;
    stopLockWatch();

    const usable=samples.filter(p=>p.accuracy<=START_MAX_ACCURACY);
    const pool=(usable.length?usable:samples).sort((a,b)=>a.accuracy-b.accuracy).slice(0,Math.max(START_SAMPLE_TARGET,8));
    if(pool.length<3){
      $('#gpsBadge').textContent='△ WEAK GPS';
      setState('TRY AGAIN','MW could not build a stable GPS start. Move into an open area, wait a few seconds, and try again.');
      return;
    }

    const best=Math.min(...pool.map(p=>p.accuracy));
    if(best>20){
      $('#gpsBadge').textContent='△ WEAK GPS';
      $('#gpsAccuracy').textContent=Math.round(best)+'m';
      setState('TRY AGAIN','GPS uncertainty is too large for a trustworthy distance mark. Wait for a clearer signal.');
      return;
    }

    start=weightedPoint(pool);
    resetMeasurementState();
    renderDistance();
    $('#gpsAccuracy').textContent=Math.round(start.accuracy)+'m';
    $('#gpsBadge').textContent=start.accuracy<=8?'◎ GPS LOCKED':'◎ GPS FAIR';
    $('#startWalk').disabled=false;
    setState('START LOCKED',`Start calibrated from ${pool.length} GPS samples. Walk the exact route you want measured.`);
    say('Start point calibrated and locked.');
  };

  lockWatch=navigator.geolocation.watchPosition(
    p=>{
      const x=pointFromPosition(p);
      if(x.accuracy>30)return;
      samples.push(x);
      if(samples.length>12)samples.shift();
      const best=Math.min(...samples.map(s=>s.accuracy));
      $('#gpsAccuracy').textContent=Math.round(best)+'m';
      $('#gpsBadge').textContent=best<=8?'◎ GPS EXCELLENT':best<=START_MAX_ACCURACY?'◎ GPS CALIBRATING':'△ GPS FAIR';
      const good=samples.filter(s=>s.accuracy<=START_MAX_ACCURACY);
      if(good.length>=START_SAMPLE_TARGET&&Date.now()-started>=2500)finishLock();
    },
    ()=>setState('LOCATION NEEDED','Allow precise location access to use the Distance Pacer.'),
    {enableHighAccuracy:true,maximumAge:0,timeout:12000}
  );

  setTimeout(finishLock,LOCK_TIMEOUT_MS);
};

$('#startWalk').onclick=()=>{
  if(!start||watch!=null)return;
  $('#startWalk').disabled=true;
  $('#saveMark').disabled=true;
  resetMeasurementState();
  renderDistance();
  setState('MEASURING','Walk naturally. MW is filtering GPS drift before adding distance.');
  say('Measuring started.');

  watch=navigator.geolocation.watchPosition(
    p=>{
      const raw=pointFromPosition(p);
      $('#gpsAccuracy').textContent=Math.round(raw.accuracy)+'m';

      if(raw.accuracy>MEASURE_MAX_ACCURACY){
        ignoredPoints++;
        $('#gpsBadge').textContent='△ GPS PAUSED';
        setState('GPS PAUSED','Accuracy is temporarily too weak. MW is holding your distance instead of adding GPS drift.');
        return;
      }
      if(raw.speed!=null&&raw.speed>WALK_MAX_MPS){
        ignoredPoints++;
        return;
      }

      smoothing.push(raw);
      if(smoothing.length>5)smoothing.shift();
      if(smoothing.length<3)return;

      const cur=weightedPoint(smoothing);
      if(!acceptedAnchor){
        acceptedAnchor={...cur};
        return;
      }

      const dt=Math.max(.25,(cur.time-acceptedAnchor.time)/1000);
      const step=hav(acceptedAnchor,cur);
      const gate=clamp(Math.max(2.5,Math.max(acceptedAnchor.accuracy,cur.accuracy)*0.42),2.5,6);
      const plausibleMax=Math.max(8,dt*WALK_MAX_MPS+Math.min(4,(acceptedAnchor.accuracy+cur.accuracy)*0.18));

      if(step>plausibleMax){
        ignoredPoints++;
        $('#gpsBadge').textContent='△ FILTERING';
        return;
      }

      if(!movementStarted){
        const startGate=clamp(Math.max(3.5,cur.accuracy*0.55),3.5,7);
        const fromStart=hav(start,cur);
        if(fromStart<startGate){
          acceptedAnchor={...cur};
          $('#gpsBadge').textContent=cur.accuracy<=8?'◎ GPS GOOD':'◎ GPS FAIR';
          return;
        }
        movementStarted=true;
        acceptedAnchor={...start};
      }

      const filteredStep=hav(acceptedAnchor,cur);
      if(filteredStep<gate){
        $('#gpsBadge').textContent=cur.accuracy<=8?'◎ GPS GOOD':'◎ GPS FAIR';
        return;
      }

      total+=filteredStep;
      acceptedAnchor={...cur};
      validPoints++;
      renderDistance();

      const t=target();
      $('#gpsBadge').textContent=cur.accuracy<=8?'◎ GPS GOOD':'◎ GPS FAIR';

      for(const m of [.5,.75,.9,.95,1]){
        if(total>=t*m&&lastSpoken<m){
          lastSpoken=m;
          if(m<1)say(Math.round(t*m)+' meters');
          break;
        }
      }

      if(total>=t&&!targetHit){
        targetHit=true;
        $('#saveMark').disabled=false;
        setState('TARGET REACHED',`Target reached at ${total.toFixed(1)}m. Mark the finish point. GPS drift filtering stayed active throughout the walk.`);
        say(t+' meters. Target reached. Mark your finish.');
        buzz();
        stopWatch();
      }else if(!targetHit){
        setState('MEASURING',`Keep walking to ${t}m. MW is smoothing location samples and rejecting drift.`);
      }
    },
    ()=>setState('GPS LOST','Location signal was interrupted. Hold position while GPS reconnects.'),
    {enableHighAccuracy:true,maximumAge:0,timeout:12000}
  );
};

function reset(){
  stopWatch();
  stopLockWatch();
  start=null;
  resetMeasurementState();
  try{speechSynthesis.cancel()}catch{}
  $('#gpsMeasured').textContent='0.0 m';
  $('#distanceBar').style.width='0%';
  $('#gpsAccuracy').textContent='—';
  $('#gpsBadge').textContent='◎ GPS CHECK';
  $('#gpsLiveStatus').textContent='READY';
  $('#gpsStatus').textContent='Stand still at your starting point and lock it when GPS is ready.';
  $('#startWalk').disabled=true;
  $('#saveMark').disabled=true;
}
$('#resetGps').onclick=reset;

$('#saveMark').onclick=()=>{
  if(!targetHit)return;
  localStorage.setItem('mwLastDistanceMark',JSON.stringify({
    target:target(),
    measured:Number(total.toFixed(1)),
    startAccuracy:start?Number(start.accuracy.toFixed(1)):null,
    validPoints,
    ignoredPoints,
    algorithm:'mw-gps-v2-filtered',
    savedAt:new Date().toISOString()
  }));
  setState('MARK SAVED','Finish mark saved on this device with MW GPS drift filtering.');
  say('Mark saved.');
};

function receiveMwPaceHandoff(){
  const q=new URLSearchParams(location.search);
  let p=null;
  try{p=JSON.parse(localStorage.getItem('mwPacerHandoff')||'null')}catch{}
  if(q.get('mw_handoff')==='1'){
    p={
      distance:+q.get('distance'),
      reps:+q.get('reps'),
      targetTime:+q.get('target'),
      restSeconds:+q.get('rest'),
      week:+q.get('week'),
      day:+q.get('day'),
      title:q.get('title')||'MW Workout'
    };
  }
  if(!p)return;
  $('#handoff').classList.remove('hidden');
  $('#handoffTitle').textContent=p.title||'MW Workout received';
  $('#handoffText').textContent=`Week ${p.week||'—'} Day ${p.day||'—'} • ${p.reps||'—'} reps • ${p.distance||'—'}m${p.targetTime?` • ${p.targetTime}s target`:''}`;
  if(p.distance){
    $('#gpsDistance').value=p.distance;
    updateTarget();
  }
}
receiveMwPaceHandoff();
