import * as THREE from 'three';
import type { BaseKind } from '../sim/hell';
import { paint, merge } from './battleUnits';

/**
 * Les bâtiments de la base avancée, âge par âge (1 Antiquité : bois, toile, pieux ; 2 Médiéval : pierre, créneaux, bannières ;
 * 3 Industriel : brique, cheminées, tôle, fumée ; 4 Moderne : béton, projecteurs, antennes ; 5 Futuriste : métal lisse, néons,
 * boucliers d'énergie, hologrammes). Même emprise et même face (nord, vers le portail) à chaque âge : un bâtiment « monte de
 * niveau » sans bouger. Chaque variante a ses détails au sol (caisses, tonneaux, sacs, planches, outils, lampes, fanions) et son
 * ombre. Les flammes (`flame`, rejouées en hauteur par la vue), les champs d'énergie (`field`, translucides) et les pièces qui
 * tournent (`spin` : radar, hologramme) sont des maillages à part ; `smoke` et `sparks` sont les points d'où partent fumée et étincelles
 */

export const BASE_AGE_MAX = 5;
/** L'âge du village (0 à 99 selon la sim) ramené aux cinq variantes */
export const baseAgeOf = (age: number) => Math.max(1, Math.min(BASE_AGE_MAX, Math.round(age) || 1));

type V3 = [number, number, number];
export interface BaseParts {
  solid: THREE.BufferGeometry;
  shine: THREE.BufferGeometry | null;
  flame: THREE.BufferGeometry | null;
  field: THREE.BufferGeometry | null;
  /** pièces qui tournent sur elles-mêmes autour de leur pivot (x, z) */
  spin: { geo: THREE.BufferGeometry; x: number; z: number }[];
  /** hauteur du pied des flammes (la vue les étire sans les décoller) */
  flameY: number;
  /** hauteur de la lumière du feu (0 : sans feu) */
  fire: number;
  flag: V3 | null;
  smoke: V3[];
  sparks: V3[];
}

const WOOD = 0x9a6a3c, DARKWOOD = 0x6a4426, CLOTH = 0xe8dcc0, STONE = 0x8a8590, DARK = 0x4a4650, BLUE = 0x2e6ad8, GOLD = 0xf0c040;
const FIRE = 0xffa040, EMBER = 0xff6a20, WARM = 0xffc060, CYAN = 0x40f0ff, MAGENTA = 0xff50d0, WHITE = 0xf4f0e6, RED = 0xd8443a;
/** Matériaux de chaque âge : mur, mur sombre, toit, garniture, étendard */
const ST: { wall: number; wall2: number; roof: number; trim: number; acc: number }[] = [
  { wall: WOOD, wall2: DARKWOOD, roof: CLOTH, trim: 0xc89a6a, acc: BLUE },
  { wall: WOOD, wall2: DARKWOOD, roof: CLOTH, trim: 0xc89a6a, acc: BLUE },
  { wall: 0x8a8590, wall2: 0x5e5a66, roof: 0x3a5a9a, trim: 0xb8b2bc, acc: BLUE },
  { wall: 0xa4553a, wall2: 0x6a3424, roof: 0x7a8088, trim: 0x4a4650, acc: 0x2e6ad8 },
  { wall: 0xc8cacc, wall2: 0x9a9ca0, roof: 0x5a5e66, trim: 0xe0b030, acc: 0x2e6ad8 },
  { wall: 0xdfe6ee, wall2: 0x8a98ac, roof: 0xc4d0e0, trim: CYAN, acc: CYAN },
];

export function baseAgeGeo(kind: BaseKind, ageIn: number): BaseParts | null {
  const a = baseAgeOf(ageIn), S = ST[a];
  const solid: THREE.BufferGeometry[] = [], shine: THREE.BufferGeometry[] = [], flame: THREE.BufferGeometry[] = [], field: THREE.BufferGeometry[] = [];
  /** pièces qui tournent, regroupées par pivot (x, z) */
  const spinAt = new Map<string, { x: number; z: number; list: THREE.BufferGeometry[] }>();
  const sp = (x: number, z: number, g: THREE.BufferGeometry) => { const k = `${x.toFixed(3)},${z.toFixed(3)}`; let e = spinAt.get(k); if (!e) spinAt.set(k, e = { x, z, list: [] }); e.list.push(g); };
  const smoke: V3[] = [], sparks: V3[] = [];
  let fire = 0, flameY = 0, flag: V3 | null = null;
  const shade = (t: number) => 0.8 + t * 0.3;
  // y = pied de la pièce
  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) => { solid.push(paint(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z), c, shade)); };
  const cy = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, c: number, ry = 0) => { solid.push(paint(new THREE.CylinderGeometry(rt, rb, h, seg).rotateY(ry).translate(x, y + h / 2, z), c, shade)); };
  const cn = (r: number, h: number, seg: number, x: number, y: number, z: number, c: number, ry = 0) => cy(0, r, h, seg, x, y, z, c, ry);
  const pyr = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => { solid.push(paint(new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).scale(w, h, d).translate(x, y + h / 2, z), c, shade)); };
  const gl = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => { shine.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), c)); };
  const flm = (r: number, h: number, x: number, y: number, z: number, c = FIRE) => { flameY = y; flame.push(paint(new THREE.ConeGeometry(r, h, 5).translate(x, y + h / 2, z), c)); };

  // ----- éléments communs -----
  /** ombre portée : un disque sombre à plat sous le bâtiment */
  const shadow = (rx: number, rz: number, x = 0, z = 0.1) => solid.push(paint(new THREE.CylinderGeometry(1, 1, 0.012, 14).scale(rx * 0.88, 1, rz * 0.88).translate(x, 0.006, z), 0x3a2228));
  /** dalle ou sol préparé : terre battue (rien), pierre, brique, béton, plaque de métal à liseré néon */
  const pad = (hw: number, hd: number, x = 0, z = 0.1) => {
    if (a === 1) return;
    const c = [0, 0, 0x6e6a74, 0x6a3a2a, 0x8e9092, 0x9aa6b8][a];
    bx(hw * 2, 0.04, hd * 2, x, 0, z, c);
    if (a === 4) for (let i = -2; i <= 2; i++) bx(0.03, 0.045, hd * 1.8, x + i * hw * 0.4, 0, z, 0xe0b030);
    if (a === 5) {
      for (const s of [-1, 1]) { gl(hw * 2 - 0.1, 0.012, 0.025, x, 0.04, z + s * (hd - 0.04), CYAN); gl(0.025, 0.012, hd * 2 - 0.1, x + s * (hw - 0.04), 0.04, z, CYAN); }
    }
  };
  const crate = (x: number, y: number, z: number, s: number, ry = 0) => {
    if (a <= 2) { bx(s, s, s, x, y, z, WOOD, ry); bx(s * 1.04, s * 0.12, s * 1.04, x, y + s * 0.2, z, DARKWOOD, ry); bx(s * 1.04, s * 0.12, s * 1.04, x, y + s * 0.68, z, DARKWOOD, ry); }
    else if (a === 3) { bx(s, s, s, x, y, z, 0x8a5a30, ry); bx(s * 1.04, s * 0.1, s * 1.04, x, y + s * 0.45, z, 0x4a4650, ry); }
    else if (a === 4) { bx(s * 1.3, s, s, x, y, z, [0x2e6a9a, 0x4a7a4a, 0xb86a2a][Math.round(Math.abs(x * 7 + z * 3)) % 3], ry); bx(s * 1.34, s * 0.1, s * 1.04, x, y + s * 0.88, z, 0xd8d8d8, ry); }
    else { bx(s, s, s, x, y, z, 0xcfd6e0, ry); gl(s * 1.02, s * 0.12, s * 1.02, x, y + s * 0.42, z, CYAN); }
  };
  const crates = (x: number, z: number, n = 3, s = 0.2) => { crate(x, 0, z, s); if (n > 1) crate(x + s * 1.05, 0, z + 0.02, s * 0.9, 0.2); if (n > 2) crate(x + s * 0.5, s, z + 0.01, s * 0.85, -0.15); };
  const barrel = (x: number, z: number, h = 0.2) => {
    if (a <= 2) { cy(0.07, 0.07, h, 8, x, 0, z, WOOD); cy(0.076, 0.076, 0.025, 8, x, h * 0.25, z, DARK); cy(0.076, 0.076, 0.025, 8, x, h * 0.7, z, DARK); }
    else if (a === 3) { cy(0.07, 0.07, h, 8, x, 0, z, 0x9a3a2a); cy(0.074, 0.074, 0.02, 8, x, h * 0.5, z, DARK); }
    else if (a === 4) { cy(0.07, 0.07, h, 8, x, 0, z, 0x2e5a9a); cy(0.074, 0.074, 0.025, 8, x, h * 0.45, z, 0xe0b030); }
    else { cy(0.065, 0.065, h, 8, x, 0, z, 0xdfe6ee); shine.push(paint(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 8).translate(x, h * 0.6, z), CYAN)); }
  };
  const sack = (x: number, z: number, s = 1) => {
    if (a === 5) { bx(0.12 * s, 0.1 * s, 0.1 * s, x, 0, z, 0x8a98ac); gl(0.1 * s, 0.015, 0.08 * s, x, 0.1 * s, z, MAGENTA); return; }
    solid.push(paint(new THREE.SphereGeometry(0.075 * s, 6, 4).scale(1.3, 0.8, 1).translate(x, 0.05 * s, z), a === 4 ? 0x7a8a5a : 0xcdb88a, shade));
  };
  /** planches posées à plat (bois), dalles (béton), plaques (métal) */
  const planks = (x: number, z: number, ry = 0) => {
    const c = a <= 3 ? [0, WOOD, WOOD, 0x8a5a30][a] : a === 4 ? 0x9a9c9e : 0x8a98ac;
    for (let i = 0; i < 3; i++) bx(0.32, 0.018 + i * 0.012, 0.07, x + Math.sin(ry) * i * 0.075, 0, z + Math.cos(ry) * i * 0.075, c, ry + (i - 1) * 0.07);
  };
  /** outils appuyés au mur : manches et fers (lance/hache, pioche, pelle, cônes, drone) */
  const tools = (x: number, z: number, lean = 0.25) => {
    if (a <= 3) {
      for (let i = 0; i < 3; i++) {
        const ox = x + i * 0.07;
        solid.push(paint(new THREE.CylinderGeometry(0.012, 0.014, 0.55, 4).rotateZ(lean).translate(ox, 0.27, z), DARKWOOD));
        const head = a === 1 ? new THREE.ConeGeometry(0.03, 0.09, 4) : a === 2 ? new THREE.BoxGeometry(0.1, 0.03, 0.02) : new THREE.BoxGeometry(0.07, 0.07, 0.015);
        solid.push(paint(head.translate(ox - Math.sin(lean) * 0.28, 0.55, z), a === 1 ? 0xb0a090 : 0x9aa0a8));
      }
    } else if (a === 4) { cn(0.05, 0.13, 6, x, 0, z, 0xff7a20); bx(0.12, 0.012, 0.12, x, 0, z, 0xff7a20); cn(0.05, 0.13, 6, x + 0.16, 0, z + 0.05, 0xff7a20); }
    else { solid.push(paint(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.75, 1).translate(x, 0.1, z), 0xe8eef6, shade)); gl(0.05, 0.02, 0.02, x, 0.11, z - 0.065, CYAN); solid.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 4).translate(x, 0.03, z), DARK)); }
  };
  /** lampe à pied : torche, lanterne, réverbère, projecteur, mât à néon */
  const lamp = (x: number, z: number, h = 0.55) => {
    if (a === 1) { cy(0.012, 0.016, h, 4, x, 0, z, DARKWOOD); solid.push(paint(new THREE.CylinderGeometry(0.04, 0.02, 0.05, 5).translate(x, h + 0.02, z), DARK)); flm(0.035, 0.1, x, h + 0.04, z); }
    else if (a === 2) { cy(0.012, 0.014, h, 4, x, 0, z, DARK); bx(0.07, 0.09, 0.07, x, h, z, DARK); gl(0.05, 0.065, 0.05, x, h + 0.012, z, WARM); }
    else if (a === 3) { cy(0.012, 0.016, h + 0.1, 5, x, 0, z, 0x2a2a30); solid.push(paint(new THREE.SphereGeometry(0.05, 6, 5).translate(x, h + 0.14, z), 0x2a2a30)); shine.push(paint(new THREE.SphereGeometry(0.04, 6, 5).translate(x, h + 0.14, z), WARM)); }
    else if (a === 4) { cy(0.012, 0.016, h + 0.25, 5, x, 0, z, 0x6a6e74); bx(0.16, 0.05, 0.05, x, h + 0.25, z, 0x3a3e44); gl(0.14, 0.035, 0.02, x, h + 0.26, z - 0.03, 0xfff4d0); }
    else { cy(0.01, 0.014, h, 5, x, 0, z, 0xdfe6ee); gl(0.03, 0.2, 0.03, x, h, z, CYAN); }
  };
  /** guirlande de fanions entre deux points (Antiquité et Médiéval ; plus tard, des fanions de chantier) */
  const bunting = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, yy = y - Math.sin(t * Math.PI) * 0.07;
      solid.push(paint(new THREE.ConeGeometry(0.035, 0.09, 3).rotateX(Math.PI).translate(x, yy - 0.045, z), i % 2 ? GOLD : S.acc));
    }
    bar(x0, y, z0, x1, y, z1);
  };
  const bar = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = d.length();
    solid.push(paint(new THREE.BoxGeometry(0.008, 0.008, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize())).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), 0xd8d0b8));
  };
  /** mât et étendard : seul le drapeau flotte (la vue l'anime) ; au-delà de l'Antiquité, le mât est de fer, puis de métal */
  const pole = (x: number, z: number, h: number) => {
    const pc = a <= 2 ? DARKWOOD : a === 3 ? 0x2a2a30 : a === 4 ? 0xb8bcc4 : 0xdfe6ee;
    cy(0.026, 0.034, h, 5, x, 0, z, pc);
    solid.push(paint(new THREE.SphereGeometry(0.055, 6, 4).translate(x, h + 0.03, z), a === 5 ? 0x40f0ff : GOLD));
    flag = [x, h - 0.12, z];
  };
  const crenels = (w: number, d: number, x: number, y: number, z: number, c: number, n = 5) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      for (const s of [-1, 1]) { bx(w / n * 0.55, 0.1, 0.07, x + t * w, y, z + s * d / 2, c); bx(0.07, 0.1, d / n * 0.55, x + s * w / 2, y, z + t * d, c); }
    }
  };
  /** fenêtres qui luisent la nuit (rangée sur une face ; face nord si sens = -1) */
  const windows = (n: number, w: number, y: number, z: number, span: number, x = 0, c = WARM, h = 0.09) => {
    for (let i = 0; i < n; i++) gl(w, h, 0.02, x + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span), y, z, c);
  };
  /** cheminée (brique/pierre) qui fume */
  const chimney = (x: number, y: number, z: number, h = 0.5, w = 0.14, c = S.wall2) => { bx(w, h, w, x, y, z, c); bx(w * 1.3, 0.04, w * 1.3, x, y + h, z, DARK); smoke.push([x, y + h + 0.06, z]); };
  /** radar à antenne parabolique qui tourne */
  const dish = (x: number, y: number, z: number, s = 1) => {
    cy(0.012, 0.012, 0.2 * s, 4, x, y, z, 0x8a8e94);
    sp(x, z, paint(new THREE.SphereGeometry(0.1 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2.4).translate(0, y + 0.24 * s, 0), 0xdfe6ee));
    sp(x, z, paint(new THREE.CylinderGeometry(0.008, 0.008, 0.1 * s, 3).rotateX(Math.PI / 2).translate(0, y + 0.24 * s, -0.06 * s), 0xff4040));
  };
  /** hologramme : anneaux et losange qui tournent, luisants */
  const holo = (x: number, y: number, z: number, c = CYAN, s = 1) => {
    gl(0.16 * s, 0.015, 0.16 * s, x, y, z, 0x3a4a5a);
    sp(x, z, paint(new THREE.OctahedronGeometry(0.1 * s).scale(0.7, 1.2, 0.7).translate(0, y + 0.22 * s, 0), c));
    sp(x, z, paint(new THREE.TorusGeometry(0.15 * s, 0.008, 4, 14).rotateX(Math.PI / 2).translate(0, y + 0.22 * s, 0), MAGENTA));
  };
  /** dôme d'énergie translucide */
  const dome = (r: number, x: number, z: number, c = CYAN) => { field.push(paint(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0, z), c)); };
  const sandbags = (x: number, z: number, n: number, ry = 0) => {
    for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) {
      if (r === 1 && i === n - 1) continue;
      const o = (i - (n - 1) / 2 + r * 0.5) * 0.16;
      solid.push(paint(new THREE.SphereGeometry(0.075, 6, 4).scale(1.4, 0.7, 1).rotateY(ry).translate(x + Math.cos(ry) * o, 0.05 + r * 0.09, z - Math.sin(ry) * o), 0x8a8a5a, shade));
    }
  };
  /** pieux taillés plantés en travers (devant les bâtiments de bois) */
  const stakes = (x0: number, z0: number, x1: number, z1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      solid.push(paint(new THREE.ConeGeometry(0.03, 0.34, 4).rotateZ(i % 2 ? 0.2 : -0.2).translate(x0 + (x1 - x0) * t, 0.14, z0 + (z1 - z0) * t), 0xc89a6a, shade));
    }
  };

  switch (kind) {
    case 'camp': {
      shadow(1.35, 1.1, 0, 0.35);
      pad(1.25, 1.05, 0, 0.3);
      if (a === 1) {
        // trois tentes de toile autour d'un foyer, pieux devant, mât à étendard
        for (const [x, z, s, c] of [[-0.62, 0.3, 1, CLOTH], [0.62, 0.3, 1, CLOTH], [0, 0.75, 1.15, 0xd8c8a0]] as const) {
          solid.push(paint(new THREE.ConeGeometry(0.55 * s, 0.75 * s, 4).rotateY(Math.PI / 4).scale(1, 1, 1.35).translate(x, 0.375 * s, z), c, (y) => 0.8 + y * 0.3));
          bx(0.2 * s, 0.34 * s, 0.04, x, 0, z - 0.52 * s, DARKWOOD);
          bx(0.03, 0.12, 0.03, x, 0.74 * s, z, DARKWOOD);
        }
        for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; solid.push(paint(new THREE.DodecahedronGeometry(0.07, 0).translate(Math.sin(t) * 0.2, 0.05, -0.45 + Math.cos(t) * 0.2), DARK)); }
        flm(0.12, 0.3, 0, 0.04, -0.45); fire = 0.3;
        sparks.push([0, 0.35, -0.45]); smoke.push([0, 0.4, -0.45]);
        stakes(-1.05, -0.85, 1.05, -0.85, 8);
        bunting(-0.62, 0.3, 0.62, 0.3, 0.7);
        crates(-0.95, -0.4); planks(0.8, -0.35, 0.3); sack(-0.55, -0.7); barrel(0.52, -0.62); tools(-1.1, 0.7); lamp(0.4, -0.85, 0.5);
        pole(0.85, -0.55, 1.5);
      } else if (a === 2) {
        // pavillon central, ceinture de pierre créneléee, deux tentes, bannières et fanions
        pyr(1.3, 0.9, 1.3, 0, 0.35, 0.55, CLOTH); bx(1.1, 0.35, 1.1, 0, 0, 0.55, 0xd0c4a4);
        for (const s of [-1, 1]) { bx(0.04, 1.1, 0.04, s * 0.58, 0, -0.05, DARKWOOD); bunting(s * 0.58, -0.05, 0, 0.55, 1.0); }
        bx(0.42, 0.34, 0.04, 0, 0, -0.05, S.acc); gl(0.1, 0.1, 0.03, 0, 0.12, -0.075, GOLD);
        for (const x of [-0.9, 0.9]) { pyr(0.7, 0.65, 0.9, x, 0, 0.4, 0xd8c8a0); }
        // muret de pierre en arc devant, créneaux
        for (let i = 0; i < 9; i++) { const t = -0.9 + (i / 8) * 1.8; bx(0.2, 0.2, 0.12, t, 0, -0.95 - Math.abs(t) * 0.08, STONE); if (i % 2 === 0) bx(0.12, 0.09, 0.12, t, 0.2, -0.95 - Math.abs(t) * 0.08, S.wall2); }
        cy(0.16, 0.2, 0.1, 8, 0, 0, -0.45, STONE); flm(0.1, 0.28, 0, 0.1, -0.45); fire = 0.32; sparks.push([0, 0.4, -0.45]); smoke.push([0, 0.5, -0.45]);
        crates(-0.95, -0.5); barrel(0.9, -0.55); barrel(1.02, -0.4); sack(-0.6, -0.7); tools(0.95, 0.8, -0.25); lamp(-0.45, -0.7, 0.5); lamp(0.45, -0.7, 0.5);
        pole(0.95, -0.2, 1.65);
      } else if (a === 3) {
        // baraque de brique à cheminée, tentes sous tôle, chaudière à vapeur
        bx(1.2, 0.5, 0.9, 0, 0, 0.55, S.wall); bx(1.28, 0.08, 0.98, 0, 0.5, 0.55, S.wall2);
        for (let i = 0; i < 3; i++) bx(1.28, 0.22, 0.34, 0, 0.5 + 0.1 + i * 0.0, 0.3 + i * 0.28, S.roof, 0);
        solid.push(paint(new THREE.BoxGeometry(1.3, 0.05, 1.0).rotateX(-0.28).translate(0, 0.66, 0.55), 0x8a9098, shade));
        bx(0.36, 0.22, 0.04, 0, 0, 0.09, DARK); windows(3, 0.15, 0.25, 0.09, 0.8, 0, WARM, 0.1);
        chimney(0.42, 0.5, 0.65, 0.65, 0.16, S.wall); sparks.push([0.42, 0.9, 0.65]);
        cy(0.14, 0.14, 0.4, 8, -0.8, 0, -0.35, 0x7a3a2a); cy(0.04, 0.05, 0.2, 5, -0.8, 0.4, -0.35, DARK); smoke.push([-0.8, 0.66, -0.35]);
        for (const x of [-0.9, 0.9]) { pyr(0.55, 0.42, 0.7, x, 0, 0.1, 0x8a9098); }
        for (const x of [0.75, 0.9]) cy(0.025, 0.025, 0.4, 4, x, 0, -0.4, 0x2a2a30);
        flm(0.09, 0.22, 0, 0.14, -0.55, EMBER); fire = 0.3; cy(0.16, 0.2, 0.14, 8, 0, 0, -0.55, 0x4a3a34);
        lamp(-0.4, -0.75, 0.6); lamp(0.5, -0.75, 0.6); crates(0.75, -0.7, 3, 0.2); barrel(-0.45, -0.5); barrel(-0.58, -0.4); planks(0.2, -0.85, 0.2); tools(-1.15, 0.5);
        bunting(-0.4, -0.75, 0.5, -0.75, 0.6);
        pole(1.0, -0.3, 1.5);
      } else if (a === 4) {
        // poste de commandement en béton : bunker bas, antenne, radar, projecteurs, sacs de sable
        bx(1.3, 0.45, 0.9, 0, 0, 0.5, S.wall); bx(1.4, 0.07, 1.0, 0, 0.45, 0.5, S.wall2);
        for (const s of [-1, 1]) bx(0.5, 0.2, 0.5, s * 0.5, 0.52, 0.55, 0x6a7350);
        windows(4, 0.18, 0.2, 0.04, 1.0, 0, 0xffe8a0, 0.08); bx(0.3, 0.3, 0.04, 0, 0, 0.04, DARK);
        for (let i = 0; i < 4; i++) bx(0.02, 0.5 + i * 0.0, 0.02, 0.5, 0.52, 0.2, 0x8a8e94);
        cy(0.012, 0.012, 1.2, 4, 0.55, 0.5, 0.75, 0x8a8e94); gl(0.04, 0.04, 0.04, 0.55, 1.7, 0.75, 0xff3030);
        for (let i = 1; i < 4; i++) bx(0.22 - i * 0.03, 0.012, 0.012, 0.55, 0.5 + i * 0.3, 0.75, 0x8a8e94);
        dish(-0.5, 0.52, 0.6, 1.1);
        sandbags(0, -0.55, 6); sandbags(-0.95, 0, 3, Math.PI / 2); sandbags(0.95, 0, 3, Math.PI / 2);
        for (const x of [-0.8, 0.8]) pyr(0.62, 0.5, 0.75, x, 0, -0.1, 0x6a7350);
        bx(0.3, 0.16, 0.2, -0.3, 0, -0.75, 0x6a7a4a); smoke.push([-0.3, 0.2, -0.75]);
        lamp(-0.5, -0.9, 0.7); lamp(0.55, -0.9, 0.7); crates(0.75, -0.8, 2, 0.2); barrel(-0.95, -0.5); tools(0.2, -0.85);
        pole(1.05, -0.4, 1.55);
      } else {
        // moyeu futuriste : dôme de métal lisse cerclé de néon, hologramme, bouclier d'énergie
        cy(0.85, 0.95, 0.2, 10, 0, 0, 0.5, 0xcfd6e0);
        solid.push(paint(new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.2, 0.5), 0xe6ecf4, shade));
        shine.push(paint(new THREE.TorusGeometry(0.88, 0.02, 4, 24).rotateX(Math.PI / 2).translate(0, 0.14, 0.5), CYAN));
        shine.push(paint(new THREE.TorusGeometry(0.4, 0.015, 4, 20).rotateX(Math.PI / 2).translate(0, 0.52, 0.5), MAGENTA));
        bx(0.28, 0.26, 0.05, 0, 0.1, -0.08, 0x2a3446); gl(0.2, 0.2, 0.02, 0, 0.13, -0.11, CYAN);
        for (const s of [-1, 1]) { cn(0.06, 0.36, 5, s * 0.8, 0.2, -0.2, 0xdfe6ee); gl(0.03, 0.03, 0.03, s * 0.8, 0.58, -0.2, CYAN); }
        holo(0, 0.7, 0.5, CYAN, 1.3); dish(0.5, 0.5, 0.75, 0.9);
        for (const x of [-1.1, 1.1]) { cy(0.2, 0.22, 0.1, 8, x, 0, 0.3, 0xcfd6e0); gl(0.3, 0.012, 0.3, x, 0.1, 0.3, CYAN); }
        dome(1.4, 0, 0.35);
        crates(-0.95, -0.7, 3, 0.18); barrel(0.9, -0.7); tools(0.3, -0.9); lamp(-0.5, -0.95, 0.5); lamp(0.55, -0.95, 0.5);
        pole(1.05, -0.5, 1.6);
      }
      break;
    }
    case 'post': {
      shadow(1.0, 0.85, 0, 0.2);
      pad(0.95, 0.8, 0, 0.1);
      if (a === 1) {
        // long baraquement de rondins au toit de chaume, râtelier de lances, mannequin d'entraînement, pieux
        bx(1.5, 0.55, 1, 0, 0, 0.1, S.wall);
        for (let i = 0; i < 6; i++) bx(1.52, 0.012, 1.02, 0, 0.07 + i * 0.09, 0.1, DARKWOOD);
        solid.push(paint(new THREE.CylinderGeometry(0.01, 0.7, 0.5, 4, 1).rotateY(Math.PI / 4).scale(1.6, 1, 1.1).translate(0, 0.8, 0.1), 0xc9a860, shade));
        bx(0.3, 0.42, 0.04, 0, 0, -0.41, DARKWOOD); bx(0.6, 0.06, 0.06, -0.4, 0.42, -0.62, DARKWOOD);
        for (let i = 0; i < 4; i++) { cy(0.015, 0.015, 0.75, 4, -0.62 + i * 0.15, 0, -0.62, 0xb0a090); cn(0.03, 0.1, 4, -0.62 + i * 0.15, 0.75, -0.62, 0xd0d4dc); }
        cy(0.03, 0.03, 0.5, 5, 0.55, 0, -0.7, DARKWOOD); bx(0.28, 0.05, 0.05, 0.55, 0.32, -0.7, DARKWOOD); solid.push(paint(new THREE.SphereGeometry(0.075, 6, 5).translate(0.55, 0.58, -0.7), CLOTH));
        gl(0.12, 0.1, 0.02, -0.4, 0.3, -0.41, WARM); gl(0.12, 0.1, 0.02, 0.4, 0.3, -0.41, WARM);
        stakes(-0.85, -0.9, 0.85, -0.9, 7); sack(0.3, -0.58); barrel(0.82, -0.45); planks(-0.6, 0.85, 0.1); lamp(0.1, -0.75, 0.5);
        smoke.push([0.5, 0.88, 0.3]);
        pole(0.72, -0.5, 1.4);
      } else if (a === 2) {
        // caserne de pierre crénelée, meurtrières, bannière, râtelier d'armes et pavois
        bx(1.5, 0.7, 1, 0, 0, 0.1, STONE); crenels(1.5, 1, 0, 0.7, 0.1, S.wall2, 6);
        bx(1.1, 0.35, 0.7, 0, 0.7, 0.1, S.wall2); pyr(1.3, 0.3, 0.9, 0, 1.05, 0.1, S.roof);
        bx(0.32, 0.46, 0.05, 0, 0, -0.4, DARKWOOD); gl(0.06, 0.18, 0.02, -0.5, 0.35, -0.4, WARM); gl(0.06, 0.18, 0.02, 0.5, 0.35, -0.4, WARM);
        bx(0.4, 0.5, 0.03, 0.0, 0.4, -0.43, S.acc); gl(0.08, 0.08, 0.02, 0, 0.58, -0.445, GOLD);
        bx(0.6, 0.06, 0.06, -0.45, 0.42, -0.62, DARKWOOD);
        for (let i = 0; i < 4; i++) { cy(0.015, 0.015, 0.75, 4, -0.62 + i * 0.15, 0, -0.62, 0xb0a090); cn(0.03, 0.1, 4, -0.62 + i * 0.15, 0.75, -0.62, 0xd0d4dc); }
        for (const x of [0.5, 0.72]) solid.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 3).rotateX(Math.PI / 2).translate(x, 0.2, -0.68), S.acc), paint(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 3).rotateX(Math.PI / 2).scale(0.6, 0.6, 1).translate(x, 0.2, -0.675), GOLD));
        bunting(-0.7, -0.6, 0.7, -0.6, 0.5); crates(0.78, -0.5); barrel(-0.82, -0.45); sack(0.2, -0.65); lamp(0.1, -0.78, 0.5); tools(-0.9, 0.6);
        smoke.push([0.45, 1.2, 0.2]);
        pole(0.72, -0.55, 1.65);
      } else if (a === 3) {
        // caserne de brique, toit de tôle ondulée, deux cheminées qui fument, rangée de fenêtres
        bx(1.5, 0.65, 1, 0, 0, 0.1, S.wall); bx(1.56, 0.06, 1.06, 0, 0.65, 0.1, S.wall2);
        solid.push(paint(new THREE.BoxGeometry(1.6, 0.045, 0.62).rotateX(0.5).translate(0, 0.87, -0.18), S.roof, shade));
        solid.push(paint(new THREE.BoxGeometry(1.6, 0.045, 0.62).rotateX(-0.5).translate(0, 0.87, 0.38), 0x8a9098, shade));
        for (const x of [-0.35, 0.5]) chimney(x, 0.9, 0.2, 0.4, 0.15);
        bx(0.32, 0.42, 0.05, 0, 0, -0.4, DARK); windows(4, 0.18, 0.28, -0.405, 1.1, 0, WARM, 0.14);
        bx(0.4, 0.07, 0.03, 0, 0.5, -0.43, 0xe8e0c8); gl(0.34, 0.04, 0.02, 0, 0.515, -0.445, WARM);
        for (let i = 0; i < 4; i++) { cy(0.015, 0.015, 0.7, 4, -0.62 + i * 0.15, 0, -0.62, 0x4a4a54); cn(0.03, 0.1, 4, -0.62 + i * 0.15, 0.7, -0.62, 0xc0c4cc); }
        lamp(0.8, -0.65, 0.6); lamp(-0.85, -0.65, 0.6); crates(0.62, -0.55, 3, 0.2); barrel(-0.85, -0.3); barrel(-0.85, -0.12); planks(-0.4, -0.85, 0.1); tools(0.82, 0.62);
        pole(0.72, -0.62, 1.4);
      } else if (a === 4) {
        // bloc de béton à toit plat : fenêtres lumineuses, antenne, projecteurs, sacs de sable, tente kaki
        bx(1.5, 0.7, 1, 0, 0, 0.1, S.wall); bx(1.56, 0.06, 1.06, 0, 0.7, 0.1, 0x6c6e72);
        bx(0.24, 0.3, 0.3, -0.5, 0.76, 0.2, 0x7a7e84); bx(0.3, 0.12, 0.26, 0.3, 0.76, 0.35, 0x6a7a4a);
        windows(5, 0.17, 0.4, -0.405, 1.2, 0, 0xffe8a0, 0.14); windows(5, 0.17, 0.15, -0.405, 1.2, 0, 0xffe8a0, 0.1);
        bx(0.3, 0.38, 0.05, 0, 0, -0.4, DARK); bx(1.5, 0.05, 0.02, 0, 0.62, -0.41, 0xe0b030);
        cy(0.012, 0.012, 1.0, 4, 0.6, 0.76, -0.25, 0x8a8e94); gl(0.04, 0.04, 0.04, 0.6, 1.76, -0.25, 0xff3030);
        for (let i = 0; i < 3; i++) bx(0.2 - i * 0.04, 0.012, 0.012, 0.6, 0.95 + i * 0.28, -0.25, 0x8a8e94);
        for (const x of [-0.6, 0.6]) { cy(0.01, 0.012, 0.3, 4, x, 0.76, -0.4, 0x3a3e44); gl(0.14, 0.05, 0.03, x, 1.06, -0.43, 0xfff4d0); }
        sandbags(-0.1, -0.7, 7); sandbags(0.9, -0.3, 3, Math.PI / 2);
        pyr(0.7, 0.45, 0.8, -1.0, 0, 0.1, 0x6a7350);
        lamp(0.9, -0.7, 0.6); crates(0.62, -0.8, 2, 0.2); barrel(-0.9, -0.55); tools(0.2, -0.95);
        pole(0.9, -0.68, 1.5);
      } else {
        // bloc de métal lisse : verrière, liserés de néon, antenne, hologramme de soldat, boucliers de porte
        bx(1.5, 0.62, 1, 0, 0, 0.1, S.wall);
        solid.push(paint(new THREE.CylinderGeometry(0.55, 0.62, 0.22, 4, 1).rotateY(Math.PI / 4).scale(1.35, 1, 0.9).translate(0, 0.73, 0.1), 0xeef2f8, shade));
        gl(1.54, 0.025, 1.04, 0, 0.58, 0.1, CYAN); gl(1.54, 0.02, 1.04, 0, 0.18, 0.1, MAGENTA);
        windows(4, 0.2, 0.3, -0.405, 1.1, 0, 0x7af0ff, 0.12);
        bx(0.3, 0.4, 0.05, 0, 0, -0.4, 0x2a3446); gl(0.22, 0.34, 0.02, 0, 0.03, -0.43, 0x40a0ff);
        for (const s of [-1, 1]) { cn(0.05, 0.28, 5, s * 0.45, 0, -0.55, 0xdfe6ee); gl(0.03, 0.03, 0.03, s * 0.45, 0.28, -0.55, CYAN); }
        field.push(paint(new THREE.PlaneGeometry(0.62, 0.42).translate(0, 0.22, -0.55), CYAN));
        dish(0.6, 0.84, 0.3, 0.9); holo(-0.45, 0.84, 0.2, 0x40a0ff, 0.9);
        smoke.push([0.2, 0.95, 0.4]);
        crates(0.75, -0.65, 2, 0.18); barrel(-0.85, -0.55); tools(0.2, -0.88); lamp(-0.75, -0.8, 0.5); lamp(0.7, -0.9, 0.5);
        pole(0.88, -0.6, 1.5);
      }
      break;
    }
    case 'smithy': {
      shadow(0.95, 0.85, 0, 0.1);
      pad(0.9, 0.8, 0, 0.1);
      if (a === 1) {
        // hutte de pierre et de bois, cheminée de pierres sèches, enclume, foyer ouvert, soufflet
        bx(1.1, 0.6, 0.9, 0, 0, 0.15, STONE); pyr(1.5, 0.45, 1.2, 0, 0.6, 0.15, S.wall2);
        bx(0.24, 0.8, 0.24, 0.35, 0.3, 0.35, DARK); bx(0.3, 0.05, 0.3, 0.35, 1.1, 0.35, STONE); smoke.push([0.35, 1.2, 0.35]); sparks.push([0.35, 1.18, 0.35]);
        bx(0.3, 0.1, 0.14, -0.3, 0.16, -0.55, 0x4a4a54); bx(0.12, 0.16, 0.1, -0.3, 0, -0.55, 0x34343c); cn(0.03, 0.08, 4, -0.43, 0.26, -0.55, 0x4a4a54);
        gl(0.4, 0.3, 0.05, 0.12, 0, -0.31, EMBER); flm(0.1, 0.24, 0.12, 0.3, -0.38); fire = 0.38;
        for (const [x, z] of [[0.45, -0.5], [0.62, -0.38]] as const) { solid.push(paint(new THREE.SphereGeometry(0.06, 5, 4).translate(x, 0.05, z), 0x5a4a44)); }
        bx(0.24, 0.12, 0.08, 0.7, 0.1, 0.0, DARKWOOD); tools(-0.7, -0.35); barrel(-0.45, -0.75); sack(0.7, -0.62); planks(0.0, 0.9, 0.0); lamp(-0.7, -0.7, 0.45);
        stakes(-0.55, -0.9, 0.0, -0.9, 3);
      } else if (a === 2) {
        // forge de pierre : grande cheminée crénelée, bac de trempe, meule, bannière
        bx(1.2, 0.65, 0.9, 0, 0, 0.15, STONE); crenels(1.2, 0.9, 0, 0.65, 0.15, S.wall2, 5); pyr(1.0, 0.3, 0.7, 0, 0.75, 0.15, S.roof);
        bx(0.26, 1.0, 0.26, 0.4, 0.4, 0.3, S.wall2); bx(0.34, 0.08, 0.34, 0.4, 1.4, 0.3, DARK); smoke.push([0.4, 1.5, 0.3]); sparks.push([0.4, 1.46, 0.3]);
        shine.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6).translate(0.4, 1.42, 0.3), EMBER));
        bx(0.34, 0.1, 0.16, -0.3, 0.16, -0.58, 0x4a4a54); bx(0.14, 0.16, 0.1, -0.3, 0, -0.58, 0x34343c);
        gl(0.46, 0.34, 0.05, 0.1, 0, -0.31, EMBER); flm(0.11, 0.28, 0.1, 0.34, -0.38); fire = 0.4;
        cy(0.18, 0.15, 0.2, 7, 0.55, 0, -0.62, DARKWOOD); cy(0.15, 0.15, 0.02, 7, 0.55, 0.19, -0.62, 0x3a5a8a);
        cy(0.13, 0.13, 0.04, 8, -0.72, 0.12, -0.2, 0x8a8a90); bx(0.04, 0.12, 0.04, -0.72, 0, -0.2, DARKWOOD);
        bx(0.3, 0.4, 0.03, -0.55, 0.45, -0.32, S.acc);
        bunting(-0.6, -0.8, 0.6, -0.8, 0.45); tools(-0.82, 0.1); barrel(-0.5, -0.78); crates(0.62, -0.1, 2, 0.17); lamp(0.15, -0.8, 0.5);
      } else if (a === 3) {
        // fonderie de brique : haute cheminée d'usine qui fume, four rougeoyant, wagonnet de minerai, tuyaux
        bx(1.2, 0.6, 0.95, 0, 0, 0.15, S.wall); bx(1.28, 0.07, 1.03, 0, 0.6, 0.15, S.wall2);
        for (let i = 0; i < 3; i++) solid.push(paint(new THREE.BoxGeometry(1.3, 0.04, 0.34).rotateX(0.55).translate(0, 0.78, -0.12 + i * 0.0 + i * 0.3), i % 2 ? 0x8a9098 : S.roof, shade));
        cy(0.09, 0.13, 1.35, 8, 0.38, 0.3, 0.4, S.wall); cy(0.12, 0.09, 0.07, 8, 0.38, 1.6, 0.4, DARK); smoke.push([0.38, 1.7, 0.4]); sparks.push([0.38, 1.66, 0.4]);
        cy(0.045, 0.045, 0.5, 5, -0.4, 0.6, 0.5, 0x4a4650); cy(0.06, 0.06, 0.04, 5, -0.4, 1.08, 0.5, DARK); smoke.push([-0.4, 1.18, 0.5]);
        gl(0.5, 0.36, 0.05, 0.05, 0, -0.33, EMBER); flm(0.12, 0.3, 0.05, 0.36, -0.37, EMBER); fire = 0.4;
        bx(0.5, 0.05, 0.06, 0.05, 0.4, -0.35, DARK);
        bx(0.36, 0.14, 0.2, 0.7, 0.07, -0.55, 0x4a4650); for (const s of [-1, 1]) cy(0.05, 0.05, 0.03, 8, 0.7 + s * 0.12, 0.0, -0.45, DARK, Math.PI / 2);
        for (let i = 0; i < 4; i++) solid.push(paint(new THREE.DodecahedronGeometry(0.05, 0).translate(0.62 + i * 0.05, 0.2, -0.55 - (i % 2) * 0.02), 0x5a4a50));
        bx(1.0, 0.025, 0.025, -0.6, 0.18, -0.7, 0x5a5a64);
        bx(0.2, 0.1, 0.14, -0.7, 0.15, -0.1, 0x34343c); bx(0.12, 0.2, 0.1, -0.7, 0, -0.1, 0x34343c);
        lamp(-0.7, -0.78, 0.55); lamp(0.55, -0.85, 0.55); barrel(-0.4, -0.78); barrel(-0.26, -0.8); crates(0.85, 0.2, 2, 0.17); tools(-0.9, 0.3); planks(0.0, 0.95, 0.0);
      } else if (a === 4) {
        // aciérie : halle de béton, silos, tuyauteries, torchère, grue-portique, fenêtres de four lumineuses
        bx(1.2, 0.6, 0.95, 0, 0, 0.15, S.wall); bx(1.28, 0.08, 1.03, 0, 0.6, 0.15, 0x6c6e72);
        for (let i = 0; i < 4; i++) bx(0.03, 0.62, 0.03, -0.5 + i * 0.33, 0, -0.34, 0xe0b030);
        gl(0.5, 0.3, 0.04, 0.0, 0.12, -0.325, EMBER); flm(0.1, 0.26, 0.0, 0.42, -0.38, EMBER); fire = 0.42; windows(3, 0.16, 0.45, -0.325, 0.9, 0, WARM, 0.1);
        cy(0.16, 0.16, 0.85, 8, 0.45, 0.68, 0.45, 0xc8ccd0); cn(0.17, 0.12, 8, 0.45, 1.53, 0.45, 0x8a8e94);
        cy(0.1, 0.1, 0.7, 8, 0.0, 0.68, 0.6, 0xb8bcc4); cy(0.04, 0.04, 0.5, 5, -0.4, 0.68, 0.5, 0x4a4650); smoke.push([-0.4, 1.28, 0.5]); smoke.push([0.0, 1.45, 0.6]);
        cy(0.015, 0.02, 1.1, 5, -0.75, 0, -0.1, 0x8a8e94); flm(0.05, 0.14, -0.75, 1.1, -0.1); sparks.push([-0.75, 1.3, -0.1]);
        bx(0.9, 0.04, 0.04, -0.2, 0.5, -0.55, 0xe0b030); for (const x of [-0.6, 0.2]) bx(0.04, 0.5, 0.04, x, 0, -0.55, 0xe0b030);
        cy(0.012, 0.012, 0.2, 4, -0.2, 0.3, -0.55, 0x2a2a30); bx(0.1, 0.05, 0.06, -0.2, 0.26, -0.55, 0xe0b030);
        lamp(0.7, -0.78, 0.6); crates(0.8, -0.2, 3, 0.2); barrel(-0.8, -0.7); barrel(-0.8, -0.52); tools(0.4, -0.95);
      } else {
        // forge à plasma : coque lisse, creuset d'énergie qui rayonne, bras mécaniques, hologramme d'enclume
        cy(0.6, 0.72, 0.4, 8, 0, 0, 0.15, S.wall);
        solid.push(paint(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.4, 0.15), 0xeef2f8, shade));
        shine.push(paint(new THREE.TorusGeometry(0.66, 0.02, 4, 22).rotateX(Math.PI / 2).translate(0, 0.28, 0.15), 0xff8a30));
        shine.push(paint(new THREE.TorusGeometry(0.4, 0.015, 4, 18).rotateX(Math.PI / 2).translate(0, 0.48, 0.15), CYAN));
        gl(0.4, 0.24, 0.05, 0, 0.08, -0.5, 0xff8a30); flm(0.1, 0.26, 0, 0.32, -0.55, 0xff8a30); fire = 0.4;
        shine.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8).translate(0, 0.92, 0.15), 0xff8a30));
        cy(0.07, 0.09, 0.5, 6, 0.4, 0.4, 0.4, 0xdfe6ee); gl(0.13, 0.025, 0.13, 0.4, 0.9, 0.4, CYAN); smoke.push([0.4, 0.95, 0.4]); sparks.push([0.4, 0.95, 0.4]);
        for (const s of [-1, 1]) { bx(0.04, 0.4, 0.04, s * 0.62, 0, -0.35, 0xdfe6ee); solid.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 4).rotateZ(s * 1.0).translate(s * 0.5, 0.44, -0.35), 0xdfe6ee)); gl(0.045, 0.045, 0.045, s * 0.36, 0.56, -0.35, 0xff8a30); }
        holo(-0.6, 0.0, -0.75, 0xff8a30, 1);
        dome(0.95, 0, 0.15, 0xff9a50);
        crates(0.7, -0.75, 2, 0.17); barrel(0.72, 0.2); tools(0.3, -0.92); lamp(-0.3, -0.9, 0.5);
      }
      break;
    }
    case 'infirmary': {
      shadow(1.0, 0.95, 0, 0.1);
      pad(0.95, 0.9, 0, 0.1);
      const stretcher = (x: number, z: number) => {
        if (a >= 4) { bx(0.22, 0.05, 0.55, x, 0.14, z, a === 5 ? 0xdfe6ee : 0xe8e8e8); for (const s of [-1, 1]) cy(0.012, 0.012, 0.14, 4, x + s * 0.09, 0, z + 0.2, 0x8a8e94); if (a === 5) gl(0.2, 0.012, 0.5, x, 0.19, z, 0x70ff90); }
        else { bx(0.22, 0.06, 0.55, x, 0.07, z, CLOTH); bx(0.26, 0.04, 0.6, x, 0.03, z, DARKWOOD); }
      };
      if (a === 1) {
        // grande tente blanche, bannière de soin, brancards, herbes qui sèchent
        cy(0.02, 0.85, 0.85, 6, 0, 0.0, 0.1, 0xf4f0e6); cy(0.85, 0.85, 0.25, 6, 0, 0, 0.1, 0xf4f0e6);
        bx(0.34, 0.36, 0.04, 0, 0, -0.68, 0x5a8ad8); gl(0.14, 0.14, 0.02, 0, 0.12, -0.705, 0x9aff8a);
        stretcher(-0.75, -0.35); stretcher(0.75, -0.35);
        for (let i = 0; i < 3; i++) { bx(0.02, 0.4, 0.02, -0.4 + i * 0.4, 0, -0.9, DARKWOOD); }
        bunting(-0.4, -0.9, 0.4, -0.9, 0.38); barrel(0.52, -0.82); sack(-0.6, -0.8); planks(0.9, 0.5, 0.3); lamp(0.15, -0.8, 0.45);
        smoke.push([0.8, 0.3, 0.45]); cy(0.1, 0.12, 0.08, 6, 0.8, 0, 0.45, DARK); flm(0.05, 0.14, 0.8, 0.08, 0.45); fire = 0.2; cy(0.07, 0.07, 0.05, 6, 0.8, 0.22, 0.45, 0x4a4a54);
        pole(-0.6, 0.7, 1.3);
      } else if (a === 2) {
        // chapelle-hôpital de pierre au toit de tuiles bleues, croix de soin dorée, bannière blanche
        bx(1.2, 0.55, 0.95, 0, 0, 0.1, 0xcfc8b8); pyr(1.4, 0.55, 1.15, 0, 0.55, 0.1, S.roof);
        crenels(1.2, 0.95, 0, 0.55, 0.1, 0xb8b0a0, 5);
        bx(0.3, 0.42, 0.05, 0, 0, -0.4, DARKWOOD); gl(0.06, 0.2, 0.02, -0.4, 0.2, -0.375, 0x9aff8a); gl(0.06, 0.2, 0.02, 0.4, 0.2, -0.375, 0x9aff8a);
        gl(0.06, 0.2, 0.02, 0, 0.55, -0.42, 0x9aff8a); gl(0.2, 0.06, 0.02, 0, 0.62, -0.42, 0x9aff8a);
        for (const s of [-1, 1]) { bx(0.34, 0.44, 0.03, s * 0.6, 0.05, -0.5, WHITE); bx(0.06, 0.2, 0.012, s * 0.6, 0.18, -0.52, RED); bx(0.2, 0.06, 0.012, s * 0.6, 0.25, -0.52, RED); }
        stretcher(-0.85, -0.7); stretcher(0.85, -0.7);
        bunting(-0.5, -0.9, 0.5, -0.9, 0.5); barrel(0.45, -0.9); sack(-0.4, -0.88); lamp(0.1, -0.88, 0.5); lamp(-0.2, -0.88, 0.5);
        for (let i = 0; i < 3; i++) { solid.push(paint(new THREE.SphereGeometry(0.06, 5, 4).translate(0.78 + i * 0.05, 0.06 + i * 0.05, 0.4), 0x4a8a3a)); }
        pole(-0.62, 0.7, 1.5);
      } else if (a === 3) {
        // dispensaire de brique : cheminée à vapeur (stérilisation), enseigne à croix, fenêtres, ambulance à cheval
        bx(1.25, 0.6, 0.95, 0, 0, 0.1, S.wall); bx(1.32, 0.06, 1.02, 0, 0.6, 0.1, WHITE);
        solid.push(paint(new THREE.BoxGeometry(1.35, 0.045, 0.65).rotateX(0.5).translate(0, 0.82, -0.2), S.roof, shade));
        solid.push(paint(new THREE.BoxGeometry(1.35, 0.045, 0.65).rotateX(-0.5).translate(0, 0.82, 0.4), 0x8a9098, shade));
        chimney(0.42, 0.65, 0.3, 0.38, 0.13, S.wall);
        windows(3, 0.18, 0.3, -0.375, 0.9, 0, 0xfff4d8, 0.14); bx(0.28, 0.4, 0.05, 0, 0, -0.38, WHITE);
        bx(0.28, 0.28, 0.04, 0, 0.62, -0.4, WHITE); gl(0.07, 0.2, 0.02, 0, 0.66, -0.425, RED); gl(0.2, 0.07, 0.02, 0, 0.725, -0.425, RED);
        stretcher(-0.85, -0.65); stretcher(0.85, -0.65);
        bx(0.4, 0.18, 0.22, 0.75, 0.06, 0.65, WHITE); for (const s of [-1, 1]) cy(0.05, 0.05, 0.03, 8, 0.75 + s * 0.13, 0.0, 0.76, DARK, Math.PI / 2);
        lamp(-0.55, -0.85, 0.55); lamp(0.55, -0.85, 0.55); barrel(0.2, -0.85); crates(-0.2, -0.88, 2, 0.14); planks(0.0, 0.95);
        pole(-0.62, 0.72, 1.4);
      } else if (a === 4) {
        // poste médical de béton : croix lumineuse, héliport à H, antenne, tente blanche annexe
        bx(1.25, 0.55, 0.95, 0, 0, 0.1, S.wall); bx(1.32, 0.06, 1.02, 0, 0.55, 0.1, 0xe8e8e8);
        windows(4, 0.18, 0.28, -0.375, 1.0, 0, 0xfff4d8, 0.14); bx(0.3, 0.38, 0.05, 0, 0, -0.38, WHITE);
        gl(0.07, 0.26, 0.02, 0.0, 0.2, -0.402, 0x80ff90); gl(0.26, 0.07, 0.02, 0.0, 0.29, -0.402, 0x80ff90);
        cy(0.3, 0.3, 0.025, 12, 0.3, 0.61, 0.2, 0x5a5e66); gl(0.04, 0.012, 0.3, 0.2, 0.635, 0.2, 0xfff4d0); gl(0.04, 0.012, 0.3, 0.4, 0.635, 0.2, 0xfff4d0); gl(0.2, 0.012, 0.04, 0.3, 0.635, 0.2, 0xfff4d0);
        cy(0.012, 0.012, 0.7, 4, -0.5, 0.61, 0.4, 0x8a8e94); gl(0.04, 0.04, 0.04, -0.5, 1.3, 0.4, 0xff3030);
        stretcher(-0.9, -0.65);
        pyr(0.7, 0.45, 0.8, 0.95, 0, -0.3, WHITE); bx(0.01, 0.16, 0.01, 0.95, 0.14, -0.7, RED);
        bx(0.5, 0.2, 0.26, -0.45, 0, -0.85, WHITE); gl(0.1, 0.07, 0.02, -0.25, 0.1, -0.985, 0xff4040);
        lamp(0.5, -0.85, 0.6); crates(0.05, -0.85, 2, 0.15); barrel(0.7, -0.85); tools(-0.1, -0.5);
        pole(-0.62, 0.72, 1.45);
      } else {
        // capsule de soins : coque blanche lisse, croix verte lumineuse, anneau tournant, bouclier de soin
        cy(0.62, 0.7, 0.2, 8, 0, 0, 0.1, 0xdfe6ee);
        solid.push(paint(new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.9, 1).translate(0, 0.2, 0.1), 0xf4f8fc, shade));
        gl(0.07, 0.34, 0.03, 0, 0.18, -0.56, 0x70ff90); gl(0.3, 0.07, 0.03, 0, 0.31, -0.56, 0x70ff90);
        shine.push(paint(new THREE.TorusGeometry(0.7, 0.018, 4, 22).rotateX(Math.PI / 2).translate(0, 0.14, 0.1), 0x70ff90));
        sp(0, 0.1, paint(new THREE.TorusGeometry(0.4, 0.02, 4, 18).rotateX(Math.PI / 2.4).translate(0, 0.85, 0), 0x70ff90));
        sp(0, 0.1, paint(new THREE.OctahedronGeometry(0.08).translate(0, 0.85, 0), 0xffffff));
        windows(3, 0.14, 0.3, -0.5, 0.7, 0, 0x90ffb0, 0.1);
        stretcher(-0.9, -0.5); stretcher(0.9, -0.5);
        dome(1.15, 0, 0.1, 0x70ff90);
        lamp(-0.5, -0.9, 0.5); lamp(0.5, -0.9, 0.5); crates(0.5, 0.75, 2, 0.15); barrel(-0.62, 0.7); tools(0.15, -0.95);
        pole(-0.82, 0.55, 1.4);
      }
      break;
    }
    case 'tower': {
      shadow(0.55, 0.55, 0, 0);
      pad(0.5, 0.5, 0, 0);
      if (a === 1) {
        // quatre pieux, plateforme de bois palissadée, toit de peaux ; torche, pieux au pied
        for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) cy(0.05, 0.07, 1.6, 5, x, 0, z, DARKWOOD);
        bx(0.62, 0.05, 0.05, 0, 0.6, -0.3, WOOD, Math.PI / 4); bx(0.62, 0.05, 0.05, 0, 0.6, 0.3, WOOD, -Math.PI / 4);
        bx(0.85, 0.08, 0.85, 0, 1.58, 0, WOOD);
        for (const [w, d, x, z] of [[0.85, 0.06, 0, -0.42], [0.85, 0.06, 0, 0.42], [0.06, 0.85, -0.42, 0], [0.06, 0.85, 0.42, 0]] as const) bx(w, 0.28, d, x, 1.66, z, WOOD);
        pyr(1.0, 0.42, 1.0, 0, 2.0, 0, 0x7a5a38);
        for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) cy(0.025, 0.025, 0.38, 4, x, 1.66, z, DARKWOOD);
        for (let i = 0; i < 5; i++) bx(0.05, 0.03, 0.1, 0.0, 0.2 + i * 0.28, -0.32 - i * 0.0, DARKWOOD);
        stakes(-0.5, -0.5, 0.5, -0.5, 5);
        solid.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8).translate(0.32, 1.65, -0.45), DARK)); flm(0.07, 0.16, 0.32, 1.72, -0.45); fire = 1.85;
        sparks.push([0.32, 1.9, -0.45]); smoke.push([0.32, 1.95, -0.45]);
        crates(0.52, 0.2, 1, 0.16); barrel(-0.55, 0.3);
        flag = [0, 2.5, 0]; cy(0.02, 0.02, 0.4, 4, 0, 2.1, 0, DARKWOOD);
      } else if (a === 2) {
        // tour de pierre ronde crénelée, toit conique d'ardoise, bannière, meurtrières, torches
        cy(0.34, 0.42, 1.55, 8, 0, 0, 0, STONE);
        cy(0.46, 0.42, 0.14, 8, 0, 1.4, 0, S.wall2);
        for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; bx(0.13, 0.13, 0.1, Math.sin(t) * 0.44, 1.54, Math.cos(t) * 0.44, S.wall2, t); }
        cn(0.4, 0.55, 8, 0, 1.55, 0, S.roof);
        for (let i = 0; i < 3; i++) gl(0.05, 0.2, 0.02, Math.sin(i * 2.1) * 0.36, 0.55 + i * 0.3, -Math.cos(i * 2.1) * 0.36 - 0.0, 0x1a1218);
        gl(0.08, 0.16, 0.02, 0, 1.15, -0.4, WARM);
        bx(0.2, 0.3, 0.04, 0, 0, -0.41, DARKWOOD);
        sack(0.45, -0.3); crates(-0.6, -0.3, 1, 0.15); barrel(0.55, 0.2); lamp(-0.45, -0.55, 0.4); lamp(0.4, -0.55, 0.4);
        bunting(-0.45, -0.55, 0.4, -0.55, 0.38);
        flag = [0, 2.38, 0]; cy(0.02, 0.02, 0.4, 4, 0, 2.1, 0, DARKWOOD); solid.push(paint(new THREE.SphereGeometry(0.04, 5, 4).translate(0, 2.52, 0), GOLD));
      } else if (a === 3) {
        // tour de brique à toit de tôle, lanterne à gaz, projecteur, tuyau de poêle qui fume
        bx(0.7, 1.45, 0.7, 0, 0, 0, S.wall); bx(0.82, 0.1, 0.82, 0, 1.45, 0, S.wall2);
        for (let i = 0; i < 4; i++) bx(0.84, 0.02, 0.84, 0, 0.2 + i * 0.3, 0, S.wall2);
        bx(0.7, 0.25, 0.7, 0, 1.55, 0, DARKWOOD); gl(0.46, 0.14, 0.02, 0, 1.6, -0.36, WARM);
        pyr(1.0, 0.4, 1.0, 0, 1.8, 0, S.roof); cn(0.06, 0.16, 5, 0.25, 2.0, 0.2, 0x34343c);
        cy(0.035, 0.035, 0.4, 5, -0.25, 1.8, 0.25, DARK); smoke.push([-0.25, 2.22, 0.25]);
        gl(0.12, 0.2, 0.02, 0, 0.7, -0.36, WARM); bx(0.2, 0.3, 0.04, 0, 0, -0.36, DARK);
        cy(0.02, 0.025, 0.2, 4, 0.36, 1.6, -0.34, 0x2a2a30); gl(0.08, 0.08, 0.06, 0.36, 1.78, -0.38, 0xfff0b0);
        lamp(-0.5, -0.45, 0.5); barrel(0.5, -0.4); crates(-0.55, 0.2, 1, 0.16); planks(0.0, -0.62);
        flag = [0, 2.35, 0]; cy(0.02, 0.02, 0.4, 4, 0, 2.2, 0, 0x2a2a30);
      } else if (a === 4) {
        // tour de béton à cabine vitrée, projecteurs, antenne, sacs de sable à la base
        bx(0.52, 1.25, 0.52, 0, 0, 0, S.wall);
        for (let i = 0; i < 3; i++) bx(0.54, 0.02, 0.54, 0, 0.3 + i * 0.35, 0, 0xe0b030);
        bx(0.9, 0.08, 0.9, 0, 1.25, 0, 0x6c6e72);
        bx(0.78, 0.3, 0.78, 0, 1.33, 0, 0x3a4a5a); windows(3, 0.2, 1.4, -0.4, 0.5, 0, 0xffe8a0, 0.16); windows(3, 0.2, 1.4, 0.4, 0.5, 0, 0xffe8a0, 0.16);
        bx(0.9, 0.06, 0.9, 0, 1.63, 0, 0x6c6e72);
        for (const x of [-0.3, 0.3]) { cy(0.01, 0.012, 0.16, 4, x, 1.69, -0.3, 0x3a3e44); gl(0.14, 0.06, 0.03, x, 1.84, -0.34, 0xfff4d0); }
        cy(0.012, 0.012, 0.6, 4, 0.3, 1.69, 0.3, 0x8a8e94); gl(0.04, 0.04, 0.04, 0.3, 2.28, 0.3, 0xff3030);
        dish(-0.3, 1.69, 0.28, 0.7);
        sandbags(0, -0.5, 5); sandbags(0.5, 0, 2, Math.PI / 2);
        bx(0.2, 0.36, 0.04, 0, 0, -0.27, DARK); lamp(-0.55, -0.4, 0.5); crates(0.55, 0.3, 1, 0.16);
        flag = [-0.3, 2.0, 0.28]; cy(0.01, 0.01, 0.3, 4, -0.3, 1.69, -0.0, 0x8a8e94);
        flag = [0.0, 2.2, 0.0]; cy(0.015, 0.015, 0.4, 4, 0, 1.69, 0, 0x8a8e94);
      } else {
        // pylône lisse : fût effilé, anneaux de néon, bouclier d'énergie, anneau tournant au sommet
        cy(0.16, 0.34, 1.4, 8, 0, 0.0, 0, 0xdfe6ee);
        for (let i = 0; i < 4; i++) shine.push(paint(new THREE.TorusGeometry(0.3 - i * 0.045, 0.012, 4, 14).rotateX(Math.PI / 2).translate(0, 0.25 + i * 0.3, 0), i % 2 ? MAGENTA : CYAN));
        solid.push(paint(new THREE.SphereGeometry(0.3, 10, 6).scale(1, 0.55, 1).translate(0, 1.5, 0), 0xeef2f8, shade));
        gl(0.4, 0.04, 0.4, 0, 1.46, 0, CYAN);
        for (const s of [-1, 1]) { bx(0.1, 0.12, 0.3, s * 0.3, 1.38, 0, 0xcfd6e0); gl(0.06, 0.03, 0.04, s * 0.3, 1.42, -0.16, 0xff4060); }
        sp(0, 0, paint(new THREE.TorusGeometry(0.28, 0.02, 4, 16).rotateX(Math.PI / 2.3).translate(0, 1.95, 0), CYAN));
        sp(0, 0, paint(new THREE.OctahedronGeometry(0.1).translate(0, 1.95, 0), MAGENTA));
        dome(0.78, 0, 0, CYAN);
        tools(0.4, -0.35); crates(-0.55, 0.2, 1, 0.15); lamp(-0.42, -0.42, 0.4);
        flag = [0, 2.4, 0]; cy(0.01, 0.01, 0.3, 4, 0, 2.2, 0, 0xdfe6ee);
      }
      break;
    }
    case 'brazier': {
      shadow(0.3, 0.3, 0, 0);
      if (a === 1) {
        // trépied de bois et vasque de pierre, flammes vives, quelques bûches
        for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; solid.push(paint(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 4).rotateZ(Math.cos(t) * 0.22).rotateX(-Math.sin(t) * 0.22).translate(Math.sin(t) * 0.1, 0.25, Math.cos(t) * 0.1), DARKWOOD)); }
        cy(0.22, 0.14, 0.14, 8, 0, 0.45, 0, STONE); flm(0.17, 0.42, 0, 0.58, 0, FIRE); flm(0.1, 0.3, 0.07, 0.58, 0.04, 0xffe070);
        bx(0.2, 0.05, 0.05, 0.2, 0, 0.18, DARKWOOD, 0.4); sparks.push([0, 1.0, 0]); smoke.push([0, 1.1, 0]);
      } else if (a === 2) {
        // pied de pierre, vasque de fer à cerclage, étincelles ; fanion
        cy(0.1, 0.16, 0.45, 6, 0, 0, 0, STONE); cy(0.24, 0.14, 0.16, 8, 0, 0.45, 0, DARK); cy(0.255, 0.25, 0.03, 8, 0, 0.58, 0, 0x2a2a30);
        flm(0.17, 0.42, 0, 0.6, 0, FIRE); flm(0.1, 0.3, 0.07, 0.6, 0.04, 0xffe070); sparks.push([0, 1.0, 0]); smoke.push([0, 1.1, 0]);
        bx(0.01, 0.2, 0.01, 0.28, 0, 0.0, DARKWOOD); solid.push(paint(new THREE.ConeGeometry(0.04, 0.1, 3).rotateZ(-Math.PI / 2).translate(0.32, 0.17, 0), S.acc));
      } else if (a === 3) {
        // baril de tôle percé, charbon rougeoyant, tuyau de cheminée qui fume
        cy(0.15, 0.15, 0.5, 8, 0, 0, 0, 0x7a3a2a); for (const y of [0.1, 0.35]) cy(0.158, 0.158, 0.025, 8, 0, y, 0, DARK);
        cy(0.13, 0.13, 0.02, 8, 0, 0.5, 0, EMBER); flm(0.12, 0.34, 0, 0.5, 0, FIRE); flm(0.07, 0.24, 0.05, 0.5, 0.03, 0xffe070);
        for (let i = 0; i < 3; i++) gl(0.04, 0.03, 0.02, -0.06 + i * 0.06, 0.15, -0.155, EMBER);
        cy(0.025, 0.025, 0.45, 5, 0.14, 0.4, 0.1, DARK); smoke.push([0.14, 0.9, 0.1]); sparks.push([0, 0.9, 0]);
      } else if (a === 4) {
        // projecteur sur trépied : lampe halogène, base béton, câble ; plus un baril de feu en secours
        cy(0.15, 0.17, 0.06, 8, 0, 0, 0, 0x8e9092);
        cy(0.015, 0.02, 0.62, 5, 0, 0.06, 0, 0x6a6e74);
        bx(0.3, 0.2, 0.12, 0, 0.62, 0, 0x3a3e44); gl(0.26, 0.16, 0.03, 0, 0.64, -0.075, 0xfff4d0);
        bx(0.01, 0.04, 0.4, 0, 0.0, 0.2, 0x2a2a30);
        flameY = 0.05;
        cy(0.09, 0.09, 0.2, 6, 0.28, 0, 0.1, 0xff7a20);
      } else {
        // balise lisse : colonne de métal, cœur d'énergie en lévitation, anneaux luisants, bulle de lumière
        cy(0.08, 0.14, 0.4, 8, 0, 0, 0, 0xdfe6ee);
        shine.push(paint(new THREE.TorusGeometry(0.15, 0.012, 4, 14).rotateX(Math.PI / 2).translate(0, 0.38, 0), CYAN));
        sp(0, 0, paint(new THREE.OctahedronGeometry(0.12).scale(0.8, 1.3, 0.8).translate(0, 0.72, 0), 0xff9a50));
        sp(0, 0, paint(new THREE.TorusGeometry(0.2, 0.012, 4, 14).rotateX(Math.PI / 2.5).translate(0, 0.72, 0), CYAN));
        flameY = 0.7;
        sparks.push([0, 0.85, 0]);
        dome(0.34, 0, 0, 0xff9a50);
      }
      // la lumière du feu (la brume recule autour d'un brasero)
      fire = kind === 'brazier' ? (a === 1 || a === 2 ? 0.85 : a === 3 ? 0.78 : a === 4 ? 0.7 : 0.75) : fire;
      break;
    }
    default:
      return null;
  }
  const m = (l: THREE.BufferGeometry[]) => (l.length ? merge(l) : null);
  // (le projecteur du brasero moderne n'a pas de flammes : la lumière vient de sa lampe, posée sur `fire`)
  return { solid: merge(solid), shine: m(shine), flame: m(flame), field: m(field), spin: [...spinAt.values()].map((e) => ({ geo: merge(e.list), x: e.x, z: e.z })), flameY, fire, flag, smoke, sparks };
}
