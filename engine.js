(function (root) {
  'use strict';

  const VERSION = 3;
  const WORLD_SIZE = 4096;
  const MAX_POLICY_CLAUSES = 6;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
  const cleanNumber = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  function generatedName(state,kind,index=0,additional=[]) {
    const banks=kind==='clan'?[['赤石','白狼','苍松','鹿角','河谷','灰鹰','黑杉','霜原'],['瓦尔','斯凯尔','布伦','诺德','阿尔登','洛克','芬里','埃达']]:[['青穗','岩岬','晨岚','云泽','苍岭','临川','霜林','长湾','白河','松原','雾港','赤原'],['阿尔登','瓦伦','洛瑟恩','维斯特','诺德海姆','卡斯特','埃斯特拉','贝尔蒙','拉文纳','索尔维克','米拉诺','奥斯特']];
    const family=Math.floor(root.CivilTerrain.hash(index,kind==='clan'?17:31,state.seed)*banks.length)%banks.length;
    const pool=banks[family],start=Math.floor(root.CivilTerrain.hash(index,73,state.seed+91)*pool.length)%pool.length;
    const suffix=kind==='clan'?(family?'部族':'氏族'):kind==='town'?(family?'':'城'):(family?['公国','王国','共和国','联盟']:['邦国','公国','联盟','王国'])[Math.floor(root.CivilTerrain.hash(index,41,state.seed)*4)%4];
    const used=new Set([state.name,...additional,...(state.neighbors||[]).map(n=>n.name),...(state.hostiles||[]).map(n=>n.name),...(state.settlements||[]).map(n=>n.name)]);
    for(let i=0;i<pool.length;i++){const name=pool[(start+i)%pool.length]+suffix;if(!used.has(name))return name;}
    return `${pool[start]}${index+1}${suffix}`;
  }
  const allResources = ['food', 'wood', 'stone', 'treasury', 'clay', 'iron', 'coal', 'tools', 'cloth', 'medicine', 'copper', 'gold'];
  const SYSTEM_INTERVALS = { politics:.5, macro:.5, economy:.05, warfare:.1, foreign:.25, society:.25, policy:.25, supplies:.25, planning:1 };
  function due(state,system,dt){const sim=state.simulation;sim.accumulators[system]=(sim.accumulators[system]||0)+dt;const interval=SYSTEM_INTERVALS[system];if(sim.accumulators[system]+1e-8<interval)return 0;const passed=sim.accumulators[system];sim.accumulators[system]=0;sim.runs[system]=(sim.runs[system]||0)+1;return passed;}
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
  buildingDefinitions.push(
    {id:'shrine',name:'祭祀场',icon:'shrine',category:'civic',desc:'地方仪式与口述传承的共同场所。',cost:{wood:22,stone:16,food:8},years:2,stability:1,knowledgeRate:.12,footprint:22,small:true},
    {id:'temple',name:'神殿',icon:'temple',category:'civic',desc:'宗教组织提供地方协调与知识保存，并积累社会影响。',cost:{wood:180,stone:230,food:50},years:12,requiredCityPopulation:600,requiredKnowledge:50,requiredBuildings:['shrine','council'],stability:3,knowledgeRate:1.5,admin:3,footprint:42,small:false},
    {id:'plaza',name:'公共广场',icon:'plaza',category:'civic',desc:'城市集会、公共节庆与文化交流的空间。',cost:{wood:60,stone:100},years:5,requiredCityPopulation:180,requiredKnowledge:20,requiredBuildings:['council'],stability:2,admin:2,footprint:35,small:false},
    {id:'theater',name:'剧场',icon:'theater',category:'civic',desc:'维持艺术传承，促进跨地区的文化交流。',cost:{wood:160,stone:190,food:40},years:9,requiredCityPopulation:1500,requiredKnowledge:80,requiredBuildings:['plaza'],knowledgeRate:1.5,stability:3,footprint:38,small:false},
    {id:'printing',name:'印刷坊',icon:'printing',category:'civic',desc:'复制书籍与公共文书，提高知识传播和治理效率。',cost:{wood:200,stone:140,treasury:80},years:8,requiredCityPopulation:3000,requiredKnowledge:130,requiredBuildings:['library','guildhall'],knowledgeRate:6,admin:6,footprint:29,small:false},
    {id:'museum',name:'博物馆',icon:'museum',category:'civic',desc:'保存各地区的历史遗产与公共记忆。',cost:{wood:280,stone:420,treasury:230},years:14,requiredCityPopulation:12000,requiredKnowledge:250,requiredIndustry:true,requiredBuildings:['library','publicschool'],knowledgeRate:5,stability:4,footprint:43,small:false},
    {id:'manor',name:'贵族庄园',icon:'manor',category:'production',desc:'土地贵族组织庄园生产，维持其地方权力。',cost:{wood:180,stone:130,food:60},years:9,requiredCityPopulation:600,requiredKnowledge:55,requiredBuildings:['granary','council'],foodRate:100,housing:35,footprint:48,small:false},
    {id:'castle',name:'城堡',icon:'castle',category:'defense',desc:'常备守卫与储备设施保护城市，增强地方贵族影响。',cost:{wood:240,stone:600,food:100},years:18,requiredCityPopulation:3000,requiredKnowledge:100,requiredBuildings:['wall','manor'],defense:35,admin:6,footprint:60,small:false},
    {id:'guildhall',name:'行会会馆',icon:'guildhall',category:'production',desc:'协调专业手艺与物资供应。',cost:{wood:140,stone:110,food:30},years:7,requiredCityPopulation:600,requiredKnowledge:70,requiredBuildings:['market','workshop'],woodRate:7,stoneRate:5,knowledgeRate:1,productivity:5,footprint:32,small:false},
    {id:'inn',name:'驿馆',icon:'inn',category:'civic',desc:'提供旅人食宿与使节联络，促进流动和治理。',cost:{wood:90,stone:60},years:4,requiredCityPopulation:180,requiredKnowledge:25,requiredBuildings:['market','path'],admin:4,migration:.2,footprint:27,small:true},
    {id:'harbor',name:'河港',icon:'harbor',category:'production',desc:'邻水装卸物资，提高运输和施工调配能力。',cost:{wood:210,stone:170},years:10,requiredCityPopulation:600,requiredKnowledge:65,requiredBuildings:['warehouse','bridge'],location:'river',constructionBonus:.08,productivity:7,footprint:46,small:false},
    {id:'fair',name:'集散市场',icon:'fair',category:'production',desc:'集中地区交换，形成国内贸易税的流通基础。',cost:{wood:150,stone:120,food:30},years:8,requiredCityPopulation:1500,requiredKnowledge:85,requiredBuildings:['market','warehouse'],woodRate:5,stoneRate:4,treasuryRate:5,productivity:7,footprint:40,small:false},
    {id:'road',name:'铺装道路',icon:'road',category:'production',desc:'代替土路，提高跨地区物资与行政传导速度。',cost:{wood:12,stone:65},years:3,requiredCityPopulation:600,requiredKnowledge:65,requiredBuildings:['quarry','council'],productivity:5,admin:3,footprint:16,small:true},
    {id:'aqueduct',name:'供水设施',icon:'aqueduct',category:'civic',desc:'从水源向城区稳定供水，提高城市承载。',cost:{wood:160,stone:340,food:45},years:12,requiredCityPopulation:3000,requiredKnowledge:115,requiredBuildings:['well','quarry'],housing:300,stability:3,footprint:40,small:false},
    {id:'sewer',name:'排污设施',icon:'sewer',category:'civic',desc:'工业城市的排污管网改善公共卫生。',cost:{wood:190,stone:390,treasury:130},years:11,requiredCityPopulation:10000,requiredKnowledge:210,requiredIndustry:true,requiredBuildings:['aqueduct'],housing:400,stability:6,footprint:32,small:false},
    {id:'tram',name:'公共电车站',icon:'tram',category:'production',desc:'联接住宅和工场，改善城市通勤及治理。',cost:{wood:280,stone:360,treasury:300},years:12,requiredCityPopulation:15000,requiredKnowledge:270,requiredIndustry:true,requiredBuildings:['railstation','steamplant'],productivity:16,admin:12,footprint:38,small:false},
    {id:'taxoffice',name:'税务署',icon:'taxoffice',category:'civic',desc:'记录土地、人口与流通税基，工业化后可组织增值税征收。',cost:{wood:130,stone:160,treasury:65},years:7,requiredCityPopulation:3000,requiredKnowledge:130,requiredBuildings:['council','market'],admin:10,footprint:31,small:false},
    {id:'brickhouse',name:'砖砌住宅',icon:'brickhouse',category:'housing',desc:'工业城市的成片砖砌住宅，供四百人居住。',cost:{wood:180,stone:340,treasury:110},years:6,requiredCityPopulation:10000,requiredKnowledge:180,requiredIndustry:true,requiredBuildings:['warehouse'],housing:400,footprint:36,small:false},
    {id:'barracks',name:'兵营',icon:'barracks',category:'defense',desc:'集中训练与储备军需，提高常备动员的供给能力。',cost:{wood:130,stone:110,food:50},years:6,requiredCityPopulation:600,requiredKnowledge:60,requiredBuildings:['council','forge'],defense:8,footprint:36,small:false}
  );
  buildingDefinitions.push(
    {id:'mint',name:'铸币所',icon:'mint',category:'production',desc:'检验与铸造统一货币，减少结算和行政成本。',cost:{wood:160,stone:180,treasury:75},years:8,requiredCityPopulation:600,requiredKnowledge:75,requiredBuildings:['forge','market'],admin:5,treasuryRate:3,footprint:30,small:false},
    {id:'bank',name:'银行',icon:'bank',category:'civic',desc:'办理存储与支付结算，提高工程资金调配效率；收入为服务费用，不凭空增加本金。',cost:{wood:220,stone:280,treasury:160},years:11,requiredCityPopulation:3000,requiredKnowledge:125,requiredBuildings:['warehouse','guildhall'],treasuryRate:5,constructionBonus:.08,admin:4,footprint:39,small:false},
    {id:'exchange',name:'商贸交易所',icon:'exchange',category:'production',desc:'集中商品报价与交易结算，改善物资流通。',cost:{wood:210,stone:220,treasury:120},years:10,requiredCityPopulation:3000,requiredKnowledge:150,requiredBuildings:['fair','bank'],woodRate:6,stoneRate:5,treasuryRate:4,productivity:7,footprint:38,small:false},
    {id:'postoffice',name:'邮驿局',icon:'postoffice',category:'civic',desc:'组织跨城文书与邮件，缩短政策传达的时间。',cost:{wood:140,stone:100,food:30},years:6,requiredCityPopulation:600,requiredKnowledge:70,requiredBuildings:['council','road'],admin:8,knowledgeRate:.8,footprint:27,small:false}
  );
  buildingDefinitions.push(...(root.CivilLogistics?.buildings||[]));
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
  policyDefinitions.push(
    {id:'rationing',name:'按户配给粮食',icon:'grain',desc:'将食物优先分配给缺粮家庭。',cost:{food:12},spreadYears:4,foodBonus:.08,stabilityBonus:2,drawback:'配给和登记占用劳动，家庭失去部分分配自由。',tradeoffs:{woodPenalty:.07,opposition:4}},
    {id:'seedreserve',name:'留存公共种粮',icon:'sprout',desc:'在收获后留种并交换种植经验。',cost:{food:25},requiredBuildings:['farm'],spreadYears:5,foodBonus:.12,drawback:'当前口粮和木工劳动需让位于来年的耕作。',tradeoffs:{woodPenalty:.08,opposition:2}},
    {id:'firewatch',name:'组织夜间守望',icon:'shield',desc:'安排居民巡夜，守护储备和公共场所。',cost:{food:10,wood:8},spreadYears:4,defense:7,stabilityBonus:1,drawback:'轮值占用日常生产与休息时间。',tradeoffs:{foodPenalty:.04,woodPenalty:.04,opposition:2}},
    {id:'watercare',name:'维护公共水源',icon:'water',desc:'安排清理水井与公共取水点。',cost:{wood:12},requiredBuildings:['well'],spreadYears:4,stabilityBonus:3,drawback:'定期维护抽走部分采石劳动。',tradeoffs:{stonePenalty:.08}},
    {id:'apprentice',name:'组织学徒传艺',icon:'hammer',desc:'由作坊集中培养专业技艺。',cost:{food:24,wood:10},requiredBuildings:['workshop'],requiredKnowledge:5,spreadYears:7,knowledgeRate:1.1,stoneBonus:.06,drawback:'熟练工匠用于教学，短期木材产出下降。',tradeoffs:{woodPenalty:.12,opposition:2}},
    {id:'roadcare',name:'分区维护道路',icon:'road',desc:'明确各地区的道路养护责任。',cost:{food:16,stone:15},requiredBuildings:['path'],spreadYears:6,constructionBonus:.12,admin:3,drawback:'养路工役占用农业与采石劳动。',tradeoffs:{foodPenalty:.04,stonePenalty:.08,opposition:3}},
    {id:'landregister',name:'登记土地权属',icon:'book',desc:'编制地籍与灌溉边界，协调耕地争议。',cost:{wood:30,food:20},requiredBuildings:['council'],requiredKnowledge:25,spreadYears:12,foodBonus:.08,admin:6,drawback:'土地持有者会反对登记与重新确认边界。',tradeoffs:{opposition:6,woodPenalty:.05}},
    {id:'standards',name:'统一度量衡',icon:'market',desc:'让各地区使用共同的实物计量。',cost:{wood:25,stone:15},requiredBuildings:['market'],requiredKnowledge:25,spreadYears:10,woodBonus:.06,stoneBonus:.06,admin:3,drawback:'商人需更换量具并适应规则，产生短期抵制。',tradeoffs:{opposition:5,foodPenalty:.03}},
    {id:'relief',name:'开仓救济',icon:'grain',desc:'从公共储备持续援助贫困家庭。',cost:{food:40},requiredBuildings:['granary','council'],spreadYears:7,stabilityBonus:5,migration:.3,drawback:'救济需要长期粮食投入，减少可用于建设的劳力。',tradeoffs:{foodUpkeep:4,woodPenalty:.05,opposition:2}},
    {id:'marketinspection',name:'检查市场交易',icon:'market',desc:'调查欺诈并维持公开交易规则。',cost:{food:20,wood:15},requiredBuildings:['market','council'],requiredKnowledge:40,spreadYears:9,stabilityBonus:3,admin:4,drawback:'检查增加商户手续，并占用公共行政资源。',tradeoffs:{woodPenalty:.06,opposition:4}},
    {id:'caravans',name:'护送跨境商队',icon:'people',desc:'安排沿途护送，支持长期物资交换。',cost:{food:30,wood:20},requiredBuildings:['inn'],requiredKnowledge:55,requiresContact:true,spreadYears:10,woodBonus:.08,stoneBonus:.08,drawback:'护送人员需要口粮，也减少国内生产劳力。',tradeoffs:{foodUpkeep:3,foodPenalty:.04,opposition:3}},
    {id:'credit',name:'设立公共工程信贷',icon:'bank',desc:'通过银行支付与担保支持公共工程。',cost:{treasury:90},requiredBuildings:['bank'],requiredKnowledge:130,spreadYears:14,constructionBonus:.22,drawback:'担保和结算需要持续财政支出，原有资金使用者会反对。',tradeoffs:{upkeep:5,opposition:7}},
    {id:'coinage',name:'统一铸币成色',icon:'mint',desc:'监督铸币重量与金属标准。',cost:{treasury:35},requiredBuildings:['mint'],requiredKnowledge:90,spreadYears:10,treasuryRate:3,admin:3,drawback:'检验和重铸有持续费用，原有铸币利益者会抵制。',tradeoffs:{upkeep:1.2,opposition:5}},
    {id:'publicaccounts',name:'公布公共账目',icon:'book',desc:'让地区核对税收和公共工程开支。',cost:{treasury:35},requiredBuildings:['taxoffice'],requiredKnowledge:140,spreadYears:13,stabilityBonus:5,admin:5,drawback:'账目核验增加财政开支，并触动既有利益。',tradeoffs:{upkeep:2.5,opposition:7}},
    {id:'workhours',name:'限制工场工时',icon:'people',desc:'为工业劳动制定休息与工时规则。',cost:{treasury:75},requiredIndustry:true,requiredBuildings:['factory'],requiredKnowledge:200,spreadYears:16,stabilityBonus:7,drawback:'较短工时压低短期产出，工场经营者会抵制。',tradeoffs:{woodPenalty:.1,stonePenalty:.1,upkeep:1.5,opposition:8}},
    {id:'sanitation',name:'安排城区卫生',icon:'health',desc:'组织清洁、排污维护与公共卫生巡查。',cost:{treasury:70},requiredIndustry:true,requiredBuildings:['sewer'],requiredKnowledge:230,spreadYears:14,stabilityBonus:6,migration:.4,drawback:'卫生服务需要稳定财政和维护人员。',tradeoffs:{upkeep:4,woodPenalty:.04,opposition:3}}
  );

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
  policyDefinitions.forEach(d => { if(drawbacks[d.id]){d.name=clauseNames[d.id];d.drawback = drawbacks[d.id][0]; d.tradeoffs = drawbacks[d.id][1];} });
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
    state.automation.tasks={housing:true,food:true,wood:false,stone:false,roads:false,storage:true,civic:true,production:true,commerce:true,defense:false,...state.automation.tasks};
    state.automation.recent ||= [];state.resourceAlerts ||= {};
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
    state.simulation ||= {pending:0,accumulators:{},runs:{}};
    state.simulation.accumulators ||= {};state.simulation.runs ||= {};
    root.CivilMinerals?.initialize(state);
    root.CivilEconomy?.initialize(state);
    root.CivilLogistics?.initialize(state);
    root.CivilSociety?.initialize(state);
    root.CivilWarfare?.initialize(state);
    root.CivilTerritory?.initialize(state);
    root.CivilPolitics?.initialize(state);
    root.CivilNations?.initialize(state);
    updateEra(state);
    return state;
  }
  function hasCurrency(state) { return !!state.currency?.adopted; }
  function largestCityPopulation(state) { return Math.max(0,...(state.settlements||[]).map(s=>Math.max(0,s.population||0))); }
  function isIndustrialized(state) { return !!state.industrialized||(largestCityPopulation(state)>=10000&&!!count(state,'factory')); }
  function updateEra(state) {
    state.era=isIndustrialized(state)?'industrial':state.startEra==='medieval'||largestCityPopulation(state)>=600&&state.knowledge>=60?'medieval':'village';
    // Era renewal changes existing housing materials, preserving capacity and identity.
    // A former hut never becomes a free four-hundred-person residential block.
    if(state.era==='industrial')for(const b of state.buildings){
      if(b.status==='complete'&&b.type==='hut'){b.originalType='hut';b.housingOverride=7*(b.size||1);b.type='brickhouse';b.renewedAt=state.elapsed;}
    }
  }
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
  const terrain = (state,x,y) => root.CivilTerrain.sample(x,y,state.seed,state.geographyVersion||1);
  function visiblePolicies(state) { return policyDefinitions.filter(d=>available(state,d).ok); }
  function scopeSettlements(state, proposal) { return proposal.regions.includes('all')?state.settlements:state.settlements.filter(s=>proposal.regions.includes(s.id)); }
  function activeProposal(state,p) { if(!p.active)return false;const ratio=state.resources.food/Math.max(1,state.population);return p.condition==='shortage'?ratio<.6:p.condition==='surplus'?ratio>2:true; }
  function proposalOptions(state) { return {clauses:visiblePolicies(state),targets:policyTargets.filter(d=>available(state,d).ok),executors:policyExecutors.filter(d=>available(state,d).ok&&(!d.requiresBuilding||count(state,d.requiresBuilding))),conditions:policyConditions.filter(d=>available(state,d).ok)}; }
  const policyChanges={forage:.6,forestry:.8,reserve:1.2,migration:1,works:1.5,learning:.8,trade:2,education:5,irrigation:3,industry:6,welfare:6,automation:9,rationing:1.4,seedreserve:1,firewatch:.7,watercare:.6,apprentice:1.5,roadcare:1.2,landregister:3,standards:2,relief:2.5,marketinspection:2,caravans:2,credit:4,coinage:2.5,publicaccounts:4,workhours:5,sanitation:3.5};
  function policyBenefit(d) { return (d.foodBonus||0)*12+(d.woodBonus||0)*10+(d.stoneBonus||0)*10+(d.constructionBonus||0)*10+(d.knowledgeRate||0)*.8+(d.treasuryRate||0)*.6+(d.migration||0)*2+(d.stabilityBonus||0)*.25+(d.admin||0)*.3+(d.defense||0)*.2; }
  function policyResistance(state,selected,scope,executor,changeScale=1) {
    const change=selected.reduce((sum,d)=>sum+(policyChanges[d.id]||1),0)*changeScale;
    const benefit=selected.reduce((sum,d)=>sum+policyBenefit(d),0)*changeScale;
    const share=scope.reduce((sum,s)=>sum+s.population,0)/Math.max(1,state.population);
    const faction=root.CivilSociety?.cultureSummary(state);
    const resistance=clamp((selected.reduce((sum,d)=>sum+(d.tradeoffs.opposition||1),0)*changeScale+change*3+benefit*1.2+(faction?Math.max(0,60-faction.nobleSupport)*faction.nobleInfluence/500+Math.max(0,50-faction.clergySupport)*faction.clergyInfluence/650:0))*executor.resistance*(.55+share*.45)*(1+Math.log2(Math.max(1,scope.length))*.12),0,85);
    const spread=Math.max(...selected.map(d=>d.spreadYears||4));
    return {change,benefit,resistance,implementationYears:spread*(1+resistance/80)/executor.efficiency};
  }
  function draftPolicy(state,input) {
    initialize(state);
    const options=proposalOptions(state),clauses=[...new Set(input.clauses||[])],regions=[...new Set(input.regions||[])];
    if(!clauses.length||clauses.length>MAX_POLICY_CLAUSES||clauses.some(id=>!options.clauses.some(d=>d.id===id)))return {ok:false,message:`请选择当前可用的条款（最多${MAX_POLICY_CLAUSES}项）。`};
    if(!regions.length||regions.some(id=>id!=='all'&&!state.settlements.some(s=>s.id===id)))return {ok:false,message:'请选择实施地区。'};
    const executor=options.executors.find(e=>e.id===input.executor);
    if(!executor||!options.targets.some(t=>t.id===input.target)||!options.conditions.some(c=>c.id===input.condition))return {ok:false,message:'当前无法执行这些安排。'};
    const old=state.proposals.find(p=>p.id===input.id);
    if(input.id&&!old)return {ok:false,message:'这项议案已不存在。'};
    const selected=clauses.map(id=>options.clauses.find(d=>d.id===id));
    const sameList=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
    const duration=[5,15,30].includes(+input.duration)?+input.duration:0;
    const same=old&&sameList(old.clauses,clauses)&&sameList(old.regions,regions)&&old.target===input.target&&old.executor===input.executor&&old.condition===input.condition&&old.duration===duration;
    const scope=regions.includes('all')?state.settlements:state.settlements.filter(s=>regions.includes(s.id));
    const changedClauses=old?clauses.filter(id=>!old.clauses.includes(id)).length+old.clauses.filter(id=>!clauses.includes(id)).length:clauses.length;
    const arrangementChange=old?Number(!sameList(old.regions,regions))+Number(old.target!==input.target)+Number(old.executor!==input.executor)+Number(old.condition!==input.condition)+Number(old.duration!==duration):0;
    const scale=same?0:old?clamp((changedClauses+arrangementChange*.5)/Math.max(1,clauses.length),.15,1):1;
    const regionFactor=Math.max(1,scope.length*.8),people=scope.reduce((sum,s)=>sum+s.population,0),complexity=1+(clauses.length-1)*.15;
    const organizationCost=same?{}:hasCurrency(state)
      ?{treasury:Math.ceil(Math.max(4,people*.004)*complexity*scale)}
      :{food:Math.ceil(Math.max(3,people*.01)*complexity*scale),wood:Math.ceil(regionFactor*complexity*scale)};
    const clauseCost={},executorCost=same?{}:Object.fromEntries(Object.entries(executor.cost).map(([k,v])=>[k,Math.ceil(v*regionFactor)]));
    selected.filter(d=>!old?.clauses.includes(d.id)).forEach(d=>Object.entries(d.cost||{}).forEach(([k,v])=>clauseCost[k]=(clauseCost[k]||0)+v));
    Object.keys(clauseCost).forEach(k=>clauseCost[k]=Math.ceil(clauseCost[k]*regionFactor));
    const cost={};for(const component of [organizationCost,clauseCost,executorCost])for(const[k,v]of Object.entries(component))cost[k]=(cost[k]||0)+v;
    const affected=[...selected,...(old?.clauses||[]).filter(id=>!clauses.includes(id)).map(id=>policyDefinitions.find(d=>d.id===id)).filter(Boolean)];
    const impact=policyResistance(state,affected,scope,executor,scale);
    const preview={ok:enough(state,cost),cost,organizationCost,clauseCost,executorCost,costKind:same?'unchanged':old?'revision':'initiation',...impact,drawbacks:selected.map(d=>d.drawback)};
    if(!preview.ok)preview.message='公共资源不足。';
    if(input.preview)return preview;
    if(!preview.ok)return preview;
    if(input.name!=null&&!String(input.name).trim())return {ok:false,message:'请为议案命名。'};
    if(same){old.name=String(input.name||old.name).trim().slice(0,30);return {ok:true,message:'议案名称已更新',proposalId:old.id};}
    pay(state,cost);
    const retained=old?old.clauses.filter(id=>clauses.includes(id)).length/clauses.length:0;
    const fullImpact=policyResistance(state,selected,scope,executor);
    const proposal={id:old?.id||`proposal-${++state.proposalSerial}`,name:String(input.name||selected.map(d=>d.name).join(' · ')).trim().slice(0,30),clauses,regions,target:input.target,executor:executor.id,condition:input.condition,duration,started:state.elapsed,active:true,feedbackMilestones:[],expiryReported:false,coverage:(old?.coverage||0)*Math.min(1,retained),resistance:fullImpact.resistance,change:fullImpact.change,benefit:fullImpact.benefit,implementationYears:fullImpact.implementationYears};
    if(!proposal.name)return {ok:false,message:'请为议案命名。'};
    proposal.localCoverage=Object.fromEntries(scope.map(s=>[s.id,(old?.localCoverage?.[s.id]||0)*Math.min(1,retained)]));
    const previousSpending=old?.spending;
    proposal.spending={last:{time:state.elapsed,kind:preview.costKind,cost:{...cost}},total:{...(previousSpending?.total||{})}};
    for(const[k,v]of Object.entries(cost))proposal.spending.total[k]=(proposal.spending.total[k]||0)+v;
    if(old)Object.assign(old,proposal);else state.proposals.push(proposal);
    state.stability=clamp(state.stability-impact.resistance*.18,0,100);
    event(state,'milestone',`${proposal.name}获通过`,`${scope.map(s=>s.name).join('、')} · ${options.targets.find(t=>t.id===proposal.target).name} · ${executor.name}`,{proposalId:proposal.id,policyCost:{...cost},dedupe:`proposal:${proposal.id}:${state.elapsed}`});
    return {ok:true,message:'议案已通过',proposalId:proposal.id,cost:{...cost}};
  }
  function setProposalActive(state,id,active) { const p=state.proposals.find(p=>p.id===id);if(!p)return {ok:false,message:'未找到议案。'};p.active=!!active;return {ok:true}; }
  function proposalCoverage(state,id) {
    let total=policyCoverage(state,id);
    state.proposals.forEach(p=>{if(p.clauses.includes(id)&&activeProposal(state,p)){const share=scopeSettlements(state,p).reduce((n,s)=>n+s.population*(p.localCoverage?.[s.id]??p.coverage)/100*(root.CivilPolitics?.compliance(state,s.id,p.executor)??1),0)/Math.max(1,state.population);const target=p.target==='workers'?.54:p.target==='families'?.85:1;total+=share*target;}});
    return clamp(total,0,1);
  }
  function automationLevel(state) { return count(state,'research')&&isIndustrialized(state)?3:count(state,'workshop')&&state.population>=90&&state.knowledge>=12?2:count(state,'council')?1:0; }
  function setAutomation(state,task,value) {
    initialize(state);const level=automationLevel(state);
    if(!level)return {ok:false,message:'议事屋建成后可委托建设。'};
    if(task==='enabled')state.automation.enabled=!!value;
    else if(Object.hasOwn(state.automation.tasks,task)&&(level>=2||['housing','food','storage'].includes(task)))state.automation.tasks[task]=!!value;
    else return {ok:false,message:'当前不能委托这项建设。'};
    return {ok:true};
  }
  function regionalHousing(state,includeBuilding=false) {
    const result=Object.fromEntries(state.settlements.map(s=>[s.id,0]));
    for(const b of state.buildings){
      if(b.status!=='complete'&&!(includeBuilding&&b.status==='building'))continue;
      const d=getDefinition(b.type),home=state.settlements.find(s=>s.id===b.settlementId)||nearestSettlement(state,b.x,b.y);
      if(home)result[home.id]+=b.housingOverride??(d?.housing||0)*(b.size||1);
    }
    return result;
  }
  // Plans cover local needs and prerequisite chains; queued projects count
  // toward capacity so several inspectors cannot commission the same work.
  function automationPlan(state) {
    const level=automationLevel(state);if(!level)return [];
    const tasks=state.automation.tasks,s=stats(state),housing=regionalHousing(state,true),plans=[];
    const localBuildings=home=>state.buildings.filter(b=>b.status!=='failed'&&(b.settlementId===home.id||(!b.settlementId&&nearestSettlement(state,b.x,b.y)?.id===home.id)));
    for(const home of state.settlements){
      const local=localBuildings(home),has=type=>local.some(b=>b.type===type),queued=type=>local.some(b=>b.type===type&&b.status==='building');
      const offer=(types,reason,score,zone)=>{
        let type=types.find(t=>available(state,getDefinition(t)).ok&&home.population>=(getDefinition(t).requiredCityPopulation||0));
        // If a suitable upgrade lacks only facilities, plan those first.
        if(!type)for(const t of types){const d=getDefinition(t);if(!d||home.population<(d.requiredCityPopulation||0)||state.knowledge<(d.requiredKnowledge||0)||state.population<(d.requiredPopulation||0)||d.requiredIndustry&&!isIndustrialized(state)||d.cost?.treasury&&!hasCurrency(state))continue;
          const missing=(d.requiredBuildings||[]).find(id=>!count(state,id));
          if(missing&&available(state,getDefinition(missing)).ok){type=missing;reason='配套先行 · '+reason;zone='production';break;}}
        if(!type||queued(type))return;
        plans.push({type,settlementId:home.id,city:home.name,reason,score,zone});
      };
      if(tasks.housing&&housing[home.id]<home.population*1.18)offer(['brickhouse','apartment','townhouse','hut'],'预留居住空间',housing[home.id]<home.population*1.02?120:75,'housing');
      const localFood=local.reduce((n,b)=>n+(getDefinition(b.type)?.foodRate||0)*(b.size||1),0);
      if(tasks.food&&(s.foodRate<state.population*.05||localFood<home.population*.27))offer(['estate','farm'],'补足地区粮食',s.foodRate<0?130:80,'fields');
      if(tasks.storage){const capacity=root.CivilLogistics?.capacity(state,'food')||600;
        if((!has('granary')&&home.population>80)||s.food>capacity*.83)offer(['granary'],'储粮配套',60,'storage');
        if(level>=2&&(!has('warehouse')&&home.population>=180))offer(['warehouse','storehouse'],'地区物资枢纽',58,'storage');}
      if(level<2)continue;
      if(tasks.wood&&s.wood<Math.max(130,state.population*.025))offer(['lumber'],'林区材料供应',s.wood<40?110:70,'forest');
      if(tasks.stone&&s.stone<Math.max(110,state.population*.02))offer(['quarry'],'工程石材供应',s.stone<35?110:69,'production');
      if(tasks.roads&&local.filter(b=>['road','path'].includes(b.type)).length<Math.max(2,Math.ceil(local.length/40)))offer(['road','path'],'连接居住与生产区',47,'road');
      if(tasks.civic){
        for(const [type,threshold,reason,score] of [['well',50,'供水配套',64],['workshop',90,'地方工艺',57],['school',120,'知识积累',53],['clinic',300,'公共卫生',50],['library',600,'地区知识中心',43],['publicschool',1000,'公共教育网络',42],['research',10000,'研究与自动化',35]])if(home.population>=threshold&&!has(type))offer([type],reason,score,'civic');
      }
      if(tasks.commerce){for(const [type,threshold,reason,score] of [['market',100,'地区交换节点',56],['bank',1000,'城市信贷配套',40],['taxoffice',1500,'税务征管配套',39]])if(home.population>=threshold&&!has(type))offer([type],reason,score,'civic');}
      if(tasks.production){
        if(tasks.food&&localFood>80&&!has('windmill'))offer(['windmill'],'农田加工配套',63,'fields');
        for(const [type,threshold,reason,score] of [['forge',250,'金属加工配套',49],['ironmine',250,'工具原料供应',48],['toolworks',300,'工具生产链',46],['weaving',250,'居民布匹供应',45],['apothecary',500,'药材生产链',44],['factory',10000,'城市工业升级',41],['coalmine',10000,'工业燃料配套',40],['machineworks',10000,'机械生产配套',38]])if(home.population>=threshold&&!has(type))offer([type],reason,score,'production');
      }
      if(tasks.defense&&!local.some(b=>['wall','palisade'].includes(b.type)))offer(['wall','palisade'],'外围防御',state.warfare?.wars.length?100:36,'edge');
    }
    return plans.sort((a,b)=>b.score-a.score||state.settlements.findIndex(s=>s.id===a.settlementId)-state.settlements.findIndex(s=>s.id===b.settlementId)).filter((p,i,all)=>all.findIndex(q=>q.type===p.type&&q.settlementId===p.settlementId)===i);
  }
  function autoBuild(state) {
    const a=state.automation,level=automationLevel(state);
    if(!a.enabled||!level||state.elapsed-a.lastCheck<3)return;
    a.lastCheck=state.elapsed;
    if(state.buildings.filter(b=>b.status==='building').length>=level)return;
    const plans=automationPlan(state);a.plan=plans.slice(0,5);a.status=plans.length?'等待材料或空地':'地区配套充足';
    for(const plan of plans){
      const home=state.settlements.find(s=>s.id===plan.settlementId),d=getDefinition(plan.type),cost=costsFor(d);
      if(!enough(state,cost)||state.resources.food-(cost.food||0)<Math.min(100,state.population*.25))continue;
      const bands={housing:[65,285],civic:[25,195],storage:[160,300],fields:[240,485],production:[230,455],forest:[240,500],road:[90,330],edge:[350,495]};
      const [lo,hi]=bands[plan.zone]||[90,420],spots=[];
      for(let i=0;i<150;i++){
        const angle=i*2.399963+state.automation.projects*.7,r=lo+(i*37%(hi-lo)),x=home.x+Math.cos(angle)*r,y=home.y+Math.sin(angle)*r,t=terrain(state,x,y);
        if(x<24||x>WORLD_SIZE-24||y<24||y>WORLD_SIZE-24||t.water||nearestSettlement(state,x,y)?.id!==home.id)continue;
        const mineral=root.CivilMinerals?.mapping[plan.type];if(mineral&&!root.CivilMinerals.site(state,mineral,x,y))continue;
        if(plan.zone==='forest'&&forestRemaining(state,x,y)<24)continue;
        const fertility=t.fertility||0;spots.push({x,y,score:plan.zone==='fields'?-fertility:Math.abs(r-(lo+hi)/2)});
      }
      spots.sort((a,b)=>a.score-b.score);
      for(const p of spots){const result=build(state,plan.type,p.x,p.y,1);if(!result.ok)continue;
        const b=state.buildings.at(-1);b.automatic=true;b.planReason=plan.reason;b.planZone=plan.zone;
        a.projects++;a.status=home.name+' · '+d.name;a.recent.unshift({...plan,buildingId:b.id,time:state.year});a.recent.length=Math.min(a.recent.length,8);return;}
    }
  }
  const forestAreas=new Map();
  function nearbyTrees(state,x,y,r=155) { const key=`${state.seed}:${state.geographyVersion||1}:${x}:${y}:${r}`;if(!forestAreas.has(key)){if(forestAreas.size>1000)forestAreas.clear();forestAreas.set(key,root.CivilTerrain.trees(state.seed,state.geographyVersion||1).filter(t=>Math.hypot(t.x-x,t.y-y)<r));}return forestAreas.get(key); }
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
    if(!state.hostiles.length&&state.elapsed>=state.hostileAt){const home=state.settlements[0],x=home.x+260,y=home.y-180,name=generatedName(state,'clan');state.hostiles.push({id:'rival-1',name,x,y,pressure:24,lastRaid:state.elapsed,truceUntil:0,guardUntil:0});state.explored.push({x,y,radius:110});event(state,'milestone','河湾外的旗帜',`${name}在附近扎营，对水源与猎场提出领地要求。`,{hostileId:'rival-1',x,y});}
    state.hostiles.forEach(h=>{const safe=h.truceUntil>state.elapsed,guard=h.guardUntil>state.elapsed;h.pressure=clamp(h.pressure+(safe?-3:guard?.25:1.6)*dt,0,100);if(h.pressure>=55&&state.elapsed-h.lastRaid>=12){h.lastRaid=state.elapsed;h.pressure-=20;const protection=1-defenseAt(state,h.x,h.y)/100,loss=Math.min(state.resources.food,(guard?6:18)*protection);state.resources.food-=loss;state.stability=clamp(state.stability-(guard?1:4)*protection,0,100);event(state,'failure',`${h.name}袭扰`, `损失 ${Math.floor(loss)} 粮食；公众信任下降。`,{hostileId:h.id,x:h.x,y:h.y,dedupe:`raid:${h.id}:${Math.floor(state.elapsed/12)}`});}});
  }
  function defenseAt(state,x,y) {
    const local=nearestSettlement(state,x,y);
    return clamp(state.buildings.filter(b=>b.status==='complete'&&Math.hypot(b.x-local.x,b.y-local.y)<=600).reduce((sum,b)=>sum+(getDefinition(b.type)?.defense||0)*(b.size||1),0)+policyDefinitions.reduce((sum,d)=>sum+(d.defense||0)*proposalCoverage(state,d.id),0),0,70);
  }

  function foreignSummary(state) { return root.CivilLogistics?.foreignSummary(state)||{routes:0,foodRate:0,woodRate:0,stoneRate:0,treasuryRate:0}; }
  function foreignAction(state,id,action) {
    initialize(state);
    const n=state.neighbors.find(n=>n.id===id);if(!n)return {ok:false,message:'尚未与这个国家接触。'};
    if(root.CivilWarfare?.isAtWar(state,id))return {ok:false,message:'交战期间请通过战争谈判恢复关系。'};
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
  function foreignTick(state,dt,deferDevelopment=false) {
    root.CivilLogistics?.foreignTick(state,dt,{development:!deferDevelopment});
    root.CivilTerritory?.tick(state);
    for(const n of state.neighbors){
      if(root.CivilWarfare?.isAtWar(state,n.id)){n.tradeLast={imported:0,exported:0,tariff:0};continue;}
      const pact=n.pactUntil>state.elapsed,guard=n.guardUntil>state.elapsed;
      n.tension=clamp(n.tension+(pact?-.8:n.embargo?1.8:n.tradeOpen?-.35:.55)*dt,0,100);
      n.relation=clamp(n.relation+(n.embargo?-.6:n.tradeOpen?.35:0)*dt,0,100);
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

  function eventPriority(item) {
    if(item.priority)return item.priority;
    const d=item.data||{};
    return d.priority||(d.war?'minor':((item.kind==='failure'||d.resourceAlert||d.currency||d.industrialized||/^war:|^peace:|^society:faith:|^society:noble-charter:/.test(d.dedupe||'')||d.reform&&/完成/.test(item.title))?'major':'minor'));
  }
  function resourceWarnings(state) {
    const s=stats(state),last=state.storage?.last||{},trade=foreignSummary(state),war=root.CivilWarfare?.summary(state)||{};
    const used={...last.used},recipeDemand={};
    // Demand remains visible after stock hits zero, when actual paid use is zero.
    for(const b of state.buildings){if(b.status==='complete')for(const [key,v] of Object.entries(getDefinition(b.type)?.input||{}))recipeDemand[key]=(recipeDemand[key]||0)+v*(b.size||1);}
    const supplyDemand={tools:state.population*.0003,cloth:state.population*.0006,medicine:state.population*.00008,coal:count(state,'factory')*2+count(state,'steamplant')*4};
    for(const k of new Set([...Object.keys(recipeDemand),...Object.keys(supplyDemand)]))used[k]=Math.max(used[k]||0,(recipeDemand[k]||0)+(supplyDemand[k]||0));
    const warnings=[];
    const lines=[...(root.CivilLogistics?.resources||[]),...(hasCurrency(state)?[{id:'treasury',name:'国库'}]:[])];
    for(const r of lines){
      const key=r.id,stock=state.resources[key]||0,consumption=used[key]||0;
      const core={food:s.foodRate,wood:s.woodRate,stone:s.stoneRate,treasury:s.treasuryRate};
      const rate=(core[key]??((last.gross?.[key]||0)-consumption+(trade[key+'Rate']||0)))-(key==='food'?consumption: key==='wood'?consumption:0);
      const alert=state.resourceAlerts[key] ||= {active:false,everStocked:stock>0,last:-1e6};
      if(stock>0)alert.everStocked=true;
      // Unused/unintroduced materials never generate a zero-stock warning.
      const demand=consumption+(key==='food'?s.foodConsumption:0)+(key==='wood'?(war.woodCost||0):0)+(key==='treasury'?(war.treasuryCost||0):0);
      const low=rate<-.001&&stock/(-rate)<=3&&(stock>0||alert.everStocked||key==='food'||key==='treasury'||state.buildings.some(b=>b.status==='complete'&&getDefinition(b.type)?.input?.[key]));
      if(alert.active&&(rate>=0&&stock>Math.max(5,demand*2)||rate<0&&stock/(-rate)>6))alert.active=false;
      if(low&&!alert.active&&state.elapsed-alert.last>=8){alert.active=true;alert.last=state.elapsed;warnings.push({resource:key,name:r.name,stock,rate,years:stock/-rate});}
    }
    if(warnings.length)event(state,'news',warnings.length===1?warnings[0].name+'即将耗尽':'多项物资即将耗尽',warnings.map(w=>`${w.name}：余量 ${Math.floor(w.stock)}，净消耗 ${(-w.rate).toFixed(1)}/年${w.stock>0?(w.years<.1?'，不足 0.1 年后耗尽':'，约 '+w.years.toFixed(1)+' 年后耗尽'):'，供应已中断'}。`).join('\n'),{priority:'major',resourceAlert:true,resources:warnings,dedupe:'resources:'+warnings.map(w=>w.resource).join(',')});
  }

  function event(state, kind, title, body, data) {
    const key = data?.dedupe || `${kind}:${title}`;
    state.eventSeen ||= {};
    if (state.eventSeen[key] != null && state.elapsed - state.eventSeen[key] < (data?.resourceAlert?8:kind === 'failure' ? 2 : 18)) return null;
    state.eventSeen[key] = state.elapsed;
    const item = { id: `${state.id}-${++state.eventSerial}`, kind, title, body, time: state.year, data: data || {} };
    item.priority=eventPriority(item);state.events.push(item);
    state.history.unshift(item);
    if (state.history.length > 180) state.history.length = 180;
    while(state.events.length>16){const i=state.events.findIndex(e=>eventPriority(e)!=='major');if(i<0)break;state.events.splice(i,1);}
    return item;
  }

  function create(seed, name, mode = 'village') {
    const numberSeed = Math.abs(Math.floor(cleanNumber(seed, Date.now() % 999999))) % 2147483647;
    const safeName = String(name || '溪岸').trim().slice(0, 18) || '溪岸';
    const state = {
      version: VERSION,
      geographyVersion:2,
      id: `world-${numberSeed}-${Date.now().toString(36)}`,
      name: safeName,
      seed: numberSeed,
      rngState: numberSeed || 1,
      year: 0,
      elapsed: 0,
      population: 36,
      startMode: ['city','inherit'].includes(mode)?'city':'village',
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
    if(state.startMode==='city')event(state,'milestone','诸城与封地',`${state.settlements.map(s=>s.name).join('、')}共有 ${Math.round(state.population).toLocaleString('zh-CN')} 位居民。沿用既有货币、市政与税制；${state.neighbors.map(n=>n.name).join('与')}已同你接壤。`,{population:state.population});
    else event(state, 'milestone', '从一缕炊烟开始', `36 位村民在河畔停下脚步。七座茅草屋和一处火塘，是${safeName}的全部。先尝试建设一片农田，或为村落选择一项公共规则。`, { population: 36, food: 120, wood: 100, housing: 49 });
    recordStats(state);
    return state;
  }

  function createCity(state) {
    const roll=(i,salt=0)=>root.CivilTerrain.hash(i,salt,state.seed+5081);
    const cityCount=2+Math.floor(roll(1)*4),nationCount=2+Math.floor(roll(2)*4);
    state.startEra='medieval';state.era='medieval';state.stage='中世纪诸城';state.cityFounded=true;state.hostileAt=999999;
    state.knowledge=125+Math.floor(roll(3)*26);state.productivity=28+roll(4)*9;state.admin=30+roll(5)*12;
    state.institutions={governance:'administration',property:roll(6)>.5?'household':'mixed',allocation:'mixed',labor:'publicworks'};
    state.currency={adopted:true,introducedAt:0,inherited:true};
    state.taxation={rates:{poll:.04,land:.04,domestic:.02,customs:0,vat:0},exemptNobles:true,exemptClergy:true,last:{}};
    state.minerals={version:1,used:{},surveyed:{},surveys:[],serial:0,legacy:{},sites:{}};
    state.budget.taxRate=.04;state.buildings=[];state.explored=[];state.settlements=[];state.neighbors=[];
    state.inheritance={version:1,layout:roll(7)>.5?'分散诸城':'环形封地'};
    // Seeded candidate search keeps every occupied center on land and away
    // from existing settlements, even when the preferred layout meets a river.
    const find=(salt,accept,score)=>{
      let best=null,bestScore=Infinity;
      for(let i=0;i<1600;i++){
        const x=400+roll(i,salt)*3296,y=400+roll(i,salt+1)*3296;
        if(!accept(x,y)||terrain(state,x,y).water)continue;
        const value=score(x,y);if(value<bestScore){best={x,y};bestScore=value;}
      }
      if(!best)throw Error('无法为当前种子生成足够的城市位置。');
      return best;
    };
    const rotation=roll(8)*Math.PI*2;
    for(let i=0;i<cityCount;i++){
      const angle=rotation+i*2.399963,r=i?(state.inheritance.layout==='分散诸城'?850+roll(i,92)*500:650+roll(i,92)*400):100;
      const cx=2048+Math.cos(angle)*r,cy=2048+Math.sin(angle)*r;
      const point=find(20+i*11,(x,y)=>state.settlements.every(s=>Math.hypot(s.x-x,s.y-y)>790),(x,y)=>Math.hypot(x-cx,y-cy));
      state.settlements.push({id:i===0?'home':`inherited-city-${i}`,name:i===0?state.name:generatedName(state,'town',i),...point,population:2400+Math.floor(roll(i,101)*3300),level:3});
    }
    state.population=state.settlements.reduce((n,s)=>n+s.population,0);
    state.resources={food:Math.ceil(state.population*(2.1+roll(9)*.7)),wood:Math.ceil(state.population*.24),stone:Math.ceil(state.population*.21),treasury:Math.ceil(state.population*(.3+roll(10)*.2)),clay:100+cityCount*25,iron:70+cityCount*15,coal:0,tools:50+cityCount*10,cloth:100+cityCount*25,medicine:20+cityCount*5};
    let serial=0;const occupied=new Map();
    const add=(home,type,index,minR,maxR)=>{
      const d=getDefinition(type),footprint=d?.footprint||12,phase=roll(index,type.length+home.x)*Math.PI*2;
      for(let i=0;i<2400;i++){
        const angle=(i+index*17)*2.399963+phase,r=minR+(i*17%Math.max(1,maxR-minR)),x=home.x+Math.cos(angle)*r,y=home.y+Math.sin(angle)*r;
        if(x<60||x>4036||y<60||y>4036)continue;
        const gx=Math.floor(x/128),gy=Math.floor(y/128);let blocked=false;
        for(let yy=gy-1;yy<=gy+1&&!blocked;yy++)for(let xx=gx-1;xx<=gx+1;xx++)if(occupied.get(`${xx}:${yy}`)?.some(b=>Math.hypot(x-b.x,y-b.y)<(footprint+b.footprint)*.48)){blocked=true;break;}
        if(blocked)continue;const tile=terrain(state,x,y);if(tile.water||d?.location==='river'&&tile.river>140)continue;
        const mineral=root.CivilMinerals?.mapping[type];if(mineral&&!root.CivilMinerals.site(state,mineral,x,y))continue;
        const b={id:`city-${++serial}`,type,x,y,size:1,status:'complete',progress:100,settlementId:home.id,started:0};state.buildings.push(b);
        const key=`${gx}:${gy}`;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push({x,y,footprint});return b;
      }
      return null;
    };
    for(const [index,home] of state.settlements.entries()){
      state.explored.push({x:home.x,y:home.y,radius:535});
      const common=['council','market','granary','workshop','school','well','library','manor','warehouse','windmill','clinic','forge'];
      const specialty=[['temple','guildhall','bank'],['shrine','inn','weaving'],['plaza','toolworks','ironmine'],['temple','fair','claypit']][Math.floor(roll(index,144)*4)];
      [...common,...specialty].forEach((type,i)=>add(home,type,i,22,185));
      const houses=Math.ceil(home.population*(1.08+roll(index,148)*.07)/70);
      for(let i=0;i<houses;i++)add(home,'townhouse',i,85,275);
      const estates=Math.ceil(home.population*.37/220);
      for(let i=0;i<estates;i++)add(home,'estate',i,285,415);
      ['canal','quarry','lumber','lumber','wall','aqueduct','watermill'].forEach((type,i)=>add(home,type,i,280,420));
      for(let i=0;i<3+Math.floor(roll(index,149)*4);i++)add(home,'road',i,80,290);
      add(home,'path',0,210,320);
    }
    add(state.settlements[0],'academy',0,30,210);add(state.settlements[0],'castle',0,280,420);add(state.settlements[0],'inn',0,30,210);
    // Supplement rather than inventing housing/food if an awkward shoreline
    // prevented a planned historic building from being placed.
    for(const home of state.settlements){
      const local=()=>state.buildings.filter(b=>b.settlementId===home.id);
      for(let i=0;i<100&&local().reduce((n,b)=>n+(getDefinition(b.type)?.housing||0),0)<home.population*1.08;i++)add(home,'townhouse',i+90,60,430);
      for(let i=0;i<20&&local().reduce((n,b)=>n+(getDefinition(b.type)?.foodRate||0),0)<home.population*.36;i++)add(home,'estate',i+90,230,465);
    }
    const allForeign=[];
    const colors=['#8cab78','#c49a75','#9aafbc','#bca47e','#a697b5'];
    for(let i=0;i<nationCount;i++){
      const preferred=rotation+roll(i,160)*Math.PI*2;
      const cap=find(200+i*17,(x,y)=>state.settlements.every(s=>Math.hypot(s.x-x,s.y-y)>760)&&allForeign.every(s=>Math.hypot(s.x-x,s.y-y)>510),(x,y)=>Math.hypot(x-(2048+Math.cos(preferred)*1500),y-(2048+Math.sin(preferred)*1500)));
      const name=generatedName(state,'nation',i),total=6000+Math.floor(roll(i,170)*14000),towns=1+Math.floor(roll(i,171)*3);
      const n={id:i===0?'green-country':i===1?'stone-country':`neighbor-${i}`,name,color:colors[i],...cap,radius:210+roll(i,172)*45,population:total,relation:i===0?56:40+roll(i,173)*20,tension:15+roll(i,174)*20,exportResource:i%2?'stone':'food',importResource:'wood',exportRate:i%2?24+roll(i,175)*12:100+roll(i,175)*60,importRate:20+roll(i,176)*12,tradeOpen:false,embargo:false,pactUntil:0,guardUntil:0,lastIncident:0,tradeLast:{imported:0,exported:0,tariff:0},cities:[]};
      n.cities.push({id:n.id+'-capital',name:n.name,...cap,population:0,radius:n.radius,share:1});allForeign.push(cap);
      for(let j=1;j<towns;j++){
        const point=find(400+i*41+j*4,(x,y)=>state.settlements.every(s=>Math.hypot(s.x-x,s.y-y)>690)&&allForeign.every(s=>Math.hypot(s.x-x,s.y-y)>360),(x,y)=>Math.hypot(x-cap.x,y-cap.y));
        n.cities.push({id:n.id+'-town-'+j,name:generatedName(state,'town',i*3+j,n.cities.map(c=>c.name)),...point,population:0,radius:145,share:.5+roll(j,i+180)});allForeign.push(point);
      }
      const shares=n.cities.reduce((v,c)=>v+c.share,0);for(const c of n.cities){c.share/=shares;c.population=total*c.share;state.explored.push({x:c.x,y:c.y,radius:c.radius+100});}
      state.neighbors.push(n);
    }
    // Major public arrangements are inherited at full coverage, not imposed
    // as new reforms with an artificial starting stability penalty.
    state.proposals=[{id:'inherited-public-order',name:'既有市政章程',clauses:['firewatch','roadcare','standards'],regions:['all'],target:'all',executor:'council',condition:'always',duration:0,started:0,active:true,coverage:100,resistance:0,localCoverage:Object.fromEntries(state.settlements.map(s=>[s.id,100])),feedbackMilestones:[50,100],inherited:true}];
    state.completedProjects=state.buildings.length;state.buildingSerial=state.buildings.length;
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
      const region=building.settlementId||nearestSettlement(state,building.x,building.y)?.id,work=size*(root.CivilPolitics?.labor(state,region)??1);
      output.housing += building.housingOverride??(definition.housing || 0) * size;
      output.food += (definition.foodRate || 0) * work * (['farm','estate'].includes(building.type)?terrain(state,building.x,building.y).foodFactor||1:1);
      output.wood += (definition.woodRate || 0) * work * (building.type === 'lumber' ? clamp(forestRemaining(state,building.x,building.y)/24,0,1) : 1);
      output.stone += (definition.stoneRate || 0) * work * (building.type==='quarry'?(root.CivilMinerals?.factor(state,building)??1):1);
      output.treasury += (definition.treasuryRate || 0) * work*(root.CivilPolitics?.compliance(state,region)??1);
      output.knowledge += (definition.knowledgeRate || 0) * work;
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
      output.defense += (policy.defense||0)*coverage;
      output.admin += (policy.admin||0)*coverage;
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
    const culture=root.CivilSociety?.cultureSummary(state);
    if(culture){output.knowledge+=culture.knowledgeBonus||0;output.stability+=culture.stabilityBonus||0;}
    const tax=root.CivilSociety?.taxQuote(state);
    if(tax){output.foodBonus-=tax.foodPenalty;output.woodBonus-=tax.woodPenalty;output.stoneBonus-=tax.stonePenalty;output.stability-=tax.stabilityPenalty;}
    output.stability-=(state.warfare?.weariness||0)*.22;
    output.defense=clamp(output.defense,0,70);
    if(!hasCurrency(state))output.treasury=0;
    return output;
  }

  function stats(state) {
    const effect = effects(state);
    const working = Math.max(0, state.population * 0.54-(state.warfare?.soldiers||0));
    const buildingLabor = state.buildings.filter(item => item.status === 'building').length * 2;
    const facilityLabor=state.buildings.filter(b=>b.status==='complete'&&!['hut','fire','path'].includes(b.type)).reduce((n,b)=>n+2*b.size,12);
    const civilianLabor=Math.max(0,state.population*.54);
    const utilization = (hasCurrency(state)?(state.economy?.activity??1):1)*clamp((working - buildingLabor) / Math.max(facilityLabor, civilianLabor), 0, 1);
    const labor=clamp(state.population/36,0,1);
    const toolFactor=1+clamp((state.resources.tools||0)/Math.max(10,state.population*.1),0,1)*.05+(isIndustrialized(state)?clamp((state.resources.coal||0)/Math.max(10,count(state,'factory')*20+count(state,'steamplant')*40),0,1)*.05:0);
    const workFactor=root.CivilPolitics?.average(state,root.CivilPolitics.labor)??1;
    const foodProduction = (15*labor*workFactor + effect.food + state.population * 0.065*workFactor) * (1 + effect.foodBonus) * utilization * toolFactor;
    const woodProduction = (4.4*labor*workFactor + effect.wood) * (1 + effect.woodBonus) * utilization * toolFactor;
    const stoneProduction = (0.9 + effect.stone) * (1 + effect.stoneBonus) * utilization * toolFactor;
    const foreign=foreignSummary(state);
    const policyFoodUpkeep=policyDefinitions.reduce((sum,d)=>sum+(d.tradeoffs.foodUpkeep||0)*proposalCoverage(state,d.id),0)*clamp(state.population/36,0,1);
    const domesticFoodRate=foodProduction-state.population*.3-policyFoodUpkeep;
    const domesticTreasuryRate=hasCurrency(state)?effect.treasury*utilization:0;
    const taxes=root.CivilSociety?.taxQuote(state)?.total||0,culture=root.CivilSociety?.cultureSummary(state),war=root.CivilWarfare?.summary(state);
    return {
      population: Math.max(0, Math.floor(state.population)),
      food: Math.max(0, state.resources.food), wood: Math.max(0, state.resources.wood), stone: Math.max(0, state.resources.stone), treasury: Math.max(0, state.resources.treasury),
      housing: Math.floor(effect.housing), stability: clamp(state.stability, 0, 100), knowledge: Math.max(0, state.knowledge), stage: state.stage,
      foodRate:domesticFoodRate+foreign.foodRate-(war?.foodCost||0)-(culture?.foodUpkeep||0),woodRate:woodProduction+foreign.woodRate-(war?.woodCost||0),stoneRate:stoneProduction+foreign.stoneRate,treasuryRate:domesticTreasuryRate+foreign.treasuryRate+taxes-(war?.treasuryCost||0)-(culture?.treasuryUpkeep||0)-(root.CivilEconomy?.enabled(state)?(state.economy.last.spending??state.population*.002)+(state.economy.last.interest||0):0),
      domesticFoodRate,domesticTreasuryRate,woodProduction,stoneProduction,foreign,
      foodProduction, foodConsumption: state.population * 0.3, policyFoodUpkeep,constructionBonus: effect.construction,
      productivity: state.productivity + effect.productivity, admin: state.admin + effect.admin,
      knowledgeRate: (0.1 + effect.knowledge + count(state, 'workshop') * 0.12) * effect.knowledgeMultiplier * clamp(working/12,0,1),
      migrationRate: effect.migration,
      buildings: state.buildings.filter(item => item.status === 'complete' && item.type !== 'fire').length,
      projects: state.buildings.filter(item => item.status === 'building').length,
      settlements: state.settlements.length,
      policyCoverage: state.proposals.filter(p=>p.active).reduce((sum,p)=>sum+p.coverage,0)/Math.max(1,state.proposals.filter(p=>p.active).length),
      automationLevel:automationLevel(state),deforested:state.forest.cut,defense:effect.defense,largestCityPopulation:largestCityPopulation(state),industrialized:isIndustrialized(state),taxRevenue:taxes,era:state.era
    };
  }

  function costsFor(definition, size = 1) {
    const result = {};
    Object.entries(definition.cost || {}).forEach(([key, value]) => { result[key] = Math.ceil(value * size); });
    return result;
  }

  function constructionCosts(state,definition,size=1,x,y){
    const costs=costsFor(definition,size),terrainFactor=Number.isFinite(x)&&Number.isFinite(y)?terrain(state,x,y).buildCost||1:1;
    for(const key of Object.keys(costs))costs[key]=Math.ceil(costs[key]*terrainFactor*(key==='treasury'&&hasCurrency(state)?state.economy?.priceIndex||1:1));
    return costs;
  }
  function enough(state, costs) { return allResources.every(key => (state.resources[key] || 0) >= (costs[key] || 0)); }
  function pay(state, costs) { allResources.forEach(key => { state.resources[key] = Math.max(0, (state.resources[key] || 0) - (costs[key] || 0)); }); }

  function available(state, definition) {
    if (!definition) return { ok: false, message: '尚未认识这种方案。' };
    if(definition.requiresContact&&!state.neighbors?.length)return {ok:false,message:'尚未具备相应联系。'};
    if(!hasCurrency(state)&&(definition.requiresCurrency||definition.cost?.treasury||definition.tradeoffs?.upkeep))return {ok:false,message:'当前无法实行这项安排。'};
    if(definition.requiredIndustry&&!isIndustrialized(state))return {ok:false,message:'当前发展阶段尚不能实施。'};
    if(largestCityPopulation(state)<(definition.requiredCityPopulation||0))return {ok:false,message:'尚未具备相应城市规模。'};
    if((definition.requiredBuildings||[]).some(id=>!count(state,id)))return {ok:false,message:'尚未具备相应设施。'};
    if (state.population < (definition.requiredPopulation || 0)) return { ok: false, message: `需要至少 ${definition.requiredPopulation} 位村民。` };
    if (state.knowledge < (definition.requiredKnowledge || 0)) return { ok: false, message: `需要积累 ${definition.requiredKnowledge} 点知识。` };
    return { ok: true, message: '' };
  }

  function foreignOwner(state,x,y) { return (state.neighbors||[]).find(n=>(n.cities?.length?n.cities:[n]).some(c=>Math.hypot(x-c.x,y-c.y)<(c.radius||n.radius))); }

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
    const mineral=root.CivilMinerals?.mapping[type];if(mineral){const deposit=root.CivilMinerals.site(state,mineral,px,py);if(!deposit||root.CivilMinerals.remaining(state,deposit)<=0)return {ok:false,message:'这里没有可开采的'+root.CivilMinerals.types.find(t=>t.id===mineral).name+'，请查看矿产地图。'};}
    if(definition.location==='river'&&terrain(state,px,py).river>140)return {ok:false,message:'这项设施需要靠近河流。'};
    const safeSize = clamp(Math.round(cleanNumber(size, 1)), 1, 3);
    const footprint = (definition.footprint || 20) * Math.sqrt(safeSize);
    const overlap = state.buildings.some(building => building.status !== 'failed' && Math.hypot(px - building.x, py - building.y) < (footprint + (getDefinition(building.type)?.footprint || 12)) * 0.42);
    if (overlap) return { ok: false, message: '这里已有建筑，请选择旁边的空地。' };
    const costs = constructionCosts(state,definition,safeSize,px,py);
    if (!enough(state, costs)) return { ok: false, message: '现有资源不足，等待生产或先发展对应资源。' };
    pay(state, costs);
    const id = `building-${++state.buildingSerial}`;
    state.buildings.push({ id, type, x: px, y: py, progress: 0, status: 'building', size: safeSize, settlementId: local.id, started: state.year, signalIssued: false, years: definition.years * (safeSize > 1 ? 1.25 : 1) * (terrain(state,px,py).buildCost||1), cost: costs, finance: state.financing || 'public' });
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
    if(building.type==='factory'&&largestCityPopulation(state)>=10000){if(!state.industrialized)event(state,'milestone','工业化开启','机械生产开始改变城市。',{priority:'major',industrialized:true,buildingId:building.id});state.industrialized=true;}
    updateEra(state);
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
    const society=root.CivilSociety?.cultureSummary(state),faction=society?(society.nobleInfluence*(100-society.nobleSupport)/650+society.clergyInfluence*(100-society.clergySupport)/1000)*Math.min(1,change/3):0;
    const resistance=clamp((5+change*6+benefit*1.5+(100-state.stability)*.08+faction)/(1+Math.min(.5,state.admin/160)),0,85);
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
  function reformTick(state,dt=0) {
    const process=state.reformProcess;
    if(process)process.started+=dt*(1-(root.CivilPolitics?.average(state,root.CivilPolitics.compliance)??1));
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
    const distance=Math.hypot(px-origin.x,py-origin.y),roads=1+Math.min(.5,count(state,'path')*.035+count(state,'road')*.06+count(state,'bridge')*.06+count(state,'postoffice')*.05);
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
    if(state.cityFounded&&state.population>=600&&state.neighbors.length<2&&!terrain(state,px,py).water&&state.settlements.every(s=>Math.hypot(s.x-px,s.y-py)>650)&&state.neighbors.every(n=>Math.hypot(n.x-px,n.y-py)>(n.radius||220)+250)&&state.buildings.every(b=>Math.hypot(b.x-px,b.y-py)>300)){
      const i=state.neighbors.length,scale=Math.max(1,Math.sqrt(state.population/600));
      const nation={id:`contact-country-${i}`,name:generatedName(state,'nation',i),color:i?'#c49a75':'#8cab78',x:px,y:py,radius:220,population:Math.max(800,Math.round(state.population*(i?.85:1.1))),relation:48,tension:25,exportResource:i?'stone':'food',importResource:'wood',exportRate:(i?7:14)*scale,importRate:6*scale,tradeOpen:false,embargo:false,pactUntil:0,guardUntil:0,lastIncident:state.elapsed,tradeLast:{imported:0,exported:0,tariff:0}};
      state.neighbors.push(nation);
      root.CivilMinerals?.initialize(state);
    root.CivilEconomy?.initialize(state);
    root.CivilLogistics?.initialize(state);
      event(state,'milestone',`接触${nation.name}`,'探索队与当地国家取得联系。可以派遣使节、开放交换或安排边境事务。',{nationId:nation.id,x:px,y:py});
    }
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

  function settlementPreview(state,x,y,name) {
    const px=clamp(cleanNumber(x,2360),120,WORLD_SIZE-120),py=clamp(cleanNumber(y,2250),120,WORLD_SIZE-120);
    if(terrain(state,px,py).water)return {ok:false,message:'聚落需要建在陆地上。'};
    if(foreignOwner(state,px,py))return {ok:false,message:'这里属于邻国，不能建立聚落。'};
    if(state.population<60)return {ok:false,message:'至少需要 60 位居民。'};
    if(!isExplored(state,px,py))return {ok:false,message:'请先探索这片土地。'};
    if(state.settlements.some(t=>Math.hypot(t.x-px,t.y-py)<220))return {ok:false,message:'离现有聚落太近。'};
    const sources=state.settlements.filter(t=>t.population>=14),source=sources.sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py))[0];
    if(!source)return {ok:false,message:'需要一个能迁出十四位居民的聚落。'};
    const cost={food:55,wood:65,stone:12};
    if(!enough(state,cost))return {ok:false,message:'新聚落需要 55 粮食、65 木材和 12 石材。',cost};
    const safeName=String(name??generatedName(state,'town',state.settlements.length)).trim();
    if(!safeName||safeName.length>18||/[\u0000-\u001f\u007f]/.test(safeName))return {ok:false,message:'请输入 1 至 18 个字的聚落名称。'};
    if(state.settlements.some(t=>t.name===safeName))return {ok:false,message:'已有同名聚落，请换一个名称。'};
    return {ok:true,x:px,y:py,name:safeName,sourceId:source.id,cost};
  }
  function settle(state,x,y,name) {
    const preview=settlementPreview(state,x,y,name);if(!preview.ok)return preview;
    const {x:px,y:py,name:safeName,sourceId,cost}=preview;
    pay(state,cost);
    let id=`settlement-${state.settlements.length}`;while(state.settlements.some(c=>c.id===id)||state.neighbors.some(n=>n.cities?.some(c=>c.id===id)))id+='-new';
    state.settlements.find(t=>t.id===sourceId).population-=14;
    state.settlements.push({id,name:safeName,x:px,y:py,population:14,level:0});
    const industrial=isIndustrialized(state),type=industrial?'brickhouse':state.era==='medieval'?'townhouse':'hut';
    [[-23,-13],[19,-12],[4,23]].forEach((p,index)=>state.buildings.push({id:`${id}-home-${index}`,type,x:px+p[0],y:py+p[1],progress:100,status:'complete',size:1,housingOverride:7,settlementId:id}));
    if(!industrial)state.buildings.push({id:`${id}-fire`,type:'fire',x:px,y:py,progress:100,status:'complete',size:1,settlementId:id});
    root.CivilSociety?.initialize(state);
    event(state,'milestone',`${safeName}落成`,'十四位居民迁入新聚落。',{settlementId:id,x:px,y:py});
    return {ok:true,message:`${safeName}成为新的聚落`,settlementId:id};
  }

  function updateStage(state) {
    const s = stats(state);
    let next = '河畔营地';
    if (s.population >= 45 && state.completedProjects >= 1) next = '定居村落';
    if (s.population >= 90 && s.knowledge >= 12 && s.productivity >= 10) next = '农业共同体';
    if (s.population >= 180 && s.knowledge >= 35 && count(state, 'council')) next = '早期城邑';
    if (s.population >= 350 && s.knowledge >= 80 && (count(state, 'market') || state.settlements.length >= 2)) next = '地区国家';
    if(state.startEra==='medieval'&&!isIndustrialized(state))next='中世纪诸城';
    if(isIndustrialized(state)){state.industrialized=true;next='工业社会';}
    if (isIndustrialized(state)&&s.knowledge >= 320 && count(state, 'power')) next = '现代文明';
    if (isIndustrialized(state)&&s.knowledge >= 500 && count(state, 'research')) next = '未来共同体';
    if (next !== state.stage) {
      state.stage = next;
      event(state, 'milestone', `走向${next}`, '人口、知识、公共建设与治理的连续选择，使文明形成了新的发展阶段。新的政策和建设会逐步开放。', { stage: next });
    }
    if(s.population>=180&&s.knowledge>=35&&count(state,'council'))state.cityFounded=true;
    updateEra(state);
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

  function policyFeedbackSummary(state,p) {
    const weighted=q=>activeProposal(state,q)?scopeSettlements(state,q).reduce((n,s)=>n+s.population*(q.localCoverage?.[s.id]??q.coverage)/100*(root.CivilPolitics?.compliance(state,s.id,q.executor)??1),0)/Math.max(1,state.population)*(q.target==='workers'?.54:q.target==='families'?.85:1):0;
    const active=activeProposal(state,p),share=weighted(p);
    const selected=p.clauses.map(id=>policyDefinitions.find(d=>d.id===id)).filter(d=>d&&available(state,d).ok);
    // Split a saturated clause between overlapping proposals, so displayed
    // contributions never exceed the effect the simulation actually applies.
    const coverage=d=>{const total=policyCoverage(state,d.id)+state.proposals.filter(q=>q.clauses.includes(d.id)).reduce((n,q)=>n+weighted(q),0);return total>0?Math.min(1,total)*share/total:0;};
    const sum=key=>selected.reduce((n,d)=>n+(d[key]||0)*coverage(d),0);
    const penalty=key=>selected.reduce((n,d)=>n+(d.tradeoffs?.[key]||0)*coverage(d),0);
    return {active,coverage:p.coverage||0,nationalCoverage:share*100,resistance:p.resistance||0,
      foodPercent:(sum('foodBonus')-penalty('foodPenalty'))*100,woodPercent:(sum('woodBonus')-penalty('woodPenalty'))*100,
      stonePercent:(sum('stoneBonus')-penalty('stonePenalty'))*100,knowledge:sum('knowledgeRate'),
      construction:sum('constructionBonus')*100,admin:sum('admin'),defense:sum('defense'),migration:sum('migration'),
      treasury:hasCurrency(state)?sum('treasuryRate')-penalty('upkeep'):0,foodUpkeep:penalty('foodUpkeep'),stability:sum('stabilityBonus')-penalty('opposition'),
      regions:scopeSettlements(state,p).map(s=>({name:s.name,coverage:p.localCoverage?.[s.id]||0}))};
  }
  function policyFeedback(state){
    for(const p of state.proposals){
      p.feedbackMilestones ||= [];
      const threshold=p.coverage>=99.9?100:p.coverage>=50?50:0;
      if(p.active&&threshold&&!p.feedbackMilestones.includes(threshold)){
        p.feedbackMilestones.push(threshold);if(threshold===100&&!p.feedbackMilestones.includes(50))p.feedbackMilestones.push(50);
        const f=policyFeedbackSummary(state,p);
        event(state,'report',p.name+' · '+(threshold===100?'完成覆盖':'推行过半'),`覆盖 ${Math.round(p.coverage)}% · 粮食产出 ${f.foodPercent.toFixed(1)}% · 信任目标 ${f.stability.toFixed(1)}${hasCurrency(state)?' · 财政 '+f.treasury.toFixed(1)+'/年':''}`,{proposalId:p.id,dedupe:'policy-progress:'+p.id+':'+threshold});
      }
      if(!p.active&&p.duration&&state.elapsed-p.started>=p.duration&&!p.expiryReported){p.expiryReported=true;event(state,'report',p.name+'到期','议案停止执行，效力开始退去。',{proposalId:p.id,dedupe:'policy-expiry:'+p.id});}
    }
  }

  function tick(state, years, options={}) {
    const advance=clamp(cleanNumber(years),0,120);
    if(!state.simulation)initialize(state);
    if(!options.deferForeign&&state.simulation.foreignPending)root.CivilNations?.schedule(state,{force:true});
    const finalElapsed=state.elapsed+advance,finalYear=state.year+advance;
    state.simulation.pending+=advance;
    if(state.simulation.pending+1e-8>=SYSTEM_INTERVALS.economy)initialize(state);
    while(state.simulation.pending+1e-8>=SYSTEM_INTERVALS.economy){
      const dt=SYSTEM_INTERVALS.economy;
      if(options.deferForeign)state.simulation.foreignPending=(state.simulation.foreignPending||0)+dt;
      state.simulation.pending=Math.max(0,state.simulation.pending-dt);
      state.elapsed=Number((finalElapsed-state.simulation.pending).toFixed(10));state.year=Number((finalYear-state.simulation.pending).toFixed(10));
      state.simulation.runs.economy=(state.simulation.runs.economy||0)+1;
      const warDt=due(state,'warfare',dt);if(warDt)root.CivilWarfare?.tick(state,warDt);
      const foreignDt=due(state,'foreign',dt);if(foreignDt)foreignTick(state,foreignDt,!!options.deferForeign);
      const s = stats(state);
      const suppliedFood=state.resources.food+s.foodProduction*dt;
      state.resources.food = clamp(state.resources.food + s.domesticFoodRate * dt, 0, 9999999);
      const mills=state.buildings.filter(b=>b.type==='lumber'&&b.status==='complete');
      const millRate=mills.reduce((n,b)=>n+8*b.size*(root.CivilPolitics?.labor(state,b.settlementId)??1)*clamp(forestRemaining(state,b.x,b.y)/24,0,1),0);
      const otherWood=4.4*clamp(state.population/36,0,1)*(root.CivilPolitics?.average(state,root.CivilPolitics.labor)??1)+state.buildings.filter(b=>b.status==='complete'&&b.type!=='lumber').reduce((n,b)=>n+(getDefinition(b.type)?.woodRate||0)*b.size*(root.CivilPolitics?.labor(state,b.settlementId)??1),0);
      const woodFactor=s.woodProduction/Math.max(.01,otherWood+millRate);
      let woodGained=otherWood*woodFactor*dt;
      mills.forEach(b=>woodGained+=harvest(state,b.x,b.y,8*b.size*(root.CivilPolitics?.labor(state,b.settlementId)??1)*woodFactor*dt));
      state.resources.wood = clamp(state.resources.wood + woodGained, 0, 9999999);
      let stoneGain=s.stoneProduction*dt;
      if(root.CivilMinerals){
        const quarries=state.buildings.filter(b=>b.status==='complete'&&b.type==='quarry'),scale=s.stoneProduction/Math.max(.01,.9+effects(state).stone);
        const planned=quarries.map(b=>({b,amount:7*(b.size||1)*(root.CivilPolitics?.labor(state,b.settlementId)??1)*root.CivilMinerals.factor(state,b)*scale*dt}));
        const room=Math.max(0,(root.CivilLogistics?.capacity(state,'stone')??9999999)-state.resources.stone);
        stoneGain=Math.min(room,Math.max(0,stoneGain-planned.reduce((n,p)=>n+p.amount,0)));
        for(const p of planned)stoneGain+=root.CivilMinerals.take(state,p.b,Math.min(p.amount,Math.max(0,room-stoneGain)));
      }
      state.resources.stone = clamp(state.resources.stone + Math.max(0,stoneGain), 0, 9999999);
      state.resources.treasury = hasCurrency(state)?clamp(state.resources.treasury+s.domesticTreasuryRate*dt,0,9999999):0;
      state.knowledge = clamp(state.knowledge + s.knowledgeRate * dt, 0, 99999);
      const housingFactor = clamp((s.housing - state.population) / Math.max(8, state.population), -0.08, 0.35);
      const satisfaction=clamp(suppliedFood/Math.max(.001,s.foodConsumption*dt),0,1);
      const foodFactor = state.resources.food > state.population * 0.4 ? 1 : .2;
      const growth = state.population * ((0.012 + housingFactor * 0.035)*foodFactor*satisfaction-(1-satisfaction)*.18);
      const migration = s.migrationRate * (s.housing > state.population + 3 && state.resources.food > 25 ? 1 : 0);
      const popChange=(growth+migration)*dt,share=state.settlements.reduce((n,s)=>n+s.population,0)||1,housing=regionalHousing(state);
      state.settlements.forEach(settlement=>{
        const change=popChange*settlement.population/share;
        settlement.population=Math.max(0,settlement.population+(change>0?Math.min(change,Math.max(0,housing[settlement.id]*1.05-settlement.population)):change));
        settlement.level=settlement.population>=500?3:settlement.population>=180?2:settlement.population>=70?1:0;
      });
      state.population=state.settlements.reduce((n,s)=>n+s.population,0);
      const societyDt=due(state,'society',dt);if(societyDt)root.CivilSociety?.tick(state,societyDt);
      const supplyDt=due(state,'supplies',dt);if(supplyDt)root.CivilLogistics?.tick(state,supplyDt);
      const targetStability = 76 + effects(state).stability + clamp((state.resources.cloth||0)/Math.max(10,state.population*.1),0,1)*2 + clamp((state.resources.medicine||0)/Math.max(10,state.population*.02),0,1)*3 - (state.resources.food < 12 ? 14 : 0) - (state.population > s.housing ? Math.min(12, (state.population - s.housing) * 0.25) : 0);
      state.stability = clamp(state.stability + (targetStability - state.stability) * 0.035 * dt, 15, 99);
      if(supplyDt){resourceWarnings(state);root.CivilMinerals?.tick(state);}
      if (state.population >= s.housing - 1 && !state.milestoneFlags.housing) {
        state.milestoneFlags.housing = true;
        event(state, 'news', '屋舍逐渐住满', '现有房屋已接近承载上限。村落的下一批家庭正在寻找落脚空间。', { population: Math.floor(state.population), housing: s.housing });
      } else if (state.population < s.housing - 6) state.milestoneFlags.housing = false;
      state.productivity = clamp(state.productivity + (state.knowledge * 0.0006) * dt, 8, 200);
      state.admin = clamp(state.admin + (state.knowledge * 0.00025) * dt, 12, 100);
      const policyDt=due(state,'policy',dt);if(policyDt){
        Object.entries(state.policies).forEach(([id, policy]) => {
          const definition = policyDefinitions.find(item => item.id === id);
          if (!definition) return;
          const speed = 100 / definition.spreadYears * (0.6 + state.admin / 70) / Math.max(1, state.settlements.length * 0.6);
          policy.coverage = clamp(policy.coverage + (policy.active ? speed : -4) * policyDt, 0, 100);
          policy.coveredSettlements = Math.floor(state.settlements.length * policy.coverage / 100);
        });
        state.proposals.forEach(p=>{
          const executor=policyExecutors.find(e=>e.id===p.executor);
          if(p.duration&&state.elapsed-p.started>=p.duration)p.active=false;
          const spread=Math.max(...p.clauses.map(id=>policyDefinitions.find(d=>d.id===id)?.spreadYears||4)),local=scopeSettlements(state,p),home=state.settlements[0];
          const roads=1+count(state,'path')*.03+count(state,'road')*.07+count(state,'bridge')*.05+count(state,'tram')*.1+count(state,'postoffice')*.08;
          p.localCoverage ||= Object.fromEntries(local.map(s=>[s.id,p.coverage||0]));
          for(const s of local){const distance=1+Math.hypot(s.x-home.x,s.y-home.y)/600,resistance=1+clamp(p.resistance||0,0,85)/80;p.localCoverage[s.id]=clamp((p.localCoverage[s.id]||0)+(p.active?(root.CivilPolitics?.compliance(state,s.id,p.executor)??1)*100/spread*(executor?.efficiency||1)*roads/(distance*Math.max(1,local.length*.75)*resistance):-6)*policyDt,0,100);}
          p.coverage=local.reduce((n,s)=>n+p.localCoverage[s.id]*s.population,0)/Math.max(1,local.reduce((n,s)=>n+s.population,0));
        });
        policyFeedback(state);
        const newly=visiblePolicies(state).filter(d=>!state.policyKnown.includes(d.id));
        if(newly.length){state.policyKnown.push(...newly.map(d=>d.id));event(state,'milestone','新的议案条款',newly.map(d=>`${d.name}：${d.drawback}`).join('\n'),{clauses:newly.map(d=>d.id),dedupe:`unlock:${newly.map(d=>d.id).join(',')}`});}
      }
      state.buildings.forEach(building => {
        if (building.status !== 'building') return;
        const definition = getDefinition(building.type);
        const previous = building.progress;
        building.progress = clamp(building.progress + dt / building.years * 100 * (1 + s.constructionBonus)*(root.CivilPolitics?.labor(state,building.settlementId)??1)*(root.CivilPolitics?.compliance(state,building.settlementId)??1), 0, 100);
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
      const politicsDt=due(state,'politics',dt);if(politicsDt)root.CivilPolitics?.tick(state,politicsDt);
      const macroDt=due(state,'macro',dt);if(macroDt)root.CivilEconomy?.tick(state,macroDt);
      const planningDt=due(state,'planning',dt);
      if(foreignDt)hostileTick(state,foreignDt);
      if(planningDt){autoBuild(state);}
      reformTick(state,dt);
      explorationTick(state,dt);
      updateStage(state);
    }
    state.elapsed=finalElapsed;state.year=finalYear;
    return state;
  }

  function setBudget(state, field, value) {
    if (!count(state, 'council')) return { ok: false, message: '建成议事屋后，才能调整税率与公共预算。' };
    const fields = ['construction', 'welfare', 'knowledge'];
    if (field !== 'taxRate' && !fields.includes(field)) return { ok: false, message: '请选择有效的预算项目。' };
    if(field==='taxRate'&&!hasCurrency(state))return {ok:false,message:'当前只能安排实物与劳役。'};
    if (!state.budget) state.budget = { taxRate: 0.08, construction: 45, welfare: 30, knowledge: 25 };
    if (field === 'taxRate') {
      if(root.CivilSociety)return root.CivilSociety.setTax(state,'poll',clamp(cleanNumber(value,state.budget.taxRate),0,.2));
      state.budget.taxRate=clamp(cleanNumber(value,state.budget.taxRate),0,.2);
    }
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
    VERSION, WORLD_SIZE, MAX_POLICY_CLAUSES, SYSTEM_INTERVALS,
    notify:event,constructionCosts,harvest,
    updateForeign:(state,options)=>root.CivilNations?.schedule(state,options),
    foreignTiming:state=>root.CivilNations?.timing(state),
    unrestSummary:state=>root.CivilPolitics?.summary(state),
    unrestAction:(state,id,action)=>root.CivilPolitics?.action(state,id,action),
    annexOffer:(state,id)=>root.CivilTerritory?.annexOffer(state,id),
    annex:(state,id)=>root.CivilTerritory?.annex(state,id),
    tradeTariffs:(state,n)=>root.CivilTerritory?.tariffs(state,n),
    setWarGoal:(state,id,goal)=>root.CivilWarfare?.setWarGoal(state,id,goal),
    economySummary:state=>root.CivilEconomy?.quote(state),
    setEconomicPolicy:(state,key,value)=>root.CivilEconomy?.setPolicy(state,key,value),
    debtAction:(state,action)=>root.CivilEconomy?.debtAction(state,action),
    mineralSummary:state=>root.CivilMinerals?.visible(state)||[],
    surveyMinerals:(state,x,y)=>root.CivilMinerals?.survey(state,x,y),
    resources:root.CivilLogistics?.resources||[],
    storageSummary:state=>root.CivilLogistics?.summary(state),
    configureTrade:(state,id,plan)=>root.CivilLogistics?.configureTrade(state,id,plan),
    policyFeedbackSummary,
    buildings: buildingDefinitions,
    policies: policyDefinitions,
    reforms: reformDefinitions,
    create, tick, build, togglePolicy, reform, explore, settle, settlementPreview, generatedName,stats, setBudget,
    available, isExplored, historicalTags,
    costsFor,
    eventPriority, regionalHousing, automationPlan, resourceWarnings, initialize, visiblePolicies, proposalOptions, draftPolicy, setProposalActive, automationLevel, setAutomation, forestRemaining, respondHostile,
    hasCurrency,canIntroduceCurrency,introduceCurrency,foreignAction,foreignSummary,foreignOwner,expeditionLimit,cancelExpedition,
    largestCityPopulation,isIndustrialized,reformPreview,
    warSummary:state=>root.CivilWarfare?.summary(state),
    mobilize:(state,level)=>root.CivilWarfare?.mobilize(state,level),
    declareWar:(state,id,goal)=>root.CivilWarfare?.declareWar(state,id,goal),
    negotiate:(state,id,offer)=>root.CivilWarfare?.negotiate(state,id,offer),
    snapshot(state) { return JSON.parse(JSON.stringify(state)); }
  };
  root.CivilWarfare?.configure({event,random,defenseAt});
  root.CivilLogistics?.configure({available});
})(typeof window !== 'undefined' ? window : globalThis);
