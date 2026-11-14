import * as THREE from 'three';
import { Parts } from '../parts';
import { hull } from '../seaTraffic';
import type { People } from '../../world/archipelago';
import type { WarshipKind } from '../../sim/navalConflict';
import type { WarshipModel } from '../warships';

/**
 * Les navires de guerre du peuple asiatique, par âge : galère à tête de dragon, jonque à voiles lattées, frégate, vapeur cuirassé, vedette, vedette à coussin d'air. Laque rouge, noir et or. Proue vers +z, flottaison à y = 0, environ une case de long (voir `warships.ts`)
 */

const TURQ = 0x2fa8a0, BRASS = 0xd8a840, WHITE = 0xf2ece0;
const LACQ = 0xb02a22, INK = 0x24201e, GOLD = 0xe0b040, OCHRE = 0xc8642a;
const DARK = 0x4a3426, DECK = 0xa07850, IRON = 0x3a3c40;

/** Couleurs d'un peuple : coque, liseré, voile, métal, pavillon */
const look = (p: People) => p === 'orient'
  ? { hull: 0x9a6a3a, band: TURQ, sail: WHITE, metal: BRASS, flag: TURQ, mark: WHITE, light: 0x4af0d8 }
  : { hull: 0x5a2a1e, band: LACQ, sail: 0xe8d8b0, metal: GOLD, flag: LACQ, mark: GOLD, light: 0xff4a3a };

/** Pavillon d'un peuple en haut d'un mât : turquoise à bande blanche, ou rouge au disque d'or */
function flag(p: Parts, people: People, y: number, z: number, w = 0.09) {
  const c = look(people);
  p.box(0.004, w * 0.6, w, 0, y, z - w / 2, c.flag);
  if (people === 'orient') p.box(0.005, w * 0.16, w, 0, y + w * 0.22, z - w / 2, c.mark);
  else p.add(new THREE.CylinderGeometry(w * 0.16, w * 0.16, 0.006, 8).rotateZ(Math.PI / 2), 0, y + w * 0.3, z - w / 2, c.mark);
}

/** Voile triangulaire dans le plan du navire (x = 0) : sommets (y, z) */
function lateen(p: Parts, a: [number, number], b: [number, number], c: [number, number], color: number) {
  const s = new THREE.Shape();
  s.moveTo(a[1], a[0]); s.lineTo(b[1], b[0]); s.lineTo(c[1], c[0]); s.lineTo(a[1], a[0]);
  p.add(new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false }).rotateY(-Math.PI / 2), 0.004, 0, 0, color);
}
/** Un espar d'un point (y, z) à un autre, dans le plan du navire */
function spar(p: Parts, a: [number, number], b: [number, number], color = DARK, r = 0.008) {
  const dy = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dy, dz);
  p.add(new THREE.BoxGeometry(r, r, l), 0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, color, 0, false, 0, -Math.atan2(dy, dz));
}

/** Rond de bouclier sur le plat-bord (côté s) */
function railShield(p: Parts, s: number, y: number, z: number, face: number, boss: number) {
  p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 8).rotateZ(Math.PI / 2), s * 0.106, y, z, face);
  p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 6).rotateZ(Math.PI / 2), s * 0.11, y, z, boss);
}

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

function galley(p: Parts, people: People): Partial<WarshipModel> {
  const c = look(people), orient = people === 'orient';
  hull(p, 0.2, 0.08, 0.9, 0.06, c.hull, c.band, DECK);
  // éperon de bronze à la flottaison
  p.add(new THREE.ConeGeometry(0.03, 0.16, 4).rotateX(Math.PI / 2), 0, -0.02, 0.62, 0x9a7a3a);
  if (orient) {
    // haute étrave et étambot recourbé, à la pointe de laiton
    spar(p, [0.04, 0.52], [0.2, 0.6], c.hull, 0.03); p.sphere(0.02, 0, 0.21, 0.6, BRASS);
    spar(p, [0.04, -0.5], [0.24, -0.6], c.hull, 0.03); spar(p, [0.24, -0.6], [0.28, -0.52], c.hull, 0.022);
  } else {
    // tête de dragon à la proue (gueule, cornes d'or), queue en éventail à la poupe
    spar(p, [0.04, 0.5], [0.16, 0.58], LACQ, 0.035);
    p.box(0.05, 0.045, 0.08, 0, 0.15, 0.62, LACQ); p.box(0.04, 0.012, 0.05, 0, 0.135, 0.66, GOLD);
    for (const s of [-1, 1]) { p.add(new THREE.ConeGeometry(0.008, 0.06, 4).rotateX(-0.8), s * 0.018, 0.21, 0.6, GOLD); p.box(0.006, 0.012, 0.012, s * 0.026, 0.18, 0.645, WHITE); }
    for (let k = -2; k <= 2; k++) p.add(new THREE.BoxGeometry(0.006, 0.12, 0.03), 0, 0.12, -0.55, k % 2 ? GOLD : LACQ, 0, false, k * 0.25);
  }
  // boucliers le long des plats-bords, rouf de poupe
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) railShield(p, s, 0.085, -0.28 + k * 0.11, orient ? TURQ : LACQ, c.metal);
  p.box(0.16, 0.06, 0.14, 0, 0.06, -0.36, orient ? 0x8a5a30 : INK); p.box(0.17, 0.01, 0.15, 0, 0.12, -0.36, c.band);
  // mât, vergue, voile carrée rayée
  p.cyl(0.009, 0.012, 0.6, 5, 0, 0.06, 0.06, DARK);
  p.box(0.44, 0.012, 0.012, 0, 0.56, 0.06, DARK);
  for (let k = 0; k < 5; k++) p.box(0.42, 0.075, 0.008, 0, 0.19 + k * 0.074, 0.07, k % 2 ? c.band : c.sail);
  if (!orient) for (let k = 0; k < 5; k++) p.box(0.44, 0.01, 0.012, 0, 0.19 + k * 0.074, 0.07, INK);
  flag(p, people, 0.62, 0.06);
  return { oars: oarBank(), oarAt: [0.1, 0.05, 0], muzzles: [[0.06, 0.16, 0.25], [-0.06, 0.16, 0.1], [0.06, 0.16, -0.15], [-0.06, 0.18, -0.36]] };
}

function dhow(p: Parts): Partial<WarshipModel> {
  const c = look('orient');
  hull(p, 0.22, 0.09, 0.78, 0.07, c.hull, TURQ, DECK);
  // longue étrave inclinée, poupe haute à panneau sculpté
  spar(p, [0.05, 0.48], [0.26, 0.66], c.hull, 0.028);
  p.box(0.2, 0.1, 0.18, 0, 0.07, -0.32, 0x8a5a30); p.box(0.21, 0.012, 0.19, 0, 0.17, -0.32, TURQ);
  p.box(0.16, 0.06, 0.008, 0, 0.09, -0.415, WHITE); p.box(0.1, 0.03, 0.009, 0, 0.105, -0.416, TURQ);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) p.box(0.006, 0.03, 0.006, s * 0.1, 0.17, -0.39 + k * 0.05, BRASS);
  // grand mât penché vers l'avant et artimon ; voiles latines blanches sur leurs longues antennes
  p.add(new THREE.CylinderGeometry(0.01, 0.014, 0.66, 5).translate(0, 0.33, 0), 0, 0.07, 0.1, DARK, 0, false, 0, 0.14);
  p.cyl(0.008, 0.01, 0.42, 5, 0, 0.07, -0.24, DARK);
  lateen(p, [0.16, 0.52], [0.84, -0.18], [0.14, -0.14], WHITE);
  spar(p, [0.15, 0.56], [0.86, -0.2]);
  lateen(p, [0.14, -0.06], [0.52, -0.44], [0.12, -0.4], WHITE);
  spar(p, [0.13, -0.03], [0.54, -0.46]);
  p.box(0.004, 0.03, 0.12, 0, 0.82, -0.08, TURQ);
  flag(p, 'orient', 0.42, -0.22, 0.07);
  return { muzzles: [[0.06, 0.13, 0.25], [-0.06, 0.13, 0.05], [0.06, 0.2, -0.3], [-0.06, 0.2, -0.34]] };
}

function junk(p: Parts): Partial<WarshipModel> {
  hull(p, 0.24, 0.09, 0.78, 0.07, 0x6a3a22, LACQ, DECK);
  // haut château de poupe en surplomb, laqué et bordé d'or ; proue carrée aux yeux peints
  p.box(0.24, 0.13, 0.2, 0, 0.07, -0.33, LACQ); p.box(0.26, 0.014, 0.24, 0, 0.2, -0.34, INK);
  p.box(0.25, 0.012, 0.21, 0, 0.13, -0.33, GOLD);
  p.box(0.2, 0.05, 0.06, 0, 0.07, 0.4, 0x6a3a22);
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10).rotateZ(Math.PI / 2), s * 0.118, 0.05, 0.34, WHITE);
    p.add(new THREE.CylinderGeometry(0.01, 0.01, 0.008, 8).rotateZ(Math.PI / 2), s * 0.12, 0.05, 0.345, INK);
  }
  // trois mâts et leurs voiles lattées en éventail (ocre, lattes noires)
  for (const [z, h, w] of [[0.24, 0.42, 0.2], [0.02, 0.64, 0.3], [-0.2, 0.5, 0.22]] as [number, number, number][]) {
    p.cyl(0.009, 0.012, h + 0.04, 5, 0, 0.07, z, DARK);
    const n = 6, top = h + 0.06, bottom = 0.16;
    for (let k = 0; k < n; k++) {
      const y = bottom + ((top - bottom) * k) / n, hh = (top - bottom) / n, ww = w * (0.8 + 0.3 * (k / n));
      p.box(0.008, hh, ww, 0, y, z - ww / 2 + 0.02, OCHRE);
      p.box(0.012, 0.008, ww + 0.01, 0, y + hh, z - ww / 2 + 0.02, INK);
    }
  }
  p.box(0.004, 0.04, 0.12, 0, 0.72, -0.04, LACQ);
  flag(p, 'asie', 0.52, -0.22, 0.07);
  return { muzzles: [[0.06, 0.13, 0.28], [-0.06, 0.13, 0.08], [0.07, 0.24, -0.3], [-0.07, 0.24, -0.36]] };
}

function frigate(p: Parts, people: People): Partial<WarshipModel> {
  const c = look(people), orient = people === 'orient';
  hull(p, 0.24, 0.1, 0.95, 0.09, orient ? 0x3a2a20 : INK, null, 0x8a6040);
  // batterie : bande peinte, sabords noirs et bouches de canon, des deux bords
  p.box(0.245, 0.045, 0.86, 0, 0.0, 0, c.band);
  const muzzles: [number, number, number][] = [];
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) {
    const z = -0.3 + k * 0.1;
    p.box(0.004, 0.026, 0.03, s * 0.123, 0.008, z, 0x141210);
    p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6).rotateZ(Math.PI / 2), s * 0.135, 0.02, z, IRON);
    if (k % 2) muzzles.push([s * 0.15, 0.02, z]);
  }
  // gaillard d'arrière, fenêtres de poupe éclairées
  p.box(0.22, 0.07, 0.24, 0, 0.09, -0.34, orient ? 0x5a3a26 : 0x3a2a24); p.box(0.23, 0.01, 0.25, 0, 0.16, -0.34, 0x8a6040); p.box(0.232, 0.012, 0.252, 0, 0.15, -0.34, c.metal);
  for (let k = 0; k < 4; k++) p.box(0.03, 0.025, 0.006, -0.06 + k * 0.04, 0.11, -0.465, 0xffd890, 0, true);
  spar(p, [0.1, 0.5], [0.24, 0.7], DARK, 0.012);
  // trois mâts, deux étages de voiles carrées ; artimon latin (oriental) ou huniers lattés (asiatique)
  for (const [z, h] of [[0.27, 0.7], [0.04, 0.86], [-0.22, 0.6]] as [number, number][]) {
    p.cyl(0.009, 0.013, h, 5, 0, 0.09, z, DARK);
    if (z < -0.1 && orient) { lateen(p, [0.2, -0.08], [0.62, -0.4], [0.18, -0.38], c.sail); continue; }
    for (const [y, w] of [[0.22, 0.34], [0.44, 0.28]]) {
      p.box(w, 0.18, 0.008, 0, y, z, c.sail); p.box(w * 1.06, 0.012, 0.012, 0, y + 0.18, z, DARK);
      if (!orient) for (let k = 1; k < 3; k++) p.box(w, 0.008, 0.01, 0, y + k * 0.06, z, INK);
    }
  }
  p.box(0.03, 0.18, 0.01, 0, 0.22, 0.04, c.band);
  flag(p, people, 0.9, 0.04);
  return { muzzles };
}

function ironclad(p: Parts, people: People): Partial<WarshipModel> {
  const orient = people === 'orient', c = look(people);
  hull(p, 0.24, 0.1, 0.9, 0.04, orient ? 0x6a6a64 : 0x2a2a2e, c.band, 0x6a5a48);
  p.add(new THREE.ConeGeometry(0.03, 0.14, 4).rotateX(Math.PI / 2), 0, -0.03, 0.6, IRON);
  // casemate aux flancs inclinés et ses sabords, tourelle avant à deux canons, cheminée, mât de signaux
  const cas = orient ? 0xc8b48a : 0x3a3a40;
  p.box(0.16, 0.08, 0.3, 0, 0.04, -0.02, cas);
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.03, 0.09, 0.3), s * 0.09, 0.075, -0.02, cas, 0, false, s * 0.5);
    for (const z of [-0.1, 0.06]) p.box(0.006, 0.022, 0.028, s * 0.1, 0.07, z, 0x141210);
  }
  p.box(0.17, 0.01, 0.31, 0, 0.12, -0.02, c.band);
  p.cyl(0.07, 0.075, 0.07, 10, 0, 0.04, 0.25, orient ? 0x8a8a82 : 0x4a4a52);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.011, 0.012, 0.14, 6).rotateX(Math.PI / 2), s * 0.025, 0.08, 0.36, IRON);
  p.cyl(0.032, 0.036, 0.22, 8, 0, 0.12, -0.18, orient ? 0x2a2a2a : INK);
  p.cyl(0.037, 0.037, 0.03, 8, 0, 0.26, -0.18, c.band);
  p.cyl(0.006, 0.008, 0.5, 5, 0, 0.12, 0.08, IRON); p.box(0.18, 0.008, 0.008, 0, 0.5, 0.08, IRON);
  flag(p, people, 0.56, 0.08, 0.08);
  return { muzzles: [[0.025, 0.08, 0.44], [-0.025, 0.08, 0.44], [0.12, 0.07, -0.1], [-0.12, 0.07, 0.06]], funnel: [0, 0.3, -0.18] };
}

function launch(p: Parts, people: People): Partial<WarshipModel> {
  const orient = people === 'orient', c = look(people), body = orient ? 0xd8d0c0 : 0x5a5e66, top = orient ? 0xe8e2d4 : 0x6a6e76;
  hull(p, 0.2, 0.06, 0.75, 0.06, body, c.band, 0x8a8f96);
  // passerelle aux vitres sombres, mât radar, tourelle avant, lance-roquettes à la poupe
  p.box(0.15, 0.08, 0.22, 0, 0.06, -0.04, top);
  p.box(0.13, 0.05, 0.12, 0, 0.14, 0.0, top);
  p.box(0.135, 0.022, 0.004, 0, 0.16, 0.061, 0x1e2a36); for (const s of [-1, 1]) p.box(0.004, 0.022, 0.1, s * 0.066, 0.16, 0.0, 0x1e2a36);
  p.cyl(0.005, 0.006, 0.18, 5, 0, 0.19, -0.02, 0x8a8f96); p.box(0.1, 0.012, 0.02, 0, 0.33, -0.02, 0x8a8f96);
  p.box(0.022, 0.018, 0.022, 0, 0.3, -0.02, c.band);
  p.cyl(0.04, 0.045, 0.04, 8, 0, 0.06, 0.23, top);
  p.add(new THREE.CylinderGeometry(0.008, 0.009, 0.12, 6).rotateX(Math.PI / 2), 0, 0.085, 0.31, IRON);
  p.add(new THREE.BoxGeometry(0.1, 0.05, 0.09), 0, 0.1, -0.26, 0x6a7058, 0, false, 0, -0.35);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 6).rotateX(Math.PI / 2 - 0.35), s * 0.025, 0.12, -0.215, 0x141414);
  p.box(0.21, 0.02, 0.5, 0, 0.0, 0.02, c.band);
  flag(p, people, 0.34, -0.03, 0.06);
  return { muzzles: [[0, 0.085, 0.38], [0.025, 0.13, -0.2], [-0.025, 0.13, -0.2]] };
}

function hover(p: Parts, people: People): Partial<WarshipModel> {
  const orient = people === 'orient', c = look(people), skin = orient ? 0xf2ead8 : 0x2a2a30, trim = orient ? GOLD : LACQ;
  // jupe noire en ovale, coque profilée, verrière, liserés lumineux, deux soufflantes carénées, aire des drones
  p.add(new THREE.CylinderGeometry(0.13, 0.14, 0.06, 14).scale(1, 1, 2.6), 0, 0.02, 0, 0x1a1a1e);
  p.add(new THREE.CylinderGeometry(0.11, 0.125, 0.06, 14).scale(1, 1, 2.6), 0, 0.07, 0, skin);
  p.add(new THREE.IcosahedronGeometry(0.07, 1).scale(1, 0.55, 1.6), 0, 0.11, 0.08, 0x1e3a5a);
  for (const s of [-1, 1]) p.box(0.004, 0.006, 0.5, s * 0.122, 0.08, 0, c.light, 0, 'neon');
  p.box(0.2, 0.012, 0.06, 0, 0.1, 0.28, trim);
  for (const s of [-1, 1]) {
    p.add(new THREE.TorusGeometry(0.05, 0.012, 6, 12), s * 0.065, 0.15, -0.3, skin);
    p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6).rotateX(Math.PI / 2), s * 0.065, 0.15, -0.3, 0x3a4250);
    p.box(0.012, 0.09, 0.012, s * 0.065, 0.07, -0.3, 0x3a4250);
  }
  p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12), 0, 0.105, -0.12, 0x3a4250);
  p.add(new THREE.TorusGeometry(0.045, 0.004, 4, 16).rotateX(Math.PI / 2), 0, 0.112, -0.12, c.light, 0, 'neon');
  p.box(0.03, 0.02, 0.05, 0, 0.12, 0.3, 0x3a4250); p.box(0.012, 0.012, 0.012, 0, 0.125, 0.33, c.light, 0, 'neon');
  // le drone : corps, quatre rotors, œil lumineux
  const d = new Parts();
  d.box(0.05, 0.016, 0.05, 0, 0, 0, skin);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { d.box(0.04, 0.006, 0.006, x * 0.02, 0.006, z * 0.02, 0x3a4250, Math.PI / 4 * x * z); d.cyl(0.018, 0.018, 0.004, 8, x * 0.034, 0.014, z * 0.034, 0x9aa4b0); }
  d.box(0.012, 0.008, 0.008, 0, -0.004, 0.026, c.light, 0, 'neon');
  return { muzzles: [[0, 0.13, 0.34]], drone: d.build(false).body };
}

const BUILD: Record<WarshipKind, (p: Parts, people: People) => Partial<WarshipModel>> = {
  galley, dhow: (p) => dhow(p), junk: (p) => junk(p), frigate, ironclad, launch, hover,
};

/** Dessine dans `p` le navire `kind` ; rend ses pièces à part (rames, bouches de tir, cheminée, drone) */
export function asianShip(p: Parts, kind: WarshipKind): Partial<WarshipModel> {
  return BUILD[kind](p, 'asie');
}
