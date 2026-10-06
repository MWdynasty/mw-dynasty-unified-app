(function(){
  'use strict';
  let pending=null;
  async function request(token,body){
    const r=await fetch('/api/ai-sharing',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Sharing choices unavailable.');return d;
  }
  async function open(token){
    if(pending)return pending;
    if(!token)throw new Error('Sign in before changing sharing choices.');
    pending=(async()=>{
    const d=await request(token);
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','AI & Data Sharing');
      dialog.style.cssText='background:#09131d;color:#fff;border:1px solid #d2ad55;border-radius:20px;width:min(460px,calc(100vw - 40px));max-height:85vh;padding:24px;line-height:1.5;box-sizing:border-box;overflow:auto';
      dialog.innerHTML='<h2 style="margin-top:0;color:#e9c369">AI & Data Sharing</h2><p>Coach MW uses <b>OpenAI</b> to answer questions and generate voice responses. If you allow it, MW sends your messages, chosen images, relevant profile details and training results to OpenAI. Voice playback sends response text. Program import may send your uploaded program text.</p><label style="display:flex;gap:12px;margin:18px 0"><input id="mwOwnAI" type="checkbox" style="min-width:24px;min-height:24px"><span>Allow my Coach MW content and training context to be shared with OpenAI.</span></label>'+(d.role==='athlete'?'<label style="display:flex;gap:12px;margin:18px 0"><input id="mwCoachAI" type="checkbox" style="min-width:24px;min-height:24px"><span>Allow my connected coach to include my training and performance records in Coach MW requests to OpenAI.</span></label>':'<p>MW automatically includes only athletes who allowed coach-to-OpenAI sharing. Do not type or upload another person’s private information without their permission.</p>')+'<p>These choices are optional. Training, timing and saved results remain available with AI off. You can change these choices here anytime. Turning sharing off prevents future AI requests; it cannot recall data already sent.</p><p><a href="/privacy.html" target="_blank" rel="noopener" style="color:#e9c369">Privacy policy</a></p><p id="mwSharingError" role="status"></p><button id="mwSharingSave" type="button" style="min-height:48px;padding:12px;border-radius:10px;background:#e9c369;color:#09131d;font-weight:800">Save sharing choices</button> <button id="mwSharingCancel" type="button" style="min-height:48px;padding:12px;border-radius:10px">Close</button>';
      document.body.append(dialog);const own=dialog.querySelector('#mwOwnAI'),coach=dialog.querySelector('#mwCoachAI');own.checked=d.ownAI;if(coach)coach.checked=d.coachAI;
      const finish=value=>{dialog.close();dialog.remove();resolve(value)};
      dialog.querySelector('#mwSharingCancel').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false)};
      dialog.querySelector('#mwSharingSave').onclick=async()=>{const btn=dialog.querySelector('#mwSharingSave');btn.disabled=true;try{const saved=await request(token,{ownAI:own.checked,coachAI:coach?coach.checked:false,policyVersion:d.policyVersion});finish(saved.ownAI)}catch(e){dialog.querySelector('#mwSharingError').textContent=e.message;btn.disabled=false}};
      dialog.showModal();
    });})();
    try{return await pending}finally{pending=null}
  }
  window.MWAISharing={open,ensure:async token=>(await request(token)).ownAI||await open(token)};
})();
