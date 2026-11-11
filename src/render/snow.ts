import * as THREE from 'three';

/** Neige du moment sur le village (0 … 1), partagée par tous les matériaux qui la reçoivent ; 0 sous terre */
export const SNOW = { value: 0 };
/** Part de la neige que retient chaque case de la carte (déserts et tropiques presque rien), et taille de la carte */
const SNOW_MAP = { value: null as THREE.Texture | null };
const SNOW_SIZE = { value: 1 };
/** Carte de la neige que retient chaque case, pour les shaders qui en ont besoin (glace de l'eau) */
export const SNOW_U = { uSnowMap: SNOW_MAP, uSnowSize: SNOW_SIZE };
let map: THREE.DataTexture | null = null;

/** Neige que retient chaque case (0 … 1), d'après son biome : à refaire quand la carte change */
export function setSnowMap(n: number, snowy: (k: number) => number) {
  if (!map || map.image.width !== n) {
    map?.dispose();
    map = new THREE.DataTexture(new Uint8Array(n * n), n, n, THREE.RedFormat);
    map.magFilter = map.minFilter = THREE.LinearFilter;
    SNOW_MAP.value = map;
  }
  const d = map.image.data as Uint8Array;
  for (let k = 0; k < n * n; k++) d[k] = Math.round(Math.min(1, Math.max(0, snowy(k))) * 255);
  map.needsUpdate = true;
  SNOW_SIZE.value = n;
}

/**
 * Neige posée sur le dessus des choses : toits, rebords, branches des sapins, rochers, chariots… Chaque facette (normale du
 * monde, tirée de la position) blanchit d'autant plus qu'elle regarde le ciel, avec un bord irrégulier, et selon ce que
 * retient le biome ; `k` règle la quantité. Les faces verticales (murs, fenêtres, troncs) restent nettes
 */
export function addSnow(mat: THREE.Material, k = 1, lo = 0.16, hi = 0.5) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uSnowCover: SNOW, uSnowMap: SNOW_MAP, uSnowSize: SNOW_SIZE });
    sh.vertexShader = 'varying vec3 vSnowW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vSnowW = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;');
    sh.fragmentShader = 'uniform float uSnowCover;\nuniform sampler2D uSnowMap;\nuniform float uSnowSize;\nvarying vec3 vSnowW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (uSnowCover > 0.01) {
    vec3 snN = normalize(cross(dFdx(vSnowW), dFdy(vSnowW)));
    // bord de la neige un peu irrégulier, sans rayer les longs pans de toit ; un toit à 45° est tout blanc
    float snEdge = sin(vSnowW.x * 4.0 + sin(vSnowW.z * 3.0)) * sin(vSnowW.z * 3.5 + vSnowW.x * 1.3) * 0.06;
    float snHere = texture2D(uSnowMap, vSnowW.xz / uSnowSize).r;
    // une fine couche douce : elle couvre aussi les toits pentus (pas de pan à moitié gris), un peu bleutée sur les pentes,
    // plus claire sur le plat ; à peine moins couvrante qu'un drap, pour garder un soupçon du toit dessous
    float snCap = clamp(uSnowCover * snHere * ${k.toFixed(2)}, 0.0, 1.0) * smoothstep(${lo.toFixed(2)}, ${hi.toFixed(2)}, snN.y + snEdge) * 0.94;
    vec3 snCol = mix(vec3(0.84, 0.89, 0.96), vec3(0.95, 0.97, 1.0), smoothstep(0.35, 0.95, snN.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, snCol, snCap);
  }`);
  };
  mat.customProgramCacheKey = () => `${key}|snow${k}|${lo}|${hi}`;
}
