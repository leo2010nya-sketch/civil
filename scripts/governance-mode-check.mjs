import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const ctx=vm.createContext({window:{}});
for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine','governance-mode'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),ctx);
const {CivilEngine:E,CivilGovernance:G}=ctx.window;
let passed=0;const check=(name,fn)=>{fn();console.log('✓ '+name);passed++;};
for(const seed of [48271,5,991]){
 const s=E.create(seed,'现代国家','governance');
 check(`seed ${seed}: modern cities house over 100,000 people`,()=>{assert.ok(s.population>100000);const housing=E.regionalHousing(s);for(const c of s.settlements)assert.ok(housing[c.id]>=c.population);assert.equal(s.era,'modern');assert.ok(s.buildings.some(b=>b.type==='bank'));assert.ok(s.buildings.some(b=>b.type==='factory'));assert.ok(E.hasCurrency(s));});
 check(`seed ${seed}: direct interventions cannot spend or mutate`,()=>{const before=JSON.stringify(s.resources),length=s.buildings.length,n=s.neighbors[0];for(const result of [E.build(s,'hut',2000,2000),E.demolish(s,s.buildings[0].id),E.settle(s,2000,2000,'test'),E.foreignAction(s,n.id,'envoy'),E.declareWar(s,n.id,{type:'security'}),E.mobilize(s,'mass'),E.configureTrade(s,n.id,{imports:{},exports:{}})])assert.equal(result.ok,false);assert.equal(JSON.stringify(s.resources),before);assert.equal(s.buildings.length,length);});
 if(seed===48271){
 check('broader macro controls retain real consequences',()=>{assert.ok(E.setEconomicPolicy(s,'spending',.45).ok);assert.ok(E.setEconomicPolicy(s,'interest',.25).ok);});
 check('letters have real budget consequences and cannot be answered twice',()=>{E.tick(s,7);const l=s.governance.letters.find(l=>l.request);assert.ok(l);s.resources.treasury=1000000;const before=s.resources.treasury;assert.ok(G.respond(s,l.id,true).ok);assert.equal(s.resources.treasury,before-l.request.cost);assert.equal(G.respond(s,l.id,true).ok,false);});
 check('autonomous construction, recurring events and persistence',()=>{G.setDirection(s,'housing',100);s.resources.wood=200000;s.resources.stone=200000;s.resources.treasury=1000000;s.resources.food=1000000;const before=s.buildings.length;E.tick(s,12);assert.ok(s.buildings.length>before);assert.ok(s.governance.letters.length>3);assert.equal(s.governance.delegating,false);const restored=E.initialize(E.snapshot(s));assert.equal(restored.startMode,'governance');assert.equal(restored.governance.letters.length,s.governance.letters.length);E.tick(restored,1);assert.ok(Object.values(restored.resources).every(Number.isFinite));});
 }
}
check('other modes retain their rules and controls',()=>{const s=E.create(48271,'普通开局');assert.equal(s.startMode,'village');assert.equal(s.population,36);assert.ok(E.build(s,'hut',s.settlements[0].x+120,s.settlements[0].y).ok);const c=E.create(48271,'继承','city');assert.equal(c.startMode,'city');assert.equal(c.startEra,'medieval');});
check('policy propagation is accelerated only in governance mode',()=>{
 const modern=E.create(48271,'政策试验','governance'),normal=E.snapshot(modern);normal.startMode='city';
 for(const s of [modern,normal]){s.proposals.push({id:'speed-test',name:'政策试验',clauses:['reserve'],regions:['all'],target:'all',executor:'community',condition:'always',duration:0,started:s.elapsed,active:true,coverage:0,resistance:0,localCoverage:{}});E.tick(s,1);}
 assert.ok(modern.proposals.find(p=>p.id==='speed-test').coverage>normal.proposals.find(p=>p.id==='speed-test').coverage);
});
console.log(`${passed} governance mode checks passed`);
