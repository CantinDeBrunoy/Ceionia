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
 * peine, chacune de son côté. Les lumières sans graine (lanternes des rues) restent fixes
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
    if (aLight > 0.0) {
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
