import type { World } from './world';
import type { People, RivalIsle } from './archipelago';
import { mulberry32, hash2, wrapAngle } from '../core/rng';

const angleDiff = (a: number, b: number) => wrapAngle(a - b);

/**
 * Les villes des deux peuples rivaux de l'archipel (décor, non jouables). Un squelette fixe, rempli de façon procédurale :
 * l'édifice religieux au centre du replat du village, le palais sur le point haut, le marché entre les deux, le port sur la
 * côte la plus proche, des remparts qui ferment le tout. Les rues, les maisons, les jardins et les champs se tirent de la
 * graine ; chaque lot a l'âge (`from`) où il apparaît, pour que la ville se densifie d'âge en âge.
 *
 * Le plan se déduit des hauteurs brutes de la carte (pas du relief affiché) : il ne change pas d'un chargement à l'autre et
 * n'est pas sauvegardé. Il garde des points nommés (`TownPoints`) pour la future bataille. Voir `docs/iles.md`
 */

/** Sorte d'un lot de la ville */
export type TownKind =
  | 'temple' | 'palace' | 'market' | 'port' | 'caravan' | 'baths' | 'garden' | 'house' | 'workshop' | 'field' | 'gate' | 'tower'
  // propres au peuple asiatique
  | 'teahouse' | 'paifang'
  // les repères des âges récents : usine et gare (Industriel), gratte-ciel (Moderne), arcologie (Futuriste)
  | 'factory' | 'station' | 'skyscraper' | 'arcology';

/**
 * Un lot : centre (cases du monde), emprise `w` × `d` (cases, avant rotation), rotation `rot` (la façade, +z du modèle, regarde
 * vers (sin rot, cos rot)), âge d'apparition `from` (1 : Antiquité … 5 : Futuriste ; le bourg de l'Antiquité sert aussi à la
 * Préhistoire), variante `v` ; `until` : l'âge où il disparaît (une maison ou un champ qui laisse la place à un repère)
 */
export interface Lot { kind: TownKind; x: number; z: number; w: number; d: number; rot: number; from: number; v: number; until?: number }

/** Le lot existe-t-il à l'âge `age` (âge des lots, au moins celui des modèles) ? `shown` : l'âge des modèles, pour `until` */
export const lotLives = (l: Lot, age: number, shown = age) => l.from <= age && (l.until === undefined || shown < l.until);
/** Rue : polyligne (cases), largeur, âge d'apparition */
export interface Street { pts: [number, number][]; w: number; from: number }
/** Place pavée ronde : centre, rayon */
export interface Plaza { x: number; z: number; r: number }
/** Points nommés de la ville, pour la bataille (cases du monde) */
export interface TownPoints {
  /** plage de débarquement : au bord de l'eau, en pente douce, à l'écart du port */
  plage: [number, number];
  /** quai du port, au bord de l'eau */
  port: [number, number];
  /** les sommets des remparts, dans l'ordre (polygone fermé) */
  remparts: [number, number][];
  /** le milieu de chaque porte ; la première donne sur la route du port */
  portes: [number, number][];
  palais: [number, number];
  temple: [number, number];
  marche: [number, number];
}
export interface TownPlan {
  people: People;
  /** centre (le replat du village) */
  x: number; z: number;
  /** direction de la mer la plus proche (angle de (cos, sin) en x, z) et sa distance */
  seaAng: number; seaDist: number;
  /** rayon moyen des remparts */
  r: number;
  lots: Lot[];
  streets: Street[];
  plazas: Plaza[];
  /** sommets des remparts et, pour chaque côté, la porte qui y est percée (milieu du côté) ou null */
  wall: [number, number][];
  gates: (number | null)[];
  points: TownPoints;
}

/** Rayon de base des remparts (cases) */
export const WALL_R = 13.5;
/** Part des maisons qui existent à chaque âge (bourg de l'Antiquité, puis la ville se remplit) */
export const HOUSE_SHARE = [0, 0.24, 0.45, 0.66, 0.85, 1];
/** Emprise des monuments (cases) */
const SIZE: Partial<Record<TownKind, [number, number]>> = {
  temple: [5, 5], palace: [6, 5], market: [4, 4], port: [4, 3.5], caravan: [4, 4], baths: [3, 2.6], garden: [4, 4],
  teahouse: [1.8, 1.6], paifang: [1.8, 0.5],
  factory: [3.2, 2.4], station: [3.6, 1.8], skyscraper: [2.4, 2.4], arcology: [5, 5],
};
/** Les sortes de lots posées hors des murs (les champs et le port aussi) */
export const OUTSIDE: TownKind[] = ['field', 'port', 'factory', 'station', 'arcology'];

const plans = new Map<string, TownPlan>();

/** Le plan de la ville de l'île rivale `q` (mis en cache par graine et peuple) */
export function townPlan(w: World, q: RivalIsle): TownPlan {
  const key = `${w.seed}|${q.people}|${q.village.x.toFixed(2)}|${q.village.z.toFixed(2)}`;
  let p = plans.get(key);
  if (!p) { p = drawTown(w, q); plans.set(key, p); }
  return p;
}

/** Oublie les plans calculés (tests : une même graine, avec et sans la zone dans le relief) */
export function forgetTowns() { plans.clear(); }

/** Les plans des deux villes de la carte (aucun sans archipel) */
export function townPlans(w: World): TownPlan[] {
  return w.isles ? w.isles.rivals.map((q) => townPlan(w, q)) : [];
}

/** Les cases d'une ville (indices `w.ci`), mises en cache avec son plan */
const cells = new WeakMap<TownPlan, Set<number>>();
/**
 * Les cases que prend une ville : l'intérieur des remparts, chaque lot (champs et port compris) et les rues, à une demi-case
 * près. Le sol de la ville (`RivalTowns.markGround`) et la zone où le joueur ne bâtit pas chez son allié (`allyLand`) les lisent
 */
export function townCells(w: World, p: TownPlan): Set<number> {
  let set = cells.get(p);
  if (set) return set;
  set = new Set();
  const out = set, mark = (x: number, z: number) => { if (w.inCells(x, z)) out.add(w.ci(x, z)); };
  const R = Math.ceil(p.r + 8);
  for (let z = Math.floor(p.z - R); z <= p.z + R; z++)
    for (let x = Math.floor(p.x - R); x <= p.x + R; x++) if (inPoly(x + 0.5, z + 0.5, p.wall)) mark(x, z);
  for (const l of p.lots) {
    const r = Math.hypot(l.w, l.d) / 2 + 0.6;
    for (let z = Math.floor(l.z - r); z <= l.z + r; z++) for (let x = Math.floor(l.x - r); x <= l.x + r; x++) if (Math.hypot(x + 0.5 - l.x, z + 0.5 - l.z) < r) mark(x, z);
  }
  for (const s of p.streets)
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const [a, b] = [s.pts[i], s.pts[i + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
      for (let j = 0; j <= n; j++) { const x = a[0] + ((b[0] - a[0]) * j) / n, z = a[1] + ((b[1] - a[1]) * j) / n; for (const o of [-0.6, 0, 0.6]) mark(Math.floor(x + o), Math.floor(z + o)); }
    }
  cells.set(p, set);
  return set;
}

/** Distance du point (x, z) au segment a-b */
export function segDist(x: number, z: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

/** Le point (x, z) est-il dans le polygone ? */
export function inPoly(x: number, z: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function drawTown(w: World, q: RivalIsle): TownPlan {
  const people = q.people, cx = q.village.x, cz = q.village.z;
  const rnd = mulberry32(w.seed * 97 + (people === 'orient' ? 1013 : 2029));
  const R = (a: number, b: number) => a + (b - a) * rnd();
  const land = (x: number, z: number) => { const ix = Math.floor(x), iz = Math.floor(z); return w.inCells(ix, iz) && !w.isWaterCell(ix, iz); };
  const height = (x: number, z: number) => { const ix = Math.floor(x), iz = Math.floor(z); return w.inCells(ix, iz) ? w.cellAvg(ix, iz) : -1; };
  const slope = (x: number, z: number) => { const ix = Math.floor(x), iz = Math.floor(z); return w.inCells(ix, iz) ? w.cellSlope(ix, iz) : 9; };
  /** distance à la mer en partant du centre dans la direction a (cases, 80 au plus) */
  const reach = (a: number, from = 0) => { for (let d = from; d < 80; d += 0.5) if (!land(cx + Math.cos(a) * d, cz + Math.sin(a) * d)) return d; return 80; };

  /** distance à l'eau profonde (pas une mare ni une lagune derrière un cordon de sable) dans la direction a */
  const reachSea = (a: number, from = 0) => { for (let d = from; d < 80; d += 0.5) if (height(cx + Math.cos(a) * d, cz + Math.sin(a) * d) < -0.35) return d; return 80; };

  // la mer la plus proche
  let seaAng = 0, seaDist = Infinity;
  for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, d = reachSea(a); if (d < seaDist) { seaDist = d; seaAng = a; } }

  // le palais : le point le plus haut d'une couronne autour du centre, plutôt du côté opposé à la mer
  let pal: [number, number] = [cx - Math.cos(seaAng) * 9, cz - Math.sin(seaAng) * 9], best = -Infinity;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    if (Math.abs(angleDiff(a, seaAng)) < Math.PI * 0.45) continue;
    for (let d = 8; d <= 12; d += 1) {
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (reach(a) < d + 6) continue;
      let h = 0, steep = 0;
      for (const [ox, oz] of [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2]]) { h += height(x + ox, z + oz) / 5; steep = Math.max(steep, slope(x + ox, z + oz)); }
      const score = h - Math.max(0, steep - 0.6) * 2 - d * 0.02 + rnd() * 0.05;
      if (score > best) { best = score; pal = [x, z]; }
    }
  }
  const palAng = Math.atan2(pal[1] - cz, pal[0] - cx), palD = Math.hypot(pal[0] - cx, pal[1] - cz);

  // les remparts : douze sommets autour du centre, élargis vers le palais, retenus avant la mer
  const K = 12, wall: [number, number][] = [], radii: number[] = [];
  const a0 = seaAng + Math.PI / K; // la mer tombe au milieu d'un côté (la porte du port)
  for (let i = 0; i < K; i++) {
    const a = a0 + (i / K) * Math.PI * 2;
    let r = WALL_R * R(0.9, 1.1);
    if (Math.abs(angleDiff(a, palAng)) < 0.75) r = Math.max(r, palD + 5.2);
    r = Math.min(r, reach(a) - 4);
    radii.push(r);
  }
  // un rempart sans dents de scie : chaque rayon tiré vers la moyenne de ses voisins (le palais garde sa place)
  const smooth = radii.map((r, i) => Math.max(r * 0.6 + (radii[(i + K - 1) % K] + radii[(i + 1) % K]) * 0.2, Math.abs(angleDiff(a0 + (i / K) * Math.PI * 2, palAng)) < 0.75 ? palD + 5.2 : 0));
  smooth.forEach((r, i) => { const a = a0 + (i / K) * Math.PI * 2; wall.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); });
  const meanR = smooth.reduce((s, r) => s + r, 0) / K;

  // les portes : au milieu du côté face à la mer (côté K - 1 → 0, autour de seaAng), et deux autres à peu près à un tiers de tour
  const mid = (i: number): [number, number] => { const a = wall[i], b = wall[(i + 1) % K]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const gates: (number | null)[] = new Array(K).fill(null);
  const gateSides = [K - 1, 3, 7].filter((s, i) => i === 0 || Math.abs(angleDiff(Math.atan2(mid(s)[1] - cz, mid(s)[0] - cx), palAng)) > 0.6);
  for (const s of gateSides) gates[s] = s;
  const portes = gateSides.map(mid);

  const lots: Lot[] = [], streets: Street[] = [], plazas: Plaza[] = [];
  const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  const mon = (kind: TownKind, x: number, z: number, rot: number, from: number) => {
    const [sw, sd] = SIZE[kind]!;
    const l: Lot = { kind, x, z, w: sw, d: sd, rot, from, v: Math.floor(rnd() * 1000) };
    lots.push(l);
    return l;
  };
  // emprise d'un lot, en cercle (assez juste pour des lots presque carrés)
  const rad = (l: { w: number; d: number }) => Math.hypot(l.w, l.d) / 2;
  const clash = (x: number, z: number, r: number, gap = 0.3) => lots.some((l) => l.kind !== 'field' && Math.hypot(l.x - x, l.z - z) < rad(l) * 0.86 + r + gap);

  // l'édifice religieux, face à la porte du port ; sa place autour
  const sea = portes[0];
  mon('temple', cx, cz, facing(cx, cz, sea[0], sea[1]), 1);
  plazas.push({ x: cx, z: cz, r: 4.6 });
  // le palais, face au centre
  mon('palace', pal[0], pal[1], facing(pal[0], pal[1], cx, cz), 1);
  // le marché : entre les deux, poussé de côté s'il touche l'un ou l'autre
  const mk = (() => {
    const ux = (pal[0] - cx) / palD, uz = (pal[1] - cz) / palD;
    for (const side of [0, 1, -1, 2, -2, 3, -3])
      for (const t of [0.5, 0.45, 0.55, 0.4, 0.6]) {
        const x = cx + ux * palD * t - uz * side * 1.6, z = cz + uz * palD * t + ux * side * 1.6;
        if (!clash(x, z, rad({ w: 4, d: 4 }) * 0.86, 0.6)) return [x, z] as [number, number];
      }
    return [cx + ux * palD * 0.5 - uz * 6, cz + uz * palD * 0.5 + ux * 6] as [number, number];
  })();
  // la façade du marché donne sur l'avenue du palais
  mon('market', mk[0], mk[1], facing(mk[0], mk[1], cx + (pal[0] - cx) * 0.5, cz + (pal[1] - cz) * 0.5) || 0, 1);

  // le port : sur la côte, dans la direction de la mer ; le quai avance sur l'eau
  // (le quai avance jusqu'à l'eau profonde, où mouille le navire : une plage en pente douce reste longtemps à fleur d'eau)
  const portD = seaDist - 1.5;
  const port: [number, number] = [cx + Math.cos(seaAng) * portD, cz + Math.sin(seaAng) * portD];
  mon('port', port[0], port[1], facing(cx, cz, port[0], port[1]), 1);
  const quay: [number, number] = [cx + Math.cos(seaAng) * (portD + 1.4), cz + Math.sin(seaAng) * (portD + 1.4)];

  // la plage : un bout de côte en pente douce, à 25-60° du port
  let plage: [number, number] = quay, flat = Infinity;
  for (const s of [-1, 1])
    for (let da = 0.45; da <= 1.05; da += 0.1) {
      const a = seaAng + s * da, deepD = reachSea(a, 6);
      if (deepD >= 79) continue;
      // le rivage : la dernière terre avant l'eau profonde
      let d = deepD;
      while (d > 6 && !land(cx + Math.cos(a) * d, cz + Math.sin(a) * d)) d -= 0.5;
      const x = cx + Math.cos(a) * (d - 1), z = cz + Math.sin(a) * (d - 1);
      const st = slope(x, z) + slope(x - Math.cos(a) * 2, z - Math.sin(a) * 2) + rnd() * 0.05 + d * 0.004;
      if (st < flat) { flat = st; plage = [cx + Math.cos(a) * (d + 0.5), cz + Math.sin(a) * (d + 0.5)]; }
    }

  // les monuments de chaque peuple
  const placeNear = (kind: TownKind, ax: number, az: number, from: number, inside = true) => {
    const [sw, sd] = SIZE[kind]!, r = rad({ w: sw, d: sd }) * 0.86;
    for (let tries = 0; tries < 80; tries++) {
      const a = rnd() * Math.PI * 2, d = 1 + tries * 0.12 + rnd() * 2;
      const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
      if (inside && !inWall(x, z, r + 1.2)) continue;
      if (!land(x, z) || slope(x, z) > 1.2 || clash(x, z, r, 0.8)) continue;
      if (Math.hypot(x - cx, z - cz) < 4.6 + r) continue;
      return mon(kind, x, z, facing(x, z, cx, cz), from);
    }
    return null;
  };
  const inWall = (x: number, z: number, margin: number) => inPoly(x, z, wall) && wall.every((a, i) => segDist(x, z, a, wall[(i + 1) % K]) > margin);
  if (people === 'orient') {
    // caravansérail près de la première porte de terre (ou de celle du port), bains près de la mosquée
    const g = portes[1] ?? portes[0];
    placeNear('caravan', cx + (g[0] - cx) * 0.7, cz + (g[1] - cz) * 0.7, 1);
    placeNear('baths', cx + (pal[0] - cx) * -0.4, cz + (pal[1] - cz) * -0.4, 2);
  } else {
    // le grand jardin, au pied du palais
    placeNear('garden', cx + (pal[0] - cx) * 0.75, cz + (pal[1] - cz) * 0.75, 2);
  }

  // les rues : de chaque porte à la place, du temple au palais (par le marché), de la porte du port au quai
  const bend = (a: [number, number], b: [number, number], j: number): [number, number][] => {
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const k = R(-j, j);
    return [a, [mx - ((b[1] - a[1]) / l) * k, mz + ((b[0] - a[0]) / l) * k], b];
  };
  const onPlaza = (p: [number, number], r = 4.4): [number, number] => {
    const d = Math.hypot(p[0] - cx, p[1] - cz) || 1;
    return [cx + ((p[0] - cx) / d) * r, cz + ((p[1] - cz) / d) * r];
  };
  for (const g of portes) streets.push({ pts: bend(g, onPlaza(g), 1.2), w: 1.05, from: 1 });
  const palFront: [number, number] = [pal[0] + ((cx - pal[0]) / palD) * 3.2, pal[1] + ((cz - pal[1]) / palD) * 3.2];
  streets.push({ pts: [onPlaza(pal), [mk[0], mk[1]], palFront], w: 1.05, from: 1 });
  streets.push({ pts: bend(portes[0], [cx + Math.cos(seaAng) * (portD - 3.4), cz + Math.sin(seaAng) * (portD - 3.4)], 1.5), w: 1.05, from: 1 });
  // ruelles : de chaque rue principale, quelques traverses qui s'enfoncent dans les quartiers (à partir du Médiéval)
  const mains = streets.slice();
  for (const s of mains) {
    const [a, , b] = s.pts.length === 3 ? s.pts : [s.pts[0], s.pts[1], s.pts[2]];
    if (!b) continue;
    for (const t of [0.3, 0.65]) {
      if (rnd() < 0.25) continue;
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const side = rnd() < 0.5 ? 1 : -1, len = R(4, 7);
      const ex = x - ((b[1] - a[1]) / l) * side * len, ez = z + ((b[0] - a[0]) / l) * side * len;
      if (!inWall(ex, ez, 1.5)) continue;
      streets.push({ pts: bend([x, z], [ex, ez], 0.8), w: 0.8, from: 2 });
    }
  }
  plazas.push({ x: mk[0], z: mk[1], r: 3.2 });
  const nearStreet = (x: number, z: number) => {
    let d = Infinity, s: Street | null = null, sx = x, sz = z;
    for (const st of streets)
      for (let i = 0; i + 1 < st.pts.length; i++) {
        const e = segDist(x, z, st.pts[i], st.pts[i + 1]) - st.w / 2;
        if (e < d) {
          d = e; s = st;
          const a = st.pts[i], b = st.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
          sx = a[0] + t * dx; sz = a[1] + t * dz;
        }
      }
    return { d, s, sx, sz };
  };
  const onPlazaAny = (x: number, z: number, r: number) => plazas.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r);

  if (people === 'asie') {
    // les paifang : à l'entrée de la place du temple, sur chaque rue qui vient d'une porte, et en tête de l'avenue du palais
    const arch = (a: [number, number], b: [number, number], back: number) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, x = b[0] - ((b[0] - a[0]) / l) * back, z = b[1] - ((b[1] - a[1]) / l) * back;
      const [sw, sd] = SIZE.paifang!;
      lots.push({ kind: 'paifang', x, z, w: sw, d: sd, rot: facing(x, z, a[0], a[1]), from: 1, v: Math.floor(rnd() * 1000) });
    };
    for (const st of mains.slice(0, portes.length)) arch(st.pts[st.pts.length - 2], st.pts[st.pts.length - 1], 0.7);
    arch([mk[0], mk[1]], palFront, 0.6);
    // les salons de thé : au bord d'une rue, près du marché et sur la route du port
    const [tw, td] = SIZE.teahouse!, tr = rad({ w: tw, d: td }) * 0.86;
    for (const [ax, az] of [[mk[0], mk[1]], [cx + (sea[0] - cx) * 0.5, cz + (sea[1] - cz) * 0.5]])
      for (let tries = 0; tries < 160; tries++) {
        const a = rnd() * Math.PI * 2, dd = 1.5 + tries * 0.05 + rnd() * 1.5, x = ax + Math.cos(a) * dd, z = az + Math.sin(a) * dd;
        const ns = nearStreet(x, z);
        if (!inWall(x, z, tr + 1) || !land(x, z) || slope(x, z) > 1 || clash(x, z, tr, 0.4) || onPlazaAny(x, z, tr) || ns.d < tr * 0.8 || ns.d > tr + 1.2) continue;
        lots.push({ kind: 'teahouse', x, z, w: tw, d: td, rot: facing(x, z, ns.sx, ns.sz), from: 2, v: Math.floor(rnd() * 1000) });
        break;
      }
  }

  // jardins dans les vides (plus nombreux chez le peuple asiatique)
  const gardens = people === 'asie' ? 5 : 3;
  for (let i = 0, tries = 0; i < gardens && tries < 200; tries++) {
    const a = rnd() * Math.PI * 2, d = R(5, meanR - 2.5), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, s = R(1.8, 2.4);
    if (!inWall(x, z, s) || !land(x, z) || slope(x, z) > 1 || clash(x, z, s * 0.7, 0.5) || onPlazaAny(x, z, s * 0.7) || nearStreet(x, z).d < s * 0.6) continue;
    lots.push({ kind: 'garden', x, z, w: s, d: s, rot: facing(x, z, cx, cz), from: 2 + (i % 3), v: Math.floor(rnd() * 1000) });
    i++;
  }

  // les maisons : une grille tremblée dans les remparts, chaque maison tournée vers la rue la plus proche
  const houses: Lot[] = [];
  const step = 1.12;
  for (let gz = cz - meanR - 6; gz <= cz + meanR + 6; gz += step)
    for (let gx = cx - meanR - 6; gx <= cx + meanR + 6; gx += step) {
      const x = gx + (hash2(Math.round(gx * 8), Math.round(gz * 8), w.seed) - 0.5) * 0.35;
      const z = gz + (hash2(Math.round(gz * 8), Math.round(gx * 8), w.seed + 7) - 0.5) * 0.35;
      const hw = R(0.9, 1.35), hd = R(0.85, 1.25), r = Math.max(hw, hd) * 0.5;
      if (!inWall(x, z, r + 0.9) || !land(x, z) || slope(x, z) > 1.4) continue;
      const ns = nearStreet(x, z);
      if (ns.d < r + 0.06 || onPlazaAny(x, z, r) || clash(x, z, r, 0.15)) continue;
      if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < (Math.max(h.w, h.d) * 0.5 + r) * 0.8)) continue;
      // de face sur la rue si elle est proche ; sinon, vers le centre, à un quart de tour près (îlots plus serrés)
      const rot = ns.d < 3 ? facing(x, z, ns.sx, ns.sz) : Math.round(facing(x, z, cx, cz) / (Math.PI / 2)) * (Math.PI / 2);
      houses.push({ kind: 'house', x, z, w: hw, d: hd, rot, from: 5, v: Math.floor(rnd() * 1000) });
    }
  // les plus anciennes : près des rues et du centre ; la ville se remplit vers les remparts et dans les vides
  const score = houses.map((h) => Math.hypot(h.x - cx, h.z - cz) / meanR * 0.6 + Math.max(0, nearStreet(h.x, h.z).d) * 0.12 + rnd() * 0.35);
  const order = houses.map((_, i) => i).sort((a, b) => score[a] - score[b]);
  order.forEach((hi, rank) => {
    const f = (rank + 1) / houses.length;
    houses[hi].from = HOUSE_SHARE.findIndex((s) => s > 0 && f <= s + 1e-9);
  });
  // quelques ateliers parmi les maisons du bord, plus grands
  for (const h of houses) if (Math.hypot(h.x - cx, h.z - cz) > meanR * 0.7 && hash2(Math.round(h.x * 3), Math.round(h.z * 3), 55) < 0.08) { h.kind = 'workshop'; }
  lots.push(...houses);

  // les champs, hors les murs : sur les terres plates entre les remparts et la côte
  for (let i = 0, tries = 0; i < 26 && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2, d = R(meanR + 3, meanR + 13), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const fw = R(2.4, 3.6), fd = R(2, 3), r = Math.max(fw, fd) * 0.5;
    if (Math.abs(angleDiff(a, seaAng)) < 0.35) continue; // la route du port reste dégagée
    if (inPoly(x, z, wall) || wall.some((p, j) => segDist(x, z, p, wall[(j + 1) % K]) < r + 1.4)) continue;
    let ok = true;
    for (const [ox, oz] of [[0, 0], [-fw / 2, -fd / 2], [fw / 2, -fd / 2], [-fw / 2, fd / 2], [fw / 2, fd / 2]]) if (!land(x + ox, z + oz) || slope(x + ox, z + oz) > 0.7) ok = false;
    if (!ok || lots.some((l) => Math.hypot(l.x - x, l.z - z) < rad(l) * 0.8 + r * 0.8) || nearStreet(x, z).d < r) continue;
    lots.push({ kind: 'field', x, z, w: fw, d: fd, rot: facing(x, z, cx, cz), from: 1 + (i % 2), v: Math.floor(rnd() * 1000) });
    i++;
  }

  // les tours aux sommets des remparts, les portes au milieu de leur côté
  for (let i = 0; i < K; i++) {
    const [x, z] = wall[i];
    lots.push({ kind: 'tower', x, z, w: 1.3, d: 1.3, rot: facing(x, z, cx, cz), from: 1, v: i });
    if (gates[i] !== null) {
      const [gx, gz] = mid(i), a = wall[i], b = wall[(i + 1) % K];
      lots.push({ kind: 'gate', x: gx, z: gz, w: 2.4, d: 1.4, rot: Math.atan2(b[1] - a[1], -(b[0] - a[0])) /* façade vers l'extérieur */, from: 1, v: i });
    }
  }
  // (la façade d'une porte regarde au-dehors : on la retourne si elle regarde le centre)
  for (const l of lots) if (l.kind === 'gate' && Math.cos(l.rot) * (cz - l.z) + Math.sin(l.rot) * (cx - l.x) > 0) l.rot += Math.PI;

  // ---------- Les repères des âges récents (tirage à part : le reste de la ville ne bouge pas) ----------
  {
    const rl = mulberry32(w.seed * 131 + (people === 'orient' ? 7 : 19));
    /** l'emprise w × d tournée de rot tient-elle sur la terre ferme, assez plate, hors des murs et loin des autres lots ? */
    const fitsOut = (x: number, z: number, lw: number, ld: number, rot: number, maxSlope: number) => {
      const c = Math.cos(rot), s = Math.sin(rot), r = Math.hypot(lw, ld) / 2;
      for (const [u, v] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0]]) {
        const px = x + u * lw * c + v * ld * s, pz = z - u * lw * s + v * ld * c;
        if (!land(px, pz) || slope(px, pz) > maxSlope || height(px, pz) < 0.15) return false;
        if (inPoly(px, pz, wall)) return false;
      }
      if (wall.some((p, j) => segDist(x, z, p, wall[(j + 1) % K]) < r + 0.8)) return false;
      if (Math.hypot(plage[0] - x, plage[1] - z) < r + 3) return false;
      if (lots.some((l) => l.kind !== 'field' && Math.hypot(l.x - x, l.z - z) < rad(l) * 0.86 + r + 0.6)) return false;
      return nearStreet(x, z).d > r * 0.75;
    };
    /** les champs sous l'emprise cèdent la place à partir de l'âge `from` */
    const evict = (x: number, z: number, r: number, from: number, kinds: TownKind[]) => {
      for (const l of lots) if (kinds.includes(l.kind) && Math.hypot(l.x - x, l.z - z) < r + Math.max(l.w, l.d) * 0.5) l.until = Math.min(l.until ?? 9, from);
    };
    const add = (kind: TownKind, x: number, z: number, rot: number, from: number) => {
      const [sw, sd] = SIZE[kind]!;
      lots.push({ kind, x, z, w: sw, d: sd, rot, from, v: Math.floor(rl() * 1000) });
      evict(x, z, Math.hypot(sw, sd) / 2, from, ['field', 'house', 'workshop', 'garden']);
    };
    // l'usine : hors les murs, du côté du port (à 30-90° de la route du port), au plus près
    const [fw, fd] = SIZE.factory!;
    search: for (let d = meanR + 3.5; d < meanR + 12; d += 0.5)
      for (const da of [0.6, 0.8, 1.0, 1.2, 1.4, 1.6])
        for (const s of rl() < 0.5 ? [1, -1] : [-1, 1]) {
          const a = seaAng + s * da, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, rot = facing(x, z, cx, cz);
          if (fitsOut(x, z, fw, fd, rot, 0.8)) { add('factory', x, z, rot, 3); break search; }
        }
    // la gare : devant une porte de terre, la façade tournée vers la porte, une rue jusqu'à elle
    const [sw, sd] = SIZE.station!;
    const gs = portes.length > 1 ? portes.slice(1) : portes;
    search: for (let d = 2.6; d < 9; d += 0.4)
      for (const g of gs)
        for (const off of [0, 0.8, -0.8, 1.6, -1.6]) {
          const gd = Math.hypot(g[0] - cx, g[1] - cz) || 1, ux = (g[0] - cx) / gd, uz = (g[1] - cz) / gd;
          const x = g[0] + ux * d - uz * off, z = g[1] + uz * d + ux * off, rot = facing(x, z, g[0], g[1]);
          if (!fitsOut(x, z, sw, sd, rot, 0.8)) continue;
          add('station', x, z, rot, 3);
          const fx = x + Math.sin(rot) * (sd / 2 + 0.3), fz = z + Math.cos(rot) * (sd / 2 + 0.3);
          const road: [number, number][] = [[g[0] + ux * 0.4, g[1] + uz * 0.4], [fx, fz]];
          streets.push({ pts: road, w: 1.05, from: 3 });
          for (const l of lots) if (l.kind === 'field' && segDist(l.x, l.z, road[0], road[1]) < Math.max(l.w, l.d) * 0.5 + 0.7) l.until = Math.min(l.until ?? 9, 3);
          break search;
        }
    // le gratte-ciel : dans les murs, à mi-chemin du rempart, à la place de quelques maisons
    {
      const [kw, kd] = SIZE.skyscraper!, r = Math.hypot(kw, kd) / 2;
      let best: [number, number] | null = null, bs = Infinity;
      for (const h of houses) {
        const x = h.x, z = h.z, dc = Math.hypot(x - cx, z - cz);
        if (!inWall(x, z, r + 0.6) || onPlazaAny(x, z, r) || !land(x, z) || slope(x, z) > 1) continue;
        if (lots.some((l) => !['house', 'workshop', 'field'].includes(l.kind) && Math.hypot(l.x - x, l.z - z) < rad(l) * 0.86 + r + 0.3)) continue;
        if (nearStreet(x, z).d < r * 0.7) continue;
        const sc = Math.abs(dc / meanR - 0.5) + rl() * 0.15;
        if (sc < bs) { bs = sc; best = [x, z]; }
      }
      if (best) { const ns = nearStreet(best[0], best[1]); add('skyscraper', best[0], best[1], facing(best[0], best[1], ns.sx, ns.sz), 4); }
    }
    // l'arcologie : hors les murs, du côté opposé à la mer, sur un replat
    const [aw, ad] = SIZE.arcology!;
    search: for (let d = meanR + 5; d < meanR + 16; d += 0.5)
      for (let k = 0; k <= 12; k++) {
        const a = seaAng + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.18, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, rot = facing(x, z, cx, cz);
        if (fitsOut(x, z, aw, ad, rot, 1.1)) { add('arcology', x, z, rot, 5); break search; }
      }
  }

  return {
    people, x: cx, z: cz, seaAng, seaDist, r: meanR, lots, streets, plazas, wall, gates,
    points: { plage, port: quay, remparts: wall.map((p) => [p[0], p[1]]), portes, palais: pal, temple: [cx, cz], marche: mk },
  };
}

/** Les lots qui existent à l'âge `age` (la Préhistoire montre le bourg de l'Antiquité) */
export function lotsAt(plan: TownPlan, age: number) {
  const a = Math.max(1, age);
  return plan.lots.filter((l) => lotLives(l, a));
}

/**
 * Les casemates des remparts (la bataille des deux îles, au Moderne) : les deux sommets des remparts les plus proches de la
 * porte principale (hors de la porte elle-même). La vue y pose ses casemates de béton, la bataille ses bâtiments qui tirent
 */
export function casemateSpots(plan: TownPlan): [number, number][] {
  const g = plan.points.portes[0] ?? plan.points.remparts[0];
  return plan.points.remparts.filter((q) => Math.hypot(q[0] - g[0], q[1] - g[1]) > 3)
    .sort((a, b) => Math.hypot(a[0] - g[0], a[1] - g[1]) - Math.hypot(b[0] - g[0], b[1] - g[1])).slice(0, 2).map((q) => [q[0], q[1]]);
}
