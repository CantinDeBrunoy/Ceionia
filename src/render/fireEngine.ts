import * as THREE from 'three';
import { Parts, Glow } from './parts';

/** Rouge franc de la carrosserie, son ombré, blanc et jaune des bandes réfléchissantes, chrome, pneus, vitres */
export const ENGINE = { red: 0xec3a2c, dred: 0xb8281f, white: 0xf7f5f0, yellow: 0xffcf2e, chrome: 0xdde1e6, steel: 0x9aa3ad, tyre: 0x2a2a30, glass: 0xaedcf2, black: 0x34343a };
const E = ENGINE;

/** Le pied de la grande échelle (repère du camion) : sur sa tourelle, à l'arrière du plateau */
export const LADDER_AT: [number, number, number] = [0, 0.225, -0.17];

type Face = 'x' | '-x' | 'z' | '-z' | 'y';
/** Plaque peinte (deux triangles) tournée vers `dir`, centrée en (x, y, z) : vitres, rideaux, bandes, marquages */
export function decal(p: Parts, w: number, h: number, x: number, y: number, z: number, dir: Face, c: number, glow: Glow = false, ry = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (dir === 'x') g.rotateY(Math.PI / 2); else if (dir === '-x') g.rotateY(-Math.PI / 2); else if (dir === '-z') g.rotateY(Math.PI); else if (dir === 'y') g.rotateX(-Math.PI / 2);
  p.add(g, x, y, z, c, ry, glow);
}

/** Roue : pneu, jante claire, moyeu rouge (l'essieu le long de x) ; `lite` : pneu à six pans et jante peinte sur le flanc */
function wheel(p: Parts, x: number, y: number, z: number, r: number, lite: boolean) {
  p.add(new THREE.CylinderGeometry(r, r, 0.032, lite ? 6 : 12).rotateZ(Math.PI / 2), x, y + r, z, E.tyre);
  const out = Math.sign(x || 1);
  if (lite) { p.add(new THREE.CircleGeometry(r * 0.6, 6).rotateY(out * Math.PI / 2), x + out * 0.0165, y + r, z, E.chrome); return; }
  p.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.034, 10).rotateZ(Math.PI / 2), x, y + r, z, E.chrome);
  p.add(new THREE.CylinderGeometry(r * 0.26, r * 0.26, 0.036, 6).rotateZ(Math.PI / 2), x, y + r, z, E.red);
}

/**
 * Fourgon pompe-tonne de l'époque moderne, tourné vers +z, posé en (x, y, z) : cabine avancée au toit arrondi, grand
 * pare-brise et vitres latérales, calandre et phares, rampe de gyrophares bleu et rouge ; caisse à rideaux clairs, bandes
 * réfléchissantes blanche et jaune tout du long, dévidoir sur le plateau, tourelle de l'échelle ; roues à jantes claires.
 * `flash` : les gyrophares sont des feux à part (qui clignotent, voir `Emergencies`), on n'en note que la place ; sinon
 * (camion garé) ils sont peints et luisent la nuit de leur couleur. `lite` (garé devant la caserne, où le modèle a un
 * plafond de triangles) : quatre roues, ni ailes ni rambardes, l'arrière tourné vers les portes sans ses chevrons. Le
 * camion roulant a tout : trois essieux, ailes, rétroviseurs, rambardes, chevrons et échelle d'accès à l'arrière, lance.
 * Environ 0,16 de large sur 0,45 de long, comme les autres secours
 */
export function fireEngine(p: Parts, x: number, y: number, z: number, flash?: [number, number, number, number][], lite = false) {
  const b = (w: number, h: number, d: number, bx: number, by: number, bz: number, c: number, glow: Glow = false) => p.box(w, h, d, x + bx, y + by, z + bz, c, 0, glow);
  const f = (w: number, h: number, bx: number, by: number, bz: number, dir: Face, c: number, glow: Glow = false) => decal(p, w, h, x + bx, y + by, z + bz, dir, c, glow);
  // châssis, roues (un essieu à l'avant, deux à l'arrière, un seul garé)
  b(0.13, 0.03, 0.42, 0, 0.028, -0.01, E.black);
  for (const wz of lite ? [0.13, -0.13] : [0.13, -0.1, -0.165]) for (const s of [-1, 1]) wheel(p, x + s * 0.072, y, z + wz, 0.04, lite);
  // cabine : bas de caisse, haut vitré, arrondi du toit vers l'avant
  b(0.16, 0.085, 0.145, 0, 0.045, 0.142, E.red);
  b(0.152, 0.065, 0.09, 0, 0.13, 0.115, E.red);
  b(0.152, 0.035, 0.03, 0, 0.13, 0.175, E.red);
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.152, lite ? 3 : 6, 1, false, 0, Math.PI / 2).rotateZ(Math.PI / 2), x, y + 0.165, z + 0.16, E.red);
  p.add(new THREE.PlaneGeometry(0.134, 0.04), x, y + 0.152, z + 0.1915, E.glass, 0, false, 0, -0.12);
  for (const s of [-1, 1]) f(0.075, 0.042, s * 0.0765, 0.155, 0.14, s < 0 ? '-x' : 'x', E.glass);
  // face avant : calandre, phares, pare-chocs chromé ; bandes réfléchissantes autour de la cabine
  f(0.09, 0.035, 0, 0.07, 0.2155, 'z', E.black);
  for (const s of [-1, 1]) f(0.026, 0.018, s * 0.058, 0.101, 0.2155, 'z', 0xfff1c9, true);
  b(0.168, 0.022, 0.016, 0, 0.028, 0.214, E.chrome);
  b(0.164, 0.014, 0.148, 0, 0.072, 0.142, E.white); b(0.164, 0.007, 0.148, 0, 0.064, 0.142, E.yellow);
  // rampe de gyrophares sur le toit
  b(0.12, 0.01, 0.024, 0, 0.195, 0.15, E.black);
  if (flash) flash.push([x - 0.035, y + 0.215, z + 0.15, 0], [x + 0.035, y + 0.215, z + 0.15, 1], [x - 0.06, y + 0.19, z - 0.215, 1], [x + 0.06, y + 0.19, z - 0.215, 0]);
  else for (const s of [-1, 1]) b(0.05, 0.016, 0.022, s * 0.032, 0.205, 0.15, s < 0 ? 0x6ac4ff : 0xff6a5a, 'neon');
  // la caisse, son plateau clair, ses rideaux de coffres et leurs lames, les bandes blanche et jaune jusqu'à l'arrière
  b(0.16, 0.13, 0.295, 0, 0.045, -0.082, E.red);
  f(0.166, 0.3, 0, 0.1755, -0.082, 'y', E.chrome);
  for (const s of [-1, 1]) {
    const side: Face = s < 0 ? '-x' : 'x', sx = s * 0.0812;
    for (const rz of [-0.18, -0.09, 0.0]) {
      f(0.08, 0.065, sx, 0.1305, rz, side, 0xe4e8ec);
      for (let k = 0; k < (lite ? 2 : 4); k++) f(0.08, 0.004, s * 0.0818, (lite ? 0.12 : 0.11) + k * (lite ? 0.022 : 0.014), rz, side, 0xb4bcc6);
    }
    f(0.44, 0.014, s * 0.0812, 0.079, -0.01, side, E.white);
    f(0.44, 0.007, s * 0.0812, 0.0675, -0.01, side, E.yellow);
  }
  // sur le plateau : le dévidoir et son tuyau blanc, la tourelle de l'échelle et son appui sur la cabine
  p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.1, lite ? 6 : 10).rotateZ(Math.PI / 2), x, y + 0.203, z + 0.02, 0xf2ead8);
  p.cyl(0.042, 0.046, 0.022, lite ? 8 : 12, x, y + 0.183, z + LADDER_AT[2], E.steel);
  if (lite) return;
  b(0.012, 0.03, 0.012, 0, 0.195, 0.09, E.steel);
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 10).rotateZ(Math.PI / 2), x + s * 0.054, y + 0.203, z + 0.02, E.red);
    // ailes au-dessus des roues, montant de portière, rétroviseurs, rambarde du plateau
    b(0.02, 0.008, 0.07, s * 0.081, 0.088, 0.13, E.black); b(0.02, 0.008, 0.13, s * 0.081, 0.088, -0.132, E.black);
    b(0.004, 0.07, 0.004, s * 0.0825, 0.05, 0.1, E.dred);
    b(0.006, 0.03, 0.012, s * 0.092, 0.125, 0.19, E.black);
    b(0.004, 0.004, 0.26, s * 0.08, 0.2, -0.09, E.chrome);
    for (const rz of [-0.2, -0.09, 0.02]) b(0.004, 0.02, 0.004, s * 0.08, 0.183, rz, E.chrome);
  }
  for (let k = 0; k < 3; k++) f(0.088, 0.004, 0, 0.06 + k * 0.011, 0.2165, 'z', E.chrome);
  p.add(new THREE.CylinderGeometry(0.005, 0.008, 0.05, 6).rotateX(Math.PI / 2), x + 0.055, y + 0.19, z + 0.075, E.chrome);
  // l'arrière : chevrons rouge et jaune, feux, marchepied, échelle d'accès
  for (let k = 0; k < 6; k++) f(0.026, 0.05, -0.065 + k * 0.026, 0.085, -0.2305, '-z', k % 2 ? E.yellow : E.red);
  for (const s of [-1, 1]) f(0.02, 0.014, s * 0.065, 0.147, -0.2305, '-z', 0xff4a3a, true);
  b(0.15, 0.008, 0.03, 0, 0.032, -0.24, E.chrome);
  for (const s of [-1, 1]) b(0.005, 0.11, 0.005, s * 0.02, 0.07, -0.234, E.chrome);
  for (let k = 0; k < 4; k++) b(0.04, 0.004, 0.005, 0, 0.09 + k * 0.025, -0.234, E.chrome);
}

/**
 * La grande échelle, dans le repère de son pied (sur la tourelle), couchée vers +z : socle pivotant, premier plan large,
 * second plan coulissé dessus, montants clairs, échelons, embout jaune ; `lite` : échelons peints, moins nombreux
 */
export function fireLadder(p: Parts, x = 0, y = 0, z = 0, lite = false) {
  p.box(0.05, 0.02, 0.05, x, y - 0.012, z, E.steel);
  for (const s of [-1, 1]) {
    p.box(0.008, 0.016, 0.2, x + s * 0.034, y, z + 0.1, 0xf4f6f8);
    p.box(0.007, 0.014, 0.2, x + s * 0.027, y + 0.012, z + 0.2, 0xe6eaee);
  }
  if (lite) {
    for (let k = 0; k < 4; k++) decal(p, 0.062, 0.007, x, y + 0.012, z + 0.03 + k * 0.045, 'y', 0xc4cad2);
    for (let k = 0; k < 3; k++) decal(p, 0.048, 0.007, x, y + 0.024, z + 0.17 + k * 0.045, 'y', 0xc4cad2);
  } else {
    for (let k = 0; k < 6; k++) p.box(0.068, 0.005, 0.006, x, y + 0.004, z + 0.02 + k * 0.034, 0xc4cad2);
    for (let k = 0; k < 5; k++) p.box(0.054, 0.005, 0.006, x, y + 0.016, z + 0.13 + k * 0.034, 0xc4cad2);
  }
  p.box(0.06, 0.016, 0.012, x, y + 0.008, z + 0.3, E.yellow);
}
