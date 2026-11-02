import * as THREE from 'three';
import { World, N, SEA, VEG_FOREST, VEG_CAVE } from '../world/world';
import { Agents } from '../sim/agents';
import { ActiveExpedition } from '../sim/expeditions';
import { HerdKind, Scene } from '../sim/missions';
import { Act } from '../world/gardens';
import { makeActor, play, hasModel, Actor, ModelName, AGE_VILLAGERS } from './assets';
import { Parts } from './parts';
import { mats } from './materials';

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
const bubbleGeo = () => geo('bubble', (p) => p.sphere(0.01, 0, 0, 0, 0xffffff, 0));
const ballGeo = (c: number) => geo(`ball${c}`, (p) => p.sphere(0.014, 0, 0, 0, c));
const tentGeoC = (c: number) => geo(`tent${c}`, (p) => {
  p.gable(0.3, 0.24, 0.3, 0, 0, 0, c);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.151, 0, 0.06, 0.151, 0, -0.06, 0.151, 0.14, 0], 3)), 0, 0, 0, 0x3a2a22);
});
const STAR = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: 0.95, depthWrite: false });
const GLOW = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
/** Gestes des habitants d'ailleurs (aventuriers KayKit, petits personnages de Kenney) */
const TALK = ['Interact', 'interact-right', 'Use_Item', 'Wave', 'Idle', 'idle'];
const SITTING = ['Sit_Chair_Idle', 'Sit_Floor_Idle', 'sit', 'Idle', 'idle'];
const CHEERING = ['Cheer', 'emote-yes', 'Wave', 'Idle', 'idle'];

/** Comment l'équipe se déplace selon le cœur de sa mission : autour des bêtes, de point de travail en point de travail… */
const BEHAVIOR: Record<Scene, string> = {
  herd: 'herd', corral: 'herd', salt: 'herd', roundup: 'herd', boat: 'boat', dive: 'boat', fish: 'fish',
  mine: 'mine', pass: 'mine', crater: 'mine', gather: 'gather', pebbles: 'gather', hops: 'gather', hunt: 'hunt',
  build: 'build', bridge: 'build', drill: 'build', summit: 'build', basecamp: 'build', rails: 'rails', camp: 'camp',
  smoke: 'tend', swarm: 'tend', trade: 'trade', spring: 'spring', gallery: 'delve', cave: 'delve', scout: 'delve', troupe: 'watch', abbey: 'watch', stars: 'watch',
};
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const LINE = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.8 });
const RING = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });

interface Beast { obj: THREE.Object3D; actor: Actor | null; x: number; z: number; tx: number; tz: number; heading: number; wait: number; speed: number }
interface Rod { rod: THREE.Mesh; bob: THREE.Mesh; line: THREE.Line }
interface Fx { obj: THREE.Object3D; t: number; life: number; kind: 'puff' | 'fish' | 'ring' | 'steam' | 'smoke' | 'bubble' | 'star'; x: number; y: number; z: number; vx: number; vz: number }

/**
 * Ce que fait une équipe sur place, joué sur la carte, et pourquoi elle est venue : elle approche une harde ou la rabat dans
 * un enclos, attend les aurochs à la pierre à sel, part en barque ou plonge sur le récif, pioche un éboulis, cueille baies,
 * houblon ou galets, enfume le vieux chêne ou recueille un essaim, troque ses poteries chez les voisins, se baigne dans la
 * source chaude, entre et sort de la galerie avec le wagonnet, applaudit les jongleurs, écoute le frère brasseur, regarde
 * les étoiles filantes, dégage la météorite, jette un pont, carotte la roche, plante le drapeau au sommet…
 */
export class ExpeditionScene {
  private props: THREE.Object3D[] = [];
  private beasts: Beast[] = [];
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
  private npcs: { actor: Actor; anims: string[] }[] = [];
  private spins: { obj: THREE.Object3D; speed: number }[] = [];
  private grows: { obj: THREE.Object3D; from: number; to: number }[] = [];
  private emits: { x: number; y: number; z: number; kind: 'steam' | 'smoke' | 'puff' | 'bubble' | 'star'; every: number; t: number }[] = [];
  private jugglers: { x: number; y: number; z: number; face: number; balls: THREE.Mesh[] }[] = [];
  /** ce que regarde l'équipe (jongleurs, moine, ciel) ; places dans la source ; entrée de la galerie et tas de minerai */
  private focus: [number, number] = [0, 0];
  private bath: { at: [number, number][]; y: number; in: Set<number> } | null = null;
  private mouth: { at: [number, number]; heap: [number, number] } | null = null;
  private delve = new Map<number, { phase: 'go' | 'in' | 'out' | 'heap'; t: number }>();
  private cartRun: { obj: THREE.Object3D; a: [number, number]; b: [number, number] } | null = null;
  private salts: [number, number][] = [];
  private corral: [number, number] | null = null;

  constructor(private world: World, private agents: Agents, private group: THREE.Group, a: ActiveExpedition) {
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
    } else if (kind === 'hunt') this.addBeast('wolf', cx, cz, 2.4, 0.5);
    else if (kind === 'boat') this.launch(a);
    else if (kind === 'fish') this.spots = this.bankSpots(a.party.length);
    else if (kind === 'mine') {
      const [rx, rz] = this.near(cx + 0.55, cz + 0.1, cx, cz);
      this.put(this.story === 'pass' ? copperGeo() : this.story === 'crater' ? meteorGeo() : rocksGeo(), rx, rz, 0);
      if (this.story === 'pass') { const [qx, qz] = this.near(cx - 0.5, cz - 0.45, cx, cz); this.put(cairnGeo(), qx, qz, 0); }
      if (this.story === 'crater') {
        // le cratère encore fumant, la pierre tombée du ciel qui rougeoie
        this.put(craterGeo(), rx, rz, 0);
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), GLOW);
        core.position.set(rx + 0.03, this.world.surfaceAt(rx, rz) + 0.1, rz + 0.04);
        this.group.add(core); this.props.push(core);
        this.emits.push({ x: rx, y: this.world.surfaceAt(rx, rz) + 0.12, z: rz, kind: 'smoke', every: 0.5, t: 0 });
      }
      const [kx, kz] = this.near(cx - 0.4, cz + 0.45, cx, cz);
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
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2, x = cx + Math.cos(ang) * 0.95, z = cz + Math.sin(ang) * 0.95;
        if (!this.free(x, z)) continue;
        // un piquet et les deux traverses qui le relient au précédent
        const o = new THREE.Group();
        o.position.set(x, this.world.surfaceAt(x, z), z);
        const post = new THREE.Mesh(stone ? stoneGeo() : postGeo(), mats.body);
        post.rotation.y = -ang;
        post.castShadow = true;
        o.add(post);
        if (!stone && i > 0) {
          const pa = ((i - 1) / n) * Math.PI * 2, px = cx + Math.cos(pa) * 0.95, pz = cz + Math.sin(pa) * 0.95;
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
        this.spots.push([cx + Math.cos(ang) * 0.7, cz + Math.sin(ang) * 0.7]);
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
      for (let i = 0; i < Math.max(3, bestN); i++) {
        const x = cx + Math.sin(best) * 0.3 * i, z = cz + Math.cos(best) * 0.3 * i;
        const o = this.put(trackGeo(), x, z, best);
        o.visible = false;
        this.built.push(o);
        this.spots.push([x + Math.cos(best) * 0.22, z - Math.sin(best) * 0.22]);
      }
    }
    this.heart(a, cx, cz);
  }

  // ---------------- Le cœur de la mission ----------------
  /** Ce pour quoi l'équipe est venue : on le pose sur place */
  private heart(a: ActiveExpedition, cx: number, cz: number) {
    const w = this.world, age = a.m.age, st = this.story, y = (x: number, z: number) => w.surfaceAt(x, z);
    const folk = AGE_VILLAGERS[Math.min(4, age)];
    if (st === 'salt') {
      // pierres à sel au bord de l'eau ; l'équipe guette, cachée derrière les buissons
      for (let i = 0; i < 3; i++) { const [x, z] = this.near(cx + Math.cos(i * 2.1) * 0.35, cz + Math.sin(i * 2.1) * 0.35, cx, cz); this.put(saltGeo(), x, z, i); this.salts.push([x, z]); }
      for (const s of [-1, 1]) { const [x, z] = this.near(cx - 0.85, cz + s * 0.35, cx, cz); this.put(bushGeo(), x, z, s); this.spots.push([x - 0.18, z]); }
    } else if (st === 'roundup') {
      const [x, z] = this.near(cx + 0.9, cz - 0.2, cx, cz);
      this.put(corralGeo(), x, z, 0);
      this.corral = [x, z];
      for (const b of this.beasts) b.speed = 0.34;
    } else if (st === 'smoke' || st === 'swarm') {
      // le vieux chêne enfumé ou l'arbre où l'essaim s'est posé ; les abeilles tournent autour
      const [tx, tz] = this.near(cx + 0.35, cz - 0.3, cx, cz), ty = y(tx, tz);
      this.put(st === 'smoke' ? oakGeo() : sproutTreeGeo(), tx, tz, 0);
      const hive = st === 'smoke' ? [tx, ty + 0.22, tz + 0.1] : [tx + 0.16, ty + 0.2, tz];
      this.bees(hive[0], hive[1], hive[2]);
      if (st === 'smoke') {
        this.fireAt(tx, tz + 0.28);
        this.emits.push({ x: tx, y: ty + 0.06, z: tz + 0.28, kind: 'smoke', every: 0.28, t: 0 });
        const [hx, hz] = this.near(cx - 0.35, cz + 0.3, cx, cz);
        this.grows.push({ obj: this.put(logHiveGeo(), hx, hz, 0), from: 0.001, to: 1 });
      } else {
        // la grappe d'abeilles se vide dans le panier de paille posé dessous
        const c = new THREE.Mesh(clusterGeo(), mats.body);
        c.position.set(hive[0], hive[1], hive[2]);
        this.group.add(c); this.props.push(c);
        this.grows.push({ obj: c, from: 1, to: 0.25 });
        this.put(skepGeo(), tx + 0.16, tz + 0.05, 0);
      }
      for (let i = 0; i < 4; i++) { const ang = i * 1.57 + 0.4; this.spots.push(this.near(tx + Math.cos(ang) * 0.32, tz + Math.sin(ang) * 0.32, cx, cz)); }
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
      const people: ModelName[] = nomads ? ['villager_barbarian', 'villager_hooded_rogue'] : [folk[1 % folk.length], folk[2 % folk.length]];
      people.forEach((m, i) => this.npc(m, cx + 0.28, cz + (i ? 0.14 : -0.12), -Math.PI / 2, TALK));
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
      // l'entrée : dans la pente pour une galerie ou un tunnel, la bouche de la grotte voisine sinon ; tas de minerai et wagonnet
      let mx = cx, mz = cz, found = false;
      const e = st === 'gallery' ? -1 : w.outpostEntrance(Math.floor(cx), Math.floor(cz), 1);
      if (e >= 0 && w.veg[e] === VEG_CAVE) {
        // la bouche de la grotte, du côté de l'équipe
        const x = e % N, z = Math.floor(e / N), ang = Math.atan2(cx - x - 0.5, cz - z - 0.5);
        mx = x + 0.5 + Math.sin(ang) * 0.6; mz = z + 0.5 + Math.cos(ang) * 0.6; found = true;
      } else if (e >= 0) {
        // le bord de la faille le plus proche
        let bd = Infinity;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz, d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (w.inCells(x, z) && w.decor[w.ci(x, z)] && d < bd) { bd = d; mx = x + 0.5; mz = z + 0.5; found = true; }
        }
      }
      if (!found) {
        let best = 0, gain = -1e9;
        for (let d = 0; d < 8; d++) { const ang = (d / 8) * Math.PI * 2, g = y(cx + Math.sin(ang) * 0.8, cz + Math.cos(ang) * 0.8) - y(cx, cz); if (g > gain) { gain = g; best = ang; } }
        [mx, mz] = this.near(cx + Math.sin(best) * 0.6, cz + Math.cos(best) * 0.6, cx, cz);
      }
      const face = Math.atan2(cx - mx, cz - mz);
      if (!found) this.put(galleryGeo(a.m.id === 'railway'), mx, mz, face);
      else for (const s of [-1, 1]) { const tx = mx + Math.cos(face) * s * 0.2, tz = mz - Math.sin(face) * s * 0.2; this.put(stakeTorchGeo(), tx, tz, 0); this.flameAt(tx, y(tx, tz) + 0.26, tz, 0.6); }
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
      this.mouth = { at: [mx + Math.sin(face) * 0.12, mz + Math.cos(face) * 0.12], heap: [hx, hz] };
    } else if (st === 'troupe') {
      // la roulotte des jongleurs, deux jongleurs et leurs balles, un tambour ; l'équipe applaudit en demi-cercle
      const [wx, wz] = this.near(cx + 0.6, cz - 0.4, cx, cz);
      this.put(wagonGeo(), wx, wz, 0.4);
      for (const [dx, dz] of [[0.2, -0.14], [0.24, 0.18]]) {
        const x = cx + dx, z = cz + dz, n = this.npc(dz < 0 ? 'villager_rogue' : 'villager_mage', x, z, -Math.PI / 2, ['Idle', 'idle']);
        if (!n) continue;
        const balls = [0xd8443a, 0xe8b84a, 0x4a7aa8].map((c) => { const m = new THREE.Mesh(ballGeo(c), mats.body); this.group.add(m); this.props.push(m); return m; });
        this.jugglers.push({ x, y: y(x, z), z, face: -Math.PI / 2, balls });
      }
      const [dx, dz] = this.near(cx + 0.45, cz + 0.4, cx, cz);
      this.put(drumGeo(), dx - 0.08, dz, 0);
      this.npc('villager_barbarian', dx, dz, -Math.PI / 2 - 0.5, SITTING);
      this.focus = [cx + 0.22, cz];
    } else if (st === 'abbey') {
      // la chapelle de l'abbaye, le frère qui touille sa cuve fumante, les tonneaux ; l'équipe écoute et goûte
      const [ax, az] = this.near(cx + 0.75, cz, cx, cz);
      this.put(chapelGeo(), ax, az, Math.PI);
      const kx = cx + 0.25, kz = cz;
      this.put(kettleGeo(), kx, kz, Math.PI / 2);
      this.emits.push({ x: kx, y: y(kx, kz) + 0.14, z: kz, kind: 'steam', every: 0.3, t: 0 });
      this.flameAt(kx, y(kx, kz) + 0.01, kz, 0.6);
      this.npc('villager_hooded_rogue', kx + 0.13, kz + 0.02, -Math.PI / 2, TALK);
      this.put(barrelsGeo(), cx + 0.42, cz + 0.32, 0);
      this.focus = [kx, kz];
    } else if (st === 'stars') {
      // lunettes braquées vers le ciel, l'astronome ; des étoiles filantes passent au-dessus
      for (const [dx, dz, r] of [[-0.32, -0.15, 0.4], [0.3, -0.2, -0.3], [0.02, 0.32, 2.8]]) { const [x, z] = this.near(cx + dx, cz + dz, cx, cz); this.put(telescopeGeo(), x, z, r); this.spots.push([x - Math.sin(r) * 0.12, z - Math.cos(r) * 0.12]); }
      this.npc(age >= 3 ? 'mini_male_e' : 'villager_mage', cx + 0.12, cz - 0.05, -0.8, TALK);
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
      let [sx, sz] = [cx, cz];
      if (st === 'basecamp') {
        [0xd8443a, 0xe8b84a, 0x4a7aa8].forEach((c, i) => { const [x, z] = this.near(cx + Math.cos(i * 2.1) * 0.4, cz + Math.sin(i * 2.1) * 0.4, cx, cz); this.put(tentGeoC(c), x, z, i * 2.1 + Math.PI / 2); });
        this.put(sacksGeo(), cx, cz, 0);
        [sx, sz] = this.near(cx + 0.9, cz - 0.55, cx, cz);
      }
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

  /** Un habitant d'ailleurs (voisin, nomade, moine, jongleur, astronome) qui reste à sa place et fait son geste */
  private npc(name: ModelName, x: number, z: number, face: number, anims: string[]) {
    const actor = hasModel(name) ? makeActor(name, 0.3, 'height') : null;
    if (!actor) return null;
    actor.root.position.set(x, this.world.surfaceAt(x, z), z);
    actor.root.rotation.y = face;
    actor.mixer.setTime(x * 7);
    this.group.add(actor.root);
    const n = { actor, anims };
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

  // ---------------- Mise en place ----------------
  private free(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz) && !w.decor[w.ci(cx, cz)];
  }

  /** Le point voulu s'il est libre, sinon un point libre plus près du centre */
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
    this.beasts.push({ obj, actor, x, z, tx: x, tz: z, heading: ang, wait: 1 + ang, speed: k === 'wolf' ? 0.55 : 0.16 });
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
    const k = Math.min(1, a.t / Math.max(1, a.c.work + a.extra));
    if (this.flame) { const f = 1 + Math.sin(this.t * 17) * 0.12 + Math.sin(this.t * 29) * 0.08; this.flame.scale.set(f, 1.1 + Math.sin(this.t * 13) * 0.2, f); }
    for (const b of this.beasts) this.stepBeast(b, dt, a);
    if (this.boat) this.stepBoat();
    // ouvrages qui avancent avec le travail, panier qui se remplit
    this.built.forEach((o, i) => (o.visible = k * this.built.length > i));
    if (this.basket) this.basket.scale.setScalar(Math.max(0.001, k));
    for (const s of this.spins) {
      if (s.speed) s.obj.rotation.y += dt * s.speed;
      else { const f = 1 + Math.sin(this.t * 17 + s.obj.position.x * 9) * 0.12; s.obj.scale.set(f, 1.1 + Math.sin(this.t * 13 + s.obj.position.z * 7) * 0.2, f); }
    }
    for (const g of this.grows) g.obj.scale.setScalar(Math.max(0.001, g.from + (g.to - g.from) * k));
    for (const n of this.npcs) { play(n.actor, n.anims); n.actor.mixer.update(dt); }
    for (const j of this.jugglers) j.balls.forEach((b, i) => {
      const ph = this.t * 4.2 + i * 2.094, side = Math.cos(ph) * 0.06, fx = Math.sin(j.face), fz = Math.cos(j.face);
      b.position.set(j.x + fx * 0.07 + fz * side, j.y + 0.3 + Math.abs(Math.sin(ph)) * 0.16, j.z + fz * 0.07 - fx * side);
    });
    if (this.cartRun) {
      // le wagonnet sort de la galerie, vide son chargement au tas, y retourne
      const u = 0.5 - Math.cos(this.t * 0.45) * 0.5, c = this.cartRun, x = c.a[0] + (c.b[0] - c.a[0]) * u, z = c.a[1] + (c.b[1] - c.a[1]) * u;
      c.obj.position.set(x, this.world.surfaceAt(x, z), z);
    }
    if (!a.wait) this.stepMembers(dt, a, k);
    this.stepRods(a);
    this.stepFx(dt, a);
  }

  private stepBeast(b: Beast, dt: number, a: ActiveExpedition) {
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
        const k = Math.min(1, a.t / Math.max(1, a.c.work + a.extra));
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

  /** La barque va et vient entre la berge et le large, en tanguant ; ses passagers y sont assis */
  private stepBoat() {
    const bt = this.boat!;
    // aller-retour lent (une vingtaine de secondes), pause au large le temps de pêcher
    const ph = (this.t / 22) % 1, u = ph < 0.3 ? smooth(ph / 0.3) : ph < 0.75 ? 1 : 1 - smooth((ph - 0.75) / 0.25);
    const x = bt.home[0] + (bt.out[0] - bt.home[0]) * u, z = bt.home[1] + (bt.out[1] - bt.home[1]) * u;
    const sway = Math.sin(this.t * 0.4) * 0.12, dir = Math.atan2(bt.out[0] - bt.home[0], bt.out[1] - bt.home[1]);
    let px = x + Math.cos(dir) * sway, pz = z - Math.sin(dir) * sway;
    if (this.depth(px, pz) === null) { px = x; pz = z; }
    const heading = dir + (ph >= 0.75 ? Math.PI : 0) + Math.sin(this.t * 0.4) * 0.15;
    const y = bt.y + 0.005 + Math.sin(this.t * 1.7) * 0.006;
    bt.obj.position.set(px, y, pz);
    bt.obj.rotation.set(Math.sin(this.t * 1.3) * 0.03, heading, Math.sin(this.t * 1.1) * 0.04);
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
        left = this.kind === 'hunt' ? 4 + Math.random() * 2 : this.kind === 'fish' || this.kind === 'boat' || this.kind === 'watch' || this.kind === 'spring' ? 1e9 : 5 + Math.random() * 3;
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
    if (this.kind === 'hunt') return 'stroll';
    if (st === 'salt') return k < 0.75 ? 'sit' : 'work';
    if (st === 'troupe') return (i + Math.floor(this.t / 5)) % 2 ? 'cheer' : 'sit';
    if (st === 'abbey') return (i + Math.floor(this.t / 7)) % 3 ? 'sit' : 'cheer';
    if (st === 'stars') return i < 3 ? 'work' : 'sit';
    if (this.kind === 'spring') return 'sit';
    return 'work';
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
    if (this.kind === 'hunt' && this.beasts.length) {
      const b = this.beasts[0], ang = Math.atan2(b.x - cx, b.z - cz) + (i - 1) * 0.35;
      const [x, z] = this.near(cx + Math.sin(ang) * 1.4, cz + Math.cos(ang) * 1.4, cx, cz);
      return [x, z, Math.atan2(b.x - x, b.z - z)];
    }
    if (this.kind === 'fish' || this.kind === 'boat') {
      const s = this.spots[i % this.spots.length], wat = this.water!;
      return [s[0], s[1], Math.atan2(wat.wet[0] - wat.bank[0], wat.wet[1] - wat.bank[1])];
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
      if (this.kind === 'mine' && this.props[0]) {
        this.fxTimer = 0.35 + Math.random() * 0.5;
        const p = this.props[0].position, o = new THREE.Mesh(puffGeo(), mats.body);
        this.group.add(o);
        this.fx.push({ obj: o, t: 0, life: 1.2, kind: 'puff', x: p.x + (Math.random() - 0.5) * 0.25, y: p.y + 0.08, z: p.z + (Math.random() - 0.5) * 0.25, vx: (Math.random() - 0.5) * 0.08, vz: (Math.random() - 0.5) * 0.08 });
      } else if ((this.kind === 'boat' || this.kind === 'fish') && this.water) {
        this.fxTimer = 2.5 + Math.random() * 3.5;
        const c = this.boat ? this.boat.obj.position : new THREE.Vector3(this.water.wet[0], 0, this.water.wet[1]);
        const ang = Math.random() * Math.PI * 2, x = c.x + Math.cos(ang) * 0.4, z = c.z + Math.sin(ang) * 0.4;
        if (this.depth(x, z) !== null) {
          const f = new THREE.Mesh(fishGeo(), mats.body), ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 12).rotateX(-Math.PI / 2), RING);
          this.group.add(f, ring);
          const vx = Math.cos(ang + 1.2) * 0.25, vz = Math.sin(ang + 1.2) * 0.25;
          this.fx.push({ obj: f, t: 0, life: 0.7, kind: 'fish', x, y: this.water.level, z, vx, vz });
          this.fx.push({ obj: ring, t: 0, life: 1.2, kind: 'ring', x: x + vx * 0.7, y: this.water.level + 0.005, z: z + vz * 0.7, vx: 0, vz: 0 });
        }
      } else this.fxTimer = 1;
    }
    for (const e of this.emits) {
      if ((e.t -= dt) > 0 || a.wait) continue;
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
      else if (f.kind === 'fish') {
        f.obj.position.set(f.x + f.vx * f.t, f.y + Math.sin(k * Math.PI) * 0.16, f.z + f.vz * f.t);
        f.obj.rotation.set(-Math.cos(k * Math.PI) * 1.1, Math.atan2(f.vx, f.vz), 0, 'YXZ');
      } else if (f.kind === 'steam' || f.kind === 'smoke') {
        f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * (f.kind === 'steam' ? 0.16 : 0.22), f.z + f.vz * f.t);
        f.obj.scale.setScalar(Math.sin(k * Math.PI) * (0.8 + k * 1.8));
      } else if (f.kind === 'bubble') { f.obj.position.set(f.x, f.y + k * 0.08, f.z); f.obj.scale.setScalar(1 - k * 0.5); }
      else if (f.kind === 'star') { f.obj.position.set(f.x + f.vx * f.t, f.y - f.t * 0.9, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI)); }
      else { f.obj.position.set(f.x, f.y, f.z); f.obj.scale.setScalar(1 + k * 3); }
      return true;
    });
  }

  /** Fin du travail sur place : on range tout (les passagers de la barque reviennent sur la berge) */
  dispose(a: ActiveExpedition) {
    for (const id of this.boat?.riders ?? []) this.agents.ride(id, null);
    for (const id of this.bath?.in ?? []) this.agents.ride(id, null);
    if (this.mouth) this.agents.partyHide(a.party, false);
    for (const n of this.npcs) { n.actor.mixer.stopAllAction(); this.group.remove(n.actor.root); }
    for (const b of this.beasts) { b.actor?.mixer.stopAllAction(); this.group.remove(b.obj); }
    for (const o of this.props) this.group.remove(o);
    for (const f of this.fx) this.group.remove(f.obj);
    for (const r of this.rods.values()) r.line.geometry.dispose();
    this.flame?.geometry.dispose();
    void a;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
