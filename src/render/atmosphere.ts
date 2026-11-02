import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, VR, VS, BIOME_TAIGA, VEG_VOLCANO } from '../world/world';
import { GameTime } from '../core/time';
import { clamp, lerp, mulberry32, smoothstep } from '../core/rng';
import { Environment } from './env';
import { SeasonState } from './season';
import { AudioEngine } from '../audio/audio';

const MIST_DAY = new THREE.Color(0xf4f7fa), MIST_NIGHT = new THREE.Color(0x4e5a78), MIST_DAWN = new THREE.Color(0xffe4d4);
/** Brume : densité, hauteur de son dessus (au-dessus de la mer), épaisseur du fondu sous le dessus, temps (dérive) */
const MIST = { x: 0, y: 2.1, z: 0.9, w: 0 };
/** couleur de la brume (espace de travail, convertie dans le shader) et taille de la carte (la brume s'efface au bord) */
const MIST_COL = { x: 1, y: 1, z: 1, w: 192 };

/**
 * Brume au ras du sol, calculée dans tous les matériaux qui reçoivent le brouillard : épaisse au fond des vallées et sur
 * l'eau, elle s'éclaircit vers le haut selon l'épaisseur traversée par le regard ; son dessus ondule et dérive, les toits et
 * les cimes en sortent doucement (aucun plan ne coupe les maisons). Uniformes partagés : des objets simples, que three ne
 * recopie pas d'un matériau à l'autre
 */
function patchMist() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex += `
#ifdef USE_FOG
  varying vec3 vMistW;
#endif
`;
  C.fog_vertex += `
#ifdef USE_FOG
  vMistW = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`;
  C.fog_pars_fragment += `
#ifdef USE_FOG
  varying vec3 vMistW;
  uniform vec4 uMist;
  uniform vec4 uMistColor;
  float mistHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float mistNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), f.x), mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
#endif
`;
  C.fog_fragment = `
#ifdef USE_FOG
  if (uMist.x > 0.003) {
    vec2 mq = vMistW.xz;
    float mn = mistNoise(mq * 0.06 + uMist.w * vec2(0.03, 0.017)) * 0.7 + mistNoise(mq * 0.17 - uMist.w * vec2(0.045, 0.02)) * 0.3;
    float mh = uMist.y + (mn - 0.5) * 1.2 - vMistW.y;
    if (mh > 0.0) {
      vec3 toCam = cameraPosition - vMistW;
      float path = min(8.0, length(toCam) * (toCam.y > mh ? mh / toCam.y : 1.0));
      float edge = smoothstep(0.0, 6.0, min(min(mq.x, mq.y), min(uMistColor.w - mq.x, uMistColor.w - mq.y)));
      // nappe laiteuse : vite opaque là où elle est épaisse (on n'y voit plus les ombres du sol), transparente sur ses bords
      float m = 1.0 - exp(-path * uMist.x * smoothstep(0.0, uMist.z, mh) * (0.55 + 0.45 * mn) * 1.6);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uMistColor.rgb, 1.0)).rgb, m * edge * 0.9);
    }
  }
#endif
` + C.fog_fragment;
  const u = { uMist: { value: MIST }, uMistColor: { value: MIST_COL } };
  Object.assign(THREE.UniformsLib.fog, u);
  for (const lib of Object.values(THREE.ShaderLib)) if (lib.uniforms.fogColor) Object.assign(lib.uniforms, u);
}
patchMist();
/** Nuages accrochés aux sommets : bouffées par pic */
const CAP_PUFFS = 7;
/** Distance des rideaux d'aurore à la caméra */
const AURORA_R = 260;

/**
 * Atmosphère : brume du matin qui stagne dans les creux, nuages accrochés aux plus hauts sommets, arc-en-ciel après la pluie,
 * orages (éclairs, illumination, tonnerre) et aurores boréales les nuits d'hiver
 */
export class Atmosphere {
  group = new THREE.Group();
  /** la foudre tombe en (x, z) */
  onStrike: ((x: number, z: number) => void) | null = null;
  /** densité de la brume, qui suit lentement l'heure, la saison et le temps */
  private mistK = 0;
  /** brume dissipée à la demande : secondes avant qu'elle puisse revenir */
  private calm = 0;
  /** brume affichée (coupée en qualité réduite) */
  mistEnabled = true;
  private caps: THREE.InstancedMesh;
  private capMat: THREE.MeshStandardMaterial;
  private peaks: { x: number; y: number; z: number }[] = [];
  private builtVis = -1;
  private bow: THREE.Mesh;
  private bowU = { uAlpha: { value: 0 } };
  private bowT = 0;
  private wasRaining = false;
  private aurora: THREE.Mesh;
  private auroraU = { uTime: { value: 0 }, uAlpha: { value: 0 } };
  private auroraTonight = false;
  private wasNight = false;
  private taiga = 0;
  private bolt: THREE.Mesh;
  private boltT = 0;
  private flashT = 0;
  private nextBolt = 6;
  private storm = false;
  private rainState = false;
  private rnd = mulberry32(Date.now() & 0xffff);
  private dummy = new THREE.Object3D();
  private mistColor = new THREE.Color();
  private t = 0;

  constructor(private world: World, private audio: AudioEngine) {
    MIST_COL.w = N;
    // ---- nuages accrochés aux sommets
    this.capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false, emissive: 0xffffff, emissiveIntensity: 0 });
    this.caps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.capMat, 24 * CAP_PUFFS);
    this.caps.count = 0;
    this.caps.frustumCulled = false;
    this.caps.renderOrder = 4;
    // ---- arc-en-ciel : demi-anneau aux couleurs du spectre, rouge à l'extérieur
    const bm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, uniforms: this.bowU,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uAlpha; varying vec2 vP;
vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main(){ float t = (length(vP) - 0.9) / 0.1; float a = uAlpha * sin(clamp(t, 0.0, 1.0) * 3.14159) * smoothstep(0.0, 0.25, vP.y);
  gl_FragColor = vec4(hue(0.78 * (1.0 - t)), a * 0.3); }`,
    });
    this.bow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96, 1, 0, Math.PI), bm);
    this.bow.visible = false;
    this.bow.renderOrder = -5;
    // ---- aurores : deux rideaux courbes au-dessus de l'horizon, face à la caméra (hauteur unité, étirée à chaque image)
    const ag: THREE.BufferGeometry[] = [];
    for (const [k, r] of [[0, AURORA_R], [1, AURORA_R * 0.9]] as const) {
      const g = new THREE.PlaneGeometry(1, 1, 90, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i) + 0.5, a = -Math.PI / 2 + u * (1.7 - k * 0.4) + (k - 0.5) * 0.3;
        p.setXYZ(i, Math.cos(a) * r, k * 0.08 + v * (1 - k * 0.2), Math.sin(a) * r);
      }
      g.setAttribute('aCurtain', new THREE.Float32BufferAttribute(new Array(p.count).fill(k), 1));
      ag.push(g);
    }
    this.aurora = new THREE.Mesh(mergeGeometries(ag)!, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: this.auroraU,
      vertexShader: 'attribute float aCurtain; varying vec2 vA; varying float vK; void main(){ vA = uv; vK = aCurtain; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uAlpha; varying vec2 vA; varying float vK;
void main(){
  float x = vA.x * 9.0 + vK * 3.0;
  float band = pow(0.5 + 0.5 * sin(x * 6.0 + sin(x * 1.3 + uTime * 0.25) * 3.0 + uTime * 0.35), 3.0);
  float fold = 0.6 + 0.4 * sin(x * 2.1 - uTime * 0.2);
  float y = vA.y;
  float a = uAlpha * (0.25 + band) * fold * smoothstep(0.0, 0.1, y) * pow(1.0 - y, 1.2) * smoothstep(0.0, 0.08, vA.x) * smoothstep(1.0, 0.92, vA.x);
  vec3 c = mix(vec3(0.2, 1.0, 0.6), vec3(0.7, 0.35, 1.0), smoothstep(0.35, 1.0, y)) * 1.3;
  gl_FragColor = vec4(c, min(1.0, a));
}`,
    }));
    this.aurora.frustumCulled = false;
    this.aurora.renderOrder = -8;
    this.aurora.visible = false;
    // ---- éclair : ruban de lumière remplacé à chaque coup
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.5, 3), fog: false }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    this.group.add(this.caps, this.bow, this.aurora, this.bolt);
  }

  /** Sous terre : pas de brume */
  hideMist() { MIST.x = 0; }

  /** Épaisseur de la nappe de brume (0 … 1) */
  get mist() { return this.mistEnabled ? this.mistK : 0; }

  /** Dissipe la nappe de brume ; elle ne se reforme pas avant `seconds` secondes */
  dispel(seconds: number) { this.calm = seconds; }

  update(dt: number, time: GameTime, s: SeasonState, env: Environment, camera: THREE.Camera, focus: THREE.Vector3) {
    const w = this.world, h = time.hour, season = time.season;
    this.t += dt;
    if (w.visVersion !== this.builtVis) { this.builtVis = w.visVersion; this.findPeaks(); }
    const overcast = env.weatherKind === 'clear' ? 0 : env.weatherK;
    const fog = env.weatherKind === 'fog' ? env.weatherK : 0, rain = env.rainK;

    // ---- brume : à l'aube surtout, plus en automne, avec le brouillard ; la pluie la disperse
    const dawn = smoothstep(3.5, 6, h) * (1 - smoothstep(8.5, 11, h));
    const dusk = smoothstep(18.5, 22, h) * 0.45 + (h < 4 || h > 22 ? 0.3 : 0);
    // plus légère qu'avant : un voile au lever du jour, qui ne noie plus le village chaque matin
    const seasonK = [0.6, 0.3, 0.8, 0.45][season];
    this.calm = Math.max(0, this.calm - dt);
    const density = this.calm > 0 ? 0 : clamp((dawn + dusk) * seasonK + fog * 0.45, 0, 1) * (1 - rain * 0.6) * (1 - fog * 0.35);
    this.mistK += (density - this.mistK) * Math.min(1, dt * (this.calm > 0 ? 1.2 : 0.3));
    MIST.x = this.mistEnabled ? this.mistK : 0;
    // par temps de brouillard, la nappe monte et noie les collines basses
    MIST.y = 2.1 + fog * 0.6;
    MIST.w = (MIST.w + dt) % 4000;
    const tw = clamp(1 - Math.abs(env.daylight - 0.5) * 2.5, 0, 1);
    // la brume diffuse la lumière : claire dès l'aube, bleutée la nuit, rosée au lever et au coucher
    const c = this.mistColor.copy(MIST_NIGHT).lerp(MIST_DAY, smoothstep(0.05, 0.55, env.daylight)).lerp(MIST_DAWN, tw * 0.5);
    MIST_COL.x = c.r; MIST_COL.y = c.g; MIST_COL.z = c.b;

    // ---- nuages des sommets : toujours un peu, épais par temps couvert et au petit matin
    // nuages cotonneux : presque opaques, éclairés aussi par en dessous (pas de bulles translucides)
    this.capMat.opacity = clamp(0.72 + overcast * 0.2 + fog * 0.1, 0, 0.94);
    this.capMat.color.setScalar(0.35 + 0.65 * env.daylight);
    this.capMat.emissiveIntensity = 0.28 * env.daylight;
    this.caps.visible = true;
    const d = this.dummy;
    let n = 0;
    for (const [pi, p] of this.peaks.entries()) {
      for (let i = 0; i < CAP_PUFFS; i++) {
        const a = (i / CAP_PUFFS) * Math.PI * 2 + this.t * (0.03 + (pi % 3) * 0.01) + pi;
        const r = 1.3 + ((i * 7 + pi) % 5) * 0.35;
        d.position.set(p.x + Math.cos(a) * r, p.y - 1.4 + Math.sin(this.t * 0.2 + i) * 0.25 + (i % 3) * 0.35, p.z + Math.sin(a) * r * 0.8);
        d.rotation.set(i, a, 0);
        d.scale.set(1.3 + (i % 3) * 0.3, 0.55 + (i % 2) * 0.15, 1 + (i % 4) * 0.2);
        d.updateMatrix();
        this.caps.setMatrixAt(n++, d.matrix);
      }
    }
    this.caps.count = n;
    this.caps.instanceMatrix.needsUpdate = true;

    // ---- arc-en-ciel : quand la pluie cesse et que le soleil revient
    if (env.weatherKind === 'rain' && env.weatherK > 0.5) this.wasRaining = true;
    else if (this.wasRaining && env.wantKind !== 'rain' && env.daylight > 0.6 && h > 7 && h < 17.5) { this.wasRaining = false; this.bowT = 45; }
    else if (env.weatherKind !== 'rain') this.wasRaining = false;
    this.bowT = Math.max(0, this.bowT - dt);
    const bowA = smoothstep(0, 8, this.bowT) * smoothstep(45, 40, this.bowT) * env.daylight;
    this.bow.visible = false;
    if (bowA > 0.01) {
      this.bowU.uAlpha.value = bowA;
      // au loin dans l'axe de la vue, son sommet dans le haut de l'image (la vue plongeante montre peu de ciel)
      const cp = camera.position, fwd = new THREE.Vector3(focus.x - cp.x, 0, focus.z - cp.z).normalize(), D = 130;
      const down = Math.asin(clamp((cp.y - focus.y) / Math.max(1e-3, cp.distanceTo(focus)), -1, 1));
      const half = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2), R = D * 0.62;
      const apex = cp.y + Math.tan(half * 0.55 - down) * D;
      this.bow.visible = apex > 4;
      this.bow.position.set(cp.x + fwd.x * D, apex - R, cp.z + fwd.z * D);
      this.bow.scale.setScalar(R);
      this.bow.lookAt(cp.x, apex - R, cp.z);
    }

    // ---- aurores : nuits d'hiver, ou de temps en temps sur une carte froide
    if (this.taiga === 0) { let t = 0; for (let k = 0; k < N * N; k++) if (w.biome[k] === BIOME_TAIGA) t++; this.taiga = t / (N * N) + 1e-6; }
    const isNight = env.night > 0.6;
    if (isNight && !this.wasNight) this.auroraTonight = season === 3 ? this.rnd() < 0.8 : this.taiga > 0.12 && season !== 1 && this.rnd() < 0.3;
    this.wasNight = isNight;
    const aurA = (this.auroraTonight ? smoothstep(0.6, 0.9, env.night) : 0) * (1 - overcast);
    this.auroraU.uAlpha.value += (aurA - this.auroraU.uAlpha.value) * Math.min(1, dt * 0.4);
    this.auroraU.uTime.value += dt;
    this.aurora.visible = false;
    if (this.auroraU.uAlpha.value > 0.01) {
      // la vue plongeante ne montre qu'une bande de ciel : les rideaux montent de l'horizon jusqu'au haut de l'image
      const cp = camera.position, fwd = new THREE.Vector3(focus.x - cp.x, 0, focus.z - cp.z).normalize();
      const down = Math.asin(clamp((cp.y - focus.y) / Math.max(1e-3, cp.distanceTo(focus)), -1, 1));
      const half = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2), sky = half - down;
      this.aurora.visible = sky > 0.01;
      this.aurora.position.set(cp.x, cp.y - AURORA_R * 0.01, cp.z);
      this.aurora.rotation.y = Math.atan2(-fwd.x, -fwd.z);
      this.aurora.scale.set(1, Math.max(45, Math.tan(sky) * AURORA_R * 1.3), 1);
    }

    // ---- orages : certaines averses tournent à l'orage (plus souvent l'été)
    const raining = env.weatherKind === 'rain';
    if (raining && !this.rainState) this.storm = season !== 3 && this.rnd() < (season === 1 ? 0.6 : 0.35);
    this.rainState = raining;
    if (this.storm && rain > 0.75) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.nextBolt = 4 + this.rnd() * 9; this.strike(focus); }
    }
    this.boltT = Math.max(0, this.boltT - dt);
    this.bolt.visible = this.boltT > 0 && (this.boltT > 0.18 || this.boltT % 0.08 > 0.04);
    this.flashT = Math.max(0, this.flashT - dt);
    // illumination : deux éclats rapprochés
    const f = this.flashT > 0 ? (this.flashT > 0.25 ? 1 : this.flashT > 0.15 ? 0.25 : 0.7) * (this.flashT / 0.4) : 0;
    if (f > 0) {
      env.hemi.intensity += f * 3;
      env.skyMat.uniforms.top.value.lerp(new THREE.Color(0xd8def5), f * 0.6);
      env.skyMat.uniforms.hz.value.lerp(new THREE.Color(0xeef0ff), f * 0.6);
    }
  }

  /** Coup de foudre près du point visé : zigzag de la nue au sol, éclat, puis tonnerre selon la distance */
  private strike(focus: THREE.Vector3) {
    const w = this.world, a = this.rnd() * Math.PI * 2, dist = 12 + this.rnd() * 40;
    let gx = clamp(focus.x + Math.cos(a) * dist, 1, N - 1), gz = clamp(focus.z + Math.sin(a) * dist, 1, N - 1);
    // la foudre frappe volontiers ce qui dépasse : un bâtiment proche du point d'impact attire l'éclair
    for (const b of w.buildings.values()) if (b.kind !== 'lamp' && Math.hypot(b.x + 0.5 - gx, b.z + 0.5 - gz) < 2.5 && this.rnd() < 0.5) { gx = b.x + 0.5; gz = b.z + 0.5; break; }
    const gy = Math.max(0, w.hAt(gx, gz));
    const pts: THREE.Vector3[] = [];
    let x = gx + (this.rnd() - 0.5) * 8, z = gz + (this.rnd() - 0.5) * 8;
    const top = 42;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      x = lerp(x, gx, 0.25) + (this.rnd() - 0.5) * 2.2 * (1 - t);
      z = lerp(z, gz, 0.25) + (this.rnd() - 0.5) * 2.2 * (1 - t);
      pts.push(new THREE.Vector3(i === 12 ? gx : x, lerp(top, gy, t), i === 12 ? gz : z));
    }
    const geos: THREE.BufferGeometry[] = [];
    const seg = (p: THREE.Vector3, q: THREE.Vector3, r: number) => {
      const len = p.distanceTo(q), g = new THREE.CylinderGeometry(r, r, len, 4, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize()));
      g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      geos.push(g);
    };
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], 0.12);
    // deux ramifications
    for (const b of [3, 6]) {
      let p = pts[b];
      for (let k = 0; k < 3; k++) {
        const q = p.clone().add(new THREE.Vector3((this.rnd() - 0.5) * 3, -2.5 - this.rnd() * 2, (this.rnd() - 0.5) * 3));
        seg(p, q, 0.06); p = q;
      }
    }
    this.bolt.geometry.dispose();
    this.bolt.geometry = mergeGeometries(geos)!;
    for (const g of geos) g.dispose();
    this.boltT = 0.32;
    this.flashT = 0.4;
    this.audio.sfxThunder(Math.hypot(gx - focus.x, gz - focus.z) * 0.035, 1 - Math.min(1, dist / 60) * 0.5);
    this.onStrike?.(gx, gz);
  }

  /** Plus hauts sommets (maxima locaux du relief affiché, espacés) : ils retiennent les nuages */
  private findPeaks() {
    const w = this.world, vis = w.vis, cand: number[] = [];
    // les volcans ont leur propre panache
    const volcanoes: { x: number; z: number; r: number }[] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) volcanoes.push(w.volcanoFrame(k % N, Math.floor(k / N)));
    for (let z = 4; z < VS - 4; z += 2)
      for (let x = 4; x < VS - 4; x += 2) {
        const i = z * VS + x, h = vis[i];
        if (h < 7 || volcanoes.some((v) => Math.hypot(x / VR - v.x, z / VR - v.z) < v.r)) continue;
        let top = true;
        for (let dz = -4; dz <= 4 && top; dz += 2) for (let dx = -4; dx <= 4; dx += 2) if (vis[i + dz * VS + dx] > h) { top = false; break; }
        if (top) cand.push(i);
      }
    cand.sort((a, b) => vis[b] - vis[a]);
    this.peaks = [];
    for (const i of cand) {
      const x = (i % VS) / VR, z = Math.floor(i / VS) / VR;
      if (this.peaks.some((p) => Math.hypot(p.x - x, p.z - z) < 12)) continue;
      this.peaks.push({ x, y: vis[i], z });
      if (this.peaks.length >= Math.round(N / 12)) break;
    }
  }
}
