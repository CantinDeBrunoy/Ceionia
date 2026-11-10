import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize, VEG_FOREST, VEG_CAVE, TREE_LINE } from '../src/world/world';
import { newWorld, addDefaultDecor } from '../src/world/mapgen';
import { loneTreeAt } from '../src/render/vegetation';
import { sculpt, CLIFF_STEP } from '../src/world/terraform';

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
