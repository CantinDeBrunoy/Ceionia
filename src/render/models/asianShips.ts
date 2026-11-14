import * as THREE from 'three';
import { Parts } from '../parts';
import { A, dark, hipRoof, inFrame, lantern, mesh, quad, tri, type V3 } from './asian';
import type { WarshipKind } from '../../sim/navalConflict';
import type { WarshipModel } from '../warships';

/**
 * Les navires du peuple asiatique (voir `warships.ts`, et le port de `asian.ts`), au niveau de détail des bâtiments : coque
 * à facettes tirée de couples (`loftHull` : tonture relevée vers la poupe, fond plat, tableau carré), voiles à lattes
 * (`battenSail` : panneaux à facettes, lattes qui dépassent, écoutes en éventail), gréement (`line`), haute poupe laquée à
 * galerie et fanal, gouvernail, ancre, yeux peints, équipage (`sailor`). Proue vers +z, flottaison à y = 0, environ une case
 * de long
 */

const INK = 0x24201e, LACQ = 0xb02a22, GOLD = 0xe0b040, ROPE = 0x5a4a3a, IRON = 0x3a3c40, WHITE = 0xf2ece0;

/** Un cordage (ou un espar) d'un point à un autre */
export function line(p: Parts, a: V3, b: V3, col = ROPE, r = 0.004) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(r, len, r).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  p.add(g, a[0], a[1], a[2], col);
}

/** Garde-corps fin (main courante et chandeliers) le long de x, centré en (x, y, z), tourné de `ry` */
function rail(p: Parts, len: number, x: number, y: number, z: number, ry = 0, col = LACQ, h = 0.03, step = 0.05) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u: number, yy: number): V3 => [x + u * c, yy, z - u * s];
  line(p, at(-len / 2, y + h), at(len / 2, y + h), col, 0.006);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) { const u = -len / 2 + (len * i) / n; line(p, at(u, y), at(u, y + h), col, 0.004); }
}

/** Un marin debout (pieds en y), tourné vers (sin ry, cos ry) : jambes, tunique, bras, tête, chapeau de paille ou casque */
export function sailor(p: Parts, x: number, y: number, z: number, ry = 0, shirt = 0x3a5a8a, hat: 'straw' | 'cap' | 'helmet' = 'straw', k = 1) {
  inFrame(p, x, y, z, ry, (q) => {
    q.box(0.018, 0.03, 0.012, 0, 0, 0, 0x2a2622);
    q.box(0.026, 0.032, 0.016, 0, 0.03, 0, shirt);
    for (const s of [-1, 1]) q.box(0.007, 0.026, 0.008, s * 0.017, 0.034, 0.002, shirt);
    q.sphere(0.0105, 0, 0.072, 0, 0xd8a878);
    if (hat === 'straw') q.add(new THREE.ConeGeometry(0.022, 0.012, 8), 0, 0.086, 0, 0xd8b878);
    else if (hat === 'cap') q.box(0.022, 0.008, 0.024, 0, 0.08, 0.002, shirt);
    else q.sphere(0.013, 0, 0.076, 0, 0x5a6048, 0, 0.7);
  }, k);
}

/** Couple de la coque : position z, demi-largeur au pont, tonture (hauteur du pont), creux sous la flottaison, largeur du fond */
interface Sec { z: number; w: number; sh: number; dep: number; flat?: number }

/**
 * Coque à facettes tirée de couples (de la poupe à la proue) : œuvres mortes (`top`), bande de flottaison (`band`), carène
 * (`bottom`), tableaux de poupe et de proue, pont en retrait, plat-bord. Rend la hauteur du pont à une position z
 */
export function loftHull(p: Parts, secs: Sec[], col: { top: number; bottom: number; band?: number; deck: number; rail?: number }) {
  const side = (s: Sec, sx: number): V3[] => [[sx * s.w, s.sh, s.z], [sx * s.w * 0.98, 0.0, s.z], [sx * s.w * (s.flat ?? 0.62), -s.dep * 0.72, s.z], [0, -s.dep, s.z]];
  const top: number[] = [], bot: number[] = [], deck: number[] = [], caps: number[] = [];
  for (let i = 0; i + 1 < secs.length; i++)
    for (const sx of [-1, 1]) {
      const a = side(secs[i], sx), b = side(secs[i + 1], sx), ref: V3 = [0, (secs[i].sh - secs[i].dep) / 2, (secs[i].z + secs[i + 1].z) / 2];
      quad(top, a[0], b[0], b[1], a[1], ref);
      quad(bot, a[1], b[1], b[2], a[2], ref);
      quad(bot, a[2], b[2], b[3], a[3], ref);
    }
  // le pont, un peu sous le plat-bord
  for (let i = 0; i + 1 < secs.length; i++) {
    const a = secs[i], b = secs[i + 1], ya = a.sh - 0.022, yb = b.sh - 0.022;
    quad(deck, [-a.w * 0.94, ya, a.z], [a.w * 0.94, ya, a.z], [b.w * 0.94, yb, b.z], [-b.w * 0.94, yb, b.z], [0, -60, 0]);
  }
  // les tableaux de poupe et de proue
  for (const [s, dz] of [[secs[0], -1], [secs[secs.length - 1], 1]] as [Sec, number][]) {
    const r = side(s, 1), l = side(s, -1), c: V3 = [0, (s.sh - s.dep) / 2, s.z], ref: V3 = [0, c[1], s.z - dz];
    const ring = [...r, ...l.slice(0, 3).reverse()];
    for (let k = 0; k < ring.length; k++) tri(caps, c, ring[k], ring[(k + 1) % ring.length], ref);
  }
  mesh(p, top, 0, 0, 0, col.top);
  mesh(p, bot, 0, 0, 0, col.bottom);
  mesh(p, caps, 0, 0, 0, col.top);
  mesh(p, deck, 0, 0, 0, col.deck);
  // plat-bord (une lisse sur le bord du pont) et bande de flottaison
  for (const sx of [-1, 1])
    for (let i = 0; i + 1 < secs.length; i++) {
      const a = secs[i], b = secs[i + 1];
      line(p, [sx * a.w, a.sh + 0.012, a.z], [sx * b.w, b.sh + 0.012, b.z], col.rail ?? dark(col.top, 0.75), 0.016);
      if (col.band !== undefined) line(p, [sx * a.w * 1.005, 0.02, a.z], [sx * b.w * 1.005, 0.02, b.z], col.band, 0.022);
    }
  return (z: number) => {
    for (let i = 0; i + 1 < secs.length; i++) if (z >= secs[i].z && z <= secs[i + 1].z) { const t = (z - secs[i].z) / (secs[i + 1].z - secs[i].z); return secs[i].sh + (secs[i + 1].sh - secs[i].sh) * t - 0.022; }
    return secs[0].sh;
  };
}

/**
 * Voile à lattes sur un mât en (0, z) : panneaux de toile à facettes de `y0` à `y1`, en avant du mât de `fore` et en arrière
 * de `aft` (la chute s'arrondit), lattes sombres qui dépassent, vergue haute relevée vers l'avant, écoutes en éventail vers
 * le pont en `sheet` (y, z). `x` : le côté où la voile est bordée
 */
export function battenSail(p: Parts, z: number, y0: number, y1: number, fore: number, aft: number, col: number, n = 6, sheet?: [number, number], batten = INK, x = 0.012) {
  const pts: V3[][] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, y = y0 + (y1 - y0) * t, bulge = Math.sin(t * Math.PI) * 0.18 + (t > 0.85 ? (t - 0.85) * -1.2 : 0);
    const zf = z + fore * (1 + (k === n ? 0.25 : 0)), zb = z - aft * (1 + bulge), yb = k === n ? y + (y1 - y0) * 0.14 : y;
    pts.push([[x, y, zf], [x, yb, zb]]);
  }
  const front: number[] = [], back: number[] = [];
  for (let k = 0; k < n; k++) {
    const [a, b] = pts[k], [c, d] = pts[k + 1], off = k % 2 ? 0.006 : -0.004;
    const mid = (u: V3, v: V3): V3 => [x + off, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    // deux facettes par panneau (la toile gonfle entre deux lattes)
    for (const [out, ref] of [[front, [60, 0, 0]], [back, [-60, 0, 0]]] as [number[], V3][]) {
      quad(out, a, b, mid(b, d), mid(a, c), ref);
      quad(out, mid(a, c), mid(b, d), d, c, ref);
    }
  }
  mesh(p, front, 0, 0, 0, col);
  mesh(p, back, 0, 0, 0, dark(col, 0.86));
  for (let k = 0; k <= n; k++) {
    const [a, b] = pts[k];
    line(p, [a[0] + 0.004, a[1], a[2] + 0.012], [b[0] + 0.004, b[1], b[2] - 0.014], batten, k === n || k === 0 ? 0.01 : 0.007);
    if (sheet && k > 0 && k % 2 === 0) line(p, [b[0], b[1], b[2]], [x * 2, sheet[0], sheet[1]], ROPE, 0.0025);
  }
}

/** Mât (légèrement incliné vers l'avant de `rake`) et sa pomme ; rend le sommet */
function mast(p: Parts, z: number, y0: number, h: number, rake = 0, col = 0x4a3426): V3 {
  const top: V3 = [0, y0 + h, z + Math.sin(rake) * h];
  line(p, [0, y0, z], top, col, 0.016);
  p.sphere(0.012, top[0], top[1] + 0.005, top[2], GOLD);
  return top;
}
/** Haubans d'un mât : de sa tête vers les deux bords */
function shrouds(p: Parts, top: V3, z: number, y: number, w: number, n = 2) {
  for (const sx of [-1, 1]) for (let k = 0; k < n; k++) line(p, [0, top[1] - 0.03, top[2]], [sx * w, y, z - 0.05 + k * 0.06], ROPE, 0.0025);
}
/** Flamme (longue banderole) en tête de mât */
function pennant(p: Parts, top: V3, col = LACQ, len = 0.14) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.03, 0, 0, -0.012, -len, 0, 0, 0, 0, -0.012, -len, 0, -0.03, 0], 3));
  p.add(g, top[0], top[1] + 0.04, top[2], col);
  p.add(g.clone().scale(-1, 1, 1), top[0] - 0.001, top[1] + 0.04, top[2], col);
}

/** Château de poupe laqué : chambre aux fenêtres allumées, galerie à balustrade, toit courbe, fanal, tableau peint */
function sternCastle(p: Parts, z0: number, z1: number, y: number, w: number, h: number, roofC = A.tile) {
  const zc = (z0 + z1) / 2, d = z1 - z0;
  p.box(w * 1.7, h, d, 0, y, zc, LACQ);
  p.box(w * 1.74, 0.012, d + 0.01, 0, y + h * 0.5, zc, GOLD);
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) p.box(0.004, h * 0.4, d * 0.24, sx * w * 0.855, y + h * 0.3, z0 + d * (0.3 + i * 0.4), A.win, 0, true);
  for (let i = 0; i < 3; i++) p.box(w * 0.36, h * 0.4, 0.004, -w * 0.5 + i * w * 0.5, y + h * 0.3, z0 - 0.002, A.win, 0, true);
  rail(p, d, w * 0.85, y + h, zc, Math.PI / 2, LACQ, 0.04, 0.06);
  rail(p, d, -w * 0.85, y + h, zc, Math.PI / 2, LACQ, 0.04, 0.06);
  rail(p, w * 1.7, 0, y + h, z0 + 0.01, 0, LACQ, 0.04, 0.06);
  hipRoof(p, w * 1.1, d * 0.55, 0.06, 0, y + h + 0.06, z0 + d * 0.3, roofC, 0, { lod: true, rows: 0, hips: false, t: 0.012 });
  for (const sx of [-1, 1]) line(p, [sx * w * 0.45, y + h, z0 + d * 0.12], [sx * w * 0.45, y + h + 0.06, z0 + d * 0.12], LACQ, 0.008);
  lantern(p, 0, y + h + 0.13, z0 - 0.02, 0.018);
}
/** Les yeux peints de la proue, des deux bords */
function eyes(p: Parts, z: number, y: number, w: number) {
  for (const sx of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 10).rotateZ(Math.PI / 2), sx * (w + 0.002), y, z, WHITE);
    p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 8).rotateZ(Math.PI / 2), sx * (w + 0.003), y, z + 0.004, INK);
  }
}
/** Gouvernail suspendu au tableau de poupe, sa barre */
function rudder(p: Parts, z: number, y: number) {
  p.box(0.014, 0.16, 0.08, 0, y - 0.14, z - 0.04, 0x4a3426);
  line(p, [0, y, z - 0.02], [0, y + 0.05, z + 0.12], 0x4a3426, 0.008);
}
/** Ancre à jas sur l'avant (bois et fer) */
function anchor(p: Parts, z: number, y: number, w: number) {
  line(p, [w * 0.8, y, z], [w * 0.8, y - 0.09, z + 0.03], 0x4a3426, 0.01);
  line(p, [w * 0.8, y - 0.09, z + 0.03], [w * 0.8 + 0.03, y - 0.07, z + 0.06], IRON, 0.008);
  line(p, [w * 0.8, y - 0.09, z + 0.03], [w * 0.8 - 0.03, y - 0.07, z + 0.0], IRON, 0.008);
}

/** Pièce d'artillerie sur son affût, bouche vers l'extérieur du bord `sx` */
function gun(p: Parts, sx: number, y: number, z: number, w: number, port = true) {
  if (port) p.box(0.004, 0.026, 0.032, sx * (w + 0.002), y - 0.012, z, 0x141210);
  p.add(new THREE.CylinderGeometry(0.008, 0.011, 0.07, 6).rotateZ(Math.PI / 2), sx * (w + 0.01), y, z, IRON);
}

// ---------- Les navires ----------

export interface ShipOut { muzzles: [number, number, number][]; funnel?: [number, number, number] }

/** Jonque de guerre (Médiéval) : coque à haute poupe, trois mâts à voiles lattées brun-rouge, rouf, archers, yeux peints */
export function asianJunk(p: Parts, merchant = false): ShipOut {
  const deckY = loftHull(p, [
    { z: -0.46, w: 0.115, sh: 0.2, dep: 0.03, flat: 0.8 }, { z: -0.36, w: 0.13, sh: 0.15, dep: 0.07 }, { z: -0.18, w: 0.145, sh: 0.11, dep: 0.095 },
    { z: 0.02, w: 0.15, sh: 0.095, dep: 0.1 }, { z: 0.2, w: 0.14, sh: 0.105, dep: 0.09 }, { z: 0.36, w: 0.115, sh: 0.13, dep: 0.06 }, { z: 0.45, w: 0.09, sh: 0.15, dep: 0.03, flat: 0.8 },
  ], { top: merchant ? 0x6a4a30 : 0x3a2620, bottom: 0x5a3a26, band: LACQ, deck: 0xa88458, rail: merchant ? 0x4a3426 : LACQ });
  // château de poupe, rouf du milieu, gouvernail, yeux, ancre
  sternCastle(p, -0.46, -0.26, deckY(-0.36), 0.075, 0.09, merchant ? A.tile : A.tileG);
  p.box(0.1, 0.055, 0.1, 0, deckY(-0.08), -0.1, 0x8a6040);
  p.box(0.102, 0.02, 0.06, 0, deckY(-0.08) + 0.02, -0.1, A.win, 0, true);
  hipRoof(p, 0.14, 0.14, 0.045, 0, deckY(-0.08) + 0.055, -0.1, merchant ? A.thatch : A.tile, 0, { lod: true, rows: 0, hips: false, t: 0.01 });
  rudder(p, -0.47, deckY(-0.46));
  eyes(p, 0.39, 0.09, 0.115);
  anchor(p, 0.4, deckY(0.4), 0.12);
  // mâts et voiles à lattes
  const sail = merchant ? 0xc89a62 : 0xb85a34, sail2 = merchant ? 0xd8b078 : 0xc8703c;
  const t1 = mast(p, 0.02, deckY(0.02), 0.8, 0), t2 = mast(p, 0.27, deckY(0.27), 0.56, 0.12), t3 = mast(p, -0.3, deckY(-0.3) + 0.09, 0.5, -0.05);
  battenSail(p, 0.02, 0.22, 0.76, 0.05, 0.22, sail, 7, [deckY(-0.22) + 0.02, -0.22], INK, 0.014);
  battenSail(p, 0.3, 0.2, 0.56, 0.035, 0.15, sail2, 5, [deckY(0.1) + 0.02, 0.1], INK, 0.014);
  battenSail(p, -0.29, 0.34, 0.62, 0.03, 0.13, sail2, 4, [deckY(-0.44) + 0.1, -0.44], INK, 0.014);
  shrouds(p, t1, 0.02, deckY(0.02), 0.14, 2);
  shrouds(p, t2, 0.27, deckY(0.27), 0.12, 1);
  line(p, t1, [0, deckY(0.44) + 0.02, 0.44], ROPE, 0.0025);
  line(p, t1, t3, ROPE, 0.0025);
  pennant(p, t1, merchant ? GOLD : LACQ, 0.18);
  if (!merchant) { pennant(p, t2, GOLD, 0.1); for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) p.box(0.004, 0.035, 0.035, sx * 0.148, deckY(-0.1 + k * 0.1) + 0.02, -0.1 + k * 0.1, k % 2 ? LACQ : GOLD); }
  // équipage : à la barre, aux écoutes, sur l'avant (des archers sur la jonque de guerre)
  const shirt = merchant ? 0x6a7a5a : 0x8a2a22;
  sailor(p, 0, deckY(-0.36) + 0.09, -0.38, 0, 0x2a3a5a, 'straw');
  sailor(p, 0.06, deckY(-0.18), -0.18, Math.PI / 2, shirt, merchant ? 'straw' : 'helmet');
  sailor(p, -0.06, deckY(0.12), 0.12, -Math.PI / 2, shirt, merchant ? 'straw' : 'helmet');
  sailor(p, 0.05, deckY(0.36), 0.36, 0.3, shirt, merchant ? 'straw' : 'helmet');
  sailor(p, -0.05, deckY(0.3), 0.3, -0.2, 0x2a3a5a, 'straw');
  if (merchant) for (let i = 0; i < 3; i++) p.box(0.05, 0.04, 0.05, -0.05 + i * 0.05, deckY(0.16), 0.16, [0x9a7a5a, 0xb8a070, 0x7a6a4a][i]);
  return { muzzles: [[0.06, 0.18, 0.3], [-0.06, 0.18, 0.12], [0.07, 0.3, -0.34], [-0.07, 0.3, -0.38]] };
}

/** Frégate (Industriel) : grande jonque de guerre noire à batterie de canons, liston rouge, voiles lattées crème, haute poupe */
export function asianFrigate(p: Parts): ShipOut {
  const deckY = loftHull(p, [
    { z: -0.5, w: 0.13, sh: 0.22, dep: 0.04, flat: 0.8 }, { z: -0.38, w: 0.15, sh: 0.17, dep: 0.09 }, { z: -0.16, w: 0.165, sh: 0.13, dep: 0.11 },
    { z: 0.06, w: 0.165, sh: 0.12, dep: 0.11 }, { z: 0.26, w: 0.15, sh: 0.13, dep: 0.1 }, { z: 0.42, w: 0.115, sh: 0.15, dep: 0.07 }, { z: 0.52, w: 0.08, sh: 0.17, dep: 0.03, flat: 0.8 },
  ], { top: 0x23201e, bottom: 0x5a3a26, band: LACQ, deck: 0x9a7a52, rail: GOLD });
  // batterie : liston rouge, sabords et canons des deux bords
  const muzzles: [number, number, number][] = [];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 7; k++) { const z = -0.3 + k * 0.1; gun(p, sx, 0.075, z, 0.163); if (k % 2) muzzles.push([sx * 0.2, 0.075, z]); }
    line(p, [sx * 0.166, 0.1, -0.36], [sx * 0.165, 0.1, 0.36], LACQ, 0.014);
  }
  sternCastle(p, -0.5, -0.28, deckY(-0.4), 0.085, 0.11, A.tileG);
  rudder(p, -0.51, deckY(-0.5));
  eyes(p, 0.45, 0.12, 0.11);
  anchor(p, 0.44, deckY(0.44), 0.13);
  line(p, [0, deckY(0.5) + 0.02, 0.5], [0, deckY(0.5) + 0.12, 0.66], 0x4a3426, 0.014);
  const cream = 0xe8dcc0, cream2 = 0xd8ccb0;
  const t1 = mast(p, 0.04, deckY(0.04), 0.92), t2 = mast(p, 0.32, deckY(0.32), 0.66, 0.1), t3 = mast(p, -0.26, deckY(-0.26), 0.62, -0.04);
  battenSail(p, 0.04, 0.24, 0.88, 0.06, 0.25, cream, 8, [deckY(-0.2) + 0.02, -0.2], INK, 0.016);
  battenSail(p, 0.34, 0.22, 0.66, 0.04, 0.17, cream2, 6, [deckY(0.14) + 0.02, 0.14], INK, 0.016);
  battenSail(p, -0.25, 0.3, 0.72, 0.035, 0.16, cream2, 5, [deckY(-0.46) + 0.11, -0.46], INK, 0.016);
  shrouds(p, t1, 0.04, deckY(0.04), 0.16, 3);
  shrouds(p, t2, 0.32, deckY(0.32), 0.14, 2);
  shrouds(p, t3, -0.26, deckY(-0.26), 0.14, 2);
  line(p, t1, [0, deckY(0.5) + 0.12, 0.66], ROPE, 0.003);
  line(p, t1, t3, ROPE, 0.003);
  pennant(p, t1, LACQ, 0.22); pennant(p, t2, GOLD, 0.12);
  for (const [x, z, ry] of [[0, -0.4, 0], [0.08, -0.1, 1.5], [-0.08, 0.05, -1.5], [0.07, 0.25, 1.2], [-0.06, 0.38, -0.4], [0.04, -0.2, 3]] as const)
    sailor(p, x, z === -0.4 ? deckY(-0.4) + 0.11 : deckY(z), z, ry, z === -0.4 ? 0x2a3a5a : 0x1e2a44, z === -0.4 ? 'cap' : 'straw');
  return { muzzles };
}

/** Cuirassé à vapeur (Industriel) : coque de fer à éperon, casemate inclinée, tourelle double, deux cheminées baguées, mâts de signaux */
export function asianIronclad(p: Parts): ShipOut {
  const deckY = loftHull(p, [
    { z: -0.46, w: 0.12, sh: 0.08, dep: 0.07, flat: 0.75 }, { z: -0.34, w: 0.15, sh: 0.075, dep: 0.1 }, { z: -0.1, w: 0.16, sh: 0.07, dep: 0.11 },
    { z: 0.14, w: 0.16, sh: 0.07, dep: 0.11 }, { z: 0.36, w: 0.13, sh: 0.075, dep: 0.1 }, { z: 0.52, w: 0.05, sh: 0.085, dep: 0.07, flat: 0.5 },
  ], { top: 0x2c2c32, bottom: 0x6a2a24, band: LACQ, deck: 0x6a5a48, rail: 0x3a3a40 });
  p.add(new THREE.ConeGeometry(0.03, 0.14, 4).rotateX(Math.PI / 2), 0, -0.04, 0.58, IRON);
  // casemate aux flancs inclinés, ses sabords et ses canons
  const cy = deckY(0);
  frustum4(p, 0.26, 0.4, 0.17, 0.32, 0.1, 0, cy, -0.04, 0x3a3a40);
  p.box(0.18, 0.012, 0.33, 0, cy + 0.1, -0.04, LACQ);
  const muzzles: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (const z of [-0.14, 0.02, 0.14]) { p.add(new THREE.CylinderGeometry(0.009, 0.011, 0.07, 6).rotateZ(Math.PI / 2), sx * 0.13, cy + 0.05, z, IRON); muzzles.push([sx * 0.17, cy + 0.05, z]); }
  // tourelle avant à deux canons, passerelle, cheminées, mâts de signaux, canots
  p.cyl(0.07, 0.075, 0.07, 12, 0, deckY(0.3), 0.3, 0x4a4a52);
  p.cyl(0.072, 0.072, 0.012, 12, 0, deckY(0.3) + 0.07, 0.3, LACQ);
  for (const s of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.011, 0.013, 0.15, 6).rotateX(Math.PI / 2), s * 0.025, deckY(0.3) + 0.04, 0.42, IRON); muzzles.push([s * 0.025, deckY(0.3) + 0.04, 0.5]); }
  p.box(0.2, 0.05, 0.08, 0, cy + 0.11, 0.1, 0x4a4a52); p.box(0.21, 0.02, 0.085, 0, cy + 0.13, 0.1, 0xf0d8a0, 0, true);
  rail(p, 0.2, 0, cy + 0.16, 0.14, 0, 0x8a8a90, 0.03, 0.05);
  for (const z of [-0.14, -0.26]) { p.cyl(0.03, 0.034, 0.24, 10, 0, cy + 0.1, z, INK); p.cyl(0.035, 0.035, 0.03, 10, 0, cy + 0.26, z, LACQ); p.cyl(0.03, 0.03, 0.01, 10, 0, cy + 0.34, z, 0x141414); }
  const t1 = mast(p, 0.02, cy + 0.16, 0.42, 0, IRON), t2 = mast(p, -0.38, deckY(-0.38), 0.32, 0, IRON);
  line(p, [-0.1, t1[1] - 0.06, t1[2]], [0.1, t1[1] - 0.06, t1[2]], IRON, 0.008);
  shrouds(p, t1, 0.02, cy + 0.12, 0.12, 1);
  line(p, t1, t2, ROPE, 0.0025);
  pennant(p, t1, LACQ, 0.14);
  for (const sx of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.022, 0.016, 0.12, 6).rotateX(Math.PI / 2), sx * 0.11, cy + 0.035, -0.3, WHITE); }
  for (const [x, z, ry] of [[0.05, 0.1, 0], [-0.05, 0.1, 0], [0.09, 0.26, 1.2], [-0.08, -0.36, 3]] as const) sailor(p, x, z === 0.1 ? cy + 0.16 : deckY(z), z, ry, 0x1e2a44, 'cap');
  return { muzzles, funnel: [0, cy + 0.36, -0.2] };
}

/** Tronc de pyramide w0 × d0 → w1 × d1 de haut h, en (x, y, z) */
function frustum4(p: Parts, w0: number, d0: number, w1: number, d1: number, h: number, x: number, y: number, z: number, col: number) {
  const a = w0 / 2, b = d0 / 2, c = w1 / 2, e = d1 / 2, out: number[] = [];
  const B: V3[] = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]], T: V3[] = [[-c, h, -e], [c, h, -e], [c, h, e], [-c, h, e]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(out, B[i], B[j], T[j], T[i], [0, h * 0.3, 0]); }
  quad(out, T[0], T[1], T[2], T[3], [0, -60, 0]);
  mesh(p, out, x, y, z, col);
}

/** Vedette (Moderne) : carène en V grise, passerelle vitrée, mât radar, tourelle avant, lance-missiles, liston rouge, équipage */
export function asianLaunch(p: Parts): ShipOut {
  const deckY = loftHull(p, [
    { z: -0.38, w: 0.1, sh: 0.07, dep: 0.03, flat: 0.5 }, { z: -0.2, w: 0.11, sh: 0.07, dep: 0.06, flat: 0.35 }, { z: 0.05, w: 0.11, sh: 0.075, dep: 0.07, flat: 0.3 },
    { z: 0.24, w: 0.09, sh: 0.09, dep: 0.06, flat: 0.25 }, { z: 0.4, w: 0.02, sh: 0.11, dep: 0.03, flat: 0.2 },
  ], { top: 0x5a5e66, bottom: 0x3a3a40, band: LACQ, deck: 0x7a7f86, rail: 0x8a8f96 });
  const y = deckY(0);
  p.box(0.15, 0.07, 0.2, 0, y, -0.04, 0x6a6e76);
  frustum4(p, 0.13, 0.12, 0.11, 0.08, 0.05, 0, y + 0.07, 0.0, 0x6a6e76);
  p.box(0.134, 0.022, 0.004, 0, y + 0.085, 0.058, 0x1e2a36);
  for (const s of [-1, 1]) p.box(0.004, 0.02, 0.1, s * 0.064, y + 0.085, 0.0, 0x1e2a36);
  p.box(0.12, 0.012, 0.004, 0, y + 0.03, 0.061, 0xf0e0b0, 0, true);
  const t = mast(p, -0.02, y + 0.12, 0.2, -0.1, 0x8a8f96);
  p.box(0.1, 0.01, 0.02, t[0], t[1] - 0.02, t[2], 0x8a8f96);
  p.cyl(0.012, 0.012, 0.02, 8, t[0], t[1] - 0.06, t[2], WHITE);
  p.box(0.012, 0.012, 0.012, t[0], t[1] + 0.02, t[2], A.pink, 0, 'neon');
  pennant(p, t, LACQ, 0.08);
  p.cyl(0.04, 0.045, 0.04, 10, 0, deckY(0.22), 0.22, 0x6a6e76);
  p.add(new THREE.CylinderGeometry(0.008, 0.009, 0.12, 6).rotateX(Math.PI / 2), 0, deckY(0.22) + 0.025, 0.3, IRON);
  p.add(new THREE.BoxGeometry(0.1, 0.05, 0.09), 0, deckY(-0.26) + 0.03, -0.26, 0x6a7058, 0, false, 0, -0.35);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 6).rotateX(Math.PI / 2 - 0.35), s * 0.025, deckY(-0.26) + 0.05, -0.215, 0x141414);
  for (const sx of [-1, 1]) rail(p, 0.3, sx * 0.1, deckY(0.1), 0.12, Math.PI / 2, 0x9a9fa6, 0.025, 0.06);
  p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 3).rotateZ(Math.PI / 2), 0, y + 0.01, -0.16, GOLD);
  for (const [x, z, ry] of [[0.07, -0.12, 1.5], [-0.05, 0.16, 0], [0.04, -0.3, 3]] as const) sailor(p, x, deckY(z), z, ry, 0x2a3a5a, 'helmet');
  return { muzzles: [[0, deckY(0.22) + 0.025, 0.38], [0.025, deckY(-0.26) + 0.06, -0.2], [-0.025, deckY(-0.26) + 0.06, -0.2]] };
}

// ---------- Galère et vedette à coussin d'air (reprises de `warships.ts`), aiguillage ----------

/** Banc de rames (côté +x) : huit rames, pelle au bout, depuis le plat-bord vers l'eau */
function oarBank(): THREE.BufferGeometry {
  const p = new Parts();
  for (let k = 0; k < 8; k++) {
    const z = -0.3 + k * 0.08;
    p.add(new THREE.BoxGeometry(0.3, 0.007, 0.007).translate(0.15, 0, 0), 0, 0, z, 0x8a6a44, 0, false, -0.42);
    p.add(new THREE.BoxGeometry(0.06, 0.004, 0.026).translate(0.3, 0, 0), 0, 0, z, 0xa88458, 0, false, -0.42);
  }
  return p.build(false).body;
}

/** Galère (Antiquité) : coque à facettes, tête de dragon, queue en éventail, boucliers rouges, voile carrée rayée, rameurs */
export function asianGalley(p: Parts): ShipOut & { oars: THREE.BufferGeometry; oarAt: [number, number, number] } {
  const deckY = loftHull(p, [
    { z: -0.48, w: 0.07, sh: 0.12, dep: 0.03, flat: 0.7 }, { z: -0.36, w: 0.1, sh: 0.08, dep: 0.07 }, { z: -0.1, w: 0.11, sh: 0.065, dep: 0.08 },
    { z: 0.18, w: 0.105, sh: 0.065, dep: 0.075 }, { z: 0.4, w: 0.08, sh: 0.08, dep: 0.05 }, { z: 0.5, w: 0.04, sh: 0.1, dep: 0.02, flat: 0.6 },
  ], { top: 0x5a2a1e, bottom: 0x4a3426, band: LACQ, deck: 0xa07850, rail: LACQ });
  // tête de dragon à la proue (gueule, cornes d'or), queue en éventail à la poupe
  line(p, [0, deckY(0.48), 0.48], [0, 0.18, 0.58], LACQ, 0.03);
  p.box(0.05, 0.045, 0.08, 0, 0.16, 0.62, LACQ); p.box(0.04, 0.012, 0.05, 0, 0.145, 0.66, GOLD);
  for (const s of [-1, 1]) { line(p, [s * 0.018, 0.2, 0.6], [s * 0.026, 0.25, 0.56], GOLD, 0.008); p.box(0.006, 0.012, 0.012, s * 0.026, 0.19, 0.645, WHITE); }
  for (let k = -2; k <= 2; k++) p.add(new THREE.BoxGeometry(0.006, 0.12, 0.03), 0, deckY(-0.48) + 0.06, -0.52, k % 2 ? GOLD : LACQ, 0, false, k * 0.25);
  // boucliers ronds le long des plats-bords, rouf de poupe
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
    const z = -0.28 + k * 0.11;
    p.add(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 8).rotateZ(Math.PI / 2), s * 0.112, deckY(z) + 0.02, z, LACQ);
    p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 6).rotateZ(Math.PI / 2), s * 0.116, deckY(z) + 0.02, z, GOLD);
  }
  p.box(0.14, 0.06, 0.13, 0, deckY(-0.36), -0.36, INK); p.box(0.15, 0.01, 0.14, 0, deckY(-0.36) + 0.06, -0.36, LACQ);
  // mât, vergue, voile carrée à bandes rouges et lattes noires
  const t = mast(p, 0.06, deckY(0.06), 0.6);
  line(p, [-0.22, deckY(0.06) + 0.55, 0.06], [0.22, deckY(0.06) + 0.55, 0.06], 0x4a3426, 0.01);
  for (let k = 0; k < 5; k++) { p.box(0.42, 0.075, 0.008, 0, deckY(0.06) + 0.17 + k * 0.074, 0.07, k % 2 ? LACQ : 0xe8d8b0); p.box(0.44, 0.01, 0.012, 0, deckY(0.06) + 0.17 + k * 0.074, 0.07, INK); }
  shrouds(p, t, 0.06, deckY(0.06), 0.11, 1);
  pennant(p, t, LACQ, 0.12);
  for (const [x, z, ry] of [[0, -0.36, 0], [0.04, 0.3, 0.2], [-0.04, 0.2, -0.2]] as const) sailor(p, x, z === -0.36 ? deckY(-0.36) + 0.06 : deckY(z), z, ry, 0x8a2a22, 'helmet');
  return { oars: oarBank(), oarAt: [0.1, 0.05, 0], muzzles: [[0.06, 0.16, 0.25], [-0.06, 0.16, 0.1], [0.06, 0.16, -0.15], [-0.06, 0.18, -0.36]] };
}

/** Vedette à coussin d'air (Futuriste) : jupe noire, coque profilée sombre à liserés lumineux, verrière, soufflantes, drone */
export function asianHover(p: Parts): ShipOut & { drone: THREE.BufferGeometry } {
  const skin = 0x2a2a30, light = 0xff4a3a;
  p.add(new THREE.CylinderGeometry(0.13, 0.14, 0.06, 14).scale(1, 1, 2.6), 0, 0.02, 0, 0x1a1a1e);
  p.add(new THREE.CylinderGeometry(0.11, 0.125, 0.06, 14).scale(1, 1, 2.6), 0, 0.07, 0, skin);
  p.add(new THREE.IcosahedronGeometry(0.07, 1).scale(1, 0.55, 1.6), 0, 0.11, 0.08, 0x1e3a5a);
  for (const s of [-1, 1]) p.box(0.004, 0.006, 0.5, s * 0.122, 0.08, 0, light, 0, 'neon');
  p.box(0.2, 0.012, 0.06, 0, 0.1, 0.28, LACQ);
  for (const s of [-1, 1]) {
    p.add(new THREE.TorusGeometry(0.05, 0.012, 6, 12), s * 0.065, 0.15, -0.3, skin);
    p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6).rotateX(Math.PI / 2), s * 0.065, 0.15, -0.3, 0x3a4250);
    p.box(0.012, 0.09, 0.012, s * 0.065, 0.07, -0.3, 0x3a4250);
  }
  p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12), 0, 0.105, -0.12, 0x3a4250);
  p.add(new THREE.TorusGeometry(0.045, 0.004, 4, 16).rotateX(Math.PI / 2), 0, 0.112, -0.12, light, 0, 'neon');
  p.box(0.03, 0.02, 0.05, 0, 0.12, 0.3, 0x3a4250); p.box(0.012, 0.012, 0.012, 0, 0.125, 0.33, light, 0, 'neon');
  const d = new Parts();
  d.box(0.05, 0.016, 0.05, 0, 0, 0, skin);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { d.box(0.04, 0.006, 0.006, x * 0.02, 0.006, z * 0.02, 0x3a4250, Math.PI / 4 * x * z); d.cyl(0.018, 0.018, 0.004, 8, x * 0.034, 0.014, z * 0.034, 0x9aa4b0); }
  d.box(0.012, 0.008, 0.008, 0, -0.004, 0.026, light, 0, 'neon');
  return { muzzles: [[0, 0.13, 0.34]], drone: d.build(false).body };
}

/** Le navire de guerre asiatique d'une sorte (`warshipKind`) ; le boutre, propre au peuple oriental, devient la jonque */
export function asianShip(p: Parts, kind: WarshipKind): Partial<WarshipModel> {
  switch (kind) {
    case 'galley': return asianGalley(p);
    case 'frigate': return asianFrigate(p);
    case 'ironclad': return asianIronclad(p);
    case 'launch': return asianLaunch(p);
    case 'hover': return asianHover(p);
    default: return asianJunk(p);
  }
}
