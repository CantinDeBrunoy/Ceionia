import * as THREE from 'three';

import { addSnow } from './snow';

export const mats = {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }),
  glow: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, emissive: new THREE.Color(0xffc46b), emissiveIntensity: 0 }),
  ghost: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.62, emissive: new THREE.Color(0x40ff70), emissiveIntensity: 0.55, depthWrite: false }),
};
/** Heure du jour, temps écoulé (s) et nuit (0 … 1), pour les lumières des bâtiments */
export const LIGHTS = { hour: { value: 20 }, time: { value: 0 }, night: { value: 0 } };

/**
 * Lumières des bâtiments, chacune à son rythme : sa graine (`aLight`) mêlée à la place du bâtiment. Les fenêtres s'allument
 * l'une après l'autre au crépuscule, quelques pièces restent sombres, chacune s'éteint à son heure entre 21 h 30 et 4 h et
 * les lève-tôt rallument avant l'aube ; chaque fenêtre a son éclat, plus ou moins orangé. Flammes et lanternes vacillent à
 * peine, chacune de son côté. Les néons (graine ≥ 2) luisent de leur propre couleur et palpitent doucement. Les lumières sans
 * graine (lanternes des rues) restent fixes
 */
function addLights(mat: THREE.Material) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uLightHour: LIGHTS.hour, uLightTime: LIGHTS.time, uLightNight: LIGHTS.night });
    sh.vertexShader = 'attribute float aLight;\nuniform float uLightHour;\nuniform float uLightTime;\nuniform float uLightNight;\nvarying vec3 vLightK;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vLightK = vec3(1.0);
  if (aLight != 0.0) {
    float lSeed = fract(abs(aLight) + fract(sin(dot(modelMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453));
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
    sh.fragmentShader = 'varying vec3 vLightK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vLightK;');
  };
  mat.customProgramCacheKey = () => `${key}|lights`;
}
addLights(mats.glow);

/**
 * L'eau des bâtiments (fontaines, piscines, bassins, abreuvoirs, puits) : les faces horizontales d'un bleu d'eau se rident et
 * scintillent, des vaguelettes qui passent et des reflets qui s'allument et s'éteignent, chacune à sa place
 */
function addWater(mat: THREE.Material) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uWaterT = LIGHTS.time;
    sh.vertexShader = 'varying vec3 vWaterPos;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 wW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wW = instanceMatrix * wW;
  #endif
  vWaterPos = (modelMatrix * wW).xyz;`);
    sh.fragmentShader = 'uniform float uWaterT;\nvarying vec3 vWaterPos;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 wc = vColor.rgb;
    float wUp = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    float wMask = step(0.3, (wc.b - wc.r) / max(wc.b, 0.01)) * step(0.22, (wc.g - wc.r) / max(wc.g, 0.01)) * step(0.45, wc.b) * step(0.8, wUp);
    if (wMask > 0.0) {
      vec2 q = vWaterPos.xz;
      float t = uWaterT;
      // deux trains de vaguelettes croisés et un clapot fin : la surface penche (la lumière du soleil y joue) et se nuance
      float a1 = q.x * 9.0 + q.y * 3.0 + t * 1.6, a2 = q.y * 8.0 - q.x * 2.5 - t * 1.3, a3 = (q.x - q.y) * 17.0 + t * 2.6;
      float rip = 0.5 * sin(a1) + 0.5 * sin(a2) + 0.35 * sin(a3);
      vec2 sl = vec2(4.5 * cos(a1) - 1.25 * cos(a2) + 5.95 * cos(a3), 1.5 * cos(a1) + 4.0 * cos(a2) - 5.95 * cos(a3)) * 0.014;
      normal = normalize((viewMatrix * vec4(-sl.x, 1.0, -sl.y, 0.0)).xyz);
      // des eaux plus ou moins profondes, en grandes taches lentes
      float deep = 0.5 + 0.5 * sin(q.x * 2.3 + sin(q.y * 1.7) + t * 0.15) * sin(q.y * 2.1 - t * 0.12);
      // caustiques : des lignes claires qui serpentent au fond
      float ca = abs(sin(q.x * 13.0 + sin(q.y * 7.0 + t) * 1.5 + t * 0.7) + sin(q.y * 12.0 + sin(q.x * 6.0 - t * 0.8) * 1.5 - t * 0.6));
      float caus = smoothstep(1.5, 1.95, ca);
      float glint = smoothstep(0.86, 1.0, sin(q.x * 23.0 + t * 2.1) * sin(q.y * 21.0 - t * 1.8));
      diffuseColor.rgb = diffuseColor.rgb * (0.84 + 0.1 * rip + 0.12 * deep) + vec3(0.2, 0.28, 0.3) * caus + vec3(0.6) * glint;
      // vue en rasant, l'eau reflète le ciel
      float fr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.86, 0.97), fr * 0.5);
      roughnessFactor = 0.3;
    }
  }`);
  };
  mat.customProgramCacheKey = () => `${key}|water`;
}
addWater(mats.body);

// neige sur les toits, les rebords et le dessus de tout ce qui est bâti ou posé dehors
addSnow(mats.body);
addSnow(mats.glow);

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
