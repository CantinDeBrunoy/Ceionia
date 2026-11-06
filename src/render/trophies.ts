import * as THREE from 'three';
import type { World } from '../world/world';
import { Building, sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { tube } from './festivities';

/**
 * Les trophées de la grande place : un par gros monstre vaincu, posé sur son socle (pierre brute à la Préhistoire, marbre à
 * l'Antiquité, pierre taillée au Moyen Âge, plaque de bronze ensuite, liseré lumineux à l'âge futuriste) : les défenses du
 * mammouth en arche au-dessus de son crâne, le tentacule du kraken qui s'enroule près de son bec, la dent du mégalodon devant
 * sa mâchoire, le crâne cornu du dragon. Ils ne font pas partie du modèle de la place : on les pose par-dessus, aux places
 * que laisse libres le décor de son âge
 */

/** Les trophées possibles, dans l'ordre (chacun a sa place sur la place du village) ; un nouveau monstre s'ajoute au bout */
export const TROPHIES = ['mammoth', 'kraken', 'megalodon', 'dragon'] as const;
export type TrophyId = (typeof TROPHIES)[number];

/**
 * Les trophées gagnés : une mission de ce nom réussie (le mammouth, le dragon), ou un trophée rapporté d'une expédition qui en
 * offrait plusieurs (le mégalodon ou le kraken du monstre des mers)
 */
export function trophiesWon(s: { done: readonly string[]; perks: readonly string[] }): TrophyId[] {
  return TROPHIES.filter((id) => s.done.includes(id) || s.perks.includes(id));
}

/**
 * Où poser chaque trophée sur la place, selon l'âge de la place (repère de son modèle, du milieu, en cases) : entre son cœur et
 * son pourtour, là où ne sont ni bancs, ni étals, ni statues, ni habitants
 */
const SLOTS: [number, number][][] = [
  [[0.92, 0.3], [-0.95, 0.22], [0.32, -0.86], [-0.08, 0.95]],
  [[-0.85, 0.72], [0.78, 0.82], [-0.88, -0.72], [0.95, -0.72]],
  [[-0.75, 0.85], [0.85, 0.45], [-0.75, -0.45], [0.82, -0.62]],
  [[-0.25, -0.94], [0.94, -0.15], [-0.94, 0.15], [-0.2, 0.94]],
  [[0.78, -0.78], [-0.8, -0.62], [0.6, 0.8], [-0.86, 0.3]],
  [[0.6, -0.65], [-0.65, 0.6], [0.66, 0.52], [-0.62, -0.66]],
];
export function trophySlot(id: TrophyId, age: number): [number, number] {
  const s = SLOTS[Math.max(0, Math.min(5, age))];
  return s[TROPHIES.indexOf(id) % s.length];
}

/** l'orientation de la vue d'ensemble (voir CameraRig.reset) */
const VIEW_YAW = 0.75;

const IVORY =0xeee2c4, IVORY_TIP = 0xf8f2e2, BONE = 0xd8ccb0;

/** Le socle, à la mode de l'âge de la place ; rend la hauteur de son dessus */
function plinth(p: Parts, age: number, w: number): number {
  if (age === 0) {
    // une dalle de pierre brute, posée sur deux pierres plus petites
    p.add(new THREE.IcosahedronGeometry(w * 0.62, 0).scale(1, 0.22, 0.8), 0, 0.04, 0, 0x8a857c);
    for (const s of [-1, 1]) p.add(new THREE.IcosahedronGeometry(w * 0.16, 0), s * w * 0.32, 0.02, w * 0.3, 0x9d978d);
    return 0.07;
  }
  const stone = [0, 0xe9e2d4, 0xa8a090, 0xb8b0a0, 0xc8c4bc, 0xf4f6f8][age], trim = [0, 0xd8ccb4, 0x8a8478, 0x9a9282, 0x9a9ea6, 0xe2e6ec][age];
  p.box(w + 0.04, 0.025, w + 0.04, 0, 0, 0, trim);
  p.box(w, 0.07, w, 0, 0.025, 0, stone);
  p.box(w + 0.02, 0.014, w + 0.02, 0, 0.095, 0, trim);
  // la plaque, du côté qu'on regarde : de pierre gravée, de bronze dès l'âge industriel ; un liseré de lumière à l'âge futuriste
  if (age >= 3 && age <= 4) p.box(w * 0.5, 0.035, 0.006, 0, 0.042, w / 2 + 0.002, age === 3 ? 0xb08a3a : 0x8a8f96);
  else if (age === 5) p.box(w + 0.004, 0.006, w + 0.004, 0, 0.06, 0, 0x40e8ff, 0, 'neon');
  else p.box(w * 0.5, 0.03, 0.004, 0, 0.045, w / 2 + 0.001, trim);
  return 0.109;
}

/** Une pièce courbe, le long des points donnés, d'un rayon r0 (au premier point) à r1 (au dernier) */
function curve(p: Parts, pts: number[][], r0: number, r1: number, color: (k: number) => number, seg = 6) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = i / (pts.length - 1), b = (i + 1) / (pts.length - 1);
    // chaque tronçon déborde un peu sur le suivant : pas de jour aux coudes
    const q = pts[i + 1], o = pts[i], e = [q[0] + (q[0] - o[0]) * 0.12, q[1] + (q[1] - o[1]) * 0.12, q[2] + (q[2] - o[2]) * 0.12];
    tube(p, o, e, r0 + (r1 - r0) * a, r0 + (r1 - r0) * b, color(a), seg);
  }
}

/** Les défenses du mammouth : deux grandes défenses d'ivoire en arche, croisées au sommet, au-dessus du crâne ; une peau laineuse */
function mammoth(p: Parts, age: number) {
  const y = plinth(p, age, 0.3);
  // la peau laineuse, jetée sur le socle
  p.add(new THREE.BoxGeometry(0.24, 0.012, 0.2), 0, y, 0.01, 0x6a4a30, 0.15);
  for (let i = 0; i < 7; i++) p.add(new THREE.IcosahedronGeometry(0.026, 0).scale(1, 0.5, 1), -0.1 + i * 0.033, y + 0.008, 0.11 - (i % 2) * 0.02, i % 2 ? 0x5a3e28 : 0x7a5638);
  // le crâne : un dôme bosselé, deux orbites, la base des défenses
  p.add(new THREE.IcosahedronGeometry(0.07, 1).scale(1, 0.9, 0.85), 0, y + 0.07, -0.01, BONE);
  p.add(new THREE.IcosahedronGeometry(0.045, 0).scale(1.2, 0.8, 1), 0, y + 0.13, -0.03, BONE);
  for (const s of [-1, 1]) {
    p.sphere(0.014, s * 0.035, y + 0.09, 0.05, 0x3a3028);
    p.cyl(0.026, 0.03, 0.04, 7, s * 0.05, y + 0.03, 0.04, BONE);
  }
  // les défenses : elles partent vers l'avant, se relèvent et se recourbent l'une vers l'autre
  for (const s of [-1, 1]) {
    const pts: number[][] = [];
    for (let k = 0; k <= 9; k++) {
      const t = k / 9, a = t * Math.PI * 1.05;
      pts.push([s * (0.05 + Math.sin(a) * 0.1 - t * t * 0.1), y + 0.05 + (1 - Math.cos(a)) * 0.17, 0.05 + Math.sin(a * 0.9) * 0.08 - t * 0.05]);
    }
    curve(p, pts, 0.024, 0.006, (k) => (k > 0.8 ? IVORY_TIP : IVORY), 7);
  }
}

/** Le tentacule du kraken : il sort du socle, monte et s'enroule en crosse, ses ventouses au dedans ; le bec noir à son pied */
function kraken(p: Parts, age: number) {
  const y = plinth(p, age, 0.3), skin = 0x8a3a58, belly = 0xd89aa8;
  const pts: number[][] = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, a = t * t * Math.PI * 2.4, r = 0.09 * (1 - t * 0.55);
    // il monte en s'inclinant vers l'arrière, puis s'enroule sur lui-même au sommet
    pts.push([-0.04 + Math.sin(a) * r * t * 1.4, y + 0.02 + Math.min(t, 0.72) * 0.5 - Math.max(0, t - 0.72) * 0.25 + Math.cos(a) * r * t * 0.6, -0.04 - Math.cos(a) * r * t * 1.2 + t * 0.04]);
  }
  curve(p, pts, 0.05, 0.008, (k) => (k > 0.5 ? 0x9a4a68 : skin), 7);
  // les ventouses, sur la face qu'on regarde
  for (let k = 1; k < 14; k++) {
    const a = pts[k], r = 0.05 + (0.008 - 0.05) * (k / 16);
    p.add(new THREE.CylinderGeometry(r * 0.38, r * 0.42, r * 0.2, 7).rotateX(Math.PI / 2), a[0], a[1], a[2] + r * 0.9, belly);
  }
  // le bec, à deux mandibules crochues, posé devant
  for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.03, 0.08, 5).rotateX(s * 0.9 + Math.PI / 2), 0.07, y + 0.035, 0.07 + s * 0.012, 0x2a2024, 0.4);
  // la vague d'écume à son pied (âge 0 et 1 : algues)
  for (let i = 0; i < 5; i++) p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(1.3, 0.5, 1), -0.1 + i * 0.045, y + 0.004, -0.08 + (i % 2) * 0.03, age <= 1 ? 0x4a6a3a : 0xe8f0f2);
}

/** La dent du mégalodon : une dent triangulaire géante, dentelée, dressée devant un arc de mâchoire et ses rangées de dents */
function megalodon(p: Parts, age: number) {
  const y = plinth(p, age, 0.3);
  // l'arc de la mâchoire, derrière : la gencive grise et ses dents
  const jaw = new THREE.TorusGeometry(0.12, 0.016, 5, 14, Math.PI).scale(1, 1.15, 0.8);
  p.add(jaw, 0, y + 0.005, -0.07, 0xc8b89a);
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI, x = Math.cos(a) * 0.12, h = Math.sin(a) * 0.138;
    p.add(new THREE.ConeGeometry(0.012, 0.035, 3).translate(0, -0.02, 0).rotateZ(a - Math.PI / 2 + Math.PI), x * 0.88, y + 0.005 + h * 0.88, -0.06, IVORY_TIP);
  }
  // la grande dent : un triangle aux flancs bombés, épais au milieu, sa racine sombre
  const sh = new THREE.Shape();
  sh.moveTo(-0.075, 0); sh.quadraticCurveTo(-0.06, 0.12, 0, 0.24); sh.quadraticCurveTo(0.06, 0.12, 0.075, 0); sh.lineTo(-0.075, 0);
  const tooth = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.006, bevelSegments: 1, curveSegments: 4 }).translate(0, 0, -0.011);
  p.add(tooth, 0, y + 0.045, 0.03, IVORY_TIP);
  // la racine : la couronne brune en V, et l'étrier qui la tient
  p.add(new THREE.BoxGeometry(0.17, 0.05, 0.05), 0, y + 0.025, 0.03, 0x6a5040);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.012, 0.09, 0.012), s * 0.08, y + 0.045, 0.03, age >= 3 ? 0x5a5e66 : 0x4a3424, 0, false, s * 0.25);
  // la dentelure des bords
  for (let k = 1; k < 8; k++) {
    const t = k / 8, w = 0.075 * (1 - t) + 0.006 * t * (1 - t) * 4;
    for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.006, 0.012, 3).rotateZ(-s * Math.PI / 2), s * (w + 0.008), y + 0.045 + t * 0.235, 0.03, IVORY);
  }
}

/** Le crâne du dragon : le crâne allongé, ses mâchoires ouvertes, ses crocs et ses cornes recourbées vers l'arrière */
function dragon(p: Parts, age: number) {
  const y = plinth(p, age, 0.32), bone = 0xd8d0b8, horn = 0x3a3430;
  p.add(new THREE.IcosahedronGeometry(0.08, 1).scale(0.9, 0.75, 1.1), 0, y + 0.08, -0.04, bone);
  p.add(new THREE.BoxGeometry(0.09, 0.05, 0.16).translate(0, 0, 0.08), 0, y + 0.08, 0.02, bone, 0, false, 0, -0.15);
  p.add(new THREE.BoxGeometry(0.08, 0.025, 0.15).translate(0, 0, 0.075), 0, y + 0.035, 0.02, 0xc8c0a8, 0, false, 0, 0.12);
  for (const s of [-1, 1]) {
    p.sphere(0.018, s * 0.045, y + 0.11, 0.03, 0x2a1e18);
    for (let k = 0; k < 3; k++) p.cone(0.008, 0.035, 4, s * 0.035, y + 0.035, 0.06 + k * 0.035, IVORY_TIP);
    const pts: number[][] = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([s * (0.05 + t * 0.07), y + 0.12 + Math.sin(t * 2) * 0.08, -0.06 - t * 0.14]); }
    curve(p, pts, 0.018, 0.004, () => horn, 5);
  }
}

const DRAW: Record<TrophyId, (p: Parts, age: number) => void> = { mammoth, kraken, megalodon, dragon };

/** Ajoute à `p` le trophée de ce monstre, posé en (0, 0, 0), sa face (sa plaque) vers +z, pour une place de cet âge */
export function trophyParts(p: Parts, id: TrophyId, age: number) { DRAW[id](p, Math.max(0, Math.min(5, age))); }

/**
 * Les trophées posés sur la grande place : on les refait seulement quand la place change (déplacée, d'un autre âge, le terrain
 * dessous) ou qu'un trophée s'ajoute
 */
export class Trophies {
  group = new THREE.Group();
  private key = '';
  constructor(private world: World) {}

  sync(plaza: Building | null, ids: readonly TrophyId[]) {
    const w = this.world, s = plaza ? sizeOf(plaza) : 0;
    const hs: number[] = [];
    if (plaza) for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) hs.push(w.h(plaza.x + i, plaza.z + j));
    const key = plaza && ids.length ? `${plaza.id}|${plaza.x},${plaza.z}|${plaza.rot}|${plaza.age}|${ids.join(',')}|${hs.map((h) => h.toFixed(3)).join(',')}` : '';
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!plaza || !ids.length) return;
    // la hauteur de la place, comme la pose la vue des bâtiments : elle épouse une pente, sinon elle se pose à mi-hauteur
    hs.sort((a, b) => a - b);
    const lo = hs[0], mid = hs.length >> 1, median = hs.length % 2 ? hs[mid] : (hs[mid - 1] + hs[mid]) / 2;
    const draped = hs[hs.length - 1] - lo > 0.03, base = Math.max(lo, median - 0.08);
    const cx = plaza.x + s / 2, cz = plaza.z + s / 2, ry = (plaza.rot * Math.PI) / 2;
    this.group.position.set(cx, 0, cz);
    this.group.rotation.y = ry;
    for (const id of ids) {
      const [x, z] = trophySlot(id, plaza.age), p = new Parts();
      trophyParts(p, id, plaza.age);
      const { body, glow } = p.build();
      const m = new THREE.Mesh(body, mats.body);
      m.castShadow = m.receiveShadow = true;
      // (x, z) dans le repère de la place, tournée comme elle
      const wx = cx + x * Math.cos(ry) + z * Math.sin(ry), wz = cz - x * Math.sin(ry) + z * Math.cos(ry);
      m.position.set(x, (draped ? w.surfaceAt(wx, wz) : base) + 0.01, z);
      // tous tournés du même côté, vers la vue d'ensemble (la caméra regarde le village depuis ce côté-là) : on voit la dent
      // de face, et non sa tranche
      m.rotation.y = VIEW_YAW - ry;
      if (glow) { const g = new THREE.Mesh(glow, mats.glow); m.add(g); }
      this.group.add(m);
    }
  }

  private clear() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((x) => { if (x instanceof THREE.Mesh) x.geometry.dispose(); });
    }
  }
}
