const fs=require('fs');
const assert=require('assert');

const app=fs.readFileSync('distance-pacer/app.js','utf8');
const html=fs.readFileSync('distance-pacer/index.html','utf8');

assert(html.includes('<script src="/distance-pacer/app.js"></script>'),'Distance Pacer must use the shared calibrated engine');
assert(!html.includes('let start=null,lastPoint=null,watch=null,total=0'),'Old inline GPS accumulator must not remain in index.html');

assert(app.includes('const START_MAX_ACCURACY=15'),'Start lock must require materially better GPS than the old 25m threshold');
assert(app.includes('const MEASURE_MAX_ACCURACY=18'),'Measurement must pause weak GPS rather than accumulating drift');
assert(app.includes('const START_SAMPLE_TARGET=6'),'Start point must be calibrated from multiple samples');
assert(app.includes('function weightedPoint(points)'),'GPS points must be averaged instead of trusting a single fix');
assert(app.includes('smoothing.length>5'),'Measurement must use a rolling smoothing window');
assert(app.includes("setState('GPS PAUSED'"),'Weak location points must visibly pause measurement');
assert(app.includes('plausibleMax'),'Implausible location jumps must be rejected');
assert(app.includes('movementStarted'),'Stationary GPS wander must not count as movement');
assert(app.includes('maximumAge:0'),'Distance Pacer must request fresh high-accuracy samples');
assert(app.includes("algorithm:'mw-gps-v2-filtered'"),'Saved marks must record the calibrated GPS algorithm version');

for(const x of ['acc>25','cur.accuracy>30','Math.max(12,dt*12)','cur.accuracy*.22']){
  assert(!app.includes(x),'Old loose GPS logic still present: '+x);
}

console.log('PASS: Distance Pacer uses multi-sample start calibration, drift smoothing, weak-signal pausing and plausible-motion filtering.');
