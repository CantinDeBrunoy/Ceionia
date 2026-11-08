import * as THREE from 'three';
import { paint } from './battleUnits';
import { Kit, BLUE, GOLD, DARK, DARKWOOD, WOOD, STONE, CYAN, MAGENTA, WARM, WHITE, IRON } from './hellBaseKit';

/** La tour de guet : créneaux, archers, balistes, oriflammes ; du fortin de pieux au pylône à bouclier d'énergie */
export function buildTower(k: Kit) {
  const { a, S } = k;
  const sh = (g: THREE.BufferGeometry, c: number) => k.solid.push(paint(g, c, (t) => 0.8 + t * 0.3));
  /** baliste (bois, fer) ou canon-mitrailleuse (3 et 4), canon à plasma (5), tournée vers -z ; (x, y, z) = pied */
  const gun = (x: number, y: number, z: number, ry = 0) => {
    const c = Math.cos(ry), s = Math.sin(ry), at = (px: number, pz: number) => [x + c * px + s * pz, z - s * px + c * pz] as const;
    if (a <= 2) {
      k.bx(0.2, 0.05, 0.3, x, y, z, DARKWOOD, ry); k.cy(0.02, 0.025, 0.12, 5, x, y + 0.05, z, DARKWOOD);
      const [lx, lz] = at(-0.15, -0.06), [rx, rz] = at(0.15, -0.06), [mx, mz] = at(0, 0.02), [tx, tz] = at(0, -0.22);
      k.rod(mx, y + 0.19, mz, lx, y + 0.21, lz, a === 1 ? DARKWOOD : IRON, 0.025); k.rod(mx, y + 0.19, mz, rx, y + 0.21, rz, a === 1 ? DARKWOOD : IRON, 0.025);
      k.rod(lx, y + 0.21, lz, tx, y + 0.19, tz + 0.1 * 0, 0xe8e0c8, 0.006); k.rod(rx, y + 0.21, rz, tx, y + 0.19, tz, 0xe8e0c8, 0.006);
      k.rod(mx, y + 0.19, mz + 0.0, tx, y + 0.19, tz - 0.1, 0x7a5a38, 0.02); k.cn(0.022, 0.07, 4, ...[tx, y + 0.19, tz - 0.12] as [number, number, number], 0xd0d4dc);
    } else if (a <= 4) {
      k.bx(0.24, 0.05, 0.24, x, y, z, 0x3a3e44, ry); k.cy(0.04, 0.05, 0.12, 6, x, y + 0.05, z, 0x5a5e66);
      const [bx0, bz0] = at(0, -0.1);
      for (let i = 0; i < 3; i++) sh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 5).rotateX(Math.PI / 2).rotateY(ry).translate(bx0 + c * (i - 1) * 0.04, y + 0.22 + (i === 1 ? 0.03 : 0), bz0 - s * (i - 1) * 0.04), 0x2a2a30);
      sh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 8).rotateX(Math.PI / 2).rotateY(ry).translate(...(() => { const [qx, qz] = at(0, 0.0); return [qx, y + 0.22, qz] as [number, number, number]; })()), 0x5a5e66);
    } else {
      k.cy(0.08, 0.1, 0.1, 8, x, y, z, 0xdfe6ee); k.sph(0.1, 0.08, 0.1, x, y + 0.14, z, 0xeef2f8, 8);
      const [qx, qz] = at(0, -0.14); sh(new THREE.CylinderGeometry(0.035, 0.045, 0.28, 6).rotateX(Math.PI / 2).rotateY(ry).translate(qx, y + 0.15, qz), 0xcfd6e0);
      const [ex, ez] = at(0, -0.3); k.gl(0.05, 0.05, 0.03, ex, y + 0.13, ez, CYAN);
    }
  };
  /** carquois de flèches ou boîte de munitions au pied d'un archer */
  const ammo = (x: number, y: number, z: number) => {
    if (a <= 2) { k.cy(0.04, 0.035, 0.16, 6, x, y, z, 0x7a5a38); for (let i = 0; i < 4; i++) k.rod(x - 0.02 + i * 0.015, y + 0.16, z, x - 0.025 + i * 0.02, y + 0.3, z, 0xe8e0c8, 0.008); }
    else k.crate(x, y, z, 0.13);
  };
  k.shadow(0.8, 0.8, 0, 0); k.pad(0.72, 0.72, 0, 0);

  if (a === 1) {
    // quatre pieux haubanés et entretoisés, échelle, plateforme palissadée, toit de peaux, deux archers, baliste, torches, oriflammes
    for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) { k.cy(0.05, 0.075, 1.75, 5, x, 0, z, DARKWOOD); k.cn(0.07, 0.1, 5, x, 1.72, z, DARKWOOD); }
    for (const y of [0.45, 1.0]) for (const [x0, z0, x1, z1] of [[-0.34, -0.34, 0.34, -0.34], [-0.34, 0.34, 0.34, 0.34], [-0.34, -0.34, -0.34, 0.34], [0.34, -0.34, 0.34, 0.34]]) k.rod(x0, y, z0, x1, y + 0.3, z1, WOOD, 0.04);
    k.rod(-0.34, 0.45, -0.34, 0.34, 1.0, -0.34, WOOD, 0.035); k.rod(0.34, 0.45, 0.34, -0.34, 1.0, 0.34, WOOD, 0.035);
    k.bx(0.96, 0.08, 0.96, 0, 1.55, 0, WOOD); for (let i = 0; i < 6; i++) k.bx(0.96, 0.012, 0.02, 0, 1.63, -0.42 + i * 0.17, DARKWOOD);
    for (const [w, d, x, z] of [[0.96, 0.07, 0, -0.45], [0.96, 0.07, 0, 0.45], [0.07, 0.96, -0.45, 0], [0.07, 0.96, 0.45, 0]] as const) { k.bx(w, 0.3, d, x, 1.63, z, WOOD); k.bx(w, 0.03, d, x, 1.9, z, DARKWOOD); }
    for (let i = 0; i < 6; i++) k.cn(0.035, 0.12, 4, -0.38 + i * 0.152, 1.9, -0.45, 0xd8aa74);
    for (let i = 0; i < 3; i++) k.shield(-0.28 + i * 0.28, 1.78, -0.49, 0.9, [BLUE, GOLD, BLUE][i]);
    k.pyr(1.2, 0.5, 1.2, 0, 2.05, 0, 0x8a6a40); for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) k.cy(0.022, 0.025, 0.42, 4, x, 1.7, z, DARKWOOD);
    k.fig(-0.2, 1.63, -0.2, 0, 'bow'); k.fig(0.2, 1.63, 0.0, 0.6, 'stand'); gun(0.22, 1.63, -0.25, 0); ammo(-0.32, 1.63, 0.2);
    k.ladder(0.0, -0.55, 1.6, 0, 0.0); k.cy(0.1, 0.12, 0.1, 8, 0.38, 1.63, -0.55, DARK); k.flm(0.07, 0.17, 0.38, 1.7, -0.55); k.st.fire = 1.95; k.sparks.push([0.38, 1.95, -0.55]); k.smoke.push([0.38, 2.05, -0.55]);
    k.rod(0.38, 1.63, -0.55, 0.38, 1.3, -0.55, DARKWOOD, 0.03);
    k.stakes(-0.62, -0.62, 0.62, -0.62, 6, 0.4); k.stakes(-0.62, 0.62, 0.62, 0.62, 6, 0.4); k.stakes(-0.62, -0.5, -0.62, 0.5, 4, 0.4); k.stakes(0.62, -0.5, 0.62, 0.5, 4, 0.4);
    k.crates(0.5, 0.5, 2, 0.16); k.barrels(-0.55, 0.45, 2); k.sack(-0.5, -0.4);
    k.cy(0.02, 0.025, 0.55, 4, 0, 2.1, 0, DARKWOOD); k.flags.push([0, 2.65, 0]); k.rod(-0.4, 1.9, -0.4, 0, 2.62, 0, 0xd8d0b8, 0.008); k.rod(0.4, 1.9, -0.4, 0, 2.62, 0, 0xd8d0b8, 0.008);
    k.bunting(-0.4, -0.5, 0.4, -0.5, 1.45, 6, 0.06); k.sph(0.04, 0.04, 0.04, 0, 2.67, 0, GOLD);
  } else if (a === 2) {
    // tour de pierre ronde : mâchicoulis, créneaux, toit conique d'ardoise, meurtrières, porte voûtée, archers au parapet, écus, bannières
    k.cy(0.36, 0.46, 1.85, 10, 0, 0, 0, STONE);
    for (let i = 0; i < 6; i++) k.cy(0.37, 0.37, 0.02, 10, 0, 0.25 + i * 0.28, 0, 0x7a7684);
    k.cy(0.5, 0.4, 0.16, 10, 0, 1.55, 0, S.wall2);
    for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; k.bx(0.1, 0.12, 0.1, Math.sin(t) * 0.48, 1.45, Math.cos(t) * 0.48, S.wall2, t); k.bx(0.15, 0.14, 0.09, Math.sin(t + 0.31) * 0.52, 1.74, Math.cos(t + 0.31) * 0.52, STONE, t + 0.31); }
    k.cy(0.5, 0.5, 0.04, 10, 0, 1.7, 0, S.wall2);
    k.cn(0.5, 0.7, 10, 0, 1.85, 0, S.roof); k.cn(0.05, 0.1, 4, 0, 2.55, 0, GOLD);
    for (let i = 0; i < 4; i++) { const t = -0.55 + i * 0.37; k.gl(0.05, 0.22, 0.02, Math.sin(t) * 0.41, 0.7 + (i % 2) * 0.35, -Math.cos(t) * 0.41, 0x1a1218); }
    k.bx(0.3, 0.42, 0.06, 0, 0, -0.43, DARKWOOD); k.bx(0.38, 0.06, 0.07, 0, 0.42, -0.43, 0xb8b0a0); k.cn(0.19, 0.1, 3, 0, 0.46, -0.44, 0xb8b0a0); k.steps(0, -0.48, 0.5, 2);
    k.gl(0.08, 0.2, 0.02, 0, 1.15, -0.42, WARM); k.gl(0.06, 0.18, 0.02, 0.0, 0.85, -0.4, 0x1a1218);
    for (let i = 0; i < 3; i++) k.shield(-0.3 + i * 0.3, 1.52, -0.52, 0.7, [BLUE, GOLD, BLUE][i]);
    k.banner(-0.3, 0.55, -0.4, 0.16, 0.45, BLUE); k.banner(0.3, 0.55, -0.4, 0.16, 0.45, BLUE);
    k.fig(-0.2, 1.74, -0.38, 0, 'bow', 0.9); k.fig(0.3, 1.74, -0.25, -0.4, 'stand', 0.9); gun(0, 1.74, 0.3, Math.PI);
    k.bx(0.5, 0.1, 0.5, 0, 1.74, 0, DARKWOOD); k.cy(0.015, 0.015, 0.4, 4, 0.35, 1.85, 0.3, DARKWOOD); k.flags.push([0.35, 2.15, 0.3]); k.flags.push([0, 2.58, 0]);
    k.lamp(-0.58, -0.55, 0.45); k.lamp(0.58, -0.55, 0.45); k.bunting(-0.58, -0.55, 0.58, -0.55, 0.42, 7, 0.06);
    k.sack(0.55, -0.1); k.crates(-0.62, 0.0, 2, 0.15); k.barrels(0.6, 0.35, 2); k.st.fire = 1.2; k.smoke.push([0.35, 2.2, 0.3]);
    k.gl(0.04, 0.04, 0.04, -0.42, 1.88, -0.42, 0xffc060); k.cy(0.012, 0.012, 0.18, 4, -0.42, 1.72, -0.42, DARK); k.flm(0.04, 0.1, -0.42, 1.9, -0.42);
  } else if (a === 3) {
    // tour de brique à cabine de bois et toit de tôle, projecteur à gaz, poêle qui fume, mitrailleuse, guetteurs au fusil, drapeaux de signalisation
    k.bx(0.74, 1.5, 0.74, 0, 0, 0, S.wall); for (let i = 0; i < 5; i++) k.bx(0.78, 0.025, 0.78, 0, 0.18 + i * 0.3, 0, S.wall2);
    k.bx(0.9, 0.1, 0.9, 0, 1.5, 0, S.wall2); for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) k.bx(0.1, 0.18, 0.1, x, 1.6, z, S.wall2);
    k.bx(0.74, 0.3, 0.74, 0, 1.6, 0, DARKWOOD); k.bx(0.5, 0.15, 0.02, 0, 1.68, -0.38, WARM); k.gl(0.46, 0.13, 0.02, 0, 1.69, -0.39, WARM); for (const s of [-1, 1]) k.gl(0.02, 0.13, 0.42, s * 0.375, 1.69, 0, WARM);
    k.gable(1.1, 0.34, 1.0, 0, 1.92, 0, S.roof); k.bx(1.12, 0.03, 0.04, 0, 1.92, -0.5, 0x2a4a88);
    k.cy(0.035, 0.035, 0.45, 5, -0.3, 2.0, 0.25, DARK); k.smoke.push([-0.3, 2.5, 0.25]);
    k.door(0, -0.37, 0.24, 0.38); k.win(-0.2, 0.7, -0.375, 0.1, 0.2); k.win(0.2, 1.0, -0.375, 0.1, 0.2); k.steps(0, -0.4, 0.4, 2);
    // projecteur à gaz : cône luisant sur potence
    k.rod(0.38, 1.62, -0.45, 0.62, 1.82, -0.6, 0x2a2a30, 0.03); sh(new THREE.ConeGeometry(0.1, 0.18, 8).rotateX(-Math.PI / 2).translate(0.62, 1.82, -0.68), 0x3a3e44); k.gl(0.1, 0.1, 0.02, 0.57, 1.77, -0.78, 0xfff0b0);
    k.banner(-0.2, 0.2, -0.375, 0.16, 0.38, BLUE);
    k.fig(-0.2, 1.6, -0.45, 0, 'gun', 0.9); gun(0.1, 1.6, -0.5, 0); ammo(-0.5, 1.6, -0.1);
    k.rod(0.4, 1.0, -0.2, 0.4, 1.5, -0.2, 0x7a6a4a, 0.02); k.rod(-0.4, 1.0, 0.4, 0.0, 2.2, 0.0, 0xd8d0b8, 0.006); k.rod(0.4, 1.0, 0.4, 0.0, 2.2, 0.0, 0xd8d0b8, 0.006);
    k.cy(0.015, 0.02, 0.5, 4, 0, 2.1, 0, 0x2a2a30); k.flags.push([0, 2.62, 0]); k.flags.push([0.4, 1.9, 0.4]); k.cy(0.012, 0.012, 0.4, 4, 0.4, 1.5, 0.4, 0x2a2a30);
    k.lamp(-0.58, -0.5, 0.6); k.lamp(0.58, -0.5, 0.6); k.barrels(-0.6, 0.25, 2); k.crates(0.55, 0.35, 2, 0.16); k.planks(0.0, -0.7); k.sandbags(0, -0.7, 5, 0, 1);
    k.st.fire = 1.7; k.sparks.push([-0.3, 2.4, 0.25]);
  } else if (a === 4) {
    // tour de béton à cabine vitrée : projecteurs, antenne et radar, tourelle de tir, sacs de sable, sniper en armure kaki, bande jaune de danger
    k.bx(0.56, 1.35, 0.56, 0, 0, 0, S.wall); for (let i = 0; i < 4; i++) k.bx(0.58, 0.025, 0.58, 0, 0.3 + i * 0.3, 0, 0xe0b030);
    k.bx(1.0, 0.08, 1.0, 0, 1.35, 0, 0x6c6e72); k.bx(0.98, 0.035, 0.98, 0, 1.43, 0, 0xe0b030);
    k.bx(0.82, 0.34, 0.82, 0, 1.43, 0, 0x3a4a5a); for (const [x, z, w, d] of [[0, -0.42, 0.7, 0.02], [0, 0.42, 0.7, 0.02], [-0.42, 0, 0.02, 0.7], [0.42, 0, 0.02, 0.7]] as const) k.gl(w, 0.2, d, x, 1.5, z, 0xffe8a0 - 0x101010);
    k.bx(1.0, 0.07, 1.0, 0, 1.77, 0, 0x6c6e72);
    k.door(0, -0.28, 0.2, 0.36); k.steps(0, -0.32, 0.4, 2); k.win(0, 0.75, -0.285, 0.12, 0.16, -1, 0xffe8a0); k.banner(-0.18, 0.4, -0.285, 0.16, 0.4, BLUE);
    for (const x of [-0.35, 0.35]) { k.cy(0.012, 0.014, 0.18, 4, x, 1.84, -0.38, 0x3a3e44); k.bx(0.2, 0.08, 0.06, x, 2.02, -0.4, 0x3a3e44); k.gl(0.17, 0.06, 0.02, x, 2.03, -0.44, 0xfff4d0); }
    k.mast(0.35, 1.84, 0.35, 0.8); k.dish(-0.3, 1.84, 0.3, 0.8);
    k.fig(0.0, 1.84, -0.15, 0, 'gun', 0.9); gun(0.28, 1.84, -0.25, 0); ammo(-0.3, 1.84, -0.1);
    k.sandbags(0, -0.62, 7, 0, 2); k.sandbags(0.55, -0.1, 3, Math.PI / 2, 2); k.sandbags(-0.55, -0.1, 3, Math.PI / 2, 2);
    k.cy(0.015, 0.015, 0.5, 4, 0, 1.84, 0.0, 0x8a8e94); k.flags.push([0, 2.28, 0]); k.flags.push([0.3, 1.5 + 0.2, 0.3]);
    k.crates(0.55, 0.4, 2, 0.15); k.barrels(-0.6, 0.35, 2); k.lamp(-0.55, -0.45, 0.6); k.lamp(0.55, -0.45, 0.6); k.tools(0.1, -0.85);
    k.st.fire = 1.9; k.sparks.push([0.35, 2.7, 0.35]); k.smoke.push([-0.3, 1.5, 0.45]);
  } else {
    // pylône blanc : fût effilé à anneaux de néon, nacelle de tir à canon à plasma qui pivote, bouclier d'énergie, drones, hologramme-balise
    k.cy(0.15, 0.36, 1.45, 10, 0, 0, 0, 0xdfe6ee);
    for (let i = 0; i < 5; i++) k.gtor(0.33 - i * 0.04, 0.012, 0, 0.2 + i * 0.27, 0, i % 2 ? MAGENTA : CYAN, Math.PI / 2, 16);
    k.door(0, -0.34, 0.22, 0.34); k.win(0, 0.75, -0.3, 0.08, 0.2, -1, 0x7af0ff);
    k.sph(0.36, 0.2, 0.36, 0, 1.55, 0, 0xeef2f8, 10); k.gl(0.5, 0.04, 0.5, 0, 1.5, 0, CYAN);
    k.cy(0.28, 0.3, 0.06, 10, 0, 1.62, 0, 0xcfd6e0); k.gtor(0.3, 0.012, 0, 1.68, 0, CYAN, Math.PI / 2, 16);
    for (const s of [-1, 1]) { k.bx(0.1, 0.14, 0.3, s * 0.36, 1.46, 0, 0xcfd6e0); k.gl(0.05, 0.035, 0.04, s * 0.36, 1.52, -0.17, 0xff4060); }
    k.fig(-0.12, 1.66, -0.08, 0, 'gun', 0.85); gun(0.12, 1.66, -0.1, 0);
    k.spin(0, 0, paint(new THREE.TorusGeometry(0.3, 0.02, 4, 18).rotateX(Math.PI / 2.3).translate(0, 2.15, 0), CYAN)); k.spin(0, 0, paint(new THREE.OctahedronGeometry(0.1).translate(0, 2.15, 0), MAGENTA));
    k.spin(0, 0, paint(new THREE.OctahedronGeometry(0.05).translate(0.45, 1.9, 0), WHITE));
    k.cy(0.01, 0.01, 0.3, 4, 0, 1.68, 0.2, 0xdfe6ee); k.flags.push([0, 2.55, 0]); k.cy(0.01, 0.012, 0.5, 4, 0, 2.15, 0, 0xdfe6ee);
    k.cy(0.01, 0.01, 0.4, 4, 0.3, 1.68, 0.3, 0xdfe6ee); k.flags.push([0.3, 2.0, 0.3]);
    k.tools(0.45, -0.4); k.crates(-0.55, 0.2, 2, 0.15); k.lamp(-0.45, -0.45, 0.45); k.lamp(0.5, -0.4, 0.45); k.fence(-0.65, -0.65, 0.65, -0.65, 0.2);
    k.bubble(0.95, 0, 0, CYAN); k.st.fire = 1.7; k.sparks.push([0, 2.3, 0]);
  }
  void STONE; void WOOD; void DARK;
}
