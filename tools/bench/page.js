/*
 * Banc de mesure, côté page : évalué dans la page du jeu (par tools/bench/run.mjs, ou collé dans la console).
 * Il bâtit un gros village de test, puis mesure chaque scénario : millisecondes par image côté processeur (en tout, et
 * par sous-système), côté carte graphique (EXT_disjoint_timer_query_webgl2, si disponible), appels de dessin et
 * triangles (renderer.info). `window.__bench` expose `setup`, `scenario`, `measure`, `ablate`, `hitches`, `run`.
 */
(() => {
  const G = () => window.__game;
  // fenêtre masquée (occultée par une autre) : requestAnimationFrame s'arrête ; on continue au minuteur pour mesurer quand même
  if (!window.__benchRaf) {
    const raf = window.requestAnimationFrame.bind(window);
    window.__benchRaf = raf;
    window.requestAnimationFrame = (cb) => (document.hidden ? setTimeout(() => cb(performance.now()), 1) : raf(cb));
  }
  const renderer = () => G().glow?.renderer ?? window.__renderer;
  const canvas = () => document.getElementById('view');
  const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const mapN = () => Math.round(Math.sqrt(G().world.occ.length));

  /** bâtiments du village de test (taille, âge minimal) : pas de mission requise */
  const KINDS = [
    ['house', 1, 0], ['house', 1, 0], ['house', 1, 0], ['house', 1, 0], ['house', 1, 0], ['house', 1, 0], ['farm', 1, 0], ['farm', 1, 0],
    ['well', 1, 0], ['lamp', 1, 0], ['lumber', 1, 0], ['quarry', 1, 0], ['workshop', 2, 0], ['school', 2, 0], ['health', 2, 0], ['fire', 2, 0],
    ['temple', 2, 1], ['barber', 1, 1], ['theater', 2, 1], ['police', 2, 1], ['senate', 2, 1], ['mill', 2, 2], ['manor', 2, 2], ['landmark', 2, 2],
    ['brickworks', 2, 3], ['watertower', 1, 3], ['lab', 1, 3], ['tennis', 1, 3], ['football', 2, 3], ['alpine', 2, 3],
    ['basket', 1, 4], ['heliport', 2, 4], ['vfarm', 1, 5], ['research', 2, 5], ['maglev', 2, 5],
  ];

  let center = null;

  /** Coin de la zone la plus plane et libre (fenêtre de `size` cases), autour du milieu de la carte */
  function findSite(size) {
    const g = G(), w = g.world, N = mapN();
    let best = null, bs = -1;
    for (let z0 = 8; z0 + size < N - 8; z0 += 6)
      for (let x0 = 8; x0 + size < N - 8; x0 += 6) {
        let s = 0;
        for (let z = z0; z < z0 + size; z += 2) for (let x = x0; x < x0 + size; x += 2) if (w.canPlace('house', x, z) === null) s++;
        // au plus près du milieu, à score égal
        s -= Math.hypot(x0 + size / 2 - N / 2, z0 + size / 2 - N / 2) * 0.02;
        if (s > bs) { bs = s; best = [x0, z0]; }
      }
    return best;
  }

  /** Bâtit le village de test : rues tous les trois rangs, bâtiments de part et d'autre, population fixée */
  function setup({ buildings = 600, pop = 500, age = 3 } = {}) {
    const g = G(), w = g.world;
    for (const b of [...w.buildings.values()]) if (b.kind !== 'gather') w.removeBuilding(b.id);
    const size = 60, site = findSite(size);
    if (!site) throw new Error('pas de site');
    const [x0, z0] = site;
    center = [x0 + size / 2, z0 + size / 2];
    let n = 0, i = 0;
    const kinds = KINDS.filter((k) => k[2] <= age);
    for (let z = z0; z < z0 + size && n < buildings; z += 3) {
      for (let x = x0; x < x0 + size; x++) w.setRoad(x, z, true);
      for (const [dz, rot] of [[-2, 0], [1, 2]]) {
        for (let x = x0; x < x0 + size && n < buildings; x++) {
          if (x % 11 === 5) { w.setRoad(x, z + dz, true); if (dz === -2) w.setRoad(x, z - 1, true); continue; }
          const [kind, s, minAge] = kinds[(i++ * 7) % kinds.length];
          const zz = dz < 0 ? z + dz - (s - 1) : z + dz;
          if (w.canPlace(kind, x, zz) !== null) { if (w.canPlace('house', x, z + dz) === null) { w.place('house', x, z + dz, rot, true, age, false); n++; } continue; }
          w.place(kind, x, zz, rot, true, age, false);
          n++;
          x += s - 1;
        }
      }
    }
    g.sim.age = age;
    g.sim.pop = pop;
    g.time.paused = false;
    g.time.speed = 1;
    g.env.setWeather('clear');
    return { placed: n, center, site };
  }

  /** Met la vue et le moment en place : distance de la caméra, heure, saison, qualité */
  async function scenario({ dist = 14, night = false, winter = false, quality = 'medium', pop } = {}) {
    const g = G();
    if (pop !== undefined) g.sim.pop = pop;
    // ni tutoriel ni interface sur les captures (mode photo)
    try { g.tutorial?.stop(); } catch { /* déjà arrêté */ }
    document.body.classList.add('photo');
    g.setQuality(quality);
    g.time.hour = night ? 23 : 12;
    g.time.seasonT = winter ? 3.3 : 1.4;
    g.env.setWeather('clear');
    const [x, z] = center ?? [mapN() / 2, mapN() / 2];
    g.cam.jump({ x, z, dist, yaw: 0.75, pitch: 0.85 }, g.world.hAt(x, z));
    // le temps que tout se refasse (saison, routes, végétation) et que les programmes se compilent
    await frames(90);
  }

  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const r1 = (x) => Math.round(x * 10) / 10;

  /** Mesure pendant `seconds` : ms/image processeur (total et par sous-système), carte graphique, appels, triangles */
  async function measure(seconds = 3, { gpu = true } = {}) {
    const g = G(), r = renderer(), gl = canvas().getContext('webgl2');
    const ext = gpu && gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    const sub = {}, restore = [];
    const wrap = (obj, name, label) => {
      if (!obj || typeof obj[name] !== 'function') return;
      const o = obj[name];
      restore.push(() => { if (Object.prototype.hasOwnProperty.call(obj, name)) delete obj[name]; obj[name] = o; });
      obj[name] = function (...a) { const t = performance.now(); try { return o.apply(this, a); } finally { sub[label] = (sub[label] ?? 0) + performance.now() - t; } };
    };
    wrap(g, 'renderer_render', 'rendu');
    if (r) wrap(r, 'render', 'gl.render');
    wrap(g.fauna, 'update', 'faune'); wrap(g.veg, 'update', 'végétation'); wrap(g.agents, 'update', 'villageois'); wrap(g.traffic, 'update', 'trafic');
    wrap(g.buildings, 'update', 'bâtiments'); wrap(g.life, 'update', 'vie'); wrap(g.atmosphere, 'update', 'atmosphère'); wrap(g.sim, 'update', 'sim');
    wrap(g.expeditions, 'update', 'expéditions'); wrap(g.railView, 'update', 'rail'); wrap(g.streams, 'update', 'ruisseaux'); wrap(g.env, 'update', 'env');
    wrap(g.terrain, 'stepRecolor', 'terrain.recolor'); wrap(g.terrain, 'animateWater', 'terrain.eau'); wrap(g.helis, 'update', 'hélicos'); wrap(g.emergencies, 'update', 'urgences');
    wrap(g.gardens, 'update', 'jardins'); wrap(g.halos, 'update', 'halos'); wrap(g.fest, 'update', 'fêtes'); wrap(g.pens, 'update', 'enclos'); wrap(g.roads, 'rebuild', 'routes.rebuild');
    wrap(g.ui, 'update', 'ui'); wrap(g.audio, 'update', 'audio'); wrap(g.transports, 'update', 'transports'); wrap(g.zoo, 'update', 'zoo'); wrap(g.upBadges, 'update', 'pastilles');
    const cpu = [], wall = [], gpuMs = [], calls = [], tris = [];
    const pending = [];
    let last = performance.now(), warm = 30, info = null;
    const orig = g.frame;
    if (r) { r.info.autoReset = false; }
    g.frame = function () {
      const now = performance.now();
      if (ext && warm <= 0) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); pending.push(q); }
      if (r) r.info.reset();
      orig.call(this);
      const t = performance.now();
      if (ext && warm <= 0) gl.endQuery(ext.TIME_ELAPSED_EXT);
      if (warm > 0) { warm--; for (const k in sub) sub[k] = 0; }
      else { cpu.push(t - now); wall.push(now - last); if (r) { calls.push(r.info.render.calls); tris.push(r.info.render.triangles); } }
      last = now;
      if (ext) {
        while (pending.length) {
          const q = pending[0];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuMs.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(q); pending.shift();
        }
      }
    };
    await new Promise((res) => setTimeout(res, seconds * 1000 + 600));
    g.frame = orig;
    for (const f of restore) f();
    await frames(3);
    if (r) { r.info.autoReset = true; info = { calls: Math.round(mean(calls)), tris: Math.round(mean(tris)), programs: r.info.programs?.length ?? 0 }; }
    const n = cpu.length || 1;
    const subs = Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, r1(v / n)]).sort((a, b) => b[1] - a[1]));
    return { frames: cpu.length, cpu: r1(mean(cpu)), cpuP95: r1(pct(cpu, 0.95)), wall: r1(mean(wall)), wallP95: r1(pct(wall, 0.95)), gpu: gpuMs.length ? r1(mean(gpuMs)) : null, gpuP95: gpuMs.length ? r1(pct(gpuMs, 0.95)) : null, ...info, subs, pixelRatio: r?.getPixelRatio(), size: [canvas().width, canvas().height], counts: counts() };
  }

  /** Ce qui est en scène : bêtes articulées (affichées), villageois, objets visibles par groupe */
  function counts() {
    const g = G(), out = {};
    const crit = g.fauna.critters ?? [];
    out.bêtes = crit.length;
    out.bêtesArticulées = crit.filter((c) => c.actor).length;
    out.bêtesAffichées = crit.filter((c) => c.actor && c.actor.root.parent).length;
    out.villageois = g.agents.agents.length;
    const walk = (o) => { let n = 0; o.traverse((m) => { if ((m.isMesh || m.isPoints || m.isLine) && m.visible) n++; }); return n; };
    out.maillages = { faune: walk(g.fauna.group), végétation: walk(g.veg.group), villageois: walk(g.agents.group), bâtiments: walk(g.buildings.group), jardins: walk(g.gardens.group), trafic: walk(g.traffic.group), vie: walk(g.life.group), scène: walk(g.scene) };
    return out;
  }

  /** Coût de chaque poste : on le cache, on mesure, on compare au total */
  async function ablate(seconds = 1.5) {
    const g = G(), r = renderer();
    const base = await measure(seconds);
    const items = {
      faune: () => (g.fauna.group.visible = !g.fauna.group.visible),
      végétation: () => (g.veg.group.visible = !g.veg.group.visible),
      villageois: () => (g.agents.group.visible = !g.agents.group.visible),
      bâtiments: () => (g.buildings.group.visible = !g.buildings.group.visible),
      routes: () => (g.roads.group.visible = !g.roads.group.visible),
      terrain: () => (g.terrain.group.visible = !g.terrain.group.visible),
      trafic: () => (g.traffic.group.visible = !g.traffic.group.visible),
      vie: () => (g.life.group.visible = !g.life.group.visible),
      atmosphère: () => (g.atmosphere.group.visible = !g.atmosphere.group.visible),
      jardins: () => (g.gardens.group.visible = !g.gardens.group.visible),
      ombres: () => { if (r) r.shadowMap.enabled = !r.shadowMap.enabled; },
    };
    const out = { base };
    for (const [k, toggle] of Object.entries(items)) {
      toggle();
      await frames(20);
      const m = await measure(seconds);
      toggle();
      out[k] = { cpu: r1(base.cpu - m.cpu), gpu: base.gpu != null && m.gpu != null ? r1(base.gpu - m.gpu) : null, wall: r1(base.wall - m.wall), calls: (base.calls ?? 0) - (m.calls ?? 0), tris: (base.tris ?? 0) - (m.tris ?? 0) };
    }
    return out;
  }

  /** À-coups : pose d'un bâtiment (routes refaites), pas de neige (végétation), passage d'un seuil de neige des routes */
  async function hitches() {
    const g = G(), w = g.world, [cx, cz] = center;
    const worst = async (n) => { let m = 0, last = performance.now(); const o = g.frame; g.frame = function () { const t = performance.now(); o.call(this); m = Math.max(m, performance.now() - t); last = t; }; await frames(n); g.frame = o; void last; return r1(m); };
    const out = {};
    let t = performance.now();
    g.roads.rebuild(g.sim.age, g.season.snow);
    out['routes.rebuild (direct)'] = r1(performance.now() - t);
    // pose d'un bâtiment : la pire image des dix suivantes, et ce qu'elle a coûté par poste
    let spot = null;
    for (let z = cz - 30; z < cz + 30 && !spot; z++) for (let x = cx - 30; x < cx + 30 && !spot; x++) if (w.canPlace('house', x, z) === null) spot = [x, z];
    if (spot) {
      const parts = {}, restore = [];
      const wrap = (obj, name) => { const o = obj[name]; restore.push(() => { delete obj[name]; }); obj[name] = function (...a) { const t = performance.now(); try { return o.apply(this, a); } finally { parts[name] = r1((parts[name] ?? 0) + performance.now() - t); } }; };
      wrap(g.roads, 'rebuild'); wrap(g.buildings, 'refreshAll'); wrap(g.veg, 'rebuild'); wrap(g.terrain, 'update'); wrap(g.gardens, 'sync'); wrap(g.buildings, 'syncHeights'); wrap(g.fauna, 'update'); wrap(g.sim, 'update'); wrap(g.agents, 'update');
      const b = w.place('house', spot[0], spot[1], 0, true, g.sim.age, false);
      out['pose bâtiment (pire image)'] = await worst(12);
      out['pose bâtiment (postes)'] = parts;
      for (const f of restore) f();
      w.removeBuilding(b.id); await frames(12);
    }
    // un pas de neige : la végétation et les routes suivent
    const s = g.season, snow0 = s.snow;
    s.snow = snow0 > 0.5 ? 0.2 : 0.8;
    t = performance.now(); g.veg.applySeason(s); out['veg.applySeason (direct)'] = r1(performance.now() - t);
    out['pas de neige (pire image)'] = await worst(30);
    s.snow = snow0; g.veg.applySeason(s); await frames(40);
    return out;
  }

  const SCENARIOS = [
    { name: 'âge3 près jour été normal', age: 3, dist: 14, quality: 'medium' },
    { name: 'âge3 moyen jour été normal', age: 3, dist: 34, quality: 'medium' },
    { name: 'âge3 loin jour été normal', age: 3, dist: 90, quality: 'medium' },
    { name: 'âge3 près nuit hiver normal', age: 3, dist: 14, night: true, winter: true, quality: 'medium' },
    { name: 'âge3 près jour été réduit', age: 3, dist: 14, quality: 'low' },
    { name: 'âge3 loin jour été réduit', age: 3, dist: 90, quality: 'low' },
    { name: 'âge1 près jour été normal', age: 1, dist: 14, quality: 'medium' },
    { name: 'âge1 très près jour été haute', age: 1, dist: 7, quality: 'high' },
    { name: 'âge5 près jour été normal', age: 5, dist: 14, quality: 'medium' },
    { name: 'âge5 moyen nuit été haute', age: 5, dist: 34, night: true, quality: 'high' },
  ];

  /** Tout le banc : chaque scénario, l'ablation sur ceux de `ablateOn` (noms), les à-coups sur le scénario de référence */
  async function run({ seconds = 3, scenarios = SCENARIOS, ablation = true, ablateOn = [SCENARIOS[0].name, SCENARIOS[2].name], buildings = 600, pop = 500 } = {}) {
    const out = { scenarios: {}, ablation: {}, hitches: null };
    let age = -1;
    for (const s of scenarios) {
      if (s.age !== age) { age = s.age; setup({ buildings, pop, age }); await frames(30); }
      await scenario(s);
      out.scenarios[s.name] = await measure(seconds);
      if (ablation && ablateOn.includes(s.name)) out.ablation[s.name] = await ablate(2);
    }
    if (ablation) {
      if (age !== 3) { setup({ buildings, pop, age: 3 }); await frames(30); }
      await scenario(SCENARIOS[0]);
      out.hitches = await hitches();
    }
    return out;
  }

  window.__bench = { setup, scenario, measure, ablate, hitches, run, SCENARIOS, frames, center: () => center };
  return 'ok';
})();
