import * as THREE from 'three';
import { Compiling, stillCompiling } from './warmup';

/**
 * PrÃ©paration des shaders : on les compile d'avance (derriÃ¨re l'Ã©cran de chargement, ou l'aprÃ¨s-midi pour la nuit), pour
 * qu'aucun ne se compile au premier affichage d'un objet : chaque programme compilÃ© Ã  ce moment fige l'image (de 20 Ã  100 ms
 * chacun ; plusieurs secondes quand ils viennent tous ensemble, Ã  la premiÃ¨re image ou au premier halo du soir)
 */

type Drawn = THREE.Mesh & {
  isPoints?: boolean; isLine?: boolean; isSprite?: boolean; isBatchedMesh?: boolean; isInstancedMesh?: boolean; isSkinnedMesh?: boolean;
  instanceColor?: unknown; morphTexture?: unknown;
};

/** Ce qui, dans un objet, change le shader d'un mÃªme matÃ©riau (voir `getParameters` de WebGLPrograms, dans three) */
function variant(o: Drawn): string {
  const g = o.geometry as THREE.BufferGeometry | undefined, a = g?.attributes ?? {}, mo = g?.morphAttributes ?? {};
  return [o.isInstancedMesh, o.isInstancedMesh && o.instanceColor, o.morphTexture, o.isBatchedMesh, o.isSkinnedMesh, o.isPoints,
    a.normal, a.tangent, a.uv, mo.position, mo.normal, mo.color].map((x) => (x ? 1 : 0)).join('') + ((a.color as THREE.BufferAttribute | undefined)?.itemSize ?? 0);
}

/**
 * Un reprÃ©sentant par matÃ©riau et par variante, dans tout ce que contient la scÃ¨ne, mÃªme cachÃ© (halos, lucioles, luneâ€¦).
 * `renderer.compile` ne prend qu'un objet par matÃ©riau : un matÃ©riau partagÃ© entre une bÃªte articulÃ©e et sa silhouette
 * lointaine (maillage instanciÃ©), ou entre gÃ©omÃ©tries diffÃ©rentes, n'y gagnait qu'une variante
 */
export function representatives(root: THREE.Object3D): THREE.Object3D[] {
  const seen = new Map<THREE.Material, Set<string>>(), out: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const o = obj as Drawn;
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    const v = variant(o);
    let fresh = false;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      let s = seen.get(m);
      if (!s) seen.set(m, (s = new Set()));
      if (!s.has(v)) { s.add(v); fresh = true; }
    }
    if (fresh) out.push(obj);
  });
  return out;
}

/** Une sÃ©rie d'objets Ã  compiler pour une cible de rendu (null : l'Ã©cran ; l'image du halo : la nuit) */
export interface CompileJob {
  objects: THREE.Object3D[];
  /** leur scÃ¨ne : ses lumiÃ¨res et son brouillard entrent dans les shaders */
  scene: THREE.Scene;
  target: THREE.WebGLRenderTarget | null;
  /** l'Ã©tape de l'Ã©cran de chargement pendant ce travail */
  label: string;
}

/** Lance la compilation des shaders d'un objet, et de lui seul (un faux groupe qui ne parcourt que lui), pour la cible en cours */
function compileOne(renderer: THREE.WebGLRenderer, o: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene) {
  const visit = (f: (x: THREE.Object3D) => void) => f(o);
  renderer.compile({ traverse: visit, traverseVisible: visit } as unknown as THREE.Object3D, camera, scene);
}

/** Programmes (shaders) que le moteur crÃ©e pendant `fn` : leur compilation est lancÃ©e, pas forcÃ©ment finie */
export function launched(renderer: THREE.WebGLRenderer, fn: () => void): Compiling[] {
  const before = new Set(renderer.info.programs ?? []);
  fn();
  return (renderer.info.programs ?? []).filter((p) => !before.has(p)) as unknown as Compiling[];
}

/** Lance tout de suite la compilation des travaux, sans attendre qu'elle finisse (l'aprÃ¨s-midi, pour la nuit) */
export function compileNow(renderer: THREE.WebGLRenderer, camera: THREE.Camera, jobs: CompileJob[]) {
  const prev = renderer.getRenderTarget();
  for (const j of jobs) {
    renderer.setRenderTarget(j.target);
    for (const o of j.objects) compileOne(renderer, o, camera, j.scene);
  }
  renderer.setRenderTarget(prev);
}

/** Programmes lancÃ©s avant d'attendre qu'ils soient prÃªts : assez pour que la barre avance souvent, pas trop pour garder le parallÃ©lisme */
const BATCH = 32;

/**
 * Compile les travaux objet par objet ; tous les quelques programmes lancÃ©s, attend qu'ils soient prÃªts et rend la main au
 * navigateur : l'Ã©cran de chargement avance (`progress` : la part faite, de 0 Ã  1, et l'Ã©tape). LÃ  oÃ¹ le navigateur compile
 * vraiment en parallÃ¨le (KHR_parallel_shader_compile), l'attente ne bloque pas ; ailleurs, elle bloque le temps d'un paquet
 */
export async function compilePaced(renderer: THREE.WebGLRenderer, camera: THREE.Camera, jobs: CompileJob[], progress: (k: number, label: string) => void) {
  const total = Math.max(1, jobs.reduce((n, j) => n + j.objects.length, 0)), gl = renderer.getContext();
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  const pending: Compiling[] = [];
  const settle = async () => {
    // sans compilation en parallÃ¨le, Â« prÃªt Â» est toujours vrai : on attend la fin de l'Ã©dition des liens, paquet par paquet
    if (!parallel) for (const p of pending) gl.getProgramParameter((p as unknown as { program: WebGLProgram }).program, gl.LINK_STATUS);
    while (stillCompiling(pending) > 0) await new Promise((r) => setTimeout(r, 4));
  };
  let done = 0;
  for (const j of jobs) {
    progress(done / total, j.label);
    for (const o of j.objects) {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(j.target);
      pending.push(...launched(renderer, () => compileOne(renderer, o, camera, j.scene)));
      renderer.setRenderTarget(prev);
      done++;
      if (pending.length >= BATCH) {
        await settle();
        progress(done / total, j.label);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  await settle();
  progress(1, jobs.length ? jobs[jobs.length - 1].label : '');
}

/**
 * Une image de toute la scène, rendue sous l'écran de chargement : chaque programme sert une première fois, et maillages et
 * textures partent au GPU, même pour ce qui est hors champ ou caché au chargement.
 * - `renderer.compile` lance la compilation, mais sous Direct3D (ANGLE) le shader n'est fini qu'à son premier usage
 *   (`onFirstUse` attend `getProgramInfoLog`) : 100 à 300 ms figées au moment où l'objet paraît. Mesuré : les bêtes
 *   (`AtlasMaterial`, moutons articulés), hors champ au chargement, figeaient la première rotation de la vue.
 * - three n'envoie la géométrie et les textures d'un objet qu'à son premier affichage.
 * On montre donc tout (`frustumCulled` levé) et l'on rend visibles, le temps de l'image, les représentants cachés
 * (`objects`, voir `representatives`) et leurs parents, puis chaque rendu de `draws` passe (l'écran, l'image du halo de
 * nuit) ; tout est remis en l'état ensuite. Rend le nombre d'objets touchés
 */
export function firstUseAll(scene: THREE.Scene, objects: THREE.Object3D[], draws: (() => void)[]): number {
  const culled: THREE.Object3D[] = [], shown: THREE.Object3D[] = [];
  for (const o of objects) for (let x: THREE.Object3D | null = o; x && x !== scene; x = x.parent) if (!x.visible) { x.visible = true; shown.push(x); }
  scene.traverseVisible((o) => { if (o.frustumCulled && (o as THREE.Mesh).geometry) { o.frustumCulled = false; culled.push(o); } });
  try { for (const d of draws) d(); }
  finally {
    for (const o of culled) o.frustumCulled = true;
    for (const o of shown) o.visible = false;
  }
  return culled.length + shown.length;
}
