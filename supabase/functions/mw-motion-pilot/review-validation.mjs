// Strict bounds for on-device, uncalibrated 2D observations. The server must
// never treat a browser-supplied measurement as verified biomechanics.
export const METRIC_NAMES=Object.freeze(['trunk_tilt_2d','knee_angle_2d','shin_tilt_2d']);
export const REVIEW_VERSION='local-pose-v1';
export function validateReview(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return 'Invalid review';
 if(!Number.isInteger(input.sampledFrames)||input.sampledFrames<5||input.sampledFrames>36)
  return 'Invalid sampled frame count';
 if(!Number.isInteger(input.poseFrames)||input.poseFrames<5||input.poseFrames>input.sampledFrames)
  return 'Invalid detected frame count';
 if(!Array.isArray(input.metrics)||input.metrics.length<1||input.metrics.length>3)
  return 'Provide 1–3 measured angles';
 const seen=new Set();
 for(const metric of input.metrics){
  if(!metric||typeof metric!=='object'||Array.isArray(metric)||
     !METRIC_NAMES.includes(metric.name)||seen.has(metric.name))return 'Invalid or duplicate metric';
  seen.add(metric.name);
  if(!Number.isInteger(metric.samples)||metric.samples<5||metric.samples>input.poseFrames)
   return 'Invalid metric sample count';
  for(const field of ['medianDegrees','earlyDegrees','lateDegrees']){
   if(typeof metric[field]!=='number'||!Number.isFinite(metric[field])||
      metric[field]<0||metric[field]>180)return 'Invalid angle measurement';
  }
 }
 return null;
}
export function sanitizedReview(input){
 const error=validateReview(input);
 if(error)throw new Error(error);
 return {
  sampled_frames:input.sampledFrames,
  pose_frames:input.poseFrames,
  metrics:input.metrics.map(m=>({
   name:m.name,samples:m.samples,
   medianDegrees:Math.round(m.medianDegrees*10)/10,
   earlyDegrees:Math.round(m.earlyDegrees*10)/10,
   lateDegrees:Math.round(m.lateDegrees*10)/10
  })),
  method:REVIEW_VERSION,
  provenance:'unverified_client_2d'
 };
}
