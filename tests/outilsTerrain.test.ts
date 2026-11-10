import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize, VEG_FOREST, VEG_CAVE, VEG_VOLCANO, VEG_FISSURE, TREE_LINE, MAX_H } from '../src/world/world';
import { newWorld, addDefaultDecor } from '../src/world/mapgen';
import { loneTreeAt } from '../src/render/vegetation';
import { sculpt, CLIFF_STEP, raiseVolcano, removeVolcano } from '../src/world/terraform';
import { Eruptions } from '../src/render/eruption';

function monde() {
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Première case qui vérifie `ok`, loin du bord */
function trouve(w: World, ok: (x: number, z: number) => boolean): [number, number] {
  for (let z = 8; z < N - 8; z++) for (let x = 8; x < N - 8; x++) if (ok(x, z)) return [x, z];
  throw new Error('introuvable');
}

/** Recharge le monde depuis sa sauvegarde (en passant par le texte, comme le jeu) */
function recharge(w: World, edit?: (d: any) => void) {
  const d = JSON.parse(JSON.stringify(w.toJSON()));
  edit?.(d);
  const r = new World();
  r.mapId = w.mapId; r.seed = w.seed;
  r.fromJSON(d);
  return r;
}

describe('gomme : les arbres de la carte', () => {
  beforeAll(() => setMapSize(192));

  it('efface une forêt de la carte et les arbres isolés des prairies, même après rechargement et annulable', () => {
    const w = monde();
    const [fx, fz] = trouve(w, (x, z) => w.veg[w.ci(x, z)] === VEG_FOREST);
    const [lx, lz] = trouve(w, (x, z) => loneTreeAt(w, x, z));
    const avant = w.snapshot();
    expect(w.erase(fx, fz)).toBe(true);
    expect(w.veg[w.ci(fx, fz)]).toBe(0);
    // la forêt effacée ne laisse pas d'arbre isolé derrière elle
    expect(loneTreeAt(w, fx, fz)).toBe(false);
    expect(w.erase(lx, lz)).toBe(true);
    expect(loneTreeAt(w, lx, lz)).toBe(false);
    // rien de plus à effacer
    expect(w.erase(lx, lz)).toBe(false);
    const r = recharge(w);
    expect(loneTreeAt(r, lx, lz)).toBe(false);
    expect(r.veg[r.ci(fx, fz)]).toBe(0);
    // Ctrl+Z : l'arbre revient
    w.restore(avant);
    expect(loneTreeAt(w, lx, lz)).toBe(true);
    expect(w.veg[w.ci(fx, fz)]).toBe(VEG_FOREST);
  });

  it('on ne plante pas de forêt au-dessus de la limite des arbres', () => {
    const w = monde();
    const [x, z] = trouve(w, (cx, cz) => w.cellAvg(cx, cz) > TREE_LINE + 0.3 && w.cellSlope(cx, cz) < 1 && !w.veg[w.ci(cx, cz)] && !w.occ[w.ci(cx, cz)]);
    expect(w.setVeg(x, z, VEG_FOREST)).toBe(false);
    const [lx, lz] = trouve(w, (cx, cz) => w.cellAvg(cx, cz) > 1 && w.cellAvg(cx, cz) < TREE_LINE - 1 && w.cellSlope(cx, cz) < 0.5 && !w.veg[w.ci(cx, cz)] && !w.occ[w.ci(cx, cz)] && !w.decor[w.ci(cx, cz)] && !w.lake[w.ci(cx, cz)]);
    expect(w.setVeg(lx, lz, VEG_FOREST)).toBe(true);
  });
});

/** Un replat dégagé de 13 × 13 cases (ni bâtiment, ni route, ni eau, ni décor), son centre */
function replat(w: World): [number, number] {
  return trouve(w, (x, z) => {
    if (x < 10 || z < 10 || x > N - 11 || z > N - 11) return false;
    const h = w.cellAvg(x, z);
    if (h < 1 || h > 3.5) return false;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const k = w.ci(x + dx, z + dz);
      if (w.occ[k] || w.road[k] || w.lake[k] || w.decor[k] || w.veg[k] >= VEG_CAVE || Math.abs(w.cellAvg(x + dx, z + dz) - h) > 0.4) return false;
    }
    return true;
  });
}

describe('falaise', () => {
  beforeAll(() => setMapSize(192));

  it('sur le plat, un seul passage dresse un gradin à paroi franche (Maj : il se creuse)', () => {
    const w = monde();
    const [x, z] = replat(w), h0 = w.hAt(x + 0.5, z + 0.5), ctx = { target: h0 };
    expect(sculpt(w, 'cliff', x + 0.5, z + 0.5, 3, 0.016, ctx)).toBe(true);
    // tout le disque d'un coup, à un gradin au-dessus du clic
    expect(w.h(x, z)).toBeCloseTo(h0 + CLIFF_STEP, 4);
    expect(w.h(x + 2, z)).toBeCloseTo(h0 + CLIFF_STEP, 4);
    // juste hors du pinceau, le sol n'a pas bougé : la paroi fait tout le gradin d'une case à l'autre
    expect(w.h(x + 4, z) - w.h(x + 3, z)).toBeLessThan(-CLIFF_STEP * 0.7);
    // repasser ne change plus rien
    expect(sculpt(w, 'cliff', x + 0.5, z + 0.5, 3, 0.016, ctx)).toBe(false);
    // le relief affiché garde la marche
    w.updateVis();
    expect(w.hAt(x + 0.5, z + 0.5) - h0).toBeGreaterThan(CLIFF_STEP * 0.9);
    const w2 = monde(), c2 = { target: w2.hAt(x + 0.5, z + 0.5), dig: true };
    sculpt(w2, 'cliff', x + 0.5, z + 0.5, 3, 0.016, c2);
    expect(w2.h(x, z)).toBeCloseTo(c2.target - CLIFF_STEP, 4);
  });
});

/** Le lac de lave ne déborde nulle part : à sa portée, dans chaque direction, la paroi dépasse sa surface */
function lacContenu(w: World, cell: number) {
  const p = w.lavaPool(cell % N, Math.floor(cell / N));
  if (p.vent) return p;
  p.reach.forEach((r, a) => {
    const t = (a / p.reach.length) * Math.PI * 2;
    expect(w.hAt(p.x + Math.cos(t) * r, p.z + Math.sin(t) * r)).toBeGreaterThan(p.level - 0.15);
    // et en deçà, la lave couvre le sol (elle ne flotte pas au-dessus du vide)
    for (let q = 0.2; q < r - 0.1; q += 0.2) expect(w.hAt(p.x + Math.cos(t) * q, p.z + Math.sin(t) * q)).toBeLessThan(p.level + 0.02);
  });
  return p;
}

describe('volcan sculpté', () => {
  beforeAll(() => setMapSize(192));

  /** Un volcan neuf (pinceau 3) sur un replat, et la case de son cratère */
  function volcan(): [World, number, number, number] {
    const w = monde(), [x, z] = replat(w);
    expect(raiseVolcano(w, x + 0.5, z + 0.5, 3)).toBe(true);
    w.updateVis();
    return [w, w.ci(x, z), x, z];
  }

  it('le lac de lave reste dans la cuvette du cratère, même éventré, comblé ou taillé en falaise', () => {
    const [w, cell, x, z] = volcan();
    const intact = lacContenu(w, cell);
    expect(intact.vent).toBe(false);
    expect(intact.level).toBeGreaterThan(intact.floor + 0.1);
    // une brèche dans le rebord : la lave baisse sous le col, elle ne sort plus en l'air par la brèche
    for (let i = 0; i < 60; i++) sculpt(w, 'lower', x + 3.5, z + 0.5, 2, 0.05, { target: 0 });
    w.updateVis();
    lacContenu(w, cell);
    // la falaise taillée en travers du cône
    sculpt(w, 'cliff', x + 0.5, z + 2.5, 2, 0.05, { target: w.hAt(x + 0.5, z + 2.5) });
    w.updateVis();
    lacContenu(w, cell);
    // le cratère aplani : plus de cuvette, seule la bouche rougeoie (au ras du sol)
    const top = w.hAt(x + 3.5, z + 0.5) + 3;
    for (let i = 0; i < 40; i++) sculpt(w, 'flatten', x + 0.5, z + 0.5, 3, 0.05, { target: top });
    w.updateVis();
    const flat = lacContenu(w, cell);
    expect(flat.vent).toBe(true);
    expect(Math.abs(flat.level - w.hAt(flat.x, flat.z))).toBeLessThan(0.1);
  });

  it('pendant une éruption, la lave suit le relief sculpté ; un volcan rasé s’éteint', () => {
    const [w, cell] = volcan();
    const e = new Eruptions(w);
    expect(e.start(cell)).toBe(true);
    for (let i = 0; i < 80; i++) e.update(0.1);
    const flows = (e as any).list[0].flows as { mesh: THREE.Mesh; pts: [number, number][] }[];
    expect(flows.length).toBeGreaterThan(0);
    // l'écart le plus grand entre la lave et le sol
    const ecart = () => {
      let worst = 0;
      for (const fl of (e as any).list.flatMap((q: any) => q.flows)) {
        const p = fl.mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) worst = Math.max(worst, Math.abs(p.getY(i) - Math.max(0.02, w.hAt(p.getX(i), p.getZ(i)))));
      }
      return worst;
    };
    expect(ecart()).toBeLessThan(0.3);
    // une fosse sous une coulée, une butte sous une autre
    const [ax, az] = flows[0].pts[Math.floor(flows[0].pts.length / 2)];
    for (let i = 0; i < 40; i++) sculpt(w, 'lower', ax, az, 2, 0.05, { target: 0 });
    const [bx, bz] = flows[flows.length - 1].pts[Math.floor(flows[flows.length - 1].pts.length / 2)];
    for (let i = 0; i < 20; i++) sculpt(w, 'raise', bx, bz, 2, 0.05, { target: 0 });
    w.updateVis();
    e.update(0.1);
    expect(ecart()).toBeLessThan(0.3);
    // rasé en pleine éruption : plus de bombes, les coulées s'effacent, et il ne se réveille plus
    expect(removeVolcano(w, cell)).toBe(true);
    w.updateVis();
    for (let i = 0; i < 30; i++) e.update(0.1);
    expect(e.active).toBe(false);
    expect((e as any).list.length).toBe(0);
    expect(e.start(cell)).toBe(false);
  });

  it('ni plantation ni bâtiment n’effacent la marque du cratère', () => {
    const [w, cell, x, z] = volcan();
    expect(w.setVeg(x, z, VEG_FOREST)).toBe(false);
    expect(w.veg[cell]).toBe(VEG_VOLCANO);
    expect(w.canPlace('house', x, z)).toBe('Le cratère d’un volcan est ici');
  });
});

describe('faille au pinceau', () => {
  beforeAll(() => setMapSize(192));

  it('en glissant, un ravin se creuse le long du tracé ; c’est une entrée, on n’y bâtit pas, la gomme le comble', () => {
    const w = monde(), [x, z] = replat(w), y0 = w.hAt(x + 0.5, z + 0.5);
    const n = w.digRiftAlong(x - 4.5, z + 0.5, x + 5.5, z + 0.5, 1.5);
    // une bande de trois cases de large sur dix de long
    expect(n).toBeGreaterThanOrEqual(30);
    for (let dx = -4; dx <= 5; dx++) for (const dz of [-1, 0, 1]) expect(w.rift[w.ci(x + dx, z + dz)]).toBe(1);
    expect(w.rift[w.ci(x, z + 3)]).toBe(0);
    // le sol de jeu ne bouge pas ; le relief affiché se creuse, sans eau au fond
    w.updateVis();
    expect(w.cellAvg(x, z)).toBeGreaterThan(0.9);
    expect(y0 - w.hAt(x + 0.5, z + 0.5)).toBeGreaterThan(2);
    expect(w.seaAt(x + 0.5, z + 0.5, MAX_H)).toBe(false);
    // hors du ravin, rien ne change
    expect(Math.abs(w.hAt(x + 0.5, z + 4.5) - y0)).toBeLessThan(0.6);
    // un décor : ni bâtiment ni route ; une entrée pour les expéditions (et le monde souterrain)
    expect(w.canPlace('house', x, z)).toBe('Une grotte ou une faille est ici');
    expect(w.canRoad(x, z)).toBe(false);
    expect(w.entranceAt(x + 0.5, z + 0.5)).toBeGreaterThanOrEqual(0);
    expect(w.outpostEntrance(x - 1, z + 2, 1)).toBeGreaterThanOrEqual(0);
    expect(w.riftEntrances().length).toBeGreaterThanOrEqual(1);
    // gardé à la sauvegarde
    const r = recharge(w);
    expect(r.rift[r.ci(x, z)]).toBe(1);
    // la gomme comble case par case
    expect(w.erase(x, z)).toBe(true);
    expect(w.rift[w.ci(x, z)]).toBe(0);
    expect(w.canPlace('house', x, z)).not.toBe('Une grotte ou une faille est ici');
  });

  it('les failles de la carte sont des ravins ; pas de faille sur un bâtiment, une route ou l’eau', () => {
    const w = monde();
    expect(w.rift.includes(1)).toBe(true);
    expect(w.veg.includes(VEG_FISSURE)).toBe(false);
    const [x, z] = replat(w);
    w.place('house', x, z, 0, true, 1, false);
    w.setRoad(x + 3, z, true);
    expect(w.digRift(x, z)).toBe(false);
    expect(w.digRift(x + 3, z)).toBe(false);
    const [sx, sz] = trouve(w, (cx, cz) => w.cellAvg(cx, cz) < -0.5);
    expect(w.digRift(sx, sz)).toBe(false);
  });

  it('une ancienne sauvegarde avec une faille d’un clic se charge : la faille devient un ravin à la même place, qui sert d’entrée', () => {
    const w = monde(), [x, z] = replat(w);
    const legacy = w.decorCells(x, z, VEG_FISSURE);
    // la sauvegarde d'avant : pas de champ rift ni de marque decor, la faille est une case de veg (8)
    const r = recharge(w, (d) => { delete d.rift; delete d.decor; d.veg.push(w.ci(x, z), VEG_FISSURE); });
    expect(r.veg[r.ci(x, z)]).toBe(0);
    for (const k of legacy) expect(r.rift[k]).toBe(1);
    addDefaultDecor(r, 2026);
    r.updateVis();
    // à la même place, de la même emprise : on n'y bâtit toujours pas, et c'est une entrée
    for (const k of legacy) expect(r.decor[k]).toBe(VEG_FISSURE);
    expect(r.entranceAt(x + 0.5, z + 0.5)).toBeGreaterThanOrEqual(0);
    expect(r.ravine.some((v) => v > 0.5)).toBe(true);
    // sa faille compte : le premier chargement (sans la marque des décors) n'en ajoute pas d'autres
    let n = 0;
    for (let k = 0; k < N * N; k++) if (r.rift[k]) n++;
    expect(n).toBe(new Set(legacy).size);
  });
});

describe('décors de la carte effacés par le joueur', () => {
  beforeAll(() => setMapSize(192));

  it('une grotte effacée ne revient pas au chargement ; une ancienne sauvegarde reçoit les siennes une fois', () => {
    const w = monde();
    expect(w.decorDone).toBe(true);
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_CAVE) w.erase(k % N, Math.floor(k / N));
    expect(w.veg.includes(VEG_CAVE)).toBe(false);
    const r = recharge(w);
    addDefaultDecor(r, 2026);
    expect(r.veg.includes(VEG_CAVE)).toBe(false);
    // une sauvegarde d'avant la marque : ses décors manquants sont posés une fois, puis elle la reçoit
    const old = recharge(w, (d) => { delete d.decor; });
    expect(old.decorDone).toBe(false);
    addDefaultDecor(old, 2026);
    expect(old.veg.includes(VEG_CAVE)).toBe(true);
    expect(old.decorDone).toBe(true);
  });

  it('le pétrole, dont dépend l’âge moderne, revient toujours sur une carte qui n’en a plus', () => {
    const w = monde();
    const r = recharge(w, (d) => { d.oil = []; });
    expect(r.oil.includes(1)).toBe(false);
    addDefaultDecor(r, 2026);
    expect(r.oil.includes(1)).toBe(true);
  });
});
