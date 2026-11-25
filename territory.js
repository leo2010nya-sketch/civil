(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),E=()=>root.CivilEngine;
  function initialize(s){
    s.territory ||= {version:1,serial:0,history:[]};s.territory.serial ||=0;s.territory.history ||= [];
    for(const n of s.neighbors||[]){
      n.cities ||= [{id:n.id+'-capital',name:n.name,x:n.x,y:n.y,population:n.population,radius:n.radius||220,share:1}];
      n.expansion ||= {serial:0,nextAt:s.elapsed+12+Math.floor(root.CivilTerrain.hash(n.x,n.y,s.seed+9101)*10),last:null};
    }return s.territory;
  }
  function normalize(n){n.population=n.cities.reduce((v,c)=>v+c.population,0);for(const c of n.cities)c.share=c.population/Math.max(1,n.population);if(n.cities.length){n.x=n.cities[0].x;n.y=n.cities[0].y;n.radius=n.cities[0].radius;}}
  function record(s,title,body,data={}){s.territory.history.unshift({title,body,time:s.year,...data});s.territory.history.length=Math.min(40,s.territory.history.length);E().notify(s,'milestone',title,body,{priority:'major',territory:true,...data,dedupe:'territory:'+title+':'+s.elapsed});}
  function expand(s,n){
    if(n.cities.filter(c=>!c.satellite).length>=8||root.CivilWarfare.isAtWar(s,n.id)||n.resources.food<n.population*.08||n.resources.wood<60||n.resources.treasury<40)return false;
    const all=(s.neighbors||[]).flatMap(q=>q.cities.map(c=>({...c,nationId:q.id}))),serial=n.expansion.serial;
    let spot=null;
    for(let i=0;i<240;i++){
      const origin=n.cities[(serial+i)%n.cities.length],angle=(i*2.399963+root.CivilTerrain.hash(serial,n.x,s.seed)*6.28),r=430+(i*37%260),p={x:origin.x+Math.cos(angle)*r,y:origin.y+Math.sin(angle)*r};
      if(p.x<120||p.y<120||p.x>3976||p.y>3976||root.CivilTerrain.sample(p.x,p.y,s.seed,s.geographyVersion||1).water)continue;
      if(s.settlements.some(c=>dist(c,p)<780)||s.buildings.some(b=>dist(b,p)<220)||all.some(c=>dist(c,p)<(c.nationId===n.id?340:(c.radius||220)+170)))continue;
      if(Array.from({length:9},(_,j)=>root.CivilTerrain.sample(origin.x+(p.x-origin.x)*j/8,origin.y+(p.y-origin.y)*j/8,s.seed,s.geographyVersion||1)).some(t=>t.water))continue;
      spot=p;break;
    }
    if(!spot)return false;
    const people=Math.min(600,n.population*.06),food=n.population*.08;
    const c={id:n.id+'-expansion-'+(n.expansion.serial+1),name:E().generatedName(s,'town',n.expansion.serial+1+Math.floor(n.x),n.cities.map(c=>c.name)),...spot,population:people,radius:145,share:0,founded:s.elapsed};
    if(root.CivilNations){
      c.assets=inheritedAssets(s,c,c.id,true);c.assetVersion=1;
      const cost={food,wood:60,treasury:40};
      for(const b of c.assets){const def=E().buildings.find(d=>d.id===b.type);if(!root.CivilNations.canBuild(n,c,def))return false;for(const[k,v]of Object.entries(E().constructionCosts(s,def,b.size,b.x,b.y)))cost[k]=(cost[k]||0)+v;}
      if(Object.entries(cost).some(([k,v])=>(n.resources[k]||0)<v))return false;
      for(const[k,v]of Object.entries(cost))n.resources[k]-=v;
    }else{n.resources.food-=food;n.resources.wood-=60;n.resources.treasury-=40;}
    n.foodStock=n.resources.food;
    const old=n.population;for(const c of n.cities)c.population*=1-people/Math.max(1,old);
    ++n.expansion.serial;
    n.cities.push(c);normalize(n);n.expansion.last={name:c.name,x:c.x,y:c.y,time:s.elapsed};
    if(E().isExplored(s,c.x,c.y))E().notify(s,'news',n.name+'建立新城镇',c.name+'已建立，人口从其原有城市迁入，疆域向周边延伸。',{x:c.x,y:c.y,nationId:n.id,dedupe:'expansion:'+c.id});
    return true;
  }
  function detachAssets(s,c){const assets=s.buildings.filter(b=>b.settlementId===c.id||!b.settlementId&&s.settlements.reduce((a,v)=>dist(v,b)<dist(a,b)?v:a,s.settlements[0]).id===c.id);const ids=new Set(assets.map(b=>b.id));s.buildings=s.buildings.filter(b=>!ids.has(b.id));return assets;}
  function releaseCity(s,id,recipient=null,reason='independence'){
    initialize(s);const c=s.settlements.find(c=>c.id===id);if(!c||s.settlements.length<2||c.id===s.settlements[0].id)return {ok:false,message:'不能转移最后一座城市或首都。'};
    const share=c.population/Math.max(1,s.population),resources={};for(const[k,v]of Object.entries(s.resources)){resources[k]=v*share;s.resources[k]-=resources[k];}
    const assets=detachAssets(s,c),former={...c,id:c.id,population:c.population,radius:c.territoryRadius||540,share:1,assets,cultureData:s.culture.regions[c.id],formerPlayer:true};
    s.settlements=s.settlements.filter(v=>v!==c);s.population=s.settlements.reduce((n,c)=>n+c.population,0);s.warfare.soldiers*=1-share;
    for(const p of s.proposals){if(p.localCoverage)delete p.localCoverage[c.id];p.regions=p.regions.filter(id=>id!==c.id);if(!p.regions.length)p.active=false;}
    delete s.culture.regions[c.id];if(s.unrest?.regions)delete s.unrest.regions[c.id];
    let n=recipient;
    if(!n){const serial=++s.territory.serial;n={id:'breakaway-'+serial,name:c.name+'自由邦',color:'#bd927d',x:c.x,y:c.y,radius:former.radius,population:0,economy:0,technology:s.knowledge,resources:{},production:{},cities:[],relation:25,tension:45,tradeOpen:false,embargo:false,pactUntil:0,truceUntil:s.elapsed+8,guardUntil:0,lastIncident:s.elapsed,tradeLast:{imported:0,exported:0,tariff:0},origin:'independence'};s.neighbors.push(n);}
    for(const[k,v]of Object.entries(resources))n.resources[k]=(n.resources[k]||0)+v;
    n.cities.push(former);E().transferUrbanJobs(s,s,n,c.id);n.economy=(n.economy||0)+c.population*.9;n.economyBaseline=Math.max(100,n.economy);normalize(n);n.foodStock=n.resources.food;
    root.CivilLogistics.initialize(s);initialize(s);
    if(reason!=='independence')record(s,c.name+'转归'+n.name,'城市、居民、当地设施及对应份额的公共储备已转移。',{x:c.x,y:c.y,nationId:n.id});
    return {ok:true,nationId:n.id,cityId:c.id};
  }
  function inheritedAssets(s,c,id,founding=false){
    const out=[],defs=new Map(E().buildings.map(d=>[d.id,d])),grid=new Map(),cell=96;
    const insert=b=>{const key=Math.floor(b.x/cell)+':'+Math.floor(b.y/cell);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b);};
    for(const b of [...s.buildings,...(s.neighbors||[]).flatMap(n=>(n.cities||[]).flatMap(c=>c.assets||[])),...[s,...(s.neighbors||[])].flatMap(n=>(n.urbanism?.jobs||[]).filter(j=>j.phase==='demolition').map(j=>({type:j.type,size:j.size,...j.position})))])insert(b);
    const add=(type,size,min,max,index)=>{const d=defs.get(type);for(let i=0;i<180;i++){const a=(i+index*17)*2.399963,r=min+i*17%Math.max(1,max-min),x=c.x+Math.cos(a)*r,y=c.y+Math.sin(a)*r,t=root.CivilTerrain.sample(x,y,s.seed,s.geographyVersion||1);if(x<24||y<24||x>4072||y>4072||t.water)continue;
      const gx=Math.floor(x/cell),gy=Math.floor(y/cell);let blocked=false;
      for(let yy=gy-2;yy<=gy+2&&!blocked;yy++)for(let xx=gx-2;xx<=gx+2;xx++)if(grid.get(xx+':'+yy)?.some(b=>E().buildingsOverlap({type,x,y,size},b))){blocked=true;break;}
      if(blocked)continue;const b={id:'transferred-'+(++s.buildingSerial),type,size,x,y,settlementId:id,status:'complete',progress:100,started:s.year};out.push(b);insert(b);return true;}return false;};
    if(!founding)['council','market','granary','workshop','well','warehouse'].forEach((t,i)=>add(t,1,25,165,i));
    const homeCount=Math.min(100,Math.ceil(c.population*1.08/210));
    for(let i=0;i<homeCount;i++)add('townhouse',3,65,325,i);
    const homes=out.filter(b=>b.type==='townhouse');if(homes.length&&c.population>homes.length*210/1.08)for(const b of homes)b.housingOverride=Math.ceil(c.population*1.08/homes.length);
    const factor=root.CivilTerrain.sample(c.x,c.y,s.seed,s.geographyVersion||1).foodFactor||1;
    const type=founding?'farm':'estate',output=founding?18:440;
    const farms=Math.ceil(c.population*.36/(output*factor));
    for(let i=0;i<Math.min(60,farms);i++)add(type,2,210,420,i);
    const fields=out.filter(b=>b.type===type);if(!founding&&fields.length&&farms>fields.length)for(const b of fields)b.outputMultiplier=farms/fields.length;
    return out;
  }
  function acquireCities(s,n,ids,reason){
    initialize(s);const cities=n.cities.filter(c=>ids.includes(c.id));if(!cities.length)return {ok:false,message:'目标城市已不属于对方。'};
    const before=n.population,share=clamp(cities.reduce((v,c)=>v+c.population,0)/Math.max(1,before),0,1);
    for(const[k,v]of Object.entries(n.resources)){const amount=v*share;n.resources[k]-=amount;s.resources[k]=(s.resources[k]||0)+amount;if(s.storage.base[k]!=null)s.storage.base[k]=Math.max(s.storage.base[k],s.resources[k]);}
    for(const c of cities){
      let id=c.id;if(s.settlements.some(p=>p.id===id))id='integrated-'+(++s.territory.serial);
      const home={id,name:c.name.replace(/(王国|帝国|共和国|公国|部族|氏族|联盟|自由邦|邦国|城邦|国家)$/,'').replace(/(城|地区)$/,'')+(c.population>=1000?'城':'地区'),x:c.x,y:c.y,population:c.population,level:c.population>=500?3:1,territoryRadius:Math.max(350,c.radius||220),integrationUntil:s.elapsed+25,acquiredFrom:n.name,architectureRegion:c.architectureRegion,satellite:c.satellite,parentId:c.parentId,urbanGrowth:c.urbanGrowth};
      const assets=c.assets?.length?c.assets.map(b=>({...b,settlementId:id})):inheritedAssets(s,c,id);
      for(const b of assets){if(s.buildings.some(p=>p.id===b.id))b.id='transferred-'+(++s.buildingSerial);s.buildings.push(b);}
      s.settlements.push(home);E().transferUrbanJobs(s,n,s,c.id,id);s.explored.push({x:c.x,y:c.y,radius:565});
      s.culture.regions[id]=c.cultureData||{tradition:70,cohesion:52,faith:{local:45,organized:50,secular:5},identity:c.name,festivalUntil:0,preservationUntil:0};
      for(const p of s.proposals)if(p.regions.includes('all')){p.localCoverage||={};p.localCoverage[id]=0;}
      root.CivilPolitics.initialize(s);s.unrest.regions[id].discontent=48;
    }
    n.cities=n.cities.filter(c=>!ids.includes(c.id));n.economy*=1-share;n.economyBaseline=Math.max(100,n.economy);normalize(n);n.foodStock=n.resources.food;
    if(!n.cities.length)s.neighbors=s.neighbors.filter(p=>p!==n);
    s.population=s.settlements.reduce((v,c)=>v+c.population,0);root.CivilSociety.initialize(s);
    record(s,cities.map(c=>c.name).join('、')+'纳入本国',reason+'。居民、公共储备与设施已转移；新地区需要逐步整合，原有政策重新扩散。',{x:cities[0].x,y:cities[0].y,nationId:n.id});
    return {ok:true,message:'领土与城市已转移',cities:cities.map(c=>c.id)};
  }
  function annexOffer(s,id){
    initialize(s);const n=s.neighbors.find(n=>n.id===id);if(!n)return {ok:false,eligible:false,message:'目标势力已不存在。'};
    const eco=root.CivilEconomy.quote(s).realGDP/Math.max(1,n.economy),enemyArmy=n.population*.045,army=s.warfare.soldiers/Math.max(1,enemyArmy);
    const cost={food:Math.ceil(n.population*.05),wood:40,...(s.currency?.adopted?{treasury:Math.ceil(n.economy*.08)}:{})};
    const reasons=[];if(n.annexation?.cityId&&!n.cities.some(c=>c.id===n.annexation.cityId))reasons.push('谈判目标城市已转移');const cityId=n.assimilation?.cityId||n.cities.at(-1)?.id,assimilated=(n.assimilation?.progress||0)>=.95,victory=n.defeatedUntil>s.elapsed;if(!assimilated&&!victory)reasons.push('需先赢得战争，或以持续文化交流达到 95% 同化');if(!s.cityFounded||!s.buildings.some(b=>b.type==='council'&&b.status==='complete'))reasons.push('尚未形成国家议事机构');if(!s.currency?.adopted)reasons.push('需要统一货币财政');
    if(root.CivilWarfare.isAtWar(s,id))reasons.push('先结束战争');if(eco<1.5)reasons.push('经济优势不足 1.5 倍');if(!assimilated&&army<1.5)reasons.push('现役兵力不足对方估计兵力的 1.5 倍');
    if(n.relation<65||n.tension>=45)reasons.push('需关系至少 65、紧张低于 45');if(s.stability<50)reasons.push('本国信任不足 50');
    if(n.annexCooldown>s.elapsed)reasons.push('前次谈判尚在冷却');if(s.unrest?.noble.refusing)reasons.push('贵族仍拒绝执行整合命令');
    return {ok:true,eligible:!reasons.length,economyRatio:eco,militaryRatio:army,cost,reasons,negotiation:n.annexation||null,years:8,cityId,direct:false,assimilation:n.assimilation?.progress||0};
  }
  function annex(s,id){const n=s.neighbors.find(n=>n.id===id),q=annexOffer(s,id);if(!q.eligible||!n)return {ok:false,message:q.reasons?.join('；')||'暂不能谈判兼并。'};if(n.annexation)return {ok:false,message:'兼并谈判正在进行。'};if(Object.entries(q.cost).some(([k,v])=>s.resources[k]<v))return {ok:false,message:'缺少谈判与整合所需储备。'};
    for(const[k,v]of Object.entries(q.cost))s.resources[k]-=v;n.annexation={started:s.elapsed,years:q.years,cityId:q.cityId,cost:{...q.cost}};return {ok:true,message:'八年单城整合谈判已开始，期间需保持实力与外交条件'};
  }
  function integrateTribe(){return false;}
  function tariffs(s,n){const t=n.commercialTreaty,active=t?.until>s.elapsed,allied=n.commercialAlliance?.until>s.elapsed;return {foreign:(allied||active&&t.beneficiary==='player')?Math.min(n.tariffRate,.02):n.tariffRate,domestic:(allied||active&&t.beneficiary==='neighbor')?Math.min(root.CivilStatecraft.taxRate(s,'customs'),.02):root.CivilStatecraft.taxRate(s,'customs')};}
  function tick(s){initialize(s);for(const n of [...s.neighbors]){
    if(n.annexation){const q=annexOffer(s,n.id);if(!q.eligible){n.annexation=null;n.annexCooldown=s.elapsed+10;record(s,'与'+n.name+'的兼并谈判中止',q.reasons.join('；')+'。前期组织与谈判支出已经耗用。',{nationId:n.id});}else if(s.elapsed-n.annexation.started>=n.annexation.years){const cityId=n.annexation.cityId||n.cities.at(-1)?.id;n.annexation=null;acquireCities(s,n,[cityId],'长期单城整合谈判完成');if(n.assimilation){n.assimilation.progress=0;n.assimilation.cityId=n.cities.at(-1)?.id;}n.annexCooldown=s.elapsed+12;}}
    if(!s.neighbors.includes(n))continue;
    if(s.elapsed>=n.expansion.nextAt){const target=s.neighbors.find(d=>d!==n&&E().tribalIntegrationOffer(n,d).eligible&&Math.hypot(n.x-d.x,n.y-d.y)<=650);if(target)integrateTribe(s,n,target);else expand(s,n);n.expansion.nextAt=s.elapsed+12+Math.floor(root.CivilTerrain.hash(n.expansion.serial,n.x,s.seed+9101)*10);}
  }}
  root.CivilTerritory={initialize,tick,expand,normalize,releaseCity,acquireCities,annexOffer,annex,integrateTribe,tariffs,inheritedAssets};
})(typeof window!=='undefined'?window:globalThis);
