(function(root){
  'use strict';
  const E=root.CivilEngine,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const groups=[{id:'workers',name:'劳动者联合会'},{id:'business',name:'工商联合会'},{id:'local',name:'地方议会'},{id:'security',name:'安全委员会'}];
  function initialize(s){return s.governance ||= {version:1,nextLetter:2,nextEvent:4,lastPlanning:-8,letters:[],serial:0,groups:Object.fromEntries(groups.map(g=>[g.id,65])),stance:{housing:50,industry:50,diplomacy:65,security:35},delegating:false};}
  function setup(s){
    const g=initialize(s),target=115000+Math.floor(E.random(s)*45000),factor=target/s.population;
    s.startEra='modern';s.era='modern';s.industrialized=true;s.knowledge=360;s.admin=75;s.productivity=85;s.stage='现代经济社会';
    s.currency={adopted:true,inherited:true,introducedAt:0};
    for(const c of s.settlements){c.population=Math.round(c.population*factor);c.level=3;c.territoryRadius=520;}
    s.population=s.settlements.reduce((v,c)=>v+c.population,0);
    // Existing urban blocks represent multi-family buildings, never invisible population capacity.
    for(const c of s.settlements){const homes=s.buildings.filter(b=>b.settlementId===c.id&&b.type==='townhouse');for(const b of homes){b.type='brickhouse';b.housingOverride=Math.ceil(c.population*1.15/Math.max(1,homes.length));}
      const fields=s.buildings.filter(b=>b.settlementId===c.id&&b.type==='estate'),fertility=fields.reduce((v,b)=>v+(root.CivilTerrain.sample(b.x,b.y,s.seed,s.geographyVersion).foodFactor||1),0);for(const b of fields)b.outputMultiplier=c.population*.44/Math.max(1,fertility*220);
    }
    const replace={manor:'factory',castle:'hospital',school:'publicschool',path:'road',forge:'machineworks'};
    for(const b of s.buildings)if(replace[b.type]){const candidate={...b,type:replace[b.type]};if(!s.buildings.some(o=>o!==b&&E.buildingsOverlap(candidate,o)))b.type=candidate.type;}
    // Upgrade compatible footprints; search spare land for essential modern services.
    for(const type of ['factory','bank','publicschool','hospital','taxoffice','steamplant','sewer'])if(!s.buildings.some(b=>b.type===type)){
      const c=s.settlements[0];for(let i=0;i<2000;i++){const a=i*2.399963,r=40+i*19%470,b={id:'modern-'+(++s.buildingSerial),type,x:c.x+Math.cos(a)*r,y:c.y+Math.sin(a)*r,size:1,status:'complete',progress:100,settlementId:c.id};if(b.x<30||b.y<30||b.x>4066||b.y>4066||root.CivilTerrain.sample(b.x,b.y,s.seed,s.geographyVersion).water||E.occupiedBuildings(s).some(o=>E.buildingsOverlap(b,o)))continue;s.buildings.push(b);break;}}
    s.resources={...s.resources,food:s.population*3,wood:s.population*.8,stone:s.population*.8,treasury:s.population*2,iron:10000,coal:10000,tools:5000,cloth:5000,medicine:2000};
    s.storage ||= {};s.storage.base={...s.storage.base,...Object.fromEntries(Object.entries(s.resources).map(([k,v])=>[k,v*1.3]))};
    s.taxation.rates={poll:.02,land:.05,domestic:.01,customs:.03,vat:.08};s.taxation.exemptNobles=false;
    s.nobles={established:false,influence:0,support:50,landShare:0,privilege:'limited'};
    s.automation={enabled:true,tasks:{housing:true,food:true,wood:true,stone:true,storage:true,roads:true,civic:true,production:true,commerce:true,defense:true},lastCheck:-10,projects:0,recent:[]};
    s.warfare={level:'levy',soldiers:Math.floor(s.population*.015),weariness:0,supply:1,wars:[],history:[]};
    
    letter(s,'local','城市与机构已接手日常建设','请通过住房、产业、安全与合作取向影响机构选择；预算和税制仍由你调整。',null);
  }
  function letter(s,id,title,body,request){const g=initialize(s),item={id:'letter-'+(++g.serial),group:id,title,body,request,time:s.year,resolved:false};g.letters.unshift(item);g.letters.length=Math.min(60,g.letters.length);E.notify(s,'news',groups.find(q=>q.id===id).name+'来信 · '+title,body,{letterId:item.id,dedupe:item.id});return item;}
  function setDirection(s,key,value){if(s.startMode!=='governance'||!Object.hasOwn(initialize(s).stance,key)||!Number.isFinite(value))return {ok:false,message:'无效政策取向'};s.governance.stance[key]=clamp(value,0,100);return {ok:true,message:'政策取向已调整，机构将逐步响应'};}
  function respond(s,id,accept){const g=initialize(s),l=g.letters.find(l=>l.id===id);if(!l||l.resolved||!l.request)return {ok:false,message:'信件已处理'};const cost=l.request.cost;if(accept&&s.resources.treasury<cost)return {ok:false,message:'财政不足'};l.resolved=true;if(accept){s.resources.treasury-=cost;g.groups[l.group]=clamp(g.groups[l.group]+12,0,100);if(l.request.key)g.stance[l.request.key]=clamp(g.stance[l.request.key]+l.request.change,0,100);s.stability=clamp(s.stability+2,0,99);}else{g.groups[l.group]=clamp(g.groups[l.group]-9,0,100);s.stability=Math.max(15,s.stability-2);}return {ok:true,message:accept?'拨款与政策承诺已记录':'已回信保留现行政策'};}
  function tick(s,dt){const g=initialize(s),q=E.economySummary(s),p=g.stance;
    for(const group of groups){const targets={workers:75-q.unemployment*140+(s.budget.welfare-30)*.3,business:65+(q.confidence-70)*.4-(s.taxation.rates.vat||0)*65,local:55+(s.budget.construction-30)*.4,security:45+p.security*.4};g.groups[group.id]+=(clamp(targets[group.id],5,95)-g.groups[group.id])*(1-Math.exp(-dt/3));}
    for(const l of g.letters)if(l.request&&!l.resolved&&s.elapsed-l.time>8){l.resolved=true;l.expired=true;g.groups[l.group]=Math.max(0,g.groups[l.group]-12);}
    const pressure=Object.values(g.groups).reduce((v,x)=>v+Math.max(0,45-x),0);s.stability=clamp(s.stability-pressure*.012*dt,15,99);
    if(s.elapsed>=g.nextLetter){g.nextLetter=s.elapsed+3+E.random(s)*4;const group=groups[Math.floor(E.random(s)*groups.length)],requests={workers:['生活与住房保障','就业和住房压力正在影响家庭。希望增加住房与生活保障投入。','housing',12],business:['产业投资预期','企业希望扩大产业供给；新增投资也可能加重财政和资源压力。','industry',12],local:['地方公共服务','地方议会请求修缮住宅与公共设施。','housing',8],security:['安全预算审议','安全委员会要求增加防务支出。扩军可能挤压民用经济并加剧邻国戒心。','security',12]},r=requests[group.id];letter(s,group.id,r[0],r[1],{key:r[2],change:r[3],cost:Math.round(q.realGDP*.005)});}
    if(s.elapsed-g.lastPlanning>=2){g.lastPlanning=s.elapsed;g.delegating=true;try{
      s.automation.enabled=true;Object.assign(s.automation.tasks,{housing:p.housing>25,food:true,storage:true,civic:s.budget.welfare>25,production:p.industry>30,commerce:p.industry>45,defense:p.security>65});
      // Decisions choose actual projects, pay actual costs, and obey shared placement rules.
      if(q.activity<.65&&s.resources.treasury<s.population*.2){const idle=s.buildings.find(b=>b.status==='complete'&&['factory','machineworks'].includes(b.type));if(idle){const r=E.demolish(s,idle.id);if(r.ok)letter(s,'business','企业退出与厂房清退','长期需求不足与财政紧缩促使一处生产设施退出，材料将回收，产能随之减少。',null);}}
      const plans=s.buildings.filter(b=>b.status==='building').length<4?E.automationPlan(s):[];for(const plan of plans.slice(0,8)){const city=s.settlements.find(c=>c.id===plan.settlementId)||s.settlements.find(c=>c.name===plan.city)||s.settlements[0];let built=false;for(let i=0;i<70;i++){const a=i*2.399963,r=80+i*23%410;const result=E.build(s,plan.type,city.x+Math.cos(a)*r,city.y+Math.sin(a)*r,1);if(result.ok){built=true;break;}}if(built)break;}
      const n=s.neighbors.length?s.neighbors[Math.floor(E.random(s)*s.neighbors.length)]:null;if(n){if(p.diplomacy>55&&n.tension>25)E.foreignAction(s,n.id,'envoy');else if(p.diplomacy>60&&!n.tradeOpen)E.foreignAction(s,n.id,'trade');else if(p.security>75&&p.diplomacy<25&&n.tension>65&&!s.warfare.wars.length)E.declareWar(s,n.id,{type:'security'});}
      for(const w of [...s.warfare.wars]){if(!w.goalChosen){w.goal={type:'security'};w.goalChosen=true;}if(s.elapsed-w.started>2)E.negotiate(s,w.nationId,'ceasefire');}
      if(n&&n.tradeOpen&&p.diplomacy>40){const imports={},exports={};if(s.resources.food<s.population)imports.food=Math.min(500,n.population*.015);if(s.resources.iron<1000)imports.iron=10;if(s.resources.wood>s.population*.4)exports.wood=30;if(s.resources.stone>s.population*.4)exports.stone=30;E.configureTrade(s,n.id,{imports,exports});}
      const desired=p.security>65?'army':p.security>20?'levy':'none';if(s.warfare.level!==desired)E.mobilize(s,desired);
    }finally{g.delegating=false;}}
    if(s.elapsed>=g.nextEvent){g.nextEvent=s.elapsed+3+E.random(s)*6;const roll=Math.floor(E.random(s)*5),cost=Math.min(s.resources.treasury,q.realGDP*.01);
      if(roll===0){s.resources.treasury-=cost;s.economy.confidence=Math.max(10,s.economy.confidence-5);letter(s,'business','金融市场波动','融资预期走弱，财政承担紧急担保支出 '+Math.round(cost)+'；信心下降 5。',null);}
      if(roll===1){s.economy.confidence=Math.min(95,s.economy.confidence+5);s.productivity=Math.min(200,s.productivity+1);letter(s,'business','新工艺扩散','民间工艺传播提高生产效率，市场信心回升。',null);}
      if(roll===2){const b=s.buildings.filter(b=>b.status==='complete'&&b.type!=='fire');if(b.length){const asset=b[Math.floor(E.random(s)*b.length)];asset.status='building';asset.progress=45;asset.years=3;asset.cost={};letter(s,'local','设施停用检修','一处设施因老化暂停服务，修缮约需三年；当地住房或生产能力暂时下降。',null);}}
      if(roll===3){s.resources.food*=.97;letter(s,'workers','供应链中断','运输事故损失了 3% 的公共粮食储备，地区呼吁重视粮食安全。',null);}
      if(roll===4){const n=s.neighbors[Math.floor(E.random(s)*s.neighbors.length)];if(n){n.tension=clamp(n.tension+(p.diplomacy<40?6:-3),0,100);letter(s,'security','边境局势变化','邻国对当前经济与安全取向作出反应，边境紧张发生变化。',null);}}
    }
  }
  // Enforce restrictions at the public API as well as in the interface.
  for(const key of ['build','demolish','settle','setAutomation','enactPlanning','foreignAction','configureTrade','mobilize','declareWar','negotiate','setWarGoal','annex','respondHostile','explore','cancelExpedition']){const original=E[key];E[key]=function(s,...args){if(s.startMode==='governance'&&!initialize(s).delegating)return {ok:false,message:'执政模式中，此事务由机构根据政策自主处理。'};return original(s,...args);};}
  root.CivilGovernance={setup,initialize,tick,setDirection,respond,groups};
})(typeof window!=='undefined'?window:globalThis);
