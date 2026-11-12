import assert from 'node:assert/strict';
import {connectPage} from './browser-check.mjs';

// Uses an isolated browser. Later-era checks use explicit development fixtures,
// while construction, reform and policy controls are exercised through the UI.
const b=await connectPage({timeout:60000}),ev=source=>b.evaluate(source);
const backup=await ev('localStorage.getItem("civil.saves.v2")');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[];
const newBuildings=['palisade','watchtower','wall','windmill','watermill','warehouse','townhouse','apartment','clinic','academy','machineworks','publicschool','railstation','steamplant','estate'];
async function click(selector){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Unavailable '+${JSON.stringify(selector)});e.click();return true})()`);}
async function check(name,source){assert.equal(await ev(`!!(${source})`),true,name);checks.push(name);}
async function clear(){await ev(`(()=>{for(let i=0;i<40&&document.getElementById('ackEvent');i++)document.getElementById('ackEvent').click();return true})()`);}
async function panel(name){await ev(`CivilApp.closePanel();CivilApp.openPanel(${JSON.stringify(name)});true`);}
async function map(x,y){for(let i=0;i<120;i++){await delay(60);if(await ev('Math.hypot(CivilApp.world._view.x-CivilApp.world.target.x,CivilApp.world._view.y-CivilApp.world.target.y)<.01&&Math.abs(CivilApp.world._view.zoom-CivilApp.world.target.zoom)<.00001'))break;}const p=await ev(`CivilApp.world.worldToScreen(${x},${y})`);await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await delay(150);}
async function change(selector,value){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change'));return true})()`);}
async function reset(value){await b.send('Page.navigate',{url:'about:blank'});await delay(100);await b.send('Page.navigate',{url:b.config.url});for(let i=0;i<80;i++){await delay(100);try{if(await ev('typeof CivilApp==="object"'))break;}catch{}}await ev(value===null?'localStorage.removeItem("civil.saves.v2");true':`localStorage.setItem("civil.saves.v2",${JSON.stringify(value)});true`);await b.reload();}
async function freePlot(type){return ev(`(()=>{const s=CivilApp.state,d=CivilEngine.buildings.find(d=>d.id===${JSON.stringify(type)});for(let i=0;i<300;i++){const a=i*2.399963,r=280+Math.floor(i/18)*10,x=s.settlements[0].x+Math.cos(a)*r,y=s.settlements[0].y+Math.sin(a)*r;if(CivilTerrain.sample(x,y,s.seed).water||!CivilEngine.isExplored(s,x,y))continue;if(s.buildings.some(b=>b.status!=='failed'&&Math.hypot(b.x-x,b.y-y)<((d.footprint||20)+(CivilEngine.buildings.find(d=>d.id===b.type)?.footprint||12))*.55))continue;return{x,y};}throw Error('No free plot')})()`);}
async function startBuild(type){await ev('CivilApp.closePanel();CivilApp.world.centerOn();CivilApp.world.setZoom(.9);true');await delay(450);const p=await freePlot(type);await map(p.x,p.y);await click(`[data-project="${type}"]`);return p;}
try{
 await reset(null);await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});await b.viewport(1600,1000);
 await ev('CivilApp.startNew(48271,"风城","city");CivilApp.state.resources.food=6000;CivilApp.state.resources.wood=6000;CivilApp.state.resources.stone=6000;true');await clear();await panel('build');
 await check('city catalog groups current housing, production, civic and defense options',`document.querySelectorAll('.building-group').length>=4&&document.querySelector('[data-project="windmill"]')&&document.querySelector('[data-project="wall"]')&&document.querySelector('[data-project="townhouse"]')`);
 await check('industrial buildings and public education are absent from the early catalog',`!document.querySelector('[data-project="factory"]')&&!document.querySelector('[data-project="publicschool"]')&&!document.getElementById('detailPanel').textContent.includes('公共教育')`);
 const windmill=await startBuild('windmill');
 await check('clicking land then windmill starts that actual building at the clicked position',`CivilApp.state.buildings.some(b=>b.type==='windmill'&&b.status==='building'&&Math.hypot(b.x-${windmill.x},b.y-${windmill.y})<1)&&CivilApp.world.mode===null`);
 const palisade=await startBuild('palisade');
 await check('defensive construction uses the same direct placement flow',`CivilApp.state.buildings.some(b=>b.type==='palisade'&&b.status==='building'&&Math.hypot(b.x-${palisade.x},b.y-${palisade.y})<1)`);
 await clear();await panel('build');await b.screenshot('artifacts/v32-01-building-catalog.png');

 // A deliberately split population verifies that national totals cannot open
 // the single-city industrial gate, even with abundant currency and knowledge.
 await ev(`(()=>{const s=CivilApp.state;CivilEngine.introduceCurrency(s);s.resources={food:200000,wood:200000,stone:200000,treasury:200000};s.institutions.governance='council';s.population=12000;s.settlements=s.settlements.slice(0,1);s.settlements[0].population=6000;s.settlements.push({id:'second',name:'南城',x:2600,y:2500,population:6000,level:3});s.knowledge=800;s.admin=80;s.neighbors=[];s.hostileAt=1e9;for(const [i,type] of ['forge','library','warehouse','academy','bridge','watermill','machineworks'].entries())s.buildings.push({id:'prepared-'+type,type,x:2280+i*40,y:2300,size:1,status:'complete',progress:100,settlementId:'home'});for(let i=0;i<12;i++)s.buildings.push({id:'prepared-housing-'+i,type:'apartment',x:2320+i%4*48,y:2240+Math.floor(i/4)*47,size:3,status:'complete',progress:100,settlementId:'home'});for(let i=0;i<6;i++)s.buildings.push({id:'prepared-agriculture-'+i,type:'estate',x:2130+i%3*140,y:2380+Math.floor(i/3)*145,size:3,status:'complete',progress:100,settlementId:'home'});return true})()`);
 await panel('build');
 await check('national population above ten thousand does not unlock a factory in smaller cities',`CivilEngine.largestCityPopulation(CivilApp.state)===6000&&!document.querySelector('[data-project="factory"]')&&!document.querySelector('[data-project="publicschool"]')`);
 await panel('policy');await click('#newProposal');
 await check('high knowledge cannot expose industrial or public education clauses before the city gate',`!document.querySelector('[data-clause="industry"]')&&!document.querySelector('[data-clause="education"]')&&!document.getElementById('detailPanel').textContent.includes('公共教育')`);await click('#cancelDraft');
 await ev(`CivilApp.state.history.unshift({id:'legacy-education-note',time:0,title:'旧版公共教育记录',body:'旧版全民教育制度',data:{policy:'education'}});true`);await panel('report');
 await check('preindustrial saves hide legacy public education records even after currency adoption',`CivilEngine.hasCurrency(CivilApp.state)&&!document.getElementById('detailPanel').textContent.includes('旧版公共教育记录')&&!document.getElementById('detailPanel').textContent.includes('旧版全民教育制度')&&CivilApp.state.history.some(e=>e.id==='legacy-education-note')`);
 await ev('CivilApp.state.settlements[0].population=10000;CivilApp.state.settlements[1].population=2000;true');await panel('build');
 await check('a qualifying individual city opens factories but public schools remain hidden',`!!document.querySelector('[data-project="factory"]')&&!document.querySelector('[data-project="publicschool"]')&&!CivilEngine.isIndustrialized(CivilApp.state)`);
 await startBuild('factory');
 await ev(`(()=>{const f=CivilApp.state.buildings.find(b=>b.type==='factory'&&b.status==='building');f.progress=99.99;f.signalIssued=true;CivilApp.state.rngState=1;CivilApp.tick(.25);return true})()`);await clear();await panel('build');
 await check('completing the actual factory establishes industry and opens public school construction',`CivilEngine.isIndustrialized(CivilApp.state)&&CivilApp.state.stage==='工业社会'&&!!document.querySelector('[data-project="publicschool"]')`);
 await panel('policy');await click('#newProposal');
 await check('public education still requires its own completed school infrastructure',`!document.querySelector('[data-clause="education"]')`);await click('#cancelDraft');
 await startBuild('publicschool');
 await ev(`(()=>{const f=CivilApp.state.buildings.find(b=>b.type==='publicschool'&&b.status==='building');f.progress=99.99;f.signalIssued=true;CivilApp.state.rngState=1;CivilApp.tick(.25);return true})()`);await clear();await panel('policy');await click('#newProposal');
 await check('industrial public education appears with its concrete drawbacks after the prerequisites complete',`!!document.querySelector('[data-clause="education"]')&&document.querySelector('[data-clause="education"] .policy-drawback').textContent.length>10`);
 await click('[data-clause="forage"]');
 const smallPolicy=await ev('CivilEngine.draftPolicy(CivilApp.state,{name:"规则",clauses:["forage"],regions:["all"],target:"all",executor:"community",condition:"always",duration:0,preview:true}).resistance');
 await click('[data-clause="forage"]');await click('[data-clause="education"]');
 await check('policy preview exposes the stronger resistance and implementation time of major changes',`document.getElementById('proposalEstimate').textContent.includes('政治阻力')&&document.getElementById('proposalEstimate').textContent.includes('推行约')&&CivilEngine.draftPolicy(CivilApp.state,{name:'规则',clauses:['education'],regions:['all'],target:'all',executor:'community',condition:'always',duration:0,preview:true}).resistance>${smallPolicy}`);
 await b.screenshot('artifacts/v32-02-policy-resistance.png');await click('#cancelDraft');

 await panel('reform');await change('#reform-governance','administration');
 const smallReform=await ev('CivilEngine.reformPreview(CivilApp.state,"governance","administration")');
 await change('#reform-governance','representative');
 await check('institution preview increases resistance and duration for a larger reform',`CivilEngine.reformPreview(CivilApp.state,'governance','representative').resistance>${smallReform.resistance}&&CivilEngine.reformPreview(CivilApp.state,'governance','representative').years>${smallReform.years}&&document.querySelector('[data-reform-preview="governance"]').textContent.includes('政治阻力')`);
 await click('[data-reform="governance"]');await clear();
 await check('reform starts as a visible process without instantly replacing the institution',`CivilApp.state.institutions.governance==='council'&&CivilApp.state.reformProcess?.choice==='representative'&&!!document.getElementById('activeReform')&&document.querySelector('[data-reform="property"]').disabled`);
 await b.screenshot('artifacts/v32-03-reform.png');
 await ev('CivilApp.tick(1);CivilApp.save(true);true');const pending=await ev('CivilApp.state.reformProcess');
 await b.reload();await click('#continueButton');await clear();await panel('reform');
 assert.deepEqual(await ev('CivilApp.state.reformProcess'),pending);checks.push('save reload preserves the pending reform and its resistance');
 await ev(`CivilApp.tick(${pending.years+1});true`);await clear();
 await check('the new institution takes effect after implementation completes',`CivilApp.state.institutions.governance==='representative'&&!CivilApp.state.reformProcess&&!document.getElementById('activeReform')`);
 await b.viewport(390,844);await panel('build');await delay(250);
 await check('mobile building groups stay within the viewport',`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('detailPanel').getBoundingClientRect().left>=0&&document.getElementById('detailPanel').getBoundingClientRect().right<=innerWidth&&document.querySelectorAll('.building-group').length>=4&&document.querySelector('.toolbar').getBoundingClientRect().bottom<document.getElementById('detailPanel').getBoundingClientRect().top`);await b.screenshot('artifacts/v32-04-mobile-buildings.png');
 await panel('policy');await click('#newProposal');await click('[data-clause="education"]');await delay(150);
 await check('mobile policy resistance and controls remain accessible in the scrollable panel',`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('proposalEstimate').textContent.includes('政治阻力')&&document.getElementById('detailPanel').scrollHeight>document.getElementById('detailPanel').clientHeight`);await b.screenshot('artifacts/v32-05-mobile-policy.png');await b.viewport(1600,1000);

 // Compare output from the actual game renderer, not mocked icons. The atlas
 // below is only a QA artifact and is removed when this isolated page resets.
 const visual=await ev(`(()=>{const ids=${JSON.stringify(newBuildings)},w=CivilApp.world;function sample(type,time){const canvas=document.createElement('canvas');canvas.width=220;canvas.height=180;const c=canvas.getContext('2d');w.drawBuilding(c,{type,x:110,y:105,size:1,status:'complete',progress:100},time);const bytes=c.getImageData(0,0,220,180).data;let hash=2166136261,pixels=0;for(let i=0;i<bytes.length;i++){hash=Math.imul(hash^bytes[i],16777619)>>>0;if(i%4===3&&bytes[i])pixels++;}return{hash,pixels};}const sprites=ids.map(type=>sample(type,0));return{distinct:new Set(sprites.map(s=>s.hash)).size,nonempty:sprites.every(s=>s.pixels>80),windmillAnimated:sample('windmill',0).hash!==sample('windmill',2100).hash,watermillAnimated:sample('watermill',0).hash!==sample('watermill',2100).hash}})()`);
 assert.equal(visual.distinct,newBuildings.length);assert.ok(visual.nonempty);assert.ok(visual.windmillAnimated);assert.ok(visual.watermillAnimated);checks.push('fifteen buildings have distinct nonempty game sprites and both mills animate');
 await ev(`(()=>{const ids=${JSON.stringify(newBuildings)},overlay=document.createElement('section');overlay.id='qa-building-atlas';Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:10000,background:'#14241e',display:'grid',placeItems:'center'});const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=900;canvas.style='width:min(1500px,100vw);height:auto;';overlay.appendChild(canvas);document.body.appendChild(overlay);const c=canvas.getContext('2d');c.fillStyle='#14241e';c.fillRect(0,0,1500,900);c.font='24px serif';c.fillStyle='#d5d6b9';c.fillText('世脉 · 建筑绘制检查',48,55);c.font='13px sans-serif';c.fillStyle='#aeb79b';c.fillText('实际游戏 canvas 绘制 · 受控视觉检查',48,82);for(let i=0;i<ids.length;i++){const type=ids[i],d=CivilEngine.buildings.find(d=>d.id===type),x=150+i%5*300,y=215+Math.floor(i/5)*250;c.fillStyle='#21352a';c.beginPath();c.ellipse(x,y+24,110,54,-.08,0,Math.PI*2);c.fill();c.save();c.translate(x,y);c.scale(1.7,1.7);CivilApp.world.drawBuilding(c,{type,x:0,y:0,size:1,status:'complete',progress:100},2100);c.restore();c.textAlign='center';c.fillStyle='#cbd0b2';c.font='18px serif';c.fillText(d.name,x,y+102);}return true})()`);
 await b.screenshot('artifacts/v32-buildings.png');await ev('document.getElementById("qa-building-atlas").remove();true');
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');
 console.log(JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2));
}finally{await reset(backup);b.close();}
