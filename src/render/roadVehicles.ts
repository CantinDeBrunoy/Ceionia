import * as THREE from 'three';
import { Parts } from './parts';
import { shipHull, rod, sail3, V3 } from './models/orientShips';

/**
 * Les voitures du trafic (âges industriel et moderne), la barque des pêcheurs et le voilier du large (voir `traffic.ts`).
 * Avant = +z, sol à y = 0 (la flottaison pour les bateaux). Caisses tirées d'un profil de côté extrudé à arêtes chanfreinées,
 * passages de roue découpés dedans ; roues à jante, phares et feux arrière qui luisent la nuit
 */

export type Geo = { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null };

const TYRE = 0x26262a, RIM = 0xc8ccd2, CHROME = 0xd8dde2, GLASS = 0x2a3a4e, DARK = 0x2e3034, PLATE = 0xf2f0e8;
const LAMP = 0xfff1c9, TAIL = 0xff3a2a, SKIN = 0xe8b894, BRASS = 0xd8a840, LEATHER = 0x6a3e2a;

/**
 * Profil de côté (points (z, y), sens quelconque) extrudé sur la largeur `w`, centré en x, arêtes chanfreinées de `bev`
 */
function side(pts: [number, number][], w: number, bev = 0.006) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, w - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * 0.7, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(w - 2 * bev) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/** Bord bas d'une caisse, de l'arrière (z0) à l'avant (z1) à la hauteur y, avec un passage de roue (demi-cercle de rayon r) sur chaque essieu */
function sill(z0: number, z1: number, y: number, axles: number[], r: number): [number, number][] {
  const out: [number, number][] = [[z0, y]];
  for (const a of [...axles].sort((u, v) => u - v)) {
    for (let k = 0; k <= 6; k++) { const t = Math.PI - (k / 6) * Math.PI; out.push([a + Math.cos(t) * r, Math.max(y, y - 0.004 + Math.sin(t) * r)]); }
  }
  out.push([z1, y]);
  return out;
}

/** Roue moderne : pneu, jante, enjoliveur ; essieu en (x, r, z) */
function wheel(p: Parts, x: number, z: number, r: number, w = 0.028, rim = RIM) {
  const s = Math.sign(x);
  p.add(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2), x, r, z, TYRE);
  p.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.004, 8).rotateZ(Math.PI / 2), x + s * (w / 2 + 0.001), r, z, rim);
  p.add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.004, 6).rotateZ(Math.PI / 2), x + s * (w / 2 + 0.003), r, z, DARK);
}

/** Roue à rayons d'une voiture ancienne : bandage, jante, six rayons, moyeu de laiton */
function spokedWheel(p: Parts, x: number, z: number, r: number, spoke: number) {
  const s = Math.sign(x);
  p.add(new THREE.TorusGeometry(r * 0.86, r * 0.16, 4, 12).rotateY(Math.PI / 2), x, r, z, TYRE);
  p.add(new THREE.TorusGeometry(r * 0.68, r * 0.05, 3, 12).rotateY(Math.PI / 2), x, r, z, spoke);
  for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.004, r * 1.36, 0.004), x, r, z, spoke, 0, false, 0, (k * Math.PI) / 3);
  p.add(new THREE.CylinderGeometry(r * 0.18, r * 0.18, 0.02, 6).rotateZ(Math.PI / 2), x + s * 0.004, r, z, BRASS);
}

/** Pare-chocs, calandre, phares et feux, plaques ; `zf` / `zr` : bouts avant et arrière, `y` : hauteur du pare-chocs */
function ends(p: Parts, w: number, zf: number, zr: number, y: number, lampY: number, lampX: number, grille = DARK) {
  p.box(w + 0.006, 0.018, 0.016, 0, y, zf, DARK);
  p.box(w + 0.006, 0.018, 0.016, 0, y, zr, DARK);
  p.box(w * 0.42, 0.022, 0.006, 0, lampY - 0.012, zf + 0.004, grille);
  p.box(w * 0.4, 0.003, 0.007, 0, lampY - 0.001, zf + 0.004, CHROME);
  for (const s of [-1, 1]) {
    p.box(0.03, 0.014, 0.006, s * lampX, lampY, zf + 0.002, LAMP, 0, true);
    p.box(0.024, 0.016, 0.006, s * lampX, lampY, zr - 0.002, TAIL, 0, true);
    p.box(0.008, 0.008, 0.006, s * (lampX - 0.02), lampY + 0.002, zr - 0.002, 0xf0a030);
  }
  p.box(0.036, 0.012, 0.004, 0, y + 0.002, zf + 0.009, PLATE);
  p.box(0.036, 0.012, 0.004, 0, y + 0.018, zr - 0.009, PLATE);
}

/** Rétroviseurs, poignées et joints des portières (`doors` : leurs bords en z), sur les deux flancs à la demi-largeur `hw` */
function doorsAndMirrors(p: Parts, hw: number, doors: number[], y0: number, y1: number, mirror: [number, number], body: number) {
  for (const s of [-1, 1]) {
    for (const z of doors) p.box(0.003, y1 - y0, 0.003, s * (hw + 0.001), y0, z, DARK);
    for (let i = 0; i + 1 < doors.length; i++) p.box(0.004, 0.004, 0.014, s * (hw + 0.002), y1 - 0.018, doors[i + 1] - 0.018, CHROME);
    p.box(0.016, 0.012, 0.008, s * (hw + 0.008), mirror[1], mirror[0], body);
    p.box(0.003, 0.009, 0.006, s * (hw + 0.016), mirror[1] + 0.001, mirror[0] - 0.003, GLASS);
  }
}

/**
 * Berline moderne : malle à l'arrière, capot plongeant, pavillon à montants, vitres teintées ; jantes claires,
 * baguette chromée au flanc
 */
function sedan(color: number, trim = CHROME): Geo {
  const p = new Parts(), W = 0.15, r = 0.034, ax = [-0.095, 0.098];
  const low: [number, number][] = [...sill(-0.152, 0.152, 0.026, ax, r + 0.008), [0.156, 0.06], [0.148, 0.08], [0.06, 0.098], [-0.1, 0.102], [-0.15, 0.096], [-0.156, 0.06]];
  p.add(side(low, W), 0, 0, 0, color);
  // l'habitacle : vitres, puis le pavillon et ses montants de la couleur de la caisse
  p.add(side([[0.06, 0.098], [0.008, 0.15], [-0.07, 0.152], [-0.104, 0.102]], W - 0.02, 0.004), 0, 0, 0, GLASS);
  p.add(side([[0.012, 0.148], [-0.068, 0.15], [-0.07, 0.158], [0.008, 0.156]], W - 0.016, 0.003), 0, 0, 0, color);
  for (const s of [-1, 1]) {
    rod(p, [s * 0.064, 0.098, 0.06], [s * 0.062, 0.152, 0.01], 0.004, color);
    p.box(0.008, 0.052, 0.01, s * 0.065, 0.1, -0.028, color);
    rod(p, [s * 0.064, 0.1, -0.104], [s * 0.062, 0.152, -0.068], 0.005, color);
    p.box(0.003, 0.005, 0.2, s * 0.0765, 0.072, -0.004, trim);
  }
  ends(p, W, 0.156, -0.157, 0.034, 0.074, 0.048);
  doorsAndMirrors(p, 0.075, [0.055, -0.028, -0.1], 0.036, 0.098, [0.05, 0.104], color);
  for (const z of ax) for (const s of [-1, 1]) wheel(p, s * 0.064, z, r);
  p.cyl(0.001, 0.001, 0.05, 3, -0.05, 0.155, -0.06, DARK);
  return p.build(false);
}

/** Citadine à hayon : courte, haute, lunette arrière presque droite, barres de toit */
function hatch(color: number): Geo {
  const p = new Parts(), W = 0.146, r = 0.032, ax = [-0.08, 0.085];
  const low: [number, number][] = [...sill(-0.128, 0.134, 0.026, ax, r + 0.008), [0.138, 0.058], [0.13, 0.08], [0.05, 0.1], [-0.124, 0.104], [-0.132, 0.06]];
  p.add(side(low, W), 0, 0, 0, color);
  p.add(side([[0.05, 0.1], [0.0, 0.156], [-0.112, 0.158], [-0.126, 0.104]], W - 0.02, 0.004), 0, 0, 0, GLASS);
  p.add(side([[0.004, 0.154], [-0.11, 0.156], [-0.112, 0.164], [0.0, 0.162]], W - 0.016, 0.003), 0, 0, 0, color);
  for (const s of [-1, 1]) {
    rod(p, [s * 0.063, 0.1, 0.05], [s * 0.061, 0.156, 0.002], 0.004, color);
    p.box(0.008, 0.056, 0.012, s * 0.064, 0.102, -0.04, color);
    p.box(0.008, 0.056, 0.016, s * 0.064, 0.102, -0.116, color);
    p.box(0.004, 0.006, 0.1, s * 0.05, 0.166, -0.055, DARK);
  }
  ends(p, W, 0.138, -0.133, 0.032, 0.072, 0.046);
  doorsAndMirrors(p, 0.073, [0.048, -0.04], 0.034, 0.1, [0.042, 0.106], color);
  for (const z of ax) for (const s of [-1, 1]) wheel(p, s * 0.062, z, r, 0.026, DARK);
  return p.build(false);
}

/** Fourgonnette de livraison : caisse haute, capot court, bandeau et enseigne au flanc, échelle et galerie sur le toit */
function van(color: number, band: number, sign: number): Geo {
  const p = new Parts(), W = 0.15, r = 0.034, ax = [-0.1, 0.1];
  const low: [number, number][] = [...sill(-0.162, 0.162, 0.028, ax, r + 0.008), [0.166, 0.07], [0.156, 0.092], [0.112, 0.106], [0.07, 0.19], [-0.16, 0.192], [-0.166, 0.06]];
  p.add(side(low, W), 0, 0, 0, color);
  // pare-brise, vitres de la cabine ; le reste est tôlé
  p.add(new THREE.BoxGeometry(W - 0.02, 0.07, 0.004), 0, 0.146, 0.092, GLASS, 0, false, 0, -0.55);
  for (const s of [-1, 1]) {
    p.add(side([[0.104, 0.11], [0.072, 0.176], [0.03, 0.176], [0.03, 0.11]], 0.004, 0), s * 0.0755, 0, 0, GLASS);
    p.box(0.003, 0.03, 0.17, s * 0.0765, 0.1, -0.06, band);
    p.box(0.003, 0.036, 0.07, s * 0.0768, 0.136, -0.06, sign);
    p.box(0.003, 0.02, 0.05, s * 0.0772, 0.144, -0.06, 0xf8f6f0);
    p.box(0.004, 0.16, 0.003, s * 0.0765, 0.03, -0.163, DARK);
  }
  ends(p, W, 0.166, -0.167, 0.036, 0.08, 0.05);
  // portes arrière à deux battants
  p.box(0.003, 0.15, 0.004, 0, 0.034, -0.167, DARK);
  for (const s of [-1, 1]) p.box(0.04, 0.05, 0.003, s * 0.03, 0.13, -0.167, GLASS);
  doorsAndMirrors(p, 0.075, [0.104, 0.028], 0.04, 0.17, [0.1, 0.12], color);
  // galerie et échelle
  for (const z of [-0.12, -0.04, 0.04]) p.box(0.13, 0.006, 0.006, 0, 0.196, z, DARK);
  for (const s of [-1, 1]) p.box(0.004, 0.006, 0.18, s * 0.064, 0.198, -0.04, DARK);
  p.box(0.07, 0.014, 0.05, -0.01, 0.2, -0.08, 0xc8a070);
  for (let k = 0; k < 5; k++) p.box(0.026, 0.004, 0.003, -0.05, 0.05 + k * 0.03, -0.169, DARK);
  for (const s of [-1, 1]) p.box(0.003, 0.15, 0.004, -0.05 + s * 0.013, 0.05, -0.169, DARK);
  for (const z of ax) for (const s of [-1, 1]) wheel(p, s * 0.064, z, r);
  return p.build(false);
}

/** Pick-up : cabine double, plateau ouvert à ridelles, chargement (caisses, sacs, bidon), arceau, phares de toit */
function pickup(color: number): Geo {
  const p = new Parts(), W = 0.15, r = 0.036, ax = [-0.11, 0.1];
  const low: [number, number][] = [...sill(-0.17, 0.162, 0.032, ax, r + 0.008), [0.166, 0.07], [0.158, 0.094], [0.07, 0.104], [-0.17, 0.104]];
  p.add(side(low, W), 0, 0, 0, color);
  p.add(side([[0.07, 0.104], [0.03, 0.156], [-0.05, 0.158], [-0.056, 0.104]], W - 0.02, 0.004), 0, 0, 0, GLASS);
  p.add(side([[0.034, 0.154], [-0.05, 0.156], [-0.052, 0.164], [0.03, 0.162]], W - 0.016, 0.003), 0, 0, 0, color);
  for (const s of [-1, 1]) {
    rod(p, [s * 0.064, 0.104, 0.07], [s * 0.062, 0.156, 0.03], 0.004, color);
    p.box(0.008, 0.054, 0.01, s * 0.064, 0.104, -0.01, color);
  }
  p.box(W - 0.01, 0.06, 0.012, 0, 0.104, -0.058, color);
  // le plateau : fond, ridelles, hayon ; arceau derrière la cabine
  p.box(W - 0.02, 0.004, 0.11, 0, 0.104, -0.115, 0x3a3a3e);
  for (const s of [-1, 1]) p.box(0.004, 0.03, 0.11, s * 0.073, 0.104, -0.115, color);
  p.box(W, 0.03, 0.006, 0, 0.104, -0.172, color);
  rod(p, [-0.066, 0.104, -0.068], [-0.066, 0.18, -0.068], 0.004, DARK); rod(p, [0.066, 0.104, -0.068], [0.066, 0.18, -0.068], 0.004, DARK);
  rod(p, [-0.066, 0.18, -0.068], [0.066, 0.18, -0.068], 0.004, DARK);
  for (const x of [-0.03, 0.03]) p.box(0.016, 0.012, 0.01, x, 0.17, -0.064, LAMP, 0, true);
  p.box(0.05, 0.04, 0.04, -0.035, 0.108, -0.1, 0xb8864e); p.box(0.05, 0.004, 0.042, -0.035, 0.148, -0.1, 0x8a5a32);
  p.box(0.04, 0.03, 0.036, 0.03, 0.108, -0.13, 0xc8a070);
  p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(1.3, 0.7, 1), 0.035, 0.12, -0.085, 0xd8c8a0);
  p.cyl(0.012, 0.012, 0.04, 6, -0.04, 0.108, -0.15, 0xc8352c);
  ends(p, W, 0.166, -0.174, 0.038, 0.08, 0.05, CHROME);
  doorsAndMirrors(p, 0.075, [0.07, 0.008, -0.056], 0.044, 0.104, [0.064, 0.11], color);
  for (const z of ax) for (const s of [-1, 1]) wheel(p, s * 0.064, z, r, 0.03, DARK);
  return p.build(false);
}

/**
 * Châssis d'une voiture ancienne : longerons, ailes en arc au-dessus des roues reliées par le marchepied, roues à rayons,
 * capot à persiennes devant la cloison, radiateur de laiton, gros phares, trompe
 */
function vintageChassis(p: Parts, body: number, wing: number, axF: number, axR: number, r: number) {
  for (const s of [-1, 1]) {
    p.box(0.012, 0.016, axF - axR + 0.08, s * 0.05, r - 0.006, (axF + axR) / 2, DARK);
    for (const z of [axF, axR]) {
      p.add(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.036, 8, 1, true, -0.25, Math.PI + 0.5).rotateZ(Math.PI / 2), s * 0.071, r, z, wing);
      spokedWheel(p, s * 0.071, z, r, 0xd8c8a0);
    }
    p.box(0.036, 0.006, axF - axR - 2 * r - 0.012, s * 0.071, r * 0.72, (axF + axR) / 2, wing);
  }
  // capot et radiateur
  const hz = axF + 0.002;
  p.add(side([[hz + 0.05, r + 0.01], [hz + 0.05, r + 0.056], [hz - 0.05, r + 0.066], [hz - 0.05, r + 0.01]], 0.084, 0.004), 0, 0, 0, body);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) p.box(0.003, 0.016, 0.004, s * 0.043, r + 0.03, hz - 0.03 + k * 0.016, DARK);
  p.box(0.09, 0.066, 0.01, 0, r + 0.004, hz + 0.055, BRASS);
  p.box(0.074, 0.05, 0.004, 0, r + 0.012, hz + 0.061, 0x3a3020);
  p.cyl(0.004, 0.004, 0.012, 5, 0, r + 0.07, hz + 0.055, BRASS);
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.014, 0.012, 0.02, 7).rotateX(Math.PI / 2), s * 0.058, r + 0.04, hz + 0.062, BRASS);
    p.add(new THREE.CircleGeometry(0.011, 7), s * 0.058, r + 0.04, hz + 0.073, LAMP, 0, true);
  }
  p.add(new THREE.CylinderGeometry(0.004, 0.009, 0.03, 5).rotateX(Math.PI / 2), 0.05, r + 0.064, hz + 0.03, BRASS);
  p.box(0.1, 0.012, 0.012, 0, r - 0.01, hz + 0.066, DARK);
  for (const s of [-1, 1]) p.box(0.012, 0.012, 0.008, s * 0.04, r + 0.02, axR - 0.06, TAIL, 0, true);
}

/** Conducteur : manteau, casquette, et ses mains au volant */
function driverAt(p: Parts, x: number, y: number, z: number, coat: number, cap: number) {
  p.box(0.044, 0.05, 0.03, x, y, z, coat);
  p.box(0.03, 0.03, 0.028, x, y + 0.05, z + 0.002, SKIN);
  p.box(0.034, 0.008, 0.034, x, y + 0.078, z + 0.004, cap);
  p.box(0.03, 0.004, 0.014, x, y + 0.076, z + 0.022, cap);
  for (const s of [-1, 1]) rod(p, [x + s * 0.024, y + 0.044, z], [x + s * 0.014, y + 0.03, z + 0.04], 0.006, coat);
}

/** Torpédo découverte (âge industriel) : baquet à deux rangs de sièges de cuir, volant, conducteur, capote repliée, roue de secours */
function tourer(body: number): Geo {
  const p = new Parts(), r = 0.04, axF = 0.1, axR = -0.1;
  vintageChassis(p, body, DARK, axF, axR, r);
  // le baquet : flancs, dossier arrondi, sièges, cloison ; pare-brise rabattable
  p.add(side([[0.05, r + 0.006], [0.05, r + 0.07], [-0.02, r + 0.064], [-0.13, r + 0.072], [-0.15, r + 0.04], [-0.14, r + 0.006]], 0.13, 0.006), 0, 0, 0, body);
  p.box(0.11, 0.012, 0.15, 0, r + 0.058, -0.045, LEATHER);
  for (const z of [0.0, -0.085]) { p.box(0.11, 0.03, 0.012, 0, r + 0.066, z - 0.03, LEATHER); }
  p.box(0.12, 0.004, 0.11, 0, r + 0.07, -0.045, 0x1e1e20);
  p.box(0.1, 0.04, 0.003, 0, r + 0.07, 0.048, 0xbcd4e0);
  for (const s of [-1, 1]) p.box(0.004, 0.044, 0.004, s * 0.05, r + 0.07, 0.048, BRASS);
  p.add(new THREE.TorusGeometry(0.016, 0.0025, 3, 8).rotateX(-1.0), -0.026, r + 0.1, 0.022, 0x1e1e20);
  driverAt(p, -0.026, r + 0.07, -0.01, 0x4a3a2e, 0x6a5a4a);
  // la capote repliée, la malle et la roue de secours
  p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 6).rotateZ(Math.PI / 2).scale(1, 0.6, 1), 0, r + 0.08, -0.14, 0xb8a888);
  for (const s of [-1, 1]) rod(p, [s * 0.064, r + 0.07, -0.12], [s * 0.064, r + 0.08, -0.14], 0.003, BRASS);
  p.box(0.08, 0.04, 0.03, 0, r + 0.02, -0.168, DARK);
  spokedWheel(p, 0, -0.19, 0.034, 0xd8c8a0);
  return p.build(false);
}

/** Conduite intérieure (âge industriel) : caisse fermée haute, toit noir, vitres, malle au dos */
function saloon(body: number): Geo {
  const p = new Parts(), r = 0.04, axF = 0.1, axR = -0.1;
  vintageChassis(p, body, DARK, axF, axR, r);
  p.add(side([[0.05, r + 0.006], [0.05, r + 0.07], [-0.14, r + 0.07], [-0.15, r + 0.006]], 0.13, 0.005), 0, 0, 0, body);
  p.add(side([[0.05, r + 0.07], [0.042, r + 0.13], [-0.136, r + 0.13], [-0.14, r + 0.07]], 0.128, 0.004), 0, 0, 0, body);
  p.add(side([[0.046, r + 0.128], [-0.138, r + 0.128], [-0.134, r + 0.142], [0.04, r + 0.142]], 0.13, 0.004), 0, 0, 0, 0x1e1e20);
  for (const s of [-1, 1]) for (const [z, l] of [[0.012, 0.05], [-0.05, 0.05], [-0.105, 0.04]]) p.box(0.004, 0.042, l, s * 0.065, r + 0.08, z, GLASS);
  p.add(new THREE.BoxGeometry(0.11, 0.046, 0.004), 0, r + 0.1, 0.048, GLASS, 0, false, 0, -0.12);
  for (const s of [-1, 1]) { p.box(0.004, 0.004, 0.012, s * 0.066, r + 0.06, -0.02, BRASS); p.box(0.004, 0.064, 0.003, s * 0.066, r + 0.008, -0.02, DARK); }
  p.box(0.11, 0.05, 0.04, 0, r + 0.02, -0.166, 0x1e1e20);
  p.box(0.116, 0.004, 0.046, 0, r + 0.07, -0.166, 0x2e2e30);
  return p.build(false);
}

/** Camionnette ancienne : cabine ouverte à auvent, plateau de planches à ridelles, chargement de tonneaux, caisses et sacs */
function oldTruck(cab: number): Geo {
  const p = new Parts(), r = 0.04, axF = 0.12, axR = -0.1;
  vintageChassis(p, cab, DARK, axF, axR, r);
  p.add(side([[0.07, r + 0.006], [0.07, r + 0.08], [0.02, r + 0.08], [0.02, r + 0.006]], 0.13, 0.004), 0, 0, 0, cab);
  for (const s of [-1, 1]) p.box(0.006, 0.07, 0.006, s * 0.06, r + 0.08, 0.024, DARK);
  p.box(0.136, 0.006, 0.07, 0, r + 0.15, 0.04, cab);
  driverAt(p, -0.026, r + 0.07, 0.04, 0x3a4a6a, 0x2a2a2e);
  p.box(0.06, 0.016, 0.04, -0.01, r + 0.064, 0.04, LEATHER);
  // le plateau
  p.box(0.14, 0.008, 0.2, 0, r + 0.02, -0.09, 0x9a7452);
  for (let k = 0; k < 5; k++) p.box(0.142, 0.002, 0.003, 0, r + 0.028, -0.18 + k * 0.045, 0x6a4a32);
  for (const s of [-1, 1]) { p.box(0.006, 0.03, 0.2, s * 0.07, r + 0.028, -0.09, 0x8a6442); for (const z of [-0.18, -0.09, 0.0]) p.box(0.008, 0.036, 0.008, s * 0.07, r + 0.026, z, 0x5a3e2a); }
  p.box(0.14, 0.03, 0.006, 0, r + 0.028, -0.19, 0x8a6442);
  for (const [x, z] of [[-0.035, -0.04], [0.035, -0.04], [-0.035, -0.09]]) { p.cyl(0.018, 0.018, 0.044, 7, x, r + 0.028, z, 0x8a5a32); p.cyl(0.0185, 0.0185, 0.004, 7, x, r + 0.04, z, DARK); p.cyl(0.0185, 0.0185, 0.004, 7, x, r + 0.06, z, DARK); }
  p.box(0.05, 0.04, 0.045, 0.03, r + 0.028, -0.1, 0xc8a070); p.box(0.04, 0.03, 0.04, 0.025, r + 0.068, -0.1, 0xb8864e);
  for (const x of [-0.03, 0.02]) p.add(new THREE.IcosahedronGeometry(0.022, 0).scale(1.2, 0.6, 1), x, r + 0.04, -0.155, 0xd8c8a0);
  p.box(0.04, 0.012, 0.006, 0, r + 0.03, -0.194, PLATE);
  return p.build(false);
}

/**
 * Le trafic motorisé avant l'âge futuriste : à l'âge industriel, torpédo, conduite intérieure et camionnette ; à l'âge
 * moderne, berline, citadine, fourgonnette, pick-up et une seconde berline d'une autre teinte
 */
export function carGeos(age: number): Geo[] {
  if (age <= 3) return [tourer(0x2e4a3a), saloon(0x6a2a2a), oldTruck(0x2c3e5e), tourer(0x1e1e22)];
  return [sedan(0xc8352c), hatch(0x5aa0d8), van(0xf0f0ec, 0x2e8a5a, 0x2e8a5a), pickup(0x5a6e3a), sedan(0x2c3e66), hatch(0xf2c23a)];
}

/**
 * Barque de pêche à clins (le pêcheur, un habitant modélisé, est assis sur le banc du milieu, en z = -0,07) : coque à
 * facettes, liston bleu, bancs, avirons dans leurs tolets, canne qui pointe vers l'avant, panier de poissons, filet,
 * ancre et cordage, lanterne à la poupe
 */
export function rowboatGeo() {
  const p = new Parts();
  const gw = shipHull(p, { L: 0.38, B: 0.17, depth: 0.03, top: 0.04, bow: 0.03, stern: 0.012, transom: 0.62, fine: 1.2, under: 0x5a3e2a, side: 0x9a7452, band: 0x3a6a8a, deck: 0xb89468, inner: 0x7a5a3e });
  // bordages : deux lignes de clins sur le flanc
  for (const y of [0.012, 0.026]) for (const s of [-1, 1]) {
    const pts: V3[] = [];
    for (let k = 0; k <= 6; k++) { const z = -0.18 + k * 0.06; pts.push([s * gw.beam(z) * (0.93 + 0.07 * y / gw(z)) * 1.01, y, z]); }
    for (let k = 0; k < 6; k++) rod(p, pts[k], pts[k + 1], 0.0018, 0x6a4a32);
  }
  // bancs, plat-bord, tolets et avirons
  for (const z of [0.07, -0.07, -0.15]) p.box(gw.beam(z) * 1.8, 0.008, 0.026, 0, 0.026, z, 0xc9a27a);
  for (const s of [-1, 1]) {
    const pts: V3[] = [];
    for (let k = 0; k <= 8; k++) { const z = -0.19 + k * 0.0475; pts.push([s * gw.beam(z) * 0.97, gw(z) + 0.002, z]); }
    for (let k = 0; k < 8; k++) rod(p, pts[k], pts[k + 1], 0.004, 0x6a4a32);
    p.box(0.006, 0.014, 0.006, s * gw.beam(0.0) * 0.97, gw(0), 0.0, DARK);
    rod(p, [s * 0.04, 0.05, -0.02], [s * 0.2, -0.004, 0.06], 0.0035, 0xc8a070);
    p.add(new THREE.BoxGeometry(0.004, 0.006, 0.05).rotateY(-s * 0.45), s * 0.19, -0.002, 0.056, 0xc8a070);
  }
  // la canne, son moulinet ; le panier de poissons et le filet à l'avant ; ancre et cordage ; lanterne
  rod(p, [0.05, 0.03, 0.02], [0.05, 0.27, 0.22], 0.0028, 0x5a3e2e);
  p.cyl(0.006, 0.006, 0.006, 6, 0.05, 0.05, 0.035, DARK);
  p.cyl(0.024, 0.02, 0.026, 7, 0.0, 0.022, 0.12, 0xb8935a);
  for (const [x, z, c] of [[-0.008, 0.115, 0xc8d4dc], [0.008, 0.126, 0xd8a050], [0.0, 0.12, 0x9ab0c0]] as [number, number, number][]) p.add(new THREE.ConeGeometry(0.006, 0.026, 4).rotateZ(Math.PI / 2), x, 0.048, z, c);
  p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(1.2, 0.45, 1.4), -0.03, 0.03, 0.15, 0x8a8a6a);
  p.add(new THREE.TorusGeometry(0.014, 0.004, 3, 8).rotateX(Math.PI / 2), 0.03, 0.028, -0.15, 0xc8b080);
  p.box(0.004, 0.024, 0.004, -0.03, 0.028, -0.155, DARK); p.box(0.02, 0.004, 0.004, -0.03, 0.03, -0.155, DARK);
  rod(p, [0, 0.03, -0.185], [0, 0.1, -0.19], 0.002, DARK);
  p.box(0.014, 0.018, 0.014, 0, 0.1, -0.19, 0xffcf70, 0, false);
  p.box(0.018, 0.004, 0.018, 0, 0.118, -0.19, DARK);
  return p.build(false).body;
}

/**
 * Voilier de plaisance : coque blanche à facettes, liston bleu, carène rouge, pont de teck, rouf à hublots, cockpit et sa
 * barre, mât, bôme, grand-voile et foc bombés, haubans et étai, balcon avant, bouée, pavillon, un équipier ; avant = +z
 */
export function sailboatGeo() {
  const p = new Parts();
  const gw = shipHull(p, { L: 0.6, B: 0.22, depth: 0.05, top: 0.055, bow: 0.04, stern: 0.012, transom: 0.6, fine: 1.4, under: 0xa83a2a, side: 0xf7f3ec, band: 0x2c4a8a, deck: 0xc4a272, inner: 0xe8e2d6 });
  const dk = gw(0) - 0.022;
  // rouf à hublots, cockpit, barre franche, gouvernail
  p.add(side([[0.14, dk], [0.12, dk + 0.045], [-0.06, dk + 0.05], [-0.08, dk]], 0.12, 0.006), 0, 0, 0, 0xf2eee6);
  for (const s of [-1, 1]) for (const z of [0.08, 0.03, -0.02]) p.add(new THREE.CircleGeometry(0.008, 6).rotateY(s * Math.PI / 2), s * 0.0605, dk + 0.026, z, GLASS);
  p.box(0.07, 0.03, 0.004, 0, dk + 0.012, -0.081, 0x8a5a32);
  p.box(0.12, 0.004, 0.13, 0, dk - 0.012, -0.16, 0xa8845a);
  for (const s of [-1, 1]) p.box(0.02, 0.016, 0.12, s * 0.05, dk - 0.008, -0.16, 0xe8e2d6);
  rod(p, [0, dk + 0.004, -0.24], [0, dk + 0.02, -0.16], 0.003, 0x8a5a32);
  p.box(0.004, 0.06, 0.04, 0, -0.05, -0.29, 0xf2eee6);
  // le mât, la bôme, les voiles
  const mz = 0.07, top = 0.78;
  p.cyl(0.007, 0.009, top - dk, 5, 0, dk, mz, 0xd8dde2);
  rod(p, [0, dk + 0.08, mz], [0, dk + 0.1, -0.2], 0.005, 0xc8ccd2);
  sail3(p, [0, dk + 0.085, mz - 0.008], [0, top - 0.02, mz - 0.006], [0, dk + 0.102, -0.195], 0xfdfbf6, 0.035);
  sail3(p, [0, gw(0.27) + 0.01, 0.27], [0, top - 0.12, mz + 0.006], [0, dk + 0.06, -0.0], 0xf2ece0, -0.03);
  // la toile : deux bandes de ris, le numéro de voile
  rod(p, [0.018, dk + 0.2, mz - 0.01], [0.016, dk + 0.2, -0.13], 0.0015, 0xc8c0b0);
  p.box(0.004, 0.03, 0.04, 0.02, dk + 0.32, -0.02, 0x2c4a8a);
  // gréement : étai, pataras, haubans et barres de flèche
  rod(p, [0, top - 0.04, mz], [0, gw(0.29) + 0.004, 0.29], 0.0015, 0x4a4a4e);
  rod(p, [0, top - 0.01, mz], [0, gw(-0.29) + 0.004, -0.28], 0.0015, 0x4a4a4e);
  for (const s of [-1, 1]) {
    rod(p, [0, dk + 0.42, mz], [s * 0.05, dk + 0.42, mz], 0.002, 0xc8ccd2);
    rod(p, [s * 0.05, dk + 0.42, mz], [s * gw.beam(mz) * 0.95, gw(mz), mz], 0.0015, 0x4a4a4e);
    rod(p, [0, top - 0.04, mz], [s * 0.05, dk + 0.42, mz], 0.0015, 0x4a4a4e);
  }
  // balcon avant et filières, chandeliers
  for (const s of [-1, 1]) {
    for (const z of [-0.24, -0.12, 0.0, 0.12]) rod(p, [s * gw.beam(z) * 0.92, gw(z), z], [s * gw.beam(z) * 0.92, gw(z) + 0.035, z], 0.0015, 0xc8ccd2);
    rod(p, [s * gw.beam(-0.24) * 0.92, gw(-0.24) + 0.035, -0.24], [s * gw.beam(0.12) * 0.92, gw(0.12) + 0.035, 0.12], 0.0012, 0xc8ccd2);
    rod(p, [s * gw.beam(0.12) * 0.92, gw(0.12) + 0.035, 0.12], [s * 0.012, gw(0.27) + 0.03, 0.26], 0.0018, 0xc8ccd2);
  }
  // bouée, pavillon, équipier à la barre
  p.add(new THREE.TorusGeometry(0.018, 0.006, 4, 8).rotateY(Math.PI / 2), 0.06, dk + 0.03, -0.25, 0xe8553c);
  rod(p, [0, dk, -0.29], [0, dk + 0.1, -0.29], 0.0015, 0x4a4a4e);
  p.box(0.003, 0.024, 0.036, 0, dk + 0.074, -0.31, 0xd8382e);
  p.box(0.04, 0.05, 0.034, -0.03, dk - 0.006, -0.19, 0xe8c040);
  p.box(0.03, 0.03, 0.028, -0.03, dk + 0.044, -0.19, SKIN);
  p.box(0.034, 0.008, 0.032, -0.03, dk + 0.074, -0.19, 0xf2f2ee);
  return p.build(false).body;
}
