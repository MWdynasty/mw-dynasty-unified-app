(function(){
  'use strict';
  let pending=null;
  async function request(token,body){
    const r=await fetch('/api/ai-sharing',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Sharing choices unavailable.');return d;
  }
  async function open(token,options={}){
    if(pending)return pending;
    if(!token)throw new Error('Sign in before changing sharing choices.');
    const firstUse=options.firstUse===true;
    pending=(async()=>{
      const d=await request(token);
      return new Promise(resolve=>{
        const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',firstUse?'Coach MW sharing choice':'AI & Data Sharing');
        dialog.style.cssText='background:#09131d;color:#fff;border:1px solid #d2ad55;border-radius:20px;width:min(460px,calc(100vw - 40px));max-height:85vh;padding:24px;line-height:1.5;box-sizing:border-box;overflow:auto';
        const heading=firstUse?'Before you use Coach MW':'AI & Data Sharing';
        const intro=firstUse
          ?'Coach MW uses <b>OpenAI</b> to answer your questions. If you allow it, MW sends your messages, chosen images, relevant profile details and training results to OpenAI. Voice playback sends response text.'
          :'Coach MW uses <b>OpenAI</b> to answer questions and generate voice responses. If you allow it, MW sends your messages, chosen images, relevant profile details and training results to OpenAI. Voice playback sends response text. Program import and photo scanning may send your uploaded program text or workout sheet photo.';
        const choices=firstUse
          ?'<p>This choice only controls your Coach MW use. It does not change whether a connected coach may share your records with AI. You can change or turn off your choice anytime in Profile → AI &amp; Data Sharing.</p>'
          :'<label style="display:flex;gap:12px;margin:18px 0"><input id="mwOwnAI" type="checkbox" style="min-width:24px;min-height:24px"><span>Allow my Coach MW content and training context to be shared with OpenAI.</span></label>'+(d.role==='athlete'?'<label style="display:flex;gap:12px;margin:18px 0"><input id="mwCoachAI" type="checkbox" style="min-width:24px;min-height:24px"><span>Allow my connected coach to include my training and performance records in Coach MW requests to OpenAI.</span></label>':'<p>MW automatically includes only athletes who allowed coach-to-OpenAI sharing. Do not type or upload another person’s private information without their permission.</p>')+'<p>These choices are optional. Training, timing and saved results remain available with AI off. You can change these choices here anytime. Turning sharing off prevents future AI requests; it cannot recall data already sent.</p><p><a href="/privacy.html" target="_blank" rel="noopener" style="color:#e9c369">Privacy policy</a></p>';
        const actions=firstUse
          ?'<button id="mwSharingAllow" type="button" style="min-height:48px;padding:12px 16px;border-radius:10px;background:#e9c369;color:#09131d;font-weight:800">Allow &amp; Continue</button> <button id="mwSharingCancel" type="button" style="min-height:48px;padding:12px 16px;border-radius:10px">Not Now</button>'
          :'<button id="mwSharingSave" type="button" style="min-height:48px;padding:12px;border-radius:10px;background:#e9c369;color:#09131d;font-weight:800">Save sharing choices</button> <button id="mwSharingCancel" type="button" style="min-height:48px;padding:12px;border-radius:10px">Close</button>';
        dialog.innerHTML='<h2 style="margin-top:0;color:#e9c369">'+heading+'</h2><p>'+intro+'</p>'+choices+'<p id="mwSharingError" role="status"></p>'+actions;
        document.body.append(dialog);
        const own=dialog.querySelector('#mwOwnAI'),coach=dialog.querySelector('#mwCoachAI');
        if(own)own.checked=d.ownAI;
        if(coach)coach.checked=d.coachAI;
        const finish=value=>{dialog.close();dialog.remove();resolve(value)};
        dialog.querySelector('#mwSharingCancel').onclick=()=>finish(false);
        dialog.oncancel=e=>{e.preventDefault();finish(false)};
        const save=async(btn,ownAI,coachAI)=>{
          btn.disabled=true;
          try{
            const saved=await request(token,{ownAI,coachAI,policyVersion:d.policyVersion});
            finish(saved.ownAI);
          }catch(e){
            dialog.querySelector('#mwSharingError').textContent=e.message;
            btn.disabled=false;
          }
        };
        if(firstUse){
          dialog.querySelector('#mwSharingAllow').onclick=e=>save(e.currentTarget,true,d.coachAI);
        }else{
          dialog.querySelector('#mwSharingSave').onclick=e=>save(e.currentTarget,own.checked,coach?coach.checked:false);
        }
        dialog.showModal();
      });
    })();
    try{return await pending}finally{pending=null}
  }
  window.MWAISharing={
    open,
    ensure:async token=>{
      const d=await request(token);
      return d.ownAI||await open(token,{firstUse:true});
    }
  };
})();