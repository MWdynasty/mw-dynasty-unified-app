/*
 * MW Dynasty Original 41-Week Track Program (V3.2)
 *
 * Authored for MW Dynasty. This is an original calendar: it does not reuse
 * another coach's week-by-week prescriptions, wording, or session order.
 * It uses only MW's stated training priorities: sprint mechanics, progressive
 * acceleration, speed, race rhythm, recovery, and a late-season peak.
 */

const FOUNDATION='Foundation';
const DEVELOPMENT='Development';
const PERFORMANCE='Performance';

function session(day,title,focus,foundation,development,performance,recovery,cues,intensity,eventWork){
  return {day,title,focus,work:performance,recovery,cues,intensity,eventWork,
    tierWork:{foundation,development,performance},
    tierRecovery:{foundation:`${recovery}; add recovery whenever mechanics change`,development:recovery,performance:recovery}};
}
function sprint(day,title,focus,work,recovery,cues,eventWork){
  return session(day,title,focus,work[0],work[1],work[2],recovery,cues,'high',eventWork);
}
function support(day,title,focus,work,recovery,cues){
  return session(day,title,focus,work[0],work[1],work[2],recovery,cues,'low to moderate');
}
const rules=[
  'Every rep has a purpose. Stop or reduce work when posture, rhythm, or sprint mechanics are no longer repeatable.',
  'Track quality leads. The weight room supports the sprint session and never requires make-up work.',
  'The Pacer gives targets; it does not override pain, illness, unusual soreness, or a coach’s safety decision.',
  'Foundation athletes use standing or three-point starts until they demonstrate safe, repeatable positions.'
];

const weeks={};
function add(week,phase,phaseName,sessions){
  weeks[String(week)]={week,phase,phaseName,provenance:'Original MW Dynasty V3.2 session — authored for this program',sessions};
}
function accel(day,base,rec='3–5 min'){
  return sprint(day,'Start & Drive Development','projection, patient rise, and force into the ground',base,rec,['push through the track','rise naturally','stay patient in the first steps']);
}
function tempo(day,base){
  return support(day,'Tempo + Mobility','easy rhythm, tissue capacity, and recovery',base,'60–90 sec between runs',['smooth, not strained','finish fresher than you began','mobility after running']);
}
function circuit(day,base){
  return support(day,'MW Movement Circuit','coordination, trunk control, and recovery-friendly movement',base,'walk/rest as needed for quality',['quiet contacts','stable posture','no racing the circuit']);
}
function maxV(day,base,rec='5–7 min'){
  return sprint(day,'Maximum-Velocity Rhythm','upright mechanics, relaxation, and frequency',base,rec,['tall hips','relaxed face and hands','step down under the body']);
}
function endurance(day,title,focus,base,rec,eventWork){
  return sprint(day,title,focus,base,rec,['build a repeatable rhythm','do not force the first rep','protect posture late'],eventWork);
}

// Phase 1 — foundation: movement quality before intensity.
[
  ['4 x 10m falling starts','5 x 15m falling starts','6 x 20m falling starts','6 x 60m @ relaxed tempo','8 x 60m @ relaxed tempo','8 x 80m @ relaxed tempo','4 x 40m build-ups','5 x 50m build-ups','6 x 60m build-ups','1 round MW movement circuit','2 rounds MW movement circuit','2 rounds MW movement circuit'],
  ['4 x 15m stance starts','5 x 20m stance starts','6 x 20m stance starts','6 x 80m @ relaxed tempo','8 x 80m @ relaxed tempo','8 x 100m @ relaxed tempo','4 x 50m progressive runs','5 x 60m progressive runs','6 x 60m progressive runs','1 round MW movement circuit','2 rounds MW movement circuit','2 rounds MW movement circuit'],
  ['4 x 20m three-point starts','5 x 20m three-point starts','6 x 30m three-point starts','5 x 100m @ relaxed tempo','6 x 100m @ relaxed tempo','8 x 100m @ relaxed tempo','4 x 60m build-and-float','5 x 60m build-and-float','6 x 70m build-and-float','2 rounds MW movement circuit','2 rounds MW movement circuit','3 rounds MW movement circuit'],
  ['4 x 20m start + 10m build','5 x 25m start + 10m build','6 x 30m start + 10m build','6 x 100m @ relaxed tempo','7 x 100m @ relaxed tempo','8 x 100m @ relaxed tempo','3 x 80m smooth rhythm','4 x 90m smooth rhythm','4 x 100m smooth rhythm','2 rounds MW movement circuit','2 rounds MW movement circuit','3 rounds MW movement circuit'],
  ['4 x 25m starts','5 x 30m starts','6 x 30m starts','5 x 120m @ relaxed tempo','6 x 120m @ relaxed tempo','7 x 120m @ relaxed tempo','3 x 100m rhythm runs','4 x 100m rhythm runs','4 x 120m rhythm runs','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['4 x 25m starts + 1 x 40m build','5 x 30m starts + 1 x 40m build','6 x 30m starts + 2 x 40m builds','6 x 100m @ relaxed tempo','7 x 100m @ relaxed tempo','8 x 100m @ relaxed tempo','3 x 120m smooth rhythm','3 x 140m smooth rhythm','4 x 140m smooth rhythm','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit']
].forEach((x,i)=>add(i+1,1,'Foundation & Movement',[
  accel(1,[x[0],x[1],x[2]]),tempo(2,[x[3],x[4],x[5]]),endurance(3,'Progressive Sprint Rhythm','gradual speed exposure without forcing fatigue',[x[6],x[7],x[8]],'4–6 min'),circuit(4,[x[9],x[10],x[11]])
]));

// Phase 2 — acceleration and force. Week 12 deliberately unloads.
[
  ['4 x 20m + 2 x 30m','5 x 20m + 2 x 30m','6 x 30m','5 x 100m tempo','6 x 100m tempo','7 x 100m tempo','3 x 80m build-float-build','4 x 90m build-float-build','4 x 100m build-float-build','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['4 x 30m starts','5 x 30m starts','6 x 30m starts','6 x 100m tempo','7 x 100m tempo','8 x 100m tempo','3 x 90m transition runs','4 x 100m transition runs','4 x 120m transition runs','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['4 x 30m + 1 x 40m','5 x 30m + 2 x 40m','6 x 40m','5 x 120m tempo','6 x 120m tempo','7 x 120m tempo','3 x 100m build-float','4 x 110m build-float','4 x 120m build-float','2 rounds MW Field Circuit','2 rounds MW Field Circuit','3 rounds MW Field Circuit'],
  ['4 x 40m starts','5 x 40m starts','6 x 40m starts','5 x 100m tempo','6 x 100m tempo','7 x 100m tempo','3 x 120m progression','3 x 130m progression','4 x 130m progression','2 rounds MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['3 x 30m + 2 x 50m','4 x 30m + 2 x 50m','5 x 40m + 2 x 50m','6 x 100m tempo','7 x 100m tempo','8 x 100m tempo','2 x 120m + 1 x 150m rhythm','3 x 120m + 1 x 150m rhythm','3 x 150m rhythm','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['3 x 20m + 2 x 30m','4 x 20m + 2 x 30m','4 x 30m','5 x 80m tempo','6 x 80m tempo','6 x 100m tempo','3 x 80m relaxed fast','3 x 90m relaxed fast','3 x 100m relaxed fast','1 light MW movement circuit','1–2 light MW movement circuits','2 light MW movement circuits']
].forEach((x,i)=>add(i+7,2,'Acceleration & Force',[
  accel(1,[x[0],x[1],x[2]],'4–6 min'),tempo(2,[x[3],x[4],x[5]]),endurance(3,'Transition Speed','carry a clean drive phase into upright sprinting',[x[6],x[7],x[8]],'5–7 min'),circuit(4,[x[9],x[10],x[11]])
]));

// Phase 3 — max-velocity mechanics. Week 18 reduces volume before the next build.
[
  ['3 x fly 10m (20m build)','4 x fly 15m (25m build)','5 x fly 20m (30m build)','5 x 100m tempo','6 x 100m tempo','7 x 100m tempo','3 x 120m relaxed-fast-relaxed','4 x 120m relaxed-fast-relaxed','4 x 140m relaxed-fast-relaxed','1 round MW movement circuit','2 rounds MW movement circuit','2 rounds MW movement circuit'],
  ['3 x fly 15m (20m build)','4 x fly 20m (25m build)','5 x fly 20m (30m build)','6 x 100m tempo','7 x 100m tempo','8 x 100m tempo','3 x 100m ins-and-outs','4 x 110m ins-and-outs','4 x 120m ins-and-outs','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['3 x fly 20m (25m build)','4 x fly 20m (30m build)','5 x fly 30m (30m build)','5 x 120m tempo','6 x 120m tempo','7 x 120m tempo','2 x 120m + 1 x 150m rhythm','3 x 120m + 1 x 150m rhythm','3 x 150m rhythm','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['3 x fly 20m (30m build)','4 x fly 30m (30m build)','5 x fly 30m (35m build)','5 x 100m tempo','6 x 100m tempo','7 x 100m tempo','3 x 120m fast-smooth-fast','4 x 130m fast-smooth-fast','4 x 150m fast-smooth-fast','1 round MW movement circuit','2 rounds MW movement circuit','2 rounds MW movement circuit'],
  ['3 x fly 30m (30m build)','4 x fly 30m (35m build)','5 x fly 30m (40m build)','6 x 100m tempo','7 x 100m tempo','8 x 100m tempo','2 x 150m rhythm','3 x 150m rhythm','3 x 160m rhythm','1 round MW Field Circuit','2 rounds MW Field Circuit','2 rounds MW Field Circuit'],
  ['2 x fly 15m (25m build)','3 x fly 20m (25m build)','4 x fly 20m (30m build)','5 x 80m tempo','6 x 80m tempo','6 x 100m tempo','2 x 100m smooth-fast-smooth','3 x 100m smooth-fast-smooth','3 x 120m smooth-fast-smooth','1 light MW movement circuit','1–2 light MW movement circuits','2 light MW movement circuits']
].forEach((x,i)=>add(i+13,3,'Maximum Velocity & Rhythm',[
  maxV(1,[x[0],x[1],x[2]]),tempo(2,[x[3],x[4],x[5]]),endurance(3,'Speed Rhythm Extension','maintain relaxation as the sprint pattern lengthens',[x[6],x[7],x[8]],'6–8 min'),circuit(4,[x[9],x[10],x[11]])
]));

// Phase 4 — speed endurance and event rhythm. Event options are surfaced by the app.
[
  ['2 x 100m @ controlled fast','3 x 120m @ controlled fast','3 x 150m @ controlled fast','5 x 100m tempo','6 x 100m tempo','7 x 100m tempo','2 x 120m rhythm','3 x 150m rhythm','3 x 180m rhythm','1 light MW Field Circuit','2 light MW Field Circuits','2 light MW Field Circuits'],
  ['2 x 120m @ controlled fast','3 x 150m @ controlled fast','3 x 180m @ controlled fast','5 x 120m tempo','6 x 120m tempo','7 x 120m tempo','2 x 150m rhythm','2 x 180m rhythm','3 x 200m rhythm','1 light MW movement circuit','2 light MW movement circuits','2 light MW movement circuits'],
  ['2 x 150m @ race rhythm','3 x 150m @ race rhythm','3 x 200m @ race rhythm','5 x 100m tempo','6 x 100m tempo','7 x 100m tempo','2 x 180m rhythm','2 x 200m rhythm','2 x 250m rhythm','1 light MW Field Circuit','2 light MW Field Circuits','2 light MW Field Circuits'],
  ['2 x 120m + 1 x 150m','2 x 150m + 1 x 180m','2 x 180m + 1 x 200m','5 x 120m tempo','6 x 120m tempo','7 x 120m tempo','2 x 150m smooth-fast','2 x 180m smooth-fast','2 x 220m smooth-fast','1 light MW movement circuit','2 light MW movement circuits','2 light MW movement circuits'],
  ['2 x 150m @ controlled fast','2 x 180m @ controlled fast','2 x 200m @ controlled fast','5 x 100m tempo','6 x 100m tempo','7 x 100m tempo','1 x 180m + 1 x 120m','1 x 200m + 1 x 120m','1 x 250m + 1 x 150m','1 light MW Field Circuit','2 light MW Field Circuits','2 light MW Field Circuits'],
  ['2 x 100m @ smooth fast','2 x 120m @ smooth fast','2 x 150m @ smooth fast','5 x 80m tempo','6 x 80m tempo','6 x 100m tempo','2 x 120m rhythm','2 x 150m rhythm','2 x 180m rhythm','1 light MW movement circuit','1–2 light MW movement circuits','2 light MW movement circuits']
].forEach((x,i)=>add(i+19,4,'Speed Endurance & Race Rhythm',[
  endurance(1,'Race-Rhythm Repeats','event-specific rhythm with complete recovery',[x[0],x[1],x[2]],'7–10 min',{100:'Keep the rep under speed-endurance control; do not turn it into conditioning.',200:'Use the curve and straight with patient distribution.',400:'Use controlled opening rhythm and finish with posture, not panic.'}),tempo(2,[x[3],x[4],x[5]]),endurance(3,'Event Rhythm Extension','build repeatable race rhythm without chasing exhaustion',[x[6],x[7],x[8]],'8–12 min',{100:'Use crisp speed endurance with full recovery.',200:'Practice smooth curve-to-straight transition.',400:'Stay disciplined through the middle section.'}),circuit(4,[x[9],x[10],x[11]])
]));

// Phase 5 — pre-competition conversion.
[
  ['4 x 20m starts + 1 x fly 20m','5 x 30m starts + 2 x fly 20m','6 x 30m starts + 3 x fly 20m','5 x 100m tempo','6 x 100m tempo','6 x 120m tempo','1 x 120m + 1 x 80m','1 x 150m + 1 x 100m','1 x 180m + 1 x 120m','1 light MW movement circuit','1–2 light MW movement circuits','2 light MW movement circuits'],
  ['3 x 30m starts + 2 x fly 20m','4 x 30m starts + 3 x fly 20m','5 x 40m starts + 3 x fly 30m','5 x 100m tempo','6 x 100m tempo','6 x 120m tempo','2 x 100m @ race rhythm','2 x 120m @ race rhythm','2 x 150m @ race rhythm','1 light MW Field Circuit','1–2 light MW Field Circuits','2 light MW Field Circuits'],
  ['3 x 30m starts + 1 x fly 30m','4 x 40m starts + 2 x fly 30m','5 x 40m starts + 3 x fly 30m','4 x 100m tempo','5 x 100m tempo','6 x 100m tempo','1 x 150m + 1 x 100m','1 x 180m + 1 x 120m','1 x 200m + 1 x 150m','1 light MW movement circuit','1–2 light MW movement circuits','2 light MW movement circuits'],
  ['3 x 20m starts + 2 x fly 20m','4 x 30m starts + 2 x fly 20m','5 x 30m starts + 3 x fly 20m','4 x 80m tempo','5 x 80m tempo','6 x 100m tempo','1 x 120m @ race rhythm','1 x 150m @ race rhythm','1 x 180m @ race rhythm','1 light MW movement circuit','1–2 light MW movement circuits','2 light MW movement circuits'],
  ['2 x 30m starts + 1 x fly 20m','3 x 30m starts + 2 x fly 20m','4 x 40m starts + 2 x fly 30m','4 x 80m tempo','5 x 80m tempo','6 x 80m tempo','1 x 100m sharp, stop fresh','1 x 120m sharp, stop fresh','1 x 150m sharp, stop fresh','mobility only','1 light MW movement circuit','1 light MW movement circuit'],
  ['2 x 20m starts + 1 x fly 15m','3 x 20m starts + 2 x fly 15m','4 x 30m starts + 2 x fly 20m','4 x 80m tempo','5 x 80m tempo','5 x 100m tempo','1 x 80m sharp','1 x 100m sharp','1 x 120m sharp','mobility only','mobility only','1 light MW movement circuit']
].forEach((x,i)=>add(i+25,5,'Pre-Competition Conversion',[
  sprint(1,'Start-to-Speed Connection','race-ready start quality and upright speed',[x[0],x[1],x[2]],'5–8 min',['make the first steps decisive','arrive upright without forcing','finish fast, not tired']),tempo(2,[x[3],x[4],x[5]]),endurance(3,'Race Model Practice','rehearse the athlete’s own race distribution',[x[6],x[7],x[8]],'10–15 min',['run the plan, not emotion','preserve form late','leave one quality rep in reserve'],{100:'Start well, transition, then relax at speed.',200:'Build through the curve and attack the straight with control.',400:'Open with controlled intent, own the backstretch, and finish with posture.'}),circuit(4,[x[9],x[10],x[11]])
]));

// Phase 6 — competition. Meetings replace the final quality session where appropriate.
[
  ['3 x 20m starts + 2 x fly 20m','4 x 30m starts + 2 x fly 20m','5 x 30m starts + 3 x fly 20m','4 x 80m tempo','5 x 80m tempo','5 x 100m tempo','1 x 100m rhythm','1 x 120m rhythm','1 x 150m rhythm','mobility only','1 light MW movement circuit','1 light MW movement circuit'],
  ['3 x 30m starts','4 x 30m starts + 1 x fly 20m','5 x 40m starts + 2 x fly 20m','4 x 80m tempo','5 x 80m tempo','5 x 100m tempo','1 x 120m race model','1 x 150m race model','1 x 180m race model','mobility only','mobility only','1 light MW movement circuit'],
  ['2 x 20m starts + 2 x fly 20m','3 x 30m starts + 2 x fly 20m','4 x 30m starts + 3 x fly 20m','4 x 80m tempo','5 x 80m tempo','5 x 100m tempo','1 x 80m sharp','1 x 100m sharp','1 x 120m sharp','mobility only','mobility only','1 light MW movement circuit'],
  ['2 x 30m starts','3 x 30m starts + 1 x fly 15m','4 x 30m starts + 2 x fly 20m','4 x 60m tempo','5 x 60m tempo','5 x 80m tempo','1 x 100m relaxed-fast','1 x 120m relaxed-fast','1 x 150m relaxed-fast','mobility only','mobility only','1 light MW movement circuit'],
  ['2 x 20m starts + 1 x fly 15m','3 x 20m starts + 1 x fly 20m','4 x 30m starts + 2 x fly 20m','4 x 60m tempo','5 x 60m tempo','5 x 80m tempo','1 x 80m sharp','1 x 100m sharp','1 x 120m sharp','mobility only','mobility only','mobility only']
].forEach((x,i)=>add(i+31,6,'Competition Preparation',[
  sprint(1,'Competition Speed Primer','retain speed without accumulating fatigue',[x[0],x[1],x[2]],'5–8 min',['fast but composed','do not chase volume','finish feeling ready']),tempo(2,[x[3],x[4],x[5]]),endurance(3,'Meet-Week Rhythm','short rehearsal; replace with competition when the meet schedule requires',[x[6],x[7],x[8]],'full recovery',['protect freshness','keep the nervous system sharp','do not add missed work']),circuit(4,[x[9],x[10],x[11]])
]));

// Phase 7 — championship taper: volume falls while intent stays high.
[
  ['2 x 20m starts + 1 x fly 15m','3 x 20m starts + 1 x fly 20m','4 x 30m starts + 2 x fly 20m','3 x 60m tempo','4 x 60m tempo','4 x 80m tempo','1 x 80m smooth-fast','1 x 100m smooth-fast','1 x 120m smooth-fast'],
  ['2 x 20m starts','3 x 20m starts + 1 x fly 15m','4 x 30m starts + 1 x fly 20m','3 x 60m tempo','4 x 60m tempo','4 x 80m tempo','1 x 80m race rhythm','1 x 100m race rhythm','1 x 120m race rhythm'],
  ['2 x 20m starts + 1 x fly 10m','3 x 20m starts + 1 x fly 15m','4 x 20m starts + 2 x fly 15m','3 x 60m tempo','4 x 60m tempo','4 x 80m tempo','1 x 60m sharp','1 x 80m sharp','1 x 100m sharp'],
  ['2 x 15m starts','3 x 20m starts','3 x 20m starts + 1 x fly 15m','3 x 50m tempo','3 x 60m tempo','4 x 60m tempo','1 x 60m smooth-fast','1 x 80m smooth-fast','1 x 100m smooth-fast'],
  ['2 x 15m starts','2 x 20m starts + 1 x fly 10m','3 x 20m starts + 1 x fly 15m','mobility only','3 x 50m easy tempo','3 x 60m easy tempo','1 x 60m rhythm','1 x 80m rhythm','1 x 100m rhythm'],
  ['2 x 10m starts','2 x 15m starts','3 x 20m starts','mobility only','mobility only','3 x 50m easy tempo','one 60m build-up only','one 80m build-up only','one 100m build-up only']
].forEach((x,i)=>add(i+36,7,'Championship Taper',[
  sprint(1,'Championship Neural Primer','keep starts and speed alive while removing fatigue',[x[0],x[1],x[2]],'full recovery',['fast, easy, finished','no grinding','save the race for race day']),tempo(2,[x[3],x[4],x[5]]),endurance(3,'Championship Rhythm','a brief confidence rehearsal only',[x[6],x[7],x[8]],'full recovery',['feel the rhythm','stop while sharp','prioritize sleep and recovery']),support(4,'Recovery & Readiness','mobility, hydration, sleep, and meet preparation',['mobility and easy walk','mobility and easy walk','mobility and easy walk'],'as needed',['leave fresh','no make-up work','competition is the priority'])
]));

module.exports={
  product:'MW Dynasty — Original 41-Week Sprint Performance Program',
  complete:true,
  coverage:'Weeks 1–41',
  provenance_note:'Every track session in this V3.2 calendar was authored for MW Dynasty. It is not a reproduction, adaptation, or week-by-week derivative of Track Wire or another coach’s program.',
  phase_map:{1:'Weeks 1–6 Foundation & Movement',2:'Weeks 7–12 Acceleration & Force',3:'Weeks 13–18 Maximum Velocity & Rhythm',4:'Weeks 19–24 Speed Endurance & Race Rhythm',5:'Weeks 25–30 Pre-Competition Conversion',6:'Weeks 31–35 Competition Preparation',7:'Weeks 36–41 Championship Taper'},
  global_rules:rules,weeks
};
