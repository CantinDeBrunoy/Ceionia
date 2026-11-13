import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, VR, VS, VEG_VOLCANO } from '../world/world';
import { GameTime } from '../core/time';
import { clamp, lerp, mulberry32, smoothstep } from '../core/rng';
import { Environment } from './env';
import { SeasonState } from './season';
import { AudioEngine } from '../audio/audio';
import { wind as air } from './wind';

const MTN_GREY = new THREE.Color(0xc2cad4);
const MIST_DAY = new THREE.Color(0xf4f7fa), MIST_NIGHT = new THREE.Color(0x4e5a78), MIST_DAWN = new THREE.Color(0xffe4d4);
/** Brume : densité, hauteur de son dessus (au-dessus de la mer), épaisseur du fondu sous le dessus, temps (dérive) */
const MIST = { x: 0, y: 2.1, z: 0.9, w: 0 };
/** couleur de la brume (espace de travail, convertie dans le shader) et taille de la carte (la brume s'efface au bord) */
const MIST_COL = { x: 1, y: 1, z: 1, w: 192 };
/** Part des matins (et des soirs) où la brume se lève */
const MIST_CHANCE = 0.3;
const mistDay = (n: number) => { const x = Math.sin(n * 91.345 + 7.13) * 43758.5453; return x - Math.floor(x); };
/** Brume des montagnes : densité, bas et haut de la tranche d'air où elle peut être, nombre de pas de la marche (0 : coupée) */
const MTN = { x: 0, y: 0, z: 0, w: 0 };
/** vent : décalage accumulé du motif (x, z), allongement du motif dans le sens du vent dominant (cos, sin) */
const MTN_WIND = { x: 0, y: 0, z: Math.cos(0.9), w: Math.sin(0.9) };
/** couleur de la brume des montagnes */
const MTN_COL = { x: 1, y: 1, z: 1, w: 0 };
/** Pas de la marche dans la brume des montagnes, selon la qualité (haute, normale) */
export const MTN_STEPS = { high: 5, medium: 3 };

/**
 * Carte des massifs, partagée par tous les matériaux : three recopie les textures d'un matériau à l'autre (`clone`), celle-ci
 * se rend elle-même pour qu'une seule copie suive les changements du relief
 */
class SharedTexture extends THREE.DataTexture {
  clone() { return this as unknown as this; }
}
/** Côté de la carte des massifs (texels), fixe quelle que soit la taille de la carte : la texture n'est jamais réallouée */
const MTN_RES = 128;
/** Carte des massifs : force de la brume (r), milieu du banc (g × 16), épaisseur (0,8 + b × 8) */
const MTN_MAP = new SharedTexture(new Uint8Array(MTN_RES * MTN_RES * 4), MTN_RES, MTN_RES);
MTN_MAP.magFilter = MTN_MAP.minFilter = THREE.LinearFilter;
MTN_MAP.wrapS = MTN_MAP.wrapT = THREE.ClampToEdgeWrapping;
MTN_MAP.needsUpdate = true;

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
  uniform vec4 uMtn;
  uniform vec4 uMtnWind;
  uniform vec4 uMtnColor;
  uniform sampler2D uMtnMap;
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
  // brume des montagnes : bancs accrochés aux flancs et posés dans les vallées des massifs. On marche quelques pas le long du
  // regard, dans la tranche d'air où elle peut être ; la carte des massifs donne à chaque endroit sa force, la hauteur du milieu
  // du banc et son épaisseur. Le motif, allongé dans le sens du vent dominant, dérive avec le vent et s'effiloche sur ses bords
  if (uMtn.x > 0.003) {
    vec3 md = cameraPosition - vMistW;
    float mt0 = 0.0, mt1 = 1.0;
    if (abs(md.y) > 1e-4) {
      float ta = (uMtn.y - vMistW.y) / md.y, tb = (uMtn.z - vMistW.y) / md.y;
      mt0 = max(0.0, min(ta, tb)); mt1 = min(1.0, max(ta, tb));
    } else if (vMistW.y < uMtn.y || vMistW.y > uMtn.z) mt1 = -1.0;
    float mL = length(md);
    mt1 = min(mt1, mt0 + 48.0 / max(mL, 1e-3));
    if (mt1 > mt0) {
      float od = 0.0;
      for (int i = 0; i < 5; i++) {
        if (float(i) >= uMtn.w) break;
        vec3 q = vMistW + md * mix(mt0, mt1, (float(i) + 0.5) / uMtn.w);
        vec4 mm = texture2D(uMtnMap, q.xz / uMistColor.w);
        if (mm.r < 0.01) continue;
        float hw = 0.8 + mm.b * 8.0, dy = (q.y - mm.g * 16.0) / hw;
        // dessous fondu plus long que le dessus : la brume monte des vallées et s'arrête sous les crêtes
        float prof = 1.0 - smoothstep(0.0, 1.0, dy > 0.0 ? dy : -dy * 0.7);
        if (prof <= 0.0) continue;
        vec2 wq = q.xz + uMtnWind.xy;
        vec2 sq = vec2(dot(wq, uMtnWind.zw) * 0.45, dot(wq, vec2(-uMtnWind.w, uMtnWind.z)));
        float n = mistNoise(sq * 0.11 + q.y * 0.07) * 0.6 + mistNoise(sq * 0.31 - q.y * 0.11 + uMist.w * 0.01) * 0.4;
        od += mm.r * prof * smoothstep(0.3, 0.75, n);
      }
      od *= (mt1 - mt0) * mL / uMtn.w;
      float m = 1.0 - exp(-od * uMtn.x * 0.42);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uMtnColor.rgb, 1.0)).rgb, m * 0.88);
    }
  }
#endif
` + C.fog_fragment;
  const u = { uMist: { value: MIST }, uMistColor: { value: MIST_COL }, uMtn: { value: MTN }, uMtnWind: { value: MTN_WIND }, uMtnColor: { value: MTN_COL }, uMtnMap: { value: MTN_MAP } };
  Object.assign(THREE.UniformsLib.fog, u);
  for (const lib of Object.values(THREE.ShaderLib)) if (lib.uniforms.fogColor) Object.assign(lib.uniforms, u);
}
patchMist();

/**
 * Atmosphère : brume du matin qui stagne dans les creux, brume accrochée aux flancs des massifs, arc-en-ciel après la pluie,
 * orages (éclairs, illumination, tonnerre). Les aurores et les étoiles filantes sont dans `nightSky`
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
  /** pas de la marche dans la brume des montagnes (0 : coupée), selon la qualité */
  mountainSteps = MTN_STEPS.high;
  /** force de la brume des montagnes, qui suit lentement l'heure et le temps */
  private mtnK = 0;
  /** humidité laissée par la pluie : la brume des montagnes reste épaisse un moment après l'averse */
  private wet = 0;
  private builtVis = -1;
  private mtnColor = new THREE.Color();
  private bow: THREE.Mesh;
  private bowU = { uAlpha: { value: 0 }, uFoot: { value: 1 } };
  private bowT = 0;
  private wasRaining = false;
  private bolt: THREE.Mesh;
  private boltT = 0;
  private flashT = 0;
  private nextBolt = 6;
  private storm = false;
  private rainState = false;
  private rnd = mulberry32(Date.now() & 0xffff);
  private mistColor = new THREE.Color();

  constructor(private world: World, private audio: AudioEngine) {
    MIST_COL.w = N;
    // ---- arc-en-ciel : demi-anneau aux couleurs du spectre, rouge à l'extérieur et violet à l'intérieur ; au-dehors, l'arc
    // secondaire, plus pâle, aux couleurs inversées. Translucide, aux teintes adoucies (un vrai arc-en-ciel n'est pas criard) ;
    // ses pieds s'estompent au niveau de la mer, là-bas derrière l'île (sinon il pendrait sous le plateau dans le vide)
    const bm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, uniforms: this.bowU,
      vertexShader: 'varying vec2 vP; varying float vY; void main(){ vP = position.xy; vY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uAlpha; uniform float uFoot; varying vec2 vP; varying float vY;
vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main(){
  float r = length(vP), t = clamp((r - 0.9) / 0.1, 0.0, 1.0), s = clamp((1.13 - r) / 0.08, 0.0, 1.0);
  float a1 = sin(t * 3.14159), a2 = sin(s * 3.14159) * 0.35;
  vec3 c = a1 >= a2 ? hue(0.78 * (1.0 - t)) : hue(0.78 * (1.0 - s));
  float a = uAlpha * max(a1, a2) * smoothstep(0.0, 0.06, vP.y / r) * smoothstep(0.0, uFoot, vY);
  if (a < 0.002) discard;
  gl_FragColor = vec4(mix(c, vec3(1.0), 0.22), a * 0.28); }`,
    });
    this.bow = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.15, 128, 2, 0, Math.PI), bm);
    this.bow.visible = false;
    this.bow.renderOrder = -5;
    // ---- éclair : ruban de lumière remplacé à chaque coup
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.5, 3), fog: false }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    this.group.add(this.bow, this.bolt);
  }

  /** Sous terre : pas de brume */
  hideMist() { MIST.x = 0; MTN.x = 0; }

  /** Force de la brume des montagnes (0 … 1,2) */
  get mountainMist() { return this.mistEnabled && this.mountainSteps > 0 ? this.mtnK : 0; }

  /** Épaisseur de la nappe de brume (0 … 1) */
  get mist() { return this.mistEnabled ? this.mistK : 0; }

  /** Dissipe la nappe de brume ; elle ne se reforme pas avant `seconds` secondes */
  dispel(seconds: number) { this.calm = seconds; }

  update(dt: number, time: GameTime, s: SeasonState, env: Environment, camera: THREE.Camera, focus: THREE.Vector3) {
    const w = this.world, h = time.hour, season = time.season;
    if (w.visVersion !== this.builtVis) { this.builtVis = w.visVersion; this.buildMountainMap(); }
    const overcast = env.weatherKind === 'clear' ? 0 : env.weatherK;
    const fog = env.weatherKind === 'fog' ? env.weatherK : 0, rain = env.rainK;

    // ---- brume : à l'aube surtout, plus en automne, avec le brouillard ; la pluie la disperse
    const dawn = smoothstep(3.5, 6, h) * (1 - smoothstep(8.5, 11, h));
    const dusk = smoothstep(18.5, 22, h) * 0.45 + (h < 4 || h > 22 ? 0.3 : 0);
    // plus légère qu'avant : un voile au lever du jour, qui ne noie plus le village chaque matin
    const seasonK = s.light.mist;
    // et pas tous les jours : un matin, un soir sur trois environ (le tirage ne dépend que du jour, il ne clignote pas)
    const night = h < 4 ? time.days - 1 : time.days;
    const morningOn = mistDay(time.days * 2) < MIST_CHANCE ? 1 : 0, eveningOn = mistDay(night * 2 + 1) < MIST_CHANCE ? 1 : 0;
    this.calm = Math.max(0, this.calm - dt);
    const density = this.calm > 0 ? 0 : clamp((dawn * morningOn + dusk * eveningOn) * seasonK + fog * 0.45, 0, 1) * (1 - rain * 0.6) * (1 - fog * 0.35);
    this.mistK += (density - this.mistK) * Math.min(1, dt * (this.calm > 0 ? 1.2 : 0.3));
    MIST.x = this.mistEnabled ? this.mistK : 0;
    // par temps de brouillard, la nappe monte et noie les collines basses
    MIST.y = 2.1 + fog * 0.6;
    MIST.w = (MIST.w + dt) % 4000;
    const tw = clamp(1 - Math.abs(env.daylight - 0.5) * 2.5, 0, 1);
    // la brume diffuse la lumière : claire dès l'aube, bleutée la nuit, rosée au lever et au coucher
    const c = this.mistColor.copy(MIST_NIGHT).lerp(MIST_DAY, smoothstep(0.05, 0.55, env.daylight)).lerp(MIST_DAWN, tw * 0.5);
    MIST_COL.x = c.r; MIST_COL.y = c.g; MIST_COL.z = c.b;

    // ---- brume des montagnes : un voile léger certains jours, épais au petit matin, par temps couvert et longtemps après la
    // pluie (l'humidité remonte des vallées) ; le bouton « dissiper » la chasse aussi
    this.wet = Math.max(rain, this.wet - dt / 90);
    const morning = smoothstep(3.5, 6.5, h) * (1 - smoothstep(9.5, 12.5, h));
    const base = 0.12 + 0.3 * mistDay(time.days * 3 + 2);
    const want = this.calm > 0 ? 0 : clamp(base + morning * 0.55 + this.wet * 0.55 + overcast * 0.3 + fog * 0.5, 0, 1.2);
    this.mtnK += (want - this.mtnK) * Math.min(1, dt * (this.calm > 0 ? 1.2 : 0.15));
    MTN.x = MTN.z > MTN.y ? this.mountainMist : 0;
    MTN.w = this.mountainSteps;
    // le motif dérive avec le vent, lentement (la brume s'effiloche plus qu'elle ne file)
    const drift = (0.2 + air.speed * 0.5) * dt;
    MTN_WIND.x = (MTN_WIND.x - air.dx * drift) % 4000;
    MTN_WIND.y = (MTN_WIND.y - air.dz * drift) % 4000;
    // même lumière que la brume du matin, à peine plus grise (plus encore par temps couvert) : claire, elle ne salit pas la neige
    const mc = this.mtnColor.copy(c).lerp(MTN_GREY, 0.06 + overcast * 0.35).multiplyScalar(0.55 + 0.45 * smoothstep(0, 0.4, env.daylight));
    MTN_COL.x = mc.r; MTN_COL.y = mc.g; MTN_COL.z = mc.b;

    // ---- arc-en-ciel : seulement quand la pluie a cessé et que le soleil est revenu (ciel dégagé, en journée) ; jamais quand
    // la pluie tourne à la neige, et s'il neige pendant qu'il brille, il s'efface (en quelques secondes)
    const snowing = env.weatherKind === 'snow' || env.wantKind === 'snow';
    const sunny = (env.weatherKind === 'clear' || env.weatherK < 0.25) && env.wantKind !== 'rain';
    if (env.weatherKind === 'rain' && env.weatherK > 0.5) this.wasRaining = true;
    else if (this.wasRaining && env.weatherKind !== 'rain' && sunny && !snowing && env.daylight > 0.6 && h > 7 && h < 17.5) { this.wasRaining = false; this.bowT = 45; }
    else if (env.weatherKind !== 'rain' && env.wantKind !== 'rain') this.wasRaining = false;
    if (snowing) this.bowT = Math.min(this.bowT, 6);
    this.bowT = Math.max(0, this.bowT - dt);
    // il se tient à l'opposé du soleil : on ne le voit qu'en lui tournant le dos (pâle quand on regarde de côté), et il pâlit
    // si les nuages reviennent
    const cp = camera.position, fwd = new THREE.Vector3(focus.x - cp.x, 0, focus.z - cp.z).normalize();
    const anti = env.sun ? new THREE.Vector3(env.sun.target.position.x - env.sun.position.x, 0, env.sun.target.position.z - env.sun.position.z) : fwd.clone();
    if (anti.lengthSq() < 1e-6) anti.copy(fwd); else anti.normalize();
    const facing = smoothstep(-0.1, 0.6, fwd.dot(anti));
    const bowA = smoothstep(0, 8, this.bowT) * smoothstep(45, 40, this.bowT) * env.daylight * (1 - overcast) * facing;
    this.bow.visible = false;
    if (bowA > 0.01) {
      this.bowU.uAlpha.value = bowA;
      // au loin, dans la direction opposée au soleil (ramenée vers l'axe de la vue), dans le ciel : il paraît dès que la vue
      // montre un peu de ciel au-dessus de l'horizon, son sommet sous le haut de l'image, ses pieds sous l'horizon (un arc
      // entier, non un bout d'arc coupé en l'air) ; la vue plongeante, qui ne montre pas le ciel, ne le montre pas.
      // Il se tient toujours derrière l'île (au-delà de son bord vu d'ici) : le relief le cache, il ne passe jamais devant.
      // Sa taille apparente ne change pas avec la distance (R / D fixe, comme un vrai arc-en-ciel). Quand on dézoome jusqu'à
      // voir l'île comme un plateau flottant, il s'efface : il n'y a plus d'horizon où le poser, il encadrerait la carte
      const back = Math.hypot(cp.x - N / 2, cp.z - N / 2) + N * 0.75;
      const D = Math.max(130, back), R = D * 0.75;
      const far = 1 - smoothstep(1.2, 1.7, cp.distanceTo(focus) / N);
      fwd.lerp(anti, 0.6).normalize();
      const down = Math.asin(clamp((cp.y - focus.y) / Math.max(1e-3, cp.distanceTo(focus)), -1, 1));
      const half = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2), sky = half - down;
      const apex = cp.y + Math.tan(Math.min(0.45, Math.max(0.02, sky * 0.75))) * D;
      this.bowU.uAlpha.value = bowA * smoothstep(0.004, 0.04, sky) * far;
      this.bowU.uFoot.value = D * 0.04;
      this.bow.visible = sky > 0.004 && far > 0.01;
      this.bow.position.set(cp.x + fwd.x * D, apex - R, cp.z + fwd.z * D);
      this.bow.scale.setScalar(R);
      this.bow.lookAt(cp.x, apex - R, cp.z);
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

  /**
   * Carte des massifs, refaite quand le relief affiché change : autour de chaque point, le plus haut et le plus bas du relief
   * proche. La brume tient là où le relief est haut et creusé (massifs, vallées entre les crêtes), en un banc posé un peu
   * au-dessus de mi-pente ; les sommets en sortent. Pas autour des volcans, qui ont leur panache
   */
  private buildMountainMap() {
    const w = this.world, vis = w.vis, R = MTN_RES, data = MTN_MAP.image.data as Uint8Array;
    const volcanoes: { x: number; z: number; r: number }[] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) volcanoes.push(w.volcanoFrame(k % N, Math.floor(k / N)));
    const hAt = (x: number, z: number) => {
      const ix = Math.max(0, Math.min(VS - 1, Math.round(x * VR))), iz = Math.max(0, Math.min(VS - 1, Math.round(z * VR)));
      return vis[iz * VS + ix];
    };
    const raw = new Float32Array(R * R * 3);
    for (let j = 0; j < R; j++)
      for (let i = 0; i < R; i++) {
        const x = ((i + 0.5) / R) * N, z = ((j + 0.5) / R) * N;
        let hi = 0, lo = Infinity;
        for (let dz = -6; dz <= 6; dz += 2)
          for (let dx = -6; dx <= 6; dx += 2) {
            if (dx * dx + dz * dz > 40) continue;
            const hh = Math.max(0, hAt(x + dx, z + dz));
            if (hh > hi) hi = hh;
            if (hh < lo) lo = hh;
          }
        // pas au-dessus de la plaine au pied du massif : un banc posé là ferait un mur de brume dans le vide
        let m = smoothstep(6, 9.5, hi) * smoothstep(2.5, 6, hi - lo) * smoothstep(2, 5, Math.max(0, hAt(x, z)));
        for (const v of volcanoes) m *= smoothstep(v.r + 1, v.r + 6, Math.hypot(x - v.x, z - v.z));
        const k = (j * R + i) * 3;
        raw[k] = m;
        raw[k + 1] = lo + (hi - lo) * 0.55;
        raw[k + 2] = 0.6 + (hi - lo) * 0.2;
      }
    // fondu sur trois texels : pas de marche dans la brume d'un endroit à l'autre
    const out = new Float32Array(raw.length);
    for (let pass = 0; pass < 2; pass++) {
      const src = pass === 0 ? raw : out, dst = pass === 0 ? out : raw;
      for (let j = 0; j < R; j++)
        for (let i = 0; i < R; i++)
          for (let c = 0; c < 3; c++) {
            let s = 0, n = 0;
            for (let dj = -1; dj <= 1; dj++)
              for (let di = -1; di <= 1; di++) {
                const ii = i + di, jj = j + dj;
                if (ii < 0 || jj < 0 || ii >= R || jj >= R) continue;
                s += src[(jj * R + ii) * 3 + c]; n++;
              }
            dst[(j * R + i) * 3 + c] = s / n;
          }
    }
    let yLo = Infinity, yHi = -Infinity;
    for (let k = 0; k < R * R; k++) {
      const m = raw[k * 3], mid = Math.min(16, raw[k * 3 + 1]), hw = Math.min(8.8, raw[k * 3 + 2]);
      data[k * 4] = Math.round(clamp(m, 0, 1) * 255);
      data[k * 4 + 1] = Math.round((mid / 16) * 255);
      data[k * 4 + 2] = Math.round(clamp((hw - 0.8) / 8, 0, 1) * 255);
      data[k * 4 + 3] = 255;
      if (m > 0.01) { yLo = Math.min(yLo, mid - hw / 0.7); yHi = Math.max(yHi, mid + hw); }
    }
    MTN_MAP.needsUpdate = true;
    // pas de massif : la tranche est vide, le shader ne marche pas
    MTN.y = yLo < yHi ? Math.max(0, yLo) : 0;
    MTN.z = yLo < yHi ? yHi : -1;
  }
}
