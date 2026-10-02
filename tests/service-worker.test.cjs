const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
const base='https://example.test/Stats-Stats/';

function boot(){
  const listeners={},stores=new Map();
  let fetcher=async()=>new Response('latest app',{status:200});
  let skips=0,claims=0;
  const requests=[];
  const canonical=value=>new URL(typeof value==='string'?value:value.url,base).href;
  const open=async name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const data=stores.get(name);
    return {
      add:async request=>{requests.push(request);data.set(canonical(request),await fetcher(request));},
      put:async(key,response)=>data.set(canonical(key),response.clone()),
      match:async key=>data.get(canonical(key))?.clone(),
    };
  };
  class WorkerRequest extends Request{constructor(url,options){super(new URL(url,base),options);}}
  const context=vm.createContext({
    self:{location:{href:base+'sw.js',origin:new URL(base).origin},
      addEventListener:(name,callback)=>{listeners[name]=callback;},
      skipWaiting:async()=>{skips++;},clients:{claim:async()=>{claims++;}}},
    caches:{open,keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},
    fetch:(request,opts)=>fetcher(request,opts),Request:WorkerRequest,Response,URL,
  });
  vm.runInContext(source,context);
  return {
    stores,requests,open,
    fetchWith: fn=>{fetcher=fn;},counts:()=>({skips,claims}),
    dispatch:async(name,details={})=>{
      let pending,result;
      listeners[name]({...details,waitUntil:p=>{pending=p;},respondWith:p=>{result=p;}});
      if(pending)await pending;
      return result?await result:undefined;
    },
  };
}
const request=url=>({url:new URL(url,base).href,method:'GET',mode:'navigate'});

test('installation : copie hors ligne et attente sans activation forcée',async()=>{
  const sw=boot();await sw.dispatch('install');
  assert.equal(sw.requests.length,6);
  assert.ok(sw.requests.every(r=>r.cache==='reload'));
  assert.equal(sw.counts().skips,0);
  await sw.dispatch('message',{data:{type:'SKIP_WAITING'}});
  assert.equal(sw.counts().skips,1);
});

test('activation : retirer les anciens caches de l’app uniquement',async()=>{
  const sw=boot();await sw.open('stats-stats-v1');await sw.open('another-app');
  await sw.dispatch('install');await sw.dispatch('activate');
  assert.ok(!sw.stores.has('stats-stats-v1'));
  assert.ok(sw.stores.has('another-app'));
  assert.equal(sw.counts().claims,1);
});

test('passage depuis v1 : activation possible sans bouton de mise à jour dans l’ancienne app',async()=>{
  const sw=boot();await sw.open('stats-stats-v1');
  await sw.dispatch('install');
  assert.equal(sw.counts().skips,1);
  await sw.dispatch('activate');
  assert.ok(!sw.stores.has('stats-stats-v1'));
});

test('navigation : version réseau prioritaire puis même copie hors ligne',async()=>{
  const sw=boot();await sw.dispatch('install');
  sw.fetchWith(async(req,opts)=>{assert.equal(opts.cache,'no-store');return new Response('updated app');});
  assert.equal(await (await sw.dispatch('fetch',{request:request('./')})).text(),'updated app');
  sw.fetchWith(async()=>{throw new Error('offline');});
  assert.equal(await (await sw.dispatch('fetch',{request:request('./')})).text(),'updated app');
  assert.equal(await (await sw.dispatch('fetch',{request:request('index.html')})).text(),'updated app');
});

test('outil d’import : sa navigation ne remplace pas la copie hors ligne de l’app',async()=>{
  const sw=boot();await sw.dispatch('install');
  sw.fetchWith(async()=>new Response('import tool'));
  await sw.dispatch('fetch',{request:request('add-sessions.html')});
  sw.fetchWith(async()=>{throw new Error('offline');});
  assert.equal(await (await sw.dispatch('fetch',{request:request('index.html')})).text(),'latest app');
  assert.equal(await (await sw.dispatch('fetch',{request:request('add-sessions.html')})).text(),'import tool');
});

test('réponse serveur en erreur : ouverture de la copie hors ligne',async()=>{
  const sw=boot();await sw.dispatch('install');
  sw.fetchWith(async()=>new Response('error',{status:503}));
  assert.equal(await (await sw.dispatch('fetch',{request:request('./')})).text(),'latest app');
});
