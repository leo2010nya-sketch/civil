import assert from 'node:assert/strict';
import {connectPage} from './browser-check.mjs';

const b=await connectPage(),ev=source=>b.evaluate(source);
const backup=await ev('localStorage.getItem("civil.saves.v2")');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[];
async function click(selector){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Unavailable '+${JSON.stringify(selector)});e.click();return true})()`);}
async function check(name,source){assert.equal(await ev(source),true,name);checks.push(name);}
async function clear(){await ev(`(()=>{for(let i=0;i<30&&document.getElementById('ackEvent');i++)document.getElementById('ackEvent').click();return true})()`);}
async function map(x,y){const p=await ev(`CivilApp.world.worldToScreen(${x},${y})`);await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await delay(140);}
async function reset(value){await b.send('Page.navigate',{url:'about:blank'});await delay(100);await b.send('Page.navigate',{url:b.config.url});for(let i=0;i<80;i++){await delay(100);try{if(await ev('typeof CivilApp==="object"'))break;}catch{}}await ev(value===null?'localStorage.removeItem("civil.saves.v2");true':`localStorage.setItem("civil.saves.v2",${JSON.stringify(value)});true`);await b.reload();}
try{
 await reset(null);await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});await b.viewport(1600,1000);
 await click('#newGameButton');
 await check('startup offers village and city modes',`document.querySelectorAll('[data-start-mode]').length===2`);
 await click('[data-start-mode="city"]');
 await check('city mode previews its population and neighbors',`document.getElementById('startFacts').textContent.includes('2–5 座城市')&&document.getElementById('startFacts').textContent.includes('2–5 个邻国')`);
 await b.screenshot('artifacts/v31-01-mode.png');
 await ev(`document.getElementById('worldName').value='溪城';document.getElementById('worldSeed').value='48271';document.getElementById('newGameForm').requestSubmit();true`);await clear();await delay(400);
 await check('city starts with real buildings and two surrounding countries',`CivilApp.state.startMode==='city'&&CivilApp.state.population>=4800&&CivilApp.state.neighbors.length>=2&&CivilApp.state.settlements.length>=2&&CivilApp.state.nobles.influence>0&&CivilApp.state.buildings.every(b=>b.type!=='hut')`);
 await check('inheritance starts with currency and an active fiscal HUD',`CivilEngine.hasCurrency(CivilApp.state)&&!document.querySelector('[data-stat="treasury"]').classList.contains('hidden')&&CivilApp.state.resources.treasury>0`);
 await b.screenshot('artifacts/v31-02-city.png');
 await click('[data-panel="reform"]');await click('#openPublicPlan');
 await check('inheritance fiscal planning exposes established taxation',`document.getElementById('budget-construction')&&document.getElementById('tax-poll')&&document.getElementById('detailPanel').textContent.includes('国库')`);
 await click('[data-panel="hostile"]');
 await check('both countries offer real trade and diplomatic actions',`document.querySelectorAll('.nation-card').length===CivilApp.state.neighbors.length&&document.querySelectorAll('[data-foreign="trade"]').length===CivilApp.state.neighbors.length&&document.querySelectorAll('[data-foreign="pact"]').length===CivilApp.state.neighbors.length`);
 await click('[data-foreign="trade"][data-nation="green-country"]');await ev('CivilApp.tick(1);true');
 await check('open route produces actual imports and exports',`CivilApp.state.neighbors[0].tradeLast.imported>0&&CivilApp.state.neighbors[0].tradeLast.exported>0&&CivilApp.state.resources.treasury>0`);
 await click('#diplomaticMap');await delay(700);await b.screenshot('artifacts/v31-02-countries.png');
 const nation=await ev('CivilApp.state.neighbors[0]');await map(nation.x,nation.y);
 await check('clicking a foreign city opens its diplomacy',`!document.getElementById('detailPanel').classList.contains('hidden')&&document.querySelector('.nation-card.selected .nation-name').textContent.includes(CivilApp.state.neighbors[0].name)`);
 const relation=await ev('CivilApp.state.neighbors[1].relation');
 await click('[data-foreign="envoy"][data-nation="stone-country"]');
 await check('envoy changes relations through the government action',`CivilApp.state.neighbors[1].relation>${relation}`);
 await ev(`while(CivilApp.state.neighbors[1].relation<45)CivilEngine.foreignAction(CivilApp.state,'stone-country','envoy');CivilApp.closePanel();CivilApp.openPanel('hostile');true`);await click('[data-foreign="pact"][data-nation="stone-country"]');
 await check('negotiated pact has a real expiry',`CivilApp.state.neighbors[1].pactUntil>CivilApp.state.elapsed+9`);
 await click('[data-foreign="embargo"][data-nation="green-country"]');await ev('CivilApp.tick(.25);true');
 await check('embargo stops a route and changes geopolitics',`CivilApp.state.neighbors[0].embargo&&!CivilApp.state.neighbors[0].tradeOpen&&CivilApp.state.neighbors[0].tradeLast.imported===0`);
 await click('[data-foreign="embargo"][data-nation="green-country"]');await click('[data-foreign="trade"][data-nation="green-country"]');
 await b.screenshot('artifacts/v31-03-diplomacy.png');
 await click('[data-panel="reform"]');
 await check('inherited currency does not ask the player to introduce it again',`!document.getElementById('introduceCurrency')&&CivilEngine.hasCurrency(CivilApp.state)`);
 await b.screenshot('artifacts/v31-04-innovation.png');
 await clear();
 await check('inherited currency enables monetary HUD and fiscal planning',`CivilEngine.hasCurrency(CivilApp.state)&&!document.querySelector('[data-stat="treasury"]').classList.contains('hidden')`);
 await click('[data-stat="treasury"]');await ev(`document.getElementById('tax-poll').value='20';document.getElementById('tax-poll').dispatchEvent(new Event('change'));CivilApp.tick(1);true`);
 await check('taxes only collect after adoption',`CivilApp.state.budget.taxRate===.2&&CivilApp.state.resources.treasury>0`);await clear();
 await click('#exploreButton');await click('#dispatchExploration');await delay(500);
 const frontier=await ev(`(()=>{const s=CivilApp.state;for(let i=0;i<40;i++){const a=-Math.PI/2+i*.1,x=s.settlements[0].x+Math.cos(a)*630,y=s.settlements[0].y+Math.sin(a)*630;if(!CivilEngine.isExplored(s,x,y)&&!CivilTerrain.sample(x,y,s.seed).water)return {x,y};}throw Error('No frontier')})()`);
 const known=await ev('CivilApp.state.explored.length');await map(frontier.x,frontier.y);
 await check('map click dispatches a timed expedition without immediate reveal',`CivilApp.state.expeditions.length===1&&CivilApp.state.explored.length===${known}&&!CivilEngine.isExplored(CivilApp.state,${frontier.x},${frontier.y})`);
 await ev('CivilApp.tick(1);true');await clear();
 await check('exploration queue and map show progress while land remains unknown',`CivilApp.state.expeditions[0].progress>0&&CivilApp.state.expeditions[0].progress<100&&document.querySelector('.expedition-card')&&!CivilEngine.isExplored(CivilApp.state,${frontier.x},${frontier.y})`);
 await b.screenshot('artifacts/v31-05-exploration.png');
 await ev('CivilApp.save(true);true');const snapshot=await ev('({id:CivilApp.state.id,expeditions:CivilApp.state.expeditions,currency:CivilApp.state.currency,neighbors:CivilApp.state.neighbors})');
 await b.reload();await click('#continueButton');await delay(350);
 assert.deepEqual(await ev('({id:CivilApp.state.id,expeditions:CivilApp.state.expeditions,currency:CivilApp.state.currency,neighbors:CivilApp.state.neighbors})'),snapshot);checks.push('save reload retains currency diplomacy and expedition progress');
 await ev('CivilApp.tick(10);true');await clear();
 await check('arrival reveals the destination and removes the active mission',`CivilApp.state.expeditions.length===0&&CivilEngine.isExplored(CivilApp.state,${frontier.x},${frontier.y})`);
 await b.viewport(390,844);await click('[data-panel="hostile"]');await delay(250);
 await check('mobile diplomacy stays within the viewport',`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('detailPanel').getBoundingClientRect().right<=innerWidth&&document.querySelector('.toolbar').getBoundingClientRect().right<=innerWidth`);
 await b.screenshot('artifacts/v31-06-mobile.png');await b.viewport(1600,1000);
 await ev('CivilApp.startNew(48271,"新村","village");true');await clear();await click('[data-panel="reform"]');
 await check('village exposes neither currency innovation nor monetary UI',`CivilApp.state.population===36&&!document.getElementById('introduceCurrency')&&!document.getElementById('detailPanel').textContent.match(/货币|税率|国库|财政/)&&!document.querySelector('#detailPanel use[href="#i-coin"]')`);
 await ev(`CivilApp.state.history.unshift({id:'legacy-money-rule',time:0,title:'旧版货币条款',body:'货币税率与财政',data:{policy:'education'}});CivilApp.openPanel('report');true`);
 await check('legacy monetary policy records do not reveal unavailable content',`!document.getElementById('detailPanel').textContent.includes('旧版货币条款')&&!document.getElementById('detailPanel').textContent.includes('货币税率与财政')&&CivilApp.state.history.some(h=>h.id==='legacy-money-rule')`);
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');
 console.log(JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2));
}finally{await reset(backup);b.close();}
