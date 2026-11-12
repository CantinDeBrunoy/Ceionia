import * as THREE from 'three';
import {
  World, N, SEA, VEG_FOREST, VEG_FIELD, VEG_ROCKS, VEG_CAVE, VEG_WRECK, VEG_VOLCANO, VEG_FISSURE, CAVE_TUNNEL,
  BIOME_TEMPERATE, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH, SNOW_LINE, LavaPool,
} from '../world/world';
import { hash2, smoothstep } from '../core/rng';
import { Simplex } from '../world/noise';
import { SeasonState } from './season';
import { Parts } from './parts';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { bakeStatic, splitTrees, meshVariants, MeshPart, ModelName } from './assets';
import { birchShape, roundTreeShape, bareBirchShape, fernShape, pineShape, bushShape, rockShapes } from './treeShapes';
import { addSnow } from './snow';
import { SHADOW_LAYER } from './materials';
import { addPalette, addCover, pickPalette, PaletteHandle, COVER } from './seasonShaders';
import { SPECIES, PETAL_COLORS } from './seasonConfig';
import { Blight, blightAt, purityAt } from '../world/blight';

/**
 * Tuiles de CH×CH cases : un maillage instancié par tuile et par couche (élagage hors champ, reconstruction partielle) ;
 * deux fois plus grandes sur une grande carte, pour garder le même nombre d'appels de dessin
 */
export let CH = 16;
export let NC = Math.ceil(N / CH);
/** Tuiles pour la carte choisie : à appeler avant de construire la végétation et la faune */
export function syncChunks() { CH = N > 128 ? 32 : 16; NC = Math.ceil(N / CH); }
/** Distance caméra → tuile au-delà de laquelle les arbres passent en version simplifiée, et les menus détails disparaissent */
const LOD_DIST = 48, DETAIL_DIST = 70;
/** Au-delà, une tuile ne projette plus d'ombre ; les petits décors (rochers) disparaissent */
const SHADOW_DIST = 70, SMALL_DIST = 110;
/** Temps de reconstruction des tuiles en attente, par image (ms) */
const BUDGET_MS = 5;

const SNOWC = new THREE.Color(0xf1f5f9);
const WHITE = new THREE.Color(1, 1, 1);
/** Blé : 4 sillons par case, 4 touffes par sillon (grille monde continue d'une case à l'autre) */
const WHEAT_DIV = 4;
const MAX_SPECIAL = 64;
const CORAL_COLORS = [0xf28fa0, 0xf6a65a, 0xb48ae0, 0xf4d35e, 0xff7f6e].map((c) => new THREE.Color(c));
const SMOKE_PER_VOLCANO = 8;
const SPORES_PER_FISSURE = 10;
/** Roche des grottes et mousse (ou sable) de leur sommet, par biome */
const CAVE_ROCK = [0xa59f97, 0x98a0a8, 0xd2a273, 0x9d9b8b, 0x8f8b7b].map((c) => new THREE.Color(c));
const CAVE_TOP = [0x76a05e, 0x5f8f6a, 0xe6cf9a, 0x5aa850, 0x7d9a58].map((c) => new THREE.Color(c));
/** Fougères : teinte par biome (multiplie la couleur de saison) */
const FERN_TINT = [[1, 1, 1], [0.8, 0.95, 0.9], [1, 1, 0.8], [0.85, 1.1, 0.8], [0.9, 1, 0.8]].map(([r, g, b]) => new THREE.Color(r, g, b));
const BOLETE = new THREE.Color(0.82, 0.62, 0.44);
/**
 * Marge autour de l'emprise d'un bâtiment, que ni les cimes ni les rochers ne franchissent : quelques modèles débordent un
 * peu de leurs cases (perron, abside, douves du château)
 */
export const WALL_GAP = 0.16;

/** Part des cases de prairie qui portent un arbre isolé, par biome (aucun au désert : des cactus) */
const LONE_TREE = [0.022, 0.03, 0, 0.034, 0.024];

/**
 * Un arbre isolé de la carte se dresse-t-il sur cette case ? Il n'est rangé nulle part (ni dans `veg`) : il se tire de la case,
 * sur une prairie peu pentue ; la gomme défriche la case (`World.cleared`) et il disparaît
 */
export function loneTreeAt(w: World, cx: number, cz: number) {
  const k = w.ci(cx, cz);
  return !w.veg[k] && !w.cleared[k] && !w.occ[k] && !w.road[k] && w.cellSlope(cx, cz) < 1 && hash2(cx, cz, 820) < LONE_TREE[w.biome[k]];
}

/** Fleurs sauvages par biome (teintes ; 0.58 = blanc) */
const WILD_HUES = [[0.13, 0.58, 0.75, 0.13, 0.58], [0.58, 0.62, 0.58, 0.75], [0.92], [0.92, 0.05, 0.85, 0.11, 0.0], [0.15, 0.58, 0.7]];
/** Teinte des touffes d'herbe par biome (multiplie la couleur de saison) */
const TUFT_TINT = [[1, 1, 1], [0.78, 0.9, 0.88], [1.05, 0.92, 0.62], [0.82, 1.08, 0.74], [0.86, 0.94, 0.68]].map(([r, g, b]) => new THREE.Color(r, g, b));
/** Buissons du désert et des tropiques (sans saisons) ; ailleurs, teinte du biome qui multiplie la palette de saison */
const SHRUB_COLORS = [0x6fa860, 0x5f8f62, 0xa09060, 0x4fa04a, 0x6f8f4e].map((c) => new THREE.Color(c));
const SHRUB_TINT = [[1, 1, 1], [0.86, 0.94, 0.98], [1, 1, 1], [1, 1, 1], [0.95, 1, 0.9]].map(([r, g, b]) => new THREE.Color(r, g, b));
/** Fleurs des buissons fleuris (printemps) */
const BUSH_BLOOM = PETAL_COLORS.map((c) => new THREE.Color(c));
/** Île du portail contaminée : bois mort noir violacé, troncs calcinés, herbe brûlée, obsidienne ; fleurs vives des halos */
const DEAD_WOOD = new THREE.Color(0.42, 0.32, 0.42), CHARRED = new THREE.Color(0.2, 0.16, 0.17);
const BURNT_GRASS = new THREE.Color(0.42, 0.3, 0.22), OBSIDIAN = new THREE.Color(0.2, 0.16, 0.26);
const PURE_HUES = [0.13, 0.92, 0.75, 0.58, 0.05];

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material }
interface LayerOpts {
  /** ombres portées */
  shadow?: boolean;
  /** menus détails : masqués au loin */
  detail?: boolean;
  /** petits décors : masqués très loin (vue d'ensemble d'une grande carte) */
  small?: boolean;
  /** arbres, buissons et sous-bois : version simplifiée au loin, et pour leur ombre portée (calculée en tâche de fond) */
  lod?: boolean;
  /** triangles au plus, même de près : les parties plus détaillées (branches de certains arbres importés) sont allégées */
  max?: number;
}

/**
 * Couche de végétation découpée en tuiles : les instances sont préparées côté processeur par tuile,
 * puis copiées dans le maillage de la tuile (créé ou agrandi à la demande) ; plusieurs parties (feuillage, bois…)
 * partagent les mêmes matrices et couleurs
 */
class Layer {
  /** tuile en cours de reconstruction : chaque `put` y range son instance */
  static chunk = 0;
  private m: Float32Array[] = [];
  private c: Float32Array[] = [];
  private n = new Int32Array(NC * NC);
  private near: THREE.InstancedMesh[][] = [];
  private far: THREE.InstancedMesh[][] = [];
  private lodGeo: THREE.BufferGeometry[] | null = null;

  private reachR = -1;

  constructor(private group: THREE.Group, readonly parts: Part[], readonly o: LayerOpts = {}) {
    for (let i = 0; i < NC * NC; i++) { this.m.push(new Float32Array(64)); this.c.push(new Float32Array(12)); this.near.push([]); this.far.push([]); }
  }

  /** Portée de ses parties autour du pied, à l'échelle 1 (rayon de la cime d'un arbre, quelle que soit sa rotation) */
  get reach() {
    if (this.reachR < 0) {
      this.reachR = 0;
      for (const p of this.parts) {
        const pos = p.geo.attributes.position;
        for (let i = 0; i < pos.count; i++) this.reachR = Math.max(this.reachR, Math.hypot(pos.getX(i), pos.getZ(i)));
      }
    }
    return this.reachR;
  }

  begin(ch: number) { this.n[ch] = 0; }

  put(mat: THREE.Matrix4, col: THREE.Color = WHITE) {
    const ch = Layer.chunk, i = this.n[ch];
    if ((i + 1) * 16 > this.m[ch].length) {
      const m = new Float32Array(this.m[ch].length * 2), c = new Float32Array(this.c[ch].length * 2);
      m.set(this.m[ch]); c.set(this.c[ch]);
      this.m[ch] = m; this.c[ch] = c;
    }
    mat.toArray(this.m[ch], i * 16);
    col.toArray(this.c[ch], i * 3);
    this.n[ch] = i + 1;
  }

  private make(geo: THREE.BufferGeometry, mat: THREE.Material, im: THREE.InstancedBufferAttribute, ic: THREE.InstancedBufferAttribute) {
    const mesh = new THREE.InstancedMesh(geo, mat, im.count);
    mesh.instanceMatrix = im;
    mesh.instanceColor = ic;
    mesh.castShadow = this.o.shadow !== false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  end(ch: number) {
    const n = this.n[ch];
    let near = this.near[ch];
    if (n > 0 && (!near.length || near[0].instanceMatrix.count < n)) {
      this.dispose(ch);
      const cap = Math.ceil(n * 1.25) + 4;
      const im = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
      const ic = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      im.setUsage(THREE.DynamicDrawUsage);
      ic.setUsage(THREE.DynamicDrawUsage);
      near = this.near[ch] = this.parts.map((p) => this.make(p.geo, p.mat, im, ic));
      if (this.lodGeo) this.far[ch] = this.parts.map((p, i) => this.make(this.lodGeo![i], p.mat, im, ic));
    }
    if (!near.length) return;
    const im = near[0].instanceMatrix, ic = near[0].instanceColor!;
    (im.array as Float32Array).set(this.m[ch].subarray(0, n * 16));
    (ic.array as Float32Array).set(this.c[ch].subarray(0, n * 3));
    im.needsUpdate = ic.needsUpdate = true;
    for (const mesh of near.concat(this.far[ch])) {
      mesh.count = n;
      mesh.computeBoundingSphere();
    }
  }

  private dispose(ch: number) {
    for (const mesh of this.near[ch].concat(this.far[ch])) { this.group.remove(mesh); mesh.dispose(); }
    this.near[ch] = []; this.far[ch] = [];
  }

  /** Remplace la géométrie d'une partie (allégée), aussi dans les tuiles déjà construites */
  setPart(i: number, geo: THREE.BufferGeometry) {
    this.parts[i].geo = geo;
    for (const near of this.near) if (near[i]) near[i].geometry = geo;
  }

  /** Version simplifiée des parties, pour les tuiles lointaines */
  setLod(geos: THREE.BufferGeometry[]) {
    this.lodGeo = geos;
    for (let ch = 0; ch < NC * NC; ch++) {
      const near = this.near[ch];
      if (!near.length) continue;
      this.far[ch] = this.parts.map((p, i) => {
        const mesh = this.make(geos[i], p.mat, near[0].instanceMatrix, near[0].instanceColor!);
        mesh.count = near[0].count;
        mesh.computeBoundingSphere();
        return mesh;
      });
    }
  }

  /** Visibilité d'une tuile selon sa distance à la caméra */
  view(ch: number, dist: number, lodDist = LOD_DIST) {
    const has = this.n[ch] > 0;
    // en qualité réduite (lodDist plus court), menus détails et ombres s'arrêtent plus près, dans la même proportion
    const k = lodDist / LOD_DIST;
    const hide = (this.o.detail && dist > DETAIL_DIST * k) || (this.o.small && dist > SMALL_DIST);
    const lod = !!this.far[ch].length, far = lod && dist > lodDist;
    // les ombres des tuiles lointaines, à peine visibles, doubleraient les appels de dessin
    const shadow = this.o.shadow !== false && dist < SHADOW_DIST * k;
    // de près, l'ombre portée vient de la version simplifiée, rangée sur le calque des seules ombres : trois fois moins
    // de triangles à dessiner dans la carte des ombres, pour une silhouette au sol presque identique
    for (const m of this.near[ch]) { m.visible = has && !hide && !far; m.castShadow = shadow && !lod; }
    for (const m of this.far[ch]) { m.visible = has && !hide && (far || shadow); m.castShadow = shadow; m.layers.mask = far ? 1 | (1 << SHADOW_LAYER) : 1 << SHADOW_LAYER; }
  }
}

/** Arbre importé : ses couches (feuillage teinté par la saison, bois…) et ses proportions */
interface Species {
  layer: Layer;
  /** hauteur (perchoir des oiseaux à la cime) */
  height: number;
}

/** Feuillu : tronc, feuillage fleuri et feuillage vert (teintés par la saison) ; le feuillage rétrécit autour de leafY */
interface Leafy {
  trunk: Layer;
  blob: Layer;
  blob2: Layer;
  leafY: number;
  /** cime du feuillage (perchoir) */
  leafTop: number;
}

/** Végétation instanciée : forêts par biome, blé, prairies, marais, déserts et fonds marins (les jardins : GardenView) */
export class VegView {
  group = new THREE.Group();
  /** distance à partir de laquelle les arbres passent en version simplifiée (qualité graphique) */
  lodDist = LOD_DIST;
  /** contamination de l'île du portail (arbres morts, herbe brûlée, obsidienne ; fleurs des halos) : à suivre par le jeu */
  blight: Blight | null = null;
  /** perchoirs (cimes) et fleurs de chaque tuile, [x, y, z, …] : la faune s'y pose et les butine */
  perches: number[][] = Array.from({ length: NC * NC }, () => []);
  flowers: number[][] = Array.from({ length: NC * NC }, () => []);
  private layers: Layer[] = [];
  /** feuillus : une essence par variante (bouleau, arbre commun, arbre rond…) */
  private leafy: Leafy[] = [];
  /** bouleau nu : les feuillus en plein hiver */
  private bare: Species | null = null;
  private trunk: Layer;
  private pine: Layer;
  private pineVars: Species[] = [];
  private snowPines: Species[] = [];
  private palms: Species[] = [];
  private cacti: Species[] = [];
  private willows: Species[] = [];
  private deadTrees: Species[] = [];
  private shrub: Layer | null = null;
  /** buissons du désert et des tropiques, qui ne suivent pas les saisons */
  private shrubDry: Layer | null = null;
  private wheat: Layer;
  private plant: Layer;
  private blossom: Layer;
  private tuft: Layer;
  private reed: Layer;
  private lily: Layer;
  /** rochers : une couche par pièce du tas importé, et son rayon au sol */
  private rocks: { layer: Layer; radius: number }[] = [];
  private seaweed: Layer | null = null;
  private corals: Layer[] = [];
  private kelp: Layer;
  private coral: Layer;
  // décors uniques (grottes, failles, épaves, volcans) : peu nombreux, un seul maillage chacun
  /** buttes des grottes et failles, en coordonnées monde (elles épousent le relief) : refaites quand elles changent */
  private caves: THREE.Mesh;
  private fissures: THREE.Mesh;
  private fissureGlow: THREE.Mesh;
  private spores: THREE.InstancedMesh;
  private sporePhase: THREE.InstancedBufferAttribute;
  // sous-bois et détails des prairies
  private logs: Layer | null = null;
  private stumps: Layer | null = null;
  private ferns: Layer | null = null;
  private mushrooms: Layer | null = null;
  private bones: Layer[] = [];
  private wildFlowers: Layer[] = [];
  private fernMat: THREE.MeshStandardMaterial;
  private wreck: THREE.InstancedMesh;
  private wreckModel = false;
  private lava: THREE.Mesh;
  private smoke: THREE.InstancedMesh;
  private smokePhase: THREE.InstancedBufferAttribute;
  private volcanoes: [number, number][] = [];
  private tuftMat: THREE.MeshStandardMaterial;
  private blobMat: THREE.MeshStandardMaterial;
  private blob2Mat: THREE.MeshStandardMaterial;
  private pineMat: THREE.MeshStandardMaterial;
  private willowMat: THREE.MeshStandardMaterial;
  private imported = false;
  private wheatMat: THREE.MeshStandardMaterial;
  private season: SeasonState | null = null;
  /** réglages de saison qui changent la forme ou le nombre des décors (et non leur teinte) : à leur dernière reconstruction */
  private builtSig = new Float32Array(10).fill(-1);
  private sig = new Float32Array(10);
  /** palettes de saison des feuillages, des sapins, des touffes et des buissons (teintes lues sur place par les shaders) */
  private pals: { blossom: PaletteHandle; leafy: PaletteHandle; willow: PaletteHandle; conifer: PaletteHandle; tuft: PaletteHandle; shrub: PaletteHandle };
  /** bosquets d'arbres à fleurs, prairies fleuries */
  private groveNoise = new Simplex(9137);
  private built = false;
  /** tuiles à reconstruire (les retouches du joueur passent devant) */
  private queue: number[] = [];
  private queued = new Uint8Array(NC * NC);
  private lifeTimer = 0;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private uTime = { value: 0 };
  private uWater = { value: 0 };
  private uCalm = { value: 1 };

  constructor(private world: World) {
    const std = (c: number, vertexColors = false) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.95, vertexColors });
    // feuillages et buissons : ombrage lisse, formes rondes
    const soft = (vertexColors: boolean) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors });
    const layer = (parts: Part[], o?: LayerOpts) => { const l = new Layer(this.group, parts, o); this.layers.push(l); return l; };
    this.blobMat = soft(true);
    this.blob2Mat = soft(true);
    this.pineMat = std(0x7fba86, true);
    this.willowMat = soft(true);
    this.wheatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
    addWind(this.wheatMat, this.uTime, 0.25);
    addWind(this.blobMat, this.uTime, 0.035);
    addWind(this.blob2Mat, this.uTime, 0.035);
    addWind(this.willowMat, this.uTime, 0.05);
    this.tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    addWind(this.tuftMat, this.uTime, 1.3);
    keepNormals(this.tuftMat);
    const wood = std(0xffffff, true);
    // l'hiver, la neige se pose sur les branches des sapins, des bouleaux nus et des buissons, et sur les rochers
    // sapins facettés : la neige ne tient que sur les facettes les plus plates, ils restent verts dessous
    addSnow(this.pineMat, 1, 0.62, 0.9);
    addSnow(wood, 0.9);
    // et sur les feuilles sèches que gardent quelques feuillus
    addSnow(this.blobMat, 0.7);
    addSnow(this.blob2Mat, 0.7);
    // teintes de saison par arbre, tirées des palettes (seasonConfig.ts) : bosquets de cerisiers, groupes d'érables rouges…
    const shrubMat = soft(true);
    addSnow(shrubMat, 0.8);
    this.pals = {
      blossom: addPalette(this.blobMat, 0.7),
      leafy: addPalette(this.blob2Mat, 0.6),
      willow: addPalette(this.willowMat, 0.5),
      conifer: addPalette(this.pineMat, 0.4),
      tuft: addPalette(this.tuftMat, 0.75),
      shrub: addPalette(shrubMat, 0.6),
    };
    // les saules gardent leur vert un peu grisé
    this.willowMat.color.setRGB(0.9, 0.98, 0.88);

    // arbres modélisés (Quaternius, Ultimate Nature) : bouleaux, arbres communs et ronds, sapins ; leur feuillage garde ses
    // nuances mais prend la couleur de la saison. Sans modèles : feuillus ronds et sapins à étages procéduraux (treeShapes)
    this.imported = true;
    const leafyOf = (trunk: THREE.BufferGeometry, canopy: THREE.BufferGeometry, leafY: number): Leafy => {
      canopy.computeBoundingBox();
      return {
        trunk: layer([{ geo: trunk, mat: wood }], { lod: true, max: 1200 }),
        blob: layer([{ geo: canopy, mat: this.blobMat }], { lod: true }),
        blob2: layer([{ geo: canopy, mat: this.blob2Mat }], { lod: true }),
        leafY, leafTop: canopy.boundingBox!.max.y,
      };
    };
    // feuillus et sapins du style « diorama ensoleillé » (treeShapes.ts) : bouleaux blancs à cimes facettées, feuillus bruns,
    // sapins à étages ; les autres biomes gardent leurs essences importées
    for (const t of [birchShape(0), birchShape(1), birchShape(2), roundTreeShape(0), roundTreeShape(1)]) this.leafy.push(leafyOf(t.trunk, t.canopy, t.bottom));
    this.trunk = this.leafy[0].trunk;
    this.bare = { layer: layer([{ geo: bareBirchShape(), mat: wood }], { lod: true }), height: 1.05 };
    this.pine = layer([{ geo: pineGeo(), mat: this.pineMat }]);
    for (const v of [0, 1, 2]) { const t = pineShape(v); this.pineVars.push({ layer: layer([{ geo: t.green, mat: this.pineMat }, { geo: t.trunk, mat: wood }], { lod: true }), height: t.top }); }
    // essences des autres biomes
    const species = (name: ModelName, height: number, tintRe: RegExp, tintMat: THREE.Material, restMat: THREE.Material, skip?: RegExp): Species | null => {
      const m = bakeStatic(name, height, tintRe, skip);
      if (!m) return null;
      const parts: Part[] = [];
      if (m.tint) parts.push({ geo: m.tint, mat: tintMat });
      if (m.rest) parts.push({ geo: m.rest, mat: restMat });
      return parts.length ? { layer: layer(parts, { lod: true }), height } : null;
    };
    const keep = <T,>(list: (T | null)[]) => list.filter((x): x is T => !!x);
    const palmMat = soft(true);
    addWind(palmMat, this.uTime, 0.03);
    // sapins enneigés : le modèle (neige sur les branches), sinon des calottes de neige sur chaque étage
    this.snowPines = [0, 1].map((v) => {
      const sp = pineShape(v, true);
      return { layer: layer([{ geo: sp.green, mat: this.pineMat }, { geo: sp.snow!, mat: std(0xf4f8fb, true) }, { geo: sp.trunk, mat: wood }], { lod: true }), height: sp.top };
    });
    this.palms = keep([species('palm', 1.3, /^$/, palmMat, palmMat), species('palm2', 1.6, /^$/, palmMat, palmMat), species('palm3', 1.25, /^$/, palmMat, palmMat)]);
    this.cacti = keep([species('cactus2', 0.95, /^$/, wood, wood), species('cactus_flowers', 0.72, /^$/, wood, wood), species('cactus', 0.42, /^$/, wood, wood, /black|brown/i)]);
    this.willows = keep([species('willow', 1.2, /green/i, this.willowMat, wood)]);
    this.deadTrees = keep([species('dead_tree', 0.95, /^$/, wood, wood)]);
    const bush = bushShape();
    this.shrub = layer([{ geo: bush, mat: shrubMat }], { detail: true, lod: true });
    this.shrubDry = layer([{ geo: bush, mat: soft(true) }], { detail: true, lod: true });
    this.wheat = layer([{ geo: wheatClumpGeo(), mat: this.wheatMat }], { shadow: false, detail: true });
    this.plant = layer([{ geo: smoothBlobs([[0.07, 0, 0.045, 0, 0.72, 1]], false), mat: soft(false) }], { detail: true });
    this.blossom = layer([{ geo: new THREE.IcosahedronGeometry(0.035, 0).translate(0, 0.085, 0), mat: std(0xffffff) }], { shadow: false, detail: true });
    this.tuft = layer([{ geo: tuftGeo(), mat: this.tuftMat }], { shadow: false, detail: true });
    const reedMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
    addWind(reedMat, this.uTime, 0.5);
    this.reed = layer([{ geo: reedGeo(), mat: reedMat }], { shadow: false, detail: true });
    // nénuphars : posés sur l'eau, ils suivent sa houle
    const lilyModel = bakeStatic('lilypad', 0.05, /^$/);
    const lilyMat = std(0xffffff, true);
    addSwell(lilyMat, this.uWater, this.uCalm);
    this.lily = layer([{ geo: lilyModel?.rest ?? new THREE.CircleGeometry(0.12, 7).rotateX(-Math.PI / 2), mat: lilyMat }], { shadow: false, detail: true });
    const rockMat = std(0xbabcbd, true);
    addSnow(rockMat);
    // mousse (plus épaisse près de l'eau) ou feuilles sur le dessus, sous la neige
    addCover(rockMat, SEA);
    this.rocks = rockShapes().map((r) => ({ layer: layer([{ geo: r.geometry, mat: rockMat }], { small: true }), radius: r.radius }));
    // fonds marins importés : algues (qui ondulent dans le courant) et lot de coraux, textures conservées
    const weed = meshVariants('seaweed', 1, false), corals = meshVariants('coral_set', 0.22, true);
    const variant = (parts: MeshPart[], prep?: (m: THREE.Material) => THREE.Material) => layer(parts.map((p) => ({ geo: p.geometry, mat: prep ? prep(p.material) : p.material })), { shadow: false, detail: true });
    if (weed.length) this.seaweed = variant(weed[0], (m) => { const c = m.clone(); c.side = THREE.DoubleSide; addWind(c, this.uTime, 0.14); return c; });
    this.corals = corals.map((v) => variant(v));
    const kelpMat = new THREE.MeshStandardMaterial({ color: 0x6f8f3e, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
    addWind(kelpMat, this.uTime, 0.14);
    this.kelp = layer([{ geo: new THREE.PlaneGeometry(0.1, 1, 1, 5).translate(0, 0.5, 0), mat: kelpMat }], { shadow: false, detail: true });
    this.coral = layer([{ geo: coralGeo(), mat: std(0xffffff, true) }], { shadow: false, detail: true });
    // sous-bois : troncs moussus couchés, souches, fougères (teintées par la saison), champignons ; ossements au désert
    this.fernMat = soft(true);
    addWind(this.fernMat, this.uTime, 1.2);
    const prop = (name: ModelName, height: number, tintMat?: THREE.Material) => {
      const m = bakeStatic(name, height, tintMat ? /./ : /^$/);
      const parts: Part[] = [];
      if (m?.tint && tintMat) parts.push({ geo: m.tint, mat: tintMat });
      if (m?.rest) parts.push({ geo: m.rest, mat: wood });
      return parts.length ? layer(parts, { detail: true, lod: true }) : null;
    };
    this.logs = prop('log', 0.12);
    this.stumps = prop('stump', 0.1);
    // fougère dessinée par le jeu, facettée comme les arbres (le modèle importé jurait avec le reste)
    this.fernMat.side = THREE.DoubleSide;
    this.ferns = layer([{ geo: fernShape(), mat: this.fernMat }], { detail: true, lod: true });
    this.mushrooms = prop('mushroom', 0.08);
    this.bones = keep([prop('skull', 0.06), prop('ribcage', 0.1), prop('bone', 0.022)]);
    this.wildFlowers = meshVariants('flowers', 0.11, true).map((v) => variant(v));

    // décors uniques
    const single = (g: THREE.BufferGeometry, m: THREE.Material, n: number, shadow = true) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.count = 0;
      im.castShadow = shadow;
      im.receiveShadow = shadow;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    const wreck = bakeStatic('ship_wreck', 0.85, /^$/);
    this.wreckModel = !!wreck?.rest;
    this.wreck = single(wreck?.rest ?? wreckGeo(), std(0xffffff, true), MAX_SPECIAL);
    // lave : matériau non éclairé, elle brille aussi la nuit
    // lave très vive : elle rayonne la nuit (halo)
    // (un maillage par carte : chaque lac épouse la cuvette de son cratère)
    this.lava = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) }));
    this.lava.frustumCulled = false;
    this.lava.visible = false;
    this.group.add(this.lava);
    const smokeG = new THREE.IcosahedronGeometry(0.22, 1);
    this.smokePhase = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPECIAL * SMOKE_PER_VOLCANO), 1);
    smokeG.setAttribute('aPhase', this.smokePhase);
    this.smoke = single(smokeG, smokeMaterial(this.uTime), MAX_SPECIAL * SMOKE_PER_VOLCANO, false);
    this.caves = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    this.caves.castShadow = this.caves.receiveShadow = true;
    // la faille est un sillon sombre posé à fleur de sol : légèrement tirée vers la caméra pour ne pas scintiller
    this.fissures = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    this.fissures.receiveShadow = true;
    this.fissureGlow = new THREE.Mesh(new THREE.BufferGeometry(), crackGlowMaterial(this.uTime));
    this.fissureGlow.renderOrder = 2;
    for (const m of [this.caves, this.fissures, this.fissureGlow]) { m.frustumCulled = false; this.group.add(m); }
    const sporeG = new THREE.IcosahedronGeometry(0.03, 0);
    this.sporePhase = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPECIAL * SPORES_PER_FISSURE), 1);
    sporeG.setAttribute('aPhase', this.sporePhase);
    this.spores = single(sporeG, sporeMaterial(this.uTime), MAX_SPECIAL * SPORES_PER_FISSURE, false);
    void this.makeLods();
  }

  /** Arbres simplifiés pour le lointain (meshoptimizer, en tâche de fond) ; les parties trop détaillées allégées d'abord */
  private async makeLods() {
    const mod = new SimplifyModifier();
    const simplify = async (geo: THREE.BufferGeometry, keep: number) => {
      const src = new THREE.BufferGeometry();
      src.setAttribute('position', geo.attributes.position);
      if (geo.attributes.color) src.setAttribute('color', geo.attributes.color);
      const merged = mergeVertices(src, 1e-3);
      const n = merged.attributes.position.count;
      const flat = (await mod.modify(merged, Math.floor(n * (1 - keep)))).toNonIndexed();
      flat.computeVertexNormals();
      return flat;
    };
    for (const l of this.layers) {
      if (!l.o.lod) continue;
      try {
        const geos: THREE.BufferGeometry[] = [];
        for (const [i, p] of l.parts.entries()) {
          const tris = p.geo.attributes.position.count / 3;
          if (l.o.max && tris > l.o.max) l.setPart(i, await simplify(p.geo, l.o.max / tris));
          geos.push(await simplify(l.parts[i].geo, 0.28));
        }
        l.setLod(geos);
      } catch (e) {
        console.warn('Arbres simplifiés indisponibles', e);
        return;
      }
    }
  }

  /** Vent : balancement du blé et des feuillages ; houle des nénuphars (même vague que la surface de l'eau) */
  animate(t: number, water = 0, calm = 1) {
    this.uTime.value = t;
    this.uWater.value = water;
    this.uCalm.value = calm;
  }

  applySeason(s: SeasonState) {
    this.season = s;
    // teintes : lues sur place par les shaders, rien à reconstruire
    const p = this.pals;
    p.blossom.set(s.trees.blossom); p.leafy.set(s.trees.leafy); p.willow.set(s.trees.leafy);
    p.conifer.set(s.trees.conifer); p.tuft.set(s.ground.tuft); p.shrub.set(s.ground.shrub);
    COVER.color.value = s.ground.moss;
    COVER.k.value = s.ground.mossK;
    this.wheatMat.color.copy(s.crop);
    this.fernMat.color.copy(s.ground.fern);
    // forme et nombre (feuillage, neige, cultures, fleurs, herbe, champignons, feuilles mortes, roseaux) : les tuiles se
    // refont au fil des images quand l'un d'eux a assez bougé
    const g = s.ground, sig = this.sig;
    sig[0] = s.leaf; sig[1] = s.snow; sig[2] = s.growth; sig[3] = g.flowerK * 0.5; sig[4] = g.tuftHeight; sig[5] = g.mushrooms;
    sig[6] = g.leafPiles; sig[7] = g.shrubBloom; sig[8] = s.trees.leafSpread; sig[9] = g.bankReeds;
    let moved = false;
    for (let i = 0; i < sig.length; i++) if (Math.abs(sig[i] - this.builtSig[i]) > 0.03) moved = true;
    if (moved) {
      this.builtSig.set(sig);
      for (let ch = 0; ch < NC * NC; ch++) this.enqueue(ch, false);
      // neige et mousse au sommet des grottes
      if (this.built) this.rebuildSpecial();
      // première fois : toute la carte tout de suite ; ensuite, au fil des images
      if (!this.built) {
        this.built = true;
        this.rebuildSpecial();
        this.flush(Infinity);
        this.world.vegRect = null;
      }
    }
  }

  private enqueue(ch: number, urgent: boolean) {
    if (this.queued[ch]) {
      if (!urgent) return;
      this.queue.splice(this.queue.indexOf(ch), 1);
    }
    this.queued[ch] = 1;
    if (urgent) this.queue.unshift(ch); else this.queue.push(ch);
  }

  /** Reconstruit la zone retouchée (bâtiments, routes, relief, végétation) et les décors uniques */
  rebuild(s: SeasonState) {
    this.season = s;
    const w = this.world, r = w.vegRect;
    if (!r) return;
    w.vegRect = null;
    // les parcelles ont pu changer : leurs sillons seront recalculés
    this.plotAngle.clear();
    // les décors uniques (grottes, failles, volcans, épaves) ne se refont que si la zone en touche un
    if (this.specialNear(r)) this.rebuildSpecial();
    const urgent: number[] = [];
    for (let cz = Math.floor(r[1] / CH); cz <= Math.floor(r[3] / CH); cz++)
      for (let cx = Math.floor(r[0] / CH); cx <= Math.floor(r[2] / CH); cx++) urgent.push(cz * NC + cx);
    // petite retouche : devant, et tout de suite si c'est court (une grande tuile se finit à l'image suivante) ; carte
    // entière : au fil des images
    for (const ch of urgent) this.enqueue(ch, urgent.length <= 6);
    if (urgent.length <= 6) this.flush(8, urgent.length + (this.current ? 1 : 0));
  }

  /** Avance les reconstructions en attente et règle la visibilité des tuiles selon la caméra */
  update(dt: number, cam: THREE.Vector3) {
    const w = this.world;
    this.lifeTimer -= dt;
    if (this.lifeTimer <= 0 && w.lifeCells.size) {
      this.lifeTimer = 1.5;
      for (const k of w.lifeCells) this.enqueue(Math.floor(Math.floor(k / N) / CH) * NC + Math.floor((k % N) / CH), false);
      w.lifeCells.clear();
    }
    this.flush(BUDGET_MS);
    for (let ch = 0; ch < NC * NC; ch++) {
      const x = ((ch % NC) + 0.5) * CH, z = (Math.floor(ch / NC) + 0.5) * CH;
      const dist = Math.max(0, Math.hypot(cam.x - x, cam.y - 1, cam.z - z) - CH * 0.6);
      for (const l of this.layers) l.view(ch, dist, this.lodDist);
    }
  }

  /**
   * Avance les reconstructions en attente : `budget` ms au plus par appel (une grande tuile se fait en plusieurs fois, ligne
   * par ligne : ses anciens décors restent affichés jusqu'à ce qu'elle soit prête), `max` tuiles au plus
   */
  private flush(budget: number, max = Infinity) {
    if (!this.season) return;
    const t0 = performance.now();
    let done = 0;
    while ((this.current || this.queue.length) && done < max) {
      if (!this.current) {
        const ch = this.queue.shift()!;
        this.queued[ch] = 0;
        this.current = this.buildChunk(ch, this.season);
      }
      // (au moins un pas par appel, pour avancer même quand les images sont lentes)
      let r = this.current.next();
      while (!r.done && performance.now() - t0 < budget) r = this.current.next();
      if (!r.done) return;
      this.current = null;
      done++;
    }
  }
  /** tuile en cours de reconstruction (d'une image à l'autre) */
  private current: Generator<void, void, void> | null = null;

  // ---------- Tuiles ----------

  private *buildChunk(ch: number, s: SeasonState): Generator<void, void, void> {
    const w = this.world;
    Layer.chunk = ch;
    for (const l of this.layers) l.begin(ch);
    this.perches[ch] = [];
    this.flowers[ch] = [];
    const x0 = (ch % NC) * CH, z0 = Math.floor(ch / NC) * CH;
    for (let cz = z0; cz < Math.min(N, z0 + CH); cz++) {
      // une ligne de cases par pas (les perchoirs et les fleurs ne sont lus qu'une fois la tuile finie)
      if (cz > z0 && (cz - z0) % 2 === 0) yield;
      for (let cx = x0; cx < Math.min(N, x0 + CH); cx++) {
        const k = w.ci(cx, cz), t = w.veg[k];
        // l'emprise des grottes et des failles reste dégagée
        if (w.decor[k] && t < VEG_CAVE) continue;
        if (!t) this.meadow(cx, cz, s);
        else if (t === VEG_FOREST) this.forest(cx, cz, s);
        else if (t === VEG_FIELD) this.field(cx, cz, s);
        // les jardins ont leur propre décor, qui change avec les âges (GardenView)
        else if (t === VEG_ROCKS) this.rockery(cx, cz, s);
      }
    }
    for (const l of this.layers) l.end(ch);
  }

  private at(x: number, y: number, z: number, rot: number, sx: number, sy = sx, sz = sx) {
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(0, rot, 0);
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    return d.matrix;
  }

  /** distance au bord de la zone (côtés dont la case voisine est d'un autre type) : la lisière est plus clairsemée */
  private edge(cx: number, cz: number) {
    const w = this.world, t = w.veg[w.ci(cx, cz)];
    const other = (x: number, z: number) => !w.inCells(x, z) || w.veg[w.ci(x, z)] !== t;
    const open = [other(cx - 1, cz), other(cx + 1, cz), other(cx, cz - 1), other(cx, cz + 1)];
    return (px: number, pz: number) => {
      let e = 1;
      if (open[0]) e = Math.min(e, px - cx);
      if (open[1]) e = Math.min(e, cx + 1 - px);
      if (open[2]) e = Math.min(e, pz - cz);
      if (open[3]) e = Math.min(e, cz + 1 - pz);
      return e;
    };
  }

  private plantAt(x: number, z: number, sc: number, sy: number, rot: number, c: THREE.Color) {
    this.plant.put(this.at(x, this.world.hAt(x, z), z, rot, sc, sc * sy), c);
  }

  /**
   * Place libre autour du point (x, z) : distance à l'emprise du bâtiment le plus proche, marge comprise (Infinity s'il n'y en
   * a pas dans les cases voisines : aucune cime ne porte plus loin)
   */
  private room(x: number, z: number) {
    const w = this.world, x0 = Math.floor(x), z0 = Math.floor(z);
    let d = Infinity;
    for (let cz = z0 - 1; cz <= z0 + 1; cz++)
      for (let cx = x0 - 1; cx <= x0 + 1; cx++) {
        if (!w.inCells(cx, cz) || !w.occ[w.ci(cx, cz)]) continue;
        const qx = Math.max(cx - WALL_GAP, Math.min(cx + 1 + WALL_GAP, x)), qz = Math.max(cz - WALL_GAP, Math.min(cz + 1 + WALL_GAP, z));
        d = Math.min(d, Math.hypot(x - qx, z - qz));
      }
    return d;
  }

  /**
   * Échelle d'un arbre (buisson, rocher) de portée `reach` posé en (x, z) : réduite pour que rien n'entre dans un bâtiment
   * voisin, quel que soit son âge ou la façon dont il est apparu ; 0 s'il n'y a pas la place (rabougri à moins de la moitié de
   * sa taille contre un mur, il ferait chétif : il ne pousse pas)
   */
  private fit(x: number, z: number, reach: number, sc: number) {
    const room = this.room(x, z);
    if (room >= reach * sc) return sc;
    return room >= reach * sc * 0.5 ? room / reach : 0;
  }

  /**
   * Buisson, à l'écart des murs : teinte de saison (palette, neige par le shader) sauf au désert et sous les tropiques ; au
   * printemps, certains fleurissent
   */
  private bush(x: number, y: number, z: number, rot: number, sc: number, b: number, bright: number, s: SeasonState) {
    const seasonal = b !== BIOME_DESERT && b !== BIOME_TROPICAL, layer = seasonal ? this.shrub : this.shrubDry;
    if (!layer || !(sc = this.fit(x, z, layer.reach, sc))) return;
    if (seasonal) layer.put(this.at(x, y, z, rot, sc), this.col.copy(SHRUB_TINT[b]).multiplyScalar(bright));
    else layer.put(this.at(x, y, z, rot, sc), this.col.copy(SHRUB_COLORS[b]).lerp(SNOWC, s.snow * 0.35 * snowy(b)).multiplyScalar(bright));
    const h = hash2(Math.floor(x * 11), Math.floor(z * 11), 1701);
    if (!seasonal || s.snow > 0.1 || h >= s.ground.shrubBloom) return;
    // fleurs posées sur le dessus et le pourtour du buisson, roses ou blanches selon le buisson
    const c = BUSH_BLOOM[Math.floor(hash2(Math.floor(x * 11), Math.floor(z * 11), 1702) * BUSH_BLOOM.length)];
    const n = 4 + Math.floor(h * 10) % 3;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * 6.28 + hash2(Math.floor(x * 11), i, 1703), r = (0.035 + 0.035 * (i % 2)) * sc;
      this.flowerC(x + Math.cos(a) * r, y + (0.135 - (i % 2) * 0.03) * sc - 0.04, z + Math.sin(a) * r, 0.5, c);
    }
  }

  /** Arbre à fleurs ? Par bosquets (bruit doux) plutôt qu'au hasard, dans la proportion voulue (seasonConfig.ts) */
  private blossomAt(x: number, z: number, h: number) {
    const g = SPECIES.blossomGroves, n = this.groveNoise.noise2(x * 0.11, z * 0.11) * 0.5 + 0.5;
    // le mélange resserre les valeurs vers le milieu : on les étire pour garder à peu près la part demandée
    return 0.5 + (n * g + h * (1 - g) - 0.5) * 1.9 < SPECIES.blossom;
  }

  /** Prairie fleurie autour de la case (0 … 1) : les fleurs sauvages poussent par taches plutôt qu'au hasard */
  private meadowZone(cx: number, cz: number) {
    return Math.min(1, Math.max(0, 0.5 + this.groveNoise.noise2(cx * 0.07 + 40, cz * 0.07 - 13) * 0.9));
  }

  /** Rocher posé au point le plus bas du sol sous lui : aucun bord ne flotte, même en pente */
  private placeRock(px: number, pz: number, sc: number, sy: number, h1: number, h2: number, c: THREE.Color) {
    const w = this.world;
    const r = this.rocks[Math.floor(h2 * this.rocks.length)];
    // un gros bloc contre un mur rapetisse (il garde ses proportions)
    const k = this.fit(px, pz, r.radius, sc) / sc;
    if (!k) return;
    sc *= k; sy *= k;
    const rr = r.radius * sc;
    let y = w.hAt(px, pz);
    for (const [ox, oz] of [[rr, 0], [-rr, 0], [0, rr], [0, -rr], [rr * 0.7, rr * 0.7], [-rr * 0.7, -rr * 0.7], [rr * 0.7, -rr * 0.7], [-rr * 0.7, rr * 0.7]]) y = Math.min(y, w.hAt(px + ox, pz + oz));
    r.layer.put(this.at(px, y - 0.01 * sy, pz, h1 * 6.28, sc, sy, sc), c);
  }

  private perch(x: number, y: number, z: number) { this.perches[Layer.chunk].push(x, y, z); }

  private flower(x: number, y: number, z: number, scale: number, hue: number, sat: number, light: number) {
    this.flowerC(x, y, z, scale, this.col.setHSL(hue, sat, light));
  }

  /** Fleur d'une couleur donnée (butinée par les abeilles) */
  private flowerC(x: number, y: number, z: number, scale: number, c: THREE.Color) {
    this.blossom.put(this.at(x, y, z, 0, scale), c);
    this.flowers[Layer.chunk].push(x, y + 0.08 * scale, z);
  }

  /**
   * Berge : roseaux à fleur d'eau (vert frais, paille l'automne, sous la neige l'hiver), quelques touffes d'herbe en haut de la
   * grève ; les fleurs du printemps y poussent aussi
   */
  private bank(cx: number, cz: number, avg: number, b: number, s: SeasonState, wild: boolean) {
    const w = this.world, col = this.col;
    // (pas au milieu d'une rivière peu profonde : seulement sur les cases surtout émergées)
    if (wild && avg > 0.02 && hash2(cx, cz, 1601) < s.ground.bankReeds * (b === BIOME_TROPICAL ? 0.4 : 1)) {
      const n = 1 + Math.floor(hash2(cx, cz, 1602) * 3);
      for (let i = 0; i < n; i++) {
        const px = cx + 0.1 + hash2(cx, cz, 1603 + i) * 0.8, pz = cz + 0.1 + hash2(cx, cz, 1607 + i) * 0.8, y = w.hAt(px, pz);
        if (y < SEA - 0.04 || y > SEA + 0.24 || this.room(px, pz) < 0.1) continue;
        const sc = 0.7 + hash2(cx, cz, 1611 + i) * 0.5;
        this.reed.put(this.at(px, y - 0.02, pz, hash2(cx, cz, 1615 + i) * 6.28, sc, sc * (0.45 + 0.45 * s.growth)),
          col.copy(s.ground.reed).multiplyScalar(0.85 + hash2(cx, cz, 1619 + i) * 0.25).lerp(SNOWC, s.snow * 0.5));
      }
    }
    if (avg < 0.16) return;
    const n = Math.floor(hash2(cx, cz, 1623) * 3);
    for (let i = 0; i < n; i++) {
      const px = cx + 0.1 + hash2(cx, cz, 1624 + i) * 0.8, pz = cz + 0.1 + hash2(cx, cz, 1628 + i) * 0.8, y = w.hAt(px, pz);
      if (y < SEA + 0.12) continue;
      const sc = 0.75 + hash2(cx, cz, 1632 + i) * 0.4;
      this.tuft.put(this.at(px, y - 0.01, pz, hash2(cx, cz, 1636 + i) * 6.28, sc, sc * 0.55 * s.ground.tuftHeight * (1 - s.snow * snowy(b) * 0.6), sc),
        col.copy(TUFT_TINT[b]).multiplyScalar(0.85 + hash2(cx, cz, 1640 + i) * 0.25));
    }
    if (b === BIOME_TEMPERATE && s.snow < 0.1 && hash2(cx, cz, 1644) < s.ground.flowerK * 0.18) {
      const c = pickPalette(s.ground.flowers, hash2(cx, cz, 1645));
      for (let i = 0; i < 2; i++) {
        const px = cx + 0.15 + hash2(cx, cz, 1646 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 1650 + i) * 0.7, y = w.hAt(px, pz);
        if (y > SEA + 0.15) this.flowerC(px, y - 0.03, pz, 0.5, c);
      }
    }
  }

  /** Arbre importé posé au sol, cime notée comme perchoir ; près d'un bâtiment, sa cime reste hors des murs */
  private tree(sp: Species, x: number, y: number, z: number, rot: number, sc: number, c: THREE.Color) {
    if (!(sc = this.fit(x, z, sp.layer.reach, sc))) return;
    sp.layer.put(this.at(x, y, z, rot, sc), c);
    this.perch(x, y + sp.height * sc + 0.01, z);
  }

  /** Forêt : essences du biome (feuillus et sapins, taïga enneigée, palmiers, cactus, saules du marais) */
  private forest(cx: number, cz: number, s: SeasonState) {
    const w = this.world, col = this.col, b = w.biome[w.ci(cx, cz)];
    // l'île du portail contaminée : arbres morts tordus et troncs calcinés
    if (this.blighted(cx, cz) > 0.2) { this.deadGrove(cx, cz); return; }
    const edgeDist = this.edge(cx, cz);
    const pick = <T,>(list: T[], h: number) => list[Math.floor(h * list.length)];
    // grands arbres importés : moins d'instances par case (une seule pour les palmiers et les cactus)
    const big = b === BIOME_TROPICAL || b === BIOME_DESERT;
    const cnt = big ? (hash2(cx, cz, 1) > 0.7 ? 2 : 1) : this.imported ? (hash2(cx, cz, 1) > 0.55 ? 2 : 1) : hash2(cx, cz, 1) > 0.45 ? 3 : 2;
    for (let k = 0; k < cnt; k++) {
      const px = cx + 0.12 + hash2(cx, cz, 10 + k) * 0.76, pz = cz + 0.12 + hash2(cx, cz, 20 + k) * 0.76;
      const y = w.hAt(px, pz);
      const sc = (0.75 + hash2(cx, cz, 30 + k) * 0.7) * (0.75 + 0.25 * smoothstep(0, 0.45, edgeDist(px, pz)));
      const rot = hash2(cx, cz, 50 + k) * 6.28, h = hash2(cx, cz, 40 + k), hv = hash2(cx, cz, 90 + k);
      col.setScalar(0.85 + hash2(cx, cz, 60 + k) * 0.25);
      if (b === BIOME_TROPICAL && this.palms.length) { this.tree(pick(this.palms, hv), px, y, pz, rot, sc * 0.95, col); continue; }
      if (b === BIOME_DESERT && this.cacti.length) {
        if (h < 0.12 && this.deadTrees.length) this.tree(this.deadTrees[0], px, y, pz, rot, sc * 0.8, col.setHex(0xb8a48c));
        else this.tree(pick(this.cacti, hv), px, y, pz, rot, sc * 0.9, col.multiplyScalar(1.15));
        continue;
      }
      if (b === BIOME_MARSH && this.willows.length && h < 0.72) {
        if (h < 0.2 && this.deadTrees.length) this.tree(this.deadTrees[0], px, y, pz, rot, sc, col.setHex(0xc8c0b4));
        else this.tree(this.willows[0], px, y, pz, rot, sc * 0.9, col);
        continue;
      }
      // taïga et hauteurs : sapins, souvent enneigés ; ailleurs un tiers de sapins parmi les bouleaux
      const isPine = h < (b === BIOME_TAIGA ? SPECIES.pineTaiga : this.pineVars.length ? SPECIES.pine : SPECIES.pineProcedural) || y > (this.imported ? 4.2 : 3.2);
      // sapins enneigés : sur les sommets, et partout en taïga quand l'hiver arrive
      if (isPine && this.snowPines.length && (y > 4.2 || (b === BIOME_TAIGA && s.snow > 0.3)) && hv < (y > 4.2 ? 0.75 : 0.6)) {
        this.tree(pick(this.snowPines, hv), px, y, pz, rot, sc, col);
      } else if (isPine && this.pineVars.length) {
        this.tree(pick(this.pineVars, hv), px, y, pz, rot, sc, col);
      } else if (isPine) {
        const f = this.fit(px, pz, this.pine.reach, sc);
        if (!f) continue;
        this.pine.put(this.at(px, y, pz, rot, f), col);
        this.trunk.put(this.dummy.matrix, col);
        this.perch(px, y + 0.85 * f, pz);
      } else this.broadleaf(px, y, pz, rot, sc, col, s, this.blossomAt(px, pz, hash2(cx, cz, 70 + k)));
    }
    this.forestFloor(cx, cz, b, s);
    // sous-bois (fougères sous les palmiers, broussailles sèches au désert)
    if (hash2(cx, cz, 5) < (b === BIOME_DESERT ? 0.3 : 0.7) && s.snow < 0.8) {
      const px = cx + 0.15 + hash2(cx, cz, 6) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 7) * 0.7;
      const sc = (0.8 + hash2(cx, cz, 9) * 0.6) * (b === BIOME_TROPICAL ? 1.4 : b === BIOME_DESERT ? 0.7 : 1);
      if (this.shrub) this.bush(px, w.hAt(px, pz), pz, hash2(cx, cz, 4) * 6.28, sc, b, 0.85 + hash2(cx, cz, 8) * 0.2, s);
      else this.plantAt(px, pz, 1.1 + hash2(cx, cz, 9) * 0.6, 0.8, hash2(cx, cz, 4) * 6.28, col.copy(SHRUB_COLORS[b]).lerp(SNOWC, s.snow * 0.35 * snowy(b)));
    }
  }

  /**
   * Feuillu, d'une essence tirée selon sa place : tronc et feuillage qui rétrécit à l'automne autour de son centre, branches nues
   * en plein hiver ; 40 % fleurissent (rose au printemps, orange en automne)
   */
  private broadleaf(px: number, y: number, pz: number, rot: number, sc: number, col: THREE.Color, s: SeasonState, blossom: boolean) {
    // chaque arbre a son rythme : à l'automne, certains se dégarnissent plus tôt ; l'hiver, quelques-uns gardent des feuilles sèches
    const leaf = Math.min(1, Math.max(0, s.leaf + (hash2(Math.floor(px * 13), Math.floor(pz * 13), 79) - 0.5) * s.trees.leafSpread));
    if (leaf < 0.5 && this.bare) { this.tree(this.bare, px, y, pz, rot, sc, col); return; }
    const t = this.leafy[Math.floor(hash2(Math.floor(px * 7), Math.floor(pz * 7), 77) * this.leafy.length)];
    // la cime d'été, la plus large, reste hors des murs voisins
    if (!(sc = this.fit(px, pz, Math.max(t.blob.reach, t.trunk.reach), sc))) return;
    t.trunk.put(this.at(px, y, pz, rot, sc), col);
    // la ramure rétrécit à mesure qu'elle se dégarnit ; les rares arbres qui gardent leurs feuilles sèches l'hiver gardent une
    // cime fournie (une boule minuscule au bout du tronc ferait une sucette)
    const size = Math.max(0.25, leaf, 0.72 * (1 - smoothstep(0.35, 0.6, s.leaf)));
    const ls = size * sc, lsy = ls * (0.8 + 0.2 * size);
    const m = this.at(px, y + t.leafY * (sc - lsy), pz, rot, ls, lsy, ls);
    (blossom ? t.blob : t.blob2).put(m, col);
    this.perch(px, y + t.leafTop * lsy + t.leafY * (sc - lsy) + 0.01, pz);
  }

  /** Sol de la forêt : fougères, champignons (surtout l'automne), souches et troncs moussus couchés */
  private forestFloor(cx: number, cz: number, b: number, s: SeasonState) {
    const w = this.world, col = this.col;
    if (b === BIOME_DESERT || s.snow * snowy(b) > 0.6) return;
    const h = hash2(cx, cz, 901), rot = hash2(cx, cz, 904) * 6.28;
    const px = cx + 0.15 + hash2(cx, cz, 902) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 903) * 0.7;
    const sc = 0.8 + hash2(cx, cz, 905) * 0.5;
    col.setScalar(0.88 + hash2(cx, cz, 906) * 0.18);
    if (h < 0.06 && this.logs && this.fit(px, pz, this.logs.reach, sc) === sc) this.logs.put(this.at(px, w.hAt(px, pz) - 0.015, pz, rot, sc), col);
    else if (h < 0.11 && this.stumps) this.stumps.put(this.at(px, w.hAt(px, pz) - 0.01, pz, rot, sc), col);
    // fougères : denses sous les palmiers, absentes des marais
    const nf = b === BIOME_MARSH || !this.ferns ? 0 : hash2(cx, cz, 907) < (b === BIOME_TROPICAL ? 0.75 : 0.45) ? 1 + Math.floor(hash2(cx, cz, 908) * 2) : 0;
    for (let i = 0; i < nf; i++) {
      const fx = cx + 0.1 + hash2(cx, cz, 910 + i) * 0.8, fz = cz + 0.1 + hash2(cx, cz, 914 + i) * 0.8;
      const fs = (0.8 + hash2(cx, cz, 918 + i) * 0.5) * (b === BIOME_TROPICAL ? 1.3 : 1);
      this.ferns!.put(this.at(fx, w.hAt(fx, fz) - 0.01, fz, hash2(cx, cz, 922 + i) * 6.28, fs, fs * (0.6 + 0.4 * s.leaf)), col.copy(FERN_TINT[b]).multiplyScalar(0.85 + hash2(cx, cz, 926 + i) * 0.25));
    }
    // champignons en petits groupes, plus nombreux à l'automne
    if (this.mushrooms && hash2(cx, cz, 930) < s.ground.mushrooms) {
      const m = 1 + Math.floor(hash2(cx, cz, 931) * 3), brown = hash2(cx, cz, 932) < 0.4;
      const mx = cx + 0.2 + hash2(cx, cz, 933) * 0.6, mz = cz + 0.2 + hash2(cx, cz, 934) * 0.6;
      for (let i = 0; i < m; i++) {
        const qx = mx + (hash2(cx, cz, 935 + i) - 0.5) * 0.14, qz = mz + (hash2(cx, cz, 939 + i) - 0.5) * 0.14;
        const ms = 0.6 + hash2(cx, cz, 943 + i) * 0.7;
        this.mushrooms.put(this.at(qx, w.hAt(qx, qz) - 0.005, qz, hash2(cx, cz, 947 + i) * 6.28, ms), brown ? BOLETE : WHITE);
      }
    }
    // tas de feuilles mortes à l'automne, aux couleurs des arbres (pas sous les palmiers)
    if (s.ground.leafPiles > 0.03 && b !== BIOME_TROPICAL && hash2(cx, cz, 960) < s.ground.leafPiles) {
      const n = 1 + Math.floor(hash2(cx, cz, 961) * 3);
      for (let i = 0; i < n; i++) {
        const lx = cx + 0.12 + hash2(cx, cz, 962 + i) * 0.76, lz = cz + 0.12 + hash2(cx, cz, 966 + i) * 0.76, ls = 0.9 + hash2(cx, cz, 970 + i) * 0.9;
        col.copy(pickPalette(s.fx.leafColors, hash2(cx, cz, 978 + i))).multiplyScalar(0.85 + hash2(cx, cz, 982 + i) * 0.25);
        this.plant.put(this.at(lx, w.hAt(lx, lz) - 0.02, lz, hash2(cx, cz, 974 + i) * 6.28, ls * 1.3, ls * 0.32, ls), col);
      }
    }
  }

  /**
   * Parcelle (champ ou jardin) contenant la case : sens de ses sillons, le même sur toute la parcelle mais propre à chacune,
   * comme dans un bocage
   */
  private plotAngle = new Map<number, number>();
  private plotNoise = new Simplex(4242);
  private angleOf(cx: number, cz: number) {
    const w = this.world, k0 = w.ci(cx, cz), known = this.plotAngle.get(k0);
    if (known !== undefined) return known;
    const t = w.veg[k0], cells = [k0], seen = new Set(cells);
    for (let i = 0; i < cells.length && cells.length < 400; i++) {
      const x = cells[i] % N, z = Math.floor(cells[i] / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (w.inCells(nx, nz) && w.veg[k] === t && !seen.has(k)) { seen.add(k); cells.push(k); }
      }
    }
    const first = Math.min(...cells), a = (hash2(first % N, Math.floor(first / N), 77) - 0.5) * Math.PI;
    for (const k of cells) this.plotAngle.set(k, a);
    return a;
  }

  /**
   * Couverture organique d'une culture au point : part des cases de la même culture alentour (interpolée, coins arrondis),
   * bordure ondulée par un bruit ; on plante là où elle dépasse ½
   */
  private cover(t: number, px: number, pz: number) {
    const w = this.world, fx = px - 0.5, fz = pz - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    const at = (x: number, z: number) => (w.inCells(x, z) && w.veg[w.ci(x, z)] === t ? 1 : 0);
    const c = (at(ix, iz) * (1 - u) + at(ix + 1, iz) * u) * (1 - v) + (at(ix, iz + 1) * (1 - u) + at(ix + 1, iz + 1) * u) * v;
    return c + this.plotNoise.noise2(px * 0.8, pz * 0.8) * 0.2 + this.plotNoise.noise2(px * 2.1 + 9, pz * 2.1) * 0.08;
  }

  /** Points d'une case le long des sillons de sa parcelle : (x, z, rang, place dans le rang), espacements en cases */
  private furrows(cx: number, cz: number, rowGap: number, step: number, cb: (px: number, pz: number, row: number, col: number) => void) {
    const a = this.angleOf(cx, cz), ca = Math.cos(a), sa = Math.sin(a);
    // repère tourné commun à toute la parcelle : u le long des sillons, v en travers
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of [[cx, cz], [cx + 1, cz], [cx, cz + 1], [cx + 1, cz + 1]]) {
      const u = x * ca + z * sa, v = -x * sa + z * ca;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    for (let r = Math.floor(v0 / rowGap); r * rowGap <= v1; r++)
      for (let c = Math.floor(u0 / step); c * step <= u1; c++) {
        const v = (r + 0.5) * rowGap, u = (c + 0.5 + (hash2(r, c, 131) - 0.5) * 0.45) * step;
        const px = u * ca - v * sa, pz = u * sa + v * ca;
        if (px < cx || px >= cx + 1 || pz < cz || pz >= cz + 1) continue;
        cb(px, pz, r, c);
      }
  }

  private field(cx: number, cz: number, s: SeasonState) {
    if (s.growth < 0.12) return;
    const w = this.world, t = w.veg[w.ci(cx, cz)];
    this.furrows(cx, cz, 1 / WHEAT_DIV, 1 / WHEAT_DIV, (px, pz, gx, gz) => {
      const cov = this.cover(t, px, pz);
      if (cov < 0.5) return;
      const sc = s.growth * (0.82 + hash2(gx, gz, 103) * 0.3) * (0.65 + 0.35 * smoothstep(0.5, 0.8, cov));
      this.wheat.put(this.at(px, w.hAt(px, pz) - 0.01, pz, hash2(gx, gz, 104) * 6.28, 0.9 + hash2(gx, gz, 105) * 0.3, sc, 0.9 + hash2(gx, gz, 106) * 0.3), this.col.setScalar(0.88 + hash2(gx, gz, 107) * 0.2));
    });
  }

  /** Rocaille : deux à quatre blocs, dont au moins un gros, et des cailloux */
  private rockery(cx: number, cz: number, s: SeasonState) {
    const b = this.world.biome[this.world.ci(cx, cz)];
    const n = 2 + Math.floor(hash2(cx, cz, 401) * 3);
    for (let i = 0; i < n; i++) {
      const px = cx + 0.15 + hash2(cx, cz, 402 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 410 + i) * 0.7;
      const sc = i === 0 || hash2(cx, cz, 418 + i) < 0.4 ? 2 + hash2(cx, cz, 426 + i) * 2.2 : 0.7 + hash2(cx, cz, 434 + i) * 0.8;
      this.col.setScalar(0.82 + hash2(cx, cz, 474 + i) * 0.3);
      // grès rosé au désert
      if (b === BIOME_DESERT) this.col.multiply(DESERT_ROCK);
      this.col.lerp(SNOWC, s.snow * 0.75 * snowy(b));
      this.placeRock(px, pz, sc, sc * (0.7 + hash2(cx, cz, 466 + i) * 0.5), hash2(cx, cz, 450 + i), hash2(cx, cz, 458 + i), this.col);
    }
  }

  /**
   * Lit de cailloux (force `k`) : de gros blocs facettés gris et bruns qui sortent de l'eau peu profonde, des dalles plates
   * claires (de glace l'hiver), des cailloux ; enneigés selon la saison et le biome. Rien sous 0,5 de fond
   */
  private riverbed(cx: number, cz: number, k: number, b: number, s: SeasonState) {
    const w = this.world, col = this.col, h = (i: number) => hash2(cx, cz, 950 + i);
    const n = Math.round((3 + h(0) * 3) * (0.35 + 0.65 * k)), snow = s.snow * 0.7 * snowy(b);
    for (let i = 0; i < n; i++) {
      const px = cx + 0.1 + h(1 + i) * 0.8, pz = cz + 0.1 + h(9 + i) * 0.8, y = w.hAt(px, pz);
      if (y < -0.5) continue;
      // (assez hauts pour sortir de l'eau : le fond est vers -0,2)
      const r = h(17 + i), big = i < 2 && h(25 + i) < (i ? 0.35 : 0.2 + 0.6 * k), slab = !big && h(27 + i) < 0.3;
      const sc = big ? 3.8 + r * 2.4 : slab ? 2.8 + r * 2 : 1.4 + r * 1.6;
      const sy = big ? sc * (2.6 + h(35 + i)) : slab ? sc * 1.7 : sc * (2.4 + h(35 + i));
      if (slab) {
        // dalle claire, bleutée de glace quand l'eau gèle
        col.setScalar(1.05 + h(42 + i) * 0.12).lerp(ICE_SLAB, s.iceNow * 0.7).lerp(SNOWC, snow * 0.5);
      } else {
        col.setScalar(0.74 + h(42 + i) * 0.34);
        if (h(50 + i) < 0.5) col.multiply(BED_BROWN);
        col.lerp(SNOWC, snow);
      }
      this.placeRock(px, pz, sc, sy, h(58 + i), h(66 + i), col);
    }
  }

  /**
   * Eau près du rivage : une case de terre ferme (ou de lac) à `r` cases au plus. Nénuphars, roseaux et algues n'y poussent
   * que là, jamais en pleine mer (sur les hauts-fonds du récif, au large)
   */
  private nearShore(cx: number, cz: number, r: number) {
    const w = this.world;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (w.inCells(x, z) && (w.cellAvg(x, z) > SEA + 0.02 || w.lake[w.ci(x, z)])) return true;
      }
    return false;
  }

  /** Fond marin : laminaires qui ondulent sous la surface (près du rivage), coraux colorés sur les hauts-fonds */
  private seabed(cx: number, cz: number, depth: number, s: SeasonState) {
    const w = this.world, col = this.col;
    if (s.snow > 0.9) return;
    if (depth > 0.3 && depth < 2.2 && hash2(cx, cz, 601) < 0.3 && this.nearShore(cx, cz, 3)) {
      const n = 2 + Math.floor(hash2(cx, cz, 602) * 3);
      for (let i = 0; i < n; i++) {
        const px = cx + 0.15 + hash2(cx, cz, 603 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 610 + i) * 0.7;
        const y = w.hAt(px, pz);
        const tall = Math.max(0.15, -y - 0.12) * (0.6 + hash2(cx, cz, 624 + i) * 0.35);
        const wd = this.seaweed ? 0.45 : 1;
        col.setScalar(0.8 + hash2(cx, cz, 631 + i) * 0.35);
        (this.seaweed ?? this.kelp).put(this.at(px, y, pz, hash2(cx, cz, 617 + i) * 6.28, wd, tall, wd), col);
      }
    }
    // coraux : mers chaudes et tempérées, pas dans les mares ni les eaux froides
    const b = w.biome[w.ci(cx, cz)];
    if (b !== BIOME_MARSH && b !== BIOME_TAIGA && depth > 0.15 && depth < 1.1 && hash2(cx, cz, 640) < (b === BIOME_TROPICAL ? 0.4 : 0.22)) {
      const n = 1 + Math.floor(hash2(cx, cz, 641) * 2);
      for (let i = 0; i < n; i++) {
        const px = cx + 0.2 + hash2(cx, cz, 642 + i) * 0.6, pz = cz + 0.2 + hash2(cx, cz, 646 + i) * 0.6;
        const m = this.at(px, w.hAt(px, pz) - 0.01, pz, hash2(cx, cz, 650 + i) * 6.28, 0.8 + hash2(cx, cz, 654 + i) * 0.7);
        const v = hash2(cx, cz, 658 + i);
        if (this.corals.length) this.corals[Math.floor(v * this.corals.length)].put(m);
        else this.coral.put(m, CORAL_COLORS[Math.floor(v * CORAL_COLORS.length)]);
      }
    }
  }

  /**
   * Case libre : touffes d'herbe (plus rares là où les bêtes ont brouté), fleurs sauvages (semées par les abeilles),
   * cailloux ; roseaux et nénuphars au marais, cactus nains et broussailles au désert
   */
  private meadow(cx: number, cz: number, s: SeasonState) {
    const w = this.world, col = this.col, k = w.ci(cx, cz);
    if (w.occ[k] || w.road[k] || w.lake[k]) return;
    const avg = w.cellAvg(cx, cz), slope = w.cellSlope(cx, cz), b = w.biome[k];
    // lit de cailloux de l'amont de la rivière : seulement là où il est peu profond (pas sur un chenal creusé, ni sur une
    // ancienne partie au chenal profond) ; la rive garde ensuite son herbe
    if (w.bed[k] && avg > -0.6 && avg < 0.4) {
      this.riverbed(cx, cz, w.bed[k] / 255, b, s);
      if (avg < 0.12) return;
    }
    // marais : roseaux sur les berges et dans l'eau peu profonde, nénuphars sur les mares (au bord, jamais au large)
    if (b === BIOME_MARSH && avg > -0.7 && avg < 0.7 && s.snow < 0.85 && (avg > SEA + 0.02 || this.nearShore(cx, cz, 2))) {
      if (avg < 0.02 && hash2(cx, cz, 701) < 0.45) {
        const n = 1 + Math.floor(hash2(cx, cz, 702) * 3);
        for (let i = 0; i < n; i++) {
          const px = cx + 0.15 + hash2(cx, cz, 703 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 707 + i) * 0.7;
          if (w.hAt(px, pz) > SEA - 0.08) continue;
          this.lily.put(this.at(px, SEA + 0.01, pz, hash2(cx, cz, 711 + i) * 6.28, 0.7 + hash2(cx, cz, 715 + i) * 0.6), col.setScalar(0.9 + hash2(cx, cz, 719 + i) * 0.2));
        }
      }
      if (avg > -0.35 && hash2(cx, cz, 721) < 0.7) {
        const n = 2 + Math.floor(hash2(cx, cz, 722) * 4);
        for (let i = 0; i < n; i++) {
          const px = cx + 0.1 + hash2(cx, cz, 723 + i) * 0.8, pz = cz + 0.1 + hash2(cx, cz, 727 + i) * 0.8;
          const y = w.hAt(px, pz);
          if (y < SEA - 0.3) continue;
          const sc = 1 + hash2(cx, cz, 731 + i) * 0.6;
          this.reed.put(this.at(px, y - 0.02, pz, hash2(cx, cz, 735 + i) * 6.28, sc, sc * (0.5 + 0.5 * s.growth + 0.3)), col.setScalar(0.85 + hash2(cx, cz, 739 + i) * 0.25).lerp(SNOWC, s.snow * 0.5));
        }
      }
    }
    if (avg < -0.12) { this.seabed(cx, cz, -avg, s); return; }
    // berges (rivières, lacs, côtes) : roseaux au bord de l'eau, quelques touffes en haut de la grève ; rien sur l'île contaminée,
    // et pas de roseaux sur une case défrichée à la gomme
    const bk = this.blighted(cx, cz);
    if (avg < 0.32 && slope <= 1.1 && bk <= 0.15 && b !== BIOME_DESERT && b !== BIOME_MARSH && s.snow * snowy(b) < 0.7) this.bank(cx, cz, avg, b, s, !w.cleared[k]);
    if (avg < 0.12) return;
    // l'île du portail contaminée : herbe brûlée, rochers d'obsidienne
    if (bk > 0.15 && slope <= 1.4) { this.ashland(cx, cz, bk); return; }
    const rough = avg < 0.32 || slope > 0.9;
    const stones = b === BIOME_DESERT || b === BIOME_TAIGA ? 0.04 : 0.012;
    // case défrichée à la gomme : ni arbre isolé, ni buisson, ni caillou (l'herbe et les fleurs restent)
    const wild = !w.cleared[k];
    if (wild && slope <= 1.4 && hash2(cx, cz, 301) < (rough ? 0.1 : stones)) {
      const px = cx + 0.15 + hash2(cx, cz, 302) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 303) * 0.7;
      // blocs plus gros sur les pentes raides et en montagne
      const sc = slope > 1.2 || avg > 4 ? 1.4 + hash2(cx, cz, 307) * 1.8 : 0.6 + hash2(cx, cz, 307) * 0.9;
      col.setScalar(0.85 + hash2(cx, cz, 308) * 0.25);
      if (b === BIOME_DESERT) col.multiply(DESERT_ROCK);
      col.lerp(SNOWC, Math.max(s.snow * 0.8 * snowy(b), smoothstep(SNOW_LINE[0], SNOW_LINE[1], avg) * 0.75));
      this.placeRock(px, pz, sc, sc, hash2(cx, cz, 305), hash2(cx, cz, 309), col);
    }
    // ni herbe ni fleurs sur les neiges éternelles, ni sur un champ de lave encore nu
    if (avg < 0.32 || avg > SNOW_LINE[0] || slope > 1.3 || w.basalt[k] > 0.45 || this.scorched(cx + 0.5, cz + 0.5)) return;
    if (b === BIOME_DESERT) {
      // désert : cactus nains, broussailles sèches et rares touffes jaunies
      const h = hash2(cx, cz, 801);
      const px = cx + 0.2 + hash2(cx, cz, 802) * 0.6, pz = cz + 0.2 + hash2(cx, cz, 803) * 0.6, y = w.hAt(px, pz);
      if (wild && h < 0.07 && this.cacti.length) {
        const cactus = this.cacti[Math.floor(hash2(cx, cz, 804) * this.cacti.length)].layer, sc = this.fit(px, pz, cactus.reach, 0.4 + hash2(cx, cz, 806) * 0.3);
        if (sc) cactus.put(this.at(px, y, pz, hash2(cx, cz, 805) * 6.28, sc), col.setScalar(1.1));
      } else if (wild && h < 0.17 && this.shrub) this.bush(px, y, pz, hash2(cx, cz, 805) * 6.28, 0.6 + hash2(cx, cz, 806) * 0.5, BIOME_DESERT, 1, s);
      else if (h < 0.4 && s.snow < 0.6) this.tuft.put(this.at(px, y - 0.01, pz, hash2(cx, cz, 805) * 6.28, 0.9, 0.5, 0.9), col.copy(TUFT_TINT[BIOME_DESERT]));
      // ossements blanchis par le soleil, cailloux de grès
      const h2 = hash2(cx, cz, 811), qx = cx + 0.15 + hash2(cx, cz, 812) * 0.7, qz = cz + 0.15 + hash2(cx, cz, 813) * 0.7;
      if (!wild) return;
      if (h2 < 0.014 && this.bones.length) this.bones[Math.floor(hash2(cx, cz, 814) * this.bones.length)].put(this.at(qx, w.hAt(qx, qz) - 0.006, qz, hash2(cx, cz, 815) * 6.28, 0.8 + hash2(cx, cz, 816) * 0.5), col.setScalar(1));
      else if (h2 < 0.14) {
        const n = 1 + Math.floor(hash2(cx, cz, 817) * 3);
        for (let i = 0; i < n; i++) {
          const sc = 0.35 + hash2(cx, cz, 818 + i) * 0.45;
          this.placeRock(qx + (hash2(cx, cz, 822 + i) - 0.5) * 0.3, qz + (hash2(cx, cz, 826 + i) - 0.5) * 0.3, sc, sc * 0.8, hash2(cx, cz, 830 + i), hash2(cx, cz, 834 + i), col.setScalar(0.9 + hash2(cx, cz, 838 + i) * 0.2).multiply(DESERT_ROCK));
        }
      }
      return;
    }
    // la neige couvre l'herbe ; les tropiques n'en ont presque jamais
    if (s.snow * snowy(b) > 0.6) return;
    const g = w.grazed[k];
    const base = b === BIOME_TAIGA ? 1 : b === BIOME_TROPICAL ? 3 : 2;
    // prairie dense : un tapis d'herbe haute (les touffes s'effacent au loin, voir DETAIL_DIST)
    const n = Math.round((base + Math.floor(hash2(cx, cz, 310) * 4)) * 2.6 * (1 - g * 0.85));
    const lush = b === BIOME_TROPICAL ? 1.15 : 1;
    for (let i = 0; i < n; i++) {
      const px = cx + 0.02 + hash2(cx, cz, 2000 + i * 5) * 0.96, pz = cz + 0.02 + hash2(cx, cz, 2001 + i * 5) * 0.96;
      const sc = (0.9 + hash2(cx, cz, 2002 + i * 5) * 0.5) * lush;
      this.tuft.put(this.at(px, w.hAt(px, pz) - 0.01, pz, hash2(cx, cz, 2003 + i * 5) * 6.28, sc, sc * 0.62 * s.ground.tuftHeight * (1 - s.snow * snowy(b) * 0.6) * (1 - g * 0.5), sc),
        col.copy(TUFT_TINT[b]).multiplyScalar(0.85 + hash2(cx, cz, 2004 + i * 5) * 0.25));
    }
    this.meadowDetails(cx, cz, b, slope, s, wild);
    // fougères sous les tropiques
    if (wild && b === BIOME_TROPICAL && this.shrub && hash2(cx, cz, 390) < 0.12) {
      const px = cx + 0.2 + hash2(cx, cz, 391) * 0.6, pz = cz + 0.2 + hash2(cx, cz, 392) * 0.6;
      this.bush(px, w.hAt(px, pz), pz, hash2(cx, cz, 393) * 6.28, 1 + hash2(cx, cz, 394) * 0.5, BIOME_TROPICAL, 1, s);
    }
    // fleurs : plus nombreuses là où les abeilles ont butiné, broutées par les troupeaux. Dans les biomes à saisons, par
    // prairies (taches), surtout au printemps et aux couleurs de la saison ; ailleurs, aux couleurs du biome
    const seasonal = b !== BIOME_DESERT && b !== BIOME_TROPICAL;
    const flowers = s.snow < 0.1 && (seasonal ? s.ground.flowerK > 0.02 : s.growth > 0.5);
    const zone = seasonal ? s.ground.flowerK * (0.25 + 1.5 * this.meadowZone(cx, cz)) : 1;
    const chance = ([0.2, 0.08, 0, 0.32, 0.15][b] + w.bloom[k] * 0.6) * (1 - g * 0.8) * zone;
    if (flowers && hash2(cx, cz, 330) < chance) {
      const m = 1 + Math.floor(hash2(cx, cz, 331) * 3) + Math.round(w.bloom[k] * 2) + (zone > 1.2 ? 1 : 0);
      const hues = WILD_HUES[b];
      const hue = hues[Math.floor(hash2(cx, cz, 332) * hues.length)];
      const own = b === BIOME_TEMPERATE ? pickPalette(s.ground.flowers, hash2(cx, cz, 332)) : null;
      for (let i = 0; i < m; i++) {
        const px = cx + 0.15 + hash2(cx, cz, 333 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 337 + i) * 0.7;
        if (own) this.flowerC(px, w.hAt(px, pz) - 0.03, pz, 0.55, own);
        else this.flower(px, w.hAt(px, pz) - 0.03, pz, 0.55, hue, hue === 0.58 ? 0.1 : 0.8, hue === 0.58 ? 0.96 : 0.68);
      }
    }
    // l'île purifiée : des fleurs vives repoussent dans les halos des défenses
    const pu = this.blight && w.onPortalIsland(cx, cz) ? purityAt(this.blight, cx + 0.5, cz + 0.5) * (1 - bk * 4) : 0;
    if (pu > 0.25 && s.snow < 0.3 && hash2(cx, cz, 1501) < pu * 0.7) {
      const m = 2 + Math.floor(hash2(cx, cz, 1502) * 3), hue = PURE_HUES[Math.floor(hash2(cx, cz, 1503) * PURE_HUES.length)];
      for (let i = 0; i < m; i++) {
        const px = cx + 0.12 + hash2(cx, cz, 1504 + i) * 0.76, pz = cz + 0.12 + hash2(cx, cz, 1510 + i) * 0.76;
        if (this.room(px, pz) < 0.05) continue;
        this.flower(px, w.hAt(px, pz) - 0.03, pz, 0.6, hue, hue === 0.58 ? 0.1 : 0.85, hue === 0.58 ? 0.96 : 0.66);
      }
    }
  }

  /** Contamination de l'île du portail au milieu d'une case (0 ailleurs) */
  private blighted(cx: number, cz: number) {
    return this.blight ? blightAt(this.blight, cx + 0.5, cz + 0.5) : 0;
  }

  /** Bosquet contaminé : arbres morts tordus, noir violacé, et troncs calcinés ; un bloc d'obsidienne de temps en temps */
  private deadGrove(cx: number, cz: number) {
    const w = this.world, col = this.col, cnt = hash2(cx, cz, 1) > 0.5 ? 2 : 1;
    for (let k = 0; k < cnt; k++) {
      const px = cx + 0.15 + hash2(cx, cz, 10 + k) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 20 + k) * 0.7, y = w.hAt(px, pz);
      const sc = 0.7 + hash2(cx, cz, 30 + k) * 0.5, rot = hash2(cx, cz, 50 + k) * 6.28;
      col.copy(DEAD_WOOD).multiplyScalar(0.8 + hash2(cx, cz, 60 + k) * 0.35);
      if (this.deadTrees.length && hash2(cx, cz, 40 + k) < 0.7) { this.tree(this.deadTrees[0], px, y, pz, rot, sc, col); continue; }
      // tronc calciné : le fût d'un feuillu, sans feuillage, couché un peu de travers
      const f = this.fit(px, pz, this.trunk.reach, sc * 0.8);
      if (f) this.trunk.put(this.at(px, y - 0.02, pz, rot, f, f * (0.45 + hash2(cx, cz, 70 + k) * 0.3), f), col.copy(CHARRED));
    }
    if (hash2(cx, cz, 80) < 0.25) this.obsidian(cx, cz, 81);
  }

  /** Lande contaminée : rares touffes d'herbe brûlée, cailloux et blocs d'obsidienne */
  private ashland(cx: number, cz: number, bk: number) {
    const w = this.world, col = this.col;
    const n = Math.round((1 + Math.floor(hash2(cx, cz, 310) * 3)) * (1.2 - bk));
    for (let i = 0; i < n; i++) {
      const px = cx + 0.1 + hash2(cx, cz, 340 + i) * 0.8, pz = cz + 0.1 + hash2(cx, cz, 350 + i) * 0.8, sc = 0.8 + hash2(cx, cz, 370 + i) * 0.4;
      this.tuft.put(this.at(px, w.hAt(px, pz) - 0.01, pz, hash2(cx, cz, 360 + i) * 6.28, sc, sc * 0.45, sc), col.copy(BURNT_GRASS).multiplyScalar(0.8 + hash2(cx, cz, 380 + i) * 0.3));
    }
    if (hash2(cx, cz, 301) < 0.05 + bk * 0.1) this.obsidian(cx, cz, 302);
  }

  /** Bloc d'obsidienne (noir, reflets violets) : le plus souvent un gros, parfois deux petits */
  private obsidian(cx: number, cz: number, salt: number) {
    const n = hash2(cx, cz, salt) < 0.6 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const px = cx + 0.2 + hash2(cx, cz, salt + 1 + i) * 0.6, pz = cz + 0.2 + hash2(cx, cz, salt + 3 + i) * 0.6;
      const sc = n === 1 ? 1 + hash2(cx, cz, salt + 5) * 1.3 : 0.5 + hash2(cx, cz, salt + 6 + i) * 0.5;
      this.placeRock(px, pz, sc, sc * (1 + hash2(cx, cz, salt + 8 + i) * 0.5), hash2(cx, cz, salt + 10 + i), hash2(cx, cz, salt + 12 + i), this.col.copy(OBSIDIAN).multiplyScalar(0.85 + hash2(cx, cz, salt + 14 + i) * 0.3));
    }
  }

  /**
   * Détails des prairies : arbres isolés, buissons, fougères, champignons, cailloux et touffes de fleurs ; `wild` faux (case
   * défrichée à la gomme) : seulement les fleurs
   */
  private meadowDetails(cx: number, cz: number, b: number, slope: number, s: SeasonState, wild: boolean) {
    const w = this.world, col = this.col;
    const h = wild ? hash2(cx, cz, 820) : 1, rot = hash2(cx, cz, 823) * 6.28;
    const qx = cx + 0.2 + hash2(cx, cz, 821) * 0.6, qz = cz + 0.2 + hash2(cx, cz, 822) * 0.6, qy = w.hAt(qx, qz);
    const lone = LONE_TREE[b];
    const sc = 0.75 + hash2(cx, cz, 824) * 0.35;
    col.setScalar(0.85 + hash2(cx, cz, 825) * 0.25);
    if (h < lone && slope < 1) {
      // arbre isolé de l'essence du biome
      const pick = <T,>(list: T[]) => list[Math.floor(hash2(cx, cz, 826) * list.length)];
      if (b === BIOME_TROPICAL && this.palms.length) this.tree(pick(this.palms), qx, qy, qz, rot, sc, col);
      else if (b === BIOME_MARSH && this.willows.length) this.tree(this.willows[0], qx, qy, qz, rot, sc * 0.9, col);
      else if ((b === BIOME_TAIGA || hash2(cx, cz, 827) < SPECIES.lonePine) && this.pineVars.length) this.tree(pick(this.pineVars), qx, qy, qz, rot, sc, col);
      else this.broadleaf(qx, qy, qz, rot, sc, col, s, this.blossomAt(qx, qz, hash2(cx, cz, 828)));
    } else if (h < lone + 0.055 && this.shrub && b !== BIOME_MARSH && s.snow < 0.8) {
      this.bush(qx, qy, qz, rot, 0.7 + hash2(cx, cz, 829) * 0.6, b, 0.9 + hash2(cx, cz, 830) * 0.2, s);
    } else if (h < lone + 0.085 && this.ferns && b !== BIOME_MARSH && s.snow * snowy(b) < 0.5) {
      this.ferns.put(this.at(qx, qy - 0.01, qz, rot, sc, sc * (0.6 + 0.4 * s.leaf)), col.copy(FERN_TINT[b]));
    } else if (h < lone + 0.1 && this.mushrooms && s.snow < 0.5) {
      this.mushrooms.put(this.at(qx, qy - 0.005, qz, rot, 0.6 + hash2(cx, cz, 831) * 0.6), hash2(cx, cz, 832) < 0.5 ? BOLETE : WHITE);
    } else if (h < lone + 0.15) {
      // cailloux épars
      const n = 1 + Math.floor(hash2(cx, cz, 833) * 2);
      for (let i = 0; i < n; i++) {
        const ps = 0.35 + hash2(cx, cz, 834 + i) * 0.4;
        this.placeRock(qx + (hash2(cx, cz, 838 + i) - 0.5) * 0.3, qz + (hash2(cx, cz, 842 + i) - 0.5) * 0.3, ps, ps * 0.8, hash2(cx, cz, 846 + i), hash2(cx, cz, 850 + i), col.setScalar(0.88 + hash2(cx, cz, 854 + i) * 0.2).lerp(SNOWC, s.snow * 0.8 * snowy(b)));
      }
    }
    // touffes de fleurs des champs (modèles), butinées comme les autres
    const bloomK = b === BIOME_TEMPERATE ? Math.min(1.5, s.ground.flowerK) * (0.3 + 1.2 * this.meadowZone(cx, cz)) : s.growth > 0.4 ? 1 : 0;
    if (this.wildFlowers.length && b !== BIOME_TAIGA && s.snow < 0.1 && hash2(cx, cz, 860) < (0.1 + w.bloom[w.ci(cx, cz)] * 0.2) * bloomK) {
      const layer = this.wildFlowers[Math.floor(hash2(cx, cz, 861) * this.wildFlowers.length)];
      const n = 2 + Math.floor(hash2(cx, cz, 862) * 3);
      for (let i = 0; i < n; i++) {
        const fx = cx + 0.15 + hash2(cx, cz, 863 + i) * 0.7, fz = cz + 0.15 + hash2(cx, cz, 867 + i) * 0.7, fy = w.hAt(fx, fz);
        layer.put(this.at(fx, fy - 0.005, fz, hash2(cx, cz, 871 + i) * 6.28, 0.8 + hash2(cx, cz, 875 + i) * 0.5));
        this.flowers[Layer.chunk].push(fx, fy + 0.08, fz);
      }
    }
  }

  private scorched(x: number, z: number) {
    return this.volcanoes.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 5);
  }

  // ---------- Décors uniques ----------

  /** Grottes, failles, épaves, volcans (lave et fumée) de toute la carte */
  /** Un décor unique (grotte, faille, volcan, épave) ou son emprise à moins de trois cases de la zone ? */
  private specialNear(r: [number, number, number, number]) {
    const w = this.world;
    for (let cz = Math.max(0, r[1] - 3); cz <= Math.min(N - 1, r[3] + 3); cz++)
      for (let cx = Math.max(0, r[0] - 3); cx <= Math.min(N - 1, r[2] + 3); cx++) { const k = w.ci(cx, cz); if (w.veg[k] >= VEG_CAVE || w.decor[k]) return true; }
    return false;
  }

  private rebuildSpecial() {
    const w = this.world, d = this.dummy, col = this.col, s = this.season;
    let nWr = 0, nL = 0, nSm = 0, nSp = 0;
    const caveGeos: THREE.BufferGeometry[] = [], crackGeos: THREE.BufferGeometry[] = [], glowGeos: THREE.BufferGeometry[] = [], lavaGeos: THREE.BufferGeometry[] = [];
    const at = (x: number, z: number) => w.hAt(x, z);
    this.volcanoes = [];
    for (let k = 0; k < N * N; k++) {
      const t = w.veg[k];
      if (t < VEG_CAVE) continue;
      const cx = k % N, cz = Math.floor(k / N);
      if (t === VEG_CAVE) {
        // roche du biome ; mousse (ou sable) puis neige de saison sur le sommet
        const b = w.biome[k], snow = s ? Math.min(1, s.snow * snowy(b) * 1.1) : 0;
        const top = col.copy(CAVE_TOP[b]).lerp(SNOWC, snow);
        caveGeos.push(caveMoundGeo(w.caveFrame(cx, cz), at, CAVE_ROCK[b], top, Math.max(b === BIOME_DESERT ? 0.5 : 0.75, snow), hash2(cx, cz, 560)));
      } else if (t === VEG_WRECK && nWr < MAX_SPECIAL) {
        // coque échouée, à moitié enfoncée ; le modèle est déjà brisé : il gîte à peine
        const px = cx + 0.5, pz = cz + 0.5;
        d.position.set(px, w.hAt(px, pz) - (this.wreckModel ? 0.1 : 0.06), pz);
        d.rotation.set(0, hash2(cx, cz, 501) * 6.28, this.wreckModel ? 0.08 : 0.22 + hash2(cx, cz, 502) * 0.15, 'YXZ');
        d.scale.setScalar(this.wreckModel ? 1 : 1.1);
        d.updateMatrix();
        this.wreck.setMatrixAt(nWr, d.matrix);
        this.wreck.setColorAt(nWr++, col.setScalar(0.9 + hash2(cx, cz, 503) * 0.15));
      } else if (t === VEG_VOLCANO && nL < MAX_SPECIAL) {
        this.volcanoes.push([cx + 0.5, cz + 0.5]);
        // lac de lave : il remplit la cuvette du cratère sans en déborder, même sculpté ; sans cuvette, la bouche rougeoie
        const pool = w.lavaPool(cx, cz), px = pool.x, pz = pool.z, y = pool.floor;
        lavaGeos.push(lavaPoolGeo(pool));
        nL++;
        for (let i = 0; i < SMOKE_PER_VOLCANO; i++) {
          this.smokePhase.setX(nSm, i / SMOKE_PER_VOLCANO + hash2(cx, cz, 540 + i) * 0.1);
          this.smoke.setMatrixAt(nSm, this.at(px + (hash2(cx, cz, 510 + i) - 0.5) * 0.3, y + 0.2, pz + (hash2(cx, cz, 520 + i) - 0.5) * 0.3, 0, 0.8 + hash2(cx, cz, 530 + i) * 0.5));
          this.smoke.setColorAt(nSm++, col.setScalar(0.85 + hash2(cx, cz, 550 + i) * 0.2));
        }
      }
    }
    // les ravins creusés au pinceau : lueur au fond, le long de leur axe, éboulis, blocs sur les rebords, filons dans les parois
    if (w.rift.includes(1)) {
      const g = riftGeo(w, at, (k) => CAVE_ROCK[w.biome[k]], (x, z, phase, sc) => {
        if (nSp >= MAX_SPECIAL * SPORES_PER_FISSURE) return;
        this.sporePhase.setX(nSp, phase);
        this.spores.setMatrixAt(nSp++, this.at(x, at(x, z), z, 0, sc));
      });
      crackGeos.push(g.body);
      glowGeos.push(g.glow);
    }
    const set = (m: THREE.InstancedMesh, n: number) => {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    set(this.wreck, nWr); set(this.smoke, nSm); set(this.spores, nSp);
    this.smokePhase.needsUpdate = true;
    this.sporePhase.needsUpdate = true;
    const swap = (m: THREE.Mesh, list: THREE.BufferGeometry[]) => {
      m.geometry.dispose();
      m.geometry = list.length ? mergeGeometries(list, false)! : new THREE.BufferGeometry();
      m.visible = list.length > 0;
    };
    swap(this.caves, caveGeos); swap(this.fissures, crackGeos); swap(this.fissureGlow, glowGeos); swap(this.lava, lavaGeos);
  }
}

const DESERT_ROCK = new THREE.Color(1.08, 0.9, 0.76);
/** rochers bruns du lit de cailloux, et ses dalles prises dans la glace l'hiver */
const BED_BROWN = new THREE.Color(1.06, 0.84, 0.62);
const ICE_SLAB = new THREE.Color(0.82, 0.92, 1.02);
/** Part de la neige de saison qui tient dans chaque biome */
const snowy = (b: number) => (b === BIOME_DESERT ? 0.15 : b === BIOME_TROPICAL ? 0.2 : b === BIOME_TAIGA ? 1.2 : 1);

/** Balancement au vent proportionnel au carré de la hauteur locale, en vague qui traverse la carte */
function addWind(m: THREE.Material, uTime: { value: number }, amp: number) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec2 wp = instanceMatrix[3].xz;
  vec3 wdir = transpose(mat3(instanceMatrix)) * vec3(1.0, 0.0, 0.35);
#else
  vec2 wp = vec2(0.0);
  vec3 wdir = vec3(1.0, 0.0, 0.35);
#endif
  float gust = sin(uTime * 1.3 - wp.x * 0.55 - wp.y * 0.2) * 0.5 + 0.6;
  float sway = gust + sin(uTime * 3.7 + wp.x * 3.1 + wp.y * 2.3) * 0.25;
  transformed.xz += wdir.xz * sway * ${amp.toFixed(4)} * transformed.y * transformed.y;`);
  };
  m.customProgramCacheKey = () => `wind${amp}`;
}

/** Houle : l'objet flotte avec la surface de l'eau (même vague que TerrainView.animateWater) */
function addSwell(m: THREE.Material, uWater: { value: number }, uCalm: { value: number }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWater = uWater;
    sh.uniforms.uCalm = uCalm;
    sh.vertexShader = 'uniform float uWater;\nuniform float uCalm;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec2 sp = instanceMatrix[3].xz;
  transformed.y += (sin(sp.x * 0.9 + uWater * 1.3) + sin(sp.y * 1.1 + uWater * 1.1) + sin((sp.x + sp.y) * 0.5 + uWater * 0.7)) * 0.018 * uCalm / max(0.01, length(instanceMatrix[1].xyz));
#endif`);
  };
  m.customProgramCacheKey = () => 'swell';
}

/** Touffe d'herbe : 6 brins en éventail, sombres au pied et clairs à la pointe */
function tuftGeo(): THREE.BufferGeometry {
  // herbe haute et serrée : brins en deux tronçons qui se courbent, sombres au pied, presque blancs à la pointe (la teinte vient
  // de la palette de saison) ; vue de haut, un tapis lumineux
  const pos: number[] = [], col: number[] = [];
  const base = new THREE.Color(0xb4c494), mid = new THREE.Color(0xe6efc8), tip = new THREE.Color(0xfffff0);
  const BLADES = 14;
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * Math.PI * 2 + (i % 3) * 0.5, r0 = (i % 4) * 0.022;
    const h = 0.13 + ((i * 7) % 5) * 0.026, lean = 0.035 + (i % 3) * 0.022, wd = 0.016;
    const ca = Math.cos(a), sa = Math.sin(a), ox = ca * r0, oz = sa * r0;
    const mx = ox + ca * lean * 0.35, my = h * 0.55, mz = oz + sa * lean * 0.35, w2 = wd * 0.6;
    const tx = ox + ca * lean, tz = oz + sa * lean;
    // tronçon bas (deux triangles), puis la pointe
    pos.push(ox - sa * wd, 0, oz + ca * wd, ox + sa * wd, 0, oz - ca * wd, mx + sa * w2, my, mz - ca * w2);
    pos.push(ox - sa * wd, 0, oz + ca * wd, mx + sa * w2, my, mz - ca * w2, mx - sa * w2, my, mz + ca * w2);
    pos.push(mx - sa * w2, my, mz + ca * w2, mx + sa * w2, my, mz - ca * w2, tx, h, tz);
    for (const c of [base, base, mid, base, mid, mid, mid, mid, tip]) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // normales tournées vers le ciel (un peu vers l'extérieur) : l'herbe s'éclaire comme le sol, sans brins noirs à contre-jour
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const l = Math.hypot(pos[i], pos[i + 2]) || 1;
    nrm[i] = (pos[i] / l) * 0.3; nrm[i + 1] = 0.95; nrm[i + 2] = (pos[i + 2] / l) * 0.3;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

/** Normales lues telles quelles des deux côtés (l'envers d'un brin d'herbe n'est pas tourné vers le sol) */
function keepNormals(mat: THREE.Material) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, ''));
  };
  mat.customProgramCacheKey = () => `${key}|keepN`;
}

/** Touffe de roseaux : longues feuilles vert-jaune et deux massettes brunes */
function reedGeo(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const base = new THREE.Color(0x7f9a5a), tip = new THREE.Color(0xd8dc9a), head = new THREE.Color(0x6e4a30);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + (i % 3) * 0.5;
    const h = 0.26 + (i % 3) * 0.06, lean = 0.03 + (i % 2) * 0.03, wd = 0.012;
    const ca = Math.cos(a), sa = Math.sin(a);
    pos.push(-sa * wd, 0, ca * wd, sa * wd, 0, -ca * wd, ca * lean, h, sa * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [g];
  for (const [x, z, h] of [[0.012, 0.006, 0.34], [-0.014, -0.01, 0.3]]) {
    const stem = new THREE.CylinderGeometry(0.003, 0.004, h, 3).translate(x, h / 2, z).toNonIndexed();
    const cat = new THREE.CylinderGeometry(0.011, 0.011, 0.06, 5).translate(x, h + 0.01, z).toNonIndexed();
    for (const [p, c] of [[stem, base], [cat, head]] as [THREE.BufferGeometry, THREE.Color][]) {
      p.deleteAttribute('uv');
      const cc = new Float32Array(p.attributes.position.count * 3);
      for (let i = 0; i < cc.length; i += 3) { cc[i] = c.r; cc[i + 1] = c.g; cc[i + 2] = c.b; }
      p.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      parts.push(p);
    }
  }
  return mergeGeometries(parts, false)!;
}

/** Touffe de 5 épis : tige, épi allongé et une feuille chacun */
function wheatClumpGeo(): THREE.BufferGeometry {
  const p = new Parts();
  const STEM = 0xb9c98a, EAR = 0xffffff, LEAF = 0x9fbf74;
  const stalks: [number, number, number, number][] = [[0, 0, 1, 0.3], [0.05, 0.022, 0.86, 2.2], [-0.045, 0.035, 0.94, 4.1], [0.01, -0.05, 0.8, 5.4], [-0.04, -0.03, 0.9, 3.3]];
  const eul = new THREE.Euler();
  const top = new THREE.Vector3();
  for (const [ox, oz, h, a] of stalks) {
    const H = 0.3 * h;
    const rx = Math.cos(a) * 0.13, rz = Math.sin(a) * 0.13;
    p.add(new THREE.CylinderGeometry(0.005, 0.008, H, 3, 1, true).translate(0, H / 2, 0), ox, 0, oz, STEM, 0, false, rz, rx);
    top.set(0, H, 0).applyEuler(eul.set(rx, 0, rz));
    p.add(new THREE.OctahedronGeometry(0.024).scale(0.9, 2.6, 0.9).translate(0, 0.058, 0), ox + top.x, top.y, oz + top.z, EAR, 0, false, rz, rx);
    const leaf = new THREE.BufferGeometry();
    leaf.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.007, 0.075 * h, 0.1 * h, 0, 0, 0.012, 0.007], 3));
    p.add(leaf, ox, 0.05 * h, oz, LEAF, a + 1.3);
  }
  return p.build().body;
}

/** Houppier : trois boules fusionnées, plus touffu qu'une seule */
/**
 * Boules lissées fusionnées [rayon, x, y, z, aplatissement, détail] : normales radiales,
 * assombries vers le bas pour donner du volume (ou unies si shade = false)
 */
function smoothBlobs(spec: [number, number, number, number, number, number][], shade = true): THREE.BufferGeometry {
  const parts = spec.map(([r, x, y, z, sy, detail]) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('uv');
    const p = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1; nrm.setXYZ(i, p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l); }
    g.scale(1, sy, 1).translate(x, y, z);
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c.fill(shade ? 0.72 + 0.28 * smoothstep(-r * sy, r * sy, p.getY(i) - y) : 1, i * 3, i * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
}

/**
 * Entrée de grotte en coordonnées monde : butte rocheuse bosselée dont l'ouverture en arche s'enfonce dans le noir,
 * entourée de quelques blocs éboulés. Sphère dont le pôle avant est retourné vers l'intérieur pour former le tunnel
 * (aucun jour possible entre la butte et le tunnel) ; le pied de la butte épouse le relief et le tunnel reste au-dessus du sol
 */
function caveMoundGeo(f: { x: number; y: number; z: number; yaw: number }, at: (x: number, z: number) => number,
  rock: THREE.Color, top: THREE.Color, topK: number, seed: number): THREE.BufferGeometry {
  // rangées 0 … MOUTH-1 : tunnel (rangée 0 = fond) ; rangée MOUTH : bord de l'arche
  const W = 30, H = 18, MOUTH = 4;
  const g = new THREE.SphereGeometry(1, W, H);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const CY = 0.22, CZ = -0.5, RX = 1.05, RY = 0.8, RZ = 0.98;
  // arche : demi-largeur, demi-hauteur, centre et profondeur du tunnel
  const { a: A, b: B, cy: MY, depth: D, z0: Z0, floor: FLOOR } = CAVE_TUNNEL;
  const k1 = seed * 61, k2 = seed * 37, k3 = seed * 93;
  const bump = (x: number, y: number, z: number) => Math.sin(x * 3.1 + y * 1.7 + k1) * Math.sin(z * 2.3 - y * 1.9 + k2) * 0.55
    + Math.sin(x * 5.7 - z * 4.1 + y * 2.2 + k3) * 0.3 + Math.sin(x * 11.3 + y * 9.1 - z * 7.7 + k1) * 0.12;
  const zRim = CZ + Math.cos((MOUTH / H) * Math.PI) * RZ;
  const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  const depth = new Float32Array(pos.count), ly = new Float32Array(pos.count), shade = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const iy = Math.floor(i / (W + 1)), ix = i % (W + 1);
    const th = (iy / H) * Math.PI, ps = (ix / W) * Math.PI * 2;
    const dx = Math.cos(ps) * Math.sin(th), dy = Math.sin(ps) * Math.sin(th), dz = Math.cos(th);
    let x: number, y: number, z: number;
    if (iy < MOUTH) {
      // tunnel : anneaux de plus en plus profonds et étroits, sol plat
      const q = (MOUTH - 1 - iy) / (MOUTH - 1), sc = iy === 0 ? 0 : 1 - 0.35 * q;
      x = Math.cos(ps) * A * sc;
      y = Math.max(0, MY + Math.sin(ps) * B * sc);
      z = Z0 - Math.pow(q, 0.85) * D;
      depth[i] = 0.15 + 0.85 * q;
    } else {
      const b = bump(dx, dy, dz), r = 1 + 0.14 * b;
      x = dx * RX * r; y = CY + dy * RY * r; z = CZ + dz * RZ * r;
      // sommet arrondi plutôt que pointu
      if (y > 0.6) y = 0.6 + (y - 0.6) * 0.55;
      shade[i] = b;
    }
    ly[i] = y;
    const wx = f.x + x * c + z * sn, wz = f.z - x * sn + z * c;
    const ground = at(wx, wz);
    // côté amont, le versant recouvre l'arrière de la butte (la grotte s'enfonce dans la colline, le relief est ouvert dans
    // le tunnel) ; côté aval, seul le pied descend suivre le relief
    const rise = ground - f.y;
    const wy = depth[i] > 0 ? f.y + FLOOR + y : f.y + y + (rise > 0 ? 0 : (1 - smoothstep(0, 0.75, y)) * rise);
    pos.setXYZ(i, wx, wy, wz);
  }
  // facettes de roche : une normale par face
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  const idx = g.index!.array, fp = flat.attributes.position, nrm = flat.attributes.normal;
  const col = new Float32Array(fp.count * 3), tmp = new THREE.Color();
  for (let v = 0; v < fp.count; v++) {
    const i = idx[v], face = Math.floor(v / 3);
    if (depth[i] > 0) tmp.copy(rock).multiplyScalar(0.36 * Math.pow(1 - depth[i], 2.4));
    else {
      // strates claires et sombres, nuance par face, mousse (ou neige) sur les faces tournées vers le ciel
      const strata = smoothstep(0.75, 1, Math.sin(ly[i] * 13 + shade[i] * 2.5));
      tmp.copy(rock).multiplyScalar((0.82 + 0.14 * shade[i] + hash2(face, 1, seed * 1e4) * 0.08) * (1 - strata * 0.12));
      tmp.lerp(top, smoothstep(0.55, 0.85, nrm.getY(v)) * smoothstep(0.12, 0.4, ly[i]) * topK);
    }
    col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts = [flat];
  // blocs éboulés de part et d'autre de l'arche
  for (const [bx, bz, r, k] of [[0.62, 0.32, 0.17, 1], [-0.68, 0.22, 0.22, 2], [0.8, -0.25, 0.14, 3], [-0.42, 0.55, 0.09, 4]]) {
    const rk = new THREE.IcosahedronGeometry(r * (0.85 + hash2(k, 7, seed * 1e4) * 0.3), 1);
    rk.deleteAttribute('uv');
    rk.scale(1, 0.72, 0.9).rotateY(hash2(k, 3, seed * 1e4) * 6.28);
    const wx = f.x + bx * c + bz * sn, wz = f.z - bx * sn + bz * c;
    rk.translate(wx, at(wx, wz) + r * 0.35, wz);
    rk.computeVertexNormals();
    const p = rk.attributes.position, n = rk.attributes.normal, cc = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      tmp.copy(rock).multiplyScalar(0.88 + hash2(k, i, 5) * 0.12).lerp(top, smoothstep(0.6, 0.9, n.getY(i)) * topK * 0.8);
      cc[i * 3] = tmp.r; cc[i * 3 + 1] = tmp.g; cc[i * 3 + 2] = tmp.b;
    }
    rk.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    parts.push(rk.index ? rk.toNonIndexed() : rk);
  }
  return mergeGeometries(parts, false)!;
}

/**
 * Décor des ravins creusés au pinceau (World creuse le relief, voir `World.rift`) : une lueur violette court au fond, le long
 * de l'axe de chaque ravin (les cases les plus éloignées de ses bords) ; éboulis au fond, blocs sur les rebords, filons de
 * minerai dans les parois ; `spore` pose les spores lumineuses qui montent du fond
 */
function riftGeo(w: World, at: (x: number, z: number) => number, rockOf: (k: number) => THREE.Color, spore: (x: number, z: number, phase: number, sc: number) => void) {
  const tmp = new THREE.Color(), GLOW = new THREE.Color(0.5, 0.26, 1).multiplyScalar(0.7), DARK = new THREE.Color(0, 0, 0);
  const inner = new Map<number, number>(), rift = w.rift;
  const innerAt = (k: number) => { let v = inner.get(k); if (v === undefined) { v = w.riftInner((k % N) + 0.5, Math.floor(k / N) + 0.5); inner.set(k, v); } return v; };
  const isRift = (x: number, z: number) => w.inCells(x, z) && rift[z * N + x] === 1;
  // l'axe : une case de ravin aussi loin de ses bords que ses voisines
  const axis = (x: number, z: number) => {
    if (!isRift(x, z)) return false;
    const v = innerAt(z * N + x);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && isRift(x + dx, z + dz) && innerAt((z + dz) * N + x + dx) > v + 1e-3) return false;
    return true;
  };
  const gpos: number[] = [], gcol: number[] = [];
  const pushV = (x: number, z: number, c: THREE.Color) => { gpos.push(x, at(x, z) + 0.03, z); gcol.push(c.r, c.g, c.b); };
  /** un trait de lueur d'un centre de case à l'autre : cœur violet, bords noirs (fondus, en mode additif) */
  const stroke = (ax: number, az: number, bx: number, bz: number) => {
    const l = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / l) * 0.2, nz = ((bx - ax) / l) * 0.2;
    const row = (x: number, z: number) => [[x + nx, z + nz, DARK], [x, z, GLOW], [x - nx, z - nz, DARK]] as [number, number, THREE.Color][];
    const A = row(ax, az), B = row(bx, bz);
    for (let j = 0; j < 2; j++) {
      const a0 = A[j], a1 = A[j + 1], b0 = B[j], b1 = B[j + 1];
      for (const v of [a0, b0, a1, a1, b0, b1]) pushV(v[0], v[1], v[2]);
    }
  };
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, col: THREE.Color) => {
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    const n = g.attributes.position.count, cc = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) { cc[v * 3] = col.r; cc[v * 3 + 1] = col.g; cc[v * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  for (let k = 0; k < N * N; k++) {
    if (!rift[k]) continue;
    const cx = k % N, cz = Math.floor(k / N), px = cx + 0.5, pz = cz + 0.5, h = (s: number) => hash2(cx, cz, 570 + s), rock = rockOf(k);
    if (axis(cx, cz)) {
      // traits vers les voisines de l'axe (en biais seulement si aucune voisine droite ne fait le lien)
      let linked = false;
      for (const [dx, dz] of [[1, 0], [0, 1]]) if (axis(cx + dx, cz + dz)) { stroke(px, pz, px + dx, pz + dz); linked = true; }
      for (const [dx, dz] of [[1, 1], [-1, 1]]) if (axis(cx + dx, cz + dz) && !axis(cx + dx, cz) && !axis(cx, cz + dz)) { stroke(px, pz, px + dx, pz + dz); linked = true; }
      if (!linked && !axis(cx - 1, cz) && !axis(cx, cz - 1) && !axis(cx - 1, cz - 1) && !axis(cx + 1, cz - 1)) stroke(px - 0.3, pz, px + 0.3, pz);
      if (h(1) < 0.35) spore(px + (h(2) - 0.5) * 0.6, pz + (h(3) - 0.5) * 0.6, h(4), 0.7 + h(5) * 0.6);
    }
    // éboulis au fond
    if (h(6) < 0.5) {
      const r = 0.05 + h(7) * 0.08, x = px + (h(8) - 0.5) * 0.5, z = pz + (h(9) - 0.5) * 0.5;
      add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).rotateY(h(10) * 6.28), x, at(x, z) + r * 0.2, z, tmp.copy(rock).multiplyScalar(0.55 + h(11) * 0.2));
    }
    // au bord du ravin : des blocs sur le rebord, des filons dans la paroi (façon Minecraft : charbon, fer, or, diamant)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isRift(cx + dx, cz + dz)) continue;
      const s = 20 + (dx + 1) * 3 + (dz + 1);
      if (h(s) < 0.3) {
        const r = 0.05 + h(s + 1) * 0.07, x = px + dx * (0.62 + h(s + 2) * 0.15) + dz * (h(s + 3) - 0.5) * 0.6, z = pz + dz * (0.62 + h(s + 2) * 0.15) + dx * (h(s + 3) - 0.5) * 0.6;
        add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).rotateY(h(s + 4) * 6.28), x, at(x, z) + r * 0.2, z, tmp.copy(rock).multiplyScalar(0.8 + h(s + 5) * 0.2));
      }
      if (h(s + 6) < 0.22) {
        const ore = RAVINE_ORES[Math.floor(h(s + 7) * RAVINE_ORES.length)];
        for (let q = 0; q < 3; q++) {
          const e = 0.05 + hash2(cx, cz, 640 + s * 3 + q) * 0.03, sp = (hash2(cx, cz, 660 + s * 3 + q) - 0.5) * 0.5;
          const x = px + dx * 0.4 + dz * sp, z = pz + dz * 0.4 + dx * sp;
          add(new THREE.BoxGeometry(e, e, e).rotateX(h(s + 8 + q) * 3).rotateY(h(s + 11 + q) * 3), x, at(x, z), z, ore);
        }
      }
    }
  }
  const glow = new THREE.BufferGeometry();
  glow.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
  glow.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
  return { body: parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry(), glow };
}

/** Minerais visibles dans les parois des ravins */
const RAVINE_ORES = [0x2c2c30, 0x2c2c30, 0xd8b28c, 0xd8b28c, 0xf5cf45, 0x5ef0e4].map((c) => new THREE.Color(c));

/** Lueur du fond des failles : additive, elle pulse doucement */
function crackGlowMaterial(uTime: { value: number }) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb *= 0.7 + 0.3 * sin(uTime * 1.6);`);
  };
  m.customProgramCacheKey = () => 'crackglow';
  return m;
}

/** Spores des failles : chaque grain monte en ondulant et s'éteint, en boucle (phase par instance) */
function sporeMaterial(uTime: { value: number }) {
  const m = new THREE.MeshBasicMaterial({ color: 0x7a45ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\nvarying float vLife;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vLife = fract(uTime * 0.11 + aPhase);
  transformed *= 1.0 - vLife * 0.5;
  transformed.y += vLife * 1.3;
  transformed.x += sin(vLife * 7.0 + aPhase * 23.0) * 0.1;
  transformed.z += cos(vLife * 5.0 + aPhase * 17.0) * 0.1;`);
    sh.fragmentShader = 'varying float vLife;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.a *= sin(vLife * 3.14159) * 0.9;`);
  };
  m.customProgramCacheKey = () => 'spores';
  return m;
}

/** Épave : quille, bordages d'un flanc, membrures à nu de l'autre, mât brisé couché */
function wreckGeo(): THREE.BufferGeometry {
  const p = new Parts();
  const W = 0x7a5f45, W2 = 0x5e4836, W3 = 0x8e7052;
  p.box(0.09, 0.06, 1.1, 0, 0, 0, W2);
  for (let i = 0; i < 4; i++) p.add(new THREE.BoxGeometry(0.03, 0.06, 1.04 - i * 0.12), 0.09 + i * 0.07, 0.06 + i * 0.075, 0, i % 2 ? W : W3, 0, false, -0.5 - i * 0.12);
  for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(0.025, 0.34, 0.03), -0.12, 0.15, -0.42 + k * 0.21, W2, 0, false, 0.45);
  p.add(new THREE.BoxGeometry(0.2, 0.025, 0.5), 0.05, 0.3, 0.05, W, 0.1, false, -0.2);
  p.add(new THREE.CylinderGeometry(0.025, 0.032, 0.8, 6).rotateZ(Math.PI / 2), 0.1, 0.06, 0.42, W2, 0.6);
  p.box(0.22, 0.02, 0.07, -0.38, 0, -0.5, W3, 0.4);
  p.box(0.16, 0.02, 0.06, 0.42, 0, 0.55, W, 1.2);
  return p.build().body;
}

/** Corail branchu (blanc, teinté par instance) */
function coralGeo(): THREE.BufferGeometry {
  const p = new Parts();
  p.add(new THREE.IcosahedronGeometry(0.04, 0).scale(1.2, 0.6, 1.2), 0, 0.02, 0, 0xe8e0e0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.add(new THREE.CylinderGeometry(0.008, 0.014, 0.12, 5).translate(0, 0.06, 0), Math.cos(a) * 0.02, 0.02, Math.sin(a) * 0.02, 0xffffff, a, false, Math.cos(a) * 0.4, Math.sin(a) * 0.4);
    p.add(new THREE.IcosahedronGeometry(0.014, 0), Math.cos(a) * 0.06, 0.12, Math.sin(a) * 0.06, 0xffffff);
  }
  return p.build(false).body;
}

/**
 * Lac de lave d'un cratère (voir `World.lavaPool`) : une étoile plate à sa surface, de la portée de la lave dans chaque
 * direction ; cœur jaune, bord orange
 */
const LAVA_CORE = new THREE.Color(0xffd06a), LAVA_MID = new THREE.Color(0xffb040), LAVA_RIM = new THREE.Color(0xff5a14);
function lavaPoolGeo(p: LavaPool): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], n = p.reach.length, y = p.level;
  const at = (a: number, f: number): [number, number, number] => {
    const t = ((a % n) / n) * Math.PI * 2, r = p.reach[a % n] * f;
    return [p.x + Math.cos(t) * r, y, p.z + Math.sin(t) * r];
  };
  const put = (v: [number, number, number], c: THREE.Color) => { pos.push(...v); col.push(c.r, c.g, c.b); };
  const O: [number, number, number] = [p.x, y, p.z];
  for (let a = 0; a < n; a++) {
    // (sens des sommets : la face regarde le ciel)
    const m0 = at(a, 0.5), m1 = at(a + 1, 0.5), e0 = at(a, 1), e1 = at(a + 1, 1);
    put(O, LAVA_CORE); put(m1, LAVA_MID); put(m0, LAVA_MID);
    put(m0, LAVA_MID); put(m1, LAVA_MID); put(e1, LAVA_RIM);
    put(m0, LAVA_MID); put(e1, LAVA_RIM); put(e0, LAVA_RIM);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Fumée de volcan : chaque bouffée monte, grossit et s'efface en boucle (phase par instance) */
function smokeMaterial(uTime: { value: number }) {
  const m = new THREE.MeshStandardMaterial({ color: 0x8f8a86, flatShading: true, roughness: 1, transparent: true, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\nvarying float vLife;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vLife = fract(uTime * 0.09 + aPhase);
  transformed *= 0.5 + vLife * 2.4;
  transformed.y += vLife * 2.6;
  transformed.x += vLife * vLife * 0.9;`);
    sh.fragmentShader = 'varying float vLife;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.a *= 0.65 * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife);`);
  };
  m.customProgramCacheKey = () => 'smoke';
  return m;
}

/** Sapin à trois étages */
function pineGeo(): THREE.BufferGeometry {
  const p = new Parts();
  p.cone(0.26, 0.36, 7, 0, 0.2, 0, 0xe4e4e4);
  p.cone(0.2, 0.32, 7, 0, 0.4, 0, 0xf2f2f2, false, 0.4);
  p.cone(0.13, 0.28, 7, 0, 0.6, 0, 0xffffff, false, 0.8);
  return p.build().body;
}
