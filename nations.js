(function(root){
  'use strict';
  const E=()=>root.CivilEngine,L=()=>root.CivilLogistics,M=()=>root.CivilMinerals;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
  let definitionCache;
  const definitions=()=>definitionCache||=(new Map(E().buildings.map(d=>[d.id,d])));
  const assets=n=>n.cities.flatMap(c=>c.assets||[]);
  const complete=n=>assets(n).filter(b=>b.status==='complete');
  const sample=(s,p)=>root.CivilTerrain.sample(p.x,p.y,s.seed,s.geographyVersion||1);
  const runtimes=new WeakMap();
  function initialize(s){
    L().initialize(s);root.CivilTerritory.initialize(s);
    for(const n of s.neighbors||[]){
      if(!n.development){
        n.development={version:1,serial:0,planning:0,pending:0,autoBuild:true,initialPopulation:n.population,initialEconomy:n.economy,last:{},runs:0};
        n.stability??=72;n.taxRate??=.08;
        n.currency??=n.cities.some(c=>c.population>=180)&&n.technology>=35;
        n.storage={base:Object.fromEntries(L().resources.map(r=>[r.id,Math.max(r.base,n.resources[r.id]||0)])),lost:{}};
      }
      E().urbanState(n,s);
      for(const c of n.cities||[])if(!c.assets){
        c.assets=root.CivilTerritory.inheritedAssets(s,c,c.id);c.assetVersion=1;
      }
      n.storage ||= {base:{},lost:{}};n.storage.base ||= {};n.storage.lost ||= {};
      for(const r of L().resources)n.storage.base[r.id]??=Math.max(r.base,n.resources[r.id]||0);
    }
  }
  function housing(c){const defs=definitions();return (c.assets||[]).reduce((v,b)=>v+(b.status==='complete'?(b.housingOverride??(defs.get(b.type)?.housing||0)*(b.size||1)):0),0);}
  function capacity(n,key){const defs=definitions();return (n.storage?.base[key]||L().resources.find(r=>r.id===key)?.base||0)+complete(n).reduce((v,b)=>v+((defs.get(b.type)?.storage||0)+(b.type==='warehouse'?1500:0)+(key==='food'&&b.type==='granary'?2000:0))*(b.size||1),0);}
  function room(n,key){return Math.max(0,capacity(n,key)-(n.resources[key]||0));}
  function canBuild(n,c,d){
    if(!d||n.population<(d.requiredPopulation||0)||c.population<(d.requiredCityPopulation||0)||n.technology<(d.requiredKnowledge||0))return false;
    if(d.requiredIndustry&&!n.industrialized)return false;
    if(root.CivilStatecraft.currencyShare(n)<.9&&(d.requiresCurrency||d.cost?.treasury))return false;
    const finished=complete(n);return (d.requiredBuildings||[]).every(id=>finished.some(b=>b.type===id));
  }
  function plot(s,n,c,d){
    const all=[...s.buildings,...s.neighbors.flatMap(assets)],defs=definitions(),mineral=M()?.mapping[d.id];
    for(let i=0;i<96;i++){
      const sector=d.housing?Math.PI:d.foodRate?Math.PI/2:d.category==='civic'?-Math.PI/2:0;const a=n.urbanism?.enacted&&!['path','road'].includes(d.id)?sector+((i+n.development.serial*7)*2.399963%1.5)-.75:(i+n.development.serial*7)*2.399963,r=40+(i*31%Math.max(60,Math.min(490,(c.radius||220)+200)-40)),p={x:c.x+Math.cos(a)*r,y:c.y+Math.sin(a)*r},t=sample(s,p);
      if(p.x<25||p.y<25||p.x>4070||p.y>4070||t.water||d.location==='river'&&t.river>140)continue;
      if(s.settlements.some(h=>Math.hypot(h.x-p.x,h.y-p.y)<600)||s.neighbors.some(q=>q!==n&&q.cities.some(h=>Math.hypot(h.x-p.x,h.y-p.y)<(h.radius||220)+30)))continue;
      if(mineral){const deposit=M().site(s,mineral,p.x,p.y);if(!deposit||M().remaining(s,deposit)<=0)continue;}
      if(d.id==='lumber'&&E().forestRemaining(s,p.x,p.y)<12)continue;
      if(all.some(b=>E().buildingsOverlap({type:d.id,...p,size:1},b))||[s,...s.neighbors].some(n=>n.urbanism?.jobs?.some(j=>j.phase==='demolition'&&E().buildingsOverlap({type:d.id,...p,size:1},{type:j.type,size:j.size,...j.position}))))continue;
      return p;
    }return null;
  }
  function build(s,n,c,type){
    const d=definitions().get(type);if(!canBuild(n,c,d))return false;
    const p=plot(s,n,c,d);if(!p)return false;
    const proxy={...s,currency:{adopted:n.currency},economy:{...s.economy,priceIndex:1}};
    const cost=E().constructionCosts(proxy,d,1,p.x,p.y);
    if(Object.entries(cost).some(([k,v])=>(n.resources[k]||0)<v))return false;
    for(const[k,v]of Object.entries(cost))n.resources[k]-=v;
    c.assets.push({id:`foreign-${n.id}-${++n.development.serial}`,type,size:1,...p,settlementId:c.id,automatic:true,status:'building',progress:0,started:s.elapsed,years:d.years*(sample(s,p).buildCost||1),cost});
    c.assetVersion=(c.assetVersion||0)+1;return true;
  }
  function plan(s,n){
    if(n.currency&&n.resources.treasury<n.population*.02&&s.elapsed-(n.lastMintAt??-20)>=8&&complete(n).some(b=>b.type==='mint')){const metal=['copper','gold','iron'].find(k=>n.resources[k]>=20);if(metal&&root.CivilEconomy.mint(s,metal,20,n).ok)n.lastMintAt=s.elapsed;}
    if(!n.development.autoBuild||assets(n).filter(b=>b.status==='building').length>=Math.min(3,n.cities.length))return;
    const finished=complete(n),has=id=>finished.some(b=>b.type===id),last=n.development.last;
    for(const c of n.cities){
      const debris=(c.assets||[]).find(b=>b.status==='failed');if(debris&&E().demolish(s,debris.id,n.id).ok)return;
      const local=c.assets||[],pending=local.filter(b=>b.status==='building');
      const choices=[];
      if(housing(c)<c.population*1.15)choices.push(['brickhouse','apartment','townhouse','hut']);
      if((last.foodNet||0)<n.population*.03)choices.push(['estate','farm']);
      if(n.resources.wood<n.population*.15||!has('lumber'))choices.push(['lumber']);
      if(n.resources.stone<n.population||!has('quarry'))choices.push(['quarry']);
      if(L().resources.some(r=>n.resources[r.id]>capacity(n,r.id)*.9))choices.push(['warehouse','storehouse']);
      choices.push(['council'],['granary'],['windmill'],['workshop'],['market'],['school'],['forge'],['weaving'],['ironmine'],['toolworks'],['academy'],['factory']);
      for(const types of choices)for(const type of types){
        const essential=['hut','townhouse','apartment','brickhouse','estate','farm','lumber','quarry','warehouse','storehouse'].includes(type);
        if(pending.some(b=>types.includes(b.type))||!essential&&has(type))continue;
        if(build(s,n,c,type))return;
      }
    }
  }
  function bounds(s,n,dt,pace){
    for(const c of n.cities){const radius=c.radius||145;
      const home=Math.min(...s.settlements.map(p=>Math.hypot(c.x-p.x,c.y-p.y)-600));
      const others=Math.min(10000,...s.neighbors.filter(q=>q!==n).flatMap(q=>q.cities.map(v=>Math.hypot(c.x-v.x,c.y-v.y)-(v.radius||220)-35)));
      c.radius=Math.min(Math.max(radius,Math.min(c===n.cities[0]?380:250,home,others)),radius+(n.growth?.territory||0)*dt*pace);
    }
    root.CivilTerritory.normalize(n);
  }
  function step(s,n,dt){
    root.CivilStatecraft.economicPolicyTick(n,dt);
    const d=n.development,defs=definitions(),war=s.warfare?.wars.find(w=>w.nationId===n.id),interstate=Object.values(s.statecraft?.relations||{}).some(r=>r.war&&(r.a===n.id||r.b===n.id)),pace=(war||interstate)?.35:1;
    n.military ||= {soldiers:war?.enemySoldiers??n.population*.01,productionLaw:n.currency?'professional':'militia'};
    const targetRatio=Math.min(.1,n.military.ratio??(war?.06:.01)),recruits=Math.max(0,n.population*targetRatio-(war?.enemySoldiers??n.military.soldiers))*.3*dt*(n.development.last.supply??1);if(war)war.enemySoldiers=Math.min(n.population,war.enemySoldiers+recruits);else n.military.soldiers=Math.min(n.population,n.military.soldiers+recruits);
    const buildings=assets(n),finished=buildings.filter(b=>b.status==='complete'),soldiers=Math.min(n.population,war?.enemySoldiers??n.military?.soldiers??n.population*.01);
    const labor=clamp((n.population*.54-soldiers*(n.military?.productionLaw==='militia'?.35:1)-buildings.filter(b=>b.status==='building').length*2)/Math.max(12,n.population*.54,buildings.length*2),0,1);
    const disorder=clamp((n.stability-15)/40,.35,1),work=labor*disorder*(1-root.CivilEconomy.distress(n)*.3)*(n.rebellionUntil>s.elapsed?.65:1),tool=E().technologySummary(n).production;
    const capacities=Object.fromEntries(L().resources.map(r=>[r.id,capacity(n,r.id)])),space=k=>Math.max(0,capacities[k]-n.resources[k]);
    const gross={},used={},add=(k,v)=>{v=Math.max(0,Math.min(v,space(k)));n.resources[k]+=v;gross[k]=(gross[k]||0)+v/dt;return v;};
    const use=(k,v)=>{const paid=Math.min(n.resources[k]||0,Math.max(0,v));n.resources[k]-=paid;used[k]=(used[k]||0)+paid/dt;return paid;};
    const foodBefore=n.resources.food;
    add('food',(15*clamp(n.population/36,0,1)+n.population*.065)*work*tool*dt);
    add('wood',4.4*clamp(n.population/36,0,1)*work*tool*dt);
    let knowledge=0,market=0;
    for(const b of finished){const def=defs.get(b.type);if(!def)continue;const size=b.size||1,factor=size*work*tool*dt,t=sample(s,b);
      if(def.foodRate)add('food',def.foodRate*factor*(b.outputMultiplier||1)*(['farm','estate'].includes(b.type)?t.foodFactor||1:1));
      if(def.woodRate){let v=Math.min(space('wood'),def.woodRate*factor);if(b.type==='lumber')v=E().harvest(s,b.x,b.y,v);add('wood',v);}
      if(def.stoneRate){let v=Math.min(space('stone'),def.stoneRate*factor*(b.type==='quarry'?M().factor(s,b):1));if(b.type==='quarry')v=M().take(s,b,v,true);add('stone',v);}
      knowledge+=(def.knowledgeRate||0)*size*work;market+=(def.treasuryRate||0)*size*work;
    }
    for(const b of finished){const def=defs.get(b.type);if(!def?.output)continue;let factor=(b.size||1)*work*dt*E().technologySummary(n).production;
      const mine=M().mapping[b.type];if(mine){const deposit=M().depositFor(s,b);factor*=deposit?.quality||0;for(const v of Object.values(def.output))factor=Math.min(factor,deposit?M().remaining(s,deposit)/v:0);}
      for(const[k,v]of Object.entries(def.input||{}))factor=Math.min(factor,n.resources[k]/v);
      for(const[k,v]of Object.entries(def.output))factor=Math.min(factor,space(k)/v);
      for(const[k,v]of Object.entries(def.input||{}))use(k,v*factor);
      for(const[k,v]of Object.entries(def.output))add(k,mine?M().take(s,b,v*factor,true):v*factor);
    }
    const need=n.population*.3*dt,paid=use('food',need),satisfaction=need?paid/need:1;
    for(const[k,rate]of [['tools',n.population*.0003],['cloth',n.population*.0006],['medicine',n.population*.00008],['coal',finished.filter(b=>b.type==='factory').reduce((v,b)=>v+2*(b.size||1),0)]])use(k,rate*dt);
    let supply=1;const active=!!war||interstate;
    for(const[k,rate]of [['food',soldiers*(active?.55:.17)],['iron',soldiers*(active?.035:.012)],['wood',soldiers*(active?.12:.025)],['treasury',n.currency?soldiers*(active?.35:.1)*root.CivilStatecraft.currencyShare(n):0]])if(rate>0){let amount=use(k,rate*dt);if(k==='iron')amount+=use('copper',Math.max(0,rate*dt-amount));supply=Math.min(supply,k==='treasury'?1-root.CivilStatecraft.currencyShare(n)+root.CivilStatecraft.currencyShare(n)*amount/(rate*dt):amount/(rate*dt));}
    if(war){war.enemySupply=supply;war.enemySoldiers=Math.min(war.enemySoldiers,n.population);if(supply<.5)war.enemySoldiers=Math.max(0,war.enemySoldiers*(1-.1*dt));}
    const old=n.population;if(war)war.enemySoldiers=Math.min(war.enemySoldiers,n.population);
    for(const c of n.cities){
      const foodFactor=n.resources.food>n.population*.4?1:.2;
      c.population=Math.max(0,c.population+E().populationChange(c.population,housing(c),satisfaction,foodFactor,dt,0,pace));
    }
    bounds(s,n,dt,pace);
    const previousEconomy=n.economy,target=d.initialEconomy*n.population/Math.max(1,d.initialPopulation)*(1+Math.min(.5,n.technology/1000))*E().technologySummary(n).gdp*work*satisfaction*(n.strategy&&root.CivilStatecraft.currencyShare(n)>=.6?Math.max(.8,Math.min(1.1,1+(n.strategy.credit-.35)*.12-(n.strategy.interest-.04)*.5)):1);
    n.economy=Math.max(0,n.economy+(target-n.economy)*(1-Math.exp(-dt/5)));
    if(n.currency)n.resources.treasury=Math.min(9999999,n.resources.treasury+(market+n.population*(n.taxRate||0)*.1)*root.CivilStatecraft.currencyShare(n)*work*satisfaction*dt);
    n.technology=Math.max(0,n.technology+Math.min(knowledge,n.growth.technology)*dt*pace*satisfaction);
    n.industrialized=n.cities.some(c=>c.population>=10000)&&finished.some(b=>b.type==='factory');
    if(!n.currency&&n.technology>=35&&n.cities.some(c=>c.population>=180)&&finished.some(b=>b.type==='market')){n.currency=true;n.currencyTransition={adopted:true,transition:true,coverage:0,effectiveYears:0};}root.CivilStatecraft.currencyTick(n,dt);

    for(const b of buildings.filter(b=>b.status==='building')){b.progress=Math.min(100,b.progress+dt/Math.max(.1,b.years)*100*(1-root.CivilEconomy.distress(n)*.6)*(b.automatic===false?1:E().automaticConstruction.speed)*work*satisfaction);if(b.progress>=100){b.status='complete';const c=n.cities.find(c=>c.id===b.settlementId);if(c)c.assetVersion=(c.assetVersion||0)+1;}}
    for(const r of L().resources){const excess=Math.max(0,n.resources[r.id]-capacities[r.id]);if(excess){n.resources[r.id]-=excess;n.storage.lost[r.id]=(n.storage.lost[r.id]||0)+excess;}n.production[r.id]=gross[r.id]||0;}
    n.foodStock=n.resources.food;
    E().demolitionTick(s,n,dt);
    E().prosperityTrust(n,dt,72-(1-satisfaction)*45-(war?15:0),{relaxation:1/8,currency:n.currency,foodSatisfied:satisfaction>=.999,housed:n.cities.every(c=>c.population<=housing(c)),war:!!war});
    d.last={gross,used,foodNet:(n.resources.food-foodBefore)/dt,foodSatisfaction:satisfaction,workforce:work,supply,housing:n.cities.reduce((v,c)=>v+housing(c),0),populationGrowth:old?(n.population/old-1)/dt:0,economyGrowth:previousEconomy?(n.economy/previousEconomy-1)/dt:0};d.runs++;
    n.military ||= {soldiers:soldiers,productionLaw:'professional'};n.military.supply=supply;n.military.soldiers=war?war.enemySoldiers:Math.min(n.population,n.military.soldiers);const healthTarget=Math.max(.35,Math.min(1,satisfaction*disorder*(1-soldiers/Math.max(1,n.population)*.8)));n.monetaryPressure=Math.max(0,(n.monetaryPressure||0)*Math.exp(-dt/8));n.economicHealth=(n.economicHealth??1)+(Math.max(.35,healthTarget-Math.min(.4,(n.monetaryPressure||0)*.05))-(n.economicHealth??1))*(1-Math.exp(-dt/4));root.CivilEconomy.distressTick(s,n,dt);
    d.planning+=dt;if(d.planning>=E().automaticConstruction.interval){d.planning%=E().automaticConstruction.interval;E().urbanTick(s,n,E().automaticConstruction.interval);plan(s,n);}
  }
  function advance(s,dt){initialize(s);for(const n of s.neighbors){const d=n.development;d.pending=(d.pending||0)+Math.max(0,dt);while(d.pending+1e-8>=.05){step(s,n,.05);d.pending=Math.max(0,d.pending-.05);}}}
  // Wall-clock timing stays outside saves; only unprocessed simulation time persists.
  function schedule(s,{now=0,frameMs=16.7,workMs=0,force=false}={}){
    let r=runtimes.get(s);if(!r){r={last:now,interval:1000,frame:16.7,work:0,cost:0,healthy:0};runtimes.set(s,r);}
    r.frame=r.frame*.94+clamp(frameMs,0,250)*.06;r.work=r.work*.94+clamp(workMs,0,250)*.06;
    const pressure=Math.max((r.frame-20)/30,(r.work-8)/12,r.cost/8);
    const wanted=clamp(1000+Math.max(0,pressure)*1000,1000,5000);
    if(wanted>r.interval+150){r.interval=Math.min(5000,wanted);r.healthy=0;}else if(wanted<r.interval-300){r.healthy++;if(r.healthy>=120){r.interval=Math.max(1000,r.interval-250);r.healthy=0;}}
    if(!force&&now-r.last<r.interval)return false;
    r.last=now;const dt=s.simulation?.foreignPending||0;if(dt<=1e-8)return false;
    const start=root.performance?.now?.()||0;advance(s,dt);s.simulation.foreignPending=0;
    r.cost=r.cost*.7+Math.max(0,(root.performance?.now?.()||start)-start)*.3;
    s.simulation.runs.foreignDevelopment=(s.simulation.runs.foreignDevelopment||0)+1;return true;
  }
  function timing(s){const r=runtimes.get(s);return {intervalMs:r?.interval||1000,pendingYears:s.simulation?.foreignPending||0,lastCostMs:r?.cost||0};}
  root.CivilNations={demolish:(s,n,id)=>E().demolish(s,id,n.id),initialize,advance,schedule,timing,housing,capacity,canBuild,build,plan};
})(typeof window!=='undefined'?window:globalThis);
