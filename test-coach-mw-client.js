const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.argv[2] || __dirname;
const appSource = fs.readFileSync(path.join(root, 'coach/app.js'), 'utf8');
const voiceSource = fs.readFileSync(path.join(root, 'coach/voice-parity.js'), 'utf8');
const coachHtml = fs.readFileSync(path.join(root, 'coach/index.html'), 'utf8');
const clientPaths = [...coachHtml.matchAll(/<script src="(\/coach\/[^"]+)"/g)]
  .map(match => match[1].split('?')[0].slice(1));
assert.equal(clientPaths.length, 2, 'Coach page must load the app and voice companion');
assert.equal(fs.readFileSync(path.join(root, clientPaths[0]), 'utf8'), appSource, 'served app must match tested source');
assert.equal(fs.readFileSync(path.join(root, clientPaths[1]), 'utf8'), voiceSource, 'served voice companion must match tested source');
const start = appSource.indexOf('function coachMWPage(){');
const end = appSource.indexOf('function membershipPage', start);
assert.ok(start >= 0 && end > start, 'Coach MW page must exist');

// Execute the real Coach page and voice companion together. This small DOM fixture
// deliberately models textContent as a childList replacement even if text is equal.
// It is not an iPhone/WebKit rendering test; all HTTP and media are synthetic.
function fixture(saved = []) {
  let context, observing = false, pending = false, observer, deliveries = 0, now = 0, timerId = 0;
  const timers = new Map(), calls = [], errors = [], revokes = [], audios = [];
  let reply = {status:200, answer:'Verified Coach MW answer'}, deferReply = null, navigation = 0;
  const connected = (node) => {for (let n=node;n;n=n.parentNode) if(n===document.body)return true;return false;};
  const mutate = (node) => {if(observing && connected(node))pending=true;};
  function matches(node, selector) {
    if(selector.startsWith('#'))return node.id===selector.slice(1);
    if(selector.startsWith('.'))return node.className.split(/\s+/).includes(selector.slice(1));
    const attr=selector.match(/^\[([^=\]]+)\]$/);
    if(attr)return Object.hasOwn(node.attrs,attr[1]);
    return node.tagName===selector.toUpperCase();
  }
  class Element {
    constructor(tag) {
      this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;
      this.attrs={};this.dataset={};this.style={};this.disabled=false;this.value='';
      this._text='';this._class='';
      this.classList={
        add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},
        remove:(...names)=>{this.className=this.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ');},
        contains:name=>this.className.split(/\s+/).includes(name)
      };
    }
    get id(){return this.attrs.id||'';} set id(v){this.attrs.id=v;}
    get className(){return this._class;} set className(v){this._class=String(v);}
    get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
    set textContent(v){for(const n of this.children)n.parentNode=null;this.children=[];this._text=String(v);mutate(this);}
    get innerHTML(){return this.textContent;}
    set innerHTML(html) {
      this.textContent='';
      const stack=[this];
      for(const token of String(html).match(/<[^>]+>|[^<]+/g)||[]){
        if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
        if(token.startsWith('<')){
          const tag=token.match(/^<([a-z0-9]+)/i)?.[1];if(!tag)continue;
          const n=new Element(tag);
          for(const a of token.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g))n.setAttribute(a[1],a[2]??a[3]);
          stack[stack.length-1].appendChild(n);
          if(!['input','img','br','meta','link'].includes(tag))stack.push(n);
        }else{
          stack[stack.length-1]._text+=token.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
        }
      }
      mutate(this);
    }
    setAttribute(name,value) {
      this.attrs[name]=String(value);
      if(name==='class')this.className=value;
      if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
    }
    appendChild(n){if(n.parentNode)n.remove();n.parentNode=this;this.children.push(n);mutate(this);return n;}
    append(...nodes){for(const n of nodes)this.appendChild(n);}
    remove(){const p=this.parentNode;if(p){p.children=p.children.filter(x=>x!==this);this.parentNode=null;mutate(p);}}
    querySelectorAll(selector){
      const parts=selector.split(',').map(s=>s.trim());
      const result=[];
      const walk=(n)=>{for(const child of n.children){
        if(parts.some(part=>{
          const bits=part.split(/\s+/);
          if(!matches(child,bits[bits.length-1]))return false;
          return bits.length===1||!!child.parentNode?.closest(bits[0]);
        }))result.push(child);
        walk(child);
      }};
      walk(this);return result;
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){for(let n=this;n;n=n.parentNode)if(matches(n,selector))return n;return null;}
    focus(){} blur(){} scrollIntoView(){}
    click(){
      if(this.disabled)return;
      let stopped=false;
      const event={target:this,preventDefault(){},stopImmediatePropagation(){stopped=true;}};
      for(const fn of document.listeners.click||[]){fn(event);if(stopped)return;}
      this.onclick?.(event);
    }
    get scrollHeight(){return this.children.length*100;}
    get isConnected(){return connected(this);}
  }
  const document={
    body:new Element('body'),listeners:{},
    querySelectorAll:s=>document.body.querySelectorAll(s),
    querySelector:s=>document.body.querySelector(s),
    getElementById:id=>document.querySelector('#'+id),
    createElement:tag=>new Element(tag),
    createTextNode:text=>{const e=new Element('text');e._text=String(text);return e;},
    addEventListener:(name,fn)=>(document.listeners[name]||=[]).push(fn)
  };
  const storage=new Map([['mwCoachProConversation',JSON.stringify(saved)]]);
  const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  class MutationObserver {
    constructor(cb){this.cb=cb;observer=this;}
    observe(){observing=true;}
  }
  class Audio {
    constructor(url){this.url=url;this.paused=false;audios.push(this);}
    pause(){this.paused=true;}
    play(){return Promise.resolve();}
  }
  const setTimeout=(fn,ms=0)=>{const id=++timerId;timers.set(id,{fn,at:now+ms});return id;};
  context=vm.createContext({
    document,sessionStorage,MutationObserver,AbortController,Audio,
    URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:url=>revokes.push(url)},
    console:{warn:(...a)=>errors.push(a),error:(...a)=>errors.push(a),log(){}},
    setTimeout,clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:fn=>setTimeout(fn,0),
    pageBase:(_title,_sub,html)=>{
      document.body.innerHTML='<main class="page">'+html+'</main><button id="fixtureNav">Home</button>';
      document.getElementById('fixtureNav').onclick=()=>{navigation++;};
    },
    escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    toast:()=>{},mwSessionToken:()=> 'synthetic-session',
    coachMWPrefs:()=>({voiceMode:'standard',coachType:'male',voiceSpeed:1}),
    authSession:null,
    fetch:async(url,options)=>{
      const body=JSON.parse(options?.body||'{}');calls.push({url,body});
      if(body.clientStage)return {ok:true,status:200,json:async()=>({})};
      if(url==='/api/speak')return {ok:true,status:200,blob:async()=>({synthetic:true})};
      if(deferReply)await deferReply.promise;
      return {ok:reply.status===200,status:reply.status,json:async()=>({answer:reply.answer,error:reply.error})};
    }
  });
  context.window=context;
  vm.runInContext(appSource.slice(start,end),context,{timeout:1000});
  vm.runInContext(voiceSource,context,{timeout:1000});
  function deliver(){
    let count=0;
    while(pending){
      pending=false;observer.cb([]);deliveries++;count++;
      assert.ok(count<30,'Read-aloud MutationObserver must settle; unchanged labels cannot retrigger it forever');
    }
  }
  async function flush(){for(let i=0;i<40;i++){deliver();await Promise.resolve();}deliver();}
  function enter(){context.coachMWPage();deliver();}
  function send(text){document.getElementById('mwq').value=text;document.getElementById('askmw').click();}
  function advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now&&timers.has(id)){timers.delete(id);t.fn();}deliver();}
  return {context,document,storage,calls,errors,audios,revokes,timers,enter,send,flush,advance,
    el:id=>document.getElementById(id),stages:()=>calls.filter(x=>x.body.clientStage).map(x=>x.body.clientStage),
    setReply:r=>{reply=r;},deliveries:()=>deliveries,navigation:()=>navigation,
    defer(){let release;const promise=new Promise(r=>{release=r;});deferReply={promise};return ()=>{release();deferReply=null;};}
  };
}

async function run(){
  const f=fixture();f.enter();
  f.send('Hello');await f.flush();
  assert.equal(f.el('askmw').disabled,false,'success must unlock send');
  assert.equal(f.el('mwcoachrequeststate').textContent,'','success must clear thinking');
  assert.ok(f.el('mwchat').textContent.includes('Verified Coach MW answer'),'answer must be visible');
  assert.ok(f.stages().includes('request_settled'),'success must reach cleanup');
  assert.equal(f.document.querySelector('.mw-read-aloud').textContent,'▶ Start Voice');
  const deliveries=f.deliveries();await f.flush();
  assert.equal(f.deliveries(),deliveries,'observer must become idle');

  f.el('fixtureNav').click();assert.equal(f.navigation(),1,'navigation click must run after response');
  f.document.querySelector('[data-mw-prompt]').click();await f.flush();
  assert.ok(f.el('mwq').value.includes('needs attention'),'quick prompt must remain interactive');
  f.setReply({status:200,answer:'Second verified answer'});f.send('Follow up');await f.flush();
  assert.ok(f.el('mwchat').textContent.includes('Second verified answer'),'repeat request must work');
  assert.equal(f.el('askmw').disabled,false);

  const voiceButton=f.document.querySelector('.mw-read-aloud');
  voiceButton.click();await f.flush();
  assert.equal(voiceButton.textContent,'■ Stop Voice','active voice label must not be overwritten');
  assert.equal(f.audios.length,1);assert.equal(f.audios[0].paused,false);
  voiceButton.click();await f.flush();
  assert.equal(voiceButton.textContent,'▶ Start Voice');
  assert.equal(f.audios[0].paused,true,'stop voice must pause audio');
  assert.equal(f.revokes.length,1,'stop voice must release blob URL');

  f.setReply({status:500,error:'Synthetic API failure'});f.send('Trigger error');await f.flush();
  assert.ok(f.el('mwchat').textContent.includes('Synthetic API failure'),'error must be visible');
  assert.equal(f.el('askmw').disabled,false,'error must unlock send');
  assert.equal(f.el('mwcoachrequeststate').textContent,'');
  f.el('fixtureNav').click();assert.equal(f.navigation(),2);
  f.setReply({status:200,answer:'Recovered'});f.send('Try again');await f.flush();
  assert.ok(f.el('mwchat').textContent.includes('Recovered'),'next request must work after an error');

  const saved=fixture([{role:'user',content:'Saved question'},{role:'assistant',content:'Saved answer'}]);
  saved.enter();await saved.flush();
  assert.ok(saved.el('mwchat').textContent.includes('Saved answer'),'saved assistant messages must remain visible');
  assert.equal(saved.document.querySelector('.mw-read-aloud').textContent,'▶ Start Voice');
  saved.send('New question after reopening');await saved.flush();
  assert.ok(saved.el('mwchat').textContent.includes('Verified Coach MW answer'));
  assert.equal(saved.el('askmw').disabled,false);

  const late=fixture();late.enter();const release=late.defer();late.send('Slow request');await late.flush();
  assert.equal(late.el('askmw').disabled,true);late.advance(20000);await late.flush();
  assert.equal(late.el('askmw').disabled,false,'watchdog must run even with read-aloud observer loaded');
  assert.ok(late.stages().includes('watchdog_reset'));release();await late.flush();
  assert.equal(late.el('askmw').disabled,false);
  assert.ok(late.el('mwchat').textContent.includes('Verified Coach MW answer'));
  console.log('PASS: real Coach MW page + read-aloud script: observer quiescence, response, repeat send, quick prompt, navigation click, saved history, voice start/stop, API error recovery, and watchdog.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
