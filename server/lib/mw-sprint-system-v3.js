const DAY_ROLES={
  1:'MON MAJOR STRESS',
  2:'TUE TECH + LIFT',
  3:'WED RECOVERY',
  4:'THU TECH + LIFT',
  5:'FRI MAJOR STRESS / RACE SLOT'
};

const WARMUP_BIG_FRIDAYS=new Set([1,2,4,6]);

const DEFAULT_RECOVERY={
  1:'Use the recovery written in the prescription. No heavy lift after Monday major stress.',
  2:'Lift A after track. Technical quality and bar speed come before load.',
  3:'No heavy lifting. Restore readiness for Thursday and Friday.',
  4:'Lift B after track in general preparation. Reduce to a micro-dose or remove it as competition demands rise.',
  5:'No make-up lifting. If a meet replaces the session, the meet is the stress.'
};

const WEEKS=[
null,
{p:1,n:'Foundation - Capacity + Mechanics',o:'Establish technical language and begin real work-capacity development.',w:[
'8 x 200m @ 65-70%. Rest 75-90 sec. Goal: relaxed rhythm, posture and repeatability.',
'Front-side mechanics + 6 x 30m progressive accelerations @ 80-85%.',
'Mobility + 4 x 100m grass strides @ 55-60%. Keep breathing easy.',
'Rhythm mechanics + 6 x 80m progressive runs @ 70-80%.',
'6 x 100m hill @ strong controlled effort. Walk-back + 2 min. Maintain projection and posture.'
]},
{p:1,n:'Foundation - Capacity + Mechanics',o:'Extend tempo capacity and reinforce force direction.',w:[
'6 x 300m @ 65-70%. Rest 90 sec. Smooth first 100m, settle, finish with posture intact.',
'Front-side wicket teaching + 6 x 20m hill accelerations.',
'Mobility + recovery wicket rehearsal + 4 x 100m @ 55-60%.',
'Wicket rhythm + 5 x 100m @ 70-78%.',
'5 x 150m hill @ controlled hard effort. Walk-back + 2-3 min.'
]},
{p:1,n:'Foundation - Capacity + Mechanics',o:'Raise extensive volume while introducing faster Friday rhythm.',w:[
'8 x 300m @ 65-72%. Rest 90 sec. Stop if posture/rhythm degrades beyond acceptable tempo form.',
'Technical acceleration + 4 x 30m + 2 x 40m @ 85-90%.',
'Recovery wickets + mobility + 4-6 x 100m @ 55-60%.',
'Front-side + rhythm wickets, then 6 x 120m @ 70-78%.',
'5 x 200m @ 75-80%. Rest 3-4 min. Controlled strength-endurance, not racing.'
]},
{p:1,n:'Foundation - Absorption',o:'Reduce load, check mechanics, preserve movement quality.',w:[
'5 x 200m @ 65-70%. Rest 90 sec. Technical tempo only.',
'Acceleration checkpoint: 4 x 20m + 2 x 30m.',
'Recovery wickets + mobility only; optional 4 x 80m @ 55%.',
'Wicket posture checkpoint + 4 x 80m @ 70-75%.',
'4 x 150m hill @ controlled effort OR 4 x 150m flat @ 75-80% if hills are unavailable.'
]},
{p:1,n:'Foundation - Capacity + Tissue',o:'Second loading wave: longer tempo and stronger Friday execution.',w:[
'2 sets of 4 x 300m @ 65-72%. Rest 75-90 sec between reps and 5 min between sets.',
'Front-side wickets + 6 x 30m resisted or short-hill accelerations.',
'Recovery wickets + mobility + 5 x 100m @ 55-60%.',
'Rhythm wickets + 6 x 100m progressive @ 72-80%.',
'4 x 200m @ 80-84%. Rest 5 min. Hold form and distribution.'
]},
{p:1,n:'Foundation - Force Endurance',o:'Develop hill strength-endurance without losing technical identity.',w:[
'6 x 300m @ 70-75%. Rest 90-120 sec.',
'Hill mechanics: wicket rehearsal on flat + 6 x 40m technical hill accelerations.',
'Recovery wickets + dynamic mobility + 4 x 120m @ 55-60%.',
'Front-side wickets + 5 x 120m @ 72-80%.',
'3 x 250m hill @ strong controlled effort. Full walk-back + 4-5 min. Quality over survival.'
]},
{p:1,n:'Foundation - Capacity Peak',o:'Peak the first general-preparation loading wave.',w:[
'8 x 300m @ 68-74%. Rest 90 sec. Final two reps must still look technically organized.',
'Acceleration mechanics + 6 x 40m @ 88-92%.',
'Recovery wickets + mobility + 4 x 100m @ 55-60%.',
'Wicket rhythm + 6 x 120m @ 75-82%.',
'2 sets of 2 x 200m @ 82-85%. Rest 90 sec between reps and 6 min between sets.'
]},
{p:1,n:'Foundation - Reload',o:'Absorb the first block and prepare for speed development.',w:[
'5 x 300m @ 65-70%. Rest 90 sec. Deliberately smooth.',
'Acceleration checkpoint + 4 x 30m @ 90%.',
'Recovery wickets + mobility only.',
'Wicket checkpoint + 4 x 100m @ 70-75%.',
'4 x 150m @ 82-86%. Rest 5-6 min. Fast relaxed, never forced.'
]},
{p:2,n:'Strength + Speed Development',o:'Keep capacity while raising acceleration and speed quality.',w:[
'5 x 250m @ 75-80%. Rest 3 min. Controlled intensive tempo.',
'Front-side wickets + 6 x 40m acceleration @ 90-93%.',
'Recovery wickets + 5 x 100m @ 55-60% + mobility.',
'Max-velocity wickets + 4 x fly 20m with a 25-30m build. Full 4-5 min recovery.',
'5 x 150m @ 85-88%. Rest 5 min.'
]},
{p:2,n:'Strength + Speed Development',o:'Raise strength-endurance and max-velocity exposure.',w:[
'4 x 300m @ 76-80%. Rest 4 min.',
'Acceleration wickets + 4 x 30m + 2 x 50m @ 92-95%.',
'Recovery wickets + mobility + 4 x 120m @ 55-60%.',
'Max-velocity wickets + 5 x fly 20m. Full recovery.',
'4 x 200m @ 85-88%. Rest 6 min.'
]},
{p:2,n:'Strength + Speed Development',o:'Blend capacity, acceleration and longer high-quality running.',w:[
'3 x 350m @ 75-80%. Rest 5 min. Even distribution; no first-rep race.',
'Front-side wickets + 6 x 50m acceleration @ 92-95%.',
'Recovery wickets + 4 x 100m easy + mobility.',
'Max-velocity wickets + 4 x fly 30m. Rest 5-6 min.',
'3 x 250m @ 84-88%. Rest 7 min.'
]},
{p:2,n:'Strength + Speed - Absorption',o:'Unload while checking acceleration and fly quality.',w:[
'4 x 200m @ 70-75%. Rest 2-3 min.',
'Acceleration checkpoint: 4 x 30m timed or quality reps.',
'Recovery wickets + mobility.',
'Max-velocity checkpoint: 3 x fly 20m. Full recovery.',
'4 x 150m @ 82-85%. Rest 5 min.'
]},
{p:2,n:'Strength + Speed Development',o:'Begin event-capacity separation while preserving a shared sprint base.',w:[
'4 x 300m @ 78-82%. Rest 4-5 min.',
'Acceleration wickets + 3 x 30m blocks or three-point starts + 3 x 50m @ 94-96%.',
'Recovery wickets + 5 x 100m @ 55-60%.',
'Max-velocity wickets + 4 x fly 30m.',
'4 x 180m @ 86-89%. Full quality recovery.'
]},
{p:2,n:'Strength + Speed Development',o:'Increase force and speed reserve while maintaining work capacity.',w:[
'2 sets of 3 x 250m @ 78-82%. Rest 3 min between reps and 7 min between sets.',
'Acceleration wickets + 6 x 40m @ 94-96%.',
'Recovery wickets + mobility + 4 x 120m easy.',
'Max-velocity wickets + 3 x fly 30m + 2 x 80m fast-relaxed @ 90%.',
'4 x 200m @ 88-90%. Rest 7 min.'
]},
{p:2,n:'Strength + Speed Development',o:'Highest-quality week of the block: speed, rhythm and controlled special endurance.',w:[
'3 x 300m @ 82-85%. Rest 6 min.',
'Blocks or acceleration + 4 x 30m + 2 x 60m @ 95-97%.',
'Recovery wickets + mobility + 4 x 100m easy.',
'Max-velocity wickets + 4 x fly 30m.',
'3 x 200m @ 90%. Rest 8-10 min.'
]},
{p:2,n:'Strength + Speed - Reload',o:'Consolidate before pre-competition conversion.',w:[
'4 x 200m @ 72-78%. Rest 3 min.',
'Acceleration checkpoint + 4 x 30m.',
'Recovery wickets + mobility only.',
'Max-velocity checkpoint: 3 x fly 30m.',
'3 x 150m @ 85-88%. Rest 6 min.'
]},
{p:3,n:'Power + Pre-Competition',o:'Convert general capacity into race-useful speed endurance.',w:[
'3 x 200m @ 88-90%. Rest 8-10 min.',
'Block or acceleration wickets + 4 x 30m + 2 x 60m @ 95-97%.',
'Recovery wickets + 4 x 100m @ 55-60% + mobility.',
'Max-velocity wickets + 3 x fly 30m + 2 x 80m @ 92%.',
'3 x 180m @ 90-92%. Full recovery.'
]},
{p:3,n:'Power + Pre-Competition',o:'Introduce split-run stress while protecting velocity.',w:[
'2 sets of 150m + 100m. Rest 60 sec within the split and 8 min between sets. Controlled race rhythm.',
'Acceleration wickets + 5 x 40m @ 95-97%.',
'Recovery wickets + mobility + 4 x 100m easy.',
'Max-velocity wickets + 4 x fly 30m.',
'2 sets of 150m + 100m. Rest 60-90 sec within the split and 10-12 min between sets.'
]},
{p:3,n:'Power + Pre-Competition',o:'Build speed reserve and event-specific fatigue resistance.',w:[
'3 x 200m @ 88-90%. Rest 8-10 min.',
'Blocks + 4 x 30m + 2 x 60m @ 96-98%.',
'Recovery wickets + mobility only.',
'Max-velocity wickets + 3 x fly 40m.',
'3 x 200m @ 90-93%. Rest 10-12 min.'
]},
{p:3,n:'Power + Pre-Competition - Absorb',o:'Reduce volume and preserve nervous-system quality.',w:[
'3 x 150m @ 80-85%. Rest 5 min.',
'Acceleration: 4 x 30m @ 95%.',
'Recovery wickets + mobility.',
'Max-velocity wickets + 3 x fly 20m.',
'2 x 150m @ 90%. Rest 8 min. Finish feeling sharp.'
]},
{p:3,n:'Power + Pre-Competition',o:'Rebuild specific stress after unload.',w:[
'2 x 200m @ 88-90%. Rest 10 min, then 2 x 120m fast-relaxed @ 90%.',
'Blocks or acceleration wickets + 4 x 30m + 2 x 50m.',
'Recovery wickets + 4 x 100m easy.',
'Max-velocity wickets + 4 x fly 30m.',
'2 x 180m + 1 x 200m. Full recovery; race distribution.'
]},
{p:3,n:'Power + Pre-Competition',o:'Race modeling with full technical accountability.',w:[
'3 x 250m @ 88-92%. Rest 10 min.',
'Starts + 4 x 30m blocks + 2 x 60m.',
'Recovery wickets + mobility.',
'Max-velocity wickets + 2 x fly 40m + 2 x 80m race rhythm.',
'2 x 180m race-model reps. Full recovery.'
]},
{p:3,n:'Power + Pre-Competition',o:'Highest event-specific stress before competition phase.',w:[
'3 x 200m @ 92%. Full 10-12 min recovery.',
'Acceleration wickets + 4 x 30m blocks + 2 x 50m.',
'Recovery wickets + 4 x 100m easy.',
'Max-velocity wickets + 3 x fly 30m.',
'200m + 150m + 120m. Full recovery; quality only.'
]},
{p:3,n:'Power + Pre-Competition - Checkpoint',o:'Unload, test readiness, and transition to meet-controlled loading.',w:[
'3 x 150m @ 82-86%. Rest 6 min.',
'Acceleration checkpoint: 3 x 30m + 1 x 60m.',
'Recovery wickets + mobility only.',
'Max-velocity checkpoint: 2-3 x fly 30m.',
'1-2 x 180m race-specific quality reps. Stop while sharp.'
]},
{p:4,n:'Competition',o:'Open competition phase; teach weekly stress to orbit the meet.',w:[
'2 x 180m @ 88-90% + 2 x 80m fast-relaxed. Full recovery.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: 2 x 180m race-model reps.'
]},
{p:4,n:'Competition',o:'Maintain speed while reducing unnecessary fatigue.',w:[
'3 x 150m @ 90-92%. Rest 8 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: 2 x 200m @ race-model intent.'
]},
{p:4,n:'Competition',o:'Competition rhythm and speed reserve.',w:[
'2 x 200m @ 88-90%. Rest 10 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: split run 150m + 100m with race-model intent.'
]},
{p:4,n:'Competition',o:'Absorb early meets and preserve quality.',w:[
'4 x 120m @ 85-88%. Rest 6 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: 2 x 150m @ 90%.'
]},
{p:4,n:'Competition',o:'Rebuild a small specific load while the race schedule is active.',w:[
'2 x 180m @ 90-92%. Rest 10 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: 1-2 x 180m race-model reps.'
]},
{p:4,n:'Competition',o:'Keep acceleration and max velocity alive between competitions.',w:[
'3 x 150m @ 90%. Rest 8 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: 2 x 180m.'
]},
{p:4,n:'Competition',o:'Last meaningful competition-phase loading wave.',w:[
'2 x 200m @ 90%. Rest 10-12 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: 200m + 150m with full recovery.'
]},
{p:4,n:'Competition',o:'Unload without losing race rhythm.',w:[
'3 x 120m @ 85-88%. Rest 6 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET if scheduled. If no meet: 1 x 180m race-model rep + 2 x 60m fast-relaxed.'
]},
{p:4,n:'Competition',o:'Prepare to enter championship phase fresh but fast.',w:[
'2 x 150m @ 90-92%. Rest 8-10 min.',
'Starts or acceleration wickets + 3-4 x 30m and 2 x 50-60m.',
'Recovery wickets + mobility + optional 3-4 x 100m @ 55-60% if recovery is normal.',
'Competition-rhythm wickets + 2-3 fly 20-30m OR 2 x 60m fast-relaxed.',
'MEET or 1 x 180m race model. No extra conditioning afterward.'
]},
{p:5,n:'Peak + Championship',o:'Begin tapering volume while retaining high-speed contacts.',w:[
'2 x 150m @ 90-92%. Full 10 min recovery.',
'Front-side or start wickets + 3-4 short accelerations.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed.',
'MEET or 1-2 x 180m race-specific quality reps.'
]},
{p:5,n:'Peak + Championship',o:'Sharpen acceleration and maximum velocity.',w:[
'3 x 120m @ 92%. Rest 8 min.',
'Front-side or start wickets + 3-4 short accelerations.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed.',
'MEET or 2 x 150m at high quality.'
]},
{p:5,n:'Peak + Championship',o:'Maintain race-specific rhythm with reduced total stress.',w:[
'2 x 150m @ 92-94%. Rest 10 min.',
'Front-side or start wickets + 3-4 short accelerations.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed.',
'MEET or 1 x 180m race-model rep + 2 x 60m.'
]},
{p:5,n:'Peak + Championship',o:'Peak speed exposure with minimal unnecessary work.',w:[
'1 x 180m @ 90% + 2 x 80m @ 95%. Full recovery.',
'Front-side or start wickets + 3-4 short accelerations.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed.',
'MEET or 1 x 180m high-quality event rep.'
]},
{p:5,n:'Peak + Championship',o:'Championship preparation: reduce volume again.',w:[
'2 x 120m @ 92-95%. Rest 8-10 min.',
'Front-side or start wickets + 3-4 short accelerations.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed.',
'MEET or 1 x 180m race-specific quality rep.'
]},
{p:5,n:'Peak + Championship',o:'Preserve speed and remove residual fatigue.',w:[
'1 x 150m @ 92% + 2 x 60m @ 95%. Full recovery.',
'Front-side or start wickets + 3-4 short accelerations.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed.',
'MEET or 2 x 80m fast-relaxed after the Competition Warm-Up.'
]},
{p:5,n:'Peak + Championship',o:'Final taper: every rep must increase confidence.',w:[
'2 x 80m @ 95% with full recovery.',
'Front-side or start wickets + 3-4 short accelerations.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed.',
'Priority meet or 1 x 80m primer if no meet.'
]},
{p:5,n:'Peak + Championship',o:'Championship week: arrive fast, coordinated and fresh.',w:[
'2 x 60m fast-relaxed + 2 x 30m starts. Full recovery; no fatigue accumulation.',
'Front-side or start wickets + 3-4 short accelerations. Strength is optional neural maintenance only.',
'Recovery wickets + mobility. Optional easy strides only if they improve readiness.',
'Competition-rhythm wickets + 2 x fly 20m OR 2 x 60m fast-relaxed. No fatigue-producing lift.',
'CHAMPIONSHIP / priority competition. If the race is Saturday, Friday = Competition Warm-Up + 2-3 low-volume wicket passes + 2 x 30m starts only.'
]}
];

const EVENT_400={
  13:{5:'3 x 250m @ 84-88%. Full quality recovery.'},
  15:{5:'2 x 300m @ 88-90%. Rest 8-10 min.'},
  17:{1:'3 x 250m @ 85-88%. Rest 7 min.',5:'2 x 300m @ 90%. Full recovery.'},
  18:{1:'2 sets of 250m + 150m. Rest 60-90 sec within the split and 8-10 min between sets.',5:'2 sets of 300m + 150m. Rest 60-90 sec within the split and 10-12 min between sets.'},
  19:{1:'2 x 300m @ 88-90%. Rest 10 min.',5:'2 x 300m @ 90-92%. Rest 10-12 min.'},
  20:{1:'2 x 250m @ 80-85%. Rest 7 min.'},
  21:{1:'2 x 300m @ 88-90%. Rest 10 min, then 2 x 120m fast-relaxed @ 90%.',5:'300m + 200m + 150m. Full recovery; race distribution.'},
  22:{5:'2 x 300m race-model reps. Full recovery.'},
  23:{1:'2 x 350m @ 88-90%. Full 10-12 min recovery.',5:'300m + 200m + 150m. Full recovery; quality only.'},
  24:{5:'1-2 x 300m race-specific quality reps. Stop while sharp.'},
  25:{1:'2 x 250m @ 88-90% + 2 x 80m fast-relaxed. Full recovery.',5:'MEET if scheduled. If no meet: 2 x 300m race-model reps.'},
  26:{5:'MEET if scheduled. If no meet: 2 x 300m @ race-model intent.'},
  27:{1:'2 x 300m @ 88-90%. Rest 10 min.',5:'MEET if scheduled. If no meet: split run 300m + 150m with race-model intent.'},
  29:{1:'2 x 250m @ 90-92%. Rest 10 min.',5:'MEET if scheduled. If no meet: 1-2 x 300m race-model reps.'},
  30:{5:'MEET if scheduled. If no meet: 2 x 250m.'},
  31:{1:'2 x 300m @ 90%. Rest 10-12 min.',5:'MEET if scheduled. If no meet: 300m + 200m with full recovery.'},
  32:{5:'MEET if scheduled. If no meet: 1 x 300m race-model rep + 2 x 60m fast-relaxed.'},
  33:{5:'MEET or 1 x 250-300m race model. No extra conditioning afterward.'},
  34:{1:'2 x 200m @ 90-92%. Full 10 min recovery.',5:'MEET or 1-2 x 250-300m race-specific quality reps.'},
  35:{5:'MEET or 2 x 200m at high quality.'},
  36:{5:'MEET or 1 x 250m race-model rep + 2 x 60m.'},
  37:{1:'1 x 250m @ 90% + 2 x 80m @ 95%. Full recovery.',5:'MEET or 1 x 250m high-quality event rep.'},
  38:{5:'MEET or 1 x 250m race-specific quality rep.'}
};

function normalizeEventGroup(value){
  const values=Array.isArray(value)?value:[value];
  return values.some(v=>/400/.test(String(v||'')))?'400':'100_200';
}

function warmupFor(week,day){
  if(day===3)return 'Big Warm-Up';
  if(day===5 && WARMUP_BIG_FRIDAYS.has(Number(week)))return 'Big Warm-Up';
  return 'Competition Warm-Up';
}

function wicketFor(week,day,work){
  const w=Number(week),x=String(work||'');
  if(day===1)return {type:'Performance wickets',passes:'4-6',spacing:'medium-to-long progressive spacing',intent:'posture, rhythm, ground coverage and backward ground velocity without reaching'};
  if(day===2)return {type:'Teaching / front-side wickets',passes:'5-8',spacing:'shorter individualized spacing',intent:'posture, step-over, attack down and projection'};
  if(day===3)return {type:'Recovery wickets',passes:'3-5 easy',spacing:'short spacing',intent:'low-aggression rehearsal of front-side positions and rhythm'};
  if(day===4 && w>=25)return {type:'Competition-rhythm wickets',passes:'3-5',spacing:'moderate-to-long individualized spacing',intent:'race-day rhythm, relaxation and precise front-side mechanics'};
  if(day===4 && w>=9)return {type:'Max-velocity wickets',passes:'4-6',spacing:'progressive medium-to-long spacing',intent:'upright posture, front-side action, attack down and covering ground'};
  if(day===4)return {type:'Rhythm / development wickets',passes:'4-6',spacing:'moderate progressive spacing',intent:'relaxed cadence, posture and front-side timing'};
  if(/hill/i.test(x))return {type:'Projection wickets',passes:'3-5',spacing:'short-to-medium spacing',intent:'force direction and attacking down before hill work'};
  if(/MEET|race|championship/i.test(x))return {type:'Competition wickets',passes:'2-4',spacing:'individualized race-ready spacing',intent:'low-volume, high-precision competition rhythm'};
  return {type:'Rhythm-to-performance wickets',passes:'3-5',spacing:'progressive spacing',intent:'transition from technical front-side action into faster ground coverage'};
}

function recoveryFor(day,week){
  if(day===4 && Number(week)>=25)return 'Protect race readiness. Thursday lifting is optional and meet-dependent; no fatigue-producing extras.';
  if(day===2 && Number(week)>=34)return 'Optional neural maintenance only. Stop while bar speed and technique are crisp.';
  if(day===2 && Number(week)>=25)return 'Reduced strength maintenance only after track; preserve Friday/Saturday race readiness.';
  return DEFAULT_RECOVERY[day]||'Recover as prescribed.';
}

function getTrackWeek(week,eventGroup='100_200'){
  const n=Math.max(1,Math.min(41,Math.trunc(Number(week)||1)));
  const base=WEEKS[n];
  if(!base)return null;
  const eg=normalizeEventGroup(eventGroup);
  const override=EVENT_400[n]||{};
  const sessions=[1,2,3,4,5].map(day=>{
    const work=(eg==='400'&&override[day])?override[day]:base.w[day-1];
    return {
      day,
      role:DAY_ROLES[day],
      title:DAY_ROLES[day],
      focus:base.o,
      warmup:warmupFor(n,day),
      wickets:wicketFor(n,day,work),
      work,
      recovery:recoveryFor(day,n),
      eventGroup:eg,
      intensity:day===3?'recovery / low':(day===2||day===4?'technical / quality':'major stress')
    };
  });
  return {
    week:n,
    phase:base.p,
    phaseName:base.n,
    objective:base.o,
    eventGroup:eg,
    eventLabel:eg==='400'?'400m':'100m / 200m',
    sessions
  };
}

module.exports={WEEKS,EVENT_400,normalizeEventGroup,getTrackWeek,warmupFor,wicketFor};
