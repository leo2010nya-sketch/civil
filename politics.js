(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a)),approach=(v,t,dt,tau)=>v+(t-v)*(1-Math.exp(-dt/tau));
  function initialize(s){
    s.unrest ||= {version:1,regions:{},noble:{refusing:false,pressure:0,recovery:0},history:[]};
    s.unrest.regions ||= {};s.unrest.noble ||= {refusing:false,pressure:0,recovery:0};s.unrest.history ||= [];
    for(const c of s.settlements||[])s.unrest.regions[c.id] ||= {discontent:clamp(100-s.stability,0,100),strike:false,revolt:false,strikePressure:0,revoltPressure:0,secessionPressure:0,recovery:0,reliefUntil:0,talksUntil:0,autonomyUntil:0};
    return s.unrest;
  }
  function local(s,id){return s.unrest?.regions?.[id];}
  function labor(s,id){const r=local(s,id);if(!r)return 1;return r.revolt?.35:r.strike?.65:1;}
  function compliance(s,id,executor='administration'){
    const r=local(s,id),n=s.unrest?.noble,elite=n?.refusing&&executor!=='community'?1-clamp((s.nobles?.influence||0)/100*.45,0,.45):1;
    return (r?.revolt?.3:r?.strike?.75:1)*(r?.autonomyUntil>s.elapsed?.9:1)*elite;
  }
  function average(s,fn){return (s.settlements||[]).reduce((n,c)=>n+fn(s,c.id)*c.population,0)/Math.max(1,s.population);}
  function summary(s){
    initialize(s);return {discontent:average(s,(s,id)=>local(s,id).discontent),laborFactor:average(s,labor),compliance:average(s,compliance),nobleRefusal:s.unrest.noble.refusing,
      regions:s.settlements.map(c=>({...local(s,c.id),id:c.id,name:c.name,x:c.x,y:c.y,population:c.population,actions:actionOptions(s,c),capital:c.id===s.settlements[0].id,laborFactor:labor(s,c.id),compliance:compliance(s,c.id)})),history:s.unrest.history};
  }
  function notify(s,title,body,c,major=false){const item={title,body,time:s.year,regionId:c?.id};s.unrest.history.unshift(item);s.unrest.history.length=Math.min(40,s.unrest.history.length);
    root.CivilEngine.notify(s,'news',title,body,{priority:major?'major':'minor',unrest:true,settlementId:c?.id,x:c?.x,y:c?.y,dedupe:'unrest:'+title+':'+(c?.id||'nobles')+':'+Math.floor(s.elapsed/8)});
  }
  function actionOptions(s,c){const money=root.CivilStatecraft.currencyShare(s)>=.6;return [
    {id:'relief',name:'地方救济',cost:{food:Math.ceil(Math.max(15,c.population*.1))},until:'reliefUntil',drawback:'耗用公共储粮，缓解八年生活压力。'},
    {id:'talks',name:'地方协商',cost:money?{treasury:Math.ceil(Math.max(12,c.population*.007))}:{food:12,wood:8},until:'talksUntil',drawback:'需组织支出，六年内降低地方对立。'},
    ...(c.id!==s.settlements[0].id?[{id:'autonomy',name:'约定地方自治',cost:money?{treasury:Math.ceil(Math.max(20,c.population*.012))}:{food:20,wood:20},until:'autonomyUntil',drawback:'十八年内缓解分离压力，地方征收与政令效力让步 10%。'}]:[])];}
  function action(s,id,type){
    initialize(s);const c=s.settlements.find(c=>c.id===id),r=local(s,id);if(!c||!r)return {ok:false,message:'地区已不属于本国。'};
    const choices=Object.fromEntries(actionOptions(s,c).map(o=>[o.id,o.cost]));
    const cost=choices[type];if(!cost||type==='autonomy'&&c.id===s.settlements[0].id)return {ok:false,message:'当前不能执行这一地方安排。'};
    if(r[type==='relief'?'reliefUntil':type==='talks'?'talksUntil':'autonomyUntil']>s.elapsed)return {ok:false,message:'该项安排仍在执行。'};
    if(Object.entries(cost).some(([k,v])=>s.resources[k]<v))return {ok:false,message:'公共储备不足。'};
    for(const[k,v]of Object.entries(cost))s.resources[k]-=v;
    if(type==='relief'){r.reliefUntil=s.elapsed+8;r.discontent=Math.max(0,r.discontent-12);}
    if(type==='talks'){r.talksUntil=s.elapsed+6;r.discontent=Math.max(0,r.discontent-7);}
    if(type==='autonomy'){r.autonomyUntil=s.elapsed+18;r.discontent=Math.max(0,r.discontent-15);r.secessionPressure=Math.max(0,r.secessionPressure-3);}
    return {ok:true,message:{relief:'地方救济已开始',talks:'地方协商已开始',autonomy:'地方自治约定已生效，征税与政令执行将有所让步'}[type]};
  }
  function tick(s,dt){
    initialize(s);if(!dt)return;
    const tax=root.CivilSociety.taxQuote(s),housing=root.CivilEngine.regionalHousing(s),w=s.warfare||{},job=s.currency?.adopted?s.economy?.unemployment||.05:.05;
    const foodShort=clamp(1-s.resources.food/Math.max(1,s.population*.3),0,1);
    for(const c of [...s.settlements]){
      const r=local(s,c.id),culture=s.culture?.regions[c.id],crowding=clamp(c.population/Math.max(1,housing[c.id])-1,0,1);
      const grievances=[['政府信任不足',(100-s.stability)*.68],['税负',tax.burden*32],['食物不足',foodShort*27],['失业',Math.max(0,job-.06)*75],['住房紧张',crowding*35],['厌战',(w.weariness||0)*.25],['地方疏离',Math.max(0,62-(culture?.cohesion??70))*.4],['新领地整合',Math.max(0,(c.integrationUntil||0)-s.elapsed)/25*12]];
      const mitigation=(r.reliefUntil>s.elapsed?25:0)+(r.talksUntil>s.elapsed?12:0)+(r.autonomyUntil>s.elapsed?18:0);
      r.target=clamp(grievances.reduce((n,[,v])=>n+v,0)-mitigation,0,100);r.reasons=grievances.filter(([,v])=>v>=5).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,v])=>({name,value:v}));
      r.discontent=approach(r.discontent,r.target,dt,4);
      r.strikePressure=r.discontent>=55?r.strikePressure+dt:Math.max(0,r.strikePressure-dt*2);
      r.revoltPressure=r.discontent>=75?r.revoltPressure+dt:Math.max(0,r.revoltPressure-dt*2);
      if(!r.strike&&r.strikePressure>=2&&c.population>=50){r.strike=true;notify(s,c.name+'出现停工与罢工','居民中止部分劳动，地区生产与施工下降。可协商、救济并调整税负和供给。',c);}
      if(!r.revolt&&r.revoltPressure>=3&&c.population>=50){r.revolt=true;notify(s,c.name+'发生内乱','生产、税收与政令执行严重受阻，冲突也会造成人口损失。持续失控可能导致地方分离。',c,true);}
      if(r.revolt){const losses=Math.min(c.population,c.population*.002*dt);c.population-=losses;s.population-=losses;}
      r.recovery=r.discontent<45?r.recovery+dt:0;
      if((r.strike||r.revolt)&&r.recovery>=3){r.strike=r.revolt=false;r.strikePressure=r.revoltPressure=0;notify(s,c.name+'恢复秩序','停工与地方冲突已缓解，生产和公共事务恢复。',c);}
      const separable=s.settlements.length>1&&c.id!==s.settlements[0].id&&c.population>=500;
      r.secessionPressure=separable&&r.revolt&&r.discontent>=88?r.secessionPressure+dt:Math.max(0,r.secessionPressure-dt*1.5);
      if(r.secessionPressure>=9&&s.settlements.length>1&&c.id!==s.settlements[0].id&&c.population>=500){
        const result=root.CivilTerritory.releaseCity(s,c.id);if(result.ok)notify(s,c.name+'宣布独立','长期地方危机未能缓解，城市、居民与当地设施已脱离本国，成为可交涉的新势力。',c,true);
      }
    }
    const n=s.nobles,o=s.unrest.noble;
    o.pressure=n?.established&&n.influence>=25&&n.support<28?o.pressure+dt:Math.max(0,o.pressure-dt);
    if(!o.refusing&&o.pressure>=2){o.refusing=true;o.recovery=0;notify(s,'贵族拒绝执行命令','领地贵族拒绝配合政令、部分征税与征召。改善支持、确认权责或重新协商可恢复协助。',null,true);}
    o.recovery=o.refusing&&(!n?.established||n.influence<15||n.support>=48)?o.recovery+dt:0;
    if(o.refusing&&o.recovery>=3){o.refusing=false;o.pressure=0;notify(s,'贵族恢复配合','贵族与政府重新建立合作，征收、征召和地方执行恢复。',null);}
    s.population=s.settlements.reduce((n,c)=>n+c.population,0);
  }
  root.CivilPolitics={initialize,tick,summary,action,actionOptions,labor,compliance,average};
})(typeof window!=='undefined'?window:globalThis);
