import * as THREE from 'three';
import { Parts } from './parts';
import { Fr, ModelKit, PI, H, dk, lt, person, quad } from './frame';

/**
 * La maison des explorateurs (2 × 2), à chaque âge dès le Médiéval. Même plan partout : le logis au fond à gauche, la tour de
 * guet à droite, la cour devant (face à +z) où l'on prépare les départs. Dans la cour : la table des cartes sous un auvent,
 * le grand globe qui tourne sur son pied, les malles cerclées, un canot ou un kayak sur ses tréteaux, la tente montée pour
 * l'essai, le mât au fanion, des explorateurs sac au dos.
 * Médiéval : rez-de-chaussée de pierre, étage à colombages, toit de tuiles pentu, lucarne, cheminée qui fume, porte cintrée
 * sous des bois de cerf, enseigne à la rose des vents ; tour ronde de pierre à toit conique et girouette, mule bâtée.
 * Industriel (Compagnie des explorateurs) : brique à chaînages de pierre blanche, deux étages de hautes fenêtres, corniche, toit
 * d'ardoise à la Mansart, fronton au globe doré ; tour à coupole de cuivre vert et sa sphère armillaire, réverbères, ballon
 * captif amarré.
 * Moderne (Club des explorateurs) : béton blanc et bardage de bois, grande baie vitrée, carte du monde peinte sur le pignon,
 * toit-terrasse, antenne parabolique ; tour métallique de guet et son mur d'escalade ; un 4 × 4 à tente de toit, des kayaks.
 * Futuriste (Base des explorateurs) : modules blancs arrondis à liserés lumineux, dôme de verre où tourne un globe holographique,
 * aire du drone d'éclaireur, rover à six roues
 */
const STONE = 0xcfc6b4, STONE_D = 0xa89f8e, TIMBER = 0x6a4a36, PLASTER = 0xf1e4c8, TILE = 0xc0705a, SLATE = 0x5f6a7e;
const BRICK = 0xb5604c, WHITE_STONE = 0xece4d4, COPPER = 0x6fb59a, BRASS = 0xd9b04a, LEATHER = 0x8a5a36, CANVAS = 0xe2d4b0;
const SEA = 0x3f7fb8, LAND = 0x8cbf6a, SAND = 0xd8c08a;

/** Le globe terrestre : mer, continents en relief, méridien de laiton ; dessiné autour de (0, 0, 0) des pièces `q` */
function globeAt(q: Parts, r: number, seed: number, neon = false) {
  q.add(new THREE.IcosahedronGeometry(r, 2), 0, 0, 0, neon ? 0x3ab8ff : SEA, 0, neon ? 'neon' : false);
  // des terres : amas de bosses aplaties sur la sphère
  for (let i = 0; i < 16; i++) {
    const lat = (H(i, seed) - 0.5) * 2.2, lon = H(i, seed + 1) * PI * 2, s = r * (0.22 + H(i, seed + 2) * 0.22);
    const x = Math.cos(lat) * Math.cos(lon) * r * 0.93, y = Math.sin(lat) * r * 0.93, z = Math.cos(lat) * Math.sin(lon) * r * 0.93;
    const g = new THREE.IcosahedronGeometry(s, 0).scale(1, 0.55, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize()));
    q.add(g, x, y, z, neon ? 0x9affd8 : i % 4 === 0 ? SAND : LAND, 0, neon ? 'neon' : false);
  }
}

/** Globe sur son pied, qui tourne lentement (`kit.turn`) */
function globe(f: Fr, kit: ModelKit, x: number, z: number, r: number, foot: number, seed: number, neon = false) {
  const top = foot + r + 0.02;
  if (!neon) {
    f.cyl(0.05, 0.065, 0.02, 10, x, 0, z, dk(LEATHER, 0.8));
    f.cyl(0.012, 0.016, foot, 6, x, 0.02, z, dk(LEATHER, 0.7));
    // le méridien de laiton, en demi-cercle autour du globe, et le cercle de l'horizon
    f.add(new THREE.TorusGeometry(r + 0.012, 0.006, 4, 20, PI), x, top, z, BRASS, false, PI / 2 + 0.4, 0, PI / 2);
    f.add(new THREE.TorusGeometry(r + 0.02, 0.007, 4, 24).rotateX(PI / 2), x, top, z, BRASS);
    for (const s of [-1, 1]) f.cyl(0.007, 0.007, r * 0.9, 4, x + s * (r + 0.02), top - r * 0.9, z, BRASS);
  }
  const piv = f.w(x, top, z);
  globeAt(kit.turn(piv, [0.2, 1, 0], neon ? 0.08 : 0.04), r * f.k, seed, neon);
}

/** Malle de voyage cerclée : coffre, couvercle bombé, cerclages et coins de laiton */
function trunk(f: Fr, x: number, y: number, z: number, ry: number, c: number, s = 1) {
  const g = f.sub(x, z, ry, s);
  g.box(0.12, 0.06, 0.07, 0, y, 0, c);
  g.add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 0.55, 1), 0, y + 0.06, 0, dk(c, 1.12));
  for (const dx of [-0.04, 0.04]) g.box(0.012, 0.082, 0.074, dx, y, 0, dk(c, 0.55));
  g.box(0.018, 0.018, 0.006, 0, y + 0.04, 0.037, BRASS);
}

/** Canot (ou kayak, `kayak`) retourné à demi sur ses deux tréteaux */
function canoe(f: Fr, x: number, z: number, ry: number, c: number, kayak = false) {
  const g = f.sub(x, z, ry);
  for (const dx of [-0.13, 0.13]) {
    g.box(0.014, 0.08, 0.014, dx, 0, -0.04, 0x7a5a40, false, 0.25); g.box(0.014, 0.08, 0.014, dx, 0, 0.04, 0x7a5a40, false, -0.25);
    g.box(0.016, 0.014, 0.1, dx, 0.075, 0, 0x7a5a40);
  }
  // la coque : un fuseau effilé aux deux bouts, le plat-bord clair, les bancs (canot) ou l'hiloire (kayak)
  const sz = kayak ? 0.75 : 0.95;
  g.add(new THREE.IcosahedronGeometry(0.05, 2).scale(4.4, kayak ? 0.9 : 1.1, sz), 0, 0.16, 0, c);
  g.add(new THREE.CircleGeometry(0.046, 16).rotateX(-PI / 2).scale(4.3, 1, sz * 0.9), 0, 0.2, 0, dk(c, 0.5));
  g.add(new THREE.TorusGeometry(0.047, 0.005, 3, 18).rotateX(PI / 2).scale(4.4, 1, sz), 0, 0.2, 0, lt(c, 0.35));
  
  if (kayak) { g.box(0.3, 0.006, 0.07, 0, 0.2, 0, lt(c, 0.15)); g.cyl(0.026, 0.026, 0.014, 10, 0, 0.2, 0, 0x2a2a30); }
  else for (const dx of [-0.08, 0.08]) g.box(0.012, 0.008, 0.08, dx, 0.195, 0, lt(c, 0.2));
  // la pagaie appuyée
  g.tube([0.2, 0, 0.07], [0.12, 0.2, 0.07], 0.006, 0x9a7a50); g.ball(0.016, 0.2, 0.01, 0.07, 0x9a7a50, false, 0.6, 2, 0.3);
}

/** Tente de toile montée pour l'essai : deux pans, mâts, piquets, rabat ouvert */
function tent(f: Fr, x: number, z: number, ry: number, c: number) {
  const g = f.sub(x, z, ry);
  g.gable(0.26, 0.15, 0.22, 0, 0, 0, c);
  g.add(new THREE.ConeGeometry(0.05, 0.11, 3).rotateX(-0.2), 0.13, 0.05, 0.02, dk(c, 0.45), false, 0, 0, PI / 2);
  for (const dx of [-0.135, 0.135]) g.cyl(0.004, 0.004, 0.17, 4, dx, 0, 0, 0x6a5a48);
  for (const [dx, dz] of [[-0.18, 0.15], [0.18, 0.15], [-0.18, -0.15], [0.18, -0.15]]) { g.tube([dx * 0.72, 0.06, dz * 0.72], [dx, 0, dz], 0.002, 0xd8d0c0); g.box(0.008, 0.02, 0.008, dx, 0, dz, 0x5a4a38); }
}

/** Table des cartes : plateau, carte dépliée et ses tracés, compas, rouleaux, lanterne, deux tabourets */
function mapTable(f: Fr, x: number, z: number, ry: number, wood: number, lamp: boolean) {
  const g = f.sub(x, z, ry);
  for (const [dx, dz] of [[-0.11, -0.06], [0.11, -0.06], [-0.11, 0.06], [0.11, 0.06]]) g.box(0.014, 0.08, 0.014, dx, 0, dz, dk(wood, 0.8));
  g.box(0.26, 0.016, 0.16, 0, 0.08, 0, wood);
  g.box(0.2, 0.003, 0.12, 0.01, 0.097, 0, 0xf2e6c4);
  for (let i = 0; i < 5; i++) g.box(0.03 + H(i, 3) * 0.06, 0.002, 0.004, -0.06 + H(i, 4) * 0.12, 0.1, -0.04 + i * 0.02, i % 2 ? 0x3f7fb8 : 0x8a5a36);
  g.ball(0.022, -0.04, 0.098, 0.02, 0x8cbf6a, false, 1.4, 0.08, 1);
  g.cyl(0.014, 0.014, 0.004, 10, 0.07, 0.098, 0.03, BRASS);
  for (const dz of [-0.05, -0.02]) g.add(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6).rotateZ(PI / 2), -0.04, 0.104, dz - 0.03, 0xe8dcb8);
  if (lamp) { g.box(0.02, 0.03, 0.02, 0.1, 0.096, -0.05, 0xffd27a, true); g.box(0.026, 0.006, 0.026, 0.1, 0.126, -0.05, 0x3a3a3a); }
  for (const dz of [-0.13, 0.13]) { g.cyl(0.025, 0.025, 0.01, 7, 0, 0.05, dz, wood); g.cyl(0.006, 0.006, 0.05, 4, 0, 0, dz, dk(wood, 0.7)); }
}

/** Mât et fanion du club (`sway`), le blason dessus */
function mast(f: Fr, kit: ModelKit, x: number, z: number, h: number, pole: number, cloth: number, emblem: number) {
  f.cyl(0.007, 0.01, h, 6, x, 0, z, pole);
  f.ball(0.012, x, h, z, BRASS);
  const fl = kit.sway(f.w(x, h - 0.03, z), [0, 1, 0], 0.35, 0.5);
  quad(fl, [0, 0, 0], [0.17, -0.01, 0], [0.17, -0.1, 0], [0, -0.1, 0], cloth, false, true);
  quad(fl, [0.06, -0.03, 0.002], [0.11, -0.03, 0.002], [0.11, -0.075, 0.002], [0.06, -0.075, 0.002], emblem, false, true);
}

/** Rose des vents à plat (enseigne, pavé de la cour) dans le repère g, face à +z (debout) ou vers le ciel (`flat`) */
function compassRose(g: Fr, x: number, y: number, z: number, r: number, c: number, star: number, flat = false) {
  const rx = flat ? -PI / 2 : 0;
  g.add(new THREE.CircleGeometry(r, 16), x, y, z, c, false, 0, rx);
  for (let i = 0; i < 4; i++) g.add(new THREE.CircleGeometry(r * 0.9, 3).scale(0.28, 1, 1), x, y + (flat ? 0.001 : 0), z + (flat ? 0 : 0.001), star, false, (i * PI) / 2, rx);
}

/** Explorateur sac au dos, chapeau de brousse */
function explorer(f: Fr, x: number, z: number, ry: number, coat: number, o: { arms?: 'down' | 'one' | 'front' | 'out'; hat?: 'brim' | 'cap' | 'helmet' | 'top'; pack?: number } = {}) {
  person(f, x, z, ry, coat, { legs: 0x5a4e3a, hat: o.hat ?? 'brim', hatColor: o.hat === 'helmet' ? 0xf4f4f0 : 0x9a7a52, arms: o.arms ?? 'down', pack: o.pack ?? 0x6a7a4a });
}

/** Sol de la parcelle : terre battue, cour pavée devant le logis, bordures ; `pave` la couleur des dalles */
function ground(f: Fr, dirt: number, pave: number, joints: number) {
  f.box(1.96, 0.012, 1.96, 0, -0.012, 0, dirt);
  f.box(1.86, 0.008, 0.98, 0, 0, 0.44, pave);
  for (let i = 0; i < 9; i++) f.box(0.004, 0.002, 0.98, -0.84 + i * 0.21, 0.008, 0.44, joints);
  for (let j = 0; j < 5; j++) f.box(1.86, 0.002, 0.004, 0, 0.008, -0.03 + j * 0.2, joints);
}

/** Buisson rond et touffes */
function shrub(f: Fr, x: number, z: number, s: number, c: number) {
  f.ball(0.07 * s, x, 0.04 * s, z, c, false, 1, 0.8, 1, 1);
  f.ball(0.045 * s, x + 0.05 * s, 0.03 * s, z + 0.03 * s, lt(c, 0.12), false, 1, 0.8, 1);
}

// -------------------------------------------------------------- Médiéval
function medieval(f: Fr, kit: ModelKit) {
  ground(f, 0xb8a27e, 0xc8bca4, 0xa89c84);
  // le logis : rez-de-chaussée de pierre, étage en encorbellement à colombages, toit de tuiles pentu
  const cx = -0.3, cz = -0.48, W = 1.0, D = 0.66, zf = cz + D / 2;
  f.box(W, 0.2, D, cx, 0, cz, STONE);
  for (let i = 0; i < 26; i++) f.box(0.06 + H(i, 7) * 0.05, 0.035, 0.008, cx - W / 2 + 0.05 + H(i, 8) * (W - 0.1), 0.02 + (i % 5) * 0.036, zf + 0.002, dk(STONE, 0.82 + H(i, 9) * 0.14));
  f.box(W + 0.06, 0.018, D + 0.06, cx, 0.2, cz, TIMBER);
  f.box(W + 0.04, 0.2, D + 0.04, cx, 0.218, cz, PLASTER);
  // les colombages : poteaux, sablières, croix de Saint-André
  for (let i = 0; i <= 6; i++) f.box(0.018, 0.2, 0.008, cx - (W + 0.04) / 2 + 0.01 + i * ((W + 0.02) / 6), 0.218, zf + 0.024, TIMBER);
  f.box(W + 0.04, 0.016, 0.008, cx, 0.4, zf + 0.024, TIMBER);
  for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) {
    const x0 = cx - (W + 0.04) / 2 + 0.02 + i * ((W + 0.02) / 6), x1 = x0 + (W + 0.02) / 6 - 0.02;
    f.tube([x0, 0.225, zf + 0.026], [x1, 0.395, zf + 0.026], 0.006, TIMBER, false, 4); f.tube([x1, 0.225, zf + 0.026], [x0, 0.395, zf + 0.026], 0.006, TIMBER, false, 4);
  }
  // fenêtres à meneaux de l'étage, éclairées la nuit, et leurs volets
  for (const wx of [cx - 0.07, cx + 0.07]) {
    f.box(0.08, 0.09, 0.01, wx, 0.27, zf + 0.025, 0xffd890, true);
    f.box(0.006, 0.09, 0.012, wx, 0.27, zf + 0.027, TIMBER); f.box(0.08, 0.006, 0.012, wx, 0.315, zf + 0.027, TIMBER);
  }
  f.gable(W + 0.16, 0.36, D + 0.16, cx, 0.418, cz, TILE);
  for (let i = 0; i < 7; i++) f.box(W + 0.16, 0.006, 0.01, cx, 0.43 + i * 0.048, zf + 0.1 - i * 0.068, dk(TILE, 0.85));
  // la lucarne, la cheminée qui fume
  f.box(0.14, 0.1, 0.12, cx + 0.28, 0.5, zf - 0.02, PLASTER); f.gable(0.18, 0.08, 0.16, cx + 0.28, 0.6, zf - 0.02, TILE);
  f.box(0.07, 0.06, 0.01, cx + 0.28, 0.52, zf + 0.04, 0xffd890, true);
  f.box(0.09, 0.3, 0.09, cx - 0.34, 0.5, cz - 0.1, STONE_D); f.box(0.11, 0.02, 0.11, cx - 0.34, 0.8, cz - 0.1, dk(STONE_D, 0.8));
  kit.smoke(f.X(cx - 0.34, cz - 0.1), f.base + 0.84, f.Z(cx - 0.34, cz - 0.1), 0);
  // la porte cintrée, ses ferrures, les bois de cerf au-dessus, l'enseigne à la rose des vents
  const dx = cx - 0.3;
  f.box(0.1, 0.14, 0.01, dx, 0, zf + 0.004, 0x5a3a28); f.add(new THREE.CircleGeometry(0.05, 8, 0, PI), dx, 0.14, zf + 0.009, 0x5a3a28);
  for (const y of [0.04, 0.1]) f.box(0.08, 0.008, 0.004, dx, y, zf + 0.011, 0x3a3a3a);
  f.add(new THREE.CircleGeometry(0.066, 10, 0, PI), dx, 0.14, zf + 0.006, STONE_D);
  for (const s of [-1, 1]) { f.tube([dx, 0.205, zf + 0.02], [dx + s * 0.05, 0.25, zf + 0.02], 0.005, 0xe8dcc0); f.tube([dx + s * 0.03, 0.225, zf + 0.02], [dx + s * 0.045, 0.255, zf + 0.02], 0.004, 0xe8dcc0); }
  f.box(0.03, 0.03, 0.03, dx, 0.195, zf + 0.018, 0x7a5a40);
  f.box(0.14, 0.008, 0.008, cx + 0.12, 0.17, zf + 0.06, 0x3a3a3a); f.box(0.008, 0.03, 0.06, cx + 0.06, 0.155, zf + 0.03, 0x3a3a3a);
  f.box(0.1, 0.1, 0.012, cx + 0.14, 0.065, zf + 0.06, 0x8a5a36);
  compassRose(f, cx + 0.14, 0.115, zf + 0.068, 0.04, 0xf2e6c4, 0xb8392c);
  // fenêtres du bas, grillées
  f.box(0.08, 0.07, 0.01, cx + 0.32, 0.08, zf + 0.004, 0xffd890, true);
  for (let i = 0; i < 3; i++) f.box(0.005, 0.07, 0.012, cx + 0.3 + i * 0.02, 0.08, zf + 0.006, 0x3a3a3a);
  // la tour de guet : ronde, pierre, meurtrières, toit conique, girouette
  const tx = 0.58, tz = -0.5;
  f.cyl(0.21, 0.23, 0.78, 12, tx, 0, tz, STONE);
  for (let i = 0; i < 22; i++) { const a = H(i, 21) * PI * 2, y = 0.04 + H(i, 22) * 0.7; f.box(0.06, 0.03, 0.02, tx + Math.sin(a) * 0.222, y, tz + Math.cos(a) * 0.222, dk(STONE, 0.8 + H(i, 23) * 0.15), false, 0, a); }
  for (const [a, y] of [[0.2, 0.25], [-0.4, 0.48], [0.5, 0.62]]) { f.box(0.02, 0.07, 0.03, tx + Math.sin(a) * 0.215, y, tz + Math.cos(a) * 0.215, 0x2a2420, false, 0, a); }
  f.box(0.07, 0.06, 0.02, tx, 0.66, tz + 0.205, 0xffd890, true);
  f.cyl(0.25, 0.25, 0.03, 12, tx, 0.78, tz, STONE_D);
  f.cone(0.28, 0.36, 12, tx, 0.81, tz, TILE);
  f.cyl(0.004, 0.004, 0.14, 4, tx, 1.15, tz, 0x3a3a3a);
  const vane = kit.sway(f.w(tx, 1.27, tz), [0, 1, 0], 0.8, 0.2);
  vane.box(0.1, 0.004, 0.004, 0.02, 0, 0, 0x3a3a3a); vane.add(new THREE.ConeGeometry(0.014, 0.03, 3).rotateZ(-PI / 2), 0.075, 0, 0, 0x3a3a3a); vane.box(0.03, 0.03, 0.002, -0.03, 0, 0, 0x3a3a3a);
  for (const [dxx, dzz] of [[0.035, 0], [0, 0.035]]) f.box(dxx ? 0.09 : 0.003, 0.003, dzz ? 0.09 : 0.003, tx, 1.22, tz, 0x3a3a3a);
  // la cour : table des cartes sous un auvent rayé, globe, malles, canot, tente, mule bâtée, explorateurs, mât
  const aw = 0x8a3a2e;
  for (const [x, z] of [[-0.75, 0.15], [-0.15, 0.15], [-0.75, 0.6], [-0.15, 0.6]]) f.cyl(0.008, 0.008, 0.3, 5, x, 0, z, 0x6a4a36);
  for (let i = 0; i < 6; i++) f.add(new THREE.BoxGeometry(0.1, 0.006, 0.48), -0.7 + i * 0.1, 0.31, 0.375, i % 2 ? CANVAS : aw, false, 0, 0.08);
  mapTable(f, -0.45, 0.38, 0, 0x9a7048, true);
  explorer(f, -0.45, 0.22, 0, 0x6a7a4a, { arms: 'front' });
  person(f, -0.6, 0.45, PI / 2 + 0.3, 0x7a3a3a, { hat: 'cap', hatColor: 0x3a2a2a, arms: 'front' });
  globe(f, kit, 0.16, 0.36, 0.09, 0.12, 1);
  trunk(f, -0.05, 0, 0.0, 0.2, LEATHER); trunk(f, -0.02, 0.09, -0.01, -0.1, dk(LEATHER, 0.8), 0.85); trunk(f, 0.12, 0, 0.06, 0.6, 0x6a4a3a);
  canoe(f, 0.6, 0.22, 0.1, 0x3a7a5a);
  // la réserve de bois et la carriole sous la tour, la lanterne au coin du logis, des jardinières à l'étage
  for (let i = 0; i < 9; i++) f.add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6).rotateX(PI / 2), 0.3 + (i % 3) * 0.034 + (i > 5 ? 0.017 : 0), 0.016 + Math.floor(i / 3) * 0.028, -0.86, dk(0x9a7048, 0.85 + H(i, 31) * 0.2));
  f.box(0.012, 0.1, 0.012, -0.84, 0.25, zf + 0.04, 0x3a3a3a); f.box(0.03, 0.04, 0.03, -0.84, 0.2, zf + 0.06, 0xffd27a, true);
  for (const wx of [cx - 0.07, cx + 0.07]) { f.box(0.09, 0.025, 0.035, wx, 0.25, zf + 0.04, 0x8a5a36); for (let k = 0; k < 4; k++) f.ball(0.014, wx - 0.03 + k * 0.02, 0.28, zf + 0.04, k % 2 ? 0xd84a6a : 0xf2c23a); }
  f.box(0.15, 0.1, 0.01, cx + 0.33, 0.235, zf + 0.026, 0xf2e6c4); for (let k = 0; k < 4; k++) f.box(0.1, 0.004, 0.004, cx + 0.33, 0.255 + k * 0.018, zf + 0.032, k % 2 ? 0x3f7fb8 : 0x8a5a36);
  tent(f, 0.62, 0.72, -0.3, CANVAS);
  // la mule bâtée et son guide
  const m = f.sub(0.12, 0.76, PI / 2);
  m.box(0.16, 0.07, 0.07, 0, 0.08, 0, 0x7a6a5a);
  for (const [a, b] of [[-0.06, -0.025], [0.06, -0.025], [-0.06, 0.025], [0.06, 0.025]]) m.box(0.02, 0.08, 0.02, a, 0, b, 0x5a4e42);
  m.box(0.06, 0.05, 0.04, 0.1, 0.13, 0, 0x7a6a5a); m.box(0.04, 0.03, 0.035, 0.14, 0.12, 0, 0x6a5a4a);
  for (const s of [-1, 1]) { m.box(0.01, 0.05, 0.012, 0.1, 0.18, s * 0.012, 0x6a5a4a); m.box(0.1, 0.06, 0.03, 0, 0.11, s * 0.05, CANVAS); }
  m.box(0.06, 0.04, 0.1, 0, 0.15, 0, LEATHER);
  explorer(f, 0.32, 0.86, PI * 0.9, 0x4a5a7a, { arms: 'one' });
  mast(f, kit, -0.86, 0.86, 0.7, 0x6a4a36, 0x2a5a9a, 0xe8c66a);
  // muret de pierre sèche sur les côtés, barils, ballots de cordes, buissons
  for (const x of [-0.95, 0.95]) for (let i = 0; i < 6; i++) f.box(0.07, 0.07, 0.15, x, 0, -0.85 + i * 0.17 + (i > 2 ? 0.02 : 0), dk(STONE, 0.85 + H(i, x > 0 ? 40 : 41) * 0.12));
  for (const [x, z] of [[0.86, -0.08], [0.78, -0.12]]) { f.cyl(0.04, 0.035, 0.1, 8, x, 0, z, 0x8a6040); f.cyl(0.042, 0.042, 0.01, 8, x, 0.07, z, 0x3a3a3a); }
  f.add(new THREE.TorusGeometry(0.035, 0.014, 4, 10).rotateX(PI / 2), 0.3, 0.014, 0.12, 0xc8b080);
  shrub(f, -0.9, -0.05, 1, 0x7fae6a); shrub(f, 0.35, -0.08, 0.8, 0x8aba6e);
}

// -------------------------------------------------------------- Industriel
function industrial(f: Fr, kit: ModelKit) {
  ground(f, 0xb0a48e, 0xd2ccc0, 0xb0a99c);
  const cx = -0.3, cz = -0.46, W = 1.04, D = 0.7, zf = cz + D / 2, H1 = 0.46;
  // le corps de brique et ses chaînages de pierre blanche
  f.box(W, H1, D, cx, 0, cz, BRICK);
  f.box(W + 0.02, 0.05, D + 0.02, cx, 0, cz, WHITE_STONE);
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) f.box(0.05, 0.03, 0.012, cx + s * (W / 2 - 0.02), 0.06 + i * 0.05, zf + 0.002, i % 2 ? WHITE_STONE : dk(WHITE_STONE, 0.92));
  f.box(W + 0.04, 0.03, D + 0.04, cx, 0.23, cz, WHITE_STONE);
  f.box(W + 0.06, 0.04, D + 0.06, cx, H1, cz, WHITE_STONE);
  for (let i = 0; i < 14; i++) f.box(0.02, 0.02, 0.02, cx - W / 2 + 0.04 + i * ((W - 0.08) / 13), H1 - 0.02, zf + 0.02, dk(WHITE_STONE, 0.85));
  // deux étages de hautes fenêtres à linteau, éclairées
  for (const y of [0.08, 0.28]) for (const wx of [-0.38, -0.2, 0.2, 0.38]) {
    f.box(0.08, 0.12, 0.01, cx + wx, y, zf + 0.003, 0xffe2a0, true);
    f.box(0.005, 0.12, 0.012, cx + wx, y, zf + 0.005, 0xf4f0e8); f.box(0.08, 0.005, 0.012, cx + wx, y + 0.07, zf + 0.005, 0xf4f0e8);
    f.box(0.1, 0.022, 0.016, cx + wx, y + 0.12, zf + 0.006, WHITE_STONE); f.box(0.1, 0.012, 0.03, cx + wx, y - 0.012, zf + 0.012, WHITE_STONE);
  }
  // l'entrée : perron, colonnes, porte à imposte, fronton et son globe doré
  f.box(0.26, 0.03, 0.12, cx, 0, zf + 0.06, WHITE_STONE); f.box(0.22, 0.03, 0.08, cx, 0.03, zf + 0.04, lt(WHITE_STONE, 0.2));
  for (const s of [-1, 1]) f.cyl(0.016, 0.018, 0.2, 8, cx + s * 0.09, 0.06, zf + 0.06, lt(WHITE_STONE, 0.3));
  f.box(0.1, 0.16, 0.01, cx, 0.06, zf + 0.003, 0x4a2e22); f.add(new THREE.CircleGeometry(0.05, 8, 0, PI), cx, 0.22, zf + 0.004, 0xffe2a0, true);
  f.box(0.24, 0.03, 0.1, cx, 0.26, zf + 0.05, WHITE_STONE);
  f.add(new THREE.ConeGeometry(0.15, 0.08, 3).scale(1, 1, 0.25).rotateY(0), cx, 0.33, zf + 0.06, WHITE_STONE);
  f.ball(0.022, cx, 0.315, zf + 0.085, BRASS);
  // le toit à la Mansart : brisis d'ardoise, lucarnes, terrasson, cheminées
  f.add(new THREE.CylinderGeometry(0.42, 0.6, 0.18, 4, 1).rotateY(PI / 4).scale(W / 0.86, 1, D / 0.86), cx, H1 + 0.04 + 0.09, cz, SLATE);
  f.box(W * 0.66, 0.04, D * 0.62, cx, H1 + 0.22, cz, dk(SLATE, 0.8));
  for (const wx of [-0.3, 0, 0.3]) { f.box(0.08, 0.08, 0.06, cx + wx, H1 + 0.08, zf - 0.04, WHITE_STONE); f.box(0.05, 0.05, 0.01, cx + wx, H1 + 0.09, zf - 0.008, 0xffe2a0, true); f.add(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 8, 1, false, 0, PI).rotateZ(PI / 2).rotateY(PI / 2), cx + wx, H1 + 0.16, zf - 0.04, SLATE); }
  for (const s of [-1, 1]) { f.box(0.07, 0.16, 0.07, cx + s * 0.4, H1 + 0.16, cz - 0.1, BRICK); f.box(0.09, 0.02, 0.09, cx + s * 0.4, H1 + 0.32, cz - 0.1, WHITE_STONE); }
  kit.smoke(f.X(cx - 0.4, cz - 0.1), f.base + H1 + 0.36, f.Z(cx - 0.4, cz - 0.1), 0);
  // la plaque de la société au-dessus de la porte
  f.box(0.3, 0.04, 0.008, cx, 0.4, zf + 0.004, 0x2a3a5a); for (let i = 0; i < 7; i++) f.box(0.025, 0.014, 0.004, cx - 0.11 + i * 0.037, 0.413, zf + 0.009, BRASS);
  // la tour à coupole de cuivre et sa sphère armillaire
  const tx = 0.6, tz = -0.48;
  f.box(0.36, 0.62, 0.36, tx, 0, tz, BRICK);
  for (const y of [0, 0.3, 0.6]) f.box(0.38, 0.03, 0.38, tx, y, tz, WHITE_STONE);
  for (const y of [0.1, 0.4]) { f.box(0.07, 0.14, 0.01, tx, y, tz + 0.182, 0xffe2a0, true); f.add(new THREE.CircleGeometry(0.035, 8, 0, PI), tx, y + 0.14, tz + 0.183, 0xffe2a0, true); }
  f.cyl(0.17, 0.19, 0.12, 12, tx, 0.63, tz, WHITE_STONE);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; f.box(0.03, 0.08, 0.01, tx + Math.sin(a) * 0.18, 0.65, tz + Math.cos(a) * 0.18, 0xffe2a0, true, 0, a); }
  f.add(new THREE.SphereGeometry(0.19, 12, 6, 0, PI * 2, 0, PI / 2), tx, 0.75, tz, COPPER);
  for (let i = 0; i < 8; i++) f.add(new THREE.TorusGeometry(0.19, 0.004, 3, 12, PI / 2).rotateY((i / 8) * PI * 2), tx, 0.75, tz, dk(COPPER, 0.8), false, 0, 0);
  f.cyl(0.012, 0.02, 0.1, 6, tx, 0.93, tz, BRASS);
  const arm = kit.turn(f.w(tx, 1.08, tz), [0, 1, 0], 0.05);
  for (const r of [0, PI / 2, PI / 4]) arm.add(new THREE.TorusGeometry(0.07, 0.005, 4, 18).rotateY(r), 0, 0, 0, BRASS);
  arm.add(new THREE.TorusGeometry(0.07, 0.005, 4, 18).rotateX(PI / 2 - 0.4), 0, 0, 0, BRASS);
  arm.add(new THREE.IcosahedronGeometry(0.022, 1), 0, 0, 0, SEA);
  // la cour : réverbères, globe, table des cartes, malles, ballon captif, canot, explorateurs en casque colonial
  for (const x of [-0.85, 0.25]) { f.cyl(0.008, 0.01, 0.4, 6, x, 0, 0.12, 0x2a2e34); f.box(0.04, 0.05, 0.04, x, 0.4, 0.12, 0xffe2a0, true); f.cone(0.035, 0.03, 4, x, 0.45, 0.12, 0x2a2e34); }
  globe(f, kit, -0.6, 0.42, 0.1, 0.14, 2);
  mapTable(f, -0.25, 0.45, 0.1, 0x6a4a36, false);
  explorer(f, -0.25, 0.6, PI, 0xd8ccb0, { hat: 'helmet', arms: 'front' });
  person(f, -0.1, 0.5, -PI / 2, 0x2a2a3a, { hat: 'top', arms: 'front' });
  trunk(f, 0.12, 0, 0.12, 0, 0x5a4a6a); trunk(f, 0.15, 0.09, 0.12, 0.3, LEATHER, 0.9); trunk(f, 0.0, 0, 0.2, 1.2, 0x6a5040);
  canoe(f, 0.6, 0.12, 0, 0x6a8a5a);
  // le ballon captif : nacelle d'osier, filet, amarres
  const bx = 0.6, bz = 0.66;
  f.box(0.1, 0.07, 0.1, bx, 0, bz, 0xb08a58);
  for (const [a, b] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) f.tube([bx + a, 0.07, bz + b], [bx + a * 1.6, 0.66, bz + b * 1.6], 0.002, 0x6a5a48);
  const bal = kit.sway(f.w(bx, 0.86, bz), [1, 0, 0.3], 0.06, 0.25);
  bal.add(new THREE.SphereGeometry(0.19, 12, 8), 0, 0, 0, 0xd8483a);
  for (let i = 0; i < 6; i++) bal.add(new THREE.SphereGeometry(0.192, 2, 8, (i / 6) * PI * 2, 0.18), 0, 0, 0, 0xf4e8c8);
  bal.add(new THREE.CylinderGeometry(0.04, 0.08, 0.06, 8), 0, -0.2, 0, 0xd8483a);
  for (const s of [-1, 1]) { f.tube([bx + s * 0.22, 0, bz + 0.12], [bx + s * 0.04, 0.07, bz + 0.03], 0.002, 0x6a5a48); f.box(0.02, 0.03, 0.02, bx + s * 0.22, 0, bz + 0.12, 0x5a5a5a); }
  for (let i = 0; i < 3; i++) f.box(0.04, 0.05, 0.03, bx - 0.03 + i * 0.03, 0.07, bz + 0.0, 0xc8b080);
  mast(f, kit, 0.9, 0.9, 0.62, 0x2a2e34, 0x1f4a8a, 0xe8c66a);
  // grille de fonte sur les côtés, massifs
  for (const x of [-0.96, 0.96]) { f.box(0.012, 0.1, 1.9, x, 0, 0, 0x2a2e34); for (let i = 0; i < 16; i++) f.cyl(0.004, 0.004, 0.16, 4, x, 0, -0.92 + i * 0.122, 0x2a2e34); }
  shrub(f, -0.85, -0.02, 0.9, 0x6fa85a); shrub(f, 0.3, -0.05, 0.8, 0x7fb87f);
}

// -------------------------------------------------------------- Moderne
function modern(f: Fr, kit: ModelKit) {
  ground(f, 0x9ab07a, 0xd4d2cc, 0xb8b6b0);
  const cx = -0.3, cz = -0.46, W = 1.08, D = 0.72, zf = cz + D / 2, WOOD = 0xb07a4a, CONC = 0xeceae4;
  // un bloc de béton blanc, l'étage en porte-à-faux bardé de bois, la grande baie vitrée
  f.box(W, 0.24, D, cx, 0, cz, CONC);
  f.box(W * 0.8, 0.18, 0.01, cx + 0.06, 0.03, zf + 0.002, 0x9fc8e0, true);
  for (let i = 0; i <= 8; i++) f.box(0.008, 0.18, 0.014, cx - W * 0.34 + i * (W * 0.8 / 8), 0.03, zf + 0.004, 0x3a3e44);
  f.box(W + 0.08, 0.22, D + 0.12, cx - 0.04, 0.24, cz + 0.06, WOOD);
  for (let i = 0; i < 22; i++) f.box(0.006, 0.22, 0.008, cx - W / 2 - 0.07 + i * ((W + 0.08) / 21), 0.24, zf + 0.122, dk(WOOD, 0.8));
  f.box(0.6, 0.1, 0.012, cx + 0.12, 0.3, zf + 0.126, 0x9fc8e0, true);
  f.box(W + 0.12, 0.02, D + 0.16, cx - 0.04, 0.46, cz + 0.06, 0x5a5e64);
  f.box(W + 0.08, 0.004, D + 0.12, cx - 0.04, 0.48, cz + 0.06, 0xc8c4b8);
  f.box(0.5, 0.006, D * 0.55, cx + 0.12, 0.482, cz + 0.2, 0xb08a5a);
  for (let i = 0; i < 10; i++) f.box(0.004, 0.003, D * 0.55, cx - 0.12 + i * 0.05, 0.488, cz + 0.2, dk(0xb08a5a, 0.8));
  for (const [x, z] of [[cx - 0.5, cz + 0.36], [cx + 0.42, cz + 0.36], [cx + 0.42, cz - 0.04]]) { f.box(0.08, 0.05, 0.08, x, 0.48, z, 0x8a8f96); f.ball(0.05, x, 0.56, z, 0x6fa85a, false, 1, 0.9, 1, 1); }
  for (const x of [cx - 0.02, cx + 0.2]) { f.box(0.12, 0.012, 0.05, x, 0.51, cz + 0.22, 0xf4f4f0); f.box(0.12, 0.03, 0.006, x, 0.51, cz + 0.2, 0xf4f4f0); }
  // la carte du monde peinte sur le pignon de gauche
  const mx = cx - W / 2 - 0.006;
  f.box(0.004, 0.18, 0.5, mx, 0.03, cz, 0x3f7fb8);
  for (let i = 0; i < 10; i++) f.box(0.006, 0.03 + H(i, 51) * 0.06, 0.04 + H(i, 52) * 0.08, mx - 0.001, 0.05 + H(i, 53) * 0.1, cz - 0.2 + H(i, 54) * 0.4, LAND);
  // la terrasse du toit : garde-corps vitré, parasol, antenne parabolique, panneaux solaires
  for (const s of [-1, 1]) f.box(W + 0.1, 0.06, 0.006, cx - 0.04, 0.48, cz + 0.06 + s * (D / 2 + 0.07), 0xbfe0ee);
  f.add(new THREE.SphereGeometry(0.09, 12, 6, 0, PI * 2, 0, PI / 2).scale(1, 0.4, 1).rotateX(-0.6), cx + 0.3, 0.6, cz - 0.1, 0xf4f4f0);
  f.cyl(0.008, 0.012, 0.12, 5, cx + 0.3, 0.48, cz - 0.1, 0x8a8f96);
  for (let i = 0; i < 4; i++) for (const dz of [-0.16, -0.02]) { f.add(new THREE.BoxGeometry(0.15, 0.008, 0.11), cx - 0.5 + i * 0.17, 0.52, cz + dz, 0x2a3a6a, false, 0, -0.3); f.box(0.008, 0.04, 0.008, cx - 0.5 + i * 0.17, 0.48, cz + dz - 0.04, 0x8a8f96); }
  f.cyl(0.004, 0.004, 0.14, 4, cx - 0.1, 0.48, cz + 0.2, 0x8a8f96); f.cone(0.12, 0.04, 8, cx - 0.1, 0.62, cz + 0.2, 0xe8642a);
  person(f, cx + 0.05, cz + 0.28, PI, 0xe8642a, { y: 0.47 });
  // l'entrée : auvent de béton, porte vitrée, enseigne à la rose des vents
  f.box(0.3, 0.02, 0.16, cx - 0.33, 0.22, zf + 0.08, CONC);
  f.box(0.12, 0.18, 0.01, cx - 0.33, 0.0, zf + 0.004, 0x5a7a8a, true);
  f.box(0.16, 0.16, 0.012, cx - 0.33, 0.26, zf + 0.128, 0xf4f4f0);
  compassRose(f, cx - 0.33, 0.34, zf + 0.136, 0.06, 0xe8642a, 0x2a3a5a);
  // la tour de guet métallique et son mur d'escalade
  const tx = 0.6, tz = -0.5, th = 0.9;
  for (const [a, b] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) f.box(0.025, th, 0.025, tx + a, 0, tz + b, 0x3a4048);
  for (let y = 0.15; y < th; y += 0.2) for (const s of [-1, 1]) { f.tube([tx - 0.14, y, tz + s * 0.14], [tx + 0.14, y + 0.2, tz + s * 0.14], 0.005, 0x3a4048); f.tube([tx + s * 0.14, y, tz - 0.14], [tx + s * 0.14, y + 0.2, tz + 0.14], 0.005, 0x3a4048); }
  f.box(0.36, 0.02, 0.36, tx, th, tz, 0x5a5e64);
  f.box(0.36, 0.14, 0.36, tx, th + 0.02, tz, WOOD); f.box(0.3, 0.06, 0.37, tx, th + 0.06, tz, 0x9fc8e0, true);
  f.box(0.42, 0.02, 0.42, tx, th + 0.16, tz, 0x3a4048);
  f.cyl(0.004, 0.004, 0.2, 4, tx + 0.12, th + 0.18, tz, 0x8a8f96); f.ball(0.01, tx + 0.12, th + 0.38, tz, 0xff4a3a, true);
  // le mur d'escalade (face avant de la tour) : panneau, prises de couleur, un grimpeur et sa corde
  f.box(0.3, th - 0.05, 0.016, tx, 0.0, tz + 0.16, 0xd8d4c8);
  for (let i = 0; i < 24; i++) f.ball(0.012, tx - 0.13 + H(i, 61) * 0.26, 0.04 + H(i, 62) * (th - 0.12), tz + 0.172, [0xe8642a, 0x3ab84a, 0x3a6ab8, 0xf2c23a, 0xd83a8a][i % 5]);
  f.tube([tx + 0.05, th, tz + 0.18], [tx + 0.05, 0.02, tz + 0.2], 0.002, 0xe8642a);
  person(f, tx + 0.05, tz + 0.2, PI, 0x3ab84a, { y: 0.42, arms: 'up', hat: 'helmet', hatColor: 0xf2c23a });
  person(f, tx - 0.05, tz + 0.3, PI, 0x3a6ab8, { arms: 'one', hat: 'none' });
  // le 4 × 4 à tente de toit, les kayaks sur leur support, le globe, la table, les explorateurs
  const v = f.sub(0.55, 0.42, -0.35);
  v.box(0.36, 0.08, 0.17, 0, 0.04, 0, 0x5a6a3a);
  v.box(0.22, 0.08, 0.16, -0.04, 0.12, 0, 0x5a6a3a); v.box(0.006, 0.06, 0.15, 0.075, 0.13, 0, 0x9fc8e0);
  for (const s of [-1, 1]) v.box(0.18, 0.05, 0.004, -0.04, 0.14, s * 0.081, 0x9fc8e0);
  for (const [a, b] of [[-0.11, -0.09], [0.11, -0.09], [-0.11, 0.09], [0.11, 0.09]]) v.add(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 10).rotateX(PI / 2), a, 0.04, b, 0x2a2a2e);
  v.box(0.2, 0.05, 0.17, -0.04, 0.2, 0, 0xe8a23a); v.box(0.06, 0.04, 0.008, 0.18, 0.06, 0, 0x2a2a2e); v.box(0.01, 0.1, 0.14, -0.19, 0.04, 0, 0x3a3a3e);
  v.cyl(0.04, 0.04, 0.03, 10, -0.2, 0.08, 0, 0x2a2a2e);
  for (const z of [-0.06, 0.06]) v.box(0.02, 0.02, 0.02, 0.18, 0.08, z, 0xfff1c9, true);
  for (const [x, c] of [[-0.62, 0xe8642a], [-0.3, 0xf2c23a]] as [number, number][]) canoe(f, x, 0.82, 0, c, true);
  // le râtelier des vélos tout-terrain, la borne de la carte des sentiers
  for (let i = 0; i < 3; i++) { const bx = -0.9, bz = 0.1 + i * 0.12; for (const dz of [-0.045, 0.045]) f.add(new THREE.TorusGeometry(0.03, 0.006, 4, 12), bx, 0.036, bz + dz, 0x2a2a30, false, 0, 0, PI / 2); f.tube([bx, 0.036, bz - 0.045], [bx, 0.075, bz + 0.02], 0.005, [0x3ab84a, 0xe8642a, 0x3a6ab8][i]); f.tube([bx, 0.075, bz + 0.02], [bx, 0.036, bz + 0.045], 0.005, [0x3ab84a, 0xe8642a, 0x3a6ab8][i]); f.box(0.04, 0.006, 0.006, bx, 0.09, bz + 0.03, 0x2a2a30); }
  f.box(0.012, 0.16, 0.012, -0.9, 0, 0.5, 0x3a4048); f.box(0.16, 0.11, 0.012, -0.9, 0.12, 0.5, 0x3a6a4a, false, 0, PI / 2); f.box(0.13, 0.08, 0.004, -0.893, 0.135, 0.5, 0xd8e8c0, false, 0, PI / 2);
  globe(f, kit, -0.08, 0.3, 0.09, 0.13, 3);
  mapTable(f, -0.55, 0.36, 0, 0xd8d4cc, false);
  explorer(f, -0.55, 0.5, PI, 0xe8642a, { hat: 'cap', arms: 'front', pack: 0x3a6ab8 });
  explorer(f, -0.38, 0.4, -PI / 2, 0x3a7a5a, { arms: 'front' });
  trunk(f, 0.12, 0, 0.12, 0.2, 0x3a5a8a); trunk(f, 0.22, 0, 0.18, -0.4, 0xe8a23a, 0.9);
  tent(f, 0.12, 0.78, 0.2, 0xe8642a);
  mast(f, kit, 0.92, 0.92, 0.66, 0xc8ccd0, 0x1f4a8a, 0xf4f4f0);
  for (const [x, z] of [[-0.9, -0.05], [0.3, -0.06], [0.9, 0.0]]) shrub(f, x, z, 0.85, 0x6fa85a);
}

// -------------------------------------------------------------- Futuriste
function future(f: Fr, kit: ModelKit) {
  ground(f, 0xc8ced4, 0xe2e6ea, 0xc8d0d8);
  const W = 0xf2f4f6, NEON = 0x5ae0ff, PANEL = 0xdfe4ea;
  // des allées lumineuses dans le dallage, vers l'entrée et l'aire du drone
  f.box(0.03, 0.003, 0.9, -0.2, 0.008, 0.5, NEON, 'neon'); f.box(0.5, 0.003, 0.03, -0.45, 0.008, 0.45, NEON, 'neon');
  // deux modules bas et larges : bandeau de hublots, liserés lumineux, coque à panneaux, reliés par un sas vitré
  for (const [x, z, r, h] of [[-0.5, -0.5, 0.38, 0.26], [0.08, -0.66, 0.26, 0.22]] as [number, number, number, number][]) {
    f.cyl(r, r + 0.03, h, 24, x, 0, z, W);
    for (let k = 1; k < 3; k++) f.add(new THREE.TorusGeometry(r + 0.004 + 0.01 * (1 - k / 3), 0.003, 3, 24).rotateX(PI / 2), x, (h * k) / 3, z, PANEL);
    f.add(new THREE.SphereGeometry(r, 24, 8, 0, PI * 2, 0, PI / 2).scale(1, 0.32, 1), x, h, z, lt(W, 0.3));
    f.add(new THREE.TorusGeometry(r + 0.006, 0.007, 3, 24).rotateX(PI / 2), x, h, z, NEON, 'neon');
    for (let i = 0; i < 6; i++) f.add(new THREE.TorusGeometry(r, 0.004, 3, 12, PI / 2).rotateY((i / 6) * PI * 2).scale(1, 0.32, 1), x, h, z, PANEL);
    f.cyl(r * 0.16, r * 0.19, 0.03, 12, x - r * 0.1, h + r * 0.24, z - r * 0.5, PANEL); f.add(new THREE.TorusGeometry(r * 0.16, 0.004, 3, 12).rotateX(PI / 2), x - r * 0.1, h + r * 0.24 + 0.03, z - r * 0.5, NEON, 'neon');
    f.add(new THREE.CylinderGeometry(r + 0.003, r + 0.008, 0.045, 24, 1, true, -1.2, 2.4), x, h * 0.45, z, 0x2a4a6a, true);
    for (let i = 0; i < 7; i++) { const a = -1.15 + i * 0.38; f.box(0.006, 0.05, 0.012, x + Math.sin(a) * (r + 0.008), h * 0.45, z + Math.cos(a) * (r + 0.008), PANEL, false, 0, a); }
    // sur le toit : une antenne, des cellules solaires
    f.cyl(0.004, 0.006, 0.18, 4, x + r * 0.4, h + r * 0.25, z - r * 0.3, 0xc8ccd0); f.ball(0.01, x + r * 0.4, h + r * 0.25 + 0.18, z - r * 0.3, 0xff4a6a, true);
    for (let i = 0; i < 3; i++) f.add(new THREE.BoxGeometry(0.1, 0.006, 0.07), x - r * 0.3 + i * 0.1, h + r * 0.3, z + r * 0.05, 0x2a3a6a, false, 0, -0.25);
  }
  f.add(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 12).rotateZ(PI / 2), -0.2, 0.09, -0.6, 0xbfe8f8, true);
  for (const x of [-0.27, -0.2, -0.13]) f.add(new THREE.TorusGeometry(0.078, 0.006, 3, 12).rotateY(PI / 2), x, 0.09, -0.6, PANEL);
  // l'entrée : sas, porte coulissante, auvent courbe, plaque à la rose des vents
  f.box(0.2, 0.17, 0.1, -0.5, 0, -0.1, W); f.box(0.12, 0.15, 0.006, -0.5, 0, -0.048, 0x3a6a8a, true);
  f.add(new THREE.CylinderGeometry(0.14, 0.14, 0.24, 12, 1, true, -PI / 2, PI).rotateZ(PI / 2).scale(1, 0.35, 1), -0.5, 0.19, -0.04, PANEL);
  f.box(0.2, 0.006, 0.006, -0.5, 0.168, -0.044, NEON, 'neon');
  compassRose(f, -0.36, 0.11, -0.046, 0.035, 0x2a3a6a, NEON);
  // le dôme ajouré : nervures, quelques pans de verre, et dedans le globe holographique qui tourne
  const tx = 0.58, tz = -0.36;
  f.cyl(0.3, 0.32, 0.08, 24, tx, 0, tz, W);
  f.add(new THREE.TorusGeometry(0.31, 0.008, 3, 24).rotateX(PI / 2), tx, 0.08, tz, NEON, 'neon');
  for (let i = 0; i < 8; i++) f.add(new THREE.TorusGeometry(0.28, 0.006, 3, 14, PI / 2).rotateY((i / 8) * PI * 2), tx, 0.08, tz, PANEL);
  for (const y of [0.12, 0.2]) { const rr = Math.sqrt(0.28 * 0.28 - y * y); f.add(new THREE.TorusGeometry(rr, 0.005, 3, 20).rotateX(PI / 2), tx, 0.08 + y, tz, PANEL); }
  f.add(new THREE.SphereGeometry(0.276, 16, 8, PI * 0.9, PI * 0.7, 0, PI / 2), tx, 0.08, tz, 0xbfe8f8, true);
  f.cyl(0.05, 0.07, 0.07, 12, tx, 0.08, tz, 0x8a96a2);
  f.add(new THREE.TorusGeometry(0.06, 0.006, 3, 16).rotateX(PI / 2), tx, 0.152, tz, NEON, 'neon');
  globe(f, kit, tx, tz, 0.1, 0.17, 4, true);
  // l'aire du drone d'éclaireur : plot, anneau, et le drone en vol stationnaire
  f.cyl(0.17, 0.18, 0.025, 20, -0.55, 0, 0.45, 0x5a6068);
  f.add(new THREE.TorusGeometry(0.14, 0.009, 3, 20).rotateX(PI / 2), -0.55, 0.027, 0.45, NEON, 'neon');
  f.box(0.12, 0.003, 0.025, -0.55, 0.027, 0.45, 0xf2c23a); f.box(0.025, 0.003, 0.12, -0.55, 0.027, 0.45, 0xf2c23a);
  const d = kit.sway(f.w(-0.55, 0.36, 0.45), [0, 0, 1], 0.08, 0.6);
  d.box(0.1, 0.035, 0.1, 0, 0, 0, W); d.box(0.04, 0.025, 0.04, 0, -0.03, 0.02, 0x2a2e34); d.box(0.02, 0.02, 0.006, 0, -0.025, 0.043, 0x9fe8ff, 0, true);
  for (const [a, b] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) {
    d.box(0.11, 0.01, 0.014, a / 2, 0.012, b / 2, PANEL, -Math.atan2(b, a));
    d.cyl(0.045, 0.045, 0.004, 12, a, 0.022, b, 0x8adfff, 'neon'); d.cyl(0.008, 0.008, 0.02, 5, a, 0.01, b, 0x5a6068);
  }
  // le rover à six roues, son mât de caméras, ses panneaux
  const v = f.sub(0.38, 0.45, -0.4);
  v.box(0.3, 0.07, 0.16, 0, 0.07, 0, W); v.box(0.14, 0.06, 0.14, 0.05, 0.14, 0, 0x9fe8ff, true);
  for (const a of [-0.11, 0, 0.11]) for (const s of [-1, 1]) v.add(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 10).rotateX(PI / 2), a, 0.038, s * 0.095, 0x3a3e44);
  v.box(0.32, 0.006, 0.22, -0.03, 0.2, 0, 0x2a3a6a); v.cyl(0.006, 0.006, 0.12, 4, -0.1, 0.2, 0, 0xc8ccd0); v.box(0.04, 0.03, 0.03, -0.1, 0.32, 0, 0x2a2e34);
  v.box(0.3, 0.006, 0.17, 0, 0.13, 0, NEON, 'neon');
  // la table des cartes holographique, les explorateurs en combinaison, les caissons de matériel
  f.cyl(0.05, 0.07, 0.09, 10, -0.05, 0, 0.3, W);
  f.cyl(0.12, 0.12, 0.004, 16, -0.05, 0.1, 0.3, NEON, 'neon');
  for (let i = 0; i < 5; i++) f.box(0.03 + H(i, 71) * 0.05, 0.03 + H(i, 72) * 0.06, 0.03, -0.1 + H(i, 73) * 0.1, 0.11, 0.26 + H(i, 74) * 0.08, 0x9affd8, 'neon');
  for (const [x, z, ry] of [[-0.05, 0.48, PI], [0.1, 0.32, -PI / 2]] as [number, number, number][]) person(f, x, z, ry, W, { legs: 0xc8ccd0, hat: 'helmet', hatColor: PANEL, arms: 'front', pack: 0x8a96a2 });
  person(f, 0.7, 0.05, -0.5, 0xe8642a, { legs: 0xc8ccd0, hat: 'none', arms: 'one' });
  for (const [x, z] of [[0.14, -0.2], [0.26, -0.18], [0.2, -0.08]]) { f.box(0.1, 0.07, 0.07, x, 0, z, PANEL); f.box(0.1, 0.008, 0.072, x, 0.04, z, NEON, 'neon'); }
  mast(f, kit, 0.92, 0.9, 0.7, PANEL, 0x2a3a6a, NEON);
  for (const [x, z] of [[-0.92, 0.0], [0.92, 0.2], [-0.92, 0.85]]) { f.cyl(0.05, 0.06, 0.06, 10, x, 0, z, W); f.ball(0.06, x, 0.1, z, 0x7fb87f, false, 1, 0.9, 1, 1); }
}

/** La maison des explorateurs à l'âge `age` (2 à 5), sur sa parcelle de 2 × 2 */
export function explorersHouse(p: Parts, age: number, kit: ModelKit) {
  const f = new Fr(p);
  if (age >= 5) future(f, kit);
  else if (age === 4) modern(f, kit);
  else if (age === 3) industrial(f, kit);
  else medieval(f, kit);
  // le seuil vers la rue (devant) : deux bornes
  for (const s of [-1, 1]) f.cyl(0.02, 0.024, 0.06, 6, s * 0.2, 0, 0.96, age >= 5 ? 0xdfe4ea : dk(STONE, 0.9));
}
