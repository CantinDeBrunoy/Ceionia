import * as THREE from 'three';
import { HellMap, HW, HL, HPOOL_LAVA, HLAVA_Y, HELL_ZONES, Z_CRYSTAL, zoneEnd } from '../world/hell';
import { caveLit } from './caveLight';
import { paint, merge } from './battleUnits';
import { hash2 } from '../core/rng';
import type { CombatFx } from './combatFx';

/**
 * Les petites bêtes des Enfers, qui n'ont rien à voir avec la guerre (l'équivalent de la faune de la surface) : chauves-souris
 * de feu en nuées qui tournoient, charognards qui planent au-dessus de la gorge des os et des falaises, salamandres qui
 * rampent au bord de la lave, poissons de lave qui sautent hors des bassins, feux follets qui dérivent entre les cristaux.
 * Purement décoratives : un maillage instancié par espèce, mis à jour près de la vue seulement
 */

interface Flyer { cx: number; cz: number; r: number; y: number; a: number; speed: number; bob: number }
interface Crawler { x: number; z: number; tx: number; tz: number; heading: number; wait: number; home: number[]; walk: number }
interface Leap { x: number; z: number; dx: number; dz: number; t: number; dur: number; h: number }
interface Wisp { cx: number; cy: number; cz: number; ph: number; sp: number }

/** Nuées de chauves-souris par zone (seuil, braises, rivière, falaises, os, cristaux, royaume) */
const BAT_FLOCKS = [1, 3, 2, 3, 2, 1, 3];
const CROWS = [0, 0, 0, 5, 7, 0, 3];
const SALAMANDERS = [0, 6, 8, 0, 0, 0, 6];
const WISPS = 26;
const LEAPS = 5;

export class HellCritters {
  group = new THREE.Group();
  private bats: Flyer[] = [];
  private crows: Flyer[] = [];
  private lizards: Crawler[] = [];
  private leaps: (Leap | null)[] = Array(LEAPS).fill(null);
  private wisps: Wisp[] = [];
  private lavaCells: number[] = [];
  private batMesh: THREE.InstancedMesh;
  private crowMesh: THREE.InstancedMesh;
  private lizMesh: THREE.InstancedMesh;
  private lizGlow: THREE.InstancedMesh;
  private fishMesh: THREE.InstancedMesh;
  private wispMesh: THREE.InstancedMesh;
  private haloMesh: THREE.InstancedMesh;
  private d = new THREE.Object3D();
  private leapT = 1;
  private first = true;

  constructor(readonly map: HellMap, private uTime: { value: number }) {
    const m = map, open = (x: number, z: number) => m.inside(Math.floor(x), Math.floor(z)) && m.open[Math.floor(z) * HW + Math.floor(x)] === 1;
    // nuées : autour d'un centre dans la zone (au-dessus de la faille ou d'une salle annexe)
    for (let zi = 0; zi < HELL_ZONES.length; zi++) {
      const z0 = HELL_ZONES[zi].z0, z1 = zoneEnd(zi);
      for (let f = 0; f < BAT_FLOCKS[zi]; f++) {
        const cz = z0 + (z1 - z0) * (f + 0.5) / BAT_FLOCKS[zi], cx = m.spine[Math.floor(cz)] + 0.5 + (hash2(zi, f, 1) - 0.5) * 8;
        const n = 4 + Math.floor(hash2(zi, f, 2) * 4);
        for (let i = 0; i < n; i++) this.bats.push({ cx: cx + (hash2(zi * 9 + f, i, 3) - 0.5) * 2, cz: cz + (hash2(zi * 9 + f, i, 4) - 0.5) * 2, r: 1.2 + hash2(zi * 9 + f, i, 5) * 2.6, y: 1.2 + hash2(zi * 9 + f, i, 6) * 1.1, a: hash2(zi * 9 + f, i, 7) * 6.28, speed: (1.1 + hash2(zi * 9 + f, i, 8) * 0.8) * (i % 3 ? 1 : -1), bob: hash2(zi * 9 + f, i, 9) * 6 });
      }
      // charognards : de grands cercles lents, haut au-dessus de la faille
      for (let i = 0; i < CROWS[zi]; i++) {
        const cz = z0 + (z1 - z0) * hash2(zi, i, 10);
        this.crows.push({ cx: m.spine[Math.floor(cz)] + 0.5, cz, r: 2.5 + hash2(zi, i, 11) * 4, y: 2.4 + hash2(zi, i, 12) * 1.2, a: hash2(zi, i, 13) * 6.28, speed: 0.35 + hash2(zi, i, 14) * 0.25, bob: hash2(zi, i, 15) * 6 });
      }
    }
    // les bords de la lave (où rampent les salamandres) et la lave elle-même (d'où sautent les poissons)
    const shore: number[][] = HELL_ZONES.map(() => []);
    for (let k = 0; k < HW * HL; k++) {
      const x = k % HW, z = Math.floor(k / HW);
      if (m.pool[k] === HPOOL_LAVA && !m.bridge[k]) {
        let inner = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.inside(x + dx, z + dz) || m.pool[(z + dz) * HW + x + dx] !== HPOOL_LAVA) inner = false;
        if (inner) this.lavaCells.push(k);
        continue;
      }
      if (!m.walkable(x, z)) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]])
        if (m.inside(x + dx, z + dz) && m.pool[(z + dz) * HW + x + dx] === HPOOL_LAVA) { shore[m.zone[k]].push(k); break; }
    }
    for (let zi = 0; zi < HELL_ZONES.length; zi++) {
      const cells = shore[zi];
      if (!cells.length) continue;
      for (let i = 0; i < SALAMANDERS[zi]; i++) {
        const k = cells[Math.floor(hash2(zi, i, 20) * cells.length)], x = (k % HW) + 0.5, z = Math.floor(k / HW) + 0.5;
        // son coin : les cases du bord à moins de 5 cases
        const home = cells.filter((c) => Math.hypot((c % HW) + 0.5 - x, Math.floor(c / HW) + 0.5 - z) < 5);
        this.lizards.push({ x, z, tx: x, tz: z, heading: hash2(zi, i, 21) * 6.28, wait: hash2(zi, i, 22) * 3, home, walk: 0 });
      }
    }
    // feux follets : entre les cristaux
    const zc = HELL_ZONES[Z_CRYSTAL];
    for (let i = 0, tries = 0; i < WISPS && tries < 500; tries++) {
      const z = zc.z0 + hash2(i, tries, 30) * (zoneEnd(Z_CRYSTAL) - zc.z0), x = m.spine[Math.floor(z)] + 0.5 + (hash2(i, tries, 31) - 0.5) * 18;
      if (!open(x, z)) continue;
      this.wisps.push({ cx: x, cy: 0.5 + hash2(i, 0, 32) * 0.9, cz: z, ph: hash2(i, 0, 33) * 6.28, sp: 0.4 + hash2(i, 0, 34) * 0.5 });
      i++;
    }

    const lit = (key: string, flap = 0) => caveLit(flapMat(this.uTime, flap, key), key);
    this.batMesh = this.mesh(batGeo(), lit('hell-bat', 1), this.bats.length, 0x3a1a22);
    this.crowMesh = this.mesh(crowGeo(), lit('hell-crow', 2), this.crows.length, 0x2a2228);
    this.lizMesh = this.mesh(lizardGeo(), caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true }), 'hell-lizard'), this.lizards.length, 0xffffff);
    this.lizGlow = this.mesh(lizardSpotsGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), this.lizards.length, 0xffffff);
    this.fishMesh = this.mesh(fishGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), LEAPS, 0xffffff);
    this.wispMesh = this.mesh(paint(new THREE.IcosahedronGeometry(0.05, 1), 0xffffff), new THREE.MeshBasicMaterial({ vertexColors: true }), this.wisps.length, 0xd8b8ff);
    this.haloMesh = this.mesh(paint(new THREE.IcosahedronGeometry(0.13, 1), 0xffffff), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }), this.wisps.length, 0xa070ff);
    this.wisps.forEach((_, i) => { const c = new THREE.Color([0xd8b8ff, 0x9ae8ff, 0xffb0e0][i % 3]); this.wispMesh.setColorAt(i, c); this.haloMesh.setColorAt(i, c.clone().multiplyScalar(0.7)); });
    this.fishMesh.count = 0;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, n: number, color: number) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) mesh.setColorAt(i, c);
    mesh.count = n;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  update(dt: number, tx: number, tz: number, range: number, fx: CombatFx) {
    const t = this.uTime.value, d = this.d, m = this.map;
    // (la première fois, tout le monde se place, même loin de la vue)
    const all = this.first;
    this.first = false;
    const near = (x: number, z: number) => all || (Math.abs(x - tx) < range && Math.abs(z - tz) < range);
    // les volants : un cercle qui dérive, des écarts, la hauteur qui ondule (les loin ne bougent pas, on ne les voit pas)
    const fly = (list: Flyer[], mesh: THREE.InstancedMesh, wob: number) => {
      list.forEach((b, i) => {
        if (!near(b.cx, b.cz)) return;
        b.a += (b.speed / b.r) * dt;
        const r = b.r * (1 + Math.sin(t * 0.7 + b.bob) * 0.25), x = b.cx + Math.cos(b.a) * r + Math.sin(t * 1.3 + b.bob) * wob, z = b.cz + Math.sin(b.a) * r;
        d.position.set(x, b.y + Math.sin(t * 2.1 + b.bob) * 0.18 * wob * 3, z);
        // tangent au cercle, penché dans le virage
        const sg = Math.sign(b.speed);
        d.rotation.set(0, Math.atan2(-Math.sin(b.a) * sg, Math.cos(b.a) * sg), sg * 0.35, 'YXZ');
        d.scale.setScalar(1);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    fly(this.bats, this.batMesh, 0.25);
    fly(this.crows, this.crowMesh, 0.05);
    // salamandres : d'une case du bord à l'autre, en ondulant, des pauses au soleil de la lave
    this.lizards.forEach((l, i) => {
      if (!near(l.x, l.z)) return;
      const dx = l.tx - l.x, dz = l.tz - l.z, dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        l.wait -= dt;
        if (l.wait <= 0 && l.home.length) {
          const k = l.home[Math.floor(Math.random() * l.home.length)];
          l.tx = (k % HW) + 0.2 + Math.random() * 0.6; l.tz = Math.floor(k / HW) + 0.2 + Math.random() * 0.6;
          l.wait = 1.5 + Math.random() * 4;
        }
      } else {
        const sp = Math.min(dist, dt * 0.55);
        l.x += (dx / dist) * sp; l.z += (dz / dist) * sp;
        const want = Math.atan2(dx, dz);
        l.heading += Math.atan2(Math.sin(want - l.heading), Math.cos(want - l.heading)) * Math.min(1, dt * 8);
        l.walk += dt * 14;
      }
      const moving = dist >= 0.05;
      d.position.set(l.x, m.groundY(l.x, l.z) + 0.01, l.z);
      d.rotation.set(0, l.heading + (moving ? Math.sin(l.walk) * 0.25 : Math.sin(t * 0.8 + i) * 0.05), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.lizMesh.setMatrixAt(i, d.matrix);
      this.lizGlow.setMatrixAt(i, d.matrix);
    });
    this.lizMesh.instanceMatrix.needsUpdate = true;
    this.lizGlow.instanceMatrix.needsUpdate = true;
    // feux follets : ils dérivent sur place en huit, palpitent
    this.wisps.forEach((w, i) => {
      if (!near(w.cx, w.cz)) return;
      const p = t * w.sp + w.ph;
      d.position.set(w.cx + Math.sin(p) * 0.6, w.cy + Math.sin(p * 2.3) * 0.15, w.cz + Math.sin(p * 2) * 0.35);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.85 + Math.sin(t * 5 + w.ph) * 0.2);
      d.updateMatrix();
      this.wispMesh.setMatrixAt(i, d.matrix);
      this.haloMesh.setMatrixAt(i, d.matrix);
    });
    this.wispMesh.instanceMatrix.needsUpdate = true;
    this.haloMesh.instanceMatrix.needsUpdate = true;
    // poissons de lave : de temps en temps, l'un saute hors d'un bassin proche, en arc, et replonge dans une gerbe
    this.leapT -= dt;
    if (this.leapT <= 0 && this.lavaCells.length) {
      this.leapT = 0.8 + Math.random() * 2.2;
      const slot = this.leaps.indexOf(null);
      if (slot >= 0) {
        for (let tries = 0; tries < 12; tries++) {
          const k = this.lavaCells[Math.floor(Math.random() * this.lavaCells.length)], x = (k % HW) + 0.5, z = Math.floor(k / HW) + 0.5;
          if (Math.hypot(x - tx, z - tz) > range * 0.7) continue;
          const a = Math.random() * 6.28;
          this.leaps[slot] = { x, z, dx: Math.sin(a), dz: Math.cos(a), t: 0, dur: 0.9 + Math.random() * 0.4, h: 0.5 + Math.random() * 0.5 };
          fx.chips(x, HLAVA_Y + 0.1, z, 0xff8a2a, 6);
          break;
        }
      }
    }
    let n = 0;
    this.leaps.forEach((l, i) => {
      if (!l) return;
      l.t += dt;
      const k = l.t / l.dur;
      if (k >= 1) { fx.chips(l.x + l.dx * 0.9, HLAVA_Y + 0.1, l.z + l.dz * 0.9, 0xff8a2a, 7); this.leaps[i] = null; return; }
      d.position.set(l.x + l.dx * 0.9 * k, HLAVA_Y + 4 * l.h * k * (1 - k), l.z + l.dz * 0.9 * k);
      d.rotation.set(-(Math.PI / 2) * (2 * k - 1) * 0.8, Math.atan2(l.dx, l.dz), 0, 'YXZ');
      d.scale.setScalar(1);
      d.updateMatrix();
      this.fishMesh.setMatrixAt(n++, d.matrix);
    });
    this.fishMesh.count = n;
    this.fishMesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Géométries (face à +z) ----------

/** Chauve-souris de feu : corps sombre, oreilles, yeux qui luisent, ailes en membrane festonnée (elles battent dans le shader) */
function batGeo() {
  const s = 1.6, parts: THREE.BufferGeometry[] = [
    paint(new THREE.IcosahedronGeometry(0.035 * s, 0).scale(0.9, 0.8, 1.4), 0xffffff),
    paint(new THREE.IcosahedronGeometry(0.025 * s, 0).translate(0, 0.01 * s, 0.045 * s), 0xffffff),
    ...[-1, 1].map((sd) => paint(new THREE.ConeGeometry(0.01 * s, 0.03 * s, 3).translate(sd * 0.014 * s, 0.035 * s, 0.045 * s), 0xffffff)),
    ...[-1, 1].map((sd) => paint(new THREE.BoxGeometry(0.008 * s, 0.006 * s, 0.004 * s).translate(sd * 0.01 * s, 0.014 * s, 0.07 * s), 0xffe040)),
  ];
  for (const sd of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(sd * 0.02, 0.025); sh.lineTo(sd * 0.11, 0.035); sh.lineTo(sd * 0.2, 0.005); sh.lineTo(sd * 0.16, -0.025); sh.lineTo(sd * 0.12, -0.012);
    sh.lineTo(sd * 0.09, -0.035); sh.lineTo(sd * 0.055, -0.018); sh.lineTo(sd * 0.02, -0.03);
    parts.push(paint(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).scale(s, s, s), 0x7a2a2a));
  }
  return merge(parts);
}

/** Charognard : corps noir, cou nu rougeâtre, bec crochu, grandes ailes digitées */
function crowGeo() {
  const parts: THREE.BufferGeometry[] = [
    paint(new THREE.IcosahedronGeometry(0.07, 0).scale(0.8, 0.7, 1.6), 0xffffff),
    paint(new THREE.CylinderGeometry(0.015, 0.025, 0.07, 4).rotateX(1.2).translate(0, 0.02, 0.12), 0x8a4a40),
    paint(new THREE.IcosahedronGeometry(0.025, 0).translate(0, 0.04, 0.16), 0x8a4a40),
    paint(new THREE.ConeGeometry(0.012, 0.05, 3).rotateX(Math.PI / 2 + 0.4).translate(0, 0.03, 0.19), 0xd8c8a0),
    paint(new THREE.ConeGeometry(0.06, 0.1, 3).rotateX(-Math.PI / 2).scale(1, 0.25, 1).translate(0, 0, -0.14), 0xffffff),
  ];
  for (const sd of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(sd * 0.04, 0.04); sh.lineTo(sd * 0.22, 0.03); sh.lineTo(sd * 0.36, -0.01); sh.lineTo(sd * 0.33, -0.04); sh.lineTo(sd * 0.3, -0.03);
    sh.lineTo(sd * 0.28, -0.06); sh.lineTo(sd * 0.24, -0.05); sh.lineTo(sd * 0.2, -0.07); sh.lineTo(sd * 0.04, -0.05);
    parts.push(paint(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), 0xffffff));
  }
  return merge(parts);
}

/** Salamandre de lave : corps sombre aplati, queue effilée, quatre pattes écartées, tête ronde */
function lizardGeo() {
  const DARK = 0x2a1a1a;
  return merge([
    paint(new THREE.IcosahedronGeometry(0.05, 0).scale(0.9, 0.45, 1.8).translate(0, 0.03, 0), DARK),
    paint(new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.6, 1.2).translate(0, 0.035, 0.1), DARK),
    paint(new THREE.ConeGeometry(0.03, 0.2, 4).rotateX(-Math.PI / 2).scale(1, 0.5, 1).translate(0, 0.025, -0.17), DARK),
    ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => paint(new THREE.BoxGeometry(0.06, 0.012, 0.015).rotateY(sz * sx * 0.5).translate(sx * 0.05, 0.012, sz * 0.045), DARK)),
  ]);
}
/** Ses taches de feu sur le dos, ses yeux */
function lizardSpotsGeo() {
  return merge([
    ...[0.05, 0, -0.05, -0.11].map((z, i) => paint(new THREE.IcosahedronGeometry(0.014 - i * 0.002, 0).scale(1.4, 0.5, 1).translate((i % 2 ? 1 : -1) * 0.012, 0.052 - i * 0.004, z), i % 2 ? 0xff8a1a : 0xffc040)),
    ...[-1, 1].map((s) => paint(new THREE.IcosahedronGeometry(0.009, 0).translate(s * 0.025, 0.05, 0.13), 0xffe060)),
  ]);
}

/** Poisson de lave : un fuseau incandescent, nageoires (tout luit) */
function fishGeo() {
  return merge([
    paint(new THREE.IcosahedronGeometry(0.06, 0).scale(0.6, 0.8, 1.7), 0xffa040, (t) => 0.8 + t * 0.4),
    paint(new THREE.ConeGeometry(0.06, 0.08, 3).rotateX(-Math.PI / 2).scale(0.2, 1, 1).translate(0, 0, -0.12), 0xff6a1a),
    paint(new THREE.ConeGeometry(0.03, 0.06, 3).scale(0.2, 1, 1).translate(0, 0.05, 0), 0xff6a1a),
    ...[-1, 1].map((s) => paint(new THREE.BoxGeometry(0.01, 0.012, 0.01).translate(s * 0.03, 0.015, 0.07), 0x2a0a08)),
  ]);
}

/** Matériau des ailes qui battent : les sommets loin du corps montent et descendent (chaque bête à son rythme) */
function flapMat(uTime: { value: number }, kind: number, key: string) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
  const [freq, amp, body] = kind === 1 ? [16, 1.1, 0.04] : [3.2, 0.5, 0.05];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float span = max(abs(transformed.x) - ${body.toFixed(3)}, 0.0);
  float ph = float(gl_InstanceID) * 1.37;
  float glide = ${kind === 2 ? 'clamp(sin(uTime * 0.5 + ph) * 2.0 - 0.6, 0.0, 1.0)' : '1.0'};
  transformed.y += sin(uTime * ${freq.toFixed(1)} + ph) * span * ${amp.toFixed(2)} * glide;`);
  };
  m.customProgramCacheKey = () => `flap-${key}`;
  return m;
}
