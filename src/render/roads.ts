import * as THREE from 'three';
import { World, N } from '../world/world';
import { hash2 } from '../core/rng';
import { Simplex } from '../world/noise';
import { KindId, sizeOf } from '../build/catalog';
import { mats } from './materials';
import { SNOWY } from './terrainView';
import { sampleCurve } from '../world/curves';

/** Chaussée selon l'âge : sentier, chemin de terre, dalles, pavés, asphalte */
const ROAD_COL = [0xb8915f, 0xb48b58, 0xb2a590, 0x8c8479, 0x5d6169];
/** Abords : terre battue des cours et des placettes, puis trottoirs de pierre, de béton */
const SIDE_COL = [0xc6a474, 0xc4a473, 0xc4a77c, 0xc9bea9, 0xd0ccc4];
/** Places pavées (devant les ateliers, les temples, et là où les rues se touchent en carré) */
const PLAZA_COL = [0xe1cea4, 0xe1cea4, 0xdcc9a2, 0xd6c3a2, 0xddc9ae];
/** Liseré de terre tassée au bord des chemins ; accotement de gravier des routes de campagne */
const RIM_COL = [0xa9865a, 0x987548, 0x9a8e7b, 0x8a8277, 0x8d8b86];
/** Bordures des trottoirs : granit, puis béton */
const CURB_COL = [0xaaa59c, 0xaaa59c, 0xaaa59c, 0xaba69d, 0xe9e7e1];
/** Part de terre battue dans les cours (l'herbe repousse par plaques) */
const YARD_A = [0.62, 0.7, 0.8, 1, 1];
/** Demi-largeur de la chaussée */
const HW = [0.21, 0.25, 0.27, 0.3, 0.32];
/** Les chemins de terre serpentent (amplitude du détour, en cases) ; leur largeur varie, leurs bords s'effilochent */
const WIGGLE = [0.32, 0.25, 0.14, 0, 0], WIDTH_VAR = [0.22, 0.18, 0.12, 0, 0], FRAY = [0.035, 0.03, 0.02, 0, 0];
/** Rayon des bordures arrondies aux coins des carrefours */
const FILLET = 0.12;
/** Ponts : tablier de bois, puis de pierre, puis d'acier ; piles et garde-corps */
const DECK_COL = [0x9a7452, 0xa27c58, 0x8f7c66, 0xa39d95, 0xb4b9c0].map((c) => new THREE.Color(c));
const PILE_COL = [0x6f5640, 0x6f5640, 0x8a8178, 0x8a8178, 0x7d838c].map((c) => new THREE.Color(c));
const SNOW = new THREE.Color(0xf2f6fa);
const PEBBLE = [0xb3aba1, 0x9d9890, 0xc8c2b8].map((c) => new THREE.Color(c));
/** Géométrie sans index ; l'icosaèdre n'en a déjà pas (THREE avertirait à chaque appel, à chaque refonte des routes) */
const unindexed = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** Directions des voisines, dans l'ordre des bits des masques : est, ouest, sud, nord */
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Quarts de case (signe x, signe z) */
const QUADS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
/** Bâtiments devant lesquels la terre est battue (une cour, une place) */
const YARD: Partial<Record<KindId, number>> = { workshop: 0.45, gather: 0.5, farm: 0.42, mill: 0.42, landmark: 0.5, terminal: 0.5, temple: 0.4, health: 0.42, school: 0.42, fire: 0.5, police: 0.45, tavern: 0.45, baths: 0.42, mine: 0.5, theater: 0.45, forum: 0.5, senate: 0.45, acropolis: 0.55 };
/** Bâtiments au pied desquels traînent tonneaux, caisses et sacs */
const CLUTTER: KindId[] = ['house', 'workshop', 'farm', 'mill'];
const BARREL = 0x9a6a44, HOOP = 0x6f5640, CRATE = 0xb48a5e, SACK = 0xd9c4a0;
/** Une case entière pavée (rectangle qui déborde de la case : pas de bord à l'intérieur) */
const FULL = [-1.5, -1.5, 1.5, 1.5];

/** Case de rue en ville : voisines en route, côtés et coins de trottoir, chaussée et trottoir en distances signées (coordonnées locales) */
interface Street {
  mask: number;
  sides: number;
  quads: number;
  plaza: boolean;
  /** rond-point dont la case fait partie */
  round: Round | null;
  /** case d'une route en courbe (sa chaussée suit la ligne de la courbe) */
  curve?: boolean;
  road: (x: number, z: number) => number;
  pave: (x: number, z: number) => number;
}

/** Morceaux de ligne d'une case de route en courbe (x, z à la suite) : la courbe elle-même, et ses raccords aux rues voisines */
interface Curved { pieces: number[][]; branches: number[][] }

/** Distance de (x, z) à une ligne brisée (x, z à la suite) */
function lineDist(x: number, z: number, l: number[]) {
  let best = 9;
  for (let i = 0; i + 3 < l.length; i += 2) {
    const ax = l[i], az = l[i + 1], bx = l[i + 2] - ax, bz = l[i + 3] - az, len = bx * bx + bz * bz;
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len)) : 0;
    best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - bz * t));
  }
  return best;
}

/** Point le plus proche de (x, z) sur des lignes brisées, et la direction de la ligne en ce point */
function closestOn(x: number, z: number, ls: number[][]): [number, number, number, number] | null {
  let best = Infinity, out: [number, number, number, number] | null = null;
  for (const l of ls) for (let i = 0; i + 3 < l.length; i += 2) {
    const ax = l[i], az = l[i + 1], bx = l[i + 2] - ax, bz = l[i + 3] - az, len = bx * bx + bz * bz;
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len)) : 0, px = ax + bx * t, pz = az + bz * t, d = Math.hypot(x - px, z - pz);
    if (d < best && len) { best = d; const s = Math.sqrt(len); out = [px, pz, bx / s, bz / s]; }
  }
  return out;
}

/**
 * Rond-point posé sur un carré (ou un rectangle) plein de cases de route : îlot rond (ou en stade sur un rectangle) autour
 * du segment `a`–`b`, anneau de chaussée de `rIn` à `rOut`, entrées (bord de case `e`, point de l'axe de l'îlot `q`) ;
 * cases de l'emprise (x0, z0, x1, z1 comprises)
 */
interface Round {
  a: [number, number];
  b: [number, number];
  rIn: number;
  rOut: number;
  entries: [number, number, number, number][];
  box: [number, number, number, number];
}

/** Point du segment a–b le plus proche de (x, z) */
function nearest(x: number, z: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
  return [ax + dx * t, az + dz * t];
}

/** Réunion adoucie de deux distances signées (raccord arrondi de rayon ~k) */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** Chaussée d'un rond-point (anneau et entrées raccordées en douceur), en coordonnées du monde */
function roundSdf(R: Round, hw: number) {
  const mid = (R.rIn + R.rOut) / 2, half = (R.rOut - R.rIn) / 2;
  return (x: number, z: number) => {
    const [qx, qz] = nearest(x, z, R.a[0], R.a[1], R.b[0], R.b[1]);
    let d = Math.abs(Math.hypot(x - qx, z - qz) - mid) - half;
    for (const [ex, ez, ix, iz] of R.entries) {
      const l = Math.hypot(ex - ix, ez - iz) || 1, px = ix + ((ex - ix) / l) * mid, pz = iz + ((ez - iz) / l) * mid;
      const [nx, nz] = nearest(x, z, ex, ez, px, pz);
      d = smin(d, Math.hypot(x - nx, z - nz) - hw, 0.14);
    }
    return d;
  };
}

/**
 * Chaussée d'une case de rue, en distance signée au bord (négative dessus), coordonnées locales (−0,5 … 0,5) : rue droite,
 * virage en quart de cercle, carrefour aux coins arrondis, impasse terminée par une raquette
 */
function streetSdf(mask: number, hw: number) {
  const E = (mask & 1) !== 0, W = (mask & 2) !== 0, S = (mask & 4) !== 0, Nn = (mask & 8) !== 0, n = +E + +W + +S + +Nn;
  return (x: number, z: number) => {
    if (n === 0) return Math.hypot(x, z) - hw * 1.15;
    if (n === 1) {
      const ax = E ? 1 : W ? -1 : 0, az = S ? 1 : Nn ? -1 : 0, u = x * ax + z * az, v = -x * az + z * ax;
      return Math.min(u >= 0 ? Math.abs(v) - hw : 9, Math.hypot(x, z) - hw * 1.15);
    }
    if (n === 2 && E && W) return Math.abs(z) - hw;
    if (n === 2 && S && Nn) return Math.abs(x) - hw;
    if (n === 2) return Math.abs(Math.hypot(x - (E ? 0.5 : -0.5), z - (S ? 0.5 : -0.5)) - 0.5) - hw;
    // carrefour : chaque quart de case entre deux branches a son coin de trottoir arrondi
    const ax = x >= 0 ? E : W, az = z >= 0 ? S : Nn, u = Math.abs(x), v = Math.abs(z);
    if (ax && az) {
      const qa = FILLET - (u - hw), qb = FILLET - (v - hw);
      return FILLET - (Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0));
    }
    if (ax) return v - hw;
    if (az) return u - hw;
    return Math.max(u - hw, v - hw);
  };
}

/** Trottoir d'une case de rue : les moitiés du côté des cases bâties, les coins entre deux branches (distance signée) */
function walkSdf(sides: number, quads: number) {
  return (x: number, z: number) => {
    let d = 1;
    if (sides & 1) d = Math.min(d, -x);
    if (sides & 2) d = Math.min(d, x);
    if (sides & 4) d = Math.min(d, -z);
    if (sides & 8) d = Math.min(d, z);
    QUADS.forEach(([sx, sz], i) => { if (quads & (1 << i)) d = Math.min(d, Math.max(-sx * x, -sz * z)); });
    return d;
  };
}

/** Distance signée à une réunion de rectangles (x0, z0, x1, z1), coordonnées locales */
function rectSdf(rects: number[][]) {
  return (x: number, z: number) => {
    let d = 9;
    for (const [x0, z0, x1, z1] of rects) {
      const dx = Math.max(x0 - x, x - x1), dz = Math.max(z0 - z, z - z1);
      d = Math.min(d, Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0));
    }
    return d;
  };
}

/**
 * Routes. Aux premiers âges, de vrais chemins de terre : chaque case de route est un point (un peu décalé, d'une case à l'autre)
 * relié à ses voisines par des courbes, aux bords irréguliers, dans des cours de terre battue où l'herbe repousse par plaques.
 * En ville (âge industriel, âge moderne), des rues droites : chaussée de pavés puis d'asphalte à largeur fixe, virages en
 * quart de cercle, carrefours aux coins arrondis, bordures et trottoirs du côté des maisons, places pavées, passages
 * piétons, ligne médiane. Les ponts sont des ouvrages (tablier, rampes, piles, garde-corps)
 */
export class RoadView {
  group = new THREE.Group();
  /** lanternes posées le long des chemins (x, z à la suite) : leur halo de lumière la nuit */
  lights: number[] = [];
  /** chaussée, trottoirs et cours, dessinés par le shader d'après leurs distances signées */
  private path: THREE.Mesh;
  /** ponts, cailloux, lanternes, tonneaux et caisses */
  private solid: THREE.Mesh;
  /** verre des lanternes (s'allume la nuit) */
  private glow: THREE.Mesh;
  /** marquages posés sur la chaussée (zébras, pointillés, lignes de rive, ornières, grilles) */
  private marks: THREE.Mesh;
  /** cases de route sous l'îlot d'un rond-point : les voitures en font le tour */
  islands = new Set<number>();
  /** géométries de base des petits objets (non indexées) */
  private cyl = unindexed(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0));
  private cube = unindexed(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  private ico = unindexed(new THREE.IcosahedronGeometry(1, 0));
  private noise = new Simplex(9137);
  /** revêtements (âge : terre, terre, dalles, pavés, asphalte), couleurs et neige, pour le shader */
  private u = {
    uStyle: { value: 0 }, uYardA: { value: 1 }, uFray: { value: 0 }, uSnowCol: { value: SNOW.clone() },
    uRoad: { value: new THREE.Color() }, uSide: { value: new THREE.Color() }, uPlaza: { value: new THREE.Color() },
    uRim: { value: new THREE.Color() }, uCurb: { value: new THREE.Color() },
  };

  constructor(private world: World) {
    const pathMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // chaque sommet porte sa distance au bord de la chaussée et à celui du trottoir (ou de la cour) : bords nets au pixel,
    // bordures, accotements, motif de chaque revêtement (grain de la terre, dalles, pavés, asphalte, dalles de béton)
    pathMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = 'attribute float aRoad;\nattribute float aPave;\nattribute float aKind;\nattribute float aSnow;\nvarying vec3 vRoadPos;\nvarying float vRoad;\nvarying float vPave;\nvarying float vKind;\nvarying float vSnow;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRoadPos = position; vRoad = aRoad; vPave = aPave; vKind = aKind; vSnow = aSnow;');
      sh.fragmentShader = `uniform float uStyle;
uniform vec3 uSnowCol;
uniform float uYardA;
uniform float uFray;
uniform vec3 uRoad;
uniform vec3 uSide;
uniform vec3 uPlaza;
uniform vec3 uRim;
uniform vec3 uCurb;
varying vec3 vRoadPos;
varying float vRoad;
varying float vPave;
varying float vKind;
varying float vSnow;
float rHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float rNoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), f.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0)), f.x), f.y);
}
// appareil de pierres ou de dalles : rangs décalés, joints adoucis au loin ; renvoie (teinte de la pierre, joint)
vec2 rBond(vec2 rp, vec2 sc, float shift, float irr, float jw) {
	vec2 g = rp * sc;
	float row = floor(g.y);
	g.x += row * shift + rHash(vec2(row, 3.1)) * irr;
	vec2 id = floor(g), f = abs(fract(g) - 0.5);
	float fw = max(fwidth(g.x), fwidth(g.y));
	float j = smoothstep(0.5 - jw - fw, 0.5 - jw + fw, max(f.x, f.y)) * (1.0 - smoothstep(0.2, 0.45, fw));
	return vec2(rHash(id), j);
}
float rGrain(vec2 rp, float sc, float amp) { return 1.0 - amp * 0.5 + rHash(floor(rp * sc)) * amp; }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
	{
		vec2 rp = vRoadPos.xz;
		bool town = uStyle > 2.5;
		float fr = max(fwidth(vRoad), 1e-4), fp = max(fwidth(vPave), 1e-4);
		// bords : nets en ville, irréguliers sur la terre
		// bords nets en ville ; sur la terre, des bords qui ondulent en douceur (pas de dents)
		float dR = vRoad + (town ? 0.0 : (rNoise(rp * 1.7 + 9.1) - 0.5) * 2.0 * uFray);
		float dP = vPave + (town ? 0.0 : (rNoise(rp * 1.8) - 0.5) * 0.16);
		float road = 1.0 - smoothstep(-fr, fr, dR);
		// trottoirs nets en ville ; sur la terre, une usure qui s'estompe peu à peu vers l'herbe, sans contour
		float pave = town ? 1.0 - smoothstep(-fp, fp, dP) : 1.0 - smoothstep(-0.32, 0.22, dP);
		// au cœur d'une cour ou d'une place (assez loin de son bord), le sol est plein ; vers les bords, quelques touffes d'herbe
		// percent, semées au hasard (un bruit, pas un motif régulier qui dessinerait un quadrillage)
		float solid = town ? 0.0 : 1.0 - smoothstep(-0.38, -0.14, vPave);
		if (!town) {
			float t = 1.0 - uYardA, hn = rNoise(rp * 0.9 + 3.7) * 0.7 + rNoise(rp * 2.3 + 8.1) * 0.3;
			pave *= mix(mix(0.55, 1.0, smoothstep(t - 0.3, t + 0.3, hn)) * 0.82, 0.96, solid);
		}
		float k = 1.0, kp = 1.0;
		vec2 b;
		if (uStyle < 1.5) k = rGrain(rp, 22.0, 0.1) + (rNoise(rp * 1.7) - 0.5) * 0.1;
		else if (uStyle < 2.5) { b = rBond(rp, vec2(5.5, 4.5), 0.5, 0.4, 0.06); k = mix(0.88 + b.x * 0.18, 0.7, b.y); }
		else if (uStyle < 3.5) { b = rBond(rp, vec2(15.0, 11.0), 0.5, 0.0, 0.1); k = mix(0.86 + b.x * 0.2, 0.64, b.y); }
		else k = rGrain(rp, 38.0, 0.07) + (rNoise(rp * 1.3) - 0.5) * 0.09;
		vec3 cPave;
		if (vKind > 0.5) {
			// places : petits pavés en rangs décalés
			b = uStyle < 3.5 ? rBond(rp, vec2(11.0, 11.0), 0.5, 0.0, 0.08) : rBond(rp, vec2(8.0, 8.0), 0.0, 0.0, 0.06);
			cPave = uPlaza * mix(0.84 + b.x * 0.24, 0.72, b.y);
		} else if (town) {
			// trottoirs : dalles de pierre, puis de béton
			b = uStyle < 3.5 ? rBond(rp, vec2(4.0, 6.0), 0.5, 0.0, 0.05) : rBond(rp, vec2(5.0, 5.0), 0.0, 0.0, 0.035);
			cPave = uSide * mix(0.93 + b.x * 0.1, 0.8, b.y);
		} else {
			cPave = uSide * (rGrain(rp, 14.0, 0.12) + (rNoise(rp * 2.1) - 0.5) * 0.12);
			// au cœur d'une place, le sol prend la teinte et le motif des chemins de l'âge : la place est un chemin bien rempli
			cPave = mix(cPave, uRoad * mix(k, 1.0, clamp(vSnow * 1.3, 0.0, 1.0)), solid);
		}
		vec3 c = mix(cPave, uRoad * mix(k, 1.0, clamp(vSnow * 1.3, 0.0, 1.0)), road);
		float a = max(road, pave);
		if (town) {
			// bordure du trottoir (ou accotement de gravier en campagne) juste au-delà de la chaussée, caniveau sombre au pied
			float band = smoothstep(-fr, fr, vRoad) * (1.0 - smoothstep(0.035 - fr, 0.035 + fr, vRoad));
			float gutter = smoothstep(-0.02 - fr, -0.02 + fr, vRoad) * road;
			c = mix(c, uCurb, band * pave);
			c = mix(c, uRim * rGrain(rp, 60.0, 0.2), band * (1.0 - pave));
			c *= 1.0 - gutter * 0.22 * pave;
			a = max(a, band);
		} else {
			// liseré de terre tassée au bord du chemin
			c = mix(c, uRim, smoothstep(-0.07, -0.015, dR) * road * 0.65);
		}
		// la neige ne tient que là où le biome la garde (pas dans le désert ni sous les tropiques)
		c = mix(c, uSnowCol, vSnow * 0.8);
		diffuseColor.rgb *= c;
		diffuseColor.a = a;
		if (a < 0.01) discard;
	}`);
    };
    this.path = new THREE.Mesh(new THREE.BufferGeometry(), pathMat);
    this.path.receiveShadow = true;
    this.path.renderOrder = 1;
    this.solid = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
    this.solid.receiveShadow = this.solid.castShadow = true;
    this.glow = new THREE.Mesh(new THREE.BufferGeometry(), mats.glow);
    this.marks = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    this.marks.receiveShadow = true;
    for (const m of [this.path, this.solid, this.glow, this.marks]) { m.frustumCulled = false; this.group.add(m); }
  }

  /** Point d'une case de route (son centre, décalé) et milieu du bord partagé avec la voisine, décalé aussi (le même des deux côtés) */
  private node(cx: number, cz: number, j: number): [number, number] {
    return [cx + 0.5 + (hash2(cx, cz, 11) - 0.5) * j, cz + 0.5 + (hash2(cx, cz, 12) - 0.5) * j];
  }
  private edgeMid(cx: number, cz: number, dx: number, dz: number, j: number): [number, number] {
    // bord entre la case et sa voisine : repéré par la case de plus petit indice
    const ax = dx < 0 ? cx - 1 : cx, az = dz < 0 ? cz - 1 : cz;
    const t = (hash2(ax * 2 + (dx ? 1 : 0), az * 2 + (dz ? 1 : 0), 13) - 0.5) * j;
    return dx ? [ax + 1, cz + 0.5 + t] : [cx + 0.5 + t, az + 1];
  }

  /**
   * Un pont d'un seul tenant (cases de route sur l'eau, `comp`) mis en file d'une rive à l'autre : la case de la rive de départ
   * (s'il y en a une), les cases du pont dans l'ordre, celle de la rive d'arrivée ; null pour un carrefour ou une boucle sur l'eau
   */
  private bridgeChain(comp: number[]): { cells: number[]; head: boolean; tail: boolean } | null {
    const w = this.world, set = new Set(comp);
    const at = (c: number, dx: number, dz: number) => { const x = (c % N) + dx, z = Math.floor(c / N) + dz; return w.inCells(x, z) ? w.ci(x, z) : -1; };
    const roads = (c: number) => D4.map(([dx, dz]) => at(c, dx, dz)).filter((n) => n >= 0 && w.road[n] === 1);
    if (comp.some((c) => roads(c).length > 2)) return null;
    const end = comp.find((c) => roads(c).filter((n) => set.has(n)).length <= 1);
    if (end === undefined) return null;
    const order = [end], seen = new Set(order);
    for (;;) {
      const next = roads(order[order.length - 1]).find((n) => set.has(n) && !seen.has(n));
      if (next === undefined) break;
      order.push(next); seen.add(next);
    }
    if (order.length !== comp.length) return null;
    const banks = (c: number) => roads(c).filter((n) => !set.has(n));
    const head = banks(order[0])[0], tail = order.length > 1 ? banks(order[order.length - 1])[0] : banks(order[0])[1];
    if (head === undefined && tail === undefined && order.length === 1) return null;
    return { cells: [...(head !== undefined ? [head] : []), ...order, ...(tail !== undefined ? [tail] : [])], head: head !== undefined, tail: tail !== undefined };
  }

  /**
   * Cases de route portées par un pont : celles qui passent sur l'eau, et les cases sèches prises entre deux d'entre elles le long
   * de la même route (deux au plus) : un ruisseau qui serpente sous la route la mouille par endroits, on n'y jette qu'un seul
   * ouvrage d'une rive à l'autre, dans l'axe de la route, au lieu de petits ponts chacun de travers
   */
  private bridged = new Set<number>();
  private findBridged() {
    const w = this.world, out = new Set<number>();
    const road = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1;
    for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) if (road(cx, cz) && w.bridgeY(cx, cz) !== null) out.add(w.ci(cx, cz));
    const nbrs = (k: number) => D4.map(([dx, dz]) => [(k % N) + dx, Math.floor(k / N) + dz]).filter(([x, z]) => road(x, z)).map(([x, z]) => w.ci(x, z));
    for (const k of [...out]) for (const first of nbrs(k)) {
      // on suit la route depuis le pont, case sèche après case sèche, tant qu'elle ne bifurque pas
      const gap: number[] = [];
      let prev = k, cur = first;
      for (let step = 0; step < 3; step++) {
        if (out.has(cur)) { for (const c of gap) out.add(c); break; }
        const n = nbrs(cur);
        if (n.length !== 2 || step === 2) break;
        gap.push(cur);
        const next = n[0] === prev ? n[1] : n[0];
        prev = cur; cur = next;
      }
    }
    this.bridged = out;
  }

  /**
   * Routes en courbe : pour chaque case de route qu'une courbe traverse (hors ponts), les morceaux de sa ligne qui y passent,
   * et un raccord, du point le plus proche de la courbe jusqu'au milieu du bord, vers chaque voisine de route qui n'est pas
   * sur la même courbe (une rue, une autre courbe, un pont) ; le raccord rejoint ce bord au même point que la rue d'à côté
   */
  private curved = new Map<number, Curved>();
  private findCurved(age: number) {
    const w = this.world, j = age >= 3 ? 0 : 0.08, out = new Map<number, Curved>();
    this.curved = out;
    if (!w.curves.length) return;
    const cells = w.curveCells(), live = (k: number) => w.road[k] === 1 && !this.bridged.has(k);
    for (const [k] of cells) if (live(k)) out.set(k, { pieces: [], branches: [] });
    for (const c of w.curves) {
      // la ligne, coupée case par case (chaque pas revient à la case où il commence)
      const s = sampleCurve(c.pts);
      let cur: number[] | null = null, ck = -1;
      for (let i = 0; i + 3 < s.length; i += 2) {
        const x = Math.floor(s[i]), z = Math.floor(s[i + 1]), k = w.inCells(x, z) ? w.ci(x, z) : -1, cell = out.get(k);
        if (!cell) { cur = null; ck = -1; continue; }
        if (k !== ck || !cur) { cur = [s[i], s[i + 1]]; ck = k; cell.pieces.push(cur); }
        cur.push(s[i + 2], s[i + 3]);
      }
    }
    for (const [k, cell] of out) {
      const cx = k % N, cz = Math.floor(k / N), mine = cells.get(k)!.ids;
      for (const [dx, dz] of D4) {
        const nx = cx + dx, nz = cz + dz;
        if (!w.inCells(nx, nz) || !w.road[w.ci(nx, nz)]) continue;
        const nk = w.ci(nx, nz);
        if (out.has(nk) && cells.get(nk)!.ids.some((id) => mine.includes(id))) continue;
        // au bord d'un pont, pas de détour : la rampe arrive dans l'axe
        const e = this.bridged.has(nk) ? this.edgeMid(cx, cz, dx, dz, j) : this.warp(...this.edgeMid(cx, cz, dx, dz, j), age);
        const p = closestOn(e[0], e[1], cell.pieces) ?? cells.get(k)!.at;
        cell.branches.push([p[0], p[1], (p[0] + e[0]) / 2, (p[1] + e[1]) / 2, e[0], e[1]]);
      }
    }
  }

  /**
   * Chaussée et trottoirs d'une route en courbe autour d'une case (en coordonnées du monde) : la ligne et les raccords des
   * cases voisines, raccordés en douceur ; trottoirs le long des morceaux qui passent en ville (`town`), sinon aucun
   */
  private curveSdf(cx: number, cz: number, hw: number, town: Uint8Array) {
    const w = this.world, pieces: number[][] = [], branches: number[][] = [], walks: number[][] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!w.inCells(cx + dx, cz + dz)) continue;
      const k = w.ci(cx + dx, cz + dz), c = this.curved.get(k);
      if (!c) continue;
      pieces.push(...c.pieces); branches.push(...c.branches);
      if (town[k]) walks.push(...c.pieces, ...c.branches);
    }
    const dist = (x: number, z: number, ls: number[][]) => { let d = 9; for (const l of ls) d = Math.min(d, lineDist(x, z, l)); return d; };
    return {
      road: (x: number, z: number) => smin(dist(x, z, pieces), dist(x, z, branches), FILLET) - hw,
      pave: (x: number, z: number) => (walks.length ? dist(x, z, walks) - hw - 0.17 : 9),
    };
  }

  /** Cours en terre battue devant les ateliers, places, fermes : (x, z, rayon) rangés par case */
  /** Cases de place (aux premiers âges) : là où les routes se serrent en quadrillage, une place pleine, sans bandes de chemin */
  private plaza = new Set<number>();

  private yards() {
    const w = this.world, out = new Map<number, number[]>();
    for (const b of w.buildings.values()) {
      const r = YARD[b.kind];
      if (!r) continue;
      const s = sizeOf(b), f = FRONT[b.rot], x = b.x + s / 2 + f[0] * (s / 2 + 0.3), z = b.z + s / 2 + f[1] * (s / 2 + 0.3);
      const cx = Math.floor(x), cz = Math.floor(z);
      if (!w.inCells(cx, cz) || w.occ[w.ci(cx, cz)] || w.cellAvg(cx, cz) < 0.1) continue;
      const k = w.ci(cx, cz), l = out.get(k) ?? [];
      l.push(x, z, r * (s > 1 ? 1.4 : 1));
      out.set(k, l);
    }
    const add = (k: number, x: number, z: number, r: number) => { const l = out.get(k) ?? []; l.push(x, z, r); out.set(k, l); };
    const plain = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1 && !this.bridged.has(w.ci(x, z));
    // (une route en courbe qui longe une rue ne fait pas une place)
    const grid = (x: number, z: number) => plain(x, z) && !this.curved.has(w.ci(x, z));
    // les places : un carré de 2 × 2 cases de route, une poche d'herbe prise entre des routes, et les routes coincées entre
    // deux cases de place ; tout cela se remplit d'un seul tenant au lieu d'un quadrillage de chemins et de trous d'herbe
    const P = this.plaza;
    P.clear();
    const free = (x: number, z: number) => { const k = w.ci(x, z); return !w.road[k] && !w.occ[k] && !w.veg[k] && !w.lake[k] && w.cellAvg(x, z) >= 0.1; };
    for (let cz = 0; cz < N - 1; cz++)
      for (let cx = 0; cx < N - 1; cx++)
        if (grid(cx, cz) && grid(cx + 1, cz) && grid(cx, cz + 1) && grid(cx + 1, cz + 1)) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) P.add(w.ci(cx + dx, cz + dz));
    for (let cz = 1; cz < N - 1; cz++)
      for (let cx = 1; cx < N - 1; cx++)
        if (free(cx, cz) && +grid(cx + 1, cz) + +grid(cx - 1, cz) + +grid(cx, cz + 1) + +grid(cx, cz - 1) >= 3) {
          // encadrée de routes de tous côtés (ou de trois, le quatrième étant une maison ou une autre place)
          const side = (x: number, z: number) => grid(x, z) || !!w.occ[w.ci(x, z)];
          if (side(cx + 1, cz) && side(cx - 1, cz) && side(cx, cz + 1) && side(cx, cz - 1)) P.add(w.ci(cx, cz));
        }
    for (let pass = 0; pass < 2; pass++)
      for (let cz = 1; cz < N - 1; cz++)
        for (let cx = 1; cx < N - 1; cx++) {
          const k = w.ci(cx, cz);
          if (P.has(k) || !grid(cx, cz)) continue;
          if (+P.has(k + 1) + +P.has(k - 1) + +P.has(k + N) + +P.has(k - N) >= 2) P.add(k);
        }
    // la terre battue va de la rue jusqu'au mur des bâtiments qui la bordent : plus de liseré d'herbe entre les deux
    for (const b of w.buildings.values()) {
      if (b.kind === 'lamp' || b.kind === 'pier') continue;
      const s = sizeOf(b);
      for (const [dx, dz] of D4)
        for (let i = 0; i < s; i++) {
          const cx = dx === 0 ? b.x + i : dx > 0 ? b.x + s : b.x - 1, cz = dz === 0 ? b.z + i : dz > 0 ? b.z + s : b.z - 1;
          if (!plain(cx, cz)) continue;
          const ex = dx === 0 ? b.x + i + 0.5 : dx > 0 ? b.x + s : b.x, ez = dz === 0 ? b.z + i + 0.5 : dz > 0 ? b.z + s : b.z;
          add(w.ci(cx, cz), ex, ez, 0.24);
        }
    }
    // une poche d'herbe enclavée sur trois côtés (entre routes et bâtiments) est foulée ; ailleurs l'herbe reste entre les maisons
    const urban = (x: number, z: number) => {
      if (!w.inCells(x, z)) return false;
      const k = w.ci(x, z);
      return grid(x, z) || (!!w.occ[k] && w.buildingAt(x, z)?.kind !== 'lamp');
    };
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz);
        if (w.road[k] || w.occ[k] || w.veg[k] || w.lake[k] || w.cellAvg(cx, cz) < 0.1) continue;
        if (!(plain(cx + 1, cz) || plain(cx - 1, cz) || plain(cx, cz + 1) || plain(cx, cz - 1))) continue;
        if (!P.has(k) && +urban(cx + 1, cz) + +urban(cx - 1, cz) + +urban(cx, cz + 1) + +urban(cx, cz - 1) >= 3) add(k, cx + 0.5, cz + 0.5, 0.42);
      }
    return out;
  }

  /**
   * Plan des rues de la ville : pour chaque case de route (hors ponts), ses branches, ses côtés de trottoir (là où la voisine
   * est en ville : un bâtiment à deux cases au plus) et sa chaussée ; puis les abords pavés hors des routes — places devant
   * les ateliers et les temples, poches enclavées, pied des façades le long des trottoirs
   */
  private streets(age: number) {
    const w = this.world, hw = HW[Math.min(age, 4)];
    const road = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1;
    const flat = (x: number, z: number) => road(x, z) && !this.bridged.has(w.ci(x, z));
    const grid = (x: number, z: number) => flat(x, z) && !this.curved.has(w.ci(x, z));
    // quatre cases de route en carré : une place pavée ; un carré ou un rectangle plein de cases de route : un rond-point
    // (pas avec une route en courbe)
    const plaza = new Set<number>();
    for (let cz = 0; cz < N - 1; cz++)
      for (let cx = 0; cx < N - 1; cx++)
        if (grid(cx, cz) && grid(cx + 1, cz) && grid(cx, cz + 1) && grid(cx + 1, cz + 1)) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) plaza.add(w.ci(cx + dx, cz + dz));
    const rounds = new Map<number, Round>(), seen = new Set<number>();
    for (const k0 of plaza) {
      if (seen.has(k0)) continue;
      const comp = [k0];
      seen.add(k0);
      for (let i = 0; i < comp.length; i++) for (const [dx, dz] of D4) {
        const x = (comp[i] % N) + dx, z = Math.floor(comp[i] / N) + dz, k = z * N + x;
        if (w.inCells(x, z) && plaza.has(k) && !seen.has(k)) { seen.add(k); comp.push(k); }
      }
      let x0 = N, z0 = N, x1 = -1, z1 = -1;
      for (const k of comp) { const x = k % N, z = Math.floor(k / N); x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      const W = x1 - x0 + 1, H = z1 - z0 + 1;
      if (comp.length !== W * H || Math.max(W, H) > 2 * Math.min(W, H)) continue;
      const S = Math.min(W, H), hl = (Math.max(W, H) - S) / 2, mx = x0 + W / 2, mz = z0 + H / 2;
      const rOut = S / 2 - 0.06, rIn = Math.max(0.24, rOut - 2 * hw);
      const R: Round = { a: W >= H ? [mx - hl, mz] : [mx, mz - hl], b: W >= H ? [mx + hl, mz] : [mx, mz + hl], rIn, rOut, entries: [], box: [x0, z0, x1, z1] };
      // une entrée par route qui arrive au bord du rond-point
      for (const k of comp) {
        const x = k % N, z = Math.floor(k / N);
        for (const [dx, dz] of D4) {
          const nx = x + dx, nz = z + dz;
          if ((nx >= x0 && nx <= x1 && nz >= z0 && nz <= z1) || !road(nx, nz)) continue;
          const ex = x + 0.5 + dx * 0.5, ez = z + 0.5 + dz * 0.5, [qx, qz] = nearest(ex, ez, R.a[0], R.a[1], R.b[0], R.b[1]);
          R.entries.push([ex, ez, qx, qz]);
        }
      }
      for (const k of comp) rounds.set(k, R);
    }
    const town = new Uint8Array(N * N);
    for (const b of w.buildings.values()) {
      if (b.kind === 'lamp' || b.kind === 'pier') continue;
      const s = sizeOf(b);
      for (let z = b.z - 2; z < b.z + s + 2; z++) for (let x = b.x - 2; x < b.x + s + 2; x++) if (w.inCells(x, z)) town[w.ci(x, z)] = 1;
    }
    const open = (x: number, z: number) => w.inCells(x, z) && !road(x, z) && !w.isWet(x, z) && town[w.ci(x, z)] === 1;
    const cells = new Map<number, Street>();
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        if (!flat(cx, cz)) continue;
        const k = w.ci(cx, cz);
        const R = rounds.get(k);
        if (R) {
          const sdf = roundSdf(R, hw), ox = cx + 0.5, oz = cz + 0.5;
          cells.set(k, {
            mask: 0, sides: 0, quads: 0, plaza: false, round: R, road: (x, z) => sdf(x + ox, z + oz),
            // tout est trottoir autour de l'anneau ; au milieu, l'îlot garde son herbe derrière sa bordure
            pave: (x, z) => { const [qx, qz] = nearest(x + ox, z + oz, R.a[0], R.a[1], R.b[0], R.b[1]); return R.rIn - 0.07 - Math.hypot(x + ox - qx, z + oz - qz); },
          });
          const [qx, qz] = nearest(ox, oz, R.a[0], R.a[1], R.b[0], R.b[1]);
          if (Math.hypot(ox - qx, oz - qz) < R.rIn) this.islands.add(k);
          continue;
        }
        if (plaza.has(k)) { cells.set(k, { mask: 0, sides: 0, quads: 0, plaza: true, round: null, road: () => 1, pave: () => -1 }); continue; }
        let mask = 0, sides = 0, quads = 0;
        D4.forEach(([dx, dz], i) => { if (road(cx + dx, cz + dz)) mask |= 1 << i; else if (open(cx + dx, cz + dz)) sides |= 1 << i; });
        // route en courbe : la chaussée suit sa ligne ; une rue qui la touche y prend aussi sa part, sans couture au bord
        const ox = cx + 0.5, oz = cz + 0.5;
        if (this.curved.has(k)) {
          const cs = this.curveSdf(cx, cz, hw, town);
          cells.set(k, { mask, sides: 0, quads: 0, plaza: false, round: null, curve: true, road: (x, z) => cs.road(x + ox, z + oz), pave: (x, z) => cs.pave(x + ox, z + oz) });
          continue;
        }
        QUADS.forEach(([sx, sz], i) => { if (mask & (1 << (sx > 0 ? 0 : 1)) && mask & (1 << (sz > 0 ? 2 : 3)) && open(cx + sx, cz + sz)) quads |= 1 << i; });
        const sr = streetSdf(mask, hw), sp = walkSdf(sides, quads);
        const near = this.curved.size > 0 && [-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => w.inCells(cx + dx, cz + dz) && this.curved.has(w.ci(cx + dx, cz + dz))));
        const cs = near ? this.curveSdf(cx, cz, hw, town) : null;
        cells.set(k, {
          mask, sides, quads, plaza: false, round: null,
          road: cs ? (x, z) => Math.min(sr(x, z), cs.road(x + ox, z + oz)) : sr,
          pave: cs ? (x, z) => Math.min(sp(x, z), cs.pave(x + ox, z + oz)) : sp,
        });
      }
    const pave = new Map<number, { rects: number[][]; kind: number }>();
    const addRect = (k: number, r: number[], kind: number) => { const p = pave.get(k) ?? { rects: [], kind }; p.rects.push(r); p.kind = Math.max(p.kind, kind); pave.set(k, p); };
    // places devant les ateliers, les temples, les fermes
    for (const b of w.buildings.values()) {
      if (!YARD[b.kind]) continue;
      const s = sizeOf(b), f = FRONT[b.rot];
      for (let i = 0; i < s; i++) {
        const cx = f[0] ? (f[0] > 0 ? b.x + s : b.x - 1) : b.x + i, cz = f[1] ? (f[1] > 0 ? b.z + s : b.z - 1) : b.z + i;
        if (!w.inCells(cx, cz) || w.occ[w.ci(cx, cz)] || road(cx, cz) || w.isWet(cx, cz)) continue;
        addRect(w.ci(cx, cz), FULL, 1);
      }
    }
    // poches d'herbe enclavées entre les rues et les bâtiments : pavées (toute la case, ou le coin rentrant) ; pas les marches
    // de l'escalier de cases sous une route en courbe, que sa chaussée recouvre
    const urban = (x: number, z: number) => {
      if (!w.inCells(x, z)) return false;
      const k = w.ci(x, z);
      return grid(x, z) || (!!w.occ[k] && w.buildingAt(x, z)?.kind !== 'lamp');
    };
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz);
        if (w.road[k] || w.occ[k] || w.veg[k] || w.isWet(cx, cz)) continue;
        if (!(grid(cx + 1, cz) || grid(cx - 1, cz) || grid(cx, cz + 1) || grid(cx, cz - 1))) continue;
        const e = urban(cx + 1, cz), o = urban(cx - 1, cz), s = urban(cx, cz + 1), n = urban(cx, cz - 1), c = +e + +o + +s + +n;
        if (c >= 3 || (e && o) || (n && s)) { addRect(k, FULL, 0); continue; }
        if (c === 2) {
          const dx = e ? 1 : -1, dz = s ? 1 : -1;
          if (urban(cx + dx, cz + dz)) addRect(k, [dx > 0 ? 0 : -1.5, dz > 0 ? 0 : -1.5, dx > 0 ? 1.5 : 0, dz > 0 ? 1.5 : 0], 0);
        }
      }
    // pied des façades : le trottoir va jusqu'au mur
    const M = 0.26;
    for (const b of w.buildings.values()) {
      if (b.kind === 'lamp' || b.kind === 'pier') continue;
      const s = sizeOf(b);
      for (let z = b.z; z < b.z + s; z++)
        for (let x = b.x; x < b.x + s; x++)
          D4.forEach(([dx, dz], i) => {
            const nx = x + dx, nz = z + dz;
            if ((nx >= b.x && nx < b.x + s && nz >= b.z && nz < b.z + s) || !w.inCells(nx, nz)) return;
            const nk = w.ci(nx, nz), st = cells.get(nk);
            if (!(st ? st.plaza || !!st.round || (st.sides & (1 << (i ^ 1))) !== 0 : pave.get(nk)?.rects.includes(FULL))) return;
            addRect(w.ci(x, z), dx > 0 ? [0.5 - M, -1.5, 1.5, 1.5] : dx < 0 ? [-1.5, -1.5, -0.5 + M, 1.5] : dz > 0 ? [-1.5, 0.5 - M, 1.5, 1.5] : [-1.5, -1.5, 1.5, -0.5 + M], 0);
          });
    }
    // une route en courbe déborde de ses cases : sa chaussée et ses trottoirs passent aussi sur les cases voisines qui ne sont
    // pas des routes (avec leurs abords pavés, s'il y en a)
    const spill = new Map<number, { road: (x: number, z: number) => number; pave: (x: number, z: number) => number; kind: number }>();
    for (const k of this.curved.keys()) {
      const cx = k % N, cz = Math.floor(k / N);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, nz = cz + dz;
        if (!w.inCells(nx, nz)) continue;
        const nk = w.ci(nx, nz);
        if (spill.has(nk) || road(nx, nz) || w.occ[nk] || w.isWet(nx, nz)) continue;
        const cs = this.curveSdf(nx, nz, hw, town), p = pave.get(nk), rs = p ? rectSdf(p.rects) : null, ox = nx + 0.5, oz = nz + 0.5;
        spill.set(nk, { road: (x, z) => cs.road(x + ox, z + oz), pave: (x, z) => Math.min(rs ? rs(x, z) : 9, cs.pave(x + ox, z + oz)), kind: p?.kind ?? 0 });
        pave.delete(nk);
      }
    }
    return { cells, pave, spill };
  }

  /**
   * Cases de route qui reçoivent une lumière : d'abord les carrefours, puis les abords des portes et les virages, puis le reste,
   * une case sur deux environ le long des rues — des rues bien éclairées, sans en mettre sur chaque case
   */
  private lightCells(lines: Map<number, number[][]>) {
    const w = this.world, GAP = 1.75, out: number[] = [];
    const score = (k: number) => {
      const cx = k % N, cz = Math.floor(k / N);
      const dirs = D4.filter(([dx, dz]) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1);
      const door = D4.some(([dx, dz]) => { const b = w.buildingAt(cx + dx, cz + dz); return !!b && b.kind !== 'lamp'; });
      const bend = dirs.length === 2 && dirs[0][0] !== -dirs[1][0];
      return (dirs.length >= 3 ? 3 : 0) + (door ? 2 : 0) + (bend ? 1 : 0) + hash2(cx, cz, 61) * 0.5;
    };
    const cand = [...lines.keys()].map((k) => [k, score(k)]).sort((a, b) => b[1] - a[1]);
    for (const [k] of cand) {
      const x = k % N, z = Math.floor(k / N);
      if (out.some((o) => Math.hypot((o % N) - x, Math.floor(o / N) - z) < GAP)) continue;
      out.push(k);
    }
    return out;
  }

  /**
   * Détour d'un chemin de terre en ce point : un même point bouge toujours de la même façon, d'une case à l'autre, si bien
   * que tout le réseau serpente sans se rompre ; il s'éteint près des ponts, que les chemins rejoignent dans leur axe
   */
  private warp(x: number, z: number, age: number): [number, number] {
    const w = this.world, amp = WIGGLE[Math.min(age, 4)];
    if (!amp) return [x, z];
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inCells(cx + dx, cz + dz) && this.bridged.has(w.ci(cx + dx, cz + dz))) return [x, z];
    const f = 0.38;
    return [x + this.noise.noise2(x * f + 31.7, z * f - 4.3) * amp, z + this.noise.noise2(x * f - 12.9, z * f + 57.3) * amp];
  }

  /** Tracé de chaque case : morceaux de ligne (x, z à la suite) qui forment le chemin (tout droit en ville, serpentant ailleurs) */
  private skeleton(age: number) {
    const w = this.world, j = age >= 3 ? 0 : 0.08, lines = new Map<number, number[][]>();
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz);
        if (!w.road[k] || this.bridged.has(k)) continue;
        const has = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
        const cv = this.curved.get(k);
        if (cv) {
          // route en courbe : sa ligne et ses raccords, sans détour ; à la campagne, un chemin vers la porte d'une maison voisine
          const out = [...cv.pieces, ...cv.branches], at = w.curveAt(k)!.at;
          if (age < 3)
            for (const [dx, dz] of D4) {
              const b = has(dx, dz) ? undefined : w.buildingAt(cx + dx, cz + dz), ex = cx + 0.5 + dx * 0.55, ez = cz + 0.5 + dz * 0.55;
              if (b && b.kind !== 'lamp') out.push([at[0], at[1], (at[0] + ex) / 2, (at[1] + ez) / 2, ex, ez]);
            }
          lines.set(k, out);
          continue;
        }
        const dirs = D4.filter(([dx, dz]) => has(dx, dz));
        const n = this.node(cx, cz, j), out: number[][] = [];
        if (dirs.length === 2 && dirs[0][0] !== -dirs[1][0]) {
          // virage : une courbe d'un bord à l'autre, tirée par le point de la case
          const a = this.edgeMid(cx, cz, dirs[0][0], dirs[0][1], j), b = this.edgeMid(cx, cz, dirs[1][0], dirs[1][1], j), l: number[] = [];
          for (let s = 0; s <= 8; s++) { const t = s / 8, u = 1 - t; l.push(u * u * a[0] + 2 * u * t * n[0] + t * t * b[0], u * u * a[1] + 2 * u * t * n[1] + t * t * b[1]); }
          out.push(l);
        } else if (dirs.length === 2) {
          // tout droit : une ligne qui passe par le point de la case
          const a = this.edgeMid(cx, cz, dirs[0][0], dirs[0][1], j), b = this.edgeMid(cx, cz, dirs[1][0], dirs[1][1], j), l: number[] = [];
          for (let s = 0; s <= 6; s++) {
            const t = s / 6, u = 1 - t, m = 4 * t * u;
            l.push(u * a[0] + t * b[0] + m * (n[0] - (a[0] + b[0]) / 2), u * a[1] + t * b[1] + m * (n[1] - (a[1] + b[1]) / 2));
          }
          out.push(l);
        } else {
          // cul-de-sac, carrefour, case isolée : des branches depuis le point de la case (en plusieurs points, pour serpenter)
          const seg = (a: number[], b: number[]) => { const l: number[] = []; for (let s2 = 0; s2 <= 4; s2++) l.push(a[0] + ((b[0] - a[0]) * s2) / 4, a[1] + ((b[1] - a[1]) * s2) / 4); return l; };
          for (const [dx, dz] of dirs) out.push(seg(n, this.edgeMid(cx, cz, dx, dz, j)));
          if (!dirs.length) out.push([n[0], n[1], n[0] + 0.001, n[1]]);
          // sur la terre, on coupe les angles d'un carrefour : une courbe entre deux branches voisines arrondit le coin
          if (dirs.length >= 3 && age < 3) for (const [p, q] of [[[1, 0], [0, 1]], [[0, 1], [-1, 0]], [[-1, 0], [0, -1]], [[0, -1], [1, 0]]]) {
            if (!has(p[0], p[1]) || !has(q[0], q[1])) continue;
            const a = this.edgeMid(cx, cz, p[0], p[1], j), b = this.edgeMid(cx, cz, q[0], q[1], j), l: number[] = [];
            for (let s2 = 0; s2 <= 8; s2++) { const t = s2 / 8, u = 1 - t; l.push(u * u * a[0] + 2 * u * t * n[0] + t * t * b[0], u * u * a[1] + 2 * u * t * n[1] + t * t * b[1]); }
            out.push(l);
          }
        }
        // et vers la porte d'une maison voisine qui n'a pas d'autre route (chemin d'accès, à la campagne)
        if (age < 3)
          for (const [dx, dz] of D4) {
            if (has(dx, dz)) continue;
            const b = w.buildingAt(cx + dx, cz + dz);
            if (b && b.kind !== 'lamp') out.push([n[0], n[1], (n[0] + cx + 0.5 + dx * 0.55) / 2, (n[1] + cz + 0.5 + dz * 0.55) / 2, cx + 0.5 + dx * 0.55, cz + 0.5 + dz * 0.55]);
          }
        // le chemin de terre serpente : chaque point suit le détour du terrain
        if (WIGGLE[Math.min(age, 4)]) for (const l of out) for (let i = 0; i + 1 < l.length; i += 2) [l[i], l[i + 1]] = this.warp(l[i], l[i + 1], age);
        lines.set(k, out);
      }
    return lines;
  }

  rebuild(age: number, snow: number) {
    const w = this.world, a = Math.min(age, 4), town = a >= 3, j = town ? 0 : 0.08;
    const u = this.u;
    u.uStyle.value = a;
    u.uYardA.value = YARD_A[a];
    u.uFray.value = FRAY[a];
    u.uRoad.value.set(ROAD_COL[a]);
    u.uSide.value.set(SIDE_COL[a]);
    u.uPlaza.value.set(PLAZA_COL[a]);
    u.uRim.value.set(RIM_COL[a]);
    u.uCurb.value.set(CURB_COL[a]);
    // neige de saison, retenue selon le biome (moyenne des cases voisines, pour une transition douce)
    const snowAt = (x: number, z: number) => {
      if (snow <= 0) return 0;
      const cx = Math.floor(x), cz = Math.floor(z);
      let k = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inCells(cx + dx, cz + dz)) { k += SNOWY[w.biome[w.ci(cx + dx, cz + dz)]] ?? 1; n++; }
      return snow * (n ? k / n : 1);
    };
    this.findBridged();
    this.findCurved(age);
    const lines = this.skeleton(age), hw0 = HW[a];
    // largeur qui varie un peu le long des chemins de terre (pas en ville)
    const half = (x: number, z: number) => hw0 * (1 + WIDTH_VAR[a] * this.noise.noise2(x * 0.6, z * 0.6));

    // surface : une grille fine par case ; chaque sommet porte ses distances signées au bord de la chaussée et des abords
    const pos: number[] = [], col: number[] = [], ra: number[] = [], pa: number[] = [], ka: number[] = [], sa: number[] = [], idx: number[] = [];
    const emit = (cx: number, cz: number, sub: number, road: (x: number, z: number) => number, pave: (x: number, z: number) => number, kind: number, rCut: number, pCut: number) => {
      const n = sub + 1, R = new Float32Array(n * n), P = new Float32Array(n * n), quads: number[] = [];
      for (let jz = 0; jz < n; jz++) for (let ix = 0; ix < n; ix++) { R[jz * n + ix] = road(cx + ix / sub, cz + jz / sub); P[jz * n + ix] = pave(cx + ix / sub, cz + jz / sub); }
      for (let jz = 0; jz < sub; jz++)
        for (let ix = 0; ix < sub; ix++) {
          const q = jz * n + ix;
          if ([q, q + 1, q + n, q + n + 1].some((v) => R[v] < rCut || P[v] < pCut)) quads.push(q);
        }
      if (!quads.length) return;
      const v0 = ra.length;
      for (let jz = 0; jz < n; jz++)
        for (let ix = 0; ix < n; ix++) {
          const x = cx + ix / sub, z = cz + jz / sub, t = 0.96 + 0.06 * this.noise.noise2(x * 5.3, z * 5.3);
          pos.push(x, w.hAt(x, z) + 0.02, z);
          col.push(t, t, t);
          ra.push(R[jz * n + ix]); pa.push(P[jz * n + ix]); ka.push(kind); sa.push(snowAt(x, z));
        }
      for (const q of quads) { const v = v0 + q; idx.push(v, v + n + 1, v + 1, v, v + n, v + n + 1); }
    };
    this.islands.clear();
    const plan = town ? this.streets(age) : null;
    const yards = town ? new Map<number, number[]>() : this.yards();
    if (plan) {
      for (const [k, st] of plan.cells) {
        const cx = k % N, cz = Math.floor(k / N);
        if (st.plaza) emit(cx, cz, 4, () => 1, () => -1, 1, 0, 0);
        else emit(cx, cz, 8, (x, z) => st.road(x - cx - 0.5, z - cz - 0.5), (x, z) => st.pave(x - cx - 0.5, z - cz - 0.5), 0, 0.06, 0.02);
      }
      for (const [k, p] of plan.pave) {
        const cx = k % N, cz = Math.floor(k / N), sdf = rectSdf(p.rects);
        emit(cx, cz, 4, () => 1, (x, z) => sdf(x - cx - 0.5, z - cz - 0.5), p.kind, 0, 0.02);
      }
      for (const [k, sp] of plan.spill) {
        const cx = k % N, cz = Math.floor(k / N);
        emit(cx, cz, 8, (x, z) => sp.road(x - cx - 0.5, z - cz - 0.5), (x, z) => sp.pave(x - cx - 0.5, z - cz - 0.5), sp.kind, 0.06, 0.02);
      }
    } else {
      const cells = new Set<number>();
      for (const k of [...lines.keys(), ...yards.keys(), ...this.plaza]) {
        const cx = k % N, cz = Math.floor(k / N);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inCells(cx + dx, cz + dz) && w.bridgeY(cx + dx, cz + dz) === null) cells.add(w.ci(cx + dx, cz + dz));
      }
      for (const k of cells) {
        const cx = k % N, cz = Math.floor(k / N), seg: number[] = [], circ: number[] = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!w.inCells(cx + dx, cz + dz)) continue;
          const nk = w.ci(cx + dx, cz + dz), ls = lines.get(nk), ys = yards.get(nk);
          if (ls) for (const l of ls) for (let i = 0; i + 3 < l.length; i += 2) seg.push(l[i], l[i + 1], l[i + 2], l[i + 3]);
          if (ys) circ.push(...ys);
        }
        const P = this.plaza, nearP = [-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => w.inCells(cx + dx, cz + dz) && P.has(w.ci(cx + dx, cz + dz))));
        if (!seg.length && !circ.length && !nearP) continue;
        // distance signée au bord de la place (négative dedans), d'après les cases voisines : sans couture entre deux cases
        const plazaAt = (x: number, z: number) => {
          if (!nearP) return 9;
          const ix = Math.min(N - 1, Math.floor(x)), iz = Math.min(N - 1, Math.floor(z)), inside = P.has(w.ci(ix, iz));
          let best = 1;
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = ix + dx, nz = iz + dz;
              const other = !w.inCells(nx, nz) ? inside : P.has(w.ci(nx, nz)) !== inside;
              if (!other || (dx === 0 && dz === 0)) continue;
              const ex = Math.max(nx - x, x - nx - 1, 0), ez = Math.max(nz - z, z - nz - 1, 0);
              best = Math.min(best, Math.hypot(ex, ez));
            }
          return inside ? -best : best;
        };
        const road = (x: number, z: number) => {
          let best = 9;
          for (let i = 0; i < seg.length; i += 4) {
            const ax = seg[i], az = seg[i + 1], bx = seg[i + 2] - ax, bz = seg[i + 3] - az, len = bx * bx + bz * bz;
            const t = len ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len)) : 0;
            best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - bz * t));
          }
          // au cœur d'une place, le chemin s'efface : il n'y reste qu'un sol plein
          return best - half(x, z) + Math.max(0, -plazaAt(x, z) - 0.12) * 2;
        };
        const pave = (x: number, z: number) => {
          const ok = w.occ[w.ci(Math.min(N - 1, Math.floor(x)), Math.min(N - 1, Math.floor(z)))];
          if (ok && w.buildings.get(ok)?.kind !== 'lamp') return 9;
          let best = 9;
          for (let i = 0; i < circ.length; i += 3) best = Math.min(best, Math.hypot(x - circ[i], z - circ[i + 1]) - circ[i + 2]);
          return Math.min(best, plazaAt(x, z));
        };
        emit(cx, cz, 6, road, pave, 0, 0.08, 0.32);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aRoad', new THREE.Float32BufferAttribute(ra, 1));
    g.setAttribute('aPave', new THREE.Float32BufferAttribute(pa, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(ka, 1));
    g.setAttribute('aSnow', new THREE.Float32BufferAttribute(sa, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.path.geometry.dispose();
    this.path.geometry = g;

    // ponts et cailloux
    const sp: number[] = [], sc: number[] = [];
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cl: THREE.Color) => {
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]])
        for (const i of [f[0], f[1], f[2], f[0], f[2], f[3]]) { sp.push(...v[i]); sc.push(cl.r, cl.g, cl.b); }
    };
    const deck = DECK_COL[a].clone().lerp(SNOW, snow * 0.6), pile = PILE_COL[a];
    /** Pont : tablier au-dessus de l'eau, rampes vers les rives, piles et garde-corps */
    const bridge = (cx: number, cz: number, y: number, has: (dx: number, dz: number) => boolean) => {
      const ew = has(-1, 0) || has(1, 0), ns = has(0, -1) || has(0, 1);
      const x0 = cx + (has(-1, 0) ? 0 : 0.18), x1 = cx + 1 - (has(1, 0) ? 0 : 0.18);
      const z0 = cz + (has(0, -1) ? 0 : 0.18), z1 = cz + 1 - (has(0, 1) ? 0 : 0.18);
      box(x0, y - 0.05, z0, x1, y, z1, deck);
      // rampes vers une route de la rive (plus basse ou plus haute que le tablier)
      const ramp = (dx: number, dz: number) => {
        if (!has(dx, dz) || this.bridged.has(w.ci(cx + dx, cz + dz))) return;
        const ex = dx > 0 ? cx + 1 : dx < 0 ? cx : 0, ez = dz > 0 ? cz + 1 : dz < 0 ? cz : 0;
        const fx = ex + dx * 0.45, fz = ez + dz * 0.45;
        // pente du tablier jusqu'à la route de la rive, à 0,45 case du bord
        const quad = dx
          ? [[ex, y, z0], [fx, w.hAt(fx, cz + 0.5) + 0.04, z0], [fx, w.hAt(fx, cz + 0.5) + 0.04, z1], [ex, y, z1]]
          : [[x0, y, ez], [x0, w.hAt(cx + 0.5, fz) + 0.04, fz], [x1, w.hAt(cx + 0.5, fz) + 0.04, fz], [x1, y, ez]];
        for (const i of [0, 1, 2, 0, 2, 3]) { sp.push(...quad[i]); sc.push(deck.r, deck.g, deck.b); }
      };
      ramp(-1, 0); ramp(1, 0); ramp(0, -1); ramp(0, 1);
      // piles plantées dans l'eau
      const foot = Math.min(y - 0.6, w.hAt(cx + 0.5, cz + 0.5));
      for (const [px, pz] of ew && !ns ? [[cx + 0.5, z0 + 0.06], [cx + 0.5, z1 - 0.06]] : [[x0 + 0.06, cz + 0.5], [x1 - 0.06, cz + 0.5]]) box(px - 0.05, foot, pz - 0.05, px + 0.05, y - 0.05, pz + 0.05, pile);
      // garde-corps le long des bords libres
      const rail = age >= 4 ? deck : pile;
      if (ew && !ns) for (const z of [z0 + 0.015, z1 - 0.015]) { box(x0, y + 0.1, z - 0.012, x1, y + 0.13, z + 0.012, rail); for (let x = x0 + 0.05; x < x1; x += 0.3) box(x - 0.012, y, z - 0.012, x + 0.012, y + 0.1, z + 0.012, rail); }
      if (ns && !ew) for (const x of [x0 + 0.015, x1 - 0.015]) { box(x - 0.012, y + 0.1, z0, x + 0.012, y + 0.13, z1, rail); for (let z = z0 + 0.05; z < z1; z += 0.3) box(x - 0.012, y, z - 0.012, x + 0.012, y + 0.1, z + 0.012, rail); }
    };
    /** Pavé orienté : centre (x, z), axe (ux, uz) sur ±hu, en travers sur ±hv, de y0 à y1 */
    const obox = (x: number, z: number, ux: number, uz: number, hu: number, hv: number, y0: number, y1: number, cl: THREE.Color) => {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [x + ux * hu * p - uz * hv * q, z + uz * hu * p + ux * hv * q]);
      const v = [...c.map(([px, pz]) => [px, y0, pz]), ...c.map(([px, pz]) => [px, y1, pz])];
      for (const f of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]])
        for (const i of [f[0], f[1], f[2], f[0], f[2], f[3]]) { sp.push(...v[i]); sc.push(cl.r, cl.g, cl.b); }
    };
    const quad = (q: number[][], cl: THREE.Color) => { for (const i of [0, 1, 2, 0, 2, 3]) { sp.push(...q[i]); sc.push(cl.r, cl.g, cl.b); } };
    const plank = new THREE.Color();
    /**
     * Pont simple : un axe qui part du pied de la rampe, sur le chemin de la rive, coupe les virages comme les habitants
     * (diagonale d'un tracé en escalier), rejoint l'autre rive ; adouci, puis tablier en ruban, garde-corps et piles
     */
    const smoothBridge = (ch: { cells: number[]; head: boolean; tail: boolean }) => {
      const cells = ch.cells, hw = age >= 4 ? 0.34 : 0.32, th = 0.055;
      const xz = (c: number) => [c % N, Math.floor(c / N)];
      const i0 = ch.head ? 1 : 0, i1 = cells.length - (ch.tail ? 2 : 1);
      // le tablier à la hauteur de l'eau la plus haute qu'il franchit (les cases sèches entre deux bras n'en ont pas)
      const deckY = Math.max(...cells.slice(i0, i1 + 1).map((c) => w.bridgeY(c % N, Math.floor(c / N)) ?? -Infinity));
      const pts: number[][] = [];
      for (let i = i0; i <= i1; i++) { const [px, pz] = w.passPoint(cells, i); pts.push([px, deckY, pz]); }
      // aux deux bouts : rampe jusqu'au chemin de la rive, ou tablier qui s'arrête au-dessus de l'eau
      const cap = (bank: number | undefined, first: number, toward: number[], atStart: boolean) => {
        const [fx, fz] = xz(first);
        if (bank !== undefined) {
          const [bx, bz] = xz(bank), dx = fx - bx, dz = fz - bz, e = this.edgeMid(bx, bz, dx, dz, j);
          // la rampe descend tout droit du tablier sur le chemin de la rive (sans coude au bord, où le ruban se replierait)
          const px = e[0] - dx * 0.45, pz = e[1] - dz * 0.45, foot = [px, w.hAt(px, pz) + 0.04, pz];
          if (atStart) pts.unshift(foot); else pts.push(foot);
        } else {
          const ox = fx + 0.5 - toward[0], oz = fz + 0.5 - toward[2], l = Math.hypot(ox, oz) || 1;
          const p = [fx + 0.5 + (ox / l) * 0.32, deckY, fz + 0.5 + (oz / l) * 0.32];
          if (atStart) pts.unshift(p); else pts.push(p);
        }
      };
      const [ex, ez] = xz(cells[cells.length - 1]);
      cap(ch.head ? cells[0] : undefined, cells[i0], pts.length > 1 ? pts[1] : [ex + 0.5, 0, ez + 0.5], true);
      cap(ch.tail ? cells[cells.length - 1] : undefined, cells[i1], pts[pts.length - 2], false);
      // adoucir l'axe (deux passes de Chaikin, bouts fixes)
      let line = pts;
      for (let it = 0; it < 2; it++) {
        const out = [line[0]];
        for (let i = 0; i + 1 < line.length; i++) {
          const p = line[i], q = line[i + 1];
          out.push(p.map((v, k) => v * 0.75 + q[k] * 0.25), p.map((v, k) => v * 0.25 + q[k] * 0.75));
        }
        out.push(line[line.length - 1]);
        line = out;
      }
      // côtés du ruban ; au-dessus de l'eau (pas sur les rampes) : garde-corps et piles
      const n = line.length, L: number[][] = [], R: number[][] = [], wet: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const p = line[Math.max(0, i - 1)], q = line[Math.min(n - 1, i + 1)], tx = q[0] - p[0], tz = q[2] - p[2], tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl, c = line[i];
        L.push([c[0] + nx * hw, c[1], c[2] + nz * hw]); R.push([c[0] - nx * hw, c[1], c[2] - nz * hw]);
        wet.push(w.isWet(Math.floor(c[0]), Math.floor(c[2])) && c[1] > deckY - 0.05);
      }
      const rail = age >= 4 ? deck : pile;
      let run = 0, nextPost = 0.05, nextPile = 0.35;
      for (let i = 0; i + 1 < n; i++) {
        // tablier : planches de bois à la teinte qui varie, dalles de pierre, chaussée d'acier
        plank.copy(deck).multiplyScalar(a <= 2 ? 0.88 + 0.16 * hash2(i, cells[0], 81) : 0.96 + 0.06 * hash2(i, cells[0], 81));
        const l0 = L[i], l1 = L[i + 1], r0 = R[i], r1 = R[i + 1], down = (v: number[]) => [v[0], v[1] - th, v[2]];
        quad([l0, l1, r1, r0], plank);
        quad([down(l0), down(r0), down(r1), down(l1)], pile);
        quad([l0, down(l0), down(l1), l1], deck);
        quad([r0, r1, down(r1), down(r0)], deck);
        const p = line[i], q = line[i + 1], seg = Math.hypot(q[0] - p[0], q[2] - p[2]);
        if (!seg) continue;
        const ux = (q[0] - p[0]) / seg, uz = (q[2] - p[2]) / seg;
        if (wet[i] && wet[i + 1]) {
          // main courante continue et poteaux réguliers, des deux côtés, un peu en retrait du bord
          for (const s of [L, R]) {
            const s0 = s[i], s1 = s[i + 1], ml = Math.hypot(s1[0] - s0[0], s1[2] - s0[2]);
            const ix = ((p[0] - s0[0]) / hw) * 0.015, iz = ((p[2] - s0[2]) / hw) * 0.015;
            obox((s0[0] + s1[0]) / 2 + ix, (s0[2] + s1[2]) / 2 + iz, ux, uz, ml / 2 + 0.006, 0.012, p[1] + 0.1, p[1] + 0.13, rail);
          }
          for (; nextPost < run + seg; nextPost += 0.3) {
            const t = (nextPost - run) / seg, cx = p[0] + (q[0] - p[0]) * t, cz = p[2] + (q[2] - p[2]) * t;
            for (const s of [L, R]) {
              const x = s[i][0] + (s[i + 1][0] - s[i][0]) * t, z = s[i][2] + (s[i + 1][2] - s[i][2]) * t;
              obox(x + ((cx - x) / hw) * 0.015, z + ((cz - z) / hw) * 0.015, ux, uz, 0.012, 0.012, p[1], p[1] + 0.1, rail);
            }
          }
          // piles plantées dans l'eau : poteaux de bois par paires, piles de pierre en travers, fûts d'acier
          for (; nextPile < run + seg; nextPile += 0.8) {
            const t = (nextPile - run) / seg, x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t, y = p[1], foot = Math.min(y - 0.6, w.hAt(x, z));
            if (a === 2 || a === 3) obox(x, z, -uz, ux, hw * 0.82, 0.07, foot, y - th, pile);
            else for (const o of [-1, 1]) obox(x - uz * o * (hw - 0.07), z + ux * o * (hw - 0.07), ux, uz, a >= 4 ? 0.035 : 0.05, a >= 4 ? 0.035 : 0.05, foot, y - th, pile);
          }
        } else {
          nextPost = run + seg + 0.05;
          nextPile = Math.max(nextPile, run + seg + 0.2);
        }
        run += seg;
      }
    };
    // ponts : un pont simple suit sa courbe ; un carrefour ou une boucle sur l'eau reste un ouvrage case par case
    const isBridge = (cx: number, cz: number) => w.inCells(cx, cz) && this.bridged.has(w.ci(cx, cz));
    const done = new Set<number>();
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz);
        if (done.has(k) || !isBridge(cx, cz)) continue;
        const comp = [k];
        done.add(k);
        for (let i = 0; i < comp.length; i++) {
          const x = comp[i] % N, z = Math.floor(comp[i] / N);
          for (const [dx, dz] of D4) { if (!isBridge(x + dx, z + dz)) continue; const nk = w.ci(x + dx, z + dz); if (!done.has(nk)) { done.add(nk); comp.push(nk); } }
        }
        const ch = this.bridgeChain(comp);
        if (ch) { smoothBridge(ch); continue; }
        const compY = Math.max(...comp.map((c) => w.bridgeY(c % N, Math.floor(c / N)) ?? -Infinity));
        for (const c of comp) {
          const x = c % N, z = Math.floor(c / N);
          bridge(x, z, compY, (dx, dz) => w.inCells(x + dx, z + dz) && w.road[w.ci(x + dx, z + dz)] === 1);
        }
      }
    // cailloux au bord des chemins de terre (et quelques-uns dessus), pas en ville ni sous la neige
    if (!town && snow < 0.5) {
      const pebble = unindexed(new THREE.IcosahedronGeometry(1, 0)), pp = pebble.attributes.position;
      for (const [k, ls] of lines) for (const l of ls) for (let i = 0; i + 3 < l.length; i += 2) {
        const r = hash2(k, i, 41);
        if (r > 0.45) continue;
        const ax = l[i], az = l[i + 1], dx = l[i + 2] - ax, dz = l[i + 3] - az, len = Math.hypot(dx, dz) || 1;
        const side = r < 0.18 ? 0.25 : r < 0.36 ? -1 : 1, t = hash2(k, i, 42);
        const x = ax + dx * t + (-dz / len) * side * half(ax, az) * 1.02, z = az + dz * t + (dx / len) * side * half(ax, az) * 1.02;
        const s = 0.018 + hash2(k, i, 43) * 0.022, y = w.hAt(x, z), cl = PEBBLE[Math.floor(hash2(k, i, 44) * 3)];
        for (let v = 0; v < pp.count; v++) { sp.push(x + pp.getX(v) * s * 1.2, y + pp.getY(v) * s * 0.55, z + pp.getZ(v) * s); sc.push(cl.r, cl.g, cl.b); }
      }
    }
    // petits objets : une géométrie de base étirée, tournée, posée
    const gp: number[] = [], gc: number[] = [];
    const put = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, cl: THREE.Color | number, glow = false) => {
      const p = geo.attributes.position, co = Math.cos(ry), si = Math.sin(ry), col = typeof cl === 'number' ? new THREE.Color(cl) : cl;
      const P = glow ? gp : sp, Cc = glow ? gc : sc;
      for (let v = 0; v < p.count; v++) {
        const lx = p.getX(v) * sx, ly = p.getY(v) * sy, lz = p.getZ(v) * sz;
        P.push(x + lx * co + lz * si, y + ly, z - lx * si + lz * co);
        Cc.push(col.r, col.g, col.b);
      }
    };
    const C3 = (c: number) => new THREE.Color(c);
    const mp: number[] = [], mc: number[] = [];
    /** marque plate posée sur la chaussée (une seule face) : centre, axe, demi-longueur, demi-largeur, hauteur */
    const mark = (x: number, z: number, ux: number, uz: number, hu: number, hv: number, y: number, cl: THREE.Color) => {
      const c = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([p, q]) => [x + ux * hu * p - uz * hv * q, y, z + uz * hu * p + ux * hv * q]);
      for (const i of [0, 1, 2, 0, 2, 3]) { mp.push(...c[i]); mc.push(cl.r, cl.g, cl.b); }
    };
    /** le long d'une ligne, tous les `step` : position, direction unitaire, rang */
    const walk = (l: number[], step: number, fn: (x: number, z: number, ux: number, uz: number, i: number) => void) => {
      let t0 = step / 2, n = 0;
      for (let i = 0; i + 3 < l.length; i += 2) {
        const ax = l[i], az = l[i + 1], dx = l[i + 2] - ax, dz = l[i + 3] - az, len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        let t = t0;
        for (; t < len; t += step) fn(ax + (dx / len) * t, az + (dz / len) * t, dx / len, dz / len, n++);
        t0 = t - len;
      }
    };

    // places des lanternes : sur le trottoir en ville (côté maisons, ou coin d'un carrefour), au bord du chemin ailleurs
    const lamps = new Map<number, [number, number, number, number]>();
    for (const k of this.lightCells(lines)) {
      const cx = k % N, cz = Math.floor(k / N), st = plan?.cells.get(k);
      if (st?.round) continue;
      const roadAt = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
      const dry = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && !w.isWet(cx + dx, cz + dz);
      const n = this.warp(...this.node(cx, cz, j), age), off = hw0 + 0.09;
      let spot: [number, number, number, number] | undefined;
      const cv = this.curved.get(k);
      if (cv) {
        // route en courbe : au bord de sa ligne, du côté d'une case libre (le bras de la lanterne garde un axe de la grille)
        const at = w.curveAt(k)!.at, c = closestOn(at[0], at[1], cv.pieces);
        if (!c) continue;
        for (const sd of [1, -1]) {
          const nx = -c[3] * sd, nz = c[2] * sd, x = c[0] + nx * (off + 0.03), z = c[1] + nz * (off + 0.03), px = Math.floor(x), pz = Math.floor(z);
          if (!w.inCells(px, pz) || w.road[w.ci(px, pz)] || w.occ[w.ci(px, pz)] || w.isWet(px, pz)) continue;
          spot = Math.abs(nx) > Math.abs(nz) ? [x, z, Math.sign(nx), 0] : [x, z, 0, Math.sign(nz)];
          break;
        }
        if (!spot) continue;
      } else if (st && !st.plaza) {
        const ok = (lx: number, lz: number) => st.pave(lx, lz) < -0.02 && st.road(lx, lz) > 0.05;
        const d = D4.find(([dx, dz]) => !roadAt(dx, dz) && ok(dx * off, dz * off)) ?? QUADS.find(([sx, sz]) => ok(sx * 0.41, sz * 0.41));
        if (d) spot = D4.includes(d) ? [n[0] + d[0] * off, n[1] + d[1] * off, d[0], d[1]] : [n[0] + d[0] * 0.41, n[1] + d[1] * 0.41, d[0], d[1]];
      }
      // au bord du chemin, de préférence du côté d'une case libre, sinon le long d'un bâtiment (la lanterne reste sur la
      // case de la route) ; à un carrefour en croix, dans l'angle entre deux rues
      if (!spot) {
        const side = D4.find(([dx, dz]) => !roadAt(dx, dz) && dry(dx, dz) && !w.occ[w.ci(cx + dx, cz + dz)])
          ?? D4.find(([dx, dz]) => !roadAt(dx, dz) && dry(dx, dz))
          ?? QUADS.map(([dx, dz]) => [dx * 0.72, dz * 0.72, dx, dz]).find(([, , dx, dz]) => !roadAt(dx, dz) && dry(dx, dz));
        if (!side) continue;
        spot = [n[0] + side[0] * off, n[1] + side[1] * off, side[0], side[1]];
      }
      lamps.set(k, spot);
    }

    if (snow < 0.6 && !town) {
      // chemins de terre : ornières des charrettes, touffes d'herbe au bord, poteaux indicateurs aux carrefours
      const mains: [number, number[]][] = [];
      for (const [k, ls] of lines) for (const l of ls) if (l.length > 4) mains.push([k, l]);
      const rut = u.uRoad.value.clone().multiplyScalar(0.8), grass = [C3(0x7fae5a), C3(0x8fbc62), C3(0x6f9e4e)];
      if (a === 1) for (const [, l] of mains) walk(l, 0.12, (x, z, ux, uz) => {
        for (const o of [-0.075, 0.075]) { const px = x - uz * o, pz = z + ux * o; mark(px, pz, ux, uz, 0.062, 0.013, w.hAt(px, pz) + 0.023, rut); }
      });
      for (const [k, l] of mains) walk(l, 0.3, (x, z, ux, uz, i) => {
        if (hash2(k, i, 51) > 0.55) return;
        const side = hash2(k, i, 52) < 0.5 ? -1 : 1, o = half(x, z) * (1.0 + hash2(k, i, 53) * 0.12), px = x - uz * o * side, pz = z + ux * o * side;
        const y = w.hAt(px, pz), cl = grass[Math.floor(hash2(k, i, 54) * 3)];
        put(this.ico, px, y + 0.008, pz, 0.022, 0.03, 0.022, i, cl);
        put(this.ico, px + ux * 0.03, y + 0.006, pz + uz * 0.03, 0.016, 0.022, 0.016, i + 1, cl);
      });
      const paved = (x: number, z: number) => { const cx = Math.floor(x), cz = Math.floor(z); return w.inCells(cx, cz) && (lines.has(cz * N + cx) || yards.has(cz * N + cx)); };
      if (a >= 1) for (const k of lines.keys()) {
        const cx = k % N, cz = Math.floor(k / N);
        const roadAt = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
        const dirs = D4.filter(([dx, dz]) => roadAt(dx, dz));
        if (dirs.length < 3 || hash2(cx, cz, 56) > 0.6 || this.curved.has(k)) continue;
        const n = this.warp(...this.node(cx, cz, j), age), corner = QUADS.find(([dx, dz]) => !roadAt(dx, dz) && !paved(cx + 0.5 + dx * 0.9, cz + 0.5 + dz * 0.9));
        if (!corner) continue;
        const qx = n[0] + corner[0] * 0.36, qz = n[1] + corner[1] * 0.36, qy = w.hAt(qx, qz);
        put(this.cube, qx, qy, qz, 0.02, 0.3, 0.02, 0, 0x7a6355);
        dirs.slice(0, 2).forEach(([dx, dz], i) => {
          const ry = Math.atan2(-dz, dx);
          put(this.cube, qx + dx * 0.05, qy + 0.24 - i * 0.05, qz + dz * 0.05, 0.11, 0.028, 0.01, ry, 0xd8c09a);
          put(this.cube, qx + dx * 0.105, qy + 0.245 - i * 0.05, qz + dz * 0.105, 0.025, 0.018, 0.012, ry + Math.PI / 4, 0xd8c09a);
        });
      }
    }
    if (snow < 0.6 && plan) {
      // rues : ligne médiane pointillée, lignes de rive en campagne, passages piétons et feux aux carrefours,
      // poteaux indicateurs, plaques d'égout, grilles d'avaloir, bornes d'incendie et poubelles sur le trottoir
      const white = C3(0xf3f3ee), hw = hw0;
      // lampadaires posés par le joueur (décalés dans un coin de leur case, selon leur orientation)
      const posts: [number, number][] = [];
      for (const b of w.buildings.values()) if (b.kind === 'lamp') {
        const r = (b.rot * Math.PI) / 2;
        posts.push([b.x + 0.5 + 0.32 * Math.cos(r) + 0.32 * Math.sin(r), b.z + 0.5 - 0.32 * Math.sin(r) + 0.32 * Math.cos(r)]);
      }
      for (const [k, st] of plan.cells) {
        if (st.plaza || st.round) continue;
        const cx = k % N, cz = Math.floor(k / N), ox = cx + 0.5, oz = cz + 0.5, y = (x: number, z: number) => w.hAt(x, z) + 0.024;
        if (st.curve) {
          // route en courbe : ligne médiane pointillée le long de sa ligne, lignes de rive continues à la campagne
          const cv = this.curved.get(k), at = w.curveAt(k)!.at;
          if (a < 4 || !cv) continue;
          const rural = st.pave(at[0] - ox, at[1] - oz) > 1;
          for (const l of cv.pieces) {
            walk(l, 0.5, (x, z, ux, uz) => mark(x, z, ux, uz, 0.075, 0.009, y(x, z), white));
            if (rural) walk(l, 0.1, (x, z, ux, uz) => { for (const sd of [-1, 1]) { const o = (hw - 0.04) * sd, px = x - uz * o, pz = z + ux * o; mark(px, pz, ux, uz, 0.056, 0.007, y(px, pz), white); } });
          }
          continue;
        }
        const arms = D4.filter((_, i) => st.mask & (1 << i)), n = arms.length;
        const walkAt = (lx: number, lz: number) => st.pave(lx, lz) < -0.02 && st.road(lx, lz) > 0.05;
        const rural = !st.sides && !st.quads;
        const straight = n === 2 && arms[0][0] === -arms[1][0];
        if (straight) {
          const [ux, uz] = arms[0][0] ? [1, 0] : [0, 1];
          if (a >= 4) {
            for (const t of [-0.25, 0.25]) mark(ox + ux * t, oz + uz * t, ux, uz, 0.075, 0.009, y(ox + ux * t, oz + uz * t), white);
            if (rural) for (const sd of [-1, 1]) { const o = (hw - 0.04) * sd, px = ox - uz * o, pz = oz + ux * o; for (const t of [-0.25, 0.25]) mark(px + ux * t, pz + uz * t, ux, uz, 0.25, 0.007, y(px + ux * t, pz + uz * t), white); }
          }
          const h = hash2(cx, cz, 59);
          if (h < 0.18) {
            const px = ox + ux * 0.12 + uz * 0.14, pz = oz + uz * 0.12 - ux * 0.14, py = w.hAt(px, pz) + 0.02;
            put(this.cyl, px, py, pz, 0.05, 0.005, 0.05, 0, 0x4a4a4e); put(this.cyl, px, py + 0.002, pz, 0.038, 0.005, 0.038, 0, 0x5d5d62);
          }
          for (const sd of [-1, 1]) {
            const lx = -uz * sd, lz = ux * sd;
            if (!walkAt(lx * (hw + 0.08), lz * (hw + 0.08))) continue;
            const hs = hash2(cx * 3 + sd, cz, 60);
            if (hs < 0.25) { const o = hw - 0.035, px = ox + lx * o + ux * 0.3, pz = oz + lz * o + uz * 0.3; mark(px, pz, ux, uz, 0.045, 0.02, y(px, pz) + 0.001, C3(0x34353a)); }
            if (a < 4) continue;
            const o = hw + 0.085, px = ox + lx * o - ux * 0.22, pz = oz + lz * o - uz * 0.22, py = w.hAt(px, pz) + 0.02;
            if (hs > 0.55 && hs < 0.68) {
              put(this.cyl, px, py, pz, 0.016, 0.055, 0.016, 0, 0xd84a3e); put(this.ico, px, py + 0.058, pz, 0.017, 0.014, 0.017, 0, 0xd84a3e);
              put(this.cube, px, py + 0.03, pz, 0.045, 0.012, 0.012, Math.atan2(-uz, ux), 0xd84a3e);
            } else if (hs >= 0.68 && hs < 0.8) {
              put(this.cyl, px, py, pz, 0.025, 0.07, 0.025, 0, 0x3f6a4a); put(this.cyl, px, py + 0.07, pz, 0.028, 0.008, 0.028, 0, 0x2e4a36);
            }
          }
        } else if (n === 2 && a >= 4) {
          // virage : pointillés (et lignes de rive) le long du quart de cercle
          const E = (st.mask & 1) !== 0, S = (st.mask & 4) !== 0, sx = E ? 1 : -1, sz = S ? 1 : -1, px = ox + sx * 0.5, pz = oz + sz * 0.5;
          const arc = (r: number, t: number): [number, number, number, number] => {
            const s = Math.sin((t * Math.PI) / 2), c = Math.cos((t * Math.PI) / 2);
            return [px - sx * s * r, pz - sz * c * r, -sx * c, sz * s];
          };
          for (const t of [0.25, 0.75]) { const [x, z, ux, uz] = arc(0.5, t); mark(x, z, ux, uz, 0.075, 0.009, y(x, z), white); }
          if (rural) for (const r of [0.5 - hw + 0.04, 0.5 + hw - 0.04]) for (let s = 0; s < 6; s++) {
            const [x, z, ux, uz] = arc(r, (s + 0.5) / 6);
            mark(x, z, ux, uz, (r * Math.PI) / 24 + 0.004, 0.007, y(x, z), white);
          }
        }
        if (n >= 3) {
          // passages piétons à l'entrée de chaque branche, d'un trottoir à l'autre
          let crossings = 0;
          for (const [dx, dz] of arms) {
            const nb = plan.cells.get(w.ci(cx + dx, cz + dz));
            if (nb?.plaza || nb?.round) continue;
            if (!walkAt(dx * 0.42 - dz * 0.42, dz * 0.42 + dx * 0.42) && !walkAt(dx * 0.42 + dz * 0.42, dz * 0.42 - dx * 0.42)) continue;
            crossings++;
            if (a < 4) continue;
            const mx = ox + dx * (hw + 0.095), mz = oz + dz * (hw + 0.095), my = y(mx, mz);
            for (let s = -2; s <= 2; s++) { const lat = s * 0.112; mark(mx - dz * lat, mz + dx * lat, dx, dz, 0.065, 0.032, my, white); }
          }
          // feux tricolores (époque moderne) ou poteau indicateur (âge industriel) aux coins du carrefour, hors de la lanterne,
          // des lampadaires posés et des places (le coin du trottoir s'y fond : le poteau se dresserait au milieu des dalles)
          const lamp = lamps.get(k), corners = QUADS.filter(([sx, sz]) => walkAt(sx * 0.41, sz * 0.41)
            && !(lamp && Math.hypot(lamp[0] - ox - sx * 0.41, lamp[1] - oz - sz * 0.41) < 0.2)
            && ![[sx, 0], [0, sz], [sx, sz]].some(([dx, dz]) => plan.cells.get(w.ci(cx + dx, cz + dz))?.plaza)
            && !posts.some(([px, pz]) => Math.hypot(px - ox - sx * 0.41, pz - oz - sz * 0.41) < 0.3));
          if (!crossings || !corners.length) continue;
          if (a >= 4) {
            for (const [sx, sz] of corners.slice(0, hash2(cx, cz, 57) < 0.5 ? 1 : 2)) {
              const qx = ox + sx * 0.41, qz = oz + sz * 0.41, qy = w.hAt(qx, qz) + 0.02;
              put(this.cyl, qx, qy, qz, 0.011, 0.44, 0.011, 0, 0x3c3c40);
              const ax = -sx * 0.12, az = -sz * 0.12, ry = Math.atan2(-az, ax);
              put(this.cube, qx + ax / 2, qy + 0.42, qz + az / 2, 0.17, 0.012, 0.012, ry, 0x3c3c40);
              put(this.cube, qx + ax, qy + 0.31, qz + az, 0.034, 0.1, 0.034, ry, 0x2a2a2e);
              const green = hash2(cx + sx, cz + sz, 58) < 0.5;
              put(this.cube, qx + ax, qy + 0.385, qz + az, 0.024, 0.022, 0.038, ry, green ? 0x5a2a26 : 0xff4a3a, !green);
              put(this.cube, qx + ax, qy + 0.355, qz + az, 0.024, 0.022, 0.038, ry, 0x5a4a20);
              put(this.cube, qx + ax, qy + 0.325, qz + az, 0.024, 0.022, 0.038, ry, green ? 0x3aff7a : 0x1e4a2a, green);
              // bouton d'appel des piétons
              put(this.cube, qx, qy + 0.14, qz, 0.026, 0.04, 0.026, ry, 0xe8c23a);
            }
          } else if (hash2(cx, cz, 56) < 0.7) {
            const [sx, sz] = corners[0], qx = ox + sx * 0.41, qz = oz + sz * 0.41, qy = w.hAt(qx, qz) + 0.02;
            put(this.cube, qx, qy, qz, 0.02, 0.3, 0.02, 0, 0x3c4a44);
            arms.slice(0, 2).forEach(([dx, dz], i) => {
              const ry = Math.atan2(-dz, dx);
              put(this.cube, qx + dx * 0.05, qy + 0.24 - i * 0.05, qz + dz * 0.05, 0.11, 0.028, 0.01, ry, 0xf2efe6);
              put(this.cube, qx + dx * 0.105, qy + 0.245 - i * 0.05, qz + dz * 0.105, 0.025, 0.018, 0.012, ry + Math.PI / 4, 0xf2efe6);
            });
            put(this.cube, qx, qy + 0.3, qz, 0.03, 0.012, 0.03, 0, 0x3c4a44);
          }
        }
      }
    }
    // ronds-points : îlot planté (arbre et fleurs ; statue sur son socle à l'âge industriel ; sculpture et arbres sur un grand
    // îlot), lampadaires aux coins, cédez-le-passage aux entrées et passages piétons juste avant
    const rounds = new Set<Round>();
    if (plan) for (const st of plan.cells.values()) if (st.round) rounds.add(st.round);
    const FLOWERS = [0xf28ab0, 0xf8e05a, 0xffffff, 0xd84a3e, 0xb48ae8];
    for (const R of rounds) {
      const [ax, az] = R.a, [bx, bz] = R.b, isl = R.rIn - 0.08, big = R.rIn > 0.6;
      const tree = (x: number, z: number, s: number) => {
        const y = w.hAt(x, z);
        put(this.cyl, x, y, z, 0.02 * s, 0.24 * s, 0.02 * s, 0, 0x7a5a3e);
        put(this.ico, x, y + 0.27 * s, z, 0.13 * s, 0.12 * s, 0.13 * s, x * 7, snow > 0.5 ? 0xe8eef2 : 0x5fa84a);
        put(this.ico, x + 0.04 * s, y + 0.36 * s, z - 0.03 * s, 0.085 * s, 0.085 * s, 0.085 * s, z * 5, snow > 0.5 ? 0xf2f6fa : 0x74bd5a);
      };
      // couronne de fleurs le long de la bordure (de l'herbe et des buis l'hiver)
      const ring = (r: number, step: number, fn: (x: number, z: number, i: number) => void) => {
        const len = 2 * Math.hypot(bx - ax, bz - az) + 2 * Math.PI * r, n = Math.max(6, Math.round(len / step));
        for (let i = 0; i < n; i++) {
          const t = (i / n) * len, seg = Math.hypot(bx - ax, bz - az), ux = seg ? (bx - ax) / seg : 1, uz = seg ? (bz - az) / seg : 0;
          let x: number, z: number;
          if (t < seg) { x = ax + ux * t - uz * r; z = az + uz * t + ux * r; }
          else if (t < seg + Math.PI * r) { const f = (t - seg) / r; x = bx - uz * Math.cos(f) * r + ux * Math.sin(f) * r; z = bz + ux * Math.cos(f) * r + uz * Math.sin(f) * r; }
          else if (t < 2 * seg + Math.PI * r) { const f = t - seg - Math.PI * r; x = bx - ux * f + uz * r; z = bz - uz * f - ux * r; }
          else { const f = (t - 2 * seg - Math.PI * r) / r; x = ax + uz * Math.cos(f) * r - ux * Math.sin(f) * r; z = az - ux * Math.cos(f) * r - uz * Math.sin(f) * r; }
          fn(x, z, i);
        }
      };
      ring(isl - 0.05, 0.075, (x, z, i) => {
        const y = w.hAt(x, z);
        if (snow > 0.5 || a < 4) put(this.ico, x, y + 0.02, z, 0.035, 0.035, 0.035, i, a < 4 ? 0x4f8a44 : 0xdfe8e0);
        else { put(this.ico, x, y + 0.012, z, 0.026, 0.02, 0.026, i, 0x5f9a4a); put(this.ico, x, y + 0.03, z, 0.018, 0.014, 0.018, i, FLOWERS[i % FLOWERS.length]); }
      });
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (a >= 4) {
        if (big) {
          // sculpture moderne : cubes empilés de travers, aux couleurs vives, sur un socle ; arbres autour
          const y = w.hAt(mx, mz);
          put(this.cube, mx, y, mz, 0.16, 0.05, 0.16, 0, 0xd8d6d0);
          [[0xd84a3e, 0.3], [0xf2c23a, 1.1], [0x3c7fd8, 0.7]].forEach(([c, r], i) => put(this.cube, mx, y + 0.05 + i * 0.075, mz, 0.09 - i * 0.012, 0.075, 0.09 - i * 0.012, r, c));
          ring(isl * 0.62, 0.5, (x, z) => tree(x, z, 0.9));
        } else if (Math.hypot(bx - ax, bz - az) > 0.1) { tree(ax, az, 1); tree(bx, bz, 1); }
        else tree(mx, mz, 1.1);
      } else {
        // statue de bronze vert-de-gris sur son socle de pierre, buis taillés
        const y = w.hAt(mx, mz);
        put(this.cube, mx, y, mz, 0.12, 0.1, 0.12, 0, 0xb8b0a0);
        put(this.cube, mx, y + 0.1, mz, 0.09, 0.025, 0.09, 0, 0xa8a090);
        put(this.cyl, mx, y + 0.125, mz, 0.022, 0.11, 0.022, 0, 0x6f8a72);
        put(this.ico, mx, y + 0.25, mz, 0.022, 0.022, 0.022, 0, 0x6f8a72);
        put(this.cube, mx + 0.03, y + 0.2, mz, 0.06, 0.012, 0.012, 0.4, 0x6f8a72);
        if (big) ring(isl * 0.6, 0.4, (x, z, i) => put(this.ico, x, w.hAt(x, z) + 0.05, z, 0.06, 0.07, 0.06, i, 0x4f8a44));
      }
      // lampadaires aux coins de l'emprise, sur le trottoir
      const [x0, z0, x1, z1] = R.box, cs = [[x0 + 0.2, z0 + 0.2, -1], [x1 + 0.8, z1 + 0.8, 1], [x1 + 0.8, z0 + 0.2, 1], [x0 + 0.2, z1 + 0.8, -1]];
      for (const [x, z, sx] of cs.slice(0, big ? 4 : 2)) lamps.set(-1 - lamps.size, [x, z, sx, 0]);
      if (snow >= 0.6) continue;
      for (const [ex, ez, qx, qz] of R.entries) {
        const l = Math.hypot(ex - qx, ez - qz) || 1, ux = (qx - ex) / l, uz = (qz - ez) / l, vx = -uz, vz = ux;
        if (a >= 4) {
          // ligne de cédez-le-passage là où l'entrée rejoint l'anneau
          const yx = qx - ux * (R.rOut + 0.04), yz = qz - uz * (R.rOut + 0.04), yy = w.hAt(yx, yz) + 0.024;
          for (let s = -2; s <= 2; s++) mark(yx + vx * s * 0.11, yz + vz * s * 0.11, vx, vz, 0.035, 0.011, yy, C3(0xf3f3ee));
        }
        // passage piéton sur la rue qui arrive, juste avant le rond-point, d'un trottoir à l'autre
        const zx = ex - ux * 0.26, zz = ez - uz * 0.26, zc = Math.floor(zx), zr = Math.floor(zz), st = plan?.cells.get(zr * N + zc);
        if (a < 4 || !st || st.plaza || st.round) continue;
        const lx = zx - zc - 0.5, lz = zz - zr - 0.5, ok = (o: number) => st.pave(lx + vx * o, lz + vz * o) < -0.02 && st.road(lx + vx * o, lz + vz * o) > 0.05;
        if (!ok(0.42) && !ok(-0.42)) continue;
        const zy = w.hAt(zx, zz) + 0.024;
        for (let s = -2; s <= 2; s++) mark(zx + vx * s * 0.112, zz + vz * s * 0.112, ux, uz, 0.065, 0.032, zy, C3(0xf3f3ee));
      }
    }
    // éclairage des chemins : torches à la Préhistoire, puis lanternes pendues, réverbères à gaz, lampadaires
    this.lights = [];
    for (const [, [x, z, sx, sz]] of lamps) {
      const y = w.hAt(x, z) + (town ? 0.02 : 0);
      // le bras de la lanterne se tend vers le chemin
      const ry = Math.atan2(-sx, -sz) - Math.PI / 2;
      this.lights.push(x - sx * 0.08, z - sz * 0.08);
      if (age === 0) {
        // torche : pieu de bois, tête de paille ficelée, flamme
        put(this.cube, x, y, z, 0.022, 0.3, 0.022, ry, 0x7a5a3e);
        put(this.cyl, x, y + 0.28, z, 0.026, 0.05, 0.026, 0, 0xc9a46a);
        put(this.ico, x, y + 0.36, z, 0.026, 0.045, 0.026, ry, 0xffb15c, true);
      } else if (age <= 2) {
        put(this.cube, x, y, z, 0.026, 0.36, 0.026, ry, 0x7a6355);
        put(this.cube, x + -sx * 0.05, y + 0.34, z + -sz * 0.05, sx ? 0.11 : 0.02, 0.018, sx ? 0.02 : 0.11, 0, 0x7a6355);
        put(this.cube, x + -sx * 0.09, y + 0.24, z + -sz * 0.09, 0.038, 0.05, 0.038, ry, 0xffd27a, true);
        put(this.cube, x + -sx * 0.09, y + 0.29, z + -sz * 0.09, 0.05, 0.012, 0.05, ry, 0x5a4636);
      } else if (age === 3) {
        put(this.cyl, x, y, z, 0.012, 0.38, 0.012, 0, 0x3c4a44);
        put(this.cube, x, y + 0.38, z, 0.036, 0.05, 0.036, ry, 0xffe2a0, true);
        put(this.cube, x, y + 0.43, z, 0.05, 0.014, 0.05, ry, 0x3c4a44);
      } else {
        put(this.cyl, x, y, z, 0.01, 0.42, 0.01, 0, 0x8a9098);
        put(this.cube, x + -sx * 0.04, y + 0.42, z + -sz * 0.04, sx ? 0.1 : 0.03, 0.012, sx ? 0.03 : 0.1, 0, 0x6b7280);
        put(this.cube, x + -sx * 0.07, y + 0.41, z + -sz * 0.07, 0.04, 0.008, 0.04, 0, 0xfff1c9, true);
      }
    }
    // tonneaux, caisses, sacs (ou bacs à fleurs) au pied des maisons et des ateliers, à côté de la porte
    if (age >= 1 && snow < 0.6) for (const b of w.buildings.values()) {
      if (!CLUTTER.includes(b.kind) || hash2(b.x, b.z, 71) > 0.6) continue;
      const s = sizeOf(b), f = FRONT[b.rot], t = [f[1], -f[0]], side = hash2(b.x, b.z, 72) < 0.5 ? 1 : -1;
      const n = 1 + Math.floor(hash2(b.x, b.z, 73) * 3);
      for (let i = 0; i < n; i++) {
        const lat = side * (0.3 + i * 0.09), fw = s / 2 + 0.1 + (i % 2) * 0.07;
        const x = b.x + s / 2 + f[0] * fw + t[0] * lat, z = b.z + s / 2 + f[1] * fw + t[1] * lat, cx = Math.floor(x), cz = Math.floor(z);
        if (!w.inCells(cx, cz) || (w.occ[w.ci(cx, cz)] && w.occ[w.ci(cx, cz)] !== b.id) || w.cellAvg(cx, cz) < 0.1) continue;
        const y = w.hAt(x, z) + (town ? 0.02 : 0), r = hash2(b.x + i, b.z, 74), ry = hash2(b.x, b.z + i, 75) * 6.28;
        if (age >= 4) { put(this.cube, x, y, z, 0.09, 0.05, 0.05, ry, 0xb4b0a8); put(this.ico, x, y + 0.07, z, 0.045, 0.03, 0.03, ry, 0x7cc46a); }
        else if (r < 0.45) { put(this.cyl, x, y, z, 0.038, 0.085, 0.038, 0, BARREL); put(this.cyl, x, y + 0.02, z, 0.04, 0.008, 0.04, 0, HOOP); put(this.cyl, x, y + 0.062, z, 0.04, 0.008, 0.04, 0, HOOP); }
        else if (r < 0.8) put(this.cube, x, y, z, 0.07, 0.06, 0.07, ry, CRATE);
        else put(this.ico, x, y + 0.03, z, 0.04, 0.035, 0.035, ry, SACK);
      }
    }
    // les places et les grandes cours (aux premiers âges) : bancs, fontaine ou puits, bacs fleuris, caisses du marché, posés là
    // où le sol est plein, au milieu des chemins (au moins trois cases de route autour), à l'écart les uns des autres
    if (!town && age >= 0) {
      const depth = (x: number, z: number) => {
        const cx = Math.floor(x), cz = Math.floor(z);
        if (this.plaza.has(w.ci(cx, cz))) return -1;
        let best = 9;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!w.inCells(cx + dx, cz + dz)) continue;
            const ys = yards.get(w.ci(cx + dx, cz + dz));
            if (ys) for (let i = 0; i < ys.length; i += 3) best = Math.min(best, Math.hypot(x - ys[i], z - ys[i + 1]) - ys[i + 2]);
          }
        return best;
      };
      const cand: [number, number, number][] = [];
      for (let cz = 1; cz < N - 1; cz++)
        for (let cx = 1; cx < N - 1; cx++) {
          const k = w.ci(cx, cz);
          if (w.road[k] || w.occ[k] || w.veg[k] || w.lake[k] || w.cellAvg(cx, cz) < 0.15 || depth(cx + 0.5, cz + 0.5) > -0.3) continue;
          let roads = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && w.road[w.ci(cx + dx, cz + dz)]) roads++;
          if (roads >= 3 || this.plaza.has(k)) cand.push([cx + 0.5, cz + 0.5, hash2(cx, cz, 91)]);
        }
      cand.sort((p, q) => p[2] - q[2]);
      const done: [number, number, number][] = [];
      const stone = 0xa8a29a, wood = 0x8a6a4a, dark = 0x6a5240, leaf = 0x6aa84a, water = 0x6cc4e0, clay = 0xc8643a;
      const bench = (x: number, y: number, z: number, ry: number) => {
        const c = Math.cos(ry), sn = Math.sin(ry), at = (u: number, v: number): [number, number] => [x + u * c + v * sn, z - u * sn + v * c];
        if (age === 0) { const [a, b] = at(0, 0); put(this.cube, a, y, b, 0.3, 0.05, 0.06, ry, wood); for (const u of [-0.1, 0.1]) { const [e, f] = at(u, 0); put(this.cube, e, y, f, 0.03, 0.03, 0.08, ry, dark); } return; }
        const top = age === 1 ? stone : wood;
        for (const u of [-0.1, 0.1]) { const [a, b] = at(u, 0); put(this.cube, a, y, b, 0.03, 0.05, 0.07, ry, age === 1 ? 0x8f8a82 : dark); }
        { const [a, b] = at(0, 0); put(this.cube, a, y + 0.05, b, 0.28, 0.018, 0.08, ry, top); }
        if (age === 2) { const [a, b] = at(0, -0.035); put(this.cube, a, y + 0.068, b, 0.28, 0.06, 0.014, ry, top); }
      };
      for (const [x, z, h] of cand) {
        if (done.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.7)) continue;
        // une seule fontaine (ou puits, ou foyer) par place : on regarde s'il y en a déjà une près d'ici
        let kind = Math.floor(hash2(Math.floor(x), Math.floor(z), 92) * 4);
        if (kind === 1 && done.some(([px, pz, pk]) => pk === 1 && Math.hypot(px - x, pz - z) < 4)) kind = 0;
        done.push([x, z, kind]);
        const y = w.hAt(x, z), ry = Math.floor(h * 4) * (Math.PI / 2);
        if (kind === 0) {
          // deux bancs face à face
          const c = Math.cos(ry), sn = Math.sin(ry);
          bench(x + sn * 0.16, y, z + c * 0.16, ry + Math.PI); bench(x - sn * 0.16, y, z - c * 0.16, ry);
        } else if (kind === 1) {
          if (age === 0) {
            // le foyer de la place : pierres en cercle, braises qui rougeoient
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; put(this.ico, x + Math.cos(a) * 0.09, y + 0.015, z + Math.sin(a) * 0.09, 0.028, 0.022, 0.028, a, stone); }
            put(this.ico, x, y + 0.02, z, 0.04, 0.025, 0.04, 0, 0xff8a3a, true);
          } else if (age === 1) {
            // fontaine : vasque de pierre, eau, colonne et sa coupe
            put(this.cyl, x, y, z, 0.14, 0.06, 0.14, 0, stone); put(this.cyl, x, y + 0.06, z, 0.12, 0.008, 0.12, 0, water);
            put(this.cyl, x, y + 0.06, z, 0.018, 0.12, 0.018, 0, stone); put(this.cyl, x, y + 0.18, z, 0.05, 0.02, 0.05, 0, stone);
          } else {
            // le puits de la place : margelle, deux montants, toit de bardeaux
            put(this.cyl, x, y, z, 0.09, 0.08, 0.09, 0, stone); put(this.cyl, x, y + 0.08, z, 0.075, 0.006, 0.075, 0, water);
            for (const d of [-0.075, 0.075]) put(this.cube, x + d * Math.cos(ry), y + 0.08, z - d * Math.sin(ry), 0.016, 0.16, 0.016, ry, wood);
            put(this.cube, x, y + 0.24, z, 0.22, 0.02, 0.14, ry, 0x7a5040);
          }
        } else if (kind === 2) {
          // bacs fleuris (amphores à l'Antiquité, tonneaux coupés au Moyen Âge), un arbuste
          for (const d of [-0.12, 0.12]) {
            const px = x + d * Math.cos(ry), pz = z - d * Math.sin(ry);
            if (age === 0) put(this.ico, px, y + 0.04, pz, 0.06, 0.05, 0.06, ry, leaf);
            else { put(this.cyl, px, y, pz, 0.045, 0.06, 0.045, 0, age === 1 ? clay : BARREL); put(this.ico, px, y + 0.09, pz, 0.05, 0.04, 0.05, ry, leaf); put(this.ico, px + 0.02, y + 0.12, pz, 0.014, 0.014, 0.014, 0, d > 0 ? 0xe86a7a : 0xf2d24a); }
          }
        } else {
          // le coin du marché : caisses, sacs et tonneau (une statue sur son socle à l'Antiquité)
          if (age === 1) { put(this.cube, x, y, z, 0.1, 0.08, 0.1, ry, stone); put(this.cyl, x, y + 0.08, z, 0.025, 0.12, 0.025, 0, 0xe8e2d4); put(this.ico, x, y + 0.22, z, 0.025, 0.025, 0.025, 0, 0xe8e2d4); }
          else {
            put(this.cube, x - 0.06, y, z, 0.08, 0.07, 0.08, ry, CRATE); put(this.cube, x + 0.05, y, z + 0.04, 0.07, 0.06, 0.07, ry + 0.4, CRATE);
            put(this.ico, x + 0.03, y + 0.03, z - 0.08, 0.04, 0.035, 0.035, ry, SACK);
            if (age === 2) { put(this.cyl, x + 0.1, y, z - 0.06, 0.038, 0.085, 0.038, 0, BARREL); put(this.cyl, x + 0.1, y + 0.02, z - 0.06, 0.04, 0.008, 0.04, 0, HOOP); }
          }
        }
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    gg.setAttribute('aLight', new THREE.Float32BufferAttribute(new Float32Array(gp.length / 3), 1));
    gg.computeVertexNormals();
    this.glow.geometry.dispose();
    this.glow.geometry = gg;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sg.computeVertexNormals();
    this.solid.geometry.dispose();
    this.solid.geometry = sg;
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(mc, 3));
    mg.computeVertexNormals();
    this.marks.geometry.dispose();
    this.marks.geometry = mg;
  }
}
