import { describe, it, expect } from 'vitest';
import { HellMap, HW, HL, HELL_ZONES, HPOOL_LAVA, HPOOL_CHASM, Z_RIVER, Z_CLIFFS, Z_KINGDOM } from '../src/world/hell';
import { troopStats } from '../src/sim/army';
import { Hell, HellUnit, LEASH, RAID_FIRST, SECURE_WAVES, raidSize, raidKinds, raidStrength, DEMONS } from '../src/sim/hell';

const map = (seed = 1) => new HellMap(seed);
/** Fait tourner la simulation `t` secondes par pas de 1/20 s */
const run = (h: Hell, t: number, until?: () => boolean) => {
  for (let i = 0; i < t * 20; i++) { h.step(0.05); if (until?.()) return true; }
  return false;
};
/** Une simulation des Enfers sans démons (on y pose ceux du test) */
const empty = (seed = 1) => {
  const h = new Hell(map(seed));
  h.units.clear();
  for (const b of h.buildings.values()) { b.down = true; h.map.unblock(b.site); }
  return h;
};
const cellPos = (m: HellMap, k: number): [number, number] => [(k % HW) + 0.5, Math.floor(k / HW) + 0.5];

describe('Carte des Enfers', () => {
  it('est déterministe selon la graine', () => {
    const a = map(5), b = map(5), c = map(6);
    expect(a.open).toEqual(b.open);
    expect(a.pool).toEqual(b.pool);
    expect(a.vis).toEqual(b.vis);
    expect(a.open).not.toEqual(c.open);
  });

  it('mène du portail au royaume par au moins cinq zones, une forteresse dans chacune', () => {
    for (const seed of [1, 2, 3, 17, 2026]) {
      const m = map(seed);
      expect(HELL_ZONES.length).toBeGreaterThanOrEqual(6);
      for (let z = 1; z < Z_KINGDOM; z++) expect(m.zones[z].sites.filter((s) => s.kind === 'fortress')).toHaveLength(1);
      const king = m.zones[Z_KINGDOM].sites.find((s) => s.kind === 'kingdom')!;
      expect(king).toBeTruthy();
      // on atteint chaque bâtiment depuis le portail (le pourtour de son emprise)
      const d = m.distances(m.nearestWalkable(m.arrival[0], m.arrival[1]));
      for (const zn of m.zones) for (const s of zn.sites) {
        let ok = false;
        for (let a = 0; a < 16 && !ok; a++) {
          const c = m.nearestWalkable(s.x + Math.sin(a) * (s.r + 0.8), s.z + Math.cos(a) * (s.r + 0.8), 2);
          ok = c >= 0 && d[c] >= 0;
        }
        expect(ok, `${seed} ${s.kind} zone ${s.zone}`).toBe(true);
      }
      // le royaume est tout au fond
      expect(king.z).toBeGreaterThan(HL * 0.8);
      expect(m.portal[1]).toBeLessThan(12);
    }
  });

  it('a une rivière de lave franchie par des ponts, un abîme sur les falaises', () => {
    const m = map(3);
    let lava = 0, bridges = 0, chasm = 0;
    for (let k = 0; k < HW * HL; k++) {
      const z = Math.floor(k / HW), zi = m.zoneAt(z);
      if (zi === Z_RIVER && m.pool[k] === HPOOL_LAVA) lava++;
      if (zi === Z_RIVER && m.bridge[k]) bridges++;
      if (zi === Z_CLIFFS && m.pool[k] === HPOOL_CHASM) chasm++;
    }
    expect(lava).toBeGreaterThan(60);
    expect(bridges).toBeGreaterThan(4);
    expect(chasm).toBeGreaterThan(150);
    // la lave et l'abîme ne se traversent pas, les ponts si
    const lavaCell = [...m.pool.keys()].find((k) => m.pool[k] === HPOOL_LAVA && !m.bridge[k])!;
    expect(m.walkable(lavaCell % HW, Math.floor(lavaCell / HW))).toBe(false);
    const br = m.bridge.indexOf(1);
    expect(m.walkable(br % HW, Math.floor(br / HW))).toBe(true);
  });
});

describe('Faction des Enfers', () => {
  it('place les garnisons, patrouilles et bâtiments ; le seuil du portail est vide', () => {
    const h = new Hell(map(1));
    expect(h.garrison(0)).toHaveLength(0);
    for (let z = 1; z <= Z_KINGDOM; z++) expect(h.garrison(z).length).toBeGreaterThan(3);
    const kinds = new Set(h.alive('hell').map((u) => u.kind));
    for (const k of Object.keys(DEMONS)) expect(kinds.has(k)).toBe(true);
    expect(h.alive('hell').filter((u) => u.kind === 'king')).toHaveLength(1);
    expect(h.alive('hell').filter((u) => u.patrol).length).toBeGreaterThan(5);
    expect(h.standing().map((b) => b.kind).sort()).toContain('kingdom');
    // les démons des zones profondes sont plus coriaces
    const imp = (z: number) => h.garrison(z).find((u) => u.kind === 'imp')!.maxHp;
    expect(imp(5)).toBeGreaterThan(imp(1));
  });

  it('une unité du joueur va où on l’envoie, par le chemin (ponts compris)', () => {
    const h = empty(2), m = h.map;
    const [ax, az] = m.arrival, u = h.addPlayerUnit('soldier', troopStats('soldier', 1), ax, az);
    // (la rivière de lave s'ouvre une fois les grottes de braise conquises)
    h.conquered[1] = true;
    // de l'autre côté de la rivière de lave
    const goal = cellPos(m, m.nearestWalkable(m.spine[HELL_ZONES[Z_CLIFFS].z0 - 4] + 0.5, HELL_ZONES[Z_CLIFFS].z0 - 4, 4));
    h.order([u.id], { kind: 'move', x: goal[0], z: goal[1] });
    expect(run(h, 120, () => u.order === null)).toBe(true);
    expect(Math.hypot(u.x - goal[0], u.z - goal[1])).toBeLessThan(1);
    expect(u.state).toBe('idle');
  });

  it('un démon qui voit approcher le joueur donne l’alerte, sa garnison accourt et riposte', () => {
    const h = new Hell(map(1)), m = h.map;
    const post = m.zones[1].sites.find((s) => s.kind === 'outpost')!;
    const near = cellPos(m, m.nearestWalkable(post.x, post.z - 9, 4));
    const u = h.addPlayerUnit('knight', { ...troopStats('knight', 1), hp: 5000 }, near[0], near[1]);
    h.order([u.id], { kind: 'hold' });
    run(h, 6);
    const alerts = h.events.filter((e) => e.type === 'alert');
    expect(alerts.some((e) => e.type === 'alert' && e.zone === 1)).toBe(true);
    expect(h.alert[1]).toBeGreaterThan(0);
    // des démons de la zone le ciblent et l'ont frappé
    expect(h.garrison(1).some((d) => d.target === u.id)).toBe(true);
    run(h, 10);
    expect(u.hp).toBeLessThan(5000);
    // les autres zones dorment
    expect(h.alert[4]).toBe(0);
  });

  it('combat : une troupe solide vient à bout de diablotins ; un soldat seul tombe face à une brute', () => {
    const h = empty(1), m = h.map;
    const [x, z] = cellPos(m, m.nearestWalkable(m.spine[30] + 0.5, 30.5));
    const squad: HellUnit[] = [0, 1, 2, 3].map((i) => h.addPlayerUnit('soldier', troopStats('soldier', 1), x + (i % 2) * 0.6, z - 3 - Math.floor(i / 2) * 0.6));
    const imps = [0, 1, 2].map((i) => h.spawn('imp', x + i * 0.5, z + 1, 1));
    run(h, 30, () => imps.every((d) => d.hp <= 0));
    expect(imps.every((d) => d.hp <= 0)).toBe(true);
    expect(squad.filter((s) => s.hp > 0).length).toBeGreaterThanOrEqual(3);
    expect(h.events.filter((e) => e.type === 'death' && e.side === 'hell')).toHaveLength(3);

    const h2 = empty(1);
    const lone = h2.addPlayerUnit('soldier', troopStats('soldier', 1), x, z - 2);
    const brute = h2.spawn('brute', x, z + 1, 3);
    run(h2, 60, () => lone.hp <= 0);
    expect(lone.hp).toBe(0);
    expect(brute.hp).toBeGreaterThan(0);
  });

  it('les archers de braise tirent de loin ; un démon trop loin de son poste y retourne', () => {
    const h = empty(1), m = h.map;
    const [x, z] = cellPos(m, m.nearestWalkable(m.spine[34] + 0.5, 34.5));
    const archer = h.spawn('archer', x, z + 4, 1);
    const u = h.addPlayerUnit('soldier', { ...troopStats('soldier', 1), hp: 9999 }, x, z);
    h.order([u.id], { kind: 'hold' });
    run(h, 4);
    expect(h.events.some((e) => e.type === 'shot' && e.source === archer.id)).toBe(true);
    expect(Math.hypot(archer.x - u.x, archer.z - u.z)).toBeGreaterThan(2);
    // le soldat se replie vers le portail : l'archer le suit, puis renonce et rentre à son poste
    h.order([u.id], { kind: 'retreat' });
    run(h, 60, () => u.order === null);
    run(h, 25);
    expect(Math.hypot(archer.x - archer.home[0], archer.z - archer.home[1])).toBeLessThan(LEASH);
  });

  it('abattre la forteresse conquiert la zone ; abattre la citadelle, c’est la victoire', () => {
    const h = new Hell(map(1));
    const fort = h.standing(1).find((b) => b.kind === 'fortress')!;
    h.damage(fort, 1e6, -1);
    expect(fort.down).toBe(true);
    expect(h.conquered[1]).toBe(true);
    expect(h.events.some((e) => e.type === 'conquered' && e.zone === 1)).toBe(true);
    // l'emprise se libère : on marche sur les ruines
    expect(h.map.walkableAt(fort.site.x, fort.site.z)).toBe(true);
    const king = h.standing(Z_KINGDOM).find((b) => b.kind === 'kingdom')!;
    h.damage(king, 1e6, -1);
    expect(h.victory).toBe(true);
    expect(h.raidDue(1e6)).toBe(false);
  });

  it('les tours tirent sur l’ennemi à portée, l’armure retranche des coups', () => {
    const h = new Hell(map(1)), m = h.map;
    for (const u of h.alive('hell')) u.hp = 0;
    const post = h.standing(1).find((b) => b.kind === 'outpost')!;
    const p = cellPos(m, m.nearestWalkable(post.site.x, post.site.z - 3, 3));
    const u = h.addPlayerUnit('soldier', { ...troopStats('soldier', 1), hp: 9999 }, p[0], p[1]);
    h.order([u.id], { kind: 'hold' });
    run(h, 5);
    expect(u.hp).toBeLessThan(9999);
    const before = post.hp;
    h.damage(post, 3, u.id);
    expect(before - post.hp).toBe(1);
  });

  it('incursions : à intervalles, des vagues croissantes, sur l’île du portail seulement', () => {
    const h = new Hell(map(1));
    expect(h.raidDue(100)).toBe(false);
    expect(h.raidDue(100 + RAID_FIRST - 1)).toBe(false);
    expect(h.raidDue(100 + RAID_FIRST)).toBe(true);
    const sizes: number[] = [];
    let t = 100 + RAID_FIRST;
    for (let i = 0; i < SECURE_WAVES; i++) {
      const w = h.spawnRaid(t);
      expect(w.target).toBe('portal-island');
      sizes.push(w.units.length);
      // pas de nouvelle vague tant que celle-ci n'est pas finie
      expect(h.raidDue(h.nextRaid + 1)).toBe(false);
      h.endRaid(true, t + 30);
      expect(h.raidDue(t + 31)).toBe(false);
      t = h.nextRaid;
      expect(h.raidDue(t)).toBe(true);
    }
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    expect(sizes[0]).toBeLessThanOrEqual(3);
    // chaque zone conquise affaiblit les vagues
    expect(raidSize(6, 2)).toBeLessThan(raidSize(6, 0));
  });

  it('les vagues restent abordables ; une défaite ne les durcit pas ; l’île se sécurise en repoussant des vagues', () => {
    const h = new Hell(map(1));
    h.raidDue(0);
    let t = RAID_FIRST;
    // une défaite : la vague suivante a le même niveau, l'île « tient » depuis ce moment
    const w1 = h.spawnRaid(t);
    h.endRaid(false, t + 40);
    expect(h.raidsLost).toBe(1);
    expect(h.heldFor(t + 100)).toBe(60);
    t = h.nextRaid;
    expect(h.spawnRaid(t).units.length).toBe(w1.units.length);
    let secured = h.endRaid(true, t + 20);
    expect(secured).toBe(false);
    while (!h.islandSecured) { t = h.nextRaid; h.spawnRaid(t); secured = h.endRaid(true, t + 20); }
    expect(secured).toBe(true);
    expect(h.raidsRepelled).toBe(SECURE_WAVES);
    expect(h.events.some((e) => e.type === 'secured')).toBe(true);
    // jusqu'à la sécurisation, la plus grosse vague reste modeste (diablotins, une brute, un archer) : une tour et une
    // caserne en viennent à bout
    const hardest = raidStrength({ wave: 0, level: SECURE_WAVES, target: 'portal-island', units: raidKinds(SECURE_WAVES, raidSize(SECURE_WAVES)).map((k) => ({ kind: k, name: k, stats: DEMONS[k] })) });
    expect(hardest.hp).toBeLessThan(400);
    expect(raidKinds(SECURE_WAVES, raidSize(SECURE_WAVES))).not.toContain('chief');
    // l'île sécurisée : escarmouches plus rares et plus petites
    const gap = h.nextRaid - t;
    t = h.nextRaid;
    const w = h.spawnRaid(t);
    expect(w.units.length).toBeLessThanOrEqual(6);
    expect(h.nextRaid - t).toBeGreaterThan(gap);
    // plus tard, un chef mène les vagues
    expect(raidKinds(8, raidSize(8))).toContain('chief');
  });
  it('une forge renvoie des renforts à sa zone entamée', () => {
    const h = new Hell(map(1));
    const before = h.garrison(2).length;
    for (const u of h.garrison(2).slice(0, 3)) u.hp = 0;
    run(h, 50);
    expect(h.garrison(2).length).toBeGreaterThan(before - 3);
    expect(h.events.some((e) => e.type === 'spawn')).toBe(true);
  });

  it('se sauvegarde et se reprend', () => {
    const h = new Hell(map(4));
    const fort = h.standing(2).find((b) => b.kind === 'fortress')!;
    h.damage(fort, 1e6, -1);
    h.addPlayerUnit('archer', troopStats('archer', 1), h.map.arrival[0], h.map.arrival[1]);
    h.raidDue(10); h.spawnRaid(300); h.endRaid(true, 330);
    const s = JSON.parse(JSON.stringify(h.save()));
    const g = Hell.load(map(4), s);
    expect(g.conquered[2]).toBe(true);
    expect(g.wave).toBe(1);
    expect(g.raidsRepelled).toBe(1);
    expect(g.alive('player')).toHaveLength(1);
    expect(g.alive().length).toBe(h.alive().length);
    expect(g.map.walkableAt(fort.site.x, fort.site.z)).toBe(true);
  });
});
