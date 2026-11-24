import * as THREE from 'three';
import { Parts } from '../parts';
import { TEAM_A, TEAM_B, TEAM_FLAG_R, team } from '../teamPaint';
import { rod, sail3, sailor, shipHull, squareSail, type V3 } from './orientShips';
import type { OurShip } from '../../sim/fleet';

/**
 * Nos navires de guerre (chantier B du nouveau monde) et ceux des pirates. Aux couleurs du blason du village (sentinelles
 * `TEAM_A`, `TEAM_B`, `TEAM_FLAG_R` : tout suit un changement de blason) :
 * - le **galion de guerre** (Médiéval) : haute coque à deux batteries de sabords, château arrière à galerie, trois mâts,
 *   voiles carrées à bande du blason, hunes et pavois aux couleurs, pavillon au grand mât ;
 * - la **frégate cuirassée** (Industriel) : coque de fer noire à liseré du blason, batterie couverte de dix sabords par bord,
 *   cheminée cerclée, deux mâts gréés (voiles ferlées), roues à aubes dans leurs tambours, chaloupes sur bossoirs ;
 * - le **destroyer** (Moderne et après) : longue coque grise à étrave lancée, numéro de coque, deux tourelles, passerelle,
 *   mât treillis et radar, deux cheminées, tubes lance-torpilles, grenades, embarcations, équipage ;
 * - les **pirates** : une caravelle et un boutre à coque goudronnée, voiles noires rapiécées, pavillon à tête de mort.
 * Proue vers +z, flottaison à y = 0, environ une case de long (comme `warships.ts`)
 */

export interface ShipModel {
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  /** d'où partent les tirs (repère du navire) */
  muzzles: V3[];
  /** bouche(s) de cheminée (fumée), ou vide */
  funnels: V3[];
}

const DARK = 0x4a3426, WOOD = 0x7a5236, DECK = 0xb89262, ROPE = 0x5a4630, IRON = 0x2a2c30, GOLD = 0xe0b850, TAR = 0x231c16;
const SAIL = 0xf2e8d2, SAIL2 = 0xe4d6b8, PANE = 0xffd890, WHITE = 0xeeeae2, STEEL = 0x8a929c, GREY = 0x9aa2aa, GREY_D = 0x6e767e;
const A_D = team(TEAM_A, 0.75), B_D = team(TEAM_B, 0.8);

/** Pavillon du village au bout d'une drisse : (y, z) du haut de la hampe, largeur */
function teamFlag(p: Parts, y: number, z: number, w = 0.1) {
  p.box(0.004, w * 0.6, w, 0, y - w * 0.3, z - w / 2, TEAM_FLAG_R);
}
/** Flamme (longue banderole) en tête de mât */
function pennant(p: Parts, y: number, z: number, len: number, col: number) {
  p.add(new THREE.ConeGeometry(0.012, len, 3).rotateX(-Math.PI / 2).scale(0.3, 1, 1), 0, y, z - len / 2, col);
}
/** Un canon sur affût (pièce de pont), tourné vers le bord `s` */
function deckGun(p: Parts, x: number, y: number, z: number, s: number) {
  p.box(0.03, 0.012, 0.03, x, y + 0.006, z, WOOD);
  p.add(new THREE.CylinderGeometry(0.006, 0.008, 0.045, 6).rotateZ(Math.PI / 2), x + s * 0.02, y + 0.018, z, IRON);
}
/** Lanterne de poupe : cage dorée et flamme */
function lantern(p: Parts, x: number, y: number, z: number) {
  p.cyl(0.012, 0.009, 0.022, 6, x, y, z, GOLD);
  p.box(0.014, 0.014, 0.014, x, y + 0.01, z, PANE, 0, true);
  p.cone(0.012, 0.016, 6, x, y + 0.03, z, DARK);
}
/** Ancre au bossoir, de chaque bord de la proue */
function anchors(p: Parts, gw: (z: number) => number, beam: (z: number) => number, z: number) {
  for (const s of [-1, 1]) {
    const x = s * beam(z) * 1.02, y = gw(z) - 0.03;
    p.box(0.004, 0.05, 0.004, x, y - 0.02, z, IRON);
    p.add(new THREE.TorusGeometry(0.014, 0.003, 3, 6, Math.PI).rotateZ(Math.PI), x, y - 0.045, z, IRON);
  }
}
/** Hauban en échelle : quelques enfléchures entre deux haubans */
function ratlines(p: Parts, a: V3, b: V3, c: V3, n: number) {
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1), y = a[1] + (b[1] - a[1]) * t;
    const p1: V3 = [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t], p2: V3 = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    rod(p, p1, p2, 0.0012, ROPE);
  }
}

/** Le galion de guerre à nos couleurs */
function warGalleon(p: Parts): Partial<ShipModel> {
  const gw = shipHull(p, { L: 0.96, B: 0.27, depth: 0.1, top: 0.1, bow: 0.06, stern: 0.1, transom: 0.76, fine: 1.1, under: TAR, side: 0x3e2a1e, band: TEAM_A, deck: DECK, inner: DARK, wales: [0.05, 0.1], waleCol: 0x241812 });
  const beam = gw.beam;
  // deux batteries de sabords (bande du blason entre les deux), leurs mantelets ouverts et les gueules des canons
  const muzzles: V3[] = [];
  for (const s of [-1, 1]) {
    p.add(new THREE.PlaneGeometry(0.78, 0.018).rotateY(s * Math.PI / 2), s * beam(0) * 1.006, gw(0) - 0.068, -0.02, TEAM_B);
    for (const [row, y0, n] of [[0, 0.04, 8], [1, 0.082, 7]] as [number, number, number][]) for (let k = 0; k < n; k++) {
      const z = -0.33 + k * (row ? 0.095 : 0.088) + row * 0.03, y = gw(z) - y0, x = s * beam(z) * 1.01;
      p.add(new THREE.PlaneGeometry(0.022, 0.019).rotateY(s * Math.PI / 2), x, y, z, 0x120e0a);
      p.add(new THREE.PlaneGeometry(0.022, 0.012).rotateY(s * Math.PI / 2).rotateZ(s * 0.6), x + s * 0.006, y + 0.016, z, A_D);
      p.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.026, 5, 1, true).rotateZ(Math.PI / 2), x + s * 0.01, y, z, IRON);
      if (row === 0 && k % 2) muzzles.push([s * (beam(z) + 0.03), y, z]);
    }
  }
  // le château arrière sur deux étages (pavois du blason), le gaillard d'avant, les fanaux
  const deckAt = (z: number) => gw(z) - 0.022;
  p.box(0.25, 0.075, 0.24, 0, deckAt(-0.36) + 0.037, -0.36, 0x5a3a26);
  p.box(0.252, 0.012, 0.242, 0, deckAt(-0.36) + 0.078, -0.36, DECK);
  p.box(0.21, 0.06, 0.13, 0, deckAt(-0.36) + 0.11, -0.4, 0x5a3a26);
  p.box(0.212, 0.01, 0.132, 0, deckAt(-0.36) + 0.145, -0.4, DECK);
  for (const s of [-1, 1]) {
    p.box(0.006, 0.022, 0.24, s * 0.125, deckAt(-0.36) + 0.09, -0.36, TEAM_A);
    p.box(0.006, 0.02, 0.13, s * 0.105, deckAt(-0.36) + 0.155, -0.4, TEAM_A);
    for (const z of [-0.3, -0.36, -0.42]) p.box(0.004, 0.02, 0.022, s * 0.127, deckAt(-0.36) + 0.04, z, PANE, 0, true);
  }
  p.box(0.2, 0.04, 0.14, 0, deckAt(0.33) + 0.02, 0.33, 0x5a3a26);
  p.box(0.2, 0.008, 0.14, 0, deckAt(0.33) + 0.042, 0.33, DECK);
  for (const s of [-1, 1]) p.box(0.006, 0.02, 0.14, s * 0.098, deckAt(0.33) + 0.056, 0.33, TEAM_A);
  // la galerie de poupe : deux rangs de fenêtres éclairées, moulures d'or, écusson du blason ; trois fanaux, le gouvernail
  const sz = -0.484, sy = gw(-0.48);
  for (const [y, n] of [[sy - 0.02, 4], [sy + 0.05, 3]] as [number, number][]) {
    for (let k = 0; k < n; k++) p.box(0.024, 0.024, 0.004, (k - (n - 1) / 2) * 0.04, y, sz, PANE, 0, true);
    p.box(0.19, 0.007, 0.006, 0, y - 0.017, sz - 0.001, GOLD);
  }
  p.box(0.06, 0.045, 0.006, 0, sy - 0.07, sz - 0.002, TEAM_A);
  p.box(0.03, 0.025, 0.007, 0, sy - 0.07, sz - 0.004, TEAM_B);
  for (const x of [-0.07, 0, 0.07]) lantern(p, x, deckAt(-0.36) + 0.16, -0.46);
  p.box(0.014, 0.17, 0.04, 0, -0.08, -0.49, DARK);
  // l'éperon, la figure de proue dorée, le beaupré et sa civadière
  rod(p, [0, gw(0.45) - 0.05, 0.44], [0, gw(0.45) - 0.01, 0.56], 0.013, 0x3e2a1e);
  p.sphere(0.016, 0, gw(0.45) - 0.005, 0.55, GOLD);
  rod(p, [0, gw(0.42) + 0.03, 0.42], [0, 0.32, 0.7], 0.008, DARK);
  squareSail(p, 0.16, 0.08, 0.27, 0.62, SAIL, 0.02);
  anchors(p, gw, beam, 0.36);
  // trois mâts à hunes du blason ; huniers et basses voiles à bande du blason, perroquet ; artimon latin
  const masts: [number, number, number][] = [[0.24, 0.8, 0.55], [0.02, 0.96, 0.64], [-0.27, 0.56, 0.44]];
  for (const [z, h, top] of masts) {
    p.cyl(0.008, 0.013, h, 6, 0, gw(z) - 0.03, z, DARK);
    p.cyl(0.032, 0.022, 0.022, 7, 0, top, z, TEAM_A);
    if (z < -0.1) continue;
    for (const [y, w, hh, band] of [[top - 0.01, 0.4, 0.22, true], [top + 0.21, 0.3, 0.15, false], [top + 0.36, 0.18, 0.08, false]] as [number, number, number, boolean][]) {
      if (z > 0.1 && y > top + 0.3) continue;
      squareSail(p, w * (z > 0.1 ? 0.88 : 1), hh, y, z + 0.012, SAIL, 0.035);
      p.box(w * 1.1, 0.008, 0.008, 0, y, z + 0.008, DARK);
      if (band) p.box(w * (z > 0.1 ? 0.88 : 1) * 0.98, 0.03, 0.004, 0, y - hh * 0.5, z + 0.042, TEAM_A);
    }
  }
  rod(p, [0.014, 0.3, -0.1], [0.014, 0.74, -0.46], 0.005, DARK);
  sail3(p, [0.016, 0.31, -0.11], [0.016, 0.73, -0.45], [0.014, gw(-0.44) + 0.16, -0.44], SAIL2, 0.04, TEAM_B);
  // le gréement : haubans en échelle, étais, bras des vergues
  for (const [z, , top] of masts) for (const s of [-1, 1]) {
    const a: V3 = [0, top, z], b: V3 = [s * beam(z - 0.04) * 0.98, gw(z - 0.04), z - 0.04], c: V3 = [s * beam(z + 0.04) * 0.98, gw(z + 0.04), z + 0.04];
    rod(p, a, b, 0.0018, ROPE); rod(p, a, c, 0.0018, ROPE);
    ratlines(p, b, a, c, 3);
  }
  rod(p, [0, 0.98, 0.02], [0, 0.82, 0.24], 0.002, ROPE); rod(p, [0, 0.82, 0.24], [0, 0.32, 0.7], 0.002, ROPE);
  rod(p, [0, 0.64, 0.02], [0, 0.45, 0.24], 0.002, ROPE); rod(p, [0, 0.8, 0.02], [0, 0.58, -0.27], 0.002, ROPE);
  // le pont : canons de pont, cabestan, chaloupe, caillebotis, tonneaux ; matelots, officier, canonniers
  for (const z of [0.12, -0.12]) for (const s of [-1, 1]) deckGun(p, s * 0.08, deckAt(z), z, s);
  p.cyl(0.016, 0.02, 0.026, 7, 0, deckAt(-0.2), -0.2, DARK);
  p.add(new THREE.CylinderGeometry(0.032, 0.032, 0.15, 6, 1, false, 0, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.6, 1), 0, deckAt(0.17), 0.18, WOOD);
  p.box(0.07, 0.006, 0.06, 0, deckAt(-0.04), -0.04, 0x2e2018);
  for (const [x, z] of [[0.07, 0.25], [-0.07, 0.24]]) p.cyl(0.012, 0.012, 0.022, 6, x, deckAt(z), z, WOOD);
  sailor(p, 0.05, deckAt(0.05), 0.05, team(TEAM_A, 0.9), WHITE);
  sailor(p, -0.06, deckAt(-0.05), -0.05, team(TEAM_B, 0.9), WHITE);
  sailor(p, 0.06, deckAt(0.12), 0.16, 0x6a4a3a, team(TEAM_A, 1));
  sailor(p, -0.03, deckAt(-0.36) + 0.145, -0.42, team(TEAM_A, 0.6), GOLD);
  // le pavillon au grand mât, les flammes du blason
  teamFlag(p, 1.04, 0.0, 0.11);
  pennant(p, 0.86, 0.24, 0.14, TEAM_A);
  pennant(p, 0.62, -0.27, 0.1, TEAM_B);
  return { muzzles };
}

/** La frégate cuirassée à vapeur, à nos couleurs */
function ironclad(p: Parts): Partial<ShipModel> {
  const gw = shipHull(p, { L: 1, B: 0.25, depth: 0.09, top: 0.08, bow: 0.03, stern: 0.03, transom: 0.72, fine: 1, under: 0x5a2420, side: 0x26282c, band: TEAM_A, deck: 0x9a8a6e, inner: 0x3a3c40, wales: [0.05], waleCol: TEAM_B });
  const beam = gw.beam, deckAt = (z: number) => gw(z) - 0.022;
  // l'éperon de fer, la batterie couverte : dix sabords par bord, plaques rivetées
  p.add(new THREE.ConeGeometry(0.028, 0.14, 4).rotateX(Math.PI / 2), 0, -0.02, 0.54, IRON);
  const muzzles: V3[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 10; k++) {
    const z = -0.36 + k * 0.075, y = gw(z) - 0.035, x = s * beam(z) * 1.01;
    p.add(new THREE.PlaneGeometry(0.022, 0.018).rotateY(s * Math.PI / 2), x, y, z, 0x0e0e10);
    p.add(new THREE.CylinderGeometry(0.006, 0.007, 0.024, 6, 1, true).rotateZ(Math.PI / 2), x + s * 0.009, y, z, IRON);
    if (k % 3 === 1) muzzles.push([s * (beam(z) + 0.03), y, z]);
    if (k % 2 === 0) p.add(new THREE.PlaneGeometry(0.005, 0.005).rotateY(s * Math.PI / 2), x + s * 0.001, y + 0.022, z + 0.03, STEEL);
  }
  // les roues à aubes dans leurs tambours peints du blason
  for (const s of [-1, 1]) {
    const x = s * (beam(0.02) + 0.02);
    p.add(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), x, gw(0.02) - 0.02, 0.02, TEAM_A);
    p.add(new THREE.CircleGeometry(0.06, 10, 0, Math.PI).rotateY(s * Math.PI / 2), x + s * 0.018, gw(0.02) - 0.02, 0.02, A_D);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI; p.box(0.004, 0.003, 0.05, x + s * 0.019, gw(0.02) - 0.02 + Math.sin(a) * 0.03, 0.02 + Math.cos(a) * 0.03, GOLD, 0, false, a); }
  }
  // la cheminée cerclée du blason, ses tuyaux de vapeur ; la passerelle entre les tambours
  p.cyl(0.03, 0.034, 0.26, 10, 0, deckAt(-0.04), -0.04, 0x1e1e20);
  p.cyl(0.035, 0.035, 0.025, 10, 0, deckAt(-0.04) + 0.19, -0.04, TEAM_A);
  p.cyl(0.035, 0.035, 0.012, 10, 0, deckAt(-0.04) + 0.25, -0.04, TEAM_B);
  for (const s of [-1, 1]) p.cyl(0.005, 0.005, 0.2, 5, s * 0.04, deckAt(-0.04), -0.07, STEEL);
  p.box(0.3, 0.008, 0.04, 0, deckAt(0.06) + 0.08, 0.07, 0x5a4a3a);
  for (const s of [-1, 1]) { p.box(0.004, 0.08, 0.004, s * 0.12, deckAt(0.06) + 0.04, 0.07, IRON); p.box(0.004, 0.018, 0.04, s * 0.15, deckAt(0.06) + 0.09, 0.07, WHITE); }
  p.box(0.06, 0.035, 0.03, 0, deckAt(0.06) + 0.1, 0.07, WHITE);
  p.box(0.062, 0.012, 0.004, 0, deckAt(0.06) + 0.11, 0.086, 0x1e2a36);
  // deux mâts, vergues et voiles ferlées, beaupré, haubans
  for (const [z, h] of [[0.26, 0.66], [-0.26, 0.56]] as [number, number][]) {
    p.cyl(0.008, 0.012, h, 6, 0, deckAt(z), z, DARK);
    p.cyl(0.026, 0.02, 0.016, 7, 0, deckAt(z) + h * 0.62, z, TEAM_A);
    for (const [y, w] of [[deckAt(z) + h * 0.6, 0.3], [deckAt(z) + h * 0.88, 0.22]] as [number, number][]) {
      p.box(w, 0.008, 0.008, 0, y, z + 0.006, DARK);
      p.add(new THREE.CylinderGeometry(0.009, 0.009, w * 0.92, 6).rotateZ(Math.PI / 2), 0, y - 0.01, z + 0.01, SAIL2);
    }
    for (const s of [-1, 1]) { const a: V3 = [0, deckAt(z) + h * 0.9, z], b: V3 = [s * beam(z) * 0.98, gw(z), z - 0.04], c: V3 = [s * beam(z) * 0.98, gw(z), z + 0.04]; rod(p, a, b, 0.0018, ROPE); rod(p, a, c, 0.0018, ROPE); ratlines(p, b, a, c, 3); }
  }
  rod(p, [0, gw(0.46), 0.45], [0, 0.26, 0.68], 0.008, DARK);
  rod(p, [0, 0.7, 0.26], [0, 0.26, 0.68], 0.002, ROPE); rod(p, [0, 0.7, 0.26], [0, 0.56, -0.26], 0.002, ROPE);
  sail3(p, [0.002, 0.25, 0.66], [0.002, 0.55, 0.28], [0.002, gw(0.42) + 0.02, 0.42], SAIL, 0.02);
  // la poupe : fenêtres, lanterne, gouvernail, canot ; deux chaloupes sur bossoirs ; canons de chasse ; ancres
  for (let k = 0; k < 4; k++) p.box(0.022, 0.02, 0.004, -0.045 + k * 0.03, gw(-0.5) - 0.03, -0.503, PANE, 0, true);
  lantern(p, 0, gw(-0.48) + 0.01, -0.47);
  p.box(0.014, 0.12, 0.04, 0, -0.05, -0.51, IRON);
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6, 1, false, 0, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.7, 1), s * 0.11, deckAt(-0.33) + 0.06, -0.33, WHITE);
    rod(p, [s * 0.09, deckAt(-0.38), -0.38], [s * 0.13, deckAt(-0.38) + 0.09, -0.38], 0.003, IRON);
    rod(p, [s * 0.09, deckAt(-0.28), -0.28], [s * 0.13, deckAt(-0.28) + 0.09, -0.28], 0.003, IRON);
  }
  deckGun(p, 0, deckAt(0.38), 0.38, 1); deckGun(p, 0, deckAt(-0.42), -0.42, -1);
  anchors(p, gw, beam, 0.38);
  sailor(p, 0.03, deckAt(0.06) + 0.08, 0.07, team(TEAM_A, 0.6), WHITE);
  sailor(p, -0.06, deckAt(0.2), 0.2, 0x2a3040, WHITE);
  sailor(p, 0.06, deckAt(-0.18), -0.18, 0x2a3040, WHITE);
  sailor(p, -0.05, deckAt(0.36), 0.34, 0x2a3040, team(TEAM_A, 1));
  teamFlag(p, deckAt(-0.26) + 0.6, -0.26, 0.1);
  pennant(p, deckAt(0.26) + 0.68, 0.26, 0.12, TEAM_A);
  return { muzzles: [...muzzles, [0.03, deckAt(0.38) + 0.018, 0.42], [-0.03, deckAt(-0.42) + 0.018, -0.46]], funnels: [[0, deckAt(-0.04) + 0.27, -0.04]] };
}

/** Le destroyer, à nos couleurs */
function destroyer(p: Parts): Partial<ShipModel> {
  const gw = shipHull(p, { L: 1.04, B: 0.19, depth: 0.07, top: 0.07, bow: 0.05, stern: 0, transom: 0.8, fine: 1.4, under: 0x6a2a26, side: GREY, band: GREY_D, deck: 0x7e868e, inner: GREY_D });
  const beam = gw.beam, deckAt = (z: number) => gw(z) - 0.022;
  // la bande de flottaison sombre, le numéro de coque (blason), la ligne du blason sur l'étrave
  for (const s of [-1, 1]) {
    p.add(new THREE.PlaneGeometry(0.98, 0.012).rotateY(s * Math.PI / 2), s * beam(0) * 0.93, 0.006, -0.01, 0x2a2e32);
    p.add(new THREE.PlaneGeometry(0.05, 0.03).rotateY(s * Math.PI / 2), s * beam(0.34) * 1.01, gw(0.34) - 0.03, 0.34, WHITE);
    p.add(new THREE.PlaneGeometry(0.03, 0.02).rotateY(s * Math.PI / 2), s * beam(0.34) * 1.012, gw(0.34) - 0.03, 0.34, TEAM_A);
    p.add(new THREE.PlaneGeometry(0.16, 0.012).rotateY(s * Math.PI / 2), s * beam(0.22) * 1.01, gw(0.22) - 0.008, 0.22, TEAM_A);
  }
  // les deux tourelles (avant et arrière), leurs canons, le canon de chasse superposé
  const turret = (z: number, dir: number, y0: number) => {
    p.cyl(0.04, 0.045, 0.032, 10, 0, y0, z, GREY);
    p.box(0.06, 0.03, 0.06, 0, y0 + 0.03, z, GREY);
    p.box(0.062, 0.006, 0.02, 0, y0 + 0.048, z - dir * 0.02, TEAM_A);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.005, 0.006, 0.1, 6).rotateX(Math.PI / 2), s * 0.012, y0 + 0.035, z + dir * 0.075, STEEL);
  };
  turret(0.3, 1, deckAt(0.3)); turret(0.19, 1, deckAt(0.19) + 0.045); turret(-0.36, -1, deckAt(-0.36));
  p.cyl(0.03, 0.034, 0.045, 8, 0, deckAt(0.19), 0.19, GREY_D);
  // la superstructure : rouf, passerelle vitrée, ailerons ; le mât treillis, ses vergues et le radar
  p.box(0.12, 0.07, 0.22, 0, deckAt(0.02) + 0.035, 0.03, GREY);
  p.box(0.1, 0.05, 0.08, 0, deckAt(0.02) + 0.095, 0.08, GREY);
  p.box(0.102, 0.016, 0.004, 0, deckAt(0.02) + 0.105, 0.121, 0x1a2430);
  for (const s of [-1, 1]) { p.box(0.004, 0.016, 0.06, s * 0.051, deckAt(0.02) + 0.105, 0.08, 0x1a2430); p.box(0.05, 0.006, 0.03, s * 0.07, deckAt(0.02) + 0.09, 0.1, GREY); }
  p.box(0.08, 0.008, 0.07, 0, deckAt(0.02) + 0.124, 0.08, GREY_D);
  const mz = 0.02, my = deckAt(0.02) + 0.13;
  for (const [sx, sz] of [[-1, -1], [1, -1], [0, 1]] as [number, number][]) rod(p, [sx * 0.03, my, mz + sz * 0.02], [0, my + 0.2, mz], 0.004, GREY_D);
  p.cyl(0.004, 0.005, 0.12, 5, 0, my + 0.2, mz, GREY_D);
  p.box(0.14, 0.005, 0.005, 0, my + 0.16, mz, GREY_D);
  p.box(0.08, 0.012, 0.016, 0, my + 0.25, mz, 0x3a4048);
  p.box(0.012, 0.03, 0.006, 0, my + 0.29, mz + 0.01, 0x3a4048);
  p.sphere(0.008, 0, my + 0.33, mz, 0xff4030);
  // deux cheminées obliques, cerclées du blason ; les ventilateurs
  for (const z of [-0.07, -0.17]) {
    p.add(new THREE.CylinderGeometry(0.028, 0.032, 0.13, 10).scale(1, 1, 1.4), 0, deckAt(z) + 0.065, z, GREY);
    p.add(new THREE.CylinderGeometry(0.0285, 0.0285, 0.016, 10).scale(1, 1, 1.4), 0, deckAt(z) + 0.12, z, TEAM_A);
    p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 10).scale(1, 1, 1.4), 0, deckAt(z) + 0.132, z, 0x1a1a1c);
    for (const s of [-1, 1]) { p.cyl(0.008, 0.008, 0.03, 6, s * 0.06, deckAt(z), z + 0.03, GREY_D); p.cone(0.011, 0.012, 6, s * 0.06, deckAt(z) + 0.03, z + 0.03, GREY_D); }
  }
  // les tubes lance-torpilles (deux affûts), les grenades anti-sous-marines à la poupe, les embarcations
  for (const z of [-0.12, -0.26]) {
    p.cyl(0.02, 0.022, 0.012, 8, 0, deckAt(z), z, GREY_D);
    for (const s of [-1, 0, 1]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6).rotateZ(Math.PI / 2).rotateY(0.25), s * 0.004, deckAt(z) + 0.02, z + s * 0.014, GREY_D);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) p.cyl(0.008, 0.008, 0.014, 6, s * 0.04, deckAt(-0.47), -0.46 + k * 0.022, 0x3a4048);
    p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 6, 1, false, 0, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.7, 1), s * 0.075, deckAt(-0.04) + 0.05, -0.02, WHITE);
    rod(p, [s * 0.06, deckAt(-0.06), -0.06], [s * 0.085, deckAt(-0.06) + 0.07, -0.06], 0.0025, GREY_D);
  }
  // le garde-corps, les filins, l'ancre, la bouée, l'équipage
  for (const s of [-1, 1]) {
    p.box(0.003, 0.003, 0.62, s * 0.085, deckAt(0) + 0.03, -0.08, STEEL);
    for (let k = 0; k < 8; k++) p.box(0.003, 0.03, 0.003, s * 0.085, deckAt(0) + 0.015, -0.38 + k * 0.085, STEEL);
  }
  anchors(p, gw, beam, 0.42);
  p.add(new THREE.TorusGeometry(0.014, 0.005, 4, 8).rotateY(Math.PI / 2), 0.062, deckAt(0.02) + 0.05, 0.12, 0xe0503a);
  rod(p, [0, my + 0.28, mz], [0, deckAt(0.48) + 0.04, 0.5], 0.0015, ROPE); rod(p, [0, my + 0.28, mz], [0, deckAt(-0.48) + 0.05, -0.5], 0.0015, ROPE);
  for (const [x, z] of [[0.05, 0.36], [-0.04, -0.28], [0.04, -0.44], [-0.05, 0.14]] as [number, number][]) sailor(p, x, deckAt(z), z, 0x2a3446, WHITE);
  sailor(p, 0.02, deckAt(0.02) + 0.124, 0.06, team(TEAM_A, 0.6), WHITE);
  teamFlag(p, deckAt(-0.5) + 0.12, -0.5, 0.08);
  p.cyl(0.003, 0.003, 0.1, 4, 0, deckAt(-0.5), -0.5, STEEL);
  pennant(p, my + 0.33, mz - 0.005, 0.1, TEAM_A);
  return { muzzles: [[0, deckAt(0.3) + 0.035, 0.42], [0, deckAt(0.19) + 0.08, 0.31], [0, deckAt(-0.36) + 0.035, -0.48], [0.07, deckAt(-0.12) + 0.02, -0.12], [-0.07, deckAt(-0.26) + 0.02, -0.26]], funnels: [[0, deckAt(-0.07) + 0.14, -0.07], [0, deckAt(-0.17) + 0.14, -0.17]] };
}

const BLACK_SAIL = 0x26221e, BLACK_SAIL2 = 0x3a332c, PATCH = 0x5a4a3a, BONE = 0xe8e0cc;
/** Pavillon noir à tête de mort, en haut d'un mât */
function jollyRoger(p: Parts, y: number, z: number, w = 0.1) {
  p.box(0.004, w * 0.6, w, 0, y - w * 0.3, z - w / 2, 0x101010);
  p.box(0.006, w * 0.16, w * 0.16, 0, y - w * 0.24, z - w / 2, BONE);
  p.box(0.006, w * 0.05, w * 0.36, 0, y - w * 0.4, z - w / 2, BONE, 0, false, 0.6);
  p.box(0.006, w * 0.05, w * 0.36, 0, y - w * 0.4, z - w / 2, BONE, 0, false, -0.6);
}
/** Une pièce sur une voile (rapiéçage) */
function patch(p: Parts, x: number, y: number, z: number, w: number, h: number, ry = 0) { p.box(0.003, h, w, x, y, z, PATCH, ry); }

/** La caravelle pirate : coque goudronnée, voiles latines noires rapiécées */
function pirateCaravel(p: Parts): Partial<ShipModel> {
  const gw = shipHull(p, { L: 0.84, B: 0.24, depth: 0.08, top: 0.09, bow: 0.06, stern: 0.12, transom: 0.7, fine: 1.2, under: 0x1a1410, side: 0x2e2420, band: 0x6a1e1a, deck: 0x7a6248, inner: 0x2a201a, wales: [0.05], waleCol: 0x1a1410 });
  const beam = gw.beam, deckAt = (z: number) => gw(z) - 0.022;
  // le château arrière bas, fenêtres sombres, lanterne ; les canons volés, dépareillés
  p.box(0.2, 0.05, 0.18, 0, deckAt(-0.32) + 0.025, -0.32, 0x3a2c22);
  p.box(0.2, 0.008, 0.18, 0, deckAt(-0.32) + 0.052, -0.32, 0x7a6248);
  for (let k = 0; k < 3; k++) p.box(0.024, 0.02, 0.004, -0.035 + k * 0.035, gw(-0.42) - 0.02, -0.424, 0xc89a50, 0, true);
  lantern(p, 0, deckAt(-0.32) + 0.06, -0.38);
  const muzzles: V3[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const z = -0.2 + k * 0.12, y = gw(z) - 0.04, x = s * beam(z) * 1.01;
    p.add(new THREE.PlaneGeometry(0.02, 0.018).rotateY(s * Math.PI / 2), x, y, z, 0x0e0c0a);
    p.add(new THREE.CylinderGeometry(0.005, 0.006, 0.024, 5, 1, true).rotateZ(Math.PI / 2), x + s * 0.008, y, z, k % 2 ? 0x6a5030 : IRON);
    if (k % 2) muzzles.push([s * (beam(z) + 0.03), y, z]);
  }
  // le beaupré, trois mâts, voiles latines noires rapiécées, la hune de vigie
  rod(p, [0, gw(0.4), 0.38], [0, 0.25, 0.58], 0.008, DARK);
  const m: [number, number, number][] = [[0.2, 0.7, 0.32], [0.0, 0.82, 0.38], [-0.24, 0.6, 0.28]];
  for (const [z, h, ylen] of m) {
    p.cyl(0.007, 0.011, h, 6, 0, deckAt(z), z, DARK);
    const top: V3 = [0.018, deckAt(z) + h * 0.98, z - ylen * 0.6], bot: V3 = [0.018, deckAt(z) + 0.1, z + ylen * 0.7];
    rod(p, bot, top, 0.005, DARK);
    sail3(p, [0.02, bot[1] + 0.01, bot[2] - 0.01], [0.02, top[1] - 0.01, top[2] + 0.01], [0.016, deckAt(z) + 0.08, z - ylen * 0.45], z > 0.1 ? BLACK_SAIL2 : BLACK_SAIL, 0.045);
    patch(p, 0.05, deckAt(z) + h * 0.45, z - 0.02, 0.05, 0.04, 0.3);
  }
  p.cyl(0.024, 0.018, 0.02, 7, 0, deckAt(0) + 0.6, 0, DARK);
  for (const [z, h] of m) for (const s of [-1, 1]) rod(p, [0, deckAt(z) + h * 0.9, z], [s * beam(z) * 0.97, gw(z), z], 0.0018, ROPE);
  rod(p, [0, 0.82, 0.0], [0, 0.25, 0.58], 0.002, ROPE);
  // le pont : tonneaux, coffre, grappin ; l'équipage dépenaillé, le capitaine au tricorne
  for (const [x, z] of [[0.06, 0.12], [-0.06, 0.1], [0.05, -0.1]]) p.cyl(0.013, 0.013, 0.024, 6, x, deckAt(z), z, WOOD);
  p.box(0.04, 0.024, 0.028, -0.04, deckAt(-0.12) + 0.012, -0.12, 0x5a3a20);
  p.box(0.042, 0.006, 0.03, -0.04, deckAt(-0.12) + 0.026, -0.12, GOLD);
  for (const [x, z, c] of [[0.05, 0.25, 0x8a2a22], [-0.06, 0.0, 0x4a4a3a], [0.04, -0.2, 0x6a5a3a]] as [number, number, number][]) sailor(p, x, deckAt(z), z, c, 0x2a1a1a);
  sailor(p, 0, deckAt(-0.32) + 0.052, -0.34, 0x1a1a1a, 0x1a1a1a);
  jollyRoger(p, deckAt(0) + 0.84, 0, 0.11);
  return { muzzles };
}

/** Le boutre pirate : grande voile latine noire, coque sombre, étrave en bec */
function pirateDhow(p: Parts): Partial<ShipModel> {
  const gw = shipHull(p, { L: 0.8, B: 0.22, depth: 0.07, top: 0.085, bow: 0.12, stern: 0.1, transom: 0.7, fine: 1.2, under: 0x1a1410, side: 0x3a2a1e, band: 0x6a1e1a, deck: 0x7a6248, inner: 0x2a201a });
  const beam = gw.beam, deckAt = (z: number) => gw(z) - 0.022;
  rod(p, [0, 0.11, 0.38], [0, 0.27, 0.52], 0.014, 0x3a2a1e);
  p.sphere(0.012, 0, 0.275, 0.52, BONE);
  const sz = -0.4, sy = gw(sz);
  p.box(0.16, 0.1, 0.012, 0, sy - 0.05, sz - 0.004, 0x2a201a);
  for (let k = 0; k < 2; k++) p.box(0.03, 0.022, 0.006, -0.025 + k * 0.05, sy - 0.03, sz - 0.012, 0xc89a50, 0, true);
  p.box(0.18, 0.01, 0.18, 0, deckAt(-0.3) + 0.03, -0.3, 0x7a6248);
  // le grand mât penché, l'artimon ; voiles latines noires rapiécées
  const m1: V3 = [0, 0.82, 0.15], m2: V3 = [0, 0.52, -0.22];
  rod(p, [0, 0.07, 0.08], m1, 0.01, DARK); rod(p, [0, deckAt(-0.25), -0.25], m2, 0.008, DARK);
  rod(p, [0.02, 0.16, 0.52], [0.02, 0.88, -0.2], 0.007, DARK); rod(p, [0.02, 0.19, -0.04], [0.02, 0.56, -0.46], 0.006, DARK);
  sail3(p, [0.024, 0.17, 0.5], [0.024, 0.86, -0.18], [0.02, 0.13, -0.12], BLACK_SAIL, 0.05, 0x6a1e1a);
  sail3(p, [0.022, 0.2, -0.06], [0.022, 0.54, -0.44], [0.02, deckAt(-0.4) + 0.06, -0.38], BLACK_SAIL2, 0.035);
  patch(p, 0.06, 0.45, 0.12, 0.06, 0.05, 0.4); patch(p, 0.05, 0.36, -0.25, 0.04, 0.035, 0.2);
  for (const s of [-1, 1]) { rod(p, m1, [s * beam(0.05) * 0.97, gw(0.05), 0.05], 0.002, ROPE); rod(p, m2, [s * beam(-0.2) * 0.97, gw(-0.2), -0.2], 0.002, ROPE); }
  rod(p, m1, [0, 0.26, 0.5], 0.002, ROPE);
  // canons de bord, tonneaux, l'équipage
  const muzzles: V3[] = [];
  for (const s of [-1, 1]) for (const z of [-0.12, 0.12]) { deckGun(p, s * 0.07, deckAt(z), z, s); muzzles.push([s * 0.12, deckAt(z) + 0.02, z]); }
  for (const [x, z] of [[0.04, 0.24], [-0.04, 0.26]]) p.cyl(0.012, 0.012, 0.022, 6, x, deckAt(z), z, WOOD);
  for (const [x, z, c] of [[0.04, 0.02, 0x8a2a22], [-0.05, -0.06, 0x4a4a3a], [0, -0.3, 0x1a1a1a]] as [number, number, number][]) sailor(p, x, z < -0.25 ? deckAt(-0.3) + 0.035 : deckAt(z), z, c, 0x2a1a1a);
  jollyRoger(p, 0.6, -0.22, 0.09);
  return { muzzles };
}

export type ShipLook = OurShip | 'pirateCaravel' | 'pirateDhow';
const DRAW: Record<ShipLook, (p: Parts) => Partial<ShipModel>> = { galleon: warGalleon, ironclad, destroyer, pirateCaravel, pirateDhow };

const cache = new Map<ShipLook, ShipModel>();
/** Le modèle d'un de nos navires ou d'un navire pirate (géométries partagées) */
export function ourShipModel(look: ShipLook): ShipModel {
  let m = cache.get(look);
  if (!m) {
    const p = new Parts(), extra = DRAW[look](p), built = p.build(false);
    m = { body: built.body, glow: built.glow, muzzles: extra.muzzles ?? [[0, 0.1, 0.3]], funnels: extra.funnels ?? [] };
    cache.set(look, m);
  }
  return m;
}
/** Le navire pirate de ce rang */
export const pirateLook = (i: number): ShipLook => (i % 2 ? 'pirateDhow' : 'pirateCaravel');
