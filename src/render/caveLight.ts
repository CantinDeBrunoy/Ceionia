import * as THREE from 'three';

/** Nombre de sources lumineuses passées aux shaders du souterrain (les plus proches de la caméra) */
export const MAX_CAVE_LIGHTS = 24;

/**
 * Sources du souterrain (cristaux, champignons, lave, torches, puits de jour, lanterne) : position et portée,
 * couleur × intensité ; partagées par tous les matériaux éclairés par `caveLit`, éteintes en surface (uLN = 0)
 */
export const caveLights = {
  uL: { value: Array.from({ length: MAX_CAVE_LIGHTS }, () => new THREE.Vector4()) },
  uLC: { value: Array.from({ length: MAX_CAVE_LIGHTS }, () => new THREE.Vector3()) },
  uLN: { value: 0 },
};

/**
 * Ajoute à un matériau standard (instancié, animé ou non) la lumière des sources du souterrain : décroissance douce
 * jusqu'à la portée, demi-lambert pour que les parois tournées ailleurs restent lisibles ; s'enchaîne aux retouches existantes
 */
export function caveLit<T extends THREE.Material>(m: T, key: string): T {
  if (m.userData.caveLit) return m;
  m.userData.caveLit = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, caveLights);
    sh.vertexShader = 'varying vec3 vCaveW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 caveW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  caveW = instanceMatrix * caveW;
#endif
  vCaveW = (modelMatrix * caveW).xyz;`);
    sh.fragmentShader = `uniform vec4 uL[${MAX_CAVE_LIGHTS}];\nuniform vec3 uLC[${MAX_CAVE_LIGHTS}];\nuniform int uLN;\nvarying vec3 vCaveW;\n`
      + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  for (int i = 0; i < ${MAX_CAVE_LIGHTS}; i++) {
    if (i >= uLN) break;
    vec3 ld = uL[i].xyz - vCaveW;
    float dist = length(ld);
    float k = max(0.0, 1.0 - dist / uL[i].w);
    vec3 lv = normalize((viewMatrix * vec4(ld, 0.0)).xyz);
    totalEmissiveRadiance += diffuseColor.rgb * uLC[i] * (k * k) * (0.3 + 0.7 * max(dot(normal, lv), 0.0));
  }`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|cave|${key}`;
  return m;
}

/** Matériau qui luit de sa propre couleur (cristaux, chapeaux de champignons, minerais précieux, flammes) */
export function glowMaterial(glow: number, key: string, opts: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, flatShading: true, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => `glow${glow}`;
  return caveLit(m, key);
}
