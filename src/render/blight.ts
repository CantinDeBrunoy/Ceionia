import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, SEA } from '../world/world';
import { Blight, blightAt } from '../world/blight';
import { hash2, mulberry32, smoothstep } from '../core/rng';

/** Cristaux au plus, braises et cendres au plus (en qualité haute ; moins en qualité réduite) */
const MAX_CRYSTALS = 48, EMBERS = 70, ASH = 24;
/** Rayons de fissures qui partent du portail */
const RAYS = 7;
/** Couleurs des cristaux : rouge rubis, violet */
const CRYSTAL_RED = new THREE.Color(1.0, 0.22, 0.3), CRYSTAL_VIOLET = new THREE.Color(0.62, 0.28, 1.0);

/**
 * La contamination de l'île du portail, à voir : fissures de lave qui rayonnent du portail (un ruban plat posé sur le sol,
 * cœur incandescent), cristaux rouges et violets qui poussent, braises et cendres qui montent doucement, brume rouge basse près
 * du portail ; autour de chaque défense, un anneau doré léger (le halo de purification). Les teintes du sol, de l'eau, les
 * arbres morts et l'obsidienne sont ailleurs (terrainView, vegetation). Coût maîtrisé : les maillages ne se refont que quand la
 * contamination change (défense posée, vague repoussée), les particules sont bornées et suivent la qualité ; pas de lumière
 */
export class BlightView {
  group = new THREE.Group();
  /** densité des particules (qualité graphique) et brume permise */
  density = 1;
  mist = true;
  private cracks: THREE.Mesh;
  private crackU = { uTime: { value: 0 }, uNight: { value: 0 }, uLevel: { value: 0 } };
  private crystals: THREE.InstancedMesh;
  private crystalU = { uGlow: { value: 0.4 } };
  private fog: THREE.Mesh;
  private fogU = { uTime: { value: 0 }, uNight: { value: 0 }, uLevel: { value: 0 } };
  private rings: THREE.Mesh;
  private ringU = { uTime: { value: 0 } };
  private embers: THREE.Points;
  private ash: THREE.Points;
  /** par particule : x, y, z de départ, âge (0 … 1) */
  private emberV = new Float32Array(EMBERS * 4);
  private ashV = new Float32Array(ASH * 4);
  private b: Blight | null = null;
  private key = '';
  private t = 0;

  constructor(private world: World) {
    // fissures : bord sombre, cœur de lave qui palpite et coule vers le large
    const cg = new THREE.BufferGeometry();
    this.cracks = new THREE.Mesh(cg, new THREE.ShaderMaterial({
      uniforms: this.crackU, vertexShader: CRACK_VS, fragmentShader: CRACK_FS, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    this.cracks.renderOrder = 1;
    // cristaux : trois aiguilles taillées par grappe, qui luisent de leur propre couleur (plus fort la nuit)
    const needle = (h: number, r: number, tx: number, tz: number, x: number, z: number) => {
      const g = new THREE.OctahedronGeometry(r, 0);
      g.scale(1, h / r / 2, 1);
      g.translate(0, h * 0.42, 0);
      g.rotateX(tx); g.rotateZ(tz);
      return g.translate(x, 0, z);
    };
    const geo = mergeGeometries([needle(0.42, 0.07, 0, 0, 0, 0), needle(0.28, 0.055, 0.35, -0.3, 0.06, 0.03), needle(0.22, 0.05, -0.3, 0.4, -0.06, -0.02)].map((g) => g.toNonIndexed()));
    geo.computeVertexNormals();
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1, flatShading: true });
    cm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.crystalU);
      sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uGlow;');
    };
    this.crystals = new THREE.InstancedMesh(geo, cm, MAX_CRYSTALS);
    this.crystals.count = 0;
    this.crystals.castShadow = true;
    this.crystals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CRYSTALS * 3), 3);
    // brume rouge basse : deux voiles qui épousent le sol autour du portail
    this.fog = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: this.fogU, vertexShader: FOG_VS, fragmentShader: FOG_FS, transparent: true, depthWrite: false }));
    this.fog.renderOrder = 4;
    // anneaux dorés des halos de purification
    this.rings = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      uniforms: this.ringU, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    this.rings.renderOrder = 1;
    // braises (lumineuses) et cendres (grises) qui montent
    const pts = (n: number, m: THREE.PointsMaterial) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-50), 3));
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      return p;
    };
    this.embers = pts(EMBERS, new THREE.PointsMaterial({ color: new THREE.Color(2, 0.7, 0.25), size: 0.075, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ash = pts(ASH, new THREE.PointsMaterial({ color: 0x5a5058, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false }));
    // (pas encore nées : cachées jusqu'à leur premier envol)
    for (let i = 0; i < EMBERS; i++) { this.emberV[i * 4 + 1] = -100; this.emberV[i * 4 + 3] = Math.random(); }
    for (let i = 0; i < ASH; i++) { this.ashV[i * 4 + 1] = -100; this.ashV[i * 4 + 3] = Math.random(); }
    for (const m of [this.cracks, this.crystals, this.fog, this.rings]) m.frustumCulled = false;
    this.group.add(this.cracks, this.crystals, this.fog, this.rings, this.embers, this.ash);
    this.group.visible = false;
  }

  /** La contamination à montrer (null : pas d'île) ; ne refait les maillages que si elle a changé (ou le relief, ou la qualité) */
  set(b: Blight | null) {
    this.b = b;
    const w = this.world, key = b ? `${b.key}|${w.visVersion}|${Math.round(this.density * 10)}` : '';
    if (key === this.key) return;
    this.key = key;
    this.group.visible = !!b && b.level > 0;
    if (!b) return;
    this.buildCracks(b);
    this.buildCrystals(b);
    this.buildFog(b);
    this.buildRings(b);
  }

  /** Un pas : lave qui palpite, cristaux et braises plus vifs la nuit ; rien à animer quand l'île est loin de la caméra */
  update(dt: number, night: number, target: THREE.Vector3, camDist: number) {
    const b = this.b;
    if (!b || !this.group.visible) return;
    this.t += dt;
    const near = Math.hypot(target.x - b.x, target.z - b.z) < 45 + camDist * 0.8;
    this.crackU.uTime.value = this.fogU.uTime.value = this.ringU.uTime.value = this.t;
    this.crackU.uNight.value = this.fogU.uNight.value = night;
    this.crackU.uLevel.value = this.fogU.uLevel.value = b.level;
    this.crystalU.uGlow.value = 0.3 + night * 0.9 + 0.08 * Math.sin(this.t * 1.7);
    this.fog.visible = this.mist && b.level > 0.2;
    this.embers.visible = this.ash.visible = near;
    if (near) this.stepParticles(dt, b);
  }

  /** Les fissures : quelques rayons qui partent du dallage du portail en zigzag, avec des branches ; coupés par les halos */
  private buildCracks(b: Blight) {
    const w = this.world, rnd = mulberry32(b.x * 7919 + b.z * 104729 + 17);
    const pos: number[] = [], heat: number[] = [], side: number[] = [], dist: number[] = [];
    const y = (x: number, z: number) => w.hAt(x, z) + 0.025;
    const ray = (x: number, z: number, a: number, L: number, w0: number, depth: number) => {
      const step = 0.3, n = Math.max(2, Math.floor(L / step));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        // le zigzag, rappelé vers la direction qui s'éloigne du portail
        const out = Math.atan2(z - b.z, x - b.x);
        a += (rnd() - 0.5) * 0.7;
        a += Math.atan2(Math.sin(out - a), Math.cos(out - a)) * 0.25;
        const nx = x + Math.cos(a) * step, nz = z + Math.sin(a) * step;
        // la fissure s'arrête où la contamination faiblit (lisière, halo d'une défense), au rivage, contre un bâtiment
        const mx = (x + nx) / 2, mz = (z + nz) / 2, ci = Math.floor(mx), cj = Math.floor(mz);
        if (blightAt(b, mx, mz) < 0.14 || w.hAt(mx, mz) < SEA + 0.08 || !w.inCells(ci, cj) || w.occ[w.ci(ci, cj)] || w.road[w.ci(ci, cj)]) return;
        const wa = w0 * (1 - t0 * 0.8), wb = w0 * (1 - t1 * 0.8), px = -Math.sin(a), pz = Math.cos(a);
        const d0 = Math.hypot(x - b.x, z - b.z), d1 = Math.hypot(nx - b.x, nz - b.z);
        const h0 = (1 - t0) * (depth ? 0.6 : 1), h1 = (1 - t1) * (depth ? 0.6 : 1);
        const quad: [number, number, number, number, number][] = [
          [x - px * wa, z - pz * wa, -1, h0, d0], [x + px * wa, z + pz * wa, 1, h0, d0], [nx + px * wb, nz + pz * wb, 1, h1, d1],
          [x - px * wa, z - pz * wa, -1, h0, d0], [nx + px * wb, nz + pz * wb, 1, h1, d1], [nx - px * wb, nz - pz * wb, -1, h1, d1],
        ];
        for (const [qx, qz, s, h, d] of quad) { pos.push(qx, y(qx, qz), qz); side.push(s); heat.push(h); dist.push(d); }
        // une branche, parfois
        if (!depth && i > 1 && rnd() < 0.12) ray(nx, nz, a + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.4), L * (1 - t1) * 0.5, wb * 0.7, depth + 1);
        x = nx; z = nz;
      }
    };
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2 + (rnd() - 0.5) * 0.6, L = b.radius * (0.6 + rnd() * 0.35);
      ray(b.x + Math.cos(a) * 1.4, b.z + Math.sin(a) * 1.4, a, L, 0.11 + rnd() * 0.05, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aHeat', new THREE.Float32BufferAttribute(heat, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    this.cracks.geometry.dispose();
    this.cracks.geometry = g;
  }

  /** Les cristaux : en grappes sur les cases les plus contaminées (ni sur un bâtiment, ni sur le portail, ni dans l'eau) */
  private buildCrystals(b: Blight) {
    const w = this.world, m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
    const cap = Math.round(MAX_CRYSTALS * Math.max(0.35, this.density)), R = Math.ceil(b.r + 2);
    let n = 0;
    for (let cz = b.z - R; cz < b.z + R && n < cap; cz++)
      for (let cx = b.x - R; cx < b.x + R && n < cap; cx++) {
        if (!w.inCells(cx, cz) || w.inPortal(cx, cz)) continue;
        const k = w.ci(cx, cz), bk = blightAt(b, cx + 0.5, cz + 0.5);
        if (bk < 0.38 || w.occ[k] || w.road[k] || w.cellAvg(cx, cz) < 0.2 || hash2(cx, cz, 7201) > 0.06 + bk * 0.1) continue;
        const x = cx + 0.2 + hash2(cx, cz, 7203) * 0.6, z = cz + 0.2 + hash2(cx, cz, 7205) * 0.6;
        const sc = (0.7 + hash2(cx, cz, 7207) * 0.7) * (0.6 + 0.6 * bk);
        e.set((hash2(cx, cz, 7209) - 0.5) * 0.3, hash2(cx, cz, 7211) * 6.28, (hash2(cx, cz, 7213) - 0.5) * 0.3);
        m.compose(s.set(x, w.hAt(x, z) - 0.03, z), q.setFromEuler(e), new THREE.Vector3(sc, sc, sc));
        this.crystals.setMatrixAt(n, m);
        this.crystals.setColorAt(n, (hash2(cx, cz, 7215) < 0.5 ? CRYSTAL_RED : CRYSTAL_VIOLET).clone().multiplyScalar(0.85 + hash2(cx, cz, 7217) * 0.3));
        n++;
      }
    this.crystals.count = n;
    this.crystals.instanceMatrix.needsUpdate = true;
    if (this.crystals.instanceColor) this.crystals.instanceColor.needsUpdate = true;
  }

  /** La brume rouge : deux voiles en disque autour du portail, posés sur le relief */
  private buildFog(b: Blight) {
    const w = this.world, Rm = Math.min(7, b.radius * 0.75), RINGS = 7, SEG = 36;
    const pos: number[] = [], rel: number[] = [], idx: number[] = [];
    for (const lift of [0.12, 0.34]) {
      const base = pos.length / 3;
      pos.push(b.x, w.hAt(b.x, b.z) + lift + 0.6, b.z); rel.push(0);
      for (let r = 1; r <= RINGS; r++)
        for (let s = 0; s < SEG; s++) {
          const a = (s / SEG) * Math.PI * 2, d = (r / RINGS) * Rm, x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
          pos.push(x, Math.max(SEA, w.hAt(x, z)) + lift, z); rel.push(r / RINGS);
        }
      for (let s = 0; s < SEG; s++) idx.push(base, base + 1 + ((s + 1) % SEG), base + 1 + s);
      for (let r = 1; r < RINGS; r++)
        for (let s = 0; s < SEG; s++) {
          const a = base + 1 + (r - 1) * SEG + s, a2 = base + 1 + (r - 1) * SEG + ((s + 1) % SEG), c = a + SEG, c2 = a2 + SEG;
          idx.push(a, a2, c, a2, c2, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aRel', new THREE.Float32BufferAttribute(rel, 1));
    g.setIndex(idx);
    this.fog.geometry.dispose();
    this.fog.geometry = g;
  }

  /** Les anneaux dorés autour des défenses de l'île */
  private buildRings(b: Blight) {
    const w = this.world, SEG = 48, pos: number[] = [], ang: number[] = [];
    for (const [hx, hz, hr] of b.halos) {
      const r = hr * 0.82, wd = 0.06;
      for (let s = 0; s < SEG; s++) {
        const a0 = (s / SEG) * Math.PI * 2, a1 = ((s + 1) / SEG) * Math.PI * 2;
        const p = (a: number, rr: number) => { const x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr; pos.push(x, Math.max(SEA, w.hAt(x, z)) + 0.035, z); ang.push(a); };
        p(a0, r - wd); p(a0, r + wd); p(a1, r + wd);
        p(a0, r - wd); p(a1, r + wd); p(a1, r - wd);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
    this.rings.geometry.dispose();
    this.rings.geometry = g;
  }

  /** Braises qui montent en tournoyant depuis le sol contaminé, cendres qui flottent plus lentement */
  private stepParticles(dt: number, b: Blight) {
    const w = this.world, on = Math.min(1, b.level * 1.2) * this.density;
    const spawn = (v: Float32Array, i: number, spread: number) => {
      // près du portail surtout (le tirage au carré resserre)
      const a = Math.random() * Math.PI * 2, d = 1.2 + Math.random() * Math.random() * b.radius * spread;
      const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
      v[i * 4] = x; v[i * 4 + 1] = w.hAt(x, z) + 0.05; v[i * 4 + 2] = z;
    };
    const run = (pts: THREE.Points, v: Float32Array, n: number, speed: number, rise: number, spread: number) => {
      const p = pts.geometry.attributes.position as THREE.BufferAttribute, live = Math.round(n * on);
      for (let i = 0; i < n; i++) {
        let life = v[i * 4 + 3] + dt * speed * (0.7 + hash2(i, 5, 81) * 0.6);
        if (life >= 1) { life = 0; spawn(v, i, spread); }
        v[i * 4 + 3] = life;
        if (i >= live || v[i * 4 + 1] < -10) { p.setXYZ(i, 0, -50, 0); continue; }
        const sw = Math.sin(life * 7 + i) * 0.15 * life;
        p.setXYZ(i, v[i * 4] + sw, v[i * 4 + 1] + life * rise, v[i * 4 + 2] + Math.cos(life * 5 + i) * 0.15 * life);
      }
      p.needsUpdate = true;
    };
    run(this.embers, this.emberV, EMBERS, 0.32, 2.2, 0.8);
    run(this.ash, this.ashV, ASH, 0.16, 1.6, 0.9);
    (this.embers.material as THREE.PointsMaterial).opacity = 0.5 + 0.45 * smoothstep(0.2, 0.8, b.level);
  }
}

const CRACK_VS = /* glsl */ `
attribute float aHeat;
attribute float aSide;
attribute float aDist;
varying float vHeat;
varying float vSide;
varying float vDist;
void main() {
  vHeat = aHeat; vSide = aSide; vDist = aDist;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Bord sombre de la fissure, cœur de lave orangée (jaune au plus chaud) qui palpite en coulant vers le large ; vive la nuit */
const CRACK_FS = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uLevel;
varying float vHeat;
varying float vSide;
varying float vDist;
void main() {
  float s = abs(vSide);
  float core = 1.0 - smoothstep(0.05, 0.6, s);
  float pulse = 0.7 + 0.3 * sin(vDist * 3.2 - uTime * 2.2);
  vec3 hot = mix(vec3(0.95, 0.2, 0.05), vec3(1.0, 0.72, 0.22), core * vHeat * pulse);
  float k = (0.55 + 0.45 * vHeat) * pulse * (1.0 + uNight * 1.3) * (0.5 + 0.5 * uLevel);
  vec3 c = mix(vec3(0.09, 0.03, 0.04), hot * k * 1.5, core);
  float a = (1.0 - smoothstep(0.75, 1.0, s)) * (0.45 + 0.55 * vHeat) * min(1.0, 0.35 + uLevel);
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FOG_VS = /* glsl */ `
attribute float aRel;
varying float vRel;
varying vec2 vXZ;
void main() {
  vRel = aRel; vXZ = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Brume rouge-rose qui dérive, plus dense près du portail ; elle s'éclaire la nuit */
const FOG_FS = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uLevel;
varying float vRel;
varying vec2 vXZ;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float n = n2(vXZ * 0.7 + vec2(uTime * 0.12, uTime * 0.07)) * 0.6 + n2(vXZ * 1.6 - vec2(uTime * 0.09, -uTime * 0.05)) * 0.4;
  float fall = pow(1.0 - vRel, 1.3);
  vec3 c = mix(vec3(0.75, 0.3, 0.38), vec3(1.0, 0.3, 0.2), uNight);
  float a = uLevel * 0.3 * fall * smoothstep(0.25, 0.8, n) * (1.0 + uNight * 0.4);
  gl_FragColor = vec4(c * (1.0 + uNight * 0.6), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const RING_VS = /* glsl */ `
attribute float aAng;
varying float vAng;
void main() {
  vAng = aAng;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Anneau doré léger, parcouru de reflets qui tournent */
const RING_FS = /* glsl */ `
uniform float uTime;
varying float vAng;
void main() {
  float sh = 0.6 + 0.4 * sin(vAng * 3.0 - uTime * 1.4);
  gl_FragColor = vec4(vec3(1.0, 0.8, 0.36) * sh * 0.55, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
