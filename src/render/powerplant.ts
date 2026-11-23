import * as THREE from 'three';
import { Parts } from './parts';
import { Fr, ModelKit, PI, H, dk, lt, person } from './frame';

/**
 * La centrale électrique (3 × 3), à l'époque moderne, et la centrale à hydrogène au futur. Au fond, la salle des turbines,
 * longue halle bardée à nervures et sa verrière de faîte, la chaufferie plus haute et ses conduites ; à droite, deux hautes
 * cheminées cerclées de rouge et de blanc qui fument ; à gauche devant, la tour de refroidissement en hyperbole et sa vapeur ;
 * à droite devant, le poste de transformation clôturé (transformateurs à ailettes, isolateurs, portiques, jeux de barres)
 * et le pylône d'où les lignes partent vers la ville ; les cuves, les tuyauteries sur racks, le bâtiment de commande et son
 * éclair, le parking, des ouvriers casqués. Futur : halle d'électrolyse blanche à liserés, sphères d'hydrogène sur pieds, tour
 * de refroidissement blanche cerclée de lumière, conduites lumineuses, pylônes blancs, un seul fût d'évent qui laisse filer
 * de la vapeur
 */
const CONC = 0xd8d4cc, CLAD = 0x7a8ca2, CLAD_L = 0xa8b8c8, STEEL = 0x8a929c, DARK = 0x3a3e44, RED = 0xd8392c, WHITE = 0xf4f4f0;
const FW = 0xf2f4f6, NEON = 0x5ae0ff, H2 = 0x9affd8;

/** Tour de refroidissement en hyperbole (rayon au pied r0, au col rc, au sommet r1), creuse, vue du dehors et du dedans */
function coolingTower(f: Fr, x: number, z: number, r0: number, rc: number, r1: number, h: number, c: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, y = t * h;
    // col aux deux tiers : un profil en hyperbole approché par une parabole de chaque côté
    const r = t < 0.7 ? rc + (r0 - rc) * ((0.7 - t) / 0.7) ** 2 : rc + (r1 - rc) * ((t - 0.7) / 0.3) ** 2;
    pts.push(new THREE.Vector2(r, y));
  }
  f.add(new THREE.LatheGeometry(pts, 24), x, 0, z, c);
  f.add(new THREE.LatheGeometry(pts.map((v) => new THREE.Vector2(v.x - 0.012, v.y)).reverse(), 24), x, 0, z, dk(c, 0.7));
  // les pieds en V au bas de la coque, l'ombre de l'ouverture, les rangs de coffrage
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; f.box(0.02, 0.07, 0.02, x + Math.sin(a) * (r0 - 0.01), 0, z + Math.cos(a) * (r0 - 0.01), dk(c, 0.75), false, 0.3 * (i % 2 ? 1 : -1), a); }
  f.cyl(r0 - 0.03, r0 - 0.03, 0.06, 24, x, 0, z, 0x2a2e34);
  for (const t of [0.25, 0.5, 0.85]) {
    const y = t * h, r = t < 0.7 ? rc + (r0 - rc) * ((0.7 - t) / 0.7) ** 2 : rc + (r1 - rc) * ((t - 0.7) / 0.3) ** 2;
    f.add(new THREE.TorusGeometry(r + 0.002, 0.004, 3, 24).rotateX(PI / 2), x, y, z, dk(c, 0.9));
  }
}

/** Cheminée haute : fût, bagues rouges et blanches au sommet, passerelle, échelle, feu d'obstacle */
function stack(f: Fr, kit: ModelKit, x: number, z: number, h: number, r: number) {
  f.cyl(r * 0.85, r, h, 12, x, 0, z, CONC);
  for (let i = 0; i < 4; i++) f.cyl(r * 0.86 + 0.002, r * 0.86 + 0.002, 0.06, 12, x, h - 0.24 + i * 0.06, z, i % 2 ? WHITE : RED);
  f.add(new THREE.TorusGeometry(r * 0.86 + 0.04, 0.006, 3, 16).rotateX(PI / 2), x, h * 0.62, z, DARK);
  f.cyl(r * 0.86 + 0.04, r * 0.86 + 0.04, 0.008, 16, x, h * 0.62 - 0.004, z, STEEL);
  f.box(0.012, h * 0.95, 0.012, x + r * 0.95, 0, z, DARK);
  f.ball(0.012, x, h + 0.01, z, 0xff3a2a, true);
  f.cyl(r * 0.7, r * 0.7, 0.01, 12, x, h, z, 0x2a2e34);
  kit.smoke(f.X(x, z), f.base + h + 0.03, f.Z(x, z), 0);
}

/** Transformateur : cuve, ailettes de refroidissement, traversées à isolateurs */
function transformer(f: Fr, x: number, z: number, fut: boolean) {
  const c = fut ? FW : 0x7a8a6a;
  f.box(0.16, 0.12, 0.12, x, 0.02, z, c); f.box(0.18, 0.02, 0.14, x, 0, z, CONC);
  for (let i = 0; i < 6; i++) f.box(0.006, 0.09, 0.04, x - 0.07 + i * 0.028, 0.03, z + 0.08, dk(c, 0.85));
  for (let i = 0; i < 3; i++) { const bx = x - 0.05 + i * 0.05; for (let k = 0; k < 4; k++) f.cyl(0.012, 0.012, 0.012, 8, bx, 0.14 + k * 0.016, z - 0.02, fut ? 0x9fe8ff : 0xc86a3a); }
  if (fut) f.box(0.17, 0.006, 0.125, x, 0.1, z, NEON, 'neon');
}

/** Pylône en treillis (haut h) : quatre membrures, traverses, deux consoles, isolateurs */
function pylon(f: Fr, x: number, z: number, h: number, ry: number, c: number) {
  const g = f.sub(x, z, ry);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.tube([a * 0.09, 0, b * 0.09], [a * 0.025, h, b * 0.025], 0.006, c);
  for (let k = 1; k < 6; k++) {
    const y = (k / 6) * h, w = 0.09 - (0.065 * k) / 6;
    for (const s of [-1, 1]) { g.tube([-w, y, s * w], [w, y, s * w], 0.003, c); g.tube([s * w, y, -w], [s * w, y, w], 0.003, c); }
  }
  for (const [y, w] of [[h * 0.72, 0.22], [h * 0.92, 0.16]]) {
    g.tube([-w, y, 0], [w, y, 0], 0.005, c);
    for (const s of [-1, 1]) g.cyl(0.006, 0.006, 0.04, 5, s * w, y - 0.04, 0, 0x9fb8c8);
  }
  return g;
}

/** Une ligne qui pend entre deux points (repère du modèle), en quelques segments */
function wire(f: Fr, a: [number, number, number], b: [number, number, number], sag: number) {
  let prev = a;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6, y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
    const pt: [number, number, number] = [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t];
    f.tube(prev, pt, 0.0025, 0x2a2e34, false, 3);
    prev = pt;
  }
}

/** Petite automobile garée */
function car(f: Fr, x: number, z: number, ry: number, c: number) {
  const g = f.sub(x, z, ry);
  g.box(0.16, 0.04, 0.08, 0, 0.02, 0, c); g.box(0.09, 0.035, 0.074, -0.01, 0.06, 0, 0x9fc8e0);
  for (const [a, b] of [[-0.05, -0.04], [0.05, -0.04], [-0.05, 0.04], [0.05, 0.04]]) g.add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8).rotateX(PI / 2), a, 0.018, b, 0x1a1a1e);
}

export function powerplant(p: Parts, age: number, kit: ModelKit) {
  const f = new Fr(p), fut = age >= 5;
  const ground = fut ? 0xdfe4ea : 0xc4beb2, pave = fut ? 0xeef0f2 : 0xb8b4aa;
  f.box(2.94, 0.012, 2.94, 0, -0.012, 0, ground);
  f.box(2.9, 0.004, 0.18, 0, 0, -0.32, pave);
  f.box(0.2, 0.004, 1.8, -0.1, 0, 0.6, pave);
  // la salle des turbines : longue halle bardée, nervures, bandeau de fenêtres, verrière de faîte, grandes portes
  const hx = -0.55, hz = -0.92, HW = 1.5, HD = 0.62, HH = 0.48, zf = hz + HD / 2;
  f.box(HW, HH, HD, hx, 0, hz, fut ? FW : CLAD);
  if (!fut) for (let i = 0; i <= 30; i++) f.box(0.006, HH, 0.006, hx - HW / 2 + i * (HW / 30), 0, zf + 0.002, dk(CLAD, 0.85));
  f.box(HW, 0.05, 0.008, hx, 0.3, zf + 0.004, fut ? 0x9fe8ff : 0xffe2a0, true);
  f.box(HW + 0.02, 0.04, HD + 0.02, hx, HH, hz, fut ? 0xdfe4ea : CLAD_L);
  f.gable(HW, 0.1, HD, hx, HH + 0.04, hz, fut ? 0xdfe4ea : 0x5a6878);
  f.box(HW - 0.1, 0.02, 0.06, hx, HH + 0.13, hz, 0x9fc8e0, true);
  for (const dx of [-0.45, 0.05]) { f.box(0.2, 0.24, 0.008, hx + dx, 0, zf + 0.004, fut ? 0x8a96a2 : 0x5a6470); for (let k = 0; k < 8; k++) f.box(0.2, 0.004, 0.01, hx + dx, 0.02 + k * 0.03, zf + 0.006, dk(fut ? 0x8a96a2 : 0x5a6470, 0.8)); }
  f.box(0.5, 0.05, 0.008, hx - 0.25 + 0.45, 0.4, zf + 0.006, fut ? 0x2a3a5a : 0xf4f4f0);
  // l'éclair de la centrale sur le pignon
  const bolt = (x: number, y: number, z: number, c: number, glow: false | true | 'neon') => {
    f.add(new THREE.ConeGeometry(0.03, 0.08, 3).rotateZ(0.5), x, y + 0.05, z, c, glow);
    f.add(new THREE.ConeGeometry(0.03, 0.08, 3).rotateZ(PI + 0.5), x + 0.02, y, z, c, glow);
  };
  bolt(hx - 0.55, 0.35, zf + 0.012, fut ? NEON : 0xf2c23a, fut ? 'neon' : false);
  if (fut) { f.box(HW, 0.008, 0.008, hx, 0.12, zf + 0.006, NEON, 'neon'); f.box(HW, 0.008, 0.008, hx, HH - 0.02, zf + 0.006, NEON, 'neon'); }
  // la chaufferie (ou la salle des piles) plus haute, ses conduites qui descendent vers les cheminées
  const bx = 0.48, bz = -0.95;
  f.box(0.5, 0.74, 0.56, bx, 0, bz, fut ? 0xe8ecf0 : 0x9aa6b4);
  for (let k = 0; k < 4; k++) f.box(0.44, 0.03, 0.006, bx, 0.12 + k * 0.16, bz + 0.282, fut ? 0x9fe8ff : 0xffe2a0, true);
  f.box(0.52, 0.03, 0.58, bx, 0.74, bz, fut ? 0xdfe4ea : 0x6a7684);
  for (let i = 0; i < 3; i++) f.cyl(0.04, 0.04, 0.08, 8, bx - 0.15 + i * 0.15, 0.77, bz - 0.1, STEEL);
  // les cheminées (ou l'évent du futur), au coin de droite
  if (fut) {
    f.cyl(0.06, 0.08, 1.1, 14, 1.12, 0, -1.08, FW);
    for (let k = 0; k < 3; k++) f.add(new THREE.TorusGeometry(0.068, 0.006, 3, 14).rotateX(PI / 2), 1.12, 0.4 + k * 0.3, -1.08, NEON, 'neon');
    kit.smoke(f.X(1.12, -1.08), f.base + 1.12, f.Z(1.12, -1.08), 0);
  } else {
    stack(f, kit, 0.98, -1.15, 1.55, 0.09);
    stack(f, kit, 1.24, -0.95, 1.35, 0.08);
    f.tube([0.73, 0.55, -1.0], [0.92, 0.55, -1.1], 0.035, STEEL); f.tube([0.73, 0.4, -0.85], [1.18, 0.4, -0.92], 0.03, STEEL);
  }
  // la tour de refroidissement, devant à gauche, sa vapeur
  const cx = -0.8, cz = 0.45;
  coolingTower(f, cx, cz, 0.5, 0.3, 0.36, 1.15, fut ? FW : 0xd8d2c6);
  if (fut) { f.add(new THREE.TorusGeometry(0.36, 0.01, 3, 24).rotateX(PI / 2), cx, 1.15, cz, NEON, 'neon'); f.add(new THREE.TorusGeometry(0.31, 0.008, 3, 24).rotateX(PI / 2), cx, 0.8, cz, NEON, 'neon'); }
  for (const [dx, dz] of [[0, 0], [0.15, 0.1], [-0.12, -0.1]]) kit.smoke(f.X(cx + dx, cz + dz), f.base + 1.18, f.Z(cx + dx, cz + dz), 0);
  // les cuves (fioul ou hydrogène) et la tuyauterie sur racks qui les relie à la halle
  if (fut) {
    for (const [x, z] of [[0.35, -0.2], [0.7, -0.25], [1.05, -0.3]] as [number, number][]) {
      for (const [a, b] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) f.box(0.02, 0.16, 0.02, x + a, 0, z + b, 0xc8ccd0);
      f.ball(0.15, x, 0.26, z, FW, false, 1, 1, 1, 2);
      f.add(new THREE.TorusGeometry(0.152, 0.006, 3, 20).rotateX(PI / 2), x, 0.26, z, H2, 'neon');
      f.box(0.05, 0.02, 0.006, x, 0.3, z + 0.152, 0x2a3a5a);
    }
  } else {
    for (const [x, z, r] of [[0.4, -0.22, 0.14], [0.78, -0.25, 0.14], [1.15, -0.3, 0.11]] as [number, number, number][]) {
      f.cyl(r, r, 0.26, 16, x, 0, z, 0xe8e4dc); f.cyl(r * 0.96, r, 0.03, 16, x, 0.26, z, 0xc8c4bc);
      f.add(new THREE.TorusGeometry(r + 0.003, 0.003, 3, 16).rotateX(PI / 2), x, 0.18, z, dk(0xe8e4dc, 0.8));
      f.box(0.012, 0.26, 0.012, x + r, 0, z, DARK);
      f.cyl(r + 0.03, r + 0.03, 0.012, 16, x, 0, z, 0x9a968e);
    }
  }
  for (const x of [0.05, 0.3, 0.6, 0.95]) f.box(0.02, 0.2, 0.02, x, 0, -0.48, STEEL);
  for (const [y, c] of [[0.2, fut ? NEON : 0xc8b43a], [0.17, fut ? H2 : 0x5a8ac8]] as [number, number][]) f.add(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 8).rotateZ(PI / 2), 0.5, y, -0.48 + (y - 0.18) * 2, c, fut ? 'neon' : false);
  // le poste de transformation : gravier, clôture, transformateurs, portiques et jeux de barres
  const yx = 0.75, yz = 0.62, YW = 1.1, YD = 0.9;
  f.box(YW, 0.006, YD, yx, 0, yz, fut ? 0xe2e6ea : 0xa8a49a);
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    for (const [x, z] of [[yx - YW / 2 + t * YW, yz - YD / 2], [yx - YW / 2 + t * YW, yz + YD / 2]]) f.box(0.006, 0.09, 0.006, x, 0, z, STEEL);
    for (const [x, z] of [[yx - YW / 2, yz - YD / 2 + t * YD], [yx + YW / 2, yz - YD / 2 + t * YD]]) f.box(0.006, 0.09, 0.006, x, 0, z, STEEL);
  }
  for (const s of [-1, 1]) { f.box(YW, 0.006, 0.006, yx, 0.09, yz + s * YD / 2, STEEL); f.box(0.006, 0.006, YD, yx + s * YW / 2, 0.09, yz, STEEL); }
  for (const [x, z] of [[0.45, 0.4], [0.75, 0.4], [1.05, 0.4]] as [number, number][]) transformer(f, x, z, fut);
  for (const z of [0.68, 0.92]) {
    for (const x of [0.32, 1.18]) { f.box(0.02, 0.36, 0.02, x, 0, z, fut ? FW : STEEL); }
    f.box(0.88, 0.02, 0.02, 0.75, 0.36, z, fut ? FW : STEEL);
    for (let i = 0; i < 3; i++) { const x = 0.55 + i * 0.2; f.cyl(0.008, 0.008, 0.08, 5, x, 0.28, z, 0x9fb8c8); f.cyl(0.006, 0.01, 0.24, 5, x, 0.006, z, fut ? 0xdfe4ea : 0x9a968e); }
  }
  for (let i = 0; i < 3; i++) { const x = 0.55 + i * 0.2; f.tube([x, 0.36, 0.68], [x, 0.36, 0.92], 0.004, 0xc8a050); f.tube([x, 0.36, 0.68], [0.45 + i * 0.3, 0.2, 0.42], 0.003, 0xc8a050); }
  // le pylône au coin, d'où les lignes partent vers la ville
  const pc = fut ? FW : 0x8a929c;
  pylon(f, 1.3, 1.3, 0.85, PI / 4, pc);
  for (const [s, y] of [[-1, 0.85 * 0.72], [1, 0.85 * 0.72], [-1, 0.85 * 0.92], [1, 0.85 * 0.92]] as [number, number][]) {
    const w = y > 0.7 ? 0.16 : 0.22, ox = 1.3 + s * w * Math.cos(PI / 4), oz = 1.3 - s * w * Math.sin(PI / 4);
    wire(f, [0.75 + s * 0.2, 0.36, 0.92], [ox, y - 0.04, oz], 0.05);
  }
  // le bâtiment de commande (devant, au milieu) : vitré, auvent, enseigne à l'éclair, antenne
  const kx = -0.12, kz = 0.98;
  f.box(0.46, 0.22, 0.3, kx, 0, kz, fut ? FW : 0xe8e4dc);
  f.box(0.42, 0.1, 0.008, kx, 0.08, kz + 0.152, fut ? 0x9fe8ff : 0x9fc8e0, true);
  for (let i = 0; i <= 6; i++) f.box(0.006, 0.1, 0.01, kx - 0.21 + i * 0.07, 0.08, kz + 0.154, DARK);
  f.box(0.5, 0.02, 0.36, kx, 0.22, kz, fut ? 0xdfe4ea : 0x6a7684);
  f.box(0.12, 0.08, 0.008, kx, 0, kz + 0.152, 0x3a4a5a, true);
  f.box(0.22, 0.012, 0.1, kx, 0.1, kz + 0.2, fut ? FW : 0xd8d4cc);
  f.box(0.1, 0.1, 0.01, kx + 0.16, 0.24, kz + 0.1, fut ? 0x2a3a5a : 0x2a5a9a);
  bolt(kx + 0.15, 0.25, kz + 0.106, fut ? NEON : 0xf2c23a, fut ? 'neon' : false);
  f.cyl(0.004, 0.004, 0.2, 4, kx - 0.18, 0.24, kz - 0.08, STEEL); f.ball(0.008, kx - 0.18, 0.44, kz - 0.08, 0xff3a2a, true);
  // le parking, les ouvriers casqués, un camion-citerne (ou un camion à hydrogène), des massifs
  for (let i = 0; i < 4; i++) { f.box(0.004, 0.003, 0.18, -0.95 + i * 0.13, 0.006, 1.22, WHITE); if (i < 3) car(f, -0.885 + i * 0.13, 1.22, PI / 2, [0xe8322a, 0x3a6ab8, 0xf4f4f0][i]); }
  const tk = f.sub(0.12, 0.35, 0);
  tk.box(0.1, 0.1, 0.1, 0.15, 0.02, 0, fut ? 0x2a3a5a : 0xe8642a); tk.box(0.06, 0.04, 0.09, 0.17, 0.08, 0, 0x9fc8e0);
  tk.add(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 12).rotateZ(PI / 2), -0.03, 0.08, 0, fut ? FW : 0xe8e4dc);
  for (const a of [-0.1, 0.05, 0.16]) for (const s of [-1, 1]) tk.add(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 8).rotateX(PI / 2), a, 0.022, s * 0.05, 0x1a1a1e);
  if (fut) tk.box(0.22, 0.006, 0.112, -0.03, 0.08, 0, H2, 'neon');
  for (const [x, z, ry] of [[0.15, 0.05, 0.4], [-0.2, -0.2, -1.2], [0.28, 0.6, PI]] as [number, number, number][]) person(f, x, z, ry, fut ? FW : 0xe8642a, { hat: 'helmet', hatColor: fut ? 0xdfe4ea : 0xf2c23a, legs: 0x3a4a6a, arms: H(Math.round(x * 10), 3) > 0.5 ? 'one' : 'down' });
  for (const [x, z] of [[-1.3, 1.3], [-0.4, 1.3], [0.2, 1.3], [-1.35, -0.2]] as [number, number][]) { f.ball(0.07, x, 0.05, z, fut ? 0x7fb87f : 0x6fa85a, false, 1, 0.8, 1, 1); f.ball(0.05, x + 0.06, 0.04, z + 0.03, lt(0x6fa85a, 0.12), false, 1, 0.8, 1); }
}
