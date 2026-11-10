import * as THREE from 'three';
import { LivePalette } from './season';

/** Hachage et bruit doux (valeurs 0 … 1), pour les tirages par place */
export const NOISE_GLSL = /* glsl */ `
float sznHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sznNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sznHash(i), sznHash(i + vec2(1.0, 0.0)), f.x), mix(sznHash(i + vec2(0.0, 1.0)), sznHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/**
 * Teinte de saison tirée d'une palette (seasonConfig.ts) pour chaque instance, d'après sa place : un bruit doux à l'échelle de
 * quelques cases rapproche les voisins (bosquets, groupes de couleurs), un hachage par arbre évite les aplats. La teinte
 * remplace la couleur du matériau (laissée blanche) : les couleurs de sommet (ombre et lumière du modèle) et celle de
 * l'instance (éclat, teinte du biome) s'y multiplient. Les teintes et les parts sont lues à chaque image (interpolées sur
 * place pendant les transitions) : changer de saison ne reconstruit rien. Les bords entre deux teintes sont fondus, pour
 * qu'aucun arbre ne change d'un coup quand les parts bougent
 *
 * @param cluster 0 : chaque arbre au hasard … 1 : par grandes plaques
 * @returns de quoi brancher la palette de l'état de saison (`set(s.trees.leafy)`), lue ensuite sur place
 */
export function addPalette(mat: THREE.Material, cluster = 0.6): PaletteHandle {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  const white = () => new THREE.Color(1, 1, 1);
  const uniforms = { uSznPal: { value: [white(), white(), white(), white()] }, uSznShare: { value: [1, 0, 0, 0] } };
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = `uniform vec3 uSznPal[4];\nuniform float uSznShare[4];\n${NOISE_GLSL}` + sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  {
#ifdef USE_INSTANCING
    vec2 szP = instanceMatrix[3].xz;
#else
    vec2 szP = modelMatrix[3].xz;
#endif
    float szK = mix(sznHash(floor(szP * 4.0) + 0.37), sznNoise(szP * 0.17 + 11.0), ${cluster.toFixed(2)});
    // le mélange resserre les valeurs vers le milieu : on les étire pour garder des parts proches de celles demandées
    szK = clamp((szK - 0.5) * ${(1 + cluster * 0.9).toFixed(2)} + 0.5, 0.0, 1.0);
    float sz1 = uSznShare[0], sz2 = sz1 + uSznShare[1], sz3 = sz2 + uSznShare[2];
    vec3 szC = uSznPal[0];
    szC = mix(szC, uSznPal[1], smoothstep(sz1 - 0.035, sz1 + 0.035, szK));
    szC = mix(szC, uSznPal[2], smoothstep(sz2 - 0.035, sz2 + 0.035, szK));
    szC = mix(szC, uSznPal[3], smoothstep(sz3 - 0.035, sz3 + 0.035, szK));
    vColor.rgb *= szC;
  }`);
  };
  mat.customProgramCacheKey = () => `${key}|szpal${cluster}`;
  (mat as THREE.MeshStandardMaterial).color?.setRGB(1, 1, 1);
  return { set: (p) => { uniforms.uSznPal.value = p.colors; uniforms.uSznShare.value = p.share; } };
}

export interface PaletteHandle { set(p: LivePalette): void }

/** Teinte tirée d'une palette (parts cumulées), pour les décors teintés à la construction (fleurs, tas de feuilles) */
export function pickPalette(p: LivePalette, h: number) {
  let acc = 0;
  for (let i = 0; i < 3; i++) { acc += p.share[i]; if (h < acc) return p.colors[i]; }
  return p.colors[3];
}

/** Mousse ou feuilles sur le dessus des rochers : teinte et force du moment (seasonConfig.ts, `ground.moss`) */
export const COVER = { color: { value: new THREE.Color() }, k: { value: 0 } };

/**
 * Couverture de saison sur le dessus des choses (rochers) : mousse au printemps et l'été, plus épaisse près de l'eau, feuilles
 * mortes en plaques l'automne. À poser avant `addSnow`, qui la recouvre de neige l'hiver
 */
export function addCover(mat: THREE.Material, sea: number) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uCoverCol: COVER.color, uCoverK: COVER.k });
    sh.vertexShader = 'varying vec3 vCovW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vCovW = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;');
    sh.fragmentShader = `uniform vec3 uCoverCol;\nuniform float uCoverK;\nvarying vec3 vCovW;\n` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (uCoverK > 0.01) {
    vec3 cvN = normalize(cross(dFdx(vCovW), dFdy(vCovW)));
    float cvP = sin(vCovW.x * 9.0 + sin(vCovW.z * 7.0) * 1.3) * sin(vCovW.z * 8.0 - vCovW.x * 2.1);
    // plus épaisse au bord de l'eau, rare en altitude
    float cvWet = 1.0 - smoothstep(${(sea + 0.2).toFixed(2)}, ${(sea + 1.8).toFixed(2)}, vCovW.y);
    float cvK = uCoverK * (0.55 + 0.7 * cvWet) * smoothstep(0.15, 0.6, cvN.y + cvP * 0.28);
    diffuseColor.rgb = mix(diffuseColor.rgb, uCoverCol, clamp(cvK, 0.0, 0.85));
  }`);
  };
  mat.customProgramCacheKey = () => `${key}|cover`;
}
