import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VR } from '../world/world';
import { HellMap, HW, HL, HVW, HVL, HWALL, HPOOL_LAVA, HPOOL_CHASM, HLAVA_Y, HCHASM_Y, HELL_ZONES, Z_PORTAL, Z_EMBER, Z_BONES, Z_CRYSTAL, Z_KINGDOM, HellSiteKind } from '../world/hell';
import { ROCK_ISO, FLOOR_ISO } from '../world/underground';
import { Hell, HellUnit, DemonKind, DEMONS } from '../sim/hell';
import { caveLights, caveLit, glowMaterial, MAX_CAVE_LIGHTS } from './caveLight';
import { CombatFx } from './combatFx';
import { makeSoldier, soldierStep, Soldier } from './soldiers';
import { hash2, smoothstep } from '../core/rng';

/**
 * Le monde des Enfers, vu comme le monde souterrain (galeries en coupe, le dessus des parois est la tranche sombre de la
 * roche) mais aux couleurs infernales : roche rouge et noire, lave qui coule et éclaire, braises qui montent, brume rouge,
 * stalagmites, os de géants, cristaux ; les démons et leurs bâtiments en low-poly. Seules les sources (lave, cristaux,
 * braseros, portail) éclairent, via les lumières partagées du souterrain : aucune lumière par unité
 */

const BG = new THREE.Color(0x1c0a12);
/** Sol et parois, par zone (seuil, braises, rivière, falaises, os, cristaux, royaume) : plus clairs au sol */
const FLOOR = [0x6e5a66, 0x7a4c40, 0x6e4636, 0x625a5e, 0x7c6a56, 0x5c4c72, 0x6e3440].map((c) => new THREE.Color(c));
const WALL = [0x4a3a46, 0x56322a, 0x4e2e24, 0x46404a, 0x5a4a3c, 0x3e3256, 0x4c2230].map((c) => new THREE.Color(c));
const TOP = new THREE.Color(0x160a0e);
const EMBER = new THREE.Color(0x6a1a08);
const FACE_MIX = 0.85;
/** Rayon d'éclairage de la lave, et une source toutes les LAVA_STEP cases */
const LAVA_STEP = 3;
const LIGHT_PICK = 0.25;
/** Échelle des modèles de démons (le modèle mesure 1 de haut) */
const SCALE: Record<DemonKind, number> = { imp: 0.32, archer: 0.36, brute: 0.52, chief: 0.56, guardian: 0.95, king: 1.5 };
/** Instances au plus, par sorte de démon */
const CAP: Record<DemonKind, number> = { imp: 160, archer: 96, brute: 96, chief: 32, guardian: 12, king: 4 };
const KINDS = Object.keys(DEMONS) as DemonKind[];
const PARTS = ['body', 'glow', 'legL', 'legR', 'armL', 'armR', 'wingL', 'wingR'] as const;
type PartName = typeof PARTS[number];

interface Source { x: number; y: number; z: number; r: number; c: THREE.Color; flicker: number }
interface Item { m: THREE.Matrix4; c: THREE.Color }
interface Rig { parts: Partial<Record<PartName, { mesh: THREE.InstancedMesh; pivot: THREE.Vector3 }>> }

export class HellView {
  scene = new THREE.Scene();
  fx = new CombatFx();
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
  private rigs = {} as Record<DemonKind, Rig>;
  /** bâtiments : maillage debout, ruines, barre de vie */
  private houses = new Map<number, { up: THREE.Group; ruin: THREE.Mesh; down: boolean; flags: THREE.Object3D[] }>();
  /** unités du joueur : des soldats de l'Antiquité */
  private troops = new Map<number, Soldier>();
  private barBg: THREE.InstancedMesh;
  private barFill: THREE.InstancedMesh;
  private portalDisc: THREE.Mesh | null = null;
  private built = false;
  private m4 = new THREE.Matrix4();
  private m5 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  private white = new THREE.Color(1, 1, 1);
  private flash = new THREE.Color(2.2, 1.7, 1.5);

  constructor(readonly map: HellMap, public hell: Hell) {
    this.scene.background = BG;
    this.scene.fog = this.fog;
    // lumière chaude d'en bas (la lave), violette d'en haut : les reliefs se lisent sans rien de noir
    this.scene.add(new THREE.HemisphereLight(0xb08ab8, 0x4a1820, 1.05));
    const dir = new THREE.DirectionalLight(0xffc8a8, 1.7);
    dir.position.set(-0.5, 0.8, 0.4);
    this.scene.add(dir);
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const ground = new THREE.Mesh(this.groundGeo, caveLit(groundMat, 'hell-ground'));
    this.scene.add(ground, this.content, this.fx.group);
    // barres de vie : un fond sombre, la jauge colorée (toujours par-dessus)
    const plane = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    const barMat = (o: number) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false });
    this.barBg = new THREE.InstancedMesh(plane, barMat(0.75), 600);
    this.barFill = new THREE.InstancedMesh(plane, barMat(1), 600);
    for (const b of [this.barBg, this.barFill]) { b.count = 0; b.frustumCulled = false; b.renderOrder = b === this.barFill ? 11 : 10; b.setColorAt(0, this.white); this.scene.add(b); }
    for (const k of KINDS) this.rigs[k] = this.makeRig(k);
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
    const mesh = new THREE.Mesh(g, mistMaterial(this.uTime));
    mesh.renderOrder = 3;
    this.content.add(mesh);
  }

  /** Le portail de retour : arche de pierre sombre, vortex rouge et violet, deux braseros */
  private buildPortal() {
    const [px, pz] = this.map.portal, y = this.map.groundY(px, pz);
    const arch = mergeGeometries([
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
      const [solid, shine, flagY] = houseGeo(b.kind);
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
      const h = b.kind === 'kingdom' ? 5.4 : b.kind === 'fortress' ? 2.6 : 1.4;
      this.sources.push({ x: b.site.x, y: y + h, z: b.site.z - b.site.r - 0.3, r: b.kind === 'kingdom' ? 9 : 4.5, c: new THREE.Color(1, 0.45, 0.2).multiplyScalar(b.kind === 'kingdom' ? 2 : 1.4), flicker: 0.25 });
    }
  }

  // ---------- Démons ----------

  /** Le modèle d'une sorte de démon, en pièces animées (corps, lueurs, jambes, bras, ailes) : un maillage instancié par pièce */
  private makeRig(kind: DemonKind): Rig {
    const def = demonParts(kind), rig: Rig = { parts: {} };
    const body = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }), 'hell-demon');
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    for (const name of PARTS) {
      const p = def[name];
      if (!p) continue;
      const mesh = new THREE.InstancedMesh(p.geo, name === 'glow' ? glow : body, CAP[kind]);
      mesh.count = 0;
      mesh.frustumCulled = false;
      if (name === 'body') { for (let i = 0; i < CAP[kind]; i++) mesh.setColorAt(i, this.white); }
      this.scene.add(mesh);
      rig.parts[name] = { mesh, pivot: p.pivot };
    }
    return rig;
  }

  /** Pose des démons : marche (jambes, bras, balancement), coup porté, ailes qui battent, chute à la mort */
  private drawDemons() {
    const t = this.uTime.value, counts = {} as Record<DemonKind, number>;
    for (const k of KINDS) counts[k] = 0;
    const root = this.m4, local = this.m5, q = this.q, v = this.v, s = this.s, e = this.e;
    for (const u of this.hell.units.values()) {
      if (u.side !== 'hell') continue;
      const kind = u.kind as DemonKind, rig = this.rigs[kind];
      if (!rig || counts[kind] >= CAP[kind]) continue;
      const i = counts[kind]++, sc = SCALE[kind];
      const dead = u.hp <= 0, fall = dead ? Math.min(1, u.hurt / 0.5) : 0;
      // les morts basculent, puis s'enfoncent dans un nuage de fumée violette
      const sink = dead ? Math.max(0, u.hurt - 1.2) * 0.6 : 0, shrink = dead ? Math.max(0.01, 1 - Math.max(0, u.hurt - 1.6)) : 1;
      const walk = u.moving ? u.walk : 0, bob = u.moving ? Math.abs(Math.sin(walk)) * 0.05 : Math.sin(t * 2 + u.id) * 0.012;
      const hover = kind === 'imp' ? 0.12 + Math.sin(t * 6 + u.id) * 0.04 : 0;
      v.set(u.x, this.map.groundY(u.x, u.z) + (bob + hover) * sc - sink, u.z);
      const atk = u.swing < 0.5 ? Math.sin((u.swing / 0.5) * Math.PI) : 0;
      e.set(-fall * 1.4 + atk * 0.18, u.heading, 0, 'YXZ');
      q.setFromEuler(e);
      s.setScalar(sc * shrink);
      root.compose(v, q, s);
      const pose = (name: PartName, rx: number, ry = 0, rz = 0) => {
        const p = rig.parts[name];
        if (!p) return;
        e.set(rx, ry, rz, 'XYZ');
        q.setFromEuler(e);
        s.setScalar(1);
        local.compose(p.pivot, q, s);
        local.premultiply(root);
        p.mesh.setMatrixAt(i, local);
      };
      const sw = Math.sin(walk), stride = kind === 'imp' ? 0.9 : kind === 'brute' || kind === 'guardian' ? 0.45 : 0.65;
      pose('body', 0);
      pose('glow', 0);
      pose('legL', sw * stride);
      pose('legR', -sw * stride);
      const archer = kind === 'archer';
      // l'archer tend son arc (bras gauche en avant) ; les autres frappent du bras droit, de haut en bas
      pose('armL', archer && u.state === 'attack' ? -1.45 : -sw * stride * 0.6);
      pose('armR', archer ? (u.state === 'attack' ? -1.3 + atk * 0.4 : sw * stride * 0.6) : u.swing < 0.5 ? -2.3 * atk + 0.4 * atk * atk : sw * stride * 0.6);
      const flap = kind === 'imp' ? Math.sin(t * 16 + u.id) * 0.55 : Math.sin(t * 2.2 + u.id) * 0.18 + (u.moving ? Math.sin(t * 7 + u.id) * 0.2 : 0);
      pose('wingL', 0, 0.5 + flap, 0);
      pose('wingR', 0, -0.5 - flap, 0);
      // touché : un éclair clair sur le corps
      const bodyMesh = rig.parts.body!.mesh;
      bodyMesh.setColorAt(i, u.hurt < 0.12 && !dead ? this.flash : this.white);
    }
    for (const k of KINDS) {
      for (const p of Object.values(this.rigs[k].parts)) {
        p.mesh.count = counts[k];
        p.mesh.instanceMatrix.needsUpdate = true;
        if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Les unités du joueur : soldats de l'Antiquité (le contrôle des troupes y ajoutera sélection et ordres) */
  private drawTroops() {
    const seen = new Set<number>();
    for (const u of this.hell.units.values()) {
      if (u.side !== 'player') continue;
      seen.add(u.id);
      let s = this.troops.get(u.id);
      if (!s) { s = makeSoldier(1, u.id); this.scene.add(s.root); this.troops.set(u.id, s); }
      const dead = u.hp <= 0;
      s.root.position.set(u.x, this.map.groundY(u.x, u.z) - (dead ? Math.max(0, u.hurt - 1.2) * 0.3 : 0), u.z);
      s.root.rotation.set(dead ? -Math.min(1, u.hurt / 0.5) * 1.4 : 0, u.heading, 0, 'YXZ');
      s.root.scale.setScalar(1.6);
      soldierStep(s, u.moving ? u.walk : this.uTime.value, dead ? 'idle' : u.state === 'attack' ? 'fight' : u.moving ? (u.state === 'retreat' ? 'run' : 'walk') : 'guard');
    }
    for (const [id, s] of this.troops) if (!seen.has(id)) { this.scene.remove(s.root); this.troops.delete(id); }
  }

  /** Barres de vie : les unités blessées ou au combat, les chefs toujours ; les bâtiments entamés, la citadelle toujours */
  private drawBars(camera: THREE.Camera) {
    let n = 0;
    const q = camera.quaternion, m = this.m4, off = this.m5, v = this.v, s = this.s;
    const put = (x: number, y: number, z: number, w: number, frac: number, c: THREE.Color) => {
      if (n >= 600) return;
      // la jauge part du bord gauche du fond (le plan va de 0 à 1 en x)
      v.set(x, y, z);
      s.set(1, 1, 1);
      m.compose(v, q, s);
      off.makeTranslation(-(w + 0.04) / 2, 0, 0).multiply(BAR_S.makeScale(w + 0.04, 0.09, 1));
      this.barBg.setMatrixAt(n, BAR_M.multiplyMatrices(m, off));
      this.barBg.setColorAt(n, BAR_BG);
      off.makeTranslation(-w / 2, 0, 0.001).multiply(BAR_S.makeScale(Math.max(0.001, w * frac), 0.06, 1));
      this.barFill.setMatrixAt(n, BAR_M.multiplyMatrices(m, off));
      this.barFill.setColorAt(n, c);
      n++;
    };
    for (const u of this.hell.units.values()) {
      if (u.hp <= 0) continue;
      const boss = u.kind === 'guardian' || u.kind === 'king' || u.kind === 'chief';
      if (u.hp >= u.maxHp && !boss && u.state !== 'attack') continue;
      const sc = u.side === 'hell' ? SCALE[u.kind as DemonKind] ?? 0.4 : 0.45;
      const frac = u.hp / u.maxHp;
      put(u.x, this.map.groundY(u.x, u.z) + sc * 1.25 + 0.15, u.z, boss ? 0.9 : 0.5, frac, u.side === 'hell' ? HELL_C : frac > 0.35 ? PLAYER_C : WEAK_C);
    }
    for (const b of this.hell.buildings.values()) {
      if (b.down || (b.hp >= b.maxHp && b.kind !== 'kingdom')) continue;
      const h = b.kind === 'kingdom' ? 7.2 : b.kind === 'fortress' ? 3.6 : 2.2;
      put(b.site.x, this.map.groundY(b.site.x, b.site.z) + h, b.site.z, b.kind === 'kingdom' ? 3 : 1.6, b.hp / b.maxHp, HELL_C);
    }
    for (const b of [this.barBg, this.barFill]) {
      b.count = n;
      b.instanceMatrix.needsUpdate = true;
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
  }

  /** Ce que la simulation raconte : coups (étincelles), flèches de feu, morts (fumée violette), bâtiments qui s'effondrent */
  private playEvents() {
    const h = this.hell;
    for (const ev of h.events.splice(0)) {
      if (ev.type === 'hit') {
        const t = h.units.get(ev.target), y = t ? this.map.groundY(ev.x, ev.z) + (t.side === 'hell' ? SCALE[t.kind as DemonKind] ?? 0.4 : 0.4) * 0.6 : this.map.groundY(ev.x, ev.z) + 1;
        if (!ev.ranged) this.fx.hit(ev.x, y, ev.z, t?.side === 'player' ? 0xff7a3a : 0xffd27a, 10, t?.side === 'player' ? 'bite' : 'blade');
      } else if (ev.type === 'shot') {
        const y0 = this.map.groundY(ev.x0, ev.z0) + ev.y0, y1 = this.map.groundY(ev.x1, ev.z1) + 0.3;
        this.fx.tracer(ev.x0, y0, ev.z0, ev.x1, y1, ev.z1, ev.fire ? 0xff6a1a : 0xfff0c0, ev.fire ? 9 : 13);
      } else if (ev.type === 'death') {
        const y = this.map.groundY(ev.x, ev.z) + 0.2;
        if (ev.side === 'hell') { this.fx.hit(ev.x, y, ev.z, 0xb05aff, 18, 'bite'); this.fx.puff(ev.x, y, ev.z, 10); }
      } else if (ev.type === 'destroyed') {
        const house = this.houses.get(ev.id);
        const y = this.map.groundY(ev.x, ev.z);
        this.fx.boom(ev.x, y + 1, ev.z);
        for (let i = 0; i < 4; i++) this.fx.puff(ev.x + Math.sin(i * 1.7) * 1.2, y + 0.5, ev.z + Math.cos(i * 1.7) * 1.2, 10);
        if (house) { house.up.visible = false; house.ruin.visible = true; house.down = true; }
      }
    }
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

  update(dt: number, camera: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number) {
    this.build();
    this.uTime.value += dt;
    const t = this.uTime.value;
    this.fog.near = dist * 1.4;
    this.fog.far = dist * 3 + 14;
    Object.assign(this.lantern, { x: target.x, y: this.groundY(target.x, target.z) + 1.6, z: target.z });
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = LIGHT_PICK;
      const dd = (s: Source) => Math.hypot(s.x - target.x, s.z - target.z) - s.r;
      this.active = [this.lantern, ...this.sources.filter((s) => dd(s) < dist * 1.3).sort((a, b) => dd(a) - dd(b)).slice(0, MAX_CAVE_LIGHTS - 1)];
    }
    this.active.forEach((s, i) => {
      caveLights.uL.value[i].set(s.x, s.y, s.z, s.r);
      const f = s.flicker ? 1 + Math.sin(t * 13 + s.x * 7) * s.flicker * 0.5 + Math.sin(t * 7.3 + s.z * 5) * s.flicker * 0.5 : 1;
      caveLights.uLC.value[i].set(s.c.r * f, s.c.g * f, s.c.b * f);
    });
    caveLights.uLN.value = this.active.length;
    // les bâtiments : étendards qui flottent ; ruines quand ils tombent (une partie reprise d'une sauvegarde aussi)
    for (const [id, h] of this.houses) {
      const b = this.hell.buildings.get(id);
      if (b?.down && !h.down) { h.down = true; h.up.visible = false; h.ruin.visible = true; }
      if (h.up.visible) h.flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 2.3 + i + id) * 0.35; });
    }
    if (this.portalDisc) this.portalDisc.rotation.z = 0;
    this.playEvents();
    this.drawDemons();
    this.drawTroops();
    this.drawBars(camera);
    this.fx.update(dt);
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

const BAR_M = new THREE.Matrix4(), BAR_S = new THREE.Matrix4();
const BAR_BG = new THREE.Color(0x1a0a0c), HELL_C = new THREE.Color(0xff4a3a), PLAYER_C = new THREE.Color(0x5adf6a), WEAK_C = new THREE.Color(0xffc040);

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

/** Couleurs de sommet (facettes : sommets séparés, sans uv) ; `f` : nuance selon la hauteur relative */
function paint(g: THREE.BufferGeometry, c: number | THREE.Color, f: (y: number) => number = () => 1) {
  const out = g.index ? g.toNonIndexed() : g;
  if (out.attributes.uv) out.deleteAttribute('uv');
  out.computeBoundingBox();
  const p = out.attributes.position, b = out.boundingBox!, h = Math.max(1e-6, b.max.y - b.min.y), col = new THREE.Color(c), arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = f((p.getY(i) - b.min.y) / h);
    arr[i * 3] = col.r * k; arr[i * 3 + 1] = col.g * k; arr[i * 3 + 2] = col.b * k;
  }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  out.computeVertexNormals();
  return out;
}

function merge(list: THREE.BufferGeometry[]) { return mergeGeometries(list)!; }

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

/**
 * Les pièces d'un démon (1 de haut, face à +z) : corps (buste, tête, cornes), lueurs (yeux, fissures de lave), jambes et bras
 * (pivot à la hanche, à l'épaule), ailes (pivot dans le dos) ; chacune peinte de ses couleurs
 */
function demonParts(kind: DemonKind): Partial<Record<PartName, { geo: THREE.BufferGeometry; pivot: THREE.Vector3 }>> {
  const spec = {
    imp: { skin: 0xe8503a, dark: 0xa02a24, horn: 0xf4e4c8, eye: 0xfff04a, wing: 0x8a3ab0, belly: 0xf59a6a, hip: 0.36, sh: 0.64, w: 0.2, head: 0.21, torso: 0.2, limb: 0.055, wings: 0.5 },
    archer: { skin: 0xf0803a, dark: 0x5a2a4a, horn: 0xf4e4c8, eye: 0xfff04a, wing: 0, belly: 0xf8b070, hip: 0.4, sh: 0.68, w: 0.17, head: 0.17, torso: 0.17, limb: 0.045, wings: 0 },
    brute: { skin: 0x9a3a6a, dark: 0x5a1e40, horn: 0xeadcc0, eye: 0xffb030, wing: 0, belly: 0xc06a90, hip: 0.32, sh: 0.66, w: 0.3, head: 0.15, torso: 0.33, limb: 0.1, wings: 0 },
    chief: { skin: 0xc02a3a, dark: 0x6a1420, horn: 0xf4e4c8, eye: 0xfff04a, wing: 0x5a1a6a, belly: 0xe06a6a, hip: 0.4, sh: 0.7, w: 0.22, head: 0.17, torso: 0.24, limb: 0.07, wings: 0.45 },
    guardian: { skin: 0x4a3638, dark: 0x2a1e22, horn: 0xd8c8b0, eye: 0xffd030, wing: 0, belly: 0x5e4446, hip: 0.34, sh: 0.68, w: 0.3, head: 0.15, torso: 0.34, limb: 0.11, wings: 0 },
    king: { skin: 0xd02838, dark: 0x5a0e1e, horn: 0x2a1a20, eye: 0xfff4a0, wing: 0x3a1450, belly: 0xf07a5a, hip: 0.4, sh: 0.7, w: 0.24, head: 0.16, torso: 0.25, limb: 0.075, wings: 0.75 },
  }[kind];
  const out: Partial<Record<PartName, { geo: THREE.BufferGeometry; pivot: THREE.Vector3 }>> = {};
  const S = spec, headY = S.sh + S.head * 0.9;
  // le corps : buste, ventre, tête, cornes (et queue pour le diablotin)
  const body: THREE.BufferGeometry[] = [
    paint(new THREE.IcosahedronGeometry(1, 0).scale(S.torso, (S.sh - S.hip) * 0.75, S.torso * 0.8).translate(0, (S.sh + S.hip) / 2, 0), S.skin),
    paint(new THREE.IcosahedronGeometry(1, 0).scale(S.torso * 0.6, (S.sh - S.hip) * 0.45, S.torso * 0.3).translate(0, (S.sh + S.hip) / 2 - 0.02, S.torso * 0.55), S.belly),
    paint(new THREE.IcosahedronGeometry(S.head, 1).scale(1, 0.95, 0.95).translate(0, headY, kind === 'brute' || kind === 'guardian' ? 0.08 : 0.02), S.skin),
    paint(new THREE.BoxGeometry(S.w * 2.1, S.limb * 1.5, S.torso * 1.1).translate(0, S.hip, 0), S.dark),
  ];
  const hornL = kind === 'brute' || kind === 'guardian' || kind === 'king' ? 0.32 : 0.2;
  for (const sd of [-1, 1]) body.push(paint(new THREE.ConeGeometry(S.head * 0.28, hornL, 5).translate(0, hornL / 2, 0).rotateZ(-sd * (kind === 'brute' ? 1.1 : 0.45)).translate(sd * S.head * 0.6, headY + S.head * 0.55, 0), S.horn, (t) => 0.8 + t * 0.3));
  if (kind === 'imp' || kind === 'chief' || kind === 'king')
    body.push(paint(new THREE.CylinderGeometry(0.012, 0.03, 0.4, 4).rotateX(-1.1).translate(0, S.hip + 0.05, -S.torso - 0.16), S.dark), paint(new THREE.ConeGeometry(0.05, 0.08, 3).rotateX(-2.2).translate(0, S.hip + 0.22, -S.torso - 0.32), S.dark));
  if (kind === 'archer') body.push(paint(new THREE.ConeGeometry(S.head * 1.25, S.head * 1.6, 6).translate(0, headY + S.head * 0.35, -0.03), S.dark), paint(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 5).rotateX(0.4).translate(0.08, S.sh - 0.05, -S.torso), 0x5a3a24));
  if (kind === 'chief' || kind === 'king') {
    // armure d'or sur les épaules, cape
    for (const sd of [-1, 1]) body.push(paint(new THREE.IcosahedronGeometry(S.limb * 1.8, 0).translate(sd * S.w, S.sh + 0.02, 0), 0xe0b040));
    body.push(paint(new THREE.BoxGeometry(S.w * 2.2, S.sh * 0.85, 0.03).translate(0, S.sh * 0.5, -S.torso * 0.9), kind === 'king' ? 0x5a1a8a : 0x3a1030));
  }
  if (kind === 'king') for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; body.push(paint(new THREE.ConeGeometry(0.035, 0.12, 4).translate(Math.sin(a) * S.head * 0.75, headY + S.head * 0.95, Math.cos(a) * S.head * 0.75), 0xf0c040)); }
  if (kind === 'guardian') for (const sd of [-1, 1]) body.push(paint(new THREE.IcosahedronGeometry(S.limb * 1.6, 0).translate(sd * S.w * 1.05, S.sh + 0.03, 0), 0x3a2a2c));
  out.body = { geo: merge(body), pivot: new THREE.Vector3() };
  // les lueurs : yeux, et pour le gardien des fissures de lave sur le torse
  const glow: THREE.BufferGeometry[] = [-1, 1].map((sd) => paint(new THREE.IcosahedronGeometry(S.head * 0.2, 0).scale(1.2, 0.8, 0.6).translate(sd * S.head * 0.38, headY + S.head * 0.12, S.head * 0.88 + (kind === 'brute' || kind === 'guardian' ? 0.08 : 0.02)), S.eye));
  if (kind === 'guardian') for (let i = 0; i < 5; i++) glow.push(paint(new THREE.BoxGeometry(0.03, 0.16, 0.02).rotateZ((i - 2) * 0.5).translate((i - 2) * 0.09, S.hip + 0.12 + (i % 2) * 0.12, S.torso * 0.8), 0xff7a1a));
  if (kind === 'king') glow.push(paint(new THREE.IcosahedronGeometry(0.035, 0).translate(0, headY + S.head * 0.95, S.head * 0.78), 0xff3a6a));
  out.glow = { geo: merge(glow), pivot: new THREE.Vector3() };
  // jambes : pivot à la hanche, vers le bas ; pieds griffus
  const leg = () => merge([
    paint(new THREE.CylinderGeometry(S.limb, S.limb * 0.8, S.hip, 5).translate(0, -S.hip / 2, 0), S.skin),
    paint(new THREE.BoxGeometry(S.limb * 2.2, S.limb * 0.9, S.limb * 3).translate(0, -S.hip + S.limb * 0.4, S.limb * 0.6), S.dark),
  ]);
  out.legL = { geo: leg(), pivot: new THREE.Vector3(-S.w * 0.55, S.hip, 0) };
  out.legR = { geo: leg(), pivot: new THREE.Vector3(S.w * 0.55, S.hip, 0) };
  // bras : pivot à l'épaule ; l'arme dans la main droite (arc dans la gauche pour l'archer)
  const armLen = S.sh - S.hip + (kind === 'brute' || kind === 'guardian' ? 0.12 : 0.02);
  const arm = (weapon: THREE.BufferGeometry[]) => merge([
    paint(new THREE.CylinderGeometry(S.limb * 0.9, S.limb * 0.75, armLen, 5).translate(0, -armLen / 2, 0), S.skin),
    paint(new THREE.IcosahedronGeometry(S.limb * (kind === 'guardian' || kind === 'brute' ? 1.7 : 1.2), 0).translate(0, -armLen, 0), S.dark),
    ...weapon,
  ]);
  const handY = -armLen;
  const weaponR: Record<DemonKind, THREE.BufferGeometry[]> = {
    // fourche du diablotin, massue cloutée de la brute, hache du chef, sceptre à orbe du roi ; le gardien frappe du poing
    imp: [paint(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4).rotateX(Math.PI / 2).translate(0, handY, 0.15), 0x5a3a24), ...[-0.04, 0, 0.04].map((x) => paint(new THREE.ConeGeometry(0.015, 0.09, 3).rotateX(Math.PI / 2).translate(x, handY, 0.46), 0xd0d0d8))],
    archer: [],
    brute: [paint(new THREE.CylinderGeometry(0.07, 0.035, 0.5, 6).rotateX(Math.PI / 2).translate(0, handY, 0.25), 0x6a4a30), ...[0, 1, 2, 3].map((i) => paint(new THREE.ConeGeometry(0.025, 0.07, 3).rotateZ(Math.PI / 2 + (i * Math.PI) / 2).translate(Math.cos(i * 1.57) * 0.07, handY + Math.sin(i * 1.57) * 0.07, 0.42), 0xd8d0c0))],
    chief: [paint(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 4).rotateX(Math.PI / 2).translate(0, handY, 0.2), 0x3a2a24), paint(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 3, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, handY + 0.05, 0.45), 0xd8d8e0)],
    guardian: [],
    king: [paint(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5).rotateX(Math.PI / 2).translate(0, handY, 0.25), 0xe0b040), paint(new THREE.IcosahedronGeometry(0.07, 1).translate(0, handY, 0.66), 0xff3a6a)],
  };
  const weaponL = kind === 'archer' ? [paint(new THREE.TorusGeometry(0.22, 0.014, 4, 10, Math.PI * 0.9).rotateY(Math.PI / 2).rotateX(Math.PI / 2).translate(0, handY, 0.06), 0x6a3a1e), paint(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 3).rotateX(Math.PI / 2).translate(0.02, handY, 0.12), 0xff8a2a)] : [];
  out.armL = { geo: arm(weaponL), pivot: new THREE.Vector3(-S.w - S.limb * 0.6, S.sh - 0.02, 0) };
  out.armR = { geo: arm(weaponR[kind]), pivot: new THREE.Vector3(S.w + S.limb * 0.6, S.sh - 0.02, 0) };
  // ailes de chauve-souris : membrane en éventail, pivot dans le dos
  if (S.wings) {
    const wing = (sd: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(sd * S.wings, S.wings * 0.55); shape.lineTo(sd * S.wings * 0.9, S.wings * 0.05);
      shape.lineTo(sd * S.wings * 0.65, S.wings * 0.15); shape.lineTo(sd * S.wings * 0.5, -S.wings * 0.15); shape.lineTo(sd * S.wings * 0.28, -S.wings * 0.02); shape.lineTo(0, -S.wings * 0.12);
      return paint(new THREE.ShapeGeometry(shape), S.wing);
    };
    out.wingL = { geo: wing(-1), pivot: new THREE.Vector3(-0.03, S.sh - 0.06, -S.torso * 0.7) };
    out.wingR = { geo: wing(1), pivot: new THREE.Vector3(0.03, S.sh - 0.06, -S.torso * 0.7) };
  }
  return out;
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

/** Brume rouge : un voile qui dérive lentement, plus dense par nappes */
function mistMaterial(uTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vP;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 q = vP * 0.12 + vec2(uTime * 0.02, uTime * 0.012);
  float m = n(q) * 0.6 + n(q * 2.7 - uTime * 0.015) * 0.4;
  gl_FragColor = vec4(0.75, 0.16, 0.22, smoothstep(0.35, 0.85, m) * 0.11);
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
