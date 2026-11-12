import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import{connectPage}from'./browser-check.mjs';
const b=await connectPage({timeout:60000}),ev=b.evaluate,delay=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],backup=await ev('localStorage.getItem("civil.saves.v2")');
async function check(name,src){assert.ok(await ev(src),name);checks.push(name);console.log('✓ '+name);}
async function click(sel){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Unavailable '+${JSON.stringify(sel)});e.click();return true})()`);}
async function reset(value){await b.send('Page.navigate',{url:'about:blank'});await delay(100);await b.send('Page.navigate',{url:b.config.url});for(let i=0;i<100;i++){await delay(100);try{if(await ev('typeof CivilApp==="object"'))break;}catch{}}await ev(value===null?'localStorage.removeItem("civil.saves.v2");true':`localStorage.setItem("civil.saves.v2",${JSON.stringify(value)});true`);await b.reload();}
async function start(mode='village'){await ev(`CivilApp.startNew(48271,'议案支出',${JSON.stringify(mode)});CivilApp.state.events=[];CivilApp.tick(0);CivilApp.openPanel('policy');true`);}
async function name(value){await ev(`document.getElementById('proposalName').value=${JSON.stringify(value)};document.getElementById('proposalName').dispatchEvent(new Event('input',{bubbles:true}));true`);}
async function clear(){await ev(`CivilApp.state.events=[];CivilApp.tick(0);true`);}
try{
 await reset(null);await b.send('Emulation.setFocusEmulationEnabled',{enabled:true});await b.viewport(1440,900);await start();await click('#newProposal');
 await check('an empty policy cannot be submitted',`document.querySelector('#proposalForm [type="submit"]').disabled`);
 await click('[data-clause="forage"]');await name('基础采集安排');
 await check('basic policy clearly previews a nonzero initiation cost before currency',`document.getElementById('proposalEstimate').textContent.includes('发起支出')&&document.querySelector('.policy-cost-breakdown')&&!document.querySelector('#proposalForm [type="submit"]').disabled&&!document.querySelector('#proposalEstimate [title="国库"]')`);
 await click('.policy-cost-breakdown summary');await b.screenshot('artifacts/v53-01-policy-cost.png');
 await ev(`window.qaPolicyInput={name:'基础采集安排',clauses:['forage'],regions:['all'],target:'all',executor:'community',condition:'always',duration:0};window.qaBefore=structuredClone(CivilApp.state.resources);window.qaCost=CivilEngine.draftPolicy(CivilApp.state,{...qaPolicyInput,preview:true}).cost;document.getElementById('proposalForm').requestSubmit();true`);
 await check('submitting pays the exact previewed food and timber once',`CivilApp.state.proposals.length===1&&Object.entries(qaCost).every(([k,v])=>CivilApp.state.resources[k]===qaBefore[k]-v)&&CivilApp.state.proposals[0].spending.total.food===qaCost.food`);await clear();
 await click('.policy-results summary');
 await check('policy feedback shows the actual cumulative investment',`document.querySelector('.policy-spending').textContent.includes('累计投入')&&CivilApp.state.proposals[0].spending.last.kind==='initiation'`);
 await click('.proposal-card:last-child [data-edit]');await name('仅修改名称');
 await check('renaming an unchanged policy shows zero additional payment',`document.getElementById('proposalEstimate').textContent.includes('无需支出')&&!document.querySelector('#proposalForm [type="submit"]').disabled`);
 await ev(`window.qaRenameBefore=JSON.stringify(CivilApp.state.resources);window.qaSpending=JSON.stringify(CivilApp.state.proposals[0].spending);document.getElementById('proposalForm').requestSubmit();true`);
 await check('name-only confirmation neither spends nor rewrites payment history',`JSON.stringify(CivilApp.state.resources)===qaRenameBefore&&JSON.stringify(CivilApp.state.proposals[0].spending)===qaSpending&&CivilApp.state.proposals[0].name==='仅修改名称'`);
 await start();await click('#newProposal');await click('[data-clause="forage"]');await name('储备不足安排');
 await ev(`CivilApp.state.resources.wood=0;CivilApp.tick(0);true`);
 await check('a depleted resource immediately disables submission and shows the shortage',`document.querySelector('#proposalForm [type="submit"]').disabled&&document.getElementById('proposalEstimate').textContent.includes('公共资源不足')&&CivilApp.state.proposals.length===0`);
 await ev(`CivilApp.state.resources.wood=100;CivilApp.tick(0);true`);
 await check('replenishing reserves re-enables the same draft without rebuilding the form',`!document.querySelector('#proposalForm [type="submit"]').disabled&&document.getElementById('proposalName').value==='储备不足安排'`);
 await start('city');await click('#newProposal');await click('[data-clause="forage"]');await name('全国采集安排');
 await check('a monetary country pays fiscal organization expenses and scopes them by population',`CivilEngine.draftPolicy(CivilApp.state,{...qaPolicyInput,preview:true}).cost.treasury>0&&document.getElementById('proposalEstimate').textContent.includes('发起支出')`);
 await ev(`document.getElementById('proposalForm').requestSubmit();true`);await clear();await click('.proposal-card:last-child [data-edit]');await click('[data-duration="5"]');
 await check('a substantive revision previews its own nonzero adjustment payment',`document.getElementById('proposalEstimate').textContent.includes('调整支出')&&document.querySelector('.policy-cost-breakdown')`);
 await ev(`window.qaAdjustBefore=CivilApp.state.resources.treasury;window.qaAdjustTotal=CivilApp.state.proposals.at(-1).spending.total.treasury;document.getElementById('proposalForm').requestSubmit();true`);await clear();
 await check('revision deducts treasury and adds to recorded investment',`CivilApp.state.resources.treasury<qaAdjustBefore&&CivilApp.state.proposals.at(-1).spending.total.treasury>qaAdjustTotal`);
 await ev(`CivilApp.save(true);true`);const saved=await ev(`JSON.stringify(CivilApp.state.proposals.at(-1).spending)`);await b.reload();await click('#continueButton');
 await check('save reload retains real paid amounts',`JSON.stringify(CivilApp.state.proposals.at(-1).spending)===${JSON.stringify(saved)}`);
 await ev(`CivilApp.state.events=[];CivilApp.tick(0);CivilApp.openPanel('policy');true`);await click('#newProposal');await click('[data-clause="reserve"]');await b.viewport(390,844);await ev(`document.getElementById('proposalEstimate').scrollIntoView({block:'center'});true`);
 await check('mobile cost preview and confirmation remain within the screen',`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('proposalEstimate').getBoundingClientRect().right<=innerWidth&&document.querySelector('#proposalForm [type="submit"]').getBoundingClientRect().right<=innerWidth`);await b.screenshot('artifacts/v53-02-mobile-policy-cost.png');
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');await writeFile('artifacts/v53-browser-results.json',JSON.stringify({passed:checks.length,checks,errors:b.errors},null,2)+'\n');console.log(`${checks.length} policy initiation cost browser checks passed.`);
}finally{await b.viewport(1440,900);await reset(backup);b.close();}
