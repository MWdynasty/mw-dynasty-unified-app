function coachSeasonMode(tier,role){
  const r=String(role||''),t=String(tier||'');
  if(['founder_owner','admin'].includes(r)||t==='mw_sprint_performance')return 'engine';
  if(t==='intelligence')return 'insights';
  return 'none';
}
function coachSeasonCapabilities(tier,role){
  const mode=coachSeasonMode(tier,role);
  return {
    season_intelligence:mode,
    season_intelligence_insights:mode==='insights'||mode==='engine',
    season_intelligence_engine:mode==='engine'
  };
}
function athleteSeasonEngineEnabled(access={}){
  return access?.mw_training_system===true&&access?.smart_entry===true;
}
module.exports={coachSeasonMode,coachSeasonCapabilities,athleteSeasonEngineEnabled};
