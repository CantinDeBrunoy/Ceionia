import * as THREE from 'three';
import { Parts } from './parts';
import type { RigKind } from '../sim/fields';

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/**
 * Les engins des champs, selon l'époque, dessinés avant = +z, l'origine au siège du conducteur (au pied du laboureur, pour
 * les attelages) : la charrue à bœufs et le chariot à foin de l'Antiquité et du Moyen Âge ; le tracteur de l'âge industriel
 * (rouge), moderne (vert) et futuriste (blanc) et ce qu'il tire — charrue, remorque, botteleuse à balles rondes, épandeur à
 * fumier ; la moissonneuse-batteuse de l'été (verte, puis blanche à liseré lumineux). Les géométries sont partagées
 */
const cache = new Map<string, THREE.BufferGeometry>();
function shared(key: string, make: (p: Parts) => void) {
  let g = cache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; cache.set(key, g); }
  return g;
}

/** Hauteur du siège de chaque engin (le conducteur y est assis) */
export const SEATS: Partial<Record<RigKind, number>> = { combine: 0.1 };
export const TRACTOR_SEAT = 0.075;
export const seatOf = (kind: RigKind | null | undefined) => (kind && SEATS[kind]) || TRACTOR_SEAT;

/** Roue pleine posée sur son essieu (axe le long de x) */
function wheel(p: Parts, x: number, y: number, z: number, r: number, w: number, tyre: number, hub: number) {
  p.add(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), x, y, z, tyre);
  p.add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.002, 8).rotateZ(Math.PI / 2), x, y, z, hub);
}

/** Tracteur et ce qu'il tire (`hitch`) ; les couleurs et l'arceau suivent l'époque (3 industriel, 4 moderne, 5 futuriste) */
function tractor(p: Parts, era: number, hitch: 'plough' | 'trailer' | 'baler' | 'spreader') {
  const tyre = 0x2a2a2e, iron = 0x3c3c40, body = [0xc8443a, 0x3a8a3a, 0xeef2f4][era - 3], hub = [0xe8d8b0, 0xf2c23a, 0x5af0ff][era - 3];
  // capot et calandre, réservoir, plancher, siège et dossier, volant, pot d'échappement
  p.box(0.07, 0.05, 0.13, 0, 0.045, 0.085, body);
  p.box(0.06, 0.02, 0.07, 0, 0.095, 0.07, dark(body, 0.85));
  p.box(0.072, 0.046, 0.006, 0, 0.047, 0.152, iron);
  p.box(0.09, 0.012, 0.07, 0, 0.04, -0.01, dark(body, 0.7));
  p.box(0.05, 0.014, 0.045, 0, 0.06, -0.012, 0x3a3a3e);
  p.box(0.05, 0.045, 0.008, 0, 0.07, -0.036, 0x3a3a3e);
  p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.06).rotateX(-0.6), 0, 0.09, 0.03, iron);
  p.add(new THREE.TorusGeometry(0.02, 0.004, 3, 10).rotateX(Math.PI / 2 - 0.6), 0, 0.112, 0.016, iron);
  p.cyl(0.006, 0.006, 0.075, 5, 0.024, 0.09, 0.115, iron);
  for (const s of [-1, 1]) {
    // grandes roues arrière (garde-boue par-dessus), petites roues avant
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.032, 12).rotateZ(Math.PI / 2), s * 0.07, 0.06, -0.012, tyre);
    p.add(new THREE.CylinderGeometry(0.032, 0.032, 0.034, 8).rotateZ(Math.PI / 2), s * 0.07, 0.06, -0.012, hub);
    p.box(0.036, 0.008, 0.085, s * 0.07, 0.122, -0.012, dark(body, 0.85));
    p.add(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 10).rotateZ(Math.PI / 2), s * 0.048, 0.032, 0.12, tyre);
    p.add(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 6).rotateZ(Math.PI / 2), s * 0.048, 0.032, 0.12, hub);
  }
  // arceau et toit à l'époque moderne et après ; liseré lumineux le long du capot à l'âge futuriste
  if (era >= 4) {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.006, 0.15, 0.006, x * 0.046, 0.07, -0.012 + z * 0.042, iron);
    p.box(0.11, 0.01, 0.1, 0, 0.22, -0.012, body);
  }
  if (era >= 5) p.box(0.074, 0.006, 0.12, 0, 0.072, 0.085, 0x5af0ff, 0, 'neon');
  p.box(0.008, 0.008, 0.07, 0, 0.03, -0.075, iron);
  if (hitch === 'plough') {
    // charrue : bâti, et ses socs qui retournent la terre
    p.box(0.1, 0.01, 0.014, 0, 0.03, -0.11, 0x5a5e66);
    for (let i = 0; i < 3; i++) p.add(new THREE.BoxGeometry(0.008, 0.03, 0.045), -0.034 + i * 0.034, 0.004, -0.12 - i * 0.014, 0x8a8f96, 0.5);
  } else if (hitch === 'trailer') {
    // remorque à ridelles : des gerbes dressées à l'âge industriel, des bottes rondes ensuite
    p.box(0.11, 0.012, 0.13, 0, 0.045, -0.18, 0x8a6a4a);
    for (const s of [-1, 1]) {
      p.box(0.006, 0.03, 0.13, s * 0.053, 0.057, -0.18, 0x6a4a34);
      p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 10).rotateZ(Math.PI / 2), s * 0.062, 0.03, -0.18, tyre);
    }
    if (era === 3) for (let i = 0; i < 6; i++) p.cyl(0.016, 0.012, 0.06, 6, -0.03 + (i % 3) * 0.03, 0.057, -0.215 + Math.floor(i / 3) * 0.07, 0xe0c060);
    else for (const z of [-0.21, -0.15]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 9).rotateZ(Math.PI / 2), 0, 0.092, z, 0xe8c66a);
  } else if (hitch === 'baler') {
    // botteleuse à balles rondes : timon, ramasseur à dents devant, chambre ronde sous son capot, hayon relevé derrière, la
    // balle qui vient de sortir roule sur le chaume
    const col = [0, 0, 0, 0xb8403a, 0x4a7ac8, 0x9aa8b8][era];
    p.box(0.012, 0.012, 0.1, 0, 0.034, -0.14, 0x5a5e66);
    p.box(0.1, 0.07, 0.12, 0, 0.034, -0.27, col);
    p.add(new THREE.CylinderGeometry(0.046, 0.046, 0.1, 10).rotateZ(Math.PI / 2), 0, 0.094, -0.27, dark(col, 0.9));
    p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.104, 8).rotateZ(Math.PI / 2), 0, 0.045, -0.2, 0xe0c060);
    for (let k = 0; k < 7; k++) p.box(0.004, 0.012, 0.004, -0.045 + k * 0.015, 0.012, -0.2, 0xd8d6d0);
    p.add(new THREE.BoxGeometry(0.1, 0.006, 0.06), 0, 0.14, -0.31, dark(col, 0.8), 0, false, 0, -0.9);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 10).rotateZ(Math.PI / 2), s * 0.062, 0.03, -0.27, tyre);
    p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.09, 9).rotateZ(Math.PI / 2), 0, 0.036, -0.4, 0xe8c66a);
    if (era >= 5) p.box(0.104, 0.005, 0.1, 0, 0.1, -0.27, 0x5af0ff, 0, 'neon');
  } else {
    // épandeur : cuve couchée sur son châssis, trappe et disques de projection derrière, le fumier lancé en éventail
    const col = [0, 0, 0, 0x7a6a4a, 0x4a8a3a, 0xdde4ea][era];
    p.box(0.012, 0.012, 0.1, 0, 0.034, -0.14, 0x5a5e66);
    p.box(0.09, 0.015, 0.17, 0, 0.04, -0.28, 0x5a5e66);
    p.add(new THREE.CylinderGeometry(0.046, 0.046, 0.15, 10).rotateX(Math.PI / 2), 0, 0.1, -0.28, col);
    p.add(new THREE.CylinderGeometry(0.047, 0.047, 0.012, 10).rotateX(Math.PI / 2), 0, 0.1, -0.205, dark(col, 0.7));
    p.box(0.07, 0.014, 0.02, 0, 0.06, -0.37, 0x6a4a34);
    for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 10).rotateZ(Math.PI / 2), s * 0.062, 0.03, -0.28, tyre);
      p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 8), s * 0.026, 0.062, -0.375, iron);
      for (let k = 0; k < 3; k++) p.box(0.006, 0.006, 0.02, s * 0.026, 0.066, -0.375, iron, (k * Math.PI) / 3);
    }
    for (let k = 0; k < 9; k++) {
      const a = ((k % 5) - 2) * 0.4, r = 0.06 + (k % 3) * 0.035;
      p.sphere(0.008 + (k % 2) * 0.003, Math.sin(a) * r * 0.9, 0.05 - (k % 3) * 0.012, -0.4 - Math.cos(a) * r, k % 2 ? 0x5a3e28 : 0x6a4a34, 0);
    }
    if (era >= 5) p.box(0.09, 0.005, 0.15, 0, 0.145, -0.28, 0x5af0ff, 0, 'neon');
  }
}

/** Le tracteur et son attelage de l'époque (3 à 5) */
export function tractorGeo(age: number, hitch: 'plough' | 'trailer' | 'baler' | 'spreader') {
  const era = Math.min(5, Math.max(3, age));
  return shared(`tractor|${era}|${hitch}`, (p) => tractor(p, era, hitch));
}

/**
 * Moissonneuse-batteuse (siège du chauffeur à l'origine, dans la cabine vitrée) : verte à roues jaunes à l'époque moderne,
 * blanche à liseré lumineux ensuite ; devant, la coupe et son rabatteur à lattes ; au milieu, le convoyeur ; derrière, le corps
 * de batteuse, la trémie à grain, le tube de déchargement replié et l'éjecteur de paille
 */
export function combineGeo(age: number) {
  const era = age >= 5 ? 5 : 4;
  return shared(`combine|${era}`, (p) => {
    const tyre = 0x2a2a2e, iron = 0x3c3c40, body = era === 4 ? 0x3a8a3a : 0xeef2f4, hub = era === 4 ? 0xf2c23a : 0x5af0ff, trim = era === 4 ? 0xf2c23a : 0x9aa8b8;
    // châssis, corps de batteuse, trémie, capots
    p.box(0.15, 0.05, 0.34, 0, 0.04, -0.17, dark(body, 0.8));
    p.box(0.15, 0.09, 0.2, 0, 0.09, -0.2, body);
    p.box(0.16, 0.05, 0.22, 0, 0.18, -0.2, dark(body, 0.92));
    p.box(0.17, 0.01, 0.24, 0, 0.23, -0.2, trim);
    for (let k = 0; k < 5; k++) p.box(0.152, 0.006, 0.01, 0, 0.1 + (k % 2) * 0.02, -0.12 - k * 0.04, dark(body, 0.7));
    // la céréale dans la trémie, qu'on devine par-dessus
    p.box(0.13, 0.008, 0.18, 0, 0.226, -0.2, 0xe0c060);
    // tube de déchargement replié le long du flanc, éjecteur de paille et hayon arrière
    p.add(new THREE.BoxGeometry(0.014, 0.014, 0.22), 0.07, 0.205, -0.17, trim, 0, false, 0, 0);
    p.add(new THREE.BoxGeometry(0.014, 0.02, 0.05), 0.07, 0.205, -0.31, trim, 0, false, 0, 0.5);
    p.box(0.12, 0.05, 0.04, 0, 0.1, -0.35, dark(body, 0.7));
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.1, 0.004, 0.04), 0, 0.12 - k * 0.012, -0.375 - k * 0.002, dark(body, 0.5), 0, false, 0, -0.5);
    // cabine : plancher, montants, vitres, toit, siège et volant
    p.box(0.1, 0.012, 0.1, 0, 0.088, 0.0, dark(body, 0.7));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.006, 0.18, 0.006, x * 0.046, 0.094, z * 0.046, iron);
    p.box(0.1, 0.012, 0.11, 0, 0.274, 0, body);
    p.box(0.088, 0.1, 0.004, 0, 0.12, 0.048, 0xbfe0ee);
    for (const s of [-1, 1]) p.box(0.004, 0.1, 0.09, s * 0.048, 0.12, 0, 0xbfe0ee);
    p.box(0.05, 0.014, 0.045, 0, 0.076, -0.012, 0x3a3a3e);
    p.box(0.05, 0.045, 0.008, 0, 0.094, -0.036, 0x3a3a3e);
    p.add(new THREE.TorusGeometry(0.02, 0.004, 3, 10).rotateX(Math.PI / 2 - 0.6), 0, 0.14, 0.03, iron);
    // convoyeur incliné, coupe : barre de coupe, rabatteur à lattes, diviseurs
    p.add(new THREE.BoxGeometry(0.1, 0.05, 0.1), 0, 0.065, 0.1, dark(body, 0.85), 0, false, 0, 0.3);
    p.box(0.27, 0.03, 0.09, 0, 0.012, 0.19, body);
    p.box(0.27, 0.004, 0.012, 0, 0.012, 0.24, 0xd8d6d0);
    for (let k = 0; k < 14; k++) p.box(0.004, 0.012, 0.012, -0.13 + k * 0.02, 0.008, 0.248, 0xc8ced6);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 8).rotateZ(Math.PI / 2), 0, 0.085, 0.21, trim);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.box(0.26, 0.004, 0.008, 0, 0.085 + Math.sin(a) * 0.042, 0.21 + Math.cos(a) * 0.042, hub); }
    for (const s of [-1, 1]) { p.box(0.006, 0.07, 0.07, s * 0.136, 0.012, 0.2, body); p.cone(0.012, 0.06, 4, s * 0.136, 0.012, 0.25, trim); p.box(0.006, 0.07, 0.01, s * 0.136, 0.04, 0.24, trim); }
    // grandes roues motrices devant, petites roues directrices derrière
    for (const s of [-1, 1]) { wheel(p, s * 0.095, 0.07, 0.02, 0.07, 0.04, tyre, hub); wheel(p, s * 0.06, 0.04, -0.33, 0.04, 0.03, tyre, hub); }
    if (era >= 5) { p.box(0.152, 0.006, 0.3, 0, 0.138, -0.2, 0x5af0ff, 0, 'neon'); p.box(0.1, 0.006, 0.006, 0, 0.255, 0.058, 0x5af0ff, 0, 'neon'); }
  });
}

/** Un tout petit personnage debout (laboureur, bouvier) à la taille des habitants : jambes, tunique, tête, coiffe */
function walker(p: Parts, x: number, z: number, body: number, hat: number, ry: number) {
  const c = Math.cos(ry), s = Math.sin(ry), P = (u: number, w: number): [number, number] => [x + u * c + w * s, z - u * s + w * c];
  for (const u of [-0.014, 0.014]) { const [px, pz] = P(u, 0); p.box(0.02, 0.085, 0.022, px, 0, pz, 0x3c3c48, ry); }
  { const [px, pz] = P(0, 0); p.box(0.055, 0.08, 0.035, px, 0.085, pz, body, ry); p.box(0.034, 0.034, 0.034, px, 0.165, pz, 0xe8b894, ry); p.box(0.04, 0.014, 0.04, px, 0.196, pz, hat, ry); }
  for (const u of [-0.037, 0.037]) { const [px, pz] = P(u, 0.012); p.box(0.016, 0.06, 0.018, px, 0.11, pz, body, ry); }
}

/** Un bœuf (museau vers +z) : corps massif et bossu, cornes, fanon, queue, quatre jambes ; `coat` : la robe */
function ox(p: Parts, x: number, z: number, coat: number) {
  const dk = dark(coat, 0.75);
  p.box(0.06, 0.06, 0.13, x, 0.05, z, coat);
  p.box(0.054, 0.02, 0.05, x, 0.105, z + 0.03, dk);
  p.box(0.05, 0.05, 0.05, x, 0.07, z + 0.085, coat);
  p.box(0.036, 0.034, 0.04, x, 0.06, z + 0.125, dark(coat, 1.15));
  p.box(0.01, 0.01, 0.008, x, 0.07, z + 0.146, 0x2a2420);
  for (const s of [-1, 1]) {
    p.add(new THREE.ConeGeometry(0.008, 0.04, 4).rotateZ(-s * 1.2), x + s * 0.03, 0.115, z + 0.092, 0xf0e6cc);
    p.box(0.01, 0.01, 0.014, x + s * 0.03, 0.095, z + 0.08, dk);
  }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.016, 0.055, 0.018, x + dx * 0.02, 0, z + dz * 0.045, dk);
  p.box(0.006, 0.05, 0.006, x, 0.05, z - 0.07, dk);
}

/**
 * Charrue à bœufs, sillon derrière : le laboureur à pied (origine) tient les mancherons de l'araire de bois (Antiquité) ou
 * de la charrue à coutre et à roulette (Moyen Âge) ; devant, le joug, le timon et la paire de bœufs
 */
export function oxPloughGeo(age: number) {
  const era = age >= 2 ? 2 : 1;
  return shared(`oxplough|${era}`, (p) => {
    const wood = 0x8a6a4a, iron = 0x6a6e76;
    walker(p, 0, 0, era === 1 ? 0xe8dcc0 : 0x8a5a3a, era === 1 ? 0xc8a070 : 0x9a3a32, 0);
    // mancherons, âge de la charrue, soc, versoir
    p.add(new THREE.BoxGeometry(0.012, 0.012, 0.16), 0.02, 0.1, 0.07, wood, 0, false, 0, -0.5);
    p.add(new THREE.BoxGeometry(0.012, 0.012, 0.16), -0.02, 0.1, 0.07, wood, 0, false, 0, -0.5);
    p.box(0.012, 0.012, 0.3, 0, 0.1, 0.22, wood);
    p.box(0.03, 0.008, 0.07, 0, 0.0, 0.14, era === 1 ? wood : iron);
    p.cone(0.012, 0.045, 4, 0, 0.0, 0.18, iron);
    if (era === 2) {
      p.box(0.006, 0.06, 0.012, 0, 0.04, 0.23, iron);
      p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10).rotateZ(Math.PI / 2), 0, 0.03, 0.3, wood);
      p.add(new THREE.BoxGeometry(0.014, 0.05, 0.08), -0.02, 0.025, 0.12, wood, 0, false, 0.3);
    }
    // le sillon fraîchement ouvert derrière
    p.box(0.034, 0.004, 0.2, 0, 0.0, -0.13, 0x5a4030);
    p.box(0.012, 0.01, 0.2, 0.02, 0.0, -0.13, 0x6a4c36);
    // le joug sur la nuque des bœufs, leur timon, la paire (une rousse, une pie)
    p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 5).rotateZ(Math.PI / 2), 0, 0.12, 0.45, wood);
    p.box(0.01, 0.01, 0.2, 0, 0.1, 0.35, wood);
    ox(p, -0.034, 0.4, 0xb8804a); ox(p, 0.034, 0.4, era === 1 ? 0xe8dcc8 : 0x6a4a34);
    p.box(0.02, 0.02, 0.02, 0.034, 0.075, 0.43, 0xf4f2ee);
  });
}

/**
 * Chariot à foin tiré par un bœuf, qu'un bouvier mène à pied : plateau, deux grandes roues à rayons, tas de foin
 * bien rond (ridelles à l'époque médiévale) et sa fourche plantée
 */
export function hayCartGeo(age: number) {
  const era = age >= 2 ? 2 : 1;
  return shared(`haycart|${era}`, (p) => {
    const wood = 0x8a6a4a, hay = 0xe0c060;
    p.box(0.12, 0.014, 0.22, 0, 0.05, -0.04, wood);
    for (const s of [-1, 1]) {
      // roue à rayons
      p.add(new THREE.TorusGeometry(0.05, 0.007, 3, 12).rotateY(Math.PI / 2), s * 0.07, 0.055, -0.04, 0x6a4a34);
      for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.006, 0.1, 0.006), s * 0.07, 0.055, -0.04, 0x6a4a34, 0, false, 0, (k * Math.PI) / 4);
      p.box(0.03, 0.01, 0.006, s * 0.056, 0.05, -0.04, 0x6a4a34);
    }
    p.add(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 5).rotateZ(Math.PI / 2), 0, 0.055, -0.04, 0x6a4a34);
    p.box(0.01, 0.014, 0.17, 0, 0.044, 0.16, wood);
    // le tas : trois masses jaunes, des brins qui dépassent
    p.add(new THREE.IcosahedronGeometry(0.09, 1).scale(0.95, 0.7, 1.4), 0, 0.12, -0.04, hay);
    p.add(new THREE.IcosahedronGeometry(0.06, 0).scale(1, 0.7, 1.1), 0.01, 0.17, -0.02, dark(hay, 1.06));
    p.add(new THREE.IcosahedronGeometry(0.05, 0).scale(1, 0.6, 1), -0.01, 0.14, -0.14, dark(hay, 0.92));
    if (era === 2) for (const s of [-1, 1]) for (const z of [-0.11, 0.03]) p.box(0.008, 0.1, 0.008, s * 0.062, 0.06, z, wood);
    p.cyl(0.003, 0.003, 0.18, 4, 0.03, 0.12, -0.02, 0x6a4a34); p.box(0.025, 0.004, 0.004, 0.03, 0.3, -0.02, 0x8a8f96);
    // le bouvier devant, son bœuf sous le joug
    walker(p, 0.1, 0.18, era === 1 ? 0xc8d0b0 : 0x5a6a8a, era === 1 ? 0xd8c8a0 : 0x8a3a32, 0);
    p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 5).rotateZ(Math.PI / 2), 0, 0.12, 0.31, wood);
    p.box(0.01, 0.01, 0.12, 0, 0.1, 0.24, wood);
    ox(p, 0, 0.24, era === 1 ? 0xb8804a : 0xe8dcc8);
  });
}

/** Drone agricole (au centre, sans ses hélices) : coque blanche à liseré lumineux, quatre bras, cuve et barre de pulvérisation dessous */
export function droneGeo() {
  return shared('drone', (p) => {
    p.box(0.05, 0.02, 0.06, 0, 0, 0, 0xf2f4f6);
    p.box(0.052, 0.006, 0.062, 0, 0.012, 0, 0x9aa8b8);
    p.box(0.054, 0.004, 0.064, 0, 0.001, 0, 0x5af0ff, 0, 'neon');
    p.cyl(0.018, 0.018, 0.03, 8, 0, -0.03, 0, 0x4a8ab8);
    p.box(0.12, 0.004, 0.006, 0, -0.034, 0.02, 0x3c3c40);
    for (let k = 0; k < 4; k++) p.cone(0.004, 0.014, 4, -0.045 + k * 0.03, -0.048, 0.02, 0xbfe8f8);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      p.add(new THREE.BoxGeometry(0.09, 0.006, 0.008), sx * 0.04, 0.006, sz * 0.04, 0x3c3c40, sx * sz * Math.PI / 4);
      p.cyl(0.008, 0.008, 0.012, 6, sx * 0.075, 0.003, sz * 0.075, 0x3c3c40);
    }
    p.box(0.012, 0.008, 0.012, 0, 0.016, 0.032, 0x9ae8ff, 0, true);
  });
}
/** Hélice du drone : deux pales croisées (tourne autour de y) */
export function propellerGeo() {
  return shared('drone-prop', (p) => {
    p.box(0.07, 0.002, 0.009, 0, 0, 0, 0xc8ced6);
    p.box(0.009, 0.002, 0.07, 0, 0, 0, 0xc8ced6, 0.0);
  });
}
/** Emplacement des quatre hélices du drone (repère de sa coque) */
export const PROP_SPOTS: [number, number, number][] = [[-0.075, 0.012, -0.075], [0.075, 0.012, -0.075], [-0.075, 0.012, 0.075], [0.075, 0.012, 0.075]];

/** Géométrie de l'engin `kind` à l'âge donné */
export function rigGeo(kind: RigKind, age: number): THREE.BufferGeometry {
  switch (kind) {
    case 'ox': return oxPloughGeo(age);
    case 'haycart': return hayCartGeo(age);
    case 'combine': return combineGeo(age);
    default: return tractorGeo(age, kind);
  }
}
