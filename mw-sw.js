const CACHE='mw-dynasty-shell-v4';
const CORE=[
  '/',
  '/athlete/',
  '/coach/',
  '/athlete/start.html',
  '/coach/start.html',
  '/athlete/signup.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/coach/app.js',
  '/coach/styles.css',
  '/assets/mw-unified-theme.css',
  '/assets/mw-dynasty-luxe-v21.css',
  '/assets/mw-responsive-v25.css'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async url=>{
      try{
        const r=await fetch(new Request(url,{cache:'reload'}));
        if(r.ok)await cache.put(url,r.clone())
      }catch{}
    }));
    await self.skipWaiting()
  })())
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('mw-dynasty-shell-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim()
  })())
});

function excluded(url){
  return url.pathname.startsWith('/api/')||
    url.pathname.startsWith('/founder/')||
    url.pathname.startsWith('/.well-known/');
}
function fallbackFor(url){
  if(url.pathname.startsWith('/athlete'))return '/athlete/';
  if(url.pathname.startsWith('/coach'))return '/coach/';
  return '/'
}
async function networkFirst(request){
  const cache=await caches.open(CACHE);
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),6000);
  try{
    const r=await fetch(request,{signal:ctl.signal});
    clearTimeout(timer);
    if(r&&r.ok)cache.put(request,r.clone()).catch(()=>{});
    return r
  }catch(e){
    clearTimeout(timer);
    const cached=await cache.match(request,{ignoreSearch:true});
    if(cached)return cached;
    if(request.mode==='navigate'){
      const shell=await cache.match(fallbackFor(new URL(request.url)));
      if(shell)return shell
    }
    throw e
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||excluded(url))return;
  event.respondWith(networkFirst(request))
});