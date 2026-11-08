import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import type { World } from '../world/world';
import type { Agents } from '../sim/agents';
import { NH, LOOT, W0, WEND, haulAt, craneAt, lootAt, diveAt, polar, mixPolar, smooth } from './salvage';

/**
 * Le galion englouti : l'épave à demi coulée sur son banc de sable (mâts brisés qui percent l'eau, coque béante aux membrures,
 * canons, tonneaux, coffres, algues, poissons, bulles), le bateau de relevage amarré à côté avec sa grue qui descend chercher le
 * butin et le remonte sur le pont, le scaphandrier (casque de cuivre, ou plongeur moderne) relié à la pompe, et le coffre doré
 * qui sort enfin de l'eau. Tout est fusionné en quelques géométries partagées (pas de lumière par pièce)
 */

// ---------------- Géométries (faites à la première demande) ----------------
const cache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: (p: Parts) => void) {
  let g = cache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; cache.set(key, g); }
  return g;
}

/** Un triangle à deux faces dans un plan z = constante (une voile en lambeaux), points (x, y) */
function rag(p: Parts, z: number, pts: [number, number][], color: number) {
  const v = pts.flatMap(([x, y]) => [x, y, z]), r = pts.slice().reverse().flatMap(([x, y]) => [x, y, z]);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...v, ...r], 3)), 0, 0, 0, color);
}

const GOLD = 0xe2b13c, GOLD2 = 0xf2cb52, IRON = 0x33373d, TERRA = 0xb8693e;

/** Un canon de fonte (culasse vers -x, bouche vers +x), posé sur son affût de bois */
function cannon(p: Parts, x: number, y: number, z: number, ry = 0, rz = 0, k = 1) {
  p.add(new THREE.CylinderGeometry(0.013 * k, 0.009 * k, 0.1 * k, 7).rotateZ(Math.PI / 2), x, y, z, IRON, ry, false, rz);
  p.add(new THREE.CylinderGeometry(0.0145 * k, 0.0145 * k, 0.006 * k, 7).rotateZ(Math.PI / 2), x - 0.02 * k, y, z, 0x23262b, ry, false, rz);
  p.add(new THREE.CylinderGeometry(0.011 * k, 0.011 * k, 0.005 * k, 7).rotateZ(Math.PI / 2), x + 0.03 * k, y, z, 0x23262b, ry, false, rz);
}
function barrel(p: Parts, x: number, y: number, z: number, lying = false, ry = 0) {
  if (lying) {
    p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.044, 8).rotateZ(Math.PI / 2), x, y + 0.022, z, 0x6b4a30, ry);
    for (const d of [-0.014, 0.014]) p.add(new THREE.CylinderGeometry(0.0235, 0.0235, 0.004, 8).rotateZ(Math.PI / 2), x + Math.cos(ry) * d, y + 0.022, z - Math.sin(ry) * d, IRON, ry);
  } else {
    p.cyl(0.022, 0.022, 0.044, 8, x, y, z, 0x6b4a30);
    for (const h of [0.008, 0.034]) p.cyl(0.0235, 0.0235, 0.004, 8, x, y + h, z, IRON);
  }
}
function amphora(p: Parts, x: number, y: number, z: number, k = 1, rz = 0) {
  p.add(new THREE.IcosahedronGeometry(0.026 * k, 1).scale(1, 1.3, 1).translate(0, 0.034 * k, 0), x, y, z, TERRA, 0, false, rz);
  p.add(new THREE.CylinderGeometry(0.01 * k, 0.014 * k, 0.03 * k, 6).translate(0, 0.07 * k, 0), x, y, z, TERRA, 0, false, rz);
  p.add(new THREE.CylinderGeometry(0.015 * k, 0.015 * k, 0.006 * k, 6).translate(0, 0.088 * k, 0), x, y, z, 0x9c5530, 0, false, rz);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.004 * k, 0.03 * k, 0.004 * k).translate(s * 0.016 * k, 0.07 * k, 0), x, y, z, 0x9c5530, 0, false, rz);
}
function ingots(p: Parts, x: number, y: number, z: number, ry = 0, k = 1) {
  for (const [dx, dy, dz, c] of [[-0.036, 0, -0.008, GOLD], [0, 0, 0.008, GOLD2], [0.036, 0, -0.008, GOLD], [-0.018, 0.016, 0, GOLD2], [0.018, 0.016, 0, GOLD], [0, 0.032, -0.004, GOLD2]] as number[][])
    p.add(new THREE.BoxGeometry(0.034 * k, 0.016 * k, 0.02 * k).translate(0, 0.008 * k, 0), x + (Math.cos(ry) * dx + Math.sin(ry) * dz) * k, y + dy * k, z + (Math.cos(ry) * dz - Math.sin(ry) * dx) * k, c, ry);
}
function chest(p: Parts, k = 1) {
  p.box(0.07 * k, 0.04 * k, 0.045 * k, 0, 0, 0, 0x7a4f2e);
  p.box(0.073 * k, 0.014 * k, 0.048 * k, 0, 0.04 * k, 0, 0x8a5c36);
  for (const s of [-1, 1]) p.box(0.008 * k, 0.056 * k, 0.05 * k, s * 0.024 * k, 0, 0, IRON);
  p.box(0.012 * k, 0.016 * k, 0.006 * k, 0, 0.026 * k, 0.025 * k, GOLD);
}

/** Les trésors du fond : le coffre doré du final (de la taille d'un petit bahut) */
function goldChest(p: Parts) {
  p.box(0.11, 0.058, 0.07, 0, 0, 0, 0xe0b030);
  p.box(0.108, 0.02, 0.068, 0, 0.058, 0, 0xf0c542);
  p.box(0.1, 0.014, 0.06, 0, 0.076, 0, 0xd9a62a);
  for (const s of [-1, 1]) p.box(0.012, 0.09, 0.074, s * 0.036, 0, 0, 0xb8801f);
  p.box(0.024, 0.03, 0.008, 0, 0.034, 0.038, 0x8a5a1a);
  for (const [x, c] of [[-0.03, 0xc8344a], [0.03, 0x3a8ad8], [0, 0x4ab86a]] as number[][]) p.sphere(0.008, x, 0.07, 0.036, c);
  for (const s of [-1, 1]) p.box(0.016, 0.014, 0.016, s * 0.046, -0.004, s * 0.026, 0x8a5a1a);
}

/** L'épave du galion, de profil vers +z (étambot à -z), le côté ouvert à +x (la brèche), l'origine au pied de la quille */
function galleon(p: Parts) {
  const wood = 0x7d5c42, plank = 0x6b4e38, dark = 0x4b392c, moss = 0x4f6f55, trim = 0xcaa24a, cloth = 0xd9d1b6;
  const half = (z: number) => 0.012 + 0.082 * Math.pow(Math.max(0, 1 - Math.pow((z + 0.03) / 0.36, 2)), 0.55);
  const lean = 0.34, tl = Math.tan(lean);
  // quille, étrave brisée, étambot
  p.box(0.026, 0.03, 0.62, 0, -0.012, 0, dark);
  p.add(new THREE.BoxGeometry(0.02, 0.17, 0.02).translate(0, 0.085, 0), 0, 0, 0.3, dark, 0, false, 0, 0.5);
  p.add(new THREE.BoxGeometry(0.024, 0.2, 0.02).translate(0, 0.1, 0), 0, 0, -0.3, dark, 0, false, 0, -0.18);
  // fond de cale sombre
  p.box(0.12, 0.004, 0.58, 0, 0.022, 0, 0x2e251f);
  // les membrures : entières côté -x, brisées côté ouvert (+x)
  for (let i = 0; i < 11; i++) {
    const z = -0.3 + i * 0.06, b = half(z) * 0.8;
    for (const s of [-1, 1]) {
      const open = s > 0 && z > -0.1, h = open ? 0.06 + ((i * 7) % 4) * 0.025 : 0.15;
      p.box(0.012, h, 0.014, s * b, 0, z, dark, 0, false, -s * lean);
    }
  }
  // le bordé qui reste : tout le côté fermé, la poupe, quelques virures en bas côté ouvert (moussues à la flottaison basse)
  for (let i = 0; i < 10; i++) {
    const z = -0.27 + i * 0.06, b = half(z) * 0.8;
    for (const s of [-1, 1]) {
      const rows = s < 0 ? 5 : z < -0.12 ? 4 : z < 0.05 ? 2 : z < 0.17 ? 1 : 0;
      for (let r = 0; r < rows; r++) {
        if (s > 0 && (i * 5 + r * 3) % 7 === 0) continue;
        const y = 0.012 + r * 0.03;
        p.box(0.008, 0.028, 0.062, s * (b + tl * y), y, z, r === 0 ? moss : (i + r) % 2 ? wood : plank, 0, false, -s * lean);
      }
    }
  }
  // le pont qui reste, troué (la cale s'ouvre dessous)
  for (let i = 0; i < 10; i++) {
    const z = -0.27 + i * 0.06, w = half(z) * 1.55;
    p.box(w, 0.01, 0.014, 0, 0.138, z - 0.022, dark);
    if (i % 3 === 1) continue;
    p.box(w * 0.96, 0.006, 0.056, 0, 0.146, z, i % 2 ? 0x8a6a4a : 0x7a5a40);
  }
  // la dunette : tableau arrière aux fenêtres et au liseré d'or, murs, un morceau de toit
  p.box(0.2, 0.1, 0.012, 0, 0.145, -0.305, plank);
  p.box(0.2, 0.01, 0.014, 0, 0.222, -0.305, trim);
  for (const x of [-0.06, 0, 0.06]) {
    p.box(0.036, 0.03, 0.003, x, 0.172, -0.313, trim);
    p.box(0.028, 0.022, 0.004, x, 0.176, -0.314, 0x20222a);
  }
  p.box(0.012, 0.09, 0.18, -0.098, 0.145, -0.22, wood);
  p.box(0.012, 0.045, 0.1, 0.098, 0.145, -0.26, plank);
  p.box(0.1, 0.01, 0.17, -0.05, 0.235, -0.22, wood);
  p.cyl(0.008, 0.01, 0.03, 6, -0.08, 0.245, -0.305, trim);
  // le château d'avant, pulvérisé
  p.box(0.012, 0.06, 0.08, -0.07, 0.145, 0.24, wood);
  p.box(0.1, 0.05, 0.012, 0, 0.145, 0.27, plank, 0, false, 0.12);
  // mâts brisés (grand mât, misaine, artimon) aux têtes en éclats
  const mast = (z: number, h: number, r: number) => {
    p.cyl(r * 0.8, r, h, 6, 0, 0.0, z, dark);
    p.cone(r * 0.85, 0.06, 4, 0, h - 0.01, z, wood);
    p.add(new THREE.ConeGeometry(r * 0.5, 0.05, 4).translate(0, 0.025, 0), r * 0.6, h - 0.02, z, 0x8a6a4a, 0, false, -0.4);
  };
  mast(0.02, 0.42, 0.014);
  mast(0.2, 0.32, 0.011);
  mast(-0.17, 0.26, 0.009);
  // la grande vergue brisée pend de travers, avec ses voiles en lambeaux
  p.box(0.34, 0.01, 0.01, 0, 0.31, 0.026, dark, 0, false, 0.45);
  rag(p, 0.03, [[-0.15, 0.235], [0.14, 0.37], [0.02, 0.12]], cloth);
  rag(p, 0.034, [[-0.15, 0.235], [-0.03, 0.29], [-0.12, 0.15]], 0xb9b29a);
  p.box(0.22, 0.008, 0.008, 0, 0.25, 0.2, dark, 0, false, -0.35);
  rag(p, 0.204, [[-0.1, 0.29], [0.02, 0.24], [-0.04, 0.16]], 0xc8c0a6);
  // le beaupré, l'ancre pendue à l'étrave, la chaîne
  p.add(new THREE.CylinderGeometry(0.006, 0.009, 0.22, 5).rotateX(Math.PI / 2 - 0.35), 0, 0.15, 0.38, dark);
  p.box(0.005, 0.07, 0.005, -0.095, 0.04, 0.2, IRON);
  p.box(0.05, 0.005, 0.005, -0.095, 0.1, 0.2, IRON);
  for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.01, 0.025, 3).rotateZ(s * 1.0), -0.095 + s * 0.016, 0.034, 0.2, IRON);
  // les canons : deux qui sortent des sabords ouverts, un à terre de chaque côté
  cannon(p, 0.075, 0.075, 0.06);
  cannon(p, 0.08, 0.07, 0.15, 0.1);
  cannon(p, 0.2, 0.012, -0.05, 0.45, 0.1);
  cannon(p, 0.18, 0.012, 0.22, -0.6, -0.08);
  // la cargaison dans la cale : lingots, amphores, tonneaux
  ingots(p, 0.02, 0.026, 0.1, 0.3);
  ingots(p, -0.03, 0.026, -0.02, -0.4, 0.9);
  amphora(p, 0.04, 0.026, 0.02, 0.9);
  amphora(p, -0.04, 0.026, 0.19, 0.8, 0.5);
  barrel(p, 0.0, 0.026, -0.12);
  barrel(p, 0.05, 0.026, 0.21, true, 0.7);
  barrel(p, -0.06, 0.15, -0.2);
  barrel(p, 0.22, 0.012, 0.08, true, 0.3);
  barrel(p, 0.2, 0.012, 0.0);
  // des pièces d'or répandues sur le sable près de la brèche
  for (const [x, z] of [[0.15, 0.1], [0.18, 0.04], [0.14, -0.02], [0.2, 0.14], [0.16, 0.17], [0.12, 0.06], [0.22, 0.02], [0.17, -0.08]] as number[][])
    p.cyl(0.008, 0.008, 0.003, 6, x, 0.003, z, GOLD);
  p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(1, 0.6, 1), 0.16, 0.0, 0.12, 0x8a6a4a);
  // algues pendues aux mâts et aux bordages
  for (const [x, y, z, h] of [[0.0, 0.42, 0.02, 0.1], [0.012, 0.32, 0.2, 0.08], [-0.098, 0.145, -0.1, 0.07], [-0.1, 0.24, -0.22, 0.08], [0.0, 0.26, -0.17, 0.07]] as number[][]) {
    p.box(0.006, h, 0.006, x, y - h, z, 0x3f7a4a, 0, false, 0.1);
    p.box(0.005, h * 0.8, 0.005, x + 0.008, y - h * 0.8, z + 0.004, 0x56a05c, 0, false, -0.12);
  }
}

/** Le banc de sable sous l'épave (hauteur 0,5, dessus plat de rayon 0,6), ses rochers, ses coraux et ses algues */
function mound(p: Parts) {
  const sand = 0xd6c594, sand2 = 0xc3b080;
  p.add(new THREE.CylinderGeometry(0.6, 1.05, 0.5, 10).translate(0, 0.25, 0), 0, 0, 0, sand);
  p.add(new THREE.CylinderGeometry(1.05, 1.3, 0.1, 10).translate(0, 0.05, 0), 0, 0, 0, sand2, 0.2);
  // rochers sur les flancs
  for (let i = 0; i < 11; i++) {
    const a = i * 0.57 + 0.3, y = (i % 3) * 0.12 + 0.04, r = 1.07 - 0.9 * y, rad = 0.07 + (i % 4) * 0.03;
    p.add(new THREE.IcosahedronGeometry(rad, 0).scale(1, 0.7, 1), Math.cos(a) * r, y + rad * 0.3, Math.sin(a) * r, i % 2 ? 0x80796f : 0x6c675f);
  }
  // coraux en buissons, tubes et éventails à l'orée du plateau et sur les flancs
  const cols = [0xe8774a, 0xe0508a, 0x9a5ac8, 0xf0c04a];
  for (let i = 0; i < 12; i++) {
    const a = i * 0.52 + 0.1, y = (i % 2) * 0.22 + 0.28, r = 1.07 - 0.9 * y - 0.03, x = Math.cos(a) * r, z = Math.sin(a) * r, c = cols[i % 4];
    for (let j = 0; j < 3; j++) p.add(new THREE.ConeGeometry(0.018, 0.1 + j * 0.03, 5).translate(0, 0.05, 0), x + (j - 1) * 0.03, y, z + (j % 2) * 0.025, c, 0, false, (j - 1) * 0.3, (j % 2) * 0.2);
  }
  // les algues : des tiges en zigzag
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 0.5, y = 0.5 - (i % 3) * 0.09, r = 1.07 - 0.9 * y - 0.05, x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let j = 0; j < 4; j++) p.box(0.012, 0.085, 0.012, x + Math.sin(j * 1.7 + i) * 0.014, y + j * 0.08, z + Math.cos(j * 1.3 + i) * 0.014, j % 2 ? 0x56a05c : 0x3f8a52, 0, false, Math.sin(j * 2 + i) * 0.16);
  }
}

/** Le bateau de relevage : une gabare plate amarrée au flanc du bateau de l'équipe (+x : le côté de l'épave, +z : l'avant) */
function barge(p: Parts) {
  const wood = 0x8c6a46, dark = 0x57412f, deck = 0xb99a6c, iron = 0x3a3f47, rope = 0xcdbb8c;
  p.box(0.24, 0.055, 0.56, 0, -0.025, 0, dark);
  p.box(0.25, 0.012, 0.57, 0, 0.018, 0, wood);
  p.box(0.22, 0.004, 0.54, 0, 0.03, 0, deck);
  for (const s of [-1, 1]) p.box(0.01, 0.035, 0.56, s * 0.12, 0.03, 0, wood);
  for (const s of [-1, 1]) p.box(0.24, 0.035, 0.01, 0, 0.03, s * 0.28, wood);
  // défenses de chanvre côté bateau, passerelle et amarres
  for (const z of [-0.18, 0, 0.18]) p.cyl(0.018, 0.018, 0.05, 6, -0.135, -0.02, z, rope);
  p.box(0.1, 0.006, 0.04, -0.17, 0.034, 0, wood);
  for (const z of [-0.15, 0.15]) p.box(0.1, 0.005, 0.005, -0.17, 0.044, z, rope);
  // le pied de la grue : socle et mât, qui porte la flèche
  p.cyl(0.035, 0.045, 0.04, 8, 0.02, 0.03, 0.17, iron);
  p.cyl(0.012, 0.016, 0.23, 6, 0.02, 0.07, 0.17, 0x4a5560);
  p.cyl(0.017, 0.017, 0.012, 6, 0.02, 0.15, 0.17, 0xb23a2e);
  p.cyl(0.022, 0.022, 0.02, 8, 0.02, 0.29, 0.17, iron);
  // le treuil à vapeur : caisse, tambour de câble, cheminée à bague rouge
  p.box(0.09, 0.06, 0.1, -0.06, 0.034, 0.22, 0x3c4d63);
  p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8).rotateZ(Math.PI / 2), -0.06, 0.1, 0.19, 0x7a5a40);
  p.cyl(0.011, 0.014, 0.09, 6, -0.085, 0.094, 0.25, 0x2a2a2e);
  p.cyl(0.015, 0.015, 0.008, 6, -0.085, 0.14, 0.25, 0xb23a2e);
  // bittes, cordage lové, un tonneau de rechange
  for (const z of [-0.25, 0.25]) p.cyl(0.01, 0.012, 0.03, 6, 0.1, 0.034, z, iron);
  p.cyl(0.03, 0.03, 0.015, 8, 0.08, 0.034, -0.24, rope);
  p.cyl(0.022, 0.022, 0.044, 8, -0.09, 0.034, -0.24, 0x6b4a30);
}
/** La flèche de la grue (le long de +z, pivotant autour du pied), ses haubans et son contrepoids */
function boom(p: Parts) {
  const iron = 0x3a3f47;
  p.box(0.016, 0.016, 0.66, 0, -0.008, 0.23, 0x4a5560);
  p.box(0.04, 0.04, 0.04, 0, -0.03, -0.1, 0x2b2e34);
  p.box(0.008, 0.07, 0.008, 0, 0.008, 0.0, iron);
  p.add(new THREE.BoxGeometry(0.004, 0.004, 0.565), 0, 0.043, 0.28, 0x6a5a48, 0, false, 0, 0.138);
  p.add(new THREE.BoxGeometry(0.004, 0.004, 0.14), 0, 0.045, -0.04, 0x6a5a48, 0, false, 0, -0.5);
  p.box(0.012, 0.012, 0.012, 0, 0.0, 0.56, iron);
}
/** Le chariot qui roule sur la flèche (le câble y pend) */
const trolleyGeo = () => geo('salvTrolley', (p) => p.box(0.03, 0.022, 0.03, 0, -0.022, 0, 0x2b2e34));
/** Le crochet à quatre griffes, l'origine à son point d'attache */
function hook(p: Parts) {
  p.box(0.024, 0.03, 0.018, 0, -0.03, 0, IRON);
  p.cyl(0.004, 0.004, 0.03, 5, 0, -0.06, 0, IRON);
  for (const [x, z, rz, rx] of [[0.009, 0, 0.35, 0], [-0.009, 0, -0.35, 0], [0, 0.009, 0, -0.35], [0, -0.009, 0, 0.35]] as number[][])
    p.add(new THREE.ConeGeometry(0.006, 0.05, 4).rotateX(Math.PI).translate(0, -0.095, 0), x, 0, z, 0x4a4e56, 0, false, rz, rx);
}
/** La pompe à bras du scaphandrier : établi de laiton, deux volants, bras, serpentin de tuyau */
function pump(p: Parts) {
  p.box(0.11, 0.035, 0.07, 0, 0, 0, 0x6a4a34);
  p.box(0.1, 0.045, 0.06, 0, 0.035, 0, 0xb8732f);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10).rotateZ(Math.PI / 2), s * 0.058, 0.07, 0, 0x8a5a38);
  p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 5).rotateZ(Math.PI / 2), 0, 0.07, 0, IRON);
  p.box(0.01, 0.07, 0.01, 0.062, 0.07, 0.0, 0x6a4a34, 0, false, 0.3);
  p.cyl(0.03, 0.03, 0.018, 8, -0.01, 0.0, -0.06, 0x2e2a28);
  p.cyl(0.006, 0.006, 0.05, 5, 0.025, 0.08, 0, 0xb8732f);
}
/** Les pièces de butin remontées sur le pont, l'origine à leur pied : coffre, amphore, canon, lingots, bordages noircis */
const LOOT_KINDS = ['chest', 'amphora', 'cannon', 'ingots', 'planks'] as const;
type LootKind = typeof LOOT_KINDS[number];
const lootGeo = (kind: LootKind) => geo(`salvLoot:${kind}`, (p) => {
  if (kind === 'chest') chest(p);
  else if (kind === 'amphora') amphora(p, 0, 0, 0, 1.15);
  else if (kind === 'cannon') { p.box(0.05, 0.012, 0.03, 0, 0, 0, 0x6b4a30); cannon(p, 0, 0.026, 0, 0, 0, 1.15); p.sphere(0.01, -0.01, 0.034, 0.012, 0x4f6f55); }
  else if (kind === 'ingots') ingots(p, 0, 0, 0, 0, 1.1);
  else for (const [x, y, z, ry, c] of [[0, 0, 0, 0.1, 0x3a2e26], [0.004, 0.01, 0.014, -0.12, 0x4a3a2e], [-0.004, 0.02, -0.01, 0.2, 0x3a2e26]] as number[][]) {
    p.box(0.11, 0.01, 0.026, x, y, z, c, ry);
    p.sphere(0.007, x + 0.02, y + 0.012, z, 0x8a8a7a);
  }
});
const goldChestGeo = () => geo('salvGold', goldChest);
const glintGeo = () => geo('salvGlint', (p) => {
  p.add(new THREE.OctahedronGeometry(0.016, 0).scale(0.3, 1.2, 0.3), 0, 0, 0, 0xfff1b0);
  p.add(new THREE.OctahedronGeometry(0.016, 0).scale(0.3, 1.2, 0.3), 0, 0, 0, 0xfff1b0, 0, false, Math.PI / 2);
  p.add(new THREE.OctahedronGeometry(0.016, 0).scale(0.3, 1.2, 0.3), 0, 0, 0, 0xfff1b0, Math.PI / 2, false, Math.PI / 2);
});
const bubbleGeo = () => geo('salvBubble', (p) => p.sphere(0.011, 0, 0, 0, 0xffffff, 0));
const fishGeo = () => geo('salvFish', (p) => {
  p.sphere(0.03, 0, 0, 0, 0xffffff, 0, 0.55);
  p.add(new THREE.ConeGeometry(0.02, 0.035, 3).rotateX(-Math.PI / 2), 0, 0, -0.04, 0xf0f0f0);
});

/** Le scaphandrier : casque de cuivre à hublots, combinaison de toile, bottes de plomb, tuyau d'air (le XIXe siècle) */
function copperDiver(p: Parts) {
  const suit = 0x7d8a63, lead = 0x4a4d55, copper = 0xb8732f, glass = 0x9fd8e0;
  for (const s of [-1, 1]) { p.box(0.03, 0.025, 0.055, s * 0.025, 0, 0.008, lead); p.box(0.034, 0.07, 0.034, s * 0.025, 0.02, 0, suit); }
  p.box(0.09, 0.09, 0.06, 0, 0.085, 0, suit);
  p.box(0.095, 0.012, 0.065, 0, 0.085, 0, 0x44464c);
  p.cyl(0.04, 0.045, 0.02, 8, 0, 0.17, 0, copper);
  p.sphere(0.042, 0, 0.215, 0, copper, 1);
  p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 8).rotateX(Math.PI / 2), 0, 0.218, 0.042, glass);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 8).rotateZ(Math.PI / 2), s * 0.04, 0.218, 0, glass);
  p.cyl(0.008, 0.008, 0.012, 6, 0, 0.255, 0, copper);
  p.add(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 5).rotateX(Math.PI / 2), 0, 0.215, -0.06, 0x3a2f28);
  for (const s of [-1, 1]) { p.box(0.026, 0.07, 0.026, s * 0.062, 0.1, 0, suit, 0, false, s * 0.2); p.sphere(0.014, s * 0.08, 0.095, 0, lead); }
  p.box(0.03, 0.025, 0.012, 0, 0.12, 0.036, 0x44464c);
  p.box(0.03, 0.025, 0.012, 0, 0.12, -0.036, 0x44464c);
}
/** Le plongeur moderne : combinaison noire, bouteille d'air jaune, masque, palmes */
function scubaDiver(p: Parts) {
  const suit = 0x24262c, yellow = 0xf2c230, skin = 0xe0b090;
  for (const s of [-1, 1]) { p.box(0.03, 0.006, 0.07, s * 0.025, 0, 0.03, yellow); p.box(0.03, 0.07, 0.03, s * 0.022, 0.006, 0, suit); }
  p.box(0.08, 0.085, 0.05, 0, 0.075, 0, suit);
  p.box(0.082, 0.012, 0.052, 0, 0.12, 0, yellow);
  p.cyl(0.02, 0.02, 0.1, 8, 0, 0.08, -0.052, 0xd9dde2);
  p.cyl(0.0215, 0.0215, 0.008, 8, 0, 0.11, -0.052, yellow);
  p.cyl(0.006, 0.006, 0.02, 5, 0, 0.18, -0.052, 0x8a8f96);
  p.sphere(0.03, 0, 0.19, 0, suit, 1);
  p.box(0.04, 0.02, 0.012, 0, 0.195, 0.03, 0x1a1a1e);
  p.box(0.034, 0.012, 0.004, 0, 0.2, 0.037, 0x7fd0e8);
  for (const s of [-1, 1]) { p.box(0.022, 0.07, 0.022, s * 0.055, 0.085, 0, suit, 0, false, s * 0.2); p.sphere(0.011, s * 0.072, 0.082, 0, skin); }
}

// ---------------- Matériaux ----------------
const GLINT = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, depthWrite: false });
const CABLE = new THREE.LineBasicMaterial({ color: 0x4a3a2c });
const HOSE = new THREE.LineBasicMaterial({ color: 0x2a211c });

/** Ce qu'il faut de la scène hôte */
export interface SalvageHost {
  world: World;
  agents: Agents;
  group: THREE.Group;
  /** niveau de l'eau en un point si l'on y flotte, sinon null */
  depth(x: number, z: number): number | null;
  /** une gerbe d'écume */
  splash(x: number, z: number, level: number, big?: boolean): void;
}
export interface SalvageBoat { obj: THREE.Object3D; home: [number, number]; out: [number, number]; y: number }

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), TW = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1);
/** Rangs de butin (deux pièces par charge) selon l'ouvrage : à la drague, des bordages et de la ferraille ; au scaphandrier, l'or */
const LOOT_DREDGE: LootKind[][] = [['planks', 'cannon'], ['amphora', 'ingots'], ['planks', 'cannon'], ['ingots', 'amphora'], ['planks', 'chest'], ['cannon', 'ingots']];
const LOOT_DIVER: LootKind[][] = [['chest', 'amphora'], ['cannon', 'ingots'], ['amphora', 'chest'], ['ingots', 'cannon'], ['chest', 'ingots'], ['amphora', 'cannon']];
/** Les points du fond où la grue accroche (dans le repère de l'épave) : l'avant de la cale, le milieu, la poupe… puis le coffre doré */
const PICKS: [number, number][] = [[0.03, 0.14], [0.0, -0.04], [0.04, 0.2], [0.02, 0.06], [0.04, -0.12], [0.0, 0.17], [0.03, 0.02]];
const WRECK_K = 1.6;
const BOOM_Y = 0.3, BOOM_MAX = 0.56, PIVOT: [number, number] = [0.02, 0.17], LEN_TOP = 0.06;
const FISH_N = 24, BUBBLE_N = 40;
const FISH_COLORS = [0xff8a3a, 0xffd23a, 0x4aa8ff, 0xe8f0f4];

export class Salvage {
  /** tout ce qui est posé dans la scène (pour le fondu à l'écart de l'équipe et le rangement) */
  readonly objs: THREE.Object3D[] = [];
  /** le cœur de la scène : entre le bateau et l'épave */
  focus: [number, number];
  private t = 0;
  private s = 1;
  private level: number;
  private floor: number;
  private wreck = new THREE.Group();
  private mound: THREE.Mesh;
  private vault: THREE.Mesh;
  private barge = new THREE.Group();
  private boomPivot = new THREE.Group();
  private trolley: THREE.Mesh;
  private hookG = new THREE.Group();
  private cable: THREE.Line;
  private carry: THREE.Mesh[] = [];
  private prizeCarry: THREE.Mesh;
  private prize: THREE.Mesh;
  private slots: { m: THREE.Mesh; glint: THREE.Mesh | null; t: number }[] = [];
  private glints: { m: THREE.Mesh; ph: number; base: number }[] = [];
  private fish: THREE.InstancedMesh;
  private bubbles: THREE.InstancedMesh;
  private men: THREE.Mesh[] = [];
  private hose: THREE.Line | null = null;
  private pickW: THREE.Vector3[] = [];
  private kinds: LootKind[][];
  private shown = 0;
  private prizeShown = false;
  private hookY = 0;
  private diverIn = false;
  private diverSplash = 0;
  private hidden = false;
  private crew: number[];
  /** les sources de bulles (position, actif) : le plongeur, les écoutilles de l'épave, le crochet */
  private src: { p: THREE.Vector3; on: boolean }[] = [];
  private wreckAt = new THREE.Vector3();
  /** les débris qui flottent autour de l'épave : tonneaux et planches */
  private flot: { m: THREE.Mesh; x: number; z: number; ph: number }[] = [];
  /** où en est le crochet (angle, portée de la flèche) et la charge */
  private ph = 0;
  private rr = 0.4;

  constructor(private h: SalvageHost, private bt: SalvageBoat, party: number[], private diver: boolean, private age: number) {
    this.crew = party;
    this.level = bt.y;
    const dir = Math.atan2(bt.out[0] - bt.home[0], bt.out[1] - bt.home[1]), px = Math.cos(dir), pz = -Math.sin(dir), fx = Math.sin(dir), fz = Math.cos(dir);
    // le côté de l'eau libre où l'épave gît, de l'autre côté de la gabare
    const spot = (s: number): [number, number] => [bt.out[0] + px * s * 0.78 + fx * 0.1, bt.out[1] + pz * s * 0.78 + fz * 0.1];
    const clear = (s: number) => { const [x, z] = spot(s); let n = 0; for (const [dx, dz] of [[0, 0], [fx * 0.45, fz * 0.45], [-fx * 0.45, -fz * 0.45], [px * s * 0.4, pz * s * 0.4], [-px * s * 0.4, -pz * s * 0.4]]) if (h.depth(x + dx, z + dz) !== null) n++; return n; };
    this.s = clear(1) >= clear(-1) ? 1 : -1;
    const [cx, cz] = spot(this.s);
    this.floor = h.world.hAt(cx, cz);
    const keel = Math.max(this.level - 0.2, this.floor + 0.02), psi = dir + (this.s > 0 ? Math.PI : 0);
    this.focus = [(bt.out[0] + cx) / 2, (bt.out[1] + cz) / 2];
    this.wreckAt.set(cx, keel, cz);

    // le banc de sable, l'épave dessus (gîte vers la brèche, étrave qui plonge)
    this.mound = new THREE.Mesh(geo('salvMound', mound), mats.body);
    this.mound.receiveShadow = true;
    this.mound.position.set(cx, this.floor, cz);
    this.mound.scale.y = Math.max(0.05, (keel - this.floor) / 0.5);
    this.mound.rotation.y = psi;
    const hull = new THREE.Mesh(geo('salvGalleon', galleon), mats.body);
    hull.castShadow = true;
    this.wreck.add(hull);
    this.vault = new THREE.Mesh(goldChestGeo(), mats.body);
    this.vault.position.set(0.03, 0.026, 0.02);
    this.vault.rotation.y = 0.5;
    this.wreck.add(this.vault);
    this.wreck.position.set(cx, keel, cz);
    this.wreck.scale.setScalar(WRECK_K);
    this.wreck.rotation.set(0.1, psi, -0.2, 'YXZ');
    this.wreck.updateMatrixWorld(true);
    this.pickW = PICKS.map(([x, z]) => new THREE.Vector3(x, 0.05, z).applyMatrix4(this.wreck.matrixWorld));
    // des éclats d'or sur le sable et dans la cale (ils scintillent)
    for (const [x, y, z] of [[0.02, 0.07, 0.1], [0.16, 0.03, 0.08], [0.18, 0.03, 0.15], [0.14, 0.03, -0.01], [-0.03, 0.06, -0.02]]) this.addGlint(this.wreck, x, y, z, 1);
    this.add(this.mound, this.wreck);
    // des tonneaux et des planches qui flottent autour
    for (let i = 0; i < 6; i++) {
      const a = psi + 0.6 + i * 1.05, r = 0.7 + (i % 3) * 0.22, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.8;
      if (h.depth(x, z) === null) continue;
      const m = new THREE.Mesh(i % 2 ? lootGeo('planks') : geo('salvBarrel', (p) => barrel(p, 0, 0, 0, true)), mats.body);
      m.castShadow = true;
      this.flot.push({ m, x, z, ph: i * 1.3 });
      this.add(m);
    }

    // la gabare amarrée au flanc du bateau, côté épave
    bt.obj.add(this.barge);
    this.barge.position.set(this.s * 0.3, 0, -0.02);
    this.barge.rotation.y = this.s > 0 ? 0 : Math.PI;
    const deck = new THREE.Mesh(geo('salvBarge', barge), mats.body);
    deck.castShadow = true;
    this.barge.add(deck);
    if (diver) { const pm = new THREE.Mesh(geo('salvPump', pump), mats.body); pm.position.set(0.075, 0.034, 0.23); pm.rotation.y = -0.4; this.barge.add(pm); }
    this.boomPivot.position.set(PIVOT[0], BOOM_Y, PIVOT[1]);
    const bm = new THREE.Mesh(geo('salvBoom', boom), mats.body);
    bm.castShadow = true;
    this.boomPivot.add(bm);
    this.trolley = new THREE.Mesh(trolleyGeo(), mats.body);
    this.boomPivot.add(this.trolley);
    this.barge.add(this.boomPivot);

    // le crochet, son câble, ce qu'il porte (deux pièces, ou le coffre doré)
    const hk = new THREE.Mesh(geo('salvHook', hook), mats.body);
    hk.castShadow = true;
    this.hookG.add(hk);
    this.kinds = diver ? LOOT_DIVER : LOOT_DREDGE;
    for (const dx of [-0.04, 0.04]) { const m = new THREE.Mesh(lootGeo('chest'), mats.body); m.position.set(dx, -0.13, 0); m.castShadow = true; m.visible = false; this.hookG.add(m); this.carry.push(m); }
    this.prizeCarry = new THREE.Mesh(goldChestGeo(), mats.body);
    this.prizeCarry.position.set(0, -0.15, 0);
    this.prizeCarry.visible = false;
    this.hookG.add(this.prizeCarry);
    this.cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), CABLE);
    this.cable.frustumCulled = false; this.cable.userData.flat = true;
    this.add(this.hookG, this.cable);

    // le butin qui s'entasse sur le pont, deux pièces par charge ; le coffre doré, au bout
    for (let i = 0; i < LOOT; i++) {
      const kind = this.kinds[i >> 1][i & 1], m = new THREE.Mesh(lootGeo(kind), mats.body);
      m.position.set(i & 1 ? 0.045 : -0.045, 0.034, 0.07 - (i >> 1) * 0.04);
      m.rotation.y = ((i * 37) % 7) * 0.12 - 0.3;
      m.castShadow = true; m.visible = false;
      this.barge.add(m);
      this.slots.push({ m, glint: kind === 'chest' || kind === 'ingots' ? this.addGlint(this.barge, m.position.x, 0.095, m.position.z, 0) : null, t: 0 });
    }
    this.prize = new THREE.Mesh(goldChestGeo(), mats.body);
    this.prize.position.set(0, 0.034, -0.215);
    this.prize.castShadow = true; this.prize.visible = false;
    this.barge.add(this.prize);
    this.addGlint(this.barge, -0.03, 0.15, -0.215, 0, true);
    this.addGlint(this.barge, 0.035, 0.12, -0.2, 0, true);

    // le plongeur (ou deux, de nos jours) et son tuyau d'air
    if (diver) {
      const old = age <= 3;
      for (let i = 0; i < (old ? 1 : 2); i++) {
        const m = new THREE.Mesh(geo(old ? 'salvCopper' : 'salvScuba', old ? copperDiver : scubaDiver), mats.body);
        m.scale.setScalar(0.8); m.castShadow = true; m.visible = false;
        this.men.push(m);
        this.add(m);
      }
      this.hose = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3())), HOSE);
      this.hose.frustumCulled = false; this.hose.userData.flat = true; this.hose.visible = false;
      this.add(this.hose);
    }

    // les poissons des bancs qui tournent autour de l'épave, et les bulles
    this.fish = new THREE.InstancedMesh(fishGeo(), mats.body, FISH_N);
    this.fish.frustumCulled = false;
    for (let i = 0; i < FISH_N; i++) this.fish.setColorAt(i, new THREE.Color(i >= FISH_N - 2 ? 0x8a5a4a : FISH_COLORS[(i / 7) | 0]));
    this.bubbles = new THREE.InstancedMesh(bubbleGeo(), mats.body, BUBBLE_N);
    this.bubbles.frustumCulled = false;
    for (let i = 0; i < 5; i++) this.src.push({ p: new THREE.Vector3(), on: false });
    this.add(this.fish, this.bubbles);
    // l'état de repos : la flèche au-dessus de l'épave, crochet haut
    bt.obj.updateMatrixWorld(true);
    [this.ph, this.rr] = this.pickPolar(0);
    this.hookY = this.level + BOOM_Y;
  }

  private add(...o: THREE.Object3D[]) { for (const x of o) { this.h.group.add(x); this.objs.push(x); } }

  /** Une étincelle (qui scintille) posée sous `parent` ; `on` : visible d'emblée */
  private addGlint(parent: THREE.Object3D, x: number, y: number, z: number, on: 0 | 1, big = false) {
    const m = new THREE.Mesh(glintGeo(), GLINT);
    m.position.set(x, y, z);
    m.renderOrder = 3;
    m.visible = !!on;
    parent.add(m);
    this.glints.push({ m, ph: this.glints.length * 1.7, base: big ? 1.6 : 1 });
    return m;
  }

  /** Dans le repère de la gabare : le point (x, z) du pont, à la hauteur y, dans le monde */
  private deckAt(x: number, y: number, z: number, out = new THREE.Vector3()) { return this.barge.localToWorld(out.set(x, y, z)); }

  /** Angle et portée de la flèche pour atteindre le point d'accroche n du fond (le point du monde, dans le repère de la gabare) */
  private pickPolar(n: number): [number, number] {
    const w = this.pickW[n], l = this.barge.worldToLocal(V.copy(w));
    return polar(l.x, l.z, PIVOT[0], PIVOT[1], 0.1, BOOM_MAX);
  }
  /** Idem pour déposer la charge n sur le pont (la paire de pièces de la charge, ou le coffre doré) */
  private dropPolar(n: number): [number, number] {
    return n >= NH ? polar(0, -0.215, PIVOT[0], PIVOT[1], 0.1, BOOM_MAX) : polar(0, 0.07 - n * 0.04, PIVOT[0], PIVOT[1], 0.1, BOOM_MAX);
  }

  /**
   * À chaque image : `k` l'avancement du travail (0 avant l'arrivée de l'équipe), `onSite` qu'elle y travaille, `away` qu'elle est
   * repartie
   */
  update(dt: number, k: number, onSite: boolean, away: boolean) {
    this.t += dt;
    const t = this.t, lv = this.level;
    if (away) k = 1;
    this.bt.obj.updateMatrixWorld(true);
    const h = haulAt(k), done = k >= WEND;
    // ---- la grue
    let tx = this.ph, tr = this.rr, y: number, carried = -1, prize = false;
    const top = lv + BOOM_Y - 0.012 - LEN_TOP;
    if (h && onSite) {
      const c = craneAt(h.f), pick = this.pickPolar(h.i), drop = this.dropPolar(h.i), next = this.pickPolar(Math.min(NH, h.i + 1));
      [tx, tr] = c.toNext > 0 ? mixPolar(drop, next, c.toNext) : mixPolar(pick, drop, c.toDeck);
      const yPick = this.pickW[h.i].y + 0.05, yDrop = this.deckAt(0, 0.034 + 0.085, 0, V2).y;
      y = top + c.lift * (yPick - top) + c.low * (yDrop - top);
      if (c.loaded && h.i < NH) carried = h.i;
      prize = h.i >= NH && c.loaded;
    } else {
      // au repos : la flèche attend au-dessus de l'épave ; le final fini, elle se range au-dessus du pont
      [tx, tr] = done && onSite || away ? this.dropPolar(NH) : this.pickPolar(0);
      y = top;
    }
    // (le pivot suit doucement : il ne saute pas quand le calendrier change de phase)
    const f = Math.min(1, dt * 6);
    this.ph += (tx - this.ph) * f;
    this.rr += (tr - this.rr) * f;
    this.boomPivot.rotation.y = this.ph;
    this.trolley.position.set(0, 0, this.rr);
    const tw = this.barge.localToWorld(TW.set(PIVOT[0] + Math.sin(this.ph) * this.rr, BOOM_Y - 0.012, PIVOT[1] + Math.cos(this.ph) * this.rr));
    const topY = tw.y;
    let hx = tw.x, hz = tw.z;
    if (h && onSite) {
      // au fond, le crochet vise l'objet même (le câble s'incline un peu quand le bateau tangue)
      const w = craneAt(h.f).lift;
      hx += (this.pickW[h.i].x - hx) * w; hz += (this.pickW[h.i].z - hz) * w;
    }
    // le crochet monte ou descend d'un seul tenant avec son câble ; au passage de l'eau, une gerbe
    const wasY = this.hookY;
    this.hookY = h && onSite ? y : topY - LEN_TOP;
    if ((wasY - lv) * (this.hookY - lv) < 0 && Math.abs(this.hookY - wasY) < 0.2) this.h.splash(hx, hz, lv, false);
    this.hookG.position.set(hx, this.hookY, hz);
    this.hookG.rotation.y = this.bt.obj.rotation.y + this.barge.rotation.y;
    const cp = this.cable.geometry.attributes.position as THREE.BufferAttribute;
    cp.setXYZ(0, tw.x, topY - 0.02, tw.z); cp.setXYZ(1, hx, this.hookY, hz); cp.needsUpdate = true;
    this.cable.geometry.computeBoundingSphere();
    // la charge au bout du crochet
    this.carry.forEach((m, i) => { m.visible = carried >= 0; if (carried >= 0) m.geometry = lootGeo(this.kinds[carried][i]); });
    this.prizeCarry.visible = prize;
    this.vault.visible = !(h && h.i >= NH && craneAt(h.f).loaded) && !(done && onSite) && !away;
    // ---- le butin sur le pont : il se pose pièce à pièce
    const loot = onSite || away ? lootAt(k) : { items: 0, prize: false };
    this.slots.forEach((sl, i) => {
      const on = i < loot.items;
      if (on && !sl.m.visible) sl.t = 0;
      sl.m.visible = on;
      if (on) { sl.t += dt; sl.m.scale.setScalar(smooth(Math.min(1, sl.t / 0.3)) * 0.4 + 0.6); }
      if (sl.glint) sl.glint.visible = on;
    });
    if (loot.prize && !this.prizeShown) this.h.splash(this.deckAt(0, 0.1, -0.215, V2).x, V2.z, lv, true);
    this.prizeShown = loot.prize;
    this.prize.visible = loot.prize;
    for (const g of this.glints) if (g.m.parent === this.barge && g.base > 1) g.m.visible = loot.prize;
    this.shown = loot.items;
    // ---- les étincelles d'or
    this.glints.forEach((g, i) => {
      const a = Math.abs(Math.sin(t * 2.6 + g.ph)), s = (0.25 + 0.95 * a * a * a) * g.base;
      g.m.scale.setScalar(Math.max(0.001, s));
      g.m.rotation.y = t * 0.9 + i;
    });
    for (const f of this.flot) { f.m.position.set(f.x + Math.sin(t * 0.15 + f.ph) * 0.03, lv - 0.012 + Math.sin(t * 1.2 + f.ph) * 0.01, f.z + Math.cos(t * 0.12 + f.ph) * 0.03); f.m.rotation.set(Math.sin(t + f.ph) * 0.1, f.ph + t * 0.05, Math.cos(t * 0.8 + f.ph) * 0.12); }
    // ---- le plongeur
    if (this.diver) this.stepDiver(dt, k, onSite, away, h, done);
    // ---- l'équipage à bord
    if (onSite) this.stepCrew(k, h, done);
    else if (this.hidden) { this.h.agents.partyHide([this.crew[0]], false); this.hidden = false; }
    this.stepSea(t, dt, k, h);
  }

  /** Le scaphandrier : à bord, il descend le long de la gabare, travaille sur l'épave (il accroche le crochet à chaque charge), remonte */
  private stepDiver(dt: number, k: number, onSite: boolean, away: boolean, h: ReturnType<typeof haulAt>, done: boolean) {
    const ph = onSite ? diveAt(k) : away ? { s: 'back' as const } : { s: 'deck' as const }, lv = this.level, t = this.t;
    const rail = this.deckAt(0.115, 0.034, 0.06, new THREE.Vector3());
    const idx = h ? h.i : done ? NH : 0, prev = Math.max(0, idx - 1);
    const spotAt = (n: number, out: THREE.Vector3) => out.copy(this.pickW[n]).setY(this.wreckAt.y + 0.04 + (this.old() ? 0 : 0.12));
    const a = spotAt(prev, new THREE.Vector3()), b = spotAt(idx, new THREE.Vector3());
    // ils se tiennent du côté de la brèche, un peu à l'écart du crochet
    const toBoat = this.deckAt(0, 0, 0, new THREE.Vector3()).sub(this.wreckAt).setY(0).normalize().multiplyScalar(0.07);
    a.add(toBoat); b.add(toBoat);
    const shown = ph.s === 'down' || ph.s === 'work' || ph.s === 'up';
    this.men.forEach((m, i) => {
      m.visible = shown;
      if (!shown) return;
      const p = V.copy(b);
      if (ph.s === 'down') { const u = smooth(ph.u); p.lerpVectors(rail, a, u); p.y = rail.y + (a.y - rail.y) * u; }
      else if (ph.s === 'up') { const u = smooth(ph.u); p.lerpVectors(b, rail, u); p.y = b.y + (rail.y - b.y) * u; }
      else if (h) p.lerpVectors(a, b, smooth(Math.min(1, h.f / 0.2)));
      // le second plongeur nage de l'autre côté du crochet
      if (i) { p.x += Math.cos(t * 0.5) * 0.08 + 0.06; p.z += Math.sin(t * 0.4) * 0.08 - 0.05; p.y += 0.1 + Math.sin(t * 1.3) * 0.02; }
      else p.y += Math.sin(t * 1.4) * 0.006;
      m.position.copy(p);
      const look = Math.atan2(this.pickW[idx].x - p.x, this.pickW[idx].z - p.z);
      // le scaphandrier de cuivre marche, penché sur sa tâche ; le plongeur moderne nage, à plat
      const lean = this.old() ? (ph.s === 'work' ? 0.2 + 0.15 * Math.sin(t * 0.8 + i) : 0.05) : 1.15;
      m.rotation.set(lean, ph.s === 'work' ? look : this.bt.obj.rotation.y + this.barge.rotation.y + Math.PI / 2 * this.s, 0, 'YXZ');
      if (ph.s === 'down' && Math.abs(p.y - lv) < 0.03 && !this.diverIn) { this.diverIn = true; this.h.splash(p.x, p.z, lv, true); }
      if (ph.s === 'up' && Math.abs(p.y - lv) < 0.04 && this.diverIn) { this.diverIn = false; this.h.splash(p.x, p.z, lv, true); }
    });
    // le tuyau d'air : de la pompe, par-dessus le bastingage, jusqu'au dos du plongeur
    if (this.hose) {
      this.hose.visible = shown;
      if (shown) {
        const hp = this.hose.geometry.attributes.position as THREE.BufferAttribute, pumpAt = this.deckAt(0.075, 0.1, 0.23, new THREE.Vector3()), m0 = this.men[0].position;
        hp.setXYZ(0, pumpAt.x, pumpAt.y, pumpAt.z);
        hp.setXYZ(1, (pumpAt.x + rail.x) / 2, rail.y + 0.07, (pumpAt.z + rail.z) / 2);
        for (let j = 2; j < 12; j++) {
          const u = (j - 2) / 9, yy = rail.y + (m0.y + 0.1 - rail.y) * u - Math.sin(u * Math.PI) * 0.1;
          hp.setXYZ(j, rail.x + (m0.x - rail.x) * u, Math.max(this.floor + 0.02, yy), rail.z + (m0.z - rail.z) * u);
        }
        hp.needsUpdate = true;
        this.hose.geometry.computeBoundingSphere();
      }
    }
    this.src[0].on = shown && this.men[0].position.y < lv - 0.02;
    this.src[0].p.copy(this.men[0].position).y += 0.2 * 0.8 + 0.03;
    void dt;
  }
  private old() { return this.age <= 3; }

  /** L'équipage sur la gabare : le manœuvre au treuil, le trieur au tas, la pompe ; tous acclament à la fin */
  private stepCrew(k: number, h: ReturnType<typeof haulAt>, done: boolean) {
    const ag = this.h.agents, ids = this.crew, hid = this.diver && k >= 0.19 && k < 0.82;
    if (this.diver && hid !== this.hidden) { ag.partyHide([ids[0]], hid); this.hidden = hid; }
    const cheer = k >= 0.76 || done;
    // (les lieux : x, z dans le repère de la gabare, et vers quoi l'on regarde)
    const roles: [number, number, number, number, 'work' | 'cheer' | 'stroll'][] = this.diver
      ? [[0.085, 0.05, 0.4, 0, 'work'], [0.07, 0.15, 0.2, 0.23, 'work'], [-0.06, 0.1, -0.06, 0.2, 'work'], [-0.085, -0.1, 0.0, -0.1, 'work']]
      : [[-0.06, 0.1, -0.06, 0.2, 'work'], [-0.085, -0.1, 0.0, -0.1, 'work'], [0.085, 0.14, 0.4, 0.14, 'work']];
    ids.forEach((id, i) => {
      const r = roles[i] ?? roles[roles.length - 1];
      const at = this.deckAt(r[0], 0.036, r[1], new THREE.Vector3()), to = this.deckAt(r[2] + (r[2] < 0.3 ? 0 : 0), 0.1, r[3], V2);
      const idle = i === 0 && this.diver && hid;
      ag.ride(id, { x: at.x, z: at.z, y: at.y, heading: Math.atan2(to.x - at.x, to.z - at.z), act: cheer && !idle ? 'cheer' : r[4] });
    });
    void h;
  }

  /** La mer autour : les bancs de poissons autour de l'épave, les bulles (écoutilles, plongeur, crochet) */
  private stepSea(t: number, dt: number, k: number, h: ReturnType<typeof haulAt>) {
    const [cx, cz] = [this.wreckAt.x, this.wreckAt.z], lv = this.level, lo = this.floor + 0.1;
    for (let i = 0; i < FISH_N; i++) {
      const big = i >= FISH_N - 2, sh = big ? 3 : (i / 7) | 0, j = i % 7;
      const w = [0.55, -0.42, 0.34, 0.2][sh], a = t * w + j * 0.5 + sh * 2, rx = [0.62, 0.9, 0.5, 1.05][sh], rz = rx * 0.8;
      const x = cx + Math.cos(a) * rx + Math.sin(t * 0.8 + j) * 0.03, z = cz + Math.sin(a) * rz;
      const yb = lv - [0.12, 0.26, 0.38, 0.22][sh] + Math.sin(t * 1.1 + j * 2) * 0.03;
      const tx = -Math.sin(a) * rx * Math.sign(w), tz = Math.cos(a) * rz * Math.sign(w);
      E.set(0, Math.atan2(tx, tz), Math.sin(t * 6 + j) * 0.08);
      Q.setFromEuler(E);
      S.setScalar(big ? 2.4 : 0.9 + (j % 3) * 0.12);
      this.fish.setMatrixAt(i, M.compose(V.set(x, Math.max(lo, yb), z), Q, S));
    }
    this.fish.instanceMatrix.needsUpdate = true;
    // les sources : 0 le plongeur ; 1, 2 la cale de l'épave ; 3 le crochet quand il est au fond ; 4 le tas de butin
    const w1 = this.wreck.localToWorld(V.set(0.02, 0.1, 0.1)), w2 = this.wreck.localToWorld(V2.set(-0.03, 0.1, -0.1));
    this.src[1].p.copy(w1); this.src[1].on = true;
    this.src[2].p.copy(w2); this.src[2].on = true;
    this.src[3].p.copy(this.hookG.position); this.src[3].on = this.hookG.position.y < lv - 0.05 && !!h;
    this.src[4].p.set(cx + 0.2, this.floor + 0.3, cz - 0.15); this.src[4].on = !this.diver || k < 0.19;
    if (!this.diver) this.src[0].on = false;
    for (let i = 0; i < BUBBLE_N; i++) {
      const s = this.src[i % 5], u = (t * (0.22 + (i % 4) * 0.04) + i * 0.173) % 1;
      const y0 = s.p.y, y1 = lv - 0.005;
      if (!s.on || y0 >= y1 - 0.02) { M.makeScale(0, 0, 0); this.bubbles.setMatrixAt(i, M); continue; }
      const wob = Math.sin(t * 3 + i * 1.9) * 0.012 * (0.3 + u);
      this.bubbles.setMatrixAt(i, M.compose(V.set(s.p.x + wob, y0 + u * (y1 - y0), s.p.z + Math.cos(t * 2.3 + i) * 0.01), Q.identity(), S.setScalar(0.5 + 0.9 * u)));
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
    void dt;
  }

  /** On range tout (l'hôte retire les objets de la scène) */
  dispose() {
    this.cable.geometry.dispose();
    this.hose?.geometry.dispose();
    this.fish.dispose();
    this.bubbles.dispose();
  }
}

/** Un coup d'œil sur les chiffres du butin, pour les tests */
export const SALVAGE_DEBUG = { W0, LOOT };
