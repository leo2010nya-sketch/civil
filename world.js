(function () {
  'use strict';

  const SIZE = 4096;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const makeCanvas = (width, height) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };
  const clearingRadii = {farm:35,estate:68,canal:45,quarry:30,factory:44,hospital:38,power:45,research:46,palisade:40,watchtower:17,wall:55,windmill:28,watermill:32,warehouse:32,townhouse:25,apartment:34,clinic:26,academy:32,machineworks:38,publicschool:37,railstation:45,steamplant:40,shrine:18,temple:37,plaza:32,theater:37,printing:29,museum:43,manor:44,castle:55,guildhall:34,inn:29,harbor:46,fair:40,road:35,aqueduct:52,sewer:33,tram:48,taxoffice:33,brickhouse:27,barracks:38,bank:39,mint:30,exchange:38,postoffice:27,claypit:27,ironmine:34,coalmine:34,toolworks:29,weaving:27,apothecary:28,storehouse:26};

  function hash(x, y, seed) {
    let h = Math.imul((x | 0) ^ seed, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    return mix(mix(hash(ix, iy, seed), hash(ix + 1, iy, seed), fx), mix(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), fx), fy);
  }
  function fbm(x, y, seed) {
    return noise(x, y, seed) * .56 + noise(x * 2.07, y * 2.07, seed + 31) * .28 + noise(x * 4.11, y * 4.11, seed + 83) * .16;
  }
  function riverX(y, seed) {
    const d = y - 2048, amplitude = 66 + (seed % 83), slope = ((seed % 31) - 15) * .006;
    const meander = (noise(0, y / 740, seed + 982) - noise(0, 2048 / 740, seed + 982)) * 250;
    return 1920 + Math.sin(d / 310) * amplitude + Math.sin(d / 115) * 21 + d * slope + meander;
  }

  function makeGeography(seed) {
    const north = hash(1, 1, seed + 910) > .5 ? -1 : 1;
    const side = hash(2, 2, seed + 911) > .5 ? -1 : 1;
    const joinY = 2048 + north * (570 + hash(3, 3, seed + 912) * 220);
    const joinX = riverX(joinY, seed), length = 580 + hash(4, 4, seed + 913) * 390;
    const slope = .3 + hash(5, 5, seed + 914) * .32;
    const sourceX = joinX + side * length, sourceY = joinY + north * length * slope;
    const angle = hash(6, 6, seed + 915) * TAU, distance = 780 + hash(7, 7, seed + 916) * 320;
    return {
      joinX, joinY, length, side, north, slope,
      lakes: [
        { x: sourceX, y: sourceY, rx: 62 + hash(8, 8, seed + 917) * 58, ry: 46 + hash(9, 9, seed + 918) * 45 },
        { x: 2048 + Math.cos(angle) * distance, y: 2048 + Math.sin(angle) * distance, rx: 48 + hash(10, 10, seed + 919) * 65, ry: 35 + hash(11, 11, seed + 920) * 58 }
      ]
    };
  }

  class CivilWorld {
    constructor(canvas, callbacks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      // Paint the world on a deliberately small raster, then enlarge it without
      // interpolation. Map labels stay on the full-resolution display canvas.
      this.sceneCanvas = makeCanvas(1, 1);
      this.sceneCtx = this.sceneCanvas.getContext('2d', { alpha: false });
      this.pixelRatio = .5;
      this.callbacks = callbacks || {};
      this.state = null;
      this.seed = null;
      this.geography = makeGeography(40721);
      this._view = { x: 2048, y: 2048, zoom: 1.62 };
      this.target = { ...this._view };
      this.layer = 'natural';
      this.mode = null;
      this.buildType = null;
      this.buildSize = 1;
      this.pointer = null;
      this.selected = null;
      this.width = 1;
      this.height = 1;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.terrain = null;
      this.trees = [];
      this.rocks = [];
      this.reeds = [];
      this.fogCanvas = makeCanvas(1, 1);
      this.cacheEnabled = true;
      this.mapCache = { terrain: null, surface: null, objects: null, fogKey: null };
      // Bound extra object-layer memory; terrain and surface each use one viewport.
      this.cachePixelLimit = 8 * 1024 * 1024;
      this.cacheStats = { terrainBuilds: 0, surfaceBuilds: 0, objectBuilds: 0, fogBuilds: 0, hits: 0 };
      this.lastNotice = '';
      this.lastPaint = 0;
      this.dirty = true;
      this.handlers = [];
      this.setupPointer();
      this.resize();
      this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
      if (this.observer) this.observer.observe(canvas);
    }

    get view() {
      const z = this._view.zoom;
      return { ...this._view, level: z < .42 ? 'world' : z < .95 ? 'region' : 'village' };
    }

    setState(state) {
      if (this.state !== state) this.clearMapCache();
      this.state = state;
      if (!state) return;
      const seed = Number.isFinite(Number(state.seed)) ? Number(state.seed) : 40721;
      if (this.seed !== seed || this.geographyVersion !== (state.geographyVersion||1)) {
        this.geographyVersion=state.geographyVersion||1;
        this.seed = seed;
        this.geography = makeGeography(seed);
        this.generate();
        const home = state.settlements && state.settlements[0];
        this._view.x = this.target.x = home ? home.x : 2048;
        this._view.y = this.target.y = home ? home.y : 2048;
        this._view.zoom = this.target.zoom = 1.62;
      }
      this.dirty = true;
    }

    clearMapCache() {
      if (!this.mapCache) return;
      for (const layer of [this.mapCache.terrain, this.mapCache.surface, ...(this.mapCache.objects?.runs || [])]) {
        if (layer?.canvas) { layer.canvas.width = 1; layer.canvas.height = 1; }
      }
      this.mapCache = { terrain: null, surface: null, objects: null, fogKey: null };
      this.foreignBuildingKey = null;
    }

    cacheInfo() {
      const layers = [this.mapCache.terrain, this.mapCache.surface, ...(this.mapCache.objects?.runs || [])];
      return { ...this.cacheStats, pixels: layers.reduce((sum, layer) => sum + (layer?.canvas ? layer.canvas.width * layer.canvas.height : 0), 0), objectPixels: this.mapCache.objects?.pixels || 0, objectPixelLimit: this.cachePixelLimit };
    }

    // A viewport layer uses exactly the scene's pixel grid. Cropping never
    // changes the raster scale, so cached and live objects keep the same edges.
    makeMapLayer(c, paint, bounds) {
      const w = this.sceneCanvas.width, h = this.sceneCanvas.height;
      const left = bounds ? clamp(Math.floor(bounds.left), 0, w) : 0;
      const top = bounds ? clamp(Math.floor(bounds.top), 0, h) : 0;
      const right = bounds ? clamp(Math.ceil(bounds.right), 0, w) : w;
      const bottom = bounds ? clamp(Math.ceil(bounds.bottom), 0, h) : h;
      if (right <= left || bottom <= top) return null;
      const canvas = makeCanvas(right - left, bottom - top), context = canvas.getContext('2d');
      const m = c.getTransform();
      context.setTransform(m.a, m.b, m.c, m.d, m.e - left, m.f - top);
      context.imageSmoothingEnabled = c.imageSmoothingEnabled;
      paint(context);
      return { canvas, left, top };
    }

    compositeMapLayer(c, layer) {
      if (!layer) return;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(layer.canvas, layer.left, layer.top); c.restore();
    }

    mapKeys() {
      const s = this.state;
      const view = `${this.width}:${this.height}:${this.sceneCanvas.width}:${this.sceneCanvas.height}:${this._view.x}:${this._view.y}:${this._view.zoom}`;
      const settlements = (s.settlements || []).map(p => `${p.id}:${p.x}:${p.y}`).join('|');
      const buildings = (s.buildings || []).map(b => `${b.id}:${b.type}:${b.x}:${b.y}:${b.size}:${b.status}:${b.settlementId}`).join('|');
      const explored = (s.explored || []).map(p => `${p.x}:${p.y}:${p.radius}`).join('|');
      const nations = this.nationCities().map(n => `${n.nationId}:${n.id}:${(n.assets||[]).map(b=>b.id+b.status).join(',')}:${n.x}:${n.y}:${n.population >= 1000}:${Math.min(8,Math.max(0,Math.floor(Math.log2(Math.max(1,n.population/1000)))))}`).join('|');
      const forest = Object.keys(s.forest?.removed || {}).filter(id => s.forest.removed[id]).join('|');
      const ground = `${this.seed}:${view}:${settlements}`;
      const objects = `${ground}:${this.currentEra}:${buildings}:${explored}:${nations}:${forest}`;
      return { ground, surface: `${ground}:${this.currentEra}:${buildings}:${forest}`, objects, fog: `${this.seed}:${view}:${explored}` };
    }

    sample(x, y) {
      return window.CivilTerrain.sample(x,y,this.seed ?? 40721,this.geographyVersion||1);
    }

    generate() {
      const res = 1024;
      this.terrain = makeCanvas(res, res);
      const c = this.terrain.getContext('2d');
      const img = c.createImageData(res, res);
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const wx = x * 4, wy = y * 4;
          const p = this.sample(wx, wy);
          const grain = (hash(x, y, this.seed + 191) - .5) * 7;
          const grassPatch = (fbm(wx / 83, wy / 83, this.seed + 600) - .48) * 35;
          let red, green, blue;
          if(p.region==='arid'&&!p.water){red=136+p.n*33;green=111+p.n*28;blue=67+p.n*20;}
          else if(p.region==='tropical'&&!p.water){red=33+p.n*25;green=75+p.n*36;blue=51+p.n*24;}
          else if(p.landform==='basin'&&!p.water){red=73+p.n*30;green=108+p.n*40;blue=65+p.n*22;}
          else if(p.landform==='hill'&&!p.water){const contour=Math.sin((p.ridge-.5)*125)*5;red=96+p.n*29+contour;green=105+p.n*30+contour;blue=75+p.n*22;}
          else if(p.region==='cold'&&!p.water){red=101+p.n*32;green=117+p.n*30;blue=109+p.n*32;}
          else if (p.water) {
            const ripple = noise(wx / 65, wy / 65, this.seed + 33);
            red = 34 + ripple * 12; green = 67 + ripple * 17; blue = 65 + ripple * 14;
          } else if (p.shore) {
            red = 107 + p.n * 20; green = 112 + p.n * 21; blue = 77 + p.n * 16;
          } else if (p.mountain) {
            const shade = (p.ridge - .69) * 205;
            red = 85 + shade; green = 96 + shade; blue = 78 + shade;
          } else {
            const rolling = noise(wx / 155, wy / 155, this.seed + 8);
            red = 66 + p.n * 42 + rolling * 11;
            green = 88 + p.n * 47 + rolling * 11;
            blue = 58 + p.n * 26 + rolling * 6;
            red += grassPatch * .65; green += grassPatch; blue += grassPatch * .35;
            const dry = noise(wx / 48, wy / 48, this.seed + 411);
            if (dry > .68) { red += (dry - .68) * 70; green += (dry - .68) * 30; blue -= (dry - .68) * 15; }
            if (p.forest) { red -= 9; green -= 10; blue -= 5; }
          }
          const i = (y * res + x) * 4;
          img.data[i] = clamp(red + grain, 0, 255);
          img.data[i + 1] = clamp(green + grain, 0, 255);
          img.data[i + 2] = clamp(blue + grain, 0, 255);
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      this.trees = []; this.rocks = []; this.reeds = [];
      for (let gy = 0; gy < SIZE; gy += 23) {
        for (let gx = 0; gx < SIZE; gx += 23) {
          const h = hash(gx, gy, this.seed + 22);
          const x = gx + hash(gx, gy, this.seed + 23) * 22;
          const y = gy + hash(gx, gy, this.seed + 24) * 22;
          const p = this.sample(x, y);
          const clearing = Math.hypot((x - 2048) * .94, y - 2048);
          if (!p.water && !p.shore && clearing > 112 && h > (p.region==='arid'?.992:p.forest ? .25 : .93)) this.trees.push({ id:`${gx}:${gy}`, x, y, size: 9 + hash(gx, gy, this.seed + 25) * 10, kind:p.region==='tropical'?'palm':p.region==='arid'?'dry':h > .74 ? 'pine' : 'leaf', shade: hash(gx, gy, this.seed + 26) });
          else if (!p.water && (p.mountain ? h > .45 : h > .982) && clearing > 90) this.rocks.push({ x, y, size: 4 + h * 4, shade: hash(gx, gy, this.seed + 21) });
          else if (p.shore && h > .5) this.reeds.push({ x, y, size: 5 + h * 4 });
        }
      }
    }

    resize() {
      const box = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, box.width);
      this.height = Math.max(1, box.height);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w; this.canvas.height = h;
      }
      const sw = Math.max(1, Math.ceil(this.width * this.pixelRatio)), sh = Math.max(1, Math.ceil(this.height * this.pixelRatio));
      if (this.sceneCanvas.width !== sw || this.sceneCanvas.height !== sh) {
        this.clearMapCache();
        this.sceneCanvas.width = sw; this.sceneCanvas.height = sh;
        this.fogCanvas.width = sw; this.fogCanvas.height = sh;
      }
      this.dirty = true;
    }

    screenToWorld(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return { x: this._view.x + (clientX - r.left - this.width / 2) / this._view.zoom, y: this._view.y + (clientY - r.top - this.height / 2) / this._view.zoom };
    }

    worldToScreen(x, y) { return { x: (x - this._view.x) * this._view.zoom + this.width / 2, y: (y - this._view.y) * this._view.zoom + this.height / 2 }; }

    setZoom(zoom, anchor) {
      const next = clamp(zoom, .15, 3.5);
      if (anchor && typeof anchor.x === 'number') {
        this.target.x = anchor.x + (this.target.x - anchor.x) * this.target.zoom / next;
        this.target.y = anchor.y + (this.target.y - anchor.y) * this.target.zoom / next;
      }
      this.target.zoom = next; this.dirty = true;
    }
    zoomBy(factor) { this.setZoom(this.target.zoom * factor); }
    setLayer(layer) { this.layer = layer || 'natural'; this.dirty = true; }
    centerOn(x, y) { this.target.x = x ?? this.state.settlements?.[0]?.x ?? 2048; this.target.y = y ?? this.state.settlements?.[0]?.y ?? 2048; this.dirty = true; }
    setMode(mode, type, size = 1) { this.mode = mode; this.buildType = type; this.buildSize = clamp(Number(size) || 1, 1, 3); this.canvas.style.cursor = mode === 'build' ? 'crosshair' : 'grab'; this.dirty = true; }
    isExplored(x, y) { return !!(this.state && this.state.explored && this.state.explored.some(p => Math.hypot(p.x - x, p.y - y) < p.radius * .90)); }

    render(time) {
      if (!this.state || !this.terrain) return;
      const moving = Math.abs(this._view.x - this.target.x) + Math.abs(this._view.y - this.target.y) + Math.abs(this._view.zoom - this.target.zoom) * 500 > .15;
      if (!this.dirty && !moving && time - this.lastPaint < 70) return;
      this.lastPaint = time;
      for (const axis of ['x', 'y', 'zoom']) this._view[axis] = moving ? mix(this._view[axis], this.target[axis], .22) : this.target[axis];
      this.currentEra = this.visualEra();
      const c = this.sceneCtx, z = this._view.zoom;
      c.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      c.fillStyle = '#112021'; c.fillRect(0, 0, this.width, this.height);
      c.save(); c.translate(this.width / 2, this.height / 2); c.scale(z, z); c.translate(-this._view.x, -this._view.y);
      c.imageSmoothingEnabled = true;
      const view = { left: this._view.x - this.width / z / 2 - 50, right: this._view.x + this.width / z / 2 + 50, top: this._view.y - this.height / z / 2 - 60, bottom: this._view.y + this.height / z / 2 + 60 };
      const cached = this.cacheEnabled && !moving, keys = cached ? this.mapKeys() : null;
      if (cached) {
        if (this.mapCache.terrain?.key !== keys.ground) {
          this.releaseLayer(this.mapCache.terrain);
          const water = [];
          this.mapCache.terrain = { ...this.makeMapLayer(c, ctx => {
            ctx.drawImage(this.terrain, 0, 0, SIZE, SIZE);
            this.drawGroundDetail(ctx, view, water);
          }), key: keys.ground, water };
          this.cacheStats.terrainBuilds++;
        } else this.cacheStats.hits++;
        this.compositeMapLayer(c, this.mapCache.terrain);
        this.drawWater(c, this.mapCache.terrain.water, time);
      } else {
        c.drawImage(this.terrain, 0, 0, SIZE, SIZE);
        const water = []; this.drawGroundDetail(c, view, water); this.drawWater(c, water, time);
      }
      this.drawNations(c, time);
      this.drawNationalBorders(c);
      if (cached) {
        if (this.mapCache.surface?.key !== keys.surface) {
          this.releaseLayer(this.mapCache.surface);
          this.mapCache.surface = { ...this.makeMapLayer(c, ctx => this.drawSurface(ctx, view)), key: keys.surface };
          this.cacheStats.surfaceBuilds++;
        } else this.cacheStats.hits++;
        this.compositeMapLayer(c, this.mapCache.surface);
      } else this.drawSurface(c, view);
      if (z >= .42) {
        if (cached) {
          if (this.mapCache.objects?.key !== keys.objects) this.buildObjectCache(c, view, keys.objects, time);
          else this.cacheStats.hits++;
          for (const run of this.mapCache.objects.runs) {
            if (run.canvas) this.compositeMapLayer(c, run);
            else for (const o of run.objects) this.drawMapObject(c, o, time);
          }
        } else for (const o of this.visibleObjects(view)) this.drawMapObject(c, o, time);
        if (z > .8) this.drawPeople(c, time);
      } else this.drawCitySymbols(c);
      if (this.layer !== 'natural') this.drawDataLayer(c);
      this.drawSelection(c);
      this.drawNationFlags(c);
      this.drawWarFronts(c);
      this.drawPoliticalState(c);
      for(const h of this.state.hostiles||[]){c.save();c.translate(h.x,h.y);const scale=Math.max(1,.6/z);c.scale(scale,scale);c.strokeStyle='#bd9566';c.lineWidth=2;c.beginPath();c.moveTo(0,8);c.lineTo(0,-23);c.stroke();c.fillStyle='#a85443';c.beginPath();c.moveTo(1,-23);c.quadraticCurveTo(18,-27,16,-11);c.lineTo(1,-14);c.fill();c.fillStyle='#927455';c.fillRect(-12,2,10,7);c.fillRect(5,4,9,8);c.restore();}
      if (this.mode === 'build' && this.pointer) this.drawPreview(c);
      c.restore();
      this.drawFog(c, cached ? keys.fog : null);
      const vignette = c.createRadialGradient(this.width / 2, this.height / 2, this.height * .22, this.width / 2, this.height / 2, Math.max(this.width, this.height) * .68);
      vignette.addColorStop(0, '#06101100'); vignette.addColorStop(1, '#07101267');
      c.fillStyle = vignette; c.fillRect(0, 0, this.width, this.height);
      const display = this.ctx;
      display.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      display.imageSmoothingEnabled = false;
      display.drawImage(this.sceneCanvas, 0, 0, this.sceneCanvas.width, this.sceneCanvas.height, 0, 0, this.width, this.height);
      this.drawSettlementLabels(display);
      this.drawExpeditions(display);
      const key = `${this.view.level}:${Math.round(z * 10)}:${Math.round(this._view.x / 100)}:${Math.round(this._view.y / 100)}`;
      if (key !== this.lastNotice) {
        this.lastNotice = key;
        if (this.callbacks.onViewChange) this.callbacks.onViewChange({ ...this.view, label: this.view.level === 'village' ? '聚落视野' : this.view.level === 'region' ? '地区视野' : '已知世界', scale: Math.round(120 / z) });
      }
      this.dirty = false;
    }

    releaseLayer(layer) {
      if (layer?.canvas) { layer.canvas.width = 1; layer.canvas.height = 1; }
    }

    drawSurface(c, view) {
      this.drawRoads(c);
    }

    visibleObjects(view) {
      const objects = [], buildings = [...(this.state.buildings || []), ...this.nationBuildings()], clearing = new Map();
      for (const b of buildings) if (b.status !== 'failed') {
        const key = `${Math.floor(b.x / 128)}:${Math.floor(b.y / 128)}`;
        if (!clearing.has(key)) clearing.set(key, []);
        clearing.get(key).push({ ...b, clearRadius: (clearingRadii[b.type] || 23) * Math.sqrt(b.size || 1) });
      }
      const occupied = tree => {
        const gx = Math.floor(tree.x / 128), gy = Math.floor(tree.y / 128);
        for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++)
          if (clearing.get(`${x}:${y}`)?.some(b => Math.hypot(b.x - tree.x, b.y - tree.y) < b.clearRadius)) return true;
        return false;
      };
      for (const t of this.trees) if (!this.state.forest?.removed[t.id] && this.inView(t, view) && !occupied(t)) objects.push({ ...t, objectType: 'tree' });
      for (const r of this.rocks) if (this.inView(r, view)) objects.push({ ...r, objectType: 'rock' });
      for (const r of this.reeds) if (this.inView(r, view)) objects.push({ ...r, objectType: 'reed' });
      // Keep live references: construction progress changes without rebuilding static runs.
      for (const b of buildings) if (this.inView(b, view)) objects.push({ x: b.x, y: b.y, source: b, objectType: 'building' });
      return objects.sort((a, b) => a.y - b.y);
    }

    dynamicObject(o) {
      if (o.objectType !== 'building') return false;
      const b = o.source;
      return b.status !== 'complete' || ['fire', 'workshop', 'forge', 'windmill', 'watermill', 'machineworks', 'steamplant', 'tram', 'factory'].includes(b.type)
        || (b.type === 'hut' && this.currentEra === 'village' && this._view.zoom > .8);
    }

    drawMapObject(c, o, time) {
      if (o.objectType === 'tree') this.drawTree(c, o);
      else if (o.objectType === 'rock') this.drawRock(c, o);
      else if (o.objectType === 'reed') this.drawReed(c, o);
      else this.drawBuilding(c, o.source, time);
    }

    buildObjectCache(c, view, key, time) {
      for (const run of this.mapCache.objects?.runs || []) this.releaseLayer(run);
      const runs = []; let pending = [], pixels = 0;
      const flush = () => {
        if (!pending.length) return;
        const m = c.getTransform(), bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (const o of pending) {
          const pad = o.objectType === 'building' ? 120 * Math.sqrt(o.source.size || 1) : 2 * o.size + 8;
          bounds.left = Math.min(bounds.left, (o.x - pad) * m.a + m.e);
          bounds.right = Math.max(bounds.right, (o.x + pad) * m.a + m.e);
          bounds.top = Math.min(bounds.top, (o.y - pad) * m.d + m.f);
          bounds.bottom = Math.max(bounds.bottom, (o.y + pad) * m.d + m.f);
        }
        const area = Math.max(0, Math.min(this.sceneCanvas.width, Math.ceil(bounds.right)) - Math.max(0, Math.floor(bounds.left)))
          * Math.max(0, Math.min(this.sceneCanvas.height, Math.ceil(bounds.bottom)) - Math.max(0, Math.floor(bounds.top)));
        const layer = pixels + area <= this.cachePixelLimit ? this.makeMapLayer(c, ctx => {
          for (const o of pending) this.drawMapObject(ctx, o, time);
        }, bounds) : null;
        if (layer) { runs.push(layer); pixels += area; }
        else runs.push({ objects: pending });
        pending = [];
      };
      for (const o of this.visibleObjects(view)) {
        if (this.dynamicObject(o)) { flush(); runs.push({ objects: [o] }); }
        else pending.push(o);
      }
      flush(); this.mapCache.objects = { key, runs, pixels }; this.cacheStats.objectBuilds++;
    }

    inView(o, v) { return o.x > v.left && o.x < v.right && o.y > v.top && o.y < v.bottom; }

    visualEra() {
      if (!this.state) return 'village';
      if (this.state.industrialized || this.state.era === 'industrial' || this.state.era === 'modern') return 'industrial';
      if (this.state.era === 'medieval' || this.state.startEra === 'medieval' || (this.state.settlements || []).some(s => s.population >= 1000)) return 'medieval';
      return 'village';
    }

    nationCities() {
      return (this.state.neighbors||[]).flatMap(n=>n.cities?.length?n.cities.map((c,i)=>({...n,...c,id:c.id,nationId:n.id,capital:i===0,nationName:n.name})): [{...n,nationId:n.id,capital:true,nationName:n.name}]);
    }

    nationBuildings() {
      const nations = this.nationCities().filter(n => this.isExplored(n.x, n.y));
      const key = `${this.seed}:${this.currentEra}:${nations.map(n => `${n.nationId}:${n.id}:${n.assetVersion||0}:${(n.assets||[]).map(b=>b.id+b.status).join(',')}:${n.x}:${n.y}:${n.population >= 1000}:${Math.min(8,Math.max(0,Math.floor(Math.log2(Math.max(1,n.population/1000)))))}`).join('|')}`;
      if (this.foreignBuildingKey === key) return this.foreignBuildings;
      this.foreignBuildingKey = key;
      this.foreignBuildings = [];
      for (const n of nations) {
        if(n.assets?.length){this.foreignBuildings.push(...n.assets.map(b=>({...b,nationId:n.nationId})));continue;}
        const developed = this.currentEra !== 'village' || n.population >= 1000;
        const buildings = [{ x:n.x, y:n.y, type:developed?'castle':'council', size:1.5, status:'complete', nationId:n.nationId }];
        for (let i = 0; i < 28 + 4 * Math.min(8,Math.max(0,Math.floor(Math.log2(Math.max(1,n.population/1000))))); i++) {
          const angle = i * 2.399963 + hash(i, 9, this.seed) * .18;
          const radius = 38 + Math.sqrt(i) * 19;
          const x = n.x + Math.cos(angle) * radius, y = n.y + Math.sin(angle) * radius * .8;
          if (this.sample(x, y).water || buildings.some(b => Math.hypot(b.x-x, b.y-y) < 25)) continue;
          buildings.push({ x, y, type:i===2?'market':i===5?'granary':i===8?'workshop':i>23?'farm':developed?'townhouse':'hut', size:i>23?1:1.25, status:'complete', nationId:n.nationId });
        }
        this.foreignBuildings.push(...buildings);
      }
      return this.foreignBuildings;
    }

    nationColor(n) { return /^#[0-9a-f]{6}$/i.test(n.color || '') ? n.color : '#ba9773'; }

    drawNations(c, time) {
      const home = this.state.settlements?.[0], z = this._view.zoom;
      if (!home) return;
      c.save();
      for (const n of this.nationCities()) {
        if (!this.isExplored(n.x, n.y)) continue;
        const color = this.nationColor(n), radius = n.radius || 230;
        const points = Array.from({length:32}, (_,i) => {
          const a = i * TAU / 32, r = radius * (.94 + noise(Math.cos(a)*2+6,Math.sin(a)*2+6,this.seed+n.x) * .13);
          return {x:n.x+Math.cos(a)*r,y:n.y+Math.sin(a)*r};
        });
        c.beginPath();
        for(let i=0;i<points.length;i++){
          const p=points[i],next=points[(i+1)%points.length],mid={x:(p.x+next.x)/2,y:(p.y+next.y)/2};
          if(!i)c.moveTo(mid.x,mid.y);else c.quadraticCurveTo(p.x,p.y,mid.x,mid.y);
        }
        c.closePath();c.fillStyle=color+'0c';c.fill();
        c.strokeStyle=color+(n.tension>60?'a8':'68');c.lineWidth=1.15/z;c.setLineDash([8/z,6/z]);c.stroke();c.setLineDash([]);
        if(n.capital&&n.tradeOpen&&!n.embargo&&n.tension<65&&n.relation>=15&&!(this.state.warfare?.wars||[]).some(w=>w.nationId===n.nationId)){
          const dx=n.x-home.x,dy=n.y-home.y,bend=Math.min(100,Math.hypot(dx,dy)*.1);
          const path=()=>{c.beginPath();c.moveTo(home.x,home.y);c.bezierCurveTo(home.x+dx*.35-dy*.08,home.y+dy*.35+bend,home.x+dx*.72+dy*.04,home.y+dy*.72-bend*.3,n.x,n.y);};
          c.strokeStyle='#554f372f';c.lineWidth=6;path();c.stroke();
          c.strokeStyle=color+'89';c.lineWidth=1.35/z;c.setLineDash([3/z,7/z]);c.lineDashOffset=-time*.008;path();c.stroke();c.setLineDash([]);c.lineDashOffset=0;
        }
        c.fillStyle='#bba67720';c.beginPath();c.ellipse(n.x,n.y,135,104,-.12,0,TAU);c.fill();
        if(z<.42){
          this.drawCitySymbol(c,n,color);
        }else{
          c.strokeStyle='#af9a6a49';c.lineWidth=4;c.lineCap='round';
          for(let i=0;i<4;i++){const a=i*TAU/4+.3;c.beginPath();c.moveTo(n.x,n.y);c.quadraticCurveTo(n.x+Math.cos(a+.1)*55,n.y+Math.sin(a+.1)*45,n.x+Math.cos(a)*105,n.y+Math.sin(a)*80);c.stroke();}
        }
      }
      c.restore();
    }

    drawNationalBorders(c) {
      const z=this._view.zoom;c.save();
      for(const city of this.state.settlements||[]){
        const radius=city.territoryRadius||city.radius||420;
        c.beginPath();c.ellipse(city.x,city.y,radius,radius*.84,0,0,TAU);c.strokeStyle='rgba(236,232,197,.78)';c.lineWidth=1.7/z;c.setLineDash([]);c.stroke();
      }
      for(const n of this.nationCities()){
        if(!n.capital||!this.isExplored(n.x,n.y))continue;
        const radius=n.radius||230,points=Array.from({length:48},(_,i)=>{const a=i*TAU/48,r=radius*(.94+noise(Math.cos(a)*2+6,Math.sin(a)*2+6,this.seed+n.x)*.13);return{x:n.x+Math.cos(a)*r,y:n.y+Math.sin(a)*r};});
        c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();
        c.strokeStyle='rgba(235,240,218,.72)';c.lineWidth=1.7/z;c.setLineDash([]);c.stroke();
      }
      c.restore();
    }

    drawNationFlags(c) {
      const z=this._view.zoom;
      c.save();
      for(const n of this.nationCities()){
        if(!this.isExplored(n.x,n.y))continue;
        c.save();c.translate(n.x+22,n.y-12);c.scale(Math.max(1,.48/z),Math.max(1,.48/z));
        c.strokeStyle='#c2b18b';c.lineWidth=1.8;c.beginPath();c.moveTo(0,9);c.lineTo(0,-32);c.stroke();
        c.fillStyle=this.nationColor(n);c.beginPath();c.moveTo(1,-32);c.bezierCurveTo(10,-36,18,-28,24,-31);c.lineTo(22,-17);c.bezierCurveTo(13,-14,7,-23,1,-19);c.closePath();c.fill();
        c.fillStyle='#e1d7b5';c.fillRect(7,-28,3,5);c.restore();
      }
      c.restore();
    }

    drawPoliticalState(c){
      const z=this._view.zoom;c.save();
      for(const city of this.state.settlements||[]){const r=this.state.unrest?.regions?.[city.id];if(!r?.strike&&!r?.revolt&&!city.integrationUntil)continue;
        if(r?.strike||r?.revolt){c.save();c.translate(city.x-26,city.y-28);c.scale(1/z,1/z);c.fillStyle=r.revolt?'#c17d61':'#d2b973';c.beginPath();c.arc(0,0,10,0,TAU);c.fill();c.fillStyle='#263127';c.font='bold 14px serif';c.textAlign='center';c.fillText('!',0,5);c.restore();}
        if(city.integrationUntil>this.state.elapsed){c.strokeStyle='#c8b27a66';c.lineWidth=1.2/z;c.setLineDash([6/z,8/z]);c.beginPath();c.ellipse(city.x,city.y,city.territoryRadius||350,(city.territoryRadius||350)*.85,0,0,TAU);c.stroke();c.setLineDash([]);}
      }
      for(const war of this.state.warfare?.wars||[]){for(const [goal,ours] of [[war.goal,true],[war.enemyGoal,false]]){if(goal?.type!=='territory')continue;const city=ours?(this.state.neighbors.find(n=>n.id===war.nationId)?.cities||[]).find(c=>c.id===goal.cityId):this.state.settlements.find(c=>c.id===goal.cityId);if(!city||!this.isExplored(city.x,city.y))continue;
        c.save();c.translate(city.x,city.y);c.scale(1/z,1/z);c.strokeStyle=ours?'#d0bd83':'#c17d61';c.lineWidth=2;c.setLineDash([7,6]);c.beginPath();c.arc(0,0,35,0,TAU);c.stroke();c.setLineDash([]);c.fillStyle=ours?'#e0cfa4':'#e0a68a';c.font='11px sans-serif';c.textAlign='center';c.fillText(ours?'领土目标':'对方领土目标',0,-44);c.restore();
      }}c.restore();
    }

    drawWarFronts(c) {
      const homes=this.state.settlements||[],z=this._view.zoom;
      if(!homes.length)return;
      for(const war of this.state.warfare?.wars||[]){
        const nation=(this.state.neighbors||[]).find(n=>n.id===war.nationId);
        if(!nation)continue;
        const home=homes.reduce((a,b)=>Math.hypot(a.x-nation.x,a.y-nation.y)<Math.hypot(b.x-nation.x,b.y-nation.y)?a:b);
        const x=mix(home.x,nation.x,.55),y=mix(home.y,nation.y,.55);
        if(!this.isExplored(x,y))continue;
        c.save();c.translate(x,y);c.scale(Math.max(1,.55/z),Math.max(1,.55/z));
        c.fillStyle='#342b27d9';c.beginPath();c.ellipse(0,0,20,17,0,0,TAU);c.fill();
        c.strokeStyle='#d2b798';c.lineWidth=2.5;c.lineCap='round';c.beginPath();c.moveTo(-9,10);c.lineTo(9,-11);c.moveTo(9,10);c.lineTo(-9,-11);c.stroke();
        c.strokeStyle='#a96450';c.lineWidth=3;c.beginPath();c.moveTo(-11,5);c.lineTo(-4,11);c.moveTo(11,5);c.lineTo(4,11);c.stroke();
        c.fillStyle='#c4c2a6';c.beginPath();c.moveTo(6,-11);c.lineTo(11,-14);c.lineTo(10,-8);c.moveTo(-6,-11);c.lineTo(-11,-14);c.lineTo(-10,-8);c.fill();c.restore();
      }
    }

    expeditionPoint(e) {
      const progress=clamp(Number(e.progress)||0,0,100)/100;
      return {x:mix(e.fromX,e.x,progress),y:mix(e.fromY,e.y,progress),progress};
    }

    drawExpeditions(c) {
      c.save();c.textAlign='center';c.lineCap='round';
      for(const e of this.state.expeditions||[]){
        const from=this.worldToScreen(e.fromX,e.fromY),to=this.worldToScreen(e.x,e.y),party=this.expeditionPoint(e),p=this.worldToScreen(party.x,party.y);
        c.strokeStyle='#b8b68d70';c.lineWidth=1;c.setLineDash([2,7]);c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();c.setLineDash([]);
        c.strokeStyle='#c0bd9280';c.beginPath();c.arc(to.x,to.y,8,0,TAU);c.stroke();
        c.fillStyle='#1a2b25df';c.beginPath();c.arc(p.x,p.y,11,0,TAU);c.fill();
        c.strokeStyle='#d6c9a0';c.lineWidth=1.5;c.beginPath();c.moveTo(p.x,p.y+4);c.lineTo(p.x,p.y-5);c.lineTo(p.x+5,p.y-2);c.lineTo(p.x,p.y);c.stroke();
        c.strokeStyle='#d6c9a0a0';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,13,-Math.PI/2,-Math.PI/2+TAU*party.progress);c.stroke();
        c.fillStyle='#d5cfb2';c.font='11px sans-serif';c.shadowColor='#06130f';c.shadowBlur=4;c.fillText(`${Math.round(party.progress*100)}%`,p.x,p.y+26);c.shadowBlur=0;
      }
      c.restore();
    }

    drawGroundDetail(c, view, water) {
      const z = this._view.zoom;
      c.save();
      if (z > .6) {
        const step = z > 1 ? 27 : 48;
        for (let y = Math.floor(view.top / step) * step; y < view.bottom; y += step) {
          for (let x = Math.floor(view.left / step) * step; x < view.right; x += step) {
            const s = this.sample(x, y), h = hash(x, y, this.seed);
            if (s.water) {
              if (h < .5) water.push({ x, y });
            } else if(s.region==='arid'){c.strokeStyle='#d9bc773d';c.lineWidth=1.2;c.beginPath();c.moveTo(x-10,y+4);c.quadraticCurveTo(x+5,y-5,x+22,y+3);c.stroke();if(h>.96){c.fillStyle='#777744';c.fillRect(x,y-6,2,9);}} else if(s.landform==='hill'){c.strokeStyle='#c3bd8133';c.lineWidth=1;c.beginPath();c.ellipse(x,y,20+h*12,7+h*5,-.2,Math.PI,Math.PI*2);c.stroke();} else if (!s.mountain) {
              if (h > .82) {
                const patch = c.createRadialGradient(x + 7, y + 5, 1, x + 7, y + 5, 15);
                patch.addColorStop(0, h > .94 ? '#c1b47517' : '#233d2913'); patch.addColorStop(1, '#405c3000');
                c.fillStyle = patch; c.fillRect(x - 9, y - 11, 32, 32);
              }
              c.strokeStyle = h > .65 ? '#b3b97935' : '#293c2c44'; c.lineWidth = .8;
              const dx = h * 14, dy = hash(x, y, this.seed + 3) * 14;
              c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(x + dx - 1, y + dy - 3); c.moveTo(x + dx, y + dy); c.lineTo(x + dx + 2, y + dy - 4); c.stroke();
              if (h > .986) { c.fillStyle = '#d4bf947b'; c.fillRect(x + dx + 2, y + dy - 3, 1.7, 1.7); }
            }
          }
        }
      }
      for (const home of this.state.settlements || []) if (z > .42) {
        const dirt = c.createRadialGradient(home.x, home.y, 12, home.x, home.y, 111);
        dirt.addColorStop(0, '#b6a07324'); dirt.addColorStop(.6, '#ae996820'); dirt.addColorStop(1, '#aa976700');
        c.fillStyle = dirt; c.fillRect(home.x - 115, home.y - 115, 230, 230);
      }
      c.restore();
    }

    drawWater(c, points, time) {
      c.save(); c.strokeStyle = '#a6c8b329'; c.lineWidth = .75 / this._view.zoom;
      for (const {x, y} of points) {
        const shift = Math.sin(time * .0005 + y) * 3;
        c.beginPath(); c.moveTo(x - 4 + shift, y); c.quadraticCurveTo(x + shift, y - 1.4, x + 5 + shift, y); c.stroke();
      }
      c.restore();
    }

    drawRoads(c) {
      const buildings = this.state.buildings || [];
      const settlements = this.state.settlements || [];
      c.save(); c.lineCap = 'round';
      for (let index = 0; index < buildings.length; index++) {
        const b = buildings[index];
        if (b.type === 'fire' || b.status === 'failed') continue;
        const home = settlements.find(s => s.id === b.settlementId) || settlements[0];
        if (!home || Math.hypot(b.x - home.x, b.y - home.y) > 520) continue;
        let from = home, distance = Math.hypot(b.x - home.x, b.y - home.y);
        for (let j = 0; j < index; j++) {
          const previous = buildings[j];
          if (previous.settlementId !== b.settlementId || previous.status === 'failed' || previous.type === 'farm' || previous.type === 'canal') continue;
          const d = Math.hypot(b.x - previous.x, b.y - previous.y);
          if (d < distance) { from = previous; distance = d; }
        }
        const bend = Math.min(18, distance * .18), dx = b.x - from.x, dy = b.y - from.y;
        const offset = (hash(Math.round(b.x), Math.round(b.y), this.seed + 761) - .5) * bend * 2;
        const curve = () => { c.beginPath(); c.moveTo(from.x, from.y); c.bezierCurveTo(from.x + dx * .35 - dy / Math.max(1, distance) * offset, from.y + dy * .35 + dx / Math.max(1, distance) * offset, from.x + dx * .72 + dy / Math.max(1, distance) * offset * .4, from.y + dy * .72 - dx / Math.max(1, distance) * offset * .4, b.x, b.y); };
        const paved = this.currentEra !== 'village' || b.type === 'road';
        c.strokeStyle = paved ? '#414b424f' : '#4a4b333e'; c.lineWidth = b.type === 'path' || b.type === 'road' ? 9 : 5.4; curve(); c.stroke();
        c.strokeStyle = paved ? '#a0a18a70' : '#ad9e7055'; c.lineWidth = b.type === 'path' || b.type === 'road' ? 5 : 2.6; curve(); c.stroke();
      }
      c.restore();
    }

    drawTree(c, o) {
      const s = o.size, n = o.shade;
      c.save(); c.translate(o.x, o.y);
      c.fillStyle = '#13201c4f'; c.beginPath(); c.ellipse(3, 3, s * .9, s * .46, -.35, 0, TAU); c.fill();
      c.fillStyle = '#554f38'; c.fillRect(-1.4, -s * .15, 2.8, s * .45);
      if(o.kind==='palm'){
        c.strokeStyle='#7c7350';c.lineWidth=2.5;c.beginPath();c.moveTo(0,4);c.quadraticCurveTo(-4,-s*.6,0,-s*1.4);c.stroke();
        for(let i=0;i<7;i++){const a=i*TAU/7;c.strokeStyle=i%2?'#4d8060':'#2a6649';c.lineWidth=3;c.beginPath();c.moveTo(0,-s*1.4);c.quadraticCurveTo(Math.cos(a)*s*.6,-s*1.4+Math.sin(a)*s*.5-4,Math.cos(a)*s,-s*1.4+Math.sin(a)*s*.6+5);c.stroke();}
      }else if(o.kind==='dry'){c.strokeStyle='#837d52';c.lineWidth=2;c.beginPath();c.moveTo(0,3);c.lineTo(0,-s);c.moveTo(0,-s*.5);c.lineTo(-s*.3,-s*.7);c.lineTo(-s*.3,-s);c.moveTo(0,-s*.4);c.lineTo(s*.3,-s*.5);c.lineTo(s*.3,-s*.8);c.stroke();}else if (o.kind === 'pine') {
        const greens = n > .55 ? ['#2d4e3c', '#44664a', '#5a7954'] : ['#294839', '#3a5d43', '#4f7050'];
        // Overlapping irregular branch cushions form a broken spruce silhouette;
        // there are no repeated triangle symbols in the canopy.
        for (let i = 5; i >= 0; i--) {
          const y = -s * 1.5 + i * s * .24, wide = s * (.1 + i * .115);
          const sway = (hash(i, Math.round(o.x), this.seed) - .5) * s * .17;
          c.fillStyle = greens[0];
          c.beginPath(); c.moveTo(sway - wide, y + s * .23);
          c.quadraticCurveTo(sway - wide * 1.18, y + s * .1, sway - wide * .66, y + s * .04);
          c.quadraticCurveTo(sway - wide * .48, y - s * .14, sway + wide * .05, y - s * .12);
          c.quadraticCurveTo(sway + wide * .5, y - s * .13, sway + wide * .65, y + s * .02);
          c.quadraticCurveTo(sway + wide * 1.22, y + s * .05, sway + wide, y + s * .22);
          c.quadraticCurveTo(sway + wide * .53, y + s * .35, sway, y + s * .25);
          c.quadraticCurveTo(sway - wide * .5, y + s * .36, sway - wide, y + s * .23); c.fill();
          c.fillStyle = greens[1]; c.beginPath(); c.ellipse(sway - wide * .22, y + s * .06, Math.max(1, wide * .67), s * .15, -.25, 0, TAU); c.fill();
          c.fillStyle = greens[2] + 'a8'; c.beginPath(); c.ellipse(sway - wide * .36, y + s * .015, Math.max(.8, wide * .35), s * .075, -.3, 0, TAU); c.fill();
          for (let j = 0; j < 3; j++) {
            const v = hash(i * 5 + j, Math.round(o.y), this.seed + 727);
            c.fillStyle = j % 2 ? '#8a98613d' : '#183f3266';
            c.fillRect(sway + (v - .55) * wide * 1.6, y + s * .12 + j * .7, 1.4, 1.1);
          }
        }
      } else {
        const greens = n > .65 ? ['#3e5037', '#657345', '#7c8651'] : n > .25 ? ['#334e37', '#496643', '#668053'] : ['#2e4938', '#3e5b43', '#547553'];
        c.fillStyle = greens[0]; c.beginPath(); c.ellipse(0, -s * .62, s * .79, s * .67, -.3, 0, TAU); c.fill();
        for (let i = 0; i < 7; i++) {
          const a = i * 2.399, radius = s * (.2 + (i % 3) * .12), x = Math.cos(a) * radius - s * .12, y = Math.sin(a) * radius * .7 - s * .75;
          c.fillStyle = greens[i < 3 ? 1 : 2] + (i < 3 ? 'ee' : 'c9'); c.beginPath(); c.ellipse(x, y, s * .38, s * .29, a * .2, 0, TAU); c.fill();
        }
        for (let i = 0; i < 8; i++) {
          const a = i * 2.399 + n, radius = s * (.1 + hash(i, Math.round(o.x), this.seed) * .55);
          c.fillStyle = i % 3 ? '#a1ac6b42' : '#1f422f55';
          c.fillRect(Math.cos(a) * radius - s * .2, Math.sin(a) * radius * .7 - s * .76, 1.6, 1.2);
        }
      }
      c.restore();
    }

    drawRock(c, o) {
      c.save(); c.translate(o.x, o.y); const s = o.size;
      c.fillStyle = '#17271c4f'; c.beginPath(); c.ellipse(s * .3, s * .3, s * 1.1, s * .55, 0, 0, TAU); c.fill();
      c.fillStyle = o.shade > .5 ? '#8b9180' : '#747e6f'; c.beginPath(); c.moveTo(-s, s * .3); c.lineTo(-s * .75, -s * .45); c.lineTo(-s * .2, -s * .8); c.quadraticCurveTo(s * .8, -s, s, s * .1); c.lineTo(s * .6, s * .7); c.closePath(); c.fill();
      c.strokeStyle = '#b6b9a36a'; c.lineWidth = .9; c.beginPath(); c.moveTo(-s * .72, -s * .32); c.lineTo(-s * .2, -s * .68); c.lineTo(s * .55, -s * .54); c.stroke(); c.restore();
    }

    drawReed(c, o) {
      c.save(); c.strokeStyle = '#b1aa6e88'; c.lineWidth = .9;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(o.x + i * 1.7, o.y); c.quadraticCurveTo(o.x + i * 1.9, o.y - o.size * .7, o.x + i * 1.6 - 1.5, o.y - o.size); c.stroke(); }
      c.restore();
    }

    drawRegionalBuilding(c,b,land,era){
      if(!['hut','townhouse','apartment','council','granary','school','warehouse','clinic','well'].includes(b.type)||!['arid','tropical','cold'].includes(land.region))return false;
      const big=!['hut','well'].includes(b.type),w=b.type==='apartment'?38:big?28:19,h=big?25:17;
      if(land.region==='arid'){
        c.fillStyle='#433b2855';c.beginPath();c.ellipse(4,8,w*.8,9,0,0,TAU);c.fill();
        c.fillStyle='#bba078';c.fillRect(-w/2,-h/2,w,h);c.fillStyle='#947a54';c.fillRect(w/2-5,-h/2,5,h);
        c.fillStyle='#d0b68a';c.fillRect(-w/2-2,-h/2-4,w+4,5);c.fillStyle='#8b754e';c.fillRect(-w/2+3,-h/2+2,w-6,3);
        c.fillStyle='#574d37';c.fillRect(-3,h/2-9,6,9);for(let i=0;i<(big?3:1);i++)c.fillRect(-w/2+4+i*8,-3,3,4);
        c.fillStyle='#ad7958';c.beginPath();c.ellipse(w/2+6,8,4,6,0,0,TAU);c.fill();
      }else if(land.region==='tropical'){
        c.strokeStyle='#8c7954';c.lineWidth=2;for(const x of [-w/2+3,w/2-3]){c.beginPath();c.moveTo(x,14);c.lineTo(x,-h/2);c.stroke();}
        c.fillStyle='#a39567';c.fillRect(-w/2,-h/2+5,w,h*.65);c.fillStyle='#6c5f40';c.fillRect(-3,1,5,8);
        c.fillStyle='#6c7951';c.beginPath();c.moveTo(-w/2-6,0);c.lineTo(0,-h-7);c.lineTo(w/2+6,0);c.closePath();c.fill();
        c.strokeStyle='#a1a071';c.lineWidth=.8;for(let i=-3;i<4;i++){c.beginPath();c.moveTo(i*3,-h+Math.abs(i)*3);c.lineTo(i*5,-1);c.stroke();}
        c.fillStyle='#887b53';c.fillRect(-w/2-3,9,w+6,2);c.strokeStyle='#99a077';c.beginPath();c.moveTo(w/2+5,9);c.lineTo(w/2+10,17);c.stroke();
      }else{
        this.drawRoofBlock(c,0,0,w,h,'#8a8b7c','#5b6f6c');c.fillStyle='#d2d7c7';c.beginPath();c.moveTo(-w/2-2,-h/2);c.lineTo(0,-h+3);c.lineTo(w/2+2,-h/2);c.lineTo(0,-h/2-3);c.fill();
      }
      if(b.type==='well'){c.fillStyle='#2e4c4c';c.beginPath();c.ellipse(0,2,6,4,0,0,TAU);c.fill();}
      if(['council','school','clinic'].includes(b.type)){c.fillStyle=b.type==='clinic'?'#b0bf9b':'#ae6c4b';c.fillRect(-w/2-4,-h-5,2,16);c.fillRect(-w/2-2,-h-5,7,5);}
      if(b.type==='warehouse'){for(let i=0;i<3;i++){c.fillStyle='#9c8358';c.fillRect(-14+i*9,10,8,7);c.strokeStyle='#655b3f';c.strokeRect(-14+i*9,10,8,7);}}
      if(b.type==='granary'){c.fillStyle='#b9a56c';for(const x of [-12,0,12]){c.beginPath();c.ellipse(x,13,5,7,0,0,TAU);c.fill();}c.fillStyle='#736e45';c.fillRect(-17,8,34,2);}
      if(b.type==='school'){c.fillStyle='#c8c6a1';c.fillRect(-7,7,14,6);c.strokeStyle='#6d7358';c.beginPath();c.moveTo(0,7);c.lineTo(0,13);c.stroke();}
      if(b.type==='clinic'){c.fillStyle='#d1d4bc';c.fillRect(-5,-4,10,3);c.fillRect(-1,-8,3,11);}
      if(b.type==='townhouse'){c.fillStyle='#9b7359';c.fillRect(-13,5,26,3);c.fillStyle='#d2bf8b';for(const x of [-9,5])c.fillRect(x,-5,4,4);}
      if(b.type==='apartment'){c.fillStyle='#c6c9aa';for(let i=0;i<4;i++)for(let j=0;j<2;j++)c.fillRect(-15+i*8,-7+j*8,3,4);}
      if(era==='industrial'&&b.type!=='well'){c.fillStyle='#786d59';c.fillRect(w/2-6,-h-8,4,12);c.fillStyle='#bbc0a4';c.fillRect(w/2-7,-h-9,6,2);}
      return true;
    }

    drawBuilding(c, b, time) {
      if (b.status === 'failed') {c.save();c.translate(b.x,b.y);c.scale(Math.sqrt(b.size||1),Math.sqrt(b.size||1));for(let i=0;i<12;i++){c.fillStyle=i%2?'#817961':'#555c4a';c.fillRect(-17+i%4*9,-9+Math.floor(i/4)*8,7,5);}c.restore();return;}
      const size = Number(b.size) || 1, scale = Math.sqrt(size);
      c.save(); c.translate(b.x, b.y); c.scale(scale, scale);
      if(b.civicHall){this.drawRoofBlock(c,0,0,38,32,'#c4b694','#806a55');c.fillStyle='#cfb274';c.fillRect(-20,-40,3,27);c.fillStyle='#dfbf72';c.fillRect(-17,-40,17,9);c.fillStyle='#f4dfaa';c.font='bold 10px sans-serif';c.textAlign='center';c.fillText('市政',0,6);c.restore();return;}
      const demolishing=b.status==='demolishing';
      const incomplete = !demolishing&&b.status !== 'complete' && Number(b.progress) < 100;
      if(demolishing)c.globalAlpha=.42;
      if (incomplete) c.globalAlpha = .65;
      const era = this.currentEra || this.visualEra(),land={...this.sample(b.x,b.y),region:window.CivilEngine.settlementArchitecture(this.state,b)};
      if(land.landform==='hill'){c.fillStyle='#878371';for(let i=0;i<3;i++)c.fillRect(-19+i*2,8+i*3,38-i*4,2);}
      if(this.drawRegionalBuilding(c,b,land,era)){}
      else if(b.type==='bronzesmith'){this.drawLogistics(c,'toolworks');c.fillStyle='#85ad8b';c.fillRect(5,7,10,3);}
      else if (['coppermine','goldmine'].includes(b.type)){this.drawLogistics(c,'ironmine');c.fillStyle=b.type==='goldmine'?'#e2bd67':'#78b698';for(let i=0;i<5;i++)c.fillRect(8+i*3,-3+i%2*4,3,2);}
      else if (['claypit','ironmine','coalmine','toolworks','weaving','apothecary','storehouse'].includes(b.type)) this.drawLogistics(c,b.type);
      else if (b.type === 'fire') this.drawFire(c, time);
      else if (['bank','mint','exchange','postoffice'].includes(b.type)) this.drawCommerce(c,b.type);
      else if (b.type === 'brickhouse') this.drawBrickHouse(c);
      else if (['shrine','temple','plaza','theater','printing','museum'].includes(b.type)) this.drawCulture(c,b.type,time);
      else if (['manor','castle','guildhall','inn','taxoffice','barracks'].includes(b.type)) this.drawMedievalCivic(c,b.type,era);
      else if (['harbor','fair','road','aqueduct','sewer','tram'].includes(b.type)) this.drawInfrastructure(c,b.type,time,era);
      else if(b.type==='adobe')this.drawRoofBlock(c,0,0,25,21,'#c4ac83','#a98d67');
      else if (b.type === 'hut' && era !== 'village') { if(era === 'industrial') this.drawBrickHouse(c); else this.drawRoofBlock(c,0,0,24,23,'#a59c7f','#906d51'); }
      else if (era !== 'village' && ['council','granary','workshop','school','forge','library','lumber'].includes(b.type)) this.drawEraCivic(c,b.type,time,era);
      else if (b.type === 'farm') this.drawFarm(c, b);
      else if (b.type === 'estate') this.drawEstate(c);
      else if (b.type === 'quarry') this.drawQuarry(c);
      else if (b.type === 'market') this.drawMarket(c);
      else if (b.type === 'canal') this.drawCanal(c);
      else if (['palisade','watchtower','wall'].includes(b.type)) this.drawDefense(c,b.type);
      else if (b.type === 'windmill' || b.type === 'watermill') this.drawMill(c,b.type,incomplete?0:time);
      else if (b.type === 'townhouse' || b.type === 'apartment') this.drawDenseHousing(c,b.type);
      else if (['warehouse','clinic','academy','publicschool'].includes(b.type)) this.drawCivic(c,b.type);
      else if (['machineworks','railstation','steamplant'].includes(b.type)) this.drawIndustrial(c,b.type,incomplete?0:time);
      else if (['factory', 'hospital', 'power', 'research'].includes(b.type)) this.drawModern(c, b.type, time);
      else if (b.type === 'path' && era !== 'village') this.drawInfrastructure(c,'road',time,era);
      else if (b.type === 'path' || b.type === 'bridge') this.drawBridge(c, b.type);
      else if (b.type === 'well') this.drawWell(c);
      else {
        const big = ['council', 'granary', 'workshop', 'school', 'forge', 'library', 'laboratory'].includes(b.type);
        const w = big ? 25 : 17, h = big ? 24 : 19;
        const angle = (hash(Math.round(b.x), Math.round(b.y), this.seed) - .5) * .35;
        c.rotate(angle);
        c.fillStyle = '#1620175e'; c.beginPath(); c.ellipse(4, 6, w * .8, h * .55, -.25, 0, TAU); c.fill();
        c.fillStyle = '#856d4d'; c.fillRect(-w / 2 + 1, -h / 2 + 4, w - 2, h - 1);
        c.fillStyle = '#5f4d36'; c.fillRect(w / 2 - 2, -h / 2 + 4, 4, h - 1);
        c.fillStyle = b.type === 'workshop' || b.type === 'factory' ? '#777c6f' : '#b19b6c';
        c.beginPath(); c.moveTo(-w / 2 - 3, -h / 2); c.lineTo(-w / 2 + 1, -h / 2 - 5); c.lineTo(w / 2 + 3, -h / 2 - 3); c.lineTo(w / 2 + 3, h / 2 - 1); c.lineTo(-w / 2 - 3, h / 2 - 3); c.closePath(); c.fill();
        c.fillStyle = b.type === 'workshop' || b.type === 'factory' ? '#555e55' : '#8a754c';
        c.beginPath(); c.moveTo(1, -h / 2 - 4); c.lineTo(w / 2 + 3, -h / 2 - 3); c.lineTo(w / 2 + 3, h / 2 - 1); c.lineTo(1, h / 2 - 2); c.closePath(); c.fill();
        c.strokeStyle = '#d2bc8859'; c.lineWidth = .65;
        for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(-w / 2 - 1 + i * w / 8, -h / 2 - 2); c.lineTo(-w / 2 - 1 + i * w / 8, h / 2 - 4); c.stroke(); }
        c.strokeStyle = '#d5bf8c'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(1, -h / 2 - 4); c.lineTo(1, h / 2 - 2); c.stroke();
        c.fillStyle = '#322c22'; c.fillRect(-3, h / 2 + .5, 4.5, 4);
        c.fillStyle = '#da9a4c'; c.fillRect(-w / 2 + 3, h / 2 + .6, 2, 1.7);
        if (b.type === 'lumber') {
          c.fillStyle = '#a2885c'; c.strokeStyle = '#53472f'; c.lineWidth = .6;
          for (let i = 0; i < 4; i++) { c.fillRect(w / 2 + 5, i * 2.8 - 2, 11, 2); c.beginPath(); c.arc(w / 2 + 5, i * 2.8 - 1, 1.5, 0, TAU); c.stroke(); }
        }
        if (b.type === 'granary') { c.fillStyle = '#c8b07c'; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(w / 2 + 6 + i * 3, 8, 2, 3.5, -.2, 0, TAU); c.fill(); } }
        if (b.type === 'forge') {
          c.fillStyle = '#605f4e'; c.fillRect(w / 2 - 1, -h / 2 - 8, 5, 14); c.fillStyle = '#d18b4b'; c.fillRect(w / 2, -h / 2 - 8, 3, 2); this.drawSmoke(c, w / 2 + 1, -h / 2 - 8, time, b.x);
        }
        if (b.type === 'council') { c.strokeStyle = '#74613e'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-w / 2 - 5, 6); c.lineTo(-w / 2 - 5, -21); c.stroke(); c.fillStyle = '#ac7250'; c.beginPath(); c.moveTo(-w / 2 - 5, -21); c.quadraticCurveTo(-w / 2 - 11, -20, -w / 2 - 7, -15); c.lineTo(-w / 2 - 5, -16); c.fill(); }
        if (!incomplete && this._view.zoom > .8 && (b.type === 'hut' || b.type === 'workshop')) this.drawSmoke(c, w / 2 - 2, -h / 2 - 1, time, b.x);
      }
      if(demolishing){c.globalAlpha=1;c.fillStyle='#ccaa76';for(let i=0;i<4;i++)c.fillRect(-18+i*12,15,7,3);c.fillStyle='#263429';c.fillRect(-18,21,36,3);c.fillStyle='#cfaa77';c.fillRect(-18,21,36*(b.demolition?.progress||0)/100,3);}
      if (incomplete) {
        c.globalAlpha = .88; c.strokeStyle = '#b5a67e'; c.lineWidth = 1;
        for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 12, -16); c.lineTo(i * 12 + 1, 16); c.stroke(); }
        c.beginPath(); c.moveTo(-16, -11); c.lineTo(16, -10); c.moveTo(-16, 8); c.lineTo(16, 9); c.stroke();
        c.fillStyle = '#171e17a0'; c.fillRect(-15, 21, 30, 2); c.fillStyle = '#ccb684'; c.fillRect(-15, 21, 30 * clamp(Number(b.progress || 0) / 100, 0, 1), 2);
      }
      c.restore();
    }

    drawLogistics(c,type){
      c.save();c.rotate(-.07);
      c.fillStyle='#26342775';c.beginPath();c.ellipse(3,10,34,21,0,0,TAU);c.fill();
      if(type==='claypit'){
        c.fillStyle='#a18b66';c.beginPath();c.ellipse(-2,3,28,19,0,0,TAU);c.fill();
        c.fillStyle='#70573f';c.beginPath();c.ellipse(-3,4,18,11,0,0,TAU);c.fill();
        c.fillStyle='#bc956b';for(let i=0;i<7;i++)c.fillRect(-22+i*7,15+(i%2)*3,5,4);
        c.strokeStyle='#bdac83';c.lineWidth=2;c.beginPath();c.moveTo(17,-16);c.lineTo(25,11);c.moveTo(10,-10);c.lineTo(25,-14);c.stroke();
      }else if(type==='ironmine'||type==='coalmine'){
        c.fillStyle=type==='ironmine'?'#8b8770':'#606c5d';c.beginPath();c.moveTo(-34,16);c.quadraticCurveTo(-26,-37,4,-29);c.quadraticCurveTo(24,-24,35,17);c.closePath();c.fill();
        c.fillStyle='#26372c';c.fillRect(-12,-7,25,25);c.strokeStyle='#b09a6a';c.lineWidth=4;c.strokeRect(-14,-11,29,29);
        c.strokeStyle='#8c9983';c.lineWidth=1.6;for(const x of [-7,8]){c.beginPath();c.moveTo(x,8);c.lineTo(x+6,29);c.stroke();}
        c.fillStyle='#8c7752';c.fillRect(9,15,17,10);c.fillStyle=type==='ironmine'?'#a27853':'#34443b';c.fillRect(11,12,13,7);c.fillStyle='#344139';c.fillRect(10,25,4,3);c.fillRect(21,25,4,3);
      }else{
        this.drawRoofBlock(c,0,-2,type==='storehouse'?43:33,29,'#a0997d',type==='apothecary'?'#71826a':'#827753');
        if(type==='storehouse'){
          c.fillStyle='#8c7951';for(let i=0;i<5;i++){c.fillRect(-27+i*11,15,9,9);c.strokeStyle='#b49d6e';c.lineWidth=.8;c.strokeRect(-27+i*11,15,9,9);}
        }else if(type==='toolworks'){
          c.fillStyle='#69776a';c.fillRect(-6,10,14,5);c.fillRect(-2,14,6,6);c.fillRect(-9,8,20,3);c.strokeStyle='#c3aa79';c.lineWidth=2;c.beginPath();c.moveTo(19,2);c.lineTo(14,18);c.stroke();c.fillStyle='#829283';c.fillRect(14,-1,11,5);
        }else if(type==='weaving'){
          c.strokeStyle='#b5a073';c.lineWidth=2;c.strokeRect(-18,6,24,20);c.fillStyle='#c4bb95';c.fillRect(-15,9,18,13);c.strokeStyle='#8f866b';c.lineWidth=.7;for(let i=0;i<8;i++){c.beginPath();c.moveTo(-14+i*2,9);c.lineTo(-14+i*2,23);c.stroke();}
          c.fillStyle='#8eaa96';c.fillRect(13,11,11,10);c.fillStyle='#b28a7b';c.fillRect(14,18,12,5);
        }else{
          c.fillStyle='#bfc6a0';c.fillRect(9,-6,4,13);c.fillRect(5,-2,12,4);
          c.fillStyle='#665e42';c.fillRect(-25,14,49,10);for(let i=0;i<9;i++){c.fillStyle=i%3?'#839562':'#b9a279';c.fillRect(-23+i*5,10-i%2*3,3,9);}
        }
      }
      c.restore();
    }

    drawBrickHouse(c) {
      c.save();c.rotate(-.07);
      this.drawRoofBlock(c,0,-2,31,28,'#a18369','#65776c');
      c.fillStyle='#806953';c.fillRect(-15,9,30,8);
      c.strokeStyle='#c0a18377';c.lineWidth=.65;
      for(let y=-10;y<17;y+=5)for(let x=-14+(y%2)*3;x<14;x+=8){c.beginPath();c.moveTo(x,y);c.lineTo(x+6,y);c.stroke();}
      for(const x of [-10,7]){c.fillStyle='#3e5c53';c.fillRect(x,5,5,6);c.fillStyle='#c5b18b';c.fillRect(x-1,11,7,1);}
      c.fillStyle='#645e50';c.fillRect(6,-29,5,13);c.fillStyle='#9e9680';c.fillRect(5,-30,7,3);
      c.fillStyle='#b5aa8a';c.fillRect(-17,16,34,2);c.restore();
    }

    drawEraCivic(c,type,time,era) {
      c.save();c.rotate(-.06);
      const industrial=era==='industrial';
      const w=type==='granary'?33:type==='council'?40:32;
      this.drawRoofBlock(c,0,0,w,26,industrial?'#a08e74':'#aaa384',industrial?'#6b7b70':'#8d6f52');
      c.fillStyle='#4a5848';for(const x of [-w/2+5,w/2-10])c.fillRect(x,8,5,5);
      if(type==='council'){
        c.fillStyle='#a59c7c';c.fillRect(-6,-28,12,14);c.fillStyle='#5a6b59';c.beginPath();c.moveTo(-9,-27);c.lineTo(0,-35);c.lineTo(9,-27);c.fill();
        c.strokeStyle='#b8a377';c.lineWidth=1.4;c.beginPath();c.moveTo(-w/2-6,10);c.lineTo(-w/2-6,-19);c.stroke();c.fillStyle='#ae805d';c.beginPath();c.moveTo(-w/2-6,-19);c.quadraticCurveTo(-w/2+10,-23,-w/2+7,-11);c.lineTo(-w/2-6,-10);c.fill();
      }else if(type==='granary'){
        c.fillStyle='#b9ae85';for(let i=0;i<3;i++){c.beginPath();c.ellipse(19+i*5,9,4,7,-.15,0,TAU);c.fill();}
        c.strokeStyle='#8a7958';c.lineWidth=1;for(let i=0;i<3;i++){c.beginPath();c.moveTo(16+i*5,9);c.lineTo(22+i*5,9);c.stroke();}
      }else if(type==='workshop'||type==='forge'){
        c.fillStyle='#59665a';c.fillRect(8,-29,6,15);c.fillStyle='#918e76';c.fillRect(7,-31,8,3);this.drawSmoke(c,11,-32,time,32);
        c.fillStyle='#514738';c.fillRect(-11,8,12,9);c.fillStyle=type==='forge'?'#d29558':'#b2a06e';c.fillRect(-9,10,8,4);
        c.strokeStyle='#c2b38c';c.lineWidth=1;c.beginPath();c.moveTo(18,5);c.lineTo(25,14);c.moveTo(25,5);c.lineTo(18,14);c.stroke();
      }else if(type==='library'||type==='school'){
        c.fillStyle='#c8be98';c.fillRect(-7,6,14,8);c.strokeStyle='#7b8466';c.lineWidth=1;c.beginPath();c.moveTo(0,6);c.lineTo(0,14);c.moveTo(-5,8);c.lineTo(-2,9);c.moveTo(2,9);c.lineTo(5,8);c.stroke();
      }else if(type==='lumber'){
        c.fillStyle='#9d825b';for(let i=0;i<4;i++){c.fillRect(19,-3+i*4,15,3);c.fillStyle='#c0a376';c.beginPath();c.arc(19,-1.5+i*4,2,0,TAU);c.fill();c.fillStyle='#9d825b';}
      }
      c.restore();
    }

    drawCulture(c,type,time) {
      c.save();c.rotate(-.08);
      if(type==='shrine'){
        c.fillStyle='#9d967257';c.beginPath();c.ellipse(0,4,19,13,-.1,0,TAU);c.fill();
        for(let i=0;i<7;i++){const a=i*TAU/7,x=Math.cos(a)*12,y=Math.sin(a)*8;c.fillStyle=i%2?'#a5a282':'#828e76';c.beginPath();c.ellipse(x,y-2,3,6,a*.05,0,TAU);c.fill();}
        c.fillStyle='#b1ab87';c.beginPath();c.moveTo(-5,4);c.lineTo(-4,-15);c.quadraticCurveTo(0,-20,4,-15);c.lineTo(5,4);c.fill();
        c.strokeStyle='#d2bb87';c.lineWidth=1;c.beginPath();c.arc(0,-7,2,0,TAU);c.stroke();
        c.fillStyle='#ca9d5e';c.fillRect(-9,7,4,2);c.restore();return;
      }
      if(type==='plaza'){
        c.fillStyle='#aea485';c.beginPath();c.ellipse(0,3,29,20,-.08,0,TAU);c.fill();
        c.strokeStyle='#747e6959';c.lineWidth=.8;for(let i=-20;i<=20;i+=7){c.beginPath();c.moveTo(i,-11);c.quadraticCurveTo(i-4,3,i+2,18);c.stroke();}
        c.fillStyle='#b7b59a';c.beginPath();c.ellipse(0,0,12,8,0,0,TAU);c.fill();c.fillStyle='#557a72';c.beginPath();c.ellipse(0,-1,9,5,0,0,TAU);c.fill();
        c.fillStyle='#c6c5a4';c.fillRect(-2,-11,4,11);c.beginPath();c.ellipse(0,-11,5,3,0,0,TAU);c.fill();
        c.strokeStyle='#a0bbab';c.lineWidth=1;c.beginPath();c.moveTo(-2,-11);c.quadraticCurveTo(-8,-6,-6,-2);c.moveTo(2,-11);c.quadraticCurveTo(8,-6,6,-2);c.stroke();
        for(const x of [-21,17]){c.fillStyle='#9b8056';c.fillRect(x,9,10,3);c.fillStyle='#655e43';c.fillRect(x+1,12,2,3);c.fillRect(x+7,12,2,3);}c.restore();return;
      }
      if(type==='theater'){
        c.fillStyle='#ad9c7899';c.beginPath();c.ellipse(0,2,33,25,0,0,TAU);c.fill();
        for(let i=0;i<4;i++){c.strokeStyle=i%2?'#b6aa86':'#807e61';c.lineWidth=3;c.beginPath();c.ellipse(0,2,30-i*5,22-i*4,0,.05*Math.PI,.95*Math.PI);c.stroke();}
        this.drawRoofBlock(c,0,-17,47,16,'#a79777','#78664f');c.fillStyle='#654e41';c.fillRect(-16,-10,32,10);c.fillStyle='#a36f56';c.fillRect(-15,-10,7,9);c.fillRect(8,-10,7,9);c.restore();return;
      }
      if(type==='temple'){
        this.drawRoofBlock(c,-18,1,13,32,'#ada786','#687d70');this.drawRoofBlock(c,18,1,13,32,'#ada786','#687d70');this.drawRoofBlock(c,0,-5,34,33,'#b3a789','#84765e');
        c.fillStyle='#bcb291';c.beginPath();c.ellipse(0,-23,14,11,0,Math.PI,TAU);c.lineTo(14,-19);c.lineTo(-14,-19);c.fill();c.fillStyle='#7b8c76';c.beginPath();c.ellipse(0,-23,11,8,0,Math.PI,TAU);c.lineTo(11,-22);c.lineTo(-11,-22);c.fill();
        c.fillStyle='#bcb291';c.fillRect(-1,-37,2,6);c.beginPath();c.arc(0,-38,2,0,TAU);c.fill();
        c.fillStyle='#3b5145';c.beginPath();c.moveTo(-5,15);c.lineTo(-5,6);c.quadraticCurveTo(0,-1,5,6);c.lineTo(5,15);c.fill();
        c.fillStyle='#b4ab8c';for(let i=0;i<3;i++)c.fillRect(-13-i*2,16+i*2,26+i*4,2);c.restore();return;
      }
      if(type==='printing'){
        this.drawRoofBlock(c,0,0,36,28,'#a3977c','#6b7e70');
        c.fillStyle='#c4b58d';c.fillRect(-22,9,17,8);c.fillStyle='#4d5947';c.fillRect(-20,5,13,3);c.fillRect(-19,3,2,12);c.fillRect(-10,3,2,12);
        c.strokeStyle='#d1c6a2';c.lineWidth=1;c.beginPath();c.moveTo(-18,10);c.lineTo(-10,10);c.moveTo(-18,13);c.lineTo(-12,13);c.stroke();
        c.fillStyle='#c3b898';c.fillRect(19,4,10,12);c.fillStyle='#8c957b';for(let i=0;i<3;i++)c.fillRect(21,6+i*3,6,1);c.restore();return;
      }
      this.drawRoofBlock(c,0,-6,58,33,'#b2ae91','#687e73');
      c.fillStyle='#c0b895';c.beginPath();c.moveTo(-32,2);c.lineTo(0,-12);c.lineTo(32,2);c.fill();c.fillStyle='#747f66';c.beginPath();c.moveTo(-27,2);c.lineTo(0,-8);c.lineTo(27,2);c.fill();
      for(let x=-23;x<=23;x+=11){c.fillStyle='#c2bda0';c.fillRect(x-2,3,4,16);c.fillStyle='#d0c7a3';c.fillRect(x-3,3,6,2);c.fillRect(x-3,17,6,2);}
      c.fillStyle='#a7a386';for(let i=0;i<3;i++)c.fillRect(-30-i*2,20+i*2,60+i*4,2);c.restore();
    }

    drawCommerce(c,type) {
      c.save();c.rotate(-.08);
      c.fillStyle='#13221855';c.beginPath();c.ellipse(3,10,35,21,0,0,TAU);c.fill();
      if(type==='bank'){
        this.drawRoofBlock(c,0,-3,48,33,'#a8a68c','#63776a');
        c.fillStyle='#bdb497';c.fillRect(-27,15,54,4);c.fillRect(-24,11,48,3);
        for(const x of [-19,-8,7,18]){c.fillStyle='#c3bb9d';c.fillRect(x,-1,3,15);c.fillRect(x-1,-3,5,3);}
        c.fillStyle='#3c5144';c.fillRect(-3,2,6,11);c.fillStyle='#baa66e';c.beginPath();c.arc(0,-14,3,0,TAU);c.fill();
      }else if(type==='mint'){
        this.drawRoofBlock(c,-3,-3,35,29,'#979a80','#7c6d55');
        c.fillStyle='#555e51';c.fillRect(8,-30,6,21);c.fillStyle='#d39852';c.fillRect(9,-10,4,4);
        c.fillStyle='#c5ae72';for(let i=0;i<4;i++){c.beginPath();c.ellipse(24,11-i*2,6,2,0,0,TAU);c.fill();}
        c.fillStyle='#9f936d';c.fillRect(-14,11,15,5);c.strokeStyle='#524c38';c.lineWidth=2;c.beginPath();c.moveTo(-6,8);c.lineTo(-6,17);c.stroke();
      }else if(type==='exchange'){
        this.drawRoofBlock(c,-17,-4,20,32,'#ac9e7e','#866d52');this.drawRoofBlock(c,17,-4,20,32,'#ac9e7e','#866d52');
        c.fillStyle='#b9af8b';c.fillRect(-10,-12,20,13);c.fillStyle='#536856';c.fillRect(-7,-10,14,9);c.strokeStyle='#c5b582';c.lineWidth=1;c.beginPath();c.moveTo(-5,-7);c.lineTo(5,-7);c.moveTo(-5,-4);c.lineTo(2,-4);c.stroke();
        c.fillStyle='#a08559';for(const x of [-8,3])c.fillRect(x,7,8,7);
      }else{
        this.drawRoofBlock(c,0,-3,34,27,'#b0a184','#7c775d');
        c.fillStyle='#475e4d';c.fillRect(-5,5,9,10);c.fillStyle='#beaf85';c.fillRect(-19,-5,13,8);
        c.strokeStyle='#736749';c.lineWidth=1;c.beginPath();c.moveTo(-18,-4);c.lineTo(-12,0);c.lineTo(-7,-4);c.stroke();
        c.strokeStyle='#a7976e';c.lineWidth=2;c.beginPath();c.moveTo(23,14);c.lineTo(23,-24);c.stroke();c.fillStyle='#a66e51';c.beginPath();c.moveTo(24,-24);c.quadraticCurveTo(39,-27,35,-16);c.lineTo(24,-16);c.fill();
      }
      c.restore();
    }

    drawMedievalCivic(c,type,era) {
      c.save();c.rotate(-.08);
      if(type==='castle'){
        c.fillStyle='#18271b58';c.beginPath();c.ellipse(5,8,46,29,-.1,0,TAU);c.fill();
        c.fillStyle='#7e8974';c.fillRect(-33,-13,66,30);c.fillStyle='#a3a48b';c.fillRect(-33,-15,66,5);
        for(const x of [-29,29]){c.fillStyle='#8b947c';c.fillRect(x-8,-28,16,45);c.fillStyle='#b5b197';c.fillRect(x-9,-31,18,5);for(let k=-8;k<=5;k+=6)c.fillRect(x+k,-35,4,6);c.fillStyle='#4e604f';c.fillRect(x-2,-23,4,7);}
        this.drawRoofBlock(c,0,-15,31,36,'#a6a58b','#6a7d71');c.fillStyle='#a9a98c';c.fillRect(-7,-44,14,19);c.fillStyle='#62796b';c.beginPath();c.moveTo(-11,-43);c.lineTo(0,-57);c.lineTo(11,-43);c.fill();
        c.fillStyle='#3e4f40';c.beginPath();c.moveTo(-6,18);c.lineTo(-6,7);c.quadraticCurveTo(0,-2,6,7);c.lineTo(6,18);c.fill();
        c.strokeStyle='#a58f65';c.lineWidth=1;for(let x=-5;x<6;x+=3){c.beginPath();c.moveTo(x,7);c.lineTo(x,17);c.stroke();}
        c.strokeStyle='#b5a77d';c.beginPath();c.moveTo(1,-53);c.lineTo(1,-67);c.stroke();c.fillStyle='#a97857';c.beginPath();c.moveTo(2,-67);c.quadraticCurveTo(16,-70,14,-60);c.lineTo(2,-59);c.fill();c.restore();return;
      }
      if(type==='manor'){
        c.fillStyle='#b1a1722b';c.beginPath();c.ellipse(0,8,42,28,0,0,TAU);c.fill();
        this.drawRoofBlock(c,-22,3,19,29,'#a59e7e','#806b4e');this.drawRoofBlock(c,22,3,19,29,'#a59e7e','#806b4e');this.drawRoofBlock(c,0,-10,42,26,'#b2a586','#916e50');
        c.fillStyle='#6c7b56';c.beginPath();c.ellipse(0,14,14,9,0,0,TAU);c.fill();c.fillStyle='#a49b72';c.beginPath();c.ellipse(0,14,5,3,0,0,TAU);c.fill();
        c.strokeStyle='#7d7752';c.lineWidth=2;c.beginPath();c.moveTo(-36,20);c.quadraticCurveTo(0,34,36,20);c.stroke();c.restore();return;
      }
      if(type==='barracks'){
        this.drawRoofBlock(c,-15,0,20,37,'#969c81',era==='industrial'?'#687b6d':'#846d4f');this.drawRoofBlock(c,15,0,20,37,'#969c81',era==='industrial'?'#687b6d':'#846d4f');
        c.fillStyle='#c0ad7f';c.fillRect(-10,-2,20,22);c.strokeStyle='#8c7956';c.lineWidth=1;c.beginPath();c.moveTo(-5,13);c.lineTo(5,3);c.moveTo(-5,3);c.lineTo(5,13);c.stroke();
        c.strokeStyle='#b1a070';c.lineWidth=1.5;c.beginPath();c.moveTo(1,-16);c.lineTo(1,-37);c.stroke();c.fillStyle='#a46c51';c.beginPath();c.moveTo(2,-37);c.quadraticCurveTo(17,-40,14,-28);c.lineTo(2,-27);c.fill();c.restore();return;
      }
      const inn=type==='inn',tax=type==='taxoffice';
      this.drawRoofBlock(c,0,-2,inn?32:42,inn?29:32,tax?'#aaa58a':'#a89b7c',tax?'#6f8271':'#8a6b50');
      c.fillStyle='#4b5d4c';for(const x of [-14,-5,5,14])c.fillRect(x,7,4,5);
      if(inn){c.strokeStyle='#a28b5c';c.lineWidth=1.5;c.beginPath();c.moveTo(-20,-12);c.lineTo(-20,4);c.lineTo(-28,4);c.stroke();c.fillStyle='#b9a06e';c.fillRect(-30,5,11,9);c.fillStyle='#746149';c.fillRect(-27,7,5,4);}
      else if(tax){c.fillStyle='#c2b58f';c.fillRect(-7,5,14,10);c.strokeStyle='#756c4d';c.lineWidth=1;c.beginPath();c.moveTo(-4,8);c.lineTo(4,8);c.moveTo(-4,11);c.lineTo(4,11);c.stroke();c.fillStyle='#b7a478';for(let i=0;i<3;i++){c.beginPath();c.ellipse(23,9-i*2,5,2,0,0,TAU);c.fill();}}
      else {c.fillStyle='#b5a581';c.fillRect(-9,-29,18,9);c.strokeStyle='#796e4c';c.lineWidth=1.4;c.beginPath();c.moveTo(-4,-26);c.lineTo(4,-22);c.moveTo(4,-26);c.lineTo(-4,-22);c.stroke();c.fillStyle='#a08b59';c.fillRect(24,7,8,8);c.fillStyle='#605a40';c.fillRect(27,5,2,10);}
      c.restore();
    }

    drawInfrastructure(c,type,time,era) {
      c.save();c.rotate(-.12);
      if(type==='road'||type==='tram'){
        c.lineCap='round';c.strokeStyle='#6d766055';c.lineWidth=19;c.beginPath();c.moveTo(-38,7);c.bezierCurveTo(-10,3,8,-5,38,-7);c.stroke();
        c.strokeStyle=era==='industrial'?'#8a9482':'#b0a789';c.lineWidth=13;c.stroke();
        c.strokeStyle='#666e5c88';c.lineWidth=.7;for(let x=-32;x<34;x+=7){const y=-x*.2;c.beginPath();c.moveTo(x,y-6);c.lineTo(x+2,y+6);c.stroke();}
        if(type==='tram'){
          c.strokeStyle='#bec1a7';c.lineWidth=1.3;for(const d of [-3,3]){c.beginPath();c.moveTo(-37,7+d);c.bezierCurveTo(-10,3+d,8,-5+d,38,-7+d);c.stroke();}
          const x=Math.sin(time*.0002)*17,y=-x*.2;c.fillStyle='#597a69';c.fillRect(x-12,y-13,24,14);c.fillStyle='#a6ad8e';c.fillRect(x-13,y-15,26,4);c.fillStyle='#b9c1a4';for(let k=-9;k<10;k+=6)c.fillRect(x+k,y-9,4,5);c.fillStyle='#3f5145';for(const k of [-7,7]){c.beginPath();c.arc(x+k,y+2,2,0,TAU);c.fill();}
          c.strokeStyle='#87947b';c.lineWidth=1;c.beginPath();c.moveTo(-32,3);c.lineTo(-32,-36);c.moveTo(31,-7);c.lineTo(31,-45);c.moveTo(-36,-35);c.quadraticCurveTo(0,-33,36,-43);c.stroke();
        }c.restore();return;
      }
      if(type==='aqueduct'){
        c.fillStyle='#758675';c.fillRect(-44,-17,88,10);c.fillStyle='#acae90';c.fillRect(-46,-19,92,4);c.fillStyle='#4e756c';c.fillRect(-42,-19,84,2);
        for(let x=-42;x<43;x+=21){c.fillStyle='#9d9f82';c.fillRect(x,-9,6,31);c.fillStyle='#b4b091';c.fillRect(x-1,19,8,3);c.strokeStyle='#9d9f82';c.lineWidth=5;c.beginPath();c.moveTo(x+3,0);c.quadraticCurveTo(x+12,-15,x+24,0);c.stroke();}
        c.strokeStyle='#636f5c';c.lineWidth=.6;for(let x=-42;x<43;x+=21){c.beginPath();c.moveTo(x,-1);c.lineTo(x+6,-1);c.moveTo(x,8);c.lineTo(x+6,8);c.stroke();}c.restore();return;
      }
      if(type==='sewer'){
        c.fillStyle='#aaa88c';c.beginPath();c.ellipse(0,2,26,16,0,0,TAU);c.fill();c.fillStyle='#4c685c';c.beginPath();c.ellipse(0,1,20,11,0,0,TAU);c.fill();
        c.strokeStyle='#90967b';c.lineWidth=2;for(let x=-14;x<=14;x+=6){const h=Math.sqrt(1-x*x/400)*9;c.beginPath();c.moveTo(x,1-h);c.lineTo(x,1+h);c.stroke();}
        c.strokeStyle='#969d81';c.lineWidth=10;c.beginPath();c.moveTo(17,1);c.quadraticCurveTo(32,3,37,13);c.stroke();c.strokeStyle='#5d796c';c.lineWidth=5;c.stroke();c.restore();return;
      }
      if(type==='harbor'){
        c.fillStyle='#4a746d77';c.beginPath();c.ellipse(15,10,39,25,-.1,0,TAU);c.fill();
        c.fillStyle='#a48c5f';c.fillRect(-31,-12,47,12);c.fillRect(-5,-5,11,40);c.fillRect(-5,22,43,10);c.strokeStyle='#6e5b3d';c.lineWidth=1;for(let x=-30;x<16;x+=5){c.beginPath();c.moveTo(x,-12);c.lineTo(x,0);c.stroke();}for(let y=-4;y<34;y+=5){c.beginPath();c.moveTo(-5,y);c.lineTo(6,y);c.stroke();}
        this.drawRoofBlock(c,-24,-15,24,19,'#9c997a','#6a7c6e');
        c.fillStyle='#70583a';c.beginPath();c.moveTo(12,8);c.quadraticCurveTo(25,18,35,7);c.lineTo(30,20);c.quadraticCurveTo(23,26,16,20);c.fill();c.strokeStyle='#bea775';c.lineWidth=1.5;c.beginPath();c.moveTo(24,18);c.lineTo(24,-14);c.stroke();c.fillStyle='#cbc19a';c.beginPath();c.moveTo(25,-12);c.quadraticCurveTo(38,-1,25,5);c.fill();c.restore();return;
      }
      c.fillStyle='#b09b672a';c.beginPath();c.ellipse(0,3,39,28,0,0,TAU);c.fill();
      for(let i=0;i<5;i++){
        const a=i*TAU/5,x=Math.cos(a)*27,y=Math.sin(a)*17;c.save();c.translate(x,y);c.rotate(Math.sin(a)*.14);
        c.fillStyle='#725e3d';c.fillRect(-9,-3,18,9);c.fillStyle=['#a97855','#9d9d71','#698775','#b2a477','#8a7a68'][i];c.beginPath();c.moveTo(-12,-7);c.quadraticCurveTo(0,-14,12,-7);c.lineTo(10,0);c.lineTo(-11,1);c.fill();
        c.fillStyle='#d1b47d';for(let k=0;k<3;k++)c.fillRect(-6+k*4,3,3,2);c.restore();
      }c.restore();
    }

    drawDefense(c,type) {
      c.save();
      if(type==='watchtower'){
        c.fillStyle='#14221b60';c.beginPath();c.ellipse(5,6,15,9,-.2,0,TAU);c.fill();
        c.strokeStyle='#776545';c.lineWidth=3;
        for(const x of [-7,7]){c.beginPath();c.moveTo(x*1.3,11);c.lineTo(x,-26);c.stroke();}
        c.lineWidth=1.5;c.beginPath();c.moveTo(-8,8);c.lineTo(7,-17);c.moveTo(8,8);c.lineTo(-7,-17);c.stroke();
        c.fillStyle='#9e8960';c.fillRect(-11,-26,22,10);c.fillStyle='#66543b';c.fillRect(-9,-24,18,5);
        c.strokeStyle='#c0ad7b';c.lineWidth=1.5;c.strokeRect(-11,-26,22,11);
        c.fillStyle='#a18f67';c.beginPath();c.moveTo(-15,-28);c.quadraticCurveTo(-4,-33,0,-38);c.quadraticCurveTo(7,-33,15,-28);c.lineTo(11,-25);c.lineTo(-12,-25);c.closePath();c.fill();
        c.strokeStyle='#b7a272';c.lineWidth=1;c.beginPath();c.moveTo(-4,11);c.lineTo(-3,-16);c.moveTo(1,11);c.lineTo(2,-16);c.stroke();
        for(let y=-12;y<11;y+=4){c.beginPath();c.moveTo(-4,y);c.lineTo(2,y);c.stroke();}
      }else{
        const stone=type==='wall',rx=stone?49:36,ry=stone?31:25;
        c.fillStyle='#19251b3d';c.beginPath();c.ellipse(3,6,rx+5,ry+5,-.08,0,TAU);c.fill();
        const segments=stone?34:29;
        for(let i=0;i<segments;i++){
          const a=.23*TAU+(i/(segments-1))*.91*TAU,x=Math.cos(a)*rx,y=Math.sin(a)*ry;
          if(Math.abs(x)<9&&y>0)continue;
          if(stone){
            c.fillStyle=i%3?'#7d826c':'#90917a';c.fillRect(x-5,y-13,10,16);
            c.fillStyle='#a7aa8b';c.fillRect(x-5,y-15,10,3);c.fillRect(x-5,y-18,4,4);
            c.strokeStyle='#555f50';c.lineWidth=.65;c.beginPath();c.moveTo(x-5,y-7);c.lineTo(x+5,y-7);c.moveTo(x,y-13);c.lineTo(x,y-7);c.moveTo(x-3,y-7);c.lineTo(x-3,y);c.stroke();
          }else{
            c.fillStyle=i%2?'#807050':'#96815a';c.fillRect(x-5,y-17,10,21);
            c.fillStyle='#baa174';c.fillRect(x-5,y-19,10,3);
            c.fillStyle='#594b34';c.fillRect(x-4,y-16,1,19);c.fillRect(x-5,y-6,10,2);
          }
        }
        if(stone)for(const a of [Math.PI*.05,Math.PI*.95,Math.PI*1.5]){
          const x=Math.cos(a)*rx,y=Math.sin(a)*ry;c.fillStyle='#78816d';c.fillRect(x-7,y-20,14,23);c.fillStyle='#acac8e';c.fillRect(x-8,y-22,16,5);c.fillStyle='#485748';c.fillRect(x-2,y-14,3,7);
          for(let k=-7;k<=5;k+=6){c.fillStyle='#acac8e';c.fillRect(x+k,y-26,4,5);}
        }
        c.fillStyle=stone?'#a2a48a':'#a58e5c';c.fillRect(-12,ry-17,5,22);c.fillRect(7,ry-17,5,22);c.fillRect(-12,ry-20,24,5);
        c.fillStyle='#423f2c';c.fillRect(-6,ry-11,12,16);c.strokeStyle='#8d7750';c.lineWidth=1.5;
        for(let x=-5;x<=5;x+=3){c.beginPath();c.moveTo(x,ry-11);c.lineTo(x,ry+4);c.stroke();}
      }
      c.restore();
    }

    drawMill(c,type,time) {
      c.save();c.fillStyle='#14241b50';c.beginPath();c.ellipse(5,10,24,14,-.2,0,TAU);c.fill();
      if(type==='windmill'){
        c.fillStyle='#a19b78';c.beginPath();c.moveTo(-13,14);c.lineTo(-8,-23);c.quadraticCurveTo(0,-27,8,-23);c.lineTo(13,14);c.closePath();c.fill();
        c.fillStyle='#797c60';c.beginPath();c.moveTo(0,-23);c.lineTo(8,-23);c.lineTo(13,14);c.lineTo(2,14);c.fill();
        c.fillStyle='#89754d';c.beginPath();c.moveTo(-12,-23);c.quadraticCurveTo(-4,-29,0,-33);c.quadraticCurveTo(8,-28,12,-23);c.closePath();c.fill();
        c.fillStyle='#354434';c.fillRect(-3,6,6,9);c.fillRect(-2,-12,4,5);
        c.save();c.translate(0,-18);c.rotate(time*.00035+.35);
        for(let i=0;i<4;i++){
          c.save();c.rotate(i*TAU/4);c.strokeStyle='#665238';c.lineWidth=2;c.beginPath();c.moveTo(0,0);c.lineTo(0,-29);c.stroke();
          c.fillStyle='#c2b887';c.fillRect(1,-28,7,19);c.strokeStyle='#81734e';c.lineWidth=.75;
          for(let y=-26;y<-8;y+=4){c.beginPath();c.moveTo(1,y);c.lineTo(8,y);c.stroke();}c.restore();
        }
        c.fillStyle='#6c5c3c';c.beginPath();c.arc(0,0,3,0,TAU);c.fill();c.restore();
      }else{
        c.strokeStyle='#9c956d';c.lineWidth=11;c.beginPath();c.moveTo(24,-25);c.quadraticCurveTo(18,-3,26,27);c.stroke();c.strokeStyle='#47766b';c.lineWidth=6;c.stroke();
        this.drawRoofBlock(c,-7,-1,30,26,'#989575','#8d7953');
        c.save();c.translate(20,5);c.scale(.72,1);c.rotate(time*.0006);c.strokeStyle='#6e5337';c.lineWidth=4;c.beginPath();c.arc(0,0,14,0,TAU);c.stroke();c.strokeStyle='#b39a65';c.lineWidth=2;
        for(let i=0;i<10;i++){const a=i*TAU/10;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*13,Math.sin(a)*13);c.stroke();c.save();c.rotate(a);c.fillStyle='#92794e';c.fillRect(11,-3,6,6);c.restore();}
        c.fillStyle='#594b35';c.beginPath();c.arc(0,0,3,0,TAU);c.fill();c.restore();
      }
      c.restore();
    }

    drawRoofBlock(c,x,y,w,h,wall='#a09a7b',roof='#918360') {
      c.fillStyle='#14231c40';c.beginPath();c.ellipse(x+4,y+h*.4,w*.7,h*.45,-.2,0,TAU);c.fill();
      c.fillStyle=wall;c.fillRect(x-w/2,y-h/2+5,w,h);
      c.fillStyle='#5e6653';c.fillRect(x+w/2-3,y-h/2+5,4,h);
      c.fillStyle=roof;c.beginPath();c.moveTo(x-w/2-3,y-h/2+1);c.quadraticCurveTo(x,y-h/2-10,x+w/2+3,y-h/2+1);c.lineTo(x+w/2+3,y+h/2-3);c.quadraticCurveTo(x,y+h/2-10,x-w/2-3,y+h/2-3);c.closePath();c.fill();
      c.strokeStyle='#c1b18570';c.lineWidth=1;c.beginPath();c.moveTo(x-w/2-2,y-h/2);c.quadraticCurveTo(x,y-h/2-9,x+w/2+2,y-h/2);c.stroke();
      c.fillStyle='#374736';c.fillRect(x-3,y+h/2,6,7);
    }

    drawDenseHousing(c,type) {
      c.save();c.rotate(-.07);
      const floors=type==='apartment'?5:3,w=type==='apartment'?37:25;
      const block=(x,y,levels,width)=>{
        const h=levels*7;c.fillStyle='#16251d55';c.beginPath();c.ellipse(x+5,y+7,width*.7,13,-.2,0,TAU);c.fill();
        c.fillStyle=type==='apartment'?'#a0a48c':'#aa9e7c';c.fillRect(x-width/2,y-h,width,h+8);c.fillStyle='#707b65';c.fillRect(x+width/2-5,y-h+1,6,h+7);
        for(let row=0;row<levels;row++)for(let col=0;col<Math.floor(width/7);col++){
          c.fillStyle=(row+col)%4===0?'#bcb58a':'#4b6354';c.fillRect(x-width/2+4+col*7,y-h+4+row*7,3,4);
          c.fillStyle='#c2bc92';c.fillRect(x-width/2+3+col*7,y-h+8+row*7,5,1);
        }
        c.fillStyle='#566450';c.fillRect(x-3,y+2,6,7);
        c.fillStyle=type==='apartment'?'#7a8974':'#927353';c.beginPath();c.moveTo(x-width/2-3,y-h);c.quadraticCurveTo(x,y-h-8,x+width/2+3,y-h);c.lineTo(x+width/2+1,y-h+5);c.lineTo(x-width/2-2,y-h+4);c.closePath();c.fill();
        c.strokeStyle='#c1b58c88';c.lineWidth=1;c.beginPath();c.moveTo(x-width/2-2,y-h);c.quadraticCurveTo(x,y-h-7,x+width/2+2,y-h);c.stroke();
      };
      if(type==='townhouse')block(-10,-6,3,18);
      block(type==='townhouse'?8:0,type==='townhouse'?6:0,floors,w);
      c.restore();
    }

    drawCivic(c,type) {
      c.save();c.rotate(-.1);
      if(type==='warehouse'){
        this.drawRoofBlock(c,0,0,43,26,'#9b9676','#78806a');
        c.fillStyle='#403f2c';c.fillRect(-10,9,20,9);c.strokeStyle='#ab9464';c.lineWidth=1.2;
        for(let x=-9;x<=9;x+=5){c.beginPath();c.moveTo(x,10);c.lineTo(x,18);c.stroke();}
        for(let i=0;i<4;i++){const x=20+i%2*6,y=8+Math.floor(i/2)*6;c.fillStyle='#a18a59';c.fillRect(x,y,5,5);c.strokeStyle='#665739';c.strokeRect(x,y,5,5);}
      }else if(type==='clinic'){
        this.drawRoofBlock(c,0,0,31,25,'#b3ac8c','#78846a');
        c.fillStyle='#d2c6a0';c.fillRect(-11,3,22,8);c.fillStyle='#687f5f';c.fillRect(-1,3,3,8);c.fillRect(-4,6,9,2);
        c.fillStyle='#b3a073';for(let i=0;i<3;i++){c.beginPath();c.ellipse(17+i*3,11,2.3,4,-.25,0,TAU);c.fill();}
        c.strokeStyle='#718c5f';c.lineWidth=1.5;c.beginPath();c.moveTo(-19,12);c.lineTo(-19,2);c.moveTo(-19,7);c.lineTo(-23,3);c.moveTo(-19,6);c.lineTo(-15,1);c.stroke();
      }else{
        const school=type==='publicschool';
        c.fillStyle='#b4a7773a';c.beginPath();c.ellipse(0,8,27,19,-.1,0,TAU);c.fill();
        this.drawRoofBlock(c,-19,1,14,29,'#aaa78a',school?'#728771':'#897a5b');
        this.drawRoofBlock(c,19,1,14,29,'#aaa78a',school?'#728771':'#897a5b');
        this.drawRoofBlock(c,0,-14,40,17,'#aca586',school?'#819278':'#927957');
        c.fillStyle='#7e8f68';c.beginPath();c.ellipse(0,9,8,5,0,0,TAU);c.fill();
        c.fillStyle='#b6b797';c.fillRect(-5,2,10,4);c.strokeStyle='#ded0a7';c.lineWidth=1;c.beginPath();c.moveTo(0,2);c.lineTo(0,6);c.stroke();
        if(school){c.strokeStyle='#6b7558';c.lineWidth=2;c.beginPath();c.moveTo(-2,-24);c.lineTo(-2,-36);c.stroke();c.fillStyle='#c5b277';c.beginPath();c.arc(-2,-31,3,Math.PI,TAU);c.lineTo(2,-27);c.lineTo(-6,-27);c.closePath();c.fill();}
        else{c.fillStyle='#baaa7e';for(let i=0;i<3;i++)c.fillRect(-8+i*6,-18,3,4);}
      }
      c.restore();
    }

    drawIndustrial(c,type,time) {
      c.save();c.rotate(-.08);
      if(type==='railstation'){
        c.fillStyle='#817c5c';c.fillRect(-44,4,88,20);
        c.strokeStyle='#615d45';c.lineWidth=2;for(let x=-43;x<=43;x+=6){c.beginPath();c.moveTo(x,7);c.lineTo(x,25);c.stroke();}
        c.strokeStyle='#a1aaa0';c.lineWidth=1.5;for(const y of [11,19]){c.beginPath();c.moveTo(-46,y);c.lineTo(46,y);c.stroke();}
        this.drawRoofBlock(c,0,-9,52,24,'#a0a58a','#6a7c6d');
        c.fillStyle='#677861';c.fillRect(14,8,21,10);c.fillStyle='#9ca383';c.fillRect(14,7,21,3);c.fillStyle='#35483c';for(const x of [18,30]){c.beginPath();c.arc(x,20,2.3,0,TAU);c.fill();}
        c.fillStyle='#baa578';c.fillRect(-31,2,5,5);c.fillRect(-24,1,5,6);
      }else{
        this.drawRoofBlock(c,0,1,type==='steamplant'?43:48,28,'#8f967c','#6b7b6e');
        c.fillStyle='#5c6d5d';c.fillRect(12,-38,8,30);c.fillStyle='#86917b';c.fillRect(10,-40,12,4);this.drawSmoke(c,15,-40,time,73);
        if(type==='steamplant'){
          for(let i=0;i<2;i++){const x=-14+i*16;c.fillStyle='#718172';c.fillRect(x-6,-7,12,25);c.fillStyle='#a2aa8e';c.beginPath();c.ellipse(x,-7,6,4,0,0,TAU);c.fill();c.strokeStyle='#c3bea0';c.lineWidth=1;c.beginPath();c.ellipse(x,4,6,3,0,0,TAU);c.stroke();}
          c.strokeStyle='#b4b299';c.lineWidth=3;c.beginPath();c.moveTo(-14,14);c.lineTo(-14,22);c.lineTo(20,22);c.lineTo(20,8);c.stroke();
        }else{
          c.fillStyle='#899782';for(let i=0;i<4;i++){const x=-25+i*13;c.beginPath();c.moveTo(x,-13);c.lineTo(x+10,-22);c.lineTo(x+11,-9);c.closePath();c.fill();c.fillStyle='#3c5b50';c.fillRect(x+6,-16,3,5);c.fillStyle='#899782';}
          c.fillStyle='#b5ac80';c.fillRect(-20,11,11,4);c.fillRect(-4,11,10,4);
        }
        c.save();c.translate(26,11);c.rotate(time*.0005);c.strokeStyle='#9caa92';c.lineWidth=2.5;c.beginPath();c.arc(0,0,8,0,TAU);c.stroke();c.lineWidth=1.5;for(let i=0;i<6;i++){const a=i*TAU/6;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*8,Math.sin(a)*8);c.stroke();}c.restore();
      }
      c.restore();
    }

    drawFire(c, time) {
      c.fillStyle = '#4d48334d'; c.beginPath(); c.ellipse(0, 3, 14, 10, 0, 0, TAU); c.fill();
      c.fillStyle = '#94917a'; for (let i = 0; i < 9; i++) { const a = i * TAU / 9; c.beginPath(); c.ellipse(Math.cos(a) * 8, Math.sin(a) * 5, 2, 1.6, a, 0, TAU); c.fill(); }
      c.fillStyle = '#614b31'; c.save(); c.rotate(.6); c.fillRect(-7, -1, 14, 2.5); c.restore();
      const flicker = Math.sin(time * .009) * .7;
      c.fillStyle = '#d78d47'; c.beginPath(); c.moveTo(-4, 3); c.quadraticCurveTo(-4, -1, -1 + flicker, -8); c.quadraticCurveTo(5, -2, 4, 3); c.closePath(); c.fill();
      c.fillStyle = '#f2c875'; c.beginPath(); c.moveTo(-2, 3); c.quadraticCurveTo(-2, -1, flicker, -5); c.quadraticCurveTo(3, -1, 2, 3); c.closePath(); c.fill();
      const glow = c.createRadialGradient(0, 1, 1, 0, 1, 25); glow.addColorStop(0, '#e8a84a22'); glow.addColorStop(1, '#e8a84a00'); c.fillStyle = glow; c.fillRect(-25, -24, 50, 50);
      this.drawSmoke(c, 0, -7, time, 42);
    }

    drawSmoke(c, x, y, time, offset) {
      for (let i = 0; i < 3; i++) {
        const phase = ((time * .000055 + offset * .05 + i * .31) % 1);
        c.fillStyle = `rgba(194,197,178,${(1 - phase) * .1})`;
        c.beginPath(); c.ellipse(x + Math.sin(phase * 4 + offset) * 5 + phase * 10, y - phase * 35, 1.5 + phase * 4, 2 + phase * 5, -.4, 0, TAU); c.fill();
      }
    }

    drawFarm(c, b) {
      const land=b?this.sample(b.x,b.y):null,dry=land?.region==='arid';
      c.save();c.imageSmoothingEnabled=false;
      c.fillStyle=dry?'#806341':'#615437';c.fillRect(-27,-20,54,40);
      c.fillStyle='#92815b';c.fillRect(-27,-20,54,2);c.fillRect(-27,-18,2,38);
      const colors=dry?['#a19052','#b09b60','#8b8950']:['#7e8b4f','#a6a05b','#697946'];
      for(let row=0;row<7;row++)for(let col=0;col<12;col++){
        const x=-23+col*4,y=-16+row*5,shade=(col*7+row*3)%colors.length;
        c.fillStyle='#403e29';c.fillRect(x,y+3,3,1);c.fillStyle=colors[shade];c.fillRect(x,y,2,3);c.fillStyle='#b9b376';c.fillRect(x,y,1,1);
      }
      c.fillStyle=dry?'#537870':'#536b55';c.fillRect(-1,-18,2,36);
      c.fillStyle='#8d7954';for(const x of [-27,25])for(const y of [-20,18])c.fillRect(x,y,2,3);
      c.restore();
    }

    drawEstate(c) {
      c.save();c.rotate(-.12);
      c.fillStyle='#a0956233';c.beginPath();c.ellipse(0,3,66,49,-.08,0,TAU);c.fill();
      for(const p of [[-34,-21],[25,-21],[-34,19],[25,19]]){
        c.save();c.translate(p[0],p[1]);c.scale(.9,.86);this.drawFarm(c);c.restore();
      }
      c.strokeStyle='#b8aa7399';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(-64,2);c.quadraticCurveTo(0,-1,63,4);c.moveTo(-4,-44);c.quadraticCurveTo(-10,0,-3,47);c.stroke();
      this.drawRoofBlock(c,-2,-14,28,21,'#aaa27a','#937a51');
      c.fillStyle='#58513a';c.fillRect(-10,-4,16,7);c.strokeStyle='#b59c66';c.lineWidth=1;for(let x=-8;x<6;x+=4){c.beginPath();c.moveTo(x,-3);c.lineTo(x,3);c.stroke();}
      c.fillStyle='#bba36a';for(let i=0;i<3;i++){c.beginPath();c.ellipse(10+i*5,-3,3.5,5,-.2,0,TAU);c.fill();}
      c.strokeStyle='#806e46';c.lineWidth=1.2;c.beginPath();c.moveTo(-59,40);c.quadraticCurveTo(0,47,57,39);c.stroke();
      for(let i=0;i<14;i++){const x=-59+i*9,y=40+Math.sin(i/13*Math.PI)*5;c.beginPath();c.moveTo(x,y-5);c.lineTo(x,y+2);c.stroke();}
      c.restore();
    }

    drawQuarry(c) {
      c.save(); c.rotate(-.18);
      for (let i = 0; i < 4; i++) {
        const rx = 30 - i * 6, ry = 23 - i * 4;
        c.fillStyle = ['#827c60', '#9c967a', '#777d6a', '#545f53'][i];
        c.beginPath();
        for (let j = 0; j < 24; j++) {
          const angle = j * TAU / 24, r = .86 + hash(j, i, this.seed + 481) * .24;
          const x = Math.cos(angle) * rx * r, y = Math.sin(angle) * ry * r;
          if (!j) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.closePath(); c.fill();
      }
      for (let i = 0; i < 6; i++) this.drawRock(c, { x: 19 + (i % 3) * 4, y: 12 + Math.floor(i / 3) * 4, size: 3 + i % 2, shade: i % 2 });
      c.strokeStyle = '#a58d5c'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-24, 9); c.lineTo(-14, 17); c.moveTo(-21, 7); c.lineTo(-25, 11); c.stroke(); c.restore();
    }

    drawMarket(c) {
      c.fillStyle = '#a7935d35'; c.beginPath(); c.ellipse(0, 0, 37, 25, -.1, 0, TAU); c.fill();
      for (let i = 0; i < 3; i++) {
        c.save(); c.translate((i - 1) * 22, i === 1 ? -13 : 7); c.rotate((i - 1) * -.12);
        c.fillStyle = '#594b32'; c.fillRect(-8, -5, 16, 13); c.fillStyle = '#967d4e'; c.fillRect(-9, 2, 18, 3);
        c.strokeStyle = '#a28c5c'; c.lineWidth = 1; c.beginPath(); c.moveTo(-9, -10); c.lineTo(-9, 8); c.moveTo(9, -10); c.lineTo(9, 8); c.stroke();
        c.fillStyle = ['#a59160', '#a46f50', '#738063'][i]; c.beginPath(); c.moveTo(-11, -11); c.quadraticCurveTo(0, -16, 11, -10); c.lineTo(12, -2); c.quadraticCurveTo(0, 2, -12, -3); c.closePath(); c.fill();
        c.strokeStyle = '#d0bb876d'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-3, -13); c.lineTo(-3, 0); c.moveTo(4, -13); c.lineTo(4, 0); c.stroke();
        c.fillStyle = '#bca16e'; c.fillRect(-6, 4, 3, 2); c.fillRect(2, 4, 4, 2); c.restore();
      }
    }

    drawCanal(c) {
      c.save(); c.rotate(.18);
      this.drawFarm(c); c.translate(0, 3);
      c.lineCap = 'round'; c.strokeStyle = '#a79d6b'; c.lineWidth = 10; c.beginPath(); c.moveTo(-33, -21); c.bezierCurveTo(-8, -17, -15, 18, 36, 16); c.stroke();
      c.strokeStyle = '#416d67'; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#91a99778'; c.lineWidth = 1; c.beginPath(); c.moveTo(-30, -21); c.bezierCurveTo(-8, -17, -15, 18, 33, 16); c.stroke();
      c.restore();
    }

    drawModern(c, type, time) {
      c.save(); c.rotate(-.08);
      c.fillStyle = '#13251e50'; c.beginPath(); c.ellipse(6, 7, 34, 22, -.2, 0, TAU); c.fill();
      if (type === 'power') {
        for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
          const x = col * 17 - 24, y = row * 16 - 15;
          c.fillStyle = '#8c967c'; c.fillRect(x, y + 8, 12, 3); c.fillStyle = '#35535b'; c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x + 13, y - 1); c.lineTo(x + 11, y + 9); c.lineTo(x - 2, y + 11); c.closePath(); c.fill();
          c.strokeStyle = '#8ba9a15f'; c.lineWidth = .6; c.beginPath(); c.moveTo(x + 5, y); c.lineTo(x + 3, y + 10); c.moveTo(x, y + 5); c.lineTo(x + 12, y + 3); c.stroke();
        }
      } else {
        const w = type === 'factory' ? 54 : 43, h = type === 'factory' ? 31 : 29;
        c.fillStyle = '#777f6b'; c.fillRect(-w / 2, -h / 2 + 4, w, h); c.fillStyle = '#a1a48b'; c.fillRect(-w / 2 - 1, -h / 2, w + 2, h - 2); c.fillStyle = '#88957d'; c.fillRect(3, -h / 2, w / 2 - 2, h - 2);
        c.strokeStyle = '#5b776e'; c.lineWidth = 2.2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-w / 2 + 5 + i * 8, h / 2 + 3); c.lineTo(-w / 2 + 5 + i * 8, h / 2 + 7); c.stroke(); }
        c.fillStyle = '#3c5c58'; c.fillRect(-4, h / 2 + 1, 7, 7);
        if (type === 'factory') {
          c.fillStyle = '#5a6759'; c.fillRect(w / 2 - 7, -h / 2 - 18, 7, 21); c.fillStyle = '#3f5247'; c.fillRect(w / 2 - 8, -h / 2 - 20, 9, 3); this.drawSmoke(c, w / 2 - 3, -h / 2 - 20, time, 7);
          c.strokeStyle = '#c2bb8c'; c.lineWidth = 1; for (let i = -20; i < 20; i += 7) { c.beginPath(); c.moveTo(i, -12); c.lineTo(i, 10); c.stroke(); }
        } else if (type === 'hospital') { c.fillStyle = '#c8c9a9'; c.fillRect(-7, -7, 14, 4); c.fillRect(-2, -12, 4, 14); }
        else {
          c.fillStyle = '#c4c5aa'; c.beginPath(); c.ellipse(0, -5, 12, 10, -.2, 0, TAU); c.fill(); c.strokeStyle = '#5e7e74'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, -5, 10, 4, -.8, 0, TAU); c.stroke(); c.fillStyle = '#749c8e'; c.fillRect(-2, -7, 4, 4);
        }
      }
      c.restore();
    }

    drawBridge(c, type) {
      if (type === 'path') { c.strokeStyle = '#bcad779c'; c.lineCap = 'round'; c.lineWidth = 6; c.beginPath(); c.moveTo(-23, 6); c.quadraticCurveTo(0, -5, 25, -6); c.stroke(); return; }
      c.save(); c.rotate(-.1); c.fillStyle = '#8b7950'; c.fillRect(-25, -10, 50, 20); c.strokeStyle = '#4f4b35'; c.lineWidth = 1; for (let x = -23; x < 24; x += 4) { c.beginPath(); c.moveTo(x, -10); c.lineTo(x, 10); c.stroke(); } c.strokeStyle = '#c1ad79'; c.lineWidth = 2; c.strokeRect(-25, -10, 50, 20); c.restore();
    }

    drawWell(c) {
      c.fillStyle = '#25382c4f'; c.beginPath(); c.ellipse(4, 5, 10, 6, -.3, 0, TAU); c.fill(); c.fillStyle = '#b1ac8d'; c.beginPath(); c.ellipse(0, 0, 7, 6, 0, 0, TAU); c.fill(); c.fillStyle = '#344c47'; c.beginPath(); c.ellipse(0, -1, 4.5, 3.7, 0, 0, TAU); c.fill(); c.strokeStyle = '#78643e'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(-8, 2); c.lineTo(-8, -11); c.lineTo(8, -11); c.lineTo(8, 2); c.stroke();
    }

    drawPeople(c, time) {
      const homes = this.state.settlements || [];
      if (!homes.length) return;
      const count = Math.min(18, Math.ceil(Math.max(0,this.state.population) / 6));
      for (let i = 0; i < count; i++) {
        const home = homes[i % homes.length];
        const base = hash(i, 5, this.seed), angle = base * TAU + Math.sin(time * .00004 + i) * .1, radius = 19 + hash(i, 18, this.seed) * 66;
        const x = home.x + Math.cos(angle) * radius, y = home.y + Math.sin(angle) * radius * .7;
        c.fillStyle = '#17201652'; c.beginPath(); c.ellipse(x + 1, y + 1, 2.3, 1.3, 0, 0, TAU); c.fill();
        c.fillStyle = ['#af8c64', '#8c7b5f', '#b4a17c', '#778573'][i % 4]; c.fillRect(x - 1.2, y - 3.2, 2.4, 3);
        c.fillStyle = '#c1a27c'; c.beginPath(); c.arc(x, y - 4, 1.1, 0, TAU); c.fill();
        c.fillStyle = '#4e4935'; c.fillRect(x - 1, y, .7, 1.5); c.fillRect(x + .3, y, .7, 1.5);
      }
    }

    drawCitySymbols(c) {
      for (const s of this.state.settlements || []) this.drawCitySymbol(c,s);
    }

    drawCitySymbol(c,s,color='#b6a078') {
      c.save();c.translate(s.x,s.y);c.scale(1/this._view.zoom,1/this._view.zoom);
      const big=s.population>150,industrial=this.currentEra==='industrial';
      const light=c.createRadialGradient(0,0,3,0,0,24);light.addColorStop(0,color+'30');light.addColorStop(1,color+'00');c.fillStyle=light;c.fillRect(-24,-24,48,48);
      c.fillStyle='#23362bdd';c.beginPath();c.ellipse(0,3,big?13:8,big?8:5,0,0,TAU);c.fill();
      for(let i=0;i<(big?5:2);i++){
        const x=[-8,2,-3,8,0][i],y=[0,3,6,0,-3][i];
        c.fillStyle=color;c.fillRect(x-2,y-4,5,6);c.fillStyle=industrial?'#749385':'#99785d';
        c.beginPath();c.moveTo(x-3,y-4);c.lineTo(x,y-7);c.lineTo(x+4,y-4);c.fill();
      }
      if(big){c.fillStyle='#aab096';c.fillRect(-1,-13,4,10);c.fillStyle=industrial?'#6a7e70':'#718475';c.beginPath();c.moveTo(-2,-13);c.lineTo(1,-17);c.lineTo(4,-13);c.fill();}
      if(industrial){c.fillStyle='#7b8c78';c.fillRect(9,-12,3,12);c.fillStyle='#b0b19b';c.fillRect(8,-13,5,2);}
      c.restore();
    }

    drawMinerals(c){
      const z=this._view.zoom;c.save();
      for(const d of window.CivilMinerals?.visible(this.state)||[]){
        c.fillStyle=d.color+'20';c.beginPath();c.ellipse(d.x,d.y,d.radius,d.radius*.7,0,0,TAU);c.fill();
        c.save();c.translate(d.x,d.y);c.scale(1/z,1/z);c.fillStyle='#15251fee';c.beginPath();c.arc(0,0,12,0,TAU);c.fill();c.strokeStyle=d.color;c.lineWidth=2;c.beginPath();c.moveTo(-6,3);c.lineTo(-3,-5);c.lineTo(3,-7);c.lineTo(7,2);c.closePath();c.stroke();c.fillStyle=d.color;c.font='10px sans-serif';c.textAlign='center';c.fillText(d.name+(d.remaining<=0?' · 枯竭':''),0,26);c.restore();
      }c.restore();
    }

    drawDataLayer(c) {
      if(this.layer==='minerals'){this.drawMinerals(c);return;}
      c.save();
      for (const s of this.state.settlements || []) {
        const r = this.layer === 'food' ? 110 : 155, g = c.createRadialGradient(s.x, s.y, 4, s.x, s.y, r);
        g.addColorStop(0, this.layer === 'food' ? '#dfbd6759' : '#afc8cb55'); g.addColorStop(1, '#afc88a00');
        c.fillStyle = g; c.fillRect(s.x - r, s.y - r, r * 2, r * 2);
      }
      c.restore();
    }

    drawSelection(c) {
      if (!this.selected) return;
      const s = this.selected;
      c.save(); c.strokeStyle = '#e4d5a7bb'; c.lineWidth = 1 / this._view.zoom; c.setLineDash([3 / this._view.zoom, 4 / this._view.zoom]); c.beginPath(); c.ellipse(s.x, s.y + 4, s.kind === 'building' ? 19 : 28, s.kind === 'building' ? 12 : 20, -.15, 0, TAU); c.stroke(); c.restore();
    }

    drawPreview(c) {
      const p = this.pointer, info = this.sample(p.x, p.y), candidate={x:p.x,y:p.y,type:this.buildType||'hut',size:this.buildSize};
      const bounds=window.CivilEngine.buildingBounds(candidate),occupied=window.CivilEngine.occupiedBuildings(this.state);
      const valid=(!info.water||this.buildType==='bridge')&&this.isExplored(p.x,p.y)&&!occupied.some(b=>window.CivilEngine.buildingsOverlap(candidate,b));
      const cell=48,step=cell/Math.sqrt(this.buildSize),left=Math.floor(bounds.left/step)*step,top=Math.floor(bounds.top/step)*step,right=Math.ceil(bounds.right/step)*step,bottom=Math.ceil(bounds.bottom/step)*step;
      c.save();c.strokeStyle='rgba(229,237,214,.24)';c.lineWidth=.8/this._view.zoom;c.setLineDash([2/this._view.zoom,4/this._view.zoom]);
      for(let x=left;x<=right;x+=step){c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();}
      for(let y=top;y<=bottom;y+=step){c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();}
      c.globalAlpha=.72;this.drawBuilding(c,{x:p.x,y:p.y,type:this.buildType||'hut',status:'complete',size:this.buildSize},0);c.globalAlpha=1;
      c.fillStyle=valid?'rgba(190,219,157,.22)':'rgba(214,115,91,.3)';c.fillRect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);
      c.strokeStyle=valid?'#d1dcaf':'#d48e76';c.lineWidth=1.4/this._view.zoom;c.setLineDash([4/this._view.zoom,4/this._view.zoom]);c.strokeRect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);c.restore();
    }

    drawFog(c, key) {
      const f = this.fogCanvas.getContext('2d'), w = this.fogCanvas.width, h = this.fogCanvas.height;
      if (!key || this.mapCache.fogKey !== key) {
        f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, w, h);
        f.fillStyle = '#0c1b1d'; f.fillRect(0, 0, w, h);
        f.globalCompositeOperation = 'destination-out';
        for (const p of this.state.explored || []) {
          const s = this.worldToScreen(p.x, p.y), r = p.radius * this._view.zoom * this.pixelRatio;
          const g = f.createRadialGradient(s.x * this.pixelRatio, s.y * this.pixelRatio, r * .62, s.x * this.pixelRatio, s.y * this.pixelRatio, r);
          g.addColorStop(0, '#000'); g.addColorStop(.68, '#000000f7'); g.addColorStop(.88, '#0000009c'); g.addColorStop(1, '#00000000'); f.fillStyle = g;
          f.fillRect(s.x * this.pixelRatio - r, s.y * this.pixelRatio - r, r * 2, r * 2);
        }
        f.globalCompositeOperation = 'source-over';
        this.mapCache.fogKey = key; this.cacheStats.fogBuilds++;
      } else this.cacheStats.hits++;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.fogCanvas, 0, 0); c.restore();
      c.save(); c.fillStyle = '#738b7f88'; c.font = 'italic 12px Georgia, serif'; c.textAlign = 'center';
      if (this._view.zoom < .52) { const s = this.worldToScreen(this._view.x, this._view.y + this.height / this._view.zoom * .25); c.fillText('尚未抵达的世界', s.x, s.y); }
      c.restore();
    }

    drawSettlementLabels(c) {
      c.save(); c.textAlign = 'center';
      for (const s of this.state.settlements || []) {
        const p = this.worldToScreen(s.x, s.y);
        const off = this._view.zoom >= .95 ? 112 * this._view.zoom : 20;
        c.fillStyle = '#101a16b0'; c.font = '500 13px "Noto Sans SC", sans-serif';
        const label = s.name || '河畔营地', width = c.measureText(label).width;
        c.fillStyle = '#14241b70'; c.beginPath(); c.ellipse(p.x, p.y + off - 4, width * .7 + 14, 18, 0, 0, TAU); c.fill();
        c.shadowColor = '#07110d'; c.shadowBlur = 5; c.fillStyle = '#e6dfc5'; c.fillText(label, p.x, p.y + off);
        c.shadowBlur = 0;
        if (this._view.zoom < .95) { c.font = '10px sans-serif'; c.fillStyle = '#a8b19b'; c.fillText(`${Math.floor(s.population ?? this.state.population)} 人`, p.x, p.y + off + 16); }
      }
      c.restore();
      c.save();c.textAlign='center';c.font='11px sans-serif';c.fillStyle='#dcaa91';for(const h of this.state.hostiles||[]){const p=this.worldToScreen(h.x,h.y);c.fillText(h.name,p.x,p.y+29);}c.restore();
      c.save();c.textAlign='center';
      for(const n of this.nationCities()){
        if(!this.isExplored(n.x,n.y))continue;
        const p=this.worldToScreen(n.x,n.y),off=this._view.zoom>=.95?125*this._view.zoom:this._view.zoom>=.42?112*this._view.zoom:25;
        c.font='500 12px "Noto Sans SC", sans-serif';c.shadowColor='#06130f';c.shadowBlur=5;c.fillStyle=this.nationColor(n);c.fillText(n.capital?n.name:`${n.name} · ${n.nationName}`,p.x,p.y+off);
        const war=(this.state.warfare?.wars||[]).some(w=>w.nationId===n.nationId);
        c.shadowBlur=0;c.fillStyle=war?'#d2a28a':'#b0b6a0';c.font='10px sans-serif';c.fillText(`${Math.round(n.population)} 人${war?' · 交战':n.tradeOpen&&!n.embargo?(n.tension>=65||n.relation<15?' · 受阻':' · 通商'):''}`,p.x,p.y+off+16);
      }
      c.restore();
    }

    setupPointer() {
      const on = (name, handler, opts) => { this.canvas.addEventListener(name, handler, opts); this.handlers.push([name, handler, opts]); };
      let dragging = false, moved = false, down = null, pinch = null;
      const pointers = new Map();
      this.canvas.style.touchAction = 'none';
      on('pointerdown', event => {
        if (event.button !== 0 && event.button !== 1) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size > 1) {
          const points = [...pointers.values()], a = points[0], b = points[1];
          pinch = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), zoom: this.target.zoom, anchor: this.screenToWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
          moved = true; this.canvas.setPointerCapture(event.pointerId); return;
        }
        dragging = true; moved = false; down = { x: event.clientX, y: event.clientY, viewX: this.target.x, viewY: this.target.y };
        this.canvas.setPointerCapture(event.pointerId); this.canvas.style.cursor = 'grabbing';
      });
      on('pointermove', event => {
        this.pointer = this.screenToWorld(event.clientX, event.clientY);
        if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch && pointers.size > 1) {
          const points = [...pointers.values()], a = points[0], b = points[1], rect = this.canvas.getBoundingClientRect();
          const zoom = clamp(pinch.zoom * Math.hypot(b.x - a.x, b.y - a.y) / pinch.distance, .15, 3.5);
          this.target.zoom = zoom;
          this.target.x = pinch.anchor.x - ((a.x + b.x) / 2 - rect.left - this.width / 2) / zoom;
          this.target.y = pinch.anchor.y - ((a.y + b.y) / 2 - rect.top - this.height / 2) / zoom;
          this.dirty = true; return;
        }
        if (dragging && down) {
          const dx = event.clientX - down.x, dy = event.clientY - down.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
          if (moved) { this.target.x = clamp(down.viewX - dx / this._view.zoom, -250, SIZE + 250); this.target.y = clamp(down.viewY - dy / this._view.zoom, -250, SIZE + 250); }
        }
        this.dirty = true;
      });
      on('pointerup', event => {
        pointers.delete(event.pointerId);
        if (pinch) {
          if (pointers.size < 2) pinch = null;
          const remaining = [...pointers.values()][0];
          dragging = !!remaining; moved = true;
          down = remaining ? { x: remaining.x, y: remaining.y, viewX: this.target.x, viewY: this.target.y } : null;
          this.canvas.style.cursor = this.mode === 'build' ? 'crosshair' : 'grab'; return;
        }
        if (!dragging) return;
        dragging = false; this.canvas.style.cursor = this.mode === 'build' ? 'crosshair' : 'grab';
        if (moved || !this.state) return;
        const p = this.screenToWorld(event.clientX, event.clientY), info = this.sample(p.x, p.y);
        if (this.mode === 'build') { if (this.callbacks.onBuild) this.callbacks.onBuild({ ...p, type: this.buildType, valid: (!info.water || this.buildType === 'bridge') && this.isExplored(p.x, p.y) }); return; }
        if (this.mode === 'explore') { if (this.callbacks.onExplore) this.callbacks.onExplore(p); return; }
        let selected = null;
        const expedition=(this.state.expeditions||[]).find(e=>{const party=this.expeditionPoint(e);return Math.hypot(party.x-p.x,party.y-p.y)<18/this._view.zoom;});
        if(expedition){const party=this.expeditionPoint(expedition);this.selected={kind:'expedition',expeditionId:expedition.id,x:party.x,y:party.y};this.dirty=true;this.callbacks.onSelect?.(this.selected);return;}
        const nation=this.nationCities().find(n=>this.isExplored(n.x,n.y)&&Math.hypot(n.x-p.x,n.y-p.y)<Math.max(40,28/this._view.zoom));
        if(nation){this.selected={kind:'nation',nationId:nation.nationId,cityId:nation.id,x:nation.x,y:nation.y};this.dirty=true;this.callbacks.onSelect?.(this.selected);return;}
        const hostile=(this.state.hostiles||[]).find(h=>Math.hypot(h.x-p.x,h.y-p.y)<24/Math.min(1,this._view.zoom));
        if(hostile){this.callbacks.onSelect?.({kind:'hostile',hostileId:hostile.id,x:hostile.x,y:hostile.y});return;}
        for (const b of [...(this.state.buildings || [])].sort((a,b)=>b.y-a.y)) { const bounds=window.CivilEngine.buildingBounds(b);if(p.x>=bounds.left&&p.x<=bounds.right&&p.y>=bounds.top&&p.y<=bounds.bottom) { selected = { kind: 'building', buildingId: b.id, x: b.x, y: b.y, type: b.type }; break; } }
        if (!selected) selected = { kind: 'region', ...p, ...info, explored: this.isExplored(p.x, p.y) };
        this.selected = selected; this.dirty = true;
        if (this.callbacks.onSelect) this.callbacks.onSelect(selected);
      });
      on('pointercancel', event => { pointers.delete(event.pointerId); pinch = null; dragging = false; moved = true; down = null; this.canvas.style.cursor = this.mode === 'build' ? 'crosshair' : 'grab'; });
      on('pointerleave', () => { if (!dragging) this.pointer = null; });
      on('wheel', event => { event.preventDefault(); const point = this.screenToWorld(event.clientX, event.clientY); this.setZoom(this.target.zoom * Math.exp(-event.deltaY * .0014), point); }, { passive: false });
      on('dblclick', event => { if (this.mode) return; const p = this.screenToWorld(event.clientX, event.clientY); this.target.x = p.x; this.target.y = p.y; this.setZoom(this.target.zoom < .7 ? 1.62 : Math.min(3.1, this.target.zoom * 1.5)); });
      on('contextmenu', event => event.preventDefault());
    }

    destroy() { this.clearMapCache(); this.fogCanvas.width = this.fogCanvas.height = 1; this.handlers.forEach(([name, handler, options]) => this.canvas.removeEventListener(name, handler, options)); if (this.observer) this.observer.disconnect(); }
  }

  window.CivilWorld = CivilWorld;
})();
