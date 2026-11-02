import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, VR, VS } from '../world/world';
import { troopRoute, routeAt, TroopRoute, FIGHT_HALT } from '../world/underground';
import { Underground, Entrance, UWALL, ROCK_ISO, FLOOR_ISO, UZ_STONE, UZ_CRYSTAL, UZ_ICE, UZ_LUSH, UZ_MAGMA, POOL_WATER, POOL_LAVA, POOL_Y, ORE_KINDS, oreVeins } from '../world/underground';
import { bakeStatic, StaticModel, makeActor, play, hasModel, Actor, AGE_VILLAGERS, ModelName, HUMAN, HUMAN_K } from './assets';
import { makeRider, rideStep, Rider } from './riders';
import { makeSoldier, soldierStep, Soldier } from './soldiers';
import { rockShapes } from './treeShapes';
import { groundDetailTexture } from './textures';
import { caveLights, caveLit, glowMaterial, MAX_CAVE_LIGHTS } from './caveLight';
import { UnderMobs, Mob, MobKind } from './mobs';
import { campLayout, buildCamp, stepCamp, Camp } from './camp';
import { CAMP_QUESTS, CAMP_GUARDS } from '../sim/depths';
import { MINER_SPEED } from '../sim/railway';
import { hash2, smoothstep } from '../core/rng';

const BG = new THREE.Color(0x09070c);
/**
 * Sol et parois, par zone (pierre, cristal, glace, luxuriante, magma) : une même roche partout, chaque zone n'en change que
 * la nuance — c'est son décor (cristaux, givre, mousse, lave) qui la signe. Le sol est plus clair que les parois
 */
const FLOOR = [0x9c9184, 0x948da6, 0xaec4d0, 0x8f9a76, 0x75625a].map((c) => new THREE.Color(c));
const WALL = [0x80776c, 0x7a7488, 0x92a6b2, 0x7a8268, 0x66524c].map((c) => new THREE.Color(c));
/** dessus des parois (la roche coupée) : un même gris très sombre, à peine teinté par la zone */
const TOP = new THREE.Color(0x2a272e);
/** eau : peu profonde près des rives, sombre au fond ; braises sous la lave */
const SHALLOW = new THREE.Color(0x4f9a94), DEEP = new THREE.Color(0x0c2a36), EMBER = new THREE.Color(0x5a1c0e);
/** Part de la normale de face : parois taillées à facettes, comme les rochers de surface */
const FACE_MIX = 0.85;
const CRYSTAL = [0x8fd0ff, 0xc77dff, 0xa6ecff, 0x7dffb6, 0xff7a3a].map((c) => new THREE.Color(c));
const SHROOM = [0x3fe0cf, 0x9b7dff, 0x5fc8ff, 0xffa24a].map((c) => new THREE.Color(c));
const STALAG = [0xa89c8c, 0x9a92b0, 0xdcecf6, 0x8e9878, 0x6e5a52].map((c) => new THREE.Color(c));
/** Minerais, façon Minecraft, dans l'ordre de ORE_KINDS : charbon, fer, or, redstone, lapis, diamant, émeraude */
const ORES: { col: THREE.Color; glow: boolean }[] = [
  [0x2c2c30, false], [0xd8b28c, false], [0xf5cf45, false], [0xe3352d, true], [0x2f58d4, false], [0x5ef0e4, true], [0x36d468, true],
].map(([c, glow]) => ({ col: new THREE.Color(c as number), glow: glow as boolean }));

/** Troupe d'une expédition armée, telle que le jeu la décrit : descendue par `entry`, elle va de filon en filon, puis pousse jusqu'à `front` */
export interface Troop {
  id: number; kind: 'cavalry' | 'armor' | 'miners'; n: number; entry: number; targets: number[]; front: number; progress: number; age: number;
  /** embuscades sur son chemin : case, créatures, nombre, moment (temps de parcours) et issue */
  ambush: { cell: number; kind: MobKind; n: number; t0: number; result: 'clean' | 'hurt' | 'rout' | null }[];
}
/** un membre de la troupe : à pied (`actor`) ou cavalier de l'époque, cheval compris (`rider`) */
interface TroopMember { actor: Actor | null; rider: Rider | null; soldier: Soldier | null }
interface TroopShow {
  route: TroopRoute; path: [number, number][]; members: TroopMember[]; light: Source; scareT: number;
  /** créatures de chaque embuscade, et embuscades terminées */
  foes: Map<number, Mob[]>; over: Set<number>;
}
const T_WALK = ['Walking_A', 'Walk'], T_IDLE = ['Idle'], T_HACK = ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', 'Interact', 'Use_Item', 'Idle'];
/** Bassins : remontés d'une case autour pour que la rive coupe la pente du sol */
const MAX_TORCHES = 64;
/** Teinte du sol des galeries tenues : terre battue chaude */
const HELD_FLOOR = [0.78, 0.64, 0.45];
/** Lanternes des galeries tenues : une par bloc de CLAIM_GRID × CLAIM_GRID cases, au plus MAX_CLAIM */
const CLAIM_GRID = 5, MAX_CLAIM = 900;
/** Hauteur des colonnes de jour sous les entrées */
const SHAFT_H = 4;
/** Temps entre deux choix des sources de lumière les plus proches */
const LIGHT_PICK = 0.25;

interface Source { x: number; y: number; z: number; r: number; c: THREE.Color; flicker: number }
/** Garde du camp : il va de poste en poste par les galeries, torche au poing, et s'y arrête face à l'extérieur */
interface Guard { soldier: Soldier; x: number; z: number; heading: number; path: [number, number][]; wait: number; post: number; light: Source }
/** Mineur descendu par le train : il abat le filon au pic ; un sur trois porte le minerai jusqu'au camp et revient */
interface Miner { actor: Actor; x: number; z: number; heading: number; path: [number, number][]; goal: number; wait: number }
/** Équipe d'une ligne : ses mineurs, la lueur de leurs lampes au filon, les places autour du filon en cours */
interface Crew { key: string; miners: Miner[]; light: Source; slotsAt: number; slots: [number, number, number][] }
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
  private minedN = -1;
  /** troupes des expéditions armées en train de parcourir les galeries */
  private troops = new Map<number, TroopShow>();
  private oreMeshes: Record<string, THREE.InstancedMesh> = {};
  private sources: Source[] = [];
  private torchSources: Source[] = [];
  private lantern: Source = { x: 0, y: 0, z: 0, r: 7.5, c: new THREE.Color(1, 0.78, 0.52).multiplyScalar(0.7), flicker: 0 };
  private shaftSources: Source[] = [];
  private active: Source[] = [];
  private lightTimer = 0;
  private uTime = { value: 0 };
  private uDay = { value: 1 };
  private built = -1;
  private torchMesh: THREE.InstancedMesh;
  private flameMesh: THREE.InstancedMesh;
  /** galeries tenues : poteaux à lanterne, et bannières du village sur le front et sous les avant-postes */
  private claimPost: THREE.InstancedMesh;
  private claimLamp: THREE.InstancedMesh;
  private bannerPole: THREE.InstancedMesh;
  private bannerCloth: THREE.InstancedMesh;
  private claimSources: Source[] = [];
  private claimedN = -1;
  private claimBuilt = -1;
  /** camp souterrain : ses pièces, ses lumières, ses gardes ; reconstruit quand il grandit */
  private camp: Camp | null = null;
  private campKey = '';
  /** âge du village : les soldats du camp et des troupes sont ceux de l'époque (donné par le jeu) */
  age = 2;
  private campT = 0;
  private campC: [number, number] = [0, 0];
  private campSources: Source[] = [];
  private guards: Guard[] = [];
  /** cases couvertes par les décors du camp : les gardes passent autour */
  private campBlocked = new Set<number>();
  /** équipes de mineurs descendues par les trains (une par ligne) */
  private crews = new Map<number, Crew>();
  /** couleurs du sol telles que générées, avant l'éclaircissement des galeries tenues */
  private groundBase: Float32Array | null = null;
  private models: Record<string, StaticModel | null> = {};
  private rockPieces: THREE.BufferGeometry[] = [];
  private d = new THREE.Object3D();
  private fog = new THREE.Fog(BG, 12, 40);

  constructor(private world: World, readonly under: Underground) {
    this.scene.background = BG;
    this.scene.fog = this.fog;
    // lumière rasante : les parois ont un côté clair et un côté sombre, les facettes se lisent
    this.scene.add(new THREE.HemisphereLight(0xb4bcdc, 0x3a3230, 1.45));
    const dir = new THREE.DirectionalLight(0xd0d6ff, 2.9);
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
  diffuseColor.rgb *= 1.0 + (gd - 0.5) * 0.28;`);
    };
    const ground = new THREE.Mesh(this.groundGeo, caveLit(groundMat, 'under-ground'));
    this.scene.add(ground, this.content);

    // torches posées par le joueur : manche et flamme qui vacille
    const stick = new THREE.CylinderGeometry(0.018, 0.024, 0.34, 6).translate(0, 0.17, 0);
    this.torchMesh = new THREE.InstancedMesh(stick, caveLit(new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9 }), 'torch'), MAX_TORCHES);
    this.flameMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.04, 0.12, 6).translate(0, 0.39, 0), flameMaterial(this.uTime), MAX_TORCHES);
    for (const m of [this.torchMesh, this.flameMesh]) { m.count = 0; m.frustumCulled = false; this.scene.add(m); }

    // galeries tenues : poteau de fer à potence, lanterne qui luit ; bannière bleue à bande d'or
    const post = mergeGeometries([
      new THREE.CylinderGeometry(0.03, 0.04, 0.95, 6).translate(0, 0.475, 0),
      new THREE.BoxGeometry(0.24, 0.028, 0.028).translate(0.1, 0.95, 0),
      new THREE.CylinderGeometry(0.08, 0.1, 0.05, 6).translate(0, 0.025, 0),
      new THREE.ConeGeometry(0.09, 0.07, 4).rotateY(Math.PI / 4).translate(0.2, 0.92, 0),
    ].map((g) => g.toNonIndexed()))!;
    this.claimPost = new THREE.InstancedMesh(post, caveLit(new THREE.MeshStandardMaterial({ color: 0x3c3c40, roughness: 0.7, metalness: 0.3 }), 'claim-post'), MAX_CLAIM);
    this.claimLamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.15, 0.11).translate(0.2, 0.8, 0), new THREE.MeshBasicMaterial({ color: 0xffd890 }), MAX_CLAIM);
    this.bannerPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.024, 0.032, 1.5, 5).translate(0, 0.75, 0), caveLit(new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.9 }), 'banner-pole'), MAX_CLAIM);
    const cloth = mergeGeometries([
      new THREE.BoxGeometry(0.014, 0.42, 0.32).translate(0, 1.18, 0.16).toNonIndexed(),
      new THREE.BoxGeometry(0.018, 0.08, 0.32).translate(0, 1.26, 0.16).toNonIndexed(),
    ].map((g, i) => { g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).map((_, j) => (i ? [0.91, 0.78, 0.42] : [0.23, 0.42, 0.72])[j % 3]), 3)); g.deleteAttribute('uv'); return g; }))!;
    this.bannerCloth = new THREE.InstancedMesh(cloth, caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'banner-cloth'), MAX_CLAIM);
    for (const m of [this.claimPost, this.claimLamp, this.bannerPole, this.bannerCloth]) { m.count = 0; m.frustumCulled = false; this.scene.add(m); }

    this.mobs = new UnderMobs(under);
    this.mobs.held = () => this.world.claimed;
    this.scene.add(this.mobs.group);

    this.models = {
      crystal: bakeStatic('crystal', 0.5, /./), crystal2: bakeStatic('crystal2', 0.42, /./), mineral: bakeStatic('mineral', 0.3, /pink/i),
      mushroom: bakeStatic('mushroom', 0.08, /red/i), fern: bakeStatic('fern', 0.16, /./), cobweb: bakeStatic('cobweb', 0.42, /^$/),
      skull: bakeStatic('skull', 0.07, /^$/), ribcage: bakeStatic('ribcage', 0.12, /^$/), bone: bakeStatic('bone', 0.024, /^$/),
    };
    this.rockPieces = rockShapes().map((p) => p.geometry);
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
    this.claimedN = -1;
  }

  // ---------- Relief ----------

  private buildGround() {
    const u = this.under, vis = u.vis;
    const pos = new Float32Array(VS * VS * 3), nor = new Float32Array(VS * VS * 3);
    // par sommet : part de paroi, de dessus, de liseré, strates, ombre au pied des parois, et nuances de sol et de paroi
    // fondues d'une zone à l'autre
    const fWall = new Float32Array(VS * VS), fTop = new Float32Array(VS * VS), fRim = new Float32Array(VS * VS), fStrata = new Float32Array(VS * VS), fAo = new Float32Array(VS * VS);
    const vFloor = new Float32Array(VS * VS * 3), vWall = new Float32Array(VS * VS * 3), wz = new Float32Array(5);
    const tmp = new THREE.Color(), wallC = new THREE.Color(), floorC = new THREE.Color();
    const zoneW = smoothZones(u), FL = FLOOR.map((c) => c.toArray()), WL = WALL.map((c) => c.toArray());
    // contours lisses : un sommet proche du bord du dessus ou du pied d'une paroi glisse jusque sur la ligne exacte du
    // contour (le long de la pente du champ d'ouverture), à la hauteur du dessus ou du sol ; plus de dents de scie
    const op = u.vOpen, hv = new Float32Array(VS * VS);
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const i = z * VS + x;
        let fx = x / VR, fz = z / VR, h = vis[i];
        const o = op[i];
        if (o > 0.02 && o < 0.7) {
          const xl = Math.max(0, x - 1), xr = Math.min(VS - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(VS - 1, z + 1);
          const gx = (op[z * VS + xr] - op[z * VS + xl]) / (xr - xl), gz = (op[zr * VS + x] - op[zl * VS + x]) / (zr - zl), g = Math.hypot(gx, gz);
          if (g > 1e-4) {
            const dTop = (ROCK_ISO - o) / g, dFoot = (FLOOR_ISO - o) / g, top = Math.abs(dTop) <= Math.abs(dFoot), d = top ? dTop : dFoot;
            if (Math.abs(d) < 0.55) {
              fx += (gx / g) * d / VR; fz += (gz / g) * d / VR;
              h = top ? UWALL + u.vBump1[i] : u.vGround[i] + u.vBump0[i];
            }
          }
        }
        pos[i * 3] = fx; pos[i * 3 + 1] = h; pos[i * 3 + 2] = fz;
        hv[i] = h;
      }
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const i = z * VS + x, h = hv[i], fx = x / VR, fz = z / VR;
        const xl = Math.max(0, x - 1), xr = Math.min(VS - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(VS - 1, z + 1);
        const dx = ((hv[z * VS + xr] - hv[z * VS + xl]) * VR) / (xr - xl), dz = ((hv[zr * VS + x] - hv[zl * VS + x]) * VR) / (zr - zl);
        const l = Math.hypot(dx, 1, dz);
        nor[i * 3] = -dx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -dz / l;
        // voisinage : le plus bas (dessus de paroi s'il reste haut) et ce qui domine le point (ombre au pied des parois)
        let lo = h, occ = 0;
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            if (!dx && !dz) continue;
            const nx = Math.min(VS - 1, Math.max(0, x + dx)), nz = Math.min(VS - 1, Math.max(0, z + dz)), nh = hv[nz * VS + nx];
            if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) lo = Math.min(lo, nh);
            occ += Math.max(0, Math.min(nh, 1.2) - Math.max(h, 0)) / Math.hypot(dx, dz);
          }
        // strates sur les parois ; liseré clair au bord du dessus ; dessus de la roche sombre ; ombre au pied des parois
        fWall[i] = smoothstep(0.25, 1.15, h);
        fTop[i] = smoothstep(0.9, 1.15, lo);
        fRim[i] = smoothstep(0.8, 1.05, h) * (1 - fTop[i]);
        fStrata[i] = smoothstep(0.82, 1, Math.sin(h * 11 + Math.sin(fx * 0.9 + fz * 0.6) * 1.4));
        fAo[i] = 1 - Math.min(0.4, occ * 0.045) * (1 - fWall[i]);
        // nuances des zones, fondues ; le sol varie un peu, en grandes plages douces
        zoneW(fx, fz, wz);
        const tone = 1 + Math.sin(fx * 0.37 + Math.sin(fz * 0.29) * 2) * Math.sin(fz * 0.31 + fx * 0.11) * 0.05;
        for (let q = 0; q < 3; q++) {
          let f = 0, wl = 0;
          for (let zq = 0; zq < 5; zq++) { f += wz[zq] * FL[zq][q]; wl += wz[zq] * WL[zq][q]; }
          vFloor[i * 3 + q] = f * tone; vWall[i * 3 + q] = wl;
        }
      }
    /** Couleur d'un sommet : sol, paroi à strates, liseré clair au bord du dessus, dessus sombre, ombre au pied */
    const shade = (i: number) => {
      floorC.fromArray(vFloor, i * 3); wallC.fromArray(vWall, i * 3);
      const top = TOP.clone().lerp(wallC, 0.12);
      tmp.copy(floorC).lerp(wallC.clone().multiplyScalar(1 - fStrata[i] * 0.1), fWall[i]).lerp(wallC.clone().multiplyScalar(1.18), fRim[i] * 0.75).lerp(top, fTop[i]);
      tmp.multiplyScalar(fAo[i]);
      // fond des bassins : eau claire près des rives, sombre au fond ; braises sous la lave
      const h = hv[i];
      if (h < -0.1) {
        // braises si une lave est toute proche (les rives d'un bassin de lave ne prennent pas la teinte de l'eau)
        const cx = Math.floor(pos[i * 3]), cz = Math.floor(pos[i * 3 + 2]);
        let lava = false;
        for (let dz = -2; dz <= 2 && !lava; dz++) for (let dx = -2; dx <= 2 && !lava; dx++) lava = u.pool[Math.min(N - 1, Math.max(0, cz + dz)) * N + Math.min(N - 1, Math.max(0, cx + dx))] === POOL_LAVA;
        tmp.lerp(lava ? EMBER : SHALLOW.clone().lerp(DEEP, smoothstep(-0.22, -0.55, h)), smoothstep(-0.12, -0.2, h));
      }
      return tmp;
    };
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
      // chaque facette a sa nuance, comme une roche taillée, et la teinte de la zone où elle se trouve
      const jit = 0.965 + (Math.abs(Math.sin(t * 12.9898) * 43758.5453) % 1) * 0.07;
      e1.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
      e2.set(pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]);
      fnv.crossVectors(e2, e1).normalize();
      if (fnv.y < 0) fnv.negate();
      for (let j = 0; j < 3; j++) {
        const v = idx[t + j], o = (t + j) * 3;
        const sc = shade(v);
        for (let q = 0; q < 3; q++) fp[o + q] = pos[v * 3 + q];
        fc[o] = sc.r * jit; fc[o + 1] = sc.g * jit; fc[o + 2] = sc.b * jit;
        fn[o] = nor[v * 3] * (1 - FACE_MIX) + fnv.x * FACE_MIX;
        fn[o + 1] = nor[v * 3 + 1] * (1 - FACE_MIX) + fnv.y * FACE_MIX;
        fn[o + 2] = nor[v * 3 + 2] * (1 - FACE_MIX) + fnv.z * FACE_MIX;
      }
    }
    const g = this.groundGeo;
    g.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(fn, 3));
    g.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    this.groundBase = fc.slice();
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
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const n = (z + dz) * N + x + dx; if (n >= 0 && n < N * N) cells.add(n); }
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
        : caveLit(new THREE.MeshStandardMaterial({ color: 0x2a7f96, emissive: 0x06222a, roughness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }), 'under-water');
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.own = true;
      this.content.add(mesh);
      // la lave éclaire les parois alentour (une source toutes les quelques cases)
      if (kind === POOL_LAVA)
        for (const k of cells) {
          const x = k % N, z = Math.floor(k / N);
          if (u.pool[k] === POOL_LAVA && x % 3 === 0 && z % 3 === 0) this.sources.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, r: 3.6, c: new THREE.Color(1, 0.4, 0.12).multiplyScalar(1.6), flicker: 0.15 });
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
        this.sources.push({ x: px, y: py + 0.45, z: pz, r: big ? 4 : 2.4, c: base.clone().multiplyScalar(big ? 0.95 : 0.5), flicker: 0 });
        continue;
      }
      // grotte luxuriante : champignons géants lumineux, touffes de petits champignons, fougères
      if (zone === UZ_LUSH) {
        if (wd >= 2 && h(80) < 0.07) {
          const c = tmp.copy(SHROOM[Math.floor(h(81) * SHROOM.length)]);
          const s = 13 + h(82) * 10;
          add('mushroomCap', px, py - 0.02, pz, h(83) * 6.28, s, c, (h(84) - 0.5) * 0.25, h(85) * 6.28);
          add('mushroomStem', px, py - 0.02, pz, h(83) * 6.28, s, WHITE, (h(84) - 0.5) * 0.25, h(85) * 6.28);
          this.sources.push({ x: px, y: py + s * 0.07, z: pz, r: 3.2, c: c.clone().multiplyScalar(0.7), flicker: 0 });
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
      // éboulis : au pied des parois, galets sur les rives des lacs, quelques blocs ailleurs
      const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => u.pool[(cz + dz) * N + cx + dx] === POOL_WATER);
      if ((wd <= 1 && h(146) < 0.16) || (shore && h(147) < 0.45)) {
        const r = Math.floor(h(148) * this.rockPieces.length), s = shore ? 0.6 + h(149) * 0.8 : 0.9 + h(149) * 1.3;
        const q = shore ? (h(155) - 0.5) * 0.5 : 0;
        add(`rock${r}`, px + q, u.heightAt(px + q, pz) - 0.02, pz, h(143) * 6.28, s, tmp.copy(WALL[zone]).multiplyScalar(0.72 + h(144) * 0.25), 0, 0, s * (0.5 + h(145) * 0.4));
        continue;
      }
      // blocs, ossements, toiles d'araignée
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
    this.minedN = this.world.mined.size;
    for (const { k, ore: oi } of oreVeins(u, this.world.mined)) {
      const cx = k % N, cz = Math.floor(k / N), ore = ORES[oi];
      const vein = { mesh: ore.glow ? 'oreGlow' : 'ore', idx: [] as number[], ore: oi };
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

  /** Filon de minerai le plus proche du point cliqué : sa sorte et son rendement, ou null (on ne l'extrait qu'en expédition armée) */
  veinAt(x: number, z: number): { name: string; amount: number } | null {
    let best = -1, bd = 1.4;
    for (const k of this.veins.keys()) {
      const d = Math.hypot((k % N) + 0.5 - x, Math.floor(k / N) + 0.5 - z);
      if (d < bd) { bd = d; best = k; }
    }
    return best < 0 ? null : ORE_KINDS[this.veins.get(best)!.ore];
  }

  /** Les filons abattus par une troupe disparaissent des parois */
  private dropMined() {
    if (this.world.mined.size === this.minedN) return;
    this.minedN = this.world.mined.size;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [k, v] of this.veins) {
      if (!this.world.mined.has(k)) continue;
      const im = this.oreMeshes[v.mesh];
      if (im) { for (const i of v.idx) im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; }
      this.veins.delete(k);
    }
  }

  // ---------- Troupes armées ----------

  /** Les troupes en expédition sous terre, à chaque image : elles marchent de filon en filon, torche au poing */
  setTroops(list: Troop[], dt: number) {
    const live = new Set<number>();
    for (const t of list) {
      live.add(t.id);
      let s = this.troops.get(t.id) ?? null;
      if (!s) { s = this.makeTroop(t); if (!s) continue; this.troops.set(t.id, s); }
      this.moveTroop(s, t, dt);
    }
    for (const [id, s] of this.troops) if (!live.has(id)) {
      for (const m of s.members) this.scene.remove((m.rider ?? m.soldier ?? m.actor)!.root);
      for (const fs of s.foes.values()) for (const f of fs) this.mobs.kill(f);
      this.troops.delete(id);
    }
  }

  private makeTroop(t: Troop): TroopShow | null {
    // le même parcours que celui du jeu : filons, front, haltes de combat aux embuscades
    const route = troopRoute(this.under, t.entry, t.targets, t.front, t.ambush.map((m) => m.cell));
    const path = route.cells.map((k): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5]);
    if (path.length < 2) return null;
    // soldats de l'époque (légionnaires, chevaliers, fantassins napoléoniens, militaires), cavaliers montés, ou mineurs de
    // l'époque et leur garde
    const members: TroopMember[] = [];
    const folk = AGE_VILLAGERS[Math.min(t.age, 4)];
    for (let i = 0; i < t.n; i++) {
      // la cavalerie : cavaliers de l'époque sur leurs chevaux, comme les jouteurs des jardins
      if (t.kind === 'cavalry' && i < 3) {
        const rider = makeRider(t.age, t.id + i);
        this.scene.add(rider.root);
        members.push({ actor: null, rider, soldier: null });
        continue;
      }
      if (t.kind !== 'miners' || i === 0) {
        const soldier = makeSoldier(t.age, t.id + i, i === 0);
        this.scene.add(soldier.root);
        members.push({ actor: null, rider: null, soldier });
        continue;
      }
      const name: ModelName = folk[i % folk.length];
      const actor = hasModel(name) ? makeActor(name, HUMAN, 'height') : null;
      if (!actor) continue;
      actor.mixer.setTime(i * 0.37);
      this.scene.add(actor.root);
      members.push({ actor, rider: null, soldier: null });
    }
    if (!members.length) return null;
    const light: Source = { x: path[0][0], y: 0, z: path[0][1], r: 5, c: new THREE.Color(1, 0.62, 0.3).multiplyScalar(2), flicker: 0.25 };
    return { route, path, members, light, scareT: 0, foes: new Map(), over: new Set() };
  }

  /** Point du chemin à la distance s (en cases) et cap de marche */
  private along(path: [number, number][], s: number): [number, number, number] {
    const i = Math.max(0, Math.min(path.length - 2, Math.floor(s))), f = Math.max(0, Math.min(1, s - i));
    const a = path[i], b = path[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
  }

  private moveTroop(s: TroopShow, t: Troop, dt: number) {
    // l'avancement de l'expédition se lit en chemin parcouru, avec une halte à chaque filon et à chaque embuscade
    const time = t.progress * s.route.total, { pos, leg } = routeAt(s.route, time);
    const mining = leg?.kind === 'mine', fighting = leg?.kind === 'fight';
    const lead = this.along(s.path, pos);
    this.ambushes(s, t, time, lead);
    s.members.forEach((m, i) => {
      let x: number, z: number, h: number;
      if (fighting) {
        // en cercle, face aux assaillants
        const a = (i / s.members.length) * Math.PI * 2 + 0.6, r = m.rider ? 0.42 : 0.3;
        x = lead[0] + Math.sin(a) * r; z = lead[1] + Math.cos(a) * r; h = a;
      } else if (mining) {
        // autour du filon : les uns frappent la paroi, les autres montent la garde
        const a = i * 2.1 + 0.5;
        x = lead[0] + Math.cos(a) * 0.32 * (i ? 1 : 0.3); z = lead[1] + Math.sin(a) * 0.32 * (i ? 1 : 0.3); h = Math.atan2(lead[0] - x, lead[1] - z) + (i % 2 ? Math.PI : 0);
      } else {
        const p = this.along(s.path, Math.max(0, pos - i * 0.45));
        const side = (i % 2 ? 1 : -1) * 0.12;
        x = p[0] + Math.cos(p[2]) * side; z = p[1] - Math.sin(p[2]) * side; h = p[2];
      }
      const y = this.under.heightAt(x, z);
      if (m.rider) {
        // à la charge, lance couchée ou sabre en avant ; au filon, ceux qui font face à la paroi frappent, les autres gardent
        m.rider.root.position.set(x, y, z); m.rider.root.rotation.y = h;
        rideStep(m.rider, this.uTime.value * 13 + i * 1.7, fighting ? 0.3 : mining ? 0 : 1, fighting ? 'fight' : mining ? (i % 2 ? 'rest' : 'fight') : 'charge');
      } else if (m.soldier) {
        // au filon, les uns frappent, les autres montent la garde
        m.soldier.root.position.set(x, y, z); m.soldier.root.rotation.y = h;
        soldierStep(m.soldier, this.uTime.value * 9 + i * 1.3, fighting ? 'fight' : mining ? (i % 2 ? 'guard' : 'fight') : 'walk');
      } else if (m.actor) {
        m.actor.root.position.set(x, y, z); m.actor.root.rotation.y = h;
        play(m.actor, fighting ? T_HACK : mining ? (i % 2 ? T_IDLE : T_HACK) : T_WALK);
        m.actor.mixer.update(dt);
      }
    });
    // la torche du chef éclaire la troupe ; les créatures s'enfuient devant elle
    Object.assign(s.light, { x: lead[0], y: this.under.heightAt(lead[0], lead[1]) + 0.55, z: lead[1] });
    if ((s.scareT -= dt) <= 0) { s.scareT = 1; this.mobs.scare(lead[0], lead[1], 2.6); }
  }

  /** Position de la tête d'une troupe (pour que la caméra la suive), ou null si elle n'est pas sous terre */
  troopAt(id: number): [number, number] | null {
    const s = this.troops.get(id), m = s?.members[0];
    const o = m ? (m.rider ?? m.soldier ?? m.actor)!.root.position : null;
    return o ? [o.x, o.z] : null;
  }

  /**
   * Embuscades : les créatures surgissent un peu avant que la troupe n'arrive et la chargent ; pendant le combat elles
   * tombent une à une ; à la fin, les dernières meurent, ou s'en retournent dans le noir si la troupe a dû reculer
   */
  private ambushes(s: TroopShow, t: Troop, time: number, lead: [number, number, number]) {
    t.ambush.forEach((m, j) => {
      if (s.over.has(j)) return;
      if (time >= m.t0 + FIGHT_HALT) {
        for (const f of s.foes.get(j) ?? []) if (m.result === 'rout') this.mobs.rout(f, lead[0], lead[1]); else this.mobs.kill(f);
        s.over.add(j);
        return;
      }
      if (time < m.t0 - 10) return;
      let foes = s.foes.get(j);
      if (!foes) { foes = this.mobs.ambush(m.kind, m.n, m.cell); s.foes.set(j, foes); }
      for (const f of foes) if (f.alive && f.dying < 0) f.foe = [lead[0], lead[1]];
      if (time < m.t0) return;
      // tombées jusqu'ici : toutes à la fin d'une victoire, toutes sauf une si un soldat est blessé, la moitié si l'on recule
      const quota = m.result === 'rout' ? Math.floor(m.n / 2) : m.n - (m.result === 'hurt' ? 1 : 0);
      const due = Math.min(quota, Math.floor(((time - m.t0) / FIGHT_HALT) * (quota + 1)));
      let down = foes.filter((f) => !f.alive || f.dying >= 0).length;
      for (const f of foes) if (down < due && f.alive && f.dying < 0) { this.mobs.kill(f); down++; }
    });
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

  /**
   * Galeries tenues : une lanterne par bloc de cases, sur la case la plus dégagée ; une bannière là où la zone tenue touche
   * les galeries sauvages (le front), et sous chaque avant-poste. Elles éclairent : ce qui est tenu se voit de loin
   */
  private refreshClaims() {
    const w = this.world, u = this.under, held = w.claimed, d = this.d;
    this.claimedN = held.size;
    this.claimSources = [];
    let nl = 0, nb = 0;
    const put = (mesh: THREE.InstancedMesh, i: number, x: number, z: number, ry: number) => {
      d.position.set(x, u.heightAt(x, z), z); d.rotation.set(0, ry, 0); d.scale.setScalar(1); d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    };
    const blocks = new Map<number, { lamp: number; lw: number; front: number }>();
    for (const k of held) {
      const x = k % N, z = Math.floor(k / N);
      if (!u.walkable(x, z) || u.heightAt(x + 0.5, z + 0.5) > 0.45) continue;
      const bk = Math.floor(z / CLAIM_GRID) * N + Math.floor(x / CLAIM_GRID);
      let b = blocks.get(bk);
      if (!b) { b = { lamp: -1, lw: -1, front: -1 }; blocks.set(bk, b); }
      const wd = u.wallDist[k] + hash2(x, z, 610) * 0.5;
      if (wd > b.lw) { b.lw = wd; b.lamp = k; }
      if (b.front < 0 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => u.walkable(x + dx, z + dz) && !held.has((z + dz) * N + x + dx))) b.front = k;
    }
    for (const b of blocks.values()) {
      if (nl < MAX_CLAIM && b.lamp >= 0) {
        const x = (b.lamp % N) + 0.5, z = Math.floor(b.lamp / N) + 0.5, ry = hash2(b.lamp, 1, 611) * Math.PI * 2;
        put(this.claimPost, nl, x, z, ry); put(this.claimLamp, nl, x, z, ry); nl++;
        this.claimSources.push({ x: x + Math.cos(ry) * 0.2, y: u.heightAt(x, z) + 0.9, z: z - Math.sin(ry) * 0.2, r: 4.2, c: new THREE.Color(1, 0.78, 0.45).multiplyScalar(1.8), flicker: 0.08 });
      }
      if (nb < MAX_CLAIM && b.front >= 0 && b.front !== b.lamp) { const x = (b.front % N) + 0.5, z = Math.floor(b.front / N) + 0.5; put(this.bannerPole, nb, x, z, 0); put(this.bannerCloth, nb, x, z, hash2(b.front, 2, 611) * 6.28); nb++; }
    }
    // sous chaque avant-poste, la bannière du village au pied du puits de jour
    for (const b of w.buildings.values()) {
      if (b.kind !== 'outpost' || nb >= MAX_CLAIM) continue;
      const cell = w.outpostEntrance(b.x, b.z, 2), ent = u.entrances.find((e) => e.cell === cell), k = ent ? u.under(ent) : -1;
      if (k < 0) continue;
      const x = (k % N) + 0.5 + 0.35, z = Math.floor(k / N) + 0.5 + 0.35;
      put(this.bannerPole, nb, x, z, 0); put(this.bannerCloth, nb, x, z, 0.6); nb++;
    }
    this.tintHeld();
    this.claimPost.count = this.claimLamp.count = nl;
    this.bannerPole.count = this.bannerCloth.count = nb;
    for (const m of [this.claimPost, this.claimLamp, this.bannerPole, this.bannerCloth]) m.instanceMatrix.needsUpdate = true;
  }

  /** Le sol des galeries tenues s'éclaircit en terre battue chaude, fondue sur une case autour (les parois gardent leur teinte) */
  private tintHeld() {
    const base = this.groundBase, attr = this.groundGeo.attributes.color as THREE.BufferAttribute | undefined;
    if (!base || !attr || attr.array.length !== base.length) return;
    const held = new Float32Array(N * N), out = attr.array as Float32Array, pos = this.groundGeo.attributes.position.array as Float32Array;
    for (const k of this.world.claimed) held[k] = 1;
    for (let v = 0; v < pos.length; v += 3) {
      const x = pos[v], h = pos[v + 1], z = pos[v + 2];
      const ix = Math.floor(x - 0.5), iz = Math.floor(z - 0.5), a = x - 0.5 - ix, b = z - 0.5 - iz;
      let k = 0;
      if (ix >= 0 && iz >= 0 && ix < N - 1 && iz < N - 1) {
        const i = iz * N + ix;
        k = held[i] * (1 - a) * (1 - b) + held[i + 1] * a * (1 - b) + held[i + N] * (1 - a) * b + held[i + N + 1] * a * b;
        k *= 1 - smoothstep(0.25, 0.9, h);
      }
      for (let q = 0; q < 3; q++) out[v + q] = base[v + q] + (HELD_FLOOR[q] - base[v + q]) * k * 0.3;
    }
    attr.needsUpdate = true;
  }

  // ---------- Camp souterrain ----------

  /** Case de galerie sous le puits du premier avant-poste (le plus ancien qui garde une entrée), ou -1 */
  private campCenter() {
    const w = this.world, u = this.under;
    const posts = [...w.buildings.values()].filter((b) => b.kind === 'outpost').sort((a, b) => a.id - b.id);
    for (const b of posts) {
      const cell = w.outpostEntrance(b.x, b.z, 2), ent = u.entrances.find((e) => e.cell === cell), k = ent ? u.under(ent) : -1;
      if (k >= 0) return k;
    }
    return -1;
  }

  /** (Re)construit le camp s'il a grandi, ou si le souterrain ou l'avant-poste ont changé */
  private refreshCamp() {
    const level = Math.min(CAMP_QUESTS.length, this.world.exp.camp), center = level ? this.campCenter() : -1;
    const key = `${level}|${this.under.version}|${center}|${Math.min(this.age, 4)}`;
    if (key === this.campKey) return;
    this.campKey = key;
    if (this.camp) { this.scene.remove(this.camp.group); this.camp.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    for (const g of this.guards) this.scene.remove(g.soldier.root);
    this.camp = null; this.campSources = []; this.guards = [];
    if (center < 0) return;
    this.campC = [(center % N) + 0.5, Math.floor(center / N) + 0.5];
    const placed = campLayout(this.under, center, level);
    this.camp = buildCamp(this.under, placed, this.age);
    this.campBlocked.clear();
    for (const pc of placed) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor(pc.x) + dx, cz = Math.floor(pc.z) + dz;
      if (Math.hypot(cx + 0.5 - pc.x, cz + 0.5 - pc.z) < pc.r * 0.85) this.campBlocked.add(cz * N + cx);
    }
    this.scene.add(this.camp.group);
    this.campSources = this.camp.lights.map((l) => ({ ...l, flicker: 0.18 }));
    // les gardes de l'époque prennent leur poste, torche au poing pour la moitié d'entre eux
    const posts = this.camp.posts.length ? this.camp.posts : [this.campC];
    for (let i = 0; i < CAMP_GUARDS[level]; i++) {
      const soldier = makeSoldier(this.age, i, i % 2 === 0);
      this.scene.add(soldier.root);
      const [x, z] = posts[i % posts.length];
      this.guards.push({ soldier, x, z, heading: Math.atan2(x - this.campC[0], z - this.campC[1]), path: [], wait: 1 + i * 0.9, post: i % posts.length,
        light: { x, y: 0.5, z, r: 2.2, c: new THREE.Color(1, 0.62, 0.3).multiplyScalar(0.55), flicker: 0.25 } });
    }
  }

  /** Chemin de case en case qui contourne les décors du camp (ses bornes comprises), ou null */
  private campRoute(from: number, to: number): number[] | null {
    const u = this.under, prev = new Map<number, number>([[from, -1]]), q = [from];
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      if (k === to) break;
      const x = k % N, z = Math.floor(k / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, n = nz * N + nx;
        if (prev.has(n) || !u.walkable(nx, nz) || (this.campBlocked.has(n) && n !== to)) continue;
        prev.set(n, k); q.push(n);
      }
      if (q.length > 4000) break;
    }
    if (!prev.has(to)) return u.route(from, to);
    const out: number[] = [];
    for (let k = to; k >= 0; k = prev.get(k)!) out.push(k);
    return out.reverse();
  }

  /** Les gardes vont de poste en poste par les galeries, s'y arrêtent quelques secondes face à l'extérieur */
  private stepGuards(dt: number) {
    const u = this.under, posts = this.camp?.posts ?? [];
    this.guards.forEach((g, i) => {
      if (g.path.length) {
        const [tx, tz] = g.path[0], dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz), s = Math.min(d, dt * 0.55);
        if (d > 1e-3) { g.x += (dx / d) * s; g.z += (dz / d) * s; g.heading = Math.atan2(dx, dz); }
        if (d - s < 0.02) g.path.shift();
        if (!g.path.length) { g.wait = 3 + hash2(i, g.post, 77) * 5; g.heading = Math.atan2(g.x - this.campC[0], g.z - this.campC[1]); }
        soldierStep(g.soldier, this.uTime.value * 8 + i, 'walk');
      } else {
        soldierStep(g.soldier, this.uTime.value * 8 + i, 'guard');
        g.wait -= dt;
        if (g.wait <= 0 && posts.length > 1) {
          let next = Math.floor(Math.random() * posts.length);
          if (next === g.post) next = (next + 1) % posts.length;
          const [px, pz] = posts[next], r = this.campRoute(Math.floor(g.z) * N + Math.floor(g.x), Math.floor(pz) * N + Math.floor(px));
          g.post = next;
          g.path = r ? [...r.slice(1, -1).map((k): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5]), [px, pz]] : [];
          if (!g.path.length) g.wait = 2;
        }
      }
      const y = u.heightAt(g.x, g.z);
      g.soldier.root.position.set(g.x, y, g.z);
      g.soldier.root.rotation.y = g.heading;
      Object.assign(g.light, { x: g.x, y: y + 0.5, z: g.z });
    });
  }

  // ---------- Mineurs du train ----------

  /**
   * Les mineurs descendus par les trains, à chaque image (une équipe par ligne) : au filon qu'ils abattent, ou à la roche
   * près du camp quand les galeries tenues n'ont plus de filon ; les porteurs font la navette entre le filon et le camp
   */
  setMiners(list: { id: number; n: number; entry: number; vein: number }[], age: number, dt: number) {
    const live = new Set<number>();
    for (const c of list) {
      live.add(c.id);
      let crew = this.crews.get(c.id);
      const key = `${c.n}|${Math.min(age, 4)}|${c.entry}`;
      if (!crew || crew.key !== key) {
        if (crew) for (const m of crew.miners) this.scene.remove(m.actor.root);
        crew = { key, miners: [], light: { x: 0, y: -20, z: 0, r: 4, c: new THREE.Color(1, 0.72, 0.45).multiplyScalar(1.3), flicker: 0.2 }, slotsAt: -2, slots: [] };
        this.crews.set(c.id, crew);
        const folk = AGE_VILLAGERS[Math.min(age, 4)];
        for (let i = 0; i < c.n; i++) {
          const name = folk[i % folk.length], actor = hasModel(name) ? makeActor(name, HUMAN, 'height') : null;
          if (!actor) continue;
          actor.mixer.setTime(i * 0.53);
          this.holdPick(actor);
          this.scene.add(actor.root);
          const x = (c.entry % N) + 0.5 + Math.cos(i * 2.4) * 0.3, z = Math.floor(c.entry / N) + 0.5 + Math.sin(i * 2.4) * 0.3;
          crew.miners.push({ actor, x, z, heading: 0, path: [], goal: -1, wait: i * 0.6 });
        }
      }
      this.stepCrew(crew, c.entry, c.vein, dt);
    }
    for (const [id, crew] of this.crews) if (!live.has(id)) { for (const m of crew.miners) this.scene.remove(m.actor.root); this.crews.delete(id); }
  }

  private stepCrew(crew: Crew, entry: number, vein: number, dt: number) {
    if (!crew.miners.length) return;
    const u = this.under, work = vein >= 0 ? vein : entry, slots = this.workSlots(crew, work);
    const ex = (entry % N) + 0.5, ez = Math.floor(entry / N) + 0.5;
    let wi = 0;
    crew.miners.forEach((m, i) => {
      // chacun sa place le long de la paroi ; les porteurs vont et viennent jusqu'au camp
      const carrier = i % 3 === 2 && vein >= 0, slot = slots[(carrier ? i : wi++) % slots.length];
      const home: [number, number, number] = [ex + Math.cos(i * 2.4) * 0.3, ez + Math.sin(i * 2.4) * 0.3, 0];
      if (m.goal !== work && !(carrier && m.goal === entry)) this.walkTo(m, work, slot);
      if (m.path.length) {
        const [tx, tz] = m.path[0], dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz), s = Math.min(d, dt * MINER_SPEED);
        if (d > 1e-3) { m.x += (dx / d) * s; m.z += (dz / d) * s; m.heading = Math.atan2(dx, dz); }
        if (d - s < 0.02) m.path.shift();
        if (!m.path.length) m.wait = carrier ? 3 + (i % 2) * 1.5 : 0;
        play(m.actor, T_WALK);
      } else {
        // au filon, face à la roche, on frappe ; au camp, le porteur vide sa hotte
        if (m.goal === work) m.heading = slot[2];
        play(m.actor, m.goal === work ? T_HACK : T_IDLE);
        if (carrier && (m.wait -= dt) <= 0) this.walkTo(m, m.goal === work ? entry : work, m.goal === work ? home : slot);
      }
      const y = u.heightAt(m.x, m.z);
      m.actor.root.position.set(m.x, y, m.z);
      m.actor.root.rotation.y = m.heading;
      m.actor.mixer.update(dt);
    });
    const wx = (work % N) + 0.5, wz = Math.floor(work / N) + 0.5;
    Object.assign(crew.light, { x: wx, y: u.heightAt(wx, wz) + 0.6, z: wz });
  }

  /** Le mineur prend le chemin des galeries jusqu'à sa place (x, z), autour de la case `goal` */
  private walkTo(m: Miner, goal: number, at: [number, number, number]) {
    const r = this.under.route(Math.floor(m.z) * N + Math.floor(m.x), Math.floor(at[1]) * N + Math.floor(at[0]));
    m.path = [...(r ?? []).slice(1, -1).map((k): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5]), [at[0], at[1]]];
    m.goal = goal;
  }

  /**
   * Places autour d'un filon (ou au camp) : les cases de galerie au pied de la roche à deux pas au plus, chacune tout
   * contre la paroi et tournée vers elle (x, z, cap), les plus proches d'abord
   */
  private workSlots(crew: Crew, work: number) {
    if (work === crew.slotsAt) return crew.slots;
    const u = this.under, seen = new Map<number, number>([[work, 0]]), q = [work], out: [number, number, number][] = [];
    while (q.length) {
      const k = q.shift()!, x = k % N, z = Math.floor(k / N), d = seen.get(k)!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (!u.open[n]) { out.push([x + 0.5 + dx * 0.24, z + 0.5 + dz * 0.24, Math.atan2(dx, dz)]); continue; }
        if (d < 2 && !seen.has(n) && u.walkable(nx, nz)) { seen.set(n, d + 1); q.push(n); }
      }
    }
    const cx = (work % N) + 0.5, cz = Math.floor(work / N) + 0.5;
    out.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
    crew.slotsAt = work;
    crew.slots = out.length ? out : [[cx, cz, 0]];
    return crew.slots;
  }

  /** Un pic dans la main droite du mineur */
  private holdPick(a: Actor) {
    let slot: THREE.Object3D | null = null;
    a.root.traverse((o) => { if (!slot && (o.name === 'handslot.r' || o.name === 'handslotr')) slot = o; });
    if (!slot) return;
    const node = slot as THREE.Object3D, t = new THREE.Group(), s = new THREE.Vector3();
    a.root.updateMatrixWorld(true);
    node.getWorldScale(s);
    t.scale.setScalar(HUMAN_K / Math.max(1e-6, s.x));
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.15, 5).translate(0, 0.05, 0), new THREE.MeshStandardMaterial({ color: 0x7a5a3c })));
    t.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.014).translate(0, 0.12, 0), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.3, roughness: 0.5 })));
    node.add(t);
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
    for (const s of this.shaftSources) s.c.setRGB(1, 0.95, 0.8).multiplyScalar(0.25 + 0.45 * daylight);
    if (this.world.claimed.size !== this.claimedN || this.claimBuilt !== this.world.buildings.size) { this.claimBuilt = this.world.buildings.size; this.refreshClaims(); }
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = LIGHT_PICK;
      const all = this.sources.concat(this.torchSources, this.shaftSources, this.claimSources, this.campSources, this.guards.map((g) => g.light), [...this.troops.values()].map((s) => s.light), [...this.crews.values()].filter((c) => c.miners.length).map((c) => c.light));
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
    this.dropMined();
    // le camp grandit avec ses quêtes ; ses feux vacillent, ses gardes patrouillent
    if ((this.campT -= dt) <= 0) { this.campT = 1; this.refreshCamp(); }
    if (this.camp) stepCamp(this.camp, this.uTime.value, dt);
    this.stepGuards(dt);
    this.mobs.update(dt, camera, this.lantern, [...this.torchPoints(), ...this.guards.map((g) => ({ x: g.x, z: g.z })), ...[...this.troops.values()].map((s) => ({ x: s.light.x, z: s.light.z })), ...[...this.crews.values()].flatMap((c) => c.miners.map((m) => ({ x: m.x, z: m.z })))]);
  }

  /** Sortie du souterrain : la surface ne reçoit plus ces lumières */
  leave() { caveLights.uLN.value = 0; }
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * Zones aux frontières fondues : la présence de chaque zone est floutée sur quelques cases ; renvoie, en un point, la part
 * de chacune (lue entre les centres de case)
 */
function smoothZones(u: Underground) {
  const Z = 5, w = new Float32Array(N * N * Z), t = new Float32Array(N * N * Z);
  for (let k = 0; k < N * N; k++) w[k * Z + u.zone[k]] = 1;
  const R = 3;
  for (let pass = 0; pass < 2; pass++)
    for (const [sx, sz] of [[1, 0], [0, 1]]) {
      t.set(w);
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++)
          for (let q = 0; q < Z; q++) {
            let s = 0;
            for (let d = -R; d <= R; d++) {
              const nx = Math.min(N - 1, Math.max(0, x + d * sx)), nz = Math.min(N - 1, Math.max(0, z + d * sz));
              s += t[(nz * N + nx) * Z + q];
            }
            w[(z * N + x) * Z + q] = s / (2 * R + 1);
          }
    }
  return (x: number, z: number, out: Float32Array) => {
    const fx = Math.min(N - 1.001, Math.max(0, x - 0.5)), fz = Math.min(N - 1.001, Math.max(0, z - 0.5));
    const ix = Math.floor(fx), iz = Math.floor(fz), a = fx - ix, b = fz - iz;
    let sum = 0;
    for (let q = 0; q < Z; q++) {
      out[q] = w[(iz * N + ix) * Z + q] * (1 - a) * (1 - b) + w[(iz * N + ix + 1) * Z + q] * a * (1 - b) + w[((iz + 1) * N + ix) * Z + q] * (1 - a) * b + w[((iz + 1) * N + ix + 1) * Z + q] * a * b;
      sum += out[q];
    }
    for (let q = 0; q < Z; q++) out[q] /= sum || 1;
  };
}

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
vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
void main() {
  // plaques de croûte (cellules), qui dérivent doucement ; les crevasses courent entre elles
  vec2 p = vP * 3.4 + vec2(uTime * 0.05, uTime * 0.03);
  vec2 i = floor(p), f = fract(p), cell = vec2(0.0);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = h2(i + g);
      o = 0.5 + 0.38 * sin(uTime * 0.35 + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; cell = i + g; } else if (d < d2) d2 = d;
    }
  float edge = sqrt(d2) - sqrt(d1);
  // la fonte coule, vive, avec ses remous plus clairs ; des plaques de croûte sombre y dérivent, éparses, bordées de lueurs
  vec2 q = vP * 1.3 + vec2(uTime * 0.12, uTime * 0.05);
  float flow = n(q) * 0.6 + n(q * 2.7 - uTime * 0.08) * 0.4;
  vec3 melt = mix(vec3(0.95, 0.3, 0.04), vec3(1.0, 0.62, 0.12), smoothstep(0.35, 0.75, flow));
  melt = mix(melt, vec3(1.0, 0.86, 0.45), smoothstep(0.78, 0.95, flow));
  float crusted = step(0.58, h(cell)) * smoothstep(0.05, 0.16, edge);
  float rim = 1.0 - smoothstep(0.16, 0.34, edge);
  vec3 crust = mix(vec3(0.16, 0.05, 0.035), vec3(0.28, 0.08, 0.04), h(cell * 1.7));
  crust = mix(crust, vec3(0.75, 0.2, 0.04), rim * 0.7);
  gl_FragColor = vec4(mix(melt, crust, crusted), 1.0);
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
