import assert from 'node:assert/strict';import vm from'node:vm';import{readFile}from'node:fs/promises';
const c=vm.createContext({window:{}});for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),c);
const{CivilEngine:E,CivilTerrain:T,CivilMinerals:M,CivilEconomy:A,CivilLogistics:L}=c.window,plain=x=>JSON.parse(JSON.stringify(x));
const template=E.create(48271,'经济城','city'),city=()=>E.initialize(plain(template));let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('✓ '+name);};const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const advance=(s,years)=>{for(let i=0;i<years*2;i++){s.elapsed+=.5;s.year+=.5;A.tick(s,.5);}};
check('terrain has continents islands sea channels plains hills basins desert and rainforest',()=>{
 const biomes=new Set(),continents=new Set();for(let x=48;x<4096;x+=64)for(let y=48;y<4096;y+=64){const p=T.sample(x,y,48271);biomes.add(p.biome);if(!p.water)continents.add(p.continent);assert.ok(Number.isFinite(p.fertility)&&p.fertility>=0);}
 for(const b of ['海域','平原','丘陵','盆地','沙漠','热带雨林','高山'])assert.ok(biomes.has(b),b);assert.ok(continents.has('海岛')&&continents.has('新大陆'));
 const g=T.world(48271);for(let v=-800;v<=800;v+=100){const u=840,x=2048+u*g.cos-v*g.sin,y=2048+u*g.sin+v*g.cos;assert.ok(T.sample(x,y,48271).water,'sea channel');}
});
check('terrain and deposits are seed-stable and legacy saves retain the old map',()=>{
 const s=city();delete s.geographyVersion;E.initialize(s);assert.equal(s.geographyVersion,undefined);assert.equal(T.sample(2500,2500,s.seed,1).foodFactor,1);
 assert.deepEqual(plain(M.deposits(s)),plain(M.deposits(E.initialize(plain(s)))));
 for(const [x,y] of [[0,0],[2048,2048],[2900,1500]])assert.deepEqual(plain(T.sample(x,y,42)),plain(T.sample(x,y,42)));
 assert.ok(M.deposits(city()).some(d=>d.type==='gold'));
});
check('terrain changes real farm productivity and construction costs',()=>{
 const s=E.create(48271,'地形'),points={};for(let x=100;x<4000;x+=40)for(let y=100;y<4000;y+=40){const p=T.sample(x,y,s.seed);if(['沙漠','盆地','丘陵'].includes(p.biome)&&!points[p.biome])points[p.biome]=p;}
 const add=p=>({id:'testfarm',type:'farm',size:1,status:'complete',x:p.x,y:p.y,settlementId:'home'});s.buildings.push(add(points['沙漠']));const dry=E.stats(s).foodProduction;s.buildings[s.buildings.length-1]=add(points['盆地']);assert.ok(E.stats(s).foodProduction>dry);
 const d=E.buildings.find(d=>d.id==='hut'),flat=E.constructionCosts(s,d,1),hill=E.constructionCosts(s,d,1,points['丘陵'].x,points['丘陵'].y);assert.ok(hill.wood>flat.wood);
});
check('mine selection rejects an incorrect location without spending resources',()=>{
 const s=city();s.knowledge=200;const resource=plain(s.resources);let p;
 for(const home of s.settlements)for(let i=0;i<100&&!p;i++){const x=home.x+Math.cos(i*.7)*440,y=home.y+Math.sin(i*.7)*440;if(!T.sample(x,y,s.seed).water&&!E.foreignOwner(s,x,y)&&!M.site(s,'iron',x,y))p={x,y};}
 assert.ok(p);const r=E.build(s,'ironmine',p.x,p.y);assert.equal(r.ok,false);assert.ok(r.message.includes('铁矿'));assert.deepEqual(plain(s.resources),resource);
});
check('survey costs resources takes time reveals only explored unlocked deposits and persists',()=>{
 const s=city(),home=s.settlements[0],before=s.resources.food;assert.ok(M.survey(s,home.x,home.y).ok);assert.equal(s.resources.food,before-24);assert.equal(M.survey(s,home.x,home.y).ok,false);
 M.tick(s);assert.ok(!M.visible(s).some(d=>d.type==='iron'||d.type==='coal'));
 const saved=E.initialize(plain(s));saved.elapsed=2.5;M.tick(saved);assert.equal(saved.minerals.surveys.length,0);assert.ok(saved.history.some(e=>e.title==='地质勘探完成'));
 const seen=M.visible(saved);assert.ok(seen.every(d=>E.isExplored(saved,d.x,d.y)));assert.ok(seen.some(d=>d.type==='iron'||d.type==='coal'||d.type==='copper'));
 const early=E.create(0,'早期');assert.equal(M.survey(early,2048,2048).ok,false);assert.ok(!M.visible(early).some(d=>d.type==='gold'));
});
check('mine production deducts shared finite reserves and never switches deposits on exhaustion',()=>{
 const s=city(),d=M.deposits(s).find(d=>d.type==='copper');assert.ok(d);s.population=s.settlements[0].population=10000;
 const a={id:'ore-a',type:'coppermine',size:1,status:'complete',x:d.x,y:d.y},b={...a,id:'ore-b'};s.buildings=[a,b];s.minerals.sites[a.id]=s.minerals.sites[b.id]=d.id;s.minerals.used[d.id]=d.reserves-3;s.resources.copper=0;
 L.tick(s,1);near(s.resources.copper,3);near(M.remaining(s,d),0);const after=s.resources.copper;L.tick(s,1);near(s.resources.copper,after);assert.equal(M.depositFor(s,a).id,d.id);assert.equal(s.history.filter(h=>h.title==='矿藏已经枯竭').length,1);
 assert.ok(s.resources.copper>=0);const restored=E.initialize(plain(s));assert.equal(M.factor(restored,restored.buildings[0]),0);
});
check('higher ore quality increases output and full storage prevents mining',()=>{
 const a=city(),b=city();for(const s of [a,b]){s.buildings=[{id:'ore',type:'ironmine',status:'complete',size:1,x:2000,y:2000}];s.minerals.legacy.ore={id:'finite',type:'iron',x:2000,y:2000,quality:1,reserves:1000};s.resources.iron=0;}
 b.minerals.legacy.ore.quality=1.5;L.tick(a,1);L.tick(b,1);assert.ok(b.resources.iron>a.resources.iron);
 const d=M.depositFor(a,a.buildings[0]),used=a.minerals.used[d.id];a.resources.iron=L.capacity(a,'iron');L.tick(a,1);near(a.minerals.used[d.id],used);
});
check('quarries preserve finite stone when storage is full and stop exactly at capacity',()=>{
 const s=city(),mine=s.buildings.find(b=>b.type==='quarry'),d=M.depositFor(s,mine);assert.ok(d);s.resources.stone=L.capacity(s,'stone');const reserve=M.remaining(s,d);E.tick(s,.05);near(M.remaining(s,d),reserve);
 s.resources.stone=L.capacity(s,'stone')-.01;const before=M.remaining(s,d);E.tick(s,.05);assert.ok(M.remaining(s,d)>=before-.010001);assert.ok(s.resources.stone<=L.capacity(s,'stone'));
});
check('copper has an actual processing chain and gold can be exported for real funds',()=>{
 const s=city();s.resources.copper=10;s.resources.tools=0;s.buildings.push({id:'bronze',type:'bronzesmith',size:1,status:'complete',x:2048,y:2048});L.tick(s,1);assert.ok(s.resources.copper<10&&s.storage.last.gross.tools>0);
 const n=s.neighbors[0];s.resources.gold=10;s.resources.treasury=0;E.configureTrade(s,n.id,{imports:{},exports:{gold:2}});E.foreignAction(s,n.id,'trade');const gold=s.resources.gold;L.foreignTick(s,1);assert.ok(s.resources.gold<gold&&s.resources.treasury>0);
});
check('national demand accounts balance and pre-currency villages expose no financial policy',()=>{
 const s=city(),q=A.quote(s);near(q.demand,q.consumption+q.investment+q.government+q.netExports);assert.ok(q.realGDP>0&&q.multiplier>1);near(q.outputGap,q.realGDP/q.potentialGDP-1);
 const v=E.create(0,'村');assert.equal(A.quote(v).enabled,false);assert.equal(A.setPolicy(v,'spending',.2).ok,false);A.tick(v,10);assert.equal(v.resources.treasury,0);
});
check('fiscal stimulus raises demand real activity employment and prices with a cash cost',()=>{
 const a=city(),b=city();for(const s of [a,b]){s.resources.treasury=1e6;s.resources.food=s.population*10;}
 A.setPolicy(a,'spending',0);A.setPolicy(b,'spending',.28);const cash=b.resources.treasury;advance(a,8);advance(b,8);
 assert.ok(b.economy.activity>a.economy.activity);assert.ok(b.economy.unemployment<a.economy.unemployment);assert.ok(b.economy.inflation>a.economy.inflation);assert.ok(b.resources.treasury<cash&&b.economy.totals.spending>0);
});
check('excess credit plus cheap borrowing triggers a crisis and tightening permits recovery',()=>{
 const s=city();s.buildings.push({id:'bank',type:'bank',status:'complete',size:1,x:2048,y:2048});s.resources.treasury=1e6;s.resources.food=s.population*10;
 assert.ok(A.setPolicy(s,'credit',1).ok);assert.ok(A.setPolicy(s,'interest',.01).ok);advance(s,20);assert.equal(s.economy.crisis?.type,'credit');assert.ok(s.history.some(e=>e.data.economicCrisis&&e.priority==='major'));
 const investment=A.quote(s).investment,crisis=s.economy.crisis;s.economy.crisis=null;assert.ok(A.quote(s).investment>investment);s.economy.crisis=crisis;assert.ok(s.economy.activity<1);
 A.setPolicy(s,'credit',.2);A.setPolicy(s,'interest',.08);A.setPolicy(s,'spending',.25);advance(s,15);assert.equal(s.economy.crisis,null);assert.ok(s.history.some(e=>e.title==='经济逐步复苏'));
});
check('demand recession and supply inflation have different triggers and recovery conditions',()=>{
 const s=city();s.resources.treasury=1e6;s.resources.food=s.population*10;A.setPolicy(s,'spending',0);s.economy.confidence=40;advance(s,25);assert.equal(s.economy.crisis?.type,'demand');
 A.setPolicy(s,'spending',.3);advance(s,20);assert.equal(s.economy.crisis,null);
 const supply=city();supply.resources.food=0;supply.resources.treasury=1e6;supply.economy.inflation=.09;advance(supply,.5);assert.equal(supply.economy.crisis?.type,'supply');
});
check('debt produces actual funds interest costs and repayment never mints money',()=>{
 const s=city(),before=s.resources.treasury;assert.ok(A.debtAction(s,'borrow').ok);const debt=s.economy.debt;near(s.resources.treasury-before,debt);
 advance(s,1);assert.ok(s.economy.totals.interest>0);const cash=s.resources.treasury,old=s.economy.debt;assert.ok(A.debtAction(s,'repay').ok);near(cash-s.resources.treasury,old-s.economy.debt);
 s.economy.debt=A.quote(s).realGDP*2;assert.equal(A.debtAction(s,'borrow').ok,false);
});
check('insolvent budgets do not create treasury or fully financed aggregate demand',()=>{
 const s=city();s.resources.treasury=0;s.economy.debt=10000;s.economy.policy.spending=.3;advance(s,1);assert.equal(s.resources.treasury,0);assert.ok(s.economy.last.unfunded>0);assert.equal(s.economy.last.spending,0);assert.ok(A.quote(s).government===0);
});
check('monetary prices influence real construction and trade while economic state survives a save',()=>{
 const s=city(),d=E.buildings.find(d=>d.id==='bank'),before=E.constructionCosts(s,d);s.economy.priceIndex=1.5;const after=E.constructionCosts(s,d);assert.ok(after.treasury>before.treasury);assert.equal(after.wood,before.wood);
 assert.ok(A.price(s,'gold',22)>22);A.debtAction(s,'borrow');advance(s,2);const r=E.initialize(plain(s));assert.deepEqual(plain(r.economy),plain(s.economy));assert.ok(r.economy.history.length>=2);
});
console.log(`${passed} terrain minerals and macroeconomic checks passed.`);
