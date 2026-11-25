import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({window:{}});
for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),context);
const E=context.window.CivilEngine,W=context.window.CivilWarfare;
const clone=s=>JSON.parse(JSON.stringify(s));
const baseline=E.create(48271,'边城','city');
let passed=0;
function check(name,fn){fn();passed++;console.log(`✓ ${name}`);}
function fixture(){const s=E.initialize(clone(baseline));s.events=[];s.resources={...s.resources,food:100000,wood:100000,stone:100000,treasury:100000};for(const key of Object.keys(s.storage.base))s.storage.base[key]=Math.max(s.storage.base[key],s.resources[key]);return s;}
function war(s){assert.ok(E.mobilize(s,'levy').ok);assert.ok(E.declareWar(s,s.neighbors[0].id).ok);return s.warfare.wars[0];}
check('war and levies open in the initial village while standing armies still need a barracks',()=>{
 const s=E.create(1,'小村');assert.equal(E.warSummary(s).available,true);assert.equal(E.mobilize(s,'levy').ok,true);
 const t=fixture();assert.equal(E.mobilize(t,'army').ok,false);
 t.buildings.push({id:'barracks-test',type:'barracks',status:'complete',size:1,x:2200,y:2048});assert.ok(E.mobilize(t,'army').ok);
});
check('mobilization has real food costs and withdraws workers from production',()=>{
 const s=fixture(),before=E.stats(s),food=s.resources.food;assert.ok(E.mobilize(s,'levy').ok);
 assert.ok(s.resources.food<food);assert.ok(s.warfare.soldiers>0);assert.ok(E.stats(s).foodProduction<before.foodProduction);
 assert.ok(E.stats(s).woodProduction<before.woodProduction);assert.equal(s.population,s.settlements.reduce((n,c)=>n+c.population,0));
 assert.ok(E.mobilize(s,'none').ok);assert.equal(s.warfare.soldiers,0);
});
check('active war halts bilateral trade and has substantially higher ongoing supply costs',()=>{
 const s=fixture(),n=s.neighbors[0];assert.ok(E.foreignAction(s,n.id,'trade').ok);E.tick(s,.25);
 assert.ok(n.tradeLast.imported>0);assert.ok(E.mobilize(s,'levy').ok);const peaceCost=E.warSummary(s).foodCost;
 assert.ok(E.declareWar(s,n.id).ok);assert.equal(n.tradeOpen,false);assert.equal(n.tradeLast.imported,0);
 assert.ok(E.warSummary(s).foodCost>peaceCost*2);assert.equal(E.mobilize(s,'none').ok,false);
 assert.equal(E.foreignAction(s,n.id,'trade').ok,false);
 const a=E.initialize(clone(s)),b=E.initialize(clone(s));b.warfare.wars=[];
 E.tick(a,1);E.tick(b,1);assert.ok(a.resources.food<b.resources.food);assert.ok(a.resources.wood<b.resources.wood);
 assert.ok(a.warfare.weariness>b.warfare.weariness);
});
check('higher technology, manpower, support and supplied finances improve battle probability',()=>{
 const s=fixture(),w=war(s),low=E.warSummary(s).wars[0].probability;
 s.knowledge=1000;assert.ok(E.warSummary(s).wars[0].probability>low);
 let p=E.warSummary(s).wars[0].probability;s.warfare.soldiers*=2;assert.ok(E.warSummary(s).wars[0].probability>p);
 p=E.warSummary(s).wars[0].probability;s.stability=98;assert.ok(E.warSummary(s).wars[0].probability>p);
 const funded=E.initialize(clone(s)),empty=E.initialize(clone(s));funded.currency.adopted=empty.currency.adopted=true;
 funded.resources.treasury=100000;empty.resources.food=empty.resources.wood=empty.resources.treasury=0;W.tick(funded,.25);W.tick(empty,.25);
 assert.ok(funded.warfare.supply>empty.warfare.supply);assert.ok(E.warSummary(funded).wars[0].probability>E.warSummary(empty).wars[0].probability);
});
check('automatic battles can win or lose and casualties reduce both army and population',()=>{
 const seedState=fixture();war(seedState);const results=new Set();
 for(let i=0;i<24;i++){
  const s=E.initialize(clone(seedState));s.rngState=(i*176543267+1)>>>0;s.elapsed=2;
  const pop=s.population;W.tick(s,.001);const battle=s.warfare.wars[0].lastBattle;
  assert.ok(battle);results.add(battle.won);assert.ok(battle.losses>0);assert.ok(s.population<pop);
  assert.ok(Math.abs(s.population-s.settlements.reduce((n,r)=>n+r.population,0))<1e-7);
 }
 assert.equal(results.size,2,'battle results must depend on the random draw');
});
check('neighbors can initiate war after diplomacy collapses while treaties prevent it',()=>{
 const s=fixture(),n=s.neighbors[0];n.tension=99;n.relation=0;s.stability=20;s.elapsed=10;s.rngState=1972;
 // Find a seed whose first draw falls within the passive-declaration probability.
 for(let seed=1;seed<100000;seed++){if(((Math.imul(seed,1664525)+1013904223)>>>0)/4294967296<.00625){s.rngState=seed;break;}}
 const protectedState=E.initialize(clone(s));protectedState.neighbors[0].pactUntil=30;
 W.tick(s,.25);W.tick(protectedState,.25);
 assert.equal(s.warfare.wars.length,1);assert.equal(s.warfare.wars[0].aggressor,false);assert.ok(s.warfare.soldiers>0);
 assert.equal(protectedState.warfare.wars.length,0);
});
check('an empty army cannot win battles, inflict casualties or recruit without supplies',()=>{
 const s=fixture(),w=war(s);s.population=30;s.settlements.forEach((r,i)=>r.population=i?0:30);s.warfare.soldiers=0;s.elapsed=2;s.rngState=1;
 const enemy=w.enemySoldiers;assert.equal(E.warSummary(s).wars[0].probability,0);W.tick(s,.25);
 assert.equal(w.lastBattle.won,false);assert.equal(w.enemySoldiers,enemy);assert.ok(w.score<0);
 const t=fixture();E.mobilize(t,'levy');t.warfare.soldiers=0;t.resources.food=t.resources.wood=0;W.tick(t,.25);
 assert.equal(t.warfare.soldiers,0);assert.equal(t.warfare.supply,0);
});
check('peace terms use actual resources, create a truce and permit separate demobilization',()=>{
 const s=fixture(),w=war(s),n=s.neighbors[0];assert.equal(E.negotiate(s,n.id,'concession').ok,false);
 assert.equal(E.negotiate(s,n.id,'ceasefire').ok,false);const before=s.resources.food;
 assert.ok(E.negotiate(s,n.id,'reparations').ok);assert.ok(s.resources.food<before);assert.equal(s.warfare.wars.length,0);
 assert.ok(n.truceUntil>s.elapsed);assert.equal(E.declareWar(s,n.id).ok,false);assert.ok(E.mobilize(s,'none').ok);
 const t=fixture(),tw=war(t),tn=t.neighbors[0];tw.score=30;tn.foodStock=80;const food=t.resources.food;
 assert.ok(E.negotiate(t,tn.id,'concession').ok);assert.equal(t.resources.food,food+80);assert.equal(tn.foodStock,0);
});
check('a long war permits mutual ceasefire and saves preserve the next automatic battle',()=>{
 const s=fixture(),w=war(s);s.elapsed=6.1;assert.ok(E.negotiate(s,w.nationId,'ceasefire').ok);
 const t=fixture();war(t);E.tick(t,1);const restored=E.initialize(clone(t));
 assert.deepEqual(clone(restored.warfare),clone(t.warfare));E.tick(restored,2);assert.ok(restored.warfare.wars[0].lastBattle);
 assert.ok(restored.resources.food>=0&&restored.resources.wood>=0);
});
check('a village-developed city can make foreign contact through completed frontier exploration',()=>{
 const s=E.create(48271,'新国');s.population=s.settlements[0].population=800;s.cityFounded=true;s.knowledge=80;s.hostileAt=1e9;
 s.resources={...s.resources,food:100000,wood:100000,stone:100000,treasury:0};
 for(const key of Object.keys(s.storage.base))s.storage.base[key]=Math.max(s.storage.base[key],s.resources[key]);
 s.buildings.push({id:'council-contact',type:'council',status:'complete',size:1,x:2200,y:2048});
 let p;for(let i=0;i<36;i++){const a=i*.19,x=2048+Math.cos(a)*820,y=2048+Math.sin(a)*820;if(!context.window.CivilTerrain.sample(x,y,s.seed,s.geographyVersion).water&&context.window.CivilTerrain.hash(Math.floor(x/180),Math.floor(y/180),s.seed+7717)<.65){p={x,y};break;}}
 assert.ok(p);s.explored.push({x:p.x-220,y:p.y,radius:100});const result=E.explore(s,p.x,p.y);assert.ok(result.ok,result.message);
 assert.equal(s.neighbors.length,0);E.tick(s,result.duration+.25);assert.equal(s.neighbors.length,1);
 assert.ok(s.history.some(h=>h.data.nationId===s.neighbors[0].id));assert.ok(E.foreignAction(s,s.neighbors[0].id,'trade').ok);
});
check('industrial housing renewal preserves capacity while basic housing remains available',()=>{
 const s=E.create(2,'旧城');s.population=10000;s.settlements[0].population=10000;s.knowledge=300;s.currency.adopted=true;
 s.buildings.push({id:'factory-test',type:'factory',status:'complete',size:1,x:2200,y:2100});
 const before=E.stats(s).housing;E.initialize(s);assert.equal(s.era,'industrial');assert.equal(s.buildings.filter(b=>b.type==='hut').length,0);
 assert.equal(E.stats(s).housing,before);assert.equal(E.available(s,E.buildings.find(d=>d.id==='hut')).ok,true);
 const r=E.initialize(clone(s));assert.equal(E.stats(r).housing,before);
});
console.log(`${passed} warfare and era checks passed.`);
