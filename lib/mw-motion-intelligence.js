/* MW Dynasty Motion Intelligence: pure assessment planning & validation foundation.
 * This does NOT process videos, store records, or authorize uploads.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MWMotionIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const MOVEMENTS = Object.freeze({
    block_start: 'Block Start',
    two_point_start: 'Two-Point Start',
    three_point_start: 'Three-Point Start',
    four_point_start: 'Four-Point Start',
    wickets: 'Wicket Drill',
    front_side: 'Front-Side Mechanics'
  });
  const CAMERA_VIEWS = Object.freeze(['side', 'front', 'rear']);
  const STATES = Object.freeze(['scheduled', 'skipped', 'queued', 'processing', 'needs_better_video', 'analyzed', 'reviewed', 'failed']);
  const LIMITS = Object.freeze({ maxFiles: 2, maxDurationSeconds: 30, maxBytesPerFile: 100 * 1024 * 1024 });
  const TRANSITIONS = Object.freeze({
    scheduled: ['skipped', 'queued'],
    skipped: ['queued'],
    queued: ['processing', 'failed'],
    processing: ['needs_better_video', 'analyzed', 'failed'],
    needs_better_video: ['queued'],
    analyzed: ['reviewed'],
    reviewed: [],
    failed: ['queued']
  });

  function assertWeek(week) {
    if (!Number.isInteger(week) || week < 1 || week > 41) throw new RangeError('weekNumber must be 1–41');
  }
  function createTuesdayAssessment({ weekNumber, workoutId, athleteId, movementType = 'block_start' }) {
    assertWeek(weekNumber);
    if (!workoutId || !athleteId) throw new Error('workoutId and athleteId are required');
    if (!Object.prototype.hasOwnProperty.call(MOVEMENTS, movementType)) throw new Error('Unsupported movementType');
    return {
      weekNumber, workoutId, athleteId, movementType,
      scheduledDay: 'tuesday', cameraView: 'side', status: 'scheduled',
      optionalForWorkoutCompletion: true,
      standardizedReview: weekNumber === 1 || (weekNumber - 1) % 4 === 0,
      suggestedClips: 2
    };
  }
  function transitionAssessment(currentStatus, nextStatus) {
    if (!STATES.includes(currentStatus) || !STATES.includes(nextStatus) || !TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new Error('Invalid assessment status transition');
    }
    return nextStatus;
  }
  function validateCaptureMetadata({ movementType, cameraView, files }) {
    const errors = [];
    if (!Object.prototype.hasOwnProperty.call(MOVEMENTS, movementType)) errors.push('Invalid movement');
    if (!CAMERA_VIEWS.includes(cameraView)) errors.push('Invalid camera view');
    if (!Array.isArray(files) || files.length < 1 || files.length > LIMITS.maxFiles) errors.push('Provide 1–2 clips');
    if (Array.isArray(files)) files.forEach((file, index) => {
      if (!file || !['video/mp4','video/quicktime','video/webm'].includes(file.mimeType)) errors.push('Clip ' + (index + 1) + ': unsupported video type');
      if (!file || !Number.isFinite(file.bytes) || file.bytes <= 0 || file.bytes > LIMITS.maxBytesPerFile) errors.push('Clip ' + (index + 1) + ': invalid size');
      if (!file || !Number.isFinite(file.durationSeconds) || file.durationSeconds <= 0 || file.durationSeconds > LIMITS.maxDurationSeconds) errors.push('Clip ' + (index + 1) + ': invalid duration');
    });
    return { valid: errors.length === 0, errors };
  }
  return Object.freeze({ MOVEMENTS, CAMERA_VIEWS, STATES, LIMITS, createTuesdayAssessment, transitionAssessment, validateCaptureMetadata });
});
