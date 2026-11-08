import * as THREE from 'three';
import { VR } from '../world/world';
import { HellMap, HW, HL, HVW, HVL, HWALL, HPOOL_LAVA, HPOOL_CHASM, HLAVA_Y, HCHASM_Y, HELL_ZONES, Z_PORTAL, Z_EMBER, Z_BONES, Z_CRYSTAL, Z_KINGDOM, HellSiteKind } from '../world/hell';
import { ROCK_ISO, FLOOR_ISO } from '../world/underground';
import { Hell, HellUnit, HellEvent, DemonKind, DEMONS, BaseKind } from '../sim/hell';
import { caveLights, caveLit, glowMaterial, MAX_CAVE_LIGHTS } from './caveLight';
import { BattleLayer, paint, merge } from './battleUnits';
import { hash2, smoothstep } from '../core/rng';
import { baseGeo, BASE_FLAG, baseGeoAged, palisadeGeo, gateGeo, gateAlongX, GATE_HINGE, GATE_OPEN, WALL_N, WALL_E, WALL_S, WALL_W } from './hellBase';
import { baseAgeOf, BaseParts } from './hellBaseAges';
import { BASE_DEFS, BASE_R } from '../sim/hellBase';
import type { KingFight } from '../sim/kingdom';
import { KingFx } from './kingFx';
import { RuinSmoke } from './isleRuins';

/**
 * Le monde des Enfers, vu comme le monde souterrain (galeries en coupe, le dessus des parois est la tranche sombre de la
 * roche) mais aux couleurs infernales : roche rouge et noire, lave qui coule et éclaire, braises qui montent, brume rouge,
 * stalagmites, os de géants, cristaux ; les démons et leurs bâtiments en low-poly. Seules les sources (lave, cristaux,
 * braseros, portail) éclairent, via les lumières partagées du souterrain : aucune lumière par unité
 */

const BG = new THREE.Color(0x1c0a12);
/** la teinte de la brume quand l'onde de choc dorée l'a chassée (cinématique de fin) */
const GOLD_FOG = new THREE.Color(0xc89a58);
/** Sol et parois, par zone (seuil, braises, rivière, falaises, os, cristaux, royaume) : plus clairs au sol */
const FLOOR = [0x6e5a66, 0x7a4c40, 0x6e4636, 0x625a5e, 0x7c6a56, 0x5c4c72, 0x6e3440].map((c) => new THREE.Color(c));
const WALL = [0x4a3a46, 0x56322a, 0x4e2e24, 0x46404a, 0x5a4a3c, 0x3e3256, 0x4c2230].map((c) => new THREE.Color(c));
const TOP = new THREE.Color(0x160a0e);
const EMBER = new THREE.Color(0x6a1a08);
const FACE_MIX = 0.85;
/** Rayon d'éclairage de la lave, et une source toutes les LAVA_STEP cases */
const LAVA_STEP = 3;
const LIGHT_PICK = 0.25;
interface Source { x: number; y: number; z: number; r: number; c: THREE.Color; flicker: number }
/** Ce qu'un bâtiment de la base porte pour son âge : ses maillages qui s'animent (flammes, champ d'énergie, pièces qui tournent) et ses points de fumée */
interface BaseDress { kind: BaseKind; age: number; parts: BaseParts; flame: THREE.Mesh | null; field: THREE.Mesh | null; spins: { m: THREE.Mesh }[]; puffT: number; x: number; y: number; z: number }
interface Item { m: THREE.Matrix4; c: THREE.Color }

export class HellView {
  scene = new THREE.Scene();
  /** les combattants : démons, soldats du joueur, barres de vie, sélection, coups */
  units: BattleLayer;
  get fx() { return this.units.fx; }
  /** force et seuil du halo (lave, cristaux, yeux) */
  bloom: [number, number] = [0.45, 0.95];
  private uTime = { value: 0 };
  private groundGeo = new THREE.BufferGeometry();
  private content = new THREE.Group();
  private sources: Source[] = [];
  private active: Source[] = [];
  private lightTimer = 0;
  private lantern: Source = { x: 0, y: 0, z: 0, r: 8, c: new THREE.Color(1, 0.7, 0.55).multiplyScalar(0.3), flicker: 0 };
  private fog = new THREE.Fog(BG, 14, 44);
  private d = new THREE.Object3D();
  /** bâtiments : maillage debout, ruines, barre de vie */
  private houses = new Map<number, { up: THREE.Group; ruin: THREE.Mesh; down: boolean; flags: THREE.Object3D[]; rise?: number; smokeT?: number; base?: BaseDress; wall?: WallPart }>();
  /** l'âge du village (la sim, via main.ts) : les bâtiments de la base prennent la variante de leur âge sans être rebâtis */
  age = 1;
  /** les murs (palissades, portes) raccordés : leur recalcul quand la carte change, les formes déjà faites */
  private wallV = -1;
  private wallGeos = new Map<string, THREE.BufferGeometry>();
  private gateParts: ReturnType<typeof gateGeo> | null = null;
  private ghostLines = new THREE.Group();
  private ghostLineKey = '';
  /** la fumée des ruines */
  private smoke = new RuinSmoke(0x2a2228);
  private housesSeen = new Set<number>();
  private portalDisc: THREE.Mesh | null = null;
  private built = false;
  /** la base avancée : lumières de ses feux (braseros, camp, forge), où la brume recule, matériaux, fantôme de pose */
  private baseSources = new Map<number, Source>();
  private uClear = { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 0)) };
  private baseMats: { lit: THREE.Material; glow: THREE.Material; flag: THREE.Material; ruin: THREE.Material; field: THREE.Material } | null = null;
  private baseGeos = new Map<string, BaseParts>();
  private ghostAge = 0;
  private ghostMesh: THREE.Mesh | null = null;
  private ghostKind: BaseKind | null = null;
  private rangeRing: THREE.Mesh | null = null;
  /** la brume qui ferme chaque zone (de la deuxième au royaume) tant que la précédente n'est pas conquise */
  private seals: THREE.Mesh[] = [];
  /** le combat du roi (ses boules de feu, ses plaques de sol en feu) et ses effets */
  fight: KingFight | null = null;
  private kingFx: KingFx;
  /** l'effondrement du royaume (la victoire) : depuis quand (-1 : pas commencé), la lave qui monte, le prochain nuage */
  private collapseT = -1;
  private lavaRise: THREE.Mesh | null = null;
  private dustT = 0;
  /** la cinématique de fin : les gravats qui tombent dans la lave, l'onde de choc dorée (anneau, durée écoulée) qui chasse la brume rouge */
  private debris: { m: THREE.Mesh; vx: number; vy: number; vz: number; spin: number }[] = [];
  private debrisT = 0;
  private wave: THREE.Mesh | null = null;
  private waveK = 0;
  private debrisGeo: THREE.BufferGeometry | null = null;
  private debrisMat: THREE.Material | null = null;

  constructor(readonly map: HellMap, public hell: Hell) {
    this.scene.background = BG.clone();
    this.scene.fog = this.fog;
    // lumière chaude d'en bas (la lave), violette d'en haut : les reliefs se lisent sans rien de noir
    this.scene.add(new THREE.HemisphereLight(0xb08ab8, 0x4a1820, 1.05));
    const dir = new THREE.DirectionalLight(0xffc8a8, 1.7);
    dir.position.set(-0.5, 0.8, 0.4);
    this.scene.add(dir);
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const ground = new THREE.Mesh(this.groundGeo, caveLit(groundMat, 'hell-ground'));
    this.units = new BattleLayer(hell, (x, z) => this.map.groundY(x, z), (ev) => { const h = this.houses.get(ev.id); if (h) { h.up.visible = false; h.ruin.visible = true; h.down = true; } });
    this.kingFx = new KingFx((x, z) => this.map.groundY(x, z), this.units.fx);
    this.scene.add(ground, this.content, this.units.group, this.kingFx.group);
  }

  groundY(x: number, z: number) { return this.map.groundY(x, z); }

  /** Construit le décor (une fois : la carte ne change que par ses emprises) */
  build() {
    if (this.built) return;
    this.built = true;
    this.buildGround();
    this.buildPools();
    this.buildBridges();
    this.buildDecor();
    this.buildEmbers();
    this.buildMist();
    this.buildPortal();
    this.buildHouses();
    this.buildSeals();
  }

  // ---------- Relief ----------

  private buildGround() {
    const m = this.map, n = HVW * HVL, T = (HVW - 1) * (HVL - 1) * 6;
    const pos = new Float32Array(n * 3), hv = new Float32Array(n), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const op = m.vOpen, vis = m.vis;
    // contours lisses : un sommet proche du bord du dessus ou du pied d'une paroi glisse sur la ligne exacte (comme sous terre)
    for (let z = 0; z < HVL; z++)
      for (let x = 0; x < HVW; x++) {
        const i = z * HVW + x;
        let fx = x / VR, fz = z / VR, h = vis[i];
        const o = op[i];
        if (o > 0.02 && o < 0.7) {
          const xl = Math.max(0, x - 1), xr = Math.min(HVW - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(HVL - 1, z + 1);
          const gx = (op[z * HVW + xr] - op[z * HVW + xl]) / (xr - xl), gz = (op[zr * HVW + x] - op[zl * HVW + x]) / (zr - zl), g = Math.hypot(gx, gz);
          if (g > 1e-4) {
            const dTop = (ROCK_ISO - o) / g, dFoot = (FLOOR_ISO - o) / g, top = Math.abs(dTop) <= Math.abs(dFoot), d = top ? dTop : dFoot;
            if (Math.abs(d) < 0.55) {
              fx += (gx / g) * d / VR; fz += (gz / g) * d / VR;
              h = top ? HWALL + m.vBump1[i] : m.vGround[i] + m.vBump0[i];
            }
          }
        }
        pos[i * 3] = fx; pos[i * 3 + 1] = h; pos[i * 3 + 2] = fz;
        hv[i] = h;
      }
    const tmp = new THREE.Color(), wallC = new THREE.Color(), floorC = new THREE.Color(), top = new THREE.Color();
    for (let z = 0; z < HVL; z++)
      for (let x = 0; x < HVW; x++) {
        const i = z * HVW + x, h = hv[i], fx = x / VR, fz = z / VR;
        const xl = Math.max(0, x - 1), xr = Math.min(HVW - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(HVL - 1, z + 1);
        const dx = ((hv[z * HVW + xr] - hv[z * HVW + xl]) * VR) / (xr - xl), dz = ((hv[zr * HVW + x] - hv[zl * HVW + x]) * VR) / (zr - zl);
        const l = Math.hypot(dx, 1, dz);
        nor[i * 3] = -dx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -dz / l;
        let lo = h, occ = 0;
        for (let oz = -2; oz <= 2; oz++)
          for (let ox = -2; ox <= 2; ox++) {
            if (!ox && !oz) continue;
            const nh = hv[Math.min(HVL - 1, Math.max(0, z + oz)) * HVW + Math.min(HVW - 1, Math.max(0, x + ox))];
            if (Math.abs(ox) <= 1 && Math.abs(oz) <= 1) lo = Math.min(lo, nh);
            occ += Math.max(0, Math.min(nh, 1.2) - Math.max(h, 0)) / Math.hypot(ox, oz);
          }
        const fWall = smoothstep(0.25, 1.15, h), fTop = smoothstep(0.9, 1.15, lo), fRim = smoothstep(0.8, 1.05, h) * (1 - fTop);
        const fStrata = smoothstep(0.82, 1, Math.sin(h * 11 + Math.sin(fx * 0.9 + fz * 0.6) * 1.4)), fAo = 1 - Math.min(0.4, occ * 0.045) * (1 - fWall);
        // teinte de la zone, fondue sur quelques cases à ses bords
        zoneTint(fz, FLOOR, floorC); zoneTint(fz, WALL, wallC);
        floorC.multiplyScalar(1 + Math.sin(fx * 0.37 + Math.sin(fz * 0.29) * 2) * Math.sin(fz * 0.31 + fx * 0.11) * 0.06);
        top.copy(TOP).lerp(wallC, 0.15);
        tmp.copy(floorC).lerp(wallC.clone().multiplyScalar(1 - fStrata * 0.15), fWall).lerp(wallC.clone().multiplyScalar(1.25), fRim * 0.75).lerp(top, fTop);
        tmp.multiplyScalar(fAo);
        // fond des bassins et des abîmes : braises
        if (h < -0.1) tmp.lerp(EMBER, smoothstep(-0.12, -0.3, h));
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
    const fp = new Float32Array(T * 3), fn = new Float32Array(T * 3), fc = new Float32Array(T * 3);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fnv = new THREE.Vector3();
    const tri = (t: number, a: number, b: number, c: number) => {
      const jit = 0.965 + (Math.abs(Math.sin(t * 12.9898) * 43758.5453) % 1) * 0.07;
      e1.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
      e2.set(pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]);
      fnv.crossVectors(e2, e1).normalize();
      if (fnv.y < 0) fnv.negate();
      [a, b, c].forEach((v, j) => {
        const o = (t + j) * 3;
        for (let q = 0; q < 3; q++) {
          fp[o + q] = pos[v * 3 + q];
          fc[o + q] = col[v * 3 + q] * jit;
          fn[o + q] = nor[v * 3 + q] * (1 - FACE_MIX) + fnv.getComponent(q) * FACE_MIX;
        }
      });
    };
    for (let z = 0; z < HVL - 1; z++)
      for (let x = 0; x < HVW - 1; x++) {
        const a = z * HVW + x, b = a + 1, c = a + HVW, d = c + 1, t = (z * (HVW - 1) + x) * 6;
        tri(t, a, c, d);
        tri(t + 3, a, d, b);
      }
    const g = this.groundGeo;
    g.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(fn, 3));
    g.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    g.computeBoundingSphere();
  }

  /** Lave des bassins et de la rivière ; tout au fond des abîmes, une lave plus sombre ; elles éclairent les parois */
  private buildPools() {
    const m = this.map;
    for (const kind of [HPOOL_LAVA, HPOOL_CHASM]) {
      const cells = new Set<number>();
      for (let k = 0; k < HW * HL; k++) {
        if (m.pool[k] !== kind) continue;
        const x = k % HW, z = Math.floor(k / HW);
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (m.inside(x + dx, z + dz)) cells.add((z + dz) * HW + x + dx);
      }
      if (!cells.size) continue;
      const pos: number[] = [], y = kind === HPOOL_LAVA ? HLAVA_Y : HCHASM_Y;
      for (const k of cells) {
        const x = k % HW, z = Math.floor(k / HW);
        pos.push(x, y, z, x, y, z + 1, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x + 1, y, z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mesh = new THREE.Mesh(g, lavaMaterial(this.uTime, kind === HPOOL_CHASM ? 0.62 : 0));
      this.content.add(mesh);
      const step = kind === HPOOL_LAVA ? LAVA_STEP : 4;
      for (const k of cells) {
        const x = k % HW, z = Math.floor(k / HW);
        if (m.pool[k] === kind && x % step === 0 && z % step === 0)
          this.sources.push({ x: x + 0.5, y: y + (kind === HPOOL_LAVA ? 0.6 : 1.4), z: z + 0.5, r: kind === HPOOL_LAVA ? 4 : 4.6, c: new THREE.Color(1, 0.38, 0.1).multiplyScalar(kind === HPOOL_LAVA ? 1.35 : 1.1), flicker: 0.15 });
      }
    }
  }

  /** Ponts de pierre noire au-dessus de la lave : dalles, et bornes à flamme sur les bords */
  private buildBridges() {
    const m = this.map, slabs: Item[] = [], posts: Item[] = [], flames: Item[] = [];
    const stone = new THREE.Color(0x4a3a40), post = new THREE.Color(0x2e2228);
    for (let k = 0; k < HW * HL; k++) {
      if (!m.bridge[k]) continue;
      const x = k % HW, z = Math.floor(k / HW), j = hash2(x, z, 70);
      slabs.push(this.item(x + 0.5, 0.06, z + 0.5, 0, 1.02, 0.14, 1.02, stone.clone().multiplyScalar(0.9 + j * 0.2)));
      // bornes : sur les côtés qui donnent sur la lave
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, nk = nz * HW + nx;
        if (!m.inside(nx, nz) || m.bridge[nk] || !m.pool[nk]) continue;
        if ((x + z) % 2) continue;
        posts.push(this.item(x + 0.5 + dx * 0.44, 0.2, z + 0.5 + dz * 0.44, 0, 0.12, 0.42, 0.12, post));
        if ((x * 7 + z) % 4 === 0) {
          flames.push(this.item(x + 0.5 + dx * 0.44, 0.48, z + 0.5 + dz * 0.44, 0, 0.09, 0.16, 0.09, new THREE.Color(1, 0.6, 0.2)));
          this.sources.push({ x: x + 0.5 + dx * 0.44, y: 0.7, z: z + 0.5 + dz * 0.44, r: 2.6, c: new THREE.Color(1, 0.55, 0.25).multiplyScalar(1.1), flicker: 0.3 });
        }
      }
    }
    const box = paint(new THREE.BoxGeometry(1, 1, 1), 0xffffff);
    this.instanced(box, caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), 'hell-bridge'), slabs);
    this.instanced(box, caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), 'hell-bridge'), posts);
    this.instanced(paint(new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0), 0xffffff), new THREE.MeshBasicMaterial({ vertexColors: true }), flames);
  }

  /**
   * Décor, par zone : stalagmites au pied des parois, pics sur leur crête et stalactites qui en pendent ; fissures de braise
   * au sol ; os épars et côtes de géants en arche dans la gorge ; amas de cristaux (forêt de cristaux, seuil) ; aiguilles
   * d'obsidienne au royaume ; rochers
   */
  private buildDecor() {
    const m = this.map;
    const stal: Item[] = [], spikes: Item[] = [], hang: Item[] = [], cracks: Item[] = [], bones: Item[] = [], ribs: Item[] = [], crystals: Item[] = [], spires: Item[] = [], rocks: Item[] = [];
    const sites = m.zones.flatMap((z) => z.sites);
    const nearSite = (x: number, z: number, pad: number) => sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + pad);
    const CRYST = [0xc77dff, 0xff5fc8, 0x7fdcff, 0xffa040].map((c) => new THREE.Color(c));
    let lights = 0;
    for (let k = 0; k < HW * HL; k++) {
      const x = k % HW, z = Math.floor(k / HW), zi = m.zone[k], r = (s: number) => hash2(x, z, s);
      const cx = x + 0.3 + r(1) * 0.4, cz = z + 0.3 + r(2) * 0.4;
      if (m.open[k] && !m.pool[k] && !m.block[k]) {
        const wd = m.wallDist[k], y = m.heightAt(cx, cz);
        if (y > 0.4 || nearSite(cx, cz, 1.2) || Math.hypot(cx - m.portal[0], cz - m.portal[1]) < 3) continue;
        // pas de décor sur la faille même : le chemin reste dégagé
        const onPath = Math.abs(cx - m.spine[z] - 0.5) < 1.6;
        if (wd === 1 && !onPath && r(3) < 0.22) {
          for (let i = 0, n = 1 + Math.floor(r(4) * 3); i < n; i++) {
            const h = 0.35 + r(5 + i) * 0.7;
            stal.push(this.item(cx + (r(8 + i) - 0.5) * 0.5, y - 0.02, cz + (r(11 + i) - 0.5) * 0.5, r(14 + i) * 6, 0.12 + r(17 + i) * 0.08, h, 0.12 + r(17 + i) * 0.08, new THREE.Color(WALL[zi]).multiplyScalar(1.1 + r(20) * 0.3)));
          }
        }
        if ((zi === Z_EMBER || zi === Z_KINGDOM || zi === Z_PORTAL) && r(21) < 0.05)
          cracks.push(this.item(cx, y + 0.012, cz, r(22) * 6, 0.025 + r(23) * 0.02, 0.02, 0.22 + r(24) * 0.3, new THREE.Color(1, 0.3 + r(25) * 0.15, 0.06)));
        if (r(26) < (zi === Z_BONES ? 0.12 : 0.012) && !onPath) {
          bones.push(this.item(cx, y + 0.03, cz, r(27) * 6, 0.07, 0.07, 0.4 + r(28) * 0.3, new THREE.Color(0xeee2c8)));
        }
        if ((zi === Z_CRYSTAL ? r(29) < 0.26 && wd <= 2 : zi === Z_PORTAL ? r(29) < 0.08 && wd <= 2 : r(29) < 0.012 && wd === 1) && !onPath) {
          const base = CRYST[zi === Z_CRYSTAL ? Math.floor(r(30) * 3) : zi === Z_PORTAL ? 0 : 3];
          for (let i = 0, n = 2 + Math.floor(r(31) * 3); i < n; i++) {
            const s = 0.12 + r(32 + i) * 0.14, h = s * (2.5 + r(36 + i) * 2.5);
            this.d.position.set(cx + (r(40 + i) - 0.5) * 0.5, y, cz + (r(44 + i) - 0.5) * 0.5);
            this.d.rotation.set((r(48 + i) - 0.5) * 0.7, r(52 + i) * 6, (r(56 + i) - 0.5) * 0.7);
            this.d.scale.set(s, h, s);
            this.d.updateMatrix();
            crystals.push({ m: this.d.matrix.clone(), c: base.clone().offsetHSL((r(60 + i) - 0.5) * 0.06, 0, (r(64) - 0.5) * 0.1) });
          }
          if (lights++ % 2 === 0) this.sources.push({ x: cx, y: y + 0.6, z: cz, r: 3.4, c: base.clone().multiplyScalar(1.4), flicker: 0 });
        }
        if (zi === Z_KINGDOM && wd >= 1 && !onPath && r(68) < 0.05)
          spires.push(this.item(cx, y - 0.05, cz, r(69) * 6, 0.22 + r(70) * 0.15, 1.2 + r(71) * 1.6, 0.22 + r(70) * 0.15, new THREE.Color(0x2a1e36)));
        if (!onPath && wd <= 2 && r(72) < 0.03)
          rocks.push(this.item(cx, y, cz, r(73) * 6, 0.25 + r(74) * 0.3, 0.18 + r(75) * 0.2, 0.25 + r(76) * 0.3, new THREE.Color(WALL[zi]).multiplyScalar(1.2)));
      } else if (!m.open[k]) {
        // crête des parois : pics dressés, et stalactites qui pendent au bord, au-dessus du sol
        let edge = -1;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.inside(x + dx, z + dz) && m.open[(z + dz) * HW + x + dx] && !m.pool[(z + dz) * HW + x + dx]) edge = dx * 10 + dz;
        if (edge === -1) continue;
        const ex = Math.round(edge / 10), ez = edge - ex * 10;
        if (r(80) < 0.1) spikes.push(this.item(x + 0.5 - ex * 0.3, HWALL - 0.05, z + 0.5 - ez * 0.3, r(81) * 6, 0.12 + r(82) * 0.1, 0.4 + r(83) * 0.6, 0.12 + r(82) * 0.1, new THREE.Color(WALL[zi]).multiplyScalar(0.8)));
        if (r(84) < 0.18) hang.push(this.item(x + 0.5 + ex * 0.35, HWALL - 0.08, z + 0.5 + ez * 0.35, r(85) * 6, 0.07 + r(86) * 0.05, 0.35 + r(87) * 0.45, 0.07 + r(86) * 0.05, new THREE.Color(WALL[zi]).multiplyScalar(1.15)));
      }
    }
    // côtes de géants en arche au-dessus de la gorge des os
    const zb = HELL_ZONES[Z_BONES];
    for (let z = zb.z0 + 3; z < HELL_ZONES[Z_BONES + 1].z0 - 10; z += 4) {
      const sx = m.spine[z] + 0.5;
      this.d.position.set(sx, 0.05, z + 0.5);
      this.d.rotation.set(0, (hash2(z, 3, 90) - 0.5) * 0.4, (hash2(z, 4, 90) - 0.5) * 0.2);
      this.d.scale.set(1.9, 2.2, 1.6);
      this.d.updateMatrix();
      ribs.push({ m: this.d.matrix.clone(), c: new THREE.Color(0xf2e8d2) });
    }
    const lit = (key: string) => caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), key);
    this.instanced(stalagGeo(), lit('hell-stalag'), stal);
    this.instanced(stalagGeo(), lit('hell-stalag'), spikes);
    this.instanced(stalagGeo().rotateX(Math.PI), lit('hell-stalag'), hang);
    this.instanced(paint(new THREE.BoxGeometry(1, 1, 1), 0xffffff), new THREE.MeshBasicMaterial({ vertexColors: true }), cracks);
    this.instanced(boneGeo(), lit('hell-bone'), bones);
    this.instanced(ribGeo(), lit('hell-bone'), ribs);
    this.instanced(paint(new THREE.OctahedronGeometry(0.5, 0).scale(1, 1, 1).translate(0, 0.45, 0), 0xffffff), glowMaterial(0.55, 'hell-crystal', { transparent: true, opacity: 0.92 }), crystals);
    this.instanced(paint(new THREE.ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0), 0xffffff, (y) => 0.8 + y * 0.6), lit('hell-spire'), spires);
    this.instanced(paint(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.4, 0), 0xffffff, (y) => 0.75 + y * 0.35), lit('hell-rock'), rocks);
  }

  /** Braises qui montent de la lave et des fissures, en tourbillonnant (animées dans le shader : rien à refaire par image) */
  private buildEmbers() {
    const m = this.map, pos: number[] = [], seed: number[] = [];
    let i = 0;
    for (let k = 0; k < HW * HL; k++) {
      const x = k % HW, z = Math.floor(k / HW);
      const lava = m.pool[k] === HPOOL_LAVA, chasm = m.pool[k] === HPOOL_CHASM;
      const p = lava ? 0.5 : chasm ? 0.25 : m.open[k] && (m.zone[k] === Z_EMBER || m.zone[k] === Z_KINGDOM) ? 0.04 : m.open[k] ? 0.012 : 0;
      if (hash2(x, z, 300) > p) continue;
      pos.push(x + hash2(x, z, 301), chasm ? HCHASM_Y : lava ? HLAVA_Y : 0.1, z + hash2(x, z, 302));
      seed.push(hash2(x, z, 303), 0.6 + hash2(x, z, 304) * 0.8, chasm ? 3.2 : 2.2);
      if (++i > 4000) break;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 3));
    const pts = new THREE.Points(g, emberMaterial(this.uTime));
    pts.frustumCulled = false;
    this.content.add(pts);
  }

  /** Brume rouge qui traîne au ras du sol et monte des abîmes */
  private buildMist() {
    const g = new THREE.PlaneGeometry(HW + 20, HL + 20, 1, 1).rotateX(-Math.PI / 2).translate(HW / 2, 0.75, HL / 2);
    const mesh = new THREE.Mesh(g, mistMaterial(this.uTime, this.uClear));
    mesh.renderOrder = 3;
    this.content.add(mesh);
  }

  /** Le portail de retour : arche de pierre sombre, vortex rouge et violet, deux braseros */
  private buildPortal() {
    const [px, pz] = this.map.portal, y = this.map.groundY(px, pz);
    const arch = merge([
      paint(new THREE.BoxGeometry(0.45, 2.2, 0.5).translate(-1.15, 1.1, 0), 0x3a2e3a),
      paint(new THREE.BoxGeometry(0.45, 2.2, 0.5).translate(1.15, 1.1, 0), 0x3a2e3a),
      paint(new THREE.TorusGeometry(1.15, 0.26, 5, 12, Math.PI).translate(0, 2.2, 0), 0x46384a),
      paint(new THREE.ConeGeometry(0.12, 0.5, 5).translate(-0.75, 3.45, 0), 0xe8d8c0),
      paint(new THREE.ConeGeometry(0.12, 0.5, 5).translate(0.75, 3.45, 0), 0xe8d8c0),
      paint(new THREE.BoxGeometry(3.2, 0.2, 1).translate(0, 0.1, 0), 0x2e2430),
    ])!;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(arch, caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), 'hell-house')));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 28).scale(0.85, 1.55, 1).translate(0, 1.75, 0), vortexMaterial(this.uTime));
    g.add(disc);
    this.portalDisc = disc;
    for (const sx of [-1.8, 1.8]) {
      g.add(new THREE.Mesh(paint(new THREE.CylinderGeometry(0.22, 0.14, 0.6, 6).translate(sx, 0.3, 0.5), 0x2a2026), caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }), 'hell-house')));
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 6).translate(sx, 0.8, 0.5), flameMaterial(this.uTime));
      g.add(f);
      this.sources.push({ x: px + sx, y: y + 1, z: pz + 0.5, r: 4, c: new THREE.Color(1, 0.5, 0.2).multiplyScalar(1.6), flicker: 0.3 });
    }
    g.position.set(px, y, pz);
    this.content.add(g);
    this.sources.push({ x: px, y: y + 1.8, z: pz + 0.8, r: 6, c: new THREE.Color(0.9, 0.3, 1).multiplyScalar(1.8), flicker: 0.1 });
  }

  /** Point du portail sous le curseur ? */
  portalAt(x: number, z: number) { return Math.hypot(x - this.map.portal[0], z - this.map.portal[1]) < 2; }

  // ---------- Bâtiments ----------

  private buildHouses() {
    const lit = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), 'hell-house');
    const glow = glowMaterial(1.1, 'hell-house-glow', { roughness: 0.6 });
    const ruinMat = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 'hell-ruin');
    for (const b of this.hell.buildings.values()) {
      if (b.side !== 'hell') continue;
      const [solid, shine, flagY] = houseGeo(b.kind as HellSiteKind);
      const up = new THREE.Group();
      up.add(new THREE.Mesh(solid, lit), new THREE.Mesh(shine, glow));
      // étendards violets qui flottent
      const flags: THREE.Object3D[] = [];
      for (const [fx, fy, fz] of flagY) {
        const f = new THREE.Mesh(paint(new THREE.PlaneGeometry(0.42, 0.3, 3, 1).translate(0.21, 0, 0), 0x8a2ab8), caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), 'hell-flag'));
        f.position.set(fx, fy, fz);
        up.add(f);
        flags.push(f);
      }
      const y = this.map.groundY(b.site.x, b.site.z);
      up.position.set(b.site.x, y, b.site.z);
      // face au portail (au nord), quelle que soit la place
      up.rotation.y = Math.PI;
      const ruin = new THREE.Mesh(ruinGeo(b.site.r, b.id), ruinMat);
      ruin.position.copy(up.position);
      ruin.visible = false;
      this.content.add(up, ruin);
      this.houses.set(b.id, { up, ruin, down: false, flags });
      const h = b.kind === 'kingdom' ? 5.4 : b.kind === 'fortress' || b.kind === 'spire' ? 2.6 : 1.4;
      this.sources.push({ x: b.site.x, y: y + h, z: b.site.z - b.site.r - 0.3, r: b.kind === 'kingdom' ? 9 : 4.5, c: new THREE.Color(1, 0.45, 0.2).multiplyScalar(b.kind === 'kingdom' ? 2 : 1.4), flicker: 0.25 });
    }
  }

  // ---------- Base avancée du joueur ----------

  /**
   * La brume qui ferme une zone : un rideau rouge et violet qui tourbillonne en travers de la faille, à l'entrée de chaque
   * zone (de la deuxième au royaume) ; il se lève quand la zone d'avant est conquise
   */
  private buildSeals() {
    for (let i = 2; i < HELL_ZONES.length; i++) {
      const z = HELL_ZONES[i].z0;
      // de paroi à paroi, sur la largeur ouverte de la rangée
      let x0 = HW, x1 = 0;
      for (let x = 0; x < HW; x++) if (this.map.open[z * HW + x] || this.map.open[(z - 1) * HW + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); }
      if (x1 <= x0) { this.seals.push(new THREE.Mesh()); continue; }
      const g = new THREE.PlaneGeometry(x1 - x0 + 2, HWALL + 0.6, 1, 1).translate((x0 + x1) / 2, (HWALL + 0.6) / 2 - 0.2, z);
      const m = new THREE.Mesh(g, sealMaterial(this.uTime));
      m.renderOrder = 4;
      m.visible = false;
      this.content.add(m);
      this.seals.push(m);
    }
  }

  private mats() {
    return (this.baseMats ??= {
      lit: caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), 'hell-base'),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      flag: caveLit(new THREE.MeshStandardMaterial({ color: BASE_FLAG, side: THREE.DoubleSide, roughness: 0.9 }), 'hell-base-flag'),
      ruin: caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 'hell-ruin'),
      field: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    });
  }
  /** Un mur (palissade ou porte) : ses pièces, dont la forme est donnée ensuite par ses voisins */
  private makeWall(kind: 'palisade' | 'gate', up: THREE.Group, mat: THREE.Material): WallPart {
    if (kind === 'palisade') {
      const mesh = new THREE.Mesh(this.wallShape('palisade', 0), mat);
      up.add(mesh);
      return { kind, mask: -1, mesh, open: 0 };
    }
    const parts = (this.gateParts ??= gateGeo());
    const rig = new THREE.Group(), pivot = new THREE.Group(), mesh = new THREE.Mesh(parts.solid, mat);
    pivot.position.x = GATE_HINGE;
    pivot.add(new THREE.Mesh(parts.leaf, mat));
    rig.add(mesh, pivot);
    up.add(rig);
    return { kind, mask: -1, mesh, rig, pivot, open: 0 };
  }

  /** La forme d'un mur selon ses côtés reliés (gardée) ; une porte fermée, tournée selon l'axe du mur */
  private wallShape(kind: 'palisade' | 'gate', mask: number) {
    const key = kind === 'palisade' ? `p${mask}` : `g${gateAlongX(mask) ? 'x' : 'z'}`;
    let g = this.wallGeos.get(key);
    if (!g) {
      if (kind === 'palisade') g = palisadeGeo(mask);
      else {
        const parts = (this.gateParts ??= gateGeo());
        g = merge([parts.solid, parts.leaf.clone().translate(GATE_HINGE, 0, 0)]);
        if (!gateAlongX(mask)) g.rotateY(-Math.PI / 2);
      }
      this.wallGeos.set(key, g);
    }
    return g;
  }

  /** Côtés reliés d'une case de mur, selon les cases voisines qui en portent un (`has`) */
  private wallMask(cx: number, cz: number, has: (x: number, z: number) => boolean) {
    return (has(cx, cz - 1) ? WALL_N : 0) | (has(cx + 1, cz) ? WALL_E : 0) | (has(cx, cz + 1) ? WALL_S : 0) | (has(cx - 1, cz) ? WALL_W : 0);
  }
  private wallCells() {
    const cells = new Set<string>();
    for (const b of this.hell.buildings.values()) if (b.side === 'player' && !b.down && (b.kind === 'palisade' || b.kind === 'gate')) cells.add(`${Math.floor(b.site.x)},${Math.floor(b.site.z)}`);
    return cells;
  }

  /** Les murs se raccordent : quand la carte change (un mur posé, abattu, remplacé par une porte), leurs formes se refont */
  private refreshWalls() {
    if (this.wallV === this.map.version) return;
    this.wallV = this.map.version;
    const cells = this.wallCells(), has = (x: number, z: number) => cells.has(`${x},${z}`);
    for (const [id, h] of this.houses) {
      const w = h.wall, b = this.hell.buildings.get(id);
      if (!w || !b) continue;
      const mask = this.wallMask(Math.floor(b.site.x), Math.floor(b.site.z), has);
      if (mask === w.mask) continue;
      w.mask = mask;
      if (w.kind === 'palisade') w.mesh.geometry = this.wallShape('palisade', mask);
      else if (w.rig) w.rig.rotation.y = gateAlongX(mask) ? 0 : -Math.PI / 2;
    }
  }

  /** Les portes s'ouvrent devant les nôtres qui s'approchent, et se referment derrière */
  private stepGates(dt: number) {
    let friends: HellUnit[] | null = null;
    for (const [id, h] of this.houses) {
      const w = h.wall, b = this.hell.buildings.get(id);
      if (!w?.pivot || !b || h.down) continue;
      friends ??= this.hell.alive('player');
      const near = friends.some((u) => Math.hypot(u.x - b.site.x, u.z - b.site.z) < 1.5);
      w.open += ((near ? 1 : 0) - w.open) * Math.min(1, dt * 6);
      w.pivot.rotation.y = -w.open * GATE_OPEN;
    }
  }

  /** Aperçu d'une ligne de murs à poser : chaque case raccordée à sa voisine, verte (posable) ou rouge */
  private showLine(kind: 'palisade' | 'gate', line: { x: number; z: number; ok: boolean }[]) {
    if (!this.ghostLines.parent) { this.ghostLines.renderOrder = 8; this.content.add(this.ghostLines); }
    const key = `${kind}|${this.map.version}|${line.map((c) => `${Math.floor(c.x)},${Math.floor(c.z)}${c.ok ? 1 : 0}`).join(';')}`;
    this.ghostLines.visible = true;
    if (key === this.ghostLineKey) return;
    this.ghostLineKey = key;
    for (const c of [...this.ghostLines.children]) this.ghostLines.remove(c);
    const mats = (this.ghostMats ??= [0x7dff8a, 0xff5a4a].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, fog: false })));
    const cells = this.wallCells();
    for (const c of line) cells.add(`${Math.floor(c.x)},${Math.floor(c.z)}`);
    const has = (x: number, z: number) => cells.has(`${x},${z}`);
    for (const c of line) {
      const cx = Math.floor(c.x), cz = Math.floor(c.z), m = new THREE.Mesh(this.wallShape(kind, this.wallMask(cx, cz, has)), mats[c.ok ? 0 : 1]);
      m.position.set(cx + 0.5, this.map.groundY(cx + 0.5, cz + 0.5) + 0.02, cz + 0.5);
      m.renderOrder = 8;
      this.ghostLines.add(m);
    }
  }
  private ghostMats: THREE.MeshBasicMaterial[] | null = null;

  /** Les pièces d'un bâtiment de la base pour un âge (les murs n'ont pas de variantes d'âge : forme historique) */
  private geoOf(kind: BaseKind, age = baseAgeOf(this.age)): BaseParts {
    const key = `${kind}:${age}`;
    let g = this.baseGeos.get(key);
    if (!g) {
      g = baseGeoAged(kind, age) ?? (() => { const o = baseGeo(kind); return { solid: o.solid, shine: o.shine, flame: null, field: null, spin: [], flameY: 0, fire: o.fire, flag: o.flag, smoke: [], sparks: [] } as BaseParts; })();
      this.baseGeos.set(key, g);
    }
    return g;
  }

  /** Le tissu d'un drapeau de la base (les bâtiments sont grands : drapeaux plus larges qu'avant), un par taille */
  private baseFlagGeo(k: number) {
    const key = `flag${k}`;
    let g = this.flagGeos.get(key);
    if (!g) this.flagGeos.set(key, g = new THREE.PlaneGeometry(0.52 * k, 0.34 * k, 4, 1).translate(0.26 * k, 0, 0));
    return g;
  }
  private flagGeos = new Map<string, THREE.BufferGeometry>();

  /** Habille (ou rhabille, quand le village change d'âge) un bâtiment de la base de la variante de l'âge courant */
  private dressBase(id: number, kind: BaseKind, x: number, y: number, z: number) {
    const h = this.houses.get(id);
    const age = baseAgeOf(this.age);
    if (!h || h.base?.age === age) return;
    const mats = this.mats(), g = this.geoOf(kind, age), upgrade = !!h.base;
    for (const c of [...h.up.children]) h.up.remove(c);
    h.flags.length = 0;
    h.up.add(new THREE.Mesh(g.solid, mats.lit));
    if (g.shine) h.up.add(new THREE.Mesh(g.shine, mats.glow));
    const dress: BaseDress = { kind, age, parts: g, flame: null, field: null, spins: [], puffT: Math.random(), x, y, z };
    if (g.flame) { dress.flame = new THREE.Mesh(g.flame, mats.glow); h.up.add(dress.flame); }
    if (g.field) { dress.field = new THREE.Mesh(g.field, mats.field); dress.field.renderOrder = 6; h.up.add(dress.field); }
    for (const s of g.spin) { const m = new THREE.Mesh(s.geo, mats.glow); m.position.set(s.x, 0, s.z); h.up.add(m); dress.spins.push({ m }); }
    // le drapeau de faction (bleu) au mât, et les oriflammes des autres mâts (même maillage, un peu plus petits)
    for (const [i, p] of [g.flag, ...(g.flags ?? [])].entries()) {
      if (!p) continue;
      const f = new THREE.Mesh(this.baseFlagGeo(i === 0 ? 1 : 0.8), mats.flag);
      f.position.set(...p);
      h.up.add(f);
      h.flags.push(f);
    }
    h.base = dress;
    // la lumière du feu suit la variante (un âge sans feu n'éclaire plus)
    if (g.fire) this.baseSources.set(id, { x, y: y + g.fire + 0.5, z, r: kind === 'brazier' ? 5.5 : 3.6, c: new THREE.Color(1, 0.62, 0.3).multiplyScalar(kind === 'brazier' ? 1.7 : 1.2), flicker: 0.3 });
    else this.baseSources.delete(id);
    this.lightTimer = 0;
    // un bâtiment qui monte de niveau : nuage de poussière, il « sort de terre » comme au relèvement
    if (upgrade) { h.rise = 0; for (let i = 0; i < 6; i++) this.units.fx.puff(x + Math.sin(i * 1.1) * 0.6, y + 0.2, z + Math.cos(i * 1.1) * 0.6, 6); }
  }

  /** Les bâtiments de la base : posés, abattus (ruines), ôtés ; leurs feux éclairent, les braseros chassent la brume */
  private syncBase() {
    const mats = this.mats();
    for (const b of this.hell.buildings.values()) {
      if (b.side !== 'player' || !(b.kind in BASE_DEFS) || this.houses.has(b.id)) continue;
      const kind = b.kind as BaseKind;
      const up = new THREE.Group();
      // (palissade et porte : leur forme suit leurs voisins, voir `refreshWalls` ; les autres, habillés selon l'âge)
      const wall = kind === 'palisade' || kind === 'gate' ? this.makeWall(kind, up, mats.lit) : undefined;
      const y = this.map.groundY(b.site.x, b.site.z);
      up.position.set(b.site.x, y, b.site.z);
      // face au portail ; la palissade suit la faille en travers
      up.rotation.y = wall ? 0 : (hash2(b.site.x, b.site.z, 5) - 0.5) * 0.3;
      const ruin = new THREE.Mesh(ruinGeo(Math.max(0.5, b.site.r), b.id), mats.ruin);
      ruin.position.copy(up.position);
      ruin.scale.setScalar(0.7);
      ruin.visible = false;
      this.content.add(up, ruin);
      this.houses.set(b.id, { up, ruin, down: false, flags: [], wall });
      if (wall) this.wallV = -1;
      else this.dressBase(b.id, kind, b.site.x, y, b.site.z);
    }
    // le village a changé d'âge : les bâtiments déjà posés prennent la variante d'après
    for (const [id, h] of this.houses) {
      const b = this.hell.buildings.get(id);
      if (b && b.side === 'player' && b.kind in BASE_DEFS && h.base && h.base.age !== baseAgeOf(this.age)) this.dressBase(id, h.base.kind, h.base.x, h.base.y, h.base.z);
    }
    // ôtés de la bataille (une ruine remplacée, une partie reprise)
    for (const [id, h] of this.houses) {
      if (this.hell.buildings.has(id)) continue;
      this.content.remove(h.up, h.ruin);
      this.houses.delete(id);
      this.smoke.stop(id);
      this.baseSources.delete(id);
    }
    this.refreshWalls();
    // la brume recule autour des braseros debout (les plus proches de la vue)
    const braziers = [...this.hell.buildings.values()].filter((b) => b.kind === 'brazier' && !b.down);
    this.uClear.value.forEach((v, i) => { const b = braziers[i]; v.set(b ? b.site.x : 0, b ? b.site.z : 0, b ? 4.5 : 0); });
  }

  /**
   * Le fantôme d'un bâtiment à poser, sous le curseur (vert : on peut ; rouge : non), et le cercle où la base peut s'étendre
   * autour de son camp ; `kind` null : rien
   */
  ghost(kind: BaseKind | null, x = 0, z = 0, ok = false, camp: [number, number] | null = null, line?: { x: number; z: number; ok: boolean }[]) {
    // un mur (palissade, porte) : une ligne de cases raccordées plutôt qu'un seul fantôme
    const wallLine = !!kind && !!line?.length && (kind === 'palisade' || kind === 'gate');
    if (wallLine) this.showLine(kind as 'palisade' | 'gate', line!);
    else if (this.ghostLines.visible) { this.ghostLines.visible = false; this.ghostLineKey = ''; }
    if (wallLine) kind = null;
    if (kind !== this.ghostKind || (kind && this.ghostAge !== baseAgeOf(this.age))) {
      this.ghostAge = baseAgeOf(this.age);
      if (this.ghostMesh) { this.content.remove(this.ghostMesh); this.ghostMesh = null; }
      this.ghostKind = kind;
      if (kind) {
        const g = this.geoOf(kind), parts = g.shine ? merge([g.solid, g.shine]) : g.solid;
        this.ghostMesh = new THREE.Mesh(parts, new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
        this.ghostMesh.renderOrder = 8;
        this.content.add(this.ghostMesh);
      }
    }
    if (!this.rangeRing) {
      this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(BASE_R - 0.08, BASE_R + 0.08, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.45, depthWrite: false, fog: false }));
      this.rangeRing.renderOrder = 8;
      this.content.add(this.rangeRing);
    }
    this.rangeRing.visible = (!!kind || wallLine) && !!camp;
    if (camp) this.rangeRing.position.set(camp[0], this.map.groundY(camp[0], camp[1]) + 0.06, camp[1]);
    const m = this.ghostMesh;
    if (!m || !kind) return;
    const cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    m.position.set(cx, this.map.groundY(cx, cz) + 0.02, cz);
    m.rotation.y = Math.PI;
    (m.material as THREE.MeshBasicMaterial).color.set(ok ? 0x7dff8a : 0xff5a4a);
  }

  // ---------- Image ----------

  /** Point du relief sous un rayon */
  pick(ray: THREE.Ray): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    let prev = 0;
    for (let t = 0; t < 200; t += 0.08) {
      ray.at(t, p);
      if (p.x < 0 || p.z < 0 || p.x > HW || p.z > HL) { if (t > 5 && prev) break; continue; }
      prev = t;
      if (p.y <= this.map.heightAt(p.x, p.z)) return p;
    }
    return null;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number, events: HellEvent[] = []) {
    this.build();
    this.syncBase();
    this.uTime.value += dt;
    const t = this.uTime.value;
    // la brume ferme les zones d'après la dernière ouverte
    const front = this.hell.frontier;
    this.seals.forEach((m, i) => { m.visible = i + 2 > front; });
    this.fog.near = dist * 1.4 * (1 + this.waveK * 0.8);
    this.fog.far = (dist * 3 + 14) * (1 + this.waveK * 1.2);
    Object.assign(this.lantern, { x: target.x, y: this.groundY(target.x, target.z) + 1.6, z: target.z });
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = LIGHT_PICK;
      const dd = (s: Source) => Math.hypot(s.x - target.x, s.z - target.z) - s.r;
      const all = this.baseSources.size ? [...this.sources, ...[...this.baseSources].filter(([id]) => !this.hell.buildings.get(id)?.down).map(([, s]) => s)] : this.sources;
      this.active = [this.lantern, ...all.filter((s) => dd(s) < dist * 1.3).sort((a, b) => dd(a) - dd(b)).slice(0, MAX_CAVE_LIGHTS - 1)];
    }
    this.active.forEach((s, i) => {
      caveLights.uL.value[i].set(s.x, s.y, s.z, s.r);
      const f = s.flicker ? 1 + Math.sin(t * 13 + s.x * 7) * s.flicker * 0.5 + Math.sin(t * 7.3 + s.z * 5) * s.flicker * 0.5 : 1;
      caveLights.uLC.value[i].set(s.c.r * f, s.c.g * f, s.c.b * f);
    });
    caveLights.uLN.value = this.active.length;
    // les bâtiments : étendards qui flottent ; ruines quand ils tombent (une partie reprise d'une sauvegarde aussi)
    if (!this.smoke.group.parent) this.content.add(this.smoke.group);
    for (const [id, h] of this.houses) {
      const b = this.hell.buildings.get(id);
      // abattu : ses ruines fument (celles de la base du joueur, et les forteresses tant que dure la bataille)
      if (b?.down && !h.down) { h.down = true; h.up.visible = false; h.ruin.visible = true; this.lightTimer = 0; h.smokeT = 0; if (b.zone !== Z_KINGDOM && this.housesSeen.has(id)) this.smoke.start(id, b.site.x, h.ruin.position.y, b.site.z, Math.max(0.6, b.site.r * 0.7)); }
      // relevé (une forteresse, la zone reperdue ; un bâtiment de la base rebâti) : il resurgit
      else if (b && !b.down && h.down) { h.down = false; h.up.visible = true; h.ruin.visible = false; h.rise = 0; this.smoke.stop(id); for (let i = 0; i < 5; i++) this.units.fx.puff(b.site.x + Math.sin(i * 1.3) * b.site.r, h.up.position.y + 0.2, b.site.z + Math.cos(i * 1.3) * b.site.r, 6); }
      if (h.rise !== undefined) {
        h.rise = Math.min(1, h.rise + dt / 0.6);
        const k = h.rise, s = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
        h.up.scale.set(1, Math.max(0.02, s), 1);
        if (k >= 1) { h.up.scale.set(1, 1, 1); h.rise = undefined; }
      }
      // les ruines qui ont fini de fumer (une fois la zone tenue, la fumée s'éteint au bout d'un moment)
      if (h.down && this.smoke.has(id) && (h.smokeT = (h.smokeT ?? 0) + dt) > 90) this.smoke.stop(id);
      if (h.up.visible) h.flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 2.3 + i + id) * 0.35; });
      if (h.base && h.up.visible && !h.down) this.animBase(h.base, h.up.rotation.y, id, dt, t, Math.hypot(h.base.x - target.x, h.base.z - target.z) < dist * 1.6 + 6);
      // (déjà vu debout : sa chute fumera ; une ruine trouvée en arrivant, non)
      if (!h.down) this.housesSeen.add(id);
    }
    this.stepGates(dt);
    this.smoke.update(dt);
    if (this.portalDisc) this.portalDisc.rotation.z = 0;
    this.kingFx.update(dt, this.fight, events);
    this.stepCollapse(dt);
    this.units.update(dt, camera, events);
  }

  /** Les détails animés d'un bâtiment de la base : flammes qui vacillent, champs d'énergie, radars et hologrammes qui tournent, fumée et étincelles (seulement près de la vue) */
  private animBase(d: BaseDress, yaw: number, id: number, dt: number, t: number, near: boolean) {
    const p = d.parts;
    if (d.flame) {
      const s = 1 + Math.sin(t * 11 + id) * 0.18 + Math.sin(t * 17.3 + id * 2) * 0.12;
      d.flame.scale.set(1 - (s - 1) * 0.4, s, 1 - (s - 1) * 0.4);
      d.flame.position.y = p.flameY * (1 - s);
    }
    if (d.field) { d.field.rotation.y = t * 0.15; d.field.scale.setScalar(1 + Math.sin(t * 1.7 + id) * 0.015); }
    d.spins.forEach((s, i) => { s.m.rotation.y = t * (0.9 + i * 0.35) * (i % 2 ? -1 : 1); });
    if (!near || (!p.smoke.length && !p.sparks.length)) return;
    d.puffT -= dt;
    if (d.puffT > 0) return;
    d.puffT = 0.16 + Math.random() * 0.2;
    const co = Math.cos(yaw), si = Math.sin(yaw), fx = this.units.fx;
    const at = (v: [number, number, number]): [number, number, number] => [d.x + v[0] * co + v[2] * si, d.y + v[1], d.z - v[0] * si + v[2] * co];
    const col = d.age === 1 ? 0x5a4a48 : d.age === 2 ? 0x4a4048 : d.age === 3 ? 0x2c2a2e : d.age === 4 ? 0x6a6a70 : 0x9ad0e8;
    for (const v of p.smoke) { const w = at(v); fx.plume(w[0], w[1], w[2], col); }
    for (const v of p.sparks) if (Math.random() < 0.55) { const w = at(v); fx.ember(w[0], w[1], w[2], d.age === 5 ? 0x70e8ff : 0xffb040); }
  }

  /** Le royaume s'effondre (la cinématique de la victoire) : ses ruines s'enfoncent, la lave monte, poussière et jets de feu */
  startCollapse() { if (this.collapseT < 0) { this.collapseT = 0; this.lightTimer = 0; } }

  private stepCollapse(dt: number) {
    // un royaume déjà tombé (une partie reprise) : englouti d'emblée
    if (this.collapseT < 0 && this.hell.victory) this.collapseT = 30;
    if (this.collapseT < 0) return;
    const cit =[...this.hell.buildings.values()].find((b) => b.kind === 'kingdom');
    if (!cit) return;
    this.collapseT += dt;
    const t = this.collapseT, { x, z } = cit.site, y0 = this.map.groundY(x, z);
    for (const [id, h] of this.houses) {
      const b = this.hell.buildings.get(id);
      if (!b || b.zone !== Z_KINGDOM || b.side !== 'hell') continue;
      h.ruin.position.y = this.map.groundY(b.site.x, b.site.z) - Math.min(1.8, t * 0.4);
      h.ruin.rotation.z = Math.sin(t * 11 + id) * 0.04 * Math.min(1, t);
    }
    // la lave monte dans l'enceinte et la noie
    if (!this.lavaRise) {
      this.lavaRise = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), lavaMaterial(this.uTime, 0));
      this.lavaRise.renderOrder = 2;
      this.content.add(this.lavaRise);
      this.sources.push({ x, y: y0 + 1.2, z, r: 11, c: new THREE.Color(1, 0.4, 0.12).multiplyScalar(2.2), flicker: 0.2 });
    }
    this.lavaRise.position.set(x, HLAVA_Y + Math.min(0.5, t * 0.12), z);
    this.lavaRise.scale.setScalar(Math.min(10, 0.5 + t * t * 0.3));
    this.stepDebris(dt, t, x, y0, z);
    // poussière qui monte, jets de lave
    this.dustT -= dt;
    if (this.dustT > 0 || t > 9) return;
    this.dustT = 0.06;
    const fx = this.units.fx, a = Math.random() * Math.PI * 2, d = Math.random() * Math.min(9, 2 + t * 2), px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    fx.puff(px, y0 + 0.4 + Math.random() * 1.5, pz, 12);
    if (Math.random() < 0.35) fx.chips(px, y0 + 0.3, pz, 0xff8a2a, 14);
    if (Math.random() < 0.12) fx.boom(px, y0 + 0.6, pz);
  }

  /**
   * La cinématique de fin : des blocs de la citadelle se détachent et tombent dans la lave (peu de pièces, un seul matériau),
   * puis une onde de choc dorée balaie la carte : un anneau qui s'élargit, la brume rouge qui recule et se teinte d'or
   */
  private stepDebris(dt: number, t: number, x: number, y0: number, z: number) {
    const bg = this.scene.background as THREE.Color;
    // les blocs : une trentaine en tout, lancés du haut de la citadelle entre 0,3 s et 5 s
    if (t < 5 && this.debris.length < 34 && (this.debrisT -= dt) <= 0) {
      this.debrisT = 0.13;
      this.debrisGeo ??= new THREE.DodecahedronGeometry(1, 0);
      this.debrisMat ??= new THREE.MeshStandardMaterial({ color: 0x4a2a2c, roughness: 0.9, flatShading: true, emissive: 0x401408 });
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat), a = Math.random() * Math.PI * 2, r = Math.random() * 3.5, s = 0.25 + Math.random() * 0.55;
      m.scale.set(s, s * 0.8, s);
      m.position.set(x + Math.sin(a) * r, y0 + 3.5 + Math.random() * 3, z + Math.cos(a) * r);
      this.content.add(m);
      this.debris.push({ m, vx: Math.sin(a) * (0.6 + Math.random() * 2.2), vy: 1 + Math.random() * 3, vz: Math.cos(a) * (0.6 + Math.random() * 2.2), spin: (Math.random() - 0.5) * 6 });
    }
    for (const d of this.debris) {
      if (d.m.position.y < HLAVA_Y - 0.6) { d.m.visible = false; continue; }
      d.vy -= 11 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      d.m.rotation.x += d.spin * dt; d.m.rotation.z += d.spin * 0.7 * dt;
      // à la lave : une gerbe, puis il s'enfonce
      if (d.vy < 0 && d.m.position.y < HLAVA_Y + 0.15 && d.vy > -90) { this.units.fx.chips(d.m.position.x, HLAVA_Y + 0.2, d.m.position.z, 0xff8a2a, 8); d.vy = -100; d.vx = d.vz = 0; }
    }
    // l'onde de choc dorée, de 3,2 s à 8 s : l'anneau part du roi, la brume recule
    const w = t - 3.2;
    if (w > 0) {
      if (!this.wave) {
        this.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.05, 0.3), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
        this.wave.renderOrder = 12;
        this.content.add(this.wave);
      }
      const k = Math.min(1, w / 4.6);
      this.wave.position.set(x, y0 + 0.3, z);
      this.wave.scale.setScalar(1 + k * 70);
      // l'anneau s'épaissit en s'éloignant (il reste lisible de loin)
      (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k * k);
      this.waveK = Math.min(1, w / 3);
      bg.copy(BG).lerp(GOLD_FOG, this.waveK * 0.55);
      this.fog.color.copy(bg);
      for (const m of this.seals) m.visible = false;
    }
  }

  /** Sortie des Enfers : la surface ne reçoit plus ces lumières */
  leave() { caveLights.uLN.value = 0; }

  // ---------- Outils ----------

  private item(x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number, c: THREE.Color): Item {
    this.d.position.set(x, y, z);
    this.d.rotation.set(0, rot, 0);
    this.d.scale.set(sx, sy, sz);
    this.d.updateMatrix();
    return { m: this.d.matrix.clone(), c: c.clone() };
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[]) {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c); });
    mesh.computeBoundingSphere();
    this.content.add(mesh);
  }
}

/** Teinte de la zone en une rangée (fondue sur trois cases de part et d'autre des frontières) */
function zoneTint(fz: number, list: THREE.Color[], out: THREE.Color) {
  let i = 0;
  while (i + 1 < HELL_ZONES.length && fz >= HELL_ZONES[i + 1].z0) i++;
  out.copy(list[i]);
  const z0 = HELL_ZONES[i].z0, z1 = i + 1 < HELL_ZONES.length ? HELL_ZONES[i + 1].z0 : 1e9;
  if (i > 0 && fz - z0 < 3) out.lerp(list[i - 1], 0.5 * (1 - (fz - z0) / 3));
  else if (i + 1 < list.length && z1 - fz < 3) out.lerp(list[i + 1], 0.5 * (1 - (z1 - fz) / 3));
  return out;
}

// ---------- Géométries ----------

/** Stalagmite : cône bosselé, plus clair à la pointe */
function stalagGeo() {
  const g = new THREE.ConeGeometry(1, 1, 6, 3).translate(0, 0.5, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), r = 1 + Math.sin(y * 9 + i) * 0.1; p.setX(i, p.getX(i) * r); p.setZ(i, p.getZ(i) * r); }
  return paint(g, 0xffffff, (y) => 0.7 + y * 0.5);
}

/** Os : un fût et deux nœuds à chaque bout (le long de z) */
function boneGeo() {
  return merge([
    paint(new THREE.CylinderGeometry(0.5, 0.5, 1, 5).rotateX(Math.PI / 2), 0xffffff),
    ...[-0.5, 0.5].flatMap((z) => [-0.4, 0.4].map((x) => paint(new THREE.IcosahedronGeometry(0.55, 0).translate(x, 0, z), 0xffffff))),
  ]);
}

/** Côtes de géant : trois arcs dressés en travers du chemin, comme le squelette d'une bête immense */
function ribGeo() {
  return merge([-0.7, 0, 0.7].map((z, i) => paint(new THREE.TorusGeometry(1, 0.07 - i * 0.008, 5, 14, Math.PI).translate(0, 0, z), 0xffffff, (y) => 0.85 + y * 0.2)));
}

/** Ruines d'un bâtiment abattu : un tas de blocs noircis et de braises */
/** Un mur de la base (palissade, porte) : ses côtés reliés (-1 : pas encore calculé), sa pièce, et pour une porte son pivot et son ouverture (0 à 1) */
interface WallPart { kind: 'palisade' | 'gate'; mask: number; mesh: THREE.Mesh; rig?: THREE.Group; pivot?: THREE.Group; open: number }

function ruinGeo(r: number, seed: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9 + r * 4; i++) {
    const a = hash2(seed, i, 1) * 6.28, d = hash2(seed, i, 2) * r * 0.9, s = 0.25 + hash2(seed, i, 3) * 0.35 * Math.min(2, r);
    parts.push(paint(new THREE.BoxGeometry(s, s * 0.7, s).rotateY(a).rotateX(hash2(seed, i, 4) - 0.5).translate(Math.sin(a) * d, s * 0.3, Math.cos(a) * d), i % 4 === 0 ? 0x6a2a1a : 0x2e2228));
  }
  return merge(parts);
}

/**
 * Les bâtiments démoniaques (face au nord, +z vers le sud) : pièces opaques, pièces qui luisent (fenêtres, braises, yeux),
 * et où flottent les étendards
 */
function houseGeo(kind: HellSiteKind): [THREE.BufferGeometry, THREE.BufferGeometry, [number, number, number][]] {
  const STONE = 0x4a3440, DARK = 0x2c1e26, RED = 0xc23a2a, BONE = 0xeadcc0, GOLD = 0xe0a83a, LAVA = 0xffa040, EYE = 0xffe14a, PURPLE = 0x6a2a8a;
  const horn = (x: number, y: number, z: number, s: number, lean: number) => paint(new THREE.ConeGeometry(0.1 * s, 0.5 * s, 5).rotateZ(lean).translate(x, y, z), BONE, (t) => 0.8 + t * 0.3);
  const solid: THREE.BufferGeometry[] = [], shine: THREE.BufferGeometry[] = [], flags: [number, number, number][] = [];
  if (kind === 'outpost') {
    solid.push(paint(new THREE.CylinderGeometry(0.42, 0.62, 1.5, 4).rotateY(Math.PI / 4).translate(0, 0.75, 0), STONE, (y) => 0.8 + y * 0.3));
    solid.push(paint(new THREE.BoxGeometry(1, 0.18, 1).translate(0, 1.55, 0), DARK));
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) solid.push(paint(new THREE.ConeGeometry(0.1, 0.42, 4).translate(x, 1.85, z), RED));
    solid.push(horn(-0.3, 1.1, -0.45, 1.2, 0.6), horn(0.3, 1.1, -0.45, 1.2, -0.6));
    shine.push(paint(new THREE.BoxGeometry(0.14, 0.32, 0.05).translate(0, 1.05, -0.5), LAVA), paint(new THREE.BoxGeometry(0.3, 0.12, 0.3).translate(0, 1.7, 0), LAVA));
    flags.push([0, 2.1, 0]);
    solid.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4).translate(0, 1.95, 0), DARK));
  } else if (kind === 'forge') {
    solid.push(paint(new THREE.BoxGeometry(1.6, 0.75, 1.3).translate(0, 0.375, 0.1), STONE, (y) => 0.8 + y * 0.3));
    solid.push(paint(new THREE.CylinderGeometry(0.05, 1.1, 0.6, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.85).translate(0, 1.05, 0.1), PURPLE));
    solid.push(paint(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 6).translate(0.5, 1.2, 0.35), DARK));
    // l'enclume devant la porte
    solid.push(paint(new THREE.BoxGeometry(0.3, 0.12, 0.14).translate(-0.45, 0.28, -0.75), 0x3a3a44), paint(new THREE.BoxGeometry(0.14, 0.22, 0.12).translate(-0.45, 0.11, -0.75), 0x2a2a30));
    shine.push(paint(new THREE.BoxGeometry(0.55, 0.42, 0.06).translate(0, 0.28, -0.56), LAVA), paint(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 6).translate(0.5, 1.78, 0.35), 0xff6a20));
  } else if (kind === 'fortress') {
    // enceinte carrée crénelée, quatre tours à toit rouge, donjon cornu, porte qui rougeoie
    for (const [w, d, x, z] of [[3.2, 0.32, 0, -1.45], [3.2, 0.32, 0, 1.45], [0.32, 3.2, -1.45, 0], [0.32, 3.2, 1.45, 0]] as const) {
      solid.push(paint(new THREE.BoxGeometry(w, 1, d).translate(x, 0.5, z), STONE, (y) => 0.8 + y * 0.3));
      const n = 6;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5;
        solid.push(paint(new THREE.BoxGeometry(w > d ? 0.24 : 0.34, 0.2, w > d ? 0.34 : 0.24).translate(x + (w > d ? u * w : 0), 1.1, z + (w > d ? 0 : u * d)), STONE));
      }
    }
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      solid.push(paint(new THREE.CylinderGeometry(0.42, 0.5, 1.7, 6).translate(x, 0.85, z), STONE, (y) => 0.8 + y * 0.3));
      solid.push(paint(new THREE.ConeGeometry(0.58, 0.8, 6).translate(x, 2.1, z), RED));
      shine.push(paint(new THREE.BoxGeometry(0.1, 0.24, 0.1).translate(x, 1.25, z - Math.sign(z) * 0.0 - 0.47), LAVA));
    }
    solid.push(paint(new THREE.BoxGeometry(1.3, 2.3, 1.3).translate(0, 1.15, 0.2), DARK, (y) => 0.8 + y * 0.4));
    solid.push(horn(-0.55, 2.55, 0.2, 2.2, 0.55), horn(0.55, 2.55, 0.2, 2.2, -0.55));
    shine.push(paint(new THREE.BoxGeometry(0.7, 0.75, 0.08).translate(0, 0.4, -1.62), 0xff5a1a));
    shine.push(paint(new THREE.BoxGeometry(0.18, 0.12, 0.05).translate(-0.25, 1.8, -0.47), EYE), paint(new THREE.BoxGeometry(0.18, 0.12, 0.05).translate(0.25, 1.8, -0.47), EYE));
    flags.push([-1.5, 2.7, -1.5], [1.5, 2.7, -1.5]);
    for (const x of [-1.5, 1.5]) solid.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4).translate(x, 2.6, -1.5), DARK));
  } else if (kind === 'spire') {
    // une tour de la citadelle : fût sombre sur un socle, meurtrières de lave, chemin de ronde, toit rouge cornu
    solid.push(paint(new THREE.CylinderGeometry(0.75, 0.9, 0.4, 6).translate(0, 0.2, 0), STONE));
    solid.push(paint(new THREE.CylinderGeometry(0.5, 0.66, 2.4, 6).translate(0, 1.6, 0), DARK, (y) => 0.8 + y * 0.4));
    solid.push(paint(new THREE.CylinderGeometry(0.72, 0.6, 0.3, 6).translate(0, 2.95, 0), STONE));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; solid.push(paint(new THREE.BoxGeometry(0.22, 0.24, 0.2).translate(0, 3.2, 0.62).rotateY(a), STONE)); }
    solid.push(paint(new THREE.ConeGeometry(0.62, 1.3, 6).translate(0, 3.85, 0), RED));
    solid.push(horn(-0.4, 3.3, 0, 1.5, 0.7), horn(0.4, 3.3, 0, 1.5, -0.7));
    for (const y of [1.2, 2.1]) shine.push(paint(new THREE.BoxGeometry(0.12, 0.3, 0.06).translate(0, y, -0.6), LAVA));
    shine.push(paint(new THREE.BoxGeometry(0.16, 0.1, 0.05).translate(0, 3.45, -0.5), EYE));
    flags.push([0, 4.7, 0]);
    solid.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4).translate(0, 4.6, 0), DARK));
  } else {
    // la citadelle : enceinte octogonale, six tours, une flèche immense couronnée de cornes et d'un œil de lave
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      solid.push(paint(new THREE.BoxGeometry(2.6, 1.6, 0.4).translate(0, 0.8, 3.6).rotateY(a), STONE, (y) => 0.8 + y * 0.3));
      for (let j = 0; j < 4; j++) solid.push(paint(new THREE.BoxGeometry(0.3, 0.26, 0.42).translate(-0.9 + j * 0.6, 1.73, 3.6).rotateY(a), STONE));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, x = Math.sin(a) * 3.7, z = Math.cos(a) * 3.7;
      solid.push(paint(new THREE.CylinderGeometry(0.55, 0.7, 2.8, 6).translate(x, 1.4, z), DARK, (y) => 0.8 + y * 0.4));
      solid.push(paint(new THREE.ConeGeometry(0.75, 1.2, 6).translate(x, 3.4, z), RED));
      shine.push(paint(new THREE.BoxGeometry(0.16, 0.34, 0.16).translate(x * 0.86, 2.1, z * 0.86), LAVA));
      flags.push([x, 4.2, z]);
    }
    solid.push(paint(new THREE.CylinderGeometry(1.3, 2.2, 3.6, 8).translate(0, 1.8, 0), STONE, (y) => 0.75 + y * 0.4));
    solid.push(paint(new THREE.CylinderGeometry(0.6, 1.2, 2.8, 8).translate(0, 5, 0), DARK, (y) => 0.8 + y * 0.4));
    solid.push(paint(new THREE.ConeGeometry(0.7, 1.6, 8).translate(0, 7.2, 0), RED));
    solid.push(horn(-1, 6, 0, 4, 0.7), horn(1, 6, 0, 4, -0.7), horn(-1.6, 3.6, 0, 3, 0.9), horn(1.6, 3.6, 0, 3, -0.9));
    solid.push(paint(new THREE.TorusGeometry(0.75, 0.1, 4, 10).rotateX(Math.PI / 2).translate(0, 6.45, 0), GOLD));
    shine.push(paint(new THREE.IcosahedronGeometry(0.42, 1).translate(0, 5.6, -0.72), 0xffd040));
    shine.push(paint(new THREE.BoxGeometry(1.2, 1.3, 0.1).translate(0, 0.65, -3.72), 0xff5a1a));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; shine.push(paint(new THREE.BoxGeometry(0.2, 0.4, 0.1).translate(0, 2.4, 1.95).rotateY(a), LAVA)); }
  }
  return [merge(solid), merge(shine), flags];
}

// ---------- Matériaux ----------

/** Lave : fonte vive qui coule, remous clairs, plaques de croûte sombre qui dérivent ; `deep` l'assombrit (le fond des abîmes) */
function lavaMaterial(uTime: { value: number }, deep: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uDeep: { value: deep } },
    vertexShader: `varying vec2 vP;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; uniform float uDeep; varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 q = vP * 1.1 + vec2(uTime * 0.09, uTime * 0.05);
  float f = n(q) * 0.5 + n(q * 2.3 - uTime * 0.07) * 0.32 + n(q * 5.1 + uTime * 0.15) * 0.18;
  // plaques de croûte sombre, petites, bordées de fonte vive
  float cr = n(vP * 2.4 + vec2(uTime * 0.03, -uTime * 0.02));
  float crust = smoothstep(0.5, 0.6, cr), rim = smoothstep(0.42, 0.5, cr) * (1.0 - crust);
  vec3 hot = mix(vec3(0.85, 0.2, 0.03), vec3(1.0, 0.62, 0.15), smoothstep(0.5, 0.85, f));
  vec3 c = mix(hot, vec3(0.22, 0.05, 0.04), crust * 0.85) + vec3(1.0, 0.55, 0.15) * rim * 0.5;
  c *= 1.0 - uDeep;
  gl_FragColor = vec4(c * 1.1, 1.0);
}`,
  });
}

/** Braises : points qui montent en tourbillonnant et s'éteignent */
function emberMaterial(uTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 seed; uniform float uTime; varying float vA;
void main() {
  float t = fract(uTime * 0.11 * seed.y + seed.x * 17.0);
  vec3 p = position;
  p.y += t * seed.z;
  p.x += sin(uTime * 1.3 + seed.x * 40.0) * 0.3 * t;
  p.z += cos(uTime * 1.1 + seed.x * 23.0) * 0.3 * t;
  vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(90.0 / -mv.z, 1.5, 9.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `varying float vA;
void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 1.6, a); }`,
  });
}

/** Brume rouge : un voile qui dérive lentement, plus dense par nappes ; elle recule autour des braseros (`uClear` : x, z, rayon) */
function mistMaterial(uTime: { value: number }, uClear: { value: THREE.Vector3[] }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uClear },
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vP;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uClear[8]; varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 q = vP * 0.12 + vec2(uTime * 0.02, uTime * 0.012);
  float m = n(q) * 0.6 + n(q * 2.7 - uTime * 0.015) * 0.4;
  float clear = 1.0;
  for (int i = 0; i < 8; i++) if (uClear[i].z > 0.0) clear *= smoothstep(uClear[i].z * 0.4, uClear[i].z, distance(vP, uClear[i].xy));
  gl_FragColor = vec4(0.75, 0.16, 0.22, smoothstep(0.35, 0.85, m) * 0.11 * clear);
}`,
  });
}

/** Le rideau de brume qui ferme une zone : volutes rouges et violettes qui montent, plus denses au sol, bords fondus */
function sealMaterial(uTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vP; varying vec2 vUv;
void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vP = vec2(wp.x, wp.y); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; varying vec2 vP; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 q = vec2(vP.x * 0.7, vP.y * 1.2 - uTime * 0.35);
  float m = n(q) * 0.55 + n(q * 2.3 + vec2(uTime * 0.2, 0.0)) * 0.3 + n(q * 5.0 - uTime * 0.4) * 0.15;
  vec3 c = mix(vec3(0.55, 0.12, 0.7), vec3(1.0, 0.3, 0.25), smoothstep(0.3, 0.8, m));
  float a = smoothstep(0.2, 0.75, m) * (1.0 - smoothstep(0.35, 1.0, vUv.y)) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  gl_FragColor = vec4(c * 1.2, a * 0.85);
}`,
  });
}

/** Vortex du portail : spirale rouge et violette qui tourne vers son cœur lumineux */
function vortexMaterial(uTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
void main() {
  vec2 p = (vUv - vec2(0.0, 1.75)) / vec2(0.94, 1.7);
  float r = length(p), a = atan(p.y, p.x);
  float sw = sin(a * 3.0 + r * 9.0 - uTime * 3.0) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.55, 0.1, 0.8), vec3(1.0, 0.25, 0.3), sw) + vec3(1.0, 0.8, 1.0) * smoothstep(0.35, 0.0, r);
  gl_FragColor = vec4(c * 1.3, smoothstep(1.0, 0.85, r));
}`,
  });
}

/** Flamme des braseros : un cône qui vacille */
function flameMaterial(uTime: { value: number }) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float up = max(transformed.y - 0.6, 0.0);
  transformed.y += up * 0.5 * sin(uTime * 11.0 + position.x * 5.0);
  transformed.x += up * 0.4 * sin(uTime * 9.0);`);
  };
  m.customProgramCacheKey = () => 'hell-flame';
  return m;
}

/** Le type d'une unité, utile à l'interface (nom affiché) */
export function unitName(u: HellUnit) { return u.side === 'hell' ? DEMONS[u.kind as DemonKind]?.name ?? u.kind : u.kind; }
