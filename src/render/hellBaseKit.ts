import * as THREE from 'three';
import { paint, merge } from './battleUnits';

/**
 * La boîte à outils des bâtiments de la base avancée (voir hellBaseAges.ts) : primitives (boîte, cylindre, toit à deux pans, tente à
 * bandes…) et accessoires qui changent d'allure avec l'âge (1 Antiquité : bois et toile ; 2 Médiéval : pierre ; 3 Industriel : brique et
 * tôle ; 4 Moderne : béton ; 5 Futuriste : métal blanc et néons). Tout est fusionné à la fin en quelques maillages : `solid` (éclairé),
 * `shine` (lumineux : fenêtres, néons, braises), `flame` (vacille), `field` (bouclier d'énergie translucide) et `spin` (pièces tournantes).
 * Repère : y = pied de la pièce, la porte et la façade regardent vers -z, l'emprise est d'environ 2,4 de large.
 */

export type V3 = [number, number, number];
type G = THREE.BufferGeometry;

export const WOOD = 0x9a6a3c, DARKWOOD = 0x6a4426, CLOTH = 0xefe4c8, STONE = 0x8f8a98, DARK = 0x4a4650, BLUE = 0x2e6ad8, GOLD = 0xf0c040;
export const FIRE = 0xffa040, EMBER = 0xff6a20, WARM = 0xffc060, CYAN = 0x40f0ff, MAGENTA = 0xff50d0, WHITE = 0xf8f4ea, RED = 0xd8443a;
export const IRON = 0x7a8088, SKIN = 0xf0c8a0, GREEN = 0x70ff90, NAVY = 0x1e3f8a;

/** Matériaux de chaque âge (index 1 à 5) : mur, mur sombre, toit, garniture, étendard */
export const ST: { wall: number; wall2: number; roof: number; trim: number; acc: number }[] = [
  { wall: WOOD, wall2: DARKWOOD, roof: CLOTH, trim: 0xc89a6a, acc: BLUE },
  { wall: 0xa87848, wall2: DARKWOOD, roof: 0xd8c690, trim: 0xd0a878, acc: BLUE },
  { wall: 0xa49eaa, wall2: 0x6a6672, roof: 0x3a5ea8, trim: 0xd0cad4, acc: BLUE },
  { wall: 0xc0553a, wall2: 0x7a3828, roof: 0x7a8696, trim: 0x34343c, acc: BLUE },
  { wall: 0xd2d4d8, wall2: 0x9a9ca2, roof: 0x5a6068, trim: 0xe0b030, acc: BLUE },
  { wall: 0xe8eef6, wall2: 0x8a98ac, roof: 0xc4d4e6, trim: CYAN, acc: CYAN },
];

export function makeKit(a: number) {
  const S = ST[a];
  const solid: G[] = [], shine: G[] = [], flame: G[] = [], field: G[] = [];
  const spinAt = new Map<string, { x: number; z: number; list: G[] }>();
  const smoke: V3[] = [], sparks: V3[] = [], flags: V3[] = [];
  const st = { fire: 0, flameY: 0 };
  const shade = (t: number) => 0.8 + t * 0.3;
  const sp = (x: number, z: number, g: G) => { const k = `${x.toFixed(3)},${z.toFixed(3)}`; let e = spinAt.get(k); if (!e) spinAt.set(k, e = { x, z, list: [] }); e.list.push(g); };
  const bright = a >= 4;

  // ---------- primitives (y = pied) ----------
  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) => { solid.push(paint(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z), c, shade)); };
  /** boîte inclinée (autour de son centre) : pans de toit, rampes, étais */
  const rb = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, rx = 0, ry = 0, rz = 0) => { solid.push(paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z), c, shade)); };
  const cy = (rt: number, rb2: number, h: number, seg: number, x: number, y: number, z: number, c: number, ry = 0) => { solid.push(paint(new THREE.CylinderGeometry(rt, rb2, h, seg).rotateY(ry).translate(x, y + h / 2, z), c, shade)); };
  const cn = (r: number, h: number, seg: number, x: number, y: number, z: number, c: number, ry = 0) => cy(0, r, h, seg, x, y, z, c, ry);
  const pyr = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => { solid.push(paint(new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).scale(w, h, d).translate(x, y + h / 2, z), c, shade)); };
  const sph = (rx: number, ry: number, rz: number, x: number, y: number, z: number, c: number, seg = 6) => { solid.push(paint(new THREE.SphereGeometry(1, seg, Math.max(3, seg - 2)).scale(rx, ry, rz).translate(x, y, z), c, shade)); };
  const dome = (r: number, x: number, y: number, z: number, c: number, sy = 1, seg = 10) => { solid.push(paint(new THREE.SphereGeometry(r, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1).translate(x, y, z), c, shade)); };
  const gl = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => { shine.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), c)); };
  const gcy = (r: number, h: number, seg: number, x: number, y: number, z: number, c: number) => { shine.push(paint(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z), c)); };
  const gtor = (r: number, t: number, x: number, y: number, z: number, c: number, rx = Math.PI / 2, seg = 18) => { shine.push(paint(new THREE.TorusGeometry(r, t, 4, seg).rotateX(rx).translate(x, y, z), c)); };
  const flm = (r: number, h: number, x: number, y: number, z: number, c = FIRE) => { st.flameY = y; flame.push(paint(new THREE.ConeGeometry(r, h, 5).translate(x, y + h / 2, z), c)); };
  /** tige fine entre deux points (cordage, étai, manche) */
  const rod = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c = 0xd8d0b8, t = 0.012) => {
    const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = d.length();
    solid.push(paint(new THREE.BoxGeometry(t, t, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize())).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), c));
  };
  /** toit à deux pans (faîte le long de x) ; ry le tourne autour du centre de la pièce */
  const gable = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0, ends = true) => {
    const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], C = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2], E = [-w / 2, h, 0], F = [w / 2, h, 0];
    const tri = [A, E, F, A, F, B, C, F, E, C, E, D];
    if (ends) tri.push(A, D, E, B, F, C);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
    solid.push(paint(g.rotateY(ry).translate(x, y, z), c, shade));
  };

  // ---------- éléments communs ----------
  /** ombre portée : un disque sombre à plat sous le bâtiment */
  const shadow = (rx: number, rz: number, x = 0, z = 0.1) => solid.push(paint(new THREE.CylinderGeometry(1, 1, 0.012, 16).scale(rx * 0.95, 1, rz * 0.95).translate(x, 0.006, z), 0x3a2228));
  /** sol préparé : herbe brûlée et planches (1), dalles (2), pavés de brique (3), béton à bandes jaunes (4), plaques à liseré néon (5) */
  const pad = (hw: number, hd: number, x = 0, z = 0.1) => {
    if (a === 1) {
      for (let i = 0; i < 7; i++) { const t = i * 2.4; solid.push(paint(new THREE.CylinderGeometry(1, 1, 0.014, 7).scale(0.28 + (i % 3) * 0.1, 1, 0.2 + (i % 2) * 0.08).translate(x + Math.sin(t) * hw * 0.8, 0.009, z + Math.cos(t * 1.3) * hd * 0.8), 0x3a2a24)); }
      for (let i = 0; i < 5; i++) bx(0.46, 0.022, 0.1, x + 0.1, 0, z - hd * 0.5 - i * 0.12 - 0.1, WOOD, 0.1 * (i % 2 ? 1 : -1));
      return;
    }
    const c = [0, 0, 0x7a7684, 0x7a3e2c, 0x92949a, 0xaab6c8][a];
    bx(hw * 2, 0.045, hd * 2, x, 0, z, c);
    if (a === 2) for (let i = 0; i < 10; i++) bx(0.26, 0.02, 0.2, x + ((i * 0.37) % 1 - 0.5) * hw * 1.6, 0.045, z + (((i * 0.61) % 1) - 0.5) * hd * 1.6, i % 2 ? 0x8a8694 : 0x6a6674, i * 0.4);
    if (a === 3) { for (let i = -3; i <= 3; i++) bx(hw * 1.9, 0.01, 0.014, x, 0.046, z + i * hd * 0.28, 0x5a2a20); bx(hw * 2.1, 0.03, 0.04, x, 0.045, z - hd + 0.02, 0x5a5a64); }
    if (a === 4) { for (let i = -2; i <= 2; i++) bx(0.035, 0.05, hd * 1.9, x + i * hw * 0.4, 0, z, 0xe0b030); for (let i = 0; i < 3; i++) bx(0.3, 0.012, 0.3, x - hw * 0.5 + i * 0.5, 0.045, z - hd * 0.5, 0xb8bcc0); }
    if (a === 5) {
      for (const s of [-1, 1]) { gl(hw * 2 - 0.1, 0.012, 0.03, x, 0.045, z + s * (hd - 0.05), CYAN); gl(0.03, 0.012, hd * 2 - 0.1, x + s * (hw - 0.05), 0.045, z, CYAN); }
      gl(0.03, 0.012, hd * 1.4, x, 0.045, z, MAGENTA);
    }
  };
  const crate = (x: number, y: number, z: number, s: number, ry = 0) => {
    if (a <= 2) { bx(s, s, s, x, y, z, WOOD, ry); bx(s * 1.04, s * 0.1, s * 1.04, x, y + s * 0.18, z, DARKWOOD, ry); bx(s * 1.04, s * 0.1, s * 1.04, x, y + s * 0.72, z, DARKWOOD, ry); bx(s * 0.2, s * 1.02, s * 1.04, x, y, z, DARKWOOD, ry + 0.0); }
    else if (a === 3) { bx(s, s, s, x, y, z, 0x8a5a30, ry); bx(s * 1.04, s * 0.1, s * 1.04, x, y + s * 0.45, z, 0x4a4650, ry); bx(s * 0.3, s * 0.3, s * 0.02, x, y + s * 0.5, z - s * 0.51, 0xe8e0c8, ry); }
    else if (a === 4) { bx(s * 1.3, s, s, x, y, z, [0x2e6a9a, 0x4a7a4a, 0xb86a2a][Math.round(Math.abs(x * 7 + z * 3)) % 3], ry); bx(s * 1.34, s * 0.1, s * 1.04, x, y + s * 0.88, z, 0xd8d8d8, ry); }
    else { bx(s, s, s, x, y, z, 0xcfd6e0, ry); gl(s * 1.02, s * 0.12, s * 1.02, x, y + s * 0.42, z, CYAN); }
  };
  const crates = (x: number, z: number, n = 3, s = 0.2) => { crate(x, 0, z, s); if (n > 1) crate(x + s * 1.05, 0, z + 0.02, s * 0.9, 0.2); if (n > 2) crate(x + s * 0.5, s, z + 0.01, s * 0.85, -0.15); };
  const barrel = (x: number, z: number, h = 0.2) => {
    if (a <= 2) { cy(0.07, 0.07, h, 8, x, 0, z, WOOD); cy(0.076, 0.076, 0.025, 8, x, h * 0.25, z, DARK); cy(0.076, 0.076, 0.025, 8, x, h * 0.7, z, DARK); cy(0.062, 0.062, 0.01, 8, x, h, z, DARKWOOD); }
    else if (a === 3) { cy(0.07, 0.07, h, 8, x, 0, z, 0x9a3a2a); cy(0.074, 0.074, 0.02, 8, x, h * 0.5, z, DARK); }
    else if (a === 4) { cy(0.07, 0.07, h, 8, x, 0, z, 0x2e5a9a); cy(0.074, 0.074, 0.025, 8, x, h * 0.45, z, 0xe0b030); }
    else { cy(0.065, 0.065, h, 8, x, 0, z, 0xdfe6ee); gcy(0.068, 0.03, 8, x, h * 0.55, z, CYAN); }
  };
  const barrels = (x: number, z: number, n = 3) => { for (let i = 0; i < n; i++) barrel(x + (i % 2) * 0.15 - (i > 1 ? 0.07 : 0), z + (i > 1 ? 0.02 : 0) + (i % 2) * 0.06, 0.2 + (i === 2 ? 0.0 : 0)); };
  const sack = (x: number, z: number, s = 1) => {
    if (a === 5) { bx(0.12 * s, 0.1 * s, 0.1 * s, x, 0, z, 0x8a98ac); gl(0.1 * s, 0.015, 0.08 * s, x, 0.1 * s, z, MAGENTA); return; }
    sph(0.1 * s, 0.065 * s, 0.075 * s, x, 0.05 * s, z, a === 4 ? 0x7a8a5a : 0xcdb88a);
    cy(0.02 * s, 0.03 * s, 0.03 * s, 5, x + 0.03, 0.09 * s, z, 0xa8946a);
  };
  const sacks = (x: number, z: number, n = 3) => { for (let i = 0; i < n; i++) { sack(x + (i % 2) * 0.16, z + (i > 1 ? 0.0 : 0.03)); } if (n > 2) { solid.push(paint(new THREE.SphereGeometry(0.075, 6, 4).scale(1.3, 0.8, 1).translate(x + 0.08, 0.14, z), a === 4 ? 0x7a8a5a : 0xcdb88a, shade)); } };
  const planks = (x: number, z: number, ry = 0) => {
    const c = a <= 3 ? [0, WOOD, WOOD, 0x8a5a30][a] : a === 4 ? 0x9a9c9e : 0x8a98ac;
    for (let i = 0; i < 3; i++) bx(0.32, 0.018 + i * 0.012, 0.07, x + Math.sin(ry) * i * 0.075, 0, z + Math.cos(ry) * i * 0.075, c, ry + (i - 1) * 0.07);
  };
  /** outils appuyés au mur : lances/haches, pioches, pelles, cônes de chantier, drone */
  const tools = (x: number, z: number, lean = 0.25) => {
    if (a <= 3) {
      for (let i = 0; i < 3; i++) {
        const ox = x + i * 0.07;
        solid.push(paint(new THREE.CylinderGeometry(0.012, 0.014, 0.55, 4).rotateZ(lean).translate(ox, 0.27, z), DARKWOOD));
        const head = a === 1 ? new THREE.ConeGeometry(0.03, 0.09, 4) : a === 2 ? new THREE.BoxGeometry(0.1, 0.03, 0.02) : new THREE.BoxGeometry(0.07, 0.07, 0.015);
        solid.push(paint(head.translate(ox - Math.sin(lean) * 0.28, 0.55, z), a === 1 ? 0xb0a090 : 0x9aa0a8));
      }
    } else if (a === 4) { cn(0.05, 0.13, 6, x, 0, z, 0xff7a20); bx(0.12, 0.012, 0.12, x, 0, z, 0xff7a20); cn(0.05, 0.13, 6, x + 0.16, 0, z + 0.05, 0xff7a20); }
    else { sph(0.07, 0.055, 0.07, x, 0.1, z, 0xe8eef6, 8); gl(0.05, 0.02, 0.02, x, 0.11, z - 0.065, CYAN); cy(0.012, 0.012, 0.06, 4, x, 0.03, z, DARK); }
  };
  /** lampe à pied : torche, lanterne, réverbère, projecteur, mât à néon */
  const lamp = (x: number, z: number, h = 0.55) => {
    if (a === 1) { cy(0.012, 0.016, h, 4, x, 0, z, DARKWOOD); cy(0.04, 0.02, 0.05, 5, x, h, z, DARK); flm(0.035, 0.1, x, h + 0.04, z); }
    else if (a === 2) { cy(0.012, 0.014, h, 4, x, 0, z, DARK); bx(0.07, 0.09, 0.07, x, h, z, DARK); gl(0.05, 0.065, 0.05, x, h + 0.012, z, WARM); cn(0.06, 0.04, 4, x, h + 0.09, z, DARK); }
    else if (a === 3) { cy(0.012, 0.016, h + 0.1, 5, x, 0, z, 0x2a2a30); sph(0.05, 0.05, 0.05, x, h + 0.14, z, 0x2a2a30); shine.push(paint(new THREE.SphereGeometry(0.04, 6, 5).translate(x, h + 0.14, z), WARM)); }
    else if (a === 4) { cy(0.012, 0.016, h + 0.25, 5, x, 0, z, 0x6a6e74); bx(0.16, 0.05, 0.05, x, h + 0.25, z, 0x3a3e44); gl(0.14, 0.035, 0.02, x, h + 0.26, z - 0.03, 0xfff4d0); }
    else { cy(0.01, 0.014, h, 5, x, 0, z, 0xdfe6ee); gl(0.03, 0.2, 0.03, x, h, z, CYAN); }
  };
  /** guirlande de fanions entre deux points */
  const bunting = (x0: number, z0: number, x1: number, z1: number, y: number, n = 7, sag = 0.07) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, yy = y - Math.sin(t * Math.PI) * sag;
      const c = a === 5 ? (i % 2 ? CYAN : MAGENTA) : i % 3 === 0 ? WHITE : i % 3 === 1 ? S.acc : GOLD;
      (a === 5 ? shine : solid).push(paint(new THREE.ConeGeometry(0.035, 0.09, 3).rotateX(Math.PI).translate(x, yy - 0.045, z), c));
    }
    rod(x0, y, z0, x1, y, z1, 0xd8d0b8, 0.008);
  };
  /** mât et étendard : le drapeau flotte (la vue l'anime) ; de bois, puis de fer, puis de métal */
  const pole = (x: number, z: number, h: number) => {
    const pc = a <= 2 ? DARKWOOD : a === 3 ? 0x2a2a30 : a === 4 ? 0xb8bcc4 : 0xdfe6ee;
    cy(0.026, 0.034, h, 5, x, 0, z, pc);
    cy(0.045, 0.05, 0.05, 6, x, 0, z, a <= 2 ? STONE : pc);
    sph(0.055, 0.055, 0.055, x, h + 0.03, z, a === 5 ? 0x40f0ff : GOLD);
    flags.push([x, h - 0.14, z]);
  };
  const crenels = (w: number, d: number, x: number, y: number, z: number, c: number, n = 5, h = 0.1) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      for (const s of [-1, 1]) { bx(w / n * 0.55, h, 0.07, x + t * w, y, z + s * d / 2, c); bx(0.07, h, d / n * 0.55, x + s * w / 2, y, z + t * d, c); }
    }
  };
  /** fenêtres qui luisent la nuit (rangée) */
  const windows = (n: number, w: number, y: number, z: number, span: number, x = 0, c = WARM, h = 0.09) => {
    for (let i = 0; i < n; i++) gl(w, h, 0.02, x + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span), y, z, c);
  };
  /** fenêtre encadrée (face -z ; face +z si dir = 1) : cadre, vitre qui luit, appui, volets ou croisillon */
  const win = (x: number, y: number, z: number, w = 0.16, h = 0.2, dir = -1, c = WARM) => {
    const f = a <= 2 ? DARKWOOD : a === 3 ? 0xe8e0c8 : a === 4 ? 0x3a3e44 : 0x8a98ac, zz = z + dir * 0.012;
    bx(w + 0.06, h + 0.06, 0.03, x, y - 0.03, z, f);
    gl(w, h, 0.02, x, y, zz, a === 5 ? 0x7af0ff : c);
    if (a <= 3) { bx(0.014, h, 0.012, x, y, zz + dir * 0.012, f); bx(w, 0.014, 0.012, x, y + h / 2, zz + dir * 0.012, f); }
    bx(w + 0.1, 0.03, 0.06, x, y - 0.06, z + dir * 0.025, a >= 4 ? 0xb0b4ba : S.trim);
    if (a <= 3) for (const s of [-1, 1]) bx(0.06, h + 0.04, 0.02, x + s * (w / 2 + 0.07), y - 0.02, z + dir * 0.02, a === 2 ? 0x4a6aa8 : DARKWOOD);
  };
  /** porte avec encadrement (face -z) : planches, ferrures, poignée ; coulissante à liseré lumineux au futur */
  const door = (x: number, z: number, w = 0.3, h = 0.42, dir = -1) => {
    const zz = z + dir * 0.02;
    if (a <= 2) { bx(w + 0.1, h + 0.06, 0.04, x, 0, z, a === 1 ? DARKWOOD : STONE); bx(w, h, 0.03, x, 0, zz, a === 1 ? WOOD : 0x7a5230); for (const yy of [0.1, h - 0.14]) bx(w, 0.03, 0.02, x, yy, zz + dir * 0.015, DARK); bx(0.03, 0.04, 0.02, x + w * 0.3, h * 0.45, zz + dir * 0.02, GOLD); }
    else if (a === 3) { bx(w + 0.1, h + 0.07, 0.04, x, 0, z, 0xe8e0c8); bx(w, h, 0.03, x, 0, zz, 0x3a3a42); bx(0.03, 0.03, 0.02, x + w * 0.3, h * 0.45, zz + dir * 0.015, GOLD); gl(w * 0.8, 0.06, 0.02, x, h + 0.01, zz + dir * 0.005, WARM); }
    else if (a === 4) { bx(w + 0.08, h + 0.05, 0.04, x, 0, z, 0x34383e); bx(w, h, 0.03, x, 0, zz, 0x6a7a8a); bx(w * 0.9, 0.014, 0.02, x, h * 0.5, zz + dir * 0.012, 0xe0b030); bx(0.03, 0.12, 0.02, x + w * 0.35, h * 0.4, zz + dir * 0.015, 0xd8d8d8); }
    else { bx(w + 0.1, h + 0.06, 0.04, x, 0, z, 0x8a98ac); bx(w * 0.5, h, 0.03, x - w * 0.26, 0, zz, 0xdfe6ee); bx(w * 0.5, h, 0.03, x + w * 0.26, 0, zz, 0xdfe6ee); gl(0.02, h * 0.9, 0.02, x, 0.02, zz + dir * 0.012, CYAN); gl(w + 0.12, 0.02, 0.03, x, h + 0.06, zz, CYAN); }
  };
  const steps = (x: number, z: number, w = 0.5, n = 3, dir = -1) => { for (let i = 0; i < n; i++) bx(w, 0.05 * (n - i), 0.1, x, 0, z + dir * i * 0.1, a === 1 ? WOOD : a === 2 ? 0x9a96a4 : a === 3 ? 0x8a4a38 : a === 4 ? 0xa8aaae : 0xcfd6e0); };
  /** bouclier suspendu au mur, face à -z : rond et peint (1), écu (2), plaque (3), tactique (4), énergie (5) */
  const shield = (x: number, y: number, z: number, s = 1, c = BLUE, dir = -1) => {
    const zz = z + dir * 0.02;
    if (a === 5) { gtor(0.1 * s, 0.012, x, y, zz, CYAN, 0, 16); shine.push(paint(new THREE.CircleGeometry(0.095 * s, 14).translate(x, y, zz + dir * 0.002).rotateY(dir > 0 ? 0 : Math.PI), 0x3a8ad8)); return; }
    if (a === 2) { solid.push(paint(new THREE.ConeGeometry(0.1 * s, 0.22 * s, 3).rotateZ(Math.PI).rotateX(Math.PI / 2 * dir).translate(x, y, zz), c, shade)); bx(0.015, 0.2 * s, 0.015, x, y - 0.1 * s, zz + dir * 0.015, GOLD); bx(0.15 * s, 0.015, 0.015, x, y + 0.02 * s, zz + dir * 0.015, GOLD); return; }
    const r = (a === 3 ? 0.085 : 0.1) * s;
    solid.push(paint(new THREE.CylinderGeometry(r, r, 0.025, 12).rotateX(Math.PI / 2).translate(x, y, zz), a === 4 ? 0x5a6a7a : c, shade));
    solid.push(paint(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.04, 6).rotateX(Math.PI / 2).translate(x, y, zz + dir * 0.012), a === 1 ? GOLD : 0xd8d8d8, shade));
    solid.push(paint(new THREE.TorusGeometry(r, 0.01, 4, 12).translate(x, y, zz + dir * 0.008), GOLD));
  };
  /** bannière verticale suspendue (tissu, liseré et motif doré) */
  const banner = (x: number, y: number, z: number, w = 0.22, h = 0.5, c = S.acc, dir = -1) => {
    bx(w + 0.06, 0.03, 0.04, x, y + h, z, a <= 2 ? DARKWOOD : 0xb8bcc4);
    bx(w, h, 0.02, x, y, z + dir * 0.025, c); bx(w * 0.14, h * 0.8, 0.012, x - w * 0.5, y, z + dir * 0.035, GOLD); bx(w * 0.14, h * 0.8, 0.012, x + w * 0.5, y, z + dir * 0.035, GOLD);
    cn(w * 0.5, 0.1, 3, x, y - 0.08, z + dir * 0.025, c, 0);
    (a === 5 ? shine : solid).push(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 6).rotateX(Math.PI / 2).translate(x, y + h * 0.55, z + dir * 0.042), a === 5 ? CYAN : GOLD));
  };
  const hay = (x: number, z: number, s = 1) => { sph(0.2 * s, 0.14 * s, 0.17 * s, x, 0.08 * s, z, 0xd8b860, 6); for (let i = 0; i < 4; i++) rod(x - 0.1 + i * 0.07, 0.02, z, x - 0.14 + i * 0.09, 0.2 * s, z + 0.02, 0xe8cc70, 0.012); };
  /** guirlande d'ampoules ou de lanternes entre deux points */
  const strings = (x0: number, z0: number, x1: number, z1: number, y: number, n = 6) => {
    rod(x0, y, z0, x1, y, z1, 0x2a2a30, 0.008);
    for (let i = 1; i < n; i++) { const t = i / n; gl(0.045, 0.045, 0.045, x0 + (x1 - x0) * t, y - 0.07 - Math.sin(t * Math.PI) * 0.05, z0 + (z1 - z0) * t, a === 5 ? (i % 2 ? CYAN : MAGENTA) : 0xfff0b0); }
  };
  /** pieux taillés plantés en travers (devant les bâtiments de bois) ; des planches ensuite */
  const stakes = (x0: number, z0: number, x1: number, z1: number, n: number, h = 0.34) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      solid.push(paint(new THREE.ConeGeometry(0.03, h, 4).rotateZ(i % 2 ? 0.2 : -0.2).translate(x0 + (x1 - x0) * t, h * 0.42, z0 + (z1 - z0) * t), 0xd8aa74, shade));
    }
  };
  /** palissette : pieux jointifs, lisse haute et basse (pierre taillée au Moyen Âge, grillage ensuite, balustrade lumineuse au futur) */
  const fence = (x0: number, z0: number, x1: number, z1: number, h = 0.3) => {
    const n = Math.max(3, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.1));
    if (a >= 3) { for (let i = 0; i <= n; i += 3) { const t = i / n; cy(0.014, 0.014, h, 4, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, a === 3 ? 0x2a2a30 : a === 4 ? 0x8a8e94 : 0xdfe6ee); } rod(x0, h, z0, x1, h, z1, a === 5 ? CYAN : 0x6a6e74, 0.014); rod(x0, h * 0.5, z0, x1, h * 0.5, z1, a === 5 ? MAGENTA : 0x6a6e74, 0.01); return; }
    for (let i = 0; i <= n; i++) { const t = i / n; cn(0.026, h + (i % 2) * 0.04, 4, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, a === 1 ? 0xd8aa74 : 0xb8a888); }
    rod(x0, h * 0.7, z0, x1, h * 0.7, z1, DARKWOOD, 0.02); rod(x0, h * 0.25, z0, x1, h * 0.25, z1, DARKWOOD, 0.02);
  };
  const ladder = (x: number, z: number, h: number, ry = 0, lean = 0.2) => {
    const c = a <= 2 ? DARKWOOD : 0x7a7e84, co = Math.cos(ry), si = Math.sin(ry);
    for (const s of [-1, 1]) rod(x + co * s * 0.06, 0, z - si * s * 0.06, x + co * s * 0.06, h, z - si * s * 0.06 + lean, c, 0.02);
    for (let y = 0.1; y < h; y += 0.1) rod(x - co * 0.06, y, z + si * 0.06 + lean * y / h, x + co * 0.06, y, z - si * 0.06 + lean * y / h, c, 0.014);
  };
  /** cheminée qui fume : brique/pierre, couronne ; un chapeau de tôle plus tard */
  const chimney = (x: number, y: number, z: number, h = 0.5, w = 0.14, c = S.wall2) => {
    bx(w, h, w, x, y, z, c); bx(w * 1.35, 0.04, w * 1.35, x, y + h, z, DARK); bx(w * 1.2, 0.025, w * 1.2, x, y + h * 0.5, z, S.trim);
    bx(w * 0.7, 0.01, w * 0.7, x, y + h + 0.04, z, 0x1a1214); smoke.push([x, y + h + 0.1, z]);
  };
  /** radar à antenne parabolique qui tourne */
  const dish = (x: number, y: number, z: number, s = 1) => {
    cy(0.012, 0.012, 0.2 * s, 4, x, y, z, 0x8a8e94);
    sp(x, z, paint(new THREE.SphereGeometry(0.1 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2.4).translate(0, y + 0.24 * s, 0), 0xdfe6ee));
    sp(x, z, paint(new THREE.CylinderGeometry(0.008, 0.008, 0.1 * s, 3).rotateX(Math.PI / 2).translate(0, y + 0.24 * s, -0.06 * s), 0xff4040));
  };
  /** mât d'antenne à traverses et feu rouge */
  const mast = (x: number, y: number, z: number, h: number) => {
    cy(0.012, 0.014, h, 4, x, y, z, 0x8a8e94);
    for (let i = 1; i < 4; i++) bx(0.24 - i * 0.04, 0.012, 0.012, x, y + i * h / 4, z, 0x8a8e94);
    gl(0.045, 0.045, 0.045, x, y + h, z, 0xff3030);
  };
  /** hologramme : plaque, losange et anneaux qui tournent, luisants */
  const holo = (x: number, y: number, z: number, c = CYAN, s = 1) => {
    gl(0.16 * s, 0.015, 0.16 * s, x, y, z, 0x3a4a5a);
    sp(x, z, paint(new THREE.OctahedronGeometry(0.1 * s).scale(0.7, 1.2, 0.7).translate(0, y + 0.22 * s, 0), c));
    sp(x, z, paint(new THREE.TorusGeometry(0.15 * s, 0.008, 4, 14).rotateX(Math.PI / 2).translate(0, y + 0.22 * s, 0), MAGENTA));
  };
  /** bouclier d'énergie : dôme translucide */
  const bubble = (r: number, x: number, z: number, c = CYAN) => { field.push(paint(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0, z), c)); };
  const sandbags = (x: number, z: number, n: number, ry = 0, rows = 2) => {
    for (let i = 0; i < n; i++) for (let r = 0; r < rows; r++) {
      if (r % 2 === 1 && i === n - 1) continue;
      const o = (i - (n - 1) / 2 + (r % 2) * 0.5) * 0.16;
      sph(0.105, 0.052, 0.075, x + Math.cos(ry) * o, 0.05 + r * 0.09, z - Math.sin(ry) * o, r % 2 ? 0x8a8a52 : 0x8a8a5a, 5);
    }
  };
  /** foyer de pierres (ou brasero) : couronne de cailloux, cendres et flammes ; renvoie rien */
  const firepit = (x: number, z: number, r = 0.2, big = 1) => {
    for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; solid.push(paint(new THREE.DodecahedronGeometry(0.07 * (r / 0.2), 0).translate(x + Math.sin(t) * r, 0.05, z + Math.cos(t) * r), i % 2 ? DARK : 0x5a5660)); }
    cy(r * 0.85, r * 0.85, 0.03, 8, x, 0, z, 0x2a1e1c);
    for (let i = 0; i < 3; i++) rod(x - 0.1 + i * 0.1, 0.04, z - 0.06, x + 0.1 - i * 0.06, 0.1, z + 0.08, DARKWOOD, 0.035);
    flm(0.13 * big, 0.34 * big, x, 0.05, z); flm(0.08 * big, 0.24 * big, x + 0.06, 0.05, z + 0.03, 0xffe070);
    sparks.push([x, 0.4 * big, z]); smoke.push([x, 0.5 * big, z]);
  };
  /** petit soldat bleu et blanc (fantassin, archer, sentinelle) : jambes, buste, tête, casque, arme selon l'âge ; s : échelle */
  const fig = (x: number, y: number, z: number, ry = 0, pose: 'stand' | 'bow' | 'gun' | 'hammer' = 'stand', s = 1) => {
    const c = Math.cos(ry), sn = Math.sin(ry), at = (px: number, pz: number) => [x + c * px + sn * pz, z - sn * px + c * pz] as const;
    const body = a === 5 ? 0xe8eef6 : a === 4 ? 0x4a6a3a : a === 3 ? S.acc : a === 2 ? 0x8a8e98 : 0xa87848, cloth = a === 5 ? CYAN : S.acc;
    for (const sx of [-1, 1]) { const [px, pz] = at(sx * 0.03 * s, 0); bx(0.045 * s, 0.14 * s, 0.05 * s, px, y, pz, a === 5 ? 0xcfd6e0 : 0x4a4048); }
    cy(0.065 * s, 0.075 * s, 0.17 * s, 6, x, y + 0.13 * s, z, body, ry);
    const [bx2, bz2] = at(0, -0.04 * s); bx(0.1 * s, 0.1 * s, 0.015, bx2, y + 0.17 * s, bz2, cloth, ry);
    sph(0.05 * s, 0.05 * s, 0.05 * s, x, y + 0.34 * s, z, SKIN);
    if (a === 5) { sph(0.058 * s, 0.056 * s, 0.058 * s, x, y + 0.35 * s, z, 0xf4f8fc); const [vx, vz] = at(0, -0.05 * s); gl(0.07 * s, 0.025 * s, 0.015, vx, y + 0.34 * s, vz, CYAN); }
    else if (a === 4) { dome(0.058 * s, x, y + 0.35 * s, z, 0x5a6a3a, 0.9, 7); }
    else if (a === 3) { cy(0.045 * s, 0.05 * s, 0.07 * s, 6, x, y + 0.37 * s, z, S.acc); const [vx, vz] = at(0, -0.05 * s); bx(0.08 * s, 0.012, 0.05 * s, vx, y + 0.37 * s, vz, 0x2a2a30, ry); }
    else { dome(0.058 * s, x, y + 0.34 * s, z, a === 2 ? 0xb0b4bc : 0xc08a3a, 1, 7); if (a === 2) { const [px, pz] = at(0, 0); cn(0.015, 0.06 * s, 4, px, y + 0.4 * s, pz, RED); } }
    if (pose === 'bow') { const [px, pz] = at(-0.09 * s, -0.05 * s); solid.push(paint(new THREE.TorusGeometry(0.11 * s, 0.01, 4, 8, Math.PI).rotateZ(-Math.PI / 2).rotateY(ry + Math.PI / 2).translate(px, y + 0.25 * s, pz), DARKWOOD)); const [qx, qz] = at(-0.09 * s, -0.05 * s); rod(qx, y + 0.14 * s, qz, qx, y + 0.36 * s, qz, 0xe8e0c8, 0.006); }
    else if (pose === 'gun') { const [px, pz] = at(0.07 * s, -0.12 * s); rod(px, y + 0.22 * s, pz + 0.05 * s, px, y + 0.24 * s, pz - 0.14 * s, a === 5 ? 0xdfe6ee : 0x2a2a30, 0.025 * s); if (a === 5) gl(0.02, 0.02, 0.04, px, y + 0.22 * s, pz - 0.15 * s, CYAN); }
    else if (pose === 'hammer') { const [px, pz] = at(0.09 * s, -0.04 * s); rod(px, y + 0.1 * s, pz, px, y + 0.38 * s, pz - 0.05 * s, DARKWOOD, 0.018); bx(0.07 * s, 0.05 * s, 0.05 * s, px, y + 0.36 * s, pz - 0.05 * s, 0x5a5e66, ry); }
    else { const [px, pz] = at(0.1 * s, 0); rod(px, y, pz, px, y + 0.52 * s, pz, DARKWOOD, 0.014); if (a <= 2) cn(0.025, 0.07, 4, px, y + 0.52 * s, pz, 0xd0d4dc); }
  };

  /** tente à bandes de couleur, faîte le long de z (l'entrée, un rabat sombre, regarde vers -z) ; n bandes alternées c1/c2 */
  const tent = (x: number, z: number, w: number, d: number, h: number, c1: number, c2: number, n = 6, flap = true) => {
    for (let i = 0; i < n; i++) gable(d / n, h, w, x, 0, z + ((i + 0.5) / n - 0.5) * d, i % 2 ? c2 : c1, Math.PI / 2, false);
    // pans de bout, pleins (triangles aux deux extrémités du faîte)
    for (const s of [-1, 1]) solid.push(paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(s < 0 ? [-w / 2, 0, 0, 0, h, 0, w / 2, 0, 0] : [w / 2, 0, 0, 0, h, 0, -w / 2, 0, 0], 3)).translate(x, 0, z + s * d / 2), c1, shade));
    if (flap) { solid.push(paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-w * 0.2, 0, 0, 0, h * 0.62, 0, w * 0.2, 0, 0], 3)).translate(x, 0, z - d / 2 - 0.008), a === 5 ? 0x2a3a52 : 0x3a2a24, shade)); }
    cy(0.012, 0.012, h * 0.2, 4, x, h, z, DARKWOOD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(x + sx * w / 2, 0.02, z + sz * d / 2, x + sx * (w / 2 + 0.2), 0.0, z + sz * (d / 2 + 0.16), 0xd8d0b8, 0.008);
  };
  /** pavillon rond à quartiers alternés */
  const pavilion = (x: number, z: number, r: number, h: number, c1: number, c2: number, n = 8, y = 0) => {
    for (let i = 0; i < n; i++) solid.push(paint(new THREE.ConeGeometry(r, h, 1 + 0, 1, true, (i / n) * Math.PI * 2, (1 / n) * Math.PI * 2).translate(x, y + h / 2, z), i % 2 ? c2 : c1, shade));
    cy(0.015, 0.015, h * 0.25, 4, x, y + h, z, GOLD);
  };

  /** râtelier d'armes sur deux montants : lances et épées (1, 2), fusils à crosse (3), fusils noirs (4), fusils à lueur (5) ; n armes sur la largeur w */
  const rack = (x: number, z: number, n = 4, w = 0.6) => {
    const fr = a <= 2 ? DARKWOOD : a === 3 ? 0x3a3a42 : a === 4 ? 0x5a5e66 : 0xdfe6ee;
    for (const s of [-1, 1]) bx(0.045, 0.5, 0.05, x + s * w / 2, 0, z, fr);
    bx(w + 0.1, 0.04, 0.06, x, 0.4, z, fr); bx(w + 0.1, 0.04, 0.06, x, 0.1, z, fr);
    for (let i = 0; i < n; i++) {
      const wx = x - w / 2 + 0.07 + (i / Math.max(1, n - 1)) * (w - 0.14);
      if (a <= 2) { rod(wx, 0.04, z + 0.02, wx, 0.72, z + 0.02, 0xb8a888, 0.016); if (a === 1 || i % 2 === 0) cn(0.03, 0.1, 4, wx, 0.72, z + 0.02, a === 1 ? 0xc8c0b0 : 0xd0d4dc); else { bx(0.1, 0.025, 0.02, wx, 0.5, z + 0.02, 0xc8ccd4); bx(0.03, 0.2, 0.02, wx, 0.6, z + 0.02, 0xd8d8e0); } }
      else if (a === 5) { rod(wx, 0.05, z + 0.02, wx, 0.6, z + 0.02, 0xe8eef6, 0.03); gl(0.025, 0.16, 0.026, wx, 0.42, z + 0.02, CYAN); }
      else { rod(wx, 0.04, z + 0.02, wx, 0.66, z + 0.02, a === 3 ? 0x6a4a2a : 0x2a2a30, 0.026); bx(0.035, 0.08, 0.04, wx, 0.5, z + 0.02, 0x2a2a30); }
    }
  };

  /** points de fumée, flammes… : rassemble tout, mis à l'échelle de la vue (les bâtiments sont un peu grands pour se lire de loin) */
  const finish = (K: number) => {
    const m = (l: G[]) => { if (!l.length) return null; const g = merge(l); g.scale(K, K, K); return g; };
    const sc = (v: V3): V3 => [v[0] * K, v[1] * K, v[2] * K];
    return {
      solid: m(solid)!, shine: m(shine), flame: m(flame), field: m(field),
      spin: [...spinAt.values()].map((e) => { const g = merge(e.list); g.scale(K, K, K); return { geo: g, x: e.x * K, z: e.z * K }; }),
      flameY: st.flameY * K, fire: st.fire * K, flag: flags[0] ? sc(flags[0]) : null, flags: flags.slice(1).map(sc), smoke: smoke.map(sc), sparks: sparks.map(sc),
    };
  };

  return {
    a, S, st, smoke, sparks, flags, bright,
    bx, rb, cy, cn, pyr, sph, dome, gl, gcy, gtor, flm, rod, gable, shadow, pad, crate, crates, barrel, barrels, sack, sacks, planks, tools, lamp, bunting, pole, crenels,
    tent, pavilion, rack, windows, win, door, steps, shield, banner, hay, strings, stakes, fence, ladder, chimney, dish, mast, holo, bubble, sandbags, firepit, fig, spin: sp,
    solid, shine, field, finish,
  };
}
export type Kit = ReturnType<typeof makeKit>;
