import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mulberry32 } from '../core/rng';
import type { Actor } from './assets';

/**
 * Bêtes sauvages articulées, dessinées par le jeu faute de modèle animé libre de droits (ours, éléphant, girafe, crocodile,
 * tortue, chameau, élan, lézard, crabe) : chaque bête est un vrai maillage à squelette (os du bassin, du poitrail, du cou,
 * de la tête, de la mâchoire, des oreilles, de la queue, pattes en deux segments…) et ses animations (marche, course,
 * repos, broutage, sommeil, gestes propres) sont des clips calculés une fois ; elle se joue comme les modèles Quaternius
 * (même mélangeur, mêmes noms d'animation : Walk, Gallop, Idle, Eating, Sleep…)
 */

type V3 = [number, number, number];
type Coat = Record<string, number>;

const TAU = Math.PI * 2;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
const _ca = new THREE.Color(), _cb = new THREE.Color();

// ---------- Formes ----------

/** ellipsoïde à facettes */
const ell = (rx: number, ry: number, rz: number, d = 1) => new THREE.IcosahedronGeometry(1, d).scale(rx, ry, rz);
const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** segment (tronc de cône) de p à q, rayon r1 en p et r2 en q */
function seg(p: V3, q: V3, r1: number, r2: number, n = 6) {
  const a = _v.set(...p), d = _w.set(...q).sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, n).translate(0, len / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(UP, d.normalize()));
  return g.translate(p[0], p[1], p[2]);
}
/** point d'un segment p→q à la fraction t */
const along = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const mirror = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Rotation qui dresse +y selon la direction n */
function rotTo(n: THREE.Vector3): V3 {
  _q.setFromUnitVectors(UP, n);
  _e.setFromQuaternion(_q);
  return [_e.x, _e.y, _e.z];
}

/** Point d'un ellipsoïde (centre c, demi-axes r) à la latitude `lat` et à la longitude `lon` (0 = vers l'avant), et sa normale */
function onEll(c: V3, r: V3, lat: number, lon: number, lift = 0.001): { at: V3; rot: V3 } {
  const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
  const n = new THREE.Vector3(dx / r[0], dy / r[1], dz / r[2]).normalize();
  return { at: [c[0] + r[0] * dx + n.x * lift, c[1] + r[1] * dy + n.y * lift, c[2] + r[2] * dz + n.z * lift], rot: rotTo(n) };
}

/** Point de la surface d'un segment p→q (rayons r1, r2) à la fraction t et à l'angle a autour de l'axe (0 = côté +x), et sa normale */
function onSeg(p: V3, q: V3, r1: number, r2: number, t: number, a: number, lift = 0.001): { at: V3; rot: V3 } {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize();
  const e1 = new THREE.Vector3(1, 0, 0).addScaledVector(d, -d.x).normalize(), e2 = new THREE.Vector3().crossVectors(d, e1);
  const n = e1.multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).normalize();
  const r = r1 + (r2 - r1) * t + lift, c = along(p, q, t);
  return { at: [c[0] + n.x * r, c[1] + n.y * r, c[2] + n.z * r], rot: rotTo(n) };
}

// ---------- Squelette ----------

/**
 * Bête en construction : des os (nom, parent, pivot dans le repère du modèle) et des pièces rattachées chacune à un os,
 * d'une couleur unie ou d'un dégradé du dessous (`color`) au dessus (`top`) : ventre plus sombre, dos plus clair
 */
class Rig {
  names: string[] = [];
  parents: number[] = [];
  pivots: THREE.Vector3[] = [];
  private geos: THREE.BufferGeometry[] = [];

  bone(name: string, parent: string | null, x: number, y: number, z: number) {
    this.names.push(name);
    this.parents.push(parent === null ? -1 : this.idx(parent));
    this.pivots.push(new THREE.Vector3(x, y, z));
  }
  idx(name: string) {
    const i = this.names.indexOf(name);
    if (i < 0) throw new Error(`os inconnu : ${name}`);
    return i;
  }
  has(name: string) { return this.names.includes(name); }

  /** pièce posée en `at`, tournée de `rot` (angles d'Euler) */
  add(bone: string, g: THREE.BufferGeometry, at: V3, color: number, rot: V3 = [0, 0, 0], top?: number) {
    let ng = g;
    if (g.index) { ng = g.toNonIndexed(); g.dispose(); }
    ng.deleteAttribute('uv');
    ng.deleteAttribute('normal');
    _m.compose(_v.set(...at), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), ONE);
    ng.applyMatrix4(_m);
    ng.computeVertexNormals();
    const pos = ng.attributes.position, n = pos.count, bi = this.idx(bone);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { lo = Math.min(lo, pos.getY(i)); hi = Math.max(hi, pos.getY(i)); }
    _ca.setHex(color); _cb.setHex(top ?? color);
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = top === undefined ? 0 : smooth((pos.getY(i) - lo) / Math.max(1e-6, hi - lo) * 1.3 - 0.15);
      col[i * 3] = _ca.r + (_cb.r - _ca.r) * t; col[i * 3 + 1] = _ca.g + (_cb.g - _ca.g) * t; col[i * 3 + 2] = _ca.b + (_cb.b - _ca.b) * t;
      si[i * 4] = bi; sw[i * 4] = 1;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ng.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    ng.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.geos.push(ng);
  }
  /** pièce déjà placée (segment…) */
  put(bone: string, g: THREE.BufferGeometry, color: number, top?: number) { this.add(bone, g, [0, 0, 0], color, [0, 0, 0], top); }
  /** la même pièce des deux côtés (s = 1 côté gauche +x, s = -1 côté droit), os nommés `${nom}L` / `${nom}R` si `side` */
  both(fn: (s: number, L: string) => void) { fn(1, 'L'); fn(-1, 'R'); }

  build(): THREE.Group {
    const geo = mergeGeometries(this.geos, false)!;
    for (const g of this.geos) g.dispose();
    const bones = this.names.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    const root = new THREE.Group();
    bones.forEach((b, i) => {
      const p = this.parents[i];
      b.position.copy(this.pivots[i]);
      if (p >= 0) { b.position.sub(this.pivots[p]); bones[p].add(b); } else root.add(b);
    });
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 }));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    return root;
  }
}

// ---------- Poses et clips ----------

/** Pose d'une image : rotations (Euler, ordre YXZ), décalages de position et échelles des os */
interface Pose { r: Record<string, V3>; p: Record<string, V3>; s: Record<string, V3> }
type PoseFn = (u: number, P: Pose) => void;
type ClipDef = [name: string, dur: number, fn: PoseFn];

const sn = (u: number, f = 1, ph = 0) => Math.sin(TAU * (u * f + ph));
const cs = (u: number, f = 1, ph = 0) => Math.cos(TAU * (u * f + ph));
/** créneau adouci : 0 hors de [a, b], 1 au milieu, rampes de largeur e */
const win = (u: number, a: number, b: number, e: number) => smooth((u - a) / e) * smooth((b - u) / e);
/** brève impulsion autour de u0 (oreille qui frémit, coup de langue) */
const blip = (u: number, u0: number, w = 0.04) => Math.max(0, 1 - Math.abs(u - u0) / w);
const pos = (x: number) => Math.max(0, x);

/** ajoute une rotation à un os */
function R(P: Pose, b: string, x: number, y = 0, z = 0) { const v = P.r[b] ?? (P.r[b] = [0, 0, 0]); v[0] += x; v[1] += y; v[2] += z; }
/** décale un os */
function M(P: Pose, b: string, x: number, y: number, z: number) { const v = P.p[b] ?? (P.p[b] = [0, 0, 0]); v[0] += x; v[1] += y; v[2] += z; }
/** échelle d'un os */
function S(P: Pose, b: string, x: number, y: number, z: number) { P.s[b] = [x, y, z]; }
/** respiration : le torse se gonfle */
const breathe = (P: Pose, u: number, n: number, k = 1) => { const b = sn(u, n); S(P, 'ribs', 1 + 0.014 * b * k, 1 + 0.024 * b * k, 1 + 0.006 * b * k); };

/**
 * Pas d'un quadrupède : chaque patte (préfixe d'os, phase) balance d'avant en arrière (`A`) et plie le genou en avançant (`L`)
 * — la patte avance quand cos > 0, et c'est là qu'elle se lève
 */
function stride(P: Pose, u: number, ph: Record<string, number>, A: number, L: number) {
  for (const b in ph) {
    const w = TAU * (u - ph[b]);
    R(P, b + '1', -A * Math.sin(w));
    R(P, b + '2', L * Math.pow(pos(Math.cos(w)), 1.5));
  }
}

/** Clip d'animation : la pose est échantillonnée sur la durée (u de 0 à 1, la pose de u = 1 rejoint celle de u = 0) */
function makeClip(rig: Rig, [name, dur, fn]: ClipDef): THREE.AnimationClip {
  const n = Math.max(24, Math.ceil(dur * 14));
  const times: number[] = [], poses: Pose[] = [];
  for (let i = 0; i <= n; i++) {
    const P: Pose = { r: {}, p: {}, s: {} };
    fn(i / n, P);
    poses.push(P);
    times.push((i / n) * dur);
  }
  const tracks: THREE.KeyframeTrack[] = [];
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), prev = new THREE.Quaternion();
  rig.names.forEach((b, bi) => {
    const qv: number[] = [];
    poses.forEach((P, i) => {
      const r = P.r[b] ?? [0, 0, 0];
      q.setFromEuler(e.set(r[0], r[1], r[2], 'YXZ'));
      // continuité : pas de demi-tour entre deux images
      if (i && q.dot(prev) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev.copy(q);
      qv.push(q.x, q.y, q.z, q.w);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, qv));
    if (poses.some((P) => P.p[b])) {
      const rest = rig.pivots[bi].clone();
      const pi = rig.parents[bi];
      if (pi >= 0) rest.sub(rig.pivots[pi]);
      tracks.push(new THREE.VectorKeyframeTrack(`${b}.position`, times, poses.flatMap((P) => { const o = P.p[b] ?? [0, 0, 0]; return [rest.x + o[0], rest.y + o[1], rest.z + o[2]]; })));
    }
    if (poses.some((P) => P.s[b])) tracks.push(new THREE.VectorKeyframeTrack(`${b}.scale`, times, poses.flatMap((P) => P.s[b] ?? [1, 1, 1])));
  });
  return new THREE.AnimationClip(name, dur, tracks);
}

// ---------- Quadrupèdes ----------

interface Gait { dur: number; A: number; L: number; ph: Record<string, number>; bob: number; rock?: number }
interface Quad {
  walk: Gait;
  run: Gait;
  /** os du cou, de la base vers la tête, et leur flexion pour brouter (puis celle de la tête) */
  neck: string[];
  graze: number[];
  grazeHead: number;
  /** couché : abaissement du corps, plis des pattes avant et arrière (épaule, genou) ; null : dort debout */
  lie: { drop: number; f: [number, number]; h: [number, number] } | null;
  /** mouvements propres à l'espèce, ajoutés à chaque clip (trompe, oreilles, langue…) */
  hook?: (clip: string, u: number, P: Pose) => void;
}

const ears = (P: Pose, x: number, z: number) => { R(P, 'eL', x, 0, z); R(P, 'eR', x, 0, -z); };

/** Clips communs des quadrupèdes : marche, course, repos (regard, oreilles, queue, respiration), broutage, sommeil */
function quadClips(q: Quad): ClipDef[] {
  const head = (P: Pose, x: number, y = 0) => R(P, 'head', x, y);
  const hook = (n: string, u: number, P: Pose) => q.hook?.(n, u, P);
  return [
    ['Walk', q.walk.dur, (u, P) => {
      stride(P, u, q.walk.ph, q.walk.A, q.walk.L);
      M(P, 'hips', 0, -q.walk.bob * cs(u, 2), 0);
      R(P, 'hips', 0, 0.03 * sn(u), 0.03 * sn(u));
      R(P, 'chest', 0, -0.03 * sn(u), -0.045 * sn(u));
      R(P, q.neck[0], 0.05 * sn(u, 2, 0.1), 0.04 * sn(u, 1, 0.2));
      head(P, -0.03 * sn(u, 2, 0.1), 0.06 * sn(u, 1, 0.3));
      R(P, 'tail1', 0.1, 0.18 * sn(u));
      ears(P, 0, 0.08 * sn(u, 2));
      breathe(P, u, 2, 0.6);
      hook('Walk', u, P);
    }],
    ['Gallop', q.run.dur, (u, P) => {
      stride(P, u, q.run.ph, q.run.A, q.run.L);
      M(P, 'hips', 0, q.run.bob * (pos(sn(u, 1, -0.1)) - 0.4), 0);
      R(P, 'hips', (q.run.rock ?? 0.1) * sn(u));
      R(P, 'chest', -(q.run.rock ?? 0.1) * sn(u, 1, 0.2));
      R(P, q.neck[0], 0.12 * sn(u, 1, 0.35));
      head(P, -0.06 * sn(u, 1, 0.35));
      R(P, 'tail1', -0.5 + 0.15 * sn(u));
      ears(P, -0.55, 0);
      hook('Gallop', u, P);
    }],
    ['Idle', 6, (u, P) => {
      breathe(P, u, 3);
      const look = Math.sin(TAU * u) * win(u, 0.05, 0.95, 0.15);
      R(P, q.neck[0], 0.04 * sn(u, 2, 0.3), 0.15 * look);
      head(P, 0.06 * sn(u, 2, 0.3), 0.3 * look);
      ears(P, 0, 0.45 * blip(u, 0.22) + 0.3 * blip(u, 0.7));
      R(P, 'eR', 0, 0, -0.4 * blip(u, 0.47));
      R(P, 'tail1', 0.1, 0.35 * sn(u, 3) * win(u, 0.3, 0.65, 0.05));
      R(P, 'jaw', 0.06 * pos(sn(u, 8)) * win(u, 0.55, 0.95, 0.05));
      R(P, 'hips', 0, 0, 0.015 * sn(u));
      hook('Idle', u, P);
    }],
    ['Eating', 4, (u, P) => {
      breathe(P, u, 2);
      q.neck.forEach((b, i) => R(P, b, q.graze[i] + 0.04 * sn(u, 2, i * 0.1), i ? 0 : 0.12 * sn(u)));
      head(P, q.grazeHead + 0.08 * pos(sn(u, 4)), 0.15 * sn(u, 1, 0.2));
      R(P, 'jaw', 0.16 * pos(sn(u, 6)));
      R(P, 'chest', 0.04);
      ears(P, 0.1, 0.3 * blip(u, 0.35));
      R(P, 'tail1', 0.1, 0.3 * sn(u, 2) * win(u, 0.6, 0.9, 0.05));
      // un pas de côté de temps en temps
      R(P, 'fL1', -0.15 * win(u, 0.4, 0.62, 0.08));
      R(P, 'fL2', 0.4 * win(u, 0.42, 0.55, 0.05));
      hook('Eating', u, P);
    }],
    ['Sleep', 8, (u, P) => {
      breathe(P, u, 2, 1.5);
      if (q.lie) {
        M(P, 'hips', 0, -q.lie.drop, 0);
        for (const L of ['L', 'R']) {
          R(P, `f${L}1`, q.lie.f[0]); R(P, `f${L}2`, q.lie.f[1]);
          R(P, `h${L}1`, q.lie.h[0]); R(P, `h${L}2`, q.lie.h[1]);
        }
        R(P, q.neck[0], 0.25, 0.2);
        head(P, 0.3, 0.35);
      } else {
        R(P, q.neck[0], 0.35);
        head(P, 0.2);
        R(P, 'hL2', 0.3);
      }
      ears(P, 0.3, -0.25);
      R(P, 'tail1', 0.2);
      hook('Sleep', u, P);
    }],
  ];
}

// ---------- Ours ----------

const BEAR_COATS: Coat[] = [
  // brun, grizzly fauve, ours noir
  { fur: 0x4a3222, top: 0x7a5434, tip: 0x9a7650, leg: 0x3a281c, muzzle: 0xa8845c, paw: 0x2e221a, inner: 0x2a1e18 },
  { fur: 0x5e4430, top: 0x977450, tip: 0xc0a07a, leg: 0x46342a, muzzle: 0xc0a07a, paw: 0x3a2c24, inner: 0x34261e },
  { fur: 0x221c1c, top: 0x383030, tip: 0x504644, leg: 0x1a1616, muzzle: 0x9a7a5a, paw: 0x161212, inner: 0x2a2020 },
];

/**
 * Ours : corps massif à la bosse du garrot, fourrure à deux tons (pattes plus sombres, dos et bosse plus clairs, quelques
 * jarres claires), tête large au front bombé, museau clair et truffe noire, oreilles rondes, griffes claires aux larges
 * pattes ; démarche lourde qui roule des épaules, galop bondissant, se dresse sur ses pattes arrière pour humer l'air,
 * fouille le sol de la patte et du museau
 */
function bear(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  r.bone('hips', null, 0, 0.15, -0.05);
  r.bone('chest', 'hips', 0, 0.155, 0.03);
  r.bone('ribs', 'chest', 0, 0.155, 0.03);
  r.bone('neck', 'chest', 0, 0.175, 0.1);
  r.bone('head', 'neck', 0, 0.172, 0.135);
  r.bone('jaw', 'head', 0, 0.152, 0.17);
  r.both((s, L) => r.bone(`e${L}`, 'head', s * 0.03, 0.202, 0.148));
  r.bone('tail1', 'hips', 0, 0.17, -0.13);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.044, 0.14, 0.075);
    r.bone(`f${L}2`, `f${L}1`, s * 0.044, 0.078, 0.08);
    r.bone(`h${L}1`, 'hips', s * 0.046, 0.145, -0.085);
    r.bone(`h${L}2`, `h${L}1`, s * 0.046, 0.075, -0.09);
  });

  // corps : croupe, torse (qui respire), bosse du garrot, ventre, jabot
  r.add('hips', ell(0.066, 0.066, 0.075), [0, 0.152, -0.055], c.fur, [0, 0, 0], c.top);
  r.add('ribs', ell(0.07, 0.074, 0.085), [0, 0.158, 0.035], c.fur, [0, 0, 0], c.top);
  r.add('ribs', ell(0.056, 0.03, 0.085), [0, 0.108, 0], c.leg);
  r.add('chest', ell(0.056, 0.036, 0.066), [0, 0.2, 0.048], c.top, [0.15, 0, 0], c.tip);
  r.add('chest', ell(0.05, 0.05, 0.03), [0, 0.132, 0.096], c.fur);
  // longs poils qui pendent sous le ventre et derrière les bras
  r.both((s) => {
    for (let i = 0; i < 6; i++) {
      const z = 0.07 - i * 0.026, b = z > 0.0 ? 'ribs' : 'hips';
      r.put(b, seg([s * 0.05, 0.112, z], [s * 0.052, 0.088, z - 0.01], 0.012, 0.002, 4), c.fur);
    }
  });
  // cou et tête
  r.add('neck', ell(0.046, 0.05, 0.046), [0, 0.17, 0.118], c.fur, [0, 0, 0], c.top);
  r.add('head', ell(0.044, 0.04, 0.042), [0, 0.178, 0.152], c.fur, [0, 0, 0], c.top);
  r.add('head', ell(0.03, 0.022, 0.03), [0, 0.196, 0.164], c.top);
  r.both((s) => r.add('head', ell(0.022, 0.024, 0.024), [s * 0.03, 0.165, 0.158], c.fur));
  r.add('head', ell(0.022, 0.019, 0.032), [0, 0.162, 0.192], c.muzzle, [0.1, 0, 0]);
  r.add('head', ell(0.012, 0.008, 0.008, 0), [0, 0.171, 0.222], 0x141010);
  r.both((s) => r.add('head', ell(0.0055, 0.006, 0.004, 0), [s * 0.02, 0.186, 0.184], 0x120c0a));
  r.add('jaw', ell(0.017, 0.008, 0.026, 0), [0, 0.148, 0.19], c.muzzle);
  r.add('jaw', ell(0.024, 0.016, 0.02, 0), [0, 0.146, 0.168], c.fur);
  // oreilles rondes, intérieur sombre
  r.both((s, L) => {
    r.add(`e${L}`, ell(0.014, 0.014, 0.007), [s * 0.031, 0.212, 0.147], c.fur, [0, 0, -s * 0.2], c.top);
    r.add(`e${L}`, ell(0.0085, 0.0085, 0.004, 0), [s * 0.031, 0.211, 0.152], c.inner, [0, 0, -s * 0.2]);
  });
  r.add('tail1', ell(0.014, 0.012, 0.016, 0), [0, 0.172, -0.136], c.top);
  // pattes : bras épais, avant-bras, larges pattes aux griffes claires
  r.both((s, L) => {
    const x = s * 0.044, hx = s * 0.046;
    r.add(`f${L}1`, ell(0.026, 0.048, 0.032), [s * 0.04, 0.12, 0.074], c.leg, [0, 0, 0], c.fur);
    r.put(`f${L}2`, seg([x, 0.08, 0.08], [x, 0.016, 0.084], 0.021, 0.023, 7), c.leg);
    r.add(`f${L}2`, ell(0.024, 0.012, 0.03), [x, 0.012, 0.092], c.paw);
    for (let i = -1.5; i <= 1.5; i++) r.put(`f${L}2`, seg([x + i * 0.009, 0.01, 0.114], [x + i * 0.0095, 0.002, 0.127], 0.0035, 0.0008, 4), 0xd8ccb0);
    r.add(`h${L}1`, ell(0.032, 0.056, 0.042), [s * 0.04, 0.124, -0.078], c.leg, [0, 0, 0], c.fur);
    r.put(`h${L}2`, seg([hx, 0.078, -0.09], [hx, 0.016, -0.082], 0.021, 0.022, 7), c.leg);
    r.add(`h${L}2`, ell(0.023, 0.011, 0.036), [hx, 0.011, -0.074], c.paw);
    for (let i = -1.5; i <= 1.5; i++) r.put(`h${L}2`, seg([hx + i * 0.0085, 0.008, -0.042], [hx + i * 0.009, 0.002, -0.033], 0.003, 0.0007, 4), 0xd8ccb0);
  });

  const ph = { hL: 0, fL: 0.2, hR: 0.5, fR: 0.7 };
  const clips = quadClips({
    walk: { dur: 1.2, A: 0.36, L: 0.75, ph, bob: 0.003 },
    run: { dur: 0.6, A: 0.75, L: 1.1, ph: { hL: 0, hR: 0.08, fL: 0.45, fR: 0.55 }, bob: 0.014, rock: 0.14 },
    neck: ['neck'], graze: [0.55], grazeHead: 0.3,
    lie: { drop: 0.075, f: [-1.35, 0.25], h: [-1.0, 2.0] },
    hook: (n, u, P) => {
      // l'ours marche tête basse en la balançant
      if (n === 'Walk') { R(P, 'neck', 0.16); R(P, 'head', 0, 0.06 * sn(u)); }
    },
  }).filter(([n]) => n !== 'Eating');
  clips.push(
    // se dresse sur ses pattes arrière, hume l'air en tournant la tête, puis retombe
    ['Idle_2', 6, (u, P) => {
      const k = win(u, 0.08, 0.86, 0.2);
      breathe(P, u, 4);
      R(P, 'hips', -1.1 * k);
      M(P, 'hips', 0, 0.03 * k, -0.024 * k);
      for (const L of ['L', 'R']) { R(P, `h${L}1`, 1.1 * k); R(P, `h${L}2`, -0.08 * k); }
      R(P, 'chest', -0.15 * k);
      R(P, 'fL1', 0.75 * k + 0.12 * k * sn(u, 3)); R(P, 'fR1', 0.75 * k + 0.12 * k * sn(u, 3, 0.3));
      R(P, 'fL2', 0.75 * k); R(P, 'fR2', 0.75 * k);
      R(P, 'neck', 0.85 * k);
      R(P, 'head', 0.1 * k - 0.14 * k * pos(sn(u, 5)), 0.45 * k * sn(u, 1, 0.1));
      ears(P, -0.2 * k, 0.3 * blip(u, 0.5));
      R(P, 'tail1', 0.3 * k);
    }],
    // fouille : museau au sol, une patte avant qui gratte la terre
    ['Eating', 3, (u, P) => {
      breathe(P, u, 2);
      R(P, 'neck', 0.55, 0.08 * sn(u));
      R(P, 'head', 0.3 + 0.1 * sn(u, 6), 0.2 * sn(u));
      R(P, 'chest', 0.1);
      M(P, 'hips', 0, -0.004, 0);
      R(P, 'fR1', -0.35 + 0.45 * sn(u, 2));
      R(P, 'fR2', 0.6 * pos(cs(u, 2)));
      R(P, 'jaw', 0.12 * pos(sn(u, 5)));
      R(P, 'hips', 0, 0, 0.03 * sn(u, 2));
      ears(P, 0.1, 0.25 * blip(u, 0.6));
    }],
    // hume l'air, museau levé, en remuant la truffe
    ['Idle_3', 4, (u, P) => {
      const k = win(u, 0.05, 0.95, 0.2);
      breathe(P, u, 3);
      R(P, 'neck', -0.3 * k, 0.15 * k * sn(u));
      R(P, 'head', -0.3 * k + 0.06 * k * sn(u, 8), 0.25 * k * sn(u, 1, 0.25));
      ears(P, -0.15 * k, 0);
    }],
  );
  return { rig: r, clips };
}

// ---------- Éléphant ----------

const ELEPHANT_COATS: Coat[] = [
  { skin: 0x908e94, top: 0xaaa8ae, dark: 0x747278, ear: 0xa48c90, tusk: 0xf2ead2, nail: 0xd8d0c0, tuft: 0x2e2a2a },
  { skin: 0x84807e, top: 0x9e9894, dark: 0x6a6664, ear: 0x9a8282, tusk: 0xeee2c4, nail: 0xd0c6b4, tuft: 0x262222 },
  { skin: 0x9c968e, top: 0xb4aea6, dark: 0x7e7872, ear: 0xb09a96, tusk: 0xf4ecd8, nail: 0xdcd4c4, tuft: 0x302c2a },
];

/**
 * Éléphant : masse grise au dos voûté, grandes oreilles qui battent, trompe en trois segments annelés, défenses ivoire
 * recourbées, pattes en piliers aux ongles clairs, queue à toupet ; marche lente et ample, charge oreilles déployées
 * trompe levée, cueille l'herbe de la trompe et la porte à la bouche, barrit
 */
function elephant(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  r.bone('hips', null, 0, 0.18, -0.05);
  r.bone('chest', 'hips', 0, 0.19, 0.04);
  r.bone('ribs', 'chest', 0, 0.19, 0.04);
  r.bone('neck', 'chest', 0, 0.21, 0.1);
  r.bone('head', 'neck', 0, 0.215, 0.12);
  r.bone('jaw', 'head', 0, 0.168, 0.15);
  const t0: V3 = [0, 0.18, 0.188], t1: V3 = [0, 0.118, 0.198], t2: V3 = [0, 0.062, 0.2], t3: V3 = [0, 0.024, 0.192];
  r.bone('trunk1', 'head', ...t0);
  r.bone('trunk2', 'trunk1', ...t1);
  r.bone('trunk3', 'trunk2', ...t2);
  r.both((s, L) => r.bone(`e${L}`, 'head', s * 0.042, 0.232, 0.132));
  r.bone('tail1', 'hips', 0, 0.21, -0.125);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.044, 0.16, 0.072);
    r.bone(`f${L}2`, `f${L}1`, s * 0.044, 0.088, 0.072);
    r.bone(`h${L}1`, 'hips', s * 0.044, 0.165, -0.078);
    r.bone(`h${L}2`, `h${L}1`, s * 0.044, 0.088, -0.08);
  });

  // corps : croupe tombante, torse (qui respire), échine saillante, ventre plus sombre
  r.add('hips', ell(0.068, 0.076, 0.08), [0, 0.186, -0.055], c.dark, [0, 0, 0], c.top);
  r.add('ribs', ell(0.074, 0.082, 0.088), [0, 0.192, 0.035], c.dark, [0, 0, 0], c.top);
  r.add('chest', ell(0.046, 0.03, 0.08), [0, 0.252, 0.02], c.skin, [0.1, 0, 0], c.top);
  // tête : front bombé, bosses du crâne, yeux, bouche
  r.add('neck', ell(0.052, 0.058, 0.036), [0, 0.205, 0.11], c.dark, [0, 0, 0], c.skin);
  r.add('head', ell(0.048, 0.054, 0.046), [0, 0.218, 0.15], c.dark, [0, 0, 0], c.top);
  r.both((s) => r.add('head', ell(0.022, 0.02, 0.02), [s * 0.018, 0.255, 0.16], c.top));
  r.both((s) => r.add('head', ell(0.005, 0.005, 0.004, 0), [s * 0.038, 0.218, 0.172], 0x161212));
  r.add('jaw', ell(0.022, 0.012, 0.024, 0), [0, 0.16, 0.162], c.dark);
  r.add('jaw', ell(0.014, 0.006, 0.012, 0), [0, 0.162, 0.182], 0xa87a78);
  // défenses : deux segments, vers l'avant puis vers le haut
  r.both((s) => {
    const a: V3 = [s * 0.02, 0.168, 0.176], b: V3 = [s * 0.025, 0.148, 0.222], tip: V3 = [s * 0.03, 0.158, 0.25];
    r.put('head', seg(a, b, 0.0075, 0.0055), c.tusk);
    r.put('head', seg(b, tip, 0.0055, 0.0012), c.tusk);
  });
  // trompe annelée, narines au bout
  r.put('trunk1', seg(t0, t1, 0.023, 0.018, 7), c.skin);
  r.put('trunk2', seg(t1, t2, 0.018, 0.013, 7), c.skin);
  r.put('trunk3', seg(t2, t3, 0.013, 0.011, 6), c.skin);
  for (const [b, p, q, rr] of [['trunk1', t0, t1, 0.023], ['trunk2', t1, t2, 0.018], ['trunk3', t2, t3, 0.013]] as [string, V3, V3, number][])
    for (const f of [0.3, 0.55, 0.8]) r.put(b, seg(along(p, q, f), along(p, q, f + 0.04), rr * 1.03, rr * 1.02, 7), c.dark);
  r.add('trunk3', ell(0.013, 0.006, 0.013, 0), [0, 0.022, 0.191], c.dark);
  // grandes oreilles : face externe grise, face interne rosée
  r.both((s, L) => {
    r.add(`e${L}`, ell(0.006, 0.068, 0.056), [s * 0.06, 0.205, 0.105], c.skin, [0, -s * 0.5, 0], c.top);
    r.add(`e${L}`, ell(0.004, 0.056, 0.046), [s * 0.056, 0.205, 0.11], c.ear, [0, -s * 0.5, 0]);
  });
  // queue à toupet
  r.put('tail1', seg([0, 0.21, -0.125], [0, 0.135, -0.15], 0.006, 0.004, 5), c.skin);
  r.add('tail1', ell(0.007, 0.016, 0.007, 0), [0, 0.128, -0.152], c.tuft);
  // pattes en piliers, pieds ronds aux ongles clairs
  r.both((s, L) => {
    const x = s * 0.044;
    r.add(`f${L}1`, ell(0.034, 0.05, 0.04), [x, 0.15, 0.07], c.dark, [0, 0, 0], c.skin);
    r.put(`f${L}2`, seg([x, 0.092, 0.072], [x, 0.012, 0.072], 0.028, 0.031, 8), c.dark);
    r.add(`h${L}1`, ell(0.036, 0.056, 0.046), [x, 0.15, -0.075], c.dark, [0, 0, 0], c.skin);
    r.put(`h${L}2`, seg([x, 0.092, -0.08], [x, 0.012, -0.08], 0.027, 0.03, 8), c.dark);
    for (const [b, z] of [[`f${L}2`, 0.072], [`h${L}2`, -0.08]] as [string, number][]) {
      r.put(b, seg([x, 0, z], [x, 0.014, z], 0.034, 0.032, 8), c.dark);
      for (const i of [-1, 0, 1]) r.add(b, ell(0.007, 0.006, 0.004, 0), [x + i * 0.014, 0.006, z + 0.031], c.nail);
    }
  });

  const ph = { hL: 0, fL: 0.2, hR: 0.5, fR: 0.7 };
  /** oreilles écartées de la tête (angle autour de la charnière) */
  const flap = (P: Pose, a: number) => { R(P, 'eL', 0, -a); R(P, 'eR', 0, a); };
  const trunk = (P: Pose, a: number, b: number, d: number, y = 0) => { R(P, 'trunk1', a, y); R(P, 'trunk2', b, y * 0.6); R(P, 'trunk3', d, y * 0.4); };
  const clips = quadClips({
    walk: { dur: 1.6, A: 0.28, L: 0.6, ph, bob: 0.004 },
    run: { dur: 0.85, A: 0.42, L: 0.8, ph, bob: 0.01, rock: 0.05 },
    neck: ['neck'], graze: [0.12], grazeHead: 0.12,
    lie: null,
    hook: (n, u, P) => {
      if (n === 'Walk') {
        // la trompe balance comme un pendule, les oreilles battent doucement
        trunk(P, 0.12 * sn(u, 1, 0.2), 0.18 * sn(u, 1, 0.1), 0.25 * sn(u), 0.1 * sn(u, 1, 0.3));
        ears(P, 0, 0);
        flap(P, 0.15 + 0.1 * sn(u, 2));
      } else if (n === 'Gallop') {
        // charge : oreilles déployées, trompe levée
        ears(P, 0.55, 0);
        flap(P, 0.9);
        trunk(P, -0.9 + 0.1 * sn(u), -0.6, -0.5 + 0.15 * sn(u, 1, 0.3));
        R(P, 'head', -0.15);
      } else if (n === 'Idle') {
        // éventail des oreilles, trompe qui se balance et s'enroule
        const fan = pos(sn(u, 4)) * win(u, 0.1, 0.9, 0.1);
        flap(P, 0.2 + 0.5 * fan);
        trunk(P, 0.1 * sn(u, 1), 0.25 * sn(u, 1, -0.1) + 0.3 * win(u, 0.55, 0.8, 0.08), 0.4 * sn(u, 1, -0.2) + 0.6 * win(u, 0.55, 0.8, 0.08), 0.15 * sn(u, 2));
      } else if (n === 'Eating') {
        // la trompe cueille au sol puis porte à la bouche
        const reach = win(u, 0.0, 0.45, 0.12), feed = win(u, 0.5, 0.95, 0.12);
        trunk(P, -0.35 * reach + 0.3 * feed, -0.1 * reach + 1.3 * feed, -0.3 * reach + 1.5 * feed, 0.15 * reach * sn(u, 4));
        flap(P, 0.2 + 0.2 * pos(sn(u, 3)));
      } else if (n === 'Sleep') {
        // somnole debout, la trompe posée au sol
        trunk(P, -0.12, 0.05, -0.25);
        flap(P, 0.05);
      }
    },
  });
  clips.push(
    // barrit : tête levée, trompe dressée, oreilles grandes ouvertes
    ['Idle_2', 4, (u, P) => {
      const k = win(u, 0.1, 0.85, 0.18);
      breathe(P, u, 2);
      R(P, 'neck', -0.15 * k); R(P, 'head', -0.25 * k);
      trunk(P, -1.6 * k, -0.9 * k + 0.2 * k * sn(u, 6), -0.7 * k + 0.3 * k * sn(u, 6, 0.2));
      flap(P, 0.2 + 0.8 * k);
      R(P, 'jaw', 0.35 * k);
      R(P, 'fL1', -0.2 * k); R(P, 'fL2', 0.5 * k * win(u, 0.2, 0.7, 0.1));
      R(P, 'tail1', -0.4 * k);
    }],
    // s'asperge de poussière : trompe repliée sur le dos
    ['Idle_3', 4, (u, P) => {
      const k = win(u, 0.1, 0.9, 0.2);
      breathe(P, u, 2);
      trunk(P, -0.4 * k, -1.4 * k - 0.3 * k * pos(sn(u, 3)), -1.2 * k, 0.4 * k * sn(u, 1, 0.2));
      R(P, 'head', -0.1 * k);
      flap(P, 0.3 + 0.3 * pos(sn(u, 3)));
    }],
  );
  return { rig: r, clips };
}

// ---------- Girafe ----------

const GIRAFFE_COATS: Coat[] = [
  { base: 0xe8b860, spot: 0x8a5228, belly: 0xf4e2bc, mane: 0x6a4024, muzzle: 0xd8b888, hoof: 0x3a2e28 },
  { base: 0xf0c878, spot: 0xa0602c, belly: 0xf8ecd0, mane: 0x7a4a26, muzzle: 0xe4c89c, hoof: 0x3e3028 },
  { base: 0xdcae5c, spot: 0x6e4224, belly: 0xf0dcb0, mane: 0x5a3820, muzzle: 0xd0b080, hoof: 0x342a24 },
];

/** Pose couchée des ongulés : pattes avant repliées sous le poitrail, pattes arrière ramenées sous le ventre */
const TUCK = (drop: number) => ({ drop, f: [1.35, -2.45] as [number, number], h: [-1.15, 2.3] as [number, number] });

/**
 * Girafe : très long cou en deux segments, crinière courte, ossicônes aux bouts sombres, robe réticulée de taches brunes,
 * hautes pattes aux genoux saillants, queue à toupet ; marche l'amble (les deux pattes d'un côté ensemble) en balançant
 * le cou, galope, broute les cimes en tirant la langue, écarte les pattes avant pour boire
 */
function giraffe(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig(), rnd = mulberry32(77);
  const n0: V3 = [0, 0.25, 0.065], n1: V3 = [0, 0.34, 0.094], n2: V3 = [0, 0.432, 0.112];
  r.bone('hips', null, 0, 0.22, -0.045);
  r.bone('chest', 'hips', 0, 0.235, 0.03);
  r.bone('ribs', 'chest', 0, 0.235, 0.03);
  r.bone('n1', 'chest', ...n0);
  r.bone('n2', 'n1', ...n1);
  r.bone('head', 'n2', ...n2);
  r.bone('jaw', 'head', 0, 0.428, 0.14);
  r.bone('tongue', 'head', 0, 0.426, 0.15);
  r.both((s, L) => r.bone(`e${L}`, 'head', s * 0.014, 0.448, 0.118));
  r.bone('tail1', 'hips', 0, 0.245, -0.09);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.022, 0.215, 0.055);
    r.bone(`f${L}2`, `f${L}1`, s * 0.022, 0.112, 0.057);
    r.bone(`h${L}1`, 'hips', s * 0.022, 0.215, -0.062);
    r.bone(`h${L}2`, `h${L}1`, s * 0.022, 0.112, -0.07);
  });

  // corps qui monte vers le garrot, ventre clair, taches
  const hipC: V3 = [0, 0.226, -0.04], hipR: V3 = [0.034, 0.038, 0.056], ribC: V3 = [0, 0.238, 0.03], ribR: V3 = [0.038, 0.045, 0.06];
  r.add('hips', ell(...hipR), hipC, c.belly, [0, 0, 0], c.base);
  r.add('ribs', ell(...ribR), ribC, c.belly, [0, 0, 0], c.base);
  r.add('chest', ell(0.03, 0.03, 0.036), [0, 0.268, 0.046], c.base, [0.3, 0, 0]);
  const spot = (b: string, at: V3, rot: V3, k = 1) => r.add(b, ell(0.011 * k * (0.8 + rnd() * 0.4), 0.0025, 0.01 * k * (0.8 + rnd() * 0.4), 0), at, c.spot, [rot[0], rot[1], rot[2]]);
  // taches en réseau : réparties en rangées sur les flancs et le dos
  for (const [b, C, Rr] of [['hips', hipC, hipR], ['ribs', ribC, ribR]] as [string, V3, V3][])
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 8; i++) {
        const o = onEll(C, Rr, -0.45 + row * 0.42 + (rnd() - 0.5) * 0.15, (i + (row % 2) * 0.5) * (TAU / 8) + (rnd() - 0.5) * 0.2);
        spot(b, o.at, o.rot, 1.35);
      }
  // cou : deux segments, crinière, taches
  r.put('n1', seg(n0, n1, 0.026, 0.02, 7), c.base);
  r.put('n2', seg(n1, n2, 0.02, 0.016, 7), c.base);
  for (const [b, p, q, r1, r2] of [['n1', n0, n1, 0.026, 0.02], ['n2', n1, n2, 0.02, 0.016]] as [string, V3, V3, number, number][]) {
    for (let i = 0; i < 14; i++) {
      const o = onSeg(p, q, r1, r2, 0.08 + (i / 14) * 0.88, (i * 2.4) % TAU);
      spot(b, o.at, o.rot, 0.95);
    }
    // crinière courte le long de la nuque
    const back = new THREE.Vector3(0, q[2] - p[2], -(q[1] - p[1])).normalize();
    for (let i = 0; i < 4; i++) {
      const a = along(p, q, i / 4 + 0.05), w = r1 + (r2 - r1) * (i / 4);
      r.put(b, seg([0, a[1] + back.y * w * 0.8, a[2] + back.z * w * 0.8], [0, a[1] + back.y * (w + 0.008), a[2] + back.z * (w + 0.008)], 0.006, 0.003, 4), c.mane);
    }
  }
  // tête : crâne, museau, naseaux, yeux, ossicônes, oreilles
  r.add('head', ell(0.017, 0.018, 0.026), [0, 0.443, 0.124], c.base);
  r.add('head', ell(0.013, 0.013, 0.022), [0, 0.432, 0.152], c.muzzle, [0.15, 0, 0]);
  r.both((s) => {
    r.add('head', ell(0.003, 0.003, 0.002, 0), [s * 0.007, 0.436, 0.172], 0x2a1e1a);
    r.add('head', ell(0.0045, 0.0045, 0.0035, 0), [s * 0.016, 0.448, 0.13], 0x161010);
    r.put('head', seg([s * 0.008, 0.455, 0.114], [s * 0.011, 0.476, 0.11], 0.0042, 0.0034, 5), c.base);
    r.add('head', ell(0.005, 0.005, 0.005, 0), [s * 0.011, 0.478, 0.11], c.mane);
  });
  r.add('jaw', ell(0.01, 0.006, 0.018, 0), [0, 0.422, 0.15], c.muzzle);
  // langue (rentrée dans la bouche, elle sort pour cueillir)
  r.add('tongue', bx(0.006, 0.003, 0.022), [0, 0.426, 0.152], 0x3a2a4a);
  r.both((s, L) => r.add(`e${L}`, ell(0.012, 0.005, 0.006, 0), [s * 0.024, 0.448, 0.116], c.base, [0, 0, s * 0.4]));
  // queue fine à toupet sombre
  r.put('tail1', seg([0, 0.245, -0.09], [0, 0.17, -0.104], 0.0035, 0.0025, 4), c.base);
  r.add('tail1', ell(0.006, 0.016, 0.006, 0), [0, 0.162, -0.106], c.mane);
  // hautes pattes : cuisses, genoux saillants, sabots
  r.both((s, L) => {
    const x = s * 0.022;
    r.add(`f${L}1`, ell(0.018, 0.04, 0.022), [x, 0.198, 0.055], c.base);
    r.put(`f${L}1`, seg([x, 0.2, 0.055], [x, 0.112, 0.057], 0.011, 0.009), c.base);
    r.add(`f${L}2`, ell(0.01, 0.011, 0.01, 0), [x, 0.112, 0.057], c.base);
    r.put(`f${L}2`, seg([x, 0.112, 0.057], [x, 0.012, 0.058], 0.008, 0.0075), c.belly);
    r.add(`h${L}1`, ell(0.02, 0.044, 0.026), [x, 0.19, -0.062], c.base);
    r.put(`h${L}1`, seg([x, 0.19, -0.062], [x, 0.112, -0.07], 0.012, 0.009), c.base);
    r.add(`h${L}2`, ell(0.01, 0.011, 0.01, 0), [x, 0.112, -0.07], c.base);
    r.put(`h${L}2`, seg([x, 0.112, -0.07], [x, 0.012, -0.064], 0.008, 0.0075), c.belly);
    for (const [b, z] of [[`f${L}2`, 0.059], [`h${L}2`, -0.063]] as [string, number][]) r.put(b, seg([x, 0, z], [x, 0.013, z], 0.011, 0.0085, 6), c.hoof);
    for (let i = 0; i < 2; i++) { const o = onSeg([x, 0.2, 0.055], [x, 0.112, 0.057], 0.011, 0.009, 0.3 + i * 0.4, s > 0 ? 0 : Math.PI); spot(`f${L}1`, o.at, o.rot, 0.6); }
  });

  const pace = { hL: 0, fL: 0.06, hR: 0.5, fR: 0.56 };
  const clips = quadClips({
    walk: { dur: 1.4, A: 0.3, L: 0.7, ph: pace, bob: 0.004 },
    run: { dur: 0.8, A: 0.6, L: 1.0, ph: { hL: 0, hR: 0.1, fL: 0.45, fR: 0.55 }, bob: 0.016, rock: 0.1 },
    neck: ['n1', 'n2'], graze: [0.9, 0.5], grazeHead: 0.3,
    lie: TUCK(0.15),
    hook: (n, u, P) => {
      // le long cou balance au rythme des pas, fortement au galop
      if (n === 'Walk') { R(P, 'n1', 0.06 * sn(u, 2, 0.15)); R(P, 'n2', -0.04 * sn(u, 2, 0.25)); }
      if (n === 'Gallop') { R(P, 'n1', 0.25 * sn(u, 1, 0.3) + 0.25); R(P, 'n2', -0.15 * sn(u, 1, 0.4)); }
      if (n === 'Sleep') { R(P, 'n1', -0.25); R(P, 'n2', 0.2); }
    },
  }).filter(([n]) => n !== 'Eating');
  clips.push(
    // broute les cimes : cou dressé, tête levée, langue qui s'enroule autour des feuilles
    ['Eating', 5, (u, P) => {
      breathe(P, u, 2);
      R(P, 'n1', -0.25 + 0.04 * sn(u, 1), 0.12 * sn(u));
      R(P, 'n2', -0.15);
      R(P, 'head', -0.55 + 0.1 * pos(sn(u, 3)), 0.15 * sn(u, 1, 0.3));
      const lick = Math.max(blip(u, 0.2, 0.07), blip(u, 0.52, 0.07), blip(u, 0.8, 0.07));
      M(P, 'tongue', 0, 0.002 * lick, 0.02 * lick);
      R(P, 'tongue', -0.4 * lick);
      R(P, 'jaw', 0.25 * lick + 0.12 * pos(sn(u, 8)) * (1 - lick));
      ears(P, 0, 0.3 * blip(u, 0.65));
      R(P, 'tail1', 0, 0.4 * sn(u, 3) * win(u, 0.3, 0.6, 0.05));
    }],
    // boit : pattes avant écartées, long cou plongé vers l'eau, langue qui lape
    ['Drink', 5, (u, P) => {
      const k = win(u, 0.0, 1.0, 0.18);
      breathe(P, u, 2);
      R(P, 'fL1', 0, 0, 0.36 * k); R(P, 'fR1', 0, 0, -0.36 * k);
      R(P, 'fL2', 0, 0, -0.1 * k); R(P, 'fR2', 0, 0, 0.1 * k);
      M(P, 'chest', 0, -0.02 * k, 0);
      R(P, 'chest', 0.12 * k);
      R(P, 'n1', 1.25 * k); R(P, 'n2', 0.55 * k);
      R(P, 'head', 0.25 * k);
      const lap = pos(sn(u, 6)) * win(u, 0.25, 0.8, 0.05);
      M(P, 'tongue', 0, 0, 0.015 * lap);
      R(P, 'jaw', 0.2 * lap);
      ears(P, 0, 0.3 * blip(u, 0.5));
    }],
    // tend le cou pour regarder au loin
    ['Idle_2', 5, (u, P) => {
      const k = win(u, 0.1, 0.9, 0.2);
      breathe(P, u, 2);
      R(P, 'n1', -0.2 * k, 0.25 * k * sn(u, 1, 0.1)); R(P, 'n2', -0.1 * k);
      R(P, 'head', 0.1 * k, 0.4 * k * sn(u, 1, 0.15));
      ears(P, -0.2 * k, 0.3 * blip(u, 0.4));
      R(P, 'jaw', 0.1 * pos(sn(u, 10)));
    }],
  );
  return { rig: r, clips };
}

// ---------- Chameau ----------

const CAMEL_COATS: Coat[] = [
  { base: 0xc89a64, hair: 0x9a6c40, belly: 0xdcbc8c, leg: 0xd2aa74, knee: 0x7a5a3a, foot: 0x8a6c50, muzzle: 0xb89068 },
  { base: 0xb48452, hair: 0x845a34, belly: 0xceac7c, leg: 0xc09460, knee: 0x6a4c30, foot: 0x7a5e44, muzzle: 0xa47c58 },
  { base: 0xd8b07a, hair: 0xac8050, belly: 0xe8cca0, leg: 0xdcb888, knee: 0x86663e, foot: 0x967858, muzzle: 0xc49e74 },
];

/**
 * Chameau : deux bosses coiffées de longs poils, cou en S, tête aux lèvres pendantes et aux naseaux fendus, barbe sous la
 * gorge, hautes pattes aux genoux calleux et larges pieds ; marche l'amble en dodelinant, mâchonne de côté, s'agenouille
 * pour dormir
 */
function camel(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  const n0: V3 = [0, 0.165, 0.075], n1: V3 = [0, 0.19, 0.13], n2: V3 = [0, 0.262, 0.142];
  r.bone('hips', null, 0, 0.15, -0.04);
  r.bone('chest', 'hips', 0, 0.155, 0.035);
  r.bone('ribs', 'chest', 0, 0.155, 0.035);
  r.bone('n1', 'chest', ...n0);
  r.bone('n2', 'n1', ...n1);
  r.bone('head', 'n2', ...n2);
  r.bone('jaw', 'head', 0, 0.258, 0.168);
  r.both((s, L) => r.bone(`e${L}`, 'head', s * 0.012, 0.284, 0.143));
  r.bone('tail1', 'hips', 0, 0.168, -0.088);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.024, 0.14, 0.055);
    r.bone(`f${L}2`, `f${L}1`, s * 0.024, 0.07, 0.058);
    r.bone(`h${L}1`, 'hips', s * 0.026, 0.145, -0.06);
    r.bone(`h${L}2`, `h${L}1`, s * 0.026, 0.07, -0.068);
  });

  // corps et bosses aux poils plus longs et plus sombres
  r.add('hips', ell(0.036, 0.04, 0.052), [0, 0.152, -0.04], c.belly, [0, 0, 0], c.base);
  r.add('ribs', ell(0.038, 0.043, 0.056), [0, 0.155, 0.03], c.belly, [0, 0, 0], c.base);
  r.add('chest', ell(0.027, 0.034, 0.028), [0, 0.198, 0.034], c.base, [0, 0, 0], c.hair);
  r.add('hips', ell(0.026, 0.032, 0.027), [0, 0.194, -0.034], c.base, [0, 0, 0], c.hair);
  for (const [b, z, y] of [['chest', 0.034, 0.23], ['hips', -0.034, 0.224]] as [string, number, number][]) {
    r.add(b, ell(0.018, 0.009, 0.018, 0), [0, y, z], c.hair);
    r.both((s) => r.add(b, ell(0.012, 0.007, 0.014, 0), [s * 0.014, y - 0.008, z + s * 0.004], c.hair, [0, 0, s * 0.4]));
  }
  // cou en S : il descend vers l'avant puis se relève ; barbe sous la gorge
  r.put('n1', seg(n0, n1, 0.019, 0.015, 7), c.base);
  r.add('n1', ell(0.009, 0.014, 0.026), [0, 0.168, 0.108], c.hair, [-0.45, 0, 0]);
  r.put('n2', seg(n1, n2, 0.015, 0.013, 7), c.base);
  r.add('n2', ell(0.008, 0.02, 0.01, 0), [0, 0.2, 0.15], c.hair);
  // tête : crâne, museau, lèvres pendantes, naseaux, yeux sous de lourdes paupières, petites oreilles
  r.add('head', ell(0.016, 0.016, 0.024), [0, 0.274, 0.155], c.base);
  r.add('head', ell(0.013, 0.012, 0.02), [0, 0.266, 0.182], c.muzzle);
  r.both((s) => {
    r.put('head', seg([s * 0.006, 0.272, 0.198], [s * 0.008, 0.27, 0.202], 0.0025, 0.002, 4), 0x3a2a20);
    r.add('head', ell(0.0045, 0.004, 0.0035, 0), [s * 0.015, 0.282, 0.162], 0x1a1210);
    r.add('head', ell(0.007, 0.003, 0.006, 0), [s * 0.014, 0.287, 0.162], c.hair);
  });
  r.add('jaw', ell(0.011, 0.006, 0.016, 0), [0, 0.254, 0.182], c.muzzle);
  r.add('jaw', ell(0.009, 0.004, 0.006, 0), [0, 0.252, 0.196], c.knee);
  r.both((s, L) => r.add(`e${L}`, ell(0.006, 0.008, 0.004, 0), [s * 0.014, 0.29, 0.143], c.base, [0, 0, s * 0.3]));
  // queue à toupet
  r.put('tail1', seg([0, 0.168, -0.088], [0, 0.12, -0.096], 0.004, 0.003, 4), c.base);
  r.add('tail1', ell(0.005, 0.012, 0.005, 0), [0, 0.114, -0.097], c.hair);
  // pattes : cuisses, genoux calleux, larges pieds
  r.both((s, L) => {
    const x = s * 0.024, hx = s * 0.026;
    r.add(`f${L}1`, ell(0.016, 0.034, 0.02), [x, 0.124, 0.054], c.base);
    r.put(`f${L}1`, seg([x, 0.12, 0.055], [x, 0.07, 0.058], 0.01, 0.008), c.leg);
    r.add(`f${L}2`, ell(0.009, 0.009, 0.01, 0), [x, 0.07, 0.06], c.knee);
    r.put(`f${L}2`, seg([x, 0.07, 0.058], [x, 0.01, 0.06], 0.007, 0.0065), c.leg);
    r.add(`f${L}2`, ell(0.013, 0.006, 0.016), [x, 0.005, 0.064], c.foot);
    r.add(`h${L}1`, ell(0.019, 0.04, 0.025), [hx, 0.125, -0.058], c.base);
    r.put(`h${L}1`, seg([hx, 0.12, -0.06], [hx, 0.07, -0.068], 0.01, 0.008), c.leg);
    r.add(`h${L}2`, ell(0.008, 0.008, 0.009, 0), [hx, 0.07, -0.068], c.knee);
    r.put(`h${L}2`, seg([hx, 0.07, -0.068], [hx, 0.01, -0.062], 0.007, 0.0065), c.leg);
    r.add(`h${L}2`, ell(0.013, 0.006, 0.016), [hx, 0.005, -0.058], c.foot);
  });

  const clips = quadClips({
    walk: { dur: 1.25, A: 0.32, L: 0.8, ph: { hL: 0, fL: 0.05, hR: 0.5, fR: 0.55 }, bob: 0.004 },
    run: { dur: 0.65, A: 0.55, L: 1.0, ph: { hL: 0, fL: 0.08, hR: 0.5, fR: 0.58 }, bob: 0.012, rock: 0.05 },
    neck: ['n1', 'n2'], graze: [0.8, 0.6], grazeHead: 0.25,
    lie: { drop: 0.1, f: [1.45, -2.7], h: [-1.25, 2.5] },
    hook: (n, u, P) => {
      // l'amble fait rouler le corps d'un côté à l'autre, la tête dodeline
      if (n === 'Walk') { R(P, 'hips', 0, 0, 0.05 * sn(u)); R(P, 'chest', 0, 0, 0.03 * sn(u)); R(P, 'n2', 0.06 * sn(u, 2, 0.3)); R(P, 'head', -0.08 * sn(u, 2, 0.3)); }
      if (n === 'Gallop') { R(P, 'hips', 0, 0, 0.08 * sn(u)); R(P, 'n1', -0.2); R(P, 'head', -0.2); }
      // mâchonne en faisant aller la mâchoire de côté
      if (n === 'Idle' || n === 'Eating') R(P, 'jaw', 0.06 * pos(sn(u, 8)), 0.18 * sn(u, 8));
      if (n === 'Sleep') { R(P, 'n1', -0.3); R(P, 'n2', 0.3); }
    },
  });
  clips.push(
    // blatère : cou tendu, tête levée, bouche ouverte
    ['Idle_2', 4, (u, P) => {
      const k = win(u, 0.15, 0.85, 0.2);
      breathe(P, u, 3);
      R(P, 'n1', -0.4 * k); R(P, 'n2', 0.5 * k);
      R(P, 'head', -0.5 * k, 0.1 * k * sn(u, 2));
      R(P, 'jaw', 0.35 * k * (0.7 + 0.3 * sn(u, 5)));
      ears(P, -0.3 * k, 0);
    }],
  );
  return { rig: r, clips };
}

// ---------- Élan ----------

const MOOSE_COATS: Coat[] = [
  { fur: 0x3e2c20, top: 0x58402c, leg: 0x9a8a78, muzzle: 0x5e4636, antler: 0xd2c09c, tip: 0xeee4cc, hoof: 0x261e1a },
  { fur: 0x2e221c, top: 0x463428, leg: 0x8a7c6c, muzzle: 0x4e3a2e, antler: 0xc8b490, tip: 0xe6dcc2, hoof: 0x201a16 },
  { fur: 0x4e3a2a, top: 0x6a503a, leg: 0xa89884, muzzle: 0x6a5242, antler: 0xdccaa8, tip: 0xf2ead4, hoof: 0x2a221c },
];

/**
 * Élan : haute carcasse sombre à la bosse du garrot, pattes claires et fines, long museau busqué qui retombe, fanon
 * qui pend sous la gorge, grandes oreilles, larges bois palmés hérissés d'andouillers ; marche à grandes enjambées,
 * trotte quand il fuit, broute, secoue ses bois
 */
function moose(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  const n0: V3 = [0, 0.205, 0.072], n1: V3 = [0, 0.228, 0.118];
  r.bone('hips', null, 0, 0.17, -0.05);
  r.bone('chest', 'hips', 0, 0.18, 0.03);
  r.bone('ribs', 'chest', 0, 0.18, 0.03);
  r.bone('neck', 'chest', ...n0);
  r.bone('head', 'neck', ...n1);
  r.bone('jaw', 'head', 0, 0.215, 0.16);
  r.bone('bell', 'head', 0, 0.214, 0.132);
  r.both((s, L) => r.bone(`e${L}`, 'head', s * 0.018, 0.256, 0.124));
  r.bone('tail1', 'hips', 0, 0.188, -0.105);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.026, 0.165, 0.06);
    r.bone(`f${L}2`, `f${L}1`, s * 0.026, 0.088, 0.062);
    r.bone(`h${L}1`, 'hips', s * 0.028, 0.168, -0.07);
    r.bone(`h${L}2`, `h${L}1`, s * 0.028, 0.088, -0.078);
  });

  // corps : croupe basse, torse, haute bosse du garrot
  r.add('hips', ell(0.037, 0.042, 0.055), [0, 0.172, -0.045], c.fur, [0, 0, 0], c.top);
  r.add('ribs', ell(0.042, 0.05, 0.06), [0, 0.18, 0.028], c.fur, [0, 0, 0], c.top);
  r.add('chest', ell(0.03, 0.036, 0.046), [0, 0.222, 0.04], c.top, [0.2, 0, 0]);
  // cou épais à crinière sombre
  r.put('neck', seg(n0, n1, 0.026, 0.021, 7), c.fur, c.top);
  r.put('neck', seg([0, 0.226, 0.064], [0, 0.248, 0.108], 0.008, 0.005, 4), c.fur);
  // tête : crâne, long museau busqué qui retombe, lèvre pendante, naseaux, yeux
  r.add('head', ell(0.02, 0.021, 0.026), [0, 0.24, 0.13], c.fur, [0, 0, 0], c.top);
  r.add('head', ell(0.016, 0.018, 0.032), [0, 0.226, 0.166], c.muzzle, [0.25, 0, 0]);
  r.add('head', ell(0.016, 0.013, 0.013), [0, 0.218, 0.193], c.muzzle);
  r.both((s) => {
    r.add('head', ell(0.003, 0.004, 0.003, 0), [s * 0.008, 0.222, 0.205], 0x140e0c);
    r.add('head', ell(0.0045, 0.0045, 0.0035, 0), [s * 0.019, 0.246, 0.142], 0x140e0c);
  });
  r.add('jaw', ell(0.012, 0.006, 0.02, 0), [0, 0.208, 0.18], c.muzzle);
  // fanon qui pend sous la gorge
  r.add('bell', ell(0.005, 0.02, 0.009, 0), [0, 0.2, 0.13], c.fur);
  r.add('bell', ell(0.006, 0.006, 0.006, 0), [0, 0.182, 0.13], c.fur);
  // grandes oreilles
  r.both((s, L) => r.add(`e${L}`, ell(0.008, 0.015, 0.004, 0), [s * 0.026, 0.262, 0.122], c.fur, [0, 0, -s * 0.9]));
  // bois palmés : merrain, empaumure, andouillers sur le bord, andouiller de front
  r.both((s) => {
    const base: V3 = [s * 0.013, 0.256, 0.128], elbow: V3 = [s * 0.034, 0.268, 0.124];
    r.put('head', seg(base, elbow, 0.0045, 0.004, 5), c.antler);
    r.add('head', ell(0.03, 0.004, 0.02, 1), [s * 0.058, 0.276, 0.118], c.antler, [0.1, 0, s * 0.28]);
    for (let i = 0; i < 6; i++) {
      const a = -1.0 + i * 0.42, px = s * (0.058 + Math.cos(a) * 0.028), pz = 0.118 + Math.sin(a) * 0.018, py = 0.276 + (Math.abs(px) - 0.058) * 0.28;
      r.put('head', seg([px, py, pz], [px + s * 0.008 * Math.cos(a), py + 0.016, pz + 0.004 * Math.sin(a)], 0.0028, 0.0008, 4), c.tip);
    }
    r.put('head', seg(elbow, [s * 0.04, 0.272, 0.146], 0.0035, 0.001, 4), c.tip);
  });
  r.add('tail1', ell(0.008, 0.012, 0.008, 0), [0, 0.18, -0.108], c.fur);
  // longues pattes claires, sabots sombres
  r.both((s, L) => {
    const x = s * 0.026, hx = s * 0.028;
    r.add(`f${L}1`, ell(0.018, 0.042, 0.024), [x, 0.148, 0.058], c.fur, [0, 0, 0], c.top);
    r.put(`f${L}1`, seg([x, 0.13, 0.06], [x, 0.088, 0.062], 0.011, 0.009), c.leg);
    r.put(`f${L}2`, seg([x, 0.088, 0.062], [x, 0.012, 0.064], 0.0085, 0.0075), c.leg);
    r.put(`f${L}2`, seg([x, 0, 0.066], [x, 0.012, 0.064], 0.0105, 0.009, 6), c.hoof);
    r.add(`h${L}1`, ell(0.021, 0.048, 0.028), [hx, 0.145, -0.066], c.fur, [0, 0, 0], c.top);
    r.put(`h${L}1`, seg([hx, 0.12, -0.07], [hx, 0.088, -0.078], 0.012, 0.009), c.leg);
    r.put(`h${L}2`, seg([hx, 0.088, -0.078], [hx, 0.012, -0.07], 0.0085, 0.0075), c.leg);
    r.put(`h${L}2`, seg([hx, 0, -0.068], [hx, 0.012, -0.07], 0.0105, 0.009, 6), c.hoof);
  });

  const clips = quadClips({
    walk: { dur: 1.2, A: 0.3, L: 0.8, ph: { hL: 0, fL: 0.25, hR: 0.5, fR: 0.75 }, bob: 0.004 },
    // trot : diagonales ensemble
    run: { dur: 0.6, A: 0.55, L: 1.1, ph: { hL: 0, fR: 0.02, hR: 0.5, fL: 0.52 }, bob: 0.012, rock: 0.04 },
    neck: ['neck'], graze: [0.95], grazeHead: 0.45,
    lie: TUCK(0.11),
    hook: (n, u, P) => {
      // le fanon ballotte en retard sur la tête
      R(P, 'bell', 0.25 * sn(u, n === 'Gallop' ? 1 : 2, -0.15), 0, 0.12 * sn(u, 1, 0.1));
      if (n === 'Walk') R(P, 'neck', -0.05);
    },
  });
  clips.push(
    // secoue la tête et ses bois, oreilles qui pivotent
    ['Idle_2', 3, (u, P) => {
      const k = win(u, 0.1, 0.9, 0.15);
      breathe(P, u, 2);
      R(P, 'neck', 0.15 * k);
      R(P, 'head', 0.1 * k, 0.35 * k * sn(u, 3), 0.15 * k * sn(u, 3, 0.1));
      R(P, 'bell', 0, 0, 0.5 * k * sn(u, 3, -0.1));
      ears(P, 0, 0.5 * k * sn(u, 3, 0.2));
    }],
  );
  return { rig: r, clips };
}

// ---------- Reptiles ----------

/** Les deux diagonales d'un reptile : patte avant d'un côté avec la patte arrière de l'autre (os, phase, côté) */
const DIAG: [string, number, number][] = [['fL', 0, 1], ['hR', 0, -1], ['fR', 0.5, -1], ['hL', 0.5, 1]];

/**
 * Pas d'un reptile aux pattes écartées : chaque patte balaie d'avant en arrière autour de l'épaule (A) et se lève en
 * avançant (L) ; le corps ondule (U), la queue suit l'onde avec retard, la tête la compense
 */
function crawl(P: Pose, u: number, A: number, L: number, U: number) {
  for (const [b, ph, s] of DIAG) {
    const w = TAU * (u - ph), lift = L * pos(Math.cos(w));
    R(P, b + '1', 0, -s * A * Math.sin(w), s * lift);
    R(P, b + '2', 0, 0, -s * lift * 0.6);
  }
  R(P, 'hips', 0, U * sn(u));
  R(P, 'chest', 0, -U * 1.6 * sn(u));
  R(P, 'head', 0, U * 0.9 * sn(u));
  R(P, 'tail1', 0, U * 1.4 * sn(u, 1, -0.12));
  R(P, 'tail2', 0, U * 1.5 * sn(u, 1, -0.24));
  R(P, 'tail3', 0, U * 1.6 * sn(u, 1, -0.36));
}

interface Reptile {
  walk: [dur: number, A: number, L: number, U: number];
  run: [dur: number, A: number, L: number, U: number];
  /** repos, gestes et repas propres à l'espèce */
  idle: PoseFn;
  more: ClipDef[];
}

function reptileClips(o: Reptile): ClipDef[] {
  const [wd, wa, wl, wu] = o.walk, [rd, ra, rl, ru] = o.run;
  return [
    ['Walk', wd, (u, P) => { crawl(P, u, wa, wl, wu); M(P, 'hips', 0, 0.0015 * pos(sn(u, 2)), 0); breathe(P, u, 2, 0.5); }],
    ['Gallop', rd, (u, P) => { crawl(P, u, ra, rl, ru); R(P, 'head', -0.12); M(P, 'hips', 0, 0.002 * pos(sn(u, 2)), 0); }],
    ['Idle', 6, o.idle],
    // dort à plat ventre, pattes rabattues le long du corps, queue recourbée
    ['Sleep', 8, (u, P) => {
      breathe(P, u, 2, 1.2);
      for (const [b, , s] of DIAG) { R(P, b + '1', 0, s * (b[0] === 'f' ? 0.9 : 0.5), -s * 0.25); R(P, b + '2', 0, 0, s * 0.3); }
      M(P, 'hips', 0, -0.003, 0);
      R(P, 'head', 0.05, -0.2);
      R(P, 'jaw', 0.05);
      R(P, 'tail1', 0, 0.3); R(P, 'tail2', 0, 0.35); R(P, 'tail3', 0, 0.4);
    }],
    ...o.more,
  ];
}

const CROC_COATS: Coat[] = [
  { back: 0x4a5a32, top: 0x36442a, belly: 0xc8c08a, eye: 0xd8c040, mouth: 0xc87870, teeth: 0xf0ecd8, claw: 0x22221a },
  { back: 0x5a6438, top: 0x404a2a, belly: 0xd0c494, eye: 0xd0b438, mouth: 0xc07068, teeth: 0xece6d0, claw: 0x22221a },
  { back: 0x3e4a30, top: 0x2c3624, belly: 0xbcb684, eye: 0xc8b840, mouth: 0xb86e68, teeth: 0xf0ecd8, claw: 0x1e1e18 },
];

/** Aplatit une pièce autour de la hauteur cy (museau, queue) */
const flat = (g: THREE.BufferGeometry, cy: number, sx: number, sy: number) => g.translate(0, -cy, 0).scale(sx, sy, 1).translate(0, cy, 0);

/**
 * Crocodile : long corps bas à écailles, deux rangées de plaques dorsales qui se rejoignent en crête sur la queue, ventre
 * clair, museau plat aux dents qui dépassent, yeux et narines saillants, pattes écartées aux doigts griffus ; marche
 * haute en ondulant, court, prend le soleil la gueule ouverte, siffle gueule béante, secoue sa prise
 */
function croc(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  r.bone('hips', null, 0, 0.03, -0.04);
  r.bone('chest', 'hips', 0, 0.032, 0.04);
  r.bone('ribs', 'chest', 0, 0.032, 0.04);
  r.bone('head', 'chest', 0, 0.036, 0.11);
  r.bone('jaw', 'head', 0, 0.028, 0.125);
  r.bone('tail1', 'hips', 0, 0.03, -0.1);
  r.bone('tail2', 'tail1', 0, 0.026, -0.17);
  r.bone('tail3', 'tail2', 0, 0.021, -0.232);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.03, 0.03, 0.075);
    r.bone(`f${L}2`, `f${L}1`, s * 0.058, 0.022, 0.076);
    r.bone(`h${L}1`, 'hips', s * 0.032, 0.03, -0.06);
    r.bone(`h${L}2`, `h${L}1`, s * 0.064, 0.022, -0.062);
  });

  // corps : dessus sombre, ventre clair
  r.add('hips', ell(0.036, 0.021, 0.062), [0, 0.032, -0.045], c.belly, [0, 0, 0], c.back);
  r.add('ribs', ell(0.038, 0.022, 0.064), [0, 0.033, 0.045], c.belly, [0, 0, 0], c.back);
  // plaques dorsales : deux rangées sur le dos, rangées plus petites sur les flancs
  for (let z = -0.1; z <= 0.1; z += 0.02) {
    const b = z > 0 ? 'ribs' : 'hips', top = 0.054 - Math.abs(z) * 0.04;
    r.both((s) => {
      r.put(b, seg([s * 0.011, top - 0.004, z], [s * 0.011, top + 0.005, z], 0.0045, 0.0008, 4), c.top);
      r.put(b, seg([s * 0.025, top - 0.008, z + 0.01], [s * 0.026, top - 0.002, z + 0.01], 0.0035, 0.0006, 4), c.top);
    });
  }
  // tête : crâne, yeux saillants à iris jaune, museau plat, narines, dents, mâchoire, intérieur de la gueule
  r.add('head', ell(0.028, 0.017, 0.03), [0, 0.036, 0.108], c.belly, [0, 0, 0], c.back);
  r.add('head', bx(0.036, 0.018, 0.036), [0, 0.042, 0.132], c.back);
  r.both((s) => {
    r.add('head', ell(0.008, 0.007, 0.009, 0), [s * 0.013, 0.053, 0.135], c.back);
    r.add('head', ell(0.0045, 0.0045, 0.0045, 0), [s * 0.016, 0.055, 0.139], c.eye);
    r.add('head', bx(0.0015, 0.005, 0.002), [s * 0.0198, 0.055, 0.14], 0x101010);
  });
  r.put('head', flat(seg([0, 0.04, 0.145], [0, 0.04, 0.245], 0.017, 0.011, 6), 0.04, 1.35, 0.55), c.back, c.top);
  r.add('head', ell(0.007, 0.004, 0.006, 0), [0, 0.047, 0.243], c.top);
  for (let z = 0.156; z < 0.245; z += 0.0135) {
    const x = 0.022 - (z - 0.145) * 0.08;
    r.both((s) => r.put('head', seg([s * x, 0.037, z], [s * x, 0.029, z], 0.0018, 0.0003, 3), c.teeth));
  }
  r.put('jaw', flat(seg([0, 0.027, 0.125], [0, 0.026, 0.24], 0.017, 0.01, 6), 0.027, 1.3, 0.45), c.belly, c.back);
  r.add('jaw', bx(0.022, 0.002, 0.1), [0, 0.031, 0.185], c.mouth);
  for (let z = 0.163; z < 0.24; z += 0.0135) {
    const x = 0.019 - (z - 0.145) * 0.075;
    r.both((s) => r.put('jaw', seg([s * x, 0.028, z], [s * x, 0.036, z], 0.0016, 0.0003, 3), c.teeth));
  }
  // queue : épaisse, aplatie sur les côtés, crête qui passe de deux rangées à une seule
  r.add('tail1', ell(0.027, 0.019, 0.05), [0, 0.03, -0.135], c.belly, [0, 0, 0], c.back);
  r.add('tail2', ell(0.017, 0.015, 0.045), [0, 0.025, -0.2], c.belly, [0, 0, 0], c.back);
  r.put('tail3', flat(seg([0, 0.022, -0.232], [0, 0.017, -0.315], 0.012, 0.002, 5), 0.02, 0.65, 1), c.back, c.top);
  for (let z = -0.11; z > -0.3; z -= 0.016) {
    const b = z > -0.165 ? 'tail1' : z > -0.232 ? 'tail2' : 'tail3', h = 0.048 + (z + 0.11) * 0.16;
    if (z > -0.165) r.both((s) => r.put(b, seg([s * 0.008, h - 0.004, z], [s * 0.008, h + 0.006, z], 0.004, 0.0006, 4), c.top));
    else r.put(b, flat(seg([0, h - 0.006, z], [0, h + 0.007 + (z + 0.3) * 0.02, z], 0.006, 0.0008, 4), h, 0.4, 1), c.top);
  }
  // pattes écartées, doigts griffus
  r.both((s, L) => {
    for (const [b1, b2, z, k] of [[`f${L}1`, `f${L}2`, 0.075, 1], [`h${L}1`, `h${L}2`, -0.061, 1.25]] as [string, string, number, number][]) {
      const sh: V3 = [s * (b1[0] === 'f' ? 0.03 : 0.032), 0.03, z], el: V3 = [s * (b1[0] === 'f' ? 0.058 : 0.064), 0.022, z], ft: V3 = [el[0] + s * 0.004, 0.004, z + 0.004];
      r.put(b1, seg(sh, el, 0.009 * k, 0.007 * k), c.back, c.top);
      r.put(b2, seg(el, ft, 0.007 * k, 0.006 * k), c.back);
      r.add(b2, ell(0.009 * k, 0.003, 0.011 * k, 0), [ft[0] + s * 0.002, 0.003, ft[2] + 0.006], c.back);
      for (let i = 0; i < 4; i++) {
        const a = -0.5 + i * 0.45, tip: V3 = [ft[0] + s * (0.002 + Math.sin(a) * 0.014 * k), 0.002, ft[2] + 0.008 + Math.cos(a) * 0.014 * k];
        r.put(b2, seg([ft[0] + s * 0.002, 0.003, ft[2] + 0.008], tip, 0.0022, 0.0015, 4), c.back);
        r.put(b2, seg(tip, [tip[0] + s * Math.sin(a) * 0.004, 0.001, tip[2] + Math.cos(a) * 0.004], 0.0014, 0.0002, 3), c.claw);
      }
    }
  });

  const clips = reptileClips({
    walk: [1.6, 0.45, 0.5, 0.1],
    run: [0.7, 0.7, 0.7, 0.18],
    // prend le soleil, la gueule grande ouverte ; la queue balaie lentement
    idle: (u, P) => {
      breathe(P, u, 2);
      const k = win(u, 0.15, 0.85, 0.12);
      R(P, 'jaw', 0.55 * k);
      R(P, 'head', -0.08 * k);
      R(P, 'tail1', 0, 0.08 * sn(u)); R(P, 'tail2', 0, 0.1 * sn(u, 1, -0.1)); R(P, 'tail3', 0, 0.14 * sn(u, 1, -0.2));
    },
    more: [
      // secoue sa prise de droite à gauche en refermant la gueule
      ['Eating', 2.5, (u, P) => {
        breathe(P, u, 2);
        R(P, 'head', -0.12, 0.35 * sn(u, 2));
        R(P, 'chest', 0, 0.15 * sn(u, 2, -0.05));
        R(P, 'jaw', 0.45 * pos(sn(u, 3)));
        R(P, 'tail1', 0, 0.25 * sn(u, 2, -0.2)); R(P, 'tail2', 0, 0.3 * sn(u, 2, -0.3)); R(P, 'tail3', 0, 0.35 * sn(u, 2, -0.4));
      }],
      // siffle : se gonfle, gueule béante, tête dressée
      ['Idle_2', 3, (u, P) => {
        const k = win(u, 0.1, 0.85, 0.15);
        S(P, 'ribs', 1 + 0.1 * k, 1 + 0.14 * k, 1);
        R(P, 'head', -0.25 * k, 0.1 * k * sn(u, 2));
        R(P, 'jaw', 0.95 * k);
        M(P, 'hips', 0, 0.006 * k, 0);
        for (const [b, , s] of DIAG) R(P, b + '1', 0, 0, -s * 0.25 * k);
        R(P, 'tail2', 0, 0.3 * k * sn(u, 1)); R(P, 'tail3', 0, 0.4 * k * sn(u, 1, -0.1));
      }],
    ],
  });
  return { rig: r, clips };
}

const LIZARD_COATS: Coat[] = [
  // vert à taches sombres, sable à bandes brunes, gris-bleu, ocre
  { base: 0x7a9a48, top: 0x5e7e34, belly: 0xd8dca0, mark: 0x3e5a24, eye: 0xd8a030 },
  { base: 0xc8a868, top: 0xb09050, belly: 0xece0b8, mark: 0x7a5a34, eye: 0xc89030 },
  { base: 0x8a9488, top: 0x6e786c, belly: 0xdcdcc8, mark: 0x4a5048, eye: 0xc8a040 },
  { base: 0xb08a58, top: 0x94703e, belly: 0xe4d4b0, mark: 0x5e4428, eye: 0xd09a30 },
];

/**
 * Lézard : corps fin, longue queue effilée en trois segments, tête triangulaire, dos marqué de taches en bandes, ventre
 * clair, doigts écartés ; trottine en ondulant, détale, fait des « pompes » au soleil, darde sa langue fourchue
 */
function lizard(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  const t0: V3 = [0, 0.009, -0.03], t1: V3 = [0, 0.007, -0.056], t2: V3 = [0, 0.005, -0.082], t3: V3 = [0, 0.003, -0.122];
  r.bone('hips', null, 0, 0.009, -0.012);
  r.bone('chest', 'hips', 0, 0.01, 0.012);
  r.bone('ribs', 'chest', 0, 0.01, 0.012);
  r.bone('head', 'chest', 0, 0.011, 0.03);
  r.bone('jaw', 'head', 0, 0.008, 0.036);
  r.bone('tongue', 'head', 0, 0.0085, 0.04);
  r.bone('tail1', 'hips', ...t0);
  r.bone('tail2', 'tail1', ...t1);
  r.bone('tail3', 'tail2', ...t2);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.008, 0.009, 0.02);
    r.bone(`f${L}2`, `f${L}1`, s * 0.018, 0.007, 0.021);
    r.bone(`h${L}1`, 'hips', s * 0.008, 0.009, -0.019);
    r.bone(`h${L}2`, `h${L}1`, s * 0.019, 0.007, -0.02);
  });

  const hipC: V3 = [0, 0.009, -0.014], hipR: V3 = [0.009, 0.006, 0.02], ribC: V3 = [0, 0.01, 0.01], ribR: V3 = [0.01, 0.0065, 0.02];
  r.add('hips', ell(...hipR), hipC, c.belly, [0, 0, 0], c.base);
  r.add('ribs', ell(...ribR), ribC, c.belly, [0, 0, 0], c.base);
  // taches du dos en bandes
  for (const [b, C, Rr] of [['hips', hipC, hipR], ['ribs', ribC, ribR]] as [string, V3, V3][])
    for (const lat of [0.9, 0.55])
      for (const lon of [-0.5, 0.5, 2.6, -2.6, Math.PI]) {
        const o = onEll(C, Rr, lat, lon, 0.0004);
        r.add(b, ell(0.003, 0.0006, 0.0028, 0), o.at, c.mark, o.rot);
      }
  // tête triangulaire, yeux dorés, mâchoire et langue fourchue (rentrée)
  r.add('head', ell(0.0075, 0.0055, 0.012), [0, 0.0115, 0.038], c.belly, [0, 0, 0], c.base);
  r.add('head', ell(0.0055, 0.004, 0.008), [0, 0.0105, 0.048], c.base, [0, 0, 0], c.top);
  r.both((s) => {
    r.add('head', ell(0.0022, 0.0022, 0.0022, 0), [s * 0.0058, 0.0135, 0.042], c.eye);
    r.add('head', ell(0.0012, 0.0016, 0.001, 0), [s * 0.0075, 0.0136, 0.0425], 0x101010);
  });
  r.add('jaw', ell(0.0055, 0.0022, 0.01, 0), [0, 0.0075, 0.045], c.belly);
  r.add('tongue', bx(0.0014, 0.0007, 0.012), [0, 0.0085, 0.046], 0xd04858);
  r.both((s) => r.add('tongue', bx(0.0008, 0.0006, 0.004), [s * 0.0012, 0.0085, 0.053], 0xd04858, [0, s * 0.4, 0]));
  // longue queue effilée, annelée de taches
  r.put('tail1', seg(t0, t1, 0.0062, 0.0045, 5), c.belly, c.base);
  r.put('tail2', seg(t1, t2, 0.0045, 0.003, 5), c.belly, c.base);
  r.put('tail3', seg(t2, t3, 0.003, 0.0005, 5), c.base, c.top);
  for (const [b, p, q, r1, r2] of [['tail1', t0, t1, 0.0062, 0.0045], ['tail2', t1, t2, 0.0045, 0.003], ['tail3', t2, t3, 0.003, 0.0006]] as [string, V3, V3, number, number][])
    for (const t of [0.3, 0.75]) {
      const o = onSeg(p, q, r1, r2, t, Math.PI / 2, 0.0003);
      r.add(b, ell(0.0035 * (r1 / 0.006 + 0.3), 0.0006, 0.0024, 0), o.at, c.mark, o.rot);
    }
  // pattes écartées à cinq doigts
  r.both((s, L) => {
    for (const [b1, b2, z] of [[`f${L}1`, `f${L}2`, 0.02], [`h${L}1`, `h${L}2`, -0.019]] as [string, string, number][]) {
      const sh: V3 = [s * 0.008, 0.009, z], el: V3 = [s * 0.018, 0.007, z + 0.001], ft: V3 = [s * 0.02, 0.0012, z + 0.003];
      r.put(b1, seg(sh, el, 0.0026, 0.002, 5), c.base);
      r.put(b2, seg(el, ft, 0.002, 0.0016, 5), c.base);
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.4;
        r.put(b2, seg(ft, [ft[0] + s * Math.sin(a) * 0.006, 0.0006, ft[2] + Math.cos(a) * 0.006], 0.0008, 0.0004, 3), c.base);
      }
    }
  });

  /** coup de langue */
  const flick = (P: Pose, k: number) => { M(P, 'tongue', 0, 0, 0.011 * k); R(P, 'jaw', 0.15 * k); };
  const clips = reptileClips({
    walk: [0.5, 0.55, 0.6, 0.22],
    run: [0.28, 0.8, 0.8, 0.32],
    // pompes au soleil, coups de langue, tête qui pivote par saccades
    idle: (u, P) => {
      breathe(P, u, 6, 1.5);
      const push = pos(sn(u, 12)) * win(u, 0.08, 0.34, 0.02);
      R(P, 'chest', -0.35 * push);
      M(P, 'chest', 0, 0.003 * push, 0);
      R(P, 'fL1', 0, 0, -0.5 * push); R(P, 'fR1', 0, 0, 0.5 * push);
      flick(P, Math.max(blip(u, 0.5, 0.025), blip(u, 0.56, 0.025), blip(u, 0.9, 0.025)));
      R(P, 'head', 0, 0.4 * win(u, 0.62, 0.8, 0.015) - 0.35 * win(u, 0.8, 0.95, 0.015));
      R(P, 'tail3', 0, 0.25 * sn(u, 1));
    },
    more: [
      // se plaque au sol pour chauffer, la queue qui ondule lentement
      ['Idle_2', 5, (u, P) => {
        const k = win(u, 0.1, 0.9, 0.15);
        breathe(P, u, 6, 1.5);
        M(P, 'hips', 0, -0.002 * k, 0);
        for (const [b, , s] of DIAG) R(P, b + '1', 0, 0, s * 0.35 * k);
        R(P, 'tail1', 0, 0.15 * k * sn(u)); R(P, 'tail2', 0, 0.25 * k * sn(u, 1, -0.1)); R(P, 'tail3', 0, 0.35 * k * sn(u, 1, -0.2));
        flick(P, blip(u, 0.7, 0.025));
      }],
    ],
  });
  return { rig: r, clips };
}

// ---------- Catalogue ----------

export type BeastKind = 'bear' | 'elephant' | 'giraffe' | 'camel' | 'moose' | 'croc' | 'lizard';
interface BeastDef { coats: Coat[]; build: (c: Coat) => { rig: Rig; clips: ClipDef[] }; yaw?: number }
const DEFS: Record<BeastKind, BeastDef> = {
  bear: { coats: BEAR_COATS, build: bear },
  elephant: { coats: ELEPHANT_COATS, build: elephant },
  giraffe: { coats: GIRAFFE_COATS, build: giraffe },
  camel: { coats: CAMEL_COATS, build: camel },
  moose: { coats: MOOSE_COATS, build: moose },
  croc: { coats: CROC_COATS, build: croc },
  lizard: { coats: LIZARD_COATS, build: lizard },
};
export const BEAST_KINDS = new Set<string>(Object.keys(DEFS));
/** gestes joués une fois de temps en temps au repos (se dresser, humer l'air…) */
export const GESTURES = new Set(['Idle_2', 'Idle_3']);
/** correction de cap (le crabe marche de côté) */
export const beastYaw = (k: string) => DEFS[k as BeastKind]?.yaw ?? 0;

const templates = new Map<string, { root: THREE.Group; clips: THREE.AnimationClip[] }>();

/** Bête articulée : un clone (squelette compris) du modèle de sa robe, à l'échelle `size`, ses animations prêtes */
export function makeBeast(kind: BeastKind, coat: number, size: number, shade = 1): Actor {
  const def = DEFS[kind], ci = ((coat % def.coats.length) + def.coats.length) % def.coats.length, key = `${kind}${ci}`;
  let t = templates.get(key);
  if (!t) {
    const { rig, clips } = def.build(def.coats[ci]);
    t = { root: rig.build(), clips: clips.map((c) => makeClip(rig, c)) };
    templates.set(key, t);
  }
  const inner = cloneSkinned(t.root) as THREE.Group;
  inner.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    // chaque bête a sa nuance
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.color.setScalar(shade);
    m.material = mat;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  });
  inner.scale.setScalar(size);
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of t.clips) {
    const a = mixer.clipAction(clip);
    if (GESTURES.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
    actions.set(clip.name, a);
  }
  return { root, mixer, actions, current: null };
}

/** pour les essais : noms des os et des clips d'une bête */
export function beastInfo(kind: BeastKind) {
  const { rig, clips } = DEFS[kind].build(DEFS[kind].coats[0]);
  return { bones: rig.names, clips: clips.map((c) => c[0]) };
}
