import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({window:{}});
for(const file of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${file}.js`,import.meta.url),'utf8'),context);
const {CivilEngine:E,CivilLogistics:L,CivilSociety:S}=context.window;
const plain=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const village=()=>E.create(48271,'松湾');
const city=()=>{const s=E.create(48271,'松湾','city');E.introduceCurrency(s);s.resources.treasury=10000;return s;};
let passed=0;function check(name,fn){fn();passed++;console.log('✓ '+name);}
check('different frequencies advance a continuous clock and batch work across browser frames',()=>{
 const s=village();for(let i=0;i<100;i++)E.tick(s,.01);
 near(s.elapsed,1);assert.equal(s.simulation.runs.economy,20);assert.equal(s.simulation.runs.warfare,10);assert.equal(s.simulation.runs.foreign,4);assert.equal(s.simulation.runs.society,4);assert.equal(s.simulation.runs.policy,4);assert.equal(s.simulation.runs.planning,1);
});
check('chunking and a save with unprocessed time preserve simulated totals',()=>{
 const a=village(),b=village();E.tick(a,2);for(let i=0;i<200;i++)E.tick(b,.01);
 for(const key of ['food','wood','stone'])near(a.resources[key],b.resources[key]);near(a.population,b.population);assert.deepEqual(plain(a.simulation.runs),plain(b.simulation.runs));
 const c=village();E.tick(c,.03);const d=E.snapshot(c);E.initialize(d);E.tick(c,.02);E.tick(d,.02);assert.deepEqual(plain(c.resources),plain(d.resources));assert.equal(d.simulation.runs.economy,1);
});
check('foreign population economy and technology develop from actual facilities without open trade',()=>{
 const s=city(),n=s.neighbors[0],p=n.population,g=n.growth,e=n.economy,t=n.technology,r=n.radius;
 E.tick(s,5);assert.ok(n.population>p);assert.ok(n.cities.every(c=>c.population<=context.window.CivilNations.housing(c)*1.05+1e-6));assert.ok(n.economy>0&&n.technology>t);assert.ok(n.development.last.used.food>0);assert.ok(n.radius>r);assert.equal(n.tradeLast.imported,0);
});
check('wartime slows foreign growth and losses still reduce population',()=>{
 const s=city(),n=s.neighbors[0];E.mobilize(s,'levy');E.declareWar(s,n.id);const before=n.population;
 const peaceful=E.initialize(plain(s));peaceful.warfare.wars=[];E.tick(s,1);E.tick(peaceful,1);assert.ok(n.population<peaceful.neighbors[0].population);assert.ok(n.resources.food<peaceful.neighbors[0].resources.food);assert.ok(s.warfare.wars[0].enemySupply>=0);
});
check('six resources and seven new buildings have real data and unlocks',()=>{
 const s=village();assert.equal(E.resources.length,11);assert.equal(E.buildings.length,67);assert.ok(E.available(s,E.buildings.find(d=>d.id==='claypit')).ok);assert.ok(E.available(s,E.buildings.find(d=>d.id==='storehouse')).ok);assert.ok(!E.available(s,E.buildings.find(d=>d.id==='ironmine')).ok);
});
check('production recipes consume inputs and supplies receive actual household use',()=>{
 const s=village();s.population=100;s.resources.iron=10;s.resources.cloth=20;s.resources.wood=100;s.resources.food=100;
 s.buildings.push(...['toolworks','weaving','apothecary'].map((type,i)=>({id:'recipe'+i,type,status:'complete',size:1,x:2100+i*30,y:2100})));
 const tech=E.technologySummary(s).production;L.tick(s,1);near(s.resources.iron,10-2*tech);near(s.resources.tools,1.5*tech-.03);assert.ok(s.resources.medicine>0);assert.ok(s.resources.food<100);assert.ok(s.storage.last.used.iron>0);
});
check('no input or storage space means no processing and no phantom output',()=>{
 const s=village();s.resources.iron=0;s.buildings.push({id:'tools',type:'toolworks',status:'complete',size:1});const wood=s.resources.wood;L.tick(s,1);assert.equal(s.resources.tools,0);near(s.resources.wood,wood);
 s.resources.iron=20;s.resources.tools=L.capacity(s,'tools');s.population=0;const iron=s.resources.iron;L.tick(s,1);near(s.resources.iron,iron);
});
check('warehouses increase capacity, overflow is measured, and old stock is grandfathered',()=>{
 const s=village(),cap=L.capacity(s,'wood');s.resources.wood=cap+25;L.fit(s);near(s.resources.wood,cap);near(s.storage.lost.wood,25);
 s.buildings.push({id:'depot',type:'storehouse',status:'complete',size:2});near(L.capacity(s,'wood'),cap+700);
 const old=E.snapshot(s);delete old.storage;old.resources.wood=9500;E.initialize(old);L.fit(old);near(old.resources.wood,9500);assert.ok(E.storageSummary(old).lines.some(r=>r.id==='wood'&&r.stock===9500));
});
check('tools improve real production but do not replace basic buildings',()=>{
 const s=city();s.industrialized=true;const before=E.stats(s).woodProduction;s.resources.tools=1000;assert.ok(E.stats(s).woodProduction>before);
 for(const type of ['hut','farm','lumber','well','path','storehouse'])assert.ok(E.available(s,E.buildings.find(d=>d.id===type)).ok,type);
});
check('trade plans validate quantities, stages, duplicates and barter sides',()=>{
 const s=village();s.neighbors=E.snapshot(E.create(48271,'邻国','city')).neighbors;E.initialize(s);const id=s.neighbors[0].id;
 assert.ok(!E.configureTrade(s,id,{imports:{food:2},exports:{}}).ok);
 assert.ok(!E.configureTrade(s,id,{imports:{food:2},exports:{food:3}}).ok);
 assert.ok(!E.configureTrade(s,id,{imports:{iron:2},exports:{wood:3}}).ok);
 assert.ok(!E.configureTrade(s,id,{imports:{food:-2},exports:{wood:3}}).ok);
 assert.ok(E.configureTrade(s,id,{imports:{food:2},exports:{wood:1}}).ok);
});
check('pre-currency barter removes matching goods from both real stocks without money',()=>{
 const s=E.create(48271,'实物','city'),n=s.neighbors[0];s.currency.adopted=false;s.resources.treasury=0;E.configureTrade(s,n.id,{imports:{food:10},exports:{wood:5}});E.foreignAction(s,n.id,'trade');
 const food=s.resources.food,wood=s.resources.wood,np=n.resources.food;L.foreignTick(s,.25);assert.ok(s.resources.food>food);assert.ok(s.resources.wood<wood);assert.equal(s.resources.treasury,0);assert.equal(n.tradeLast.importValue,0);assert.ok(n.resources.food<np+n.production.food*.25);
});
check('currency imports pay actual funds and exports pay the destination tariff',()=>{
 const s=city(),n=s.neighbors[0];n.economy=0;n.growth={population:0,economy:0,technology:0,territory:0};n.tariffRate=.2;
 E.configureTrade(s,n.id,{imports:{},exports:{wood:10}});E.foreignAction(s,n.id,'trade');n.resources.wood-=100;const cash=s.resources.treasury,foreign=n.resources.treasury,wood=s.resources.wood;
 L.foreignTick(s,1,{development:false});const amount=wood-s.resources.wood;assert.ok(amount>0);near(s.resources.treasury-cash,amount*2*.8);near(foreign-n.resources.treasury,amount*2*.8);near(n.tradeLast.foreignTariff,amount*2*.2);
 const stock=s.resources.food,treasury=s.resources.treasury;E.configureTrade(s,n.id,{imports:{food:10},exports:{}});L.foreignTick(s,1,{development:false});const bought=s.resources.food-stock;assert.ok(bought>0);near(treasury-s.resources.treasury,bought);
});
check('import tariff is charged then collected once, with a value-based tax base',()=>{
 const s=city(),n=s.neighbors[0];S.setTax(s,'customs',.2);s.taxation.transitions.customs.age=400;E.configureTrade(s,n.id,{imports:{stone:5},exports:{}});E.foreignAction(s,n.id,'trade');
 const treasury=s.resources.treasury;L.foreignTick(s,.25);const flow=n.tradeLast;near(treasury-s.resources.treasury,flow.importValue*1.2*.25);
 near(S.taxQuote(s).lines.find(l=>l.id==='customs').base,flow.importValue);const before=s.resources.treasury;S.tick(s,.25);near(s.resources.treasury-before,S.taxQuote(s).total*.25);near(flow.tariff,flow.importValue*.2);
 const second=s.neighbors[1];E.configureTrade(s,second.id,{imports:{food:15},exports:{}});E.foreignAction(s,second.id,'trade');L.foreignTick(s,.25);S.tick(s,.25);
 for(const n of s.neighbors)near(n.tradeLast.tariff,n.tradeLast.importValue*.2);
 assert.ok(s.neighbors[0].tradeTotals.domesticTariff>0);
});
check('cash shortages, counterpart shortages, capacity, embargo and war block deliveries',()=>{
 const s=city(),n=s.neighbors[0];E.configureTrade(s,n.id,{imports:{food:10},exports:{}});E.foreignAction(s,n.id,'trade');s.resources.treasury=0;const food=s.resources.food;L.foreignTick(s,.25);near(s.resources.food,food);
 s.resources.treasury=1000;s.resources.food=L.capacity(s,'food');L.foreignTick(s,.25);near(n.tradeLast.imported,0);
 s.resources.food=10;n.resources.food=0;for(const c of n.cities)c.assets=[];n.development.autoBuild=false;L.foreignTick(s,.25);near(n.tradeLast.imported,0);assert.ok(n.population<s.neighbors[0].development.initialPopulation);
 n.embargo=true;L.foreignTick(s,.25);near(n.tradeLast.imported,0);n.embargo=false;E.mobilize(s,'levy');E.declareWar(s,n.id);L.foreignTick(s,.25);near(n.tradeLast.exported,0);
});
check('tax feedback records projected delta and cumulative actual receipts',()=>{
 const s=city(),before=S.taxQuote(s).total;assert.ok(S.setTax(s,'poll',.1).ok);s.taxation.transitions.poll.age=400;near(s.taxation.lastChange.revenueDelta,S.taxQuote(s).total-before);
 const cash=s.resources.treasury;S.tick(s,.25);near(s.taxation.totalCollected,s.resources.treasury-cash);assert.ok(s.taxation.collections.poll>0);
});
check('policy feedback distinguishes coverage, conditional execution, penalties and expiry',()=>{
 const s=village();E.draftPolicy(s,{name:'守望',clauses:['firewatch'],regions:['all'],target:'all',executor:'community',condition:'always',duration:5});const p=s.proposals[0];p.coverage=80;p.localCoverage={home:80};let f=E.policyFeedbackSummary(s,p);assert.ok(f.woodPercent<0&&f.stability<0);p.active=false;f=E.policyFeedbackSummary(s,p);near(f.woodPercent,0);p.active=true;E.tick(s,6);assert.ok(s.history.some(h=>h.title.includes('到期')));assert.ok(s.history.filter(h=>h.data?.proposalId===p.id).length<=4);
});
check('war feedback accumulates paid costs and real casualties across automatic battles',()=>{
 const s=city(),n=s.neighbors[0];E.mobilize(s,'levy');E.declareWar(s,n.id);const war=s.warfare.wars[0];E.tick(s,3);const summary=E.warSummary(s);assert.ok(summary.totals.food>0);assert.ok(war.costs.food>0);assert.ok(summary.totals.battles>0);assert.ok(war.losses>0);near(war.losses,summary.totals.losses);E.negotiate(s,n.id,'reparations');assert.ok(E.warSummary(s).history[0].losses>0);
});
check('save restore preserves goods, growth, trade orders, receipts and scheduling',()=>{
 const s=city();E.configureTrade(s,s.neighbors[0].id,{imports:{food:3},exports:{wood:2}});E.tick(s,.28);const copy=E.snapshot(s);E.initialize(copy);
 for(const key of ['resources','storage','simulation'])assert.deepEqual(plain(copy[key]),plain(s[key]));assert.deepEqual(plain(copy.neighbors[0].tradePlan),plain(s.neighbors[0].tradePlan));
});
check('regional policy feedback is population-weighted and overlapping proposals share capped effects',()=>{
 const s=village();s.population=100;s.settlements[0].population=50;s.settlements.push({...s.settlements[0],id:'second',name:'新地',population:50,x:2300});
 const p={id:'local',clauses:['forage'],regions:['home'],target:'families',condition:'always',active:true,coverage:100,localCoverage:{home:100}};s.proposals.push(p);
 near(E.policyFeedbackSummary(s,p).foodPercent,22*.5*.85);
 p.regions=['all'];p.target='all';p.localCoverage.second=100;s.proposals.push({...p,id:'overlap'});
 near(E.policyFeedbackSummary(s,p).foodPercent,11);near(E.policyFeedbackSummary(s,s.proposals[1]).foodPercent,11);
});
check('late-era basic housing can actually be built and retains its seven-person capacity',()=>{
 const s=village();s.industrialized=true;E.initialize(s);const before=E.stats(s).housing;let result;
 for(let i=0;i<100;i++){const a=i*.23,x=2048+Math.cos(a)*230,y=2048+Math.sin(a)*230;result=E.build(s,'hut',x,y);if(result.ok)break;}
 assert.ok(result.ok,result.message);const b=s.buildings.find(b=>b.id===result.buildingId);b.progress=99.99;E.tick(s,.25);assert.equal(b.status,'complete');assert.equal(b.type,'brickhouse');near(b.housingOverride,7);near(E.stats(s).housing,before+7);
});
check('an insolvent foreign buyer cannot create export income',()=>{
 const s=city(),n=s.neighbors[0];n.resources.treasury=0;n.economy=0;n.taxRate=0;for(const c of n.cities)c.assets=c.assets.filter(b=>!E.buildings.find(d=>d.id===b.type)?.treasuryRate);E.configureTrade(s,n.id,{imports:{},exports:{wood:20}});E.foreignAction(s,n.id,'trade');const before=s.resources.treasury,wood=s.resources.wood;L.foreignTick(s,.25);near(n.tradeLast.exported,0);near(s.resources.treasury,before);near(s.resources.wood,wood);
});
console.log(`${passed} systems engine checks passed.`);
