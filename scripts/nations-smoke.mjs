import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import{connectPage}from'./browser-check.mjs';
const b=await connectPage({timeout:60000}),ev=b.evaluate,delay=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],backup=await ev('localStorage.getItem("civil.saves.v2")');
async function check(name,src){assert.ok(await ev(src),name);checks.push(name);console.log('✓ '+name);}
async function click(sel){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Unavailable '+${JSON.stringify(sel)});e.click();return true})()`);}
async function reset(value){await b.send('Page.navigate',{url:'about:blank'});await delay(100);await b.send('Page.navigate',{url:b.config.url});for(let i=0;i<100;i++){await delay(100);try{if(await ev('typeof CivilApp==="object"'))break;}catch{}}await ev(value===null?'localStorage.removeItem("civil.saves.v2");true':`localStorage.setItem("civil.saves.v2",${JSON.stringify(value)});true`);await b.reload();}
async function start(){await ev(`CivilApp.startNew(48271,'共同规则','city');CivilApp.state.events=[];CivilApp.tick(0);for(const n of CivilApp.state.neighbors)n.development.autoBuild=false;true`);}
try{
 await reset(null);await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});await b.viewport(1440,900);await start();
 await ev(`CivilApp.openPanel('hostile');true`);await click('[data-nation-economy]');
 await check('diplomacy opens an on-demand country production and housing panel',`document.getElementById('detailPanel').textContent.includes('居住承载')&&document.getElementById('detailPanel').textContent.includes('粮食收支')&&document.querySelectorAll('[data-foreign-resource]').length>5`);
 await check('foreign map buildings and production facilities use the same actual assets',`CivilApp.state.neighbors.every(n=>n.cities.every(c=>c.assets.length>0&&CivilNations.housing(c)>=c.population))&&CivilApp.world.nationBuildings().length>0`);
 await ev(`CivilApp.tick(1);CivilApp.state.events=[];CivilApp.closePanel();CivilApp.openPanel('hostile');true`);await click('[data-nation-economy]');
 await check('displayed production and consumption come from real foreign settlement accounting',`CivilApp.state.neighbors[0].development.last.used.food>0&&document.querySelector('[data-foreign-resource="food"]').textContent.includes('消耗')&&CivilApp.state.neighbors[0].production.food>0`);
 await b.screenshot('artifacts/v52-01-foreign-economy.png');
 await ev(`(()=>{const s=CivilApp.state,n=s.neighbors[0];window.qaForeignPopulation=n.population;n.resources.food=0;n.cities.forEach(c=>c.assets=c.assets.filter(b=>!CivilEngine.buildings.find(d=>d.id===b.type)?.foodRate));CivilApp.tick(2);s.events=[];CivilApp.closePanel();CivilApp.openPanel('hostile');return true})()`);await click('[data-nation-economy]');
 await check('food exhaustion visibly lowers the actual country population',`CivilApp.state.neighbors[0].population<qaForeignPopulation&&CivilApp.state.neighbors[0].development.last.foodSatisfaction<1&&CivilApp.state.neighbors[0].development.last.populationGrowth<0`);
 await check('the foreign economy panel shows actual negative growth',`document.getElementById('detailPanel').textContent.includes('人口年增长')&&document.getElementById('detailPanel').textContent.includes('−')`);
 await start();await ev(`(()=>{const s=CivilApp.state,n=s.neighbors[0];n.cities.forEach(c=>{const h=c.assets.find(b=>CivilEngine.buildings.find(d=>d.id===b.type)?.housing);c.assets=c.assets.filter(b=>!(CivilEngine.buildings.find(d=>d.id===b.type)?.housing)||b===h);h.housingOverride=c.population/1.05;});window.qaHousingPopulation=n.population;CivilApp.tick(2);s.events=[];return true})()`);
 await check('foreign population stops at each city housing limit',`CivilApp.state.neighbors[0].population<=qaHousingPopulation+1e-6&&CivilApp.state.neighbors[0].cities.every(c=>c.population<=CivilNations.housing(c)*1.05+1e-6)`);
 await start();await ev(`(()=>{const s=CivilApp.state,n=s.neighbors[0];n.development.autoBuild=true;n.resources.wood=n.resources.stone=10000;window.qaBuildWood=n.resources.wood;CivilNations.plan(s,n);return true})()`);
 await check('automatic foreign construction spends stock and begins an unfinished real project',`CivilApp.state.neighbors[0].resources.wood<qaBuildWood&&CivilApp.state.neighbors[0].cities.some(c=>c.assets.some(b=>b.status==='building'&&b.cost.wood>0&&b.progress===0))`);
 await ev(`CivilApp.openPanel('hostile');true`);await click('[data-nation-economy]');
 await check('foreign construction progress is accessible from diplomacy',`document.getElementById('detailPanel').textContent.includes('0%')`);
 await b.viewport(390,844);await check('mobile foreign economy remains scrollable without horizontal overflow',`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('detailPanel').getBoundingClientRect().right<=innerWidth&&document.querySelector('[data-foreign-resource]')`);await b.screenshot('artifacts/v52-02-mobile-foreign.png');
 await b.viewport(1440,900);await start();
 // A separate state lets deterministic synthetic timing checks coexist with the real animation loop.
 await ev(`window.qaSchedule=CivilEngine.create(48271,'调频验证','city');qaSchedule.neighbors.forEach(n=>n.development.autoBuild=false);CivilEngine.updateForeign(qaSchedule,{now:0});window.qaBefore=qaSchedule.neighbors[0].population;CivilEngine.tick(qaSchedule,.5,{deferForeign:true});true`);
 await check('deferred updates preserve simulation time while leaving country state until its deadline',`qaSchedule.neighbors[0].population===qaBefore&&Math.abs(qaSchedule.simulation.foreignPending-.5)<1e-8&&!CivilEngine.updateForeign(qaSchedule,{now:999})`);
 await check('the one-second deadline batches the full accumulated development',`CivilEngine.updateForeign(qaSchedule,{now:1000})&&qaSchedule.neighbors[0].population>qaBefore&&qaSchedule.simulation.foreignPending===0`);
 await ev(`for(let i=1;i<=100;i++)CivilEngine.updateForeign(qaSchedule,{now:1000+i*16,frameMs:180,workMs:80});true`);
 await check('sustained device pressure lengthens the interval within the five-second ceiling',`CivilEngine.foreignTiming(qaSchedule).intervalMs>4000&&CivilEngine.foreignTiming(qaSchedule).intervalMs<=5000`);
 await ev(`for(let i=1;i<=2600;i++)CivilEngine.updateForeign(qaSchedule,{now:4000+i*16,frameMs:16,workMs:2});true`);
 await check('sustained healthy performance restores a shorter interval',`CivilEngine.foreignTiming(qaSchedule).intervalMs<2000&&CivilEngine.foreignTiming(qaSchedule).intervalMs>=1000`);
 await ev(`CivilApp.closePanel();CivilApp.state.events=[];CivilApp.tick(0);window.qaLiveStart=CivilApp.state.elapsed;window.qaLiveRuns=CivilApp.state.simulation.runs.foreignDevelopment||0;document.getElementById('playButton').click();true`);
 await delay(5500);await ev(`if(CivilApp.playing)document.getElementById('playButton').click();true`);
 await check('the actual animation loop advances player time and batches foreign development',`CivilApp.state.elapsed>qaLiveStart&&(CivilApp.state.simulation.runs.foreignDevelopment||0)>qaLiveRuns&&CivilEngine.foreignTiming(CivilApp.state).intervalMs>=1000&&CivilEngine.foreignTiming(CivilApp.state).intervalMs<=5000`);
 await ev(`CivilEngine.tick(CivilApp.state,.3,{deferForeign:true});CivilApp.save(true);true`);const saved=await ev(`({pending:CivilApp.state.simulation.foreignPending,foreign:JSON.stringify(CivilApp.state.neighbors)})`);
 await b.reload();await click('#continueButton');
 await check('save reload preserves queued game time and all country assets stocks and progress',`Math.abs((CivilApp.state.simulation.foreignPending||0)-${saved.pending})<1e-8&&JSON.stringify(CivilApp.state.neighbors)===${JSON.stringify(saved.foreign)}`);
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');
 await writeFile('artifacts/v52-browser-results.json',JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2)+'\n');console.log(`${checks.length} shared foreign rules browser checks passed.`);
}finally{await b.viewport(1440,900);await reset(backup);b.close();}
