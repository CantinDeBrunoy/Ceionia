import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize, SEA } from '../src/world/world';
import { DECK_CLEAR, RAMP_IN, TORRENT_WATER, carriedGroups, deckProfile, findCrossings, nearestOnDeck } from '../src/world/crossings';
import { RoadView } from '../src/render/roads';
import { Streams } from '../src/render/streams';

/** Terrain plat de 48 cases à la hauteur `h` ; `carve(x, z)` renvoie la hauteur à donner au sommet (ou undefined) */
function flat(carve: (x: number, z: number) => number | undefined, h = 0.55): World {
  setMapSize(48);
  const w = new World();
  w.heights.fill(h);
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) { const v = carve(x, z); if (v !== undefined) w.heights[w.vi(x, z)] = v; }
  w.updateVis();
  return w;
}
/** Ruisseaux verticaux de deux sommets de large aux colonnes données */
const streams = (cols: number[], h = 0.55, depth = -0.6) => flat((x) => (cols.some((c) => x === c || x === c + 1) ? depth : undefined), h);
const row = (w: World, z: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) w.road[w.ci(x, z)] = 1; w.version++; };
const col = (w: World, x: number, z0: number, z1: number) => { for (let z = z0; z <= z1; z++) w.road[w.ci(x, z)] = 1; w.version++; };
const line = (n: number, step = 0.2) => Array.from({ length: n }, (_, i) => i * step);
/** Distance d'un point à la droite (a, b) */
const lineDist = (p: number[], a: number[], b: number[]) => Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('profil en long du tablier', () => {
  it('suit la corde entre ses deux bouts, relevée d\'un bloc au-dessus de l\'eau, et redescend en douceur', () => {
    const S = line(21), wet = S.map((s) => s >= 1.4 && s <= 2.6), ground = S.map(() => 0.1), water = S.map(() => 0);
    const p = deckProfile(S, wet, ground, water, 0.14, 0.14);
    for (let i = 0; i < S.length; i++) if (S[i] >= p.a && S[i] <= p.b) expect(p.y[i]).toBeCloseTo(DECK_CLEAR);
    expect(p.y[0]).toBeCloseTo(0.14);
    expect(p.y[S.length - 1]).toBeCloseTo(0.14);
    const mid = p.y.indexOf(DECK_CLEAR);
    for (let i = 1; i <= mid; i++) expect(p.y[i]).toBeGreaterThanOrEqual(p.y[i - 1] - 1e-9);
    for (let i = p.y.length - 1; i > p.y.lastIndexOf(DECK_CLEAR); i--) expect(p.y[i - 1]).toBeGreaterThanOrEqual(p.y[i] - 1e-9);
  });

  it('entre deux rives hautes, c\'est la corde (tendue sur le sol des bords) : pas de plateau au ras de l\'eau ni de marche', () => {
    // ruisseau encaissé : rives à 1,3 et 0,8, fond à −0,8, eau à 0
    const S = line(16), ground = S.map((s) => (s < 0.6 ? 1.3 : s > 2.4 ? 0.8 : -0.8)), wet = ground.map((g) => g < 0), water = S.map(() => 0);
    const p = deckProfile(S, wet, ground, water, 1.34, 0.84);
    p.y.forEach((y, i) => {
      expect(y).toBeGreaterThanOrEqual(1.34 + (0.84 - 1.34) * (S[i] / S[S.length - 1]) - 1e-9);
      expect(y).toBeLessThanOrEqual(1.34 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(ground[i] + 0.03 - 1e-9);
    });
    expect(p.y[0]).toBeCloseTo(1.34);
    expect(p.y[S.length - 1]).toBeCloseTo(0.84);
    for (let i = 1; i < S.length; i++) expect(Math.abs(p.y[i] - p.y[i - 1])).toBeLessThan(0.1);
  });

  it('ne passe jamais sous le sol', () => {
    const S = line(21), wet = S.map((s) => s >= 1.4 && s <= 2.6), ground = S.map((s) => 0.4 + 0.1 * Math.sin(s)), water = S.map(() => 0);
    const p = deckProfile(S, wet, ground, water, 0.45, 0.45);
    p.y.forEach((y, i) => expect(y).toBeGreaterThanOrEqual(ground[i] + 0.03 - 1e-9));
  });

  it('sans eau, le tablier n\'a pas de portée', () => {
    const S = line(5), p = deckProfile(S, S.map(() => false), S.map(() => 0), S.map(() => 0), 0, 0);
    expect(p.a).toBeGreaterThan(p.b);
  });
});

describe('franchissements : détection', () => {
  it('une route droite sur un ruisseau : un seul pont, un seul tronçon, de rive à rive, qui couvre toute l\'eau', () => {
    const w = streams([20]);
    row(w, 10, 8, 34);
    const cr = findCrossings(w);
    expect(cr.length).toBe(1);
    expect(cr[0].spans.length).toBe(1);
    const sp = cr[0].spans[0];
    expect(sp.from.kind).toBe('bank');
    expect(sp.to.kind).toBe('bank');
    for (let x = 8; x <= 34; x++) if (w.realWater(x, 10)) expect(cr[0].cells.has(w.ci(x, 10))).toBe(true);
    expect(cr[0].nodes.size).toBe(0);
  });

  it('pas de pont hors de l\'eau : les cases portées sont de l\'eau, ou une case sèche prise entre deux bras', () => {
    const w = streams([16, 21]);
    row(w, 12, 6, 34);
    const [cr] = findCrossings(w);
    for (const c of cr.cells) {
      const x = c % N, z = Math.floor(c / N);
      if (w.realWater(x, z)) continue;
      // case sèche : une case d'eau portée de chaque côté, à deux cases au plus
      const left = [1, 2].some((d) => w.realWater(x - d, z) && cr.cells.has(w.ci(x - d, z))), right = [1, 2].some((d) => w.realWater(x + d, z) && cr.cells.has(w.ci(x + d, z)));
      expect(left && right).toBe(true);
    }
  });

  it('un ruisseau qui serpente et recoupe la route jusqu\'à quatre cases plus loin : un seul pont, d\'un seul tronçon ; au-delà, deux ponts', () => {
    for (const far of [21, 22, 23]) {
      const w = streams([16, far]);
      row(w, 12, 6, 34);
      const cr = findCrossings(w);
      expect(cr.length).toBe(1);
      expect(cr[0].spans.length).toBe(1);
      // le tablier est continu de la première rive à la dernière : toutes les cases d'eau et celles entre elles sont portées
      for (let x = 15; x <= far + 1; x++) expect(cr[0].cells.has(w.ci(x, 12))).toBe(true);
      for (let i = 1; i < cr[0].spans[0].pts.length; i++) expect(Math.abs(cr[0].spans[0].pts[i][1] - cr[0].spans[0].pts[i - 1][1])).toBeLessThan(0.1);
    }
    const w2 = streams([16, 24]);
    row(w2, 12, 6, 34);
    expect(carriedGroups(w2).length).toBe(2);
  });

  it('un torrent sous un chemin : un pont, un seul, même quand le torrent serpente et recoupe le chemin trois cases plus loin', () => {
    const w = flat(() => undefined);
    row(w, 10, 8, 34);
    w.setTorrents(new Set([w.ci(20, 10), w.ci(21, 10), w.ci(24, 10)]));
    const cr = findCrossings(w);
    expect(cr.length).toBe(1);
    expect(cr[0].spans.length).toBe(1);
    for (let x = 20; x <= 24; x++) expect(cr[0].cells.has(w.ci(x, 10))).toBe(true);
    expect(w.bridgeY(22, 10)).not.toBeNull();
    // les garde-corps (portée sur l'eau) vont d'un bord à l'autre d'un seul tenant
    const sp = cr[0].spans[0];
    expect(sp.a).toBeLessThan(sp.b);
    const wetS = sp.S.filter((_, i) => sp.wet[i]);
    expect(Math.min(...wetS)).toBeGreaterThanOrEqual(sp.a);
    expect(Math.max(...wetS)).toBeLessThanOrEqual(sp.b);
  });

  it('le tablier passe au-dessus d\'un torrent avec un jour : l\'eau (ruban posé sur le sol, 0,1 au plus) coule dessous', () => {
    const w = flat(() => undefined);
    row(w, 10, 8, 34);
    w.setTorrents(new Set([w.ci(20, 10)]));
    const [cr] = findCrossings(w), sp = cr.spans[0];
    sp.pts.forEach((p, i) => {
      if (!sp.wet[i]) return;
      // dessus du tablier à TORRENT_WATER + DECK_CLEAR au-dessus du sol : le dessous (épaisseur ≤ 0,12) reste au-dessus du ruban (≤ sol + 0,1)
      expect(p[1] - w.hAt(p[0], p[2])).toBeGreaterThanOrEqual(TORRENT_WATER + DECK_CLEAR - 1e-6);
      expect(p[1] - 0.12).toBeGreaterThan(w.hAt(p[0], p[2]) + 0.1);
    });
    // et il redescend sur le chemin des deux côtés
    const f0 = sp.pts[0], f1 = sp.pts[sp.pts.length - 1];
    expect(f0[1]).toBeCloseTo(w.hAt(f0[0], f0[2]) + 0.04, 6);
    expect(f1[1]).toBeCloseTo(w.hAt(f1[0], f1[2]) + 0.04, 6);
    // retirer le torrent retire le pont
    w.setTorrents(new Set());
    expect(w.bridgeY(20, 10)).toBeNull();
  });

  it('une flaque ou une rive qui trempe à peine ne fait pas de pont', () => {
    const w = flat((x, z) => (x >= 20 && x <= 21 && z >= 10 && z <= 11 ? 0.04 : undefined));
    row(w, 10, 8, 34);
    expect(w.isWet(20, 10)).toBe(true);
    expect(w.bridgeY(20, 10)).toBeNull();
    expect(findCrossings(w).length).toBe(0);
  });

  it('une route en escalier sur une rivière : un seul pont dont l\'axe est une diagonale (pas un serpent)', () => {
    const w = flat((x) => (x >= 20 && x <= 24 ? -0.6 : undefined));
    const cells: [number, number][] = [[17, 10], [18, 10], [19, 10], [19, 11], [20, 11], [20, 12], [21, 12], [21, 13], [22, 13], [22, 14], [23, 14], [23, 15], [24, 15], [25, 15], [26, 15]];
    for (const [x, z] of cells) w.road[w.ci(x, z)] = 1;
    w.version++;
    const cr = findCrossings(w);
    expect(cr.length).toBe(1);
    expect(cr[0].spans.length).toBe(1);
    const sp = cr[0].spans[0], P = sp.pts;
    // d'un bord de rive à l'autre, tout l'axe reste près de la droite qui les joint
    const wetIdx = sp.wet.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), i0 = wetIdx[0], i1 = wetIdx[wetIdx.length - 1];
    const A = [P[i0][0], P[i0][2]], B = [P[i1][0], P[i1][2]];
    for (let i = i0; i <= i1; i++) expect(lineDist([P[i][0], P[i][2]], A, B)).toBeLessThan(0.5);
    // et les habitants suivent cet axe : leur point de passage dans chaque case d'eau est sur la diagonale, dans la case
    const path = cells.map(([x, z]) => w.ci(x, z));
    cells.forEach(([x, z], i) => {
      if (!w.realWater(x, z)) return;
      const [px, pz] = w.passPoint(path, i);
      expect(px).toBeGreaterThanOrEqual(x); expect(px).toBeLessThanOrEqual(x + 1);
      expect(pz).toBeGreaterThanOrEqual(z); expect(pz).toBeLessThanOrEqual(z + 1);
      expect(lineDist([px, pz], A, B)).toBeLessThan(0.5);
    });
  });

  it('une route qui touche le pont sur une case d\'eau : un nœud (plateau) d\'où partent les tronçons, tous à la même hauteur', () => {
    // ruisseau horizontal court (cases (10…19, 10)), route nord-sud en x = 19, branche sèche vers l'est depuis la case d'eau
    const w = flat((x, z) => (x >= 10 && x <= 20 && (z === 10 || z === 11) ? -0.19 : undefined));
    expect(w.realWater(19, 10)).toBe(true);
    expect(w.realWater(20, 10)).toBe(false);
    col(w, 19, 4, 18);
    row(w, 10, 20, 26);
    const cr = findCrossings(w);
    expect(cr.length).toBe(1);
    const k = w.ci(19, 10);
    expect(cr[0].nodes.has(k)).toBe(true);
    expect(cr[0].spans.length).toBe(3);
    const y = cr[0].nodes.get(k)!;
    expect(y).toBeGreaterThanOrEqual(SEA + DECK_CLEAR);
    for (const sp of cr[0].spans) {
      expect(sp.from.kind).toBe('node');
      expect(sp.to.kind).toBe('bank');
      // le tronçon part du plateau à sa hauteur et descend au chemin de la rive
      expect(sp.pts[0][1]).toBeCloseTo(y, 6);
      const f = sp.pts[sp.pts.length - 1];
      expect(f[1]).toBeCloseTo(w.hAt(f[0], f[2]) + 0.04, 3);
    }
    expect(w.passPoint([w.ci(19, 9), k, w.ci(20, 10)], 1)).toEqual([19.5, 10.5]);
    expect(w.surfaceAt(19.5, 10.5)).toBeCloseTo(y, 6);
  });
});

describe('franchissements : hauteurs', () => {
  it('rivière plate : le tablier est au ras de l\'eau, et rejoint le chemin des deux rives', () => {
    const w = streams([20], 0.12);
    row(w, 10, 8, 34);
    const [cr] = findCrossings(w), sp = cr.spans[0];
    sp.pts.forEach((p, i) => {
      if (sp.wet[i]) expect(p[1]).toBeCloseTo(SEA + DECK_CLEAR, 6);
      expect(p[1]).toBeGreaterThanOrEqual(w.hAt(p[0], p[2]) + 0.03 - 1e-9);
    });
    // pieds de rampe : à 0,45 case du bord, à la hauteur du chemin
    const f0 = sp.pts[0], f1 = sp.pts[sp.pts.length - 1];
    expect(f0[1]).toBeCloseTo(w.hAt(f0[0], f0[2]) + 0.04, 6);
    expect(f1[1]).toBeCloseTo(w.hAt(f1[0], f1[2]) + 0.04, 6);
    const first = w.realWater(18, 10) ? 18 : 19;
    expect(Math.abs(f0[0] - (first - RAMP_IN))).toBeLessThan(1e-6);
    // continu : pas de marche d'un point au suivant
    for (let i = 1; i < sp.pts.length; i++) expect(Math.abs(sp.pts[i][1] - sp.pts[i - 1][1])).toBeLessThan(0.1);
  });

  it('ruisseau encaissé entre deux rives de hauteurs différentes : le tablier va d\'une rive à l\'autre, sans se caler sur la plus haute', () => {
    // à gauche un plateau à 1,2, à droite à 0,8 ; une entaille d'un sommet de large à −0,8 (eau à 0)
    const w = flat((x) => (x === 21 ? -0.8 : x < 21 ? 1.2 : 0.8), 0.8);
    row(w, 10, 12, 30);
    expect(w.realWater(20, 10) || w.realWater(21, 10)).toBe(true);
    const cr = findCrossings(w);
    expect(cr.length).toBe(1);
    const sp = cr[0].spans[0], f0 = sp.pts[0], f1 = sp.pts[sp.pts.length - 1];
    const hi = Math.max(f0[1], f1[1]), lo = Math.min(f0[1], f1[1]);
    expect(hi - lo).toBeGreaterThan(0.3);
    // le sol le plus haut sous le tablier (le bord de l'entaille, dans la case d'eau) : le tablier ne monte pas plus haut que lui
    const top = Math.max(hi, ...sp.pts.map((p) => w.hAt(p[0], p[2]) + 0.03));
    sp.pts.forEach((p, i) => {
      // entre les deux rives (corde), au-dessus de l'eau et du sol, jamais calé sur la rive haute
      expect(p[1]).toBeLessThanOrEqual(top + 1e-6);
      expect(p[1]).toBeGreaterThanOrEqual(lo - 1e-6);
      if (sp.wet[i]) expect(p[1]).toBeGreaterThanOrEqual(SEA + DECK_CLEAR);
      expect(p[1]).toBeGreaterThanOrEqual(w.hAt(p[0], p[2]) + 0.03 - 1e-9);
    });
    // pente douce : pas plus d'une demi-hauteur par case
    for (let i = 1; i < sp.pts.length; i++) expect(Math.abs(sp.pts[i][1] - sp.pts[i - 1][1])).toBeLessThan(0.12);
    // la simulation lit le même tablier : au centre d'une case d'eau, le sol où l'on marche est le tablier
    for (let x = 18; x <= 23; x++) if (cr[0].cells.has(w.ci(x, 10))) {
      const d = nearestOnDeck(cr[0], x + 0.5, 10.5);
      expect(w.surfaceAt(x + 0.5, 10.5)).toBeCloseTo(Math.max(d.y, w.hAt(x + 0.5, 10.5)), 6);
      expect(w.bridgeY(x, 10)).toBeCloseTo(d.y, 6);
    }
  });

  it('sur la case de la rive, on marche sur la rampe du tablier (sous son emprise seulement), puis sur le chemin', () => {
    const w = streams([20], 0.12);
    row(w, 10, 8, 34);
    const [cr] = findCrossings(w), sp = cr.spans[0], f = sp.pts[0];
    // le pied de rampe est dans la case de la rive : là, le sol où l'on marche est le tablier (au-dessus du relief)
    expect(cr.cells.has(w.ci(Math.floor(f[0]), 10))).toBe(false);
    for (const p of sp.pts) expect(Math.abs(w.surfaceAt(p[0], p[2]) - p[1])).toBeLessThan(1e-6);
    // à côté de la rampe, sur l'herbe de la même case, le relief
    expect(w.surfaceAt(f[0], 10.95)).toBeCloseTo(w.hAt(f[0], 10.95), 6);
    // plus loin sur le chemin, le relief
    expect(w.surfaceAt(9.5, 10.5)).toBeCloseTo(w.hAt(9.5, 10.5), 6);
  });

  it('le profil se met à jour quand la route ou le relief changent', () => {
    const w = streams([20]);
    expect(w.bridgeY(20, 10)).toBeNull();
    row(w, 10, 8, 34);
    expect(w.bridgeY(20, 10)).not.toBeNull();
    w.road[w.ci(20, 10)] = 0; w.version++;
    expect(w.bridgeY(20, 10)).toBeNull();
  });
});

describe('franchissements : dessin', () => {
  const solidVerts = (v: RoadView) => ((v as unknown as { solid: THREE.Mesh }).solid.geometry.getAttribute('position') as THREE.BufferAttribute).count;
  const deckVerts = (v: RoadView) => (v as unknown as { deckV: number[] }).deckV.length / 2;

  it('un pont à chaque âge, avec un tablier qui prend la neige, sans erreur', () => {
    const w = streams([20]);
    row(w, 10, 8, 34);
    let last = -1;
    for (const age of [0, 1, 2, 3, 4, 5]) {
      const v = new RoadView(w);
      v.rebuild(age, 0);
      expect(solidVerts(v)).toBeGreaterThan(0);
      expect(deckVerts(v)).toBeGreaterThan(0);
      // le style change d'un âge à l'autre (sauf Préhistoire et Antiquité, deux passerelles de bois)
      if (age >= 2) expect(solidVerts(v)).not.toBe(last);
      last = solidVerts(v);
    }
  });

  it('une jonction sur l\'eau et une boucle de routes sur l\'eau se dessinent sans erreur', () => {
    const w = flat((x, z) => (x >= 10 && x <= 20 && (z === 10 || z === 11) ? -0.19 : undefined));
    col(w, 19, 4, 18);
    row(w, 10, 20, 26);
    const w2 = flat((x) => (x >= 18 && x <= 26 ? -0.6 : undefined));
    for (const [x, z] of [[20, 10], [21, 10], [21, 11], [20, 11], [19, 10], [22, 10]]) w2.road[w2.ci(x, z)] = 1;
    w2.version++;
    for (const ww of [w, w2]) for (const age of [0, 4]) { const v = new RoadView(ww); expect(() => v.rebuild(age, 0)).not.toThrow(); expect(deckVerts(v)).toBeGreaterThan(0); }
  });

  it('un torrent sous une route se dessine comme un pont (du style de l\'âge), et seulement s\'il y a un torrent', () => {
    const w = flat(() => undefined);
    row(w, 10, 8, 34);
    const a = new RoadView(w);
    a.rebuild(1, 0);
    expect(deckVerts(a)).toBe(0);
    w.setTorrents(new Set([w.ci(20, 10)]));
    const b = new RoadView(w);
    b.streams = { version: 7 } as unknown as Streams;
    b.rebuild(1, 0);
    expect(deckVerts(b)).toBeGreaterThan(0);
    expect(b.builtStreams).toBe(7);
  });

  it('le ruban d\'un torrent n\'est jamais interrompu ni enfoncé sous une route : il reste posé sur le sol d\'un bout à l\'autre', () => {
    // une montagne conique au milieu d'une plaine : des torrents en descendent jusqu'au bord ; une route en fait le tour
    const w = flat((x, z) => Math.max(0.3, 4.5 - Math.hypot(x - 24, z - 24) / 4));
    for (let x = 4; x < N - 4; x++) { w.road[w.ci(x, 36)] = 1; w.road[w.ci(x, 12)] = 1; }
    for (let z = 4; z < N - 4; z++) { w.road[w.ci(12, z)] = 1; w.road[w.ci(36, z)] = 1; }
    w.version++;
    const s = new Streams(w, null);
    s.rebuild();
    expect(w.torrents.size).toBeGreaterThan(0);
    // au moins un torrent passe sous une route, et cette case est un pont
    const under = [...w.torrents].filter((k) => w.road[k]);
    expect(under.length).toBeGreaterThan(0);
    for (const k of under) expect(w.bridgeY(k % N, Math.floor(k / N))).not.toBeNull();
    const pos = ((s as unknown as { flowMesh: THREE.Mesh }).flowMesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    expect(pos.length).toBeGreaterThan(0);
    for (let i = 0; i < pos.length; i += 3) {
      const h = w.hAt(pos[i], pos[i + 2]);
      expect(pos[i + 1]).toBeGreaterThanOrEqual(h + 0.035 - 1e-6);
      expect(pos[i + 1]).toBeLessThanOrEqual(h + 0.1 + 1e-6);
    }
  });
});
