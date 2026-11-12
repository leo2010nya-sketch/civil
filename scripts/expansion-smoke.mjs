import assert from 'node:assert/strict';
import {connectPage} from './browser-check.mjs';
const b=await connectPage({timeout:60000}),ev=b.evaluate,delay=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const backup=await ev('localStorage.getItem("civil.saves.v2")');
async function click(selector){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Unavailable '+${JSON.stringify(selector)});e.click();return true})()`);}
async function check(name,source){assert.ok(await ev(source),name);checks.push(name);}
async function clear(){await ev(`(()=>{for(let i=0;i<40&&document.getElementById('ackEvent');i++)document.getElementById('ackEvent').click();return true})()`);}
async function reset(value){await b.send('Page.navigate',{url:'about:blank'});await delay(100);await b.send('Page.navigate',{url:b.config.url});for(let i=0;i<80;i++){await delay(100);try{if(await ev('typeof CivilApp==="object"'))break;}catch{}}await ev(value===null?'localStorage.removeItem("civil.saves.v2");true':`localStorage.setItem("civil.saves.v2",${JSON.stringify(value)});true`);await b.reload();}
async function map(x,y){await ev(`CivilApp.closePanel();CivilApp.world.centerOn(${x},${y});CivilApp.world.setZoom(1.25);true`);await delay(350);for(let i=0;i<120;i++){await delay(60);if(await ev('Math.hypot(CivilApp.world._view.x-CivilApp.world.target.x,CivilApp.world._view.y-CivilApp.world.target.y)<.01&&Math.abs(CivilApp.world._view.zoom-CivilApp.world.target.zoom)<.00001'))break;}const p=await ev(`CivilApp.world.worldToScreen(${x},${y})`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await delay(100);}
try{
 await reset(null);await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});await b.viewport(1440,900);
 await click('#newGameButton');
 await check('new game calls the two modes 开拓 and 继承',`document.querySelector('[data-start-mode="village"] strong').textContent==='开拓'&&document.querySelector('[data-start-mode="city"] strong').textContent==='继承'`);
 await b.screenshot('artifacts/v41-00-modes.png');
 await click('[data-start-mode="city"]');await ev(`document.getElementById('worldSeed').value='48271';document.getElementById('newGameForm').requestSubmit();true`);await clear();await ev(`CivilApp.state.buildings=CivilApp.state.buildings.filter(b=>b.type!=='bank');CivilApp.state.knowledge=125;CivilApp.state.buildings.push({id:'bank-prerequisite',type:'guildhall',status:'complete',size:1,x:CivilApp.state.settlements[0].x+20,y:CivilApp.state.settlements[0].y,settlementId:'home'});true`);
 await check('speed controls offer exactly 1x, 5x and 12x',`JSON.stringify([...document.querySelectorAll('[data-speed]')].map(b=>+b.dataset.speed))==='[1,5,12]'`);
 for(const speed of [1,5,12]){
  await click(`[data-speed="${speed}"]`);const start=await ev('({year:CivilApp.state.elapsed,time:performance.now()})');await click('#playButton');await delay(1000);await click('#playButton');const end=await ev('({year:CivilApp.state.elapsed,time:performance.now()})');
  const ratio=(end.year-start.year)/((end.time-start.time)/1000*100/3600*speed);assert.ok(ratio>.65&&ratio<1.3,`${speed}x actual time ratio ${ratio}`);
 }
 checks.push('all three speeds advance continuous time at the selected multiplier');await clear();
 await click('[data-panel="policy"]');await click('#newProposal');
 await check('early inheritance policy list expands without exposing future industry',`document.querySelectorAll('[data-clause]').length>=15&&document.querySelector('[data-clause="landregister"]')&&!document.querySelector('[data-clause="workhours"]')&&!document.querySelector('[data-clause="credit"]')`);
 for(const id of ['forage','reserve','rationing','firewatch','watercare','landregister'])await click(`[data-clause="${id}"]`);
 await ev(`document.getElementById('proposalName').value='六条治理安排';document.getElementById('proposalForm').requestSubmit();true`);
 await check('six-clause proposal submits through the real editor',`CivilApp.state.proposals.some(p=>p.name==='六条治理安排'&&p.clauses.length===6)`);await clear();
 await check('inheritance carries currency from the outset',`CivilEngine.hasCurrency(CivilApp.state)`);await ev(`CivilApp.state.resources.treasury=1000;CivilApp.openPanel('build');true`);
 await check('bank mint and postal buildings open at suitable stages',`document.querySelector('[data-project="bank"]')&&document.querySelector('[data-project="mint"]')&&document.querySelector('[data-project="postoffice"]')&&!document.querySelector('[data-project="exchange"]')`);
 const plot=await ev(`(()=>{const s=CivilApp.state,d=CivilEngine.buildings.find(d=>d.id==='bank');for(let i=0;i<600;i++){const a=i*2.399963,r=320+Math.floor(i/20)*6,x=s.settlements[0].x+Math.cos(a)*r,y=s.settlements[0].y+Math.sin(a)*r;if(CivilTerrain.sample(x,y,s.seed).water||!CivilEngine.isExplored(s,x,y)||CivilEngine.foreignOwner(s,x,y))continue;if(s.buildings.some(b=>b.status!=='failed'&&Math.hypot(x-b.x,y-b.y)<(d.footprint+(CivilEngine.buildings.find(d=>d.id===b.type)?.footprint||12))*.5))continue;return{x,y};}throw Error('no bank plot')})()`);
 await map(plot.x,plot.y);const funds=await ev('CivilApp.state.resources.treasury');await click('[data-project="bank"]');
 await check('bank is built at the clicked land and charges actual construction resources',`CivilApp.state.buildings.some(b=>b.type==='bank'&&b.status==='building'&&Math.hypot(b.x-${plot.x},b.y-${plot.y})<1)&&CivilApp.state.resources.treasury<${funds}`);
 await ev(`(()=>{const f=CivilApp.state.buildings.find(b=>b.type==='bank');f.progress=99.99;f.signalIssued=true;CivilApp.state.rngState=1;CivilApp.tick(.25);return true})()`);await clear();await ev(`CivilApp.closePanel();CivilApp.openPanel('policy');true`);await click('#newProposal');
 await check('completed banking infrastructure opens finance policy with drawbacks',`document.querySelector('[data-clause="credit"] .policy-drawback')?.textContent.includes('财政支出')`);await click('#cancelDraft');
 const spot=await ev(`(()=>{const s=CivilApp.state;for(let i=0;i<150;i++){const a=i*.17,x=s.settlements[0].x+Math.cos(a)*420,y=s.settlements[0].y+Math.sin(a)*420;if(CivilEngine.settlementPreview(s,x,y,'晨星港').ok)return{x,y};}throw Error('no settlement plot')})()`);
 await map(spot.x,spot.y);
 await check('new settlement action is a visible full-width primary button',`(()=>{const e=document.getElementById('buildSettlement'),r=e.getBoundingClientRect(),s=getComputedStyle(e);return e.classList.contains('primary-button')&&r.width>200&&r.height>=40&&s.backgroundColor!=='rgba(0, 0, 0, 0)'})()`);
 const before=await ev('({resources:structuredClone(CivilApp.state.resources),count:CivilApp.state.settlements.length})');await click('#buildSettlement');
 await check('settlement asks for a name before spending or building',`document.getElementById('settlementNameInput')&&CivilApp.state.settlements.length===${before.count}&&CivilApp.state.resources.food===${before.resources.food}`);
 await b.screenshot('artifacts/v41-01-name-settlement.png');await click('#cancelSettlement');
 await check('canceling settlement naming leaves resources intact',`CivilApp.state.resources.food===${before.resources.food}&&CivilApp.state.settlements.length===${before.count}`);
 await click('#landDetails');
 await check('land details show the same prominent settlement action',`document.getElementById('regionSettle').classList.contains('primary-button')&&document.getElementById('regionSettle').getBoundingClientRect().height>=40`);
 await click('#regionSettle');await ev(`document.getElementById('settlementNameInput').value='晨星港';document.getElementById('settlementForm').requestSubmit();true`);await clear();
 await check('custom settlement name appears in regional population controls',`CivilApp.state.settlements.at(-1).name==='晨星港'&&CivilApp.state.resources.food===${before.resources.food-55}`);
 await ev(`CivilApp.openPanel('population');true`);
 await check('named settlement can be found and centered from the population list',`[...document.querySelectorAll('[data-center]')].some(b=>b.textContent.includes('晨星港'))`);
 const second=await ev(`(()=>{const s=CivilApp.state;for(let i=0;i<150;i++){const a=i*.17,x=s.settlements[0].x+Math.cos(a)*430,y=s.settlements[0].y+Math.sin(a)*430;if(CivilEngine.settlementPreview(s,x,y,'雾港').ok)return{x,y};}throw Error('no second plot')})()`);
 await b.viewport(390,844);await map(second.x,second.y);await click('#buildSettlement');
 await check('mobile naming dialog and primary actions stay inside the viewport',`(()=>{const r=document.getElementById('dialog').getBoundingClientRect(),b=document.getElementById('confirmSettlement').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&b.right<=innerWidth&&b.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()`);
 await b.screenshot('artifacts/v41-02-mobile-settlement.png');await click('#cancelSettlement');await b.viewport(1440,900);
 await ev('CivilApp.save(true);true');await b.reload();await click('#continueButton');await clear();
 await check('save reload preserves named settlements expanded policies banking and 12x speed',`CivilApp.state.settlements.at(-1).name==='晨星港'&&CivilApp.state.proposals.find(p=>p.name==='六条治理安排').clauses.length===6&&CivilApp.state.buildings.some(b=>b.type==='bank'&&b.status==='complete')&&CivilApp.speed===12`);
 await click('[data-panel="hostile"]');
 await check('generated names are used by the actual diplomatic interface',`CivilApp.state.neighbors.every(n=>[...document.querySelectorAll('.nation-name')].some(e=>e.textContent.includes(n.name)))`);
 const visual=await ev(`(()=>{const ids=['bank','mint','exchange','postoffice'],w=CivilApp.world;return ids.map(type=>{const c=document.createElement('canvas');c.width=c.height=180;const ctx=c.getContext('2d');w.drawBuilding(ctx,{type,x:90,y:100,size:1,status:'complete',progress:100},0);const bytes=ctx.getImageData(0,0,180,180).data;let hash=0,pixels=0;for(let i=0;i<bytes.length;i++){hash=Math.imul(hash^bytes[i],16777619)>>>0;if(i%4===3&&bytes[i])pixels++;}return{hash,pixels};})})()`);
 assert.equal(new Set(visual.map(s=>s.hash)).size,4);assert.ok(visual.every(s=>s.pixels>250));checks.push('all four new buildings have distinct nonempty game sprites');
 await ev(`(()=>{const overlay=document.createElement('section');overlay.id='qa-commerce-atlas';overlay.style='position:fixed;inset:0;z-index:9999;background:#17291f;display:grid;place-items:center';const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=420;canvas.style='width:min(1200px,100vw);height:auto';overlay.append(canvas);document.body.append(overlay);const c=canvas.getContext('2d');c.fillStyle='#17291f';c.fillRect(0,0,1200,420);for(const [i,type] of ['bank','mint','exchange','postoffice'].entries()){const x=150+i*300;c.save();c.translate(x,210);c.scale(2.8,2.8);CivilApp.world.drawBuilding(c,{type,x:0,y:0,size:1,status:'complete',progress:100},0);c.restore();c.textAlign='center';c.fillStyle='#dfdfbf';c.font='22px serif';c.fillText(CivilEngine.buildings.find(d=>d.id===type).name,x,340);}return true})()`);
 await b.screenshot('artifacts/v41-03-commerce-buildings.png');await ev(`document.getElementById('qa-commerce-atlas').remove();true`);
 await click('#menuButton');await click('#returnStart');
 await check('continue save uses the renamed inheritance mode',`document.getElementById('continueMeta').textContent.includes('继承模式')&&!document.getElementById('continueMeta').textContent.includes('中世纪开局')`);
 await ev(`(()=>{const slots=JSON.parse(localStorage.getItem('civil.saves.v2'));slots[0].speed=300;localStorage.setItem('civil.saves.v2',JSON.stringify(slots));return true})()`);await b.reload();await click('#continueButton');await clear();
 await check('legacy 300x saves load at 12x with a visible active speed control',`CivilApp.speed===12&&document.querySelector('[data-speed="12"]').classList.contains('active')&&CivilApp.state.settlements.at(-1).name==='晨星港'`);
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');
 console.log(JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2));
}finally{await b.viewport(1440,900);await reset(backup);b.close();}
