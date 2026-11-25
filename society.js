(function (root) {
  'use strict';

  // Aggregate households and institutions, rather than individual social agents.
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, finite(value, low)));
  const population = state => Math.max(0, finite(state.population));
  const hasCurrency = state => root.CivilStatecraft.currencyShare(state)>=.6;
  const now = state => Math.max(0, finite(state.elapsed));
  const approach = (value, target, dt, years) => value + (target - value) * (1 - Math.exp(-dt / years));
  const taxDefinitions = [
    { id: 'poll', name: '人头税', max: .2, baseLabel: '人口计价税基', drawback: '按人征收，对低收入家庭的负担更重。' },
    { id: 'land', name: '土地税', max: .3, baseLabel: '应税土地收成', drawback: '增加土地持有者负担，贵族和宗教地产会争取豁免。' },
    { id: 'domestic', name: '国内贸易税', max: .2, baseLabel: '国内交易', drawback: '逐次征税会增加交易成本，抑制地区间交换。' },
    { id: 'customs', name: '关税', max: .3, baseLabel: '实际边境贸易', drawback: '提高进口成本，较高税率会减少双边贸易。' },
    { id: 'vat', name: '增值税', max: .25, baseLabel: '生产与消费增加值', drawback: '消费价格和征管负担上升，居民购买力受到影响。' }
  ];

  function ledger(state, regionId) {
    const result = {};
    for (const building of state.buildings || []) {
      if (building.status !== 'complete' || (regionId && building.settlementId !== regionId)) continue;
      result[building.type] = (result[building.type] || 0) + clamp(building.size ?? 1, .1, 100);
    }
    return result;
  }

  function industrial(state, buildings) {
    return !!state.industrialized || (!!buildings.factory && (state.settlements || []).some(s => s.population >= 10000));
  }

  function normalizeFaith(faith) {
    const result = { local: clamp(faith?.local, 0, 100), organized: clamp(faith?.organized, 0, 100), secular: clamp(faith?.secular, 0, 100) };
    const total = result.local + result.organized + result.secular;
    if (!total) return { local: 100, organized: 0, secular: 0 };
    Object.keys(result).forEach(key => { result[key] = result[key] / total * 100; });
    return result;
  }

  function initialize(state) {
    const buildings = ledger(state);
    const medieval = state.startEra === 'medieval';
    if (!state.taxation) {
      state.taxation = {
        rates: { poll: hasCurrency(state) ? clamp(state.budget?.taxRate, 0, .2) : 0, land: 0, domestic: 0, customs: 0, vat: 0 },
        exemptNobles: true, exemptClergy: true, last: {}
      };
    }
    state.taxation.rates ||= {};
    for (const definition of taxDefinitions) state.taxation.rates[definition.id] = clamp(state.taxation.rates[definition.id], 0, definition.max);
    state.taxation.exemptNobles ??= true;
    state.taxation.exemptClergy ??= true;
    state.taxation.last ||= {};
    state.culture ||= {};
    const culture = state.culture;
    culture.regions ||= {};
    culture.policy ||= {};
    culture.policy.tolerance = ['tolerant', 'restrictive'].includes(culture.policy.tolerance) ? culture.policy.tolerance : 'tolerant';
    culture.policy.patronage = ['none', 'religious', 'civic'].includes(culture.policy.patronage) ? culture.policy.patronage : 'none';
    culture.policy.establishment = ['plural', 'state', 'secular'].includes(culture.policy.establishment) ? culture.policy.establishment : 'plural';
    culture.organizations ||= [];
    culture.cooldowns ||= {};
    (state.settlements || []).forEach((settlement, index) => {
      if (!culture.regions[settlement.id]) {
        culture.regions[settlement.id] = {
          tradition: medieval ? 69 + index * 4 : 82,
          cohesion: medieval ? 66 - index * 3 : 78,
          faith: medieval ? { local: 22 + index * 10, organized: 75 - index * 11, secular: 3 + index } : { local: 100, organized: 0, secular: 0 },
          identity: settlement.name, festivalUntil: 0, preservationUntil: 0
        };
      }
      const region = culture.regions[settlement.id];
      region.tradition = clamp(region.tradition, 0, 100);
      region.cohesion = clamp(region.cohesion, 0, 100);
      region.faith = normalizeFaith(region.faith);
    });
    if (!culture.organizations.some(organization => organization.id === 'clergy') && (buildings.temple || (population(state) >= 180 && (buildings.shrine || state.cityFounded)))) {
      culture.organizations.push({ id: 'clergy', name: '宗教团体', influence: medieval ? 48 : 24, support: 62, landShare: medieval ? .12 : .04 });
    }
    for (const organization of culture.organizations) {
      organization.influence = clamp(organization.influence, 0, 100);
      organization.support = clamp(organization.support, 0, 100);
      organization.landShare = clamp(organization.landShare, 0, .45);
    }
    if (!state.nobles) {
      const present = medieval || !!buildings.manor;
      state.nobles = { influence: present ? 60 : 0, support: present ? 58 : 50, landShare: present ? .35 : 0, privilege: 'estates', reform: null };
    } else if (!state.nobles.established && !state.nobles.influence && buildings.manor) {
      Object.assign(state.nobles, { influence: 35, support: 58, landShare: .2 });
    }
    state.nobles.established ||= medieval || !!buildings.manor || state.nobles.influence > 0;
    state.nobles.influence = clamp(state.nobles.influence, 0, 100);
    state.nobles.support = clamp(state.nobles.support, 0, 100);
    state.nobles.landShare = clamp(state.nobles.landShare, 0, .65);
    state.nobles.privilege = state.nobles.privilege === 'limited' ? 'limited' : 'estates';
    return state;
  }

  function clergy(state) {
    return state.culture.organizations.find(organization => organization.id === 'clergy');
  }

  function visibleTaxes(state, buildings) {
    if (!hasCurrency(state)) return [];
    return taxDefinitions.filter(definition => {
      if (definition.id === 'poll') return !!buildings.council;
      if (definition.id === 'land') return !!buildings.manor || state.startEra === 'medieval';
      if (definition.id === 'domestic') return !!buildings.market;
      if (definition.id === 'customs') return !!state.neighbors?.length;
      return industrial(state, buildings) && !!buildings.taxoffice && finite(state.knowledge) >= 240;
    });
  }

  function taxOptions(state) {
    initialize(state);
    return visibleTaxes(state, ledger(state)).map(definition => ({ ...definition, rate: state.taxation.rates[definition.id] }));
  }

  function taxQuote(state) {
    initialize(state);
    const buildings = ledger(state);
    const definitions = visibleTaxes(state, buildings);
    const people = population(state);
    const church = clergy(state);
    const exemptShare = clamp((state.taxation.exemptNobles ? state.nobles.landShare : 0) + (state.taxation.exemptClergy ? church?.landShare || 0 : 0), 0, .8);
    const taxableShare = 1 - exemptShare;
    // Capacities are deliberately independent of CivilEngine.stats/effects.
    const foodCapacity = 15 + people * .065 + (buildings.farm || 0) * 9 + (buildings.estate || 0) * 220 + (buildings.canal || 0) * 35;
    const production = (buildings.workshop || 0) * 3 + (buildings.forge || 0) * 18 + (buildings.machineworks || 0) * 32 + (buildings.factory || 0) * 48;
    const commerce = (buildings.market || 0) * 8 + (buildings.guildhall || 0) * 12 + (buildings.harbor || 0) * 16 + (buildings.fair || 0) * 10 + (buildings.bank || 0) * 12 + (buildings.exchange || 0) * 18;
    const supply = people > 0 && finite(state.resources?.food) > 0 ? clamp((foodCapacity + Math.min(finite(state.resources?.food), people * .3)) / Math.max(1, people * .3), 0, 1) : 0;
    const tradeBase = (state.neighbors || []).reduce((total, nation) => total + (nation.tradeOpen && !nation.embargo && nation.tension < 65 && nation.relation >= 15 ? Math.max(0, finite(nation.tradeLast?.importValue??nation.tradeLast?.imported)) : 0), 0);
    const bases = {
      poll: people * .12 * taxableShare * supply,
      land: foodCapacity * .35 * taxableShare * supply,
      domestic: Math.min(people * .09, commerce + people * .018 + production * .3) * supply,
      customs: tradeBase,
      vat: Math.min(people * .13, people * .025 + production * 1.2 + commerce * .7) * supply
    };
    const lines = definitions.map(definition => {
      const rate = root.CivilStatecraft.taxRate(state,definition.id);
      const base = Math.max(0, bases[definition.id])*(definition.id==='customs'?1:(hasCurrency(state)?state.economy?.activity??1:1)*(root.CivilPolitics?.average(state,root.CivilPolitics.compliance)??1));
      const revenue=definition.id==='customs'?(state.neighbors||[]).reduce((v,n)=>v+(n.tradeOpen&&!n.embargo&&n.tension<65&&n.relation>=15?(n.tradeLast?.importValue??n.tradeLast?.imported??0)*(root.CivilTerritory?.tariffs(state,n).domestic??rate):0),0):base*rate*root.CivilStatecraft.currencyShare(state);
      return { ...definition, rate, base, revenue };
    });
    const active = Object.fromEntries(lines.map(line => [line.id, line.rate]));
    const burden = clamp((active.poll || 0) * 1.5 + (active.land || 0) * .5 + (active.domestic || 0) * 1.2 + (active.vat || 0) + (active.customs || 0) * .25, 0, 1);
    return {
      lines, total: lines.reduce((sum, line) => sum + line.revenue, 0), burden, taxableShare,
      foodPenalty: clamp((active.poll || 0) * .18 + (active.land || 0) * .35 + (active.domestic || 0) * .08 + (active.vat || 0) * .12, 0, .35),
      woodPenalty: clamp(burden * .15, 0, .25), stonePenalty: clamp(burden * .15, 0, .25),
      tradePenalty: clamp((active.customs || 0) * 1.5 + (active.domestic || 0) * .5 + (active.vat || 0) * .2, 0, .65),
      stabilityPenalty: clamp(burden * 24, 0, 24)
    };
  }

  function setTax(state, id, rate) {
    initialize(state);
    const definition = visibleTaxes(state, ledger(state)).find(item => item.id === id);
    if (!definition) return { ok: false, message: '当前无法征收这项税。' };
    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0 || value > definition.max) return { ok: false, message: '税率超出可用范围。' };
    const before=taxQuote(state);
    const old = root.CivilStatecraft.taxRate(state,id);
    if (Math.abs(state.taxation.rates[id] - value) < .000001) return { ok: true, message: '税率未变。' };
    if(state.taxation.transitions)delete state.taxation.transitions[id];
    state.taxation.rates[id] = value;
    if (id === 'poll' && state.budget) state.budget.taxRate = value;
    const increase = Math.max(0, value - old);
    if (increase) state.stability = clamp(finite(state.stability, 76) - increase * 16, 0, 100);
    if (id === 'land' && !state.taxation.exemptNobles) state.nobles.support = clamp(state.nobles.support - increase * 30, 0, 100);
    const church = clergy(state);
    if (church && id === 'land' && !state.taxation.exemptClergy) church.support = clamp(church.support - increase * 30, 0, 100);
    const after=taxQuote(state);
    const delta=after.total-before.total;
    state.taxation.transitions||={};state.taxation.transitions[id]={from:old,to:value,age:0};
    state.taxation.lastChange={id,old,rate:value,revenueDelta:delta,burdenDelta:after.burden-before.burden,time:now(state)};
    return { ok: true, message: `${definition.name} ${(old*100).toFixed(0)}% → ${(value*100).toFixed(0)}% · 预计税收 ${delta>=0?'+':''}${delta.toFixed(1)}/年`, drawback: definition.drawback };
  }

  function setExemption(state, group, exempt) {
    initialize(state);
    const organization = group === 'nobles' ? state.nobles : group === 'clergy' ? clergy(state) : null;
    if (!hasCurrency(state) || !organization || organization.influence <= 0 || typeof exempt !== 'boolean') return { ok: false, message: '当前无法修改这项豁免。' };
    const key = group === 'nobles' ? 'exemptNobles' : 'exemptClergy';
    if (state.taxation[key] === exempt) return { ok: true, message: '豁免安排未变。' };
    state.taxation[key] = exempt;
    organization.support = clamp(organization.support + (exempt ? 12 : -20), 0, 100);
    if (!exempt) state.stability = clamp(finite(state.stability, 76) - organization.influence * .08, 0, 100);
    return { ok: true, message: `${group === 'nobles' ? '贵族' : '宗教地产'}${exempt ? '享有税收豁免' : '纳入税基'}` };
  }

  function costFor(state, amount, material = 'food') {
    return hasCurrency(state) ? { treasury: amount } : { [material]: Math.ceil(amount * 1.4) };
  }

  function pay(state, cost) {
    if (!state.resources || Object.entries(cost).some(([resource, amount]) => finite(state.resources[resource]) + .000001 < amount)) return false;
    for (const [resource, amount] of Object.entries(cost)) state.resources[resource] = Math.max(0, finite(state.resources[resource]) - amount);
    return true;
  }

  function cultureOptions(state) {
    initialize(state);
    const buildings = ledger(state), church = clergy(state), people = population(state), policy = state.culture.policy;
    const actions = [
      { id: 'festival', name: '举办节庆', cost: { food: Math.ceil(Math.max(12, people * .012)) }, drawback: '筹办占用粮食与劳动，凝聚力会逐渐提升。', years: 5, regionSelectable: true },
      { id: 'preserve', name: '保存地方传统', cost: costFor(state, Math.ceil(Math.max(10, people * .003))), drawback: '整理传统需要长期投入，不会立即改变居民认同。', years: 20, regionSelectable: true }
    ];
    if (buildings.shrine || buildings.temple || church) actions.push({ id: 'religious', name: '资助宗教公共事务', cost: costFor(state, Math.ceil(Math.max(16, people * .004))), drawback: '救济与传授得到支持，宗教团体也将扩大影响并要求持续资助。', years: 15, active: policy.patronage === 'religious' });
    if (buildings.plaza || buildings.theater || buildings.council) actions.push({ id: 'civic', name: '资助公共文化', cost: costFor(state, Math.ceil(Math.max(18, people * .004))), drawback: '公共活动需要持续拨款，原有团体会争论资源分配。', years: 15, active: policy.patronage === 'civic' });
    if (policy.patronage !== 'none') actions.push({ id: 'patronage-none', name: '停止专项资助', cost: {}, drawback: '停止开支，当前资助带来的服务与支持将逐渐消退。' });
    if (buildings.temple || state.settlements?.length > 1) {
      actions.push({ id: 'tolerant', name: '保障信仰宽容', cost: {}, drawback: '各团体保留活动空间，要求统一信仰者可能反对。', active: policy.tolerance === 'tolerant' });
      actions.push({ id: 'restrictive', name: '限制异教活动', cost: costFor(state, Math.ceil(Math.max(12, people * .002))), drawback: '受限制居民抵触，地区凝聚力和政府信任可能下降。', active: policy.tolerance === 'restrictive' });
    }
    if (buildings.temple && state.cityFounded) {
      actions.push({ id: 'statefaith', name: '确立国家宗教', cost: costFor(state, Math.ceil(Math.max(30, people * .006))), drawback: '宗教团体协助协调社会，但会争取土地和税收特权，其他信仰者也会反对。', years: 25, active: policy.establishment === 'state' });
      actions.push({ id: 'plural', name: '取消官方信仰地位', cost: costFor(state, Math.ceil(Math.max(20, people * .004))), drawback: '保障各信仰同等地位，原有特权团体会抵制。', years: 20, active: policy.establishment === 'plural' });
    }
    if (industrial(state, buildings) && buildings.publicschool) actions.push({ id: 'secular', name: '推行政教分立', cost: costFor(state, Math.ceil(Math.max(60, people * .01))), drawback: '公共机构与宗教权力逐渐分离；原有组织会反对失去政治特权。', years: 35, active: policy.establishment === 'secular' });
    return { actions, policies: { ...policy }, upkeep: patronageUpkeep(state), regions: (state.settlements || []).map(settlement => ({ id: settlement.id, name: settlement.name })) };
  }

  function regionScope(state, regionId) {
    return regionId === 'all' ? state.settlements || [] : (state.settlements || []).filter(settlement => settlement.id === regionId);
  }

  function cultureAction(state, action, regionId = 'all') {
    initialize(state);
    const option = cultureOptions(state).actions.find(item => item.id === action);
    const scope = regionScope(state, regionId);
    if (!option || !scope.length || (!option.regionSelectable && regionId !== 'all')) return { ok: false, message: '当前无法实行这项安排。' };
    if (option.active) return { ok: true, message: '这项安排正在实施。' };
    const cooldownKeys = scope.map(settlement => `${action}:${settlement.id}`);
    if (cooldownKeys.some(key => finite(state.culture.cooldowns[key]) > now(state))) return { ok: false, message: '这项活动仍在进行。' };
    const share = scope.reduce((sum, settlement) => sum + Math.max(0, finite(settlement.population)), 0) / Math.max(1, population(state));
    const cost = option.regionSelectable ? Object.fromEntries(Object.entries(option.cost).map(([key, value]) => [key, Math.ceil(value * share)])) : option.cost;
    if (!pay(state, cost)) return { ok: false, message: '公共储备不足。' };
    const culture = state.culture, policy = culture.policy, church = clergy(state);
    if (action === 'festival' || action === 'preserve') {
      for (const settlement of scope) {
        culture.regions[settlement.id][action === 'festival' ? 'festivalUntil' : 'preservationUntil'] = now(state) + option.years;
        culture.cooldowns[`${action}:${settlement.id}`] = now(state) + (action === 'festival' ? 5 : 15);
      }
    } else if (['religious', 'civic', 'patronage-none'].includes(action)) {
      const old = policy.patronage;
      policy.patronage = action === 'patronage-none' ? 'none' : action;
      if (church) church.support = clamp(church.support + (action === 'religious' ? 7 : old === 'religious' ? -9 : 0), 0, 100);
      culture.patronagePaused = false;
    } else if (action === 'tolerant' || action === 'restrictive') {
      policy.tolerance = action;
      if (church) church.support = clamp(church.support + (action === 'tolerant' ? -3 : 3), 0, 100);
      if (action === 'restrictive') state.stability = clamp(finite(state.stability, 76) - 4, 0, 100);
    } else {
      const old = policy.establishment;
      policy.establishment = { statefaith: 'state', plural: 'plural', secular: 'secular' }[action];
      culture.transition = { from: old, to: policy.establishment, started: now(state), years: option.years, progress: 0 };
      if (church) church.support = clamp(church.support + (action === 'statefaith' ? 12 : -18), 0, 100);
      state.stability = clamp(finite(state.stability, 76) - (action === 'secular' ? 8 : 4), 0, 100);
    }
    return { ok: true, message: `${option.name}已安排`, cost, drawback: option.drawback };
  }

  function nobleOptions(state) {
    initialize(state);
    const nobles = state.nobles;
    if (!nobles.established) return [];
    const people = population(state), buildings = ledger(state);
    const actions = [
      { id: 'service', name: '征召贵族协助', cost: { food: Math.ceil(Math.max(20, people * .008)), ...costFor(state, 18, 'wood') }, drawback: '贵族提供动员和协调，也将增强政治影响。', years: 15, disabled: !!state.unrest?.noble.refusing || finite(nobles.serviceUntil) > now(state) },
      { id: 'privileges', name: '确认领地特权', cost: costFor(state, Math.ceil(Math.max(18, people * .003))), drawback: '换取贵族支持，但领地份额与长期政治影响扩大。', years: 20, disabled: !!nobles.reform || finite(nobles.privilegeCooldown) > now(state) }
    ];
    if (buildings.council && finite(state.knowledge) >= 45 && nobles.privilege !== 'limited') actions.unshift({ id: 'charter', name: '制定领地权责宪章', cost: costFor(state, Math.ceil(Math.max(35, people * .01))), drawback: '逐渐限制领地特权；贵族会抵制，短期内动员与公众信任承压。', years: 12 + nobles.influence * .15, disabled: !!nobles.reform });
    return actions;
  }

  function nobleAction(state, action) {
    initialize(state);
    const option = nobleOptions(state).find(item => item.id === action);
    if(action==='service'&&state.unrest?.noble.refusing)return {ok:false,message:'贵族拒绝征召；先改善支持或协商领地权责。'};
    if (!option || option.disabled) return { ok: false, message: '当前无法实行这项安排。' };
    if (!pay(state, option.cost)) return { ok: false, message: '公共储备不足。' };
    const nobles = state.nobles;
    if (action === 'charter') {
      nobles.reform = { started: now(state), years: option.years, progress: 0, fromInfluence: nobles.influence, fromLandShare: nobles.landShare };
      nobles.support = clamp(nobles.support - 18, 0, 100);
      state.stability = clamp(finite(state.stability, 76) - nobles.influence * .12, 0, 100);
    } else if (action === 'service') {
      nobles.serviceUntil = now(state) + option.years;
      nobles.support = clamp(nobles.support + 10, 0, 100);
      nobles.influence = clamp(nobles.influence + 3, 0, 100);
      if (nobles.reform) nobles.reform.fromInfluence = clamp(nobles.reform.fromInfluence + 3, 0, 100);
    } else {
      nobles.privilegeCooldown = now(state) + option.years;
      nobles.support = clamp(nobles.support + 16, 0, 100);
      nobles.influence = clamp(nobles.influence + 8, 0, 100);
      nobles.landShare = clamp(nobles.landShare + .03, 0, .65);
    }
    return { ok: true, message: `${option.name}已安排`, drawback: option.drawback };
  }

  function patronageUpkeep(state) {
    if (state.culture.policy.patronage === 'none') return {};
    return hasCurrency(state) ? { treasury: Math.max(.6, population(state) * .002) } : { food: Math.max(.3, population(state) * .006) };
  }

  function cultureSummary(state) {
    initialize(state);
    const buildings = ledger(state), church = clergy(state), nobles = state.nobles, culture = state.culture;
    const result = { tradition: 0, cohesion: 0, faith: { local: 0, organized: 0, secular: 0 } };
    const total = (state.settlements || []).reduce((sum, settlement) => sum + Math.max(0, finite(settlement.population)), 0);
    for (const settlement of state.settlements || []) {
      const weight = Math.max(0, finite(settlement.population)) / Math.max(1, total), region = culture.regions[settlement.id];
      result.tradition += region.tradition * weight;
      result.cohesion += region.cohesion * weight;
      Object.keys(result.faith).forEach(key => { result.faith[key] += region.faith[key] * weight; });
    }
    const patronage = culture.patronagePaused ? 'none' : culture.policy.patronage;
    const coordination = church ? (church.support - 45) * church.influence / 1000 : 0;
    const nobleCoordination = nobles.established ? (nobles.support - 50) * nobles.influence / 1500 : 0;
    const upkeep = patronageUpkeep(state);
    return {
      ...result, clergyInfluence: church?.influence || 0, clergySupport: church?.support || 0,
      clergyLandShare: church?.landShare || 0, nobleInfluence: nobles.influence, nobleSupport: nobles.support, nobleLandShare: nobles.landShare,
      knowledgeBonus: Math.min(12, (buildings.shrine || 0) * .08 + (buildings.temple || 0) * .35 + (buildings.theater || 0) * .3 + (buildings.printing || 0) * 1.5 + (buildings.museum || 0) * 1.2 + (patronage === 'religious' ? .7 : patronage === 'civic' ? .9 : 0)),
      stabilityBonus: clamp((result.cohesion - 70) * .16 + coordination + nobleCoordination, -12, 10),
      warSupport: clamp(finite(state.stability, 76) + (result.cohesion - 65) * .28 + coordination * 2 + nobleCoordination * 2 + (finite(nobles.serviceUntil) > now(state) ? 8 : 0), 0, 100),
      treasuryUpkeep: upkeep.treasury || 0, foodUpkeep: upkeep.food || 0, patronagePaused: !!culture.patronagePaused,
      policies: { ...culture.policy }, transition: culture.transition || null, nobleReform: nobles.reform || null
    };
  }

  function emit(state, title, body, key) {
    state.eventSeen ||= {};
    if (state.eventSeen[key] != null && now(state) - state.eventSeen[key] < 40) return;
    state.eventSeen[key] = now(state);
    state.eventSerial = Math.max(0, finite(state.eventSerial)) + 1;
    const item = { id: `${state.id || 'world'}-${state.eventSerial}`, kind: 'milestone', title, body, time: finite(state.year, now(state)), data: { dedupe: key, society: true } };
    state.events ||= [];
    state.history ||= [];
    item.priority=root.CivilEngine?.eventPriority(item)||'minor';state.events.push(item);
    state.history.unshift(item);
    while(state.events.length>16){const i=state.events.findIndex(e=>(root.CivilEngine?.eventPriority(e)||e.priority)!=='major');if(i<0)break;state.events.splice(i,1);}
    if (state.history.length > 180) state.history.length = 180;
  }

  function tick(state, years) {
    initialize(state);
    const dt = clamp(years, 0, 120);
    if (!dt) return state;
    cultureReport(state, dt);
    const quote = taxQuote(state);
    if (hasCurrency(state)) state.resources.treasury = clamp(finite(state.resources.treasury) + quote.total * dt, 0, 9999999);
    state.taxation.totalCollected=(state.taxation.totalCollected||0)+quote.total*dt;
    state.taxation.collections ||= {};
    for(const line of quote.lines)state.taxation.collections[line.id]=(state.taxation.collections[line.id]||0)+line.revenue*dt;
    state.taxation.last = { total: quote.total, burden: quote.burden, collected: quote.total * dt, time: now(state),lines:quote.lines.map(l=>({id:l.id,collected:l.revenue*dt})) };
    const customs = quote.lines.find(line => line.id === 'customs');
    for (const nation of state.neighbors || []) {
      if (nation.tradeLast) nation.tradeLast.tariff = hasCurrency(state)&&nation.tradeOpen&&!nation.embargo&&nation.tension<65&&nation.relation>=15?Math.max(0,finite(nation.tradeLast.importValue??nation.tradeLast.imported))*(root.CivilTerritory?.tariffs(state,nation).domestic??customs?.rate??0):0;
      if(nation.tradeTotals)nation.tradeTotals.domesticTariff=(nation.tradeTotals.domesticTariff||0)+(nation.tradeLast?.tariff||0)*dt;
    }
    const culture = state.culture, policy = culture.policy, church = clergy(state), nobles = state.nobles;
    const buildings = ledger(state), upkeep = patronageUpkeep(state);
    const wasPaused = culture.patronagePaused;
    culture.patronagePaused = !pay(state, Object.fromEntries(Object.entries(upkeep).map(([resource, amount]) => [resource, amount * dt])));
    if (culture.patronagePaused && !wasPaused) emit(state, '文化资助暂缓', '公共储备不足，专项活动与服务暂缓。', 'society:patronage-paused');
    const patronage = culture.patronagePaused ? 'none' : policy.patronage;
    const tradeExposure = Math.min(1, (state.neighbors || []).filter(nation => nation.tradeOpen && !nation.embargo).length * .18);
    for (const settlement of state.settlements || []) {
      const region = culture.regions[settlement.id], local = ledger(state, settlement.id);
      const festive = finite(region.festivalUntil) > now(state), preserving = finite(region.preservationUntil) > now(state);
      const civicSites = Math.min(6, (local.plaza || 0) + (local.theater || 0) + (local.museum || 0));
      const supply = clamp(finite(state.resources.food) / Math.max(1, population(state) * .3), 0, 1);
      const minority = policy.establishment === 'state' ? (100 - region.faith.organized) / 100 : Math.min(region.faith.local, region.faith.organized) / 100;
      const discrimination = policy.tolerance === 'restrictive' ? minority * 23 : 0;
      const transitionPressure = culture.transition && culture.transition.progress < 100 ? 3 : 0;
      const cohesionTarget = clamp(63 + finite(state.stability, 76) * .1 + civicSites * 1.3 + (patronage !== 'none' ? 2 : 0) + (festive ? 9 : 0) - (1 - supply) * 14 - discrimination - transitionPressure, 10, 97);
      region.cohesion = approach(region.cohesion, cohesionTarget, dt, festive ? 2 : 12);
      const traditionTarget = clamp(71 + (preserving ? 13 : 0) + (local.shrine || 0) * 2 + (local.museum || 0) * 3 - tradeExposure * 5, 30, 95);
      region.tradition = approach(region.tradition, traditionTarget, dt, 32);
      const before = region.faith;
      let target = { ...before };
      if (policy.establishment === 'state') target = { local: 10, organized: 85, secular: 5 };
      else if (policy.establishment === 'secular') target = { local: 15, organized: 45, secular: 40 };
      else {
        // Contact broadens experience; diversity itself carries no penalty.
        const organizedTarget = church ? Math.max(before.organized, Math.min(62, 18 + (local.temple || 0) * 20)) : before.organized;
        const secularTarget = Math.max(before.secular, (local.publicschool ? 10 : 0) + tradeExposure * 4);
        target = normalizeFaith({ local: Math.max(0, 100 - organizedTarget - secularTarget), organized: organizedTarget, secular: secularTarget });
      }
      region.faith = normalizeFaith(Object.fromEntries(Object.keys(target).map(key => [key, approach(before[key], target[key], dt, policy.establishment === 'plural' ? 80 : 40)])));
    }
    if (culture.transition) {
      culture.transition.progress = clamp((now(state) - culture.transition.started) / culture.transition.years * 100, 0, 100);
      if (culture.transition.progress >= 100) {
        emit(state, '宗教制度调整完成', '新的公共机构与宗教权责已逐渐落实到各地区。', `society:faith:${culture.transition.to}:${culture.transition.started}`);
        culture.transition = null;
      }
    }
    if (church) {
      const influenceTarget = clamp(20 + Math.min(18, (buildings.temple || 0) * 3) + (patronage === 'religious' ? 12 : 0) + (policy.establishment === 'state' ? 18 : policy.establishment === 'secular' ? -15 : 0), 5, 85);
      const supportTarget = clamp(57 + (state.taxation.exemptClergy ? 6 : -9) + (patronage === 'religious' ? 10 : 0) + (policy.establishment === 'state' ? 8 : policy.establishment === 'secular' ? -8 : 0), 10, 92);
      church.influence = approach(church.influence, influenceTarget, dt, 28);
      church.support = approach(church.support, supportTarget, dt, 20);
      if (policy.establishment === 'state') church.landShare = approach(church.landShare, .17, dt, 60);
    }
    if (nobles.established) {
      const supportTarget = clamp(55 + (state.taxation.exemptNobles ? 7 : -10) + (nobles.privilege === 'limited' ? -5 : 0) + (finite(nobles.serviceUntil) > now(state) ? 8 : 0) - (nobles.reform ? 15 : 0), 5, 90);
      nobles.support = approach(nobles.support, supportTarget, dt, 22);
      if (nobles.reform) {
        const reform = nobles.reform;
        if(state.unrest?.noble.refusing)reform.started+=dt*.5;
        const progress = clamp((now(state) - reform.started) / reform.years, 0, 1);
        reform.progress = progress * 100;
        nobles.influence = Math.max(8, reform.fromInfluence - 22 * progress);
        nobles.landShare = Math.max(.02, reform.fromLandShare - .06 * progress);
        if (progress >= 1) {
          nobles.privilege = 'limited'; nobles.reform = null;
          emit(state, '领地宪章落实', '贵族领地与公共权力的边界已逐步确立。', `society:noble-charter:${reform.started}`);
        }
      }
    }
    return state;
  }

  function cultureReport(state, dt) {
    const c=state.culture;
    c.reportClock=(c.reportClock||0)+dt;
    if(c.reportClock<50)return;
    c.reportClock-=50;
    const summary=cultureSummary(state), before=c.lastReport||summary;
    c.lastReport={tradition:summary.tradition,cohesion:summary.cohesion,organized:summary.faith.organized,secular:summary.faith.secular};
    emit(state,'五十年文化报告',`文化传承 ${Math.round(summary.tradition)}（${summary.tradition>=before.tradition?'+':''}${Math.round(summary.tradition-before.tradition)}）· 社会凝聚 ${Math.round(summary.cohesion)} · 教团影响 ${Math.round(summary.clergyInfluence)}。文化主要由人口流动、教育、贸易和地方传统共同形成。`,'society:culture-report:'+Math.floor(state.elapsed/50));
    const church=clergy(state), home=state.settlements?.[0];
    if(church&&church.influence>=72&&!c.churchCity&&home&&state.settlements.length<12){
      let spot=null;
      for(let i=1;i<80&&!spot;i++){const a=i*2.399963,r=900+(i%7)*80,p={x:home.x+Math.cos(a)*r,y:home.y+Math.sin(a)*r};if(p.x>80&&p.y>80&&p.x<4016&&p.y<4016&&!state.settlements.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<500)&&!root.CivilTerrain.sample(p.x,p.y,state.seed,state.geographyVersion||1).water)spot=p;}
      if(spot){const id='church-city-'+(++state.settlementSerial);const city={id,name:'圣城',x:spot.x,y:spot.y,population:18,level:0,radius:150,territoryRadius:300,founded:state.elapsed,architectureRegion:'sacred'};state.settlements.push(city);state.explored.push({x:city.x,y:city.y,radius:360});
        const add=(type,dx,dy)=>{const bid='building-'+(++state.buildingSerial);state.buildings.push({id:bid,type,x:spot.x+dx,y:spot.y+dy,size:1,status:'complete',progress:100,settlementId:id,started:state.year});};
        add('hut',-22,-12);add('hut',24,16);add('hut',-5,34);add('farm',62,-36);add('shrine',-55,50);
        state.population=state.settlements.reduce((n,s)=>n+s.population,0);c.regions[id]={tradition:64,cohesion:82,faith:{local:8,organized:88,secular:4},identity:city.name,festivalUntil:0,preservationUntil:0};c.churchCity=id;emit(state,'远方教会城市建立','宗教组织在远离核心的地区建立了教会城市，成为朝圣、教育与跨地区联络的中心。','society:church-city');}
    }
  }

  root.CivilSociety = { initialize, tick, taxOptions, taxQuote, setTax, setExemption, cultureOptions, cultureAction, cultureSummary, nobleOptions, nobleAction };
})(typeof window !== 'undefined' ? window : globalThis);
