import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const ctx=vm.createContext({window:{}});
for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),ctx);
const E=ctx.window.CivilEngine,T=ctx.window.CivilTerrain;
const plain=x=>JSON.parse(JSON.stringify(x));
const template=E.create(48271,'家园','inherit');
let passed=0,serial=0;
const check=(name,fn)=>{fn();passed++;console.log(`✓ ${name}`);};
const fixture=()=>{const s=E.initialize(plain(template));s.currency.adopted=true;s.proposals=[];s.buildings=s.buildings.filter(b=>b.type!=='bank');s.resources={...s.resources,food:200000,wood:200000,stone:200000,treasury:200000};for(const key of Object.keys(s.storage.base))s.storage.base[key]=Math.max(s.storage.base[key],s.resources[key]);return s;};
function complete(s,type){s.buildings.push({id:`expansion-${++serial}`,type,x:2200,y:2000,size:1,status:'complete',settlementId:'home'});}
const input=clauses=>({name:'新议案',clauses,regions:['all'],target:'all',executor:'community',condition:'always',duration:0});
function plot(s){for(let i=0;i<200;i++){const a=i*.23,x=2048+Math.cos(a)*365,y=2048+Math.sin(a)*365;if(!T.sample(x,y,s.seed).water&&E.isExplored(s,x,y)&&!E.foreignOwner(s,x,y))return{x,y};}throw Error('no plot');}
check('new mode aliases preserve the original starts and serialized identifiers',()=>{
 const a=E.create(0,'开拓者','explore'),b=E.create(0,'继承者','inherit');
 assert.equal(a.population,36);assert.equal(a.startMode,'village');assert.ok(b.population>=4800);assert.equal(b.startMode,'city');
 assert.equal(E.initialize(plain(b)).startMode,'city');
});
check('six policy clauses work together; seven are rejected without spending',()=>{
 const s=fixture(),ids=['forage','reserve','rationing','firewatch','watercare','landregister'];
 const preview=E.draftPolicy(s,{...input(ids),preview:true});assert.ok(preview.ok);assert.ok(preview.resistance>0);
 const before=plain(s.resources);assert.equal(E.draftPolicy(s,input([...ids,'learning'])).ok,false);assert.deepEqual(plain(s.resources),before);
 assert.ok(E.draftPolicy(s,input(ids)).ok);assert.equal(s.proposals[0].clauses.length,6);assert.ok(s.resources.food<before.food);
 E.tick(s,1);assert.ok(s.proposals[0].coverage>0);
});
check('expanded policy options hide future finance and industrial rules',()=>{
 const early=E.create(1,'小村');assert.equal(E.policies.length,28);
 const ids=E.proposalOptions(early).clauses.map(d=>d.id);assert.ok(ids.includes('rationing')&&ids.includes('firewatch'));
 for(const id of ['credit','coinage','publicaccounts','sanitation','workhours'])assert.ok(!ids.includes(id));
 const s=fixture();assert.ok(!E.proposalOptions(s).clauses.some(d=>d.id==='credit'));complete(s,'bank');
 assert.ok(E.proposalOptions(s).clauses.some(d=>d.id==='credit'));
 assert.ok(E.policies.every(p=>p.drawback&&p.tradeoffs));
});
check('new policy effects include real defense, administration, knowledge and food upkeep',()=>{
 const s=E.create(48271,'试验');s.population=s.settlements[0].population=100;s.knowledge=50;s.resources={...s.resources,food:1000,wood:1000,stone:1000,treasury:0};
 for(const t of ['council','granary','well','workshop','path'])complete(s,t);
 const initial=E.stats(s);assert.ok(E.draftPolicy(s,input(['firewatch','landregister','apprentice','relief'])).ok);
 const p=s.proposals[0];p.coverage=100;p.localCoverage={home:100};const after=E.stats(s);
 assert.ok(after.defense>initial.defense);assert.ok(after.admin>initial.admin);assert.ok(after.knowledgeRate>initial.knowledgeRate);
 assert.ok(after.policyFoodUpkeep>0);assert.ok(after.woodProduction<initial.woodProduction);
 const active=E.initialize(plain(s)),paused=E.initialize(plain(s));paused.proposals[0].active=false;
 assert.ok(E.stats(paused).policyFoodUpkeep<E.stats(active).policyFoodUpkeep);
});
check('banks and mints require player currency and provide real capacity rather than free principal',()=>{
 const s=E.initialize(plain(template));s.currency.adopted=false;s.resources.treasury=0;s.knowledge=125;s.buildings=s.buildings.filter(b=>b.type!=='bank');for(const type of ['guildhall','fair'])complete(s,type);const ids=['bank','mint','exchange'];
 for(const id of ids)assert.equal(E.available(s,E.buildings.find(d=>d.id===id)).ok,false);
 assert.ok(E.introduceCurrency(s).ok);s.resources.treasury=1000;const before=E.stats(s),stock=s.resources.treasury;
 assert.ok(E.available(s,E.buildings.find(d=>d.id==='bank')).ok);complete(s,'bank');const after=E.stats(s);
 assert.equal(s.resources.treasury,stock);assert.ok(after.constructionBonus>before.constructionBonus);assert.ok(after.treasuryRate>before.treasuryRate);
 assert.equal(E.available(s,E.buildings.find(d=>d.id==='exchange')).ok,false);s.knowledge=150;assert.ok(E.available(s,E.buildings.find(d=>d.id==='exchange')).ok);
 complete(s,'postoffice');assert.ok(E.stats(s).admin>after.admin);
});
check('named settlements validate before charging and conserve national and regional population',()=>{
 const s=fixture(),p=plot(s),before=plain(s.resources),total=s.population;
 assert.ok(E.settlementPreview(s,p.x,p.y,'晨星港').ok);assert.deepEqual(plain(s.resources),before);
 assert.equal(E.settle(s,p.x,p.y,'   ').ok,false);assert.equal(E.settle(s,p.x,p.y,s.settlements[0].name).ok,false);assert.deepEqual(plain(s.resources),before);
 const r=E.settle(s,p.x,p.y,'晨星港');assert.ok(r.ok);assert.equal(s.settlements.at(-1).name,'晨星港');
 assert.equal(s.resources.food,before.food-55);assert.equal(s.resources.wood,before.wood-65);assert.equal(s.population,total);
 assert.ok(Math.abs(s.settlements.reduce((n,t)=>n+t.population,0)-total)<1e-7);assert.ok(s.culture.regions[r.settlementId]);
 const restored=E.initialize(plain(s));assert.equal(restored.settlements.at(-1).name,'晨星港');
});
check('late-era new settlements use appropriate housing and do not invent population capacity',()=>{
 const s=fixture();s.industrialized=true;E.initialize(s);const p=plot(s),before=E.stats(s).housing;
 assert.ok(E.settle(s,p.x,p.y,'新工业镇').ok);assert.ok(!s.buildings.some(b=>b.settlementId===s.settlements.at(-1).id&&b.type==='hut'));
 assert.equal(E.stats(s).housing,before+21);const restored=E.initialize(plain(s));assert.equal(E.stats(restored).housing,before+21);
});
check('seeded faction names are stable, distinct and include western and eastern naming styles',()=>{
 const all=new Set(),western=new Set(),eastern=new Set();
 for(let seed=0;seed<60;seed++){
  const s={seed,name:'玩家',settlements:[],neighbors:[],hostiles:[]};
  const names=[E.generatedName(s,'nation',0),E.generatedName(s,'nation',1)];
  for(const name of names){all.add(name);if(/阿尔登|瓦伦|洛瑟恩|维斯特|诺德海姆|卡斯特|埃斯特拉|贝尔蒙|拉文纳|索尔维克|米拉诺|奥斯特/.test(name))western.add(name);else eastern.add(name);}
  assert.equal(names[0],E.generatedName(plain(s),'nation',0));
 }
 assert.ok(all.size>25);assert.ok(western.size>8&&eastern.size>8);
 assert.equal(new Set(template.neighbors.map(n=>n.name)).size,template.neighbors.length);assert.equal(new Set(template.settlements.map(n=>n.name)).size,template.settlements.length);
});
console.log(`${passed} expansion, settlement and naming checks passed.`);
