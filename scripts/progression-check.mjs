import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const context=vm.createContext({window:{}});
for(const file of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${file}.js`,import.meta.url),'utf8'),context);
const E=context.window.CivilEngine,T=context.window.CivilTerrain;
const plain=value=>JSON.parse(JSON.stringify(value));
const definition=id=>E.buildings.find(d=>d.id===id);
let serial=0,passed=0;
function check(name,fn){fn();passed++;console.log(`✓ ${name}`);}
function complete(s,type,size=1){
 const b={id:`fixture-${++serial}`,type,x:2350+serial%8*38,y:1900+Math.floor(serial%48/8)*42,size,status:'complete',progress:100,settlementId:'home'};
 s.buildings.push(b);return b;
}
function setPopulation(s,population){s.population=population;s.settlements[0].population=population;}
function richCity(population=10000){
 // Isolate progression gates from the richer medieval scenario and its existing defenses.
 const s=E.create(48271,'试验城');
 // Controlled legacy terrain isolates progression gates from biome productivity.
 s.geographyVersion=1;
 s.cityFounded=true;
 for(const type of ['council','market','granary','workshop','school','well','canal','quarry','lumber','bridge','path'])complete(s,type);
 s.neighbors=[];s.hostiles=[];s.hostileAt=1e9;
 setPopulation(s,population);s.knowledge=300;s.currency={adopted:true,introducedAt:0};
 s.resources={...s.resources,food:200000,wood:200000,stone:200000,treasury:200000};
 for(const key of Object.keys(s.storage.base))s.storage.base[key]=Math.max(s.storage.base[key],s.resources[key]);
 return s;
}
function prerequisites(s){for(const type of ['machineworks','warehouse','forge','library'])if(!s.buildings.some(b=>b.type===type&&b.status==='complete'))complete(s,type);}
function support(s){
 // A scaled housing block and agricultural district keep fixtures compact.
 // They are completed facilities, not an artificial minimum-population rule.
 const homes=definition('townhouse'),food=definition('estate');
 complete(s,'townhouse',Math.ceil(s.population*1.5/Math.max(1,homes.housing)));
 complete(s,'estate',Math.ceil(s.population*.45/Math.max(1,food.foodRate)));
}
function freePlot(s,type,home=s.settlements[0]){
 const d=definition(type);
 for(let i=0;i<300;i++){
  const a=i*2.399963,r=100+Math.floor(i/12)*16,x=home.x+Math.cos(a)*r,y=home.y+Math.sin(a)*r;
  if(T.sample(x,y,s.seed).water||!E.isExplored(s,x,y))continue;
  if(E.occupiedBuildings(s).some(b=>E.buildingsOverlap({type,x,y,size:1},b)))continue;
  return{x,y};
 }
 throw Error(`No free plot for ${type}`);
}
const proposal=(clauses,extras={})=>({name:'试行规则',clauses,regions:['all'],target:'all',executor:'community',condition:'always',duration:30,...extras});

check('fifteen new buildings expose actual economic, capacity or defense effects',()=>{
 const ids=['palisade','watchtower','wall','windmill','watermill','warehouse','townhouse','apartment','clinic','academy','machineworks','publicschool','railstation','steamplant','estate'];
 for(const id of ids){
  assert.ok(definition(id),`missing ${id}`);
  const s=richCity(15000);prerequisites(s);complete(s,'factory');s.industrialized=true;
  const before=E.stats(s);complete(s,id);const after=E.stats(s);
  assert.ok(Object.keys(after).some(key=>typeof after[key]==='number'&&Number.isFinite(after[key])&&after[key]!==before[key]&&!['buildings','projects'].includes(key)),`${id} has no observable effect`);
 }
});

check('industrialization uses the largest individual city rather than total national population',()=>{
 const s=richCity(12000);prerequisites(s);
 s.settlements[0].population=6000;s.settlements.push({id:'second',name:'副城',population:6000,x:2550,y:2450,level:3});
 assert.equal(E.largestCityPopulation(s),6000);
 assert.equal(E.available(s,definition('factory')).ok,false);
 assert.ok(!E.proposalOptions(s).clauses.some(d=>d.id==='industry'));
 s.settlements[0].population=10000;s.settlements[1].population=2000;
 assert.equal(E.largestCityPopulation(s),10000);assert.ok(E.available(s,definition('factory')).ok);
 assert.ok(E.proposalOptions(s).clauses.some(d=>d.id==='industry'));
});

check('the ten-thousand threshold, knowledge and each industrial prerequisite are enforced without spending',()=>{
 for(const missing of ['population','knowledge','machineworks','warehouse']){
  const s=richCity();prerequisites(s);
  if(missing==='population')setPopulation(s,9999);
  else if(missing==='knowledge')s.knowledge=179;
  else s.buildings=s.buildings.filter(b=>b.type!==missing);
  const before=plain(s.resources);
  assert.equal(E.available(s,definition('factory')).ok,false,missing);
  assert.equal(E.build(s,'factory',2300,2100).ok,false,missing);
  assert.deepEqual(plain(s.resources),before,`${missing}: locked build spent resources`);
 }
});

check('industrial projects must be placed in the qualifying city, not its small satellite',()=>{
 const s=richCity();prerequisites(s);
 const satellite={id:'satellite',name:'林间小镇',x:2700,y:2048,population:100,level:1};
 s.settlements.push(satellite);s.population+=satellite.population;s.explored.push({x:satellite.x,y:satellite.y,radius:350});
 assert.ok(E.available(s,definition('factory')).ok);
 const plot=freePlot(s,'factory',satellite),before=plain(s.resources);
 assert.equal(E.build(s,'factory',plot.x,plot.y).ok,false);
 assert.deepEqual(plain(s.resources),before);
});

check('construction and policy prerequisite chains can be reached without circular unlock deadlocks',()=>{
 const s=richCity(60000);s.knowledge=1000;
 let todo=E.buildings.filter(d=>!s.buildings.some(b=>b.type===d.id&&b.status==='complete'));
 for(let i=0;i<E.buildings.length&&todo.length;i++){
  const open=todo.filter(d=>E.available(s,d).ok);
  if(!open.length)break;
  open.forEach(d=>complete(s,d.id));todo=todo.filter(d=>!open.includes(d));
 }
 assert.deepEqual(plain(todo.map(d=>d.id)),[],'unreachable buildings');
 assert.equal(E.isIndustrialized(s),true);
 s.neighbors=[{id:'test-contact'}];
 assert.ok(E.policies.every(d=>E.available(s,d).ok),'a policy remains unreachable with all prerequisites');
 const machine=richCity(3000);machine.knowledge=180;
 assert.equal(E.available(machine,definition('machineworks')).ok,false);
 complete(machine,'forge');assert.equal(E.available(machine,definition('machineworks')).ok,false);
 complete(machine,'watermill');assert.equal(E.available(machine,definition('machineworks')).ok,true);
});

check('water mills require a riverside site and rejected inland construction does not consume resources',()=>{
 const s=richCity(600);complete(s,'bridge');
 assert.ok(E.available(s,definition('watermill')).ok);
 const home=s.settlements[0],validPlot=river=>{
  const d=definition('watermill');
  for(let i=0;i<400;i++){
   const a=i*2.399963,r=150+Math.floor(i/15)*10,x=home.x+Math.cos(a)*r,y=home.y+Math.sin(a)*r,p=T.sample(x,y,s.seed);
   if(p.water||!E.isExplored(s,x,y)||(river?p.river>100:p.river<180))continue;
   if(E.occupiedBuildings(s).some(b=>E.buildingsOverlap({type:'watermill',x,y,size:1},b)))continue;
   return {x,y};
  }
  throw Error(`No ${river?'riverside':'inland'} water-mill test site`);
 };
 const inland=validPlot(false),before=plain(s.resources);
 assert.equal(E.build(s,'watermill',inland.x,inland.y).ok,false);assert.deepEqual(plain(s.resources),before);
 const riverside=validPlot(true);assert.ok(E.build(s,'watermill',riverside.x,riverside.y).ok);
 assert.ok(s.resources.wood<before.wood&&s.resources.stone<before.stone);
});

check('public education is hidden and rejected until a qualifying factory actually completes',()=>{
 const s=richCity();prerequisites(s);support(s);
 assert.equal(E.isIndustrialized(s),false);
 assert.ok(!E.proposalOptions(s).clauses.some(d=>d.id==='education'));
 assert.equal(E.available(s,definition('publicschool')).ok,false);
 const before=plain(s.resources);
 assert.equal(E.draftPolicy(s,proposal(['education'])).ok,false);assert.equal(E.build(s,'publicschool',2300,2100).ok,false);
 assert.deepEqual(plain(s.resources),before);
 assert.ok(E.available(s,definition('school')).ok);assert.ok(E.available(s,definition('academy')).ok);
 const p=freePlot(s,'factory'),r=E.build(s,'factory',p.x,p.y);assert.ok(r.ok,r.message);
 const factory=s.buildings.find(b=>b.id===r.buildingId);assert.equal(factory.status,'building');assert.equal(E.isIndustrialized(s),false);
 // Complete real construction through the simulation; make random failure deterministic.
 factory.progress=99.99;s.rngState=1;E.tick(s,.25);
 assert.equal(factory.status,'complete');assert.equal(E.isIndustrialized(s),true);
 assert.ok(E.available(s,definition('publicschool')).ok);
 assert.ok(!E.proposalOptions(s).clauses.some(d=>d.id==='education'));
 complete(s,'publicschool');assert.ok(E.proposalOptions(s).clauses.some(d=>d.id==='education'));
 assert.ok(E.draftPolicy(s,proposal(['education'])).ok);
});

check('a legacy four-hundred-person factory keeps output but cannot bypass industrial or education gates',()=>{
 const s=richCity(400);s.knowledge=300;complete(s,'factory');delete s.industrialized;E.initialize(s);
 assert.equal(E.isIndustrialized(s),false);assert.ok(!E.proposalOptions(s).clauses.some(d=>d.id==='education'));
 assert.equal(E.available(s,definition('publicschool')).ok,false);
 const withFactory=E.stats(s).woodRate,without=E.initialize(plain(s));without.buildings=without.buildings.filter(b=>b.type!=='factory');
 assert.ok(withFactory>E.stats(without).woodRate);
 setPopulation(s,10000);prerequisites(s);support(s);E.tick(s,.25);
 assert.equal(E.isIndustrialized(s),true);assert.ok(!E.proposalOptions(s).clauses.some(d=>d.id==='education'));
 complete(s,'publicschool');assert.ok(E.proposalOptions(s).clauses.some(d=>d.id==='education'));
});

check('dense homes and food infrastructure are available before industry rather than locked behind it',()=>{
 const s=richCity(240);s.knowledge=45;
 assert.ok(E.available(s,definition('townhouse')).ok);
 assert.ok(E.available(s,definition('windmill')).ok||E.available(s,definition('watermill')).ok);
 assert.ok(definition('townhouse').housing>definition('hut').housing);
 assert.equal(E.isIndustrialized(s),false);
 const growing=richCity(600);complete(growing,'windmill');complete(growing,'library');
 assert.ok(E.available(growing,definition('estate')).ok);
 assert.ok(E.available(growing,definition('academy')).ok);
 setPopulation(growing,1500);complete(growing,'warehouse');complete(growing,'academy');
 assert.ok(E.available(growing,definition('apartment')).ok);
 const large=richCity(10000);support(large);
 const summary=E.stats(large);assert.ok(summary.housing>=10000);assert.ok(summary.foodProduction>=summary.foodConsumption);
 assert.ok(large.buildings.length<200);
 E.tick(large,10);assert.ok(large.population>=10000);assert.ok(large.resources.food>0);
 for(const value of Object.values(large.resources))assert.ok(Number.isFinite(value)&&value>=0);
 assert.ok(Math.abs(large.population-large.settlements.reduce((sum,t)=>sum+t.population,0))<1e-5);
});

check('completed defenses reduce actual raids while distant walls cannot protect another settlement',()=>{
 const unguarded=richCity(),guarded=E.initialize(plain(unguarded)),distant=E.initialize(plain(unguarded));
 const hostile={id:'test-raider',name:'来犯氏族',x:2250,y:2000,pressure:80,lastRaid:-20,truceUntil:0,guardUntil:0};
 for(const s of [unguarded,guarded,distant])s.hostiles=[plain(hostile)];
 const wall=complete(guarded,'wall');wall.x=2120;wall.y=2048;
 const farWall=complete(distant,'wall');farWall.x=3500;farWall.y=3500;
 for(const s of [unguarded,guarded,distant])E.tick(s,.25);
 assert.ok(guarded.resources.food>unguarded.resources.food,'nearby walls should reduce food stolen');
 assert.equal(distant.resources.food,unguarded.resources.food,'distant defense should not grant nationwide protection');
 assert.ok(guarded.history.some(e=>e.kind==='failure'&&e.data.hostileId==='test-raider'));
});

check('major institutional change has more resistance, trust cost and implementation time',()=>{
 const a=richCity(),b=E.initialize(plain(a));support(a);support(b);
 a.institutions.governance='elders';b.institutions.governance='elders';
 const small=E.reformPreview(a,'governance','council'),large=E.reformPreview(b,'governance','representative');
 assert.ok(small.ok);assert.ok(large.ok);assert.ok(large.change>small.change);assert.ok(large.resistance>small.resistance);assert.ok(large.years>small.years);
 const trustA=a.stability,trustB=b.stability;
 assert.ok(E.reform(a,'governance','council').ok);assert.ok(E.reform(b,'governance','representative').ok);
 assert.ok(trustB-b.stability>trustA-a.stability);
 assert.equal(a.institutions.governance,'elders');assert.equal(b.institutions.governance,'elders');
});

check('institutional reforms remain pending through save and apply only after implementation',()=>{
 const s=richCity();support(s);s.institutions.governance='elders';
 const preview=E.reformPreview(s,'governance','representative');assert.ok(preview.ok);
 assert.ok(E.reform(s,'governance','representative').ok);assert.ok(s.reformProcess);
 const before=plain(s.resources);assert.equal(E.reform(s,'property','household').ok,false);assert.deepEqual(plain(s.resources),before);
 E.tick(s,Math.min(preview.years*.4,100));assert.equal(s.institutions.governance,'elders');assert.ok(s.reformProcess);
 const restored=E.initialize(plain(s));
 for(let i=0;i<5&&restored.institutions.governance!=='representative';i++)E.tick(restored,Math.min(120,preview.years+1));
 assert.equal(restored.institutions.governance,'representative');assert.ok(!restored.reformProcess);
});

check('larger policy changes cost more political support and spread more slowly',()=>{
 const a=richCity(),b=E.initialize(plain(a));support(a);support(b);
 const narrow=proposal(['forage']),broad=proposal(['forage','reserve','works','irrigation']);
 const small=E.draftPolicy(a,{...narrow,preview:true}),large=E.draftPolicy(b,{...broad,preview:true});
 assert.ok(small.ok);assert.ok(large.ok);assert.ok(large.resistance>small.resistance);
 const trustA=a.stability,trustB=b.stability;
 assert.ok(E.draftPolicy(a,narrow).ok);assert.ok(E.draftPolicy(b,broad).ok);
 assert.ok(trustB-b.stability>trustA-a.stability);
 E.tick(a,1);E.tick(b,1);assert.ok(b.proposals[0].coverage<a.proposals[0].coverage);
});

check('renaming an unchanged policy does not charge political opposition or restart implementation',()=>{
 const s=richCity();support(s);assert.ok(E.draftPolicy(s,proposal(['reserve'],{name:'储粮安排'})).ok);E.tick(s,2);
 const p=s.proposals[0],before={started:p.started,coverage:p.coverage,stability:s.stability,resources:plain(s.resources)};
 assert.ok(E.draftPolicy(s,proposal([...p.clauses],{...plain(p),name:'更名后的储粮安排'})).ok);
 assert.equal(s.proposals.length,1);assert.equal(p.started,before.started);assert.equal(p.coverage,before.coverage);
 assert.equal(s.stability,before.stability);assert.deepEqual(plain(s.resources),before.resources);
});

check('reversing a major policy also faces resistance from the groups affected',()=>{
 const s=richCity();prerequisites(s);support(s);
 assert.ok(E.draftPolicy(s,proposal(['forage','industry'])).ok);
 const current=s.proposals[0];
 const reversal=E.draftPolicy(s,{...plain(current),clauses:['forage'],preview:true});
 const simple=E.draftPolicy(s,{...proposal(['forage']),preview:true});
 assert.ok(reversal.ok);assert.ok(reversal.resistance>simple.resistance);
 const trust=s.stability;assert.ok(E.draftPolicy(s,{...plain(current),clauses:['forage']}).ok);
 assert.ok(s.stability<trust);assert.equal(s.proposals.length,1);
});

console.log(`${passed} progression, industrialization and resistance checks passed.`);
