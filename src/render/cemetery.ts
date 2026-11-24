import * as THREE from 'three';
import { Parts } from './parts';
import { Fr, ModelKit, PI, H, dk, lt, person } from './frame';

/**
 * Le cimetière (2 × 2), un modèle par âge. Un lieu calme et fleuri, jamais lugubre : l'entrée devant (face à +z), une allée
 * qui mène au monument du fond, des tombes fleuries de part et d'autre, des arbres, des bancs et quelques visiteurs.
 * Préhistoire (Tertre des ancêtres) : le tertre herbu et son dolmen d'entrée, le cercle de pierres levées, deux menhirs gravés
 * de spirales, une table de pierre fleurie, les poteaux sculptés, le feu des ancêtres, des cairns.
 * Antiquité (Nécropole) : la voie dallée bordée de cyprès, le mausolée rond au fond, les petits temples funéraires, les
 * stèles, les sarcophages, les urnes, le banc en hémicycle, les lampes à huile.
 * Médiéval (Cimetière paroissial) : le mur de pierres sèches et son porche couvert, la chapelle à clocheton, la lanterne des
 * morts, le calvaire sur ses marches, les croix de pierre et de bois, l'if.
 * Industriel (Cimetière à chapelle) : grille et piliers, grand portail, chapelle néogothique à rosace, caveaux de famille,
 * obélisque, ange, saule pleureur, réverbères à gaz.
 * Moderne (Parc du souvenir) : pelouse et plaques au ras de l'herbe, mur des noms, columbarium, bassin miroir, pavillon,
 * cerisiers en fleurs et bouleaux.
 * Futuriste (Jardin du souvenir) : l'arbre de mémoire aux feuilles de lumière dans son bassin, les colonnes de verre, les
 * galets lumineux, les sphères de lumière qui flottent
 */
const TRUNK = 0x6a4e36, LEAF = 0x5f8f48, CYPRESS = 0x3c6440, YEW = 0x3a5a36;
const FLOWERS = [0xf25c7a, 0xffd24a, 0xfaf4ea, 0xb07ad8, 0xff8a3a, 0x7ab8ff, 0xff9ac0];
const STEM = 0x5a8a3e;

// -------------------------------------------------------------- petits éléments communs

/** Une touffe de fleurs : feuillage et corolles de couleurs */
function blooms(f: Fr, x: number, y: number, z: number, n: number, r: number, seed: number, palette = FLOWERS) {
  // (des octaèdres : de loin, une fleur ; les modèles de la Préhistoire ont un plafond de triangles)
  f.add(new THREE.OctahedronGeometry(r * 0.9).scale(1, 0.55, 1), x, y + r * 0.3, z, STEM);
  for (let i = 0; i < n; i++) {
    const a = H(i, seed) * PI * 2, d = H(i, seed + 1) * r;
    f.add(new THREE.OctahedronGeometry(0.007 + H(i, seed + 2) * 0.004), x + Math.cos(a) * d, y + r * 0.5 + H(i, seed + 3) * 0.012, z + Math.sin(a) * d, palette[Math.floor(H(i, seed + 4) * palette.length)]);
  }
}

/** Cyprès effilé, haut de `h` */
function cypress(f: Fr, x: number, z: number, h: number, c = CYPRESS) {
  f.cyl(0.008, 0.012, 0.04, 5, x, 0, z, TRUNK);
  f.ball(0.05, x, 0.03 + h / 2, z, c, false, 1, h / 0.1, 1, 1);
  f.ball(0.034, x + 0.012, 0.05 + h * 0.62, z + 0.01, lt(c, 0.12), false, 1, h / 0.12, 1, 1);
}

/** Arbre rond : tronc et trois boules de feuillage */
function roundTree(f: Fr, x: number, z: number, s: number, c = LEAF, trunk = TRUNK, detail = 1) {
  f.cyl(0.014 * s, 0.022 * s, 0.2 * s, 6, x, 0, z, trunk);
  f.ball(0.12 * s, x, 0.27 * s, z, c, false, 1, 0.85, 1, detail);
  f.ball(0.08 * s, x + 0.08 * s, 0.22 * s, z + 0.03 * s, lt(c, 0.12), false, 1, 0.85, 1, detail);
  f.ball(0.08 * s, x - 0.07 * s, 0.24 * s, z - 0.04 * s, dk(c, 0.88), false, 1, 0.85, 1, detail);
}

/** Buisson */
function bush(f: Fr, x: number, z: number, s: number, c = LEAF, detail = 1) {
  f.ball(0.05 * s, x, 0.03 * s, z, c, false, 1, 0.75, 1, detail);
  f.ball(0.035 * s, x + 0.035 * s, 0.025 * s, z + 0.02 * s, lt(c, 0.14), false, 1, 0.75, 1);
}

/** Petite flamme qui brille la nuit (bougie, lumignon) */
function flame(f: Fr, x: number, y: number, z: number, s = 1) {
  f.cone(0.006 * s, 0.018 * s, 5, x, y, z, 0xffc25a, true);
}

/** Lanterne de tombe : socle, verre allumé, chapeau */
function lantern(f: Fr, x: number, z: number, y = 0, c = 0x3a3a40) {
  f.box(0.018, 0.006, 0.018, x, y, z, c);
  f.box(0.014, 0.02, 0.014, x, y + 0.006, z, 0xffd27a, true);
  f.cone(0.013, 0.012, 4, x, y + 0.026, z, c);
}

type Stone = 'round' | 'cross' | 'gothic' | 'slab' | 'wood' | 'plaque' | 'stele';
/**
 * Une tombe tournée vers +z du repère : la pierre au fond, la tombe devant (bordure, terre fleurie), parfois une lanterne ou
 * une couronne. `stone` sa forme, `c` sa couleur
 */
function grave(f: Fr, x: number, z: number, ry: number, stone: Stone, c: number, seed: number, o: { curb?: boolean; lamp?: boolean; wreath?: boolean; plot?: number } = {}) {
  const g = f.sub(x, z, ry);
  const L = 0.17;
  if (o.curb !== false && stone !== 'plaque') {
    // la bordure de pierre et la terre (ou le gravier) qu'elle entoure
    g.box(0.085, 0.012, L, 0, 0, 0.02, dk(c, 0.92));
    g.box(0.07, 0.013, L - 0.016, 0, 0, 0.02, o.plot ?? 0x7a6a52);
    blooms(g, 0, 0.012, 0.05 + H(seed, 1) * 0.03, 4, 0.02, seed);
    if (H(seed, 2) > 0.5) blooms(g, 0.018, 0.012, 0.0, 3, 0.014, seed + 7);
  }
  const bz = -0.07;
  if (stone === 'round') {
    g.box(0.06, 0.008, 0.026, 0, 0, bz, dk(c, 0.85));
    g.box(0.05, 0.052, 0.016, 0, 0.008, bz, c);
    g.add(new THREE.CylinderGeometry(0.025, 0.025, 0.016, 12).rotateX(PI / 2), 0, 0.06, bz, c);
    g.box(0.03, 0.002, 0.002, 0, 0.045, bz + 0.009, dk(c, 0.6)); g.box(0.022, 0.002, 0.002, 0, 0.036, bz + 0.009, dk(c, 0.6));
  } else if (stone === 'cross') {
    g.box(0.05, 0.016, 0.03, 0, 0, bz, dk(c, 0.85));
    g.box(0.014, 0.1, 0.012, 0, 0.016, bz, c);
    g.box(0.052, 0.014, 0.012, 0, 0.078, bz, c);
  } else if (stone === 'gothic') {
    g.box(0.06, 0.01, 0.028, 0, 0, bz, dk(c, 0.85));
    g.box(0.048, 0.06, 0.016, 0, 0.01, bz, c);
    g.sub(0, bz, PI / 2).gable(0.016, 0.032, 0.05, 0, 0.07, 0, c);
    g.add(new THREE.TorusGeometry(0.009, 0.002, 3, 10), 0, 0.05, bz + 0.009, dk(c, 0.6));
  } else if (stone === 'slab') {
    // la dalle couchée et sa petite stèle debout
    g.box(0.076, 0.022, L - 0.01, 0, 0, 0.02, c);
    g.box(0.07, 0.003, L - 0.02, 0, 0.022, 0.02, lt(c, 0.12));
    g.box(0.05, 0.05, 0.014, 0, 0, bz - 0.005, c);
    g.add(new THREE.CylinderGeometry(0.025, 0.025, 0.014, 10).rotateX(PI / 2), 0, 0.05, bz - 0.005, c);
  } else if (stone === 'wood') {
    g.box(0.01, 0.09, 0.01, 0, 0, bz, c);
    g.box(0.046, 0.01, 0.01, 0, 0.062, bz, c);
    g.add(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 6).rotateX(PI / 2), 0, 0.067, bz + 0.007, dk(c, 0.7));
  } else if (stone === 'stele') {
    // la stèle antique : fronton triangulaire, acrotères, panneau sculpté
    g.box(0.062, 0.012, 0.03, 0, 0, bz, dk(c, 0.85));
    g.box(0.05, 0.075, 0.016, 0, 0.012, bz, c);
    g.sub(0, bz, PI / 2).gable(0.018, 0.02, 0.058, 0, 0.087, 0, c);
    g.box(0.034, 0.036, 0.004, 0, 0.03, bz + 0.009, dk(c, 0.8));
    g.ball(0.007, -0.006, 0.05, bz + 0.012, dk(c, 0.9)); g.ball(0.007, 0.008, 0.046, bz + 0.012, dk(c, 0.9));
  } else {
    // plaque au ras de l'herbe, légèrement inclinée, son vase
    g.add(new THREE.BoxGeometry(0.07, 0.008, 0.05), 0, 0.006, bz + 0.02, c, false, 0, -0.25);
    g.box(0.04, 0.002, 0.002, 0, 0.014, bz + 0.03, lt(c, 0.5));
    g.cyl(0.006, 0.005, 0.02, 6, 0.028, 0, bz + 0.05, 0x8a8f96);
    blooms(g, 0.028, 0.018, bz + 0.05, 3, 0.012, seed + 3);
  }
  if (o.lamp) lantern(g, -0.026, bz + 0.02, 0.012);
  if (o.wreath) {
    g.add(new THREE.TorusGeometry(0.018, 0.006, 4, 10), 0, 0.03, bz + 0.016, 0x4a7a3a);
    for (let i = 0; i < 4; i++) g.ball(0.005, Math.cos(i * 1.6) * 0.018, 0.03 + Math.sin(i * 1.6) * 0.018, bz + 0.021, FLOWERS[i % 3]);
  }
}

/** Rangée de tombes le long de x, de `x0` à `x1` */
function row(f: Fr, x0: number, x1: number, z: number, n: number, ry: number, kinds: Stone[], colors: number[], seed: number, o: { lamp?: number; wreath?: number; plot?: number } = {}) {
  for (let i = 0; i < n; i++) {
    const x = n > 1 ? x0 + ((x1 - x0) * i) / (n - 1) : x0, s = seed + i * 13;
    grave(f, x, z, ry, kinds[Math.floor(H(s, 5) * kinds.length)], colors[Math.floor(H(s, 6) * colors.length)], s, {
      lamp: H(s, 7) < (o.lamp ?? 0), wreath: H(s, 8) < (o.wreath ?? 0), plot: o.plot,
    });
  }
}

/** Banc de pierre ou de bois, tourné vers +z */
function bench(f: Fr, x: number, z: number, ry: number, c: number, back = true) {
  const g = f.sub(x, z, ry);
  for (const s of [-1, 1]) g.box(0.012, 0.035, 0.04, s * 0.06, 0, 0, dk(c, 0.8));
  g.box(0.15, 0.01, 0.045, 0, 0.035, 0, c);
  if (back) g.box(0.15, 0.04, 0.008, 0, 0.045, -0.02, c);
}

/** Mur droit le long de x ou de z (`alongZ`), de a à b, avec un chaperon */
function wall(f: Fr, a: number, b: number, at: number, alongZ: boolean, h: number, t: number, c: number, cap: number) {
  const L = Math.abs(b - a), m = (a + b) / 2;
  if (alongZ) { f.box(t, h, L, at, 0, m, c); f.box(t + 0.014, 0.014, L, at, h, m, cap); }
  else { f.box(L, h, t, m, 0, at, c); f.box(L, 0.014, t + 0.014, m, h, at, cap); }
}

/** Grille de fer forgé de a à b (le long de x ou de z) : barreaux, lisses, pointes */
function railing(f: Fr, a: number, b: number, at: number, alongZ: boolean, h: number, c = 0x2e3036) {
  const L = Math.abs(b - a), m = (a + b) / 2, n = Math.max(2, Math.round(L / 0.035));
  for (const y of [0.025, h - 0.015]) { if (alongZ) f.box(0.006, 0.006, L, at, y, m, c); else f.box(L, 0.006, 0.006, m, y, at, c); }
  for (let i = 0; i <= n; i++) {
    const u = Math.min(a, b) + (L * i) / n, x = alongZ ? at : u, z = alongZ ? u : at;
    f.box(0.004, h, 0.004, x, 0, z, c);
    f.cone(0.005, 0.014, 4, x, h, z, c);
  }
}

/** Herbe de la parcelle */
function lawn(f: Fr, c: number) {
  f.box(1.96, 0.012, 1.96, 0, -0.012, 0, c);
  for (let i = 0; i < 26; i++) f.ball(0.014, -0.92 + H(i, 41) * 1.84, 0.002, -0.92 + H(i, 42) * 1.84, i % 2 ? lt(c, 0.1) : dk(c, 0.9), false, 1.6, 0.4, 1.2);
}

// -------------------------------------------------------------- Préhistoire : le tertre des ancêtres
const MEGA = 0x9e9a90, MEGA_D = 0x86827a;

/** Un caillou (octaèdre aplati) : la Préhistoire a un plafond de triangles */
function pebble(f: Fr, r: number, x: number, y: number, z: number, c: number, sx = 1, sy = 0.7, sz = 1) {
  f.add(new THREE.OctahedronGeometry(r).scale(sx, sy, sz), x, y, z, c);
}

/** Une pierre levée, un peu penchée */
function menhir(f: Fr, x: number, z: number, h: number, seed: number, c = MEGA) {
  f.add(new THREE.CylinderGeometry(0.022, 0.034, h, 6).translate(0, h / 2, 0).scale(1, 1, 0.7), x, 0, z, H(seed, 1) > 0.5 ? c : MEGA_D, false, (H(seed, 2) - 0.5) * 0.14, (H(seed, 3) - 0.5) * 0.1, H(seed, 4) * PI);
}

function prehistoric(f: Fr, kit: ModelKit) {
  // (pas de pelouse : à la Préhistoire, aucun bâtiment ne pose sur un socle plat, le sol du monde fait l'herbe)
  // le tertre herbu, des pierres affleurent
  const mz = -0.32;
  f.add(new THREE.SphereGeometry(0.56, 14, 6, 0, PI * 2, 0, PI / 2).scale(1, 0.48, 0.82), 0, 0, mz, 0x7fa85a);
  f.add(new THREE.SphereGeometry(0.4, 12, 5, 0, PI * 2, 0, PI / 2).scale(1, 0.42, 0.8), 0.05, 0.08, mz - 0.04, 0x86b062);
  for (let i = 0; i < 6; i++) { const a = H(i, 51) * PI - PI, r = 0.3 + H(i, 52) * 0.2; pebble(f, 0.022, Math.cos(a) * r, 0.1 + H(i, 53) * 0.06, mz + Math.sin(a) * r * 0.8, MEGA, 1.3, 0.6, 1); }
  for (let i = 0; i < 7; i++) blooms(f, -0.35 + H(i, 54) * 0.7, 0.18 + H(i, 55) * 0.04, mz - 0.15 + H(i, 56) * 0.12, 3, 0.02, 60 + i, [0xffd24a, 0xfaf4ea, 0xb07ad8]);
  // la couronne de pierres au pied du tertre, un genévrier et un buisson sur son sommet
  for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; if (Math.sin(a) > 0.82) continue; pebble(f, 0.03, Math.cos(a) * 0.55, 0.01, mz + Math.sin(a) * 0.45, i % 2 ? MEGA : MEGA_D, 1.2, 0.8, 1); }
  f.ball(0.04, 0.16, 0.3, mz - 0.1, 0x4a7a44, false, 1, 1.5, 1, 0); f.ball(0.028, 0.18, 0.35, mz - 0.1, 0x5a8a4a, false, 1, 1.4, 1);
  f.ball(0.05, -0.18, 0.25, mz - 0.14, 0x6a9a4a, false, 1, 0.7, 1, 0);
  for (let i = 0; i < 4; i++) blooms(f, -0.25 + i * 0.15, 0.2 + (i % 2) * 0.03, mz + 0.02, 4, 0.02, 160 + i, [0xffd24a, 0xfaf4ea]);
  // le dolmen d'entrée : deux orthostates, la table, l'entrée sombre, le couloir de dalles
  const dz = mz + 0.42;
  f.box(0.13, 0.17, 0.05, 0, 0, dz - 0.04, 0x2e2822);
  for (const s of [-1, 1]) f.box(0.05, 0.17, 0.12, s * 0.09, 0, dz, s > 0 ? MEGA : MEGA_D, false, s * 0.03);
  f.box(0.28, 0.045, 0.19, 0, 0.165, dz + 0.005, MEGA, false, 0.04);
  f.box(0.26, 0.012, 0.17, 0.004, 0.21, dz + 0.005, lt(MEGA, 0.1), false, 0.04);
  for (let i = 0; i < 5; i++) f.box(0.06 + H(i, 61) * 0.03, 0.01, 0.06, (H(i, 62) - 0.5) * 0.04, 0, dz + 0.12 + i * 0.075, i % 2 ? MEGA : MEGA_D, false, 0, H(i, 63));
  // les offrandes au seuil : bouquets, coupe, lumignons
  blooms(f, -0.05, 0, dz + 0.09, 6, 0.025, 70);
  blooms(f, 0.06, 0, dz + 0.1, 5, 0.022, 71, [0xffd24a, 0xff8a3a, 0xfaf4ea]);
  f.cyl(0.018, 0.012, 0.016, 8, 0.0, 0, dz + 0.14, 0xa8643a);
  for (const s of [-1, 1]) { f.cyl(0.008, 0.01, 0.012, 6, s * 0.12, 0, dz + 0.1, 0xa8643a); flame(f, s * 0.12, 0.012, dz + 0.1); }
  // le cercle de pierres levées autour du tertre (ouvert devant)
  for (let i = 0; i < 14; i++) {
    const a = -PI / 2 + 0.55 + (i / 13) * (PI * 2 - 1.1) + PI, r = 0.86;
    menhir(f, Math.cos(a) * r, mz * 0.4 + Math.sin(a) * r * 0.85, 0.08 + H(i, 81) * 0.07, 80 + i);
  }
  // deux grands menhirs gravés de spirales qui gardent l'entrée
  for (const s of [-1, 1]) {
    const x = s * 0.22, z = 0.62;
    menhir(f, x, z, 0.26, 90 + s, MEGA);
    f.add(new THREE.TorusGeometry(0.014, 0.003, 3, 12), x, 0.15, z + 0.024, 0xb86a3a);
    f.add(new THREE.TorusGeometry(0.007, 0.003, 3, 10), x, 0.15, z + 0.025, 0xb86a3a);
    f.add(new THREE.TorusGeometry(0.012, 0.003, 3, 12), x, 0.1, z + 0.026, 0xb86a3a);
  }
  // l'allée de pierres plates jusqu'au dolmen
  for (let i = 0; i < 6; i++) f.cyl(0.04, 0.042, 0.008, 7, (H(i, 91) - 0.5) * 0.06, 0, 0.88 - i * 0.075, i % 2 ? MEGA : MEGA_D);
  // la table de pierre fleurie, à droite
  const tx = 0.6, tz = 0.42;
  for (const [dx, dz2] of [[-0.06, -0.03], [0.06, -0.03], [0, 0.04]]) f.box(0.03, 0.08, 0.03, tx + dx, 0, tz + dz2, MEGA_D);
  f.box(0.2, 0.026, 0.14, tx, 0.08, tz, MEGA, false, 0.05);
  blooms(f, tx - 0.03, 0.106, tz, 6, 0.024, 95);
  blooms(f, tx + 0.05, 0.106, tz + 0.02, 4, 0.018, 96, [0xff8a3a, 0xffd24a]);
  // le feu des ancêtres, à gauche : cercle de pierres, bûches, flammes, fumée
  const fx = -0.56, fz = 0.42;
  for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; pebble(f, 0.018, fx + Math.cos(a) * 0.06, 0.008, fz + Math.sin(a) * 0.06, MEGA_D); }
  for (const a of [0.3, 1.9, 3.5]) f.add(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 5).rotateZ(PI / 2), fx, 0.012, fz, 0x5a3a24, false, 0, 0, a);
  f.cone(0.03, 0.07, 6, fx, 0.01, fz, 0xff8a3a, true); f.cone(0.018, 0.05, 5, fx + 0.012, 0.014, fz - 0.01, 0xffd27a, true);
  kit.smoke(...f.w(fx, 0.1, fz), 0);
  // les poteaux sculptés, peints de bandes, l'un coiffé de bois de cerf
  for (const [x, z, h, s] of [[-0.42, 0.68, 0.3, 1], [0.42, 0.7, 0.26, 0]] as [number, number, number, number][]) {
    f.cyl(0.018, 0.022, h, 6, x, 0, z, 0x7a5a3a);
    for (let k = 0; k < 3; k++) f.cyl(0.0205, 0.0205, 0.016, 6, x, 0.06 + k * 0.07, z, [0xc8643a, 0xf2e6c4, 0x3a3a3a][k]);
    f.box(0.03, 0.02, 0.008, x, h - 0.06, z + 0.018, 0xf2e6c4);
    if (s) for (const d of [-1, 1]) { f.tube([x, h, z], [x + d * 0.05, h + 0.06, z], 0.004, 0xe8dcc0); f.tube([x + d * 0.03, h + 0.035, z], [x + d * 0.045, h + 0.07, z + 0.01], 0.003, 0xe8dcc0); }
    else f.ball(0.02, x, h + 0.01, z, 0xf2e6c4, false, 1, 0.8, 1);
  }
  // cairns, buissons, le vieux chêne et le bouleau
  for (const [x, z] of [[-0.78, 0.82], [0.8, -0.05], [-0.8, -0.2]]) for (let k = 0; k < 4; k++) pebble(f, 0.025 - k * 0.003, x + (H(k, 97) - 0.5) * 0.03, 0.012 + k * 0.02, z + (H(k, 98) - 0.5) * 0.03, k % 2 ? MEGA : MEGA_D, 1.2, 0.7, 1);
  roundTree(f, -0.68, -0.72, 1.35, 0x5a8a40, TRUNK, 0);
  roundTree(f, 0.74, -0.7, 1.05, 0x7aa84e, 0xe8e2d4, 0);
  for (const [x, z, s] of [[-0.88, 0.3, 1], [0.88, 0.25, 0.9], [-0.3, -0.85, 1.1], [0.35, -0.88, 0.9], [0.85, 0.8, 0.8]]) bush(f, x, z, s, 0x5f8f48, 0);
  // un petit alignement de pierres, des prés fleuris, des paniers d'offrandes, des claies de branches tressées
  for (let i = 0; i < 5; i++) menhir(f, -0.86 + i * 0.09, 0.08 - i * 0.02, 0.05 + i * 0.012, 140 + i);
  for (let i = 0; i < 8; i++) blooms(f, -0.85 + H(i, 150) * 1.7, 0, 0.2 + H(i, 151) * 0.7, 4, 0.024, 152 + i, [0xffd24a, 0xfaf4ea, 0xb07ad8, 0x7ab8ff]);
  for (const [x, z] of [[0.48, 0.5], [0.72, 0.52]] as [number, number][]) { f.cyl(0.026, 0.02, 0.03, 8, x, 0, z, 0xb89a5a); for (let k = 0; k < 3; k++) f.ball(0.012, x + (k - 1) * 0.012, 0.035, z, [0xd84a3a, 0x8a3a6a, 0xe8a03a][k]); }
  for (const s of [-1, 1]) {
    const hz = f.sub(s * 0.62, 0.9, 0);
    for (let k = 0; k < 5; k++) hz.box(0.006, 0.07, 0.006, -0.12 + k * 0.06, 0, 0, 0x6a5038);
    for (const y of [0.02, 0.04, 0.06]) hz.box(0.26, 0.008, 0.008, 0, y, 0, 0x8a6a48);
  }
  // des villageois en peaux apportent des fleurs, un enfant les suit
  person(f, 0.12, 0.38, PI + 0.3, 0x8a6a44, { legs: 0x6a4e34, hat: 'none', arms: 'front' });
  person(f, -0.18, 0.46, PI - 0.4, 0xa07a4e, { legs: 0x6a4e34, hat: 'none' });
  const kid = f.sub(-0.08, 0.6, PI, 0.7);
  person(kid, 0, 0, 0, 0x9a7048, { legs: 0x6a4e34, hat: 'none', arms: 'one' });
}

// -------------------------------------------------------------- Antiquité : la nécropole
const TRAV = 0xdccfae, TRAV_D = 0xc2b48e, MARBLE = 0xf0ebe0, OCHRE = 0xd2a878, TERRA = 0xc0704a, BRONZE = 0x9a7a3a;

/** Petit temple funéraire : podium, quatre colonnes, fronton, une urne dedans ; tourné vers +z */
function aedicula(f: Fr, x: number, z: number, ry: number, c: number) {
  const g = f.sub(x, z, ry);
  g.box(0.26, 0.05, 0.22, 0, 0, 0, dk(c, 0.9));
  g.box(0.24, 0.012, 0.2, 0, 0.05, 0, c);
  g.box(0.2, 0.15, 0.1, 0, 0.062, -0.05, dk(c, 0.95));
  for (const sx of [-0.09, 0.09]) for (const sz of [0.06]) { g.cyl(0.012, 0.014, 0.15, 8, sx, 0.062, sz, MARBLE); g.box(0.03, 0.01, 0.03, sx, 0.205, sz, MARBLE); }
  g.box(0.25, 0.018, 0.22, 0, 0.212, -0.0, c);
  g.gable(0.25, 0.06, 0.22, 0, 0.23, 0, TERRA);
  g.sub(0, 0.11, PI / 2).gable(0.004, 0.05, 0.2, 0, 0.232, 0, c);
  g.ball(0.012, 0, 0.255, 0.111, dk(c, 0.8));
  for (const s of [-1, 1]) g.box(0.018, 0.022, 0.018, s * 0.12, 0.232, 0.1, c);
  g.box(0.018, 0.026, 0.018, 0, 0.29, 0.1, c);
  // l'urne sur son autel, les fleurs devant
  g.box(0.05, 0.04, 0.04, 0, 0.062, 0.02, MARBLE);
  g.ball(0.022, 0, 0.12, 0.02, BRONZE, false, 1, 1.2, 1); g.cyl(0.01, 0.014, 0.02, 8, 0, 0.14, 0.02, BRONZE);
  blooms(g, -0.07, 0.062, 0.08, 4, 0.016, 200, [0xf25c7a, 0xff9ac0, 0xfaf4ea]);
  blooms(g, 0.07, 0.062, 0.08, 4, 0.016, 201, [0xf25c7a, 0xffd24a]);
}

/** Sarcophage sur son socle : cuve, couvercle en toit, acrotères, guirlande */
function sarcophagus(f: Fr, x: number, z: number, ry: number) {
  const g = f.sub(x, z, ry);
  g.box(0.2, 0.03, 0.1, 0, 0, 0, TRAV_D);
  g.box(0.18, 0.06, 0.08, 0, 0.03, 0, MARBLE);
  g.box(0.12, 0.03, 0.004, 0, 0.045, 0.041, lt(TRAV, 0.2));
  for (let i = 0; i < 4; i++) g.ball(0.008, -0.045 + i * 0.03, 0.06 - (i % 2) * 0.008, 0.043, 0x5a8a3e);
  g.gable(0.19, 0.03, 0.09, 0, 0.09, 0, lt(MARBLE, 0.2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.016, 0.022, 0.016, sx * 0.088, 0.09, sz * 0.038, MARBLE);
}

/** Lampe à huile allumée sur son pied */
function oilLamp(f: Fr, x: number, z: number) {
  f.cyl(0.006, 0.01, 0.07, 6, x, 0, z, BRONZE);
  f.cyl(0.018, 0.012, 0.01, 8, x, 0.07, z, BRONZE);
  flame(f, x, 0.08, z, 1.2);
}

function antique(f: Fr, kit: ModelKit) {
  lawn(f, 0xa2c46c);
  // la voie dallée, ses bordures et ses joints
  f.box(0.34, 0.01, 1.9, 0, 0, 0.02, TRAV);
  for (const s of [-1, 1]) f.box(0.025, 0.018, 1.9, s * 0.18, 0, 0.02, TRAV_D);
  for (let j = 0; j < 14; j++) f.box(0.34, 0.002, 0.004, 0, 0.01, 0.92 - j * 0.13, TRAV_D);
  for (let j = 0; j < 14; j++) f.box(0.004, 0.002, 0.13, (H(j, 210) - 0.5) * 0.24, 0.01, 0.86 - j * 0.13, TRAV_D);
  // l'enceinte basse d'ocre, l'entrée entre deux piliers coiffés d'urnes
  wall(f, -0.97, 0.97, -0.96, false, 0.08, 0.04, OCHRE, TRAV);
  wall(f, -0.96, 0.96, -0.96, true, 0.08, 0.04, OCHRE, TRAV);
  wall(f, -0.96, 0.96, 0.96, true, 0.08, 0.04, OCHRE, TRAV);
  for (const s of [-1, 1]) {
    wall(f, s * 0.97, s * 0.24, 0.96, false, 0.08, 0.04, OCHRE, TRAV);
    f.box(0.07, 0.16, 0.07, s * 0.22, 0, 0.95, TRAV); f.box(0.085, 0.014, 0.085, s * 0.22, 0.16, 0.95, MARBLE);
    f.ball(0.024, s * 0.22, 0.2, 0.95, TERRA, false, 1, 1.25, 1); f.cyl(0.012, 0.016, 0.018, 8, s * 0.22, 0.22, 0.95, TERRA);
  }
  // le mausolée rond au fond : soubassement carré, tambour, frise de guirlandes, corniche, toit conique, porte de bronze
  const mz = -0.6;
  f.box(0.66, 0.08, 0.6, 0, 0, mz, TRAV_D);
  f.box(0.62, 0.012, 0.56, 0, 0.08, mz, TRAV);
  f.cyl(0.26, 0.27, 0.22, 24, 0, 0.09, mz, TRAV);
  f.cyl(0.272, 0.272, 0.04, 24, 0, 0.25, mz, MARBLE);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; f.ball(0.012, Math.cos(a) * 0.275, 0.268, mz + Math.sin(a) * 0.275, i % 2 ? 0x5a8a3e : 0xf25c7a); }
  f.cyl(0.285, 0.285, 0.016, 24, 0, 0.29, mz, MARBLE);
  f.cone(0.27, 0.16, 24, 0, 0.306, mz, TERRA);
  f.cyl(0.02, 0.03, 0.05, 8, 0, 0.44, mz, MARBLE); f.ball(0.03, 0, 0.5, mz, BRONZE);
  f.box(0.1, 0.16, 0.03, 0, 0.09, mz + 0.255, BRONZE);
  f.box(0.004, 0.15, 0.002, 0, 0.095, mz + 0.272, dk(BRONZE, 0.6));
  f.box(0.14, 0.024, 0.04, 0, 0.25, mz + 0.27, MARBLE);
  for (let k = 0; k < 3; k++) f.box(0.22 - k * 0.04, 0.03, 0.06, 0, k * 0.03 - 0.002, mz + 0.32 + (2 - k) * 0.02, TRAV);
  // deux petits temples funéraires face à la voie
  aedicula(f, -0.52, 0.1, PI / 2, TRAV);
  aedicula(f, 0.52, -0.1, -PI / 2, lt(OCHRE, 0.25));
  // stèles le long de la voie, sarcophages, urnes
  for (const [x0, x1, z, ry] of [[-0.75, -0.3, 0.55, PI / 2], [0.3, 0.75, 0.55, -PI / 2], [0.3, 0.75, 0.25, -PI / 2]] as [number, number, number, number][]) {
    for (let i = 0; i < 3; i++) grave(f, x0 + ((x1 - x0) * i) / 2, z + (i % 2) * 0.04, ry, 'stele', i % 2 ? MARBLE : TRAV, 220 + Math.round(x0 * 50) + i, { curb: false });
  }
  for (const [x0, x1, z, ry] of [[-0.75, -0.35, 0.32, PI / 2], [-0.8, -0.4, -0.5, PI / 2]] as [number, number, number, number][]) {
    for (let i = 0; i < 3; i++) grave(f, x0 + ((x1 - x0) * i) / 2, z + (i % 2) * 0.05, ry, 'stele', i % 2 ? TRAV : MARBLE, 260 + Math.round(z * 50) + i, { curb: false });
  }
  // les rosiers le long de la voie, les guirlandes sur l'enceinte
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) blooms(f, s * 0.215, 0.012, 0.85 - i * 0.22, 4, 0.022, 270 + i * 2 + s, [0xf25c7a, 0xff9ac0, 0xfaf4ea]);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) f.ball(0.011, s * 0.96, 0.1, -0.85 + i * 0.2, i % 2 ? 0x5a8a3e : 0xf25c7a);
  for (let i = 0; i < 3; i++) grave(f, 0.42 + i * 0.16, -0.42 + (i % 2) * 0.04, -PI / 2, 'stele', i % 2 ? MARBLE : TRAV, 280 + i, { curb: false });
  // touffes de lavande et d'acanthe entre les tombes
  for (let i = 0; i < 10; i++) { const x = (H(i, 290) > 0.5 ? 1 : -1) * (0.32 + H(i, 291) * 0.55), z = -0.8 + H(i, 292) * 1.6; f.ball(0.03, x, 0.02, z, i % 2 ? 0x6a8a4e : 0x7a9a5a, false, 1, 0.7, 1); if (i % 2) for (let k = 0; k < 4; k++) f.box(0.004, 0.03, 0.004, x + (k - 1.5) * 0.012, 0.03, z, 0x9a7ad8); }
  // la statue sur son piédestal, à l'angle de la voie
  f.box(0.07, 0.09, 0.07, -0.3, 0, -0.2, MARBLE); f.box(0.08, 0.012, 0.08, -0.3, 0.09, -0.2, TRAV_D);
  person(f, -0.3, -0.2, PI / 2, MARBLE, { y: 0.102, legs: MARBLE, skin: MARBLE, hair: MARBLE, hat: 'none', arms: 'one' });
  sarcophagus(f, -0.6, -0.25, PI / 2);
  sarcophagus(f, 0.6, 0.42, -PI / 2);
  for (const [x, z] of [[-0.3, 0.78], [0.32, 0.8], [-0.82, -0.6], [0.82, -0.55]]) { f.ball(0.025, x, 0.03, z, TERRA, false, 1, 1.3, 1); f.cyl(0.012, 0.016, 0.02, 8, x, 0.058, z, TERRA); for (const s of [-1, 1]) f.add(new THREE.TorusGeometry(0.01, 0.003, 3, 8, PI), x + s * 0.024, 0.05, z, TERRA, false, s * PI / 2); }
  // les cyprès qui bordent la voie, un pin parasol, des lauriers
  for (const z of [0.72, 0.36, 0.0]) for (const s of [-1, 1]) cypress(f, s * 0.26, z - (s > 0 ? 0.04 : 0), 0.4 + H(Math.round(z * 10), s + 3) * 0.08);
  f.cyl(0.012, 0.02, 0.34, 6, -0.76, 0, -0.78, 0x7a5a3a); f.ball(0.16, -0.72, 0.38, -0.76, 0x4f7a3e, false, 1, 0.38, 1, 1); f.ball(0.11, -0.64, 0.4, -0.72, 0x5f8a48, false, 1, 0.4, 1, 1);
  for (const [x, z] of [[0.82, -0.82], [-0.86, 0.3], [0.86, 0.1]]) bush(f, x, z, 1.1, 0x5a7a3e);
  // le banc en hémicycle, les lampes à huile allumées
  for (let i = 0; i < 7; i++) {
    const a = PI * 0.15 + (i / 6) * PI * 0.7, x = 0.62 + Math.cos(a) * 0.16, z = -0.42 - Math.sin(a) * 0.16;
    f.box(0.07, 0.035, 0.05, x, 0, z, MARBLE, false, 0, -a + PI / 2);
    f.box(0.07, 0.04, 0.012, x - Math.cos(a) * 0.03, 0.035, z + Math.sin(a) * 0.03, MARBLE, false, 0, -a + PI / 2);
  }
  for (const [x, z] of [[-0.14, 0.15], [0.14, 0.15], [-0.14, -0.2], [0.14, -0.2]]) oilLamp(f, x, z);
  // des visiteurs : en toge, une femme qui porte des fleurs
  person(f, 0.04, 0.3, PI, MARBLE, { legs: MARBLE, hat: 'none', arms: 'front' });
  person(f, -0.07, -0.08, PI + 0.4, 0xc86a5a, { legs: 0xc86a5a, hat: 'none', arms: 'one' });
  blooms(f, -0.05, 0.12, 0.0, 4, 0.014, 240);
  void kit;
}

// -------------------------------------------------------------- Médiéval : le cimetière paroissial
const FIELD = 0xb4aa98, FIELD_D = 0x968c7c, OAK = 0x6a4a32, ROOF_TILE = 0xa85e46, SLATE = 0x5f6a7e;

/** La lanterne des morts : marches, fût, lanterne ajourée allumée, toit en pointe, croix */
function deadLantern(f: Fr, x: number, z: number) {
  for (let k = 0; k < 3; k++) f.box(0.16 - k * 0.04, 0.025, 0.16 - k * 0.04, x, k * 0.025, z, k % 2 ? FIELD : FIELD_D);
  f.cyl(0.035, 0.04, 0.4, 8, x, 0.075, z, FIELD);
  f.box(0.085, 0.012, 0.085, x, 0.47, z, FIELD_D);
  f.box(0.06, 0.07, 0.06, x, 0.482, z, 0xffd27a, true);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(0.014, 0.07, 0.014, x + dx * 0.03, 0.482, z + dz * 0.03, FIELD);
  f.box(0.085, 0.012, 0.085, x, 0.552, z, FIELD_D);
  f.add(new THREE.ConeGeometry(0.06, 0.12, 4).rotateY(PI / 4).translate(0, 0.06, 0), x, 0.564, z, FIELD);
  f.box(0.008, 0.05, 0.008, x, 0.68, z, FIELD_D); f.box(0.03, 0.008, 0.008, x, 0.71, z, FIELD_D);
}

function medieval(f: Fr, kit: ModelKit) {
  lawn(f, 0x92c260);
  // les allées de gravier, en croix
  f.box(0.2, 0.008, 1.9, 0, 0, 0.02, 0xcfc4a8);
  f.box(1.7, 0.008, 0.16, 0, 0, 0.12, 0xcfc4a8);
  for (let i = 0; i < 40; i++) f.ball(0.006, (H(i, 301) - 0.5) * 0.18, 0.008, -0.9 + H(i, 302) * 1.85, i % 2 ? 0xb8ad94 : 0xe2d8c2, false, 1, 0.5, 1);
  // le mur de pierres sèches et son chaperon
  wall(f, -0.97, 0.97, -0.96, false, 0.11, 0.05, FIELD, FIELD_D);
  wall(f, -0.96, 0.96, -0.96, true, 0.11, 0.05, FIELD, FIELD_D);
  wall(f, -0.96, 0.96, 0.96, true, 0.11, 0.05, FIELD, FIELD_D);
  for (const s of [-1, 1]) wall(f, s * 0.97, s * 0.17, 0.96, false, 0.11, 0.05, FIELD, FIELD_D);
  for (let i = 0; i < 30; i++) { const t = H(i, 303); f.box(0.03, 0.012, 0.004, -0.9 + t * 1.8, 0.02 + H(i, 304) * 0.07, -0.93, FIELD_D); }
  // le porche couvert de l'entrée : poteaux de chêne, toit de tuiles, banc des porteurs
  const gz = 0.95;
  for (const sx of [-0.15, 0.15]) for (const sz of [-0.07, 0.07]) f.box(0.022, 0.2, 0.022, sx, 0, gz + sz, OAK);
  for (const sz of [-0.07, 0.07]) f.box(0.34, 0.02, 0.024, 0, 0.2, gz + sz, OAK);
  f.gable(0.42, 0.11, 0.24, 0, 0.215, gz, ROOF_TILE);
  f.box(0.43, 0.012, 0.024, 0, 0.32, gz, dk(ROOF_TILE, 0.8));
  f.box(0.006, 0.05, 0.006, 0, 0.33, gz, 0x3a3a3a); f.box(0.024, 0.006, 0.006, 0, 0.36, gz, 0x3a3a3a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.tube([sx * 0.15, 0.15, gz + sz * 0.07], [sx * 0.07, 0.2, gz + sz * 0.07], 0.006, OAK);
  for (const s of [-1, 1]) f.box(0.02, 0.05, 0.14, s * 0.13, 0, gz, OAK);
  // la chapelle à clocheton, au fond à gauche
  const cx = -0.48, cz = -0.52;
  f.box(0.4, 0.3, 0.5, cx, 0, cz, FIELD);
  for (let i = 0; i < 20; i++) f.box(0.04, 0.014, 0.004, cx - 0.17 + H(i, 311) * 0.34, 0.02 + H(i, 312) * 0.26, cz + 0.252, FIELD_D);
  f.sub(cx, cz, PI / 2).gable(0.54, 0.22, 0.44, 0, 0.3, 0, SLATE);
  f.box(0.18, 0.012, 0.004, cx, 0.3, cz + 0.252, FIELD_D);
  for (const s of [-1, 1]) { f.box(0.04, 0.22, 0.06, cx + s * 0.2, 0, cz + 0.2, FIELD_D); f.box(0.04, 0.22, 0.06, cx + s * 0.2, 0, cz - 0.1, FIELD_D); }
  // la porte cintrée, les vitraux qui s'allument le soir
  f.box(0.1, 0.15, 0.01, cx, 0, cz + 0.252, 0x5a3a26);
  f.add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12).rotateX(PI / 2), cx, 0.15, cz + 0.252, 0x5a3a26);
  f.box(0.004, 0.18, 0.004, cx, 0, cz + 0.258, 0x2a2018);
  f.add(new THREE.CircleGeometry(0.035, 12), cx, 0.27, cz + 0.252, 0xffc46a, true);
  for (const z of [-0.15, 0.05]) f.box(0.004, 0.1, 0.04, cx + 0.202, 0.12, cz + z, 0xffc46a, true);
  // le clocheton sur le pignon : deux piliers, la cloche, son petit toit, la croix
  for (const s of [-1, 1]) f.box(0.02, 0.1, 0.04, cx + s * 0.04, 0.48, cz + 0.22, FIELD);
  f.ball(0.022, cx, 0.53, cz + 0.22, 0xb88a3a, false, 1, 1.1, 1);
  f.sub(cx, cz + 0.22, PI / 2).gable(0.06, 0.05, 0.12, 0, 0.58, 0, SLATE);
  f.box(0.006, 0.05, 0.006, cx, 0.63, cz + 0.22, 0x3a3a3a); f.box(0.026, 0.006, 0.006, cx, 0.66, cz + 0.22, 0x3a3a3a);
  // le calvaire au croisement des allées
  for (let k = 0; k < 3; k++) f.box(0.18 - k * 0.05, 0.025, 0.18 - k * 0.05, 0, k * 0.025, 0.12, k % 2 ? FIELD : FIELD_D);
  f.box(0.026, 0.3, 0.022, 0, 0.075, 0.12, FIELD);
  f.box(0.13, 0.024, 0.022, 0, 0.29, 0.12, FIELD);
  blooms(f, 0.06, 0.05, 0.18, 5, 0.02, 320);
  blooms(f, -0.06, 0.05, 0.18, 4, 0.018, 321, [0xfaf4ea, 0xffd24a]);
  // la lanterne des morts au fond à droite
  deadLantern(f, 0.5, -0.62);
  // les tombes : croix de pierre et de bois, stèles rondes, dalles ; quelques lumignons
  row(f, 0.25, 0.8, 0.62, 5, 0, ['cross', 'round', 'wood', 'slab'], [FIELD, lt(FIELD, 0.15), OAK], 330, { lamp: 0.35 });
  row(f, 0.25, 0.8, 0.32, 5, 0, ['cross', 'round', 'wood'], [FIELD, lt(FIELD, 0.15), OAK], 340, { lamp: 0.3 });
  row(f, -0.8, -0.25, 0.62, 5, 0, ['round', 'cross', 'slab', 'wood'], [FIELD, lt(FIELD, 0.15), OAK], 350, { lamp: 0.3 });
  row(f, -0.8, -0.3, 0.32, 4, 0, ['cross', 'wood', 'round'], [FIELD, lt(FIELD, 0.15), OAK], 360, { lamp: 0.3 });
  row(f, 0.25, 0.8, -0.16, 4, 0, ['round', 'cross'], [FIELD, lt(FIELD, 0.15)], 370, { lamp: 0.4 });
  // l'if centenaire, un tilleul, des rosiers le long du mur
  roundTree(f, 0.78, -0.08, 1.2, YEW, 0x5a3a2a);
  roundTree(f, -0.82, -0.05, 1.05, 0x6a9a48);
  for (let i = 0; i < 6; i++) blooms(f, -0.88 + i * 0.12, 0, -0.88, 5, 0.03, 380 + i, [0xf25c7a, 0xff9ac0, 0xfaf4ea]);
  for (const x of [-0.85, 0.85]) bush(f, x, 0.85, 1, 0x5a8a40);
  // le puits d'arrosage, son seau, son arrosoir ; un banc de pierre contre le mur, des fleurs au pied du mur d'entrée
  const wx = -0.12, wz = -0.55;
  f.cyl(0.07, 0.075, 0.07, 12, wx, 0, wz, FIELD); f.cyl(0.055, 0.055, 0.072, 12, wx, 0.002, wz, 0x3a4a5a);
  for (const s of [-1, 1]) f.box(0.012, 0.15, 0.012, wx + s * 0.065, 0.07, wz, OAK);
  f.box(0.15, 0.012, 0.012, wx, 0.21, wz, OAK); f.box(0.003, 0.08, 0.003, wx, 0.13, wz, 0xd8c8a0);
  f.cyl(0.016, 0.012, 0.022, 8, wx, 0.11, wz, OAK);
  f.cyl(0.016, 0.014, 0.024, 8, wx + 0.1, 0, wz + 0.04, 0x8a8f96); f.tube([wx + 0.115, 0.018, wz + 0.04], [wx + 0.14, 0.03, wz + 0.04], 0.003, 0x8a8f96);
  f.box(0.3, 0.035, 0.06, 0.45, 0, -0.88, FIELD_D); f.box(0.3, 0.008, 0.065, 0.45, 0.035, -0.88, FIELD);
  for (let i = 0; i < 4; i++) blooms(f, 0.12 + i * 0.1, 0, 0.9, 4, 0.024, 390 + i, [0xf25c7a, 0xfaf4ea, 0xffd24a]);
  // le banc, un moine et une villageoise qui fleurissent une tombe
  bench(f, -0.2, -0.2, PI / 2, OAK);
  person(f, 0.42, 0.5, PI, 0x6a4a34, { legs: 0x5a3e2c, hat: 'none', arms: 'front' });
  person(f, -0.55, 0.46, PI + 0.2, 0x4a6a8a, { legs: 0x4a6a8a, hat: 'cone', hatColor: 0xf2e6d0, arms: 'front' });
  void kit;
}

// -------------------------------------------------------------- Industriel : le cimetière à chapelle
const LIME = 0xe4dccb, LIME_D = 0xc4baa6, IRON = 0x2e3036;

/** Caveau de famille : petite chapelle de pierre, porte de fer, fronton, croix */
function vault(f: Fr, x: number, z: number, ry: number, c: number) {
  const g = f.sub(x, z, ry);
  g.box(0.18, 0.02, 0.18, 0, 0, 0, LIME_D);
  g.box(0.14, 0.18, 0.14, 0, 0.02, 0, c);
  g.sub(0, 0, PI / 2).gable(0.16, 0.07, 0.17, 0, 0.2, 0, SLATE);
  g.box(0.06, 0.11, 0.006, 0, 0.02, 0.072, IRON);
  g.add(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 10).rotateX(PI / 2), 0, 0.13, 0.072, IRON);
  for (let i = 0; i < 4; i++) g.box(0.003, 0.1, 0.003, -0.022 + i * 0.015, 0.025, 0.077, 0xb8a46a);
  g.box(0.008, 0.05, 0.008, 0, 0.27, 0.07, c); g.box(0.03, 0.008, 0.008, 0, 0.3, 0.07, c);
  for (const s of [-1, 1]) { g.cyl(0.012, 0.012, 0.02, 6, s * 0.08, 0.02, 0.09, LIME_D); blooms(g, s * 0.08, 0.04, 0.09, 4, 0.014, 400 + s); }
}

/** Réverbère à gaz */
function gasLamp(f: Fr, x: number, z: number) {
  f.cyl(0.008, 0.012, 0.3, 6, x, 0, z, IRON);
  f.box(0.03, 0.04, 0.03, x, 0.3, z, 0xffd27a, true);
  f.cone(0.026, 0.03, 4, x, 0.34, z, IRON);
  f.box(0.026, 0.006, 0.006, x, 0.26, z, IRON);
}

/** Saule pleureur : tronc, houppier, rameaux qui retombent */
function willow(f: Fr, x: number, z: number) {
  f.cyl(0.02, 0.03, 0.24, 6, x, 0, z, TRUNK);
  f.ball(0.16, x, 0.3, z, 0x8ab85a, false, 1, 0.6, 1, 1);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2, r = 0.14 + H(i, 410) * 0.03;
    f.box(0.03, 0.18, 0.012, x + Math.cos(a) * r, 0.12 + H(i, 411) * 0.04, z + Math.sin(a) * r, i % 2 ? 0x9cc46a : 0x7aa84e, false, 0, -a + PI / 2);
  }
}

function industrial(f: Fr, kit: ModelKit) {
  lawn(f, 0x8ebe5c);
  // les allées de gravier : la grande, la transversale, et le rond-point du milieu
  f.box(0.22, 0.008, 1.9, 0, 0, 0.02, 0xd8ccb2);
  f.box(1.7, 0.008, 0.14, 0, 0, 0.05, 0xd8ccb2);
  f.cyl(0.18, 0.18, 0.009, 20, 0, 0, 0.05, 0xd8ccb2);
  f.cyl(0.11, 0.11, 0.016, 18, 0, 0, 0.05, 0x6a9a48);
  // l'obélisque au milieu du rond-point, couronnes à son pied
  f.box(0.08, 0.05, 0.08, 0, 0.012, 0.05, LIME_D);
  f.add(new THREE.CylinderGeometry(0.014, 0.03, 0.3, 4).rotateY(PI / 4).translate(0, 0.15, 0), 0, 0.062, 0.05, 0x9aa0a8);
  f.add(new THREE.ConeGeometry(0.016, 0.03, 4).rotateY(PI / 4).translate(0, 0.015, 0), 0, 0.362, 0.05, 0x9aa0a8);
  for (const a of [0.4, 2.2, 4.0]) blooms(f, Math.cos(a) * 0.07, 0.012, 0.05 + Math.sin(a) * 0.07, 4, 0.018, 420 + Math.round(a * 10));
  // la grille sur ses piliers, tout autour, et le grand portail ouvert
  const pill = (x: number, z: number) => { f.box(0.05, 0.16, 0.05, x, 0, z, LIME_D); f.box(0.06, 0.014, 0.06, x, 0.16, z, LIME); };
  for (const [a, b, at, z] of [[-0.96, 0.96, -0.96, false], [-0.96, 0.96, -0.96, true], [-0.96, 0.96, 0.96, true], [-0.96, -0.2, 0.96, false], [0.2, 0.96, 0.96, false]] as [number, number, number, boolean][]) {
    railing(f, a, b, at, z, 0.13);
    const n = Math.round(Math.abs(b - a) / 0.38);
    for (let i = 0; i <= n; i++) { const u = a + ((b - a) * i) / n; pill(z ? at : u, z ? u : at); }
  }
  for (const s of [-1, 1]) {
    f.box(0.08, 0.3, 0.08, s * 0.17, 0, 0.96, LIME); f.box(0.095, 0.02, 0.095, s * 0.17, 0.3, 0.96, LIME_D);
    f.ball(0.03, s * 0.17, 0.35, 0.96, LIME_D, false, 1, 1.2, 1); f.cyl(0.015, 0.02, 0.025, 8, s * 0.17, 0.32, 0.96, LIME_D);
    // les vantaux ouverts vers l'intérieur
    const v = f.sub(s * 0.13, 0.95, s * 1.1);
    for (let i = 0; i < 4; i++) v.box(0.004, 0.2, 0.004, -s * (0.02 + i * 0.03), 0, 0, IRON);
    for (const y of [0.04, 0.12, 0.2]) v.box(0.11, 0.006, 0.006, -s * 0.06, y, 0, IRON);
  }
  f.add(new THREE.TorusGeometry(0.17, 0.008, 4, 20, PI), 0, 0.3, 0.96, IRON);
  f.box(0.16, 0.03, 0.006, 0, 0.42, 0.96, IRON); f.box(0.13, 0.016, 0.002, 0, 0.427, 0.964, 0xd8b86a);
  // la chapelle néogothique au fond : murs, contreforts à pinacles, toit raide, rosace, porte en ogive, clocheton
  const cz = -0.58;
  f.box(0.44, 0.34, 0.5, 0, 0, cz, LIME);
  f.sub(0, cz, PI / 2).gable(0.54, 0.3, 0.48, 0, 0.34, 0, SLATE);
  for (const s of [-1, 1]) for (const z of [-0.15, 0.08, 0.24]) { f.box(0.05, 0.26, 0.06, s * 0.235, 0, cz + z, LIME_D); f.cone(0.02, 0.07, 4, s * 0.235, 0.26, cz + z, LIME_D); }
  f.box(0.13, 0.2, 0.01, 0, 0, cz + 0.252, 0x4a3226);
  f.sub(0, cz + 0.252, PI / 2).gable(0.012, 0.07, 0.13, 0, 0.2, 0, 0x4a3226);
  f.sub(0, cz + 0.258, PI / 2).gable(0.012, 0.08, 0.16, 0, 0.2, 0, LIME_D);
  f.add(new THREE.CircleGeometry(0.06, 16), 0, 0.42, cz + 0.252, 0xb07ad8, true);
  f.add(new THREE.TorusGeometry(0.062, 0.008, 4, 16), 0, 0.42, cz + 0.254, LIME_D);
  for (let i = 0; i < 6; i++) f.box(0.004, 0.12, 0.004, 0, 0.36, cz + 0.256, LIME_D, false, (i / 6) * PI);
  for (const s of [-1, 1]) for (const z of [-0.04, 0.16]) { f.box(0.004, 0.14, 0.05, s * 0.222, 0.1, cz + z, 0x7ab8ff, true); f.sub(s * 0.222, cz + z, PI / 2).gable(0.05, 0.03, 0.004, 0, 0.24, 0, 0x7ab8ff); }
  f.box(0.08, 0.1, 0.08, 0, 0.58, cz + 0.16, LIME);
  f.cone(0.07, 0.18, 4, 0, 0.68, cz + 0.16, SLATE);
  f.box(0.006, 0.06, 0.006, 0, 0.86, cz + 0.16, IRON); f.box(0.03, 0.006, 0.006, 0, 0.89, cz + 0.16, IRON);
  for (let k = 0; k < 3; k++) f.box(0.24 - k * 0.04, 0.02, 0.05, 0, k * 0.02, cz + 0.29 + (2 - k) * 0.02, LIME_D);
  // les caveaux de famille de part et d'autre de la chapelle
  vault(f, -0.68, -0.62, PI / 2, LIME);
  vault(f, 0.68, -0.62, -PI / 2, 0xd8cdb6);
  // les rangées de tombes, une couronne de-ci de-là
  const stones: Stone[] = ['round', 'gothic', 'cross', 'slab'], cols = [LIME, 0x9aa0a8, 0x5a5e66, LIME_D];
  row(f, -0.82, -0.3, 0.68, 4, 0, stones, cols, 430, { wreath: 0.3 });
  row(f, 0.3, 0.82, 0.68, 4, 0, stones, cols, 440, { wreath: 0.3 });
  row(f, -0.82, -0.3, 0.38, 4, 0, stones, cols, 450, { wreath: 0.3 });
  row(f, 0.3, 0.82, 0.38, 4, 0, stones, cols, 460, { wreath: 0.3 });
  row(f, -0.82, -0.36, -0.2, 3, 0, stones, cols, 470, { wreath: 0.2 });
  // l'ange sur son piédestal, face à l'allée
  const ax = 0.5, az = -0.22;
  f.box(0.08, 0.1, 0.08, ax, 0, az, LIME_D); f.box(0.09, 0.012, 0.09, ax, 0.1, az, LIME);
  person(f, ax, az, -PI / 2, 0xf2eee6, { y: 0.112, legs: 0xf2eee6, skin: 0xf2eee6, hair: 0xf2eee6, hat: 'none', arms: 'front' });
  for (const s of [-1, 1]) f.add(new THREE.ConeGeometry(0.035, 0.12, 3).scale(1, 1, 0.3), ax + 0.02, 0.27, az + s * 0.04, 0xf2eee6, false, s * 0.5);
  // le saule pleureur, les cyprès, les réverbères, le banc
  willow(f, 0.74, 0.0);
  for (const [x, z] of [[-0.88, 0.0], [-0.88, -0.3], [0.88, 0.86], [-0.88, 0.86]]) cypress(f, x, z, 0.36);
  for (const [x, z] of [[-0.16, 0.5], [0.16, -0.25], [0.16, 0.5], [-0.16, -0.25]]) gasLamp(f, x, z);
  bench(f, -0.5, 0.15, 0, 0x6a4a32);
  bench(f, 0.5, 0.14, 0, 0x6a4a32);
  for (const s of [-1, 1]) for (const z of [0.3, 0.72]) { f.box(0.03, 0.035, 0.2, s * 0.13, 0, z, 0x4f8a40); f.box(0.032, 0.006, 0.2, s * 0.13, 0.035, z, 0x5f9a4a); }
  for (let i = 0; i < 6; i++) blooms(f, -0.85 + H(i, 480) * 0.3, 0, -0.85 + H(i, 481) * 0.2, 4, 0.022, 482 + i);
  // un jardinier à l'arrosoir, une dame qui dépose des fleurs, un monsieur en haut-de-forme
  person(f, -0.55, 0.53, PI, 0x7a6a9a, { legs: 0x3a3a48, hat: 'none', arms: 'front' });
  person(f, 0.55, 0.22, PI + 0.4, 0x3a3e4a, { legs: 0x2a2a30, hat: 'top', arms: 'down' });
  person(f, 0.06, 0.25, -PI / 2, 0x6a7a4a, { legs: 0x4a4038, hat: 'cap', hatColor: 0x5a4a3a, arms: 'front' });
  f.box(0.03, 0.02, 0.02, 0.1, 0.1, 0.25, 0x6a8a9a); f.tube([0.115, 0.115, 0.25], [0.15, 0.12, 0.25], 0.003, 0x6a8a9a);
  void kit;
}

// -------------------------------------------------------------- Moderne : le parc du souvenir
const CONC = 0xe8e6e0, CONC_D = 0xc8c6c0, GRANITE = 0x3a3e46, WATER = 0x6aaad8;

/** Cerisier en fleurs (`pink`) ou bouleau */
function blossomTree(f: Fr, x: number, z: number, s: number, pink: boolean) {
  if (pink) {
    f.cyl(0.012 * s, 0.02 * s, 0.18 * s, 6, x, 0, z, 0x5a3e30);
    for (let i = 0; i < 4; i++) f.ball(0.07 * s, x + (H(i, 501) - 0.5) * 0.12 * s, 0.22 * s + H(i, 502) * 0.06 * s, z + (H(i, 503) - 0.5) * 0.12 * s, i % 2 ? 0xffb8d0 : 0xf8a0c0, false, 1, 0.8, 1, 1);
    for (let i = 0; i < 6; i++) f.ball(0.006, x + (H(i, 504) - 0.5) * 0.3 * s, 0.002, z + (H(i, 505) - 0.5) * 0.3 * s, 0xffc8dc, false, 1.5, 0.3, 1.5);
  } else {
    f.cyl(0.008 * s, 0.012 * s, 0.3 * s, 6, x, 0, z, 0xf0ece4);
    for (let k = 0; k < 4; k++) f.box(0.014 * s, 0.004, 0.014 * s, x, 0.04 * s + k * 0.06 * s, z, 0x2a2a2a);
    f.ball(0.07 * s, x, 0.32 * s, z, 0x9cc45a, false, 0.9, 1.4, 0.9, 1);
    f.ball(0.05 * s, x + 0.03 * s, 0.26 * s, z + 0.02 * s, 0xb4d46a, false, 0.9, 1.2, 0.9);
  }
}

function modern(f: Fr, kit: ModelKit) {
  lawn(f, 0x9acc66);
  // les allées de béton clair, en lacets
  f.box(0.18, 0.008, 0.9, 0, 0, 0.5, CONC);
  f.box(1.6, 0.008, 0.16, 0, 0, 0.06, CONC);
  for (const s of [-1, 1]) f.box(0.16, 0.008, 0.62, s * 0.72, 0, -0.18, CONC);
  // l'entrée : muret bas, nom en lettres de métal, massifs fleuris
  for (const s of [-1, 1]) {
    f.box(0.6, 0.07, 0.05, s * 0.4, 0, 0.94, CONC_D);
    f.box(0.7, 0.012, 0.012, s * 0.4, 0.075, 0.94, CONC);
    for (let i = 0; i < 6; i++) blooms(f, s * (0.18 + i * 0.12), 0, 0.84, 5, 0.028, 520 + i + (s > 0 ? 10 : 0), [0xffffff, 0xb07ad8, 0x7ab8ff, 0xffd24a]);
  }
  for (let i = 0; i < 8; i++) f.box(0.014, 0.026, 0.002, -0.53 + i * 0.022, 0.03, 0.967, 0xb8bcc4);
  // le mur des noms au fond : granit poli, lignes gravées, fleurs déposées à son pied
  const wz = -0.82;
  f.box(1.4, 0.2, 0.06, 0, 0, wz, GRANITE);
  f.box(1.44, 0.014, 0.08, 0, 0.2, wz, CONC_D);
  for (let c = 0; c < 8; c++) for (let r = 0; r < 6; r++) f.box(0.1 + H(c * 7 + r, 530) * 0.04, 0.004, 0.002, -0.6 + c * 0.17, 0.03 + r * 0.028, wz + 0.031, 0xd8d8d0);
  for (let i = 0; i < 6; i++) blooms(f, -0.55 + i * 0.22, 0, wz + 0.07, 4, 0.02, 540 + i);
  // le bassin miroir, son margelle et ses nymphéas
  f.box(0.7, 0.02, 0.3, 0, 0, -0.42, CONC_D);
  f.box(0.64, 0.024, 0.24, 0, 0, -0.42, WATER, false);
  f.box(0.62, 0.004, 0.22, 0, 0.022, -0.42, lt(WATER, 0.3));
  for (let i = 0; i < 5; i++) { f.cyl(0.018, 0.018, 0.004, 8, -0.24 + H(i, 550) * 0.48, 0.026, -0.42 + (H(i, 551) - 0.5) * 0.16, 0x5a9a48); if (i % 2) f.ball(0.007, -0.24 + H(i, 550) * 0.48, 0.032, -0.42 + (H(i, 551) - 0.5) * 0.16, 0xffffff); }
  // le columbarium, à droite : grille de niches et leurs plaques, petits vases
  const kx = 0.86;
  f.box(0.08, 0.26, 0.5, kx, 0, 0.42, CONC);
  for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) {
    f.box(0.002, 0.05, 0.07, kx - 0.041, 0.02 + k * 0.058, 0.22 + i * 0.08, H(i * 4 + k, 560) > 0.3 ? 0xb8bcc4 : 0x8a8f96);
    if (H(i * 4 + k, 561) > 0.7) f.ball(0.007, kx - 0.048, 0.06 + k * 0.058, 0.22 + i * 0.08, FLOWERS[(i + k) % FLOWERS.length]);
  }
  f.box(0.1, 0.012, 0.52, kx, 0.26, 0.42, CONC_D);
  // le pavillon de recueillement, à gauche : toit mince sur poteaux fins, bancs dessous
  const px = -0.62, pz = 0.42;
  for (const [dx, dz] of [[-0.16, -0.12], [0.16, -0.12], [-0.16, 0.12], [0.16, 0.12]]) f.cyl(0.008, 0.008, 0.26, 6, px + dx, 0, pz + dz, 0xdedcd6);
  f.box(0.42, 0.016, 0.34, px, 0.26, pz, 0xf4f2ee);
  f.box(0.44, 0.004, 0.36, px, 0.276, pz, CONC_D);
  bench(f, px, pz - 0.04, 0, 0x9a7a5a, false);
  f.box(0.36, 0.006, 0.28, px, 0.002, pz, CONC_D);
  // les plaques au ras de la pelouse, en rangées
  for (const [x0, x1, z] of [[-0.56, -0.18, -0.08], [-0.56, -0.18, -0.24], [0.18, 0.56, -0.08], [0.18, 0.56, -0.24], [0.18, 0.62, 0.3], [0.18, 0.62, 0.52]] as [number, number, number][]) row(f, x0, x1, z, 4, 0, ['plaque'], [0xa8acb4, 0xc8c4bc, 0x8a8f96], 580 + Math.round((x0 + z) * 100), { plot: 0x8cc25e });
  // la sculpture du souvenir : deux mains de bronze stylisées qui tiennent une sphère, sur un socle de béton
  f.box(0.1, 0.06, 0.1, 0.3, 0, 0.62, CONC_D);
  for (const s of [-1, 1]) f.add(new THREE.TorusGeometry(0.04, 0.01, 4, 10, PI), 0.3 + s * 0.012, 0.1, 0.62, 0xb08a4a, false, s * 0.6 + PI, PI / 2);
  f.ball(0.026, 0.3, 0.115, 0.62, 0xe8d8a0, false, 1, 1, 1, 1);
  // trois jets d'eau dans le bassin, les haies taillées le long de l'allée d'entrée
  for (const x of [-0.2, 0, 0.2]) { f.cyl(0.003, 0.012, 0.07, 6, x, 0.02, -0.42, 0xdff4ff); f.ball(0.012, x, 0.09, -0.42, 0xeef8ff, false, 1, 0.6, 1); }
  for (const s of [-1, 1]) { f.box(0.03, 0.04, 0.5, s * 0.15, 0, 0.42, 0x5f9a4a); f.box(0.032, 0.006, 0.5, s * 0.15, 0.04, 0.42, 0x6faa58); }
  // les cerisiers en fleurs et les bouleaux
  blossomTree(f, -0.74, -0.45, 1.3, true);
  blossomTree(f, 0.62, -0.5, 1.2, true);
  blossomTree(f, -0.3, 0.72, 1.0, true);
  for (const [x, z] of [[0.34, 0.76], [-0.88, 0.0], [0.88, 0.02], [-0.92, 0.85]]) blossomTree(f, x, z, 1.1, false);
  // les bornes lumineuses le long des allées
  for (const z of [0.25, 0.5, 0.75]) for (const s of [-1, 1]) { f.cyl(0.012, 0.012, 0.05, 8, s * 0.12, 0, z, 0xb8bcc4); f.cyl(0.013, 0.013, 0.012, 8, s * 0.12, 0.05, z, 0xfff2c8, true); }
  // une famille devant le mur, une personne au columbarium, un enfant
  person(f, -0.1, -0.68, PI, 0x4a6a9a, { legs: 0x3a3a48, hat: 'none', arms: 'front' });
  person(f, 0.06, -0.66, PI, 0xc87a5a, { legs: 0x5a5a6a, hat: 'none' });
  person(f, 0.7, 0.5, PI / 2, 0x6a8a5a, { legs: 0x3a3a48, hat: 'none', arms: 'front' });
  const kid = f.sub(-0.02, -0.62, PI, 0.7);
  person(kid, 0, 0, 0, 0xf2c84a, { legs: 0x4a6a9a, hat: 'none', arms: 'one' });
  void kit;
}

// -------------------------------------------------------------- Futuriste : le jardin du souvenir
const PEARL = 0xeef2f6, PANEL = 0xc8d2dc, NEON = 0x7af0e0, ROSE = 0xffa8e0, GLASS = 0xbfe8f8;

function future(f: Fr, kit: ModelKit) {
  lawn(f, 0x92c86c);
  // l'allée blanche et l'anneau autour du bassin
  f.box(0.2, 0.01, 0.62, 0, 0, 0.66, PEARL);
  f.add(new THREE.RingGeometry(0.5, 0.64, 40).rotateX(-PI / 2), 0, 0.01, -0.05, PEARL);
  f.add(new THREE.RingGeometry(0.635, 0.645, 40).rotateX(-PI / 2), 0, 0.012, -0.05, NEON, 'neon');
  // la porte en arche, son liseré de lumière
  f.add(new THREE.TorusGeometry(0.2, 0.022, 6, 24, PI), 0, 0.0, 0.9, PEARL);
  f.add(new THREE.TorusGeometry(0.2, 0.005, 4, 24, PI), 0, 0.0, 0.925, NEON, 'neon');
  for (const s of [-1, 1]) { f.box(0.6, 0.05, 0.04, s * 0.58, 0, 0.93, PEARL); f.box(0.6, 0.004, 0.044, s * 0.58, 0.05, 0.93, NEON, 'neon'); }
  // le bassin, son eau claire, le rebord lumineux
  f.cyl(0.5, 0.5, 0.02, 40, 0, 0, -0.05, PANEL);
  f.cyl(0.47, 0.47, 0.024, 40, 0, 0, -0.05, 0x7ac8e8);
  f.add(new THREE.TorusGeometry(0.485, 0.006, 4, 48).rotateX(PI / 2), 0, 0.024, -0.05, NEON, 'neon');
  // l'île et l'arbre de mémoire : tronc blanc torsadé, branches, feuilles de lumière
  const tz = -0.05;
  f.cyl(0.14, 0.16, 0.03, 20, 0, 0, tz, 0x7ab85a);
  f.cyl(0.03, 0.045, 0.3, 8, 0, 0.03, tz, PEARL);
  const br: [number, number, number][] = [[0.16, 0.42, 0.02], [-0.15, 0.4, 0.06], [0.04, 0.46, -0.16], [-0.06, 0.44, 0.17], [0.13, 0.36, -0.1]];
  for (const [x, y, z] of br) { f.tube([0, 0.28, tz], [x, y, tz + z], 0.012, PEARL); f.tube([x, y, tz + z], [x * 1.35, y + 0.08, tz + z * 1.35], 0.007, PEARL); }
  // des galets de passage dans l'eau, des noms en lumière sur la margelle
  for (let i = 0; i < 4; i++) f.cyl(0.035, 0.038, 0.03, 10, 0, 0, tz + 0.43 - i * 0.075, PEARL);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; f.box(0.05, 0.003, 0.006, Math.cos(a) * 0.495, 0.022, tz + Math.sin(a) * 0.495, i % 2 ? ROSE : NEON, 'neon', 0, -a + PI / 2); }
  // la couronne : des feuilles de lumière en dôme, quelques lanternes pendues aux branches
  for (let i = 0; i < 70; i++) {
    const a = H(i, 601) * PI * 2, r = Math.sqrt(H(i, 605)), u = Math.sqrt(1 - r * r * 0.85) * (0.6 + H(i, 602) * 0.4);
    f.ball(0.034 + H(i, 603) * 0.022, Math.cos(a) * r * 0.24, 0.42 + u * 0.16, tz + Math.sin(a) * r * 0.24, i % 3 ? NEON : ROSE, 'neon', 1, 0.75, 1);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.2, x = Math.cos(a) * 0.22, z = tz + Math.sin(a) * 0.22;
    f.tube([x, 0.42, z], [x, 0.33, z], 0.0015, PANEL);
    f.ball(0.012, x, 0.32, z, 0xfff2c8, 'neon');
  }
  // les sphères de lumière qui flottent au-dessus de l'eau
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.3, r = 0.34;
    const o = kit.sway(f.w(Math.cos(a) * r, 0.2 + (i % 3) * 0.05, tz + Math.sin(a) * r), [1, 0, 0], 0.12, 0.25 + i * 0.03);
    o.add(new THREE.IcosahedronGeometry(0.018, 1), 0, 0, 0, i % 2 ? ROSE : 0xfff2c8, 0, 'neon');
  }
  // les colonnes de mémoire en verre, leurs anneaux, leurs noms en lumière
  for (let i = 0; i < 6; i++) {
    const a = -PI / 2 + (i - 2.5) * 0.42 + PI, r = 0.78, x = Math.cos(a) * r * 1.05, z = tz + Math.sin(a) * r * 0.95;
    if (z > 0.6) continue;
    f.cyl(0.05, 0.055, 0.02, 12, x, 0, z, PANEL);
    f.cyl(0.03, 0.03, 0.26, 10, x, 0.02, z, GLASS, true);
    for (const y of [0.08, 0.16, 0.24]) f.add(new THREE.TorusGeometry(0.034, 0.003, 3, 14).rotateX(PI / 2), x, 0.02 + y, z, i % 2 ? ROSE : NEON, 'neon');
    f.ball(0.02, x, 0.31, z, 0xfff2c8, 'neon');
  }
  // l'anneau holographique au-dessus de l'arbre, qui tourne lentement
  const ring = kit.turn(f.w(0, 0.62, tz), [0, 1, 0], 0.2);
  ring.add(new THREE.TorusGeometry(0.12, 0.004, 4, 32).rotateX(PI / 2), 0, 0, 0, NEON, 0, 'neon');
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; ring.add(new THREE.BoxGeometry(0.02, 0.006, 0.002), Math.cos(a) * 0.12, 0.012, Math.sin(a) * 0.12, ROSE, -a + PI / 2, 'neon'); }
  // les galets de mémoire lumineux le long de l'allée et autour de l'anneau
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2, r = 0.7 + (i % 2) * 0.05;
    const x = Math.cos(a) * r, z = tz + Math.sin(a) * r * 0.95;
    if (z > 0.55 && Math.abs(x) < 0.2) continue;
    f.ball(0.016, x, 0.004, z, i % 3 ? 0xdff8ff : 0xffe0f4, 'neon', 1.3, 0.5, 1);
  }
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) f.ball(0.014, s * 0.13, 0.004, 0.42 + i * 0.1, 0xdff8ff, 'neon', 1.3, 0.5, 1);
  // les bancs blancs courbes, les massifs aux fleurs de lumière, les haies taillées
  for (const s of [-1, 1]) {
    // le banc blanc courbe : une assise en arc sur trois pieds, un liseré de lumière dessous
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.25, x = s * 0.58 + Math.sin(a) * 0.16 * s, z = 0.5 + Math.cos(a) * 0.05;
      f.box(0.075, 0.016, 0.05, x, 0.035, z, PEARL, false, 0, a * s);
      if (i % 2 === 0) f.box(0.012, 0.035, 0.03, x, 0, z, PANEL);
      f.box(0.07, 0.003, 0.004, x, 0.03, z + 0.024, NEON, 'neon', 0, a * s);
    }
  }
  for (const [x, z] of [[-0.82, -0.75], [0.82, -0.75], [-0.85, 0.2], [0.85, 0.2], [-0.4, 0.75], [0.4, 0.75]]) {
    f.cyl(0.07, 0.08, 0.03, 12, x, 0, z, PEARL);
    blooms(f, x, 0.03, z, 7, 0.05, 620 + Math.round(x * 10 + z * 100), [NEON, ROSE, 0xfff2c8, 0xb8a0ff]);
  }
  for (const s of [-1, 1]) { f.box(0.06, 0.06, 0.9, s * 0.92, 0, -0.3, 0x5f9a50); f.box(0.06, 0.004, 0.9, s * 0.92, 0.06, -0.3, lt(0x5f9a50, 0.2)); }
  // des visiteurs en tenues claires, l'un pose la main sur une colonne
  person(f, 0.2, 0.62, PI - 0.3, PEARL, { legs: PANEL, hat: 'none', arms: 'front' });
  person(f, -0.3, 0.5, PI + 0.5, 0xb8a0ff, { legs: PANEL, hat: 'none' });
  person(f, -0.62, -0.42, -PI / 2 - 0.6, 0x9adfe8, { legs: PANEL, hat: 'none', arms: 'one' });
}

/** Le cimetière à l'âge `age` (0 à 5), sur sa parcelle de 2 × 2 */
export function cemetery(p: Parts, age: number, kit: ModelKit) {
  const f = new Fr(p);
  if (age >= 5) future(f, kit);
  else if (age === 4) modern(f, kit);
  else if (age === 3) industrial(f, kit);
  else if (age === 2) medieval(f, kit);
  else if (age === 1) antique(f, kit);
  else prehistoric(f, kit);
}
