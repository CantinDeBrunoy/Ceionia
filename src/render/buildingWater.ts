import * as THREE from 'three';

/**
 * L'eau des bâtiments (fontaines, puits, thermes, piscines, bassins, abreuvoirs) : des géométries marquées par leur graine
 * `aLight`, rangées avec les lumières d'un modèle (`Parts.water`) mais qui ne luisent pas. Le shader de `mats.lit` (et de
 * `mats.glow`) les reconnaît et les anime (voir `addWater`, `materials.ts`) : un seul matériau pour toute l'eau du village.
 *
 * La graine dit quelle eau et porte un nombre que la carte graphique interpole le long du triangle :
 * - surface (`WATER_SURF` - 100 d) : d = distance au bord du bassin (en cases du modèle), pour l'écume et la profondeur ;
 * - gerbe (`WATER_SPLASH` - 100 s) : s = 0 là où l'eau retombe, 1 au bord de la tache d'écume ;
 * - chute (`WATER_FALL` - 100 t) : t = 0 à la source, 1 au bout du jet ou de la cascade (le sens du courant).
 * Tout est sous `WATER_MAX` : les lumières (graine > 0, néons ≥ 2, lumières fixes `LIT_FIXED` = -100) restent au-dessus
 */
export const WATER_SURF = -200;
export const WATER_SPLASH = -400;
export const WATER_FALL = -600;
/** Toute graine sous ce seuil est de l'eau */
export const WATER_MAX = -150;

/** Gel de l'eau des bâtiments (0 … 1), le même que celui de la mer (`TerrainView`) */
export const WATER_ICE = { value: 0 };

/** La graine d'un sommet d'eau : `base` (surface, gerbe ou chute) et son nombre (0 … 0,99) */
export function waterSeed(base: number, v: number) {
  return base - 100 * Math.min(0.99, Math.max(0, v));
}

/** Ce que dit une graine : 0 surface, 1 gerbe, 2 chute (-1 : pas de l'eau), et son nombre */
export function readWaterSeed(seed: number): { kind: number; v: number } {
  if (!(seed <= WATER_MAX)) return { kind: -1, v: 0 };
  const u = -seed - 200, kind = Math.floor(u / 200 + 1e-6);
  return { kind, v: (u - kind * 200) / 100 };
}

const _c = new THREE.Color();
/**
 * La teinte qu'a une nappe de couleur `color` à la distance `d` du bord (le même calcul que le shader : clair au bord, sombre
 * au milieu) : la tache d'écume posée sur la nappe prend cette couleur, sans couture
 */
export function waterTint(color: number, d: number): number {
  _c.setHex(color);
  const t = Math.min(1, Math.max(0, d / 0.06)), deep = t * t * (3 - 2 * t);
  const sh = [_c.r * 1.12 + 0.03, _c.g * 1.2 + 0.08, _c.b * 1.12 + 0.07], dp = [_c.r * 0.42, _c.g * 0.62, _c.b * 0.8];
  _c.setRGB(sh[0] + (dp[0] - sh[0]) * deep, sh[1] + (dp[1] - sh[1]) * deep, sh[2] + (dp[2] - sh[2]) * deep);
  return _c.getHex();
}

/** Géométrie d'eau à partir de triangles (x, y, z) et de la graine de chaque sommet */
function geo(pos: number[], seed: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Float32Array(seed), 1));
  return g;
}

/**
 * Nappe ronde (à `seg` pans) de rayon r, posée à y = 0 : un éventail depuis le centre, chaque triangle porte la distance au
 * bord qui lui fait face (exacte le long du triangle). `calm` : le bord ne mousse pas (puits, tonneaux), décale toutes les
 * distances
 */
export function discWater(r: number, seg: number, calm = 0, rot = 0) {
  const pos: number[] = [], seed: number[] = [], ap = r * Math.cos(Math.PI / seg);
  for (let i = 0; i < seg; i++) {
    const a0 = rot + (i / seg) * Math.PI * 2, a1 = rot + ((i + 1) / seg) * Math.PI * 2;
    // le dessus regarde vers +y : centre, puis le pan dans le sens qui donne une normale montante
    pos.push(0, 0, 0, Math.cos(a1) * r, 0, Math.sin(a1) * r, Math.cos(a0) * r, 0, Math.sin(a0) * r);
    seed.push(waterSeed(WATER_SURF, ap + calm), waterSeed(WATER_SURF, calm), waterSeed(WATER_SURF, calm));
  }
  return geo(pos, seed);
}

/** Nappe rectangulaire w × d (le long de x et de z) : quatre triangles depuis le centre, un par côté */
export function rectWater(w: number, d: number, calm = 0) {
  const pos: number[] = [], seed: number[] = [], hw = w / 2, hd = d / 2;
  const c = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    // distance du centre au côté : la demi-profondeur pour les grands côtés (le long de x), la demi-largeur pour les petits
    const dc = i % 2 === 0 ? hd : hw;
    pos.push(0, 0, 0, ax, 0, az, bx, 0, bz);
    seed.push(waterSeed(WATER_SURF, dc + calm), waterSeed(WATER_SURF, calm), waterSeed(WATER_SURF, calm));
  }
  return geo(pos, seed);
}

/** Anneau d'eau (rivière à bouées, douve ronde) de r1 à r2 : la distance au bord monte jusqu'au milieu de l'anneau */
export function ringWater(r1: number, r2: number, seg: number, calm = 0) {
  const pos: number[] = [], seed: number[] = [], rm = (r1 + r2) / 2, dm = (r2 - r1) / 2;
  const at = (r: number, a: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    for (const [ra, rb, da, db] of [[r1, rm, 0, dm], [rm, r2, dm, 0]]) {
      const p00 = at(ra, a0), p01 = at(ra, a1), p10 = at(rb, a0), p11 = at(rb, a1);
      pos.push(...p00, ...p01, ...p10, ...p10, ...p01, ...p11);
      const s = [da, da, db, db, da, db].map((v) => waterSeed(WATER_SURF, v + calm));
      seed.push(...s);
    }
  }
  return geo(pos, seed);
}

/** Tache d'écume ronde là où l'eau retombe (rayon r), à poser juste au-dessus de la nappe */
export function splashWater(r: number, seg = 10) {
  const pos: number[] = [], seed: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a1) * r, 0, Math.sin(a1) * r, Math.cos(a0) * r, 0, Math.sin(a0) * r);
    seed.push(waterSeed(WATER_SPLASH, 0), waterSeed(WATER_SPLASH, 1), waterSeed(WATER_SPLASH, 1));
  }
  return geo(pos, seed);
}

/** Anneau d'écume au pied d'un rideau d'eau de rayon rc (largeur 2 w) : s = 0 sur le rideau, 1 aux deux bords */
export function splashRing(rc: number, w: number, seg: number) {
  const pos: number[] = [], seed: number[] = [];
  const at = (r: number, a: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    for (const [ra, rb, sa, sb] of [[Math.max(0.001, rc - w), rc, 1, 0], [rc, rc + w, 0, 1]]) {
      const p00 = at(ra, a0), p01 = at(ra, a1), p10 = at(rb, a0), p11 = at(rb, a1);
      pos.push(...p00, ...p01, ...p10, ...p10, ...p01, ...p11);
      seed.push(...[sa, sa, sb, sb, sa, sb].map((v) => waterSeed(WATER_SPLASH, v)));
    }
  }
  return geo(pos, seed);
}

/**
 * Eau qui coule le long d'une géométrie (jet, filet, gerbe, cascade) : chaque sommet prend t selon sa hauteur, de `y0` (la
 * source, t = 0) à `y1` (le bout, t = 1) ; un jet qui monte a y0 < y1, une chute y0 > y1
 */
export function fallWater(g: THREE.BufferGeometry, y0: number, y1: number) {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  ng.deleteAttribute('uv');
  ng.deleteAttribute('normal');
  const p = ng.attributes.position, s = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) s[i] = waterSeed(WATER_FALL, (p.getY(i) - y0) / (y1 - y0 || 1));
  ng.setAttribute('aLight', new THREE.BufferAttribute(s, 1));
  return ng;
}

/** Rideau d'eau ouvert (cylindre sans fond ni couvercle) qui tombe du rayon rTop à y = h jusqu'au rayon rBot à y = 0 */
export function curtainWater(rTop: number, rBot: number, h: number, seg: number) {
  return fallWater(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true).translate(0, h / 2, 0), h, 0);
}

/** Nappe qui tombe à plat (cascade d'un bassin à l'autre), large de w, de la hauteur h jusqu'au sol en avançant de `run` vers +z */
export function sheetWater(w: number, h: number, run = 0) {
  // les deux faces (vue de devant comme de derrière)
  const a = [-w / 2, h, 0], b = [-w / 2, 0, run], c = [w / 2, h, 0], d = [w / 2, 0, run];
  const pos = [...a, ...b, ...c, ...c, ...b, ...d, ...a, ...c, ...b, ...c, ...d, ...b];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const s = new Float32Array(12);
  for (let i = 0; i < 12; i++) s[i] = waterSeed(WATER_FALL, 1 - pos[i * 3 + 1] / (h || 1));
  g.setAttribute('aLight', new THREE.BufferAttribute(s, 1));
  return g;
}
