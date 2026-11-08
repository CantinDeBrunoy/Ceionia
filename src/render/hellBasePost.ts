import * as THREE from 'three';
import { paint } from './battleUnits';
import { Kit, BLUE, CLOTH, WHITE, GOLD, DARK, DARKWOOD, WOOD, STONE, CYAN, MAGENTA, RED, WARM, EMBER } from './hellBaseKit';

/** La caserne avancée : un long bâtiment, des mannequins et des râteliers d'armes dans la cour d'entraînement */
export function buildPost(k: Kit) {
  const { a, S } = k;
  const sh = (g: THREE.BufferGeometry, c: number) => k.solid.push(paint(g, c, (t) => 0.8 + t * 0.3));
  /** mannequin d'entraînement : poteau, bras en croix, tête de paille casquée, bouclier ; cible à silhouette (4), drone d'exercice (5) */
  const dummy = (x: number, z: number, ry = 0) => {
    if (a === 5) {
      k.cy(0.015, 0.02, 0.3, 5, x, 0, z, 0xdfe6ee); k.gcy(0.07, 0.015, 8, x, 0.0, z, CYAN);
      k.spin(x, z, paint(new THREE.OctahedronGeometry(0.1).scale(1, 1.2, 1).translate(0, 0.55, 0), 0xff6a8a));
      k.spin(x, z, paint(new THREE.TorusGeometry(0.17, 0.008, 4, 14).rotateX(Math.PI / 2).translate(0, 0.55, 0), CYAN));
      return;
    }
    if (a === 4) {
      k.rod(x, 0, z, x, 0.5, z, 0x5a5e66, 0.03); k.bx(0.26, 0.4, 0.025, x, 0.28, z - 0.02, 0xc8b88a, ry);
      sh(new THREE.CircleGeometry(0.08, 8).translate(x, 0.52, z - 0.034), 0x3a3a42); k.gl(0.14, 0.14, 0.01, x - 0.07, 0.3, z - 0.045, 0xe8e0c8);
      return;
    }
    k.cy(0.028, 0.034, 0.52, 5, x, 0, z, DARKWOOD); k.bx(0.4, 0.045, 0.045, x, 0.34, z, DARKWOOD, ry);
    k.sph(0.075, 0.08, 0.075, x, 0.62, z, 0xdcc07a); k.sph(0.09, 0.07, 0.09, x, 0.3, z, 0xcdb078);
    if (a === 1) k.dome(0.085, x, 0.62, z, 0xc08a3a, 0.9, 6); else { k.dome(0.088, x, 0.62, z, 0xa8acb4, 0.95, 7); k.cn(0.012, 0.07, 3, x, 0.7, z, RED); }
    k.shield(x - 0.15, 0.34, z, 0.8, a === 1 ? BLUE : 0x8a3a3a); k.rod(x + 0.12, 0.3, z - 0.02, x + 0.12, 0.55, z - 0.02, 0x7a5a38, 0.016);
  };
  /** cible d'archerie sur chevalet : disques rouge et blanc */
  const target = (x: number, z: number) => {
    k.rod(x - 0.1, 0, z + 0.08, x, 0.34, z, DARKWOOD, 0.03); k.rod(x + 0.1, 0, z + 0.08, x, 0.34, z, DARKWOOD, 0.03);
    for (const [r, c, o] of [[0.15, WHITE, 0], [0.1, RED, 0.004], [0.05, WHITE, 0.008], [0.02, GOLD, 0.012]] as const) sh(new THREE.CylinderGeometry(r, r, 0.03, 12).rotateX(Math.PI / 2).translate(x, 0.34, z - 0.02 - o), c);
    k.rod(x + 0.03, 0.36, z - 0.05, x + 0.03, 0.36, z - 0.16, 0xe8e0c8, 0.008);
  };
  k.shadow(1.3, 1.2, 0, 0.1); k.pad(1.15, 1.1, 0, 0.1);

  if (a === 1) {
    // long baraquement de rondins, toit de chaume, râteliers de lances et boucliers, cour de pieux, mannequins, cible
    k.bx(1.9, 0.6, 0.95, 0, 0, 0.4, S.wall);
    for (let i = 0; i < 6; i++) { k.bx(1.94, 0.025, 0.99, 0, 0.06 + i * 0.1, 0.4, DARKWOOD); for (const sx of [-1, 1]) k.cy(0.05, 0.05, 0.1, 6, sx * 0.97, i * 0.1, -0.06, WOOD, 0); }
    k.gable(2.2, 0.62, 1.25, 0, 0.58, 0.4, 0xd0b060, 0, true, 'rows');
    k.rod(-1.0, 0.58, 0.4, -1.0, 1.35, 0.4, DARKWOOD, 0.03); k.rod(1.0, 0.58, 0.4, 1.0, 1.35, 0.4, DARKWOOD, 0.03);
    k.door(0, -0.08, 0.34, 0.46); k.steps(0, -0.12, 0.5, 2);
    k.win(-0.55, 0.28, -0.08, 0.16, 0.18); k.win(0.55, 0.28, -0.08, 0.16, 0.18);
    for (const x of [-0.85, 0.85]) k.shield(x, 0.36, -0.08, 1, x < 0 ? BLUE : GOLD);
    for (let i = 0; i < 3; i++) k.shield(-0.3 + i * 0.3, 0.52, -0.08, 0.6, [BLUE, 0xd8d0b8, BLUE][i]);
    k.rack(-0.62, -0.42, 4, 0.5); k.rack(0.62, -0.42, 4, 0.5);
    dummy(-0.95, -0.8, 0.3); dummy(-0.45, -0.95); dummy(0.95, -0.8, -0.3); target(0.45, -1.0);
    k.stakes(-1.15, -1.15, -0.2, -1.15, 5); k.stakes(0.2, -1.15, 1.15, -1.15, 5);
    k.fig(-0.15, 0, -0.65, 0.2, 'stand'); k.fig(0.2, 0, -0.65, -0.2, 'bow');
    k.hay(1.1, -0.3, 1.0); k.barrels(-1.1, -0.35, 2); k.sacks(0.9, 0.95, 3); k.planks(-0.9, 1.0, 0.2);
    k.lamp(-0.3, -0.45, 0.55); k.lamp(0.3, -0.45, 0.55);
    k.pole(1.05, -0.62, 1.6); k.pole(-1.05, -0.62, 1.4); k.bunting(-1.05, -0.62, 1.05, -0.62, 1.2, 12, 0.16);
    k.smoke.push([0.7, 1.0, 0.4]); k.sparks.push([0.7, 1.0, 0.4]); k.cy(0.06, 0.07, 0.2, 5, 0.7, 0.9, 0.4, DARK);
  } else if (a === 2) {
    // caserne de pierre : parapet crénelé, toit de tuiles bleues, tour d'angle, rangée de boucliers, râteliers, quintaine, porte à herse
    k.bx(1.9, 0.78, 0.95, 0, 0, 0.4, STONE); k.crenels(1.9, 0.95, 0, 0.78, 0.4, S.wall2, 8, 0.13);
    k.bx(1.96, 0.06, 1.01, 0, 0.74, 0.4, S.wall2);
    k.gable(1.3, 0.5, 0.75, 0, 0.8, 0.45, S.roof, 0, true, 'rows');
    k.cy(0.3, 0.33, 1.0, 8, 1.0, 0, 0.55, STONE); k.cy(0.36, 0.3, 0.08, 8, 1.0, 0.95, 0.55, S.wall2); k.cn(0.34, 0.42, 8, 1.0, 1.03, 0.55, S.roof); k.gl(0.05, 0.2, 0.02, 1.0, 0.55, 0.23, WARM); k.flags.push([1.0, 1.55, 0.55]);
    k.door(-0.15, -0.08, 0.36, 0.5); k.bx(0.4, 0.04, 0.04, -0.15, 0.52, -0.1, DARK); for (let i = 0; i < 4; i++) k.bx(0.012, 0.44, 0.012, -0.27 + i * 0.08, 0.05, -0.1, DARK);
    k.steps(-0.15, -0.12, 0.6, 3);
    for (let i = 0; i < 5; i++) k.shield(-0.85 + i * 0.28 + (i > 2 ? 0.45 : 0), 0.62, -0.08, 0.75, i % 2 ? GOLD : BLUE);
    for (const x of [-0.7, 0.4]) k.gl(0.06, 0.2, 0.02, x, 0.28, -0.08, WARM);
    k.banner(0.62, 0.1, -0.08, 0.24, 0.5, BLUE); k.banner(-0.82, 0.1, -0.08, 0.24, 0.5, BLUE);
    k.rack(-0.75, -0.42, 5, 0.6); k.rack(0.55, -0.42, 5, 0.6);
    dummy(-0.95, -0.85, 0.3); dummy(-0.4, -0.95); dummy(0.75, -0.9, -0.3);
    // quintaine : mannequin sur bras pivotant
    k.cy(0.03, 0.035, 0.55, 5, 0.25, 0, -0.95, DARKWOOD); k.bx(0.5, 0.04, 0.04, 0.25, 0.52, -0.95, DARKWOOD, 0.4); sh(new THREE.SphereGeometry(0.07, 6, 5).translate(0.42, 0.45, -0.89), 0x8a3a3a); k.shield(0.07, 0.45, -1.0, 0.7, BLUE);
    k.fig(-0.55, 0, -0.62, 0.2, 'stand'); k.fig(0.05, 0, -0.62, -0.2, 'bow'); k.fig(1.05, 0.0, -0.15, 0, 'stand');
    k.crates(1.2, -0.9, 3, 0.2); k.barrels(-1.15, -0.6, 3); k.sacks(-1.1, 0.95, 2); k.lamp(-0.5, -0.3, 0.55); k.lamp(0.05, -0.3, 0.55);
    k.fence(-1.2, -1.15, -0.3, -1.15, 0.3); k.fence(0.1, -1.15, 1.2, -1.15, 0.3);
    k.pole(1.1, -0.65, 1.7); k.pole(-1.1, -0.65, 1.5); k.bunting(-1.1, -0.65, 1.1, -0.65, 1.25, 12, 0.16);
    k.chimney(-0.5, 0.78, 0.7, 0.35, 0.14, S.wall2);
  } else if (a === 3) {
    // caserne de brique : tôle ondulée, deux cheminées, deux rangs de fenêtres, perron, canon de campagne, rangée de fusils, pas de manœuvre
    k.bx(1.95, 0.72, 0.95, 0, 0, 0.4, S.wall); k.bx(2.02, 0.06, 1.02, 0, 0.72, 0.4, S.wall2); k.bx(2.0, 0.05, 1.0, 0, 0, 0.4, S.wall2);
    k.gable(2.1, 0.5, 1.2, 0, 0.78, 0.4, S.roof, 0, true, 'ribs');
    k.chimney(-0.55, 0.9, 0.5, 0.55, 0.18, S.wall); k.chimney(0.6, 0.9, 0.5, 0.5, 0.18, S.wall);
    k.door(0, -0.08, 0.34, 0.46); k.steps(0, -0.12, 0.6, 3);
    for (const x of [-0.75, -0.45, 0.45, 0.75]) { k.win(x, 0.12, -0.08, 0.15, 0.2); k.win(x, 0.44, -0.08, 0.15, 0.18); }
    k.bx(0.5, 0.1, 0.03, 0, 0.58, -0.09, 0xe8e0c8); k.gl(0.42, 0.05, 0.02, 0, 0.6, -0.11, WARM);
    k.banner(-0.18, 0.06, -0.08, 0.14, 0.34, BLUE); k.banner(0.18, 0.06, -0.08, 0.14, 0.34, BLUE);
    k.rack(-0.85, -0.42, 5, 0.6); k.rack(0.85, -0.42, 5, 0.6);
    // canon de campagne : tube, affût, deux roues, boulets
    sh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8).rotateX(Math.PI / 2 + 0.15).translate(0.0, 0.2, -0.72), 0x2a2a30); k.bx(0.22, 0.08, 0.34, 0, 0.1, -0.55, 0x6a4a2a);
    for (const s of [-1, 1]) k.cy(0.14, 0.14, 0.035, 10, s * 0.15, 0.0, -0.55, 0x6a4a2a, Math.PI / 2);
    for (let i = 0; i < 3; i++) sh(new THREE.SphereGeometry(0.04, 6, 4).translate(0.28 + (i % 2) * 0.07, 0.04 + (i === 2 ? 0.06 : 0), -0.55 + (i === 2 ? 0.03 : i * 0.02)), 0x2a2a30);
    dummy(-0.9, -0.95, 0.2); dummy(0.9, -0.95, -0.2);
    for (let i = 0; i < 4; i++) k.fig(-0.5 + i * 0.3, 0, -1.0, 0, 'gun', 0.95);
    k.crates(1.2, -0.3, 3, 0.2); k.barrels(-1.2, -0.45, 3); k.planks(-1.0, 1.0, 0.2); k.tools(1.2, 0.95); k.lamp(-0.35, -0.3, 0.6); k.lamp(0.35, -0.3, 0.6);
    k.pole(1.1, -0.7, 1.55); k.pole(-1.1, -0.7, 1.35);
  } else if (a === 4) {
    // bloc de béton à toit plat : fenêtres éclairées en deux rangs, antenne, projecteurs, tourelle de toit, cibles de tir, camion, sacs de sable
    k.bx(1.95, 0.9, 0.95, 0, 0, 0.4, S.wall); k.bx(2.02, 0.07, 1.02, 0, 0.9, 0.4, 0x6c6e72);
    k.bx(2.0, 0.05, 0.02, 0, 0.74, -0.095, 0xe0b030); k.bx(2.0, 0.04, 0.02, 0, 0.1, -0.095, 0xe0b030);
    k.door(-0.3, -0.08, 0.34, 0.45); k.steps(-0.3, -0.12, 0.6, 2);
    for (const x of [-0.85, -0.6, 0.0, 0.3, 0.6, 0.85]) { k.win(x, 0.22, -0.08, 0.17, 0.16, -1, 0xffe8a0); }
    for (const x of [-0.85, -0.55, -0.25, 0.05, 0.35, 0.65, 0.9]) k.win(x, 0.54, -0.08, 0.17, 0.15, -1, 0xffe8a0);
    k.bx(0.3, 0.2, 0.3, -0.5, 0.97, 0.4, 0x7a7e84); k.bx(0.5, 0.1, 0.34, 0.45, 0.97, 0.55, 0x6a7a4a); k.cy(0.12, 0.14, 0.12, 8, 0.0, 0.97, 0.15, 0x5a5e66); sh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4).rotateX(Math.PI / 2).translate(0.0, 1.15, 0.02), 0x2a2a30);
    k.mast(0.85, 0.97, 0.7, 1.0); for (const x of [-0.8, 0.7]) { k.cy(0.01, 0.012, 0.28, 4, x, 0.97, -0.28, 0x3a3e44); k.gl(0.16, 0.06, 0.03, x, 1.26, -0.32, 0xfff4d0); }
    k.banner(0.15, 0.1, -0.08, 0.2, 0.4, BLUE);
    k.rack(-0.85, -0.42, 5, 0.55);
    for (const x of [-0.5, 0.05, 0.6]) dummy(x, -1.0);
    for (let i = 0; i < 3; i++) k.fig(0.9 + (i % 2) * 0.1, 0, -0.5 - i * 0.3, 0.3, 'gun', 0.95);
    // camion bâché : caisse, cabine, quatre roues
    k.bx(0.7, 0.3, 0.28, 0.35, 0.12, -0.55, 0x5a6a3a); k.bx(0.24, 0.24, 0.28, -0.1, 0.12, -0.55, 0x4a5a30); k.gl(0.16, 0.08, 0.02, -0.1, 0.24, -0.69, 0x9ad0e8);
    for (const x of [-0.1, 0.2, 0.5]) for (const s of [-1, 1]) k.cy(0.07, 0.07, 0.05, 8, x, 0, -0.55 + s * 0.15, 0x2a2a30);
    k.sandbags(-0.1, -1.18, 9, 0, 2); k.sandbags(1.1, -0.2, 3, Math.PI / 2, 2); k.pyr(0.7, 0.45, 0.8, -1.1, 0, 0.3, 0x6a7350);
    k.crates(-1.15, -0.3, 2, 0.2); k.barrels(1.1, 0.95, 2); k.lamp(0.0, -0.3, 0.7);
    k.pole(1.1, -0.9, 1.6); k.pole(-1.1, -0.9, 1.4); k.sparks.push([0, 1.2, 0.15]); k.smoke.push([-0.5, 1.2, 0.4]);
  } else {
    // bloc de métal blanc : verrière en demi-lune, liserés néon, bouclier d'énergie à la porte, drones d'exercice, soldats à armure blanche
    k.bx(1.95, 0.62, 0.95, 0, 0, 0.4, S.wall);
    sh(new THREE.CylinderGeometry(0.62, 0.7, 0.3, 4, 1).rotateY(Math.PI / 4).scale(1.4, 1, 0.95).translate(0, 0.76, 0.4), 0xeef2f8);
    k.gl(1.99, 0.025, 1.0, 0, 0.58, 0.4, CYAN); k.gl(1.99, 0.02, 1.0, 0, 0.14, 0.4, MAGENTA);
    k.shine.push(paint(new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.45, 0.85).translate(0, 0.92, 0.4), 0x3a8ad0));
    k.gtor(0.8, 0.012, 0, 0.93, 0.4, CYAN, Math.PI / 2, 18);
    k.door(-0.3, -0.08, 0.38, 0.46);
    for (const x of [-0.85, -0.6, 0.0, 0.3, 0.6, 0.85]) k.win(x, 0.28, -0.08, 0.18, 0.14, -1, 0x7af0ff);
    k.banner(0.0, 0.08, -0.09, 0.2, 0.42, CYAN); k.shield(-0.7, 0.18, -0.09, 0.8); k.shield(0.9, 0.18, -0.09, 0.8);
    k.gl(0.03, 0.4, 0.03, -0.55, 0, -0.45, CYAN); k.gl(0.03, 0.4, 0.03, 0.05, 0, -0.45, CYAN); k.shine.push(paint(new THREE.PlaneGeometry(0.58, 0.4).translate(-0.25, 0.22, -0.45), 0x3a8ad8));
    k.field.push(paint(new THREE.PlaneGeometry(0.58, 0.4).translate(-0.25, 0.22, -0.45), CYAN));
    k.rack(0.8, -0.42, 5, 0.55);
    dummy(-0.95, -0.9); dummy(-0.45, -1.05); dummy(0.45, -1.0); dummy(0.95, -0.85);
    for (let i = 0; i < 3; i++) k.fig(-0.1 + i * 0.28, 0, -0.75, 0, 'gun', 0.95);
    k.dish(0.7, 0.9, 0.5, 1); k.mast(-0.8, 0.9, 0.6, 0.8);
    k.crates(1.15, -0.35, 3, 0.18); k.barrels(-1.15, -0.5, 2); k.tools(0.9, 0.95); k.lamp(-0.7, -0.35, 0.5); k.lamp(0.3, -0.35, 0.5);
    k.fence(-1.2, -1.2, 1.2, -1.2, 0.22); k.pole(1.1, -0.7, 1.6); k.pole(-1.1, -0.7, 1.4);
    k.bubble(1.2, 0, 0.1); k.smoke.push([0.2, 1.1, 0.4]);
  }
  void CLOTH; void GOLD; void DARK; void WOOD; void MAGENTA; void EMBER;
}
