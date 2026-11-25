import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const context=vm.createContext({window:{}});
for(const file of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${file}.js`,import.meta.url),'utf8'),context);
const E=context.window.CivilEngine,T=context.window.CivilTerrain;
const clone=value=>JSON.parse(JSON.stringify(value));
const village=()=>E.create(48271,'河湾');
const city=(seed=48271)=>E.create(seed,'溪城','city');
// A developed pre-currency save isolates barter/adoption behavior. New inherit starts are monetary.
const barter=()=>{const s=city();s.currency={adopted:false,introducedAt:null};s.resources.treasury=0;for(const k of Object.keys(s.taxation.rates))s.taxation.rates[k]=0;return s;};
let passed=0;
function check(name,fn){fn();passed++;console.log(`✓ ${name}`);}
function frontier(s,angle=0){
 const home=s.explored[0];
 for(let i=0;i<24;i++){
  const a=angle+i*.1,x=home.x+Math.cos(a)*(home.radius+70),y=home.y+Math.sin(a)*(home.radius+70);
  if(!T.sample(x,y,s.seed).water&&!E.isExplored(s,x,y))return {x,y};
 }
 throw Error('No land frontier found');
}

check('village remains the default and city starts with real housing, production and two countries',()=>{
 const a=village(),b=city();
 assert.equal(a.population,36);assert.equal(a.currency.adopted,false);assert.equal(a.year,0);
 assert.equal(b.startMode,'city');assert.ok(b.population>=4800);assert.equal(b.year,0);
 assert.ok(b.neighbors.length>=2);assert.ok(b.buildings.some(x=>x.type==='council'&&x.status==='complete'));
 assert.ok(b.buildings.some(x=>x.type==='market'&&x.status==='complete'));
 assert.ok(E.stats(b).housing>=b.population);assert.ok(E.stats(b).foodProduction>=E.stats(b).foodConsumption);
 assert.ok(b.settlements.length>=2&&b.settlements.length<=5);assert.ok(b.settlements.every(x=>x.population>=2400));assert.equal(b.startEra,'medieval');assert.ok(b.nobles.influence>0);assert.equal(b.buildings.filter(x=>x.type==='hut').length,0);
});

check('seeded city and surrounding countries have reproducible land positions across seeds',()=>{
 for(const seed of [0,1,19,48271,2147483646]){
  const a=city(seed),b=city(seed),home=a.settlements[0];
  assert.deepEqual(clone(a.neighbors.map(n=>[n.id,n.x,n.y])),clone(b.neighbors.map(n=>[n.id,n.x,n.y])));
  for(const n of a.neighbors){assert.ok(!T.sample(n.x,n.y,seed).water);assert.ok(Math.hypot(n.x-home.x,n.y-home.y)>300);}
  for(const building of a.buildings)assert.ok(!T.sample(building.x,building.y,seed).water,`${seed}: ${building.type} on water`);
  assert.ok(Math.hypot(a.neighbors[0].x-a.neighbors[1].x,a.neighbors[0].y-a.neighbors[1].y)>300);
 }
});

check('city baseline survives ten years with finite resources and population',()=>{
 const s=city(),initial=s.population;E.tick(s,10);
 assert.ok(s.population>=initial);assert.ok(s.resources.food>0);
 for(const value of Object.values(s.resources))assert.ok(Number.isFinite(value)&&value>=0);
 assert.ok(Math.abs(s.population-s.settlements.reduce((sum,t)=>sum+t.population,0))<1e-6);
});

check('currency is absent before the player makes a city-stage innovation',()=>{
 const s=village();
 assert.equal(E.hasCurrency(s),false);assert.equal(E.canIntroduceCurrency(s).ok,false);
 const before=clone(s.resources);assert.equal(E.introduceCurrency(s).ok,false);assert.deepEqual(clone(s.resources),before);
 assert.equal(E.setBudget(s,'taxRate',.2).ok,false);
 s.population=130;s.settlements[0].population=130;s.knowledge=30;
 s.buildings.push({id:'test-market',type:'market',status:'complete',size:1,x:2200,y:2100});
 s.institutions.allocation='market';
 for(const d of [...E.buildings,...E.policies])if(d.cost?.treasury)assert.equal(E.available(s,d).ok,false,`${d.id} should require currency`);
 assert.equal(E.stats(s).treasuryRate,0);E.tick(s,1);assert.equal(s.resources.treasury,0);
});

check('a developed barter save and currency adoption pays real costs before enabling tax income',()=>{
 const s=barter();assert.equal(E.hasCurrency(s),false);assert.ok(E.canIntroduceCurrency(s).ok);
 assert.equal(E.stats(s).treasuryRate,0);assert.equal(s.resources.treasury,0);
 const before=clone(s.resources),trust=s.stability;
 assert.ok(E.introduceCurrency(s).ok);assert.equal(E.hasCurrency(s),false);E.currencyShare(s);s.currency.effectiveYears=20;s.currency.coverage=.96;assert.equal(E.hasCurrency(s),true);
 assert.equal(s.resources.wood,before.wood-24);assert.equal(s.resources.stone,before.stone-18);assert.ok(s.stability<trust);
 assert.ok(E.setBudget(s,'taxRate',.2).ok);assert.equal(context.window.CivilStatecraft.taxRate(s,'poll'),0);s.taxation.transitions.poll.age=20;assert.ok(E.stats(s).treasuryRate>0);
 E.tick(s,1);assert.ok(s.resources.treasury>0);
 const after=clone(s.resources);assert.equal(E.introduceCurrency(s).ok,false);assert.deepEqual(clone(s.resources),after);
});

check('bilateral trade consumes actual exports and supplies complementary resources without minting money',()=>{
 const a=barter(),n=a.neighbors.find(n=>n.exportResource==='food');assert.ok(n);
 if(!n.tradeOpen)assert.ok(E.foreignAction(a,n.id,'trade').ok);
 const b=E.initialize(clone(a));b.neighbors.forEach(n=>n.tradeOpen=false);
 E.tick(a,1);E.tick(b,1);
 assert.ok(a.resources.food>b.resources.food);assert.ok(a.resources.wood<b.resources.wood);
 assert.equal(a.resources.treasury,0);assert.equal(E.foreignSummary(a).treasuryRate,0);
 assert.ok(E.foreignSummary(a).routes>=1);assert.ok(n.tradeLast.imported>0);assert.ok(n.tradeLast.exported>0);
});

check('a trade route cannot create imports when there are no goods or workers to supply exports',()=>{
 const s=barter(),n=s.neighbors.find(n=>n.exportResource==='food');
 s.neighbors.forEach(n=>n.tradeOpen=false);assert.ok(E.foreignAction(s,n.id,'trade').ok);
 s.population=0;s.settlements.forEach(t=>t.population=0);s.resources.wood=0;
 const before=s.resources.food;E.tick(s,.25);
 assert.equal(n.tradeLast.exported,0);assert.equal(n.tradeLast.imported,0);assert.equal(s.resources.food,before);
});

check('embargoes close trade and diplomacy and border patrol change real state at a resource cost',()=>{
 const s=city(),n=s.neighbors[0];
 if(!n.tradeOpen)assert.ok(E.foreignAction(s,n.id,'trade').ok);
 assert.ok(E.foreignAction(s,n.id,'embargo').ok);assert.equal(n.embargo,true);
 E.tick(s,.25);assert.equal(n.tradeLast.imported,0);assert.equal(n.tradeLast.exported,0);
 const food=s.resources.food,relation=n.relation;
 assert.ok(E.foreignAction(s,n.id,'envoy').ok);assert.equal(s.resources.food,food-12);assert.equal(n.relation,relation);assert.ok(n.diplomaticChanges.length);E.tick(s,3.25);assert.ok(n.relation>relation);
 while(n.relation<45){s.resources.food+=12;assert.ok(E.foreignAction(s,n.id,'envoy').ok);E.tick(s,3.25);}
 const foodBeforePact=s.resources.food;assert.ok(E.foreignAction(s,n.id,'pact').ok);
 assert.equal(s.resources.food,foodBeforePact-20);assert.ok(n.pactUntil>=s.elapsed+10);
 const wood=s.resources.wood;assert.ok(E.foreignAction(s,n.id,'patrol').ok);assert.equal(s.resources.wood,wood-10);assert.ok(n.guardUntil>=s.elapsed+10);
 const resources=clone(s.resources);assert.equal(E.foreignAction(s,'absent','trade').ok,false);assert.deepEqual(clone(s.resources),resources);
});

check('exploration pays for a timed expedition and reveals nothing before arrival',()=>{
 const s=village(),p=frontier(s),before=clone(s.resources),known=s.explored.length,knowledge=s.knowledge;
 s.hostileAt=1e9; // Isolate expedition reveal from the separate early-rival discovery.
 const r=E.explore(s,p.x,p.y);assert.ok(r.ok);assert.ok(r.duration>0);assert.equal(s.expeditions.length,1);
 assert.equal(s.resources.food,before.food-16);assert.equal(s.resources.wood,before.wood-6);
 assert.equal(s.knowledge,knowledge);assert.equal(s.explored.length,known);assert.equal(E.isExplored(s,p.x,p.y),false);
 E.tick(s,r.duration*.4);assert.equal(s.explored.length,known);assert.equal(E.isExplored(s,p.x,p.y),false);
 assert.ok(s.expeditions[0].progress>0&&s.expeditions[0].progress<100);
 const restored=E.initialize(clone(s));E.tick(restored,r.duration*.7);
 assert.equal(restored.expeditions.length,0);assert.equal(restored.explored.length,known+1);assert.ok(E.isExplored(restored,p.x,p.y));
 const completed=restored.history.length;E.tick(restored,.25);assert.equal(restored.explored.length,known+1);assert.ok(restored.history.length>=completed);
});

check('duplicate, disconnected and over-capacity expeditions do not spend resources',()=>{
 const s=village(),p=frontier(s);assert.ok(E.explore(s,p.x,p.y).ok);
 const before=clone(s.resources);
 assert.equal(E.explore(s,p.x,p.y).ok,false);assert.equal(E.explore(s,100,100).ok,false);
 const other=frontier(s,Math.PI);assert.equal(E.explore(s,other.x,other.y).ok,false);
 assert.deepEqual(clone(s.resources),before);assert.equal(E.expeditionLimit(s),1);
 const task=s.expeditions[0];assert.ok(E.cancelExpedition(s,task.id).ok);assert.equal(s.expeditions.length,0);assert.deepEqual(clone(s.resources),before);
 assert.ok(E.explore(s,other.x,other.y).ok);
 const c=city();assert.equal(E.expeditionLimit(c),2);
});

check('saved city retains currency, neighboring diplomacy and an expedition in progress',()=>{
 const s=city();assert.ok(E.hasCurrency(s));
 const n=s.neighbors[0];assert.ok(E.foreignAction(s,n.id,'envoy').ok);const expectedRelation=n.relation;
 // Select a frontier not already revealed around a neighboring country.
 const p=frontier(s,Math.PI/2),r=E.explore(s,p.x,p.y);assert.ok(r.ok);E.tick(s,.25);
 const restored=E.initialize(clone(s));assert.ok(E.hasCurrency(restored));assert.equal(restored.neighbors[0].relation,s.neighbors[0].relation);
 assert.ok(restored.neighbors[0].relation>=expectedRelation-1);assert.equal(restored.expeditions.length,1);
 E.tick(restored,r.duration+1);assert.equal(restored.expeditions.length,0);assert.ok(E.isExplored(restored,p.x,p.y));
});

check('legacy monetary stock becomes material reserves and never automatically adopts currency',()=>{
 const early=village();delete early.currency;early.resources.treasury=123;E.initialize(early);
 assert.equal(E.hasCurrency(early),false);assert.equal(early.resources.treasury,0);
 const late=city();delete late.currency;late.resources.treasury=123;const material=late.resources.wood+late.resources.stone;E.initialize(late);
 assert.equal(E.hasCurrency(late),false);assert.equal(late.resources.treasury,0);assert.ok(late.resources.wood+late.resources.stone>material);
 const stable=clone(late);E.initialize(late);assert.deepEqual(clone(late),stable);
});

console.log(`${passed} city, currency and exploration engine checks passed.`);
