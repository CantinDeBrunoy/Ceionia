import * as THREE from 'three';
import {
  World, N, SEA, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, VEG_CAVE, VEG_WRECK, VEG_VOLCANO, VEG_FISSURE, CAVE_TUNNEL,
  BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH, FissureFrame, fissureAt, SNOW_LINE,
} from '../world/world';
import { hash2, smoothstep } from '../core/rng';
import { SeasonState } from './season';
import { Parts } from './parts';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { bakeStatic, splitTrees, splitPieces, meshVariants, MeshPart, ModelName } from './assets';

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
/** Jardin : 3 rangs de 4 plants par case */
const GARDEN_ROWS = 3, GARDEN_COLS = 4;
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

const VEG_COLORS = [0x9fd46c, 0x7fb89c, 0xb5d975, 0x8ccf6a].map((c) => new THREE.Color(c));
const PUMPKIN = new THREE.Color(0xe8913a);
const FLOWER_HUES = [0.95, 0.13, 0.78, 0.02, 0.58];
/** Fleurs sauvages par biome (teintes ; 0.58 = blanc) */
const WILD_HUES = [[0.13, 0.58, 0.75, 0.13, 0.58], [0.58, 0.62, 0.58, 0.75], [0.92], [0.92, 0.05, 0.85, 0.11, 0.0], [0.15, 0.58, 0.7]];
/** Teinte des touffes d'herbe par biome (multiplie la couleur de saison) */
const TUFT_TINT = [[1, 1, 1], [0.78, 0.9, 0.88], [1.05, 0.92, 0.62], [0.82, 1.08, 0.74], [0.86, 0.94, 0.68]].map(([r, g, b]) => new THREE.Color(r, g, b));
/** Sous-bois par biome */
const SHRUB_COLORS = [0x6fa860, 0x5f8f62, 0xa09060, 0x4fa04a, 0x6f8f4e].map((c) => new THREE.Color(c));

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material }
interface LayerOpts {
  /** ombres portées */
  shadow?: boolean;
  /** menus détails : masqués au loin */
  detail?: boolean;
  /** petits décors : masqués très loin (vue d'ensemble d'une grande carte) */
  small?: boolean;
  /** arbres : version simplifiée au loin (calculée en tâche de fond) */
  lod?: boolean;
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

  constructor(private group: THREE.Group, readonly parts: Part[], readonly o: LayerOpts = {}) {
    for (let i = 0; i < NC * NC; i++) { this.m.push(new Float32Array(64)); this.c.push(new Float32Array(12)); this.near.push([]); this.far.push([]); }
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
  view(ch: number, dist: number) {
    const has = this.n[ch] > 0;
    const hide = (this.o.detail && dist > DETAIL_DIST) || (this.o.small && dist > SMALL_DIST);
    const far = !!this.far[ch].length && dist > LOD_DIST;
    // les ombres des tuiles lointaines, à peine visibles, doubleraient les appels de dessin
    const shadow = this.o.shadow !== false && dist < SHADOW_DIST;
    for (const m of this.near[ch]) { m.visible = has && !hide && !far; m.castShadow = shadow; }
    for (const m of this.far[ch]) { m.visible = has && !hide && far; m.castShadow = shadow; }
  }
}

/** Arbre importé : ses couches (feuillage teinté par la saison, bois…) et ses proportions */
interface Species {
  layer: Layer;
  /** hauteur (perchoir des oiseaux à la cime) */
  height: number;
}

/** Végétation instanciée : forêts par biome, blé, potagers fleuris, prairies, marais, déserts et fonds marins */
export class VegView {
  group = new THREE.Group();
  /** perchoirs (cimes) et fleurs de chaque tuile, [x, y, z, …] : la faune s'y pose et les butine */
  perches: number[][] = Array.from({ length: NC * NC }, () => []);
  flowers: number[][] = Array.from({ length: NC * NC }, () => []);
  private layers: Layer[] = [];
  // feuillus (bouleaux) : tronc, feuillage fleuri, feuillage vert
  private trunk: Layer;
  private blob: Layer;
  private blob2: Layer;
  private pine: Layer;
  private pineVars: Species[] = [];
  private snowPines: Species[] = [];
  private palms: Species[] = [];
  private cacti: Species[] = [];
  private willows: Species[] = [];
  private deadTrees: Species[] = [];
  private shrub: Layer | null = null;
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
  private lava: THREE.InstancedMesh;
  private smoke: THREE.InstancedMesh;
  private smokePhase: THREE.InstancedBufferAttribute;
  private volcanoes: [number, number][] = [];
  private tuftMat: THREE.MeshStandardMaterial;
  private blobMat: THREE.MeshStandardMaterial;
  private blob2Mat: THREE.MeshStandardMaterial;
  private pineMat: THREE.MeshStandardMaterial;
  private willowMat: THREE.MeshStandardMaterial;
  private leafY = 0;
  /** cime du feuillage des bouleaux (perchoir) */
  private leafTop = 0.72;
  private imported = false;
  private wheatMat: THREE.MeshStandardMaterial;
  private season: SeasonState | null = null;
  private lastLeaf = -1;
  private lastSnow = -1;
  private lastGrowth = -1;
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
    this.tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
    addWind(this.tuftMat, this.uTime, 1.3);
    const wood = std(0xffffff, true);

    // bouleaux, sapins, buissons et rochers Quaternius si chargés, formes procédurales sinon
    const birch = bakeStatic('birch', 1.05, /green/i), pines = bakeStatic('pines', 1.15, /green/i);
    const bush = bakeStatic('bush', 0.17, /green/i), rocks = bakeStatic('rocks', 0.1, /stone/i);
    this.imported = !!(birch?.tint && birch.rest);
    this.leafY = this.imported ? birch!.tintY : 0;
    if (birch?.tint) { birch.tint.computeBoundingBox(); this.leafTop = birch.tint.boundingBox!.max.y; }
    const trunkG = new THREE.CylinderGeometry(0.035, 0.055, 0.3, 5).translate(0, 0.15, 0);
    this.trunk = layer([{ geo: this.imported ? birch!.rest! : trunkG, mat: this.imported ? wood : std(0x9a7b62) }], { lod: true });
    const canopy = this.imported ? birch!.tint! : canopyGeo();
    this.blob = layer([{ geo: canopy, mat: this.blobMat }], { lod: true });
    this.blob2 = layer([{ geo: canopy, mat: this.blob2Mat }], { lod: true });
    this.pine = layer([{ geo: pineGeo(), mat: this.pineMat }]);
    // le modèle « Pine Trees » est un bosquet : chaque sapin devient une variante posée à sa propre hauteur
    for (const t of pines ? splitTrees(pines) : []) {
      if (!t.tint || !t.rest) continue;
      t.rest.computeBoundingBox();
      this.pineVars.push({ layer: layer([{ geo: t.tint, mat: this.pineMat }, { geo: t.rest, mat: wood }], { lod: true }), height: t.rest.boundingBox!.max.y });
    }
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
    this.snowPines = keep([species('pine_snow', 1.25, /green/i, this.pineMat, wood)]);
    this.palms = keep([species('palm', 1.3, /^$/, palmMat, palmMat), species('palm2', 1.6, /^$/, palmMat, palmMat), species('palm3', 1.25, /^$/, palmMat, palmMat)]);
    this.cacti = keep([species('cactus2', 0.95, /^$/, wood, wood), species('cactus_flowers', 0.72, /^$/, wood, wood), species('cactus', 0.42, /^$/, wood, wood, /black|brown/i)]);
    this.willows = keep([species('willow', 1.2, /green/i, this.willowMat, wood)]);
    this.deadTrees = keep([species('dead_tree', 0.95, /^$/, wood, wood)]);
    if (bush?.tint) this.shrub = layer([{ geo: bush.tint, mat: soft(true) }], { detail: true });
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
    // le modèle « Rocks » est un tas : chaque rocher devient une variante posée à sa propre hauteur
    const rockMat = std(0xb3aba1, !!rocks?.tint);
    const rockPieces = rocks?.tint ? splitPieces(rocks.tint) : [{ geometry: new THREE.IcosahedronGeometry(0.06, 1).scale(1, 0.55, 0.85).translate(0, 0.012, 0), radius: 0.06 }];
    this.rocks = rockPieces.map((r) => ({ layer: layer([{ geo: r.geometry, mat: rockMat }], { small: true }), radius: r.radius }));
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
      return parts.length ? layer(parts, { detail: true }) : null;
    };
    this.logs = prop('log', 0.12);
    this.stumps = prop('stump', 0.1);
    this.ferns = prop('fern', 0.13, this.fernMat);
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
    this.lava = single(lavaGeo(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) }), MAX_SPECIAL, false);
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

  /** Arbres simplifiés pour le lointain (meshoptimizer, en tâche de fond) */
  private async makeLods() {
    const mod = new SimplifyModifier();
    for (const l of this.layers) {
      if (!l.o.lod) continue;
      try {
        const geos: THREE.BufferGeometry[] = [];
        for (const p of l.parts) {
          const src = new THREE.BufferGeometry();
          src.setAttribute('position', p.geo.attributes.position);
          if (p.geo.attributes.color) src.setAttribute('color', p.geo.attributes.color);
          const merged = mergeVertices(src, 1e-3);
          const n = merged.attributes.position.count;
          const out = await mod.modify(merged, Math.floor(n * 0.72));
          const flat = out.toNonIndexed();
          flat.computeVertexNormals();
          geos.push(flat);
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
    this.blobMat.color.copy(s.foliage);
    this.blob2Mat.color.copy(s.foliage2);
    this.willowMat.color.copy(s.foliage2).lerp(new THREE.Color(0x7fae6a), 0.35);
    this.pineMat.color.setHex(0x7fba86).lerp(new THREE.Color(0xe8f0f4), s.snow * 0.7);
    this.wheatMat.color.copy(s.crop);
    this.tuftMat.color.copy(s.grass);
    this.fernMat.color.copy(s.foliage2).lerp(s.grass, 0.4).lerp(new THREE.Color(0x5f9a4e), 0.45);
    if (Math.abs(s.leaf - this.lastLeaf) > 0.03 || Math.abs(s.snow - this.lastSnow) > 0.03 || Math.abs(s.growth - this.lastGrowth) > 0.03) {
      this.lastLeaf = s.leaf;
      this.lastSnow = s.snow;
      this.lastGrowth = s.growth;
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
    this.rebuildSpecial();
    const urgent: number[] = [];
    for (let cz = Math.floor(r[1] / CH); cz <= Math.floor(r[3] / CH); cz++)
      for (let cx = Math.floor(r[0] / CH); cx <= Math.floor(r[2] / CH); cx++) urgent.push(cz * NC + cx);
    // petite retouche : immédiate ; carte entière : au fil des images
    for (const ch of urgent) this.enqueue(ch, urgent.length <= 6);
    if (urgent.length <= 6) this.flush(Infinity, urgent.length);
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
      for (const l of this.layers) l.view(ch, dist);
    }
  }

  private flush(budget: number, max = Infinity) {
    if (!this.season) return;
    const t0 = performance.now();
    let done = 0;
    while (this.queue.length && done < max && (done === 0 || performance.now() - t0 < budget)) {
      const ch = this.queue.shift()!;
      this.queued[ch] = 0;
      this.rebuildChunk(ch, this.season);
      done++;
    }
  }

  // ---------- Tuiles ----------

  private rebuildChunk(ch: number, s: SeasonState) {
    const w = this.world;
    Layer.chunk = ch;
    for (const l of this.layers) l.begin(ch);
    this.perches[ch] = [];
    this.flowers[ch] = [];
    const x0 = (ch % NC) * CH, z0 = Math.floor(ch / NC) * CH;
    for (let cz = z0; cz < Math.min(N, z0 + CH); cz++)
      for (let cx = x0; cx < Math.min(N, x0 + CH); cx++) {
        const k = w.ci(cx, cz), t = w.veg[k];
        // l'emprise des grottes et des failles reste dégagée
        if (w.decor[k] && t < VEG_CAVE) continue;
        if (!t) this.meadow(cx, cz, s);
        else if (t === VEG_FOREST) this.forest(cx, cz, s);
        else if (t === VEG_FIELD) this.field(cx, cz, s);
        else if (t === VEG_GARDEN) this.garden(cx, cz, s);
        else if (t === VEG_ROCKS) this.rockery(cx, cz, s);
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

  /** Rocher posé au point le plus bas du sol sous lui : aucun bord ne flotte, même en pente */
  private placeRock(px: number, pz: number, sc: number, sy: number, h1: number, h2: number, c: THREE.Color) {
    const w = this.world;
    const r = this.rocks[Math.floor(h2 * this.rocks.length)], rr = r.radius * sc;
    let y = w.hAt(px, pz);
    for (const [ox, oz] of [[rr, 0], [-rr, 0], [0, rr], [0, -rr], [rr * 0.7, rr * 0.7], [-rr * 0.7, -rr * 0.7], [rr * 0.7, -rr * 0.7], [-rr * 0.7, rr * 0.7]]) y = Math.min(y, w.hAt(px + ox, pz + oz));
    r.layer.put(this.at(px, y - 0.01 * sy, pz, h1 * 6.28, sc, sy, sc), c);
  }

  private perch(x: number, y: number, z: number) { this.perches[Layer.chunk].push(x, y, z); }

  private flower(x: number, y: number, z: number, scale: number, hue: number, sat: number, light: number) {
    this.blossom.put(this.at(x, y, z, 0, scale), this.col.setHSL(hue, sat, light));
    this.flowers[Layer.chunk].push(x, y + 0.08 * scale, z);
  }

  /** Arbre importé posé au sol, cime notée comme perchoir */
  private tree(sp: Species, x: number, y: number, z: number, rot: number, sc: number, c: THREE.Color) {
    sp.layer.put(this.at(x, y, z, rot, sc), c);
    this.perch(x, y + sp.height * sc + 0.01, z);
  }

  /** Forêt : essences du biome (feuillus et sapins, taïga enneigée, palmiers, cactus, saules du marais) */
  private forest(cx: number, cz: number, s: SeasonState) {
    const w = this.world, col = this.col, b = w.biome[w.ci(cx, cz)];
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
      const isPine = h < (b === BIOME_TAIGA ? 0.92 : this.pineVars.length ? 0.32 : 0.38) || y > (this.imported ? 4.2 : 3.2);
      // sapins enneigés : sur les sommets, et partout en taïga quand l'hiver arrive
      if (isPine && this.snowPines.length && (y > 4.2 || (b === BIOME_TAIGA && s.snow > 0.3)) && hv < (y > 4.2 ? 0.75 : 0.6)) {
        this.tree(this.snowPines[0], px, y, pz, rot, sc, col);
      } else if (isPine && this.pineVars.length) {
        this.tree(pick(this.pineVars, hv), px, y, pz, rot, sc, col);
      } else if (isPine) {
        this.pine.put(this.at(px, y, pz, rot, sc), col);
        this.trunk.put(this.dummy.matrix, col);
        this.perch(px, y + 0.85 * sc, pz);
      } else this.broadleaf(px, y, pz, rot, sc, col, s, hash2(cx, cz, 70 + k) < 0.4);
    }
    this.forestFloor(cx, cz, b, s);
    // sous-bois (fougères sous les palmiers, broussailles sèches au désert)
    if (hash2(cx, cz, 5) < (b === BIOME_DESERT ? 0.3 : 0.7) && s.snow < 0.8) {
      const px = cx + 0.15 + hash2(cx, cz, 6) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 7) * 0.7;
      col.copy(SHRUB_COLORS[b]).lerp(SNOWC, s.snow * 0.8 * snowy(b)).multiplyScalar(0.85 + hash2(cx, cz, 8) * 0.2);
      const sc = (0.8 + hash2(cx, cz, 9) * 0.6) * (b === BIOME_TROPICAL ? 1.4 : b === BIOME_DESERT ? 0.7 : 1);
      if (this.shrub) this.shrub.put(this.at(px, w.hAt(px, pz), pz, hash2(cx, cz, 4) * 6.28, sc), col);
      else this.plantAt(px, pz, 1.1 + hash2(cx, cz, 9) * 0.6, 0.8, hash2(cx, cz, 4) * 6.28, col);
    }
  }

  /** Feuillu : tronc et feuillage qui rétrécit en hiver autour de son centre ; 40 % fleurissent (rose au printemps, orange en automne) */
  private broadleaf(px: number, y: number, pz: number, rot: number, sc: number, col: THREE.Color, s: SeasonState, blossom: boolean) {
    this.trunk.put(this.at(px, y, pz, rot, sc), col);
    const ls = Math.max(0.25, s.leaf) * sc, lsy = ls * (0.8 + 0.2 * s.leaf);
    const m = this.at(px, y + this.leafY * (sc - lsy), pz, rot, ls, lsy, ls);
    (blossom ? this.blob : this.blob2).put(m, col);
    this.perch(px, y + this.leafTop * lsy + this.leafY * (sc - lsy) + 0.01, pz);
  }

  /** Sol de la forêt : fougères, champignons (surtout l'automne), souches et troncs moussus couchés */
  private forestFloor(cx: number, cz: number, b: number, s: SeasonState) {
    const w = this.world, col = this.col;
    if (b === BIOME_DESERT || s.snow * snowy(b) > 0.6) return;
    const h = hash2(cx, cz, 901), rot = hash2(cx, cz, 904) * 6.28;
    const px = cx + 0.15 + hash2(cx, cz, 902) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 903) * 0.7;
    const sc = 0.8 + hash2(cx, cz, 905) * 0.5;
    col.setScalar(0.88 + hash2(cx, cz, 906) * 0.18);
    if (h < 0.06 && this.logs) this.logs.put(this.at(px, w.hAt(px, pz) - 0.015, pz, rot, sc), col);
    else if (h < 0.11 && this.stumps) this.stumps.put(this.at(px, w.hAt(px, pz) - 0.01, pz, rot, sc), col);
    // fougères : denses sous les palmiers, absentes des marais
    const nf = b === BIOME_MARSH || !this.ferns ? 0 : hash2(cx, cz, 907) < (b === BIOME_TROPICAL ? 0.75 : 0.45) ? 1 + Math.floor(hash2(cx, cz, 908) * 2) : 0;
    for (let i = 0; i < nf; i++) {
      const fx = cx + 0.1 + hash2(cx, cz, 910 + i) * 0.8, fz = cz + 0.1 + hash2(cx, cz, 914 + i) * 0.8;
      const fs = (0.8 + hash2(cx, cz, 918 + i) * 0.5) * (b === BIOME_TROPICAL ? 1.3 : 1);
      this.ferns!.put(this.at(fx, w.hAt(fx, fz) - 0.01, fz, hash2(cx, cz, 922 + i) * 6.28, fs, fs * (0.6 + 0.4 * s.leaf)), col.copy(FERN_TINT[b]).multiplyScalar(0.85 + hash2(cx, cz, 926 + i) * 0.25));
    }
    // champignons en petits groupes, plus nombreux à l'automne
    const autumn = s.foliage2.r > s.foliage2.g;
    if (this.mushrooms && hash2(cx, cz, 930) < (autumn ? 0.35 : 0.12)) {
      const m = 1 + Math.floor(hash2(cx, cz, 931) * 3), brown = hash2(cx, cz, 932) < 0.4;
      const mx = cx + 0.2 + hash2(cx, cz, 933) * 0.6, mz = cz + 0.2 + hash2(cx, cz, 934) * 0.6;
      for (let i = 0; i < m; i++) {
        const qx = mx + (hash2(cx, cz, 935 + i) - 0.5) * 0.14, qz = mz + (hash2(cx, cz, 939 + i) - 0.5) * 0.14;
        const ms = 0.6 + hash2(cx, cz, 943 + i) * 0.7;
        this.mushrooms.put(this.at(qx, w.hAt(qx, qz) - 0.005, qz, hash2(cx, cz, 947 + i) * 6.28, ms), brown ? BOLETE : WHITE);
      }
    }
  }

  private field(cx: number, cz: number, s: SeasonState) {
    if (s.growth < 0.12) return;
    const w = this.world, edgeDist = this.edge(cx, cz);
    for (let r = 0; r < WHEAT_DIV; r++)
      for (let c = 0; c < WHEAT_DIV; c++) {
        const gx = cx * WHEAT_DIV + c, gz = cz * WHEAT_DIV + r;
        const px = cx + (c + 0.5 + (hash2(gx, gz, 101) - 0.5) * 0.5) / WHEAT_DIV;
        const pz = cz + (r + 0.5 + (hash2(gx, gz, 102) - 0.5) * 0.18) / WHEAT_DIV;
        const sc = s.growth * (0.82 + hash2(gx, gz, 103) * 0.3) * (0.65 + 0.35 * smoothstep(0, 0.3, edgeDist(px, pz)));
        this.wheat.put(this.at(px, w.hAt(px, pz) - 0.01, pz, hash2(gx, gz, 104) * 6.28, 0.9 + hash2(gx, gz, 105) * 0.3, sc, 0.9 + hash2(gx, gz, 106) * 0.3), this.col.setScalar(0.88 + hash2(gx, gz, 107) * 0.2));
      }
  }

  /** Potager : rangs de légumes et de fleurs ; les lapins y grignotent des plants */
  private garden(cx: number, cz: number, s: SeasonState) {
    if (s.growth < 0.12) return;
    const w = this.world, col = this.col;
    const g = 0.4 + 0.6 * s.growth, eaten = w.grazed[w.ci(cx, cz)];
    for (let r = 0; r < GARDEN_ROWS; r++)
      for (let c = 0; c < GARDEN_COLS; c++) {
        const gx = cx * GARDEN_COLS + c, gz = cz * GARDEN_ROWS + r;
        if (hash2(gx, gz, 208) < eaten * 0.75) continue;
        const px = cx + (c + 0.5 + (hash2(gx, gz, 201) - 0.5) * 0.3) / GARDEN_COLS;
        const pz = cz + (r + 0.5 + (hash2(gx, gz, 202) - 0.5) * 0.15) / GARDEN_ROWS;
        const h = hash2(gx, gz, 203);
        const rot = hash2(gx, gz, 204) * 6.28;
        const shade = 0.88 + hash2(gx, gz, 205) * 0.22;
        // un rang sur trois est fleuri, les autres sont des légumes (citrouilles en automne)
        if ((gz % 3 === 1 && h < 0.85) || h < 0.12) {
          this.plantAt(px, pz, 0.7 * g, 0.9, rot, col.setHex(0x78b862).multiplyScalar(shade));
          if (s.leaf > 0.5) {
            const hue = FLOWER_HUES[Math.floor(hash2(gx, gz, 206) * FLOWER_HUES.length)];
            this.flower(px, w.hAt(px, pz), pz, g, hue, hue === 0.58 ? 0.15 : 0.75, hue === 0.58 ? 0.95 : 0.72);
          }
        } else {
          const pumpkin = h > 0.8 && s.foliage2.r > s.foliage2.g;
          col.copy(pumpkin ? PUMPKIN : VEG_COLORS[Math.floor(hash2(gx, gz, 207) * VEG_COLORS.length)]).lerp(SNOWC, s.snow * 0.7).multiplyScalar(shade);
          this.plantAt(px, pz, (pumpkin ? 1.05 : 0.95) * g * (1 - eaten * 0.4), pumpkin ? 0.85 : 1, rot, col);
        }
      }
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

  /** Fond marin : laminaires qui ondulent sous la surface, coraux colorés sur les hauts-fonds */
  private seabed(cx: number, cz: number, depth: number, s: SeasonState) {
    const w = this.world, col = this.col;
    if (s.snow > 0.9) return;
    if (depth > 0.3 && depth < 2.2 && hash2(cx, cz, 601) < 0.3) {
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
    // marais : roseaux sur les berges et dans l'eau peu profonde, nénuphars sur les mares
    if (b === BIOME_MARSH && avg > -0.7 && avg < 0.7 && s.snow < 0.85) {
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
    if (avg < 0.12) return;
    const rough = avg < 0.32 || slope > 0.9;
    const stones = b === BIOME_DESERT || b === BIOME_TAIGA ? 0.04 : 0.012;
    if (slope <= 1.4 && hash2(cx, cz, 301) < (rough ? 0.1 : stones)) {
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
      if (h < 0.07 && this.cacti.length) this.cacti[Math.floor(hash2(cx, cz, 804) * this.cacti.length)].layer.put(this.at(px, y, pz, hash2(cx, cz, 805) * 6.28, 0.4 + hash2(cx, cz, 806) * 0.3), col.setScalar(1.1));
      else if (h < 0.17 && this.shrub) this.shrub.put(this.at(px, y, pz, hash2(cx, cz, 805) * 6.28, 0.6 + hash2(cx, cz, 806) * 0.5), col.copy(SHRUB_COLORS[BIOME_DESERT]));
      else if (h < 0.4 && s.snow < 0.6) this.tuft.put(this.at(px, y - 0.01, pz, hash2(cx, cz, 805) * 6.28, 0.9, 0.5, 0.9), col.copy(TUFT_TINT[BIOME_DESERT]));
      // ossements blanchis par le soleil, cailloux de grès
      const h2 = hash2(cx, cz, 811), qx = cx + 0.15 + hash2(cx, cz, 812) * 0.7, qz = cz + 0.15 + hash2(cx, cz, 813) * 0.7;
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
    const n = Math.round((base + Math.floor(hash2(cx, cz, 310) * 4)) * (1 - g * 0.85));
    const lush = b === BIOME_TROPICAL ? 1.15 : 1;
    for (let i = 0; i < n; i++) {
      const px = cx + 0.1 + hash2(cx, cz, 340 + i) * 0.8, pz = cz + 0.1 + hash2(cx, cz, 350 + i) * 0.8;
      const sc = (0.9 + hash2(cx, cz, 370 + i) * 0.5) * lush;
      this.tuft.put(this.at(px, w.hAt(px, pz) - 0.01, pz, hash2(cx, cz, 360 + i) * 6.28, sc, sc * 0.62 * (1 - s.snow * snowy(b) * 0.6) * (1 - g * 0.5), sc),
        col.copy(TUFT_TINT[b]).multiplyScalar(0.85 + hash2(cx, cz, 380 + i) * 0.25));
    }
    this.meadowDetails(cx, cz, b, slope, s);
    // fougères sous les tropiques
    if (b === BIOME_TROPICAL && this.shrub && hash2(cx, cz, 390) < 0.12) {
      const px = cx + 0.2 + hash2(cx, cz, 391) * 0.6, pz = cz + 0.2 + hash2(cx, cz, 392) * 0.6;
      this.shrub.put(this.at(px, w.hAt(px, pz), pz, hash2(cx, cz, 393) * 6.28, 1 + hash2(cx, cz, 394) * 0.5), col.copy(SHRUB_COLORS[BIOME_TROPICAL]));
    }
    // fleurs : plus nombreuses là où les abeilles ont butiné, broutées par les troupeaux
    const flowers = s.snow < 0.1 && s.growth > 0.5;
    const chance = ([0.2, 0.08, 0, 0.32, 0.15][b] + w.bloom[k] * 0.6) * (1 - g * 0.8);
    if (flowers && hash2(cx, cz, 330) < chance) {
      const m = 1 + Math.floor(hash2(cx, cz, 331) * 3) + Math.round(w.bloom[k] * 2);
      const hues = WILD_HUES[b];
      const hue = hues[Math.floor(hash2(cx, cz, 332) * hues.length)];
      for (let i = 0; i < m; i++) {
        const px = cx + 0.15 + hash2(cx, cz, 333 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 337 + i) * 0.7;
        this.flower(px, w.hAt(px, pz) - 0.03, pz, 0.55, hue, hue === 0.58 ? 0.1 : 0.8, hue === 0.58 ? 0.96 : 0.68);
      }
    }
  }

  /** Détails des prairies : arbres isolés, buissons, fougères, champignons, cailloux et touffes de fleurs */
  private meadowDetails(cx: number, cz: number, b: number, slope: number, s: SeasonState) {
    const w = this.world, col = this.col;
    const h = hash2(cx, cz, 820), rot = hash2(cx, cz, 823) * 6.28;
    const qx = cx + 0.2 + hash2(cx, cz, 821) * 0.6, qz = cz + 0.2 + hash2(cx, cz, 822) * 0.6, qy = w.hAt(qx, qz);
    const lone = [0.022, 0.03, 0, 0.034, 0.024][b];
    const sc = 0.75 + hash2(cx, cz, 824) * 0.35;
    col.setScalar(0.85 + hash2(cx, cz, 825) * 0.25);
    if (h < lone && slope < 1) {
      // arbre isolé de l'essence du biome
      const pick = <T,>(list: T[]) => list[Math.floor(hash2(cx, cz, 826) * list.length)];
      if (b === BIOME_TROPICAL && this.palms.length) this.tree(pick(this.palms), qx, qy, qz, rot, sc, col);
      else if (b === BIOME_MARSH && this.willows.length) this.tree(this.willows[0], qx, qy, qz, rot, sc * 0.9, col);
      else if ((b === BIOME_TAIGA || hash2(cx, cz, 827) < 0.35) && this.pineVars.length) this.tree(pick(this.pineVars), qx, qy, qz, rot, sc, col);
      else this.broadleaf(qx, qy, qz, rot, sc, col, s, hash2(cx, cz, 828) < 0.4);
    } else if (h < lone + 0.055 && this.shrub && b !== BIOME_MARSH && s.snow < 0.8) {
      this.shrub.put(this.at(qx, qy, qz, rot, 0.7 + hash2(cx, cz, 829) * 0.6), col.copy(SHRUB_COLORS[b]).lerp(SNOWC, s.snow * 0.8 * snowy(b)).multiplyScalar(0.9 + hash2(cx, cz, 830) * 0.2));
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
    if (this.wildFlowers.length && b !== BIOME_TAIGA && s.snow < 0.1 && s.growth > 0.4 && hash2(cx, cz, 860) < 0.1 + w.bloom[w.ci(cx, cz)] * 0.2) {
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
  private rebuildSpecial() {
    const w = this.world, d = this.dummy, col = this.col, s = this.season;
    let nWr = 0, nL = 0, nSm = 0, nSp = 0;
    const caveGeos: THREE.BufferGeometry[] = [], crackGeos: THREE.BufferGeometry[] = [], glowGeos: THREE.BufferGeometry[] = [];
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
      } else if (t === VEG_FISSURE) {
        const f = w.fissureFrame(cx, cz), g = fissureGeo(f, at, CAVE_ROCK[w.biome[k]]);
        crackGeos.push(g.body);
        glowGeos.push(g.glow);
        // spores lumineuses qui montent du fond
        for (let i = 0; i < SPORES_PER_FISSURE && nSp < MAX_SPECIAL * SPORES_PER_FISSURE; i++) {
          const u = (hash2(cx, cz, 570 + i) - 0.5) * f.len * 0.8, [off] = fissureAt(f, u);
          const x = f.x + u * Math.cos(f.yaw) - off * Math.sin(f.yaw), z = f.z + u * Math.sin(f.yaw) + off * Math.cos(f.yaw);
          this.sporePhase.setX(nSp, i / SPORES_PER_FISSURE + hash2(cx, cz, 590 + i) * 0.1);
          this.spores.setMatrixAt(nSp++, this.at(x, at(x, z), z, 0, 0.7 + hash2(cx, cz, 580 + i) * 0.6));
        }
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
        // bassin de lave au point le plus bas du cratère, rayon arrêté là où les parois dépassent la surface
        let px = cx + 0.5, pz = cz + 0.5, y = w.hAt(px, pz);
        for (let dz = -1.2; dz <= 1.2; dz += 0.2)
          for (let dx = -1.2; dx <= 1.2; dx += 0.2) { const h = w.hAt(cx + 0.5 + dx, cz + 0.5 + dz); if (h < y) { y = h; px = cx + 0.5 + dx; pz = cz + 0.5 + dz; } }
        // la lave remplit un peu la cuvette : un lac plutôt qu'une flaque
        const level = y + 0.3;
        let r = 0.15;
        for (; r < 2.4; r += 0.05) {
          let wall = Infinity;
          for (let a = 0; a < 16; a++) wall = Math.min(wall, w.hAt(px + Math.cos((a / 16) * 6.283) * r, pz + Math.sin((a / 16) * 6.283) * r));
          if (wall > level + 0.02) break;
        }
        this.lava.setMatrixAt(nL++, this.at(px, level, pz, 0, r / 0.55));
        for (let i = 0; i < SMOKE_PER_VOLCANO; i++) {
          this.smokePhase.setX(nSm, i / SMOKE_PER_VOLCANO + hash2(cx, cz, 540 + i) * 0.1);
          this.smoke.setMatrixAt(nSm, this.at(px + (hash2(cx, cz, 510 + i) - 0.5) * 0.3, y + 0.2, pz + (hash2(cx, cz, 520 + i) - 0.5) * 0.3, 0, 0.8 + hash2(cx, cz, 530 + i) * 0.5));
          this.smoke.setColorAt(nSm++, col.setScalar(0.85 + hash2(cx, cz, 550 + i) * 0.2));
        }
      }
    }
    const set = (m: THREE.InstancedMesh, n: number) => {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    set(this.wreck, nWr); set(this.lava, nL); set(this.smoke, nSm); set(this.spores, nSp);
    this.smokePhase.needsUpdate = true;
    this.sporePhase.needsUpdate = true;
    const swap = (m: THREE.Mesh, list: THREE.BufferGeometry[]) => {
      m.geometry.dispose();
      m.geometry = list.length ? mergeGeometries(list, false)! : new THREE.BufferGeometry();
      m.visible = list.length > 0;
    };
    swap(this.caves, caveGeos); swap(this.fissures, crackGeos); swap(this.fissureGlow, glowGeos);
  }
}

const DESERT_ROCK = new THREE.Color(1.08, 0.9, 0.76);
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
  const pos: number[] = [], col: number[] = [];
  const base = new THREE.Color(0xb9cb9c), tip = new THREE.Color(0xf6ffe6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.4;
    const h = 0.09 + (i % 3) * 0.025, lean = 0.035 + (i % 2) * 0.025, wd = 0.014;
    const ca = Math.cos(a), sa = Math.sin(a);
    pos.push(-sa * wd, 0, ca * wd, sa * wd, 0, -ca * wd, ca * lean, h, sa * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
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
function canopyGeo(): THREE.BufferGeometry {
  return smoothBlobs([[0.23, 0, 0.48, 0, 0.9, 1], [0.15, 0.14, 0.4, 0.07, 0.9, 0], [0.14, -0.12, 0.42, -0.08, 0.9, 0], [0.12, -0.02, 0.63, 0.05, 1, 0]]);
}

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
 * Décor d'un ravin (World creuse le relief) : éboulis au fond, blocs sur les rebords, filons de minerai dans les parois ;
 * une lueur violette (le monde souterrain) court au fond
 */
function fissureGeo(f: FissureFrame, at: (x: number, z: number) => number, rock: THREE.Color) {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw), NS = 40, seed = Math.round(f.phase * 100);
  const toW = (u: number, v: number): [number, number] => [f.x + u * c - v * s, f.z + u * s + v * c];
  const tmp = new THREE.Color();
  // lueur : bande étroite au fond, plus vive au milieu du ravin
  const gpos: number[] = [], gcol: number[] = [];
  const rows: [number, number, number, THREE.Color][][] = [];
  for (let r = 0; r <= NS; r++) {
    const u = -f.len / 2 + (r / NS) * f.len, [off, hw] = fissureAt(f, u), t = Math.abs(u) / (f.len / 2);
    rows.push([-1, 0, 1].map((j) => {
      const [x, z] = toW(u, off + j * hw * 0.3);
      return [x, at(x, z) + 0.03, z, j === 0 ? new THREE.Color(0.5, 0.26, 1).multiplyScalar(0.7 * (1 - t * t)) : new THREE.Color(0, 0, 0)] as [number, number, number, THREE.Color];
    }));
  }
  const push = (v: [number, number, number, THREE.Color]) => { gpos.push(v[0], v[1], v[2]); gcol.push(v[3].r, v[3].g, v[3].b); };
  for (let r = 0; r < NS; r++)
    for (let j = 0; j < 2; j++) {
      // u (rangées) × v (colonnes) pointe vers le bas : on tourne dans l'autre sens pour faire face au ciel
      const A = rows[r][j], B = rows[r][j + 1], D = rows[r + 1][j], E = rows[r + 1][j + 1];
      push(A); push(B); push(D); push(B); push(E); push(D);
    }
  const glow = new THREE.BufferGeometry();
  glow.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
  glow.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, col: THREE.Color) => {
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    const n = g.attributes.position.count, cc = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) { cc[v * 3] = col.r; cc[v * 3 + 1] = col.g; cc[v * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const steps = Math.round(f.len / 0.5);
  for (let i = 0; i < steps; i++) {
    const u = -f.len / 2 + ((i + 0.5) / steps) * f.len, [off, hw] = fissureAt(f, u), h = (k: number) => hash2(i, k, seed);
    if (hw < 0.15) continue;
    // éboulis au fond
    if (h(1) < 0.6) {
      const r = 0.05 + h(2) * 0.08, [x, z] = toW(u, off + (h(3) - 0.5) * hw * 0.5);
      add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).rotateY(h(4) * 6.28), x, at(x, z) + r * 0.2, z, tmp.copy(rock).multiplyScalar(0.55 + h(5) * 0.2));
    }
    // blocs sur les rebords
    if (h(6) < 0.45) {
      const side = h(7) < 0.5 ? -1 : 1, r = 0.05 + h(8) * 0.07, [x, z] = toW(u, off + side * (hw + 0.2 + h(9) * 0.15));
      add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).rotateY(h(10) * 6.28), x, at(x, z) + r * 0.2, z, tmp.copy(rock).multiplyScalar(0.8 + h(11) * 0.2));
    }
    // filons dans les parois, façon Minecraft : charbon, fer, or, diamant
    if (h(12) < 0.3) {
      const side = h(13) < 0.5 ? -1 : 1, ore = RAVINE_ORES[Math.floor(h(14) * RAVINE_ORES.length)];
      for (let q = 0; q < 3; q++) {
        const [x, z] = toW(u + (hash2(i, q, seed + 1) - 0.5) * 0.3, off + side * hw * (0.68 + hash2(i, q, seed + 2) * 0.12));
        const e = 0.05 + hash2(i, q, seed + 3) * 0.03;
        add(new THREE.BoxGeometry(e, e, e).rotateX(hash2(i, q, seed + 4) * 3).rotateY(hash2(i, q, seed + 5) * 3), x, at(x, z), z, ore);
      }
    }
  }
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

/** Bassin de lave : cœur jaune, bord orange */
function lavaGeo(): THREE.BufferGeometry {
  const p = new Parts();
  p.add(new THREE.CircleGeometry(0.55, 14).rotateX(-Math.PI / 2), 0, 0, 0, 0xff5a14);
  p.add(new THREE.CircleGeometry(0.3, 12).rotateX(-Math.PI / 2), 0, 0.01, 0, 0xffc04a);
  return p.build(false).body;
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
