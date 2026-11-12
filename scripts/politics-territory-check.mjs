import assert from 'node:assert/strict';import vm from'node:vm';import{readFile}from'node:fs/promises';
const c=vm.createContext({window:{}});for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),c);
const{CivilEngine:E,CivilPolitics:P,CivilTerritory:G,CivilSociety:S,CivilWarfare:W,CivilLogistics:L,CivilTerrain:T}=c.window,plain=v=>JSON.parse(JSON.stringify(v));
const seed=E.create(48271,'政务','city'),city=()=>{const s=E.initialize(plain(seed));s.events=[];s.history=[];return s;};let passed=0;const check=(name,fn)=>{fn();passed++;console.log('✓ '+name);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const advance=(s,years,fn=P.tick)=>{for(let i=0;i<years*2;i++){s.elapsed+=.5;s.year+=.5;fn(s,.5);}};
function troubled(s){s.stability=5;s.resources.food=0;for(const id of Object.keys(s.taxation.rates))s.taxation.rates[id]=.2;s.economy.unemployment=.3;s.warfare.weariness=80;return s;}
function totalPeople(s){return s.population+s.neighbors.reduce((n,v)=>n+v.population,0);}
function rich(s){for(const k of ['food','wood','stone','treasury']){s.resources[k]=100000;s.storage.base[k]=100000;}return s;}
function active(s,goal={type:'security'}){E.mobilize(s,'levy');const n=s.neighbors[0];assert.ok(E.declareWar(s,n.id,goal).ok);return s.warfare.wars[0];}
check('healthy cities do not immediately strike and local pressure accumulates over time',()=>{
 const s=city();advance(s,12);assert.ok(!s.unrest.regions.home.strike&&!s.unrest.noble.refusing);const t=troubled(city());advance(t,.5);assert.ok(!t.unrest.regions.home.strike);advance(t,7);assert.ok(t.unrest.regions.home.strike);assert.ok(t.unrest.regions.home.reasons.some(r=>r.name==='食物不足'));
});
check('strikes reduce actual production tax collection construction and policy execution',()=>{
 const a=rich(city()),b=E.initialize(plain(a)),id=b.settlements[0].id;const before=E.stats(a);b.unrest.regions[id].strike=true;
 assert.ok(E.stats(b).foodProduction<before.foodProduction);assert.ok(S.taxQuote(b).total<S.taxQuote(a).total);near(E.stats(b).housing,before.housing);
 for(const s of [a,b]){s.buildings.push({id:'qa-work',type:'farm',size:1,status:'building',x:2300,y:2300,settlementId:id,years:10,progress:0});s.proposals[0].localCoverage[id]=0;}
 E.tick(a,.25);E.tick(b,.25);assert.ok(b.buildings.at(-1).progress<a.buildings.at(-1).progress);assert.ok(b.proposals[0].localCoverage[id]<a.proposals[0].localCoverage[id]);
});
check('unrest applies to each resource facility locally and does not remove housing',()=>{
 const s=city(),a=s.settlements[0].id,b=s.settlements[1].id;s.buildings=[{id:'a',type:'weaving',status:'complete',size:1,x:1000,y:1000,settlementId:a},{id:'b',type:'weaving',status:'complete',size:1,x:2000,y:2000,settlementId:b}];s.resources.cloth=0;s.unrest.regions[a].strike=true;L.tick(s,1);const low=s.storage.last.gross.cloth;s.unrest.regions[a].strike=false;s.resources.cloth=0;L.tick(s,1);assert.ok(low<s.storage.last.gross.cloth);assert.equal(P.labor(s,b),1);
});
check('prolonged revolt has real casualties and important nonrepeating notifications',()=>{
 const s=troubled(city());advance(s,11);assert.ok(s.unrest.regions.home.revolt);const before=s.population;advance(s,1);assert.ok(s.population<before);near(s.population,s.settlements.reduce((n,c)=>n+c.population,0));assert.ok(s.history.some(e=>e.title.includes('发生内乱')&&e.priority==='major'));assert.equal(s.history.filter(e=>e.title===s.name+'发生内乱').length,1);
});
check('relief talks autonomy cost real resources have durations and can restore order',()=>{
 const s=rich(city()),id=s.settlements[1].id,r=s.unrest.regions[id];r.discontent=80;r.strike=r.revolt=true;const food=s.resources.food;assert.ok(E.unrestAction(s,id,'relief').ok);assert.ok(s.resources.food<food);assert.equal(E.unrestAction(s,id,'relief').ok,false);assert.ok(E.unrestAction(s,id,'talks').ok);assert.ok(E.unrestAction(s,id,'autonomy').ok);assert.equal(E.unrestAction(s,s.settlements[0].id,'autonomy').ok,false);assert.ok(P.compliance(s,id)<P.compliance(s,s.settlements[0].id));s.stability=98;advance(s,12);assert.equal(r.revolt,false);assert.equal(r.strike,false);
 const restored=E.initialize(plain(s));assert.deepEqual(plain(restored.unrest),plain(s.unrest));
});
check('unresolved local revolt creates an independent country with actual people assets and stocks',()=>{
 const s=troubled(city()),home=s.settlements[1],r=s.unrest.regions[home.id],assets=s.buildings.filter(b=>b.settlementId===home.id),before=totalPeople(s),wood=s.resources.wood+s.neighbors.reduce((n,v)=>n+v.resources.wood,0);r.discontent=100;r.revolt=r.strike=true;r.secessionPressure=8.5;advance(s,.5);
 const n=s.neighbors.find(n=>n.origin==='independence');assert.ok(n);assert.ok(!s.settlements.some(c=>c.id===home.id));assert.equal(n.cities[0].assets.length,assets.length);assert.ok(!s.buildings.some(b=>b.settlementId===home.id));assert.ok(totalPeople(s)<before);near(wood,s.resources.wood+s.neighbors.reduce((n,v)=>n+v.resources.wood,0));assert.equal(E.foreignOwner(s,home.x,home.y).id,n.id);assert.ok(s.events.some(e=>e.data.unrest&&e.priority==='major'));
 assert.ok(s.settlements.length>=1&&s.settlements[0].id==='home');assert.equal(G.releaseCity(s,'home').ok,false);assert.equal(E.unrestAction(s,home.id,'relief').ok,false);L.foreignTick(s,.25);assert.ok(Object.values(n.resources).every(Number.isFinite));
});
check('returning a lost city restores its exact buildings mineral identities and culture',()=>{
 const s=city(),home=s.settlements[1],ids=s.buildings.filter(b=>b.settlementId===home.id).map(b=>b.id).sort(),before=totalPeople(s);const r=G.releaseCity(s,home.id),n=s.neighbors.find(n=>n.id===r.nationId);assert.ok(G.acquireCities(s,n,[home.id],'重归').ok);near(totalPeople(s),before);assert.deepEqual(s.buildings.filter(b=>b.settlementId===home.id).map(b=>b.id).sort(),ids);assert.ok(s.culture.regions[home.id]);assert.equal(s.proposals[0].localCoverage[home.id],0);
});
check('nobles can refuse taxes orders and recruitment then recover cooperation',()=>{
 const s=rich(city());s.nobles.support=5;s.nobles.influence=80;const before=S.taxQuote(s).total;advance(s,2);assert.ok(s.unrest.noble.refusing);assert.ok(S.taxQuote(s).total<before);assert.equal(S.nobleAction(s,'service').ok,false);assert.ok(S.nobleAction(s,'privileges').ok);E.mobilize(s,'levy');assert.ok(E.warSummary(s).maxSoldiers<s.population*.025);s.nobles.support=70;advance(s,3);assert.equal(s.unrest.noble.refusing,false);
});
check('foreign expansion is seeded finite paid for and migrates existing population',()=>{
 let found=0;for(const n of city().neighbors){const a=city(),b=city(),na=a.neighbors.find(v=>v.id===n.id),nb=b.neighbors.find(v=>v.id===n.id),pop=na.population,food=na.resources.food,count=na.cities.length;const result=G.expand(a,na);assert.equal(result,G.expand(b,nb));assert.deepEqual(plain(na.cities),plain(nb.cities));if(!result)continue;found++;assert.equal(na.cities.length,count+1);near(na.population,pop);near(na.cities.reduce((v,c)=>v+c.population,0),pop);assert.ok(na.resources.food<food);const c=na.cities.at(-1);assert.ok(!T.sample(c.x,c.y,a.seed,a.geographyVersion).water);assert.ok(a.settlements.every(p=>Math.hypot(p.x-c.x,p.y-c.y)>=780));}
 assert.ok(found>0,'at least one real frontier must remain expandable');
});
check('expansion scheduling survives reload and wars suspend settlement expansion',()=>{
 const s=city(),n=s.neighbors[0];n.expansion.nextAt=1;const restored=E.initialize(plain(s));s.elapsed=restored.elapsed=1;G.tick(s);G.tick(restored);assert.deepEqual(plain(s.neighbors[0].cities),plain(restored.neighbors[0].cities));assert.ok(n.expansion.nextAt>1);const count=n.cities.length;E.mobilize(s,'levy');E.declareWar(s,n.id);assert.equal(G.expand(s,n),false);assert.equal(n.cities.length,count);
});
check('declarations validate commercial and territorial goals before starting a war',()=>{
 const s=city(),n=s.neighbors[0];E.mobilize(s,'levy');assert.equal(E.declareWar(s,n.id,{type:'territory',cityId:'bad'}).ok,false);assert.equal(s.warfare.wars.length,0);assert.ok(E.declareWar(s,n.id,{type:'territory',cityId:n.cities.at(-1).id}).ok);assert.equal(s.warfare.wars[0].goal.type,'territory');assert.ok(E.warSummary(s).wars[0].goalLabel.includes(n.cities.at(-1).name));
});
check('territorial peace transfers the specified city population buildings resources and ownership',()=>{
 const s=city(),n=s.neighbors[0],target=n.cities.at(-1),before=totalPeople(s),count=s.settlements.length;const w=active(s,{type:'territory',cityId:target.id});assert.equal(E.negotiate(s,n.id,'objective').ok,false);w.score=45;assert.ok(E.negotiate(s,n.id,'objective').ok);assert.equal(s.settlements.length,count+1);near(totalPeople(s),before);assert.ok(s.buildings.some(b=>b.settlementId===target.id));assert.equal(E.foreignOwner(s,target.x,target.y),undefined);assert.ok(E.regionalHousing(s)[target.id]>=target.population);assert.ok(s.settlements.find(c=>c.id===target.id).integrationUntil>s.elapsed);assert.equal(s.warfare.wars.length,0);assert.equal(s.warfare.history[0].goal.cityId,target.id);
});
check('commercial war goals affect actual export tariffs and expire',()=>{
 const s=rich(city()),n=s.neighbors[0],w=active(s,{type:'commerce'});w.score=30;assert.ok(E.negotiate(s,n.id,'objective').ok);assert.ok(n.tradeOpen&&n.commercialTreaty.beneficiary==='player');E.configureTrade(s,n.id,{exports:{wood:10},imports:{}});L.foreignTick(s,.25);near(n.tradeLast.foreignTariff/n.tradeLast.exportValue,Math.min(.02,n.tariffRate));s.elapsed=n.commercialTreaty.until;near(E.tradeTariffs(s,n).foreign,n.tariffRate);
});
check('defenders see enemy objectives and can choose a counter-objective once',()=>{
 const s=city(),n=s.neighbors[0],w=active(s);w.aggressor=false;w.goalChosen=false;w.enemyGoal={type:'territory',cityId:s.settlements[1].id};assert.ok(E.warSummary(s).wars[0].enemyGoalLabel.includes(s.settlements[1].name));assert.ok(E.setWarGoal(s,n.id,{type:'commerce'}).ok);assert.equal(E.setWarGoal(s,n.id,{type:'security'}).ok,false);
});
check('a lost defensive territorial war actually cedes the target city',()=>{
 const s=city(),n=s.neighbors[0],target=s.settlements[1],before=totalPeople(s),w=active(s);w.aggressor=false;w.enemyGoal={type:'territory',cityId:target.id};w.score=-75;w.nextBattle=s.elapsed;s.warfare.soldiers=0;s.resources.food=s.resources.wood=s.resources.treasury=0;W.tick(s,.001);assert.equal(s.warfare.wars.length,0);assert.ok(!s.settlements.some(c=>c.id===target.id));assert.ok(n.cities.some(c=>c.id===target.id));near(totalPeople(s),before);assert.equal(E.foreignOwner(s,target.x,target.y).id,n.id);
});
check('foreign commercial demands cap import customs without double collection',()=>{
 const s=rich(city()),n=s.neighbors[0];for(const k of Object.keys(s.taxation.rates))s.taxation.rates[k]=0;s.taxation.rates.customs=.2;n.commercialTreaty={beneficiary:'neighbor',until:20};n.tradeOpen=true;n.relation=60;n.tension=10;E.configureTrade(s,n.id,{imports:{food:10},exports:{}});const treasury=s.resources.treasury;L.foreignTick(s,.25);const due=n.tradeLast.importValue*.02;near(S.taxQuote(s).lines.find(l=>l.id==='customs').revenue,due);assert.ok(s.resources.treasury<treasury);const cash=s.resources.treasury;S.tick(s,.25);near(s.resources.treasury-cash,due*.25);
});
function diplomatic(s){const n=s.neighbors[0];n.population=1500;for(const c of n.cities)c.population=n.population*c.share;n.economy=500;n.economyBaseline=500;n.relation=80;n.tension=10;s.warfare.soldiers=1000;return n;}
check('peaceful annexation requires real economic military diplomatic and internal strength',()=>{
 const s=rich(city()),n=diplomatic(s);assert.ok(E.annexOffer(s,n.id).eligible);s.warfare.soldiers=0;assert.equal(E.annex(s,n.id).ok,false);s.warfare.soldiers=1000;n.relation=20;assert.equal(E.annex(s,n.id).ok,false);n.relation=80;s.stability=25;assert.equal(E.annex(s,n.id).ok,false);
});
check('annexation costs resources waits four years transfers cities and survives reload',()=>{
 const s=rich(city()),n=diplomatic(s),count=s.settlements.length,people=totalPeople(s),food=s.resources.food;assert.ok(E.annex(s,n.id).ok);assert.ok(s.resources.food<food);assert.equal(E.annex(s,n.id).ok,false);s.elapsed=3.5;G.tick(s);assert.equal(s.settlements.length,count);const t=E.initialize(plain(s));t.elapsed=4;G.tick(t);assert.equal(t.settlements.length,count+n.cities.length);assert.ok(!t.neighbors.some(p=>p.id===n.id));near(totalPeople(t),people);assert.ok(t.settlements.filter(c=>c.acquiredFrom===n.name).every(c=>E.regionalHousing(t)[c.id]>=c.population));assert.ok(t.history.some(e=>e.data.territory&&e.priority==='major'));
});
check('failed annexation does not mint cities refund costs or erase the target nation',()=>{
 const s=rich(city()),n=diplomatic(s);assert.ok(E.annex(s,n.id).ok);const food=s.resources.food,count=s.settlements.length;n.relation=20;s.elapsed=1;G.tick(s);assert.equal(s.settlements.length,count);assert.ok(s.neighbors.includes(n));assert.equal(s.resources.food,food);assert.equal(n.annexation,null);assert.ok(n.annexCooldown>s.elapsed);
});
check('new social territory treaty and war-goal states migrate and persist',()=>{
 const s=city();delete s.unrest;delete s.territory;for(const n of s.neighbors){delete n.cities;delete n.expansion;}E.initialize(s);assert.ok(s.neighbors.every(n=>n.cities.length===1&&n.expansion));assert.ok(s.unrest.regions.home);const w=active(s);delete w.goal;delete w.enemyGoal;E.initialize(s);assert.equal(w.goal.type,'security');assert.deepEqual(plain(E.initialize(plain(s)).unrest),plain(s.unrest));const t=rich(city());E.tick(t,1);assert.ok(t.simulation.runs.politics===2);
});
console.log(`${passed} politics territory and war-objective checks passed.`);
