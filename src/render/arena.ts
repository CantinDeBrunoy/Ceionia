import * as THREE from 'three';
import { Parts, type Glow } from './parts';
import { hash2 } from '../core/rng';

/**
 * L'arène (3 × 3), le grand bâtiment des loisirs, à chaque âge. Même plan à tous les âges : l'enceinte au milieu de la parcelle,
 * son entrée face à +z sur un parvis, deux combattants au centre, la foule tout autour (la ola, si le moteur l'anime).
 * Antiquité : le Colisée, ovale de travertin à trois étages d'arcades et son attique, gradins en trois anneaux, sable de l'arène
 * où deux pugilistes aux cestes s'affrontent, loge impériale sous un velum pourpre, mâts du velarium et leurs toiles, porte
 * triomphale au quadrige doré, braseros et enseignes. Moyen Âge : les lices d'un tournoi, la barrière de joute et deux chevaliers
 * lance baissée, tribune couverte de toiles rayées et loge du roi, écus, tours de la porte, pavillons rayés des jouteurs,
 * torches, fanions. Industriel : la salle des combats, halle de briques sous une voûte de fonte à verrière ouverte au faîte, ring
 * à poings nus éclairé au gaz, gradins de bois, affiches, enseigne à ampoules, cheminée qui fume. Moderne : le palais de la boxe,
 * ovale de béton blanc à bandeau vitré, toit en anneau ouvert sur le ring, gradins de couleur pleins, projecteurs, écran géant,
 * enseigne au néon, parvis aux affiches. Futuriste : l'arène des robots, anneau de gradins lumineux porté par des pylônes
 * au-dessus d'une fosse hexagonale, cage d'énergie, deux robots de combat (scie et masse), hologramme, écrans et drones. Les aides
 * du moteur de modèles (pièces qui se balancent ou tournent, fumée, personnages animés) arrivent par `ArenaKit` pour ne pas
 * importer models.ts
 */
type V3 = [number, number, number];
export interface ArenaKit {
  sway: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
  turn: (pivot: V3, axis: V3, speed: number) => Parts;
  smoke: (x: number, y: number, z: number, kind: number) => void;
  /** Facultatif : balancement régulier, qui ne dépend pas du vent (les coups des boxeurs) ; à défaut, `sway` */
  swing?: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
  /** Facultatif : personnage animé (`animPart` de models.ts : la ola des gradins) ; à défaut, la foule est figée */
  fan?: (draw: (q: Parts) => void, pivot: V3, axis: V3, amp: number, freq: number, phase: number, bounce?: number) => void;
}

const PI = Math.PI;
const H = (i: number, k: number) => hash2(i, k, 97);
const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const lt = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
const GOLD = 0xe8c66a, IRON = 0x3c3c42, SKIN = [0xe8b894, 0xc89870, 0xf0c8a4, 0xa87850];
const HAIR = [0x4a3426, 0x2a2a2e, 0x8a5a30, 0xd8b060];
const NEONS = [0xff4aa8, 0x4ae8ff, 0xffe24a, 0x9a6aff, 0x4aff9a];

/** Tube de rayon r entre deux points (repère du modèle) */
function tubeW(p: Parts, a: V3, b: V3, r: number, color: number, glow: Glow = false, seg = 5) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), L = d.length();
  if (L < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, L, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  p.add(g, A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2, color, 0, glow);
}

/** Repère local posé sur la parcelle : origine (x0, z0), tourné de `ry`, agrandi de `k`, au ras du sol (y = 0.012) */
class Fr {
  private c: number; private s: number;
  constructor(readonly p: Parts, readonly x0: number, readonly z0: number, readonly ry = 0, readonly k = 1, readonly base = 0.012) {
    this.c = Math.cos(ry); this.s = Math.sin(ry);
  }
  X(x: number, z: number) { return this.x0 + (x * this.c + z * this.s) * this.k; }
  Z(x: number, z: number) { return this.z0 + (-x * this.s + z * this.c) * this.k; }
  w(x: number, y: number, z: number): V3 { return [this.X(x, z), this.base + y * this.k, this.Z(x, z)]; }
  sub(x: number, z: number, ry = 0, k = 1) { return new Fr(this.p, this.X(x, z), this.Z(x, z), this.ry + ry, this.k * k, this.base); }
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, glow: Glow = false, rz = 0) {
    this.p.box(w * this.k, h * this.k, d * this.k, this.X(x, z), this.base + y * this.k, this.Z(x, z), color, this.ry, glow, rz);
  }
  cyl(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: number, glow: Glow = false) {
    this.p.cyl(rt * this.k, rb * this.k, h * this.k, seg, this.X(x, z), this.base + y * this.k, this.Z(x, z), color, glow, this.ry);
  }
  cone(r: number, h: number, seg: number, x: number, y: number, z: number, color: number, glow: Glow = false) {
    this.cyl(0, r, h, seg, x, y, z, color, glow);
  }
  /** Boule (ou ellipsoïde, `sx`, `sy`, `sz` : demi-axes relatifs) */
  ball(r: number, x: number, y: number, z: number, color: number, glow: Glow = false, sx = 1, sy = 1, sz = 1, detail = 0) {
    this.p.add(new THREE.IcosahedronGeometry(r * this.k, detail).scale(sx, sy, sz), this.X(x, z), this.base + y * this.k, this.Z(x, z), color, this.ry, glow);
  }
  add(g: THREE.BufferGeometry, x: number, y: number, z: number, color: number, glow: Glow = false, rz = 0, rx = 0) {
    if (this.k !== 1) g.scale(this.k, this.k, this.k);
    this.p.add(g, this.X(x, z), this.base + y * this.k, this.Z(x, z), color, this.ry, glow, rz, rx);
  }
  tube(a: V3, b: V3, r: number, color: number, glow: Glow = false, seg = 5) {
    tubeW(this.p, this.w(...a), this.w(...b), r * this.k, color, glow, seg);
  }
}

/**
 * Ovale centré en (0, cz) de la parcelle, de demi-grand axe r le long de x et r × ez le long de z : murs, gradins et anneaux.
 * Les sommets tombent aux mêmes angles pour toutes les pièces (décalés d'un demi-pan, pour qu'un pan fasse face à l'entrée)
 */
class Oval {
  readonly t0: number;
  constructor(readonly f: Fr, readonly cz: number, readonly ez: number, readonly seg: number) { this.t0 = PI / seg; }
  x(r: number, t: number) { return Math.sin(t) * r; }
  z(r: number, t: number) { return this.cz + Math.cos(t) * r * this.ez; }
  /** Orientation de la normale sortante à l'angle t (0 : vers +z) */
  ry(t: number) { return Math.atan2(this.ez * Math.sin(t), Math.cos(t)); }
  /** Mur sans dessus ni dessous ; `inward` : vu de l'intérieur (podium, fond des gradins) */
  band(r: number, h: number, y: number, color: number, glow: Glow = false, inward = false, t0 = this.t0, tl = 2 * PI, seg = this.seg) {
    this.f.add(new THREE.CylinderGeometry(r, r, h, seg, 1, true, t0, tl).translate(0, h / 2, 0).scale(inward ? -1 : 1, 1, this.ez), 0, y, this.cz, color, glow);
  }
  /** Pente de gradins vue d'en haut, du rayon r0 (en bas, y0) au rayon r1 (en haut, y1) */
  slope(r0: number, y0: number, r1: number, y1: number, color: number, glow: Glow = false, t0 = this.t0, tl = 2 * PI, seg = this.seg) {
    this.f.add(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, true, t0, tl).translate(0, (y1 - y0) / 2, 0).scale(-1, 1, this.ez), 0, y0, this.cz, color, glow);
  }
  /** Anneau plat tourné vers le ciel (disque si r0 = 0) */
  flat(r0: number, r1: number, y: number, color: number, glow: Glow = false) {
    const g = r0 > 0 ? new THREE.RingGeometry(r0, r1, this.seg, 1, this.t0) : new THREE.CircleGeometry(r1, this.seg, this.t0);
    this.f.add(g.rotateX(-PI / 2).scale(1, 1, this.ez), 0, y, this.cz, color, glow);
  }
}

/** Quadrilatère a b c d (repère du modèle) ; `both` : visible des deux côtés (toiles, drapeaux) */
function quad(p: Parts, a: V3, b: V3, c: V3, d: V3, color: number, glow: Glow = false, both = false) {
  const t = [a, b, c, a, c, d];
  if (both) t.push(a, c, b, a, d, c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(t.flat()), 3));
  p.add(g, 0, 0, 0, color, 0, glow);
}

/** Arcade sombre (ou fenêtre cintrée) plaquée sur une façade : rectangle et demi-disque, face à +z du repère */
function arch(g: Fr, w: number, h: number, x: number, y: number, z: number, color: number, glow: Glow = false) {
  g.add(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), x, y, z, color, glow);
  g.add(new THREE.CircleGeometry(w / 2, 4, 0, PI), x, y + h, z, color, glow);
}

interface PersonO { y?: number; skin?: number; legs?: number; hair?: number; arms?: 'down' | 'up' | 'out' | 'one'; hat?: 'top' | 'cone' | 'cap' | 'none'; hatColor?: number }
/** Petit personnage figé, de la taille des habitants (≈ 0,19) : jambes, buste, tête, cheveux, bras, chapeau */
function person(f: Fr, x: number, z: number, ry: number, body: number, o: PersonO = {}) {
  const g = f.sub(x, z, ry), y = o.y ?? 0, skin = o.skin ?? SKIN[Math.floor(H(Math.round(x * 50), Math.round(z * 50)) * 4)], legs = o.legs ?? 0x3c3c48;
  g.box(0.02, 0.07, 0.022, -0.014, y, 0, legs); g.box(0.02, 0.07, 0.022, 0.014, y, 0, legs);
  g.box(0.055, 0.07, 0.035, 0, y + 0.07, 0, body);
  g.box(0.032, 0.032, 0.032, 0, y + 0.145, 0, skin);
  g.box(0.034, 0.012, 0.034, 0, y + 0.172, 0, o.hair ?? 0x4a3426);
  const arms = o.arms ?? 'down';
  for (const s of [-1, 1]) {
    if (arms === 'up' || (arms === 'one' && s > 0)) { g.box(0.016, 0.06, 0.018, s * 0.037, y + 0.135, 0, body); g.box(0.018, 0.018, 0.02, s * 0.037, y + 0.193, 0, skin); }
    else if (arms === 'out') { g.box(0.07, 0.016, 0.018, s * 0.075, y + 0.12, 0, body); g.box(0.018, 0.018, 0.02, s * 0.116, y + 0.119, 0, skin); }
    else { g.box(0.016, 0.055, 0.018, s * 0.037, y + 0.075, 0, body); g.box(0.018, 0.018, 0.02, s * 0.037, y + 0.06, 0, skin); }
  }
  const hc = o.hatColor ?? 0x2a2a30;
  if (o.hat === 'top') { g.cyl(0.02, 0.02, 0.045, 7, 0, y + 0.18, 0, hc); g.cyl(0.032, 0.032, 0.006, 8, 0, y + 0.18, 0, hc); }
  else if (o.hat === 'cone') g.cone(0.022, 0.06, 6, 0, y + 0.18, 0, hc);
  else if (o.hat === 'cap') { g.box(0.038, 0.018, 0.038, 0, y + 0.18, 0, hc); g.box(0.03, 0.006, 0.03, 0, y + 0.186, 0.03, hc); }
}

/** Spectateur assis (buste et tête) en (x, y, z) du repère, tourné de `ry` ; il se lève avec la ola si le kit l'anime */
function fan(f: Fr, kit: ArenaKit, x: number, y: number, z: number, ry: number, shirt: number, head: number, phase: number) {
  const draw = (q: Parts) => {
    const g = new Fr(q, f.X(x, z), f.Z(x, z), f.ry + ry, f.k, f.base);
    g.box(0.036, 0.046, 0.026, 0, y, 0, shirt);
    g.box(0.024, 0.024, 0.024, 0, y + 0.048, 0.003, head);
  };
  if (!kit.fan) { draw(f.p); return; }
  const r = f.ry + ry;
  kit.fan(draw, f.w(x, y, z), [Math.cos(r), 0, -Math.sin(r)], 0.05, 0.3, phase, 0.016);
}

/** Rangée de spectateurs sur un anneau des gradins, de l'angle t0 à t1, tournés vers le centre ; quelques places vides */
function ringRow(o: Oval, kit: ArenaKit, r: number, y: number, n: number, t0: number, t1: number, shirts: number[], heads: number[], seed: number, skip = 0.15) {
  for (let i = 0; i < n; i++) {
    if (H(i, seed) < skip) continue;
    const t = t0 + ((t1 - t0) * (i + 0.5)) / n;
    fan(o.f, kit, o.x(r, t), y, o.z(r, t), o.ry(t) + PI, shirts[Math.floor(H(i, seed + 1) * shirts.length)], heads[Math.floor(H(i, seed + 2) * heads.length)], -t * 3);
  }
}

/** Rangée droite de spectateurs dans le repère g, de x0 à x1, tournés vers +z */
function lineRow(g: Fr, kit: ArenaKit, x0: number, x1: number, y: number, z: number, n: number, shirts: number[], heads: number[], seed: number, skip = 0.15) {
  for (let i = 0; i < n; i++) {
    if (H(i, seed) < skip) continue;
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    fan(g, kit, x, y, z, 0, shirts[Math.floor(H(i, seed + 1) * shirts.length)], heads[Math.floor(H(i, seed + 2) * heads.length)], -g.X(x, z) * 3);
  }
}

interface FighterO { skin: number; shorts: number; glove: number; hair: number; legs?: number; boots?: number }
/**
 * Combattant en garde, tourné de `ry` (face à +z du repère) : jambes écartées, culotte, torse nu ; ses deux bras frappent (pièces
 * qui se balancent autour de l'épaule, chacune à son rythme)
 */
function fighter(f: Fr, kit: ArenaKit, x: number, y: number, z: number, ry: number, o: FighterO, seed: number) {
  const g = f.sub(x, z, ry), legs = o.legs ?? o.skin;
  g.box(0.02, 0.07, 0.022, -0.02, y, -0.014, legs); g.box(0.02, 0.07, 0.022, 0.02, y, 0.014, legs);
  if (o.boots) { g.box(0.024, 0.022, 0.03, -0.02, y, -0.01, o.boots); g.box(0.024, 0.022, 0.03, 0.02, y, 0.018, o.boots); }
  g.box(0.058, 0.03, 0.036, 0, y + 0.062, 0, o.shorts);
  g.box(0.056, 0.056, 0.034, 0, y + 0.09, 0.004, o.skin);
  g.box(0.03, 0.032, 0.03, 0, y + 0.146, 0.008, o.skin);
  g.box(0.032, 0.012, 0.032, 0, y + 0.174, 0.006, o.hair);
  const r = f.ry + ry, fx = Math.sin(r), fz = Math.cos(r), ax: V3 = [Math.cos(r), 0, -Math.sin(r)], mk = kit.swing ?? kit.sway;
  for (const s of [-1, 1]) {
    const sw = mk(g.w(s * 0.036, y + 0.13, 0.008), ax, 0.35, 1.1 + 0.35 * s + 0.15 * seed);
    sw.box(0.018, 0.018, 0.06, fx * 0.03, -0.018, fz * 0.03, o.skin, r);
    sw.box(0.026, 0.026, 0.028, fx * 0.066, -0.022, fz * 0.066, o.glove, r);
  }
}

/** Fanion accroché en (x, y, z) (le mât n'est pas dessiné) : il flotte au vent */
function flag(f: Fr, kit: ArenaKit, x: number, y: number, z: number, w: number, h: number, color: number, trim: number, glow: Glow = false) {
  const s = kit.sway(f.w(x, y, z), [0, 1, 0], 0.4, 0.9);
  s.box(w, h, 0.006, w / 2, -h, 0, color, 0, glow);
  s.box(w, 0.012, 0.008, w / 2, -0.012, 0, trim, 0, glow);
  s.box(w * 0.3, h * 0.6, 0.006, w + w * 0.12, -h * 0.8, 0, color, 0, glow, PI / 4);
}

/** Toile du velarium entre deux mâts : elle ondule autour de son bord extérieur */
function sail(kit: ArenaKit, a: V3, b: V3, c: V3, d: V3, color: number) {
  const pv: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const s = kit.sway(pv, [(b[0] - a[0]) / L, 0, (b[2] - a[2]) / L], 0.06, 0.5), rel = (q: V3): V3 => [q[0] - pv[0], q[1] - pv[1], q[2] - pv[2]];
  quad(s, rel(a), rel(b), rel(c), rel(d), color, false, true);
}

/** Fanions triangulaires sur une ligne qui pend */
function bunting(f: Fr, a: V3, b: V3, n: number, sag: number, palette: number[]) {
  let prev: V3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    if (prev) f.tube(prev, q, 0.0018, 0x6a5c4c, false, 3);
    if (i > 0 && i < n) f.add(new THREE.ConeGeometry(0.022, 0.05, 3).rotateX(PI), q[0], q[1] - 0.04, q[2], palette[i % palette.length]);
    prev = q;
  }
}

/** Brasero sur trépied : vasque de bronze, flamme qui vacille la nuit, un peu de fumée */
function brazier(f: Fr, kit: ArenaKit, x: number, y: number, z: number, smoke: boolean, h = 0.13, metal = 0x7a6040) {
  for (let k = 0; k < 3; k++) { const t = k * 2.094 + 0.5; f.tube([x + Math.sin(t) * 0.045, y, z + Math.cos(t) * 0.045], [x + Math.sin(t) * 0.018, y + h, z + Math.cos(t) * 0.018], 0.005, metal, false, 3); }
  f.cyl(0.045, 0.024, 0.035, 7, x, y + h - 0.01, z, metal);
  f.cone(0.036, 0.075, 5, x, y + h + 0.02, z, 0xff8a3a, true);
  f.cone(0.02, 0.05, 4, x + 0.008, y + h + 0.025, z - 0.006, 0xffd060, true);
  if (smoke) { const w = f.w(x, y + h + 0.1, z); kit.smoke(w[0], w[1], w[2], 0); }
}

/** Torche sur un poteau */
function torch(f: Fr, x: number, z: number, h: number, wood: number) {
  f.cyl(0.007, 0.009, h, 5, x, 0, z, wood);
  f.cyl(0.016, 0.01, 0.03, 5, x, h, z, IRON);
  f.cone(0.016, 0.055, 5, x, h + 0.025, z, 0xff8a3a, true);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* ANTIQUITÉ : LE COLISÉE                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */
function colosseum(f: Fr, kit: ArenaKit) {
  const N = 32, A = 1.4, o = new Oval(f, -0.06, 0.8, N), cz = o.cz, dt = (2 * PI) / N;
  const TRAV = 0xe2d5b4, CORN = 0xd0c19c, COL = 0xeee5ca, DARK = 0x3a2e24, DARK2 = 0x56473a, MARB = 0xf2eee2, SAND = 0xdcc08a;
  const PURP = 0x6e2a72, RED = 0xb8402e, OCHRE = 0xe0b45a, BRONZE = 0xc8a050;
  f.p.box(2.92, 0.012, 2.92, 0, 0, 0, 0xb4c084);
  const fz = o.z(A, 0);
  f.box(1.36, 0.004, 0.38, 0, 0, fz + 0.19, 0xd8ccae);

  // la façade : trois étages d'arcades sombres entre des colonnes engagées, corniches, attique à petites fenêtres
  o.band(A, 0.75, 0, TRAV);
  for (let k = 0; k < N; k++) {
    const ta = k * dt - dt / 2, tb = k * dt + dt / 2;
    const ax = o.x(A, ta), az = o.z(A, ta), bx = o.x(A, tb), bz = o.z(A, tb), L = Math.hypot(bx - ax, bz - az);
    const g = f.sub((ax + bx) / 2, (az + bz) / 2, Math.atan2(az - bz, bx - ax)), w = L * 0.5;
    if (k !== 0) { arch(g, w, 0.09, 0, 0.02, 0.003, DARK); arch(g, w, 0.08, 0, 0.23, 0.003, DARK2); arch(g, w, 0.07, 0, 0.43, 0.003, DARK2); }
    if (k % 2) g.add(new THREE.PlaneGeometry(0.05, 0.035), 0, 0.655, 0.003, DARK2);
  }
  for (let j = 1; j < N - 1; j++) { const t = o.t0 + j * dt; f.sub(o.x(A + 0.006, t), o.z(A + 0.006, t), o.ry(t)).box(0.022, 0.575, 0.014, 0, 0, 0, COL); }
  for (const y of [0.185, 0.395, 0.575]) o.band(A + 0.014, 0.02, y, CORN);
  o.band(A + 0.016, 0.03, 0, dk(TRAV, 0.85));
  o.band(A + 0.018, 0.035, 0.72, CORN);
  o.flat(A - 0.1, A + 0.018, 0.755, lt(TRAV, 0.15));

  // la cavea : podium de marbre, trois rangs de gradins séparés de couloirs, places de bois du peuple tout en haut
  o.band(A - 0.1, 0.095, 0.66, dk(TRAV, 0.88), false, true);
  o.slope(1.19, 0.56, 1.3, 0.66, 0x9a7a58);
  o.band(1.19, 0.03, 0.53, MARB, false, true); o.flat(1.16, 1.19, 0.53, CORN);
  o.slope(1.08, 0.45, 1.16, 0.53, TRAV); o.slope(1.0, 0.37, 1.08, 0.45, dk(TRAV, 0.92));
  o.band(1.0, 0.04, 0.33, MARB, false, true); o.flat(0.97, 1.0, 0.33, CORN);
  o.slope(0.88, 0.24, 0.97, 0.33, lt(TRAV, 0.25)); o.slope(0.78, 0.14, 0.88, 0.24, MARB);
  o.flat(0.72, 0.78, 0.14, CORN); o.band(0.72, 0.14, 0, MARB, false, true);
  // vomitoires : bouches sombres d'où sort la foule
  for (let k = 0; k < 8; k++) { const t = (k + 0.5) * PI / 4; f.sub(o.x(1.03, t), o.z(1.03, t), o.ry(t) + PI).box(0.05, 0.05, 0.04, 0, 0.36, 0, DARK); }
  // portes des gladiateurs aux deux bouts du grand axe
  for (const s of [-1, 1]) arch(f.sub(s * 0.716, cz, -s * PI / 2), 0.08, 0.05, 0, 0, 0, DARK);

  // l'arène : sable, traces, trappes ; deux pugilistes aux cestes et l'arbitre à la baguette
  o.flat(0, 0.72, 0.003, SAND);
  for (let k = 0; k < 6; k++) f.add(new THREE.CircleGeometry(0.04 + 0.04 * H(k, 1), 6).rotateX(-PI / 2), -0.5 + H(k, 2), 0.005, cz - 0.3 + 0.6 * H(k, 3), dk(SAND, 0.9));
  for (const s of [-1, 1]) f.box(0.06, 0.004, 0.06, s * 0.34, 0.003, cz + 0.18, 0x8a6a48);
  const pug: FighterO = { skin: 0xc89870, shorts: 0xf2eee2, glove: 0x6a4228, hair: 0x2a2018 };
  fighter(f, kit, -0.075, 0.004, cz + 0.012, PI / 2, pug, 0);
  fighter(f, kit, 0.075, 0.004, cz - 0.012, -PI / 2, { ...pug, skin: 0xe0b08a, shorts: RED, hair: 0x6a4a30 }, 1);
  person(f, 0.03, cz - 0.17, 0.25, 0xf2eee2, { y: 0.004, arms: 'one', legs: 0xc89870 });
  f.tube([0.075, 0.2, cz - 0.16], [0.09, 0.28, cz - 0.12], 0.003, 0x6e523c, false, 3);

  // la foule en toges, tunique claire surtout
  const shirts = [0xf2eee2, 0xf2eee2, 0xe8dcc0, RED, OCHRE, 0x8a6a9a, 0x6a8ab8, 0xc8783a], heads = [...SKIN, 0x3a2a20, 0x2a2a2e, 0x6a4a30];
  ringRow(o, kit, 0.83, 0.19, 26, -PI + 0.45, PI - 0.45, shirts, heads, 1, 0.2);
  ringRow(o, kit, 0.93, 0.29, 26, -PI + 0.4, PI - 0.4, shirts, heads, 2, 0.25);
  ringRow(o, kit, 1.07, 0.445, 22, -PI, PI, shirts, heads, 3, 0.45);
  ringRow(o, kit, 1.24, 0.605, 18, -PI, PI, shirts, heads, 4, 0.55);

  // la loge impériale (pulvinar) au fond : estrade de marbre, tenture pourpre, colonnes, velum pourpre frangé d'or
  const lz = -0.75;
  f.box(0.4, 0.32, 0.22, 0, 0, lz, MARB);
  f.box(0.4, 0.11, 0.008, 0, 0.2, lz + 0.112, PURP);
  f.box(0.41, 0.014, 0.012, 0, 0.19, lz + 0.114, GOLD); f.box(0.41, 0.014, 0.012, 0, 0.31, lz + 0.114, GOLD);
  for (const sx of [-0.17, 0.17]) for (const sz of [lz - 0.09, lz + 0.09]) f.cyl(0.012, 0.014, 0.24, 6, sx, 0.32, sz, COL);
  f.box(0.44, 0.012, 0.28, 0, 0.555, lz, GOLD);
  f.p.gable(0.44, 0.08, 0.28, 0, f.base + 0.567, lz, PURP);
  f.box(0.44, 0.045, 0.006, 0, 0.51, lz + 0.142, PURP);
  for (let k = 0; k < 7; k++) f.add(new THREE.ConeGeometry(0.018, 0.03, 3).rotateX(PI), -0.18 + k * 0.06, 0.497, lz + 0.144, GOLD);
  f.box(0.07, 0.12, 0.03, 0, 0.32, lz - 0.06, GOLD);
  person(f, 0, lz - 0.02, 0, PURP, { y: 0.32, arms: 'one', hat: 'cap', hatColor: GOLD, legs: 0xf2eee2 });
  fan(f, kit, -0.11, 0.32, lz, 0, 0xf2eee2, SKIN[0], 0); fan(f, kit, 0.11, 0.32, lz, 0, 0xf2eee2, 0x3a2a20, 0.5);
  for (const s of [-1, 1]) brazier(f, kit, o.x(0.75, PI + s * 0.36), 0.14, o.z(0.75, PI + s * 0.36), false, 0.1);

  // le velarium : mâts sur l'attique, toiles colorées tendues au-dessus des gradins (l'entrée et l'arène restent au soleil)
  const mx = (k: number) => o.x(A + 0.014, k * dt), mz = (k: number) => o.z(A + 0.014, k * dt);
  for (let k = 2; k < N; k += 2) f.tube([mx(k), 0.6, mz(k)], [mx(k), 0.95, mz(k)], 0.008, 0x8a6a48, false, 4);
  for (let k = 6; k < 26; k += 2) {
    const ta = k * dt, tb = (k + 2) * dt;
    sail(kit, f.w(o.x(A + 0.01, ta), 0.92, o.z(A + 0.01, ta)), f.w(o.x(A + 0.01, tb), 0.92, o.z(A + 0.01, tb)),
      f.w(o.x(1.1, tb), 0.83, o.z(1.1, tb)), f.w(o.x(1.1, ta), 0.83, o.z(1.1, ta)), [RED, OCHRE, 0xf2ead2][(k / 2) % 3]);
  }
  for (const k of [2, 4, 28, 30]) { f.ball(0.012, mx(k), 0.955, mz(k), GOLD); flag(f, kit, mx(k), 0.94, mz(k), 0.09, 0.045, k % 4 ? RED : PURP, GOLD); }

  // la porte triomphale face à +z : avant-corps, grande arche, colonnes, fronton, inscription de bronze, quadrige doré
  f.box(0.46, 0.8, 0.1, 0, 0, fz + 0.01, TRAV);
  arch(f, 0.17, 0.2, 0, 0, fz + 0.062, DARK);
  for (const s of [-1, 1]) { f.cyl(0.02, 0.022, 0.46, 6, s * 0.15, 0, fz + 0.075, COL); f.box(0.05, 0.02, 0.05, s * 0.15, 0.46, fz + 0.075, CORN); }
  f.box(0.46, 0.035, 0.05, 0, 0.48, fz + 0.075, CORN);
  f.p.gable(0.4, 0.08, 0.04, 0, f.base + 0.515, fz + 0.08, CORN);
  f.box(0.2, 0.06, 0.01, 0, 0.62, fz + 0.062, 0xa07838);
  for (let k = 0; k < 5; k++) f.box(0.022, 0.024, 0.006, -0.064 + k * 0.032, 0.638, fz + 0.068, GOLD);
  f.box(0.26, 0.04, 0.1, 0, 0.8, fz + 0.01, CORN);
  for (let k = 0; k < 4; k++) {
    const hx = -0.054 + k * 0.036;
    f.box(0.016, 0.03, 0.05, hx, 0.84, fz + 0.03, BRONZE); f.box(0.022, 0.028, 0.06, hx, 0.866, fz + 0.03, BRONZE); f.box(0.016, 0.032, 0.024, hx, 0.88, fz + 0.065, BRONZE);
  }
  f.box(0.11, 0.045, 0.035, 0, 0.84, fz - 0.025, BRONZE); f.box(0.03, 0.06, 0.03, 0, 0.885, fz - 0.025, BRONZE);
  f.box(0.36, 0.012, 0.1, 0, 0, fz + 0.1, MARB); f.box(0.3, 0.012, 0.05, 0, 0.012, fz + 0.08, MARB);

  // le parvis : braseros, enseignes de légion au vent, deux spectateurs qui arrivent
  for (const s of [-1, 1]) brazier(f, kit, s * 0.33, 0, fz + 0.22, true);
  for (const s of [-1, 1]) {
    const x = s * 0.6, z = fz + 0.3;
    f.cyl(0.006, 0.008, 0.5, 5, x, 0, z, 0x6e523c); f.ball(0.016, x, 0.51, z, GOLD); f.box(0.1, 0.008, 0.008, x, 0.46, z, GOLD);
    const sw = kit.sway(f.w(x, 0.46, z), [1, 0, 0], 0.15, 0.7);
    sw.box(0.09, 0.12, 0.006, 0, -0.12, 0.006, s > 0 ? RED : PURP);
    sw.box(0.092, 0.014, 0.008, 0, -0.125, 0.006, GOLD);
  }
  person(f, -0.42, fz + 0.3, 0.3, 0xf2eee2, {});
  person(f, 0.46, fz + 0.24, -0.5, RED, { hair: 0x2a2018 });
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* MOYEN ÂGE : LES LICES D'UN TOURNOI                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */
interface KnightO { coat: number; c1: number; c2: number }
/** Chevalier au galop, lance baissée (face à +z du repère, la barrière à sa gauche, en +x) : cheval caparaçonné, armure, écu */
function knight(f: Fr, x: number, z: number, ry: number, o: KnightO) {
  const g = f.sub(x, z, ry), MAIL = 0xa8aeb6, dc = dk(o.coat, 0.7);
  // le cheval : corps, caparaçon frangé aux armoiries, encolure couverte, chanfrein, jambes au galop, queue
  g.box(0.07, 0.075, 0.2, 0, 0.1, 0, o.coat);
  g.box(0.088, 0.07, 0.22, 0, 0.072, -0.005, o.c1);
  g.box(0.09, 0.012, 0.222, 0, 0.068, -0.005, o.c2);
  g.box(0.088, 0.06, 0.03, 0, 0.075, 0.11, o.c1);
  for (const s of [-1, 1]) { g.box(0.004, 0.035, 0.05, s * 0.045, 0.095, -0.05, o.c2); g.box(0.005, 0.012, 0.05, s * 0.0455, 0.107, -0.05, o.c1); }
  g.tube([0, 0.15, 0.08], [0, 0.225, 0.14], 0.023, o.c1, false, 5);
  g.tube([0, 0.228, 0.14], [0, 0.19, 0.215], 0.018, o.c1, false, 5);
  g.cone(0.01, 0.04, 4, 0, 0.235, 0.15, o.c2);
  g.tube([0.02, 0.1, 0.07], [0.02, 0.0, 0.15], 0.01, dc, false, 4); g.tube([-0.02, 0.1, 0.07], [-0.02, 0.035, 0.13], 0.01, dc, false, 4);
  g.tube([0.02, 0.1, -0.07], [0.02, 0.0, -0.15], 0.01, dc, false, 4); g.tube([-0.02, 0.1, -0.07], [-0.02, 0.0, -0.09], 0.01, dc, false, 4);
  g.tube([0, 0.15, -0.1], [0, 0.1, -0.17], 0.012, dk(o.coat, 0.5), false, 4);
  // le cavalier : jambes, surcot, heaume à cimier, écu à gauche, lance sous le bras droit
  for (const s of [-1, 1]) g.box(0.016, 0.06, 0.05, s * 0.046, 0.1, 0.0, MAIL);
  g.box(0.05, 0.07, 0.04, 0, 0.165, -0.01, o.c1);
  g.box(0.052, 0.016, 0.042, 0, 0.2, -0.01, o.c2);
  g.box(0.016, 0.016, 0.06, -0.034, 0.19, 0.02, MAIL);
  g.cyl(0.018, 0.02, 0.045, 6, 0, 0.235, -0.01, 0xb8bec6);
  g.box(0.03, 0.006, 0.004, 0, 0.258, 0.01, 0x1a1a1e);
  g.cone(0.012, 0.05, 4, 0, 0.28, -0.012, o.c2);
  g.box(0.006, 0.07, 0.055, 0.04, 0.14, 0.01, o.c2); g.box(0.007, 0.016, 0.056, 0.0405, 0.17, 0.01, o.c1); g.box(0.007, 0.07, 0.014, 0.0405, 0.14, 0.01, o.c1);
  g.tube([-0.03, 0.18, -0.08], [0.12, 0.215, 0.44], 0.007, o.c2, false, 5);
  g.ball(0.016, -0.0075, 0.185, 0.0, MAIL);
}

/** Pavillon de jouteur : toile rayée en pans alternés, toit conique festonné, porte ouverte, fanion au faîte */
function pavilion(f: Fr, kit: ArenaKit, x: number, z: number, r: number, h: number, c1: number, c2: number) {
  const n = 10, dth = (2 * PI) / n, rr = r * 1.12, hr = h * 0.9;
  for (let k = 0; k < n; k++) {
    const ts = k * dth, tm = ts + dth / 2, a = k % 2 ? c1 : c2, b = k % 2 ? c2 : c1;
    f.add(new THREE.CylinderGeometry(r, r, h, 1, 1, true, ts, dth).translate(0, h / 2, 0), x, 0, z, a);
    f.add(new THREE.ConeGeometry(rr, hr, 1, 1, true, ts, dth).translate(0, hr / 2, 0), x, h, z, b);
    f.sub(x + Math.sin(tm) * rr, z + Math.cos(tm) * rr, tm).add(new THREE.ConeGeometry(rr * 0.3, 0.04, 3).rotateX(PI).scale(1, 1, 0.3), 0, h - 0.02, 0, a);
  }
  f.box(r * 0.5, h * 0.8, 0.01, x, 0, z + r * 0.97, 0x3a2a20);
  f.box(r * 0.3, h * 0.8, 0.008, x + r * 0.32, 0, z + r * 0.99, c1, false, 0.2);
  f.cyl(0.005, 0.005, 0.1, 4, x, h + hr - 0.01, z, 0x6a4a30);
  flag(f, kit, x, h + hr + 0.09, z, 0.08, 0.04, c1, c2);
}

function lists(f: Fr, kit: ArenaKit) {
  const WOOD = 0x8a6040, DWOOD = 0x6a4a30, STONE = 0xb8b0a0, SAND = 0xd2b886, BLUE = 0x2a4a9a, RED = 0xb8302a, CREAM = 0xf2ead2, GREEN = 0x3a7a4a, YEL = 0xf2c23a;
  f.p.box(2.92, 0.012, 2.92, 0, 0, 0, 0x8fc47e);
  f.box(2.12, 0.004, 1.02, 0, 0, -0.08, SAND);
  for (const s of [-1, 1]) f.box(1.7, 0.003, 0.05, 0, 0.003, -0.08 + s * 0.13, dk(SAND, 0.9));

  // la lice : barrière tendue de toile rouge et blanche, poteaux, main courante
  for (let i = 0; i < 10; i++) f.box(0.17, 0.09, 0.014, -0.765 + i * 0.17, 0.025, -0.08, i % 2 ? CREAM : RED);
  f.box(1.74, 0.016, 0.026, 0, 0.115, -0.08, DWOOD);
  for (let i = 0; i <= 5; i++) f.box(0.024, 0.13, 0.024, -0.85 + i * 0.34, 0, -0.08, DWOOD);
  // les deux jouteurs
  knight(f, -0.38, 0.06, PI / 2, { coat: 0xf0ece4, c1: BLUE, c2: YEL });
  knight(f, 0.38, -0.22, -PI / 2, { coat: 0x5a3a28, c1: RED, c2: CREAM });

  const shirts = [RED, BLUE, GREEN, CREAM, 0x8a5a9a, YEL, 0x7a5a3a, 0xc8783a], heads = [...SKIN, ...HAIR, 0x8a3a3a, 0x3a5a8a];
  // la grande tribune couverte au fond : trois gradins, tentures et écus, toile rayée, loge du roi sous un pavillon
  {
    const g = f.sub(0, -1.03, 0);
    g.box(1.84, 0.08, 0.74, 0, 0, 0, WOOD); g.box(1.84, 0.08, 0.5, 0, 0.08, -0.12, dk(WOOD, 0.92)); g.box(1.84, 0.08, 0.26, 0, 0.16, -0.24, WOOD);
    for (let i = 0; i < 8; i++) {
      const x = -0.805 + i * 0.23;
      g.box(0.23, 0.07, 0.006, x, 0.005, 0.373, i % 2 ? BLUE : RED);
      g.box(0.045, 0.05, 0.008, x, 0.015, 0.378, i % 2 ? YEL : CREAM); g.box(0.012, 0.05, 0.009, x, 0.015, 0.379, i % 2 ? RED : BLUE);
    }
    for (const x of [-0.9, -0.45, -0.2, 0.2, 0.45, 0.9]) g.box(0.024, 0.5, 0.024, x, 0, 0.36, Math.abs(x) < 0.3 ? GOLD : DWOOD);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) g.box(0.024, 0.62, 0.024, x, 0, -0.36, DWOOD);
    const tilt = Math.atan2(0.12, 0.76);
    for (let i = 0; i < 10; i++) g.add(new THREE.BoxGeometry(0.184, 0.008, 0.78).rotateX(tilt), -0.828 + i * 0.184, 0.56, 0, i % 2 ? CREAM : i % 4 === 0 ? RED : BLUE);
    for (let i = 0; i < 12; i++) g.add(new THREE.ConeGeometry(0.035, 0.05, 3).rotateX(PI), -0.84 + i * 0.153, 0.475, 0.39, i % 2 ? CREAM : RED);
    g.box(0.58, 0.03, 0.5, 0, 0.585, 0.02, YEL);
    g.p.pyramid(0.56, 0.2, 0.48, g.X(0, 0.02), g.base + 0.615, g.Z(0, 0.02), BLUE, g.ry);
    g.ball(0.018, 0, 0.83, 0.02, GOLD);
    g.cyl(0.004, 0.004, 0.1, 4, 0, 0.82, 0.02, DWOOD);
    flag(f, kit, g.X(0, 0.02), 0.92, g.Z(0, 0.02), 0.12, 0.06, BLUE, YEL);
    for (const s of [-1, 1]) {
      g.box(0.09, 0.19, 0.006, s * 0.31, 0.3, 0.395, BLUE); g.box(0.03, 0.03, 0.008, s * 0.31, 0.4, 0.396, YEL);
      g.add(new THREE.ConeGeometry(0.045, 0.04, 3).rotateX(PI).scale(1, 1, 0.15), s * 0.31, 0.28, 0.395, BLUE);
    }
    g.box(0.3, 0.004, 0.2, 0, 0.08, 0.25, RED);
    person(g, -0.07, 0.25, 0, 0x2a3a8a, { y: 0.082, hat: 'cap', hatColor: GOLD, arms: 'one', legs: 0x2a3a8a });
    person(g, 0.07, 0.25, 0, 0xa83a6a, { y: 0.082, hat: 'cone', hatColor: 0xf2c0d8, legs: 0xa83a6a, hair: 0xd8b060 });
    lineRow(g, kit, -0.86, -0.24, 0.08, 0.25, 6, shirts, heads, 11);
    lineRow(g, kit, 0.24, 0.86, 0.08, 0.25, 6, shirts, heads, 12);
    lineRow(g, kit, -0.86, 0.86, 0.16, 0.01, 13, shirts, heads, 13);
    lineRow(g, kit, -0.86, 0.86, 0.24, -0.23, 12, shirts, heads, 14);
  }
  // les deux tribunes de côté, plus petites, aux couleurs des deux camps
  for (const s of [-1, 1]) {
    const g = f.sub(s * 1.25, -0.1, -s * PI / 2), c = s > 0 ? GREEN : RED;
    g.box(0.8, 0.07, 0.36, 0, 0, 0, WOOD); g.box(0.8, 0.07, 0.18, 0, 0.07, -0.09, dk(WOOD, 0.92));
    g.box(0.8, 0.06, 0.006, 0, 0.005, 0.182, c);
    for (const x of [-0.39, 0.39]) { g.box(0.02, 0.42, 0.02, x, 0, 0.17, DWOOD); g.box(0.02, 0.5, 0.02, x, 0, -0.17, DWOOD); }
    const tl = Math.atan2(0.08, 0.36);
    for (let i = 0; i < 4; i++) g.add(new THREE.BoxGeometry(0.2, 0.008, 0.4).rotateX(tl), -0.3 + i * 0.2, 0.46, 0, i % 2 ? CREAM : c);
    for (let i = 0; i < 6; i++) g.add(new THREE.ConeGeometry(0.03, 0.045, 3).rotateX(PI), -0.34 + i * 0.136, 0.4, 0.2, i % 2 ? CREAM : c);
    lineRow(g, kit, -0.32, 0.32, 0.07, 0.09, 6, shirts, heads, 20 + s);
    lineRow(g, kit, -0.32, 0.32, 0.14, -0.09, 6, shirts, heads, 30 + s);
  }

  // l'entrée : deux tours de pierre à toit d'ardoise, poutre à l'écu, palissade de bois de part et d'autre
  for (const s of [-1, 1]) {
    const x = s * 0.24, z = 0.55;
    f.cyl(0.085, 0.095, 0.42, 8, x, 0, z, STONE); f.cyl(0.1, 0.1, 0.04, 8, x, 0.42, z, dk(STONE, 0.88));
    for (let k = 0; k < 4; k++) { const t = k * PI / 2 + PI / 4; f.box(0.035, 0.04, 0.035, x + Math.sin(t) * 0.085, 0.46, z + Math.cos(t) * 0.085, STONE); }
    f.box(0.03, 0.06, 0.012, x, 0.22, z + 0.093, 0x2a2420);
    f.cone(0.11, 0.18, 8, x, 0.46, z, 0x4a5a7a);
    f.cyl(0.004, 0.004, 0.1, 4, x, 0.64, z, DWOOD);
    flag(f, kit, x, 0.74, z, 0.09, 0.05, s > 0 ? RED : BLUE, YEL);
    const x0 = s * 0.34, x1 = s * 1.06;
    f.box(0.72, 0.02, 0.016, (x0 + x1) / 2, 0.06, 0.5, WOOD); f.box(0.72, 0.02, 0.016, (x0 + x1) / 2, 0.14, 0.5, WOOD);
    for (let i = 0; i < 5; i++) f.box(0.026, 0.2, 0.026, x0 + ((x1 - x0) * i) / 4, 0, 0.5, DWOOD);
    torch(f, s * 1.0, 0.56, 0.3, DWOOD); torch(f, s * 0.38, 0.66, 0.26, DWOOD);
    bunting(f, [x, 0.44, z], [s * 1.06, 0.3, 1.06], 6, 0.05, [RED, CREAM, BLUE, YEL]);
  }
  f.box(0.4, 0.05, 0.05, 0, 0.32, 0.55, DWOOD);
  f.box(0.08, 0.09, 0.012, 0, 0.23, 0.58, BLUE); f.box(0.08, 0.02, 0.013, 0, 0.27, 0.581, YEL); f.box(0.02, 0.09, 0.013, 0, 0.23, 0.581, YEL);

  // les pavillons des jouteurs, leurs écus pendus à un poteau, le râtelier de lances ; héraut et écuyer
  pavilion(f, kit, -1.08, 1.06, 0.2, 0.16, BLUE, YEL);
  pavilion(f, kit, 1.08, 1.06, 0.2, 0.16, RED, CREAM);
  for (const s of [-1, 1]) {
    const x = s * 0.74, z = 1.1;
    f.box(0.02, 0.2, 0.02, x, 0, z, DWOOD);
    f.box(0.06, 0.07, 0.01, x, 0.11, z + 0.014, s < 0 ? BLUE : RED); f.box(0.06, 0.018, 0.011, x, 0.15, z + 0.015, s < 0 ? YEL : CREAM);
    for (let k = 0; k < 3; k++) f.tube([x + s * 0.08 + k * 0.025, 0, z - 0.08], [x + s * 0.08 + k * 0.025 + 0.01, 0.42, z - 0.12], 0.005, k % 2 ? CREAM : s < 0 ? BLUE : RED, false, 4);
    f.box(0.12, 0.02, 0.02, x + s * 0.105, 0.2, z - 0.1, DWOOD);
  }
  person(f, -0.7, 0.3, 0.2, BLUE, { hat: 'cap', hatColor: YEL, arms: 'one', legs: YEL });
  f.tube([-0.66, 0.21, 0.3], [-0.64, 0.25, 0.38], 0.005, GOLD, false, 4);
  f.box(0.05, 0.05, 0.004, -0.645, 0.18, 0.36, BLUE);
  person(f, 0.62, 0.3, -0.4, 0x7a5a3a, { hat: 'cone', hatColor: GREEN });
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* INDUSTRIEL : LA SALLE DES COMBATS                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */
function fightHall(f: Fr, kit: ArenaKit) {
  const BRICK = 0xa5523a, DBRICK = 0x7e3a2a, STONE = 0xc8bca8, IRONG = 0x2f4a3c, GLASS = 0x9ec8d8, WOOD = 0x8a6040, WIN = 0xf0d890;
  const X = 1.3, Z0 = -1.25, Z1 = 0.85, zc = (Z0 + Z1) / 2, D = Z1 - Z0, HW = 0.44, T = 0.05, R = X - 0.02, ky = 0.42;
  f.p.box(2.92, 0.012, 2.92, 0, 0, 0, 0x9a948a);
  f.box(2 * X - 0.1, 0.006, D - 0.1, 0, 0, zc, 0x8a6e52);

  // les murs de briques : pilastres, soubassement de pierre, corniche, fenêtres cintrées éclairées
  for (const s of [-1, 1]) f.box(T, HW, D, s * (X - T / 2), 0, zc, BRICK);
  f.box(2 * X, HW, T, 0, 0, Z0 + T / 2, BRICK);
  for (const s of [-1, 1]) f.box(X - 0.17, HW, T, (s * (X + 0.17)) / 2, 0, Z1 - T / 2, BRICK);
  f.box(0.34, HW - 0.3, T, 0, 0.3, Z1 - T / 2, BRICK);
  for (const s of [-1, 1]) { f.box(T + 0.02, 0.05, D + 0.02, s * (X - T / 2), 0, zc, STONE); f.box(T + 0.03, 0.03, D + 0.03, s * (X - T / 2), HW - 0.03, zc, DBRICK); }
  f.box(2 * X + 0.02, 0.05, T + 0.02, 0, 0, Z0 + T / 2, STONE);
  for (const zz of [Z0 + T / 2, Z1 - T / 2]) f.box(2 * X + 0.03, 0.03, T + 0.03, 0, HW - 0.03, zz, DBRICK);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) f.box(0.02, HW, 0.05, s * (X + 0.008), 0, Z0 + 0.1 + i * 0.27, DBRICK);
    for (let i = 0; i < 7; i++) arch(f.sub(s * (X + 0.003), Z0 + 0.235 + i * 0.27, (s * PI) / 2), 0.1, 0.15, 0, 0.12, 0, WIN, true);
    for (const x of [0.3, 0.78, 1.26]) f.box(0.05, HW, 0.02, s * x, 0, Z1 + 0.008, DBRICK);
    for (const x of [0.55, 1.02]) arch(f, 0.13, 0.15, s * x, 0.12, Z1 + 0.003, WIN, true);
  }

  // la voûte de fonte : arcs, tirants, pannes ; verrière sur les reins, faîte ouvert au-dessus du ring
  for (const z of [-1.22, -0.8, -0.4, 0, 0.4, 0.82]) {
    f.add(new THREE.TorusGeometry(R, 0.014, 3, 12, PI).scale(1, ky, 1), 0, HW, z, IRONG);
    f.box(2 * R, 0.012, 0.012, 0, HW - 0.006, z, IRONG);
  }
  f.add(new THREE.CylinderGeometry(R, R, D - 0.06, 2, 1, true, PI / 2, 0.62).rotateX(PI / 2).scale(1, ky, 1), 0, HW, zc, GLASS, true);
  f.add(new THREE.CylinderGeometry(R, R, D - 0.06, 2, 1, true, (3 * PI) / 2 - 0.62, 0.62).rotateX(PI / 2).scale(1, ky, 1), 0, HW, zc, GLASS, true);
  for (const ph of [0.31, 0.62, 0.95, 1.27]) for (const s of [-1, 1]) f.box(0.016, 0.016, D - 0.04, s * R * Math.cos(ph), HW + ky * R * Math.sin(ph) - 0.008, zc, IRONG);
  f.box(0.02, 0.02, D - 0.04, 0, HW + ky * R - 0.01, zc, IRONG);
  // le pignon : grande lunette vitrée à rayons de fonte devant, briques derrière
  f.add(new THREE.CircleGeometry(R, 12, 0, PI).scale(1, ky, 1), 0, HW, Z1 - 0.01, GLASS, true);
  for (let k = 1; k < 6; k++) {
    const ph = (k * PI) / 6, rl = 1 / Math.hypot(Math.cos(ph) / R, Math.sin(ph) / (ky * R));
    f.box(0.014, rl, 0.014, 0, HW, Z1 - 0.004, IRONG, false, ph - PI / 2);
  }
  f.add(new THREE.TorusGeometry(R * 0.55, 0.01, 3, 8, PI).scale(1, ky, 1), 0, HW, Z1 - 0.004, IRONG);
  f.add(new THREE.CircleGeometry(R, 12, 0, PI).scale(1, ky, 1).rotateY(PI), 0, HW, Z0 + 0.005, BRICK);
  f.add(new THREE.CircleGeometry(R, 12, 0, PI).scale(1, ky, 1), 0, HW, Z0 + 0.05, DBRICK);

  // le ring à poings nus : estrade, toile, poteaux, deux cordes, coins rouge et bleu ; deux lutteurs et l'arbitre
  const rz = -0.22;
  f.box(0.62, 0.07, 0.62, 0, 0, rz, 0x4a3828);
  f.box(0.58, 0.006, 0.58, 0, 0.07, rz, 0xe0d2ae);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(0.012, 0.014, 0.17, 6, sx * 0.28, 0.07, rz + sz * 0.28, IRON);
  for (const y of [0.14, 0.2]) for (const s of [-1, 1]) { f.box(0.56, 0.006, 0.006, 0, y, rz + s * 0.28, 0xd8c8a0); f.box(0.006, 0.006, 0.56, s * 0.28, y, rz, 0xd8c8a0); }
  f.box(0.03, 0.04, 0.03, -0.28, 0.17, rz - 0.28, 0xc8302a); f.box(0.03, 0.04, 0.03, 0.28, 0.17, rz + 0.28, 0x2a4a9a);
  for (const s of [-1, 1]) { f.box(0.05, 0.04, 0.05, s * 0.36, 0, rz + s * 0.36, WOOD); f.cyl(0.02, 0.016, 0.04, 6, s * 0.4, 0, rz + s * 0.3, 0x8a929a); }
  const brawler: FighterO = { skin: 0xe8b894, shorts: 0xf2ead2, legs: 0x2a2a3a, glove: 0xe8b894, hair: 0x3a2618, boots: 0x2a2018 };
  fighter(f, kit, -0.065, 0.076, rz + 0.012, PI / 2, brawler, 0);
  fighter(f, kit, 0.065, 0.076, rz - 0.012, -PI / 2, { ...brawler, skin: 0xc89870, shorts: 0xc8302a, legs: 0x4a3a2a, glove: 0xc89870, hair: 0x1a1a1e }, 1);
  person(f, 0.04, rz - 0.17, 0.3, 0xf4f2ee, { y: 0.076, legs: 0x2a2a30, hair: 0x6a6a6a });
  f.box(0.02, 0.01, 0.01, 0.034, 0.21, rz - 0.15, 0x1a1a1e);
  // les lampes à gaz au-dessus du ring, pendues à une croix de fonte
  f.box(0.5, 0.012, 0.012, 0, 0.82, rz, IRONG); f.box(0.012, 0.012, 0.5, 0, 0.82, rz, IRONG);
  for (const s of [-1, 1]) f.tube([s * 0.25, 0.825, rz], [s * 0.3, 0.96, rz], 0.003, IRON, false, 3);
  for (const [lx, lz] of [[-0.22, 0], [0.22, 0], [0, -0.22], [0, 0.22]]) {
    f.tube([lx, 0.82, rz + lz], [lx, 0.6, rz + lz], 0.0025, IRON, false, 3);
    f.cone(0.04, 0.03, 6, lx, 0.59, rz + lz, IRONG);
    f.ball(0.018, lx, 0.575, rz + lz, 0xfff0c0, true);
  }

  // les gradins de bois sur trois côtés, pleins de parieurs en chapeau melon
  const shirts = [0x3a3a48, 0x5a4a3a, 0x7a3a2a, 0x2a3a5a, 0xd8d0c0, 0x4a5a3a, 0x6a6a72], heads = [0x2a2a2e, 0x2a2a2e, 0x3a2a20, 0x5a4a3a, ...SKIN];
  const stand = (g: Fr, w: number, n: number, seed: number) => {
    g.box(w, 0.06, 0.6, 0, 0, 0, WOOD); g.box(w, 0.06, 0.4, 0, 0.06, -0.1, dk(WOOD, 0.88)); g.box(w, 0.06, 0.2, 0, 0.12, -0.2, WOOD);
    lineRow(g, kit, -w / 2 + 0.06, w / 2 - 0.06, 0.06, 0.2, n, shirts, heads, seed, 0.12);
    lineRow(g, kit, -w / 2 + 0.06, w / 2 - 0.06, 0.12, 0.0, n, shirts, heads, seed + 1, 0.15);
    lineRow(g, kit, -w / 2 + 0.06, w / 2 - 0.06, 0.18, -0.2, n, shirts, heads, seed + 2, 0.2);
  };
  for (const s of [-1, 1]) stand(f.sub(s * 0.88, rz - 0.05, (-s * PI) / 2), 0.9, 7, 50 + s * 5);
  stand(f.sub(0, -0.9, 0), 1.0, 8, 70);
  // au fond de la salle, devant : le comptoir du bookmaker et son tableau, deux parieurs debout
  f.box(0.4, 0.1, 0.1, -0.85, 0, 0.62, WOOD); f.box(0.42, 0.012, 0.12, -0.85, 0.1, 0.62, dk(WOOD, 0.7));
  f.box(0.3, 0.16, 0.012, -0.85, 0.16, 0.77, 0x2a3a30); for (let k = 0; k < 4; k++) f.box(0.2, 0.008, 0.004, -0.85, 0.2 + k * 0.03, 0.777, 0xe8e4d8);
  person(f, -0.8, 0.5, PI, 0x3a3a48, { hat: 'top' });
  person(f, 0.3, 0.42, PI + 0.3, 0x5a4a3a, { hat: 'cap', hatColor: 0x4a3a2a, arms: 'up' });

  // la façade : marquise de fonte et de verre, enseigne à ampoules, affiches des combats
  f.box(0.56, 0.014, 0.2, 0, 0.3, Z1 + 0.1, IRONG); f.box(0.52, 0.006, 0.18, 0, 0.314, Z1 + 0.1, GLASS);
  for (const s of [-1, 1]) f.cyl(0.008, 0.01, 0.3, 6, s * 0.25, 0, Z1 + 0.19, IRONG);
  f.box(0.62, 0.1, 0.02, 0, 0.33, Z1 + 0.012, 0x2a2a30);
  for (const y of [0.325, 0.425]) f.box(0.64, 0.012, 0.024, 0, y, Z1 + 0.012, GOLD);
  for (let k = 0; k < 7; k++) { const lh = 0.04 + 0.025 * H(k, 11); f.box(0.03, lh, 0.01, -0.21 + k * 0.07, 0.355, Z1 + 0.025, GOLD); }
  for (let k = 0; k < 10; k++) f.box(0.014, 0.014, 0.01, -0.29 + k * 0.0645, 0.34, Z1 + 0.026, 0xffe2a0, true);
  const poster = (x: number, bg: number) => {
    f.box(0.1, 0.14, 0.006, x, 0.06, Z1 + 0.003, 0xf0e4c8);
    f.box(0.08, 0.06, 0.004, x, 0.12, Z1 + 0.006, bg);
    f.box(0.018, 0.045, 0.004, x - 0.02, 0.075, Z1 + 0.007, 0x2a2a2e); f.box(0.018, 0.045, 0.004, x + 0.02, 0.075, Z1 + 0.007, 0x2a2a2e);
  };
  poster(-0.4, 0xc8302a); poster(0.4, 0x2a4a9a); poster(-0.89, 0xe8a83a); poster(0.89, 0xc8302a);
  // le parvis : colonne d'affiches, réverbères, la file des spectateurs
  {
    const x = -1.0, z = 1.18;
    f.cyl(0.08, 0.08, 0.3, 8, x, 0, z, 0x2a4a3a); f.cyl(0.09, 0.09, 0.02, 8, x, 0.3, z, 0x2a4a3a); f.cone(0.08, 0.06, 8, x, 0.32, z, 0x2a4a3a);
    for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2 + 0.4; f.box(0.07, 0.11, 0.006, x + Math.sin(t) * 0.082, 0.1, z + Math.cos(t) * 0.082, [0xe8d8b0, 0xc8302a, 0xf2c23a, 0x2a4a9a][k]); }
  }
  for (const s of [-1, 1]) {
    const x = s * 0.62, z = 1.12;
    f.cyl(0.008, 0.016, 0.46, 6, x, 0, z, 0x2a3a30);
    f.box(0.036, 0.05, 0.036, x, 0.46, z, 0xfff0c0, true); f.cone(0.034, 0.03, 4, x, 0.51, z, 0x2a3a30); f.box(0.046, 0.008, 0.046, x, 0.454, z, 0x2a3a30);
  }
  person(f, -0.22, 1.22, PI, 0x3a3a48, { hat: 'top' });
  person(f, 0.12, 1.3, PI + 0.2, 0x6a3a2a, { hat: 'cap', hatColor: 0x3a3a3a });
  person(f, 0.98, 1.2, -0.6, 0x2a3a5a, { hat: 'top', arms: 'one' });
  // la cheminée de la chaudière, contre le mur du fond
  f.box(0.13, 1.3, 0.13, 0.95, 0, Z0 - 0.07, BRICK);
  f.box(0.17, 0.05, 0.17, 0.95, 1.3, Z0 - 0.07, DBRICK);
  f.box(0.15, 0.03, 0.15, 0.95, 0.9, Z0 - 0.07, DBRICK);
  { const w = f.w(0.95, 1.38, Z0 - 0.07); kit.smoke(w[0], w[1], w[2], 2); }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* MODERNE : LE PALAIS DE LA BOXE                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */
function boxingPalace(f: Fr, kit: ArenaKit) {
  const N = 32, A = 1.36, o = new Oval(f, -0.12, 0.8, N), cz = o.cz, dt = (2 * PI) / N;
  const WHITE = 0xf2f2ee, GREY = 0xb8bcc0, GLASS = 0x8ab8d0, RED = 0xd8352e, BLUE = 0x2a5ab8, YEL = 0xf2c23a;
  f.p.box(2.92, 0.012, 2.92, 0, 0, 0, 0x9ccf8a);
  const fz = o.z(A, 0);
  f.box(2.2, 0.004, 0.5, 0, 0, fz + 0.24, 0xd8d4cc);
  for (const s of [-1, 1]) f.box(0.012, 0.005, 0.5, s * 0.36, 0, fz + 0.24, RED);

  // la façade : socle, bandeau vitré éclairé à ailettes blanches, bardage blanc à liseré rouge, toit en anneau
  o.band(A, 0.06, 0, 0x8a9096);
  o.band(A - 0.012, 0.15, 0.06, GLASS, true);
  o.band(A, 0.2, 0.21, WHITE);
  o.band(A + 0.004, 0.02, 0.3, RED);
  o.band(A + 0.03, 0.05, 0.41, 0xe4e4e0);
  o.flat(0.98, A + 0.03, 0.46, 0xd8dad6);
  o.band(0.98, 0.05, 0.41, GREY, false, true);
  for (let j = 1; j < N - 1; j += 2) { const t = o.t0 + j * dt; f.sub(o.x(A + 0.004, t), o.z(A + 0.004, t), o.ry(t)).box(0.02, 0.15, 0.02, 0, 0.06, 0, WHITE); }
  for (let k = 0; k < 16; k++) { const t = ((k + 0.5) * PI) / 8; f.sub(o.x(1.18, t), o.z(1.18, t), o.ry(t)).box(0.024, 0.03, 0.4, 0, 0.46, 0, GREY); }
  // projecteurs au bord du toit, tournés vers le ring
  for (let k = 0; k < 8; k++) {
    const t = ((k + 0.5) * PI) / 4, g = f.sub(o.x(0.99, t), o.z(0.99, t), o.ry(t) + PI);
    g.box(0.05, 0.04, 0.05, 0, 0.37, 0, 0x3a3a42); g.box(0.04, 0.03, 0.01, 0, 0.375, 0.027, 0xfff4d0, 'neon');
  }

  // les gradins : trois anneaux de couleur en huit travées, la barrière, le parquet sombre
  const tiers: [number, number, number, number, number][] = [[0.58, 0.04, 0.8, 0.16, RED], [0.8, 0.16, 1.04, 0.3, BLUE], [1.04, 0.3, 1.3, 0.44, YEL]];
  for (let s = 0; s < 8; s++) for (const [r0, y0, r1, y1, c] of tiers) o.slope(r0, y0, r1, y1, s % 2 ? dk(c, 0.86) : c, false, (s * PI) / 4, PI / 4, 4);
  o.band(0.58, 0.04, 0, GREY, false, true);
  o.flat(0, 0.58, 0.003, 0x2a2a32);

  // le ring : estrade, toile bleue, poteaux, trois cordes rouge, blanche et bleue, coins ; deux boxeurs, l'arbitre, les juges
  f.box(0.5, 0.06, 0.5, 0, 0, cz, 0x1a1a22);
  f.box(0.48, 0.006, 0.48, 0, 0.06, cz, 0x3a6ab8);
  f.add(new THREE.CircleGeometry(0.07, 10).rotateX(-PI / 2), 0, 0.067, cz, WHITE);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(0.012, 0.012, 0.16, 6, sx * 0.235, 0.06, cz + sz * 0.235, sx * sz < 0 ? WHITE : sx < 0 ? RED : BLUE);
  [RED, WHITE, BLUE].forEach((c, i) => {
    const y = 0.17 - i * 0.04;
    for (const s of [-1, 1]) { f.box(0.47, 0.006, 0.006, 0, y, cz + s * 0.235, c); f.box(0.006, 0.006, 0.47, s * 0.235, y, cz, c); }
  });
  f.box(0.03, 0.1, 0.03, -0.235, 0.08, cz - 0.235, RED); f.box(0.03, 0.1, 0.03, 0.235, 0.08, cz + 0.235, BLUE);
  fighter(f, kit, -0.06, 0.066, cz + 0.012, PI / 2, { skin: 0xc89870, shorts: RED, glove: RED, hair: 0x1a1a1e, boots: 0xf4f4f0 }, 0);
  fighter(f, kit, 0.06, 0.066, cz - 0.012, -PI / 2, { skin: 0xf0c8a4, shorts: BLUE, glove: BLUE, hair: 0xd8b060, boots: 0x2a2a30 }, 1);
  person(f, 0.03, cz - 0.15, 0.2, 0xf4f4f0, { y: 0.066, legs: 0x2a2a30 });
  f.box(0.36, 0.05, 0.05, 0, 0, cz + 0.33, WHITE);
  for (let k = 0; k < 3; k++) fan(f, kit, -0.12 + k * 0.12, 0.02, cz + 0.38, PI, 0x2a2a30, SKIN[k], 0);

  // la foule : trois rangs pleins autour du ring
  const shirts = [RED, BLUE, YEL, WHITE, 0x2a2a30, 0x4fa860, 0xe87a3c, 0x8a3a8a], heads = [...SKIN, ...HAIR];
  ringRow(o, kit, 0.64, 0.073, 24, -PI, PI, shirts, heads, 41, 0.12);
  ringRow(o, kit, 0.74, 0.127, 26, -PI, PI, shirts, heads, 42, 0.18);
  ringRow(o, kit, 0.88, 0.207, 28, -PI, PI, shirts, heads, 43, 0.25);
  ringRow(o, kit, 0.96, 0.253, 30, -PI, PI, shirts, heads, 44, 0.3);

  // l'entrée : portes vitrées éclairées, marquise, écran géant au-dessus, enseigne au néon (deux gants) sur le toit
  f.box(0.44, 0.17, 0.012, 0, 0, fz + 0.004, 0xd8f0ff, true);
  f.box(0.7, 0.02, 0.26, 0, 0.19, fz + 0.12, WHITE);
  f.box(0.7, 0.01, 0.012, 0, 0.19, fz + 0.25, RED, 'neon');
  for (const s of [-1, 1]) f.cyl(0.008, 0.008, 0.19, 6, s * 0.32, 0, fz + 0.23, GREY);
  f.box(0.6, 0.26, 0.04, 0, 0.22, fz + 0.02, 0x1a1a22);
  f.box(0.54, 0.2, 0.01, 0, 0.25, fz + 0.042, 0x1a2a5a, 'neon');
  for (const [s, c] of [[-1, RED], [1, 0x4ae8ff]] as [number, number][]) {
    f.box(0.05, 0.1, 0.006, s * 0.09, 0.27, fz + 0.048, c, 'neon');
    f.box(0.034, 0.034, 0.006, s * 0.09, 0.375, fz + 0.048, c, 'neon');
    f.box(0.03, 0.03, 0.006, s * 0.045, 0.34, fz + 0.048, c, 'neon');
  }
  f.box(0.4, 0.02, 0.006, 0, 0.42, fz + 0.048, YEL, 'neon');
  f.box(0.56, 0.012, 0.03, 0, 0.47, fz - 0.03, GREY);
  for (const s of [-1, 1]) {
    f.ball(0.042, s * 0.055, 0.54, fz - 0.03, RED, 'neon', 1, 1.1, 0.8);
    f.box(0.05, 0.03, 0.04, s * 0.055, 0.48, fz - 0.03, WHITE, 'neon');
    for (let k = 0; k < 3; k++) f.box(0.03, 0.05 + 0.02 * H(k, s + 3), 0.012, s * (0.14 + k * 0.05), 0.48, fz - 0.03, NEONS[(k + (s > 0 ? 1 : 3)) % 5], 'neon');
  }

  // le parvis : affiches sur panneaux, réverbères, drapeaux, projecteurs qui balaient le ciel, la file d'attente
  for (const s of [-1, 1]) {
    const g = f.sub(s * 0.66, fz + 0.3, -s * 0.2);
    for (const x of [-0.06, 0.06]) g.box(0.012, 0.1, 0.012, x, 0, 0, GREY);
    g.box(0.16, 0.22, 0.012, 0, 0.1, 0, s < 0 ? RED : BLUE);
    g.box(0.04, 0.09, 0.004, -0.025, 0.14, 0.008, 0x1a1a22); g.box(0.04, 0.09, 0.004, 0.025, 0.14, 0.008, 0xf4f4f0);
    g.box(0.12, 0.025, 0.004, 0, 0.27, 0.008, YEL);
    f.cyl(0.006, 0.01, 0.42, 6, s * 0.98, 0, fz + 0.1, 0x8a929a);
    f.box(0.05, 0.012, 0.03, s * 0.98, 0.42, fz + 0.12, 0xd8dce0); f.box(0.04, 0.006, 0.022, s * 0.98, 0.416, fz + 0.12, 0xfff4d0, true);
    f.cyl(0.005, 0.006, 0.6, 5, s * 1.32, 0, fz + 0.36, 0xd8d8d0);
    flag(f, kit, s * 1.32, 0.6, fz + 0.36, 0.1, 0.06, s < 0 ? RED : BLUE, WHITE);
    const g2 = f.sub(s * 1.18, fz + 0.04, 0), sw = kit.sway(g2.w(0, 0.12, 0), [0, 0, 1], 0.35, 0.22 + 0.04 * s);
    g2.cyl(0.03, 0.04, 0.03, 8, 0, 0, 0, 0x3a3a42); g2.box(0.06, 0.06, 0.06, 0, 0.03, 0, 0x8a929a);
    sw.add(new THREE.CylinderGeometry(0.022, 0.006, 0.6, 5).translate(0, 0.4, 0), 0, 0, 0, 0xfff4c0, 0, 'neon');
    sw.add(new THREE.CylinderGeometry(0.03, 0.04, 0.09, 8).translate(0, 0.045, 0), 0, 0, 0, 0x4a525a);
  }
  person(f, -0.24, fz + 0.3, PI, RED, { hat: 'cap', hatColor: RED });
  person(f, -0.12, fz + 0.38, PI + 0.2, 0x2a2a30, {});
  person(f, 0.3, fz + 0.34, PI - 0.3, BLUE, { arms: 'up' });
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* FUTURISTE : L'ARÈNE DES ROBOTS                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */
/** Robot de combat (face à +z du repère) : jambes d'acier, torse blindé à réacteur, visière lumineuse ; une scie circulaire qui
 * tourne au bras droit, une masse qui frappe au bras gauche */
function robot(f: Fr, kit: ArenaKit, x: number, z: number, ry: number, c1: number, c2: number, eye: number, seed: number) {
  const g = f.sub(x, z, ry), r = f.ry + ry, fx = Math.sin(r), fz = Math.cos(r), ax: V3 = [Math.cos(r), 0, -Math.sin(r)], DK = 0x2a2e38;
  for (const s of [-1, 1]) {
    g.box(0.05, 0.022, 0.08, s * 0.045, 0.02, 0.01, DK);
    g.box(0.04, 0.07, 0.045, s * 0.045, 0.04, 0, c1);
    g.box(0.034, 0.06, 0.04, s * 0.045, 0.11, -0.005, c2);
    g.ball(0.032, s * 0.09, 0.28, 0, c2);
  }
  g.box(0.11, 0.035, 0.06, 0, 0.165, 0, DK);
  g.box(0.14, 0.1, 0.09, 0, 0.2, 0, c1);
  g.box(0.1, 0.05, 0.01, 0, 0.225, 0.046, c2);
  g.ball(0.018, 0, 0.25, 0.05, eye, 'neon');
  g.box(0.06, 0.045, 0.055, 0, 0.3, 0.005, c2);
  g.box(0.05, 0.012, 0.006, 0, 0.318, 0.034, eye, 'neon');
  g.tube([0.02, 0.345, 0], [0.03, 0.39, -0.01], 0.003, DK, false, 3); g.ball(0.008, 0.03, 0.39, -0.01, eye, 'neon');
  // bras droit : la scie
  g.box(0.03, 0.07, 0.03, -0.1, 0.19, 0, DK);
  g.box(0.032, 0.032, 0.09, -0.1, 0.18, 0.05, c1);
  const hub = g.w(-0.13, 0.196, 0.1), saw = kit.turn(hub, ax, 1.5);
  const qy = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...ax));
  const qz = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...ax));
  saw.add(new THREE.CylinderGeometry(0.058, 0.058, 0.006, 10).applyQuaternion(qy), 0, 0, 0, 0xc8d0d8);
  saw.add(new THREE.TorusGeometry(0.062, 0.006, 3, 10).applyQuaternion(qz), 0, 0, 0, 0xff8a3a, 0, 'neon');
  saw.add(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 6).applyQuaternion(qy), 0, 0, 0, DK);
  // bras gauche : la masse
  const sw = (kit.swing ?? kit.sway)(g.w(0.1, 0.25, 0), ax, 0.4, 0.9 + 0.2 * seed);
  sw.box(0.03, 0.03, 0.12, fx * 0.06, -0.04, fz * 0.06, DK, r);
  sw.box(0.07, 0.05, 0.05, fx * 0.13, -0.062, fz * 0.13, c2, r);
  sw.box(0.072, 0.01, 0.052, fx * 0.13, -0.042, fz * 0.13, eye, r, 'neon');
}

function robotArena(f: Fr, kit: ArenaKit) {
  const N = 32, A = 1.3, o = new Oval(f, -0.08, 0.86, N), cz = o.cz;
  const WHITE = 0xe8ecf8, MET = 0x9aa4b4, DARK = 0x1a2030, CYAN = 0x4ae8ff, PINK = 0xff4aa8, VIO = 0x9a6aff;
  f.p.box(2.92, 0.012, 2.92, 0, 0, 0, 0xaab4c0);
  const fz = o.z(A, 0);
  for (const s of [-1, 1]) f.box(0.014, 0.005, 1.46 - 0.5, s * 0.16, 0, (1.46 + 0.5) / 2 - 0.02, CYAN, 'neon');
  o.flat(0.62, 0.66, 0.002, VIO, 'neon');

  // l'anneau des gradins, porté par six pylônes au-dessus de la fosse : dessous de métal, trois rangs lumineux, bord blanc
  const yB = 0.3, r0 = 0.64;
  f.add(new THREE.CylinderGeometry(A, r0, 0.4, N, 1, true, o.t0).translate(0, 0.2, 0).scale(1, 1, o.ez), 0, yB, cz, MET);
  o.band(r0, 0.03, yB, CYAN, 'neon', true);
  o.slope(r0, 0.33, 0.86, 0.45, WHITE); o.slope(0.86, 0.45, 1.06, 0.56, 0xd0d6e4); o.slope(1.06, 0.56, 1.24, 0.66, WHITE);
  o.band(0.86, 0.015, 0.45, PINK, 'neon', true); o.band(1.06, 0.015, 0.56, CYAN, 'neon', true);
  o.band(1.24, 0.06, 0.66, MET, false, true);
  o.flat(1.24, A + 0.01, 0.72, WHITE);
  o.band(A + 0.01, 0.04, 0.68, WHITE);
  o.band(A + 0.014, 0.012, 0.695, PINK, 'neon');
  for (let k = 0; k < 6; k++) {
    const t = PI / 6 + (k * PI) / 3, x = o.x(0.95, t), z = o.z(0.95, t);
    f.cyl(0.03, 0.05, 0.5, 6, x, 0, z, WHITE);
    f.cyl(0.052, 0.052, 0.012, 6, x, 0.12, z, CYAN, 'neon');
    f.cyl(0.07, 0.08, 0.02, 6, x, 0, z, MET);
  }

  // la fosse hexagonale : sol sombre, bord et rainures lumineux, emblème ; la cage d'énergie et son anneau qui tourne
  f.cyl(0.5, 0.52, 0.02, 6, 0, 0, cz, DARK);
  f.add(new THREE.CylinderGeometry(0.505, 0.525, 0.02, 6, 1, true), 0, 0.01, cz, CYAN, 'neon');
  for (let k = 0; k < 3; k++) f.sub(0, cz, (k * PI) / 3).box(0.86, 0.003, 0.008, 0, 0.02, 0, VIO, 'neon');
  f.add(new THREE.CircleGeometry(0.08, 6).rotateX(-PI / 2), 0, 0.024, cz, PINK, 'neon');
  for (let k = 0; k < 6; k++) { const t = (k * PI) / 3; f.box(0.012, 0.52, 0.012, Math.sin(t) * 0.5, 0.02, cz + Math.cos(t) * 0.5, CYAN, 'neon'); }
  f.add(new THREE.CylinderGeometry(0.505, 0.505, 0.012, 6, 1, true), 0, 0.546, cz, CYAN, 'neon');
  {
    const R = kit.turn(f.w(0, 0.3, cz), [0, 1, 0], 0.2);
    R.add(new THREE.TorusGeometry(0.47, 0.005, 3, 18).rotateX(PI / 2), 0, 0, 0, PINK, 0, 'neon');
    for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; R.box(0.04, 0.012, 0.012, Math.sin(t) * 0.47, -0.006, Math.cos(t) * 0.47, NEONS[k % 5], t, 'neon'); }
  }
  // les deux robots
  robot(f, kit, -0.16, cz + 0.015, PI / 2, 0xd84a2a, 0xe8ecf0, 0xffe24a, 0);
  robot(f, kit, 0.16, cz - 0.015, -PI / 2, 0x2a6ad8, 0x3a3a46, CYAN, 1);

  // l'hologramme au-dessus de la fosse, les drones caméras qui tournent, deux écrans géants au fond
  f.cyl(0.006, 0.006, 0.38, 4, 0, 0.56, cz, CYAN, 'neon');
  {
    const R = kit.turn(f.w(0, 0.98, cz), [0, 1, 0], 0.12);
    R.add(new THREE.TorusGeometry(0.16, 0.004, 3, 16).rotateX(PI / 2), 0, 0, 0, CYAN, 0, 'neon');
    for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2; R.box(0.12, 0.07, 0.006, Math.sin(t) * 0.17, -0.035, Math.cos(t) * 0.17, NEONS[k], t, 'neon'); }
  }
  {
    const R = kit.turn(f.w(0, 0.86, cz), [0, 1, 0], -0.08);
    for (const s of [-1, 1]) {
      const x = s * 0.72;
      R.box(0.06, 0.02, 0.06, x, 0, 0, WHITE);
      R.box(0.02, 0.01, 0.02, x, -0.01, 0, PINK, 0, 'neon');
      for (const [dx, dz] of [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]]) R.box(0.034, 0.004, 0.01, x + dx, 0.02, dz, MET, 0.7);
    }
  }
  for (const s of [-1, 1]) {
    const t = PI + s * 0.62, x = o.x(A - 0.04, t), z = o.z(A - 0.04, t), g = f.sub(x, z, o.ry(t) + PI);
    g.cyl(0.008, 0.012, 0.16, 5, 0, 0.72, 0, MET);
    g.box(0.36, 0.2, 0.02, 0, 0.86, 0, DARK);
    g.box(0.33, 0.17, 0.006, 0, 0.875, 0.012, 0x20204a, 'neon');
    g.box(0.06, 0.1, 0.004, -0.06, 0.9, 0.016, s < 0 ? 0xd84a2a : CYAN, 'neon'); g.box(0.12, 0.02, 0.004, 0.06, 0.96, 0.016, PINK, 'neon'); g.box(0.12, 0.02, 0.004, 0.06, 0.92, 0.016, 0xffe24a, 'neon');
  }

  // la foule aux habits vifs
  const shirts = [...NEONS, WHITE, 0x3a3a46, 0xe87a3c], heads = [...SKIN, ...HAIR, PINK, CYAN];
  ringRow(o, kit, 0.72, 0.374, 22, -PI, PI, shirts, heads, 81, 0.15);
  ringRow(o, kit, 0.8, 0.418, 24, -PI, PI, shirts, heads, 82, 0.2);
  ringRow(o, kit, 0.95, 0.5, 26, -PI, PI, shirts, heads, 83, 0.25);
  ringRow(o, kit, 1.14, 0.604, 26, -PI, PI, shirts, heads, 84, 0.4);

  // l'entrée : ascenseur de verre sous l'anneau, portique lumineux, parvis à rainures ; bornes et visiteurs
  const lz = fz - 0.22;
  f.cyl(0.07, 0.07, 0.56, 8, 0, 0, lz, 0xa8d8e8, true);
  for (const y of [0, 0.27, 0.54]) f.add(new THREE.TorusGeometry(0.074, 0.006, 3, 10).rotateX(PI / 2), 0, y + 0.01, lz, CYAN, 'neon');
  for (const s of [-1, 1]) f.box(0.03, 0.26, 0.03, s * 0.13, 0, fz + 0.1, WHITE);
  f.box(0.3, 0.03, 0.03, 0, 0.26, fz + 0.1, WHITE); f.box(0.24, 0.01, 0.034, 0, 0.255, fz + 0.1, PINK, 'neon');
  for (const s of [-1, 1]) {
    const x = s * 0.9, z = fz + 0.25;
    f.cyl(0.006, 0.01, 0.42, 6, x, 0, z, 0xc8d0d8);
    f.ball(0.025, x, 0.44, z, 0x9aa8ff, 'neon'); f.add(new THREE.TorusGeometry(0.04, 0.003, 4, 14).rotateX(PI / 2), x, 0.44, z, CYAN, 'neon');
    const b = f.sub(s * 0.5, fz + 0.32, 0);
    b.cyl(0.06, 0.07, 0.04, 8, 0, 0, 0, MET); b.cyl(0.05, 0.05, 0.008, 8, 0, 0.04, 0, s < 0 ? PINK : CYAN, 'neon');
    const R = kit.turn(b.w(0, 0.18, 0), [0, 1, 0], 0.25 * s);
    R.box(0.08, 0.08, 0.08, 0, -0.04, 0, s < 0 ? PINK : CYAN, 0.3, 'neon');
  }
  person(f, -0.25, fz + 0.36, PI, CYAN, { hair: PINK });
  person(f, 0.24, fz + 0.3, PI - 0.4, 0x3a3a46, { hair: 0xd8b060, arms: 'up' });
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* L'ENSEMBLE                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */
export function arena(p: Parts, age: number, kit: ArenaKit) {
  const f = new Fr(p, 0, 0, 0, 1), a = Math.min(5, Math.max(1, age));
  if (a === 1) colosseum(f, kit);
  else if (a === 2) lists(f, kit);
  else if (a === 3) fightHall(f, kit);
  else if (a === 4) boxingPalace(f, kit);
  else robotArena(f, kit);
}
