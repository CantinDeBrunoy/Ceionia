import * as THREE from 'three';

import { Blason, BLASON_COLORS, DEFAULT_BLASON, EMBLEM_HOLE, EMBLEM_PATH, SHAPES } from '../sim/blason';

/**
 * Les couleurs du blason du joueur sur les modèles, sans refaire aucune géométrie. Une pièce « au blason » reçoit au lieu de
 * sa couleur une **sentinelle** (un nombre négatif : `TEAM_A`, `TEAM_B`, `TEAM_FLAG`, `TEAM_BANNER`, ou `team(code, nuance)`).
 * `Parts` (et `paint` des Enfers) l'écrit dans la couleur des sommets avec un canal bleu négatif, qu'aucune vraie couleur n'a :
 * - couleur principale : bleu ∈ [-1,5 ; -0,5], rouge = nuance ;
 * - couleur de l'emblème : bleu ≈ -4, rouge = nuance ;
 * - champ d'un drapeau (bleu ≈ -16), d'une bannière pendue (≈ -64) ou d'un écu (≈ -256) : rouge = place sur la toile de la hampe au bout
 *   (u), vert = hauteur (v) plus le rapport largeur / hauteur en dixièmes (partie entière).
 * L'occlusion factice (`Parts.build`) ou la nuance des Enfers multiplient les trois canaux d'un même facteur : le bleu le
 * donne, on le retire. Les matériaux qui dessinent ces pièces passent par `addTeamPaint` : leur shader remplace la sentinelle
 * par les couleurs du blason (uniforms) et, sur un champ, dessine l'emblème (une petite texture commune, `emblemTex`) et
 * découpe la forme du drapeau. Changer de blason ne coûte qu'un dessin de canvas : tout le jeu suit à l'image suivante
 */

export const TEAM_A = -1100;
export const TEAM_B = -2100;
/** champ d'un drapeau qui flotte : la hampe du côté du plus petit x (ou z) local de la pièce */
export const TEAM_FLAG = -3100;
/** le même, la hampe du côté du plus grand x (ou z) */
export const TEAM_FLAG_R = -5100;
/** champ d'une bannière pendue : la forme se découpe en bas */
export const TEAM_BANNER = -4100;
/** couleur principale à l'emblème, sans découpe (écu, bouclier, tabard, flanc d'un char) */
export const TEAM_EMBLEM = -6100;

/** Couleur du blason nuancée : `team(TEAM_A, 0.8)` un ton plus sombre que la couleur principale */
export function team(base: number, shade: number) {
  return -(Math.floor(-base / 1000) * 1000 + Math.round(Math.max(0, Math.min(9.99, shade)) * 100));
}
export const isTeam = (c: number) => c < 0;
/** Une sentinelle assombrie (ou éclaircie) de `k` : `dark` des modèles appliqué à une couleur du blason */
export const teamShade = (c: number, k: number) => team(c, ((-c % 1000) / 100) * k);

const SCALE = { 1: 1, 2: 4, 3: 16, 4: 64, 5: 16, 6: 256 } as Record<number, number>;

/**
 * Écrit la couleur des sommets d'une sentinelle dans `arr` (déjà à la taille). `pos` : les positions **locales** de la pièce,
 * avant sa pose (le champ d'un drapeau se mesure sur elles)
 */
export function teamColors(sentinel: number, pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, arr: Float32Array, k: (i: number) => number = () => 1) {
  const code = Math.floor(-sentinel / 1000), shade = (-sentinel % 1000) / 100, s = SCALE[code] ?? 1, n = pos.count;
  if (code === 1 || code === 2) {
    for (let i = 0; i < n; i++) { const f = k(i); arr[i * 3] = shade * f; arr[i * 3 + 1] = shade * f; arr[i * 3 + 2] = -s * f; }
    return;
  }
  // le champ : ses deux plus grandes dimensions ; la hauteur est y (drapeau, bannière), la longueur le plus long de x et z
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const alongX = x1 - x0 >= z1 - z0, w = Math.max(1e-6, alongX ? x1 - x0 : z1 - z0), h = Math.max(1e-6, y1 - y0);
  const aspect = Math.max(1, Math.min(99, Math.round((w / h) * 10)));
  for (let i = 0; i < n; i++) {
    const a = alongX ? pos.getX(i) : pos.getZ(i);
    let u = (a - (alongX ? x0 : z0)) / w;
    if (code === 5) u = 1 - u;
    const v = (pos.getY(i) - y0) / h, f = k(i);
    arr[i * 3] = Math.min(0.999, Math.max(0, u)) * f;
    arr[i * 3 + 1] = (aspect + Math.min(0.999, Math.max(0, v)) * 0.9) * f;
    arr[i * 3 + 2] = -s * f;
  }
}

// ── l'état partagé du blason : deux couleurs, l'emblème (texture), la forme
const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (canvas) { canvas.width = 128; canvas.height = 128; }
export const emblemTex = new THREE.Texture(canvas ?? undefined);
emblemTex.colorSpace = THREE.NoColorSpace;
emblemTex.wrapS = emblemTex.wrapT = THREE.ClampToEdgeWrapping;
emblemTex.anisotropy = 2;
export const TEAM = {
  uTeamA: { value: new THREE.Color(BLASON_COLORS[DEFAULT_BLASON.a]) },
  uTeamB: { value: new THREE.Color(BLASON_COLORS[DEFAULT_BLASON.b]) },
  uTeamEmb: { value: emblemTex },
  uTeamShape: { value: 0 },
};
let current = '';
/** Monte à chaque changement de blason (les images faites une fois, comme les portraits des troupes, se refont) */
export let teamVersion = 0;

/** Applique un blason : couleurs, emblème redessiné, forme (rien si c'est déjà le même) */
export function setTeamBlason(bl: Blason) {
  const key = `${bl.a}|${bl.b}|${bl.e}|${bl.s}`;
  if (key === current) return;
  const emb = !current || current.split('|')[2] !== bl.e;
  current = key;
  teamVersion++;
  TEAM.uTeamA.value.setHex(BLASON_COLORS[bl.a]);
  TEAM.uTeamB.value.setHex(BLASON_COLORS[bl.b]);
  TEAM.uTeamShape.value = SHAPES.indexOf(bl.s);
  if (emb && canvas) {
    const g = canvas.getContext('2d');
    if (!g || typeof Path2D === 'undefined') return;
    // le masque de l'emblème en blanc sur noir, un peu en retrait du bord (le filtrage ne bave pas sur la toile)
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    g.save(); g.translate(6, 6); g.scale(1.16, 1.16);
    g.fillStyle = '#fff'; g.fill(new Path2D(EMBLEM_PATH[bl.e]));
    const hole = EMBLEM_HOLE[bl.e];
    if (hole) { g.fillStyle = '#000'; g.fill(new Path2D(hole)); }
    g.restore();
    emblemTex.needsUpdate = true;
  }
}

const FRAG_HEAD = `uniform vec3 uTeamA;
uniform vec3 uTeamB;
uniform sampler2D uTeamEmb;
uniform float uTeamShape;
`;

/** La couleur du blason d'un fragment marqué (voir l'en-tête), ou `discard` hors de la forme du drapeau */
const FRAG_BODY = `
  if (vColor.b < -0.45) {
    float tB = -vColor.b;
    vec3 tCol;
    if (tB < 2.0) tCol = uTeamA * vColor.r;
    else if (tB < 8.0) tCol = uTeamB * vColor.r;
    else {
      bool tBanner = tB >= 32.0 && tB < 128.0, tPlain = tB >= 128.0;
      float tF = tB / (tPlain ? 256.0 : tBanner ? 64.0 : 16.0);
      float tShape = tPlain ? 0.0 : uTeamShape;
      float tU = clamp(vColor.r / tF, 0.0, 1.0), tG = vColor.g / tF;
      float tAsp = max(0.1, floor(tG + 0.02) / 10.0), tV = clamp(fract(tG + 0.02) / 0.9 - 0.022, 0.0, 1.0);
      // la forme : queue d'aronde ou flamme, au bout du drapeau ou en bas de la bannière
      float tEnd = tBanner ? tV : 1.0 - tU, tAcross = tBanner ? tU : tV;
      if (tShape > 0.5 && tShape < 1.5 && 1.0 - tEnd > 1.0 - 0.24 * (1.0 - abs(2.0 * tAcross - 1.0))) discard;
      if (tShape > 1.5 && abs(2.0 * tAcross - 1.0) > 1.0 - 0.73 * (1.0 - tEnd)) discard;
      // l'emblème dans un carré centré (vers la hampe pour une forme découpée)
      vec2 tP = vec2(tU * tAsp, tV);
      float tSide = 0.74 * min(1.0, tAsp);
      vec2 tC = tBanner ? vec2(0.5 * tAsp, tShape > 0.5 ? 0.58 : 0.5) : vec2(tAsp * (tShape > 0.5 ? 0.42 : 0.5), 0.5);
      vec2 tE = (tP - tC) / tSide + 0.5;
      float tM = 0.0;
      if (tE.x > 0.0 && tE.x < 1.0 && tE.y > 0.0 && tE.y < 1.0) tM = texture2D(uTeamEmb, vec2(tE.x, tE.y)).r;
      tCol = mix(uTeamA, uTeamB, smoothstep(0.35, 0.65, tM)) * tF;
    }
    diffuseColor.rgb = diffuse * tCol;
  }
`;

/** Greffe la peinture du blason sur un matériau à couleurs de sommets (s'enchaîne avec les autres greffes) */
export function addTeamPaint<T extends THREE.Material>(mat: T): T {
  if (mat.userData.teamPaint) return mat;
  mat.userData.teamPaint = true;
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, TEAM);
    if (!sh.fragmentShader.includes('#include <color_fragment>')) return;
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  ${FRAG_BODY}
  #endif`);
  };
  mat.customProgramCacheKey = () => `${key}|team`;
  return mat;
}

/** Un matériau d'une seule couleur (le drapeau de la base des Enfers) qui prend la couleur principale du blason, et la suit */
export function teamFlagColor<T extends THREE.MeshStandardMaterial>(mat: T): T {
  mat.color = TEAM.uTeamA.value;
  return mat;
}

setTeamBlason(DEFAULT_BLASON);
