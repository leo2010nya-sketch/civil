(function(root){
  'use strict';
  const KEY='civil.saves.v2',BACKUP=KEY+'.backup',ARCHIVE=KEY+'.original';
  function decode(raw){
    const value=JSON.parse(raw);
    if(Array.isArray(value))return value;
    if(Array.isArray(value?.slots))return value.slots;
    if(Array.isArray(value?.saves))return value.saves;
    if(value?.state)return [value];
    if(value?.buildings&&value?.settlements)return [{id:value.id,state:value,savedAt:0}];
    throw Error('存档格式无法识别，原始数据已保留。');
  }
  function readable(slot){return !!slot?.state&&Array.isArray(slot.state.buildings)&&Array.isArray(slot.state.settlements)&&slot.state.settlements.length>0;}
  function read(storage=root.localStorage){
    let raw;try{raw=storage.getItem(KEY);}catch(e){return {slots:[],issues:['浏览器未允许读取本地存档。'],blocked:true};}
    if(raw===null)return {slots:[],issues:[],blocked:false};
    try{
      const all=decode(raw),slots=all.filter(readable).map((s,i)=>({...s,id:s.id||s.state.id||'recovered-'+i})).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
      return {slots,issues:all.length>slots.length?[`${all.length-slots.length} 个存档格式异常，原始记录已保留。`]:[],blocked:false};
    }catch(e){
      try{const slots=decode(storage.getItem(BACKUP)||'[]').filter(readable);return {slots,issues:['主存档读取异常，已展示上一次备份。请先导出或恢复备份。'],blocked:true,source:'backup'};}
      catch(_){return {slots:[],issues:['存档读取异常，原始数据未删除。可导出原始数据或导入备份恢复。'],blocked:true};}
    }
  }
  function writeSlot(slot,storage=root.localStorage){
    const raw=storage.getItem(KEY),all=raw===null?[]:decode(raw);
    const next=[slot,...all.filter(s=>(s?.id||s?.state?.id)!==slot.id)];
    checkpoint(raw,storage);
    storage.setItem(KEY,JSON.stringify(next));return read(storage);
  }
  function checkpoint(raw,storage){
    if(raw===null)return;
    // Retain one original archive and one previous successful write. Failure aborts the write.
    if(storage.getItem(ARCHIVE)===null)storage.setItem(ARCHIVE,raw);
    storage.setItem(BACKUP,raw);
  }
  function remove(id,storage=root.localStorage){const raw=storage.getItem(KEY);const all=decode(raw||'[]');checkpoint(raw,storage);storage.setItem(KEY,JSON.stringify(all.filter(s=>(s?.id||s?.state?.id)!==id)));return read(storage);}
  function importText(text,storage=root.localStorage){
    const incoming=decode(text);if(!incoming.length||incoming.some(s=>!readable(s)))throw Error('文件中存在无法识别的存档，尚未写入。');
    const raw=storage.getItem(KEY);let all=[];
    try{all=decode(raw||'[]');}catch(_){if(raw!==null)storage.setItem(KEY+'.damaged.'+Date.now(),raw);}
    const ids=new Set(incoming.map(s=>s.id||s.state.id));const next=[...incoming,...all.filter(s=>!ids.has(s?.id||s?.state?.id))];
    checkpoint(raw===null?null:JSON.stringify(all),storage);storage.setItem(KEY,JSON.stringify(next));return read(storage);
  }
  function restore(storage=root.localStorage){const raw=storage.getItem(BACKUP);if(!raw)throw Error('没有可用的本地备份。');return importText(raw,storage);}
  function exportText(storage=root.localStorage){return storage.getItem(KEY)||'[]';}
  root.CivilStorage={KEY,BACKUP,ARCHIVE,read,writeSlot,remove,importText,restore,exportText,readable};
})(typeof window!=='undefined'?window:globalThis);
