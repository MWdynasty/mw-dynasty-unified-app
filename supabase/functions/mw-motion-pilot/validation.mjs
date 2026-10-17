// Pure Stage 3 validation shared by the Edge API and Node tests.
export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_PER_DAY = 5;
export const MIME_EXT = Object.freeze({
  "video/mp4": "mp4",
  "video/quicktime": "mov"
});
export const MOVEMENTS = new Set([
  "block_start","two_point_start","three_point_start","four_point_start",
  "acceleration_30m","front_side","wickets"
]);
export const VIEWS = new Set(["side","front","rear"]);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ALLOWED_ORIGIN = /^https:\/\/(?:motion-staging\.mwdynasty\.com|mwdynastyunifiedappv31tiered13plusdeploy-[a-z0-9]+-mw-sprint\.vercel\.app)$/i;
export function validId(value) {
  return typeof value === "string" && UUID.test(value);
}
export function adult(dob, today = new Date()) {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(dob + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== dob) return false;
  const cutoff = new Date(Date.UTC(today.getUTCFullYear()-18,today.getUTCMonth(),today.getUTCDate()));
  return date <= cutoff;
}
export function pathOwned(path, uid, assessmentId) {
  const prefix=uid+"/"+assessmentId+"/";
  return validId(uid) && validId(assessmentId) &&
    typeof path === "string" && path.startsWith(prefix) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|mov|webm)$/i.test(path.slice(prefix.length));
}
export function validPrepare(input) {
  if (!input || input.consentAccepted !== true || input.consentVersion !== "pilot-v1")
    return "Recording consent must be accepted";
  if (!MOVEMENTS.has(input.movementType) || !VIEWS.has(input.cameraView))
    return "Select a supported sprint movement and camera view";
  if (!Object.prototype.hasOwnProperty.call(MIME_EXT,input.mimeType) ||
      typeof input.bytes !== "number" || !Number.isInteger(input.bytes) ||
      input.bytes < 1 || input.bytes > MAX_BYTES)
    return "Unsupported recording type or size";
  const week=input.weekNumber;
  if (week !== undefined && (typeof week !== "number" || !Number.isInteger(week) || week<1 || week>41))
    return "Invalid training week";
  return null;
}
