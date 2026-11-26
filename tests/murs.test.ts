import { describe, it, expect } from 'vitest';
import { HellMap } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { HellBase, BASE_DEFS, BASE_R, Purse } from '../src/sim/hellBase';
import { wallLine, traceWall, WallPlan, WALL_MAX } from '../src/ui/wallPlan';
import { DecorSweep } from '../src/render/decorSweep';
import * as THREE from 'three';
import { palisadeGeo, gateGeo, gateAlongX, WALL_E, WALL_W, WALL_N, WALL_S } from '../src/render/hellBase';

/** Une « guerre » réduite à la base (ce que WallPlan lui demande) */
const warOf = (b: HellBase, p: Purse) => ({
  base: b, planBaseLine: (k: any, c: any) => b.planLine(k, c, p), buildBaseLine: (k: any, c: any, g?: number) => b.buildLine(k, c, p, g), buildBase: (k: any, x: number, z: number) => b.build(k, x, z, p),
}) as any;
const rich = (): Purse => ({ wood: 9999, stone: 9999, ore: 9999 });
/** La base avec son camp au seuil du portail ; `row` : la ligne de cases où l'on pose les murs, devant le camp */
const setup = () => {
  const m = new HellMap(1), h = new Hell(m), b = new HellBase(h, m);
  let camp: ReturnType<HellBase['build']> | null = null;
  for (let r = 0; r < 9 && !camp; r += 0.5) for (let a = 0; a < 16 && !camp; a++) {
    const x = m.arrival[0] + Math.sin(a * 0.39) * r, z = m.arrival[1] + 4 + Math.cos(a * 0.39) * r;
    if (b.canBuild('camp', x, z) === null) { const c = b.build('camp', x, z, rich()); if (typeof c !== 'string') camp = c; }
  }
  if (!camp || typeof camp === 'string') throw new Error('pas de place pour le camp');
  const cx = Math.floor(camp.site.x) + 0.5, cz = Math.floor(camp.site.z) + 3.5;
  const row = (n: number, x0 = cx - 2): [number, number][] => Array.from({ length: n }, (_, i) => [x0 + i, cz]);
  return { m, h, b, camp, cx, cz, row };
};

describe('murs : la palissade se trace en ligne', () => {
  it('une ligne libre : droite, diagonale ou quelconque, de cases raccordées par un côté, sans trous', () => {
    expect(wallLine([5.5, 5.5], [9.5, 5.5])).toEqual([[5.5, 5.5], [6.5, 5.5], [7.5, 5.5], [8.5, 5.5], [9.5, 5.5]]);
    expect(wallLine([5.5, 5.5], [5.5, 5.5])).toEqual([[5.5, 5.5]]);
    for (const [bx, bz] of [[9.5, 9.5], [9.5, 6.5], [2.5, 8.5], [3.5, 1.5], [6.5, 11.5], [5.5, 0.5]] as [number, number][]) {
      const l = wallLine([5.5, 5.5], [bx, bz]);
      expect(l[0]).toEqual([5.5, 5.5]);
      expect(l[l.length - 1]).toEqual([bx, bz]);
      for (let i = 1; i < l.length; i++) expect(Math.abs(l[i][0] - l[i - 1][0]) + Math.abs(l[i][1] - l[i - 1][1])).toBe(1);
    }
    // une diagonale franche n'est pas ramenée à l'axe dominant : elle va réellement d'un point à l'autre
    const d = wallLine([5.5, 5.5], [9.5, 9.5]);
    expect(d.length).toBe(9);
    expect(d.every(([x, z]) => Math.abs(x - z) <= 1)).toBe(true);
    // à l'envers aussi
    expect(wallLine([9.5, 5.5], [6.5, 5.5]).map((c) => c[0])).toEqual([9.5, 8.5, 7.5, 6.5]);
  });

  it('une diagonale se pose et ferme le passage aux marcheurs (pas de trou en biais)', () => {
    const { m, b, cx, cz } = setup(), p = rich();
    const tr = traceWall(b, [cx - 5, cz - 1], [cx + 3, cz + 3]);
    expect(tr.why).toBeNull();
    expect(tr.cells.length).toBeGreaterThan(7);
    expect(b.buildLine('palisade', tr.cells, p).built).toBe(tr.cells.length);
    // deux pans en diagonale ont toujours un pan voisin entre eux : rien ne se glisse en biais
    const walls = new Set(tr.cells.map(([x, z]) => `${Math.floor(x)},${Math.floor(z)}`));
    for (const [x, z] of tr.cells) for (const [dx, dz] of [[1, 1], [1, -1]]) {
      const ax = Math.floor(x), az = Math.floor(z);
      if (!walls.has(`${ax + dx},${az + dz}`)) continue;
      expect(m.walkable(ax + dx, az) && m.walkable(ax, az + dz)).toBe(false);
    }
  });

  it('un bâtiment sur la ligne la ferme de lui-même : le mur le saute ; hors de portée, la case fautive est nommée et marquée', () => {
    const { b, cx, cz } = setup(), p = rich(), still = { a: false, b: false };
    const a: [number, number] = [cx - 3, cz], c: [number, number] = [cx + 3, cz];
    expect(traceWall(b, a, c, still).cells.length).toBe(7);
    const t = b.build('tower', cx, cz, p);
    if (typeof t === 'string') throw new Error(t);
    const tr = traceWall(b, a, c, still);
    expect(tr.why).toBeNull();
    // la tour tient sa case : le mur la saute, ses deux tronçons la touchent (pas de trou)
    const at = (x: number) => tr.cells.some(([cx2, cz2]) => Math.floor(cx2) === Math.floor(x) && Math.floor(cz2) === Math.floor(cz));
    expect(at(cx)).toBe(false);
    expect(at(cx - 1) && at(cx + 1)).toBe(true);
    expect(tr.cells[0]).toEqual(a);
    expect(tr.cells[tr.cells.length - 1]).toEqual(c);
    // hors de la portée du camp : refusé, la raison dite, la case fautive marquée (rouge vif à l'aperçu)
    // le pointeur lâché au-delà de la paroi : le mur s'arrête contre elle
    const far = traceWall(b, a, [cx + BASE_R + 4, cz], still);
    expect(far.why).toBeNull();
    expect(b.sealed(...far.cells[far.cells.length - 1])).toBe(true);
    // vers une zone encore aux démons : refusé, la raison dite, la case fautive marquée (rouge vif à l'aperçu)
    const deep = traceWall(b, a, [cx - 3, cz + 8], still);
    expect(deep.why).toMatch(/conquérir/);
    expect(deep.bad!.some((x) => x)).toBe(true);
    expect(deep.bad![0]).toBe(false);
    // trop long
    expect(traceWall(b, a, [cx + 3, cz + 2 + WALL_MAX]).why).not.toBeNull();
  });

  it('le coût est proportionnel à la longueur, et la pose suit l’aperçu', () => {
    const { b, row } = setup(), p = { wood: 100, stone: 0, ore: 0 };
    const cells = row(6);
    const plan = b.planLine('palisade', cells, p);
    expect(plan.n).toBe(6);
    expect(plan.cost.wood).toBe(6 * BASE_DEFS.palisade.cost.wood);
    const r = b.buildLine('palisade', cells, p);
    expect(r.built).toBe(6);
    expect(p.wood).toBe(100 - 48);
    expect(b.countOf('palisade')).toBe(6);
    // reposer sur le même mur ne coûte rien
    expect(b.planLine('palisade', cells, p).n).toBe(0);
    expect(b.buildLine('palisade', cells, p).built).toBe(0);
    expect(p.wood).toBe(52);
  });

  it('faute de bois, on pose ce qu’on peut payer, l’aperçu montre le reste en refus', () => {
    const { b, row } = setup(), p = { wood: 20, stone: 0, ore: 0 };
    const plan = b.planLine('palisade', row(5), p);
    expect(plan.why.map((w) => w === null)).toEqual([true, true, false, false, false]);
    expect(b.buildLine('palisade', row(5), p).built).toBe(2);
  });

  it('au-delà de la portée du camp, les cases sont refusées', () => {
    const { b, camp, cz } = setup();
    const far: [number, number][] = [[camp.site.x + BASE_R + 3.5, cz]];
    expect(b.planLine('palisade', far, rich()).why[0]).not.toBeNull();
  });

  it('un mur qui ferme tout le passage reçoit une porte : les nôtres passent, les démons non', () => {
    const { m, b, cz } = setup(), p = rich();
    // toute la largeur de la salle, d'un bord à l'autre
    const full: [number, number][] = [];
    for (let x = 0; x < m.W; x++) if (m.walkable(x, Math.floor(cz))) full.push([x + 0.5, cz]);
    const plan = b.planLine('palisade', full, p);
    expect(plan.why.every((w) => w === null)).toBe(true);
    expect(plan.gate).toBeGreaterThanOrEqual(0);
    expect(plan.cost.wood).toBe((full.length - 1) * BASE_DEFS.palisade.cost.wood + BASE_DEFS.gate.cost.wood);
    const r = b.buildLine('palisade', full, p);
    expect(r.gate).toBe(true);
    expect(r.built).toBe(full.length);
    expect(b.countOf('gate')).toBe(1);
    // d'un côté à l'autre du mur : un chemin pour nous (par la porte), aucun pour un démon
    const n = m.nearestWalkable(full[0][0] + 2, cz - 2, 3), s2 = m.nearestWalkable(full[0][0] + 2, cz + 2, 3);
    expect(m.route(n, s2)).not.toBeNull();
    expect(m.route(n, s2, true)).toBeNull();
  });

  it('A puis B (ou un glissé) pose le mur ; B devient le A du suivant ; un clic sur A abandonne', () => {
    const { b, cx, cz } = setup(), p = rich(), w = new WallPlan(), war = warOf(b, p);
    const pt = (x: number, z: number): [number, number] => [x, z];
    expect(w.press(pt(cx - 3, cz - 1))).toBe('start');
    expect(w.release(pt(cx - 3, cz - 1))).toBe(false);
    expect(w.a).toEqual([cx - 3, cz - 1]);
    const pv = w.preview(war, 'palisade', pt(cx + 3, cz + 2));
    expect(pv.cells.length).toBeGreaterThan(5);
    expect(pv.cells.every((c) => c.ok)).toBe(true);
    // (accroché aux parois, ce mur ferme la salle : une porte s'y ouvre, elle se voit à l'aperçu et se paie)
    const gates = pv.cells.filter((c) => c.gate).length;
    expect(pv.cost).toBe(`${pv.n * 8 + gates * BASE_DEFS.gate.cost.wood} bois`);
    expect(w.press(pt(cx + 3, cz + 2))).toBe('lay');
    expect(w.build(war, 'palisade', pt(cx + 3, cz + 2))).toMatch(/posés/);
    expect(b.countOf('palisade')).toBe(pv.n);
    expect(w.a).toEqual(pv.cells[pv.cells.length - 1] && [pv.cells[pv.cells.length - 1].x, pv.cells[pv.cells.length - 1].z]);
    // le mur suivant part de B sans le reposer
    const before = b.countOf('palisade'), [ax, az] = w.a!;
    expect(w.build(war, 'palisade', pt(ax, az + 1))).toMatch(/posé/);
    expect(b.countOf('palisade')).toBe(before + 1);
    // un glissé : appui sur A, relâché ailleurs
    w.reset();
    expect(w.press(pt(cx - 3, cz))).toBe('start');
    w.drag(pt(cx - 3, cz + 3));
    expect(w.release(pt(cx - 3, cz + 3))).toBe(true);
    // un clic sur A abandonne le tracé
    w.reset(); w.press(pt(cx, cz + 1)); w.release(pt(cx, cz + 1));
    expect(w.press(pt(cx, cz + 1))).toBe('same');
    expect(w.a).toBeNull();
  });
});

/** Une rangée de la salle du seuil, devant le camp, bornée par la paroi : sa première et sa dernière case libres */
const span = (b: HellBase, z: number): [number, number] => {
  let x0 = -1, x1 = -1;
  for (let x = 0; x < b.map.W; x++) if (b.wallCell(x + 0.5, z) === 'ok') { if (x0 < 0) x0 = x; x1 = x; }
  return [x0 + 0.5, x1 + 0.5];
};

describe('murs : collés à la paroi, par-dessus le décor', () => {
  it('un bout lâché à une ou deux cases de la paroi s’y accroche : le mur va d’une paroi à l’autre sans trou', () => {
    const { m, b, cz } = setup();
    const [x0, x1] = span(b, cz);
    expect(x1 - x0).toBeGreaterThan(8);
    for (const gap of [1, 2]) {
      const t = traceWall(b, [x0 + gap, cz], [x1 - gap, cz]);
      expect(t.why).toBeNull();
      expect(t.cells[0]).toEqual([x0, cz]);
      expect(t.cells[t.cells.length - 1]).toEqual([x1, cz]);
      // chaque bout touche la paroi par un côté
      expect(m.walkable(Math.floor(x0) - 1, Math.floor(cz))).toBe(false);
      expect(m.walkable(Math.floor(x1) + 1, Math.floor(cz))).toBe(false);
    }
    // trois cases de la paroi : trop loin, le bout reste où on l'a lâché
    expect(traceWall(b, [x0 + 3, cz], [x1 - 3, cz]).cells[0]).toEqual([x0 + 3, cz]);
    // le pointeur lâché sur la paroi même : le mur s'arrête contre elle
    const t = traceWall(b, [x0 + 2, cz], [x1 + 3, cz]);
    expect(t.why).toBeNull();
    expect(t.cells[t.cells.length - 1]).toEqual([x1, cz]);
  });

  it('fermer la salle d’une paroi à l’autre en un seul tracé : posé en entier, une porte au milieu, aucun démon ne passe', () => {
    const { m, b, cz } = setup(), p = rich(), w = new WallPlan(), war = warOf(b, p);
    const [x0, x1] = span(b, cz);
    w.press([x0 + 2, cz]);
    w.drag([x1 - 1, cz]);
    expect(w.release([x1 - 1, cz])).toBe(true);
    const pv = w.preview(war, 'palisade', [x1 - 1, cz]);
    expect(pv.why).toBeNull();
    expect(pv.cells.every((c) => c.ok)).toBe(true);
    expect(pv.cells.filter((c) => c.gate).length).toBe(1);
    expect(w.build(war, 'palisade', [x1 - 1, cz])).toMatch(/porte pour vos troupes/);
    expect(b.countOf('palisade') + b.countOf('gate')).toBe(x1 - x0 + 1);
    const n = m.nearestWalkable((x0 + x1) / 2, cz - 2, 3), s2 = m.nearestWalkable((x0 + x1) / 2, cz + 2, 3);
    expect(m.route(n, s2, true)).toBeNull();
    expect(m.route(n, s2)).not.toBeNull();
  });

  it('« porte ici » au bout d’un mur qui ferme la salle : une seule porte, la nôtre', () => {
    const { b, cz } = setup(), p = rich(), w = new WallPlan(), war = warOf(b, p);
    const [x0, x1] = span(b, cz);
    w.press([x0, cz]); w.release([x0, cz]);
    expect(w.buildWithGate(war, [x1, cz])).toMatch(/Porte posée/);
    expect(b.countOf('gate')).toBe(1);
    expect(b.gateAt(x1, cz)).not.toBeNull();
  });

  it('le décor au sol des cases murées disparaît ; l’aperçu le cache le temps du survol', () => {
    const W = 10, sweep = new DecorSweep(W);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 3);
    const at = (i: number, x: number, z: number) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z));
    at(0, 2.5, 3.5); at(1, 5.5, 3.5); at(2, 3.1, 3.5);
    sweep.add(mesh);
    const scale = (i: number) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return new THREE.Vector3().setFromMatrixScale(m).x; };
    const c = (x: number, z: number) => z * W + x;
    expect(sweep.count(c(3, 3))).toBe(1);
    expect(sweep.count(c(2, 3))).toBe(2);
    // l'aperçu d'un mur sur la case (3,3) : le cristal qui y déborde se cache, puis revient
    sweep.peek([c(3, 3)]);
    expect([scale(0), scale(1), scale(2)]).toEqual([1, 1, 0]);
    sweep.peek([]);
    expect(scale(2)).toBe(1);
    // le mur posé sur (2,3) : ce qui s'y tient s'en va pour de bon
    sweep.clear([c(2, 3)]);
    sweep.peek([c(9, 9)]); sweep.peek([]);
    expect([scale(0), scale(1), scale(2)]).toEqual([0, 1, 0]);
  });
});

describe('murs : la porte', () => {
  it('se pose sur un pan de palissade (qui s’efface) ou à son bout, pas ailleurs', () => {
    const { b, cx, cz, row } = setup(), p = rich();
    expect(b.canBuild('gate', cx, cz + 3, p)).toMatch(/palissade/);
    b.buildLine('palisade', row(5), p);
    expect(b.canBuild('gate', cx, cz - 0.0, p)).toBeNull();
    const g = b.build('gate', cx, cz, p);
    expect(typeof g).not.toBe('string');
    expect(b.countOf('palisade')).toBe(4);
    expect(b.countOf('gate')).toBe(1);
    // à son bout aussi
    expect(b.canBuild('gate', cx + 3, cz, p)).toBeNull();
    // une seule porte par case
    expect(b.canBuild('gate', cx, cz, p)).toMatch(/porte/);
    expect(b.canBuild('palisade', cx, cz, p)).toMatch(/porte/);
  });

  it('une porte s’insère entre deux points d’un mur en le coupant (survol : le pan le plus proche)', () => {
    const { b, cx, cz, row } = setup(), p = rich();
    b.buildLine('palisade', row(7), p);
    expect(b.wallNearest(cx + 0.2, cz + 0.9, 1.2)!.site.x).toBe(cx);
    expect(b.wallNearest(cx, cz + 5, 1.2)).toBeNull();
    const g = b.build('gate', cx + 1, cz, p);
    expect(typeof g).not.toBe('string');
    expect(b.countOf('palisade')).toBe(6);
    expect(b.gateAt(cx + 1, cz)).not.toBeNull();
    // un mur tracé par-dessus la porte la garde (pas de pan reposé, pas de coût)
    const plan = b.planLine('palisade', row(7), p);
    expect(plan.n).toBe(0);
  });

  it('« porte ici » : le mur s’arrête au point visé par une porte, et le suivant part de là', () => {
    const { b, cx, cz } = setup(), p = rich(), w = new WallPlan(), war = warOf(b, p);
    w.press([cx - 2, cz]); w.release([cx - 2, cz]);
    expect(w.buildWithGate(war, [cx + 1, cz])).toMatch(/Porte posée/);
    expect(b.countOf('palisade')).toBe(3);
    expect(b.countOf('gate')).toBe(1);
    expect(b.gateAt(cx + 1, cz)).not.toBeNull();
    expect(w.build(war, 'palisade', [cx + 4, cz])).toMatch(/posés/);
    // (trois pans, et le bout accroché à la paroi si elle est à deux cases)
    expect(b.countOf('palisade')).toBeGreaterThanOrEqual(6);
    expect(b.countOf('gate')).toBe(1);
  });

  it('les nôtres la franchissent, les démons non, jusqu’à ce qu’elle tombe', () => {
    const { m, h, b, cx, cz, row } = setup(), p = rich();
    b.buildLine('palisade', row(5), p);
    const g = b.build('gate', cx, cz, p);
    if (typeof g === 'string') throw new Error(g);
    const gx = Math.floor(cx), gz = Math.floor(cz);
    expect(m.walkable(gx, gz)).toBe(true);
    expect(m.walkable(gx, gz, true)).toBe(false);
    // les pans voisins bloquent tout le monde
    expect(m.walkable(gx + 1, gz)).toBe(false);
    expect(m.walkable(gx + 1, gz, true)).toBe(false);
    // un chemin droit à travers la porte pour nous, aucun passage par elle pour un démon
    const from = gz * m.W + gx, nearN = (gz - 1) * m.W + gx, nearS = (gz + 1) * m.W + gx;
    expect(m.route(nearN, nearS)).toEqual([nearN, from, nearS]);
    expect(m.route(nearN, nearS, true)!.includes(from)).toBe(false);
    // la porte abattue : les démons passent
    h.damage(g, 1e6, -1);
    expect(m.walkable(gx, gz, true)).toBe(true);
  });

  it('les démons l’attaquent comme un mur', () => {
    const { m, h, b, cx, cz, row } = setup(), p = rich();
    b.buildLine('palisade', row(5), p);
    const g = b.build('gate', cx, cz, p);
    if (typeof g === 'string') throw new Error(g);
    const k = m.nearestWalkable(cx, cz - 1.5, 2, true), d = h.addRaider('imp', { hp: 1e6, dmg: 4, range: 0.5, speed: 2.6, cooldown: 0.5, sight: 20, radius: 0.22 }, (k % m.W) + 0.5, Math.floor(k / m.W) + 0.5);
    d.target = g.id;
    const hp = g.hp;
    for (let i = 0; i < 100; i++) { h.step(0.1); h.events.length = 0; }
    expect(g.hp).toBeLessThan(hp);
    // (il n'est jamais entré dans la case de la porte)
    expect(Math.floor(d.z)).not.toBe(Math.floor(cz) + 1);
  });

  it('une ancienne sauvegarde sans murs se charge ; la nouvelle garde les portes', () => {
    const { m, h, b, cx, cz, row } = setup(), p = rich();
    b.buildLine('palisade', row(5), p);
    b.build('gate', cx, cz, p);
    const s = JSON.parse(JSON.stringify(b.save()));
    const m2 = new HellMap(1), h2 = new Hell(m2), b2 = HellBase.load(h2, m2, s);
    expect(b2.countOf('gate')).toBe(1);
    expect(b2.countOf('palisade')).toBe(4);
    expect(m2.walkable(Math.floor(cx), Math.floor(cz))).toBe(true);
    expect(m2.walkable(Math.floor(cx), Math.floor(cz), true)).toBe(false);
    expect(m.version).toBeGreaterThan(0);
    expect(h.buildings.size).toBeGreaterThan(0);
  });
});

describe('murs : les formes se raccordent', () => {
  it('chaque case de palissade a sa forme selon ses côtés reliés, une porte son axe', () => {
    const geo = [0, WALL_E | WALL_W, WALL_N | WALL_S, WALL_N | WALL_E, 15].map((k) => palisadeGeo(k).attributes.position.count);
    expect(geo[0]).toBe(geo[1]);
    expect(geo[4]).toBeGreaterThan(geo[3]);
    expect(geo[3]).toBeGreaterThan(geo[1] / 2);
    expect(gateAlongX(0)).toBe(true);
    expect(gateAlongX(WALL_N)).toBe(false);
    expect(gateAlongX(WALL_E | WALL_N)).toBe(true);
    const g = gateGeo();
    expect(g.solid.attributes.position.count).toBeGreaterThan(0);
    expect(g.leaf.attributes.position.count).toBeGreaterThan(0);
    // les pans voisins se touchent : le pieu le plus avancé s'arrête avant le bord de la case
    const pg = palisadeGeo(WALL_E); pg.computeBoundingBox(); const bb = pg.boundingBox!;
    expect(bb.max.x).toBeLessThanOrEqual(0.5);
  });
});
