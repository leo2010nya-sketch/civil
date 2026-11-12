import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectPage} from './browser-check.mjs';
const b=await connectPage({timeout:60000});
try {
 await b.reload();
 const result=await b.evaluate(`(()=>{
 const checks=[], parity=[], benchmarks=[];
 const check=(name,value)=>{if(!value)throw Error(name);checks.push(name);};
 const canvas=document.createElement('canvas');canvas.style='position:fixed;left:0;top:0;width:1440px;height:900px;z-index:-1';document.body.append(canvas);
 const w=new CivilWorld(canvas);w.observer?.disconnect();
 const frame=(time=5000)=>{w.dirty=true;w.render(time);};
 const snap=(x=2048,y=2048,z=1.25)=>{w._view={x,y,zoom:z};w.target={...w._view};};
 const counts=()=>{const a=w.cacheInfo();return [a.terrainBuilds,a.surfaceBuilds,a.objectBuilds,a.fogBuilds];};
 const same=(a,c)=>JSON.stringify(a)===JSON.stringify(c);
 const compare=(name)=>{
   w.cacheEnabled=true;frame();const a=w.sceneCtx.getImageData(0,0,w.sceneCanvas.width,w.sceneCanvas.height).data;
   w.cacheEnabled=false;frame();const c=w.sceneCtx.getImageData(0,0,w.sceneCanvas.width,w.sceneCanvas.height).data;
   let sum=0,max=0,changed=0;for(let i=0;i<a.length;i+=4){let d=0;for(let k=0;k<3;k++){const n=Math.abs(a[i+k]-c[i+k]);sum+=n;max=Math.max(max,n);d=Math.max(d,n);}if(d>3)changed++;}
   const p={name,meanChannelError:sum/(a.length*.75),pixelsOver3:changed/(a.length/4),max};parity.push(p);
   check('cached/live visual parity: '+name,p.meanChannelError<.15&&p.pixelsOver3<.005);w.cacheEnabled=true;
 };
 try {
  let s=CivilEngine.create(48271,'缓存检查','city');w.setState(s);snap();frame();
  const initial=counts();w.setState(s);frame();check('same-state updates preserve warm caches',same(initial,counts()));for(let i=1;i<=30;i++)frame(5000+i*100);
  check('stationary animated frames reuse all four static layers',same(initial,counts()));
  s.resources.food+=30;s.settlements[0].population+=5;s.population+=5;frame();check('resource and population changes do not rebuild static layers',same(initial,counts()));
  w.selected={kind:'land',x:2100,y:2080};w.setLayer('population');frame();check('selection and data overlays preserve static layers',same(initial,counts()));w.selected=null;w.setLayer('natural');
  compare('inheritance village view');snap(2048,2048,.7);compare('region');snap(2048,2048,.25);compare('world');snap();frame();
  let before=counts();s.buildings.push({id:'qa-project',type:'bank',x:2100,y:2060,size:1,status:'building',progress:10,settlementId:s.settlements[0].id});frame();
  check('new building rebuilds surface and objects only',same(counts(),[before[0],before[1]+1,before[2]+1,before[3]]));
  before=counts();const project=s.buildings.at(-1);project.progress=70;frame();check('construction progress uses a live reference without cache rebuild',same(before,counts())&&w.mapCache.objects.runs.some(r=>r.objects?.some(o=>o.source===project)));
  project.status='complete';project.progress=100;frame();check('completion refreshes static building sprite',counts()[2]===before[2]+1);
  before=counts();project.status='failed';frame();check('failure removes cached sprite',counts()[2]===before[2]+1);compare('failed project');
  before=counts();project.status='complete';project.type='windmill';project.size=3;project.x+=25;frame();check('type size and position changes refresh map',counts()[2]===before[2]+1);compare('windmill interleaved with trees');
  const a=w.sceneCtx.getImageData(0,0,w.sceneCanvas.width,w.sceneCanvas.height).data;frame(18000);const c=w.sceneCtx.getImageData(0,0,w.sceneCanvas.width,w.sceneCanvas.height).data;
  check('windmills smoke water and people remain animated',a.some((v,i)=>v!==c[i]));
  check('each animated building remains live', ['fire','workshop','forge','windmill','watermill','machineworks','steamplant','tram','factory'].every(type=>w.dynamicObject({objectType:'building',source:{type,status:'complete'}})));
  const sprite=document.createElement('canvas');sprite.width=sprite.height=240;const ctx=sprite.getContext('2d');
  check('mills fire smoke and tram each change their actual sprite over time',['fire','workshop','forge','windmill','watermill','machineworks','steamplant','tram','factory'].every(type=>{const paint=t=>{ctx.clearRect(0,0,240,240);w.drawBuilding(ctx,{type,status:'complete',x:120,y:160,size:1},t);return ctx.getImageData(0,0,240,240).data;};const a=paint(1000),b=paint(7000);return a.some((v,i)=>v!==b[i]);}));
  before=counts();const t=w.trees.find(t=>Math.hypot(t.x-2048,t.y-2048)<300);s.forest.removed[t.id]=true;frame();check('cut forest updates stumps and trees only',same(counts(),[before[0],before[1]+1,before[2]+1,before[3]]));
  before=counts();s.explored[0].radius+=20;frame();check('exploration radius mutation refreshes objects and fog',same(counts(),[before[0],before[1],before[2]+1,before[3]+1]));
  before=counts();s.explored.push({x:s.neighbors[0].x,y:s.neighbors[0].y,radius:300});frame();check('new exploration exposes foreign city and refreshes fog',counts()[3]===before[3]+1&&w.nationBuildings().some(o=>o.nationId===s.neighbors[0].id));
  before=counts();s.settlements[0].x+=3;frame();check('settlement relocation refreshes all affected ground layers',same(counts(),[before[0]+1,before[1]+1,before[2]+1,before[3]]));
  before=counts();s.industrialized=true;frame();check('era transition refreshes buildings and roads without rebuilding terrain',counts()[0]===before[0]&&counts()[1]===before[1]+1&&counts()[2]===before[2]+1);compare('industrial architecture');
  before=counts();w.target.x+=150;for(let i=0;i<5;i++)frame(20000+i*100);check('moving camera does not allocate viewport caches',same(before.slice(0,3),counts().slice(0,3)));
  for(let i=0;i<90;i++)frame(21000+i*100);before=counts();for(let i=0;i<10;i++)frame(40000+i*100);check('camera snaps and caches stay stable after pan',same(before,counts())&&w._view.x===w.target.x);
  snap(2100,2048,2.2);compare('zoomed and panned');
  s=CivilEngine.create(48271,'新存档','village');w.setState(s);snap();frame();check('same seed different save releases stale city layers',!w.nationBuildings().length&&w.mapCache.objects.runs.every(r=>!r.objects?.some(o=>o.source?.id==='qa-project')));compare('pioneer');
  s.buildings.push(...['fire','hut','workshop','forge','windmill','watermill','factory','machineworks','steamplant','tram','bank','castle','wall','aqueduct','railstation'].map((type,i)=>({id:'qa-'+i,type,x:1980+(i%5)*36,y:2000+Math.floor(i/5)*24,size:1+(i%3),status:'complete',progress:100})));
  frame();compare('dense mixed sprites and occlusion');
  w.cachePixelLimit=2000;w.clearMapCache();frame();check('static object memory budget falls back to live runs',w.cacheInfo().objectPixels<=2000&&w.mapCache.objects.runs.some(r=>r.objects?.some(o=>!w.dynamicObject(o))));compare('memory fallback');
  w.cachePixelLimit=8*1024*1024;w.clearMapCache();
  canvas.style.width='390px';canvas.style.height='844px';w.resize();snap();frame();check('mobile resize regenerates correct-sized layers',w.sceneCanvas.width===195&&w.mapCache.terrain.canvas.width===195&&w.fogCanvas.width===195);compare('mobile');
  const center=w.screenToWorld(195,422);check('coordinate mapping stays correct after resize',Math.abs(center.x-2048)<.01&&Math.abs(center.y-2048)<.01);
  canvas.style.width='1440px';canvas.style.height='900px';w.resize();
  const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
  for(const fixture of ['inheritance','large-city']){
   s=CivilEngine.create(48271,'性能检查','city');if(fixture==='large-city'){s.industrialized=true;for(let i=0;i<450;i++)s.buildings.push({id:'dense-'+i,type:['brickhouse','bank','warehouse','factory','windmill','publicschool'][i%6],x:1740+(i%25)*25,y:1810+Math.floor(i/25)*25,size:1,status:'complete',progress:100});}
   w.setState(s);snap(2048,2048,.9);const times={};for(const enabled of [false,true]){w.cacheEnabled=enabled;frame();for(let i=0;i<8;i++)frame(60000+i*100);const trials=[];for(let k=0;k<5;k++){const start=performance.now();for(let i=0;i<24;i++)frame(70000+i*100);trials.push((performance.now()-start)/24);}times[enabled?'cached':'raw']=median(trials);}
   benchmarks.push({fixture,...times,reductionPercent:(1-times.cached/times.raw)*100,memory:w.cacheInfo()});
  }
  check('caches are renderer-only and never enter save state',!JSON.stringify(s).includes('mapCache')&&!JSON.stringify(s).includes('cacheStats'));
  const retained=w.mapCache.terrain.canvas;w.destroy();check('destroy releases cached canvas backing stores',retained.width===1&&w.mapCache.terrain===null);
  return {passed:checks.length,checks,parity,benchmarks};
 } finally {w.destroy();canvas.remove();}
})()`);
 assert.equal(b.errors.length,0,JSON.stringify(b.errors));result.errors=b.errors;
 await writeFile('artifacts/map-cache-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
} finally {b.close();}
