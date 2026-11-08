import * as THREE from 'three';
import { Parts, type Glow } from './parts';
import { hash2 } from '../core/rng';

/**
 * Le cirque (3 × 3, débloqué par l'expédition « Les jongleurs du carrefour ») à chaque âge. Même plan à tous les âges : le grand
 * chapiteau au centre-arrière, son entrée drapée face à +z, la billetterie à droite sur le parvis, les roulottes derrière et à
 * gauche, la ménagerie (enclos à barreaux de l'éléphant, poney) à droite, un funambule tendu entre deux mâts, un jongleur, des
 * affiches, des guirlandes de lampions qui s'allument la nuit. Le style change : toile rapiécée et roulottes de bois (Moyen Âge),
 * grand chapiteau à rayures, orgue de barbarie et lampes à gaz (industriel), néons, caravanes d'aluminium et projecteurs
 * (moderne), dôme lumineux et hologrammes (futuriste). Les aides du moteur de modèles (pièces qui se balancent ou tournent,
 * fumée) arrivent par `CircusKit` pour ne pas importer models.ts
 */
type V3 = [number, number, number];
export interface CircusKit {
  sway: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
  turn: (pivot: V3, axis: V3, speed: number) => Parts;
  smoke: (x: number, y: number, z: number, kind: number) => void;
}

const PI = Math.PI;
const H = (i: number, k: number) => hash2(i, k, 91);
const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const lt = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
const WARM = 0xffd890, GOLD = 0xe8c66a, IRON = 0x3c3c42, SKIN = [0xe8b894, 0xc89870, 0xf0c8a4, 0xa87850];
const LAMPS = [0xffe2a0, 0xff9a6a, 0xffd0e8, 0xfff4d0, 0xa8e8ff];
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

/** Ballon tenu par un fil au-dessus de (x, z) */
function balloon(f: Fr, x: number, y: number, z: number, h: number, color: number, glow: Glow = false) {
  f.tube([x, y, z], [x + 0.01, y + h, z], 0.0015, 0xeeeeee, false, 3);
  f.ball(0.03, x + 0.01, y + h + 0.035, z, color, glow, 1, 1.15, 1);
}

/** Ampoule ou lampion de guirlande, qui s'allume la nuit */
function bulb(f: Fr, x: number, y: number, z: number, c: number, glow: Glow, s = 0.018, round = false) {
  if (round) f.ball(s * 0.7, x, y, z, c, glow, 1, 1.15, 1); else f.box(s, s, s, x, y, z, c, glow);
}

/** Guirlande entre deux points (repère local) : fil qui pend, ampoules régulières */
function garland(f: Fr, a: V3, b: V3, n: number, sag: number, glow: Glow, palette: number[], s = 0.018, round = false, wire = 0x6a5c4c) {
  let prev: V3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    if (prev) f.tube(prev, q, 0.0016, wire, false, 3);
    if (i > 0 && i < n) bulb(f, q[0], q[1] - s * 0.7, q[2], palette[i % palette.length], glow, s, round);
    prev = q;
  }
}

/** Fanions triangulaires sur une ligne qui pend */
function bunting(f: Fr, a: V3, b: V3, n: number, sag: number, palette: number[]) {
  let prev: V3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    if (prev) f.tube(prev, q, 0.0018, 0x6a5c4c, false, 3);
    if (i > 0 && i < n) f.add(new THREE.ConeGeometry(0.02, 0.045, 3).rotateX(PI), q[0], q[1] - 0.036, q[2], palette[i % palette.length]);
    prev = q;
  }
}

/** Mât de fanion : perche, boule, fanion qui flotte */
function pennant(f: Fr, kit: CircusKit, x: number, y: number, z: number, h: number, color: number, w = 0.14, ht = 0.07, pole = 0x6e523c) {
  f.cyl(0.006, 0.009, h, 5, x, y, z, pole);
  f.ball(0.014, x, y + h, z, GOLD);
  const [wx, wy, wz] = f.w(x, y + h - 0.012, z), s = kit.sway([wx, wy, wz], [0, 1, 0], 0.4, 0.9);
  s.box(w, ht, 0.006, w / 2, -ht, 0, color);
  s.box(w, 0.012, 0.008, w / 2, -0.012, 0, GOLD);
  s.box(w * 0.3, ht * 0.6, 0.006, w + w * 0.15, -ht * 0.8, 0, color, 0, false, PI / 4);
}

/* ------------------------------------------------------------------------------------------------------------------ */

interface Style {
  age: number; red: number; cream: number; wood: number; grass: number; sand: number;
  /** chapiteau : nombre de pans, rayon, hauteur du mur, hauteur du premier toit, rayon du faîte, hauteur du pic, centre en z */
  N: number; r: number; hw: number; h1: number; rt: number; h2: number; cz: number;
  /** éclairage : lampions chauds, ou néons de couleur */
  neon: boolean;
}
const STYLE: Record<number, Style> = {
  2: { age: 2, red: 0xb2503c, cream: 0xdccca4, wood: 0x8a6040, grass: 0x8fc47e, sand: 0xc9b480, N: 16, r: 0.74, hw: 0.27, h1: 0.2, rt: 0.24, h2: 0.22, cz: -0.28, neon: false },
  3: { age: 3, red: 0xc8402e, cream: 0xf2e8d0, wood: 0x7a5238, grass: 0x8fc47e, sand: 0xd8bf8a, N: 24, r: 0.8, hw: 0.32, h1: 0.28, rt: 0.28, h2: 0.3, cz: -0.3, neon: false },
  4: { age: 4, red: 0xd8352e, cream: 0xf4f4f0, wood: 0x5a626a, grass: 0x9ccf8a, sand: 0xc4c0b8, N: 24, r: 0.8, hw: 0.34, h1: 0.3, rt: 0.28, h2: 0.34, cz: -0.3, neon: true },
  5: { age: 5, red: 0x7a4ae0, cream: 0xe8ecf8, wood: 0x6a7280, grass: 0xc4d0d8, sand: 0xaab4c0, N: 24, r: 0.8, hw: 0.36, h1: 0.3, rt: 0.26, h2: 0.4, cz: -0.3, neon: true },
};

/** Sol : herbe ou dalle, piste de sciure sous le chapiteau, allée du parvis, confettis */
function ground(f: Fr, st: Style) {
  f.p.box(2.92, 0.012, 2.92, 0, 0, 0, st.grass);
  const old = st.age <= 3;
  f.cyl(1.0, 1.02, 0.006, 32, 0, 0, st.cz, st.sand);
  f.box(0.52, 0.006, 1.0, 0, 0, st.cz + st.r + 0.5, dk(st.sand, 1.04));
  for (let k = 0; k < 14; k++) f.ball(0.05 + 0.04 * H(k, 1), -1.3 + 2.6 * H(k, 2), 0.002, -1.3 + 2.6 * H(k, 3), dk(st.grass, 0.9 + 0.12 * H(k, 4)), false, 1.3, 0.1, 1);
  if (st.age === 5) {
    // dalle d'un lieu futuriste : anneau lumineux autour de la piste et rainures
    for (let k = 0; k < 36; k++) { const a = (k / 36) * PI * 2, r = 1.06; f.box(0.1, 0.006, 0.014, Math.sin(a) * r, 0.006, st.cz + Math.cos(a) * r, 0x4ae8ff, 'neon'); }
  }
  if (st.age === 4) for (const s of [-1, 1]) f.box(0.01, 0.003, 0.9, s * 0.2, 0.006, st.cz + st.r + 0.5, 0xf4f2ee);
  for (let k = 0; k < 40; k++) f.box(0.03, 0.004, 0.02, -1.3 + 2.6 * H(k, 5), 0.006, -1.2 + 2.6 * H(k, 6), [0xd84a3e, 0xf2c23a, 0x3c7fd8, 0xf4f2ee, 0x4fa860][k % 5]);
  void old;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* LE GRAND CHAPITEAU                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */
function bigTop(f: Fr, st: Style, kit: CircusKit) {
  const { N, r, hw, h1, rt, h2, cz } = st, dth = (PI * 2) / N, th0 = -dth, lamp: Glow = st.neon ? 'neon' : true;
  const a = st.red, b = st.cream;
  const topY = hw + h1 + h2;
  for (let k = 0; k < N; k++) {
    const ts = th0 + k * dth, tm = ts + dth / 2, col = k % 2 ? b : a, col2 = k % 2 ? a : b;
    const wide = 2 * r * Math.sin(dth / 2), sx = Math.sin(tm), cx = Math.cos(tm);
    if (k > 1) {
      // mur, puis frange festonnée pendue au bord du toit
      f.add(new THREE.CylinderGeometry(r, r, hw, 1, 1, true, ts, dth).translate(0, hw / 2, 0), 0, 0, cz, col);
      f.box(wide * 0.96, 0.04, 0.012, sx * (r + 0.008), hw - 0.045, cz + cx * (r + 0.008), col2, false);
      f.sub(sx * (r + 0.012), cz + cx * (r + 0.012), tm).add(new THREE.ConeGeometry(wide * 0.4, 0.075, 3).rotateX(PI), 0, hw - 0.12, 0, col2);
      if (st.age === 2 && k % 4 === 3) f.box(wide * 0.5, 0.07, 0.01, sx * (r + 0.013), 0.1 + 0.08 * H(k, 7), cz + cx * (r + 0.013), [0x4a78a8, 0x7a9a4a, 0xc8a050][k % 3]);
    }
    // toit en deux étages : jupe évasée, puis cône du faîte
    f.add(new THREE.CylinderGeometry(rt, r + 0.035, h1, 1, 1, true, ts, dth).translate(0, h1 / 2, 0), 0, hw, cz, col);
    f.add(new THREE.ConeGeometry(rt, h2, 1, 1, true, ts, dth).translate(0, h2 / 2, 0), 0, hw + h1, cz, col);
    // nervure à chaque jonction de pans
    if (st.age !== 2) {
      const tx = Math.sin(ts), tz = Math.cos(ts);
      f.tube([tx * (r + 0.036), hw, cz + tz * (r + 0.036)], [tx * rt, hw + h1, cz + tz * rt], 0.004, st.age === 3 ? GOLD : lt(b, 0.2), st.age >= 4 ? lamp : false, 4);
      f.tube([tx * rt, hw + h1, cz + tz * rt], [0, topY - 0.01, cz], 0.0032, st.age === 3 ? GOLD : lt(b, 0.2), st.age >= 4 ? lamp : false, 4);
    }
  }
  // moignon de pans à l'entrée : la jupe du toit continue au-dessus de la porte (déjà dessinée), le mur manque : intérieur sombre éclairé
  f.box(0.38, 0.3, 0.02, 0, 0, cz + r - 0.07, 0x2a1a2a);
  f.box(0.26, 0.26, 0.012, 0, 0.02, cz + r - 0.03, st.neon ? 0xffb8f0 : WARM, lamp);
  // entrée drapée : montants, linteau, deux pans de rideau relevés par un cordon, frange dorée
  const door = (s: number) => {
    const ux = s * 0.215, uz = cz + Math.sqrt(r * r - 0.215 * 0.215);
    f.cyl(0.014, 0.016, hw + 0.04, 6, ux, 0, uz + 0.012, st.age === 3 ? GOLD : st.age === 2 ? st.wood : lt(b, 0.3));
    f.box(0.095, hw - 0.04, 0.02, s * 0.25, 0.015, uz + 0.012, a, false, s * 0.06);
    f.box(0.085, hw - 0.12, 0.022, s * 0.27, 0.02, uz + 0.022, dk(a, 0.8), false, s * 0.05);
    f.cyl(0.013, 0.013, 0.012, 6, s * 0.22, 0.14, uz + 0.03, GOLD);
    f.box(0.1, 0.018, 0.016, s * 0.25, 0.012, uz + 0.012, GOLD);
  };
  door(-1); door(1);
  f.box(0.5, 0.045, 0.026, 0, hw - 0.05, cz + r + 0.002, a);
  for (let k = 0; k < 7; k++) f.box(0.05, 0.05, 0.012, -0.21 + k * 0.07, hw - 0.1, cz + r + 0.012, k % 2 ? GOLD : b, false, PI / 4);
  // enseigne sur deux poteaux, devant l'entrée : lettres en blocs, ampoules au pourtour
  const sz = cz + r + 0.3;
  for (const s of [-1, 1]) f.cyl(0.01, 0.012, 0.52, 6, s * 0.3, 0, sz, st.age >= 4 ? 0x9aa3ad : st.wood);
  f.box(0.62, 0.13, 0.02, 0, 0.4, sz, st.age === 5 ? 0x20204a : dk(a, 0.9));
  f.box(0.66, 0.012, 0.03, 0, 0.395, sz, GOLD); f.box(0.66, 0.012, 0.03, 0, 0.525, sz, GOLD);
  for (let k = 0; k < 6; k++) {
    const lh = 0.05 + 0.03 * H(k, 11), lx = -0.2 + k * 0.08;
    f.box(0.03, lh, 0.012, lx, 0.435, sz + 0.012, st.neon ? NEONS[k % NEONS.length] : GOLD, st.neon ? 'neon' : false);
    if (k % 2 === 0) f.box(0.045, 0.012, 0.012, lx, 0.435 + lh - 0.012, sz + 0.012, st.neon ? NEONS[k % NEONS.length] : GOLD, st.neon ? 'neon' : false);
  }
  for (let k = 0; k <= 12; k++) { f.box(0.014, 0.014, 0.012, -0.3 + k * 0.05, 0.395, sz + 0.016, LAMPS[k % 5], lamp); f.box(0.014, 0.014, 0.012, -0.3 + k * 0.05, 0.52, sz + 0.016, LAMPS[(k + 2) % 5], lamp); }
  // mât central, boule dorée et grand fanion ; pennons de chaque côté sur le toit
  pennant(f, kit, 0, topY - 0.02, cz, 0.3, st.age === 5 ? 0x4ae8ff : a, 0.2, 0.1, st.age >= 4 ? 0xd8d8d0 : st.wood);
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * PI * 2 + 0.5, ps = st.age === 2 ? 0.1 : 0.14;
    pennant(f, kit, Math.sin(t) * (r + 0.03), hw - 0.01, cz + Math.cos(t) * (r + 0.03), 0.15, [a, b, GOLD][k % 3], ps, ps * 0.5, st.wood);
  }
  // haubans jusqu'aux piquets, sauf devant l'entrée
  for (let k = 0; k < N; k += 2) {
    const ts = th0 + k * dth + dth;
    if (Math.abs(Math.sin(ts / 2)) < 0.4) continue;
    const sx = Math.sin(ts), cx = Math.cos(ts);
    f.tube([sx * (r + 0.02), hw + 0.04, cz + cx * (r + 0.02)], [sx * (r + 0.24), 0.01, cz + cx * (r + 0.24)], 0.0028, st.age === 5 ? 0x4ae8ff : 0x5a4a3c, st.age === 5 ? 'neon' : false, 3);
    f.cyl(0.006, 0.008, 0.05, 4, sx * (r + 0.24), 0, cz + cx * (r + 0.24), 0x7a6a58);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* BILLETTERIE                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */
function booth(f: Fr, st: Style, kit: CircusKit, x: number, z: number) {
  const g = f.sub(x, z, -0.12), a = st.red, b = st.cream, lamp: Glow = st.neon ? 'neon' : true;
  if (st.age === 5) {
    // borne holographique : socle, colonne lumineuse, anneau de billets qui tourne, guichet vitré
    g.cyl(0.13, 0.15, 0.04, 14, 0, 0, 0, 0x6a7280);
    g.cyl(0.1, 0.1, 0.012, 14, 0, 0.04, 0, 0x4ae8ff, 'neon');
    g.box(0.2, 0.2, 0.14, 0, 0.05, 0, 0xe8ecf8);
    g.box(0.16, 0.08, 0.012, 0, 0.12, 0.075, 0x4ae8ff, 'neon');
    g.box(0.24, 0.02, 0.1, 0, 0.12, 0.1, 0xb8c4d0);
    g.box(0.3, 0.03, 0.2, 0, 0.255, 0, 0x7a4ae0);
    g.box(0.3, 0.012, 0.2, 0, 0.285, 0, 0x4ae8ff, 'neon');
    const R = kit.turn(g.w(0, 0.46, 0), [0, 1, 0], 0.25);
    for (let k = 0; k < 12; k++) { const t = (k / 12) * PI * 2; R.box(0.05, 0.03, 0.004, Math.sin(t) * 0.1, 0, Math.cos(t) * 0.1, NEONS[k % 5], t, 'neon'); }
    R.add(new THREE.TorusGeometry(0.1, 0.0025, 4, 24).rotateX(PI / 2), 0, 0.015, 0, 0x4ae8ff, 0, 'neon');
    person(g, 0, -0.01, PI, 0x4ae8ff, { y: 0.05, hair: 0xff4aa8 });
    queue(f, x, z, st);
    return;
  }
  // corps, soubassement, toit, auvent rayé, comptoir, vitre éclairée, enseigne « billets »
  const wood = st.age === 2 ? 0x8a6040 : st.age === 3 ? 0x6a4a3a : 0x5a626a;
  g.box(0.34, 0.03, 0.24, 0, 0, 0, dk(wood, 0.8));
  g.box(0.3, 0.22, 0.2, 0, 0.03, 0, st.age === 2 ? 0xa87850 : st.age === 3 ? 0xd8c8a0 : 0xe8ecef);
  if (st.age <= 3) for (let k = 0; k < 6; k++) g.box(0.3, 0.004, 0.202, 0, 0.06 + k * 0.035, 0, dk(st.age === 2 ? 0xa87850 : 0xd8c8a0, 0.86));
  g.box(0.16, 0.09, 0.012, 0, 0.1, 0.103, st.age >= 4 ? 0xa8e8ff : 0x2a2420);
  g.box(0.14, 0.07, 0.008, 0, 0.11, 0.108, st.age >= 4 ? 0xd8f4ff : WARM, true);
  g.box(0.22, 0.014, 0.08, 0, 0.082, 0.125, wood);
  g.p.gable(0.4 * g.k, 0.1 * g.k, 0.3 * g.k, g.X(0, 0), g.base + 0.25 * g.k, g.Z(0, 0), st.age === 2 ? 0x7a5a3a : a, g.ry);
  for (let k = 0; k < 5; k++) g.box(0.07, 0.013, 0.1, -0.14 + k * 0.07, 0.205 - 0.0, 0.14, k % 2 ? b : a, false);
  for (let k = 0; k <= 5; k++) g.add(new THREE.ConeGeometry(0.02, 0.025, 3).rotateX(PI), -0.14 + k * 0.056, 0.2, 0.188, k % 2 ? b : a);
  g.box(0.14, 0.04, 0.01, 0, 0.215, 0.104, GOLD);
  for (let k = 0; k < 5; k++) g.box(0.02, 0.02, 0.005, -0.056 + k * 0.028, 0.22, 0.111, st.neon ? NEONS[k] : a, st.neon ? 'neon' : false);
  person(g, 0, -0.04, PI, a, { y: 0.03, hat: st.age === 3 ? 'top' : 'cap', hatColor: 0x2a2a30 });
  for (let k = 0; k < 4; k++) bulb(g, -0.14 + k * 0.093, 0.255, 0.16, LAMPS[k % 5], lamp, 0.014);
  queue(f, x, z, st);
}

/** La file d'attente devant la billetterie : trois visiteurs, un enfant à ballon (lumineux à l'âge futuriste) */
function queue(f: Fr, x: number, z: number, st: Style) {
  const q = f.sub(x, z + 0.28, 0), fut = st.age === 5, neon: Glow = fut ? 'neon' : false;
  person(q, -0.04, 0.0, PI, fut ? 0x4ae8ff : 0x3c7fd8, { arms: 'up' });
  person(q, -0.18, 0.04, PI + 0.3, fut ? 0xff4aa8 : 0xf2a03c, {});
  person(q, 0.12, 0.05, PI - 0.3, fut ? 0x9a6aff : 0x4fa860, { hat: 'cap', hatColor: 0xd84a3e });
  balloon(q, 0.15, 0.1, 0.05, 0.22, 0xd84a3e, neon);
  balloon(q, -0.2, 0.1, 0.04, 0.17, 0x3c7fd8, neon);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* ROULOTTES ET CARAVANES                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */
interface WagonO { body: number; trim: number; roof: number; seed: number }
function wagon(f: Fr, st: Style, kit: CircusKit, x: number, z: number, ry: number, o: WagonO) {
  const g = f.sub(x, z, ry), age = st.age, lamp: Glow = st.neon ? 'neon' : true;
  if (age === 5) {
    // capsule en lévitation : coque nacrée, bandeau lumineux, hublots, deux nacelles antigravité
    g.ball(1, 0, 0.17, 0, 0xe8ecf8, false, 0.3, 0.12, 0.13, 2);
    g.add(new THREE.CylinderGeometry(0.115, 0.115, 0.4, 14).rotateZ(PI / 2).scale(1, 0.95, 1), 0, 0.17, 0, o.body);
    g.add(new THREE.CylinderGeometry(0.1165, 0.1165, 0.05, 14).rotateZ(PI / 2), 0, 0.17, 0, o.trim, 'neon');
    for (const s of [-1, 1]) g.ball(0.115, s * 0.2, 0.17, 0, o.body, false, 1, 0.95, 1, 1);
    for (let k = 0; k < 3; k++) { g.add(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 10).rotateX(PI / 2), -0.1 + k * 0.1, 0.19, 0.114, 0x4ae8ff, 'neon'); g.add(new THREE.TorusGeometry(0.028, 0.004, 4, 10), -0.1 + k * 0.1, 0.19, 0.115, 0xffffff); }
    g.box(0.07, 0.11, 0.012, 0.22, 0.12, 0.1, 0x20204a);
    for (const s of [-1, 1]) {
      g.cyl(0.02, 0.03, 0.06, 8, s * 0.17, 0.04, 0, 0x6a7280);
      g.cyl(0.07, 0.07, 0.008, 12, s * 0.17, 0.03, 0, o.trim, 'neon');
      g.add(new THREE.TorusGeometry(0.075, 0.004, 4, 14).rotateX(PI / 2), s * 0.17, 0.02, 0, 0xffffff, 'neon');
    }
    g.box(0.1, 0.012, 0.1, -0.05, 0.285, 0, 0x6a7280); g.cyl(0.0, 0.05, 0.02, 10, 0.1, 0.285, 0, 0xc8d0d8);
    return;
  }
  if (age === 4) {
    // caravane en aluminium : coque ovale, bandeau de couleur, hublots éclairés, auvent rayé et fauteuil
    g.box(0.58, 0.04, 0.22, 0, 0.04, 0, 0x3a3a40);
    g.ball(1, 0, 0.17, 0, 0xdfe5ea, false, 0.3, 0.135, 0.135, 2);
    g.box(0.54, 0.02, 0.262, 0, 0.115, 0, o.trim, 'neon');
    for (let k = 0; k < 3; k++) { g.add(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 10).rotateX(PI / 2), -0.1 + k * 0.1, 0.18, 0.125, 0xd8f4ff, true); g.add(new THREE.TorusGeometry(0.03, 0.005, 4, 10), -0.1 + k * 0.1, 0.18, 0.131, 0x8a929a); }
    g.box(0.07, 0.13, 0.014, 0.19, 0.075, 0.1, 0x8a929a);
    g.box(0.1, 0.04, 0.08, -0.12, 0.26, 0, 0xe8ecef); g.cyl(0.0, 0.035, 0.03, 8, 0.12, 0.26, 0, 0xc8d0d8);
    for (const s of [-1, 1]) { g.cyl(0.05, 0.05, 0.04, 10, s * 0.18, 0.0, 0, 0x2a2a30); g.cyl(0.026, 0.026, 0.044, 8, s * 0.18, 0.0, 0, 0xd8dce0); }
    for (const s of [-1, 1]) g.box(0.17, 0.014, 0.275, s * 0.18, 0.11, 0, 0x3a3a40);
    g.tube([-0.29, 0.07, 0], [-0.46, 0.06, 0], 0.012, 0x4a4a52, false, 5);
    for (let k = 0; k < 4; k++) g.box(0.07, 0.012, 0.1, -0.1 + k * 0.07, 0.205 - k * 0.0, 0.18, k % 2 ? 0xf4f4f0 : o.trim);
    for (const s of [-1, 1]) g.tube([s * 0.14 - 0.0, 0.0, 0.215], [s * 0.14, 0.2, 0.215], 0.004, 0xb8c0c8, false, 4);
    g.box(0.05, 0.04, 0.05, -0.12, 0, 0.24, o.trim); g.box(0.05, 0.05, 0.012, -0.12, 0.04, 0.215, o.trim);
    return;
  }
  // roulotte de bois (Moyen Âge) ou roulotte peinte (industriel) : caisse à planches, toit en voûte, porte à marches, fenêtre à volets,
  // poêle qui fume, roues à rayons, timon
  const rich = age === 3, wood = o.body, trim = o.trim;
  g.box(0.56, 0.03, 0.26, 0, 0.06, 0, dk(st.wood, 0.7));
  g.box(0.5, 0.2, 0.24, 0, 0.09, 0, wood);
  for (let k = 0; k < 7; k++) g.box(0.502, 0.004, 0.242, 0, 0.1 + k * 0.026, 0, dk(wood, 0.86));
  g.box(0.52, 0.014, 0.25, 0, 0.285, 0, trim); g.box(0.52, 0.014, 0.25, 0, 0.088, 0, trim);
  g.add(new THREE.CylinderGeometry(0.14, 0.14, 0.54, 9, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 0.75, 1), 0, 0.29, 0, o.roof);
  for (const s of [-1, 1]) { g.box(0.014, 0.012, 0.3, s * 0.24, 0.286, 0, dk(o.roof, 0.7)); g.box(0.012, 0.03, 0.26, s * 0.26, 0.28, 0, o.roof); }
  for (const t of [-0.2, 0, 0.2]) g.add(new THREE.TorusGeometry(0.14, 0.003, 3, 9, PI).scale(1, 0.75, 1), t, 0.29, 0, dk(o.roof, 0.75));
  if (age === 2) { g.box(0.1, 0.004, 0.09, -0.12, 0.36, 0.0, 0xb89a60, false, 0); g.box(0.06, 0.004, 0.07, 0.1, 0.372, -0.05, 0x7a9a6a); }
  if (rich) {
    for (const s of [-1, 1]) { g.ball(0.016, s * 0.265, 0.325, 0.12, GOLD); g.ball(0.016, s * 0.265, 0.325, -0.12, GOLD); }
    g.box(0.1, 0.1, 0.012, 0.0, 0.14, 0.125, GOLD, false, PI / 4); g.box(0.07, 0.07, 0.013, 0.0, 0.155, 0.126, o.roof, false, PI / 4);
  }
  g.box(0.075, 0.15, 0.012, -0.15, 0.09, 0.123, dk(wood, 0.62)); g.box(0.065, 0.06, 0.013, -0.15, 0.165, 0.123, WARM, true);
  g.ball(0.008, -0.12, 0.15, 0.134, GOLD);
  g.box(0.09, 0.02, 0.06, -0.15, 0.045, 0.165, dk(st.wood, 0.9)); g.box(0.08, 0.045, 0.04, -0.15, 0.06, 0.155, dk(st.wood, 0.78));
  g.box(0.11, 0.1, 0.014, 0.1, 0.14, 0.124, trim);
  g.box(0.09, 0.08, 0.016, 0.1, 0.15, 0.126, WARM, true);
  g.box(0.01, 0.08, 0.017, 0.1, 0.15, 0.127, dk(trim, 0.7)); g.box(0.09, 0.008, 0.017, 0.1, 0.19, 0.127, dk(trim, 0.7));
  for (const s of [-1, 1]) g.box(0.04, 0.09, 0.012, 0.1 + s * 0.075, 0.145, 0.125, [0x4a78a8, 0xc8503a, 0x7a9a4a][o.seed % 3], false, s * 0.15);
  g.box(0.12, 0.03, 0.05, 0.1, 0.11, 0.152, st.wood);
  for (let k = 0; k < 4; k++) g.ball(0.012, 0.06 + k * 0.026, 0.145, 0.152, [0xd84a3e, 0xf2a0c0, 0xf2c23a, 0xd84a3e][k]);
  g.cyl(0.016, 0.018, 0.1, 6, 0.17, 0.3, -0.05, IRON); g.cyl(0.022, 0.016, 0.014, 6, 0.17, 0.4, -0.05, dk(IRON, 0.8));
  { const w = g.w(0.17, 0.42, -0.05); kit.smoke(w[0], w[1], w[2], 0); }
  // lanterne pendue à côté de la porte
  g.tube([-0.2, 0.2, 0.13], [-0.215, 0.2, 0.17], 0.003, IRON, false, 3);
  g.ball(0.016, -0.215, 0.18, 0.18, rich ? 0xffe2a0 : WARM, true, 1, 1.2, 1);
  // roues à rayons
  for (const sx of [-0.17, 0.17]) for (const sz of [-0.145, 0.145]) {
    g.add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12).rotateX(PI / 2), sx, 0.07, sz, rich ? dk(trim, 0.9) : dk(st.wood, 0.85));
    g.add(new THREE.CylinderGeometry(0.06, 0.06, 0.024, 12).rotateX(PI / 2), sx, 0.07, sz, dk(wood, 0.5));
    g.add(new THREE.TorusGeometry(0.068, 0.006, 3, 12), sx, 0.07, sz + Math.sign(sz) * 0.011, 0x3a3a40);
    for (let k = 0; k < 4; k++) g.box(0.13, 0.012, 0.012, sx, 0.064, sz + Math.sign(sz) * 0.012, rich ? GOLD : st.wood, false, (k * PI) / 4);
    g.ball(0.014, sx, 0.07, sz + Math.sign(sz) * 0.016, rich ? GOLD : 0x3a3a40);
  }
  // timon et cale
  g.tube([-0.27, 0.075, -0.05], [-0.5, 0.05, -0.05], 0.007, st.wood, false, 4); g.tube([-0.27, 0.075, 0.05], [-0.5, 0.05, 0.05], 0.007, st.wood, false, 4);
  g.box(0.012, 0.045, 0.12, -0.5, 0.0, 0, st.wood);
  g.box(0.06, 0.05, 0.05, 0.3, 0.0, 0.12, 0x9a7550); g.box(0.065, 0.006, 0.055, 0.3, 0.03, 0.12, IRON);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* LA MÉNAGERIE : éléphant et poney                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */
/** Éléphant rigolo (face à +z) : corps rond, trompe dressée en trompette, grandes oreilles, chapeau de fête, couverture rouge */
function elephant(f: Fr, x: number, z: number, ry: number, st: Style, kit: CircusKit) {
  const g = f.sub(x, z, ry, 1.15), holo = st.age === 5, col = holo ? 0xe8ecf8 : 0x9aa0a8, dkc = dk(col, 0.8), glow: Glow = holo ? 'neon' : false;
  for (const sx of [-0.05, 0.05]) for (const sz of [-0.075, 0.075]) g.cyl(0.03, 0.034, 0.1, 7, sx, 0, sz, dkc);
  for (const sx of [-0.05, 0.05]) for (const sz of [-0.075, 0.075]) g.cyl(0.036, 0.036, 0.012, 7, sx, 0, sz, 0xe8e0d0);
  g.ball(1, 0, 0.165, -0.015, col, false, 0.095, 0.092, 0.15, 1);
  g.ball(1, 0, 0.2, 0.135, col, false, 0.065, 0.07, 0.07, 1);
  g.tube([0, 0.185, 0.19], [0, 0.17, 0.245], 0.021, col, false, 6);
  g.tube([0, 0.17, 0.245], [0, 0.2, 0.285], 0.017, col, false, 6);
  g.tube([0, 0.2, 0.285], [0, 0.245, 0.3], 0.013, dkc, false, 6);
  g.ball(0.014, 0, 0.25, 0.3, dkc);
  for (const s of [-1, 1]) {
    g.add(new THREE.CylinderGeometry(0.062, 0.062, 0.008, 10).rotateZ(PI / 2).scale(1, 1.05, 0.9), s * 0.075, 0.215, 0.115, dkc, false, -s * 0.35);
    g.add(new THREE.CylinderGeometry(0.044, 0.044, 0.01, 10).rotateZ(PI / 2).scale(1, 1.05, 0.9), s * 0.077, 0.215, 0.115, 0xe8a8b0, false, -s * 0.35);
    g.add(new THREE.ConeGeometry(0.01, 0.07, 5).rotateX(PI / 2.3), s * 0.034, 0.165, 0.2, 0xf4efe0);
    g.box(0.012, 0.014, 0.01, s * 0.04, 0.222, 0.195, 0x15151a, glow === 'neon' ? 'neon' : false);
  }
  g.tube([0, 0.2, -0.15], [0, 0.1, -0.19], 0.008, dkc, false, 4); g.ball(0.012, 0, 0.09, -0.19, 0x4a4a52);
  // couverture à frange dorée et chapeau pointu
  g.box(0.15, 0.008, 0.11, 0, 0.249, -0.015, st.age === 5 ? 0x7a4ae0 : 0xc8402e); g.box(0.152, 0.012, 0.02, 0, 0.247, 0.05, GOLD);
  g.cone(0.022, 0.065, 6, 0, 0.255, 0.13, 0xf2c23a); g.ball(0.01, 0, 0.32, 0.13, 0xd84a3e);
  if (holo) { const w = g.w(0, 0.12, 0); const R = kit.turn(w, [0, 1, 0], 0.15); R.add(new THREE.TorusGeometry(0.17, 0.003, 4, 24).rotateX(PI / 2), 0, -0.1, 0, 0x4ae8ff, 0, 'neon'); }
}

function pony(f: Fr, x: number, z: number, ry: number, st: Style) {
  const g = f.sub(x, z, ry), col = st.age === 5 ? 0xe8ecf8 : 0x9a5a32, dkc = dk(col, 0.7);
  for (const sx of [-0.028, 0.028]) for (const sz of [-0.07, 0.07]) { g.cyl(0.011, 0.014, 0.09, 5, sx, 0, sz, dkc); g.cyl(0.015, 0.015, 0.012, 5, sx, 0, sz, 0x2a2420); }
  g.ball(1, 0, 0.125, 0, col, false, 0.052, 0.058, 0.115, 1);
  g.tube([0, 0.15, 0.08], [0, 0.235, 0.13], 0.024, col, false, 5);
  g.box(0.045, 0.045, 0.075, 0, 0.225, 0.14, col); g.box(0.034, 0.03, 0.03, 0, 0.222, 0.19, lt(col, 0.3)); g.box(0.012, 0.045, 0.02, 0, 0.228, 0.163, 0xf4f2ee);
  for (const s of [-1, 1]) { g.cone(0.009, 0.024, 4, s * 0.016, 0.265, 0.12, dkc); g.box(0.008, 0.008, 0.006, s * 0.024, 0.24, 0.17, 0x15151a); }
  for (let k = 0; k < 4; k++) g.box(0.012, 0.03, 0.014, 0, 0.19 + k * 0.012, 0.06 + k * 0.016 - 0.01, dk(col, 0.45));
  g.tube([0, 0.16, -0.11], [0, 0.07, -0.15], 0.012, dk(col, 0.45), false, 4); g.ball(0.014, 0, 0.07, -0.15, dk(col, 0.45), false, 1, 1.6, 1);
  g.box(0.11, 0.007, 0.09, 0, 0.18, 0.0, 0x3c7fd8); g.box(0.112, 0.01, 0.014, 0, 0.177, 0.04, GOLD);
  g.tube([0, 0.27, 0.115], [0.01, 0.335, 0.11], 0.003, 0xf0a0c8, false, 3); g.ball(0.012, 0.01, 0.34, 0.11, 0xf0a0c8, false, 1, 1.6, 1);
}

function hay(f: Fr, x: number, z: number, ry: number) {
  const g = f.sub(x, z, ry);
  g.box(0.11, 0.07, 0.075, 0, 0, 0, 0xd8c070);
  for (const s of [-0.03, 0.03]) g.box(0.006, 0.072, 0.077, s, 0, 0, 0x8a6a40);
  for (let k = 0; k < 6; k++) g.box(0.02, 0.003, 0.003, -0.04 + 0.016 * k, 0.07, -0.02 + 0.01 * (k % 3), 0xe8d890, false, H(k, 8));
}

/** Enclos rectangulaire : poteaux, lisses, et barreaux serrés pour une cage */
function pen(f: Fr, x0: number, z0: number, x1: number, z1: number, o: { h: number; bars: boolean; wood: number; metal: number; glow?: Glow; gap?: [number, number] }) {
  const { h } = o, edge = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / (o.bars ? 0.06 : 0.17))), ux = (bx - ax) / L, uz = (bz - az) / L, ang = Math.atan2(ux, uz);
    const g = f.sub((ax + bx) / 2, (az + bz) / 2, ang);
    g.box(0.012, 0.012, L, 0, h, 0, o.metal, o.glow ?? false);
    g.box(0.012, 0.012, L, 0, o.bars ? 0.015 : h * 0.5, 0, o.metal, o.glow ?? false);
    for (let i = 0; i <= n; i++) {
      const u = -L / 2 + (L * i) / n;
      if (o.bars) g.cyl(0.0035, 0.0035, h, 4, 0, 0, u, o.metal, o.glow ?? false); else g.box(0.014, h + 0.02, 0.014, 0, 0, u, o.wood);
    }
  };
  edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
  for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { f.box(0.03, h + 0.04, 0.03, px, 0, pz, o.wood); f.ball(0.02, px, h + 0.05, pz, o.glow ? 0x4ae8ff : GOLD, o.glow ?? false); }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* DÉCORS ET ARTISTES                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */
function lampPost(f: Fr, st: Style, x: number, z: number, h = 0.5) {
  const age = st.age;
  if (age === 2) {
    f.cyl(0.007, 0.01, h, 5, x, 0, z, st.wood);
    f.tube([x, h - 0.02, z], [x + 0.05, h - 0.02, z], 0.004, st.wood, false, 3);
    f.ball(0.02, x + 0.05, h - 0.045, z, 0xffd890, true, 1, 1.2, 1);
  } else if (age === 3) {
    f.cyl(0.008, 0.016, h, 6, x, 0, z, 0x2a3a30); f.cyl(0.02, 0.012, 0.03, 6, x, 0.03, z, 0x2a3a30);
    f.box(0.036, 0.05, 0.036, x, h, z, 0xfff0c0, true); f.cone(0.034, 0.03, 4, x, h + 0.05, z, 0x2a3a30); f.box(0.046, 0.008, 0.046, x, h - 0.006, z, 0x2a3a30);
  } else if (age === 4) {
    f.cyl(0.006, 0.01, h, 6, x, 0, z, 0x8a929a);
    f.tube([x, h, z], [x, h + 0.06, z + 0.05], 0.006, 0x8a929a, false, 4);
    f.box(0.05, 0.012, 0.03, x, h + 0.06, z + 0.04, 0xd8dce0); f.box(0.04, 0.006, 0.022, x, h + 0.056, z + 0.04, 0xfff4d0, true);
  } else {
    f.cyl(0.006, 0.01, h, 6, x, 0, z, 0xc8d0d8);
    f.ball(0.025, x, h + 0.02, z, 0x9aa8ff, 'neon'); f.add(new THREE.TorusGeometry(0.04, 0.003, 4, 14).rotateX(PI / 2), x, h + 0.02, z, 0x4ae8ff, 'neon');
  }
}

/** Affiche : panneau sur piquet, fond de couleur, tête de clown, étoile, bandeau de lettres */
function poster(f: Fr, x: number, z: number, ry: number, bg: number, fg: number, neon = false) {
  const g = f.sub(x, z, ry);
  g.cyl(0.006, 0.006, 0.2, 4, 0, 0, 0, 0x6e523c);
  g.box(0.15, 0.2, 0.01, 0, 0.12, 0, 0xf4ecd8);
  g.box(0.13, 0.18, 0.012, 0, 0.13, 0.001, bg, neon ? 'neon' : false);
  g.ball(0.03, 0, 0.21, 0.01, 0xf0c8a4); g.cone(0.025, 0.04, 5, 0, 0.235, 0.01, fg); g.ball(0.007, 0, 0.205, 0.04, 0xd84a3e);
  g.box(0.1, 0.014, 0.012, 0, 0.18, 0.01, fg, false, 0);
  for (let k = 0; k < 4; k++) g.box(0.016, 0.02, 0.012, -0.04 + k * 0.027, 0.14, 0.011, fg);
  g.box(0.1, 0.012, 0.012, 0, 0.13, 0.011, GOLD);
}

function pillar(f: Fr, st: Style, x: number, z: number) {
  const neon = st.age === 5;
  f.cyl(0.1, 0.11, 0.025, 12, x, 0, z, dk(st.wood, 0.9));
  f.cyl(0.085, 0.085, 0.3, 12, x, 0.025, z, st.age === 5 ? 0x20204a : 0x4a5a48);
  for (let k = 0; k < 7; k++) {
    const t = (k / 7) * PI * 2, c = [0xd84a3e, 0xf2c23a, 0x3c7fd8, 0xf4f2ee, 0x4fa860, 0xe87a3c, 0xb45ad8][k];
    f.box(0.06, 0.075, 0.006, x + Math.sin(t) * 0.087, 0.05 + 0.06 * (k % 2), z + Math.cos(t) * 0.087, c, neon ? 'neon' : false);
  }
  f.cyl(0.095, 0.095, 0.014, 12, x, 0.325, z, dk(st.wood, 0.9)); f.cone(0.1, 0.07, 12, x, 0.339, z, st.age === 2 ? 0x4a6a48 : 0x3a5a48); f.ball(0.012, x, 0.41, z, GOLD);
}

/** Jongleur : trois balles qui montent et descendent d'une main à l'autre (pièces qui se balancent) */
function juggler(f: Fr, kit: CircusKit, st: Style, x: number, z: number, body: number) {
  person(f, x, z, 0, body, { arms: 'up', hat: st.age === 5 ? 'none' : 'cone', hatColor: 0xf2c23a });
  const w = f.w(x, 0.2, z);
  [[0.6, 1.1, 0xd84a3e], [0.5, 1.5, 0x3c7fd8], [0.55, 1.9, 0xf2c23a]].forEach(([amp, fr, c], i) => {
    const s = kit.sway([w[0], w[1], w[2]], [0, 0, 1], amp, fr);
    s.add(new THREE.IcosahedronGeometry(0.014, 0), (i - 1) * 0.04, 0.05 + i * 0.012, 0, c, 0, st.neon ? 'neon' : false);
  });
}

/** Échassier : jambes de bois (ou lumineuses), pantalon rayé, grand chapeau */
function stilt(f: Fr, st: Style, x: number, z: number, body: number) {
  for (const s of [-1, 1]) { f.box(0.01, 0.15, 0.01, x + s * 0.016, 0.0, z, st.neon ? 0x4ae8ff : 0x8a6040, st.neon ? 'neon' : false); f.box(0.03, 0.01, 0.045, x + s * 0.016, 0.0, z + 0.01, 0x3a2a20); f.box(0.022, 0.07, 0.024, x + s * 0.016, 0.1, z, s > 0 ? 0xd84a3e : 0xf4f2ee); }
  person(f, x, z, 0.4, body, { y: 0.15, arms: 'out', hat: 'top', hatColor: 0x7a4ae0 });
  f.box(0.05, 0.012, 0.05, x, 0.157, z, 0xffffff);
}

/** Funambule : corde tendue entre deux mâts, personnage en équilibre avec sa perche qui oscille */
function rope(f: Fr, kit: CircusKit, st: Style, x: number, z0: number, z1: number, y: number) {
  const metal = st.age >= 4, h = y + 0.06;
  for (const z of [z0, z1]) {
    f.cyl(0.008, 0.012, h, 6, x, 0, z, metal ? 0xc8d0d8 : st.wood);
    f.tube([x, 0, z + (z < (z0 + z1) / 2 ? -0.1 : 0.1)], [x, h - 0.06, z], 0.0035, 0x5a4a3c, false, 3);
    f.ball(0.016, x, h, z, st.age === 5 ? 0x4ae8ff : GOLD, st.age === 5 ? 'neon' : false);
  }
  f.tube([x, y, z0], [x, y, z1], 0.0035, st.age === 5 ? 0x4ae8ff : 0x3a2a20, false, 4);
  bunting(f, [x, h - 0.01, z0], [x, h - 0.01, z1], 7, 0.05, [0xd84a3e, 0xf2c23a, 0x3c7fd8, 0x4fa860]);
  const zm = (z0 + z1) / 2 + 0.05;
  person(f, x, zm, 0, 0xd84a3e, { y, arms: 'out', hat: 'cone', hatColor: 0xf2c23a });
  const w = f.w(x, y + 0.12, zm), s = kit.sway(w, [0, 0, 1], 0.14, 0.45);
  s.box(0.42, 0.007, 0.007, -0.21, 0, 0, 0x6e523c);
  for (const sg of [-1, 1]) s.sphere(0.012, sg * 0.21, 0, 0, 0xd84a3e);
}

/** Orgue de barbarie (industriel) : caisse peinte aux tuyaux dorés, roues, manivelle, l'orgue tourne la manivelle */
function organ(f: Fr, kit: CircusKit, x: number, z: number) {
  const g = f.sub(x, z, 0.3);
  g.box(0.26, 0.17, 0.14, 0, 0.06, 0, 0x8a3a3a); g.box(0.28, 0.018, 0.16, 0, 0.23, 0, GOLD); g.box(0.28, 0.014, 0.16, 0, 0.055, 0, GOLD);
  g.box(0.22, 0.12, 0.012, 0, 0.09, 0.075, 0xe8c66a);
  for (let k = 0; k < 7; k++) g.cyl(0.011, 0.011, 0.07 + 0.04 * Math.sin(k * 0.9 + 0.5) ** 2, 6, -0.09 + k * 0.03, 0.1, 0.082, k % 2 ? 0xe8d8a0 : GOLD);
  g.ball(0.03, 0.0, 0.12, 0.085, 0xd84a3e); g.box(0.02, 0.05, 0.012, 0, 0.14, 0.1, 0x3c7fd8);
  for (const s of [-1, 1]) { g.add(new THREE.CylinderGeometry(0.06, 0.06, 0.016, 12).rotateX(PI / 2), s * 0.1, 0.06, 0.09, 0x3a3a40); g.ball(0.012, s * 0.1, 0.06, 0.1, GOLD); g.box(0.1, 0.01, 0.01, s * 0.1, 0.055, 0.1, GOLD, false, PI / 2); }
  const w = g.w(0.15, 0.14, 0.04), c = kit.turn(w, [1, 0, 0], 0.6);
  c.box(0.008, 0.045, 0.008, 0, 0, 0, IRON); c.sphere(0.012, 0, 0.045, 0, 0x8a6040);
  g.tube([-0.12, 0.06, 0.1], [-0.3, 0.02, 0.2], 0.007, 0x6e523c, false, 4);
  person(g, 0.19, 0.04, -PI / 2, 0x3a6ab8, { hat: 'top', hatColor: 0x3a3030, arms: 'one' });
}

/** Bouche à popcorn (moderne) : chariot rouge vitré rempli de popcorn, enseigne lumineuse */
function popcorn(f: Fr, x: number, z: number) {
  const g = f.sub(x, z, 0.3);
  g.box(0.22, 0.1, 0.14, 0, 0.05, 0, 0xd8352e); g.box(0.22, 0.012, 0.14, 0, 0.15, 0, 0xf4f4f0);
  g.box(0.2, 0.1, 0.12, 0, 0.162, 0, 0xcfe8f0); g.box(0.18, 0.08, 0.1, 0, 0.17, 0, 0xfff4d0, true);
  for (let k = 0; k < 14; k++) g.ball(0.011, -0.08 + 0.012 * k, 0.16 + 0.04 * H(k, 2), -0.04 + 0.08 * H(k, 3), 0xfff0c8, false, 1, 0.9, 1);
  g.box(0.24, 0.02, 0.16, 0, 0.265, 0, 0xd8352e);
  for (let k = 0; k < 5; k++) g.box(0.03, 0.03, 0.01, -0.08 + k * 0.04, 0.275, 0.085, k % 2 ? 0xf4f4f0 : 0xd8352e);
  g.box(0.16, 0.035, 0.01, 0, 0.3, 0.0, 0xffe24a, 'neon');
  for (const s of [-1, 1]) { g.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10).rotateX(PI / 2), s * 0.09, 0.035, 0.08, 0x2a2a30); g.cyl(0.006, 0.006, 0.04, 4, s * 0.09, 0.0, 0.08, 0x8a929a); }
  person(g, 0, -0.02, PI, 0xf4f4f0, { y: 0.0, hat: 'cap', hatColor: 0xd8352e });
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* L'ENSEMBLE                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */
export function circus(p: Parts, age: number, kit: CircusKit) {
  const st = STYLE[Math.min(5, Math.max(2, age))], f = new Fr(p, 0, 0, 0, 1);
  const lamp: Glow = st.neon ? 'neon' : true, a = st.red, b = st.cream, cz = st.cz, tf = cz + st.r;
  ground(f, st);
  bigTop(f, st, kit);
  booth(f, st, kit, 0.88, 1.02);

  // roulottes (ou caravanes, ou capsules) : une à gauche, deux derrière, chacune dans ses couleurs
  const wag = (i: number): WagonO => {
    const pal = st.age === 2 ? [[0x7a9a58, 0xd8c08a, 0x8a5a3a], [0xb8523e, 0xe0c890, 0x6a4a30], [0x4a78a8, 0xdcc88a, 0x7a5a3a]]
      : st.age === 3 ? [[0xd8352e, GOLD, 0x2a5a8a], [0x2a7a8a, GOLD, 0xc8402e], [0xe8a83a, 0xd8352e, 0x3a6a3a]]
        : st.age === 4 ? [[0xc9d0d6, 0xff4aa8, 0], [0xc9d0d6, 0x4ae8ff, 0], [0xc9d0d6, 0xffe24a, 0]]
          : [[0xe8ecf8, 0xff4aa8, 0], [0xe8ecf8, 0x4ae8ff, 0], [0xe8ecf8, 0x9a6aff, 0]];
    return { body: pal[i][0], trim: pal[i][1], roof: pal[i][2], seed: i };
  };
  wagon(f, st, kit, -1.2, -0.55, PI / 2, wag(0));
  wagon(f, st, kit, -0.5, -1.28, 0.08, wag(1));
  wagon(f, st, kit, 0.4, -1.3, -0.06, wag(2));
  if (st.age !== 5) {
    // linge qui sèche entre deux roulottes, tonneau, caisses
    f.tube([-0.2, 0.34, -1.3], [-0.2, 0.0, -1.3], 0.004, st.wood, false, 3);
    f.tube([-0.2, 0.3, -1.3], [-0.15, 0.3, -1.3], 0.003, st.wood, false, 3);
    bunting(f, [-0.78, 0.32, -1.32], [-0.2, 0.3, -1.3], 6, 0.04, [0xf4f2ee, 0xf2a0c0, 0x7ac4d8, 0xf2c23a]);
  }
  f.cyl(0.04, 0.036, 0.09, 8, -1.38, 0, -1.3, st.age <= 3 ? 0x9a7550 : 0x3c7fd8);
  f.box(0.07, 0.07, 0.07, -1.38, 0, -1.2, 0xa8805a); f.box(0.06, 0.06, 0.06, -1.37, 0.07, -1.2, 0xc09868, false, 0.4);

  // ménagerie : enclos à barreaux de l'éléphant, enclos du poney
  const bars = st.age >= 3, fence = { h: 0.2, bars, wood: st.wood, metal: st.age === 5 ? 0x4ae8ff : st.age === 4 ? 0xb8c0c8 : st.age === 3 ? 0x3a3a42 : 0x6e523c, glow: (st.age === 5 ? 'neon' : false) as Glow };
  pen(f, 0.94, -1.0, 1.44, -0.08, { ...fence, h: 0.24 });
  elephant(f, 1.18, -0.62, -0.5, st, kit);
  f.ball(0.05, 1.3, 0.05, -0.28, a, false, 1, 1, 1, 1); f.add(new THREE.TorusGeometry(0.05, 0.007, 4, 12), 1.3, 0.05, -0.28, b, false, 0, PI / 2);
  hay(f, 1.32, -0.88, 0.2);
  f.cyl(0.026, 0.022, 0.035, 8, 1.04, 0, -0.2, 0x8a929a);
  pen(f, 0.98, -1.44, 1.44, -1.08, { ...fence, h: 0.17, bars: false, metal: st.age === 5 ? 0x4ae8ff : st.wood });
  pony(f, 1.2, -1.28, -0.9, st);
  hay(f, 1.38, -1.2, 0.5);
  // panneau de la ménagerie
  f.cyl(0.006, 0.006, 0.3, 4, 0.9, 0, -0.04, st.wood); f.box(0.14, 0.07, 0.01, 0.9, 0.3, -0.04, a, false, 0); f.box(0.1, 0.02, 0.012, 0.9, 0.32, -0.035, GOLD);

  // parvis : affiches, funambule, jongleur, échassier, lampes
  pillar(f, st, -0.95, 0.7);
  poster(f, -0.3, 0.74, 0.1, [0xe86a3c, 0x3c7fd8, 0xb45ad8][age % 3], 0xf2c23a, st.age === 5);
  poster(f, 0.3, 0.74, -0.1, [0x3c7fd8, 0xd84a3e, 0x4fa860][age % 3], 0xf4f2ee, st.age === 5);
  for (const s of [-1, 1]) { const t = s * 0.52, rr = st.r + 0.012; f.box(0.1, 0.13, 0.008, Math.sin(t) * rr, 0.1, cz + Math.cos(t) * rr, 0xf4ecd8); }
  rope(f, kit, st, -1.35, 0.2, 1.3, 0.5);
  juggler(f, kit, st, -0.2, 1.1, 0x4fa860);
  if (st.age < 5) stilt(f, st, 0.42, 1.18, 0xd8c8a0);
  if (st.age === 2) {
    // tambourin et flûte : deux musiciens de la troupe devant l'entrée
    person(f, -0.52, 1.28, 0.3, 0xb8523e, { hat: 'cap', hatColor: 0x7a9a58, arms: 'one' }); f.cyl(0.03, 0.03, 0.01, 10, -0.5, 0.1, 1.34, 0xe8d8a0);
    person(f, 0.55, 0.86, -0.4, 0x4a78a8, { hat: 'cone', hatColor: 0xd8c08a });
  } else if (st.age === 3) organ(f, kit, -0.58, 1.2);
  else if (st.age === 4) popcorn(f, -0.6, 1.18);
  else {
    // projections holographiques : anneau de lumière qui tourne au-dessus de l'entrée, étoile et jongleur fantôme
    const w = f.w(0, 0.78, tf + 0.55), R = kit.turn(w, [0, 1, 0], 0.2);
    R.add(new THREE.TorusGeometry(0.15, 0.004, 4, 28).rotateX(PI / 2.4), 0, 0, 0, 0x4ae8ff, 0, 'neon');
    R.add(new THREE.TorusGeometry(0.1, 0.004, 4, 24).rotateX(PI / 2.4), 0, 0.04, 0, 0xff4aa8, 0, 'neon');
    for (let k = 0; k < 5; k++) { const t = (k / 5) * PI * 2; R.box(0.03, 0.03, 0.03, Math.sin(t) * 0.12, 0.0, Math.cos(t) * 0.12, NEONS[k], t, 'neon', PI / 4); }
    for (let k = 0; k < 4; k++) { const s = kit.sway(f.w(0.55, 0.62 + k * 0.01, 1.15), [0, 0, 1], 0.5, 0.7 + k * 0.2); s.add(new THREE.IcosahedronGeometry(0.014, 0), (k - 1.5) * 0.03, 0, 0, NEONS[k], 0, 'neon'); }
  }
  for (const [x, z] of [[-1.38, 1.4], [1.38, 1.4], [0.55, 0.45], [-0.55, 0.45], [1.38, 0.3], [-1.38, -0.2]]) lampPost(f, st, x, z, st.age === 2 ? 0.34 : 0.4);

  // projecteurs (moderne) ou faisceaux lumineux (futuriste)
  if (st.age === 4) for (const s of [-1, 1]) {
    const g = f.sub(s * 1.0, 0.62, 0), sw = kit.sway(g.w(0, 0.14, 0), [0, 0, 1], 0.35, 0.22 + 0.04 * s);
    g.cyl(0.03, 0.04, 0.03, 8, 0, 0, 0, 0x3a3a42); g.box(0.06, 0.06, 0.06, 0, 0.03, 0, 0x8a929a);
    sw.add(new THREE.CylinderGeometry(0.05, 0.012, 0.7, 6).translate(0, 0.45, 0), 0, 0, 0, 0xfff4c0, 0, 'neon');
    sw.add(new THREE.CylinderGeometry(0.03, 0.04, 0.09, 8).translate(0, 0.045, 0), 0, 0, 0, 0x4a525a);
  }
  if (st.age === 5) for (const s of [-1, 1]) {
    const w = f.w(s * 1.0, 0.0, 0.62), R = kit.turn(w, [0, 1, 0], 0.3 * s);
    R.cyl(0.03, 0.04, 0.03, 8, 0, 0, 0, 0x4a525a);
    for (let k = 0; k < 3; k++) R.box(0.012, 0.5, 0.012, Math.sin(k * 2.1) * 0.05, 0.03, Math.cos(k * 2.1) * 0.05, NEONS[(k + (s > 0 ? 2 : 0)) % 5], 0, 'neon');
    // dôme : méridiens et parallèles lumineux au-dessus du chapiteau
  }
  if (st.age === 5) {
    const R0 = 0.88, cy = st.hw + 0.02;
    for (let m = 0; m < 10; m++) {
      const t = (m / 10) * PI * 2;
      let prev: V3 | null = null;
      for (let i = 0; i <= 8; i++) {
        const e = (i / 8) * (PI / 2) * 0.96, q: V3 = [Math.sin(t) * Math.cos(e) * R0, cy + Math.sin(e) * 1.25, cz + Math.cos(t) * Math.cos(e) * R0];
        if (prev) f.tube(prev, q, 0.0035, NEONS[m % 5], 'neon', 4);
        prev = q;
      }
    }
    for (const e of [0.3, 0.62, 0.95]) {
      let prev: V3 | null = null;
      for (let i = 0; i <= 28; i++) {
        const t = (i / 28) * PI * 2, q: V3 = [Math.sin(t) * Math.cos(e) * R0, cy + Math.sin(e) * 1.25, cz + Math.cos(t) * Math.cos(e) * R0];
        if (prev) f.tube(prev, q, 0.003, 0x4ae8ff, 'neon', 4);
        prev = q;
      }
    }
    // l'hologramme de l'éléphant qui tourne au sommet de la ménagerie
    const w = f.w(1.18, 0.5, -0.62), R = kit.turn(w, [0, 1, 0], 0.12);
    for (const [x, y, z, sx, sy, sz] of [[0, 0, 0, 0.1, 0.07, 0.15], [0, 0.05, 0.1, 0.05, 0.05, 0.05], [0, 0.0, 0.17, 0.014, 0.05, 0.014], [0.075, 0.05, 0.08, 0.01, 0.06, 0.05], [-0.075, 0.05, 0.08, 0.01, 0.06, 0.05]]) R.box(sx, sy, sz, x - sx / 2 * 0, y, z, 0x4ae8ff, 0, 'neon');
    for (const sx of [-0.04, 0.04]) for (const sz of [-0.06, 0.06]) R.box(0.02, 0.06, 0.02, sx, -0.06, sz, 0x4ae8ff, 0, 'neon');
  }

  // grandes guirlandes de lampions : du mât du chapiteau aux poteaux du pourtour, et entre les poteaux de l'avant
  const topY = st.hw + st.h1 + st.h2 - 0.03;
  const poles: [number, number][] = [[-1.38, 0.9], [1.38, 0.9], [-1.1, 0.2], [1.1, 0.2], [-0.62, 1.38], [0.62, 1.38]];
  for (const [px, pz] of poles) {
    f.cyl(0.008, 0.012, 0.56, 6, px, 0, pz, st.age >= 4 ? 0xb8c0c8 : st.wood);
    f.ball(0.014, px, 0.57, pz, GOLD);
    garland(f, [0, topY, cz], [px, 0.56, pz], 11, 0.04, lamp, st.neon ? NEONS : LAMPS, st.age === 2 ? 0.03 : 0.018, st.age === 2);
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const [x0, z0] = poles[i], [x1, z1] = poles[i + 1];
    if (i === 4) continue;
    if (Math.hypot(x1 - x0, z1 - z0) > 2.5) continue;
    if (i % 2 === 0 && Math.abs(x0) > 1.3 && Math.abs(x1) > 1.3) garland(f, [x0, 0.56, z0], [x1, 0.56, z1], 14, 0.06, lamp, st.neon ? NEONS : LAMPS, st.age === 2 ? 0.026 : 0.016, st.age === 2);
  }
  garland(f, [-0.62, 0.56, 1.38], [0.62, 0.56, 1.38], 16, 0.07, lamp, st.neon ? NEONS : LAMPS, st.age === 2 ? 0.026 : 0.016, st.age === 2);
  if (st.age === 3) bunting(f, [-1.38, 0.54, 0.9], [-1.38, 0.54, 1.3], 4, 0.03, [a, b, GOLD]);
  void lt; void WARM;
}
