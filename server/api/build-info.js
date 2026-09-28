module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  return res.status(200).json({
    ok:true,
    environment:process.env.VERCEL_ENV||'unknown',
    git_ref:process.env.VERCEL_GIT_COMMIT_REF||null,
    git_sha:process.env.VERCEL_GIT_COMMIT_SHA||null,
    deployment_id:process.env.VERCEL_DEPLOYMENT_ID||null
  });
};
