const assert=require('assert');
const fs=require('fs');

const outdoorSql=fs.readFileSync('supabase/migrations/20260925_high_school_outdoor_50_state_registry.sql','utf8');
const dcSql=fs.readFileSync('supabase/migrations/20260925_dc_outdoor_registry_fallback.sql','utf8');
const indoorSql=fs.readFileSync('supabase/migrations/20260925_high_school_indoor_registry.sql','utf8');
const athleteHtml=fs.readFileSync('athlete/index.html','utf8');

const US_STATES=[
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
].sort();

function registryCodes(sql,season){
  const re=new RegExp("\\(\\s*'([A-Z]{2})'\\s*,\\s*'high_school'\\s*,\\s*'"+season+"'\\s*,\\s*'school'\\s*,\\s*2027","g");
  return [...sql.matchAll(re)].map(m=>m[1]).sort();
}

const outdoor=registryCodes(outdoorSql,'outdoor');
assert.equal(outdoor.length,50,'outdoor registry must contain exactly 50 state rows');
assert.deepStrictEqual(outdoor,US_STATES,'outdoor registry must cover every U.S. state exactly once');
assert.equal(new Set(outdoor).size,50,'outdoor state codes must be unique');
assert.deepStrictEqual(registryCodes(dcSql,'outdoor'),['DC'],'DC fallback must exist separately from the 50-state count');

const expectedIndoor=['AL','CT','DC','DE','KY','MA','MD','ME','MS','NC','NH','NJ','NY','RI','VA','VT','WY'].sort();
const indoor=registryCodes(indoorSql,'indoor');
assert.equal(indoor.length,17,'indoor registry must contain 17 NFHS state-association jurisdictions');
assert.deepStrictEqual(indoor,expectedIndoor,'indoor registry must match the approved state-association championship jurisdictions');
assert.equal(new Set(indoor).size,17,'indoor jurisdiction codes must be unique');

for(const sql of [outdoorSql,dcSql,indoorSql]){
  assert(!/source_confidence[^\n]*'official'[^\n]*MW estimate/i.test(sql),'MW estimates must never be labeled official');
  assert(sql.includes('confirm/edit')||sql.includes('Confirm/Edit'),'registry migrations must preserve Confirm/Edit wording');
}

const selectorBlock=athleteHtml.match(/const MW_US_STATES=\[(.*?)\];/s)?.[1]||'';
for(const code of [...US_STATES,'DC']){
  assert(selectorBlock.includes("['"+code+"',"),'athlete state selector is missing '+code);
}

console.log('MW national season registry static QA passed');
