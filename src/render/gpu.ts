/**
 * Machine modeste ? D'après le nom de la carte graphique (WEBGL_debug_renderer_info) et le nombre de cœurs : les puces
 * graphiques intégrées (Intel UHD/Iris, Radeon Vega des portables, Mali/Adreno des tablettes, rendu logiciel) ne tiennent
 * ni l'anticrénelage multi-échantillons ni une image plus fine que l'écran sur un grand village. Logique pure (testable)
 */
export function weakGpu(renderer: string, cores = 8): boolean {
  const r = renderer.toLowerCase();
  // une vraie carte dédiée (GeForce, Radeon RX, Arc…) : non, quel que soit le reste
  if (/geforce|rtx|gtx|radeon rx|radeon pro|arc a|quadro|apple m\d/.test(r)) return false;
  if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|swiftshader|llvmpipe|software|vega \d|radeon\(tm\) graphics|radeon graphics|apple gpu/.test(r)) return true;
  // inconnue : on se fie au processeur (deux cœurs ou moins : un petit portable)
  return cores <= 2;
}

/** Nom de la carte graphique vue par WebGL (chaîne vide si l'on ne peut pas la lire) */
export function probeRenderer(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return '';
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch { return ''; }
}
