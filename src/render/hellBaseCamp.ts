import * as THREE from 'three';
import { paint } from './battleUnits';
import { Kit, BLUE, CLOTH, WHITE, GOLD, DARK, DARKWOOD, WOOD, STONE, CYAN, MAGENTA, EMBER, WARM, IRON } from './hellBaseKit';

/** Le camp de base : le cœur de la base, de la grande tente de bois au moyeu futuriste (la face, le feu et les stocks restent au même endroit) */
export function buildCamp(k: Kit) {
  const { a, S } = k;
  const sh = (g: THREE.BufferGeometry, c: number) => k.solid.push(paint(g, c, (t) => 0.8 + t * 0.3));
  /** rondin couché (siège) */
  const log = (x: number, z: number, ry = 0, r = 0.07, len = 0.36) => sh(new THREE.CylinderGeometry(r, r, len, 6).rotateZ(Math.PI / 2).rotateY(ry).translate(x, r, z), a === 1 ? DARKWOOD : 0x7a5a38);
  /** trépied de cuisine et marmite */
  const pot = (x: number, z: number) => {
    for (let i = 0; i < 3; i++) { const t = i * 2.1 + 0.4; k.rod(x + Math.sin(t) * 0.14, 0, z + Math.cos(t) * 0.14, x, 0.5, z, DARKWOOD, 0.022); }
    k.rod(x, 0.5, z, x, 0.36, z, DARK, 0.008);
    sh(new THREE.SphereGeometry(0.12, 8, 5).scale(1, 0.8, 1).translate(x, 0.3, z), 0x3a3a42);
    k.cy(0.13, 0.13, 0.02, 8, x, 0.36, z, 0x5a5a64);
    k.firepit(x, z, 0.1, 0.5);
  };
  k.shadow(1.6, 1.35, 0, 0.25);
  k.pad(1.4, 1.15, 0, 0.25);

  if (a === 1) {
    // grande tente de commandement à bandes bleues et blanches, deux tentes dorées, feu de camp au milieu, deux mâts reliés de fanions
    k.tent(0, 0.78, 1.3, 1.05, 0.9, CLOTH, BLUE, 8);
    k.flags.push([0, 1.1, 0.78]);
    for (const s of [-1, 1]) k.tent(s * 1.02, 0.35, 0.72, 0.85, 0.58, CLOTH, 0xd8a840, 6);
    k.firepit(0, -0.42, 0.27, 1.35); k.st.fire = 0.45;
    log(-0.62, -0.42, 0.2); log(0.62, -0.42, -0.2); log(0, -0.95, Math.PI / 2 - 0.05);
    pot(-0.35, 0.12); k.rack(0.38, 0.12, 4, 0.5);
    k.pole(1.18, -0.78, 1.8); k.pole(-1.18, -0.78, 1.55);
    k.bunting(-1.18, -0.78, 1.18, -0.78, 1.35, 14, 0.22);
    k.crates(-1.05, -0.28, 3, 0.22); k.barrels(0.98, -0.3, 3); k.sacks(-0.62, -0.95, 3); k.hay(1.0, -0.98, 1.1);
    k.fence(-1.4, -1.12, -0.55, -1.12, 0.32); k.fence(0.55, -1.12, 1.4, -1.12, 0.32);
    k.lamp(-0.45, -1.1, 0.6); k.lamp(0.45, -1.1, 0.6); k.planks(0.85, 0.85, 0.3); k.tools(-1.35, 0.75);
    k.shield(-0.55, 0.3, 0.25, 1, BLUE); k.shield(0.55, 0.3, 0.25, 1, GOLD);
  } else if (a === 2) {
    // pavillon seigneurial à quartiers bleus et blancs, courtine de pierre crénelée à tourelles, tentes, bannières, feu en cuve de pierre
    k.bx(2.8, 0.55, 0.16, 0, 0, 1.2, STONE); k.crenels(2.8, 0.16, 0, 0.55, 1.2, S.wall2, 10, 0.12);
    k.bx(2.9, 0.06, 0.24, 0, 0.5, 1.2, S.wall2);
    for (const s of [-1, 1]) { k.cy(0.24, 0.27, 0.95, 8, s * 1.4, 0, 1.2, STONE); k.cy(0.29, 0.25, 0.08, 8, s * 1.4, 0.92, 1.2, S.wall2); k.cn(0.28, 0.42, 8, s * 1.4, 1.0, 1.2, S.roof); k.gl(0.05, 0.2, 0.02, s * 1.4, 0.55, 0.93, WARM); k.flags.push([s * 1.4, 1.52, 1.2]); }
    k.cy(0.84, 0.88, 0.34, 10, 0, 0, 0.6, 0xcfc8b4); k.pavilion(0, 0.6, 0.98, 1.0, BLUE, CLOTH, 10, 0.34);
    k.bx(0.3, 0.4, 0.05, 0, 0, -0.27, DARKWOOD); k.gl(0.05, 0.12, 0.02, 0.0, 0.2, -0.3, WARM);
    k.flags.push([0, 1.62, 0.6]);
    for (const s of [-1, 1]) { k.tent(s * 1.1, 0.3, 0.72, 0.8, 0.58, CLOTH, 0xd8a840, 6); k.pole(s * 0.62, -0.78, 1.7); k.shield(s * 0.45, 0.3, 0.26, 1, s < 0 ? BLUE : GOLD); }
    k.bunting(-0.62, -0.78, 0.62, -0.78, 1.45, 10, 0.18);
    k.firepit(0, -0.4, 0.24, 1.2); k.st.fire = 0.42; k.cy(0.3, 0.32, 0.12, 8, 0, 0, -0.4, STONE); k.cy(0.24, 0.24, 0.03, 8, 0, 0.12, -0.4, 0x2a1e1c);
    for (const x of [-0.7, 0.7]) log(x, -0.4, Math.PI / 2, 0.07, 0.34);
    k.banner(-0.55, 0.12, 1.1, 0.26, 0.5, BLUE, -1); k.banner(0.55, 0.12, 1.1, 0.26, 0.5, BLUE, -1); k.shield(-1.0, 0.3, 1.1, 1, BLUE); k.shield(1.0, 0.3, 1.1, 1, GOLD);
    k.rack(1.2, -0.45, 4, 0.5); k.crates(-1.2, -0.6, 3, 0.2); k.barrels(1.15, -0.95, 2); k.sacks(-0.75, -1.02, 3); k.lamp(-0.3, -1.05, 0.6); k.lamp(0.3, -1.05, 0.6);
    k.fence(-1.4, -1.15, -0.5, -1.15, 0.3); k.fence(0.5, -1.15, 1.4, -1.15, 0.3); k.tools(-1.4, 0.0, -0.25);
  } else if (a === 3) {
    // baraque de brique sous tôle à deux cheminées, chaudière à vapeur, poteau télégraphique, tentes de chantier, chariot, baril en feu
    k.bx(2.2, 0.62, 0.9, 0, 0, 0.78, S.wall); k.bx(2.3, 0.07, 1.0, 0, 0.62, 0.78, S.wall2); k.bx(2.3, 0.05, 1.0, 0, 0, 0.78, S.wall2);
    k.gable(2.4, 0.5, 1.2, 0, 0.67, 0.78, S.roof);
    for (let i = 0; i < 9; i++) { const x = -1.02 + i * 0.255; k.rb(0.03, 0.02, 0.62, x, 0.95 - 0.02, 0.45, 0x2a4a88, 0.78); k.rb(0.03, 0.02, 0.62, x, 0.95 - 0.02, 1.11, 0x2a4a88, -0.78); }
    k.chimney(0.55, 0.8, 0.9, 0.7, 0.18, S.wall); k.chimney(-0.5, 0.8, 0.9, 0.55, 0.16, S.wall); k.sparks.push([0.55, 1.58, 0.9]);
    k.door(0, 0.31, 0.32, 0.45); k.steps(0, 0.28, 0.5, 2);
    for (const x of [-0.7, -0.38, 0.38, 0.7]) k.win(x, 0.3, 0.31, 0.16, 0.22);
    k.bx(0.62, 0.12, 0.03, 0, 0.5, 0.28, 0xe8e0c8); k.gl(0.5, 0.06, 0.02, 0, 0.53, 0.265, WARM);
    k.banner(-0.98, 0.08, 0.29, 0.2, 0.42, BLUE); k.banner(0.98, 0.08, 0.29, 0.2, 0.42, BLUE);
    sh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 10).rotateX(Math.PI / 2).translate(-1.15, 0.3, -0.1), 0x8a3a2a);
    for (const z of [-0.3, 0.1]) k.cy(0.215, 0.215, 0.04, 10, -1.15, 0.3, z, DARK, 0);
    k.cy(0.05, 0.06, 0.45, 6, -1.15, 0.45, -0.28, DARK); k.smoke.push([-1.15, 0.98, -0.28]); k.gl(0.1, 0.06, 0.02, -1.15, 0.12, -0.46, EMBER);
    k.rod(-1.15, 0.45, 0.2, -0.85, 0.6, 0.55, 0x5a5a64, 0.03);
    k.tent(1.0, 0.0, 0.62, 0.7, 0.5, CLOTH, BLUE, 6);
    // télégraphe : fût, traverses, isolateurs, fils jusqu'au toit
    k.cy(0.025, 0.035, 1.5, 5, 1.25, 0, -0.55, DARKWOOD); k.bx(0.5, 0.035, 0.035, 1.25, 1.3, -0.55, DARKWOOD); k.bx(0.34, 0.03, 0.03, 1.25, 1.1, -0.55, DARKWOOD);
    for (const x of [-0.2, 0, 0.2]) k.cy(0.012, 0.012, 0.06, 4, 1.25 + x, 1.32, -0.55, 0xd8f0e8);
    k.rod(1.25, 1.36, -0.55, 0.6, 0.95, 0.8, 0x2a2a30, 0.006); k.rod(1.45, 1.36, -0.55, 0.9, 0.95, 0.8, 0x2a2a30, 0.006);
    k.flags.push([1.25, 1.6, -0.55]); k.cy(0.015, 0.015, 0.3, 4, 1.25, 1.5, -0.55, DARKWOOD);
    k.firepit(0, -0.5, 0.0, 0.01); k.cy(0.16, 0.17, 0.42, 8, 0, 0, -0.55, 0x9a3a2a); k.cy(0.175, 0.175, 0.025, 8, 0, 0.14, -0.55, DARK); k.cy(0.175, 0.175, 0.025, 8, 0, 0.28, -0.55, DARK);
    k.flm(0.13, 0.32, 0, 0.42, -0.55, EMBER); k.st.fire = 0.45; k.smoke.push([0.0, 0.9, -0.55]); k.sparks.push([0, 0.8, -0.55]);
    k.bx(0.5, 0.14, 0.28, -0.55, 0.1, -0.92, WOOD); for (const x of [-0.7, -0.4]) k.cy(0.09, 0.09, 0.03, 8, x, 0.0, -0.78, DARK, Math.PI / 2); k.rod(-0.3, 0.2, -0.92, 0.0, 0.1, -0.95, DARK, 0.03);
    k.crates(0.72, -0.9, 3, 0.22); k.barrels(1.05, -1.0, 3); k.planks(-0.9, -1.0, 0.2); k.lamp(-0.3, -1.0, 0.7); k.lamp(0.35, -1.0, 0.7); k.tools(-1.35, 0.55);
    k.pole(-1.3, -0.95, 1.5); k.bunting(-1.3, -0.95, -0.3, -1.0, 1.3, 7, 0.12);
  } else if (a === 4) {
    // poste de commandement : bunker de béton sous filet de camouflage, mâts et radar, tentes kaki, jeep, projecteurs, ceinture de sacs de sable
    k.bx(2.2, 0.55, 0.95, 0, 0, 0.8, S.wall); k.bx(2.3, 0.07, 1.05, 0, 0.55, 0.8, 0x7a7e84);
    k.bx(2.0, 0.025, 0.85, 0, 0.62, 0.8, 0x6a7350); for (const x of [-0.6, 0.55]) k.pyr(0.8, 0.22, 0.7, x, 0.62, 0.78, 0x6a7a4a);
    k.door(0.55, 0.31, 0.34, 0.42); k.steps(0.55, 0.28, 0.5, 2);
    for (const x of [-0.8, -0.3]) k.gl(0.3, 0.1, 0.02, x, 0.26, 0.3, 0xffe8a0); k.bx(0.34, 0.03, 0.04, -0.55, 0.36, 0.29, DARK);
    k.bx(2.2, 0.04, 0.02, 0, 0.14, 0.3, 0xe0b030); k.banner(-1.0, 0.1, 0.29, 0.18, 0.38, BLUE);
    k.bx(0.3, 0.2, 0.26, 0.9, 0.62, 1.0, 0x8a8e94); k.bx(0.4, 0.12, 0.3, -0.95, 0.62, 1.0, 0x6a7a4a); k.cy(0.05, 0.05, 0.2, 6, 0.9, 0.82, 1.0, 0x5a5e66);
    k.mast(1.05, 0.62, 0.7, 1.15); k.dish(-0.2, 0.62, 0.95, 1.3); k.mast(-0.65, 0.62, 1.15, 0.75);
    k.sandbags(0, -0.95, 10, 0, 3); k.sandbags(-1.4, -0.2, 5, Math.PI / 2, 2); k.sandbags(1.4, -0.2, 5, Math.PI / 2, 2);
    k.tent(-0.95, 0.12, 0.7, 0.75, 0.5, 0x6a7a4a, 0xa8a07a, 6); k.tent(0.9, 0.15, 0.7, 0.75, 0.5, 0x6a7a4a, 0xa8a07a, 6);
    // jeep : caisse, cabine, quatre roues, étoile
    k.bx(0.55, 0.16, 0.28, 0.0, 0.1, -0.35, 0x5a6a3a); k.bx(0.26, 0.12, 0.26, -0.08, 0.26, -0.35, 0x5a6a3a); k.gl(0.2, 0.06, 0.02, -0.08, 0.28, -0.49, 0x9ad0e8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cy(0.07, 0.07, 0.05, 8, sx * 0.2, 0.07 * 0 + 0.0, -0.35 + sz * 0.15, 0x2a2a30, 0); k.bx(0.1, 0.012, 0.1, 0.12, 0.27, -0.35, 0xd8d8d8);
    for (const x of [-0.5, 0.5]) { k.cy(0.014, 0.016, 0.5, 4, x, 0.0, -0.95, 0x3a3e44); k.bx(0.2, 0.08, 0.06, x, 0.5, -0.95, 0x3a3e44); k.gl(0.17, 0.06, 0.02, x, 0.51, -1.0, 0xfff4d0); }
    k.barrels(1.15, -0.55, 3); k.crates(-1.3, -0.7, 3, 0.2); k.cn(0.05, 0.13, 6, 0.3, 0, -0.75, 0xff7a20); k.cn(0.05, 0.13, 6, 0.62, 0, -0.78, 0xff7a20);
    k.pole(1.3, -0.95, 1.65); k.pole(-1.3, -0.95, 1.4); k.st.fire = 0.5; k.sparks.push([0.55, 0.9, 0.8]); k.smoke.push([0.9, 0.9, 1.0]);
  } else {
    // moyeu futuriste : dôme de métal blanc cerclé de néon, hologramme au-dessus d'une table de commandement, pavillons-capsules à bandes, pylônes, bouclier d'énergie
    k.cy(0.95, 1.05, 0.2, 12, 0, 0, 0.7, 0xcfd6e0); k.dome(0.75, 0, 0.2, 0.7, 0xeaf0f8, 0.85, 12);
    k.gtor(1.0, 0.02, 0, 0.15, 0.7, CYAN, Math.PI / 2, 28); k.gtor(0.62, 0.016, 0, 0.62, 0.7, MAGENTA, Math.PI / 2, 22);
    for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; k.gl(0.04, 0.3, 0.04, Math.sin(t) * 0.74, 0.2 + 0.0, 0.7 + Math.cos(t) * 0.74, i % 2 ? CYAN : MAGENTA); }
    k.bx(0.34, 0.34, 0.05, 0, 0.1, 0.0, 0x2a3446); k.gl(0.26, 0.26, 0.02, 0, 0.14, -0.03, CYAN); k.steps(0, -0.12, 0.5, 2);
    k.holo(0, 0.95, 0.7, CYAN, 1.5);
    k.dish(0.45, 0.78, 0.75, 1); k.dish(-0.5, 0.78, 0.7, 0.8);
    // capsules à bandes (deux de chaque côté), pylônes à néon
    for (const [x, z, s] of [[-1.25, 0.05, 1], [1.25, 0.05, 1], [-1.35, 0.85, 0.8], [1.35, 0.85, 0.8]] as const) {
      k.cy(0.36 * s, 0.4 * s, 0.1, 10, x, 0, z, 0xcfd6e0);
      for (let i = 0; i < 6; i++) k.solid.push(paint(new THREE.SphereGeometry(0.34 * s, 3, 5, (i / 6) * Math.PI * 2, Math.PI / 3, 0, Math.PI / 2).scale(1, 1.1, 1).translate(x, 0.1, z), i % 2 ? CYAN : WHITE, (t) => 0.85 + t * 0.2));
      k.gtor(0.4 * s, 0.014, x, 0.06, z, i0(s), Math.PI / 2, 16); k.gl(0.1, 0.16, 0.02, x, 0.04, z - 0.3 * s, 0x7af0ff);
    }
    for (const s of [-1, 1]) { k.cy(0.05, 0.1, 1.1, 6, s * 0.75, 0, -0.55, 0xdfe6ee); k.gtor(0.09, 0.012, s * 0.75, 0.55, -0.55, CYAN, Math.PI / 2, 10); k.gtor(0.07, 0.012, s * 0.75, 0.85, -0.55, MAGENTA, Math.PI / 2, 10); k.gl(0.05, 0.05, 0.05, s * 0.75, 1.1, -0.55, CYAN); k.flags.push([s * 0.75, 1.2, -0.55]); k.cy(0.01, 0.01, 0.2, 4, s * 0.75, 1.1, -0.55, 0xdfe6ee); }
    k.crates(-0.95, -0.95, 3, 0.2); k.barrels(1.0, -0.95, 3); k.lamp(-0.4, -1.05, 0.55); k.lamp(0.4, -1.05, 0.55); k.tools(0.3, -0.95); k.fence(-1.45, -1.1, -0.55, -1.1, 0.26); k.fence(0.55, -1.1, 1.45, -1.1, 0.26);
    k.strings(-0.75, -0.55, 0.75, -0.55, 1.0, 8);
    k.spin(0, 0.7, paint(new THREE.OctahedronGeometry(0.05).translate(0.9, 1.25, 0), WHITE)); k.spin(0, 0.7, paint(new THREE.OctahedronGeometry(0.05).translate(-0.9, 1.3, 0), CYAN));
    k.pole(1.3, -0.95, 1.7);
    k.bubble(1.7, 0, 0.35); k.st.fire = 0.55; k.sparks.push([0, 1.3, 0.7]); k.smoke.push([0.7, 1.0, 0.7]);
  }
  void IRON; void MAGENTA; void WOOD; void CYAN; void WARM;
}
const i0 = (s: number) => (s > 0.9 ? 0x40f0ff : 0xff50d0);
