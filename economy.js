(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a)),count=(s,t)=>s.buildings.reduce((n,b)=>n+(b.type===t&&b.status==='complete'?(b.size||1):0),0);
  const approach=(v,t,dt,tau)=>v+(t-v)*(1-Math.exp(-dt/tau));
  function initialize(s){
    s.economy ||= {version:1,policy:{spending:.1,interest:.04,credit:.35},debt:0,priceIndex:1,inflation:.02,unemployment:.05,confidence:70,activity:1,creditRatio:.25,overheat:0,slump:0,crisis:null,history:[],lastHistory:-1,lastCrisis:-20,totals:{spending:0,interest:0,borrowed:0,repaid:0},last:{}};
    return s.economy;
  }
  function distress(owner){const activity=owner.buildings?(owner.economy?.activity??1):(owner.economicHealth??1);return clamp((.85-activity)/.5,0,1);}
  function distressTick(s,owner,dt){const d=distress(owner);if(!d)return;root.CivilWarfare.civilianLoss(owner,owner.population*d*.015*dt);owner.stability=clamp(owner.stability-d*3*dt,0,100);owner.recessionPressure=(owner.recessionPressure||0)+d*dt;
    if(owner.recessionPressure>5&&(root.CivilEngine.random(s)<.03*d*dt)){owner.recessionPressure=0;owner.rebellionUntil=s.elapsed+5;owner.stability=Math.max(0,owner.stability-8);if(owner===s)root.CivilEngine.notify(s,'failure','衰退引发骚乱','失业和生活困境导致停工与冲突。',{priority:'major',dedupe:'recession-revolt:'+Math.floor(s.elapsed/5)});}
  }
  function mint(s,metal,amount,owner=s){
    const assets=owner.buildings||(owner.cities||[]).flatMap(c=>c.assets||[]),currency=root.CivilStatecraft.currencyShare(owner)>=.9;
    if(!currency||!assets.some(b=>b.type==='mint'&&b.status==='complete'))return {ok:false,message:'需要货币制度与已建成铸币所'};
    if(!['copper','gold','iron'].includes(metal)||!Number.isFinite(amount)||amount<=0||(owner.resources[metal]||0)<amount)return {ok:false,message:'金属储备不足或数量无效'};
    const value=amount*({gold:80,copper:12,iron:8}[metal]);owner.resources[metal]-=amount;owner.resources.treasury+=value;
    const pressure=value/Math.max(100,owner===s?quote(s).realGDP:owner.economy);owner.monetaryPressure=(owner.monetaryPressure||0)+pressure;
    if(owner===s){const e=initialize(s);e.priceIndex*=1+Math.min(2,pressure*.15);e.inflation=clamp(e.inflation+pressure*.08,-.08,2);e.confidence=Math.max(10,e.confidence-Math.min(30,pressure*5));}else owner.economicHealth=Math.max(.35,(owner.economicHealth??1)-Math.min(.4,pressure*.05));
    return {ok:true,message:'铸造 '+Math.round(value)+' 货币；货币扩张增加物价与信心压力'};
  }
  function enabled(s){return root.CivilStatecraft.currencyShare(s)>=.6&&s.cityFounded;}
  function quote(s){
    const e=initialize(s),p=e.policy,pop=Math.max(0,s.population),potential=(root.CivilEngine?.technologySummary(s).gdp||1)*pop*(.7+Math.min(.7,s.productivity/250)+Math.min(.6,s.knowledge/600)),burden=root.CivilSociety?.taxQuote(s)?.burden||0;
    const foodCover=s.resources.food/Math.max(1,pop*.3),supplyShock=clamp((.75-foodCover)/.75,0,1)*.2+(s.warfare?.wars?.length? .1:0);
    const consumption=potential*clamp(.67*e.activity*(1-burden*.3)+(e.confidence-70)*.0015-(e.inflation-.02)*.6,.3,.8);
    const investment=potential*clamp(.255+(p.credit-.35)*.18-(p.interest-.04)*1.8+(e.confidence-70)*.001+(count(s,'bank')? .025:0),.015,.4)*(e.crisis?.type==='credit'?.55:1);
    const government=potential*p.spending*(e.fundingRatio??1),foreign=root.CivilLogistics?.foreignSummary(s)||{};
    const tradeValue=(s.neighbors||[]).reduce((n,c)=>n+(c.tradeLast?.exportValue||0)-(c.tradeLast?.importValue||0),0);
    const netExports=clamp(tradeValue,-potential*.3,potential*.3),demand=consumption+investment+government+netExports;
    const gap=potential?clamp(demand/potential-1,-.65,.35):0;
    const realGDP=potential*clamp(e.activity,.35,1.12),rate=realGDP/Math.max(1,potential);
    const borrowingCost=p.interest+Math.max(0,e.debt/Math.max(1,realGDP)-.6)*.04;
    return {enabled:enabled(s),outputGap:potential?realGDP/potential-1:0,potentialGDP:potential,realGDP,nominalGDP:realGDP*e.priceIndex,consumption,investment,government,netExports,demand,gap,supplyShock,unemployment:e.unemployment,inflation:e.inflation,priceIndex:e.priceIndex,confidence:e.confidence,debt:e.debt,debtRatio:e.debt/Math.max(1,realGDP),creditRatio:e.creditRatio,interest:borrowingCost,activity:rate,crisis:e.crisis,policy:{...p},spendingRate:potential*p.spending*.02,interestRate:e.debt*borrowingCost,history:e.history,last:e.last,totals:e.totals,multiplier:1/Math.max(.3,1-.67*(1-burden*.3))};
  }
  function setPolicy(s,key,value){
    const e=initialize(s);if(!enabled(s))return {ok:false,message:'货币与城市形成后开放经济政策。'};
    if(!['spending','interest','credit'].includes(key)||!Number.isFinite(value))return {ok:false,message:'无效经济安排。'};
    if(['interest','credit'].includes(key)&&!count(s,'bank'))return {ok:false,message:'银行建立后开放信贷与利率安排。'};
    const ranges={spending:[0,s.startMode==='governance'?.5:.3],interest:[s.startMode==='governance'?0:.005,s.startMode==='governance'?.3:.18],credit:[0,1]};if(value<ranges[key][0]||value>ranges[key][1])return {ok:false,message:'安排超出范围。'};
    s.policyTransitions||={};s.policyTransitions[key]={from:e.policy[key],to:value,age:0};return {ok:true,message:'经济安排已调整，需求与价格将逐步反应'};
  }
  function debtAction(s,action){
    const e=initialize(s),q=quote(s);if(!enabled(s))return {ok:false,message:'尚未形成货币财政。'};
    const amount=Math.max(10,q.realGDP*.04);
    if(action==='borrow'){if(q.debtRatio>=1.5)return {ok:false,message:'债务过高，暂时无法筹资。'};e.debt+=amount;s.resources.treasury+=amount;e.totals.borrowed+=amount;return {ok:true,message:`借入 ${Math.round(amount)}，需持续付息`};}
    if(action==='repay'){const paid=Math.min(amount,e.debt,s.resources.treasury);if(paid<=0)return {ok:false,message:'无可偿还债务或国库不足。'};e.debt-=paid;s.resources.treasury-=paid;e.totals.repaid+=paid;return {ok:true,message:`偿还 ${Math.round(paid)}`};}
    return {ok:false,message:'无效安排。'};
  }
  function startCrisis(s,type,title,body){const e=s.economy;if(e.crisis||s.elapsed-e.lastCrisis<8)return;e.crisis={type,title,started:s.elapsed,recovery:0};e.confidence=Math.max(20,e.confidence-12);e.lastCrisis=s.elapsed;
    if(type==='credit')e.creditRatio*=.75;
    root.CivilEngine.notify(s,'news',title,body,{priority:'major',economicCrisis:true,dedupe:'crisis:'+type+':'+Math.floor(s.elapsed)});
  }
  function tick(s,dt){
    const e=initialize(s);if(!enabled(s))return;root.CivilStatecraft.economicPolicyTick(s,dt);const q=quote(s),p=e.policy;
    // National accounts are aggregate flows, not additional money in treasury.
    const activityTarget=clamp(1+q.gap-q.supplyShock-Math.max(0,(s.warfare?.soldiers||0)/Math.max(1,s.population)-.12)*.8-(e.crisis?.type==='credit'?.12:0),.4,1.1);
    e.activity=approach(e.activity,activityTarget,dt,3);
    e.unemployment=approach(e.unemployment,clamp(.05+(1-e.activity)*.45,.025,.35),dt,2);
    s.monetaryPressure=Math.max(0,(s.monetaryPressure||0)*Math.exp(-dt/8));
    const inflationTarget=clamp(.02+(s.monetaryPressure||0)*.06+q.gap*.22+q.supplyShock*.5+(e.creditRatio>.85?.04:0),-.08,.25);
    e.inflation=approach(e.inflation,inflationTarget,dt,3);e.priceIndex=clamp(e.priceIndex*Math.exp(e.inflation*dt),.1,20);
    e.creditRatio=approach(e.creditRatio,clamp(.15+p.credit*.9-(p.interest-.04)*3,.05,1.5),dt,5);
    e.confidence=approach(e.confidence,clamp(72+q.gap*35-e.unemployment*45-(e.crisis?10:0),20,90),dt,5);
    const spend=q.spendingRate*dt,interest=q.interestRate*dt,need=spend+interest,paid=Math.min(s.resources.treasury,need);s.resources.treasury-=paid;
    const paidShare=need?paid/need:1,unpaid=need-paid;e.fundingRatio=paidShare;
    // Interest arrears capitalize; a failed operating budget reduces stimulus.
    e.debt+=unpaid*(interest/Math.max(.001,need));
    if(paidShare<.5){e.activity=Math.max(.35,e.activity-.015*dt);e.confidence=Math.max(20,e.confidence-2*dt);}
    e.totals.spending+=spend*paidShare;e.totals.interest+=interest*paidShare;e.last={spending:spend*paidShare/dt,interest:interest*paidShare/dt,unfunded:unpaid/dt};
    e.slump=q.gap<-.12?e.slump+dt:Math.max(0,e.slump-dt*2);
    e.overheat=e.creditRatio>.8&&p.interest<.035?e.overheat+dt:Math.max(0,e.overheat-dt);
    if(e.overheat>=3)startCrisis(s,'credit','信贷危机','宽松信贷与低利率推高杠杆，借贷收缩开始抑制投资。降低信用扩张、维持基本支出并控制债务可帮助恢复。');
    else if(e.slump>=3)startCrisis(s,'demand','需求衰退','消费与投资不足，产能闲置、失业上升。公共支出和减轻税负可支撑需求，但需承担财政成本。');
    else if(q.supplyShock>.16&&e.inflation>.06)startCrisis(s,'supply','供给危机','粮食或战争冲击压低产出并推高物价。改善供给和贸易可缓解；单纯扩大需求可能加重通胀。');
    else if(q.debtRatio>1&&paidShare<.5)startCrisis(s,'debt','财政债务危机','债务和利息挤压财政，公共安排难以兑现。调整支出、改善税基或偿还债务将影响恢复。');
    if(e.crisis){const recovered=e.crisis.type==='credit'?e.creditRatio<.7&&p.interest>=.035:e.crisis.type==='supply'?q.supplyShock<.08:e.crisis.type==='debt'?q.debtRatio<.8&&paidShare>.8:q.gap>-.07;
      e.crisis.recovery=Math.max(0,e.crisis.recovery+(recovered?dt:-dt));if(e.crisis.recovery>=3){const title=e.crisis.title;e.crisis=null;e.slump=0;e.overheat=0;e.lastCrisis=s.elapsed;root.CivilEngine.notify(s,'milestone','经济逐步复苏',title+'的主要压力已缓解，就业和信心仍需时间恢复。',{priority:'major',economicCrisis:true,dedupe:'recovery:'+s.elapsed});}}
    if(s.elapsed-e.lastHistory>=1){e.lastHistory=s.elapsed;e.history.push({year:s.year,gdp:q.realGDP,inflation:e.inflation,unemployment:e.unemployment,gap:q.gap});if(e.history.length>80)e.history.shift();}
  }
  function price(s,key,base){if(!enabled(s))return base;const e=initialize(s);return base*e.priceIndex*(key==='food'?1+quote(s).supplyShock:.95+e.activity*.05);}
  root.CivilEconomy={initialize,distress,distressTick,mint,enabled,quote,setPolicy,debtAction,tick,price};
})(typeof window!=='undefined'?window:globalThis);
