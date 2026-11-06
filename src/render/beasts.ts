import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mulberry32 } from '../core/rng';
import type { Actor } from './assets';

/**
 * Bêtes sauvages articulées, dessinées par le jeu faute de modèle animé libre de droits (ours, éléphant, girafe, crocodile,
 * tortue, chameau, élan, loup, lézard, crabe) : chaque bête est un vrai maillage à squelette (os du bassin, du poitrail, du cou,
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
  /**
   * Membrane tendue entre des os (aile de dragon) : chaque sommet suit son os, ou ses os à parts égales, si bien qu'elle se
   * tend quand les os s'écartent et se plisse quand ils se replient ; triangles vus des deux côtés
   */
  web(color: number, pts: { at: V3; on: string[] }[], tris: [number, number, number][]) {
    const pos: number[] = [], si: number[] = [], sw: number[] = [];
    const push = (i: number) => {
      const p = pts[i], ids = p.on.map((b) => this.idx(b));
      pos.push(...p.at);
      for (let k = 0; k < 4; k++) { si.push(ids[k] ?? 0); sw.push(k < ids.length ? 1 / ids.length : 0); }
    };
    for (const [a, b, c] of tris) { push(a); push(b); push(c); push(a); push(c); push(b); }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    _ca.setHex(color);
    const n = pos.length / 3, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _ca.r; col[i * 3 + 1] = _ca.g; col[i * 3 + 2] = _ca.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.geos.push(g);
  }
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

// ---------- Loup ----------

const WOLF_COATS: Coat[] = [
  // gris (dos sombre, joues et ventre crème), gris anthracite, fauve des bois
  { fur: 0xaeaeb2, top: 0x626066, saddle: 0x403e44, belly: 0xe8e4dc, cheek: 0xf0ece4, muzzle: 0xd4d0c8, leg: 0xc8c0b2, paw: 0x3a3432, inner: 0xd8ccbc, tip: 0x242020 },
  { fur: 0x7a7a80, top: 0x3c3c42, saddle: 0x28282c, belly: 0xc4c0b8, cheek: 0xd2cec6, muzzle: 0xa8a49e, leg: 0x9a948a, paw: 0x221e1e, inner: 0xa89c90, tip: 0x161414 },
  { fur: 0xa8a090, top: 0x625a50, saddle: 0x46403a, belly: 0xe2d6c0, cheek: 0xeae0cc, muzzle: 0xcebea6, leg: 0xc0aa8c, paw: 0x3a3028, inner: 0xdccab2, tip: 0x2a221c },
];

/**
 * Loup : silhouette haute et sèche — poitrail étroit et profond, ventre levretté, longues pattes fines aux pieds serrés —,
 * pelage gris à dos sombre (selle et crinière de jarres hérissées sur le garrot), joues, gorge et ventre crème ; tête
 * large au long museau étroit, truffe noire, yeux ambrés, oreilles pointues dressées ; queue touffue portée bas, à bout
 * noir. Trotte tête basse, pattes dans la même trace ; galope ventre à terre, oreilles couchées, queue à l'horizontale ;
 * s'assied pour hurler, museau au ciel ; flaire le sol ; dort roulé en boule, la queue sur le museau
 */
function wolf(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  const n0: V3 = [0, 0.148, 0.07], n1: V3 = [0, 0.166, 0.106];
  r.bone('hips', null, 0, 0.13, -0.05);
  r.bone('chest', 'hips', 0, 0.134, 0.03);
  r.bone('ribs', 'chest', 0, 0.134, 0.03);
  r.bone('neck', 'chest', ...n0);
  r.bone('head', 'neck', ...n1);
  r.bone('jaw', 'head', 0, 0.158, 0.13);
  r.both((s, L) => r.bone(`e${L}`, 'head', s * 0.014, 0.188, 0.112));
  r.bone('tail1', 'hips', 0, 0.142, -0.098);
  r.bone('tail2', 'tail1', 0, 0.116, -0.128);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.019, 0.112, 0.056);
    r.bone(`f${L}2`, `f${L}1`, s * 0.019, 0.064, 0.058);
    r.bone(`h${L}1`, 'hips', s * 0.021, 0.118, -0.07);
    r.bone(`h${L}2`, `h${L}1`, s * 0.021, 0.068, -0.088);
  });

  // corps : croupe, poitrail étroit et profond (qui respire), ventre levretté, gorge crème, selle sombre sur le dos
  r.add('hips', ell(0.028, 0.032, 0.05), [0, 0.134, -0.056], c.fur, [0, 0, 0], c.top);
  r.add('ribs', ell(0.031, 0.042, 0.054), [0, 0.128, 0.018], c.fur, [0, 0, 0], c.top);
  r.add('ribs', ell(0.02, 0.012, 0.05), [0, 0.096, -0.012], c.belly);
  r.add('chest', ell(0.022, 0.034, 0.026), [0, 0.118, 0.06], c.belly, [0.25, 0, 0], c.fur);
  r.add('ribs', ell(0.027, 0.009, 0.068), [0, 0.162, 0.0], c.saddle, [0.06, 0, 0], c.top);
  r.add('hips', ell(0.022, 0.008, 0.036), [0, 0.164, -0.05], c.saddle, [-0.08, 0, 0]);
  // crinière : collerette épaisse autour du cou et jarres hérissées du garrot
  r.add('neck', ell(0.03, 0.034, 0.03), [0, 0.15, 0.072], c.fur, [0.3, 0, 0], c.top);
  r.add('neck', ell(0.024, 0.026, 0.02), [0, 0.136, 0.09], c.cheek, [0.4, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const z = 0.088 - i * 0.016, y = 0.178 - Math.abs(i - 2) * 0.003, b = i < 2 ? 'neck' : 'ribs';
    r.both((s) => r.put(b, seg([s * 0.008, y - 0.006, z], [s * 0.011, y + 0.008 - i * 0.0008, z - 0.012], 0.006, 0.0008, 4), c.saddle));
  }
  // jarres claires le long des flancs et sous le ventre
  r.both((s) => {
    for (let i = 0; i < 5; i++) {
      const z = 0.05 - i * 0.022, b = z > -0.01 ? 'ribs' : 'hips';
      r.put(b, seg([s * 0.026, 0.104, z], [s * 0.028, 0.092, z - 0.008], 0.006, 0.001, 4), c.fur);
    }
  });
  r.put('neck', seg(n0, n1, 0.02, 0.016, 7), c.fur, c.top);
  // tête : crâne large, joues claires, long museau étroit, arête plus sombre, truffe noire, yeux ambrés
  r.add('head', ell(0.022, 0.02, 0.024), [0, 0.174, 0.114], c.fur, [0, 0, 0], c.top);
  r.both((s) => r.add('head', ell(0.012, 0.015, 0.016), [s * 0.016, 0.163, 0.114], c.cheek, [0, 0, s * 0.3]));
  r.put('head', seg([0, 0.166, 0.128], [0, 0.161, 0.17], 0.0125, 0.0075, 6), c.muzzle);
  r.put('head', seg([0, 0.176, 0.126], [0, 0.168, 0.166], 0.0065, 0.0035, 5), c.fur);
  r.add('head', ell(0.0062, 0.0052, 0.0055, 0), [0, 0.165, 0.173], 0x141010);
  r.both((s) => {
    r.add('head', ell(0.0042, 0.0032, 0.003, 0), [s * 0.0118, 0.18, 0.13], 0xd8a030, [0, s * 0.5, 0]);
    r.add('head', ell(0.0018, 0.0022, 0.0015, 0), [s * 0.0124, 0.18, 0.1325], 0x100c0a);
    // trait sombre au coin de l'œil
    r.put('head', seg([s * 0.011, 0.179, 0.126], [s * 0.016, 0.177, 0.118], 0.0016, 0.001, 3), c.saddle);
  });
  r.put('jaw', seg([0, 0.156, 0.13], [0, 0.155, 0.164], 0.0075, 0.0045, 5), c.belly);
  // oreilles pointues et dressées, intérieur clair
  r.both((s, L) => {
    r.add(`e${L}`, new THREE.ConeGeometry(0.0095, 0.026, 4), [s * 0.0145, 0.199, 0.11], c.fur, [-0.12, 0, -s * 0.18], c.saddle);
    r.add(`e${L}`, new THREE.ConeGeometry(0.0055, 0.017, 3), [s * 0.0145, 0.197, 0.1135], c.inner, [-0.12, 0, -s * 0.18]);
  });
  // queue touffue portée bas, bout noir
  r.put('tail1', seg([0, 0.142, -0.098], [0, 0.116, -0.128], 0.01, 0.014, 6), c.fur, c.top);
  r.add('tail2', ell(0.019, 0.046, 0.02), [0, 0.084, -0.142], c.fur, [0.32, 0, 0], c.top);
  r.add('tail2', ell(0.011, 0.016, 0.012, 0), [0, 0.046, -0.155], c.tip, [0.32, 0, 0]);
  // longues pattes fines : épaule et cuisse fournies, canons clairs, pieds serrés aux doigts sombres
  r.both((s, L) => {
    const x = s * 0.019, hx = s * 0.021;
    r.add(`f${L}1`, ell(0.014, 0.03, 0.018), [x, 0.104, 0.054], c.fur, [0, 0, 0], c.top);
    r.put(`f${L}1`, seg([x, 0.09, 0.056], [x, 0.064, 0.058], 0.0085, 0.0065), c.fur);
    r.put(`f${L}2`, seg([x, 0.064, 0.058], [x, 0.01, 0.06], 0.006, 0.005), c.leg);
    r.add(`f${L}2`, ell(0.0075, 0.005, 0.011, 0), [x, 0.005, 0.066], c.paw);
    r.add(`h${L}1`, ell(0.017, 0.034, 0.024), [hx, 0.11, -0.07], c.fur, [0.15, 0, 0], c.top);
    r.put(`h${L}1`, seg([hx, 0.094, -0.076], [hx, 0.068, -0.088], 0.0095, 0.0065), c.fur);
    r.put(`h${L}2`, seg([hx, 0.068, -0.088], [hx, 0.01, -0.078], 0.006, 0.005), c.leg);
    r.add(`h${L}2`, ell(0.0075, 0.005, 0.011, 0), [hx, 0.005, -0.072], c.paw);
  });

  // au trot, chaque diagonale ensemble ; au galop, les arrière puis les avant
  const clips = quadClips({
    walk: { dur: 0.7, A: 0.42, L: 0.95, ph: { hL: 0, fR: 0.02, hR: 0.5, fL: 0.52 }, bob: 0.003 },
    run: { dur: 0.46, A: 0.85, L: 1.25, ph: { hL: 0, hR: 0.07, fL: 0.42, fR: 0.5 }, bob: 0.012, rock: 0.18 },
    neck: ['neck'], graze: [0.95], grazeHead: 0.35,
    lie: { drop: 0.078, f: [-1.42, 0.22], h: [-1.05, 2.15] },
    hook: (n, u, P) => {
      if (n === 'Walk') {
        // tête portée bas, dans l'axe du dos ; pieds dans la même trace ; la queue pend et balance à peine
        R(P, 'neck', 0.32); R(P, 'head', -0.12);
        for (const [b, s] of [['fL1', 1], ['fR1', -1], ['hL1', 1], ['hR1', -1]] as [string, number][]) R(P, b, 0, 0, s * 0.06);
        R(P, 'tail1', 0.08); R(P, 'tail2', 0.05 * sn(u, 2), 0.1 * sn(u, 1, 0.2));
        ears(P, 0.1, 0);
      } else if (n === 'Gallop') {
        // ventre à terre : cou tendu, oreilles couchées, queue à l'horizontale qui ondule
        R(P, 'neck', 0.35); R(P, 'head', -0.2);
        R(P, 'tail1', 1.55); R(P, 'tail2', 0.25 + 0.12 * sn(u, 1, 0.3));
        ears(P, 0.25, 0);
      } else if (n === 'Idle') {
        // queue au repos, un léger frémissement de la truffe
        R(P, 'tail2', 0, 0.12 * sn(u, 2) * win(u, 0.3, 0.65, 0.05));
        R(P, 'head', 0.02 * pos(sn(u, 14)) * win(u, 0.1, 0.25, 0.04));
      } else if (n === 'Sleep') {
        // roulé en boule : la queue ramenée sur le museau
        R(P, 'tail1', -0.5, 0.9); R(P, 'tail2', -0.4, 0.7);
        R(P, 'neck', 0.1, 0.4); R(P, 'head', 0.2, 0.3);
      } else if (n === 'Eating') {
        // tête dans la prise, il tire et arrache
        M(P, 'hips', 0, -0.004 * pos(sn(u, 2)), -0.003 * pos(sn(u, 2)));
        R(P, 'tail1', 0.15);
      }
    },
  });
  clips.push(
    // s'assied sur son arrière-train, lève le museau au ciel et hurle (la gorge vibre), puis se relève
    ['Idle_2', 6, (u, P) => {
      const k = win(u, 0.06, 0.92, 0.12), h = win(u, 0.22, 0.82, 0.08);
      breathe(P, u, 3, 1 + h);
      R(P, 'hips', -0.45 * k);
      M(P, 'hips', 0, -0.06 * k, -0.012 * k);
      for (const L of ['L', 'R']) { R(P, `f${L}1`, 0.5 * k); R(P, `h${L}1`, -0.85 * k); R(P, `h${L}2`, 1.5 * k); }
      R(P, 'chest', -0.06 * k);
      R(P, 'neck', -0.15 * k - 0.22 * h);
      R(P, 'head', -0.05 * k - 0.2 * h + 0.03 * h * sn(u, 9), 0.04 * h * sn(u, 2));
      R(P, 'jaw', 0.26 * h + 0.05 * h * sn(u, 11));
      ears(P, 0.35 * h, -0.1 * h);
      R(P, 'tail1', 0.6 * k); R(P, 'tail2', 0.3 * k);
    }],
    // flaire le sol en avançant la truffe, les oreilles pointées vers l'avant
    ['Idle_3', 4, (u, P) => {
      const k = win(u, 0.05, 0.95, 0.15);
      breathe(P, u, 4);
      R(P, 'neck', 0.85 * k, 0.15 * k * sn(u));
      R(P, 'head', 0.3 * k + 0.05 * k * pos(sn(u, 10)), 0.25 * k * sn(u, 1, 0.2));
      R(P, 'chest', 0.06 * k);
      R(P, 'fR1', -0.2 * win(u, 0.4, 0.6, 0.06)); R(P, 'fR2', 0.5 * win(u, 0.42, 0.56, 0.05));
      ears(P, -0.2 * k, 0);
      R(P, 'tail1', 0.2 * k); R(P, 'tail2', 0, 0.2 * k * sn(u, 3));
    }],
    // mord : il se tasse sur ses pattes arrière, bondit gueule ouverte, claque des mâchoires et recule (oreilles couchées)
    ['Attack', 0.8, (u, P) => {
      const crouch = win(u, 0, 0.35, 0.12), lunge = win(u, 0.3, 0.62, 0.08), snap = blip(u, 0.5, 0.08);
      M(P, 'hips', 0, -0.014 * crouch, -0.012 * crouch + 0.02 * lunge);
      R(P, 'hips', 0.12 * crouch - 0.1 * lunge);
      for (const L of ['L', 'R']) { R(P, `h${L}1`, -0.35 * crouch + 0.3 * lunge); R(P, `h${L}2`, 0.6 * crouch); R(P, `f${L}1`, 0.3 * crouch - 0.55 * lunge); R(P, `f${L}2`, 0.4 * crouch); }
      R(P, 'neck', 0.25 * crouch - 0.05 * lunge); R(P, 'head', -0.15 * lunge);
      R(P, 'jaw', 0.5 * lunge * (1 - snap));
      ears(P, 0.45, 0);
      R(P, 'tail1', 0.6, 0.15 * sn(u, 2)); R(P, 'tail2', 0.2);
      breathe(P, u, 2, 1.5);
    }],
    // touché : il se cabre de côté, la tête rejetée, et rentre la queue
    ['Hit', 0.5, (u, P) => {
      const k = Math.sin(Math.PI * u);
      R(P, 'hips', -0.12 * k, 0, 0.1 * k); R(P, 'chest', -0.15 * k, 0.15 * k);
      R(P, 'neck', -0.3 * k, 0.25 * k); R(P, 'head', -0.15 * k);
      R(P, 'jaw', 0.25 * k);
      ears(P, 0.6 * k, 0);
      R(P, 'fL1', -0.4 * k); R(P, 'fR1', -0.25 * k);
      R(P, 'tail1', -0.4 * k); R(P, 'tail2', -0.3 * k);
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

// ---------- Tortue ----------

const TURTLE_COATS: Coat[] = [
  { shell: 0x4e5e32, scute: 0x6e7440, ring: 0x3a4426, rim: 0x5a6038, skin: 0x7a7e50, top: 0x5e6640, plastron: 0xd8c890, streak: 0xd8c860, beak: 0x3a3a2a },
  { shell: 0x6a5434, scute: 0x8a7444, ring: 0x4a3a26, rim: 0x705a38, skin: 0x8a8460, top: 0x6a6648, plastron: 0xe0cc98, streak: 0xe0b848, beak: 0x3a3428 },
  { shell: 0x3e5240, scute: 0x5a6e50, ring: 0x2e3c30, rim: 0x485a42, skin: 0x6e7a5a, top: 0x52604a, plastron: 0xd0c49a, streak: 0xe8d070, beak: 0x30342a },
];

/**
 * Tortue : carapace bombée à écailles hexagonales (vertébrales, costales, marginales) cernées de sombre, plastron clair,
 * tête au bec corné rayée de jaune, pattes trapues griffues ; avance d'un pas lent qui fait tanguer la carapace, sort la
 * tête pour regarder, la rentre au moindre doute, se replie pour dormir
 */
function turtle(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  r.bone('shell', null, 0, 0.012, 0);
  r.bone('neck', 'shell', 0, 0.013, 0.028);
  r.bone('head', 'neck', 0, 0.016, 0.048);
  r.bone('jaw', 'head', 0, 0.0145, 0.056);
  r.bone('tail1', 'shell', 0, 0.011, -0.036);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'shell', s * 0.021, 0.011, 0.022);
    r.bone(`f${L}2`, `f${L}1`, s * 0.032, 0.007, 0.027);
    r.bone(`h${L}1`, 'shell', s * 0.021, 0.011, -0.022);
    r.bone(`h${L}2`, `h${L}1`, s * 0.031, 0.007, -0.027);
  });

  // carapace : dôme, rebord, plastron
  const C: V3 = [0, 0.012, 0], Rr: V3 = [0.032, 0.022, 0.04];
  r.add('shell', new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2).scale(...Rr), C, c.rim, [0, 0, 0], c.shell);
  r.add('shell', ell(0.029, 0.005, 0.036, 1), [0, 0.011, 0], c.plastron);
  // écailles : plaque claire cernée d'un liseré sombre, centre plus foncé
  const plate = (lat: number, lon: number, k: number) => {
    const o = onEll(C, Rr, lat, lon, 0.0004), o2 = onEll(C, Rr, lat, lon, 0.0016);
    r.add('shell', new THREE.CylinderGeometry(0.0092 * k, 0.0098 * k, 0.0012, 6), o.at, c.ring, o.rot);
    r.add('shell', new THREE.CylinderGeometry(0.0078 * k, 0.0084 * k, 0.0016, 6), o2.at, c.scute, o2.rot);
    r.add('shell', new THREE.CylinderGeometry(0.0036 * k, 0.004 * k, 0.0012, 6), onEll(C, Rr, lat, lon, 0.0026).at, c.shell, o2.rot);
  };
  for (const [lat, lon] of [[1.5, 0], [1.02, 0], [1.02, Math.PI], [0.62, 0], [0.62, Math.PI]]) plate(lat, lon, 1);
  for (const lon of [0.85, 1.6, 2.35]) for (const s of [-1, 1]) plate(0.68, s * lon, 1);
  for (let i = 0; i < 18; i++) {
    const o = onEll(C, Rr, 0.1, (i / 18) * TAU, 0.0006);
    r.add('shell', bx(0.0105, 0.0055, 0.0018), o.at, i % 2 ? c.rim : c.ring, o.rot);
  }
  // cou, tête rayée de jaune, bec, yeux
  r.put('neck', seg([0, 0.012, 0.026], [0, 0.016, 0.049], 0.0058, 0.0052, 6), c.skin, c.top);
  r.both((s) => r.put('neck', seg([s * 0.0055, 0.015, 0.032], [s * 0.0052, 0.0172, 0.047], 0.0009, 0.0008, 3), c.streak));
  r.add('head', ell(0.0075, 0.0068, 0.01), [0, 0.0185, 0.054], c.skin, [0, 0, 0], c.top);
  r.both((s) => {
    r.add('head', ell(0.0018, 0.0018, 0.0016, 0), [s * 0.0058, 0.0205, 0.058], 0x101010);
    r.put('head', seg([s * 0.006, 0.017, 0.048], [s * 0.005, 0.0175, 0.058], 0.0008, 0.0006, 3), c.streak);
  });
  r.add('head', ell(0.0048, 0.0032, 0.004, 0), [0, 0.0175, 0.0625], c.beak);
  r.add('jaw', ell(0.0042, 0.0018, 0.0036, 0), [0, 0.014, 0.06], c.beak);
  r.put('tail1', seg([0, 0.011, -0.036], [0, 0.007, -0.049], 0.003, 0.0005, 4), c.skin);
  // pattes trapues, écailleuses, trois griffes
  r.both((s, L) => {
    for (const [b1, b2, z, dz] of [[`f${L}1`, `f${L}2`, 0.022, 1], [`h${L}1`, `h${L}2`, -0.022, -1]] as [string, string, number, number][]) {
      const sh: V3 = [s * 0.021, 0.011, z], el: V3 = [s * 0.032, 0.007, z + dz * 0.005], ft: V3 = [s * 0.035, 0.0015, z + dz * 0.008];
      r.put(b1, seg(sh, el, 0.0052, 0.0046, 6), c.skin, c.top);
      r.put(b2, seg(el, ft, 0.0046, 0.004, 6), c.skin);
      r.add(b2, ell(0.0052, 0.0018, 0.0058, 0), [ft[0], 0.0015, ft[2] + dz * 0.002], c.skin);
      for (let i = -1; i <= 1; i++) r.put(b2, seg([ft[0] + s * 0.001 + i * 0.0025, 0.0012, ft[2] + dz * 0.006], [ft[0] + s * 0.0015 + i * 0.003, 0.0004, ft[2] + dz * 0.0095], 0.0009, 0.0002, 3), c.beak);
    }
  });

  /** pas lent : diagonales, la carapace tangue */
  const amble = (P: Pose, u: number, A: number, L: number) => {
    for (const [b, ph, s] of DIAG) {
      const w = TAU * (u - ph), lift = L * pos(Math.cos(w));
      R(P, b + '1', 0, -s * A * Math.sin(w), s * lift);
      R(P, b + '2', 0, 0, -s * lift * 0.5);
    }
    R(P, 'shell', 0.02 * sn(u, 2), 0.04 * sn(u), 0.05 * sn(u));
    M(P, 'shell', 0, 0.0008 * pos(sn(u, 2)), 0);
    R(P, 'tail1', 0, 0.3 * sn(u));
  };
  /** tête rentrée dans la carapace (0 … 1) */
  const tuck = (P: Pose, k: number) => { M(P, 'neck', 0, -0.002 * k, -0.017 * k); R(P, 'neck', 0.2 * k); };
  const clips: ClipDef[] = [
    ['Walk', 1.6, (u, P) => { amble(P, u, 0.45, 0.45); R(P, 'neck', -0.05); R(P, 'head', 0.05 * sn(u, 2), 0.12 * sn(u)); }],
    ['Gallop', 0.9, (u, P) => { amble(P, u, 0.6, 0.6); R(P, 'neck', -0.15); M(P, 'neck', 0, 0, 0.002); }],
    // sort la tête, regarde, mâchonne, la rentre un instant
    ['Idle', 8, (u, P) => {
      const look = Math.sin(TAU * u * 2) * win(u, 0.05, 0.55, 0.08);
      R(P, 'neck', -0.15 * win(u, 0.05, 0.55, 0.1), 0.25 * look);
      R(P, 'head', 0.05 * sn(u, 3), 0.35 * look);
      R(P, 'jaw', 0.3 * pos(sn(u, 16)) * win(u, 0.3, 0.5, 0.03));
      tuck(P, win(u, 0.62, 0.85, 0.06));
      R(P, 'fL1', 0, -0.2 * win(u, 0.4, 0.5, 0.03));
      R(P, 'tail1', 0, 0.2 * sn(u, 2));
    }],
    // tête et pattes rentrées sous la carapace
    ['Sleep', 6, (u, P) => {
      tuck(P, 1);
      M(P, 'shell', 0, -0.004, 0);
      for (const [b, , s] of DIAG) {
        R(P, b + '1', 0, b[0] === 'f' ? s * 0.7 : -s * 0.7, -s * 0.35);
        M(P, b + '1', -s * 0.006, 0, 0);
      }
      R(P, 'tail1', 0, 0.8);
    }],
    // tend le cou vers le ciel et regarde alentour
    ['Idle_2', 5, (u, P) => {
      const k = win(u, 0.1, 0.9, 0.15);
      M(P, 'neck', 0, 0.002 * k, 0.003 * k);
      R(P, 'neck', -0.6 * k);
      R(P, 'head', 0.35 * k, 0.5 * k * sn(u, 1, 0.1));
      M(P, 'shell', 0, 0.0015 * k, 0);
      for (const [b, , s] of DIAG) R(P, b + '1', 0, 0, -s * 0.2 * k);
    }],
  ];
  return { rig: r, clips };
}

// ---------- Crabe ----------

const CRAB_COATS: Coat[] = [
  { top: 0xd04a2a, shell: 0xa8341e, under: 0xf0d8b8, leg: 0xe06a40, tip: 0x3a2020 },
  { top: 0xc89060, shell: 0x9a6a40, under: 0xf2e2c8, leg: 0xd8a070, tip: 0x3a2a20 },
  { top: 0xe07040, shell: 0xb04e2a, under: 0xf6e0c0, leg: 0xec8a58, tip: 0x3a2020 },
];

/**
 * Crabe : carapace large et plate aux épines latérales, dessous clair, yeux sur pédoncules, deux pinces (bras, main,
 * doigt mobile), quatre paires de pattes en deux segments ; marche de côté en alternant ses pattes, détale pinces levées,
 * porte la nourriture à sa bouche, menace pinces ouvertes, se tasse pour dormir
 */
function crab(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  const Z = [0.009, 0.0, -0.009, -0.017], DZ = [0.006, 0.001, -0.004, -0.009];
  r.bone('body', null, 0, 0.02, 0);
  r.bone('head', 'body', 0, 0.026, 0.016);
  r.both((s, L) => {
    r.bone(`e${L}`, 'head', s * 0.007, 0.032, 0.016);
    r.bone(`c${L}1`, 'body', s * 0.022, 0.02, 0.016);
    r.bone(`c${L}2`, `c${L}1`, s * 0.032, 0.022, 0.03);
    r.bone(`c${L}3`, `c${L}2`, s * 0.036, 0.026, 0.048);
    for (let i = 0; i < 4; i++) {
      r.bone(`k${L}${i}1`, 'body', s * 0.026, 0.019, Z[i]);
      r.bone(`k${L}${i}2`, `k${L}${i}1`, s * 0.044, 0.028, Z[i] + DZ[i]);
    }
  });

  // carapace bombée au bord festonné, épines latérales, dessous clair, pièces buccales
  r.add('body', ell(0.03, 0.011, 0.022, 1), [0, 0.024, 0], c.shell, [0, 0, 0], c.top);
  r.add('body', ell(0.024, 0.006, 0.017, 0), [0, 0.017, 0], c.under);
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + i * 0.4;
    r.add('body', ell(0.0045, 0.0028, 0.0035, 0), [Math.sin(a) * 0.026, 0.026, Math.cos(a) * 0.019], c.top);
  }
  r.both((s) => {
    r.put('body', seg([s * 0.027, 0.025, 0.004], [s * 0.037, 0.027, 0.008], 0.0022, 0.0002, 4), c.top);
    r.add('body', ell(0.006, 0.0018, 0.006, 0), [s * 0.012, 0.0345, -0.004], c.shell);
  });
  r.add('head', bx(0.009, 0.004, 0.003), [0, 0.019, 0.021], c.under);
  // yeux sur pédoncules
  r.both((s, L) => {
    r.put(`e${L}`, seg([s * 0.007, 0.03, 0.016], [s * 0.008, 0.04, 0.018], 0.0017, 0.0013, 4), c.top);
    r.add(`e${L}`, ell(0.0028, 0.0028, 0.0028, 0), [s * 0.008, 0.0415, 0.0185], 0x101010);
  });
  // pinces : bras, main renflée, doigt fixe et doigt mobile aux pointes sombres
  r.both((s, L) => {
    r.put(`c${L}1`, seg([s * 0.022, 0.02, 0.016], [s * 0.032, 0.022, 0.03], 0.0042, 0.0036, 5), c.leg, c.top);
    r.add(`c${L}2`, ell(0.0085, 0.0068, 0.0115), [s * 0.034, 0.024, 0.04], c.shell, [0, s * 0.2, 0], c.top);
    r.put(`c${L}2`, seg([s * 0.034, 0.021, 0.049], [s * 0.032, 0.02, 0.058], 0.0034, 0.0016, 4), c.top);
    r.put(`c${L}2`, seg([s * 0.032, 0.02, 0.058], [s * 0.031, 0.0205, 0.062], 0.0016, 0.0003, 4), c.tip);
    r.put(`c${L}3`, seg([s * 0.036, 0.026, 0.048], [s * 0.034, 0.0255, 0.057], 0.003, 0.0014, 4), c.top);
    r.put(`c${L}3`, seg([s * 0.034, 0.0255, 0.057], [s * 0.033, 0.025, 0.061], 0.0014, 0.0003, 4), c.tip);
  });
  // quatre paires de pattes articulées
  r.both((s, L) => {
    for (let i = 0; i < 4; i++) {
      const base: V3 = [s * 0.026, 0.019, Z[i]], knee: V3 = [s * 0.044, 0.028, Z[i] + DZ[i]], foot: V3 = [s * 0.058, 0.0005, Z[i] + DZ[i] * 1.6];
      r.put(`k${L}${i}1`, seg(base, knee, 0.0026, 0.0021, 4), c.leg, c.top);
      r.put(`k${L}${i}2`, seg(knee, along(knee, foot, 0.8), 0.0021, 0.0012, 4), c.leg);
      r.put(`k${L}${i}2`, seg(along(knee, foot, 0.8), foot, 0.0012, 0.0002, 4), c.tip);
    }
  });

  /** pas de côté : deux groupes de pattes alternés */
  const scuttle = (P: Pose, u: number, A: number) => {
    for (const [s, L] of [[1, 'L'], [-1, 'R']] as [number, string][])
      for (let i = 0; i < 4; i++) {
        const w = TAU * (u - ((i + (s > 0 ? 0 : 1)) % 2) * 0.5);
        R(P, `k${L}${i}1`, 0, 0.12 * A * Math.sin(w), s * A * 0.4 * pos(Math.cos(w)));
        R(P, `k${L}${i}2`, 0, 0, -s * A * 0.3 * Math.sin(w));
      }
    R(P, 'body', 0, 0, 0.04 * A * sn(u, 2));
    M(P, 'body', 0, 0.0008 * pos(sn(u, 2)), 0);
  };
  const pinch = (P: Pose, L: string, k: number) => R(P, `c${L}3`, -0.45 * k);
  const clips: ClipDef[] = [
    ['Walk', 0.55, (u, P) => { scuttle(P, u, 1); R(P, 'eL', 0.1 * sn(u, 2)); R(P, 'eR', 0.1 * sn(u, 2, 0.25)); }],
    // détale pinces levées
    ['Gallop', 0.3, (u, P) => {
      scuttle(P, u, 1.4);
      for (const [s, L] of [[1, 'L'], [-1, 'R']] as [number, string][]) { R(P, `c${L}1`, -0.5, 0, s * 0.3); pinch(P, L, 0.6); }
    }],
    // porte la nourriture à la bouche d'une pince puis de l'autre, les yeux s'agitent
    ['Idle', 4, (u, P) => {
      for (const [s, L, a] of [[1, 'L', 0], [-1, 'R', 0.5]] as [number, string, number][]) {
        const k = win((u - a + 1) % 1, 0.05, 0.42, 0.08);
        R(P, `c${L}1`, -0.15 * k, -s * 0.5 * k);
        R(P, `c${L}2`, -0.2 * k, -s * 0.6 * k);
        pinch(P, L, pos(sn(u, 8)) * k);
      }
      R(P, 'eL', 0.4 * blip(u, 0.3), 0, 0.3 * blip(u, 0.7)); R(P, 'eR', 0.4 * blip(u, 0.32), 0, -0.3 * blip(u, 0.75));
      R(P, 'body', 0, 0, 0.03 * sn(u));
    }],
    // tassé, pattes repliées, yeux couchés
    ['Sleep', 6, (u, P) => {
      M(P, 'body', 0, -0.006, 0);
      for (const [s, L] of [[1, 'L'], [-1, 'R']] as [number, string][]) {
        for (let i = 0; i < 4; i++) { R(P, `k${L}${i}1`, 0, 0, s * 0.45); R(P, `k${L}${i}2`, 0, 0, -s * 0.5); }
        R(P, `c${L}1`, 0.1, -s * 0.5); R(P, `c${L}2`, 0, -s * 0.4);
        R(P, `e${L}`, -1.2);
      }
    }],
    // menace : se dresse, pinces levées grandes ouvertes, se balance
    ['Idle_2', 3, (u, P) => {
      const k = win(u, 0.1, 0.9, 0.15);
      M(P, 'body', 0, 0.005 * k, 0);
      R(P, 'body', -0.15 * k, 0, 0.08 * k * sn(u, 2));
      for (const [s, L] of [[1, 'L'], [-1, 'R']] as [number, string][]) {
        R(P, `c${L}1`, -0.8 * k, 0, s * 0.5 * k);
        R(P, `c${L}2`, -0.3 * k);
        pinch(P, L, k * (0.7 + 0.3 * sn(u, 4)));
        for (let i = 0; i < 4; i++) R(P, `k${L}${i}1`, 0, 0, -s * 0.2 * k);
      }
    }],
  ];
  return { rig: r, clips };
}

// ---------- Dragon ----------

const DRAGON_COATS: Coat[] = [
  // rouge sang au ventre d'or, vert bronze, noir aux reflets violets
  { back: 0x7a2420, top: 0x9a3428, belly: 0xd8b070, wing: 0x6a2228, spar: 0x3a1614, spike: 0xe8d8b0, horn: 0xe2d6bc, eye: 0xffd040, mouth: 0xb8403a },
  { back: 0x2e5a2c, top: 0x3e7236, belly: 0xc8c080, wing: 0x3a5a34, spar: 0x1e3018, spike: 0xd8d0a0, horn: 0xd8ccb0, eye: 0xffb020, mouth: 0xb04a40 },
  { back: 0x2a2232, top: 0x3e3048, belly: 0x8a7a8a, wing: 0x3a2a46, spar: 0x16101c, spike: 0xc8b8d0, horn: 0xd0c4b8, eye: 0xff6a20, mouth: 0xa83a3a },
];

/** Articulations de l'aile gauche déployée : épaule, coude, poignet ; bouts des trois doigts ; attaches de la membrane au flanc */
const WING_JOINTS: V3[] = [[0.06, 0.285, 0.075], [0.2, 0.335, 0.03], [0.345, 0.375, 0.05]];
const WING_TIPS: V3[] = [[0.62, 0.385, -0.04], [0.57, 0.315, -0.2], [0.43, 0.27, -0.31]];
const WING_ROOT: V3[] = [[0.2, 0.275, -0.2], [0.055, 0.255, -0.16]];

/**
 * Point de la surface d'un ellipsoïde du corps (centre c0, demi-axes rr) à la hauteur z, à l'angle a (0 : flanc, π/2 : dos),
 * côté s, et sa normale (pour y poser une écaille, une côte)
 */
function barrel(c0: V3, rr: V3, z: number, a: number, s: number, lift = 0.002): { at: V3; rot: V3 } | null {
  const k2 = 1 - ((z - c0[2]) / rr[2]) ** 2;
  if (k2 <= 0.04) return null;
  const k = Math.sqrt(k2), x = s * rr[0] * Math.cos(a) * k, y = c0[1] + rr[1] * Math.sin(a) * k;
  const n = new THREE.Vector3(x / rr[0] ** 2, (y - c0[1]) / rr[1] ** 2, (z - c0[2]) / rr[2] ** 2).normalize();
  return { at: [x + n.x * lift, y + n.y * lift, z + n.z * lift], rot: rotTo(n) };
}

/**
 * Dragon : corps massif (tonneau des côtes aux flancs côtelés, poitrail en carène, ventre qui pend sous ses plaques claires,
 * croupe ronde et grosses cuisses), rangées d'écailles le long de l'échine, crête d'épines du crâne au bout de la queue, cou
 * puissant en trois segments, tête cornue aux yeux de braise, mâchoire dentée qui s'ouvre sur une gueule rouge ; grandes ailes
 * de chauve-souris aux os visibles (bras, avant-bras, griffe du pouce, trois longs doigts) dont la membrane suit chaque os, tendue
 * ou plissée le long des flancs ; pattes griffues (les arrière au jarret retourné), queue effilée jusqu'à un petit fer de lance. Il marche, court, se repose en balançant la queue, vole à grands coups d'ailes, se
 * dresse en rugissant, crache le feu cou tendu, tressaille sous les coups, s'effondre et meurt, dort enroulé sur lui-même
 */
function dragon(c: Coat): { rig: Rig; clips: ClipDef[] } {
  const r = new Rig();
  r.bone('hips', null, 0, 0.2, -0.08);
  r.bone('chest', 'hips', 0, 0.21, 0.08);
  r.bone('ribs', 'chest', 0, 0.21, 0.02);
  r.bone('neck1', 'chest', 0, 0.25, 0.16);
  r.bone('neck2', 'neck1', 0, 0.31, 0.23);
  r.bone('neck3', 'neck2', 0, 0.36, 0.29);
  r.bone('head', 'neck3', 0, 0.385, 0.33);
  r.bone('jaw', 'head', 0, 0.372, 0.36);
  r.bone('tail1', 'hips', 0, 0.2, -0.17);
  r.bone('tail2', 'tail1', 0, 0.18, -0.29);
  r.bone('tail3', 'tail2', 0, 0.15, -0.41);
  r.bone('tail4', 'tail3', 0, 0.12, -0.52);
  r.both((s, L) => {
    r.bone(`f${L}1`, 'chest', s * 0.07, 0.18, 0.1);
    r.bone(`f${L}2`, `f${L}1`, s * 0.082, 0.095, 0.12);
    r.bone(`h${L}1`, 'hips', s * 0.075, 0.19, -0.1);
    r.bone(`h${L}2`, `h${L}1`, s * 0.088, 0.1, -0.06);
    // l'aile : bras (épaule → coude), avant-bras (coude → poignet), main, et trois longs doigts qui tendent la membrane
    const [S, E, W] = WING_JOINTS.map((p) => mirror(p, s));
    r.bone(`w${L}1`, 'chest', ...S);
    r.bone(`w${L}2`, `w${L}1`, ...E);
    r.bone(`w${L}3`, `w${L}2`, ...W);
    for (const f of ['a', 'b', 'c']) r.bone(`w${L}${f}`, `w${L}3`, ...W);
  });

  // corps : tonneau des côtes (qui respire), poitrail profond en carène, ventre qui pend, croupe ronde ; du ventre clair au dos
  const RIBS: V3 = [0, 0.218, 0.035], RIBR: V3 = [0.088, 0.086, 0.13], HIPS: V3 = [0, 0.208, -0.085], HIPR: V3 = [0.078, 0.076, 0.105];
  r.add('ribs', ell(RIBR[0], RIBR[1], RIBR[2]), RIBS, c.back, [0, 0, 0], c.top);
  r.add('ribs', ell(0.07, 0.052, 0.115), [0, 0.164, 0.005], c.belly, [0.05, 0, 0], c.back);
  r.add('chest', ell(0.07, 0.088, 0.072), [0, 0.205, 0.13], c.belly, [-0.3, 0, 0], c.back);
  r.add('hips', ell(HIPR[0], HIPR[1], HIPR[2]), HIPS, c.back, [0, 0, 0], c.top);
  // pectoraux saillants à la naissance des pattes avant
  r.both((s) => r.add('chest', ell(0.036, 0.05, 0.042), [s * 0.046, 0.19, 0.14], c.back, [-0.25, 0, -s * 0.2], c.top));
  // le ventre cuirassé : des plaques claires qui suivent sa courbe, du poitrail à l'entrejambe
  for (let i = 0; i < 9; i++) {
    const z = 0.175 - i * 0.034, u = (z - 0.03) / 0.15, y = 0.113 + u * u * 0.03, b = z > 0.1 ? 'chest' : z > -0.06 ? 'ribs' : 'hips';
    r.add(b, bx(0.078 - Math.abs(u) * 0.03, 0.007, 0.031), [0, y, z], i % 2 ? c.belly : c.spike, [-Math.atan(u * 0.4), 0, 0]);
  }
  // flancs côtelés : les côtes saillent sous les écailles, du dos au ventre
  r.both((s) => {
    for (let i = 0; i < 6; i++) {
      const z = 0.125 - i * 0.034, pts = [0.62, 0.15, -0.38].map((a) => barrel(RIBS, RIBR, z - a * 0.012, a, s, 0.001)).filter(Boolean) as { at: V3 }[];
      for (let j = 0; j + 1 < pts.length; j++) r.put('ribs', seg(pts[j].at, pts[j + 1].at, 0.0048 - j * 0.001, 0.004 - j * 0.001, 4), c.back, c.top);
    }
  });
  // écailles du dos, en rangées qui se chevauchent de part et d'autre de l'échine (plus grandes vers l'échine)
  r.both((s) => {
    [1.22, 0.98, 0.74].forEach((a, row) => {
      for (let i = 0; i < 10; i++) {
        const z = 0.15 - i * 0.034 - (row % 2) * 0.017, onRibs = z > -0.035, p = barrel(onRibs ? RIBS : HIPS, onRibs ? RIBR : HIPR, z, a, s);
        if (!p) continue;
        const k = 1 - row * 0.2;
        r.add(z > 0.12 ? 'chest' : onRibs ? 'ribs' : 'hips', new THREE.OctahedronGeometry(0.015 * k, 0).scale(1, 0.32, 1.35), p.at, row ? c.back : c.top, p.rot, c.top);
      }
    });
  });
  // cou en trois segments, puissant à sa naissance, gorge claire et ses plaques
  const NECK: [string, V3, V3, number, number][] = [
    ['neck1', [0, 0.245, 0.135], [0, 0.31, 0.23], 0.058, 0.045], ['neck2', [0, 0.31, 0.23], [0, 0.36, 0.29], 0.045, 0.036], ['neck3', [0, 0.36, 0.29], [0, 0.385, 0.335], 0.036, 0.03],
  ];
  for (const [b, p, q, r1, r2] of NECK) {
    r.put(b, seg(p, q, r1, r2, 8), c.back, c.top);
    for (const t of [0.12, 0.38, 0.64, 0.9]) { const o = onSeg(p, q, r1, r2, t, -Math.PI / 2, -0.004); r.add(b, ell((r1 + (r2 - r1) * t) * 0.85, 0.008, 0.019, 0), o.at, c.belly, o.rot); }
  }
  // tête : crâne, arcades, long museau, narines, yeux de braise à pupille fendue, cornes recourbées, collerette d'épines
  r.add('head', ell(0.04, 0.034, 0.048), [0, 0.392, 0.355], c.back, [0, 0, 0], c.top);
  r.put('head', flat(seg([0, 0.388, 0.37], [0, 0.382, 0.452], 0.03, 0.019, 7), 0.385, 1.15, 0.7), c.back, c.top);
  r.add('head', ell(0.016, 0.008, 0.012, 0), [0, 0.398, 0.448], c.top);
  r.both((s) => {
    r.add('head', ell(0.005, 0.004, 0.006, 0), [s * 0.009, 0.395, 0.458], 0x1a0e0c);
    r.add('head', ell(0.013, 0.006, 0.02, 0), [s * 0.024, 0.415, 0.37], c.top, [0, s * 0.3, 0]);
    r.add('head', ell(0.009, 0.008, 0.008, 0), [s * 0.03, 0.404, 0.384], c.eye);
    r.add('head', bx(0.002, 0.009, 0.003), [s * 0.0375, 0.404, 0.387], 0x140808);
    // cornes : deux segments qui filent vers l'arrière en se recourbant
    r.put('head', seg([s * 0.022, 0.415, 0.345], [s * 0.034, 0.44, 0.3], 0.011, 0.007, 5), c.horn);
    r.put('head', seg([s * 0.034, 0.44, 0.3], [s * 0.038, 0.448, 0.25], 0.007, 0.001, 5), c.horn);
    // la collerette : trois épines de chaque côté de la mâchoire
    for (let i = 0; i < 3; i++) r.put('head', seg([s * 0.034, 0.38 - i * 0.01, 0.34 - i * 0.008], [s * (0.058 + i * 0.004), 0.385 - i * 0.016, 0.31 - i * 0.012], 0.006, 0.001, 4), c.spike);
  });
  // dents du haut, de part et d'autre du museau
  for (let z = 0.39; z < 0.45; z += 0.012) {
    const x = 0.02 - (z - 0.37) * 0.09;
    r.both((s) => r.put('head', seg([s * x, 0.374, z], [s * x, 0.362, z], 0.0028, 0.0004, 3), 0xf2ecd8));
  }
  // mâchoire : os clair, gueule rouge, dents du bas, langue fourchue
  r.put('jaw', flat(seg([0, 0.366, 0.36], [0, 0.362, 0.445], 0.026, 0.015, 6), 0.364, 1.1, 0.45), c.belly, c.back);
  r.add('jaw', bx(0.026, 0.003, 0.07), [0, 0.37, 0.405], c.mouth);
  r.put('jaw', seg([0, 0.372, 0.37], [0, 0.373, 0.43], 0.006, 0.003, 4), 0xc85a5a);
  for (let z = 0.395; z < 0.445; z += 0.012) {
    const x = 0.017 - (z - 0.37) * 0.08;
    r.both((s) => r.put('jaw', seg([s * x, 0.366, z], [s * x, 0.376, z], 0.0025, 0.0004, 3), 0xf2ecd8));
  }
  // la crête : des épines du crâne au bout de la queue, plus petites vers la pointe
  const crest: [string, number, number, number][] = [
    ['neck3', 0.392, 0.315, 0.012], ['neck2', 0.37, 0.265, 0.014], ['neck2', 0.345, 0.235, 0.015], ['neck1', 0.322, 0.2, 0.017], ['neck1', 0.3, 0.17, 0.018],
    ['chest', 0.298, 0.12, 0.022], ['ribs', 0.296, 0.07, 0.024], ['ribs', 0.292, 0.02, 0.024], ['hips', 0.28, -0.03, 0.022], ['hips', 0.275, -0.08, 0.02], ['hips', 0.265, -0.13, 0.018],
    ['tail1', 0.235, -0.19, 0.016], ['tail1', 0.225, -0.24, 0.014], ['tail2', 0.205, -0.3, 0.013], ['tail2', 0.19, -0.35, 0.011], ['tail3', 0.17, -0.41, 0.01], ['tail3', 0.155, -0.46, 0.008],
    ['tail4', 0.136, -0.525, 0.0065], ['tail4', 0.124, -0.57, 0.005], ['tail4', 0.112, -0.61, 0.004],
  ];
  for (const [b, y, z, h] of crest) r.put(b, flat(seg([0, y - h * 0.4, z], [0, y + h, z - h * 0.6], h * 0.55, 0.0008, 4), y, 0.45, 1), c.spike);
  // queue : quatre segments qui s'effilent jusqu'à un fil, plaques claires dessous, petit fer de lance au bout
  const TAIL: [string, V3, V3, number, number][] = [
    ['tail1', [0, 0.205, -0.16], [0, 0.18, -0.29], 0.052, 0.037], ['tail2', [0, 0.18, -0.29], [0, 0.15, -0.41], 0.037, 0.024],
    ['tail3', [0, 0.15, -0.41], [0, 0.12, -0.52], 0.024, 0.012], ['tail4', [0, 0.12, -0.52], [0, 0.093, -0.655], 0.012, 0.0025],
  ];
  for (const [b, p, q, r1, r2] of TAIL) {
    r.put(b, seg(p, q, r1, r2, 7), c.back, c.top);
    if (r2 > 0.01) for (const t of [0.15, 0.45, 0.75]) { const o = onSeg(p, q, r1, r2, t, -Math.PI / 2, -0.003); r.add(b, ell((r1 + (r2 - r1) * t) * 0.8, 0.007, 0.022, 0), o.at, c.belly, o.rot); }
  }
  r.add('tail4', new THREE.OctahedronGeometry(0.022, 0).scale(1, 0.16, 1.5), [0, 0.092, -0.672], c.back, [0, 0, 0], c.top);
  // pattes : épaule et grosse cuisse musclées, avant-bras, jarret retourné derrière, pieds à trois griffes
  r.both((s, L) => {
    const fx = s * 0.082, hx = s * 0.088;
    r.add(`f${L}1`, ell(0.025, 0.062, 0.038), [s * 0.068, 0.15, 0.11], c.back, [0.2, 0, -s * 0.1], c.top);
    r.put(`f${L}2`, seg([fx, 0.1, 0.12], [fx, 0.018, 0.112], 0.02, 0.015, 6), c.back);
    r.add(`f${L}2`, ell(0.02, 0.01, 0.026, 0), [fx, 0.012, 0.122], c.back);
    for (let i = -1; i <= 1; i++) r.put(`f${L}2`, seg([fx + i * 0.01, 0.01, 0.138], [fx + i * 0.013, 0.002, 0.156], 0.004, 0.0008, 4), c.horn);
    // la cuisse : une masse ronde qui déborde du flanc, le mollet bombé
    r.add(`h${L}1`, ell(0.03, 0.07, 0.066), [s * 0.066, 0.165, -0.088], c.back, [0.4, 0, -s * 0.08], c.top);
    r.put(`h${L}2`, seg([hx, 0.1, -0.06], [hx, 0.045, -0.115], 0.021, 0.015, 6), c.back);
    r.put(`h${L}2`, seg([hx, 0.045, -0.115], [hx, 0.014, -0.095], 0.015, 0.013, 6), c.back);
    r.add(`h${L}2`, ell(0.021, 0.01, 0.03, 0), [hx, 0.011, -0.08], c.back);
    for (let i = -1; i <= 1; i++) r.put(`h${L}2`, seg([hx + i * 0.011, 0.009, -0.058], [hx + i * 0.014, 0.002, -0.04], 0.0045, 0.0008, 4), c.horn);
  });
  // ailes : les os bien visibles (bras, avant-bras, nœuds des articulations, griffe du pouce, trois longs doigts) et la membrane
  // tendue entre eux et le flanc, qui suit chaque os : tendue l'aile ouverte, plissée l'aile repliée
  r.both((s, L) => {
    const [S, E, W] = WING_JOINTS.map((p) => mirror(p, s)), [Ta, Tb, Tc] = WING_TIPS.map((p) => mirror(p, s)), [M, B] = WING_ROOT.map((p) => mirror(p, s));
    r.put(`w${L}1`, seg(S, E, 0.018, 0.012, 6), c.back, c.top);
    r.add(`w${L}2`, ell(0.014, 0.013, 0.014, 0), E, c.back);
    r.put(`w${L}2`, seg(E, W, 0.012, 0.009, 6), c.back, c.top);
    r.add(`w${L}3`, ell(0.012, 0.011, 0.012, 0), W, c.back);
    r.put(`w${L}3`, seg(W, [W[0] + s * 0.012, W[1] + 0.03, W[2] + 0.025], 0.006, 0.001, 4), c.horn);
    ([['a', Ta], ['b', Tb], ['c', Tc]] as [string, V3][]).forEach(([f, T]) => {
      r.put(`w${L}${f}`, seg(W, T, 0.0075, 0.0015, 5), c.spar);
      r.add(`w${L}${f}`, ell(0.0065, 0.0065, 0.0065, 0), along(W, T, 0.45), c.spar);
    });
    // le bord de fuite festonné, creusé entre les doigts
    const dip = (P: V3, Q: V3, k = 0.8): V3 => along(W, along(P, Q, 0.5), k);
    r.web(c.wing, [
      { at: S, on: ['chest'] }, { at: E, on: [`w${L}2`] }, { at: W, on: [`w${L}3`] },
      { at: Ta, on: [`w${L}a`] }, { at: dip(Ta, Tb), on: [`w${L}a`, `w${L}b`] }, { at: Tb, on: [`w${L}b`] }, { at: dip(Tb, Tc), on: [`w${L}b`, `w${L}c`] },
      { at: Tc, on: [`w${L}c`] }, { at: along(Tc, M, 0.5), on: [`w${L}c`, `w${L}1`] }, { at: M, on: [`w${L}1`, 'hips'] }, { at: B, on: ['hips'] },
    ], [[2, 3, 4], [2, 4, 5], [2, 5, 6], [2, 6, 7], [2, 7, 8], [2, 8, 9], [1, 2, 9], [1, 9, 10], [0, 1, 10]]);
  });

  /**
   * Ailes repliées le long des flancs (k = 1) ou déployées (k = 0), comme celles d'une chauve-souris : le bras se couche vers
   * l'arrière, l'avant-bras revient vers l'avant (le poignet et sa griffe au-dessus de l'épaule), la main et ses doigts
   * repartent vers l'arrière en se resserrant, la membrane plissée entre eux
   */
  const fold = (P: Pose, k: number) => {
    r.both((s, L) => {
      // (angles calculés pour amener le coude derrière l'épaule, le poignet au-dessus d'elle, les doigts le long du flanc)
      R(P, `w${L}1`, -0.234 * k, s * 0.69 * k, s * 0.077 * k);
      R(P, `w${L}2`, 0.817 * k, -s * 1.369 * k, s * 0.622 * k);
      R(P, `w${L}3`, 0.251 * k, s * 1.623 * k, -s * 0.56 * k);
      R(P, `w${L}a`, -0.024 * k, s * 0.526 * k, -s * 0.105 * k); R(P, `w${L}c`, -0.06 * k, -s * 0.455 * k, s * 0.126 * k);
    });
  };
  /** coup d'aile : `f` de -1 (aile basse) à 1 (aile haute) ; le bout suit avec retard (`g`) */
  const flap = (P: Pose, f: number, g: number) => {
    r.both((s, L) => {
      R(P, `w${L}1`, 0, s * 0.1, s * (0.15 + 0.75 * f));
      R(P, `w${L}2`, 0, -s * 0.12 * (1 - g), s * (0.1 + 0.3 * g));
      R(P, `w${L}3`, 0, s * 0.1 * (1 + g), s * 0.25 * g);
      // à la remontée, les doigts se resserrent un peu (la membrane fasèye moins)
      R(P, `w${L}a`, 0, s * 0.12 * pos(g), 0); R(P, `w${L}c`, 0, -s * 0.08 * pos(g), 0);
    });
  };
  const tail = (P: Pose, a: number, u: number, f = 1, side = true) => {
    for (let i = 1; i <= 4; i++) {
      if (side) R(P, `tail${i}`, 0, a * (0.7 + i * 0.25) * sn(u, f, -i * 0.1));
      else R(P, `tail${i}`, a * (0.6 + i * 0.2) * sn(u, f, -i * 0.12));
    }
  };
  const neck = (P: Pose, x: number, y = 0) => { R(P, 'neck1', x * 0.4, y * 0.3); R(P, 'neck2', x * 0.35, y * 0.35); R(P, 'neck3', x * 0.25, y * 0.35); };
  const walk = { hL: 0, fL: 0.2, hR: 0.5, fR: 0.7 };
  const clips: ClipDef[] = [
    ['Walk', 1.4, (u, P) => {
      stride(P, u, walk, 0.38, 0.7);
      M(P, 'hips', 0, -0.004 * cs(u, 2), 0);
      R(P, 'hips', 0, 0.04 * sn(u), 0.03 * sn(u));
      R(P, 'chest', 0, -0.05 * sn(u), -0.04 * sn(u));
      neck(P, 0.06 * sn(u, 2), 0.12 * sn(u, 1, 0.2));
      R(P, 'head', -0.05 * sn(u, 2, 0.1), -0.1 * sn(u, 1, 0.2));
      tail(P, 0.14, u);
      fold(P, 1);
      R(P, 'wL1', 0, 0, 0.04 * sn(u, 2)); R(P, 'wR1', 0, 0, -0.04 * sn(u, 2));
      breathe(P, u, 2, 0.6);
    }],
    ['Gallop', 0.8, (u, P) => {
      stride(P, u, { hL: 0, hR: 0.08, fL: 0.45, fR: 0.55 }, 0.75, 1.1);
      M(P, 'hips', 0, 0.016 * (pos(sn(u, 1, -0.1)) - 0.4), 0);
      R(P, 'hips', 0.12 * sn(u)); R(P, 'chest', -0.12 * sn(u, 1, 0.2));
      neck(P, 0.2 + 0.1 * sn(u, 1, 0.35));
      R(P, 'head', -0.15);
      tail(P, 0.12, u, 1, false);
      fold(P, 0.7);
      R(P, 'wL1', 0, 0, 0.2 * sn(u)); R(P, 'wR1', 0, 0, -0.2 * sn(u));
    }],
    ['Idle', 6, (u, P) => {
      breathe(P, u, 3);
      const look = Math.sin(TAU * u) * win(u, 0.05, 0.95, 0.15);
      neck(P, 0.05 * sn(u, 2, 0.3), 0.35 * look);
      R(P, 'head', 0.06 * sn(u, 2, 0.3), 0.3 * look);
      R(P, 'jaw', 0.12 * pos(sn(u, 6)) * win(u, 0.55, 0.9, 0.05));
      tail(P, 0.18, u, 2);
      fold(P, 1);
      // il remue les ailes de temps en temps
      const shrug = win(u, 0.3, 0.45, 0.06);
      R(P, 'wL1', 0, -0.25 * shrug, 0.3 * shrug); R(P, 'wR1', 0, 0.25 * shrug, -0.3 * shrug);
    }],
    // en vol : grands coups d'ailes (le bout des ailes suit avec retard), pattes repliées, queue qui ondule
    ['Fly', 1, (u, P) => {
      const f = sn(u);
      flap(P, f, sn(u, 1, -0.12));
      M(P, 'hips', 0, -0.02 * f, 0);
      for (const L of ['L', 'R']) { R(P, `f${L}1`, -0.9); R(P, `f${L}2`, 1.7); R(P, `h${L}1`, 1.1); R(P, `h${L}2`, 0.4); }
      neck(P, 0.25 + 0.05 * sn(u, 1, 0.3));
      R(P, 'head', -0.25);
      tail(P, 0.1, u, 1, false);
      breathe(P, u, 1, 0.8);
    }],
    // se dresse, ailes ouvertes, et rugit gueule béante
    ['Idle_2', 3, (u, P) => {
      const k = win(u, 0.08, 0.9, 0.2);
      R(P, 'hips', -0.5 * k);
      M(P, 'hips', 0, 0.02 * k, -0.02 * k);
      for (const L of ['L', 'R']) { R(P, `h${L}1`, 0.5 * k); R(P, `h${L}2`, -0.1 * k); R(P, `f${L}1`, -0.7 * k + 0.1 * k * sn(u, 3)); R(P, `f${L}2`, 0.8 * k); }
      neck(P, -0.5 * k, 0.15 * k * sn(u, 2));
      R(P, 'head', 0.45 * k);
      R(P, 'jaw', 0.75 * k * (0.85 + 0.15 * sn(u, 7)));
      fold(P, 1 - k);
      R(P, 'wL1', 0, 0, 0.55 * k); R(P, 'wR1', 0, 0, -0.55 * k);
      tail(P, 0.35 * k + 0.05, u, 3);
      breathe(P, u, 3, 2);
    }],
    // crache le feu : cou tendu vers l'avant, gueule ouverte, poitrail qui pompe, ailes à demi ouvertes
    ['Attack', 2, (u, P) => {
      neck(P, 0.3, 0.1 * sn(u));
      R(P, 'head', -0.35);
      R(P, 'jaw', 0.7 + 0.12 * sn(u, 8));
      S(P, 'ribs', 1 + 0.06 * sn(u, 2), 1 + 0.08 * sn(u, 2), 1);
      R(P, 'chest', 0.1);
      for (const L of ['L', 'R']) { R(P, `f${L}1`, -0.25); R(P, `f${L}2`, 0.2); }
      fold(P, 0.45);
      R(P, 'wL1', 0, 0, 0.1 * sn(u, 4)); R(P, 'wR1', 0, 0, -0.1 * sn(u, 4));
      tail(P, 0.25, u, 2);
    }],
    // un coup : il rejette la tête, les ailes tressaillent
    ['Hit', 0.7, (u, P) => {
      const k = Math.sin(Math.PI * u);
      neck(P, -0.35 * k, 0.3 * k);
      R(P, 'head', 0.2 * k, 0.2 * k);
      R(P, 'jaw', 0.5 * k);
      M(P, 'hips', 0, 0, -0.012 * k);
      fold(P, 1 - 0.4 * k);
      tail(P, 0.3 * k, u, 2);
    }],
    // il s'effondre : les pattes cèdent, le cou s'abat, les ailes retombent, la queue s'immobilise
    ['Death', 2.4, (u, P) => {
      const k = smooth(u * 1.3), j = smooth(u * 2.2);
      M(P, 'hips', 0, -0.13 * k, 0);
      for (const L of ['L', 'R']) { R(P, `f${L}1`, -0.9 * k); R(P, `f${L}2`, 0.4 * k); R(P, `h${L}1`, 0.8 * k); R(P, `h${L}2`, -0.6 * k); }
      neck(P, -0.4 * j * (1 - k) + 1.2 * k, 0.6 * k);
      R(P, 'head', 0.45 * k, 0.3 * k);
      R(P, 'jaw', 0.6 * j);
      fold(P, (1 - j) * 0.6 + 0.4 * k);
      R(P, 'wL1', 0, 0, -0.5 * k); R(P, 'wR1', 0, 0, 0.5 * k);
      for (let i = 1; i <= 4; i++) R(P, `tail${i}`, 0.05 * k, 0.15 * k);
    }],
    // dort enroulé : couché, le cou ramené sur le flanc, la queue autour du corps
    ['Sleep', 8, (u, P) => {
      breathe(P, u, 2, 1.6);
      M(P, 'hips', 0, -0.085, 0);
      for (const L of ['L', 'R']) { R(P, `f${L}1`, -1.2); R(P, `f${L}2`, 1.1); R(P, `h${L}1`, -0.9); R(P, `h${L}2`, 1.6); }
      neck(P, 0.45, 1.6);
      R(P, 'head', 0.25, 0.6);
      for (let i = 1; i <= 4; i++) R(P, `tail${i}`, 0, -0.45);
      fold(P, 1);
    }],
  ];
  return { rig: r, clips };
}

// ---------- Catalogue ----------

export type BeastKind = 'bear' | 'elephant' | 'giraffe' | 'camel' | 'moose' | 'wolf' | 'croc' | 'lizard' | 'turtle' | 'crab' | 'dragon';
interface BeastDef { coats: Coat[]; build: (c: Coat) => { rig: Rig; clips: ClipDef[] }; yaw?: number }
const DEFS: Record<BeastKind, BeastDef> = {
  bear: { coats: BEAR_COATS, build: bear },
  elephant: { coats: ELEPHANT_COATS, build: elephant },
  giraffe: { coats: GIRAFFE_COATS, build: giraffe },
  camel: { coats: CAMEL_COATS, build: camel },
  moose: { coats: MOOSE_COATS, build: moose },
  wolf: { coats: WOLF_COATS, build: wolf },
  croc: { coats: CROC_COATS, build: croc },
  lizard: { coats: LIZARD_COATS, build: lizard },
  turtle: { coats: TURTLE_COATS, build: turtle },
  // le crabe marche de côté : son flanc gauche mène
  crab: { coats: CRAB_COATS, build: crab, yaw: -Math.PI / 2 },
  // le dragon de la grotte (expédition du Moyen Âge), pas une bête de la faune
  dragon: { coats: DRAGON_COATS, build: dragon },
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
    // mort, il reste à terre
    if (clip.name === 'Death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions.set(clip.name, a);
  }
  return { root, mixer, actions, current: null };
}

/** pour les essais : noms des os et des clips d'une bête */
export function beastInfo(kind: BeastKind) {
  const { rig, clips } = DEFS[kind].build(DEFS[kind].coats[0]);
  return { bones: rig.names, clips: clips.map((c) => c[0]) };
}
