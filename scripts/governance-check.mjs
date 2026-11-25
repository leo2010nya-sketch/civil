import assert from 'node:assert/strict';
import vm from 'node:vm';import{readFile}from'node:fs/promises';
const context=vm.createContext({window:{}});
for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),context);
const{CivilEngine:E,CivilTerrain:T,CivilLogistics:L}=context.window,plain=v=>JSON.parse(JSON.stringify(v));
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('✓ '+name);};
const inherited=E.create(48271,'诸城','city'),city=()=>E.initialize(plain(inherited));
const village=()=>{const s=E.create(48271,'河湾');s.hostileAt=1e9;return s;};
check('inheritance has varied reproducible local and foreign city counts and geography',()=>{
 const counts=new Set(),nations=new Set(),towns=new Set(),centers=new Set();
 for(const seed of [0,1,2,3,19,42,23331,48271,2147483646]){
  const s=E.create(seed,'诸城','city'),again=E.create(seed,'诸城','city');
  assert.deepEqual(plain(s.settlements),plain(again.settlements));assert.deepEqual(plain(s.neighbors),plain(again.neighbors));
  assert.ok(s.settlements.length>=2&&s.settlements.length<=5);assert.ok(s.neighbors.length>=2&&s.neighbors.length<=5);
  counts.add(s.settlements.length);nations.add(s.neighbors.length);centers.add(s.settlements.map(c=>[c.x,c.y]).join('|'));
  const housing=E.regionalHousing(s);
  for(const c of s.settlements){assert.ok(housing[c.id]>=c.population);assert.ok(!T.sample(c.x,c.y,seed).water);}
  for(const n of s.neighbors){towns.add(n.cities.length);assert.ok(n.cities.length>=1&&n.cities.length<=3);assert.ok(Math.abs(n.population-n.cities.reduce((a,c)=>a+c.population,0))<1e-6);
   for(const c of n.cities){assert.ok(!T.sample(c.x,c.y,seed).water);assert.ok(E.isExplored(s,c.x,c.y));assert.equal(E.foreignOwner(s,c.x,c.y)?.id,n.id);}}
  assert.ok(E.stats(s).foodRate>0);
  for(const b of s.buildings)assert.ok(!T.sample(b.x,b.y,seed).water);
 }
 assert.equal(counts.size,4);assert.ok(nations.size>=3&&towns.size===3&&centers.size===9);
});
check('inheritance begins with currency tax and fully operating municipal institutions',()=>{
 const s=city();assert.ok(E.hasCurrency(s));assert.equal(s.currency.inherited,true);assert.ok(s.resources.treasury>0);
 assert.equal(s.institutions.governance,'administration');assert.ok(s.taxation.rates.poll>0&&s.taxation.rates.land>0);
 const p=s.proposals.find(p=>p.inherited);assert.ok(p.active&&p.coverage===100);assert.ok(Object.values(p.localCoverage).every(v=>v===100));
 const cash=s.resources.treasury;assert.equal(E.introduceCurrency(s).ok,false);E.tick(s,.25);assert.ok(s.resources.treasury>cash);
 assert.equal(E.hasCurrency(village()),false);
});
check('legacy choices and progress are not overwritten by new inheritance defaults',()=>{
 const s=city();s.currency={adopted:false,introducedAt:null};s.resources.treasury=0;s.proposals=[];s.taxation.rates.poll=0;s.institutions.governance='elders';delete s.inheritance;
 const restored=E.initialize(plain(s));assert.equal(restored.currency.adopted,false);assert.equal(restored.proposals.length,0);assert.equal(restored.institutions.governance,'elders');assert.equal(restored.taxation.rates.poll,0);
 restored.automation.tasks.food=false;delete restored.automation.tasks.civic;E.initialize(restored);assert.equal(restored.automation.tasks.food,false);assert.equal(restored.automation.tasks.civic,true);
});
check('population growth including migration stops at 105 percent of local capacity',()=>{
 const s=village();s.population=s.settlements[0].population=51.44999;s.resources.food=5000;s.storage.base.food=10000;
 s.buildings.push({id:'food-test',type:'farm',size:10,status:'complete',x:2200,y:2200,settlementId:'home'});
 s.proposals.push({id:'migration-test',clauses:['migration'],regions:['all'],target:'all',executor:'community',condition:'always',active:true,coverage:100,localCoverage:{home:100},started:0,resistance:0,feedbackMilestones:[]});
 E.tick(s,20);assert.ok(s.population<=49*1.05+1e-9);assert.ok(s.population>=51.44999);
 const restored=E.initialize(plain(s));E.tick(restored,3);assert.ok(restored.population<=49*1.05+1e-9);assert.equal(restored.population,restored.settlements.reduce((n,c)=>n+c.population,0));
});
check('spare houses elsewhere cannot mask an overcrowded city and old residents are retained',()=>{
 const s=village();s.population=s.settlements[0].population=70;
 s.settlements.push({id:'new',x:2400,y:2300,name:'新镇',population:10,level:0});s.population=80;
 s.buildings.push({id:'newhome',type:'townhouse',size:10,status:'complete',x:2400,y:2300,settlementId:'new'},{id:'food',type:'estate',size:2,status:'complete',x:2220,y:2300,settlementId:'home'});s.resources.food=5000;
 E.tick(s,1);assert.equal(s.settlements[0].population,70);assert.ok(s.settlements[1].population>10);assert.equal(s.population,s.settlements.reduce((n,c)=>n+c.population,0));
});
check('only completed housing counts and legacy homes use the nearest settlement',()=>{
 const s=village();s.buildings.push({id:'pending',type:'townhouse',size:1,status:'building',x:2200,y:2000,settlementId:'home',years:20,progress:0},{id:'legacy',type:'townhouse',size:3,status:'complete',x:2100,y:2000,housingOverride:7});
 assert.equal(E.regionalHousing(s).home,56);assert.equal(E.regionalHousing(s,true).home,126);
 s.resources.food=0;s.buildings=s.buildings.filter(b=>b.type!=='fire');s.population=s.settlements[0].population=500;
 E.tick(s,1);assert.ok(s.population<500);
});
check('depletion warnings cover declining stocks and stay quiet for unused zero resources',()=>{
 const s=village();E.resourceWarnings(s);assert.equal(s.events.filter(e=>e.data.resourceAlert).length,0);
 s.population=s.settlements[0].population=500;s.resources.food=15;E.resourceWarnings(s);
 const e=s.events.find(e=>e.data.resourceAlert);assert.ok(e);assert.equal(E.eventPriority(e),'major');assert.ok(e.data.resources.some(r=>r.resource==='food'));assert.ok(!e.data.resources.some(r=>r.resource==='coal'||r.resource==='tools'));
 for(let i=0;i<8;i++)E.resourceWarnings(s);assert.equal(s.events.filter(e=>e.data.resourceAlert).length,1);
 const restored=E.initialize(plain(s));E.resourceWarnings(restored);assert.equal(restored.events.filter(e=>e.data.resourceAlert).length,1);
 restored.resources.food=10000;E.resourceWarnings(restored);assert.equal(restored.resourceAlerts.food.active,false);
 restored.elapsed+=20;restored.resources.food=1;E.resourceWarnings(restored);assert.equal(restored.events.filter(e=>e.data.resourceAlert).length,2);
});
check('tools and treasury warn before exhaustion and grouped warnings do not repeat',()=>{
 const s=city();s.resources.tools=.1;s.resources.medicine=.01;s.storage.last={gross:{},used:{tools:5,medicine:1}};
 E.resourceWarnings(s);const e=s.events.find(e=>e.data.resourceAlert);assert.ok(e.data.resources.some(r=>r.resource==='tools'));assert.ok(e.data.resources.some(r=>r.resource==='medicine'));
 s.resources.treasury=.01;E.mobilize(s,'levy');E.declareWar(s,s.neighbors[0].id);s.warfare.soldiers=s.population*.12;s.taxation.rates={poll:0,land:0,domestic:0,customs:0,vat:0};E.resourceWarnings(s);
 assert.ok(s.events.some(e=>e.data.resources?.some(r=>r.resource==='treasury')));
});
check('war peace failures and major reforms have priority while routine reports and battles are secondary',()=>{
 assert.equal(E.eventPriority({kind:'report'}),'minor');assert.equal(E.eventPriority({kind:'failure'}),'major');assert.equal(E.eventPriority({kind:'failure',data:{war:true}}),'minor');
 assert.equal(E.eventPriority({kind:'milestone',title:'产权改革完成',data:{reform:'property'}}),'major');
 const s=city();E.mobilize(s,'levy');E.declareWar(s,s.neighbors[0].id);assert.equal(E.eventPriority(s.events.at(-1)),'major');E.negotiate(s,s.neighbors[0].id,'reparations');assert.equal(E.eventPriority(s.events.at(-1)),'major');
});
check('automation plans a diverse local program with dependencies and construction zones',()=>{
 const s=city();s.buildings=s.buildings.filter(b=>!['well','warehouse','clinic','school','windmill','toolworks','ironmine','weaving','apothecary','bank'].includes(b.type));
 s.automation.tasks.housing=false;s.automation.tasks.food=false;
 const p=E.automationPlan(s),types=new Set(p.map(p=>p.type));
 for(const type of ['well','warehouse','school','ironmine','toolworks','weaving'])assert.ok(types.has(type),type);
 assert.ok(p.some(p=>p.zone==='civic')&&p.some(p=>p.zone==='storage')&&p.some(p=>p.zone==='production'));assert.ok(p.every(p=>p.city&&p.reason));
 for(const type of ['school','warehouse','guildhall'])s.buildings.push({id:'prereq-'+type,type,status:'complete',size:1,x:2200,y:2200,settlementId:'home'});
 const after=E.automationPlan(s);assert.ok(after.some(p=>p.type==='clinic'));assert.ok(after.some(p=>p.type==='bank'));
 s.buildings.push({id:'planned-well',type:'well',status:'building',size:1,x:2200,y:2200,settlementId:s.settlements[0].id});
 assert.ok(!E.automationPlan(s).some(p=>p.type==='well'&&p.settlementId===s.settlements[0].id));
});
check('automation commissions affordable nonfarm projects near the city that needs them',()=>{
 const s=city(),home=s.settlements[0];s.buildings=s.buildings.filter(b=>b.type!=='well');s.resources.food=100000;
 s.automation.enabled=true;s.automation.tasks.food=false;s.automation.tasks.housing=false;
 const before=s.resources.stone;s.automation.lastCheck=s.elapsed-E.automaticConstruction.interval;E.tick(s,1);const b=s.buildings.find(b=>b.automatic);
 assert.ok(b);assert.equal(b.type,'well');assert.ok(Math.hypot(b.x-home.x,b.y-home.y)<200);assert.ok(s.resources.stone<before+E.stats(s).stoneProduction);assert.equal(b.planZone,'civic');assert.ok(b.planReason&&s.automation.recent.length===1);
 const plans=E.automationPlan(s);assert.ok(!plans.some(p=>p.type==='well'&&p.settlementId===b.settlementId));
});
check('automation prioritizes a new local housing shortage and honors disabled tasks',()=>{
 const s=city();s.settlements[0].population=E.regionalHousing(s)[s.settlements[0].id]*1.049;s.population=s.settlements.reduce((n,c)=>n+c.population,0);
 const p=E.automationPlan(s);assert.equal(p[0].reason,'预留居住空间');assert.equal(p[0].settlementId,s.settlements[0].id);
 for(const key of Object.keys(s.automation.tasks))s.automation.tasks[key]=false;assert.equal(E.automationPlan(s).length,0);
 s.automation.enabled=true;E.tick(s,2);assert.equal(s.automation.projects,0);
});
check('foreign growth and war casualties preserve each country city population totals',()=>{
 const s=city(),n=s.neighbors[0];L.foreignTick(s,2);assert.ok(Math.abs(n.population-n.cities.reduce((a,c)=>a+c.population,0))<1e-6);assert.equal(n.cities[0].radius,n.radius);
 E.mobilize(s,'levy');E.declareWar(s,n.id);E.tick(s,4);assert.ok(Math.abs(n.population-n.cities.reduce((a,c)=>a+c.population,0))<1e-6);
});
console.log(`${passed} governance and inheritance checks passed.`);
