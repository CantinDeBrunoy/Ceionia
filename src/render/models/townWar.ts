import * as THREE from 'three';
import { Parts } from '../parts';
import type { People } from '../../world/archipelago';
import { TEAM_FLAG } from '../teamPaint';
import { O } from './oriental';
import { A, lantern } from './asian';

/**
 * Les lots des villes des peuples qui suivent la campagne du nouveau monde (chantier D, plan partie 4 ; voir
 * `world/townCampaign.ts`) : chez le rival en guerre, les bastions et la batterie du quai (Industriel), puis les casemates,
 * les canons côtiers, les barbelés et sacs de sable, la tour du radar (Moderne) ; chez l'allié, le ponton et le poste de garde
 * vers la concession (Médiéval), le pont (Industriel), l'avenue éclairée et le mât aux trois drapeaux (Moderne) ; nos
 * drapeaux sur la ville vaincue. Chaque modèle a ses deux styles : sable, pierre claire et faïence turquoise chez les
 * Sablais ; brique grise, laque rouge et tuiles chez les Jadéens. Conventions des villes : origine au centre du lot, façade
 * (vers l'extérieur de la ville) vers +z, 1 = une case. Seconde passe de détails faite (24 nov. 2026)
 */

const PI = Math.PI;
/** Les couleurs d'un peuple à un âge : la pierre, son ombre, la touche (faïence ou laque), le bois, le métal, le béton, le camouflage */
function look(people: People, age: number) {
  const or = people === 'orient';
  return {
    stone: or ? O.stone : A.stone, stoneD: or ? O.stoneD : A.darkstone, accent: or ? O.turq : A.lacquer, accent2: or ? O.cobalt : A.tileG,
    wood: or ? O.wood : A.timber, metal: age >= 4 ? 0x6a7178 : 0x3e4044, concrete: or ? 0xd9cfba : 0xbdbab2, concreteD: or ? 0xb8ab90 : 0x9a978f,
    camo: or ? [0xc8b07a, 0xa88a58, 0xd9c79a] : [0x5a6a48, 0x3f4a34, 0x7a8a5a], flag: or ? 0x2aa8a0 : 0xc0392e, flag2: or ? 0xf4e6c4 : 0xe8b84a, or,
  };
}

/** Un canon de l'Industriel sur son affût (bronze ou fonte), tourné vers +z */
function cannon(p: Parts, x: number, z: number, ry: number, c: ReturnType<typeof look>, y = 0) {
  const s = Math.sin(ry), k = Math.cos(ry);
  p.box(0.16, 0.06, 0.22, x, y, z, c.wood, ry);
  for (const sd of [-1, 1]) p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 8).rotateZ(PI / 2), x + sd * 0.09 * k, y + 0.05, z - sd * 0.09 * s, 0x3a3026, ry);
  p.add(new THREE.CylinderGeometry(0.03, 0.04, 0.34, 8).rotateX(PI / 2 - 0.12), x + s * 0.08, y + 0.1, z + k * 0.08, 0x2e2f33, ry);
}
/** Un sac de sable (un coussin aplati) */
const sandbag = (p: Parts, x: number, y: number, z: number, ry: number, col: number) => p.add(new THREE.SphereGeometry(0.07, 6, 3).scale(1.4, 0.55, 0.9), x, y + 0.035, z, col, ry);
/** Un rang de sacs de sable le long de x, sur `n` places, `rows` hauteurs */
function sandbags(p: Parts, x0: number, z: number, n: number, rows: number, col: number, ry = 0) {
  const s = Math.sin(ry), k = Math.cos(ry);
  for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
    const u = x0 + i * 0.18 + (r % 2) * 0.09;
    sandbag(p, u * k, r * 0.07, -u * s + z, ry, r % 2 ? col : new THREE.Color(col).multiplyScalar(0.92).getHex());
  }
}
/** Un mât et son drapeau (les couleurs d'un peuple, ou les nôtres) */
function flag(p: Parts, x: number, z: number, h: number, c1: number, c2?: number, y = 0, k = 1) {
  p.cyl(0.012, 0.016, h, 5, x, y, z, 0xdedad2);
  p.sphere(0.022, x, y + h + 0.01, z, 0xd9b24a);
  if (c1 === TEAM_FLAG) { p.box(0.32 * k, 0.2 * k, 0.008, x + 0.16 * k, y + h - 0.12 * k, z, TEAM_FLAG); return; }
  p.box(0.32 * k, 0.1 * k, 0.008, x + 0.16 * k, y + h - 0.07 * k, z, c1);
  p.box(0.32 * k, 0.1 * k, 0.008, x + 0.16 * k, y + h - 0.17 * k, z, c2 ?? c1);
}

/**
 * Le bastion (Industriel, chez le rival en guerre, devant la porte du port) : un saillant de pierre en pointe vers +z, son
 * talus, son parapet à embrasures (merlons de faïence ou de brique laquée), deux canons, la poudrière, le drapeau du peuple
 */
function bastion(p: Parts, people: People, age: number) {
  const c = look(people, age), h = 0.42;
  // le saillant : deux faces en pointe et deux flancs, un talus de terre devant
  const shape = new THREE.Shape([new THREE.Vector2(-0.9, -0.7), new THREE.Vector2(0.9, -0.7), new THREE.Vector2(0.9, 0.2), new THREE.Vector2(0, 0.9), new THREE.Vector2(-0.9, 0.2)]);
  p.add(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-PI / 2), 0, 0, 0, c.stone);
  const talus = new THREE.Shape([new THREE.Vector2(-1, -0.72), new THREE.Vector2(1, -0.72), new THREE.Vector2(1, 0.24), new THREE.Vector2(0, 1.0), new THREE.Vector2(-1, 0.24)]);
  p.add(new THREE.ExtrudeGeometry(talus, { depth: 0.08, bevelEnabled: false }).rotateX(-PI / 2), 0, 0, 0, c.or ? 0xc9a273 : 0x7d8a5a);
  // le cordon de pierre et le parapet, ses embrasures (merlons)
  for (const [a, b] of [[[-0.9, 0.2], [0, 0.9]], [[0, 0.9], [0.9, 0.2]], [[-0.9, -0.7], [-0.9, 0.2]], [[0.9, -0.7], [0.9, 0.2]]] as [number, number][][]) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ry = Math.atan2(dx, dz) - PI / 2;
    p.box(L, 0.03, 0.08, (a[0] + b[0]) / 2, h, (a[1] + b[1]) / 2, c.stoneD, ry);
    const n = Math.max(2, Math.round(L / 0.24));
    for (let i = 0; i < n; i++) { if (i % 2) continue; const u = (i + 0.5) / n; p.box(0.14, 0.12, 0.07, a[0] + dx * u, h + 0.03, a[1] + dz * u, i % 4 === 0 ? c.accent : c.stone, ry); }
  }
  // la plate-forme, les canons tournés vers les deux faces, la poudrière, la guérite d'angle
  p.box(1.5, 0.02, 1.0, 0, h, -0.15, c.or ? 0xd8c7a2 : 0x9a968c);
  cannon(p, -0.35, 0.25, -0.6, c, h + 0.02); cannon(p, 0.35, 0.25, 0.6, c, h + 0.02);
  p.box(0.36, 0.22, 0.26, 0, h, -0.45, c.stoneD);
  if (c.or) p.add(new THREE.SphereGeometry(0.16, 8, 4, 0, PI * 2, 0, PI / 2).scale(1.1, 0.6, 0.8), 0, h + 0.22, -0.45, O.white);
  else { p.box(0.42, 0.03, 0.32, 0, h + 0.22, -0.45, A.tile); p.box(0.3, 0.06, 0.2, 0, h + 0.25, -0.45, A.tile); }
  p.cyl(0.08, 0.08, 0.22, 8, 0, h, 0.82, c.stone); p.cone(0.11, 0.12, 8, 0, h + 0.22, 0.82, c.or ? O.turqD : A.tile);
  // boulets en pyramide, un baril, le drapeau
  for (let i = 0; i < 3; i++) p.sphere(0.03, -0.62 + i * 0.065, h + 0.045, -0.4, 0x2a2a2e);
  p.sphere(0.03, -0.59, h + 0.1, -0.4, 0x2a2a2e);
  p.cyl(0.05, 0.05, 0.1, 8, 0.6, h, -0.42, c.wood);
  flag(p, 0.5, -0.55, 0.62, c.flag, c.flag2, h);
}

/** La batterie du quai (Industriel) : une plate-forme de pierre au bord de l'eau, son parapet, trois canons, les caisses */
function quayBattery(p: Parts, people: People, age: number) {
  const c = look(people, age);
  p.box(1.8, 0.16, 1.0, 0, 0, 0, c.stone);
  p.box(1.84, 0.03, 1.04, 0, 0.16, 0, c.stoneD);
  for (let i = 0; i < 7; i++) if (i % 2 === 0) p.box(0.22, 0.14, 0.12, -0.8 + i * 0.267, 0.19, 0.44, i % 4 === 0 ? c.accent : c.stone);
  for (const x of [-0.55, 0, 0.55]) cannon(p, x, 0.12, 0, c, 0.19);
  for (const x of [-0.75, 0.75]) { p.box(0.14, 0.1, 0.12, x, 0.19, -0.35, c.wood); p.box(0.14, 0.008, 0.12, x, 0.29, -0.35, 0x5a4030); }
  for (let i = 0; i < 4; i++) p.sphere(0.03, -0.3 + i * 0.07, 0.22, -0.38, 0x2a2a2e);
  if (!c.or) lantern(p, 0.82, 0.48, 0.38, 0.03);
  flag(p, -0.82, -0.4, 0.55, c.flag, c.flag2, 0.19, 0.8);
}

/**
 * La casemate (Moderne, à une tour des remparts près de la porte) : un bloc de béton aux angles cassés, la fente de tir et
 * son canon, la toiture couverte de terre et d'herbe, le filet de camouflage, l'entrée blindée, les sacs de sable, le
 * périscope ; le béton se pare de la touche du peuple (bandeau de faïence, auvent laqué)
 */
function casemate(p: Parts, people: People, age: number) {
  const c = look(people, age);
  p.box(1.2, 0.34, 1.0, 0, 0, 0, c.concrete);
  for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.2, 0.34, 0.2).rotateY(PI / 4), sx * 0.58, 0, 0.42, c.concreteD);
  p.box(1.28, 0.06, 1.06, 0, 0.34, 0, c.concreteD);
  p.add(new THREE.SphereGeometry(0.62, 10, 4, 0, PI * 2, 0, PI / 2).scale(1, 0.24, 0.84), 0, 0.4, 0, c.or ? 0xb8a070 : 0x6a7a4a);
  // la fente de tir, le canon, son mantelet
  p.box(0.62, 0.07, 0.04, 0, 0.18, 0.51, 0x1e1e20);
  p.box(0.22, 0.16, 0.06, 0, 0.12, 0.52, c.metal);
  p.add(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 8).rotateX(PI / 2), 0, 0.2, 0.74, 0x3a3e42);
  p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8).rotateX(PI / 2), 0, 0.2, 0.96, 0x2a2e32);
  // le filet de camouflage, ses taches
  for (let i = 0; i < 9; i++) p.add(new THREE.PlaneGeometry(0.34, 0.28).rotateX(-PI / 2 + 0.2).rotateY(i * 0.7), -0.45 + (i % 3) * 0.45, 0.47 + (i % 2) * 0.02, -0.3 + Math.floor(i / 3) * 0.3, c.camo[i % 3]);
  // le bandeau du peuple, l'entrée blindée à l'arrière, les sacs de sable, le périscope, le téléphone de campagne
  p.box(1.22, 0.04, 0.02, 0, 0.3, 0.5, c.accent);
  p.box(0.3, 0.26, 0.04, 0.3, 0, -0.51, 0x4a5056);
  sandbags(p, -0.6, 0.62, 4, 2, c.or ? 0xc8b07a : 0x9a8a62);
  sandbags(p, 0.1, 0.62, 4, 2, c.or ? 0xc8b07a : 0x9a8a62);
  p.cyl(0.015, 0.015, 0.2, 5, -0.35, 0.44, -0.2, 0x2a2e32); p.box(0.05, 0.03, 0.04, -0.35, 0.64, -0.2, 0x2a2e32);
  if (!c.or) p.box(0.5, 0.02, 0.2, 0.3, 0.3, -0.58, A.lacquer);
  if (age >= 5) p.box(0.6, 0.02, 0.02, 0, 0.27, 0.51, c.or ? O.turqL : A.pink, 0, 'neon');
}

/** Le canon côtier (Moderne) : une tourelle sur son anneau de béton, le long tube, le télémètre, les sacs de sable autour */
function coastGun(p: Parts, people: People, age: number) {
  const c = look(people, age);
  p.cyl(0.7, 0.78, 0.18, 14, 0, 0, 0, c.concrete);
  p.cyl(0.6, 0.6, 0.02, 14, 0, 0.18, 0, c.concreteD);
  p.add(new THREE.SphereGeometry(0.42, 12, 5, 0, PI * 2, 0, PI / 2).scale(1, 0.55, 1.15), 0, 0.2, 0, age >= 5 ? 0xd8dcdf : c.or ? 0xb8a880 : 0x5f6a52);
  p.box(0.3, 0.12, 0.1, 0, 0.3, 0.42, 0x3a3e42);
  p.add(new THREE.CylinderGeometry(0.05, 0.065, 1.1, 10).rotateX(PI / 2 - 0.08), 0, 0.34, 0.92, 0x3a3e42);
  p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10).rotateX(PI / 2), 0, 0.38, 1.44, 0x2a2e32);
  p.box(0.5, 0.05, 0.06, 0, 0.44, -0.05, 0x2a2e32);
  for (const s of [-1, 1]) p.cyl(0.04, 0.04, 0.06, 8, s * 0.25, 0.44, -0.05, 0x8ab0c4);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) > 0) continue; sandbag(p, Math.sin(a) * 0.86, 0, Math.cos(a) * 0.86, -a, c.or ? 0xc8b07a : 0x9a8a62); }
  p.box(0.22, 0.1, 0.16, -0.55, 0.18, -0.45, 0x4a5a3a); p.box(0.22, 0.1, 0.16, -0.55, 0.28, -0.45, 0x4a5a3a);
  p.box(0.6, 0.012, 0.012, 0, 0.27, 0.43, c.accent);
}

/**
 * Les barbelés et les sacs de sable devant une porte (Moderne) : deux rouleaux de barbelés sur leurs piquets, un mur de sacs
 * à hauteur d'homme avec son créneau, des chevaux de frise (hérissons d'acier), le panneau du peuple
 */
function wire(p: Parts, people: People, age: number) {
  const c = look(people, age), bag = c.or ? 0xc8b07a : 0x9a8a62;
  for (const z of [0.18, 0.02]) {
    for (let i = 0; i < 6; i++) p.add(new THREE.TorusGeometry(0.1, 0.006, 3, 10).rotateY(PI / 2), -0.95 + i * 0.38, 0.1, z, 0x6a6a6e);
    for (let i = 0; i < 4; i++) p.box(0.015, 0.24, 0.015, -1 + i * 0.66, 0, z, c.wood);
    p.box(2.1, 0.004, 0.004, 0, 0.18, z, 0x6a6a6e);
  }
  sandbags(p, -1.0, -0.18, 5, 3, bag);
  sandbags(p, 0.2, -0.18, 5, 3, bag);
  for (const x of [-0.25, 0.25]) for (const r of [0, PI / 2, PI / 4]) p.add(new THREE.BoxGeometry(0.3, 0.025, 0.025).rotateZ(0.7).rotateY(r), x, 0.1, -0.02, 0x4a4e52);
  p.box(0.02, 0.26, 0.02, 0.98, 0, -0.18, c.wood);
  p.box(0.22, 0.14, 0.01, 0.98, 0.26, -0.18, c.accent);
  p.box(0.14, 0.04, 0.012, 0.98, 0.27, -0.172, 0xf4f0e8);
}

/** La tour du radar sur le palais (Moderne) : un pylône en treillis, la plate-forme, l'antenne en grille, ses feux */
function radarMast(p: Parts, people: People, age: number) {
  const c = look(people, age), h = 1.3;
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) p.add(new THREE.CylinderGeometry(0.012, 0.018, h, 4).rotateZ(-x * 0.12).rotateX(z * 0.12), x * 0.78, h / 2, z * 0.78, c.metal);
  for (let k = 1; k < 5; k++) { const w = 0.36 - k * 0.04; p.box(w, 0.012, 0.012, 0, (h * k) / 5, w / 2, c.metal); p.box(w, 0.012, 0.012, 0, (h * k) / 5, -w / 2, c.metal); p.box(0.012, 0.012, w, w / 2, (h * k) / 5, 0, c.metal); p.box(0.012, 0.012, w, -w / 2, (h * k) / 5, 0, c.metal); }
  p.box(0.36, 0.03, 0.36, 0, h, 0, c.concreteD);
  p.box(0.6, 0.24, 0.02, 0, h + 0.18, 0.05, 0x8a9096);
  for (let i = 0; i < 6; i++) p.box(0.6, 0.006, 0.024, 0, h + 0.08 + i * 0.04, 0.06, 0x5a6066);
  p.cyl(0.03, 0.03, 0.1, 6, 0, h + 0.03, 0, c.metal);
  p.box(0.04, 0.04, 0.04, 0, h + 0.33, 0.05, 0xff3a2a, 0, true);
  p.box(0.4, 0.02, 0.02, 0, h - 0.02, 0.19, c.accent);
}

/**
 * Le ponton (Médiéval, chez l'allié, vers la concession) : un platelage sur pilotis qui avance sur l'eau, ses bittes, une
 * barque amarrée (un boutre chez les Sablais, un sampan chez les Jadéens), la lanterne au bout ; il se perfectionne avec les
 * âges (planches, puis béton et réverbère)
 */
function pontoon(p: Parts, people: People, age: number) {
  const c = look(people, age), L = 2.2, deck = age >= 4 ? c.concrete : c.wood;
  p.box(0.7, 0.05, L, 0, 0.14, 0, deck);
  if (age < 4) for (let i = 0; i < 11; i++) p.box(0.72, 0.006, 0.012, 0, 0.192, -L / 2 + 0.1 + i * 0.2, 0x5a3e2a);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) p.cyl(0.035, 0.035, 0.36, 6, s * 0.3, -0.2, -L / 2 + 0.2 + i * 0.45, age >= 4 ? c.concreteD : 0x4a3426);
  for (const z of [-0.4, 0.4]) p.cyl(0.03, 0.04, 0.1, 6, 0.3, 0.19, z, 0x3a3a3e);
  // la barque amarrée
  const bx = 0.62, bz = 0.2;
  p.add(new THREE.SphereGeometry(0.2, 8, 4, 0, PI * 2, PI / 2, PI / 2).scale(0.9, 0.45, 2.4), bx, 0.12, bz, c.or ? 0x8a6a48 : 0x5a3e2a);
  if (c.or) { p.cyl(0.01, 0.012, 0.5, 4, bx, 0.12, bz + 0.1, O.darkwood); p.add(new THREE.ConeGeometry(0.2, 0.4, 3).rotateZ(0.5), bx + 0.06, 0.4, bz + 0.1, O.white); }
  else { p.box(0.22, 0.12, 0.3, bx, 0.12, bz - 0.1, A.thatch); p.box(0.24, 0.02, 0.34, bx, 0.24, bz - 0.1, A.darkwood); }
  // la lanterne au bout, ou le réverbère ; un pêcheur assis
  if (age >= 4) { p.cyl(0.01, 0.012, 0.5, 5, -0.28, 0.19, L / 2 - 0.08, c.metal); p.box(0.08, 0.02, 0.04, -0.25, 0.69, L / 2 - 0.08, 0xfff0c0, 0, true); }
  else if (c.or) { p.cyl(0.01, 0.012, 0.36, 5, -0.28, 0.19, L / 2 - 0.08, O.darkwood); p.cyl(0.03, 0.025, 0.06, 6, -0.28, 0.55, L / 2 - 0.08, 0xffe2a0, true); }
  else { p.cyl(0.01, 0.012, 0.36, 5, -0.28, 0.19, L / 2 - 0.08, A.darkwood); lantern(p, -0.28, 0.5, L / 2 - 0.08, 0.03); }
  p.box(0.06, 0.08, 0.06, -0.2, 0.19, 0.6, 0x3a5a9a); p.box(0.05, 0.05, 0.05, -0.2, 0.3, 0.6, 0xe8b894);
  p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.4).rotateX(0.9), -0.2, 0.34, 0.78, 0x6b4a30);
}

/**
 * Le poste de garde au passage (Médiéval, chez l'allié) : une guérite au style du peuple (coupole blanche et arc, ou toit
 * courbe à lanterne), la barrière levée, le banc, deux gardes, le drapeau ; Industriel et après : briques puis béton, la
 * barrière rayée, le projecteur
 */
function guardPost(p: Parts, people: People, age: number) {
  const c = look(people, age), wall = age >= 4 ? c.concrete : c.or ? O.cream : A.plaster;
  p.box(0.5, 0.42, 0.44, -0.3, 0, -0.1, wall);
  p.box(0.2, 0.28, 0.02, -0.3, 0, 0.13, c.or ? O.darkwood : A.redDark);
  p.box(0.14, 0.1, 0.02, -0.08, 0.22, 0.13, c.or ? O.win : A.paper, 0, true);
  if (c.or) { p.add(new THREE.SphereGeometry(0.2, 10, 5, 0, PI * 2, 0, PI / 2), -0.3, 0.42, -0.1, O.white); p.sphere(0.03, -0.3, 0.64, -0.1, O.gold); p.box(0.52, 0.03, 0.46, -0.3, 0.42, -0.1, O.turq); }
  else { p.box(0.66, 0.04, 0.6, -0.3, 0.42, -0.1, A.tile); p.box(0.5, 0.08, 0.44, -0.3, 0.46, -0.1, A.tile); p.box(0.08, 0.06, 0.08, -0.3, 0.54, -0.1, A.tileGold); lantern(p, 0.0, 0.36, 0.14, 0.025); }
  // la barrière (un mât qui pivote, levé), son poteau
  p.box(0.06, 0.26, 0.06, 0.15, 0, 0.1, c.stoneD);
  p.add(new THREE.BoxGeometry(0.03, 0.03, 0.8).rotateX(-1.1), 0.15, 0.4, 0.28, age >= 3 ? 0xd84a3e : c.wood);
  if (age >= 3) for (let i = 0; i < 3; i++) p.add(new THREE.BoxGeometry(0.032, 0.032, 0.08).rotateX(-1.1), 0.15, 0.32 + i * 0.13, 0.22 + i * 0.05, 0xf4f4f0);
  // deux gardes, le banc, le drapeau
  for (const [x, z] of [[0.4, 0.2], [0.4, -0.2]] as const) { p.box(0.06, 0.1, 0.05, x, 0, z, c.or ? 0xd8b47a : 0xb02a22); p.box(0.07, 0.1, 0.05, x, 0.1, z, c.or ? 0xf2ece0 : 0x24201e); p.box(0.045, 0.045, 0.045, x, 0.22, z, 0xe8b894); p.cyl(0.004, 0.004, 0.34, 4, x + 0.05, 0, z, 0x6b4a30); }
  p.box(0.3, 0.03, 0.08, -0.3, 0.08, 0.3, c.wood);
  flag(p, -0.6, 0.15, 0.65, c.flag, c.flag2, 0, 0.8);
  if (age >= 4) { p.cyl(0.01, 0.012, 0.6, 5, 0.25, 0, -0.3, c.metal); p.box(0.08, 0.06, 0.06, 0.25, 0.6, -0.3, 0x3a3e44); p.box(0.06, 0.04, 0.01, 0.25, 0.6, -0.27, 0xfff2c0, 0, true); }
}

/**
 * Le pont vers la concession (Industriel) : `w` de long, le long de x. Une arche de pierre aux parapets (faïence ou laque)
 * à l'Industriel, chez les Sablais une arche en arc brisé, chez les Jadéens un pont courbe à garde-corps rouges ; au Moderne
 * le pont de fer à treillis (poutres en croix, rivets, lampadaires), peint aux couleurs du peuple
 */
function bridge(p: Parts, people: People, age: number, len: number) {
  const c = look(people, age), L = Math.max(1.6, len), deckY = 0.42;
  if (age <= 3) {
    // le tablier et les arches de pierre (trois), les piles dans l'eau
    p.box(L, 0.08, 0.7, 0, deckY, 0, c.stone);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + L * (i + 0.5) / n, r = L / n / 2 - 0.04;
      p.add(new THREE.TorusGeometry(r, 0.07, 4, 12, PI), x, deckY - r + 0.02, 0.3, c.stoneD);
      p.add(new THREE.TorusGeometry(r, 0.07, 4, 12, PI), x, deckY - r + 0.02, -0.3, c.stoneD);
    }
    for (let i = 0; i <= n; i++) p.box(0.14, deckY + 0.3, 0.62, -L / 2 + (L * i) / n, -0.3, 0, c.stone);
    // les parapets et leurs touches (faïence, ou garde-corps laqué et lanternes)
    for (const s of [-1, 1]) {
      if (c.or) { p.box(L, 0.12, 0.05, 0, deckY + 0.08, s * 0.33, c.stone); for (let i = 0; i < 6; i++) p.box(0.1, 0.03, 0.055, -L / 2 + (i + 0.5) * L / 6, deckY + 0.15, s * 0.33, c.accent); }
      else { for (let i = 0; i <= 8; i++) p.box(0.03, 0.14, 0.03, -L / 2 + i * L / 8, deckY + 0.08, s * 0.33, A.lacquer); p.box(L, 0.025, 0.035, 0, deckY + 0.21, s * 0.33, A.lacquer); lantern(p, s * (L / 2 - 0.1), deckY + 0.3, s * 0.33, 0.03); }
    }
    for (let i = 0; i < 10; i++) p.box(L / 10 - 0.01, 0.005, 0.6, -L / 2 + (i + 0.5) * L / 10, deckY + 0.081, 0, i % 2 ? c.stoneD : c.stone);
    return;
  }
  // le pont de fer : deux poutres en treillis, le tablier, les lampadaires
  const col = age >= 5 ? 0xe8ecee : c.or ? 0x2f7a78 : 0x8a2e26;
  p.box(L, 0.06, 0.72, 0, deckY, 0, age >= 5 ? 0xd8dcdf : 0x5a5e62);
  p.box(L, 0.008, 0.36, 0, deckY + 0.062, 0, 0x3e4246);
  for (const s of [-1, 1]) {
    const z = s * 0.36, n = Math.max(4, Math.round(L / 0.32)), h = 0.34;
    p.box(L, 0.04, 0.04, 0, deckY + 0.06, z, col); p.box(L, 0.04, 0.04, 0, deckY + h, z, col);
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + (i * L) / n, x1 = x0 + L / n;
      p.box(0.03, h, 0.03, x0, deckY + 0.06, z, col);
      const dx = x1 - x0, a = Math.atan2(h, dx);
      p.add(new THREE.BoxGeometry(Math.hypot(dx, h), 0.022, 0.022).rotateZ(i % 2 ? a : -a), (x0 + x1) / 2, deckY + 0.06 + h / 2, z, col);
    }
    p.box(0.03, h, 0.03, L / 2, deckY + 0.06, z, col);
    // les lampadaires (ou les bandeaux lumineux au Futuriste)
    if (age >= 5) p.box(L, 0.012, 0.012, 0, deckY + h + 0.03, z, c.or ? O.turqL : A.cyan, 0, 'neon');
    else for (const x of [-L / 4, L / 4]) { p.cyl(0.008, 0.01, 0.4, 5, x, deckY + h, z, 0x3a3e42); p.box(0.08, 0.02, 0.04, x, deckY + h + 0.4, z - s * 0.03, 0xfff0c0, 0, true); }
  }
  for (let i = 0; i < 3; i++) p.box(L / 2 - 0.1, 0.03, 0.05, 0, deckY + 0.34 + 0.02, -0.33 + i * 0.33, col);
  for (const x of [-L / 2 + 0.1, 0, L / 2 - 0.1]) p.box(0.16, deckY + 0.3, 0.5, x, -0.3, 0, c.concreteD);
}

/**
 * L'avenue éclairée (Moderne, chez l'allié, entre la ville et la concession) : une chaussée de `w` de long le long de x,
 * ses trottoirs, son terre-plein planté (palmiers ou pins taillés), des réverbères doubles, des bancs, des passants, un
 * kiosque ; au Futuriste, des bandeaux lumineux
 */
function avenue(p: Parts, people: People, age: number, len: number) {
  const c = look(people, age), L = Math.max(1.6, len);
  p.box(L, 0.02, 0.7, 0, 0.01, 0, age >= 5 ? 0xe6e8e6 : 0x5e6066);
  for (const s of [-1, 1]) p.box(L, 0.035, 0.16, 0, 0.01, s * 0.43, c.or ? 0xe6dcc4 : 0xc9c4b8);
  p.box(L, 0.04, 0.12, 0, 0.01, 0, c.or ? 0xd8c7a2 : A.stone);
  for (let i = 0; i < 8; i++) p.box(L / 16, 0.003, 0.015, -L / 2 + (i + 0.5) * L / 8, 0.022, 0.18, 0xf4f0e8);
  const n = Math.max(3, Math.round(L / 0.6));
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * L / n;
    // le terre-plein planté
    if (c.or) { p.cyl(0.015, 0.02, 0.36, 5, x, 0.05, 0, 0x8a6a48); for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.16, 0.01, 0.04).rotateZ(-0.4).rotateY((k / 5) * PI * 2), x, 0.41, 0, O.green); }
    else { p.cyl(0.015, 0.02, 0.2, 5, x, 0.05, 0, 0x4a3426); p.sphere(0.1, x, 0.3, 0, A.pine, 0, 0.8); }
    // les réverbères des trottoirs
    for (const s of [-1, 1]) {
      if (i % 2) continue;
      if (age >= 5) { p.cyl(0.01, 0.012, 0.36, 5, x, 0.04, s * 0.48, 0xe8eaee); p.add(new THREE.TorusGeometry(0.03, 0.005, 3, 10).rotateX(PI / 2), x, 0.4, s * 0.48, c.or ? O.turqL : A.pink, 0, 'neon'); }
      else { p.cyl(0.008, 0.01, 0.42, 5, x, 0.04, s * 0.48, c.metal); p.box(0.1, 0.012, 0.04, x, 0.46, s * 0.45, c.metal); p.box(0.07, 0.008, 0.03, x, 0.454, s * 0.42, 0xfff0c0, 0, true); }
    }
  }
  // un banc, deux passants, le kiosque à journaux
  p.box(0.16, 0.02, 0.05, -L / 4, 0.06, 0.46, c.wood);
  for (const [x, z, col] of [[L / 5, -0.44, 0x3a5a9a], [-L / 6, 0.43, 0xd84a3e]] as const) { p.box(0.05, 0.12, 0.04, x, 0.04, z, col); p.box(0.035, 0.035, 0.035, x, 0.17, z, 0xe8b894); }
  p.box(0.14, 0.16, 0.12, L / 2 - 0.15, 0.04, -0.46, c.accent); p.box(0.18, 0.02, 0.16, L / 2 - 0.15, 0.2, -0.46, c.or ? O.white : A.tile);
}

/**
 * Le mât aux trois drapeaux (Moderne, chez l'allié, sur la voie de la paix) : un socle rond en gradins et ses fleurs, trois
 * hampes, le drapeau de l'allié, le nôtre au milieu, plus haut, celui de nos rivaux d'hier
 */
function mast3(p: Parts, people: People, age: number) {
  const c = look(people, age), other = look(people === 'orient' ? 'asie' : 'orient', age);
  p.cyl(0.5, 0.55, 0.06, 14, 0, 0, 0, c.stone); p.cyl(0.38, 0.42, 0.06, 14, 0, 0.06, 0, c.stoneD);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; p.sphere(0.04, Math.cos(a) * 0.46, 0.07, Math.sin(a) * 0.46, [0xd8577a, 0xe8c14a, 0xf2efe6][i % 3]); }
  flag(p, -0.22, 0, 0.9, c.flag, c.flag2, 0.12);
  flag(p, 0, 0.05, 1.1, TEAM_FLAG, undefined, 0.12);
  flag(p, 0.22, 0, 0.9, other.flag, other.flag2, 0.12);
  p.box(0.3, 0.08, 0.02, 0, 0.12, 0.4, c.accent);
}

/** Nos drapeaux sur la ville vaincue (au palais, au port) : un grand mât à nos couleurs, son socle, une couronne de fleurs */
function ourFlags(p: Parts, people: People, age: number) {
  const c = look(people, age);
  p.box(0.3, 0.1, 0.3, 0, 0, 0, c.stoneD);
  flag(p, 0, 0, 1.2, TEAM_FLAG, undefined, 0.1, 1.2);
}

/** Les sortes de ces lots, et leur dessin (faux pour une autre sorte) */
export const WAR_LOTS = ['bastion', 'quayBattery', 'casemate', 'coastGun', 'wire', 'radarMast', 'pontoon', 'guardPost', 'bridge', 'avenue', 'mast3', 'ourFlags'] as const;
export type WarLot = (typeof WAR_LOTS)[number];
export function campaignModel(p: Parts, people: People, kind: string, age: number, w: number): boolean {
  switch (kind) {
    case 'bastion': bastion(p, people, age); return true;
    case 'quayBattery': quayBattery(p, people, age); return true;
    case 'casemate': casemate(p, people, age); return true;
    case 'coastGun': coastGun(p, people, age); return true;
    case 'wire': wire(p, people, age); return true;
    case 'radarMast': radarMast(p, people, age); return true;
    case 'pontoon': pontoon(p, people, age); return true;
    case 'guardPost': guardPost(p, people, age); return true;
    case 'bridge': bridge(p, people, age, w); return true;
    case 'avenue': avenue(p, people, age, w); return true;
    case 'mast3': mast3(p, people, age); return true;
    case 'ourFlags': ourFlags(p, people, age); return true;
  }
  return false;
}
