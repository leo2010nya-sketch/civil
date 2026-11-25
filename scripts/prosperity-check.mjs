import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const ctx=vm.createContext({window:{}});
for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),ctx);
const {CivilEngine:E,CivilNations:N}=ctx.window;
let passed=0;function check(name,fn){fn();passed++;console.log('✓ '+name);}
const nation=()=>({population:100,stability:76,resources:{food:100,wood:100,stone:100}});
function advance(n,years,options={},rising=true){for(let t=0;t<Math.round(years/.05);t++){if(rising)for(const k of ['food','wood','stone'])n.resources[k]+=.1;E.prosperityTrust(n,.05,76,options);}}
check('sustained broad resource gains gradually increase trust after two years',()=>{const n=nation();advance(n,1);assert.equal(n.stability,76);advance(n,2);assert.ok(n.prosperity.active&&n.stability>76&&n.stability<78);});
check('one resource windfall and idle stocks do not count as sustained prosperity',()=>{const n=nation();E.prosperityTrust(n,0,76);n.resources.food+=1000;advance(n,4,{},false);assert.ok(!n.prosperity.active);assert.equal(n.stability,76);});
check('food shortages overcrowding unrest and war immediately stop the prosperity effect',()=>{for(const options of [{foodSatisfied:false},{housed:false},{disorder:true},{war:true}]){const n=nation();advance(n,3);advance(n,.05,options);assert.ok(!n.prosperity.active);assert.equal(n.prosperity.goodYears,0);}});
check('declining used resources or treasury prevent prosperity without requiring locked resources',()=>{for(const key of ['stone','treasury']){const n=nation();n.resources[key]=100;E.prosperityTrust(n,0,76,{currency:true});for(let i=0;i<60;i++){n.resources.food++;n.resources.wood++;n.resources[key]-=.2;E.prosperityTrust(n,.05,76,{currency:true});}assert.ok(!n.prosperity.active);}});
check('trend and trust survive saves and identical substeps produce identical outcomes',()=>{const a=nation();advance(a,1.5);const b=JSON.parse(JSON.stringify(a));advance(a,2);advance(b,2);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.ok(a.stability>76);});
check('high trust remains bounded during long prosperity',()=>{const n=nation();advance(n,300);assert.ok(n.stability>94&&n.stability<=95);});
check('player and foreign simulations both invoke the same trust calculation',()=>{const s=E.create(48271,'共同繁荣','city');let player=0,foreign=0;const original=E.prosperityTrust;E.prosperityTrust=(n,...args)=>{foreign++;return original(n,...args);};try{N.advance(s,.1);assert.ok(foreign>0);E.tick(s,.1);player=!!s.prosperity;assert.ok(player);}finally{E.prosperityTrust=original;}});
console.log(`${passed} shared prosperity trust checks passed.`);
