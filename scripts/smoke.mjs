import assert from 'node:assert/strict';
import {connectPage} from './browser-check.mjs';
const b=await connectPage(),backup=await b.evaluate('localStorage.getItem("civil.saves.v2")');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),ev=x=>b.evaluate(x);
const checks=[];
async function click(selector){await ev(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});b.click();return true})()`);}
async function check(name,expression){assert.equal(await ev(expression),true,name);checks.push(name);}
async function clear(){await ev(`(()=>{for(let i=0;i<30&&document.getElementById('ackEvent');i++)document.getElementById('ackEvent').click();return true})()`);}
async function map(x,y){const p=await ev(`CivilApp.world.worldToScreen(${x},${y})`);await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await delay(100);}
async function reset(value){await b.send('Page.navigate',{url:'about:blank'});await delay(100);await b.send('Page.navigate',{url:b.config.url});for(let i=0;i<80;i++){await delay(100);try{if(await ev('location.href.startsWith("http://127.0.0.1:4173/")&&typeof CivilApp==="object"'))break;}catch{}}await ev(value===null?'localStorage.removeItem("civil.saves.v2");true':`localStorage.setItem("civil.saves.v2",${JSON.stringify(value)});true`);await b.reload();}
try{
 await reset(null);await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});await b.viewport(1600,1000);
 await check('startup with new and existing save entry points',`!document.getElementById('startScreen').classList.contains('hidden')&&!!document.getElementById('loadGameButton')`);
 await b.screenshot('artifacts/v3-01-start.png');
 await click('#newGameButton');await ev(`document.getElementById('worldName').value='河湾';document.getElementById('worldSeed').value='48271';document.getElementById('newGameForm').requestSubmit();true`);await delay(400);
 await check('36-person village begins at year zero',`CivilApp.state.population===36&&CivilApp.state.year===0&&document.getElementById('yearLabel').textContent==='纪元 0 年'`);
 await check('no permanent details or automatic time advancement',`document.getElementById('detailPanel').classList.contains('hidden')&&!CivilApp.playing`);await clear();
 await b.screenshot('artifacts/v3-02-village.png');
 await map(2160,2120);
 await check('building list has no separate placement step',`!document.getElementById('placeProject')&&document.getElementById('detailPanel').textContent.includes('2160, 2120')`);
 await click('[data-project="farm"]');
 await check('one building click starts construction exactly at the selected map location',`CivilApp.state.buildings.some(b=>b.type==='farm'&&Math.abs(b.x-2160)<1&&Math.abs(b.y-2120)<1&&b.status==='building')&&CivilApp.state.resources.wood===78&&CivilApp.world.mode===null`);
 await check('routine start does not create a report popup',`CivilApp.state.events.length===0`);
 await click('[data-panel="policy"]');await click('#newProposal');
 await check('locked policies reveal no names, descriptions or unlock information',`!document.getElementById('detailPanel').textContent.includes('公共教育')&&!document.getElementById('detailPanel').textContent.includes('自动化转型')&&!document.querySelector('[data-clause="education"]')&&!document.getElementById('detailPanel').textContent.includes('需要至少')`);
 await check('available clauses explain concrete drawbacks',`document.querySelectorAll('.policy-drawback').length>=5&&document.querySelector('[data-clause="works"]').textContent.includes('挤占日常生产')`);
 await ev(`document.getElementById('proposalName').value='河湾储粮令';document.getElementById('proposalName').dispatchEvent(new Event('input'));true`);
 await click('[data-region="all"]');await click('[data-region="home"]');await click('[data-target="families"]');await click('[data-clause="reserve"]');await click('[data-clause="forage"]');
 await b.screenshot('artifacts/v3-03-draft.png');
 const policyStart=await ev(`({food:CivilApp.state.resources.food,cost:CivilEngine.draftPolicy(CivilApp.state,{name:'河湾储粮令',clauses:['reserve','forage'],regions:['home'],target:'families',executor:'community',condition:'always',duration:0,preview:true}).cost.food})`);
 await ev(`document.getElementById('proposalForm').requestSubmit();true`);
 await check('named multi-clause proposal stores region, target and execution choices',`CivilApp.state.proposals.length===1&&CivilApp.state.proposals[0].name==='河湾储粮令'&&CivilApp.state.proposals[0].clauses.length===2&&CivilApp.state.proposals[0].target==='families'&&CivilApp.state.proposals[0].regions[0]==='home'&&CivilApp.state.resources.food===${policyStart.food-policyStart.cost}`);
 await ev('CivilApp.tick(4);true');
 await check('policy coverage grows and small projects finish without repeat reports',`CivilApp.state.proposals[0].coverage>50&&CivilApp.state.buildings.find(b=>b.type==='farm').status==='complete'&&!CivilApp.state.history.some(e=>e.title==='开垦农田建成')`);
 await check('hostile faction appears in early village years',`CivilApp.state.hostiles.length===1&&CivilApp.state.history.some(h=>h.data.hostileId==='rival-1')`);await clear();
 await click('[data-edit]');await click('[data-clause="forage"]');await click('[data-duration="5"]');await ev(`document.getElementById('proposalForm').requestSubmit();true`);
 await check('player can revise clauses rather than create a second fixed policy',`CivilApp.state.proposals.length===1&&CivilApp.state.proposals[0].clauses.length===1&&CivilApp.state.proposals[0].duration===5`);
 await ev('CivilApp.tick(6);true');
 await check('term-limited proposal expires',`CivilApp.state.proposals[0].active===false`);await clear();
 await click('[data-panel="hostile"]');const food=await ev('CivilApp.state.resources.food');await click('[data-hostile-action="patrol"]');assert.ok(await ev('CivilApp.state.resources.food')<food);checks.push('hostile patrol consumes resources and grants protection');
 await check('hostile protection is simulated',`CivilApp.state.hostiles[0].guardUntil>CivilApp.state.elapsed`);await b.screenshot('artifacts/v3-04-hostile.png');await click('[data-close="panel"]');
 const tree=await ev(`CivilTerrain.trees(CivilApp.state.seed).find(t=>t.x>2110&&t.y>2170&&Math.hypot(t.x-2048,t.y-2048)<320)`);assert.ok(tree);
 await map(tree.x,tree.y);await click('[data-project="lumber"]');
 await ev('CivilApp.tick(30);true');
 await check('logging depletes forest resources shown by persistent tree IDs',`CivilApp.state.forest.cut>5&&Object.keys(CivilApp.state.forest.removed).every(id=>CivilApp.world.trees.some(t=>t.id===id))`);await clear();
 await b.screenshot('artifacts/v3-05-logging.png');
 await click('[data-panel="report"]');
 await check('reports retain real curves and offer contextual policy drafting',`document.querySelectorAll('.report-chart polyline').length===1&&!!document.getElementById('reportProposal')`);await click('#reportProposal');
 await check('reports open the same proposal editor',`!!document.getElementById('proposalForm')`);await click('#cancelDraft');await click('[data-close="panel"]');
 await ev(`CivilApp.state.population=100;CivilApp.state.settlements[0].population=100;CivilApp.state.knowledge=20;CivilApp.state.resources={food:500,wood:500,stone:500,treasury:500};CivilApp.state.buildings.push({id:'qa-council',type:'council',x:2200,y:1980,size:1,status:'complete',settlementId:'home'},{id:'qa-workshop',type:'workshop',x:2250,y:2020,size:1,status:'complete',settlementId:'home'});CivilApp.tick(0);true`);await clear();
 await click('[data-panel="automation"]');await click('[data-auto="enabled"]');await ev('CivilApp.tick(4);true');
 await check('automation controls commission real affordable projects',`CivilApp.state.automation.enabled&&CivilApp.state.automation.projects>0&&CivilApp.state.buildings.some(b=>b.automatic)`);await b.screenshot('artifacts/v3-06-automation.png');await clear();
 await click('[data-panel="reform"]');await click('#openPublicPlan');await ev(`document.getElementById('budget-construction').value='70';document.getElementById('budget-construction').dispatchEvent(new Event('change'));true`);
 await check('budget reallocation remains normalized',`CivilApp.state.budget.construction===70&&Math.abs(CivilApp.state.budget.construction+CivilApp.state.budget.welfare+CivilApp.state.budget.knowledge-100)<.001`);await click('[data-close="panel"]');
 await click('[data-speed="12"]');const beforeTime=await ev('CivilApp.state.elapsed');await click('#playButton');await delay(600);await click('#playButton');assert.ok(await ev('CivilApp.state.elapsed')>beforeTime);checks.push('continuous play, pause and speed controls work');await clear();
 await ev('CivilApp.save(true);true');const before=await ev(`({id:CivilApp.state.id,year:CivilApp.state.year,proposals:CivilApp.state.proposals,forest:CivilApp.state.forest,automation:CivilApp.state.automation,hostiles:CivilApp.state.hostiles})`);
 await b.reload();await click('#continueButton');await delay(350);const after=await ev(`({id:CivilApp.state.id,year:CivilApp.state.year,proposals:CivilApp.state.proposals,forest:CivilApp.state.forest,automation:CivilApp.state.automation,hostiles:CivilApp.state.hostiles})`);assert.deepEqual(after,before);checks.push('reload restores new policy, forest, automation and hostile state');
 await click('#menuButton');await click('#returnStart');await click('#newGameButton');await ev(`document.getElementById('worldName').value='松原';document.getElementById('worldSeed').value='0';document.getElementById('newGameForm').requestSubmit();true`);
 await check('another save and seed zero begin independently from year zero',`CivilApp.state.year===0&&CivilApp.state.population===36&&CivilApp.world.seed===0&&CivilApp.saves.length===2`);
 await click('#menuButton');await click('#showSaves');await click(`[data-load="${before.id}"]`);await clear();
 await check('archive loads selected world',`CivilApp.state.id===${JSON.stringify(before.id)}`);
 await b.viewport(390,844);await click('[data-panel="policy"]');await click('#newProposal');await delay(200);
 await check('mobile proposal and seven toolbar entries remain on screen',`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('detailPanel').getBoundingClientRect().left>=0&&document.getElementById('detailPanel').getBoundingClientRect().bottom<innerHeight-90&&document.querySelector('.toolbar').getBoundingClientRect().right<=innerWidth`);await b.screenshot('artifacts/v3-07-mobile-policy.png');
 await click('#cancelDraft');await click('[data-close="panel"]');await b.screenshot('artifacts/v3-08-mobile-map.png');await b.viewport(1600,1000);
 assert.equal(b.errors.filter(e=>e.exception||e.text?.includes('Uncaught')).length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');
 console.log(JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2));
}finally{await reset(backup);b.close();}
