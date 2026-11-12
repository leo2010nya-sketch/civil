import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import{connectPage}from'./browser-check.mjs';
const b=await connectPage({timeout:60000}),ev=b.evaluate,delay=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const backup=await ev('localStorage.getItem("civil.saves.v2")');
async function click(sel){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Unavailable '+${JSON.stringify(sel)});e.click();return true})()`);}
async function check(name,src){assert.ok(await ev(src),name);checks.push(name);console.log('✓ '+name);}
async function clear(){await ev('CivilApp.state.events=[];CivilApp.tick(0);true');}
async function reset(value){await b.send('Page.navigate',{url:'about:blank'});await delay(100);await b.send('Page.navigate',{url:b.config.url});for(let i=0;i<100;i++){await delay(100);try{if(await ev('typeof CivilApp==="object"'))break;}catch{}}await ev(value===null?'localStorage.removeItem("civil.saves.v2");true':`localStorage.setItem("civil.saves.v2",${JSON.stringify(value)});true`);await b.reload();}
async function map(x,y){await ev(`CivilApp.closePanel();CivilApp.world.centerOn(${x},${y});CivilApp.world.setZoom(.85);true`);for(let i=0;i<100;i++){await delay(60);if(await ev('Math.hypot(CivilApp.world._view.x-CivilApp.world.target.x,CivilApp.world._view.y-CivilApp.world.target.y)<1&&Math.abs(CivilApp.world._view.zoom-CivilApp.world.target.zoom)<.001'))break;}const p=await ev(`CivilApp.world.worldToScreen(${x},${y})`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});}
try{
 await reset(null);await b.viewport(1440,900);await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await click('#newGameButton');await click('[data-start-mode="city"]');
 await check('inheritance preview describes variable city and country counts',`document.getElementById('startFacts').textContent.includes('2–5 座城市')&&document.getElementById('startFacts').textContent.includes('2–5 个邻国')`);
 await ev(`document.getElementById('worldSeed').value='0';document.getElementById('newGameForm').requestSubmit();true`);await clear();
 await check('new inheritance has currency tax municipal coverage and capital-centered camera',`(()=>{const s=CivilApp.state,w=CivilApp.world;return s.currency.adopted&&s.taxation.rates.poll>0&&s.proposals.some(p=>p.inherited&&p.coverage===100)&&w.target.x===s.settlements[0].x&&w.target.y===s.settlements[0].y})()`);
 await ev('CivilApp.world.centerOn(2048,2048);CivilApp.world.setZoom(.25);true');await delay(600);await b.screenshot('artifacts/v44-01-inheritance-map.png');
 await check('foreign satellite cities have actual map sprites and labels',`(()=>{const w=CivilApp.world,s=CivilApp.state;return w.nationCities().length===s.neighbors.reduce((n,c)=>n+c.cities.length,0)&&w.nationBuildings().some(b=>b.nationId===s.neighbors[0].id)})()`);
 const n=await ev('CivilApp.state.neighbors.find(n=>n.cities.length>1)'),sat=n.cities[1];await map(sat.x,sat.y);
 await check('clicking a satellite selects its owning country',`CivilApp.world.selected.nationId===${JSON.stringify(n.id)}&&CivilApp.world.selected.cityId===${JSON.stringify(sat.id)}&&document.querySelector('.nation-card.selected').textContent.includes(${JSON.stringify(n.name)})`);
 await check('diplomacy displays the number of foreign cities',`document.querySelector('.nation-card.selected').textContent.includes('${n.cities.length} 座城镇')`);
 await ev(`CivilApp.openPanel('population');true`);
 await check('each city shows housing and its own population growth limit',`[...document.querySelectorAll('[data-center]')].every(b=>b.textContent.includes('居住承载')&&b.textContent.includes('增长上限'))`);
 await ev(`CivilApp.openPanel('automation');true`);
 await check('automation exposes storage civic industry commerce and defense controls',`['storage','civic','production','commerce','defense'].every(k=>document.querySelector('[data-auto="'+k+'"]'))`);
 await check('automation panel shows a local prioritized plan instead of only basic buildings',`document.querySelectorAll('.automation-plan').length>0&&[...document.querySelectorAll('.automation-plan')].some(p=>p.textContent.match(/银行|税务|工具|药|织造|铁矿|配套/))`);
 await click('[data-auto="enabled"]');await check('automation can be enabled through a visible control','CivilApp.state.automation.enabled');await b.screenshot('artifacts/v44-02-automation.png');
 await ev('CivilApp.tick(1);true');await clear();await ev(`CivilApp.openPanel('automation');true`);
 await check('automation starts a real planned project and retains its reason',`CivilApp.state.automation.projects>0&&CivilApp.state.buildings.some(b=>b.automatic&&b.planReason&&b.planZone)&&document.getElementById('detailPanel').textContent.includes('近期委托')`);
 // Drive an actual shortage through the engine; keep a normal report queued to test preemption.
 await ev(`CivilApp.startNew(48271,'预警试验');CivilApp.state.events=[{id:'secondary-test',kind:'report',title:'普通消息',body:'次要报告',time:0,data:{}}];CivilApp.tick(0);true`);
 await check('secondary announcement stays in the corner without a screen backdrop',`!document.getElementById('eventPopup').classList.contains('important')&&document.getElementById('importantEventBackdrop').classList.contains('hidden')&&document.getElementById('eventPopup').getBoundingClientRect().left>innerWidth/2`);
 await click('#playButton');
 await ev(`(()=>{const s=CivilApp.state;s.hostileAt=1e9;s.population=s.settlements[0].population=500;s.resources.food=10;CivilEngine.resourceWarnings(s);CivilApp.tick(0);return true})()`);
 await delay(350);await check('an important resource warning preempts the report and appears at screen center',`(()=>{const e=document.getElementById('eventPopup'),r=e.getBoundingClientRect();return e.classList.contains('important')&&e.getAttribute('role')==='alertdialog'&&e.textContent.includes('粮食即将耗尽')&&Math.abs(r.x+r.width/2-innerWidth/2)<2&&Math.abs(r.y+r.height/2-innerHeight/2)<2&&!document.getElementById('importantEventBackdrop').classList.contains('hidden')&&CivilApp.state.events.some(e=>e.id==='secondary-test')})()`);
 await check('important warning focuses its acknowledgement button',`document.activeElement.id==='ackEvent'`);
 await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await check('keyboard focus stays inside the important announcement',`document.getElementById('eventPopup').contains(document.activeElement)`);
 const before=await ev('CivilApp.state.elapsed');await delay(700);assert.equal(await ev('CivilApp.state.elapsed'),before);checks.push('important announcements pause simulated time while preserving play preference');
 await b.screenshot('artifacts/v44-03-resource-warning.png');
 await ev('CivilApp.save(true);true');await b.reload();await click('#continueButton');
 await check('pending important warning and shortage suppression survive reload',`document.getElementById('eventPopup').classList.contains('important')&&CivilApp.state.resourceAlerts.food.active&&CivilApp.state.events.some(e=>e.id==='secondary-test')`);
 await click('#eventResources');await check('warning opens the relevant warehouse and restores the queued corner report',`document.getElementById('detailPanel').textContent.includes('仓')&&!document.getElementById('eventPopup').classList.contains('important')&&document.getElementById('eventPopup').textContent.includes('普通消息')&&document.getElementById('importantEventBackdrop').classList.contains('hidden')`);
 await ev(`CivilEngine.resourceWarnings(CivilApp.state);CivilApp.tick(0);true`);await check('the same shortage does not repeatedly reopen the warning',`!document.getElementById('eventPopup').classList.contains('important')`);
 await click('#ackEvent');await ev('CivilApp.state.resources.food=10000;CivilApp.tick(0);true');await click('#playButton');const resumed=await ev('CivilApp.state.elapsed');await delay(500);assert.ok(await ev('CivilApp.state.elapsed')>resumed);checks.push('time resumes after acknowledgement when play is selected');await click('#playButton');
 await b.viewport(390,844);await ev(`CivilApp.state.elapsed+=25;CivilApp.state.year+=25;CivilEngine.resourceWarnings(CivilApp.state);CivilApp.state.resources.food=5;CivilEngine.resourceWarnings(CivilApp.state);CivilApp.tick(0);true`);
 await delay(350);await check('mobile important warning and controls fit the viewport',`(()=>{const r=document.getElementById('eventPopup').getBoundingClientRect(),b=document.getElementById('ackEvent').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&b.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth})()`);
 await b.screenshot('artifacts/v44-04-mobile-warning.png');await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await check('Escape acknowledges an important announcement and removes its backdrop',`document.getElementById('importantEventBackdrop').classList.contains('hidden')`);
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');
 await writeFile('artifacts/v44-browser-results.json',JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2));
}finally{await b.viewport(1440,900);await reset(backup);b.close();}
