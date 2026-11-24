import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { addSnow, SNOW_U } from './snow';
import { WATER_MAX, WATER_ICE } from './buildingWater';

export const mats = {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }),
  glow: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, emissive: new THREE.Color(0xffc46b), emissiveIntensity: 0 }),
  ghost: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.62, emissive: new THREE.Color(0x40ff70), emissiveIntensity: 0.55, depthWrite: false }),
  /**
   * Corps et lumières d'un bâtiment dans un seul maillage (un appel de dessin au lieu de deux) : les sommets sans graine
   * (`aLight` nul) sont le corps, mat et sans éclat ; les autres sont les lumières, comme avec `glow` (voir `mergeLit`)
   */
  lit: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, emissive: new THREE.Color(0xffc46b), emissiveIntensity: 0 }),
};
/** Graine des lumières fixes (sans graine dans `glow`) une fois fondues dans un maillage `lit` */
export const LIT_FIXED = -100;
/** Heure du jour, temps écoulé (s) et nuit (0 … 1), pour les lumières des bâtiments */
export const LIGHTS = { hour: { value: 20 }, time: { value: 0 }, night: { value: 0 } };
/** Calque vu par la seule caméra des ombres : silhouettes simplifiées qui projettent l'ombre d'objets détaillés */
export const SHADOW_LAYER = 1;

/**
 * Lumières des bâtiments, chacune à son rythme : sa graine (`aLight`) mêlée à la place du bâtiment. Les fenêtres s'allument
 * l'une après l'autre au crépuscule, quelques pièces restent sombres, chacune s'éteint à son heure entre 21 h 30 et 4 h et
 * les lève-tôt rallument avant l'aube ; chaque fenêtre a son éclat, plus ou moins orangé. Flammes et lanternes vacillent à
 * peine, chacune de son côté. Les néons (graine ≥ 2) luisent de leur propre couleur et palpitent doucement. Les lumières sans
 * graine (lanternes des rues) restent fixes
 */
function addLights(mat: THREE.Material, lit = false) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uLightHour: LIGHTS.hour, uLightTime: LIGHTS.time, uLightNight: LIGHTS.night });
    // maillage `lit` : le corps (graine nulle) ne luit pas, une lumière fixe (LIT_FIXED) luit toujours ; `vLit` les distingue
    sh.vertexShader = 'attribute float aLight;\nuniform float uLightHour;\nuniform float uLightTime;\nuniform float uLightNight;\nvarying vec3 vLightK;\nvarying float vLit;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  // l'eau (graine sous WATER_MAX, voir buildingWater.ts) est rangée avec les lumières mais ne luit pas
  float lWater = aLight <= ${WATER_MAX.toFixed(1)} ? 1.0 : 0.0;
  vLit = aLight != 0.0 ? 1.0 - lWater : 0.0;
  vLightK = vec3(${lit ? 'vLit' : '1.0 - lWater'});
  if (aLight != 0.0 && aLight > ${LIT_FIXED / 2}.0) {
    // la place du bâtiment (dans un lot, celle de son instance)
    vec2 lPos = modelMatrix[3].xz;
    #ifdef USE_BATCHING
    lPos = (modelMatrix * batchingMatrix[3]).xz;
    #endif
    float lSeed = fract(abs(aLight) + fract(sin(dot(lPos, vec2(12.9898, 78.233))) * 43758.5453));
    if (aLight >= 2.0) {
      // la couleur du néon, rapportée à l'éclat chaud du matériau (0xffc46b en couleurs linéaires)
      vLightK = color.rgb / vec3(1.0, 0.552, 0.147) * (0.7 + 0.12 * sin(uLightTime * 1.7 + lSeed * 40.0));
    } else if (aLight > 0.0) {
      // heures comptées de midi à midi : le coucher (21 h 30 … 4 h), le lever (5 h … 7 h 30)
      float lH = uLightHour < 12.0 ? uLightHour + 24.0 : uLightHour;
      float lBed = 21.5 + fract(lSeed * 7.31) * 6.5, lWake = 29.0 + fract(lSeed * 3.77) * 2.5;
      float lOn = clamp(1.0 - smoothstep(lBed, lBed + 0.2, lH) + smoothstep(lWake, lWake + 0.2, lH), 0.0, 1.0);
      lOn *= step(0.15, fract(lSeed * 9.13)) * smoothstep(0.0, 0.12, uLightNight - fract(lSeed * 2.93) * 0.45);
      vLightK = mix(vec3(1.0, 0.8, 0.62), vec3(1.0, 0.98, 0.92), fract(lSeed * 5.31)) * lOn * (0.72 + 0.36 * fract(lSeed * 13.7));
    } else {
      float lT = uLightTime * (0.8 + lSeed * 0.6) + lSeed * 40.0;
      vLightK = vec3(0.92 + 0.08 * sin(lT * 2.7) * sin(lT * 1.7 + 1.3));
    }
  }`);
    let frag = 'varying vec3 vLightK;\nvarying float vLit;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vLightK;');
    // les lumières d'un maillage `lit` gardent le grain un peu plus lisse du matériau `glow`
    if (lit) frag = frag.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.8, vLit);');
    sh.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => `${key}|lights${lit ? '|lit' : ''}`;
}
addLights(mats.glow);
addLights(mats.lit, true);

/**
 * L'eau des bâtiments (fontaines, puits, thermes, piscines, bassins, abreuvoirs) : les sommets marqués d'une graine d'eau
 * (`buildingWater.ts`, rangés avec les lumières) se rident sous de petites vagues croisées qui filent, reflètent le ciel en
 * rasant (la couleur de la brume : bleu le jour, sombre la nuit), prennent les reflets du soleil (surface lisse), s'éclaircissent
 * et moussent contre le bord, s'assombrissent au milieu ; l'écume tourne en anneaux là où l'eau retombe ; jets et cascades
 * filent en stries dans le sens du courant. L'hiver, l'eau gèle là où la neige tient (`WATER_ICE`). Un seul matériau pour
 * tout le village : aucun coût par bâtiment, et les autres pixels ne paient qu'un test
 */
const WATER_GLSL = `
uniform float uWaterT;
uniform float uWaterIce;
uniform float uWaterNight;
uniform sampler2D uWaterSnow;
uniform float uWaterSnowSize;
varying vec3 vWaterPos;
varying vec2 vWater;
// une vaguelette : hauteur et pente ; elle s'efface quand elle devient plus fine que quelques pixels (pas de grésillement au loin)
vec3 wWave(vec2 q, vec2 dir, float f, float sp, float a, float t, float px) {
  a *= 1.0 - smoothstep(0.12, 0.3, px * f);
  float ph = dot(q, dir) * f + t * sp;
  return vec3(a * sin(ph), a * f * cos(ph) * dir);
}
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + 1.0), f.x), f.y);
}
`;
function addWater(mat: THREE.Material) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uWaterT: LIGHTS.time, uWaterNight: LIGHTS.night, uWaterIce: WATER_ICE, uWaterSnow: SNOW_U.uSnowMap, uWaterSnowSize: SNOW_U.uSnowSize });
    sh.vertexShader = 'uniform float uWaterT;\nvarying vec3 vWaterPos;\nvarying vec2 vWater;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  // x : 0 sec, 1 surface, 2 écume, 3 chute ; y : distance au bord, rayon de l'écume ou avancée le long du jet
  vWater = vec2(0.0);
  if (aLight <= ${WATER_MAX.toFixed(1)}) {
    float wu = -aLight - 200.0, wk = floor(wu / 200.0 + 1e-4);
    vWater = vec2(wk + 1.0, (wu - wk * 200.0) / 100.0);
    // un jet ondule un peu, d'autant plus loin de sa source
    if (wk > 1.5) transformed.xz += vec2(sin(uWaterT * 9.0 + transformed.y * 70.0), cos(uWaterT * 7.3 + transformed.y * 61.0)) * 0.0016 * vWater.y;
  }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 wW = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
  wW = batchingMatrix * wW;
  #endif
  #ifdef USE_INSTANCING
  wW = instanceMatrix * wW;
  #endif
  vWaterPos = (modelMatrix * wW).xyz;`);
    sh.fragmentShader = WATER_GLSL + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  vec3 wRefl = vec3(0.0);
  if (vWater.x > 0.5) {
    vec2 q = vWaterPos.xz;
    float t = uWaterT, kind = vWater.x, wv = vWater.y;
    vec3 base = vColor.rgb;
    float px = length(fwidth(q));
    // glace : là où la neige tient, l'hiver ; elle fige aussi les jets
    float ice = uWaterIce > 0.01 ? uWaterIce * smoothstep(0.3, 0.8, texture2D(uWaterSnow, q / uWaterSnowSize).r) : 0.0;
    ice = smoothstep(0.35, 0.6, ice);
    float tm = t * (1.0 - ice);
    vec3 upV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    vec3 col;
    if (kind < 2.5) {
      // la surface : quatre trains de vaguelettes croisés, plus forts par risées qui passent lentement
      float breeze = 0.65 + 0.35 * sin(q.x * 2.1 + q.y * 1.3 + tm * 0.5);
      vec3 w = wWave(q, vec2(0.8, 0.6), 23.0, 1.9, 0.0055, tm, px) + wWave(q, vec2(-0.5, 0.866), 31.0, 2.4, 0.0042, tm, px)
        + wWave(q, vec2(0.95, -0.31), 47.0, 3.2, 0.0026, tm, px) + wWave(q, vec2(-0.24, -0.97), 73.0, 4.1, 0.0016, tm, px);
      w *= breeze * (1.0 - ice);
      float d = kind < 1.5 ? wv : 1.0;
      // l'écume tourne en anneaux qui s'éloignent du point de chute, bouillonne au centre ; elle trouble la surface
      float splash = 0.0;
      if (kind > 1.5) {
        float s = wv, ring = fract(s * 2.6 - tm * 0.9);
        float bub = wNoise(q * 140.0 + vec2(tm * 3.0, -tm * 2.4));
        splash = (smoothstep(0.0, 0.12, ring) * smoothstep(0.42, 0.14, ring) * 0.7 + smoothstep(0.55, 0.0, s) * (0.55 + 0.45 * bub)) * (1.0 - smoothstep(0.6, 1.0, s));
        splash *= 1.0 - ice;
        w.yz += vec2(sin(s * 30.0 - tm * 6.0)) * 0.05 * (1.0 - s) * (1.0 - ice);
      }
      normal = normalize((viewMatrix * vec4(-w.y, 1.0, -w.z, 0.0)).xyz);
      // clair et turquoise près du bord, plus sombre au milieu (un petit bassin reste clair)
      float deep = smoothstep(0.0, 0.06, d);
      vec3 shallowC = base * vec3(1.12, 1.2, 1.12) + vec3(0.03, 0.08, 0.07);
      vec3 deepC = base * vec3(0.42, 0.62, 0.8);
      // (la tache d'écume a déjà la teinte de la nappe autour d'elle, voir waterTint)
      col = (kind > 1.5 ? base : mix(shallowC, deepC, deep)) * (0.94 + w.x * 22.0);
      // caustiques qui serpentent au fond, là où l'eau est peu profonde
      float ca = abs(sin(q.x * 31.0 + sin(q.y * 17.0 + tm) * 1.6 + tm * 0.8) + sin(q.y * 29.0 + sin(q.x * 15.0 - tm * 0.9) * 1.6 - tm * 0.7));
      col += vec3(0.1, 0.15, 0.15) * smoothstep(1.45, 1.95, ca) * (1.0 - deep * 0.8) * (1.0 - smoothstep(0.05, 0.12, px * 31.0));
      // l'eau lèche le bord : un liseré d'écume qui respire et s'effiloche
      float rimW = max(0.012, px * 1.5) * (1.0 + 0.35 * sin(tm * 1.7 + q.x * 37.0 + q.y * 29.0));
      float rim = (1.0 - smoothstep(rimW * 0.35, rimW, d)) * (0.55 + 0.45 * wNoise(q * 90.0 + tm * 0.6));
      col = mix(col, vec3(0.9, 0.96, 0.98), max(rim * 0.85, splash) * (1.0 - ice));
      roughnessFactor = mix(0.1, 0.55, max(splash, rim));
    } else {
      // jet, filet ou cascade : des stries claires qui filent dans le sens du courant, un peu de mousse au bout
      // (un bruit continu, étiré dans le sens du courant : pas de damier sur les rideaux d'eau)
      float across = (q.x - q.y) * 70.0 + vWaterPos.y * 13.0;
      float streak = smoothstep(0.45, 0.8, wNoise(vec2(across, wv * 4.0 - tm * 3.2)) * 0.7 + wNoise(vec2(across * 2.3, wv * 9.0 - tm * 5.0)) * 0.3);
      col = mix(base * vec3(0.55, 0.75, 0.9), vec3(0.97, 0.99, 1.0), streak * 0.75 + smoothstep(0.75, 1.0, wv) * 0.25);
      roughnessFactor = 0.25;
    }
    // la glace : terne, blanchie, fendillée ; rien ne bouge
    if (ice > 0.0) {
      float crack = 1.0 - smoothstep(0.0, 0.06, abs(wNoise(q * 26.0) - 0.5));
      vec3 iceC = mix(vec3(0.78, 0.87, 0.93), vec3(0.93, 0.96, 0.98), wNoise(q * 9.0)) * (1.0 - crack * 0.12);
      col = mix(col, iceC, ice * 0.9);
      roughnessFactor = mix(roughnessFactor, 0.45, ice);
      if (kind < 2.5) normal = normalize(mix(normal, normalize(upV), ice));
    }
    // la nuit, l'eau s'assombrit et la lune n'y fait qu'un reflet doux (la scène reste éclairée d'un bleu de nuit)
    col *= 1.0 - 0.3 * uWaterNight;
    roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.4), uWaterNight);
    diffuseColor.rgb = col;
    // vue en rasant, l'eau reflète le ciel : la couleur de la brume (bleu clair le jour, sombre la nuit)
    vec3 sky = vec3(0.72, 0.85, 0.95);
    #ifdef USE_FOG
    sky = fogColor;
    #endif
    float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
    wRefl = sky * (0.06 + 0.55 * fr) * (kind < 2.5 ? 1.0 : 0.4) * (1.0 - ice * 0.7);
  }`)
      .replace('#include <lights_fragment_begin>', 'totalEmissiveRadiance += wRefl;\n#include <lights_fragment_begin>');
  };
  mat.customProgramCacheKey = () => `${key}|water2`;
}
// l'eau est rangée avec les lumières : le maillage `lit` des bâtiments, et `glow` quand un modèle ne s'y fond pas
addWater(mats.glow);
addWater(mats.lit);

// neige sur les toits, les rebords et le dessus de tout ce qui est bâti ou posé dehors
addSnow(mats.body);
addSnow(mats.glow);
addSnow(mats.lit);

/**
 * Corps et lumières d'un modèle fondus en un seul maillage pour `mats.lit` : le corps prend une graine nulle, les lumières
 * gardent la leur (LIT_FIXED pour une lumière fixe, sans graine). Sans lumières, le corps seul mis au même format (pour les
 * lots de `GeoBatch`, qui veulent tous les mêmes attributs). Null si ça ne se fond pas (attributs manquants)
 */
export function mergeLit(body: THREE.BufferGeometry, glow: THREE.BufferGeometry | null): THREE.BufferGeometry | null {
  const parts = (glow ? [body, glow] : [body]).map((g, i) => {
    const src = g.index ? g.toNonIndexed() : g;
    const pos = src.attributes.position, nor = src.attributes.normal, col = src.attributes.color;
    if (!pos || !nor || !col || col.itemSize !== 3) return null;
    const out = new THREE.BufferGeometry();
    // tout en flottants simples, pour que les géométries d'un même lot se ressemblent
    const f32 = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
      if (a instanceof THREE.BufferAttribute && a.array instanceof Float32Array && !a.normalized) return a;
      const v = new Float32Array(a.count * a.itemSize);
      for (let j = 0; j < a.count; j++) for (let c = 0; c < a.itemSize; c++) v[j * a.itemSize + c] = a.getComponent(j, c);
      return new THREE.BufferAttribute(v, a.itemSize);
    };
    out.setAttribute('position', f32(pos));
    out.setAttribute('normal', f32(nor));
    out.setAttribute('color', f32(col));
    // dans `glow`, une graine nulle est une lumière fixe : ici elle devient LIT_FIXED (le zéro est réservé au corps)
    const seed = src.attributes.aLight, k = new Float32Array(pos.count);
    if (i === 1) for (let v = 0; v < pos.count; v++) k[v] = (seed ? seed.getX(v) : 0) || LIT_FIXED;
    out.setAttribute('aLight', new THREE.BufferAttribute(k, 1));
    return out;
  });
  if (parts.some((p) => !p)) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts as THREE.BufferGeometry[], false);
  if (!merged) return null;
  merged.computeBoundingSphere();
  return merged;
}

/** Temps (s) qui anime les personnages des bâtiments */
export const CROWD = { time: { value: 0 } };

/**
 * Personnages des bâtiments : chaque pièce tourne autour de son pivot (`aPivot`) selon son axe (`aAxis`) d'un angle qui oscille
 * (`aAnim` : amplitude, fréquence, phase) et sautille (`aAnim.w` : hauteur du rebond, deux fois par battement)
 */
export const crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
crowdMat.onBeforeCompile = (sh) => {
  sh.uniforms.uCrowdT = CROWD.time;
  sh.vertexShader = `attribute vec3 aPivot;
attribute vec3 aAxis;
attribute vec4 aAnim;
uniform float uCrowdT;
vec3 crowdRot(vec3 v, float a) { float c = cos(a), s = sin(a); return v * c + cross(aAxis, v) * s + aAxis * dot(aAxis, v) * (1.0 - c); }
` + sh.vertexShader
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  objectNormal = crowdRot(objectNormal, aAnim.x * sin(uCrowdT * aAnim.y * 6.2832 + aAnim.z));`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed = aPivot + crowdRot(transformed - aPivot, aAnim.x * sin(uCrowdT * aAnim.y * 6.2832 + aAnim.z));
  transformed.y += aAnim.w * abs(sin(uCrowdT * aAnim.y * 6.2832 + aAnim.z));`);
};
crowdMat.customProgramCacheKey = () => 'crowd';

export function setGhostValid(ok: boolean) {
  mats.ghost.emissive.setHex(ok ? 0x30e060 : 0xff3a3a);
}
