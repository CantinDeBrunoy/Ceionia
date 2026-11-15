import * as THREE from 'three';

/** Neige du moment sur le village (0 … 1), partagée par tous les matériaux qui la reçoivent ; 0 sous terre */
export const SNOW = { value: 0 };
/** Direction de la lumière principale (soleil, ou lune la nuit), vers elle : nuance des facettes enneigées (`env.ts`) */
export const SNOW_SUN = { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() };
/** Carte de la neige et du froid par case (voir `snowMapData`), et taille de la carte */
const SNOW_MAP = { value: null as THREE.Texture | null };
const SNOW_SIZE = { value: 1 };
/** Carte de la neige (r) et du froid (g) par case, pour les shaders qui en ont besoin (glace de la mer, des lacs, des torrents) */
export const SNOW_U = { uSnowMap: SNOW_MAP, uSnowSize: SNOW_SIZE };
let map: THREE.DataTexture | null = null;

/** Rayon (cases) du froid rogné autour des cases chaudes : un fond de vallée de moins de 2 × ICE_ERODE cases au milieu du désert ne gèle pas */
export const ICE_ERODE = 4;
/** Rayon (cases) du flou des deux cartes : des bords doux au lieu de marches au pas de la grille */
export const SNOW_BLUR = 2;

/** Moyenne (`min` = false) ou minimum glissant sur 2r + 1 cases, ligne puis colonne ; aux bords, sur les cases présentes */
function slide(src: Float32Array, n: number, r: number, min: boolean) {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (const [a, b, sx, sz] of [[src, tmp, 1, 0], [tmp, out, 0, 1]] as [Float32Array, Float32Array, number, number][])
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        let acc = min ? 1 : 0, c = 0;
        for (let d = -r; d <= r; d++) {
          const xx = x + d * sx, zz = z + d * sz;
          if (xx < 0 || zz < 0 || xx >= n || zz >= n) continue;
          const v = a[zz * n + xx];
          if (min) acc = Math.min(acc, v); else acc += v;
          c++;
        }
        b[z * n + x] = min ? acc : acc / c;
      }
  return out;
}

/**
 * Deux octets par case : r = neige que retient la case (0 … 1, d'après son biome), adoucie ; g = froid qui laisse l'eau geler :
 * le minimum sur `ICE_ERODE` cases alentour, adouci. Le désert et les tropiques retiennent à peine la neige : pas de glace à
 * moins de quatre cases d'eux, même au fond vert d'un canyon du désert
 */
export function snowMapData(n: number, snowy: (k: number) => number) {
  const s = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) s[k] = Math.min(1, Math.max(0, snowy(k)));
  const snow = slide(s, n, SNOW_BLUR, false), cold = slide(slide(s, n, ICE_ERODE, true), n, SNOW_BLUR, false);
  const d = new Uint8Array(n * n * 2);
  for (let k = 0; k < n * n; k++) { d[k * 2] = Math.round(snow[k] * 255); d[k * 2 + 1] = Math.round(cold[k] * 255); }
  return d;
}

/** Neige et froid de chaque case, d'après son biome : à refaire quand la carte change */
export function setSnowMap(n: number, snowy: (k: number) => number) {
  if (!map || map.image.width !== n) {
    map?.dispose();
    map = new THREE.DataTexture(new Uint8Array(n * n * 2), n, n, THREE.RGFormat);
    map.magFilter = map.minFilter = THREE.LinearFilter;
    SNOW_MAP.value = map;
  }
  (map.image.data as Uint8Array).set(snowMapData(n, snowy));
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
    Object.assign(sh.uniforms, { uSnowCover: SNOW, uSnowMap: SNOW_MAP, uSnowSize: SNOW_SIZE, uSnowSun: SNOW_SUN });
    sh.vertexShader = 'varying vec3 vSnowW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vSnowW = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;');
    sh.fragmentShader = 'uniform float uSnowCover;\nuniform vec3 uSnowSun;\nuniform sampler2D uSnowMap;\nuniform float uSnowSize;\nvarying vec3 vSnowW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (uSnowCover > 0.01) {
    vec3 snN = normalize(cross(dFdx(vSnowW), dFdy(vSnowW)));
    // bord de la neige un peu irrégulier, sans rayer les longs pans de toit ; un toit à 45° est tout blanc
    float snEdge = sin(vSnowW.x * 4.0 + sin(vSnowW.z * 3.0)) * sin(vSnowW.z * 3.5 + vSnowW.x * 1.3) * 0.06;
    float snHere = texture2D(uSnowMap, vSnowW.xz / uSnowSize).r;
    // une fine couche douce : elle couvre aussi les toits pentus (pas de pan à moitié gris), un peu bleutée sur les pentes,
    // plus claire sur le plat ; à peine moins couvrante qu'un drap, pour garder un soupçon du toit dessous
    float snCap = clamp(uSnowCover * snHere * ${k.toFixed(2)}, 0.0, 1.0) * smoothstep(${lo.toFixed(2)}, ${hi.toFixed(2)}, snN.y + snEdge) * 0.94;
    vec3 snCol = mix(vec3(0.84, 0.89, 0.96), vec3(0.95, 0.97, 1.0), smoothstep(0.35, 0.95, snN.y));
    // facette au soleil un peu crème, à contre-jour bleutée
    snCol *= mix(vec3(0.86, 0.91, 1.03), vec3(1.03, 1.0, 0.95), smoothstep(-0.2, 0.65, dot(snN, uSnowSun)));
    diffuseColor.rgb = mix(diffuseColor.rgb, snCol, snCap);
  }`);
  };
  mat.customProgramCacheKey = () => `${key}|snow${k}|${lo}|${hi}`;
}
