import * as THREE from 'three';
import { paint } from './battleUnits';
import { Kit, BLUE, GOLD, DARK, DARKWOOD, STONE, CYAN, MAGENTA, EMBER, WARM, FIRE } from './hellBaseKit';

/** Le brasero : un feu qui éclaire la base et fait reculer la brume ; trépied de bois, vasque de fer, baril à tuyau, projecteur, balise d'énergie */
export function buildBrazier(k: Kit) {
  const { a } = k;
  const sh = (g: THREE.BufferGeometry, c: number) => k.solid.push(paint(g, c, (t) => 0.8 + t * 0.3));
  k.shadow(0.42, 0.42, 0, 0);
  if (a === 1) {
    // trépied de rondins liés, vasque de pierre, grandes flammes, bûches, pierres du foyer, fanion de toile
    for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; k.rod(Math.sin(t) * 0.26, 0, Math.cos(t) * 0.26, Math.sin(t) * 0.06, 0.62, Math.cos(t) * 0.06, DARKWOOD, 0.045); }
    k.cy(0.09, 0.09, 0.06, 6, 0, 0.56, 0, 0x5a4a38);
    k.cy(0.26, 0.16, 0.16, 8, 0, 0.42, 0, STONE); k.cy(0.22, 0.22, 0.02, 8, 0, 0.58, 0, 0x2a1e1c);
    for (let i = 0; i < 6; i++) sh(new THREE.DodecahedronGeometry(0.07, 0).translate(Math.sin(i * 1.05) * 0.3, 0.04, Math.cos(i * 1.05) * 0.3), i % 2 ? 0x6a6672 : DARK);
    k.flm(0.2, 0.5, 0, 0.6, 0, FIRE); k.flm(0.12, 0.38, 0.09, 0.6, 0.05, 0xffe070); k.flm(0.09, 0.3, -0.1, 0.6, -0.04, EMBER);
    for (let i = 0; i < 3; i++) k.bx(0.28, 0.07, 0.07, 0.3, i * 0.07, 0.12 - i * 0.05, DARKWOOD, 0.4 + i);
    k.rod(0.28, 0, -0.22, 0.28, 0.5, -0.22, DARKWOOD, 0.02); k.flags.push([0.28, 0.42, -0.22]);
    k.sparks.push([0, 1.15, 0]); k.smoke.push([0, 1.3, 0]); k.st.fire = 0.62;
  } else if (a === 2) {
    // socle de pierre à gradins, vasque de fer cerclée de laiton suspendue à trois chaînes, flammes vives, bannière
    k.cy(0.28, 0.32, 0.08, 8, 0, 0, 0, 0x7a7684); k.cy(0.16, 0.22, 0.45, 6, 0, 0.08, 0, STONE); k.cy(0.12, 0.12, 0.04, 6, 0, 0.5, 0, 0x7a7684);
    for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2 + 0.5; k.cy(0.015, 0.02, 0.5, 4, Math.sin(t) * 0.24, 0.1, Math.cos(t) * 0.24, DARK); k.rod(Math.sin(t) * 0.24, 0.6, Math.cos(t) * 0.24, Math.sin(t) * 0.04, 0.82, Math.cos(t) * 0.04, 0xb8a060, 0.01); }
    k.cy(0.27, 0.15, 0.17, 8, 0, 0.56, 0, DARK); k.cy(0.285, 0.275, 0.03, 8, 0, 0.7, 0, GOLD); k.cy(0.15, 0.15, 0.02, 8, 0, 0.55, 0, 0x2a2a30);
    k.flm(0.2, 0.5, 0, 0.72, 0, FIRE); k.flm(0.12, 0.38, 0.09, 0.72, 0.05, 0xffe070);
    k.rod(0.36, 0, 0, 0.36, 0.5, 0, DARKWOOD, 0.02); k.bx(0.2, 0.3, 0.015, 0.36, 0.2, -0.0, BLUE, 0); k.cn(0.1, 0.08, 3, 0.36, 0.14, 0.0, BLUE); k.gl(0.04, 0.04, 0.02, 0.36, 0.36, -0.012, GOLD); k.flags.push([0.36, 0.45, 0.0]);
    k.sparks.push([0, 1.2, 0]); k.smoke.push([0, 1.35, 0]); k.st.fire = 0.68;
  } else if (a === 3) {
    // baril de tôle percé de trous qui rougeoient, pieds de fonte, grille, tuyau de poêle qui fume, bouilloire, tas de charbon
    for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) k.cy(0.02, 0.025, 0.14, 4, x, 0, z, DARK);
    k.cy(0.19, 0.19, 0.5, 10, 0, 0.14, 0, 0x8a3a2a); for (const y of [0.22, 0.45]) k.cy(0.2, 0.2, 0.025, 10, 0, y, 0, DARK);
    for (let i = 0; i < 6; i++) { const t = -0.9 + i * 0.36; k.gl(0.05, 0.04, 0.02, Math.sin(t) * 0.2, 0.28 + (i % 2) * 0.1, -Math.cos(t) * 0.2, EMBER); }
    k.cy(0.17, 0.17, 0.02, 10, 0, 0.64, 0, EMBER); k.flm(0.15, 0.4, 0, 0.64, 0, FIRE); k.flm(0.09, 0.3, 0.06, 0.64, 0.04, 0xffe070);
    k.rod(0.14, 0.62, 0.08, 0.14, 1.05, 0.08, DARK, 0.05); k.cy(0.05, 0.04, 0.05, 6, 0.14, 1.05, 0.08, DARK); k.smoke.push([0.14, 1.2, 0.08]); k.sparks.push([0, 1.0, 0]);
    sh(new THREE.SphereGeometry(0.07, 6, 5).scale(1, 0.8, 1).translate(-0.12, 0.72, 0.05), 0x7a7e84);
    for (let i = 0; i < 5; i++) sh(new THREE.DodecahedronGeometry(0.05, 0).translate(0.28 + (i % 3) * 0.07, 0.04 + (i > 2 ? 0.05 : 0), 0.05 + (i % 2) * 0.07), 0x2a2a30);
    k.rod(0.3, 0, -0.2, 0.3, 0.5, -0.2, 0x2a2a30, 0.02); k.flags.push([0.3, 0.42, -0.2]);
    k.st.fire = 0.58;
  } else if (a === 4) {
    // projecteur halogène sur trépied et son câble, baril de feu de secours, générateur orange, cône de signalisation
    for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2 + 0.3; k.rod(Math.sin(t) * 0.22, 0, Math.cos(t) * 0.22, 0, 0.7, 0, 0x6a6e74, 0.025); }
    k.bx(0.4, 0.26, 0.14, 0, 0.7, 0, 0x3a3e44); k.gl(0.34, 0.2, 0.03, 0, 0.73, -0.085, 0xfff4d0); k.bx(0.44, 0.03, 0.18, 0, 0.96, 0, 0x2a2a30);
    k.gl(0.12, 0.12, 0.02, -0.12, 0.76, -0.1, 0xfff8e0);
    k.cy(0.1, 0.1, 0.22, 8, 0.32, 0, 0.1, 0xff7a20); k.cy(0.104, 0.104, 0.02, 8, 0.32, 0.1, 0.1, 0x3a3e44); k.flm(0.08, 0.22, 0.32, 0.22, 0.1, FIRE); k.sparks.push([0.32, 0.55, 0.1]); k.smoke.push([0.32, 0.65, 0.1]);
    k.bx(0.24, 0.16, 0.14, -0.35, 0, 0.1, 0xe08a20); k.gl(0.06, 0.04, 0.02, -0.35, 0.1, -0.075, 0x70ff90); k.rod(-0.35, 0.1, 0.1, -0.1, 0.0, 0.0, 0x2a2a30, 0.015);
    k.cn(0.05, 0.13, 6, 0.0, 0, -0.33, 0xff7a20); k.flags.push([0.0, 1.0, 0.18]); k.cy(0.01, 0.01, 0.35, 4, 0, 0.96, 0.18, 0x8a8e94);
    k.st.fire = 0.55;
  } else {
    // balise lisse : colonne blanche, cœur d'énergie en lévitation entre deux anneaux, halo orange, bulle de lumière
    k.cy(0.14, 0.22, 0.16, 10, 0, 0, 0, 0xdfe6ee); k.cy(0.06, 0.1, 0.42, 8, 0, 0.16, 0, 0xcfd6e0); k.gtor(0.14, 0.014, 0, 0.12, 0, CYAN, Math.PI / 2, 14); k.gtor(0.11, 0.012, 0, 0.45, 0, MAGENTA, Math.PI / 2, 12);
    k.spin(0, 0, paint(new THREE.OctahedronGeometry(0.14).scale(0.8, 1.35, 0.8).translate(0, 0.9, 0), 0xff9a50)); k.spin(0, 0, paint(new THREE.TorusGeometry(0.24, 0.014, 4, 16).rotateX(Math.PI / 2.5).translate(0, 0.9, 0), CYAN));
    k.spin(0, 0, paint(new THREE.TorusGeometry(0.19, 0.01, 4, 14).rotateX(-Math.PI / 3).translate(0, 0.9, 0), MAGENTA));
    k.gl(0.03, 0.34, 0.03, 0, 0.56, 0, WARM); k.flm(0.06, 0.2, 0, 0.8, 0, 0xff9a50);
    k.cy(0.01, 0.01, 0.5, 4, 0.3, 0, -0.2, 0xdfe6ee); k.flags.push([0.3, 0.42, -0.2]);
    k.bubble(0.42, 0, 0, 0xff9a50); k.sparks.push([0, 1.1, 0]); k.st.fire = 0.62;
  }
  void DARK;
}
