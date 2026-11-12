(function(root){
  'use strict';
  const types=[
    {id:'stone',name:'石灰岩',color:'#b9b6a0',knowledge:0,mine:'quarry'},
    {id:'clay',name:'黏土',color:'#ba886b',knowledge:0,mine:'claypit'},
    {id:'iron',name:'铁矿',color:'#b98e77',knowledge:25,mine:'ironmine'},
    {id:'coal',name:'煤层',color:'#85918f',knowledge:80,mine:'coalmine'},
    {id:'copper',name:'铜矿',color:'#80b8a1',knowledge:18,mine:'coppermine'},
    {id:'gold',name:'金矿',color:'#e4c46f',knowledge:75,mine:'goldmine'}
  ],mapping=Object.fromEntries(types.map(t=>[t.mine,t.id])),cache=new Map();
  const sample=(s,x,y)=>root.CivilTerrain.sample(x,y,s.seed,s.geographyVersion||1);
  function deposits(s){
    const key=`${s.seed}:${s.geographyVersion||1}`;if(cache.has(key))return cache.get(key);
    const out=[];for(let gy=0;gy<16;gy++)for(let gx=0;gx<16;gx++){
      const x=gx*256+64+root.CivilTerrain.hash(gx,gy,s.seed+7201)*128,y=gy*256+64+root.CivilTerrain.hash(gx,gy,s.seed+7202)*128,p=sample(s,x,y);if(p.water)continue;
      for(const [i,t] of types.entries()){
        const h=root.CivilTerrain.hash(gx,gy,s.seed+7300+i*97);
        const threshold=t.id==='stone'?.22:t.id==='clay'?.3:t.id==='iron'?.64:t.id==='coal'?.72:t.id==='copper'?.71:.86;
        if(h<threshold-(p.mountain||p.landform==='hill'?.13:0))continue;
        const quality=.65+root.CivilTerrain.hash(gx,gy,s.seed+7500+i)*.9;
        out.push({id:`${t.id}:${gx}:${gy}`,type:t.id,x,y,radius:t.id==='stone'||t.id==='clay'?205:170,quality,reserves:Math.round((t.id==='gold'?900:t.id==='stone'?9000:4500)*quality)});
      }
    }
    if(cache.size>8)cache.delete(cache.keys().next().value);cache.set(key,out);return out;
  }
  function initialize(s){
    if(!s.minerals){s.minerals={version:1,used:{},surveyed:{},surveys:[],serial:0};
      // Existing mines get a finite local deposit, preserving existing projects.
      s.minerals.legacy={};for(const b of s.buildings||[]){const type=mapping[b.type];if(type)s.minerals.legacy[b.id]={id:'legacy:'+b.id,type,x:b.x,y:b.y,radius:60,quality:1,reserves:6000};}
    }
    s.minerals.depleted ||= {};s.minerals.sites ||= {};s.minerals.used ||= {};s.minerals.surveyed ||= {};s.minerals.surveys ||= [];s.minerals.legacy ||= {};
    return s.minerals;
  }
  function remaining(s,d){return Math.max(0,d.reserves-(s.minerals?.used[d.id]||0));}
  function site(s,type,x,y){return deposits(s).filter(d=>d.type===type&&Math.hypot(x-d.x,y-d.y)<=d.radius).sort((a,b)=>remaining(s,b)*b.quality-remaining(s,a)*a.quality)[0];}
  function depositFor(s,b){initialize(s);const type=mapping[b.type];if(!type)return null;if(s.minerals.legacy[b.id])return s.minerals.legacy[b.id];
    if(s.minerals.sites[b.id])return deposits(s).find(d=>d.id===s.minerals.sites[b.id]);
    const d=site(s,type,b.x,b.y);if(d)s.minerals.sites[b.id]=d.id;return d;}
  function factor(s,b){const d=depositFor(s,b);return d?(remaining(s,d)>0?d.quality:0):0;}
  function take(s,b,amount,silent=false){const d=depositFor(s,b);if(!d)return 0;const paid=Math.min(Math.max(0,amount),remaining(s,d));s.minerals.used[d.id]=(s.minerals.used[d.id]||0)+paid;if(paid>0&&remaining(s,d)<=1e-8&&!s.minerals.depleted[d.id]){s.minerals.depleted[d.id]=true;if(!silent)root.CivilEngine?.notify(s,'news','矿藏已经枯竭',types.find(t=>t.id===d.type).name+'已采尽。需要勘探新的矿区或通过贸易补充。',{priority:'major',x:d.x,y:d.y,dedupe:'depleted:'+d.id});}return paid;}
  function visible(s){initialize(s);return [...deposits(s),...Object.values(s.minerals.legacy)].filter(d=>root.CivilEngine?.isExplored(s,d.x,d.y)&&s.knowledge>=types.find(t=>t.id===d.type).knowledge&&(types.find(t=>t.id===d.type).knowledge===0||s.minerals.surveyed[d.id]||Object.values(s.minerals.legacy).some(l=>l.id===d.id))).map(d=>({...d,...types.find(t=>t.id===d.type),id:d.id,type:d.type,remaining:remaining(s,d)}));}
  function survey(s,x,y){
    initialize(s);if(!s.buildings.some(b=>b.type==='workshop'&&b.status==='complete'))return {ok:false,message:'需要手工作坊组织勘探。'};
    if(!Number.isFinite(x)||!Number.isFinite(y)||!root.CivilEngine.isExplored(s,x,y))return {ok:false,message:'请在已探索地区勘探。'};
    if(s.minerals.surveys.length>=2)return {ok:false,message:'勘探队尚未返回。'};
    if(s.minerals.surveys.some(q=>Math.hypot(q.x-x,q.y-y)<200))return {ok:false,message:'此处已有勘探队。'};
    if(s.resources.food<24||s.resources.wood<12)return {ok:false,message:'勘探需要 24 粮食、12 木材。'};
    s.resources.food-=24;s.resources.wood-=12;s.minerals.surveys.push({id:++s.minerals.serial,x,y,started:s.elapsed,duration:2.5});
    return {ok:true,message:'地质勘探已出发，预计 2.5 年'};
  }
  function tick(s){initialize(s);for(const q of [...s.minerals.surveys]){if(s.elapsed-q.started<q.duration)continue;
    const found=deposits(s).filter(d=>Math.hypot(d.x-q.x,d.y-q.y)<620&&root.CivilEngine.isExplored(s,d.x,d.y)&&s.knowledge>=types.find(t=>t.id===d.type).knowledge);
    for(const d of found)s.minerals.surveyed[d.id]=true;
    s.minerals.surveys=s.minerals.surveys.filter(p=>p!==q);
    root.CivilEngine.notify(s,'report','地质勘探完成',found.length?`查明 ${found.length} 处矿藏，已标入矿产地图。`:'本次未查明可利用矿藏。',{x:q.x,y:q.y,dedupe:'survey:'+q.id});
  }}
  root.CivilMinerals={types,mapping,deposits,initialize,site,depositFor,factor,take,visible,survey,tick,remaining};
})(typeof window!=='undefined'?window:globalThis);
