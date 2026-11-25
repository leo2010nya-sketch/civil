 (function (root) {
  'use strict';

  const VERSION = 3;
  const WORLD_SIZE = 4096;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
  const cleanNumber = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const allResources = ['food', 'wood', 'stone', 'treasury'];
  const buildingDefinitions = [
    { id: 'hut', name: '茅草屋', icon: 'house', desc: '为七位村民提供住所。房屋会真实出现在聚落里。', cost: { wood: 18, stone: 2 }, years: 1.2, requiredPopulation: 0, housing: 7, footprint: 17, small: true },
    { id: 'farm', name: '开垦农田', icon: 'sprout', desc: '开辟一片耕地，持续增加粮食供给。', cost: { wood: 22, stone: 4 }, years: 1.8, requiredPopulation: 0, foodRate: 9, footprint: 35, small: true },
    { id: 'lumber', name: '伐木营地', icon: 'tree', desc: '沿林缘组织伐木，为聚落持续提供木材。', cost: { food: 12, wood: 18 }, years: 1.5, requiredPopulation: 0, woodRate: 8, footprint: 23, small: true },
    { id: 'well', name: '水井', icon: 'water', desc: '提供稳定的饮水，改善聚落生活与人口承载。', cost: { wood: 18, stone: 22 }, years: 2, requiredPopulation: 0, housing: 4, stability: 3, footprint: 13, small: true },
    { id: 'granary', name: '公共粮仓', icon: 'grain', desc: '集中存储粮食，提高粮食安全与稳定性。', cost: { wood: 55, stone: 24 }, years: 5, requiredPopulation: 0, foodRate: 3, stability: 4, footprint: 24, small: false },
    { id: 'path', name: '村落道路', icon: 'road', desc: '联结屋舍和公共建筑，促进物资与政策流动。', cost: { wood: 10, stone: 12 }, years: 1, requiredPopulation: 0, productivity: 2, footprint: 12, small: true },
    { id: 'workshop', name: '手工作坊', icon: 'hammer', desc: '制作更耐用的工具，并开始积累生产知识。', cost: { food: 15, wood: 48, stone: 18 }, years: 4, requiredPopulation: 42, stoneRate: 3, knowledgeRate: 0.9, footprint: 23, small: false },
    { id: 'council', name: '议事屋', icon: 'council', desc: '建立正式公共议程，解锁预算与更完整的制度改革。', cost: { food: 25, wood: 72, stone: 35 }, years: 7, requiredPopulation: 50, admin: 12, knowledgeRate: 0.5, footprint: 30, small: false },
    { id: 'quarry', name: '采石场', icon: 'stone', desc: '组织石材开采，为大型公共工程提供材料。', cost: { food: 22, wood: 45 }, years: 4, requiredPopulation: 45, stoneRate: 7, footprint: 30, small: false },
    { id: 'bridge', name: '河上木桥', icon: 'bridge', desc: '连接两岸，改善贸易与远处地区的政策传导。', cost: { food: 32, wood: 110, stone: 35 }, years: 9, requiredPopulation: 65, productivity: 5, admin: 6, footprint: 35, small: false },
    { id: 'market', name: '河畔集市', icon: 'market', desc: '让地区交换形成稳定网络，带来公共收入。', cost: { food: 35, wood: 90, stone: 38 }, years: 8, requiredPopulation: 85, treasuryRate: 4, productivity: 4, footprint: 31, small: false },
    { id: 'school', name: '学习屋', icon: 'book', desc: '把口述经验变成共同知识，逐渐打开新的制度与技术。', cost: { food: 35, wood: 95, stone: 42 }, years: 8, requiredPopulation: 100, knowledgeRate: 2, footprint: 26, small: false },
    { id: 'canal', name: '灌溉水渠', icon: 'canal', desc: '大型水利建设，持续提升农田产出与地区承载。', cost: { food: 70, wood: 170, stone: 140 }, years: 14, requiredPopulation: 150, foodRate: 35, housing: 14, footprint: 45, small: false },
    { id: 'forge', name: '金属工坊', icon: 'forge', desc: '开展金属加工，提升生产效率和工程能力。', cost: { food: 80, wood: 180, stone: 150, treasury: 40 }, years: 14, requiredPopulation: 180, requiredKnowledge: 25, stoneRate: 10, woodRate: 8, productivity: 8, footprint: 31, small: false },
    { id: 'library', name: '公共书库', icon: 'book', desc: '集中知识、计量与地区记录，推动早期国家形成。', cost: { food: 70, wood: 190, stone: 160, treasury: 65 }, years: 14, requiredPopulation: 240, requiredKnowledge: 40, knowledgeRate: 5, admin: 10, footprint: 32, small: false },
    { id: 'factory', name: '工业工场', icon: 'factory', desc: '以机械化生产完成生产方式的跃迁。', cost: { wood: 310, stone: 360, treasury: 240 }, years: 22, requiredPopulation: 400, requiredKnowledge: 100, woodRate: 25, stoneRate: 23, treasuryRate: 12, productivity: 15, footprint: 44, small: false },
    { id: 'hospital', name: '公共医院', icon: 'health', desc: '建立公共卫生体系，提高人口承载与生活稳定。', cost: { wood: 290, stone: 330, treasury: 250 }, years: 20, requiredPopulation: 500, requiredKnowledge: 140, housing: 80, stability: 10, footprint: 38, small: false },
    { id: 'power', name: '清洁能源站', icon: 'power', desc: '为现代聚落与产业提供可靠能源。', cost: { wood: 300, stone: 550, treasury: 650 }, years: 27, requiredPopulation: 700, requiredKnowledge: 210, productivity: 22, treasuryRate: 16, footprint: 45, small: false },
    { id: 'research', name: '未来研究中心', icon: 'research', desc: '将知识与自动化用于下一次文明转型。', cost: { wood: 450, stone: 750, treasury: 1100 }, years: 30, requiredPopulation: 1000, requiredKnowledge: 320, knowledgeRate: 14, productivity: 30, footprint: 46, small: false }
  ];

  buildingDefinitions.push(
    {id:'palisade',name:'木栅围栏',icon:'palisade',category:'defense',desc:'木栅与门岗保护聚落储备，减少袭扰损失。',cost:{wood:45,food:8},years:2,defense:8,footprint:40,small:true},
    {id:'watchtower',name:'瞭望塔',icon:'watchtower',category:'defense',desc:'值守人员提前发现来犯者，减轻物资损失。',cost:{wood:48,stone:18,food:12},years:3,requiredPopulation:50,requiredKnowledge:3,requiredBuildings:['workshop'],defense:10,admin:2,footprint:17,small:true},
    {id:'wall',name:'石砌城墙',icon:'wall',category:'defense',desc:'城墙、门楼与守备设施共同保护城市。',cost:{wood:95,stone:220,food:35},years:10,requiredCityPopulation:180,requiredKnowledge:20,requiredBuildings:['council','quarry'],defense:25,footprint:55,small:false},
    {id:'windmill',name:'风车',icon:'windmill',category:'production',desc:'利用风力磨粮，减少加工损耗；需要已有农田供粮。',cost:{wood:95,stone:48},years:5,requiredPopulation:120,requiredKnowledge:15,requiredBuildings:['workshop','granary'],foodEfficiency:.12,productivity:3,footprint:28,small:false},
    {id:'watermill',name:'水磨坊',icon:'watermill',category:'production',desc:'靠近河流建设，以水力磨粮并加工木石。',cost:{wood:130,stone:80},years:7,requiredCityPopulation:240,requiredKnowledge:30,requiredBuildings:['workshop','bridge'],location:'river',foodEfficiency:.15,woodRate:4,stoneRate:2,productivity:5,footprint:32,small:false},
    {id:'warehouse',name:'物资仓库',icon:'warehouse',category:'production',desc:'集中调配工地材料，提高公共工程施工效率。',cost:{wood:110,stone:65},years:5,requiredCityPopulation:180,requiredKnowledge:25,requiredBuildings:['market'],constructionBonus:.08,admin:3,footprint:32,small:false},
    {id:'townhouse',name:'城镇民居',icon:'townhouse',category:'housing',desc:'多层屋舍组成的住区，可供七十位居民生活。',cost:{wood:100,stone:80},years:4,requiredCityPopulation:180,requiredKnowledge:35,requiredBuildings:['council','market'],housing:70,footprint:25,small:true},
    {id:'apartment',name:'集合住宅',icon:'apartment',category:'housing',desc:'密集住宅街区，容纳三百五十位居民。',cost:{wood:220,stone:300,treasury:90},years:7,requiredCityPopulation:1500,requiredKnowledge:80,requiredBuildings:['warehouse','academy'],housing:350,footprint:34,small:false},
    {id:'clinic',name:'医馆',icon:'clinic',category:'civic',desc:'集中治疗与照护经验，改善公共生活。',cost:{food:35,wood:75,stone:60},years:5,requiredCityPopulation:180,requiredKnowledge:30,requiredBuildings:['school'],stability:5,knowledgeRate:.6,footprint:26,small:false},
    {id:'academy',name:'书院',icon:'academy',category:'civic',desc:'组织专门学问与技艺研究，培养专业人才。',cost:{wood:150,stone:130,treasury:55},years:9,requiredCityPopulation:600,requiredKnowledge:60,requiredBuildings:['library'],knowledgeRate:5,admin:4,footprint:32,small:false},
    {id:'estate',name:'农庄',icon:'estate',category:'production',desc:'连片耕地、谷仓和磨粮设施共同供养扩大的城市。',cost:{food:50,wood:180,stone:65},years:7,requiredCityPopulation:600,requiredKnowledge:55,requiredBuildings:['granary','windmill'],foodRate:220,footprint:68,small:false},
    {id:'machineworks',name:'机械作坊',icon:'machineworks',category:'production',desc:'把金属工艺与水力机械结合，为大规模生产准备设备。',cost:{wood:240,stone:220,treasury:120},years:12,requiredCityPopulation:3000,requiredKnowledge:110,requiredBuildings:['forge','watermill'],woodRate:18,stoneRate:14,productivity:10,footprint:38,small:false},
    {id:'publicschool',name:'公立学校',icon:'publicschool',category:'civic',desc:'工业化之后建立的公共学校，提供大规模教育的设施基础。',cost:{wood:260,stone:290,treasury:180},years:10,requiredCityPopulation:10000,requiredKnowledge:190,requiredIndustry:true,requiredBuildings:['school','council'],knowledgeRate:12,admin:5,footprint:37,small:false},
    {id:'railstation',name:'铁路货站',icon:'railstation',category:'production',desc:'联接大批物资运输与工业生产，改善工程和治理效率。',cost:{wood:420,stone:500,treasury:360},years:16,requiredCityPopulation:12000,requiredKnowledge:230,requiredIndustry:true,requiredBuildings:['factory','machineworks'],constructionBonus:.16,productivity:14,admin:10,footprint:45,small:false},
    {id:'steamplant',name:'蒸汽动力站',icon:'steamplant',category:'production',desc:'向工业设备供应集中动力，提高生产能力。',cost:{wood:380,stone:450,treasury:300},years:15,requiredCityPopulation:10000,requiredKnowledge:210,requiredIndustry:true,requiredBuildings:['factory'],woodRate:28,stoneRate:24,productivity:18,footprint:40,small:false}
  );
  const buildingRequirements={
    council:{requiredBuildings:['granary']},quarry:{requiredBuildings:['workshop'],requiredKnowledge:1},
    bridge:{requiredBuildings:['workshop'],requiredKnowledge:5},market:{requiredBuildings:['council'],requiredKnowledge:5},
    school:{requiredBuildings:['workshop'],requiredKnowledge:8},canal:{requiredBuildings:['quarry','granary'],requiredKnowledge:15},
    forge:{requiredBuildings:['workshop','quarry']},library:{requiredBuildings:['school','council']},
    factory:{requiredPopulation:0,requiredCityPopulation:10000,requiredKnowledge:180,requiredBuildings:['machineworks','warehouse']},
    hospital:{requiredPopulation:0,requiredCityPopulation:15000,requiredKnowledge:240,requiredIndustry:true,requiredBuildings:['clinic','publicschool']},
    power:{requiredPopulation:0,requiredCityPopulation:25000,requiredKnowledge:320,requiredIndustry:true,requiredBuildings:['steamplant','railstation']},
    research:{requiredPopulation:0,requiredCityPopulation:50000,requiredKnowledge:500,requiredIndustry:true,requiredBuildings:['academy','publicschool','power']}
  };
  buildingDefinitions.forEach(d=>{Object.assign(d,buildingRequirements[d.id]||{});d.category ||= d.housing&&!d.foodRate?'housing':['foodRate','woodRate','stoneRate','productivity'].some(k=>d[k])?'production':'civic';});

  const policyDefinitions = [
    { id: 'forage', name: '共同采集', icon: 'sprout', desc: '组织村民沿河采集，优先保障食物供给。', cost: {}, requiredPopulation: 0, spreadYears: 3, foodBonus: 0.22 },
    { id: 'forestry', name: '林地轮作', icon: 'tree', desc: '规划林地使用，让木材与耕地共同支持村落发展。', cost: { wood: 12 }, requiredPopulation: 0, spreadYears: 4, woodBonus: 0.18 },
    { id: 'reserve', name: '公共储粮', icon: 'grain', desc: '以村落公共规则积累储粮，稳定日常生活。', cost: { food: 20 }, requiredPopulation: 0, spreadYears: 4, foodBonus: 0.08, stabilityBonus: 4 },
    { id: 'migration', name: '接纳迁入家庭', icon: 'people', desc: '住房和食物充足时，吸引周边家庭加入聚落。', cost: { food: 15 }, requiredPopulation: 0, spreadYears: 3, migration: 0.8 },
    { id: 'works', name: '公共协作', icon: 'hammer', desc: '将公共建设列入村落日程，缩短工程所需时间。', cost: { food: 20 }, requiredPopulation: 0, spreadYears: 4, constructionBonus: 0.24 },
    { id: 'learning', name: '技艺传承', icon: 'book', desc: '组织经验与技艺传授，积累文明发展的基础知识。', cost: { food: 18 }, requiredPopulation: 40, spreadYears: 5, knowledgeRate: 0.65 },
    { id: 'trade', name: '开放集市', icon: 'market', desc: '鼓励物资流通，增加聚落交换和公共收入。', cost: { food: 24 }, requiredPopulation: 75, spreadYears: 9, treasuryRate: 2.8, woodBonus: 0.05 },
    { id: 'education', name: '公共教育', icon: 'book', desc: '逐渐覆盖各个聚落，提高知识积累速度。', cost: { treasury: 35 }, requiredPopulation: 120, spreadYears: 14, knowledgeRate: 1.8 },
    { id: 'irrigation', name: '农业组织改革', icon: 'water', desc: '组织水利与耕作，把地区农业纳入长期规划。', cost: { wood: 35, stone: 20 }, requiredPopulation: 150, spreadYears: 16, foodBonus: 0.25 },
    { id: 'industry', name: '产业发展计划', icon: 'factory', desc: '集中公共规划，提升生产与公共财政能力。', cost: { treasury: 100 }, requiredPopulation: 300, requiredKnowledge: 70, spreadYears: 22, woodBonus: 0.2, stoneBonus: 0.2, treasuryRate: 5 },
    { id: 'welfare', name: '基本公共服务', icon: 'health', desc: '扩大公共服务覆盖，稳定地区社会反馈。', cost: { treasury: 140 }, requiredPopulation: 450, requiredKnowledge: 110, spreadYears: 24, stabilityBonus: 8, migration: 0.9 },
    { id: 'automation', name: '自动化转型', icon: 'research', desc: '用知识与工程能力完成更高效的生产方式。', cost: { treasury: 380 }, requiredPopulation: 700, requiredKnowledge: 240, spreadYears: 28, woodBonus: 0.28, stoneBonus: 0.28, foodBonus: 0.18 }
  ];

  const policyRequirements={
    trade:{requiredBuildings:['market']},irrigation:{requiredBuildings:['canal']},
    education:{requiredPopulation:0,requiredCityPopulation:10000,requiredKnowledge:200,requiredIndustry:true,requiredBuildings:['publicschool'],knowledgeRate:14},
    industry:{requiredPopulation:0,requiredCityPopulation:10000,requiredKnowledge:180,requiredBuildings:['machineworks','warehouse']},
    welfare:{requiredPopulation:0,requiredCityPopulation:15000,requiredKnowledge:260,requiredIndustry:true,requiredBuildings:['hospital','publicschool']},
    automation:{requiredPopulation:0,requiredCityPopulation:50000,requiredKnowledge:500,requiredIndustry:true,requiredBuildings:['research','power']}
  };
  policyDefinitions.forEach(d=>Object.assign(d,policyRequirements[d.id]||{}));

  const reformDefinitions = [
    { id: 'governance', name: '公共治理', icon: 'council', desc: '从亲族议事逐步建立公共治理。', requiredPopulation: 50, cost: { wood: 20, food: 25 }, choices: [
      { id: 'elders', name: '长老议事', desc: '以共同体传统协调公共事务。' },
      { id: 'council', name: '村民议事会', desc: '建立明确的公共议程与执行责任。' },
      { id: 'administration', name: '地区行政', desc: '为多个聚落建立持续治理体系。', requiredPopulation: 180, requiredKnowledge: 30 },
      { id: 'representative', name: '代议治理', desc: '由地区代表参与预算与制度决策。', requiredPopulation: 500, requiredKnowledge: 130 }
    ] },
    { id: 'property', name: '产权规则', icon: 'house', desc: '改变资源与建设的共同规则。', requiredPopulation: 65, cost: { food: 30 }, choices: [
      { id: 'communal', name: '共同体共有', desc: '土地和公共资源由村落协调。' },
      { id: 'household', name: '家庭使用权', desc: '由家庭承担土地和房屋的长期使用。' },
      { id: 'mixed', name: '混合产权', desc: '公共建设与私人生产共同存在。', requiredPopulation: 150, requiredKnowledge: 25 },
      { id: 'cooperative', name: '合作社产权', desc: '以生产合作组织管理共享资产。', requiredPopulation: 200, requiredKnowledge: 45 }
    ] },
    { id: 'allocation', name: '资源配置', icon: 'market', desc: '逐步形成国家的资源配置方式。', requiredPopulation: 80, cost: { food: 25, wood: 20 }, choices: [
      { id: 'reciprocity', name: '互助与交换', desc: '以村落互助和邻近物资交换为主。' },
      { id: 'market', name: '市场流通', desc: '让需求与交换价格促进资源流动。' },
      { id: 'public', name: '公共计划', desc: '以公共预算和地区计划组织资源。', requiredPopulation: 150, requiredKnowledge: 25 },
      { id: 'mixed', name: '混合配置', desc: '公共规划与市场反馈共同引导发展。', requiredPopulation: 180, requiredKnowledge: 35 }
    ] },
    { id: 'labor', name: '劳动组织', icon: 'people', desc: '决定公共工程和生产如何组织。', requiredPopulation: 50, cost: { food: 25 }, choices: [
      { id: 'cooperative', name: '亲族协作', desc: '共同体按季节协调劳动。' },
      { id: 'publicworks', name: '公共工役', desc: '为共同建设安排明确的劳动责任。' },
      { id: 'wage', name: '雇佣劳动', desc: '用公共支出和报酬组织专业劳动。', requiredPopulation: 180, requiredKnowledge: 35, requiresCurrency: true },
      { id: 'producer', name: '生产者合作', desc: '以合作组织协调劳动与技能。', requiredPopulation: 150, requiredKnowledge: 30 }
    ] }
  ];

  const drawbacks = {
    forage: ['集中采集会挤占伐木与采石劳动。', { woodPenalty: .12, stonePenalty: .08 }],
    forestry: ['限制当前采伐速度，短期木材供应会下降。', { woodPenalty: .25 }],
    reserve: ['集中储粮需要保管劳动，家庭会反对交出收成。', { woodPenalty: .06, opposition: 4 }],
    migration: ['新家庭需要住房和食物，也会增加分配争议。', { opposition: 3 }],
    works: ['公共工役挤占日常生产，家庭承担额外劳动。', { foodPenalty: .12, opposition: 6 }],
    learning: ['传授技艺需要离开生产现场，短期产出减少。', { woodPenalty: .08, stonePenalty: .06 }],
    trade: ['交换依赖外部供给，运输损耗与分配差异会增加。', { foodPenalty: .05, opposition: 3 }],
    education: ['师资和学习时间占用公共收入与劳动。', { upkeep: 1.2, woodPenalty: .06 }],
    irrigation: ['水利协作占用劳动，上下游的用水诉求可能冲突。', { stonePenalty: .1, opposition: 5 }],
    industry: ['集中产业投资增加财政负担与地区利益冲突。', { upkeep: 3, opposition: 6 }],
    welfare: ['持续公共服务需要稳定财政，扩大覆盖会增加支出。', { upkeep: 3.5 }],
    automation: ['设备维护增加支出，原有劳动者会抵触生产转型。', { upkeep: 5, opposition: 8 }]
  };
  const clauseNames={forage:'组织沿河采集',forestry:'限制林木采伐',reserve:'设立公共储粮',migration:'准许家庭迁入',works:'征集公共劳役',learning:'组织技艺传授',trade:'允许跨地交换',education:'推行公共教育',irrigation:'统筹灌溉用水',industry:'集中产业投资',welfare:'提供基本保障',automation:'推广自动设备'};
  policyDefinitions.forEach(d => { d.name=clauseNames[d.id];d.drawback = drawbacks[d.id][0]; d.tradeoffs = drawbacks[d.id][1]; });
  const policyTargets = [{id:'all',name:'所有居民'},{id:'families',name:'家庭'},{id:'workers',name:'生产者',requiredPopulation:42}];
  const policyExecutors = [{id:'community',name:'共同体',cost:{},efficiency:1,resistance:1},{id:'council',name:'议事组织',requiresBuilding:'council',cost:{food:8},efficiency:1.25,resistance:.8},{id:'administration',name:'地区行政',requiredPopulation:180,requiredKnowledge:30,requiresBuilding:'council',cost:{treasury:12},efficiency:1.6,resistance:.6}];
  const policyConditions = [{id:'always',name:'持续执行'},{id:'shortage',name:'粮食不足时',requiredPopulation:40},{id:'surplus',name:'粮食充足时',requiredPopulation:40}];

  function initialize(state) {
    if(state.version < 3) {
      const offset = state.year - state.elapsed;
      state.year = state.elapsed;
      new Set([...(state.history||[]),...(state.events||[])]).forEach(e=>e.time-=offset);
      (state.statsHistory||[]).forEach(p=>p.year-=offset);
      state.buildings.forEach(b=>{if(Number.isFinite(b.started))b.started-=offset;});
      Object.values(state.policies||{}).forEach(p=>{if(Number.isFinite(p.started))p.started-=offset;});
      state.version=3;
      state.proposals ||= [];
      Object.entries(state.policies||{}).forEach(([id,p],i)=>{if(p.active&&policyDefinitions.some(d=>d.id===id))state.proposals.push({id:`legacy-${i}`,name:policyDefinitions.find(d=>d.id===id).name,clauses:[id],regions:['all'],target:'all',executor:'community',condition:'always',duration:0,started:state.elapsed,active:true,coverage:p.coverage||0,resistance:3});});
      state.policies={};
    }
    state.proposals ||= [];
    state.proposalSerial ||= 0;
    state.eventSeen ||= {};
    state.forest ||= {removed:{},stocks:{},cut:0};
    state.automation ||= {enabled:false,tasks:{housing:true,food:true,wood:false,stone:false,roads:false},lastCheck:-3,projects:0};
    state.hostiles ||= [];
    state.hostileAt ??= Math.max(3,state.elapsed+1);
    state.startMode ||= 'village';
    state.cityFounded ||= state.population>=180&&state.knowledge>=35&&!!count(state,'council');
    if(!state.currency){
      const stock=Math.max(0,state.resources.treasury||0);
      state.resources.wood+=Math.floor(stock/2);
      state.resources.stone+=Math.ceil(stock/2);
      state.currency={adopted:false,introducedAt:null};
      state.resources.treasury=0;
    }
    if(!state.currency.adopted)state.resources.treasury=0;
    state.neighbors ||= [];
    state.neighbors.forEach(n=>{n.tradeLast ||= {imported:0,exported:0,tariff:0};});
    state.expeditions ||= [];
    state.expeditionSerial ||= 0;
    state.industrialized ||= largestCityPopulation(state)>=10000&&!!count(state,'factory');
    state.reformProcess ??= null;
    state.policyKnown ||= policyDefinitions.filter(d=>available(state,d).ok).map(d=>d.id);
    state.lastReportSnapshot ||= {population:state.population,food:state.resources.food,stability:state.stability};
    return state;
  }
  function hasCurrency(state) { return !!state.currency?.adopted; }
  function largestCityPopulation(state) { return Math.max(0,...(state.settlements||[]).map(s=>Math.max(0,s.population||0))); }
  function isIndustrialized(state) { return !!state.industrialized||(largestCityPopulation(state)>=10000&&!!count(state,'factory')); }
  function canIntroduceCurrency(state) {
    if(hasCurrency(state))return {ok:false,message:'已使用统一货币。'};
    if(!state.cityFounded&&!(state.population>=180&&state.knowledge>=35&&count(state,'council')))return {ok:false,message:'尚未形成城市。'};
    return {ok:true,cost:{wood:24,stone:18},drawback:'统一计价改变原有交换习惯，推行时公众信任下降 5。'};
  }
  function introduceCurrency(state) {
    initialize(state);
    const access=canIntroduceCurrency(state);if(!access.ok)return access;
    if(!enough(state,access.cost))return {ok:false,message:'需要 24 木材和 18 石材。'};
    pay(state,access.cost);state.currency.adopted=true;state.currency.introducedAt=state.elapsed;
    state.stability=clamp(state.stability-5,0,100);
    event(state,'milestone','统一货币开始流通','城市决定以统一单位计价和缴纳公共收入。原有交换习惯正在调整。',{currency:true});
    return {ok:true,message:'统一货币已推行'};
  }
  const terrain = (state,x,y) => root.CivilTerrain.sample(x,y,state.seed);
  function visiblePolicies(state) { return policyDefinitions.filter(d=>available(state,d).ok); }
  function scopeSettlements(state, proposal) { return proposal.regions.includes('all')?state.settlements:state.settlements.filter(s=>proposal.regions.includes(s.id)); }
  function activeProposal(state,p) { if(!p.active)return false;const ratio=state.resources.food/Math.max(1,state.population);return p.condition==='shortage'?ratio<.6:p.condition==='surplus'?ratio>2:true; }
  function proposalOptions(state) { return {clauses:visiblePolicies(state),targets:policyTargets.filter(d=>available(state,d).ok),executors:policyExecutors.filter(d=>available(state,d).ok&&(!d.requiresBuilding||count(state,d.requiresBuilding))),conditions:policyConditions.filter(d=>available(state,d).ok)}; }
  const policyChanges={forage:.6,forestry:.8,reserve:1.2,migration:1,works:1.5,learning:.8,trade:2,education:5,irrigation:3,industry:6,welfare:6,automation:9};
  function policyBenefit(d) { return (d.foodBonus||0)*12+(d.woodBonus||0)*10+(d.stoneBonus||0)*10+(d.constructionBonus||0)*10+(d.knowledgeRate||0)*.8+(d.treasuryRate||0)*.6+(d.migration||0)*2+(d.stabilityBonus||0)*.25; }
  function policyResistance(state,selected,scope,executor,changeScale=1) {
    const change=selected.reduce((sum,d)=>sum+(policyChanges[d.id]||1),0)*changeScale;
    const benefit=selected.reduce((sum,d)=>sum+policyBenefit(d),0)*changeScale;
    const share=scope.reduce((sum,s)=>sum+s.population,0)/Math.max(1,state.population);
    const resistance=clamp((selected.reduce((sum,d)=>sum+(d.tradeoffs.opposition||1),0)*changeScale+change*3+benefit*1.2)*executor.resistance*(.55+share*.45)*(1+Math.log2(Math.max(1,scope.length))*.12),0,85);
    const spread=Math.max(...selected.map(d=>d.spreadYears||4));
    return {change,benefit,resistance,implementationYears:spread*(1+resistance/80)/executor.efficiency};
  }
  function draftPolicy(state,input) {
    initialize(state);
    const options=proposalOptions(state),clauses=[...new Set(input.clauses||[])],regions=[...new Set(input.regions||[])];
    if(!clauses.length||clauses.length>4||clauses.some(id=>!options.clauses.some(d=>d.id===id)))return {ok:false,message:'请选择当前可用的条款（最多四项）。'};
    if(!regions.length||regions.some(id=>id!=='all'&&!state.settlements.some(s=>s.id===id)))return {ok:false,message:'请选择实施地区。'};
    const executor=options.executors.find(e=>e.id===input.executor);
    if(!executor||!options.targets.some(t=>t.id===input.target)||!options.conditions.some(c=>c.id===input.condition))return {ok:false,message:'当前无法执行这些安排。'};
    const old=state.proposals.find(p=>p.id===input.id);
    if(input.id&&!old)return {ok:false,message:'这项议案已不存在。'};
    const selected=clauses.map(id=>options.clauses.find(d=>d.id===id));
    const sameList=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
    const duration=[5,15,30].includes(+input.duration)?+input.duration:0;
    const same=old&&sameList(old.clauses,clauses)&&sameList(old.regions,regions)&&old.target===input.target&&old.executor===input.executor&&old.condition===input.condition&&old.duration===duration;
    const cost=same?{}:{...executor.cost};
    selected.filter(d=>!old?.clauses.includes(d.id)).forEach(d=>Object.entries(d.cost||{}).forEach(([k,v])=>cost[k]=(cost[k]||0)+v));
    const scope=regions.includes('all')?state.settlements:state.settlements.filter(s=>regions.includes(s.id));
    Object.keys(cost).forEach(k=>cost[k]=Math.ceil(cost[k]*Math.max(1,scope.length*.8)));
    const changedClauses=old?clauses.filter(id=>!old.clauses.includes(id)).length+old.clauses.filter(id=>!clauses.includes(id)).length:clauses.length;
    const arrangementChange=old?Number(!sameList(old.regions,regions))+Number(old.target!==input.target)+Number(old.executor!==input.executor)+Number(old.condition!==input.condition)+Number(old.duration!==duration):0;
    const scale=same?0:old?clamp((changedClauses+arrangementChange*.5)/Math.max(1,clauses.length),.15,1):1;
    const affected=[...selected,...(old?.clauses||[]).filter(id=>!clauses.includes(id)).map(id=>policyDefinitions.find(d=>d.id===id)).filter(Boolean)];
    const impact=policyResistance(state,affected,scope,executor,scale);
    const preview={ok:enough(state,cost),cost,...impact,drawbacks:selected.map(d=>d.drawback)};
    if(!preview.ok)preview.message='公共资源不足。';
    if(input.preview)return preview;
    if(!preview.ok)return preview;
    if(input.name!=null&&!String(input.name).trim())return {ok:false,message:'请为议案命名。'};
    if(same){old.name=String(input.name||old.name).trim().slice(0,30);return {ok:true,message:'议案名称已更新',proposalId:old.id};}
    pay(state,cost);
    const retained=old?old.clauses.filter(id=>clauses.includes(id)).length/clauses.length:0;
    const fullImpact=policyResistance(state,selected,scope,executor);
    const proposal={id:old?.id||`proposal-${++state.proposalSerial}`,name:String(input.name||selected.map(d=>d.name).join(' · ')).trim().slice(0,30),clauses,regions,target:input.target,executor:executor.id,condition:input.condition,duration,started:state.elapsed,active:true,coverage:(old?.coverage||0)*Math.min(1,retained),resistance:fullImpact.resistance,change:fullImpact.change,benefit:fullImpact.benefit,implementationYears:fullImpact.implementationYears};
    if(!proposal.name)return {ok:false,message:'请为议案命名。'};
    proposal.localCoverage=Object.fromEntries(scope.map(s=>[s.id,(old?.localCoverage?.[s.id]||0)*Math.min(1,retained)]));
    if(old)Object.assign(old,proposal);else state.proposals.push(proposal);
    state.stability=clamp(state.stability-impact.resistance*.18,0,100);
    event(state,'milestone',`${proposal.name}获通过`,`${scope.map(s=>s.name).join('、')} · ${options.targets.find(t=>t.id===proposal.target).name} · ${executor.name}`,{proposalId:proposal.id,dedupe:`proposal:${proposal.id}:${state.elapsed}`});
    return {ok:true,message:'议案已通过',proposalId:proposal.id};
  }
  function setProposalActive(state,id,active) { const p=state.proposals.find(p=>p.id===id);if(!p)return {ok:false,message:'未找到议案。'};p.active=!!active;return {ok:true}; }
  function proposalCoverage(state,id) {
    let total=policyCoverage(state,id);
    state.proposals.forEach(p=>{if(p.clauses.includes(id)&&activeProposal(state,p)){const share=scopeSettlements(state,p).reduce((n,s)=>n+s.population*(p.localCoverage?.[s.id]??p.coverage)/100,0)/Math.max(1,state.population);const target=p.target==='workers'?.54:p.target==='families'?.85:1;total+=share*target;}});
    return clamp(total,0,1);
  }
  function automationLevel(state) { return count(state,'research')&&isIndustrialized(state)?3:count(state,'workshop')&&state.population>=90&&state.knowledge>=12?2:count(state,'council')?1:0; }
  function setAutomation(state,task,value) { initialize(state);const level=automationLevel(state);if(!level)return {ok:false,message:'议事屋建成后可委托建设。'};if(task==='enabled')state.automation.enabled=!!value;else if(Object.hasOwn(state.automation.tasks,task)&&(['wood','stone','roads'].includes(task)?level>=2:true))state.automation.tasks[task]=!!value;else return {ok:false,message:'当前不能委托这项建设。'};return {ok:true}; }
  function autoBuild(state) {
    const a=state.automation,level=automationLevel(state);
    if(!a.enabled||!level||state.elapsed-a.lastCheck<3)return;
    a.lastCheck=state.elapsed;
    if(state.buildings.filter(b=>b.status==='building').length>=level)return;
    const s=stats(state),tasks=a.tasks;
    const best=types=>types.find(type=>available(state,getDefinition(type)).ok&&enough(state,costsFor(getDefinition(type))));
    const type=tasks.food&&s.foodRate<state.population*.05?best(['estate','farm']):tasks.housing&&s.housing<state.population*1.18?best(['apartment','townhouse','hut']):level>=2&&tasks.wood&&s.wood<90?'lumber':level>=2&&tasks.stone&&s.stone<70?'quarry':level>=2&&tasks.roads&&count(state,'path')<state.settlements.length*2?'path':null;
    if(!type||!available(state,getDefinition(type)).ok)return;
    const d=getDefinition(type);
    let size=level>=3?2:1,cost=costsFor(d,size);
    if(size===2&&(!enough(state,cost)||state.resources.food-(cost.food||0)<state.population*.45)){size=1;cost=costsFor(d,size);}
    if(!enough(state,cost)||state.resources.food-(cost.food||0)<state.population*.45)return;
    for(const home of state.settlements)for(let i=0;i<120;i++){
      const angle=i*2.399963+state.automation.projects*.7,r=100+Math.floor(i/8)*30,x=home.x+Math.cos(angle)*r,y=home.y+Math.sin(angle)*r;
      if(terrain(state,x,y).water||(type==='lumber'&&forestRemaining(state,x,y)<20))continue;
      const result=build(state,type,x,y,size);
      if(result.ok){state.buildings.at(-1).automatic=true;a.projects++;return;}
    }
  }
  const forestAreas=new Map();
  function nearbyTrees(state,x,y,r=155) { const key=`${state.seed}:${x}:${y}:${r}`;if(!forestAreas.has(key)){if(forestAreas.size>1000)forestAreas.clear();forestAreas.set(key,root.CivilTerrain.trees(state.seed).filter(t=>Math.hypot(t.x-x,t.y-y)<r));}return forestAreas.get(key); }
  function forestRemaining(state,x,y) { return nearbyTrees(state,x,y).reduce((n,t)=>n+(state.forest.removed[t.id]?0:Math.max(0,8-(state.forest.stocks[t.id]||0))),0); }
  function harvest(state,x,y,amount) {
    let taken=0;
    const trees=nearbyTrees(state,x,y).filter(t=>!state.forest.removed[t.id]).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
    for(const t of trees){const used=state.forest.stocks[t.id]||0,cut=Math.min(8-used,amount-taken);if(cut<=0)break;state.forest.stocks[t.id]=used+cut;taken+=cut;if(used+cut>=8-.00001){state.forest.removed[t.id]=true;state.forest.cut++;}if(taken>=amount-.00001)break;}
    return taken;
  }
  function respondHostile(state,id,action) {
    const h=state.hostiles.find(h=>h.id===id);if(!h)return {ok:false,message:'未发现这支势力。'};
    if(action==='tribute'){if(!enough(state,{food:25}))return {ok:false,message:'需要 25 粮食。'};pay(state,{food:25});h.pressure=Math.max(0,h.pressure-35);h.truceUntil=state.elapsed+8;}
    else if(action==='patrol'){if(!enough(state,{food:12,wood:10}))return {ok:false,message:'需要 12 粮食、10 木材。'};pay(state,{food:12,wood:10});h.guardUntil=state.elapsed+12;h.pressure=Math.max(0,h.pressure-15);}
    else if(action==='negotiate'){if(state.knowledge<3)return {ok:false,message:'需要 3 点知识积累。'};if(!enough(state,{food:8}))return {ok:false,message:'需要 8 粮食。'};pay(state,{food:8});h.pressure=Math.max(0,h.pressure-22);h.truceUntil=state.elapsed+5;}
    else return {ok:false,message:'未知应对方式。'};
    return {ok:true,message:'安排已执行'};
  }
  function hostileTick(state,dt) {
    if(!state.hostiles.length&&state.elapsed>=state.hostileAt){const home=state.settlements[0],x=home.x+260,y=home.y-180;state.hostiles.push({id:'rival-1',name:'赤石氏族',x,y,pressure:24,lastRaid:state.elapsed,truceUntil:0,guardUntil:0});state.explored.push({x,y,radius:110});event(state,'milestone','河湾外的旗帜','赤石氏族在附近扎营，对水源与猎场提出领地要求。',{hostileId:'rival-1',x,y});}
    state.hostiles.forEach(h=>{const safe=h.truceUntil>state.elapsed,guard=h.guardUntil>state.elapsed;h.pressure=clamp(h.pressure+(safe?-3:guard?.25:1.6)*dt,0,100);if(h.pressure>=55&&state.elapsed-h.lastRaid>=12){h.lastRaid=state.elapsed;h.pressure-=20;const protection=1-defenseAt(state,h.x,h.y)/100,loss=Math.min(state.resources.food,(guard?6:18)*protection);state.resources.food-=loss;state.stability=clamp(state.stability-(guard?1:4)*protection,0,100);event(state,'failure',`${h.name}袭扰`, `损失 ${Math.floor(loss)} 粮食；公众信任下降。`,{hostileId:h.id,x:h.x,y:h.y,dedupe:`raid:${h.id}:${Math.floor(state.elapsed/12)}`});}});
  }
  function defenseAt(state,x,y) {
    const local=nearestSettlement(state,x,y);
    return clamp(state.buildings.filter(b=>b.status==='complete'&&Math.hypot(b.x-local.x,b.y-local.y)<=600).reduce((sum,b)=>sum+(getDefinition(b.type)?.defense||0)*(b.size||1),0),0,70);
  }

  function foreignSummary(state) {
    const summary={routes:0,foodRate:0,woodRate:0,stoneRate:0,treasuryRate:0};
    for(const n of state.neighbors||[]){
      const flow=n.tradeLast||{};
      if(n.tradeOpen&&!n.embargo&&n.tension<65&&n.relation>=15){
        summary.routes++;
        summary[`${n.exportResource}Rate`]+=(flow.imported||0);
        summary[`${n.importResource}Rate`]-=(flow.exported||0);
        summary.treasuryRate+=hasCurrency(state)?(flow.tariff||0):0;
      }
    }
    return summary;
  }
  function foreignAction(state,id,action) {
    initialize(state);
    const n=state.neighbors.find(n=>n.id===id);if(!n)return {ok:false,message:'尚未与这个国家接触。'};
    const price=action==='envoy'?{food:12}:action==='pact'?{food:20}:action==='patrol'?{food:12,wood:10}:{};
    if(!['trade','envoy','pact','embargo','patrol'].includes(action))return {ok:false,message:'请选择有效的外交行动。'};
    if(action==='trade'&&!n.tradeOpen&&(n.embargo||n.tension>=65||n.relation<15))return {ok:false,message:'需先解除禁运并缓和边界关系。'};
    if(action==='pact'&&n.relation<45)return {ok:false,message:'双方关系需达到 45。'};
    if(action==='pact'&&n.pactUntil>state.elapsed)return {ok:false,message:'互不侵犯约定仍然有效。'};
    if(action==='patrol'&&n.guardUntil>state.elapsed)return {ok:false,message:'边界巡防仍然有效。'};
    if(!enough(state,price))return {ok:false,message:'缺少外交行动所需物资。'};
    pay(state,price);
    if(action==='trade'){n.tradeOpen=!n.tradeOpen;n.tradeLast={imported:0,exported:0,tariff:0};}
    if(action==='envoy'){n.relation=clamp(n.relation+12,0,100);n.tension=clamp(n.tension-8,0,100);}
    if(action==='pact'){n.pactUntil=state.elapsed+10;n.tension=Math.max(0,n.tension-15);}
    if(action==='embargo'){n.embargo=!n.embargo;n.tradeOpen=false;n.tradeLast={imported:0,exported:0,tariff:0};n.relation=clamp(n.relation+(n.embargo?-14:4),0,100);n.tension=clamp(n.tension+(n.embargo?10:-3),0,100);}
    if(action==='patrol'){n.guardUntil=state.elapsed+10;n.tension=clamp(n.tension+3,0,100);}
    return {ok:true,message:{trade:n.tradeOpen?'交换路线已开放':'交换路线已关闭',envoy:'使者已完成交涉',pact:'十年互不侵犯约定已生效',embargo:n.embargo?'禁运已实施':'禁运已解除',patrol:'边界巡防已加强'}[action]};
  }
  function foreignTick(state,dt) {
    for(const n of state.neighbors){
      const pact=n.pactUntil>state.elapsed,guard=n.guardUntil>state.elapsed;
      n.tension=clamp(n.tension+(pact?-.8:n.embargo?1.8:n.tradeOpen?-.35:.55)*dt,0,100);
      n.relation=clamp(n.relation+(n.embargo?-.6:n.tradeOpen?.35:0)*dt,0,100);
      n.tradeLast={imported:0,exported:0,tariff:0};
      if(n.tradeOpen&&!n.embargo&&n.tension<65&&n.relation>=15){
        const availability=clamp(state.resources[n.importResource]/Math.max(1,n.importRate*dt),0,1);
        const border=clamp(1-n.tension/140,.25,1);
        const scarcity=n.exportResource==='food'?clamp(state.resources.food/Math.max(1,state.population*3),.7,1.15):clamp(state.resources.stone/180,.75,1.15);
        const exported=n.importRate*availability*border*dt,imported=n.exportRate*availability*border*scarcity*dt;
        state.resources[n.importResource]=Math.max(0,state.resources[n.importResource]-exported);
        state.resources[n.exportResource]+=imported;
        const tariff=hasCurrency(state)?imported*state.budget.taxRate*.25:0;
        state.resources.treasury+=tariff;
        n.tradeLast={imported:imported/dt,exported:exported/dt,tariff:tariff/dt};
      }
      if(!pact&&n.tension>=75&&state.elapsed-n.lastIncident>=8){
        n.lastIncident=state.elapsed;n.tension-=12;
        const protection=1-defenseAt(state,n.x,n.y)/100,loss=Math.min(state.resources.wood,(guard?5:24)*protection);state.resources.wood-=loss;
        state.stability=clamp(state.stability-(guard?1:4)*protection,0,100);
        event(state,'failure',`${n.name}边界冲突`,`运输受阻，损失 ${Math.round(loss)} 木材。`,{nationId:n.id,x:n.x,y:n.y,dedupe:`border:${n.id}:${Math.floor(state.elapsed/8)}`});
      }
    }
  }

  function random(state) {
    state.rngState = ((state.rngState >>> 0) * 1664525 + 1013904223) >>> 0;
    return state.rngState / 4294967296;
  }

  function event(state, kind, title, body, data) {
    const key = data?.dedupe || `${kind}:${title}`;
    state.eventSeen ||= {};
    if (state.eventSeen[key] != null && state.elapsed - state.eventSeen[key] < (kind === 'failure' ? 2 : 18)) return null;
    state.eventSeen[key] = state.elapsed;
    const item = { id: `${state.id}-${++state.eventSerial}`, kind, title, body, time: state.year, data: data || {} };
    state.events.push(item);
    state.history.unshift(item);
    if (state.history.length > 180) state.history.length = 180;
    if (state.events.length > 16) state.events.splice(0, state.events.length - 16);
    return item;
  }

  function create(seed, name, mode = 'village') {
    const numberSeed = Math.abs(Math.floor(cleanNumber(seed, Date.now() % 999999))) % 2147483647;
    const safeName = String(name || '溪岸').trim().slice(0, 18) || '溪岸';
    const state = {
      version: VERSION,
      id: `world-${numberSeed}-${Date.now().toString(36)}`,
      name: safeName,
      seed: numberSeed,
      rngState: numberSeed || 1,
      year: 0,
      elapsed: 0,
      population: 36,
      startMode: mode==='city'?'city':'village',
      currency: {adopted:false,introducedAt:null},
      resources: { food: 120, wood: 100, stone: 48, treasury: 0 },
      stability: 78,
      knowledge: 0,
      productivity: 8,
      admin: 12,
      stage: '河畔营地',
      explored: [{ x: 2048, y: 2048, radius: 380 }],
      settlements: [{ id: 'home', name: safeName, x: 2048, y: 2048, population: 36, level: 0 }],
      buildings: [],
      policies: {},
      institutions: { governance: 'elders', property: 'communal', allocation: 'reciprocity', labor: 'cooperative' },
      events: [],
      history: [],
      eventSerial: 0,
      buildingSerial: 8,
      exploredCount: 0,
      milestoneFlags: {},
      lastReport: 0,
      lastStats: 0,
      lastNews: 0,
      nextNews: 12,
      reformCooldown: 0,
      migrationAccumulator: 0,
      housingStress: 0,
      statsHistory: [],
      budget: { taxRate: 0.08, construction: 45, welfare: 30, knowledge: 25 },
      financing: 'public',
      completedProjects: 0,
      failedProjects: 0
    };
    const locations = [[-51, -33], [-14, -55], [28, -39], [58, -8], [36, 34], [-13, 49], [-56, 21]];
    locations.forEach((position, index) => state.buildings.push({ id: `hut-${index}`, type: 'hut', x: 2048 + position[0], y: 2048 + position[1], progress: 100, status: 'complete', size: 1, settlementId: 'home', started: state.year }));
    state.buildings.push({ id: 'fire-home', type: 'fire', x: 2048, y: 2048, progress: 100, status: 'complete', size: 1, settlementId: 'home', started: state.year });
    if(state.startMode==='city')createCity(state);
    initialize(state);
    if(state.startMode==='city')event(state,'milestone','城邦之间',`${safeName}已有 240 位居民。青穗邦的粮食、岩岬国的石材与本城木材可以互通；边界与盟约将影响这些联系。`,{population:240});
    else event(state, 'milestone', '从一缕炊烟开始', `36 位村民在河畔停下脚步。七座茅草屋和一处火塘，是${safeName}的全部。先尝试建设一片农田，或为村落选择一项公共规则。`, { population: 36, food: 120, wood: 100, housing: 49 });
    recordStats(state);
    return state;
  }

  function createCity(state) {
    state.population=240;state.knowledge=45;state.productivity=20;state.admin=22;
    state.stage='早期城邑';state.cityFounded=true;state.hostileAt=999999;
    state.resources={food:720,wood:420,stone:260,treasury:0};
    Object.assign(state.settlements[0],{population:240,level:2});
    state.institutions={governance:'council',property:'household',allocation:'reciprocity',labor:'publicworks'};
    state.buildings=[];state.explored=[{x:2048,y:2048,radius:560}];
    const add=(type,index,minR,maxR)=>{
      const definition=getDefinition(type),footprint=definition?.footprint||12;
      for(let i=0;i<1800;i++){
        const angle=(i+index*17)*2.399963,r=minR+(i*17%Math.max(1,maxR-minR)),x=2048+Math.cos(angle)*r,y=2048+Math.sin(angle)*r;
        if(terrain(state,x,y).water||state.buildings.some(b=>Math.hypot(x-b.x,y-b.y)<(footprint+(getDefinition(b.type)?.footprint||12))*.48))continue;
        state.buildings.push({id:`city-${type}-${index}`,type,x,y,size:1,status:'complete',progress:100,settlementId:'home',started:0});return;
      }
    };
    ['council','market','granary','workshop','school','well'].forEach((type,i)=>add(type,i,0,105));
    for(let i=0;i<40;i++)add('hut',i,65,210);
    for(let i=0;i<8;i++)add('farm',i,215,365);
    ['canal','quarry','lumber','lumber'].forEach((type,i)=>add(type,i,260,410));
    for(let i=0;i<6;i++)add('path',i,100,285);
    state.completedProjects=state.buildings.length;state.buildingSerial=state.buildings.length;
    state.neighbors=[
      {id:'green-country',name:'青穗邦',color:'#8cab78',population:310,relation:56,tension:18,exportResource:'food',importResource:'wood',exportRate:14,importRate:6},
      {id:'stone-country',name:'岩岬国',color:'#c49a75',population:285,relation:40,tension:31,exportResource:'stone',importResource:'wood',exportRate:7,importRate:5}
    ].map((n,index)=>{
      const preferred=index===0?.25:Math.PI+.35;
      let location;
      for(let i=0;i<120;i++){
        const angle=preferred+Math.sin(i*2.399963)*.65,r=820+(i%8)*35,x=2048+Math.cos(angle)*r,y=2048+Math.sin(angle)*r;
        if(!terrain(state,x,y).water){location={x,y};break;}
      }
      location ||= {x:2048+(index?-760:760),y:2048};
      state.explored.push({...location,radius:330});
      for(let t=.25;t<1;t+=.25)state.explored.push({x:2048+(location.x-2048)*t,y:2048+(location.y-2048)*t,radius:210});
      return {...n,...location,radius:270,tradeOpen:false,embargo:false,pactUntil:0,guardUntil:0,lastIncident:0,tradeLast:{imported:0,exported:0,tariff:0}};
    });
  }

  function completed(state, id) { return state.buildings.filter(building => building.type === id && building.status === 'complete'); }
  function count(state, id) { return completed(state, id).reduce((sum, building) => sum + building.size, 0); }
  function policyCoverage(state, id) { const p = state.policies[id]; return p && p.active ? clamp(p.coverage, 0, 100) / 100 : 0; }
  function getDefinition(id) { return buildingDefinitions.find(item => item.id === id); }

  function budgetEffects(state) {
    if (!count(state, 'council')) return { constructionBonus: 0, stabilityBonus: 0, knowledgeMultiplier: 1 };
    const budget = state.budget || { construction: 45, welfare: 30, knowledge: 25 };
    // The starting 45/30/25 allocation is neutral. Reallocation changes capacity
    // gently, rather than granting an unrelated bonus merely for opening budgets.
    return {
      constructionBonus: (clamp(cleanNumber(budget.construction, 45), 0, 100) - 45) * 0.005,
      stabilityBonus: (clamp(cleanNumber(budget.welfare, 30), 0, 100) - 30) * 0.12,
      knowledgeMultiplier: clamp(1 + (clamp(cleanNumber(budget.knowledge, 25), 0, 100) - 25) * 0.012, 0.7, 1.9)
    };
  }

  function effects(state) {
    const output = { housing: 0, food: 0, wood: 0, stone: 0, treasury: 0, knowledge: 0, productivity: 0, admin: 0, foodBonus: 0, woodBonus: 0, stoneBonus: 0, stability: 0, construction: 0, migration: 0, knowledgeMultiplier: 1,defense:0,foodEfficiency:0 };
    state.buildings.forEach(building => {
      if (building.status !== 'complete') return;
      const definition = getDefinition(building.type);
      if (!definition) return;
      const size = building.size || 1;
      output.housing += (definition.housing || 0) * size;
      output.food += (definition.foodRate || 0) * size;
      output.wood += (definition.woodRate || 0) * size * (building.type === 'lumber' ? clamp(forestRemaining(state,building.x,building.y)/24,0,1) : 1);
      output.stone += (definition.stoneRate || 0) * size;
      output.treasury += (definition.treasuryRate || 0) * size;
      output.knowledge += (definition.knowledgeRate || 0) * size;
      output.productivity += (definition.productivity || 0) * size;
      output.admin += (definition.admin || 0) * size;
      output.defense += (definition.defense||0)*size;
      output.foodEfficiency += (definition.foodEfficiency||0)*size;
      output.construction += (definition.constructionBonus||0)*size;
    });
    output.defense=clamp(output.defense,0,70);
    output.construction=Math.min(.6,output.construction);
    output.foodBonus+=Math.min(.6,output.foodEfficiency)*Math.min(1,(count(state,'farm')+count(state,'estate')*10)/Math.max(1,(count(state,'windmill')+count(state,'watermill'))*2));
    policyDefinitions.forEach(policy => {
      if(!available(state,policy).ok)return;
      if(!hasCurrency(state)&&((policy.cost?.treasury||0)>0||(policy.tradeoffs.upkeep||0)>0))return;
      const coverage = proposalCoverage(state, policy.id);
      output.foodBonus += (policy.foodBonus || 0) * coverage;
      output.woodBonus += (policy.woodBonus || 0) * coverage;
      output.stoneBonus += (policy.stoneBonus || 0) * coverage;
      output.stability += (policy.stabilityBonus || 0) * coverage;
      output.construction += (policy.constructionBonus || 0) * coverage;
      output.knowledge += (policy.knowledgeRate || 0) * coverage;
      output.treasury += (policy.treasuryRate || 0) * coverage;
      output.migration += (policy.migration || 0) * coverage;
      output.foodBonus -= (policy.tradeoffs.foodPenalty||0)*coverage;
      output.woodBonus -= (policy.tradeoffs.woodPenalty||0)*coverage;
      output.stoneBonus -= (policy.tradeoffs.stonePenalty||0)*coverage;
      output.treasury -= (policy.tradeoffs.upkeep||0)*coverage;
      output.stability -= (policy.tradeoffs.opposition||0)*coverage;
    });
    if (state.institutions.allocation === 'market') output.treasury += 1.5;
    if (state.institutions.allocation === 'public') output.construction += 0.12;
    if (state.institutions.allocation === 'mixed') { output.treasury += 0.8; output.construction += 0.06; }
    if (state.institutions.labor === 'publicworks') output.construction += 0.15;
    if (state.institutions.labor === 'producer') { output.woodBonus += 0.08; output.stoneBonus += 0.08; }
    if(state.institutions.labor==='wage'&&hasCurrency(state)){output.woodBonus+=.12;output.stoneBonus+=.1;}
    if(state.institutions.governance==='council')output.admin+=3;
    if(state.institutions.governance==='administration')output.admin+=9;
    if(state.institutions.governance==='representative'){output.admin+=12;output.stability+=3;}
    if(state.institutions.property==='household')output.foodBonus+=.03;
    if(state.institutions.property==='mixed')output.woodBonus+=.05;
    if(state.institutions.property==='cooperative'){output.foodBonus+=.05;output.stoneBonus+=.05;}
    const budget = budgetEffects(state);
    output.construction += budget.constructionBonus;
    output.stability += budget.stabilityBonus;
    output.knowledgeMultiplier = budget.knowledgeMultiplier;
    if(!hasCurrency(state))output.treasury=0;
    return output;
  }

  function stats(state) {
    const effect = effects(state);
    const working = Math.max(0, state.population * 0.54);
    const buildingLabor = state.buildings.filter(item => item.status === 'building').length * 2;
    const facilityLabor=state.buildings.filter(b=>b.status==='complete'&&!['hut','fire','path'].includes(b.type)).reduce((n,b)=>n+2*b.size,12);
    const utilization = clamp((working - buildingLabor) / Math.max(facilityLabor, working), 0, 1);
    const labor=clamp(state.population/36,0,1);
    const foodProduction = (15*labor + effect.food + state.population * 0.065) * (1 + effect.foodBonus) * utilization;
    const woodProduction = (4.4*labor + effect.wood) * (1 + effect.woodBonus) * utilization;
    const stoneProduction = (0.9 + effect.stone) * (1 + effect.stoneBonus) * utilization;
    const foreign=foreignSummary(state);
    const domesticFoodRate=foodProduction-state.population*.3;
    const domesticTreasuryRate=hasCurrency(state)?effect.treasury*utilization+(state.population>=75?state.population*state.budget.taxRate*.12:0):0;
    return {
      population: Math.max(0, Math.floor(state.population)),
      food: Math.max(0, state.resources.food), wood: Math.max(0, state.resources.wood), stone: Math.max(0, state.resources.stone), treasury: Math.max(0, state.resources.treasury),
      housing: Math.floor(effect.housing), stability: clamp(state.stability, 0, 100), knowledge: Math.max(0, state.knowledge), stage: state.stage,
      foodRate:domesticFoodRate+foreign.foodRate,woodRate:woodProduction+foreign.woodRate,stoneRate:stoneProduction+foreign.stoneRate,treasuryRate:domesticTreasuryRate+foreign.treasuryRate,
      domesticFoodRate,domesticTreasuryRate,woodProduction,stoneProduction,foreign,
      foodProduction, foodConsumption: state.population * 0.3, constructionBonus: effect.construction,
      productivity: state.productivity + effect.productivity, admin: state.admin + effect.admin,
      knowledgeRate: (0.1 + effect.knowledge + count(state, 'workshop') * 0.12) * effect.knowledgeMultiplier * clamp(working/12,0,1),
      migrationRate: effect.migration,
      buildings: state.buildings.filter(item => item.status === 'complete' && item.type !== 'fire').length,
      projects: state.buildings.filter(item => item.status === 'building').length,
      settlements: state.settlements.length,
      policyCoverage: state.proposals.filter(p=>p.active).reduce((sum,p)=>sum+p.coverage,0)/Math.max(1,state.proposals.filter(p=>p.active).length),
      automationLevel:automationLevel(state),deforested:state.forest.cut,defense:effect.defense,largestCityPopulation:largestCityPopulation(state),industrialized:isIndustrialized(state)
    };
  }

  function costsFor(definition, size = 1) {
    const result = {};
    Object.entries(definition.cost || {}).forEach(([key, value]) => { result[key] = Math.ceil(value * size); });
    return result;
  }

  function enough(state, costs) { return allResources.every(key => (state.resources[key] || 0) >= (costs[key] || 0)); }
  function pay(state, costs) { allResources.forEach(key => { state.resources[key] = Math.max(0, (state.resources[key] || 0) - (costs[key] || 0)); }); }

  function available(state, definition) {
    if (!definition) return { ok: false, message: '尚未认识这种方案。' };
    if(!hasCurrency(state)&&(definition.requiresCurrency||definition.cost?.treasury||definition.tradeoffs?.upkeep))return {ok:false,message:'当前无法实行这项安排。'};
    if(definition.requiredIndustry&&!isIndustrialized(state))return {ok:false,message:'当前发展阶段尚不能实施。'};
    if(largestCityPopulation(state)<(definition.requiredCityPopulation||0))return {ok:false,message:'尚未具备相应城市规模。'};
    if((definition.requiredBuildings||[]).some(id=>!count(state,id)))return {ok:false,message:'尚未具备相应设施。'};
    if (state.population < (definition.requiredPopulation || 0)) return { ok: false, message: `需要至少 ${definition.requiredPopulation} 位村民。` };
    if (state.knowledge < (definition.requiredKnowledge || 0)) return { ok: false, message: `需要积累 ${definition.requiredKnowledge} 点知识。` };
    return { ok: true, message: '' };
  }

  function foreignOwner(state,x,y) { return (state.neighbors||[]).find(n=>Math.hypot(x-n.x,y-n.y)<n.radius); }

  function isExplored(state, x, y) { return state.explored.some(area => Math.hypot(x - area.x, y - area.y) <= area.radius); }
  function nearestSettlement(state, x, y) { return state.settlements.reduce((best, item) => Math.hypot(item.x - x, item.y - y) < Math.hypot(best.x - x, best.y - y) ? item : best, state.settlements[0]); }

  function build(state, type, x, y, size = 1) {
    const definition = getDefinition(type);
    const access = available(state, definition);
    if (!access.ok) return access;
    const px = clamp(cleanNumber(x, 2048), 24, WORLD_SIZE - 24), py = clamp(cleanNumber(y, 2048), 24, WORLD_SIZE - 24);
    if(terrain(state,px,py).water&&type!=='bridge')return {ok:false,message:'这里是水域。'};
    if(foreignOwner(state,px,py))return {ok:false,message:'这里属于邻国，不能安排本国建设。'};
    if (!isExplored(state, px, py)) return { ok: false, message: '先探索这里，再安排建设。' };
    const local = nearestSettlement(state, px, py);
    if (!local || Math.hypot(local.x - px, local.y - py) > 600) return { ok: false, message: '离聚落太远，请先建立新聚落。' };
    if(local.population<(definition.requiredCityPopulation||0))return {ok:false,message:'这里的城市规模不足。'};
    if(definition.location==='river'&&terrain(state,px,py).river>140)return {ok:false,message:'水磨坊需要靠近河流。'};
    const safeSize = clamp(Math.round(cleanNumber(size, 1)), 1, 3);
    const footprint = (definition.footprint || 20) * Math.sqrt(safeSize);
    const overlap = state.buildings.some(building => building.status !== 'failed' && Math.hypot(px - building.x, py - building.y) < (footprint + (getDefinition(building.type)?.footprint || 12)) * 0.42);
    if (overlap) return { ok: false, message: '这里已有建筑，请选择旁边的空地。' };
    const costs = costsFor(definition, safeSize);
    if (!enough(state, costs)) return { ok: false, message: '现有资源不足，等待生产或先发展对应资源。' };
    pay(state, costs);
    const id = `building-${++state.buildingSerial}`;
    state.buildings.push({ id, type, x: px, y: py, progress: 0, status: 'building', size: safeSize, settlementId: local.id, started: state.year, signalIssued: false, years: definition.years * (safeSize > 1 ? 1.25 : 1), cost: costs, finance: state.financing || 'public' });
    return { ok: true, message: `${definition.name}已开始建设`, buildingId: id };
  }

  function finishBuilding(state, building) {
    const definition = getDefinition(building.type);
    const large = !definition.small;
    const risk = large ? clamp(0.09 - state.admin * 0.0006 - state.knowledge * 0.00008, 0.025, 0.09) : 0;
    if (large && random(state) < risk) {
      building.status = 'failed';
      building.progress = 100;
      state.failedProjects += 1;
      state.stability = clamp(state.stability - 4, 0, 100);
      const loss = Math.min(state.resources.treasury, 10 + state.population * 0.03);
      state.resources.treasury -= loss;
      event(state, 'failure', `${definition.name}未能完成`, '施工新闻中反复出现的困难最终使项目中止。前期资源已经支出，公众信任下降，下一项公共计划需要重新积累支持。', { buildingId: building.id, stability: -4, treasury: -loss, x: building.x, y: building.y });
      return;
    }
    building.status = 'complete';
    building.progress = 100;
    state.completedProjects += 1;
    if(building.type==='factory'&&largestCityPopulation(state)>=10000)state.industrialized=true;
    state.stability = clamp(state.stability + (definition.stability || (large ? 1 : 0)), 0, 100);
    if(!definition.small) event(state, 'success', `${definition.name}建成`, `${definition.name}已投入使用。`, { buildingId: building.id, x: building.x, y: building.y });
  }

  function togglePolicy(state, id) {
    const definition = policyDefinitions.find(item => item.id === id);
    const access = available(state, definition);
    if (!access.ok) return access;
    const existing = state.policies[id];
    if (existing && existing.active) {
      existing.active = false;
      event(state, 'news', `${definition.name}暂停`, '新规则停止向外传播，既有覆盖会逐步回落。', { policy: id });
      return { ok: true, message: '政策已暂停' };
    }
    if (!enough(state, definition.cost || {})) return { ok: false, message: '启动这项政策所需的公共资源尚未备齐。' };
    pay(state, definition.cost || {});
    state.policies[id] = { active: true, coverage: existing ? Math.max(0, existing.coverage) : 0, started: state.year, coveredSettlements: 0 };
    event(state, 'news', `${definition.name}开始实施`, '规则先在村落核心实行，并随时间逐渐覆盖聚落。', { policy: id, coverage: 0 });
    return { ok: true, message: '政策开始逐步覆盖' };
  }

  const reformProfiles={
    governance:{elders:[0,0],council:[1,3],administration:[3,9],representative:[5,15]},
    property:{communal:[0,0],household:[1,2],mixed:[3,5],cooperative:[4,8]},
    allocation:{reciprocity:[0,0],market:[2,5],public:[4,8],mixed:[5,10]},
    labor:{cooperative:[0,0],publicworks:[1,3],wage:[4,8],producer:[3,6]}
  };
  function reformPreview(state,id,choice) {
    const definition = reformDefinitions.find(item => item.id === id);
    const access = available(state, definition);
    if (!access.ok) return access;
    const option = definition.choices.find(item => item.id === choice);
    if (!option) return { ok: false, message: '请选择具体的制度方向。' };
    const unlocked = available(state, option);
    if (!unlocked.ok) return unlocked;
    const old=reformProfiles[id][state.institutions[id]]||[0,0],next=reformProfiles[id][choice];
    const change=Math.abs(next[0]-old[0]),benefit=Math.max(0,next[1]-old[1]);
    const resistance=clamp((5+change*6+benefit*1.5+(100-state.stability)*.08)/(1+Math.min(.5,state.admin/160)),0,85);
    const years=Math.ceil((3+change*1.4+benefit*.2+resistance*.08)*4)/4;
    const cost=Object.fromEntries(Object.entries(definition.cost).map(([k,v])=>[k,Math.ceil(v*(1+change*.2+Math.min(.6,Math.max(0,largestCityPopulation(state)-240)/20000)))]));
    const preview={ok:true,cost,resistance,years,change,benefit,drawback:`既有组织与受影响群体会抵制调整，推行时公众信任下降 ${Math.round(resistance*.18*10)/10}。`};
    if (state.institutions[id] === choice) return {...preview,ok:false,message:'这已经是当前的制度。',cost:{},resistance:0,years:0,change:0,benefit:0};
    if (state.reformProcess||state.reformCooldown>state.elapsed)return {...preview,ok:false,message:'上一轮改革仍在落实。'};
    if (!enough(state,cost))return {...preview,ok:false,message:'公共资源不足，无法开展这项改革。'};
    return preview;
  }
  function reform(state,id,choice) {
    initialize(state);
    const preview=reformPreview(state,id,choice);if(!preview.ok)return preview;
    pay(state,preview.cost);
    state.reformProcess={id,choice,started:state.elapsed,years:preview.years,resistance:preview.resistance};
    state.reformCooldown=state.elapsed+preview.years;
    state.stability=clamp(state.stability-preview.resistance*.18,0,100);
    const definition=reformDefinitions.find(d=>d.id===id),option=definition.choices.find(o=>o.id===choice);
    event(state,'milestone',`${definition.name}改革启动`,`${option.name}开始落实，预计 ${preview.years} 年；原有制度在调整完成前继续运行。`,{reform:id,choice});
    return {ok:true,message:'制度改革已开始落实',...preview};
  }
  function reformTick(state) {
    const process=state.reformProcess;
    if(!process||state.elapsed-process.started<process.years-.000001)return;
    state.institutions[process.id]=process.choice;
    state.reformProcess=null;state.reformCooldown=state.elapsed;
    const definition=reformDefinitions.find(d=>d.id===process.id),option=definition.choices.find(o=>o.id===process.choice);
    event(state,'milestone',`${definition.name}改革完成`,`${option.name}已落实。`,{reform:process.id,choice:process.choice});
  }

  function explore(state, x, y) {
    initialize(state);
    if(state.expeditions.length>=expeditionLimit(state))return {ok:false,message:'探索队尚未返回。'};
    const costs = { food: 16, wood: 6 };
    if (!enough(state, costs)) return { ok: false, message: '探索队需要 16 粮食和 6 木材。' };
    let px, py;
    if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
      px = clamp(Number(x), 90, WORLD_SIZE - 90); py = clamp(Number(y), 90, WORLD_SIZE - 90);
    } else {
      const angle = state.exploredCount * 2.399963 + (state.seed % 25) * 0.1;
      const ring = (state.explored[0]?.radius||380)*.9 + Math.floor(state.exploredCount / 5) * 210;
      px = clamp(2048 + Math.cos(angle) * ring, 100, WORLD_SIZE - 100);
      py = clamp(2048 + Math.sin(angle) * ring, 100, WORLD_SIZE - 100);
    }
    const connected = state.explored.some(area => Math.hypot(area.x - px, area.y - py) < area.radius + 220);
    if (!connected) return { ok: false, message: '探索队只能从已知土地继续出发。' };
    if (state.explored.some(area => Math.hypot(area.x - px, area.y - py) < area.radius * 0.65)) return { ok: false, message: '这里已经很熟悉了，试着探索更远的方向。' };
    if(state.expeditions.some(e=>Math.hypot(e.x-px,e.y-py)<180))return {ok:false,message:'已有探索队前往这一带。'};
    pay(state, costs);
    const origin=nearestSettlement(state,px,py),land=terrain(state,px,py);
    const distance=Math.hypot(px-origin.x,py-origin.y),roads=1+Math.min(.5,count(state,'path')*.035+count(state,'bridge')*.06);
    const duration=Math.max(1.5,(2+distance/180+(land.mountain?1.5:land.water?2:land.forest?.5:0))/roads);
    const expedition={id:`expedition-${++state.expeditionSerial}`,x:px,y:py,fromX:origin.x,fromY:origin.y,started:state.elapsed,duration,progress:0};
    state.expeditions.push(expedition);
    return {ok:true,message:'探索队已出发',expeditionId:expedition.id,duration,x:px,y:py};
  }
  function expeditionLimit(state) { return count(state,'council')?2:1; }
  function cancelExpedition(state,id) {
    const index=state.expeditions.findIndex(e=>e.id===id);
    if(index<0)return {ok:false,message:'这支探索队已返回。'};
    state.expeditions.splice(index,1);return {ok:true,message:'探索队已撤回，物资已经耗用。'};
  }
  function explorationTick(state) {
    for(const e of [...state.expeditions]){
      e.progress=clamp((state.elapsed-e.started)/e.duration*100,0,100);
      if(e.progress<100-.000001)continue;
      finishExploration(state,e.x,e.y);
      state.expeditions=state.expeditions.filter(item=>item.id!==e.id);
    }
  }
  function finishExploration(state,px,py) {
    const radius = 290 + Math.min(120, state.knowledge * 0.2);
    state.explored.push({ x: px, y: py, radius });
    state.exploredCount += 1;
    state.knowledge += 1.4;
    const discoveries = [
      { title: '发现丰茂林地', desc: '探索队带回了林地的消息和一批可用木材。', resource: 'wood', amount: 18 },
      { title: '发现河岸草甸', desc: '潮湿的草甸适合采集与未来耕作。探索队带回了一些食物。', resource: 'food', amount: 24 },
      { title: '发现裸露岩层', desc: '附近的石灰岩与石料可以用于后续公共建设。', resource: 'stone', amount: 14 },
      { title: '发现远处丘陵', desc: '探索队绘下了丘陵、河道和林缘。已知世界向外扩展。', resource: 'food', amount: 12 }
    ];
    const discovery = discoveries[Math.floor(random(state) * discoveries.length)];
    state.resources[discovery.resource] += discovery.amount;
    event(state, 'milestone', discovery.title, discovery.desc, { x: px, y: py, explored: state.exploredCount, resource: discovery.resource, amount: discovery.amount });
  }

  function settle(state, x, y) {
    const px = clamp(cleanNumber(x, 2360), 120, WORLD_SIZE - 120), py = clamp(cleanNumber(y, 2250), 120, WORLD_SIZE - 120);
    if(terrain(state,px,py).water)return {ok:false,message:'聚落需要建在陆地上。'};
    if(foreignOwner(state,px,py))return {ok:false,message:'这里属于邻国，不能建立聚落。'};
    if (state.population < 60) return { ok: false, message: '至少需要 60 位村民，才能安排第一批家庭迁出。' };
    if (!isExplored(state, px, py)) return { ok: false, message: '请先探索这片土地。' };
    if (state.settlements.some(item => Math.hypot(item.x - px, item.y - py) < 220)) return { ok: false, message: '离现有村落太近，选择稍远的已探索土地。' };
    const costs = { food: 55, wood: 65, stone: 12 };
    if (!enough(state, costs)) return { ok: false, message: '新聚落需要 55 粮食、65 木材和 12 石材。' };
    pay(state, costs);
    const names = ['林间', '南湾', '石溪', '雾岭', '长坡', '松原', '白石'];
    const id = `settlement-${state.settlements.length}`;
    const nearest = nearestSettlement(state, px, py);
    nearest.population = Math.max(0, nearest.population - 14);
    const name = names[(state.settlements.length - 1) % names.length];
    state.settlements.push({ id, name, x: px, y: py, population: 14, level: 0 });
    [[-23, -13], [19, -12], [4, 23]].forEach((p, index) => state.buildings.push({ id: `${id}-hut-${index}`, type: 'hut', x: px + p[0], y: py + p[1], progress: 100, status: 'complete', size: 1, settlementId: id }));
    state.buildings.push({ id: `${id}-fire`, type: 'fire', x: px, y: py, progress: 100, status: 'complete', size: 1, settlementId: id });
    event(state, 'milestone', `${name}落成`, '十四位村民沿着新路径建立聚落。大地图开始以聚落为单位记录共同体的扩展。', { settlementId: id, x: px, y: py });
    return { ok: true, message: `${name}成为新的聚落`, settlementId: id };
  }

  function updateStage(state) {
    const s = stats(state);
    let next = '河畔营地';
    if (s.population >= 45 && state.completedProjects >= 1) next = '定居村落';
    if (s.population >= 90 && s.knowledge >= 12 && s.productivity >= 10) next = '农业共同体';
    if (s.population >= 180 && s.knowledge >= 35 && count(state, 'council')) next = '早期城邑';
    if (s.population >= 350 && s.knowledge >= 80 && (count(state, 'market') || state.settlements.length >= 2)) next = '地区国家';
    if(isIndustrialized(state)){state.industrialized=true;next='工业社会';}
    if (isIndustrialized(state)&&s.knowledge >= 320 && count(state, 'power')) next = '现代文明';
    if (isIndustrialized(state)&&s.knowledge >= 500 && count(state, 'research')) next = '未来共同体';
    if (next !== state.stage) {
      state.stage = next;
      event(state, 'milestone', `走向${next}`, '人口、知识、公共建设与治理的连续选择，使文明形成了新的发展阶段。新的政策和建设会逐步开放。', { stage: next });
    }
    if(s.population>=180&&s.knowledge>=35&&count(state,'council'))state.cityFounded=true;
  }

  function recordStats(state) {
    const current = stats(state);
    state.statsHistory.push({ year: state.year, population: current.population, food: current.food, wood: current.wood, stone: current.stone, stability: current.stability, knowledge: current.knowledge, treasury: current.treasury });
    if (state.statsHistory.length > 60) state.statsHistory.shift();
  }

  function periodicNews(state) {
    const housing = stats(state).housing;
    const news = [
      { title: '林缘的消息', body: '一位猎人带回了远处林地的路径。村民把新的方向画在炭灰旁，等待下一次探索。', amount: 4, resource: 'wood' },
      { title: '河道转暖', body: '今年河边的采集收获不错，公共食物多了一些。', amount: 9, resource: 'food' },
      { title: '屋檐下的新家庭', body: housing > state.population + 5 ? '邻近家庭听说聚落有食物与住所，正在考虑沿河迁入。' : '屋舍的空位越来越少，年轻家庭希望找到更多居住空间。', amount: 0 },
      { title: '石器的新刻痕', body: '村民把一项制器经验传给下一代，细小的知识开始留下痕迹。', amount: 1.2, resource: 'knowledge' }
    ];
    const item = news[Math.floor(random(state) * news.length)];
    if (item.resource === 'knowledge') state.knowledge += item.amount;
    else if (item.resource) state.resources[item.resource] += item.amount;
    event(state, 'news', item.title, item.body, { resource: item.resource, amount: item.amount });
  }

  function tick(state, years) {
    initialize(state);
    let remaining = clamp(cleanNumber(years), 0, 120);
    while (remaining > 0.000001) {
      const dt = Math.min(remaining, 0.25);
      remaining -= dt;
      state.year += dt;
      state.elapsed += dt;
      foreignTick(state,dt);
      const s = stats(state);
      const suppliedFood=state.resources.food+s.foodProduction*dt;
      state.resources.food = clamp(state.resources.food + s.domesticFoodRate * dt, 0, 9999999);
      const mills=state.buildings.filter(b=>b.type==='lumber'&&b.status==='complete');
      const millRate=mills.reduce((n,b)=>n+8*b.size*clamp(forestRemaining(state,b.x,b.y)/24,0,1),0);
      const otherWood=4.4*clamp(state.population/36,0,1)+state.buildings.filter(b=>b.status==='complete'&&b.type!=='lumber').reduce((n,b)=>n+(getDefinition(b.type)?.woodRate||0)*b.size,0);
      const woodFactor=s.woodProduction/Math.max(.01,otherWood+millRate);
      let woodGained=otherWood*woodFactor*dt;
      mills.forEach(b=>woodGained+=harvest(state,b.x,b.y,8*b.size*woodFactor*dt));
      state.resources.wood = clamp(state.resources.wood + woodGained, 0, 9999999);
      state.resources.stone = clamp(state.resources.stone + s.stoneProduction * dt, 0, 9999999);
      state.resources.treasury = hasCurrency(state)?clamp(state.resources.treasury+s.domesticTreasuryRate*dt,0,9999999):0;
      state.knowledge = clamp(state.knowledge + s.knowledgeRate * dt, 0, 99999);
      const housingFactor = clamp((s.housing - state.population) / Math.max(8, state.population), -0.08, 0.35);
      const satisfaction=clamp(suppliedFood/Math.max(.001,s.foodConsumption*dt),0,1);
      const foodFactor = state.resources.food > state.population * 0.4 ? 1 : .2;
      const growth = state.population * ((0.012 + housingFactor * 0.035)*foodFactor*satisfaction-(1-satisfaction)*.18);
      const migration = s.migrationRate * (s.housing > state.population + 3 && state.resources.food > 25 ? 1 : 0);
      const oldPopulation = state.population;
      state.population = Math.max(0, state.population + (growth + migration) * dt);
      const popChange = state.population - oldPopulation;
      const share = state.settlements.reduce((sum, item) => sum + item.population, 0) || 1;
      state.settlements.forEach(settlement => {
        settlement.population += popChange * settlement.population / share;
        settlement.level = settlement.population >= 500 ? 3 : settlement.population >= 180 ? 2 : settlement.population >= 70 ? 1 : 0;
      });
      const targetStability = 76 + effects(state).stability - (state.resources.food < 12 ? 14 : 0) - (state.population > s.housing ? Math.min(12, (state.population - s.housing) * 0.25) : 0);
      state.stability = clamp(state.stability + (targetStability - state.stability) * 0.035 * dt, 15, 99);
      if (state.resources.food < Math.max(10, state.population * 0.18) && !state.milestoneFlags.lowFood) {
        state.milestoneFlags.lowFood = true;
        event(state, 'news', '粮食储备偏低', '公共食物正在减少。村落账册记录了当前供给，是否开垦农田或调整采集规则由你决定。', { food: Math.floor(state.resources.food), foodRate: s.foodRate });
      } else if (state.resources.food > state.population * 0.6) state.milestoneFlags.lowFood = false;
      if (state.population >= s.housing - 1 && !state.milestoneFlags.housing) {
        state.milestoneFlags.housing = true;
        event(state, 'news', '屋舍逐渐住满', '现有房屋已接近承载上限。村落的下一批家庭正在寻找落脚空间。', { population: Math.floor(state.population), housing: s.housing });
      } else if (state.population < s.housing - 6) state.milestoneFlags.housing = false;
      state.productivity = clamp(state.productivity + (state.knowledge * 0.0006) * dt, 8, 200);
      state.admin = clamp(state.admin + (state.knowledge * 0.00025) * dt, 12, 100);
      Object.entries(state.policies).forEach(([id, policy]) => {
        const definition = policyDefinitions.find(item => item.id === id);
        if (!definition) return;
        const speed = 100 / definition.spreadYears * (0.6 + state.admin / 70) / Math.max(1, state.settlements.length * 0.6);
        policy.coverage = clamp(policy.coverage + (policy.active ? speed : -4) * dt, 0, 100);
        policy.coveredSettlements = Math.floor(state.settlements.length * policy.coverage / 100);
      });
      state.proposals.forEach(p=>{
        const executor=policyExecutors.find(e=>e.id===p.executor);
        if(p.duration&&state.elapsed-p.started>=p.duration)p.active=false;
        const spread=Math.max(...p.clauses.map(id=>policyDefinitions.find(d=>d.id===id)?.spreadYears||4)),local=scopeSettlements(state,p),home=state.settlements[0];
        const roads=1+count(state,'path')*.03+count(state,'bridge')*.05;
        p.localCoverage ||= Object.fromEntries(local.map(s=>[s.id,p.coverage||0]));
        for(const s of local){const distance=1+Math.hypot(s.x-home.x,s.y-home.y)/600,resistance=1+clamp(p.resistance||0,0,85)/80;p.localCoverage[s.id]=clamp((p.localCoverage[s.id]||0)+(p.active?100/spread*(executor?.efficiency||1)*roads/(distance*Math.max(1,local.length*.75)*resistance):-6)*dt,0,100);}
        p.coverage=local.reduce((n,s)=>n+p.localCoverage[s.id]*s.population,0)/Math.max(1,local.reduce((n,s)=>n+s.population,0));
      });
      const newly=visiblePolicies(state).filter(d=>!state.policyKnown.includes(d.id));
      if(newly.length){state.policyKnown.push(...newly.map(d=>d.id));event(state,'milestone','新的议案条款',newly.map(d=>`${d.name}：${d.drawback}`).join('\n'),{clauses:newly.map(d=>d.id),dedupe:`unlock:${newly.map(d=>d.id).join(',')}`});}
      state.buildings.forEach(building => {
        if (building.status !== 'building') return;
        const definition = getDefinition(building.type);
        const previous = building.progress;
        building.progress = clamp(building.progress + dt / building.years * 100 * (1 + s.constructionBonus), 0, 100);
        if (!definition.small && !building.signalIssued && previous < 55 && building.progress >= 55) {
          building.signalIssued = true;
          const riskMessages = ['地方传来几批材料晚到的消息，工地记录仍在更新。', '施工者提及近期天气反复，项目新闻正在关注进度。', '工地报告对下一阶段的安排持谨慎态度。'];
          event(state, 'report', `${definition.name}施工简报`, riskMessages[Math.floor(random(state) * riskMessages.length)], { buildingId: building.id, progress: Math.floor(building.progress) });
        }
        if (building.progress >= 100) finishBuilding(state, building);
      });
      if (!Number.isFinite(state.lastStats)) state.lastStats = Math.floor(state.elapsed - dt);
      if (state.elapsed - state.lastStats >= 1) {
        state.lastStats = Math.floor(state.elapsed);
        recordStats(state);
      }
      if (state.elapsed - state.lastReport >= 25) {
        state.lastReport = state.elapsed;
        const current = stats(state);
        const old=state.lastReportSnapshot;
        if(Math.abs(current.population-old.population)>=Math.max(8,old.population*.2)||Math.abs(current.stability-old.stability)>12){event(state, 'report', '聚落变迁', `人口 ${current.population} 人 · 粮食 ${Math.floor(current.food)} · 信任 ${Math.floor(current.stability)}%`, { population: current.population, food: current.food, knowledge: current.knowledge, housing: current.housing });state.lastReportSnapshot={population:current.population,food:current.food,stability:current.stability};}
      }
      hostileTick(state,dt);
      reformTick(state);
      explorationTick(state,dt);
      autoBuild(state);
      updateStage(state);
    }
    return state;
  }

  function setBudget(state, field, value) {
    if (!count(state, 'council')) return { ok: false, message: '建成议事屋后，才能调整税率与公共预算。' };
    const fields = ['construction', 'welfare', 'knowledge'];
    if (field !== 'taxRate' && !fields.includes(field)) return { ok: false, message: '请选择有效的预算项目。' };
    if(field==='taxRate'&&!hasCurrency(state))return {ok:false,message:'当前只能安排实物与劳役。'};
    if (!state.budget) state.budget = { taxRate: 0.08, construction: 45, welfare: 30, knowledge: 25 };
    if (field === 'taxRate') state.budget.taxRate = clamp(cleanNumber(value, state.budget.taxRate), 0, 0.3);
    else {
      const defaults = { construction: 45, welfare: 30, knowledge: 25 };
      const others = fields.filter(key => key !== field);
      const amount = Math.round(clamp(cleanNumber(value, state.budget[field]), 0, 100) * 10) / 10;
      const remainder = 100 - amount;
      let weights = others.map(key => clamp(cleanNumber(state.budget[key], defaults[key]), 0, 100));
      if (weights[0] + weights[1] === 0) weights = others.map(key => defaults[key]);
      state.budget[field] = amount;
      state.budget[others[0]] = Math.round(remainder * weights[0] / (weights[0] + weights[1]) * 10) / 10;
      state.budget[others[1]] = Math.round((remainder - state.budget[others[0]]) * 10) / 10;
    }
    return { ok: true, message: '公共预算方向已调整', budget: Object.assign({}, state.budget), effects: budgetEffects(state) };
  }

  function historicalTags(state) {
    const tags = ['定居共同体'];
    if (count(state, 'farm') > 2) tags.push('农业社会');
    if (count(state, 'market') || proposalCoverage(state, 'trade') > 0.4) tags.push('地区交换网络');
    if (state.institutions.allocation === 'market') tags.push('市场流通');
    if (state.institutions.allocation === 'public') tags.push('公共计划');
    if (state.institutions.property === 'cooperative') tags.push('合作社组织');
    if (isIndustrialized(state)) tags.push('工业化');
    if (isIndustrialized(state)&&proposalCoverage(state, 'education') > 0.4) tags.push('公共教育');
    if (count(state, 'research')) tags.push('知识与自动化');
    return tags;
  }

  root.CivilEngine = {
    VERSION, WORLD_SIZE,
    buildings: buildingDefinitions,
    policies: policyDefinitions,
    reforms: reformDefinitions,
    create, tick, build, togglePolicy, reform, explore, settle, stats, setBudget,
    available, isExplored, historicalTags,
    costsFor,
    initialize, visiblePolicies, proposalOptions, draftPolicy, setProposalActive, automationLevel, setAutomation, forestRemaining, respondHostile,
    hasCurrency,canIntroduceCurrency,introduceCurrency,foreignAction,foreignSummary,foreignOwner,expeditionLimit,cancelExpedition,
    largestCityPopulation,isIndustrialized,reformPreview,
    snapshot(state) { return JSON.parse(JSON.stringify(state)); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
