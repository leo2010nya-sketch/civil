(function (root) {
  'use strict';
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const mix = (a,b,t) => a+(b-a)*t;
  function hash(x,y,seed) { let h=Math.imul((x|0)^seed,374761393)+Math.imul(y|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295; }
  function noise(x,y,seed) { const ix=Math.floor(x),iy=Math.floor(y),sx=x-ix,sy=y-iy,fx=sx*sx*(3-2*sx),fy=sy*sy*(3-2*sy);return mix(mix(hash(ix,iy,seed),hash(ix+1,iy,seed),fx),mix(hash(ix,iy+1,seed),hash(ix+1,iy+1,seed),fx),fy); }
  const fbm=(x,y,s)=>noise(x,y,s)*.56+noise(x*2.07,y*2.07,s+31)*.28+noise(x*4.11,y*4.11,s+83)*.16;
  function riverX(y,seed) { const d=y-2048;return 1920+Math.sin(d/310)*(66+seed%83)+Math.sin(d/115)*21+d*((seed%31)-15)*.006+(noise(0,y/740,seed+982)-noise(0,2048/740,seed+982))*250; }
  const cache=new Map();
  function geography(seed) {
    if(cache.has(seed))return cache.get(seed);
    const north=hash(1,1,seed+910)>.5?-1:1,side=hash(2,2,seed+911)>.5?-1:1;
    const joinY=2048+north*(570+hash(3,3,seed+912)*220),joinX=riverX(joinY,seed),length=580+hash(4,4,seed+913)*390,slope=.3+hash(5,5,seed+914)*.32;
    const angle=hash(6,6,seed+915)*Math.PI*2,distance=780+hash(7,7,seed+916)*320;
    const value={joinX,joinY,length,side,north,slope,lakes:[{x:joinX+side*length,y:joinY+north*length*slope,rx:62+hash(8,8,seed+917)*58,ry:46+hash(9,9,seed+918)*45},{x:2048+Math.cos(angle)*distance,y:2048+Math.sin(angle)*distance,rx:48+hash(10,10,seed+919)*65,ry:35+hash(11,11,seed+920)*58}]};
    if(cache.size>5)cache.delete(cache.keys().next().value);cache.set(seed,value);return value;
  }
  function legacySample(x,y,seed) {
    const geo=geography(seed),n=fbm(x/570,y/570,seed),ridge=fbm(x/310,y/310,seed+340);
    const radial=Math.hypot((x-2048)/(1580+hash(seed,9,seed+810)*240),(y-2048)/(1560+hash(8,seed,seed+811)*290));
    const elevation=1-radial+(fbm(x/690,y/690,seed+820)-.48)*.82+(n-.5)*.2;
    let river=Math.abs(x-riverX(y,seed));
    const branch=(x-geo.joinX)*geo.side;
    let width=12+noise(0,y/260,seed+10)*11;
    if(branch>=0&&branch<=geo.length){const by=geo.joinY+geo.north*branch*geo.slope+Math.sin(branch/geo.length*Math.PI*2)*42+Math.sin(branch/83)*11;const distance=Math.abs(y-by)/Math.sqrt(1+geo.slope*geo.slope);if(distance<river){river=distance;width=6.5+(1-branch/geo.length)*3;}}
    let lake=10;for(const p of geo.lakes)lake=Math.min(lake,Math.hypot((x-p.x)/p.rx,(y-p.y)/p.ry)+(n-.5)*.22);
    const sea=elevation<.1,water=sea||lake<1||river<width,shore=!water&&(elevation<.16||lake<1.12||river<width+13);
    const mountain=!water&&!shore&&ridge>.69&&Math.hypot(x-2048,y-2048)>520,forest=!water&&!shore&&fbm(x/320,y/320,seed+59)>.47;
    return {x,y,water,shore,mountain,forest,ridge,n,river,width,biome:sea?'海域':lake<1?'湖泊':water?'河流':shore?(elevation<.16?'海岸':lake<1.12?'湖岸':'河岸'):mountain?'岩岭':forest?'林地':river<170?'河谷草甸':'草原',fertility:water?0:clamp(90-river*.07+n*25,12,98),wood:forest?85:24,stone:mountain?90:28};
  }
  const worldCache=new Map();
  function world(seed){
    if(worldCache.has(seed))return worldCache.get(seed);
    const rotation=hash(1,9,seed+2001)*Math.PI*2,cos=Math.cos(rotation),sin=Math.sin(rotation);
    const orient=(u,v)=>({x:2048+u*cos-v*sin,y:2048+u*sin+v*cos});
    const out={rotation,cos,sin,continents:[{...orient(-390,0),rx:1150,ry:1650},{...orient(1330,100),rx:530+hash(2,3,seed)*100,ry:1350}],islands:[]};
    for(let i=0;i<11;i++){const a=i*2.399+rotation,r=1500+hash(i,2,seed+2010)*500;out.islands.push({x:clamp(2048+Math.cos(a)*r,170,3926),y:clamp(2048+Math.sin(a)*r,170,3926),rx:85+hash(i,3,seed)*130,ry:90+hash(i,4,seed)*130});}
    worldCache.set(seed,out);if(worldCache.size>8)worldCache.delete(worldCache.keys().next().value);return out;
  }
  function sample(x,y,seed,version=2){
    const p=legacySample(x,y,seed);if(version<2)return {...p,region:'temperate',landform:p.mountain?'mountain':'plain',buildCost:1,foodFactor:1};
    const g=world(seed),dx=x-2048,dy=y-2048,u=dx*g.cos+dy*g.sin,v=-dx*g.sin+dy*g.cos;
    let field=-10,continent=-1;
    for(const [i,c] of [...g.continents,...g.islands].entries()){
      const value=1-Math.hypot((x-c.x)/c.rx,(y-c.y)/c.ry)+(p.n-.5)*.36;
      if(value>field){field=value;continent=i;}
    }
    // An unbroken sea channel separates the second continent. The starting
    // river valley remains habitable; old saves retain their original geography.
    if(u>760&&u<920)field=Math.min(field,-.08);
    field=Math.max(field,(1-Math.hypot(dx,dy)/720)*.5);
    const sea=field<.035,water=sea||(!p.water?false:p.biome!=='海域');
    const moisture=fbm(x/770,y/770,seed+2400),heat=clamp(1-Math.abs(y-2360)/2300+(noise(x/1300,y/1300,seed+2401)-.5)*.5,0,1);
    // Broad seeded climate bands provide readable regions instead of speckles.
    const dry=moisture<.43&&Math.hypot(dx,dy)>530,wet=moisture>.54&&heat>.55;
    const basin=fbm(x/460,y/460,seed+2450)>.6;
    const mountain=!water&&p.ridge>.68&&Math.hypot(dx,dy)>500;
    const hill=!water&&!mountain&&p.ridge>.55;
    const shore=!water&&(field<.1||p.river<p.width+13||p.biome==='湖岸');
    const forest=!water&&!dry&&!mountain&&(wet||fbm(x/320,y/320,seed+59)>.49);
    const region=dry?'arid':wet?'tropical':heat<.38?'cold':'temperate';
    const landform=water?'water':mountain?'mountain':hill?'hill':basin?'basin':'plain';
    const biome=sea?'海域':water?p.biome==='湖泊'?'湖泊':'河流':shore?'海岸与河岸':dry?'沙漠':wet?'热带雨林':mountain?'高山':hill?'丘陵':basin?'盆地':forest?'温带森林':'平原';
    const fertility=water?0:dry?clamp(12+(p.river<150?35:0),8,50):clamp((wet?64:basin?94:hill?61:mountain?28:86)+(p.n-.5)*20,10,98);
    return {...p,water,sea,shore,mountain,forest,heat,moisture,region,landform,biome,continent:continent===1?'新大陆':continent>=2?'海岛':'大陆',fertility,wood:dry?6:wet?98:forest?85:25,stone:mountain?98:hill?75:dry?45:30,buildCost:mountain?1.3:hill?1.15:wet?1.12:1,foodFactor:dry?.45:mountain?.55:hill?.86:wet?.95:basin?1.2:1.1};
  }
  const treeCache=new Map();
  function trees(seed,version=2) {
    const cacheKey=`${seed}:${version}`;
    if(treeCache.has(cacheKey))return treeCache.get(cacheKey);
    const result=[];
    for(let gy=0;gy<4096;gy+=23)for(let gx=0;gx<4096;gx+=23){const h=hash(gx,gy,seed+22),x=gx+hash(gx,gy,seed+23)*22,y=gy+hash(gx,gy,seed+24)*22,p=sample(x,y,seed,version);
      if(!p.water&&!p.shore&&Math.hypot((x-2048)*.94,y-2048)>112&&h>(p.region==='arid'?.992:p.forest?.25:.93))result.push({id:`${gx}:${gy}`,x,y,size:9+hash(gx,gy,seed+25)*10,kind:p.region==='tropical'?'palm':p.region==='arid'?'dry':h>.74?'pine':'leaf',shade:hash(gx,gy,seed+26)});
    }
    if(treeCache.size>3)treeCache.delete(treeCache.keys().next().value);treeCache.set(cacheKey,result);return result;
  }
  root.CivilTerrain={sample,trees,hash,noise,fbm,riverX,world};
})(typeof window!=='undefined'?window:globalThis);
