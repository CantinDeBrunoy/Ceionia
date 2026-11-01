import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, VEG_FOREST, VEG_VOLCANO, BIOME_TEMPERATE, BIOME_MARSH, BIOME_TROPICAL } from '../world/world';
import { GameTime } from '../core/time';
import { clamp, hash2, smoothstep } from '../core/rng';
import { Environment } from './env';
import { SeasonState } from './season';
import { BuildingView } from './buildings';
import { Puffs } from './particles';

const FIREFLIES = 160, MAX_LEAVES = 260, FLOCK = 90, MAX_RINGS = 10;
const SMOKE_LIGHT = new THREE.Color(0.8, 0.79, 0.78), SMOKE_DARK = new THREE.Color(0.3, 0.29, 0.29), STEAM = new THREE.Color(0.96, 0.97, 0.98);
const AUTUMN = [0xe0782c, 0xd4a03a, 0xc4532a, 0x9a6a3a, 0xe8b84a].map((c) => new THREE.Color(c));
const PETALS = [0xf6c6d8, 0xfbe3ec, 0xffffff, 0xf2a9c4].map((c) => new THREE.Color(c));

interface Leaf { x: number; y: number; z: number; vy: number; ph: number; rx: number; rz: number; landed: number; col: THREE.Color }
interface Fish { x0: number; z0: number; dx: number; dz: number; t: number; y: number }
interface Ring { x: number; y: number; z: number; t: number }

/**
 * Petites touches de vie : fumée des cheminées (plus épaisse l'hiver et aux heures des repas), lucioles des nuits d'été,
 * feuilles mortes et pétales qui tombent des arbres, poissons qui sautent, nuées d'oiseaux au crépuscule,
 * fumerolles et sources chaudes au pied des volcans
 */
export class AmbientLife {
  group = new THREE.Group();
  /** densité des particules (qualité graphique) */
  density = 1;
  /** un poisson retombe dans l'eau (pour le son) */
  onSplash: ((x: number, z: number) => void) | null = null;
  /** autres feux de bois à faire fumer (jardins) : ajoutés à la suite des cheminées, (x, y, z, sorte) */
  extraChimneys: ((out: number[]) => void) | null = null;
  private puffs = new Puffs(320, 0);
  private chim: number[] = [];
  private chimTimer = 0;
  private col = new THREE.Color();
  private dummy = new THREE.Object3D();
  private t = 0;
  // lucioles
  private flies: THREE.Points;
  private flyAnchor = new Float32Array(FIREFLIES * 3);
  private flyPos = new Float32Array(FIREFLIES * 3);
  private flyU = { uTime: { value: 0 }, uAlpha: { value: 0 } };
  // feuilles et pétales
  private leaves: THREE.InstancedMesh;
  private leafList: Leaf[] = [];
  private trees: number[] = [];
  private treeTimer = 0;
  // poissons
  private fishMesh: THREE.InstancedMesh;
  private fishes: Fish[] = [];
  private fishTimer = 2;
  private rings: THREE.InstancedMesh;
  private ringAlpha: THREE.InstancedBufferAttribute;
  private ringList: Ring[] = [];
  // nuée du soir
  private flock: THREE.InstancedMesh;
  private flockDir: Float32Array;
  private flockCenter = new THREE.Vector3();
  private flockOn = false;
  private flockK = 0;
  // volcans : fumerolles et sources chaudes
  private springs: THREE.Mesh;
  private vents: number[] = [];
  private builtVis = -1;
  private builtVersion = -1;
  private ventTimer = 0;

  constructor(private world: World, private buildings: BuildingView) {
    // lucioles : points lumineux qui clignotent
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.flyPos, 3));
    fg.setAttribute('aPhase', new THREE.BufferAttribute(Float32Array.from({ length: FIREFLIES }, () => Math.random()), 1));
    this.flies = new THREE.Points(fg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.flyU,
      vertexShader: `uniform float uTime; attribute float aPhase; varying float vBlink;
void main(){ vBlink = smoothstep(0.55, 1.0, sin(uTime * (1.2 + fract(aPhase * 7.0) * 1.5) + aPhase * 40.0));
  vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((5.0 + vBlink * 7.0) * 30.0 / -mv.z, 1.5, 14.0); }`,
      fragmentShader: `uniform float uAlpha; varying float vBlink;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * (0.2 + vBlink * 0.8) * uAlpha;
  gl_FragColor = vec4(vec3(0.9, 1.0, 0.4) * 2.4, a); }`,
    }));
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    // feuilles
    this.leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.05), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }), MAX_LEAVES);
    this.leaves.setColorAt(0, this.col.setRGB(1, 1, 1));
    this.leaves.count = 0;
    this.leaves.frustumCulled = false;
    // poissons : fuseau et nageoire caudale
    const body = new THREE.ConeGeometry(0.035, 0.16, 5).rotateX(Math.PI / 2);
    body.deleteAttribute('uv');
    const tail = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.07, 0, 0.045, -0.12, 0, -0.045, -0.12], 3));
    tail.computeVertexNormals();
    this.fishMesh = new THREE.InstancedMesh(mergeGeometries([body.toNonIndexed(), tail])!, new THREE.MeshStandardMaterial({ color: 0xc8d4dc, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide }), 4);
    this.fishMesh.count = 0;
    this.fishMesh.frustumCulled = false;
    // ronds dans l'eau
    const rg = new THREE.RingGeometry(0.82, 1, 20).rotateX(-Math.PI / 2);
    this.ringAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS), 1);
    rg.setAttribute('aAlpha', this.ringAlpha);
    const rm = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, depthWrite: false });
    rm.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAlpha = aAlpha;');
      sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vAlpha;');
    };
    rm.customProgramCacheKey = () => 'ripple';
    this.rings = new THREE.InstancedMesh(rg, rm, MAX_RINGS);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 3;
    // nuée : petites silhouettes en V
    const bird = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.04, -0.09, 0.025, -0.02, 0, 0, -0.02, 0, 0, 0.04, 0, 0, -0.02, 0.09, 0.025, -0.02], 3));
    this.flock = new THREE.InstancedMesh(bird, new THREE.MeshBasicMaterial({ color: 0x1e1c22, side: THREE.DoubleSide }), FLOCK);
    this.flock.count = 0;
    this.flock.frustumCulled = false;
    this.flockDir = Float32Array.from({ length: FLOCK * 4 }, () => Math.random() * 2 - 1);
    // sources chaudes
    this.springs = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, emissive: 0x0e3438, flatShading: true }));
    this.springs.receiveShadow = true;
    this.group.add(this.puffs.mesh, this.flies, this.leaves, this.fishMesh, this.rings, this.flock, this.springs);
  }

  update(dt: number, time: GameTime, s: SeasonState, env: Environment, focus: THREE.Vector3) {
    const w = this.world, h = time.hour, season = time.season, rain = env.rainK;
    this.t += dt;
    this.chimneySmoke(dt, h, season, focus);
    this.fireflies(dt, season, time.frac, env.night, rain, focus);
    this.fallingLeaves(dt, season, time.frac, s, focus);
    this.jumpingFish(dt, s, focus);
    this.duskFlock(dt, h, env, focus);
    if (w.visVersion !== this.builtVis || (w.version !== this.builtVersion && this.ventTimer <= 0)) {
      this.builtVis = w.visVersion; this.builtVersion = w.version; this.ventTimer = 3;
      this.buildVolcanic();
    }
    this.ventTimer -= dt;
    // fumerolles (sorte 0) et vapeur des sources (sorte 1) ; la pluie les épaissit
    for (let i = 0; i < this.vents.length; i += 4) {
      const x = this.vents[i], y = this.vents[i + 1], z = this.vents[i + 2], spring = this.vents[i + 3];
      if (Math.abs(x - focus.x) > 55 || Math.abs(z - focus.z) > 55 || Math.random() > dt * (spring ? 1.6 : 1.1) * (1 + rain)) continue;
      this.puffs.spawn(x + (Math.random() - 0.5) * 0.25, y + 0.05, z + (Math.random() - 0.5) * 0.25, 0, 0.45 + Math.random() * 0.3, 0,
        spring ? 0.16 : 0.22, 2.2 + Math.random() * 1.4, STEAM, 0, { grow: 2.6, drag: 0.3, wind: 0.15, alpha: spring ? 0.4 : 0.5 });
    }
    this.puffs.update(dt);
  }

  /** Proximité d'un feu de bois (feu de camp, foyer de hutte) : 0 loin … 1 tout près */
  fireNear(focus: THREE.Vector3) {
    let d = Infinity;
    for (let i = 0; i < this.chim.length; i += 4) if (this.chim[i + 3] === 1) d = Math.min(d, Math.hypot(this.chim[i] - focus.x, this.chim[i + 2] - focus.z));
    return 1 - smoothstep(1, 8, d);
  }

  /** Fumée des cheminées proches : un filet le reste du temps, plus épaisse l'hiver, au lever et à l'heure du dîner */
  private chimneySmoke(dt: number, h: number, season: number, focus: THREE.Vector3) {
    this.chimTimer -= dt;
    if (this.chimTimer <= 0) { this.chimTimer = 1; this.buildings.chimneys(this.chim); this.extraChimneys?.(this.chim); }
    const cook = (h > 6.5 && h < 8.5) || (h > 18 && h < 21) ? 0.6 : 0, cold = season === 3 ? 1.1 : season === 2 ? 0.4 : 0;
    const c = this.chim;
    for (let i = 0; i < c.length; i += 4) {
      const x = c[i], y = c[i + 1], z = c[i + 2], kind = c[i + 3];
      if (Math.abs(x - focus.x) > 50 || Math.abs(z - focus.z) > 50) continue;
      const rate = (kind === 2 ? 1.6 : kind === 1 ? 0.9 + cold * 0.3 : 0.35 + cold + cook) * this.density;
      if (Math.random() > dt * rate) continue;
      const g = kind === 2 ? 0 : 0.85 + Math.random() * 0.2;
      this.puffs.spawn(x, y, z, (Math.random() - 0.5) * 0.05, 0.32 + Math.random() * 0.18, (Math.random() - 0.5) * 0.05,
        kind === 2 ? 0.2 : 0.11, 3.6 + Math.random() * 1.6, this.col.copy(kind === 2 ? SMOKE_DARK : SMOKE_LIGHT).multiplyScalar(kind === 2 ? 1 : g), 0,
        { grow: kind === 2 ? 3.4 : 3, drag: 0.15, wind: 0.12, alpha: kind === 2 ? 0.7 : 0.55 });
    }
  }

  /** Lucioles : nuits d'été (et fin de printemps) au-dessus des prairies et des marais, autour du point visé */
  private fireflies(dt: number, season: number, frac: number, night: number, rain: number, focus: THREE.Vector3) {
    const on = (season === 1 || (season === 0 && frac > 0.6)) && rain < 0.3 ? smoothstep(0.4, 0.8, night) : 0;
    this.flyU.uAlpha.value += (on - this.flyU.uAlpha.value) * Math.min(1, dt * 0.5);
    this.flyU.uTime.value += dt;
    this.flies.visible = this.flyU.uAlpha.value > 0.01;
    if (!this.flies.visible) return;
    const w = this.world, a = this.flyAnchor, p = this.flyPos;
    for (let i = 0; i < FIREFLIES; i++) {
      // hors de vue ou au mauvais endroit : la luciole réapparaît ailleurs près du point visé
      if (Math.hypot(a[i * 3] - focus.x, a[i * 3 + 2] - focus.z) > 24 || a[i * 3 + 1] === 0) {
        for (let k = 0; k < 6; k++) {
          const x = focus.x + (Math.random() - 0.5) * 44, z = focus.z + (Math.random() - 0.5) * 44, cx = Math.floor(x), cz = Math.floor(z);
          if (!w.inCells(cx, cz)) continue;
          const ck = w.ci(cx, cz), b = w.biome[ck], g = w.hAt(x, z);
          if (w.occ[ck] || g < 0.15 || g > 4.5 || (b !== BIOME_TEMPERATE && b !== BIOME_MARSH && b !== BIOME_TROPICAL)) continue;
          a[i * 3] = x; a[i * 3 + 1] = g + 0.25 + Math.random() * 0.6; a[i * 3 + 2] = z;
          break;
        }
      }
      const ph = i * 1.37, t = this.t;
      p[i * 3] = a[i * 3] + Math.sin(t * 0.45 + ph) * 0.6;
      p[i * 3 + 1] = a[i * 3 + 1] + Math.sin(t * 0.7 + ph * 2) * 0.22;
      p[i * 3 + 2] = a[i * 3 + 2] + Math.cos(t * 0.38 + ph) * 0.6;
    }
    (this.flies.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Feuilles mortes en automne, pétales au printemps : elles tombent des feuillus proches en voletant, puis restent un peu au sol */
  private fallingLeaves(dt: number, season: number, frac: number, s: SeasonState, focus: THREE.Vector3) {
    const w = this.world;
    this.treeTimer -= dt;
    if (this.treeTimer <= 0) {
      this.treeTimer = 2;
      this.trees = [];
      const cx0 = Math.max(0, Math.floor(focus.x) - 22), cz0 = Math.max(0, Math.floor(focus.z) - 22);
      for (let cz = cz0; cz < Math.min(N, cz0 + 44); cz++)
        for (let cx = cx0; cx < Math.min(N, cx0 + 44); cx++) {
          const k = w.ci(cx, cz), b = w.biome[k];
          if (w.veg[k] === VEG_FOREST && (b === BIOME_TEMPERATE || b === BIOME_MARSH)) this.trees.push(k);
        }
    }
    const autumn = season === 2 && s.leaf > 0.35, spring = season === 0 && frac < 0.75;
    const rate = (autumn ? 34 : spring ? 18 : 0) * this.density;
    if (rate && this.trees.length) {
      for (let n = Math.floor(rate * dt + Math.random()); n > 0 && this.leafList.length < MAX_LEAVES; n--) {
        const k = this.trees[Math.floor(Math.random() * this.trees.length)], x = (k % N) + 0.15 + Math.random() * 0.7, z = Math.floor(k / N) + 0.15 + Math.random() * 0.7;
        const pal = autumn ? AUTUMN : PETALS;
        this.leafList.push({ x, y: w.hAt(x, z) + 0.55 + Math.random() * 0.7, z, vy: -(0.28 + Math.random() * 0.18), ph: Math.random() * 6.28, rx: Math.random() * 6, rz: Math.random() * 6, landed: -1, col: pal[Math.floor(Math.random() * pal.length)] });
      }
    }
    const d = this.dummy, m = this.leaves;
    let n = 0;
    for (let i = this.leafList.length - 1; i >= 0; i--) {
      const l = this.leafList[i];
      if (l.landed < 0) {
        l.x += (Math.sin(this.t * 2.2 + l.ph) * 0.35 + 0.12) * dt;
        l.z += (Math.cos(this.t * 1.7 + l.ph) * 0.25 + 0.05) * dt;
        l.y += l.vy * dt;
        l.rx += dt * 3.1; l.rz += dt * 2.3;
        const g = w.hAt(l.x, l.z);
        if (l.y <= g + 0.01) { l.y = g + 0.012; l.landed = 0; l.rx = -Math.PI / 2; l.rz = l.ph; }
      } else if ((l.landed += dt) > 6) { this.leafList.splice(i, 1); continue; }
      d.position.set(l.x, l.y, l.z);
      d.rotation.set(l.rx, l.ph, l.landed >= 0 ? 0 : l.rz);
      d.scale.setScalar(l.landed > 5 ? 6 - l.landed : 1);
      d.updateMatrix();
      m.setMatrixAt(n, d.matrix);
      m.setColorAt(n++, l.col);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Un poisson saute de temps en temps près du point visé ; ronds dans l'eau au départ et à l'arrivée */
  private jumpingFish(dt: number, s: SeasonState, focus: THREE.Vector3) {
    const w = this.world;
    this.fishTimer -= dt;
    if (this.fishTimer <= 0 && this.fishes.length < 4) {
      this.fishTimer = 1.2 + Math.random() * 2.8;
      for (let k = 0; k < 8; k++) {
        const x = focus.x + (Math.random() - 0.5) * 50, z = focus.z + (Math.random() - 0.5) * 50;
        if (x < 1 || z < 1 || x > N - 1 || z > N - 1 || w.hAt(x, z) > -0.45) continue;
        const a = Math.random() * Math.PI * 2;
        this.fishes.push({ x0: x, z0: z, dx: Math.cos(a) * 0.7, dz: Math.sin(a) * 0.7, t: 0, y: 0 });
        this.ripple(x, z);
        break;
      }
    }
    const d = this.dummy;
    let n = 0;
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      f.t += dt / 0.75;
      if (f.t >= 1) { this.ripple(f.x0 + f.dx, f.z0 + f.dz); this.onSplash?.(f.x0 + f.dx, f.z0 + f.dz); this.fishes.splice(i, 1); continue; }
      const y = Math.sin(Math.PI * f.t) * 0.45, vy = Math.cos(Math.PI * f.t) * 0.45 * Math.PI;
      d.position.set(f.x0 + f.dx * f.t, y - 0.02, f.z0 + f.dz * f.t);
      d.rotation.set(-Math.atan2(vy, 0.93), Math.atan2(f.dx, f.dz), 0, 'YXZ');
      d.scale.setScalar(1);
      d.updateMatrix();
      this.fishMesh.setMatrixAt(n++, d.matrix);
    }
    this.fishMesh.count = n;
    this.fishMesh.instanceMatrix.needsUpdate = true;
    for (let i = this.ringList.length - 1; i >= 0; i--) if ((this.ringList[i].t += dt) > 1.4) this.ringList.splice(i, 1);
    n = 0;
    for (const r of this.ringList) {
      d.position.set(r.x, 0.03, r.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.08 + r.t * 0.42);
      d.updateMatrix();
      this.rings.setMatrixAt(n, d.matrix);
      this.ringAlpha.setX(n++, 0.75 * (1 - r.t / 1.4));
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    this.ringAlpha.needsUpdate = true;
  }

  private ripple(x: number, z: number) {
    if (this.ringList.length < MAX_RINGS) this.ringList.push({ x, y: 0, z, t: 0 });
    for (let k = 0; k < 3; k++) this.puffs.spawn(x, 0.05, z, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, 0.05, 0.5, STEAM, 0, { grow: 0.5, drag: 3, wind: 0, alpha: 0.8 });
  }

  /** Nuée d'étourneaux au crépuscule : un nuage d'oiseaux qui s'étire, se replie et dérive au-dessus des champs */
  private duskFlock(dt: number, h: number, env: Environment, focus: THREE.Vector3) {
    const want = h > 17.6 && h < 20.4 && (env.weatherKind === 'clear' || env.weatherK < 0.3);
    if (want && !this.flockOn) {
      const a = Math.random() * Math.PI * 2, x = focus.x + Math.cos(a) * 12, z = focus.z + Math.sin(a) * 12;
      let top = 0;
      for (let dz = -8; dz <= 8; dz += 4) for (let dx = -8; dx <= 8; dx += 4) top = Math.max(top, this.world.hAt(x + dx, z + dz));
      this.flockCenter.set(x, top + 7, z);
    }
    this.flockOn = want;
    this.flockK = clamp(this.flockK + (want ? dt : -dt) * 0.25, 0, 1);
    this.flock.count = this.flockK > 0.01 ? FLOCK : 0;
    if (!this.flock.count) return;
    const T = this.t * 0.6, d = this.dummy, u = this.flockDir, c = this.flockCenter;
    const ax = 4 + 2 * Math.sin(T * 0.7), ay = 1.1 + 0.8 * Math.sin(T * 1.1 + 1), az = 2.4 + 1.5 * Math.cos(T * 0.9), rot = T * 0.35;
    const cr = Math.cos(rot), sr = Math.sin(rot), ox = 6 * Math.sin(T * 0.23), oz = 5 * Math.sin(T * 0.31);
    for (let i = 0; i < FLOCK; i++) {
      const ux = u[i * 4], uy = u[i * 4 + 1], uz = u[i * 4 + 2];
      const lx = ux * ax + 0.8 * Math.sin(T * 2 + uy * 3), ly = uy * ay + 0.5 * Math.sin(T * 1.7 + ux * 4), lz = uz * az + 0.8 * Math.cos(T * 1.5 + uz * 3);
      d.position.set(c.x + ox + lx * cr - lz * sr, c.y + ly, c.z + oz + lx * sr + lz * cr);
      d.rotation.set(0, rot + Math.PI / 2 + Math.sin(T + i) * 0.4, Math.sin(this.t * 14 + i) * 0.5);
      d.scale.setScalar(this.flockK * (0.9 + (i % 5) * 0.06));
      d.updateMatrix();
      this.flock.setMatrixAt(i, d.matrix);
    }
    this.flock.instanceMatrix.needsUpdate = true;
  }

  /** Autour de chaque volcan : fumerolles sur les flancs, et une ou deux vasques d'eau chaude turquoise sur les replats du pied */
  private buildVolcanic() {
    const w = this.world, geos: THREE.BufferGeometry[] = [];
    this.vents = [];
    const tint = (g: THREE.BufferGeometry, c: number) => {
      const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.toArray(a, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    for (let k = 0; k < N * N; k++) {
      if (w.veg[k] !== VEG_VOLCANO) continue;
      const f = w.volcanoFrame(k % N, Math.floor(k / N)), a0 = hash2(k % N, Math.floor(k / N), 401) * Math.PI * 2;
      // fumerolles : aux deux tiers de la hauteur du cône
      for (let i = 0; i < 4; i++) {
        const a = a0 + i * Math.PI / 2 + 0.4, target = f.foot + (f.rim - f.foot) * 0.6;
        for (let r = 1.5; r < f.r; r += 0.25) {
          const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r, y = w.hAt(x, z);
          if (y < target) { this.vents.push(x, y, z, 0); break; }
        }
      }
      // sources chaudes : replats au pied du cône, sur la terre ferme, loin des bâtiments, routes, forêts et décors
      let found = 0;
      for (let i = 0; i < 24 && found < 2; i++) {
        const a = a0 + i * 0.83, r = f.r * (0.95 + (i % 3) * 0.2), x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
        const cx = Math.floor(x), cz = Math.floor(z);
        if (!w.inCells(cx, cz)) continue;
        const ck = w.ci(cx, cz), y = w.hAt(x, z);
        if (w.occ[ck] || w.road[ck] || w.decor[ck] || w.veg[ck] === VEG_FOREST || y < 0.3) continue;
        // l'eau affleure au plus haut de la vasque (le cercle de pierres en cache les bords)
        let lo = y, hi = y;
        for (let q = 0; q < 8; q++) { const hy = w.hAt(x + Math.cos(q * 0.785) * 0.45, z + Math.sin(q * 0.785) * 0.45); lo = Math.min(lo, hy); hi = Math.max(hi, hy); }
        if (hi - lo > 0.16 || this.vents.some((v, vi) => vi % 4 === 0 && this.vents[vi + 3] === 1 && Math.hypot(v - x, this.vents[vi + 2] - z) < 3)) continue;
        geos.push(tint(new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2).translate(x, hi + 0.025, z), 0x5fd3d6));
        for (let q = 0; q < 8; q++) {
          const qa = q * 0.785 + hash2(cx, cz, q) * 0.4, qx = x + Math.cos(qa) * 0.5, qz = z + Math.sin(qa) * 0.5, s = 0.07 + hash2(cx, cz, q + 9) * 0.05;
          geos.push(tint(new THREE.DodecahedronGeometry(s, 0).translate(qx, w.hAt(qx, qz) + s * 0.4, qz), q % 2 ? 0xb7b0a6 : 0xd6cfc4));
        }
        this.vents.push(x, hi + 0.05, z, 1);
        found++;
      }
    }
    this.springs.geometry.dispose();
    this.springs.geometry = geos.length ? mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)))! : new THREE.BufferGeometry();
    for (const g of geos) g.dispose();
  }
}
