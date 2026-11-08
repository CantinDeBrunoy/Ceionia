import * as THREE from 'three';
import { paint } from './battleUnits';
import { Kit, BLUE, GOLD, DARK, DARKWOOD, WOOD, STONE, CYAN, MAGENTA, EMBER, WARM, WHITE, IRON } from './hellBaseKit';

/** La forge : cheminée fumante, foyer rougeoyant, enclume, soufflet et tas de lingots, de la hutte de pierre à la forge à plasma */
export function buildSmithy(k: Kit) {
  const { a, S } = k;
  const sh = (g: THREE.BufferGeometry, c: number) => k.solid.push(paint(g, c, (t) => 0.8 + t * 0.3));
  const metal = [0, 0xc8783a, 0xa4a8b0, 0xb4b8c0, 0xc4c8cc, 0xf0a050][a];
  /** enclume : socle, fût, table, corne ; sur une souche (1) */
  const anvil = (x: number, z: number, s = 1, ry = 0) => {
    const c = a === 5 ? 0xdfe6ee : 0x3a3a42;
    if (a === 1) k.cy(0.12 * s, 0.14 * s, 0.14 * s, 7, x, 0, z, DARKWOOD);
    const y0 = a === 1 ? 0.14 * s : 0.0;
    k.bx(0.2 * s, 0.1 * s, 0.14 * s, x, y0, z, 0x2a2a30, ry); k.bx(0.12 * s, 0.1 * s, 0.1 * s, x, y0 + 0.1 * s, z, c, ry);
    k.bx(0.36 * s, 0.07 * s, 0.14 * s, x, y0 + 0.2 * s, z, c, ry);
    sh(new THREE.ConeGeometry(0.06 * s, 0.17 * s, 5).rotateZ(Math.PI / 2 * -1).rotateY(ry).translate(x + Math.cos(ry) * 0.25 * s, y0 + 0.235 * s, z - Math.sin(ry) * 0.25 * s), c);
    if (a === 5) k.gl(0.2 * s, 0.012, 0.04, x, y0 + 0.27 * s, z, 0xff8a30);
    else k.gl(0.14 * s, 0.01, 0.05, x - 0.02, y0 + 0.27 * s, z, EMBER);
  };
  /** soufflet : deux planches, cuir plissé, poignée et buse vers le foyer */
  const bellows = (x: number, z: number, s = 1) => {
    k.bx(0.3 * s, 0.03, 0.2 * s, x, 0.1, z, DARKWOOD); sh(new THREE.CylinderGeometry(0.16 * s, 0.18 * s, 0.16 * s, 5, 2).scale(1, 1, 0.7).translate(x, 0.2 * s, z), 0x8a5a38); k.bx(0.3 * s, 0.03, 0.2 * s, x, 0.3 * s, z, DARKWOOD);
    k.rod(x, 0.3 * s, z + 0.05, x, 0.5 * s, z + 0.2 * s, DARKWOOD, 0.025); k.rod(x, 0.17, z - 0.1 * s, x + 0.22, 0.2, z - 0.3 * s, 0x5a5a64, 0.04);
  };
  /** tas de lingots : trois rangs en pyramide */
  const ingots = (x: number, z: number, ry = 0) => {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) {
      const g = new THREE.BoxGeometry(0.17, 0.06, 0.08).rotateY(ry).translate(x + (i - (2 - r) / 2) * 0.19 * Math.cos(ry), r * 0.062 + 0.03, z - (i - (2 - r) / 2) * 0.19 * Math.sin(ry));
      (a === 5 ? k.shine : k.solid).push(paint(g, metal, a === 5 ? undefined : (t) => 0.85 + t * 0.3));
    }
    if (a >= 2) k.bx(0.2, 0.012, 0.1, x, 0.0, z, 0x4a4650, ry);
  };
  /** bac de trempe : cuve, eau bleutée qui luit */
  const trough = (x: number, z: number, ry = 0) => { k.bx(0.4, 0.14, 0.2, x, 0, z, a <= 2 ? WOOD : 0x4a4a54, ry); k.gl(0.34, 0.01, 0.14, x, 0.14, z, 0x3a6aa8); };
  const grindstone = (x: number, z: number) => { k.rod(x - 0.07, 0, z, x - 0.04, 0.2, z, DARKWOOD, 0.03); k.rod(x + 0.07, 0, z, x + 0.04, 0.2, z, DARKWOOD, 0.03); sh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10).rotateZ(Math.PI / 2).translate(x, 0.2, z), 0x9a9aa4); };
  /** foyer : bloc de pierre ouvert qui rougeoie, flammes en haut */
  const hearth = (x: number, z: number, w = 0.5) => {
    k.bx(w, 0.3, 0.34, x, 0, z, a === 3 ? S.wall : STONE); k.bx(w + 0.06, 0.04, 0.38, x, 0.3, z, S.wall2);
    k.gl(w * 0.7, 0.14, 0.02, x, 0.07, z - 0.18, EMBER); k.flm(0.1, 0.26, x, 0.32, z); k.flm(0.06, 0.2, x + 0.1, 0.32, z, 0xffe070);
    k.st.fire = 0.5;
  };
  k.shadow(1.2, 1.15, 0, 0.15); k.pad(1.1, 1.05, 0, 0.15);

  if (a === 1) {
    // hutte de pierre et de rondins sous un toit en appentis, grande cheminée de pierres sèches, enclume sur souche, soufflet, lingots de cuivre
    k.bx(1.4, 0.7, 0.8, 0, 0, 0.55, STONE); for (let i = 0; i < 7; i++) k.bx(1.44, 0.02, 0.84, 0, 0.08 + i * 0.1, 0.55, 0x6a6672);
    k.rb(1.7, 0.05, 1.2, 0, 0.9, 0.25, 0xc8a850, -0.3); for (let i = 0; i < 8; i++) { const t = -0.52 + i * 0.15; k.rb(1.72, 0.02, 0.05, 0, 0.9 + 0.2955 * t + 0.03, 0.25 + 0.955 * t, 0x9a7a3a, -0.3); } k.rb(1.7, 0.03, 0.06, 0, 0.84, -0.3, DARKWOOD);
    for (const x of [-0.7, 0.7]) k.cy(0.05, 0.06, 0.95, 5, x, 0, -0.32, DARKWOOD);
    k.bx(0.4, 0.46, 0.4, 0.4, 0.4, 0.6, STONE); k.bx(0.3, 0.8, 0.3, 0.4, 0.8, 0.6, 0x6a6672); k.bx(0.4, 0.06, 0.4, 0.4, 1.6, 0.6, DARK); k.smoke.push([0.4, 1.75, 0.6]); k.sparks.push([0.4, 1.7, 0.6]);
    k.gl(0.34, 0.06, 0.02, 0.4, 1.62, 0.4, EMBER);
    hearth(0.0, 0.2, 0.6); anvil(-0.45, -0.45, 1.2); bellows(0.5, -0.1); ingots(0.78, -0.55); trough(-0.85, -0.2, 0.2); grindstone(0.95, -0.25);
    k.door(-0.5, 0.15, 0.3, 0.4); k.win(0.45, 0.25, 0.14, 0.15, 0.17);
    for (let i = 0; i < 4; i++) k.rod(-0.55 + i * 0.12, 0.62, 0.14, -0.55 + i * 0.12, 0.38, 0.14, 0x5a4a44, 0.02);
    k.shield(-0.1, 0.5, 0.14, 0.9, BLUE); k.tools(-0.95, 0.5); k.crates(-0.95, -0.8, 2, 0.2); k.barrels(0.9, -0.9, 2); k.sacks(0.3, -0.95, 2);
    k.stakes(-0.5, -1.05, 0.5, -1.05, 5); k.lamp(-0.2, -0.85, 0.55); k.lamp(0.2, -0.85, 0.55); k.planks(0.0, 1.0);
    k.pole(1.05, -0.45, 1.55);
  } else if (a === 2) {
    // forge de pierre : haute cheminée crénelée, voûte ouverte sur le foyer, enclume, soufflet géant, râtelier d'épées, armure sur mannequin
    k.bx(1.5, 0.8, 0.9, 0, 0, 0.55, STONE); k.crenels(1.5, 0.9, 0, 0.8, 0.55, S.wall2, 6, 0.12); k.bx(1.56, 0.06, 0.96, 0, 0.76, 0.55, S.wall2);
    k.gable(1.1, 0.32, 0.7, 0, 0.86, 0.6, S.roof, 0, true, 'rows');
    k.bx(0.4, 1.35, 0.4, 0.45, 0.4, 0.75, S.wall2); k.crenels(0.5, 0.5, 0.45, 1.75, 0.75, DARK, 3, 0.1); k.bx(0.5, 0.06, 0.5, 0.45, 1.72, 0.75, DARK);
    k.cy(0.12, 0.12, 0.02, 6, 0.45, 1.84, 0.75, EMBER); k.gcy(0.1, 0.02, 6, 0.45, 1.86, 0.75, EMBER); k.smoke.push([0.45, 2.0, 0.75]); k.sparks.push([0.45, 1.95, 0.75]);
    hearth(0.0, 0.18, 0.7); k.bx(0.12, 0.45, 0.4, -0.4, 0.0, 0.18, STONE); k.bx(0.12, 0.45, 0.4, 0.4, 0.0, 0.18, STONE);
    anvil(-0.45, -0.5, 1.25); bellows(0.5, -0.12, 1.2); ingots(0.75, -0.6); trough(-0.9, -0.15, 0.1); grindstone(0.98, -0.2);
    for (let i = 0; i < 4; i++) { k.rod(-0.3 + i * 0.2, 0.2, 0.1, -0.3 + i * 0.2, 0.55, 0.1, 0xd0d4dc, 0.025); k.bx(0.08, 0.02, 0.02, -0.3 + i * 0.2, 0.26, 0.1, GOLD); }
    k.shield(-0.7, 0.55, 0.1, 1, BLUE); k.shield(0.7, 0.55, 0.1, 1, GOLD); k.banner(-0.55, 0.0, 0.1, 0.2, 0.5, BLUE);
    // armure sur mannequin
    k.cy(0.02, 0.02, 0.5, 4, 0.88, 0, -0.75, DARKWOOD); k.cy(0.09, 0.07, 0.2, 6, 0.88, 0.24, -0.75, 0xa8acb4); k.sph(0.07, 0.07, 0.07, 0.88, 0.5, -0.75, 0xb8bcc4); k.cn(0.012, 0.07, 3, 0.88, 0.57, -0.75, RED2);
    k.crates(-0.95, -0.9, 3, 0.2); k.barrels(0.2, -1.0, 3); k.lamp(-0.15, -0.75, 0.55); k.lamp(0.2, -0.65, 0.55); k.tools(-1.2, 0.4, -0.25);
    k.fig(0.0, 0, -0.55, 0, 'hammer');
    k.bunting(-0.7, -1.05, 0.7, -1.05, 0.45, 8, 0.07); k.pole(1.15, -0.5, 1.65);
  } else if (a === 3) {
    // fonderie de brique : très haute cheminée d'usine qui fume, four rougeoyant, marteau-pilon, wagonnet de minerai sur rails, tuyauterie, tas de charbon
    k.bx(1.5, 0.65, 0.95, 0, 0, 0.55, S.wall); k.bx(1.58, 0.07, 1.03, 0, 0.65, 0.55, S.wall2); k.bx(1.55, 0.05, 1.0, 0, 0, 0.55, S.wall2);
    for (let i = 0; i < 3; i++) { k.rb(1.58, 0.04, 0.5, 0, 0.88, 0.2 + i * 0.32, i % 2 ? 0x8a9098 : S.roof, 0.65 * (i % 2 ? -1 : 1)); }
    for (let i = 0; i < 5; i++) k.bx(0.02, 0.2, 0.02, -0.7 + i * 0.35, 0.65, 0.3, DARK);
    k.cy(0.12, 0.17, 1.9, 8, 0.5, 0.4, 0.8, S.wall); k.cy(0.16, 0.12, 0.09, 8, 0.5, 2.25, 0.8, DARK);
    for (const y of [0.9, 1.5, 2.0]) k.cy(0.145 - y * 0.014, 0.145 - y * 0.014, 0.03, 8, 0.5, y, 0.8, DARK);
    k.smoke.push([0.5, 2.4, 0.8]); k.smoke.push([0.5, 2.4, 0.8]); k.sparks.push([0.5, 2.35, 0.8]);
    k.cy(0.05, 0.05, 0.5, 5, -0.5, 0.65, 0.55, 0x4a4650); k.cy(0.065, 0.065, 0.04, 5, -0.5, 1.12, 0.55, DARK); k.smoke.push([-0.5, 1.22, 0.55]);
    hearth(0.0, 0.18, 0.8); k.bx(0.8, 0.08, 0.06, 0.0, 0.44, 0.0, DARK); k.gl(0.16, 0.2, 0.02, -0.3, 0.1, 0.08, EMBER); k.gl(0.16, 0.2, 0.02, 0.3, 0.1, 0.08, EMBER);
    for (const x of [-0.5, 0.5]) k.win(x, 0.3, 0.075, 0.18, 0.2);
    // marteau-pilon : portique, tête, enclume
    k.bx(0.05, 0.6, 0.05, -0.95, 0, -0.5, 0x3a3a42); k.bx(0.05, 0.6, 0.05, -0.55, 0, -0.5, 0x3a3a42); k.bx(0.5, 0.06, 0.1, -0.75, 0.6, -0.5, 0x3a3a42); k.bx(0.1, 0.1, 0.1, -0.75, 0.25, -0.5, 0x5a5e66); k.rod(-0.75, 0.35, -0.5, -0.75, 0.6, -0.5, IRON, 0.03); anvil(-0.75, -0.5, 1.0);
    // wagonnet sur rails, minerai
    k.bx(1.4, 0.02, 0.03, 0.1, 0, -0.75, 0x5a5a64); k.bx(1.4, 0.02, 0.03, 0.1, 0, -0.95, 0x5a5a64); for (let i = 0; i < 9; i++) k.bx(0.03, 0.018, 0.3, -0.5 + i * 0.16, 0, -0.85, 0x4a3a28);
    k.bx(0.4, 0.2, 0.22, 0.55, 0.06, -0.85, 0x7a3a2a); for (const s of [-1, 1]) k.cy(0.05, 0.05, 0.03, 8, 0.55 + s * 0.12, 0.0, -0.75, DARK, Math.PI / 2); for (let i = 0; i < 4; i++) sh(new THREE.DodecahedronGeometry(0.06, 0).translate(0.47 + i * 0.05, 0.3, -0.85 + (i % 2) * 0.03), 0x5a4a50);
    ingots(0.05, -0.55); trough(0.95, -0.25, 0); for (let i = 0; i < 6; i++) sh(new THREE.DodecahedronGeometry(0.07, 0).translate(1.0 + (i % 3) * 0.09, 0.04 + Math.floor(i / 3) * 0.06, 0.15 + (i % 2) * 0.1), 0x2a2a30);
    k.banner(0.0, 0.0, 0.07, 0.16, 0.34, BLUE); k.crates(1.0, -0.6, 3, 0.2); k.barrels(-1.15, -0.1, 3); k.lamp(-0.3, -1.1, 0.6); k.lamp(0.3, -1.1, 0.6); k.planks(0.0, 1.1);
    k.pole(1.1, -1.0, 1.5); k.bunting(-1.0, -1.1, 1.1, -1.0, 0.5, 7, 0.05);
  } else if (a === 4) {
    // aciérie : halle de béton à bandes jaunes, silos, torchère, portique à grue, lingots sur palette, tuyauterie, fenêtres de four lumineuses
    k.bx(1.55, 0.68, 0.95, 0, 0, 0.55, S.wall); k.bx(1.62, 0.08, 1.03, 0, 0.68, 0.55, 0x6c6e72);
    for (let i = 0; i < 5; i++) k.bx(0.03, 0.68, 0.03, -0.7 + i * 0.35, 0, 0.06, 0xe0b030);
    k.win(-0.6, 0.45, 0.07, 0.2, 0.12, -1, WARM); k.win(0.0, 0.45, 0.07, 0.2, 0.12, -1, WARM); k.win(0.6, 0.45, 0.07, 0.2, 0.12, -1, WARM);
    hearth(0.0, -0.05, 0.9); k.gl(0.5, 0.2, 0.02, 0.0, 0.08, -0.22, EMBER);
    k.cy(0.18, 0.18, 1.1, 10, 0.55, 0.76, 0.6, 0xc8ccd0); k.cn(0.19, 0.14, 10, 0.55, 1.86, 0.6, 0x8a8e94); k.cy(0.18, 0.18, 1.1, 10, 0.2, 0.76, 0.85, 0xb8bcc4); k.cn(0.19, 0.14, 10, 0.2, 1.86, 0.85, 0x8a8e94);
    for (const y of [1.0, 1.4]) { k.cy(0.185, 0.185, 0.03, 10, 0.55, y, 0.6, 0xe0b030); k.cy(0.185, 0.185, 0.03, 10, 0.2, y, 0.85, 0xe0b030); }
    k.cy(0.05, 0.05, 0.6, 6, -0.45, 0.76, 0.5, 0x4a4650); k.smoke.push([-0.45, 1.45, 0.5]); k.smoke.push([0.2, 2.1, 0.85]);
    k.cy(0.016, 0.022, 1.5, 5, -0.9, 0, 0.1, 0x8a8e94); k.flm(0.07, 0.22, -0.9, 1.5, 0.1); k.sparks.push([-0.9, 1.78, 0.1]); k.gl(0.06, 0.06, 0.06, -0.9, 1.4, 0.1, 0xff6020);
    k.rod(0.55, 0.76, 0.6, 0.2, 0.76, 0.85, 0x6a6e74, 0.05); k.rod(0.55, 1.4, 0.6, 0.2, 1.4, 0.85, 0x6a6e74, 0.04);
    // portique à grue
    k.bx(0.05, 0.6, 0.05, -0.95, 0, -0.55, 0xe0b030); k.bx(0.05, 0.6, 0.05, 0.1, 0, -0.55, 0xe0b030); k.bx(1.15, 0.05, 0.08, -0.4, 0.6, -0.55, 0xe0b030);
    k.rod(-0.4, 0.6, -0.55, -0.4, 0.32, -0.55, 0x2a2a30, 0.012); k.bx(0.16, 0.06, 0.08, -0.4, 0.28, -0.55, 0x2a2a30); k.bx(0.3, 0.08, 0.1, -0.4, 0.2, -0.55, 0xd8d8d8);
    k.bx(0.5, 0.04, 0.36, 0.7, 0, -0.6, 0x8a6a3a); ingots(0.7, -0.6); ingots(0.7, -0.6); k.bx(0.5, 0.04, 0.36, 0.7, 0.19, -0.6, 0x8a6a3a); ingots(0.7, -0.6);
    k.crates(-1.15, -0.2, 3, 0.2); k.barrels(1.12, 0.2, 3); k.cn(0.05, 0.13, 6, 0.9, 0, -1.0, 0xff7a20); k.cn(0.05, 0.13, 6, -0.9, 0, -1.0, 0xff7a20);
    k.lamp(-0.25, -1.0, 0.65); k.lamp(0.45, -1.0, 0.65); k.pole(1.1, -1.0, 1.55); k.fence(-1.2, -1.15, 1.2, -1.15, 0.25);
    k.fig(-0.15, 0, -0.9, 0, 'hammer');
  } else {
    // forge à plasma : coque blanche lisse, creuset d'énergie qui rayonne, bras mécaniques à étincelles, hologramme d'enclume, lingots lumineux
    k.cy(0.82, 0.92, 0.34, 10, 0, 0, 0.35, S.wall); k.dome(0.65, 0, 0.34, 0.35, 0xeef2f8, 0.8, 12);
    k.gtor(0.92, 0.02, 0, 0.26, 0.35, 0xff8a30, Math.PI / 2, 26); k.gtor(0.62, 0.016, 0, 0.5, 0.35, CYAN, Math.PI / 2, 20);
    k.cy(0.2, 0.26, 0.16, 10, 0, 0.8, 0.35, 0xcfd6e0); k.gcy(0.17, 0.03, 10, 0, 0.96, 0.35, 0xff8a30); k.flm(0.12, 0.34, 0, 0.99, 0.35, 0xff8a30); k.flm(0.07, 0.28, 0.05, 0.99, 0.38, 0xffe070);
    k.st.fire = 1.0; k.smoke.push([0.0, 1.35, 0.35]); k.sparks.push([0.0, 1.3, 0.35]);
    k.door(0.0, -0.45, 0.34, 0.44); k.gl(0.4, 0.2, 0.02, 0.0, 0.1, -0.5, 0xff8a30);
    for (const s of [-1, 1]) { k.cy(0.07, 0.09, 0.8, 6, s * 0.55, 0, 0.9, 0xdfe6ee); k.gtor(0.09, 0.012, s * 0.55, 0.5, 0.9, CYAN, Math.PI / 2, 10); k.gl(0.1, 0.03, 0.1, s * 0.55, 0.82, 0.9, CYAN); k.smoke.push([s * 0.55, 0.95, 0.9]); }
    // bras mécaniques articulés
    for (const s of [-1, 1]) { k.cy(0.05, 0.06, 0.3, 6, s * 0.78, 0, -0.4, 0xdfe6ee); k.rod(s * 0.78, 0.3, -0.4, s * 0.5, 0.52, -0.62, 0xcfd6e0, 0.05); k.rod(s * 0.5, 0.52, -0.62, s * 0.3, 0.34, -0.8, 0xcfd6e0, 0.04); k.gl(0.06, 0.06, 0.06, s * 0.3, 0.3, -0.8, 0xff8a30); k.sparks.push([s * 0.3, 0.4, -0.8]); }
    k.holo(-0.0, 0.0, -0.85, 0xff8a30, 1.2);
    ingots(0.75, -0.8); ingots(-0.75, -0.95); trough(1.0, -0.2, 0.0); k.crates(-1.1, -0.2, 3, 0.18); k.barrels(1.1, 0.4, 2);
    k.lamp(-0.4, -1.05, 0.5); k.lamp(0.4, -1.05, 0.5); k.fence(-1.2, -1.2, -0.5, -1.2, 0.22); k.fence(0.5, -1.2, 1.2, -1.2, 0.22);
    k.pole(1.1, -0.9, 1.5);
    k.bubble(1.05, 0, 0.35, 0xff9a50);
    k.fig(0.0, 0, -0.62, 0, 'hammer');
  }
  void BLUE; void DARK; void WOOD; void MAGENTA; void WARM; void WHITE;
}
const RED2 = 0xd8443a;
