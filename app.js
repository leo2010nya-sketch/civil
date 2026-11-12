(function () {
  'use strict';
  const E = window.CivilEngine;
  const S = window.CivilSociety;
  const $ = (id) => document.getElementById(id);
  const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name==='coin'&&!hasCurrency()?'compass':name}"/></svg>`;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (n, digits = 0) => Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: digits });
  const signed = n => `${n >= 0 ? '+' : ''}${number(n, 1)}`;
  const date = year => `纪元 ${number(Math.max(0,Math.floor(year)))} 年`;
  const resourceNames = { food: '粮食', wood: '木材', stone: '石材', treasury: '公共储备' };
  const resourceIcons = { food: 'food', wood: 'wood', stone: 'stone', treasury: 'coin' };
  for(const r of E.resources){resourceNames[r.id]=r.name;resourceIcons[r.id]=r.icon;}
  const definitionIcons = { house: 'home', sprout: 'food', tree: 'wood', water: 'water', grain: 'food', road: 'compass', hammer: 'build', council: 'policy', stone: 'stone', bridge: 'water', market: 'coin', book: 'report', canal: 'water', forge: 'build', factory: 'industry', health: 'health', power: 'sun', research: 'reform', people: 'people', palisade:'shield',watchtower:'tower',wall:'shield',windmill:'mill',watermill:'mill',warehouse:'warehouse',townhouse:'home',apartment:'apartments',clinic:'health',academy:'report',machineworks:'industry',publicschool:'report',railstation:'rail',steamplant:'industry',estate:'food',defense:'shield',housing:'home',education:'report',storage:'warehouse',transport:'rail',shrine:'culture',temple:'culture',plaza:'people',theater:'culture',printing:'report',museum:'culture',manor:'crown',castle:'tower',guildhall:'build',inn:'home',harbor:'water',fair:'coin',aqueduct:'water',sewer:'water',tram:'rail',taxoffice:'coin',brickhouse:'home',barracks:'war',culture:'culture',crown:'crown',war:'war',bank:'bank',mint:'coin',exchange:'market',postoffice:'post' };
  const hasCurrency = () => E.hasCurrency ? E.hasCurrency(state) : !!state.currency?.adopted;
  const modeName = s => s.startMode === 'city' ? '继承模式' : '开拓模式';
  const civicIcon = d => d.icon === 'market' && !hasCurrency() ? 'compass' : definitionIcons[d.icon] || 'build';
  const civicName = d => d.id==='hut'&&world?.visualEra()!=='village'?'基础民居':d.id==='path'&&world?.visualEra()!=='village'?'基础道路':d.name;
  const civicDescription = d => !hasCurrency()&&d.id==='council'?'建立公共议程，组织公共劳动与制度改革。':!hasCurrency() && ['market', 'trade'].includes(d.id) ? '联结地区，以物资交换满足不同需求。' : d.desc;
  function readableEvent(item) {
    const data=item.data||{},proposal=state.proposals.find(p=>p.id===data.proposalId);
    const clauses=[...(data.clauses||[]),...(proposal?.clauses||[]),...(data.policy?[data.policy]:[])];
    return !clauses.some(id=>{const d=E.policies.find(p=>p.id===id);return d&&!E.available(state,d).ok;})&&!(data.reform==='labor'&&data.choice==='wage'&&!hasCurrency());
  }
  const STORAGE = 'civil.saves.v2',Save=window.CivilStorage;
  let saveStatus={slots:[],issues:[],blocked:false};
  let state = E.create(48271, '溪岸'), inGame = false, playing = false, speed = 1;
  let panel = null, selected = null, selectedProject = null, projectSize = 1, placement = null;
  let buildSearch='';
  let buildAnchor = null, draft = null, reformSelections = {};
  let majorEventVisible=false, eventPreviousFocus=null;
  let activePopup = null, lastUI = 0, lastFrame = 0, lastSave = 0, lastPanelRefresh = 0, dirty = false;
  let guideDismissed = false, lastReadHistory = null, toastTimer, previousFocus, unlockSignature = '';
  let saves = readSaves();
  const syncHUDLayout=()=>document.documentElement.style.setProperty('--hud-bottom',`${Math.ceil($('hud').getBoundingClientRect().bottom)+12}px`);
  if(window.ResizeObserver)new ResizeObserver(syncHUDLayout).observe($('hud'));
  window.addEventListener('resize',syncHUDLayout);

  const world = new window.CivilWorld($('worldMap'), {
    onSelect(selection) {
      if (!inGame) return;
      if(selection.kind==='region')buildAnchor={x:selection.x,y:selection.y};
      if(['hostile','nation'].includes(selection.kind)){selected=selection;panel='hostile';renderPanel();return;}
      if(selection.kind==='expedition'){selected=selection;panel='exploration';renderPanel();return;}
      if(selection.kind==='region'&&selection.explored&&!selection.water){selected=selection;selectedProject=null;panel='build';renderPanel();return;}
      selected = selection; panel = 'selection'; renderPanel();
    },
    onBuild(point) {
      if (!inGame || !placement) return;
      if (!point.valid) { feedback('此处暂不能建设', '请选择已经探索的陆地。桥梁可以跨越河流。'); return; }
      let result;
      if (placement.type === 'settlement') { settlementDialog(point.x,point.y); return; }
      else result = E.build(state, placement.type, point.x, point.y, placement.size);
      if (!result.ok) { feedback('建设尚未开始', result.message); return; }
      cancelPlacement(); changed();
      updateGuide();
    },
    onExplore(point) {
      if (!inGame) return;
      const result = E.explore(state, point.x, point.y);
      if (!result.ok) feedback('探索队尚未出发', result.message);
      else { cancelPlacement(); changed(); panel='exploration';renderPanel();toast(`探索队已出发 · ${number(result.duration,1)} 年`); }
    },
    onViewChange(view) {
      const labels = { world: '世界远景', region: '地区视野', village: '聚落近景' };
      $('mapLevelLabel').textContent = labels[view.level];
      $('scaleLabel').textContent = `${Math.round(65 / view.zoom)} m`;
      document.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', b.dataset.level === view.level));
    }
  });
  world.setState(state);

  function readSaves() {
    saveStatus=Save.read();return saveStatus.slots;
  }
  function persist(silent = false) {
    if (!inGame) return true;
    const slot = { id: state.id, savedAt: Date.now(), state: E.snapshot(state), camera: world.view, speed, guideDismissed };
    try { saveStatus=Save.writeSlot(slot);saves=saveStatus.slots; dirty = false; lastSave = performance.now(); if (!silent) toast('旅程已保存'); return true; }
    catch (_) { if (!silent) feedback('未能保存旅程', '浏览器存储空间不足或存储权限被关闭。当前旅程仍可继续，请暂时保留此页面。'); return false; }
  }
  function renderStart() {
    saves = readSaves();
    const latest = saves[0];
    $('continueButton').classList.toggle('hidden', !latest);
    if (latest) {
      $('continueName').textContent = latest.state.name;
      $('continueMeta').textContent = `${modeName(latest.state)} · ${date(latest.state.year)} · ${number(latest.state.population)} 人`;
    }
    $('saveCount').textContent = String(saves.length);
    let notice=$('saveRecoveryNotice');if(!notice){notice=document.createElement('p');notice.id='saveRecoveryNotice';notice.className='preview-warning';$('startScreen').querySelector('.start-actions').append(notice);}
    notice.textContent=saveStatus.issues.join(' ');notice.classList.toggle('hidden',!notice.textContent);
  }
  function startGame(next, camera, settings = {}) {
    state = E.initialize(next); inGame = true; playing = false; speed = [1,5,12].includes(+settings.speed)?+settings.speed:+settings.speed>12?12:1;
    buildSearch='';buildAnchor=null;draft=null;reformSelections={};
    panel = null; selected = null; activePopup = null; lastReadHistory = state.history[0]?.id;
    guideDismissed = settings.guideDismissed || state.elapsed > 10;
    world.setState(state);
    world.centerOn(camera?.x ?? state.settlements[0].x, camera?.y ?? state.settlements[0].y);
    world.setZoom(camera?.zoom ?? (state.startMode==='city'?.9:1.62));
    cancelPlacement(); closeDialog(); closePanel();
    $('startScreen').classList.add('hidden');
    ['hud', 'mapContext', 'mapControls', 'timeControls'].forEach(id => $(id).classList.remove('hidden'));
    updateGuide();
    $('onboarding').classList.toggle('hidden', guideDismissed);
    const homeTerrain=CivilTerrain.sample(state.settlements[0].x,state.settlements[0].y,state.seed,state.geographyVersion||1);
    $('mapSubtitle').textContent = `${state.name} · ${homeTerrain.biome}`;
    updateHUD(); showNextEvent();
    if (!persist(true)) feedback('自动保存暂不可用', '浏览器未允许保存这段旅程。当前仍可继续游玩，请保留页面，并在浏览器设置中允许本站存储。');
  }
  function continueSlot(id) {
    const slot = saves.find(s => s.id === id);
    if (!slot) return;
    try{
      if(![2,3].includes(slot.state.version))throw Error('当前版本无法识别这份存档的版本');
      startGame(E.snapshot(slot.state), slot.camera, slot);
    }catch(error){
      playing=false;
      showDialog(`<div class="dialog-header"><h2>这份存档暂未加载</h2>${closeButton('dialog')}</div><p class="preview-warning">${escape(error.message)}</p><p>原始存档已保留，其他旅程仍可读取。</p><button id="backToSaveRecovery" class="primary-button wide">返回存档与恢复</button>`);
      $('backToSaveRecovery').onclick=saveDialog;
    }
  }
  function newGameDialog() {
    let mode='village';
    showDialog(`<div class="dialog-header"><div><span class="eyebrow">一段新的来路</span><h2 id="dialogTitle">在此安居</h2></div>${closeButton('dialog')}</div><form id="newGameForm"><div class="start-mode-options" aria-label="开局模式"><button type="button" data-start-mode="village" class="active" aria-pressed="true">${icon('home')}<strong>开拓</strong><span>从第一间屋舍开始</span></button><button type="button" data-start-mode="city" aria-pressed="false">${icon('policy')}<strong>继承</strong><span>治理城市与贵族领地</span></button></div><label for="worldName">聚落之名</label><input id="worldName" type="text" value="溪岸" maxlength="18" autocomplete="off" required><label for="worldSeed">世界种子 <span style="opacity:.5">/ 可留空</span></label><input id="worldSeed" type="number" placeholder="随机生成" min="0" max="2147483646"><div class="start-facts" id="startFacts"></div><button class="primary-button wide" type="submit">启程${icon('arrow')}</button></form>`);
    const facts=()=>{$('startFacts').innerHTML=mode==='city'?`<span>${icon('people')}数千人／城</span><span>${icon('home')}2–5 座城市</span><span>${icon('crown')}贵族领地</span><span>${icon('compass')}2–5 个邻国</span>`:`<span>${icon('people')}36 位村民</span><span>${icon('home')}7 座屋舍</span><span>${icon('compass')}一处河湾</span>`;};facts();
    $('dialog').querySelectorAll('[data-start-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.startMode;$('dialog').querySelectorAll('[data-start-mode]').forEach(o=>{const active=o===b;o.classList.toggle('active',active);o.setAttribute('aria-pressed',active);});facts();});
    $('newGameForm').addEventListener('submit', event => {
      event.preventDefault();
      const seed = $('worldSeed').value.trim();
      startGame(E.create(seed === '' ? Math.floor(Math.random() * 2147483646) : Number(seed), $('worldName').value, mode));
    });
    setTimeout(() => $('worldName')?.select(), 40);
  }
  function saveDialog() {
    saves=readSaves();
    showDialog(`<div class="dialog-header"><div><span class="eyebrow">山河中的足迹</span><h2 id="dialogTitle">旅程存档</h2></div>${closeButton('dialog')}</div>${saves.length ? saves.map(s => `<div class="save-slot"><button data-load="${escape(s.id)}"><strong>${escape(s.state.name)}</strong><small>${date(s.state.year)} · ${number(s.state.population)} 人 · ${escape(s.state.stage)}</small><small>${new Date(s.savedAt).toLocaleString('zh-CN')}</small></button><button class="icon-button danger" data-delete="${escape(s.id)}" title="删除存档" aria-label="删除 ${escape(s.state.name)} 的存档">${icon('close')}</button></div>`).join('') : '<p class="empty-note">还没有旅程。创建一个世界后，会自动保存在当前浏览器。</p>'}`);
    $('dialog').querySelectorAll('[data-load]').forEach(b => b.onclick = () => continueSlot(b.dataset.load));
    $('dialog').querySelectorAll('[data-delete]').forEach(b => b.onclick = () => {
      const id = b.dataset.delete;
      showDialog(`<div class="dialog-header"><h2 id="dialogTitle">告别这段旅程？</h2>${closeButton('dialog')}</div><p class="dialog-subtitle">这个存档将从当前浏览器移除。</p><div class="menu-actions"><button id="confirmDelete" class="danger">删除存档</button><button id="cancelDelete">保留旅程</button></div>`);
      $('cancelDelete').onclick = saveDialog;
      $('confirmDelete').onclick = () => { try { saveStatus=Save.remove(id);saves=saveStatus.slots;saveDialog(); renderStart(); } catch (_) { toast('浏览器未允许修改存储'); } };
    });
    $('dialog').insertAdjacentHTML('beforeend',`<div class="menu-actions"><button id="exportSaves">导出存档</button><button id="importSaves">导入存档</button><button id="restoreLocalBackup">恢复上次备份</button>${location.protocol==='file:'?'<button id="restoreRecoveredSaves">恢复已找回的 3 个存档</button>':''}</div><input id="saveImportFile" type="file" accept="application/json,.json" hidden>${saveStatus.issues.length?`<p class="preview-warning">${escape(saveStatus.issues.join(' '))}</p>`:''}`);
    $('exportSaves').onclick=()=>{try{const blob=new Blob([Save.exportText()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='世脉存档_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast('导出失败：'+e.message);}};
    $('importSaves').onclick=()=>$('saveImportFile').click();
    const imported=()=>{saves=readSaves();renderStart();saveDialog();toast('存档已恢复，原有其他旅程已保留');};
    $('saveImportFile').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{Save.importText(await file.text());imported();}catch(e){toast(e.message);}};
    $('restoreLocalBackup').onclick=()=>{try{Save.restore();imported();}catch(e){toast(e.message);}};
    if($('restoreRecoveredSaves'))$('restoreRecoveredSaves').onclick=()=>{
      const restore=()=>{try{Save.importText(JSON.stringify(window.CivilRecoveredSaves));imported();}catch(e){toast(e.message);}};
      if(window.CivilRecoveredSaves){restore();return;}
      const script=document.createElement('script');script.src='recovery/recovered-saves.js';script.onload=restore;script.onerror=()=>toast('可手动导入 recovery 文件夹中的原始备份。');document.head.append(script);
    };
  }
  function menuDialog() {
    playing = false; updateHUD();
    showDialog(`<div class="dialog-header"><div><span class="eyebrow">${escape(state.stage)}</span><h2 id="dialogTitle">${escape(state.name)}</h2></div>${closeButton('dialog')}</div><p class="dialog-subtitle">${date(state.year)} · ${number(state.population)} 位同行者<br>旅程每 30 秒自动保存一次。</p><div class="menu-actions"><button id="resumeGame">${icon('play')}回到山河</button><button id="saveGame">${icon('save')}保存旅程</button><button id="showSaves">${icon('report')}其他存档</button><button id="returnStart">${icon('home')}保存并返回启动页</button></div><p class="seed-note">世界种子 ${state.seed} · 基准时间：1 小时 = 1 世纪</p>`);
    $('resumeGame').onclick = closeDialog;
    $('saveGame').onclick = () => { persist(); closeDialog(); };
    $('showSaves').onclick = () => { persist(true); saveDialog(); };
    $('returnStart').onclick = () => {
      if (!persist()) return;
      closeDialog(); inGame = false; playing = false; majorEventVisible=false; closePanel(); cancelPlacement();
      ['hud', 'mapContext', 'mapControls', 'timeControls', 'onboarding', 'eventPopup', 'importantEventBackdrop'].forEach(id => $(id).classList.add('hidden'));
      renderStart(); $('startScreen').classList.remove('hidden');
    };
  }
  function showDialog(html) { $('importantEventBackdrop').classList.add('hidden');$('eventPopup').classList.add('hidden');activePopup=null;majorEventVisible=false; previousFocus = document.activeElement; $('dialog').innerHTML = html; $('dialogBackdrop').classList.remove('hidden'); $('dialog').querySelectorAll('[data-close=dialog]').forEach(b => b.onclick = closeDialog); setTimeout(() => $('dialog').querySelector('input,button')?.focus(), 0); }
  function closeDialog() { $('dialogBackdrop').classList.add('hidden'); previousFocus?.focus?.();showNextEvent(); }
  function closeButton(type = 'panel') { return `<button class="icon-button" data-close="${type}" title="关闭" aria-label="关闭">${icon('close')}</button>`; }
  function panelHeader(title) { return `<div class="panel-header"><h2>${title}</h2>${closeButton()}</div>`; }
  function governmentNav(active) {
    const links=[['reform','制度'],['budget',hasCurrency()?'财政':'安排'],['culture','文化'],['unrest','社会']];
    if(S?.nobleOptions(state).length)links.push(['nobles','贵族']);
    return `<nav class="choice-row government-nav" aria-label="政府事务">${links.map(([id,name])=>`<button ${active==='reform'&&id==='budget'?'id="openPublicPlan"':''} data-government="${id}" class="${active===id?'active':''}">${name}</button>`).join('')}</nav>`;
  }
  function bindGovernment(el) { el.querySelectorAll('[data-government]').forEach(b=>b.onclick=()=>{panel=b.dataset.government;renderPanel();}); }
  function actionFeedback(result) { toast(result?.message||(result?.ok?'安排已执行':'暂不能执行'));changed();renderPanel(); }
  function costsHTML(cost) {
    const entries = Object.entries(cost || {}).filter(([key])=>key!=='treasury'||hasCurrency());
    return entries.length ? `<span class="costs">${entries.map(([key, amount]) => `<span class="${state.resources[key] < amount ? 'insufficient' : ''}" title="${resourceNames[key]}">${icon(resourceIcons[key])}${number(amount)}</span>`).join('')}</span>` : '<span class="costs">无需额外储备</span>';
  }
  function updateGuide() {
    const built = state.buildings.some(b => b.started != null && b.id.startsWith('building-'));
    document.querySelector('.guide-mark').textContent = built ? '02' : '01';
    $('guideTitle').textContent = state.startMode==='city'?'打理诸城':built ? '建设已开始' : '第一片土地';
    $('guideText').textContent = state.startMode==='city'?'税务 · 政策 · 委托建设':built ? '▶ 推进时间 · 12× 加速' : '点击土地 → 建设';
  }
  function closePanel() { panel = null; $('detailPanel').classList.add('hidden'); document.querySelectorAll('[data-panel]').forEach(b => b.classList.remove('active')); $('onboarding').classList.toggle('hidden', !inGame || guideDismissed || !!placement || !!activePopup); }
  function openPanel(key) { if (panel === key) return closePanel(); cancelPlacement(); panel = key; selectedProject = null; renderPanel(); }
  function renderPanel() {
    if (!panel || !inGame) return;
    const el = $('detailPanel');
    unlockSignature = [...E.buildings, ...E.policies].map(d => E.available(state, d).ok ? '1' : '0').join('');
    el.classList.remove('hidden');
    $('onboarding').classList.add('hidden');
    document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === panel || b.dataset.panel==='reform'&&['budget','culture','nobles','unrest'].includes(panel) || b.dataset.panel==='hostile'&&['war','nationEconomy'].includes(panel)));
    if (panel === 'build') renderBuild(el);
    else if (panel === 'policy') renderPolicies(el);
    else if (panel === 'reform') renderReforms(el);
    else if (panel === 'report') renderReport(el);
    else if (panel === 'budget') renderBudget(el);
    else if(panel==='economy')renderEconomy(el);
    else if(panel==='minerals')renderMinerals(el);
    else if(panel==='unrest')renderUnrest(el);
    else if (panel === 'warehouse') renderWarehouse(el);
    else if (panel === 'trade') renderTrade(el);
    else if (panel === 'culture') renderCulture(el);
    else if (panel === 'nobles') renderNobles(el);
    else if (panel === 'war') renderWar(el);
    else if (panel === 'automation') renderAutomation(el);
    else if (panel === 'hostile') renderHostiles(el);
    else if (panel === 'nationEconomy') renderNationEconomy(el);
    else if (panel === 'exploration') renderExploration(el);
    else if (panel === 'selection') renderSelection(el);
    else renderResource(el, panel);
    el.querySelectorAll('[data-close=panel]').forEach(b => b.onclick = closePanel);
  }
  function renderBuild(el) {
    const words=buildSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const available = E.buildings.filter(d => E.available(state, d).ok&&words.every(w=>[civicName(d),d.id,d.desc,...Object.keys(d.output||{}).map(k=>resourceNames[k]),d.housing?'住房 住宅 居住':'',d.knowledgeRate?'教育 科研 知识':'',d.category,...(d.id.endsWith('mine')?['矿产 采矿']:[])].join(' ').toLowerCase().includes(w)));
    const land=buildAnchor&&world.sample(buildAnchor.x,buildAnchor.y);
    const category=d=>['housing','production','civic','defense'].includes(d.category)?d.category:'other';
    const groups=[['housing','居住'],['production','生产'],['civic','公共'],['defense','防御'],['other','其他']].map(([id,name])=>({id,name,items:available.filter(d=>category(d)===id)})).filter(g=>g.items.length);
    const catalog=groups.length>1?groups.map(g=>`<section class="building-group"><h3>${g.name}</h3><div class="project-list">${g.items.map(projectCard).join('')}</div></section>`).join(''):`<div class="project-list">${available.map(projectCard).join('')}</div>`;
    el.innerHTML=panelHeader('建设')+`<div class="building-search"><label for="buildingSearch">${icon('compass')}</label><input id="buildingSearch" type="search" placeholder="搜索建筑、用途或资源" aria-label="搜索建筑" value="${escape(buildSearch)}"><button id="clearBuildingSearch" type="button" title="清空搜索" aria-label="清空建筑搜索">${icon('close')}</button></div><p id="buildingSearchStatus" class="search-status" aria-live="polite">${words.length?'找到 '+available.length+' 项':''}</p><div class="build-location">${icon('compass')}<span>${buildAnchor?`${land.biome} · ${Math.round(buildAnchor.x)}, ${Math.round(buildAnchor.y)}`:'先点击一处土地'}</span></div>${buildAnchor?'<div class="choice-row"><button id="landDetails">地区</button><button id="landProposal">议案</button></div>':''}<div class="size-options">${[1,2,3].map((s,i)=>`<button data-size="${s}" class="${projectSize===s?'active':''}">${['小型','中型','大型'][i]}</button>`).join('')}</div>${available.length?catalog:'<p class="empty-note">没有匹配的已解锁建筑。</p>'}`;
    $('buildingSearch').oninput=e=>{if(e.isComposing)return;buildSearch=e.target.value;const pos=e.target.selectionStart;renderBuild(el);$('buildingSearch').focus();$('buildingSearch').setSelectionRange?.(pos,pos);};
    $('buildingSearch').addEventListener('compositionend',e=>$('buildingSearch').oninput({target:e.target,isComposing:false}));
    el.querySelectorAll('[data-close=panel]').forEach(b=>b.onclick=closePanel);
    $('clearBuildingSearch').onclick=()=>{buildSearch='';renderBuild(el);$('buildingSearch').focus();};
    if(buildAnchor){const b=document.createElement('button');b.id='buildSettlement';b.className='primary-button wide';b.innerHTML=`${icon('home')}建立新聚落`;el.querySelector('.build-location').after(b);b.onclick=()=>settlementDialog(buildAnchor.x,buildAnchor.y);}
    if($('landDetails'))$('landDetails').onclick=()=>{selected={kind:'region',...buildAnchor,...land};panel='selection';renderPanel();};
    if($('landProposal'))$('landProposal').onclick=()=>{draft={name:'',clauses:[],regions:[nearestRegion(buildAnchor.x,buildAnchor.y).id],target:'all',executor:'community',condition:'always',duration:0};panel='policy';renderPanel();};
    el.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{projectSize=+b.dataset.size;renderPanel();});
    el.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>{
      if(!buildAnchor){toast('先点击地图上的土地');return;}
      const r=E.build(state,b.dataset.project,buildAnchor.x,buildAnchor.y,projectSize);
      if(!r.ok){toast(r.message);return;}
      toast('已动工');changed();updateGuide();closePanel();
    });
  }
  function projectCard(d) {
    const access = E.available(state, d);
    const cost=E.constructionCosts(state,d,projectSize,buildAnchor?.x,buildAnchor?.y);
    return `<button class="project-card" data-project="${d.id}" title="${escape(civicDescription(d))}" ${access.ok?'':'disabled'}><span class="project-icon">${icon(civicIcon(d))}</span><span class="project-main"><span class="project-name">${escape(civicName(d))}<small>${number(d.years*(projectSize>1?1.25:1)*(buildAnchor?world.sample(buildAnchor.x,buildAnchor.y).buildCost||1:1),1)} 年</small></span>${costsHTML(cost)}</span></button>`;
  }
  function beginPlacement(type, size = 1) {
    const definition = E.buildings.find(d => d.id === type);
    placement = { type, size }; closePanel(); $('onboarding').classList.add('hidden');
    world.setMode('build', type, size); $('placementBar').classList.remove('hidden');
    $('placementText').textContent = `${type === 'settlement' ? '新聚落' : definition.name} · ${size > 1 ? ['','小型','中型','大型'][size] + ' · ' : ''}点击空地放置`;
  }
  function settlementDialog(x,y) {
    const preview=E.settlementPreview(state,x,y);
    if(!preview.ok){toast(preview.message);return;}
    showDialog(`<div class="dialog-header"><h2 id="dialogTitle">建立新聚落</h2>${closeButton('dialog')}</div><form id="settlementForm"><label for="settlementNameInput">聚落名称</label><input id="settlementNameInput" type="text" maxlength="18" value="${escape(preview.name)}" autocomplete="off" required><div class="settlement-cost">${costsHTML(preview.cost)}</div><div class="form-actions"><button type="button" class="secondary-button" id="cancelSettlement">取消</button><button type="submit" class="primary-button" id="confirmSettlement">${icon('home')}建立</button></div><p id="settlementError" class="preview-warning" role="status"></p></form>`);
    $('cancelSettlement').onclick=closeDialog;
    $('settlementForm').onsubmit=e=>{e.preventDefault();const r=E.settle(state,x,y,$('settlementNameInput').value);if(!r.ok){$('settlementError').textContent=r.message;return;}closeDialog();cancelPlacement();changed();closePanel();toast(r.message);};
    setTimeout(()=>$('settlementNameInput')?.select(),40);
  }
  function cancelPlacement() { placement = null; world.setMode(null); $('placementBar').classList.add('hidden'); }
  function renderPolicies(el) {
    const options=E.proposalOptions(state);
    const visibleProposals=state.proposals.filter(p=>p.clauses.every(id=>options.clauses.some(d=>d.id===id)));
    if(!draft){
      el.innerHTML=panelHeader('议案')+`<button id="newProposal" class="primary-button wide">${icon('plus')}拟定议案</button><div class="proposal-list">${visibleProposals.map(p=>`<article class="proposal-card"><button class="proposal-open" data-edit="${p.id}"><strong>${escape(p.name)}</strong><span>${E.policyFeedbackSummary(state,p).active?'执行中':p.active?'等待条件':'已暂停'} · ${number(p.coverage)}%</span></button><div class="coverage"><i style="width:${p.coverage}%"></i></div>${policyResults(p)}<button class="subtle-button" data-toggle-proposal="${p.id}">${p.active?'暂停':'恢复'}</button></article>`).join('')}</div>`;
      $('newProposal').onclick=()=>{draft={name:'',clauses:[],regions:[selected?.kind==='region'?nearestRegion(selected.x,selected.y).id:'all'],target:'all',executor:'community',condition:'always',duration:0};renderPanel();};
      el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{draft=JSON.parse(JSON.stringify(state.proposals.find(p=>p.id===b.dataset.edit)));renderPanel();});
      el.querySelectorAll('[data-toggle-proposal]').forEach(b=>b.onclick=()=>{const p=state.proposals.find(p=>p.id===b.dataset.toggleProposal);E.setProposalActive(state,p.id,!p.active);changed();renderPanel();});
      return;
    }
    const clauses=options.clauses.map(d=>({...d,desc:civicDescription(d)}));
    el.innerHTML=panelHeader(draft.id?'修改议案':'拟定议案')+`<form id="proposalForm" class="proposal-form"><input id="proposalName" aria-label="议案名称" placeholder="为议案命名" maxlength="30" value="${escape(draft.name)}"><div class="form-label">地区</div><div class="clause-chips"><button type="button" data-region="all" class="${draft.regions.includes('all')?'active':''}">全国</button>${state.settlements.map(s=>`<button type="button" data-region="${s.id}" class="${draft.regions.includes(s.id)?'active':''}">${escape(s.name)}</button>`).join('')}</div><div class="form-label">对象</div><div class="clause-chips">${options.targets.map(t=>`<button type="button" data-target="${t.id}" class="${draft.target===t.id?'active':''}">${t.name}</button>`).join('')}</div><div class="form-label">条款 <span>${draft.clauses.length}/${E.MAX_POLICY_CLAUSES}</span></div><div class="project-list">${clauses.map(d=>`<button type="button" data-clause="${d.id}" class="project-card ${draft.clauses.includes(d.id)?'selected':''}"><span class="project-icon">${icon(definitionIcons[d.icon]||'policy')}</span><span class="project-main"><span class="project-name">${escape(d.name)}${draft.clauses.includes(d.id)?icon('check'):icon('plus')}</span><p>${escape(d.desc)}</p><p class="policy-drawback">${escape(d.drawback)}</p>${costsHTML(d.cost)}</span></button>`).join('')}</div><div class="form-label">执行</div><div class="clause-chips">${options.executors.map(t=>`<button type="button" data-executor="${t.id}" class="${draft.executor===t.id?'active':''}">${t.name}</button>`).join('')}</div><div class="form-label">生效条件</div><div class="clause-chips">${options.conditions.map(t=>`<button type="button" data-condition="${t.id}" class="${draft.condition===t.id?'active':''}">${t.name}</button>`).join('')}</div><div class="form-label">期限</div><div class="clause-chips">${[0,5,15,30].map(n=>`<button type="button" data-duration="${n}" class="${+draft.duration===n?'active':''}">${n?`${n} 年`:'长期'}</button>`).join('')}</div><div id="proposalEstimate"></div><div class="form-actions"><button type="button" id="cancelDraft" class="subtle-button">返回</button><button type="submit" class="primary-button">${icon('check')}提交议案</button></div></form>`;
    const remember=()=>{draft.name=$('proposalName').value;};
    $('proposalName').oninput=remember;
    el.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{remember();const id=b.dataset.region;if(id==='all')draft.regions=['all'];else{draft.regions=draft.regions.filter(r=>r!=='all');draft.regions=draft.regions.includes(id)?draft.regions.filter(r=>r!==id):[...draft.regions,id];}renderPanel();});
    for(const key of ['target','executor','condition','duration'])el.querySelectorAll(`[data-${key}]`).forEach(b=>b.onclick=()=>{remember();draft[key]=key==='duration'?+b.dataset[key]:b.dataset[key];renderPanel();});
    el.querySelectorAll('[data-clause]').forEach(b=>b.onclick=()=>{remember();const id=b.dataset.clause;if(draft.clauses.includes(id))draft.clauses=draft.clauses.filter(c=>c!==id);else if(draft.clauses.length<E.MAX_POLICY_CLAUSES)draft.clauses.push(id);else toast(`最多 ${E.MAX_POLICY_CLAUSES} 项条款`);const scroll=el.scrollTop;renderPanel();el.scrollTop=scroll;});
    refreshProposalEstimate();
    $('cancelDraft').onclick=()=>{draft=null;renderPanel();};
    $('proposalForm').onsubmit=e=>{e.preventDefault();remember();const result=E.draftPolicy(state,draft);if(!result.ok){toast(result.message);return;}draft=null;changed();renderPanel();};
  }
  function refreshProposalEstimate(){
    if(!draft||!$('proposalEstimate'))return;
    const estimate=E.draftPolicy(state,{...draft,preview:true}),button=$('proposalForm')?.querySelector('[type="submit"]');
    if(button)button.disabled=!estimate.ok;
    $('proposalEstimate').innerHTML=Number.isFinite(estimate.resistance)?`<div class="estimate"><span class="section-label">${estimate.costKind==='unchanged'?'无需支出':estimate.costKind==='revision'?'调整支出':'发起支出'}</span>${costsHTML(estimate.cost)}${Object.keys(estimate.organizationCost||{}).length?`<details class="policy-results policy-cost-breakdown"><summary>费用明细${icon('arrow')}</summary><div class="effect-values"><span>组织${costsHTML(estimate.organizationCost)}</span>${Object.keys(estimate.clauseCost||{}).length?`<span>条款${costsHTML(estimate.clauseCost)}</span>`:''}${Object.keys(estimate.executorCost||{}).length?`<span>执行${costsHTML(estimate.executorCost)}</span>`:''}</div></details>`:''}<div class="reform-preview-values"><span>政治阻力 <b>${number(estimate.resistance,1)}%</b></span>${Number.isFinite(estimate.implementationYears)?`<span>推行约 <b>${number(estimate.implementationYears,1)} 年</b></span>`:''}</div>${!estimate.ok&&estimate.message?`<p class="preview-warning">${escape(estimate.message)}</p>`:''}</div>`:estimate.message?`<p class="preview-warning">${escape(estimate.message)}</p>`:'';
  }
  function nearestRegion(x,y) { return state.settlements.reduce((a,b)=>Math.hypot(a.x-x,a.y-y)<Math.hypot(b.x-x,b.y-y)?a:b); }
  function renderAutomation(el) {
    const level=E.automationLevel(state),a=state.automation,plans=E.automationPlan(state).slice(0,5);
    el.innerHTML=panelHeader('委托建设')+(level?`<div class="automation-level">${['','基础委托','地区规划','智能建设'][level]}</div><button class="project-card" data-auto="enabled"><span class="project-main project-name">自动建设<i class="switch ${a.enabled?'on':''}"></i></span></button><div class="project-list">${[['housing','补充住房'],['food','保障粮食'],['storage','仓储配套'],...(level>=2?[['wood','补充木材'],['stone','补充石材'],['roads','连接道路'],['civic','市政与教育'],['production','产业与生产链'],['commerce','商业与税务'],['defense','外围防御']]:[])].map(([id,name])=>`<button class="project-card" data-auto="${id}"><span class="project-main project-name">${name}<i class="switch ${a.tasks[id]?'on':''}"></i></span></button>`).join('')}</div><div class="metrics">${metric('已委托工程',a.projects)}${metric('并行上限',level)}</div><p class="section-label">下一步规划</p>${plans.length?plans.map(p=>`<article class="automation-plan"><strong>${escape(E.buildings.find(d=>d.id===p.type)?.name||p.type)}</strong><span>${escape(p.city)} · ${escape(p.reason)}</span></article>`).join(''):'<p class="empty-note">地区配套充足</p>'}${a.recent.length?'<p class="section-label">近期委托</p>'+a.recent.slice(0,4).map(p=>`<article class="automation-plan"><strong>${escape(E.buildings.find(d=>d.id===p.type)?.name||p.type)}</strong><span>${escape(p.city)} · ${escape(p.reason)}</span></article>`).join(''):''}`:'<p class="empty-note">建成议事屋后开放委托。</p>');
    el.querySelectorAll('[data-auto]').forEach(b=>b.onclick=()=>{const k=b.dataset.auto;const r=E.setAutomation(state,k,!(k==='enabled'?a.enabled:a.tasks[k]));if(!r.ok)toast(r.message);changed();renderPanel();});
  }
  function renderHostiles(el) {
    const nations=state.neighbors||[],trade=E.foreignSummary?.(state)||{};
    const nationCards=nations.map(n=>{
      const flow=n.tradeLast||{},plan=n.tradePlan||{imports:{},exports:{}};
      return `<article class="nation-card ${selected?.nationId===n.id?'selected':''}" style="--nation-color:${escape(n.color||'#b7c995')}"><button class="nation-name" data-nation-center="${n.id}"><i></i>${escape(n.name)}${icon('compass')}</button><div class="nation-status"><span>${number(n.population)} 人 · ${n.cities?.length||1} 座城镇</span><span>${n.embargo?'贸易禁运':n.tradeOpen?(n.tension>=65||n.relation<15?'商路受阻':'通商中'):'未通商'}</span>${n.pactUntil>state.elapsed?`<span>互不侵犯 ${number(n.pactUntil-state.elapsed,1)} 年</span>`:''}</div><div class="metrics">${metric('关系',number(n.relation),'/100')}${metric('边境紧张',number(n.tension),'%')}${metric('经济规模',number(n.economy))}${metric('人口年增长',number((n.development?.last.populationGrowth||0)*100,1),'%')}</div><div class="nation-exchange">${['imports','exports'].map(side=>`<div><strong>${side==='imports'?'进口':'出口'}</strong>${Object.entries(plan[side]).map(([key,rate])=>`<span>${icon(resourceIcons[key])}${escape(resourceNames[key])} ${number(rate,1)}/年</span>`).join('')||'<span>—</span>'}</div>`).join('')}</div><div class="trade-actual">实际进口 ${number(flow.imported,1)} · 出口 ${number(flow.exported,1)}/年${hasCurrency()?`<br>货款净额 ${signed(flow.treasuryRate||0)}/年<br>本国关税 ${number(flow.tariff,1)} · 付对方关税 ${number(flow.foreignTariff,1)}/年`:''}</div><button class="primary-button wide" data-edit-trade="${n.id}">${icon('market')}拟定进出口</button>${n.expansion?.last?`<p class="territory-note">最近扩张：${escape(n.expansion.last.name)}</p>`:''}${n.commercialTreaty?.until>state.elapsed?`<p class="territory-note">商业条约 · ${n.commercialTreaty.beneficiary==='player'?'本国出口':'对方进口'}关税最高 2% · 剩余 ${number(n.commercialTreaty.until-state.elapsed,1)} 年</p>`:''}<div class="nation-actions"><button data-nation-economy="${n.id}">人口与生产</button><button data-annex="${n.id}">${n.annexation?'兼并谈判进行中':'谈判兼并'}</button><button data-foreign="trade" data-nation="${n.id}" ${n.embargo?'disabled':''}>${n.tradeOpen?'暂停通商':'开通商路'}</button><button data-foreign="envoy" data-nation="${n.id}">派遣使节${costsHTML({food:12})}</button><button data-foreign="pact" data-nation="${n.id}" ${n.relation<45||n.pactUntil>state.elapsed?'disabled':''}>互不侵犯${costsHTML({food:20})}</button><button data-foreign="patrol" data-nation="${n.id}">边境巡防${costsHTML({food:12,wood:10})}</button><button data-foreign="embargo" data-nation="${n.id}">${n.embargo?'解除禁运':'实施禁运'}</button></div></article>`;
    }).join('');
    el.innerHTML=panelHeader('周边势力')+(nations.length?`<div class="choice-row"><button id="diplomaticMap">${icon('compass')}周边地图</button></div><div class="metrics">${metric('开放商路',trade.routes||0,'条')}${metric('食物贸易',signed(trade.foodRate||0),'/年')}</div>${nationCards}`:'')+(state.hostiles.length?state.hostiles.map(h=>`<article class="hostile-card"><button class="hostile-name" data-hostile-center="${h.id}">${icon('compass')}${escape(h.name)}</button><div class="metrics">${metric('敌意',number(h.pressure),'%')}${metric('巡守剩余',number(Math.max(0,h.guardUntil-state.elapsed)),'年')}</div><div class="coverage hostile-pressure"><i style="width:${h.pressure}%"></i></div><div class="hostile-actions"><button data-hostile-action="patrol" data-hostile="${h.id}">巡守${costsHTML({food:12,wood:10})}</button><button data-hostile-action="tribute" data-hostile="${h.id}">赠粮${costsHTML({food:25})}</button>${state.knowledge>=3?`<button data-hostile-action="negotiate" data-hostile="${h.id}">交涉${costsHTML({food:8})}</button>`:''}</div></article>`).join(''):nations.length?'':'<p class="empty-note">尚未发现周边势力。</p>');
    if($('diplomaticMap'))$('diplomaticMap').onclick=()=>{world.centerOn();world.setZoom(.4);closePanel();};
    el.querySelectorAll('[data-nation-center]').forEach(b=>b.onclick=()=>{const n=nations.find(n=>n.id===b.dataset.nationCenter);world.centerOn(n.x,n.y);world.setZoom(.85);});
    el.querySelectorAll('[data-edit-trade]').forEach(b=>b.onclick=()=>{selected={kind:'nation',nationId:b.dataset.editTrade};panel='trade';renderPanel();});
    el.querySelectorAll('[data-annex]').forEach(b=>b.onclick=()=>annexDialog(b.dataset.annex));
    el.querySelectorAll('[data-nation-economy]').forEach(b=>b.onclick=()=>{selected={kind:'nation',nationId:b.dataset.nationEconomy};openPanel('nationEconomy');});
    el.querySelectorAll('[data-foreign]').forEach(b=>b.onclick=()=>{const r=E.foreignAction(state,b.dataset.nation,b.dataset.foreign);toast(r.message||(r.ok?'安排已执行':'暂不能执行'));changed();renderPanel();});
    el.querySelectorAll('[data-hostile-center]').forEach(b=>b.onclick=()=>{const h=state.hostiles.find(h=>h.id===b.dataset.hostileCenter);world.centerOn(h.x,h.y);world.setZoom(1.5);});
    el.querySelectorAll('[data-hostile-action]').forEach(b=>b.onclick=()=>{const r=E.respondHostile(state,b.dataset.hostile,b.dataset.hostileAction);toast(r.ok?'安排已执行':r.message);changed();renderPanel();});
    if(E.warSummary&&(nations.length||state.buildings.some(b=>b.type==='council'&&b.status==='complete'))){
      const military=E.warSummary(state);
      el.querySelector('.panel-header').insertAdjacentHTML('afterend',`<button id="openMilitary" class="project-card military-shortcut"><span class="project-icon">${icon('war')}</span><span class="project-main"><span class="project-name">${military.wars.length?'战事与谈判':'国防与动员'}${icon('arrow')}</span><span class="military-shortcut-meta">${number(military.soldiers)} 士兵${military.wars.length?` · ${military.wars.length} 场战争`:''}</span></span></button>`);
      $('openMilitary').onclick=()=>{panel='war';renderPanel();};
      el.querySelectorAll('[data-nation-center]').forEach(b=>{
        const n=nations.find(n=>n.id===b.dataset.nationCenter),war=military.wars.find(w=>w.nationId===n.id);
        b.closest('.nation-card').querySelector('.nation-actions').insertAdjacentHTML('beforeend',war?`<button data-war-view="${n.id}" class="war-action">战事 · 谈判</button>`:`<button data-declare-war="${n.id}" class="war-action" ${military.soldiers<=0||n.pactUntil>state.elapsed||n.truceUntil>state.elapsed?'disabled':''}>宣战</button>`);
      });
      el.querySelectorAll('[data-war-view]').forEach(b=>b.onclick=()=>{panel='war';renderPanel();});
      el.querySelectorAll('[data-declare-war]').forEach(b=>b.onclick=()=>warGoalDialog(b.dataset.declareWar));
    }
  }
  function renderNationEconomy(el){
    const n=state.neighbors.find(n=>n.id===selected?.nationId);if(!n){panel='hostile';renderHostiles(el);return;}
    const last=n.development?.last||{},timing=E.foreignTiming(state);
    el.innerHTML=panelHeader(n.name)+`<button id="nationEconomyBack" class="primary-button wide">返回外交</button><div class="metrics">${metric('人口',number(n.population))}${metric('居住承载',number(n.cities.reduce((v,c)=>v+CivilNations.housing(c),0)))}${metric('粮食收支',signed(last.foodNet||0),'/年')}${metric('人口年增长',signed((last.populationGrowth||0)*100,1),'%')}</div><p class="section-label">地区</p>`+n.cities.map(c=>`<article class="automation-plan"><strong>${escape(c.name)}</strong><span>${number(c.population)} / ${number(CivilNations.housing(c))} 人</span>${(c.assets||[]).filter(b=>b.status==='building').map(b=>`<span>${escape(E.buildings.find(d=>d.id===b.type)?.name||b.type)} · ${number(b.progress)}%</span>`).join('')}</article>`).join('')+`<p class="section-label">物资</p><div class="stock-list">`+CivilLogistics.resources.filter(r=>n.resources[r.id]>0||last.gross?.[r.id]>0||last.used?.[r.id]>0).map(r=>`<article class="stock-card" data-foreign-resource="${r.id}"><header>${icon(resourceIcons[r.id])}<strong>${escape(r.name)}</strong><span>${number(n.resources[r.id],1)} / ${number(CivilNations.capacity(n,r.id))}</span></header><div class="stock-flows"><span>产出 +${number(last.gross?.[r.id]||0,1)}/年</span><span>消耗 −${number(last.used?.[r.id]||0,1)}/年</span></div></article>`).join('')+`</div><p class="territory-note">结算间隔 ${number(timing.intervalMs/1000,1)} 秒</p>`;
    $('nationEconomyBack').onclick=()=>openPanel('hostile');
  }
  function renderWar(el) {
    const military=E.warSummary?.(state);
    if(!military){el.innerHTML=panelHeader('国防');return;}
    const wars=military.wars||[],cost={food:military.foodCost,wood:military.woodCost,...(hasCurrency()?{treasury:military.treasuryCost}:{})};
    const costText=Object.entries(cost).filter(([,n])=>n>0).map(([key,n])=>`<span>${icon(resourceIcons[key])}${number(n,1)}<small>/年</small></span>`).join('');
    el.innerHTML=panelHeader('国防与战争')+`<div class="choice-row"><button id="backDiplomacy">${icon('compass')}外交</button></div><div class="metrics">${metric('动员士兵',number(military.soldiers),'人')}${metric('战争支持',number(military.support),'%')}${metric('补给',number(military.supply*100),'%')}${metric('厌战',number(military.weariness),'%')}</div><div class="mobilization-options">${military.levels.map(l=>`<button data-mobilize="${l.id}" aria-pressed="${military.level===l.id}" class="${military.level===l.id?'active':''}" ${!military.available||l.id==='none'&&wars.length?'disabled':''}><strong>${escape(l.name)}</strong><span>${number(l.fraction*100,1)}% 人口</span></button>`).join('')}</div>${costText?`<div class="military-costs">${costText}</div><p class="policy-drawback">劳力减少 ${number(military.laborPenalty*100,1)}%${wars.length?' · 交战期间商路中断':''}</p>`:''}${wars.map(w=>`<article class="war-card"><div class="war-heading"><h3>${escape(w.name)}</h3><span>交战 ${number(state.elapsed-w.started,1)} 年</span></div><div class="metrics">${metric('战局',signed(w.score))}${metric('交战胜率',number(w.probability*100),'%')}${metric('对方兵力',number(w.enemySoldiers),'人')}${metric('下次交战',number(Math.max(0,w.nextBattle-state.elapsed),1),'年后')}</div><div class="war-objectives"><p>本国：${escape(w.goalLabel)}</p><p>对方：${escape(w.enemyGoalLabel)}</p>${!w.aggressor&&!w.goalChosen&&!w.lastBattle?`<button class="primary-button wide" data-defense-goal="${w.nationId}">确定应战目标</button>`:''}</div><div class="war-running-cost">累计阵亡 ${number(w.losses)} · 耗粮 ${number(w.costs?.food,1)}${hasCurrency()?' · 军费 '+number(w.costs?.treasury,1):''}</div>${w.lastBattle?`<div class="battle-result ${w.lastBattle.won?'battle-won':'battle-lost'}"><strong>${w.lastBattle.won?'上次获胜':'上次失利'}</strong><span>阵亡 ${number(w.lastBattle.losses)} · 对方 ${number(w.lastBattle.enemyLosses)}</span></div>`:''}<p class="section-label">谈判</p><div class="peace-offers">${w.offers.map(o=>`<article><button data-peace="${o.id}" data-war-nation="${w.nationId}" ${!o.accepted||Object.entries(o.cost||{}).some(([key,value])=>state.resources[key]<value)?'disabled':''} title="${!o.accepted?'对方暂不接受':Object.entries(o.cost||{}).some(([key,value])=>state.resources[key]<value)?'储备不足':''}"><span>${escape(o.name)}</span>${costsHTML(o.cost)}${icon('arrow')}</button>${o.drawback?`<p class="policy-drawback">${escape(o.drawback)}</p>`:''}</article>`).join('')}</div></article>`).join('')}${!wars.length?'<div class="peace-state">没有正在进行的战争</div>':''}<section class="feedback-card"><h3>累计军务</h3><div class="metrics">${metric('耗粮',number(military.totals.food,1))}${metric('木材',number(military.totals.wood,1))}${hasCurrency()?metric('军费',number(military.totals.treasury,1)):''}${metric('阵亡',number(military.totals.losses),'人')}</div></section>${military.history.slice(0,3).map(h=>`<article class="feedback-card"><strong>${escape(h.name)} · ${escape(h.terms)}</strong><p>阵亡 ${number(h.losses)} · 对方 ${number(h.enemyLosses)} · 耗粮 ${number(h.costs?.food,1)}</p></article>`).join('')}`;
    $('backDiplomacy').onclick=()=>{panel='hostile';renderPanel();};
    el.querySelectorAll('[data-mobilize]').forEach(b=>b.onclick=()=>actionFeedback(E.mobilize(state,b.dataset.mobilize)));
    el.querySelectorAll('[data-defense-goal]').forEach(b=>b.onclick=()=>warGoalDialog(b.dataset.defenseGoal,true));
    el.querySelectorAll('[data-peace]').forEach(b=>b.onclick=()=>actionFeedback(E.negotiate(state,b.dataset.warNation,b.dataset.peace)));
  }
  function beginExploration() {
    closePanel();placement={type:'explore'};world.setMode('explore');
    $('placementBar').classList.remove('hidden');$('onboarding').classList.add('hidden');
    $('placementText').textContent='点击已知边缘 · 探索需要数年';
    if(world.view.zoom>.95)world.setZoom(.75);
  }
  function renderExploration(el) {
    const expeditions=state.expeditions||[],limit=E.expeditionLimit?.(state)||1;
    el.innerHTML=panelHeader('探索')+`<div class="exploration-heading"><span>在途 ${expeditions.length} / ${limit}</span>${costsHTML({food:16,wood:6})}</div><button id="dispatchExploration" class="primary-button wide" ${expeditions.length>=limit?'disabled':''}>${icon('compass')}派出探索队</button>${expeditions.map(e=>`<article class="expedition-card"><button data-expedition-center="${e.id}" class="proposal-open"><strong>${icon('compass')}探索队 · ${number(e.x)}, ${number(e.y)}</strong><span>剩余 ${number(Math.max(0,e.duration-(state.elapsed-e.started)),1)} 年</span></button><div class="coverage"><i style="width:${Math.max(0,Math.min(100,e.progress||0))}%"></i></div><button class="subtle-button" data-cancel-expedition="${e.id}">召回</button></article>`).join('')}`;
    $('dispatchExploration').onclick=beginExploration;
    el.querySelectorAll('[data-expedition-center]').forEach(b=>b.onclick=()=>{const e=expeditions.find(e=>e.id===b.dataset.expeditionCenter);world.centerOn(e.x,e.y);world.setZoom(.75);});
    el.querySelectorAll('[data-cancel-expedition]').forEach(b=>b.onclick=()=>{const r=E.cancelExpedition(state,b.dataset.cancelExpedition);toast(r.message||(r.ok?'探索队已召回':'无法召回'));changed();renderPanel();});
  }
  function renderReforms(el) {
    const innovation=E.canIntroduceCurrency?.(state),process=state.reformProcess;
    const activeDefinition=process&&E.reforms.find(d=>d.id===process.id),activeChoice=activeDefinition?.choices.find(c=>c.id===process.choice);
    const remaining=process?Math.max(0,process.years-(state.elapsed-process.started)):Math.max(0,state.reformCooldown-state.elapsed);
    const progress=process?Math.max(0,Math.min(100,(state.elapsed-process.started)/process.years*100)):0;
    const processHTML=process?`<article class="reform-progress-card" id="activeReform"><span class="tag">改革落实中</span><h3>${escape(activeDefinition?.name||'制度改革')} · ${escape(activeChoice?.name||'')}</h3><div class="reform-preview-values"><span>剩余 <b>${number(remaining,1)} 年</b></span><span>政治阻力 <b>${number(process.resistance,1)}%</b></span></div><div class="coverage"><i style="width:${progress}%"></i></div></article>`:remaining>0?`<p class="reform-cooldown">组织调整 · ${number(remaining,1)} 年</p>`:'';
    el.innerHTML = panelHeader('制度') + governmentNav('reform') + `<div>${E.historicalTags(state).map(t => `<span class="tag">${escape(t)}</span>`).join('')}</div>${processHTML}`+(!hasCurrency()&&innovation?.ok?`<section class="currency-innovation"><h3>${icon('coin')}推行货币</h3><p>以统一计量结算交换，建立税收与公共财政。</p><p class="policy-drawback">${escape(innovation.drawback||'统一计价改变分配方式，传统交换者会抵触。')}</p>${costsHTML(innovation.cost)}${Number.isFinite(innovation.resistance)?`<div class="reform-preview-values"><span>政治阻力 <b>${number(innovation.resistance,1)}%</b></span>${Number.isFinite(innovation.years)?`<span>落实 <b>${number(innovation.years,1)} 年</b></span>`:''}</div>`:''}<button id="introduceCurrency" class="primary-button wide">推行革新${icon('arrow')}</button></section>`:hasCurrency()?`<span class="tag">货币流通</span>`:'')+ E.reforms.filter(d=>E.available(state,d).ok).map(d => {
      const current = d.choices.find(c => c.id === state.institutions[d.id]);
      const choices=d.choices.filter(c=>E.available(state,c).ok);
      if(!choices.some(c=>c.id===reformSelections[d.id]))reformSelections[d.id]=current?.id||choices[0]?.id;
      return `<section class="institution"><h3>${escape(d.name)} · ${escape(current?.name)}</h3><select id="reform-${d.id}" data-reform-select="${d.id}" aria-label="${escape(d.name)}">${choices.map(c=>`<option value="${c.id}" ${c.id===reformSelections[d.id]?'selected':''}>${escape(c.name)}</option>`).join('')}</select><div data-reform-preview="${d.id}"></div><button class="subtle-button" data-reform="${d.id}">推行改革 ${icon('arrow')}</button></section>`;
    }).join('');
    bindGovernment(el);
    if($('introduceCurrency'))$('introduceCurrency').onclick=()=>{const r=E.introduceCurrency(state);if(!r.ok)toast(r.message);changed();renderPanel();};
    const previewReform=id=>{
      const choice=$(`reform-${id}`).value,preview=E.reformPreview?.(state,id,choice),container=el.querySelector(`[data-reform-preview="${id}"]`),button=el.querySelector(`[data-reform="${id}"]`);
      const same=state.institutions[id]===choice;
      container.innerHTML=same?'':preview?`<div class="reform-estimate">${costsHTML(preview.cost)}${Number.isFinite(preview.resistance)?`<div class="reform-preview-values"><span>政治阻力 <b>${number(preview.resistance,1)}%</b></span><span>落实 <b>${number(preview.years,1)} 年</b></span></div>`:''}${preview.drawback?`<p class="policy-drawback">${escape(preview.drawback)}</p>`:''}${!preview.ok&&!process&&preview.message?`<p class="preview-warning">${escape(preview.message)}</p>`:''}</div>`:'';
      button.disabled=same||!!process||remaining>0||!preview?.ok;
    };
    el.querySelectorAll('[data-reform-select]').forEach(input=>{const id=input.dataset.reformSelect;input.onchange=()=>{reformSelections[id]=input.value;previewReform(id);};previewReform(id);});
    el.querySelectorAll('[data-reform]').forEach(b => b.onclick = () => { const id = b.dataset.reform; const result = E.reform(state, id, $(`reform-${id}`).value); if (!result.ok) feedback('改革暂未推进', result.message); changed(); renderPanel(); });
  }
  function metric(label, value, unit = '', change) { return `<div class="metric"><small>${label}</small><b>${value}</b><em>${unit}${change == null ? '' : signed(change) + '/年'}</em></div>`; }
  function chart(key, color = '#b9ca98') {
    const data = state.statsHistory || [];
    const values = data.map(p => p[key]).filter(Number.isFinite);
    if (values.length < 2) return '';
    const max = Math.max(...values, 1) * 1.08, min = 0;
    const points = values.map((v, i) => `${8 + i / (values.length - 1) * 284},${88 - (v - min) / (max - min) * 75}`).join(' ');
    return `<svg class="report-chart" viewBox="0 0 300 100" role="img" aria-label="${escape(key)}历史变化，当前${number(values.at(-1))}"><path d="M8 88H292 M8 50H292 M8 12H292" stroke="#ced9b016" stroke-width="1"/><polyline points="${points}" stroke="${color}" fill="none" stroke-linejoin="round"/><text x="292" y="10" fill="#b7bca7" stroke="none" font-size="9" text-anchor="end">${number(max)}</text></svg><div class="chart-labels"><span>${date(data[0].year)}</span><span>${date(data.at(-1).year)}</span></div>`;
  }
  function renderReport(el) {
    lastReadHistory = state.history[0]?.id;
    const s = E.stats(state);
    const history=state.history.filter(readableEvent);
    el.innerHTML = panelHeader('账册') + `<div class="metrics">${metric('人口 / 住所', `${s.population}<small style="display:inline;font-size:12px"> / ${s.housing}</small>`, '人')}${metric('粮食净收支', signed(s.foodRate), '/年')}${metric('共同知识', number(s.knowledge, 1), '点')}${metric('公众信任', number(s.stability), '%')}</div><p class="section-label">人口变化</p>${chart('population')}<div class="choice-row"><button data-layer="natural" class="${world.layer === 'natural' ? 'active' : ''}">地貌</button><button data-layer="food" class="${world.layer === 'food' ? 'active' : ''}">肥力</button><button data-layer="people" class="${world.layer === 'people' ? 'active' : ''}">聚落</button></div>${hasCurrency()?'<button id="reportEconomy" class="primary-button wide">经济运行</button>':''}<button id="reportUnrest" class="primary-button wide">社会与地方</button><button id="reportMinerals" class="primary-button wide">矿产与勘探</button><button id="reportProposal" class="primary-button wide">${icon('policy')}拟定议案</button><p class="section-label">沿途记录 · ${history.length}</p>${history.slice(0, 25).map(h => `<article class="history-entry"><time>${date(h.time)}</time><h3>${escape(h.title)}</h3><p>${escape(h.body)}</p></article>`).join('')}`;
    if($('reportEconomy'))$('reportEconomy').onclick=()=>openPanel('economy');$('reportUnrest').onclick=()=>openPanel('unrest');$('reportMinerals').onclick=()=>openPanel('minerals');
    $('reportProposal').onclick=()=>{draft={name:'',clauses:[],regions:['all'],target:'all',executor:'community',condition:'always',duration:0};panel='policy';renderPanel();};
    el.querySelector('.metrics').insertAdjacentHTML('beforeend',metric('最大聚落',number(E.largestCityPopulation?.(state)??Math.max(...state.settlements.map(s=>s.population))),'人')+metric('聚落数量',state.settlements.length,'处'));
    el.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => { world.setLayer(b.dataset.layer); renderPanel(); });
  }
  function policyResults(p){
    const f=E.policyFeedbackSummary(state,p);
    const rows=[['粮食产出',f.foodPercent,'%'],['木材产出',f.woodPercent,'%'],['石材产出',f.stonePercent,'%'],['知识能力',f.knowledge,'/年'],['工程效率',f.construction,'%'],['行政能力',f.admin,''],['防御',f.defense,''],['迁入吸引',f.migration,'/年'],['信任目标',f.stability,''],...(hasCurrency()?[['财政能力',f.treasury,'/年']]:[]),['粮食支出',-f.foodUpkeep,'/年']].filter(r=>Math.abs(r[1])>.01);
    return `<details class="policy-results"><summary>实施反馈${icon('arrow')}</summary><div class="effect-values">${rows.map(([name,v,unit])=>`<span>${name}<b>${signed(v)}${unit}</b></span>`).join('')||'<span>效力尚未传开</span>'}</div>${p.spending?`<div class="policy-spending"><p class="section-label">累计投入</p>${costsHTML(p.spending.total)}</div>`:''}<div class="region-coverage">${f.regions.map(r=>`<span>${escape(r.name)} <b>${number(r.coverage)}%</b></span>`).join('')}</div></details>`;
  }
  function renderWarehouse(el){
    const storage=E.storageSummary(state),stats=E.stats(state),war=E.warSummary(state),culture=S.cultureSummary(state);
    el.innerHTML=panelHeader('仓库')+`<div class="metrics">${metric('物资仓库',storage.warehouses,'座')}${metric('简易堆栈',storage.depots,'座')}</div><div class="warehouse-grid">${storage.lines.map(r=>{
      const baseProduction=r.id==='food'?stats.foodProduction:r.id==='wood'?stats.woodProduction:r.id==='stone'?stats.stoneProduction:0;
      const baseUse=r.id==='food'?stats.foodConsumption+stats.policyFoodUpkeep:0;
      const extraUse=r.id==='food'?war.foodCost+(culture.foodUpkeep||0):r.id==='wood'?war.woodCost:0;
      return `<article class="stock-card" data-resource="${r.id}"><header>${icon(r.icon)}<strong>${r.name}</strong><span>${number(r.stock,1)} / ${number(r.capacity)}</span></header><div class="coverage"><i style="width:${Math.min(100,r.stock/r.capacity*100)}%"></i></div><div class="stock-flows"><span>产出 ${signed(baseProduction+r.production)}/年</span><span>消耗 ${number(baseUse+r.consumption+extraUse,1)}/年</span><span>贸易 ${signed(r.trade)}/年</span>${r.lost>0?`<span class="warning-text">累计溢出 ${number(r.lost,1)}</span>`:''}</div></article>`;
    }).join('')}</div><button id="warehouseMinerals" class="primary-button wide">${icon('stone')}矿产与勘探</button><button id="warehouseBuild" class="primary-button wide">${icon('plus')}扩建储备设施</button>`;
    $('warehouseMinerals').onclick=()=>openPanel('minerals');
    $('warehouseBuild').onclick=()=>{panel='build';renderPanel();};
  }
  function renderTrade(el){
    const n=state.neighbors.find(n=>n.id===selected?.nationId);if(!n){panel='hostile';renderHostiles(el);return;}
    const lines=E.storageSummary(state).lines.map(r=>({...r,price:CivilEconomy.price(state,r.id,r.price)})),plan=n.tradePlan;
    el.innerHTML=panelHeader(escape(n.name))+`<form id="tradeForm"><div class="choice-row"><button type="button" id="tradeBack">返回外交</button></div><h3>${hasCurrency()?'进出口计划':'实物交换计划'}</h3><div class="trade-table"><div class="trade-row trade-heading"><span>货物</span><span>进口 / 年</span><span>出口 / 年</span></div>${lines.map(r=>`<div class="trade-row"><label for="trade-import-${r.id}">${icon(r.icon)}${r.name}${hasCurrency()?`<small>${number(r.price,1)} / 单位</small>`:''}</label><input id="trade-import-${r.id}" data-trade-import="${r.id}" type="number" min="0" max="10000" step="0.5" value="${plan.imports[r.id]||0}" aria-label="${r.name}进口数量"><input data-trade-export="${r.id}" type="number" min="0" max="10000" step="0.5" value="${plan.exports[r.id]||0}" aria-label="${r.name}出口数量"></div>`).join('')}</div><div id="tradeEstimate" class="feedback-card"></div><button class="primary-button wide" type="submit">${icon('check')}执行计划</button></form>`;
    const read=()=>({imports:Object.fromEntries([...el.querySelectorAll('[data-trade-import]')].map(e=>[e.dataset.tradeImport,+e.value])),exports:Object.fromEntries([...el.querySelectorAll('[data-trade-export]')].map(e=>[e.dataset.tradeExport,+e.value]))});
    const estimate=()=>{const tariffs=E.tradeTariffs(state,n),p=read(),buy=lines.reduce((v,r)=>v+r.price*(p.imports[r.id]||0),0),sell=lines.reduce((v,r)=>v+r.price*(p.exports[r.id]||0),0);
      $('tradeEstimate').innerHTML=hasCurrency()?`<div class="effect-values"><span>进口货款<b>${number(buy,1)}/年</b></span><span>出口货款<b>${number(sell,1)}/年</b></span><span>对方关税 ${number(tariffs.foreign*100,1)}%<b>−${number(sell*tariffs.foreign,1)}/年</b></span><span>本国进口关税<b>${number(buy*tariffs.domestic,1)}/年</b></span><span>对外净额<b>${signed(sell*(1-tariffs.foreign)-buy)}/年</b></span></div><p>实际数量受储备、仓容、对方支付能力与边境状况限制。</p>`:`<p>按等值实物比例交换；输入与输出都需指定。缺货时同比缩减。</p>`;
    };
    el.querySelectorAll('input').forEach(e=>e.oninput=estimate);estimate();
    $('tradeBack').onclick=()=>{panel='hostile';renderPanel();};
    $('tradeForm').onsubmit=e=>{e.preventDefault();const r=E.configureTrade(state,n.id,read());if(!r.ok){toast(r.message);return;}panel='hostile';actionFeedback(r);};
  }

  function renderResource(el, key) {
    if(key==='treasury'&&!hasCurrency()){renderBudget(el);return;}
    const s = E.stats(state);
    if (key === 'population') {
      el.innerHTML = panelHeader('在此生活的人们', '', '人口与居住') + `<div class="metrics">${metric('村民', number(s.population), '人')}${metric('住房承载', number(s.housing), '人')}${metric('公众信任', number(s.stability), '%')}${metric('聚落', s.settlements, '处')}</div>${chart('population')}<button id="populationUnrest" class="primary-button wide">社会与地方</button><p class="section-label">各处炊烟</p>${state.settlements.map(t => `<button class="project-card" data-center="${t.id}"><span class="project-icon">${icon('home')}</span><span class="project-main"><span class="project-name">${escape(t.name)}<small>${number(Math.floor(t.population))} 人</small></span><p>居住承载 ${number(E.regionalHousing(state)[t.id])} · 增长上限 ${number(Math.floor(E.regionalHousing(state)[t.id]*1.05))} 人</p></span></button>`).join('')}`;
      el.querySelector('.metrics').insertAdjacentHTML('beforeend',metric('最大聚落',number(E.largestCityPopulation?.(state)??Math.max(...state.settlements.map(s=>s.population))),'人'));
      $('populationUnrest').onclick=()=>openPanel('unrest');
      el.querySelectorAll('[data-center]').forEach(b => b.onclick = () => { const t = state.settlements.find(s => s.id === b.dataset.center); world.centerOn(t.x, t.y); world.setZoom(1.62); });
      return;
    }
    const rate = s[`${key}Rate`] || 0;
    el.innerHTML = panelHeader(`${resourceNames[key]}账册`, '', '公共储备') + `<div class="metrics">${metric('当前储备', number(s[key]), '单位')}${metric('每年净变化', signed(rate), '/年')}</div>${key === 'food' ? `<div class="metrics">${metric('每年生产', number(s.foodProduction, 1))}${metric('每年消耗', number(s.foodConsumption, 1))}</div>` : ''}${chart(key)}<button class="primary-button wide" id="resourceWarehouse">${icon('warehouse')}仓库</button><button class="primary-button wide" id="resourceBuild">${icon('build')}建设</button>`;
    $('resourceWarehouse').onclick=()=>{panel='warehouse';renderPanel();};
    $('resourceBuild').onclick = () => { panel = 'build'; selectedProject = key === 'food' ? 'farm' : key === 'wood' ? 'lumber' : 'quarry'; if (!E.available(state, E.buildings.find(d => d.id === selectedProject)).ok) selectedProject = null; renderPanel(); };
  }
  function renderUnrest(el){
    const q=E.unrestSummary(state);
    el.innerHTML=panelHeader('社会与地方')+governmentNav('unrest')+`<div class="metrics">${metric('民众不满',number(q.discontent),'%')}${metric('公共执行',number(q.compliance*100),'%')}${metric('罢工地区',q.regions.filter(r=>r.strike).length)}${metric('内乱地区',q.regions.filter(r=>r.revolt).length)}</div>${q.nobleRefusal?'<div class="social-alert"><strong>贵族拒令</strong><p>征税、征召与政令落实受阻。</p><button id="unrestNobles" class="primary-button wide">贵族事务</button></div>':''}${q.regions.map(r=>`<article class="unrest-card ${r.revolt?'revolt':r.strike?'strike':''}" data-unrest-region="${r.id}"><header><button data-social-center="${r.id}">${escape(r.name)}${icon('compass')}</button><strong>${number(r.discontent)}%</strong></header><span class="tag">${r.revolt?'内乱':r.strike?'罢工与停工':r.discontent>=45?'不满上升':'秩序平稳'}${r.capital?' · 首都':''}</span><div class="coverage"><i style="width:${r.discontent}%"></i></div>${r.reasons?.length?`<p>${r.reasons.map(a=>escape(a.name)).join(' · ')}</p>`:''}<div class="effect-values"><span>生产<b>${number(r.laborFactor*100)}%</b></span><span>执行<b>${number(r.compliance*100)}%</b></span></div>${!r.capital&&r.secessionPressure>0?`<p class="policy-drawback">分离压力 ${number(r.secessionPressure,1)} / 9 年</p>`:''}<div class="social-actions">${r.actions.map(a=>`<button data-unrest-action="${a.id}" data-region="${r.id}" ${r[a.until]>state.elapsed?'disabled':''} title="${escape(a.drawback)}"><span>${escape(a.name)}${r[a.until]>state.elapsed?' · 执行中':''}</span>${costsHTML(a.cost)}</button>`).join('')}</div></article>`).join('')}<details class="economic-theory"><summary>地方安排的代价</summary><p>救济耗用公共储粮；协商需要组织支出；自治十八年内降低地方征税与政令效力 10%。改善食物、住房、就业和税负才能持续缓解不满。</p><p>严重内乱持续九年且不满仍高时，非首都城市可能独立。独立后人口、设施和相应公共储备归新势力。</p></details>`;
    bindGovernment(el);if($('unrestNobles'))$('unrestNobles').onclick=()=>openPanel('nobles');
    el.querySelectorAll('[data-social-center]').forEach(b=>b.onclick=()=>{const r=q.regions.find(r=>r.id===b.dataset.socialCenter);world.centerOn(r.x,r.y);world.setZoom(1.2);});
    el.querySelectorAll('[data-unrest-action]').forEach(b=>b.onclick=()=>actionFeedback(E.unrestAction(state,b.dataset.region,b.dataset.unrestAction)));
  }
  function annexDialog(id){
    const n=state.neighbors.find(n=>n.id===id),q=E.annexOffer(state,id);if(!n||!q.ok)return;
    showDialog(`<div class="dialog-header"><div><p class="eyebrow">外交谈判</p><h2>与${escape(n.name)}合并</h2></div>${closeButton('dialog')}</div><div class="metrics">${metric('经济优势',number(q.economyRatio,2),'倍')}${metric('兵力优势',number(q.militaryRatio,2),'倍')}</div><p>${number(n.population)} 位居民 · ${n.cities.length} 座城市</p>${q.negotiation?`<p>谈判进行中 · 剩余 ${number(Math.max(0,q.years-(state.elapsed-q.negotiation.started)),1)} 年</p>`:`${q.reasons.length?`<ul class="diplomatic-reasons">${q.reasons.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:'<p class="treaty-positive">对方愿意进入兼并谈判</p>'}<p class="section-label">谈判与整合支出</p>${costsHTML(q.cost)}<p class="policy-drawback">谈判需要四年。期间需维持实力、关系与本国秩序；失败不退还前期支出。接收地区需要逐步整合。</p><button id="beginAnnex" class="primary-button wide" ${!q.eligible||Object.entries(q.cost).some(([k,v])=>state.resources[k]<v)?'disabled':''}>开始兼并谈判</button>`}`);
    if($('beginAnnex'))$('beginAnnex').onclick=()=>{const r=E.annex(state,id);if(r.ok)closeDialog();actionFeedback(r);};
  }
  function warGoalDialog(id,defending=false){
    const n=state.neighbors.find(n=>n.id===id);if(!n)return;const w=E.warSummary(state),war=w.wars.find(w=>w.nationId===id);let goal='security',city=n.cities.some(c=>c.id===selected?.cityId)?selected.cityId:n.cities[0].id;
    showDialog(`<div class="dialog-header"><div><p class="eyebrow">${defending?'确定应战目的':'决定战争目的'}</p><h2>${escape(n.name)}</h2></div>${closeButton('dialog')}</div>${defending?`<p>对方目标：${escape(war?.enemyGoalLabel||'边境安全')}</p>`:''}<div class="war-goals">${w.goals.map(g=>`<button data-choose-goal="${g.id}" class="${g.id===goal?'active':''}" aria-pressed="${g.id===goal}"><strong>${g.name}</strong><span>${g.description}</span></button>`).join('')}</div><label id="warCityLabel" class="war-city-label hidden">目标城市<select id="warTargetCity">${n.cities.map(c=>`<option value="${escape(c.id)}" ${c.id===city?'selected':''}>${escape(c.name)} · ${number(c.population)} 人</option>`).join('')}</select></label><p class="policy-drawback">战争中断商路并持续消耗粮食、军费与劳力。战场失利也可能迫使本国接受对方目的。</p><button id="confirmWarGoal" class="primary-button wide">${defending?'确定应战目标':'确认宣战'}</button>`);
    $('dialog').querySelectorAll('[data-choose-goal]').forEach(b=>b.onclick=()=>{goal=b.dataset.chooseGoal;$('dialog').querySelectorAll('[data-choose-goal]').forEach(b=>{b.classList.toggle('active',b.dataset.chooseGoal===goal);b.setAttribute('aria-pressed',String(b.dataset.chooseGoal===goal));});$('warCityLabel').classList.toggle('hidden',goal!=='territory');});
    $('confirmWarGoal').onclick=()=>{const input={type:goal,...(goal==='territory'?{cityId:$('warTargetCity').value}:{})},r=defending?E.setWarGoal(state,id,input):E.declareWar(state,id,input);if(r.ok){closeDialog();panel='war';}actionFeedback(r);};
  }
  function renderMinerals(el){
    const deposits=E.mineralSummary(state),surveys=state.minerals.surveys,anchor=buildAnchor||selected?.x!=null&&selected||state.settlements[0];
    el.innerHTML=panelHeader('矿产与勘探')+`<div class="choice-row"><button id="mineralMap" class="primary-button">${icon('compass')}矿产地图</button><button id="surveyMinerals" class="primary-button">${icon('stone')}勘探</button></div>${surveys.map(q=>`<article class="automation-plan"><strong>勘探进行中</strong><span>${number(Math.max(0,q.duration-(state.elapsed-q.started)),1)} 年后返回</span></article>`).join('')}<div class="mineral-list">${deposits.length?deposits.map(d=>`<article class="mineral-card" style="--mineral:${d.color}"><header><strong>${escape(d.name)}</strong><span>${number(d.remaining)} / ${number(d.reserves)}</span></header><div class="coverage"><i style="width:${d.remaining/d.reserves*100}%"></i></div><p>品位 ${number(d.quality,2)}× · ${escape(world.sample(d.x,d.y).biome)}</p><button data-mineral-center="${escape(d.id)}">${icon('compass')}查看矿区</button></article>`).join(''):'<p class="empty-note">尚未查明矿藏。选择地区后派出勘探队。</p>'}</div>`;
    $('mineralMap').onclick=()=>{world.setLayer('minerals');world.setZoom(.5);closePanel();};
    $('surveyMinerals').onclick=()=>{const r=E.surveyMinerals(state,anchor.x,anchor.y);toast(r.message);changed();renderPanel();};
    el.querySelectorAll('[data-mineral-center]').forEach(b=>b.onclick=()=>{const d=deposits.find(d=>d.id===b.dataset.mineralCenter);world.centerOn(d.x,d.y);world.setZoom(1.2);world.setLayer('minerals');closePanel();toast('点击矿区内陆地，搜索对应矿场');});
  }
  function economyChart(q){
    const points=q.history;if(points.length<2)return '<p class="empty-note">经济数据逐年记录</p>';
    const values=points.map(p=>p.gdp),lo=Math.min(...values)*.95,hi=Math.max(...values)*1.05||1,path=values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*280+10).toFixed(1)},${(86-(v-lo)/(hi-lo)*65).toFixed(1)}`).join(' ');
    return `<svg class="economy-chart" viewBox="0 0 300 105" role="img" aria-label="实际产出历史"><path d="${path}" fill="none" stroke="#bdcc93" stroke-width="2.5"/><text x="10" y="103">${date(points[0].year)}</text><text x="230" y="103">${date(points.at(-1).year)}</text></svg>`;
  }
  function renderEconomy(el){
    const q=E.economySummary(state);if(!q.enabled){el.innerHTML=panelHeader('经济运行')+'<p class="empty-note">城市采用货币后开放国民账户与经济调控。</p>';return;}
    const bank=state.buildings.some(b=>b.type==='bank'&&b.status==='complete'),labels={consumption:'消费 C',investment:'投资 I',government:'公共需求 G',netExports:'净出口 NX'};
    el.innerHTML=panelHeader('经济运行')+`<div class="economy-phase ${q.crisis?'crisis':''}"><strong>${q.crisis?escape(q.crisis.title):q.gap<-.1?'需求偏弱':q.inflation>.06?'通胀压力':'经济平稳'}</strong><span>${q.crisis?'已持续 '+number(state.elapsed-q.crisis.started,1)+' 年':'总需求与供给'}</span></div><div class="metrics">${metric('实际产出 GDP',number(q.realGDP))}${metric('产出缺口',signed(q.outputGap*100),'%')}${metric('失业率',number(q.unemployment*100,1),'%')}${metric('通胀率',signed(q.inflation*100),'%')}${metric('物价指数',number(q.priceIndex*100))}${metric('信心',number(q.confidence),'%')}</div>${economyChart(q)}<section class="feedback-card"><h3>总需求 AD = C + I + G + NX</h3><div class="demand-bars">${Object.entries(labels).map(([k,label])=>`<div><span>${label}</span><i style="width:${Math.max(2,Math.abs(q[k])/Math.max(1,q.potentialGDP)*100)}%"></i><b>${number(q[k])}</b></div>`).join('')}</div><p>潜在产出 ${number(q.potentialGDP)} · 需求乘数 ${number(q.multiplier,1)}×</p></section><p class="section-label">经济政策</p>${[['spending','公共支出',0,30,1,'扩大需求与就业，增加国库支出；供给紧张时会推高物价。'],...(bank?[['interest','利率',.5,18,.5,'加息抑制投资与过度信贷，同时增加债务利息。'],['credit','信贷宽松度',0,100,5,'宽松促进投资；长期高杠杆与低利率可能触发信贷危机。']]:[])].map(([id,label,min,max,step,desc])=>`<section class="tax-card"><div class="budget-row"><label for="economic-${id}">${label}<span>${number(q.policy[id]*100,1)}%</span></label><input id="economic-${id}" data-economic-policy="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${q.policy[id]*100}"></div><p class="policy-drawback">${desc}</p></section>`).join('')}<div class="metrics">${metric('公共支出',number(q.last.spending||0,1),'/年')}${metric('利息实付',number(q.last.interest||0,1),'/年')}${metric('公共债务',number(q.debt))}${metric('债务 / GDP',number(q.debtRatio*100,1),'%')}${metric('信贷 / GDP',number(q.creditRatio*100,1),'%')}${metric('未落实预算',number(q.last.unfunded||0,1),'/年')}</div><div class="choice-row"><button data-debt="borrow">发行公债</button><button data-debt="repay" ${q.debt<=0?'disabled':''}>偿还债务</button></div><button id="economyBudget" class="primary-button wide">财政与税收</button><button id="economyTrade" class="primary-button wide">贸易与供给</button><details class="economic-theory"><summary>经济机制</summary><p>凯恩斯总需求与乘数：消费、投资、公共支出及净出口共同决定需求，税负会削弱消费传导；进口通过净出口减少本国需求。</p><p>产出缺口与就业：需求不足导致闲置产能和失业；扩大需求需要持续财政资源。</p><p>通胀与供给冲击：需求过热推升物价，粮食短缺或战争也会形成低产出、高物价的压力。</p><p>信贷周期与债务：低息和宽松信贷积累杠杆，危机后投资收缩；借债提供资金，也产生持续利息。</p><p>产出与需求采用简化指数；公共需求按比例折算为实际预算支出，不等同于完整货币国民账户。</p></details>`;
    el.querySelectorAll('[data-economic-policy]').forEach(input=>input.onchange=()=>{toast(E.setEconomicPolicy(state,input.dataset.economicPolicy,+input.value/100).message);changed();renderPanel();});
    el.querySelectorAll('[data-debt]').forEach(b=>b.onclick=()=>{toast(E.debtAction(state,b.dataset.debt).message);changed();renderPanel();});
    $('economyBudget').onclick=()=>openPanel('budget');$('economyTrade').onclick=()=>openPanel('hostile');
  }
  function renderBudget(el) {
    const unlocked = state.buildings.some(b => b.type === 'council' && b.status === 'complete');
    const s = E.stats(state),currency=hasCurrency();
    const quote=currency?S?.taxQuote(state):null, taxes=currency?(S?.taxOptions(state)||[]):[];
    const factions=S?.cultureSummary(state)||{};
    el.innerHTML = panelHeader(currency?'公共财政':'公共安排')+governmentNav('budget') + (currency?`<div class="metrics">${metric('国库', number(s.treasury))}${metric('每年净收支', signed(s.treasuryRate), '/年')}${metric('税收',number(quote?.total||0,1),'/年')}${metric('税负',number((quote?.burden||0)*100,1),'%')}</div>`:`<div class="metrics">${metric('粮食储备',number(s.food))}${metric('可用劳力',number(state.population*.54),'人')}</div>`)
      +(taxes.length?`<p class="section-label">税制</p>${taxes.map(d=>{const line=quote?.lines.find(l=>l.id===d.id),rate=state.taxation?.rates[d.id]||0;return `<section class="tax-card"><div class="budget-row"><label for="tax-${d.id}">${escape(d.name)}<span id="tax-value-${d.id}">${number(rate*100,1)}%</span></label><input id="tax-${d.id}" type="range" min="0" max="${Math.round(d.max*100)}" step="1" value="${rate*100}" data-tax="${d.id}" aria-label="${escape(d.name)}税率"></div><div class="tax-base"><span>${escape(d.baseLabel)} ${number(line?.base||0,1)}</span><b>${signed(line?.revenue||0)}/年</b></div><p class="policy-drawback">${escape(d.drawback)}</p></section>`;}).join('')}${factions.nobleInfluence>0||factions.clergyInfluence>0?`<div class="exemption-controls">${factions.nobleInfluence>0?`<button data-exemption="nobles" aria-pressed="${!!state.taxation?.exemptNobles}"><span class="switch ${state.taxation?.exemptNobles?'on':''}"></span>贵族免税</button>`:''}${factions.clergyInfluence>0?`<button data-exemption="clergy" aria-pressed="${!!state.taxation?.exemptClergy}"><span class="switch ${state.taxation?.exemptClergy?'on':''}"></span>教团免税</button>`:''}</div>`:''}`:'')
      +(unlocked?`<p class="section-label">公共分配</p>${[['construction','公共建设'],['welfare','公共生活'],['knowledge','知识传承']].map(([id, label]) => `<div class="budget-row"><label for="budget-${id}">${label}<span>${number(state.budget[id])}%</span></label><input id="budget-${id}" type="range" min="0" max="100" value="${state.budget[id]}" data-budget="${id}"></div>`).join('')}`:'<p class="empty-note">建成议事屋后可安排公共劳动。</p>');
    if(currency&&quote)el.insertAdjacentHTML('beforeend',`<section class="feedback-card tax-feedback"><h3>财政反馈</h3><div class="metrics">${metric('累计实收',number(state.taxation.totalCollected,1))}${metric('粮食生产抑制',number(quote.foodPenalty*100,1),'%')}${metric('贸易抑制',number(quote.tradePenalty*100,1),'%')}${metric('信任目标影响',signed(-quote.stabilityPenalty))}</div>${state.taxation.lastChange?`<p>最近调税：预计税收 ${signed(state.taxation.lastChange.revenueDelta)}/年</p>`:''}</section>`);
    if(currency){el.insertAdjacentHTML('afterbegin','<button id="openEconomy" class="primary-button wide">经济运行与调控</button>');$('openEconomy').onclick=()=>openPanel('economy');}
    bindGovernment(el);
    el.querySelectorAll('[data-budget]').forEach(input => input.onchange = () => { E.setBudget(state,input.dataset.budget,+input.value);changed();renderPanel(); });
    el.querySelectorAll('[data-tax]').forEach(input=>{input.oninput=()=>{$(`tax-value-${input.dataset.tax}`).textContent=`${number(+input.value,1)}%`;};input.onchange=()=>actionFeedback(S.setTax(state,input.dataset.tax,+input.value/100));});
    el.querySelectorAll('[data-exemption]').forEach(b=>b.onclick=()=>actionFeedback(S.setExemption(state,b.dataset.exemption,!state.taxation[b.dataset.exemption==='nobles'?'exemptNobles':'exemptClergy'])));
  }
  function societyActionCard(action,attribute) {
    return `<article class="society-action"><button class="project-card ${action.active?'selected':''}" ${attribute}="${escape(action.id)}" ${action.disabled||action.active?'disabled':''}><span class="project-main"><span class="project-name">${escape(action.name)}${icon(action.active?'check':'arrow')}</span>${costsHTML(action.cost)}${action.years?`<span class="action-years">${number(action.years,1)} 年</span>`:''}</span></button>${action.drawback?`<p class="policy-drawback">${escape(action.drawback)}</p>`:''}${action.cooldownUntil>state.elapsed?`<span class="action-years">${number(action.cooldownUntil-state.elapsed,1)} 年后可再次安排</span>`:''}</article>`;
  }
  function renderCulture(el) {
    const summary=S?.cultureSummary(state)||{},options=S?.cultureOptions(state)||{actions:[],policies:{}};
    const names={tolerant:'信仰宽容',restrictive:'限制异端',none:'自主传承',religious:'教团资助',civic:'公共文化',plural:'多元信仰',state:'国教',secular:'政教分离'};
    const region=el.querySelector('#cultureRegion')?.value||'all';
    const scope=region==='all'?state.settlements:state.settlements.filter(r=>r.id===region),share=scope.reduce((sum,r)=>sum+r.population,0)/Math.max(1,state.population);
    const transition=state.culture?.transition;
    const transitionHTML=transition?`<article class="reform-progress-card"><span class="tag">文化转型</span><h3>${escape(names[transition.to]||'制度调整')}</h3><div class="reform-preview-values"><span>剩余 <b>${number(Math.max(0,transition.years-(state.elapsed-transition.started)),1)} 年</b></span></div><div class="coverage"><i style="width:${Math.max(0,Math.min(100,transition.progress||0))}%"></i></div></article>`:'';
    const actions=options.actions.map(a=>{const cooldownUntil=a.regionSelectable?Math.max(0,...scope.map(r=>state.culture?.cooldowns?.[`${a.id}:${r.id}`]||0)):0;return {...a,cost:a.regionSelectable?Object.fromEntries(Object.entries(a.cost).map(([key,value])=>[key,Math.ceil(value*share)])):a.cost,cooldownUntil,disabled:a.disabled||cooldownUntil>state.elapsed};});
    const regionCards=state.settlements.map(r=>{const c=state.culture?.regions?.[r.id];if(!c)return '';const f=c.faith||{};return `<button class="culture-region" data-culture-center="${r.id}"><strong>${escape(r.name)}</strong><span>凝聚 ${number(c.cohesion)} · 传统 ${number(c.tradition)}</span><div class="faith-bar" role="img" aria-label="本土信仰 ${number(f.local)}%，教团信仰 ${number(f.organized)}%，世俗文化 ${number(f.secular)}%"><i class="faith-local" style="width:${Math.max(0,f.local||0)}%"></i><i class="faith-organized" style="width:${Math.max(0,f.organized||0)}%"></i><i class="faith-secular" style="width:${Math.max(0,f.secular||0)}%"></i></div><small>${number(f.local)} / ${number(f.organized)} / ${number(f.secular)}%</small></button>`;}).join('');
    el.innerHTML=panelHeader('宗教与文化')+governmentNav('culture')+`<div class="metrics">${metric('社会凝聚',number(summary.cohesion),'%')}${metric('文化传承',number(summary.tradition),'%')}${metric('教团影响',number(summary.clergyInfluence),'%')}${metric('教团支持',number(summary.clergySupport),'%')}</div><div class="culture-policy-tags">${Object.values(options.policies||{}).map(v=>`<span class="tag">${escape(names[v]||v)}</span>`).join('')}</div>${transitionHTML}${Object.values(options.upkeep||{}).some(v=>v>0)?`<div class="cultural-upkeep">每年资助 ${costsHTML(options.upkeep)}${summary.patronagePaused?'<span class="tag">储备不足 · 已暂停</span>':''}</div>`:''}<p class="section-label">地区文化</p><div class="faith-legend"><span class="faith-local">本土</span><span class="faith-organized">教团</span><span class="faith-secular">世俗</span></div>${regionCards}${options.actions.some(a=>a.regionSelectable)?`<label class="form-label" for="cultureRegion">实施地区</label><select class="government-select" id="cultureRegion"><option value="all">全国</option>${state.settlements.map(r=>`<option value="${r.id}" ${r.id===region?'selected':''}>${escape(r.name)}</option>`).join('')}</select>`:''}<p class="section-label">文化事务</p>${actions.map(a=>societyActionCard(a,'data-culture-action')).join('')}`;
    bindGovernment(el);
    el.querySelectorAll('[data-culture-action]').forEach(b=>b.onclick=()=>{const action=options.actions.find(a=>a.id===b.dataset.cultureAction);actionFeedback(S.cultureAction(state,action.id,action.regionSelectable?($('cultureRegion')?.value||'all'):'all'));});
    el.querySelectorAll('[data-culture-center]').forEach(b=>b.onclick=()=>{const r=state.settlements.find(r=>r.id===b.dataset.cultureCenter);world.centerOn(r.x,r.y);world.setZoom(1.2);});
    if($('cultureRegion'))$('cultureRegion').onchange=renderPanel;
  }
  function renderNobles(el) {
    const summary=S?.cultureSummary(state)||{},actions=S?.nobleOptions(state)||[],nobles=state.nobles||{};
    el.innerHTML=panelHeader('贵族领地')+governmentNav('nobles')+(state.unrest?.noble.refusing?'<div class="social-alert"><strong>拒绝执行政府命令</strong><p>贵族拒绝征召，部分税收和地方执行受阻。</p></div>':'')+(actions.length?`<div class="metrics">${metric('政治影响',number(summary.nobleInfluence),'%')}${metric('贵族支持',number(summary.nobleSupport),'%')}${metric('土地份额',number((nobles.landShare||0)*100),'%')}${metric('地位',nobles.privilege==='limited'?'受限':'领地特权')}</div>${nobles.reform?`<article class="reform-progress-card"><span class="tag">领地改革</span><div class="reform-preview-values"><span>剩余 <b>${number(Math.max(0,nobles.reform.years-(state.elapsed-nobles.reform.started)),1)} 年</b></span></div><div class="coverage"><i style="width:${Math.max(0,Math.min(100,nobles.reform.progress||0))}%"></i></div></article>`:''}${actions.map(a=>societyActionCard(a,'data-noble-action')).join('')}`:'<p class="empty-note">尚未形成贵族阶层。</p>');
    bindGovernment(el);
    el.querySelectorAll('[data-noble-action]').forEach(b=>b.onclick=()=>actionFeedback(S.nobleAction(state,b.dataset.nobleAction)));
  }
  function renderSelection(el) {
    if (selected?.kind === 'building') {
      const b = state.buildings.find(b => b.id === selected.buildingId);
      if (!b) return closePanel();
      const d = E.buildings.find(d => d.id === b.type);
      const status = { complete: '已投入使用', building: '正在建设', failed: '工程已中止' }[b.status];
      el.dataset.buildingStatus = b.status;
      const mineral=CivilMinerals.depositFor(state,b);
      const effectsHTML=d?buildingEffects(b.housingOverride!=null?{...d,housing:b.housingOverride/(b.size||1)}:d,b.size||1):'';
      el.innerHTML = panelHeader(escape(d?.name || '村落火塘')) + `<span class="tag">${status}</span>${b.status === 'building' ? `<div class="metrics">${metric('施工进度', number(b.progress), '%')}${metric('规模', b.size)}</div><div class="coverage"><i style="width:${b.progress}%"></i></div>` : `<div class="metrics">${effectsHTML||metric('规模',b.size||1)}${metric('所属聚落', escape(state.settlements.find(s => s.id === b.settlementId)?.name || state.name))}</div>`}${b.type==='lumber'?`<div class="metrics">${metric('周边剩余林木',number(E.forestRemaining(state,b.x,b.y)))}${metric('已采伐树木',state.forest.cut)}</div>`:''}${b.cost ? `<p class="section-label">已投入资源</p>${costsHTML(b.cost)}` : ''}<button id="buildingProposal" class="primary-button wide">${icon('policy')}拟定议案</button>`;
      if(mineral)el.insertAdjacentHTML('beforeend',`<section class="feedback-card mine-status"><h3>${escape(CivilMinerals.types.find(t=>t.id===mineral.type)?.name)}</h3><p>剩余 ${number(CivilMinerals.remaining(state,mineral))} · 品位 ${number(mineral.quality,2)}×</p></section>`);
      $('buildingProposal').onclick=()=>{draft={name:'',clauses:[],regions:[b.settlementId||'home'],target:'all',executor:'community',condition:'always',duration:0};panel='policy';renderPanel();};
      return;
    }
    if (!selected) return closePanel();
    const p = world.sample(selected.x, selected.y), explored = world.isExplored(selected.x, selected.y);
    const description = p.water ? (p.biome === '海域' ? '陆地在此伸向海面，远方的海岸仍在雾中。' : p.biome === '湖泊' ? '湖水汇集在低地，湖岸与周围地形共同塑造这片地区。' : '河水穿过这片土地，连接着更远的河岸。') : p.forest ? '树木与林间空地交错，适合为聚落提供木材。' : p.mountain ? '裸露岩层与山脊构成了这处地区。' : '河谷中的开阔土地，等待人们选择它的用途。';
    el.innerHTML = panelHeader(explored ? escape(p.biome) : '雾中的土地', '', explored ? '地区 · 土地' : '尚未探索') + (explored ? `<p class="panel-copy">${description}</p><div class="metrics">${metric('土地肥力', number(p.fertility), '/100')}${metric('林木潜力', number(p.wood), '/100')}${metric('石材潜力', number(p.stone), '/100')}</div>${!p.water ? `<button class="primary-button wide" id="regionBuild">${icon('build')}在这片土地建设</button><button class="primary-button wide" id="regionSettle">${icon('home')}建立新聚落</button>` : ''}` : `<p class="panel-copy">派出探索队，才能逐渐了解这里的山河。探索需要 16 粮食、6 木材，并与已知地区相连。</p><button class="primary-button wide" id="regionExplore">${icon('compass')}向这里探索</button>`);
    if(explored&&!p.water){el.insertAdjacentHTML('beforeend',`<div class="feedback-card"><h3>${escape(p.continent||'地区')} · ${escape(p.biome)}</h3><p>农业产能 ×${number(p.foodFactor||1,2)} · 建设成本 ×${number(p.buildCost||1,2)}</p><button id="landMinerals" class="primary-button wide">矿产与勘探</button></div>`);$('landMinerals').onclick=()=>openPanel('minerals');}
    if ($('regionBuild')) $('regionBuild').onclick = () => { panel = 'build'; selectedProject = null; renderPanel(); };
    if ($('regionSettle')) $('regionSettle').onclick = () => settlementDialog(selected.x,selected.y);
    if(explored&&!p.water){const b=document.createElement('button');b.className='primary-button wide';b.id='regionProposal';b.textContent='拟定议案';b.onclick=()=>{draft={name:'',clauses:[],regions:[nearestRegion(selected.x,selected.y).id],target:'all',executor:'community',condition:'always',duration:0};panel='policy';renderPanel();};el.appendChild(b);}
    if ($('regionExplore')) $('regionExplore').onclick = () => { const result = E.explore(state, selected.x, selected.y); if (!result.ok) feedback('探索队尚未出发', result.message); else { changed();panel='exploration';renderPanel();toast(`探索队已出发 · ${number(result.duration,1)} 年`); } };
  }
  function buildingEffects(definition,size) {
    return [['housing','居住承载','人'],['foodRate','粮食产能','/年'],['woodRate','木材产能','/年'],['stoneRate','石材产能','/年'],['knowledgeRate','知识产能','/年'],['defense','防御能力',''],['productivity','生产效率',''],['admin','行政能力',''],['stability','公众信任',''],['treasuryRate','公共收入产能','/年'],['foodEfficiency','粮食加工效率','%'],['constructionBonus','建设效率','%']].filter(([key])=>definition[key]&&(key!=='treasuryRate'||hasCurrency())).map(([key,label,unit])=>metric(label,signed(definition[key]*size*(['foodEfficiency','constructionBonus'].includes(key)?100:1)),unit)).join('');
  }
  function feedback(title, body, kind = 'report') {
    if(state.events.some(e=>e.title===title&&e.body===body))return;
    state.events.push({ id: `ui-${Date.now()}-${Math.random()}`, kind, title, body, time: state.year, data: {} });
    showNextEvent();
  }
  function showNextEvent() {
    if (!inGame || !$('dialogBackdrop').classList.contains('hidden')) return;
    state.events=state.events.filter(readableEvent);
    const current=state.events.find(e=>E.eventPriority(e)==='major')||state.events[0];
    if (!current) { majorEventVisible=false;$('importantEventBackdrop').classList.add('hidden');if(eventPreviousFocus?.isConnected)eventPreviousFocus.focus();eventPreviousFocus=null;activePopup = null; $('eventPopup').classList.add('hidden'); $('onboarding').classList.toggle('hidden', guideDismissed || !!placement || !!panel); return; }
    if (current.id === activePopup) return;
    activePopup = current.id;
    const wasMajor=majorEventVisible;majorEventVisible=E.eventPriority(current)==='major';
    $('importantEventBackdrop').classList.toggle('hidden',!majorEventVisible);
    if(majorEventVisible&&!wasMajor)eventPreviousFocus=document.activeElement;
    if(!majorEventVisible&&wasMajor){if(eventPreviousFocus?.isConnected)eventPreviousFocus.focus();eventPreviousFocus=null;}
    const kinds = { report: '一份简报', news: '河谷消息', success: '建设完成', failure: '不利消息', milestone: '新的足迹' };
    const data = current.data || {};
    const building = data.buildingId && state.buildings.find(b => b.id === data.buildingId);
    const eventView = current.kind !== 'report' ? '' : data.population != null ? `<div class="event-data"><span>${icon('people')}<b>${number(data.population)}</b><small>人口</small></span><span>${icon('food')}<b>${number(Math.floor(data.food))}</b><small>粮食</small></span><span>${icon('report')}<b>${number(data.knowledge, 1)}</b><small>知识</small></span></div>` : data.progress != null ? `<div class="coverage" title="记录时施工进度 ${number(data.progress)}%"><i style="width:${Math.min(100, Math.max(0, data.progress))}%"></i></div>` : '';
    const e = $('eventPopup'); e.className = `event-popup glass ${majorEventVisible?'important':''} ${current.kind === 'failure' ? 'failure' : ''}`;
    e.setAttribute('role',majorEventVisible?'alertdialog':'status');e.setAttribute('aria-modal',String(majorEventVisible));e.setAttribute('aria-labelledby','eventTitle');
    e.innerHTML = `<div class="event-meta"><span>${majorEventVisible?'重要公告':kinds[current.kind] || '新消息'}</span><span>${date(current.time)}</span></div><h3 id="eventTitle">${escape(current.title)}</h3><p>${escape(current.body)}</p>${eventView}<footer><span>${state.events.length > 1 ? `另有 ${state.events.length - 1} 条消息` : String(current.id).startsWith('ui-') ? '操作反馈' : '已收录到沿途记录'}</span>${data.warDeclaration?`<button id="eventWar">${state.warfare.wars.find(w=>w.nationId===data.nationId)?.goalChosen?'战事目标':'应战目的'}</button>`:''}${data.unrest?`<button id="eventUnrest">社会事务</button>`:''}${data.economicCrisis?`<button id="eventEconomy">经济调控</button>`:''}${data.resourceAlert?`<button id="eventResources">${icon('warehouse')}账册</button>`:''}${building || Number.isFinite(data.x) ? `<button id="locateEvent" title="在地图中查看发生地" aria-label="在地图中查看发生地">${icon('compass')}</button>` : ''}<button id="ackEvent">知道了 ${icon('check')}</button></footer>`;
    $('ackEvent').onclick = () => { state.events=state.events.filter(e=>e.id!==current.id);activePopup=null;showNextEvent();dirty=true; };
    if(majorEventVisible)$('ackEvent').focus();
    if($('eventWar'))$('eventWar').onclick=()=>{const war=state.warfare.wars.find(w=>w.nationId===data.nationId);$('ackEvent').click();closePanel();openPanel('war');if(war&&!war.aggressor&&!war.goalChosen)warGoalDialog(data.nationId,true);};
    if($('eventUnrest'))$('eventUnrest').onclick=()=>{$('ackEvent').click();closePanel();openPanel('unrest');};
    if($('eventEconomy'))$('eventEconomy').onclick=()=>{$('ackEvent').click();closePanel();openPanel('economy');};
    if($('eventResources'))$('eventResources').onclick=()=>{const fiscal=data.resources?.some(r=>r.resource==='treasury');$('ackEvent').click();closePanel();openPanel(fiscal?'budget':'warehouse');};
    if ($('locateEvent')) $('locateEvent').onclick = () => {
      world.centerOn(building?.x ?? data.x, building?.y ?? data.y); world.setZoom(building ? 2.2 : .85);
      if (building) { selected = { kind: 'building', buildingId: building.id }; panel = 'selection'; renderPanel(); }
    };
    $('onboarding').classList.add('hidden');
  }
  function toast(message) { clearTimeout(toastTimer); $('toastRegion').textContent = message; $('toastRegion').classList.remove('hidden'); toastTimer = setTimeout(() => $('toastRegion').classList.add('hidden'), 2600); }
  function changed() { dirty = true; world.setState(state); updateHUD(); showNextEvent(); }
  function updateHUD() {
    if (!inGame) return;
    const s = E.stats(state);
    $('hud').classList.toggle('currency-era',hasCurrency());
    $('settlementName').textContent = state.name; $('stageLabel').textContent = s.stage;
    ['population', 'food', 'wood', 'stone', 'treasury'].forEach(key => $(`${key}Value`).textContent = number(Math.floor(s[key])));
    document.querySelector('[data-stat="treasury"]').classList.toggle('hidden',!hasCurrency());
    $('yearLabel').textContent = date(state.year);
    $('seasonLabel').textContent = playing ? `${speed}×` : '暂停';
    $('playUse').setAttribute('href', playing ? '#i-pause' : '#i-play');
    $('playButton').setAttribute('aria-label', playing ? '暂停时间' : '开始时间');
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', +b.dataset.speed === speed));
    $('reportBadge').classList.toggle('hidden', !state.history[0] || state.history[0].id === lastReadHistory);
    if (panel === 'policy') document.querySelectorAll('[data-policy]').forEach(b => { const p = state.policies[b.dataset.policy]; if (p?.active) { const progress = b.querySelector('.coverage i'); if (progress) progress.style.width = `${p.coverage}%`; const line = b.querySelector('.costs'); if (line) line.textContent = `覆盖 ${number(p.coverage)}% · 正在渐进实施`; } });
    if(panel==='policy'&&draft)refreshProposalEstimate();
    if (panel === 'selection' && selected?.kind === 'building') {
      const b = state.buildings.find(b => b.id === selected.buildingId);
      if (b && $('detailPanel').dataset.buildingStatus !== b.status) renderPanel();
      else if (b?.status === 'building') {
        const bar = $('detailPanel').querySelector('.coverage i'), label = $('detailPanel').querySelector('.metric b');
        if (bar) bar.style.width = `${b.progress}%`;
        if (label) label.textContent = number(b.progress);
      }
    }
    if (panel === 'build' && selectedProject && $('placeProject')) {
      const d = E.buildings.find(b => b.id === selectedProject), costs = E.constructionCosts(state,d,projectSize,buildAnchor?.x,buildAnchor?.y);
      const affordable = Object.entries(costs).every(([r, n]) => state.resources[r] >= n);
      $('placeProject').disabled = !affordable;
      $('placeProject').innerHTML = affordable ? `${icon('build')}在地图上选址` : `${icon('build')}资源尚未备齐`;
    }
    if (((panel === 'policy'&&!draft) || (panel === 'build' && !selectedProject)) && unlockSignature !== [...E.buildings, ...E.policies].map(d => E.available(state, d).ok ? '1' : '0').join('')) {
      const scroll = $('detailPanel').scrollTop; renderPanel(); $('detailPanel').scrollTop = scroll;
    }
  }

  $('newGameButton').onclick = newGameDialog;
  $('continueButton').onclick = () => saves[0] && continueSlot(saves[0].id);
  $('loadGameButton').onclick = saveDialog;
  $('menuButton').onclick = menuDialog;
  document.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => openPanel(b.dataset.panel));
  document.querySelectorAll('[data-stat]').forEach(b => b.onclick = () => openPanel(b.dataset.stat === 'treasury' ? 'budget' : b.dataset.stat));
  document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => world.setZoom({ world: .27, region: .65, village: 1.85 }[b.dataset.level]));
  $('zoomOut').onclick = () => world.zoomBy(1 / 1.4);
  $('zoomIn').onclick = () => world.zoomBy(1.4);
  $('homeView').onclick = () => { world.centerOn(); world.setZoom(1.85); };
  $('playButton').onclick = () => { playing = !playing; updateHUD(); };
  document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { speed = +b.dataset.speed; updateHUD(); });
  $('exploreButton').onclick = () => openPanel('exploration');
  $('cancelPlacement').onclick = cancelPlacement;
  $('dismissGuide').onclick = () => { guideDismissed = true; $('onboarding').classList.add('hidden'); };
  $('dialogBackdrop').addEventListener('click', e => { if (e.target === $('dialogBackdrop')) closeDialog(); });
  document.addEventListener('keydown', e => {
    if(majorEventVisible&&$('dialogBackdrop').classList.contains('hidden')){
      if(e.key==='Escape'){e.preventDefault();$('ackEvent')?.click();return;}
      if(e.key==='Tab'){const f=[...$('eventPopup').querySelectorAll('button')],first=f[0],last=f.at(-1);if(e.shiftKey&&(document.activeElement===first||!$('eventPopup').contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!$('eventPopup').contains(document.activeElement))){e.preventDefault();first?.focus();}return;}
      if(!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    }
    if (e.key === 'Escape') { closeDialog(); cancelPlacement(); closePanel(); return; }
    if (!$('dialogBackdrop').classList.contains('hidden') && e.key === 'Tab') {
      const focusable = [...$('dialog').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      return;
    }
    if (!inGame || !$('dialogBackdrop').classList.contains('hidden') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); playing = !playing; updateHUD(); }
    else if (e.key.toLowerCase() === 'b') openPanel('build');
    else if (e.key.toLowerCase() === 'p') openPanel('policy');
    else if (e.key.toLowerCase() === 'r') openPanel('report');
    else if (e.key.toLowerCase() === 'e') $('exploreButton').click();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(true); lastFrame = 0; } });
  window.addEventListener('beforeunload', () => persist(true));
  function frame(now) {
    const workStart=performance.now(),frameMs=lastFrame?now-lastFrame:16.7;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .25) : 0; lastFrame = now;
    if (inGame && playing && !majorEventVisible && $('dialogBackdrop').classList.contains('hidden') && !document.hidden) { E.tick(state, dt * 100 / 3600 * speed,{deferForeign:true}); dirty = true; }
    world.render(now);
    if(inGame&&!document.hidden&&E.updateForeign(state,{now,frameMs,workMs:performance.now()-workStart}))dirty=true;
    if (inGame && now - lastUI > 300) { lastUI = now; updateHUD(); showNextEvent(); }
    if (inGame && playing && panel && (['report', 'food', 'wood', 'stone', 'population','hostile','automation','exploration','reform','culture','nobles','war','budget','warehouse','economy','minerals','unrest','nationEconomy'].includes(panel)||(panel==='policy'&&!draft)) && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName||'') && now - lastPanelRefresh > 1500) {
      lastPanelRefresh = now; const scroll = $('detailPanel').scrollTop; renderPanel(); $('detailPanel').scrollTop = scroll;
    }
    if (inGame && dirty && now - lastSave > 30000) persist(true);
    requestAnimationFrame(frame);
  }
  renderStart(); requestAnimationFrame(frame);
  window.CivilApp = { get state() { return state; }, get world() { return world; }, get playing() { return playing; }, get speed() { return speed; }, get inGame() { return inGame; }, save: persist, tick(years) { E.tick(state, years); changed(); if (panel) renderPanel(); }, openPanel, closePanel, startNew(seed = 48271, name = '溪岸',mode='village') { startGame(E.create(seed, name,mode)); }, get saves() { return saves.map(s => ({ id: s.id, name: s.state.name,mode:s.state.startMode||'village' })); } };
})();
