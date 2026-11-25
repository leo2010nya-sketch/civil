import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({window:{}});
for(const name of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${name}.js`,import.meta.url),'utf8'),context);
const E=context.window.CivilEngine,T=context.window.CivilTerrain;
let passed=0;
function check(name,fn){fn();passed++;console.log(`✓ ${name}`);}
const make=()=>E.create(48271,'河湾');
const plain=x=>JSON.parse(JSON.stringify(x));
check('zero-based chronology and legacy save conversion',()=>{
  const s=make();assert.equal(s.year,0);assert.equal(s.version,3);E.tick(s,2);assert.equal(s.year,2);
  s.version=2;s.year=-7998;s.history.forEach(h=>h.time-=8000);s.statsHistory.forEach(h=>h.year-=8000);s.policies={reserve:{active:true,coverage:50,started:-8000}};
  E.initialize(s);assert.equal(s.year,2);assert.ok(s.history.every(h=>h.time>=0));assert.equal(s.proposals[0].clauses[0],'reserve');assert.deepEqual(plain(s.policies),{});
});
check('locked policies and executor choices stay outside player-facing options',()=>{
 const s=make(),o=E.proposalOptions(s);assert.ok(!o.clauses.some(d=>d.id==='education'));assert.ok(!o.executors.some(d=>d.id==='administration'));const before=JSON.stringify(s.resources);assert.equal(E.draftPolicy(s,{clauses:['automation'],regions:['all'],target:'all',executor:'community',condition:'always'}).ok,false);assert.equal(JSON.stringify(s.resources),before);
});
const draft={name:'河湾储粮令',clauses:['reserve','forage'],regions:['home'],target:'families',executor:'community',condition:'always',duration:15};
check('composed policies charge resources, spread, impose actual costs and can be revised',()=>{
 const s=make(),before=s.resources.food,quote=E.draftPolicy(s,{...draft,preview:true}),p=E.draftPolicy(s,draft);assert.ok(p.ok);assert.equal(s.resources.food,before-quote.cost.food);assert.equal(s.proposals[0].coverage,0);assert.ok(E.proposalOptions(s).clauses.every(d=>d.drawback));E.tick(s,5);assert.ok(s.proposals[0].coverage>0);assert.ok(E.stats(s).woodRate<E.stats(make()).woodRate);assert.ok(E.draftPolicy(s,{...draft,id:p.proposalId,clauses:['reserve'],target:'all',duration:5}).ok);assert.equal(s.proposals.length,1);E.tick(s,6);assert.equal(s.proposals[0].active,false);
});
check('conditional policies and regional scope change their actual effect',()=>{
 const s=make();s.population=80;s.settlements[0].population=40;s.settlements.push({id:'other',name:'林间',population:40,x:2300,y:2100});const r=E.draftPolicy(s,{...draft,clauses:['forage'],condition:'surplus'});assert.ok(r.ok);s.proposals[0].coverage=100;s.proposals[0].localCoverage={home:100,other:100};const low=E.stats(s).foodRate;s.resources.food=400;assert.ok(E.stats(s).foodRate>low);s.proposals[0].regions=['all'];assert.ok(E.stats(s).foodRate>low+1);
});
check('starvation reduces population without a twelve-person floor; settlement totals remain consistent',()=>{
 const s=make();s.population=300;s.settlements[0].population=300;s.resources.food=0;E.tick(s,4);assert.ok(s.population<290);assert.equal(s.resources.food,0);assert.ok(Math.abs(s.population-s.settlements.reduce((n,t)=>n+t.population,0))<1e-7);
 s.population=10;s.settlements[0].population=10;s.resources.food=0;s.buildings=[];E.tick(s,2);assert.ok(s.population<10);s.population=0;s.buildings.push({id:'f',type:'farm',status:'complete',size:1});assert.equal(E.stats(s).foodProduction,0);
});
check('logging removes the same finite trees used by the renderer and eventually loses output',()=>{
 const s=make(),t=T.trees(s.seed).find(t=>Math.hypot(t.x-2048,t.y-2048)<300&&Math.hypot(t.x-2048,t.y-2048)>170);assert.ok(t);s.resources.wood=1000;assert.ok(E.build(s,'lumber',t.x,t.y).ok);E.tick(s,3);const before=E.forestRemaining(s,t.x,t.y);E.tick(s,20);assert.ok(s.forest.cut>0);assert.ok(E.forestRemaining(s,t.x,t.y)<before);assert.ok(Object.keys(s.forest.removed).every(id=>T.trees(s.seed).some(t=>t.id===id)));
 const empty=make();empty.buildings.push({id:'empty-mill',type:'lumber',x:2048,y:2048,size:1,status:'complete'});T.trees(empty.seed).forEach(t=>empty.forest.removed[t.id]=true);assert.equal(E.forestRemaining(empty,2048,2048),0);assert.ok(E.stats(empty).woodRate<5);
});
check('automation unlocks progressively and builds real affordable projects',()=>{
 const s=make();assert.equal(E.setAutomation(s,'enabled',true).ok,false);s.population=60;s.settlements[0].population=60;s.resources={...s.resources,food:500,wood:500,stone:500,treasury:500};s.buildings.push({id:'c',type:'council',x:2200,y:2000,size:1,status:'complete'});assert.equal(E.automationLevel(s),1);assert.ok(E.setAutomation(s,'enabled',true).ok);assert.equal(E.setAutomation(s,'wood',true).ok,false);s.automation.lastCheck=s.elapsed-E.automaticConstruction.interval;E.tick(s,1);assert.ok(s.buildings.some(b=>b.automatic&&b.status==='building'));assert.ok(s.resources.wood<500);s.population=100;s.knowledge=20;s.buildings.push({id:'w',type:'workshop',x:2200,y:2100,size:1,status:'complete'});assert.equal(E.automationLevel(s),2);assert.ok(E.setAutomation(s,'wood',true).ok);
});
check('early hostiles are visible and can raid; patrol and tribute have consequences',()=>{
 const s=make();s.hostiles=[{id:'rival-1',name:'Legacy camp',x:2300,y:1900,population:40,economy:28,pressure:24,lastRaid:0,truceUntil:0,guardUntil:0}];E.tick(s,3.25);assert.equal(s.hostiles.length,1);assert.ok(E.respondHostile(s,'rival-1','patrol').ok);assert.ok(s.hostiles[0].guardUntil>s.elapsed);s.hostiles[0].pressure=80;s.hostiles[0].lastRaid=-20;const food=s.resources.food;E.tick(s,.25);assert.ok(s.resources.food<food+5);assert.ok(s.history.some(h=>h.kind==='failure'));E.tick(s,3);const pressure=s.hostiles[0].pressure;assert.ok(E.respondHostile(s,'rival-1','tribute').ok);assert.equal(s.hostiles[0].pressure,pressure);E.tick(s,2);assert.ok(s.hostiles[0].pressure<pressure);
});
check('routine construction and unchanged decades do not flood reports',()=>{
 const s=make();E.build(s,'farm',2160,2120);assert.equal(s.events.length,1);E.tick(s,2);assert.ok(!s.history.some(h=>h.kind==='success'));E.tick(s,10);assert.ok(!s.history.some(h=>h.title==='聚落十年记录'));const reports=s.history.filter(h=>h.kind==='report');assert.ok(reports.length<2);
});
check('serialized worlds retain policies, forests, automation and hostiles through long simulation',()=>{
 const s=make();E.draftPolicy(s,draft);E.tick(s,15);const restored=E.initialize(plain(s));E.tick(restored,120);assert.ok(Number.isFinite(restored.population));assert.ok(Number.isFinite(E.stats(restored).foodRate));assert.equal(restored.proposals.length,1);assert.equal(restored.hostiles.length,s.hostiles.length);assert.equal(restored.year,135);assert.ok(restored.events.length<=16);
});
console.log(`${passed} third-draft engine checks passed.`);
