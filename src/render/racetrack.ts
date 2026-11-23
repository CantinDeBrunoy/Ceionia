import * as THREE from 'three';
import { Parts } from './parts';
import { Fr, ModelKit, PI, H, dk, lt, person, quad } from './frame';

/**
 * Le circuit automobile (3 × 3), à l'époque moderne et au futur. Une piste en anneau autour d'un terre-plein : vibreurs rouges
 * et blancs, ligne de départ en damier sous son portique, murs de pneus, panneaux publicitaires. Dans l'anneau : la voie des
 * stands et ses garages, la tour de contrôle, le podium, le parc des camions. Derrière la piste (au fond), la grande tribune
 * pleine et sa toiture ; devant, l'entrée, les guichets, les drapeaux. Les bolides tournent sur deux trajectoires (pièces qui
 * tournent, `kit.turn`). Futur : piste suspendue bordée de lumière, bolides antigravité sans roues et leurs traînées, tribune
 * blanche à verrière, tour en fuseau, hologramme du classement
 */
const R = 1.06, TW = 0.26;
const CARS = [0xe8322a, 0x2a6ae8, 0xf2c23a, 0x2ab84a, 0xf4f4f0, 0xe8642a, 0x9a4ae8, 0x1a1a1e];

/** Anneau plat (`r0` à `r1`) au centre de la parcelle, à hauteur y */
function ring(f: Fr, r0: number, r1: number, y: number, color: number, glow: false | true | 'neon' = false, seg = 48) {
  f.add(new THREE.RingGeometry(r0, r1, seg, 1).rotateX(-PI / 2), 0, y, 0, color, glow);
}

/** Un bolide de course (long de x), dans les pièces q, en (x, y, z), orienté de `ry` (son avant vers +x local) */
function racer(q: Parts, x: number, y: number, z: number, ry: number, c: number, hover: boolean) {
  const g = new Fr(q, x, z, ry, 1, y);
  if (hover) {
    g.ball(0.05, 0, 0.03, 0, c, false, 2.2, 0.5, 0.9, 1);
    g.box(0.06, 0.02, 0.05, -0.01, 0.045, 0, 0x9fe8ff, true);
    g.box(0.03, 0.006, 0.12, -0.08, 0.05, 0, dk(c, 0.7));
    g.box(0.02, 0.012, 0.09, -0.1, 0.012, 0, 0x6ae4ff, 'neon');
    g.box(0.12, 0.004, 0.02, -0.16, 0.025, 0, 0x6ae4ff, 'neon');
    return;
  }
  // la monoplace : nez effilé, pontons, cockpit et casque, aileron avant et arrière, quatre roues larges
  g.box(0.16, 0.026, 0.05, 0, 0.018, 0, c);
  g.add(new THREE.ConeGeometry(0.022, 0.07, 4).rotateZ(-PI / 2).rotateX(PI / 4), 0.11, 0.03, 0, c);
  for (const s of [-1, 1]) g.box(0.07, 0.02, 0.018, -0.01, 0.016, s * 0.034, dk(c, 0.85));
  g.box(0.04, 0.018, 0.03, 0.01, 0.042, 0, 0x1a1a1e); g.ball(0.012, 0.0, 0.056, 0, lt(c, 0.5));
  g.box(0.022, 0.004, 0.11, 0.15, 0.012, 0, dk(c, 0.6));
  g.box(0.018, 0.026, 0.006, -0.085, 0.036, 0.045, 0x1a1a1e); g.box(0.018, 0.026, 0.006, -0.085, 0.036, -0.045, 0x1a1a1e);
  g.box(0.026, 0.006, 0.1, -0.088, 0.062, 0, c);
  for (const [a, b] of [[0.075, -0.05], [0.075, 0.05], [-0.06, -0.052], [-0.06, 0.052]]) g.add(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 8).rotateX(PI / 2), a, 0.018, b, 0x1a1a1e);
}

/** Une rangée de bolides qui tournent ensemble sur le rayon r (une pièce qui tourne autour du centre) */
function lap(f: Fr, kit: ModelKit, r: number, speed: number, n: number, y: number, seed: number, hover: boolean) {
  const q = kit.turn(f.w(0, y, 0), [0, 1, 0], speed);
  for (let i = 0; i < n; i++) {
    // un peloton : des voitures proches, puis un trou, puis les retardataires
    const a = (i < n - 2 ? i * 0.16 : 2.4 + i * 0.5) + seed;
    racer(q, Math.sin(a) * r, 0, Math.cos(a) * r, a, CARS[(i + seed * 3) % CARS.length], hover);
  }
}

/** Tribune droite le long de x (de x0 à x1), qui monte vers -z à partir de z0 : gradins, public, toiture sur poteaux */
function stand(f: Fr, kit: ModelKit, x0: number, x1: number, z0: number, rows: number, fut: boolean) {
  const W = x1 - x0, cx = (x0 + x1) / 2, step = 0.05, rise = 0.05;
  const conc = fut ? 0xf2f4f6 : 0xd8d4cc, seat = fut ? 0xdfe4ea : 0x3a6ab8;
  for (let i = 0; i < rows; i++) {
    f.box(W, rise * (i + 1), step, cx, 0, z0 - step / 2 - i * step, conc);
    f.box(W, 0.012, step * 0.5, cx, rise * (i + 1), z0 - step * 0.3 - i * step, i % 2 ? seat : dk(seat, 0.85));
    // le public : une rangée de spectateurs (buste et tête), qui se lèvent par vagues si le kit l'anime
    for (let k = 0; k < Math.floor(W / 0.05); k++) {
      if (H(k, i * 7 + 3) < 0.12) continue;
      const x = x0 + 0.03 + k * 0.05, y = rise * (i + 1) + 0.012, z = z0 - step * 0.45 - i * step;
      const shirt = CARS[Math.floor(H(k, i * 7 + 4) * CARS.length)], head = [0xe8b894, 0xc89870, 0xf0c8a4, 0xa87850][Math.floor(H(k, i + 9) * 4)];
      const draw = (q: Parts) => { const g = new Fr(q, f.X(x, z), f.Z(x, z), f.ry, f.k, f.base); g.box(0.032, 0.04, 0.024, 0, y, 0, shirt); g.box(0.022, 0.022, 0.022, 0, y + 0.042, 0.002, head); };
      if (kit.fan) kit.fan(draw, f.w(x, y, z), [1, 0, 0], 0.05, 0.25, -x * 4, 0.014); else draw(f.p);
    }
  }
  const top = rise * rows, back = z0 - rows * step;
  f.box(W, top, 0.02, cx, 0, back - 0.01, dk(conc, 0.85));
  // la toiture : poteaux à l'arrière, une aile en porte-à-faux
  for (let x = x0 + 0.04; x <= x1; x += W / 5) f.box(0.02, top + 0.16, 0.02, x, 0, back - 0.02, fut ? 0xdfe4ea : 0x6a7078);
  if (fut) f.add(new THREE.CylinderGeometry(0.5, 0.5, W, 16, 1, true, -0.2, 0.9).rotateZ(PI / 2).scale(1, 0.35, 0.9), cx, top + 0.02, back + 0.12, 0xbfe8f8, true);
  else {
    f.add(new THREE.BoxGeometry(W + 0.06, 0.02, rows * step + 0.06), cx, top + 0.16, z0 - (rows * step) / 2, 0xf4f4f0, false, 0, -0.12);
    f.box(W + 0.06, 0.04, 0.008, cx, top + 0.145, z0 + 0.03, 0xe8322a);
  }
}

/** Panneaux publicitaires sur la courbe (de l'angle t0 à t1), face à la piste */
function boards(f: Fr, r: number, t0: number, t1: number, n: number, fut: boolean) {
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * (i + 0.5)) / n, x = Math.sin(t) * r, z = Math.cos(t) * r;
    const c = fut ? [0x6ae4ff, 0xff4aa8, 0x9a6aff][i % 3] : [0xe8322a, 0xf2c23a, 0x2a6ae8, 0x2ab84a, 0xf4f4f0][i % 5];
    f.box(0.12, 0.045, 0.012, x, 0, z, c, fut ? 'neon' : false, 0, t);
  }
}

/** Mur de pneus empilés (trois rangs) sur la courbe extérieure */
function tyres(f: Fr, r: number, t0: number, t1: number, n: number) {
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / n, x = Math.sin(t) * r, z = Math.cos(t) * r;
    for (let k = 0; k < 2; k++) f.cyl(0.024, 0.024, 0.02, 8, x, k * 0.02, z, k % 2 ? 0xe8322a : 0x1a1a1e);
  }
}

export function racetrack(p: Parts, age: number, kit: ModelKit) {
  const f = new Fr(p), fut = age >= 5;
  const tarmac = fut ? 0x3a4250 : 0x4a4d52, grass = fut ? 0x8ac8a0 : 0x7fb86a;
  // le terre-plein : pelouse dans l'anneau (pas de socle sous toute la parcelle), l'asphalte de la piste, ses lignes, ses vibreurs
  ring(f, 0, R - TW / 2, 0.002, grass);
  if (fut) {
    // la piste suspendue : un anneau porté par des piles, bordé de lumière
    for (let i = 0; i < 16; i++) { const t = (i / 16) * PI * 2; f.cyl(0.03, 0.04, 0.08, 6, Math.sin(t) * R, 0, Math.cos(t) * R, 0xdfe4ea); }
    ring(f, R - TW / 2, R + TW / 2, 0.08, tarmac);
    f.add(new THREE.CylinderGeometry(R + TW / 2, R + TW / 2, 0.025, 48, 1, true), 0, 0.058, 0, 0xdfe4ea);
    f.add(new THREE.CylinderGeometry(R - TW / 2, R - TW / 2, 0.025, 48, 1, true).scale(-1, 1, 1), 0, 0.058, 0, 0xdfe4ea);
    for (const r of [R - TW / 2 + 0.01, R + TW / 2 - 0.01]) f.add(new THREE.TorusGeometry(r, 0.006, 3, 48).rotateX(PI / 2), 0, 0.085, 0, r < R ? 0x6ae4ff : 0xff4aa8, 'neon');
    f.add(new THREE.TorusGeometry(R, 0.003, 3, 48).rotateX(PI / 2), 0, 0.084, 0, 0xf4f4f0, 'neon');
  } else {
    ring(f, R - TW / 2, R + TW / 2, 0.004, tarmac);
    ring(f, R - 0.004, R + 0.004, 0.006, 0xf4f4f0, false, 64);
    // les vibreurs rouges et blancs aux deux bords
    for (const r of [R - TW / 2 - 0.02, R + TW / 2 + 0.02]) for (let i = 0; i < 64; i++) {
      const t = (i / 64) * PI * 2;
      f.box(0.1, 0.008, 0.03, Math.sin(t) * r, 0.004, Math.cos(t) * r, i % 2 ? 0xe8322a : 0xf4f4f0, false, 0, t);
    }
  }
  const ty = fut ? 0.08 : 0.004;
  // la ligne de départ en damier (devant, côté +z) et son portique aux feux
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) f.box(0.03, 0.004, 0.03, -0.012 + j * 0.03 - 0.003, ty + 0.001, R - TW / 2 + 0.015 + i * 0.031, (i + j) % 2 ? 0x1a1a1e : 0xf4f4f0);
  for (const s of [-1, 1]) f.box(0.025, 0.3, 0.025, 0, 0, R + s * (TW / 2 + 0.05), fut ? 0xdfe4ea : 0x6a7078);
  f.box(0.04, 0.05, TW + 0.14, 0, 0.3, R, fut ? 0xf2f4f6 : 0x2a2e34);
  for (let i = 0; i < 5; i++) f.ball(0.012, 0.022, 0.325, R - 0.08 + i * 0.04, i < 3 ? 0xe8322a : 0x3aff7a, true);
  f.box(0.006, 0.03, TW + 0.1, 0.022, 0.34, R, 0xf4f4f0); for (let i = 0; i < 6; i++) f.box(0.008, 0.02, 0.02, 0.024, 0.345, R - 0.1 + i * 0.04, CARS[i]);
  // la voie des stands et les garages (dans l'anneau, au fond), leurs camions, les mécaniciens
  const pz = -0.5;
  f.box(1.1, 0.004, 0.16, 0, 0.004, pz + 0.16, dk(tarmac, 1.1));
  f.box(1.1, 0.006, 0.006, 0, 0.008, pz + 0.24, 0xf2c23a);
  f.box(1.1, 0.13, 0.18, 0, 0, pz - 0.02, fut ? 0xf2f4f6 : 0xe8e4dc);
  for (let i = 0; i < 6; i++) {
    const x = -0.46 + i * 0.184;
    f.box(0.15, 0.1, 0.006, x, 0, pz + 0.072, fut ? 0x2a3a5a : 0x3a3e44, fut);
    f.box(0.15, 0.02, 0.008, x, 0.11, pz + 0.075, CARS[i]);
    if (i % 2 === 0) racer(p, x, 0.012, pz + 0.16, PI / 2, CARS[i], fut);
    person(f, x + 0.05, pz + 0.2, PI, CARS[i], { hat: 'cap', hatColor: CARS[i] });
  }
  f.box(1.12, 0.015, 0.24, 0, 0.13, pz + 0.01, fut ? 0xdfe4ea : 0x9aa3ad);
  for (let i = 0; i < 3; i++) { const x = -0.35 + i * 0.35; f.box(0.22, 0.08, 0.08, x, 0, pz - 0.2, CARS[i * 2]); f.box(0.07, 0.07, 0.08, x + 0.15, 0, pz - 0.2, 0xf4f4f0); }
  // la tour de contrôle et ses vitres, le podium et ses trois marches, les drapeaux
  const tx = 0.52, tz = 0.2;
  if (fut) {
    f.cyl(0.05, 0.08, 0.5, 12, tx, 0, tz, 0xf2f4f6); f.ball(0.13, tx, 0.56, tz, 0x9fe8ff, true, 1, 0.5, 1, 1);
    f.add(new THREE.TorusGeometry(0.13, 0.008, 3, 24).rotateX(PI / 2), tx, 0.56, tz, 0x6ae4ff, 'neon');
    // l'hologramme du classement au-dessus du terre-plein
    for (let i = 0; i < 5; i++) f.box(0.22 - i * 0.03, 0.025, 0.004, -0.1, 0.4 + i * 0.035, 0.1, CARS[i], 'neon');
    f.cyl(0.04, 0.06, 0.04, 10, -0.1, 0, 0.1, 0xdfe4ea); f.cyl(0.004, 0.004, 0.36, 4, -0.1, 0.04, 0.1, 0x6ae4ff, 'neon');
  } else {
    f.box(0.14, 0.42, 0.14, tx, 0, tz, 0xe8e4dc);
    f.box(0.22, 0.1, 0.22, tx, 0.42, tz, 0x9fc8e0, true);
    for (const [a, b] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) f.box(0.012, 0.1, 0.012, tx + a, 0.42, tz + b, 0xf4f4f0);
    f.box(0.26, 0.02, 0.26, tx, 0.52, tz, 0x2a2e34); f.cyl(0.004, 0.004, 0.12, 4, tx, 0.54, tz, 0x9aa3ad); f.ball(0.01, tx, 0.66, tz, 0xff4a3a, true);
    f.box(0.15, 0.05, 0.006, tx, 0.34, tz + 0.074, 0xe8322a); for (let i = 0; i < 4; i++) f.box(0.025, 0.02, 0.004, tx - 0.05 + i * 0.033, 0.355, tz + 0.078, 0xf4f4f0);
  }
  const px = -0.45, pzz = 0.25;
  for (const [dx, h, c] of [[0, 0.09, 0xf2c23a], [-0.09, 0.06, 0xc8ccd0], [0.09, 0.04, 0xc87a3a]] as [number, number, number][]) {
    f.box(0.08, h, 0.08, px + dx, 0, pzz, fut ? 0xf2f4f6 : 0xf4f4f0); f.box(0.08, 0.008, 0.082, px + dx, h - 0.02, pzz, c);
    person(f, px + dx, pzz, PI * 0.2, CARS[Math.round(h * 100) % CARS.length], { y: h, arms: dx === 0 ? 'up' : 'one', hat: 'none' });
  }
  f.box(0.3, 0.12, 0.01, px, 0, pzz - 0.06, fut ? 0x2a3a5a : 0x1a1a1e, fut ? 'neon' : false);
  for (let i = 0; i < 5; i++) f.box(0.03, 0.03, 0.004, px - 0.1 + i * 0.05, 0.07, pzz - 0.054, CARS[i]);
  // l'écran géant du terre-plein, tourné vers la tribune, et le mur des stands le long de la voie
  for (const s of [-1, 1]) f.box(0.02, 0.28, 0.02, -0.62 + s * 0.14, 0, -0.08, fut ? 0xdfe4ea : 0x6a7078);
  f.box(0.34, 0.18, 0.02, -0.62, 0.24, -0.08, fut ? 0xf2f4f6 : 0x2a2e34);
  f.box(0.3, 0.14, 0.004, -0.62, 0.26, -0.092, fut ? 0x6ae4ff : 0x3a8ae8, fut ? 'neon' : true);
  for (let i = 0; i < 3; i++) f.box(0.08, 0.02, 0.002, -0.7 + i * 0.08, 0.3 + (i % 2) * 0.04, -0.095, CARS[i], true);
  f.box(1.1, 0.05, 0.02, 0, 0, pz + 0.25, fut ? 0xdfe4ea : 0xe8e4dc);
  for (let i = 0; i < 11; i++) f.box(0.08, 0.03, 0.004, -0.5 + i * 0.1, 0.01, pz + 0.261, CARS[i % CARS.length]);
  // la grande tribune derrière la piste (au fond), et une petite sur la courbe de droite
  stand(f, kit, -1.1, 1.1, -1.29, 4, fut);
  const side = f.sub(1.3, 0.1, -PI / 2);
  stand(side, kit, -0.4, 0.4, 0, 2, fut);
  // panneaux, murs de pneus, l'entrée et ses guichets (devant), drapeaux, commissaire au drapeau à damier
  boards(f, R + TW / 2 + 0.07, PI * 0.15, PI * 0.85, 9, fut);
  boards(f, R + TW / 2 + 0.07, -PI * 0.85, -PI * 0.15, 9, fut);
  if (!fut) { tyres(f, R + TW / 2 + 0.06, PI * 0.88, PI * 1.12, 7); tyres(f, R + TW / 2 + 0.06, PI * 0.05, PI * 0.14, 3); tyres(f, R + TW / 2 + 0.06, -PI * 0.14, -PI * 0.05, 3); }
  for (const x of [-1.1, -0.85, 0.85, 1.1]) {
    f.cyl(0.006, 0.006, 0.34, 4, x, 0, 1.42, 0xc8ccd0);
    const fl = kit.sway(f.w(x, 0.32, 1.42), [0, 1, 0], 0.35, 0.5);
    quad(fl, [0, 0, 0], [0.11, 0, 0], [0.11, -0.07, 0], [0, -0.07, 0], CARS[Math.abs(Math.round(x * 10)) % CARS.length], false, true);
  }
  f.box(0.5, 0.12, 0.1, 0.5, 0, 1.4, fut ? 0xf2f4f6 : 0xe8e4dc); f.box(0.52, 0.02, 0.14, 0.5, 0.12, 1.42, 0xe8322a);
  for (let i = 0; i < 3; i++) f.box(0.08, 0.06, 0.006, 0.34 + i * 0.16, 0.03, 1.452, 0x9fc8e0, true);
  for (let i = 0; i < 4; i++) person(f, -0.35 + i * 0.12, 1.4, PI * (0.9 + H(i, 5) * 0.2), CARS[(i + 2) % CARS.length], { hat: i % 2 ? 'cap' : 'none', hatColor: 0xe8322a });
  // le commissaire et son drapeau à damier, à la ligne
  person(f, 0.14, R + TW / 2 + 0.1, PI, 0xf4f4f0, { arms: 'up', hat: 'cap', hatColor: 0xf4f4f0, y: fut ? 0.08 : 0 });
  const cf = kit.sway(f.w(0.17, 0.25 + (fut ? 0.08 : 0), R + TW / 2 + 0.1), [1, 0, 0], 0.6, 1.2);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) cf.box(0.025, 0.025, 0.002, i * 0.025, -j * 0.025, 0, (i + j) % 2 ? 0x1a1a1e : 0xf4f4f0);
  // les bolides : un peloton à l'intérieur, un autre à l'extérieur, à leur rythme
  lap(f, kit, R - 0.06, 0.16, 5, ty + 0.002, 0, fut);
  lap(f, kit, R + 0.06, 0.13, 4, ty + 0.002, 3, fut);
}
