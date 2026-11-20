import * as THREE from 'three';
import { World, SEA } from '../world/world';
import { Parts } from './parts';
import { TEAM_A, TEAM_B, TEAM_FLAG_R } from './teamPaint';
import { mats } from './materials';
import { Puffs } from './particles';
import { freighter } from './models';
import { rod, sail3, sailor, shipHull, triGeo, type V3 } from './models/orientShips';

/**
 * La circulation en mer : les navires de l'époque qui sortent des chantiers navals (caravelle, galion, vapeur, cargo, navire
 * futuriste à foils) et les bateaux de pêche des halles aux poissons. Chacun gagne le large par le chenal le plus long (la
 * rivière, la côte) en rapetissant à l'horizon, reste quelque temps au loin, puis revient par la même route et se dissout
 * dans la grève. Les navires des ports (voir `Transports`) restent à quai ; ceux-ci ne font que passer
 */
export type VesselKind = 'caravel' | 'galleon' | 'steamer' | 'cargo' | 'hydro';

/** Le navire d'un chantier naval, selon l'âge du village et son rang (le second est un vapeur au premier âge industriel) */
export function merchantKind(age: number, i: number): VesselKind {
  if (age <= 2) return 'caravel';
  if (age === 3) return i % 2 ? 'steamer' : 'galleon';
  if (age === 4) return 'cargo';
  return 'hydro';
}
/** Le bateau de pêche d'une halle aux poissons : un petit voilier, un chalutier à vapeur ou un hydroglisseur */
export function fisherKind(age: number): VesselKind {
  return age <= 2 ? 'caravel' : age === 3 ? 'galleon' : age === 4 ? 'steamer' : 'hydro';
}

const SMOKE = new THREE.Color(0.32, 0.3, 0.3);
const WOOD = 0x7a5236, DARK = 0x5a3e2e, TAR = 0x2e241c, DECK = 0xb08458, PLANK = 0x8a6040, SAIL = 0xf2e6d0, SAIL2 = 0xe6d8bc;
/** le navire en cours de dessin est-il du village (pavillon au blason) ou d'une île rivale (voir `vesselModel`) */
let ours = true;
const RED = 0xb8322c, GOLD = 0xe8c66a, ROPE = 0x4a3a2c, IRON = 0x2a2a2c, PANE = 0xe8b860;
type Hull = ReturnType<typeof shipHull>;

/**
 * Toile tendue sous une vergue (en y = 0), gonflée vers l'avant (+z) : une grille de facettes coupée en `us` × `vs` (de 0 à 1,
 * de bâbord à tribord et du bas à la vergue), dont on garde les cases que choisit `keep`. Faces devant, ou derrière (`rear`)
 */
function canvas(w: number, h: number, belly: number, us: number[], vs: number[], keep: (i: number, j: number) => boolean, rear: boolean) {
  const at = (a: number, b: number): V3 => {
    const u = 2 * a - 1, v = 2 * b - 1;
    // la toile tient à la vergue (peu de creux en haut), le ventre est sous le milieu
    return [(u * w) / 2, (b - 1) * h, belly * (1 - u * u) * (1 - v * v * 0.5) * (1 - Math.max(0, v) * 0.4) - (rear ? 0.0012 : 0)];
  };
  const tris: V3[][] = [];
  for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
    if (!keep(i, j)) continue;
    const a = at(us[i], vs[j]), b = at(us[i + 1], vs[j]), c = at(us[i + 1], vs[j + 1]), d = at(us[i], vs[j + 1]);
    tris.push([a, b, c], [a, c, d]);
  }
  return triGeo(tris, (_c, nn) => (nn.z > 0) !== rear);
}
const PLAIN = [0, 1 / 3, 2 / 3, 1], CROSS_U = [0, 0.22, 0.44, 0.56, 0.78, 1], CROSS_V = [0, 0.27, 0.54, 0.66, 0.83, 1];
/** Voile carrée bombée sous sa vergue (en y) : la toile des deux côtés, la croix peinte des deux côtés, la vergue */
function course(p: Parts, w: number, h: number, y: number, z: number, belly: number, cross?: number) {
  const us = cross === undefined ? PLAIN : CROSS_U, vs = cross === undefined ? PLAIN : CROSS_V;
  const red = (i: number, j: number) => cross !== undefined && (i === 2 || j === 2);
  for (const rear of [false, true]) {
    p.add(canvas(w, h, belly, us, vs, (i, j) => !red(i, j), rear), 0, y, z, rear ? SAIL2 : SAIL);
    if (cross !== undefined) p.add(canvas(w, h, belly, us, vs, red, rear), 0, y, z, cross);
  }
  rod(p, [-w * 0.56, y, z - 0.004], [w * 0.56, y, z - 0.004], 0.0055, DARK);
}

/** Château : un pont surélevé qui épouse la coque de z0 à z1, haut de h, cloison du côté du pont principal, lisse de garde-corps */
function castle(p: Parts, hull: Hull, z0: number, z1: number, h: number, side: number, top: number, aft: boolean, rail = DARK) {
  const n = 3, zs = Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n), sides: V3[][] = [], deck: V3[][] = [];
  for (let i = 0; i < n; i++) {
    const za = zs[i], zb = zs[i + 1], ba = hull.beam(za) * 0.99, bb = hull.beam(zb) * 0.99, ga = hull(za) - 0.02, gb = hull(zb) - 0.02;
    for (const sg of [-1, 1]) sides.push([[sg * ba, ga, za], [sg * ba, ga + h + 0.02, za], [sg * bb, gb + h + 0.02, zb]], [[sg * ba, ga, za], [sg * bb, gb + h + 0.02, zb], [sg * bb, gb, zb]]);
    deck.push([[-ba, ga + h, za], [ba, ga + h, za], [bb, gb + h, zb]], [[-ba, ga + h, za], [bb, gb + h, zb], [-bb, gb + h, zb]]);
  }
  const zw = aft ? z1 : z0, bw = hull.beam(zw) * 0.99, gw = hull(zw) - 0.02;
  const wall: V3[][] = [[[-bw, gw, zw], [bw, gw, zw], [bw, gw + h + 0.02, zw]], [[-bw, gw, zw], [bw, gw + h + 0.02, zw], [-bw, gw + h + 0.02, zw]]];
  p.add(triGeo(sides, (c, nn) => nn.x * c.x > 0), 0, 0, 0, side);
  p.add(triGeo(deck, (_c, nn) => nn.y > 0), 0, 0, 0, top);
  p.add(triGeo(wall, (_c, nn) => (aft ? nn.z > 0 : nn.z < 0)), 0, 0, 0, side);
  for (const sg of [-1, 1]) for (let i = 0; i < n; i++) {
    const za = zs[i], zb = zs[i + 1];
    rod(p, [sg * hull.beam(za) * 0.99, hull(za) + h + 0.006, za], [sg * hull.beam(zb) * 0.99, hull(zb) + h + 0.006, zb], 0.004, rail);
  }
}

/** Haubans : du mât (en y) au flanc, n de chaque bord vers l'arrière, et leurs enfléchures ; le porte-haubans, une planche sur le flanc */
function shrouds(p: Parts, hull: Hull, z: number, y: number, n: number, spread: number) {
  for (const sg of [-1, 1]) {
    const foot = (k: number): V3 => { const zz = z - spread * (k + 0.3); return [sg * hull.beam(zz) * 1.04, hull(zz) - 0.012, zz]; };
    for (let k = 0; k < n; k++) rod(p, [0, y, z], foot(k), 0.0018, ROPE);
    const a = foot(0), b = foot(n - 1), on = (q: V3, f: number): V3 => [q[0] * (1 - f), q[1] + (y - q[1]) * f, q[2] + (z - q[2]) * f];
    for (const f of [0.18, 0.36, 0.54]) rod(p, on(a, f), on(b, f), 0.0012, ROPE);
    const zm = z - spread * (n / 2 - 0.2);
    p.box(0.008, 0.008, spread * n + 0.01, sg * hull.beam(zm) * 1.03, hull(zm) - 0.022, zm, DARK);
  }
}

/** Flamme qui flotte vers l'arrière, en haut d'un mât */
function pennant(p: Parts, y: number, z: number, len: number, col: number) {
  const t: V3[] = [[0, y, z], [0, y - 0.022, z], [0.006, y - 0.016, z - len]];
  p.add(triGeo([t, [t[0], t[2], t[1]]], () => true), 0, 0, 0, col);
}

/**
 * Caravelle « redonda » : coque galbée à liston et préceinte, château arrière à fenêtres et fanal, petit gaillard d'avant,
 * beaupré, grand mât et misaine à voiles carrées gonflées (croix rouge), hunier, artimon latin ; haubans, porte-haubans,
 * gouvernail, tonneaux et matelots. Proue vers +z, flottaison à y = 0
 */
function caravel(p: Parts) {
  const hull = shipHull(p, { L: 0.56, B: 0.17, depth: 0.065, top: 0.055, bow: 0.05, stern: 0.06, transom: 0.68, fine: 1.15, under: TAR, side: WOOD, band: 0xc9a46c, deck: DECK, inner: DARK, wales: [0.04], waleCol: DARK });
  // le château arrière (fenêtres, fanal, gouvernail, porte), le gaillard d'avant
  castle(p, hull, -0.28, -0.13, 0.05, PLANK, DECK, true);
  castle(p, hull, 0.15, 0.24, 0.035, PLANK, DECK, false);
  const sy = hull(-0.28);
  for (const x of [-0.025, 0.025]) p.box(0.018, 0.02, 0.004, x, sy + 0.012, -0.283, PANE);
  p.box(0.08, 0.006, 0.004, 0, sy + 0.036, -0.283, 0xc9a46c);
  p.box(0.016, 0.026, 0.016, 0, sy + 0.032, -0.268, GOLD);
  p.cone(0.013, 0.016, 4, 0, sy + 0.058, -0.268, DARK);
  p.box(0.012, 0.13, 0.03, 0, -0.07, -0.292, DARK);
  p.box(0.024, 0.034, 0.004, 0, hull(-0.13) - 0.02, -0.128, 0x3a2a1e);
  for (const sg of [-1, 1]) p.box(0.004, 0.016, 0.02, sg * hull.beam(-0.2) * 1.0, hull(-0.2) + 0.008, -0.2, PANE);
  // le beaupré, les ancres aux bossoirs
  rod(p, [0, hull(0.24) + 0.02, 0.22], [0, 0.2, 0.42], 0.006, DARK);
  for (const sg of [-1, 1]) p.box(0.006, 0.04, 0.006, sg * hull.beam(0.21) * 1.05, hull(0.21) - 0.07, 0.21, IRON, 0, false, sg * 0.25);
  // les mâts : grand mât, misaine, artimon (sur le château), la hune du grand mât
  const mz = 0.02, fz = 0.17, az = -0.2;
  p.cyl(0.006, 0.009, 0.58, 6, 0, 0.03, mz, DARK);
  p.cyl(0.005, 0.008, 0.36, 6, 0, 0.05, fz, DARK);
  p.cyl(0.004, 0.006, 0.32, 5, 0, hull(az) + 0.02, az, DARK);
  p.cyl(0.02, 0.014, 0.018, 7, 0, 0.465, mz, PLANK);
  // les voiles : grand-voile et misaine à croix rouge, hunier, artimon latin
  course(p, 0.29, 0.2, 0.44, mz + 0.008, 0.04, ours ? TEAM_A : RED);
  course(p, 0.16, 0.075, 0.57, mz + 0.006, 0.02);
  course(p, 0.2, 0.14, 0.37, fz + 0.008, 0.032, ours ? TEAM_A : RED);
  rod(p, [0.012, 0.19, -0.02], [0.012, 0.47, -0.32], 0.0045, DARK);
  sail3(p, [0.014, 0.2, -0.035], [0.014, 0.46, -0.31], [0.012, hull(-0.26) + 0.06, -0.27], SAIL, 0.035);
  // le gréement : haubans, étais, bras de la grand-vergue
  shrouds(p, hull, mz, 0.45, 3, 0.03);
  shrouds(p, hull, fz, 0.36, 2, 0.03);
  rod(p, [0, 0.6, mz], [0, 0.39, fz], 0.0018, ROPE);
  rod(p, [0, 0.39, fz], [0, 0.2, 0.42], 0.0018, ROPE);
  rod(p, [0, 0.6, mz], [0, hull(az) + 0.33, az], 0.0018, ROPE);
  for (const sg of [-1, 1]) rod(p, [sg * 0.16, 0.44, mz], [sg * 0.06, hull(-0.14) + 0.05, -0.14], 0.0015, ROPE);
  // le pont : écoutille, tonneaux, cabestan, deux matelots
  p.box(0.06, 0.012, 0.06, 0, hull(0.08) - 0.024, 0.08, 0x3a2a1e);
  for (const [x, z] of [[0.045, -0.06], [0.05, -0.1], [-0.045, 0.11]]) p.cyl(0.012, 0.013, 0.026, 6, x, hull(z) - 0.022, z, PLANK);
  p.cyl(0.012, 0.016, 0.022, 6, 0, hull(-0.07) - 0.022, -0.07, DARK);
  sailor(p, -0.04, hull(-0.02) - 0.022, -0.02, 0x8a3a2a, SAIL2);
  sailor(p, 0.01, hull(-0.22) + 0.03, -0.22, 0x3a5a8a, RED);
  // pavillon au grand mât (au blason du village pour nos navires), flamme à la misaine
  if (ours) p.box(0.004, 0.035, 0.07, 0, 0.58, mz - 0.035, TEAM_FLAG_R);
  else { p.box(0.004, 0.035, 0.07, 0, 0.58, mz - 0.035, 0x3a6ab8); p.box(0.005, 0.012, 0.07, 0, 0.592, mz - 0.035, GOLD); }
  pennant(p, 0.41, fz, 0.08, ours ? TEAM_A : RED);
}

/**
 * Galion marchand : haute coque sombre à liston d'or, préceintes et sabords, château arrière sur deux étages (galerie de poupe
 * à fenêtres, trois fanaux), gaillard d'avant, éperon et beaupré à civadière ; trois mâts à hunes, voiles carrées gonflées sur
 * deux ou trois étages (croix rouge aux basses voiles), artimon latin ; haubans, étais, chaloupe, matelots
 */
function galleon(p: Parts) {
  const hull = shipHull(p, { L: 0.9, B: 0.25, depth: 0.1, top: 0.085, bow: 0.06, stern: 0.08, transom: 0.74, fine: 1.1, under: TAR, side: 0x4e3424, band: GOLD, deck: DECK, inner: DARK, wales: [0.05, 0.085], waleCol: 0x2e2018 });
  // les sabords et leurs canons, entre les préceintes
  for (const sg of [-1, 1]) for (let k = 0; k < 6; k++) {
    const z = -0.25 + k * 0.085, y = hull(z) - 0.068, x = sg * hull.beam(z) * (0.92 + (0.08 * y) / hull(z)) * 1.012;
    p.add(new THREE.PlaneGeometry(0.022, 0.02).rotateY((sg * Math.PI) / 2), x, y, z, 0x14100c);
    p.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 5, 1, true).rotateZ(Math.PI / 2), x + sg * 0.008, y, z, IRON);
  }
  // le château arrière sur deux étages, le gaillard d'avant
  castle(p, hull, -0.45, -0.2, 0.07, 0x5e3e2a, DECK, true, GOLD);
  castle(p, hull, -0.45, -0.31, 0.135, 0x6a4430, DECK, true, GOLD);
  castle(p, hull, 0.24, 0.38, 0.05, 0x5e3e2a, DECK, false, GOLD);
  for (const sg of [-1, 1]) {
    for (const z of [-0.35, -0.4]) p.box(0.004, 0.024, 0.02, sg * hull.beam(z) * 0.995, hull(z) + 0.07, z, PANE);
    for (const z of [-0.29, -0.25, -0.21]) p.box(0.004, 0.026, 0.026, sg * hull.beam(z) * 0.995, hull(z) + 0.006, z, RED);
    p.box(0.005, 0.006, 0.14, sg * hull.beam(-0.38) * 0.995, hull(-0.38) + 0.056, -0.38, GOLD);
  }
  // la galerie de poupe : fenêtres sur deux rangs, moulures d'or, écusson, trois fanaux, le gouvernail
  const sz = -0.452, sy = hull(-0.45);
  for (const [y, n] of [[sy + 0.015, 4], [sy + 0.085, 3]] as [number, number][]) {
    for (let k = 0; k < n; k++) p.box(0.022, 0.026, 0.004, (k - (n - 1) / 2) * 0.036, y, sz, PANE);
    p.box(0.17, 0.007, 0.006, 0, y - 0.01, sz - 0.001, GOLD);
  }
  p.box(0.05, 0.035, 0.005, 0, sy - 0.045, sz - 0.001, GOLD);
  for (const x of [-0.06, 0, 0.06]) {
    p.box(0.018, 0.03, 0.018, x, sy + 0.12, -0.44, GOLD);
    p.cone(0.014, 0.016, 4, x, sy + 0.15, -0.44, DARK);
  }
  p.box(0.014, 0.17, 0.04, 0, -0.1, -0.465, DARK);
  p.box(0.026, 0.04, 0.004, 0, hull(-0.2) - 0.02, -0.198, 0x2e2018);
  p.box(0.026, 0.04, 0.004, 0, hull(-0.31) + 0.05, -0.308, 0x2e2018);
  // l'éperon, le beaupré, la civadière
  rod(p, [0, hull(0.4) - 0.05, 0.4], [0, hull(0.4) - 0.015, 0.53], 0.012, 0x4e3424);
  rod(p, [0, hull(0.37) + 0.05, 0.36], [0, 0.3, 0.66], 0.008, DARK);
  course(p, 0.16, 0.09, 0.25, 0.58, 0.02);
  // les mâts et leurs hunes
  const fz = 0.25, mz = 0.03, az = -0.27;
  p.cyl(0.008, 0.012, 0.78, 6, 0, 0.06, fz, DARK);
  p.cyl(0.009, 0.014, 0.92, 6, 0, 0.06, mz, DARK);
  p.cyl(0.006, 0.009, 0.5, 5, 0, hull(az) + 0.05, az, DARK);
  for (const [z, y, r] of [[fz, 0.53, 0.026], [mz, 0.61, 0.03], [az, hull(az) + 0.42, 0.018]]) p.cyl(r, r * 0.7, 0.02, 7, 0, y, z, PLANK);
  // les voiles : basses voiles à croix rouge, huniers, perroquet au grand mât ; artimon latin
  course(p, 0.4, 0.22, 0.58, mz + 0.01, 0.05, ours ? TEAM_A : RED);
  course(p, 0.3, 0.16, 0.79, mz + 0.008, 0.035);
  course(p, 0.18, 0.08, 0.94, mz + 0.006, 0.02);
  course(p, 0.34, 0.19, 0.5, fz + 0.01, 0.045, ours ? TEAM_A : RED);
  course(p, 0.26, 0.14, 0.71, fz + 0.008, 0.03);
  rod(p, [0.014, 0.3, -0.12], [0.014, 0.7, -0.46], 0.005, DARK);
  sail3(p, [0.016, 0.31, -0.135], [0.016, 0.69, -0.45], [0.014, hull(-0.42) + 0.17, -0.42], SAIL, 0.04);
  // le gréement : haubans, étais, bras de la grand-vergue
  shrouds(p, hull, mz, 0.61, 4, 0.03);
  shrouds(p, hull, fz, 0.53, 3, 0.03);
  shrouds(p, hull, az, hull(az) + 0.42, 2, 0.025);
  rod(p, [0, 0.97, mz], [0, 0.83, fz], 0.002, ROPE);
  rod(p, [0, 0.61, mz], [0, 0.4, fz], 0.002, ROPE);
  rod(p, [0, 0.83, fz], [0, 0.3, 0.66], 0.002, ROPE);
  rod(p, [0, 0.78, mz], [0, hull(az) + 0.52, az], 0.002, ROPE);
  for (const sg of [-1, 1]) rod(p, [sg * 0.21, 0.58, mz], [sg * 0.08, hull(-0.2) + 0.09, -0.2], 0.0016, ROPE);
  // le pont : chaloupe retournée, écoutille, cabestan, matelots
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6, 1, false, 0, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.6, 1), 0, hull(0.12) - 0.022, 0.13, PLANK);
  p.box(0.07, 0.012, 0.06, 0, hull(-0.08) - 0.024, -0.08, 0x2e2018);
  p.cyl(0.014, 0.018, 0.026, 6, 0, hull(-0.15) - 0.022, -0.15, DARK);
  sailor(p, 0.06, hull(0) - 0.022, 0, 0x8a3a2a, SAIL2);
  sailor(p, -0.05, hull(-0.12) - 0.022, -0.12, 0x3a5a8a, RED);
  sailor(p, 0.02, hull(-0.4) + 0.115, -0.4, 0x2e2018, GOLD);
  // pavillon au grand mât (au blason du village pour nos navires), flammes à la misaine et à l'artimon
  if (ours) p.box(0.004, 0.05, 0.09, 0, 0.96, mz - 0.045, TEAM_FLAG_R);
  else { p.box(0.004, 0.05, 0.09, 0, 0.96, mz - 0.045, RED); p.box(0.005, 0.016, 0.09, 0, 0.977, mz - 0.045, GOLD); }
  pennant(p, 0.82, fz, 0.12, ours ? TEAM_A : RED);
  pennant(p, hull(az) + 0.55, az, 0.09, ours ? TEAM_B : GOLD);
}

/** Ajoute à `p` ce que dessine `make`, décalé de x (un flotteur de catamaran) */
function offsetX(p: Parts, x: number, make: (q: Parts) => void) {
  const q = new Parts();
  make(q);
  for (const g of q.body) p.body.push(g.translate(x, 0, 0));
  for (const g of q.glow) p.glow.push(g.translate(x, 0, 0));
}
/** Tronc de pyramide à base rectangulaire w × d, haut de h, le sommet réduit à `k` (une cabine, un rouf), posé en y */
function frustum(p: Parts, w: number, h: number, d: number, k: number, x: number, y: number, z: number, col: number) {
  p.add(new THREE.CylinderGeometry(k, 1, 1, 4, 1).rotateY(Math.PI / 4).scale(w / Math.SQRT2, h, d / Math.SQRT2).translate(0, h / 2, 0), x, y, z, col);
}

const PEARL = 0xf2f6fa, MIST = 0xdde8f0, STEEL = 0xaeb8c4, NEON = 0x6ae4ff, GLASS = 0x24506e, NAVY = 0x2a4a8a;
/**
 * Navire futuriste : deux coques fines et blanches à liseré lumineux (étrave haute, carène sombre), pont en losange qui les
 * relie, cabine effilée sous sa verrière, aire d'envol à l'avant, mât de radar et antennes, aileron arrière, deux nacelles de
 * propulsion, et les foils (jambes et ailes) sous la flottaison. Les liserés sont des couleurs du corps : le modèle des navires
 * ne garde pas les lumières
 */
function hydrofoil(p: Parts) {
  for (const s of [-1, 1]) offsetX(p, s * 0.12, (q) => shipHull(q, { L: 0.72, B: 0.085, depth: 0.045, top: 0.06, bow: 0.045, stern: 0, transom: 0.55, fine: 1.8, under: 0x2a3440, side: PEARL, band: NEON, deck: MIST, inner: STEEL }));
  // le pont qui relie les coques, sa bordure lumineuse
  p.add(new THREE.CylinderGeometry(1, 1, 1, 6).scale(0.2, 0.024, 0.32), 0, 0.068, -0.04, MIST);
  p.add(new THREE.CylinderGeometry(1.015, 1.015, 1, 6).scale(0.2, 0.008, 0.32), 0, 0.058, -0.04, NEON);
  // l'aire d'envol, à l'avant
  p.add(new THREE.CircleGeometry(0.06, 10).rotateX(-Math.PI / 2), 0, 0.0812, 0.12, NAVY);
  p.add(new THREE.RingGeometry(0.048, 0.054, 10).rotateX(-Math.PI / 2), 0, 0.0816, 0.12, NEON);
  p.box(0.008, 0.001, 0.05, -0.015, 0.0814, 0.12, PEARL); p.box(0.008, 0.001, 0.05, 0.015, 0.0814, 0.12, PEARL); p.box(0.03, 0.001, 0.008, 0, 0.0814, 0.12, PEARL);
  // la cabine effilée, sa verrière, la bande lumineuse à sa base, les hublots
  frustum(p, 0.2, 0.07, 0.28, 0.72, 0, 0.08, -0.08, PEARL);
  p.add(new THREE.IcosahedronGeometry(1, 1).scale(0.07, 0.042, 0.11), 0, 0.15, -0.05, GLASS);
  p.box(0.205, 0.008, 0.285, 0, 0.08, -0.08, NEON);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) p.box(0.004, 0.012, 0.022, s * 0.088, 0.115, -0.17 + k * 0.045, GLASS);
  // le mât de radar, l'antenne qui tourne (figée), le feu rouge, deux fouets
  p.cyl(0.005, 0.009, 0.22, 5, 0, 0.15, -0.16, STEEL);
  p.box(0.09, 0.008, 0.014, 0, 0.3, -0.16, NAVY);
  p.sphere(0.012, 0, 0.38, -0.16, 0xff3a2a);
  for (const s of [-1, 1]) rod(p, [s * 0.05, 0.15, -0.2], [s * 0.07, 0.32, -0.22], 0.0018, STEEL);
  // l'aileron arrière sur deux jambes, liseré
  for (const s of [-1, 1]) p.box(0.008, 0.07, 0.03, s * 0.1, 0.08, -0.3, NAVY, 0, false, s * 0.12);
  p.box(0.27, 0.01, 0.06, 0, 0.15, -0.3, NAVY);
  p.box(0.27, 0.004, 0.006, 0, 0.16, -0.272, NEON);
  // les nacelles de propulsion au bout des coques, leur anneau lumineux
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.022, 0.026, 0.09, 8).rotateX(Math.PI / 2), s * 0.12, 0.03, -0.38, STEEL);
    p.add(new THREE.CylinderGeometry(0.027, 0.027, 0.008, 8).rotateX(Math.PI / 2), s * 0.12, 0.03, -0.426, NEON);
    p.box(0.01, 0.006, 0.01, s * 0.12, 0.072, 0.34, NEON);
  }
  // les foils : deux jambes par coque, une aile à l'avant, une à l'arrière, en dièdre
  for (const s of [-1, 1]) for (const z of [0.2, -0.24]) p.box(0.01, 0.09, 0.034, s * 0.12, -0.12, z, STEEL);
  for (const [z, w] of [[0.2, 0.2], [-0.24, 0.17]]) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(w, 0.006, 0.05), s * w / 2 * 0.98, -0.12 + w * 0.06, z, STEEL, 0, false, s * 0.12);
}

const BUILD: Record<VesselKind, (p: Parts) => [number, number, number] | null> = {
  caravel: (p) => { caravel(p); return null; },
  galleon: (p) => { galleon(p); return null; },
  steamer: (p) => freighter(p, 3, ours),
  cargo: (p) => freighter(p, 4, ours),
  hydro: (p) => { hydrofoil(p); return null; },
};
const vessels = new Map<string, { geo: THREE.BufferGeometry; funnel: [number, number, number] | null }>();
/**
 * Le modèle d'un navire de commerce (géométrie partagée, et la bouche de sa cheminée s'il en a une) : sert aussi au commerce
 * entre les îles rivales (`ours` faux : leurs navires ne portent pas le pavillon du village)
 */
export function vesselModel(kind: VesselKind, mine = true) {
  const key = `${kind}|${mine ? 1 : 0}`;
  let g = vessels.get(key);
  if (!g) { ours = mine; const p = new Parts(); const f = BUILD[kind](p); ours = true; g = { geo: p.build(false).body, funnel: f }; vessels.set(key, g); }
  return g;
}
/** Vitesse (cases par seconde) : la voile est lente, le vapeur plus vif, le cargo et le navire à foils filent */
const SPEED: Record<VesselKind, number> = { caravel: 1.1, galleon: 1, steamer: 1.6, cargo: 2, hydro: 3 };

interface Vessel {
  root: THREE.Group;
  kind: VesselKind;
  funnel: THREE.Vector3 | null;
  state: 'wait' | 'out' | 'away' | 'in';
  t: number;
  /** distance parcourue le long du chemin, en points (un tous les demi-cases) */
  s: number;
  heading: number;
  size: number;
}
interface Lane {
  key: string;
  path: THREE.Vector3[];
  vessels: Vessel[];
}

/**
 * Échelle des navires (voir docs/trafic.md, « Échelle ») : un habitant fait 0,19 case ; la caravelle d'un chantier fait ainsi
 * ~1,2 case de long, comme celle des expéditions, le galion ~1,8 ; les bateaux de pêche sont plus petits
 */
const YARD_SIZE = 1.6, FISH_SIZE = 0.9;

/** Au départ et au bout de son chemin (huit points : quatre cases), le navire rapetisse : il se fond dans l'horizon ou la grève */
const FADE = 8;
/** Eau où l'on appareille : la moindre eau près du quai (comme `shipRoute`) */
const NAV = -0.08;
const SEARCH = 9;

export class SeaTraffic {
  group = new THREE.Group();
  private lanes = new Map<number, Lane>();
  private smoke = new Puffs(80, 0);
  private v = new THREE.Vector3();
  private clock = 0;

  /** `route` : le chenal depuis un poste d'amarrage (voir `shipRoute`) */
  constructor(private world: World, private route: (w: World, berth: [number, number], fx: number, fz: number) => [number, number][]) {
    this.group.add(this.smoke.mesh);
  }

  /** L'eau la plus proche de l'emprise (x, z, s × s), à `SEARCH` cases au plus : son centre et la direction qui y mène */
  private waterNear(x: number, z: number, s: number): { at: [number, number]; f: [number, number] } | null {
    const w = this.world, mx = x + s / 2, mz = z + s / 2;
    let best = Infinity, at: [number, number] | null = null;
    for (let cz = Math.floor(mz) - SEARCH; cz <= Math.floor(mz) + SEARCH; cz++)
      for (let cx = Math.floor(mx) - SEARCH; cx <= Math.floor(mx) + SEARCH; cx++) {
        if (!w.inCells(cx, cz) || !(w.lake[w.ci(cx, cz)] === 1 || w.cellAvg(cx, cz) < NAV)) continue;
        const d = Math.hypot(cx + 0.5 - mx, cz + 0.5 - mz);
        if (d < best) { best = d; at = [cx + 0.5, cz + 0.5]; }
      }
    if (!at) return null;
    const dx = at[0] - mx, dz = at[1] - mz, l = Math.hypot(dx, dz) || 1;
    return { at, f: [dx / l, dz / l] };
  }

  private waterY(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    if (!w.inCells(cx, cz)) return SEA;
    const k = w.ci(cx, cz);
    return w.lake[k] ? w.lakeLevel[k] : SEA;
  }

  private geoOf(kind: VesselKind) { return vesselModel(kind); }

  private makeVessel(kind: VesselKind, size: number, t: number): Vessel {
    const g = this.geoOf(kind), root = new THREE.Group(), mesh = new THREE.Mesh(g.geo, mats.body);
    mesh.castShadow = true;
    root.add(mesh);
    root.visible = false;
    root.scale.setScalar(size);
    this.group.add(root);
    return { root, kind, funnel: g.funnel ? new THREE.Vector3(...g.funnel) : null, state: 'wait', t, s: 0, heading: 0, size };
  }

  private dropLane(l: Lane) { for (const v of l.vessels) this.group.remove(v.root); }

  /**
   * Chaque chantier naval arme deux navires de l'époque, chaque halle aux poissons un bateau de pêche ; le chenal se refait quand
   * le terrain change (visVersion) ou que l'âge change le navire
   */
  update(dt: number, age: number) {
    const w = this.world, live = new Set<number>();
    this.clock += dt;
    for (const b of w.buildings.values()) {
      const yard = b.kind === 'shipyard', market = b.kind === 'fishmarket';
      if ((!yard && !market) || age < 2) continue;
      live.add(b.id);
      const a = Math.min(5, age), key = `${b.x}|${b.z}|${a}|${w.visVersion}`;
      let lane = this.lanes.get(b.id);
      if (lane && lane.key !== key) { this.dropLane(lane); this.lanes.delete(b.id); lane = undefined; }
      if (!lane) {
        lane = { key, path: [], vessels: [] };
        this.lanes.set(b.id, lane);
        const s = yard ? 3 : 2, near = this.waterNear(b.x, b.z, s);
        const path = near ? this.route(w, near.at, near.f[0], near.f[1]).map(([x, z]) => new THREE.Vector3(x, 0, z)) : [];
        // un chenal trop court n'a pas de navire : rien à voir partir
        if (path.length > 12) {
          lane.path = path;
          const kinds = yard ? [merchantKind(a, 0), merchantKind(a, 1)] : [fisherKind(a)];
          kinds.forEach((k, i) => lane!.vessels.push(this.makeVessel(k, yard ? YARD_SIZE : FISH_SIZE, 4 + i * 22 + (b.id % 5) * 3)));
        }
      }
      for (const v of lane.vessels) this.step(v, lane.path, b.id, dt);
    }
    for (const [id, lane] of this.lanes) if (!live.has(id)) { this.dropLane(lane); this.lanes.delete(id); }
    this.smoke.update(dt);
  }

  private step(v: Vessel, path: THREE.Vector3[], id: number, dt: number) {
    const L = path.length - 1;
    v.t -= dt;
    if (v.state === 'wait') { if (v.t <= 0) { v.state = 'out'; v.s = 0; v.root.visible = true; } }
    else if (v.state === 'out' || v.state === 'in') {
      v.s += dt * SPEED[v.kind] * 2 * (v.state === 'out' ? 1 : -1);
      if (v.state === 'out' && v.s >= L) { v.state = 'away'; v.t = 14 + Math.random() * 26; v.root.visible = false; }
      if (v.state === 'in' && v.s <= 0) { v.state = 'wait'; v.t = 16 + Math.random() * 24; v.root.visible = false; }
    } else if (v.t <= 0) { v.state = 'in'; v.s = L; v.root.visible = true; }
    if (!v.root.visible) return;
    const i = Math.max(0, Math.min(L - 1, Math.floor(v.s))), f = Math.max(0, Math.min(1, v.s - i));
    const a = path[i], c = path[Math.min(L, i + 1)];
    this.v.lerpVectors(a, c, f);
    // cap : dans l'axe du chenal, proue vers où il va (au retour, vers la grève)
    const away = Math.atan2(c.x - a.x, c.z - a.z), want = v.state === 'in' ? away + Math.PI : away;
    const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    v.heading += wrap(want - v.heading) * Math.min(1, dt * 1.5);
    // il sort de la grève en grandissant, et se fond à l'horizon
    const k = Math.max(0.001, Math.min(1, v.s / FADE, (L - v.s) / FADE));
    v.root.scale.setScalar(v.size * k);
    const t = this.clock;
    v.root.position.set(this.v.x, this.waterY(this.v.x, this.v.z) + Math.sin(t * 1.1 + id) * 0.006, this.v.z);
    v.root.rotation.set(Math.sin(t * 0.8 + id) * 0.01, v.heading, Math.sin(t * 0.9 + id * 2) * 0.015);
    if (v.funnel && Math.random() < dt * 7) {
      v.root.updateMatrixWorld();
      const q = v.funnel.clone().applyMatrix4(v.root.matrixWorld);
      this.smoke.spawn(q.x, q.y, q.z, 0, 0.35, 0, 0.06, 3.5, SMOKE, 0, { grow: 3, drag: 0.2, wind: 0.25, alpha: 0.6 });
    }
  }
}
