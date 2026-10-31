import * as THREE from 'three';
import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, VEG_CAVE, VEG_WRECK, VEG_VOLCANO, CAVE } from '../world/world';
import { hash2, smoothstep } from '../core/rng';
import { SeasonState } from './season';
import { Parts } from './parts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeStatic, splitTrees } from './assets';

const SNOWC = new THREE.Color(0xf1f5f9);
const MAX_TREES = N * N * 3;
/** Blé : 4 sillons par case, 4 touffes par sillon (grille monde continue d'une case à l'autre) */
const WHEAT_DIV = 4;
const MAX_WHEAT = N * N * WHEAT_DIV * WHEAT_DIV;
/** Jardin : 3 rangs de 4 plants par case */
const GARDEN_ROWS = 3, GARDEN_COLS = 4;
const MAX_PLANTS = N * N * (GARDEN_ROWS * GARDEN_COLS + 2);
/** Prairie : touffes d'herbe et cailloux sur les cases libres */
const MAX_TUFTS = N * N * 5;
const MAX_ROCKS = N * N * 4;
const MAX_CAVES = 64;
/** Fonds marins : laminaires et coraux dans l'eau peu profonde */
const MAX_KELP = N * N * 2;
const MAX_CORAL = N * N;
const CORAL_COLORS = [0xf28fa0, 0xf6a65a, 0xb48ae0, 0xf4d35e, 0xff7f6e].map((c) => new THREE.Color(c));
const SMOKE_PER_VOLCANO = 8;

const VEG_COLORS = [0x9fd46c, 0x7fb89c, 0xb5d975, 0x8ccf6a].map((c) => new THREE.Color(c));
const PUMPKIN = new THREE.Color(0xe8913a);
const FLOWER_HUES = [0.95, 0.13, 0.78, 0.02, 0.58];
const WILD_HUES = [0.13, 0.58, 0.75, 0.13, 0.58];

/** Végétation instanciée : arbres et sous-bois, blé, potagers fleuris, herbes et cailloux des prairies */
export class VegView {
  group = new THREE.Group();
  private trunk: THREE.InstancedMesh;
  private blob: THREE.InstancedMesh;
  private blob2: THREE.InstancedMesh;
  private pine: THREE.InstancedMesh;
  private wheat: THREE.InstancedMesh;
  private plant: THREE.InstancedMesh;
  private blossom: THREE.InstancedMesh;
  private tuft: THREE.InstancedMesh;
  private rock: THREE.InstancedMesh;
  private cave: THREE.InstancedMesh;
  private wreck: THREE.InstancedMesh;
  private kelp: THREE.InstancedMesh;
  private coral: THREE.InstancedMesh;
  private lava: THREE.InstancedMesh;
  private smoke: THREE.InstancedMesh;
  private smokePhase: THREE.InstancedBufferAttribute;
  private tuftMat: THREE.MeshStandardMaterial;
  private blobMat: THREE.MeshStandardMaterial;
  private blob2Mat: THREE.MeshStandardMaterial;
  private pineMat: THREE.MeshStandardMaterial;
  /** modèles importés : sapins individuels (aiguilles + bois), buissons du sous-bois, hauteur du centre du feuillage */
  private pineVars: { leaf: THREE.InstancedMesh; wood: THREE.InstancedMesh }[] = [];
  private shrub: THREE.InstancedMesh | null = null;
  private leafY = 0;
  private imported = false;
  private wheatMat: THREE.MeshStandardMaterial;
  private lastLeaf = -1;
  private lastSnow = -1;
  private lastGrowth = -1;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private uTime = { value: 0 };

  constructor(private world: World) {
    const std = (c: number, vertexColors = false) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.95, vertexColors });
    const trunkG = new THREE.CylinderGeometry(0.035, 0.055, 0.3, 5).translate(0, 0.15, 0);
    // feuillages et buissons : ombrage lisse, formes rondes
    const soft = (vertexColors: boolean) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors });
    this.blobMat = soft(true);
    this.blob2Mat = soft(true);
    this.pineMat = std(0x7fba86, true);
    this.wheatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
    addWind(this.wheatMat, this.uTime, 0.25);
    addWind(this.blobMat, this.uTime, 0.035);
    addWind(this.blob2Mat, this.uTime, 0.035);
    this.tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
    addWind(this.tuftMat, this.uTime, 1.3);
    // bouleaux, sapins, buissons et rochers Quaternius si chargés, formes procédurales sinon
    const birch = bakeStatic('birch', 1.05, /green/i), pines = bakeStatic('pines', 1.15, /green/i);
    const bush = bakeStatic('bush', 0.17, /green/i), rocks = bakeStatic('rocks', 0.1, /stone/i);
    this.imported = !!(birch?.tint && birch.rest);
    this.leafY = this.imported ? birch!.tintY : 0;
    this.trunk = this.imported ? this.inst(birch!.rest!, std(0xffffff, true), MAX_TREES) : this.inst(trunkG, std(0x9a7b62), MAX_TREES);
    const canopy = this.imported ? birch!.tint! : canopyGeo();
    this.blob = this.inst(canopy, this.blobMat, MAX_TREES);
    this.blob2 = this.inst(canopy, this.blob2Mat, MAX_TREES);
    this.pine = this.inst(pineGeo(), this.pineMat, MAX_TREES);
    // le modèle « Pine Trees » est un bosquet : chaque sapin devient une variante posée à sa propre hauteur
    for (const t of pines ? splitTrees(pines) : []) {
      if (!t.tint || !t.rest) continue;
      const v = { leaf: this.inst(t.tint, this.pineMat, MAX_TREES), wood: this.inst(t.rest, std(0xffffff, true), MAX_TREES) };
      this.pineVars.push(v);
      this.group.add(v.leaf, v.wood);
    }
    if (bush?.tint) { this.shrub = this.inst(bush.tint, soft(true), N * N); this.group.add(this.shrub); }
    this.wheat = this.inst(wheatClumpGeo(), this.wheatMat, MAX_WHEAT);
    this.wheat.castShadow = false;
    this.plant = this.inst(smoothBlobs([[0.07, 0, 0.045, 0, 0.72, 1]], false), soft(false), MAX_PLANTS);
    this.blossom = this.inst(new THREE.IcosahedronGeometry(0.035, 0).translate(0, 0.085, 0), std(0xffffff), MAX_PLANTS);
    this.blossom.castShadow = false;
    this.tuft = this.inst(tuftGeo(), this.tuftMat, MAX_TUFTS);
    this.tuft.castShadow = false;
    this.rock = this.inst(rocks?.tint ?? new THREE.IcosahedronGeometry(0.06, 1).scale(1, 0.55, 0.85).translate(0, 0.012, 0), std(0xb3aba1, !!rocks?.tint), MAX_ROCKS);
    this.cave = this.inst(caveGeo(), std(0xffffff, true), MAX_CAVES);
    this.wreck = this.inst(wreckGeo(), std(0xffffff, true), MAX_CAVES);
    const kelpMat = new THREE.MeshStandardMaterial({ color: 0x6f8f3e, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
    addWind(kelpMat, this.uTime, 0.14);
    this.kelp = this.inst(new THREE.PlaneGeometry(0.1, 1, 1, 5).translate(0, 0.5, 0), kelpMat, MAX_KELP);
    this.kelp.castShadow = false;
    this.coral = this.inst(coralGeo(), std(0xffffff, true), MAX_CORAL);
    this.coral.castShadow = false;
    // lave : matériau non éclairé, elle brille aussi la nuit
    this.lava = this.inst(lavaGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), MAX_CAVES);
    this.lava.castShadow = this.lava.receiveShadow = false;
    const smokeG = new THREE.IcosahedronGeometry(0.22, 1);
    this.smokePhase = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CAVES * SMOKE_PER_VOLCANO), 1);
    smokeG.setAttribute('aPhase', this.smokePhase);
    this.smoke = this.inst(smokeG, smokeMaterial(this.uTime), MAX_CAVES * SMOKE_PER_VOLCANO);
    this.smoke.castShadow = this.smoke.receiveShadow = false;
    this.group.add(this.wreck, this.kelp, this.coral, this.lava, this.smoke);
    this.group.add(this.trunk, this.blob, this.blob2, this.pine, this.wheat, this.plant, this.blossom, this.tuft, this.rock, this.cave);
  }

  private inst(g: THREE.BufferGeometry, m: THREE.Material, n: number) {
    const im = new THREE.InstancedMesh(g, m, n);
    im.count = 0;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return im;
  }

  /** Vent : balancement du blé et des feuillages */
  animate(t: number) {
    this.uTime.value = t;
  }

  applySeason(s: SeasonState) {
    this.blobMat.color.copy(s.foliage);
    this.blob2Mat.color.copy(s.foliage2);
    this.pineMat.color.setHex(0x7fba86).lerp(new THREE.Color(0xe8f0f4), s.snow * 0.7);
    this.wheatMat.color.copy(s.crop);
    this.tuftMat.color.copy(s.grass);
    if (Math.abs(s.leaf - this.lastLeaf) > 0.03 || Math.abs(s.snow - this.lastSnow) > 0.03 || Math.abs(s.growth - this.lastGrowth) > 0.03) this.rebuild(s);
  }

  rebuild(s: SeasonState) {
    this.lastLeaf = s.leaf;
    this.lastSnow = s.snow;
    this.lastGrowth = s.growth;
    const w = this.world, d = this.dummy, col = this.col;
    const vegAt = (x: number, z: number) => (w.inCells(x, z) ? w.veg[w.ci(x, z)] : 0);
    let nT = 0, nB = 0, nB2 = 0, nP = 0, nW = 0, nPl = 0, nF = 0, nTu = 0, nR = 0, nS = 0, nC = 0, nWr = 0, nK = 0, nCo = 0, nL = 0, nSm = 0;
    const nPV = this.pineVars.map(() => 0);
    const plantAt = (x: number, z: number, sc: number, sy: number, rot: number, c: THREE.Color) => {
      d.position.set(x, w.hAt(x, z), z);
      d.rotation.set(0, rot, 0);
      d.scale.set(sc, sc * sy, sc);
      d.updateMatrix();
      this.plant.setMatrixAt(nPl, d.matrix);
      this.plant.setColorAt(nPl++, c);
    };
    const flowers = s.snow < 0.1 && s.growth > 0.5;
    // pas d'herbe ni de fleurs sur les flancs de basalte des volcans
    const volcanoes: [number, number][] = [];
    w.veg.forEach((v, k) => { if (v === VEG_VOLCANO) volcanoes.push([(k % N) + 0.5, Math.floor(k / N) + 0.5]); });
    const scorched = (x: number, z: number) => volcanoes.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 3.6);
    /** Fond marin : laminaires qui ondulent sous la surface, coraux colorés sur les hauts-fonds */
    const seabed = (cx: number, cz: number, depth: number) => {
      if (s.snow > 0.9) return;
      if (depth > 0.3 && depth < 2.2 && hash2(cx, cz, 601) < 0.3) {
        const n = 2 + Math.floor(hash2(cx, cz, 602) * 3);
        for (let i = 0; i < n; i++) {
          const px = cx + 0.15 + hash2(cx, cz, 603 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 610 + i) * 0.7;
          const y = w.hAt(px, pz);
          d.position.set(px, y, pz);
          d.rotation.set(0, hash2(cx, cz, 617 + i) * 6.28, 0);
          d.scale.set(1, Math.max(0.15, -y - 0.12) * (0.6 + hash2(cx, cz, 624 + i) * 0.35), 1);
          d.updateMatrix();
          this.kelp.setMatrixAt(nK, d.matrix);
          this.kelp.setColorAt(nK++, col.setScalar(0.8 + hash2(cx, cz, 631 + i) * 0.35));
        }
      }
      if (depth > 0.15 && depth < 1.1 && hash2(cx, cz, 640) < 0.22) {
        const n = 1 + Math.floor(hash2(cx, cz, 641) * 2);
        for (let i = 0; i < n; i++) {
          const px = cx + 0.2 + hash2(cx, cz, 642 + i) * 0.6, pz = cz + 0.2 + hash2(cx, cz, 646 + i) * 0.6;
          d.position.set(px, w.hAt(px, pz) - 0.01, pz);
          d.rotation.set(0, hash2(cx, cz, 650 + i) * 6.28, 0);
          d.scale.setScalar(0.8 + hash2(cx, cz, 654 + i) * 0.7);
          d.updateMatrix();
          this.coral.setMatrixAt(nCo, d.matrix);
          this.coral.setColorAt(nCo++, CORAL_COLORS[Math.floor(hash2(cx, cz, 658 + i) * CORAL_COLORS.length)]);
        }
      }
    };
    /** Case libre : quelques touffes d'herbe, fleurs sauvages, cailloux sur les pentes et les plages */
    const meadow = (cx: number, cz: number) => {
      const k = w.ci(cx, cz);
      if (w.occ[k] || w.road[k]) return;
      const avg = w.cellAvg(cx, cz), slope = w.cellSlope(cx, cz);
      if (avg < -0.12) { seabed(cx, cz, -avg); return; }
      if (avg < 0.12) return;
      const rough = avg < 0.32 || slope > 0.9;
      if (slope <= 1.4 && hash2(cx, cz, 301) < (rough ? 0.1 : 0.012)) {
        const px = cx + 0.15 + hash2(cx, cz, 302) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 303) * 0.7;
        d.position.set(px, w.hAt(px, pz), pz);
        d.rotation.set((hash2(cx, cz, 304) - 0.5) * 0.5, hash2(cx, cz, 305) * 6.28, (hash2(cx, cz, 306) - 0.5) * 0.5);
        // blocs plus gros sur les pentes raides et en montagne
        d.scale.setScalar(slope > 1.2 || avg > 4 ? 1.4 + hash2(cx, cz, 307) * 1.8 : 0.6 + hash2(cx, cz, 307) * 0.9);
        d.updateMatrix();
        this.rock.setMatrixAt(nR, d.matrix);
        col.setScalar(0.85 + hash2(cx, cz, 308) * 0.25).lerp(SNOWC, s.snow * 0.8);
        this.rock.setColorAt(nR++, col);
      }
      if (avg < 0.32 || slope > 1.3 || s.snow > 0.6 || scorched(cx + 0.5, cz + 0.5)) return;
      const n = 2 + Math.floor(hash2(cx, cz, 310) * 4);
      for (let i = 0; i < n; i++) {
        const px = cx + 0.1 + hash2(cx, cz, 340 + i) * 0.8, pz = cz + 0.1 + hash2(cx, cz, 350 + i) * 0.8;
        d.position.set(px, w.hAt(px, pz) - 0.01, pz);
        d.rotation.set(0, hash2(cx, cz, 360 + i) * 6.28, 0);
        const sc = 0.9 + hash2(cx, cz, 370 + i) * 0.5;
        d.scale.set(sc, sc * 0.62 * (1 - s.snow * 0.6), sc);
        d.updateMatrix();
        this.tuft.setMatrixAt(nTu, d.matrix);
        col.setScalar(0.85 + hash2(cx, cz, 380 + i) * 0.25);
        this.tuft.setColorAt(nTu++, col);
      }
      if (flowers && hash2(cx, cz, 330) < 0.2) {
        const m = 1 + Math.floor(hash2(cx, cz, 331) * 3);
        const hue = WILD_HUES[Math.floor(hash2(cx, cz, 332) * WILD_HUES.length)];
        for (let i = 0; i < m; i++) {
          const px = cx + 0.15 + hash2(cx, cz, 333 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 337 + i) * 0.7;
          d.position.set(px, w.hAt(px, pz) - 0.03, pz);
          d.rotation.set(0, 0, 0);
          d.scale.setScalar(0.55);
          d.updateMatrix();
          this.blossom.setMatrixAt(nF, d.matrix);
          col.setHSL(hue, hue === 0.58 ? 0.1 : 0.8, hue === 0.58 ? 0.96 : 0.68);
          this.blossom.setColorAt(nF++, col);
        }
      }
    };
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const t = w.veg[w.ci(cx, cz)];
        if (!t) { meadow(cx, cz); continue; }
        // distance au bord de la zone (côtés dont la case voisine est d'un autre type) : la lisière est plus clairsemée
        const open = [vegAt(cx - 1, cz) !== t, vegAt(cx + 1, cz) !== t, vegAt(cx, cz - 1) !== t, vegAt(cx, cz + 1) !== t];
        const edgeDist = (px: number, pz: number) => {
          let e = 1;
          if (open[0]) e = Math.min(e, px - cx);
          if (open[1]) e = Math.min(e, cx + 1 - px);
          if (open[2]) e = Math.min(e, pz - cz);
          if (open[3]) e = Math.min(e, cz + 1 - pz);
          return e;
        };
        if (t === VEG_FOREST) {
          // les arbres importés sont plus grands et plus détaillés : moins d'instances par case
          const cnt = this.imported ? (hash2(cx, cz, 1) > 0.55 ? 2 : 1) : hash2(cx, cz, 1) > 0.45 ? 3 : 2;
          for (let k = 0; k < cnt; k++) {
            const px = cx + 0.12 + hash2(cx, cz, 10 + k) * 0.76, pz = cz + 0.12 + hash2(cx, cz, 20 + k) * 0.76;
            const y = w.hAt(px, pz);
            const sc = (0.75 + hash2(cx, cz, 30 + k) * 0.7) * (0.75 + 0.25 * smoothstep(0, 0.45, edgeDist(px, pz)));
            const isPine = hash2(cx, cz, 40 + k) < (this.pineVars.length ? 0.32 : 0.38) || y > (this.imported ? 4.2 : 3.2);
            d.position.set(px, y, pz);
            d.rotation.set(0, hash2(cx, cz, 50 + k) * 6.28, 0);
            d.scale.set(sc, sc, sc);
            d.updateMatrix();
            col.setScalar(0.85 + hash2(cx, cz, 60 + k) * 0.25);
            if (isPine && this.pineVars.length) {
              const v = Math.floor(hash2(cx, cz, 90 + k) * this.pineVars.length), pv = this.pineVars[v];
              pv.leaf.setMatrixAt(nPV[v], d.matrix);
              pv.leaf.setColorAt(nPV[v], col);
              pv.wood.setMatrixAt(nPV[v]++, d.matrix);
            } else if (isPine) {
              this.pine.setMatrixAt(nP, d.matrix);
              this.pine.setColorAt(nP++, col);
              this.trunk.setMatrixAt(nT++, d.matrix);
            } else {
              this.trunk.setMatrixAt(nT++, d.matrix);
              // le feuillage rétrécit en hiver autour de son centre
              const ls = Math.max(0.25, s.leaf) * sc, lsy = ls * (0.8 + 0.2 * s.leaf);
              d.position.y = y + this.leafY * (sc - lsy);
              d.scale.set(ls, lsy, ls);
              d.updateMatrix();
              // 40 % des feuillus fleurissent (rose au printemps, orange en automne), les autres restent verts / jaunes
              if (hash2(cx, cz, 70 + k) < 0.4) { this.blob.setMatrixAt(nB, d.matrix); this.blob.setColorAt(nB++, col); }
              else { this.blob2.setMatrixAt(nB2, d.matrix); this.blob2.setColorAt(nB2++, col); }
            }
          }
          // sous-bois
          if (hash2(cx, cz, 5) < 0.7 && s.snow < 0.8) {
            const px = cx + 0.15 + hash2(cx, cz, 6) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 7) * 0.7;
            col.setHex(0x6fa860).lerp(SNOWC, s.snow * 0.8).multiplyScalar(0.85 + hash2(cx, cz, 8) * 0.2);
            if (this.shrub) {
              const sc = 0.8 + hash2(cx, cz, 9) * 0.6;
              d.position.set(px, w.hAt(px, pz), pz);
              d.rotation.set(0, hash2(cx, cz, 4) * 6.28, 0);
              d.scale.set(sc, sc, sc);
              d.updateMatrix();
              this.shrub.setMatrixAt(nS, d.matrix);
              this.shrub.setColorAt(nS++, col);
            } else plantAt(px, pz, 1.1 + hash2(cx, cz, 9) * 0.6, 0.8, hash2(cx, cz, 4) * 6.28, col);
          }
        } else if (t === VEG_FIELD) {
          if (s.growth < 0.12) continue;
          for (let r = 0; r < WHEAT_DIV; r++)
            for (let c = 0; c < WHEAT_DIV; c++) {
              const gx = cx * WHEAT_DIV + c, gz = cz * WHEAT_DIV + r;
              const px = cx + (c + 0.5 + (hash2(gx, gz, 101) - 0.5) * 0.5) / WHEAT_DIV;
              const pz = cz + (r + 0.5 + (hash2(gx, gz, 102) - 0.5) * 0.18) / WHEAT_DIV;
              const sc = s.growth * (0.82 + hash2(gx, gz, 103) * 0.3) * (0.65 + 0.35 * smoothstep(0, 0.3, edgeDist(px, pz)));
              d.position.set(px, w.hAt(px, pz) - 0.01, pz);
              d.rotation.set(0, hash2(gx, gz, 104) * 6.28, 0);
              d.scale.set(0.9 + hash2(gx, gz, 105) * 0.3, sc, 0.9 + hash2(gx, gz, 106) * 0.3);
              d.updateMatrix();
              this.wheat.setMatrixAt(nW, d.matrix);
              col.setScalar(0.88 + hash2(gx, gz, 107) * 0.2);
              this.wheat.setColorAt(nW++, col);
            }
        } else if (t === VEG_ROCKS) {
          // rocaille : deux à quatre blocs, dont au moins un gros, et des cailloux
          const n = 2 + Math.floor(hash2(cx, cz, 401) * 3);
          for (let i = 0; i < n; i++) {
            const px = cx + 0.15 + hash2(cx, cz, 402 + i) * 0.7, pz = cz + 0.15 + hash2(cx, cz, 410 + i) * 0.7;
            const sc = i === 0 || hash2(cx, cz, 418 + i) < 0.4 ? 2 + hash2(cx, cz, 426 + i) * 2.2 : 0.7 + hash2(cx, cz, 434 + i) * 0.8;
            d.position.set(px, w.hAt(px, pz) - 0.012 * sc, pz);
            d.rotation.set((hash2(cx, cz, 442 + i) - 0.5) * 0.4, hash2(cx, cz, 450 + i) * 6.28, (hash2(cx, cz, 458 + i) - 0.5) * 0.4);
            d.scale.set(sc, sc * (0.7 + hash2(cx, cz, 466 + i) * 0.5), sc);
            d.updateMatrix();
            this.rock.setMatrixAt(nR, d.matrix);
            col.setScalar(0.82 + hash2(cx, cz, 474 + i) * 0.3).lerp(SNOWC, s.snow * 0.75);
            this.rock.setColorAt(nR++, col);
          }
        } else if (t === VEG_CAVE) {
          // même repère que le trou creusé dans le relief (TerrainView)
          const f = w.caveFrame(cx, cz);
          d.position.set(f.x, f.y, f.z);
          d.rotation.set(0, f.yaw, 0);
          d.scale.setScalar(1);
          d.updateMatrix();
          this.cave.setMatrixAt(nC, d.matrix);
          this.cave.setColorAt(nC++, col.setScalar(1));
        } else if (t === VEG_WRECK) {
          // coque échouée, à moitié enfoncée et gîtée
          const px = cx + 0.5, pz = cz + 0.5;
          d.position.set(px, w.hAt(px, pz) - 0.06, pz);
          d.rotation.set(0, hash2(cx, cz, 501) * 6.28, 0.22 + hash2(cx, cz, 502) * 0.15, 'YXZ');
          d.scale.setScalar(1.1);
          d.updateMatrix();
          this.wreck.setMatrixAt(nWr, d.matrix);
          this.wreck.setColorAt(nWr++, col.setScalar(0.9 + hash2(cx, cz, 503) * 0.15));
        } else if (t === VEG_VOLCANO) {
          // bassin de lave au fond du cratère, panache de fumée
          const px = cx + 0.5, pz = cz + 0.5, y = w.hAt(px, pz);
          d.position.set(px, y + 0.03, pz);
          d.rotation.set(0, 0, 0);
          d.scale.setScalar(1);
          d.updateMatrix();
          this.lava.setMatrixAt(nL++, d.matrix);
          for (let i = 0; i < SMOKE_PER_VOLCANO; i++) {
            d.position.set(px + (hash2(cx, cz, 510 + i) - 0.5) * 0.3, y + 0.2, pz + (hash2(cx, cz, 520 + i) - 0.5) * 0.3);
            d.scale.setScalar(0.8 + hash2(cx, cz, 530 + i) * 0.5);
            d.updateMatrix();
            this.smokePhase.setX(nSm, i / SMOKE_PER_VOLCANO + hash2(cx, cz, 540 + i) * 0.1);
            this.smoke.setMatrixAt(nSm, d.matrix);
            this.smoke.setColorAt(nSm++, col.setScalar(0.85 + hash2(cx, cz, 550 + i) * 0.2));
          }
        } else if (t === VEG_GARDEN) {
          if (s.growth < 0.12) continue;
          const g = 0.4 + 0.6 * s.growth;
          for (let r = 0; r < GARDEN_ROWS; r++)
            for (let c = 0; c < GARDEN_COLS; c++) {
              const gx = cx * GARDEN_COLS + c, gz = cz * GARDEN_ROWS + r;
              const px = cx + (c + 0.5 + (hash2(gx, gz, 201) - 0.5) * 0.3) / GARDEN_COLS;
              const pz = cz + (r + 0.5 + (hash2(gx, gz, 202) - 0.5) * 0.15) / GARDEN_ROWS;
              const h = hash2(gx, gz, 203);
              const rot = hash2(gx, gz, 204) * 6.28;
              const shade = 0.88 + hash2(gx, gz, 205) * 0.22;
              // un rang sur trois est fleuri, les autres sont des légumes (citrouilles en automne)
              if ((gz % 3 === 1 && h < 0.85) || h < 0.12) {
                plantAt(px, pz, 0.7 * g, 0.9, rot, col.setHex(0x78b862).multiplyScalar(shade));
                if (s.leaf > 0.5) {
                  d.position.set(px, w.hAt(px, pz), pz);
                  d.scale.setScalar(g);
                  d.updateMatrix();
                  this.blossom.setMatrixAt(nF, d.matrix);
                  const hue = FLOWER_HUES[Math.floor(hash2(gx, gz, 206) * FLOWER_HUES.length)];
                  col.setHSL(hue, hue === 0.58 ? 0.15 : 0.75, hue === 0.58 ? 0.95 : 0.72);
                  this.blossom.setColorAt(nF++, col);
                }
              } else {
                const pumpkin = h > 0.8 && s.foliage2.r > s.foliage2.g;
                col.copy(pumpkin ? PUMPKIN : VEG_COLORS[Math.floor(hash2(gx, gz, 207) * VEG_COLORS.length)]).lerp(SNOWC, s.snow * 0.7).multiplyScalar(shade);
                plantAt(px, pz, (pumpkin ? 1.05 : 0.95) * g, pumpkin ? 0.85 : 1, rot, col);
              }
            }
        }
      }
    const set = (m: THREE.InstancedMesh, n: number) => {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    set(this.trunk, nT); set(this.blob, nB); set(this.blob2, nB2); set(this.pine, nP);
    set(this.wheat, nW); set(this.plant, nPl); set(this.blossom, nF); set(this.tuft, nTu); set(this.rock, nR); set(this.cave, nC);
    set(this.wreck, nWr); set(this.kelp, nK); set(this.coral, nCo); set(this.lava, nL); set(this.smoke, nSm);
    this.smokePhase.needsUpdate = true;
    this.pineVars.forEach((v, i) => { set(v.leaf, nPV[i]); set(v.wood, nPV[i]); });
    if (this.shrub) set(this.shrub, nS);
  }
}

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
 * Entrée de grotte (face à +z, le tunnel s'enfonce vers -z) : le relief est découpé devant le tunnel (TerrainView),
 * on voit donc l'intérieur sombre ; la coque rocheuse n'apparaît que là où elle dépasse du versant
 */
function caveGeo(): THREE.BufferGeometry {
  const p = new Parts();
  const R = CAVE.r, D = CAVE.depth, SY = CAVE.h / CAVE.r, F = 0.04;
  const R1 = 0xb3aca6, R2 = 0x9c948e, R3 = 0xc4bcb6;
  const rk = (r: number, sx: number, sy: number, sz: number) => new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz);
  const half = (r: number, len: number) => new THREE.CylinderGeometry(r, r, len, 12, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  // coque extérieure et son rebord
  p.add(half(R + 0.07, D).scale(1, SY, 1), 0, 0, F - D / 2, R2);
  p.add(new THREE.RingGeometry(R, R + 0.07, 12, 1, 0, Math.PI).scale(1, SY, 1), 0, 0, F, R1);
  // tunnel (faces tournées vers l'intérieur) et sol, de plus en plus sombres, puis le fond noir
  for (const [z1, len, c] of [[F, D * 0.4, 0x4a4039], [F - D * 0.4, D * 0.6, 0x1c1714]] as [number, number, number][]) {
    p.add(half(R, len).scale(-1, SY, 1), 0, 0, z1 - len / 2, c);
    p.add(new THREE.PlaneGeometry(R * 2, len).rotateX(-Math.PI / 2), 0, 0.004, z1 - len / 2, c);
  }
  // seuil : prolonge le sol au-delà de la découpe du relief pour ne laisser aucun jour
  p.add(new THREE.PlaneGeometry(R * 2.2, 0.14).rotateX(-Math.PI / 2), 0, 0.002, F + 0.05, 0x5a4e45);
  p.add(new THREE.CircleGeometry(R, 12, 0, Math.PI).scale(1, SY, 1), 0, 0, F - D, 0x080605);
  // pierres qui encadrent l'arche, linteau, éboulis au pied
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; p.add(rk(0.06, 1, 0.9, 0.8), Math.cos(a) * (R + 0.06), Math.sin(a) * (R + 0.06) * SY, F + 0.02, i % 2 ? R3 : R2, i); }
  p.add(rk(0.2, 1.6, 0.5, 1.1), 0.02, CAVE.h + 0.1, 0, R1, 0.3);
  p.add(rk(0.07, 1.3, 0.6, 1), -0.22, 0.02, F + 0.12, R2, 0.7);
  p.add(rk(0.05, 1, 0.7, 1), 0.26, 0.01, F + 0.15, R3, 1.9);
  return p.build().body;
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
