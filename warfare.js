(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
  const goals=[{id:'security',name:'边境安全',description:'稳定边境并结束冲突。'},{id:'commerce',name:'商业通行',description:'争取二十年贸易安排，对方对本国出口关税最高 2%。'},{id:'territory',name:'取得领土',description:'要求转移一座目标城市，需要更明显的战局优势。'}];
  const levels=[{id:'none',name:'解散',fraction:0},{id:'levy',name:'地方征召',fraction:.025},{id:'army',name:'常备动员',fraction:.065},{id:'mass',name:'全面动员',fraction:.1}];
  let hooks={};
  const currency=s=>root.CivilStatecraft.currencyShare(s)>0;
  const faction=s=>root.CivilSociety?.cultureSummary(s)?.warSupport??s.stability;
  function initialize(s){
    s.warfare ||= {level:'none',soldiers:0,weariness:0,supply:1,wars:[],history:[]};
    const w=s.warfare;if(w.level==='total'||w.level==='mass'){w.level='mass';w.soldiers=Math.min(w.soldiers,s.population*.1);}if(w.level==='custom'&&w.ratio>.1)w.ratio=.1;w.totals ||= {food:0,wood:0,treasury:0,losses:0,enemyLosses:0,battles:0};w.wars ||= [];w.history ||= [];w.supply??=1;w.productionLaw??='professional';w.totals.iron??=0;w.totals.copper??=0;w.weariness??=0;
    if(w.level!=='custom'&&!levels.some(l=>l.id===w.level))w.level='none';
    w.soldiers=clamp(w.soldiers||0,0,s.population);
    for(const n of s.neighbors||[]){n.truceUntil??=0;n.foodStock??=n.population*3;n.warExhaustion??=0;}
    for(const war of w.wars){war.goal ||= {type:'security'};war.enemyGoal ||= {type:'security'};war.goalChosen ??= true;}
    return w;
  }
  function support(s){return clamp(s.stability*.65+faction(s)*.35-initialize(s).weariness*.45,5,100);}
  function target(s){const fraction=initialize(s).level==='custom'?s.warfare.ratio:levels.find(l=>l.id===s.warfare.level)?.fraction||0;return fraction?Math.max(s.population>=1?1:0,Math.floor(s.population*fraction*(s.unrest?.noble.refusing?1-(s.nobles?.influence||0)*.005:1))):0;}
  function costs(s){
    const w=initialize(s),active=w.wars.length>0;
    const fronts=1+Math.max(0,w.wars.length-1)*.35;
    const recruiting=Math.max(0,target(s)-w.soldiers)*.3;
    return {ironCost:w.soldiers*(active?.035:.012),foodCost:w.soldiers*(active?.55*fronts:.17)+recruiting*.12,woodCost:w.soldiers*(active?.12*fronts:.025)+recruiting*.03,treasuryCost:currency(s)?(w.soldiers*(active?.35*fronts:.1)+recruiting*.05)*root.CivilStatecraft.currencyShare(s):0};
  }
  function alliedSupport(s,war){
    if(war.aggressor)return 0;
    return Math.min(.3,(s.neighbors||[]).filter(n=>n.id!==war.nationId&&n.militaryAlliance?.until>s.elapsed&&!isEnemy(s,n)&&n.resources?.food>n.population*.5).reduce((v,n)=>v+Math.min(.15,n.population/Math.max(1,s.population)*.06),0));
  }
  function isEnemy(s,n){return s.warfare?.wars.some(w=>w.nationId===n.id);}
  function probability(s,war){
    const w=initialize(s),n=s.neighbors.find(n=>n.id===war.nationId);
    if(!n)return .5;
    if(w.soldiers<1)return 0;
    if(war.enemySoldiers<1)return 1;
    const tech=1+Math.log1p(Math.max(0,s.knowledge))/5+(s.industrialized?.55:0);
    const enemyTech=1+Math.log1p(Math.max(0,n.technology??110))/5;
    const defense=war.aggressor?0:(hooks.defenseAt?.(s,n.x,n.y)||0)/180;
    const force=Math.sqrt((w.soldiers/Math.max(1,w.wars.length)+15)/(war.enemySoldiers+15));
    return clamp(.5+Math.log(force*tech*(root.CivilEngine?.technologySummary(s).combat||1)/(enemyTech*(root.CivilEngine?.technologySummary(n).combat||1)))*.24+(support(s)-55)/260+(w.supply-.8)*.25-((war.enemySupply??.8)-.8)*.25+defense+(w.productionLaw==='militia'?-.06:0)+(n.military?.productionLaw==='militia'?.06:0)+alliedSupport(s,war),.07,.93);
  }
  function goalLabel(s,goal,n){const d=goals.find(g=>g.id===goal?.type);const c=(n?.cities||s.settlements||[]).find(c=>c.id===goal?.cityId);return (d?.name||'边境安全')+(c?' · '+c.name:'');}
  function validateGoal(s,n,input){const goal=typeof input==='string'?{type:input}:input||{type:'security'};if(!goals.some(g=>g.id===goal.type))return null;if(goal.type==='territory'&&!n.cities?.some(c=>c.id===goal.cityId))return null;return {type:goal.type,...(goal.type==='territory'?{cityId:goal.cityId}:{})};}
  function setWarGoal(s,id,input){const war=initialize(s).wars.find(w=>w.nationId===id),n=s.neighbors.find(n=>n.id===id);if(!war||!n||war.aggressor||war.goalChosen||war.lastBattle)return {ok:false,message:'本场战争目标已确定。'};const goal=validateGoal(s,n,input);if(!goal)return {ok:false,message:'请选择有效战争目标与城市。'};war.goal=goal;war.goalChosen=true;return {ok:true,message:'应战目标已确定'};}
  function objective(s,n,goal,winner){
    if(goal.type==='territory'){
      if(winner==='player')return root.CivilTerritory.acquireCities(s,n,[goal.cityId],'战争领土条约');
      return root.CivilTerritory.releaseCity(s,goal.cityId,n,'war');
    }
    if(goal.type==='commerce'){n.commercialTreaty={beneficiary:winner,until:s.elapsed+20};n.tradeOpen=true;n.embargo=false;n.relation=Math.max(55,n.relation);n.tension=Math.min(25,n.tension);return {ok:true,message:'二十年商业条约已生效'};}
    n.tension=Math.min(20,n.tension);return {ok:true,message:'边境安全约定已生效'};
  }
  function offers(s,war){
    const n=s.neighbors.find(n=>n.id===war.nationId),years=s.elapsed-war.started;
    const payment={food:Math.ceil(Math.max(20,s.population)),...(currency(s)?{treasury:Math.ceil(s.population*.025)}:{})};
    const goal=war.goal||{type:'security'},valid=goal.type!=='territory'||n?.cities.some(c=>c.id===goal.cityId);
    const required=goal.type==='territory'?40:goal.type==='commerce'?20:15;
    return [{id:'objective',name:'落实目标：'+goalLabel(s,goal,n),accepted:valid&&war.score>=required,cost:{},drawback:goal.type==='territory'?'转移目标城市与当地人口和设施，随后需要整合。':goal.type==='commerce'?'开放商路并降低对方对本国出口的关税，上限 2%，持续二十年。':'以条约稳定边境，保留双方现有领土。'}, {id:'ceasefire',name:'互相停战',accepted:war.score>=8||years>=6||war.enemySoldiers<20,cost:{},drawback:'双方停止交战，十二年内不再开战。'},
      {id:'reparations',name:'赔偿议和',accepted:true,cost:payment,drawback:'支付赔偿换取停战，已承受的伤亡和厌战不会消失。'},
      {id:'concession',name:'要求补偿',accepted:war.score>=25,cost:{},drawback:`对方需接受战况；补偿来自其现有粮食储备。${n?.name||''}`}];
  }
  function summary(s){
    const w=initialize(s),c=costs(s);
    return {goals,totals:{...w.totals},history:w.history,level:w.level,levels:levels.filter(l=>l.id!=='army'||s.buildings.some(b=>b.type==='barracks'&&b.status==='complete')),soldiers:Math.floor(w.soldiers),available:s.population>=1&&s.settlements.length>0,maxSoldiers:target(s),support:support(s),weariness:w.weariness,supply:w.supply,...c,productionLaw:w.productionLaw,mobilizationRatio:target(s)/Math.max(1,s.population),laborPenalty:clamp(w.soldiers/Math.max(1,s.population*.54)*(w.productionLaw==='militia'?.35:1),0,1),
      wars:w.wars.map(war=>({...war,goalLabel:goalLabel(s,war.goal,s.neighbors.find(n=>n.id===war.nationId)),enemyGoalLabel:goalLabel(s,war.enemyGoal),targets:s.neighbors.find(n=>n.id===war.nationId)?.cities||[],name:s.neighbors.find(n=>n.id===war.nationId)?.name||'邻国',probability:probability(s,war),offers:offers(s,war)}))};
  }
  function mobilize(s,level){
    const w=initialize(s),option=summary(s).levels.find(l=>l.id===level);
    if(!summary(s).available||!option)return {ok:false,message:'当前不能执行这项动员。'};
    if(level==='none'&&w.wars.length)return {ok:false,message:'需要先结束战争。'};
    if(level===w.level)return {ok:true,message:'动员安排保持不变'};
    const raising=option.fraction>(levels.find(l=>l.id===w.level)?.fraction||0),food=raising?Math.ceil(s.population*option.fraction*.1):0;
    if(s.resources.food<food)return {ok:false,message:`需要 ${food} 粮食来组织征召。`};
    s.resources.food-=food;w.totals.food+=food;w.level=level;
    if(raising)w.soldiers=Math.max(w.soldiers,Math.min(target(s),Math.max(1,target(s)*.35)));else w.soldiers=Math.min(w.soldiers,target(s));
    return {ok:true,message:level==='none'?'部队已解散':'已征召首批士兵，其余人员逐步集结'};
  }
  function begin(s,n,aggressor,goal={type:'security'}){
    const w=initialize(s);
    if(!aggressor&&w.level==='none'){w.level='levy';w.soldiers=Math.min(target(s)*.3,s.population*.01);}
    const frontier=s.settlements.slice(1).sort((a,b)=>Math.hypot(a.x-n.x,a.y-n.y)-Math.hypot(b.x-n.x,b.y-n.y))[0];
    const territorial=!aggressor&&frontier&&root.CivilTerrain.hash(n.x,n.y,s.seed+9901)>.4;
    const enemyGoal=territorial?{type:'territory',cityId:frontier.id}:!aggressor?{type:'commerce'}:{type:'security'};
    w.wars.push({goal,goalChosen:aggressor,enemyGoal,nationId:n.id,started:s.elapsed,score:0,enemySoldiers:Math.floor(n.population*.045),aggressor,nextBattle:s.elapsed+2,lastBattle:null,losses:0,enemyLosses:0,costs:{food:0,wood:0,treasury:0}});
    n.commercialAlliance=null;n.militaryAlliance=null;n.tradeOpen=false;n.tradeLast={imported:0,exported:0,tariff:0};n.relation=0;n.tension=100;
    hooks.event?.(s,'failure',aggressor?`向${n.name}宣战`:`${n.name}发动战争`,'本国目标：'+goalLabel(s,goal,n)+'；对方目标：'+goalLabel(s,enemyGoal)+'。边境贸易已中断，军队持续消耗补给，战斗自动结算。',{nationId:n.id,warDeclaration:true,dedupe:`war:${n.id}:${s.elapsed}`});
  }
  function declareWar(s,id,input){
    const w=initialize(s),n=s.neighbors.find(n=>n.id===id);
    if(!n||!summary(s).available)return {ok:false,message:'尚不能向这个国家宣战。'};
    if(w.wars.some(w=>w.nationId===id))return {ok:false,message:'已经处于战争中。'};
    if(n.pactUntil>s.elapsed||n.truceUntil>s.elapsed)return {ok:false,message:'双方仍有有效的和平约定。'};
    if(w.soldiers<1)return {ok:false,message:'请先组织动员。'};
    const goal=validateGoal(s,n,input);if(!goal)return {ok:false,message:'请选择有效的战争目标与城市。'};
    begin(s,n,true,goal);return {ok:true,message:'战争已经开始'};
  }
  function end(s,war,terms){
    const w=initialize(s),n=s.neighbors.find(n=>n.id===war.nationId);
    n.truceUntil=s.elapsed+12;n.pactUntil=0;n.tension=35;n.relation=30;n.warExhaustion=clamp(n.warExhaustion+20,0,100);
    w.history.unshift({nationId:n.id,name:n.name,started:war.started,ended:s.elapsed,score:war.score,goal:{...war.goal},enemyGoal:{...war.enemyGoal},terms,losses:war.losses||0,enemyLosses:war.enemyLosses||0,civilianLosses:war.civilianLosses||0,enemyCivilianLosses:war.enemyCivilianLosses||0,costs:{...war.costs}});w.history.length=Math.min(12,w.history.length);
    w.wars=w.wars.filter(x=>x!==war);
    hooks.event?.(s,'milestone',`与${n.name}停战`,`${terms}。双方签订十二年停战约定；部队需要另行解散。`,{nationId:n.id,dedupe:`peace:${n.id}:${s.elapsed}`});
  }
  function negotiate(s,id,offer='ceasefire'){
    const war=initialize(s).wars.find(w=>w.nationId===id);
    if(!war)return {ok:false,message:'双方当前没有战争。'};
    const option=offers(s,war).find(o=>o.id===offer);
    if(!option?.accepted)return {ok:false,message:'对方尚不接受这一条件。'};
    if(Object.entries(option.cost).some(([k,v])=>s.resources[k]<v))return {ok:false,message:'没有足够的赔偿物资。'};
    for(const [k,v] of Object.entries(option.cost))s.resources[k]-=v;
    if(war.score>=25){const target=s.neighbors.find(n=>n.id===id);if(target)target.defeatedUntil=s.elapsed+35;}
    if(offer==='concession'){
      const n=s.neighbors.find(n=>n.id===id),payment=Math.min(n.foodStock,Math.ceil(s.population*.14));
      n.foodStock-=payment;if(n.resources)n.resources.food=n.foodStock;s.resources.food+=payment;
    }
    const n=s.neighbors.find(n=>n.id===id);end(s,war,option.name);
    if(offer==='objective')objective(s,n,war.goal,'player');
    return {ok:true,message:'停战约定已生效'};
  }
  function civilianLoss(owner,loss){
    const population=owner.population,cities=owner.settlements||owner.cities||[],soldiers=owner.warfare?.soldiers||owner.military?.soldiers||0,actual=Math.min(Math.max(0,population-soldiers),Math.max(0,loss));
    owner.population=Math.max(0,population-actual);for(const c of cities)c.population*=owner.population/Math.max(1,population);return actual;
  }
  function setProductionLaw(s,law){if(!['militia','professional'].includes(law))return {ok:false,message:'无效军役法律'};initialize(s).productionLaw=law;return {ok:true,message:law==='militia'?'军民合役：士兵参与部分生产，战斗效率降低':'脱产军役：士兵专职服役'};}
  function setMobilization(s,ratio){if(!Number.isFinite(ratio)||ratio<0||ratio>.1)return {ok:false,message:'比例需在 0–10% 之间'};const w=initialize(s);w.level=ratio?'custom':'none';w.ratio=ratio;return {ok:true,message:'动员目标已调整，兵员逐步集结'};}
  function casualties(s,loss){
    const w=initialize(s),actual=Math.min(w.soldiers,s.population,Math.max(0,loss));
    const old=s.population;s.population-=actual;w.soldiers-=actual;
    s.settlements.forEach(r=>r.population*=s.population/Math.max(1,old));return actual;
  }
  function attackMotive(s,n){const ratio=s.warfare?.soldiers/Math.max(1,s.population),weak=s.stability<40||root.CivilEconomy.distress(s)>.6||s.resources.food<s.population*.15,threat=ratio>=.08||s.warfare?.wars.some(w=>w.aggressor)||n.embargo;return weak||threat;}
  function tick(s,dt){
    const w=initialize(s),active=w.wars.length>0,c=costs(s);
    let supplied=1;
    for(const [resource,rate] of [['food',c.foodCost],['wood',c.woodCost],['iron',c.ironCost],['treasury',c.treasuryCost]]){
      if(rate<=0)continue;const need=rate*dt;let paid=Math.min(s.resources[resource]||0,need),substitute=0;if(resource==='iron'){const copper=Math.min(s.resources.copper||0,need-paid);s.resources.copper-=copper;paid+=copper;substitute=copper;w.totals.copper+=copper;} s.resources[resource]=Math.max(0,(s.resources[resource]||0)-(paid-substitute));w.totals[resource]=(w.totals[resource]||0)+(paid-substitute);for(const war of w.wars){war.costs||={food:0,wood:0,treasury:0};war.costs[resource]=(war.costs[resource]||0)+paid/w.wars.length;}supplied=Math.min(supplied,resource==='treasury'?1-root.CivilStatecraft.currencyShare(s)+root.CivilStatecraft.currencyShare(s)*paid/need:paid/need);
    }
    w.supply=clamp(supplied,0,1);
    const goal=target(s),recruits=Math.max(0,goal-w.soldiers)*.3*dt*w.supply;
    w.soldiers=clamp(w.soldiers+recruits,0,Math.min(goal,s.population));
    if(supplied<.5)w.soldiers=Math.max(0,w.soldiers-w.soldiers*.1*dt);
    w.weariness=clamp(w.weariness+(active?.7+(1-supplied)*2:-1.2)*dt,0,100);
    for(const war of [...w.wars]){
      const n=s.neighbors.find(n=>n.id===war.nationId);if(!n){w.wars=w.wars.filter(x=>x!==war);continue;}
      n.warExhaustion=clamp(n.warExhaustion+.9*dt,0,100);
      if(s.elapsed<war.nextBattle)continue;
      const chance=probability(s,war),won=hooks.random(s)<chance;
      const engaged=w.soldiers;const civilian=won?civilianLoss(n,Math.min(n.population-war.enemySoldiers,n.population*.003)):civilianLoss(s,s.population*.003);war.civilianLosses=(war.civilianLosses||0)+(won?0:civilian);war.enemyCivilianLosses=(war.enemyCivilianLosses||0)+(won?civilian:0);
      if(!war.aggressor)for(const ally of s.neighbors.filter(a=>a.id!==n.id&&a.militaryAlliance?.until>s.elapsed&&!isEnemy(s,a)&&a.resources?.food>a.population*.5)){const aid=Math.min(ally.resources.food*.01,ally.population*.01);ally.resources.food-=aid;war.alliedFood=(war.alliedFood||0)+aid;}
      const losses=casualties(s,w.soldiers*(won?.025:.065)*(1+hooks.random(s)*.5));
      const enemyLosses=engaged<1?0:Math.min(war.enemySoldiers,engaged*.9,war.enemySoldiers*(won?.08:.03)*(1+hooks.random(s)*.5));
      war.enemySoldiers-=enemyLosses;n.population=Math.max(0,n.population-enemyLosses);for(const city of n.cities||[])city.population=n.population*city.share;
      war.score=clamp(war.score+(won?12:-12),-100,100);war.nextBattle=s.elapsed+2.5+hooks.random(s)*1.5;
      war.losses=(war.losses||0)+losses;war.enemyLosses=(war.enemyLosses||0)+enemyLosses;w.totals.losses+=losses;w.totals.enemyLosses+=enemyLosses;w.totals.battles++;
      war.lastBattle={won,chance,losses,enemyLosses,time:s.elapsed};
      w.weariness=clamp(w.weariness+1+losses/Math.max(1,s.population)*200,0,100);
      hooks.event?.(s,won?'success':'failure',`${n.name}边境战报`,`${won?'取得优势':'遭遇失利'} · 胜算 ${Math.round(chance*100)}% · 阵亡 ${Math.ceil(losses)} 人 · 对方损失 ${Math.ceil(enemyLosses)} 人 · 累计阵亡 ${Math.ceil(war.losses)} 人 · 补给 ${Math.round(w.supply*100)}%`,{nationId:n.id,war:true,dedupe:`battle:${n.id}:${Math.floor(s.elapsed/5)}`});
      if(war.score>=60||war.enemySoldiers<1){const can=offers(s,war).find(o=>o.id==='objective')?.accepted;negotiate(s,n.id,can?'objective':'concession');}
      else if(war.score<=-60||s.population<20){end(s,war,'战场失利后接受对方目标');objective(s,n,war.enemyGoal,'neighbor');}
    }
    for(const n of s.neighbors||[]){
      if(w.wars.some(w=>w.nationId===n.id)||n.truceUntil>s.elapsed||n.pactUntil>s.elapsed)continue;
      if(n.tension>=78&&n.relation<38&&attackMotive(s,n)&&hooks.random(s)<.025*dt)begin(s,n,false);
    }
  }
  root.CivilWarfare={configure(h){hooks=h;},initialize,tick,summary,attackMotive,civilianLoss,setMobilization,setProductionLaw,alliedSupport,mobilize,declareWar,negotiate,setWarGoal,goals,isAtWar:(s,id)=>!!s.warfare?.wars.some(w=>w.nationId===id)};
})(typeof window!=='undefined'?window:globalThis);
