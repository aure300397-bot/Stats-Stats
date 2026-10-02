const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const key = 'statsstats.db.v1';

function boot(initial, options={}) {
  const storage = new Map(initial ? [[key, JSON.stringify(initial)]] : []);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes=new Set();
      elements.set(id, {
        innerHTML: '', textContent: '', className: '', value: '', hidden:true,
        classList: {add: x=>classes.add(x),remove: x=>classes.delete(x),contains: x=>classes.has(x)},
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    structuredClone,
    localStorage: {getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v)},
    document: {getElementById: element, querySelectorAll: () => [],addEventListener() {}},
    window: {scrollTo() {},addEventListener() {},location:{reload:options.reload||(()=>{})}},
    navigator: options.navigator||{},
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: f => f(),
    confirm: () => true, console,
  });
  vm.runInContext(source, context);
  return {
    run: code => vm.runInContext(code, context),
    value: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    stored: () => JSON.parse(storage.get(key)), element,
  };
}

const historical = {
  seeded: true,
  templates: [
    {id: 'tpl-ua', name: 'Upper A personnalisé', exercises: [{name: 'Développé couché barre', targetSets: 5, targetReps: '4–6'}]},
    {id: 'custom', name: 'Ma séance', exercises: [{name: 'Mon exercice', targetSets: 3}]},
  ],
  sessions: [{id: 'history', date: '2026-05-09', name: 'Upper A', templateId: 'tpl-ua', entries: [
    {name: 'Développé couché barre', sets: [{weight: 80, reps: 6}]},
    {name: 'Gainage planche', sets: [{weight: 0, reps: 45}]},
  ]}],
  body: {heightCm: 185, entries: [{date: '2026-07-15', weight: 80.3, fat: 14.5, muscle: 65.2, muscleUnit: 'kg'}]},
  exerciseLib: ['Développé couché barre', 'Mon exercice'],
};

test('nouvelle installation : quatre séances avec les volumes convenus', () => {
  const app = boot();
  assert.deepEqual(app.value('db.templates.map(t => t.exercises.reduce((n,x)=>n+x.targetSets,0))').slice(0,3), [23,21,24]);
  assert.equal(app.value('db.templates.length'), 4);
  const upper = app.value('db.templates[0].exercises');
  assert.equal(upper[0].targetSets, 4);
  assert.equal(upper.at(-1).targetSets, 4);
  assert.ok(app.value('db.templates[2].exercises').some(x => x.name === 'Leg curl machine (ischios)'));
  assert.ok(!app.value('db.templates[2].exercises').some(x => x.name.includes('Pec fly')));
  assert.equal(app.value('db.templates[3].rounds'), 3);
});

test('migration : historique, mesures et modèles personnalisés préservés', () => {
  const app = boot(historical);
  const db = app.stored();
  assert.deepEqual(db.sessions, historical.sessions);
  assert.deepEqual(db.body, historical.body);
  assert.deepEqual(db.templates.find(t => t.id === 'custom'), historical.templates[1]);
  const legacy = db.templates.find(t => t.id === 'tpl-ua');
  assert.deepEqual(legacy, {...historical.templates[0], archived: true});
  assert.equal(app.value("prBefore('Développé couché barre','2026-10-02')"), 96);
  assert.ok(!app.element('v-seance').innerHTML.includes('Upper A personnalisé'));
});

test('rechargement : pas de doublon et pas de réinitialisation des modifications', () => {
  const app = boot(historical);
  app.run('db.templates[0].exercises[0].targetSets=5;save()');
  const once = app.stored();
  const again = boot(once).stored();
  assert.deepEqual(again, once);
  assert.equal(again.templates[0].exercises[0].targetSets, 5);
});

test('modèle archivé : réactivation conservée au prochain chargement', () => {
  const app = boot(historical);
  app.run("toggleTemplateArchive('tpl-ua')");
  const again = boot(app.stored());
  assert.equal(again.value("db.templates.find(t=>t.id==='tpl-ua').archived"), false);
});

test('séance haut du corps : 23 lignes préparées, dont 4 au couché et aux abdos', () => {
  const app = boot(historical);
  app.run("startSession('tpl-oct26-upper')");
  const entries = app.value('state.session.entries');
  assert.equal(entries.reduce((n,e)=>n+e.sets.length,0), 23);
  assert.equal(entries[0].sets.length, 4);
  assert.equal(entries[0].sets[0].weight, 80);
  assert.equal(entries.at(-1).sets.length, 4);
  assert.equal(entries.at(-1).sets[0].weight, 0);
});

test('circuit : poids du corps, secondes et minutes enregistrés sans faux 1RM', () => {
  const app = boot();
  app.run("startSession('tpl-oct26-circuit');setField(0,0,'reps','12');setField(3,0,'reps','12.5');setField(4,0,'reps','40');saveSession()");
  const entries = app.stored().sessions[0].entries;
  assert.deepEqual(entries.map(e=>e.name), ['Pompes','Escalier','Gainage planche']);
  assert.equal(app.value("exerciseHistory('Pompes')[0].sets[0].reps"), 12);
  assert.equal(app.value("exerciseHistory('Escalier')[0].unit"), 'minutes');
  assert.equal(app.value("exerciseHistory('Gainage planche')[0].unit"), 'seconds');
  assert.equal(app.value("exVolume([{weight:50,reps:40}],'seconds')"), 0);
  for (const name of ['Pompes','Escalier','Gainage planche']) {
    app.run(`state.statsEx=${JSON.stringify(name)};renderStats()`);
    const rendered = app.element('v-stats').innerHTML;
    assert.ok(!rendered.includes('1RM'), name);
    assert.ok(!rendered.includes('NaN'), name);
  }
});

test('ancien gainage : données intactes et affichage en secondes', () => {
  const app = boot(historical);
  assert.equal(app.value("exerciseHistory('Gainage planche')[0].unit"), 'seconds');
  app.run("state.statsEx='Gainage planche';renderStats()");
  assert.ok(app.element('v-stats').innerHTML.includes('45 s'));
  assert.deepEqual(app.stored().sessions, historical.sessions);
});

test('import ancien : programme ajouté et marqueur conservé dans la sauvegarde', () => {
  const app = boot();
  app.run(`db=Object.assign(structuredClone(DEFAULT_DB),${JSON.stringify(historical)});seedProgram();save()`);
  assert.deepEqual(app.stored().sessions, historical.sessions);
  assert.equal(app.stored().templates.filter(t=>t.id.startsWith('tpl-oct26-')).length, 4);
  assert.equal(app.stored().programVersions.length, 1);
});

function updateMock(){
  let messages=0,reloads=0,updates=0;
  const events={};
  const registration={waiting:{postMessage: msg=>{assert.equal(msg.type,'SKIP_WAITING');messages++;}},installing:null,update:async()=>{updates++;},addEventListener(){}};
  const navigator={onLine:true,serviceWorker:{controller:{},register:async(url,opts)=>{assert.equal(url,'sw.js');assert.equal(opts.updateViaCache,'none');return registration;},addEventListener:(event,callback)=>{events[event]=callback;}}};
  return {navigator,registration,events,reload:()=>reloads++,counts:()=>({messages,reloads,updates})};
}

test('mise à jour : détection, application choisie et conservation de la sauvegarde', async()=>{
  const mock=updateMock();
  const app=boot(historical,mock);
  const before=app.stored();
  await app.run('checkAppUpdate(true)');
  assert.equal(app.element('app-update').hidden,false);
  await app.run('applyAppUpdate()');
  assert.equal(mock.counts().messages,1);
  mock.events.controllerchange();
  assert.equal(mock.counts().reloads,1);
  assert.deepEqual(app.stored(),before);
});

test('mise à jour : une nouvelle séance saisie bloque le rechargement', async()=>{
  const mock=updateMock();const app=boot(null,mock);
  app.run("startSession('tpl-oct26-upper');setField(0,0,'weight','80');setField(0,0,'reps','6')");
  await app.run('applyAppUpdate()');
  assert.equal(mock.counts().messages,0);
  assert.equal(mock.counts().reloads,0);
  assert.equal(app.value('state.session.entries[0].sets[0].reps'),6);
  app.run('saveSession()');
  await app.run('applyAppUpdate()');mock.events.controllerchange();
  assert.equal(mock.counts().reloads,1);
  assert.equal(app.stored().sessions[0].entries[0].sets[0].reps,6);
});

test('mise à jour : modification de séance ancienne et formulaire ouverts protégés', async()=>{
  const mock=updateMock();const app=boot(historical,mock);
  app.run("openSession('history');setField(0,0,'reps','7')");
  await app.run('applyAppUpdate()');
  assert.equal(mock.counts().messages,0);
  app.run('saveSession();openBodyEntry()');
  await app.run('applyAppUpdate()');
  assert.equal(mock.counts().messages,0);
  app.run('closeSheet()');
  await app.run('applyAppUpdate()');
  assert.equal(mock.counts().messages,1);
});

test('mise à jour : hors ligne, la sauvegarde est conservée et aucun rechargement imposé', async()=>{
  const mock=updateMock();mock.navigator.onLine=false;
  const app=boot(historical,mock);const before=app.stored();
  await app.run('checkAppUpdate(true)');
  assert.equal(mock.counts().updates,0);
  assert.equal(mock.counts().reloads,0);
  assert.deepEqual(app.stored(),before);
});
