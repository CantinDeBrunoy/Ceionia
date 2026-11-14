import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Oiseaux de la faune (formes instanciées) : passereau, étourneau, bernache, mouette, aigle. Chaque forme est faite à la
 * main en triangles à facettes nettes ; chaque sommet porte sa nuance (`color`), sa part d'aile (`aWing` : 0 corps, 1 bras,
 * 2 main, 3 pattes) et sa peinture (`aPaint` : 0 fixe, 1 couleur de l'oiseau, 2 seconde couleur). Le shader (`wingMaterial`)
 * plie les ailes à l'épaule et au poignet, les replie contre le corps quand l'oiseau est posé.
 */

type P3 = [number, number, number];
/** Anneau du corps : position le long du corps, hauteur du centre, demi-largeur, demi-hauteur ; couleurs du dos et du ventre */
interface Ring { z: number; y: number; rx: number; ry: number; top?: number; belly?: number; pt?: number; pb?: number }

/** Réglage des ailes d'une espèce (unités du modèle) */
export interface WingRig {
  /** battements par seconde × 2π, amplitude (rad), monte-et-baisse du corps */
  freq: number; amp: number; bob: number;
  /** épaule (x, hauteur, z), poignet (x) */
  sx: number; wy: number; sz: number; ex: number;
  /** dièdre au plané : bras, main (relatif au bras ; négatif = ailes en M de la mouette) */
  din: number; dout: number;
  /** aile repliée : part de sa longueur ramenée vers la queue, pointes rapprochées ; haut des pattes */
  fold: number; tuck: number; leg: number;
}

class Plumage {
  pos: number[] = []; col: number[] = []; wing: number[] = []; paint: number[] = [];
  private rnd: () => number;
  private c = new THREE.Color();
  constructor(seed: number, private mottle = 0.06) { this.rnd = mulberry32(seed); }

  tri(a: P3, b: P3, c: P3, color: number, wing = 0, paint = 0, shade = 1) {
    // nuance face par face : le plumage n'est jamais d'un seul aplat
    const k = shade * (1 + (this.rnd() - 0.5) * 2 * this.mottle);
    this.c.setHex(color).multiplyScalar(k);
    for (const p of [a, b, c]) { this.pos.push(...p); this.col.push(this.c.r, this.c.g, this.c.b); this.wing.push(wing); this.paint.push(paint); }
  }
  quad(a: P3, b: P3, c: P3, d: P3, color: number, wing = 0, paint = 0, shade = 1) {
    this.tri(a, b, c, color, wing, paint, shade);
    this.tri(a, c, d, color, wing, paint, shade);
  }
  /** Polygone convexe en éventail (aile, queue), et son reflet de l'autre côté (x → −x) */
  plate(pts: P3[], color: number, wing = 0, paint = 0, shade = 1, mirror = true) {
    for (const s of mirror ? [1, -1] : [1])
      for (let i = 1; i < pts.length - 1; i++) {
        const m = (p: P3): P3 => [p[0] * s, p[1], p[2]];
        this.tri(m(pts[0]), m(pts[i]), m(pts[i + 1]), color, wing, paint, shade);
      }
  }
  /**
   * Coque tendue sur des anneaux, d'arrière en avant. Chaque facette prend la couleur du dos ou du ventre selon qu'elle
   * regarde vers le haut ou vers le bas (les flancs, entre les deux) ; un tronçon prend les couleurs de son anneau de départ
   */
  loft(rings: Ring[], sides: number, top: number, belly: number, pt = 1, pb = 2) {
    const off = Math.PI / sides;
    const at = (r: Ring, i: number): P3 => {
      const a = off + (i / sides) * Math.PI * 2;
      return [Math.cos(a) * r.rx, r.y + Math.sin(a) * r.ry, r.z];
    };
    const mid = new THREE.Color();
    const face = (a: P3, b: P3, c: P3, r: Ring) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const t = ny / (Math.hypot(nx, ny, nz) || 1);
      const ct = r.top ?? top, cb = r.belly ?? belly, ptt = r.pt ?? pt, pbb = r.pb ?? pb;
      if (t > 0.3) this.tri(a, b, c, ct, 0, ptt);
      else if (t < -0.3) this.tri(a, b, c, cb, 0, pbb);
      else if (ptt === pbb) this.tri(a, b, c, mid.setHex(ct).lerp(new THREE.Color(cb), 0.5 - t).getHex(), 0, ptt);
      else this.tri(a, b, c, t >= 0 ? ct : cb, 0, t >= 0 ? ptt : pbb, 0.92);
    };
    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k], r1 = rings[k + 1];
      for (let i = 0; i < sides; i++) {
        const a = at(r0, i), b = at(r0, i + 1), c = at(r1, i + 1), d = at(r1, i);
        // sens des faces : normales vers l'extérieur (pour la nuance dos-ventre)
        if (r1.rx > 0) face(a, b, c, r0), face(a, c, d, r0);
        else face(a, b, d, r0);
      }
    }
    // l'arrière fermé
    const r = rings[0];
    if (r.rx > 0) for (let i = 0; i < sides; i++) face([0, r.y, r.z], at(r, i + 1), at(r, i), r);
  }
  /** Œil : un petit triangle sombre de chaque côté de la tête */
  eyes(x: number, y: number, z: number, s: number) {
    for (const k of [1, -1]) this.tri([k * x, y + s, z], [k * x, y - s * 0.6, z + s], [k * x, y - s * 0.6, z - s], 0x1a1614, 0, 0);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(this.wing, 1));
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(this.paint, 1));
    g.computeVertexNormals();
    return g;
  }
}

const W = 0xffffff;

/** Passereau (rouge-gorge, mésange, pinson…) : pieds à y = 0, dos et ailes de sa couleur, gorge et ventre de la seconde */
export const SONG_RIG: WingRig = { freq: 21, amp: 0.95, bob: 0.003, sx: 0.013, wy: 0.042, sz: 0.006, ex: 0.042, din: 0.08, dout: 0.04, fold: 0.72, tuck: 0.12, leg: 0.022 };
export function songbirdGeo() {
  const p = new Plumage(11);
  p.loft([
    { z: -0.034, y: 0.034, rx: 0.006, ry: 0.004 },
    { z: -0.022, y: 0.031, rx: 0.015, ry: 0.014 },
    { z: -0.002, y: 0.031, rx: 0.02, ry: 0.019 },
    { z: 0.016, y: 0.036, rx: 0.018, ry: 0.018 },
    // tête : calotte de la couleur de l'oiseau, face et gorge de la seconde
    { z: 0.029, y: 0.047, rx: 0.014, ry: 0.014 },
    { z: 0.04, y: 0.051, rx: 0.014, ry: 0.014 },
    { z: 0.051, y: 0.05, rx: 0.009, ry: 0.009 },
    { z: 0.055, y: 0.049, rx: 0, ry: 0 },
  ], 6, W, W);
  // bec fin et sombre
  p.loft([{ z: 0.051, y: 0.048, rx: 0.0035, ry: 0.003 }, { z: 0.066, y: 0.047, rx: 0, ry: 0 }], 4, 0x3a302a, 0x3a302a, 0, 0);
  p.eyes(0.0125, 0.053, 0.044, 0.0028);
  // queue un peu relevée
  p.plate([[0.006, 0.034, -0.028], [0.012, 0.031, -0.062], [-0.012, 0.031, -0.062], [-0.006, 0.034, -0.028]], W, 0, 1, 0.72, false);
  // ailes courtes et arrondies : couvertures plus claires, rémiges sombres
  p.plate([[0.013, 0.042, 0.018], [0.042, 0.043, 0.016], [0.042, 0.042, 0.002], [0.013, 0.042, 0.002]], W, 1, 1, 1.05);
  p.plate([[0.013, 0.042, 0.002], [0.042, 0.042, 0.002], [0.042, 0.042, -0.008], [0.013, 0.041, -0.01]], W, 1, 1, 0.78);
  p.plate([[0.042, 0.043, 0.016], [0.07, 0.042, 0.007], [0.083, 0.041, -0.006], [0.072, 0.041, -0.015], [0.042, 0.042, -0.008]], W, 2, 1, 0.7);
  // pattes fines, rentrées en vol
  for (const s of [1, -1]) p.quad([s * 0.005, 0.022, 0.004], [s * 0.008, 0.022, 0.004], [s * 0.008, 0, 0.006], [s * 0.005, 0, 0.006], 0x4a3e36, 3, 0);
  return p.build();
}

/** Étourneau : petit oiseau sombre aux reflets, ailes triangulaires pointues (vols en nuée au-dessus du village) */
export const STARLING_RIG: WingRig = { freq: 17, amp: 0.8, bob: 0.003, sx: 0.012, wy: 0.006, sz: 0.004, ex: 0.044, din: 0.06, dout: 0.02, fold: 0.7, tuck: 0.1, leg: 0 };
export function starlingGeo() {
  const p = new Plumage(23, 0.16);
  p.loft([
    { z: -0.034, y: 0.002, rx: 0.006, ry: 0.004 },
    { z: -0.02, y: 0, rx: 0.013, ry: 0.012 },
    { z: 0.006, y: 0, rx: 0.016, ry: 0.015 },
    { z: 0.026, y: 0.004, rx: 0.012, ry: 0.012 },
    { z: 0.04, y: 0.006, rx: 0.009, ry: 0.009 },
    { z: 0.047, y: 0.006, rx: 0, ry: 0 },
  ], 5, W, W);
  p.loft([{ z: 0.043, y: 0.005, rx: 0.003, ry: 0.0025 }, { z: 0.062, y: 0.004, rx: 0, ry: 0 }], 3, 0xe8c040, 0xe8c040, 0, 0);
  p.plate([[0.005, 0.002, -0.03], [0.011, 0.003, -0.056], [-0.011, 0.003, -0.056], [-0.005, 0.002, -0.03]], W, 0, 1, 0.8, false);
  p.plate([[0.012, 0.006, 0.022], [0.044, 0.008, 0.021], [0.044, 0.007, -0.008], [0.012, 0.006, -0.012]], W, 1, 1, 1.1);
  p.plate([[0.044, 0.008, 0.021], [0.106, 0.006, -0.012], [0.086, 0.006, -0.021], [0.044, 0.007, -0.008]], W, 2, 1, 0.85);
  return p.build();
}

/** Bernache : corps gris-brun, cou et tête noirs à mentonnière blanche, croupion blanc, queue noire ; vols en V */
export const GOOSE_RIG: WingRig = { freq: 5.6, amp: 0.55, bob: 0.008, sx: 0.034, wy: 0.016, sz: 0.004, ex: 0.15, din: 0.05, dout: -0.04, fold: 0.6, tuck: 0.1, leg: 0 };
export function gooseGeo() {
  const p = new Plumage(37, 0.05);
  const NECK = 0x2a2828;
  p.loft([
    { z: -0.125, y: 0.005, rx: 0.012, ry: 0.008, belly: 0xf4f2ee, pb: 0 },
    { z: -0.085, y: 0, rx: 0.034, ry: 0.03 },
    { z: -0.02, y: -0.003, rx: 0.046, ry: 0.04 },
    { z: 0.05, y: 0, rx: 0.04, ry: 0.036, top: NECK, belly: NECK, pt: 0, pb: 0 },
    { z: 0.095, y: 0.008, rx: 0.019, ry: 0.02, top: NECK, belly: NECK, pt: 0, pb: 0 },
    { z: 0.16, y: 0.016, rx: 0.012, ry: 0.013, top: NECK, belly: 0xf4f2ee, pt: 0, pb: 0 },
    { z: 0.19, y: 0.02, rx: 0.016, ry: 0.018, top: NECK, belly: 0xf4f2ee, pt: 0, pb: 0 },
    { z: 0.224, y: 0.02, rx: 0.012, ry: 0.013, top: NECK, belly: NECK, pt: 0, pb: 0 },
    { z: 0.232, y: 0.019, rx: 0, ry: 0 },
  ], 6, W, W);
  p.loft([{ z: 0.226, y: 0.017, rx: 0.006, ry: 0.005 }, { z: 0.262, y: 0.014, rx: 0, ry: 0 }], 4, 0x242222, 0x242222, 0, 0);
  p.eyes(0.0115, 0.025, 0.21, 0.003);
  p.plate([[0.012, 0.005, -0.118], [0.024, 0.006, -0.162], [-0.024, 0.006, -0.162], [-0.012, 0.005, -0.118]], 0x2a2828, 0, 0, 1, false);
  p.plate([[0.034, 0.016, 0.05], [0.15, 0.02, 0.054], [0.15, 0.02, 0.014], [0.034, 0.016, 0.012]], W, 1, 1, 1.08);
  p.plate([[0.034, 0.016, 0.012], [0.15, 0.02, 0.014], [0.15, 0.018, -0.034], [0.034, 0.015, -0.044]], W, 1, 1, 0.72);
  p.plate([[0.15, 0.02, 0.054], [0.24, 0.018, 0.034], [0.31, 0.015, -0.01], [0.27, 0.015, -0.04], [0.15, 0.018, -0.034]], 0x3e3a36, 2, 0);
  return p.build();
}

/** Goéland : tête et ventre blancs, manteau gris, pointes d'ailes noires tachées de blanc, bec jaune à tache rouge */
export const GULL_RIG: WingRig = { freq: 6.4, amp: 0.6, bob: 0.006, sx: 0.028, wy: 0.012, sz: 0, ex: 0.13, din: 0.17, dout: -0.34, fold: 0.66, tuck: 0.1, leg: -0.02 };
export function gullGeo() {
  const p = new Plumage(53, 0.04);
  p.loft([
    { z: -0.1, y: 0.004, rx: 0.012, ry: 0.008 },
    { z: -0.07, y: 0, rx: 0.026, ry: 0.024 },
    { z: -0.01, y: -0.002, rx: 0.034, ry: 0.032 },
    { z: 0.05, y: 0.002, rx: 0.03, ry: 0.029, pt: 2 },
    { z: 0.085, y: 0.01, rx: 0.02, ry: 0.021, pt: 2 },
    { z: 0.11, y: 0.014, rx: 0.019, ry: 0.019, pt: 2 },
    { z: 0.134, y: 0.012, rx: 0.011, ry: 0.012, pt: 2 },
    { z: 0.14, y: 0.012, rx: 0, ry: 0 },
  ], 6, W, W);
  p.loft([{ z: 0.133, y: 0.01, rx: 0.005, ry: 0.006 }, { z: 0.166, y: 0.008, rx: 0, ry: 0 }], 4, 0xf0c040, 0xf0c040, 0, 0);
  p.tri([0.0052, 0.006, 0.152], [0.0045, 0.008, 0.158], [0.0045, 0.0045, 0.158], 0xd84030, 0, 0);
  p.tri([-0.0052, 0.006, 0.152], [-0.0045, 0.008, 0.158], [-0.0045, 0.0045, 0.158], 0xd84030, 0, 0);
  p.eyes(0.0168, 0.018, 0.118, 0.0035);
  p.plate([[0.012, 0.004, -0.094], [0.026, 0.005, -0.136], [-0.026, 0.005, -0.136], [-0.012, 0.004, -0.094]], W, 0, 2, 0.97, false);
  // bras : manteau gris, liseré blanc au bord de fuite
  p.plate([[0.028, 0.013, 0.035], [0.13, 0.018, 0.04], [0.13, 0.017, -0.022], [0.028, 0.012, -0.026]], W, 1, 1);
  p.plate([[0.028, 0.012, -0.026], [0.13, 0.017, -0.022], [0.13, 0.016, -0.032], [0.028, 0.012, -0.036]], W, 1, 2);
  // main : grise, puis la pointe noire et son miroir blanc
  p.plate([[0.13, 0.018, 0.04], [0.21, 0.016, 0.025], [0.2, 0.015, -0.026], [0.13, 0.016, -0.032]], W, 2, 1, 0.96);
  p.plate([[0.21, 0.016, 0.025], [0.3, 0.012, -0.004], [0.27, 0.012, -0.03], [0.2, 0.015, -0.026]], 0x222226, 2, 0);
  p.plate([[0.252, 0.0145, 0.006], [0.278, 0.0135, -0.006], [0.258, 0.0135, -0.016]], 0xf4f4f4, 2, 0);
  // pattes roses, rentrées en vol
  for (const s of [1, -1]) p.quad([s * 0.01, -0.02, 0.006], [s * 0.016, -0.02, 0.006], [s * 0.016, -0.066, 0.01], [s * 0.01, -0.066, 0.01], 0xe0a49a, 3, 0);
  return p.build();
}

/** Aigle royal : brun sombre, nuque dorée, bec crochu jaune à pointe sombre, larges ailes aux rémiges écartées en doigts */
export const EAGLE_RIG: WingRig = { freq: 3.4, amp: 0.42, bob: 0.01, sx: 0.045, wy: 0.016, sz: 0, ex: 0.2, din: 0.12, dout: 0.07, fold: 0.6, tuck: 0.1, leg: -0.03 };
export function eagleGeo() {
  const p = new Plumage(71, 0.07);
  const GOLD = 0xc8944a;
  p.loft([
    { z: -0.13, y: 0.004, rx: 0.016, ry: 0.01 },
    { z: -0.09, y: 0, rx: 0.045, ry: 0.04 },
    { z: -0.01, y: -0.004, rx: 0.058, ry: 0.052 },
    { z: 0.07, y: 0.002, rx: 0.05, ry: 0.046 },
    { z: 0.11, y: 0.012, rx: 0.034, ry: 0.034, top: GOLD, pt: 0 },
    { z: 0.15, y: 0.016, rx: 0.03, ry: 0.03, top: GOLD, pt: 0 },
    { z: 0.18, y: 0.012, rx: 0.018, ry: 0.02 },
    { z: 0.188, y: 0.012, rx: 0, ry: 0 },
  ], 6, W, W);
  // bec crochu : base jaune, pointe sombre recourbée
  p.loft([{ z: 0.17, y: 0.01, rx: 0.01, ry: 0.012 }, { z: 0.198, y: 0.006, rx: 0.007, ry: 0.009 }], 4, 0xe8b830, 0xe8b830, 0, 0);
  p.loft([{ z: 0.198, y: 0.006, rx: 0.007, ry: 0.009 }, { z: 0.212, y: -0.008, rx: 0, ry: 0 }], 4, 0x3a3634, 0x3a3634, 0, 0);
  p.eyes(0.0262, 0.02, 0.16, 0.0045);
  // queue en éventail
  p.plate([[0.016, 0.004, -0.12], [0.05, 0.006, -0.205], [0, 0.006, -0.218], [-0.05, 0.006, -0.205], [-0.016, 0.004, -0.12]], W, 0, 1, 0.82, false);
  // bras : couvertures plus pâles, rémiges sombres
  p.plate([[0.045, 0.017, 0.07], [0.2, 0.025, 0.075], [0.2, 0.024, 0.02], [0.045, 0.016, 0.02]], W, 1, 1, 1.3);
  p.plate([[0.045, 0.016, 0.02], [0.2, 0.024, 0.02], [0.2, 0.022, -0.075], [0.045, 0.015, -0.085]], W, 1, 1, 0.8);
  // pattes emplumées, serres jaunes, rentrées en vol
  for (const s of [1, -1]) {
    p.quad([s * 0.018, -0.03, 0.01], [s * 0.032, -0.03, 0.01], [s * 0.03, -0.065, 0.014], [s * 0.02, -0.065, 0.014], 0x3a2a20, 3, 0);
    p.quad([s * 0.021, -0.065, 0.014], [s * 0.029, -0.065, 0.014], [s * 0.029, -0.086, 0.02], [s * 0.021, -0.086, 0.02], 0xe0b030, 3, 0);
  }
  // main et cinq doigts
  p.plate([[0.2, 0.025, 0.075], [0.36, 0.024, 0.05], [0.38, 0.022, -0.04], [0.2, 0.022, -0.075]], W, 2, 1, 0.75);
  for (let k = 0; k < 5; k++) {
    const a = k / 5, b = (k + 0.8) / 5;
    const e0: P3 = [0.36 + 0.02 * a, 0.024 - 0.002 * a, 0.05 - 0.09 * a], e1: P3 = [0.36 + 0.02 * b, 0.024 - 0.002 * b, 0.05 - 0.09 * b];
    const tip: P3 = [0.5 - Math.abs(k - 1.5) * 0.014, 0.02, 0.052 - k * 0.03];
    p.plate([e0, tip, e1], 0x2a2018, 2, 0);
  }
  return p.build();
}

/** Robes : couleur de l'oiseau (dos, ailes) et seconde couleur (gorge, ventre) */
export const BIRD_COATS: Record<'songbird' | 'starling' | 'bird' | 'gull' | 'eagle', [number, number][]> = {
  // rouge-gorge, mésange bleue, pinson, chardonneret, merle, verdier, moineau
  songbird: [[0x7a6248, 0xe2763a], [0x4c86c8, 0xf0cf48], [0x7c6a62, 0xd88e6e], [0xb8925a, 0xf2e8d8], [0x2c2828, 0x383232], [0x7a9a4a, 0xd0d070], [0x8a6a4c, 0xcfc4b0]],
  starling: [[0x2c2c38, 0x3a3a40], [0x2a3430, 0x383c38], [0x342c38, 0x403840]],
  bird: [[0x8a7a68, 0xdcd4c6], [0x807262, 0xd4ccbe]],
  gull: [[0xb4bcc6, 0xffffff], [0xa6aeba, 0xfcfcfc]],
  eagle: [[0x5a4030, 0x4a3428], [0x4e3828, 0x3e2c22], [0x664a36, 0x523a2c]],
};

/**
 * Matériau des oiseaux : ailes articulées à l'épaule et au poignet (le bout de l'aile suit le bras avec un temps de
 * retard), plané au dièdre de l'espèce, ailes repliées le long du corps et pattes sorties quand l'oiseau est posé.
 * Par oiseau : `aPhase` (phase du battement), `aFlap` (1 ailes ouvertes … 0 repliées), `aBeat` (1 bat des ailes … 0 plane),
 * `aCol2` (seconde couleur)
 */
export function wingMaterial(uTime: { value: number }, r: WingRig) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
  const f = (v: number) => v.toFixed(4);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = `uniform float uTime;
attribute float aPhase;
attribute float aFlap;
attribute float aBeat;
attribute vec3 aCol2;
attribute float aWing;
attribute float aPaint;
vec2 birdRot(vec2 o, float a) { float c = cos(a), s = sin(a); return vec2(o.x * c - o.y * s, o.x * s + o.y * c); }
` + sh.vertexShader
      .replace('#include <color_vertex>', `vColor = vec4(1.0);
  vColor.rgb *= color;
  vColor.rgb *= aPaint < 0.5 ? vec3(1.0) : aPaint < 1.5 ? instanceColor.rgb : aCol2;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    float ph = uTime * ${f(r.freq)} + aPhase;
    float open = aFlap, beat = aBeat * aFlap;
    if (aWing > 0.5) {
      float sd = transformed.x < 0.0 ? -1.0 : 1.0;
      vec3 p = transformed; p.x *= sd;
      vec3 rest = p;
      if (aWing < 2.5) {
        // battement : descente un peu plus vive que la remontée, la main en retard sur le bras
        float t1 = open * (${f(r.din)} + beat * ${f(r.amp)} * (sin(ph) + 0.22 * sin(2.0 * ph)));
        float t2 = open * (${f(r.dout)} + beat * ${f(r.amp * 0.8)} * sin(ph - 0.9));
        if (aWing > 1.5) p.xy = vec2(${f(r.ex)}, ${f(r.wy)}) + birdRot(p.xy - vec2(${f(r.ex)}, ${f(r.wy)}), t2);
        p.xy = vec2(${f(r.sx)}, ${f(r.wy)}) + birdRot(p.xy - vec2(${f(r.sx)}, ${f(r.wy)}), t1);
        // repliée : la pointe vers la queue, collée au flanc
        float u = max(rest.x - ${f(r.sx)}, 0.0), v = rest.z - ${f(r.sz)};
        vec3 fd = vec3(${f(r.sx * 0.95)} + v * 0.3 - u * ${f(r.tuck)}, ${f(r.wy)} - v * 0.45 + u * 0.08, ${f(r.sz)} + v * 0.3 - u * ${f(r.fold)});
        p = mix(fd, p, smoothstep(0.0, 1.0, open));
      } else p.y = mix(p.y, ${f(r.leg)}, open);
      p.x *= sd;
      transformed = p;
    }
    transformed.y -= beat * ${f(r.bob)} * sin(ph + 0.5);
  }`);
  };
  m.customProgramCacheKey = () => `wings${r.freq}|${r.amp}|${r.sx}|${r.ex}|${r.din}|${r.dout}|${r.fold}`;
  return m;
}
