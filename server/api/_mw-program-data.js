// Canonical MW Dynasty program data.
// Track: original MW Dynasty V3.2 calendar. Strength: MW-owned strength library.
// No legacy or third-party week-by-week track calendar is retained here.
const TRACK=require('../lib/mw-original-track-program');
const strength=require('../../source/mw-strength-knowledge-41-weeks.json');

module.exports={TRACK,STRENGTH:strength.weeks};
