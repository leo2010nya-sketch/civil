import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const ctx=vm.createContext({window:{}});
for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),ctx);
const {CivilEngine:E,CivilNations:N,CivilLogistics:L,CivilTerritory:T,CivilMinerals:M}=ctx.window;
const copy=v=>JSON.parse(JSON.stringify(v)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let passed=0;function check(name,fn){fn();passed++;console.log('✓ '+name);}
const nationBaseline=E.create(48271,'共同规则','city');
function city(){const s=E.initialize(copy(nationBaseline));for(const n of s.neighbors)n.development.autoBuild=false;return s;}
function small(){const s=city(),n=s.neighbors[0];s.neighbors=[n];n.cities=[n.cities[0]];const c=n.cities[0];n.population=c.population=100;c.share=1;c.assets=[{id:'test-home',type:'townhouse',size:3,status:'complete',settlementId:c.id,x:c.x,y:c.y}];n.resources=Object.fromEntries([...L.resources.map(r=>[r.id,0]),['treasury',1000]]);n.resources.food=1000;n.resources.wood=1000;n.resources.stone=1000;n.taxRate=0;n.development.initialPopulation=100;n.development.initialEconomy=100;return {s,n,c};}
check('legacy migration preserves population stocks and existing foreign building identities',()=>{
 const s=city(),n=s.neighbors[0],stock=copy(n.resources),population=n.population,ids=n.cities.flatMap(c=>c.assets.map(b=>b.id));delete n.development;delete n.storage;E.initialize(s);near(n.population,population);assert.deepEqual(copy(n.resources),stock);assert.deepEqual(n.cities.flatMap(c=>c.assets.map(b=>b.id)),ids);assert.ok(n.cities.every(c=>N.housing(c)>=c.population));
});
check('foreign residents eat real grain and food exhaustion reduces population and economic activity',()=>{
 const {s,n,c}=small();n.resources.food=0;c.population=n.population=1000;const p=n.population,e=n.economy;N.advance(s,1);assert.ok(n.population<p);assert.ok(n.development.last.foodSatisfaction<1);assert.ok(n.development.last.used.food>0);assert.ok(n.resources.food>=0);assert.ok(n.economy<e);near(n.population,n.cities.reduce((v,c)=>v+c.population,0));
});
check('local housing caps growth at 105 percent and construction offers no early capacity',()=>{
 const {s,n,c}=small();c.assets[0].housingOverride=100;c.population=n.population=104.999;c.assets.push({id:'pending-house',type:'townhouse',size:3,status:'building',years:100,progress:0,x:c.x+60,y:c.y,settlementId:c.id});
 N.advance(s,2);assert.ok(c.population<=105+1e-8&&c.population>=104.999);near(N.housing(c),100);
});
check('spare housing in another foreign city cannot hide local overcrowding',()=>{
 const {s,n,c}=small();c.assets[0].housingOverride=50;n.cities.push({...c,id:'roomy',x:c.x+500,population:10,share:10/110,assets:[{...c.assets[0],id:'roomy-house',housingOverride:1000}]});n.population=110;c.share=100/110;N.advance(s,.5);near(c.population,100);assert.ok(n.cities[1].population>10);
});
check('technology alone never produces absent minerals or manufactured goods',()=>{
 const {s,n}=small();n.technology=9999;N.advance(s,1);for(const k of ['iron','coal','copper','gold','tools','cloth','medicine'])near(n.resources[k],0);
});
check('foreign processing stops without inputs and consumes actual raw materials when available',()=>{
 const {s,n,c}=small();c.assets.push({id:'tools',type:'toolworks',size:1,status:'complete',settlementId:c.id,x:c.x+50,y:c.y});N.advance(s,.5);near(n.resources.tools,0);n.resources.iron=10;const wood=n.resources.wood;N.advance(s,.05);assert.ok(n.resources.tools>0);assert.ok(n.resources.iron<10&&n.resources.iron>=10-2*1.4*.05);near(10-n.resources.iron,n.development.last.used.iron*.05);assert.ok(n.development.last.used.wood>0);assert.ok(n.resources.wood<wood+5);
});
check('foreign mining consumes the same finite deposits and full warehouses prevent extraction',()=>{
 const {s,n,c}=small(),deposit=M.deposits(s).find(d=>d.type==='clay');c.assets.push({id:'foreign-clay',type:'claypit',status:'complete',size:1,settlementId:c.id,x:deposit.x,y:deposit.y});s.minerals.sites['foreign-clay']=deposit.id;s.minerals.used[deposit.id]=deposit.reserves-2;
 N.advance(s,1);near(M.remaining(s,deposit),0);near(n.resources.clay,2);N.advance(s,1);near(n.resources.clay,2);
 const d=M.deposits(s).find(d=>d.type==='clay'&&d.id!==deposit.id);s.minerals.sites['foreign-clay']=d.id;n.resources.clay=N.capacity(n,'clay');const used=s.minerals.used[d.id]||0;N.advance(s,.5);near(s.minerals.used[d.id]||0,used);assert.ok(!s.events.some(e=>e.title==='矿藏已经枯竭'));
 n.resources.clay-=.1;N.advance(s,.5);near((s.minerals.used[d.id]||0)-used,.1);near(n.resources.clay,N.capacity(n,'clay'));
});
check('foreign logging depletes shared map forests and cannot harvest after exhaustion',()=>{
 const {s,n,c}=small();let p;for(const t of ctx.window.CivilTerrain.trees(s.seed,s.geographyVersion))if(E.forestRemaining(s,t.x,t.y)>24){p=t;break;}
 c.assets.push({id:'foreign-logging',type:'lumber',status:'complete',size:1,x:p.x,y:p.y,settlementId:c.id});const before=E.forestRemaining(s,p.x,p.y);N.advance(s,.5);assert.ok(E.forestRemaining(s,p.x,p.y)<before);E.harvest(s,p.x,p.y,1e9);N.advance(s,.5);near(E.forestRemaining(s,p.x,p.y),0);
});
check('foreign construction enforces technology population prerequisites currency and real costs',()=>{
 const {s,n,c}=small();assert.equal(N.canBuild(n,c,E.buildings.find(d=>d.id==='factory')),false);assert.equal(N.canBuild(n,c,E.buildings.find(d=>d.id==='publicschool')),false);n.currency=false;assert.equal(N.canBuild(n,c,E.buildings.find(d=>d.id==='forge')),false);n.currency=true;
 const wood=n.resources.wood;assert.ok(N.build(s,n,c,'hut'));const b=c.assets.at(-1);near(wood-n.resources.wood,b.cost.wood);const housing=N.housing(c);N.advance(s,.5);assert.equal(b.status,'building');near(N.housing(c),housing);N.advance(s,4);assert.equal(b.status,'complete');near(N.housing(c),housing+7);
});
check('automatic foreign planning spends reserves and does not create free facilities when insolvent',()=>{
 const {s,n,c}=small();n.development.autoBuild=true;n.resources.wood=n.resources.stone=n.resources.treasury=0;const count=c.assets.length;N.plan(s,n);assert.equal(c.assets.length,count);n.resources.wood=n.resources.stone=1000;N.plan(s,n);assert.ok(c.assets.some(b=>b.status==='building'));assert.ok(n.resources.wood<1000);
});
check('foreign military upkeep draws food timber and money and shortages weaken actual armies',()=>{
 const {s,n,c}=small();c.population=n.population=1000;E.mobilize(s,'levy');E.declareWar(s,n.id);const war=s.warfare.wars[0];n.resources.food=n.resources.wood=n.resources.treasury=0;c.assets=[];const army=war.enemySoldiers;N.advance(s,1);assert.ok(war.enemySupply<.5);assert.ok(war.enemySoldiers<army);assert.ok(war.enemySoldiers<=n.population*.12);assert.ok(n.resources.food>=0&&n.resources.treasury>=0);
});
check('both barter and monetary exports respect the receiving country warehouse capacity',()=>{
 const s=city(),n=s.neighbors[0];n.tradeOpen=true;n.relation=70;n.tension=0;n.resources.wood=N.capacity(n,'wood');E.configureTrade(s,n.id,{imports:{},exports:{wood:10}});const before=s.resources.wood;L.foreignTick(s,.25,{development:false});near(n.tradeLast.exported,0);near(s.resources.wood,before);
 s.currency.adopted=false;E.configureTrade(s,n.id,{imports:{food:20},exports:{wood:10}});L.foreignTick(s,.25,{development:false});near(n.tradeLast.exported,0);near(n.tradeLast.imported,0);
});
check('annexed cities retain their actual paid facilities instead of recreating infrastructure',()=>{
 const s=city(),n=s.neighbors[0],c=n.cities[0],ids=c.assets.map(b=>b.id).sort();assert.ok(T.acquireCities(s,n,[c.id],'测试兼并').ok);assert.deepEqual(s.buildings.filter(b=>b.settlementId===c.id).map(b=>b.id).sort(),ids);
});
check('foreign expansion pays for the houses and farms it transfers to a new settlement',()=>{
 const s=city();let expanded=false;for(const n of s.neighbors){for(const key of ['wood','stone','food','treasury'])n.resources[key]=1e6;const before=copy(n.resources),population=n.population;if(!T.expand(s,n))continue;const c=n.cities.at(-1);assert.ok(c.assets.length>0&&N.housing(c)>=c.population);assert.ok(before.wood-n.resources.wood>60);assert.ok(before.stone>n.resources.stone);near(n.population,population);expanded=true;break;}assert.ok(expanded);
});
check('adaptive timing stays within one to five seconds and eases back after sustained recovery',()=>{
 const s=city();E.updateForeign(s,{now:0});near(E.foreignTiming(s).intervalMs,1000);for(let i=1;i<=100;i++)E.updateForeign(s,{now:i*16,frameMs:180,workMs:80});const slow=E.foreignTiming(s).intervalMs;assert.ok(slow>4000&&slow<=5000);for(let i=1;i<=2600;i++)E.updateForeign(s,{now:2000+i*16,frameMs:16,workMs:2});assert.ok(E.foreignTiming(s).intervalMs<slow&&E.foreignTiming(s).intervalMs>=1000);
});
check('deferred country time advances in batches rather than on each player frame',()=>{
 const s=city(),n=s.neighbors[0],before=n.population;E.updateForeign(s,{now:0});E.tick(s,.5,{deferForeign:true});near(n.population,before);near(s.simulation.foreignPending,.5);assert.equal(E.updateForeign(s,{now:999}),false);assert.ok(E.updateForeign(s,{now:1000}));assert.ok(n.population>before);near(s.simulation.foreignPending,0);
 const slow=city(),p=slow.neighbors[0].population;E.updateForeign(slow,{now:0});E.tick(slow,.05,{deferForeign:true});assert.ok(E.updateForeign(slow,{now:2000}));assert.ok(slow.neighbors[0].population>p,'1x updates must not wait for the older nine-second foreign interval');
});
check('batch frequency cannot change elapsed country growth consumption or construction',()=>{
 const {s:a}=small(),b=E.initialize(copy(a));N.advance(a,2);for(let i=0;i<200;i++)N.advance(b,.01);near(a.neighbors[0].population,b.neighbors[0].population);for(const r of L.resources)near(a.neighbors[0].resources[r.id],b.neighbors[0].resources[r.id]);
});
check('pending time and country facilities survive saves without duplicated offline development',()=>{
 const s=city();E.tick(s,.3,{deferForeign:true});const restored=E.initialize(copy(s)),p=restored.neighbors[0].population;near(restored.simulation.foreignPending,.3);E.updateForeign(restored,{now:0});near(restored.neighbors[0].population,p);assert.ok(E.updateForeign(restored,{now:1000}));const after=restored.neighbors[0].population;E.updateForeign(restored,{now:6000});near(restored.neighbors[0].population,after);near(restored.simulation.foreignPending,0);
});
console.log(`${passed} shared foreign rules and adaptive scheduling checks passed.`);
