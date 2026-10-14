const assert=require('node:assert/strict');
const Module=require('node:module');
const founderAiPath=require.resolve('./server/api/founder-ai');
const originalLoad=Module._load;
const originalFetch=global.fetch;
const originalOpenAiKey=process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY='test-key';

Module._load=function(request,parent,isMain){
  if(parent?.filename===founderAiPath&&request==='../lib/mw-auth')return {SUPABASE_URL:'https://unit.test',SUPABASE_KEY:'test-key'};
  if(parent?.filename===founderAiPath&&request==='../lib/founder-auth')return {founderAuth:async()=>({token:'founder-token',profile:{user_id:'founder-test',first_name:'Founder'}})};
  if(parent?.filename===founderAiPath&&request==='./founder-commander-actions')return {
    invokeFounderAction:async()=>{throw new Error('Unsupported operations must never reach an action handler.');},
    normalizeActionParameters:x=>x,
    requiresCommanderApproval:()=>false
  };
  return originalLoad.call(this,request,parent,isMain);
};

global.fetch=async(url,options={})=>{
  if(String(url).includes('/v1/responses'))return {ok:true,status:200,json:async()=>({output_text:JSON.stringify({kind:'action',action:'unsupported',answer:'This account action is not connected. No change was made.'})})};
  return {ok:true,status:200,json:async()=>({})};
};

const handler=require('./server/api/founder-ai');
const response={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};

(async()=>{
  try{
    await handler({method:'POST',headers:{authorization:'Bearer test'},body:{mode:'command',message:'Send Coach Walter a password reset email.'}},response);
    assert.equal(response.statusCode,501);
    assert.equal(response.body.code,'CAPABILITY_NOT_CONNECTED');
    assert.equal(response.body.executed,false);
    assert.equal(response.body.action,'unsupported');
    assert.match(response.body.answer,/No change was made/);
    assert.equal(response.body.error,response.body.answer);
    console.log('PASS: unsupported Commander requests fail closed without queuing or executing a different action.');
  }finally{
    Module._load=originalLoad;
    global.fetch=originalFetch;
    if(originalOpenAiKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalOpenAiKey;
    delete require.cache[founderAiPath];
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
