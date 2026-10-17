const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('athlete/motion.html','utf8');
assert.ok(html.includes("const uploadResult=await client.storage.from('motion-private')"));
assert.ok(html.includes('if(uploadResult.error)throw new Error('));
assert.ok(html.includes('uploaded=true;'));
assert.ok(!html.includes('const uploaded=await'),'Never shadow mutable upload success flag');
assert.ok(html.includes('if(prepared&&!uploaded)'),'Failed uploads should be tombstoned');
assert.ok(html.includes('savePending({assessmentId:prepared.assessmentId,userId:uploadOwner})'));
assert.ok(html.includes('restorePending(uid)'),'Reload must restore same-user unfinished upload');
assert.ok(html.includes('savePending(null)'),'Successful finalization must clear recovery state');
const start=html.indexOf('let pendingFinalization=null;');
const end=html.indexOf('function updatePendingControls(){',start);
assert.ok(start>0&&end>start,'Recovery functions missing');
const code='let activeUserId=null;\n'+html.slice(start,end)+
 '\nfunction updatePendingControls(){}\nglobalThis.__state=()=>pendingFinalization;';
const memory=new Map();
const sessionStorage={
 getItem:k=>memory.get(k)||null,
 setItem:(k,v)=>memory.set(k,v),
 removeItem:k=>memory.delete(k)
};
const ctx={sessionStorage,Date,JSON};
vm.runInNewContext(code,ctx);
const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const assessment='33333333-3333-4333-8333-333333333333';
ctx.savePending({assessmentId:assessment,userId:user});
assert.equal(ctx.__state().assessmentId,assessment);
const scopedKey='mw-motion-pilot-pending-v1-'+user;
const saved=JSON.parse(memory.get(scopedKey));
assert.deepEqual(Object.keys(saved).sort(),['assessmentId','savedAt','userId']);
ctx.restorePending(other);
assert.equal(ctx.__state(),null,'Do not show another athlete unfinished upload');
assert.ok(memory.has(scopedKey),'Switching athletes must not delete the first athlete recovery state');
ctx.restorePending(user);
assert.equal(ctx.__state().assessmentId,assessment);
saved.savedAt=Date.now()-25*60*60*1000;
memory.set(scopedKey,JSON.stringify(saved));
ctx.restorePending(user);
assert.equal(ctx.__state(),null,'Discard expired recovery pointer');
assert.equal(memory.has(scopedKey),false);
memory.set(scopedKey,'{broken');
ctx.restorePending(user);
assert.equal(ctx.__state(),null,'Reject malformed recovery data');
assert.equal(memory.has(scopedKey),false);
ctx.savePending({assessmentId:assessment,userId:user});
vm.runInNewContext('activeUserId='+JSON.stringify(user),ctx);
ctx.savePending(null);
assert.equal(memory.has(scopedKey),false);
console.log('Motion upload crash regression and reload recovery isolation passed.');
