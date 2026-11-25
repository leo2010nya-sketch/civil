import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const ctx=vm.createContext({window:{}});
for(const f of ['terrain','society','warfare','logistics','minerals','economy','politics','territory','nations','statecraft','engine'])vm.runInContext(await readFile(new URL(`../${f}.js`,import.meta.url),'utf8'),ctx);
const {CivilEngine:E,CivilNations:N}=ctx.window;
let passed=0;function check(name,fn){fn();passed++;console.log('✓ '+name);}
check('abundant food and housing cannot exceed 0.8 percent natural growth per year',()=>assert.equal(E.populationChange(1000,2000,1,1,1),8));
check('migration shares the 1.2 percent total annual cap even in small villages',()=>{assert.equal(E.populationChange(1000,2000,1,1,1,100),12);assert.equal(E.populationChange(36,100,1,1,1,100),.432);});
check('starvation still decreases population and housing still caps positive growth',()=>{assert.ok(E.populationChange(1000,2000,0,0,1)<0);assert.equal(E.populationChange(105,100,1,1,1,100),0);});
check('annual rate limits scale with simulation time rather than update frequency',()=>{const full=E.populationChange(1000,2000,1,1,1,100);assert.equal(E.populationChange(1000,2000,1,1,.25,100)*4,full);});
check('player simulation applies the shared demographic cap',()=>{const s=E.create(48271,'人口检查');s.resources.food=1000;const old=s.population;E.tick(s,1);assert.ok(s.population>old&&s.population<=old*1.012+1e-8);});
check('foreign simulation uses exactly the same growth function',()=>{const s=E.create(48271,'共同人口规则','city');for(const n of s.neighbors)n.development.autoBuild=false;let calls=0;const original=E.populationChange;E.populationChange=(...args)=>{calls++;return original(...args);};try{const before=s.neighbors.map(n=>n.population);N.advance(s,1);assert.ok(calls>0);s.neighbors.forEach((n,i)=>assert.ok(n.population<=before[i]*Math.exp(.008)+1e-8));}finally{E.populationChange=original;}});
console.log(`${passed} shared population growth checks passed.`);
