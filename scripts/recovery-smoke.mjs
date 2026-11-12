import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{connectPage}from'./browser-check.mjs';
const url=process.argv[2]||'file:///Users/shiruixing/Desktop/csp/civil/index.html',b=await connectPage({url,timeout:60000}),ev=b.evaluate,delay=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],timings=[];
const backup=await ev(`Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('civil.')).map(k=>[k,localStorage.getItem(k)]))`);
const raw=await readFile(new URL('../recovery/存档原始备份_2026-11-12.json',import.meta.url),'utf8'),originals=JSON.parse(raw);
async function check(name,source){assert.ok(await ev(source),name);checks.push(name);console.log('✓ '+name);}
async function click(sel){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(sel)});e.click();return true})()`);}
async function reset(data,restoreAll=false){
 const source=`(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('civil.'))localStorage.removeItem(k);${restoreAll?`for(const[k,v]of Object.entries(${JSON.stringify(data)}))localStorage.setItem(k,v);`:`localStorage.setItem('civil.saves.v2',${JSON.stringify(data)});`}return true})()`;
 const script=await b.send('Page.addScriptToEvaluateOnNewDocument',{source});
 const t=Date.now();try{await b.reload();return Date.now()-t;}finally{await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});}
}
try{
 const startup=await reset(raw);timings.push({action:'list_three_real_legacy_saves',milliseconds:startup});
 await check('direct-file startup lists all three recovered worlds without eager migration',`typeof CivilApp==='object'&&CivilApp.saves.length===3&&document.getElementById('saveCount').textContent==='3'&&!CivilApp.inGame`);
 await check('opening the startup page leaves exact original save bytes untouched',`localStorage.getItem('civil.saves.v2')===${JSON.stringify(raw)}`);
 await check('large legacy neighbor conversion has a bounded runtime and conserves population',`(()=>{const slots=JSON.parse(localStorage.getItem('civil.saves.v2'));return slots.every(slot=>{const s=structuredClone(slot.state),p=s.population,foreign=s.neighbors.reduce((v,n)=>v+n.population,0),start=performance.now();CivilEngine.initialize(s);return performance.now()-start<5000&&s.population===p&&s.neighbors.reduce((v,n)=>v+n.population,0)===foreign&&s.neighbors.every(n=>n.cities.every(c=>c.assets.length<200&&CivilNations.housing(c)>=c.population));})})()`);
 for(const [i,slot]of originals.entries()){
  await b.reload();await click('#loadGameButton');const t=Date.now();await click(`[data-load="${slot.id}"]`);timings.push({action:'load_real_legacy_'+i,milliseconds:Date.now()-t});
  await check('recovered legacy world '+(i+1)+' opens with its original year population and buildings',`CivilApp.inGame&&CivilApp.state.id===${JSON.stringify(slot.id)}&&CivilApp.state.year===${slot.state.year}&&CivilApp.state.population===${slot.state.population}&&CivilApp.state.buildings.length===${slot.state.buildings.length}`);
  await ev(`CivilApp.state.events=[];CivilApp.tick(0);CivilApp.openPanel('warehouse');CivilApp.save(true);true`);
  await check('recovered world '+(i+1)+' can open inventory and persist without losing its sibling worlds',`document.querySelectorAll('.stock-card').length>0&&JSON.parse(localStorage.getItem('civil.saves.v2')).length===3&&localStorage.getItem('civil.saves.v2.original')===${JSON.stringify(raw)}`);
  await check('recovered world '+(i+1)+' can resume simulation with finite resources and population',`(()=>{const before=CivilApp.state.elapsed;CivilApp.tick(.25);CivilApp.state.events=[];CivilApp.tick(0);return CivilApp.state.elapsed>before&&Number.isFinite(CivilApp.state.population)&&Object.values(CivilApp.state.resources).every(Number.isFinite)&&CivilApp.state.neighbors.every(n=>Number.isFinite(n.population)&&Object.values(n.resources).every(Number.isFinite));})()`);
 }
 await b.reload();await check('all three real worlds remain present after repeated migration and reload',`CivilApp.saves.length===3`);
 const unsupported=JSON.stringify([{...originals[0],id:'unsupported',state:{...originals[0].state,version:99}},...originals]);
 await reset(unsupported);await click('#loadGameButton');await click('[data-load="unsupported"]');
 await check('unsupported versions show a recovery dialog without modifying the archive',`document.getElementById('backToSaveRecovery')&&!CivilApp.inGame&&localStorage.getItem('civil.saves.v2')===${JSON.stringify(unsupported)}`);
 await click('#backToSaveRecovery');
 await check('a failed save can return to recovery with all healthy worlds accessible',`document.querySelectorAll('[data-load]').length===4&&document.getElementById('importSaves')`);
 await reset(raw);await click('#loadGameButton');
 await ev(`window.originalInitialize=CivilEngine.initialize;CivilEngine.initialize=()=>{throw Error('测试迁移失败')};true`);
 try{await click(`[data-load="${originals[0].id}"]`);}finally{await ev(`CivilEngine.initialize=window.originalInitialize;delete window.originalInitialize;true`);}
 await check('migration exceptions display an actionable dialog and preserve original bytes',`document.getElementById('backToSaveRecovery')&&document.getElementById('dialog').textContent.includes('测试迁移失败')&&localStorage.getItem('civil.saves.v2')===${JSON.stringify(raw)}`);
 const mixed=JSON.stringify([{id:'malformed',state:null},...originals]);await reset(mixed);
 await check('one malformed slot does not hide the three intact worlds',`CivilApp.saves.length===3&&document.getElementById('saveRecoveryNotice').textContent.includes('格式异常')`);
 await ev(`CivilApp.startNew(54321,'新的旅程');true`);
 await check('a new game preserves malformed records and every prior save rather than replacing the archive',`JSON.parse(localStorage.getItem('civil.saves.v2')).length===5&&JSON.parse(localStorage.getItem('civil.saves.v2')).some(s=>s.id==='malformed')`);
 await reset('{broken');await click('#loadGameButton');
 await check('malformed primary JSON offers recovery controls and retains original bytes',`localStorage.getItem('civil.saves.v2')==='{broken'&&document.getElementById('exportSaves')&&document.getElementById('importSaves')&&document.getElementById('restoreLocalBackup')`);
 if(url.startsWith('file:')){
  await click('#restoreRecoveredSaves');for(let i=0;i<50;i++){await delay(100);if(await ev('CivilApp.saves.length===3'))break;}
  await check('the direct-file recovery button restores the three verified backup worlds',`CivilApp.saves.length===3&&Object.keys(localStorage).some(k=>k.startsWith('civil.saves.v2.damaged.'))`);
 }
 await b.viewport(390,844);await check('mobile archive and recovery actions fit the viewport',`document.documentElement.scrollWidth<=innerWidth&&document.getElementById('importSaves').getBoundingClientRect().right<=innerWidth`);
 await b.viewport(1440,900);
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));checks.push('no browser runtime exceptions');
 const output={protocol:url.startsWith('file:')?'file':'http',passed:checks.length,checks,timings,errors:b.errors};await writeFile(`artifacts/v531-${output.protocol}-recovery.json`,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,timings,errors:b.errors}));
}finally{await b.viewport(1440,900);await reset(backup,true);b.close();}
