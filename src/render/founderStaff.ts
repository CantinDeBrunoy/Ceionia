import * as THREE from 'three';
import type { World } from '../world/world';
import { Building, sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { tube } from './festivities';
import type { StaffState } from '../sim/staff';

/**
 * Le bâton du fondateur sur la grande place (voir `docs/lore-enfers.md`) : le bâton que le chef des nomades plante dans le film
 * d'ouverture. Le bâton lui-même ne change pas (bois noueux, tête liée de cuir rouge, deux plumes, une pierre bleue qui luit) ;
 * ce qui l'entoure suit l'âge de la place : planté dans un cercle de pierres (Préhistoire), devant une pierre levée gravée
 * (Antiquité), tenu par des ferrures sur un monument à degrés (Médiéval), dans la main d'une statue de bronze du fondateur
 * (Industriel), sous une vitrine (Moderne), flottant dans un écrin de lumière (Futuriste). Volé : le monument reste, vide, avec
 * la brûlure de la faille aux premiers âges. Comme les trophées, il est posé par-dessus le modèle de la place, à sa place à lui
 */

const WOOD = 0x7a5232, WOOD_D = 0x4e321e, LEATHER = 0x5a3a22, RED = 0xb8402a, STONE_BLUE = 0x3aa8e8, FEATHER = 0xf2ead8, OCHRE_F = 0xd89a3a;

/** La hauteur du bâton seul (repère du modèle) */
export const STAFF_H = 0.4;

/**
 * Le bâton seul, debout, son pied en (x, y, z) ; `k` l'échelle. La pierre du sommet luit (on le repère de loin, même la nuit).
 * Exporté pour la cinématique du vol (le bâton qu'emportent les démons) et pour le sceptre du roi démon
 */
export function staffParts(p: Parts, x = 0, y = 0, z = 0, k = 1) {
  const H = STAFF_H * k, r = 0.011 * k;
  // le fût, à peine tordu (trois tronçons), plus épais au pied
  const pts = [[0, 0, 0], [0.006, 0.34, 0.002], [-0.004, 0.66, -0.003], [0.003, 0.9, 0.001]].map(([a, b, c]) => [x + a * k, y + b * H, z + c * k]);
  for (let i = 0; i < 3; i++) tube(p, pts[i], pts[i + 1], r * (1.25 - i * 0.12), r * (1.13 - i * 0.12), i === 1 ? WOOD : 0x84593a, 6);
  // les nœuds du bois
  for (const [t, a] of [[0.22, 0.4], [0.47, 2.5], [0.6, 4.4]]) p.add(new THREE.IcosahedronGeometry(r * 0.75, 0), x + Math.cos(a) * r * 0.8, y + t * H, z + Math.sin(a) * r * 0.8, WOOD_D);
  // la poignée de cuir, au milieu
  for (let i = 0; i < 4; i++) p.cyl(r * 1.25, r * 1.25, 0.012 * k, 7, x + 0.0045 * k, y + (0.46 + i * 0.035) * H, z, i % 2 ? LEATHER : 0x6a4a2e);
  // la tête : bandes de cuir rouge, la pierre bleue sertie dans une fourche, deux plumes qui pendent, des perles d'os
  const hy = y + 0.9 * H;
  for (let i = 0; i < 3; i++) p.cyl(r * 1.3, r * 1.3, 0.01 * k, 7, x, hy - (0.07 - i * 0.022) * k, z, i === 1 ? 0xe8c060 : RED);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(r * 0.45, r * 0.6, 0.06 * k, 4).translate(0, 0.03 * k, 0), x + s * r * 0.4, hy - 0.01 * k, z, WOOD_D, 0, false, -s * 0.38);
  p.add(new THREE.OctahedronGeometry(0.029 * k, 0).scale(1, 1.3, 1), x, hy + 0.05 * k, z, STONE_BLUE, 0.4, true);
  for (const [s, c] of [[-1, FEATHER], [1, OCHRE_F]] as [number, number][]) {
    p.add(new THREE.ConeGeometry(0.012 * k, 0.085 * k, 4).scale(1, 1, 0.25).rotateZ(Math.PI), x + s * 0.017 * k, hy - 0.06 * k, z + 0.006 * k, c, 0, false, s * 0.22);
    p.add(new THREE.CylinderGeometry(0.0015 * k, 0.0015 * k, 0.03 * k, 3), x + s * 0.012 * k, hy - 0.025 * k, z + 0.006 * k, LEATHER, 0, false, s * 0.3);
  }
  for (const s of [-1, 1]) p.sphere(0.006 * k, x + s * 0.016 * k, hy - 0.035 * k, z - 0.008 * k, 0xece2c8);
}

/** La brûlure laissée par la faille : une tache de cendre déchirée et ses fissures, aux braises éteintes */
function scorch(p: Parts) {
  p.add(new THREE.CylinderGeometry(0.11, 0.12, 0.004, 9), 0, 0.002, 0, 0x2a2220);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4, l = 0.07 + (i % 3) * 0.025;
    p.box(l, 0.005, 0.012, Math.cos(a) * (0.08 + l / 2), 0.002, Math.sin(a) * (0.08 + l / 2), 0x1e1814, -a);
  }
  p.box(0.12, 0.006, 0.01, 0.01, 0.003, 0.0, 0x5a2a1a, 0.5);
}

/** Préhistoire : planté dans un cercle de pierres, sur la terre battue ; peaux, os et une coupe d'offrandes à son pied */
function age0(p: Parts, has: boolean, marks: boolean) {
  p.add(new THREE.CylinderGeometry(0.15, 0.16, 0.006, 10), 0, 0, 0, 0x8a6a4a);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, h = 0.03 + (i % 3) * 0.012;
    p.add(new THREE.DodecahedronGeometry(0.025, 0).scale(1, 1.4, 0.9).translate(0, h * 0.5, 0), Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, i % 2 ? 0x8a857c : 0x6f6a62, a);
  }
  // les pierres de calage serrées au pied
  for (let i = 0; i < 4; i++) p.add(new THREE.IcosahedronGeometry(0.016, 0), Math.cos(i * 1.6) * 0.025, 0.008, Math.sin(i * 1.6) * 0.025, 0x9d978d);
  // la coupe d'offrandes (des baies), un crâne de cerf et ses bois, une peau
  p.cyl(0.022, 0.016, 0.018, 7, 0.06, 0.004, 0.065, 0x8a6a4a); for (let i = 0; i < 4; i++) p.sphere(0.008, 0.055 + (i % 2) * 0.01, 0.024, 0.06 + (i >> 1) * 0.01, 0xa8283a);
  p.add(new THREE.IcosahedronGeometry(0.018, 0).scale(1, 0.8, 1.3), -0.07, 0.012, 0.05, 0xe8dcc0);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.002, 0.003, 0.05, 3).translate(0, 0.025, 0), -0.07 + s * 0.01, 0.02, 0.04, 0xc8b08a, 0, false, s * 0.7);
  p.add(new THREE.BoxGeometry(0.07, 0.004, 0.05), -0.02, 0.006, -0.07, 0x7a5638, 0.4);
  if (!has) { if (marks) scorch(p); return; }
  staffParts(p, 0, 0.004, 0);
  // une lanière de peau peinte nouée à mi-hauteur, qui pend
  p.box(0.004, 0.07, 0.016, 0.014, 0.12, 0.004, 0xc89a5a, 0, false, 0.1);
}

/** Antiquité : une pierre levée gravée de spirales derrière lui, le bâton tenu dans un bloc cerclé de bronze ; des fleurs */
function age1(p: Parts, has: boolean, marks: boolean) {
  // le dallage de pierres plates
  for (const [x, z, r] of [[0, 0, 0.13], [0.09, 0.07, 0.06], [-0.1, 0.06, 0.055]]) p.add(new THREE.CylinderGeometry(r, r * 1.05, 0.012, 7), x, 0, z, 0xd8ccb4, x * 9);
  // la pierre levée : un menhir à peine taillé, les spirales en relief
  p.add(new THREE.BoxGeometry(0.16, 0.33, 0.05).translate(0, 0.165, 0), 0, 0.01, -0.06, 0xb8b0a0, 0.06, false, 0.02);
  p.add(new THREE.BoxGeometry(0.12, 0.04, 0.045).translate(0, 0.02, 0), 0.006, 0.335, -0.06, 0xa8a090, 0.06, false, 0.16);
  // les spirales gravées, de part et d'autre du bâton, et une frise de chevrons en bas
  for (const [x, y, r] of [[-0.045, 0.24, 0.02], [0.045, 0.24, 0.02], [-0.045, 0.15, 0.014], [0.045, 0.15, 0.014]]) p.add(new THREE.TorusGeometry(r, 0.0035, 4, 12, Math.PI * 1.6), x, 0.01 + y, -0.034, 0xe8e0cc, 0.06 + x * 20);
  for (let i = 0; i < 5; i++) p.add(new THREE.BoxGeometry(0.02, 0.004, 0.003), -0.05 + i * 0.025, 0.075, -0.034, 0x8a8478, 0.06, false, i % 2 ? 0.6 : -0.6);
  // une couronne de laurier accrochée au haut de la pierre
  p.add(new THREE.TorusGeometry(0.022, 0.005, 4, 10), 0, 0.3, -0.033, 0x6a8a3a, 0.06);
  // le bloc où il est planté, cerclé de bronze
  p.box(0.06, 0.05, 0.06, 0, 0.012, 0.02, 0xc8c0b0);
  p.box(0.064, 0.008, 0.064, 0, 0.05, 0.02, 0xb08a3a);
  p.box(0.064, 0.006, 0.064, 0, 0.022, 0.02, 0xb08a3a);
  // les offrandes : une jarre, des fleurs, une lampe à huile qui brûle
  p.cyl(0.014, 0.018, 0.04, 7, 0.08, 0.012, 0.05, 0xc87a4a); p.cyl(0.008, 0.014, 0.01, 7, 0.08, 0.052, 0.05, 0xb86a3a);
  for (let i = 0; i < 5; i++) p.sphere(0.007, -0.07 + (i % 3) * 0.012, 0.018, 0.07 + (i >> 1) * 0.01, [0xd84a5a, 0xf2d25a, 0xf4f2ee][i % 3]);
  p.box(0.022, 0.008, 0.014, -0.05, 0.012, -0.0, 0xb08a3a); p.cone(0.005, 0.016, 4, -0.06, 0.02, 0, 0xffb040, true);
  if (!has) { if (marks) { scorch(p); p.box(0.03, 0.004, 0.03, 0, 0.05, 0.02, 0x1e1814); } return; }
  staffParts(p, 0, 0.05, 0.02);
}

/** Médiéval : un monument octogonal à deux degrés, le bâton tenu par deux ferrures contre un pilier ; cierges et lanterne */
function age2(p: Parts, has: boolean, marks: boolean) {
  p.cyl(0.15, 0.16, 0.03, 8, 0, 0, 0, 0xa8a090);
  p.cyl(0.11, 0.115, 0.03, 8, 0, 0.03, 0, 0xb8b0a0);
  // le pilier derrière, chapeauté d'un petit toit de pierre et d'une croix de fer
  p.box(0.06, 0.3, 0.05, 0, 0.06, -0.05, 0xb0a898);
  p.pyramid(0.08, 0.05, 0.07, 0, 0.36, -0.05, 0x8a8478);
  p.box(0.004, 0.04, 0.004, 0, 0.41, -0.05, 0x3a3a3e); p.box(0.024, 0.004, 0.004, 0, 0.433, -0.05, 0x3a3a3e);
  // un écu peint sur le pilier
  p.box(0.034, 0.04, 0.004, 0, 0.27, -0.024, 0x2a4a8a); p.box(0.034, 0.008, 0.005, 0, 0.285, -0.023, 0xe8c060);
  // les ferrures, et les cierges aux quatre côtés
  for (const y of [0.13, 0.27]) { p.box(0.05, 0.008, 0.006, 0, 0.06 + y * 0.9, -0.022, 0x3a3a3e); p.box(0.006, 0.008, 0.03, -0.02, 0.06 + y * 0.9, -0.008, 0x3a3a3e); p.box(0.006, 0.008, 0.03, 0.02, 0.06 + y * 0.9, -0.008, 0x3a3a3e); }
  for (const [x, z] of [[0.11, 0.06], [-0.11, 0.06], [0.09, 0.11], [-0.09, 0.11]]) { p.cyl(0.006, 0.006, 0.03 + Math.abs(x) * 0.1, 5, x, 0.03, z, 0xf2ead8); p.cone(0.004, 0.012, 4, x, 0.06 + Math.abs(x) * 0.1, z, 0xffc050, true); }
  // la lanterne de fer posée sur le degré
  p.box(0.022, 0.03, 0.022, 0.07, 0.06, -0.06, 0x2e2e32); p.box(0.014, 0.018, 0.024, 0.07, 0.066, -0.06, 0xffd27a, 0, true);
  if (!has) {
    // (un crêpe noir noué aux ferrures vides)
    if (marks) p.box(0.04, 0.05, 0.003, 0, 0.2, -0.018, 0x1a1a1e, 0, false, 0.05);
    return;
  }
  staffParts(p, 0, 0.06, -0.008);
  // un fanion aux couleurs du village, noué sous la tête
  p.box(0.05, 0.026, 0.002, 0.03, 0.06 + 0.26, -0.008, 0xc83a3a, 0, false, -0.06);
}

/** Industriel : la statue de bronze du fondateur, manteau et capuchon, qui tient le vrai bâton ; socle de granit, grille */
function age3(p: Parts, has: boolean, marks: boolean) {
  const BR = 0x6a7a5a, BR_D = 0x4a5a42;
  p.box(0.2, 0.02, 0.2, 0, 0, 0, 0x8a847a);
  p.box(0.12, 0.13, 0.12, 0, 0.02, 0, 0x9a9282);
  p.box(0.135, 0.015, 0.135, 0, 0.15, 0, 0x8a8478); p.box(0.135, 0.015, 0.135, 0, 0.02, 0, 0x8a8478);
  // la plaque de bronze (vers +z)
  p.box(0.07, 0.04, 0.004, 0, 0.07, 0.062, 0xb08a3a);
  // le fondateur : manteau, ceinture, tête sous le capuchon, le bras qui tient le bâton
  const y = 0.165;
  p.add(new THREE.CylinderGeometry(0.022, 0.04, 0.12, 8), -0.012, y + 0.06, 0, BR);
  p.add(new THREE.CylinderGeometry(0.02, 0.023, 0.04, 8), -0.012, y + 0.14, 0, BR);
  p.box(0.046, 0.008, 0.036, -0.012, y + 0.105, 0, BR_D);
  p.sphere(0.017, -0.012, y + 0.177, 0.002, BR);
  p.add(new THREE.ConeGeometry(0.024, 0.04, 8).translate(0, 0.02, 0), -0.012, y + 0.168, -0.006, BR_D, 0, false, 0, -0.25);
  p.add(new THREE.CylinderGeometry(0.008, 0.009, 0.07, 5).translate(0, -0.035, 0), 0.008, y + 0.155, 0.006, BR, 0, false, 0.75);
  p.add(new THREE.CylinderGeometry(0.008, 0.009, 0.06, 5).translate(0, -0.03, 0), -0.034, y + 0.15, 0.004, BR, 0, false, -0.2);
  // la grille de fonte autour du socle
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; p.box(0.005, 0.06, 0.005, Math.cos(a) * 0.14, 0.02, Math.sin(a) * 0.14, 0x2e3632); p.sphere(0.006, Math.cos(a) * 0.14, 0.085, Math.sin(a) * 0.14, 0xc8a040); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8, b = a + Math.PI / 4; p.add(new THREE.BoxGeometry(0.11, 0.004, 0.004), (Math.cos(a) + Math.cos(b)) * 0.07, 0.07, (Math.sin(a) + Math.sin(b)) * 0.07, 0x2e3632, -(a + b) / 2 + Math.PI / 2); }
  if (!has) return;
  staffParts(p, 0.045, y, 0.012, 0.9);
}

/** Moderne : le bâton sous une vitrine (arêtes d'acier, verre qui reflète le ciel), un spot au plafond ; un socle de pierre claire */
function age4(p: Parts, has: boolean, marks: boolean) {
  p.box(0.16, 0.08, 0.16, 0, 0, 0, 0xe2ded6);
  p.box(0.168, 0.012, 0.168, 0, 0.08, 0, 0x8a8f96);
  p.box(0.08, 0.025, 0.004, 0, 0.03, 0.081, 0x8a8f96);
  const y = 0.092, h = 0.4, w = 0.075;
  for (const [x, z] of [[-w, -w], [w, -w], [-w, w], [w, w]]) p.box(0.006, h, 0.006, x, y, z, 0xb8bcc4);
  p.box(w * 2 + 0.01, 0.02, w * 2 + 0.01, 0, y + h, 0, 0x5d6168);
  p.box(0.04, 0.004, 0.04, 0, y + h - 0.004, 0, 0xfff1c9, 0, true);
  // le verre : quatre faces très claires, à peine bleutées (les arêtes du fond se voient au travers de la lumière)
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) p.box(w * 2, 0.012, 0.003, Math.sin(r) * w, y + h - 0.02, Math.cos(r) * w, 0xcfe8f2, r);
  // un petit lutrin et son cartel, devant
  p.box(0.004, 0.06, 0.004, 0, 0, 0.13, 0x5d6168); p.add(new THREE.BoxGeometry(0.05, 0.004, 0.035), 0, 0.062, 0.13, 0x2e3438, 0, false, 0, -0.5);
  // deux potelets de laiton et leur cordon rouge, qui tiennent le public à distance
  for (const s of [-1, 1]) { p.cyl(0.012, 0.014, 0.006, 8, s * 0.12, 0, 0.11, 0xb08a3a); p.cyl(0.004, 0.004, 0.08, 5, s * 0.12, 0, 0.11, 0xc8a040); p.sphere(0.007, s * 0.12, 0.082, 0.11, 0xc8a040); }
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.13, 4).rotateZ(Math.PI / 2 + s * 0.18), s * 0.06, 0.068, 0.11, 0xa8202a);
  if (!has) return;
  staffParts(p, 0, y, 0, 0.92);
}

/** Futuriste : le bâton flotte au-dessus d'un socle de nacre, dans une colonne de lumière et ses anneaux */
function age5(p: Parts, has: boolean, marks: boolean) {
  p.cyl(0.13, 0.15, 0.03, 16, 0, 0, 0, 0xf4f6f8);
  p.cyl(0.08, 0.1, 0.05, 16, 0, 0.03, 0, 0xe2e6ec);
  p.box(0.16, 0.004, 0.004, 0, 0.032, 0, 0x40e8ff, 0, 'neon'); p.box(0.004, 0.004, 0.16, 0, 0.032, 0, 0x40e8ff, 0, 'neon');
  p.add(new THREE.TorusGeometry(0.11, 0.004, 4, 24).rotateX(Math.PI / 2), 0, 0.032, 0, 0x40e8ff, 0, 'neon');
  // la colonne de lumière : quatre fines arêtes, les anneaux qui l'entourent
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; p.box(0.003, 0.42, 0.003, Math.cos(a) * 0.06, 0.08, Math.sin(a) * 0.06, 0x9af4ff, 0, 'neon'); }
  for (const y of [0.16, 0.32, 0.48]) p.add(new THREE.TorusGeometry(0.068, 0.003, 4, 20).rotateX(Math.PI / 2), 0, y, 0, 0xc8f8ff, 0, 'neon');
  p.cyl(0.05, 0.05, 0.004, 12, 0, 0.5, 0, 0xe2e6ec);
  if (!has) return;
  staffParts(p, 0, 0.11, 0);
}

const DRAW = [age0, age1, age2, age3, age4, age5];

/**
 * Le monument de cet âge, posé en (0, 0, 0), sa face vers +z ; `has` : avec le bâton ; sans lui, `marks` ajoute les traces du
 * vol (la brûlure de la faille aux premiers âges, un crêpe noir au Médiéval)
 */
export function founderStaffParts(p: Parts, age: number, has: boolean, marks = !has) { DRAW[Math.max(0, Math.min(5, age))](p, has, marks); }

/**
 * La place du bâton sur la grande place, selon l'âge de la place (repère de son modèle, du milieu, en cases) : à l'écart des
 * places des trophées (`trophies.ts`, `SLOTS`) et du décor de chaque âge, du côté que montre la vue d'ensemble
 */
export const STAFF_SLOTS: [number, number][] = [
  [0.66, 0.5], [-0.78, 0.3], [0.4, 0.8], [0.55, 0.94], [0.85, -0.25], [0.78, 0.18],
];

/** L'échelle du monument sur la place : le bâton y fait deux habitants de haut */
export const STAFF_K = 0.8;

/** l'orientation de la vue d'ensemble (voir CameraRig.reset, et `trophies.ts`) */
const VIEW_YAW = 0.75;

/**
 * Le bâton posé sur la grande place : on le refait seulement quand la place change (déplacée, d'un autre âge, le terrain
 * dessous) ou que son état change. `hide` cache le bâton seul (la cinématique du vol l'anime à part), `lift` le fait monter de
 * terre (son retour, à la chute du roi)
 */
export class FounderStaff {
  group = new THREE.Group();
  private key = '';
  private mesh: THREE.Mesh | null = null;
  /** le bâton seul, à part du monument (pour le cacher, le faire monter de terre) */
  private staff: THREE.Mesh | null = null;
  private base = { x: 0, y: 0, z: 0 };
  private dy = 0;
  private hidden = false;
  constructor(private world: World) {}

  /** Où est le bâton dans le monde (son pied) ; null sans grande place */
  where(): { x: number; y: number; z: number; h: number } | null {
    return this.mesh ? { ...this.base, h: STAFF_H * STAFF_K } : null;
  }

  /** Le pied du bâton dans le monde (null : pas de grande place, ou le bâton n'y est pas) */
  staffWorld(): THREE.Vector3 | null {
    if (!this.staff) return null;
    this.group.updateMatrixWorld(true);
    return this.staff.getWorldPosition(new THREE.Vector3());
  }

  /** L'échelle propre du bâton dans le monument de cet âge (la statue et la vitrine le prennent un peu plus petit) */
  staffScale(): number | null { return this.staff ? this.staffK : null; }
  private staffK = 1;
  /** le milieu de la grande place (la faille du vol s'ouvre du côté opposé, loin de son décor) */
  center = { x: 0, z: 0 };

  /** Cache le bâton seul (le monument reste) */
  hide(on: boolean) {
    this.hidden = on;
    if (this.staff) this.staff.visible = !on;
  }

  /** Décale le bâton seul en hauteur (négatif : sous terre) */
  lift(dy: number) {
    this.dy = dy;
    if (this.staff) this.staff.position.y = this.staffY + dy;
  }
  private staffY = 0;

  sync(plaza: Building | null, state: StaffState) {
    const w = this.world, s = plaza ? sizeOf(plaza) : 0;
    const hs: number[] = [];
    if (plaza) for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) hs.push(w.h(plaza.x + i, plaza.z + j));
    const key = plaza ? `${plaza.id}|${plaza.x},${plaza.z}|${plaza.rot}|${plaza.age}|${state}|${hs.map((h) => h.toFixed(3)).join(',')}` : '';
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!plaza) return;
    // la hauteur de la place, comme la posent la vue des bâtiments et les trophées
    hs.sort((a, b) => a - b);
    const lo = hs[0], mid = hs.length >> 1, median = hs.length % 2 ? hs[mid] : (hs[mid - 1] + hs[mid]) / 2;
    const draped = hs[hs.length - 1] - lo > 0.03, flat = Math.max(lo, median - 0.08);
    const cx = plaza.x + s / 2, cz = plaza.z + s / 2, ry = (plaza.rot * Math.PI) / 2;
    const age = Math.max(0, Math.min(5, plaza.age)), [x, z] = STAFF_SLOTS[age];
    const wx = cx + x * Math.cos(ry) + z * Math.sin(ry), wz = cz - x * Math.sin(ry) + z * Math.cos(ry);
    const y = (draped ? w.surfaceAt(wx, wz) : flat) + 0.01;
    // le monument (sans le bâton), et le bâton à part, posé comme dans `founderStaffParts`
    const p = new Parts();
    founderStaffParts(p, age, false, state === 'stolen');
    this.mesh = this.meshOf(p);
    this.mesh.position.set(wx, y, wz);
    this.mesh.rotation.y = VIEW_YAW;
    this.mesh.scale.setScalar(STAFF_K);
    this.group.add(this.mesh);
    this.base = { x: wx, y, z: wz };
    this.center = { x: cx, z: cz };
    if (state === 'stolen') return;
    const q = new Parts();
    this.staffK = age === 3 ? 0.9 : age === 4 ? 0.92 : 1;
    staffParts(q, 0, 0, 0, this.staffK);
    this.staff = this.meshOf(q);
    const [ox, oy, oz] = STAFF_FOOT[age];
    // (le repère du monument tourné de VIEW_YAW)
    this.staffY = oy;
    this.staff.position.set(ox, oy + this.dy, oz);
    this.staff.visible = !this.hidden;
    this.mesh.add(this.staff);
    // à la Préhistoire, la lanière de peau nouée au bâton ; au Médiéval, le fanion : ils suivent le bâton
    if (age === 0 || age === 2) {
      const e = new Parts();
      if (age === 0) e.box(0.004, 0.07, 0.016, 0.014, 0.12 - 0.004, 0.004, 0xc89a5a, 0, false, 0.1);
      else e.box(0.05, 0.026, 0.002, 0.03, 0.26, 0, 0xc83a3a, 0, false, -0.06);
      this.staff.add(this.meshOf(e));
    }
  }

  private meshOf(p: Parts) {
    const { body, glow } = p.build();
    const m = new THREE.Mesh(body, mats.body);
    m.castShadow = m.receiveShadow = true;
    if (glow) m.add(new THREE.Mesh(glow, mats.glow));
    return m;
  }

  private clear() {
    this.mesh = null; this.staff = null;
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((x) => { if (x instanceof THREE.Mesh) x.geometry.dispose(); });
    }
  }
}

/** Le pied du bâton dans chaque monument (repère du monument) : voir les appels de `staffParts` dans `age0` … `age5` */
const STAFF_FOOT: [number, number, number][] = [[0, 0.004, 0], [0, 0.05, 0.02], [0, 0.06, -0.008], [0.045, 0.165, 0.012], [0, 0.092, 0], [0, 0.11, 0]];
