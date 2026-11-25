(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));
  const resources=[
    {id:'food',name:'粮食',icon:'food',price:1,base:600},
    {id:'wood',name:'木材',icon:'wood',price:2,base:400},
    {id:'stone',name:'石材',icon:'stone',price:3,base:300},
    {id:'clay',name:'黏土',icon:'stone',price:1.5,base:250,building:'claypit'},
    {id:'iron',name:'铁料',icon:'build',price:6,base:200,building:'ironmine'},
    {id:'coal',name:'煤炭',icon:'industry',price:3,base:200,building:'coalmine'},
    {id:'copper',name:'铜料',icon:'build',price:5,base:160,building:'coppermine'},
    {id:'gold',name:'黄金',icon:'coin',price:22,base:80,building:'goldmine'},
    {id:'tools',name:'工具',icon:'build',price:10,base:150,building:'toolworks'},
    {id:'cloth',name:'布匹',icon:'culture',price:5,base:200,building:'weaving'},
    {id:'medicine',name:'药材',icon:'health',price:12,base:100,building:'apothecary'}
  ];
  const buildings=[
    {id:'claypit',name:'取土场',icon:'stone',cost:{wood:16,food:8},years:1.5,requiredPopulation:36,output:{clay:8},footprint:24,small:true},
    {id:'ironmine',name:'铁矿场',icon:'forge',cost:{wood:100,stone:65},years:6,requiredKnowledge:25,requiredBuildings:['quarry','workshop'],output:{iron:5},footprint:30},
    {id:'coalmine',name:'煤矿',icon:'industry',cost:{wood:130,stone:80},years:7,requiredKnowledge:80,requiredBuildings:['quarry','forge'],output:{coal:8},footprint:30},
    {id:'coppermine',name:'铜矿场',icon:'forge',cost:{wood:80,stone:45},years:5,requiredKnowledge:18,requiredBuildings:['quarry','workshop'],output:{copper:4},footprint:30},
    {id:'goldmine',name:'金矿场',icon:'coin',cost:{wood:150,stone:100,treasury:55},years:8,requiredKnowledge:75,requiredBuildings:['forge'],output:{gold:.7},footprint:32},
    {id:'bronzesmith',name:'铜器作坊',icon:'build',cost:{wood:65,stone:35,copper:10},years:4,requiredKnowledge:18,requiredBuildings:['workshop'],input:{copper:2,wood:1},output:{tools:1.2},footprint:27},
    {id:'toolworks',name:'制器工坊',icon:'build',cost:{wood:90,stone:45,clay:20},years:5,requiredKnowledge:25,requiredBuildings:['forge'],input:{iron:2,wood:1},output:{tools:1.5},footprint:26},
    {id:'weaving',name:'织造坊',icon:'culture',cost:{wood:65,stone:20},years:4,requiredKnowledge:12,requiredBuildings:['workshop'],input:{food:1},output:{cloth:3},footprint:24},
    {id:'apothecary',name:'药坊',icon:'health',cost:{wood:90,stone:55,cloth:15},years:6,requiredKnowledge:40,requiredBuildings:['clinic'],input:{food:1,cloth:.25},output:{medicine:1},footprint:24},
    {id:'storehouse',name:'简易堆栈',icon:'warehouse',cost:{wood:30,stone:8},years:2,storage:350,footprint:24,small:true}
  ].map(d=>({category:'production',small:false,desc:d.id==='storehouse'?'扩充各类物资的存储空间。':`${Object.entries(d.input||{}).map(([k,v])=>resources.find(r=>r.id===k).name+' '+v).join('、')}${d.input?' → ':''}${Object.entries(d.output||{}).map(([k,v])=>resources.find(r=>r.id===k).name+' '+v).join('、')}/年。`,...d}));
  let hooks={};
  const currency=s=>root.CivilStatecraft.currencyShare(s)>=.6;
  const count=(s,type)=>s.buildings.reduce((v,b)=>v+(b.status==='complete'&&b.type===type?(b.size||1):0),0);
  function initialize(s){
    s.storage ||= {base:{},last:{},lost:{}};s.storage.base ||= {};s.storage.last ||= {};s.storage.lost ||= {};
    for(const r of resources){s.resources[r.id]=clamp(s.resources[r.id]||0,0,9999999);s.storage.base[r.id]??=Math.max(r.base,s.resources[r.id]);}
    for(const n of s.neighbors||[]){
      n.growth ||= {population:.008,economy:.015,technology:.6,territory:.35};
      n.economy ??= Math.max(100,n.population*.7);n.economyBaseline??=Math.max(100,n.economy);n.technology ??=s.startEra==='medieval'?110:35;
      n.tariffRate=clamp(n.tariffRate??(.05+root.CivilTerrain.hash(n.x,n.y,s.seed)*.1),0,.3);
      n.resources ||= {};for(const r of resources)n.resources[r.id]??=r.id==='food'?(n.foodStock??n.population*3):Math.max(40,n.population*(r.price>5?.04:.2));
      n.resources.treasury??=Math.max(200,n.population*.6);
      n.production ||= Object.fromEntries(resources.map(r=>[r.id,Math.max(1,n.population*.004/r.price)]));
      for(const r of resources)n.production[r.id]??=Math.max(1,n.population*.004/r.price);
      n.tradePlan ||= {imports:{[n.exportResource||'food']:n.exportRate||10},exports:{[n.importResource||'wood']:n.importRate||5}};
      n.tradeTotals ||= {imports:0,exports:0,spent:0,earned:0,foreignTariff:0,domesticTariff:0};
    }
  }
  function capacity(s,key){return (s.storage?.base?.[key]||resources.find(r=>r.id===key)?.base||0)+count(s,'storehouse')*350+count(s,'warehouse')*1500+(key==='food'?count(s,'granary')*2000:0);}
  function availableResources(s){return resources.filter(r=>!r.building||(s.resources[r.id]||0)>0||hooks.available?.(s,buildings.find(d=>d.id===r.building))?.ok);}
  function fit(s){for(const r of resources){const extra=Math.max(0,s.resources[r.id]-capacity(s,r.id));if(extra){s.resources[r.id]-=extra;s.storage.lost[r.id]=(s.storage.lost[r.id]||0)+extra;}}}
  function tick(s,dt){
    initialize(s);const gross={},used={};
    const workforce=Math.max(0,s.population*.54-(s.warfare?.soldiers||0)-s.buildings.filter(b=>b.status==='building').length*2);
    const labor=clamp(workforce/Math.max(12,s.population*.54,s.buildings.length*2),0,1);
    for(const b of s.buildings){
      if(b.status!=='complete')continue;const d=buildings.find(d=>d.id===b.type);if(!d?.output)continue;
      let factor=(b.size||1)*dt*(root.CivilEngine?.technologySummary(s).production||1)*labor*(root.CivilPolitics?.labor(s,b.settlementId)??1)*(currency(s)?s.economy?.activity??1:1);
      const mining=root.CivilMinerals?.mapping[b.type];if(mining){const d=root.CivilMinerals.depositFor(s,b);factor*=root.CivilMinerals.factor(s,b);factor=Math.min(factor,d?root.CivilMinerals.remaining(s,d)/Object.values(buildings.find(d=>d.id===b.type).output)[0]:0);}
      for(const [key,rate] of Object.entries(d.input||{}))factor=Math.min(factor,s.resources[key]/rate);
      for(const [key,rate] of Object.entries(d.output))factor=Math.min(factor,Math.max(0,capacity(s,key)-s.resources[key])/rate);
      for(const [key,rate] of Object.entries(d.input||{})){const v=rate*factor;s.resources[key]-=v;used[key]=(used[key]||0)+v/dt;}
      for(const [key,rate] of Object.entries(d.output)){const v=mining?root.CivilMinerals.take(s,b,rate*factor):rate*factor;s.resources[key]+=v;gross[key]=(gross[key]||0)+v/dt;}
    }
    // Supplies have actual uses rather than being display-only inventory.
    for(const [key,rate] of [['tools',s.population*.0003],['cloth',s.population*.0006],['medicine',s.population*.00008],['coal',count(s,'factory')*2+count(s,'steamplant')*4]]){
      const paid=Math.min(s.resources[key],rate*dt);s.resources[key]-=paid;used[key]=(used[key]||0)+paid/dt;
    }
    s.storage.last={gross,used,time:s.elapsed};fit(s);
  }
  function summary(s){initialize(s);const trade=foreignSummary(s);return {lines:availableResources(s).map(r=>({...r,stock:s.resources[r.id],capacity:capacity(s,r.id),production:s.storage.last.gross?.[r.id]||0,consumption:s.storage.last.used?.[r.id]||0,trade:trade[r.id+'Rate']||0,lost:s.storage.lost[r.id]||0})),warehouses:count(s,'warehouse'),depots:count(s,'storehouse')};}
  const monetaryTrade=(s,n)=>currency(s)&&root.CivilStatecraft.currencyShare(n)>=.6;
  function configureTrade(s,id,plan){
    initialize(s);const n=s.neighbors.find(n=>n.id===id);if(!n)return {ok:false,message:'尚未接触这个国家。'};
    const allowed=new Set(availableResources(s).map(r=>r.id)),clean={imports:{},exports:{}};
    for(const side of ['imports','exports'])for(const [key,value] of Object.entries(plan[side]||{})){
      if(!allowed.has(key)||!Number.isFinite(+value)||+value<0||+value>10000)return {ok:false,message:'货物或数量无效。'};
      if(+value)clean[side][key]=+value;
    }
    if(resources.some(r=>clean.imports[r.id]&&clean.exports[r.id]))return {ok:false,message:'同一种物资不能同时进出口。'};
    if(!monetaryTrade(s,n)&&((Object.keys(clean.imports).length===0)!==(Object.keys(clean.exports).length===0)))return {ok:false,message:'实物交换需同时指定输入与输出物资。'};
    n.tradePlan=clean;n.tradeLast={imported:0,exported:0,tariff:0,flows:{},treasuryRate:0};
    return {ok:true,message:monetaryTrade(s,n)?'进出口计划已更新':'实物交换计划已更新'};
  }
  function foreignSummary(s){
    const result={routes:0,treasuryRate:0,...Object.fromEntries(resources.map(r=>[r.id+'Rate',0]))};
    for(const n of s.neighbors||[])if(n.tradeOpen&&!n.embargo&&n.tension<65&&n.relation>=15&&!root.CivilWarfare?.isAtWar(s,n.id)){
      result.routes++;const flow=n.tradeLast||{};for(const r of resources)result[r.id+'Rate']+=flow.flows?.[r.id]||0;result.treasuryRate+=flow.treasuryRate||0;
    }return result;
  }
  function grow(s,n,dt){
    const pace=root.CivilWarfare?.isAtWar(s,n.id)?.35:1;
    n.population*=Math.exp(n.growth.population*dt*pace);n.economy*=Math.exp(n.growth.economy*dt*pace);n.technology+=n.growth.technology*dt*pace;
    for(const c of n.cities||[]){
      c.population=n.population*c.share;
      const homeDistance=Math.min(...s.settlements.map(p=>Math.hypot(c.x-p.x,c.y-p.y)-600));
      const neighborDistance=Math.min(10000,...s.neighbors.filter(p=>p!==n).flatMap(p=>(p.cities||[p]).map(v=>Math.hypot(c.x-v.x,c.y-v.y)-(v.radius||220)-35)));
      const radius=c.radius||145,limit=Math.max(radius,Math.min(c===n.cities[0]?380:250,homeDistance,neighborDistance));
      c.radius=Math.min(limit,radius+n.growth.territory*dt*pace);
    }
    if(n.cities?.length)n.radius=n.cities[0].radius;
    for(const r of resources)n.resources[r.id]=Math.min(9999999,n.resources[r.id]+n.production[r.id]*Math.max(.1,n.economy/n.economyBaseline)*dt*pace);
    n.resources.treasury=Math.min(9999999,n.resources.treasury+n.economy*.008*dt*pace);n.foodStock=n.resources.food;
  }
  function trade(s,n,dt){
    n.tradeLast={imported:0,exported:0,tariff:0,flows:{},importValue:0,exportValue:0,foreignTariff:0,treasuryRate:0};
    if(!n.tradeOpen||n.embargo||n.tension>=65||n.relation<15||root.CivilWarfare?.isAtWar(s,n.id))return;
    const flow=n.tradeLast, border=clamp(1-n.tension/140,.25,1)*(1-(root.CivilSociety?.taxQuote(s)?.tradePenalty||0));
    const lines=side=>Object.entries(n.tradePlan[side]).map(([key,rate])=>({r:{...resources.find(r=>r.id===key),price:root.CivilEconomy?.price(s,key,resources.find(r=>r.id===key).price)||resources.find(r=>r.id===key).price},amount:rate*border*dt}));
    const buys=lines('imports'),sells=lines('exports');
    const importTax=monetaryTrade(s,n)?(root.CivilTerritory?.tariffs(s,n).domestic??s.taxation?.rates.customs??0):0;
    const record=(r,v)=>flow.flows[r.id]=(flow.flows[r.id]||0)+v/dt;
    if(monetaryTrade(s,n)){
      // Export first; proceeds may finance this interval's imports. Tariff is paid to the destination.
      for(const {r,amount} of sells){const v=Math.min(amount,s.resources[r.id],n.resources.treasury/r.price,Math.max(0,n.population*.1)/r.price*dt,Math.max(0,(root.CivilNations?.capacity(n,r.id)??9999999)-n.resources[r.id])),value=v*r.price,tax=value*(root.CivilTerritory?.tariffs(s,n).foreign??n.tariffRate);
        s.resources[r.id]-=v;n.resources[r.id]+=v;n.resources.treasury-=value-tax;s.resources.treasury+=value-tax;
        flow.exported+=v/dt;flow.exportValue+=value/dt;flow.foreignTariff+=tax/dt;flow.treasuryRate+=(value-tax)/dt;record(r,-v);
      }
      for(const {r,amount} of buys){const v=Math.min(amount,n.resources[r.id],Math.max(0,n.population*.1)/r.price*dt,s.resources.treasury/(r.price*(1+importTax)),Math.max(0,capacity(s,r.id)-s.resources[r.id])),value=v*r.price;
        n.resources[r.id]-=v;s.resources[r.id]+=v;s.resources.treasury-=value*(1+importTax);n.resources.treasury+=value;
        flow.imported+=v/dt;flow.importValue+=value/dt;flow.treasuryRate-=value*(1+importTax)/dt;record(r,v);
      }
    }else{
      const buyValue=buys.reduce((a,l)=>a+l.amount*l.r.price,0),sellValue=sells.reduce((a,l)=>a+l.amount*l.r.price,0);
      let factor=1;for(const {r,amount} of sells)factor=Math.min(factor,s.resources[r.id]/Math.max(.000001,amount),Math.max(0,(root.CivilNations?.capacity(n,r.id)??9999999)-n.resources[r.id])/Math.max(.000001,amount));
      for(const {r,amount} of buys)factor=Math.min(factor,n.resources[r.id]/Math.max(.000001,amount),Math.max(0,capacity(s,r.id)-s.resources[r.id])/Math.max(.000001,amount));
      // A balanced barter uses reference exchange ratios without introducing currency to the UI or accounts.
      const buyScale=Math.min(1,sellValue/Math.max(.000001,buyValue)),sellScale=Math.min(1,buyValue/Math.max(.000001,sellValue));
      for(const {r,amount} of sells){const v=amount*factor*sellScale;s.resources[r.id]-=v;n.resources[r.id]+=v;flow.exported+=v/dt;record(r,-v);}
      for(const {r,amount} of buys){const v=amount*factor*buyScale;n.resources[r.id]-=v;s.resources[r.id]+=v;flow.imported+=v/dt;record(r,v);}
    }
    for(const key of ['imports','exports','spent','earned','foreignTariff'])n.tradeTotals[key]+=(key==='imports'?flow.imported:key==='exports'?flow.exported:key==='spent'?flow.importValue:key==='earned'?flow.exportValue:flow.foreignTariff)*dt;
    n.foodStock=n.resources.food;
  }
  function foreignTick(s,dt,{development=true}={}){initialize(s);if(development){if(root.CivilNations)root.CivilNations.advance(s,dt);else for(const n of s.neighbors)grow(s,n,dt);}for(const n of s.neighbors)trade(s,n,dt);}
  root.CivilLogistics={monetaryTrade,resources,buildings,initialize,tick,summary,capacity,fit,configureTrade,foreignSummary,foreignTick,configure(h){hooks=h;}};
})(typeof window!=='undefined'?window:globalThis);
