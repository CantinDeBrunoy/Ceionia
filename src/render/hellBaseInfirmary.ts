import * as THREE from 'three';
import { paint } from './battleUnits';
import { Kit, BLUE, CLOTH, GOLD, DARK, DARKWOOD, WOOD, STONE, CYAN, WHITE, RED, GREEN, WARM, SKIN } from './hellBaseKit';

/** L'infirmerie : lits de camp, croix de soin, bannière blanche ; de la tente blanche à la capsule de soins à bouclier vert */
export function buildInfirmary(k: Kit) {
  const { a, S } = k;
  const sh = (g: THREE.BufferGeometry, c: number) => k.solid.push(paint(g, c, (t) => 0.8 + t * 0.3));
  const crossC = a === 1 ? GREEN : a === 2 ? GOLD : a === 3 ? RED : a === 4 ? 0x80ff90 : GREEN;
  /** croix de soin, face -z (lumineuse à partir de l'âge 3 pour les panneaux) */
  const cross = (x: number, y: number, z: number, s = 1, c = crossC, glow = false, dir = -1) => {
    const put = (w: number, h: number, dx: number, dy: number) => (glow ? k.gl(w, h, 0.02, x + dx, y + dy - h / 2, z + dir * 0.012, c) : k.bx(w, h, 0.02, x + dx, y + dy - h / 2, z + dir * 0.012, c));
    put(0.09 * s, 0.3 * s, 0, 0); put(0.3 * s, 0.09 * s, 0, 0);
  };
  /** lit de camp : cadre, matelas, couverture à liseré, oreiller, patient (tête) ; capsule vitrée au futur */
  const bed = (x: number, z: number, ry = 0, patient = true, blanket = a === 5 ? 0xdfe6ee : a >= 3 ? WHITE : a === 2 ? 0x8aa4d8 : CLOTH) => {
    const c = Math.cos(ry), s = Math.sin(ry), at = (px: number, pz: number) => [x + c * px + s * pz, z - s * px + c * pz] as const;
    if (a === 5) {
      k.bx(0.3, 0.06, 0.62, x, 0.04, z, 0xdfe6ee, ry); k.gl(0.26, 0.012, 0.56, x, 0.1, z, GREEN);
      k.shine.push(paint(new THREE.CylinderGeometry(0.17, 0.17, 0.56, 8, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0).rotateY(ry).translate(x, 0.16, z), 0x70c8a0));
      k.gtor(0.17, 0.01, x, 0.16, z, GREEN, 0, 10); { const [hx, hz] = at(0, 0.18); sh(new THREE.SphereGeometry(0.05, 6, 5).translate(hx, 0.14, hz), SKIN); }
      return;
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = at(sx * 0.1, sz * 0.26); k.bx(0.025, 0.07, 0.025, px, 0, pz, a <= 2 ? DARKWOOD : 0x8a8e94); }
    k.bx(0.26, 0.04, 0.6, x, 0.07, z, a <= 2 ? DARKWOOD : a === 3 ? 0x5a5e66 : 0xb8bcc4, ry);
    k.bx(0.24, 0.045, 0.56, x, 0.11, z, a === 1 ? 0xe0cfa0 : 0xe8e8ee, ry);
    { const [px, pz] = at(0, -0.08); k.bx(0.25, 0.05, 0.36, px, 0.155, pz, blanket, ry); }
    { const [px, pz] = at(0, 0.2); sh(new THREE.BoxGeometry(0.17, 0.04, 0.1).rotateY(ry).translate(px, 0.18, pz), WHITE); if (patient) { const [qx, qz] = at(0, 0.18); sh(new THREE.SphereGeometry(0.05, 6, 5).translate(qx, 0.23, qz), SKIN); } }
    if (patient) { const [px, pz] = at(0, -0.1); k.bx(0.26, 0.012, 0.38, px, 0.205, pz, blanket, ry); k.bx(0.26, 0.016, 0.02, px, 0.206, pz - 0.04, crossC, ry); }
  };
  /** fioles et paquets de bandes sur une étagère */
  const shelf = (x: number, y: number, z: number, w = 0.5) => {
    k.bx(w, 0.025, 0.1, x, y, z, a <= 2 ? DARKWOOD : 0x8a8e94);
    for (let i = 0; i < 5; i++) { const px = x - w / 2 + 0.06 + i * (w - 0.12) / 4; sh(new THREE.CylinderGeometry(0.018, 0.018, 0.07 + (i % 2) * 0.03, 5).translate(px, y + 0.06, z), [0x6ad88a, 0xe8e0c8, 0xff8a8a, 0x8ac8ff, 0x6ad88a][i]); }
  };
  k.shadow(1.3, 1.2, 0, 0.1); k.pad(1.15, 1.1, 0, 0.1);

  if (a === 1) {
    // grande tente blanche à bandes vertes, auvent de toile sur piquets avec trois lits, herbes qui sèchent, marmite d'infusion, bannière blanche à croix verte
    k.tent(0, 0.55, 1.5, 1.2, 0.95, WHITE, 0xc8e8b8, 8);
    k.flags.push([0, 1.15, 0.55]); cross(0, 0.72, -0.07, 1.1, GREEN, true);
    k.rb(1.6, 0.03, 0.9, 0, 0.62, -0.62, WHITE, 0.22); for (const x of [-0.75, 0.75]) for (const z of [-1.0, -0.2]) k.cy(0.022, 0.025, 0.6, 5, x, 0, z, DARKWOOD);
    bed(-0.5, -0.62, 0); bed(0.0, -0.62, 0.0, false); bed(0.5, -0.62, 0.0);
    for (let i = 0; i < 6; i++) { const x = -0.9 + i * 0.36; k.rod(x, 0.56, -1.12, x, 0.42, -1.12, 0x8a7a4a, 0.01); sh(new THREE.ConeGeometry(0.05, 0.14, 5).rotateX(Math.PI).translate(x, 0.34, -1.12), i % 2 ? 0x6a9a4a : 0xb8a860); }
    k.rod(-0.9, 0.56, -1.12, 1.0, 0.56, -1.12, 0xd8d0b8, 0.01);
    k.firepit(1.05, -0.2, 0.14, 0.7); k.st.fire = 0.35; for (let i = 0; i < 3; i++) k.rod(1.05 + Math.sin(i * 2.1) * 0.15, 0, -0.2 + Math.cos(i * 2.1) * 0.15, 1.05, 0.4, -0.2, DARKWOOD, 0.02); sh(new THREE.SphereGeometry(0.1, 7, 5).scale(1, 0.8, 1).translate(1.05, 0.3, -0.2), 0x3a3a42);
    k.pole(-1.1, -0.2, 1.6); k.pole(1.18, -0.9, 1.35); k.bunting(-1.1, -0.2, 1.18, -0.9, 1.25, 10, 0.15);
    k.barrels(-1.15, -0.85, 2); k.sacks(0.85, -1.0, 3); k.crates(-1.1, 0.7, 2, 0.2); k.hay(1.05, 0.7, 1); k.planks(0.0, -1.2, 0.0);
    sh(new THREE.TorusGeometry(0.08, 0.015, 4, 8).rotateX(Math.PI / 2).translate(-0.85, 0.06, 0.2), 0x9a7a4a); k.lamp(-0.15, -1.15, 0.5); k.lamp(0.45, -1.15, 0.5);
  } else if (a === 2) {
    // chapelle-hôpital de pierre : clocher à croix dorée, toit de tuiles bleues, vitrail, banderoles blanches, lits sous le cloître, potager d'herbes, puits
    k.bx(1.5, 0.7, 0.95, 0, 0, 0.55, 0xd8d0c0); k.crenels(1.5, 0.95, 0, 0.7, 0.55, 0xb8b0a0, 6, 0.1);
    k.gable(1.6, 0.58, 1.1, 0, 0.7, 0.55, S.roof);
    for (let i = 0; i < 4; i++) k.bx(1.6, 0.012, 0.014, 0, 0.74 + i * 0.12, 0.2 + i * 0.1, 0x2a4a88);
    k.bx(0.4, 1.1, 0.4, 0.55, 0, 0.9, 0xd8d0c0); k.cn(0.34, 0.5, 4, 0.55, 1.1, 0.9, S.roof); k.gl(0.08, 0.22, 0.02, 0.55, 0.78, 0.69, WARM); cross(0.55, 1.72, 0.9, 0.5, GOLD, false); k.flags.push([0.55, 1.78, 0.9]);
    k.bx(0.3, 0.46, 0.05, -0.2, 0, 0.07, DARKWOOD); k.bx(0.38, 0.06, 0.06, -0.2, 0.46, 0.07, 0xb8b0a0); k.cn(0.19, 0.12, 3, -0.2, 0.5, 0.06, 0xb8b0a0);
    k.steps(-0.2, 0.03, 0.5, 2);
    k.gl(0.14, 0.3, 0.02, 0.35, 0.18, 0.07, 0x8aa4d8); k.gl(0.14, 0.3, 0.02, -0.75, 0.18, 0.07, 0x9aff8a); cross(0.0, 0.66, 0.07, 1.0, GOLD, true);
    for (const x of [-0.3, 0.3]) k.banner(x, 0.0, 0.065, 0.2, 0.45, WHITE);
    // cloître : trois lits sous un toit de tuiles adossé
    k.rb(1.5, 0.03, 0.6, -0.1, 0.62, -0.62, S.roof, 0.28); for (const x of [-0.85, 0.65]) for (const z of [-0.85, -0.3]) k.cy(0.035, 0.04, 0.6, 6, x, 0, z, 0xb8b0a0);
    bed(-0.5, -0.58); bed(-0.1, -0.58, 0, false); bed(0.3, -0.58);
    k.bx(0.5, 0.1, 0.26, 1.05, 0, -0.2, 0x5a3a28); for (let i = 0; i < 4; i++) sh(new THREE.SphereGeometry(0.06, 5, 4).translate(0.9 + i * 0.1, 0.16, -0.2), [0x4a8a3a, 0x6aaa4a, 0x8a4a8a, 0x4a8a3a][i]);
    k.cy(0.14, 0.16, 0.2, 8, -1.0, 0, -0.85, STONE); k.cy(0.1, 0.1, 0.01, 8, -1.0, 0.2, -0.85, 0x3a6aa8); k.rod(-1.1, 0.2, -0.85, -1.1, 0.5, -0.85, DARKWOOD, 0.025); k.rod(-0.9, 0.2, -0.85, -0.9, 0.5, -0.85, DARKWOOD, 0.025); k.rod(-1.1, 0.5, -0.85, -0.9, 0.5, -0.85, DARKWOOD, 0.025);
    k.pole(1.15, -0.8, 1.6); k.pole(-1.15, -0.4, 1.5); k.bunting(-1.15, -0.4, 1.15, -0.8, 1.3, 10, 0.15);
    k.barrels(1.1, -1.0, 2); k.sacks(0.4, -1.1, 2); k.crates(-0.6, -1.15, 2, 0.18); k.lamp(0.8, -0.55, 0.55); k.lamp(-0.95, -0.2, 0.55); k.fence(-1.2, -1.2, 1.2, -1.2, 0.26);
  } else if (a === 3) {
    // dispensaire de brique : tôle, cheminée de stérilisation à vapeur, enseigne à croix rouge, ambulance hippomobile, lits sous auvent, fenêtres lumineuses
    k.bx(1.55, 0.62, 0.95, 0, 0, 0.55, S.wall); k.bx(1.62, 0.07, 1.02, 0, 0.62, 0.55, WHITE); k.bx(1.6, 0.05, 1.0, 0, 0, 0.55, S.wall2);
    k.gable(1.7, 0.46, 1.2, 0, 0.69, 0.55, S.roof);
    for (let i = 0; i < 7; i++) { const x = -0.7 + i * 0.234; k.rb(0.03, 0.02, 0.6, x, 0.9, 0.28, 0x2a4a88, 0.74); k.rb(0.03, 0.02, 0.6, x, 0.9, 0.82, 0x2a4a88, -0.74); }
    k.chimney(0.55, 0.78, 0.8, 0.5, 0.16, S.wall); k.chimney(-0.5, 0.78, 0.85, 0.35, 0.14, S.wall);
    k.door(0, 0.07, 0.32, 0.45, -1); k.steps(0, 0.03, 0.5, 2);
    for (const x of [-0.6, 0.6]) k.win(x, 0.28, 0.08, 0.2, 0.24, -1, 0xfff4d8);
    k.bx(0.46, 0.34, 0.04, 0.0, 0.62, 0.05, WHITE); cross(0, 0.9, 0.04, 0.7, RED, true); k.bx(0.5, 0.04, 0.05, 0, 0.58, 0.05, DARK);
    k.rb(1.5, 0.03, 0.55, 0, 0.62, -0.38, 0x8a9098, 0.3); for (const x of [-0.7, 0.7]) k.cy(0.022, 0.025, 0.6, 5, x, 0, -0.62, 0x2a2a30);
    bed(-0.4, -0.38); bed(0.0, -0.38, 0, false); bed(0.4, -0.38);
    // ambulance hippomobile : caisse blanche à croix, quatre roues, brancards, timon
    k.bx(0.6, 0.28, 0.3, 0.8, 0.1, -0.85, WHITE); k.rb(0.66, 0.03, 0.36, 0.8, 0.4, -0.85, 0x8a9098, 0, 0, 0); cross(0.8, 0.36, -1.0, 0.45, RED, false);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cy(0.1, 0.1, 0.03, 10, 0.8 + sx * 0.2, 0.0, -0.85 + sz * 0.17, 0x5a3a28, Math.PI / 2 * 0);
    k.rod(1.1, 0.12, -0.85, 1.4, 0.2, -0.85, DARKWOOD, 0.03); k.lamp(0.55, -0.7, 0.45);
    k.pole(-1.15, -0.85, 1.55); k.pole(1.18, -0.2, 1.4); k.barrels(-1.1, -0.2, 2); k.crates(-0.9, -1.1, 3, 0.18); k.planks(0.1, -1.1); k.lamp(-0.6, -1.05, 0.6);
    shelf(-0.0, 0.5, -0.9, 0.4);
  } else if (a === 4) {
    // poste médical de béton : croix verte lumineuse, héliport sur le toit, ambulance, tente blanche annexe, antenne, groupe électrogène
    k.bx(1.5, 0.7, 0.95, 0, 0, 0.55, S.wall); k.bx(1.58, 0.07, 1.03, 0, 0.7, 0.55, 0xe8e8e8); k.bx(1.55, 0.05, 0.02, 0, 0.1, 0.07, 0x80c890);
    k.door(-0.3, 0.07, 0.34, 0.45, -1); k.steps(-0.3, 0.03, 0.55, 2);
    for (const x of [-0.7, 0.2, 0.55, 0.85]) k.win(x, 0.35, 0.08, 0.18, 0.18, -1, 0xfff4d8);
    cross(0.0, 0.62, 0.06, 0.8, 0x80ff90, true);
    k.cy(0.42, 0.42, 0.03, 14, 0.05, 0.77, 0.7, 0x5a5e66); k.gcy(0.38, 0.012, 14, 0.05, 0.8, 0.7, 0x3a3e44); k.gl(0.05, 0.012, 0.3, -0.07, 0.81, 0.7, 0xfff4d0); k.gl(0.05, 0.012, 0.3, 0.17, 0.81, 0.7, 0xfff4d0); k.gl(0.24, 0.012, 0.05, 0.05, 0.81, 0.7, 0xfff4d0);
    for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; k.gl(0.04, 0.02, 0.04, 0.05 + Math.sin(t) * 0.4, 0.8, 0.7 + Math.cos(t) * 0.4, i % 2 ? 0xff4040 : 0xfff4d0); }
    k.mast(-0.7, 0.77, 0.8, 0.9);
    // ambulance : fourgon blanc, bande rouge, gyrophare
    k.bx(0.7, 0.28, 0.3, 0.7, 0.07, -0.7, WHITE); k.bx(0.26, 0.2, 0.3, 1.1, 0.07, -0.7, WHITE); k.gl(0.2, 0.08, 0.02, 1.1, 0.16, -0.86, 0x9ad0e8); k.bx(0.7, 0.04, 0.32, 0.7, 0.15, -0.7, RED);
    cross(0.55, 0.37, -0.86, 0.45, RED, false); k.gl(0.08, 0.04, 0.08, 0.8, 0.35, -0.7, 0xff3030); k.gl(0.08, 0.04, 0.08, 0.6, 0.35, -0.7, 0x4080ff);
    for (const x of [0.45, 1.1]) for (const s of [-1, 1]) k.cy(0.07, 0.07, 0.04, 8, x, 0, -0.7 + s * 0.17, 0x2a2a30);
    k.tent(-0.95, -0.35, 0.7, 0.8, 0.5, WHITE, 0xc0e8c8, 6); cross(-0.95, 0.5, -0.78, 0.4, RED, true);
    bed(-0.2, -0.45); bed(0.2, -0.45, 0, false);
    k.bx(0.3, 0.2, 0.2, 1.2, 0, 0.5, 0x6a7a4a); k.smoke.push([1.2, 0.3, 0.5]);
    k.sandbags(0.1, -1.1, 6, 0, 2); k.barrels(-1.15, -1.0, 2); k.crates(0.45, -1.15, 2, 0.17); k.lamp(-0.4, -0.95, 0.65); k.pole(1.2, -1.05, 1.55); k.pole(-1.2, 0.5, 1.4);
  } else {
    // capsule de soins : coque blanche lisse, croix verte lumineuse, anneau de soin qui tourne, nacelles vitrées, bouclier vert, drone-brancard, hologramme d'hélice
    k.cy(0.82, 0.92, 0.2, 10, 0, 0, 0.45, 0xdfe6ee); k.dome(0.78, 0, 0.2, 0.45, 0xf4f8fc, 0.9, 12);
    k.gtor(0.95, 0.02, 0, 0.14, 0.45, GREEN, Math.PI / 2, 26); k.gtor(0.5, 0.014, 0, 0.55, 0.45, CYAN, Math.PI / 2, 18);
    k.gl(0.09, 0.4, 0.03, 0, 0.14, -0.4, GREEN); k.gl(0.4, 0.09, 0.03, 0, 0.29, -0.4, GREEN); k.door(0.0, -0.36, 0.3, 0.28);
    k.spin(0, 0.45, paint(new THREE.TorusGeometry(0.46, 0.022, 4, 20).rotateX(Math.PI / 2.4).translate(0, 1.1, 0), GREEN)); k.spin(0, 0.45, paint(new THREE.OctahedronGeometry(0.09).translate(0, 1.1, 0), WHITE));
    for (let i = 0; i < 4; i++) { const t = (i / 4) * Math.PI * 2 + 0.4; k.gl(0.14, 0.1, 0.02, Math.sin(t) * 0.68, 0.34, 0.45 + Math.cos(t) * 0.68, 0x90ffb0); }
    bed(-0.95, -0.35, 0); bed(0.95, -0.35, 0); bed(-0.55, -0.95, 0.3, false); bed(0.55, -0.95, -0.3, false);
    // drone-brancard en lévitation
    k.bx(0.2, 0.04, 0.5, -0.15, 0.4, -0.7, 0xdfe6ee); k.gl(0.16, 0.015, 0.44, -0.15, 0.36, -0.7, GREEN); k.spin(-0.15, -0.7, paint(new THREE.TorusGeometry(0.16, 0.008, 4, 12).rotateX(Math.PI / 2).translate(0, 0.35, 0), CYAN));
    // hélice holographique
    k.holo(0.45, 0.0, -0.75, GREEN, 1);
    for (const s of [-1, 1]) { k.cy(0.05, 0.09, 0.9, 6, s * 0.95, 0, 0.75, 0xdfe6ee); k.gtor(0.08, 0.012, s * 0.95, 0.55, 0.75, GREEN, Math.PI / 2, 10); k.gl(0.06, 0.06, 0.06, s * 0.95, 0.9, 0.75, GREEN); k.flags.push([s * 0.95, 1.0, 0.75]); }
    k.crates(1.1, 0.0, 3, 0.17); k.barrels(-1.1, 0.2, 2); k.lamp(-0.3, -1.1, 0.5); k.lamp(0.3, -1.1, 0.5); k.fence(-1.25, -1.2, -0.7, -1.2, 0.22); k.fence(0.7, -1.2, 1.25, -1.2, 0.22);
    k.bubble(1.5, 0, 0.2, GREEN); k.st.fire = 0.55; k.sparks.push([0, 1.2, 0]); k.smoke.push([0.5, 1.0, 0.5]);
  }
  void BLUE; void CLOTH; void DARK; void WOOD; void STONE; void shelf;
}
