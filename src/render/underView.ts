import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, VR, VS } from '../world/world';
import { troopRoute, routeAt, TroopRoute, FIGHT_HALT } from '../world/underground';
import { Underground, Entrance, UWALL, ROCK_ISO, FLOOR_ISO, UZ_STONE, UZ_CRYSTAL, UZ_ICE, UZ_LUSH, UZ_MAGMA, POOL_WATER, POOL_LAVA, POOL_Y, ORE_KINDS, oreVeins } from '../world/underground';
import { bakeStatic, StaticModel, HUMAN_K } from './assets';
import { makeRider, rideStep, Rider, makeArmor, armorStep, makeDrone, droneStep, Drone } from './riders';
import { makeSoldier, soldierStep, Soldier, SoldierMode } from './soldiers';
import { rockShapes } from './treeShapes';
import { groundDetailTexture } from './textures';
import { caveLights, caveLit, glowMaterial, MAX_CAVE_LIGHTS } from './caveLight';
import { UnderMobs, Mob, MobKind } from './mobs';
import { CombatFx } from './combatFx';
import { campLayout, buildCamp, stepCamp, Camp } from './camp';
import { CAMP_QUESTS, CAMP_GUARDS } from '../sim/depths';
import { MINER_SPEED } from '../sim/railway';
import { DIG_WALK, DIG_WALK_MAX } from '../sim/expeditions';
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
/**
 * un membre de la troupe : soldat, gendarme ou mineur à pied (`soldier`), ou cavalier de l'époque, cheval compris (`rider`) ;
 * dans la colonne blindée moderne, sa place en marche (recul derrière la tête, écart sur le côté), où il est (il y glisse) et
 * son cap ; pour un blindé, sa tourelle pointée, le recul de son arme et la rafale en cours
 */
interface TroopMember {
  rider: Rider | null; soldier: Soldier | null;
  slot?: [number, number]; x?: number; z?: number; h?: number; aim?: number; recoil?: number; burst?: number; burstT?: number;
}
/** Colonne blindée moderne : ses drones, la lumière de chaque projecteur (blindés, puis drones), l'éclair des coups de canon */
interface Column { drones: Drone[]; lamps: Source[]; flash: Source; dustT: number; battery: [number, number][] }
interface TroopShow {
  route: TroopRoute; path: [number, number][]; members: TroopMember[]; light: Source; scareT: number;
  /** créatures de chaque embuscade, et embuscades terminées */
  foes: Map<number, Mob[]>; over: Set<number>;
  /** temps avant le prochain coup de chaque membre (et la riposte de chaque créature) */
  cool: number[]; foeCool: Map<Mob, number>;
  modern?: Column;
}
/** Angle ramené entre -π et π */
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Bassins : remontés d'une case autour pour que la rive coupe la pente du sol */
const MAX_TORCHES = 400;
/** Torches des galeries tenues : une par bloc de TORCH_GRID × TORCH_GRID cases */
const TORCH_GRID = 4;
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
interface Miner { actor: Soldier; x: number; z: number; heading: number; path: [number, number][]; goal: number; wait: number; phase: number }
/** Équipe d'une ligne : ses mineurs, la lueur de leurs lampes au filon, les places autour du filon en cours */
interface Crew { key: string; miners: Miner[]; light: Source; slotsAt: number; slots: [number, number, number][] }
interface Item { m: THREE.Matrix4; c: THREE.Color }
/** Relief affiché, par sommet : position, hauteur, normale lissée, parts de paroi, de dessus, de liseré, strates, ombre, nuances */
interface GroundVerts {
  pos: Float32Array; hv: Float32Array; nor: Float32Array;
  fWall: Float32Array; fTop: Float32Array; fRim: Float32Array; fStrata: Float32Array; fAo: Float32Array; vFloor: Float32Array; vWall: Float32Array;
}
/** Gravats des tunnels (morceaux par forme), cases marquées au plus (file, conseil, case visée) */
const MAX_RUBBLE = 600, MAX_MARKS = 64;
/** Teinte des éclats de roche qui volent sous la pioche */
const CHIP = 0xb8ab94;

/**
 * Monde souterrain : galeries en coupe (le dessus des parois est la tranche sombre de la roche), décor par zone,
 * lacs, lave, puits de jour aux entrées, torches des galeries tenues et créatures ; seules les sources de lumière l'éclairent
 */
export class UnderView {
  scene = new THREE.Scene();
  /** étincelles, éclairs et poussière des combats sous terre */
  fx = new CombatFx();
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
  /** cases des gros décors des galeries (le camp les évite) */
  private decorCells = new Set<number>();
  /** cases où poussent des cristaux (un clic dessus les fait tinter) */
  private crystalCells = new Set<number>();
  /** cases couvertes par les décors du camp : les gardes passent autour */
  private campBlocked = new Set<number>();
  /** équipes de mineurs descendues par les trains (une par ligne) */
  private crews = new Map<number, Crew>();
  /** couleurs du sol telles que générées, avant l'éclaircissement des galeries tenues */
  private groundBase: Float32Array | null = null;
  /**
   * relief affiché, par sommet : position (contours glissés), hauteur, normale, et ce qui fait sa teinte ; gardés pour refaire
   * le coin d'une case creusée sans tout reconstruire
   */
  private gv: GroundVerts | null = null;
  /** cases creusées déjà montrées (le relief se refait autour des nouvelles) */
  private dugSeen = new Set<number>();
  private carvedN = -1;
  /** toiles d'araignée accrochées aux parois, par case (elles tombent quand on creuse leur roche) */
  private webs = new Map<number, number>();
  private webMesh: THREE.InstancedMesh | null = null;
  /** gravats laissés par les mineurs dans les tunnels (deux formes de roche) */
  private rubble: THREE.InstancedMesh[] = [];
  /** cases à creuser (contour ambre ; le front du tunnel se remplit à mesure), passage conseillé, case visée */
  private digMarks: THREE.InstancedMesh;
  private digFace: THREE.InstancedMesh;
  private hintMarks: THREE.InstancedMesh;
  private cursorMarks: THREE.InstancedMesh;
  private marksKey = '';
  private cursorCarved = -1;
  /**
   * mineurs du camp au front du tunnel : deux frappent la roche, le troisième emporte les gravats un peu en arrière ; leur
   * lampe, leur pas (pressé, plus encore de loin), où le porteur vide sa hotte
   */
  private digCrew: { miners: Miner[]; light: Source; face: number; hit: number[]; pickT: number; speed: number; dump: [number, number] } | null = null;
  /** un coup de pioche au front du tunnel (pour le son), au plus toutes les quelques secondes */
  onPick: (() => void) | null = null;
  private models: Record<string, StaticModel | null> = {};
  /** matériaux des pièces des biomes (glace, lac gelé, lueurs, coulées…), faits à la première construction */
  private decorMats: Record<string, THREE.Material> | null = null;
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

    // torches du camp et des galeries tenues : manche et flamme qui vacille
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
    this.scene.add(this.fx.group);

    this.models = {
      crystal: bakeStatic('crystal', 0.5, /./), crystal2: bakeStatic('crystal2', 0.42, /./), mineral: bakeStatic('mineral', 0.3, /pink/i),
      mushroom: bakeStatic('mushroom', 0.08, /red/i), fern: bakeStatic('fern', 0.16, /./), cobweb: bakeStatic('cobweb', 0.42, /^$/),
      skull: bakeStatic('skull', 0.07, /^$/), ribcage: bakeStatic('ribcage', 0.12, /^$/), bone: bakeStatic('bone', 0.024, /^$/),
    };
    this.rockPieces = rockShapes().map((p) => p.geometry);

    // creusement : gravats au sol des tunnels ; contours carrés posés sur la roche (cases prévues, passage conseillé, case
    // visée), le front du tunnel se remplit à mesure que les mineurs avancent
    const rubbleMat = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 'under-rubble');
    this.rubble = this.rockPieces.slice(0, 2).map((g) => { const m = new THREE.InstancedMesh(g, rubbleMat, MAX_RUBBLE); m.setColorAt(0, WHITE); return m; });
    const frame = new THREE.RingGeometry(0.5, 0.61, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
    const mark = (geo: THREE.BufferGeometry, color: number, opacity: number) => new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }), MAX_MARKS);
    this.digMarks = mark(frame, 0xffb43a, 0.95);
    this.digFace = mark(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2), 0xffc65a, 0.4);
    this.hintMarks = mark(frame, 0x9fe6ff, 0.6);
    this.cursorMarks = mark(frame, 0xffffff, 1);
    for (const m of [...this.rubble, this.digMarks, this.digFace, this.hintMarks, this.cursorMarks]) { m.count = 0; m.frustumCulled = false; this.scene.add(m); }
    for (const m of [this.digMarks, this.digFace, this.hintMarks, this.cursorMarks]) m.renderOrder = 4;
  }

  /** Hauteur où pose la caméra : le sol, jamais le haut des parois */
  groundY(x: number, z: number) { return Math.min(0.4, Math.max(0, this.under.heightAt(x, z))); }

  /** (Re)construit tout après une régénération du souterrain */
  build() {
    if (this.built === this.under.version) return;
    this.built = this.under.version;
    this.decorCells.clear();
    this.crystalCells.clear();
    // les géométries des modèles sont partagées d'une génération à l'autre : on ne libère que celles faites pour la carte
    for (const c of [...this.content.children]) {
      this.content.remove(c);
      if (c.userData.own) (c as THREE.Mesh).geometry.dispose();
    }
    this.sources = [];
    this.webs.clear();
    this.webMesh = null;
    this.buildGround();
    this.buildPools();
    this.buildDecor();
    this.buildShafts();
    this.refreshTorches();
    this.claimedN = -1;
    // les tunnels déjà creusés sont dans le relief : leurs gravats jonchent le sol
    this.dugSeen = new Set([...this.world.dug].filter((k) => this.under.open[k]));
    this.carvedN = this.under.carved;
    for (const r of this.rubble) r.count = 0;
    for (const k of this.dugSeen) this.addRubble(k);
    this.marksKey = '';
  }

  // ---------- Relief ----------

  private buildGround() {
    const u = this.under, n = VS * VS, T = (VS - 1) * (VS - 1) * 6;
    // par sommet : nuances de sol et de paroi fondues d'une zone à l'autre (elles ne dépendent que des zones)
    const vFloor = new Float32Array(n * 3), vWall = new Float32Array(n * 3), wz = new Float32Array(5);
    const zoneW = smoothZones(u), FL = FLOOR.map((c) => c.toArray()), WL = WALL.map((c) => c.toArray());
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const i = z * VS + x, fx = x / VR, fz = z / VR;
        zoneW(fx, fz, wz);
        // le sol varie un peu, en grandes plages douces
        const tone = 1 + Math.sin(fx * 0.37 + Math.sin(fz * 0.29) * 2) * Math.sin(fz * 0.31 + fx * 0.11) * 0.05;
        for (let q = 0; q < 3; q++) {
          let f = 0, wl = 0;
          for (let zq = 0; zq < 5; zq++) { f += wz[zq] * FL[zq][q]; wl += wz[zq] * WL[zq][q]; }
          vFloor[i * 3 + q] = f * tone; vWall[i * 3 + q] = wl;
        }
      }
    this.gv = {
      pos: new Float32Array(n * 3), hv: new Float32Array(n), nor: new Float32Array(n * 3),
      fWall: new Float32Array(n), fTop: new Float32Array(n), fRim: new Float32Array(n), fStrata: new Float32Array(n), fAo: new Float32Array(n), vFloor, vWall,
    };
    // triangles séparés : normale lissée mêlée à celle de la face (facettes de roche)
    const g = this.groundGeo;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(T * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(T * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(T * 3), 3));
    this.groundBase = new Float32Array(T * 3);
    this.regrid([0, 0, VS - 1, VS - 1]);
    g.computeBoundingSphere();
  }

  /**
   * Refait le relief affiché autour des sommets (x0, z0, x1, z1) dont la hauteur a changé (tout le relief à la construction,
   * le coin d'une case creusée ensuite) : contours, ombres, teintes et facettes ; renvoie les sommets du maillage refaits
   */
  private regrid(r: [number, number, number, number]): [number, number] {
    const u = this.under, vis = u.vis, gv = this.gv!, { pos, hv, nor, fWall, fTop, fRim, fStrata, fAo, vFloor, vWall } = gv;
    const tmp = new THREE.Color(), wallC = new THREE.Color(), floorC = new THREE.Color();
    const grow = (m: number) => [Math.max(0, r[0] - m), Math.max(0, r[1] - m), Math.min(VS - 1, r[2] + m), Math.min(VS - 1, r[3] + m)];
    // contours lisses : un sommet proche du bord du dessus ou du pied d'une paroi glisse jusque sur la ligne exacte du
    // contour (le long de la pente du champ d'ouverture), à la hauteur du dessus ou du sol ; plus de dents de scie
    const op = u.vOpen, ra = grow(1);
    for (let z = ra[1]; z <= ra[3]; z++)
      for (let x = ra[0]; x <= ra[2]; x++) {
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
    // l'ombre au pied des parois regarde deux sommets alentour
    const rb = grow(3);
    for (let z = rb[1]; z <= rb[3]; z++)
      for (let x = rb[0]; x <= rb[2]; x++) {
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
    // les facettes qui touchent un sommet refait : deux triangles par carré, même découpe que heightAt (diagonale a → d)
    const g = this.groundGeo, fp = g.attributes.position.array as Float32Array, fn = g.attributes.normal.array as Float32Array, fc = this.groundBase!;
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fnv = new THREE.Vector3();
    const tri = (t: number, a: number, b: number, c: number) => {
      // chaque facette a sa nuance, comme une roche taillée, et la teinte de la zone où elle se trouve
      const jit = 0.965 + (Math.abs(Math.sin(t * 12.9898) * 43758.5453) % 1) * 0.07;
      e1.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
      e2.set(pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]);
      fnv.crossVectors(e2, e1).normalize();
      if (fnv.y < 0) fnv.negate();
      [a, b, c].forEach((v, j) => {
        const o = (t + j) * 3, sc = shade(v);
        for (let q = 0; q < 3; q++) fp[o + q] = pos[v * 3 + q];
        fc[o] = sc.r * jit; fc[o + 1] = sc.g * jit; fc[o + 2] = sc.b * jit;
        fn[o] = nor[v * 3] * (1 - FACE_MIX) + fnv.x * FACE_MIX;
        fn[o + 1] = nor[v * 3 + 1] * (1 - FACE_MIX) + fnv.y * FACE_MIX;
        fn[o + 2] = nor[v * 3 + 2] * (1 - FACE_MIX) + fnv.z * FACE_MIX;
      });
    };
    const x0 = Math.max(0, rb[0] - 1), z0 = Math.max(0, rb[1] - 1), x1 = Math.min(VS - 2, rb[2]), z1 = Math.min(VS - 2, rb[3]);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const a = z * VS + x, b = a + 1, c = a + VS, d = c + 1, t = (z * (VS - 1) + x) * 6;
        tri(t, a, c, d);
        tri(t + 3, a, d, b);
      }
    // seule la plage refaite repart vers la carte graphique ; les couleurs (avant l'éclaircissement des galeries tenues, que
    // tintHeld refait) repartent entières, tintHeld les touchant toutes
    const v0 = (z0 * (VS - 1) + x0) * 6, v1 = (z1 * (VS - 1) + x1) * 6 + 6;
    for (const name of ['position', 'normal']) {
      const at = g.attributes[name] as THREE.BufferAttribute;
      at.addUpdateRange(v0 * 3, (v1 - v0) * 3);
      at.needsUpdate = true;
    }
    const col = g.attributes.color as THREE.BufferAttribute;
    (col.array as Float32Array).set(fc.subarray(v0 * 3, v1 * 3), v0 * 3);
    col.needsUpdate = true;
    return [v0, v1];
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

  /**
   * Décor des galeries, par biome et toujours en groupes : chaque grande salle peut devenir une « clairière » au thème de sa
   * zone (géode de cristaux, forêt de stalagmites, colonnes, éboulis, ossuaire, ruines ; piliers et dalles de glace, lac
   * gelé ; bosquet de champignons géants, tapis de mousse, racines ; orgues de basalte, coulées de lave, éclats d'obsidienne),
   * et le pied des parois se garnit par tronçons (jamais une pièce isolée au hasard)
   */
  private buildDecor() {
    const u = this.under, d = this.d;
    const lists: Record<string, Item[]> = {};
    const push = (name: string, c: THREE.Color) => { d.updateMatrix(); (lists[name] ??= []).push({ m: d.matrix.clone(), c: c.clone() }); };
    const add = (name: string, x: number, y: number, z: number, rot: number, s: number, c: THREE.Color, tilt = 0, tiltA = 0, sy = s) => {
      d.position.set(x, y, z);
      d.rotation.set(Math.cos(tiltA) * tilt, rot, Math.sin(tiltA) * tilt, 'YXZ');
      d.scale.set(s, sy, s);
      push(name, c);
    };
    /** une pièce penchée vers (dx, dz) de `tilt` radians, tournée de `spin` sur elle-même */
    const lean = (name: string, x: number, y: number, z: number, s: number, c: THREE.Color, dx: number, dz: number, tilt: number, spin = 0, sy = s) => {
      const l = Math.hypot(dx, dz) || 1;
      LEAN_DIR.set((dx / l) * Math.sin(tilt), Math.cos(tilt), (dz / l) * Math.sin(tilt));
      d.position.set(x, y, z);
      d.quaternion.setFromUnitVectors(UP, LEAN_DIR).multiply(SPIN.setFromAxisAngle(UP, spin));
      d.scale.set(s, sy, s);
      push(name, c);
    };
    // les gros décors : le camp ne se pose pas dessus
    const block = (x: number, z: number) => this.decorCells.add(Math.floor(z) * N + Math.floor(x));
    /** hauteur du sol d'une galerie où l'on marche en ce point, ou null (roche, bassin, pente de paroi) */
    const floorAt = (x: number, z: number) => (u.walkable(Math.floor(x), Math.floor(z)) && u.heightAt(x, z) < 0.42 ? u.heightAt(x, z) : null);
    /** depuis (x0, z0), on avance dans la direction a jusqu'au pied de la paroi (au plus `max` cases) : le dernier point de sol */
    const toWall = (x0: number, z0: number, a: number, max: number): [number, number] | null => {
      let last: [number, number] | null = null;
      for (let t = 0.3; t <= max; t += 0.12) {
        const x = x0 + Math.sin(a) * t, z = z0 + Math.cos(a) * t;
        if (floorAt(x, z) === null) return last;
        last = [x, z];
      }
      return null;
    };
    const tmp = new THREE.Color(), c2 = new THREE.Color();
    const used = new Uint8Array(N * N);
    const nearEntrance = (x: number, z: number, r: number) => u.entrances.some((e) => Math.hypot(e.x - x, e.z - z) < r);

    // ---- les clairières : une par bloc de CLEAR_GRID cases au plus, au cœur de sa plus grande salle ----
    for (let bz = 0; bz < N; bz += CLEAR_GRID)
      for (let bx = 0; bx < N; bx += CLEAR_GRID) {
        let best = -1, bs = -1;
        for (let z = bz; z < Math.min(N, bz + CLEAR_GRID); z++)
          for (let x = bx; x < Math.min(N, bx + CLEAR_GRID); x++) {
            const k = z * N + x;
            if (!u.walkable(x, z)) continue;
            const s = u.wallDist[k] + hash2(x, z, 901) * 0.8;
            if (s > bs) { bs = s; best = k; }
          }
        if (best < 0 || u.wallDist[best] < 2) continue;
        const zone = u.zone[best], x0 = (best % N) + 0.5, z0 = Math.floor(best / N) + 0.5;
        if (hash2(bx, bz, 902) > CLEAR_P[zone] || nearEntrance(x0, z0, 4.5) || floorAt(x0, z0) === null) continue;
        const R = Math.min(4, u.wallDist[best] + 0.6), themes = THEMES[zone];
        let seed = 0;
        const r = () => hash2(best, seed++, 905);
        const theme = themes[Math.floor(hash2(bx, bz, 903) * themes.length)];
        for (let z = Math.floor(z0 - R); z <= z0 + R; z++) for (let x = Math.floor(x0 - R); x <= x0 + R; x++) if (x >= 0 && z >= 0 && x < N && z < N && Math.hypot(x + 0.5 - x0, z + 0.5 - z0) <= R) used[z * N + x] = 1;
        /** n points autour du centre, à une distance de rr (± un peu), chacun là où il y a du sol */
        const ring = (n: number, rr: number, fn: (x: number, z: number, y: number, a: number, i: number) => void) => {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + r() * 0.6, rad = rr * (0.7 + r() * 0.4), x = x0 + Math.sin(a) * rad, z = z0 + Math.cos(a) * rad, y = floorAt(x, z);
            if (y !== null) fn(x, z, y, a, i);
          }
        };
        const y0 = floorAt(x0, z0)!;
        const light = (rad: number, col: THREE.Color, k: number, y = 0.5, flicker = 0) => this.sources.push({ x: x0, y: y0 + y, z: z0, r: rad, c: col.clone().multiplyScalar(k), flicker });
        const crystalHere = () => { for (let z = Math.floor(z0 - R); z <= z0 + R; z++) for (let x = Math.floor(x0 - R); x <= x0 + R; x++) if (x >= 0 && z >= 0 && x < N && z < N && used[z * N + x]) this.crystalCells.add(z * N + x); };
        switch (theme) {
          case 'geode': {
            // une géode : les parois de la salle hérissées d'amas de cristaux penchés vers son cœur, un grand amas au milieu
            const base = c2.copy(CRYSTAL[zone]).offsetHSL((r() - 0.5) * 0.12, 0, 0);
            for (let i = 0, n = 14 + Math.floor(r() * 8); i < n; i++) {
              const a = (i / n) * Math.PI * 2 + r() * 0.3, p = toWall(x0, z0, a, R + 2.5);
              if (!p) continue;
              for (let j = 0, m = 2 + Math.floor(r() * 3); j < m; j++) {
                const qx = p[0] + (r() - 0.5) * 0.3, qz = p[1] + (r() - 0.5) * 0.3, qy = u.heightAt(qx, qz);
                lean(r() < 0.6 ? 'crystal' : 'crystal2', qx, qy - 0.04, qz, 0.7 + r() * 1.1, tmp.copy(base).offsetHSL((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.15), x0 - qx, z0 - qz, 0.35 + r() * 0.5, r() * 6.28);
              }
            }
            for (let j = 0; j < 5; j++) {
              const a = r() * 6.28, rr = j ? 0.25 + r() * 0.3 : 0;
              lean(j ? 'crystal2' : 'crystal', x0 + Math.sin(a) * rr, y0 - 0.05, z0 + Math.cos(a) * rr, j ? 1.4 + r() * 0.9 : 3 + r() * 1.2, tmp.copy(base).offsetHSL(0, 0, j ? 0.05 : 0.12), Math.sin(a), Math.cos(a), j ? 0.4 + r() * 0.3 : 0.05, r() * 6.28);
            }
            add('mineral', x0 + 0.5, floorAt(x0 + 0.5, z0) ?? y0, z0 - 0.3, r() * 6.28, 1.3, base);
            block(x0, z0);
            light(R + 3, base, 1.1, 0.7);
            crystalHere();
            break;
          }
          case 'spire': {
            // une flèche de cristal : trois grands cristaux soudés au milieu de la salle, des éclats semés autour
            const base = c2.copy(CRYSTAL[zone]).offsetHSL((r() - 0.5) * 0.12, 0, 0);
            for (let j = 0; j < 3; j++) { const a = (j / 3) * 6.28 + r(); lean('crystal', x0 + Math.sin(a) * 0.12, y0 - 0.05, z0 + Math.cos(a) * 0.12, 3.2 + r() * 1.8, tmp.copy(base).offsetHSL(0, 0, r() * 0.1), Math.sin(a), Math.cos(a), 0.15 + r() * 0.2, r() * 6.28); }
            ring(9, R * 0.65, (x, z, y, a) => lean('crystal2', x, y - 0.03, z, 0.5 + r() * 0.7, tmp.copy(base).offsetHSL(0, 0, -0.05), Math.sin(a), Math.cos(a), 0.3 + r() * 0.4, r() * 6.28));
            ring(5, R * 0.4, (x, z, y) => add(`rock${Math.floor(r() * this.rockPieces.length)}`, x, y - 0.02, z, r() * 6.28, 0.6 + r() * 0.5, tmp.copy(WALL[zone]).multiplyScalar(0.8), 0, 0, 0.4));
            block(x0, z0);
            light(R + 2.5, base, 1.2, 1);
            crystalHere();
            break;
          }
          case 'column': {
            // des colonnes : stalactite et stalagmite soudées, qui montent jusqu'à la tranche de la roche ; petites stalagmites au pied
            for (let j = 0, n = 1 + Math.floor(r() * 2.6); j < n; j++) {
              const a = r() * 6.28, rr = j ? R * (0.35 + r() * 0.3) : 0, x = x0 + Math.sin(a) * rr, z = z0 + Math.cos(a) * rr, y = floorAt(x, z);
              if (y === null) continue;
              const w = 0.24 + r() * 0.14;
              add('column', x, y - 0.05, z, r() * 6.28, w, tmp.copy(STALAG[zone]).multiplyScalar(0.9 + r() * 0.15), 0, 0, UWALL + 0.15 - y);
              block(x, z);
              for (let i = 0; i < 5; i++) { const b = r() * 6.28, q = w + 0.1 + r() * 0.25, sx = x + Math.sin(b) * q, sz = z + Math.cos(b) * q, sy = floorAt(sx, sz); if (sy !== null) add('stalag', sx, sy - 0.03, sz, r() * 6.28, 0.05 + r() * 0.06, tmp.copy(STALAG[zone]), 0, 0, 0.2 + r() * 0.45); }
            }
            break;
          }
          case 'stalagmites': {
            // une forêt de stalagmites : une grande au milieu, les autres de plus en plus petites en s'éloignant
            const col = STALAG[zone];
            add('stalag', x0, y0 - 0.04, z0, r() * 6.28, 0.2 + r() * 0.08, tmp.copy(col), 0, 0, 1.3 + r() * 0.5);
            block(x0, z0);
            for (let i = 0, n = 10 + Math.floor(r() * 10); i < n; i++) {
              const a = r() * 6.28, rr = 0.35 + r() * R * 0.9, x = x0 + Math.sin(a) * rr, z = z0 + Math.cos(a) * rr, y = floorAt(x, z);
              if (y === null) continue;
              const k = 1 - rr / (R + 0.5);
              add('stalag', x, y - 0.03, z, r() * 6.28, 0.06 + k * 0.12 + r() * 0.03, tmp.copy(col).multiplyScalar(0.88 + r() * 0.2), (r() - 0.5) * 0.15, r() * 6.28, 0.25 + k * 1.1 + r() * 0.25);
            }
            break;
          }
          case 'rockfall': {
            // un éboulis : un gros bloc tombé, les autres semés en éventail jusqu'au pied de la paroi
            const a0 = r() * 6.28, p = toWall(x0, z0, a0, R + 2) ?? [x0, z0];
            for (let i = 0, n = 8 + Math.floor(r() * 6); i < n; i++) {
              const t = i / n, a = a0 + Math.PI + (r() - 0.5) * 1.4, rr = t * R * 0.9, x = p[0] + Math.sin(a) * rr, z = p[1] + Math.cos(a) * rr, y = floorAt(x, z);
              if (y === null) continue;
              const s = (i ? 1.6 - t * 1.1 : 2.6) * (0.8 + r() * 0.4);
              add(`rock${Math.floor(r() * this.rockPieces.length)}`, x, y - 0.03, z, r() * 6.28, s, tmp.copy(WALL[zone]).multiplyScalar(0.75 + r() * 0.2), 0, 0, s * (0.55 + r() * 0.3));
              if (s > 1.2) block(x, z);
            }
            break;
          }
          case 'ossuary': {
            // un ossuaire : les restes d'aventuriers d'autrefois, crânes et os en tas, pierres taillées renversées autour
            for (let j = 0, n = 2 + Math.floor(r() * 3); j < n; j++) {
              const a = r() * 6.28, rr = j ? 0.5 + r() * R * 0.5 : 0, x = x0 + Math.sin(a) * rr, z = z0 + Math.cos(a) * rr, y = floorAt(x, z);
              if (y === null) continue;
              add('ribcage', x, y - 0.01, z, r() * 6.28, 0.9 + r() * 0.4, BONE);
              add('skull', x + 0.12, (floorAt(x + 0.12, z + 0.05) ?? y) - 0.005, z + 0.05, r() * 6.28, 0.9 + r() * 0.3, BONE);
              for (let i = 0; i < 4; i++) { const b = r() * 6.28, q = 0.08 + r() * 0.2; add('bone', x + Math.sin(b) * q, y, z + Math.cos(b) * q, r() * 6.28, 0.8 + r() * 0.5, BONE); }
            }
            ring(4, R * 0.75, (x, z, y) => add('cutStone', x, y + 0.05, z, r() * 6.28, 0.18 + r() * 0.1, tmp.copy(RUIN).multiplyScalar(0.85 + r() * 0.2), (r() - 0.5) * 0.6, r() * 6.28, 0.12 + r() * 0.08));
            this.sources.push({ x: x0, y: y0 + 0.4, z: z0, r: 2.6, c: new THREE.Color(0.5, 0.85, 0.7).multiplyScalar(0.5), flicker: 0.05 });
            break;
          }
          case 'ruins': {
            // des ruines : un cercle de piliers, certains brisés, un tombé de tout son long, une dalle au milieu
            const n = 5 + Math.floor(r() * 3), rr = Math.min(R * 0.7, 2.2);
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2, x = x0 + Math.sin(a) * rr, z = z0 + Math.cos(a) * rr, y = floorAt(x, z);
              if (y === null) continue;
              const broken = r() < 0.45, col = tmp.copy(RUIN).multiplyScalar(0.85 + r() * 0.2);
              if (i === 0) { lean('pillar', x, y + 0.08, z, 0.12, col, Math.cos(a), -Math.sin(a), 1.5, 0, 0.9); continue; }
              add('pillar', x, y - 0.02, z, r() * 6.28, 0.12, col, broken ? (r() - 0.5) * 0.2 : 0, r() * 6.28, broken ? 0.25 + r() * 0.35 : 0.95 + r() * 0.2);
              block(x, z);
              if (broken) { const b = r() * 6.28; add('cutStone', x + Math.sin(b) * 0.3, (floorAt(x + Math.sin(b) * 0.3, z + Math.cos(b) * 0.3) ?? y) + 0.05, z + Math.cos(b) * 0.3, r() * 6.28, 0.13, col, 0.4, r() * 6.28, 0.12); }
            }
            add('cutStone', x0, y0 + 0.06, z0, r() * 6.28, 0.42, tmp.copy(RUIN).multiplyScalar(0.8), 0, 0, 0.14);
            break;
          }
          case 'icePillars': {
            // des piliers de glace, un peu penchés, sur un sol de dalles gelées
            for (let j = 0, n = 3 + Math.floor(r() * 3); j < n; j++) {
              const a = r() * 6.28, rr = j ? 0.5 + r() * R * 0.55 : 0, x = x0 + Math.sin(a) * rr, z = z0 + Math.cos(a) * rr, y = floorAt(x, z);
              if (y === null) continue;
              lean('icePillar', x, y - 0.05, z, 0.14 + r() * 0.1, tmp.copy(ICE).offsetHSL(0, 0, (r() - 0.5) * 0.1), Math.sin(a), Math.cos(a), r() * 0.25, r() * 6.28, 0.7 + r() * 0.9);
              block(x, z);
            }
            ring(12, R * 0.7, (x, z, y) => add('slab', x, y + 0.005, z, r() * 6.28, 0.22 + r() * 0.2, tmp.copy(ICE).multiplyScalar(0.92 + r() * 0.1), 0, 0, 0.04));
            light(R + 2, ICE, 0.45, 0.8);
            break;
          }
          case 'iceSlabs': {
            // un champ de dalles de glace qui se chevauchent, des éclats contre les parois
            for (let i = 0, n = 16 + Math.floor(r() * 10); i < n; i++) {
              const a = r() * 6.28, rr = r() * R * 0.85, x = x0 + Math.sin(a) * rr, z = z0 + Math.cos(a) * rr, y = floorAt(x, z);
              if (y !== null) add('slab', x, y + 0.004 + i * 0.002, z, r() * 6.28, 0.2 + r() * 0.3, tmp.copy(ICE).multiplyScalar(0.9 + r() * 0.12), (r() - 0.5) * 0.12, r() * 6.28, 0.04 + r() * 0.04);
            }
            for (let i = 0; i < 8; i++) { const a = r() * 6.28, p = toWall(x0, z0, a, R + 2); if (p) lean('crystal2', p[0], u.heightAt(p[0], p[1]) - 0.04, p[1], 0.7 + r() * 0.8, tmp.copy(CRYSTAL[UZ_ICE]), x0 - p[0], z0 - p[1], 0.5 + r() * 0.3, r() * 6.28); }
            break;
          }
          case 'frozenLake': {
            // un lac gelé : une grande plaque de glace lisse, bordée de congères et d'éclats
            add('iceSheet', x0, y0 + 0.01, z0, r() * 6.28, R * 0.75, ICE, 0, 0, 1);
            ring(10, R * 0.85, (x, z, y) => add(`rock${Math.floor(r() * this.rockPieces.length)}`, x, y - 0.04, z, r() * 6.28, 0.7 + r() * 0.6, SNOWY, 0, 0, 0.3));
            ring(6, R * 0.95, (x, z, y, a) => lean('crystal2', x, y - 0.03, z, 0.6 + r() * 0.6, CRYSTAL[UZ_ICE], -Math.sin(a), -Math.cos(a), 0.4, r() * 6.28));
            block(x0, z0);
            light(R + 2, ICE, 0.4, 0.6);
            break;
          }
          case 'shroomGrove': {
            // un bosquet de champignons géants : un immense au milieu, les moyens autour, les petits en couronne, de la mousse au pied
            const c0 = c2.copy(SHROOM[Math.floor(r() * SHROOM.length)]);
            const shroom = (x: number, z: number, y: number, s: number, c: THREE.Color) => { const rot = r() * 6.28, tl = (r() - 0.5) * 0.25, ta = r() * 6.28; add('mushroomCap', x, y - 0.02, z, rot, s, c, tl, ta); add('mushroomStem', x, y - 0.02, z, rot, s, WHITE, tl, ta); };
            shroom(x0, z0, y0, 24 + r() * 10, c0);
            block(x0, z0);
            ring(4, R * 0.5, (x, z, y) => { shroom(x, z, y, 12 + r() * 7, tmp.copy(c0).offsetHSL((r() - 0.5) * 0.08, 0, 0)); block(x, z); });
            ring(12, R * 0.9, (x, z, y) => { for (let i = 0; i < 3; i++) shroom(x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3, y, 1.8 + r() * 2.6, tmp.copy(c0).offsetHSL((r() - 0.5) * 0.1, 0, 0)); });
            ring(10, R * 0.6, (x, z, y) => add('moss', x, y + 0.004, z, r() * 6.28, 0.14 + r() * 0.14, tmp.setRGB(0.22, 0.5, 0.26).multiplyScalar(0.85 + r() * 0.3), 0, 0, 1));
            this.sources.push({ x: x0, y: y0 + 1.2, z: z0, r: R + 3, c: c0.clone().multiplyScalar(0.9), flicker: 0 });
            break;
          }
          case 'mossGlade': {
            // un tapis de mousse : fougères, petits champignons lumineux, spores qui flottent
            ring(18, R * 0.8, (x, z, y) => add('moss', x, y + 0.004, z, r() * 6.28, 0.15 + r() * 0.16, tmp.setRGB(0.2 + r() * 0.08, 0.46 + r() * 0.12, 0.22), 0, 0, 1));
            ring(9, R * 0.7, (x, z, y) => add('fern', x, y - 0.02, z, r() * 6.28, 0.9 + r() * 0.8, tmp.setRGB(0.2, 0.5, 0.25)));
            const c0 = SHROOM[Math.floor(r() * SHROOM.length)];
            ring(7, R * 0.6, (x, z, y) => { for (let i = 0; i < 3; i++) { const s = 1.4 + r() * 2, qx = x + (r() - 0.5) * 0.25, qz = z + (r() - 0.5) * 0.25; add('mushroomCap', qx, y - 0.01, qz, r() * 6.28, s, c0); add('mushroomStem', qx, y - 0.01, qz, r() * 6.28, s, WHITE); } });
            ring(14, R * 0.8, (x, z, y) => add('orb', x, y + 0.2 + r() * 0.6, z, 0, 0.02 + r() * 0.02, tmp.copy(c0).offsetHSL(0, 0, 0.15)));
            light(R + 2, c0, 0.55, 0.6);
            break;
          }
          case 'roots': {
            // des racines géantes qui percent les parois et rampent vers le milieu de la salle, de la mousse entre elles
            for (let i = 0, n = 6 + Math.floor(r() * 4); i < n; i++) {
              const a = (i / n) * Math.PI * 2 + r() * 0.4, p = toWall(x0, z0, a, R + 2);
              if (!p) continue;
              const toC = Math.atan2(x0 - p[0], z0 - p[1]);
              add('root', p[0], u.heightAt(p[0], p[1]) - 0.02, p[1], toC - Math.PI / 2, 0.9 + r() * 0.9, tmp.setRGB(0.42, 0.3, 0.2).multiplyScalar(0.85 + r() * 0.3), 0, 0, 0.8 + r() * 0.5);
            }
            ring(12, R * 0.65, (x, z, y) => add('moss', x, y + 0.004, z, r() * 6.28, 0.12 + r() * 0.14, tmp.setRGB(0.25, 0.52, 0.24), 0, 0, 1));
            ring(6, R * 0.45, (x, z, y) => add('fern', x, y - 0.02, z, r() * 6.28, 1 + r() * 0.7, tmp.setRGB(0.22, 0.52, 0.26)));
            ring(8, R * 0.7, (x, z, y) => add('orb', x, y + 0.25 + r() * 0.5, z, 0, 0.02 + r() * 0.015, SPORE));
            light(R + 1.5, SPORE, 0.4, 0.6);
            break;
          }
          case 'basalt': {
            // des orgues de basalte : colonnes hexagonales serrées, de hauteurs inégales, la lave luit entre elles
            const s = 0.13;
            for (let i = -3; i <= 3; i++)
              for (let j = -3; j <= 3; j++) {
                const x = x0 + (i + (j % 2) * 0.5) * s * 1.75, z = z0 + j * s * 1.52, dd = Math.hypot(x - x0, z - z0), y = floorAt(x, z);
                if (y === null || dd > R * 0.55 || r() < 0.12) continue;
                add('basalt', x, y - 0.05, z, 0, s, tmp.copy(BASALT).multiplyScalar(0.85 + r() * 0.3), 0, 0, 0.15 + (1 - dd / (R * 0.55)) * (0.5 + r() * 0.9));
              }
            add('glowDisc', x0, y0 + 0.01, z0, 0, R * 0.62, EMBER_DISC, 0, 0, 1);
            block(x0, z0);
            light(R + 2, EMBER_GLOW, 0.9, 0.4, 0.12);
            break;
          }
          case 'lavaFlow': {
            // une bouche de lave : un cône de scories au milieu, des coulées qui s'en échappent, croûtées sur leurs bords
            add('stalag', x0, y0 - 0.05, z0, r() * 6.28, 0.32, BASALT, 0, 0, 0.45);
            block(x0, z0);
            for (let f = 0, n = 3 + Math.floor(r() * 3); f < n; f++) {
              let a = (f / n) * Math.PI * 2 + r() * 0.6, x = x0 + Math.sin(a) * 0.3, z = z0 + Math.cos(a) * 0.3;
              const len = R * (0.6 + r() * 0.4);
              for (let t = 0, w = 0.32; t < len; t += 0.4, w *= 0.9) {
                const y = floorAt(x, z);
                if (y === null) break;
                add('flow', x, y + 0.012, z, a - Math.PI / 2, 1, WHITE, 0, 0, 1);
                lists.flow[lists.flow.length - 1].m.multiply(new THREE.Matrix4().makeScale(0.5, 1, w));
                if (r() < 0.6) add('crust', x + Math.cos(a) * w * 0.5, y + 0.02, z - Math.sin(a) * w * 0.5, r() * 6.28, 0.08 + r() * 0.07, BASALT, 0, 0, 0.03);
                a += (r() - 0.5) * 0.6;
                x += Math.sin(a) * 0.4; z += Math.cos(a) * 0.4;
              }
            }
            light(R + 2.5, EMBER_GLOW, 1.2, 0.3, 0.15);
            break;
          }
          case 'obsidian': {
            // des éclats d'obsidienne noire, des braises qui rougeoient entre eux
            ring(10, R * 0.75, (x, z, y, a) => lean(r() < 0.5 ? 'crystal' : 'crystal2', x, y - 0.04, z, 0.8 + r() * 1.2, OBSIDIAN, Math.sin(a), Math.cos(a), 0.2 + r() * 0.4, r() * 6.28));
            ring(8, R * 0.5, (x, z, y) => add('orb', x, y + 0.03, z, 0, 0.025 + r() * 0.02, EMBER_GLOW));
            lean('crystal', x0, y0 - 0.05, z0, 2.6 + r(), OBSIDIAN, 0, 1, 0.05, r() * 6.28);
            block(x0, z0);
            light(R + 1.5, EMBER_GLOW, 0.6, 0.3, 0.2);
            break;
          }
        }
      }

    // ---- le pied des parois, par tronçons de quelques cases ; les rives des lacs ; les toiles d'araignée ----
    for (let k = 0; k < N * N; k++) {
      if (!u.open[k] || u.pool[k]) continue;
      const cx = k % N, cz = Math.floor(k / N), zone = u.zone[k], wd = u.wallDist[k];
      const h = (s: number) => hash2(cx, cz, s);
      const px = cx + 0.15 + h(1) * 0.7, pz = cz + 0.15 + h(2) * 0.7, py = u.heightAt(px, pz);
      if (py > 0.42) continue;
      // galets sur les rives des lacs
      const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => u.pool[(cz + dz) * N + cx + dx] === POOL_WATER);
      if (shore && h(147) < 0.45) {
        const q = (h(155) - 0.5) * 0.5, s = 0.6 + h(149) * 0.8;
        add(`rock${Math.floor(h(148) * this.rockPieces.length)}`, px + q, u.heightAt(px + q, pz) - 0.02, pz, h(143) * 6.28, s, tmp.copy(WALL[zone]).multiplyScalar(0.72 + h(144) * 0.25), 0, 0, s * (0.5 + h(145) * 0.4));
        continue;
      }
      if (wd !== 1 || used[k] || !u.walkable(cx, cz)) continue;
      // toiles d'araignée, dans la roche et le cristal
      if ((zone === UZ_STONE || zone === UZ_CRYSTAL) && h(160) < 0.04) {
        const w = this.wallPoint(cx, cz, 0.15);
        if (w) { add('cobweb', w[0], u.heightAt(w[0], w[1]) - 0.02, w[1], w[2], 0.8 + h(161) * 0.5, tmp.setScalar(0.92)); this.webs.set(k, lists.cobweb.length - 1); }
        continue;
      }
      // un tronçon garni (blocs de 3 × 3 cases tirés au sort), puis une case sur deux à peu près
      if (hash2(Math.floor(cx / 3), Math.floor(cz / 3), 910 + zone) > FRINGE_P[zone] || h(911) > 0.6) continue;
      const w = this.wallPoint(cx, cz, 0.12);
      if (!w) continue;
      const ox = Math.sin(w[2]), oz = Math.cos(w[2]), n = 1 + Math.floor(h(912) * 3);
      for (let i = 0; i < n; i++) {
        const side = (h(913 + i) - 0.5) * 0.6, x = w[0] + oz * side + ox * (0.05 + h(920 + i) * 0.12), z = w[1] - ox * side + oz * (0.05 + h(920 + i) * 0.12), y = u.heightAt(x, z) - 0.03, rot = h(930 + i) * 6.28;
        switch (zone) {
          case UZ_STONE: if (h(940 + i) < 0.55) add('stalag', x, y, z, rot, 0.07 + h(950 + i) * 0.07, tmp.copy(STALAG[zone]).multiplyScalar(0.9 + h(960 + i) * 0.15), 0, 0, 0.35 + h(970 + i) * 0.7);
            else add(`rock${Math.floor(h(980 + i) * this.rockPieces.length)}`, x, y, z, rot, 0.6 + h(950 + i) * 0.7, tmp.copy(WALL[zone]).multiplyScalar(0.75 + h(960 + i) * 0.2), 0, 0, 0.5);
            break;
          case UZ_CRYSTAL: lean(h(940 + i) < 0.5 ? 'crystal' : 'crystal2', x, y, z, 0.5 + h(950 + i) * 0.8, tmp.copy(CRYSTAL[zone]).offsetHSL((h(960 + i) - 0.5) * 0.08, 0, 0), ox, oz, 0.4 + h(970 + i) * 0.4, rot); this.crystalCells.add(k); break;
          case UZ_ICE: if (h(940 + i) < 0.6) lean('crystal2', x, y, z, 0.5 + h(950 + i) * 0.7, CRYSTAL[UZ_ICE], ox, oz, 0.5 + h(970 + i) * 0.3, rot);
            else add('slab', x + ox * 0.2, y + 0.035, z + oz * 0.2, rot, 0.2 + h(950 + i) * 0.15, ICE, 0, 0, 0.04);
            break;
          case UZ_LUSH: { const c = SHROOM[Math.floor(hash2(Math.floor(cx / 3), Math.floor(cz / 3), 915) * SHROOM.length)], s = 1.5 + h(950 + i) * 2.4; if (h(940 + i) < 0.6) { add('mushroomCap', x, y + 0.02, z, rot, s, c); add('mushroomStem', x, y + 0.02, z, rot, s, WHITE); } else add('fern', x, y + 0.01, z, rot, 0.8 + h(950 + i) * 0.6, tmp.setRGB(0.2, 0.48, 0.24)); break; }
          default: if (h(940 + i) < 0.7) add('basalt', x, y - 0.02, z, 0, 0.09 + h(950 + i) * 0.05, tmp.copy(BASALT).multiplyScalar(0.85 + h(960 + i) * 0.3), 0, 0, 0.2 + h(970 + i) * 0.5);
            else add('orb', x + ox * 0.15, y + 0.05, z + oz * 0.15, 0, 0.03, EMBER_GLOW);
        }
      }
    }
    // minerais incrustés dans les parois, façon Minecraft (plus précieux dans le magma) ; les filons exploités ont disparu
    this.veins.clear();
    this.minedN = this.world.mined.size;
    for (const { k, ore: oi } of oreVeins(u, this.world.mined)) {
      const vein = { mesh: ORES[oi].glow ? 'oreGlow' : 'ore', idx: [] as number[], ore: oi };
      this.veins.set(k, vein);
      const list = (lists[vein.mesh] ??= []);
      for (const it of this.veinCubes(k, oi)) { vein.idx.push(list.length); list.push(it); }
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
    // les pièces dessinées pour les biomes (partagées d'une génération à l'autre)
    const dg = decorGeos(), uTime = this.uTime;
    this.decorMats ??= {
      ice: glowMaterial(0.22, 'under-ice', { transparent: true, opacity: 0.82, roughness: 0.12, depthWrite: false }),
      sheet: caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, depthWrite: false }), 'under-sheet'),
      glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      disc: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
      flow: lavaMaterial(uTime, true),
      moss: caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 'under-moss'),
    };
    const dm = this.decorMats;
    Object.assign(parts, {
      column: [dg.column, stone], pillar: [dg.pillar, stone], cutStone: [whiteBox(), stone], basalt: [dg.basalt, stone], crust: [dg.basalt, stone],
      icePillar: [dg.icePillar, dm.ice], slab: [dg.slab, dm.ice], iceSheet: [dg.sheet, dm.sheet],
      moss: [dg.moss, dm.moss], root: [dg.root, soft], orb: [dg.orb, dm.glow], glowDisc: [dg.sheet, dm.disc], flow: [dg.flow, dm.flow],
    });
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
      if (name === 'cobweb') this.webMesh = im;
    }
  }

  /** Cubes de minerai d'un filon, incrustés dans la paroi que sa case choisit parmi ses roches voisines */
  private veinCubes(k: number, oi: number): Item[] {
    const d = this.d, cx = k % N, cz = Math.floor(k / N), ore = ORES[oi], out: Item[] = [];
    const n = 3 + Math.floor(hash2(cx, cz, 202) * 3), y0 = 0.35 + hash2(cx, cz, 203) * 0.8;
    for (let i = 0; i < n; i++) {
      const w = this.wallPoint(cx, cz, y0 + (hash2(cx, cz, 210 + i) - 0.5) * 0.3, (hash2(cx, cz, 220 + i) - 0.5) * 0.5);
      if (!w) continue;
      const s = 0.06 + hash2(cx, cz, 230 + i) * 0.05;
      d.position.set(w[0] + Math.sin(w[2]) * 0.01, y0 + (hash2(cx, cz, 210 + i) - 0.5) * 0.3, w[1] + Math.cos(w[2]) * 0.01);
      d.rotation.set(hash2(cx, cz, 240 + i) * 3, hash2(cx, cz, 250 + i) * 3, hash2(cx, cz, 260 + i) * 3);
      d.scale.setScalar(s);
      d.updateMatrix();
      out.push({ m: d.matrix.clone(), c: ore.col.clone().multiplyScalar(0.9 + hash2(cx, cz, 270 + i) * 0.2) });
    }
    return out;
  }

  /** Des cristaux poussent-ils à cet endroit (ou juste à côté) ? */
  crystalNear(x: number, z: number) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.crystalCells.has((Math.floor(z) + dz) * N + Math.floor(x) + dx)) return true;
    return false;
  }

  /** Filon le plus proche du point cliqué : sa sorte, son rendement, sa case et la roche où luisent ses cubes ; ou null */
  veinAt(x: number, z: number): { name: string; amount: number; k: number; wall: number } | null {
    let best = -1, bd = 1.4;
    for (const k of this.veins.keys()) {
      const d = Math.hypot((k % N) + 0.5 - x, Math.floor(k / N) + 0.5 - z);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return null;
    // la paroi que wallPoint choisit pour les cubes : même tirage parmi les roches voisines
    const cx = best % N, cz = Math.floor(best / N), u = this.under;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !u.isOpen(cx + dx + 0.5, cz + dz + 0.5));
    const [dx, dz] = dirs.length ? dirs[Math.floor(hash2(cx, cz, 300) * dirs.length)] : [0, 0];
    return { ...ORE_KINDS[this.veins.get(best)!.ore], k: best, wall: dirs.length ? best + dz * N + dx : -1 };
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
      for (const m of s.members) this.scene.remove((m.rider ?? m.soldier)!.root);
      for (const d of s.modern?.drones ?? []) this.scene.remove(d.root);
      for (const fs of s.foes.values()) for (const f of fs) this.mobs.kill(f);
      this.troops.delete(id);
    }
  }

  private makeTroop(t: Troop): TroopShow | null {
    // le même parcours que celui du jeu : filons, front, haltes de combat aux embuscades
    const route = troopRoute(this.under, t.entry, t.targets, t.front, t.ambush.map((m) => m.cell));
    const path = route.cells.map((k): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5]);
    if (path.length < 2) return null;
    // l'époque moderne : la colonne blindée pour la charge des blindés (la section d'infanterie et les mineurs vont à pied)
    if (t.age >= 4 && t.kind === 'cavalry') return this.makeColumn(t, route, path);
    // soldats de l'époque (légionnaires, chevaliers, fantassins napoléoniens, militaires), cavaliers montés, ou mineurs de
    // l'époque et leur garde
    const members: TroopMember[] = [];
    // l'escorte qui accompagne l'équipe, à pied : une ligne de soldats (fusiliers dès l'âge industriel) ; seule la charge est
    // montée (les hommes d'armes et les mineurs partent sans chevaux)
    const escort = t.kind === 'armor' ? (t.age >= 3 ? 7 : 4) : t.kind === 'cavalry' ? (t.age >= 3 ? 4 : 2) : 2;
    // l'équipe de mineurs part avec des gendarmes (sergents du guet au Moyen Âge) ; les autres avec la troupe
    const police = t.kind === 'miners';
    for (let i = 0; i < escort; i++) { const soldier = makeSoldier(t.age, t.id + 11 + i, false, police ? 'gendarme' : 'soldier'); this.scene.add(soldier.root); members.push({ rider: null, soldier }); }
    for (let i = 0; i < t.n; i++) {
      // la cavalerie : cavaliers de l'époque sur leurs chevaux, comme les jouteurs des jardins
      if (t.kind === 'cavalry' && i < 3) {
        const rider = makeRider(t.age, t.id + i);
        this.scene.add(rider.root);
        members.push({ rider, soldier: null });
        continue;
      }
      if (t.kind !== 'miners' || i === 0) {
        const soldier = makeSoldier(t.age, t.id + i, i === 0, police ? 'gendarme' : 'soldier');
        this.scene.add(soldier.root);
        members.push({ rider: null, soldier });
        continue;
      }
      // les mineurs de l'époque, pic en main (et leur lampe)
      const soldier = makeSoldier(t.age, t.id + i, false, 'miner');
      this.scene.add(soldier.root);
      members.push({ rider: null, soldier });
    }
    if (!members.length) return null;
    const light: Source = { x: path[0][0], y: 0, z: path[0][1], r: 5, c: new THREE.Color(1, 0.62, 0.3).multiplyScalar(2), flicker: 0.25 };
    // le chef (torche, fanion) marche en tête : on le met en premier
    const lead = members.findIndex((m, i) => i >= escort && !!m.soldier);
    if (lead > 0) members.unshift(...members.splice(lead, 1));
    // les fusiliers tirent par salves : tous ensemble
    return { route, path, members, light, scareT: 0, foes: new Map(), over: new Set(), cool: members.map((m, i) => (m.soldier?.arms[0].userData.hold === 'rifle' ? 1.2 : 0.4 + i * 0.23)), foeCool: new Map() };
  }

  /**
   * Colonne blindée de l'époque moderne, la plus impressionnante (et la plus chère) : pour la charge des blindés, deux chars de
   * bataille en tête, deux transports de troupes, un char en serre-file, la section à pied en deux files sur leurs flancs et
   * deux drones au-dessus (sans la charge, ses deux transports au milieu de ses deux files et un drone). Chaque blindé et
   * chaque drone braque son projecteur devant lui
   */
  private makeColumn(t: Troop, route: TroopRoute, path: [number, number][]): TroopShow {
    const charge = t.kind === 'cavalry', members: TroopMember[] = [];
    const add = (m: TroopMember) => { this.scene.add((m.rider ?? m.soldier)!.root); members.push(m); };
    // les blindés, en file au milieu de la galerie
    const kinds: ('mbt' | 'apc')[] = charge ? ['mbt', 'mbt', 'apc', 'apc', 'mbt'] : ['apc', 'apc'];
    kinds.forEach((k, i) => add({ rider: makeArmor(k, t.id + i), soldier: null, slot: [charge ? i * 0.74 : 0.6 + i * 1.0, 0], aim: 0, recoil: 0, burst: 0, burstT: 0 }));
    // la section à pied, deux files au pas : le long des transports pour la charge, de bout en bout pour la section
    const foot = charge ? 10 : t.n + 7, from = charge ? 1.2 : 0;
    for (let i = 0; i < foot; i++) add({ rider: null, soldier: makeSoldier(t.age, t.id + 11 + i, false, 'soldier'), slot: [from + Math.floor(i / 2) * 0.3, (i % 2 ? 1 : -1) * 0.27] });
    const drones = Array.from({ length: charge ? 2 : 1 }, () => { const d = makeDrone(); this.scene.add(d.root); return d; });
    const white = (k: number) => new THREE.Color(0.82, 0.9, 1).multiplyScalar(k);
    const at = { x: path[0][0], y: 0, z: path[0][1], flicker: 0 };
    const lamps: Source[] = [...kinds.map(() => ({ ...at, r: 4.4, c: white(1.05) })), ...drones.map(() => ({ ...at, r: 3.2, c: white(0.85) }))];
    // au combat, les blindés s'arrêtent en batterie derrière la ligne des fantassins
    const battery: [number, number][] = charge ? [[0.95, -0.24], [0.95, 0.24], [1.65, -0.24], [1.65, 0.24], [2.35, 0]] : [[0.95, -0.22], [0.95, 0.22]];
    return {
      route, path, members, light: { ...at, r: 5, c: white(1.2) }, scareT: 0, foes: new Map(), over: new Set(), cool: members.map((m, i) => (m.rider ? 1 + i * 0.45 : 1.2)), foeCool: new Map(),
      modern: { drones, lamps, flash: { ...at, r: 3.6, c: new THREE.Color(0, 0, 0) }, dustT: 0, battery },
    };
  }

  /**
   * La colonne blindée, à chaque image : en route, les blindés roulent en file, la section marche au pas sur leurs flancs, un
   * drone éclaire devant et l'autre veille au-dessus ; au combat, la section se déploie en ligne et tire par salves (balles
   * traçantes), les blindés s'arrêtent en batterie derrière elle, tournent leurs tourelles vers les créatures et font feu (coup
   * de canon, obus qui éclate, rafales du canon-mitrailleur), les drones tournent au-dessus ; au filon, les projecteurs se
   * braquent sur la paroi pendant qu'on l'abat
   */
  private moveColumn(s: TroopShow, t: Troop, dt: number) {
    const c = s.modern!, now = this.uTime.value, ease = 1 - Math.exp(-dt * 5);
    const time = t.progress * s.route.total, { pos, leg } = routeAt(s.route, time);
    const mining = leg?.kind === 'mine', fighting = leg?.kind === 'fight';
    const lead = this.along(s.path, pos);
    this.ambushes(s, t, time, lead, dt);
    const live = fighting ? [...s.foes.values()].flat().filter((f) => f.alive && f.dying < 0) : [];
    const nearest = (x: number, z: number, r: number) => live.reduce<Mob | null>((b, f) => (Math.hypot(f.x - x, f.z - z) < (b ? Math.hypot(b.x - x, b.z - z) : r) ? f : b), null);
    // les fusils tirent par salves : quand l'un est prêt, toute la ligne tire
    const nf = s.members.filter((m) => m.soldier).length;
    if (fighting && s.cool.some((v, i) => s.members[i].soldier && v <= 0)) s.cool.forEach((v, i) => { if (s.members[i].soldier && v < 0.3) s.cool[i] = Math.min(v, 0); });
    c.flash.c.multiplyScalar(Math.exp(-dt * 18));
    const dust = (c.dustT -= dt) <= 0 && !fighting && !mining;
    if (dust) c.dustT = 0.3;
    let vi = 0, si = 0;
    s.members.forEach((m, i) => {
      // où il doit être : sa place dans la colonne, en batterie (blindés) ou en ligne (fantassins) au combat, autour du filon
      let tx: number, tz: number, th: number, act: SoldierMode = 'walk';
      const v = m.rider ? vi++ : -1, j = m.soldier ? si++ : -1;
      if (m.rider) {
        const [back, side] = fighting ? c.battery[v] : m.slot!, p = this.along(s.path, pos - back);
        tx = p[0] + Math.cos(p[2]) * side; tz = p[1] - Math.sin(p[2]) * side;
        th = fighting ? Math.atan2(lead[0] - tx, lead[1] - tz) : p[2];
      } else if (fighting) {
        // sur deux rangs de six au plus, en travers de la galerie, en retrait de la tête ; le second en quinconce
        const rank = Math.floor(j / 6), inRank = Math.min(6, nf - rank * 6), k = (j % 6) - (inRank - 1) / 2 + (rank % 2) * 0.5, back = 0.4 + rank * 0.17;
        tx = lead[0] - Math.sin(lead[2]) * back + Math.cos(lead[2]) * k * 0.15;
        tz = lead[1] - Math.cos(lead[2]) * back - Math.sin(lead[2]) * k * 0.15;
        th = lead[2]; act = 'fight';
      } else if (mining) {
        // quatre frappent la paroi, les autres montent la garde en cercle, face au noir
        const near = j < 4, a = near ? j * 1.57 + 0.4 : ((j - 4) / Math.max(1, nf - 4)) * Math.PI * 2, r = near ? 0.26 : 0.62;
        tx = lead[0] + Math.sin(a) * r; tz = lead[1] + Math.cos(a) * r;
        th = near ? Math.atan2(lead[0] - tx, lead[1] - tz) : a; act = near ? 'fight' : 'guard';
      } else {
        const [back, side] = m.slot!, p = this.along(s.path, pos - back);
        tx = p[0] + Math.cos(p[2]) * side; tz = p[1] - Math.sin(p[2]) * side; th = p[2];
      }
      // chacun glisse jusqu'à sa place (pas de saut quand la colonne se déploie) ; ceux qui ne sont pas encore descendus
      // dans les galeries restent cachés
      if (m.x === undefined) { m.x = tx; m.z = tz; m.h = th; }
      m.x += (tx - m.x) * ease; m.z! += (tz - m.z!) * ease; m.h = m.h! + wrapAngle(th - m.h!) * ease;
      const x = m.x, z = m.z!, h = m.h, y = this.under.heightAt(x, z), moving = !fighting && !mining;
      const root = (m.rider ?? m.soldier)!.root;
      root.visible = fighting || mining || pos - m.slot![0] > -0.15;
      root.position.set(x, y, z); root.rotation.y = h;
      if (m.rider) {
        const r = m.rider;
        // la tourelle : droit devant en route, vers le filon, vers la créature la plus proche au combat
        const foe = fighting ? nearest(x, z, 3.4) : null;
        const want = foe ? Math.atan2(foe.x - x, foe.z - z) : mining ? Math.atan2(lead[0] - x, lead[1] - z) : h;
        const err = wrapAngle(want - h - m.aim!);
        m.aim! += Math.sign(err) * Math.min(Math.abs(err), dt * 2.2);
        r.turret!.rotation.y = m.aim!;
        m.recoil = Math.max(0, m.recoil! - dt * 3);
        armorStep(r, now * 13 + i * 1.7, moving ? 1 : 0, foe ? 0.03 : -0.05, m.recoil);
        // son projecteur éclaire devant la tourelle ; les chenilles et les roues soulèvent la poussière
        const dir = h + m.aim!;
        Object.assign(c.lamps[v], { x: x + Math.sin(dir), y: y + 0.35, z: z + Math.cos(dir) });
        if (dust && root.visible) this.fx.puff(x - Math.sin(h) * 0.35, y + 0.03, z - Math.cos(h) * 0.35, 2);
        s.cool[i] -= dt;
        if (!foe || Math.abs(err) > 0.12) return;
        r.root.updateMatrixWorld(true);
        const mz = r.turret!.localToWorld(r.muzzle!.clone()), fy = this.under.heightAt(foe.x, foe.z) + 0.16;
        if (r.gun === 'cannon' && s.cool[i] <= 0) {
          // coup de canon : souffle à la bouche, l'obus file et éclate sur la créature, la galerie s'illumine
          s.cool[i] = 2.3 + Math.random() * 1.3;
          m.recoil = 1;
          this.fx.blast(mz.x, mz.y, mz.z, Math.sin(dir), Math.cos(dir));
          this.fx.tracer(mz.x, mz.y, mz.z, foe.x, fy, foe.z, 0xffe6a0, 16);
          this.fx.boom(foe.x, fy, foe.z);
          this.mobs.strike(foe, x, z);
          Object.assign(c.flash, { x: mz.x, y: mz.y + 0.25, z: mz.z });
          c.flash.c.setRGB(1, 0.78, 0.48).multiplyScalar(3);
        } else if (r.gun === 'mg') {
          // rafale du canon-mitrailleur : six coups, autant de traçantes
          if (s.cool[i] <= 0 && !m.burst) { m.burst = 6; m.burstT = 0; s.cool[i] = 1.7 + Math.random() * 0.8; this.mobs.strike(foe, x, z); }
          if (m.burst! > 0 && (m.burstT! -= dt) <= 0) {
            m.burst!--; m.burstT = 0.09; m.recoil = 0.45;
            const jx = (Math.random() - 0.5) * 0.12, jz = (Math.random() - 0.5) * 0.12;
            this.fx.flash(mz.x, mz.y, mz.z, 0xffd080);
            this.fx.tracer(mz.x, mz.y, mz.z, foe.x + jx, fy, foe.z + jz, 0xff7a3a, 13);
            this.fx.hit(foe.x + jx, fy, foe.z + jz, 0xffa050, 4, 'shot');
          }
        }
        return;
      }
      const sol = m.soldier!;
      if (fighting) {
        const foe = nearest(x, z, 2.4);
        if (foe) {
          sol.root.rotation.y = Math.atan2(foe.x - x, foe.z - z);
          foe.target = [x, z];
          s.cool[i] -= dt;
          if (s.cool[i] <= 0 && Math.hypot(foe.x - x, foe.z - z) < 1.75) {
            s.cool[i] = 1.6;
            const a = sol.root.rotation.y, fy = this.under.heightAt(foe.x, foe.z) + 0.16, mx = x + Math.sin(a) * 0.12, my = y + 0.2, mz = z + Math.cos(a) * 0.12;
            this.fx.shot(mx, my, mz, foe.x, fy, foe.z);
            this.fx.tracer(mx, my, mz, foe.x, fy, foe.z, 0xffd27a, 12);
            this.mobs.strike(foe, x, z);
          }
        }
      }
      // au pas cadencé : toute la section part du même pied
      soldierStep(sol, act === 'walk' ? now * 9 : now * 9 + i * 1.3, act);
    });
    // les drones : l'un éclaire devant la tête, l'autre veille au-dessus des transports ; au combat et au filon, ils tournent
    // au-dessus de la tête de la colonne, projecteur braqué
    c.drones.forEach((d, k) => {
      let tx: number, tz: number, hy: number;
      if (fighting || mining) {
        const a = now * 0.6 + k * Math.PI;
        tx = lead[0] + Math.sin(a) * 0.55; tz = lead[1] + Math.cos(a) * 0.55; hy = 0.85 + k * 0.15;
      } else {
        const p = this.along(s.path, k ? pos - 1.6 : pos + 0.9), side = k ? 0.35 : 0;
        tx = p[0] + Math.cos(p[2]) * side; tz = p[1] - Math.sin(p[2]) * side; hy = k ? 1.1 : 0.95;
      }
      const o = d.root.position;
      if (!d.root.userData.on) { d.root.userData.on = true; o.set(tx, this.under.heightAt(tx, tz) + hy, tz); }
      o.x += (tx - o.x) * ease * 0.6; o.z += (tz - o.z) * ease * 0.6;
      o.y += (this.under.heightAt(o.x, o.z) + hy - o.y) * ease;
      const face = fighting || mining ? Math.atan2(lead[0] - o.x, lead[1] - o.z) : lead[2];
      d.root.rotation.y += wrapAngle(face - d.root.rotation.y) * ease;
      droneStep(d, now, k * 2.3);
      const a = d.root.rotation.y;
      Object.assign(c.lamps[c.lamps.length - c.drones.length + k], { x: o.x + Math.sin(a) * 0.3, y: this.under.heightAt(o.x, o.z) + 0.3, z: o.z + Math.cos(a) * 0.3 });
    });
    // la tête de la colonne éclaire la troupe ; les créatures s'enfuient devant tant de lumière
    Object.assign(s.light, { x: lead[0], y: this.under.heightAt(lead[0], lead[1]) + 0.55, z: lead[1] });
    if ((s.scareT -= dt) <= 0) { s.scareT = 1; this.mobs.scare(lead[0], lead[1], 3.2); }
  }

  /** Point du chemin à la distance s (en cases) et cap de marche */
  private along(path: [number, number][], s: number): [number, number, number] {
    const i = Math.max(0, Math.min(path.length - 2, Math.floor(s))), f = Math.max(0, Math.min(1, s - i));
    const a = path[i], b = path[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
  }

  private moveTroop(s: TroopShow, t: Troop, dt: number) {
    if (s.modern) { this.moveColumn(s, t, dt); return; }
    // l'avancement de l'expédition se lit en chemin parcouru, avec une halte à chaque filon et à chaque embuscade
    const time = t.progress * s.route.total, { pos, leg } = routeAt(s.route, time);
    const mining = leg?.kind === 'mine', fighting = leg?.kind === 'fight';
    const lead = this.along(s.path, pos);
    this.ambushes(s, t, time, lead, dt);
    // les créatures encore debout de l'embuscade en cours
    const live = fighting ? [...s.foes.values()].flat().filter((f) => f.alive && f.dying < 0) : [];
    // au combat, les fusiliers se mettent en ligne, en travers du chemin, un peu en retrait, et tirent par salves
    const rifles = s.members.map((m) => m.soldier?.arms[0].userData.hold === 'rifle');
    const nr = rifles.filter(Boolean).length;
    let ri = 0;
    if (fighting && nr > 1) {
      const volley = s.cool.findIndex((c, i) => rifles[i] && c <= 0) >= 0;
      if (volley) s.cool.forEach((c, i) => { if (rifles[i] && c < 0.3) s.cool[i] = Math.min(c, 0); });
    }
    s.members.forEach((m, i) => {
      let x: number, z: number, h: number;
      if (fighting) {
        // chacun marche sur la créature la plus proche de sa place dans le cercle, s'arrête à portée (de lame, ou de fusil) et
        // frappe ; sans créature à portée, il reste en cercle face au noir. Les fusiliers, eux, tiennent leur ligne
        const rifle = rifles[i];
        let a = (i / s.members.length) * Math.PI * 2 + 0.6, r = m.rider ? 0.42 : 0.3;
        let hx = lead[0] + Math.sin(a) * r, hz = lead[1] + Math.cos(a) * r;
        if (rifle && nr > 1) {
          // sur deux rangs de six au plus, le second derrière le premier, en quinconce
          const rank = Math.floor(ri / 6), inRank = Math.min(6, nr - rank * 6), k = (ri++ % 6) - (inRank - 1) / 2 + (rank % 2) * 0.5, back = 0.4 + rank * 0.17;
          hx = lead[0] - Math.sin(lead[2]) * back + Math.cos(lead[2]) * k * 0.15;
          hz = lead[1] - Math.cos(lead[2]) * back - Math.sin(lead[2]) * k * 0.15;
          a = lead[2]; r = 0;
        }
        const foe = live.reduce<Mob | null>((b, f) => (Math.hypot(f.x - hx, f.z - hz) < (b ? Math.hypot(b.x - hx, b.z - hz) : rifle ? 2.4 : 1.6) ? f : b), null);
        if (foe) {
          const d = Math.hypot(foe.x - hx, foe.z - hz) || 1, reach = rifle ? (nr > 1 ? 1.6 : 0.55) : m.rider ? 0.34 : 0.24, go = Math.max(0, Math.min(0.45, d - reach));
          x = hx + ((foe.x - hx) / d) * go; z = hz + ((foe.z - hz) / d) * go; h = Math.atan2(foe.x - x, foe.z - z);
          // le coup porte : étincelles sur la créature, qui recule ; le fusil tire (éclair, traînée, impact)
          s.cool[i] -= dt;
          if (s.cool[i] <= 0 && Math.hypot(foe.x - x, foe.z - z) < reach + 0.12) {
            s.cool[i] = rifle ? (nr > 1 ? 1.6 : 0.8 + Math.random() * 0.35) : 0.6 + Math.random() * 0.35;
            const fy = this.under.heightAt(foe.x, foe.z) + 0.16;
            if (rifle) this.fx.shot(x + Math.sin(h) * 0.12, this.under.heightAt(x, z) + 0.2, z + Math.cos(h) * 0.12, foe.x, fy, foe.z);
            else this.fx.hit((x + foe.x * 2) / 3, fy, (z + foe.z * 2) / 3, 0xffd27a, 12, 'blade');
            this.mobs.strike(foe, x, z);
          }
          foe.target = [x, z];
        } else { x = hx; z = hz; h = a; }
      } else if (mining) {
        // autour du filon : les uns frappent la paroi, les autres montent la garde
        const a = i * 2.1 + 0.5;
        x = lead[0] + Math.cos(a) * 0.32 * (i ? 1 : 0.3); z = lead[1] + Math.sin(a) * 0.32 * (i ? 1 : 0.3); h = Math.atan2(lead[0] - x, lead[1] - z) + (i % 2 ? Math.PI : 0);
      } else {
        // en colonne par deux derrière le chef ; les cavaliers sur les flancs
        const p = this.along(s.path, Math.max(0, pos - Math.floor((i + 1) / 2) * 0.32));
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * (m.rider ? 0.2 : 0.11);
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
      }
    });
    // la torche du chef éclaire la troupe ; les créatures s'enfuient devant elle
    Object.assign(s.light, { x: lead[0], y: this.under.heightAt(lead[0], lead[1]) + 0.55, z: lead[1] });
    if ((s.scareT -= dt) <= 0) { s.scareT = 1; this.mobs.scare(lead[0], lead[1], 2.6); }
  }

  /** Position de la tête d'une troupe (pour que la caméra la suive), ou null si elle n'est pas sous terre */
  troopAt(id: number): [number, number] | null {
    const s = this.troops.get(id), m = s?.members[0];
    const o = m ? (m.rider ?? m.soldier)!.root.position : null;
    return o ? [o.x, o.z] : null;
  }

  /**
   * Embuscades : les créatures surgissent un peu avant que la troupe n'arrive et la chargent ; pendant le combat elles
   * tombent une à une ; à la fin, les dernières meurent, ou s'en retournent dans le noir si la troupe a dû reculer
   */
  private ambushes(s: TroopShow, t: Troop, time: number, lead: [number, number, number], dt: number) {
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
      // chacune prend sa place autour de la troupe au lieu de se ruer toutes au même point
      foes.forEach((f, fi) => { if (f.alive && f.dying < 0) { const a = (fi / foes!.length) * Math.PI * 2 + j * 1.3; f.foe = [lead[0] + Math.sin(a) * 0.36, lead[1] + Math.cos(a) * 0.36]; } });
      if (time < m.t0) return;
      // les créatures rendent les coups : une lame les pare (étincelles blanches), parfois une morsure porte
      for (const f of foes) {
        if (!f.alive || f.dying >= 0 || !f.target || Math.hypot(f.target[0] - f.x, f.target[1] - f.z) > 0.42) continue;
        const c = (s.foeCool.get(f) ?? Math.random() * 1.2) - dt;
        if (c <= 0) {
          const bite = m.result !== 'clean' && Math.random() < 0.3;
          this.fx.hit((f.x + f.target[0]) / 2, this.under.heightAt(f.x, f.z) + 0.15, (f.z + f.target[1]) / 2, bite ? 0xff5a4a : 0xf2f4ff, bite ? 10 : 7, bite ? 'bite' : 'blade');
          s.foeCool.set(f, 1 + Math.random() * 1.2);
        } else s.foeCool.set(f, c);
      }
      // tombées jusqu'ici : toutes à la fin d'une victoire, toutes sauf une si un soldat est blessé, la moitié si l'on recule
      const quota = m.result === 'rout' ? Math.floor(m.n / 2) : m.n - (m.result === 'hurt' ? 1 : 0);
      const due = Math.min(quota, Math.floor(((time - m.t0) / FIGHT_HALT) * (quota + 1)));
      let down = foes.filter((f) => !f.alive || f.dying >= 0).length;
      for (const f of foes) if (down < due && f.alive && f.dying < 0) { this.fx.hit(f.x, this.under.heightAt(f.x, f.z) + 0.15, f.z, 0xffe8b0, 22, 'blade'); this.fx.puff(f.x, this.under.heightAt(f.x, f.z) + 0.05, f.z, 10); this.mobs.kill(f); down++; }
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

  // ---------- Creusement ----------

  /**
   * Les cases que les mineurs viennent de percer : le relief se refait autour (parois, sol, teinte des galeries tenues), la
   * poussière et les éclats jaillissent, les gravats restent au sol ; les toiles de la roche ôtée tombent, les filons voisins
   * se reposent sur la paroi qui reste
   */
  private applyDug() {
    this.carvedN = this.under.carved;
    const u = this.under, fresh = [...this.world.dug].filter((k) => !this.dugSeen.has(k) && u.open[k]);
    if (!fresh.length || !this.gv) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), before = this.claimedN;
    for (const k of fresh) {
      this.dugSeen.add(k);
      const [v0, v1] = this.regrid(u.carveRect(k));
      this.tintHeld(v0, v1);
      const x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5, y = u.heightAt(x, z);
      this.fx.puff(x, y + 0.1, z, 18);
      this.fx.chips(x, y + 0.45, z, CHIP, 16);
      this.addRubble(k);
      for (const n of [k + 1, k - 1, k + N, k - N]) {
        const web = this.webs.get(n);
        if (web !== undefined && this.webMesh) { this.webMesh.setMatrixAt(web, zero); this.webMesh.instanceMatrix.needsUpdate = true; this.webs.delete(n); }
        if (this.veins.has(n)) this.moveVein(n);
      }
    }
    // lanternes et bannières du tunnel ; la teinte du sol est faite, sauf si d'autres galeries ont été prises entre-temps
    this.refreshClaims(before < 0 || this.world.claimed.size !== before + fresh.length);
  }

  /** Le filon suit sa paroi : ses cubes se posent sur la roche qui reste (s'il n'en reste plus, il est tombé avec elle) */
  private moveVein(k: number) {
    const v = this.veins.get(k)!, im = this.oreMeshes[v.mesh];
    if (!im) return;
    const cubes = this.veinCubes(k, v.ore), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    v.idx.forEach((i, j) => im.setMatrixAt(i, cubes[j]?.m ?? zero));
    im.instanceMatrix.needsUpdate = true;
  }

  /** Gravats au sol d'une case creusée : trois ou quatre morceaux de la roche de sa zone */
  private addRubble(k: number) {
    const u = this.under, d = this.d, cx = k % N, cz = Math.floor(k / N), c = new THREE.Color();
    for (let i = 0, n = 3 + Math.floor(hash2(cx, cz, 710) * 2); i < n; i++) {
      const m = this.rubble[i % this.rubble.length];
      if (!m || m.count >= MAX_RUBBLE) continue;
      const x = cx + 0.15 + hash2(cx, cz, 711 + i) * 0.7, z = cz + 0.15 + hash2(cx, cz, 721 + i) * 0.7, s = 0.5 + hash2(cx, cz, 731 + i) * 0.6;
      d.position.set(x, u.heightAt(x, z) - 0.01, z); d.rotation.set(0, hash2(cx, cz, 741 + i) * 6.28, 0); d.scale.set(s, s * 0.7, s); d.updateMatrix();
      m.setMatrixAt(m.count, d.matrix);
      m.setColorAt(m.count, c.copy(WALL[u.zone[k]]).multiplyScalar(0.75 + hash2(cx, cz, 751 + i) * 0.2));
      m.count++;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
  }

  /**
   * Le creusement, à chaque image : la file des cases à creuser (le front d'abord), l'avancement du front (0 … 1) et le
   * passage conseillé (null : hors du mode Creuser) ; les mineurs du camp vont au front et frappent la roche
   */
  setDigs(queue: number[], progress: number, hint: number[] | null, age: number, dt: number) {
    const face = queue[0] ?? -1, t = this.uTime.value;
    // contours : reposés quand la file, le conseil ou le relief changent ; le front se remplit à mesure, le conseil bat
    const key = `${queue.join(',')}|${hint?.join(',') ?? '-'}|${this.under.carved}`;
    if (key !== this.marksKey) {
      this.marksKey = key;
      this.placeMarks(this.digMarks, queue);
      this.placeMarks(this.digFace, face >= 0 ? [face] : []);
      this.placeMarks(this.hintMarks, (hint ?? []).filter((k) => !queue.includes(k)));
    }
    // hors du mode Creuser, ou une case vient d'être percée : la case visée se redessinera au prochain mouvement de souris
    if (!hint || this.cursorCarved !== this.under.carved) { this.cursorCarved = this.under.carved; this.cursorMarks.count = 0; }
    // (assez léger pour qu'on voie les mineurs au pied de la paroi, à travers)
    (this.digFace.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.3 * progress + Math.sin(t * 6) * 0.04;
    (this.hintMarks.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 3) * 0.2;
    this.stepDigCrew(face, age, dt);
  }

  /** La case visée est-elle dessinée ? (elle s'efface hors du mode Creuser, et quand une case vient d'être percée) */
  digCursorShown() { return this.cursorMarks.count > 0; }

  /** La case visée en mode Creuser et le tunnel qu'on y creuserait : en vert, en rouge si l'on ne peut pas */
  digCursor(cells: number[], ok: boolean) {
    this.placeMarks(this.cursorMarks, cells);
    (this.cursorMarks.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x7dffa8 : 0xff6a5a);
  }

  /** Un contour sur chaque case, posé sur le dessus de la roche (au-dessus de ses bosses) */
  private placeMarks(mesh: THREE.InstancedMesh, cells: number[]) {
    const u = this.under, d = this.d;
    let n = 0;
    for (const k of cells) {
      if (n >= MAX_MARKS) break;
      const x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5;
      let y = 0;
      for (const [dx, dz] of [[0, 0], [0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) y = Math.max(y, u.heightAt(x + dx, z + dz));
      d.position.set(x, y + 0.05, z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix();
      mesh.setMatrixAt(n++, d.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Case de galerie d'où l'on creuse la roche `face` (une galerie tenue de préférence, et sans gros cristal qui cache les mineurs), ou -1 */
  private standOf(face: number) {
    const u = this.under, score = (n: number) => (this.world.claimed.has(n) ? 2 : 0) + (this.decorCells.has(n) ? 0 : 1);
    let best = -1;
    for (const n of [face + 1, face - 1, face + N, face - N]) if (u.walkable(n % N, Math.floor(n / N)) && (best < 0 || score(n) > score(best))) best = n;
    return best;
  }

  /**
   * Les mineurs du camp : ils en sortent jusqu'au front du tunnel, du même pas que le jeu les fait marcher ; deux frappent la
   * roche au pic (éclats, poussière), le troisième emporte les gravats dans sa hotte un peu en arrière et revient ; la file
   * vide, ils rentrent au camp
   */
  private stepDigCrew(face: number, age: number, dt: number) {
    const u = this.under, home = this.campCenter();
    let c = this.digCrew;
    if (!c) {
      if (face < 0) return;
      const start = home >= 0 ? home : this.standOf(face);
      if (start < 0) return;
      c = this.digCrew = { miners: [], light: { x: 0, y: -20, z: 0, r: 3.6, c: new THREE.Color(1, 0.74, 0.45).multiplyScalar(1.5), flicker: 0.2 }, face: -2, hit: [0.2, 0.55, 0], pickT: 0, speed: DIG_WALK, dump: [0, 0] };
      for (let i = 0; i < 3; i++) {
        const actor = makeSoldier(age, 900 + i, false, 'miner');
        this.scene.add(actor.root);
        c.miners.push({ actor, x: (start % N) + 0.5 + Math.cos(i * 2.1) * 0.25, z: Math.floor(start / N) + 0.5 + Math.sin(i * 2.1) * 0.25, heading: 0, path: [], goal: -1, wait: 0, phase: i * 0.7 });
      }
    }
    const crew = c, stand = face >= 0 ? this.standOf(face) : -1;
    // la roche à frapper : depuis le centre de la case où l'on se tient, vers la case de roche
    const sx = (stand % N) + 0.5, sz = Math.floor(stand / N) + 0.5, dx = (face % N) - (stand % N), dz = Math.floor(face / N) - Math.floor(stand / N), ah = Math.atan2(dx, dz);
    const slot = (i: number): [number, number, number] => i < 2 ? [sx + dx * 0.26 + dz * (i ? 0.17 : -0.17), sz + dz * 0.26 - dx * (i ? 0.17 : -0.17), ah] : [sx - dx * 0.18, sz - dz * 0.18, ah];
    const hx = (home % N) + 0.5, hz = Math.floor(home / N) + 0.5;
    if (crew.face !== face) {
      crew.face = face;
      // un nouveau front : chacun y va ; plus rien à creuser : tout le monde rentre au camp
      crew.miners.forEach((m, i) => {
        if (stand >= 0) this.walkTo(m, face, slot(i));
        else if (home >= 0) { this.walkTo(m, -4, [hx + Math.cos(i * 2.1) * 0.3, hz + Math.sin(i * 2.1) * 0.3, 0]); }
        else m.path = [];
        m.wait = 0;
      });
      // de loin, ils pressent encore le pas (le jeu compte leur marche au plus DIG_WALK_MAX secondes)
      crew.speed = Math.max(DIG_WALK, crew.miners[0].path.length / DIG_WALK_MAX);
      // le porteur vide sa hotte quelques cases en arrière, sur le chemin du camp
      const back = stand >= 0 && home >= 0 ? u.route(stand, home) : null, dk = back ? back[Math.min(5, back.length - 1)] : stand;
      crew.dump = [(dk % N) + 0.5, Math.floor(dk / N) + 0.5];
    }
    if (stand < 0 && crew.miners.every((m) => !m.path.length)) {
      for (const m of crew.miners) this.scene.remove(m.actor.root);
      this.digCrew = null;
      return;
    }
    crew.pickT -= dt;
    crew.miners.forEach((m, i) => {
      if (m.path.length) {
        const [tx, tz] = m.path[0], ex = tx - m.x, ez = tz - m.z, d = Math.hypot(ex, ez), s = Math.min(d, dt * crew.speed);
        if (d > 1e-3) { m.x += (ex / d) * s; m.z += (ez / d) * s; m.heading = Math.atan2(ex, ez); }
        if (d - s < 0.02) m.path.shift();
        if (!m.path.length && m.goal === face) m.wait = 2.5;
        if (!m.path.length && m.goal === -3) m.wait = 1.5;
        soldierStep(m.actor, (m.phase += dt * 9), i === 2 && m.goal === -3 ? 'carry' : 'walk');
      } else if (stand >= 0 && i < 2 && m.goal === face) {
        // au pic, face à la roche : à chaque coup, des éclats et un peu de poussière
        m.heading = ah;
        soldierStep(m.actor, (m.phase += dt * 9), 'fight');
        if ((crew.hit[i] -= dt) <= 0) {
          crew.hit[i] = 0.5 + Math.random() * 0.25;
          const px = sx + dx * 0.5 + dz * (i ? 0.17 : -0.17), pz = sz + dz * 0.5 - dx * (i ? 0.17 : -0.17);
          this.fx.chips(px, 0.3 + Math.random() * 0.25, pz, CHIP, 5);
          if (Math.random() < 0.35) this.fx.puff(px - dx * 0.15, u.heightAt(px, pz) + 0.05, pz - dz * 0.15, 3);
          // le son des pioches, si l'on regarde le chantier
          if (crew.pickT <= 0 && Math.hypot(sx - this.lantern.x, sz - this.lantern.z) < 14) { crew.pickT = 1.4; this.onPick?.(); }
        }
      } else if (stand >= 0 && i === 2) {
        // le porteur : il charge sa hotte au front, la vide au camp, et revient
        soldierStep(m.actor, (m.phase += dt * 9), 'idle');
        if ((m.wait -= dt) <= 0) {
          if (m.goal === face) this.walkTo(m, -3, [crew.dump[0] + 0.2, crew.dump[1] - 0.15, 0]);
          else this.walkTo(m, face, slot(2));
        }
      } else soldierStep(m.actor, (m.phase += dt * 9), 'idle');
      m.actor.root.position.set(m.x, u.heightAt(m.x, m.z), m.z);
      m.actor.root.rotation.y = m.heading;
    });
    if (stand >= 0) Object.assign(crew.light, { x: sx + dx * 0.3, y: u.heightAt(sx, sz) + 0.6, z: sz + dz * 0.3 });
    else crew.light.y = -20;
  }

  // ---------- Torches ----------

  torchPoints() { return this.torchSources.map((s) => ({ x: s.x, z: s.z })); }

  /**
   * Torches posées d'elles-mêmes : en couronne autour du camp, et fichées dans les parois des galeries tenues, une par bloc
   * de TORCH_GRID cases (sur la case au pied de la paroi que le bloc tire au sort) ; celles des anciennes sauvegardes restent
   */
  private refreshTorches() {
    const d = this.d, u = this.under, w = this.world;
    this.torchSources = [];
    let n = 0;
    const put = (x: number, y: number, z: number, ry: number, tilt: number) => {
      if (n >= MAX_TORCHES) return;
      d.position.set(x, y, z);
      d.rotation.set(tilt, ry, 0, 'YXZ');
      d.scale.setScalar(1);
      d.updateMatrix();
      this.torchMesh.setMatrixAt(n, d.matrix);
      this.flameMesh.setMatrixAt(n, d.matrix);
      n++;
      this.torchSources.push({ x, y: y + 0.45, z, r: 4.2, c: new THREE.Color(1, 0.62, 0.3).multiplyScalar(1.7), flicker: 0.25 });
    };
    // le camp : une couronne de torches à quelques pas du feu, sur le sol des galeries
    if (this.camp) {
      const [cx, cz] = this.campC;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2, x = cx + Math.sin(a) * 3.2, z = cz + Math.cos(a) * 3.2;
        const k = Math.floor(z) * N + Math.floor(x);
        if (!u.walkable(Math.floor(x), Math.floor(z)) || this.campBlocked.has(k) || u.heightAt(x, z) > 0.45) continue;
        put(x, u.heightAt(x, z), z, 0, 0);
      }
    }
    // les galeries tenues : une torche par bloc, penchée hors de la paroi, à mi-hauteur de la roche
    const blocks = new Map<number, [number, number]>();
    for (const k of w.claimed) {
      const x = k % N, z = Math.floor(k / N);
      if (u.wallDist[k] !== 1 || !u.walkable(x, z)) continue;
      const bk = Math.floor(z / TORCH_GRID) * N + Math.floor(x / TORCH_GRID), s = hash2(x, z, 620), b = blocks.get(bk);
      if (!b || s > b[1]) blocks.set(bk, [k, s]);
    }
    for (const [k] of blocks.values()) {
      const cx = k % N, cz = Math.floor(k / N), p = this.wallPoint(cx, cz, 0.42);
      if (!p) continue;
      // un peu en avant de la roche, penchée vers la galerie
      const x = p[0] + Math.sin(p[2]) * 0.05, z = p[1] + Math.cos(p[2]) * 0.05;
      put(x, 0.3, z, p[2], 0.45);
    }
    for (const k of w.torches) {
      const x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5;
      if (u.walkable(Math.floor(x), Math.floor(z))) put(x, u.heightAt(x, z), z, 0, 0);
    }
    for (const m of [this.torchMesh, this.flameMesh]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }

  /**
   * Galeries tenues : une lanterne par bloc de cases, sur la case la plus dégagée ; une bannière là où la zone tenue touche
   * les galeries sauvages (le front), et sous chaque avant-poste. Elles éclairent : ce qui est tenu se voit de loin.
   * `tint` : le sol tenu se reteinte partout (sinon, il l'est déjà)
   */
  private refreshClaims(tint = true) {
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
    if (tint) this.tintHeld();
    this.refreshTorches();
    this.claimPost.count = this.claimLamp.count = nl;
    this.bannerPole.count = this.bannerCloth.count = nb;
    for (const m of [this.claimPost, this.claimLamp, this.bannerPole, this.bannerCloth]) m.instanceMatrix.needsUpdate = true;
  }

  /**
   * Le sol des galeries tenues s'éclaircit en terre battue chaude, fondue sur une case autour (les parois gardent leur teinte) ;
   * seulement les sommets v0 … v1 (exclu) du maillage, autour d'une case qu'on vient de creuser
   */
  private tintHeld(v0 = 0, v1 = -1) {
    const base = this.groundBase, attr = this.groundGeo.attributes.color as THREE.BufferAttribute | undefined;
    if (!base || !attr || attr.array.length !== base.length) return;
    const held = new Float32Array(N * N), out = attr.array as Float32Array, pos = this.groundGeo.attributes.position.array as Float32Array;
    for (const k of this.world.claimed) held[k] = 1;
    for (let v = v0 * 3, end = v1 < 0 ? pos.length : v1 * 3; v < end; v += 3) {
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
    const key = `${level}|${this.under.version}|${center}|${Math.min(this.age, 5)}`;
    if (key === this.campKey) return;
    this.campKey = key;
    if (this.camp) { this.scene.remove(this.camp.group); this.camp.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    for (const g of this.guards) this.scene.remove(g.soldier.root);
    this.camp = null; this.campSources = []; this.guards = [];
    if (center < 0) { this.refreshTorches(); return; }
    this.campC = [(center % N) + 0.5, Math.floor(center / N) + 0.5];
    const placed = campLayout(this.under, center, level, this.decorCells);
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
    this.refreshTorches();
  }

  /** Le point est-il dans le camp (ses tentes, son feu, ses gardes autour du puits) ? */
  campAt(x: number, z: number) { return !!this.camp && Math.hypot(x - this.campC[0], z - this.campC[1]) < 3.4; }

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
      const key = `${c.n}|${Math.min(age, 5)}|${c.entry}`;
      if (!crew || crew.key !== key) {
        if (crew) for (const m of crew.miners) this.scene.remove(m.actor.root);
        crew = { key, miners: [], light: { x: 0, y: -20, z: 0, r: 4, c: new THREE.Color(1, 0.72, 0.45).multiplyScalar(1.3), flicker: 0.2 }, slotsAt: -2, slots: [] };
        this.crews.set(c.id, crew);
        // les mineurs de l'époque (capuchon, barrette à lampe, casque), pic en main
        for (let i = 0; i < c.n; i++) {
          const actor = makeSoldier(age, c.id * 7 + i, false, 'miner');
          this.scene.add(actor.root);
          const x = (c.entry % N) + 0.5 + Math.cos(i * 2.4) * 0.3, z = Math.floor(c.entry / N) + 0.5 + Math.sin(i * 2.4) * 0.3;
          crew.miners.push({ actor, x, z, heading: 0, path: [], goal: -1, wait: i * 0.6, phase: i * 0.53 });
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
        soldierStep(m.actor, (m.phase += dt * 9), 'walk');
      } else {
        // au filon, face à la roche, on frappe ; au camp, le porteur vide sa hotte
        if (m.goal === work) m.heading = slot[2];
        soldierStep(m.actor, (m.phase += dt * 9), m.goal === work ? 'fight' : 'idle');
        if (carrier && (m.wait -= dt) <= 0) this.walkTo(m, m.goal === work ? entry : work, m.goal === work ? home : slot);
      }
      const y = u.heightAt(m.x, m.z);
      m.actor.root.position.set(m.x, y, m.z);
      m.actor.root.rotation.y = m.heading;
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
    // les mineurs ont percé de nouvelles cases : le relief se refait autour
    if (this.under.carved !== this.carvedN) this.applyDug();
    if (this.world.claimed.size !== this.claimedN || this.claimBuilt !== this.world.buildings.size) { this.claimBuilt = this.world.buildings.size; this.refreshClaims(); }
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = LIGHT_PICK;
      const all = this.sources.concat(this.torchSources, this.shaftSources, this.claimSources, this.campSources, this.guards.map((g) => g.light), [...this.troops.values()].flatMap((s) => [s.light, ...(s.modern ? [...s.modern.lamps, s.modern.flash] : [])]), [...this.crews.values()].filter((c) => c.miners.length).map((c) => c.light), this.digCrew ? [this.digCrew.light] : []);
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
    this.fx.update(dt);
    this.mobs.update(dt, camera, this.lantern, [...this.torchPoints(), ...this.guards.map((g) => ({ x: g.x, z: g.z })), ...[...this.troops.values()].map((s) => ({ x: s.light.x, z: s.light.z })), ...[...this.crews.values(), ...(this.digCrew ? [this.digCrew] : [])].flatMap((c) => c.miners.map((m) => ({ x: m.x, z: m.z })))]);
  }

  /** Sortie du souterrain : la surface ne reçoit plus ces lumières */
  leave() { caveLights.uLN.value = 0; }
}

const WHITE = new THREE.Color(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0), LEAN_DIR = new THREE.Vector3(), SPIN = new THREE.Quaternion();
/** Os blanchis, pierre taillée des ruines, glace, neige, basalte, obsidienne, braises, spores */
const BONE = new THREE.Color(0.93, 0.9, 0.82), RUIN = new THREE.Color(0xb9ab92), ICE = new THREE.Color(0xbfe6f5), SNOWY = new THREE.Color(0xeef4f8);
const BASALT = new THREE.Color(0x3a3434), OBSIDIAN = new THREE.Color(0x2a1e36), EMBER_GLOW = new THREE.Color(1, 0.42, 0.12), EMBER_DISC = new THREE.Color(0.55, 0.16, 0.03);
const SPORE = new THREE.Color(0xc8ff8a);
/** Clairières : une au plus par bloc de CLEAR_GRID × CLEAR_GRID cases, avec cette chance selon la zone */
const CLEAR_GRID = 7;
const CLEAR_P = [0.55, 0.75, 0.6, 0.75, 0.65];
/** Thèmes des clairières, par zone (pierre, cristal, glace, luxuriante, magma) ; un thème répété sort plus souvent */
const THEMES: string[][] = [
  ['stalagmites', 'stalagmites', 'column', 'rockfall', 'ossuary', 'ruins'],
  ['geode', 'geode', 'spire', 'column'],
  ['icePillars', 'iceSlabs', 'frozenLake', 'stalagmites'],
  ['shroomGrove', 'shroomGrove', 'mossGlade', 'roots'],
  ['basalt', 'lavaFlow', 'obsidian', 'ossuary'],
];
/** Pied des parois : part des tronçons garnis, selon la zone */
const FRINGE_P = [0.35, 0.5, 0.4, 0.5, 0.4];

/** Couleurs de sommet : f(y relatif, 0 en bas … 1 en haut) ; sans uv, sommets séparés (facettes) */
function painted(g: THREE.BufferGeometry, f: (y: number, i: number) => number = () => 1) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  out.computeBoundingBox();
  const p = out.attributes.position, b = out.boundingBox!, h = Math.max(1e-6, b.max.y - b.min.y), c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.fill(f((p.getY(i) - b.min.y) / h, i), i * 3, i * 3 + 3);
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  out.computeVertexNormals();
  return out;
}

let DECOR_GEOS: Record<string, THREE.BufferGeometry> | null = null;
/**
 * Les pièces dessinées des biomes, à l'échelle 1 (l'instance donne largeur et hauteur) : colonne en sablier bosselée, pilier
 * taillé, orgue de basalte, pilier et dalle de glace, plaque (lac gelé, lueur au sol), tapis de mousse, racine, lueur, coulée
 */
function decorGeos() {
  if (DECOR_GEOS) return DECOR_GEOS;
  // colonne : large au pied et sous la roche, étranglée au milieu, bourrelets de calcite
  const col = new THREE.CylinderGeometry(1, 1, 1, 9, 10).translate(0, 0.5, 0), cp = col.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i), a = Math.atan2(cp.getZ(i), cp.getX(i)), r = (0.5 + 0.9 * (2 * y - 1) ** 2) * (1 + Math.sin(y * 23 + a * 3) * 0.06);
    cp.setX(i, cp.getX(i) * r); cp.setZ(i, cp.getZ(i) * r);
  }
  // pilier taillé : fût à huit pans, base et chapiteau carrés
  const pillar = mergeGeometries([
    new THREE.CylinderGeometry(0.8, 0.85, 0.84, 8).translate(0, 0.5, 0).toNonIndexed(),
    new THREE.BoxGeometry(2.1, 0.08, 2.1).translate(0, 0.04, 0).toNonIndexed(),
    new THREE.BoxGeometry(2, 0.08, 2).translate(0, 0.96, 0).toNonIndexed(),
  ].map((g) => { g.deleteAttribute('uv'); return g; }))!;
  // la plaque : un disque à bord irrégulier
  const sheet = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), sp = sheet.attributes.position;
  for (let i = 1; i < sp.count; i++) { const r = 0.85 + Math.sin(i * 2.7) * 0.1 + Math.sin(i * 1.3) * 0.05; sp.setX(i, sp.getX(i) * r); sp.setZ(i, sp.getZ(i) * r); }
  // le tapis de mousse : un coussin bas et bosselé
  const moss = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.12, 1), mp = moss.attributes.position;
  for (let i = 0; i < mp.count; i++) { const r = 0.8 + Math.sin(i * 1.9) * 0.15; mp.setX(i, mp.getX(i) * r); mp.setZ(i, mp.getZ(i) * r); }
  // la racine : elle sort de la paroi (en haut), plonge et rampe le long du sol (vers +x), de plus en plus fine
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.1, 0.45, 0), new THREE.Vector3(0.25, 0.12, 0.06), new THREE.Vector3(0.6, 0.04, -0.06), new THREE.Vector3(1, 0.02, 0.05)]);
  const root = new THREE.TubeGeometry(curve, 16, 0.07, 6), rp = root.attributes.position, ruv = root.attributes.uv, c = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) { const t = ruv.getX(i), k = 1 - t * 0.75; curve.getPointAt(t, c); rp.setXYZ(i, c.x + (rp.getX(i) - c.x) * k, c.y + (rp.getY(i) - c.y) * k, c.z + (rp.getZ(i) - c.z) * k); }
  // la coulée : un ruban (de -0.5 à 0.5 en long), la lave du matériau dessus
  const flow = new THREE.PlaneGeometry(1, 1, 2, 2).rotateX(-Math.PI / 2);
  DECOR_GEOS = {
    column: painted(col, (y) => 0.82 + 0.18 * Math.sin(y * Math.PI)),
    pillar: painted(pillar, (y) => 0.9 + y * 0.1),
    basalt: painted(new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0), (y) => (y > 0.99 ? 1.25 : 0.85 + y * 0.1)),
    icePillar: painted(new THREE.CylinderGeometry(0.75, 1, 1, 6).translate(0, 0.5, 0), (y) => 0.8 + y * 0.3),
    slab: painted(new THREE.CylinderGeometry(1, 1.05, 1, 6).translate(0, 0.5, 0), (y) => 0.85 + y * 0.15),
    sheet: painted(sheet),
    moss: painted(moss, (y, i) => 0.85 + y * 0.2 + Math.sin(i * 7.1) * 0.06),
    root: painted(root, (y) => 0.8 + y * 0.25),
    orb: painted(new THREE.IcosahedronGeometry(1, 0)),
    flow,
  };
  return DECOR_GEOS;
}

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

/**
 * Lave : bruit qui coule lentement, du rouge sombre au jaune ; non éclairée, elle brille. `ribbon` : pour les coulées
 * (instances), la lave se croûte vers les bords du ruban
 */
function lavaMaterial(uTime: { value: number }, ribbon = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    defines: ribbon ? { RIBBON: 1 } : {},
    vertexShader: `varying vec2 vP;
varying vec2 vUv;
void main() {
#ifdef RIBBON
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vUv = uv;
#else
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vUv = vec2(0.5);
#endif
  vP = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: `uniform float uTime;
varying vec2 vP;
varying vec2 vUv;
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
  float edgeK = smoothstep(0.22, 0.48, abs(vUv.y - 0.5));
  gl_FragColor = vec4(mix(mix(melt, crust, crusted), crust * 0.7, edgeK), 1.0);
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
