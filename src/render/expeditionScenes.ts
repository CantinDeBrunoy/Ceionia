import * as THREE from 'three';
import { World, N, SEA, VEG_FOREST, VEG_CAVE } from '../world/world';
import { Agents } from '../sim/agents';
import { ActiveExpedition } from '../sim/expeditions';
import { HerdKind, Scene } from '../sim/missions';
import { Act } from '../world/gardens';
import { makeActor, play, hasModel, Actor, ModelName } from './assets';
import { makeFolk, folkStep, Folk, FolkPose, FolkRole } from './folk';
import { balloonBasketGeo, balloonEnvelopeGeo } from './balloon';
import { locoGeo } from './railway';
import { Parts } from './parts';
import { mats } from './materials';
import type { CombatFx } from './combatFx';
import { rocketGeo, ROCKET_H, ROCKET_R, RocketKind } from './rocket';
import { SPACEPAD } from './models';
import { Building, sizeOf } from '../build/catalog';

/** Modèle et taille (longueur du corps) des bêtes des expéditions */
export const ANIMAL: Record<HerdKind | 'wolf', [ModelName, number]> = { sheep: ['sheep', 0.2], cow: ['cow', 0.3], pig: ['pig', 0.17], horse: ['horse', 0.34], wolf: ['wolf', 0.3] };

// ---------------- Accessoires (géométries partagées, faites à la première demande) ----------------
const cache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: (p: Parts) => void) {
  let g = cache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; cache.set(key, g); }
  return g;
}
const tentGeo = () => geo('tent', (p) => {
  // toile rayée, entrée sombre, mâts qui dépassent
  p.gable(0.36, 0.3, 0.34, 0, 0, 0, 0xc8643a);
  p.gable(0.37, 0.12, 0.13, 0, 0.18, 0, 0xe8d6b0);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.181, 0, 0.07, 0.181, 0, -0.07, 0.181, 0.17, 0], 3)), 0, 0, 0, 0x3a2a22);
  p.box(0.014, 0.34, 0.014, 0.18, 0, 0, 0x7a6355);
  p.box(0.014, 0.34, 0.014, -0.18, 0, 0, 0x7a6355);
});
const fireGeo = () => geo('fire', (p) => {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; p.sphere(0.025, Math.cos(a) * 0.075, 0.012, Math.sin(a) * 0.075, 0x8a857c); }
  for (const r of [0, 1.05, 2.1]) p.box(0.022, 0.022, 0.13, 0, 0.01, 0, 0x6a4a34, r);
});
const boatGeo = () => geo('boat', (p) => {
  const side = 0x9a6a44, dark = 0x6f4a30;
  p.box(0.15, 0.012, 0.3, 0, 0, 0, dark);
  for (const s of [-1, 1]) { p.box(0.014, 0.05, 0.3, s * 0.07, 0, 0, side); p.box(0.008, 0.008, 0.28, s * 0.11, 0.035, 0.01, 0xb08458, s * 0.45); }
  p.box(0.15, 0.05, 0.014, 0, 0, -0.15, side);
  p.box(0.1, 0.05, 0.05, 0, 0, 0.17, side);
  p.box(0.05, 0.05, 0.04, 0, 0, 0.21, side);
  p.box(0.13, 0.01, 0.045, 0, 0.032, 0.06, 0xb08458);
  p.box(0.13, 0.01, 0.045, 0, 0.032, -0.08, 0xb08458);
});
const rodGeo = () => geo('rod', (p) => p.add(new THREE.CylinderGeometry(0.003, 0.006, 0.42, 4).translate(0, 0.21, 0), 0, 0, 0, 0x6a4a34));
const bobberGeo = () => geo('bobber', (p) => { p.sphere(0.014, 0, 0.004, 0, 0xffffff); p.sphere(0.0145, 0, 0.012, 0, 0xd8443a, 0, 0.6); });
const fishGeo = () => geo('fish', (p) => {
  p.sphere(0.03, 0, 0, 0, 0xc9cdd2, 0, 0.55);
  p.add(new THREE.ConeGeometry(0.02, 0.035, 3).rotateX(-Math.PI / 2), 0, 0, -0.04, 0xa8adb4);
});
const rocksGeo = () => geo('rocks', (p) => {
  for (const [x, z, r, c] of [[0, 0, 0.13, 0x8d8a84], [0.13, 0.05, 0.09, 0x7d7a74], [-0.1, 0.08, 0.08, 0x9a958c], [0.04, -0.12, 0.085, 0x86827b], [-0.07, -0.06, 0.07, 0x7a766f]] as number[][])
    p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1), x, r * 0.55, z, c);
  for (const [x, y, z, c] of [[0.05, 0.16, 0.03, 0xd8a64a], [-0.08, 0.1, 0.1, 0x8fb3c9], [0.14, 0.11, -0.02, 0xd8a64a], [-0.02, 0.13, -0.1, 0xb0574a]] as number[][])
    p.add(new THREE.IcosahedronGeometry(0.022, 0), x, y, z, c);
});
/** Pan de falaise : blocs gris dressés, rognons de silex noirs à cortex blanc sur la face */
const cliffGeo = () => geo('cliff', (p) => {
  for (const [x, h, r, c] of [[-0.24, 0.3, 0.13, 0x8d8a84], [-0.08, 0.44, 0.15, 0x9a958c], [0.09, 0.38, 0.14, 0x86827b], [0.24, 0.26, 0.12, 0x928e86], [0, 0.6, 0.11, 0xa29d94]] as number[][])
    p.add(new THREE.DodecahedronGeometry(r, 0).scale(1, h / r / 2, 0.8), x, h / 2, -0.04, c);
  for (const [x, y] of [[-0.2, 0.14], [-0.06, 0.28], [0.1, 0.18], [0.02, 0.42], [0.22, 0.1], [-0.12, 0.06]]) {
    p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 0.75, 0.6), x, y, 0.07, 0xe8e2d4);
    p.add(new THREE.IcosahedronGeometry(0.022, 0).scale(1, 0.75, 0.6), x, y, 0.088, 0x2e3038);
  }
});
const cartGeo = () => geo('cart', (p) => {
  p.box(0.14, 0.06, 0.2, 0, 0.05, 0, 0x9a7452);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8).rotateZ(Math.PI / 2), s * 0.08, 0.04, 0, 0x5a3e2e);
  for (const s of [-1, 1]) p.box(0.012, 0.012, 0.16, s * 0.05, 0.08, 0.15, 0x7a6355);
});
const bushGeo = () => geo('bush', (p) => {
  p.sphere(0.11, 0, 0.09, 0, 0x4f8a45, 1, 0.8);
  p.sphere(0.07, 0.07, 0.07, 0.04, 0x5c9a50, 1, 0.8);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4, y = 0.05 + (i % 4) * 0.03, r = 0.1 - Math.abs(y - 0.09) * 0.5;
    p.sphere(0.014, Math.cos(a) * r, y, Math.sin(a) * r, i % 3 ? 0xc8344a : 0x5a3a8a);
  }
});
const basketGeo = () => geo('basket', (p) => { p.cyl(0.06, 0.045, 0.06, 8, 0, 0, 0, 0xb08a5a); p.cyl(0.064, 0.064, 0.008, 8, 0, 0.056, 0, 0x8a6a44); });
const berriesGeo = () => geo('berries', (p) => { for (let i = 0; i < 9; i++) p.sphere(0.018, Math.cos(i * 2.1) * 0.03, (i % 3) * 0.012, Math.sin(i * 2.1) * 0.03, i % 3 ? 0xc8344a : 0x5a3a8a); });
const postGeo = () => geo('post', (p) => { p.box(0.026, 0.17, 0.026, 0, 0, 0, 0x8a6a4a); p.box(0.03, 0.012, 0.03, 0, 0.17, 0, 0x6f5238); });
const railGeo = () => geo('rail', (p) => p.box(0.01, 0.01, 1, 0, 0, -0.5, 0x9a7a5a));
const stoneGeo = () => geo('stone', (p) => { p.box(0.1, 0.05, 0.06, 0, 0, 0, 0x9a958c); p.box(0.07, 0.04, 0.055, 0.01, 0.05, 0, 0x8a857c); });
const trackGeo = () => geo('track', (p) => {
  for (const z of [0.07, 0.22]) p.box(0.17, 0.014, 0.035, 0, 0, z, 0x5a4232);
  for (const s of [-1, 1]) p.box(0.012, 0.016, 0.3, s * 0.05, 0.014, 0.15, 0x8a8f96);
});
const puffGeo = () => geo('puff', (p) => p.sphere(0.03, 0, 0, 0, 0xb8b2a8, 0));
/** Tronçon de la voie qu'on pose (le long de +z, de 0 à 0,3) : ballast, quatre traverses, deux rails et leurs éclisses */
const laidGeo = () => geo('laid', (p) => {
  p.box(0.22, 0.012, 0.3, 0, 0, 0.15, 0xa8a29a);
  for (let k = 0; k < 4; k++) p.box(0.17, 0.014, 0.034, 0, 0.01, 0.04 + k * 0.074, 0x5a4232);
  for (const s of [-1, 1]) { p.box(0.012, 0.016, 0.3, s * 0.05, 0.024, 0.15, 0x8a8f96); p.box(0.016, 0.01, 0.03, s * 0.05, 0.024, 0.0, 0x5d6168); }
});
/** Plate-forme du train de chantier (avant = +z) : châssis, roues, rails et traverses chargés, ridelles */
const flatcarGeo = () => geo('flatcar', (p) => {
  p.box(0.15, 0.03, 0.26, 0, 0.045, 0, 0x4a4a4e);
  for (const z of [-0.08, 0.08]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 8).rotateZ(Math.PI / 2), s * 0.05, 0.026, z, 0x2a2a2e);
  for (let k = 0; k < 3; k++) p.box(0.012, 0.012, 0.24, -0.04 + k * 0.04, 0.075 + (k % 2) * 0.012, 0, 0x8a8f96);
  for (let k = 0; k < 5; k++) p.box(0.14, 0.014, 0.03, 0, 0.087, -0.1 + k * 0.05, 0x5a4232);
  for (const s of [-1, 1]) p.box(0.006, 0.03, 0.26, s * 0.072, 0.075, 0, 0x6a4a34);
});
/** Les rails et les traverses en réserve au départ du chantier */
const railStockGeo = () => geo('railstock', (p) => {
  for (let k = 0; k < 4; k++) p.box(0.012, 0.012, 0.36, -0.03 + (k % 2) * 0.03, 0.012 * Math.floor(k / 2), 0, 0x8a8f96);
  for (let k = 0; k < 6; k++) p.box(0.17, 0.016, 0.034, 0.2, 0.016 * Math.floor(k / 2), -0.06 + (k % 2) * 0.05, 0x5a4232, 0.1);
});

// ---------------- Accessoires du cœur des missions ----------------
const sacksGeo = () => geo('sacks', (p) => {
  for (const [x, z, s] of [[0, 0, 1], [0.08, 0.05, 0.85], [-0.07, 0.06, 0.9], [0.02, -0.08, 0.8]] as number[][]) {
    p.sphere(0.05 * s, x, 0.045 * s, z, 0xd9c4a0, 0, 1.25);
    p.cyl(0.012 * s, 0.018 * s, 0.03 * s, 6, x, 0.1 * s, z, 0xb8a07a);
  }
});
const potsGeo = () => geo('pots', (p) => {
  for (const [x, z, s, c] of [[0, 0, 1, 0xc8743a], [0.09, 0.03, 0.8, 0xb8623a], [-0.08, 0.05, 0.75, 0xd88a50], [0.03, -0.08, 0.7, 0xa85a34]] as number[][]) {
    p.sphere(0.045 * s, x, 0.045 * s, z, c, 1, 1.1);
    p.cyl(0.022 * s, 0.03 * s, 0.035 * s, 7, x, 0.085 * s, z, c);
    p.add(new THREE.TorusGeometry(0.03 * s, 0.006, 3, 8).rotateX(Math.PI / 2), x, 0.035 * s, z, 0xf2e2c4);
  }
});
const foodGeo = () => geo('food', (p) => {
  p.box(0.12, 0.07, 0.09, 0, 0, 0, 0xb48a5e);
  for (const [x, z, c] of [[-0.03, -0.01, 0xd8443a], [0.02, 0.02, 0xe8b84a], [0.035, -0.02, 0x7cc46a]] as number[][]) p.sphere(0.022, x, 0.08, z, c);
  p.cyl(0.035, 0.035, 0.03, 8, 0.12, 0, 0.04, 0xe8c66a);
});
const blanketGeo = () => geo('blanket', (p) => {
  for (let i = 0; i < 6; i++) p.box(0.07, 0.006, 0.4, -0.175 + i * 0.07, 0.002, 0, [0xc8643a, 0xe8d6b0, 0x4a7aa8][i % 3]);
});
const hutGeo = () => geo('hut', (p) => {
  p.cyl(0.16, 0.17, 0.16, 9, 0, 0, 0, 0xb08a64);
  p.cone(0.22, 0.24, 9, 0, 0.16, 0, 0xdcc080);
  p.box(0.07, 0.11, 0.02, 0, 0, 0.165, 0x3a2a22);
});
const yurtGeo = () => geo('yurt', (p) => {
  p.cyl(0.19, 0.19, 0.15, 12, 0, 0, 0, 0xf0e8d8);
  for (const y of [0.05, 0.11]) p.cyl(0.192, 0.192, 0.012, 12, 0, y, 0, 0xc8643a);
  p.cone(0.21, 0.12, 12, 0, 0.15, 0, 0xe0d4bc);
  p.cyl(0.025, 0.025, 0.02, 6, 0, 0.27, 0, 0x7a6355);
  p.box(0.07, 0.11, 0.02, 0, 0, 0.19, 0xc8643a);
});
const poolGeo = (reeds: boolean) => geo(`pool${+reeds}`, (p) => {
  p.cyl(0.33, 0.33, 0.012, 14, 0, 0, 0, 0x5a8a8a);
  p.cyl(0.3, 0.3, 0.012, 14, 0, 0.012, 0, 0x7fd0dc);
  for (let i = 0; i < 13; i++) { const a = (i / 13) * Math.PI * 2; p.sphere(0.05 + (i % 3) * 0.012, Math.cos(a) * 0.34, 0.02, Math.sin(a) * 0.34, i % 2 ? 0x9d9890 : 0xb8b2a8, 0, 0.7); }
  if (reeds) for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; p.box(0.008, 0.16 + (i % 3) * 0.04, 0.008, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0x6a8a4a, 0, false, (i % 2 ? 0.15 : -0.15)); p.box(0.014, 0.04, 0.014, Math.cos(a) * 0.4, 0.16 + (i % 3) * 0.04, Math.sin(a) * 0.4, 0x6a4a2e); }
});
const oakGeo = () => geo('oak', (p) => {
  p.cyl(0.08, 0.12, 0.42, 8, 0, 0, 0, 0x6a4a34);
  for (const a of [0.4, 2.3, 4.2]) p.box(0.05, 0.04, 0.14, Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, 0x5a3e2e, -a);
  p.box(0.05, 0.08, 0.02, 0, 0.2, 0.08, 0x2a1e18);
  for (const [x, y, z, r] of [[0, 0.55, 0, 0.26], [0.18, 0.48, 0.08, 0.17], [-0.16, 0.5, -0.06, 0.18], [0.04, 0.68, -0.1, 0.15]] as number[][]) p.sphere(r, x, y, z, 0x4f7a3e, 1, 0.8);
});
const sproutTreeGeo = () => geo('sprout', (p) => {
  p.cyl(0.025, 0.035, 0.32, 6, 0, 0, 0, 0x7a5a3e);
  p.box(0.16, 0.02, 0.02, 0.08, 0.26, 0, 0x7a5a3e, 0, false, -0.2);
  for (const [x, y, z, r] of [[0, 0.42, 0, 0.14], [0.1, 0.36, 0.05, 0.1], [-0.08, 0.38, -0.04, 0.1]] as number[][]) p.sphere(r, x, y, z, 0x6a9a50, 1, 0.8);
});
const clusterGeo = () => geo('cluster', (p) => { p.sphere(0.045, 0, -0.05, 0, 0x9a6a2a, 1, 1.4); for (let i = 0; i < 8; i++) p.sphere(0.012, Math.cos(i) * 0.04, -0.05 + Math.sin(i * 1.7) * 0.05, Math.sin(i) * 0.04, 0xf0c040); });
const skepGeo = () => geo('skep', (p) => {
  p.add(new THREE.SphereGeometry(0.06, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), 0, 0, 0, 0xdcc080);
  for (const h of [0.25, 0.5, 0.72]) p.add(new THREE.TorusGeometry(0.06 * Math.sqrt(1 - h * h) + 0.002, 0.006, 3, 10).rotateX(Math.PI / 2), 0, h * 0.078, 0, 0xb09a5a);
  p.box(0.024, 0.014, 0.01, 0, 0, 0.056, 0x2a2018);
});
const logHiveGeo = () => geo('loghive', (p) => { p.cyl(0.06, 0.065, 0.2, 8, 0, 0, 0, 0x6a4a34); p.cyl(0.075, 0.07, 0.022, 7, 0, 0.2, 0, 0x8d8a84); p.box(0.022, 0.018, 0.01, 0, 0.08, 0.06, 0x2a2018); });
const pebblesGeo = () => geo('pebbles', (p) => { for (let i = 0; i < 9; i++) p.sphere(0.022 + (i % 3) * 0.008, Math.cos(i * 2.3) * 0.09, 0.008, Math.sin(i * 2.3) * 0.09, [0x8d8a84, 0x6a6f78, 0xb8b2a8][i % 3], 0, 0.55); });
const flintsGeo = () => geo('flints', (p) => { for (let i = 0; i < 7; i++) p.add(new THREE.IcosahedronGeometry(0.017, 0).scale(1, 0.7, 1.3), Math.cos(i * 2.1) * 0.028, (i % 3) * 0.012, Math.sin(i * 2.1) * 0.028, i % 2 ? 0x4a4e58 : 0x6a6f78); });
const hopGeo = () => geo('hop', (p) => {
  p.box(0.016, 0.5, 0.016, 0, 0, 0, 0x8a6a4a);
  for (let i = 0; i < 12; i++) { const a = i * 0.9, y = 0.04 + i * 0.038; p.sphere(0.022, Math.cos(a) * 0.022, y, Math.sin(a) * 0.022, 0x5c9a50, 0, 0.8); if (i % 2) p.cone(0.014, 0.026, 5, Math.cos(a) * 0.04, y - 0.01, Math.sin(a) * 0.04, 0xb8d88a); }
});
const hopConesGeo = () => geo('hopcones', (p) => { for (let i = 0; i < 9; i++) p.cone(0.016, 0.03, 5, Math.cos(i * 2.1) * 0.03, (i % 3) * 0.012, Math.sin(i * 2.1) * 0.03, 0xb8d88a); });
const cairnGeo = () => geo('cairn', (p) => { for (const [y, r] of [[0, 0.09], [0.07, 0.07], [0.13, 0.055], [0.18, 0.04], [0.22, 0.03]]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.6, 1), 0, y + r * 0.4, 0, 0x9a958c); });
const copperGeo = () => geo('copper', (p) => {
  for (const [x, z, r] of [[0, 0, 0.12], [0.12, 0.05, 0.08], [-0.1, 0.07, 0.07], [0.03, -0.1, 0.08]] as number[][]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1), x, r * 0.55, z, 0x7d7a74);
  for (const [x, y, z] of [[0.05, 0.15, 0.03], [-0.07, 0.1, 0.08], [0.13, 0.1, -0.01], [-0.01, 0.12, -0.09], [0.08, 0.06, 0.09]] as number[][]) p.add(new THREE.IcosahedronGeometry(0.024, 0), x, y, z, 0x3fa878);
});
const corralGeo = () => geo('corral', (p) => {
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.box(0.024, 0.16, 0.024, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0x8a6a4a); }
  for (const y of [0.07, 0.13]) p.add(new THREE.TorusGeometry(0.5, 0.006, 3, 20).rotateX(Math.PI / 2), 0, y, 0, 0xc9b48a);
});
const saltGeo = () => geo('salt', (p) => { p.box(0.08, 0.06, 0.07, 0, 0, 0, 0xf2f0ea, 0.3); p.box(0.05, 0.04, 0.05, 0.06, 0, 0.05, 0xe8e4dc, 0.9); });
/** Arche de départ de la course : deux poteaux, banderole à damier, fanions */
const raceArchGeo = () => geo('racearch', (p) => {
  for (const s of [-1, 1]) p.box(0.025, 0.42, 0.025, s * 0.3, 0, 0, 0x5a4a3a);
  for (let k = 0; k < 12; k++) for (let j = 0; j < 2; j++) p.box(0.05, 0.04, 0.008, -0.275 + k * 0.05, 0.36 + j * 0.04, 0, (k + j) % 2 ? 0x1e1e22 : 0xf4f2ee);
  for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.03, 0.06, 3).rotateZ(-Math.PI / 2), s * 0.3 + 0.03, 0.44, 0, s > 0 ? 0xd84a3e : 0x3a6ab8);
});
/** Automobile ancienne, nez vers +z : caisse sombre, capot, radiateur de laiton, roues à rayons, phares */
const oldCarGeo = () => geo('oldcar', (p) => {
  p.box(0.13, 0.05, 0.22, 0, 0.05, -0.02, 0x1e2a24); p.box(0.11, 0.045, 0.09, 0, 0.075, 0.11, 0x2a2a2e);
  p.box(0.09, 0.055, 0.012, 0, 0.065, 0.16, 0xc8a050); p.box(0.12, 0.055, 0.028, 0, 0.1, -0.08, 0x5a3a2a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.016, 10).rotateZ(Math.PI / 2), sx * 0.072, 0.04, sz * 0.09 - 0.01, 0x2a2a2e); p.box(0.026, 0.008, 0.08, sx * 0.072, 0.082, sz * 0.09 - 0.01, 0x1e1e22); }
  for (const sx of [-1, 1]) p.box(0.022, 0.022, 0.022, sx * 0.045, 0.09, 0.165, 0xffe8a0);
});
/** Bidon d'essence rouge */
const fuelCanGeo = () => geo('fuelcan', (p) => { p.box(0.05, 0.07, 0.03, 0, 0, 0, 0xc83a32); p.box(0.012, 0.02, 0.012, 0.015, 0.07, 0, 0x8a8f96); });
/** La montgolfière du premier envol : fuseaux rouges et or, ceinture bleue ; sa nacelle */
let balloonEnv: THREE.BufferGeometry | null = null, balloonBasket: THREE.BufferGeometry | null = null;
const BALLOON_ENV = () => (balloonEnv ??= balloonEnvelopeGeo(0xd84a3e, 0xf2c23a, 0x3a6ab8));
const BALLOON_BASKET = () => (balloonBasket ??= balloonBasketGeo());
const wagonGeo = () => geo('wagon', (p) => {
  p.box(0.36, 0.14, 0.2, 0, 0.07, 0, 0xc84a3e);
  p.box(0.38, 0.02, 0.22, 0, 0.21, 0, 0xe8c66a);
  for (let i = 0; i < 6; i++) p.add(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), -0.15 + i * 0.06, 0.22, 0, i % 2 ? 0x4a7aa8 : 0xf2e8d0);
  for (const [x, z] of [[-0.12, 0.11], [0.12, 0.11], [-0.12, -0.11], [0.12, -0.11]]) p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateX(Math.PI / 2), x, 0.06, z, 0x6a4a34);
  p.box(0.1, 0.012, 0.012, 0.24, 0.06, 0.04, 0x6a4a34); p.box(0.1, 0.012, 0.012, 0.24, 0.06, -0.04, 0x6a4a34);
  for (let i = 0; i < 5; i++) p.sphere(0.012, -0.12 + i * 0.06, 0.18, 0.105, [0xd8443a, 0xe8b84a, 0x4a7aa8, 0x7cc46a, 0xd88ab8][i]);
});
const chapelGeo = () => geo('chapel', (p) => {
  p.box(0.34, 0.3, 0.26, 0, 0, 0, 0xcfcac2);
  p.gable(0.36, 0.16, 0.3, 0, 0.3, 0, 0x8e9bb4);
  p.box(0.1, 0.16, 0.1, 0.12, 0.38, 0, 0xcfcac2); p.pyramid(0.13, 0.1, 0.13, 0.12, 0.54, 0, 0x8e9bb4);
  p.box(0.04, 0.05, 0.012, 0.12, 0.44, 0.051, 0x3c3530);
  p.box(0.012, 0.14, 0.08, 0.171, 0, 0, 0x6a4a3a);
  p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 10).rotateZ(Math.PI / 2), 0.172, 0.21, 0, 0xc8a0d8);
  p.box(0.46, 0.08, 0.04, -0.06, 0, 0.26, 0x9d9890); p.box(0.46, 0.08, 0.04, -0.06, 0, -0.26, 0x9d9890);
});
const kettleGeo = () => geo('kettle', (p) => {
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.sphere(0.022, Math.cos(a) * 0.07, 0.01, Math.sin(a) * 0.07, 0x8a857c); }
  p.cyl(0.075, 0.06, 0.09, 10, 0, 0.03, 0, 0xc8783a);
  p.add(new THREE.TorusGeometry(0.075, 0.008, 4, 12).rotateX(Math.PI / 2), 0, 0.12, 0, 0xa85e2a);
  p.cyl(0.066, 0.066, 0.006, 10, 0, 0.112, 0, 0xc89a4a);
  for (const s of [-1, 1]) p.box(0.012, 0.18, 0.012, s * 0.1, 0, 0, 0x6a4a34);
  p.box(0.22, 0.012, 0.012, 0, 0.18, 0, 0x6a4a34);
});
const barrelsGeo = () => geo('barrels', (p) => { for (const [x, z] of [[0, 0], [0.09, 0.03]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0, z, 0x9a6a44); for (const y of [0.02, 0.065]) p.cyl(0.042, 0.042, 0.008, 8, x, y, z, 0x6f5640); } });
const galleryGeo = (stone: boolean) => geo(`gallery${+stone}`, (p) => {
  // entrée boisée (ou tunnel maçonné) dans la pente, gravats autour
  const c = stone ? 0x9d9890 : 0x7a5a3e;
  // la pente rocheuse où s'ouvre l'entrée
  for (const [x, yy, z, r] of [[0, 0.12, -0.12, 0.2], [-0.18, 0.06, -0.08, 0.13], [0.19, 0.07, -0.09, 0.14], [0.06, 0.26, -0.16, 0.12]] as number[][]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.85, 0.8), x, yy, z, [0x8d8a84, 0x7d7a74, 0x9a958c, 0x86827b][Math.round(r * 100) % 4]);
  p.box(0.2, 0.22, 0.05, 0, 0, 0.02, 0x1e1814);
  for (const s of [-1, 1]) p.box(0.04, 0.25, 0.05, s * 0.12, 0, 0.03, c);
  p.box(0.32, 0.05, 0.06, 0, 0.24, 0.03, c);
  if (stone) p.add(new THREE.TorusGeometry(0.12, 0.025, 4, 10, Math.PI), 0, 0.2, 0.04, 0x9d9890);
  for (let i = 0; i < 6; i++) p.add(new THREE.IcosahedronGeometry(0.03 + (i % 3) * 0.01, 0).scale(1, 0.6, 1), -0.2 + i * 0.08, 0.01, 0.1 + (i % 2) * 0.05, 0x8d8a84);
});
const stakeTorchGeo = () => geo('staketorch', (p) => { p.box(0.016, 0.24, 0.016, 0, 0, 0, 0x6a4a34); p.cyl(0.02, 0.014, 0.03, 6, 0, 0.24, 0, 0x4a3a2e); });
const deckGeo = (iron: boolean) => geo(`deck${+iron}`, (p) => {
  p.box(0.2, 0.02, 0.24, 0, 0, 0, iron ? 0x6a6f78 : 0x8a6a4a);
  for (const s of [-1, 1]) { p.box(0.2, 0.05, 0.016, 0, 0.02, s * 0.12, iron ? 0x4a5560 : 0x6a4a34); p.box(0.016, 0.1, 0.016, 0.09, 0.02, s * 0.12, iron ? 0x4a5560 : 0x6a4a34); }
  if (iron) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.22, 0.012, 0.012), 0, 0.06, s * 0.12, 0x4a5560, 0, false, 0.4);
  p.box(0.04, 0.3, 0.04, 0, -0.3, 0, iron ? 0x4a5560 : 0x6a4a34);
});
const derrickGeo = () => geo('derrick', (p) => {
  for (const a of [0, 2.1, 4.2]) p.add(new THREE.BoxGeometry(0.02, 0.62, 0.02).translate(0, 0.31, 0), Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0x6a5040, 0, false, Math.cos(a) * 0.19, -Math.sin(a) * 0.19);
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateX(Math.PI / 2), 0, 0.6, 0, 0x8a8f96);
  p.box(0.006, 0.55, 0.006, 0, 0.05, 0, 0x2a2a2a);
  p.cyl(0.03, 0.03, 0.08, 8, 0, 0, 0, 0x4a5560);
});
const boilerGeo = () => geo('boiler', (p) => {
  p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10).rotateZ(Math.PI / 2), 0, 0.09, 0, 0x4a5560);
  for (const s of [-1, 1]) p.box(0.04, 0.03, 0.12, s * 0.07, 0, 0, 0x6a4a34);
  p.cyl(0.02, 0.022, 0.18, 6, 0.07, 0.14, 0, 0x2a2a2a);
  p.add(new THREE.TorusGeometry(0.03, 0.008, 4, 8), -0.09, 0.09, 0.06, 0xc8783a);
});
const coreGeo = () => geo('core', (p) => { p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6).rotateZ(Math.PI / 2), 0, 0.018, 0, 0x5a5650); p.add(new THREE.CylinderGeometry(0.019, 0.019, 0.04, 6).rotateZ(Math.PI / 2), 0.03, 0.018, 0, 0x2a2826); });
const stakeFlagGeo = () => geo('stakeflag', (p) => { p.box(0.02, 0.34, 0.02, 0, 0, 0, 0x8a6a4a); p.cone(0.012, 0.03, 4, 0, 0.34, 0, 0x6a4a34); p.box(0.005, 0.07, 0.1, 0, 0.25, 0.05, 0xf0902a); p.box(0.006, 0.02, 0.1, 0, 0.27, 0.05, 0xf8e0a0); });
const mapTableGeo = () => geo('maptable', (p) => {
  for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(0.012, 0.11, 0.1), s * 0.08, 0.05, 0, 0x6a4a34, 0, false, 0, 0); }
  p.box(0.22, 0.014, 0.14, 0, 0.1, 0, 0x9a7a5a); p.box(0.16, 0.003, 0.1, 0, 0.114, 0, 0xf2e8d0, 0.12);
  for (const [x, z, c] of [[-0.04, 0.02, 0xc8443a], [0.03, -0.02, 0x3c3530], [0.05, 0.03, 0xc8443a]] as [number, number, number][]) p.box(0.01, 0.01, 0.01, x, 0.117, z, c);
});
const flagGeo = () => geo('flag', (p) => { p.cyl(0.006, 0.008, 0.42, 5, 0, 0, 0, 0xd8d8d8); p.box(0.006, 0.08, 0.13, 0, 0.32, 0.065, 0xd8443a); p.sphere(0.012, 0, 0.43, 0, 0xe8c66a); });
const stationGeo = () => geo('station', (p) => {
  p.box(0.012, 0.36, 0.012, 0, 0, 0, 0xd8d8d8);
  p.box(0.1, 0.08, 0.08, 0.08, 0.14, 0, 0xf7f3ec); for (let i = 0; i < 3; i++) p.box(0.1, 0.005, 0.082, 0.08, 0.155 + i * 0.02, 0.0, 0xd8d0c0);
  for (const s of [-1, 1]) p.box(0.006, 0.14, 0.006, 0.08 + s * 0.04, 0, 0.03, 0xd8d8d8);
  p.add(new THREE.BoxGeometry(0.14, 0.008, 0.1), -0.06, 0.24, 0, 0x2c3e66, 0, false, 0.5);
});
const cupsGeo = () => geo('cups', (p) => { for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; p.box(0.08, 0.004, 0.004, Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04, 0x8a8f96, -a); p.sphere(0.014, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, 0xd84a3e); } });
const telescopeGeo = () => geo('telescope', (p) => {
  for (const a of [0, 2.1, 4.2]) p.add(new THREE.BoxGeometry(0.01, 0.2, 0.01).translate(0, 0.1, 0), Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, 0x6a4a34, 0, false, Math.cos(a) * 0.25, -Math.sin(a) * 0.25);
  p.add(new THREE.CylinderGeometry(0.022, 0.03, 0.24, 8).rotateX(0.9), 0, 0.24, 0.04, 0xe8c66a);
  p.add(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 8).rotateX(0.9), 0, 0.31, 0.13, 0x2a2e38);
});
const craterGeo = () => geo('crater', (p) => {
  p.cyl(0.36, 0.38, 0.006, 14, 0, 0, 0, 0x4a3a30);
  p.add(new THREE.TorusGeometry(0.33, 0.06, 4, 16).rotateX(Math.PI / 2).scale(1, 0.5, 1), 0, 0.01, 0, 0x7a6a58);
  for (let i = 0; i < 8; i++) { const a = i * 0.8; p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 0.6, 1), Math.cos(a) * 0.48, 0.01, Math.sin(a) * 0.48, 0x6a5a48); }
});
const meteorGeo = () => geo('meteor', (p) => { p.add(new THREE.IcosahedronGeometry(0.09, 0).scale(1, 0.8, 1), 0, 0.06, 0, 0x3a3634); for (let i = 0; i < 4; i++) p.add(new THREE.IcosahedronGeometry(0.025, 0), Math.cos(i * 1.6) * 0.07, 0.1, Math.sin(i * 1.6) * 0.07, 0x5a5650); });
const drumGeo = () => geo('drum', (p) => { p.cyl(0.04, 0.04, 0.05, 10, 0, 0, 0, 0xc84a3e); p.cyl(0.041, 0.041, 0.006, 10, 0, 0.05, 0, 0xf2e8d0); });
const steamGeo = () => geo('steam', (p) => p.sphere(0.035, 0, 0, 0, 0xf4f4f2, 1));
const smokeGeo = () => geo('smoke', (p) => p.sphere(0.04, 0, 0, 0, 0x8a8680, 1));
const cloudGeo = () => geo('cloud', (p) => p.sphere(0.05, 0, 0, 0, 0xf2f0ec, 1));
const bubbleGeo = () => geo('bubble', (p) => p.sphere(0.01, 0, 0, 0, 0xffffff, 0));
const ballGeo = (c: number) => geo(`ball${c}`, (p) => p.sphere(0.014, 0, 0, 0, c));
const tentGeoC = (c: number) => geo(`tent${c}`, (p) => {
  p.gable(0.3, 0.24, 0.3, 0, 0, 0, c);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.151, 0, 0.06, 0.151, 0, -0.06, 0.151, 0.14, 0], 3)), 0, 0, 0, 0x3a2a22);
});
// ---------------- Accessoires des imprévus ----------------
/** Entrée de grotte : butte de rochers, bouche sombre tournée vers +z, stalactites, blocs éboulés devant */
const caveMouthGeo = () => geo('cavemouth', (p) => {
  for (const [x, y, z, r, sx, sy, c] of [[0, 0.2, -0.3, 0.4, 1, 0.85, 0x8d8a84], [-0.36, 0.14, 0, 0.24, 1, 0.9, 0x7d7a74], [0.37, 0.15, 0, 0.25, 1, 0.9, 0x86827b],
    [0, 0.36, 0.02, 0.2, 1.5, 0.6, 0x9a958c], [0.06, 0.5, -0.16, 0.24, 1, 0.8, 0x928e86], [-0.24, 0.34, -0.12, 0.2, 1, 0.9, 0x8a857c]] as number[][])
    p.add(new THREE.DodecahedronGeometry(r, 0).scale(sx, sy, 0.9), x, y, z, c);
  // la bouche, et le noir derrière elle (sombre sous tous les angles)
  p.add(new THREE.CircleGeometry(0.17, 10, 0, Math.PI), 0, 0, 0.15, 0x120e0c);
  p.box(0.34, 0.17, 0.12, 0, 0, 0.08, 0x1a1512);
  for (const [x, h] of [[-0.1, 0.05], [-0.03, 0.07], [0.05, 0.045], [0.11, 0.06]]) p.add(new THREE.ConeGeometry(0.014, h, 4).rotateX(Math.PI), x, 0.165 - h / 2 + 0.01, 0.155, 0x7d7a74);
  for (const [x, z, r] of [[-0.2, 0.3, 0.05], [0.18, 0.28, 0.04], [0.05, 0.38, 0.035], [-0.08, 0.42, 0.03]]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1), x, r * 0.5, z, 0x8a857c);
});
/** Nuage d'orage : boules grises tassées, plus sombres dessous */
const stormGeo = (light: boolean) => geo(`storm${+light}`, (p) => {
  for (const [x, y, z, r] of [[0, 0, 0, 0.55], [0.6, -0.05, 0.1, 0.45], [-0.55, -0.03, -0.1, 0.48], [0.2, 0.25, -0.15, 0.42], [-0.25, 0.2, 0.25, 0.38], [0.15, -0.12, 0.45, 0.36], [-0.1, -0.1, -0.5, 0.4]])
    p.add(new THREE.IcosahedronGeometry(r, 1).scale(1.3, 0.62, 1.1), x, y, z, light ? 0xc9ccd2 : y > 0.1 ? 0x6f7480 : 0x4c515c);
});
/** Éclair : un zigzag blanc, du nuage au sol (hauteur 1) */
const boltGeo = (seed: number) => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(i && i < 6 ? Math.sin(seed * 7.1 + i * 2.3) * 0.12 : 0, 1 - i / 6, i && i < 6 ? Math.cos(seed * 3.7 + i * 1.9) * 0.12 : 0));
  const g = new THREE.BufferGeometry().setFromPoints(pts.flatMap((v, i) => (i ? [pts[i - 1], v] : [])));
  return g;
};
/** Petit oiseau (ou chauve-souris) : deux ailes en V, le long de +z */
const wingGeo = (c: number) => geo(`wing${c}`, (p) => {
  p.sphere(0.012, 0, 0, 0, c);
  // chaque aile, recto et verso : on la voit d'en dessous comme d'au-dessus
  for (const s of [-1, 1]) for (const v of [[0, 0, 0.012, 0, 0, -0.012, s * 0.05, 0.012, -0.004], [0, 0, -0.012, 0, 0, 0.012, s * 0.05, 0.012, -0.004]])
    p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3)), 0, 0, 0, c);
});
/** Rocher où brille un filon : pierre grise, cristaux de couleur */
const glintGeo = () => geo('glint', (p) => {
  p.add(new THREE.DodecahedronGeometry(0.11, 0).scale(1, 0.8, 1), 0, 0.08, 0, 0x86827b);
  for (const [x, y, z, c] of [[0.05, 0.13, 0.05, 0x5ad8e8], [-0.04, 0.15, 0.04, 0xe8c64a], [0.02, 0.17, -0.03, 0x5ad8e8], [0.08, 0.09, -0.02, 0xd84a8a]] as number[][])
    p.add(new THREE.OctahedronGeometry(0.026, 0).scale(0.7, 1.3, 0.7), x, y, z, c);
});
/** Étai de galerie : deux poteaux et une traverse */
const proppingGeo = () => geo('propping', (p) => {
  for (const s of [-1, 1]) p.box(0.03, 0.3, 0.03, s * 0.16, 0, 0, 0x8a6a4a);
  p.box(0.4, 0.04, 0.05, 0, 0.3, 0, 0x7a5a3e);
});
/** Piège de corde : une boucle posée au sol, son piquet */
const snareGeo = () => geo('snare', (p) => { p.add(new THREE.TorusGeometry(0.06, 0.008, 3, 10).rotateX(Math.PI / 2), 0, 0.01, 0, 0xc9b48a); p.box(0.016, 0.08, 0.016, 0.07, 0, 0, 0x6a4a34); });
/** Empreinte de patte */
const pawGeo = () => geo('paw', (p) => { p.cyl(0.018, 0.018, 0.004, 6, 0, 0, 0, 0x4a3a2e); for (let i = 0; i < 4; i++) p.cyl(0.007, 0.007, 0.004, 5, -0.015 + i * 0.01, 0, 0.022 + (i % 3 ? 0.004 : 0), 0x4a3a2e); });
/** Branche que la crue emporte */
const branchGeo = () => geo('branch', (p) => { p.add(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 5).rotateZ(Math.PI / 2), 0, 0, 0, 0x6a4a34); p.add(new THREE.CylinderGeometry(0.008, 0.01, 0.14, 4).rotateZ(Math.PI / 2 - 0.6), 0.06, 0.03, 0.02, 0x6a4a34); p.sphere(0.04, 0.12, 0.05, 0.02, 0x5c8a45, 0, 0.6); });
/** Filet de pêche tendu sur l'eau : un quadrillage de cordelettes et ses flotteurs */
const netGeo = () => geo('net', (p) => {
  for (let i = 0; i < 6; i++) { p.box(0.5, 0.004, 0.006, 0, 0, -0.25 + i * 0.1, 0xd8d0b8); p.box(0.006, 0.004, 0.5, -0.25 + i * 0.1, 0, 0, 0xd8d0b8); }
  for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) p.sphere(0.02, x, 0.01, z, 0xe8843a);
});
/** Poissons pêchés, en tas sur la berge */
const catchGeo = () => geo('catch', (p) => { for (let i = 0; i < 7; i++) p.add(new THREE.SphereGeometry(0.026, 6, 4).scale(1, 0.5, 1.8), Math.cos(i * 2.2) * 0.04, 0.012 + (i % 3) * 0.01, Math.sin(i * 2.2) * 0.04, i % 2 ? 0xc9cdd2 : 0xa8adb4); });
/** Trois chopes sur un tonnelet */
const mugsGeo = () => geo('mugs', (p) => {
  p.cyl(0.05, 0.05, 0.08, 8, 0, 0, 0, 0x9a6a44);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; p.cyl(0.016, 0.014, 0.04, 6, Math.cos(a) * 0.025, 0.08, Math.sin(a) * 0.025, 0xc8a050); p.cyl(0.015, 0.015, 0.006, 6, Math.cos(a) * 0.025, 0.12, Math.sin(a) * 0.025, 0xf6f0e0); }
});
/** Roue de charrette, à plat */
const wheelGeo = () => geo('wheel', (p) => { p.add(new THREE.TorusGeometry(0.06, 0.012, 4, 12).rotateX(Math.PI / 2), 0, 0.012, 0, 0x6a4a34); for (let i = 0; i < 3; i++) p.box(0.12, 0.008, 0.01, 0, 0.012, 0, 0x7a5a3e, (i * Math.PI) / 3); });
/** Cage du canari des mineurs */
const cageGeo = () => geo('cage', (p) => {
  p.cyl(0.04, 0.04, 0.008, 8, 0, 0, 0, 0x8a7a4a);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.004, 0.08, 0.004, Math.cos(a) * 0.038, 0.004, Math.sin(a) * 0.038, 0xc8a050); }
  p.add(new THREE.SphereGeometry(0.04, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.08, 0, 0xc8a050);
  p.sphere(0.016, 0, 0.03, 0, 0xf2d43a);
});
/** Seau d'eau */
const bucketGeo = () => geo('bucket', (p) => { p.cyl(0.03, 0.024, 0.05, 8, 0, 0, 0, 0x8a6a4a); p.cyl(0.027, 0.027, 0.004, 8, 0, 0.044, 0, 0x5a9ac8); });
const gasGeo = () => geo('gas', (p) => p.sphere(0.04, 0, 0, 0, 0xa8c46a, 1));
const leafGeo = () => geo('leaf', (p) => p.box(0.018, 0.003, 0.012, 0, 0, 0, 0x8a9a4a));
/** Caillou qui dévale */
const pebbleGeo = () => geo('pebble', (p) => p.add(new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.8, 1), 0, 0, 0, 0x8d8a84));
/** Rigole creusée dans la terre, le long de +z */
const ditchGeo = () => geo('ditch', (p) => { p.box(0.06, 0.006, 0.7, 0, 0, 0.35, 0x5a4232); p.box(0.03, 0.007, 0.7, 0, 0, 0.35, 0x5a8fb4); });
/** La recette du frère, roulée sur le tonnelet */
const scrollGeo = () => geo('scroll', (p) => { p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6).rotateZ(Math.PI / 2), 0, 0.012, 0, 0xf2e8d0); p.box(0.006, 0.026, 0.004, 0.02, 0, 0, 0xc83a32); });
/** Manche de la torche de fortune (la flamme est à part : elle baisse et grandit) */
const handTorchGeo = () => geo('handtorch', (p) => { p.box(0.01, 0.08, 0.01, 0, 0, 0, 0x6a4a34); p.cyl(0.014, 0.01, 0.018, 6, 0, 0.065, 0, 0x4a3a2e); });

// ---------------- La chasse au mammouth ----------------
const FUR = 0x7a4a2a, FUR_DARK = 0x5a3620, IVORY = 0xefe4c8;
/** Un tronçon de cylindre de a à b, du rayon r0 au rayon r1 (pattes, trompe, queue, perches) */
function tube(p: Parts, a: number[], b: number[], r0: number, r1: number, c: number, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  p.add(g, a[0], a[1], a[2], c);
}
/**
 * Le mammouth, nez vers +z (0,6 de long, 0,5 au garrot) : torse massif à la fourrure brune, bosse sombre au garrot, frange de
 * longs poils sous le ventre, tête bombée, petites oreilles, défenses courbes, queue à touffe. Pattes et trompe à part : elles
 * bougent (voir `addMammoth`)
 */
const mammothGeo = () => geo('mammoth', (p) => {
  p.add(new THREE.IcosahedronGeometry(0.16, 1).scale(1, 0.9, 1.4), 0, 0.27, -0.02, FUR);
  p.add(new THREE.IcosahedronGeometry(0.13, 1).scale(1, 0.95, 1.1), 0, 0.36, 0.08, FUR_DARK);
  p.add(new THREE.IcosahedronGeometry(0.12, 1), 0, 0.27, -0.14, FUR);
  // la frange de longs poils, sur les flancs et sous le poitrail
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) p.add(new THREE.ConeGeometry(0.036, 0.12, 4).rotateX(Math.PI), s * (0.125 - Math.abs(i - 2) * 0.012), 0.15, -0.17 + i * 0.075, FUR_DARK);
  for (let i = 0; i < 3; i++) p.add(new THREE.ConeGeometry(0.034, 0.1, 4).rotateX(Math.PI), (i - 1) * 0.06, 0.15, 0.13, FUR_DARK);
  // la tête bombée, ses petites oreilles, ses yeux
  p.add(new THREE.IcosahedronGeometry(0.1, 1).scale(0.85, 1.1, 0.95), 0, 0.37, 0.24, FUR);
  p.add(new THREE.IcosahedronGeometry(0.065, 1), 0, 0.46, 0.21, FUR_DARK);
  for (const s of [-1, 1]) {
    p.add(new THREE.IcosahedronGeometry(0.035, 0).scale(0.45, 1, 1), s * 0.082, 0.39, 0.2, FUR_DARK);
    p.sphere(0.011, s * 0.052, 0.395, 0.312, 0x1a1410);
    // la défense : un arc d'ivoire qui part sous l'œil, descend en avant puis remonte, en s'écartant de l'autre
    p.add(new THREE.TorusGeometry(0.1, 0.013, 4, 9, Math.PI * 0.9).rotateZ(Math.PI).rotateY(-Math.PI / 2), s * 0.06, 0.3, 0.41, IVORY, s * 0.3);
  }
  tube(p, [0, 0.3, -0.24], [0, 0.18, -0.29], 0.014, 0.01, FUR_DARK);
  p.sphere(0.022, 0, 0.17, -0.295, FUR_DARK);
});
/** Une patte, de la hanche (à l'origine) au pied : un pilier, la cuisse laineuse */
const mammothLegGeo = () => geo('mammothleg', (p) => {
  tube(p, [0, 0, 0], [0, -0.22, 0], 0.048, 0.042, FUR, 7);
  tube(p, [0, 0.02, 0], [0, -0.1, 0], 0.062, 0.055, FUR_DARK, 7);
  p.cyl(0.048, 0.05, 0.024, 7, 0, -0.24, 0, 0x4a3a30);
});
/** La trompe, de sa racine (à l'origine) : elle pend, puis s'enroule vers l'avant au bout */
const mammothTrunkGeo = () => geo('mammothtrunk', (p) => {
  const pts = [[0, 0, 0], [0, -0.09, 0.015], [0, -0.17, 0.035], [0, -0.215, 0.075], [0, -0.205, 0.105]], r = [0.034, 0.028, 0.022, 0.017, 0.013];
  for (let i = 0; i < pts.length - 1; i++) tube(p, pts[i], pts[i + 1], r[i], r[i + 1], i % 2 ? FUR_DARK : FUR);
});
/** Fosse de chasse : le trou sombre, la terre rejetée autour */
const pitGeo = () => geo('pit', (p) => {
  p.cyl(0.25, 0.25, 0.006, 12, 0, 0, 0, 0x231a14);
  p.add(new THREE.TorusGeometry(0.28, 0.045, 4, 14).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0, 0.008, 0, 0x6a5038);
});
/** Les branchages qui couvrent la fosse, et leurs feuilles */
const pitCoverGeo = () => geo('pitcover', (p) => {
  for (let i = 0; i < 5; i++) p.box(0.022, 0.02, 0.5, -0.16 + i * 0.08, 0.012, 0, 0x6a4a34, 0.2 + i * 0.55);
  for (let i = 0; i < 9; i++) p.sphere(0.04, Math.cos(i * 2.4) * 0.15, 0.03, Math.sin(i * 2.4) * 0.15, i % 2 ? 0x5c8a45 : 0x6a9a50, 0, 0.45);
});
/** Le ravin : une fente sombre le long de +z (son entrée en z = -0,2, son fond en z = 0,6), entre deux rangées de blocs */
const ravineGeo = () => geo('ravine', (p) => {
  p.box(0.36, 0.006, 0.8, 0, 0, 0.2, 0x2a2420);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++)
    p.add(new THREE.DodecahedronGeometry(0.13 + (i % 2) * 0.04, 0).scale(1, 1.3 + (i % 3) * 0.25, 1), s * (0.3 + (i % 2) * 0.05), 0.1 + (i % 3) * 0.04, -0.12 + i * 0.22, [0x8d8a84, 0x7d7a74, 0x9a958c][i % 3]);
});
/**
 * Le traîneau de perches que les chasseurs ramènent (avant = +z, d'où on le tire) : deux perches qui traînent au sol derrière,
 * des traverses, et sa charge : des peaux de mammouth roulées, des ballots de viande dans le cuir
 */
export const sledGeo = () => geo('sled', (p) => {
  for (const s of [-1, 1]) tube(p, [s * 0.035, 0.15, 0.22], [s * 0.11, 0, -0.24], 0.011, 0.013, 0x7a5a3e, 5);
  // (les perches montent de l'arrière à l'avant : y = 0,15 × (z + 0,24) / 0,46, écartées de 0,11 à 0,035)
  for (const z of [-0.15, -0.03, 0.08]) { const k = (z + 0.24) / 0.46, x = 0.11 - 0.075 * k; p.box(x * 2 + 0.02, 0.014, 0.018, 0, 0.15 * k - 0.004, z, 0x6a4a34); }
  for (const [z, r, c] of [[-0.14, 0.05, FUR], [-0.05, 0.045, FUR_DARK], [0.03, 0.04, FUR]] as number[][]) {
    const y = 0.15 * ((z + 0.24) / 0.46) + r * 0.8;
    p.add(new THREE.CylinderGeometry(r, r, 0.2, 8).rotateZ(Math.PI / 2), 0, y, z, c);
    p.add(new THREE.TorusGeometry(r + 0.003, 0.005, 3, 8).rotateY(Math.PI / 2), 0.06, y, z, 0xc9b48a);
  }
  for (const [x, z] of [[-0.06, -0.19], [0.06, -0.2]]) p.add(new THREE.IcosahedronGeometry(0.04, 0).scale(1, 0.8, 1.2), x, 0.06 + 0.15 * ((z + 0.24) / 0.46), z, 0xa0704a);
});

/** Volute de brume : un disque blanc au bord flou (dessiné une fois) */
let puffTex: THREE.Texture | null = null;
function softPuff() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!, gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

const STAR = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: 0.95, depthWrite: false });
const GLOW = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
/** Lumières d'alerte et éclairs (ne s'éclairent pas : elles brillent) */
const RED = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
const GREEN = new THREE.MeshBasicMaterial({ color: 0x4aff7a });
const BOLT = new THREE.LineBasicMaterial({ color: 0xf8f8ff });
/** Gestes des habitants d'ailleurs (aventuriers KayKit, petits personnages de Kenney) */

/** Comment l'équipe se déplace selon le cœur de sa mission : autour des bêtes, de point de travail en point de travail… */
const BEHAVIOR: Record<Scene, string> = {
  herd: 'herd', corral: 'herd', salt: 'herd', roundup: 'herd', boat: 'boat', dive: 'boat', fish: 'fish',
  mine: 'mine', pass: 'mine', crater: 'mine', gather: 'gather', pebbles: 'gather', hops: 'gather', hunt: 'hunt',
  build: 'build', bridge: 'build', drill: 'build', summit: 'build', basecamp: 'build', rails: 'rails', camp: 'camp',
  smoke: 'tend', swarm: 'tend', trade: 'trade', spring: 'spring', gallery: 'delve', cave: 'delve', scout: 'delve', troupe: 'watch', abbey: 'watch', stars: 'watch',
  race: 'tend', balloon: 'tend', launch: 'watch', moon: 'watch', colony: 'watch', mammoth: 'mammoth',
};
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const LINE = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.8 });
const ROPE = new THREE.LineBasicMaterial({ color: 0x6a5a48 });
/**
 * Le premier envol, selon l'avancement du travail : gonflée au sol jusqu'à B_FULL, les aéronautes s'approchent (B_BOARD) et
 * montent (B_IN), elle décolle (B_LIFT), revient se poser (B_LAND), ils en descendent (B_OUT)
 */
const B_FULL = 0.3, B_BOARD = 0.3, B_IN = 0.35, B_LIFT = 0.4, B_LAND = 0.86, B_OUT = 0.92;
/** La course : le pilote va à la portière (R_DOOR), s'installe (R_SEAT), la voiture part (R_GO), revient sur la ligne (R_END) */
const R_DOOR = 0.22, R_SEAT = 0.27, R_GO = 0.3, R_END = 0.92, R_OUT = 0.95;
const RING = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
/**
 * Le lancement, selon l'avancement du travail : les astronautes (ou les colons) gagnent la fusée (L_BOARD) et y montent
 * (L_IN), allumage (L_FIRE), la fusée quitte le pas de tir (L_LIFT) et sort du ciel (L_GONE). L'alunissage se suit ensuite en
 * direct (voir `SpaceCast`)
 */
export const L_BOARD = 0.16, L_IN = 0.26, L_FIRE = 0.3, L_LIFT = 0.35, L_GONE = 0.6;
/** Lueur des moteurs sur le pas de tir */
const GLARE = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
/**
 * La fusée d'une expédition spatiale : son corps (tourné comme le cosmodrome) dans un pivot qui l'incline en virage, ses
 * flammes, la lueur au sol, le pas de tir, son équipage (qui gagne la fusée puis y monte), le cap de son virage, sa fumée
 */
/** Où se dresse la fusée sur le pas de tir de ce cosmodrome (le modèle tourne avec le bâtiment) : x, y, z et cap */
export function padSpot(w: World, pad: Building): [number, number, number, number] {
  const s = sizeOf(pad), t = (pad.rot * Math.PI) / 2, c = Math.cos(t), sn = Math.sin(t), [lx, ly, lz] = SPACEPAD, hs: number[] = [];
  // le bâtiment se pose à la hauteur médiane des coins de son emprise
  for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) hs.push(w.h(pad.x + i, pad.z + j));
  hs.sort((p, q) => p - q);
  const base = hs.length % 2 ? hs[hs.length >> 1] : (hs[(hs.length >> 1) - 1] + hs[hs.length >> 1]) / 2;
  return [pad.x + s / 2 + lx * c + lz * sn, base + ly, pad.z + s / 2 - lx * sn + lz * c, t];
}

/** La fusée, son corps et ses lumières, prête à poser */
function rocketMesh(kind: RocketKind) {
  const inner = new THREE.Group(), g = rocketGeo(kind), body = new THREE.Mesh(g.body, mats.body);
  body.castShadow = true;
  inner.add(body);
  if (g.glow) inner.add(new THREE.Mesh(g.glow, mats.glow));
  return inner;
}

/**
 * Entre deux expéditions, la fusée de la prochaine mission spatiale attend sur le pas de tir de chaque cosmodrome : la
 * fusée-sonde, puis la fusée lunaire, puis le vaisseau colonial (le pas de tir reste vide une fois la colonie fondée). Une
 * scène de lancement la remplace le temps de l'expédition
 */
export class IdleRockets {
  private shown = new Map<number, { obj: THREE.Group; kind: RocketKind }>();
  constructor(private world: World, private group: THREE.Group) {}

  update(launching: boolean) {
    const w = this.world, done = w.exp.done, live = new Set<number>();
    const kind: RocketKind | null = launching ? null : !done.includes('rocket') ? 'probe' : !done.includes('moon') ? 'moon' : !done.includes('colony') ? 'colony' : null;
    if (kind) for (const b of w.buildings.values()) {
      if (b.kind !== 'spaceport') continue;
      live.add(b.id);
      let r = this.shown.get(b.id);
      if (r && r.kind !== kind) { this.group.remove(r.obj); r = undefined; }
      if (!r) { r = { obj: rocketMesh(kind), kind }; this.group.add(r.obj); this.shown.set(b.id, r); }
      const [x, y, z, ry] = padSpot(w, b);
      r.obj.position.set(x, y, z);
      r.obj.rotation.y = ry;
    }
    for (const [id, r] of this.shown) if (!live.has(id)) { this.group.remove(r.obj); this.shown.delete(id); }
  }
}

interface RocketShow {
  obj: THREE.Group; flame: THREE.Group; glare: THREE.Mesh; kind: RocketKind; x: number; z: number; y0: number; dir: number;
  crew: { n: { folk: Folk; pose: FolkPose; off: number }; from: [number, number] }[]; vapor: { every: number } | null; puff: number; trail: number;
}

/**
 * Bête de la scène ; `flee` : elle s'enfuit dans cette direction (la harde dispersée) ; `held` : un imprévu la mène (la bête
 * qui charge) ; `kind` : l'espèce d'une bête de la harde (celles qu'on ramène quittent la scène pour suivre l'équipe)
 */
interface Beast { obj: THREE.Object3D; actor: Actor | null; x: number; z: number; tx: number; tz: number; heading: number; wait: number; speed: number; flee?: number; fled?: number; held?: boolean; kind?: HerdKind | 'wolf' }
/**
 * Un mammouth de la scène : la bête (son groupe tourne et avance), ses pattes et sa trompe, sa taille, la cadence de son pas,
 * sa vitesse lissée, et ce qu'il fait : il barrit (trompe levée, 0 … 1), se couche (0 … 1), s'enfonce dans la fosse
 */
interface Mammoth { b: Beast; legs: THREE.Object3D[]; trunk: THREE.Object3D; size: number; ph: number; px: number; pz: number; v: number; trumpet: number; lie: number; sink: number }
/** Le décor s'efface en ce temps-là (secondes), une fois l'équipe repartie */
const FADE = 1.2;
interface Rod { rod: THREE.Mesh; bob: THREE.Mesh; line: THREE.Line }
interface Fx { obj: THREE.Object3D; t: number; life: number; kind: 'puff' | 'fish' | 'ring' | 'steam' | 'smoke' | 'bubble' | 'star' | 'plume' | 'trail' | 'rock' | 'gas' | 'leaf'; x: number; y: number; z: number; vx: number; vz: number; vy?: number }

/**
 * Un imprévu joué sur la scène : ce qu'on voit pendant que l'équipe attend la décision, puis la suite de l'option choisie
 * (le grand feu, la corde, la décrue…). `step` le fait vivre à chaque image et dit s'il dure encore ; à la fin, ses objets
 * rétrécissent et s'effacent
 */
interface Staging {
  id: string;
  /** option choisie (-1 : la décision se fait attendre) */
  pick: number;
  /** secondes depuis qu'il a surgi, depuis la décision, depuis qu'il s'efface (-1 : pas encore) */
  t: number;
  after: number;
  end: number;
  objs: THREE.Object3D[];
  step: (dt: number) => boolean;
  /** au départ de l'équipe : ce qui doit disparaître (le voyageur ramené au village, qui la suit désormais) */
  leave?: () => void;
  /** matériaux et géométries propres à l'imprévu, libérés à la fin */
  own: { dispose(): void }[];
}

/**
 * Ce que fait une équipe sur place, joué sur la carte, et pourquoi elle est venue : elle approche une harde ou la rabat dans
 * un enclos, attend les aurochs à la pierre à sel, part en barque ou plonge sur le récif, pioche un éboulis, cueille baies,
 * houblon ou galets, enfume le vieux chêne ou recueille un essaim, troque ses poteries chez les voisins, se baigne dans la
 * source chaude, entre et sort de la galerie avec le wagonnet, applaudit les jongleurs, écoute le frère brasseur, regarde
 * les étoiles filantes, dégage la météorite, jette un pont, carotte la roche, plante le drapeau au sommet, chasse le mammouth…
 */
export class ExpeditionScene {
  private props: THREE.Object3D[] = [];
  private beasts: Beast[] = [];
  /** la chasse : les chiens de la meute, ce que fait le loup, quand chaque chasseur lancera sa prochaine lance */
  private dogs: Beast[] = [];
  private hunt = { mode: 'prowl' as 'prowl' | 'charge' | 'bite' | 'back' | 'flee' | 'stand', t: 3, target: 0, ang: 0.5, flinch: 0 };
  private spearT = new Map<number, number>();
  private fx: Fx[] = [];
  private rods = new Map<number, Rod>();
  /** points de travail (buissons, éboulis, piquets…) et ce que chaque membre y fait */
  private spots: [number, number][] = [];
  private next = new Map<number, number>();
  private goal = new Map<number, number>();
  private flame: THREE.Mesh | null = null;
  private boat: { obj: THREE.Object3D; home: [number, number]; out: [number, number]; y: number; riders: number[] } | null = null;
  /** l'eau près de la destination : un point mouillé et un point de berge, et le niveau de l'eau */
  private water: { wet: [number, number]; bank: [number, number]; level: number } | null = null;
  private built: THREE.Object3D[] = [];
  private basket: THREE.Mesh | null = null;
  private t = 0;
  private fxTimer = 0;
  readonly kind: string;
  /** le cœur de la mission (troc, source chaude, abbaye…) ; `kind` dit seulement comment l'équipe s'y déplace */
  readonly story: Scene;
  /** habitants d'ailleurs, pièces qui tournent, objets qui grandissent avec le travail, vapeur, fumée, étoiles */
  private npcs: { folk: Folk; pose: FolkPose; off: number }[] = [];
  private spins: { obj: THREE.Object3D; speed: number }[] = [];
  private grows: { obj: THREE.Object3D; from: number; to: number }[] = [];
  private emits: { x: number; y: number; z: number; kind: 'steam' | 'smoke' | 'puff' | 'bubble' | 'star'; every: number; t: number }[] = [];
  private jugglers: { x: number; y: number; z: number; face: number; balls: THREE.Mesh[] }[] = [];
  /** ce que regarde l'équipe (jongleurs, moine, ciel) ; places dans la source ; entrée de la galerie et tas de minerai */
  /** le cœur de l'action (l'enclos, la barque, la montgolfière…), que la caméra regarde quand on suit l'équipe */
  focus: [number, number] = [0, 0];
  /** sa hauteur au-dessus du sol (la montgolfière en vol), pour que la vue la garde dans le cadre */
  lift = 0;
  private bath: { at: [number, number][]; y: number; in: Set<number> } | null = null;
  private mouth: { at: [number, number]; heap: [number, number] } | null = null;
  private delve = new Map<number, { phase: 'go' | 'in' | 'out' | 'heap'; t: number }>();
  private cartRun: { obj: THREE.Object3D; a: [number, number]; b: [number, number] } | null = null;
  private salts: [number, number][] = [];
  private corral: [number, number] | null = null;
  /** le tracé du chemin de fer : son départ et son cap, les jalons du géomètre, le train de chantier qui suit la tête de voie */
  private works: { x: number; z: number; dir: number; stakes: THREE.Object3D[]; train: THREE.Object3D; puff: number } | null = null;
  /** la montgolfière (nacelle, enveloppe, brûleur), d'où elle part, ses aéronautes, les cordes que tient l'équipe, son vol */
  private balloon: {
    obj: THREE.Group; env: THREE.Object3D; burner: THREE.Object3D; home: [number, number]; y0: number; riders: number[];
    stakes: [number, number][]; ropes: THREE.Line[]; drift: number; high: number; far: number;
  } | null = null;
  /** la voiture de course, sa ligne de départ, l'arche, son circuit (côté s, demi-axes rx, rz), ses tours, son pilote */
  private race: { obj: THREE.Object3D; x: number; z: number; ax: number; s: number; rx: number; rz: number; laps: number; driver: number | null; puff: number } | null = null;
  /** où en est chaque membre de l'envol ou de la course (aux cordes, à la nacelle, au bord de la piste…) */
  private stage = new Map<number, string>();
  /** la fusée de l'expédition spatiale, sur son pas de tir puis dans le ciel */
  private rocket: RocketShow | null = null;
  /** imprévus joués sur place (pendant la décision, puis la suite de l'option choisie), et l'échec joué au départ */
  private stagings: Staging[] = [];
  private failed = false;
  /** on explore une grotte : chacun tient une torche de fortune ; leur éclat (1 : normal), et celui vers lequel il va */
  private lit = false;
  private torches = new Map<number, THREE.Object3D>();
  private torchK = 0;
  private torchTo = 1;
  private kindled = false;
  /** la roulotte des jongleurs ; la barque qui tangue plus fort (rapides), la montgolfière secouée (rafale), le ciel couvert */
  private wagon: THREE.Object3D | null = null;
  private rough = 0;
  private gustK = 0;
  private cloudy = false;
  /** les jongleurs et leur tambour, qui suivent l'équipe au village quand elle les ramène ; le frère brasseur */
  private guests: { folk: Folk; pose: FolkPose; off: number }[] = [];
  private monk: { folk: Folk; pose: FolkPose; off: number } | null = null;
  /**
   * La chasse au mammouth : la harde (le vieux mâle d'abord), où elle paît et de quel côté du camp, la façon de chasser
   * (fosses, ravin, ou la harde suivie de loin), le piège et son axe (de la harde vers lui), les fosses et leurs branchages,
   * l'avancement le plus loin atteint, le temps depuis le départ de l'équipe
   */
  private mammoths: Mammoth[] = [];
  private mam: {
    old: Mammoth; at: [number, number]; dir: number; way: 'pits' | 'ravine' | 'follow'; trap: [number, number]; axis: [number, number];
    pits: THREE.Object3D[]; covers: THREE.Object3D[]; k: number; back: number;
  } | null = null;
  /** l'équipe est repartie (une fois) : l'échec se joue, ce qui la suit quitte la scène */
  private departed = false;
  /** l'équipe est repartie : le décor rétrécit et s'efface (secondes depuis, -1 : pas encore) */
  private fade = -1;
  private fadeObjs: { o: THREE.Object3D; y: number }[] = [];
  /** une fusée est sur le pas de tir ou dans le ciel : celle qui attendait au cosmodrome s'efface */
  get launching() { return !!this.rocket; }

  constructor(private world: World, private agents: Agents, private group: THREE.Group, a: ActiveExpedition, private combat: CombatFx | null = null) {
    const [cx, cz] = a.dest;
    this.story = a.c.scene;
    let kind = BEHAVIOR[this.story] ?? 'camp';
    if (kind === 'boat' || kind === 'fish' || this.story === 'bridge') { this.water = this.findWater(cx, cz); if (!this.water && kind !== 'build') kind = 'camp'; }
    this.kind = kind;
    this.focus = [cx, cz];
    if (kind === 'camp' || kind === 'hunt') this.camp(cx, cz);
    if (kind === 'herd') {
      // la harde sauvage compte plus de bêtes que celles qu'on ramènera
      const kinds = a.c.win.flatMap((e) => (e.t === 'herd' ? e.kinds : []));
      const base = kinds.length ? kinds : ['sheep' as HerdKind];
      for (let i = 0; i < Math.min(6, Math.max(4, base.length + 2)); i++) this.addBeast(base[i % base.length], cx, cz, 0.7 + (i % 3) * 0.35, i * 1.3);
    } else if (kind === 'hunt') {
      this.addBeast('wolf', cx, cz, 2.4, 0.5);
      // les chiens de la meute, qui arrivent avec les chasseurs
      for (let i = 0; i < 2; i++) {
        const actor = hasModel('dog') ? makeActor('dog', 0.2) : null;
        if (!actor) break;
        actor.root.visible = false;
        this.group.add(actor.root);
        this.dogs.push({ obj: actor.root, actor, x: cx + (i ? 0.2 : -0.2), z: cz, tx: cx, tz: cz, heading: 0, wait: 0, speed: 1.7 });
      }
    }
    else if (kind === 'boat') this.launch(a);
    else if (kind === 'fish') this.spots = this.bankSpots(a.party.length);
    else if (kind === 'mine') {
      const [ux, uz] = this.uphill(cx, cz), [rx, rz] = this.near(cx + ux * 0.56, cz + uz * 0.56, cx, cz);
      this.put(this.story === 'pass' ? copperGeo() : this.story === 'crater' ? meteorGeo() : rocksGeo(), rx, rz, 0);
      if (this.story === 'pass') { const [qx, qz] = this.near(cx - 0.5, cz - 0.45, cx, cz); this.put(cairnGeo(), qx, qz, 0); }
      // le silex : un pan de falaise derrière le tas, face à l'équipe, même là où la pente est douce
      if (a.m.id === 'flint') { const [fx, fz] = this.near(cx + ux * 0.95, cz + uz * 0.95, cx, cz); this.put(cliffGeo(), fx, fz, Math.atan2(-ux, -uz)); }
      if (this.story === 'crater') {
        // le cratère encore fumant, la pierre tombée du ciel qui rougeoie
        this.put(craterGeo(), rx, rz, 0);
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), GLOW);
        core.position.set(rx + 0.03, this.world.surfaceAt(rx, rz) + 0.1, rz + 0.04);
        this.group.add(core); this.props.push(core);
        this.emits.push({ x: rx, y: this.world.surfaceAt(rx, rz) + 0.12, z: rz, kind: 'smoke', every: 0.5, t: 0 });
      }
      const [kx, kz] = this.near(cx - ux * 0.3 - uz * 0.45, cz - uz * 0.3 + ux * 0.45, cx, cz);
      this.put(cartGeo(), kx, kz, 0.6);
      for (let i = 0; i < 4; i++) { const ang = i * 1.57 + 0.6; this.spots.push([rx + Math.cos(ang) * 0.26, rz + Math.sin(ang) * 0.26]); }
    } else if (kind === 'gather') {
      // les buissons de baies poussent en lisière : dans la clairière la plus proche, où l'on voit les cueilleurs
      const w = this.world, open = (x: number, z: number) => this.free(x, z) && w.veg[w.ci(Math.floor(x), Math.floor(z))] !== VEG_FOREST;
      let gx = cx, gz = cz;
      for (let r = 0.5; r <= 2.5 && !open(gx, gz); r += 0.5)
        for (let k = 0; k < 8; k++) { const x = cx + Math.cos(k * 0.785) * r, z = cz + Math.sin(k * 0.785) * r; if (open(x, z)) { gx = x; gz = z; break; } }
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.256 + 0.3, r = 0.55 + (i % 2) * 0.3;
        const [bx, bz] = this.near(gx + Math.cos(ang) * r, gz + Math.sin(ang) * r, gx, gz);
        if (!this.free(bx, bz)) continue;
        this.put(this.story === 'hops' ? hopGeo() : this.story === 'pebbles' ? pebblesGeo() : bushGeo(), bx, bz, ang);
        this.spots.push([bx - Math.cos(ang) * 0.2, bz - Math.sin(ang) * 0.2]);
      }
      this.put(basketGeo(), gx, gz, 0);
      this.basket = this.put(this.story === 'hops' ? hopConesGeo() : this.story === 'pebbles' ? flintsGeo() : berriesGeo(), gx, gz, 0);
      this.basket.scale.setScalar(0.001);
    }
    if (this.story === 'build' || this.story === 'corral') {
      // enclos : des piquets en cercle (pierres sèches à partir du Moyen Âge ; branchages où l'on rabat les bêtes), plantés au fil du travail
      const stone = this.story === 'build' && a.m.age >= 2, n = 12;
      // dans la clairière la plus proche, pas sous les arbres : là où l'on voit l'enclos sortir de terre
      const [ox, oz] = this.clearing(cx, cz, 0.95);
      this.focus = [ox, oz];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2, x = ox + Math.cos(ang) * 0.95, z = oz + Math.sin(ang) * 0.95;
        if (!this.free(x, z)) continue;
        // un piquet et les deux traverses qui le relient au précédent
        const o = new THREE.Group();
        o.position.set(x, this.world.surfaceAt(x, z), z);
        const post = new THREE.Mesh(stone ? stoneGeo() : postGeo(), mats.body);
        post.rotation.y = -ang;
        post.castShadow = true;
        o.add(post);
        if (!stone && i > 0) {
          const pa = ((i - 1) / n) * Math.PI * 2, px = ox + Math.cos(pa) * 0.95, pz = oz + Math.sin(pa) * 0.95;
          for (const y of [0.06, 0.12]) {
            const r = new THREE.Mesh(railGeo(), mats.body);
            r.position.y = y;
            r.scale.z = Math.hypot(px - x, pz - z);
            r.rotation.y = Math.atan2(x - px, z - pz);
            o.add(r);
          }
        }
        this.group.add(o);
        this.props.push(o);
        o.visible = false;
        this.built.push(o);
        this.spots.push([ox + Math.cos(ang) * 0.7, oz + Math.sin(ang) * 0.7]);
      }
    } else if (kind === 'rails') {
      // voie ferrée : des tronçons posés l'un après l'autre, dans la direction la plus dégagée
      let best = 0, bestN = -1;
      for (let d = 0; d < 8; d++) {
        const ang = (d / 8) * Math.PI * 2;
        let n = 0;
        while (n < 10 && this.free(cx + Math.sin(ang) * 0.3 * (n + 1), cz + Math.cos(ang) * 0.3 * (n + 1))) n++;
        if (n > bestN) { bestN = n; best = ang; }
      }
      // le tracé : les jalons du géomètre balisent la voie devant les poseurs ; au bout, l'arpenteur à son théodolite ; au
      // départ, les rails et les traverses en réserve ; le train de chantier suit la tête de voie, sa plate-forme chargée
      const n = Math.max(4, bestN), sx = Math.sin(best), sz = Math.cos(best), px = Math.cos(best), pz = -Math.sin(best);
      const stakes: THREE.Object3D[] = [];
      for (let i = 0; i < n; i++) {
        const x = cx + sx * 0.3 * i, z = cz + sz * 0.3 * i;
        const o = this.put(laidGeo(), x, z, best);
        o.visible = false;
        this.built.push(o);
        this.spots.push([x + px * 0.2, z + pz * 0.2]);
        stakes.push(this.put(stakeFlagGeo(), x + sx * 0.15 + px * 0.16, z + sz * 0.15 + pz * 0.16, best + Math.PI / 2));
      }
      const [ex, ez] = this.near(cx + sx * 0.3 * n + px * 0.25, cz + sz * 0.3 * n + pz * 0.25, cx, cz);
      this.put(telescopeGeo(), ex, ez, best + Math.PI);
      this.npc('scholar', a.m.age, ex + px * 0.12, ez + pz * 0.12, best + Math.PI, 'talk');
      this.put(railStockGeo(), cx - sx * 0.3 - px * 0.3, cz - sz * 0.3 - pz * 0.3, best);
      const train = new THREE.Group(), loco = new THREE.Mesh(locoGeo(a.m.age, 0x3a6ab8).body, mats.body), car = new THREE.Mesh(flatcarGeo(), mats.body);
      loco.castShadow = car.castShadow = true;
      car.position.z = 0.36;
      train.add(loco, car);
      train.rotation.y = best;
      this.group.add(train); this.props.push(train);
      this.works = { x: cx, z: cz, dir: best, stakes, train, puff: 0 };
    }
    this.heart(a, cx, cz);
  }

  // ---------------- Le cœur de la mission ----------------
  /** Ce pour quoi l'équipe est venue : on le pose sur place */
  private heart(a: ActiveExpedition, cx: number, cz: number) {
    const w = this.world, age = a.m.age, st = this.story, y = (x: number, z: number) => w.surfaceAt(x, z);
    if (st === 'launch' || st === 'moon' || st === 'colony') this.launchpad(a, cx, cz);
    else if (st === 'mammoth') this.mammothHunt(a, cx, cz);
    else if (st === 'salt') {
      // pierres à sel au bord de l'eau ; l'équipe guette, cachée derrière les buissons
      for (let i = 0; i < 3; i++) { const [x, z] = this.near(cx + Math.cos(i * 2.1) * 0.35, cz + Math.sin(i * 2.1) * 0.35, cx, cz); this.put(saltGeo(), x, z, i); this.salts.push([x, z]); }
      for (const s of [-1, 1]) { const [x, z] = this.near(cx - 0.85, cz + s * 0.35, cx, cz); this.put(bushGeo(), x, z, s); this.spots.push([x - 0.18, z]); }
    } else if (st === 'roundup') {
      const [x, z] = this.near(cx + 0.9, cz - 0.2, cx, cz);
      this.put(corralGeo(), x, z, 0);
      this.corral = [x, z];
      for (const b of this.beasts) b.speed = 0.34;
    } else if (st === 'smoke' || st === 'swarm') {
      // le vieux chêne enfumé ou l'arbre où l'essaim s'est posé, en lisière (pas caché sous la forêt) ; les abeilles tournent autour
      const [ox, oz] = this.clearing(cx, cz, 0.6), [tx, tz] = this.near(ox + 0.35, oz - 0.3, ox, oz), ty = y(tx, tz);
      this.put(st === 'smoke' ? oakGeo() : sproutTreeGeo(), tx, tz, 0);
      const hive = st === 'smoke' ? [tx, ty + 0.22, tz + 0.1] : [tx + 0.16, ty + 0.2, tz];
      this.bees(hive[0], hive[1], hive[2]);
      if (st === 'smoke') {
        this.fireAt(tx, tz + 0.28);
        this.emits.push({ x: tx, y: ty + 0.06, z: tz + 0.28, kind: 'smoke', every: 0.28, t: 0 });
        const [hx, hz] = this.near(ox - 0.35, oz + 0.3, ox, oz);
        this.grows.push({ obj: this.put(logHiveGeo(), hx, hz, 0), from: 0.001, to: 1 });
      } else {
        // la grappe d'abeilles se vide dans le panier de paille posé dessous
        const c = new THREE.Mesh(clusterGeo(), mats.body);
        c.position.set(hive[0], hive[1], hive[2]);
        this.group.add(c); this.props.push(c);
        this.grows.push({ obj: c, from: 1, to: 0.25 });
        this.put(skepGeo(), tx + 0.16, tz + 0.05, 0);
      }
      for (let i = 0; i < 4; i++) { const ang = i * 1.57 + 0.4; this.spots.push(this.near(tx + Math.cos(ang) * 0.32, tz + Math.sin(ang) * 0.32, ox, oz)); }
      this.focus = [tx, tz];
    } else if (st === 'trade') {
      // chez les voisins (ou les mineurs nomades) : une natte, nos marchandises qui partent, les leurs qui arrivent au chariot
      const nomads = a.m.id === 'mine';
      this.put(blanketGeo(), cx, cz, 0);
      this.grows.push({ obj: this.put(nomads ? foodGeo() : potsGeo(), cx - 0.08, cz, 0), from: 1, to: 0.15 });
      const [kx, kz] = this.near(cx - 0.6, cz - 0.15, cx, cz);
      this.put(cartGeo(), kx, kz, 0.4);
      this.grows.push({ obj: this.put(nomads ? rocksGeo() : sacksGeo(), kx + 0.05, kz + 0.25, 0), from: 0.001, to: 1 });
      for (const [dx, dz] of [[0.78, -0.4], [0.72, 0.42]]) { const [hx, hz] = this.near(cx + dx, cz + dz, cx, cz); this.put(nomads ? yurtGeo() : hutGeo(), hx, hz, Math.atan2(cx - hx, cz - hz)); }
      const people: FolkRole[] = nomads ? ['nomad', 'drummer'] : ['villager', 'villager'];
      people.forEach((m, i) => this.npc(m, age, cx + 0.28, cz + (i ? 0.14 : -0.12), -Math.PI / 2, 'talk'));
      this.spots.push([cx - 0.24, cz - 0.08], [cx - 0.24, cz + 0.1], [kx + 0.15, kz + 0.12]);
      this.focus = [cx + 0.28, cz];
    } else if (st === 'spring') {
      // la source chaude : bassin fumant cerclé de pierres (de roseaux au bord de la rivière) ; on s'y baigne à tour de rôle
      const [px, pz] = this.near(cx, cz, cx, cz), py = y(px, pz);
      this.put(poolGeo(a.c.dest === 'river'), px, pz, 0);
      this.emits.push({ x: px, y: py + 0.05, z: pz, kind: 'steam', every: 0.18, t: 0 });
      this.bath = { at: [[px - 0.11, pz + 0.04], [px + 0.12, pz - 0.05]], y: py + 0.024 - 0.07, in: new Set() };
      for (let i = 0; i < 6; i++) { const ang = i * 1.05 + 0.3; this.spots.push([px + Math.cos(ang) * 0.5, pz + Math.sin(ang) * 0.5]); }
      this.focus = [px, pz];
    } else if (st === 'gallery' || st === 'cave' || st === 'scout') {
      // l'entrée : dans la pente pour une galerie ou un tunnel ; la bouche de la grotte voisine, sinon une entrée de grotte au
      // bord de la faille ou au pied de la paroi ; tas de minerai et wagonnet. Torches plantées de part et d'autre de la bouche
      let mx = cx, mz = cz, real = false, fissure = false;
      const e = st === 'gallery' ? -1 : w.outpostEntrance(Math.floor(cx), Math.floor(cz), 1);
      if (e >= 0 && w.veg[e] === VEG_CAVE) {
        // la bouche de la grotte, du côté de l'équipe
        const x = e % N, z = Math.floor(e / N), ang = Math.atan2(cx - x - 0.5, cz - z - 0.5);
        mx = x + 0.5 + Math.sin(ang) * 0.6; mz = z + 0.5 + Math.cos(ang) * 0.6; real = true;
      } else if (e >= 0) {
        // au bord de la faille la plus proche, entre elle et l'équipe : l'entrée de la grotte qui y descend
        let bd = Infinity, fx = cx, fz = cz;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz, d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (w.inCells(x, z) && w.decor[w.ci(x, z)] && d < bd) { bd = d; fx = x + 0.5; fz = z + 0.5; fissure = true; }
        }
        [mx, mz] = this.near(fx + (cx - fx) * 0.45, fz + (cz - fz) * 0.45, cx, cz);
      }
      if (!real && !fissure) {
        let best = 0, gain = -1e9;
        for (let d = 0; d < 8; d++) { const ang = (d / 8) * Math.PI * 2, g = y(cx + Math.sin(ang) * 0.8, cz + Math.cos(ang) * 0.8) - y(cx, cz); if (g > gain) { gain = g; best = ang; } }
        [mx, mz] = this.near(cx + Math.sin(best) * 0.6, cz + Math.cos(best) * 0.6, cx, cz);
      }
      // l'entrée qu'on bâtit (au bord de la faille, au pied de la paroi) : dans la clairière la plus proche, pas cachée sous les arbres
      if (st !== 'gallery' && !real) { const [qx, qz] = this.clearing(mx, mz, 0.8); if (Math.hypot(qx - cx, qz - cz) > 0.5) [mx, mz] = [qx, qz]; }
      // (l'entrée bâtie : la bouche s'ouvre à 0,22 devant la butte ; les torches se plantent devant ses rochers)
      const face = Math.atan2(cx - mx, cz - mz), built = st !== 'gallery' && !real, lip = built ? 0.22 : 0.12, ahead = built ? 0.42 : 0.07, side = built ? 0.36 : 0.2;
      if (st === 'gallery') this.put(galleryGeo(a.m.id === 'railway'), mx, mz, face);
      else if (built) this.put(caveMouthGeo(), mx, mz, face).scale.setScalar(1.6);
      if (st !== 'gallery') for (const s of [-1, 1]) { const tx = mx + Math.sin(face) * ahead + Math.cos(face) * s * side, tz = mz + Math.cos(face) * ahead - Math.sin(face) * s * side; this.put(stakeTorchGeo(), tx, tz, 0); this.flameAt(tx, y(tx, tz) + 0.26, tz, 0.6); }
      const found = st !== 'gallery';
      const hx = cx - Math.sin(face) * 0.3, hz = cz - Math.cos(face) * 0.3;
      if (st === 'scout') {
        // les éclaireurs reviennent reporter leurs relevés sur la table aux plans, et jalonnent devant la grotte l'emprise de
        // l'avant-poste : des piquets à fanion qui sortent de terre au fil du travail
        this.put(mapTableGeo(), hx, hz, face + Math.PI / 2);
        const ox = cx + Math.sin(face) * 0.35, oz = cz + Math.cos(face) * 0.35;
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = ox + Math.sin(face) * u * 0.42 + Math.cos(face) * v * 0.42, z = oz + Math.cos(face) * u * 0.42 - Math.sin(face) * v * 0.42;
          this.grows.push({ obj: this.put(stakeFlagGeo(), x, z, face), from: 0.001, to: 1 });
        }
      } else this.grows.push({ obj: this.put(rocksGeo(), hx, hz, 0), from: 0.25, to: 1.1 });
      if (!found) {
        for (let i = 0; i < 3; i++) { const t = 0.15 + i * 0.3, x = mx + (cx - mx) * t, z = mz + (cz - mz) * t; this.put(trackGeo(), x, z, face + Math.PI); }
        this.cartRun = { obj: this.put(cartGeo(), mx, mz, face), a: [mx + Math.sin(face) * 0.12, mz + Math.cos(face) * 0.12], b: [hx + Math.sin(face) * 0.1, hz + Math.cos(face) * 0.1] };
      }
      if (st !== 'scout') this.emits.push({ x: hx, y: y(hx, hz) + 0.1, z: hz, kind: 'puff', every: 0.7, t: 0 });
      this.mouth = { at: [mx + Math.sin(face) * lip, mz + Math.cos(face) * lip], heap: [hx, hz] };
      this.focus = [(mx + hx) / 2, (mz + hz) / 2];
      // on explore la grotte à la lueur des torches : chacun a la sienne
      this.lit = st !== 'gallery';
    } else if (st === 'race') {
      // la ligne de départ de la course : arche à damier, la voiture sans chevaux qui pétarade, bidon d'essence ; l'équipe la
      // prépare tout autour, l'ingénieur donne ses consignes ; puis le pilote s'installe au volant et la voiture file faire ses
      // tours de circuit (un de plus si l'on pousse la machine à fond), repasse sous l'arche et revient sur la ligne
      const [ax, az] = this.near(cx + 0.55, cz, cx, cz);
      this.put(raceArchGeo(), ax, az, Math.PI / 2);
      const [vx, vz] = this.near(cx + 0.12, cz, cx, cz);
      const car = this.put(oldCarGeo(), vx, vz, Math.PI / 2);
      // le circuit : une boucle qui part de la ligne vers l'arche, du côté le plus dégagé, aussi grande que le terrain le permet
      let best = { s: 1, rx: 1, rz: 0.7, n: -1 };
      for (const s of [1, -1]) for (const rx of [1.7, 1.3, 1]) for (const rz of [1.2, 0.9, 0.7]) {
        let n = (rx + rz) * 0.1;
        for (let j = 0; j < 24; j++) { const th = (j / 24) * Math.PI * 2; if (this.free(vx + rx * Math.sin(th), vz + s * rz * (1 - Math.cos(th)))) n++; }
        if (n > best.n) best = { s, rx, rz, n };
      }
      this.race = { obj: car, x: vx, z: vz, ax, s: best.s, rx: best.rx, rz: best.rz, laps: a.c.risk > 0.3 ? 3 : 2, driver: a.party[0] ?? null, puff: 0 };
      this.put(fuelCanGeo(), vx - 0.04, vz - best.s * 0.2, 0.3);
      for (const [dx, dz] of [[-0.04, -0.2], [-0.24, 0.04], [0.02, 0.22], [0.2, -0.18]]) this.spots.push([vx + dx, vz + dz]);
      this.npc('scholar', age, vx - 0.32, vz - best.s * 0.2, 0.6, 'talk');
      this.focus = [vx, vz];
    } else if (st === 'balloon') {
      // la montgolfière : on la gonfle au sol (le brûleur rugit, l'enveloppe s'arrondit, l'équipe tient les cordes), deux
      // aéronautes montent dans la nacelle, elle s'élève, dérive au-dessus de la campagne (plus haut et plus loin dans les
      // vents de la montagne) et revient se poser près de l'équipe, qui l'a suivie des yeux
      const [bx, bz] = this.near(cx + 0.6, cz - 0.2, cx, cz), S = 1.6;
      const obj = new THREE.Group(), basket = new THREE.Mesh(BALLOON_BASKET(), mats.body), env = new THREE.Mesh(BALLOON_ENV(), mats.body), burner = new THREE.Group();
      basket.castShadow = env.castShadow = true;
      env.position.y = 0.18; burner.position.y = 0.19;
      const f = this.flameAt(0, 0, 0, 0.5);
      this.group.remove(f); burner.add(f);
      obj.add(basket, env, burner);
      obj.position.set(bx, y(bx, bz), bz); obj.scale.setScalar(S);
      this.group.add(obj); this.props.push(obj);
      const stakes: [number, number][] = [], ropes: THREE.Line[] = [];
      for (let i = 0; i < 4; i++) {
        const ang = i * 1.57 + 0.6;
        stakes.push(this.near(bx + Math.cos(ang) * 0.5, bz + Math.sin(ang) * 0.5, bx, bz));
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), ROPE);
        l.visible = false; l.userData.flat = true;
        this.group.add(l); this.props.push(l); ropes.push(l);
      }
      const windy = a.c.dest === 'mountain';
      this.balloon = {
        obj, env, burner, home: [bx, bz], y0: y(bx, bz), riders: a.party.slice(0, Math.min(2, a.party.length - 1)), stakes, ropes,
        drift: ((cx * 7.3 + cz * 3.1) % 6.283), high: windy ? 2 : 1.7, far: windy ? 2.4 : 1.6,
      };
      this.focus = [bx, bz];
    } else if (st === 'troupe') {
      // la roulotte des jongleurs, deux jongleurs et leurs balles, un tambour ; l'équipe applaudit en demi-cercle
      const [wx, wz] = this.near(cx + 0.6, cz - 0.4, cx, cz);
      this.wagon = this.put(wagonGeo(), wx, wz, 0.4);
      for (const [dx, dz] of [[0.2, -0.14], [0.24, 0.18]]) {
        const x = cx + dx, z = cz + dz;
        this.guests.push(this.npc('juggler', age, x, z, -Math.PI / 2, 'juggle'));
        const balls = [0xd8443a, 0xe8b84a, 0x4a7aa8].map((c) => { const m = new THREE.Mesh(ballGeo(c), mats.body); this.group.add(m); this.props.push(m); return m; });
        this.jugglers.push({ x, y: y(x, z), z, face: -Math.PI / 2, balls });
      }
      const [dx, dz] = this.near(cx + 0.45, cz + 0.4, cx, cz);
      this.put(drumGeo(), dx - 0.08, dz, 0);
      this.guests.push(this.npc('drummer', age, dx, dz, -Math.PI / 2 - 0.5, 'sit'));
      this.focus = [cx + 0.22, cz];
    } else if (st === 'abbey') {
      // la chapelle de l'abbaye, le frère qui touille sa cuve fumante, les tonneaux ; l'équipe écoute et goûte
      const [ax, az] = this.near(cx + 0.75, cz, cx, cz);
      this.put(chapelGeo(), ax, az, Math.PI);
      const kx = cx + 0.25, kz = cz;
      this.put(kettleGeo(), kx, kz, Math.PI / 2);
      this.emits.push({ x: kx, y: y(kx, kz) + 0.14, z: kz, kind: 'steam', every: 0.3, t: 0 });
      this.flameAt(kx, y(kx, kz) + 0.01, kz, 0.6);
      this.monk = this.npc('monk', age, kx + 0.13, kz + 0.02, -Math.PI / 2, 'talk');
      this.put(barrelsGeo(), cx + 0.42, cz + 0.32, 0);
      this.focus = [kx, kz];
    } else if (st === 'stars') {
      // lunettes braquées vers le ciel, l'astronome ; des étoiles filantes passent au-dessus
      for (const [dx, dz, r] of [[-0.32, -0.15, 0.4], [0.3, -0.2, -0.3], [0.02, 0.32, 2.8]]) { const [x, z] = this.near(cx + dx, cz + dz, cx, cz); this.put(telescopeGeo(), x, z, r); this.spots.push([x - Math.sin(r) * 0.12, z - Math.cos(r) * 0.12]); }
      this.npc('scholar', age, cx + 0.12, cz - 0.05, -0.8, 'talk');
      this.emits.push({ x: cx, y: y(cx, cz) + 2.4, z: cz, kind: 'star', every: 1.1, t: 0 });
    } else if (st === 'bridge') {
      // le tablier avance au-dessus de l'eau, travée après travée (de fer à l'âge industriel)
      const wat = this.water, from = wat ? wat.bank : [cx, cz] as [number, number], to = wat ? wat.wet : [cx + 1, cz] as [number, number];
      const d = Math.max(0.01, Math.hypot(to[0] - from[0], to[1] - from[1])), ux = (to[0] - from[0]) / d, uz = (to[1] - from[1]) / d, ry = Math.atan2(-uz, ux);
      let wet = false;
      for (let i = 0; i < 9; i++) {
        const x = from[0] + ux * (0.12 + i * 0.2), z = from[1] + uz * (0.12 + i * 0.2);
        const under = wat ? this.depth(x, z) : null;
        if (under !== null) wet = true; else if (wet && i > 2) break;
        const o = this.put(deckGeo(age >= 3), x, z, ry);
        o.position.y = Math.max(y(x, z), (wat?.level ?? 0) + 0.12);
        o.visible = false;
        this.built.push(o);
        this.spots.push([from[0] - ux * 0.15 + uz * (i % 2 ? 0.15 : -0.15), from[1] - uz * 0.15 - ux * (i % 2 ? 0.15 : -0.15)]);
      }
    } else if (st === 'drill') {
      // tour de sondage, chaudière qui fume, carottes de roche alignées au fil du travail
      this.put(derrickGeo(), cx, cz, 0);
      const [bx, bz] = this.near(cx - 0.4, cz + 0.12, cx, cz);
      this.put(boilerGeo(), bx, bz, 0);
      this.emits.push({ x: bx + 0.07, y: y(bx, bz) + 0.34, z: bz, kind: 'smoke', every: 0.4, t: 0 });
      for (let i = 0; i < 7; i++) {
        const [x, z] = this.near(cx + 0.3 + (i % 2) * 0.04, cz - 0.36 + i * 0.1, cx, cz), o = this.put(coreGeo(), x, z, 0);
        o.visible = false; this.built.push(o); this.spots.push([x - 0.14, z]);
      }
    } else if (st === 'summit' || st === 'basecamp') {
      // le drapeau planté, la station météo montée pièce à pièce, son anémomètre qui tourne ; le camp de base au pied
      // le drapeau au point le plus haut alentour ; depuis le camp de base, la station monte au sommet voisin
      let [sx, sz] = this.peak(cx, cz, 2, 0);
      if (st === 'basecamp') {
        [0xd8443a, 0xe8b84a, 0x4a7aa8].forEach((c, i) => { const [x, z] = this.near(cx + Math.cos(i * 2.1) * 0.4, cz + Math.sin(i * 2.1) * 0.4, cx, cz); this.put(tentGeoC(c), x, z, i * 2.1 + Math.PI / 2); });
        this.put(sacksGeo(), cx, cz, 0);
        [sx, sz] = this.peak(cx, cz, 3, 0.9);
      }
      this.focus = st === 'summit' ? [sx, sz] : [(cx + sx) / 2, (cz + sz) / 2];
      this.put(flagGeo(), sx, sz, 0.4);
      const [mx, mz] = this.near(sx + 0.28, sz + 0.1, sx, sz);
      const station = this.put(stationGeo(), mx, mz, 0);
      const cups = this.put(cupsGeo(), mx, mz, 0);
      cups.position.y += 0.37;
      this.spins.push({ obj: cups, speed: 4 });
      for (const o of [station, cups]) { o.visible = false; this.built.push(o); }
      this.spots.push([mx - 0.15, mz + 0.1], [mx + 0.12, mz + 0.14]);
    }
  }

  /**
   * Le cosmodrome : la fusée de la mission dressée sur le pas de tir (fusée-sonde du premier vol, fusée lunaire, vaisseau
   * colonial), la vapeur des ergols qui s'échappe de ses flancs ; les trois astronautes (ou les colons) attendent au pied de la
   * tour, en scaphandre, puis montent à bord. L'équipe suit le compte à rebours au bord du pas de tir
   */
  private launchpad(a: ActiveExpedition, cx: number, cz: number) {
    const w = this.world, st = this.story, kind: RocketKind = st === 'launch' ? 'probe' : st === 'moon' ? 'moon' : 'colony';
    // le cosmodrome le plus proche, et son pas de tir (le modèle tourne avec le bâtiment)
    let pad: Building | null = null, bd = Infinity;
    for (const b of w.buildings.values()) if (b.kind === 'spaceport') { const s = sizeOf(b), d = Math.hypot(b.x + s / 2 - cx, b.z + s / 2 - cz); if (d < bd) { bd = d; pad = b; } }
    const [px, y0, pz, ry] = pad ? padSpot(w, pad) : [cx + 1.2, w.surfaceAt(cx + 1.2, cz), cz, 0];
    const obj = new THREE.Group(), inner = rocketMesh(kind);
    inner.rotation.y = ry;
    // les flammes, sous chaque tuyère : un dard blanc dans un grand cône orangé
    const flame = new THREE.Group(), R = ROCKET_R[kind];
    const nozzles: [number, number, number][] = kind === 'colony' ? [[0, 0, 0.09], ...[0, 1, 2, 3].map((k): [number, number, number] => [Math.cos(k * Math.PI / 2 + Math.PI / 4) * 0.2, Math.sin(k * Math.PI / 2 + Math.PI / 4) * 0.2, 0.05])] : [[0, 0, kind === 'moon' ? 0.1 : 0.05]];
    for (const [fx, fz, r] of nozzles) {
      const out = new THREE.Mesh(new THREE.ConeGeometry(r, r * 9, 8).rotateX(Math.PI).translate(fx, -r * 4.5, fz), FLAME);
      out.add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 5, 6).rotateX(Math.PI).translate(fx, -r * 2.5, fz), FLAME_IN));
      flame.add(out);
    }
    flame.scale.setScalar(0.001);
    inner.add(flame);
    obj.add(inner);
    obj.position.set(px, y0, pz);
    this.group.add(obj); this.props.push(obj);
    const glare = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), GLARE.clone());
    glare.position.set(px, y0 + 0.012, pz);
    this.group.add(glare); this.props.push(glare);
    // la vapeur des ergols, au flanc de la fusée, jusqu'à l'allumage
    const vapor = { x: px + R * 1.2, y: y0 + ROCKET_H[kind] * 0.55, z: pz, kind: 'steam' as const, every: 0.3, t: 0 };
    this.emits.push(vapor);
    // l'équipage attend au pied de la tour, du côté de l'équipe
    const toward = Math.atan2(cx - px, cz - pz), n = kind === 'probe' ? 0 : kind === 'moon' ? 3 : 6, crew: RocketShow['crew'] = [];
    for (let i = 0; i < n; i++) {
      const ang = toward + (i - (n - 1) / 2) * 0.28, rr = R + 0.42, x = px + Math.sin(ang) * rr, z = pz + Math.cos(ang) * rr;
      crew.push({ n: this.npc('astronaut', 5, x, z, ang + Math.PI, 'idle'), from: [x, z] });
    }
    this.rocket = { obj, flame, glare, kind, x: px, z: pz, y0, dir: toward + Math.PI + 0.6, crew, vapor, puff: 0, trail: 0 };
    this.focus = [px, pz];
  }

  /**
   * La chasse au mammouth : le camp des chasseurs (tente, feu, traîneau vide) et, plus loin du côté le plus dégagé, la harde
   * qui paît (le vieux mâle, une femelle, son petit). Entre les deux, le piège : trois fosses qu'on creuse puis qu'on couvre de
   * branchages (dans la plaine), ou le ravin entre ses deux rangées de blocs (dans la montagne, où les rabatteurs ont une
   * torche au poing) ; au-delà des collines, on suit la harde de loin, et le vieux mâle traîne derrière les autres
   */
  private mammothHunt(a: ActiveExpedition, cx: number, cz: number) {
    this.camp(cx, cz);
    const way = a.c.dest === 'mountain' ? 'ravine' : a.c.dest === 'far' ? 'follow' : 'pits';
    let dir = 0, best = -1;
    for (let d = 0; d < 12; d++) {
      const ang = (d / 12) * Math.PI * 2;
      let n = 0;
      while (n < 6 && this.free(cx + Math.sin(ang) * 0.5 * (n + 1), cz + Math.cos(ang) * 0.5 * (n + 1))) n++;
      if (n > best) { best = n; dir = ang; }
    }
    const sx = Math.sin(dir), sz = Math.cos(dir), px = Math.cos(dir), pz = -Math.sin(dir);
    const at = this.near(cx + sx * 2.4, cz + sz * 2.4, cx, cz);
    // le piège, entre le camp et la harde, un peu de côté (le ravin plus à l'écart) ; suivie de loin, là où le vieux mâle
    // s'attarde, derrière les autres
    const side = way === 'ravine' ? 0.9 : 0.4;
    const trap = way === 'follow' ? this.near(at[0] - sx * 0.7 + px * 0.6, at[1] - sz * 0.7 + pz * 0.6, cx, cz) : this.near(cx + sx * 1.3 + px * side, cz + sz * 1.3 + pz * side, cx, cz);
    // le piège s'ouvre face à la harde : le vieux mâle y arrive en venant d'elle
    const gd = Math.max(0.01, Math.hypot(trap[0] - at[0], trap[1] - at[1])), axis: [number, number] = [(trap[0] - at[0]) / gd, (trap[1] - at[1]) / gd];
    const herd = [[1.15, -0.5, 0], [0.95, 0.1, 0], [0.5, 0.45, 0.25]].map(([size, u, v], i) => {
      const [x, z] = this.near(at[0] + px * u + sx * v, at[1] + pz * u + sz * v, cx, cz);
      return this.addMammoth(x, z, size, dir + Math.PI + (i - 1) * 0.7);
    });
    const pits: THREE.Object3D[] = [], covers: THREE.Object3D[] = [];
    if (way === 'pits') for (let i = 0; i < 3; i++) {
      const o = i ? (i === 1 ? 0.62 : -0.62) : 0, [x, z] = i ? this.near(trap[0] + px * o - sx * 0.15, trap[1] + pz * o - sz * 0.15, cx, cz) : trap;
      pits.push(this.put(pitGeo(), x, z, i));
      const c = this.put(pitCoverGeo(), x, z, i * 1.3);
      c.visible = false;
      covers.push(c);
      // les creuseurs, de part et d'autre de chaque fosse
      for (const s of [-1, 1]) this.spots.push([x + px * s * 0.36, z + pz * s * 0.36]);
    } else if (way === 'ravine') {
      this.put(ravineGeo(), trap[0], trap[1], Math.atan2(axis[0], axis[1]));
      // les rabatteurs se postent derrière la harde, pour la pousser vers le ravin
      for (let i = 0; i < 5; i++) this.spots.push(this.near(at[0] - axis[0] * 0.95 + axis[1] * (i - 2) * 0.35, at[1] - axis[1] * 0.95 - axis[0] * (i - 2) * 0.35, cx, cz));
    } else for (let i = 0; i < 3; i++) this.spots.push(this.near(cx + sx * 1.1 + px * (i - 1) * 0.35, cz + sz * 1.1 + pz * (i - 1) * 0.35, cx, cz));
    this.lit = way === 'ravine';
    this.focus = [(cx + at[0]) / 2, (cz + at[1]) / 2];
    this.mam = { old: herd[0], at, dir, way, trap, axis, pits, covers, k: 0, back: 0 };
  }

  /** Un mammouth de taille `size` (1 : une femelle adulte) en (x, z), tourné vers `heading` : son corps, ses pattes, sa trompe */
  private addMammoth(x: number, z: number, size: number, heading: number): Mammoth {
    const o = new THREE.Group(), body = new THREE.Mesh(mammothGeo(), mats.body), trunk = new THREE.Mesh(mammothTrunkGeo(), mats.body);
    body.castShadow = trunk.castShadow = true;
    trunk.position.set(0, 0.34, 0.31);
    o.add(body, trunk);
    const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([lx, lz]) => {
      const l = new THREE.Mesh(mammothLegGeo(), mats.body);
      l.castShadow = true;
      l.position.set(lx * 0.09, 0.24, lz * 0.12);
      o.add(l);
      return l;
    });
    // (il se cabre un peu en barrissant : autour de son propre travers, une fois tourné)
    o.rotation.order = 'YXZ';
    o.scale.setScalar(size);
    o.position.set(x, this.world.surfaceAt(x, z), z);
    o.rotation.y = heading;
    this.group.add(o);
    const b: Beast = { obj: o, actor: null, x, z, tx: x, tz: z, heading, wait: 1 + size * 2, speed: 0.1 };
    this.beasts.push(b);
    const m: Mammoth = { b, legs, trunk, size, ph: size * 3, px: x, pz: z, v: 0, trumpet: 0, lie: 0, sink: 0 };
    this.mammoths.push(m);
    return m;
  }

  /** Un habitant d'ailleurs (voisin, nomade, moine, jongleur, astronome) qui reste à sa place et fait son geste */
  private npc(role: FolkRole, age: number, x: number, z: number, face: number, pose: FolkPose) {
    const folk = makeFolk({ age, v: Math.floor(x * 131 + z * 17), role });
    folk.root.position.set(x, this.world.surfaceAt(x, z), z);
    folk.root.rotation.y = face;
    this.group.add(folk.root);
    const n = { folk, pose, off: x * 7 };
    this.npcs.push(n);
    return n;
  }

  /** Une flamme qui danse en (x, y, z) */
  private flameAt(x: number, y: number, z: number, s = 1) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.045 * s, 0.13 * s, 5).translate(0, 0.065 * s, 0), FLAME);
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.08 * s, 5).translate(0, 0.04 * s, 0), FLAME_IN));
    f.position.set(x, y, z);
    this.group.add(f); this.props.push(f);
    this.spins.push({ obj: f, speed: 0 });
    return f;
  }

  /** Un petit feu d'herbes humides */
  private fireAt(x: number, z: number) { this.put(fireGeo(), x, z, 0); this.flameAt(x, this.world.surfaceAt(x, z) + 0.015, z, 0.8); }

  /** Un nuage d'abeilles qui tourne autour de (x, y, z) */
  private bees(x: number, y: number, z: number) {
    const g = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39, r = 0.07 + (i % 4) * 0.04;
      const b = new THREE.Mesh(ballGeo(0xf0c040), mats.body);
      b.scale.setScalar(0.7);
      b.position.set(Math.cos(a) * r, Math.sin(i * 1.7) * 0.06, Math.sin(a) * r);
      g.add(b);
    }
    g.position.set(x, y, z);
    this.group.add(g); this.props.push(g);
    this.spins.push({ obj: g, speed: 2.2 });
  }

  // ---------------- Les imprévus, joués sur place ----------------
  /**
   * Un imprévu surgit : on le pose sur la scène. On le voit tout de suite (le jeu s'arrête pendant la décision) : le nuage
   * d'orage, les loups qui tournent autour de l'équipe, l'eau qui monte, le voyageur assis au bord du chemin…
   */
  private stageEvent(id: string, a: ActiveExpedition, fail = false) {
    const s: Staging = { id, pick: fail ? 0 : -1, t: 0, after: 0, end: -1, objs: [], own: [], step: () => false };
    const leader = (k: HerdKind, acts: ('calm' | 'lead' | 'flee')[]) => this.stageLeader(s, a, k, acts);
    const steps: Record<string, () => (dt: number) => boolean> = {
      winds: () => this.stageWinds(s, a), alarm: () => this.stageAlarm(s), boar: () => this.stageBoar(s, a), flood: () => this.stageFlood(s, a),
      ledge: () => this.stageRocks(s, a, 'ledge'), scree: () => this.stageRocks(s, a, 'scree'), rockfall: () => this.stageRocks(s, a, 'rockfall'),
      traveler: () => this.stageTraveler(s, a), hosts: () => this.stageHosts(s, a), storm: () => this.stageStorm(s, a, fail), fog: () => this.stageFog(s, a, fail),
      wolves: () => this.stageWolves(s, a), pack: () => this.stagePack(s, a),
      stallion: () => leader('horse', ['calm', 'lead', 'flee']), ram: () => leader('sheep', ['calm', 'lead', 'flee']),
      tusker: () => leader('pig', ['calm', 'flee', 'flee']), bull: () => leader('cow', ['calm', 'lead', 'flee']), lamb: () => this.stageLamb(s, a),
      shoal: () => this.stageShoal(s, a), rapids: () => this.stageRapids(s), deer: () => this.stageDeer(s, a), vein: () => this.stageVein(s, a),
      dark: () => this.stageDark(s, a), bats: () => this.stageBats(s), firedamp: () => this.stageFiredamp(s), seep: () => this.stageSeep(s, a),
      birds: () => this.stageBirds(s, a, fail), swarm: () => this.stageSwarm(s, a, fail), wheel: () => this.stageWheel(s, a), tasting: () => this.stageTasting(s, a),
      puncture: () => this.stagePuncture(s), gust: () => this.stageGust(s), clouds: () => this.stageClouds(s), cows: () => this.stageCows(s, a),
      tusks: () => this.stageTusks(s, a), blizzard: () => this.stageBlizzard(s, a, fail),
      // les échecs, joués au départ de l'équipe
      rocks: () => this.stageRocks(s, a, 'fail'), capsize: () => this.stageCapsize(s), scatter: () => this.stageScatter(s, a), charge: () => this.stageCharge(s, a),
      stings: () => this.stageSwarm(s, a, true), blast: () => this.stageBlast(s), gone: () => this.stageGone(s),
    };
    const make = steps[id];
    if (!make) return;
    s.step = make();
    this.stagings.push(s);
  }

  /**
   * Les imprévus à chaque image : celui qui surgit se met en place ; la décision prise, la suite de l'option choisie se joue ;
   * fini, il rétrécit et s'efface. Au départ de l'équipe, un échec se joue lui aussi (l'orage, la pirogue qui chavire…)
   */
  private stepStagings(dt: number, a: ActiveExpedition) {
    const ev = a.wait;
    if (ev && !this.stagings.some((s) => s.id === ev.id && s.pick < 0)) this.stageEvent(ev.id, a);
    if (!this.departed && (a.phase === 'back' || a.phase === 'home')) {
      this.departed = true;
      for (const s of this.stagings) s.leave?.();
      // les jongleurs ramenés suivent l'équipe (voir ExpeditionView) : ils quittent la scène
      if (a.ok && a.c.carry === 'guests') { for (const g of this.guests) g.folk.root.visible = false; for (const j of this.jugglers) for (const b of j.balls) b.visible = false; this.jugglers = []; }
      // (l'orage est déjà là : il disperse la harde)
      const f = a.c.fail;
      if (!a.ok && f) this.stageEvent(f === 'storm' && this.stagings.some((s) => s.id === 'storm' && s.end < 0) ? 'scatter' : f, a, true);
    }
    for (const s of this.stagings) {
      s.t += dt;
      if (s.pick < 0 && a.wait?.id !== s.id) { const j = a.seen.lastIndexOf(s.id); s.pick = Math.max(0, j >= 0 ? a.picks[j] : 0); }
      if (s.pick >= 0) s.after += dt;
      if (s.end < 0 && !s.step(dt)) {
        s.end = 0;
        s.objs.forEach((o) => { o.userData.s0 = o.scale.clone(); if (o.userData.flat) o.visible = false; });
      }
      if (s.end >= 0) {
        s.end += dt;
        const k = Math.max(0.001, 1 - smooth(Math.min(1, s.end)));
        for (const o of s.objs) if (o.userData.s0) o.scale.copy(o.userData.s0).multiplyScalar(k);
      }
    }
    this.stagings = this.stagings.filter((s) => { if (s.end < 1) return true; this.unstage(s); return false; });
  }

  /** On range un imprévu : ses objets, ses habitants d'ailleurs, ses matériaux */
  private unstage(s: Staging) {
    const gone = new Set(s.objs);
    for (const o of s.objs) this.group.remove(o);
    for (const d of s.own) d.dispose();
    this.npcs = this.npcs.filter((n) => !gone.has(n.folk.root));
    this.spins = this.spins.filter((x) => !gone.has(x.obj));
    this.props = this.props.filter((o) => !gone.has(o));
  }

  /** Le milieu de l'équipe (ses membres visibles), sinon le cœur de la scène */
  private teamAt(a: ActiveExpedition): [number, number] {
    const pos = this.agents.partyPositions(a.party);
    return pos.length ? [pos.reduce((s, p) => s + p[0], 0) / pos.length, pos.reduce((s, p) => s + p[1], 0) / pos.length] : [this.focus[0], this.focus[1]];
  }

  /** Le milieu de la harde (ou le cœur de la scène) */
  private herdAt(): [number, number] {
    const b = this.beasts;
    return b.length ? [b.reduce((s, x) => s + x.x, 0) / b.length, b.reduce((s, x) => s + x.z, 0) / b.length] : [this.focus[0], this.focus[1]];
  }

  /** Un objet de l'imprévu, posé au sol en (x, z) (ou `lift` au-dessus) ; il s'efface avec lui */
  private sPut(s: Staging, g: THREE.BufferGeometry, x: number, z: number, ry = 0, lift = 0) {
    const m = new THREE.Mesh(g, mats.body);
    m.castShadow = true;
    m.position.set(x, this.world.surfaceAt(x, z) + lift, z);
    m.rotation.y = ry;
    return this.sAdd(s, m);
  }
  private sAdd<T extends THREE.Object3D>(s: Staging, o: T) { this.group.add(o); s.objs.push(o); return o; }

  /** Une flamme de l'imprévu (le grand feu), qui danse */
  private sFlame(s: Staging, x: number, z: number, size: number) {
    const f = this.flameAt(x, this.world.surfaceAt(x, z) + 0.015, z, size);
    s.objs.push(f);
    return f;
  }

  /** Un habitant d'ailleurs le temps de l'imprévu (le voyageur, les voisins) */
  private sNpc(s: Staging, role: FolkRole, age: number, x: number, z: number, face: number, pose: FolkPose) {
    const n = this.npc(role, age, x, z, face, pose);
    s.objs.push(n.folk.root);
    return n;
  }

  /** Une bête de l'imprévu (loup, meneur du troupeau, laie, cerf…), à la taille voulue */
  private sBeast(s: Staging, k: HerdKind | 'wolf' | 'deer', x: number, z: number, size = 1): Beast {
    const [name, len]: [ModelName, number] = k === 'deer' ? ['deer', 0.3] : ANIMAL[k];
    const actor = hasModel(name) ? makeActor(name, len * size) : null;
    const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * size * 0.5, 0), mats.body);
    if (actor) { actor.mixer.setTime(x * 3); s.own.push({ dispose: () => actor.mixer.stopAllAction() }); } else s.own.push((obj as THREE.Mesh).geometry);
    obj.position.set(x, this.world.surfaceAt(x, z), z);
    this.sAdd(s, obj);
    return { obj, actor, x, z, tx: x, tz: z, heading: 0, wait: 0, speed: 0 };
  }

  /** La bête va vers (tx, tz) ; arrivée (ou immobile), elle joue `idle` ; `anyway` : sans regarder où elle met les pieds (elle s'enfuit) */
  private sMove(b: Beast, tx: number, tz: number, speed: number, dt: number, idle: string[] = ['Idle', 'Idle_Eating'], anyway = false) {
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    let moving = false;
    if (d > 0.03 && speed > 0) {
      const st = Math.min(d, speed * dt), nx = b.x + (dx / d) * st, nz = b.z + (dz / d) * st;
      if (anyway || this.free(nx, nz)) { b.x = nx; b.z = nz; moving = true; }
      b.heading = Math.atan2(dx, dz);
    }
    b.obj.position.set(b.x, this.world.surfaceAt(b.x, b.z), b.z);
    b.obj.rotation.y = b.heading;
    if (b.actor) { play(b.actor, moving ? (speed > 0.8 ? ['Gallop', 'Run', 'Walk'] : ['Walk', 'WalkSlow', 'Idle']) : idle); b.actor.mixer.update(dt); }
    return moving;
  }
  private sFace(b: Beast, x: number, z: number) { b.heading = Math.atan2(x - b.x, z - b.z); }
  /** Elle s'enfuit à l'opposé de (x, z) */
  private sFlee(b: Beast, x: number, z: number, speed: number, dt: number) { const ang = Math.atan2(b.x - x, b.z - z); this.sMove(b, b.x + Math.sin(ang) * 2, b.z + Math.cos(ang) * 2, speed, dt, ['Idle'], true); }

  /** Une corde tendue d'un point à l'autre (d'un membre à l'autre, d'un membre à la bête qu'il mène), refaite à chaque image */
  private sRope(s: Staging) {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 8), 3)), l = new THREE.Line(g, ROPE);
    l.frustumCulled = false; l.userData.flat = true; l.visible = false;
    this.sAdd(s, l); s.own.push(g);
    return (pts: [number, number][], h = 0.13) => {
      const p = g.attributes.position as THREE.BufferAttribute, n = Math.min(8, pts.length);
      l.visible = n > 1;
      if (!l.visible) return;
      for (let i = 0; i < 8; i++) { const [x, z] = pts[Math.min(i, n - 1)]; p.setXYZ(i, x, this.world.surfaceAt(x, z) + h, z); }
      p.needsUpdate = true;
    };
  }
  /** Les positions de l'équipe, pour la corde qui la relie */
  private ropeOf(a: ActiveExpedition): [number, number][] { return this.agents.partyPositions(a.party).map(([x, z]) => [x, z]); }

  /** Un nuage (noir d'orage, ou gris clair) en (x, z), à `h` au-dessus du sol : son ombre assombrit la scène */
  private sCloud(s: Staging, x: number, z: number, h: number, light = false, size = 1.6) {
    const m = this.sPut(s, stormGeo(light), x, z, (x * 7 + z * 3) % 6.28, h);
    m.scale.setScalar(size);
    return m;
  }

  /**
   * Le ciel qui s'assombrit sur l'équipe, et là seulement : un voile sombre et transparent tendu au-dessus de la scène (une
   * coupole très plate, au-dessus des têtes), sombre au milieu et effacé sur ses bords (k : sa force, 0 … 1)
   */
  private sGloom(s: Staging, cx: number, cz: number, r: number) {
    const g = new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.15, 1), p = g.attributes.position, col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) { const d = Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / r); col.set([0.04, 0.05, 0.1, 0.45 * (1 - d) * (1 + d)], i * 4); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false });
    const m = this.sAdd(s, new THREE.Mesh(g, mat));
    m.position.set(cx, this.world.surfaceAt(cx, cz) + 0.9, cz);
    m.renderOrder = 3;
    m.userData.flat = true;
    s.own.push(g, mat);
    return (k: number) => { mat.opacity = k; m.visible = k > 0.01; };
  }

  /** La pluie qui tombe sur un disque de rayon r autour de (cx, cz) ; de quoi l'animer (k : sa force, 0 … 1) */
  private sRain(s: Staging, cx: number, cz: number, r: number, top: number) {
    const n = 160, pos = new Float32Array(n * 6), drop: number[] = [];
    for (let i = 0; i < n; i++) { const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d; drop.push(x, z, this.world.surfaceAt(x, z), Math.random()); }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xc4d8ee, transparent: true, opacity: 0.8, depthWrite: false });
    const l = new THREE.LineSegments(g, mat);
    l.frustumCulled = false; l.userData.flat = true;
    this.sAdd(s, l); s.own.push(g, mat);
    return (dt: number, k: number) => {
      mat.opacity = 0.8 * k;
      l.visible = k > 0.02;
      if (!l.visible) return;
      for (let i = 0; i < n; i++) {
        let f = drop[i * 4 + 3] - dt * 1.7;
        if (f < 0) f += 1;
        drop[i * 4 + 3] = f;
        const x = drop[i * 4], z = drop[i * 4 + 1], y = drop[i * 4 + 2] + f * top;
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x - 0.012; pos[i * 6 + 4] = y + 0.14; pos[i * 6 + 5] = z;
      }
      g.attributes.position.needsUpdate = true;
    };
  }

  /**
   * Une nappe de brouillard au ras du sol autour de (cx, cz) : des volutes blanches toujours tournées vers la vue, au bord
   * flou ; elles se chevauchent, la nappe s'épaissit au milieu et s'effiloche sur ses bords (k : son épaisseur)
   */
  private sFog(s: Staging, cx: number, cz: number, r: number) {
    const mat = new THREE.SpriteMaterial({ map: softPuff(), color: 0xf2f4f6, transparent: true, opacity: 0.5, depthWrite: false });
    s.own.push(mat);
    const blobs: { m: THREE.Sprite; a: number; d: number; y: number; sp: number }[] = [];
    for (let i = 0; i < 34; i++) {
      const m = new THREE.Sprite(mat);
      m.scale.set(1.3 + (i % 4) * 0.35, 0.7 + (i % 3) * 0.2, 1);
      m.renderOrder = 2;
      this.sAdd(s, m);
      blobs.push({ m, a: i * 2.4, d: 0.1 + Math.sqrt((i + 0.5) / 34) * r, y: 0.18 + (i % 4) * 0.09, sp: 0.04 + (i % 5) * 0.012 });
    }
    return (dt: number, k: number) => {
      mat.opacity = 0.5 * k;
      for (const b of blobs) {
        b.a += dt * b.sp;
        const x = cx + Math.cos(b.a) * b.d, z = cz + Math.sin(b.a) * b.d;
        b.m.position.set(x, this.world.surfaceAt(x, z) + b.y, z);
        b.m.visible = k > 0.02;
      }
    };
  }

  /** La neige qui tombe à gros flocons sur un disque de rayon r autour de (cx, cz), poussée par le vent ; de quoi l'animer (k : sa force, 0 … 1) */
  private sSnow(s: Staging, cx: number, cz: number, r: number, top: number) {
    const n = 260, pos = new Float32Array(n * 3), flake: number[] = [];
    for (let i = 0; i < n; i++) { const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d; flake.push(x, z, this.world.surfaceAt(x, z), Math.random(), Math.random() * 6.28); }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, map: softPuff(), transparent: true, opacity: 0.95, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false; pts.userData.flat = true;
    this.sAdd(s, pts); s.own.push(g, mat);
    return (dt: number, k: number) => {
      mat.opacity = 0.95 * k;
      pts.visible = k > 0.02;
      if (!pts.visible) return;
      for (let i = 0; i < n; i++) {
        let f = flake[i * 5 + 3] - dt * 0.3;
        if (f < 0) f += 1;
        flake[i * 5 + 3] = f;
        // le vent les pousse de travers ; chacun tourbillonne un peu en tombant
        const ph = flake[i * 5 + 4];
        pos[i * 3] = flake[i * 5] + (f - 0.5) * 0.6 + Math.sin(this.t * 2.1 + ph) * 0.05;
        pos[i * 3 + 1] = flake[i * 5 + 2] + f * top;
        pos[i * 3 + 2] = flake[i * 5 + 1] + Math.cos(this.t * 1.7 + ph) * 0.05;
      }
      g.attributes.position.needsUpdate = true;
    };
  }

  /** Une pierre qui dévale : elle part de (x, y, z) avec la vitesse (vx, vz), tombe, rebondit, roule et s'arrête */
  private rock(x: number, y: number, z: number, vx: number, vz: number, size = 1) {
    const o = new THREE.Mesh(pebbleGeo(), mats.body);
    o.scale.setScalar(size);
    o.castShadow = true;
    this.group.add(o);
    this.fx.push({ obj: o, t: 0, life: 2.6, kind: 'rock', x, y, z, vx, vz, vy: 0 });
  }
  /** Un petit nuage (poussière, écume, fumée) en (x, y, z) */
  private puffAt(x: number, y: number, z: number, kind: 'puff' | 'smoke' | 'gas' = 'puff', vx = (Math.random() - 0.5) * 0.08, vz = (Math.random() - 0.5) * 0.08) {
    const o = new THREE.Mesh(kind === 'gas' ? gasGeo() : kind === 'smoke' ? smokeGeo() : puffGeo(), mats.body);
    this.group.add(o);
    this.fx.push({ obj: o, t: 0, life: kind === 'puff' ? 1.2 : 2.4, kind, x, y, z, vx, vz });
  }
  /** Un poisson qui saute hors de l'eau en (x, z), et le rond qu'il laisse */
  private fishJump(x: number, z: number, level: number) {
    const ang = Math.random() * Math.PI * 2, f = new THREE.Mesh(fishGeo(), mats.body), ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 12).rotateX(-Math.PI / 2), RING);
    this.group.add(f, ring);
    const vx = Math.cos(ang + 1.2) * 0.25, vz = Math.sin(ang + 1.2) * 0.25;
    this.fx.push({ obj: f, t: 0, life: 0.7, kind: 'fish', x, y: level, z, vx, vz });
    this.fx.push({ obj: ring, t: 0, life: 1.2, kind: 'ring', x: x + vx * 0.7, y: level + 0.005, z: z + vz * 0.7, vx: 0, vz: 0 });
  }

  /** L'orage : un nuage noir sur l'équipe, la pluie, les éclairs ; il passe une fois l'abri trouvé (ou le travail fini) */
  private stageStorm(s: Staging, a: ActiveExpedition, fail: boolean) {
    const [cx, cz] = this.teamAt(a), h = 2.6, cloud = this.sCloud(s, cx, cz, h + 0.25, false, 1.3), rain = this.sRain(s, cx, cz, 1.8, h), gloom = this.sGloom(s, cx, cz, 3.2);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const flash = this.sAdd(s, new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), flashMat));
    flash.position.copy(cloud.position); flash.scale.set(2.2, 0.7, 2.2);
    const bolt = this.sAdd(s, new THREE.LineSegments(boltGeo(1), BOLT));
    bolt.userData.flat = true; bolt.visible = false;
    s.own.push(flash.geometry, flashMat, { dispose: () => bolt.geometry.dispose() });
    // l'orage du départ (un échec) disperse la harde
    if (fail) for (const b of this.beasts) b.flee = Math.atan2(b.x - cx, b.z - cz);
    let strike = 0.4, shown = 0, k = 1, drift = 0;
    return (dt: number) => {
      const wet = fail ? s.t < 9 : s.pick < 0 || (s.pick === 0 ? s.after < 8 : a.phase === 'work' && s.after < 40);
      k = wet ? Math.min(1, k + dt) : k - dt * 0.4;
      rain(dt, Math.max(0, k));
      gloom(Math.max(0, k) * (1 + flashMat.opacity * -1.2));
      // un éclair de temps en temps : un zigzag blanc jusqu'au sol, le nuage qui s'illumine
      if (wet && (strike -= dt) <= 0) {
        strike = 1.6 + Math.random() * 2.4; shown = 0.16;
        const ang = Math.random() * Math.PI * 2, d = 0.4 + Math.random(), x = cloud.position.x + Math.cos(ang) * d, z = cloud.position.z + Math.sin(ang) * d, y0 = this.world.surfaceAt(x, z);
        bolt.geometry.dispose(); bolt.geometry = boltGeo(Math.random() * 10);
        bolt.position.set(x, y0, z); bolt.scale.set(1, cloud.position.y - y0, 1);
        flashMat.opacity = 0.55;
      }
      shown -= dt;
      bolt.visible = shown > 0;
      flashMat.opacity *= Math.pow(0.02, dt);
      // l'orage passé, le nuage s'en va
      if (!wet) { drift += dt; cloud.position.x += dt * 0.5 * drift; flash.position.copy(cloud.position); }
      return k > 0 || drift < 4;
    };
  }

  /** Le brouillard : une nappe blanche sur l'équipe ; elle se lève quand on l'attend (ou une fois le travail fini) */
  private stageFog(s: Staging, a: ActiveExpedition, fail: boolean) {
    const [tx, tz] = this.teamAt(a), fog = this.sFog(s, (tx + this.focus[0]) / 2, (tz + this.focus[1]) / 2, 2.2);
    let k = 0.6;
    return (dt: number) => {
      const thick = fail ? s.t < 8 : s.pick < 0 || (s.pick === 0 ? s.after < 6 : a.phase === 'work' && s.after < 40);
      k = thick ? Math.min(1, k + dt * 0.5) : k - dt * 0.12;
      fog(dt, Math.max(0, k));
      return k > 0;
    };
  }

  /** Des loups tournent autour de l'équipe ; le grand feu (ou la garde) les tient à distance, puis ils filent */
  private stageWolves(s: Staging, a: ActiveExpedition) {
    const [cx, cz] = this.teamAt(a), pack = [0, 1, 2].map((i) => { const ang = i * 2.1, b = this.sBeast(s, 'wolf', cx + Math.cos(ang) * 1.7, cz + Math.sin(ang) * 1.7); b.wait = ang; return b; });
    let fire = false;
    return (dt: number) => {
      const p = s.pick, stay = p === 1 ? 10 : p === 0 ? 8 : 6, leave = p >= 0 && s.after > stay;
      // le grand feu, allumé au milieu de l'équipe : il brûle jusqu'à son départ
      if (p === 1 && !fire) {
        fire = true;
        const [fx, fz] = this.teamAt(a);
        this.sPut(s, fireGeo(), fx, fz, 0).scale.setScalar(1.6);
        [1.1, 1.5, 1].forEach((sz, i) => this.sFlame(s, fx + (i - 1) * 0.05, fz + (i % 2) * 0.04, sz * 1.4));
        const smoke = { x: fx, y: this.world.surfaceAt(fx, fz) + 0.25, z: fz, kind: 'smoke' as const, every: 0.35, t: 0 };
        this.emits.push(smoke);
        s.own.push({ dispose: () => { this.emits = this.emits.filter((e) => e !== smoke); } });
      }
      const r = p < 0 ? 1.7 : p === 0 ? 1.9 : p === 1 ? 2.4 : 1.1;
      pack.forEach((b, i) => {
        if (leave) { this.sFlee(b, cx, cz, 1.6, dt); return; }
        b.wait += dt * (0.32 + i * 0.05);
        // (sur la terre ferme : là où le cercle passe dans l'eau, ils rôdent plus près)
        const [x, z] = this.near(cx + Math.cos(b.wait) * r, cz + Math.sin(b.wait) * r, cx, cz);
        this.sMove(b, x, z, 0.75, dt, ['Idle'], true);
      });
      if (leave && s.after > stay + 4) for (const b of pack) b.obj.visible = false;
      return !(leave && s.after > stay + 4) || (fire && a.phase === 'work');
    };
  }

  /** La meute du loup : deux autres loups tournent autour de lui, leurs traces au sol ; les pièges de corde posés autour */
  private stagePack(s: Staging, a: ActiveExpedition) {
    const w0 = this.beasts[0], [wx, wz] = w0 ? [w0.x, w0.z] : this.focus, [tx, tz] = this.teamAt(a);
    const extra = [0, 1].map((i) => this.sBeast(s, 'wolf', wx + (i ? 0.5 : -0.5), wz + 0.4));
    for (let i = 0; i < 8; i++) { const k = (i + 1) / 9, x = tx + (wx - tx) * k + (i % 2 ? 0.05 : -0.05), z = tz + (wz - tz) * k; this.sPut(s, pawGeo(), x, z, Math.atan2(wx - tx, wz - tz), 0.004); }
    let snares = false;
    return (dt: number) => {
      const lead = this.beasts[0], [cx, cz] = lead ? [lead.x, lead.z] : this.focus, stay = s.pick === 0 ? 2 : s.pick === 1 ? 10 : 12, flee = s.pick >= 0 && s.after > stay;
      extra.forEach((b, i) => {
        if (flee) { this.sFlee(b, tx, tz, 1.6, dt); return; }
        const ang = this.t * 0.6 + i * Math.PI;
        this.sMove(b, cx + Math.cos(ang) * 0.6, cz + Math.sin(ang) * 0.6, 0.9, dt, ['Idle'], true);
      });
      if (s.pick === 1 && !snares) { snares = true; for (let i = 0; i < 3; i++) { const ang = i * 2.1 + 0.5; const [x, z] = this.near(cx + Math.cos(ang) * 1.1, cz + Math.sin(ang) * 1.1, cx, cz); this.sPut(s, snareGeo(), x, z, ang); } }
      if (flee && s.after > stay + 3) for (const b of extra) b.obj.visible = false;
      return !(flee && s.after > stay + 3) || (snares && a.phase === 'work');
    };
  }

  /**
   * Le meneur du troupeau (l'étalon, le bélier, le vieux sanglier, le grand taureau) : plus grand que les autres, il se dresse
   * entre l'équipe et les bêtes. Apaisé, il broute ; mené à la corde, il suit le premier de l'équipe ; sinon il détale
   */
  private stageLeader(s: Staging, a: ActiveExpedition, kind: HerdKind, acts: ('calm' | 'lead' | 'flee')[]) {
    const [tx, tz] = this.teamAt(a), [hx, hz] = this.herdAt(), ang = Math.atan2(tx - hx, tz - hz);
    const [lx, lz] = this.near(hx + Math.sin(ang) * 0.55, hz + Math.cos(ang) * 0.55, hx, hz), b = this.sBeast(s, kind, lx, lz, 1.45), rope = this.sRope(s);
    this.sFace(b, tx, tz);
    let gone = false;
    return (dt: number) => {
      const act = s.pick < 0 ? 'wait' : acts[s.pick] ?? 'calm', lead = this.agents.partyPositions(a.party)[0];
      if (act === 'wait') { if (lead) this.sFace(b, lead[0], lead[1]); this.sMove(b, b.x, b.z, 0, dt, Math.sin(this.t * 1.3) > 0.3 ? ['Headbutt', 'Idle'] : ['Idle']); }
      else if (act === 'calm') this.sMove(b, b.x, b.z, 0, dt, ['Idle_Eating', 'Eating', 'Idle']);
      else if (act === 'lead' && lead) {
        const d = Math.hypot(lead[0] - b.x, lead[1] - b.z), k = d > 0.38 ? (d - 0.38) / d : 0;
        this.sMove(b, b.x + (lead[0] - b.x) * k, b.z + (lead[1] - b.z) * k, 0.55, dt, ['Idle'], true);
        rope([[lead[0], lead[1]], [b.x, b.z]], 0.12);
      } else if (act === 'flee' && !gone) {
        this.sFlee(b, tx, tz, 1.5, dt);
        if (s.after > 3.5) { b.obj.visible = false; gone = true; }
        // on lui a ouvert l'enclos : deux bêtes filent avec lui
        if (s.id === 'tusker' && s.pick === 2) for (const x of this.beasts.slice(0, 2)) x.flee ??= Math.atan2(x.x - tx, x.z - tz);
      }
      // apaisé ou mené à la corde, il reste jusqu'au départ de l'équipe (ramené, il la suit au village)
      return !gone && a.phase === 'work';
    };
  }

  /** L'agneau pris dans les ronces, sa mère qui tourne autour du buisson ; libéré, il rejoint le troupeau */
  private stageLamb(s: Staging, a: ActiveExpedition) {
    const [hx, hz] = this.herdAt(), [bx, bz] = this.near(hx + 0.75, hz - 0.5, hx, hz);
    this.sPut(s, bushGeo(), bx, bz, 0.5);
    const lamb = this.sBeast(s, 'sheep', bx + 0.04, bz, 0.55), ewe = this.sBeast(s, 'sheep', bx + 0.32, bz, 1);
    let ang = 0, sent = false;
    return (dt: number) => {
      ang += dt * 0.9;
      const out = s.pick >= 0 && s.after > (s.pick === 0 ? 4 : 7);
      if (!out) {
        this.sMove(ewe, bx + Math.cos(ang) * 0.34, bz + Math.sin(ang) * 0.34, 0.45, dt, ['Idle'], true);
        this.sMove(lamb, lamb.x, lamb.z, 0, dt, ['Jump_Start', 'Idle']);
        lamb.obj.position.y += Math.abs(Math.sin(this.t * 6)) * 0.02;
      } else {
        this.sMove(lamb, hx + 0.15, hz, 0.35, dt, ['Idle_Eating'], true);
        this.sMove(ewe, hx + 0.32, hz + 0.1, 0.35, dt, ['Idle_Eating'], true);
      }
      // un membre va le dégager des ronces
      if (s.pick === 0 && !sent && a.phase === 'work') this.sendTo(a, a.party[0], bx - 0.2, bz, bx, bz, 6), sent = true;
      return a.phase === 'work';
    };
  }

  /** Un membre va en (x, z) et y travaille, tourné vers (fx, fz) ; il ne repart pas avant `stay` secondes */
  private sendTo(a: ActiveExpedition, id: number | undefined, x: number, z: number, fx: number, fz: number, stay: number) {
    if (id === undefined || this.kind === 'delve' || this.boat?.riders.includes(id) || this.bath?.in.has(id)) return;
    this.agents.memberGo(id, x, z, Math.atan2(fx - x, fz - z));
    this.next.set(id, stay);
    this.goal.set(id, 1);
    void a;
  }

  /** La laie et ses marcassins sur le sentier : elle gronde, charge un instant si l'on passe sous son nez, puis s'en va */
  private stageBoar(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [bx, bz] = this.near(tx + 0.9, tz + 0.5, tx, tz);
    const sow = this.sBeast(s, 'pig', bx, bz, 1.3), young = [0, 1, 2].map((i) => this.sBeast(s, 'pig', bx + Math.cos(i * 2.1) * 0.24, bz + Math.sin(i * 2.1) * 0.24, 0.5));
    this.sFace(sow, tx, tz);
    return (dt: number) => {
      const p = s.pick, start = p === 1 ? 0 : p === 0 ? 7 : 3, flee = p >= 0 && s.after > start;
      if (flee) {
        [sow, ...young].forEach((b, i) => { const ang = Math.atan2(bx - tx, bz - tz) + (i - 1.5) * 0.25; this.sMove(b, b.x + Math.sin(ang) * 2, b.z + Math.cos(ang) * 2, p === 1 ? 1.5 : 0.6, dt, ['Idle'], true); });
        if (s.after > start + 4) { for (const b of [sow, ...young]) b.obj.visible = false; return false; }
        return true;
      }
      if (p === 2 && s.after < 2) {
        // elle charge, puis revient à ses petits
        const ang = Math.atan2(tx - bx, tz - bz), d = Math.sin(Math.min(1, s.after / 2) * Math.PI) * 0.5;
        this.sMove(sow, bx + Math.sin(ang) * d, bz + Math.cos(ang) * d, 1.6, dt, ['Idle'], true);
      } else this.sMove(sow, sow.x, sow.z, 0, dt, Math.sin(this.t * 1.7) > 0.4 ? ['Headbutt', 'Idle'] : ['Idle_Eating', 'Idle']);
      young.forEach((b, i) => { const ang = this.t * 0.8 + i * 2.1; this.sMove(b, sow.x + Math.cos(ang) * 0.24, sow.z + Math.sin(ang) * 0.24, 0.4, dt, ['Idle'], true); });
      return true;
    };
  }

  /**
   * Le voyageur blessé, assis au bord du chemin. Soigné, il se relève, salue et reprend sa route ; ramené au village, il suit
   * l'équipe au retour (voir ExpeditionView) ; laissé là, il y reste
   */
  private stageTraveler(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), ang = Math.atan2(a.base[0] - tx, a.base[1] - tz);
    const [vx, vz] = this.near(tx + Math.sin(ang) * 0.6 + Math.cos(ang) * 0.35, tz + Math.cos(ang) * 0.6 - Math.sin(ang) * 0.35, tx, tz);
    const man = this.sNpc(s, 'villager', a.age, vx, vz, ang + Math.PI, 'sit');
    let sent = false, x = vx, z = vz;
    s.leave = () => { if (s.pick === 1) man.folk.root.visible = false; };
    return (dt: number) => {
      if (s.pick !== 0) return man.folk.root.visible;
      if (!sent && a.phase === 'work') { sent = true; this.sendTo(a, a.party[0], vx + 0.17, vz, vx, vz, 6); }
      man.pose = s.after < 5 ? 'sit' : s.after < 7 ? 'cheer' : 'walk';
      if (s.after >= 7) {
        x -= Math.sin(ang) * dt * 0.35; z -= Math.cos(ang) * dt * 0.35;
        man.folk.root.position.set(x, this.world.surfaceAt(x, z), z);
        man.folk.root.rotation.y = ang + Math.PI;
      }
      return s.after < 14;
    };
  }

  /** Des voisins viennent saluer l'équipe, un panier à la main ; les cadeaux échangés, ils restent à bavarder (sinon ils s'en vont) */
  private stageHosts(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), ang = Math.atan2(tx - a.base[0], tz - a.base[1]);
    const people = [0, 1].map((i) => {
      const a0 = ang + (i - 0.5) * 0.5, x0 = tx + Math.sin(a0) * 2.2, z0 = tz + Math.cos(a0) * 2.2;
      return { n: this.sNpc(s, 'villager', a.age, x0, z0, a0 + Math.PI, 'walk'), from: [x0, z0] as [number, number], to: this.near(tx + Math.sin(a0) * 0.45, tz + Math.cos(a0) * 0.45, tx, tz), x: x0, z: z0 };
    });
    const basket = this.sPut(s, basketGeo(), people[0].to[0], people[0].to[1], 0), fruit = this.sPut(s, foodGeo(), people[0].to[0], people[0].to[1], 0, 0.06);
    fruit.scale.setScalar(0.5);
    basket.visible = fruit.visible = false;
    let gifts = false;
    return (dt: number) => {
      const leaving = s.pick === 1 && s.after > 3;
      let home = true;
      for (const p of people) {
        const [gx, gz] = leaving ? p.from : p.to, dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.03) { const st = Math.min(d, dt * 0.4); p.x += (dx / d) * st; p.z += (dz / d) * st; p.n.folk.root.rotation.y = Math.atan2(dx, dz); home = false; }
        else p.n.folk.root.rotation.y = Math.atan2(tx - p.x, tz - p.z);
        p.n.folk.root.position.set(p.x, this.world.surfaceAt(p.x, p.z), p.z);
        p.n.pose = d > 0.03 ? 'walk' : s.pick === 0 && s.after < 8 ? (Math.floor(this.t * 1.2) % 2 ? 'cheer' : 'talk') : s.pick === 1 ? 'cheer' : 'talk';
      }
      const at = !leaving && Math.hypot(people[0].x - people[0].to[0], people[0].z - people[0].to[1]) < 0.05;
      basket.visible = fruit.visible = at;
      // les cadeaux échangés : nos poteries, posées près d'eux
      if (s.pick === 0 && !gifts) { gifts = true; const [gx, gz] = people[1].to; this.sPut(s, potsGeo(), gx + 0.12, gz + 0.1, 0).scale.setScalar(0.8); }
      return !(leaving && home);
    };
  }

  /** Le banc de poissons : des sauts partout devant l'équipe ; les filets tendus, puis la pêche étalée sur la berge */
  private stageShoal(s: Staging, a: ActiveExpedition) {
    const wat = this.water ?? this.findWater(...this.teamAt(a));
    if (!wat) return () => false;
    const [wx, wz] = wat.wet, [bx, bz] = wat.bank, d = Math.max(0.01, Math.hypot(wx - bx, wz - bz)), ox = (wx - bx) / d, oz = (wz - bz) / d;
    let cx = wx + ox * 0.4, cz = wz + oz * 0.4, jt = 0, net = false, pile = false;
    return (dt: number) => {
      const on = s.pick < 0 || s.after < (s.pick === 0 ? 7 : 5);
      // on le laisse passer : il remonte le courant et s'éloigne
      if (s.pick === 1) { cx += -oz * dt * 0.3; cz += ox * dt * 0.3; }
      if (on && (jt -= dt) <= 0) {
        jt = 0.12;
        const x = cx + (Math.random() - 0.5) * 0.7, z = cz + (Math.random() - 0.5) * 0.7;
        if (this.depth(x, z) !== null) this.fishJump(x, z, wat.level);
      }
      if (s.pick === 0 && !net) { net = true; this.sPut(s, netGeo(), cx, cz, Math.atan2(ox, oz)).position.y = wat.level + 0.004; }
      if (s.pick === 0 && s.after > 7 && !pile) { pile = true; const [px, pz] = this.near(bx - ox * 0.2 + oz * 0.25, bz - oz * 0.2 - ox * 0.25, bx, bz); this.sPut(s, catchGeo(), px, pz, 0); }
      return s.pick === 0 ? a.phase === 'work' : on;
    };
  }

  /** Les rapides : l'eau écume autour de la barque, qui tangue fort (plus encore si on les saute) */
  private stageRapids(s: Staging) {
    const bt = this.boat;
    if (!bt) return () => false;
    const [hx, hz] = bt.home, [ox, oz] = bt.out;
    for (let i = 0; i < 3; i++) { const k = 0.3 + i * 0.3, x = hx + (ox - hx) * k + (i % 2 ? 0.25 : -0.25), z = hz + (oz - hz) * k; const r = this.sPut(s, rocksGeo(), x, z, i); r.scale.setScalar(0.45); r.position.y = bt.y - 0.03; }
    let pt = 0;
    return (dt: number) => {
      const wild = s.pick < 0 || s.after < (s.pick === 2 ? 6 : 3);
      this.rough = wild ? (s.pick === 2 ? 1 : 0.6) : Math.max(0, this.rough - dt * 0.3);
      if (wild && (pt -= dt) <= 0) { pt = 0.07; const k = Math.random(), x = hx + (ox - hx) * k + (Math.random() - 0.5) * 0.6, z = hz + (oz - hz) * k + (Math.random() - 0.5) * 0.6; if (this.depth(x, z) !== null) this.puffAt(x, bt.y + 0.01, z); }
      return wild || this.rough > 0;
    };
  }

  /** La rivière gonfle : l'eau monte sur la berge, le courant emporte des branches ; elle redescend une fois la décrue attendue */
  private stageFlood(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), wat = this.water ?? this.findWater(tx, tz);
    const [wx, wz] = wat ? wat.wet : [tx + 0.6, tz], [bx, bz] = wat ? wat.bank : [tx, tz], level = wat ? wat.level : this.world.surfaceAt(tx, tz);
    const cx = (wx + bx) / 2, cz = (wz + bz) / 2, r = Math.max(1, Math.hypot(wx - bx, wz - bz) + 0.8);
    const g = new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), mat = new THREE.MeshLambertMaterial({ color: 0x6f98a4, transparent: true, opacity: 0.68, depthWrite: false });
    const sheet = this.sAdd(s, new THREE.Mesh(g, mat));
    s.own.push(g, mat);
    const dd = Math.max(0.01, Math.hypot(wx - bx, wz - bz)), ux = -(wz - bz) / dd, uz = (wx - bx) / dd;
    const logs = [0, 1, 2].map((i) => ({ o: this.sPut(s, branchGeo(), wx, wz, i), u: -r + i * r * 0.7, off: (i - 1) * 0.25 }));
    let rise = 0.05, boat: THREE.Object3D | null = null;
    return (dt: number) => {
      const high = s.pick < 0 || (s.pick === 2 ? s.after < 9 : s.after < 3);
      rise += high ? Math.min(0.13 - rise, dt * 0.05) : -Math.min(rise, dt * 0.012);
      sheet.position.set(cx, level - 0.03 + rise, cz);
      for (const l of logs) {
        l.u += dt * 0.28;
        if (l.u > r) l.u -= 2 * r;
        const x = wx + ux * l.u + (wx - bx) / dd * l.off, z = wz + uz * l.u + (wz - bz) / dd * l.off;
        l.o.position.set(x, sheet.position.y + 0.02, z);
        l.o.rotation.y += dt * 0.4;
        l.o.visible = Math.abs(l.u) < r * 0.85;
      }
      // en barque : elle traverse l'eau haute
      if (s.pick === 1 && !boat && wat) boat = this.sPut(s, boatGeo(), wx, wz, Math.atan2(ux, uz));
      if (boat) { const k = Math.min(1, s.after / 6); boat.position.set(wx + ux * (k - 0.5) * 1.6, sheet.position.y + 0.01, wz + uz * (k - 0.5) * 1.6); }
      return high || rise > 0.002;
    };
  }

  /**
   * Des pierres dévalent : du haut de la pente vers l'équipe (la corniche, l'éboulis), ou de la paroi au-dessus de l'entrée de la
   * galerie. Étayer pose des poutres à l'entrée ; s'encorder tend une corde d'un membre à l'autre
   */
  private stageRocks(s: Staging, a: ActiveExpedition, kind: 'ledge' | 'scree' | 'rockfall' | 'fail') {
    const [tx, tz] = this.teamAt(a), src: [number, number] = this.mouth ? this.mouth.at : this.kind === 'mine' && this.props[0] ? [this.props[0].position.x, this.props[0].position.z] : [tx, tz];
    const [ux, uz] = this.uphill(src[0], src[1]), rope = kind === 'fail' ? null : this.sRope(s);
    let rt = 0, propped = false;
    return (dt: number) => {
      const falling = kind === 'fail' ? s.t < 3.5 : s.pick < 0 || s.after < (s.pick === 2 ? 5 : 2.5);
      if (falling && (rt -= dt) <= 0) {
        rt = kind === 'ledge' ? 0.55 : kind === 'fail' ? 0.14 : 0.3;
        const j = (Math.random() - 0.5) * 0.9, sx = src[0] + ux * 1.1 + uz * j, sz = src[1] + uz * 1.1 - ux * j, sp = kind === 'ledge' ? 0.55 : 0.9;
        this.rock(sx, this.world.surfaceAt(sx, sz) + (this.mouth ? 0.6 : 0.35), sz, -ux * sp + (Math.random() - 0.5) * 0.3, -uz * sp + (Math.random() - 0.5) * 0.3, kind === 'ledge' ? 0.6 : 0.9 + Math.random() * 0.7);
      }
      // étayer : des poutres à l'entrée, qui restent jusqu'au départ
      if (kind === 'rockfall' && s.pick === 0 && !propped) {
        propped = true;
        const [x, z] = this.mouth ? this.mouth.at : src, face = this.mouth ? Math.atan2(this.mouth.heap[0] - x, this.mouth.heap[1] - z) : 0;
        this.sPut(s, proppingGeo(), x + Math.sin(face) * 0.08, z + Math.cos(face) * 0.08, face).scale.setScalar(1.3);
      }
      const roped = kind !== 'fail' && (kind === 'ledge' ? s.pick === 0 : s.pick === 1) && a.phase === 'work' && s.after < 25;
      rope?.(roped ? this.ropeOf(a) : []);
      return falling || roped || (propped && a.phase === 'work') || s.t < 1;
    };
  }

  /** Un éclat dans la roche : un rocher où brillent des cristaux. On le creuse (un tas de minerai), ou l'on y plante un jalon */
  private stageVein(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [ux, uz] = this.uphill(tx, tz), [gx, gz] = this.near(tx + ux * 0.6 + uz * 0.3, tz + uz * 0.6 - ux * 0.3, tx, tz);
    const rock = this.sPut(s, glintGeo(), gx, gz, gx * 5), spark = this.sAdd(s, new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), STAR));
    s.own.push(spark.geometry);
    spark.position.set(gx + 0.03, rock.position.y + 0.21, gz);
    let sent = false, pile = false, flag = false, pt = 0;
    return (dt: number) => {
      spark.scale.setScalar(0.4 + Math.max(0, Math.sin(this.t * 4)) * 1.3);
      spark.rotation.y += dt * 3;
      if (s.pick === 0) {
        if (!sent && a.phase === 'work') { sent = true; this.sendTo(a, a.party[0], gx - ux * 0.18, gz - uz * 0.18, gx, gz, 8); }
        if (s.after < 6 && (pt -= dt) <= 0) { pt = 0.3; this.puffAt(gx, rock.position.y + 0.1, gz); }
        if (s.after > 6 && !pile) { pile = true; rock.visible = spark.visible = false; this.sPut(s, rocksGeo(), gx, gz, 0).scale.setScalar(0.6); }
      } else if (s.pick === 1 && !flag) { flag = true; this.sPut(s, stakeFlagGeo(), gx + 0.14, gz + 0.06, 0); }
      return a.phase === 'work';
    };
  }

  /** Les torches faiblissent : les flammes baissent ; les bonnes torches flambent haut, ou l'on ressort refaire des torches au feu */
  private stageDark(s: Staging, a: ActiveExpedition) {
    let fire = false, lt = 0;
    s.own.push({ dispose: () => { this.torchTo = 1; } });
    // elles baissent d'un coup (on le voit pendant que le jeu attend la décision)
    this.torchTo = 0.3;
    if (this.kindled) this.torchK = 0.3;
    return (dt: number) => {
      if (s.pick < 0) this.torchTo = 0.3;
      else if (s.pick === 0) this.torchTo = 1.6;
      else if (s.pick === 1) {
        // le courant d'air : il sort de la grotte en soufflant feuilles et poussière
        this.torchTo = s.after < 5 ? 0.3 : 1;
        if (this.mouth && s.after < 8 && (lt -= dt) <= 0) { lt = 0.12; const [mx, mz] = this.mouth.at, [hx, hz] = this.mouth.heap; this.leaf(mx, this.world.surfaceAt(mx, mz) + 0.12, mz, (hx - mx) * 0.6, (hz - mz) * 0.6); }
      } else {
        this.torchTo = s.after < 6 ? 0.15 : 1;
        if (!fire && this.mouth) { fire = true; const [hx, hz] = this.mouth.heap, [x, z] = this.near(hx + 0.22, hz + 0.1, hx, hz); this.sPut(s, fireGeo(), x, z, 0); this.sFlame(s, x, z, 0.8); }
      }
      return s.pick < 0 || (s.pick === 0 ? a.phase === 'work' : s.after < 10);
    };
  }
  /** Une feuille (ou de la poussière) emportée par le vent */
  private leaf(x: number, y: number, z: number, vx: number, vz: number) {
    const o = new THREE.Mesh(leafGeo(), mats.body);
    this.group.add(o);
    this.fx.push({ obj: o, t: 0, life: 1.8, kind: 'leaf', x, y, z, vx: vx + (Math.random() - 0.5) * 0.2, vz: vz + (Math.random() - 0.5) * 0.2 });
  }

  /** La nuée de chauves-souris : elles jaillissent de la grotte, tourbillonnent devant l'entrée, puis s'égaillent vers le ciel */
  private stageBats(s: Staging) {
    const [mx, mz] = this.mouth?.at ?? this.focus, y0 = this.world.surfaceAt(mx, mz) + 0.15, dir = this.mouth ? Math.atan2(this.mouth.heap[0] - mx, this.mouth.heap[1] - mz) : 0;
    const bats = Array.from({ length: 24 }, (_, i) => ({ m: this.sAdd(s, new THREE.Mesh(wingGeo(0x2a2228), mats.body)), a: i * 0.9, r: 0.18 + (i % 5) * 0.12, h: 0.1 + (i % 4) * 0.12, sp: 2.2 + (i % 3) * 0.6 }));
    return (dt: number) => {
      const away = s.pick >= 0 ? s.after * (s.pick === 1 ? 1.4 : 0.9) : Math.max(0, 1 - s.t) * -0.4;
      const cx = mx + Math.sin(dir) * (0.5 + away * 0.6), cz = mz + Math.cos(dir) * (0.5 + away * 0.6);
      for (const b of bats) {
        b.a += dt * b.sp;
        const r = b.r * (1 + Math.max(0, away) * 0.8), x = cx + Math.cos(b.a) * r, z = cz + Math.sin(b.a) * r;
        b.m.position.set(x, y0 + b.h + Math.max(0, away) * 0.7 + Math.sin(b.a * 2) * 0.05, z);
        b.m.rotation.y = Math.atan2(-Math.sin(b.a), Math.cos(b.a));
        b.m.scale.set(1, 0.4 + Math.abs(Math.sin(this.t * 22 + b.a)) * 1.2, 1);
      }
      return s.pick < 0 || s.after < 4;
    };
  }

  /** Le grisou : une fumée verdâtre sort de la grotte ; on éteint les lampes, ou l'on descend le canari dans sa cage */
  private stageFiredamp(s: Staging) {
    const [mx, mz] = this.mouth?.at ?? this.focus;
    let gt = 0, cage = false;
    s.own.push({ dispose: () => { this.torchTo = 1; } });
    return (dt: number) => {
      const gas = s.pick < 0 || s.after < (s.pick === 2 ? 8 : 5);
      if (gas && (gt -= dt) <= 0) { gt = 0.2; this.puffAt(mx + (Math.random() - 0.5) * 0.2, this.world.surfaceAt(mx, mz) + 0.08, mz + (Math.random() - 0.5) * 0.2, 'gas'); }
      if (s.pick === 0) this.torchTo = s.after < 8 ? 0 : 1;
      if (s.pick === 1 && !cage) { cage = true; const [hx, hz] = this.mouth?.heap ?? [mx, mz]; this.sPut(s, cageGeo(), (mx + hx) / 2 + 0.12, (mz + hz) / 2, 0); }
      return gas || (s.pick === 0 && s.after < 9) || (cage && s.after < 14);
    };
  }

  /** L'eau envahit la galerie : une flaque grandit à l'entrée ; on écope au seau, ou l'on creuse une rigole pour la vider */
  private stageSeep(s: Staging, a: ActiveExpedition) {
    const m = this.mouth;
    if (!m) return () => false;
    const [mx, mz] = m.at, [hx, hz] = m.heap, g = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), mat = new THREE.MeshLambertMaterial({ color: 0x5a8fb4, transparent: true, opacity: 0.75, depthWrite: false });
    const cx = mx + (hx - mx) * 0.3, cz = mz + (hz - mz) * 0.3, puddle = this.sAdd(s, new THREE.Mesh(g, mat));
    s.own.push(g, mat);
    puddle.position.set(cx, this.world.surfaceAt(cx, cz) + 0.015, cz);
    let r = 0.2, extra = false, dt0 = 0;
    return (dt: number) => {
      const target = s.pick < 0 ? 0.55 : s.pick === 2 ? (a.phase === 'work' ? 0.55 : 0) : s.after > 2 ? 0 : 0.55;
      r += (target - r) * Math.min(1, dt * (target > r ? 0.6 : s.pick === 1 ? 0.3 : 0.18));
      puddle.scale.set(Math.max(0.001, r), 1, Math.max(0.001, r * 0.8));
      if (r > 0.1 && (dt0 -= dt) <= 0) { dt0 = 0.25; const o = new THREE.Mesh(bubbleGeo(), mats.body); this.group.add(o); this.fx.push({ obj: o, t: 0, life: 0.6, kind: 'bubble', x: cx + (Math.random() - 0.5) * r, y: puddle.position.y, z: cz + (Math.random() - 0.5) * r, vx: 0, vz: 0 }); }
      // le seau, ou la rigole qui file vers le bas de la pente
      if (!extra && s.pick === 0) { extra = true; this.sPut(s, bucketGeo(), cx + 0.3, cz + 0.12, 0); }
      if (!extra && s.pick === 1) { extra = true; const f = Math.atan2(hx - mx, hz - mz); this.sPut(s, ditchGeo(), cx, cz, f, 0.004); }
      return s.pick < 0 || r > 0.02 || s.after < 3;
    };
  }

  /** Les étourneaux s'abattent sur les buissons : on les chasse, ils restent picorer, ou on leur laisse un buisson */
  private stageBirds(s: Staging, a: ActiveExpedition, fail: boolean) {
    const perches = this.spots.length ? this.spots : [this.focus];
    const birds = Array.from({ length: 14 }, (_, i) => ({ m: this.sAdd(s, new THREE.Mesh(wingGeo(0x3a3440), mats.body)), p: perches[i % perches.length], a: i * 1.3, ox: (Math.random() - 0.5) * 0.18, oz: (Math.random() - 0.5) * 0.18 }));
    return (dt: number) => {
      const off = fail ? 0 : s.pick === 0 ? 0.5 : s.pick === 1 ? 8 : Infinity, leave = fail || (s.pick >= 0 && s.after > off), fly = fail ? s.t : leave ? s.after - off : 0, land = fail ? 1 : Math.min(1, s.t / 2.5);
      for (const b of birds) {
        b.a += dt * 3;
        const p = s.pick === 2 ? perches[0] : b.p, gy = this.world.surfaceAt(p[0], p[1]);
        let x = p[0] + b.ox + Math.cos(b.a) * 0.7 * (1 - land), z = p[1] + b.oz + Math.sin(b.a) * 0.7 * (1 - land), y = gy + 0.2 + 1.2 * (1 - land) + Math.abs(Math.sin(this.t * 9 + b.a)) * 0.02 * land;
        if (leave) { x += Math.cos(b.a * 0.2) * fly * 1.2; z += Math.sin(b.a * 0.2) * fly * 1.2; y += fly * 1.1; }
        b.m.position.set(x, y, z);
        b.m.rotation.y = leave || land < 1 ? Math.atan2(-Math.sin(b.a), Math.cos(b.a)) : b.a;
        b.m.scale.set(1, leave || land < 1 ? 0.4 + Math.abs(Math.sin(this.t * 20 + b.a)) * 1.2 : 0.35, 1);
      }
      return leave ? fly < 3 : a.phase === 'work';
    };
  }

  /** L'essaim se réveille : un nuage d'abeilles autour de l'équipe ; la fumée l'endort, il se calme, ou il poursuit un membre */
  private stageSwarm(s: Staging, a: ActiveExpedition, fail: boolean) {
    const cloud = this.sAdd(s, new THREE.Group());
    for (let i = 0; i < 34; i++) {
      const ang = i * 2.39, r = 0.12 + (i % 5) * 0.08, b = new THREE.Mesh(ballGeo(0xf0c040), mats.body);
      b.scale.setScalar(0.75);
      b.position.set(Math.cos(ang) * r, 0.15 + Math.sin(i * 1.7) * 0.12, Math.sin(ang) * r);
      cloud.add(b);
    }
    const [tx, tz] = this.teamAt(a);
    cloud.position.set(tx, this.world.surfaceAt(tx, tz), tz);
    let pt = 0;
    return (dt: number) => {
      const calm = fail ? Math.max(0, s.t - 3) / 4 : s.pick === 0 ? s.after / 6 : s.pick === 1 ? s.after / 8 : s.pick === 2 ? Math.max(0, s.after - 3) / 4 : 0;
      const lead = this.agents.partyPositions(a.party)[0], chase = (fail || s.pick === 2) && lead;
      const [gx, gz] = chase ? [lead[0], lead[1]] : this.teamAt(a);
      cloud.position.x += (gx - cloud.position.x) * Math.min(1, dt * 2);
      cloud.position.z += (gz - cloud.position.z) * Math.min(1, dt * 2);
      cloud.position.y = this.world.surfaceAt(cloud.position.x, cloud.position.z);
      cloud.rotation.y += dt * (4 - Math.min(1, calm) * 3);
      cloud.scale.setScalar(Math.max(0.001, 1 - calm) * (1 + Math.sin(this.t * 7) * 0.08));
      // plus de fumée : un feu d'herbes humides qui fume fort
      if (s.pick === 0 && !fail && s.after < 6 && (pt -= dt) <= 0) { pt = 0.12; const [fx, fz] = this.focus; this.puffAt(fx + (Math.random() - 0.5) * 0.3, this.world.surfaceAt(fx, fz) + 0.1, fz + (Math.random() - 0.5) * 0.3, 'smoke'); }
      return calm < 1;
    };
  }

  /** Les cerfs descendent boire à la source ; on les regarde, ou ils détalent (une lance lancée, si l'on chasse) */
  private stageDeer(s: Staging, a: ActiveExpedition) {
    const [px, pz] = this.focus, a0 = Math.random() * Math.PI * 2;
    const herd = [0, 1, 2].map((i) => this.sBeast(s, 'deer', px + Math.sin(a0 + i * 0.4) * 1.6, pz + Math.cos(a0 + i * 0.4) * 1.6, i ? 0.9 : 1.15));
    let thrown = false;
    return (dt: number) => {
      const flee = s.pick === 1 || s.pick === 2 || (s.pick === 0 && s.after > 10), start = s.pick === 0 ? 10 : 0;
      herd.forEach((b, i) => {
        if (flee) { this.sFlee(b, px, pz, s.pick === 0 ? 0.5 : 1.6, dt); return; }
        // ils descendent boire au bord du bassin (par les roseaux et les pierres mouillées s'il le faut)
        const ang = a0 + (i - 1) * 0.5;
        this.sMove(b, px + Math.sin(ang) * 0.45, pz + Math.cos(ang) * 0.45, 0.45, dt, ['Idle_Eating', 'Eating'], true);
      });
      if (s.pick === 1 && !thrown) {
        thrown = true;
        const p = this.agents.partyPositions(a.party)[0], g = this.world.surfaceAt.bind(this.world);
        if (p) this.combat?.throw(new THREE.Vector3(p[0], g(p[0], p[1]) + 0.17, p[1]), new THREE.Vector3(herd[0].x, g(herd[0].x, herd[0].z) + 0.1, herd[0].z));
      }
      if (flee && s.after > start + 4) { for (const b of herd) b.obj.visible = false; return false; }
      return true;
    };
  }

  /** Une roue cassée : la roulotte des jongleurs penche, la roue est au sol ; une fois réparée, la roulotte se redresse */
  private stageWheel(s: Staging, a: ActiveExpedition) {
    const wg = this.wagon;
    if (!wg) return () => false;
    const [wx, wz] = [wg.position.x, wg.position.z], y0 = wg.position.y, wheel = this.sPut(s, wheelGeo(), wx + 0.24, wz + 0.2, 0.5);
    wg.rotation.order = 'YXZ';
    s.own.push({ dispose: () => { wg.rotation.x = 0; wg.position.y = y0; } });
    let sent = false;
    return (dt: number) => {
      const fixed = s.pick === 0 ? s.after > 6 : s.pick === 2 ? s.after > 9 : false;
      wg.rotation.x = fixed ? 0 : 0.2;
      wg.position.y = y0 - (fixed ? 0 : 0.03);
      wheel.visible = !fixed;
      if (s.pick === 0 && !sent && a.phase === 'work') { sent = true; a.party.forEach((id, i) => this.sendTo(a, id, wx + 0.18 + i * 0.12, wz + 0.26, wx, wz, 7)); }
      for (const g of this.guests) if (g.pose !== 'sit') g.pose = s.pick === 2 && !fixed ? 'work' : 'juggle';
      return fixed ? s.after < 11 : a.phase === 'work';
    };
  }

  /** La dégustation : trois chopes sur un tonnelet ; le frère lève la sienne (ou recopie sa recette) */
  private stageTasting(s: Staging, a: ActiveExpedition) {
    const mk = this.monk, [mx, mz] = mk ? [mk.folk.root.position.x, mk.folk.root.position.z] : this.focus;
    const [bx, bz] = this.near(mx - 0.18, mz + 0.2, mx, mz);
    this.sPut(s, mugsGeo(), bx, bz, 0);
    let scroll = false;
    return () => {
      if (mk) mk.pose = s.pick < 0 ? 'cheer' : s.pick === 2 && s.after < 6 ? 'work' : s.pick === 0 && s.after < 8 && Math.floor(this.t) % 2 ? 'cheer' : 'talk';
      if (s.pick === 2 && !scroll) { scroll = true; this.sPut(s, scrollGeo(), bx, bz, 0.4, 0.13); }
      if (s.pick === 0 && s.after < 8) this.agents.partyAct(a.party, Math.floor(s.after * 1.2) % 2 ? 'cheer' : 'sit');
      return a.phase === 'work';
    };
  }

  /** Un pneu crevé : la voiture penche dans un nuage de fumée, sa roue au sol ; repartie sur la jante, elle crache des étincelles */
  private stagePuncture(s: Staging) {
    const r = this.race;
    if (!r) return () => false;
    const car = r.obj, wheel = this.sPut(s, wheelGeo(), car.position.x + 0.16, car.position.z + 0.12, 0);
    s.own.push({ dispose: () => { car.rotation.z = 0; } });
    let pt = 0;
    return (dt: number) => {
      const flat = s.pick < 0 || s.after < (s.pick === 0 ? 6 : s.pick === 1 ? 2.5 : 1);
      car.rotation.z = flat ? 0.08 : 0;
      wheel.visible = flat && s.pick !== 2;
      if ((pt -= dt) <= 0) {
        pt = flat ? 0.25 : 0.06;
        const p = car.position;
        if (flat) this.puffAt(p.x, p.y + 0.06, p.z, 'smoke');
        else if (s.pick === 2) { const o = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), STAR); this.group.add(o); this.fx.push({ obj: o, t: 0, life: 0.4, kind: 'star', x: p.x, y: p.y + 0.06, z: p.z, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6 }); }
      }
      return flat || (s.pick === 2 && s.after < 7);
    };
  }

  /** Le coup de vent : la montgolfière tangue et dérive, des feuilles filent dans le vent */
  private stageGust(s: Staging) {
    let lt = 0;
    return (dt: number) => {
      const target = s.pick < 0 ? 1 : s.pick === 0 ? (s.after < 2 ? 0.7 : 0) : s.pick === 1 ? (s.after < 4 ? 0.5 : 0) : s.after < 6 ? 1.3 : 0;
      this.gustK += (target - this.gustK) * Math.min(1, dt * 1.5);
      const b = this.balloon;
      if (b && target > 0 && (lt -= dt) <= 0) { lt = 0.1; const o = b.obj.position, d = b.drift; this.leaf(o.x - Math.sin(d) * 1.2 + (Math.random() - 0.5), o.y + Math.random() * 0.8, o.z - Math.cos(d) * 1.2 + (Math.random() - 0.5), Math.sin(d) * 1.6, Math.cos(d) * 1.6); }
      return target > 0 || this.gustK > 0.02;
    };
  }

  /** Les nuages cachent le ciel : plus d'étoiles filantes tant qu'ils sont là ; l'éclaircie venue, ils s'en vont */
  private stageClouds(s: Staging) {
    const [cx, cz] = this.focus, cl = [0, 1, 2].map((i) => this.sCloud(s, cx + (i - 1) * 1.3, cz + (i % 2) * 0.7, 2.3 + i * 0.2, true, 1.3));
    s.own.push({ dispose: () => { this.cloudy = false; } });
    let drift = 0;
    return (dt: number) => {
      const clear = s.pick === 0 ? s.after > 6 : s.pick === 1 ? s.after > 12 : false;
      // on observe entre deux nuages : les étoiles reviennent par moments
      this.cloudy = !clear && !(s.pick === 1 && Math.sin(this.t * 0.8) > 0.3);
      if (clear) drift += dt;
      cl.forEach((c, i) => { c.position.x += dt * (clear ? 0.4 + drift * 0.3 : Math.sin(this.t * 0.2 + i) * 0.05); });
      return drift < 5;
    };
  }

  /** Des vaches sur le tracé : elles broutent devant la tête de voie, puis s'écartent (au coup de sifflet, elles détalent) */
  private stageCows(s: Staging, a: ActiveExpedition) {
    const wk = this.works;
    if (!wk) return () => false;
    const laid = this.built.filter((o) => o.visible).length, head = laid * 0.3 + 0.6, sx = Math.sin(wk.dir), sz = Math.cos(wk.dir), px = Math.cos(wk.dir), pz = -Math.sin(wk.dir);
    const cows = [0, 1, 2].map((i) => this.sBeast(s, 'cow', wk.x + sx * (head + i * 0.35) + px * (i - 1) * 0.14, wk.z + sz * (head + i * 0.35) + pz * (i - 1) * 0.14));
    let sent = false, blew = false;
    return (dt: number) => {
      const go = s.pick === 0 ? s.after > 6 : s.pick >= 0;
      cows.forEach((c, i) => {
        if (!go) { this.sMove(c, c.x, c.z, 0, dt, ['Idle_Eating', 'Eating']); return; }
        const side = i % 2 ? 1 : -1;
        this.sMove(c, c.x + px * side * 2, c.z + pz * side * 2, s.pick === 2 ? 1.2 : 0.35, dt, ['Idle_Eating'], true);
      });
      // le sifflet de la locomotive : un grand panache de vapeur
      if (s.pick === 2 && !blew) { blew = true; const o = wk.train.position; for (let i = 0; i < 8; i++) this.puffAt(o.x + sx * 0.1, o.y + 0.3 + i * 0.02, o.z + sz * 0.1, 'smoke', (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3); }
      if (s.pick === 1 && !sent) { sent = true; this.sendTo(a, a.party[0], cows[0].x - px * 0.3, cows[0].z - pz * 0.3, cows[0].x, cows[0].z, 6); }
      return !go || s.after < (s.pick === 0 ? 13 : 7);
    };
  }

  /** Vents violents au cosmodrome : de gros nuages noirs filent au-dessus du pas de tir ; on attend qu'ils passent, ou l'on part dessous */
  private stageWinds(s: Staging, a: ActiveExpedition) {
    const r = this.rocket, [px, pz] = r ? [r.x, r.z] : this.focus, H = r ? ROCKET_H[r.kind] : 2;
    const cl = [0, 1, 2, 3].map((i) => this.sCloud(s, px - 3 + i * 1.6, pz + (i % 2 ? 1 : -0.7), H + 1.2 + (i % 2) * 0.5, false, 2.2));
    return (dt: number) => {
      const pass = s.pick === 0 && s.after > 2;
      for (const c of cl) c.position.x += dt * (pass ? 1.4 : 0.3);
      return s.pick < 0 || (pass ? s.after < 8 : a.phase === 'work' && s.after < 14);
    };
  }

  /** Un voyant rouge clignote au pied de la fusée ; la panne trouvée, il passe au vert */
  private stageAlarm(s: Staging) {
    const r = this.rocket, x = r ? r.x + ROCKET_R[r.kind] + 0.35 : this.focus[0], z = r ? r.z + 0.2 : this.focus[1];
    this.sPut(s, stakeTorchGeo(), x, z, 0).scale.set(1, 1.4, 1);
    const lamp = this.sAdd(s, new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), RED));
    s.own.push(lamp.geometry);
    lamp.position.set(x, this.world.surfaceAt(x, z) + 0.37, z);
    return () => {
      const okT = s.pick === 0 ? 7 : s.pick === 1 ? 3 : Infinity, fixed = s.pick >= 0 && s.after > okT;
      lamp.material = fixed ? GREEN : RED;
      lamp.visible = fixed || Math.sin(this.t * 10) > -0.2;
      lamp.scale.setScalar(fixed ? 1 : 1 + Math.max(0, Math.sin(this.t * 10)) * 0.5);
      return fixed ? s.after < okT + 3 : s.pick < 0 || s.after < 14;
    };
  }

  /**
   * Le vieux mâle charge : trompe levée, il barrit face aux chasseurs (des rochers tout près d'eux). La décision prise, il
   * fonce : les chasseurs se sont jetés derrière les rochers (il passe en trombe là où ils se tenaient), l'attendent serrés,
   * lances pointées (il pile net devant eux), ou tiennent bon (il les frôle) ; puis il fait demi-tour, au pas
   */
  private stageTusks(s: Staging, a: ActiveExpedition) {
    const m = this.mam?.old;
    if (!m || !m.b.obj.visible) return () => false;
    const b = m.b, [tx, tz] = this.teamAt(a), d0 = Math.max(0.3, Math.hypot(tx - b.x, tz - b.z)), ux = (tx - b.x) / d0, uz = (tz - b.z) / d0, x0 = b.x, z0 = b.z;
    const [rx, rz] = this.near(tx - uz * 0.5 + ux * 0.15, tz + ux * 0.5 + uz * 0.15, tx, tz);
    this.sPut(s, rocksGeo(), rx, rz, 0.7).scale.setScalar(1.8);
    // l'abri : derrière les rochers, vus du vieux mâle
    const rd = Math.max(0.3, Math.hypot(rx - x0, rz - z0)), hx = rx + ((rx - x0) / rd) * 0.28, hz = rz + ((rz - z0) / rd) * 0.28;
    b.held = true;
    this.sFace(b, tx, tz);
    s.own.push({ dispose: () => { b.held = false; } });
    // où il fonce : à travers la place qu'on a quittée, jusque devant le hérisson, ou en frôlant ceux qui tiennent bon
    const goal = (p: number): [number, number] => (p === 0 ? [tx + ux * 0.6, tz + uz * 0.6] : p === 1 ? [tx - ux * 0.5, tz - uz * 0.5] : [tx + ux * 0.5 - uz * 0.26, tz + uz * 0.5 + ux * 0.26]);
    let sent = false;
    return (dt: number) => {
      if (s.pick < 0) { m.trumpet = 1; this.sMove(b, b.x, b.z, 0, dt); return true; }
      if (!sent && a.phase === 'work') {
        sent = true;
        a.party.forEach((id, i) => {
          if (s.pick === 0) this.sendTo(a, id, hx + (i - 1) * 0.1 * uz, hz - (i - 1) * 0.1 * ux, rx, rz, 6);
          else if (s.pick === 1) { const ang = Math.atan2(-ux, -uz) + (i - (a.party.length - 1) / 2) * 0.5; this.sendTo(a, id, tx + Math.sin(ang) * 0.16, tz + Math.cos(ang) * 0.16, b.x, b.z, 6); }
        });
      }
      if (s.after < 0.7) { m.trumpet = 1; this.sMove(b, b.x, b.z, 0, dt); return true; }
      if (s.after < 4.5) {
        const [gx, gz] = goal(s.pick);
        if (this.sMove(b, gx, gz, 1.1, dt, [], true) && Math.random() < dt * 12) this.puffAt(b.x, this.world.surfaceAt(b.x, b.z) + 0.02, b.z);
        return true;
      }
      // demi-tour : il rejoint la harde, au pas, et l'imprévu le rend à la chasse
      if (s.after < 10 && this.sMove(b, x0, z0, 0.3, dt, [], true)) return true;
      b.held = false;
      return false;
    };
  }

  /**
   * La tempête de neige : les flocons tombent dru, une brume blanche avale le paysage et la harde. À l'abri, l'équipe se serre
   * autour du feu du camp, et la tempête passe ; si l'on suit les traces, elle dure encore un peu. À l'échec, la harde s'y
   * évanouit
   */
  private stageBlizzard(s: Staging, a: ActiveExpedition, fail: boolean) {
    const [tx, tz] = this.teamAt(a), cx = (tx + this.focus[0]) / 2, cz = (tz + this.focus[1]) / 2, [fx, fz] = a.dest;
    const snow = this.sSnow(s, cx, cz, 3, 2.4), fog = this.sFog(s, cx, cz, 2.6), gloom = this.sGloom(s, cx, cz, 3.4);
    if (fail) for (const m of this.mammoths) m.b.flee ??= Math.atan2(m.b.x - tx, m.b.z - tz);
    let k = 0.8, sent = false;
    return (dt: number) => {
      const thick = fail ? s.t < 9 : s.pick < 0 || (s.pick === 0 ? s.after < 8 : a.phase === 'work' && s.after < 14);
      k = thick ? Math.min(1, k + dt * 0.6) : k - dt * 0.25;
      const kk = Math.max(0, k);
      snow(dt, kk); fog(dt, kk * 0.9); gloom(kk * 0.35);
      // à l'abri : tout le monde se serre autour du feu du camp, assis sous les peaux
      if (s.pick === 0 && a.phase === 'work') {
        if (!sent) { sent = true; a.party.forEach((id, i) => { const ang = (i / a.party.length) * Math.PI * 2; this.sendTo(a, id, fx + Math.sin(ang) * 0.24, fz + Math.cos(ang) * 0.24, fx, fz, 8); }); }
        if (s.after > 2 && s.after < 8) this.agents.partyAct(a.party, 'sit');
      }
      return k > 0;
    };
  }

  // ---------------- Les échecs, joués au départ de l'équipe ----------------
  /** La pirogue chavire dans les rapides : elle se retourne dans une gerbe d'écume, et reste à flotter là, la quille en l'air */
  private stageCapsize(s: Staging) {
    const bt = this.boat;
    if (!bt) return () => false;
    return (dt: number) => {
      const k = smooth(Math.min(1, s.t / 1.2)), o = bt.obj;
      o.rotation.z = k * Math.PI * 0.95;
      o.position.y = bt.y - k * 0.03 + Math.sin(this.t * 2) * 0.005;
      if (s.t < 1.6 && Math.random() < dt * 14) this.puffAt(o.position.x + (Math.random() - 0.5) * 0.3, bt.y + 0.01, o.position.z + (Math.random() - 0.5) * 0.3);
      return s.t < 2;
    };
  }

  /** La harde s'enfuit au galop, de tous côtés */
  private stageScatter(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a);
    for (const b of this.beasts) b.flee = Math.atan2(b.x - tx, b.z - tz) + (Math.random() - 0.5) * 0.6;
    return () => s.t < 1;
  }

  /** Une bête charge l'équipe (le sanglier qui force l'enclos, l'aurochs), puis s'en va */
  private stageCharge(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), b = [...this.beasts].sort((p, q) => Math.hypot(p.x - tx, p.z - tz) - Math.hypot(q.x - tx, q.z - tz))[0];
    if (!b) return () => false;
    b.held = true;
    return (dt: number) => {
      if (s.t < 1.4) this.sMove(b, tx, tz, 1.7, dt, ['Headbutt', 'Idle'], true);
      else if (s.t < 2) this.sMove(b, b.x, b.z, 0, dt, ['Headbutt']);
      else { b.held = false; b.flee = Math.atan2(b.x - tx, b.z - tz); return false; }
      return true;
    };
  }

  /** Le coup de grisou : une flamme jaillit de la grotte dans un nuage de fumée noire */
  private stageBlast(s: Staging) {
    const [mx, mz] = this.mouth?.at ?? this.focus, y = this.world.surfaceAt(mx, mz);
    const f = this.sFlame(s, mx, mz, 3.5);
    for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; this.puffAt(mx, y + 0.1 + (i % 3) * 0.05, mz, 'smoke', Math.cos(ang) * 0.35, Math.sin(ang) * 0.35); }
    this.torchTo = 0;
    return () => { f.scale.multiplyScalar(0.94); return s.t < 1.5; };
  }

  /** Les jongleurs s'en vont sur la route, leur roulotte avec eux */
  private stageGone(s: Staging) {
    const walkers = [...this.guests], wg = this.wagon, ang = wg ? Math.atan2(wg.position.x - this.focus[0], wg.position.z - this.focus[1]) : 0;
    for (const j of this.jugglers) for (const b of j.balls) b.visible = false;
    this.jugglers = [];
    return (dt: number) => {
      const step = dt * 0.35, dx = Math.sin(ang) * step, dz = Math.cos(ang) * step;
      for (const g of walkers) { const o = g.folk.root; o.position.x += dx; o.position.z += dz; o.position.y = this.world.surfaceAt(o.position.x, o.position.z); o.rotation.y = ang; g.pose = 'walk'; }
      if (wg) { wg.position.x += dx; wg.position.z += dz; wg.position.y = this.world.surfaceAt(wg.position.x, wg.position.z); }
      return s.t < 20;
    };
  }

  /** Les torches de fortune des explorateurs : une flamme au poing de chacun (ceux qui ont emporté une vraie torche la tiennent déjà) */
  private stepTorches(dt: number, a: ActiveExpedition) {
    if (!this.lit) return;
    // allumées dès l'arrivée, sur place seulement (l'imprévu les fait baisser ou flamber) ; on les éteint en repartant
    if (a.phase === 'work' && !this.kindled) { this.kindled = true; this.torchK = this.torchTo; }
    const to = a.phase === 'work' ? this.torchTo : 0;
    this.torchK += Math.sign(to - this.torchK) * Math.min(Math.abs(to - this.torchK), dt * 0.9);
    const real = a.gear.torch ?? 0;
    a.party.forEach((id, i) => {
      if (a.party.length - 1 - i < real) return;
      const p = this.agents.partyPositions([id])[0];
      let t = this.torches.get(id);
      if (!t) {
        t = new THREE.Group();
        t.add(new THREE.Mesh(handTorchGeo(), mats.body));
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 5).translate(0, 0.025, 0), FLAME);
        f.add(new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 5).translate(0, 0.015, 0), FLAME_IN));
        f.position.y = 0.075;
        t.add(f);
        this.group.add(t); this.props.push(t); this.torches.set(id, t);
      }
      t.visible = !!p && this.torchK > 0.02;
      if (!p) return;
      const [x, z, h] = p, fl = this.torchK * (1 + Math.sin(this.t * 19 + id) * 0.15);
      t.position.set(x + Math.cos(h) * 0.055 + Math.sin(h) * 0.03, this.world.surfaceAt(x, z) + 0.1, z - Math.sin(h) * 0.055 + Math.cos(h) * 0.03);
      t.children[1].scale.set(Math.max(0.001, fl), Math.max(0.001, fl * (1.1 + Math.sin(this.t * 13 + id) * 0.2)), Math.max(0.001, fl));
      // une torche qui s'éteint fume un peu
      if (to < 0.05 && this.torchK > 0.1 && Math.random() < dt * 4) this.puffAt(t.position.x, t.position.y + 0.1, t.position.z, 'smoke');
    });
  }

  // ---------------- L'équipe repartie, le décor s'efface ----------------
  /** L'équipe est assez loin : le décor rétrécit en s'enfonçant un peu, puis disparaît (voir `gone`) */
  leave() {
    if (this.fade >= 0) return;
    this.fade = 0;
    const all = new Set<THREE.Object3D>([...this.props, ...this.npcs.map((n) => n.folk.root), ...this.beasts.map((b) => b.obj), ...this.dogs.map((b) => b.obj), ...this.stagings.flatMap((s) => s.objs), ...this.fx.map((f) => f.obj)]);
    this.fadeObjs = [];
    for (const o of all) { if (o.userData.flat) o.visible = false; else { o.userData.s0 = o.scale.clone(); this.fadeObjs.push({ o, y: o.position.y }); } }
  }
  /** Le décor a fini de s'effacer : on peut le ranger */
  get gone() { return this.fade >= FADE; }
  private stepFade(dt: number) {
    this.fade += dt;
    const k = smooth(Math.min(1, this.fade / FADE));
    for (const f of this.fadeObjs) { f.o.scale.copy(f.o.userData.s0).multiplyScalar(Math.max(0.001, 1 - k)); f.o.position.y = f.y - k * 0.08; }
  }

  // ---------------- Mise en place ----------------
  private free(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz) && !w.decor[w.ci(cx, cz)];
  }

  /** Le point voulu s'il est libre, sinon un point libre plus près du centre */
  /** Direction (unitaire) où le terrain monte le plus autour d'un point : vers la paroi ou le haut de la pente */
  private uphill(cx: number, cz: number): [number, number] {
    let best = -Infinity, dir: [number, number] = [1, 0];
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
      const up = this.world.hAt(cx + dx * 1.2, cz + dz * 1.2) + this.world.hAt(cx + dx * 2.2, cz + dz * 2.2) * 0.5;
      if (up > best) { best = up; dir = [dx, dz]; }
    }
    return dir;
  }

  /** Le centre de la clairière la plus proche (hors forêt, hors de tout) : un cercle de rayon `ring` y tient dégagé */
  private clearing(cx: number, cz: number, ring: number): [number, number] {
    const w = this.world, open = (x: number, z: number) => this.free(x, z) && w.veg[w.ci(Math.floor(x), Math.floor(z))] !== VEG_FOREST;
    let best: [number, number] = [cx, cz], score = -Infinity;
    for (let r = 0; r <= 2.5; r += 0.5) for (let j = 0; j < (r ? 8 : 1); j++) {
      const px = cx + Math.cos(j * 0.785) * r, pz = cz + Math.sin(j * 0.785) * r;
      let m = (open(px, pz) ? 2 : 0) - r * 0.6;
      for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; if (open(px + Math.cos(ang) * ring, pz + Math.sin(ang) * ring)) m++; }
      if (m > score) { score = m; best = [px, pz]; }
    }
    return best;
  }

  /** Le point libre le plus haut entre `min` et `r` de (cx, cz) : le sommet où planter le drapeau */
  private peak(cx: number, cz: number, r: number, min: number): [number, number] {
    let best: [number, number] = this.near(cx + min, cz, cx, cz), h = -Infinity;
    for (let dz = -r; dz <= r; dz += 0.25) for (let dx = -r; dx <= r; dx += 0.25) {
      const d = Math.hypot(dx, dz), x = cx + dx, z = cz + dz;
      if (d > r || d < min || !this.free(x, z)) continue;
      const y = this.world.hAt(x, z) - d * 0.03;
      if (y > h) { h = y; best = [x, z]; }
    }
    return best;
  }

  private near(x: number, z: number, cx: number, cz: number): [number, number] {
    for (let k = 1; k >= 0; k -= 0.25) { const px = cx + (x - cx) * k, pz = cz + (z - cz) * k; if (this.free(px, pz)) return [px, pz]; }
    return [cx, cz];
  }

  private put(g: THREE.BufferGeometry, x: number, z: number, ry: number) {
    const m = new THREE.Mesh(g, mats.body);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, this.world.surfaceAt(x, z), z);
    m.rotation.y = ry;
    this.group.add(m);
    this.props.push(m);
    return m;
  }

  /** Tente et feu de camp ; l'équipe s'assied autour */
  private camp(cx: number, cz: number) {
    const [tx, tz] = this.near(cx + 0.7, cz - 0.35, cx, cz);
    this.put(tentGeo(), tx, tz, Math.atan2(cx - tx, cz - tz) + Math.PI / 2);
    const fire = this.put(fireGeo(), cx, cz, 0);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5).translate(0, 0.065, 0), FLAME);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5).translate(0, 0.04, 0), FLAME_IN);
    this.flame.add(inner);
    this.flame.position.y = 0.015;
    fire.add(this.flame);
  }

  private addBeast(k: HerdKind | 'wolf', cx: number, cz: number, r: number, ang: number) {
    const [name, len] = ANIMAL[k];
    const actor = hasModel(name) ? makeActor(name, len) : null;
    const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * 0.5, 0), mats.body);
    if (actor) actor.mixer.setTime(ang);
    const [x, z] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, cx, cz);
    this.group.add(obj);
    this.beasts.push({ obj, actor, x, z, tx: x, tz: z, heading: ang, wait: 1 + ang, speed: k === 'wolf' ? 0.55 : 0.16, kind: k });
  }

  /** L'eau la plus proche : un point assez profond pour une barque, et le dernier point sec avant lui */
  private findWater(cx: number, cz: number) {
    const w = this.world;
    let best: { wet: [number, number]; bank: [number, number]; level: number } | null = null, bd = 1e9;
    for (let dz = -3.5; dz <= 3.5; dz += 0.25)
      for (let dx = -3.5; dx <= 3.5; dx += 0.25) {
        const x = cx + dx, z = cz + dz, d = Math.hypot(dx, dz), level = this.depth(x, z);
        if (level === null || d >= bd) continue;
        // dernier point sec sur la ligne du centre à l'eau
        let bank: [number, number] = [cx, cz];
        for (let k = 0; k <= 1; k += 0.05) { const px = cx + dx * k, pz = cz + dz * k; if (this.depth(px, pz) === null && this.free(px, pz)) bank = [px, pz]; else if (k > 0.2) break; }
        bd = d; best = { wet: [x, z], bank, level };
      }
    return best;
  }

  /** Niveau de l'eau en (x, z) s'il y a assez de fond pour une barque, sinon null */
  private depth(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    if (!w.inCells(cx, cz)) return null;
    const k = w.ci(cx, cz), level = w.lake[k] ? w.lakeLevel[k] : SEA;
    if (!w.lake[k] && !w.isWet(cx, cz)) return null;
    return level - w.hAt(x, z) > 0.07 ? level : null;
  }

  /** Points de berge, face à l'eau, pour les pêcheurs à la ligne */
  private bankSpots(n: number) {
    const wat = this.water!, out: [number, number][] = [];
    const [bx, bz] = wat.bank, [wx, wz] = wat.wet, ang = Math.atan2(wz - bz, wx - bx);
    for (let i = 0; i < n * 3 && out.length < n; i++) {
      const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.32, x = bx - Math.sin(ang) * off, z = bz + Math.cos(ang) * off;
      if (this.free(x, z)) out.push([x, z]);
    }
    return out.length ? out : [wat.bank];
  }

  /** La barque, amarrée au bord de l'eau ; deux membres y montent, les autres pêchent depuis la berge */
  private launch(a: ActiveExpedition) {
    const wat = this.water!, [wx, wz] = wat.wet, [bx, bz] = wat.bank;
    const dx = wx - bx, dz = wz - bz, d = Math.max(0.01, Math.hypot(dx, dz));
    let out: [number, number] = [wx, wz];
    for (let k = 0.4; k <= 2; k += 0.2) { const x = wx + (dx / d) * k, z = wz + (dz / d) * k; if (this.depth(x, z) === null) break; out = [x, z]; }
    const obj = new THREE.Group();
    const hull = new THREE.Mesh(boatGeo(), mats.body);
    hull.castShadow = true;
    obj.add(hull);
    this.group.add(obj);
    this.props.push(obj);
    const riders = a.party.slice(0, Math.min(2, a.party.length));
    this.boat = { obj, home: [wx, wz], out, y: wat.level, riders };
    this.spots = this.bankSpots(Math.max(1, a.party.length - riders.length));
  }

  // ---------------- Animation ----------------
  update(dt: number, a: ActiveExpedition) {
    this.t += dt;
    // l'équipe repartie, le décor s'efface
    if (this.fade >= 0) { this.stepFade(dt); return; }
    // avant l'arrivée de l'équipe, le décor est déjà là et vit (bêtes, flammes, voisins) ; le travail n'a pas commencé
    const onSite = a.phase === 'work';
    const k = onSite ? Math.min(1, a.t / Math.max(1, a.c.work + a.extra)) : 0;
    if (this.flame) { const f = 1 + Math.sin(this.t * 17) * 0.12 + Math.sin(this.t * 29) * 0.08; this.flame.scale.set(f, 1.1 + Math.sin(this.t * 13) * 0.2, f); }
    if (this.mam) this.stepMammothHunt(dt, a, k);
    else if (this.kind === 'hunt' && (onSite || a.phase === 'back')) this.stepHunt(dt, a);
    else for (const b of this.beasts) this.stepBeast(b, dt, a);
    if (this.boat && onSite) this.stepBoat();
    if (this.balloon) this.stepBalloon(k, onSite);
    if (this.works) this.stepWorks(dt, a);
    if (this.race) this.stepRace(k, dt, onSite);
    if (this.rocket) this.stepRocket(k, dt, onSite);
    // ouvrages qui avancent avec le travail, panier qui se remplit
    this.built.forEach((o, i) => (o.visible = k * this.built.length > i));
    if (this.basket) this.basket.scale.setScalar(Math.max(0.001, k));
    for (const s of this.spins) {
      if (s.speed) s.obj.rotation.y += dt * s.speed;
      else { const f = 1 + Math.sin(this.t * 17 + s.obj.position.x * 9) * 0.12; s.obj.scale.set(f, 1.1 + Math.sin(this.t * 13 + s.obj.position.z * 7) * 0.2, f); }
    }
    for (const g of this.grows) g.obj.scale.setScalar(Math.max(0.001, g.from + (g.to - g.from) * k));
    for (const n of this.npcs) folkStep(n.folk, this.t * 1.6 + n.off, n.pose);
    for (const j of this.jugglers) j.balls.forEach((b, i) => {
      const ph = this.t * 4.2 + i * 2.094, side = Math.cos(ph) * 0.06, fx = Math.sin(j.face), fz = Math.cos(j.face);
      b.position.set(j.x + fx * 0.07 + fz * side, j.y + 0.3 + Math.abs(Math.sin(ph)) * 0.16, j.z + fz * 0.07 - fx * side);
    });
    if (this.cartRun) {
      // le wagonnet sort de la galerie, vide son chargement au tas, y retourne
      const u = 0.5 - Math.cos(this.t * 0.45) * 0.5, c = this.cartRun, x = c.a[0] + (c.b[0] - c.a[0]) * u, z = c.a[1] + (c.b[1] - c.a[1]) * u;
      c.obj.position.set(x, this.world.surfaceAt(x, z), z);
    }
    if (onSite && !a.wait) this.stepMembers(dt, a, k);
    // les pêcheurs repartis, leurs cannes s'en vont avec eux
    if (onSite) this.stepRods(a);
    else for (const r of this.rods.values()) r.rod.visible = r.bob.visible = r.line.visible = false;
    this.stepStagings(dt, a);
    // (les mammouths une fois menés, par la chasse ou par un imprévu : leurs pattes suivent leur pas)
    if (this.mammoths.length) this.stepMammoths(dt);
    this.stepTorches(dt, a);
    this.stepFx(dt, a);
  }

  /**
   * Au retour d'une expédition réussie, les bêtes qu'elle ramène quittent la harde pour suivre l'équipe (voir ExpeditionView) :
   * une bête de la harde par bête ramenée, de la même espèce. D'où chacune part (x, z, cap), ou null s'il n'y en avait pas
   * sur place
   */
  handOver(what: HerdKind[]): ([number, number, number] | null)[] {
    return what.map((k) => {
      const b = this.beasts.find((x) => x.kind === k && x.obj.visible && x.flee === undefined && !x.held);
      if (!b) return null;
      b.actor?.mixer.stopAllAction();
      this.group.remove(b.obj);
      this.beasts.splice(this.beasts.indexOf(b), 1);
      return [b.x, b.z, b.heading];
    });
  }

  private stepBeast(b: Beast, dt: number, a: ActiveExpedition) {
    // un imprévu la mène (elle charge) ; ou elle s'enfuit au galop, et disparaît au loin
    if (b.held) return;
    if (b.flee !== undefined) {
      if (!b.obj.visible) return;
      b.fled = (b.fled ?? 0) + dt;
      this.sMove(b, b.x + Math.sin(b.flee) * 2, b.z + Math.cos(b.flee) * 2, 1.4, dt, ['Idle'], true);
      if (b.fled > 4) b.obj.visible = false;
      return;
    }
    const w = this.world, [cx, cz] = a.dest, pos = this.agents.partyPositions(a.party);
    // un membre tout près : la bête s'arrête et se laisse approcher (le loup, lui, détale)
    const close = pos.find(([x, z]) => Math.hypot(x - b.x, z - b.z) < 0.45);
    const wolf = b.speed > 0.3;
    if (close && wolf) {
      const ang = Math.atan2(b.x - close[0], b.z - close[1]) + (Math.random() - 0.5);
      [b.tx, b.tz] = this.near(b.x + Math.sin(ang) * 1.6, b.z + Math.cos(ang) * 1.6, cx, cz);
      b.wait = 0;
    }
    let moving = false;
    if (close && !wolf) {
      b.heading = Math.atan2(close[0] - b.x, close[1] - b.z);
      b.tx = b.x; b.tz = b.z;
    } else {
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.03) {
        const s = Math.min(d, b.speed * dt);
        const nx = b.x + (dx / d) * s, nz = b.z + (dz / d) * s;
        if (this.free(nx, nz)) { b.x = nx; b.z = nz; b.heading = Math.atan2(dx, dz); moving = true; } else { b.tx = b.x; b.tz = b.z; }
      } else if ((b.wait -= dt) <= 0) {
        b.wait = wolf ? 1 + Math.random() * 2 : 2.5 + Math.random() * 4;
        const r = wolf ? 1.8 + Math.random() * 1.2 : 0.5 + Math.random() * 1.3, ang = Math.random() * Math.PI * 2;
        [b.tx, b.tz] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, cx, cz);
        const k = a.phase === 'work' ? Math.min(1, a.t / Math.max(1, a.c.work + a.extra)) : 0;
        if (this.salts.length && Math.random() < 0.7) { const s = this.salts[Math.floor(Math.random() * this.salts.length)]; [b.tx, b.tz] = [s[0] + Math.cos(ang) * 0.12, s[1] + Math.sin(ang) * 0.12]; }
        if (this.corral && k > 0.45) [b.tx, b.tz] = [this.corral[0] + Math.cos(ang) * 0.3 * Math.random(), this.corral[1] + Math.sin(ang) * 0.3 * Math.random()];
      }
    }
    b.obj.position.set(b.x, w.surfaceAt(b.x, b.z), b.z);
    b.obj.rotation.y = b.heading;
    if (b.actor) {
      play(b.actor, moving ? (wolf ? ['Gallop', 'Run', 'Walk'] : ['Walk', 'WalkSlow', 'Idle']) : close ? ['Idle', 'Idle_Eating'] : ['Idle_Eating', 'Eating', 'Idle']);
      b.actor.mixer.update(dt);
    }
  }

  /**
   * La chasse au loup : il rôde autour des chasseurs, fonce sur l'un d'eux, mord (la lame pare, ou la morsure porte), recule
   * et recommence ; les chasseurs lui lancent leurs lances (celles qui portent le font tressaillir), les chiens le harcèlent.
   * Au retour, l'issue : il détale loin dans la forêt, ou il tient tête et mord encore
   */
  private stepHunt(dt: number, a: ActiveExpedition) {
    const b = this.beasts[0];
    if (!b) return;
    const w = this.world, h = this.hunt, [cx, cz] = a.dest, pos = this.agents.partyPositions(a.party), g = (x: number, z: number) => w.surfaceAt(x, z);
    h.t -= dt; h.flinch = Math.max(0, h.flinch - dt);
    if (a.phase === 'back' && h.mode !== 'flee' && h.mode !== 'stand') {
      h.mode = a.ok ? 'flee' : 'stand'; h.t = a.ok ? 6 : 2; h.ang = Math.atan2(b.x - cx, b.z - cz);
      const p = pos[0];
      if (!a.ok && p) this.combat?.hit(p[0], g(p[0], p[1]) + 0.13, p[1], 0xff5a4a, 14, 'bite');
    }
    let tx = b.x, tz = b.z, speed = 0, anim = ['Idle'];
    if (h.mode === 'prowl') {
      h.ang += dt * 0.55;
      tx = cx + Math.sin(h.ang) * 1.5; tz = cz + Math.cos(h.ang) * 1.5; speed = 0.75; anim = ['Walk', 'Run'];
      if (h.t <= 0 && pos.length) { h.mode = 'charge'; h.target = Math.floor(Math.random() * pos.length); h.t = 3; }
    } else if (h.mode === 'charge') {
      const p = pos[h.target % Math.max(1, pos.length)];
      if (p) { tx = p[0]; tz = p[1]; }
      speed = 1.6; anim = ['Run'];
      if (p && Math.hypot(p[0] - b.x, p[1] - b.z) < 0.26) {
        h.mode = 'bite'; h.t = 0.8;
        const bite = Math.random() < 0.35;
        this.combat?.hit((p[0] + b.x) / 2, g(p[0], p[1]) + 0.13, (p[1] + b.z) / 2, bite ? 0xff5a4a : 0xf2f4ff, bite ? 12 : 9, bite ? 'bite' : 'blade');
      } else if (h.t <= 0) { h.mode = 'back'; h.t = 2; }
    } else if (h.mode === 'bite') {
      anim = ['Headbutt'];
      const p = pos[h.target % Math.max(1, pos.length)];
      if (p) b.heading = Math.atan2(p[0] - b.x, p[1] - b.z);
      if (h.t <= 0) { h.mode = 'back'; h.t = 2.5; }
    } else if (h.mode === 'back') {
      const ang = Math.atan2(b.x - cx, b.z - cz);
      tx = cx + Math.sin(ang) * 1.8; tz = cz + Math.cos(ang) * 1.8; speed = 1.3; anim = ['Run'];
      if (Math.hypot(tx - b.x, tz - b.z) < 0.1 || h.t <= 0) { h.mode = 'prowl'; h.ang = ang; h.t = 3 + Math.random() * 2.5; }
    } else if (h.mode === 'flee') {
      tx = cx + Math.sin(h.ang) * 9; tz = cz + Math.cos(h.ang) * 9; speed = 2.4; anim = ['Run'];
      if (h.t <= 0) b.obj.visible = false;
    } else {
      // il tient tête : il gronde face aux chasseurs qui s'en vont
      const p = pos[0];
      if (p) b.heading = Math.atan2(p[0] - b.x, p[1] - b.z);
      anim = h.t > 1.2 ? ['Headbutt'] : ['Idle'];
    }
    if (h.flinch > 0) { speed *= 0.25; anim = ['Jump_Start', 'Idle']; }
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (speed > 0 && d > 0.02) {
      const st = Math.min(d, speed * dt), nx = b.x + (dx / d) * st, nz = b.z + (dz / d) * st;
      if (this.free(nx, nz) || h.mode === 'flee') { b.x = nx; b.z = nz; }
      else if (h.mode === 'prowl') h.ang += 0.6;
      b.heading = Math.atan2(dx, dz);
    }
    b.obj.position.set(b.x, g(b.x, b.z), b.z);
    b.obj.rotation.y = b.heading;
    if (b.actor) { play(b.actor, anim); b.actor.mixer.update(dt); }
    // les lances des chasseurs, lancées en avant du loup qui court
    if (a.phase === 'work' && h.mode !== 'bite')
      a.party.forEach((id, i) => {
        const p = pos[i];
        if (!p) return;
        let t = (this.spearT.get(id) ?? 1.2 + i * 0.9) - dt;
        if (t <= 0 && Math.hypot(p[0] - b.x, p[1] - b.z) < 2.8) {
          t = 2.4 + Math.random() * 1.6;
          const lx = b.x + (tx - b.x) * 0.25, lz = b.z + (tz - b.z) * 0.25;
          const to = new THREE.Vector3(lx + (Math.random() - 0.5) * 0.3, g(lx, lz) + 0.04, lz + (Math.random() - 0.5) * 0.3);
          this.combat?.throw(new THREE.Vector3(p[0], g(p[0], p[1]) + 0.17, p[1]), to, () => {
            if (Math.hypot(b.x - to.x, b.z - to.z) < 0.32) { this.combat?.hit(b.x, g(b.x, b.z) + 0.12, b.z, 0xffd27a, 12); h.flinch = 0.4; }
          });
          this.agents.partyAct([id], 'work');
        }
        this.spearT.set(id, t);
      });
    // les chiens harcèlent le loup, de part et d'autre ; il détale, ils le poursuivent un peu puis reviennent aux chasseurs
    this.dogs.forEach((dg, i) => {
      dg.obj.visible = true;
      const away = h.mode === 'flee' && h.t < 4.5;
      const side = i ? 1 : -1, back = b.heading + Math.PI + side * 0.8;
      const gx = away ? cx + side * 0.25 : b.x + Math.sin(back) * 0.38, gz = away ? cz + 0.2 : b.z + Math.cos(back) * 0.38;
      const ddx = gx - dg.x, ddz = gz - dg.z, dd = Math.hypot(ddx, ddz);
      let moving = false;
      if (dd > 0.06) { const st = Math.min(dd, dg.speed * dt); dg.x += (ddx / dd) * st; dg.z += (ddz / dd) * st; dg.heading = Math.atan2(ddx, ddz); moving = true; }
      else dg.heading = Math.atan2(b.x - dg.x, b.z - dg.z);
      dg.obj.position.set(dg.x, g(dg.x, dg.z), dg.z);
      dg.obj.rotation.y = dg.heading;
      if (dg.actor) { play(dg.actor, moving ? ['Run'] : Math.sin(this.t * 3 + i) > 0.6 ? ['Jump_Start', 'Idle'] : ['Idle']); dg.actor.mixer.update(dt); }
    });
  }

  /**
   * La chasse au mammouth, selon l'avancement : la harde paît pendant qu'on prépare la chasse (les fosses creusées puis
   * couvertes, les rabatteurs postés derrière elle, les guetteurs tapis) ; puis l'on pousse le vieux mâle vers le piège, ou on
   * l'encercle, et les autres s'écartent. Au retour, l'issue : il tombe dans la fosse, reste coincé au fond du ravin ou se
   * couche, épuisé ; à l'échec, la harde s'éloigne (un imprévu la mène d'abord : elle se disperse, le vieux mâle charge…)
   */
  private stepMammothHunt(dt: number, a: ActiveExpedition, k: number) {
    const h = this.mam!, old = h.old, away = a.phase === 'back' || a.phase === 'home', [cx, cz] = a.dest;
    const K = (h.k = Math.max(h.k, k)), sx = Math.sin(h.dir), sz = Math.cos(h.dir), chase = K >= 0.3 || away;
    if (away) h.back += dt;
    // les fosses se creusent au début du travail, puis on les couvre de branchages ; celle où tombe le vieux mâle cède
    h.pits.forEach((p, i) => { p.scale.setScalar(Math.max(0.001, smooth(Math.min(1, K / 0.22)))); h.covers[i].visible = K > 0.24 && !(i === 0 && old.sink > 0.01); });
    for (const m of this.mammoths) {
      const b = m.b;
      if (b.held || !b.obj.visible) continue;
      if (b.flee !== undefined) {
        b.fled = (b.fled ?? 0) + dt;
        this.sMove(b, b.x + Math.sin(b.flee) * 2, b.z + Math.cos(b.flee) * 2, 0.6 + m.size * 0.2, dt, [], true);
        if (b.fled > 7) b.obj.visible = false;
        continue;
      }
      // l'échec : ce qu'il reste de la harde s'éloigne de l'équipe qui repart
      if (away && !a.ok && h.back > 0.8) { const [tx, tz] = this.teamAt(a); b.flee = Math.atan2(b.x - tx, b.z - tz) + (m.size - 1) * 0.5; continue; }
      if (m === old && chase) { this.stepOldMale(dt, a, away); continue; }
      // les autres paissent, chacun de son côté ; la chasse lancée, ils s'écartent plus loin (suivie de loin, la harde prend de
      // l'avance)
      const far = chase ? (h.way === 'follow' ? 2.4 : 1.4) : 0, side = (this.mammoths.indexOf(m) - 1) * 0.55;
      this.graze(m, [h.at[0] + sx * far + sz * side, h.at[1] + sz * far - sx * side], chase ? 0.4 : 0.5, chase ? 0.3 : 0.1, dt, cx, cz);
    }
    // ils ne se marchent pas dessus : deux mammouths trop proches s'écartent (pas celui qui est pris, ni celui qu'un imprévu mène)
    const ms = this.mammoths;
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const p = ms[i].b, q = ms[j].b, d = Math.hypot(q.x - p.x, q.z - p.z), min = 0.26 * (ms[i].size + ms[j].size);
      if (d >= min || !p.obj.visible || !q.obj.visible) continue;
      const ux = d > 1e-3 ? (q.x - p.x) / d : 1, uz = d > 1e-3 ? (q.z - p.z) / d : 0, push = (min - d) * 0.5 * Math.min(1, dt * 4);
      for (const [mm, s] of [[ms[i], -1], [ms[j], 1]] as [Mammoth, number][]) {
        const b = mm.b, nx = b.x + ux * push * s, nz = b.z + uz * push * s;
        if (!b.held && !mm.lie && !mm.sink && this.free(nx, nz)) { b.x = nx; b.z = nz; }
      }
    }
    // la caméra garde le camp et le vieux mâle dans le cadre
    this.focus = [(cx + old.b.x) / 2, (cz + old.b.z) / 2];
    if (a.phase === 'work' && !a.wait && K >= 0.4) this.throwSpears(dt, a);
  }

  /** Un mammouth paît autour de `c` : il va d'une touffe à l'autre et s'arrête brouter ; le petit reste dans les pas de sa mère */
  private graze(m: Mammoth, c: [number, number], r: number, speed: number, dt: number, cx: number, cz: number) {
    const b = m.b, mom = this.mammoths[1]?.b;
    if (m.size < 0.7 && mom && mom !== b) {
      if (Math.hypot(mom.x - b.x, mom.z - b.z) > 0.45) this.sMove(b, mom.x, mom.z, 0.32, dt, [], true);
      else this.sMove(b, b.x, b.z, 0, dt);
      return;
    }
    if (!this.sMove(b, b.tx, b.tz, speed, dt) && (b.wait -= dt) <= 0) {
      b.wait = 2.5 + Math.random() * 4;
      const ang = Math.random() * Math.PI * 2, d = Math.random() * r;
      [b.tx, b.tz] = this.near(c[0] + Math.cos(ang) * d, c[1] + Math.sin(ang) * d, cx, cz);
    }
  }

  /**
   * Le vieux mâle, la chasse lancée : poussé vers le piège (au bord des fosses, à l'entrée du ravin) ou traînant derrière la
   * harde ; il s'agite et barrit. Au retour d'une chasse réussie, il tombe dans la fosse, s'engage au fond du ravin et y reste
   * coincé, ou se couche, épuisé
   */
  private stepOldMale(dt: number, a: ActiveExpedition, away: boolean) {
    const h = this.mam!, m = h.old, b = m.b, [tx, tz] = h.trap, [ux, uz] = h.axis, won = away && a.ok;
    if (h.way === 'pits') {
      if (!this.sMove(b, won ? tx : tx - ux * 0.42, won ? tz : tz - uz * 0.42, won ? 0.3 : 0.12, dt, [], true) && won) m.sink = Math.min(0.14, m.sink + dt * 0.12);
    } else if (h.way === 'ravine') {
      if (!this.sMove(b, tx + ux * (won ? 0.3 : -0.5), tz + uz * (won ? 0.3 : -0.5), won ? 0.45 : 0.16, dt, [], true) && won) m.sink = Math.min(0.05, m.sink + dt * 0.05);
    } else if (won) {
      // à bout de souffle, il se couche là où il est
      this.sMove(b, b.x, b.z, 0, dt);
      m.lie = Math.min(1, m.lie + dt * 0.4);
    } else this.sMove(b, tx, tz, 0.08, dt, [], true);
    // il s'agite : il barrit de temps en temps, plus souvent une fois pris (pas couché, épuisé)
    if (m.lie < 0.3 && Math.random() < dt * (won ? 0.5 : 0.22)) m.trumpet = 1;
  }

  /** Les chasseurs lancent leurs lances vers le vieux mâle, de près et à tour de rôle : elles se plantent à ses pieds, il barrit */
  private throwSpears(dt: number, a: ActiveExpedition) {
    const m = this.mam!.old, b = m.b, g = (x: number, z: number) => this.world.surfaceAt(x, z);
    if (b.held) return;
    const pos = this.agents.partyPositions(a.party);
    a.party.forEach((id, i) => {
      const p = pos[i];
      if (!p) return;
      let t = (this.spearT.get(id) ?? 1 + i * 0.8) - dt;
      if (t <= 0 && Math.hypot(p[0] - b.x, p[1] - b.z) < 1.6 && this.agents.memberDone(id)) {
        t = 2.6 + Math.random() * 2;
        const to = new THREE.Vector3(b.x + (Math.random() - 0.5) * 0.3, g(b.x, b.z) + 0.04, b.z + (Math.random() - 0.5) * 0.3);
        this.combat?.throw(new THREE.Vector3(p[0], g(p[0], p[1]) + 0.17, p[1]), to, () => { this.combat?.puff(to.x, to.y, to.z, 6); m.trumpet = 1; });
        this.agents.partyAct([id], 'work');
      }
      this.spearT.set(id, t);
    });
  }

  /**
   * Les mammouths vivent : leurs pattes battent deux par deux au rythme de leur pas, la trompe se balance (levée pour barrir,
   * avec un souffle de vapeur dans l'air froid), et ils se cabrent un peu en barrissant ; couché, il replie ses pattes ; pris
   * dans la fosse, il y est enfoncé
   */
  private stepMammoths(dt: number) {
    for (const m of this.mammoths) {
      const b = m.b, o = b.obj, moved = Math.hypot(b.x - m.px, b.z - m.pz);
      m.px = b.x; m.pz = b.z;
      if (dt > 0) m.v += (moved / dt - m.v) * Math.min(1, dt * 6);
      m.ph += moved / (0.07 * m.size);
      // un mammouth qui charge barrit
      if (m.v > 0.8) m.trumpet = Math.max(m.trumpet, 0.7);
      m.trumpet = Math.max(0, m.trumpet - dt * 0.8);
      const up = Math.sin(Math.min(1, m.trumpet) * Math.PI * 0.5), stride = Math.min(1, m.v / (0.2 * m.size)) * 0.42 * (1 - m.lie);
      m.legs.forEach((l, i) => (l.rotation.x = Math.sin(m.ph + (i === 0 || i === 3 ? 0 : Math.PI)) * stride + m.lie * (i < 2 ? -1.35 : 1.35)));
      m.trunk.rotation.x = -up * 1.7 + Math.sin(this.t * 1.4 + m.size * 7) * 0.12 * (1 - up);
      m.trunk.rotation.z = Math.sin(this.t * 0.9 + m.size * 3) * 0.12 * (1 - up);
      o.position.set(b.x, this.world.surfaceAt(b.x, b.z) + (Math.abs(Math.sin(m.ph)) * 0.01 * (1 - m.lie) - m.lie * 0.17 - m.sink) * m.size, b.z);
      o.rotation.x = -up * 0.12 * (1 - m.lie);
      if (up > 0.8 && o.visible && Math.random() < dt * 5) {
        const f = 0.5 * m.size;
        this.puffAt(b.x + Math.sin(b.heading) * f, o.position.y + 0.62 * m.size, b.z + Math.cos(b.heading) * f, 'puff', Math.sin(b.heading) * 0.1, Math.cos(b.heading) * 0.1);
      }
    }
  }

  /** La barque va et vient entre la berge et le large, en tanguant ; ses passagers y sont assis */
  private stepBoat() {
    const bt = this.boat!;
    // aller-retour lent (une vingtaine de secondes), pause au large le temps de pêcher
    const ph = (this.t / 22) % 1, u = ph < 0.3 ? smooth(ph / 0.3) : ph < 0.75 ? 1 : 1 - smooth((ph - 0.75) / 0.25);
    const x = bt.home[0] + (bt.out[0] - bt.home[0]) * u, z = bt.home[1] + (bt.out[1] - bt.home[1]) * u;
    const sway = Math.sin(this.t * 0.4) * 0.12, dir = Math.atan2(bt.out[0] - bt.home[0], bt.out[1] - bt.home[1]);
    let px = x + Math.cos(dir) * sway, pz = z - Math.sin(dir) * sway;
    if (this.depth(px, pz) === null) { px = x; pz = z; }
    // dans les rapides, elle tangue et roule bien plus fort
    const rough = this.rough, heading = dir + (ph >= 0.75 ? Math.PI : 0) + Math.sin(this.t * 0.4) * 0.15 + Math.sin(this.t * 3.1) * 0.2 * rough;
    const y = bt.y + 0.005 + Math.sin(this.t * 1.7) * 0.006 + Math.abs(Math.sin(this.t * 4.3)) * 0.02 * rough;
    bt.obj.position.set(px, y, pz);
    bt.obj.rotation.set(Math.sin(this.t * 1.3) * (0.03 + 0.12 * rough), heading, Math.sin(this.t * 1.1 + rough * 2) * (0.04 + 0.18 * rough));
    this.focus = [px, pz];
    bt.riders.forEach((id, i) => {
      const lz = i ? -0.08 : 0.06, sx = Math.sin(heading), cz = Math.cos(heading);
      if (this.story === 'dive' && i === 1 && u > 0.97) {
        // le plongeur se met à l'eau, masque au ras de l'eau, à côté de la barque
        this.agents.ride(id, { x: px + cz * 0.2, z: pz - sx * 0.2, y: y - 0.13, heading: heading + Math.PI / 2 });
        return;
      }
      // le pêcheur, à l'arrière, se tourne vers le bord pour lancer sa ligne
      this.agents.ride(id, { x: px + sx * lz, z: pz + cz * lz, y: y + 0.03, heading: heading + (i ? Math.PI / 2 : 0) });
    });
  }

  /** Chaque membre (hors barque) va d'un point de travail à l'autre, ou reste au camp */
  private stepMembers(dt: number, a: ActiveExpedition, k: number) {
    const riders = this.boat?.riders ?? [];
    a.party.forEach((id, i) => {
      if (riders.includes(id)) return;
      if (this.balloon && this.stepAeronaut(id, i, k, dt)) return;
      if (this.race && this.stepRacer(id, i, k)) return;
      if (this.kind === 'spring' && this.stepBather(id, i, a, dt)) return;
      if (this.kind === 'delve' && this.mouth) { this.stepDelver(id, i, dt); return; }
      let left = (this.next.get(id) ?? i * 0.8) - dt;
      if (this.kind === 'camp' && left <= 0) {
        // au camp : chacun s'assied au feu ou s'affaire, à tour de rôle
        this.agents.partyAct([id], (i + Math.floor(this.t / 9)) % 3 ? 'sit' : 'work');
        left = 9;
      } else if (left <= 0) {
        const target = this.pick(id, i, a, k);
        if (target) this.agents.memberGo(id, target[0], target[1], target[2]);
        left = this.kind === 'hunt' ? 4 + Math.random() * 2 : this.mam ? 2.5 + Math.random() * 1.5 : this.kind === 'fish' || this.kind === 'boat' || this.kind === 'watch' || this.kind === 'spring' ? 1e9 : 5 + Math.random() * 3;
        this.goal.set(id, 1);
      } else if (this.goal.get(id) && this.agents.memberDone(id)) {
        this.goal.delete(id);
        this.agents.partyAct([id], this.actOf(i, k));
      } else if (this.kind === 'watch' && this.agents.memberDone(id)) this.agents.partyAct([id], this.actOf(i, k));
      this.next.set(id, left);
    });
  }

  /** Le geste d'un membre arrivé à sa place : au travail, assis à guetter ou à écouter, à applaudir les jongleurs… */
  private actOf(i: number, k: number): Act {
    const st = this.story;
    if (this.kind === 'hunt') return 'work';
    // les rabatteurs et les guetteurs attendent, accroupis, que la chasse commence ; les creuseurs creusent
    if (this.mam) return this.mam.k < 0.3 && this.mam.way !== 'pits' ? 'sit' : 'work';
    if (st === 'salt') return k < 0.75 ? 'sit' : 'work';
    if (st === 'troupe') return (i + Math.floor(this.t / 5)) % 2 ? 'cheer' : 'sit';
    if (st === 'abbey') return (i + Math.floor(this.t / 7)) % 3 ? 'sit' : 'cheer';
    if (st === 'stars') return i < 3 ? 'work' : 'sit';
    // au compte à rebours, on attend ; au décollage, on crie de joie
    if (this.rocket) return k >= L_FIRE ? 'cheer' : (i + Math.floor(this.t / 6)) % 3 ? 'stroll' : 'work';
    if (this.kind === 'spring') return 'sit';
    return 'work';
  }

  /**
   * La montgolfière : l'enveloppe se gonfle, puis elle s'élève, dérive au loin et revient se poser, en se balançant, le brûleur
   * qui rugit par bouffées ; les cordes que tient l'équipe jusqu'au décollage ; les aéronautes debout dans la nacelle
   */
  private stepBalloon(k: number, onSite: boolean) {
    const b = this.balloon!, w = this.world, o = b.obj, S = o.scale.x;
    const fill = k < B_FULL ? smooth(k / B_FULL) : k < B_OUT ? 1 : 1 - smooth(Math.min(1, (k - B_OUT) / (1 - B_OUT))) * 0.6;
    b.env.scale.setScalar(Math.max(0.001, 0.12 + 0.88 * fill));
    // u : le vol, du décollage (0) à l'atterrissage (1) ; elle monte, croise au loin en faisant un crochet, redescend
    const u = k <= B_LIFT ? 0 : k >= B_LAND ? 1 : (k - B_LIFT) / (B_LAND - B_LIFT);
    const up = u < 0.2 ? smooth(u / 0.2) : u > 0.8 ? 1 - smooth((u - 0.8) / 0.2) : 1;
    // un coup de vent la fait tanguer et la pousse de côté
    const g = this.gustK, gust = Math.sin(this.t * 2.3) * 0.18 * g;
    const out = Math.sin(u * Math.PI) * b.far, side = Math.sin(u * Math.PI * 2) * b.far * 0.35 + gust, dx = Math.sin(b.drift), dz = Math.cos(b.drift);
    const x = b.home[0] + dx * out + dz * side, z = b.home[1] + dz * out - dx * side;
    o.position.set(x, Math.max(w.surfaceAt(x, z), b.y0) + up * b.high + Math.sin(this.t * 0.7) * 0.05 * up, z);
    o.rotation.set(Math.sin(this.t * 1.9) * 0.12 * g, b.drift + u * 2.2, Math.sin(this.t * 0.9) * 0.035 * up + Math.sin(this.t * 3.1) * 0.22 * g);
    // le brûleur : il chauffe fort pour gonfler et monter, par bouffées en croisière, se tait pour redescendre
    const heat = !onSite ? 0.3 : k < B_LIFT ? 1.5 : u < 0.22 ? 1.8 : u < 0.75 ? (Math.sin(this.t * 1.7) > 0.2 ? 1.5 : 0.4) : k < B_LAND ? 0.3 : 0.001;
    b.burner.scale.setScalar(heat);
    this.focus = [x, z];
    this.lift = Math.max(0, o.position.y - w.surfaceAt(x, z)) + 0.8 * S * fill * (u > 0 && u < 1 ? 1 : 0.4);
    // les cordes, des coins de la nacelle aux mains de l'équipe, jusqu'au décollage
    const ry = o.rotation.y, cs = Math.cos(ry), sn = Math.sin(ry);
    b.ropes.forEach((l, i) => {
      l.visible = onSite && k < B_LIFT;
      if (!l.visible) return;
      const ang = i * 1.57 + 0.6, lx = Math.cos(ang) * 0.06 * S, lz = Math.sin(ang) * 0.06 * S, [sx, sz] = b.stakes[i];
      const pa = l.geometry.attributes.position as THREE.BufferAttribute;
      pa.setXYZ(0, x + lx * cs + lz * sn, o.position.y + 0.085 * S, z - lx * sn + lz * cs);
      pa.setXYZ(1, sx, w.surfaceAt(sx, sz) + 0.12, sz);
      pa.needsUpdate = true;
      l.geometry.computeBoundingSphere();
    });
    // les aéronautes, debout de part et d'autre du brûleur ; ils saluent ceux d'en bas
    if (onSite) b.riders.forEach((id, r) => {
      if (k < B_IN || k >= B_OUT) return;
      const lx = (r ? -0.032 : 0.032) * S, lz = (r ? -0.022 : 0.022) * S;
      this.agents.ride(id, { x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs, y: o.position.y + 0.012 * S, heading: ry + (r ? Math.PI : 0) + 0.6, act: u > 0.05 && u < 0.95 && Math.floor(this.t / 2.5 + r) % 2 ? 'cheer' : null });
    });
  }

  /**
   * Le lancement : l'équipage gagne la fusée et y monte ; allumage, les flammes grandissent et un grand nuage de fumée roule
   * sur le pas de tir ; la fusée s'arrache, accélère, s'incline dans son virage et sort du ciel en laissant sa traînée
   */
  private stepRocket(k: number, dt: number, onSite: boolean) {
    const r = this.rocket!, H = ROCKET_H[r.kind], big = r.kind === 'colony' ? 1.6 : r.kind === 'moon' ? 1.25 : 1;
    // l'équipage : il attend, marche jusqu'à la fusée, disparaît à bord
    r.crew.forEach((c, i) => {
      const u = onSite ? Math.min(1, Math.max(0, (k - L_BOARD - i * 0.008) / (L_IN - L_BOARD - 0.04))) : 0, f = c.n.folk.root;
      const x = c.from[0] + (r.x - c.from[0]) * u * 0.8, z = c.from[1] + (r.z - c.from[1]) * u * 0.8;
      f.position.set(x, this.world.surfaceAt(x, z) + (u > 0.6 ? (u - 0.6) * 0.3 : 0), z);
      f.visible = u < 1;
      c.n.pose = u > 0 && u < 1 ? 'walk' : Math.floor(this.t / 3 + i) % 3 === 0 ? 'cheer' : 'idle';
    });
    // l'ascension : lente au départ, de plus en plus vite ; le virage vers le large une fois la tour dépassée
    const u = !onSite || k <= L_LIFT ? 0 : Math.min(1, (k - L_LIFT) / (L_GONE - L_LIFT)), alt = 70 * Math.pow(u, 2.2);
    const tilt = Math.min(0.6, Math.max(0, alt - 3) * 0.02), off = Math.max(0, alt - 3) * tilt * 0.45;
    const x = r.x + Math.sin(r.dir) * off, z = r.z + Math.cos(r.dir) * off, y = r.y0 + alt + (onSite && k > L_FIRE && k < L_LIFT ? Math.sin(this.t * 60) * 0.003 : 0);
    r.obj.position.set(x, y, z);
    r.obj.rotation.set(Math.cos(r.dir) * tilt, 0, -Math.sin(r.dir) * tilt);
    r.obj.visible = u < 1;
    // les flammes : elles naissent à l'allumage, grandissent au décollage, s'allongent en altitude
    const th = !onSite || k < L_FIRE || u >= 1 ? 0 : k < L_LIFT ? 0.3 + 0.7 * smooth((k - L_FIRE) / (L_LIFT - L_FIRE)) : 1;
    const fl = 1 + Math.sin(this.t * 31) * 0.08 + Math.sin(this.t * 47) * 0.05;
    r.flame.scale.set(Math.max(0.001, th * fl), Math.max(0.001, th * (1.1 + Math.sin(this.t * 23) * 0.15) * (1 + u * 1.5)), Math.max(0.001, th * fl));
    (r.glare.material as THREE.MeshBasicMaterial).opacity = th * Math.max(0, 1 - alt / 5) * (0.55 + Math.sin(this.t * 37) * 0.08);
    r.glare.scale.setScalar(1.2 * big * (0.6 + th * 0.6));
    if (r.vapor && onSite && k >= L_FIRE) { r.vapor.every = 1e9; r.vapor = null; }
    // la fumée : un nuage qui roule sur le pas de tir tant qu'elle est basse, puis sa traînée dans le ciel
    if (th > 0) {
      if (alt < 4 && (r.puff -= dt) <= 0) {
        r.puff = 0.06 / big;
        for (let j = 0; j < 2; j++) {
          const ang = Math.random() * Math.PI * 2, sp = (0.25 + Math.random() * 0.35) * big, o = new THREE.Mesh(cloudGeo(), mats.body);
          this.group.add(o);
          this.fx.push({ obj: o, t: 0, life: 5 + Math.random() * 2, kind: 'plume', x: r.x, y: r.y0 + 0.03, z: r.z, vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp });
        }
      }
      if (alt > 0.3 && alt < 55 && (r.trail -= dt) <= 0) {
        r.trail = 0.08;
        // elle naît au bout des flammes : on voit le feu sous la tuyère
        const o = new THREE.Mesh(cloudGeo(), mats.body), dn = 0.45 * big * (1 + u * 1.5);
        this.group.add(o);
        this.fx.push({ obj: o, t: 0, life: 6, kind: 'trail', x: x - Math.sin(r.dir) * tilt * dn, y: y - dn, z: z - Math.cos(r.dir) * tilt * dn, vx: (Math.random() - 0.5) * 0.06, vz: (Math.random() - 0.5) * 0.06 });
      }
    }
    // la vue suit la fusée, le nez en l'air
    if (onSite && u < 1) { this.focus = [x, z]; this.lift = Math.min(alt + H * 0.5, 9); }
    else { this.focus = [r.x, r.z]; this.lift = H * 0.4; }
  }

  /** Un membre de l'envol : à sa corde pendant qu'on gonfle, à la nacelle s'il part, puis le nez en l'air à applaudir ; vrai s'il est pris en charge */
  private stepAeronaut(id: number, i: number, k: number, dt: number) {
    const b = this.balloon!, r = b.riders.indexOf(id), o = b.obj;
    if (r >= 0 && k >= B_IN && k < B_OUT) return true;
    if (r >= 0) this.agents.ride(id, null);
    const st = r >= 0 && k >= B_BOARD && k < B_IN ? 'board' : k < B_LIFT ? 'rope' : 'watch';
    let left = (this.next.get(id) ?? i * 0.5) - dt;
    if (this.stage.get(id) !== st || left <= 0) {
      this.stage.set(id, st);
      const p = this.agents.partyPositions([id])[0];
      const [tx, tz] = st === 'rope' ? b.stakes[i % b.stakes.length] : st === 'board' ? [b.home[0] + (r ? -0.17 : 0.17), b.home[1]] : p ? [p[0], p[1]] : b.home;
      this.agents.memberGo(id, tx, tz, Math.atan2(o.position.x - tx, o.position.z - tz));
      this.goal.set(id, 1);
      left = st === 'watch' ? 5 : 1e9;
    } else if (this.goal.get(id) && this.agents.memberDone(id)) {
      this.goal.delete(id);
      this.agents.partyAct([id], st === 'watch' ? 'cheer' : st === 'board' ? null : 'work');
    }
    this.next.set(id, left);
    return true;
  }

  /** La voiture de course : au départ elle pétarade sur place ; puis elle fait ses tours, accélère, ralentit, revient sur la ligne */
  private stepRace(k: number, dt: number, onSite: boolean) {
    const r = this.race!, w = this.world;
    const u = k <= R_GO ? 0 : k >= R_END ? 1 : smooth((k - R_GO) / (R_END - R_GO)), th = u * r.laps * Math.PI * 2;
    const x = r.x + r.rx * Math.sin(th), z = r.z + r.s * r.rz * (1 - Math.cos(th));
    const h = Math.atan2(r.rx * Math.cos(th), r.s * r.rz * Math.sin(th)), driving = onSite && u > 0 && u < 1;
    const gy = w.surfaceAt(x, z);
    r.obj.position.set(x, gy + (driving ? Math.abs(Math.sin(this.t * 23)) * 0.005 : 0), z);
    r.obj.rotation.y = h;
    if (driving) this.focus = [x, z];
    // pétarades au pot d'échappement, poussière derrière elle quand elle file
    if ((r.puff -= dt) <= 0) {
      r.puff = driving ? 0.1 : 0.45;
      const o = new THREE.Mesh(driving ? puffGeo() : smokeGeo(), mats.body);
      this.group.add(o);
      this.fx.push({ obj: o, t: 0, life: driving ? 1 : 1.6, kind: driving ? 'puff' : 'smoke', x: x - Math.sin(h) * 0.15, y: gy + 0.04, z: z - Math.cos(h) * 0.15, vx: 0, vz: 0 });
    }
    // le pilote au volant
    if (onSite && r.driver !== null) {
      if (k >= R_SEAT && k < R_OUT) this.agents.ride(r.driver, { x: x - Math.sin(h) * 0.03, z: z - Math.cos(h) * 0.03, y: gy + 0.04, heading: h });
      else if (k >= R_OUT) this.agents.ride(r.driver, null);
    }
  }

  /**
   * Le chantier de la voie : les jalons disparaissent à mesure qu'on pose les tronçons ; le train de chantier pousse sa
   * plate-forme jusqu'à la tête de voie, en fumant ; la vue suit la tête de voie
   */
  private stepWorks(dt: number, a: ActiveExpedition) {
    const wk = this.works!, w = this.world, laid = this.built.filter((o) => o.visible).length, sx = Math.sin(wk.dir), sz = Math.cos(wk.dir);
    wk.stakes.forEach((s, i) => (s.visible = !this.built[i].visible));
    const head = laid * 0.3, at = Math.max(0, head - 0.62), x = wk.x + sx * at, z = wk.z + sz * at;
    // le train avance en douceur jusqu'à sa place
    const o = wk.train, tx = x - o.position.x, tz = z - o.position.z, d = Math.hypot(tx, tz);
    if (!o.userData.set || d > 2) { o.position.set(x, w.surfaceAt(x, z) + 0.024, z); o.userData.set = true; }
    else if (d > 1e-3) { const st = Math.min(d, dt * 0.25); o.position.x += (tx / d) * st; o.position.z += (tz / d) * st; o.position.y = w.surfaceAt(o.position.x, o.position.z) + 0.024; }
    if (a.phase === 'work') this.focus = [wk.x + sx * head, wk.z + sz * head];
    if ((wk.puff -= dt) <= 0 && !a.wait) {
      wk.puff = d > 1e-3 ? 0.18 : 0.5;
      const f = new THREE.Mesh(smokeGeo(), mats.body), cx = o.position.x + sx * 0.12, cz = o.position.z + sz * 0.12;
      this.group.add(f);
      this.fx.push({ obj: f, t: 0, life: 2, kind: 'smoke', x: cx, y: o.position.y + 0.3, z: cz, vx: 0, vz: 0 });
    }
  }

  /** Le pilote va à sa portière ; les autres, une fois la voiture partie, applaudissent au bord de la piste, près de l'arche */
  private stepRacer(id: number, i: number, k: number) {
    const r = this.race!;
    if (id === r.driver) {
      if (k >= R_SEAT && k < R_OUT) return true;
      if (k < R_DOOR || k >= R_OUT) return false;
      if (this.stage.get(id) !== 'door') { this.stage.set(id, 'door'); this.agents.memberGo(id, r.x - 0.04, r.z - r.s * 0.14, r.s > 0 ? 0 : Math.PI); }
      return true;
    }
    if (k < R_GO) return false;
    if (this.stage.get(id) !== 'stand') {
      this.stage.set(id, 'stand');
      const [sx, sz] = this.near(r.ax + (i - 1.5) * 0.16, r.z - r.s * 0.3, r.x, r.z);
      this.agents.memberGo(id, sx, sz, r.s > 0 ? 0 : Math.PI);
      this.goal.set(id, 1);
    } else if (this.goal.get(id) && this.agents.memberDone(id)) {
      this.goal.delete(id);
      this.agents.partyAct([id], 'cheer');
    }
    return true;
  }

  /** Source chaude : deux membres se baignent, les autres attendent assis sur les pierres ; on change toutes les dix secondes */
  private stepBather(id: number, i: number, a: ActiveExpedition, dt: number) {
    const b = this.bath!, n = a.party.length, slot = (i + Math.floor(this.t / 10)) % n, inWater = slot < Math.min(2, n);
    if (inWater) {
      const [x, z] = b.at[slot];
      this.agents.ride(id, { x, z, y: b.y, heading: Math.atan2(this.focus[0] - x, this.focus[1] - z) + (slot ? 0.5 : -0.5) });
      b.in.add(id);
      return true;
    }
    if (b.in.has(id)) { b.in.delete(id); this.agents.ride(id, null); this.next.set(id, 0.3); this.goal.delete(id); }
    void dt;
    return false;
  }

  /** Galerie ou grotte : chacun y entre, disparaît le temps d'abattre la roche, ressort et vide sa charge au tas */
  private stepDelver(id: number, i: number, dt: number) {
    const m = this.mouth!, st = this.delve.get(id) ?? { phase: 'go' as const, t: i * 1.6 };
    st.t -= dt;
    if (st.phase === 'go' && st.t <= 0) {
      this.agents.memberGo(id, m.at[0], m.at[1], Math.atan2(m.at[0] - m.heap[0], m.at[1] - m.heap[1]));
      st.phase = 'in'; st.t = 0.6;
    } else if (st.phase === 'in' && st.t <= 0 && this.agents.memberDone(id)) {
      this.agents.partyHide([id], true);
      st.phase = 'out'; st.t = 4 + Math.random() * 3;
    } else if (st.phase === 'out' && st.t <= 0) {
      this.agents.partyHide([id], false);
      this.agents.memberGo(id, m.heap[0] + Math.cos(i * 2) * 0.16, m.heap[1] + Math.sin(i * 2) * 0.16, Math.atan2(m.heap[0] - m.at[0], m.heap[1] - m.at[1]));
      st.phase = 'heap'; st.t = 3.5;
    } else if (st.phase === 'heap' && this.agents.memberDone(id)) {
      this.agents.partyAct([id], 'work');
      if (st.t <= 0) { st.phase = 'go'; st.t = 0; }
    }
    this.delve.set(id, st);
  }

  /** Prochain point de travail d'un membre, et la direction à regarder une fois arrivé */
  private pick(id: number, i: number, a: ActiveExpedition, k: number): [number, number, number | null] | null {
    const [cx, cz] = a.dest;
    // à la pierre à sel, on guette d'abord, caché derrière les buissons
    if (this.story === 'salt' && k < 0.75 && this.spots.length) { const [x, z] = this.spots[i % this.spots.length]; return [x, z, Math.atan2(cx - x, cz - z)]; }
    if (this.kind === 'herd' && this.beasts.length) {
      const b = this.beasts[(i + Math.floor(this.t / 6)) % this.beasts.length];
      const ang = Math.atan2(cx - b.x, cz - b.z) + (i - 1) * 0.6;
      return [b.x + Math.sin(ang) * 0.24, b.z + Math.cos(ang) * 0.24, ang + Math.PI];
    }
    if (this.mam) {
      // la chasse au mammouth : on prépare d'abord (au bord des fosses, derrière la harde, tapi à distance)…
      const h = this.mam, b = h.old.b, n = a.party.length;
      if (h.k < 0.3 && this.spots.length) {
        const j = i % this.spots.length, [x, z] = this.spots[j], f = h.way === 'pits' ? h.pits[Math.floor(j / 2)].position : b.obj.position;
        return [x, z, Math.atan2(f.x - x, f.z - z)];
      }
      // … puis en arc derrière le vieux mâle (on le pousse vers le piège), ou tout autour de lui (on l'encercle)
      const toTrap = Math.atan2(h.trap[0] - b.x, h.trap[1] - b.z);
      const ang = h.way === 'follow' ? (i / n) * Math.PI * 2 + this.t * 0.04 : toTrap + Math.PI + (i - (n - 1) / 2) * 0.5;
      const r = 0.8 + (i % 2) * 0.15, [x, z] = this.near(b.x + Math.sin(ang) * r, b.z + Math.cos(ang) * r, b.x, b.z);
      return [x, z, Math.atan2(b.x - x, b.z - z)];
    }
    if (this.kind === 'hunt' && this.beasts.length) {
      const b = this.beasts[0], ang = Math.atan2(b.x - cx, b.z - cz) + (i - 1) * 0.35;
      const [x, z] = this.near(cx + Math.sin(ang) * 1.4, cz + Math.cos(ang) * 1.4, cx, cz);
      return [x, z, Math.atan2(b.x - x, b.z - z)];
    }
    if (this.kind === 'fish' || this.kind === 'boat') {
      const s = this.spots[i % this.spots.length], wat = this.water!;
      return [s[0], s[1], Math.atan2(wat.wet[0] - wat.bank[0], wat.wet[1] - wat.bank[1])];
    }
    if (this.rocket) {
      // en arc de cercle au bord du pas de tir, face à la fusée
      const r = this.rocket, d0 = Math.hypot(cx - r.x, cz - r.z), ang = Math.atan2(cx - r.x, cz - r.z) + (i - (a.party.length - 1) / 2) * 0.16, rr = Math.max(1.3, Math.min(2.2, d0));
      const [x, z] = this.near(r.x + Math.sin(ang) * rr, r.z + Math.cos(ang) * rr, cx, cz);
      return [x, z, Math.atan2(r.x - x, r.z - z)];
    }
    if (this.kind === 'watch' && !(this.story === 'stars' && i < 3)) {
      // en demi-cercle face aux jongleurs ou au frère brasseur (tournés vers -x), ou le nez au ciel
      const [fx, fz] = this.focus, ang = -Math.PI / 2 + (i - (a.party.length - 1) / 2) * 0.55, r = this.story === 'stars' ? 0.3 : 0.5;
      const [x, z] = this.near(fx + Math.sin(ang) * r, fz + Math.cos(ang) * r, cx, cz);
      return [x, z, Math.atan2(fx - x, fz - z)];
    }
    if (this.kind === 'spring') { const s = this.spots[i % this.spots.length]; return [s[0], s[1], Math.atan2(this.focus[0] - s[0], this.focus[1] - s[1])]; }
    if ((this.kind === 'trade' || this.kind === 'tend') && this.spots.length) {
      const [x, z] = this.spots[(i + Math.floor(this.t / 6)) % this.spots.length];
      return [x, z, Math.atan2(this.focus[0] - x, this.focus[1] - z)];
    }
    if (!this.spots.length) return null;
    // les ouvrages : au prochain piquet ou tronçon à poser ; ailleurs, de point en point
    const n = this.spots.length;
    const j = this.built.length ? Math.min(n - 1, Math.floor(k * n) + (i % 2)) : (i + Math.floor(this.t / 6)) % n;
    const [x, z] = this.spots[j];
    const face = this.kind === 'mine' ? Math.atan2(this.props[0].position.x - x, this.props[0].position.z - z) : this.built.length ? Math.atan2(this.built[j].position.x - x, this.built[j].position.z - z) : null;
    void id;
    return [x, z, face];
  }

  /** Cannes à pêche : le pêcheur à l'arrière de la barque, ceux de la berge une fois en place */
  private stepRods(a: ActiveExpedition) {
    if (this.kind !== 'boat' && this.kind !== 'fish') return;
    const fishers = this.kind === 'boat' ? [this.boat!.riders[this.boat!.riders.length - 1], ...a.party.filter((id) => !this.boat!.riders.includes(id))] : a.party;
    const w = this.world, wat = this.water!;
    for (const id of a.party) {
      const p = fishers.includes(id) && (this.boat?.riders.includes(id) || this.agents.memberDone(id)) ? this.agents.partyPositions([id])[0] : undefined;
      let r = this.rods.get(id);
      if (!p) { if (r) r.rod.visible = r.bob.visible = r.line.visible = false; continue; }
      if (!r) {
        r = { rod: new THREE.Mesh(rodGeo(), mats.body), bob: new THREE.Mesh(bobberGeo(), mats.body), line: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), LINE) };
        r.line.userData.flat = true;
        this.group.add(r.rod, r.bob, r.line);
        this.props.push(r.rod, r.bob, r.line);
        this.rods.set(id, r);
      }
      r.rod.visible = r.bob.visible = r.line.visible = true;
      const [x, z, h] = p, inBoat = this.boat?.riders.includes(id);
      const base = new THREE.Vector3(x + Math.sin(h) * 0.06, (inBoat ? this.boat!.obj.position.y + 0.06 : w.surfaceAt(x, z)) + 0.1, z + Math.cos(h) * 0.06);
      r.rod.position.copy(base);
      r.rod.rotation.set(0.9, h, 0, 'YXZ');
      const tip = new THREE.Vector3(0, 0.42, 0).applyEuler(r.rod.rotation).add(base);
      const bx = tip.x + Math.sin(h) * 0.12, bz = tip.z + Math.cos(h) * 0.12;
      r.bob.position.set(bx, wat.level + 0.004 + Math.sin(this.t * 2.3 + id) * 0.004 - (Math.sin(this.t * 0.9 + id) > 0.93 ? 0.012 : 0), bz);
      const lp = r.line.geometry.attributes.position as THREE.BufferAttribute;
      lp.setXYZ(0, tip.x, tip.y, tip.z); lp.setXYZ(1, bx, r.bob.position.y + 0.01, bz); lp.needsUpdate = true;
      r.line.geometry.computeBoundingSphere();
    }
  }

  /** Poussière des pioches, poissons qui sautent hors de l'eau */
  private stepFx(dt: number, a: ActiveExpedition) {
    this.fxTimer -= dt;
    if (this.fxTimer <= 0 && !a.wait) {
      if (this.kind === 'mine' && this.props[0] && a.phase === 'work') {
        this.fxTimer = 0.35 + Math.random() * 0.5;
        const p = this.props[0].position, o = new THREE.Mesh(puffGeo(), mats.body);
        this.group.add(o);
        this.fx.push({ obj: o, t: 0, life: 1.2, kind: 'puff', x: p.x + (Math.random() - 0.5) * 0.25, y: p.y + 0.08, z: p.z + (Math.random() - 0.5) * 0.25, vx: (Math.random() - 0.5) * 0.08, vz: (Math.random() - 0.5) * 0.08 });
      } else if ((this.kind === 'boat' || this.kind === 'fish') && this.water) {
        this.fxTimer = 2.5 + Math.random() * 3.5;
        const c = this.boat ? this.boat.obj.position : new THREE.Vector3(this.water.wet[0], 0, this.water.wet[1]);
        const ang = Math.random() * Math.PI * 2, x = c.x + Math.cos(ang) * 0.4, z = c.z + Math.sin(ang) * 0.4;
        if (this.depth(x, z) !== null) this.fishJump(x, z, this.water.level);
      } else this.fxTimer = 1;
    }
    for (const e of this.emits) {
      // les nuages cachent les étoiles filantes
      if ((e.t -= dt) > 0 || a.wait || (e.kind === 'star' && this.cloudy)) continue;
      e.t = e.every * (0.7 + Math.random() * 0.6);
      const star = e.kind === 'star', o = new THREE.Mesh(star ? new THREE.BoxGeometry(0.012, 0.012, 0.5) : e.kind === 'steam' ? steamGeo() : e.kind === 'smoke' ? smokeGeo() : e.kind === 'bubble' ? bubbleGeo() : puffGeo(), star ? STAR : mats.body);
      this.group.add(o);
      if (star) {
        const ang = Math.random() * Math.PI * 2, vx = Math.cos(ang) * 2.4, vz = Math.sin(ang) * 2.4;
        o.lookAt(new THREE.Vector3(vx, -0.9, vz));
        this.fx.push({ obj: o, t: 0, life: 0.7, kind: 'star', x: e.x - vx * 0.35 + (Math.random() - 0.5) * 2, y: e.y + Math.random() * 0.8, z: e.z - vz * 0.35 + (Math.random() - 0.5) * 2, vx, vz });
      } else this.fx.push({ obj: o, t: 0, life: e.kind === 'puff' ? 1.2 : 2.2, kind: e.kind === 'puff' ? 'puff' : e.kind, x: e.x + (Math.random() - 0.5) * 0.12, y: e.y, z: e.z + (Math.random() - 0.5) * 0.12, vx: (Math.random() - 0.5) * 0.05, vz: (Math.random() - 0.5) * 0.05 });
    }
    if (this.story === 'dive' && this.boat && !a.wait && Math.random() < dt * 3) {
      const p = this.boat.obj.position, o = new THREE.Mesh(bubbleGeo(), mats.body);
      this.group.add(o);
      this.fx.push({ obj: o, t: 0, life: 0.9, kind: 'bubble', x: p.x + (Math.random() - 0.5) * 0.4, y: this.boat.y - 0.04, z: p.z + (Math.random() - 0.5) * 0.4, vx: 0, vz: 0 });
    }
    this.fx = this.fx.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.group.remove(f.obj); if (f.kind === 'ring' || f.kind === 'star') (f.obj as THREE.Mesh).geometry.dispose(); return false; }
      if (f.kind === 'puff') { f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * 0.12, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI) * (1 + k)); }
      else if (f.kind === 'rock') {
        // la pierre tombe, rebondit en soulevant de la poussière, roule et s'arrête
        f.vy = (f.vy ?? 0) - dt * 6;
        f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
        const g = this.world.surfaceAt(f.x, f.z) + 0.025;
        if (f.y < g) {
          f.y = g;
          if (f.vy < -0.5) this.puffAt(f.x, g, f.z);
          f.vy = -f.vy * 0.35; f.vx *= 0.75; f.vz *= 0.75;
        }
        f.obj.position.set(f.x, f.y, f.z);
        f.obj.rotation.x += dt * 9 * Math.hypot(f.vx, f.vz);
        if (k > 0.85) f.obj.scale.multiplyScalar(0.9);
      } else if (f.kind === 'gas') { f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * 0.1, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI) * (1 + k * 2.5)); }
      else if (f.kind === 'leaf') { f.obj.position.set(f.x + f.vx * f.t, f.y + Math.sin(f.t * 5) * 0.03 + f.t * 0.05, f.z + f.vz * f.t); f.obj.rotation.set(f.t * 7, f.t * 3, f.t * 5); f.obj.scale.setScalar(k > 0.8 ? (1 - k) * 5 : 1); }
      else if (f.kind === 'fish') {
        f.obj.position.set(f.x + f.vx * f.t, f.y + Math.sin(k * Math.PI) * 0.16, f.z + f.vz * f.t);
        f.obj.rotation.set(-Math.cos(k * Math.PI) * 1.1, Math.atan2(f.vx, f.vz), 0, 'YXZ');
      } else if (f.kind === 'steam' || f.kind === 'smoke') {
        f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * (f.kind === 'steam' ? 0.16 : 0.22), f.z + f.vz * f.t);
        f.obj.scale.setScalar(Math.sin(k * Math.PI) * (0.8 + k * 1.8));
      } else if (f.kind === 'bubble') { f.obj.position.set(f.x, f.y + k * 0.08, f.z); f.obj.scale.setScalar(1 - k * 0.5); }
      else if (f.kind === 'plume') {
        // le nuage du décollage roule au ras du sol, s'étale, s'élève un peu et se dissipe
        const e = 1 - (1 - k) * (1 - k);
        f.obj.position.set(f.x + f.vx * e * 3, f.y + k * 0.45, f.z + f.vz * e * 3);
        f.obj.scale.setScalar((2 + k * 9) * Math.min(1, (1 - k) * 3));
      } else if (f.kind === 'trail') {
        f.obj.position.set(f.x + f.vx * f.t, f.y - f.t * 0.04, f.z + f.vz * f.t);
        f.obj.scale.setScalar((0.8 + k * 7) * Math.min(1, (1 - k) * 2.5));
      }
      else if (f.kind === 'star') { f.obj.position.set(f.x + f.vx * f.t, f.y - f.t * 0.9, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI)); }
      else { f.obj.position.set(f.x, f.y, f.z); f.obj.scale.setScalar(1 + k * 3); }
      return true;
    });
  }

  /**
   * On range tout. L'équipe encore sur place (une expédition interrompue) reprend pied : les passagers de la barque reviennent
   * sur la berge, ceux de la grotte en ressortent ; repartie, elle a déjà repris la route, et on ne la touche plus
   */
  dispose(a: ActiveExpedition) {
    if (a.phase === 'work' || a.phase === 'out' || a.phase === 'gather') {
      for (const id of this.boat?.riders ?? []) this.agents.ride(id, null);
      for (const id of this.bath?.in ?? []) this.agents.ride(id, null);
      for (const id of this.balloon?.riders ?? []) this.agents.ride(id, null);
      if (this.race?.driver != null) this.agents.ride(this.race.driver, null);
      if (this.mouth) this.agents.partyHide(a.party, false);
    }
    for (const s of this.stagings) this.unstage(s);
    this.stagings = [];
    for (const l of this.balloon?.ropes ?? []) l.geometry.dispose();
    if (this.rocket) { this.rocket.glare.geometry.dispose(); (this.rocket.glare.material as THREE.Material).dispose(); }
    for (const n of this.npcs) this.group.remove(n.folk.root);
    for (const b of [...this.beasts, ...this.dogs]) { b.actor?.mixer.stopAllAction(); this.group.remove(b.obj); }
    for (const o of this.props) this.group.remove(o);
    for (const f of this.fx) this.group.remove(f.obj);
    for (const r of this.rods.values()) r.line.geometry.dispose();
    this.flame?.geometry.dispose();
    void a;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
