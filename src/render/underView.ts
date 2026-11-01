import * as THREE from 'three';
import { World, N, VR, VS } from '../world/world';
import { Underground, Entrance, UWALL, UZ_STONE, UZ_CRYSTAL, UZ_ICE, UZ_LUSH, UZ_MAGMA, POOL_WATER, POOL_LAVA, POOL_Y } from '../world/underground';
import { bakeStatic, splitPieces, StaticModel } from './assets';
import { groundDetailTexture } from './textures';
import { caveLights, caveLit, glowMaterial, MAX_CAVE_LIGHTS } from './caveLight';
import { UnderMobs } from './mobs';
import { hash2, smoothstep } from '../core/rng';

const BG = new THREE.Color(0x09070c);
/** Sol, parois et coupe de la roche, par zone (pierre, cristal, glace, luxuriante, magma) */
const FLOOR = [0x6f6358, 0x5c5474, 0x7d97a8, 0x4a7540, 0x3d312d].map((c) => new THREE.Color(c));
const WALL = [0x7d7168, 0x5f557c, 0x8eaec2, 0x66745a, 0x4a3933].map((c) => new THREE.Color(c));
const CUT = new THREE.Color(0x2a2420);
/** Part de la normale de face : parois taillées à facettes, comme les rochers de surface */
const FACE_MIX = 0.7;
const MUD = new THREE.Color(0x2b2622);
const CRYSTAL = [0x8fd0ff, 0xc77dff, 0xa6ecff, 0x7dffb6, 0xff7a3a].map((c) => new THREE.Color(c));
const SHROOM = [0x3fe0cf, 0x9b7dff, 0x5fc8ff, 0xffa24a].map((c) => new THREE.Color(c));
const STALAG = [0xb0a28f, 0x8d7fae, 0xe2f4ff, 0x7f8f6a, 0x3e322e].map((c) => new THREE.Color(c));
/** Minerais, façon Minecraft : charbon, fer, or, redstone, lapis, diamant, émeraude */
const ORES: { col: THREE.Color; glow: boolean; w: number }[] = [
  [0x2c2c30, false, 40], [0xd8b28c, false, 28], [0xf5cf45, false, 10], [0xe3352d, true, 8], [0x2f58d4, false, 7], [0x5ef0e4, true, 5], [0x36d468, true, 2],
].map(([c, glow, w]) => ({ col: new THREE.Color(c as number), glow: glow as boolean, w: w as number }));
const ORE_W = ORES.reduce((s, o) => s + o.w, 0);
/** Nom et rendement (unités de minerai) de chaque minerai, dans l'ordre de ORES */
const ORE_INFO: [string, number][] = [['charbon', 1], ['fer', 2], ['or', 3], ['rubis', 3], ['lapis-lazuli', 2], ['diamant', 5], ['émeraude', 5]];
/** Bassins : remontés d'une case autour pour que la rive coupe la pente du sol */
const MAX_TORCHES = 64;
/** Hauteur des colonnes de jour sous les entrées */
const SHAFT_H = 4;
/** Temps entre deux choix des sources de lumière les plus proches */
const LIGHT_PICK = 0.25;

interface Source { x: number; y: number; z: number; r: number; c: THREE.Color; flicker: number }
interface Item { m: THREE.Matrix4; c: THREE.Color }

/**
 * Monde souterrain : galeries en coupe (le dessus des parois est la tranche sombre de la roche), décor par zone,
 * lacs, lave, puits de jour aux entrées, torches du joueur et créatures ; seules les sources de lumière l'éclairent
 */
export class UnderView {
  scene = new THREE.Scene();
  mobs: UnderMobs;
  private groundGeo = new THREE.BufferGeometry();
  private content = new THREE.Group();
  /** filons de minerai : case du souterrain → maillage, instances et sorte de minerai */
  private veins = new Map<number, { mesh: string; idx: number[]; ore: number }>();
  private oreMeshes: Record<string, THREE.InstancedMesh> = {};
  private sources: Source[] = [];
  private torchSources: Source[] = [];
  private lantern: Source = { x: 0, y: 0, z: 0, r: 7.5, c: new THREE.Color(1, 0.78, 0.52).multiplyScalar(0.85), flicker: 0 };
  private shaftSources: Source[] = [];
  private active: Source[] = [];
  private lightTimer = 0;
  private uTime = { value: 0 };
  private uDay = { value: 1 };
  private built = -1;
  private torchMesh: THREE.InstancedMesh;
  private flameMesh: THREE.InstancedMesh;
  private models: Record<string, StaticModel | null> = {};
  private rockPieces: THREE.BufferGeometry[] = [];
  private d = new THREE.Object3D();
  private fog = new THREE.Fog(BG, 12, 40);

  constructor(private world: World, readonly under: Underground) {
    this.scene.background = BG;
    this.scene.fog = this.fog;
    // lumière rasante : les parois ont un côté clair et un côté sombre, les facettes se lisent
    this.scene.add(new THREE.HemisphereLight(0xa4acd4, 0x4a3e34, 1.7));
    const dir = new THREE.DirectionalLight(0xc4ccff, 3.2);
    dir.position.set(0.7, 0.75, 0.35);
    this.scene.add(dir);

    // sol et parois : couleurs de sommet, motif de roche projeté sur les trois axes, éclairage des sources
    const detail = groundDetailTexture();
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = { value: detail };
      sh.vertexShader = 'varying vec3 vGPos;\nvarying vec3 vGNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGPos = position;\n  vGNrm = normal;');
      sh.fragmentShader = 'uniform sampler2D uDetail;\nvarying vec3 vGPos;\nvarying vec3 vGNrm;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  vec3 gw = pow(abs(normalize(vGNrm)), vec3(4.0));
  gw /= gw.x + gw.y + gw.z;
  float gd = texture2D(uDetail, vGPos.zy * 0.7).b * gw.x + texture2D(uDetail, vGPos.xz * 0.7).b * gw.y + texture2D(uDetail, vGPos.xy * 0.7).b * gw.z;
  float gd2 = texture2D(uDetail, vGPos.xz * 0.13 + 0.3).b * gw.y + texture2D(uDetail, (vGPos.zy + vGPos.xy) * 0.13).b * (1.0 - gw.y);
  diffuseColor.rgb *= 1.0 + (gd - 0.5) * 0.55 + (gd2 - 0.5) * 0.35;`);
    };
    const ground = new THREE.Mesh(this.groundGeo, caveLit(groundMat, 'under-ground'));
    this.scene.add(ground, this.content);

    // torches posées par le joueur : manche et flamme qui vacille
    const stick = new THREE.CylinderGeometry(0.018, 0.024, 0.34, 6).translate(0, 0.17, 0);
    this.torchMesh = new THREE.InstancedMesh(stick, caveLit(new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9 }), 'torch'), MAX_TORCHES);
    this.flameMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.04, 0.12, 6).translate(0, 0.39, 0), flameMaterial(this.uTime), MAX_TORCHES);
    for (const m of [this.torchMesh, this.flameMesh]) { m.count = 0; m.frustumCulled = false; this.scene.add(m); }

    this.mobs = new UnderMobs(under);
    this.scene.add(this.mobs.group);

    this.models = {
      crystal: bakeStatic('crystal', 0.5, /./), crystal2: bakeStatic('crystal2', 0.42, /./), mineral: bakeStatic('mineral', 0.3, /pink/i),
      mushroom: bakeStatic('mushroom', 0.08, /red/i), fern: bakeStatic('fern', 0.16, /./), cobweb: bakeStatic('cobweb', 0.42, /^$/),
      skull: bakeStatic('skull', 0.07, /^$/), ribcage: bakeStatic('ribcage', 0.12, /^$/), bone: bakeStatic('bone', 0.024, /^$/),
    };
    const rocks = bakeStatic('rocks', 0.1, /stone/i);
    this.rockPieces = rocks?.tint ? splitPieces(rocks.tint).map((p) => p.geometry) : [new THREE.IcosahedronGeometry(0.06, 1).scale(1, 0.6, 0.85)];
  }

  /** Hauteur où pose la caméra : le sol, jamais le haut des parois */
  groundY(x: number, z: number) { return Math.min(0.4, Math.max(0, this.under.heightAt(x, z))); }

  /** (Re)construit tout après une régénération du souterrain */
  build() {
    if (this.built === this.under.version) return;
    this.built = this.under.version;
    // les géométries des modèles sont partagées d'une génération à l'autre : on ne libère que celles faites pour la carte
    for (const c of [...this.content.children]) {
      this.content.remove(c);
      if (c.userData.own) (c as THREE.Mesh).geometry.dispose();
    }
    this.sources = [];
    this.buildGround();
    this.buildPools();
    this.buildDecor();
    this.buildShafts();
    this.refreshTorches();
  }

  // ---------- Relief ----------

  private buildGround() {
    const u = this.under, vis = u.vis;
    const pos = new Float32Array(VS * VS * 3), col = new Float32Array(VS * VS * 3), nor = new Float32Array(VS * VS * 3);
    const tmp = new THREE.Color(), wallC = new THREE.Color(), floorC = new THREE.Color();
    const zoneMix = (fx: number, fz: number, pal: THREE.Color[], out: THREE.Color) => {
      // mélange bilinéaire des teintes des quatre cases voisines
      const ix = Math.floor(fx - 0.5), iz = Math.floor(fz - 0.5), a = fx - 0.5 - ix, b = fz - 0.5 - iz;
      out.setRGB(0, 0, 0);
      for (const [dx, dz, w] of [[0, 0, (1 - a) * (1 - b)], [1, 0, a * (1 - b)], [0, 1, (1 - a) * b], [1, 1, a * b]]) {
        const c = pal[u.zoneAt(ix + dx, iz + dz)];
        out.r += c.r * w; out.g += c.g * w; out.b += c.b * w;
      }
      return out;
    };
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const i = z * VS + x, h = vis[i], fx = x / VR, fz = z / VR;
        pos[i * 3] = fx; pos[i * 3 + 1] = h; pos[i * 3 + 2] = fz;
        const xl = Math.max(0, x - 1), xr = Math.min(VS - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(VS - 1, z + 1);
        const dx = ((vis[z * VS + xr] - vis[z * VS + xl]) * VR) / (xr - xl), dz = ((vis[zr * VS + x] - vis[zl * VS + x]) * VR) / (zr - zl);
        const l = Math.hypot(dx, 1, dz);
        nor[i * 3] = -dx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -dz / l;
        zoneMix(fx, fz, FLOOR, floorC);
        zoneMix(fx, fz, WALL, wallC);
        // strates sur les parois, coupe sombre au sommet, vase au fond des bassins
        const wall = smoothstep(0.3, 1.25, h), cut = smoothstep(UWALL - 0.55, UWALL - 0.1, h);
        const strata = smoothstep(0.82, 1, Math.sin(h * 11 + Math.sin(fx * 0.9 + fz * 0.6) * 1.4));
        tmp.copy(floorC).lerp(wallC.multiplyScalar(1 - strata * 0.18), wall).lerp(CUT, cut);
        if (h < -0.05) tmp.lerp(MUD, smoothstep(-0.05, -0.4, h));
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
    const idx = new Uint32Array((VS - 1) * (VS - 1) * 6);
    let n = 0;
    for (let z = 0; z < VS - 1; z++)
      for (let x = 0; x < VS - 1; x++) {
        const a = z * VS + x, b = a + 1, c = a + VS, d = c + 1;
        // même découpe que heightAt (diagonale a → d)
        idx[n++] = a; idx[n++] = c; idx[n++] = d;
        idx[n++] = a; idx[n++] = d; idx[n++] = b;
      }
    // triangles séparés : normale lissée mêlée à celle de la face (facettes de roche)
    const fp = new Float32Array(idx.length * 3), fc = new Float32Array(idx.length * 3), fn = new Float32Array(idx.length * 3);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fnv = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      e1.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
      e2.set(pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]);
      fnv.crossVectors(e2, e1).normalize();
      if (fnv.y < 0) fnv.negate();
      for (let j = 0; j < 3; j++) {
        const v = idx[t + j], o = (t + j) * 3;
        for (let q = 0; q < 3; q++) { fp[o + q] = pos[v * 3 + q]; fc[o + q] = col[v * 3 + q]; }
        fn[o] = nor[v * 3] * (1 - FACE_MIX) + fnv.x * FACE_MIX;
        fn[o + 1] = nor[v * 3 + 1] * (1 - FACE_MIX) + fnv.y * FACE_MIX;
        fn[o + 2] = nor[v * 3 + 2] * (1 - FACE_MIX) + fnv.z * FACE_MIX;
      }
    }
    const g = this.groundGeo;
    g.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(fn, 3));
    g.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    g.computeBoundingSphere();
  }

  /** Lacs sombres qui reflètent les lueurs, lave qui coule ; chaque bassin déborde d'une case pour couper la rive */
  private buildPools() {
    const u = this.under;
    for (const kind of [POOL_WATER, POOL_LAVA]) {
      const cells = new Set<number>();
      for (let k = 0; k < N * N; k++) {
        if (u.pool[k] !== kind) continue;
        const x = k % N, z = Math.floor(k / N);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (u.open[(z + dz) * N + x + dx]) cells.add((z + dz) * N + x + dx);
      }
      if (!cells.size) continue;
      const pos: number[] = [], y = POOL_Y[kind];
      for (const k of cells) {
        const x = k % N, z = Math.floor(k / N);
        pos.push(x, y, z, x, y, z + 1, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x + 1, y, z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const mat = kind === POOL_LAVA ? lavaMaterial(this.uTime)
        : caveLit(new THREE.MeshStandardMaterial({ color: 0x0e3846, emissive: 0x031418, roughness: 0.12, transparent: true, opacity: 0.86 }), 'under-water');
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.own = true;
      this.content.add(mesh);
      // la lave éclaire les parois alentour (une source toutes les quelques cases)
      if (kind === POOL_LAVA)
        for (const k of cells) {
          const x = k % N, z = Math.floor(k / N);
          if (u.pool[k] === POOL_LAVA && x % 3 === 0 && z % 3 === 0) this.sources.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, r: 5, c: new THREE.Color(1, 0.38, 0.1).multiplyScalar(2.2), flicker: 0.15 });
        }
    }
  }

  // ---------- Décor ----------

  private buildDecor() {
    const u = this.under, d = this.d;
    const lists: Record<string, Item[]> = {};
    const add = (name: string, x: number, y: number, z: number, rot: number, s: number, c: THREE.Color, tilt = 0, tiltA = 0, sy = s) => {
      d.position.set(x, y, z);
      d.rotation.set(Math.cos(tiltA) * tilt, rot, Math.sin(tiltA) * tilt, 'YXZ');
      d.scale.set(s, sy, s);
      d.updateMatrix();
      (lists[name] ??= []).push({ m: d.matrix.clone(), c: c.clone() });
    };
    const tmp = new THREE.Color();
    for (let k = 0; k < N * N; k++) {
      if (!u.open[k] || u.pool[k]) continue;
      const cx = k % N, cz = Math.floor(k / N), zone = u.zone[k], wd = u.wallDist[k];
      const h = (s: number) => hash2(cx, cz, s);
      const px = cx + 0.15 + h(1) * 0.7, pz = cz + 0.15 + h(2) * 0.7, py = u.heightAt(px, pz);
      if (py > 0.5) continue;
      // cristaux : forêts d'améthyste, glace, quelques géodes ailleurs ; ils éclairent leur coin
      const crystalP = [0.025, wd <= 2 ? 0.45 : 0.18, 0.16, 0.02, 0.05][zone];
      if (h(3) < crystalP) {
        const n = 1 + Math.floor(h(4) * 3), big = zone === UZ_CRYSTAL && h(5) < 0.12;
        const base = tmp.copy(CRYSTAL[zone]).offsetHSL((h(6) - 0.5) * 0.06, 0, 0);
        for (let i = 0; i < n; i++) {
          const qx = px + (h(10 + i) - 0.5) * 0.4, qz = pz + (h(20 + i) - 0.5) * 0.4;
          const s = (big ? 2.6 + h(30 + i) * 1.6 : 0.6 + h(30 + i) * 0.9) * (zone === UZ_CRYSTAL ? 1.2 : 0.9);
          const model = h(40 + i) < 0.45 ? 'crystal' : h(40 + i) < 0.8 ? 'crystal2' : 'mineral';
          add(model, qx, u.heightAt(qx, qz) - 0.03, qz, h(50 + i) * 6.28, s, base, (h(60 + i) - 0.5) * 0.5, h(70 + i) * 6.28);
        }
        this.sources.push({ x: px, y: py + 0.45, z: pz, r: big ? 4.5 : 2.6, c: base.clone().multiplyScalar(big ? 1.5 : 0.85), flicker: 0 });
        continue;
      }
      // grotte luxuriante : champignons géants lumineux, touffes de petits champignons, fougères
      if (zone === UZ_LUSH) {
        if (wd >= 2 && h(80) < 0.07) {
          const c = tmp.copy(SHROOM[Math.floor(h(81) * SHROOM.length)]);
          const s = 13 + h(82) * 10;
          add('mushroomCap', px, py - 0.02, pz, h(83) * 6.28, s, c, (h(84) - 0.5) * 0.25, h(85) * 6.28);
          add('mushroomStem', px, py - 0.02, pz, h(83) * 6.28, s, WHITE, (h(84) - 0.5) * 0.25, h(85) * 6.28);
          this.sources.push({ x: px, y: py + s * 0.07, z: pz, r: 3.6, c: c.clone().multiplyScalar(1.2), flicker: 0 });
          continue;
        }
        if (h(86) < 0.22) {
          const c = tmp.copy(SHROOM[Math.floor(h(87) * SHROOM.length)]);
          for (let i = 0; i < 2 + Math.floor(h(88) * 3); i++) {
            const qx = px + (h(90 + i) - 0.5) * 0.35, qz = pz + (h(95 + i) - 0.5) * 0.35, s = 1.6 + h(100 + i) * 2.2;
            add('mushroomCap', qx, u.heightAt(qx, qz) - 0.01, qz, h(105 + i) * 6.28, s, c);
            add('mushroomStem', qx, u.heightAt(qx, qz) - 0.01, qz, h(105 + i) * 6.28, s, WHITE);
          }
        }
        if (h(110) < 0.4) for (let i = 0; i < 1 + Math.floor(h(111) * 2); i++) {
          const qx = cx + 0.1 + h(112 + i) * 0.8, qz = cz + 0.1 + h(116 + i) * 0.8;
          add('fern', qx, u.heightAt(qx, qz) - 0.02, qz, h(120 + i) * 6.28, 0.8 + h(124 + i) * 0.7, tmp.setRGB(0.2, 0.48, 0.24));
        }
      }
      // stalagmites au pied des parois, quelques-unes au milieu des salles
      if (zone !== UZ_LUSH && h(130) < (wd <= 1 ? 0.24 : 0.035)) {
        const s = 0.6 + h(131) * 1.1;
        add('stalag', px, py - 0.04, pz, h(132) * 6.28, 0.12 + h(133) * 0.1, tmp.copy(STALAG[zone]).multiplyScalar(0.9 + h(134) * 0.2), 0, 0, s);
        continue;
      }
      // éboulis, ossements, toiles d'araignée
      if (h(140) < 0.05) {
        const r = Math.floor(h(141) * this.rockPieces.length), s = 1.5 + h(142) * 2.5;
        add(`rock${r}`, px, py - 0.02, pz, h(143) * 6.28, s, tmp.copy(WALL[zone]).multiplyScalar(0.85 + h(144) * 0.2), 0, 0, s * (0.6 + h(145) * 0.4));
      } else if ((zone === UZ_STONE || zone === UZ_MAGMA) && h(150) < 0.014) {
        add(['skull', 'ribcage', 'bone'][Math.floor(h(151) * 3)], px, py - 0.005, pz, h(152) * 6.28, 0.8 + h(153) * 0.5, tmp.setScalar(0.95));
      } else if ((zone === UZ_STONE || zone === UZ_CRYSTAL) && wd <= 1 && h(160) < 0.05) {
        const w = this.wallPoint(cx, cz, 0.15);
        if (w) add('cobweb', w[0], u.heightAt(w[0], w[1]) - 0.02, w[1], w[2], 0.8 + h(161) * 0.5, tmp.setScalar(0.92));
      }
    }
    // minerais incrustés dans les parois, façon Minecraft (plus précieux dans le magma) ; les filons exploités ont disparu
    this.veins.clear();
    for (let k = 0; k < N * N; k++) {
      if (!u.open[k] || u.wallDist[k] !== 1 || this.world.mined.has(k)) continue;
      const cx = k % N, cz = Math.floor(k / N), zone = u.zone[k];
      if (hash2(cx, cz, 200) > (zone === UZ_STONE ? 0.2 : 0.06)) continue;
      let r = hash2(cx, cz, 201) * ORE_W;
      if (zone === UZ_MAGMA) r = Math.min(ORE_W - 1, r + ORE_W * 0.3);
      let ore = ORES[0];
      for (const o of ORES) { if (r < o.w) { ore = o; break; } r -= o.w; }
      const vein = { mesh: ore.glow ? 'oreGlow' : 'ore', idx: [] as number[], ore: ORES.indexOf(ore) };
      this.veins.set(k, vein);
      const n = 3 + Math.floor(hash2(cx, cz, 202) * 3), y0 = 0.35 + hash2(cx, cz, 203) * 0.8;
      for (let i = 0; i < n; i++) {
        const w = this.wallPoint(cx, cz, y0 + (hash2(cx, cz, 210 + i) - 0.5) * 0.3, (hash2(cx, cz, 220 + i) - 0.5) * 0.5);
        if (!w) continue;
        const s = 0.06 + hash2(cx, cz, 230 + i) * 0.05;
        d.position.set(w[0] + Math.sin(w[2]) * 0.01, y0 + (hash2(cx, cz, 210 + i) - 0.5) * 0.3, w[1] + Math.cos(w[2]) * 0.01);
        d.rotation.set(hash2(cx, cz, 240 + i) * 3, hash2(cx, cz, 250 + i) * 3, hash2(cx, cz, 260 + i) * 3);
        d.scale.setScalar(s);
        d.updateMatrix();
        const list = (lists[vein.mesh] ??= []);
        vein.idx.push(list.length);
        list.push({ m: d.matrix.clone(), c: ore.col.clone().multiplyScalar(0.9 + hash2(cx, cz, 270 + i) * 0.2) });
      }
    }
    // maillages instanciés
    const stone = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 'under-stone');
    const soft = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'under-soft');
    const crystalMat = glowMaterial(0.55, 'under-crystal', { transparent: true, opacity: 0.92 });
    const capMat = glowMaterial(0.75, 'under-cap', { flatShading: false, roughness: 0.7 });
    const oreGlowMat = glowMaterial(0.9, 'under-ore');
    const geo = (m: StaticModel | null, part: 'tint' | 'rest') => (m ? m[part] ?? (part === 'tint' ? m.rest : m.tint) : null);
    const parts: Record<string, [THREE.BufferGeometry | null, THREE.Material]> = {
      crystal: [geo(this.models.crystal, 'tint') ?? new THREE.OctahedronGeometry(0.1).scale(0.6, 2.4, 0.6).translate(0, 0.2, 0), crystalMat],
      crystal2: [geo(this.models.crystal2, 'tint') ?? new THREE.OctahedronGeometry(0.08).scale(0.6, 2.2, 0.6).translate(0, 0.16, 0), crystalMat],
      mineral: [geo(this.models.mineral, 'tint'), crystalMat],
      mineralRock: [this.models.mineral?.rest ?? null, stone],
      mushroomCap: [geo(this.models.mushroom, 'tint') ?? new THREE.SphereGeometry(0.035, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.06, 0), capMat],
      mushroomStem: [this.models.mushroom?.rest ?? new THREE.CylinderGeometry(0.01, 0.014, 0.06, 6).translate(0, 0.03, 0), soft],
      fern: [geo(this.models.fern, 'tint'), soft],
      cobweb: [geo(this.models.cobweb, 'rest'), soft],
      skull: [geo(this.models.skull, 'rest'), soft],
      ribcage: [geo(this.models.ribcage, 'rest'), soft],
      bone: [geo(this.models.bone, 'rest'), soft],
      stalag: [stalagGeo(), stone],
      ore: [whiteBox(), stone],
      oreGlow: [whiteBox(), oreGlowMat],
    };
    this.rockPieces.forEach((g, i) => { parts[`rock${i}`] = [g, stone]; });
    // le minéral a un socle de roche : mêmes instances, roche grise
    if (lists.mineral) lists.mineralRock = lists.mineral.map((it) => ({ m: it.m, c: new THREE.Color(0.85, 0.85, 0.85) }));
    for (const [name, items] of Object.entries(lists)) {
      const [g, mat] = parts[name] ?? [null, stone];
      if (!g || !items.length) continue;
      const im = new THREE.InstancedMesh(g, mat, items.length);
      items.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
      im.frustumCulled = false;
      this.content.add(im);
      if (name === 'ore' || name === 'oreGlow') this.oreMeshes[name] = im;
    }
  }

  /** Extrait le filon de minerai le plus proche du point cliqué : il disparaît de la paroi ; sorte et quantité, ou null */
  mineAt(x: number, z: number): { name: string; amount: number } | null {
    let best = -1, bd = 1.4;
    for (const k of this.veins.keys()) {
      const d = Math.hypot((k % N) + 0.5 - x, Math.floor(k / N) + 0.5 - z);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return null;
    const v = this.veins.get(best)!, im = this.oreMeshes[v.mesh], zero = new THREE.Matrix4().makeScale(0, 0, 0);
    if (im) { for (const i of v.idx) im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; }
    this.veins.delete(best);
    this.world.mined.add(best);
    const [name, amount] = ORE_INFO[v.ore] ?? ORE_INFO[0];
    return { name, amount };
  }

  /** Un filon sous le point (pour le curseur) */
  veinNear(x: number, z: number) {
    for (const k of this.veins.keys()) if (Math.hypot((k % N) + 0.5 - x, Math.floor(k / N) + 0.5 - z) < 1.4) return true;
    return false;
  }

  /**
   * Point de la paroi la plus proche d'une case ouverte, à la hauteur y : on avance depuis le centre vers une case
   * de roche voisine jusqu'à rencontrer la pente ; renvoie [x, z, cap tourné vers la galerie]
   */
  private wallPoint(cx: number, cz: number, y: number, slide = 0): [number, number, number] | null {
    const u = this.under;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !u.isOpen(cx + dx + 0.5, cz + dz + 0.5));
    if (!dirs.length) return null;
    const [dx, dz] = dirs[Math.floor(hash2(cx, cz, 300) * dirs.length)];
    const sx = cx + 0.5 + dz * slide, sz = cz + 0.5 + dx * slide;
    for (let t = 0; t < 1.4; t += 0.04) {
      const x = sx + dx * t, z = sz + dz * t;
      if (u.heightAt(x, z) >= y) return [x, z, Math.atan2(-dx, -dz)];
    }
    return null;
  }

  /** Puits de jour sous chaque entrée : colonne de lumière, anneau au sol et éboulis ; ils éclairent la salle */
  private buildShafts() {
    const u = this.under;
    this.shaftSources = [];
    const shaftMat = shaftMaterial(this.uTime, this.uDay);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const e of u.entrances) {
      const y = u.heightAt(e.x, e.z);
      const fissure = e.kind === 'fissure';
      const g = new THREE.CylinderGeometry(fissure ? 0.3 : 0.45, fissure ? 0.6 : 0.85, SHAFT_H, 20, 1, true).translate(0, SHAFT_H / 2, 0);
      if (fissure) g.scale(1.8, 1, 0.5).rotateY(this.world.fissureFrame(Math.floor(e.x), Math.floor(e.z)).yaw);
      const shaft = new THREE.Mesh(g, shaftMat);
      shaft.position.set(e.x, y, e.z);
      shaft.renderOrder = 3;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), ringMat);
      ring.scale.setScalar(0.8);
      ring.position.set(e.x, y + 0.03, e.z);
      ring.userData.pulse = true;
      shaft.userData.own = ring.userData.own = true;
      this.content.add(shaft, ring);
      this.shaftSources.push({ x: e.x, y: y + 1.6, z: e.z, r: 5.5, c: new THREE.Color(1, 0.95, 0.8), flicker: 0 });
    }
  }

  // ---------- Torches ----------

  /** Pose ou retire une torche sur une case de galerie ; renvoie l'état obtenu, ou null si impossible */
  toggleTorch(x: number, z: number): boolean | null {
    const cx = Math.floor(x), cz = Math.floor(z), k = cz * N + cx, w = this.world;
    if (w.torches.has(k)) { w.torches.delete(k); this.refreshTorches(); return false; }
    if (!this.under.walkable(cx, cz) || this.under.heightAt(cx + 0.5, cz + 0.5) > 0.5 || w.torches.size >= MAX_TORCHES) return null;
    w.torches.add(k);
    this.refreshTorches();
    return true;
  }

  torchPoints() { return this.torchSources.map((s) => ({ x: s.x, z: s.z })); }

  private refreshTorches() {
    const d = this.d;
    this.torchSources = [];
    let n = 0;
    for (const k of this.world.torches) {
      const x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5;
      if (!this.under.walkable(Math.floor(x), Math.floor(z))) continue;
      const y = this.under.heightAt(x, z);
      d.position.set(x, y, z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.torchMesh.setMatrixAt(n, d.matrix);
      this.flameMesh.setMatrixAt(n, d.matrix);
      n++;
      this.torchSources.push({ x, y: y + 0.5, z, r: 4.8, c: new THREE.Color(1, 0.62, 0.3).multiplyScalar(2), flicker: 0.25 });
    }
    for (const m of [this.torchMesh, this.flameMesh]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }

  /** Entrée (puits de jour) sous le point visé */
  entranceAt(x: number, z: number): Entrance | null {
    let best: Entrance | null = null, bd = 1.3;
    for (const e of this.under.entrances) { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /** Point du relief sous un rayon */
  pick(ray: THREE.Ray): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    let prev = 0;
    for (let t = 0; t < 200; t += 0.08) {
      ray.at(t, p);
      if (p.x < 0 || p.z < 0 || p.x > N || p.z > N) { if (t > 5 && prev) break; continue; }
      prev = t;
      if (p.y <= this.under.heightAt(p.x, p.z)) return p;
    }
    return null;
  }

  // ---------- Image ----------

  update(dt: number, camera: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number, daylight: number) {
    this.uTime.value += dt;
    this.uDay.value = 0.25 + 0.75 * daylight;
    // brume seulement au loin : de près, la roche reste nette
    this.fog.near = dist * 1.6;
    this.fog.far = dist * 3.2 + 12;
    // lanterne du joueur au centre de la vue
    Object.assign(this.lantern, { x: target.x, y: this.groundY(target.x, target.z) + 1.3, z: target.z });
    for (const s of this.shaftSources) s.c.setRGB(1, 0.95, 0.8).multiplyScalar(0.6 + 2.2 * daylight);
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = LIGHT_PICK;
      const all = this.sources.concat(this.torchSources, this.shaftSources);
      const dd = (s: Source) => Math.hypot(s.x - target.x, s.z - target.z) - s.r;
      this.active = [this.lantern, ...all.filter((s) => dd(s) < dist * 1.2).sort((a, b) => dd(a) - dd(b)).slice(0, MAX_CAVE_LIGHTS - 1)];
    }
    const t = this.uTime.value;
    this.active.forEach((s, i) => {
      caveLights.uL.value[i].set(s.x, s.y, s.z, s.r);
      const f = s.flicker ? 1 + Math.sin(t * 13 + s.x * 7) * s.flicker * 0.5 + Math.sin(t * 7.3 + s.z * 5) * s.flicker * 0.5 : 1;
      caveLights.uLC.value[i].set(s.c.r * f, s.c.g * f, s.c.b * f);
    });
    caveLights.uLN.value = this.active.length;
    for (const c of this.content.children) if (c.userData.pulse) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 2.4) * 0.12;
    this.mobs.update(dt, camera, this.lantern, this.torchPoints());
  }

  /** Sortie du souterrain : la surface ne reçoit plus ces lumières */
  leave() { caveLights.uLN.value = 0; }
}

const WHITE = new THREE.Color(1, 1, 1);

/** Cube de minerai : blanc (la couleur vient de l'instance), arêtes nettes */
function whiteBox() {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

/** Stalagmite : cône bosselé, plus clair à la pointe */
function stalagGeo() {
  const g = new THREE.ConeGeometry(1, 1, 7, 4).translate(0, 0.5, 0);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), r = 1 + Math.sin(y * 9 + i) * 0.08;
    p.setX(i, p.getX(i) * r * (1 - y * 0.15));
    p.setZ(i, p.getZ(i) * r);
    c.fill(0.75 + 0.3 * y, i * 3, i * 3 + 3);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  return out;
}

/** Lave : bruit qui coule lentement, du rouge sombre au jaune ; non éclairée, elle brille */
function lavaMaterial(uTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime;
varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 p = vP * 1.7;
  float a = n(p + vec2(uTime * 0.15, uTime * 0.07)) * 0.6 + n(p * 2.3 - vec2(uTime * 0.11, -uTime * 0.13)) * 0.4;
  vec3 c = mix(vec3(0.5, 0.05, 0.02), vec3(1.0, 0.42, 0.05), smoothstep(0.3, 0.7, a));
  c = mix(c, vec3(1.0, 0.86, 0.4), smoothstep(0.78, 0.94, a));
  gl_FragColor = vec4(c, 1.0);
}`,
  });
}

/** Colonne de jour : plus vive en haut et sur les bords, poussière qui scintille */
function shaftMaterial(uTime: { value: number }, uDay: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uDay },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  vY = position.y / ${SHAFT_H.toFixed(1)};
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `uniform float uTime;
uniform float uDay;
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = 1.0 - abs(dot(vN, vV));
  float a = (0.25 + 0.75 * vY) * (1.0 - smoothstep(0.75, 1.0, vY)) * (0.35 + 0.65 * rim) * uDay;
  a *= 0.85 + 0.15 * sin(uTime * 1.3 + vY * 12.0);
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.75) * a * 0.28, 1.0);
}`,
  });
}

/** Flamme de torche : vacille et s'étire (phase selon la position) */
function flameMaterial(uTime: { value: number }) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
  float up = max(transformed.y - 0.33, 0.0);
  transformed.y += up * (0.4 * sin(uTime * 11.0 + ph) + 0.3 * sin(uTime * 17.0 + ph * 2.0));
  transformed.x += up * 0.5 * sin(uTime * 9.0 + ph);`);
  };
  m.customProgramCacheKey = () => 'flame';
  return m;
}
