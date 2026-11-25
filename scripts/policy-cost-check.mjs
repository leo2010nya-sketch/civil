import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
const c=vm.createContext({window:{}});for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),c);
const E=c.window.CivilEngine,plain=x=>JSON.parse(JSON.stringify(x));let passed=0;const check=(name,fn)=>{fn();passed++;console.log('✓ '+name);};
const proposal=(extra={})=>({name:'公共采集',clauses:['forage'],regions:['all'],target:'all',executor:'community',condition:'always',duration:0,...extra});
const village=()=>E.create(48271,'发起支出'),rich=()=>{const s=E.create(48271,'财政安排','city');for(const k of ['food','wood','stone','treasury'])s.resources[k]=100000;return s;};
check('even a basic community policy charges real pre-currency organization materials',()=>{
 const s=village(),before=plain(s.resources),input=proposal(),q=E.draftPolicy(s,{...input,preview:true});assert.ok(q.ok&&q.cost.food>0&&q.cost.wood>0);assert.ok(!q.cost.treasury);assert.equal(q.costKind,'initiation');assert.deepEqual(plain(s.resources),before);const result=E.draftPolicy(s,input);assert.ok(result.ok);for(const[k,v]of Object.entries(q.cost))assert.equal(s.resources[k],before[k]-v);assert.deepEqual(plain(s.proposals[0].spending.total),plain(q.cost));
});
check('organization clause and executor costs sum to the exact upfront payment',()=>{
 const s=rich(),input=proposal({clauses:['forage','reserve'],executor:'administration'}),q=E.draftPolicy(s,{...input,preview:true});assert.ok(q.ok&&q.cost.treasury>0&&q.clauseCost.food>0&&q.executorCost.treasury>0);const before=plain(s.resources);assert.ok(E.draftPolicy(s,input).ok);for(const[k,v]of Object.entries(q.cost)){assert.equal(v,(q.organizationCost[k]||0)+(q.clauseCost[k]||0)+(q.executorCost[k]||0));assert.equal(s.resources[k],before[k]-v);}assert.deepEqual(plain(s.history[0].data.policyCost),plain(q.cost));
});
check('broader geographic population and more clauses require more organization spending',()=>{
 const s=rich(),narrow=E.draftPolicy(s,{...proposal({regions:[s.settlements[0].id]}),preview:true}),wide=E.draftPolicy(s,{...proposal(),preview:true}),complex=E.draftPolicy(s,{...proposal({clauses:['forage','reserve','works']}),preview:true});assert.ok(wide.organizationCost.treasury>narrow.organizationCost.treasury);assert.ok(complex.organizationCost.treasury>wide.organizationCost.treasury);
});
check('insufficient reserves and invalid drafts neither create policies nor partially spend',()=>{
 const s=village();s.resources.wood=0;const before=plain(s.resources),trust=s.stability,serial=s.proposalSerial;assert.equal(E.draftPolicy(s,proposal()).ok,false);assert.deepEqual(plain(s.resources),before);assert.equal(s.stability,trust);assert.equal(s.proposals.length,0);assert.equal(s.proposalSerial,serial);s.resources.wood=100;const funded=plain(s.resources);assert.equal(E.draftPolicy(s,proposal({name:'  '})).ok,false);assert.deepEqual(plain(s.resources),funded);assert.equal(E.draftPolicy(s,proposal({clauses:['automation']})).ok,false);assert.deepEqual(plain(s.resources),funded);
});
check('substantive revisions and scope changes charge materials while retaining prior investment totals',()=>{
 const s=rich();assert.ok(E.draftPolicy(s,proposal({clauses:['forage','reserve']})).ok);const p=s.proposals.at(-1),before=plain(s.resources),spent=plain(p.spending.total),input={...plain(p),clauses:['forage']},q=E.draftPolicy(s,{...input,preview:true});assert.ok(q.ok&&q.costKind==='revision'&&q.cost.treasury>0);assert.ok(E.draftPolicy(s,input).ok);for(const[k,v]of Object.entries(q.cost)){assert.equal(s.resources[k],before[k]-v);assert.equal(p.spending.total[k],(spent[k]||0)+v);}const local={...plain(p),regions:[s.settlements[0].id]};assert.ok(E.draftPolicy(s,{...local,preview:true}).cost.treasury>0);
});
check('renaming and pure preview are free and cannot reset coverage timers or spending',()=>{
 const s=village();E.draftPolicy(s,proposal());const p=s.proposals[0];p.coverage=42;p.localCoverage.home=42;const before=plain(s.resources),spending=plain(p.spending),started=p.started;const input={...plain(p),name:'新名称'},q=E.draftPolicy(s,{...input,preview:true});assert.deepEqual(plain(q.cost),{});assert.equal(q.costKind,'unchanged');assert.ok(E.draftPolicy(s,input).ok);assert.deepEqual(plain(s.resources),before);assert.deepEqual(plain(p.spending),spending);assert.equal(p.coverage,42);assert.equal(p.started,started);
});
check('pause and resume do not refund or duplicate upfront spending',()=>{
 const s=village();E.draftPolicy(s,proposal());const p=s.proposals[0],before=plain(s.resources),spent=plain(p.spending);E.setProposalActive(s,p.id,false);E.setProposalActive(s,p.id,true);assert.deepEqual(plain(s.resources),before);assert.deepEqual(plain(p.spending),spent);
});
check('payment history survives saves and existing policies are not charged retroactively',()=>{
 const s=village();E.draftPolicy(s,proposal());const saved=E.initialize(plain(s));assert.deepEqual(plain(saved.proposals[0].spending),plain(s.proposals[0].spending));delete saved.proposals[0].spending;const before=plain(saved.resources);E.initialize(saved);assert.deepEqual(plain(saved.resources),before);assert.equal(saved.proposals[0].spending,undefined);assert.ok(E.draftPolicy(saved,{...plain(saved.proposals[0]),name:'旧议案更名'}).ok);assert.deepEqual(plain(saved.resources),before);
});
console.log(`${passed} policy initiation cost checks passed.`);
